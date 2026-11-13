// Screen backgrounds that move: generated animations, videos (uploaded, web links, YouTube,
// Google Drive) and picture slideshows. They live in a layer behind the board.
import { h } from './util.js';

// ---------------------------------------------------------------- link helpers
export function driveId(url) {
  const m = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=|thumbnail\?(?:.*&)?id=)([\w-]{20,})/) || String(url).match(/[?&]id=([\w-]{20,})/);
  return m && /google\.com/.test(url) ? m[1] : null;
}
export function youtubeId(url) {
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
/** What kind of background a pasted link is. */
export function classifyLink(raw) {
  let url = String(raw || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (youtubeId(url)) return { type: 'youtube', id: youtubeId(url), url };
  if (driveId(url)) return { type: 'drive', id: driveId(url), url };
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return { type: 'video', url };
  return { type: 'image', value: url }; // pictures and animated GIFs
}

// ---------------------------------------------------------------- generated animations
const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/**
 * Each preset: { label, icon, dark, base (CSS background under the canvas), make(W, H) → { draw(g, t, dt) } }.
 * Sizes are in CSS pixels; t and dt are in seconds (already multiplied by the speed setting).
 */
export const ANIMS = {
  aurora: {
    label: 'Aurora', icon: '🌌', dark: true, base: 'linear-gradient(#0b1026, #10203f 60%, #0d2b3a)',
    make(W, H) {
      const bands = [['#3ef0b5', 0.35], ['#4fa8ff', 0.5], ['#b26bff', 0.62], ['#36e0ff', 0.42]].map(([c, y], i) => ({ c, y, ph: i * 1.7, amp: rnd(0.04, 0.09) }));
      const stars = Array.from({ length: 140 }, () => ({ x: rnd(0, W), y: rnd(0, H * 0.7), r: rnd(0.4, 1.4), p: rnd(0, TAU) }));
      return {
        draw(g, t) {
          g.clearRect(0, 0, W, H);
          for (const s of stars) { g.globalAlpha = 0.4 + 0.4 * Math.sin(t * 1.3 + s.p); g.fillStyle = '#fff'; g.fillRect(s.x, s.y, s.r, s.r); }
          g.globalCompositeOperation = 'lighter';
          for (const b of bands) {
            const grd = g.createLinearGradient(0, H * (b.y - 0.25), 0, H * (b.y + 0.15));
            grd.addColorStop(0, 'transparent'); grd.addColorStop(0.6, b.c); grd.addColorStop(1, 'transparent');
            g.fillStyle = grd;
            g.globalAlpha = 0.22 + 0.08 * Math.sin(t * 0.4 + b.ph);
            g.beginPath();
            g.moveTo(0, H);
            for (let x = 0; x <= W + 20; x += 20) {
              const y = H * (b.y + b.amp * Math.sin(x / W * 5 + t * 0.35 + b.ph) + 0.03 * Math.sin(x / W * 13 - t * 0.6));
              g.lineTo(x, y);
            }
            g.lineTo(W, H * 0.1); g.lineTo(0, H * 0.1); g.closePath();
            g.fill();
          }
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
        },
      };
    },
  },
  waves: {
    label: 'Calm waves', icon: '🌊', dark: false, base: 'linear-gradient(#bfe8ff, #e8f7ff 55%, #2b7bb9 56%)',
    make(W, H) {
      const layers = [['#4aa3df', 0.56, 16, 0.6], ['#2f86c6', 0.63, 22, 0.8], ['#1f6aa8', 0.72, 28, 1], ['#16518a', 0.82, 34, 1.25]];
      return {
        draw(g, t) {
          g.clearRect(0, 0, W, H);
          for (const [c, y0, amp, sp] of layers) {
            g.fillStyle = c;
            g.beginPath();
            g.moveTo(0, H);
            for (let x = 0; x <= W + 10; x += 10) g.lineTo(x, H * y0 + amp * Math.sin(x / 140 + t * sp) + amp * 0.4 * Math.sin(x / 55 - t * sp * 1.6));
            g.lineTo(W, H);
            g.fill();
          }
        },
      };
    },
  },
  bubbles: {
    label: 'Bubbles', icon: '🫧', dark: false, base: 'linear-gradient(#5ec8e5, #2a7fb8)',
    make(W, H) {
      const n = Math.round((W * H) / 22000);
      const bs = Array.from({ length: n }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(6, 34), v: rnd(18, 55), w: rnd(0, TAU) }));
      return {
        draw(g, t, dt) {
          g.clearRect(0, 0, W, H);
          for (const b of bs) {
            b.y -= b.v * dt;
            if (b.y < -b.r * 2) { b.y = H + b.r; b.x = rnd(0, W); }
            const x = b.x + 14 * Math.sin(t * 0.8 + b.w);
            g.beginPath(); g.arc(x, b.y, b.r, 0, TAU);
            g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.stroke();
            g.fillStyle = 'rgba(255,255,255,.08)'; g.fill();
            g.beginPath(); g.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, TAU); g.fillStyle = 'rgba(255,255,255,.5)'; g.fill();
          }
        },
      };
    },
  },
  snow: {
    label: 'Snow', icon: '❄️', dark: true, base: 'linear-gradient(#22324f, #4b6584 70%, #a9bccf)',
    make(W, H) {
      const fl = Array.from({ length: Math.round((W * H) / 5000) }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(1, 4), v: rnd(20, 60), w: rnd(0, TAU) }));
      return {
        draw(g, t, dt) {
          g.clearRect(0, 0, W, H);
          g.fillStyle = '#fff';
          for (const f of fl) {
            f.y += f.v * dt * (f.r / 3);
            if (f.y > H + 5) { f.y = -5; f.x = rnd(0, W); }
            g.globalAlpha = 0.5 + f.r / 8;
            g.beginPath(); g.arc(f.x + 20 * Math.sin(t * 0.5 + f.w), f.y, f.r, 0, TAU); g.fill();
          }
          g.globalAlpha = 1;
        },
      };
    },
  },
  rain: {
    label: 'Rain', icon: '🌧️', dark: true, base: 'linear-gradient(#2c3e50, #4c5f73)',
    make(W, H) {
      const drops = Array.from({ length: Math.round((W * H) / 4500) }, () => ({ x: rnd(0, W), y: rnd(0, H), l: rnd(10, 24), v: rnd(500, 850) }));
      const rings = [];
      return {
        draw(g, t, dt) {
          g.clearRect(0, 0, W, H);
          g.strokeStyle = 'rgba(200,220,255,.45)'; g.lineWidth = 1.2;
          g.beginPath();
          for (const d of drops) {
            d.y += d.v * dt; d.x += d.v * dt * 0.12;
            if (d.y > H) { if (Math.random() < 0.15) rings.push({ x: d.x, y: H - rnd(5, 60), r: 1, a: 0.6 }); d.y = rnd(-50, 0); d.x = rnd(-50, W); }
            g.moveTo(d.x, d.y); g.lineTo(d.x + d.l * 0.12, d.y + d.l);
          }
          g.stroke();
          for (let i = rings.length - 1; i >= 0; i--) {
            const r = rings[i]; r.r += 30 * dt; r.a -= 0.8 * dt;
            if (r.a <= 0) { rings.splice(i, 1); continue; }
            g.strokeStyle = `rgba(200,220,255,${r.a})`; g.beginPath(); g.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, TAU); g.stroke();
          }
        },
      };
    },
  },
  stars: {
    label: 'Night sky', icon: '✨', dark: true, base: 'radial-gradient(ellipse at bottom, #1b2a4a, #090a1a 70%)',
    make(W, H) {
      const st = Array.from({ length: Math.round((W * H) / 2500) }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.3, 1.8), p: rnd(0, TAU), s: rnd(0.5, 2) }));
      let shoot = null;
      return {
        draw(g, t, dt) {
          g.clearRect(0, 0, W, H);
          for (const s of st) {
            s.x -= 3 * dt; if (s.x < 0) s.x = W;
            g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * s.s * 0.6 + s.p));
            g.fillStyle = '#fff'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill();
          }
          g.globalAlpha = 1;
          if (!shoot && Math.random() < dt * 0.12) shoot = { x: rnd(W * 0.2, W), y: rnd(0, H * 0.4), life: 1 };
          if (shoot) {
            shoot.x -= 600 * dt; shoot.y += 250 * dt; shoot.life -= dt * 1.2;
            const grd = g.createLinearGradient(shoot.x, shoot.y, shoot.x + 120, shoot.y - 50);
            grd.addColorStop(0, `rgba(255,255,255,${Math.max(0, shoot.life)})`); grd.addColorStop(1, 'transparent');
            g.strokeStyle = grd; g.lineWidth = 2; g.beginPath(); g.moveTo(shoot.x, shoot.y); g.lineTo(shoot.x + 120, shoot.y - 50); g.stroke();
            if (shoot.life <= 0) shoot = null;
          }
        },
      };
    },
  },
  fireflies: {
    label: 'Fireflies', icon: '🌲', dark: true, base: 'linear-gradient(#06140d, #0f2a1c 60%, #163a26)',
    make(W, H) {
      const ff = Array.from({ length: Math.round((W * H) / 18000) }, () => ({ x: rnd(0, W), y: rnd(H * 0.2, H), a: rnd(0, TAU), v: rnd(10, 30), p: rnd(0, TAU) }));
      const trees = Array.from({ length: Math.ceil(W / 70) }, (_, i) => ({ x: i * 70 + rnd(-20, 20), h: rnd(0.25, 0.5) * H, w: rnd(40, 80) }));
      return {
        draw(g, t, dt) {
          g.clearRect(0, 0, W, H);
          g.fillStyle = '#04100a';
          for (const tr of trees) { g.beginPath(); g.moveTo(tr.x, H - tr.h); g.lineTo(tr.x - tr.w / 2, H); g.lineTo(tr.x + tr.w / 2, H); g.fill(); }
          for (const f of ff) {
            f.a += rnd(-1, 1) * dt; f.x += Math.cos(f.a) * f.v * dt; f.y += Math.sin(f.a) * f.v * dt;
            if (f.x < 0) f.x = W; if (f.x > W) f.x = 0; if (f.y < H * 0.1) f.y = H; if (f.y > H) f.y = H * 0.2;
            const glow = Math.max(0, Math.sin(t * 1.4 + f.p));
            const grd = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, 14);
            grd.addColorStop(0, `rgba(230,255,140,${0.9 * glow})`); grd.addColorStop(1, 'rgba(230,255,140,0)');
            g.fillStyle = grd; g.beginPath(); g.arc(f.x, f.y, 14, 0, TAU); g.fill();
          }
        },
      };
    },
  },
  clouds: {
    label: 'Clouds', icon: '☁️', dark: false, base: 'linear-gradient(#5aa7e6, #a8d8fb 70%, #dff1ff)',
    make(W, H) {
      const cl = Array.from({ length: Math.max(6, Math.round(W / 160)) }, () => ({ x: rnd(-200, W), y: rnd(0, H * 0.75), s: rnd(0.6, 1.6), v: rnd(6, 18) }));
      const puff = (g, x, y, s) => { for (const [dx, dy, r] of [[0, 0, 40], [40, -18, 46], [86, 0, 38], [42, 14, 42], [-30, 10, 30], [118, 12, 28]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, TAU); g.fill(); } };
      return {
        draw(g, t, dt) {
          g.clearRect(0, 0, W, H);
          for (const c of cl) {
            c.x += c.v * dt * c.s; if (c.x > W + 200) { c.x = -260; c.y = rnd(0, H * 0.75); }
            g.fillStyle = `rgba(255,255,255,${0.55 + c.s * 0.2})`; puff(g, c.x, c.y, c.s);
          }
        },
      };
    },
  },
  leaves: {
    label: 'Autumn leaves', icon: '🍂', dark: false, base: 'linear-gradient(#f7d9a8, #e9a66a 70%, #c96f3b)',
    make(W, H) {
      const cols = ['#d1495b', '#e07a2f', '#edae49', '#a44a3f', '#c97b2b'];
      const lv = Array.from({ length: Math.round((W * H) / 30000) }, () => ({ x: rnd(0, W), y: rnd(-H, H), s: rnd(8, 18), v: rnd(25, 60), r: rnd(0, TAU), vr: rnd(-1.5, 1.5), c: cols[Math.floor(rnd(0, cols.length))], w: rnd(0, TAU) }));
      return {
        draw(g, t, dt) {
          g.clearRect(0, 0, W, H);
          for (const l of lv) {
            l.y += l.v * dt; l.r += l.vr * dt;
            if (l.y > H + 20) { l.y = -20; l.x = rnd(0, W); }
            g.save(); g.translate(l.x + 40 * Math.sin(t * 0.7 + l.w), l.y); g.rotate(l.r); g.scale(1, 0.55 + 0.45 * Math.sin(t * 2 + l.w));
            g.fillStyle = l.c; g.beginPath(); g.ellipse(0, 0, l.s, l.s * 0.55, 0, 0, TAU); g.fill();
            g.strokeStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.moveTo(-l.s, 0); g.lineTo(l.s, 0); g.stroke();
            g.restore();
          }
        },
      };
    },
  },
  confetti: {
    label: 'Confetti', icon: '🎉', dark: false, base: 'linear-gradient(135deg, #fff1f8, #eaf3ff)',
    make(W, H) {
      const cols = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#7b2cbf', '#ff70a6'];
      const cf = Array.from({ length: Math.round((W * H) / 9000) }, () => ({ x: rnd(0, W), y: rnd(-H, H), w: rnd(5, 10), hh: rnd(8, 14), v: rnd(40, 90), r: rnd(0, TAU), vr: rnd(-4, 4), c: cols[Math.floor(rnd(0, cols.length))], ph: rnd(0, TAU) }));
      return {
        draw(g, t, dt) {
          g.clearRect(0, 0, W, H);
          for (const c of cf) {
            c.y += c.v * dt; c.r += c.vr * dt;
            if (c.y > H + 20) { c.y = -20; c.x = rnd(0, W); }
            g.save(); g.translate(c.x + 25 * Math.sin(t + c.ph), c.y); g.rotate(c.r); g.scale(1, Math.sin(t * 3 + c.ph));
            g.fillStyle = c.c; g.fillRect(-c.w / 2, -c.hh / 2, c.w, c.hh); g.restore();
          }
        },
      };
    },
  },
};

// ---------------------------------------------------------------- the layer
/**
 * Renders a moving background into `host` (a fixed layer behind the board).
 * bg types handled here: anim, video, youtube, drive, slides. Returns { stop, setPaused, dark }.
 */
export function renderMoving(host, bg, { assetURL, onProblem = () => {} }) {
  host.replaceChildren();
  host.style.background = '';
  const dim = h('div', { class: 'bg-dim', style: { opacity: String((bg.dim || 0) / 100) } });
  let raf = 0;
  let timer = 0;
  let paused = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const videos = [];
  const cleanups = [];
  const playAll = () => videos.forEach((v) => (paused ? v.pause() : v.play().catch(() => {})));
  const api = { dark: false, stop() {}, setPaused(p) { paused = p; playAll(); } };

  if (bg.type === 'anim') {
    const def = ANIMS[bg.preset] || ANIMS.aurora;
    api.dark = def.dark;
    host.style.background = def.base;
    const c = h('canvas', { class: 'bg-canvas' });
    host.append(c, dim);
    const g = c.getContext('2d');
    let scene = null;
    let W = 0;
    let H = 0;
    const fit = () => {
      const dpr = Math.min(1.5, devicePixelRatio || 1);
      W = innerWidth; H = innerHeight;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene = def.make(W, H);
    };
    fit();
    addEventListener('resize', fit);
    const speed = bg.speed || 1;
    let t = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (paused) return;
      acc += dt;
      if (acc < 1 / 32) return; // ~30 frames a second is plenty for a calm background
      t += acc * speed;
      scene.draw(g, t, acc * speed);
      acc = 0;
    };
    scene.draw(g, 0, 0);
    if (!reduce) raf = requestAnimationFrame(loop);
    api.stop = () => { cancelAnimationFrame(raf); removeEventListener('resize', fit); };
    return api;
  }

  const addVideo = (src, { onFail } = {}) => {
    const v = h('video', { class: 'bg-media', src, muted: true, loop: true, autoplay: !reduce, playsinline: true, preload: 'auto' });
    v.muted = true;
    v.setAttribute('playsinline', '');
    if (onFail) v.addEventListener('error', onFail, { once: true });
    videos.push(v);
    return v;
  };
  const addImage = (src, { onFail } = {}) => {
    const im = h('img', { class: 'bg-media', src, alt: '' });
    if (onFail) im.addEventListener('error', onFail, { once: true });
    return im;
  };

  (async () => {
    if (bg.type === 'video') {
      const src = bg.assetId ? await assetURL(bg.assetId) : bg.url;
      if (!src) return;
      host.append(addVideo(src, { onFail: () => onProblem('That video couldn’t be played. Try an MP4 file.') }), dim);
      playAll();
    } else if (bg.type === 'youtube') {
      // YouTube can't be a true background: shown muted and looping, scaled to fill, not clickable.
      // YouTube's own loop reloads the video (a black flash), so we listen to the player and jump
      // back to the start just before the end instead. Its loop setting stays on as a fallback.
      const id = bg.id;
      const origin = 'https://www.youtube-nocookie.com';
      const f = h('iframe', {
        class: 'bg-yt', title: 'Background video', allow: 'autoplay; encrypted-media', referrerpolicy: 'strict-origin-when-cross-origin',
        src: `${origin}/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&disablekb=1&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`,
      });
      const send = (func, args = []) => f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), origin);
      let duration = 0;
      let jumpedAt = 0;
      const onMsg = (e) => {
        if (e.source !== f.contentWindow) return;
        let d;
        try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
        const info = d?.info;
        if (!info) return;
        if (info.duration) duration = info.duration;
        if (info.playerState === 1) f.classList.add('on'); // playing: fade in (hides the black loading screen)
        const t = info.currentTime;
        if (typeof t === 'number' && duration > 2 && t > duration - 0.6 && performance.now() - jumpedAt > 1500) {
          jumpedAt = performance.now();
          send('seekTo', [0, true]);
        }
      };
      addEventListener('message', onMsg);
      f.addEventListener('load', () => {
        // Ask the player to report its position (YouTube's iframe message protocol).
        f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'bg', channel: 'widget' }), origin);
        send('mute');
        if (!paused) send('playVideo');
      });
      setTimeout(() => f.classList.add('on'), 6000); // show it anyway if the player never reports
      api.setPaused = (p) => { paused = p; send(p ? 'pauseVideo' : 'playVideo'); };
      cleanups.push(() => removeEventListener('message', onMsg));
      host.append(f, dim);
    } else if (bg.type === 'drive') {
      // Google Drive: a shared video plays from its download link; a shared picture shows full size.
      const id = bg.id;
      const asImage = () => {
        host.replaceChildren(addImage(`https://drive.google.com/thumbnail?id=${id}&sz=w2560`, {
          onFail: () => onProblem('Couldn’t load that Google Drive file. In Drive, set Share → General access → “Anyone with the link”.'),
        }), dim);
      };
      if (bg.kind === 'image') { asImage(); return; }
      const v = addVideo(`https://drive.google.com/uc?export=download&id=${id}`, { onFail: asImage });
      host.append(v, dim);
      playAll();
      // Big Drive videos (over ~100 MB) can't be streamed this way: fall back to the picture.
      timer = setTimeout(() => { if (v.readyState < 2 && host.contains(v)) asImage(); }, 15000);
    } else if (bg.type === 'slides') {
      const ids = bg.assetIds || [];
      if (!ids.length) return;
      const every = Math.max(3, bg.every || 15) * 1000;
      const fx = bg.effect || 'fade';
      const order = [...ids.keys()];
      if (bg.shuffle !== false) order.sort(() => Math.random() - 0.5);
      let i = -1;
      let cur = null;
      const next = async () => {
        if (paused) { timer = setTimeout(next, 1000); return; }
        i = (i + 1) % order.length;
        const url = await assetURL(ids[order[i]]);
        if (!url) { timer = setTimeout(next, 200); return; }
        const isVid = bg.kinds?.[order[i]] === 'video';
        const el = isVid ? addVideo(url) : addImage(url);
        if (isVid) el.loop = false;
        el.classList.add('bg-slide', `fx-${fx}`);
        if (fx === 'kenburns') el.style.setProperty('--kb', `${every + 1500}ms`), el.style.setProperty('--kbx', `${rnd(-4, 4)}%`), el.style.setProperty('--kby', `${rnd(-4, 4)}%`);
        host.insertBefore(el, dim);
        const show = () => requestAnimationFrame(() => el.classList.add('on'));
        if (isVid) { el.addEventListener('loadeddata', show, { once: true }); el.play().catch(() => {}); } else if (el.complete) show(); else el.addEventListener('load', show, { once: true });
        const prev = cur;
        cur = el;
        setTimeout(() => { if (prev) { prev.remove(); const k = videos.indexOf(prev); if (k >= 0) videos.splice(k, 1); } }, 1600);
        if (isVid) {
          el.addEventListener('ended', () => { clearTimeout(timer); next(); }, { once: true });
          timer = setTimeout(next, 5 * 60 * 1000); // safety
        } else timer = setTimeout(next, reduce ? every * 2 : every);
      };
      host.append(dim);
      next();
    }
  })();
  api.stop = () => { clearTimeout(timer); cleanups.forEach((c) => c()); videos.forEach((v) => { v.pause(); v.removeAttribute('src'); }); };
  return api;
}

export const MOVING_TYPES = ['anim', 'video', 'youtube', 'drive', 'slides'];
