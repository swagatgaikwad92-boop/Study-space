// Workspace state + object model + validation. Everything here is plain,
// serialisable data (see serialize()) so export/import can be added later.
import { uid, clamp } from './util.js';

export const RAIL = 30;   // slim top rail of every object (grip + contextual actions)
export const PAD = 10;    // glass frame around content

// Each type: default size (outer), minimum size, z band, behaviour flags.
export const TYPES = {
  pdf:        { label: 'PDF',             w: 460, h: 640, min: [280, 260], band: 'content',   hide: true },
  video:      { label: 'Video',           w: 480, h: 299, min: [300, 200], band: 'content',   hide: true, aspect: 16 / 9 },
  image:      { label: 'Image',           w: 340, h: 300, min: [140, 120], band: 'content',   hide: true, lockAspect: true },
  text:       { label: 'Text',            w: 380, h: 320, min: [220, 160], band: 'content',   hide: true },
  audio:      { label: 'Audio',           w: 320, h: 118, min: [240, 118], band: 'tool',      hide: true, fixedH: true },
  file:       { label: 'File',            w: 300, h: 190, min: [240, 160], band: 'content',   hide: true },
  note:       { label: 'Sticky note',     w: 220, h: 190, min: [150, 120], band: 'tool' },
  calculator: { label: 'Calculator',      w: 250, h: 392, min: [250, 392], band: 'tool',      fixed: true },
  pomodoro:   { label: 'Pomodoro',        w: 280, h: 292, min: [280, 292], band: 'companion', hide: true, fixed: true, single: true },
  dabsy:      { label: 'DABSy',           w: 340, h: 460, min: [280, 320], band: 'companion', hide: true, single: true },
  solvecount: { label: 'SolveCount',      w: 240, h: 150, min: [240, 150], band: 'companion', hide: true, fixed: true, single: true },
};

export const BAND_BASE = { content: 100, tool: 1000, companion: 2000 };

export const state = {
  objects: new Map(),       // id -> object record
  groups: [],               // [{id, members:[ids], title?}]
  strokes: [],              // ink, world coordinates
  viewport: { x: 0, y: 0, scale: 1 },
  selectedId: null,
  focusedId: null,
  settings: {
    motion: 'system',       // system | reduced | full
    snap: true,
    pomodoro: { focus: 25, short: 5, long: 15, longEvery: 4, autoBreak: true },
  },
  ready: false,
};

export function makeObject(type, over = {}) {
  const t = TYPES[type];
  if (!t) throw new Error(`Unknown object type: ${type}`);
  const rec = {
    type, x: 0, y: 0, w: t.w, h: t.h,
    createdAt: Date.now(),
    title: '', titleVisible: false, visible: true,
    state: {},     // undoable content state (note text, colour, ...)
    view: {},      // ephemeral view state, not part of undo (pdf page, zoom, playback position)
    meta: {},      // content metadata (filename, size, mime, videoId, ...)
    fileId: null,  // key into fileBlobs. Study Space stores a *copy*; the user's original is never touched.
  };
  for (const [k, v] of Object.entries(over)) if (v !== undefined) rec[k] = v;
  rec.id = over.id || uid('o');
  rec.z = Number.isFinite(over.z) ? over.z : ++zCounter.v;
  return rec;
}

export const zCounter = { v: 0 };

export function zIndexFor(o) {
  const base = BAND_BASE[TYPES[o.type]?.band] ?? 100;
  return base + clamp(o.z, 0, 899);
}

export function normalizeZ() {
  const list = [...state.objects.values()].sort((a, b) => a.z - b.z);
  list.forEach((o, i) => { o.z = i + 1; });
  zCounter.v = list.length;
}

export function bringToFront(o) {
  const band = TYPES[o.type].band;
  let max = 0;
  for (const p of state.objects.values()) if (TYPES[p.type].band === band && p.z > max) max = p.z;
  if (o.z <= max) o.z = max + 1;
  zCounter.v = Math.max(zCounter.v, o.z);
  if (o.z > 850) normalizeZ();
}

// ---- Validation / recovery -------------------------------------------------
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v, d = '') => (typeof v === 'string' ? v : d);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Returns {object, repaired} or {error, raw}. Never throws. */
export function validateObject(raw) {
  try {
    if (!raw || typeof raw !== 'object') return { error: 'Not an object', raw };
    if (typeof raw.id !== 'string' || !raw.id) return { error: 'Missing id', raw };
    if (!TYPES[raw.type]) return { error: `Unknown type "${String(raw.type).slice(0, 24)}"`, raw };
    const t = TYPES[raw.type];
    let repaired = false;
    const fix = (v, d, lo, hi) => {
      const n = num(v, NaN);
      if (Number.isNaN(n)) { repaired = true; return d; }
      const c = clamp(n, lo, hi);
      if (c !== n) repaired = true;
      return c;
    };
    const o = {
      id: raw.id,
      type: raw.type,
      x: fix(raw.x, 0, -1e6, 1e6),
      y: fix(raw.y, 0, -1e6, 1e6),
      w: fix(raw.w, t.w, t.min[0], 6000),
      h: fix(raw.h, t.h, t.min[1], 6000),
      z: fix(raw.z, 1, 0, 1e6),
      createdAt: num(raw.createdAt, Date.now()),
      title: str(raw.title).slice(0, 120),
      titleVisible: !!raw.titleVisible,
      visible: raw.visible !== false,
      state: obj(raw.state),
      view: obj(raw.view),
      meta: obj(raw.meta),
      fileId: typeof raw.fileId === 'string' ? raw.fileId : null,
    };
    return { object: o, repaired };
  } catch (err) {
    return { error: String(err?.message || err), raw };
  }
}

export function validateStroke(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.pts) || s.pts.length < 3) return null;
  if (!s.pts.every(Number.isFinite)) return null;
  return {
    id: str(s.id, uid('s')),
    tool: s.tool === 'pencil' ? 'pencil' : 'pen',
    color: /^#[0-9a-f]{3,8}$/i.test(s.color) ? s.color : '#2b2b30',
    size: clamp(num(s.size, 3), 1, 40),
    pressure: !!s.pressure,
    pts: s.pts,
  };
}

// ---- Serialisation ----------------------------------------------------------
export function serialize() {
  return {
    version: 1,
    viewport: { ...state.viewport },
    objects: [...state.objects.values()].map((o) => JSON.parse(JSON.stringify(o))),
    groups: JSON.parse(JSON.stringify(state.groups)),
    strokes: state.strokes,
    settings: JSON.parse(JSON.stringify(state.settings)),
  };
}

export function rectOf(o) { return { l: o.x, t: o.y, r: o.x + o.w, b: o.y + o.h }; }
