// Global keyboard shortcuts. Never interferes with text fields or embedded media.
import { state } from './model.js';
import { isTextField, bus } from './util.js';
import { history } from './history.js';
import { closeMenu, isMenuOpen } from '../ui/menu.js';
import { selectObject, closeObject, instances } from '../workspace.js';
import { deleteWithUndo } from '../ui/context-menu.js';
import { toggleFocus, exitFocus } from '../tools/focus.js';
import { isPenOn, setPen } from '../tools/pen.js';

export function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const typing = isTextField(e.target);
    if (e.key === 'Escape') {
      if (isMenuOpen()) return;   // menu handles its own Escape
      if (document.querySelector('.dialog-scrim')) return;
      if (document.fullscreenElement) return;
      if (isPenOn()) { setPen(false); return; }
      if (state.focusedId) { exitFocus(); return; }
      if (typing) { e.target.blur(); return; }
      selectObject(null); return;
    }
    if (typing) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); history.redo(); return; }
    if (mod || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
      // Only when focus is on the object itself, not inside its controls
      e.preventDefault(); deleteWithUndo(state.selectedId); return;
    }
    if (e.key.toLowerCase() === 'f' && state.selectedId && !e.target.closest?.('.video-stage')) { e.preventDefault(); toggleFocus(state.selectedId); return; }
    if (e.key.startsWith('Arrow') && state.selectedId && e.target.classList?.contains('obj')) {
      const rec = state.objects.get(state.selectedId), step = e.shiftKey ? 40 : 8;
      if (!rec) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') rec.x -= step; if (e.key === 'ArrowRight') rec.x += step;
      if (e.key === 'ArrowUp') rec.y -= step; if (e.key === 'ArrowDown') rec.y += step;
      instances.get(rec.id)?.sync();
      import('../workspace.js').then((m) => m.commitGeometry(rec.id));
    }
  });
  void closeMenu; void closeObject; void bus;
}
