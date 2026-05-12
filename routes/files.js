const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');

let Tesseract = null;
try {
  Tesseract = require('tesseract.js');
} catch (err) {
  // Optional dependency: browser-side OCR fallback is used when this is missing.
}

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpe?g|png|gif|pdf|heic|heif|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only images and PDFs allowed'));
  }
});

const extractUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpe?g|png|gif|heic|heif|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only image files are supported for AI extraction'));
  }
});

function normalizeText(value) {
  return (value || '')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function extractCarrier(text) {
  const t = text.toLowerCase();
  if (t.includes('fedex')) return 'FedEx';
  if (t.includes('ups')) return 'UPS';
  if (t.includes('purolator')) return 'Purolator';
  if (t.includes('canada post') || t.includes('postes canada')) return 'Canada Post';
  if (t.includes('dhl')) return 'DHL';
  if (t.includes('amazon')) return 'Amazon';
  return null;
}

function extractTrackingNumber(text) {
  const compact = text.toUpperCase();
  const ups = compact.match(/\b1Z[0-9A-Z]{16}\b/);
  if (ups) return ups[0];

  const cp = compact.match(/\b[A-Z]{2}\d{9}[A-Z]{2}\b/);
  if (cp) return cp[0];

  const fedexStyle = compact.match(/\b\d{12,22}\b/g) || [];
  if (fedexStyle.length) {
    return fedexStyle.sort((a, b) => b.length - a.length)[0];
  }

  const trackingLabel = compact.match(/(?:TRACKING|TRK|WAYBILL)\s*(?:NO|NUMBER|#)?\s*[:\-]?\s*([A-Z0-9\- ]{8,30})/i);
  if (trackingLabel && trackingLabel[1]) {
    return trackingLabel[1].replace(/\s+/g, '').trim();
  }

  const generic = compact.match(/\b[A-Z0-9]{8,26}\b/g) || [];
  const likely = generic.find(token => /\d/.test(token) && /[A-Z]/.test(token));
  return likely || null;
}

function extractPoNumber(text) {
  const normalized = text.replace(/\r/g, '');
  const patterns = [
    /\bP\.?\s*O\.?\s*(?:NUMBER|#|NO\.?|NUM)?\s*[:\-]?\s*([A-Z0-9\-]{4,})\b/i,
    /\bPURCHASE\s+ORDER\s*(?:NUMBER|#|NO\.?|NUM)?\s*[:\-]?\s*([A-Z0-9\-]{4,})\b/i,
  ];
  for (const p of patterns) {
    const m = normalized.match(p);
    if (m && m[1]) return m[1].toUpperCase();
  }
  return null;
}

function extractLabeledLine(lines, labels) {
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    for (const label of labels) {
      const regex = new RegExp(`(?:^|\\b)${label}\\b\\s*[:\\-]?\\s*(.+)$`, 'i');
      const m = line.match(regex);
      if (m && m[1]) {
        const cleaned = normalizeText(m[1]);
        if (cleaned.length >= 2) return cleaned;
      }
    }
  }
  return null;
}

function likelyPersonOrGroup(line) {
  if (!line) return false;
  if (/\d/.test(line)) return false;
  if (/^(street|st\.?|suite|room|postal|code|canada|ontario|qc|bc|ab)$/i.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 7;
}

function fallbackRecipient(lines) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\b(ship\s*to|attn|attention|recipient|deliver\s*to)\b/i.test(line)) {
      const same = line.replace(/.*\b(ship\s*to|attn|attention|recipient|deliver\s*to)\b\s*[:\-]?\s*/i, '').trim();
      if (likelyPersonOrGroup(same)) return same;
      const next = (lines[i + 1] || '').trim();
      if (likelyPersonOrGroup(next)) return next;
    }
  }
  return null;
}

function fallbackVendor(lines) {
  for (const line of lines.slice(0, 10)) {
    if (/\b(inc|ltd|llc|corp|corporation|scientific|laboratories|labs|university|college)\b/i.test(line)) {
      return line;
    }
  }
  return null;
}

function fallbackDepartment(lines) {
  const departmentMatch = lines.join('\n').match(/\b(?:department|dept)\s*[:\-]?\s*([A-Z][A-Za-z0-9 &\/-]{2,})/i);
  if (departmentMatch && departmentMatch[1]) return departmentMatch[1].trim();
  return null;
}

function extractPackageFields(text) {
  const lines = text
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const recipient = extractLabeledLine(lines, ['ship\\s*to', 'to', 'attn', 'attention', 'recipient']);
  const vendor = extractLabeledLine(lines, ['from', 'ship\\s*from', 'sender', 'vendor']);
  const department = extractLabeledLine(lines, ['department', 'dept']);

  return {
    carrier: extractCarrier(text),
    tracking_number: extractTrackingNumber(text),
    po_number: extractPoNumber(text),
    recipient_name: recipient || fallbackRecipient(lines),
    vendor: vendor || fallbackVendor(lines),
    department: department || fallbackDepartment(lines),
  };
}

router.post('/extract-package-info', extractUpload.array('files', 10), async (req, res) => {
  try {
    if (!Tesseract) {
      return res.status(503).json({ error: 'Server OCR is unavailable on this installation' });
    }
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'At least one image is required' });

    const allText = [];
    for (const file of req.files) {
      const result = await Tesseract.recognize(file.buffer, 'eng');
      const text = normalizeText(result?.data?.text || '');
      if (text) allText.push(text);
    }

    const mergedText = allText.join('\n');
    const fields = extractPackageFields(mergedText);

    res.json({
      fields,
      meta: {
        processed_files: req.files.length,
        text_found: Boolean(mergedText),
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'AI extraction failed' });
  }
});

router.post('/package/:packageId', upload.array('files', 20), (req, res) => {
  try {
    const db = getDb();
    if (!db.prepare('SELECT id FROM packages WHERE id = ?').get(req.params.packageId))
      return res.status(404).json({ error: 'Package not found' });
    const fileType = req.body.file_type || 'sticker';
    const inserted = req.files.map(file => {
      const r = db.prepare('INSERT INTO package_files (package_id,file_type,file_name,original_name) VALUES (?,?,?,?)')
        .run(req.params.packageId, fileType, file.filename, file.originalname);
      return { id: r.lastInsertRowid, file_type: fileType, file_name: file.filename, original_name: file.originalname };
    });
    res.json(inserted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/nonpo/:itemId', upload.array('files', 20), (req, res) => {
  try {
    const db = getDb();
    if (!db.prepare('SELECT id FROM non_po_items WHERE id = ?').get(req.params.itemId))
      return res.status(404).json({ error: 'Item not found' });
    const inserted = req.files.map(file => {
      const r = db.prepare('INSERT INTO non_po_files (item_id,file_name,original_name) VALUES (?,?,?)')
        .run(req.params.itemId, file.filename, file.originalname);
      return { id: r.lastInsertRowid, file_name: file.filename, original_name: file.originalname };
    });
    res.json(inserted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:fileId', (req, res) => {
  try {
    const db = getDb();
    const file = db.prepare('SELECT * FROM package_files WHERE id = ?').get(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const fp = path.join(__dirname, '..', 'uploads', file.file_name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    db.prepare('DELETE FROM package_files WHERE id = ?').run(req.params.fileId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/nonpo/:fileId', (req, res) => {
  try {
    const db = getDb();
    const file = db.prepare('SELECT * FROM non_po_files WHERE id = ?').get(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    const fp = path.join(__dirname, '..', 'uploads', file.file_name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    db.prepare('DELETE FROM non_po_files WHERE id = ?').run(req.params.fileId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Multer errors (bad file type, size limit) should be 400, not 500
router.use((err, req, res, next) => {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT' || err.message === 'Only images and PDFs allowed' || err.message === 'Only image files are supported for AI extraction')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
