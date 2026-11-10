import { h } from '../util.js';
import { play } from '../sound.js';
import { panel, select, checkbox, textInput, field } from './_common.js';

export default {
  type: 'list',
  title: 'List',
  icon: '✅',
  group: 'core',
  size: [360, 340],
  hasSettings: true,
  defaultState: () => ({
    heading: 'Today we will…',
    items: [
      { text: 'Read the task', done: false },
      { text: 'Get your materials', done: false },
    ],
    style: 'check', // check | number | bullet | turns
    strike: true,
    current: 0, // turn order: whose turn it is
    round: 1,
    turnSound: true,
  }),

  mount(ctx) {
    const s = ctx.state;
    const heading = h('div', { class: 'list-heading', contenteditable: 'true', 'data-placeholder': 'Heading' });
    heading.textContent = s.heading;
    heading.addEventListener('input', () => { s.heading = heading.textContent; ctx.save(); });

    const ul = h('ul', { class: 'list-items' });
    // Turn order bar (initiative trackers, games, speaking order).
    const roundEl = h('span', { class: 'turn-round' });
    const turnBar = h('div', { class: 'turn-bar' },
      h('button', { class: 'btn', 'aria-label': 'Previous turn', onclick: () => step(-1) }, '◀'),
      roundEl,
      h('button', { class: 'btn primary turn-next', onclick: () => step(1) }, 'Next ▶'),
      h('button', { class: 'btn', title: 'Sort by number, highest first', 'aria-label': 'Sort by number', onclick: sortByValue }, '⇅'),
    );
    const live = (i) => !s.items[i]?.done;
    function step(dir) {
      const n = s.items.length;
      if (!n) return;
      if (!s.items.some((_, i) => live(i))) return;
      let i = s.current;
      for (let k = 0; k < n; k++) {
        i += dir;
        if (i >= n) { i = 0; s.round += 1; }
        if (i < 0) { i = n - 1; s.round = Math.max(1, s.round - 1); }
        if (live(i)) break;
      }
      s.current = i;
      if (dir > 0 && s.turnSound) play('ding');
      render();
      ctx.save();
      ul.querySelector('li.current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function sortByValue() {
      s.items.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
      s.current = 0;
      s.round = 1;
      render();
      ctx.save();
    }
    function move(i, d) {
      const j = i + d;
      if (j < 0 || j >= s.items.length) return;
      [s.items[i], s.items[j]] = [s.items[j], s.items[i]];
      if (s.current === i) s.current = j; else if (s.current === j) s.current = i;
      render();
      ctx.save();
    }
    const input = h('input', { type: 'text', placeholder: 'Add an item…', 'aria-label': 'New item' });
    const add = () => {
      const t = input.value.trim();
      if (!t) return;
      s.items.push({ text: t, done: false });
      input.value = '';
      render();
      ctx.save();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && add());

    ctx.view.append(
      h('div', { class: 'list' },
        heading,
        ul,
        turnBar,
        h('div', { class: 'list-add' }, input, h('button', { class: 'btn primary', onclick: add, 'aria-label': 'Add item' }, '+')),
      ),
    );

    function render() {
      const turns = s.style === 'turns';
      const movable = turns || s.style === 'number';
      if (s.current >= s.items.length) s.current = 0;
      ul.dataset.style = s.style;
      ul.classList.toggle('strike', s.strike);
      turnBar.hidden = !turns;
      roundEl.textContent = `Round ${s.round}`;
      input.placeholder = turns ? 'Add a name…' : 'Add an item…';
      ul.replaceChildren(
        ...s.items.map((item, i) => {
          const text = h('span', { class: 'li-text', contenteditable: 'true' });
          text.textContent = item.text;
          text.addEventListener('input', () => { item.text = text.textContent; ctx.save(); });
          text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); text.blur(); } });
          const valueBox = turns ? h('input', {
            class: 'li-value', type: 'text', inputmode: 'numeric', value: item.value ?? '', placeholder: '–',
            'aria-label': `Number for ${item.text}`, title: 'Number (e.g. initiative, HP or score)',
            oninput: (e) => { item.value = e.target.value; ctx.save(); },
          }) : null;
          const marker = turns
            ? h('span', { class: 'li-marker turn-mark', 'aria-hidden': 'true' }, i === s.current && !item.done ? '▶' : '')
            : s.style === 'check'
              ? h('button', {
                  class: `li-check${item.done ? ' on' : ''}`,
                  'aria-label': item.done ? 'Mark not done' : 'Mark done',
                  onclick: () => { item.done = !item.done; if (item.done) play('pop'); render(); ctx.save(); },
                }, item.done ? '✔' : '')
              : h('span', { class: 'li-marker' }, s.style === 'number' ? `${i + 1}.` : '•');
          return h('li', { class: `${item.done ? 'done' : ''}${turns && i === s.current && !item.done ? ' current' : ''}` },
            marker,
            valueBox,
            text,
            turns ? h('button', { class: 'li-skip', title: item.done ? 'Back in' : 'Skip their turns (out / away)', 'aria-label': item.done ? `Bring ${item.text} back` : `Skip ${item.text}`, onclick: () => { item.done = !item.done; if (item.done && i === s.current) step(1); render(); ctx.save(); } }, item.done ? '↩' : '💤') : null,
            movable ? h('button', { class: 'li-move', 'aria-label': `Move ${item.text} up`, onclick: () => move(i, -1) }, '▲') : null,
            movable ? h('button', { class: 'li-move', 'aria-label': `Move ${item.text} down`, onclick: () => move(i, 1) }, '▼') : null,
            h('button', { class: 'li-del', 'aria-label': 'Delete item', onclick: () => { s.items.splice(i, 1); if (s.current > i) s.current -= 1; render(); ctx.save(); } }, '✕'),
          );
        }),
      );
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'List settings',
          field('Heading', textInput(s.heading, (v) => { s.heading = v; heading.textContent = v; ctx.save(); })),
          field('Style', select([['check', 'Checklist'], ['number', 'Numbered'], ['bullet', 'Bullets'], ['turns', 'Turn order (initiative, games, speakers)']], s.style, (v) => { s.style = v; if (v === 'turns' && s.heading === 'Today we will…') { s.heading = 'Turn order'; heading.textContent = s.heading; } render(); ctx.save(); })),
          s.style === 'turns' ? h('div', { class: 'stack' },
            checkbox('Ding on each new turn', s.turnSound, (v) => { s.turnSound = v; ctx.save(); }),
            h('button', { class: 'btn', onclick: () => { s.current = 0; s.round = 1; s.items.forEach((i) => (i.done = false)); render(); ctx.save(); } }, '↺ Start again at round 1'),
            h('p', { class: 'hint' }, 'Type a number next to each name (e.g. initiative or HP), tap ⇅ to sort highest first, then Next ▶ for each turn. 💤 skips someone who is out or away.'),
          ) : null,
          checkbox('Cross out ticked items', s.strike, (v) => { s.strike = v; render(); ctx.save(); }),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => { s.items.forEach((i) => (i.done = false)); render(); ctx.save(); } }, 'Untick all'),
            h('button', { class: 'btn', onclick: () => { s.items = s.items.filter((i) => !i.done); render(); ctx.save(); } }, 'Remove ticked'),
          ),
        );
      },
    };
  },
};
