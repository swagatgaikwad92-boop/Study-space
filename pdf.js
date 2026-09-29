// PDF object: real rendering via vendored pdf.js (legacy build, works offline).
// Pages render lazily as they scroll into view. Content gestures (scroll, pinch)
// stay inside the PDF; moving the object is only possible from its rail.
import { ObjectBase } from './base.js';
import { el, icon, iconButton, clamp, debounce } from '../core/util.js';
import { getFileBlob } from '../storage/file-storage.js';
import { state } from '../core/model.js';
import { bus } from '../core/util.js';

let pdfjsPromise = null;
export function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../../vendor/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdf.worker.min.mjs', import.meta.url).href;
      return lib;
    });
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
  }
  return pdfjsPromise;
}

const MAX_CANVAS_PIXELS = 16e6;

export class PdfObject extends ObjectBase {
  renderContent(c) {
    this.scroller = el('div', { class: 'pdf-scroll', 'data-scroll': 'zoomable', 'data-gesture-owner': '', tabindex: '-1' });
    this.pages = el('div', { class: 'pdf-pages' });
    this.scroller.append(this.pages);

    this.pageInfo = el('button', { type: 'button', class: 'pdf-page-btn', 'aria-label': 'Go to page', onclick: () => this.promptPage() }, '– / –');
    this.controls = el('div', { class: 'content-controls pdf-controls' },
      iconButton('up', 'Previous page', () => this.goTo(this.page - 1)),
      this.pageInfo,
      iconButton('down', 'Next page', () => this.goTo(this.page + 1)),
      el('span', { class: 'sep' }),
      iconButton('minus', 'Zoom out', () => this.zoomBy(1 / 1.2)),
      this.zoomBtn = el('button', { type: 'button', class: 'pdf-zoom-btn', 'aria-label': 'Fit to width', title: 'Fit to width', onclick: () => this.fitWidth() }, 'Fit'),
      iconButton('plus', 'Zoom in', () => this.zoomBy(1.2)),
    );
    c.append(this.scroller, this.controls);
  }

  async load() {
    this.page = this.rec.view.page || 1;
    this.zoom = this.rec.view.zoom || 1;      // relative to fit-width
    this.showLoading('Opening PDF…');
    try {
      const blob = await getFileBlob(this.rec.fileId);
      if (!blob) throw new Error('missing');
      const [lib, buf] = await Promise.all([loadPdfJs(), blob.arrayBuffer()]);
      this.task = lib.getDocument({ data: new Uint8Array(buf) });
      this.doc = await this.task.promise;
    } catch (err) {
      console.warn('[pdf]', err);
      const missing = err?.message === 'missing';
      const encrypted = err?.name === 'PasswordException';
      this.showError(
        missing ? 'The stored copy of this PDF is missing from this device.'
          : encrypted ? 'This PDF is password protected and can’t be opened here.'
          : 'This PDF couldn’t be displayed. The file may be damaged.',
        [{ label: 'Remove', onClick: () => bus.emit('object-action', { id: this.id, action: 'delete' }) }]);
      this.controls.hidden = true;
      return;
    }
    this.clearStatus();
    this.total = this.doc.numPages;
    const first = await this.doc.getPage(1);
    this.base = first.getViewport({ scale: 1 });
    this.buildPlaceholders();
    this.bindInteractions();
    this.observe();
    this.updateInfo();
    // restore reading position after layout
    requestAnimationFrame(() => { this.scrollToPage(this.page, false); });
  }

  // ---- Layout ---------------------------------------------------------------
  get fitScale() {
    const w = Math.max(120, this.scroller.clientWidth - 16);
    return w / this.base.width;
  }
  get cssScale() { return this.fitScale * this.zoom; }

  buildPlaceholders() {
    this.pages.replaceChildren();
    this.slots = [];
    for (let i = 1; i <= this.total; i++) {
      const slot = el('div', { class: 'pdf-page', 'data-page': i });
      slot.append(el('div', { class: 'skeleton' }));
      this.pages.append(slot);
      this.slots.push({ n: i, el: slot, canvas: null, renderedKey: '', task: null, w: this.base.width, h: this.base.height });
    }
    this.layoutSlots();
  }

  layoutSlots() {
    const s = this.cssScale;
    for (const p of this.slots) {
      p.el.style.width = `${Math.floor(p.w * s)}px`;
      p.el.style.height = `${Math.floor(p.h * s)}px`;
    }
    this.zoomBtn.textContent = this.zoom === 1 ? 'Fit' : `${Math.round(this.zoom * 100)}%`;
  }

  observe() {
    this.io?.disconnect();
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const slot = this.slots[+e.target.dataset.page - 1];
        if (e.isIntersecting) { slot.visible = true; this.render(slot); } else { slot.visible = false; this.release(slot); }
      }
    }, { root: this.scroller, rootMargin: '120% 0px' });
    this.slots.forEach((s) => this.io.observe(s.el));
    this.disposers.push(() => this.io?.disconnect());
  }

  async render(slot) {
    if (!this.doc || this.destroyed) return;
    const worldScale = state.viewport.scale;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let q = this.cssScale * worldScale * dpr;
    const key = `${this.cssScale.toFixed(3)}|${Math.round(q * 100)}`;
    if (slot.renderedKey === key) return;
    slot.task?.cancel?.();
    try {
      const page = await this.doc.getPage(slot.n);
      const vp1 = page.getViewport({ scale: 1 });
      if (vp1.width !== slot.w || vp1.height !== slot.h) { slot.w = vp1.width; slot.h = vp1.height; this.layoutSlots(); }
      if (vp1.width * vp1.height * q * q > MAX_CANVAS_PIXELS) q = Math.sqrt(MAX_CANVAS_PIXELS / (vp1.width * vp1.height));
      const vp = page.getViewport({ scale: q });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      canvas.className = 'pdf-canvas';
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      slot.task = task;
      await task.promise;
      if (!slot.visible && slot.n !== this.page) return;
      slot.el.replaceChildren(canvas);
      slot.canvas = canvas; slot.renderedKey = key;
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') return;
      console.warn('[pdf] page', slot.n, err);
      if (!slot.el.querySelector('.page-error')) slot.el.append(el('div', { class: 'page-error', text: `Page ${slot.n} couldn’t be rendered.` }));
    }
  }

  release(slot) {
    slot.task?.cancel?.();
    if (slot.canvas) { slot.canvas.width = slot.canvas.height = 0; slot.canvas = null; slot.renderedKey = ''; slot.el.replaceChildren(el('div', { class: 'skeleton' })); }
  }

  rerenderVisible = debounce(() => {
    if (!this.slots) return;
    this.slots.forEach((s) => { if (s.visible) { s.renderedKey = ''; this.render(s); } });
  }, 220);

  // ---- Navigation -----------------------------------------------------------
  currentPageFromScroll() {
    const mid = this.scroller.scrollTop + this.scroller.clientHeight * 0.35;
    let lo = 0, hi = this.slots.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (this.slots[m].el.offsetTop <= mid) lo = m; else hi = m - 1;
    }
    return lo + 1;
  }

  goTo(n) { this.scrollToPage(clamp(n, 1, this.total), true); }

  scrollToPage(n, smooth) {
    const slot = this.slots?.[n - 1];
    if (!slot) return;
    this.scroller.scrollTo({ top: slot.el.offsetTop - 8, behavior: smooth ? 'smooth' : 'auto' });
    this.page = n; this.updateInfo(); this.persist();
  }

  updateInfo() { this.pageInfo.textContent = `${this.page} / ${this.total}`; }

  persist = debounce(() => {
    this.rec.view.page = this.page; this.rec.view.zoom = this.zoom;
    this.save(false);
  }, 500);

  promptPage() {
    bus.emit('prompt', {
      title: 'Go to page', value: String(this.page), type: 'number', confirm: 'Go',
      onSubmit: (v) => { const n = parseInt(v, 10); if (n) this.goTo(n); },
    });
  }

  // ---- Zoom -----------------------------------------------------------------
  setZoom(z, anchor) {
    const old = this.zoom;
    this.zoom = clamp(z, 0.5, 5);
    if (this.zoom === old) return;
    const sc = this.scroller;
    const ax = anchor?.x ?? sc.clientWidth / 2, ay = anchor?.y ?? sc.clientHeight / 2;
    const fx = (sc.scrollLeft + ax) / sc.scrollWidth, fy = (sc.scrollTop + ay) / sc.scrollHeight;
    this.layoutSlots();
    sc.scrollLeft = fx * sc.scrollWidth - ax;
    sc.scrollTop = fy * sc.scrollHeight - ay;
    this.rerenderVisible(); this.persist();
  }
  zoomBy(f, anchor) { this.setZoom(this.zoom * f, anchor); }
  fitWidth() { this.zoom = 1; this.layoutSlots(); this.scroller.scrollLeft = 0; this.rerenderVisible(); this.persist(); }

  onResize() {
    if (!this.slots) return;
    this.layoutSlots(); this.rerenderVisible();
  }

  bindInteractions() {
    const sc = this.scroller;
    sc.addEventListener('scroll', () => {
      const p = this.currentPageFromScroll();
      if (p !== this.page) { this.page = p; this.updateInfo(); }
      this.persist();
    }, { passive: true });

    // Ctrl/Cmd + wheel zooms the PDF (plain wheel scrolls it)
    sc.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = sc.getBoundingClientRect();
      this.zoomBy(Math.exp(-e.deltaY * 0.004), { x: e.clientX - r.left, y: e.clientY - r.top });
    }, { passive: false });

    // Touch pinch: live CSS transform, committed (and re-rendered sharply) on release.
    let pinch = null;
    sc.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches;
        const r = sc.getBoundingClientRect();
        pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), k: 1,
          ax: (a.clientX + b.clientX) / 2 - r.left, ay: (a.clientY + b.clientY) / 2 - r.top };
        this.pages.style.transformOrigin = `${sc.scrollLeft + pinch.ax}px ${sc.scrollTop + pinch.ay}px`;
      }
    }, { passive: true });
    sc.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinch.k = clamp((d / pinch.d), 0.5 / this.zoom, 5 / this.zoom);
      this.pages.style.transform = `scale(${pinch.k})`;
    }, { passive: false });
    const endPinch = (e) => {
      if (!pinch || e.touches.length >= 2) return;
      const k = pinch.k, anchor = { x: pinch.ax, y: pinch.ay };
      pinch = null;
      this.pages.style.transform = ''; this.pages.style.transformOrigin = '';
      this.setZoom(this.zoom * k, anchor);
    };
    sc.addEventListener('touchend', endPinch, { passive: true });
    sc.addEventListener('touchcancel', endPinch, { passive: true });

    // Swipe left/right (at fit width) turns pages; vertical scrolling stays native.
    let sx = 0, sy = 0, st = 0, multi = false;
    sc.addEventListener('touchstart', (e) => {
      multi = e.touches.length > 1;
      if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); }
    }, { passive: true });
    sc.addEventListener('touchend', (e) => {
      if (multi || this.zoom > 1.02 || !e.changedTouches.length) { if (!e.touches.length) multi = false; return; }
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Date.now() - st < 350 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2.2) this.goTo(this.page + (dx < 0 ? 1 : -1));
    }, { passive: true });

    // Keyboard reading
    sc.addEventListener('keydown', (e) => {
      if (e.key === 'PageDown') { e.preventDefault(); this.goTo(this.page + 1); }
      else if (e.key === 'PageUp') { e.preventDefault(); this.goTo(this.page - 1); }
    });
    this.el.addEventListener('pointerdown', () => { /* keep keyboard focus in the reader */ });

    this.disposers.push(bus.on('viewport', () => this.rerenderVisible()));
  }

  onSelectionChange(sel) { if (sel && !this.destroyed) this.scroller.setAttribute('tabindex', '0'); }

  /** Text of the current page, for DABSy (only read when the user asks DABSy about the desk). */
  async currentPageText(maxChars = 4000) {
    if (!this.doc) return '';
    try {
      const page = await this.doc.getPage(this.page);
      const tc = await page.getTextContent();
      return tc.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').slice(0, maxChars);
    } catch { return ''; }
  }

  contextItems() {
    return [
      { label: 'Fit to width', icon: 'full', onClick: () => this.fitWidth() },
      { label: 'Go to page…', icon: 'file', onClick: () => this.promptPage() },
    ];
  }

  destroy() {
    this.destroyed = true;
    this.slots?.forEach((s) => s.task?.cancel?.());
    this.doc?.destroy?.().catch?.(() => {});
    this.task?.destroy?.();
    super.destroy();
  }
}
