const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');

const uploadsDir = path.join(__dirname, 'uploads');
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET || 'package-files';

function isSupabaseEnabled() {
  return !!supabaseUrl && !!supabaseServiceKey;
}

function isRemoteStoredName(storedName) {
  return /^https?:\/\//i.test(String(storedName || ''));
}

function encodeStoragePath(filePath) {
  return String(filePath)
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function buildPublicUrlFromKey(storageKey) {
  return `${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${encodeStoragePath(storageKey)}`;
}

function extractStorageKeyFromUrl(fileUrl) {
  try {
    const prefix = `/storage/v1/object/public/${supabaseBucket}/`;
    const u = new URL(fileUrl);
    const idx = u.pathname.indexOf(prefix);
    if (idx === -1) return null;
    const encodedKey = u.pathname.slice(idx + prefix.length);
    return decodeURIComponent(encodedKey);
  } catch {
    return null;
  }
}

function getLocalUploadPath(fileName) {
  return path.join(uploadsDir, fileName);
}

function extensionFor(file) {
  return path.extname(file.originalname || file.fileName || '') || '';
}

async function uploadIncomingFile(file, { scope = 'packages', ownerId = 'unknown' } = {}) {
  const ext = extensionFor(file);
  const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

  if (isSupabaseEnabled()) {
    const storageKey = `${scope}/${ownerId}/${unique}`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${supabaseBucket}/${encodeStoragePath(storageKey)}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey,
        'Content-Type': file.mimetype || 'application/octet-stream',
        'x-upsert': 'false'
      },
      body: file.buffer
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Supabase upload failed (${response.status}): ${details || 'unknown error'}`);
    }

    return buildPublicUrlFromKey(storageKey);
  }

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  await fsp.writeFile(path.join(uploadsDir, unique), file.buffer);
  return unique;
}

async function deleteStoredFile(storedName) {
  if (!storedName) return;

  if (isRemoteStoredName(storedName)) {
    if (!isSupabaseEnabled()) return;
    const storageKey = extractStorageKeyFromUrl(storedName);
    if (!storageKey) return;

    const deleteUrl = `${supabaseUrl}/storage/v1/object/${supabaseBucket}/${encodeStoragePath(storageKey)}`;
    await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        apikey: supabaseServiceKey
      }
    }).catch(() => {});
    return;
  }

  const fp = getLocalUploadPath(storedName);
  if (fs.existsSync(fp)) {
    await fsp.unlink(fp).catch(() => {});
  }
}

async function readStoredFile(storedName) {
  if (isRemoteStoredName(storedName)) {
    const response = await fetch(storedName);
    if (!response.ok) throw new Error(`Remote file unavailable: ${response.status}`);
    const arr = await response.arrayBuffer();
    return Buffer.from(arr);
  }

  const fp = getLocalUploadPath(storedName);
  return await fsp.readFile(fp);
}

function toPublicFileUrl(storedName) {
  if (isRemoteStoredName(storedName)) return storedName;
  return `/uploads/${storedName}`;
}

module.exports = {
  isRemoteStoredName,
  uploadIncomingFile,
  deleteStoredFile,
  readStoredFile,
  toPublicFileUrl
};
