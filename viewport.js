// Viewport (pan / zoom) for the spatial canvas. World coordinates are what
// objects store; screen = world * scale + (x, y).
import { state } from '../core/model.js';
import { bus, clamp, prefersReducedMotion } from '../core/util.js';
import { markWorkspace } from '../storage/autosave.js';

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 3;

let stage, world;
export const vp = { pinching: false, panning: false };

export function initViewport(stageEl, worldEl) {
  stage = stageEl; world = worldEl;
  applyViewport(false);
  bindGestures();
  new ResizeObserver(() => bus.emit('viewport-resize')).observe(stage);
}

export function applyViewport(save = true) {
  const v = state.viewport;
  world.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.scale})`;
  stage.style.setProperty('--vp-scale', v.scale);
  bus.emit('viewport', v);
  if (save) markWorkspace();
}

export const stageRect = () => stage.getBoundingClientRect();

export function screenToWorld(px, py) {
  const r = stageRect(), v = state.viewport;
  return { x: (px - r.left - v.x) / v.scale, y: (py - r.top - v.y) / v.scale };
}
export function worldToScreen(wx, wy) {
  const r = stageRect(), v = state.viewport;
  return { x: wx * v.scale + v.x + r.left, y: wy * v.scale + v.y + r.top };
}
export function visibleWorldRect() {
  const r = stageRect(), v = state.viewport;
  return { l: -v.x / v.scale, t: -v.y / v.scale, r: (r.width - v.x) / v.scale, b: (r.height - v.y) / v.scale };
}
export function viewCenterWorld() {
  const r = visibleWorldRect();
  return { x: (r.l + r.r) / 2, y: (r.t + r.b) / 2 };
}

export function panBy(dx, dy) {
  state.viewport.x += dx; state.viewport.y += dy;
  applyViewport();
}

/** Zoom keeping the screen point (cx, cy) (client coords) fixed. */
export function zoomAt(cx, cy, factor) {
  const r = stageRect(), v = state.viewport;
  const ns = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
  const f = ns / v.scale;
  const px = cx - r.left, py = cy - r.top;
  v.x = px - (px - v.x) * f;
  v.y = py - (py - v.y) * f;
  v.scale = ns;
  applyViewport();
}

let anim = 0;
export function animateTo(target, ms = 420) {
  cancelAnimationFrame(anim);
  const from = { ...state.viewport };
  if (prefersReducedMotion() || ms <= 0) { Object.assign(state.viewport, target); applyViewport(); return Promise.resolve(); }
  const t0 = performance.now();
  return new Promise((resolve) => {
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const k = clamp((now - t0) / ms, 0, 1), e = ease(k);
      state.viewport.x = from.x + (target.x - from.x) * e;
      state.viewport.y = from.y + (target.y - from.y) * e;
      state.viewport.scale = from.scale + (target.scale - from.scale) * e;
      applyViewport(k === 1);
      if (k < 1) anim = requestAnimationFrame(step); else resolve();
    };
    anim = requestAnimationFrame(step);
  });
}

/** Viewport that fits a world rect inside the stage with a margin. */
export function fitRect(rect, { margin = 0.08, maxScale = 2 } = {}) {
  const r = stageRect();
  const w = rect.r - rect.l, h = rect.b - rect.t;
  const s = clamp(Math.min(r.width * (1 - margin * 2) / w, r.height * (1 - margin * 2) / h), MIN_SCALE, maxScale);
  return { scale: s, x: r.width / 2 - ((rect.l + rect.r) / 2) * s, y: r.height / 2 - ((rect.t + rect.b) / 2) * s };
}

// ---- Gestures ---------------------------------------------------------------
const OWNER = '[data-gesture-owner]';
const SCROLL = '[data-scroll]';

function bindGestures() {
  const ptrs = new Map();       // pointerId -> {x, y, target, type}
  let pan = null;               // single pointer pan {id, sx, sy, vx, vy, moved}
  let pinch = null;             // {d, cx, cy}
  let spaceDown = false;

  addEventListener('keydown', (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(e.target.tagName) && !e.target.isContentEditable) spaceDown = true; });
  addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

  const onEmpty = (t) => !t.closest('.obj, .ui, .group-handle, [data-ui]');

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-ui]')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, target: e.target, type: e.pointerType });
    // Two touches -> canvas pinch (unless a content element owns the gesture)
    if (ptrs.size === 2 && e.pointerType === 'touch') {
      const [a, b] = [...ptrs.values()];
      if (!a.target.closest?.(OWNER) && !b.target.closest?.(OWNER)) {
        pan = null; vp.panning = false;
        vp.pinching = true;
        bus.emit('gesture-cancel');
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        return;
      }
    }
    if (document.body.classList.contains('pen-active')) return;   // ink layer owns single pointers
    if (ptrs.size === 1) {
      const middle = e.button === 1 || (spaceDown && e.button === 0);
      if (onEmpty(e.target) || middle) {
        if (e.button > 1) return;
        pan = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: state.viewport.x, vy: state.viewport.y, moved: false };
        stage.setPointerCapture?.(e.pointerId);
        if (middle) e.preventDefault();
      }
    }
  }, true);

  stage.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const r = stageRect();
      const ns = clamp(state.viewport.scale * (d / pinch.d), MIN_SCALE, MAX_SCALE);
      const f = ns / state.viewport.scale;
      const v = state.viewport;
      // keep the previous centroid's world point under the new centroid (zoom + two-finger pan)
      v.x = (cx - r.left) - ((pinch.cx - r.left) - v.x) * f;
      v.y = (cy - r.top) - ((pinch.cy - r.top) - v.y) * f;
      v.scale = ns;
      pinch = { d, cx, cy };
      applyViewport(false);
      return;
    }
    if (pan && pan.id === e.pointerId) {
      const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
      if (!pan.moved && Math.hypot(dx, dy) < 4) return;
      if (!pan.moved) { pan.moved = true; vp.panning = true; document.body.classList.add('is-panning'); }
      state.viewport.x = pan.vx + dx; state.viewport.y = pan.vy + dy;
      applyViewport(false);
    }
  }, true);

  const end = (e) => {
    const had = ptrs.delete(e.pointerId);
    if (!had) return;
    if (pinch && ptrs.size < 2) { pinch = null; applyViewport(true); setTimeout(() => { vp.pinching = false; }, 60); }
    if (pan && pan.id === e.pointerId) {
      if (!pan.moved && e.type === 'pointerup' && onEmpty(e.target)) bus.emit('canvas-tap', e);
      if (pan.moved) applyViewport(true);
      pan = null; vp.panning = false; document.body.classList.remove('is-panning');
    }
  };
  stage.addEventListener('pointerup', end, true);
  stage.addEventListener('pointercancel', end, true);

  stage.addEventListener('wheel', (e) => {
    if (e.target.closest('[data-ui]')) return;
    const scroller = e.target.closest(SCROLL);
    if (e.ctrlKey || e.metaKey) {
      if (scroller?.dataset.scroll === 'zoomable') return;   // the content (PDF) zooms itself
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0022));
      return;
    }
    if (scroller) return;   // let content scroll
    e.preventDefault();
    panBy(-e.deltaX, -e.deltaY);
  }, { passive: false });

  // Safari trackpad pinch
  stage.addEventListener('gesturestart', (e) => e.preventDefault());
}
