// Small glass status messages. No giant banners, never blocking.
import { bus, el } from '../core/util.js';

const live = new Map();

export function initToasts(host) {
  bus.on('toast', ({ id, text, action, sticky, ms = 4200 }) => {
    if (id && live.has(id)) dismiss(id);
    const node = el('div', { class: 'toast glass strong', role: 'status' }, el('span', { text }),
      action ? el('button', { type: 'button', class: 'toast-action', onclick: () => { action.onClick(); dismiss(key); } }, action.label) : null);
    const key = id || Math.random().toString(36).slice(2);
    live.set(key, node);
    host.append(node);
    if (!sticky) setTimeout(() => dismiss(key), ms);
    while (host.children.length > 3) dismiss([...live.keys()][0]);
  });
  bus.on('toast-dismiss', dismiss);
}

function dismiss(key) {
  const n = live.get(key);
  if (!n) return;
  live.delete(key);
  n.classList.add('leaving');
  setTimeout(() => n.remove(), 200);
}
