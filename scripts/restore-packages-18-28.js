/**
 * Restore packages 18-28 with minimal placeholder data
 * Run once: node scripts/restore-packages-18-28.js
 */

const { initDb, getDb } = require('../db-unified');

async function restorePackages() {
  try {
    await initDb();
    const db = getDb();

    // Check if already restored
    const existing = await db.prepare('SELECT COUNT(*) as c FROM packages WHERE id >= 18 AND id <= 28').get();
    if (existing?.c > 0) {
      console.log(`✓ Packages 18-28 already exist (${existing.c} found). Skipping restore.`);
      process.exit(0);
    }

    const packages = [];
    for (let i = 18; i <= 28; i++) {
      packages.push({
        id: i,
        date_received: '',
        carrier: null,
        vendor: 'PLACEHOLDER',
        recipient_name: 'PLACEHOLDER',
        department: null,
        po_number: null,
        has_packing_slip: 0,
        items_match: null,
        discrepancy_notes: null,
        package_type: 'standard',
        requires_loic_input: 0,
        status: 'received',
        notes: null,
        loic_email_status: 'not_sent',
        loic_email_sent_date: null,
        delivery_method: null,
        delivered_to_room: null,
        pickup_person_name: null,
        pickup_person_department: null,
        confirmation_method: null,
        confirmed_by: null,
        confirmation_date: null,
        confirmation_notes: null,
        updated_at: new Date().toISOString()
      });
    }

    // Insert packages
    for (const pkg of packages) {
      const cols = Object.keys(pkg);
      const placeholders = cols.map(() => '?').join(',');
      const query = `INSERT INTO packages (${cols.join(',')}) VALUES (${placeholders})`;
      await db.prepare(query).run(...Object.values(pkg));
    }

    console.log(`✓ Restored packages 18-28 (11 packages)`);
    console.log('ℹ Edit each package to add actual details and re-upload files');
    process.exit(0);
  } catch (err) {
    console.error('Error restoring packages:', err.message);
    process.exit(1);
  }
}

restorePackages();
