// Tool 2: Pen. Freehand ink lives on the Study Space canvas (world coordinates),
// never inside a PDF or image - the originals are not modified.
import { state, validateStroke } from '../core/model.js';
import { bus, el, icon, iconButton, uid, clamp } from '../core/util.js';
import { history } from '../core/history.js';
import { markWorkspace } from '../storage/autosave.js';
import { screenToWorld } from '../canvas/viewport.js';

const COLORS = ['#2b2b30', '#c0463a', '#2f6fb3', '#2f8f5b', '#c98a1b'];
const SIZES = [2, 4, 8];
const pen = { on: false, tool: 'pen', color: COLORS[0], size: 4 };
let canvas, ctx, dpr = 1, W = 0, H = 0;
let bar, cur = null, lastPenAt = 0, erased = false;
let raf = 0;

export function initPen(c) {
  canvas = c; ctx = c.getContext('2d');
  resize();
  bus.on('viewport-resize', resize); addEventListener('resize', resize);
  bus.on('viewport', schedule);
  bus.on('ink-changed', () => { schedule(); updateBar(); });
  bus.on('history', () => { if (bar) updateBar(); });
  bus.on('gesture-cancel', () => { cur = null; });
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  buildBar();
  schedule();
}

function resize() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = r.width; H = r.height;
  canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
  schedule();
}
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; redraw(); }); }

// ---- Rendering ---------------------------------------------------------------
function toScreen(x, y) { const v = state.viewport; return [x * v.scale + v.x, y * v.scale + v.y]; }

function drawStroke(s, upTo) {
  const pts = s.pts, n = Math.floor(pts.length / 3), v = state.viewport;
  if (n < 1) return;
  const end = upTo ?? n;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const base = s.size * v.scale;
  const passes = s.tool === 'pencil' ? [{ w: 0.85, a: 0.55, j: 0 }, { w: 0.45, a: 0.4, j: 0.6 }] : [{ w: 1, a: 1, j: 0 }];
  for (const ps of passes) {
    ctx.strokeStyle = s.color; ctx.globalAlpha = ps.a;
    let px, py, pp;
    for (let i = 0; i < end; i++) {
      let [x, y] = toScreen(pts[i * 3], pts[i * 3 + 1]);
      if (ps.j) { x += Math.sin(i * 12.9898) * ps.j; y += Math.cos(i * 78.233) * ps.j; }
      const p = pts[i * 3 + 2];
      if (i === 0) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.6, base * ps.w * (0.35 + 0.65 * p) / 2), 0, 6.2832); ctx.fillStyle = s.color; ctx.fill(); }
      else {
        ctx.lineWidth = Math.max(0.6, base * ps.w * (s.pressure ? 0.35 + 1.1 * p : 1));
        ctx.beginPath(); ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        ctx.stroke();
      }
      px = x; py = y; pp = p;
    }
    void pp;
  }
  ctx.globalAlpha = 1;
}

function redraw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const v = state.viewport;
  for (const s of state.strokes) {
    // cheap culling by bounding box
    if (s.bb === undefined) s.bb = bounds(s);
    const b = s.bb, l = b[0] * v.scale + v.x, t = b[1] * v.scale + v.y, r = b[2] * v.scale + v.x, bt = b[3] * v.scale + v.y;
    if (r < -20 || l > W + 20 || bt < -20 || t > H + 20) continue;
    drawStroke(s);
  }
  if (cur) drawStroke(cur.stroke);
}
function bounds(s) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (let i = 0; i < s.pts.length; i += 3) { l = Math.min(l, s.pts[i]); r = Math.max(r, s.pts[i]); t = Math.min(t, s.pts[i + 1]); b = Math.max(b, s.pts[i + 1]); }
  const pad = s.size + 2; return [l - pad, t - pad, r + pad, b + pad];
}

// ---- Input ---------------------------------------------------------------------
function down(e) {
  if (!pen.on) return;
  if (e.pointerType === 'pen') lastPenAt = Date.now();
  else if (e.pointerType === 'touch' && Date.now() - lastPenAt < 1800) return;   // palm rejection
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (cur) return;
  canvas.setPointerCapture(e.pointerId);
  const w = screenToWorld(e.clientX, e.clientY);
  if (pen.tool === 'eraser') { cur = { id: e.pointerId, eraser: true }; erased = false; erase(e); return; }
  cur = {
    id: e.pointerId,
    stroke: { id: uid('s'), tool: pen.tool, color: pen.color, size: pen.tool === 'pencil' ? Math.max(1.5, pen.size * 0.8) : pen.size, pressure: e.pointerType === 'pen', pts: [w.x, w.y, e.pointerType === 'pen' ? clamp(e.pressure || 0.5, 0.05, 1) : 0.5] },
  };
  schedule();
}

function move(e) {
  if (!cur || e.pointerId !== cur.id) return;
  if (cur.eraser) return erase(e);
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of events) {
    const w = screenToWorld(ev.clientX, ev.clientY), pts = cur.stroke.pts;
    const lx = pts[pts.length - 3], ly = pts[pts.length - 2];
    if (Math.hypot(w.x - lx, w.y - ly) * state.viewport.scale < 1.2) continue;
    pts.push(w.x, w.y, e.pointerType === 'pen' ? clamp(ev.pressure || 0.5, 0.05, 1) : 0.5);
  }
  schedule();
}

function up(e) {
  if (!cur || e.pointerId !== cur.id) return;
  if (cur.eraser) { if (erased) { history.commit(); markWorkspace(); } cur = null; return; }
  const s = validateStroke({ ...cur.stroke, pts: cur.stroke.pts.length < 6 ? [...cur.stroke.pts, ...cur.stroke.pts] : cur.stroke.pts });
  if (s) { s.pressure = cur.stroke.pressure; state.strokes = [...state.strokes, s]; markWorkspace(); history.commit(); }
  cur = null; schedule(); updateBar();
}

function erase(e) {
  const w = screenToWorld(e.clientX, e.clientY);
  const r = (12 + pen.size * 1.5) / state.viewport.scale;
  const keep = state.strokes.filter((s) => {
    if (!s.bb) s.bb = bounds(s);
    if (w.x < s.bb[0] - r || w.x > s.bb[2] + r || w.y < s.bb[1] - r || w.y > s.bb[3] + r) return true;
    for (let i = 0; i < s.pts.length; i += 3) if (Math.hypot(s.pts[i] - w.x, s.pts[i + 1] - w.y) < r + s.size / 2) return false;
    return true;
  });
  if (keep.length !== state.strokes.length) { state.strokes = keep; erased = true; schedule(); updateBar(); }
}

// ---- Toolbar -------------------------------------------------------------------
function buildBar() {
  const tools = [['pen', 'pen', 'Pen'], ['pencil', 'pencil', 'Pencil'], ['eraser', 'eraser', 'Eraser']];
  bar = el('div', { class: 'pen-bar glass strong', 'data-ui': '', hidden: true, role: 'toolbar', 'aria-label': 'Pen tools' },
    tools.map(([id, ic, label]) => el('button', { type: 'button', class: 'ibtn tool', 'data-tool': id, 'aria-label': label, title: label, onclick: () => { pen.tool = id; updateBar(); } }, icon(ic))),
    el('span', { class: 'sep' }),
    SIZES.map((s) => el('button', { type: 'button', class: 'ibtn size', 'data-size': s, 'aria-label': `Stroke size ${s}`, onclick: () => { pen.size = s; updateBar(); } }, el('i', { style: { width: `${s + 4}px`, height: `${s + 4}px` } }))),
    el('span', { class: 'sep' }),
    COLORS.map((c) => el('button', { type: 'button', class: 'swatch', 'data-color': c, 'aria-label': `Colour ${c}`, style: { '--c': c }, onclick: () => { pen.color = c; if (pen.tool === 'eraser') pen.tool = 'pen'; updateBar(); } })),
    el('span', { class: 'sep' }),
    iconButton('undo', 'Undo', () => history.undo()),
    iconButton('clear', 'Clear all ink', clearInk),
    el('button', { type: 'button', class: 'btn primary small', onclick: () => setPen(false) }, 'Done'));
  document.getElementById('ui').append(bar);
  updateBar();
}

function updateBar() {
  bar.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === pen.tool));
  bar.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('active', +b.dataset.size === pen.size));
  bar.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('active', b.dataset.color === pen.color && pen.tool !== 'eraser'));
  bar.querySelector('[aria-label="Clear all ink"]').disabled = !state.strokes.length;
}

export function clearInk() {
  if (!state.strokes.length) return;
  state.strokes = []; markWorkspace(); history.commit(); schedule(); updateBar();
  bus.emit('toast', { text: 'Ink cleared.', action: { label: 'Undo', onClick: () => history.undo() } });
}

export function setPen(on) {
  pen.on = on;
  document.body.classList.toggle('pen-active', on);
  bar.hidden = !on;
  if (on) { bar.classList.add('appearing'); setTimeout(() => bar.classList.remove('appearing'), 300); }
  updateBar();
  bus.emit('pen-changed', on);
}
export const isPenOn = () => pen.on;
export const togglePen = () => setPen(!pen.on);
