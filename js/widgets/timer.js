import { h } from '../util.js';
import { play, soundSelect, scheduleSound, audioReady } from '../sound.js';
import { onTick } from '../ticker.js';
import { panel, numberInput, textInput, field, fmtTime } from './_common.js';

const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export const TIMER_STYLES = [
  ['ring', 'Ring (green → red)'],
  ['pie', 'Circle (white turning red)'],
  ['rect', 'Rectangle (white turning red)'],
  ['hourglass', 'Hourglass'],
  ['bar', 'Progress bar'],
  ['digital', 'Numbers only'],
];

/** Hourglass drawing. Glass bulbs are triangles so sand levels can be worked out exactly. */
function buildHourglass() {
  // top bulb: (18,14)-(82,14) narrowing to the neck at (50,78); bottom bulb: neck (50,82) widening to (18..82,146)
  const svg = svgEl('svg', { viewBox: '0 0 100 160', class: 'hg' });
  const defs = svgEl('defs');
  const clipTop = svgEl('clipPath', { id: '' });
  const clipBot = svgEl('clipPath', { id: '' });
  const uidStr = Math.random().toString(36).slice(2, 8);
  clipTop.id = `hgt${uidStr}`;
  clipBot.id = `hgb${uidStr}`;
  clipTop.append(svgEl('path', { d: 'M18 14 L82 14 L52 78 L48 78 Z' }));
  clipBot.append(svgEl('path', { d: 'M48 82 L52 82 L82 146 L18 146 Z' }));
  defs.append(clipTop, clipBot);
  const sandTop = svgEl('rect', { x: 0, y: 14, width: 100, height: 64, class: 'hg-sand', 'clip-path': `url(#${clipTop.id})` });
  const sandBot = svgEl('rect', { x: 0, y: 146, width: 100, height: 0, class: 'hg-sand', 'clip-path': `url(#${clipBot.id})` });
  const mound = svgEl('path', { class: 'hg-sand', 'clip-path': `url(#${clipBot.id})` });
  const stream = svgEl('line', { x1: 50, y1: 76, x2: 50, y2: 146, class: 'hg-stream' });
  const glass = svgEl('path', { d: 'M18 14 L82 14 L52 78 L52 82 L82 146 L18 146 L48 82 L48 78 Z', class: 'hg-glass' });
  const capT = svgEl('rect', { x: 8, y: 4, width: 84, height: 10, rx: 4, class: 'hg-cap' });
  const capB = svgEl('rect', { x: 8, y: 146, width: 84, height: 10, rx: 4, class: 'hg-cap' });
  svg.append(defs, sandTop, sandBot, mound, stream, glass, capT, capB);

  return {
    svg,
    update(frac, running) {
      // frac = fraction of time remaining (1 = full top)
      const f = Math.max(0, Math.min(1, frac));
      // Top sand surface: area of a triangle ∝ height², so height = 64·√f
      const topH = 64 * Math.sqrt(f);
      sandTop.setAttribute('y', 78 - topH);
      sandTop.setAttribute('height', topH);
      // Bottom: empty part above the sand is a triangle from the neck with height 64·√f
      const yb = 82 + 64 * Math.sqrt(f);
      sandBot.setAttribute('y', yb);
      sandBot.setAttribute('height', Math.max(0, 146 - yb));
      const peak = Math.min(10, (146 - yb) * 0.6 + (f < 1 ? 3 : 0));
      mound.setAttribute('d', f < 1 ? `M18 ${yb + 0.5} L50 ${yb - peak} L82 ${yb + 0.5} Z` : '');
      stream.style.display = running && f > 0 && f < 1 ? '' : 'none';
      stream.setAttribute('y2', yb - peak + 1);
    },
  };
}

export default {
  type: 'timer',
  title: 'Timer',
  icon: '⏳',
  group: 'core',
  size: [380, 320],
  hasSettings: true,
  defaultState: () => ({
    duration: 300, // seconds
    remaining: 300,
    running: false,
    endAt: null,
    sound: 'chime',
    style: 'ring',
    label: '',
    presets: [60, 120, 300, 600],
  }),

  mount(ctx) {
    const { state: s } = ctx;
    let raf;
    let finished = false;
    let booking = null; // end sound booked on the audio clock (plays even in a background tab)

    function book() {
      booking?.cancel();
      booking = null;
      if (s.running && s.endAt && s.sound !== 'none') booking = scheduleSound(s.sound, s.endAt);
    }
    function unbook() {
      booking?.cancel();
      booking = null;
    }

    // Restore a timer that was running when the page was closed.
    if (s.running && s.endAt) {
      s.remaining = Math.max(0, (s.endAt - Date.now()) / 1000);
      if (s.remaining <= 0) {
        s.running = false;
        s.remaining = 0;
      }
    }

    // --- visuals (all built once; CSS shows the one for the current style) ---
    const ring = svgEl('svg', { viewBox: '0 0 100 100', class: 'timer-ring' });
    const ringBg = svgEl('circle', { cx: 50, cy: 50, r: 45, class: 'ring-bg' });
    const ringFg = svgEl('circle', { cx: 50, cy: 50, r: 45, class: 'ring-fg', pathLength: 100 });
    ring.append(ringBg, ringFg);

    const pie = h('div', { class: 'timer-pie', 'aria-hidden': 'true' });
    const rectFill = h('div', { class: 'timer-rect-fill' });
    const rect = h('div', { class: 'timer-rect', 'aria-hidden': 'true' }, rectFill);
    const bar = h('div', { class: 'timer-bar' }, h('div', { class: 'timer-bar-fill' }));
    const hg = buildHourglass();

    const timeEl = h('button', { class: 'timer-time', title: 'Tap to start / pause' });
    timeEl.addEventListener('click', () => (s.running ? pause() : start()));
    const labelEl = h('div', { class: 'timer-label' });
    const readout = h('div', { class: 'timer-center' }, labelEl, timeEl);
    const graphic = h('div', { class: 'timer-graphic' }, ring, pie, rect, hg.svg);
    const face = h('div', { class: 'timer-face' }, graphic, bar, readout);

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
          h('button', { class: 'chip', onclick: () => setDuration(p) }, p >= 60 ? `${+(p / 60).toFixed(2)} min` : `${p}s`),
        ),
      );
    };
    renderPresets();

    ctx.view.append(h('div', { class: 'timer' }, face, controls, presets));

    function setDuration(sec) {
      unbook();
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
      book();
      ctx.save();
      loop();
    }
    function pause() {
      unbook();
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
      if (s.running) book();
      render();
      ctx.save();
    }
    /** Called by the screen redraw loop and by the background clock. */
    function checkDone() {
      if (!s.running || Date.now() < s.endAt) return false;
      s.running = false;
      s.endAt = null;
      s.remaining = 0;
      if (!finished) {
        finished = true;
        // If the sound was booked on the audio clock it has already played on time.
        if (!booking?.live) play(s.sound);
        booking = null;
        ctx.el.classList.add('times-up');
      }
      ctx.save();
      render();
      return true;
    }
    function loop() {
      cancelAnimationFrame(raf);
      const tick = () => {
        if (!s.running) return;
        if (checkDone()) return;
        s.remaining = Math.max(0, (s.endAt - Date.now()) / 1000);
        render();
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    function render() {
      const frac = s.duration ? s.remaining / s.duration : 0; // remaining
      const used = 1 - frac;
      timeEl.textContent = s.remaining <= 0 && finished ? "Time's up!" : fmtTime(Math.ceil(s.remaining));
      labelEl.textContent = s.label || '';
      face.dataset.style = s.style;

      const traffic = frac > 0.5 ? 'var(--green)' : frac > 0.2 ? 'var(--amber)' : 'var(--red)';
      ringFg.style.strokeDashoffset = String(100 - frac * 100);
      ringFg.style.stroke = traffic;
      bar.firstChild.style.width = `${frac * 100}%`;
      bar.firstChild.style.background = traffic;
      // White turning red: red grows clockwise from 12 o'clock as time is used.
      pie.style.background = `conic-gradient(var(--red) 0 ${used * 360}deg, #fff ${used * 360}deg 360deg)`;
      rectFill.style.width = `${used * 100}%`;
      hg.update(frac, s.running);

      playBtn.textContent = s.running ? '⏸' : '▶';
      playBtn.setAttribute('aria-label', s.running ? 'Pause' : 'Start');
    }

    render();
    if (s.running) { book(); loop(); }

    // Background clock: finishes the timer on time even when the tab is hidden
    // (the redraw loop above is paused by the browser in background tabs).
    const offTick = onTick(() => {
      if (!s.running) return;
      if (checkDone()) return;
      // Sound wasn't allowed when the timer started? Book it as soon as it is.
      if (!booking?.live && audioReady()) book();
      if (document.hidden) s.remaining = Math.max(0, (s.endAt - Date.now()) / 1000);
    });

    return {
      destroy: () => { cancelAnimationFrame(raf); offTick(); unbook(); },
      openSettings() {
        const mins = Math.floor(s.duration / 60);
        const secs = Math.round(s.duration % 60);
        let m = mins;
        let sec = secs;
        const styleGrid = h('div', { class: 'style-grid' },
          ...TIMER_STYLES.map(([v, label]) =>
            h('button', {
              class: `style-opt${s.style === v ? ' on' : ''}`,
              onclick: (e) => {
                e.preventDefault();
                s.style = v;
                styleGrid.querySelectorAll('.style-opt').forEach((b) => b.classList.remove('on'));
                e.currentTarget.classList.add('on');
                render();
                ctx.save();
              },
            }, h('span', { class: `style-icon si-${v}` }), label),
          ),
        );
        panel(ctx, 'Timer settings',
          h('div', { class: 'row' },
            field('Minutes', numberInput(mins, (v) => { m = v; setDuration(m * 60 + sec); }, { min: 0, max: 600 })),
            field('Seconds', numberInput(secs, (v) => { sec = v; setDuration(m * 60 + sec); }, { min: 0, max: 59 })),
          ),
          field('Look', styleGrid),
          field('Label', textInput(s.label, (v) => { s.label = v; render(); ctx.save(); }, { placeholder: 'e.g. Pack up' })),
          field('End sound', soundSelect(s.sound, (v) => { s.sound = v; if (s.running) book(); ctx.save(); })),
          field('Quick buttons (minutes, comma separated)', textInput(s.presets.map((p) => +(p / 60).toFixed(2)).join(', '), (v) => {
            const list = v.split(/[,\s]+/).map(Number).filter((n) => n > 0).slice(0, 6);
            if (list.length) { s.presets = list.map((n) => Math.round(n * 60)); renderPresets(); ctx.save(); }
          })),
        );
      },
    };
  },
};

