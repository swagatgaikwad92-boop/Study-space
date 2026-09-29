// Ecosystem hub: a tiny event/adapter layer so Study Space is never tightly
// coupled to SolveCount or Ghibli Calendar. Each app talks to Study Space over
// a BroadcastChannel (same origin), window.postMessage (embedding) or the public
// window.StudySpaceEcosystem API. Adapters can be swapped without touching the app.
import { bus } from '../core/util.js';

const adapters = new Set();

/** An adapter is {name, send?(event)} - it receives outgoing Study Space events. */
export function registerAdapter(a) { adapters.add(a); return () => adapters.delete(a); }

export function emitOutgoing(event) {
  const e = { source: 'study-space', at: Date.now(), ...event };
  bus.emit('ecosystem-out', e);
  for (const a of adapters) { try { a.send?.(e); } catch (err) { console.warn('[ecosystem]', a.name, err); } }
}

/** Incoming events: {source:'solvecount'|'ghibli-calendar', type, ...} */
export function receive(msg) {
  if (!msg || typeof msg !== 'object' || typeof msg.source !== 'string' || typeof msg.type !== 'string') return;
  bus.emit(`ecosystem:${msg.source}`, msg);
}

export function initEcosystem() {
  try {
    const ch = new BroadcastChannel('student-ecosystem');
    ch.onmessage = (e) => receive(e.data);
    registerAdapter({ name: 'broadcast', send: (ev) => ch.postMessage(ev) });
  } catch { /* BroadcastChannel unavailable */ }
  addEventListener('message', (e) => {
    if (e.origin !== location.origin && e.source !== window.parent) return;
    receive(e.data);
  });
  window.StudySpaceEcosystem = { receive, on: (t, fn) => bus.on(`ecosystem:${t}`, fn), version: 1 };
}
