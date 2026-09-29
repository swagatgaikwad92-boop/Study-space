// The dotted desk. One <canvas> behind the world layer. Idle = drawn only when the
// viewport changes (no animation loop). While a wave is active a rAF loop runs and
// stops itself when the last wave has faded.
import { state } from '../core/model.js';
import { bus } from '../core/util.js';

const SPACING = 28;         // world units between dots
let canvas, ctx, dpr = 1, W = 0, H = 0;
let raf = 0;
let dirty = true;
export const waves = [];    // active waves, managed by pomodoro/wave-animation.js

export function initDots(c) {
  canvas = c; ctx = c.getContext('2d');
  resize();
  bus.on('viewport', () => request());
  bus.on('viewport-resize', resize);
  addEventListener('resize', resize);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', request);
}

function resize() {
  const r = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = r.width; H = r.height;
  canvas.width = Math.max(1, Math.round(W * dpr));
  canvas.height = Math.max(1, Math.round(H * dpr));
  request();
}

export function request() {
  dirty = true;
  if (!raf) raf = requestAnimationFrame(frame);
}

function baseRGB() {
  const s = getComputedStyle(document.documentElement).getPropertyValue('--dot-rgb').trim() || '70, 62, 50';
  return s.split(',').map((n) => parseFloat(n));
}

function frame(now) {
  raf = 0;
  const active = waves.length > 0;
  if (active) {
    for (let i = waves.length - 1; i >= 0; i--) if (now - waves[i].start > waves[i].dur) waves.splice(i, 1);
  }
  if (dirty || active || waves.length) draw(now);
  dirty = false;
  if (waves.length) raf = requestAnimationFrame(frame);
}

function draw(now) {
  const v = state.viewport;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  let step = SPACING * v.scale;
  let skip = 1;
  while (step * skip < 11) skip *= 2;      // keep density sane when zoomed out
  step *= skip;
  const x0 = ((v.x % step) + step) % step, y0 = ((v.y % step) + step) % step;
  const [br, bg, bb] = baseRGB();
  const baseA = 0.26, baseR = Math.max(0.7, Math.min(1.25, 0.95 * Math.sqrt(v.scale)));

  if (!waves.length) {
    ctx.fillStyle = `rgba(${br},${bg},${bb},${baseA})`;
    ctx.beginPath();
    for (let y = y0; y < H + step; y += step) for (let x = x0; x < W + step; x += step) {
      ctx.moveTo(x + baseR, y); ctx.arc(x, y, baseR, 0, 6.2832);
    }
    ctx.fill();
    return;
  }

  // Precompute each wave's current ring radius / envelope.
  const ws = waves.map((w) => {
    const t = Math.min(1, (now - w.start) / w.dur);
    const ease = 1 - Math.pow(1 - t, 2.2);
    const radius = ease * w.maxR;
    const fade = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    return { ...w, radius, fade: Math.max(0, fade) * w.strength };
  });

  for (let y = y0; y < H + step; y += step) {
    for (let x = x0; x < W + step; x += step) {
      let k = 0, cr = br, cg = bg, cb = bb;
      for (const w of ws) {
        const d = Math.abs(Math.hypot(x - w.ox, y - w.oy) - w.radius);
        if (d < w.width) {
          const q = 0.5 * (1 + Math.cos((Math.PI * d) / w.width)) * w.fade;
          if (q > k) { k = q; cr = w.rgb[0]; cg = w.rgb[1]; cb = w.rgb[2]; }
        }
      }
      if (k > 0.01) {
        const a = baseA + (0.78 - baseA) * k;
        const r = baseR + 1.5 * k;
        const mix = Math.min(1, k * 1.4);
        const rr = Math.round(br + (cr - br) * mix), gg = Math.round(bg + (cg - bg) * mix), bl = Math.round(bb + (cb - bb) * mix);
        // faint halo, then the dot: reads as light passing through the grid
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${(0.16 * k).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, r * 3.1, 0, 6.2832); ctx.fill();
        ctx.fillStyle = `rgba(${rr},${gg},${bl},${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(${br},${bg},${bb},${baseA})`;
        ctx.beginPath(); ctx.arc(x, y, baseR, 0, 6.2832); ctx.fill();
      }
    }
  }
}

export function canvasSize() { return { w: W, h: H }; }
