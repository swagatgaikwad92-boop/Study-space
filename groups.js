// Optional smart grouping. Study Space may *offer* to group related material; it
// never groups without permission. A group is a soft halo + handle: members stay
// fully independent objects (move, resize, close on their own).
import { state } from '../core/model.js';
import { bus, el, icon, uid } from '../core/util.js';
import { history } from '../core/history.js';
import { markObject, markWorkspace } from '../storage/autosave.js';
import { instances } from '../workspace.js';

let host, raf = 0;
const dismissed = new Set();
const STOP = new Set(['lecture', 'lectures', 'notes', 'chapter', 'class', 'video', 'image', 'photo', 'screenshot', 'page', 'pages', 'part', 'final', 'copy', 'scan', 'new', 'with', 'from', 'this', 'that', 'lesson', 'unit', 'book', 'file', 'document', 'question', 'questions', 'paper', 'sheet', 'formula', 'formulas', 'diagram', 'full', 'course']);

export const groupOf = (id) => state.groups.find((g) => g.members.includes(id));

export function createGroup(ids) {
  const existing = ids.map(groupOf).find(Boolean);
  if (existing) { for (const id of ids) if (!existing.members.includes(id)) existing.members.push(id); }
  else state.groups.push({ id: uid('g'), members: [...ids] });
  markWorkspace(); history.commit(); render();
}
export function ungroup(gid) {
  state.groups = state.groups.filter((g) => g.id !== gid);
  markWorkspace(); history.commit(); render();
}

function tokens(rec) {
  const name = `${rec.title || ''} ${rec.meta.filename || ''}`.toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '');
  return new Set((name.match(/[a-z\u00c0-\u024f]{4,}/g) || []).filter((t) => !STOP.has(t) && !/^img|^screenshot|^photo/.test(t)));
}

export function suggestFor(rec) {
  if (!rec?.visible || ['note', 'calculator', 'pomodoro', 'dabsy', 'solvecount', 'audio'].includes(rec.type)) return;
  const mine = tokens(rec);
  if (!mine.size) return;
  for (const other of state.objects.values()) {
    if (other.id === rec.id || !other.visible || ['note', 'calculator', 'pomodoro', 'dabsy', 'solvecount'].includes(other.type)) continue;
    const g = groupOf(rec.id);
    if (g && g.members.includes(other.id)) continue;
    const key = [rec.id, other.id].sort().join('|');
    if (dismissed.has(key)) continue;
    const shared = [...tokens(other)].find((t) => mine.has(t));
    if (!shared) continue;
    dismissed.add(key);   // ask once per pair
    bus.emit('toast', {
      text: 'These look related. Group them?', ms: 9000,
      action: { label: 'Group', onClick: () => createGroup([rec.id, other.id, ...(groupOf(other.id)?.members || [])]) },
    });
    return;
  }
}

function bbox(g) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity, n = 0;
  for (const id of g.members) {
    const o = state.objects.get(id);
    if (!o || !o.visible) continue;
    n++; l = Math.min(l, o.x); t = Math.min(t, o.y); r = Math.max(r, o.x + o.w); b = Math.max(b, o.y + o.h);
  }
  return n > 1 ? { l: l - 22, t: t - 22, r: r + 22, b: b + 22 } : null;
}

function render() {
  raf = 0;
  const seen = new Set();
  for (const g of state.groups) {
    const bb = bbox(g);
    let node = host.querySelector(`[data-gid="${g.id}"]`);
    if (!bb) { node?.remove(); continue; }
    seen.add(g.id);
    if (!node) {
      node = el('div', { class: 'group', 'data-gid': g.id },
        el('button', { type: 'button', class: 'group-handle glass', 'aria-label': 'Move group (drag). Press Enter to ungroup.', title: 'Drag to move the group', onkeydown: (e) => { if (e.key === 'Enter') ungroup(g.id); } }, icon('group', 15)));
      bindHandle(node.firstChild, g);
      host.append(node);
    }
    node.style.transform = `translate3d(${bb.l}px, ${bb.t}px, 0)`;
    node.style.width = `${bb.r - bb.l}px`; node.style.height = `${bb.b - bb.t}px`;
  }
  host.querySelectorAll('.group').forEach((n) => { if (!seen.has(n.dataset.gid)) n.remove(); });
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };

function bindHandle(handle, g) {
  let d = null;
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    d = { sx: e.clientX, sy: e.clientY, starts: g.members.map((id) => { const o = state.objects.get(id); return o && o.visible ? [o, o.x, o.y] : null; }).filter(Boolean) };
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!d) return;
    const s = state.viewport.scale;
    for (const [o, x, y] of d.starts) { o.x = x + (e.clientX - d.sx) / s; o.y = y + (e.clientY - d.sy) / s; instances.get(o.id)?.sync(); }
    schedule();
  });
  const end = () => {
    if (!d) return;
    if (d.starts.some(([o, x, y]) => o.x !== x || o.y !== y)) { d.starts.forEach(([o]) => markObject(o.id)); history.commit(); }
    d = null;
  };
  handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
}

export function initGroups(el_) {
  host = el_;
  for (const ev of ['groups-changed', 'object-changed', 'object-moving', 'closed-changed', 'object-created', 'workspace-ready']) bus.on(ev, schedule);
  bus.on('object-created', (rec) => setTimeout(() => suggestFor(rec), 700));
  bus.on('object-meta', ({ id }) => setTimeout(() => suggestFor(state.objects.get(id)), 400));
}
