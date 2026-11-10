import { h, parseLines, shuffle } from '../util.js';
import { play, soundSelect } from '../sound.js';
import { panel, select, checkbox, textarea, field } from './_common.js';

const COLORS = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#7b2cbf', '#ff6fb5', '#8ac926', '#1982c4', '#fb8500'];

export default {
  type: 'namepicker',
  title: 'Name picker',
  icon: '🎡',
  group: 'manage',
  size: [440, 460],
  hasSettings: true,
  privateKeys: ['names', 'picked', 'last'],
  defaultState: () => ({ names: '', mode: 'wheel', removePicked: true, picked: [], last: '', sound: 'fanfare' }),

  mount(ctx) {
    const s = ctx.state;
    const canvas = h('canvas', { class: 'wheel-canvas', 'aria-hidden': 'true' });
    const g = canvas.getContext('2d');
    const card = h('div', { class: 'pick-card' });
    const result = h('div', { class: 'pick-result', 'aria-live': 'polite' });
    const stage = h('button', { class: 'pick-stage', title: 'Tap to pick', onclick: pick }, canvas, card, h('div', { class: 'wheel-pointer' }, '▼'));
    const info = h('div', { class: 'pick-info' });
    const empty = h('div', { class: 'empty' },
      h('p', {}, 'Add your class list to start picking'),
      h('button', { class: 'btn primary', onclick: () => ctx.openSettings() }, 'Add names'),
    );
    const foot = h('div', { class: 'pick-foot' });
    ctx.view.append(h('div', { class: 'picker' }, empty, stage, result,
      foot,
    ));
    foot.append(
        h('button', { class: 'btn primary big', onclick: pick }, 'Pick'),
        info,
        h('button', { class: 'btn small', onclick: () => { s.picked = []; s.last = ''; ctx.save(); render(); }, title: 'Put everyone back in' }, '↺ Reset'),
    );

    let angle = 0;
    let spinning = false;
    let raf;

    const all = () => parseLines(s.names);
    const pool = () => {
      const a = all();
      if (!s.removePicked) return a;
      const left = a.filter((n) => !s.picked.includes(n));
      return left;
    };

    function pick() {
      if (spinning) return;
      let p = pool();
      if (!p.length && all().length) {
        s.picked = [];
        p = pool();
      }
      if (!p.length) return;
      const winnerIdx = Math.floor(Math.random() * p.length);
      const winner = p[winnerIdx];
      result.textContent = '';
      spinning = true;
      if (s.mode === 'wheel') spinWheel(p, winnerIdx, () => done(winner));
      else flickerCard(p, winner, () => done(winner));
    }

    function done(winner) {
      spinning = false;
      s.last = winner;
      if (s.removePicked && !s.picked.includes(winner)) s.picked.push(winner);
      play(s.sound);
      result.textContent = winner;
      result.classList.remove('pop');
      void result.offsetWidth;
      result.classList.add('pop');
      ctx.save();
      updateInfo();
      if (s.mode === 'wheel') setTimeout(() => !spinning && drawWheel(pool()), 1600);
    }

    function spinWheel(names, idx, cb) {
      const seg = (Math.PI * 2) / names.length;
      // Pointer is at the top (-90deg). Land in the middle of the winning segment, with a bit of jitter.
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      const target = -Math.PI / 2 - (idx * seg + seg / 2) + jitter;
      const turns = 5 + Math.floor(Math.random() * 3);
      const startAngle = angle % (Math.PI * 2);
      let end = target - turns * Math.PI * 2;
      while (end > startAngle - turns * Math.PI * 2) end -= Math.PI * 2;
      const dur = 4200;
      const t0 = performance.now();
      let lastSeg = -1;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const ease = 1 - Math.pow(1 - k, 4);
        angle = startAngle + (end - startAngle) * ease;
        const segNow = Math.floor((((-Math.PI / 2 - angle) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / seg);
        if (segNow !== lastSeg) { lastSeg = segNow; play('tick'); }
        drawWheel(names);
        if (k < 1) raf = requestAnimationFrame(step);
        else cb();
      };
      raf = requestAnimationFrame(step);
    }

    function flickerCard(names, winner, cb) {
      let n = 0;
      const total = 22;
      const tick = () => {
        n++;
        card.textContent = n >= total ? winner : names[Math.floor(Math.random() * names.length)];
        play('tick');
        if (n < total) raf = setTimeout(tick, 40 + n * n * 0.5);
        else cb();
      };
      tick();
    }

    function sizeCanvas() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    }

    function drawWheel(names) {
      const W = canvas.width;
      const H = canvas.height;
      g.clearRect(0, 0, W, H);
      if (!names.length) return;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) / 2 - 4;
      const seg = (Math.PI * 2) / names.length;
      names.forEach((name, i) => {
        const a0 = angle + i * seg;
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, R, a0, a0 + seg);
        g.closePath();
        g.fillStyle = COLORS[i % COLORS.length];
        if (names.length > 1 && names.length % COLORS.length === 1 && i === names.length - 1) g.fillStyle = COLORS[3];
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = Math.max(1, R / 120);
        g.stroke();
        g.save();
        g.translate(cx, cy);
        g.rotate(a0 + seg / 2);
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.fillStyle = '#fff';
        const fs = Math.max(10, Math.min(R / 7, (seg * R) / 1.6));
        g.font = `700 ${fs}px system-ui, sans-serif`;
        const label = name.length > 16 ? `${name.slice(0, 15)}…` : name;
        g.fillText(label, R - fs * 0.5, 0);
        g.restore();
      });
      g.beginPath();
      g.arc(cx, cy, R * 0.12, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
    }

    function updateInfo() {
      const total = all().length;
      info.textContent = s.removePicked ? `${pool().length} of ${total} left` : `${total} names`;
    }

    function render() {
      const has = all().length > 0;
      empty.hidden = has;
      stage.hidden = !has;
      foot.hidden = !has;
      result.hidden = !has;
      stage.dataset.mode = s.mode;
      canvas.hidden = s.mode !== 'wheel';
      card.hidden = s.mode === 'wheel';
      result.textContent = s.last || '';
      if (s.mode !== 'wheel') card.textContent = s.last || '?';
      updateInfo();
      if (has && s.mode === 'wheel') {
        sizeCanvas();
        drawWheel(pool().length ? pool() : all());
      }
    }
    render();

    return {
      destroy: () => { cancelAnimationFrame(raf); clearTimeout(raf); },
      resize: () => { if (!spinning) render(); },
      openSettings() {
        panel(ctx, 'Name picker',
          field('Names (one per line)', textarea(s.names, (v) => { s.names = v; s.picked = s.picked.filter((n) => parseLines(v).includes(n)); ctx.save(); }, { rows: 8, placeholder: 'Ava\nBen\nCharlie' })),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => { s.names = shuffle(parseLines(s.names)).join('\n'); ctx.save(); ctx.closeSettings(); } }, 'Shuffle order'),
            h('button', { class: 'btn', onclick: () => { s.names = parseLines(s.names).sort((a, b) => a.localeCompare(b)).join('\n'); ctx.save(); ctx.closeSettings(); } }, 'Sort A–Z'),
          ),
          field('Style', select([['wheel', 'Spinning wheel'], ['card', 'Flash card']], s.mode, (v) => { s.mode = v; ctx.save(); })),
          checkbox('Don’t pick the same person twice (until everyone has had a turn)', s.removePicked, (v) => { s.removePicked = v; ctx.save(); }),
          field('Sound', soundSelect(s.sound, (v) => { s.sound = v; ctx.save(); })),
          h('p', { class: 'hint' }, 'Names stay on this device. They are left out of share links unless you choose to include them.'),
        );
      },
      closeSettings: render,
    };
  },
};
