// SolveCount bridge. SolveCount owns its session timer; Study Space only *mirrors*
// it (no second timer). Protocol (source:'solvecount'):
//   {type:'session', state:'running'|'paused'|'stopped', startedAt, elapsedMs, subject}
import { bus, prefersReducedMotion } from '../core/util.js';

export const solvecount = { state: 'stopped', startedAt: 0, elapsedMs: 0, subject: '', receivedAt: 0 };

export function initSolveCountBridge() {
  bus.on('ecosystem:solvecount', (m) => {
    if (m.type !== 'session') return;
    const st = ['running', 'paused', 'stopped'].includes(m.state) ? m.state : 'stopped';
    Object.assign(solvecount, {
      state: st,
      startedAt: Number(m.startedAt) || 0,
      elapsedMs: Math.max(0, Number(m.elapsedMs) || 0),
      subject: typeof m.subject === 'string' ? m.subject.slice(0, 60) : '',
      receivedAt: Date.now(),
    });
    bus.emit('solvecount', solvecount);
  });
}

/** Elapsed time as of now, derived (never ticked independently of the source). */
export function solveElapsed() {
  if (solvecount.state === 'running') return solvecount.elapsedMs + (Date.now() - solvecount.receivedAt);
  return solvecount.elapsedMs;
}
