import { h } from '../util.js';
import { play } from '../sound.js';
import { panel, select, checkbox, field } from './_common.js';

// Which of the 9 grid cells hold a pip, for faces 1–6.
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const COLORS = ['#ffffff', '#e63946', '#1982c4', '#2a9d8f', '#f4a261', '#7b2cbf'];

export default {
  type: 'dice',
  title: 'Dice',
  icon: '🎲',
  group: 'extras',
  size: [380, 260],
  hasSettings: true,
  defaultState: () => ({ count: 2, sides: 6, values: [], total: true }),

  mount(ctx) {
    const s = ctx.state;
    const tray = h('button', { class: 'dice-tray', title: 'Tap to roll', onclick: roll });
    const total = h('div', { class: 'dice-total', 'aria-live': 'polite' });
    ctx.view.append(h('div', { class: 'dice' }, tray, total,
      h('div', { class: 'dice-foot' },
        h('button', { class: 'btn small', 'aria-label': 'Fewer dice', onclick: () => setCount(s.count - 1) }, '−'),
        h('span', { class: 'dice-count' }),
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

    function face(v, i, spinning) {
      const d = h('div', { class: `die${spinning ? ' rolling' : ''}`, style: { '--die': COLORS[i % COLORS.length] } });
      if (s.sides === 6 && v) {
        const grid = h('div', { class: 'pips' });
        for (let c = 0; c < 9; c++) grid.append(h('span', { class: PIPS[v].includes(c) ? 'pip' : '' }));
        d.append(grid);
      } else d.append(h('span', { class: 'die-num' }, v || '?'));
      d.setAttribute('aria-label', `Die showing ${v || 'nothing yet'}`);
      return d;
    }

    function render(spinning = false) {
      tray.replaceChildren(...Array.from({ length: s.count }, (_, i) => face(s.values[i], i, spinning)));
      tray.style.setProperty('--n', s.count);
      ctx.view.querySelector('.dice-count').textContent = `${s.count} ${s.count === 1 ? 'die' : 'dice'}`;
      const sum = s.values.reduce((a, b) => a + b, 0);
      total.textContent = s.total && s.values.length > 1 && !spinning ? `Total: ${sum}` : '';
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'Dice',
          field('Sides', select([[4, '4'], [6, '6 (dots)'], [8, '8'], [10, '10'], [12, '12'], [20, '20'], [100, '100']], s.sides, (v) => { s.sides = Number(v); s.values = []; render(); ctx.save(); })),
          checkbox('Show total', s.total, (v) => { s.total = v; render(); ctx.save(); }),
        );
      },
    };
  },
};
