// App shell: screens, menu, dock, backgrounds, sharing.

import { Board } from './board.js';
import { themePicker } from './themes.js';
import { db, assetURL, sweepAssets, assetIdsOfScreen } from './storage.js';
import { WIDGETS, CATEGORIES } from './widgets/index.js';
import { TEMPLATES, GRADIENTS, SOLIDS } from './templates.js';
import { makeShareLink, readShareHash, buildProjectFile, importProjectFile, prepareImportedScreen } from './share.js';
import { h, uid, debounce, toast, pickFile, downloadBlob, enableMultiTouchTaps } from './util.js';
enableMultiTouchTaps();
import { showSoundHelp } from './help.js';
import { setLogContext } from './datalog.js';
import { showDataScreen } from './datascreen.js';
import { initClasses, currentClassName, fromTimeline, onClassChange, showClassPicker, showClassManager } from './classes.js';

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
board.onResume = () => resumeScreen();

// ---------- class (labels recorded data, supplies names to widgets) ----------
const classPill = $('#class-pill');
function updateClassPill() {
  const c = currentClassName();
  classPill.querySelector('span').textContent = c || 'Choose class';
  classPill.classList.toggle('unset', !c);
  classPill.title = c ? `Class: ${c}${fromTimeline() ? ' (from the Activity timeline)' : ''} — tap to change` : 'Choose a class (labels recorded data and gives widgets the class list)';
}
setLogContext({ getClass: currentClassName, getScreen: () => screen });
onClassChange(updateClassPill);
classPill.addEventListener('click', showClassPicker);

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
  updatePauseBadge();
  await applyBackground();
  nameBtn.textContent = screen.name;
  document.title = `${screen.name} · My Classroom Screen`;
  db.setMeta('lastScreen', screen.id);
  updateClassPill();
}

// ---------- widget theme for the whole screen ----------
function themeDialog() {
  modal('Widget theme',
    h('p', {}, 'Changes every widget on this screen, and new ones you add. Each widget can still have its own theme in its ⚙ settings.'),
    themePicker({ theme: screen.widgetTheme || 'light', shadow: !!screen.widgetShadow }, (c) => board.setAllThemes(c)),
  );
}

// ---------- pause / carry on ----------
/** Stop everything on this screen (timers keep their time left) so it can be picked up later. */
function pauseScreen() {
  if (screen.paused) return;
  const held = [];
  for (const rec of screen.widgets) {
    const line = WIDGETS[rec.type]?.hold?.(rec.state, rec);
    if (line) held.push(line);
  }
  screen.paused = { at: Date.now(), held };
  board.load(screen);
  persist.flush();
  updatePauseBadge();
}
function resumeScreen() {
  if (!screen.paused) return;
  for (const rec of screen.widgets) WIDGETS[rec.type]?.unhold?.(rec.state, rec);
  delete screen.paused;
  board.load(screen);
  persist.flush();
  updatePauseBadge();
}
function updatePauseBadge() {
  document.body.classList.toggle('screen-paused', !!screen.paused);
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
// Tap the screen name: quickly switch to another screen (like the class picker).
nameBtn.setAttribute('aria-haspopup', 'dialog');
nameBtn.title = 'Switch screen';
nameBtn.addEventListener('click', () => showScreenPicker());

async function showScreenPicker() {
  persist.flush();
  const screens = (await db.listScreens()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const dlg = modal('Which screen?',
    h('div', { class: 'class-grid screen-grid' },
      ...screens.map((s) => {
        const icons = [...new Set(s.widgets.map((w) => WIDGETS[w.type]?.icon).filter(Boolean))].slice(0, 6).join(' ');
        return h('button', {
          class: `class-tile screen-tile${s.id === screen.id ? ' on' : ''}`,
          'aria-current': s.id === screen.id ? 'true' : null,
          onclick: async () => {
            dlg.close();
            if (s.id !== screen.id) await openScreen((await db.getScreen(s.id)) || s);
          },
        },
          h('b', {}, s.name),
          h('small', {}, `${s.widgets.length} widget${s.widgets.length === 1 ? '' : 's'}${s.paused ? ' · ⏸ paused' : ''}`),
          icons ? h('span', { class: 'screen-icons', 'aria-hidden': 'true' }, icons) : null,
        );
      }),
    ),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => { dlg.close(); renameScreen(screen); } }, '✎ Rename this screen'),
      h('button', { class: 'btn', onclick: () => { dlg.close(); newScreenDialog(); } }, '+ New screen'),
      h('button', { class: 'btn', onclick: () => { dlg.close(); openDrawer(); } }, '☰ More…'),
    ),
  );
}

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
      screen.paused
        ? menuBtn('▶', 'Carry on', () => { resumeScreen(); closeDrawer(); })
        : menuBtn('⏸', 'Pause screen', () => { pauseScreen(); closeDrawer(); }),
      menuBtn('🎨', 'Widget theme', () => { closeDrawer(); themeDialog(); }),
      menuBtn('🔗', 'Share link', shareDialog),
      menuBtn('⬇', 'Download screen', () => exportScreens([screen], screen.name)),
      menuBtn('🧹', 'Clear widgets', () => { if (screen.paused) { toast('Carry on with the paused screen first.'); return; } if (confirm('Remove all widgets from this screen?')) board.clearAll(); }),
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
    h('h3', {}, 'Classes & data'),
    h('div', { class: 'menu-grid' },
      menuBtn('👥', 'Classes & student lists', () => { closeDrawer(); showClassManager(); }),
      menuBtn('📊', 'Data you’ve recorded', () => { closeDrawer(); showDataScreen(); }),
    ),
    h('h3', {}, 'Help'),
    h('div', { class: 'menu-grid' },
      menuBtn('🔔', 'Keep alarms ringing (stop tabs sleeping)', showSoundHelp),
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
  if (full.id === screen.id) { screen.name = n; nameBtn.textContent = n; document.title = `${n} · My Classroom Screen`; persist.flush(); }
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
const assetIds = (s) => [s.background?.assetId, ...s.widgets.flatMap((w) => Object.entries(w.state || {}).flatMap(([k, v]) => (k.endsWith('AssetId') && v ? [v] : k.endsWith('AssetIds') && Array.isArray(v) ? v : [])))].filter(Boolean);

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
  const out = h('textarea', { class: 'share-url', readonly: true, rows: 3 });
  const notes = h('p', { class: 'hint' });
  const warn = h('div', { class: 'share-warn', hidden: true, role: 'alert' });
  const includeNames = h('input', { type: 'checkbox' });
  const copyBtn = h('button', { class: 'btn primary' }, '📋 Copy link');
  const fileBtn = h('button', { class: 'btn', onclick: () => exportScreens([screen], screen.name) }, '⬇ Download screen file');
  let missing = [];
  const make = async () => {
    const { url, dropped, long } = await makeShareLink(screen, { includeNames: includeNames.checked });
    out.value = url;
    missing = dropped;
    const files = dropped.filter((d) => d.startsWith('uploaded'));
    const other = dropped.filter((d) => !d.startsWith('uploaded'));
    const lines = [];
    if (files.length) {
      const which = [...new Set(screen.widgets.filter((w) => Object.entries(w.state || {}).some(([k, v]) => (k.endsWith('AssetId') && v) || (k.endsWith('AssetIds') && v?.length))).map((w) => WIDGETS[w.type]?.title || w.type))];
      if (screen.background?.assetId) which.unshift('Background picture');
      lines.push(h('p', {}, h('b', {}, '⚠️ Your files won’t be in this link. '), `Pictures, video clips and sounds you added from this computer stay on this computer, so people opening the link will see empty widgets: ${which.join(', ')}.`));
    }
    if (other.length) lines.push(h('p', {}, h('b', {}, files.length ? 'Also missing: ' : '⚠️ Not in this link: '), `${other.join(', ')}.`));
    if (lines.length) lines.push(h('p', {}, 'To share everything, download the screen file and send that instead (they open it with “Open project file”).'));
    warn.replaceChildren(...lines);
    warn.hidden = !lines.length;
    fileBtn.className = lines.length ? 'btn primary' : 'btn';
    copyBtn.className = lines.length ? 'btn' : 'btn primary';
    copyBtn.textContent = lines.length ? '📋 Copy link anyway' : '📋 Copy link';
    const bits = [];
    if (long) bits.push('This link is very long and may not work in every app — a screen file is safer.');
    bits.push(`${url.length.toLocaleString()} characters.`);
    notes.textContent = bits.join(' ');
  };
  includeNames.addEventListener('change', make);
  copyBtn.addEventListener('click', async () => {
    const label = copyBtn.textContent;
    try {
      await navigator.clipboard.writeText(out.value);
    } catch {
      out.select();
      document.execCommand('copy');
    }
    copyBtn.textContent = '✔ Copied';
    if (missing.some((d) => d.startsWith('uploaded'))) toast('Link copied — remember it doesn’t include your pictures, clips or sounds.', { action: '⬇ Download file', onAction: () => exportScreens([screen], screen.name), ms: 8000 });
    setTimeout(() => (copyBtn.textContent = label), 2000);
  });
  modal('Share this screen',
    h('p', {}, 'Anyone who opens this link gets their own copy of this screen layout.'),
    warn,
    hasNames ? h('label', { class: 'check' }, includeNames, h('span', {}, 'Include student names and calendar events (only share with colleagues at your school)')) : null,
    out,
    notes,
    h('div', { class: 'row end' }, fileBtn, copyBtn),
  );
  make();
}

async function exportScreens(screens, name) {
  persist.flush();
  const fresh = await Promise.all(screens.map(async (s) => (s.id === screen.id ? screen : (await db.getScreen(s.id)) || s)));
  const blob = await buildProjectFile(fresh);
  const safe = name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'screen';
  downloadBlob(blob, `${safe}.classroom`);
}

async function importDialog() {
  const f = await pickFile('.classroom,.zip,.json,application/json,application/zip');
  if (!f) return;
  try {
    const screens = await importProjectFile(f);
    for (const s of screens) await db.putScreen(s);
    await openScreen(screens[0]);
    toast(`Opened ${screens.length} screen${screens.length === 1 ? '' : 's'} from the file.`);
    renderDrawer();
  } catch (e) {
    toast(e.message || 'That file could not be opened.');
  }
}

// ---------- dock ----------
let recent = [];
const pop = h('div', { class: 'dock-pop', hidden: true, role: 'dialog' });
document.body.append(pop);
function closePop() {
  pop.hidden = true;
  document.querySelectorAll('.dock-cat.open').forEach((b) => b.classList.remove('open'));
}
document.addEventListener('pointerdown', (e) => {
  if (!pop.hidden && !e.target.closest('.dock-pop, .dock-cat')) closePop();
}, true);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closePop());

function addFromDock(type) {
  closePop();
  board.addWidget(type);
  recent = [type, ...recent.filter((t) => t !== type)].slice(0, 4);
  db.setMeta('recentWidgets', recent);
  drawRecent();
}
const tile = (w, cls = 'dock-btn') =>
  h('button', { class: cls, title: `Add ${w.title}`, onclick: () => addFromDock(w.type) },
    h('span', { class: 'di', 'aria-hidden': 'true' }, w.icon),
    h('span', { class: 'dl' }, w.title));

function openCategory(cat, btn) {
  const wasOpen = !pop.hidden && pop.dataset.cat === cat.id;
  closePop();
  if (wasOpen) return;
  pop.dataset.cat = cat.id;
  pop.setAttribute('aria-label', cat.label);
  pop.replaceChildren(
    h('div', { class: 'dock-pop-head' }, h('span', {}, `${cat.icon} ${cat.label}`), h('button', { class: 'w-btn', 'aria-label': 'Close', onclick: closePop }, '✕')),
    h('div', { class: 'dock-pop-grid' }, ...cat.types.filter((t) => WIDGETS[t]).map((t) => tile(WIDGETS[t], 'pop-tile'))),
  );
  pop.hidden = false;
  btn.classList.add('open');
  // Sit just above the button, kept on screen.
  const r = btn.getBoundingClientRect();
  const pw = pop.offsetWidth;
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2))}px`;
  pop.style.bottom = `${window.innerHeight - r.top + 10}px`;
}

const recentBox = h('div', { class: 'dock-group dock-recent', role: 'group', 'aria-label': 'Recently used' });
function drawRecent() {
  recentBox.replaceChildren(...recent.filter((t) => WIDGETS[t]).map((t) => tile(WIDGETS[t])));
  recentBox.hidden = !recent.length;
}

function buildDock() {
  const dock = $('#dock-items');
  dock.append(
    h('div', { class: 'dock-group dock-cats', role: 'group', 'aria-label': 'Add a widget' },
      ...CATEGORIES.map((cat) => {
        const b = h('button', { class: 'dock-btn dock-cat', 'aria-haspopup': 'dialog', title: `${cat.label} widgets` },
          h('span', { class: 'di', 'aria-hidden': 'true' }, cat.icon),
          h('span', { class: 'dl' }, cat.label, h('i', { class: 'caret' }, '▴')));
        b.addEventListener('click', () => openCategory(cat, b));
        return b;
      }),
    ),
    recentBox,
  );
  db.getMeta('recentWidgets', ['timer', 'noise', 'namepicker']).then((r) => { recent = r; drawRecent(); });
  $('#dock-toggle').addEventListener('click', () => {
    const hidden = document.body.classList.toggle('dock-hidden');
    setTimeout(() => board.layoutAll(), 300); // the safe area for title bars changed
    $('#dock-toggle').setAttribute('aria-expanded', String(!hidden));
    db.setMeta('dockHidden', hidden);
  });
}

// ---------- fullscreen + keys ----------
$('#fullscreen-btn').addEventListener('click', toggleFullscreen);
// iPhones can't make a web page full screen; hide the button where it wouldn't work.
if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) $('#fullscreen-btn').hidden = true;
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
  await initClasses(() => screen);
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
  // Tidy up files nothing uses any more (deleted widgets / screens), now and every half hour.
  const sweep = () => {
    persist.flush();
    const keep = board.lastRemoved ? [...assetIdsOfScreen({ widgets: [board.lastRemoved] })] : [];
    setTimeout(() => sweepAssets(keep).catch((e) => console.warn('tidy-up', e)), 1500); // after the save lands
  };
  setTimeout(sweep, 15000);
  setInterval(sweep, 30 * 60 * 1000);
}

init();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
