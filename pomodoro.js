// Pomodoro object: movable glass timer. The engine (pomodoro/timer-state.js) owns
// the countdown; this is only the face. Only one exists, so there are never two
// conflicting timers.
import { ObjectBase } from './base.js';
import { el, icon, iconButton, fmtClock, bus, clamp } from '../core/util.js';
import { pomo } from '../pomodoro/timer-state.js';
import { setWaveOrigin } from '../pomodoro/wave-animation.js';
import { state } from '../core/model.js';
import { markWorkspace } from '../storage/autosave.js';
import { saveSetting } from '../storage/settings-storage.js';

export class PomodoroObject extends ObjectBase {
  renderContent(c) {
    this.timeEl = el('div', { class: 'pomo-time', role: 'timer', 'aria-live': 'off' });
    this.labelEl = el('div', { class: 'pomo-label', 'aria-live': 'polite' });
    this.dots = el('div', { class: 'pomo-dots', 'aria-hidden': 'true' });
    this.primary = el('button', { type: 'button', class: 'pomo-primary', onclick: () => this.primaryAction() });
    this.resetBtn = iconButton('reset', 'Reset timer', () => pomo.reset());
    this.skipBtn = iconButton('skip', 'Skip to next', () => pomo.skip());
    this.gearBtn = iconButton('gear', 'Timer settings', () => this.toggleSettings());
    this.settings = this.buildSettings();
    this.face = el('div', { class: 'pomo-face', 'data-drag': '' }, this.labelEl, this.timeEl, this.dots);
    c.append(this.face,
      el('div', { class: 'pomo-actions' }, this.resetBtn, this.primary, this.skipBtn),
      el('div', { class: 'pomo-foot' }, this.sessionEl = el('span', { class: 'pomo-sessions' }), this.gearBtn),
      this.settings);
    this.disposers.push(bus.on('pomo', () => this.render()), bus.on('pomo-tick', () => this.renderTime()));
    setWaveOrigin(() => {
      if (!this.el.isConnected || this.el.hidden) return null;
      const r = this.primary.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    this.render();
  }

  primaryAction() {
    if (pomo.status === 'running') pomo.pause();
    else if (pomo.status === 'paused') pomo.resume();
    else pomo.start();
  }

  renderTime() { this.timeEl.textContent = fmtClock(pomo.left); }

  render() {
    this.renderTime();
    this.labelEl.textContent = pomo.label;
    this.el.dataset.status = pomo.status;
    this.el.dataset.phase = pomo.isBreak ? 'break' : 'focus';
    const running = pomo.status === 'running', paused = pomo.status === 'paused';
    this.primary.replaceChildren(icon(running ? 'pause' : 'play', 20), el('span', { text: running ? 'Pause' : paused ? 'Resume' : 'Start' }));
    const n = pomo.cfg.longEvery;
    const done = pomo.sessions % n === 0 && pomo.sessions > 0 && pomo.phase === 'long' ? n : pomo.sessions % n;
    this.dots.replaceChildren(...Array.from({ length: n }, (_, i) => el('i', { class: i < done ? 'on' : '' })));
    this.sessionEl.textContent = pomo.sessions === 1 ? '1 session' : `${pomo.sessions} sessions`;
    const label = `${pomo.label}, ${fmtClock(pomo.left)}`;
    this.timeEl.setAttribute('aria-label', label);
  }

  buildSettings() {
    const mk = (key, label, min, max) => {
      const input = el('input', { type: 'number', inputmode: 'numeric', min, max, value: String(state.settings.pomodoro[key]), 'aria-label': `${label} minutes` });
      input.addEventListener('change', () => {
        const v = clamp(parseInt(input.value, 10) || state.settings.pomodoro[key], min, max);
        input.value = String(v); state.settings.pomodoro[key] = v;
        saveSetting('pomodoro-config', state.settings.pomodoro); markWorkspace(); pomo.configChanged();
      });
      return el('label', { class: 'field' }, el('span', { text: label }), input);
    };
    const auto = el('input', { type: 'checkbox' });
    auto.checked = state.settings.pomodoro.autoBreak;
    auto.addEventListener('change', () => { state.settings.pomodoro.autoBreak = auto.checked; saveSetting('pomodoro-config', state.settings.pomodoro); });
    return el('div', { class: 'pomo-settings', hidden: true },
      mk('focus', 'Focus', 1, 180), mk('short', 'Short break', 1, 60), mk('long', 'Long break', 1, 90), mk('longEvery', 'Long break every', 2, 12),
      el('label', { class: 'field check' }, auto, el('span', { text: 'Start breaks automatically' })),
      el('button', { type: 'button', class: 'btn subtle', onclick: () => pomo.resetSessions() }, 'Reset session count'));
  }

  toggleSettings() {
    this.settings.hidden = !this.settings.hidden;
    this.el.classList.toggle('settings-open', !this.settings.hidden);
    this.gearBtn.setAttribute('aria-expanded', String(!this.settings.hidden));
  }
}
