// DABSy window: a small floating companion. All text is rendered with
// textContent (never innerHTML). Sends data externally only when the student
// presses send, and only includes desk context if "Use my desk" is on.
import { ObjectBase } from './base.js';
import { el, icon, iconButton, bus } from '../core/util.js';
import { buildContext, contextToText } from '../dabsy/dabsy-context.js';
import { ask, isConfigured, getConfig, saveConfig, clearConfig, STYLES } from '../dabsy/dabsy-bridge.js';

const MIN_H = 46;

export class DabsyObject extends ObjectBase {
  renderContent(c) {
    this.log = el('div', { class: 'dabsy-log', 'data-scroll': '', role: 'log', 'aria-live': 'polite' });
    this.chips = el('div', { class: 'dabsy-chips' });
    this.desk = el('input', { type: 'checkbox' });
    this.desk.checked = this.rec.view.desk !== false;
    this.desk.addEventListener('change', () => { this.rec.view.desk = this.desk.checked; this.save(false); });
    this.input = el('textarea', { class: 'dabsy-input', rows: '1', placeholder: 'Ask about what you’re studying…', 'aria-label': 'Message DABSy', maxlength: '4000' });
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.send(); }
    });
    this.input.addEventListener('input', () => { this.input.style.height = 'auto'; this.input.style.height = `${Math.min(96, this.input.scrollHeight)}px`; });
    this.sendBtn = iconButton('send', 'Send', () => this.send(), 'send');
    this.chat = el('div', { class: 'dabsy-chat' },
      this.log, this.chips,
      el('div', { class: 'dabsy-composer' },
        el('label', { class: 'desk-toggle', title: 'Share what’s on your desk with this message' }, this.desk, el('span', { text: 'Use my desk' })),
        el('div', { class: 'row' }, this.input, this.sendBtn)));
    this.setup = this.buildSetup();
    this.body = el('div', { class: 'dabsy-body' }, this.chat, this.setup);
    c.append(this.body);
    this.messages = Array.isArray(this.rec.view.messages) ? this.rec.view.messages.slice(-30) : [];
    this.refresh();
    this.applyMin();
  }

  extraActions() {
    return [
      { icon: 'gear', label: 'DABSy settings', onClick: () => this.showSetup(!this.showingSetup) },
      { icon: 'minus', label: this.rec.state.minimized ? 'Restore' : 'Minimize', onClick: () => this.toggleMin() },
    ];
  }

  // Minimize collapses to just the rail; position and size are kept.
  toggleMin() {
    this.rec.state.minimized = !this.rec.state.minimized;
    this.applyMin(); this.save(true);
    this.buildActions();
  }
  applyMin() { this.el.classList.toggle('minimized', !!this.rec.state.minimized); this.sync(); }
  sync() {
    super.sync?.();
    if (this.el && this.rec.state.minimized) this.el.style.height = `${MIN_H}px`;
  }
  applyState() { this.applyMin(); this.buildActions(); }

  refresh() {
    this.showingSetup = !isConfigured();
    this.chat.hidden = this.showingSetup; this.setup.hidden = !this.showingSetup;
    this.renderLog();
    this.renderChips();
  }
  showSetup(on) { this.showingSetup = on; this.chat.hidden = on; this.setup.hidden = !on; if (on) this.fillSetup(); }

  renderChips() {
    const prompts = ['Explain what I’m studying', 'Quiz me on this', 'Summarise this'];
    this.chips.replaceChildren(...(this.messages.length ? [] : prompts.map((p) =>
      el('button', { type: 'button', class: 'chip', onclick: () => { this.input.value = p; this.send(); } }, p))));
  }

  renderLog() {
    if (!this.messages.length) {
      this.log.replaceChildren(el('p', { class: 'dabsy-hint', text: 'I can explain, quiz you and answer doubts, using what’s on your desk if you let me.' }));
      return;
    }
    this.log.replaceChildren(...this.messages.map((m) => el('div', { class: `msg ${m.role}` }, el('p', { text: m.content }))));
    this.log.scrollTop = this.log.scrollHeight;
  }

  async send() {
    const text = this.input.value.trim();
    if (!text || this.busy) return;
    this.busy = true; this.sendBtn.disabled = true;
    this.input.value = ''; this.input.style.height = 'auto';
    this.messages.push({ role: 'user', content: text });
    this.renderLog(); this.renderChips();
    const pending = el('div', { class: 'msg assistant pending' }, el('p', { text: 'Thinking…' }));
    this.log.append(pending); this.log.scrollTop = this.log.scrollHeight;
    this.abort = new AbortController();
    try {
      let context = null;
      if (this.desk.checked) context = contextToText(await buildContext({ includeText: true }));
      const reply = await ask(this.messages.slice(-12), context, this.abort.signal);
      this.messages.push({ role: 'assistant', content: reply });
    } catch (err) {
      if (err.name !== 'AbortError') this.messages.push({ role: 'assistant', content: err.message === 'not-configured' ? 'DABSy isn’t set up yet. Open settings to connect it.' : err.message, error: true });
    } finally {
      this.busy = false; this.sendBtn.disabled = false;
      this.rec.view.messages = this.messages.slice(-30); this.save(false);
      this.renderLog();
    }
  }

  buildSetup() {
    this.f = {
      style: el('select', { 'aria-label': 'Provider' }, Object.entries(STYLES).map(([k, v]) => el('option', { value: k }, v.label))),
      endpoint: el('input', { type: 'url', placeholder: 'https://…', autocomplete: 'off', 'aria-label': 'Endpoint URL' }),
      model: el('input', { type: 'text', placeholder: 'Model name', autocomplete: 'off', 'aria-label': 'Model' }),
      key: el('input', { type: 'password', placeholder: 'API key (optional with a proxy)', autocomplete: 'off', 'aria-label': 'API key' }),
    };
    this.f.style.addEventListener('change', () => { this.f.endpoint.value = STYLES[this.f.style.value].endpoint; });
    this.setupMsg = el('p', { class: 'setup-msg', role: 'status' });
    for (const i of Object.values(this.f)) i.addEventListener('keydown', (e) => e.stopPropagation());
    return el('form', { class: 'dabsy-setup', onsubmit: (e) => { e.preventDefault(); this.saveSetup(); } },
      el('h3', { text: 'Connect DABSy' }),
      el('p', { class: 'muted', text: 'Add an AI service to chat about your material. Your key stays on this device and is only used when you press send.' }),
      el('label', { class: 'field' }, el('span', { text: 'Provider' }), this.f.style),
      el('label', { class: 'field' }, el('span', { text: 'Endpoint' }), this.f.endpoint),
      el('label', { class: 'field' }, el('span', { text: 'Model' }), this.f.model),
      el('label', { class: 'field' }, el('span', { text: 'API key' }), this.f.key),
      this.setupMsg,
      el('div', { class: 'status-actions' },
        el('button', { type: 'submit', class: 'btn primary' }, 'Save'),
        isConfigured() ? el('button', { type: 'button', class: 'btn subtle', onclick: () => this.forget() }, 'Remove key') : null,
        isConfigured() ? el('button', { type: 'button', class: 'btn subtle', onclick: () => this.showSetup(false) }, 'Back') : null));
  }
  fillSetup() {
    const c = getConfig();
    this.f.style.value = c?.style || 'anthropic';
    this.f.endpoint.value = c?.endpoint || STYLES[this.f.style.value].endpoint;
    this.f.model.value = c?.model || ''; this.f.key.value = c?.apiKey || '';
  }
  async saveSetup() {
    try {
      await saveConfig({ style: this.f.style.value, endpoint: this.f.endpoint.value, model: this.f.model.value, apiKey: this.f.key.value });
      this.setupMsg.textContent = ''; this.setup.replaceWith(this.setup = this.buildSetup()); this.body.append(this.setup); this.refresh();
      bus.emit('toast', { text: 'DABSy is connected.' });
    } catch (err) { this.setupMsg.textContent = err.message; }
  }
  async forget() { await clearConfig(); this.setup.replaceWith(this.setup = this.buildSetup()); this.body.append(this.setup); this.refresh(); this.fillSetup(); }

  onSelectionChange() {}
  destroy() { this.abort?.abort(); super.destroy(); }
}
