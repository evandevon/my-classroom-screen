import { h } from '../util.js';
import { play, scheduleSound, soundSelect } from '../sound.js';
import { onTick } from '../ticker.js';
import { panel, field, numberInput, textInput, checkbox } from './_common.js';

// Interval timer: get ready → work → rest → work … for a number of rounds.
// Sounds are booked on the audio clock, so they stay on time with the tab in the background.

const PRESETS = [
  ['Tabata 20/10 × 8', { work: 20, rest: 10, rounds: 8 }],
  ['30/30 × 10', { work: 30, rest: 30, rounds: 10 }],
  ['45/15 × 6', { work: 45, rest: 15, rounds: 6 }],
  ['1 min / 1 min × 5', { work: 60, rest: 60, rounds: 5 }],
  ['Stations 5 min / 1 min × 4', { work: 300, rest: 60, rounds: 4 }],
];
const BOOK_AHEAD_MS = 90_000;

const fmt = (sec) => {
  const t = Math.max(0, Math.ceil(sec));
  return t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : String(t);
};

/** The whole session as a list of phases with start/end times (ms from the start). */
function plan(s) {
  const out = [];
  let t = 0;
  const add = (kind, sec, round) => { if (sec > 0) { out.push({ kind, round, start: t, end: t + sec * 1000 }); t += sec * 1000; } };
  add('prep', s.prep, 0);
  for (let r = 1; r <= s.rounds; r++) {
    add('work', s.work, r);
    if (r < s.rounds || s.restAfterLast) add('rest', s.rest, r);
  }
  return { phases: out, total: t };
}

export default {
  type: 'interval',
  title: 'Interval timer',
  icon: '🔂',
  group: 'core',
  size: [440, 380],
  hasSettings: true,
  defaultState: () => ({
    work: 30, rest: 15, rounds: 8, prep: 10, restAfterLast: false,
    workLabel: 'Work', restLabel: 'Rest',
    workSound: 'whistle', restSound: 'ding', endSound: 'fanfare', countdown: true,
    running: false, startAt: 0, elapsed: 0,
  }),
  hold(s) {
    if (!s.running) return null;
    s.elapsed = Date.now() - s.startAt;
    s.running = false;
    s.held = true;
    return `Interval timer: paused at ${fmt(s.elapsed / 1000)}`;
  },
  unhold(s) {
    if (!s.held) return;
    s.held = false;
    s.running = true;
    s.startAt = Date.now() - s.elapsed;
  },

  mount(ctx) {
    const s = ctx.state;
    const phaseEl = h('div', { class: 'iv-phase' });
    const timeEl = h('div', { class: 'iv-time' });
    const roundEl = h('div', { class: 'iv-round' });
    const bar = h('div', { class: 'iv-bar' }, h('i'));
    const totalEl = h('div', { class: 'iv-total' });
    const playBtn = h('button', { class: 'btn primary big iv-play', onclick: () => (s.running ? pause() : start()) });
    const box = h('div', { class: 'iv' },
      phaseEl, timeEl, roundEl, bar,
      h('div', { class: 'iv-controls' },
        h('button', { class: 'btn big', title: 'Start again', 'aria-label': 'Start again', onclick: reset }, '↺'),
        playBtn,
        h('button', { class: 'btn big', title: 'Skip to the next part', 'aria-label': 'Skip', onclick: skip }, '⏭'),
      ),
      totalEl,
    );
    ctx.view.append(box);

    let bookings = [];
    let bookedTo = 0; // ms (session time) up to which sounds are booked
    let lastPhase = -1;
    let raf = 0;

    const elapsed = () => (s.running ? Date.now() - s.startAt : s.elapsed);
    function unbook() { bookings.forEach((b) => b.cancel()); bookings = []; bookedTo = 0; }
    /** Book the sounds for the next minute and a half (and keep topping up while running). */
    function book() {
      if (!s.running) return;
      const { phases } = plan(s);
      const now = elapsed();
      const until = now + BOOK_AHEAD_MS;
      const from = Math.max(now + 50, bookedTo);
      const at = (ms) => s.startAt + ms;
      for (let i = 0; i < phases.length; i++) {
        const p = phases[i];
        // Sound at the start of each work/rest part (not the start of "get ready", which you just pressed).
        if (p.start > from && p.start <= until && p.kind !== 'prep') bookings.push(scheduleSound(p.kind === 'work' ? s.workSound : s.restSound, at(p.start)));
        if (s.countdown) for (const k of [3, 2, 1]) {
          const t = p.end - k * 1000;
          if (t > from && t <= until && p.end - p.start > 4000) bookings.push(scheduleSound('tick3', at(t)));
        }
        if (i === phases.length - 1 && p.end > from && p.end <= until) bookings.push(scheduleSound(s.endSound, at(p.end)));
      }
      bookedTo = Math.max(bookedTo, until);
    }

    function start() {
      const { total } = plan(s);
      if (s.elapsed >= total) s.elapsed = 0;
      s.startAt = Date.now() - s.elapsed;
      s.running = true;
      if (s.elapsed === 0 && !s.prep) play(s.workSound);
      ctx.save();
      unbook();
      book();
      loop();
    }
    function pause() {
      s.elapsed = elapsed();
      s.running = false;
      unbook();
      ctx.save();
      draw();
    }
    function reset() {
      s.running = false;
      s.elapsed = 0;
      unbook();
      lastPhase = -1;
      ctx.save();
      draw();
    }
    function skip() {
      const { phases, total } = plan(s);
      const now = elapsed();
      const cur = phases.find((p) => now < p.end);
      const to = cur ? cur.end : total;
      if (s.running) { s.startAt = Date.now() - to; unbook(); book(); } else s.elapsed = to;
      ctx.save();
      draw();
    }

    function draw() {
      const { phases, total } = plan(s);
      const now = Math.min(elapsed(), total);
      const idx = phases.findIndex((p) => now < p.end);
      const p = phases[idx];
      const done = idx === -1 && now >= total && total > 0 && (s.running || s.elapsed > 0);
      if (done && s.running) { s.running = false; s.elapsed = total; ctx.save(); }
      const kind = done ? 'done' : !s.running && now === 0 ? 'ready' : p?.kind || 'ready';
      box.dataset.phase = kind;
      phaseEl.textContent = { prep: 'Get ready', work: s.workLabel || 'Work', rest: s.restLabel || 'Rest', done: 'Finished! 🎉', ready: 'Ready' }[kind];
      if (done) {
        timeEl.textContent = '0';
        roundEl.textContent = `${s.rounds} rounds done`;
        bar.firstChild.style.width = '100%';
      } else if (!p || kind === 'ready') {
        timeEl.textContent = fmt(s.prep || s.work);
        roundEl.textContent = `${s.rounds} rounds · ${fmt(s.work)} ${s.workLabel.toLowerCase()} / ${fmt(s.rest)} ${s.restLabel.toLowerCase()}`;
        bar.firstChild.style.width = '0%';
      } else {
        timeEl.textContent = fmt((p.end - now) / 1000);
        roundEl.textContent = p.round ? `Round ${p.round} of ${s.rounds}` : `Then ${s.rounds} rounds`;
        bar.firstChild.style.width = `${((now - p.start) / (p.end - p.start)) * 100}%`;
      }
      totalEl.textContent = done ? '' : `Total left ${fmt((total - now) / 1000)}`;
      playBtn.textContent = s.running ? '❚❚' : '▶';
      playBtn.setAttribute('aria-label', s.running ? 'Pause' : 'Start');
      if (idx !== lastPhase) { lastPhase = idx; box.classList.remove('flash'); void box.offsetWidth; if (s.running) box.classList.add('flash'); }
    }
    function loop() {
      cancelAnimationFrame(raf);
      const step = () => { draw(); if (s.running) raf = requestAnimationFrame(step); };
      step();
    }
    // Keep booking sounds ahead, and keep the display right even in a background tab.
    const offTick = onTick(() => { if (s.running) { book(); if (document.hidden) draw(); } });

    if (s.running) { book(); loop(); } else draw();

    return {
      destroy() { cancelAnimationFrame(raf); offTick(); unbook(); },
      openSettings() {
        const change = () => { ctx.save(); if (s.running) { unbook(); book(); } draw(); };
        panel(ctx, 'Interval timer',
          h('div', { class: 'chips' }, ...PRESETS.map(([label, p]) => h('button', { class: 'chip', onclick: () => { Object.assign(s, p); reset(); ctx.closeSettings(); } }, label))),
          h('div', { class: 'row' },
            field(`${s.workLabel || 'Work'} (seconds)`, numberInput(s.work, (v) => { s.work = Math.max(1, v | 0); change(); }, { min: 1 })),
            field(`${s.restLabel || 'Rest'} (seconds)`, numberInput(s.rest, (v) => { s.rest = Math.max(0, v | 0); change(); }, { min: 0 })),
            field('Rounds', numberInput(s.rounds, (v) => { s.rounds = Math.max(1, Math.min(99, v | 0)); change(); }, { min: 1, max: 99 })),
            field('Get ready (seconds)', numberInput(s.prep, (v) => { s.prep = Math.max(0, v | 0); change(); }, { min: 0 })),
          ),
          h('div', { class: 'row' },
            field('Name for work', textInput(s.workLabel, (v) => { s.workLabel = v; change(); }, { placeholder: 'e.g. Work, Go, Station' })),
            field('Name for rest', textInput(s.restLabel, (v) => { s.restLabel = v; change(); }, { placeholder: 'e.g. Rest, Rotate, Swap' })),
          ),
          checkbox('Rest after the last round too', s.restAfterLast, (v) => { s.restAfterLast = v; change(); }),
          checkbox('Beep for the last 3 seconds', s.countdown, (v) => { s.countdown = v; change(); }),
          field('Sound when work starts', soundSelect(s.workSound, (v) => { s.workSound = v; change(); })),
          field('Sound when rest starts', soundSelect(s.restSound, (v) => { s.restSound = v; change(); })),
          field('Sound at the end', soundSelect(s.endSound, (v) => { s.endSound = v; change(); })),
          h('p', { class: 'hint' }, 'Good for fitness circuits, rotating groups between stations, or sport drills.'),
        );
      },
      closeSettings: draw,
    };
  },
};
