import { h, parseLines, shuffle } from '../util.js';
import { play } from '../sound.js';
import { panel, select, numberInput, textarea, field, PALETTE } from './_common.js';
import { namesFor, sourceSelect, sourceName, onClassChange } from '../classes.js';

export default {
  type: 'groupmaker',
  title: 'Group maker',
  icon: '👥',
  group: 'manage',
  size: [560, 400],
  hasSettings: true,
  privateKeys: ['names', 'groups'],
  defaultState: () => ({ source: 'current', names: '', by: 'count', n: 4, groups: [] }),

  mount(ctx) {
    const s = ctx.state;
    const allNames = () => namesFor(s.source) || parseLines(s.names);
    const grid = h('div', { class: 'groups' });
    const empty = h('div', { class: 'empty' },
      h('p', {}, 'Choose a class (👥 at the top) or add names, then make random groups'),
      h('button', { class: 'btn primary', onclick: () => ctx.openSettings() }, 'Add names'),
    );
    const byLabel = h('span', {});
    const nIn = h('input', { type: 'number', min: 1, max: 30, value: s.n, 'aria-label': 'Number', class: 'small-num' });
    nIn.addEventListener('input', () => { const v = Number(nIn.value); if (v >= 1) { s.n = v; ctx.save(); } });
    const foot = h('div', { class: 'group-foot' },
      h('button', { class: 'btn primary big', onclick: make }, '🔀 Make groups'),
      nIn, byLabel,
    );
    ctx.view.append(h('div', { class: 'groupmaker' }, empty, grid, foot));

    function make() {
      const names = shuffle(allNames());
      if (!names.length) return;
      const count = s.by === 'count' ? Math.min(s.n, names.length) : Math.max(1, Math.ceil(names.length / s.n));
      const groups = Array.from({ length: count }, () => []);
      names.forEach((n, i) => groups[i % count].push(n));
      s.groups = groups;
      play('pop');
      ctx.save();
      render(true);
    }

    function render(animate = false) {
      const has = allNames().length > 0;
      empty.hidden = has;
      foot.hidden = !has;
      byLabel.textContent = s.by === 'count' ? 'groups' : 'per group';
      nIn.value = s.n;
      grid.replaceChildren(
        ...s.groups.map((grp, i) =>
          h('div', { class: `group${animate ? ' pop' : ''}`, style: { '--c': PALETTE[i % PALETTE.length], animationDelay: `${i * 60}ms` } },
            h('div', { class: 'group-title' }, `Group ${i + 1}`),
            h('ul', {}, ...grp.map((n) => h('li', {}, n))),
          ),
        ),
      );
    }
    render();
    const offClass = onClassChange(() => render());

    return {
      destroy: () => offClass(),
      openSettings() {
        panel(ctx, 'Group maker',
          field('Names from', sourceSelect(s.source, (v) => { s.source = v; ctx.save(); ctx.openSettings(); })),
          s.source === 'own' || !namesFor(s.source)
            ? field('Names (one per line)', textarea(s.names, (v) => { s.names = v; ctx.save(); }, { rows: 8, placeholder: 'Ava\nBen\nCharlie' }))
            : h('p', { class: 'hint' }, `Using ${allNames().length} names from ${sourceName(s.source)}. Edit them in ☰ → Classes & student lists.`),
          h('div', { class: 'row' },
            field('Make', select([['count', 'this many groups'], ['size', 'groups of this size']], s.by, (v) => { s.by = v; ctx.save(); })),
            field('Number', numberInput(s.n, (v) => { if (v >= 1) { s.n = v; ctx.save(); } }, { min: 1, max: 30 })),
          ),
          h('p', { class: 'hint' }, 'Names stay on this device. They are left out of share links unless you choose to include them.'),
        );
      },
      closeSettings: () => render(),
    };
  },
};
