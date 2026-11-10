import { h } from '../util.js';
import { play } from '../sound.js';
import { panel, select, textarea, field } from './_common.js';

// Visual schedule: "Now / Next / Then" cards. Great for routines and students who need predictability.

const parse = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)\s*(.*)$/u);
      return m ? { icon: m[1], text: m[2] } : { icon: '', text: l };
    });

export default {
  type: 'nownext',
  title: 'Now / Next',
  icon: '➡️',
  group: 'extras',
  size: [560, 280],
  hasSettings: true,
  defaultState: () => ({
    items: '📖 Reading\n✏️ Writing\n🍎 Recess\n🔬 Science\n🎨 Art\n🏠 Home time',
    index: 0,
    show: 2,
  }),

  mount(ctx) {
    const s = ctx.state;
    const row = h('div', { class: 'nn-row' });
    const back = h('button', { class: 'btn big', 'aria-label': 'Previous', onclick: () => go(-1) }, '◀');
    const fwd = h('button', { class: 'btn big primary', 'aria-label': 'Next activity', onclick: () => go(1) }, 'Done ✔');
    const progress = h('div', { class: 'nn-progress' });
    ctx.view.append(h('div', { class: 'nownext' }, row, h('div', { class: 'nn-foot' }, back, progress, fwd)));

    function go(d) {
      const items = parse(s.items);
      const ni = Math.max(0, Math.min(items.length - 1, s.index + d));
      if (ni === s.index) return;
      s.index = ni;
      if (d > 0) play('ding');
      ctx.save();
      render(d > 0);
    }

    function render(animate = false) {
      const items = parse(s.items);
      if (s.index >= items.length) s.index = Math.max(0, items.length - 1);
      const labels = ['Now', 'Next', 'Then'];
      row.style.setProperty('--n', s.show);
      row.replaceChildren(
        ...labels.slice(0, s.show).map((label, k) => {
          const it = items[s.index + k];
          return h('div', { class: `nn-card${k === 0 ? ' now' : ''}${animate ? ' slide' : ''}${it ? '' : ' blank'}` },
            h('div', { class: 'nn-label' }, label),
            h('div', { class: 'nn-icon', 'aria-hidden': 'true' }, it?.icon || (it ? '' : '🏁')),
            h('div', { class: 'nn-text' }, it ? it.text : k === 0 ? 'All done!' : ''),
          );
        }),
      );
      back.disabled = s.index === 0;
      fwd.disabled = s.index >= items.length - 1;
      progress.replaceChildren(...items.map((_, i) => h('span', { class: i < s.index ? 'done' : i === s.index ? 'cur' : '' })));
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'Now / Next',
          field('Activities in order (one per line, start with an emoji if you like)', textarea(s.items, (v) => { s.items = v; ctx.save(); }, { rows: 8 })),
          field('Show', select([[2, 'Now + Next'], [3, 'Now + Next + Then']], s.show, (v) => { s.show = Number(v); ctx.save(); })),
          h('button', { class: 'btn', onclick: () => { s.index = 0; ctx.save(); ctx.closeSettings(); } }, 'Start again from the top'),
        );
      },
      closeSettings: () => render(),
    };
  },
};
