// Sticky note: lightweight glass note. Text is a plain <textarea> (no HTML), so
// nothing user-typed is ever interpreted as markup.
import { ObjectBase } from './base.js';
import { el, debounce } from '../core/util.js';

export const NOTE_COLORS = ['butter', 'blush', 'sage', 'sky', 'lilac'];

export class NoteObject extends ObjectBase {
  renderContent(c) {
    this.ta = el('textarea', { class: 'note-text', placeholder: 'Write a doubt, a formula, a reminder…', 'aria-label': 'Note text', spellcheck: 'true', maxlength: '20000', 'data-scroll': '' });
    this.ta.value = this.rec.state.text || '';
    const commit = debounce(() => { this.rec.state.text = this.ta.value; this.save(true); }, 400);
    this.ta.addEventListener('input', commit);
    this.ta.addEventListener('blur', () => commit.flush());
    c.append(this.ta);
    this.applyColor();
    if (this.rec.meta.justCreated) { delete this.rec.meta.justCreated; setTimeout(() => this.ta.focus({ preventScroll: true }), 260); }
  }
  applyColor() { this.el.dataset.color = this.rec.state.color || 'butter'; }
  cycleColor() {
    const i = NOTE_COLORS.indexOf(this.rec.state.color || 'butter');
    this.rec.state.color = NOTE_COLORS[(i + 1) % NOTE_COLORS.length];
    this.applyColor(); this.save(true);
  }
  applyState() { this.ta.value = this.rec.state.text || ''; this.applyColor(); }
  extraActions() { return [{ icon: 'layers', label: 'Change colour', onClick: () => this.cycleColor() }]; }
  contextItems() { return [{ label: 'Change colour', icon: 'layers', onClick: () => this.cycleColor() }]; }
  get plainText() { return this.rec.state.text || ''; }
}
