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
    style: 'check', // check | number | bullet
    strike: true,
  }),

  mount(ctx) {
    const s = ctx.state;
    const heading = h('div', { class: 'list-heading', contenteditable: 'true', 'data-placeholder': 'Heading' });
    heading.textContent = s.heading;
    heading.addEventListener('input', () => { s.heading = heading.textContent; ctx.save(); });

    const ul = h('ul', { class: 'list-items' });
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
        h('div', { class: 'list-add' }, input, h('button', { class: 'btn primary', onclick: add, 'aria-label': 'Add item' }, '+')),
      ),
    );

    function render() {
      ul.dataset.style = s.style;
      ul.classList.toggle('strike', s.strike);
      ul.replaceChildren(
        ...s.items.map((item, i) => {
          const text = h('span', { class: 'li-text', contenteditable: 'true' });
          text.textContent = item.text;
          text.addEventListener('input', () => { item.text = text.textContent; ctx.save(); });
          text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); text.blur(); } });
          const marker =
            s.style === 'check'
              ? h('button', {
                  class: `li-check${item.done ? ' on' : ''}`,
                  'aria-label': item.done ? 'Mark not done' : 'Mark done',
                  onclick: () => { item.done = !item.done; if (item.done) play('pop'); render(); ctx.save(); },
                }, item.done ? '✔' : '')
              : h('span', { class: 'li-marker' }, s.style === 'number' ? `${i + 1}.` : '•');
          return h('li', { class: item.done ? 'done' : '' },
            marker,
            text,
            h('button', { class: 'li-del', 'aria-label': 'Delete item', onclick: () => { s.items.splice(i, 1); render(); ctx.save(); } }, '✕'),
          );
        }),
      );
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'List settings',
          field('Heading', textInput(s.heading, (v) => { s.heading = v; heading.textContent = v; ctx.save(); })),
          field('Style', select([['check', 'Checklist'], ['number', 'Numbered'], ['bullet', 'Bullets']], s.style, (v) => { s.style = v; render(); ctx.save(); })),
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
