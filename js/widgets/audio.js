import { h, uid, pickFile, toast, downloadBlob } from '../util.js';
import { db, assetURL } from '../storage.js';
import { panel, textInput, checkbox, field, fmtTime } from './_common.js';
import { toEmbedURL } from './embed.js';

const MAX_REC_S = 10 * 60;
/** Best sound format this browser can record (M4A plays everywhere, incl. iPads). */
function micFormat() {
  if (typeof MediaRecorder === 'undefined') return null;
  const m = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
  return m ? { mime: m, ext: m.startsWith('audio/mp4') ? 'm4a' : m.includes('ogg') ? 'ogg' : 'webm' } : { mime: '', ext: 'webm' };
}

const isEmbedOnly = (url) => /(?:drive\.google\.com|youtube\.com|youtu\.be|spotify\.com|soundcloud\.com)/.test(url);

export default {
  type: 'audio',
  title: 'Audio',
  icon: '🎵',
  group: 'core',
  size: [380, 230],
  hasSettings: true,
  defaultState: () => ({ url: '', audioAssetId: null, label: '', loop: false, volume: 0.8 }),

  mount(ctx) {
    const s = ctx.state;
    const audio = new Audio();
    audio.preload = 'metadata';
    const labelEl = h('div', { class: 'audio-label' });
    const playBtn = h('button', { class: 'btn huge primary', 'aria-label': 'Play' }, '▶');
    const seek = h('input', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Position', class: 'audio-seek' });
    const timeEl = h('span', { class: 'audio-time' }, '0:00');
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, 'aria-label': 'Volume' });
    const dlBtn = h('button', { class: 'btn small', title: 'Download this sound', 'aria-label': 'Download this sound', onclick: async () => {
      const a = s.audioAssetId && (await db.getAsset(s.audioAssetId));
      if (a) downloadBlob(a.blob, a.name || 'sound.webm');
    } }, '⬇');
    const player = h('div', { class: 'audio-player' },
      labelEl,
      h('div', { class: 'audio-main' },
        h('button', { class: 'btn big', 'aria-label': 'Back 10 seconds', onclick: () => (audio.currentTime = Math.max(0, audio.currentTime - 10)) }, '⟲10'),
        playBtn,
        h('button', { class: 'btn big', 'aria-label': 'Forward 10 seconds', onclick: () => (audio.currentTime += 10) }, '10⟳'),
      ),
      h('div', { class: 'audio-bar' }, seek, timeEl),
      h('div', { class: 'audio-extra' },
        h('label', { class: 'audio-vol' }, '🔈', vol),
        h('button', { class: 'btn small', title: 'Record your own', 'aria-label': 'Record your own', onclick: () => startRec() }, '🎙'),
        dlBtn,
      ),
    );
    const frameHost = h('div', { class: 'embed-host' });

    // ---------- record your own ----------
    const recTime = h('div', { class: 'arec-time' }, '0:00');
    const recLevel = h('div', { class: 'arec-level' }, h('i'));
    const recName = h('div', { class: 'arec-hint' }, 'Recording… speak, sing or play!');
    const recBox = h('div', { class: 'arec', hidden: true },
      h('div', { class: 'arec-dot', 'aria-hidden': 'true' }),
      recTime,
      recLevel,
      recName,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary big', onclick: () => stopRec(true) }, '■ Stop & keep'),
        h('button', { class: 'btn', onclick: () => stopRec(false) }, 'Cancel'),
      ),
    );
    let rec = null; // { mr, stream, chunks, t0, timer, raf, actx }
    async function startRec() {
      if (rec) return;
      const fmt = micFormat();
      if (!fmt || !navigator.mediaDevices?.getUserMedia) { toast('This browser can’t record sound.'); return; }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
      } catch {
        toast('Microphone not available — check the browser’s permission for this site.');
        return;
      }
      audio.pause();
      const mr = fmt.mime ? new MediaRecorder(stream, { mimeType: fmt.mime, audioBitsPerSecond: 128000 }) : new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      // Level meter, so you can see the microphone is hearing you.
      const actx = new AudioContext();
      const an = actx.createAnalyser();
      an.fftSize = 512;
      actx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      rec = { mr, stream, chunks, t0: Date.now(), actx, fmt, keep: false };
      const meter = () => {
        if (!rec) return;
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        recLevel.firstChild.style.width = `${Math.min(100, (peak / 128) * 160)}%`;
        rec.raf = requestAnimationFrame(meter);
      };
      meter();
      const tick = () => {
        const t = (Date.now() - rec.t0) / 1000;
        recTime.textContent = fmtTime(t);
        if (t >= MAX_REC_S) stopRec(true);
      };
      tick();
      rec.timer = setInterval(tick, 250);
      mr.onstop = () => finishRec();
      mr.start(1000);
      recBox.hidden = false;
    }
    function stopRec(keep) {
      if (!rec) return;
      rec.keep = keep;
      clearInterval(rec.timer);
      cancelAnimationFrame(rec.raf);
      if (rec.mr.state !== 'inactive') rec.mr.stop(); else finishRec();
    }
    async function finishRec() {
      const r = rec;
      if (!r) return;
      rec = null;
      r.stream.getTracks().forEach((t) => t.stop());
      r.actx.close().catch(() => {});
      recBox.hidden = true;
      if (!r.keep) return;
      const blob = new Blob(r.chunks, { type: (r.mr.mimeType || r.fmt.mime || 'audio/webm').split(';')[0] });
      if (!blob.size) { toast('Nothing was recorded.'); return; }
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const name = `recording_${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}.${r.fmt.ext}`;
      const id = uid('asset');
      await db.putAsset({ id, blob, name, type: blob.type });
      s.audioAssetId = id;
      s.url = '';
      s.label = `My recording (${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`;
      ctx.save();
      render();
      toast('Recording saved. Rename it in ⚙ settings.');
    }
    const empty = h('div', { class: 'empty' },
      h('p', {}, 'Play a sound or song'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: upload }, 'Upload audio'),
        h('button', { class: 'btn', onclick: () => startRec() }, '🎙 Record your own'),
        h('button', { class: 'btn', onclick: () => ctx.openSettings() }, 'Paste a link'),
      ),
      h('p', { class: 'hint' }, 'MP3 · WAV · M4A · Google Drive · YouTube · Spotify'),
    );
    ctx.view.append(h('div', { class: 'audio' }, empty, player, frameHost, recBox));

    playBtn.addEventListener('click', () => (audio.paused ? audio.play().catch(() => {}) : audio.pause()));
    audio.addEventListener('play', () => { playBtn.textContent = '⏸'; playBtn.setAttribute('aria-label', 'Pause'); });
    audio.addEventListener('pause', () => { playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Play'); });
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) seek.value = (audio.currentTime / audio.duration) * 1000;
      timeEl.textContent = `${fmtTime(audio.currentTime)} / ${audio.duration ? fmtTime(audio.duration) : '–'}`;
    });
    seek.addEventListener('input', () => audio.duration && (audio.currentTime = (seek.value / 1000) * audio.duration));
    vol.addEventListener('input', () => { audio.volume = s.volume = Number(vol.value); ctx.save(); });

    async function upload() {
      const file = await pickFile('audio/*');
      if (!file) return;
      const id = uid('asset');
      await db.putAsset({ id, blob: file, name: file.name, type: file.type });
      s.audioAssetId = id;
      s.url = '';
      if (!s.label) s.label = file.name.replace(/\.[^.]+$/, '');
      ctx.save();
      render();
    }

    async function render() {
      audio.loop = s.loop;
      audio.volume = s.volume;
      labelEl.textContent = s.label;
      const embed = !s.audioAssetId && s.url && isEmbedOnly(s.url);
      const src = s.audioAssetId ? await assetURL(s.audioAssetId) : !embed && s.url ? s.url : null;
      empty.hidden = !!(src || embed);
      player.hidden = !src;
      dlBtn.hidden = !s.audioAssetId;
      frameHost.hidden = !embed;
      if (src && audio.src !== src) audio.src = src;
      if (!src) audio.removeAttribute('src');
      if (embed) {
        const e = toEmbedURL(s.url);
        if (e && frameHost.firstChild?.src !== e) frameHost.replaceChildren(h('iframe', { src: e, title: 'Audio', allow: 'autoplay; encrypted-media' }));
      } else frameHost.replaceChildren();
    }
    render();

    return {
      destroy: () => { stopRec(false); audio.pause(); audio.src = ''; },
      openSettings() {
        panel(ctx, 'Audio settings',
          h('div', { class: 'row' },
            h('button', { class: 'btn primary', onclick: upload }, 'Upload audio from this device'),
            h('button', { class: 'btn', onclick: () => { ctx.closeSettings(); startRec(); } }, '🎙 Record your own'),
          ),
          field('…or audio link', textInput(s.url, (v) => { s.url = v.trim(); s.audioAssetId = null; ctx.save(); }, { placeholder: 'https://… (mp3, Google Drive, YouTube)' })),
          field('Label', textInput(s.label, (v) => { s.label = v; ctx.save(); })),
          checkbox('Loop', s.loop, (v) => { s.loop = v; ctx.save(); }),
        );
      },
      closeSettings: render,
    };
  },
};
