import { h, setKids } from '../util.js';
import { fmtTime, panel, checkbox, field, textInput } from './_common.js';
import { logEvent, recBadge, RECORD_HINT } from '../datalog.js';
import { namesFor } from '../classes.js';

export default {
  type: 'stopwatch',
  title: 'Stopwatch',
  icon: '⏱️',
  group: 'core',
  size: [340, 260],
  hasSettings: true,
  privateKeys: ['who'],
  hold(s, rec) {
    if (!s.running) return null;
    const sec = (Date.now() - s.startedAt) / 1000;
    if (s.record && sec >= 1) logEvent({ widget: 'stopwatch', widgetId: rec.id, kind: 'timed', label: s.label || 'Timed', who: s.who, value: sec, unit: 'seconds' });
    s.elapsed += Date.now() - s.startedAt;
    s.running = false;
    s.startedAt = null;
    s.held = true;
    return `Stopwatch: stopped at ${fmtTime(Math.floor(s.elapsed / 1000))}`;
  },
  unhold(s) {
    if (!s.held) return;
    s.held = false;
    s.running = true;
    s.startedAt = Date.now();
  },
  defaultState: () => ({ running: false, startedAt: null, elapsed: 0, laps: [], record: false, label: 'Off-task', who: '', labels: 'Off-task, Transition, On-task, Packing up' }),

  mount(ctx) {
    const s = ctx.state;
    let raf;
    const timeEl = h('div', { class: 'sw-time' });
    const badge = recBadge();
    const recBar = h('div', { class: 'sw-rec' });
    /** Each start→stop is one recorded "session" (e.g. 2 min 10 s off-task). */
    function logRun() {
      if (!s.record || !s.startedAt) return;
      const sec = (Date.now() - s.startedAt) / 1000;
      if (sec < 1) return;
      logEvent({ widget: 'stopwatch', widgetId: ctx.rec.id, kind: 'timed', label: s.label || 'Timed', who: s.who, value: sec, unit: 'seconds' });
    }
    function drawRec() {
      recBar.hidden = !s.record;
      badge.hidden = !s.record;
      if (!s.record) return;
      // Suggest names from the current class as you type.
      const listId = `swl-${ctx.rec.id}`;
      const dl = h('datalist', { id: listId }, ...(namesFor('current') || []).map((n) => h('option', { value: n })));
      const who = h('input', { type: 'text', value: s.who, placeholder: 'Student (optional)', 'aria-label': 'Student', class: 'sw-who', list: listId });
      who.addEventListener('input', () => { s.who = who.value.trim(); ctx.save(); });
      setKids(recBar,
        h('span', { class: 'hint' }, 'Timing:'),
        ...s.labels.split(',').map((x) => x.trim()).filter(Boolean).map((l) =>
          h('button', { class: `chip${s.label === l ? ' on' : ''}`, onclick: () => { s.label = l; ctx.save(); drawRec(); } }, l)),
        who,
        dl,
      );
    }
    const playBtn = h('button', { class: 'btn big primary' });
    const lapsEl = h('ol', { class: 'sw-laps' });
    const now = () => s.elapsed + (s.running ? Date.now() - s.startedAt : 0);

    const fmt = (ms) => `${fmtTime(Math.floor(ms / 1000))}.${String(Math.floor((ms % 1000) / 100))}`;

    playBtn.addEventListener('click', () => {
      if (s.running) {
        logRun();
        s.elapsed = now();
        s.running = false;
        s.startedAt = null;
      } else {
        s.running = true;
        s.startedAt = Date.now();
      }
      ctx.save();
      loop();
    });

    ctx.view.append(
      h('div', { class: 'stopwatch' },
        badge,
        recBar,
        timeEl,
        h('div', { class: 'timer-controls' },
          playBtn,
          h('button', { class: 'btn big', onclick: () => { if (s.running || s.elapsed) { s.laps.push(now()); ctx.save(); render(); } } }, 'Lap'),
          h('button', { class: 'btn big', 'aria-label': 'Reset', onclick: () => { if (s.running) logRun(); s.running = false; s.elapsed = 0; s.startedAt = null; s.laps = []; ctx.save(); render(); } }, '↺'),
        ),
        lapsEl,
      ),
    );

    function render() {
      timeEl.textContent = fmt(now());
      playBtn.textContent = s.running ? '⏸' : '▶';
      playBtn.setAttribute('aria-label', s.running ? 'Pause' : 'Start');
      lapsEl.replaceChildren(...s.laps.map((l, i) => h('li', {}, `Lap ${i + 1}: ${fmt(l - (s.laps[i - 1] || 0))}`)).reverse());
    }
    function loop() {
      cancelAnimationFrame(raf);
      render();
      if (s.running) raf = requestAnimationFrame(loop);
    }
    drawRec();
    loop();
    return {
      destroy: () => cancelAnimationFrame(raf),
      openSettings() {
        panel(ctx, 'Stopwatch',
          checkbox('📊 Record each start → stop in the Data log', s.record, (v) => { s.record = v; ctx.save(); drawRec(); }),
          field('Things you time (comma separated)', textInput(s.labels, (v) => { s.labels = v; ctx.save(); drawRec(); })),
          h('p', { class: 'hint' }, 'Choose what you are timing before you press ▶, e.g. Off-task or Transition. Add a student name to time one student.'),
          h('p', { class: 'hint' }, RECORD_HINT),
        );
      },
    };
  },
};
