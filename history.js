// Snapshot-based undo/redo. Snapshots hold object records (minus ephemeral
// `view` state such as PDF page or playback position), groups and ink strokes.
// Strokes are immutable once finished, so snapshots share references (cheap).
import { state } from './model.js';
import { bus } from './util.js';

const LIMIT = 60;
let past = [];     // earlier snapshots
let future = [];
let current = null;
let applying = false;
let applyFn = null;

function take() {
  const objects = [...state.objects.values()].map((o) => {
    const { view, ...rest } = o;
    return JSON.stringify(rest);
  });
  return { objects, groups: JSON.stringify(state.groups), strokes: state.strokes.slice() };
}

export const history = {
  /** Called by workspace once the initial state is loaded. */
  init(apply) { applyFn = apply; current = take(); past = []; future = []; bus.emit('history'); },
  /** Record a meaningful change (call AFTER mutating state). */
  commit() {
    if (applying || !applyFn) return;
    const next = take();
    if (current && next.objects.join() === current.objects.join() && next.groups === current.groups
      && next.strokes.length === current.strokes.length && next.strokes.every((s, i) => s === current.strokes[i])) return;
    past.push(current); if (past.length > LIMIT) past.shift();
    current = next; future = [];
    bus.emit('history');
  },
  undo() {
    if (!past.length) return false;
    future.push(current); current = past.pop();
    this._apply(); return true;
  },
  redo() {
    if (!future.length) return false;
    past.push(current); current = future.pop();
    this._apply(); return true;
  },
  _apply() {
    applying = true;
    try { applyFn(current); } finally { applying = false; }
    bus.emit('history');
  },
  canUndo: () => past.length > 0,
  canRedo: () => future.length > 0,
};
