// Intelligent placement: near the centre of the view when the desk is empty,
// otherwise the closest free spot around it. Existing objects are never moved.
import { state } from '../core/model.js';
import { viewCenterWorld, visibleWorldRect } from './viewport.js';

const GAP = 28;

function overlaps(a, list) {
  for (const o of list) {
    if (a.l < o.x + o.w + GAP && a.r > o.x - GAP && a.t < o.y + o.h + GAP && a.b > o.y - GAP) return true;
  }
  return false;
}

export function findSpot(w, h) {
  const list = [...state.objects.values()].filter((o) => o.visible);
  const c = viewCenterWorld();
  const vis = visibleWorldRect();
  // Empty desk -> centred.
  if (!list.length) return { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2) };
  const step = 40;
  const cand = [];
  const maxRing = 60;
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const x = Math.round(c.x - w / 2 + dx * step), y = Math.round(c.y - h / 2 + dy * step);
      const rect = { l: x, t: y, r: x + w, b: y + h };
      if (overlaps(rect, list)) continue;
      // prefer spots that are at least partly on screen
      const inside = rect.l >= vis.l + 12 && rect.r <= vis.r - 12 && rect.t >= vis.t + 12 && rect.b <= vis.b - 84;
      cand.push({ x, y, score: Math.hypot(dx, dy) + (inside ? 0 : 40) });
      if (cand.length > 40) break;
    }
    if (cand.length > 40) break;
  }
  if (cand.length) { cand.sort((a, b) => a.score - b.score); return { x: cand[0].x, y: cand[0].y }; }
  const last = list[list.length - 1];
  return { x: last.x + 32, y: last.y + 32 };
}
