const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db-unified');

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const items = await db.prepare(`
      SELECT n.*, (SELECT COUNT(*) FROM non_po_files nf WHERE nf.item_id = n.id) as file_count
      FROM non_po_items n ORDER BY n.date_received DESC, n.created_at DESC
    `).all();
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const item = await db.prepare('SELECT * FROM non_po_items WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    const files = await db.prepare('SELECT * FROM non_po_files WHERE item_id = ? ORDER BY uploaded_at').all(req.params.id);
    res.json({ ...item, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { date_received, recipient, description, notes } = req.body;
    const r = await db.prepare('INSERT INTO non_po_items (date_received,recipient,description,notes) VALUES (?,?,?,?)')
      .run(date_received || new Date().toISOString().slice(0,10), recipient||null, description||null, notes||null);
    res.json(await db.prepare('SELECT * FROM non_po_items WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { date_received, recipient, description, notes } = req.body;
    await db.prepare('UPDATE non_po_items SET date_received=?,recipient=?,description=?,notes=? WHERE id=?')
      .run(date_received, recipient||null, description||null, notes||null, req.params.id);
    const item = await db.prepare('SELECT * FROM non_po_items WHERE id = ?').get(req.params.id);
    const files = await db.prepare('SELECT * FROM non_po_files WHERE item_id = ?').all(req.params.id);
    res.json({ ...item, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const files = await db.prepare('SELECT * FROM non_po_files WHERE item_id = ?').all(req.params.id);
    files.forEach(f => {
      const fp = path.join(__dirname, '..', 'uploads', f.file_name);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    await db.prepare('DELETE FROM non_po_items WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
