import { h, uid, pickFile } from '../util.js';
import { db, assetURL } from '../storage.js';
import { panel, textInput, checkbox, field, fmtTime } from './_common.js';
import { toEmbedURL } from './embed.js';

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
    const player = h('div', { class: 'audio-player' },
      labelEl,
      h('div', { class: 'audio-main' },
        h('button', { class: 'btn big', 'aria-label': 'Back 10 seconds', onclick: () => (audio.currentTime = Math.max(0, audio.currentTime - 10)) }, '⟲10'),
        playBtn,
        h('button', { class: 'btn big', 'aria-label': 'Forward 10 seconds', onclick: () => (audio.currentTime += 10) }, '10⟳'),
      ),
      h('div', { class: 'audio-bar' }, seek, timeEl),
      h('label', { class: 'audio-vol' }, '🔈', vol),
    );
    const frameHost = h('div', { class: 'embed-host' });
    const empty = h('div', { class: 'empty' },
      h('p', {}, 'Play a sound or song'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: upload }, 'Upload audio'),
        h('button', { class: 'btn', onclick: () => ctx.openSettings() }, 'Paste a link'),
      ),
      h('p', { class: 'hint' }, 'MP3 · WAV · M4A · Google Drive · YouTube · Spotify'),
    );
    ctx.view.append(h('div', { class: 'audio' }, empty, player, frameHost));

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
      destroy: () => { audio.pause(); audio.src = ''; },
      openSettings() {
        panel(ctx, 'Audio settings',
          h('button', { class: 'btn primary', onclick: upload }, 'Upload audio from this device'),
          field('…or audio link', textInput(s.url, (v) => { s.url = v.trim(); s.audioAssetId = null; ctx.save(); }, { placeholder: 'https://… (mp3, Google Drive, YouTube)' })),
          field('Label', textInput(s.label, (v) => { s.label = v; ctx.save(); })),
          checkbox('Loop', s.loop, (v) => { s.loop = v; ctx.save(); }),
        );
      },
      closeSettings: render,
    };
  },
};
