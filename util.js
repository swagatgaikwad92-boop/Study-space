// Small shared utilities: event bus, ids, DOM helpers, timing helpers.

export class Bus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { this.map.get(type)?.delete(fn); }
  emit(type, detail) {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(detail); } catch (err) { console.warn('[bus]', type, err); }
    }
  }
}

export const bus = new Bus();

export function uid(prefix = 'o') {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}${r[0].toString(36)}${r[1].toString(36)}`.slice(0, 28);
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') throw new Error('html attr is disabled; use text or svg helpers');
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const isTextField = (t) =>
  !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export const prefersReducedMotion = () => {
  const o = document.documentElement.dataset.motion;
  if (o === 'reduced') return true;
  if (o === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// ---- Icons: one coherent 24px stroke icon set (paths only, no external assets)
const ICONS = {
  plus: 'M12 5v14M5 12h14',
  tools: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.3-.6-.6-2.3z',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  focus: 'M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
  video: 'M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4zM17 10l4-2v8l-4-2',
  note: 'M5 4h14v11l-5 5H5zM14 20v-5h5',
  timer: 'M12 8v5l3 2M9 2h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  calc: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  pencil: 'M4 20l1-4 10-10 3 3L8 19zM13 8l3 3',
  eraser: 'M8 20h12M5 15l8-8 5 5-6 6H8z',
  undo: 'M9 14L4 9l5-5M4 9h9a7 7 0 0 1 0 14h-2',
  redo: 'M15 14l5-5-5-5M20 9h-9a7 7 0 0 0 0 14h2',
  play: 'M8 5v14l11-7z',
  pause: 'M8 5v14M16 5v14',
  back10: 'M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6M9.5 15.5v-3l-1 .5M13 12.5h2v3h-2z',
  fwd10: 'M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6M9.5 15.5v-3l-1 .5M13 12.5h2v3h-2z',
  volume: 'M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6',
  mute: 'M4 10v4h4l5 4V6L8 10zM17 9l4 6M21 9l-4 6',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  minus: 'M5 12h14',
  reset: 'M4 4v6h6M4.5 14a8 8 0 1 0 2-8.5L4 10',
  skip: 'M6 5v14l9-7zM18 5v14',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
  send: 'M4 12l16-8-6 16-3-7z',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  group: 'M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v4h-7zM4 15h7v5H4z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  text: 'M5 6h14M5 11h14M5 16h9',
  audio: 'M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  check: 'M5 12l5 5 9-10',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  clear: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
};

export function icon(name, size = 18) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ico');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] || ICONS.file);
  svg.appendChild(path);
  return svg;
}

export function iconButton(name, label, onclick, cls = '') {
  return el('button', { type: 'button', class: `ibtn ${cls}`, 'aria-label': label, title: label, onclick }, icon(name));
}
