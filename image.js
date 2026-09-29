// Image object: textbook photos, screenshots, diagrams, handwritten notes.
// Double-tap/click toggles zoom, drag pans while zoomed, two-finger pinch zooms,
// rotate is a context action. Dragging the object itself works at 1x.
import { ObjectBase } from './base.js';
import { el, clamp, bus } from '../core/util.js';
import { getFileBlob } from '../storage/file-storage.js';
import { RAIL, PAD } from '../core/model.js';

export class ImageObject extends ObjectBase {
  renderContent(c) {
    this.holder = el('div', { class: 'img-holder' });
    this.wrap = el('div', { class: 'image-wrap', 'data-drag': '', 'data-gesture-owner': '', 'data-scroll': 'zoomable' }, this.holder);
    c.append(this.wrap);
    this.bind();
  }

  async load() {
    this.showLoading('Opening image…');
    try {
      const blob = await getFileBlob(this.rec.fileId);
      if (!blob) throw new Error('missing');
      this.url = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = 'async';
      img.alt = this.rec.title || 'Image on your desk';
      img.draggable = false;
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode')); img.src = this.url; });
      this.img = img;
      this.natural = { w: img.naturalWidth, h: img.naturalHeight };
      if (!this.rec.meta.aspect) {
        this.rec.meta.aspect = this.natural.w / this.natural.h;
        this.fitFrameToAspect();
      }
      this.holder.replaceChildren(img);
      this.clearStatus();
      this.layout();
    } catch (err) {
      this.showError(err.message === 'missing' ? 'The stored copy of this image is missing from this device.' : 'This image couldn’t be displayed.');
    }
  }

  get rot() { return ((this.rec.state.rotation || 0) % 360 + 360) % 360; }
  get zoom() { return this.rec.view.zoom || 1; }

  aspectNow() { const a = this.rec.meta.aspect || 1; return a; }   // displayed aspect (already swapped on rotate)

  fitFrameToAspect() {
    const a = this.aspectNow();
    const cw = this.rec.w - PAD * 2;
    const maxH = 720;
    let ch = cw / a;
    if (ch > maxH) ch = maxH;
    this.rec.h = Math.round(ch + RAIL + PAD);
    this.rec.w = Math.round(ch * a + PAD * 2);
    this.sync(); this.save(false);
  }

  layout() {
    if (!this.img) return;
    const { w, h } = this.contentSize;
    const odd = this.rot % 180 !== 0;
    const iw = odd ? h : w, ih = odd ? w : h;
    Object.assign(this.img.style, {
      width: `${iw}px`, height: `${ih}px`, position: 'absolute',
      left: `${(w - iw) / 2}px`, top: `${(h - ih) / 2}px`,
      transform: `rotate(${this.rot}deg)`, objectFit: 'contain',
    });
    this.applyPan();
  }

  applyPan() {
    const z = this.zoom, { w, h } = this.contentSize;
    const mx = ((z - 1) * w) / 2, my = ((z - 1) * h) / 2;
    const px = clamp(this.rec.view.px || 0, -mx, mx), py = clamp(this.rec.view.py || 0, -my, my);
    this.rec.view.px = px; this.rec.view.py = py;
    this.holder.style.transform = `translate(${px}px, ${py}px) scale(${z})`;
    if (z > 1) this.wrap.removeAttribute('data-drag'); else this.wrap.setAttribute('data-drag', '');
    this.wrap.classList.toggle('zoomed', z > 1);
  }

  setZoom(z, ax, ay) {
    const old = this.zoom, nz = clamp(z, 1, 6);
    const { w, h } = this.contentSize;
    const cx = (ax ?? w / 2) - w / 2, cy = (ay ?? h / 2) - h / 2;
    const f = nz / old;
    this.rec.view.px = (this.rec.view.px || 0) * f + cx * (1 - f);
    this.rec.view.py = (this.rec.view.py || 0) * f + cy * (1 - f);
    this.rec.view.zoom = nz;
    if (nz === 1) { this.rec.view.px = 0; this.rec.view.py = 0; }
    this.applyPan(); this.save(false);
  }

  rotate() {
    this.rec.state.rotation = (this.rot + 90) % 360;
    this.rec.meta.aspect = 1 / this.aspectNow();
    this.rec.view.zoom = 1; this.rec.view.px = 0; this.rec.view.py = 0;
    this.fitFrameToAspect();
    this.layout(); this.save(true);
    bus.emit('object-changed', { id: this.id });
  }

  bind() {
    const w = this.wrap;
    let last = 0;
    w.addEventListener('dblclick', (e) => {
      const r = w.getBoundingClientRect(), s = r.width / this.contentSize.w || 1;
      this.zoom > 1 ? this.setZoom(1) : this.setZoom(2.5, (e.clientX - r.left) / s, (e.clientY - r.top) / s);
    });
    w.addEventListener('pointerup', (e) => {   // double-tap on touch
      if (e.pointerType !== 'touch') return;
      const now = Date.now();
      if (now - last < 300) { w.dispatchEvent(new MouseEvent('dblclick', { clientX: e.clientX, clientY: e.clientY, bubbles: true })); last = 0; } else last = now;
    });
    // Pan while zoomed
    let drag = null;
    w.addEventListener('pointerdown', (e) => {
      if (this.zoom <= 1 || e.pointerType === 'touch' && e.isPrimary === false) return;
      drag = { x: e.clientX, y: e.clientY, px: this.rec.view.px || 0, py: this.rec.view.py || 0 };
      w.setPointerCapture(e.pointerId);
    });
    w.addEventListener('pointermove', (e) => {
      if (!drag || pinch) return;
      const s = state_scale();
      this.rec.view.px = drag.px + (e.clientX - drag.x) / s;
      this.rec.view.py = drag.py + (e.clientY - drag.y) / s;
      this.applyPan();
    });
    const up = () => { if (drag) { drag = null; this.save(false); } };
    w.addEventListener('pointerup', up); w.addEventListener('pointercancel', up);
    // Pinch zoom (touch)
    let pinch = null;
    w.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) { const [a, b] = e.touches; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: this.zoom }; drag = null; }
    }, { passive: true });
    w.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const [a, b] = e.touches;
      this.setZoom(pinch.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d);
    }, { passive: false });
    w.addEventListener('touchend', () => { pinch = null; }, { passive: true });
    w.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = w.getBoundingClientRect();
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.004), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }

  onResize() { this.layout(); }
  applyState() { this.layout(); }

  extraActions() { return [{ icon: 'rotate', label: 'Rotate', onClick: () => this.rotate() }]; }
  contextItems() { return [{ label: 'Rotate 90°', icon: 'rotate', onClick: () => this.rotate() }, { label: 'Reset zoom', icon: 'full', onClick: () => this.setZoom(1) }]; }

  destroy() { if (this.url) URL.revokeObjectURL(this.url); super.destroy(); }
}

function state_scale() { return parseFloat(document.getElementById('stage')?.style.getPropertyValue('--vp-scale')) || 1; }
