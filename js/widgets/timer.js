import { h } from '../util.js';
import { play, soundSelect } from '../sound.js';
import { panel, numberInput, select, textInput, field, fmtTime } from './_common.js';

export default {
  type: 'timer',
  title: 'Timer',
  icon: '⏳',
  group: 'core',
  size: [360, 300],
  hasSettings: true,
  defaultState: () => ({
    duration: 300, // seconds
    remaining: 300,
    running: false,
    endAt: null,
    sound: 'chime',
    style: 'ring', // ring | digital | bar
    label: '',
    presets: [60, 120, 300, 600],
  }),

  mount(ctx) {
    const { state: s } = ctx;
    let raf;
    let finished = false;

    // Restore a timer that was running when the page was closed.
    if (s.running && s.endAt) {
      s.remaining = Math.max(0, (s.endAt - Date.now()) / 1000);
      if (s.remaining <= 0) {
        s.running = false;
        s.remaining = 0;
      }
    }

    const ringFg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.classList.add('timer-ring');
    svg.innerHTML = '<circle cx="50" cy="50" r="45" class="ring-bg"/>';
    ringFg.setAttribute('cx', 50);
    ringFg.setAttribute('cy', 50);
    ringFg.setAttribute('r', 45);
    ringFg.setAttribute('class', 'ring-fg');
    ringFg.setAttribute('pathLength', 100);
    svg.append(ringFg);

    const timeEl = h('button', { class: 'timer-time', title: 'Tap to start / pause' });
    timeEl.addEventListener('click', () => (s.running ? pause() : start()));
    const labelEl = h('div', { class: 'timer-label' });
    const bar = h('div', { class: 'timer-bar' }, h('div', { class: 'timer-bar-fill' }));
    const face = h('div', { class: 'timer-face' }, svg, h('div', { class: 'timer-center' }, labelEl, timeEl), bar);

    const playBtn = h('button', { class: 'btn big primary', 'aria-label': 'Start' });
    playBtn.addEventListener('click', () => (s.running ? pause() : start()));
    const controls = h('div', { class: 'timer-controls' },
      h('button', { class: 'btn big', 'aria-label': 'Minus one minute', onclick: () => adjust(-60) }, '−1m'),
      playBtn,
      h('button', { class: 'btn big', 'aria-label': 'Reset', onclick: reset }, '↺'),
      h('button', { class: 'btn big', 'aria-label': 'Plus one minute', onclick: () => adjust(60) }, '+1m'),
    );
    const presets = h('div', { class: 'timer-presets' });
    const renderPresets = () => {
      presets.replaceChildren(
        ...s.presets.map((p) =>
          h('button', { class: 'chip', onclick: () => setDuration(p) }, p >= 60 ? `${p / 60} min` : `${p}s`),
        ),
      );
    };
    renderPresets();

    ctx.view.append(h('div', { class: 'timer' }, face, controls, presets));

    function setDuration(sec) {
      s.duration = Math.max(1, Math.round(sec));
      s.remaining = s.duration;
      s.running = false;
      s.endAt = null;
      finished = false;
      ctx.el.classList.remove('times-up');
      render();
      ctx.save();
    }
    function start() {
      if (s.remaining <= 0) s.remaining = s.duration;
      finished = false;
      ctx.el.classList.remove('times-up');
      s.running = true;
      s.endAt = Date.now() + s.remaining * 1000;
      ctx.save();
      loop();
    }
    function pause() {
      s.running = false;
      s.remaining = Math.max(0, (s.endAt - Date.now()) / 1000);
      s.endAt = null;
      cancelAnimationFrame(raf);
      render();
      ctx.save();
    }
    function reset() {
      setDuration(s.duration);
    }
    function adjust(delta) {
      if (s.running) {
        s.endAt = Math.max(Date.now() + 1000, s.endAt + delta * 1000);
        s.duration = Math.max(s.duration, (s.endAt - Date.now()) / 1000);
      } else {
        s.remaining = Math.max(1, s.remaining + delta);
        s.duration = Math.max(s.remaining, delta > 0 ? s.duration + delta : s.remaining);
      }
      finished = false;
      ctx.el.classList.remove('times-up');
      render();
      ctx.save();
    }
    function loop() {
      cancelAnimationFrame(raf);
      const tick = () => {
        if (!s.running) return;
        s.remaining = Math.max(0, (s.endAt - Date.now()) / 1000);
        if (s.remaining <= 0) {
          s.running = false;
          s.endAt = null;
          s.remaining = 0;
          if (!finished) {
            finished = true;
            play(s.sound);
            ctx.el.classList.add('times-up');
          }
          ctx.save();
          render();
          return;
        }
        render();
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    function render() {
      const frac = s.duration ? s.remaining / s.duration : 0;
      timeEl.textContent = s.remaining <= 0 && finished ? "Time's up!" : fmtTime(Math.ceil(s.remaining));
      labelEl.textContent = s.label || '';
      ringFg.style.strokeDashoffset = String(100 - frac * 100);
      ringFg.style.stroke = frac > 0.5 ? 'var(--green)' : frac > 0.2 ? 'var(--amber)' : 'var(--red)';
      bar.firstChild.style.width = `${frac * 100}%`;
      bar.firstChild.style.background = ringFg.style.stroke;
      face.dataset.style = s.style;
      playBtn.textContent = s.running ? '⏸' : '▶';
      playBtn.setAttribute('aria-label', s.running ? 'Pause' : 'Start');
    }

    render();
    if (s.running) loop();

    return {
      destroy: () => cancelAnimationFrame(raf),
      openSettings() {
        const mins = Math.floor(s.duration / 60);
        const secs = Math.round(s.duration % 60);
        let m = mins;
        let sec = secs;
        panel(ctx, 'Timer settings',
          h('div', { class: 'row' },
            field('Minutes', numberInput(mins, (v) => { m = v; setDuration(m * 60 + sec); }, { min: 0, max: 600 })),
            field('Seconds', numberInput(secs, (v) => { sec = v; setDuration(m * 60 + sec); }, { min: 0, max: 59 })),
          ),
          field('Label', textInput(s.label, (v) => { s.label = v; render(); ctx.save(); }, { placeholder: 'e.g. Pack up' })),
          field('Style', select([['ring', 'Circle'], ['bar', 'Progress bar'], ['digital', 'Numbers only']], s.style, (v) => { s.style = v; render(); ctx.save(); })),
          field('End sound', soundSelect(s.sound, (v) => { s.sound = v; ctx.save(); })),
          field('Quick buttons (minutes, comma separated)', textInput(s.presets.map((p) => p / 60).join(', '), (v) => {
            const list = v.split(/[,\s]+/).map(Number).filter((n) => n > 0).slice(0, 6);
            if (list.length) { s.presets = list.map((n) => Math.round(n * 60)); renderPresets(); ctx.save(); }
          })),
        );
      },
    };
  },
};
