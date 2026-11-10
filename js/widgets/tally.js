import { h, parseLines, setKids } from '../util.js';
import { play } from '../sound.js';
import { logEvent, undoEvent, recBadge, RECORD_HINT } from '../datalog.js';
import { panel, checkbox, field, textarea, select } from './_common.js';
import { namesFor, sourceSelect, sourceName, onClassChange } from '../classes.js';

// Tally counter: tap to count things that happen (interruptions, great answers, kindness…),
// for the whole class or per student. Each tap is recorded in the Data log (on this device only).

const COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#7b2cbf', '#8ac926', '#ff6fb5', '#264653'];
const DEFAULT_CATS = '🗣️ Calling out\n🙋 Great question\n⭐ Kindness\n📵 Off task';

const parseCats = (text) =>
  parseLines(text).slice(0, 8).map((l, i) => {
    const m = l.match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u);
    return { icon: m ? m[1] : '•', name: (m ? m[2] : l) || `Item ${i + 1}`, color: COLORS[i % COLORS.length] };
  });

export default {
  type: 'tally',
  title: 'Tally',
  icon: '🔢',
  group: 'manage',
  size: [520, 380],
  hasSettings: true,
  privateKeys: ['students', 'counts'],
  defaultState: () => ({
    cats: DEFAULT_CATS,
    students: '',
    mode: 'class', // class | students
    source: 'current',
    current: 0, // selected category in student mode
    counts: {}, // "cat|who" -> number, for this lesson's display
    record: true,
    sound: true,
  }),

  mount(ctx) {
    const s = ctx.state;
    const wrap = h('div', { class: 'tally' });
    ctx.view.append(wrap);
    let last = null; // last recorded event, for Undo
    const key = (cat, who = '') => `${cat}|${who}`;

    async function tap(cat, who = '') {
      const k = key(cat.name, who);
      s.counts[k] = (s.counts[k] || 0) + 1;
      if (s.sound) play('pop');
      ctx.save();
      const el = wrap.querySelector(`[data-k="${CSS.escape(k)}"]`);
      el?.classList.remove('bump');
      void el?.offsetWidth;
      el?.classList.add('bump');
      if (s.record) last = { k, ev: await logEvent({ widget: 'tally', widgetId: ctx.rec.id, kind: 'tally', label: cat.name, who, value: 1, unit: 'count' }) };
      else last = { k, ev: null };
      render();
    }
    async function undo() {
      if (!last) return;
      s.counts[last.k] = Math.max(0, (s.counts[last.k] || 0) - 1);
      if (last.ev) await undoEvent(last.ev);
      last = null;
      ctx.save();
      render();
    }

    function render() {
      const cats = parseCats(s.cats);
      const students = namesFor(s.source) || parseLines(s.students);
      const perStudent = s.mode === 'students' && students.length;
      if (s.current >= cats.length) s.current = 0;
      const foot = h('div', { class: 'tally-foot' },
        s.record ? recBadge() : null,
        h('button', { class: 'btn small', disabled: !last, onclick: undo, title: 'Undo the last tap' }, '↶ Undo'),
        h('button', { class: 'btn small', onclick: () => { if (confirm('Start counting again from zero? (Recorded data is kept.)')) { s.counts = {}; last = null; ctx.save(); render(); } } }, '↺ New lesson'),
      );
      if (!cats.length) {
        wrap.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Add things to count'), h('button', { class: 'btn primary', onclick: () => ctx.openSettings() }, 'Set up')));
        return;
      }
      if (!perStudent) {
        setKids(wrap,
          h('div', { class: 'tally-cats', style: { '--n': cats.length } },
            ...cats.map((c) => h('button', { class: 'tally-btn', style: { '--c': c.color }, 'data-k': key(c.name), onclick: () => tap(c), 'aria-label': `Add one: ${c.name}` },
              h('span', { class: 'tb-ic' }, c.icon),
              h('span', { class: 'tb-name' }, c.name),
              h('span', { class: 'tb-count' }, String(s.counts[key(c.name)] || 0)),
            )),
          ),
          s.mode === 'students' ? h('p', { class: 'hint' }, 'Choose a class (👥 at the top) or add student names in ⚙ to count for each student.') : null,
          foot,
        );
        return;
      }
      const cat = cats[s.current];
      wrap.replaceChildren(
        h('div', { class: 'chips tally-pick' },
          ...cats.map((c, i) => h('button', { class: `chip${i === s.current ? ' on' : ''}`, style: { '--c': c.color }, onclick: () => { s.current = i; ctx.save(); render(); } }, `${c.icon} ${c.name}`)),
        ),
        h('div', { class: 'tally-students' },
          ...students.map((who) => {
            const k = key(cat.name, who);
            const n = s.counts[k] || 0;
            return h('button', { class: `tally-kid${n ? ' has' : ''}`, style: { '--c': cat.color }, 'data-k': k, onclick: () => tap(cat, who), 'aria-label': `${cat.name}: add one for ${who}` },
              h('span', { class: 'tk-name' }, who),
              h('span', { class: 'tk-count' }, n ? `${cat.icon} ${n}` : ''),
            );
          }),
        ),
        foot,
      );
    }
    render();
    const offClass = onClassChange(render);

    return {
      destroy: () => offClass(),
      resize: render,
      openSettings() {
        panel(ctx, 'Tally',
          field('Things to count (one per line, start with an emoji if you like)', textarea(s.cats, (v) => { s.cats = v; ctx.save(); }, { rows: 5 })),
          field('Count for', select([['class', 'The whole class'], ['students', 'Each student']], s.mode, (v) => { s.mode = v; ctx.save(); ctx.openSettings(); })),
          s.mode === 'students' ? field('Names from', sourceSelect(s.source, (v) => { s.source = v; ctx.save(); ctx.openSettings(); })) : null,
          s.mode === 'students' && (s.source === 'own' || !namesFor(s.source)) ? field('Student names (one per line)', textarea(s.students, (v) => { s.students = v; ctx.save(); }, { rows: 7, placeholder: 'Ava\nBen\nCharlie' })) : null,
          checkbox('📊 Record each tap in the Data log', s.record, (v) => { s.record = v; ctx.save(); }),
          checkbox('Pop sound on each tap', s.sound, (v) => { s.sound = v; ctx.save(); }),
          h('p', { class: 'hint' }, RECORD_HINT),
        );
      },
      closeSettings: render,
    };
  },
};
