const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const items = db.prepare(`
      SELECT n.*, (SELECT COUNT(*) FROM non_po_files nf WHERE nf.item_id = n.id) as file_count
      FROM non_po_items n ORDER BY n.date_received DESC, n.created_at DESC
    `).all();
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const item = db.prepare('SELECT * FROM non_po_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const files = db.prepare('SELECT * FROM non_po_files WHERE item_id = ? ORDER BY uploaded_at').all(req.params.id);
    res.json({ ...item, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { date_received, recipient, description, notes } = req.body;
    const r = db.prepare('INSERT INTO non_po_items (date_received,recipient,description,notes) VALUES (?,?,?,?)')
      .run(date_received || new Date().toISOString().slice(0,10), recipient||null, description||null, notes||null);
    res.json(db.prepare('SELECT * FROM non_po_items WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { date_received, recipient, description, notes } = req.body;
    db.prepare('UPDATE non_po_items SET date_received=?,recipient=?,description=?,notes=? WHERE id=?')
      .run(date_received, recipient||null, description||null, notes||null, req.params.id);
    const item = db.prepare('SELECT * FROM non_po_items WHERE id = ?').get(req.params.id);
    const files = db.prepare('SELECT * FROM non_po_files WHERE item_id = ?').all(req.params.id);
    res.json({ ...item, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('SELECT * FROM non_po_files WHERE item_id = ?').all(req.params.id).forEach(f => {
      const fp = path.join(__dirname, '..', 'uploads', f.file_name);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    db.prepare('DELETE FROM non_po_items WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
