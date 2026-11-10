import { h } from '../util.js';
import { fmtTime } from './_common.js';

export default {
  type: 'stopwatch',
  title: 'Stopwatch',
  icon: '⏱️',
  group: 'core',
  size: [340, 260],
  defaultState: () => ({ running: false, startedAt: null, elapsed: 0, laps: [] }),

  mount(ctx) {
    const s = ctx.state;
    let raf;
    const timeEl = h('div', { class: 'sw-time' });
    const playBtn = h('button', { class: 'btn big primary' });
    const lapsEl = h('ol', { class: 'sw-laps' });
    const now = () => s.elapsed + (s.running ? Date.now() - s.startedAt : 0);

    const fmt = (ms) => `${fmtTime(Math.floor(ms / 1000))}.${String(Math.floor((ms % 1000) / 100))}`;

    playBtn.addEventListener('click', () => {
      if (s.running) {
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
        timeEl,
        h('div', { class: 'timer-controls' },
          playBtn,
          h('button', { class: 'btn big', onclick: () => { if (s.running || s.elapsed) { s.laps.push(now()); ctx.save(); render(); } } }, 'Lap'),
          h('button', { class: 'btn big', 'aria-label': 'Reset', onclick: () => { s.running = false; s.elapsed = 0; s.startedAt = null; s.laps = []; ctx.save(); render(); } }, '↺'),
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
    loop();
    return { destroy: () => cancelAnimationFrame(raf) };
  },
};
