const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');

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
  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT' || err.message === 'Only images and PDFs allowed')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
