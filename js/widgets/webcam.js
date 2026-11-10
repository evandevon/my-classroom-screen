import { h, uid, toast, downloadBlob } from '../util.js';
import { db } from '../storage.js';
import { play } from '../sound.js';
import { panel, checkbox, field, select } from './_common.js';

// Webcam / document camera: live view, freeze, mirror, rotate, zoom, and full-resolution photos
// saved to this device, and short video recordings that loop in their own widget.
// The picture never leaves the computer.

const MAX_REC_S = 180;
const REC_SIDE = 1280;
/** Best format this browser can record: MP4 where possible (plays everywhere), else WebM. */
export function recFormat() {
  const options = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = typeof MediaRecorder !== 'undefined' ? options.find((m) => MediaRecorder.isTypeSupported(m)) : null;
  return mime ? { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' } : null;
}

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};

export default {
  type: 'webcam',
  title: 'Webcam',
  icon: '📷',
  group: 'core',
  size: [640, 460],
  hasSettings: true,
  defaultState: () => ({ deviceId: '', mirror: false, flipV: false, rotate: 0, zoom: 1, fill: false, sound: false, afterRec: 'board', afterPhoto: 'board', step: 0 }),

  mount(ctx) {
    const s = ctx.state;
    const video = h('video', { class: 'cam-video', autoplay: true, playsinline: true, muted: true });
    video.muted = true;
    const frame = h('div', { class: 'cam-frame' }, video);
    const flash = h('div', { class: 'cam-flash' });
    const status = h('div', { class: 'cam-res' });
    const freezeBtn = h('button', { class: 'btn small', title: 'Freeze the picture', onclick: toggleFreeze }, '❄️ Freeze');
    const zoomIn = h('input', { type: 'range', min: 1, max: 4, step: 0.1, value: s.zoom, 'aria-label': 'Zoom', class: 'cam-zoom' });
    zoomIn.addEventListener('input', () => { s.zoom = Number(zoomIn.value); apply(); ctx.save(); });
    const mirrorBtn = h('button', { class: 'btn small', title: 'Flip left ↔ right', 'aria-label': 'Flip left to right', onclick: () => { s.mirror = !s.mirror; apply(); ctx.save(); } }, '⇋');
    const flipBtn = h('button', { class: 'btn small', title: 'Flip upside down', 'aria-label': 'Flip upside down', onclick: () => { s.flipV = !s.flipV; apply(); ctx.save(); } }, '⇅');
    const rotL = h('button', { class: 'btn small', title: 'Rotate left 90°', 'aria-label': 'Rotate left', onclick: () => { s.rotate = (s.rotate + 270) % 360; apply(); ctx.save(); } }, '⟲');
    const rotR = h('button', { class: 'btn small', title: 'Rotate right 90°', 'aria-label': 'Rotate right', onclick: () => { s.rotate = (s.rotate + 90) % 360; apply(); ctx.save(); } }, '⟳');
    const recBtn = h('button', { class: 'btn big cam-rec', title: 'Record a video clip', 'aria-label': 'Record a video clip', onclick: () => (recorder ? stopRec() : startRec()) }, h('span', { class: 'cam-rec-dot' }), h('span', { class: 'cam-rec-t' }, ''));
    const recBadge = h('div', { class: 'cam-recbadge', hidden: true });
    const controls = h('div', { class: 'cam-controls' },
      h('button', { class: 'btn primary big cam-shot', title: 'Take a photo (full resolution)', onclick: photo }, '📸'),
      recBtn,
      freezeBtn,
      mirrorBtn,
      flipBtn,
      rotL,
      rotR,
      h('label', { class: 'cam-zoomwrap', title: 'Zoom' }, '🔍', zoomIn),
      status,
    );
    const startBtn = h('button', { class: 'btn primary big' }, '📷 Turn on camera');
    const msg = h('p', { class: 'hint' }, 'The picture stays on this computer — nothing is sent anywhere.');
    const overlay = h('div', { class: 'empty cam-start' }, startBtn, msg);
    startBtn.addEventListener('click', start);
    ctx.view.append(h('div', { class: 'cam' }, frame, recBadge, flash, controls, overlay));

    let stream = null;
    let frozen = false;

    async function start() {
      stop();
      const want = { width: { ideal: 4096 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } };
      const constraints = { audio: false, video: s.deviceId ? { ...want, deviceId: { exact: s.deviceId } } : { ...want, facingMode: 'environment' } };
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        if (s.deviceId) { s.deviceId = ''; return start(); } // remembered camera unplugged: try any camera
        msg.textContent = e.name === 'NotAllowedError'
          ? 'Camera blocked. Click the camera icon in the address bar to allow it, then try again.'
          : 'No camera found. Plug one in (or check it isn’t being used by another app) and try again.';
        overlay.hidden = false;
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      overlay.hidden = true;
      frozen = false;
      freezeBtn.textContent = '❄️ Freeze';
      const track = stream.getVideoTracks()[0];
      const set = track.getSettings();
      status.textContent = set.width ? `${set.width}×${set.height}` : '';
      track.addEventListener('ended', () => { overlay.hidden = false; msg.textContent = 'The camera was disconnected.'; });
      apply();
    }
    function stop() {
      if (recorder) stopRec();
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    function toggleFreeze() {
      if (!stream) return;
      frozen = !frozen;
      if (frozen) video.pause(); else video.play();
      freezeBtn.textContent = frozen ? '▶ Live' : '❄️ Freeze';
      frame.classList.toggle('frozen', frozen);
    }
    /** Same order as the photo: flip/zoom first, then rotate. */
    function apply() {
      const sideways = s.rotate % 180 !== 0;
      const sx = (s.mirror ? -1 : 1) * s.zoom;
      const sy = (s.flipV ? -1 : 1) * s.zoom;
      // Centred explicitly (a turned box is taller/wider than the frame, so it can't rely on layout).
      video.style.transform = `translate(-50%, -50%) rotate(${s.rotate}deg) scale(${sx}, ${sy})`;
      video.style.objectFit = s.fill ? 'cover' : 'contain';
      // Turned sideways, the video box swaps width and height so the picture still fills the frame.
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      video.style.width = `${sideways ? fh : fw}px`;
      video.style.height = `${sideways ? fw : fh}px`;
      zoomIn.value = s.zoom;
      mirrorBtn.classList.toggle('on', s.mirror);
      flipBtn.classList.toggle('on', s.flipV);
      rotR.title = `Rotate right 90° (now ${s.rotate}°)`;
      rotL.title = `Rotate left 90° (now ${s.rotate}°)`;
    }

    /** Source crop (zoom) and output size, turned and flipped as shown on screen. */
    function geometry(maxSide = Infinity) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = Math.round(vw / s.zoom);
      const ch = Math.round(vh / s.zoom);
      const sideways = s.rotate % 180 !== 0;
      const k = Math.min(1, maxSide / Math.max(cw, ch));
      // Even sizes keep video encoders happy.
      const ow = 2 * Math.round(((sideways ? ch : cw) * k) / 2);
      const oh = 2 * Math.round(((sideways ? cw : ch) * k) / 2);
      return { sx: Math.round((vw - cw) / 2), sy: Math.round((vh - ch) / 2), cw, ch, ow, oh, k };
    }
    function drawTo(g, geo) {
      const { sx, sy, cw, ch, ow, oh, k } = geo;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#000';
      g.fillRect(0, 0, ow, oh);
      g.translate(ow / 2, oh / 2);
      g.rotate((s.rotate * Math.PI) / 180);
      g.scale((s.mirror ? -1 : 1) * k, (s.flipV ? -1 : 1) * k);
      g.drawImage(video, sx, sy, cw, ch, -cw / 2, -ch / 2, cw, ch);
    }

    // ---------- recording ----------
    let recorder = null;
    let recTimer = 0;
    let recStart = 0;
    let micStream = null;
    let drawing = false;

    async function startRec() {
      if (!stream || !video.videoWidth) { toast('Turn the camera on first.'); return; }
      const fmt = recFormat();
      if (!fmt) { toast('This browser can’t record video. Try Chrome or Edge.'); return; }
      const geo = geometry(REC_SIDE);
      const c = document.createElement('canvas');
      c.width = geo.ow;
      c.height = geo.oh;
      const g = c.getContext('2d');
      drawTo(g, geo);
      const out = c.captureStream(30);
      if (s.sound) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          micStream.getAudioTracks().forEach((t) => out.addTrack(t));
        } catch { toast('Microphone not available — recording without sound.'); }
      }
      // Copy each camera frame (turned/flipped/zoomed as shown) onto the canvas being recorded.
      drawing = true;
      const loop = () => {
        if (!drawing) return;
        drawTo(g, geo);
        if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(loop); else requestAnimationFrame(loop);
      };
      loop();
      const chunks = [];
      try {
        recorder = new MediaRecorder(out, { mimeType: fmt.mime, videoBitsPerSecond: 4_000_000 });
      } catch {
        recorder = new MediaRecorder(out);
      }
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        drawing = false;
        out.getTracks().forEach((t) => t.stop());
        micStream?.getTracks().forEach((t) => t.stop());
        micStream = null;
        const secs = (Date.now() - recStart) / 1000;
        const blob = new Blob(chunks, { type: (recorder?.mimeType || fmt.mime).split(';')[0] });
        recorder = null;
        if (blob.size) finished(blob, fmt.ext, secs);
      };
      recorder.start(1000);
      recStart = Date.now();
      play('tick');
      recBtn.classList.add('on');
      recBtn.title = 'Stop recording';
      recBtn.setAttribute('aria-label', 'Stop recording');
      recBadge.hidden = false;
      const tick = () => {
        const t = Math.floor((Date.now() - recStart) / 1000);
        const txt = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
        recBtn.lastChild.textContent = txt;
        recBadge.textContent = `● REC ${txt}`;
        if (t >= MAX_REC_S) stopRec();
      };
      tick();
      recTimer = setInterval(tick, 250);
    }
    function stopRec() {
      clearInterval(recTimer);
      recBtn.classList.remove('on');
      recBtn.title = 'Record a video clip';
      recBtn.setAttribute('aria-label', 'Record a video clip');
      recBtn.lastChild.textContent = '';
      recBadge.hidden = true;
      if (recorder?.state === 'recording') recorder.stop();
    }
    async function finished(blob, ext, secs) {
      s.step = (s.step || 0) + 1;
      ctx.save();
      const label = `Step ${s.step}`;
      const name = `clip_${stamp()}.${ext}`;
      const keep = async () => {
        const id = uid('asset');
        await db.putAsset({ id, blob, name, type: blob.type });
        ctx.addWidget?.('videoloop', { clipAssetId: id, fileName: name, label });
      };
      const mb = (blob.size / 1e6).toFixed(1);
      const save = () => downloadBlob(blob, name);
      if (s.afterRec === 'download') {
        save();
        toast(`Saved ${name} (${Math.round(secs)} s, ${mb} MB) to your Downloads.`, { action: '🔁 Loop in a new widget', onAction: keep, ms: 9000 });
      } else {
        await keep();
        if (s.afterRec === 'both') { save(); toast(`${label} is looping on the board and saved to Downloads.`); }
        else toast(`${label} is looping on the board (${Math.round(secs)} s).`, { action: '⬇ Download', onAction: save, ms: 7000 });
      }
    }

    /** Capture the frame at the camera's full resolution (cropped to the zoom, turned and mirrored as shown). */
    async function photo() {
      if (!stream || !video.videoWidth) { toast('Turn the camera on first.'); return; }
      const geo = geometry();
      const c = document.createElement('canvas');
      c.width = geo.ow;
      c.height = geo.oh;
      drawTo(c.getContext('2d'), geo);
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
      play('pop');
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95));
      if (!blob) return;
      const name = `photo_${stamp()}.jpg`;
      const size = `${c.width}×${c.height}`;
      const keep = async () => {
        const id = uid('asset');
        await db.putAsset({ id, blob, name, type: 'image/jpeg' });
        ctx.addWidget?.('image', { imageAssetId: id, fit: 'contain', caption: '' });
      };
      const save = () => downloadBlob(blob, name);
      const mode = s.afterPhoto || 'board';
      if (mode === 'download') {
        save();
        toast(`Saved ${name} (${size}) to your Downloads.`, { action: '📌 Put in a new widget', onAction: keep, ms: 9000 });
      } else {
        await keep();
        if (mode === 'both') { save(); toast(`Photo added to the board and saved to Downloads (${size}).`); }
        else toast(`Photo added to the board (${size}).`, { action: '⬇ Download', onAction: save, ms: 7000 });
      }
    }

    apply();

    return {
      destroy: stop,
      resize: apply,
      async openSettings() {
        const camSel = h('select', { 'aria-label': 'Camera' });
        camSel.append(h('option', { value: '' }, 'Default camera'));
        try {
          const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
          devices.forEach((d, i) => {
            const o = h('option', { value: d.deviceId }, d.label || `Camera ${i + 1}`);
            if (d.deviceId === s.deviceId) o.selected = true;
            camSel.append(o);
          });
        } catch { /* no permission yet */ }
        camSel.addEventListener('change', () => { s.deviceId = camSel.value; ctx.save(); start(); });
        panel(ctx, 'Webcam',
          field('Camera (document cameras show up here too)', camSel),
          h('p', { class: 'hint' }, 'Camera names appear after you turn the camera on once.'),
          checkbox('Fill the box (crop the edges)', s.fill, (v) => { s.fill = v; apply(); ctx.save(); }),
          checkbox('Flip left ↔ right (like a mirror — turn off for documents)', s.mirror, (v) => { s.mirror = v; apply(); ctx.save(); }),
          checkbox('Flip upside down (for a camera mounted the other way up)', s.flipV, (v) => { s.flipV = v; apply(); ctx.save(); }),
          field('Rotate', select([[0, 'No rotation'], [90, '90° right'], [180, '180° (upside down)'], [270, '90° left']], s.rotate, (v) => { s.rotate = Number(v); apply(); ctx.save(); })),
          field('📸 When you take a photo', select([['board', 'Put it in a new widget'], ['download', 'Save it to Downloads'], ['both', 'Both']], s.afterPhoto || 'board', (v) => { s.afterPhoto = v; ctx.save(); })),
          h('p', { class: 'hint' }, 'Photos are full resolution (as zoomed, turned and flipped). Nothing is uploaded.'),
          h('h4', {}, '⏺ Recording'),
          field('When you stop recording', select([['board', 'Loop it in a new widget'], ['download', 'Save it to Downloads'], ['both', 'Both']], s.afterRec, (v) => { s.afterRec = v; ctx.save(); })),
          checkbox('Record sound from the microphone too', s.sound, (v) => { s.sound = v; ctx.save(); }),
          h('div', { class: 'row' },
            h('span', {}, `Next clip: Step ${(s.step || 0) + 1}`),
            h('button', { class: 'btn small', onclick: (e) => { s.step = 0; ctx.save(); e.target.previousSibling.textContent = 'Next clip: Step 1'; } }, 'Start again at Step 1'),
          ),
          h('p', { class: 'hint' }, `Clips are up to ${MAX_REC_S / 60} minutes, recorded as you see them (zoomed, turned, flipped). Great for one step of a craft per clip.`),
        );
      },
    };
  },
};
