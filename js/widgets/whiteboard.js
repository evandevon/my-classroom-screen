import { h } from '../util.js';
import { panel, select, field } from './_common.js';

// Strokes are stored as vectors in 0..1 coordinates, so the drawing stays sharp at any widget size.
const PENS = ['#1d1d1f', '#e63946', '#1982c4', '#2a9d8f', '#f4a261', '#7b2cbf', '#ffffff'];
const SIZES = [0.004, 0.01, 0.025];

export default {
  type: 'whiteboard',
  title: 'Whiteboard',
  icon: '✏️',
  group: 'extras',
  size: [640, 440],
  hasSettings: true,
  heavyKeys: ['strokes'],
  defaultState: () => ({ strokes: [], bg: 'white' }),

  mount(ctx) {
    const s = ctx.state;
    const canvas = h('canvas', { class: 'wb-canvas' });
    const g = canvas.getContext('2d');
    let color = PENS[0];
    let size = SIZES[1];
    let tool = 'pen';
    const redo = [];

    const toolBtn = (label, title, on) => h('button', { class: 'wb-tool', title, 'aria-label': title, onclick: on }, label);
    const penBtns = PENS.map((c) => {
      const b = h('button', { class: 'wb-color', style: { background: c }, 'aria-label': `Pen colour ${c}`, onclick: () => { color = c; tool = 'pen'; sync(); } });
      b.dataset.c = c;
      return b;
    });
    const sizeBtns = SIZES.map((sz, i) => {
      const b = h('button', { class: 'wb-size', 'aria-label': ['Thin', 'Medium', 'Thick'][i], onclick: () => { size = sz; sync(); } }, h('span', { style: { width: `${6 + i * 7}px`, height: `${6 + i * 7}px` } }));
      b.dataset.sz = sz;
      return b;
    });
    const eraser = toolBtn('🧽', 'Eraser', () => { tool = tool === 'eraser' ? 'pen' : 'eraser'; sync(); });
    const bar = h('div', { class: 'wb-bar' },
      ...penBtns,
      h('span', { class: 'wb-sep' }),
      ...sizeBtns,
      h('span', { class: 'wb-sep' }),
      eraser,
      toolBtn('↶', 'Undo', () => { if (s.strokes.length) { redo.push(s.strokes.pop()); draw(); ctx.save(); } }),
      toolBtn('↷', 'Redo', () => { if (redo.length) { s.strokes.push(redo.pop()); draw(); ctx.save(); } }),
      toolBtn('🗑', 'Clear all', () => { if (s.strokes.length && confirm('Clear the whiteboard?')) { s.strokes = []; redo.length = 0; draw(); ctx.save(); } }),
    );
    const surface = h('div', { class: 'wb-surface' }, canvas);
    ctx.view.append(h('div', { class: 'wb' }, surface, bar));

    function sync() {
      penBtns.forEach((b) => b.classList.toggle('on', tool === 'pen' && b.dataset.c === color));
      sizeBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.sz) === size));
      eraser.classList.toggle('on', tool === 'eraser');
      surface.dataset.bg = s.bg;
      surface.classList.toggle('erasing', tool === 'eraser');
    }

    function fit() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = Math.max(1, Math.round(r.width * dpr));
      const H = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
    }

    function strokePath(st) {
      const W = canvas.width;
      const H = canvas.height;
      const m = Math.min(W, H);
      g.globalCompositeOperation = st.e ? 'destination-out' : 'source-over';
      g.strokeStyle = st.c;
      g.fillStyle = st.c;
      g.lineWidth = st.s * m * (st.e ? 3 : 1);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const p = st.p;
      if (p.length === 2) {
        g.beginPath();
        g.arc(p[0] * W, p[1] * H, g.lineWidth / 2, 0, Math.PI * 2);
        g.fill();
        return;
      }
      g.beginPath();
      g.moveTo(p[0] * W, p[1] * H);
      // Smooth with quadratic curves through midpoints.
      for (let i = 2; i < p.length - 2; i += 2) {
        const mx = ((p[i] + p[i + 2]) / 2) * W;
        const my = ((p[i + 1] + p[i + 3]) / 2) * H;
        g.quadraticCurveTo(p[i] * W, p[i + 1] * H, mx, my);
      }
      g.lineTo(p[p.length - 2] * W, p[p.length - 1] * H);
      g.stroke();
    }

    function draw() {
      fit();
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (const st of s.strokes) strokePath(st);
      g.globalCompositeOperation = 'source-over';
    }

    let current = null;
    const pt = (e) => {
      const r = canvas.getBoundingClientRect();
      return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)];
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      // Pen "eraser end" on styluses that support it.
      const erasing = tool === 'eraser' || e.buttons === 32;
      current = { c: color, s: size, e: erasing ? 1 : 0, p: pt(e) };
      s.strokes.push(current);
      redo.length = 0;
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) current.p.push(...pt(ev));
      draw();
    });
    const end = () => {
      if (!current) return;
      current = null;
      ctx.save();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    sync();
    requestAnimationFrame(draw);

    return {
      resize: draw,
      openSettings() {
        panel(ctx, 'Whiteboard',
          field('Background', select([['white', 'White'], ['grid', 'Grid paper'], ['lines', 'Lined paper'], ['dots', 'Dot paper'], ['black', 'Chalkboard'], ['clear', 'See-through']], s.bg, (v) => { s.bg = v; sync(); ctx.save(); })),
          h('button', { class: 'btn', onclick: download }, '⬇ Save drawing as picture'),
        );
      },
    };

    function download() {
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const o = out.getContext('2d');
      o.fillStyle = s.bg === 'black' ? '#1f3d2b' : '#fff';
      o.fillRect(0, 0, out.width, out.height);
      o.drawImage(canvas, 0, 0);
      const a = h('a', { href: out.toDataURL('image/png'), download: 'whiteboard.png' });
      a.click();
    }
  },
};
