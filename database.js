// Thin promise wrapper around IndexedDB. Falls back to an in-memory store when
// IndexedDB is unavailable (e.g. some private modes) so the app keeps working;
// `db.persistent` tells the UI whether data will survive a reload.
const NAME = 'study-space';
const VERSION = 1;
const STORES = {
  workspace: { keyPath: 'key' },   // viewport, groups, strokes, schema info
  objects:   { keyPath: 'id' },    // object records (no binaries)
  fileMeta:  { keyPath: 'id' },    // filename, mime, size, addedAt
  fileBlobs: { keyPath: 'id' },    // {id, blob}  - the only place large data lives
  settings:  { keyPath: 'key' },
  events:    { autoIncrement: true },
};

const mem = Object.fromEntries(Object.keys(STORES).map((s) => [s, new Map()]));
let memSeq = 1;
let dbp = null;

export const db = { persistent: false, error: null };

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    if (!('indexedDB' in globalThis)) { db.error = 'IndexedDB unavailable'; return resolve(null); }
    let req;
    try { req = indexedDB.open(NAME, VERSION); } catch (e) { db.error = String(e); return resolve(null); }
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const [name, opts] of Object.entries(STORES)) {
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opts);
      }
    };
    req.onsuccess = () => {
      db.persistent = true;
      const d = req.result;
      d.onversionchange = () => d.close();
      resolve(d);
    };
    req.onerror = () => { db.error = String(req.error); resolve(null); };
    req.onblocked = () => { db.error = 'Database blocked by another tab'; };
  });
  return dbp;
}

const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function dbGet(store, key) {
  const d = await open();
  if (!d) return mem[store].get(key);
  return wrap(d.transaction(store).objectStore(store).get(key));
}

export async function dbGetAll(store) {
  const d = await open();
  if (!d) return [...mem[store].values()];
  return wrap(d.transaction(store).objectStore(store).getAll());
}

export async function dbPut(store, value) {
  const d = await open();
  if (!d) {
    const kp = STORES[store].keyPath;
    mem[store].set(kp ? value[kp] : memSeq++, value);
    return;
  }
  return new Promise((res, rej) => {
    const t = d.transaction(store, 'readwrite');
    t.objectStore(store).put(value);
    t.oncomplete = () => res();
    t.onerror = t.onabort = () => rej(t.error);
  });
}

export async function dbDelete(store, key) {
  const d = await open();
  if (!d) { mem[store].delete(key); return; }
  return new Promise((res, rej) => {
    const t = d.transaction(store, 'readwrite');
    t.objectStore(store).delete(key);
    t.oncomplete = () => res();
    t.onerror = t.onabort = () => rej(t.error);
  });
}

/** Write many puts/deletes across stores in a single transaction. ops: [{store, put}|{store, del}] */
export async function dbBatch(ops) {
  if (!ops.length) return;
  const d = await open();
  if (!d) {
    for (const op of ops) {
      if ('put' in op) { const kp = STORES[op.store].keyPath; mem[op.store].set(kp ? op.put[kp] : memSeq++, op.put); }
      else mem[op.store].delete(op.del);
    }
    return;
  }
  const names = [...new Set(ops.map((o) => o.store))];
  return new Promise((res, rej) => {
    const t = d.transaction(names, 'readwrite');
    for (const op of ops) {
      const s = t.objectStore(op.store);
      if ('put' in op) s.put(op.put); else s.delete(op.del);
    }
    t.oncomplete = () => res();
    t.onerror = t.onabort = () => rej(t.error || new Error('Transaction aborted'));
  });
}

export async function dbKeys(store) {
  const d = await open();
  if (!d) return [...mem[store].keys()];
  return wrap(d.transaction(store).objectStore(store).getAllKeys());
}

export async function dbInit() { await open(); return db; }
