// Subtle optional alignment: objects gently snap to nearby edges/centres of other
// objects. Freeform placement stays primary (Alt disables snapping while dragging).
import { state } from '../core/model.js';

export function snapMove(rec, x, y, thresholdWorld) {
  const guides = { v: [], h: [] };
  if (!state.settings.snap) return { x, y, guides };
  const xs = [x, x + rec.w / 2, x + rec.w], ys = [y, y + rec.h / 2, y + rec.h];
  let bestX = null, bestY = null;
  for (const o of state.objects.values()) {
    if (o.id === rec.id || !o.visible) continue;
    const ox = [o.x, o.x + o.w / 2, o.x + o.w], oy = [o.y, o.y + o.h / 2, o.y + o.h];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const dx = ox[j] - xs[i], dy = oy[j] - ys[i];
      if (Math.abs(dx) < thresholdWorld && (!bestX || Math.abs(dx) < Math.abs(bestX.d))) bestX = { d: dx, at: ox[j] };
      if (Math.abs(dy) < thresholdWorld && (!bestY || Math.abs(dy) < Math.abs(bestY.d))) bestY = { d: dy, at: oy[j] };
    }
  }
  if (bestX) { x += bestX.d; guides.v.push(bestX.at); }
  if (bestY) { y += bestY.d; guides.h.push(bestY.at); }
  return { x, y, guides };
}
