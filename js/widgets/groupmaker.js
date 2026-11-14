import { h, parseLines, shuffle, toast } from '../util.js';
import { play } from '../sound.js';
import { panel, select, numberInput, textarea, field, PALETTE } from './_common.js';
import { namesFor, sourceSelect, sourceName, onClassChange, apartFor } from '../classes.js';

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

    /** Random groups, as even in size as possible, never putting a "keep apart" pair together if it can be helped. */
    function deal(names, count, apart) {
      const clash = new Map(names.map((n) => [n, new Set()]));
      for (const [a, b] of apart) if (clash.has(a) && clash.has(b)) { clash.get(a).add(b); clash.get(b).add(a); }
      const caps = Array.from({ length: count }, (_, i) => Math.floor(names.length / count) + (i < names.length % count ? 1 : 0));
      let best = null;
      for (let attempt = 0; attempt < 400; attempt++) {
        // students with the most "keep apart"s go first, the rest in random order
        const order = shuffle(names).sort((a, b) => clash.get(b).size - clash.get(a).size);
        const groups = Array.from({ length: count }, () => []);
        const capsLeft = shuffle(caps);
        let clashes = 0;
        for (const n of order) {
          const open = groups.map((g, i) => i).filter((i) => groups[i].length < capsLeft[i]);
          const ok = open.filter((i) => !groups[i].some((m) => clash.get(n).has(m)));
          const pool = ok.length ? ok : open;
          if (!ok.length) clashes++;
          const smallest = Math.min(...pool.map((i) => groups[i].length));
          const pick = shuffle(pool.filter((i) => groups[i].length === smallest))[0];
          groups[pick].push(n);
        }
        if (!best || clashes < best.clashes) best = { groups, clashes };
        if (!clashes) break;
      }
      return best;
    }

    function make() {
      const names = allNames();
      if (!names.length) return;
      const count = s.by === 'count' ? Math.min(s.n, names.length) : Math.max(1, Math.ceil(names.length / s.n));
      const { groups, clashes } = deal(names, count, apartFor(s.source));
      if (clashes) toast(`Couldn’t keep everyone apart in ${count} group${count === 1 ? '' : 's'}: ${clashes} had to share with someone on their keep-apart list. Try more groups.`);
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
          apartFor(s.source).length
            ? h('p', { class: 'hint' }, `🚫 Keeping ${apartFor(s.source).length} pair${apartFor(s.source).length === 1 ? '' : 's'} apart (set in ☰ → Classes & student lists).`)
            : s.source !== 'own' ? h('p', { class: 'hint' }, '🚫 To keep certain students out of the same group, set “Keep apart” pairs in ☰ → Classes & student lists.') : null,
          h('p', { class: 'hint' }, 'Names stay on this device. They are left out of share links unless you choose to include them.'),
        );
      },
      closeSettings: () => render(),
    };
  },
};
