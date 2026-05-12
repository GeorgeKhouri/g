const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getDb, isPostgresDb } = require('./db-unified');

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestamp() {
  const d = new Date();
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate())
  ].join('') + '-' + [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join('');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function pruneOldBackups(backupDir, retentionDays) {
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));

  for (const file of files) {
    const fullPath = path.join(backupDir, file);
    const stat = fs.statSync(fullPath);
    if (now - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(fullPath);
    }
  }
}

async function runBackupOnce(options = {}) {
  // PostgreSQL on Render handles backups automatically
  if (isPostgresDb()) {
    console.log('[backup] using PostgreSQL - Render manages backups automatically');
    return null;
  }

  const backupDir = options.backupDir || path.join(__dirname, 'backups');
  const retentionDays = Number(options.retentionDays || process.env.BACKUP_RETENTION_DAYS || 14);

  ensureDir(backupDir);

  const db = getDb();
  const base = `packages-${timestamp()}`;
  const tmpPath = path.join(backupDir, `${base}.tmp.db`);
  const finalPath = path.join(backupDir, `${base}.db`);

  await db.backup(tmpPath);

  const verifyDb = new Database(tmpPath, { readonly: true, fileMustExist: true });
  const integrity = verifyDb.prepare('PRAGMA integrity_check').pluck().get();
  verifyDb.close();

  if (integrity !== 'ok') {
    fs.unlinkSync(tmpPath);
    throw new Error(`Backup integrity check failed: ${integrity}`);
  }

  fs.renameSync(tmpPath, finalPath);
  pruneOldBackups(backupDir, retentionDays);

  return finalPath;
}

function scheduleBackups(options = {}) {
  const everyMinutes = Number(options.everyMinutes || process.env.BACKUP_INTERVAL_MINUTES || 15);

  if (!Number.isFinite(everyMinutes) || everyMinutes <= 0) {
    throw new Error('BACKUP_INTERVAL_MINUTES must be a positive number');
  }

  const run = () => {
    runBackupOnce(options)
      .then((p) => {
        if (p) console.log(`[backup] created ${p}`);
      })
      .catch((err) => console.error('[backup] failed:', err.message));
  };

  run();
  const timer = setInterval(run, everyMinutes * 60 * 1000);
  timer.unref();

  return () => clearInterval(timer);
}

module.exports = { runBackupOnce, scheduleBackups };
