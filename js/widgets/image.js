import { h, uid, pickFile } from '../util.js';
import { db, assetURL } from '../storage.js';
import { panel, select, textInput, field } from './_common.js';

export default {
  type: 'image',
  title: 'Image',
  icon: '🖼️',
  group: 'core',
  size: [400, 320],
  hasSettings: true,
  defaultState: () => ({ url: '', imageAssetId: null, fit: 'contain', caption: '' }),

  mount(ctx) {
    const s = ctx.state;
    const img = h('img', { class: 'image-img', alt: '' });
    const cap = h('div', { class: 'image-caption' });
    const empty = h('div', { class: 'empty' },
      h('p', {}, 'Add a picture'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: upload }, 'Upload image'),
        h('button', { class: 'btn', onclick: () => ctx.openSettings() }, 'Paste a link'),
      ),
      h('p', { class: 'hint' }, 'or drag an image file here'),
    );
    const wrap = h('div', { class: 'image-wrap' }, empty, img, cap);
    ctx.view.append(wrap);

    async function setFile(file) {
      if (!file || !file.type.startsWith('image/')) return;
      const id = uid('asset');
      await db.putAsset({ id, blob: file, name: file.name, type: file.type });
      s.imageAssetId = id;
      s.url = '';
      ctx.save();
      render();
    }
    async function upload() {
      setFile(await pickFile('image/*'));
    }
    wrap.addEventListener('dragover', (e) => e.preventDefault());
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      setFile(e.dataTransfer.files[0]);
    });

    async function render() {
      const src = s.imageAssetId ? await assetURL(s.imageAssetId) : s.url;
      img.hidden = !src;
      empty.hidden = !!src;
      if (src) img.src = src;
      img.style.objectFit = s.fit;
      img.alt = s.caption || 'Image';
      cap.textContent = s.caption;
      cap.hidden = !s.caption;
    }
    render();

    return {
      openSettings() {
        panel(ctx, 'Image settings',
          h('button', { class: 'btn primary', onclick: upload }, 'Upload image from this device'),
          field('…or image web address', textInput(s.url, (v) => { s.url = v.trim(); s.imageAssetId = null; render(); ctx.save(); }, { placeholder: 'https://…' })),
          field('Fit', select([['contain', 'Show whole image'], ['cover', 'Fill the box (crop)']], s.fit, (v) => { s.fit = v; render(); ctx.save(); })),
          field('Caption', textInput(s.caption, (v) => { s.caption = v; render(); ctx.save(); })),
        );
      },
    };
  },
};
