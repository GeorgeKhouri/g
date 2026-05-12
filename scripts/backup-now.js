require('dotenv').config();
const { initDb, closeDb } = require('../db');
const { runBackupOnce } = require('../backup');

(async () => {
  try {
    initDb();
    const out = await runBackupOnce();
    console.log(`Backup created: ${out}`);
    closeDb();
    process.exit(0);
  } catch (err) {
    console.error('Backup failed:', err.message);
    closeDb();
    process.exit(1);
  }
})();
