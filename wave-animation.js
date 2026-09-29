// The signature moment: a soft wave of light travels through the dotted grid.
// Focus start = warm, firm wave. Break = softer, cooler, slower. Resume/complete =
// restrained ripples. Reduced motion replaces it with a brief static tint.
import { waves, request } from '../canvas/dots.js';
import { bus, prefersReducedMotion } from '../core/util.js';
import { canvasSize } from '../canvas/dots.js';
import { pomo } from './timer-state.js';

const KINDS = {
  start:         { rgb: [214, 140, 48],  dur: 2600, width: 150, strength: 1.0 },
  resume:        { rgb: [214, 140, 48],  dur: 1700, width: 110, strength: 0.55 },
  focusComplete: { rgb: [214, 140, 48],  dur: 2300, width: 130, strength: 0.7 },
  breakStart:    { rgb: [74, 142, 156],  dur: 3400, width: 190, strength: 0.75 },
  breakComplete: { rgb: [74, 142, 156],  dur: 2200, width: 120, strength: 0.5 },
};

let originGetter = () => null;
export function setWaveOrigin(fn) { originGetter = fn; }

function trigger(kind) {
  const k = KINDS[kind];
  if (!k) return;
  const { w, h } = canvasSize();
  if (prefersReducedMotion()) {
    // Accessibility overrides animation: a calm, non-animated tint instead of a travelling wave.
    document.body.dataset.tint = k.rgb[0] > 150 ? 'focus' : 'break';
    clearTimeout(trigger.t);
    trigger.t = setTimeout(() => { delete document.body.dataset.tint; }, 1400);
    return;
  }
  const o = originGetter() || { x: w / 2, y: h / 2 };
  const maxR = Math.max(Math.hypot(o.x, o.y), Math.hypot(w - o.x, o.y), Math.hypot(o.x, h - o.y), Math.hypot(w - o.x, h - o.y)) + k.width;
  waves.push({ ox: o.x, oy: o.y, start: performance.now(), dur: k.dur, width: k.width, strength: k.strength, rgb: k.rgb, maxR });
  request();
}

export function initWave() {
  bus.on('pomo', ({ type }) => {
    if (KINDS[type]) trigger(type);
    // Chrome goes quiet while a focus session is running.
    document.body.classList.toggle('is-studying', pomo.status === 'running' && pomo.phase === 'focus');
    document.body.dataset.pomo = pomo.status === 'running' ? (pomo.isBreak ? 'break' : 'focus') : 'idle';
  });
}
