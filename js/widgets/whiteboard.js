import { h, uid, toast, downloadBlob } from '../util.js';
import { db, assetURL } from '../storage.js';
import { panel, select, field, checkbox } from './_common.js';
import { recFormat } from './webcam.js';
import { encodeMP4, canEncodeOffline, decodeAudio } from '../videoencode.js';

// Strokes are stored as vectors in 0..1 coordinates, so the drawing stays sharp at any widget size.
// Every finger or pen draws its own line, so several children can draw on one board at once.
// Sessions can be recorded (with optional voice) and played back, or saved as a video.
const PENS = ['#1d1d1f', '#e63946', '#1982c4', '#2a9d8f', '#f4a261', '#7b2cbf', '#ffffff'];
const HIGHLIGHTERS = [['#ffe14d', 'Yellow'], ['#7ef06a', 'Green'], ['#ff86cf', 'Pink']];
const SIZES = [0.004, 0.01, 0.025];
const HL_SIZES = [0.016, 0.028, 0.045];   // highlighters are wider than pens
const MAX_REC_MS = 15 * 60 * 1000;
const BG_FILL = { black: '#1f3d2b', clear: '#ffffff' };
/** Line styles: [id, label]. */
const LINE_STYLES = [['line', 'Line'], ['arrow', 'Arrow'], ['double', 'Double arrow'], ['dash', 'Dashed line'], ['dot', 'Dotted line'], ['numline', 'Number line 0–10'], ['ticks', 'Number line, no numbers']];
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const isLine = (st) => st.t === 'line';

/** Draw one freehand stroke (or the part of it drawn so far): pen, highlighter or eraser. */
function strokePath(g, st, W, H, upto = st.p.length) {
  const m = Math.min(W, H);
  const p = st.p;
  const n = Math.min(upto, p.length);
  if (n < 2) return;
  // Highlighter: see-through, and "multiply" so black writing under it stays black.
  g.globalCompositeOperation = st.e ? 'destination-out' : st.h ? 'multiply' : 'source-over';
  g.globalAlpha = st.h ? 0.5 : 1;
  g.strokeStyle = st.c;
  g.fillStyle = st.c;
  g.lineWidth = st.s * m * (st.e ? 3 : 1);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (n === 2) {
    g.beginPath();
    g.arc(p[0] * W, p[1] * H, g.lineWidth / 2, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    return;
  }
  g.beginPath();
  g.moveTo(p[0] * W, p[1] * H);
  for (let i = 2; i < n - 2; i += 2) {
    const mx = ((p[i] + p[i + 2]) / 2) * W;
    const my = ((p[i + 1] + p[i + 3]) / 2) * H;
    g.quadraticCurveTo(p[i] * W, p[i + 1] * H, mx, my);
  }
  g.lineTo(p[n - 2] * W, p[n - 1] * H);
  g.stroke();
  g.globalAlpha = 1;
}

/** A straight line object: plain, arrows, dashed, dotted or a number line. */
function drawLine(g, st, W, H) {
  const m = Math.min(W, H);
  const [x1, y1, x2, y2] = [st.p[0] * W, st.p[1] * H, st.p[2] * W, st.p[3] * H];
  const len = Math.hypot(x2 - x1, y2 - y1);
  const lw = Math.max(1, st.s * m);
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = g.fillStyle = st.c;
  g.lineWidth = lw;
  g.lineCap = 'round';
  if (len < 0.5) { g.beginPath(); g.arc(x1, y1, lw / 2, 0, Math.PI * 2); g.fill(); g.restore(); return; }
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const ls = st.ls || 'line';
  const head = Math.min(len * 0.4, Math.max(lw * 4.5, m * 0.022));
  const startHead = ls === 'double' || ls === 'numline' || ls === 'ticks';
  const endHead = startHead || ls === 'arrow';
  // stop the shaft short of the arrow tips so the round end doesn't poke through
  const a0 = startHead ? head * 0.7 : 0, a1 = endHead ? head * 0.7 : 0;
  if (ls === 'dash') g.setLineDash([lw * 3.2, lw * 2.4]);
  if (ls === 'dot') g.setLineDash([0.001, lw * 2.2]);
  g.beginPath();
  g.moveTo(x1 + ux * a0, y1 + uy * a0);
  g.lineTo(x2 - ux * a1, y2 - uy * a1);
  g.stroke();
  g.setLineDash([]);
  const tip = (tx, ty, dx, dy) => {
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(tx - dx * head - dy * head * 0.45, ty - dy * head + dx * head * 0.45);
    g.lineTo(tx - dx * head + dy * head * 0.45, ty - dy * head - dx * head * 0.45);
    g.closePath();
    g.fill();
  };
  if (endHead) tip(x2, y2, ux, uy);
  if (startHead) tip(x1, y1, -ux, -uy);
  if (ls === 'numline' || ls === 'ticks') {
    // 11 evenly spaced marks between the arrow heads, numbered 0–10 underneath
    let nx = -uy, ny = ux;                 // the side the numbers go on: below (or right of a vertical line)
    if (ny < 0 || (Math.abs(ny) < 0.01 && nx < 0)) { nx = -nx; ny = -ny; }
    const tk = Math.max(lw * 2.2, m * 0.016);
    const font = Math.max(10, Math.min(len / 16, m * 0.045));
    g.lineWidth = Math.max(1, lw * 0.8);
    g.font = `700 ${font}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 10; i++) {
      const f = 0.07 + 0.86 * (i / 10);
      const px = x1 + (x2 - x1) * f, py = y1 + (y2 - y1) * f;
      g.beginPath(); g.moveTo(px - nx * tk, py - ny * tk); g.lineTo(px + nx * tk, py + ny * tk); g.stroke();
      if (ls === 'numline') g.fillText(String(i), px + nx * (tk + font * 0.75), py + ny * (tk + font * 0.75));
    }
  }
  g.restore();
}

function drawAll(g, list, W, H) {
  g.clearRect(0, 0, W, H);
  for (const it of list) strokePath(g, it.st || it, W, H, it.upto);
  g.globalCompositeOperation = 'source-over';
}

/**
 * Finished lines are kept on a cached layer, so each frame only draws the lines still in progress
 * (redrawing hundreds of strokes 30–60 times a second is what makes big boards slow).
 */
class Ink {
  constructor() {
    this.done = document.createElement('canvas');
    this.dg = this.done.getContext('2d');
    this.keys = [];
  }
  /** items: [{ st, upto?, live? }] → draws onto g (W×H). */
  render(g, items, W, H) {
    if (this.done.width !== W || this.done.height !== H) { this.done.width = W; this.done.height = H; this.keys = []; this.dg.clearRect(0, 0, W, H); }
    let n = 0;
    while (n < items.length && !items[n].live && (items[n].upto == null || items[n].upto >= items[n].st.p.length)) n++;
    let same = this.keys.length <= n;
    for (let i = 0; same && i < this.keys.length; i++) same = this.keys[i] === items[i].st;
    if (!same) { this.dg.clearRect(0, 0, W, H); this.keys = []; }
    for (let i = this.keys.length; i < n; i++) { strokePath(this.dg, items[i].st, W, H); this.keys.push(items[i].st); }
    this.dg.globalCompositeOperation = 'source-over';
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.drawImage(this.done, 0, 0);
    for (let i = n; i < items.length; i++) strokePath(g, items[i].st, W, H, items[i].upto);
    g.globalCompositeOperation = 'source-over';
  }
}

/** Freehand ink (pens, highlighters, eraser) underneath, straight lines on top (the eraser removes whole lines). */
function renderBoard(g, items, W, H, ink) {
  ink.render(g, items.filter((it) => !isLine(it.st)), W, H);
  for (const it of items) if (isLine(it.st)) drawLine(g, it.st, W, H);
}

const PAPERS = [['blank', '▭', 'Blank'], ['lines', '☰', 'Lines'], ['grid', '▦', 'Grid']];
const PAPER_LINES = { white: { grid: '#c9d6ea', lines: '#a8c4e8', dots: '#9aa7ba' }, black: { grid: '#ffffff38', lines: '#ffffff40', dots: '#ffffff60' }, clear: { grid: '#0004', lines: '#0004', dots: '#0006' } };

/**
 * Board colour plus lines / grid / dots. The same drawing is used on the live board, in playback
 * and in saved pictures and videos, so they always match. `gap` is a fraction of the short side.
 */
function paintPaper(g, bg, paper, gap, W, H, fill = true) {
  if (fill) {
    g.fillStyle = BG_FILL[bg] || '#ffffff';
    g.fillRect(0, 0, W, H);
  } else g.clearRect(0, 0, W, H);
  if (!paper || paper === 'blank') return;
  const step = Math.max(6, (gap || 0.055) * Math.min(W, H));
  const col = (PAPER_LINES[bg] || PAPER_LINES.white)[paper] || '#c9d6ea';
  const lw = Math.max(1, Math.round(Math.min(W, H) / 700));
  if (paper === 'dots') {
    g.fillStyle = col;
    const r = Math.max(1.2, lw * 1.3);
    for (let y = step; y < H; y += step) for (let x = step; x < W; x += step) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    return;
  }
  g.strokeStyle = col;
  g.lineWidth = lw;
  const o = lw % 2 ? 0.5 : 0;
  g.beginPath();
  for (let y = step; y < H; y += step) { const yy = Math.round(y) + o; g.moveTo(0, yy); g.lineTo(W, yy); }
  if (paper === 'grid') for (let x = step; x < W; x += step) { const xx = Math.round(x) + o; g.moveTo(xx, 0); g.lineTo(xx, H); }
  g.stroke();
}

/**
 * The board as it looked at time T of a recording.
 * Ops: s = stroke or line (with per-point times), L = the board's list of strokes (by id) after an
 * undo/redo/clear/erase, m = a line moved (new points). Older recordings also have u = undo, r = redo, x = clear.
 */
function frameAt(rec, ops, T) {
  const byId = new Map();
  const view = (id) => byId.get(id);
  let list = rec.base.map((st) => { if (st.i) byId.set(st.i, st); return { st }; });
  const redo = [];
  for (const op of ops) {
    if (op.t > T) break;
    if (op.k === 's') {
      const ts = op.ts;
      let k = ts.length;
      while (k > 0 && op.t + ts[k - 1] > T) k--;
      if (op.st.i) byId.set(op.st.i, op.st);
      list.push(isLine(op.st) ? { st: op.st } : { st: op.st, upto: Math.max(2, k * 2) });
    } else if (op.k === 'L') {
      const inProgress = new Map(list.filter((it) => it.upto != null && it.upto < it.st.p.length).map((it) => [it.st.i, it]));
      list = op.ids.map((id) => inProgress.get(id) || (view(id) ? { st: view(id) } : null)).filter(Boolean);
    } else if (op.k === 'm') {
      const base = view(op.id);
      if (!base) continue;
      op.v ||= { ...base, p: op.p };   // made once per op, so the drawing cache can reuse it
      byId.set(op.id, op.v);
      list = list.map((it) => (it.st.i === op.id ? { st: op.v } : it));
    } else if (op.k === 'u') { const x = list.pop(); if (x) redo.push(x); }
    else if (op.k === 'r') { const x = redo.pop(); if (x) list.push(x); }
    else if (op.k === 'x') { list = []; redo.length = 0; }
  }
  return list;
}

/** Optionally squeeze long gaps (thinking time) so playback keeps moving. */
function timeline(rec, skipPauses) {
  if (!skipPauses) return { ops: rec.ops, dur: rec.dur };
  const times = [];
  for (const op of rec.ops) {
    times.push(op.t);
    if (op.k === 's') for (const d of op.ts) times.push(op.t + d);
  }
  times.sort((a, b) => a - b);
  const cuts = []; // [atTime, removedSoFar]
  let removed = 0;
  let prev = 0;
  for (const t of times) {
    if (t - prev > 1500) { removed += t - prev - 600; cuts.push([t, removed]); }
    prev = Math.max(prev, t);
  }
  const map = (t) => {
    let r = 0;
    for (const [at, rm] of cuts) { if (at <= t) r = rm; else break; }
    return t - r;
  };
  const ops = rec.ops.map((op) => (op.k === 's'
    ? { ...op, t: map(op.t), ts: op.ts.map((d) => map(op.t + d) - map(op.t)) }
    : { ...op, t: map(op.t) }));
  return { ops, dur: map(rec.dur) };
}

function lineSvg(ls) {
  const dash = ls === 'dash' ? ' stroke-dasharray="4 3"' : ls === 'dot' ? ' stroke-dasharray="0.1 3.6" stroke-linecap="round" stroke-width="2.6"' : '';
  const L = ['double', 'numline', 'ticks'].includes(ls);
  const R = L || ls === 'arrow';
  let x = `<line x1="${L ? 7 : 3}" y1="8" x2="${R ? 21 : 25}" y2="8" stroke="currentColor" stroke-width="2"${dash}/>`;
  if (R) x += '<path d="M26 8l-6-4v8z" fill="currentColor"/>';
  if (L) x += '<path d="M2 8l6-4v8z" fill="currentColor"/>';
  if (ls === 'numline' || ls === 'ticks') for (let i = 0; i < 5; i++) x += `<line x1="${8 + i * 3}" y1="4.5" x2="${8 + i * 3}" y2="11.5" stroke="currentColor" stroke-width="1.3"/>`;
  return `<svg viewBox="0 0 28 16" width="28" height="16" aria-hidden="true">${x}</svg>`;
}

const fmt = (ms) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export default {
  type: 'whiteboard',
  title: 'Whiteboard',
  icon: '✏️',
  group: 'extras',
  size: [780, 540],
  hasSettings: true,
  heavyKeys: ['strokes', 'rec'],
  undoShareKeys: ['rec'],   // recordings are replaced, never changed in place
  defaultState: () => ({ strokes: [], bg: 'white', paper: 'blank', gap: 0.06, straighten: false, rec: null, recAudioAssetId: null, recVoice: false, skipPauses: true, loop: false }),

  mount(ctx) {
    const s = ctx.state;
    // Older boards kept the paper in `bg` (grid/lines/dots on white).
    if (['grid', 'lines', 'dots'].includes(s.bg)) { s.paper = s.bg; s.bg = 'white'; }
    s.paper ||= 'blank';
    s.gap ||= 0.06;
    const paperCanvas = h('canvas', { class: 'wb-paper', 'aria-hidden': 'true' });
    const pg = paperCanvas.getContext('2d');
    let paperKey = '';
    const canvas = h('canvas', { class: 'wb-canvas' });
    const g = canvas.getContext('2d');
    const overlay = h('canvas', { class: 'wb-over', 'aria-hidden': 'true' });   // move handles and snap rings
    const og = overlay.getContext('2d');
    let color = PENS[0];
    let size = SIZES[1];
    let tool = 'pen';            // pen · hl (highlighter) · line · move · eraser
    let hlColor = HIGHLIGHTERS[0][0];
    let lineStyle = 'line';
    const snapHints = new Map(); // pointerId → [x, y] of the line end it's snapping to (one per finger)
    for (const st of s.strokes) st.i ||= newId();
    // Undo history for this session: add (plus any lines the eraser removed), clear, edit (lines moved), swap (straightened).
    const hist = [];
    const fut = [];

    // ---------- recording state ----------
    let rec = null; // { t0, base, ops, timer, media, chunks, mic }
    // ---------- playback state ----------
    let pb = null; // { ops, dur, T, playing, speed, last, raf, audio }

    const toolBtn = (label, title, on, cls = '') => h('button', { class: `wb-tool ${cls}`, title, 'aria-label': title, onclick: on }, label);
    const penBtns = PENS.map((c) => {
      const b = h('button', { class: 'wb-color', style: { background: c }, 'aria-label': `Pen colour ${c}`, onclick: () => { color = c; if (tool !== 'line') tool = 'pen'; sync(); } });
      b.dataset.c = c;
      return b;
    });
    const hlBtns = HIGHLIGHTERS.map(([c, name]) => {
      const b = h('button', { class: 'wb-hl', style: { '--hl': c }, title: `${name} highlighter`, 'aria-label': `${name} highlighter`, onclick: () => { hlColor = c; tool = 'hl'; sync(); } });
      b.dataset.c = c;
      return b;
    });
    const sizeBtns = SIZES.map((sz, i) => {
      const b = h('button', { class: 'wb-size', 'aria-label': ['Thin', 'Medium', 'Thick'][i], onclick: () => { size = sz; sync(); } }, h('span', { style: { width: `${6 + i * 7}px`, height: `${6 + i * 7}px` } }));
      b.dataset.sz = sz;
      return b;
    });
    const linePop = h('div', { class: 'wb-pop', hidden: true, role: 'menu', 'aria-label': 'Line styles' },
      ...LINE_STYLES.map(([id, label]) => {
        const b = h('button', { class: 'wb-popbtn', role: 'menuitemradio', title: label, onclick: () => { lineStyle = id; tool = 'line'; linePop.hidden = true; sync(); } });
        b.innerHTML = `${lineSvg(id)}<span>${label}</span>`;
        b.dataset.ls = id;
        return b;
      }));
    const lineBtn = h('button', { class: 'wb-tool wb-linebtn', title: 'Straight lines and arrows (tap again for styles)', 'aria-label': 'Line tool', 'aria-haspopup': 'menu',
      onclick: () => { if (tool !== 'line') { tool = 'line'; linePop.hidden = false; } else linePop.hidden = !linePop.hidden; sync(); placePop(); } });
    /** Put the line-style menu just left of the line button, kept inside the whiteboard. */
    function placePop() {
      if (linePop.hidden) return;
      const r = root.getBoundingClientRect(), b = lineBtn.getBoundingClientRect(), sd = side.getBoundingClientRect();
      linePop.style.right = `${Math.round(r.right - sd.left + 6)}px`;
      linePop.style.top = `${Math.round(Math.max(4, Math.min(b.top - r.top - 8, r.height - linePop.offsetHeight - 4)))}px`;
    }
    const penTool = toolBtn('✏️', 'Pen: draw freehand', () => { tool = 'pen'; sync(); }, 'wb-pentool');
    const moveBtn = toolBtn('✥', 'Move lines: drag an end, a corner or the middle of a line', () => { tool = tool === 'move' ? 'pen' : 'move'; sync(); });
    const straightBtn = h('button', { class: 'wb-tool wb-straight', 'aria-pressed': 'false',
      onclick: () => { s.straighten = !s.straighten; ctx.save(); sync(); toast(s.straighten ? 'Straighten is on: nearly straight lines you draw become straight.' : 'Straighten is off.'); } }, '📐');
    const eraser = toolBtn('🧽', 'Eraser (rubs out pen and highlighter; touching a line removes the whole line)', () => { tool = tool === 'eraser' ? 'pen' : 'eraser'; sync(); });
    // Background: each tap goes Blank → Lines → Grid; a slider sets the spacing.
    const paperBtn = h('button', { class: 'wb-tool wb-paperbtn', onclick: () => {
      const i = PAPERS.findIndex(([k]) => k === s.paper);
      s.paper = PAPERS[(i + 1) % PAPERS.length][0];
      ctx.save(); sync(); drawPaper(true);
    } });
    const gapRange = h('input', { type: 'range', class: 'wb-gap', min: 2.5, max: 15, step: 0.5, 'aria-label': 'Line spacing', title: 'Spacing' });
    gapRange.addEventListener('input', () => { s.gap = Number(gapRange.value) / 100; drawPaper(true); ctx.save(); });
    const recBtn = h('button', { class: 'wb-tool wb-rec', title: 'Record this whiteboard session', 'aria-label': 'Record', onclick: () => (rec ? stopRec() : startRec()) }, h('span', { class: 'wb-rec-dot' }), h('span', { class: 'wb-rec-t' }));
    const playBtn = toolBtn('▶', 'Play back the recording (🔁 Loop is in the player)', () => openPlayer(), 'wb-play');
    const sep = () => h('span', { class: 'wb-sep' });
    // Tools down the right-hand side; colour, size, undo and the board itself along the bottom.
    const side = h('div', { class: 'wb-side', role: 'toolbar', 'aria-label': 'Drawing tools', 'aria-orientation': 'vertical' },
      penTool,
      lineBtn,
      ...hlBtns,
      sep(),
      straightBtn,
      moveBtn,
      eraser,
    );
    const bar = h('div', { class: 'wb-bar wb-bottom', role: 'toolbar', 'aria-label': 'Colour, size and board' },
      ...penBtns,
      sep(),
      ...sizeBtns,
      sep(),
      toolBtn('↶', 'Undo', undo),
      toolBtn('↷', 'Redo', redoStep),
      toolBtn('🗑', 'Clear the board (↶ Undo brings it back)', clearAll),
      sep(),
      paperBtn,
      gapRange,
      sep(),
      recBtn,
      playBtn,
    );
    const badge = h('div', { class: 'wb-recbadge', hidden: true });
    const sizeCur = h('div', { class: 'wb-sizecur', hidden: true, 'aria-hidden': 'true' });

    // Player controls (shown instead of the pens while playing back).
    const pPlay = h('button', { class: 'wb-tool', 'aria-label': 'Play or pause' });
    const pScrub = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'wb-scrub', 'aria-label': 'Position' });
    const pTime = h('span', { class: 'wb-ptime' });
    const pSpeed = h('button', { class: 'wb-tool wb-speed', title: 'Speed' });
    const pLoop = h('button', { class: 'wb-tool wb-loop', title: 'Loop: play again and again', 'aria-label': 'Loop', onclick: () => { s.loop = !s.loop; ctx.save(); drawPlayer(); } }, '🔁', h('span', {}, ' Loop'));
    const player = h('div', { class: 'wb-bar wb-player', hidden: true },
      pPlay,
      toolBtn('⏮', 'Back to the start', () => seek(0)),
      pScrub,
      pTime,
      pSpeed,
      pLoop,
      toolBtn('🎞️', 'Save as a video', () => exportVideo()),
      toolBtn('✕', 'Close the player', () => closePlayer()),
    );
    pPlay.addEventListener('click', () => (pb?.playing ? pausePb() : playPb()));
    pSpeed.addEventListener('click', () => { if (!pb) return; pb.speed = pb.speed === 1 ? 2 : pb.speed === 2 ? 4 : pb.speed === 4 ? 0.5 : 1; if (pb.audio) pb.audio.playbackRate = pb.speed; drawPlayer(); });
    pScrub.addEventListener('input', () => pb && seek((pScrub.value / 1000) * pb.dur));

    const surface = h('div', { class: 'wb-surface' }, paperCanvas, canvas, overlay, sizeCur, badge);
    const root = h('div', { class: 'wb' }, surface, side, bar, player, linePop);
    ctx.view.append(root);
    // Close the line-style menu when tapping elsewhere on THIS whiteboard (other children using
    // other whiteboards at the same time mustn't close it).
    const closePop = (e) => { if (!linePop.hidden && !linePop.contains(e.target) && !lineBtn.contains(e.target)) { linePop.hidden = true; } };
    root.addEventListener('pointerdown', closePop, true);

    function sync() {
      penBtns.forEach((b) => b.classList.toggle('on', (tool === 'pen' || tool === 'line') && b.dataset.c === color));
      hlBtns.forEach((b) => b.classList.toggle('on', tool === 'hl' && b.dataset.c === hlColor));
      sizeBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.sz) === size));
      lineBtn.classList.toggle('on', tool === 'line');
      penTool.classList.toggle('on', tool === 'pen');
      lineBtn.innerHTML = `${lineSvg(lineStyle)}<i aria-hidden="true">▾</i>`;
      [...linePop.children].forEach((b) => { b.classList.toggle('on', b.dataset.ls === lineStyle); b.setAttribute('aria-checked', String(b.dataset.ls === lineStyle)); });
      if (tool !== 'line') linePop.hidden = true;
      moveBtn.classList.toggle('on', tool === 'move');
      straightBtn.classList.toggle('on', !!s.straighten);
      straightBtn.setAttribute('aria-pressed', String(!!s.straighten));
      straightBtn.title = s.straighten ? 'Straighten: ON — nearly straight pen lines become straight (tap to turn off)' : 'Straighten: off — tap so nearly straight pen lines become straight';
      straightBtn.setAttribute('aria-label', straightBtn.title);
      eraser.classList.toggle('on', tool === 'eraser');
      surface.dataset.bg = s.bg;
      surface.dataset.tool = tool;
      surface.classList.toggle('erasing', tool === 'eraser');
      const [, icon, name] = PAPERS.find(([k]) => k === s.paper) || [s.paper, '⁘', 'Dots'];
      paperBtn.textContent = icon;
      paperBtn.title = `Background: ${name} — tap to change`;
      paperBtn.setAttribute('aria-label', `Background: ${name}. Tap to change.`);
      gapRange.hidden = s.paper === 'blank';
      gapRange.value = String(s.gap * 100);
      playBtn.hidden = !s.rec || !!rec;
      draw();
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
      if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
    }
    let queued = false;
    function draw() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; drawNow(); });
    }
    const ink = new Ink();
    /** Lines/grid behind the ink, redrawn only when the size, colour, kind or spacing changes. */
    function drawPaper(force = false) {
      const W = canvas.width;
      const H = canvas.height;
      if (paperCanvas.width !== W || paperCanvas.height !== H) { paperCanvas.width = W; paperCanvas.height = H; force = true; }
      const key = `${W}x${H}|${s.bg}|${s.paper}|${s.gap}`;
      if (!force && key === paperKey) return;
      paperKey = key;
      paintPaper(pg, s.bg, s.paper, s.gap, W, H, false);
    }
    function drawNow() {
      fit();
      drawPaper();
      if (pb) renderBoard(g, frameAt(s.rec, pb.ops, pb.T), canvas.width, canvas.height, ink);
      else {
        const live = new Set([...active.values()].map((a) => a.st));
        renderBoard(g, s.strokes.map((st) => ({ st, live: live.has(st) })), canvas.width, canvas.height, ink);
      }
      drawOverlay();
    }
    const dpr = () => window.devicePixelRatio || 1;
    /** Handles on every line end (move tool) and a ring where a line end is snapping. */
    function drawOverlay() {
      const W = overlay.width, H = overlay.height;
      og.clearRect(0, 0, W, H);
      if (pb) return;
      const d = dpr();
      if (tool === 'move') {
        const seen = new Set();
        for (const st of s.strokes) {
          if (!isLine(st)) continue;
          for (const k of [0, 2]) {
            const x = st.p[k] * W, y = st.p[k + 1] * H, key = `${Math.round(x)},${Math.round(y)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            og.beginPath(); og.arc(x, y, 7 * d, 0, Math.PI * 2);
            og.fillStyle = '#fff'; og.fill();
            og.lineWidth = 2.5 * d; og.strokeStyle = '#3b6fd8'; og.stroke();
          }
        }
      }
      for (const q of snapHints.values()) {
        if (!q) continue;
        og.beginPath(); og.arc(q[0] * W, q[1] * H, 13 * d, 0, Math.PI * 2);
        og.lineWidth = 3 * d; og.strokeStyle = 'rgba(59,111,216,.85)'; og.stroke();
      }
    }

    // ---------- editing and undo (logged while recording) ----------
    const logOp = (op) => rec && rec.ops.push({ t: Date.now() - rec.t0, ...op });
    const logList = () => logOp({ k: 'L', ids: s.strokes.map((st) => st.i) });
    const logMove = (st) => logOp({ k: 'm', id: st.i, p: [...st.p] });
    function pushHist(e) { hist.push(e); fut.length = 0; }
    function apply(e, back) {
      if (e.k === 'add') {
        if (back) {
          s.strokes = s.strokes.filter((x) => x !== e.st);
          for (const d of [...e.dels].sort((a, b) => a.i - b.i)) s.strokes.splice(Math.min(d.i, s.strokes.length), 0, d.st);
        } else {
          const gone = new Set(e.dels.map((d) => d.st));
          s.strokes = s.strokes.filter((x) => !gone.has(x));
          s.strokes.push(e.st);
        }
        logList();
      } else if (e.k === 'clear') {
        s.strokes = back ? e.prev.slice() : [];
        logList();
      } else if (e.k === 'swap') {
        const [a, b] = back ? [e.to, e.from] : [e.from, e.to];
        const i = s.strokes.indexOf(a);
        if (i >= 0) s.strokes[i] = b;
        logList();
      } else if (e.k === 'edit') {
        for (const it of e.items) { it.st.p = [...(back ? it.before : it.after)]; logMove(it.st); }
      }
    }
    function undo() {
      const e = hist.pop();
      if (e) { apply(e, true); fut.push(e); }
      else if (s.strokes.length) { const st = s.strokes.pop(); fut.push({ k: 'add', st, dels: [] }); logList(); }   // drawn before this session
      else return;
      draw(); ctx.save();
    }
    function redoStep() {
      const e = fut.pop();
      if (!e) return;
      apply(e, false); hist.push(e);
      draw(); ctx.save();
    }
    function clearAll() {
      if (!s.strokes.length) return;
      pushHist({ k: 'clear', prev: s.strokes.slice() });
      s.strokes = [];
      logList(); draw(); ctx.save();
      toast('Board cleared. Press ↶ Undo to bring it back.');
    }

    // ---------- geometry helpers (canvas pixels) ----------
    const SNAP = 18;   // CSS px
    /** The nearest line end within snapping distance of (x, y), or null. skip(st, k) leaves ends out. */
    function nearestEnd(x, y, skip) {
      const W = canvas.width, H = canvas.height;
      let best = null, bd = (SNAP * dpr()) ** 2;
      for (const st of s.strokes) {
        if (!isLine(st)) continue;
        for (const k of [0, 2]) {
          if (skip?.(st, k)) continue;
          const dx = (st.p[k] - x) * W, dy = (st.p[k + 1] - y) * H, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = [st.p[k], st.p[k + 1]]; }
        }
      }
      return best;
    }
    /** Lines within 5° of flat, upright or 45° snap to it. */
    function angleSnap(x0, y0, x, y) {
      const W = canvas.width, H = canvas.height;
      const dx = (x - x0) * W, dy = (y - y0) * H, len = Math.hypot(dx, dy);
      if (len < 1) return [x, y];
      const a = Math.atan2(dy, dx), step = Math.PI / 4, sa = Math.round(a / step) * step;
      if (Math.abs(a - sa) > (5 * Math.PI) / 180) return [x, y];
      return [x0 + (Math.cos(sa) * len) / W, y0 + (Math.sin(sa) * len) / H];
    }
    function distToLine(st, x, y) {
      const W = canvas.width, H = canvas.height;
      const ax = st.p[0] * W, ay = st.p[1] * H, bx = st.p[2] * W, by = st.p[3] * H, px = x * W, py = y * H;
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
      const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
      return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
    }
    const lineWidthPx = (st) => st.s * Math.min(canvas.width, canvas.height);

    /** The eraser removes any whole line it touches. */
    function eraseLinesAt(a, x, y) {
      const r = lineWidthPx(a.st) * 1.5;
      let changed = false;
      for (let i = s.strokes.length - 1; i >= 0; i--) {
        const st = s.strokes[i];
        if (!isLine(st) || distToLine(st, x, y) > r + lineWidthPx(st) / 2) continue;
        s.strokes.splice(i, 1);
        a.entry.dels.push({ st, i });
        changed = true;
      }
      if (changed) logList();
    }

    /** Move tool: what's under the pointer — line ends (with any other ends at the same spot), or a line's middle. */
    function grabAt(x, y) {
      const W = canvas.width, H = canvas.height, R = 16 * dpr();
      for (let j = s.strokes.length - 1; j >= 0; j--) {
        const st = s.strokes[j];
        if (!isLine(st)) continue;
        for (const k of [0, 2]) {
          if (Math.hypot((st.p[k] - x) * W, (st.p[k + 1] - y) * H) > R) continue;
          const ex = st.p[k], ey = st.p[k + 1], ends = [];
          // every line end at this spot moves together, so joined corners stay joined
          for (const o of s.strokes) if (isLine(o)) for (const kk of [0, 2]) if (Math.hypot((o.p[kk] - ex) * W, (o.p[kk + 1] - ey) * H) < 1.5 * dpr()) ends.push({ st: o, k: kk });
          return { mode: 'end', ends };
        }
      }
      for (let j = s.strokes.length - 1; j >= 0; j--) {
        const st = s.strokes[j];
        if (isLine(st) && distToLine(st, x, y) <= Math.max(R * 0.8, lineWidthPx(st) / 2 + 6 * dpr())) return { mode: 'body', st, from: [x, y], orig: [...st.p] };
      }
      return null;
    }
    function moveDrag(a, x, y) {
      if (a.mode === 'end') {
        const moving = (st, k) => a.ends.some((e) => e.st === st && e.k === k);
        let q = nearestEnd(x, y, moving);
        snapHints.set(a.pid, q);
        if (!q) {
          q = [x, y];
          if (a.ends.length === 1) { const { st, k } = a.ends[0]; const o = k === 0 ? 2 : 0; q = angleSnap(st.p[o], st.p[o + 1], x, y); }
        }
        for (const { st, k } of a.ends) { st.p[k] = q[0]; st.p[k + 1] = q[1]; }
      } else {
        let dx = x - a.from[0], dy = y - a.from[1];
        snapHints.delete(a.pid);
        // if either end lands near another line's end, join them
        let best = null;
        for (const k of [0, 2]) {
          const ex = a.orig[k] + dx, ey = a.orig[k + 1] + dy;
          const q = nearestEnd(ex, ey, (st) => st === a.st);
          if (q) { const d = Math.hypot(q[0] - ex, q[1] - ey); if (!best || d < best.d) best = { d, q, ex, ey }; }
        }
        if (best) { dx += best.q[0] - best.ex; dy += best.q[1] - best.ey; snapHints.set(a.pid, best.q); }
        a.st.p = [a.orig[0] + dx, a.orig[1] + dy, a.orig[2] + dx, a.orig[3] + dy];
      }
      draw();
    }

    /**
     * Straighten: a pen line that was meant to be straight becomes a real straight line.
     * Forgiving on purpose (a wobbly hand, a little hook when the pen lands or lifts), but a clear
     * curve or a wave stays as drawn. ↶ Undo brings back the original.
     */
    function tryStraighten(st) {
      const p = st.p, W = canvas.width, H = canvas.height, n = p.length / 2;
      if (n < 3) return;
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) { xs.push(p[i * 2] * W); ys.push(p[i * 2 + 1] * H); }
      // along-the-stroke distance, so the ends can be trimmed by length rather than by point count
      const along = [0];
      for (let i = 1; i < n; i++) along.push(along[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
      const total = along[n - 1];
      if (total < 30 * dpr()) return;
      const trim = Math.min(total * 0.08, 25 * dpr());
      const core = [];
      for (let i = 0; i < n; i++) if (along[i] >= trim && along[i] <= total - trim) core.push(i);
      if (core.length < 2) return;
      // best-fit line through the middle of the stroke (principal direction)
      let mx = 0, my = 0;
      for (const i of core) { mx += xs[i]; my += ys[i]; }
      mx /= core.length; my /= core.length;
      let sxx = 0, syy = 0, sxy = 0;
      for (const i of core) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      const ux = Math.cos(ang), uy = Math.sin(ang);
      let tMin = Infinity, tMax = -Infinity, maxd = 0, sq = 0;
      for (let i = 0; i < n; i++) { const t = (xs[i] - mx) * ux + (ys[i] - my) * uy; tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
      const L = tMax - tMin;
      // How far it bends: measured from the straight line between the two ends (hooks trimmed off),
      // which shows a curve clearly; a wobbly hand only adds small bumps either side.
      const ia = core[0], ib = core[core.length - 1];
      const cx = xs[ib] - xs[ia], cy = ys[ib] - ys[ia], cl = Math.hypot(cx, cy) || 1;
      for (const i of core) { const d = Math.abs(cx * (ys[i] - ys[ia]) - cy * (xs[i] - xs[ia])) / cl; maxd = Math.max(maxd, d); sq += d * d; }
      const rms = Math.sqrt(sq / core.length);
      // it must head one way (not double back), and stay close to straight
      if (L < 30 * dpr() || total > L * 1.35) return;
      if (maxd > Math.max(14 * dpr(), L * 0.09) || rms > Math.max(6 * dpr(), L * 0.045)) return;
      // the ends: the first and last points, moved onto the fitted line
      const onLine = (i) => { const t = (xs[i] - mx) * ux + (ys[i] - my) * uy; return [(mx + ux * t) / W, (my + uy * t) / H]; };
      const e0 = onLine(0), e1 = onLine(n - 1);
      let a0 = nearestEnd(e0[0], e0[1]) || nearestEnd(p[0], p[1]) || e0;
      const a1 = nearestEnd(e1[0], e1[1]) || nearestEnd(p[p.length - 2], p[p.length - 1]) || angleSnap(a0[0], a0[1], e1[0], e1[1]);
      if (a0[0] === a1[0] && a0[1] === a1[1]) a0 = e0;
      const line = { i: newId(), t: 'line', c: st.c, s: st.s, ls: 'line', p: [a0[0], a0[1], a1[0], a1[1]] };
      const i = s.strokes.indexOf(st);
      if (i < 0) return;
      s.strokes[i] = line;
      pushHist({ k: 'swap', from: st, to: line });
      logOp({ k: 's', st: { ...line, p: [...line.p] }, ts: [0] });
      logList();
    }

    // ---------- pointer input: every finger or pen does its own thing ----------
    const active = new Map(); // pointerId -> { kind: 'ink' | 'line' | 'move', st, ... }
    const pt = (e) => {
      const r = canvas.getBoundingClientRect();
      return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)];
    };
    /** The circle under a mouse or stylus that shows how big the pen, highlighter or eraser is. */
    function showSize(e) {
      if (pb || tool === 'move' || (e.pointerType !== 'mouse' && e.pointerType !== 'pen')) { hideSize(); return; }
      const r = surface.getBoundingClientRect();
      const m = Math.min(canvas.clientWidth, canvas.clientHeight);
      const erasing = tool === 'eraser' || e.buttons === 32;
      const w = erasing ? size * 3 * m : tool === 'hl' ? (HL_SIZES[SIZES.indexOf(size)] ?? HL_SIZES[1]) * m : size * m;
      const d = Math.max(5, w);
      Object.assign(sizeCur.style, { width: `${d}px`, height: `${d}px`, left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px` });
      sizeCur.style.setProperty('--c', erasing ? 'transparent' : tool === 'hl' ? `${hlColor}88` : `${color}33`);
      sizeCur.hidden = false;
      surface.classList.add('sizecur');
    }
    function hideSize() { sizeCur.hidden = true; surface.classList.remove('sizecur'); }
    canvas.addEventListener('pointerleave', hideSize);

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || pb) return;
      e.preventDefault();
      linePop.hidden = true;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const [x, y] = pt(e);
      const erasing = tool === 'eraser' || e.buttons === 32; // stylus eraser end
      if (!erasing && tool === 'move') {
        const grab = grabAt(x, y);
        if (!grab) return;
        const sts = grab.mode === 'end' ? [...new Set(grab.ends.map((en) => en.st))] : [grab.st];
        active.set(e.pointerId, { kind: 'move', pid: e.pointerId, ...grab, before: new Map(sts.map((st) => [st, [...st.p]])) });
        return;
      }
      if (!erasing && tool === 'line') {
        const a0 = nearestEnd(x, y) || [x, y];
        const st = { i: newId(), t: 'line', c: color, s: size, ls: lineStyle, p: [a0[0], a0[1], a0[0], a0[1]] };
        s.strokes.push(st);
        active.set(e.pointerId, { kind: 'line', st });
        snapHints.delete(e.pointerId);
        draw();
        return;
      }
      const hl = !erasing && tool === 'hl';
      const st = { i: newId(), c: hl ? hlColor : color, s: hl ? (HL_SIZES[SIZES.indexOf(size)] ?? HL_SIZES[1]) : size, e: erasing ? 1 : 0, p: [x, y] };
      if (hl) st.h = 1;
      s.strokes.push(st);
      const entry = { k: 'add', st, dels: [] };
      pushHist(entry);
      let op = null;
      if (rec) {
        op = { t: Date.now() - rec.t0, k: 's', st, ts: [0] };
        rec.ops.push(op);
      }
      const a = { kind: 'ink', st, op, entry };
      active.set(e.pointerId, a);
      if (erasing) eraseLinesAt(a, x, y);
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      showSize(e);
      const a = active.get(e.pointerId);
      if (!a) return;
      if (a.kind === 'line') {
        const [x, y] = pt(e);
        const sn = nearestEnd(x, y, (st) => st === a.st);
        snapHints.set(e.pointerId, sn);
        const q = sn || angleSnap(a.st.p[0], a.st.p[1], x, y);
        a.st.p[2] = q[0]; a.st.p[3] = q[1];
        draw();
        return;
      }
      if (a.kind === 'move') { const [x, y] = pt(e); moveDrag(a, x, y); return; }
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) {
        const q = pt(ev);
        a.st.p.push(...q);
        if (a.op) a.op.ts.push(Date.now() - rec.t0 - a.op.t);
        if (a.st.e) eraseLinesAt(a, q[0], q[1]);
      }
      draw();
    });
    const end = (e) => {
      const a = active.get(e.pointerId);
      if (!a) return;
      active.delete(e.pointerId);
      snapHints.delete(e.pointerId);
      if (a.kind === 'line') {
        const W = canvas.width, H = canvas.height, p = a.st.p;
        if (Math.hypot((p[2] - p[0]) * W, (p[3] - p[1]) * H) < 6 * dpr()) s.strokes = s.strokes.filter((x) => x !== a.st);   // just a tap
        else { pushHist({ k: 'add', st: a.st, dels: [] }); logOp({ k: 's', st: { ...a.st, p: [...p] }, ts: [0] }); }
      } else if (a.kind === 'move') {
        const items = [...a.before].map(([st, before]) => ({ st, before, after: [...st.p] })).filter((it) => it.before.some((v, i) => v !== it.after[i]));
        if (items.length) { pushHist({ k: 'edit', items }); items.forEach((it) => logMove(it.st)); }
      } else if (s.straighten && !a.st.e && !a.st.h) tryStraighten(a.st);
      draw();
      ctx.save();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);

    // ---------- recording ----------
    async function startRec() {
      if (pb) closePlayer();
      if (s.rec && !confirm('Record a new session? This replaces the last recording.')) return;
      const r = { t0: 0, base: s.strokes.map((st) => ({ ...st, p: [...st.p] })), ops: [], chunks: [], media: null, mic: null };
      if (s.recVoice) {
        const fmtA = typeof MediaRecorder !== 'undefined' && ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));
        try {
          r.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          r.media = fmtA ? new MediaRecorder(r.mic, { mimeType: fmtA }) : new MediaRecorder(r.mic);
          r.media.ondataavailable = (ev) => ev.data.size && r.chunks.push(ev.data);
        } catch {
          toast('Microphone not available — recording the drawing only.');
          r.mic?.getTracks().forEach((t) => t.stop());
          r.mic = null;
          r.media = null;
        }
      }
      rec = r;
      rec.t0 = Date.now();
      rec.media?.start(1000);
      recBtn.classList.add('on');
      recBtn.title = 'Stop recording';
      recBtn.setAttribute('aria-label', 'Stop recording');
      badge.hidden = false;
      const tick = () => {
        const ms = Date.now() - rec.t0;
        recBtn.lastChild.textContent = fmt(ms);
        badge.textContent = `● REC ${fmt(ms)}${rec.mic ? ' 🎙' : ''}`;
        if (ms >= MAX_REC_MS) stopRec();
      };
      tick();
      rec.timer = setInterval(tick, 250);
      sync();
    }
    async function stopRec() {
      const r = rec;
      if (!r) return;
      rec = null;
      clearInterval(r.timer);
      const dur = Date.now() - r.t0;
      // Strokes inside ops keep their own copy, so later edits don't change the recording.
      const ops = r.ops.map((op) => (op.k === 's' ? { ...op, st: { ...op.st, p: [...op.st.p] } } : op));
      let audioId = null;
      if (r.media) {
        await new Promise((res) => { r.media.onstop = res; r.media.stop(); });
        r.mic.getTracks().forEach((t) => t.stop());
        const blob = new Blob(r.chunks, { type: r.media.mimeType.split(';')[0] || 'audio/webm' });
        if (blob.size) {
          audioId = uid('asset');
          await db.putAsset({ id: audioId, blob, name: `whiteboard-voice.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`, type: blob.type });
        }
      }
      s.rec = { base: r.base, ops, dur };
      s.recAudioAssetId = audioId;
      ctx.save();
      recBtn.classList.remove('on');
      recBtn.title = 'Record this whiteboard session';
      recBtn.setAttribute('aria-label', 'Record');
      recBtn.lastChild.textContent = '';
      badge.hidden = true;
      sync();
      if (!ops.length) { toast('Nothing was drawn while recording.'); return; }
      toast(`Recorded ${fmt(dur)}. Press ▶ to play it back.`);
    }

    // ---------- playback ----------
    async function openPlayer() {
      if (!s.rec) return;
      const useAudio = !!s.recAudioAssetId;
      const { ops, dur } = timeline(s.rec, s.skipPauses && !useAudio);
      pb = { ops, dur, T: 0, playing: false, speed: 1, last: 0, raf: 0, audio: null };
      if (useAudio) {
        const url = await assetURL(s.recAudioAssetId);
        if (url) {
          pb.audio = new Audio(url);
          pb.audio.addEventListener('ended', () => { if (!pb) return; if (s.loop) { pb.T = 0; playPb(true); } else { pb.T = pb.dur; pausePb(); } });
        }
      }
      bar.hidden = true;
      side.hidden = true;
      player.hidden = false;
      surface.classList.add('playing');
      playPb(true);
    }
    function closePlayer() {
      if (!pb) return;
      pausePb();
      pb.audio?.removeAttribute('src');
      pb = null;
      bar.hidden = false;
      side.hidden = false;
      player.hidden = true;
      surface.classList.remove('playing');
      sync();
      draw();
    }
    function playPb(fromStart = false) {
      if (!pb) return;
      if (fromStart || pb.T >= pb.dur) pb.T = 0;
      pb.playing = true;
      pb.last = performance.now();
      if (pb.audio) {
        pb.audio.currentTime = pb.T / 1000;
        pb.audio.playbackRate = pb.speed;
        pb.audio.play().catch(() => {});
      }
      const step = (now) => {
        if (!pb?.playing) return;
        if (pb.audio && !pb.audio.paused) pb.T = pb.audio.currentTime * 1000;
        else pb.T += (now - pb.last) * pb.speed;
        pb.last = now;
        if (pb.T >= pb.dur) {
          if (s.loop && !pb.audio) {
            // Hold the finished drawing for a moment, then start again.
            pb.T = pb.dur;
            if (!pb.holdUntil) pb.holdUntil = now + 1500;
            else if (now >= pb.holdUntil) { pb.holdUntil = 0; pb.T = 0; }
          } else if (!pb.audio) { pb.T = pb.dur; pausePb(); }
        }
        drawPlayer();
        if (pb?.playing) pb.raf = requestAnimationFrame(step);
      };
      pb.raf = requestAnimationFrame(step);
      drawPlayer();
    }
    function pausePb() {
      if (!pb) return;
      pb.playing = false;
      cancelAnimationFrame(pb.raf);
      pb.audio?.pause();
      drawPlayer();
    }
    function seek(T) {
      if (!pb) return;
      pb.T = Math.max(0, Math.min(pb.dur, T));
      if (pb.audio) pb.audio.currentTime = pb.T / 1000;
      drawPlayer();
    }
    function drawPlayer() {
      if (!pb) return;
      pPlay.textContent = pb.playing ? '❚❚' : '▶';
      pScrub.value = String(Math.round((pb.T / (pb.dur || 1)) * 1000));
      pTime.textContent = `${fmt(pb.T)} / ${fmt(pb.dur)}`;
      pSpeed.textContent = pb.speed === 0.5 ? '½×' : `${pb.speed}×`;
      pLoop.classList.toggle('on', !!s.loop);
      pLoop.setAttribute('aria-pressed', String(!!s.loop));
      pLoop.title = s.loop ? 'Loop is on — tap to play just once' : 'Loop is off — tap to play again and again';
      drawNow();
    }

    /**
     * Save the recording as a video. Preferred: draw and encode every frame directly (fast, and
     * works with this tab in the background). Fallback: play it in real time and record the canvas.
     */
    async function exportVideo() {
      const fmtV = recFormat();
      if (!fmtV && !canEncodeOffline()) { toast('This browser can’t make videos. Try Chrome or Edge.'); return; }
      const src = pb || (await openPlayer(), pb);
      if (!src) return;
      pausePb();
      const r = canvas.getBoundingClientRect();
      const k = 1280 / Math.max(r.width, r.height);
      const W = 2 * Math.round((r.width * k) / 2);
      const H = 2 * Math.round((r.height * k) / 2);
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      const o = out.getContext('2d');
      const inkC = document.createElement('canvas');
      inkC.width = W;
      inkC.height = H;
      const ig = inkC.getContext('2d');
      const cache = new Ink();
      const paint = (T) => {
        paintPaper(o, s.bg, s.paper, s.gap, W, H);
        renderBoard(ig, frameAt(s.rec, src.ops, T), W, H, cache);
        o.drawImage(inkC, 0, 0);
      };
      paint(0);
      let cancelled = false;
      const note = h('div', { class: 'wb-export' },
        h('span', {}, 'Making the video…'),
        h('button', { class: 'btn small', onclick: () => { cancelled = true; } }, 'Cancel'),
      );
      surface.append(note);
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const fileBase = `whiteboard_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}`;

      if (canEncodeOffline()) {
        let voice = null;
        if (s.recAudioAssetId) {
          const a = await db.getAsset(s.recAudioAssetId);
          try { voice = a && (await decodeAudio(a.blob)); } catch { voice = null; }
        }
        const sp = voice ? 1 : src.speed;
        const res = await encodeMP4({
          canvas: out,
          paint: (ms) => paint(ms * sp),
          durationMs: src.dur / sp,
          audio: voice,
          onProgress: (f) => { note.firstChild.textContent = `Making the video… ${Math.round(f * 100)}%`; },
          cancelled: () => cancelled,
        });
        if (res === 'cancelled') { note.remove(); toast('Video cancelled.'); return; }
        if (res) {
          note.remove();
          downloadBlob(res, `${fileBase}.mp4`);
          toast('Video saved to your Downloads.');
          return;
        }
        if (!fmtV) { note.remove(); toast('Couldn’t make the video in this browser.'); return; }
      }

      // Fallback: real-time recording (keep this tab in front while it runs).
      const stream = out.captureStream(30);
      let audio = null;
      let actx = null;
      if (s.recAudioAssetId) {
        const url = await assetURL(s.recAudioAssetId);
        if (url) {
          audio = new Audio(url);
          actx = new AudioContext();
          const dest = actx.createMediaStreamDestination();
          actx.createMediaElementSource(audio).connect(dest);
          dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        }
      }
      const chunks = [];
      const mr = new MediaRecorder(stream, { mimeType: fmtV.mime, videoBitsPerSecond: 3_000_000 });
      mr.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      const done = new Promise((res) => (mr.onstop = res));
      const speed = audio ? 1 : src.speed;
      mr.start(1000);
      if (audio) await audio.play().catch(() => {});
      const t0 = performance.now();
      await new Promise((res) => {
        const tick = () => {
          const T = audio ? audio.currentTime * 1000 : (performance.now() - t0) * speed;
          paint(Math.min(T, src.dur));
          note.firstChild.textContent = `Making the video… ${fmt(T)} / ${fmt(src.dur)}`;
          if (cancelled || T >= src.dur + 500 || (audio && audio.ended)) { res(); return; }
          setTimeout(tick, 33); // keeps going even if this tab is in the background
        };
        tick();
      });
      mr.stop();
      audio?.pause();
      await done;
      actx?.close();
      stream.getTracks().forEach((t) => t.stop());
      note.remove();
      if (cancelled) { toast('Video cancelled.'); return; }
      downloadBlob(new Blob(chunks, { type: fmtV.mime.split(';')[0] }), `${fileBase}.${fmtV.ext}`);
      toast('Video saved to your Downloads.');
    }

    sync();
    requestAnimationFrame(drawNow);

    return {
      resize: drawNow,
      destroy() {
        if (rec) stopRec();
        if (pb) closePlayer();
      },
      openSettings() {
        panel(ctx, 'Whiteboard',
          field('Board', select([['white', 'White'], ['black', 'Chalkboard'], ['clear', 'See-through']], s.bg, (v) => { s.bg = v; sync(); drawPaper(true); ctx.save(); })),
          field('Background', select([['blank', 'Blank'], ['lines', 'Lines'], ['grid', 'Grid'], ['dots', 'Dots']], s.paper, (v) => { s.paper = v; sync(); drawPaper(true); ctx.save(); })),
          field('Spacing', h('input', { type: 'range', min: 2.5, max: 15, step: 0.5, value: s.gap * 100, oninput: (e) => { s.gap = Number(e.target.value) / 100; sync(); drawPaper(true); ctx.save(); } })),
          h('button', { class: 'btn', onclick: download }, '⬇ Save drawing as picture'),
          h('h4', {}, '⏺ Recording'),
          checkbox('Record my voice too (microphone)', s.recVoice, (v) => { s.recVoice = v; ctx.save(); }),
          checkbox('Loop playback (play again and again)', s.loop, (v) => { s.loop = v; ctx.save(); }),
          checkbox('Skip long pauses when playing back (drawing-only recordings)', s.skipPauses, (v) => { s.skipPauses = v; ctx.save(); }),
          s.rec ? h('p', {}, `Last recording: ${fmt(s.rec.dur)}${s.recAudioAssetId ? ' with voice' : ''}.`) : h('p', { class: 'hint' }, 'Press ⏺ on the toolbar to start recording, and again to stop. Then ▶ plays it back.'),
          s.rec ? h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => { ctx.closeSettings(); exportVideo(); } }, '🎞️ Save recording as a video'),
            h('button', { class: 'btn danger', onclick: () => { if (confirm('Delete the recording?')) { s.rec = null; s.recAudioAssetId = null; ctx.save(); ctx.closeSettings(); sync(); } } }, '🗑 Delete recording'),
          ) : null,
          h('p', { class: 'hint' }, 'Recordings stay in this browser. Saving as a video is usually much quicker than the recording, and you can switch to another tab while it works.'),
        );
      },
      closeSettings: sync,
    };

    function download() {
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const o = out.getContext('2d');
      paintPaper(o, s.bg, s.paper, s.gap, out.width, out.height);
      o.drawImage(canvas, 0, 0);
      const a = h('a', { href: out.toDataURL('image/png'), download: 'whiteboard.png' });
      a.click();
    }
  },
};
