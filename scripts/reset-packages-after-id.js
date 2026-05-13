const { initDb, getDb, closeDb, isPostgresDb } = require('../db-unified');
const { deleteStoredFile } = require('../storage');

async function getStats(db, maxId) {
  const total = (await db.prepare('SELECT COUNT(*) AS c FROM packages').get())?.c || 0;
  const over = (await db.prepare('SELECT COUNT(*) AS c FROM packages WHERE id > ?').get(maxId))?.c || 0;
  const currentMax = (await db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM packages').get())?.m || 0;
  return { total, over, currentMax };
}

async function resetSequence(db, isPostgres, keepMaxId) {
  const maxRow = await db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM packages').get();
  const maxExistingId = Number(maxRow?.m || 0);

  if (isPostgres) {
    await db.prepare(`
      SELECT setval(
        pg_get_serial_sequence('packages', 'id'),
        COALESCE((SELECT MAX(id) FROM packages), 1),
        EXISTS(SELECT 1 FROM packages)
      )
    `).run();
    return maxExistingId;
  }

  const seqRow = await db.prepare("SELECT name FROM sqlite_sequence WHERE name = 'packages'").get();
  const targetSeq = maxExistingId;
  if (seqRow) {
    await db.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'packages'").run(targetSeq);
  } else {
    await db.prepare("INSERT INTO sqlite_sequence(name, seq) VALUES ('packages', ?)").run(targetSeq);
  }

  return targetSeq;
}

async function main() {
  const keepMaxId = Number(process.argv[2] || 17);
  if (!Number.isInteger(keepMaxId) || keepMaxId < 0) {
    throw new Error('Usage: node scripts/reset-packages-after-id.js <non-negative-integer-id>');
  }

  await initDb();
  const db = getDb();
  const postgres = isPostgresDb();

  const before = await getStats(db, keepMaxId);
  const filesToDelete = await db.prepare('SELECT file_name FROM package_files WHERE package_id > ?').all(keepMaxId);

  for (const f of filesToDelete) {
    try {
      await deleteStoredFile(f.file_name);
    } catch (err) {
      console.warn(`[warn] could not delete stored file ${f.file_name}: ${err.message}`);
    }
  }

  const deleted = await db.prepare('DELETE FROM packages WHERE id > ?').run(keepMaxId);
  const seqValue = await resetSequence(db, postgres, keepMaxId);
  const after = await getStats(db, keepMaxId);

  console.log(JSON.stringify({
    database: postgres ? 'postgres' : 'sqlite',
    keepMaxId,
    before,
    deletedPackages: deleted?.changes || 0,
    deletedStoredFilesAttempted: filesToDelete.length,
    sequenceSetTo: seqValue,
    expectedNextPackageId: seqValue + 1,
    after
  }, null, 2));

  await closeDb();
}

main().catch(async (err) => {
  console.error(err.message);
  try {
    await closeDb();
  } catch (_) {
    // ignore close errors on failure path
  }
  process.exit(1);
});
