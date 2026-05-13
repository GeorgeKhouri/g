const express = require('express');
const router = express.Router();
const { getDb } = require('../db-unified');
const { isRemoteStoredName, readStoredFile } = require('../storage');
const SENDER_NAME = process.env.SENDER_NAME || 'George Khouri';

function fmtDate(d) {
  if (!d) return 'N/A';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function generatePackageSubject(packages) {
  // Sort by ID to get the order
  const ids = packages.map(p => p.id).sort((a, b) => a - b);
  
  if (ids.length === 1) {
    return `Packages Update - ${ids[0]}`;
  }
  
  // Check if IDs form a continuous range
  let isContinuous = true;
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] !== ids[i - 1] + 1) {
      isContinuous = false;
      break;
    }
  }
  
  if (isContinuous) {
    return `Packages Update - ${ids[0]} - ${ids[ids.length - 1]}`;
  } else {
    return `Packages Update - ${ids.join(', ')}`;
  }
}

function buildEmailBody(packages) {
  // Sort packages by ID for consistent presentation
  const sorted = [...packages].sort((a, b) => a.id - b.id);
  const n = sorted.length;
  let body = `Hi Loic,\n\nPlease find below a summary of ${n} package${n !== 1 ? 's' : ''} received and processed. Packing slip${n !== 1 ? 's are' : ' is'} attached where available.\n\n`;

  sorted.forEach((pkg) => {
    body += `${'─'.repeat(52)}\n`;
    body += `PACKAGE #${String(pkg.id).padStart(3, '0')}\n`;
    body += `${'─'.repeat(52)}\n`;

    if (pkg.date_received) body += `Date Received:        ${fmtDate(pkg.date_received)}\n`;

    const recipient = [pkg.recipient_name, pkg.department].filter(Boolean).join(' – ');
    if (recipient) body += `Recipient:            ${recipient}\n`;

    if (pkg.po_number) body += `PO Number:            ${pkg.po_number}\n`;

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
      if (pkg.pickup_person_name) {
        statusLine = `Picked up by ${pkg.pickup_person_name}${pkg.pickup_person_department ? `, ${pkg.pickup_person_department}` : ''}`;
      } else {
        statusLine = 'Picked up';
      }
    } else if (pkg.status === 'delivered' || pkg.status === 'confirmed') {
      statusLine = pkg.delivered_to_room ? `Delivered to Room ${pkg.delivered_to_room}` : 'Delivered';
    }
    else if (pkg.status === 'awaiting_loic') statusLine = '⚠ Awaiting your instructions (no packing slip / no PO)';
    else if (pkg.status === 'awaiting_confirmation') statusLine = 'Awaiting item confirmation of contents';
    else if (pkg.status) statusLine = pkg.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    if (statusLine) body += `Status:               ${statusLine}\n`;
    if (pkg.package_type === 'needs_confirmation') body += `Special Note:         Requires recipient content confirmation before PO can be closed\n`;
    if (pkg.notes) body += `Notes:                ${pkg.notes}\n`;
    body += '\n';
  });

  body += `${'─'.repeat(52)}\n\nPlease let me know if you have any questions or if something isn't clear. I will be waiting for delivery instructions for these packages and/or the person to contact regarding each package.\n\nThank you,\n${SENDER_NAME}`;
  return body;
}

async function getLoicAttachmentsForPackage(db, packageId) {
  // Get both packing_slip and sticker files
  return await db.prepare('SELECT * FROM package_files WHERE package_id = ? AND file_type IN (?, ?) ORDER BY file_type DESC, uploaded_at')
    .all(packageId, 'packing_slip', 'sticker');
}

function buildAttachmentFilename(packageId, file, index) {
  const pkgNum = String(packageId).padStart(3, '0');
  const fileType = file.file_type === 'packing_slip' ? 'Packing_Slip' : 'Sticker';
  const ext = file.original_name ? file.original_name.split('.').pop() : file.file_name.split('.').pop();
  return `Package_${pkgNum}_${fileType}_${index}.${ext}`;
}

router.post('/draft', async (req, res) => {
  try {
    const db = getDb();
    const { package_ids } = req.body;
    if (!package_ids?.length) return res.status(400).json({ error: 'No packages selected' });

    const placeholders = package_ids.map(() => '?').join(',');
    const packages = await db.prepare(`SELECT * FROM packages WHERE id IN (${placeholders})`).all(...package_ids);
    if (!packages.length) return res.status(404).json({ error: 'No packages found' });

    const body = buildEmailBody(packages);
    const subject = generatePackageSubject(packages);

    const attachmentNames = [];
    for (const pkg of packages) {
      const files = await getLoicAttachmentsForPackage(db, pkg.id);
      for (let idx = 0; idx < files.length; idx += 1) {
        const f = files[idx];
        if (isRemoteStoredName(f.file_name)) {
          const labeledName = buildAttachmentFilename(pkg.id, f, idx + 1);
          attachmentNames.push(labeledName);
          continue;
        }
        try {
          await readStoredFile(f.file_name);
          const labeledName = buildAttachmentFilename(pkg.id, f, idx + 1);
          attachmentNames.push(labeledName);
        } catch (_) {
          // Skip missing local files to keep draft generation resilient.
        }
      }
    }

    res.json({ subject, body, attachment_count: attachmentNames.length, package_ids });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/send', async (req, res) => {
  try {
    const sendgridApiKey = (process.env.SENDGRID_API_KEY || '').trim();
    if (!sendgridApiKey) {
      return res.status(400).json({ error: 'SENDGRID_API_KEY not configured in environment variables.' });
    }

    const db = getDb();
    const { subject, body, package_ids, to } = req.body;
    const toEmail = (to || process.env.LOIC_EMAIL || '').trim();
    const fromEmail = (process.env.SENDGRID_FROM_EMAIL || process.env.GMAIL_USER || process.env.OUTLOOK_USER || '').trim();

    if (!toEmail) {
      return res.status(400).json({ error: 'Recipient email is missing. Set LOIC_EMAIL or provide a To address.' });
    }
    if (!fromEmail) {
      return res.status(400).json({ error: 'Sender email is missing. Set SENDGRID_FROM_EMAIL or GMAIL_USER/OUTLOOK_USER.' });
    }

    // Collect attachments
    const attachments = [];
    let totalAttachmentBytes = 0;
    const maxAttachmentBytes = 20 * 1024 * 1024;
    if (package_ids?.length) {
      const placeholders = package_ids.map(() => '?').join(',');
      const packages = await db.prepare(`SELECT * FROM packages WHERE id IN (${placeholders})`).all(...package_ids);
      for (const pkg of packages) {
        const files = await getLoicAttachmentsForPackage(db, pkg.id);
        for (let idx = 0; idx < files.length; idx += 1) {
          const f = files[idx];
          try {
            const content = await readStoredFile(f.file_name);
            const labeledName = buildAttachmentFilename(pkg.id, f, idx + 1);
            totalAttachmentBytes += content.length;
            if (totalAttachmentBytes > maxAttachmentBytes) {
              return res.status(413).json({
                error: 'Total attachment size is too large for one email. Send fewer packages/files at a time.'
              });
            }
            attachments.push({
              filename: labeledName,
              content: content.toString('base64'),
              type: 'application/octet-stream',
              disposition: 'attachment'
            });
          } catch (_) {
            // Skip unavailable files and continue sending available attachments.
          }
        }
      }
    }

    const copyToSender = String(process.env.SENDGRID_COPY_TO_SENDER || 'true').toLowerCase() === 'true';

    // Build SendGrid request
    const sendgridPayload = {
      personalizations: [{
        to: [{ email: toEmail }],
        ...(copyToSender ? { bcc: [{ email: fromEmail }] } : {})
      }],
      from: { email: fromEmail, name: SENDER_NAME },
      reply_to: { email: fromEmail },
      subject,
      content: [{ type: 'text/plain', value: body }],
      attachments
    };

    // Send via SendGrid API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sendgridPayload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const raw = await response.text();
      let errorMsg = response.statusText;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          errorMsg = parsed?.errors?.[0]?.message || raw;
        } catch (_) {
          errorMsg = raw;
        }
      }
      return res.status(502).json({ error: `SendGrid request failed (${response.status}): ${errorMsg}` });
    }

    // Mark packages as sent
    if (package_ids?.length) {
      const now = new Date().toISOString();
      for (const id of package_ids) {
        await db.prepare("UPDATE packages SET loic_email_status='sent', loic_email_sent_date=?, updated_at=? WHERE id=?")
          .run(now, now, id);
      }
    }

    res.json({ success: true });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return res.status(504).json({ error: 'SendGrid request timed out. Try sending fewer attachments at once.' });
    }
    console.error('[email/send] error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
