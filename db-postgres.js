const { Client, Pool } = require('pg');
const path = require('path');

let pool;

async function initDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  pool = new Pool({ connectionString: dbUrl });

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS packages (
        id SERIAL PRIMARY KEY,
        date_received TEXT NOT NULL,
        carrier TEXT,
        tracking_number TEXT,
        vendor TEXT,
        recipient_name TEXT,
        department TEXT,
        po_number TEXT,
        has_packing_slip INTEGER NOT NULL DEFAULT 1,
        items_match INTEGER,
        discrepancy_notes TEXT,
        package_type TEXT NOT NULL DEFAULT 'standard',
        requires_loic_input INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'received',
        delivery_method TEXT,
        delivered_to_room TEXT,
        pickup_person_name TEXT,
        pickup_person_department TEXT,
        confirmation_method TEXT,
        confirmed_by TEXT,
        confirmation_date TEXT,
        confirmation_notes TEXT,
        notes TEXT,
        loic_email_status TEXT NOT NULL DEFAULT 'not_sent',
        loic_email_sent_date TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS package_files (
        id SERIAL PRIMARY KEY,
        package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
        file_type TEXT NOT NULL,
        file_name TEXT NOT NULL,
        original_name TEXT,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS non_po_items (
        id SERIAL PRIMARY KEY,
        date_received TEXT NOT NULL,
        recipient TEXT,
        description TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS non_po_files (
        id SERIAL PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES non_po_items(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        original_name TEXT,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('[db] PostgreSQL initialized');
  } finally {
    client.release();
  }

  return pool;
}

function getDb() {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { initDb, getDb, closeDb };
