// File storage. IMPORTANT ownership rule: Study Space keeps its own *copy* of an
// imported file inside IndexedDB. The user's original on their device is never
// modified, moved or deleted. Removing an object only removes our copy (and only
// once no other object references it).
import { dbGet, dbPut, dbDelete, dbKeys, dbGetAll } from './database.js';
import { uid } from '../core/util.js';

export async function saveFile(file) {
  const id = uid('f');
  const meta = {
    id,
    name: file.name || 'Untitled',
    type: file.type || guessType(file.name),
    size: file.size,
    addedAt: Date.now(),
  };
  // Blob first: if it fails (quota) no orphan metadata is left behind.
  await dbPut('fileBlobs', { id, blob: file });
  await dbPut('fileMeta', meta);
  return meta;
}

export async function getFileBlob(id) {
  const rec = await dbGet('fileBlobs', id);
  return rec?.blob || null;
}
export const getFileMeta = (id) => dbGet('fileMeta', id);

export async function deleteFile(id) {
  await dbDelete('fileBlobs', id);
  await dbDelete('fileMeta', id);
}

/** Removes stored copies that no object references any more (run at startup). */
export async function collectGarbage(referencedIds) {
  const keep = new Set(referencedIds);
  const all = await dbKeys('fileMeta');
  let n = 0;
  for (const id of all) if (!keep.has(id)) { await deleteFile(id); n++; }
  return n;
}

export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.(); } catch { return null; }
}
export const listFileMeta = () => dbGetAll('fileMeta');

export function guessType(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac', flac: 'audio/flac',
  };
  return map[ext] || '';
}
