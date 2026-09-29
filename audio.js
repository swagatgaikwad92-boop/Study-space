// Audio / voice recording object: small glass player. Never autoplays.
import { ObjectBase } from './base.js';
import { el, icon, iconButton, fmtClock } from '../core/util.js';
import { getFileBlob } from '../storage/file-storage.js';

export class AudioObject extends ObjectBase {
  renderContent(c) {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.playBtn = iconButton('play', 'Play', () => this.toggle(), 'big');
    this.seek = el('input', { type: 'range', class: 'seek', min: '0', max: '1000', value: '0', 'aria-label': 'Seek' });
    this.time = el('span', { class: 'time', text: '0:00' });
    this.vol = el('input', { type: 'range', class: 'vol', min: '0', max: '100', value: '100', 'aria-label': 'Volume' });
    this.name = el('div', { class: 'audio-name' });
    c.append(el('div', { class: 'audio-body', 'data-drag': '' },
      this.name,
      el('div', { class: 'audio-row' }, this.playBtn, this.seek, this.time),
      el('div', { class: 'audio-row small' }, icon('volume', 16), this.vol)));
    const a = this.audio;
    a.addEventListener('timeupdate', () => this.tick());
    a.addEventListener('loadedmetadata', () => this.tick());
    a.addEventListener('play', () => this.state(true));
    a.addEventListener('pause', () => { this.state(false); this.rec.view.time = a.currentTime; this.save(false); });
    a.addEventListener('ended', () => this.state(false));
    a.addEventListener('error', () => this.showError('This audio can’t be played on this device.'));
    this.seek.addEventListener('input', () => { if (a.duration) a.currentTime = (this.seek.value / 1000) * a.duration; });
    this.vol.addEventListener('input', () => { a.volume = this.vol.value / 100; this.rec.view.volume = a.volume; this.save(false); });
  }
  async load() {
    this.name.textContent = this.rec.meta.recorded ? 'Voice recording' : (this.rec.title || this.rec.meta.filename || 'Audio');
    try {
      const blob = await getFileBlob(this.rec.fileId);
      if (!blob) throw new Error('missing');
      this.url = URL.createObjectURL(blob);
      this.audio.src = this.url;
      this.audio.currentTime = this.rec.view.time || 0;
      this.audio.volume = this.rec.view.volume ?? 1; this.vol.value = String(Math.round(this.audio.volume * 100));
    } catch { this.showError('The stored copy of this audio is missing from this device.'); }
  }
  toggle() { this.audio.paused ? this.audio.play().catch(() => this.showError('Playback was blocked. Try again.')) : this.audio.pause(); }
  state(p) { this.playBtn.replaceChildren(icon(p ? 'pause' : 'play')); this.playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play'); }
  tick() {
    const a = this.audio;
    if (a.duration && Number.isFinite(a.duration)) this.seek.value = String(Math.round((a.currentTime / a.duration) * 1000));
    this.time.textContent = `${fmtClock(a.currentTime * 1000).replace(/^0/, '')}${Number.isFinite(a.duration) ? ` / ${fmtClock(a.duration * 1000).replace(/^0/, '')}` : ''}`;
  }
  onVisibilityChange(v) { if (!v) this.audio.pause(); }
  destroy() { this.audio.pause(); this.audio.removeAttribute('src'); if (this.url) URL.revokeObjectURL(this.url); super.destroy(); }
}
