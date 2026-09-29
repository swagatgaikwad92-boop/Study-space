// Tool 3: Focus. The selected object becomes visually dominant and the rest of
// the desk quietly recedes. Nothing is moved, hidden or deleted; only the view is
// adjusted (and restored exactly on exit).
import { state } from '../core/model.js';
import { bus } from '../core/util.js';
import { instances, selectObject } from '../workspace.js';
import { animateTo, fitRect, applyViewport } from '../canvas/viewport.js';

let saved = null;   // viewport before Focus, restored on exit

function apply(id) {
  state.focusedId = id;
  for (const [oid, inst] of instances) { inst.setDimmed(!!id && oid !== id); inst.setFocused(oid === id); }
  document.body.classList.toggle('focus-mode', !!id);
  bus.emit('focus-changed', id);
}

export function enterFocus(id) {
  const rec = state.objects.get(id);
  if (!rec || !instances.has(id)) return;
  if (!saved) saved = { ...state.viewport };
  apply(id);
  selectObject(id);
  const fit = fitRect({ l: rec.x, t: rec.y, r: rec.x + rec.w, b: rec.y + rec.h }, { margin: 0.05, maxScale: rec.type === 'pdf' || rec.type === 'video' ? 1.8 : 1.4 });
  animateTo(fit, 460);
}

export function exitFocus({ restore = true } = {}) {
  if (!state.focusedId && !saved) return;
  apply(null);
  if (restore && saved) animateTo(saved, 420);
  saved = null;
}

export function toggleFocus(id) {
  id = id || state.selectedId;
  if (!id) { bus.emit('toast', { text: 'Select something on your desk first.' }); return; }
  state.focusedId === id ? exitFocus() : enterFocus(id);
}

export function initFocus() {
  bus.on('focus-toggle', (id) => toggleFocus(id));
  bus.on('object-action', ({ id, action }) => { if (action === 'focus') toggleFocus(id); });
  bus.on('focus-exit', () => exitFocus());
  // Tapping another (dimmed) object moves Focus there instead of fighting it.
  bus.on('focus-switch', (id) => { enterFocus(id); });
  void applyViewport;
}
