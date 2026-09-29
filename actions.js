// Tiny helpers so object classes can persist / record history without importing
// the whole workspace module (avoids circular imports).
import { markObject } from '../storage/autosave.js';
import { history } from './history.js';
import { debounce } from './util.js';

const pushHistory = debounce(() => history.commit(), 350);

/** Persist one object (debounced batch) and optionally record an undo step. */
export function save(id, { undoable = false } = {}) {
  markObject(id);
  if (undoable) pushHistory();
}
export const commitNow = () => history.commit();
