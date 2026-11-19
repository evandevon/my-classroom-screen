import { h } from '../util.js';
import { panel, field, textInput } from './_common.js';
import { namesFor, sourceName, onClassChange, currentClass, classLists, showClassPicker } from '../classes.js';

// Progress: a row for each student in the class with tick boxes, so children can walk up and
// mark how far through a task they are. Rows spread into as many columns as fit the widget.
// Ticks are kept per class, so the same screen works for every class you teach.

const MIN_TICKS = 1;
const MAX_TICKS = 10;

/** How wide a name is compared with its font size (longest name in the list). */
let measureCtx = null;
function nameRatio(names) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = '700 100px system-ui, sans-serif';
  let w = 0;
  for (const n of names) w = Math.max(w, measureCtx.measureText(n).width);
  return w / 100;
}

/**
 * Pick the number of columns that makes the tick boxes biggest.
 * Each row is: name (font ≈ 0.5 × box) + gap + ticks × (box + gap).
 */
function layout(W, H, count, ticks, ratio) {
  let best = { cols: 1, box: 0 };
  for (let cols = 1; cols <= Math.min(8, count); cols++) {
    const rows = Math.ceil(count / cols);
    const colW = (W - (cols - 1) * 14) / cols;
    const byHeight = Math.min((H - (rows - 1) * 4) / rows / 1.15, (H - (rows - 1) * 4) / rows - 4);
    const nameW = Math.min(ratio * 0.5, 4.5);   // very long names get cut short with …
    const byWidth = (colW - 12) / (nameW + 0.5 + ticks * 1.18);
    const box = Math.min(byHeight, byWidth, 72);
    if (box > best.box + 0.5) best = { cols, box };
  }
  return best;
}

export default {
  type: 'progress',
  title: 'Progress',
  icon: '✅',
  group: 'manage',
  size: [860, 580],
  /** Saved to My widgets: keep the settings and content, start the activity fresh. */
  fresh(s) { s.ticks = {}; },
  hasSettings: true,
  privateKeys: ['ticks'],
  defaultState: () => ({ source: 'current', count: 3, heading: '', ticks: {} }),   // ticks: classId → name → [true, false…]

  mount(ctx) {
    const s = ctx.state;
    s.heading ??= '';   // widgets made before headings existed
    const wrap = h('div', { class: 'prog' });
    ctx.view.append(wrap);
    // Optional heading (e.g. "Science report: plan · draft · edit"). Hidden when empty, so the boxes get the room.
    const heading = h('div', { class: 'prog-heading', contenteditable: 'true', spellcheck: 'true', 'aria-label': 'Heading' });
    heading.textContent = s.heading || '';
    heading.addEventListener('input', () => { s.heading = heading.textContent; ctx.save(); });
    heading.addEventListener('blur', () => { if (!s.heading.trim()) { s.heading = ''; ctx.save(); render(); } });
    heading.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); heading.blur(); } });

    const classId = () => (s.source === 'current' || !s.source ? currentClass()?.id : s.source);
    const ticksFor = (name) => s.ticks[classId()]?.[name] || [];
    function toggle(name, i) {
      const id = classId();
      const t = ((s.ticks[id] ||= {})[name] ||= []);
      t[i] = !t[i];
      ctx.save();
      render();
    }

    function setCount(n) {
      s.count = Math.max(MIN_TICKS, Math.min(MAX_TICKS, n));
      ctx.save();
      render();
    }
    function reset() {
      const id = classId();
      if (!id || !Object.values(s.ticks[id] || {}).some((t) => t.some(Boolean))) return;
      if (!confirm(`Untick everyone in ${sourceName(s.source)}?`)) return;
      s.ticks[id] = {};
      ctx.save();
      render();
    }

    function render() {
      const names = namesFor(s.source);
      if (!names) {
        const none = !classLists().length;
        wrap.replaceChildren(h('div', { class: 'empty' },
          h('p', {}, none ? 'Make a class list first, then each student gets a row of tick boxes.' : 'Choose a class — each student gets a row of tick boxes.'),
          h('button', { class: 'btn primary', onclick: showClassPicker }, none ? '👥 Make a class' : '👥 Choose a class'),
        ));
        return;
      }
      const n = s.count;
      const foot = h('div', { class: 'prog-foot' },
        h('span', { class: 'prog-class' }, sourceName(s.source)),
        h('div', { class: 'prog-count', role: 'group', 'aria-label': 'Tick boxes for each student' },
          h('button', { class: 'btn small', disabled: n <= MIN_TICKS, onclick: () => setCount(n - 1), 'aria-label': 'One tick box fewer', title: 'One tick box fewer' }, '−'),
          h('span', {}, `${n} ✓`),
          h('button', { class: 'btn small', disabled: n >= MAX_TICKS, onclick: () => setCount(n + 1), 'aria-label': 'One more tick box', title: 'One more tick box' }, '+'),
        ),
        h('button', { class: 'btn small', onclick: reset, title: 'Untick everyone' }, '↺ Reset'),
      );
      const grid = h('div', { class: 'prog-grid' });
      wrap.replaceChildren(...(s.heading.trim() ? [heading] : []), grid, foot);
      // fit the rows to the space left above the footer
      const W = grid.clientWidth, H = grid.clientHeight;
      const { cols, box } = layout(W, H, names.length, n, nameRatio(names));
      grid.style.setProperty('--cols', cols);
      grid.style.setProperty('--box', `${Math.max(14, box).toFixed(1)}px`);
      grid.style.setProperty('--rows', Math.ceil(names.length / cols));
      for (const name of names) {
        const t = ticksFor(name);
        const done = Array.from({ length: n }, (_, i) => !!t[i]).every(Boolean);
        const row = h('div', { class: `prog-row${done ? ' done' : ''}` },
          h('span', { class: 'prog-name', title: name }, name),
          h('span', { class: 'prog-ticks' },
            ...Array.from({ length: n }, (_, i) => h('button', {
              class: `prog-box${t[i] ? ' on' : ''}`,
              'aria-pressed': String(!!t[i]),
              'aria-label': `${name}: step ${i + 1}`,
              onclick: () => toggle(name, i),
            }, t[i] ? '✓' : '')),
          ),
        );
        grid.append(row);
      }
    }
    render();
    const offClass = onClassChange(render);

    return {
      destroy: () => offClass(),
      resize: render,
      openSettings() {
        const sel = h('select', { onchange: (e) => { s.source = e.target.value; ctx.save(); render(); } });
        const cur = currentClass();
        for (const [v, t] of [['current', `The current class${cur ? ` (${cur.name})` : ' (none chosen yet)'}`], ...classLists().map((c) => [c.id, c.name])]) {
          const o = h('option', { value: v }, t);
          if (v === (s.source || 'current')) o.selected = true;
          sel.append(o);
        }
        panel(ctx, 'Progress',
          field('Heading (optional — what the ticks are for)', textInput(s.heading, (v) => { s.heading = v; heading.textContent = v; ctx.save(); render(); }, { placeholder: 'e.g. Science report: plan, draft, edit, publish' })),
          field('Rows for', sel),
          h('p', { class: 'hint' }, 'Each student’s ticks are kept with their class, so you can use this screen with every class. Use + and − at the bottom for more or fewer tick boxes.'),
        );
      },
    };
  },
};
