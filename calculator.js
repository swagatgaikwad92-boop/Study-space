// Compact calculator. Expressions are parsed by a small recursive-descent parser
// (no eval / Function), supporting + − × ÷ ^ % parentheses, √, π and a few functions.
import { ObjectBase } from './base.js';
import { el } from '../core/util.js';

export function evaluate(src) {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/\s+/g, '');
  let i = 0;
  const peek = () => s[i];
  const fail = () => { throw new Error('bad'); };
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function term() {
    let v = power();
    while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = power(); v = op === '*' ? v * r : v / r; }
    return v;
  }
  function power() {
    const b = unary();
    if (peek() === '^') { i++; return Math.pow(b, power()); }
    return b;
  }
  function unary() {
    if (peek() === '-') { i++; return -unary(); }
    if (peek() === '+') { i++; return unary(); }
    let v = primary();
    while (peek() === '%') { i++; v /= 100; }
    return v;
  }
  function primary() {
    if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') fail(); i++; return v; }
    const num = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = s.slice(i).match(/^[a-z]+/);
    if (id) {
      i += id[0].length;
      const name = id[0];
      if (name === 'pi') return Math.PI;
      if (name === 'e') return Math.E;
      const fns = { sqrt: Math.sqrt, sin: (x) => Math.sin(x * Math.PI / 180), cos: (x) => Math.cos(x * Math.PI / 180), tan: (x) => Math.tan(x * Math.PI / 180), log: Math.log10, ln: Math.log, abs: Math.abs };
      if (!fns[name]) fail();
      if (peek() !== '(') fail();
      i++; const v = expr(); if (peek() !== ')') fail(); i++;
      return fns[name](v);
    }
    return fail();
  }
  const out = expr();
  if (i < s.length || !Number.isFinite(out)) fail();
  return out;
}

export function formatResult(n) {
  const r = parseFloat(n.toPrecision(12));
  return Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-9 && r !== 0) ? r.toExponential(6) : String(r);
}

const KEYS = [
  ['C', 'clear'], ['⌫', 'back'], ['%', '%'], ['÷', '÷'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['×', '×'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['−', '−'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+'],
  ['0', '0'], ['.', '.'], ['(', '('], [')', ')'],
  ['√', '√('], ['x²', '^2'], ['^', '^'], ['=', 'eq'],
];

export class CalculatorObject extends ObjectBase {
  renderContent(c) {
    this.expr = this.rec.state.expr || '';
    this.exprEl = el('div', { class: 'calc-expr', 'aria-live': 'polite' });
    this.resEl = el('div', { class: 'calc-result' });
    const pad = el('div', { class: 'calc-pad' }, KEYS.map(([label, val]) => el('button', {
      type: 'button', class: `calc-key${val === 'eq' ? ' eq' : ''}${/^[÷×−+]$/.test(val) ? ' op' : ''}${val === 'clear' || val === 'back' ? ' fn' : ''}`,
      'aria-label': { clear: 'Clear', back: 'Backspace', eq: 'Equals', '÷': 'Divide', '×': 'Multiply', '−': 'Subtract', '+': 'Add' }[val] || label,
      onclick: () => this.press(val),
    }, label)));
    c.append(el('div', { class: 'calc-display', 'data-drag': '' }, this.exprEl, this.resEl), pad);
    this.el.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (/^[0-9.()+%^]$/.test(k)) this.press(k);
      else if (k === '-') this.press('−'); else if (k === '*') this.press('×'); else if (k === '/') { e.preventDefault(); this.press('÷'); }
      else if (k === 'Enter' || k === '=') { e.preventDefault(); this.press('eq'); }
      else if (k === 'Backspace') { e.stopPropagation(); this.press('back'); }
      else if (k === 'Escape') return; else return;
      e.stopPropagation();
    });
    this.refresh();
  }
  press(v) {
    if (v === 'clear') this.expr = '';
    else if (v === 'back') this.expr = this.expr.slice(0, -1);
    else if (v === 'eq') {
      try { this.expr = formatResult(evaluate(this.expr)); this.justEvaluated = true; } catch { this.resEl.textContent = 'Check expression'; this.resEl.classList.add('err'); return; }
    } else {
      if (this.justEvaluated && /^[0-9.(√]/.test(v)) this.expr = '';
      this.justEvaluated = false;
      this.expr += v;
    }
    if (v !== 'eq') this.justEvaluated = false;
    this.refresh();
    this.rec.state.expr = this.expr; this.save(false);
  }
  refresh() {
    this.exprEl.textContent = this.expr || '0';
    this.resEl.classList.remove('err');
    let live = '';
    if (this.expr && /[+\-×÷−^%]/.test(this.expr.replace(/^-/, ''))) { try { live = formatResult(evaluate(this.expr)); } catch { live = ''; } }
    this.resEl.textContent = live;
  }
}
