import { h, uid, pickFile, toast, downloadBlob } from '../util.js';
import { db, assetURL } from '../storage.js';
import { panel, textInput, checkbox, field, fmtTime } from './_common.js';
import { toEmbedURL } from './embed.js';
import { loadLib, libFileURL, GaplessPlayer } from '../library.js';

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
  defaultState: () => ({ url: '', audioAssetId: null, lib: '', label: '', loop: false, volume: 0.8 }),

  mount(ctx) {
    const s = ctx.state;
    const media = new Audio();
    media.preload = 'metadata';
    const gapless = new GaplessPlayer(() => { syncButtons(); tickTime(); });
    let audio = media;   // whichever player is in use
    const labelEl = h('div', { class: 'audio-label' });
    const playBtn = h('button', { class: 'btn huge primary', 'aria-label': 'Play' }, '▶');
    const seek = h('input', { type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Position', class: 'audio-seek' });
    const timeEl = h('span', { class: 'audio-time' }, '0:00');
    const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, 'aria-label': 'Volume' });
    const dlBtn = h('button', { class: 'btn small', title: 'Download this sound', 'aria-label': 'Download this sound', onclick: async () => {
      const a = s.audioAssetId && (await db.getAsset(s.audioAssetId));
      if (a) downloadBlob(a.blob, a.name || 'sound.webm');
    } }, '⬇');
    const backBtn = h('button', { class: 'btn big', 'aria-label': 'Back 10 seconds', onclick: () => (media.currentTime = Math.max(0, media.currentTime - 10)) }, '⟲10');
    const fwdBtn = h('button', { class: 'btn big', 'aria-label': 'Forward 10 seconds', onclick: () => (media.currentTime += 10) }, '10⟳');
    const libBtn = h('button', { class: 'btn small', title: 'Sound library', 'aria-label': 'Sound library', onclick: () => ctx.openSettings() }, '🎧');
    const player = h('div', { class: 'audio-player' },
      labelEl,
      h('div', { class: 'audio-main' },
        backBtn,
        playBtn,
        fwdBtn,
      ),
      h('div', { class: 'audio-bar' }, seek, timeEl),
      h('div', { class: 'audio-extra' },
        h('label', { class: 'audio-vol' }, '🔈', vol),
        libBtn,
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
      s.url = ''; s.lib = '';
      s.label = `My recording (${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`;
      ctx.save();
      render();
      toast('Recording saved. Rename it in ⚙ settings.');
    }
    // ---------- sound library (the site's sounds/ folder) ----------
    const fmtLen = (d) => (d < 60 ? `${Math.round(d)}s` : fmtTime(d));
    function libraryList() {
      const box = h('div', { class: 'snd-lib' }, h('p', { class: 'hint' }, 'Loading sounds…'));
      loadLib('sounds').then((items) => {
        if (!items.length) { box.replaceChildren(h('p', { class: 'hint' }, 'No library sounds yet.')); return; }
        box.replaceChildren(...items.map((it) => h('button', {
          class: 'snd-item' + (s.lib === it.file ? ' on' : ''), 'aria-pressed': String(s.lib === it.file),
          onclick: () => { pickLibrary(it); ctx.closeSettings(); },
        }, h('span', { class: 'snd-ic', 'aria-hidden': 'true' }, '🎧'), h('span', { class: 'snd-name' }, it.name), h('small', {}, fmtLen(it.duration)))));
      });
      return box;
    }
    function pickLibrary(it) {
      s.lib = it.file; s.url = libFileURL('sounds', it.file, it.v); s.audioAssetId = null;
      s.label = it.name; s.loop = true;
      ctx.save();
      render().then(() => audio.play());
    }
    const empty = h('div', { class: 'empty' },
      h('p', {}, 'Play a sound or song'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => ctx.openSettings() }, '🎧 Sound library'),
        h('button', { class: 'btn', onclick: upload }, 'Upload audio'),
        h('button', { class: 'btn', onclick: () => startRec() }, '🎙 Record your own'),
        h('button', { class: 'btn', onclick: () => ctx.openSettings() }, 'Paste a link'),
      ),
      h('p', { class: 'hint' }, 'MP3 · WAV · M4A · Google Drive · YouTube · Spotify'),
    );
    ctx.view.append(h('div', { class: 'audio' }, empty, player, frameHost, recBox));

    function syncButtons() {
      playBtn.textContent = audio.paused ? '▶' : '⏸';
      playBtn.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
    }
    function tickTime() {
      if (audio === gapless) { timeEl.textContent = gapless.loop ? `Looping · ${fmtLen(gapless.duration)}` : fmtTime(gapless.currentTime); return; }
      if (media.duration) seek.value = (media.currentTime / media.duration) * 1000;
      timeEl.textContent = `${fmtTime(media.currentTime)} / ${media.duration ? fmtTime(media.duration) : '–'}`;
    }
    playBtn.addEventListener('click', () => (audio.paused ? Promise.resolve(audio.play()).catch(() => {}) : audio.pause()));
    media.addEventListener('play', syncButtons);
    media.addEventListener('pause', syncButtons);
    media.addEventListener('timeupdate', tickTime);
    seek.addEventListener('input', () => media.duration && (media.currentTime = (seek.value / 1000) * media.duration));
    vol.addEventListener('input', () => { s.volume = Number(vol.value); media.volume = s.volume; gapless.setVolume(s.volume); ctx.save(); });

    async function upload() {
      const file = await pickFile('audio/*');
      if (!file) return;
      const id = uid('asset');
      await db.putAsset({ id, blob: file, name: file.name, type: file.type });
      s.audioAssetId = id;
      s.url = ''; s.lib = '';
      if (!s.label) s.label = file.name.replace(/\.[^.]+$/, '');
      ctx.save();
      render();
    }

    async function render() {
      if (s.lib) {   // newest version of a library sound that was replaced on the site
        const it = (await loadLib('sounds')).find((i) => i.file === s.lib);
        if (it) { const u = libFileURL('sounds', it.file, it.v); if (u !== s.url) { s.url = u; ctx.save(); } }
      }
      const useGapless = !!(s.lib && s.url && !s.audioAssetId);
      const next = useGapless ? gapless : media;
      if (next !== audio) { audio.pause(); audio = next; }
      media.loop = s.loop; gapless.setLoop(s.loop);
      media.volume = s.volume; gapless.setVolume(s.volume);
      backBtn.hidden = fwdBtn.hidden = seek.hidden = useGapless;
      labelEl.textContent = s.label;
      if (useGapless) {
        empty.hidden = true; player.hidden = false; dlBtn.hidden = true; frameHost.hidden = true;
        if (media.src) media.removeAttribute('src');
        try { await gapless.load(s.url); } catch { toast('Couldn’t load that sound.'); }
        syncButtons(); tickTime();
        return;
      }
      gapless.stop(true);
      const embed = !s.audioAssetId && s.url && isEmbedOnly(s.url);
      const src = s.audioAssetId ? await assetURL(s.audioAssetId) : !embed && s.url ? s.url : null;
      empty.hidden = !!(src || embed);
      player.hidden = !src;
      dlBtn.hidden = !s.audioAssetId;
      frameHost.hidden = !embed;
      if (src && media.src !== src) media.src = src;
      if (!src) media.removeAttribute('src');
      syncButtons();
      if (embed) {
        const e = toEmbedURL(s.url);
        if (e && frameHost.firstChild?.src !== e) frameHost.replaceChildren(h('iframe', { src: e, title: 'Audio', allow: 'autoplay; encrypted-media' }));
      } else frameHost.replaceChildren();
    }
    render();

    return {
      destroy: () => { stopRec(false); media.pause(); media.src = ''; gapless.destroy(); },
      openSettings() {
        panel(ctx, 'Audio settings',
          h('h4', {}, '🎧 Sound library'),
          libraryList(),
          h('h4', {}, 'Your own sound'),
          h('div', { class: 'row' },
            h('button', { class: 'btn primary', onclick: upload }, 'Upload audio from this device'),
            h('button', { class: 'btn', onclick: () => { ctx.closeSettings(); startRec(); } }, '🎙 Record your own'),
          ),
          field('…or audio link', textInput(s.lib ? '' : s.url, (v) => { s.url = v.trim(); s.audioAssetId = null; s.lib = ''; ctx.save(); }, { placeholder: 'https://… (mp3, Google Drive, YouTube)' })),
          field('Label', textInput(s.label, (v) => { s.label = v; ctx.save(); })),
          checkbox('Loop', s.loop, (v) => { s.loop = v; ctx.save(); render(); }),
        );
      },
      closeSettings: render,
    };
  },
};
