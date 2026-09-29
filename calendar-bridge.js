// Ghibli Calendar bridge. Completed study activity is published as events through
// the ecosystem adapters and also kept in a small local outbox (IndexedDB) so a
// calendar implementation can pick up anything it missed.
import { bus } from '../core/util.js';
import { emitOutgoing } from './ecosystem.js';
import { dbPut } from '../storage/database.js';
import { state, TYPES } from '../core/model.js';

function deskSubject() {
  // Best-effort subject/context: the first titled object on the desk.
  for (const o of state.objects.values()) {
    if (o.visible && o.title && TYPES[o.type].band === 'content') return o.title;
  }
  return '';
}

export function initCalendarBridge() {
  bus.on('pomo-session', async ({ minutes, sessions, at }) => {
    const ev = {
      type: 'session.completed',
      kind: 'pomodoro',
      date: new Date(at).toISOString().slice(0, 10),
      startedAt: at - minutes * 60000,
      endedAt: at,
      durationMin: minutes,
      sessionNumber: sessions,
      subject: deskSubject(),
      objects: [...state.objects.values()].filter((o) => o.visible && TYPES[o.type].band === 'content').length,
    };
    emitOutgoing({ target: 'ghibli-calendar', ...ev });
    try { await dbPut('events', ev); } catch { /* outbox is best-effort */ }
  });
}
