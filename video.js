// Video object: a real, playable YouTube embed with custom quiet controls.
// Never autoplays. If embedding is blocked/unavailable we say so and offer an
// external link instead of faking playback.
import { ObjectBase } from './base.js';
import { el, icon, iconButton, fmtClock, clamp, bus } from '../core/util.js';
import { loadYouTubeApi, watchUrl } from './youtube.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox';

export class VideoObject extends ObjectBase {
  renderContent(c) {
    this.stageEl = el('div', { class: 'video-stage', tabindex: '0', 'aria-label': 'Video player. Space plays or pauses, arrow keys skip 10 seconds.' });
    this.mount = el('div', { class: 'video-mount' });
    // Tap zones sit above the (cross-origin) iframe so touch gestures are ours.
    this.zoneL = el('div', { class: 'video-zone left' });
    this.zoneC = el('div', { class: 'video-zone center' });
    this.zoneR = el('div', { class: 'video-zone right' });
    this.flash = el('div', { class: 'video-flash', 'aria-hidden': 'true' });

    this.playBtn = iconButton('play', 'Play', () => this.toggle());
    this.seek = el('input', { type: 'range', class: 'seek', min: '0', max: '1000', value: '0', 'aria-label': 'Seek' });
    this.time = el('span', { class: 'time', text: '0:00' });
    this.muteBtn = iconButton('volume', 'Mute', () => this.toggleMute());
    this.vol = el('input', { type: 'range', class: 'vol', min: '0', max: '100', value: '100', 'aria-label': 'Volume' });
    this.fsBtn = document.fullscreenEnabled ? iconButton('full', 'Fullscreen', () => this.fullscreen()) : null;
    this.bar = el('div', { class: 'content-controls video-controls' },
      iconButton('back10', 'Back 10 seconds', () => this.skip(-10)),
      this.playBtn,
      iconButton('fwd10', 'Forward 10 seconds', () => this.skip(10)),
      this.seek, this.time, this.muteBtn, this.vol, this.fsBtn);
    this.stageEl.append(this.mount, this.zoneL, this.zoneC, this.zoneR, this.flash, this.bar);
    c.append(this.stageEl);
    this.bindControls();
  }

  async load() {
    const id = this.rec.meta.videoId;
    if (!id) return this.fallback('This video link is not valid.');
    this.showLoading('Loading video…');
    let YT;
    try { YT = await loadYouTubeApi(); } catch (err) {
      return this.fallback(err.message === 'offline' || !navigator.onLine
        ? 'Videos need an internet connection. Everything else works offline.'
        : 'The YouTube player couldn’t be loaded.');
    }
    if (this.destroyed) return;
    const start = Math.floor(this.rec.view.time || this.rec.meta.start || 0);
    const iframe = document.createElement('iframe');
    const p = new URLSearchParams({ enablejsapi: '1', controls: '0', rel: '0', modestbranding: '1', playsinline: '1',
      fs: '0', disablekb: '1', iv_load_policy: '3', origin: location.origin });
    if (start) p.set('start', String(start));
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?${p}`;
    iframe.title = this.rec.title || 'Video';
    iframe.setAttribute('sandbox', SANDBOX);
    iframe.setAttribute('allow', 'encrypted-media; picture-in-picture');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.loading = 'lazy';
    this.mount.replaceChildren(iframe);
    this.iframe = iframe;
    this.ready = false;
    this.readyTimer = setTimeout(() => { if (!this.ready) this.fallback('This video didn’t respond. It may block embedding.'); }, 12000);
    this.player = new YT.Player(iframe, {
      events: {
        onReady: () => this.onReady(),
        onStateChange: (e) => this.onState(e.data),
        onError: (e) => this.onError(e.data),
      },
    });
  }

  onReady() {
    if (this.destroyed) return;
    this.ready = true; clearTimeout(this.readyTimer);
    this.clearStatus();
    const v = this.rec.view.volume ?? 100;
    try {
      this.player.setVolume(v);
      if (this.rec.view.muted) this.player.mute();
      const d = this.player.getVideoData?.();
      if (d?.title && d.title !== this.rec.meta.filename) {
        this.rec.meta.filename = d.title; this.save(false);
        bus.emit('object-meta', { id: this.id });   // lets smart grouping look at the title
      }
    } catch { /* ignore */ }
    this.vol.value = String(v);
    this.updateMute();
    this.tick();
  }

  onState(s) {
    const YTS = window.YT?.PlayerState || {};
    this.playing = s === YTS.PLAYING;
    this.playBtn.replaceChildren(icon(this.playing ? 'pause' : 'play'));
    this.playBtn.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    this.el.classList.toggle('is-playing', this.playing);
    if (this.playing) this.startPoll(); else { this.stopPoll(); this.tick(); this.persistTime(); }
    this.wakeControls();
  }

  onError(code) {
    const blocked = [101, 150].includes(code);
    this.fallback(blocked ? 'The owner of this video doesn’t allow it to be played here.'
      : [2, 5].includes(code) ? 'This video link couldn’t be played.' : 'This video is unavailable.');
  }

  fallback(message) {
    clearTimeout(this.readyTimer);
    this.stopPoll();
    this.mount.replaceChildren();
    this.bar.hidden = true;
    [this.zoneL, this.zoneC, this.zoneR].forEach((z) => { z.hidden = true; });
    this.showError(message, [
      { label: 'Open on YouTube', onClick: () => window.open(watchUrl(this.rec.meta.videoId, this.rec.view.time), '_blank', 'noopener,noreferrer') },
      { label: 'Try again', onClick: () => this.retry() },
    ]);
  }

  retry() {
    this.bar.hidden = false;
    [this.zoneL, this.zoneC, this.zoneR].forEach((z) => { z.hidden = false; });
    this.clearStatus(); this.load();
  }

  // ---- Playback -------------------------------------------------------------
  get canControl() { return this.ready && this.player; }
  toggle() {
    if (!this.canControl) return;
    try { this.playing ? this.player.pauseVideo() : this.player.playVideo(); } catch { /* ignore */ }
  }
  skip(sec) {
    if (!this.canControl) return;
    try {
      const dur = this.player.getDuration() || Infinity;
      this.player.seekTo(clamp(this.player.getCurrentTime() + sec, 0, dur), true);
      this.showFlash(sec < 0 ? `−${-sec}s` : `+${sec}s`, sec < 0 ? 'left' : 'right');
      setTimeout(() => this.tick(), 120);
    } catch { /* ignore */ }
  }
  toggleMute() {
    if (!this.canControl) return;
    try {
      const m = this.player.isMuted(); m ? this.player.unMute() : this.player.mute();
      this.rec.view.muted = !m; this.updateMute(); this.save(false);
    } catch { /* ignore */ }
  }
  updateMute() {
    const muted = !!this.rec.view.muted || Number(this.vol.value) === 0;
    this.muteBtn.replaceChildren(icon(muted ? 'mute' : 'volume'));
    this.muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  }
  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else this.stageEl.requestFullscreen?.().catch(() => {});
  }

  startPoll() { this.stopPoll(); this.poll = setInterval(() => this.tick(), 500); }
  stopPoll() { clearInterval(this.poll); this.poll = 0; }
  tick() {
    if (!this.canControl) return;
    try {
      const cur = this.player.getCurrentTime() || 0, dur = this.player.getDuration() || 0;
      if (!this.scrubbing) this.seek.value = dur ? String(Math.round((cur / dur) * 1000)) : '0';
      this.time.textContent = `${fmtClock(cur * 1000).replace(/^0/, '')}${dur ? ` / ${fmtClock(dur * 1000).replace(/^0/, '')}` : ''}`;
      this.rec.view.time = cur;
    } catch { /* ignore */ }
  }
  persistTime() { this.save(false); }

  // ---- Interaction ----------------------------------------------------------
  bindControls() {
    this.seek.addEventListener('input', () => { this.scrubbing = true; });
    this.seek.addEventListener('change', () => {
      this.scrubbing = false;
      if (!this.canControl) return;
      try { this.player.seekTo((Number(this.seek.value) / 1000) * (this.player.getDuration() || 0), true); } catch { /* ignore */ }
      setTimeout(() => this.tick(), 150);
    });
    this.vol.addEventListener('input', () => {
      if (!this.canControl) return;
      const v = Number(this.vol.value);
      try { this.player.setVolume(v); if (v > 0 && this.player.isMuted()) { this.player.unMute(); this.rec.view.muted = false; } } catch { /* ignore */ }
      this.rec.view.volume = v; this.updateMute(); this.save(false);
    });

    // Single tap = play/pause (after a beat, so a double tap can win); double tap sides = ±10 s.
    let lastTap = 0, lastSide = '', timer = 0;
    const tap = (side) => {
      const now = Date.now();
      clearTimeout(timer);
      if (side !== 'center' && now - lastTap < 320 && lastSide === side) {
        lastTap = 0; this.skip(side === 'left' ? -10 : 10); this.wakeControls(); return;
      }
      lastTap = now; lastSide = side;
      timer = setTimeout(() => { this.wakeControls(); this.toggle(); }, side === 'center' ? 0 : 260);
    };
    for (const [z, side] of [[this.zoneL, 'left'], [this.zoneC, 'center'], [this.zoneR, 'right']]) {
      z.addEventListener('click', () => tap(side));
    }
    this.stageEl.addEventListener('pointermove', () => this.wakeControls());
    this.stageEl.addEventListener('focusin', () => this.wakeControls());
    this.stageEl.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === ' ' || e.key.toLowerCase() === 'k') { e.preventDefault(); this.toggle(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.skip(-10); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.skip(10); }
      else if (e.key.toLowerCase() === 'm') this.toggleMute();
      else if (e.key.toLowerCase() === 'f') this.fullscreen();
      this.wakeControls();
    });
  }

  wakeControls() {
    this.stageEl.classList.add('controls-awake');
    clearTimeout(this.sleepT);
    this.sleepT = setTimeout(() => { if (this.playing) this.stageEl.classList.remove('controls-awake'); }, 2600);
  }

  showFlash(text, side) {
    this.flash.textContent = text; this.flash.dataset.side = side;
    this.flash.classList.remove('go'); void this.flash.offsetWidth; this.flash.classList.add('go');
  }

  onVisibilityChange(v) { if (!v && this.playing) { try { this.player.pauseVideo(); } catch { /* ignore */ } } }

  contextItems() {
    return [{ label: 'Open on YouTube', icon: 'external', onClick: () => window.open(watchUrl(this.rec.meta.videoId, this.rec.view.time), '_blank', 'noopener,noreferrer') }];
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.readyTimer); clearTimeout(this.sleepT); this.stopPoll();
    try { this.player?.destroy?.(); } catch { /* ignore */ }
    super.destroy();
  }
}
