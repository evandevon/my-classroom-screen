// App shell: screens, menu, dock, backgrounds, sharing.

import { Board } from './board.js';
import { db, assetURL } from './storage.js';
import { WIDGETS, GROUPS, byGroup } from './widgets/index.js';
import { TEMPLATES, GRADIENTS, SOLIDS } from './templates.js';
import { makeShareLink, readShareHash, buildProjectFile, importProjectFile, prepareImportedScreen } from './share.js';
import { h, uid, debounce, toast, pickFile, downloadBlob } from './util.js';

const $ = (sel) => document.querySelector(sel);
const boardEl = $('#board');
const nameBtn = $('#screen-name');

let screen = null;

const persist = debounce(async () => {
  if (!screen) return;
  screen.updated = Date.now();
  try {
    await db.putScreen(screen);
  } catch (e) {
    console.error(e);
    toast('Could not save — is storage full or blocked?');
  }
}, 400);

const board = new Board(boardEl, { onChange: () => persist() });

// ---------- screens ----------
function newScreenFrom(tpl, name) {
  const s = {
    id: uid('screen'),
    name: name || tpl.name,
    updated: Date.now(),
    background: structuredClone(tpl.background),
    widgets: [],
  };
  let z = 1;
  for (const w of tpl.widgets) {
    const def = WIDGETS[w.type];
    s.widgets.push({
      id: uid('w'),
      type: w.type,
      x: w.x, y: w.y, w: w.w, h: w.h,
      z: z++,
      locked: false,
      state: { ...def.defaultState(), ...(w.state || {}) },
    });
  }
  return s;
}

async function openScreen(s) {
  persist.flush();
  screen = s;
  board.load(screen);
  await applyBackground();
  nameBtn.textContent = screen.name;
  document.title = `${screen.name} · My Classroom Screen`;
  db.setMeta('lastScreen', screen.id);
}

async function applyBackground() {
  const bg = screen.background || { type: 'gradient', value: 'sky' };
  boardEl.style.backgroundImage = '';
  boardEl.style.backgroundColor = '';
  if (bg.type === 'color') boardEl.style.backgroundColor = bg.value;
  else if (bg.type === 'gradient') boardEl.style.backgroundImage = GRADIENTS[bg.value] || GRADIENTS.sky;
  else if (bg.type === 'image') {
    const url = bg.assetId ? await assetURL(bg.assetId) : /^https?:\/\//.test(bg.value || '') ? bg.value : null;
    if (url) boardEl.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
  }
  const dark = (bg.type === 'gradient' && ['night', 'forest', 'ocean'].includes(bg.value)) || (bg.type === 'color' && /^#(0|1|2)/.test(bg.value));
  document.body.classList.toggle('dark-bg', dark);
}

async function sortedScreens() {
  return (await db.listScreens()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

// ---------- modal helper ----------
function modal(title, ...content) {
  const dlg = h('dialog', { class: 'modal' },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'w-btn', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕')),
    h('div', { class: 'modal-body' }, ...content),
  );
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

function ask(title, value = '') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', value });
    let done = false;
    const ok = () => { done = true; resolve(input.value.trim() || null); dlg.close(); };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
    const dlg = modal(title, input, h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: ok }, 'OK')));
    dlg.addEventListener('close', () => !done && resolve(null));
    input.select();
  });
}

// ---------- menu drawer ----------
const drawer = $('#drawer');
function closeDrawer() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
}
async function openDrawer() {
  await renderDrawer();
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
}
$('#menu-btn').addEventListener('click', () => (drawer.classList.contains('open') ? closeDrawer() : openDrawer()));
nameBtn.addEventListener('click', async () => {
  const n = await ask('Rename this screen', screen.name);
  if (n) { screen.name = n; nameBtn.textContent = n; document.title = `${n} · My Classroom Screen`; persist(); }
});

async function renderDrawer() {
  const screens = await sortedScreens();
  const list = h('ul', { class: 'screen-list' },
    ...screens.map((s) =>
      h('li', { class: s.id === screen.id ? 'current' : '' },
        h('button', { class: 'screen-open', onclick: async () => { await openScreen((await db.getScreen(s.id)) || s); closeDrawer(); } },
          h('span', { class: 'sname' }, s.name),
          h('span', { class: 'smeta' }, `${s.widgets.length} widget${s.widgets.length === 1 ? '' : 's'}`),
        ),
        h('button', { class: 'w-btn', title: 'Rename', 'aria-label': `Rename ${s.name}`, onclick: () => renameScreen(s) }, '✎'),
        h('button', { class: 'w-btn', title: 'Duplicate', 'aria-label': `Duplicate ${s.name}`, onclick: () => duplicateScreen(s) }, '⧉'),
        h('button', { class: 'w-btn close', title: 'Delete', 'aria-label': `Delete ${s.name}`, onclick: () => deleteScreen(s) }, '🗑'),
      ),
    ),
  );

  drawer.replaceChildren(
    h('div', { class: 'drawer-head' }, h('h2', {}, 'My screens'), h('button', { class: 'w-btn', 'aria-label': 'Close menu', onclick: closeDrawer }, '✕')),
    h('button', { class: 'btn primary wide', onclick: newScreenDialog }, '+ New screen'),
    list,
    h('h3', {}, 'This screen'),
    h('div', { class: 'menu-grid' },
      menuBtn('🎨', 'Background', backgroundDialog),
      menuBtn('🔗', 'Share link', shareDialog),
      menuBtn('⬇', 'Download screen', () => exportScreens([screen], screen.name)),
      menuBtn('🧹', 'Clear widgets', () => { if (confirm('Remove all widgets from this screen?')) board.clearAll(); }),
    ),
    h('h3', {}, 'All screens'),
    h('div', { class: 'menu-grid' },
      menuBtn('📂', 'Open project file', importDialog),
      menuBtn('💾', 'Download all', async () => exportScreens(await sortedScreens(), 'my-classroom-screens')),
    ),
    h('h3', {}, 'Options'),
    h('div', { class: 'stack' },
      toggle('Snap widgets to a grid', board.snap, (v) => { board.snap = v; db.setMeta('snap', v); }),
      toggle('Hide widget title bars (tap a widget to show)', document.body.classList.contains('clean'), (v) => { document.body.classList.toggle('clean', v); db.setMeta('clean', v); }),
      toggle('Large buttons', document.body.classList.contains('large'), (v) => { document.body.classList.toggle('large', v); db.setMeta('large', v); }),
    ),
    h('p', { class: 'hint' }, 'Everything is saved automatically in this browser. Use “Download all” now and then as a backup.'),
  );
}
const menuBtn = (icon, label, onclick) => h('button', { class: 'menu-btn', onclick }, h('span', { class: 'mi' }, icon), label);
function toggle(label, checked, onChange) {
  const c = h('input', { type: 'checkbox', onchange: (e) => onChange(e.target.checked) });
  c.checked = checked;
  return h('label', { class: 'check' }, c, h('span', {}, label));
}

async function renameScreen(s) {
  const n = await ask('Rename screen', s.name);
  if (!n) return;
  const full = (await db.getScreen(s.id)) || s;
  full.name = n;
  if (full.id === screen.id) { screen.name = n; nameBtn.textContent = n; persist.flush(); }
  else await db.putScreen(full);
  renderDrawer();
}
async function duplicateScreen(s) {
  persist.flush();
  const full = s.id === screen.id ? screen : (await db.getScreen(s.id)) || s;
  const copy = prepareImportedScreen(full, Object.fromEntries(assetIds(full).map((i) => [i, i])));
  copy.name = `${full.name} (copy)`;
  await db.putScreen(copy);
  renderDrawer();
}
const assetIds = (s) => [s.background?.assetId, ...s.widgets.flatMap((w) => Object.entries(w.state || {}).filter(([k, v]) => k.endsWith('AssetId') && v).map(([, v]) => v))].filter(Boolean);

async function deleteScreen(s) {
  if (!confirm(`Delete “${s.name}”? This can’t be undone.`)) return;
  await db.deleteScreen(s.id);
  if (s.id === screen.id) {
    const rest = await sortedScreens();
    if (rest.length) await openScreen(rest[0]);
    else {
      const fresh = newScreenFrom(TEMPLATES[0], 'My screen');
      await db.putScreen(fresh);
      await openScreen(fresh);
    }
  }
  renderDrawer();
}

function newScreenDialog() {
  const dlg = modal('New screen',
    h('div', { class: 'template-grid' },
      ...TEMPLATES.map((t) =>
        h('button', {
          class: 'template',
          style: { backgroundImage: GRADIENTS[t.background.value] || '' },
          onclick: async () => {
            dlg.close();
            const s = newScreenFrom(t, t.name === 'Blank screen' ? 'New screen' : t.name);
            await db.putScreen(s);
            await openScreen(s);
            closeDrawer();
          },
        }, h('span', { class: 'ti' }, t.icon), h('span', {}, t.name), h('small', {}, t.widgets.length ? `${t.widgets.length} widgets` : 'Start empty')),
      ),
    ),
  );
}

// ---------- background ----------
function backgroundDialog() {
  const set = async (bg) => {
    screen.background = bg;
    await applyBackground();
    persist();
  };
  const urlIn = h('input', { type: 'url', placeholder: 'https://… image link' });
  modal('Background',
    h('h3', {}, 'Gradients'),
    h('div', { class: 'bg-grid' },
      ...Object.entries(GRADIENTS).map(([k, v]) => h('button', { class: 'bg-swatch', style: { backgroundImage: v }, 'aria-label': k, title: k, onclick: () => set({ type: 'gradient', value: k }) })),
    ),
    h('h3', {}, 'Colours'),
    h('div', { class: 'bg-grid' },
      ...SOLIDS.map((c) => h('button', { class: 'bg-swatch', style: { background: c }, 'aria-label': c, onclick: () => set({ type: 'color', value: c }) })),
      (() => {
        const ci = h('input', { type: 'color', value: '#88ccee', 'aria-label': 'Custom colour', class: 'bg-swatch' });
        ci.addEventListener('input', () => set({ type: 'color', value: ci.value }));
        return ci;
      })(),
    ),
    h('h3', {}, 'Picture'),
    h('div', { class: 'row stretch' },
      h('button', {
        class: 'btn',
        onclick: async () => {
          const f = await pickFile('image/*');
          if (!f) return;
          const id = uid('asset');
          await db.putAsset({ id, blob: f, name: f.name, type: f.type });
          set({ type: 'image', assetId: id });
        },
      }, 'Upload picture'),
      urlIn,
      h('button', { class: 'btn', onclick: () => urlIn.value && set({ type: 'image', value: urlIn.value.trim() }) }, 'Use link'),
    ),
  );
}

// ---------- sharing ----------
function shareDialog() {
  persist.flush();
  const hasNames = screen.widgets.some((w) => (WIDGETS[w.type]?.privateKeys || []).some((k) => {
    const v = w.state[k];
    return v && (Array.isArray(v) ? v.length : String(v).trim().length);
  }));
  const out = h('textarea', { class: 'share-url', readonly: true, rows: 4 });
  const notes = h('p', { class: 'hint' });
  const includeNames = h('input', { type: 'checkbox' });
  const copyBtn = h('button', { class: 'btn primary' }, '📋 Copy link');
  const make = async () => {
    const { url, dropped, long } = await makeShareLink(screen, { includeNames: includeNames.checked });
    out.value = url;
    const bits = [];
    if (dropped.length) bits.push(`Not included in the link: ${dropped.join(', ')}. Use “Download screen” to share everything.`);
    if (long) bits.push('This link is very long and may not work in every app — a project file is safer.');
    bits.push(`${url.length.toLocaleString()} characters.`);
    notes.textContent = bits.join(' ');
  };
  includeNames.addEventListener('change', make);
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(out.value);
      copyBtn.textContent = '✔ Copied';
    } catch {
      out.select();
      document.execCommand('copy');
      copyBtn.textContent = '✔ Copied';
    }
    setTimeout(() => (copyBtn.textContent = '📋 Copy link'), 2000);
  });
  modal('Share this screen',
    h('p', {}, 'Anyone who opens this link gets their own copy of this screen layout.'),
    hasNames ? h('label', { class: 'check' }, includeNames, h('span', {}, 'Include student names (only share with colleagues at your school)')) : null,
    out,
    notes,
    h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => exportScreens([screen], screen.name) }, '⬇ Download as file instead'), copyBtn),
  );
  make();
}

async function exportScreens(screens, name) {
  persist.flush();
  const fresh = await Promise.all(screens.map(async (s) => (s.id === screen.id ? screen : (await db.getScreen(s.id)) || s)));
  const blob = await buildProjectFile(fresh);
  const safe = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'screen';
  downloadBlob(blob, `${safe}.classroom.json`);
}

async function importDialog() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  try {
    const screens = await importProjectFile(await f.text());
    for (const s of screens) await db.putScreen(s);
    await openScreen(screens[0]);
    toast(`Opened ${screens.length} screen${screens.length === 1 ? '' : 's'} from the file.`);
    renderDrawer();
  } catch (e) {
    toast(e.message || 'That file could not be opened.');
  }
}

// ---------- dock ----------
function buildDock() {
  const dock = $('#dock-items');
  for (const g of GROUPS) {
    dock.append(h('div', { class: 'dock-group', role: 'group', 'aria-label': g.label },
      ...byGroup(g.id).map((w) =>
        h('button', { class: 'dock-btn', title: `Add ${w.title}`, onclick: () => board.addWidget(w.type) },
          h('span', { class: 'di', 'aria-hidden': 'true' }, w.icon),
          h('span', { class: 'dl' }, w.title),
        ),
      ),
    ));
  }
  $('#dock-toggle').addEventListener('click', () => {
    const hidden = document.body.classList.toggle('dock-hidden');
    $('#dock-toggle').setAttribute('aria-expanded', String(!hidden));
    db.setMeta('dockHidden', hidden);
  });
}

// ---------- fullscreen + keys ----------
$('#fullscreen-btn').addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest('input, textarea, select, [contenteditable="true"]');
  if (e.key === 'Escape') closeDrawer();
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});
window.addEventListener('pagehide', () => persist.flush());
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && persist.flush());

// ---------- start ----------
async function init() {
  buildDock();
  board.snap = await db.getMeta('snap', false);
  document.body.classList.toggle('clean', await db.getMeta('clean', false));
  document.body.classList.toggle('large', await db.getMeta('large', false));
  document.body.classList.toggle('dock-hidden', await db.getMeta('dockHidden', false));

  let screens = await sortedScreens();
  let target = null;

  // Opened from a share link?
  try {
    const shared = await readShareHash();
    if (shared) {
      const s = prepareImportedScreen(shared);
      s.name = s.name || 'Shared screen';
      if (screens.some((x) => x.name === s.name)) s.name += ' (shared)';
      await db.putScreen(s);
      target = s;
      toast(`Added “${s.name}” to your screens.`);
    }
  } catch (e) {
    console.error(e);
    toast('That share link looks broken or incomplete.');
  }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);

  if (!target) {
    if (!screens.length) {
      const first = newScreenFrom(TEMPLATES[1], 'My first screen');
      await db.putScreen(first);
      screens = [first];
    }
    const lastId = await db.getMeta('lastScreen');
    target = screens.find((s) => s.id === lastId) || screens[0];
  }
  await openScreen(target);
}

init();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
