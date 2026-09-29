// Plain-text object (.txt, .md, .csv). Read-only reading pane; shown as text, never as HTML.
import { ObjectBase } from './base.js';
import { el } from '../core/util.js';
import { getFileBlob } from '../storage/file-storage.js';

const LIMIT = 300_000;

export class TextObject extends ObjectBase {
  renderContent(c) {
    this.body = el('pre', { class: 'text-body', 'data-scroll': '', tabindex: '0' });
    c.append(this.body);
  }
  async load() {
    this.showLoading('Opening text…');
    try {
      const blob = await getFileBlob(this.rec.fileId);
      if (!blob) throw new Error('missing');
      const text = await blob.slice(0, LIMIT).text();
      this.excerpt = text;
      this.body.textContent = text + (blob.size > LIMIT ? '\n\n… (showing the first part of a large file)' : '');
      this.clearStatus();
    } catch { this.showError('This text file couldn’t be opened.'); }
  }
  get plainText() { return this.excerpt || ''; }
}
