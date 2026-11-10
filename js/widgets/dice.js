import { h } from '../util.js';
import { play } from '../sound.js';
import { panel, checkbox, field, numberInput } from './_common.js';

// Pip positions on a 100×100 face for values 1–9.
const P = { tl: [27, 27], tc: [50, 27], tr: [73, 27], ml: [27, 50], c: [50, 50], mr: [73, 50], bl: [27, 73], bc: [50, 73], br: [73, 73] };
const PIPS = {
  1: ['c'],
  2: ['tl', 'br'],
  3: ['tl', 'c', 'br'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'c', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
  7: ['tl', 'tr', 'ml', 'c', 'mr', 'bl', 'br'],
  8: ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'],
  9: ['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br'],
};
const COLORS = [
  ['#ffffff', '#1d1d1f'],
  ['#e63946', '#ffffff'],
  ['#1982c4', '#ffffff'],
  ['#ffca3a', '#1d1d1f'],
  ['#8ac926', '#1d1d1f'],
  ['#7b2cbf', '#ffffff'],
];
const QUICK = [2, 3, 4, 6, 8, 10, 12, 20, 100];

function dieSVG(value, sides, [bg, ink], useDots) {
  const pips = useDots && value >= 1 && value <= 9 ? PIPS[value] : null;
  const body = pips
    ? pips.map((k) => `<circle cx="${P[k][0]}" cy="${P[k][1]}" r="${value > 6 ? 7.5 : 9}" fill="${ink}"/>`).join('')
    : `<text x="50" y="53" text-anchor="middle" dominant-baseline="middle" font-size="${String(value ?? '?').length > 2 ? 34 : 50}" font-weight="900" font-family="system-ui, sans-serif" fill="${ink}">${value ?? '?'}</text>`;
  const corner = sides !== 6 ? `<text x="88" y="92" text-anchor="end" font-size="11" font-weight="800" font-family="system-ui, sans-serif" fill="${ink}" opacity=".55">d${sides}</text>` : '';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="94" height="94" rx="18" fill="${bg}" stroke="#0003" stroke-width="2"/>${body}${corner}</svg>`;
}

export default {
  type: 'dice',
  title: 'Dice',
  icon: '🎲',
  group: 'extras',
  size: [380, 260],
  hasSettings: true,
  defaultState: () => ({ count: 2, sides: 6, values: [], total: true, dots: true }),

  mount(ctx) {
    const s = ctx.state;
    const tray = h('button', { class: 'dice-tray', title: 'Tap to roll', 'aria-label': 'Roll the dice', onclick: roll });
    const total = h('div', { class: 'dice-total', 'aria-live': 'polite' });
    const countEl = h('span', { class: 'dice-count' });
    ctx.view.append(h('div', { class: 'dice' }, tray, total,
      h('div', { class: 'dice-foot' },
        h('button', { class: 'btn small', 'aria-label': 'Fewer dice', onclick: () => setCount(s.count - 1) }, '−'),
        countEl,
        h('button', { class: 'btn small', 'aria-label': 'More dice', onclick: () => setCount(s.count + 1) }, '+'),
        h('button', { class: 'btn primary big', onclick: roll }, 'Roll'),
      ),
    ));

    let rolling = false;
    const rnd = () => 1 + Math.floor(Math.random() * s.sides);

    function setCount(n) {
      s.count = Math.max(1, Math.min(6, n));
      s.values = s.values.slice(0, s.count);
      ctx.save();
      render();
    }

    function roll() {
      if (rolling) return;
      rolling = true;
      const final = Array.from({ length: s.count }, rnd);
      let n = 0;
      const step = () => {
        n++;
        s.values = n < 12 ? Array.from({ length: s.count }, rnd) : final;
        play('tick');
        render(n < 12);
        if (n < 12) setTimeout(step, 35 + n * 8);
        else {
          rolling = false;
          play('pop');
          ctx.save();
        }
      };
      step();
    }

    function render(spinning = false) {
      const useDots = s.dots && s.sides <= 9;
      tray.replaceChildren(
        ...Array.from({ length: s.count }, (_, i) => {
          const v = s.values[i];
          const d = h('div', { class: `die${spinning ? ' rolling' : ''}`, role: 'img', 'aria-label': `Die showing ${v ?? 'nothing yet'}` });
          d.innerHTML = dieSVG(v, s.sides, COLORS[i % COLORS.length], useDots);
          return d;
        }),
      );
      tray.style.setProperty('--n', s.count);
      countEl.textContent = `${s.count} × d${s.sides}`;
      const sum = s.values.reduce((a, b) => a + b, 0);
      total.textContent = s.total && s.values.length > 1 && !spinning ? `Total: ${sum}` : '';
    }
    render();

    return {
      openSettings() {
        const quick = h('div', { class: 'chips' },
          ...QUICK.map((n) =>
            h('button', { class: `chip${n === s.sides ? ' on' : ''}`, onclick: (e) => { e.preventDefault(); setSides(n); ctx.openSettings(); } }, n === 2 ? '2 (coin)' : String(n)),
          ),
        );
        const setSides = (n) => {
          s.sides = Math.max(2, Math.min(1000, Math.round(n)));
          s.values = [];
          render();
          ctx.save();
        };
        panel(ctx, 'Dice',
          field('Number of sides (faces)', quick),
          field('Or type any number from 2 up', numberInput(s.sides, (v) => { if (v >= 2) setSides(v); }, { min: 2, max: 1000 })),
          checkbox('Show dots for numbers up to 9', s.dots, (v) => { s.dots = v; render(); ctx.save(); }),
          checkbox('Show total', s.total, (v) => { s.total = v; render(); ctx.save(); }),
        );
      },
    };
  },
};
