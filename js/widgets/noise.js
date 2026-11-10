import { h } from '../util.js';
import { play, soundSelect } from '../sound.js';
import { panel, select, field } from './_common.js';

const FACES = ['😌', '🙂', '😐', '😬', '😱'];

export default {
  type: 'noise',
  title: 'Noise meter',
  icon: '🔊',
  group: 'manage',
  size: [400, 320],
  hasSettings: true,
  defaultState: () => ({ style: 'balls', threshold: 60, sensitivity: 5, alarm: 'beep' }),

  mount(ctx) {
    const s = ctx.state;
    const canvas = h('canvas', { class: 'noise-canvas' });
    const g = canvas.getContext('2d');
    const status = h('div', { class: 'noise-status' });
    const startBtn = h('button', { class: 'btn big primary' }, '🎤 Start listening');
    const overlay = h('div', { class: 'noise-overlay' },
      startBtn,
      h('p', { class: 'hint' }, 'Uses the microphone. Nothing is recorded or sent anywhere.'),
    );
    const thresholdIn = h('input', { type: 'range', min: 5, max: 95, value: s.threshold, 'aria-label': 'Too-loud level', class: 'noise-threshold' });
    thresholdIn.addEventListener('input', () => { s.threshold = Number(thresholdIn.value); ctx.save(); });
    const footer = h('div', { class: 'noise-foot' },
      h('span', {}, 'Too loud at'), thresholdIn,
      h('button', { class: 'btn small', onclick: () => (stop(), (overlay.hidden = false)), 'aria-label': 'Stop listening' }, '⏹'),
    );
    ctx.view.append(h('div', { class: 'noise' }, canvas, status, footer, overlay));

    let stream, actx, analyser, data, raf;
    let level = 0; // smoothed 0..100
    let warnings = 0;
    let overSince = 0;
    let lastAlarm = 0;
    const balls = Array.from({ length: 24 }, (_, i) => ({
      x: Math.random(), y: Math.random(), vx: 0, vy: 0, r: 0.035 + Math.random() * 0.03, hue: (i * 47) % 360,
    }));

    startBtn.addEventListener('click', start);

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) {
        status.textContent = 'Microphone blocked — allow it in the browser address bar.';
        return;
      }
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaStreamSource(stream);
      analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      data = new Float32Array(analyser.fftSize);
      src.connect(analyser);
      overlay.hidden = true;
      warnings = 0;
      loop();
    }

    function stop() {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      actx?.close().catch(() => {});
      stream = actx = analyser = null;
    }

    function measure() {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      const rms = Math.sqrt(sum / data.length);
      const db = 20 * Math.log10(rms + 1e-8); // about -90 (silent) .. 0 (max)
      // Sensitivity 1..10 shifts the floor; maps to 0..100
      const floor = -75 + (s.sensitivity - 5) * -3;
      const v = Math.max(0, Math.min(100, ((db - floor) / (0 - floor)) * 100 * 1.15));
      level += (v - level) * (v > level ? 0.35 : 0.08);
    }

    function loop() {
      measure();
      const now = performance.now();
      const loud = level > s.threshold;
      if (loud) {
        if (!overSince) overSince = now;
        if (now - overSince > 600 && now - lastAlarm > 4000) {
          lastAlarm = now;
          warnings++;
          play(s.alarm);
          ctx.el.classList.add('flash');
          setTimeout(() => ctx.el.classList.remove('flash'), 900);
        }
      } else overSince = 0;
      status.textContent = warnings ? `Too-loud warnings: ${warnings}` : '';
      draw(loud);
      raf = requestAnimationFrame(loop);
    }

    function size() {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
      }
      return { W: canvas.width, H: canvas.height };
    }

    function colour(l) {
      const t = l / Math.max(1, s.threshold);
      return t < 0.6 ? '#2a9d8f' : t < 1 ? '#f4a261' : '#e63946';
    }

    function draw(loud) {
      const { W, H } = size();
      g.clearRect(0, 0, W, H);
      if (s.style === 'bar') {
        const pad = W * 0.08;
        const bw = W - pad * 2;
        const bh = H * 0.42;
        const y = (H - bh) / 2;
        g.fillStyle = '#0001';
        roundRect(pad, y, bw, bh, bh / 4);
        g.fill();
        g.fillStyle = colour(level);
        roundRect(pad, y, Math.max(bh / 2, (bw * level) / 100), bh, bh / 4);
        g.fill();
        const tx = pad + (bw * s.threshold) / 100;
        g.strokeStyle = '#1d1d1f';
        g.lineWidth = Math.max(2, W / 200);
        g.setLineDash([8, 6]);
        g.beginPath();
        g.moveTo(tx, y - bh * 0.25);
        g.lineTo(tx, y + bh * 1.25);
        g.stroke();
        g.setLineDash([]);
      } else if (s.style === 'face') {
        const idx = Math.min(FACES.length - 1, Math.floor((level / Math.max(1, s.threshold)) * 3.2));
        g.font = `${Math.min(W, H) * 0.7}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const shake = loud ? (Math.random() - 0.5) * W * 0.02 : 0;
        g.fillText(FACES[idx], W / 2 + shake, H / 2);
      } else {
        // Bouncy balls: they get faster and jump higher as the room gets louder.
        const energy = level / 100;
        const m = Math.min(W, H);
        for (const b of balls) {
          b.vy += 0.0009; // gravity
          if (b.y + b.r >= 1) {
            b.y = 1 - b.r;
            b.vy = -(0.004 + energy * energy * 0.05 * (0.6 + Math.random() * 0.8));
            b.vx += (Math.random() - 0.5) * energy * 0.02;
          }
          b.vx *= 0.99;
          b.x += b.vx;
          b.y += b.vy;
          if (b.x < b.r || b.x > 1 - b.r) { b.vx *= -1; b.x = Math.min(1 - b.r, Math.max(b.r, b.x)); }
          if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.5; }
          g.beginPath();
          g.arc(b.x * W, b.y * H, b.r * m, 0, Math.PI * 2);
          g.fillStyle = loud ? '#e63946' : `hsl(${b.hue} 75% 58%)`;
          g.fill();
        }
        // Threshold line (balls above it = too loud)
        const ty = H * (1 - s.threshold / 100);
        g.strokeStyle = '#0006';
        g.setLineDash([10, 8]);
        g.lineWidth = Math.max(2, W / 250);
        g.beginPath();
        g.moveTo(0, ty);
        g.lineTo(W, ty);
        g.stroke();
        g.setLineDash([]);
      }
    }

    function roundRect(x, y, w, hh, r) {
      g.beginPath();
      g.roundRect ? g.roundRect(x, y, w, hh, r) : g.rect(x, y, w, hh);
    }

    // Draw a still preview before the mic is started.
    requestAnimationFrame(() => draw(false));

    return {
      destroy: stop,
      resize: () => !analyser && draw(false),
      openSettings() {
        panel(ctx, 'Noise meter settings',
          field('Look', select([['balls', 'Bouncy balls'], ['bar', 'Level bar'], ['face', 'Emoji face']], s.style, (v) => { s.style = v; ctx.save(); draw(false); })),
          field('Microphone sensitivity', (() => {
            const r = h('input', { type: 'range', min: 1, max: 10, value: s.sensitivity });
            r.addEventListener('input', () => { s.sensitivity = Number(r.value); ctx.save(); });
            return r;
          })()),
          field('Too-loud sound', soundSelect(s.alarm, (v) => { s.alarm = v; ctx.save(); })),
          h('p', { class: 'hint' }, 'Tip: start listening, then drag the “Too loud at” slider to just above your normal working noise.'),
        );
      },
      closeSettings: () => { thresholdIn.value = s.threshold; },
    };
  },
};
