const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db-unified');

function fmtDate(d) {
  if (!d) return 'N/A';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function buildEmailBody(packages) {
  const n = packages.length;
  let body = `Hi Loic,\n\nPlease find below a summary of ${n} package${n !== 1 ? 's' : ''} received and processed. Packing slip${n !== 1 ? 's are' : ' is'} attached where available.\n\n`;

  packages.forEach((pkg, i) => {
    body += `${'─'.repeat(52)}\n`;
    body += `PACKAGE ${i + 1} OF ${n}\n`;
    body += `${'─'.repeat(52)}\n`;

    body += `Date Received:        ${fmtDate(pkg.date_received)}\n`;

    const recipient = [pkg.recipient_name, pkg.department].filter(Boolean).join(' – ');
    if (recipient) body += `Recipient:            ${recipient}\n`;

    if (pkg.po_number) body += `PO Number:            ${pkg.po_number}\n`;
    else body += `PO Number:            ⚠ No PO on file\n`;

    if (pkg.vendor) body += `Vendor / Sender:      ${pkg.vendor}\n`;

    const carrierTracking = [pkg.carrier, pkg.tracking_number].filter(Boolean).join(' – ');
    if (carrierTracking) body += `Carrier / Tracking:   ${carrierTracking}\n`;

    body += `Packing Slip:         ${pkg.has_packing_slip ? 'Found' : '⚠ NOT FOUND'}\n`;

    if (pkg.has_packing_slip) {
      if (pkg.items_match === 1) body += `Items Verified:       ✓ Match confirmed\n`;
      else if (pkg.items_match === 0) body += `Items Verified:       ⚠ ITEM DISCREPANCY – ${pkg.discrepancy_notes || 'See notes'}\n`;
    }

    let statusLine;
    if (pkg.delivery_method === 'picked_up' || pkg.status === 'picked_up') {
      statusLine = `Picked up by ${pkg.pickup_person_name || 'N/A'}${pkg.pickup_person_department ? `, ${pkg.pickup_person_department}` : ''}`;
    } else if (pkg.status === 'delivered') {
      statusLine = `Delivered to Room ${pkg.delivered_to_room || 'N/A'}`;
    }
    else if (pkg.status === 'awaiting_loic') statusLine = '⚠ Awaiting your instructions (no packing slip / no PO)';
    else if (pkg.status === 'awaiting_confirmation') statusLine = 'Awaiting item confirmation of contents';
    else if (pkg.status === 'confirmed') {
      const m = pkg.confirmation_method ? ` via ${pkg.confirmation_method}` : '';
      statusLine = `Contents confirmed by ${pkg.confirmed_by || 'recipient'}${m}`;
    } else statusLine = pkg.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    body += `Status:               ${statusLine}\n`;
    if (pkg.package_type === 'needs_confirmation') body += `Special Note:         Requires recipient content confirmation before PO can be closed\n`;
    if (pkg.notes) body += `Notes:                ${pkg.notes}\n`;
    body += '\n';
  });

  body += `${'─'.repeat(52)}\n\nPlease let me know if you have any questions or if any of the above require action.\n\nThank you,\nGeorge Khouri`;
  return body;
}

function getLoicAttachmentsForPackage(db, packageId, hasPackingSlip) {
  const preferredType = hasPackingSlip ? 'packing_slip' : 'sticker';
  return db.prepare('SELECT * FROM package_files WHERE package_id = ? AND file_type = ? ORDER BY uploaded_at')
    .all(packageId, preferredType);
}

router.post('/draft', (req, res) => {
  try {
    const db = getDb();
    const { package_ids } = req.body;
    if (!package_ids?.length) return res.status(400).json({ error: 'No packages selected' });

    const placeholders = package_ids.map(() => '?').join(',');
    const packages = db.prepare(`SELECT * FROM packages WHERE id IN (${placeholders})`).all(...package_ids);
    if (!packages.length) return res.status(404).json({ error: 'No packages found' });

    const body = buildEmailBody(packages);
    const subject = `Package Update – ${packages.length} Package${packages.length !== 1 ? 's' : ''}`;

    const attachmentNames = [];
    packages.forEach(pkg => {
      getLoicAttachmentsForPackage(db, pkg.id, !!pkg.has_packing_slip).forEach(f => {
        const fp = path.join(__dirname, '..', 'uploads', f.file_name);
        if (fs.existsSync(fp)) attachmentNames.push(f.original_name || f.file_name);
      });
    });

    res.json({ subject, body, attachment_count: attachmentNames.length, package_ids });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/send', async (req, res) => {
  try {
    if (!process.env.GMAIL_APP_PASSWORD) {
      return res.status(400).json({ error: 'Email password not configured. Open the .env file in C:\\Users\\khourig\\package-tracker and add your password after GMAIL_APP_PASSWORD=' });
    }

    const db = getDb();
    const { subject, body, package_ids, to } = req.body;

    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false }
    });

    const attachments = [];
    if (package_ids?.length) {
      const placeholders = package_ids.map(() => '?').join(',');
      db.prepare(`SELECT * FROM packages WHERE id IN (${placeholders})`).all(...package_ids).forEach(pkg => {
        getLoicAttachmentsForPackage(db, pkg.id, !!pkg.has_packing_slip).forEach(f => {
          const fp = path.join(__dirname, '..', 'uploads', f.file_name);
          if (fs.existsSync(fp)) attachments.push({ filename: f.original_name || f.file_name, path: fp });
        });
      });
    }

    await transporter.sendMail({
      from: `George Khouri <${process.env.GMAIL_USER}>`,
      to: to || process.env.LOIC_EMAIL,
      subject,
      text: body,
      attachments
    });

    if (package_ids?.length) {
      const now = new Date().toISOString();
      package_ids.forEach(id => {
        db.prepare("UPDATE packages SET loic_email_status='sent', loic_email_sent_date=?, updated_at=? WHERE id=?")
          .run(now, now, id);
      });
    }

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
