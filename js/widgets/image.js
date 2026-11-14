import { h, uid, pickFile, downloadBlob, toast } from '../util.js';
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
        navigator.clipboard?.read ? h('button', { class: 'btn', title: 'Paste a picture you copied', onclick: pasteFromClipboard }, '📋 Paste') : null,
        h('button', { class: 'btn', onclick: () => ctx.openSettings() }, 'Paste a link'),
      ),
      h('p', { class: 'hint' }, 'or drag an image file here — or copy a picture and press Ctrl+V anywhere on the screen'),
    );
    // Download button for pictures kept on this computer (e.g. webcam photos).
    const dl = h('button', { class: 'btn small image-dl', title: 'Download this picture', 'aria-label': 'Download this picture', onclick: async () => {
      const a = s.imageAssetId && (await db.getAsset(s.imageAssetId));
      if (a) downloadBlob(a.blob, a.name || 'picture.jpg');
    } }, '⬇');
    const wrap = h('div', { class: 'image-wrap' }, empty, img, cap, dl);
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
    /** For smartboards with no keyboard: read a copied picture (or picture link) from the clipboard. */
    async function pasteFromClipboard() {
      try {
        for (const item of await navigator.clipboard.read()) {
          const type = item.types.find((t) => t.startsWith('image/'));
          if (type) { const blob = await item.getType(type); setFile(new File([blob], `pasted-picture.${type.split('/')[1]}`, { type })); return; }
          if (item.types.includes('text/plain')) {
            const t = (await (await item.getType('text/plain')).text()).trim();
            if (/^https?:\/\/\S+$/i.test(t)) { s.url = t; s.imageAssetId = null; ctx.save(); render(); return; }
          }
        }
        toast('There’s no picture on the clipboard. Copy one first (right-click a picture → Copy image).');
      } catch {
        toast('The browser didn’t allow reading the clipboard. Try Ctrl+V instead.');
      }
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
      dl.hidden = !s.imageAssetId;
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
