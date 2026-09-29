// Fallback object: unsupported files, and items that could not be restored.
// Shows file type, name, size and a sensible action instead of breaking the desk.
import { ObjectBase } from './base.js';
import { el, icon, formatBytes, bus } from '../core/util.js';
import { getFileBlob } from '../storage/file-storage.js';

export class FallbackObject extends ObjectBase {
  renderContent(c) {
    const m = this.rec.meta;
    const ext = (m.filename || '').split('.').pop()?.toUpperCase().slice(0, 5) || 'FILE';
    const broken = !!m.error;
    const actions = [];
    if (this.rec.fileId) actions.push(el('button', { type: 'button', class: 'btn', onclick: () => this.download() }, 'Save a copy'));
    actions.push(el('button', { type: 'button', class: 'btn subtle', onclick: () => bus.emit('object-action', { id: this.id, action: 'delete' }) }, 'Remove'));
    c.append(el('div', { class: 'fallback', 'data-drag': '' },
      el('div', { class: 'fallback-badge' }, icon('file', 24), el('span', { text: broken ? '!' : ext })),
      el('div', { class: 'fallback-name', text: m.filename || 'Unknown item' }),
      el('div', { class: 'fallback-meta', text: [m.mime, m.size ? formatBytes(m.size) : ''].filter(Boolean).join(' · ') }),
      el('p', { class: 'fallback-note', text: broken ? m.error : 'This file type can’t be previewed in Study Space yet. It stays on your desk so you can keep it with the rest of your material.' }),
      el('div', { class: 'status-actions' }, actions)));
  }
  async download() {
    const blob = await getFileBlob(this.rec.fileId);
    if (!blob) return bus.emit('toast', { text: 'The stored copy is missing.' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = this.rec.meta.filename || 'file'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}
