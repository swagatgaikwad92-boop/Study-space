// Compact glass menus / popovers. One menu open at a time. Keyboard accessible.
import { el, icon, clamp } from '../core/util.js';

let current = null;

export function closeMenu() {
  if (!current) return;
  const { node, cleanup, onClose, prevFocus } = current;
  current = null;
  cleanup();
  node.classList.add('closing');
  setTimeout(() => node.remove(), 140);
  onClose?.();
  prevFocus?.focus?.({ preventScroll: true });
}
export const isMenuOpen = () => !!current;

/**
 * items: [{label, icon, onClick, disabled, danger, checked, hint} | {sep:true}]
 * position: {x, y} client point, or {anchor: Element, placement: 'above'|'below'}
 */
export function openMenu({ items, x = 0, y = 0, anchor, placement = 'below', onClose, label = 'Menu', className = '' }) {
  closeMenu();
  const prevFocus = document.activeElement;
  const node = el('div', { class: `menu glass strong ${className}`, role: 'menu', 'aria-label': label, 'data-ui': '' },
    items.filter(Boolean).map((it) => it.sep ? el('div', { class: 'menu-sep', role: 'separator' }) :
      el('button', {
        type: 'button', role: it.checked != null ? 'menuitemcheckbox' : 'menuitem', class: `menu-item${it.danger ? ' danger' : ''}`,
        'aria-checked': it.checked != null ? String(!!it.checked) : null, disabled: it.disabled || null,
        onclick: () => { closeMenu(); it.onClick?.(); },
      }, it.icon ? icon(it.icon, 17) : el('span', { class: 'ico-space' }),
        el('span', { class: 'menu-label', text: it.label }),
        it.checked ? icon('check', 15) : null,
        it.hint ? el('span', { class: 'menu-hint', text: it.hint }) : null)));
  document.getElementById('overlays').append(node);

  const r = node.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  let left = x, top = y;
  if (anchor) {
    const a = anchor.getBoundingClientRect();
    left = a.left + a.width / 2 - r.width / 2;
    top = placement === 'above' ? a.top - r.height - 10 : a.bottom + 10;
  } else { if (left + r.width > vw - 8) left = x - r.width; if (top + r.height > vh - 8) top = y - r.height; }
  node.style.left = `${clamp(left, 8, vw - r.width - 8)}px`;
  node.style.top = `${clamp(top, 8, vh - r.height - 8)}px`;
  node.dataset.origin = placement;

  const btns = () => [...node.querySelectorAll('.menu-item:not(:disabled)')];
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const b = btns(), i = b.indexOf(document.activeElement);
      b[(i + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length]?.focus();
    }
  };
  const onOutside = (e) => { if (!node.contains(e.target) && !anchor?.contains(e.target)) closeMenu(); };
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
  const cleanup = () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onOutside, true); };
  current = { node, cleanup, onClose, prevFocus };
  btns()[0]?.focus({ preventScroll: true });
  return node;
}
