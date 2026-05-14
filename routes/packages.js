const express = require('express');
const router = express.Router();
const { getDb } = require('../db-unified');

function normalizePlaceholderPackage(pkg) {
  if (!pkg) return pkg;
  const isPlaceholder = String(pkg.vendor || '').trim() === 'PLACEHOLDER' || String(pkg.recipient_name || '').trim() === 'PLACEHOLDER';
  if (!isPlaceholder) return pkg;
  return {
    ...pkg,
    date_received: '',
    notes: null,
  };
}

router.get('/stats', async (req, res) => {
  try {
    const db = getDb();
    const statuses = ['received','awaiting_loic','discrepancy','ready','contacted','awaiting_confirmation','confirmed','delivered','picked_up','closed'];
    const stats = {};
    for (const s of statuses) {
      const row = s === 'awaiting_loic'
        ? await db.prepare("SELECT COUNT(*) as c FROM packages WHERE status = ? OR loic_email_status = 'sent'").get(s)
        : await db.prepare('SELECT COUNT(*) as c FROM packages WHERE status = ?').get(s);
      stats[s] = row?.c || 0;
    }
    stats.delivered += stats.ready + stats.picked_up + stats.confirmed;
    stats.awaiting_confirmation += stats.contacted;
    stats.total = (await db.prepare('SELECT COUNT(*) as c FROM packages').get())?.c || 0;
    stats.today = (await db.prepare("SELECT COUNT(*) as c FROM packages WHERE date_received = date('now','localtime')").get())?.c || 0;
    stats.pending_email = (await db.prepare("SELECT COUNT(*) as c FROM packages WHERE loic_email_status='not_sent' AND status IN ('delivered','ready','picked_up','discrepancy','awaiting_loic','closed','confirmed')").get())?.c || 0;
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { status, date, search, sortBy, order } = req.query; // Added sortBy and order query parameters
    let query = 'SELECT p.*, (SELECT COUNT(*) FROM package_files pf WHERE pf.package_id = p.id) as file_count FROM packages p';
    const params = [];
    const conds = [];
    if (status && status !== 'all') {
      if (status === 'awaiting_confirmation') {
        conds.push('(p.status = ? OR p.status = ?)');
        params.push('awaiting_confirmation', 'contacted');
      } else if (status === 'awaiting_loic') {
        conds.push('(p.status = ? OR p.loic_email_status = ?)');
        params.push('awaiting_loic', 'sent');
      } else if (status === 'delivered') {
        conds.push('(p.status = ? OR p.status = ? OR p.status = ? OR p.status = ?)');
        params.push('delivered', 'ready', 'picked_up', 'confirmed');
      } else {
        conds.push('p.status = ?');
        params.push(status);
      }
    }
    if (date) { conds.push('p.date_received = ?'); params.push(date); }
    if (search) {
      conds.push('(LOWER(CAST(p.id AS TEXT)) LIKE LOWER(?) OR LOWER(p.recipient_name) LIKE LOWER(?) OR LOWER(p.vendor) LIKE LOWER(?) OR LOWER(p.po_number) LIKE LOWER(?) OR LOWER(p.department) LIKE LOWER(?) OR LOWER(p.carrier) LIKE LOWER(?))');
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s);
    }
    if (conds.length) query += ' WHERE ' + conds.join(' AND ');

    // Add sorting logic
    const validSortBy = ['created_at', 'id'];
    const validOrder = ['ASC', 'DESC'];
    const sortColumn = validSortBy.includes(sortBy) ? sortBy : 'created_at';
    const sortOrder = validOrder.includes(order) ? order : 'DESC';
    query += ` ORDER BY p.${sortColumn} ${sortOrder}`;

    const rows = await db.prepare(query).all(...params);
    res.json(rows.map(normalizePlaceholderPackage));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const pkg = await db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
    if (!pkg) return res.status(404).json({ error: 'Not found' });
    const files = await db.prepare('SELECT * FROM package_files WHERE package_id = ? ORDER BY file_type, uploaded_at').all(req.params.id);
    res.json({ ...normalizePlaceholderPackage(pkg), files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const b = req.body;
    const result = await db.prepare(`
      INSERT INTO packages (date_received,carrier,vendor,recipient_name,department,po_number,
        has_packing_slip,items_match,discrepancy_notes,package_type,requires_loic_input,status,notes,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','localtime'))
    `).run(
      b.date_received || new Date().toISOString().slice(0,10),
      b.carrier||null, b.vendor||null,
      b.recipient_name||null, b.department||null, b.po_number||null,
      b.has_packing_slip != null ? (b.has_packing_slip ? 1 : 0) : 1,
      b.items_match != null && b.items_match !== '' ? (b.items_match ? 1 : 0) : null,
      b.discrepancy_notes||null, b.package_type||'standard',
      b.requires_loic_input ? 1 : 0,
      b.status||'received', b.notes||null
    );
    res.json(normalizePlaceholderPackage(await db.prepare('SELECT * FROM packages WHERE id = ?').get(result.lastInsertRowid)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    if (!await db.prepare('SELECT id FROM packages WHERE id = ?').get(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const allowed = ['date_received','carrier','vendor','recipient_name','department','po_number',
      'has_packing_slip','items_match','discrepancy_notes','package_type','requires_loic_input','status',
      'delivery_method','delivered_to_room','pickup_person_name','pickup_person_department',
      'confirmation_method','confirmed_by','confirmation_date','confirmation_notes',
      'notes','loic_email_status','loic_email_sent_date'];
    const updates = { updated_at: new Date().toISOString() };
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const set = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db.prepare(`UPDATE packages SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id);
    const pkg = normalizePlaceholderPackage(await db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id));
    const files = await db.prepare('SELECT * FROM package_files WHERE package_id = ? ORDER BY file_type, uploaded_at').all(req.params.id);
    res.json({ ...pkg, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { deleteStoredFile } = require('../storage');
    const files = await db.prepare('SELECT * FROM package_files WHERE package_id = ?').all(req.params.id);
    for (const f of files) {
      await deleteStoredFile(f.file_name);
    }
    await db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
