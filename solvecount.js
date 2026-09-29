// Synchronised SolveCount timer (read-only mirror of the session running in SolveCount).
import { ObjectBase } from './base.js';
import { el, fmtClock, bus } from '../core/util.js';
import { solvecount, solveElapsed } from '../ecosystem/solvecount-bridge.js';

export class SolveCountObject extends ObjectBase {
  renderContent(c) {
    this.timeEl = el('div', { class: 'sc-time' });
    this.stateEl = el('div', { class: 'sc-state' });
    this.subjectEl = el('div', { class: 'sc-subject' });
    c.append(el('div', { class: 'sc-face', 'data-drag': '' }, this.stateEl, this.timeEl, this.subjectEl));
    this.disposers.push(bus.on('solvecount', () => this.render()));
    this.render();
  }
  render() {
    const s = solvecount.state;
    this.el.dataset.status = s;
    this.stateEl.textContent = s === 'running' ? 'SolveCount · running' : s === 'paused' ? 'SolveCount · paused' : 'No active session';
    this.subjectEl.textContent = solvecount.subject;
    this.tick();
    clearInterval(this.iv);
    if (s === 'running') this.iv = setInterval(() => this.tick(), 1000);
  }
  tick() { this.timeEl.textContent = solvecount.state === 'stopped' && !solvecount.receivedAt ? '--:--' : fmtClock(solveElapsed()).replace(/^0(?=\d:)/, ''); }
  destroy() { clearInterval(this.iv); super.destroy(); }
}
