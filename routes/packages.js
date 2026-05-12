const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const statuses = ['received','awaiting_loic','discrepancy','ready','contacted','awaiting_confirmation','confirmed','delivered','picked_up','closed'];
    const stats = {};
    statuses.forEach(s => {
      stats[s] = db.prepare('SELECT COUNT(*) as c FROM packages WHERE status = ?').get(s).c;
    });
    stats.delivered += stats.ready;
    stats.awaiting_confirmation += stats.contacted;
    stats.total = db.prepare('SELECT COUNT(*) as c FROM packages').get().c;
    stats.today = db.prepare("SELECT COUNT(*) as c FROM packages WHERE date_received = date('now','localtime')").get().c;
    stats.pending_email = db.prepare("SELECT COUNT(*) as c FROM packages WHERE loic_email_status='not_sent' AND status IN ('delivered','ready','picked_up','discrepancy','awaiting_loic','confirmed','closed')").get().c;
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { status, date, search } = req.query;
    let query = 'SELECT p.*, (SELECT COUNT(*) FROM package_files pf WHERE pf.package_id = p.id) as file_count FROM packages p';
    const params = [];
    const conds = [];
    if (status && status !== 'all') {
      if (status === 'awaiting_confirmation') {
        conds.push('(p.status = ? OR p.status = ?)');
        params.push('awaiting_confirmation', 'contacted');
      } else if (status === 'delivered') {
        conds.push('(p.status = ? OR p.status = ?)');
        params.push('delivered', 'ready');
      } else {
        conds.push('p.status = ?');
        params.push(status);
      }
    }
    if (date) { conds.push('p.date_received = ?'); params.push(date); }
    if (search) {
      conds.push('(p.recipient_name LIKE ? OR p.vendor LIKE ? OR p.tracking_number LIKE ? OR p.po_number LIKE ? OR p.department LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }
    if (conds.length) query += ' WHERE ' + conds.join(' AND ');
    query += ' ORDER BY p.date_received DESC, p.created_at DESC';
    res.json(db.prepare(query).all(...params));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
    if (!pkg) return res.status(404).json({ error: 'Not found' });
    const files = db.prepare('SELECT * FROM package_files WHERE package_id = ? ORDER BY file_type, uploaded_at').all(req.params.id);
    res.json({ ...pkg, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const b = req.body;
    const result = db.prepare(`
      INSERT INTO packages (date_received,carrier,tracking_number,vendor,recipient_name,department,po_number,
        has_packing_slip,items_match,discrepancy_notes,package_type,requires_loic_input,status,notes,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))
    `).run(
      b.date_received || new Date().toISOString().slice(0,10),
      b.carrier||null, b.tracking_number||null, b.vendor||null,
      b.recipient_name||null, b.department||null, b.po_number||null,
      b.has_packing_slip != null ? (b.has_packing_slip ? 1 : 0) : 1,
      b.items_match != null && b.items_match !== '' ? (b.items_match ? 1 : 0) : null,
      b.discrepancy_notes||null, b.package_type||'standard',
      b.requires_loic_input ? 1 : 0,
      b.status||'received', b.notes||null
    );
    res.json(db.prepare('SELECT * FROM packages WHERE id = ?').get(result.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    if (!db.prepare('SELECT id FROM packages WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['date_received','carrier','tracking_number','vendor','recipient_name','department','po_number',
      'has_packing_slip','items_match','discrepancy_notes','package_type','requires_loic_input','status',
      'delivery_method','delivered_to_room','pickup_person_name','pickup_person_department',
      'confirmation_method','confirmed_by','confirmation_date','confirmation_notes',
      'notes','loic_email_status','loic_email_sent_date'];
    const updates = { updated_at: new Date().toISOString() };
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE packages SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id);
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
    const files = db.prepare('SELECT * FROM package_files WHERE package_id = ? ORDER BY file_type, uploaded_at').all(req.params.id);
    res.json({ ...pkg, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const path = require('path');
    const fs = require('fs');
    db.prepare('SELECT * FROM package_files WHERE package_id = ?').all(req.params.id).forEach(f => {
      const fp = path.join(__dirname, '..', 'uploads', f.file_name);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
