// Pomodoro engine: the single source of truth for the timer. Uses absolute
// timestamps (endsAt) so it stays correct in background tabs and after reloads.
// The Pomodoro object, the wave animation and the ecosystem bridges only listen.
import { bus, debounce } from '../core/util.js';
import { state } from '../core/model.js';
import { loadSetting, saveSetting } from '../storage/settings-storage.js';

const persist = debounce(() => saveSetting('pomodoro-run', pomo.snapshot()), 300);

export const pomo = {
  status: 'idle',        // idle | running | paused
  phase: 'focus',        // focus | short | long
  endsAt: 0,
  remaining: 0,
  sessions: 0,           // completed focus sessions
  notice: '',            // transient label: 'Focus complete', 'Break complete', 'Skipped'
  timer: 0,
  noticeTimer: 0,

  get cfg() { return state.settings.pomodoro; },
  duration(phase = this.phase) { return (phase === 'focus' ? this.cfg.focus : phase === 'short' ? this.cfg.short : this.cfg.long) * 60000; },
  get left() { return this.status === 'running' ? Math.max(0, this.endsAt - Date.now()) : (this.remaining || this.duration()); },
  get label() {
    if (this.notice) return this.notice;
    if (this.status === 'paused') return 'Paused';
    return this.phase === 'focus' ? 'Focus' : 'Break';
  },
  get isBreak() { return this.phase !== 'focus'; },

  snapshot() { return { status: this.status, phase: this.phase, endsAt: this.endsAt, remaining: this.remaining, sessions: this.sessions }; },

  async restore() {
    const s = await loadSetting('pomodoro-run');
    if (s && ['idle', 'running', 'paused'].includes(s.status) && ['focus', 'short', 'long'].includes(s.phase)) {
      Object.assign(this, { status: s.status, phase: s.phase, endsAt: +s.endsAt || 0, remaining: +s.remaining || 0, sessions: +s.sessions || 0 });
      if (this.status === 'running') {
        if (this.endsAt > Date.now()) this.arm();
        else this.status = 'paused', this.remaining = 0, this.endsAt = 0, this.notice = '';   // it ended while the app was closed: don't fake events
      }
    }
    this.emit('restore');
  },

  emit(type) { bus.emit('pomo', { type, phase: this.phase, status: this.status, sessions: this.sessions }); persist(); },
  setNotice(text) {
    this.notice = text; clearTimeout(this.noticeTimer);
    if (text) this.noticeTimer = setTimeout(() => { this.notice = ''; bus.emit('pomo', { type: 'notice', phase: this.phase, status: this.status }); }, 4000);
  },

  arm() { clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 250); },
  disarm() { clearInterval(this.timer); this.timer = 0; },

  tick() {
    if (this.status !== 'running') return this.disarm();
    if (Date.now() >= this.endsAt) return this.complete();
    bus.emit('pomo-tick', this);
  },

  start() {
    if (this.status === 'running') return;
    if (this.status === 'paused') return this.resume();
    this.setNotice('');
    this.status = 'running';
    this.endsAt = Date.now() + this.duration();
    this.remaining = 0;
    this.arm(); this.emit('start');
  },
  pause() {
    if (this.status !== 'running') return;
    this.remaining = Math.max(0, this.endsAt - Date.now());
    this.status = 'paused'; this.disarm(); this.emit('pause');
  },
  resume() {
    if (this.status !== 'paused') return;
    this.status = 'running'; this.endsAt = Date.now() + (this.remaining || this.duration());
    this.arm(); this.emit('resume');
  },
  reset() {
    this.disarm(); this.status = 'idle'; this.remaining = 0; this.endsAt = 0; this.setNotice('');
    this.emit('reset');
  },
  skip() {
    const wasBreak = this.isBreak;
    this.disarm();
    this.phase = wasBreak ? 'focus' : this.nextBreak();
    this.status = 'idle'; this.remaining = 0; this.endsAt = 0;
    this.setNotice('Skipped');
    this.emit('skip');
  },
  nextBreak() { return (this.sessions > 0 && this.sessions % this.cfg.longEvery === 0) ? 'long' : 'short'; },

  complete() {
    this.disarm();
    if (this.phase === 'focus') {
      const minutes = this.cfg.focus;
      this.sessions += 1;
      this.phase = this.nextBreak();
      this.setNotice('Focus complete');
      this.emit('focusComplete');
      bus.emit('pomo-session', { minutes, sessions: this.sessions, at: Date.now() });
      if (this.cfg.autoBreak) {
        this.status = 'running'; this.endsAt = Date.now() + this.duration(); this.remaining = 0; this.arm();
        this.emit('breakStart');
      } else { this.status = 'idle'; this.remaining = 0; this.emit('breakReady'); }
    } else {
      this.phase = 'focus'; this.status = 'idle'; this.remaining = 0; this.endsAt = 0;
      this.setNotice('Break complete');
      this.emit('breakComplete');
    }
  },

  /** Called when a duration changes while idle so the display updates. */
  configChanged() {
    if (this.status === 'idle') this.remaining = 0;
    this.emit('config');
  },
  resetSessions() { this.sessions = 0; this.emit('sessions'); },
};
