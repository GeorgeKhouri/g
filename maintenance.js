const { getDb, isPostgresDb } = require('./db-unified');
const { deleteStoredFile } = require('./storage');

const MAINTENANCE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS maintenance_runs (
    key TEXT PRIMARY KEY,
    executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

async function ensureMaintenanceTable(db) {
  await db.prepare(MAINTENANCE_TABLE_SQL).run();
}

async function markRun(db, key) {
  await db.prepare('INSERT INTO maintenance_runs (key) VALUES (?)').run(key);
}

async function wasRun(db, key) {
  const row = await db.prepare('SELECT key FROM maintenance_runs WHERE key = ?').get(key);
  return Boolean(row);
}

async function resetPackageSequence(db, isPostgres) {
  if (isPostgres) {
    await db.prepare(`
      SELECT setval(
        pg_get_serial_sequence('packages', 'id'),
        COALESCE((SELECT MAX(id) FROM packages), 1),
        EXISTS(SELECT 1 FROM packages)
      )
    `).run();
    return;
  }

  const maxRow = await db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM packages').get();
  const maxExistingId = Number(maxRow?.m || 0);
  const hasSeq = await db.prepare("SELECT name FROM sqlite_sequence WHERE name = 'packages'").get();
  if (hasSeq) {
    await db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'packages'").run(maxExistingId);
  } else {
    await db.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES ('packages', ?)").run(maxExistingId);
  }
}

async function runOneTimePackageCutoffCleanup(cutoffId = 17) {
  const db = getDb();
  const pg = isPostgresDb();
  const runKey = `package_cutoff_cleanup_v1_${cutoffId}`;

  await ensureMaintenanceTable(db);
  if (await wasRun(db, runKey)) {
    return { skipped: true, reason: 'already_ran', cutoffId };
  }

  const files = await db.prepare('SELECT file_name FROM package_files WHERE package_id > ?').all(cutoffId);
  for (const f of files) {
    try {
      await deleteStoredFile(f.file_name);
    } catch (err) {
      console.warn(`[maintenance] failed to delete stored file ${f.file_name}: ${err.message}`);
    }
  }

  const deleted = await db.prepare('DELETE FROM packages WHERE id > ?').run(cutoffId);
  await resetPackageSequence(db, pg);
  await markRun(db, runKey);

  const maxRow = await db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM packages').get();
  const maxId = Number(maxRow?.m || 0);

  return {
    skipped: false,
    cutoffId,
    deletedPackages: deleted?.changes || 0,
    deletedStoredFilesAttempted: files.length,
    nextPackageId: maxId + 1
  };
}

module.exports = { runOneTimePackageCutoffCleanup };
