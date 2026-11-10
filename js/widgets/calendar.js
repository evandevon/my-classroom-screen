import { h, uid } from '../util.js';
import { panel, checkbox, field, select } from './_common.js';
import { ICONS } from './schoolday.js';

// Interactive month calendar: tap a day to add events (with an emoji and colour),
// "coming up" countdowns, and NSW school term / week numbers.

// NSW public schools, Eastern Division, first and last student days
// (education.nsw.gov.au/schooling/calendars). Editable in settings.
export const NSW_TERMS = [
  { start: '2026-02-02', end: '2026-04-02' },
  { start: '2026-04-22', end: '2026-07-03' },
  { start: '2026-07-21', end: '2026-09-25' },
  { start: '2026-10-13', end: '2026-12-17' },
  { start: '2027-02-03', end: '2027-04-09' },
  { start: '2027-04-29', end: '2027-07-02' },
  { start: '2027-07-20', end: '2027-09-24' },
  { start: '2027-10-11', end: '2027-12-17' },
];

const EVENT_ICONS = ['🎂', '🎉', '🚌', '📸', '🏖️', '🏫', '🧑‍🏫', '📝', '🔬', '🎭', '🎵', '⚽', '🏊', '🏃', '🍕', '🧁', '📣', '🏆', '🎄', '🐣', '🌏', '💉', '📚', '🎨', ...ICONS.slice(0, 24)];
const COLOURS = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#7b2cbf', '#ff6fb5', '#8ac926', '#1982c4', '#6c757d'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayDiff = (a, b) => Math.round((fromIso(iso(b)) - fromIso(iso(a))) / 86400000);
const startOfWeekMon = (d) => { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; };

/** Term & week for a date, e.g. { term: 4, week: 5 } or { holidays: true }. Week 1 is the week the term starts in. */
export function termWeek(d, terms) {
  const sorted = [...terms].sort((a, b) => a.start.localeCompare(b.start));
  const key = iso(d);
  const yearTerms = (y) => sorted.filter((t) => t.start.startsWith(String(y)));
  for (const t of sorted) {
    if (key >= t.start && key <= t.end) {
      const n = yearTerms(t.start.slice(0, 4)).indexOf(t) + 1;
      const week = Math.floor((startOfWeekMon(d) - startOfWeekMon(fromIso(t.start))) / (7 * 86400000)) + 1;
      return { term: n, week };
    }
  }
  if (!sorted.length) return null;
  if (key < sorted[0].start || key > sorted[sorted.length - 1].end) return null;
  return { holidays: true };
}

/** Does an event happen on this date (handles weekly / yearly repeats)? */
function occurs(ev, d) {
  const key = iso(d);
  if (key < ev.date) return false;
  if (ev.repeat === 'weekly') return fromIso(ev.date).getDay() === d.getDay();
  if (ev.repeat === 'yearly') return ev.date.slice(5) === key.slice(5);
  return ev.date === key;
}

export default {
  type: 'calendar',
  title: 'Calendar',
  icon: '📅',
  group: 'core',
  size: [620, 520],
  hasSettings: true,
  privateKeys: ['events'],
  defaultState: () => ({
    events: [],
    weekStart: 1, // 1 = Monday, 0 = Sunday
    showTerms: true,
    showUpcoming: true,
    terms: structuredClone(NSW_TERMS),
  }),

  mount(ctx) {
    const s = ctx.state;
    let view = new Date();
    view.setDate(1);
    let openDay = null; // ISO date with the day panel open

    const title = h('div', { class: 'cal-title' });
    const badge = h('div', { class: 'cal-badge' });
    const head = h('div', { class: 'cal-head' },
      h('button', { class: 'btn big', 'aria-label': 'Previous month', onclick: () => shift(-1) }, '‹'),
      title,
      h('button', { class: 'btn big', 'aria-label': 'Next month', onclick: () => shift(1) }, '›'),
      h('button', { class: 'btn small', onclick: () => { view = new Date(); view.setDate(1); render(); } }, 'Today'),
      badge,
    );
    const grid = h('div', { class: 'cal-grid', role: 'grid' });
    const upcoming = h('div', { class: 'cal-upcoming' });
    const dayPanel = h('div', { class: 'cal-day', hidden: true });
    ctx.view.append(h('div', { class: 'cal' }, head, grid, upcoming, dayPanel));

    function shift(n) {
      view = new Date(view.getFullYear(), view.getMonth() + n, 1);
      render();
    }
    // swipe left/right to change month
    let sx = null;
    grid.addEventListener('pointerdown', (e) => (sx = e.clientX));
    grid.addEventListener('pointerup', (e) => {
      if (sx !== null && Math.abs(e.clientX - sx) > 60) shift(e.clientX < sx ? 1 : -1);
      sx = null;
    });

    const eventsOn = (d) => s.events.filter((ev) => occurs(ev, d)).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    function render() {
      const today = new Date();
      title.textContent = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;
      const tw = s.showTerms ? termWeek(today, s.terms) : null;
      badge.textContent = tw ? (tw.holidays ? '🏖️ School holidays' : `Term ${tw.term} · Week ${tw.week}`) : '';
      badge.hidden = !tw;

      const names = s.weekStart === 1 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const first = new Date(view);
      const offset = (first.getDay() - s.weekStart + 7) % 7;
      const start = new Date(first);
      start.setDate(1 - offset);
      const cells = [];
      grid.style.setProperty('--cols', s.showTerms ? 8 : 7);
      if (s.showTerms) cells.push(h('div', { class: 'cal-dow wk' }, 'Wk'));
      cells.push(...names.map((n) => h('div', { class: 'cal-dow' }, n)));
      for (let w = 0; w < 6; w++) {
        const rowStart = new Date(start);
        rowStart.setDate(start.getDate() + w * 7);
        if (w >= 4 && rowStart.getMonth() !== view.getMonth()) break; // only as many rows as needed
        if (s.showTerms) {
          const mid = new Date(rowStart);
          mid.setDate(mid.getDate() + ((1 - s.weekStart + 7) % 7) + 2); // the Wednesday
          const t = termWeek(mid, s.terms);
          cells.push(h('div', { class: 'cal-wk' }, t && !t.holidays ? `T${t.term}\nW${t.week}` : ''));
        }
        for (let i = 0; i < 7; i++) {
          const d = new Date(rowStart);
          d.setDate(rowStart.getDate() + i);
          const evs = eventsOn(d);
          const isToday = iso(d) === iso(today);
          const cls = ['cal-cell'];
          if (d.getMonth() !== view.getMonth()) cls.push('other');
          if (isToday) cls.push('today');
          if (d.getDay() === 0 || d.getDay() === 6) cls.push('weekend');
          if (s.showTerms && termWeek(d, s.terms)?.holidays) cls.push('hols');
          if (openDay === iso(d)) cls.push('open');
          cells.push(
            h('button', {
              class: cls.join(' '),
              'aria-label': `${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}${evs.length ? `, ${evs.length} event${evs.length > 1 ? 's' : ''}` : ''}`,
              onclick: () => showDay(iso(d)),
            },
              h('span', { class: 'cal-num' }, d.getDate()),
              h('span', { class: 'cal-evs' },
                ...evs.slice(0, 3).map((ev) => h('span', { class: 'cal-chip', style: { '--c': ev.color } }, h('i', {}, ev.icon), h('b', {}, ev.title))),
                evs.length > 3 ? h('span', { class: 'cal-more' }, `+${evs.length - 3}`) : null,
              ),
            ),
          );
        }
      }
      grid.replaceChildren(...cells);

      // coming up
      upcoming.hidden = !s.showUpcoming;
      if (s.showUpcoming) {
        const items = [];
        for (let k = 0; k <= 60 && items.length < 4; k++) {
          const d = new Date(today);
          d.setDate(today.getDate() + k);
          for (const ev of eventsOn(d)) if (items.length < 4) items.push({ ev, k, d });
        }
        upcoming.replaceChildren(
          h('span', { class: 'cal-up-label' }, 'Coming up'),
          ...(items.length
            ? items.map(({ ev, k }) =>
                h('span', { class: 'cal-up', style: { '--c': ev.color } }, `${ev.icon} ${ev.title} `, h('em', {}, k === 0 ? 'today!' : k === 1 ? 'tomorrow' : `in ${k} days`)))
            : [h('span', { class: 'hint' }, 'Tap a day to add an event')]),
        );
      }
      if (openDay) showDay(openDay, true);
    }

    function showDay(key, refresh = false) {
      if (!refresh && openDay === key && !dayPanel.hidden) { closeDay(); return; }
      openDay = key;
      const d = fromIso(key);
      const evs = eventsOn(d);
      let icon = '🎉';
      let colour = COLOURS[s.events.length % COLOURS.length];
      const iconBtn = h('button', { class: 'sday-iconbtn', 'aria-label': 'Choose an icon' }, icon);
      const picker = h('div', { class: 'sday-icons cal-icons', hidden: true },
        ...EVENT_ICONS.map((ic) => h('button', { class: 'sday-icon', onclick: () => { icon = ic; iconBtn.textContent = ic; picker.hidden = true; } }, ic)));
      iconBtn.addEventListener('click', () => (picker.hidden = !picker.hidden));
      const titleIn = h('input', { type: 'text', placeholder: 'What’s happening?', 'aria-label': 'Event name' });
      const timeIn = h('input', { type: 'time', 'aria-label': 'Time (optional)' });
      const repeatSel = select([['none', 'Just this day'], ['weekly', 'Every week'], ['yearly', 'Every year (birthdays)']], 'none', () => {});
      const swatchRow = h('div', { class: 'swatches' },
        ...COLOURS.map((c) => {
          const b = h('button', { class: `swatch${c === colour ? ' on' : ''}`, style: { background: c }, 'aria-label': `Colour ${c}`, onclick: () => { colour = c; swatchRow.querySelectorAll('.swatch').forEach((x) => x.classList.remove('on')); b.classList.add('on'); } });
          return b;
        }));
      const add = () => {
        const t = titleIn.value.trim();
        if (!t) { titleIn.focus(); return; }
        s.events.push({ id: uid('ev'), date: key, title: t, icon, color: colour, time: timeIn.value || '', repeat: repeatSel.value });
        ctx.save();
        render();
      };
      titleIn.addEventListener('keydown', (e) => e.key === 'Enter' && add());

      const tw = s.showTerms ? termWeek(d, s.terms) : null;
      const until = dayDiff(new Date(), d);
      dayPanel.replaceChildren(
        h('div', { class: 'cal-day-head' },
          h('div', {},
            h('h3', {}, d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })),
            h('div', { class: 'hint' }, [
              until === 0 ? 'Today' : until === 1 ? 'Tomorrow' : until > 1 ? `In ${until} days` : `${-until} day${until === -1 ? '' : 's'} ago`,
              tw ? (tw.holidays ? 'School holidays' : `Term ${tw.term}, Week ${tw.week}`) : '',
            ].filter(Boolean).join(' · ')),
          ),
          h('button', { class: 'w-btn', 'aria-label': 'Close', onclick: closeDay }, '✕'),
        ),
        h('ul', { class: 'cal-list' },
          ...(evs.length ? evs.map((ev) => h('li', { style: { '--c': ev.color } },
            h('span', { class: 'cal-li-ic' }, ev.icon),
            h('span', { class: 'cal-li-t' }, ev.title, ev.time ? h('small', {}, ` ${ev.time}`) : null, ev.repeat !== 'none' && ev.repeat ? h('small', {}, ev.repeat === 'weekly' ? ' · weekly' : ' · yearly') : null),
            h('button', { class: 'w-btn close', 'aria-label': `Delete ${ev.title}`, onclick: () => { s.events = s.events.filter((x) => x !== ev); ctx.save(); render(); } }, '🗑'),
          )) : [h('li', { class: 'hint' }, 'Nothing on yet.')]),
        ),
        h('div', { class: 'cal-add' },
          h('div', { class: 'row stretch' }, iconBtn, titleIn),
          picker,
          h('div', { class: 'row' }, timeIn, repeatSel),
          swatchRow,
          h('button', { class: 'btn primary', onclick: add }, '+ Add to calendar'),
        ),
      );
      dayPanel.hidden = false;
      grid.querySelectorAll('.cal-cell.open').forEach((c) => c.classList.remove('open'));
      if (!refresh) setTimeout(() => titleIn.focus({ preventScroll: true }), 50);
    }
    function closeDay() {
      openDay = null;
      dayPanel.hidden = true;
      render();
    }

    render();
    // Roll over to the new day at midnight.
    let lastDay = iso(new Date());
    const t = setInterval(() => { const k = iso(new Date()); if (k !== lastDay) { lastDay = k; render(); } }, 30000);

    return {
      destroy: () => clearInterval(t),
      openSettings() {
        const termBox = h('div', { class: 'stack' });
        const drawTerms = () => {
          s.terms.sort((a, b) => a.start.localeCompare(b.start));
          termBox.replaceChildren(
            ...s.terms.map((tm, i) => {
              const a = h('input', { type: 'date', value: tm.start, 'aria-label': 'Term start' });
              const b = h('input', { type: 'date', value: tm.end, 'aria-label': 'Term end' });
              a.addEventListener('change', () => { if (a.value) { tm.start = a.value; ctx.save(); render(); } });
              b.addEventListener('change', () => { if (b.value) { tm.end = b.value; ctx.save(); render(); } });
              return h('div', { class: 'row term-row' }, a, h('span', {}, 'to'), b,
                h('button', { class: 'w-btn close', 'aria-label': 'Remove term', onclick: () => { s.terms.splice(i, 1); ctx.save(); drawTerms(); render(); } }, '🗑'));
            }),
          );
        };
        drawTerms();
        panel(ctx, 'Calendar',
          field('Weeks start on', select([[1, 'Monday'], [0, 'Sunday']], s.weekStart, (v) => { s.weekStart = Number(v); ctx.save(); render(); })),
          checkbox('Show “coming up” countdowns', s.showUpcoming, (v) => { s.showUpcoming = v; ctx.save(); render(); }),
          checkbox('Show school terms and week numbers', s.showTerms, (v) => { s.showTerms = v; ctx.save(); render(); }),
          h('details', { class: 'sday-quickbox' },
            h('summary', {}, '🏫 Term dates (first and last student day)'),
            h('p', { class: 'hint' }, 'Filled in with NSW public school dates (Eastern Division) for 2026–2027. Change them to match your school.'),
            termBox,
            h('div', { class: 'row' },
              h('button', { class: 'btn small', onclick: () => { const last = s.terms[s.terms.length - 1]; const y = last ? Number(last.end.slice(0, 4)) : new Date().getFullYear(); s.terms.push({ start: `${y}-10-12`, end: `${y}-12-17` }); ctx.save(); drawTerms(); } }, '+ Add term'),
              h('button', { class: 'btn small', onclick: () => { s.terms = structuredClone(NSW_TERMS); ctx.save(); drawTerms(); render(); } }, 'Reset to NSW dates'),
            ),
          ),
          h('p', { class: 'hint' }, 'Events stay on this device and are left out of share links unless you include them.'),
        );
      },
      closeSettings: render,
    };
  },
};
