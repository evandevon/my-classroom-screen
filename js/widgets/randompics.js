import { h, uid, setKids, toast } from '../util.js';
import { db, assetURL } from '../storage.js';
import { play } from '../sound.js';
import { panel, checkbox, field, select } from './_common.js';

// Random picture: choose a folder of pictures from the computer; show one at random.
// Pictures are shrunk to screen size and kept in this browser only (nothing is uploaded).

const MAX_PICS = 400;
const MAX_SIDE = 1920;

/** Shrink big photos so hundreds can be kept without filling the browser's storage. */
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5e6) { bmp.close?.(); return file; }
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return (await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.86))) || file;
  } catch {
    return file; // unusual formats: keep as they are
  }
}

/** Delete pictures nothing uses any more (a duplicated widget or screen may still share them). */
function release(ids) {
  if (!ids.length) return;
  setTimeout(async () => {
    try {
      const used = new Set();
      for (const sc of await db.listScreens()) {
        if (sc.background?.assetId) used.add(sc.background.assetId);
        for (const w of sc.widgets || []) {
          for (const [k, v] of Object.entries(w.state || {})) {
            if (k.endsWith('AssetId') && v) used.add(v);
            if (k.endsWith('AssetIds') && Array.isArray(v)) v.forEach((x) => used.add(x));
          }
        }
      }
      for (const id of ids) if (!used.has(id)) await db.deleteAsset(id);
    } catch { /* storage tidy-up is best effort */ }
  }, 2000);
}

const niceName = (n) => n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

export default {
  type: 'randompics',
  title: 'Random picture',
  icon: '🎴',
  group: 'core',
  size: [520, 420],
  hasSettings: true,
  assetCompanions: { picAssetIds: ['names', 'folder', 'bag', 'current'] },
  defaultState: () => ({ picAssetIds: [], names: [], folder: '', current: -1, bag: [], every: 0, fit: 'contain', caption: false, blur: false }),

  mount(ctx) {
    const s = ctx.state;
    const img = h('img', { class: 'rp-img', alt: '' });
    const cap = h('div', { class: 'rp-cap' });
    const count = h('span', { class: 'rp-count' });
    const stage = h('button', { class: 'rp-stage', title: 'Tap for another picture', onclick: () => (blurred ? reveal() : next()) }, img);
    const bar = h('div', { class: 'rp-bar' },
      h('button', { class: 'btn primary', onclick: () => next() }, '🎲 Another'),
      count,
      h('button', { class: 'btn small', onclick: () => pickFolder(), title: 'Choose a different folder' }, '📁'),
    );
    const progress = h('div', { class: 'rp-progress', hidden: true });
    const empty = h('div', { class: 'empty' },
      h('p', {}, 'Show a random picture from a folder'),
      h('button', { class: 'btn primary big', onclick: () => pickFolder() }, '📁 Choose a folder of pictures'),
      h('button', { class: 'btn', onclick: () => pickFiles() }, 'or choose some pictures'),
      h('p', { class: 'hint' }, 'They stay on this computer — nothing is uploaded. (A Google Drive folder that’s synced to this computer works too.)'),
    );
    const wrap = h('div', { class: 'rp' }, stage, cap, bar, empty, progress);
    ctx.view.append(wrap);
    wrap.addEventListener('dragover', (e) => e.preventDefault());
    wrap.addEventListener('drop', (e) => { e.preventDefault(); addFiles([...e.dataTransfer.files], 'Dropped pictures'); });

    let timer;
    let blurred = false;

    function chooser(dir) {
      return new Promise((resolve) => {
        const input = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
        if (dir) { input.webkitdirectory = true; input.setAttribute('webkitdirectory', ''); }
        input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
        input.addEventListener('cancel', () => { resolve([]); input.remove(); });
        document.body.append(input);
        input.click();
      });
    }
    async function pickFolder() {
      const files = await chooser(true);
      const folder = files[0]?.webkitRelativePath?.split('/')[0] || 'Pictures';
      addFiles(files, folder);
    }
    async function pickFiles() {
      addFiles(await chooser(false), 'Chosen pictures');
    }

    async function addFiles(all, folder) {
      const files = all.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic|avif)$/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, MAX_PICS);
      if (!files.length) { if (all.length) toast('No pictures found in that folder.'); return; }
      if (s.picAssetIds.length && !confirm(`Replace the ${s.picAssetIds.length} pictures with ${files.length} from “${folder}”?`)) return;
      const old = s.picAssetIds;
      const ids = [];
      const names = [];
      progress.hidden = false;
      for (let i = 0; i < files.length; i++) {
        progress.textContent = `Adding pictures… ${i + 1} of ${files.length}`;
        const blob = await shrink(files[i]);
        const id = uid('asset');
        await db.putAsset({ id, blob, name: files[i].name, type: blob.type || files[i].type });
        ids.push(id);
        names.push(niceName(files[i].name));
      }
      progress.hidden = true;
      s.picAssetIds = ids;
      s.names = names;
      s.folder = folder;
      s.bag = [];
      s.current = -1;
      ctx.save();
      release(old);
      if (all.length > MAX_PICS) toast(`Only the first ${MAX_PICS} pictures were added.`);
      next();
    }

    /** Random without repeats until every picture has been shown. */
    function next() {
      const n = s.picAssetIds.length;
      if (!n) return;
      if (!s.bag.length) {
        s.bag = [...Array(n).keys()].sort(() => Math.random() - 0.5);
        if (n > 1 && s.bag[0] === s.current) s.bag.push(s.bag.shift());
      }
      s.current = s.bag.shift();
      ctx.save();
      play('pop');
      show(true);
    }
    function reveal() {
      blurred = false;
      img.classList.remove('blurred');
      play('ding');
    }

    async function show(fresh = false) {
      const has = s.picAssetIds.length > 0 && s.current >= 0;
      empty.hidden = s.picAssetIds.length > 0;
      stage.hidden = !has;
      bar.hidden = !s.picAssetIds.length;
      cap.hidden = !(has && s.caption);
      if (!has) return;
      const url = await assetURL(s.picAssetIds[s.current]);
      img.classList.remove('fade');
      void img.offsetWidth;
      if (url) img.src = url;
      img.classList.add('fade');
      img.style.objectFit = s.fit;
      img.alt = s.names[s.current] || 'Picture';
      blurred = fresh && s.blur;
      img.classList.toggle('blurred', blurred);
      cap.textContent = s.names[s.current] || '';
      const seen = s.picAssetIds.length - s.bag.length;
      setKids(count, `${s.folder ? `${s.folder} · ` : ''}${seen} of ${s.picAssetIds.length}`);
    }

    function startTimer() {
      clearInterval(timer);
      if (s.every > 0) timer = setInterval(next, s.every * 1000);
    }

    if (s.picAssetIds.length && s.current < 0) next(); else show();
    startTimer();

    return {
      destroy: () => clearInterval(timer),
      openSettings() {
        panel(ctx, 'Random picture',
          h('p', {}, s.picAssetIds.length ? `${s.picAssetIds.length} pictures from “${s.folder}”.` : 'No pictures yet.'),
          h('div', { class: 'row' },
            h('button', { class: 'btn primary', onclick: () => { ctx.closeSettings(); pickFolder(); } }, '📁 Choose a folder'),
            h('button', { class: 'btn', onclick: () => { ctx.closeSettings(); pickFiles(); } }, 'Choose pictures'),
          ),
          field('Change picture by itself', select([[0, 'No — only when tapped'], [10, 'Every 10 seconds'], [30, 'Every 30 seconds'], [60, 'Every minute'], [300, 'Every 5 minutes']], s.every, (v) => { s.every = Number(v); ctx.save(); startTimer(); })),
          field('Fit', select([['contain', 'Show the whole picture'], ['cover', 'Fill the box (crop edges)']], s.fit, (v) => { s.fit = v; ctx.save(); show(); })),
          checkbox('Show the file name as a caption', s.caption, (v) => { s.caption = v; ctx.save(); show(); }),
          checkbox('Mystery mode: start blurry, tap to reveal', s.blur, (v) => { s.blur = v; ctx.save(); }),
          h('p', { class: 'hint' }, 'Big photos are shrunk to screen size to save space. They stay in this browser only and aren’t put in share links; “Download screen” includes them.'),
          s.picAssetIds.length ? h('button', { class: 'btn small danger', onclick: () => {
            if (!confirm('Remove all the pictures from this widget?')) return;
            const old = s.picAssetIds;
            Object.assign(s, { picAssetIds: [], names: [], folder: '', bag: [], current: -1 });
            ctx.save(); release(old); ctx.closeSettings(); show();
          } }, '🗑 Remove the pictures') : null,
        );
      },
      closeSettings: () => show(),
    };
  },
};
