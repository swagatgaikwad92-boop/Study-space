// Workspace: owns the object lifecycle (create / close / reopen / delete /
// duplicate / order), file import, selection and undo reconciliation.
// The user's arrangement is sacred: nothing here ever moves an existing object
// unless the user asked for it.
import { state, TYPES, RAIL, PAD, makeObject, bringToFront, validateObject, zCounter, normalizeZ } from './core/model.js';
import { bus, clamp } from './core/util.js';
import { history } from './core/history.js';
import { markObject, markDeleted, markWorkspace } from './storage/autosave.js';
import { loadObjects } from './storage/object-storage.js';
import { loadWorkspace } from './storage/workspace-storage.js';
import { saveFile, guessType, collectGarbage } from './storage/file-storage.js';
import { REGISTRY } from './objects/registry.js';
import { findSpot } from './canvas/placement.js';
import { stageRect, visibleWorldRect, animateTo, applyViewport } from './canvas/viewport.js';
import { parseYouTube } from './objects/youtube.js';

export const instances = new Map();
let objectsEl;
const graveyard = new Map();     // id -> view state of recently removed objects (for undo)

export const getInstance = (id) => instances.get(id);

// ---- Startup -----------------------------------------------------------------
export async function initWorkspace(el) {
  objectsEl = el;
  const [{ objects, broken }, ws] = await Promise.all([loadObjects(), loadWorkspace()]);
  if (ws.viewport) Object.assign(state.viewport, ws.viewport);
  state.strokes = ws.strokes;
  state.groups = ws.groups;
  for (const o of objects) { state.objects.set(o.id, o); zCounter.v = Math.max(zCounter.v, o.z); }
  // Isolate objects that could not be recovered: show an error card, keep the raw record untouched.
  for (const b of broken) {
    if (!b.raw || typeof b.raw !== 'object') continue;
    const rec = makeObject('file', {
      id: `broken_${String(b.id || Math.random().toString(36).slice(2)).slice(0, 20)}`,
      x: Number.isFinite(b.raw.x) ? b.raw.x : 0, y: Number.isFinite(b.raw.y) ? b.raw.y : 0,
      meta: { filename: 'Item couldn’t be restored', error: `${b.error || 'Unreadable data'}. The rest of your desk is unaffected.`, transient: true },
    });
    state.objects.set(rec.id, rec);
  }
  if (broken.length) bus.emit('toast', { text: `${broken.length} item${broken.length > 1 ? 's' : ''} couldn’t be restored. The rest of your desk is fine.` });
  // Drop members of groups that no longer exist.
  state.groups = state.groups.map((g) => ({ ...g, members: g.members.filter((id) => state.objects.has(id)) })).filter((g) => g.members.length > 1);
  for (const o of state.objects.values()) if (o.visible) mount(o, false);
  applyViewport(false);
  // Free stored copies nothing references any more.
  collectGarbage([...state.objects.values()].map((o) => o.fileId).filter(Boolean)).catch(() => {});
  history.init(applySnapshot);
  bus.on('object-action', onAction);
  bus.on('gesture-cancel', () => {});
  state.ready = true;
  bus.emit('workspace-ready');
}

// ---- Mount / unmount -----------------------------------------------------------
function mount(rec, animate = true) {
  if (instances.has(rec.id)) return instances.get(rec.id);
  const Cls = REGISTRY[rec.type];
  let inst;
  try { inst = new Cls(rec); } catch (err) {
    console.warn('[workspace] failed to build', rec.type, err);
    const fb = new REGISTRY.file({ ...rec, type: 'file', meta: { ...rec.meta, error: 'This item couldn’t be opened.' } });
    inst = fb;
  }
  instances.set(rec.id, inst);
  objectsEl.append(inst.el);
  if (animate) { inst.el.classList.add('appearing'); setTimeout(() => inst.el.classList.remove('appearing'), 420); }
  Promise.resolve().then(() => inst.load()).catch((err) => { console.warn('[workspace] load', err); inst.showError?.('This item couldn’t be opened.'); });
  return inst;
}

function unmount(id, animate = true) {
  const inst = instances.get(id);
  if (!inst) return;
  instances.delete(id);
  if (state.selectedId === id) selectObject(null);
  if (state.focusedId === id) bus.emit('focus-exit');
  const done = () => { try { inst.destroy(); } catch (e) { console.warn(e); } inst.el.remove(); };
  if (animate) { inst.el.classList.add('leaving'); setTimeout(done, 220); } else done();
}

// ---- Selection -----------------------------------------------------------------
export function selectObject(id) {
  if (state.selectedId === id) return;
  const prev = instances.get(state.selectedId);
  prev?.setSelected(false);
  state.selectedId = id;
  instances.get(id)?.setSelected(true);
  bus.emit('selection', id);
}

// ---- Creation --------------------------------------------------------------------
function initialSize(type) {
  const t = TYPES[type];
  const r = stageRect();
  const s = state.viewport.scale;
  const maxW = (r.width / s) * 0.9, maxH = (r.height / s) * 0.8;
  let w = t.w, h = t.h;
  if (['pdf', 'text', 'image', 'file', 'dabsy'].includes(type)) { w = Math.min(w, maxW); h = Math.min(h, maxH); }
  if (type === 'video') { w = Math.min(w, maxW); h = (w - PAD * 2) / t.aspect + RAIL + PAD; }
  if (type === 'note' || type === 'calculator' || type === 'pomodoro') { w = Math.min(w, maxW); }
  return { w: Math.round(Math.max(t.min[0], w)), h: Math.round(Math.max(t.min[1], h)) };
}

export function createObject(type, over = {}, { select = true, record = true, animate = true, place = true } = {}) {
  const t = TYPES[type];
  if (t.single) {
    const existing = [...state.objects.values()].find((o) => o.type === type);
    if (existing) { reopenObject(existing.id, { reveal: true }); return existing; }
  }
  const size = { ...initialSize(type), ...(over.w ? { w: over.w } : {}), ...(over.h ? { h: over.h } : {}) };
  const rec = makeObject(type, { ...over, ...size });
  if (place && over.x == null) Object.assign(rec, findSpot(rec.w, rec.h));
  bringToFront(rec);
  state.objects.set(rec.id, rec);
  mount(rec, animate);
  markObject(rec.id);
  if (select) selectObject(rec.id);
  if (record) history.commit();
  revealObject(rec.id);   // only the view pans if the new object landed off-screen
  bus.emit('object-created', rec);
  return rec;
}

export function removeObject(id, { record = true } = {}) {
  const rec = state.objects.get(id);
  if (!rec) return;
  graveyard.set(id, rec.view);
  unmount(id);
  state.objects.delete(id);
  state.groups = state.groups.map((g) => ({ ...g, members: g.members.filter((m) => m !== id) })).filter((g) => g.members.length > 1);
  markDeleted(id); markWorkspace();
  bus.emit('groups-changed');
  if (record) history.commit();
}

export function closeObject(id) {
  const rec = state.objects.get(id);
  if (!rec) return;
  if (!TYPES[rec.type].hide) return removeObject(id);
  rec.visible = false;
  unmount(id);
  markObject(id); history.commit();
  bus.emit('closed-changed');
  bus.emit('groups-changed');
}

export function reopenObject(id, { reveal = false } = {}) {
  const rec = state.objects.get(id);
  if (!rec) return;
  if (!rec.visible) { rec.visible = true; mount(rec, true); markObject(id); history.commit(); }
  bringToFront(rec); instances.get(id)?.sync(); markObject(id);
  selectObject(id);
  if (reveal) revealObject(id);
  bus.emit('closed-changed'); bus.emit('groups-changed');
}

export function closedObjects() { return [...state.objects.values()].filter((o) => !o.visible); }

/** Pan/zoom gently so an object is on screen (only the viewport moves, never objects). */
export function revealObject(id) {
  const rec = state.objects.get(id);
  if (!rec) return;
  const v = visibleWorldRect();
  const inside = rec.x < v.r - 40 && rec.x + rec.w > v.l + 40 && rec.y < v.b - 40 && rec.y + rec.h > v.t + 40;
  if (inside) return;
  const r = stageRect(), s = state.viewport.scale;
  animateTo({ scale: s, x: r.width / 2 - (rec.x + rec.w / 2) * s, y: r.height / 2 - (rec.y + rec.h / 2) * s }, 380);
}

export function duplicateObject(id) {
  const src = state.objects.get(id);
  if (!src || TYPES[src.type].single) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = undefined;
  const rec = createObject(src.type, { ...copy, id: undefined, x: src.x + 36, y: src.y + 36, createdAt: Date.now(), view: { ...src.view, time: 0 }, z: undefined });
  return rec;
}

export function renameObject(id, title) {
  const rec = state.objects.get(id);
  if (!rec) return;
  rec.title = title.trim().slice(0, 120);
  if (rec.title) rec.titleVisible = rec.titleVisible; // keep user's choice
  instances.get(id)?.sync();
  markObject(id); history.commit();
}
export function toggleTitleVisible(id) {
  const rec = state.objects.get(id);
  if (!rec) return;
  rec.titleVisible = !rec.titleVisible;
  instances.get(id)?.sync(); markObject(id); history.commit();
}

export function reorder(id, dir) {
  const rec = state.objects.get(id);
  if (!rec) return;
  const band = TYPES[rec.type].band;
  const peers = [...state.objects.values()].filter((o) => TYPES[o.type].band === band).sort((a, b) => a.z - b.z);
  const i = peers.indexOf(rec), j = i + dir;
  if (j < 0 || j >= peers.length) return;
  [peers[i].z, peers[j].z] = [peers[j].z, peers[i].z];
  if (peers[i].z === peers[j].z) peers[j].z += dir;
  for (const p of [peers[i], peers[j]]) { instances.get(p.id)?.sync(); markObject(p.id); }
  history.commit();
}

export function resetSize(id) {
  const rec = state.objects.get(id);
  if (!rec) return;
  const s = initialSize(rec.type);
  rec.w = s.w; rec.h = s.h;
  if (rec.type === 'image' && rec.meta.aspect) { const cw = rec.w - PAD * 2; rec.h = Math.round(cw / rec.meta.aspect + RAIL + PAD); }
  const inst = instances.get(id);
  inst?.sync(); inst?.onResize();
  markObject(id); history.commit(); bus.emit('object-changed', { id });
}

/** Called by drag/resize engines after a gesture finishes. */
export function commitGeometry(id) {
  markObject(id); history.commit();
  bus.emit('object-changed', { id });
}

// ---- Object-level actions from the rail ---------------------------------------
function onAction({ id, action }) {
  if (action === 'close') closeObject(id);
  else if (action === 'delete') removeObject(id);
}

// ---- Import --------------------------------------------------------------------
function kindOf(file) {
  const type = file.type || guessType(file.name);
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('text/') || ['txt', 'md', 'csv'].includes(ext)) return 'text';
  return 'file';
}

export async function importFiles(files, { at } = {}) {
  const list = [...files].filter(Boolean);
  let offset = 0;
  for (const f of list) {
    const tid = `import-${Math.random().toString(36).slice(2)}`;
    bus.emit('toast', { id: tid, text: `Adding ${f.name || 'file'}…`, sticky: true });
    try {
      const meta = await saveFile(f);       // async: canvas stays responsive
      const kind = kindOf(f);
      const over = { fileId: meta.id, meta: { filename: meta.name, mime: meta.type, size: meta.size } };
      if (at) { over.x = at.x + offset; over.y = at.y + offset; offset += 30; }
      const rec = createObject(kind, over);
      if (kind === 'image' || kind === 'pdf') bus.emit('object-meta', { id: rec.id });
    } catch (err) {
      console.warn('[import]', err);
      const quota = err?.name === 'QuotaExceededError';
      bus.emit('toast', { text: quota ? 'There isn’t enough storage on this device for that file.' : `Couldn’t add ${f.name || 'that file'}.` });
    } finally { bus.emit('toast-dismiss', tid); }
  }
}

export function addVideo(input) {
  const p = parseYouTube(input);
  if (!p) return { error: 'That doesn’t look like a YouTube link.' };
  createObject('video', { meta: { videoId: p.id, start: p.start, filename: '' } });
  return { ok: true };
}

export function addNote(text = '') {
  return createObject('note', { state: { text, color: 'butter' }, meta: { justCreated: true } });
}

// ---- Undo/redo reconciliation ------------------------------------------------
function applySnapshot(snap) {
  const next = new Map(snap.objects.map((s) => { const o = JSON.parse(s); return [o.id, o]; }));
  for (const id of [...state.objects.keys()]) {
    if (!next.has(id)) { const rec = state.objects.get(id); graveyard.set(id, rec.view); unmount(id, false); state.objects.delete(id); markDeleted(id); }
  }
  for (const [id, raw] of next) {
    const v = validateObject(raw); if (!v.object) continue;
    const o = v.object;
    const cur = state.objects.get(id);
    if (!cur) {
      o.view = graveyard.get(id) || {};
      state.objects.set(id, o); zCounter.v = Math.max(zCounter.v, o.z);
      if (o.visible) mount(o, true);
      markObject(id);
    } else {
      const wasVisible = cur.visible, sized = cur.w !== o.w || cur.h !== o.h;
      const view = cur.view;
      Object.assign(cur, o); cur.view = view;
      const inst = instances.get(id);
      if (wasVisible !== cur.visible) { cur.visible ? mount(cur, true) : unmount(id, false); }
      else if (inst) { inst.sync(); inst.applyState(); if (sized) inst.onResize(); }
      markObject(id);
    }
  }
  state.groups = JSON.parse(snap.groups);
  state.strokes = snap.strokes.slice();
  markWorkspace();
  if (state.selectedId && !instances.has(state.selectedId)) selectObject(null);
  bus.emit('groups-changed'); bus.emit('ink-changed'); bus.emit('closed-changed');
}

export function clampToWorld(v) { return clamp(v, -1e6, 1e6); }
export { normalizeZ };
