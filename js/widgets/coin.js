import { h, setKids } from '../util.js';
import { play } from '../sound.js';
import { panel, checkbox, field, textInput } from './_common.js';

// Coin flip: flip 1–10 coins, keep a heads/tails tally with percentages for chance experiments.

export default {
  type: 'coin',
  title: 'Coin flip',
  icon: '🪙',
  group: 'extras',
  size: [420, 360],
  hasSettings: true,
  defaultState: () => ({ count: 1, faces: [], heads: 0, tails: 0, recent: [], headLabel: 'Heads', tailLabel: 'Tails' }),

  mount(ctx) {
    const s = ctx.state;
    const tray = h('button', { class: 'coin-tray', title: 'Tap to flip', 'aria-label': 'Flip', onclick: flip });
    const result = h('div', { class: 'coin-result', 'aria-live': 'polite' });
    const stats = h('div', { class: 'coin-stats' });
    const countEl = h('span', { class: 'dice-count' });
    ctx.view.append(h('div', { class: 'coin' }, tray, result, stats,
      h('div', { class: 'dice-foot' },
        h('button', { class: 'btn small', 'aria-label': 'Fewer coins', onclick: () => setCount(s.count - 1) }, '−'),
        countEl,
        h('button', { class: 'btn small', 'aria-label': 'More coins', onclick: () => setCount(s.count + 1) }, '+'),
        h('button', { class: 'btn primary big', onclick: flip }, 'Flip'),
        h('button', { class: 'btn small', title: 'Flip 100 times at once', onclick: () => flipMany(100) }, '×100'),
        h('button', { class: 'btn small', onclick: () => { s.heads = s.tails = 0; s.recent = []; s.faces = []; ctx.save(); render(); } }, '↺'),
      ),
    ));

    let flipping = false;
    function setCount(n) {
      s.count = Math.max(1, Math.min(10, n));
      s.faces = s.faces.slice(0, s.count);
      ctx.save();
      render();
    }
    const toss = () => (Math.random() < 0.5 ? 'H' : 'T');

    function flip() {
      if (flipping) return;
      flipping = true;
      const out = Array.from({ length: s.count }, toss);
      tray.querySelectorAll('.coin-face').forEach((c, i) => {
        c.classList.remove('flip-h', 'flip-t');
        void c.offsetWidth;
        c.classList.add(out[i] === 'H' ? 'flip-h' : 'flip-t');
      });
      play('pop');
      setTimeout(() => {
        s.faces = out;
        for (const f of out) f === 'H' ? s.heads++ : s.tails++;
        s.recent = [...out, ...s.recent].slice(0, 30);
        play('ding');
        flipping = false;
        ctx.save();
        render();
      }, 1100);
    }

    function flipMany(n) {
      if (flipping) return;
      let hN = 0;
      for (let i = 0; i < n; i++) if (toss() === 'H') hN++;
      s.heads += hN;
      s.tails += n - hN;
      s.faces = [];
      play('ding');
      result.textContent = `${n} flips: ${hN} ${s.headLabel.toLowerCase()}, ${n - hN} ${s.tailLabel.toLowerCase()}`;
      ctx.save();
      render(true);
    }

    function coinEl(face) {
      return h('div', { class: `coin-face${face === 'T' ? ' show-t' : ''}` },
        h('div', { class: 'coin-side heads' }, h('span', {}, 'H'), h('small', {}, s.headLabel)),
        h('div', { class: 'coin-side tails' }, h('span', {}, 'T'), h('small', {}, s.tailLabel)),
      );
    }

    function render(keepResult = false) {
      tray.replaceChildren(...Array.from({ length: s.count }, (_, i) => coinEl(s.faces[i] || 'H')));
      tray.style.setProperty('--n', s.count);
      countEl.textContent = `${s.count} coin${s.count === 1 ? '' : 's'}`;
      if (!keepResult) {
        const hN = s.faces.filter((f) => f === 'H').length;
        result.textContent = !s.faces.length ? 'Tap to flip!' : s.count === 1 ? (s.faces[0] === 'H' ? s.headLabel : s.tailLabel) : `${hN} ${s.headLabel.toLowerCase()}, ${s.count - hN} ${s.tailLabel.toLowerCase()}`;
      }
      const total = s.heads + s.tails;
      const hp = total ? (s.heads / total) * 100 : 50;
      setKids(stats,
        total ? h('div', { class: 'coin-bar', title: `${Math.round(hp)}% ${s.headLabel}` },
          h('i', { style: { width: `${hp}%` } }, `${s.headLabel} ${s.heads} (${Math.round(hp)}%)`),
          h('b', {}, `${s.tailLabel} ${s.tails} (${Math.round(100 - hp)}%)`),
        ) : null,
        total ? h('div', { class: 'coin-recent' }, ...s.recent.slice(0, 20).map((f) => h('span', { class: f === 'H' ? 'h' : 't' }, f))) : null,
      );
    }
    render();

    return {
      resize: () => render(true),
      openSettings() {
        panel(ctx, 'Coin flip',
          h('div', { class: 'row' },
            field('Heads side', textInput(s.headLabel, (v) => { s.headLabel = v || 'Heads'; ctx.save(); })),
            field('Tails side', textInput(s.tailLabel, (v) => { s.tailLabel = v || 'Tails'; ctx.save(); })),
          ),
          h('p', { class: 'hint' }, 'Rename the sides for quick choices, e.g. “Boys first / Girls first” or “Team A / Team B”. Try ×100 to see the results even out near 50%.'),
        );
      },
      closeSettings: () => render(),
    };
  },
};
