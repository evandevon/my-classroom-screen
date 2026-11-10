import { h, uid } from '../util.js';
import { playRepeated, soundSelect, soundNotice, SOUND_LENGTH } from '../sound.js';
import { panel, textInput, select, field } from './_common.js';

// Bell alarms with an optional "pack up" warning a few minutes before.
// Alarms only ring while this page is open (browsers can't wake a closed tab).

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // 0 = Sunday
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const newAlarm = (over = {}) => ({
  id: uid('al'),
  time: '15:00',
  label: 'Home time',
  sound: 'bell',
  warn: 5, // minutes before; 0 = no warning
  warnLabel: 'Pack up time',
  warnSound: 'tidyup',
  days: [1, 2, 3, 4, 5],
  on: true,
  ...over,
});

const toMin = (t) => {
  const [hh, mm] = String(t || '0:0').split(':').map(Number);
  return hh * 60 + mm;
};
const fmtClock = (mins) => {
  const d = new Date();
  d.setHours(Math.floor(mins / 60) % 24, mins % 60, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const dateKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

// One shared full-screen banner for all alarm widgets.
let bannerEl = null;
let stopSound = null;
function showBanner({ icon, title, sub, sound, repeats, kind }) {
  hideBanner();
  bannerEl = h('div', { class: `alarm-banner ${kind}`, role: 'alertdialog', 'aria-live': 'assertive' },
    h('div', { class: 'ab-icon' }, icon),
    h('div', { class: 'ab-title' }, title),
    sub ? h('div', { class: 'ab-sub' }, sub) : null,
    h('button', { class: 'btn big primary', onclick: hideBanner }, 'OK'),
  );
  document.body.append(bannerEl);
  stopSound = playRepeated(sound, repeats);
  // Close by itself after the sound has finished plus a while.
  const ms = ((SOUND_LENGTH[sound] || 1.2) + 0.5) * repeats * 1000 + 25000;
  bannerEl.dataset.t = String(setTimeout(hideBanner, ms));
}
function hideBanner() {
  stopSound?.();
  stopSound = null;
  if (bannerEl) {
    clearTimeout(Number(bannerEl.dataset.t));
    bannerEl.remove();
    bannerEl = null;
  }
}
document.addEventListener('keydown', (e) => e.key === 'Escape' && hideBanner());

export default {
  type: 'alarm',
  title: 'Alarms',
  icon: '⏰',
  group: 'core',
  size: [400, 320],
  hasSettings: true,
  defaultState: () => ({
    alarms: [
      newAlarm({ time: '11:00', label: 'Recess', warn: 3, warnLabel: 'Pack up for recess', days: [1, 2, 3, 4, 5] }),
      newAlarm({ time: '15:00', label: 'Home time', warn: 5, warnLabel: 'Pack up time', days: [1, 2, 3, 4, 5] }),
    ],
    repeats: 3,
    fired: {}, // id+date keys so an alarm rings once per day
  }),

  mount(ctx) {
    const s = ctx.state;
    const nextEl = h('div', { class: 'al-next' });
    const listEl = h('ul', { class: 'al-list' });
    const notice = soundNotice();
    ctx.view.append(h('div', { class: 'alarms' }, notice, nextEl, listEl,
      h('div', { class: 'al-foot' },
        h('button', { class: 'btn', onclick: () => { s.alarms.push(newAlarm({ time: nowPlus(10) })); ctx.save(); ctx.openSettings(); } }, '+ Add alarm'),
      ),
    ));

    function nowPlus(min) {
      const d = new Date(Date.now() + min * 60000);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    /** Upcoming events (warnings and alarms) for today, sorted. */
    function upcoming(now = new Date()) {
      const today = now.getDay();
      const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const out = [];
      for (const a of s.alarms) {
        if (!a.on || !a.days.includes(today)) continue;
        const at = toMin(a.time) * 60;
        if (a.warn > 0 && at - a.warn * 60 > nowSec) out.push({ a, kind: 'warn', at: at - a.warn * 60 });
        if (at > nowSec) out.push({ a, kind: 'alarm', at });
      }
      return out.sort((x, y) => x.at - y.at);
    }

    function check() {
      const now = new Date();
      const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const dk = dateKey(now);
      let changed = false;
      // Forget old days so the record stays small.
      for (const k of Object.keys(s.fired)) if (!k.endsWith(dk)) { delete s.fired[k]; changed = true; }
      for (const a of s.alarms) {
        if (!a.on || !a.days.includes(now.getDay())) continue;
        const at = toMin(a.time) * 60;
        const events = [];
        if (a.warn > 0) events.push({ kind: 'warn', at: at - a.warn * 60 });
        events.push({ kind: 'alarm', at });
        for (const ev of events) {
          const key = `${a.id}:${ev.kind}:${dk}`;
          // Ring if we're within 90 seconds after the time (covers a sleeping/slow tab).
          if (nowSec >= ev.at && nowSec < ev.at + 90 && !s.fired[key]) {
            s.fired[key] = 1;
            changed = true;
            ring(a, ev.kind);
          }
        }
      }
      if (changed) ctx.save();
      render();
    }

    function ring(a, kind) {
      ctx.el.classList.add('flash');
      setTimeout(() => ctx.el.classList.remove('flash'), 1000);
      if (kind === 'warn') {
        showBanner({
          kind: 'warn',
          icon: '🧹',
          title: a.warnLabel || 'Pack up time',
          sub: `${a.label || 'The bell'} in ${a.warn} minute${a.warn === 1 ? '' : 's'}`,
          sound: a.warnSound,
          repeats: Math.max(1, Math.min(2, s.repeats)),
        });
      } else {
        showBanner({ kind: 'alarm', icon: '🔔', title: a.label || 'Alarm', sub: fmtClock(toMin(a.time)), sound: a.sound, repeats: s.repeats });
      }
    }

    function render() {
      const now = new Date();
      const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const next = upcoming(now)[0];
      if (next) {
        const left = next.at - nowSec;
        const hh = Math.floor(left / 3600);
        const mm = Math.floor((left % 3600) / 60);
        const ss = left % 60;
        const inTxt = hh ? `${hh} h ${mm} min` : mm >= 10 ? `${mm} min` : `${mm}:${String(ss).padStart(2, '0')}`;
        nextEl.replaceChildren(
          h('div', { class: 'al-next-label' }, next.kind === 'warn' ? `🧹 ${next.a.warnLabel || 'Pack up'}` : `🔔 ${next.a.label}`),
          h('div', { class: 'al-next-in' }, `in ${inTxt}`),
          h('div', { class: 'al-next-at' }, `at ${fmtClock(Math.floor(next.at / 60))}`),
        );
        nextEl.classList.toggle('soon', left <= 120);
      } else {
        nextEl.replaceChildren(h('div', { class: 'al-next-label' }, 'No more alarms today'));
        nextEl.classList.remove('soon');
      }
      const today = now.getDay();
      listEl.replaceChildren(
        ...[...s.alarms]
          .sort((x, y) => toMin(x.time) - toMin(y.time))
          .map((a) => {
            const t = h('input', { type: 'checkbox', 'aria-label': `Turn ${a.label} on or off` });
            t.checked = a.on;
            t.addEventListener('change', () => { a.on = t.checked; ctx.save(); render(); });
            return h('li', { class: `${a.on ? '' : 'off'}${a.days.includes(today) ? '' : ' not-today'}` },
              h('label', { class: 'switch' }, t, h('span', {})),
              h('span', { class: 'al-time' }, fmtClock(toMin(a.time))),
              h('span', { class: 'al-label' }, a.label, a.warn > 0 ? h('small', {}, ` · warning ${a.warn} min before`) : null),
            );
          }),
      );
    }

    render();
    check();
    // Check at the start of every second.
    let iv;
    const startTick = setTimeout(() => { check(); iv = setInterval(check, 1000); }, 1000 - (Date.now() % 1000));

    return {
      destroy() { clearTimeout(startTick); clearInterval(iv); notice.cleanup?.(); },
      openSettings() {
        const box = h('div', { class: 'stack' });
        const draw = () => {
          box.replaceChildren(
            ...s.alarms.map((a) => {
              const dayBtns = DAYS.map((d, i) => {
                const b = h('button', {
                  class: `day${a.days.includes(i) ? ' on' : ''}`,
                  title: DAY_NAMES[i],
                  'aria-label': DAY_NAMES[i],
                  'aria-pressed': String(a.days.includes(i)),
                  onclick: (e) => {
                    e.preventDefault();
                    a.days = a.days.includes(i) ? a.days.filter((x) => x !== i) : [...a.days, i].sort();
                    ctx.save();
                    draw();
                  },
                }, d);
                return b;
              });
              const timeIn = h('input', { type: 'time', value: a.time, 'aria-label': 'Alarm time' });
              timeIn.addEventListener('input', () => { if (timeIn.value) { a.time = timeIn.value; clearFired(a); ctx.save(); } });
              return h('fieldset', { class: 'al-edit' },
                h('div', { class: 'row' },
                  field('Time', timeIn),
                  field('Name', textInput(a.label, (v) => { a.label = v; ctx.save(); }, { placeholder: 'e.g. Recess' })),
                  h('button', { class: 'btn small danger', 'aria-label': 'Delete alarm', onclick: () => { s.alarms = s.alarms.filter((x) => x !== a); ctx.save(); draw(); } }, '🗑'),
                ),
                field('Bell sound', soundSelect(a.sound, (v) => { a.sound = v; ctx.save(); }, { allowNone: false })),
                h('div', { class: 'row' },
                  field('Warning before', select([[0, 'No warning'], [1, '1 minute'], [2, '2 minutes'], [3, '3 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes']], a.warn, (v) => { a.warn = Number(v); clearFired(a); ctx.save(); draw(); })),
                  a.warn > 0 ? field('Warning message', textInput(a.warnLabel, (v) => { a.warnLabel = v; ctx.save(); })) : null,
                ),
                a.warn > 0 ? field('Warning sound', soundSelect(a.warnSound, (v) => { a.warnSound = v; ctx.save(); }, { allowNone: false })) : null,
                h('div', { class: 'days' }, h('span', { class: 'days-label' }, 'Days'), ...dayBtns),
                h('div', { class: 'row' },
                  h('button', { class: 'btn small', onclick: (e) => { e.preventDefault(); ring(a, 'warn'); }, hidden: !(a.warn > 0) }, 'Test warning'),
                  h('button', { class: 'btn small', onclick: (e) => { e.preventDefault(); ring(a, 'alarm'); } }, 'Test alarm'),
                ),
              );
            }),
          );
        };
        const clearFired = (a) => { for (const k of Object.keys(s.fired)) if (k.startsWith(a.id)) delete s.fired[k]; };
        draw();
        panel(ctx, 'Alarms',
          box,
          h('button', { class: 'btn', onclick: () => { s.alarms.push(newAlarm({ time: nowPlus(10), label: 'Alarm' })); ctx.save(); draw(); } }, '+ Add another alarm'),
          field('Play the bell sound', select([[1, 'Once'], [2, 'Twice'], [3, '3 times'], [5, '5 times']], s.repeats, (v) => { s.repeats = Number(v); ctx.save(); })),
          h('p', { class: 'hint' }, 'Alarms ring while this page is open. Keep the screen showing (or the tab open) and tap the page once after loading so the browser allows sound.'),
        );
      },
      closeSettings: render,
    };
  },
};

