import { h } from '../util.js';

/** Safe arithmetic parser (no eval): + − × ÷ ^ % ( ) and decimals. */
export function evaluate(expr) {
  const src = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
  let i = 0;
  const peek = () => src[i];
  const eat = (c) => (src[i] === c ? (i++, true) : false);
  function number() {
    const start = i;
    while (/[0-9.]/.test(src[i] || '')) i++;
    if (start === i) throw new Error('Expected number');
    const n = Number(src.slice(start, i));
    if (Number.isNaN(n)) throw new Error('Bad number');
    return n;
  }
  function factor() {
    if (eat('-')) return -factor();
    if (eat('+')) return factor();
    let v;
    if (eat('(')) {
      v = expression();
      eat(')'); // forgive a missing closing bracket
    } else v = number();
    if (eat('%')) v /= 100;
    if (eat('^')) v = Math.pow(v, factor());
    return v;
  }
  function term() {
    let v = factor();
    for (;;) {
      if (eat('*')) v *= factor();
      else if (eat('/')) {
        const d = factor();
        if (d === 0) throw new Error('Cannot divide by 0');
        v /= d;
      } else if (peek() === '(') v *= factor(); // 2(3) = 6
      else return v;
    }
  }
  function expression() {
    let v = term();
    for (;;) {
      if (eat('+')) v += term();
      else if (eat('-')) v -= term();
      else return v;
    }
  }
  const v = expression();
  if (i < src.length) throw new Error('Unexpected input');
  return Math.round(v * 1e10) / 1e10;
}

export default {
  type: 'calculator',
  title: 'Calculator',
  icon: '🧮',
  group: 'extras',
  size: [320, 440],
  defaultState: () => ({ expr: '', history: [] }),

  mount(ctx) {
    const s = ctx.state;
    const exprEl = h('div', { class: 'calc-expr', 'aria-live': 'polite' });
    const resEl = h('div', { class: 'calc-res' });
    let justEvaluated = false;

    const press = (k) => {
      if (k === 'C') s.expr = '';
      else if (k === '⌫') s.expr = s.expr.slice(0, -1);
      else if (k === '=') {
        try {
          const v = evaluate(s.expr);
          s.history = [`${s.expr} = ${fmt(v)}`, ...s.history].slice(0, 5);
          s.expr = String(v);
          justEvaluated = true;
          ctx.save();
          render();
          return;
        } catch (e) {
          resEl.textContent = e.message.startsWith('Cannot') ? e.message : 'Check the sum';
          return;
        }
      } else {
        if (justEvaluated && /[0-9.(]/.test(k)) s.expr = '';
        s.expr += k;
      }
      justEvaluated = false;
      ctx.save();
      render();
    };
    const fmt = (v) => (Math.abs(v) >= 1e12 ? v.toExponential(6) : v.toLocaleString(undefined, { maximumFractionDigits: 8 }));

    const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='];
    const pad = h('div', { class: 'calc-pad' },
      ...keys.map((k) =>
        h('button', { class: `calc-key${/[÷×−+=]/.test(k) ? ' op' : ''}${k === '=' ? ' eq' : ''}${k === 'C' ? ' clear' : ''}`, onclick: () => press(k) }, k),
      ),
    );
    const hist = h('div', { class: 'calc-hist' });
    ctx.view.append(h('div', { class: 'calc' }, hist, h('div', { class: 'calc-display' }, exprEl, resEl), pad));

    ctx.view.tabIndex = 0;
    ctx.view.addEventListener('keydown', (e) => {
      const map = { '*': '×', '/': '÷', '-': '−', Enter: '=', Backspace: '⌫', Escape: 'C', Delete: 'C' };
      const k = map[e.key] || e.key;
      if (/^[0-9.+()%^]$/.test(k) || ['×', '÷', '−', '=', '⌫', 'C'].includes(k)) {
        e.preventDefault();
        press(k);
      }
    });

    function render() {
      exprEl.textContent = s.expr || '0';
      let preview = '';
      if (s.expr && !justEvaluated) {
        try {
          preview = `= ${fmt(evaluate(s.expr))}`;
        } catch { /* incomplete */ }
      }
      resEl.textContent = preview;
      hist.replaceChildren(...s.history.slice(0, 2).map((t) => h('div', {}, t)));
    }
    render();
  },
};
