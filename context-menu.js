// Compact contextual actions for an object (right-click, long-press, or the ⋯ button).
import { bus } from '../core/util.js';
import { state, TYPES } from '../core/model.js';
import { openMenu } from './menu.js';
import { instances, closeObject, removeObject, duplicateObject, reorder, resetSize, toggleTitleVisible, renameObject, selectObject } from '../workspace.js';
import { groupOf, ungroup } from './groups.js';

export function initContextMenu() {
  bus.on('object-menu', ({ id, x, y }) => {
    const rec = state.objects.get(id), inst = instances.get(id);
    if (!rec || !inst) return;
    const spec = TYPES[rec.type];
    selectObject(id);
    const items = [
      { label: 'Rename', icon: 'text', onClick: () => bus.emit('prompt', { title: 'Rename', value: rec.title, placeholder: 'Name (optional)', onSubmit: (v) => renameObject(id, v) }) },
      rec.title ? { label: rec.titleVisible ? 'Hide name' : 'Always show name', icon: 'eye', onClick: () => toggleTitleVisible(id) } : null,
      { label: 'Focus', icon: 'focus', onClick: () => bus.emit('focus-toggle', id), hint: 'F' },
      ...inst.contextItems(),
      { sep: true },
      spec.single ? null : { label: 'Duplicate', icon: 'copy', onClick: () => duplicateObject(id) },
      { label: 'Bring forward', icon: 'up', onClick: () => reorder(id, 1) },
      { label: 'Send backward', icon: 'down', onClick: () => reorder(id, -1) },
      spec.fixed ? null : { label: 'Reset size', icon: 'full', onClick: () => resetSize(id) },
      groupOf(id) ? { label: 'Ungroup', icon: 'group', onClick: () => ungroup(groupOf(id).id) } : null,
      { sep: true },
      spec.hide ? { label: 'Close', icon: 'close', onClick: () => closeObject(id) } : null,
      { label: 'Delete', icon: 'trash', danger: true, hint: 'Del', onClick: () => deleteWithUndo(id) },
    ];
    openMenu({ items, x, y, label: `${spec.label} actions` });
  });
}

export function deleteWithUndo(id) {
  removeObject(id);
  bus.emit('toast', { text: 'Removed from your desk.', action: { label: 'Undo', onClick: () => import('../core/history.js').then((m) => m.history.undo()) } });
}
