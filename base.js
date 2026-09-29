// Reusable spatial object. Provides the glass frame, slim rail (grip + contextual
// actions), title chip, loading/error states and lifecycle. Subclasses only
// supply content.
import { TYPES, RAIL, PAD, zIndexFor } from '../core/model.js';
import { el, icon, iconButton, bus } from '../core/util.js';
import { save } from '../core/actions.js';

export class ObjectBase {
  constructor(rec) {
    this.rec = rec;
    this.id = rec.id;
    this.spec = TYPES[rec.type];
    this.disposers = [];
    this.build();
  }

  build() {
    const { rec } = this;
    this.rail = el('div', { class: 'obj-rail', 'data-drag': '' });
    this.gripEl = el('span', { class: 'obj-grip', 'aria-hidden': 'true' });
    this.titleEl = el('span', { class: 'obj-title' });
    this.actionsEl = el('div', { class: 'obj-actions' });
    this.rail.append(this.gripEl, this.titleEl, this.actionsEl);
    this.buildActions();

    this.content = el('div', { class: 'obj-content' });
    this.resizeEl = this.spec.fixed ? null : el('div', { class: 'obj-resize', 'data-resize': '', 'aria-hidden': 'true' });
    this.surface = el('div', { class: 'obj-surface glass' }, this.rail, this.content, this.resizeEl);
    this.el = el('div', {
      class: `obj obj-${rec.type}`,
      'data-id': rec.id,
      'data-type': rec.type,
      tabindex: '0',
      role: 'group',
      'aria-label': this.ariaLabel(),
    }, this.surface);
    this.el.style.setProperty('--rail', `${RAIL}px`);
    this.el.style.setProperty('--pad', `${PAD}px`);
    this.sync();
    try { this.renderContent(this.content); } catch (err) { console.warn('[object] render', err); this.showError('This item could not be displayed.'); }
  }

  ariaLabel() { return this.rec.title || this.spec.label; }

  buildActions() {
    this.actionsEl.replaceChildren(
      ...this.extraActions().map((a) => iconButton(a.icon, a.label, a.onClick)),
      iconButton('focus', 'Focus on this', () => bus.emit('object-action', { id: this.id, action: 'focus' })),
      iconButton('more', 'More actions', (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        bus.emit('object-menu', { id: this.id, x: r.right, y: r.bottom });
      }),
      iconButton('close', this.spec.hide ? 'Close' : 'Delete', () => bus.emit('object-action', { id: this.id, action: 'close' })),
    );
  }

  // ---- To override --------------------------------------------------------
  renderContent(/* container */) {}
  async load() {}
  extraActions() { return []; }
  contextItems() { return []; }
  onResize() {}
  onSelectionChange() {}
  onVisibilityChange() {}
  applyState() {}             // rec.state changed externally (undo/redo)
  destroy() { this.disposers.forEach((d) => d()); this.disposers = []; }

  // ---- Shared behaviour ---------------------------------------------------
  get contentSize() { return { w: this.rec.w - PAD * 2, h: this.rec.h - RAIL - PAD }; }

  sync() {
    const { rec, el: n } = this;
    if (!n) return;
    n.style.width = `${rec.w}px`;
    n.style.height = `${rec.h}px`;
    n.style.transform = `translate3d(${rec.x}px, ${rec.y}px, 0)`;
    n.style.zIndex = zIndexFor(rec);
    n.hidden = !rec.visible;
    const label = rec.title || '';
    this.titleEl.textContent = label;
    n.classList.toggle('has-title', !!label);
    n.classList.toggle('title-pinned', !!label && rec.titleVisible);
    n.setAttribute('aria-label', this.ariaLabel());
  }

  setSelected(sel) {
    this.el.classList.toggle('is-selected', sel);
    this.onSelectionChange(sel);
  }
  setDimmed(dim) { this.el.classList.toggle('is-dimmed', dim); }
  setFocused(f) { this.el.classList.toggle('is-focused', f); }

  save(undoable = false) { save(this.id, { undoable }); }

  showLoading(text = 'Opening…') {
    this.clearStatus();
    this.statusEl = el('div', { class: 'obj-status loading', role: 'status' },
      el('div', { class: 'skeleton' }), el('span', { text }));
    this.content.append(this.statusEl);
  }

  showError(message, actions = []) {
    this.clearStatus();
    this.statusEl = el('div', { class: 'obj-status error', role: 'alert' },
      icon('file', 26),
      el('p', { text: message }),
      actions.length ? el('div', { class: 'status-actions' }, actions.map((a) =>
        el('button', { type: 'button', class: 'btn', onclick: a.onClick }, a.label))) : null);
    this.content.append(this.statusEl);
    this.el.classList.add('has-error');
  }

  clearStatus() {
    this.statusEl?.remove(); this.statusEl = null;
    this.el.classList.remove('has-error');
  }
}
