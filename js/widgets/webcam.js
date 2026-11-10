import { h, uid, toast, downloadBlob } from '../util.js';
import { db } from '../storage.js';
import { play } from '../sound.js';
import { panel, checkbox, field } from './_common.js';

// Webcam / document camera: live view, freeze, mirror, rotate, zoom, and full-resolution photos
// saved to this device. The picture never leaves the computer.

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
  size: [560, 420],
  hasSettings: true,
  defaultState: () => ({ deviceId: '', mirror: false, rotate: 0, zoom: 1, fill: false }),

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
    const controls = h('div', { class: 'cam-controls' },
      h('button', { class: 'btn primary big cam-shot', title: 'Take a photo (full resolution) and save it', onclick: photo }, '📸'),
      freezeBtn,
      h('button', { class: 'btn small', title: 'Mirror left/right', onclick: () => { s.mirror = !s.mirror; apply(); ctx.save(); } }, '⇋'),
      h('button', { class: 'btn small', title: 'Rotate', onclick: () => { s.rotate = (s.rotate + 90) % 360; apply(); ctx.save(); } }, '⟳'),
      h('label', { class: 'cam-zoomwrap', title: 'Zoom' }, '🔍', zoomIn),
      status,
    );
    const startBtn = h('button', { class: 'btn primary big' }, '📷 Turn on camera');
    const msg = h('p', { class: 'hint' }, 'The picture stays on this computer — nothing is recorded or sent anywhere.');
    const overlay = h('div', { class: 'empty cam-start' }, startBtn, msg);
    startBtn.addEventListener('click', start);
    ctx.view.append(h('div', { class: 'cam' }, frame, flash, controls, overlay));

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
    function apply() {
      const sideways = s.rotate % 180 !== 0;
      video.style.transform = `rotate(${s.rotate}deg) scale(${(s.mirror ? -1 : 1) * s.zoom}, ${s.zoom})`;
      video.style.objectFit = s.fill ? 'cover' : 'contain';
      frame.classList.toggle('sideways', sideways);
      zoomIn.value = s.zoom;
    }

    /** Capture the frame at the camera's full resolution (cropped to the zoom, turned and mirrored as shown). */
    async function photo() {
      if (!stream || !video.videoWidth) { toast('Turn the camera on first.'); return; }
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = Math.round(vw / s.zoom);
      const ch = Math.round(vh / s.zoom);
      const sx = Math.round((vw - cw) / 2);
      const sy = Math.round((vh - ch) / 2);
      const sideways = s.rotate % 180 !== 0;
      const c = document.createElement('canvas');
      c.width = sideways ? ch : cw;
      c.height = sideways ? cw : ch;
      const g = c.getContext('2d');
      g.translate(c.width / 2, c.height / 2);
      g.rotate((s.rotate * Math.PI) / 180);
      if (s.mirror) g.scale(-1, 1);
      g.drawImage(video, sx, sy, cw, ch, -cw / 2, -ch / 2, cw, ch);
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
      play('pop');
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95));
      if (!blob) return;
      const name = `photo_${stamp()}.jpg`;
      downloadBlob(blob, name);
      toast(`Saved ${name} (${c.width}×${c.height}) to your Downloads.`, {
        action: '📌 Show on board',
        onAction: async () => {
          const id = uid('asset');
          await db.putAsset({ id, blob, name, type: 'image/jpeg' });
          ctx.addWidget?.('image', { imageAssetId: id, fit: 'contain', caption: '' });
        },
        ms: 9000,
      });
    }

    return {
      destroy: stop,
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
          checkbox('Mirror left/right (like a mirror — turn off for documents)', s.mirror, (v) => { s.mirror = v; apply(); ctx.save(); }),
          h('p', { class: 'hint' }, '📸 saves a full-resolution JPEG to your Downloads folder. Nothing is uploaded.'),
        );
      },
    };
  },
};
