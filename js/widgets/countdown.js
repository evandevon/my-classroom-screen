import { h } from '../util.js';
import { panel, checkbox, field, select, textInput } from './_common.js';
import { ICONS } from './schoolday.js';
import { REGIONS, resolveRegion } from '../termdates.js';

// Countdown to a date: "12 sleeps until the excursion!" — days, sleeps, school days or weeks.

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const COLOURS = ['#3a5ccc', '#e63946', '#2a9d8f', '#f4a261', '#7b2cbf', '#ff6fb5', '#1982c4', '#264653'];
const EXTRA = ['🎂', '🎉', '🚌', '🏖️', '🎄', '🐣', '🏆', '🎭', '🏊', '⛺', '🎨', '🧪'];

/** School days from tomorrow up to (not including) the target day. Weekends never count;
 *  if the region's term dates are known, holidays don't count either. */
function schoolDaysUntil(target, terms) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let n = 0;
  for (let i = 0; i < 800; i++) {
    d.setDate(d.getDate() + 1);
    if (d >= target) break;
    const wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    if (terms?.length) {
      const k = iso(d);
      if (!terms.some((t) => k >= t.start && k <= t.end)) continue;
    }
    n++;
  }
  return n;
}

export default {
  type: 'countdown',
  title: 'Countdown',
  icon: '🔜',
  group: 'core',
  size: [380, 300],
  hasSettings: true,
  defaultState: () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return { title: 'Excursion', icon: '🚌', date: iso(d), time: '', unit: 'sleeps', color: '#3a5ccc', holidays: true };
  },

  mount(ctx) {
    const s = ctx.state;
    const box = h('div', { class: 'cd' });
    ctx.view.append(box);

    function render() {
      const now = new Date();
      const target = fromIso(s.date);
      const [hh, mm] = (s.time || '00:00').split(':').map(Number);
      const exact = new Date(target);
      exact.setHours(s.time ? hh : 0, s.time ? mm : 0, 0, 0);
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const days = Math.round((target - today) / 86400000);
      box.style.setProperty('--c', s.color);

      let big;
      let unit;
      let sub = '';
      if (days < 0) {
        big = String(-days);
        unit = -days === 1 ? 'day ago' : 'days ago';
      } else if (days === 0) {
        const left = exact - now;
        if (s.time && left > 0) {
          const t = Math.floor(left / 1000);
          big = `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
          unit = 'to go — it’s today!';
        } else {
          big = '🎉';
          unit = 'It’s today!';
        }
      } else if (s.unit === 'school') {
        const reg = s.holidays ? resolveRegion('auto').region : null;
        const n = schoolDaysUntil(target, reg ? REGIONS[reg]?.terms : null);
        big = String(n);
        unit = n === 1 ? 'school day to go' : 'school days to go';
        sub = reg && s.holidays ? `(school holidays not counted — ${REGIONS[reg].short} dates)` : '(weekends not counted)';
      } else if (s.unit === 'weeks') {
        const w = Math.floor(days / 7);
        const d = days % 7;
        big = w ? `${w}w ${d}d` : String(d);
        unit = w ? `${w === 1 ? 'week' : 'weeks'} and ${d} ${d === 1 ? 'day' : 'days'} to go` : d === 1 ? 'day to go' : 'days to go';
      } else if (s.unit === 'sleeps') {
        big = String(days);
        unit = days === 1 ? 'more sleep!' : 'sleeps to go';
      } else {
        big = String(days);
        unit = days === 1 ? 'day to go' : 'days to go';
      }
      box.replaceChildren(
        h('div', { class: 'cd-icon', 'aria-hidden': 'true' }, s.icon),
        h('div', { class: 'cd-big' }, big),
        h('div', { class: 'cd-unit' }, unit),
        h('div', { class: 'cd-title' }, s.title),
        h('div', { class: 'cd-date' }, exact.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) + (s.time ? `, ${exact.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '')),
        sub ? h('div', { class: 'cd-sub' }, sub) : '',
      );
    }
    render();
    const t = setInterval(render, 1000);

    return {
      destroy: () => clearInterval(t),
      openSettings() {
        const dateIn = h('input', { type: 'date', value: s.date, 'aria-label': 'Date' });
        dateIn.addEventListener('change', () => { if (dateIn.value) { s.date = dateIn.value; ctx.save(); render(); } });
        const timeIn = h('input', { type: 'time', value: s.time, 'aria-label': 'Time (optional)' });
        timeIn.addEventListener('change', () => { s.time = timeIn.value; ctx.save(); render(); });
        const icons = h('div', { class: 'sday-icons' },
          ...[...EXTRA, ...ICONS.slice(0, 28)].map((ic) => h('button', { class: `sday-icon${ic === s.icon ? ' on' : ''}`, onclick: (e) => { e.preventDefault(); s.icon = ic; ctx.save(); render(); icons.querySelectorAll('.sday-icon').forEach((b) => b.classList.toggle('on', b.textContent === ic)); } }, ic)));
        panel(ctx, 'Countdown',
          field('What are we counting down to?', textInput(s.title, (v) => { s.title = v; ctx.save(); render(); })),
          h('div', { class: 'row' }, field('Date', dateIn), field('Time (optional)', timeIn)),
          field('Count in', select([['sleeps', 'Sleeps'], ['days', 'Days'], ['school', 'School days'], ['weeks', 'Weeks and days']], s.unit, (v) => { s.unit = v; ctx.save(); render(); ctx.openSettings(); })),
          s.unit === 'school' ? checkbox('Don’t count school holidays (uses your state’s term dates)', s.holidays, (v) => { s.holidays = v; ctx.save(); render(); }) : null,
          field('Picture', icons),
          field('Colour', h('div', { class: 'swatches' }, ...COLOURS.map((c) => h('button', { class: `swatch${c === s.color ? ' on' : ''}`, style: { background: c }, 'aria-label': `Colour ${c}`, onclick: (e) => { e.preventDefault(); s.color = c; ctx.save(); render(); ctx.openSettings(); } })))),
          h('p', { class: 'hint' }, 'Public holidays aren’t known, so school-day counts can be a day or two high in some weeks.'),
        );
      },
    };
  },
};
