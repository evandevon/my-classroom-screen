import { h, uid, downloadBlob, pickFile, toast } from '../util.js';
import { db, assetURL } from '../storage.js';
import { panel, checkbox, field, select, textInput } from './_common.js';

// Video loop: plays one short clip over and over (e.g. one step of an origami fold).
// Clips come from the webcam's record button or a video file; they stay in this browser.

export default {
  type: 'videoloop',
  title: 'Video loop',
  icon: '🔁',
  group: 'core',
  size: [420, 340],
  hasSettings: true,
  defaultState: () => ({ clipAssetId: null, fileName: '', label: '', speed: 1, muted: true, fit: 'contain', paused: false }),

  mount(ctx) {
    const s = ctx.state;
    const video = h('video', { class: 'vl-video', loop: true, muted: true, playsinline: true, autoplay: true });
    video.muted = true;
    const label = h('div', { class: 'vl-label' });
    const playBtn = h('button', { class: 'btn small', onclick: () => { s.paused = !s.paused; ctx.save(); sync(); } });
    const speedBtn = h('button', { class: 'btn small', title: 'Playback speed', onclick: () => { s.speed = s.speed === 1 ? 0.5 : s.speed === 0.5 ? 0.25 : 1; ctx.save(); sync(); } });
    const soundBtn = h('button', { class: 'btn small', onclick: () => { s.muted = !s.muted; ctx.save(); sync(); } });
    const progress = h('div', { class: 'vl-progress' }, h('i'));
    const bar = h('div', { class: 'vl-bar' },
      playBtn,
      h('button', { class: 'btn small', title: 'Back to the start', 'aria-label': 'Back to the start', onclick: () => { video.currentTime = 0; } }, '⏮'),
      speedBtn,
      soundBtn,
      h('span', { class: 'vl-spacer' }),
      h('button', { class: 'btn small', title: 'Download this clip', 'aria-label': 'Download this clip', onclick: download }, '⬇'),
    );
    const stage = h('div', { class: 'vl-stage', onclick: () => { s.paused = !s.paused; ctx.save(); sync(); } }, video, label);
    const empty = h('div', { class: 'empty' },
      h('p', {}, 'Loop a short video clip'),
      h('button', { class: 'btn primary', onclick: chooseFile }, '🎞️ Choose a video file'),
      h('button', { class: 'btn', onclick: () => ctx.addWidget?.('webcam', {}) }, '📷 Record one with the webcam'),
      h('p', { class: 'hint' }, 'Tip: press ⏺ on the webcam widget and each recording appears here, as Step 1, Step 2…'),
    );
    const wrap = h('div', { class: 'vl' }, stage, progress, bar, empty);
    ctx.view.append(wrap);

    let raf = 0;
    const step = () => {
      if (video.duration) progress.firstChild.style.width = `${(video.currentTime / video.duration) * 100}%`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    async function chooseFile() {
      const file = await pickFile('video/*');
      if (!file) return;
      if (file.size > 300e6) { toast('That video is very big — choose a shorter clip (under 300 MB).'); return; }
      const id = uid('asset');
      await db.putAsset({ id, blob: file, name: file.name, type: file.type });
      s.clipAssetId = id;
      s.fileName = file.name;
      if (!s.label) s.label = file.name.replace(/\.[^.]+$/, '');
      ctx.save();
      load();
    }
    async function download() {
      const a = s.clipAssetId && (await db.getAsset(s.clipAssetId));
      if (a) downloadBlob(a.blob, a.name || s.fileName || 'clip.webm');
    }

    function sync() {
      video.playbackRate = s.speed;
      video.muted = s.muted;
      video.style.objectFit = s.fit;
      if (s.paused) video.pause(); else video.play().catch(() => {});
      playBtn.textContent = s.paused ? '▶' : '❚❚';
      playBtn.title = s.paused ? 'Play' : 'Pause';
      speedBtn.textContent = s.speed === 1 ? '1×' : s.speed === 0.5 ? '½×' : '¼×';
      soundBtn.textContent = s.muted ? '🔇' : '🔊';
      soundBtn.title = s.muted ? 'Sound on' : 'Sound off';
      label.textContent = s.label;
      label.hidden = !s.label;
      wrap.classList.toggle('paused', s.paused);
    }
    async function load() {
      const url = s.clipAssetId ? await assetURL(s.clipAssetId) : null;
      empty.hidden = !!url;
      stage.hidden = bar.hidden = progress.hidden = !url;
      if (url && video.src !== url) video.src = url;
      sync();
    }
    load();

    return {
      destroy: () => { cancelAnimationFrame(raf); video.pause(); video.removeAttribute('src'); },
      openSettings() {
        panel(ctx, 'Video loop',
          field('Label on the clip', textInput(s.label, (v) => { s.label = v; ctx.save(); sync(); }, { placeholder: 'e.g. Step 3: fold in half' })),
          field('Speed', select([[1, 'Normal'], [0.5, 'Half speed'], [0.25, 'Quarter speed']], s.speed, (v) => { s.speed = Number(v); ctx.save(); sync(); })),
          field('Fit', select([['contain', 'Show the whole picture'], ['cover', 'Fill the box (crop edges)']], s.fit, (v) => { s.fit = v; ctx.save(); sync(); })),
          checkbox('Sound on (if the clip has sound)', !s.muted, (v) => { s.muted = !v; ctx.save(); sync(); }),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => { ctx.closeSettings(); chooseFile(); } }, '🎞️ Use a different video file'),
            s.clipAssetId ? h('button', { class: 'btn', onclick: download }, '⬇ Download clip') : null,
          ),
          h('p', { class: 'hint' }, 'The clip stays in this browser. It’s included when you download the screen as a file, but not in share links.'),
        );
      },
      closeSettings: sync,
    };
  },
};
