import { h, uid, toast, downloadBlob } from '../util.js';
import { db, assetURL } from '../storage.js';
import { panel, select, field, checkbox } from './_common.js';
import { recFormat } from './webcam.js';

// Strokes are stored as vectors in 0..1 coordinates, so the drawing stays sharp at any widget size.
// Every finger or pen draws its own line, so several children can draw on one board at once.
// Sessions can be recorded (with optional voice) and played back, or saved as a video.
const PENS = ['#1d1d1f', '#e63946', '#1982c4', '#2a9d8f', '#f4a261', '#7b2cbf', '#ffffff'];
const SIZES = [0.004, 0.01, 0.025];
const MAX_REC_MS = 15 * 60 * 1000;
const BG_FILL = { black: '#1f3d2b', clear: '#ffffff' };

/** Draw one stroke (or the part of it drawn so far). */
function strokePath(g, st, W, H, upto = st.p.length) {
  const m = Math.min(W, H);
  const p = st.p;
  const n = Math.min(upto, p.length);
  if (n < 2) return;
  g.globalCompositeOperation = st.e ? 'destination-out' : 'source-over';
  g.strokeStyle = st.c;
  g.fillStyle = st.c;
  g.lineWidth = st.s * m * (st.e ? 3 : 1);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (n === 2) {
    g.beginPath();
    g.arc(p[0] * W, p[1] * H, g.lineWidth / 2, 0, Math.PI * 2);
    g.fill();
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
}
function drawAll(g, list, W, H) {
  g.clearRect(0, 0, W, H);
  for (const it of list) strokePath(g, it.st || it, W, H, it.upto);
  g.globalCompositeOperation = 'source-over';
}

/** Paper for saved pictures and videos (the live board uses CSS). */
function paintPaper(g, bg, W, H) {
  g.fillStyle = BG_FILL[bg] || '#ffffff';
  g.fillRect(0, 0, W, H);
  const step = Math.max(14, Math.round(Math.min(W, H) / 22));
  g.lineWidth = 1;
  if (bg === 'grid' || bg === 'lines') {
    g.strokeStyle = bg === 'grid' ? '#c9d6ea' : '#a8c4e8';
    g.beginPath();
    for (let y = step; y < H; y += step) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
    if (bg === 'grid') for (let x = step; x < W; x += step) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
    g.stroke();
  } else if (bg === 'dots') {
    g.fillStyle = '#9aa7ba';
    for (let y = step; y < H; y += step) for (let x = step; x < W; x += step) g.fillRect(x - 1, y - 1, 2.5, 2.5);
  }
}

/**
 * The board as it looked at time T of a recording.
 * Ops: s = stroke (with per-point times), u = undo, r = redo, x = clear.
 */
function frameAt(rec, ops, T) {
  let list = rec.base.map((st) => ({ st }));
  const redo = [];
  for (const op of ops) {
    if (op.t > T) break;
    if (op.k === 's') {
      const ts = op.ts;
      let k = ts.length;
      while (k > 0 && op.t + ts[k - 1] > T) k--;
      list.push({ st: op.st, upto: Math.max(2, k * 2) });
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

const fmt = (ms) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export default {
  type: 'whiteboard',
  title: 'Whiteboard',
  icon: '✏️',
  group: 'extras',
  size: [640, 460],
  hasSettings: true,
  heavyKeys: ['strokes', 'rec'],
  defaultState: () => ({ strokes: [], bg: 'white', rec: null, recAudioAssetId: null, recVoice: false, skipPauses: true }),

  mount(ctx) {
    const s = ctx.state;
    const canvas = h('canvas', { class: 'wb-canvas' });
    const g = canvas.getContext('2d');
    let color = PENS[0];
    let size = SIZES[1];
    let tool = 'pen';
    const redo = [];

    // ---------- recording state ----------
    let rec = null; // { t0, base, ops, timer, media, chunks, mic }
    // ---------- playback state ----------
    let pb = null; // { ops, dur, T, playing, speed, last, raf, audio }

    const toolBtn = (label, title, on, cls = '') => h('button', { class: `wb-tool ${cls}`, title, 'aria-label': title, onclick: on }, label);
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
    const recBtn = h('button', { class: 'wb-tool wb-rec', title: 'Record this whiteboard session', 'aria-label': 'Record', onclick: () => (rec ? stopRec() : startRec()) }, h('span', { class: 'wb-rec-dot' }), h('span', { class: 'wb-rec-t' }));
    const playBtn = toolBtn('▶', 'Play back the recording', () => openPlayer(), 'wb-play');
    const bar = h('div', { class: 'wb-bar' },
      ...penBtns,
      h('span', { class: 'wb-sep' }),
      ...sizeBtns,
      h('span', { class: 'wb-sep' }),
      eraser,
      toolBtn('↶', 'Undo', undo),
      toolBtn('↷', 'Redo', redoStroke),
      toolBtn('🗑', 'Clear all', () => { if (s.strokes.length && confirm('Clear the whiteboard?')) clearAll(); }),
      h('span', { class: 'wb-sep' }),
      recBtn,
      playBtn,
    );
    const badge = h('div', { class: 'wb-recbadge', hidden: true });

    // Player controls (shown instead of the pens while playing back).
    const pPlay = h('button', { class: 'wb-tool', 'aria-label': 'Play or pause' });
    const pScrub = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'wb-scrub', 'aria-label': 'Position' });
    const pTime = h('span', { class: 'wb-ptime' });
    const pSpeed = h('button', { class: 'wb-tool wb-speed', title: 'Speed' });
    const player = h('div', { class: 'wb-bar wb-player', hidden: true },
      pPlay,
      toolBtn('⏮', 'Back to the start', () => seek(0)),
      pScrub,
      pTime,
      pSpeed,
      toolBtn('🎞️', 'Save as a video', () => exportVideo()),
      toolBtn('✕', 'Close the player', () => closePlayer()),
    );
    pPlay.addEventListener('click', () => (pb?.playing ? pausePb() : playPb()));
    pSpeed.addEventListener('click', () => { if (!pb) return; pb.speed = pb.speed === 1 ? 2 : pb.speed === 2 ? 4 : pb.speed === 4 ? 0.5 : 1; if (pb.audio) pb.audio.playbackRate = pb.speed; drawPlayer(); });
    pScrub.addEventListener('input', () => pb && seek((pScrub.value / 1000) * pb.dur));

    const surface = h('div', { class: 'wb-surface' }, canvas, badge);
    ctx.view.append(h('div', { class: 'wb' }, surface, bar, player));

    function sync() {
      penBtns.forEach((b) => b.classList.toggle('on', tool === 'pen' && b.dataset.c === color));
      sizeBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.sz) === size));
      eraser.classList.toggle('on', tool === 'eraser');
      surface.dataset.bg = s.bg;
      surface.classList.toggle('erasing', tool === 'eraser');
      playBtn.hidden = !s.rec || !!rec;
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
    let queued = false;
    function draw() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; drawNow(); });
    }
    function drawNow() {
      fit();
      if (pb) drawAll(g, frameAt(s.rec, pb.ops, pb.T), canvas.width, canvas.height);
      else drawAll(g, s.strokes, canvas.width, canvas.height);
    }

    // ---------- editing (logged while recording) ----------
    const logOp = (op) => rec && rec.ops.push({ t: Date.now() - rec.t0, ...op });
    function undo() {
      if (!s.strokes.length) return;
      redo.push(s.strokes.pop()); logOp({ k: 'u' }); draw(); ctx.save();
    }
    function redoStroke() {
      if (!redo.length) return;
      s.strokes.push(redo.pop()); logOp({ k: 'r' }); draw(); ctx.save();
    }
    function clearAll() {
      s.strokes = []; redo.length = 0; logOp({ k: 'x' }); draw(); ctx.save();
    }

    // ---------- drawing: one line per finger / pen ----------
    const active = new Map(); // pointerId -> { st, op }
    const pt = (e) => {
      const r = canvas.getBoundingClientRect();
      return [+((e.clientX - r.left) / r.width).toFixed(4), +((e.clientY - r.top) / r.height).toFixed(4)];
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || pb) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const erasing = tool === 'eraser' || e.buttons === 32; // stylus eraser end
      const st = { c: color, s: size, e: erasing ? 1 : 0, p: pt(e) };
      s.strokes.push(st);
      redo.length = 0;
      let op = null;
      if (rec) {
        op = { t: Date.now() - rec.t0, k: 's', st, ts: [0] };
        rec.ops.push(op);
      }
      active.set(e.pointerId, { st, op });
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      const a = active.get(e.pointerId);
      if (!a) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) {
        a.st.p.push(...pt(ev));
        if (a.op) a.op.ts.push(Date.now() - rec.t0 - a.op.t);
      }
      draw();
    });
    const end = (e) => {
      if (!active.delete(e.pointerId)) return;
      ctx.save();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);

    // ---------- recording ----------
    async function startRec() {
      if (pb) closePlayer();
      if (s.rec && !confirm('Record a new session? This replaces the last recording.')) return;
      const r = { t0: 0, base: structuredClone(s.strokes), ops: [], chunks: [], media: null, mic: null };
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
          pb.audio.addEventListener('ended', () => { if (pb) { pb.T = pb.dur; pausePb(); } });
        }
      }
      bar.hidden = true;
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
        if (pb.T >= pb.dur) { pb.T = pb.dur; pausePb(); }
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
      drawNow();
    }

    /** Play the recording into a video file (real time, with the voice if there is one). */
    async function exportVideo() {
      const fmtV = recFormat();
      if (!fmtV) { toast('This browser can’t make videos. Try Chrome or Edge.'); return; }
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
      const ink = document.createElement('canvas');
      ink.width = W;
      ink.height = H;
      const ig = ink.getContext('2d');
      const paint = (T) => {
        paintPaper(o, s.bg, W, H);
        drawAll(ig, frameAt(s.rec, src.ops, T), W, H);
        o.drawImage(ink, 0, 0);
      };
      paint(0);
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
      let cancelled = false;
      const note = h('div', { class: 'wb-export' },
        h('span', {}, 'Making the video…'),
        h('button', { class: 'btn small', onclick: () => { cancelled = true; } }, 'Cancel'),
      );
      surface.append(note);
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
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      downloadBlob(new Blob(chunks, { type: fmtV.mime.split(';')[0] }), `whiteboard_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}.${fmtV.ext}`);
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
          field('Background', select([['white', 'White'], ['grid', 'Grid paper'], ['lines', 'Lined paper'], ['dots', 'Dot paper'], ['black', 'Chalkboard'], ['clear', 'See-through']], s.bg, (v) => { s.bg = v; sync(); ctx.save(); })),
          h('button', { class: 'btn', onclick: download }, '⬇ Save drawing as picture'),
          h('h4', {}, '⏺ Recording'),
          checkbox('Record my voice too (microphone)', s.recVoice, (v) => { s.recVoice = v; ctx.save(); }),
          checkbox('Skip long pauses when playing back (drawing-only recordings)', s.skipPauses, (v) => { s.skipPauses = v; ctx.save(); }),
          s.rec ? h('p', {}, `Last recording: ${fmt(s.rec.dur)}${s.recAudioAssetId ? ' with voice' : ''}.`) : h('p', { class: 'hint' }, 'Press ⏺ on the toolbar to start recording, and again to stop. Then ▶ plays it back.'),
          s.rec ? h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => { ctx.closeSettings(); exportVideo(); } }, '🎞️ Save recording as a video'),
            h('button', { class: 'btn danger', onclick: () => { if (confirm('Delete the recording?')) { s.rec = null; s.recAudioAssetId = null; ctx.save(); ctx.closeSettings(); sync(); } } }, '🗑 Delete recording'),
          ) : null,
          h('p', { class: 'hint' }, 'Recordings stay in this browser. Saving as a video plays the recording through once, so it takes as long as the playback.'),
        );
      },
      closeSettings: sync,
    };

    function download() {
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const o = out.getContext('2d');
      paintPaper(o, s.bg, out.width, out.height);
      o.drawImage(canvas, 0, 0);
      const a = h('a', { href: out.toDataURL('image/png'), download: 'whiteboard.png' });
      a.click();
    }
  },
};
