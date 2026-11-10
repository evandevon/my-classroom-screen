import { h, uid } from '../util.js';
import { play, soundSelect } from '../sound.js';
import { onTick } from '../ticker.js';
import { panel, checkbox, field, select } from './_common.js';

// School day timeline: coloured sessions with icons, a moving "now" marker,
// and "Now / Next" countdowns. Plans can be the same every day or differ by weekday.

export const ICONS = [
  '📖', '📚', '✏️', '📝', '🔤', '🔢', '➗', '🧮', '📏', '🔬', '🧪', '🧲', '🌏', '🗺️', '🦘', '🌱',
  '🐛', '🦖', '🚀', '💻', '🤖', '🔧', '🎨', '🖍️', '✂️', '🎵', '🎤', '🎭', '💃', '🎬', '📷', '⚽',
  '🏃', '🏊', '🧘', '🤸', '🍎', '🥪', '🧃', '🍉', '🏫', '🔔', '📣', '🗣️', '👂', '🤝', '🙏', '❤️',
  '🧠', '⭐', '🏆', '🎉', '🧩', '🎲', '🎧', '📺', '🚌', '🎒', '🧹', '🏠', '📅', '⏰', '☀️', '🌈',
];
export const COLOURS = [
  '#457b9d', '#2a9d8f', '#7b2cbf', '#e63946', '#f4a261', '#e9c46a', '#8ac926', '#1982c4', '#ff6fb5', '#264653',
  '#8ecae6', '#b8e0d2', '#cdb4db', '#ffc8dd', '#ffd6a5', '#fdffb6', '#caffbf', '#a0c4ff', '#bdb2ff', '#d6d6d6',
];

const s_ = (start, end, icon, name, color) => ({ id: uid('ss'), start, end, icon, name, color });
export const TEMPLATES = {
  nsw: {
    label: 'Typical primary school day',
    make: () => [
      s_('09:00', '09:15', '🏫', 'Roll & morning jobs', '#8ecae6'),
      s_('09:15', '10:15', '📖', 'Literacy', '#457b9d'),
      s_('10:15', '11:00', '🔢', 'Maths', '#2a9d8f'),
      s_('11:00', '11:30', '🍎', 'Recess', '#f4a261'),
      s_('11:30', '12:15', '🔬', 'Science', '#7b2cbf'),
      s_('12:15', '13:00', '🎨', 'Creative arts', '#ff6fb5'),
      s_('13:00', '13:40', '🥪', 'Lunch', '#e9c46a'),
      s_('13:40', '14:20', '⚽', 'Sport', '#8ac926'),
      s_('14:20', '14:55', '📚', 'Quiet reading', '#1982c4'),
      s_('14:55', '15:00', '🎒', 'Pack up', '#d6d6d6'),
    ],
  },
  rff: {
    label: 'Specialist / RFF lessons',
    make: () => [
      s_('09:00', '10:00', '🔬', 'Class A — Science', '#2a9d8f'),
      s_('10:00', '11:00', '💻', 'Class B — Technology', '#457b9d'),
      s_('11:00', '11:30', '🍎', 'Recess', '#f4a261'),
      s_('11:30', '12:30', '🔬', 'Class C — Science', '#2a9d8f'),
      s_('12:30', '13:00', '📝', 'Planning', '#d6d6d6'),
      s_('13:00', '13:40', '🥪', 'Lunch', '#e9c46a'),
      s_('13:40', '15:00', '🤖', 'Class D — Robotics', '#7b2cbf'),
    ],
  },
  lesson: {
    label: 'One lesson (60 min)',
    make: () => {
      const n = new Date();
      const t = (m) => { const d = new Date(n); d.setMinutes(Math.ceil(n.getMinutes() / 5) * 5 + m, 0, 0); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
      return [
        s_(t(0), t(10), '🗣️', 'Warm up', '#8ecae6'),
        s_(t(10), t(25), '🧑‍🏫', 'Learn', '#457b9d'),
        s_(t(25), t(50), '✏️', 'Try it', '#2a9d8f'),
        s_(t(50), t(55), '🧹', 'Pack up', '#d6d6d6'),
        s_(t(55), t(60), '⭐', 'Share & reflect', '#e9c46a'),
      ];
    },
  },
  blank: { label: 'Blank', make: () => [s_('09:00', '09:30', '📌', 'First session', '#457b9d')] },
};

const toMin = (t) => { const [a, b] = String(t || '0:0').split(':').map(Number); return a * 60 + b; };
const toHHMM = (m) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function inkFor(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1d1d1f' : '#ffffff';
}

/** Parse "9:00-9:40 📖 Reading" style lines (also "9:00 📖 Reading" — ends at next start). */
export function parsePlan(text, h12guess = true) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,2})[:.](\d{2})\s*(?:(am|pm))?\s*(?:[-–—to]+\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?)?\s*(.*)$/i);
    if (!m) continue;
    const fix = (hh, mm, ap) => {
      let hr = Number(hh);
      if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && hr < 12) hr += 12; if (ap === 'am' && hr === 12) hr = 0; }
      else if (h12guess && hr >= 1 && hr <= 6) hr += 12; // "1:00" in a school day means 1 pm
      return hr * 60 + Number(mm);
    };
    const start = fix(m[1], m[2], m[3]);
    const end = m[4] ? fix(m[4], m[5], m[6]) : null;
    let rest = m[7].trim();
    const em = rest.match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)\s*/u);
    const icon = em ? em[1] : '📌';
    if (em) rest = rest.slice(em[0].length);
    rows.push({ start, end, icon, name: rest || 'Session' });
  }
  rows.sort((a, b) => a.start - b.start);
  return rows.map((r, i) => s_(toHHMM(r.start), toHHMM(r.end ?? rows[i + 1]?.start ?? r.start + 30), r.icon, r.name, COLOURS[i % 10]));
}
const planToText = (plan) => plan.map((p) => `${p.start}-${p.end} ${p.icon} ${p.name}`).join('\n');

export default {
  type: 'schoolday',
  title: 'School day',
  icon: '🗓️',
  group: 'core',
  size: [860, 260],
  hasSettings: true,
  defaultState: () => ({
    plans: { all: TEMPLATES.nsw.make() },
    layout: 'auto', // auto | across | down
    showTimes: true,
    chime: false,
    chimeSound: 'chime',
    fired: {},
  }),

  mount(ctx) {
    const s = ctx.state;
    const head = h('div', { class: 'sday-head' });
    const track = h('div', { class: 'sday-track' });
    const marker = h('div', { class: 'sday-now', 'aria-hidden': 'true' }, h('span', {}, 'now'));
    const wrap = h('div', { class: 'sday' }, head, h('div', { class: 'sday-trackwrap' }, track, marker));
    ctx.view.append(wrap);

    const planFor = (d) => s.plans[String(d.getDay())] || s.plans.all || [];
    let lastKey = '';

    function render(force = false) {
      const d = new Date();
      const plan = [...planFor(d)].sort((a, b) => toMin(a.start) - toMin(b.start));
      const now = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
      wrap.dataset.layout = s.layout;
      if (!plan.length) {
        head.replaceChildren(h('div', { class: 'sday-big' }, 'No sessions for today'), h('button', { class: 'btn', onclick: () => ctx.openSettings() }, 'Add sessions'));
        track.replaceChildren();
        marker.hidden = true;
        return;
      }
      const first = toMin(plan[0].start);
      const last = Math.max(...plan.map((p) => toMin(p.end)));
      const cur = plan.find((p) => now >= toMin(p.start) && now < toMin(p.end));
      const next = plan.find((p) => toMin(p.start) > now);
      const fmt = (hhmm) => { const x = new Date(d); x.setHours(0, toMin(hhmm), 0, 0); return x.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
      const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : m >= 1 ? `${Math.ceil(m)} min` : `${Math.ceil(m * 60)} sec`);

      // header: Now / Next
      const nowBox = cur
        ? h('div', { class: 'sday-nowbox', style: { '--c': cur.color, '--ink': inkFor(cur.color) } },
            h('span', { class: 'sday-label' }, 'Now'),
            h('span', { class: 'sday-ic' }, cur.icon),
            h('span', { class: 'sday-name' }, cur.name),
            h('span', { class: 'sday-left' }, `${mins(toMin(cur.end) - now)} left`))
        : now < first
          ? h('div', { class: 'sday-nowbox idle' },
              h('span', { class: 'sday-ic' }, '🌅'),
              h('span', { class: 'sday-name' }, `Starts at ${fmt(plan[0].start)}`),
              h('span', { class: 'sday-left' }, `in ${mins(first - now)}`))
          : next
            ? h('div', { class: 'sday-nowbox idle' },
                h('span', { class: 'sday-label' }, 'Now'),
                h('span', { class: 'sday-ic' }, '☕'),
                h('span', { class: 'sday-name' }, 'Break'),
                h('span', { class: 'sday-left' }, `${mins(toMin(next.start) - now)} until ${next.name}`))
            : h('div', { class: 'sday-nowbox idle' },
                h('span', { class: 'sday-ic' }, '🏠'),
                h('span', { class: 'sday-name' }, 'Finished for today!'));
      const nextBox = next
        ? h('div', { class: 'sday-nextbox' },
            h('span', { class: 'sday-label' }, 'Next'),
            h('span', { class: 'sday-ic' }, next.icon),
            h('span', { class: 'sday-name' }, next.name),
            h('span', { class: 'sday-at' }, fmt(next.start)))
        : null;
      head.replaceChildren(nowBox, ...(nextBox ? [nextBox] : []));

      // track (rebuild only when the minute or plan changes; marker moves every tick)
      const key = `${Math.floor(now)}|${JSON.stringify(plan)}|${s.showTimes}|${s.layout}`;
      if (force || key !== lastKey) {
        lastKey = key;
        const items = [];
        let t = first;
        for (const p of plan) {
          const st = toMin(p.start);
          if (st > t) items.push({ gap: true, len: st - t });
          const len = Math.max(1, toMin(p.end) - st);
          items.push({ p, len });
          t = Math.max(t, toMin(p.end));
        }
        const totalLen = items.reduce((a, it) => a + it.len, 0) || 1;
        const vertical = getComputedStyle(track).flexDirection === 'column';
        const trackSize = vertical ? track.clientHeight : track.clientWidth;
        track.replaceChildren(
          ...items.map((it) => {
            if (it.gap) return h('div', { class: 'sday-gap', style: { flexGrow: it.len } });
            const p = it.p;
            const st = toMin(p.start);
            const en = toMin(p.end);
            const state = now >= en ? 'past' : now >= st ? 'current' : 'future';
            const frac = state === 'current' ? (now - st) / (en - st) : state === 'past' ? 1 : 0;
            const px = (it.len / totalLen) * trackSize;
            const tight = px < (vertical ? 26 : 74);
            return h('div', {
              class: `sday-block ${state}${tight ? ' tight' : ''}`,
              style: { flexGrow: it.len, '--c': p.color, '--ink': inkFor(p.color), '--done': `${frac * 100}%` },
              title: `${fmt(p.start)} – ${fmt(p.end)} ${p.name}`,
            },
              h('span', { class: 'sday-ic' }, p.icon),
              h('span', { class: 'sday-name' }, p.name),
              s.showTimes ? h('span', { class: 'sday-time' }, fmt(p.start)) : null,
              state === 'past' ? h('span', { class: 'sday-tick', 'aria-label': 'done' }, '✓') : null,
            );
          }),
        );
      }
      // now marker position along the whole day
      const pos = (now - first) / Math.max(1, last - first);
      marker.hidden = pos < 0 || pos > 1;
      marker.style.setProperty('--pos', `${Math.max(0, Math.min(1, pos)) * 100}%`);

      // optional chime at the start of each session
      if (s.chime) {
        const dk = d.toDateString();
        for (const p of plan) {
          const k = `${p.id}:${dk}`;
          const st = toMin(p.start);
          if (now >= st && now < st + 1.5 && !s.fired[k]) {
            s.fired[k] = 1;
            play(s.chimeSound);
            ctx.el.classList.add('flash');
            setTimeout(() => ctx.el.classList.remove('flash'), 900);
            ctx.save();
          }
        }
        for (const k of Object.keys(s.fired)) if (!k.endsWith(dk)) delete s.fired[k];
      }
    }

    render(true);
    let lastSec = 0;
    const off = onTick((ms) => {
      const sec = Math.floor(ms / 1000);
      if (sec !== lastSec) { lastSec = sec; render(); }
    });

    // ------------------------------------------------------------ editor
    let editDay = 'all';
    function openEditor() {
      const usesAll = editDay !== 'all' && !s.plans[editDay];
      const plan = editDay === 'all' ? s.plans.all : s.plans[editDay];
      const dayChips = h('div', { class: 'chips' },
        ...[['all', 'Every day'], ['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']].map(([k, label]) =>
          h('button', {
            class: `chip${editDay === k ? ' on' : ''}${k !== 'all' && s.plans[k] ? ' own' : ''}`,
            title: k !== 'all' && s.plans[k] ? 'Has its own plan' : '',
            onclick: (e) => { e.preventDefault(); editDay = k; openEditor(); },
          }, label),
        ),
      );

      const changed = () => { ctx.save(); render(true); };
      const rows = h('div', { class: 'sday-rows' });

      function drawRows() {
        if (usesAll) {
          rows.replaceChildren(
            h('div', { class: 'sday-uses' },
              h('p', {}, `${DAYS[Number(editDay)]} uses the “Every day” plan.`),
              h('button', { class: 'btn primary', onclick: () => { s.plans[editDay] = structuredClone(s.plans.all).map((p) => ({ ...p, id: uid('ss') })); changed(); openEditor(); } }, `Give ${DAYS[Number(editDay)]} its own plan`),
            ),
          );
          return;
        }
        plan.sort((a, b) => toMin(a.start) - toMin(b.start));
        rows.replaceChildren(
          ...plan.map((p, i) => {
            const iconBtn = h('button', { class: 'sday-iconbtn', title: 'Choose an icon', 'aria-label': `Icon for ${p.name}` }, p.icon);
            const colourBtn = h('button', { class: 'sday-colourbtn', style: { background: p.color }, title: 'Choose a colour', 'aria-label': `Colour for ${p.name}` });
            const nameIn = h('input', { type: 'text', value: p.name, 'aria-label': 'Session name', class: 'sday-namein' });
            nameIn.addEventListener('input', () => { p.name = nameIn.value; changed(); });
            const startIn = h('input', { type: 'time', value: p.start, 'aria-label': 'Start time' });
            const endIn = h('input', { type: 'time', value: p.end, 'aria-label': 'End time' });
            startIn.addEventListener('change', () => {
              if (!startIn.value) return;
              const dur = toMin(p.end) - toMin(p.start);
              p.start = startIn.value;
              if (s.keepTogether !== false) {
                if (plan[i - 1]) plan[i - 1].end = p.start; // previous session ends when this starts
                else p.end = toHHMM(toMin(p.start) + dur); // first session: keep its length
              }
              changed();
              drawRows();
            });
            endIn.addEventListener('change', () => {
              if (!endIn.value) return;
              const shift = toMin(endIn.value) - toMin(p.end);
              p.end = endIn.value;
              if (s.keepTogether !== false) {
                // push (or pull) every later session along, keeping their lengths
                for (const q of plan.slice(i + 1)) { q.start = toHHMM(toMin(q.start) + shift); q.end = toHHMM(toMin(q.end) + shift); }
              }
              changed();
              drawRows();
            });
            const picker = h('div', { class: 'sday-picker', hidden: true });
            iconBtn.addEventListener('click', (e) => {
              e.preventDefault();
              const open = picker.hidden || picker.dataset.kind !== 'icon';
              picker.hidden = !open;
              picker.dataset.kind = 'icon';
              if (!open) return;
              const own = h('input', { type: 'text', placeholder: 'or type/paste any emoji', class: 'sday-own', maxlength: 8 });
              own.addEventListener('input', () => { const v = own.value.trim(); if (v) { p.icon = v; iconBtn.textContent = v; changed(); } });
              picker.replaceChildren(
                h('div', { class: 'sday-icons' },
                  ...ICONS.map((ic) => h('button', { class: `sday-icon${ic === p.icon ? ' on' : ''}`, onclick: (ev) => { ev.preventDefault(); p.icon = ic; iconBtn.textContent = ic; picker.hidden = true; changed(); } }, ic)),
                ),
                own,
              );
            });
            colourBtn.addEventListener('click', (e) => {
              e.preventDefault();
              const open = picker.hidden || picker.dataset.kind !== 'colour';
              picker.hidden = !open;
              picker.dataset.kind = 'colour';
              if (!open) return;
              picker.replaceChildren(
                h('div', { class: 'sday-colours' },
                  ...COLOURS.map((c) => h('button', { class: `swatch${c === p.color ? ' on' : ''}`, style: { background: c }, 'aria-label': `Colour ${c}`, onclick: (ev) => { ev.preventDefault(); p.color = c; colourBtn.style.background = c; picker.hidden = true; changed(); } })),
                ),
              );
            });
            const move = (dir) => (e) => {
              e.preventDefault();
              const j = i + dir;
              if (j < 0 || j >= plan.length) return;
              // swap order but keep the time slots where they are
              const a = plan[i];
              const b = plan[j];
              const [as, ae, bs, be] = [a.start, a.end, b.start, b.end];
              const lenA = toMin(ae) - toMin(as);
              const lenB = toMin(be) - toMin(bs);
              if (dir < 0) { b.start = as; b.end = toHHMM(toMin(as) + lenB); a.start = b.end; a.end = toHHMM(toMin(a.start) + lenA); }
              else { a.start = toHHMM(toMin(be) - lenA); a.end = be; b.start = as; b.end = toHHMM(toMin(as) + lenB); }
              changed();
              drawRows();
            };
            return h('div', { class: 'sday-row' },
              h('div', { class: 'sday-rowmain' },
                colourBtn, iconBtn, nameIn,
                h('div', { class: 'sday-times' }, startIn, h('span', {}, '–'), endIn),
                h('div', { class: 'sday-rowbtns' },
                  h('button', { class: 'w-btn', title: 'Move up', 'aria-label': 'Move up', onclick: move(-1) }, '↑'),
                  h('button', { class: 'w-btn', title: 'Move down', 'aria-label': 'Move down', onclick: move(1) }, '↓'),
                  h('button', { class: 'w-btn close', title: 'Delete', 'aria-label': `Delete ${p.name}`, onclick: (e) => { e.preventDefault(); plan.splice(i, 1); changed(); drawRows(); } }, '🗑'),
                ),
              ),
              picker,
            );
          }),
          h('button', {
            class: 'btn primary',
            onclick: (e) => {
              e.preventDefault();
              const lastP = plan[plan.length - 1];
              const st = lastP ? toMin(lastP.end) : 9 * 60;
              plan.push(s_(toHHMM(st), toHHMM(st + 30), '📌', 'New session', COLOURS[plan.length % 10]));
              changed();
              drawRows();
              rows.querySelectorAll('.sday-namein')[plan.length - 1]?.select();
            },
          }, '+ Add session'),
        );
      }
      drawRows();

      const tplSel = select([['', 'Choose a starting plan…'], ...Object.entries(TEMPLATES).map(([k, t]) => [k, t.label])], '', (v) => {
        if (!v) return;
        if (plan?.length > 1 && !confirm('Replace the sessions on this plan?')) return;
        const fresh = TEMPLATES[v].make();
        if (editDay === 'all') s.plans.all = fresh; else s.plans[editDay] = fresh;
        changed();
        openEditor();
      });

      const quick = h('textarea', { rows: 8, class: 'sday-quick', spellcheck: 'false' });
      quick.value = usesAll ? '' : planToText(plan || []);
      const quickBox = h('details', { class: 'sday-quickbox' },
        h('summary', {}, '⌨️ Type or paste the whole day instead'),
        h('p', { class: 'hint' }, 'One session per line: start-end, an emoji, then the name. e.g. “9:00-9:40 📖 Reading”. Times like 1:30 are read as afternoon.'),
        quick,
        h('button', { class: 'btn', onclick: (e) => {
          e.preventDefault();
          const parsed = parsePlan(quick.value);
          if (!parsed.length) return;
          if (editDay === 'all') s.plans.all = parsed; else s.plans[editDay] = parsed;
          changed();
          openEditor();
        } }, 'Use this list'),
      );

      panel(ctx, 'School day',
        field('Plan for', dayChips),
        editDay !== 'all' && !usesAll ? h('button', { class: 'btn small', onclick: () => { delete s.plans[editDay]; changed(); openEditor(); } }, `↩ Make ${DAYS[Number(editDay)]} the same as every day`) : null,
        rows,
        usesAll ? null : field('Start from a ready-made plan', tplSel),
        usesAll ? null : quickBox,
        checkbox('Keep sessions back-to-back when I change a time', s.keepTogether !== false, (v) => { s.keepTogether = v; ctx.save(); }),
        field('Layout', select([['auto', 'Automatic'], ['across', 'Across (left to right)'], ['down', 'Down (top to bottom)']], s.layout, (v) => { s.layout = v; changed(); })),
        checkbox('Show start times', s.showTimes, (v) => { s.showTimes = v; changed(); }),
        checkbox('Play a sound when each session starts', s.chime, (v) => { s.chime = v; ctx.save(); }),
        s.chime ? field('Sound', soundSelect(s.chimeSound, (v) => { s.chimeSound = v; ctx.save(); })) : null,
      );
    }

    return {
      destroy: off,
      resize: () => render(true),
      openSettings: openEditor,
      closeSettings: () => render(true),
    };
  },
};
