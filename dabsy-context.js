// Builds a compact description of what is on the desk. It is only ever *read*
// when the student presses send with "Use my desk" on; nothing is sent from here.
import { state, TYPES } from '../core/model.js';

let resolver = () => null;
export function setInstanceResolver(fn) { resolver = fn; }

export async function buildContext({ includeText = true } = {}) {
  const items = [];
  const objs = [...state.objects.values()].filter((o) => o.visible && !['dabsy', 'pomodoro', 'solvecount', 'calculator'].includes(o.type));
  for (const o of objs.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const inst = resolver(o.id);
    const item = { kind: TYPES[o.type].label, name: o.title || o.meta.filename || '' };
    if (o.type === 'pdf') {
      item.page = o.view.page || 1;
      if (includeText && inst?.currentPageText) item.pageText = await inst.currentPageText(3500);
    } else if (o.type === 'video') {
      item.videoTitle = o.meta.filename || '';
      item.position = `${Math.floor((o.view.time || 0) / 60)}m${Math.floor((o.view.time || 0) % 60)}s`;
    } else if (o.type === 'note') {
      item.text = (o.state.text || '').slice(0, 1200);
    } else if (o.type === 'text' && includeText) {
      item.text = (inst?.plainText || '').slice(0, 3000);
    } else if (o.type === 'image') {
      item.note = 'An image is on the desk (its pixels are not shared).';
    }
    items.push(item);
  }
  return items;
}

export function contextToText(items) {
  if (!items.length) return 'The student\'s desk is currently empty.';
  return items.map((it, i) => {
    const lines = [`${i + 1}. ${it.kind}${it.name ? ` "${it.name}"` : ''}`];
    if (it.page) lines.push(`   Currently on page ${it.page}.`);
    if (it.pageText) lines.push(`   Page text: ${it.pageText}`);
    if (it.videoTitle) lines.push(`   Video: ${it.videoTitle} (paused/at ${it.position}).`);
    if (it.text) lines.push(`   Text: ${it.text}`);
    if (it.note) lines.push(`   ${it.note}`);
    return lines.join('\n');
  }).join('\n');
}
