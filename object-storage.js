// Object records (positions, sizes, names, state). Binaries live in file-storage.
import { dbGetAll, dbBatch } from './database.js';
import { validateObject } from '../core/model.js';

/** Loads every object. Invalid records are isolated: returned in `broken`, never thrown. */
export async function loadObjects() {
  let rows = [];
  try { rows = await dbGetAll('objects'); } catch (e) { return { objects: [], broken: [], error: String(e) }; }
  const objects = [], broken = [];
  for (const raw of rows) {
    const r = validateObject(raw);
    if (r.object) objects.push(r.object); else broken.push({ id: raw?.id, error: r.error, raw });
  }
  return { objects, broken };
}

export const opPutObject = (o) => ({ store: 'objects', put: JSON.parse(JSON.stringify(o)) });
export const opDeleteObject = (id) => ({ store: 'objects', del: id });
export { dbBatch };
