// Drag + resize engine. Moving an object is only possible from its rail (or from
// explicitly marked non-interactive surfaces such as the calculator display), so
// content gestures - PDF scrolling, video taps, text editing - are never hijacked.
import { state, TYPES, RAIL, PAD, bringToFront } from '../core/model.js';
import { bus, el } from '../core/util.js';
import { instances, selectObject, commitGeometry } from '../workspace.js';
import { vp } from './viewport.js';
import { snapMove } from './snapping.js';

const INTERACTIVE = 'button, input, textarea, select, a, [contenteditable="true"], .seek, .vol';
let drag = null, resize = null, longPress = null;
let guidesEl, vGuide, hGuide;

export function initDrag(objectsEl, guides) {
  guidesEl = guides;
  vGuide = el('div', { class: 'guide v', hidden: true });
  hGuide = el('div', { class: 'guide h', hidden: true });
  guidesEl.append(vGuide, hGuide);

  objectsEl.addEventListener('pointerdown', onDown);
  objectsEl.addEventListener('pointermove', onMove);
  objectsEl.addEventListener('pointerup', onUp);
  objectsEl.addEventListener('pointercancel', () => cancel());
  objectsEl.addEventListener('contextmenu', (e) => {
    const o = e.target.closest('.obj');
    if (!o || e.target.closest('textarea, input')) return;
    e.preventDefault();
    selectObject(o.dataset.id);
    bus.emit('object-menu', { id: o.dataset.id, x: e.clientX, y: e.clientY });
  });
  bus.on('gesture-cancel', () => cancel(true));
}

const scale = () => state.viewport.scale;

function onDown(e) {
  if (document.body.classList.contains('pen-active')) return;
  const node = e.target.closest('.obj');
  if (!node || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const id = node.dataset.id;
  const rec = state.objects.get(id), inst = instances.get(id);
  if (!rec || !inst) return;
  if (state.focusedId && state.focusedId !== id) bus.emit('focus-switch', id);
  selectObject(id);

  const handle = e.target.closest('[data-resize]');
  if (handle) {
    e.preventDefault();
    resize = { id, rec, inst, pid: e.pointerId, sx: e.clientX, sy: e.clientY, w: rec.w, h: rec.h };
    handle.setPointerCapture(e.pointerId);
    node.classList.add('resizing');
    return;
  }
  const grab = e.target.closest('[data-drag]');
  if (!grab || e.target.closest(INTERACTIVE) || !node.contains(grab)) return;
  drag = { id, rec, inst, pid: e.pointerId, sx: e.clientX, sy: e.clientY, x: rec.x, y: rec.y, moving: false, node, type: e.pointerType };
  // Long press on the rail (touch) opens the object menu
  if (e.pointerType !== 'mouse' && grab.classList.contains('obj-rail')) {
    clearTimeout(longPress);
    longPress = setTimeout(() => {
      if (drag && !drag.moving) {
        const { sx, sy } = drag; cancel(); navigator.vibrate?.(8);
        bus.emit('object-menu', { id, x: sx, y: sy });
      }
    }, 480);
  }
  grab.setPointerCapture?.(e.pointerId);
  if (grab.classList.contains('obj-rail')) e.preventDefault();
}

function onMove(e) {
  if (resize && e.pointerId === resize.pid) return doResize(e);
  if (!drag || e.pointerId !== drag.pid) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (!drag.moving) {
    if (Math.hypot(dx, dy) < 4) return;
    clearTimeout(longPress);
    drag.moving = true;
    bringToFront(drag.rec); drag.inst.sync();
    drag.node.classList.add('dragging');
    document.body.classList.add('is-dragging');
  }
  const s = scale();
  let x = drag.x + dx / s, y = drag.y + dy / s;
  const snapped = e.altKey ? { x, y, guides: { v: [], h: [] } } : snapMove(drag.rec, x, y, 7 / s);
  drag.rec.x = Math.round(snapped.x * 10) / 10; drag.rec.y = Math.round(snapped.y * 10) / 10;
  drag.inst.sync();
  showGuides(snapped.guides, s);
  bus.emit('object-moving', { id: drag.id });
}

function onUp(e) {
  if (resize && e.pointerId === resize.pid) {
    resize.rec.w = Math.round(resize.rec.w); resize.rec.h = Math.round(resize.rec.h);
    resize.inst.el.classList.remove('resizing'); resize.inst.sync();
    commitGeometry(resize.id); resize = null; return;
  }
  if (!drag || e.pointerId !== drag.pid) return;
  clearTimeout(longPress);
  const { node, moving, id } = drag;
  node.classList.remove('dragging');
  document.body.classList.remove('is-dragging');
  hideGuides();
  if (moving) {
    node.classList.add('settling'); setTimeout(() => node.classList.remove('settling'), 320);
    commitGeometry(id);
  }
  drag = null;
}

function cancel(revert = false) {
  clearTimeout(longPress);
  if (drag) {
    drag.node.classList.remove('dragging'); document.body.classList.remove('is-dragging');
    if (revert && drag.moving) { drag.rec.x = drag.x; drag.rec.y = drag.y; drag.inst.sync(); }
    drag = null;
  }
  if (resize) { resize.inst.el.classList.remove('resizing'); resize = null; }
  hideGuides();
}

let rafResize = 0;
function doResize(e) {
  const { rec, inst } = resize;
  const spec = TYPES[rec.type], s = scale();
  let w = resize.w + (e.clientX - resize.sx) / s;
  let h = resize.h + (e.clientY - resize.sy) / s;
  w = Math.max(spec.min[0], w);
  const aspect = spec.aspect || (spec.lockAspect && rec.meta.aspect) || 0;
  if (aspect) h = (w - PAD * 2) / aspect + RAIL + PAD;
  else if (spec.fixedH) h = rec.h;
  else h = Math.max(spec.min[1], h);
  rec.w = w; rec.h = h;
  inst.sync();
  if (!rafResize) rafResize = requestAnimationFrame(() => { rafResize = 0; resize?.inst.onResize(); });
  bus.emit('object-moving', { id: rec.id });
}

function showGuides(g, s) {
  const r = state.viewport;
  vGuide.hidden = !g.v.length; hGuide.hidden = !g.h.length;
  if (g.v.length) { vGuide.style.transform = `translateX(${g.v[0]}px)`; vGuide.style.width = `${1 / s}px`; }
  if (g.h.length) { hGuide.style.transform = `translateY(${g.h[0]}px)`; hGuide.style.height = `${1 / s}px`; }
  void r;
}
function hideGuides() { vGuide.hidden = hGuide.hidden = true; }

export { vp };
