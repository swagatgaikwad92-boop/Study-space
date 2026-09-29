// Debounced autosave. Callers mark things dirty (cheap); a single batched
// transaction runs after a quiet period, never per pointer-move.
import { dbBatch } from './database.js';
import { opPutObject, opDeleteObject } from './object-storage.js';
import { opWorkspace } from './workspace-storage.js';
import { state } from '../core/model.js';
import { bus, debounce } from '../core/util.js';

const dirtyObjects = new Set();
const deletedObjects = new Set();
let wsDirty = false;
let saving = false, again = false;

async function run() {
  if (saving) { again = true; return; }
  saving = true;
  try {
    const ops = [];
    for (const id of dirtyObjects) {
      const o = state.objects.get(id);
      if (o && !o.meta?.transient) ops.push(opPutObject(o));
    }
    for (const id of deletedObjects) ops.push(opDeleteObject(id));
    if (wsDirty) ops.push(opWorkspace(state));
    dirtyObjects.clear(); deletedObjects.clear(); wsDirty = false;
    await dbBatch(ops);
    bus.emit('saved');
  } catch (err) {
    console.warn('[autosave]', err);
    bus.emit('save-error', err);
  } finally {
    saving = false;
    if (again) { again = false; schedule(); }
  }
}

const schedule = debounce(run, 450);

export const markObject = (id) => { dirtyObjects.add(id); deletedObjects.delete(id); schedule(); };
export const markDeleted = (id) => { deletedObjects.add(id); dirtyObjects.delete(id); schedule(); };
export const markWorkspace = () => { wsDirty = true; schedule(); };
export const flushNow = () => run();

// Make sure a pending write is not lost when the app is backgrounded or closed.
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') schedule.flush(); });
addEventListener('pagehide', () => schedule.flush());
