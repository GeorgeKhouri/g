const Database = require('better-sqlite3');
const path = require('path');

let db;
const dbPath = process.env.DB_PATH || path.join(__dirname, 'packages.db');

function initDb() {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS package_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS non_po_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_received TEXT NOT NULL,
      recipient TEXT,
      description TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS non_po_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (item_id) REFERENCES non_po_items(id) ON DELETE CASCADE
    );
  `);

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function getDbPath() {
  return dbPath;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDb, getDb, getDbPath, closeDb };
