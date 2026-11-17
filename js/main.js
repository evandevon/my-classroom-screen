// App shell: screens, menu, dock, backgrounds, sharing.

import { Board } from './board.js';
import { themePicker, textSizeSlider } from './themes.js';
import { db, assetURL, sweepAssets, assetIdsOfScreen } from './storage.js';
import { WIDGETS, CATEGORIES } from './widgets/index.js';
import { TEMPLATES, GRADIENTS, SOLIDS } from './templates.js';
import { makeShareLink, readShareHash, buildProjectFile, readProjectFile, addImported, previewImported, classIdsUsed, hasFiles, prepareImportedScreen, copyPreviewToMine, parsedFromLinkData } from './share.js';
import { h, uid, debounce, toast, pickFile, downloadBlob, enableMultiTouchTaps } from './util.js';
enableMultiTouchTaps();
import { showSoundHelp } from './help.js';
import { ANIMS, renderMoving, classifyLink, MOVING_TYPES, loadLibrary, libURL, freshLibraryBackground } from './background.js';
import { checkOldRecords } from './oldrecords.js';
import { screenshotDialog } from './screenshot.js';
import { startupNotes, showWelcome, showWhatsNew, showWaysToHelp } from './welcome.js';
import { initBackup, maybeAskOnce, backupStatus, downloadBackup, markBackedUp } from './backup.js';
import { initTabs, claim, release, askOthers, openElsewhere, notifyAdded } from './tabs.js';
import { getGroups, forgetGroups, saveGroups, addGroup, updateGroup, removeGroup, GROUP_COLOURS } from './groups.js';
import { initClasses, reloadClassLists, currentClassName, fromTimeline, onClassChange, showClassPicker, showClassManager } from './classes.js';

const $ = (sel) => document.querySelector(sel);
const boardEl = $('#board');
// Moving backgrounds (animations, videos, slideshows) sit in their own layer behind the board.
const bgLayer = h('div', { id: 'bg-layer', 'aria-hidden': 'true' });
boardEl.before(bgLayer);
let moving = null;
const nameBtn = $('#screen-name');

let screen = null;

const deletedScreens = new Set(); // never save these again (a late save would bring a deleted screen back)
let previewing = null;   // looking at a screen from a file or link without adding it: { backId, parsed, raw, banner }
let usedElsewhere = false;   // another tab has taken this screen ("Use it here")
const persist = debounce(async () => {
  if (!screen || deletedScreens.has(screen.id) || previewing || usedElsewhere) return;   // a preview, or a screen another tab is using, is never saved
  screen.updated = Date.now();
  try {
    await db.putScreen(screen);
  } catch (e) {
    console.error(e);
    toast('Could not save — is storage full or blocked?');
  }
}, 400);

const board = new Board(boardEl, { onChange: () => persist() });

// ---------- undo / redo for everything on a screen ----------
// Every change someone makes (a tap, drag, typing, a setting) becomes one undo step: we copy the screen
// when an interaction starts and, once things settle, keep that copy if the screen changed. Changes that
// happen by themselves (weather refreshing, a slideshow moving on) don't count — widgets list those keys
// as volatileKeys. Deleting a screen can be undone too.
const UNDO_MAX = 40;
const undoStack = [];
const redoStack = [];
const undoBtn = $('#undo-btn');
const redoBtn = $('#redo-btn');
/** A copy of a screen. Big data that's never changed in place (a whiteboard recording: undoShareKeys) is shared, not copied. */
function snap(s) {
  const refs = [];
  const light = { ...s, widgets: s.widgets.map((w) => {
    const keys = WIDGETS[w.type]?.undoShareKeys;
    if (!keys) return w;
    const st = { ...w.state };
    for (const k of keys) { if (k in st) refs.push([w, k, st[k]]); delete st[k]; }
    return { ...w, state: st };
  }) };
  const c = structuredClone(light);
  for (const [w, k, v] of refs) c.widgets[s.widgets.indexOf(w)].state[k] = v;
  return c;
}
const tokens = new WeakMap();
let tokenN = 0;
const token = (v) => (v && typeof v === 'object' ? (tokens.get(v) ?? (tokens.set(v, ++tokenN), tokenN)) : v);
/** Text that changes only when something someone did changes the screen. */
function comparable(s) {
  return JSON.stringify({ ...s, updated: 0, widgets: s.widgets.map((w) => {
    const def = WIDGETS[w.type];
    if (!def?.volatileKeys && !def?.undoShareKeys) return w;
    const st = { ...w.state };
    for (const k of def.volatileKeys || []) delete st[k];
    for (const k of def.undoShareKeys || []) st[k] = `#${token(st[k])}`;
    return { ...w, state: st };
  }) });
}
let pending = null;   // { id, before, key, timer, by: 'pointer' | 'key' }
let pointersDown = 0;
function beginInteraction(e) {
  if (!screen || previewing || e.target?.closest?.('[data-no-undo]')) return;
  const by = e.type === 'keydown' ? 'key' : 'pointer';
  if (pending) {
    // Typing keeps adding to the same step; each new tap or drag is a step of its own
    // (unless another finger is still down — that's the same gesture).
    if ((by === 'key' && pending.by === 'key') || pointersDown > 1) { clearTimeout(pending.timer); return; }
    commitPending();
  }
  pending = { id: screen.id, before: snap(screen), key: comparable(screen), by };
}
function settleSoon(ms = 900) {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending.timer = setTimeout(() => { if (pointersDown > 0) settleSoon(ms); else commitPending(); }, ms);
}
function pushUndo(entry) {
  undoStack.push(entry);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0;
  syncUndoButtons();
}
function commitPending() {
  const p = pending;
  pending = null;
  if (!p) return;
  clearTimeout(p.timer);
  if (!screen || p.id !== screen.id || comparable(screen) === p.key) return;
  pushUndo({ id: p.id, before: p.before });
}
function syncUndoButtons() {
  undoBtn.disabled = !undoStack.length;
  redoBtn.disabled = !redoStack.length;
}
/** Put a screen back exactly as it was. */
async function restoreInto(before) {
  if (before.id !== screen?.id) {
    const s = await db.getScreen(before.id);
    if (!s) return false;
    await openScreen(s);
  }
  for (const k of Object.keys(screen)) if (!(k in before)) delete screen[k];
  Object.assign(screen, snap(before));
  board.load(screen);
  updatePauseBadge();
  await applyBackground();
  nameBtn.textContent = screen.name;
  document.title = `${screen.name} · My Classroom Screen`;
  persist();
  return true;
}
async function step(from, to, word) {
  if (usedElsewhere) return;   // another tab is using this screen
  commitPending();
  const e = from.pop();
  if (!e) { toast(`Nothing to ${word.toLowerCase()}`); syncUndoButtons(); return; }
  if (e.kind === 'deleted') {            // bring a deleted screen back
    deletedScreens.delete(e.screen.id);
    await db.putScreen(snap(e.screen));
    await openScreen(await db.getScreen(e.screen.id));
    if (e.fresh) {
      const blank = await db.getScreen(e.fresh.id);
      if (blank && comparable({ ...blank, updated: 0 }) === e.fresh.key) { deletedScreens.add(blank.id); await db.deleteScreen(blank.id); }
    }
    to.push({ kind: 'restored', screen: e.screen });
    toast(`${word}: “${e.screen.name}” is back.`);
  } else if (e.kind === 'restored') {    // delete it again
    await deleteScreen(e.screen, { quiet: true });
    to.push({ kind: 'deleted', screen: e.screen });
    toast(`${word}: “${e.screen.name}” deleted again.`);
  } else {
    const now = e.id === screen?.id ? snap(screen) : await db.getScreen(e.id);
    if (!now) { syncUndoButtons(); return; }
    if (await restoreInto(e.before)) to.push({ id: e.id, before: now });
  }
  renderDrawer();
  syncUndoButtons();
}
const undo = () => step(undoStack, redoStack, 'Undo');
const redo = () => step(redoStack, undoStack, 'Redo');
undoBtn.addEventListener('click', undo);
board.undo = undo;
// For widgets that change themselves after a wait (e.g. a picture added to a whiteboard): one undo step.
board.beginUndo = () => beginInteraction({ type: 'paste' });
board.settleUndo = () => settleSoon(300);
// For the "Go to screen" button widget.
board.listScreens = () => sortedScreens();
board.screenId = () => screen?.id;
board.goToScreen = async (id, name) => {
  const all = await sortedScreens();
  const target = all.find((s) => s.id === id) || all.find((s) => s.name === name);   // by name after a file or link
  if (!target) { toast(`There’s no screen called “${name}” here any more — choose another in the button’s ⚙.`); return; }
  if (target.id === screen?.id) return;
  await openScreen((await db.getScreen(target.id)) || target);
};
redoBtn.addEventListener('click', redo);
document.addEventListener('pointerdown', (e) => { pointersDown++; beginInteraction(e); }, true);
const pointerEnd = () => { pointersDown = Math.max(0, pointersDown - 1); settleSoon(); };
document.addEventListener('pointerup', pointerEnd, true);
document.addEventListener('pointercancel', pointerEnd, true);
document.addEventListener('input', () => settleSoon(1200), true);
document.addEventListener('change', () => settleSoon(), true);
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && !typing && (k === 'z' || k === 'y')) {   // in a text box, leave Ctrl+Z to the text box
    e.preventDefault();
    if (k === 'y' || e.shiftKey) redo(); else undo();
    return;
  }
  if (['Shift', 'Control', 'Meta', 'Alt', 'Tab'].includes(e.key)) return;
  beginInteraction(e);
  settleSoon(1200);
}, true);
board.onResume = () => resumeScreen();

// ---------- class (supplies names to widgets) ----------
const classPill = $('#class-pill');
function updateClassPill() {
  const c = currentClassName();
  classPill.querySelector('span').textContent = c || 'Choose class';
  classPill.classList.toggle('unset', !c);
  classPill.title = c ? `Class: ${c}${fromTimeline() ? ' (from the Activity timeline)' : ''} — tap to change` : 'Choose a class (gives widgets the class list)';
}
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
  const leavingPreview = !!previewing;
  if (leavingPreview) { previewPill.hidden = true; document.title = 'My Classroom Screen'; }
  if (usedElsewhere) persist.cancel();   // this tab's copy is out of date; never save it
  if (previewing) { previewing.banner.remove(); previewing = null; document.body.classList.remove('previewing'); }
  commitPending();
  if (leavingPreview) persist.cancel();   // a preview is never saved
  else persist.flush();
  screen = s;
  board.load(screen);
  updatePauseBadge();
  await applyBackground();
  nameBtn.textContent = screen.name;
  document.title = `${screen.name} · My Classroom Screen`;
  db.setMeta('lastScreen', screen.id);
  updateClassPill();
  endUsedElsewhere();
  claim(screen.id);   // a tab showing this screen elsewhere steps aside
  db.getMeta('recentScreens', []).then((r) => db.setMeta('recentScreens', [screen.id, ...r.filter((id) => id !== screen.id)].slice(0, 8)));
}

// ---------- one tab at a time per screen ("Use it here") ----------
// Tabs can show different screens. If a screen is opened in another tab, this tab steps aside:
// it stops running the screen (no timers, sounds, videos, camera or microphone), stops saving,
// and covers the page with "Use it here". Tapping that takes the screen back, freshly loaded.
const elsewhereCover = h('div', { class: 'elsewhere-cover', hidden: true },
  h('div', { class: 'elsewhere-card', role: 'dialog', 'aria-label': 'This screen is open in another tab' },
    h('div', { class: 'ec-icon', 'aria-hidden': 'true' }, '🪟'),
    h('h2', {}, 'This screen is being used in another tab'),
    h('p', {}, 'A screen can be used in one tab at a time, so two tabs never overwrite each other or ring twice.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => useItHere() }, 'Use it here'),
      h('button', { class: 'btn', onclick: async () => tabChooser(openElsewhere(), await sortedScreens()) }, 'Show a different screen'),
    ),
  ));
document.body.append(elsewhereCover);

function stepAside() {
  if (!screen || usedElsewhere || previewing) return;
  commitPending();
  persist.flush();             // keep what this tab had done until now
  usedElsewhere = true;
  release();
  board.load({ ...screen, widgets: [] });   // stop every widget
  moving?.setPaused(true);
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  closeDrawer();
  elsewhereCover.querySelector('h2').textContent = `“${screen.name}” is being used in another tab`;
  elsewhereCover.hidden = false;
  document.body.classList.add('used-elsewhere');
}
function endUsedElsewhere() {
  if (!usedElsewhere) return;
  usedElsewhere = false;
  elsewhereCover.hidden = true;
  document.body.classList.remove('used-elsewhere');
}
async function useItHere() {
  const fresh = await db.getScreen(screen.id);   // the other tab's latest version
  endUsedElsewhere();
  await openScreen(fresh || screen);
}

/** A new tab whose usual screen is already open in another tab: pick one for this tab (or make one). */
function tabChooser(busy, screens) {
  const dlg = h('dialog', { class: 'modal tab-chooser' },
    h('div', { class: 'modal-head' }, h('h2', {}, 'Which screen in this tab?'), h('button', { class: 'w-btn', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕')),
    h('div', { class: 'modal-body' },
      h('p', { class: 'hint' }, 'The site is open in another tab too. A screen can be used in one tab at a time — choosing one that’s open elsewhere moves it to this tab.'),
      h('div', { class: 'tc-list' },
        ...screens.map((sc) => h('button', {
          class: `tc-item${sc.id === screen.id ? ' on' : ''}`,
          onclick: async () => { dlg.close(); if (sc.id === screen.id) { if (usedElsewhere) useItHere(); return; } await openScreen((await db.getScreen(sc.id)) || sc); },
        }, h('b', {}, sc.name), h('small', {}, sc.id === screen.id && !usedElsewhere ? 'showing now' : busy.has(sc.id) ? 'in another tab — choose to use it here' : `${sc.widgets.length} widget${sc.widgets.length === 1 ? '' : 's'}`))),
      ),
      h('button', { class: 'btn primary', onclick: () => { dlg.close(); newScreenDialog(); } }, '+ New screen'),
    ),
  );
  dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 300));
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- widget theme for the whole screen ----------
function themeDialog() {
  modal('Widget theme',
    h('p', {}, 'Changes every widget on this screen, and new ones you add. Each widget can still have its own theme in its ⚙ settings.'),
    themePicker({ theme: screen.widgetTheme || 'light', shadow: !!screen.widgetShadow }, (c) => board.setAllThemes(c)),
    h('h3', {}, '🔠 Text size of every widget'),
    textSizeSlider(1, (fs) => board.setAllThemes({ fs })),
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
  moving?.setPaused(!!screen.paused);
}

async function applyBackground() {
  let bg = screen.background || { type: 'gradient', value: 'sky' };
  if (bg.lib) { // use the newest version of a library file that has been replaced on the site
    const forScreen = screen;
    const fresh = await freshLibraryBackground(bg);
    if (screen !== forScreen || screen.background !== bg) return; // switched away meanwhile
    if (fresh.url !== bg.url || fresh.value !== bg.value) { screen.background = bg = fresh; persist(); }
  }
  moving?.stop();
  moving = null;
  bgLayer.replaceChildren();
  bgLayer.style.background = '';
  boardEl.style.backgroundImage = '';
  boardEl.style.backgroundColor = '';
  const isMoving = MOVING_TYPES.includes(bg.type);
  document.body.classList.toggle('moving-bg', isMoving);
  let dark = false;
  if (isMoving) {
    moving = renderMoving(bgLayer, bg, { assetURL, onProblem: (msg) => toast(msg, { ms: 9000 }) });
    moving.setPaused(!!screen.paused);
    dark = moving.dark || (bg.dim || 0) >= 35;
  } else if (bg.type === 'color') boardEl.style.backgroundColor = bg.value;
  else if (bg.type === 'gradient') boardEl.style.backgroundImage = GRADIENTS[bg.value] || GRADIENTS.sky;
  else if (bg.type === 'image') {
    const url = bg.assetId ? await assetURL(bg.assetId) : /^https?:\/\//.test(bg.value || '') ? bg.value : null;
    if (url) boardEl.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
  }
  dark ||= (bg.type === 'gradient' && ['night', 'forest', 'ocean'].includes(bg.value)) || (bg.type === 'color' && /^#(0|1|2)/.test(bg.value));
  document.body.classList.toggle('dark-bg', dark);
}


/** Screens in the teacher's own order (dragged in the menu); screens never placed yet go last, newest first. */
async function sortedScreens() {
  const key = (s) => (Number.isFinite(s.order) ? s.order : 1e15 - (s.updated || 0));
  const list = (await db.listScreens()).sort((a, b) => key(a) - key(b));
  // Every screen gets a fixed place, so using a screen never moves it in the lists (screens made before
  // this keep where they were; new ones go at the end).
  if (list.some((x) => !Number.isFinite(x.order))) {
    let next = Math.max(-1, ...list.filter((x) => Number.isFinite(x.order)).map((x) => x.order)) + 1;
    for (const x of list) {
      if (Number.isFinite(x.order)) continue;
      x.order = next++;
      if (screen && x.id === screen.id) { screen.order = x.order; persist.flush(); } else await db.putScreen(x);
    }
    list.sort((a, b) => a.order - b.order);
  }
  return list;
}
/** Save the order of the screen list, and which group each screen is in: [{ id, group }] top to bottom. */
async function saveScreenOrder(entries) {
  persist.flush();
  const all = await db.listScreens();
  for (const s of all) {
    const i = entries.findIndex((e) => e.id === s.id);
    if (i < 0) continue;
    const group = entries[i].group || undefined;
    const target = s.id === screen.id ? screen : s;
    if (target.order === i && (target.group || undefined) === group) continue;
    target.order = i;
    if (group) target.group = group; else delete target.group;
    if (target === screen) persist.flush(); else await db.putScreen(target);
  }
}
const listEntries = (box) => [...box.querySelectorAll('.screen-list > li[data-id]')].map((li) => ({ id: li.dataset.id, group: li.parentElement.dataset.group || '' }));

/**
 * Drag a screen by its ⋮⋮ handle (mouse, pen or finger): up and down the list, into another group,
 * or onto a closed group's heading. Arrow keys on the handle move it within its own list.
 */
function makeReorderable(box) {
  // Whole groups: drag a group's ⋮⋮ handle up or down among the other groups.
  const saveGroupOrder = async () => {
    const order = [...box.querySelectorAll(':scope > .group-section')].map((x) => x.dataset.group);
    const groups = await getGroups();
    await saveGroups(order.map((id) => groups.find((g) => g.id === id)).filter(Boolean));
  };
  box.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.group-grip');
    if (!grip || e.button > 0) return;
    e.preventDefault();
    const sec = grip.closest('.group-section');
    box.setPointerCapture(e.pointerId);
    sec.classList.add('dragging');
    const id = e.pointerId;
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      const others = [...box.querySelectorAll(':scope > .group-section')].filter((x) => x !== sec);
      const after = others.find((x) => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (after) { if (after !== sec.nextElementSibling) box.insertBefore(sec, after); }
      else if (box.lastElementChild !== sec) box.append(sec);
    };
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      sec.classList.remove('dragging');
      saveGroupOrder();
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
  });
  box.addEventListener('keydown', (e) => {
    const grip = e.target.closest('.group-grip');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const sec = grip.closest('.group-section');
    const prev = sec.previousElementSibling?.matches('.group-section') ? sec.previousElementSibling : null;
    const next = sec.nextElementSibling;
    if (e.key === 'ArrowUp' && prev) box.insertBefore(sec, prev);
    if (e.key === 'ArrowDown' && next) box.insertBefore(next, sec);
    grip.focus();
    saveGroupOrder();
  });
  // Screens: drag a screen's ⋮⋮ handle within or between groups, or out of a group ("No group").
  // A copy follows the pointer; a dashed gap shows where it will land; the target list lights up.
  box.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.screen-grip');
    if (!grip || e.button > 0) return;
    e.preventDefault();
    const li = grip.closest('li');
    box.setPointerCapture(e.pointerId);   // on the whole box: moving the row would drop the handle's capture
    const r0 = li.getBoundingClientRect();
    const dx = e.clientX - r0.left, dy = e.clientY - r0.top;
    const ghost = li.cloneNode(true);
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { width: `${r0.width}px`, left: '0px', top: '0px', transform: `translate(${r0.left}px, ${r0.top}px) rotate(-1.5deg)` });
    document.body.append(ghost);
    li.classList.add('drag-gap');
    li.style.pointerEvents = 'none';      // so we can see what's underneath it
    box.classList.add('dragging-screen'); // shows the "No group" area even when it's empty
    document.body.classList.add('grabbing');
    const scroller = box.closest('.drawer') || box.parentElement;
    const id = e.pointerId;
    let dropHead = null;
    let litList = null;
    const light = (list) => { if (litList === list) return; litList?.classList.remove('drop-list'); litList = list; list?.classList.add('drop-list'); };
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      ghost.style.transform = `translate(${ev.clientX - dx}px, ${ev.clientY - dy}px) rotate(-1.5deg)`;
      // near the top or bottom of the menu: scroll it
      const sr = scroller.getBoundingClientRect();
      if (ev.clientY < sr.top + 48) scroller.scrollTop -= 14;
      else if (ev.clientY > sr.bottom - 48) scroller.scrollTop += 14;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const head = el?.closest('.group-head');
      dropHead?.classList.remove('drop-here');
      dropHead = null;
      if (head && box.contains(head) && head.nextElementSibling?.hidden) { dropHead = head; head.classList.add('drop-here'); light(null); return; }
      const list = el?.closest('.screen-list') || (head && box.contains(head) ? head.nextElementSibling : null);
      if (!list || !box.contains(list)) return;
      light(list);
      const items = [...list.querySelectorAll(':scope > li[data-id]')].filter((x) => x !== li);
      const after = items.find((x) => { const r = x.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
      if (after) { if (after !== li.nextSibling) list.insertBefore(li, after); }
      else if (list.lastElementChild !== li) list.append(li);
    };
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      ghost.remove();
      li.classList.remove('drag-gap');
      li.style.pointerEvents = '';
      light(null);
      box.classList.remove('dragging-screen');
      document.body.classList.remove('grabbing');
      if (dropHead) { dropHead.classList.remove('drop-here'); dropHead.nextElementSibling.append(li); }
      saveScreenOrder(listEntries(box)).then(() => renderDrawer());
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
  });
  box.addEventListener('keydown', (e) => {
    const grip = e.target.closest('.screen-grip');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const li = grip.closest('li');
    const list = li.parentElement;
    if (e.key === 'ArrowUp' && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
    if (e.key === 'ArrowDown' && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
    grip.focus();
    saveScreenOrder(listEntries(box));
  });
}

// ---------- screen groups ----------
async function setScreenGroup(s, groupId) {
  const target = s.id === screen.id ? screen : (await db.getScreen(s.id)) || s;
  if (groupId) target.group = groupId; else delete target.group;
  if (target === screen) persist.flush(); else await db.putScreen(target);
}
/** The 📁 button on a screen: choose its group (or make one). Works without dragging, e.g. on a smartboard. */
async function moveToGroupDialog(s) {
  const groups = await getGroups();
  const pick = async (gid) => { dlg.close(); await setScreenGroup(s, gid); renderDrawer(); };
  const dlg = modal(`Put “${s.name}” in a group`,
    h('div', { class: 'group-pick' },
      ...groups.map((g) => h('button', { class: `group-choice${s.group === g.id ? ' on' : ''}`, style: { '--gc': g.colour }, onclick: () => pick(g.id) }, h('span', { class: 'gdot' }), g.name)),
      h('button', { class: `group-choice${!groups.some((g) => g.id === s.group) ? ' on' : ''}`, onclick: () => pick('') }, h('span', { class: 'gdot none' }), 'No group'),
    ),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { dlg.close(); const g = await newGroup(); if (g) { await setScreenGroup(s, g.id); renderDrawer(); } } }, '+ New group…')),
  );
}
async function newGroup() {
  const name = await ask('New group — e.g. 4K, Science, Routines');
  if (!name) return null;
  const g = await addGroup(name);
  renderDrawer();
  return g;
}
function groupColourDialog(g) {
  const dlg = modal(`Colour for “${g.name}”`,
    h('div', { class: 'gcolours' },
      ...GROUP_COLOURS.map(([c, label]) => h('button', {
        class: `gcolour${g.colour === c ? ' on' : ''}`, style: { background: c }, title: label, 'aria-label': label,
        onclick: async () => { dlg.close(); await updateGroup(g.id, { colour: c }); renderDrawer(); },
      }))),
  );
}
async function deleteGroup(g, count) {
  if (count && !confirm(`Delete the group “${g.name}”? Its ${count} screen${count === 1 ? '' : 's'} stay, just without a group.`)) return;
  for (const s of await db.listScreens()) if (s.group === g.id) await setScreenGroup(s, '');
  await removeGroup(g.id);
  renderDrawer();
}

/** The screen list in the menu: recently used, screens without a group, then each group (open or closed). */
async function screenListSection(screens) {
  forgetGroups();   // another tab may have changed them
  const groups = await getGroups();
  const known = new Set(groups.map((g) => g.id));
  const groupOf = (s) => (known.has(s.group) ? s.group : '');
  const colourOf = (s) => groups.find((g) => g.id === groupOf(s))?.colour;
  const row = (s) => h('li', { class: s.id === screen.id ? 'current' : '', 'data-id': s.id, style: colourOf(s) ? { '--gc': colourOf(s) } : null },
    screens.length > 1 ? h('button', { class: 'screen-grip', title: 'Drag to move this screen up or down, or into a group', 'aria-label': `Move ${s.name} (drag, or use the up and down arrow keys)` }, '⋮⋮') : null,
    h('button', { class: 'screen-open', onclick: async () => { await openScreen((await db.getScreen(s.id)) || s); closeDrawer(); } },
      h('span', { class: 'sname' }, s.name),
      h('span', { class: 'smeta' }, `${s.widgets.length} widget${s.widgets.length === 1 ? '' : 's'}`),
    ),
    groups.length ? h('button', { class: 'w-btn', title: 'Put in a group', 'aria-label': `Put ${s.name} in a group`, onclick: () => moveToGroupDialog(s) }, '📁') : null,
    h('button', { class: 'w-btn', title: 'Rename', 'aria-label': `Rename ${s.name}`, onclick: () => renameScreen(s) }, '✎'),
    h('button', { class: 'w-btn', title: 'Duplicate', 'aria-label': `Duplicate ${s.name}`, onclick: () => duplicateScreen(s) }, '⧉'),
    h('button', { class: 'w-btn close', title: 'Delete', 'aria-label': `Delete ${s.name}`, onclick: () => deleteScreen(s) }, '🗑'),
  );
  // Recently used: once there are enough screens for the list to get long.
  let recent = null;
  if (screens.length >= 6) {
    const ids = (await db.getMeta('recentScreens', [])).filter((id) => id !== screen.id);
    const picks = ids.map((id) => screens.find((s) => s.id === id)).filter(Boolean).slice(0, 4);
    if (picks.length) {
      recent = h('div', { class: 'recent-screens' },
        h('span', { class: 'recent-label' }, 'Recently used'),
        ...picks.map((s) => h('button', { class: 'recent-chip', style: colourOf(s) ? { '--gc': colourOf(s) } : null, onclick: async () => { await openScreen((await db.getScreen(s.id)) || s); closeDrawer(); } },
          colourOf(s) ? h('span', { class: 'gdot' }) : null, s.name)));
    }
  }
  const box = h('div', { class: 'screen-groups' },
    h('ul', { class: 'screen-list', 'data-group': '' }, ...screens.filter((s) => !groupOf(s)).map(row)),
    ...groups.map((g) => {
      const items = screens.filter((s) => groupOf(s) === g.id);
      const open = !g.collapsed;
      const here = items.some((s) => s.id === screen.id);
      return h('div', { class: 'group-section', 'data-group': g.id },
        h('div', { class: `group-head${here ? ' has-current' : ''}`, style: { '--gc': g.colour } },
          groups.length > 1 ? h('button', { class: 'group-grip', title: 'Drag to move this group up or down', 'aria-label': `Move the group ${g.name} (drag, or use the up and down arrow keys)` }, '⋮⋮') : null,
          h('button', { class: 'group-toggle', 'aria-expanded': String(open), title: open ? 'Close this group' : 'Open this group', onclick: async () => { await updateGroup(g.id, { collapsed: open }); renderDrawer(); } },
            h('span', { class: 'gchev', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
            h('span', { class: 'gdot' }),
            h('span', { class: 'gname' }, g.name),
            h('span', { class: 'gcount' }, `${items.length}${here && !open ? ' · here' : ''}`)),
          h('button', { class: 'w-btn', title: 'Colour', 'aria-label': `Colour for ${g.name}`, onclick: () => groupColourDialog(g) }, '🎨'),
          h('button', { class: 'w-btn', title: 'Rename group', 'aria-label': `Rename ${g.name}`, onclick: async () => { const n = await ask('Rename group', g.name); if (n) { await updateGroup(g.id, { name: n }); renderDrawer(); } } }, '✎'),
          h('button', { class: 'w-btn close', title: 'Delete group (its screens stay)', 'aria-label': `Delete the group ${g.name}`, onclick: () => deleteGroup(g, items.length) }, '🗑'),
        ),
        h('ul', { class: 'screen-list group-list', 'data-group': g.id, hidden: !open, style: { '--gc': g.colour } }, ...items.map(row)),
      );
    }),
  );
  makeReorderable(box);
  return [recent, box];
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
    // preventDefault: otherwise the same Enter press also 'clicks' the button that opened this box, opening it again
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
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

/**
 * The quick switcher (tap the screen's name). With a few screens it shows them all. With more, it shows
 * the screens in this screen's group (or the ungrouped ones), in their usual order so they stay put,
 * then up to four recently used ones from elsewhere; "All screens…" opens the menu.
 */
const SHOW_ALL_UP_TO = 8;
const RECENT_IN_SWITCHER = 4;
async function showScreenPicker() {
  persist.flush();
  forgetGroups();
  const groups = await getGroups();
  const known = new Set(groups.map((g) => g.id));
  const groupOf = (s) => (known.has(s.group) ? s.group : '');
  const gpos = (s) => groups.findIndex((g) => g.id === groupOf(s));
  const all = await sortedScreens();
  const tile = (s) => {
    const g = groups.find((x) => x.id === groupOf(s));
    const icons = [...new Set(s.widgets.map((w) => WIDGETS[w.type]?.icon).filter(Boolean))].slice(0, 6).join(' ');
    return h('button', {
      class: `class-tile screen-tile${s.id === screen.id ? ' on' : ''}${g ? ' grouped' : ''}`,
      style: g ? { '--gc': g.colour } : null,
      'aria-current': s.id === screen.id ? 'true' : null,
      onclick: async () => {
        dlg.close();
        if (s.id !== screen.id) await openScreen((await db.getScreen(s.id)) || s);
      },
    },
      h('b', {}, s.name),
      h('small', {}, `${g ? `${g.name} · ` : ''}${s.widgets.length} widget${s.widgets.length === 1 ? '' : 's'}${s.paused ? ' · ⏸ paused' : ''}`),
      icons ? h('span', { class: 'screen-icons', 'aria-hidden': 'true' }, icons) : null,
    );
  };
  const grid = (list) => h('div', { class: 'class-grid screen-grid' }, ...list.map(tile));
  let body;
  if (all.length <= SHOW_ALL_UP_TO) {
    // A few screens: show them all, grouped ones together.
    body = [grid(all.map((s, i) => [s, i]).sort((a, b) => gpos(a[0]) - gpos(b[0]) || a[1] - b[1]).map(([s]) => s))];
  } else {
    const mine = groupOf(screen);
    const g = groups.find((x) => x.id === mine);
    const here = all.filter((s) => groupOf(s) === mine);   // this screen's group, or the ungrouped screens
    const shown = new Set(here.map((s) => s.id));
    const recent = (await db.getMeta('recentScreens', [])).map((id) => all.find((s) => s.id === id)).filter((s) => s && !shown.has(s.id)).slice(0, RECENT_IN_SWITCHER);
    body = [
      h('h3', { class: 'switch-head', style: g ? { '--gc': g.colour } : null }, g ? h('span', { class: 'gdot' }) : null, g ? g.name : 'Not in a group'),
      grid(here),
      recent.length ? h('h3', { class: 'switch-head' }, 'Recently used') : null,
      recent.length ? grid(recent) : null,
    ];
  }
  const dlg = modal('Which screen?',
    ...body,
    h('div', { class: 'row' },
      all.length > SHOW_ALL_UP_TO ? h('button', { class: 'btn primary', onclick: () => { dlg.close(); openDrawer(); } }, `☰ All screens (${all.length})…`) : null,
      h('button', { class: 'btn', onclick: () => { dlg.close(); renameScreen(screen); } }, '✎ Rename this screen'),
      h('button', { class: 'btn', onclick: () => { dlg.close(); newScreenDialog(); } }, '+ New screen'),
      all.length <= SHOW_ALL_UP_TO ? h('button', { class: 'btn', onclick: () => { dlg.close(); openDrawer(); } }, '☰ More…') : null,
    ),
  );
}

async function renderDrawer() {
  const screens = await sortedScreens();
  const [recent, groupsBox] = await screenListSection(screens);

  drawer.replaceChildren(
    h('div', { class: 'drawer-head' }, h('h2', {}, 'My screens'), h('button', { class: 'w-btn', 'aria-label': 'Close menu', onclick: closeDrawer }, '✕')),
    h('div', { class: 'row new-row' },
      h('button', { class: 'btn primary', onclick: newScreenDialog }, '+ New screen'),
      h('button', { class: 'btn', title: 'A group keeps screens together, e.g. one per class or subject. Close a group to hide its screens.', onclick: () => newGroup() }, '+ New group'),
    ),
    ...(recent ? [recent] : []),
    groupsBox,
    h('h3', {}, 'This screen'),
    h('div', { class: 'menu-grid' },
      menuBtn('🖼️', 'Background', backgroundDialog),
      menuBtn('🎨', 'Widget theme & text size', () => { closeDrawer(); themeDialog(); }),
      screen.paused
        ? menuBtn('▶', 'Carry on', () => { resumeScreen(); closeDrawer(); })
        : menuBtn('⏸', 'Pause screen', () => { pauseScreen(); closeDrawer(); }),
      menuBtn('📸', 'Save a picture (JPG or PDF)', () => { closeDrawer(); screenshotDialog(screen.name); }),
      menuBtn('🧹', 'Clear widgets', () => { if (screen.paused) { toast('Carry on with the paused screen first.'); return; } if (confirm('Remove all widgets from this screen?')) board.clearAll(); }),
    ),
    h('h3', {}, 'Save & share'),
    h('p', { class: 'menu-saved' }, '✓ Your screens save themselves in this browser as you go.'),
    backupLine(await backupStatus()),
    h('div', { class: 'menu-grid' },
      menuBtn('🔗', 'Share a link', () => { closeDrawer(); shareDialog(); }),
      menuBtn('💾', 'Save to a file', () => { closeDrawer(); exportDialog(); }, 'Choose some screens to save as a .classroom file — to send to a colleague or take to another computer. Pictures, sounds and (if you tick it) their class lists go too.'),
      menuBtn('📂', 'Add screens from a file', () => { closeDrawer(); importDialog(); }, 'Open a .classroom file and choose which of its screens to add. Your own screens stay as they are.'),
    ),
    h('p', { class: 'hint menu-note' }, 'A link is quick for sharing one screen, but leaves out pictures, clips and sounds from this computer. A file keeps everything — use it for backups, a new computer or sharing a set of screens.'),
    h('h3', {}, 'Classes'),
    h('div', { class: 'menu-grid' },
      menuBtn('👥', 'Classes & student lists', () => { closeDrawer(); showClassManager(); }),
    ),
    h('h3', {}, 'Options'),
    h('div', { class: 'stack' },
      toggle('Snap widgets to a grid', board.snap, (v) => { board.snap = v; db.setMeta('snap', v); }),
      toggle('Hide widget title bars (tap a widget to show)', document.body.classList.contains('clean'), (v) => { document.body.classList.toggle('clean', v); db.setMeta('clean', v); }),
      toggle('Large buttons', document.body.classList.contains('large'), (v) => { document.body.classList.toggle('large', v); db.setMeta('large', v); }),
    ),
    h('h3', {}, 'Help'),
    h('div', { class: 'menu-grid' },
      menuBtn('👋', 'Welcome & quick overview', () => { closeDrawer(); showWelcome(); }),
      menuBtn('✨', 'What’s new', () => { closeDrawer(); showWhatsNew(); }),
      menuBtn('🔔', 'Keep alarms ringing (stop tabs sleeping)', showSoundHelp),
      menuBtn('💛', 'Ways to help', () => { closeDrawer(); showWaysToHelp(); }),
    ),
    h('p', { class: 'hint' }, 'Everything is saved automatically in this browser. Use ☰ → “Save to a file” now and then as a backup.'),
    h('p', { class: 'hint menu-made' }, 'Made by teachers, for teachers. Free for everyone. ', h('button', { class: 'linkish', onclick: () => { closeDrawer(); showWaysToHelp(); } }, '💛 Ways to help')),
  );
}
/** ☰ → Save & share: when everything was last saved to a file, with a gentle warning when it's been a while. */
function backupLine(b) {
  return h('div', { class: `menu-backup${b.stale ? ' stale' : ''}` },
    h('span', {}, b.stale ? (b.last ? `⚠ Last backed up to a file ${b.when}.` : '⚠ Not backed up to a file yet.') : `✓ Last backed up to a file ${b.when}.`),
    h('button', { class: `btn small${b.stale ? ' primary' : ''}`, title: 'Saves every screen and every class list into one .classroom file in your Downloads, in one click. Keep it somewhere safe (like OneDrive) — if this browser is ever cleared, add the screens back from it.', onclick: () => { closeDrawer(); downloadBackup(); } }, '⬇ Back up everything'),
  );
}
const menuBtn = (icon, label, onclick, tip) => h('button', { class: 'menu-btn', onclick, title: tip || null }, h('span', { class: 'mi' }, icon), label);
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
const assetIds = (s) => [s.background?.assetId, ...(s.background?.assetIds || []), ...s.widgets.flatMap((w) => Object.entries(w.state || {}).flatMap(([k, v]) => (k.endsWith('AssetId') && v ? [v] : k.endsWith('AssetIds') && Array.isArray(v) ? v : [])))].filter(Boolean);

async function deleteScreen(s, { quiet = false } = {}) {
  commitPending();
  const full = s.id === screen.id ? snap(screen) : (await db.getScreen(s.id)) || s;
  const entry = { kind: 'deleted', screen: full };
  if (!quiet) {
    pushUndo(entry);
    toast(`“${s.name}” deleted`, { action: 'Undo', onAction: undo });
  }
  if (s.id === screen.id) persist.cancel();
  deletedScreens.add(s.id);
  await db.deleteScreen(s.id);
  if (s.id === screen.id) {
    const rest = await sortedScreens();
    if (rest.length) await openScreen(rest[0]);
    else {
      const fresh = newScreenFrom(TEMPLATES[0], 'My screen');
      await db.putScreen(fresh);
      await openScreen(fresh);
      entry.fresh = { id: fresh.id, key: comparable(fresh) };   // undo removes this blank screen if it's untouched
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
            if (screen?.group) s.group = screen.group;   // next to the screen you were on
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
const MAX_SLIDES = 200;
/** Shrink big photos for a full-screen slideshow (keeps hundreds within the browser's storage). */
async function shrinkForScreen(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 2.5e6) { bmp.close?.(); return file; }
    const c = h('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88))) || file;
  } catch { return file; }
}
// ---------- paste a picture: Ctrl+V / ⌘V anywhere makes an Image widget ----------
/** A pasted picture made screen-sized; see-through PNGs stay PNG so they keep their transparency. */
async function shrinkPasted(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
    const size = { w: bmp.width, h: bmp.height };
    if (k === 1 && file.size < 2.5e6) { bmp.close?.(); return { blob: file, ...size }; }
    const c = h('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    const png = file.type === 'image/png' || file.type === 'image/gif';
    const blob = await new Promise((r) => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.88));
    return { blob: blob || file, w: c.width, h: c.height };
  } catch { return { blob: file, w: 4, h: 3 }; }
}
/**
 * A widget sized to a picture's or video's shape (w × h), centred on `at` (fractions of the board;
 * the middle if not given). Several at once fan out a little so none hides another.
 */
function addSizedWidget(type, state, w, h2, i = 0, at = null) {
  const r = board.rect;
  const head = 44;   // the widget's title bar
  const maxW = r.width * 0.45, maxH = r.height * 0.55 - head;
  const k = Math.min(maxW / w, maxH / h2, 1.5);
  const pw = Math.max(220, w * k), ph = Math.max(160, h2 * k + head);
  const fw = pw / r.width, fh = ph / r.height;
  const cx = at ? at.x : 0.5, cy = at ? at.y : 0.5;
  board.addWidget(type, {
    state: { ...WIDGETS[type].defaultState(), ...state },
    x: Math.min(1 - fw, Math.max(0, cx - fw / 2 + i * 0.03)),
    y: Math.min(1 - fh, Math.max(0, cy - fh / 2 + i * 0.04)),
    w: fw,
    h: fh,
  });
}
const addPictureWidget = (state, w, h2, i = 0, at = null) => addSizedWidget('image', state, w, h2, i, at);
async function pastePictures(files, at = null, word = 'pasted') {
  if (screen.paused) { toast('This screen is paused — press “Carry on” first.'); return; }
  beginInteraction({ type: 'paste' });   // one undo step, however it happened (keys, right-click menu or dragging)
  for (const [i, file] of files.slice(0, 6).entries()) {
    const { blob, w, h: hh } = await shrinkPasted(file);
    const id = uid('asset');
    await db.putAsset({ id, blob, name: file.name && file.name !== 'image.png' ? file.name : `pasted-picture.${blob.type === 'image/png' ? 'png' : 'jpg'}`, type: blob.type, created: Date.now() });
    addPictureWidget({ imageAssetId: id }, w, hh, i, at);
  }
  settleSoon(300);
  toast(files.length > 1 ? `${Math.min(files.length, 6)} pictures ${word}` : `Picture ${word}`);
}

// ---------- drop files on the screen: pictures, videos and sounds become widgets where you drop them ----------
const videoSize = (url) => new Promise((res) => {
  const v = document.createElement('video');
  v.preload = 'metadata'; v.muted = true;
  const done = (w, h2) => { v.removeAttribute('src'); v.load(); res([w || 16, h2 || 9]); };
  v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
  v.onerror = () => done(16, 9);
  setTimeout(() => done(16, 9), 4000);
  v.src = url;
});
async function dropFiles(files, at) {
  if (screen.paused) { toast('This screen is paused — press “Carry on” first.'); return; }
  const pics = files.filter((f) => f.type.startsWith('image/'));
  const vids = files.filter((f) => f.type.startsWith('video/'));
  const sounds = files.filter((f) => f.type.startsWith('audio/'));
  const other = files.length - pics.length - vids.length - sounds.length;
  if (pics.length) await pastePictures(pics, at, 'added');
  beginInteraction({ type: 'paste' });
  let i = pics.length;
  for (const f of vids.slice(0, 4)) {
    if (f.size > 300e6) { toast(`“${f.name}” is very big — choose a shorter clip (under 300 MB).`); continue; }
    const id = uid('asset');
    await db.putAsset({ id, blob: f, name: f.name, type: f.type, created: Date.now() });
    const url = URL.createObjectURL(f);
    const [w, hh] = await videoSize(url);
    URL.revokeObjectURL(url);
    addSizedWidget('videoloop', { clipAssetId: id, fileName: f.name, label: f.name.replace(/\.[^.]+$/, '') }, w, hh, i++, at);
  }
  for (const f of sounds.slice(0, 4)) {
    const id = uid('asset');
    await db.putAsset({ id, blob: f, name: f.name, type: f.type, created: Date.now() });
    addSizedWidget('audio', { audioAssetId: id, label: f.name.replace(/\.[^.]+$/, '') }, 520, 220, i++, at);
  }
  settleSoon(300);
  if (vids.length || sounds.length) toast([vids.length && `${vids.length} video${vids.length === 1 ? '' : 's'}`, sounds.length && `${sounds.length} sound${sounds.length === 1 ? '' : 's'}`].filter(Boolean).join(' and ') + ' added');
  if (other) toast('Only pictures, videos and sound files can be dropped on the screen.');
}
/** Something dragged in from another window carrying files (or a picture from a web page). */
const carriesFiles = (e) => [...(e.dataTransfer?.types || [])].some((t) => t === 'Files' || t === 'text/uri-list');
let dragDepth = 0;
const dropHint = h('div', { class: 'drop-hint', hidden: true, 'aria-hidden': 'true' }, h('span', {}, 'Drop to add it to the screen'));
document.body.append(dropHint);
const hideHint = () => { dragDepth = 0; dropHint.hidden = true; };
boardEl.addEventListener('dragenter', (e) => { if (!carriesFiles(e)) return; dragDepth++; dropHint.hidden = false; });
boardEl.addEventListener('dragleave', () => { if (--dragDepth <= 0) hideHint(); });
boardEl.addEventListener('dragover', (e) => { if (carriesFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
boardEl.addEventListener('drop', (e) => {
  hideHint();
  if (e.defaultPrevented || !screen) return;   // a widget took it (e.g. dropping onto an Image widget fills that widget)
  e.preventDefault();
  const r = boardEl.getBoundingClientRect();
  const at = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  const files = [...(e.dataTransfer.files || [])];
  const saved = files.find((f) => /\.(classroom|zip|json)$/i.test(f.name));
  if (saved) { openFileForImport(saved); return; }   // a saved screens file: choose which screens to add
  if (files.length) { dropFiles(files, at); return; }
  // a picture dragged straight from a web page arrives as a link
  const html = e.dataTransfer.getData('text/html') || '';
  const src = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  const link = (src || e.dataTransfer.getData('text/uri-list').split('\n').find((l) => l && !l.startsWith('#')) || '').trim();
  if (!/^(https?:|data:image\/)/i.test(link)) return;
  beginInteraction({ type: 'paste' });
  const img = new Image();
  img.onload = () => { addPictureWidget({ url: link }, img.naturalWidth || 4, img.naturalHeight || 3, 0, at); settleSoon(300); };
  img.onerror = () => toast('That doesn’t look like a picture. Try saving it and dropping the file.');
  img.src = link;
});
document.addEventListener('drop', hideHint);
document.addEventListener('dragend', hideHint);
const IMAGE_LINK = /^(https?:\/\/\S+\.(png|jpe?g|gif|webp|svg|avif)(\?\S*)?|data:image\/[a-z+]+;base64,\S+)$/i;
document.addEventListener('paste', (e) => {
  if (e.defaultPrevented || !screen || e.target.closest?.('dialog[open], .side-settings')) return;   // pasting into a menu or settings box: leave it alone
  const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const files = [...(e.clipboardData?.items || [])].filter((it) => it.kind === 'file' && it.type.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean);
  const text = (e.clipboardData?.getData('text/plain') || '').trim();
  if (files.length) {
    // A picture can't go into a text box, so it becomes a widget even while typing — unless there's text to paste too.
    if (typing && text) return;
    e.preventDefault();
    pastePictures(files);
  } else if (!typing && IMAGE_LINK.test(text)) {
    e.preventDefault();
    beginInteraction({ type: 'paste' });
    const img = new Image();
    img.onload = () => { addPictureWidget({ url: text }, img.naturalWidth || 4, img.naturalHeight || 3); settleSoon(300); };
    img.onerror = () => { addPictureWidget({ url: text }, 4, 3); settleSoon(300); };
    img.src = text;
    toast('Picture link pasted');
  }
});

function chooseFiles({ folder = false, accept = 'image/*,video/*' } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple: true, style: { display: 'none' } });
    if (folder) input.setAttribute('webkitdirectory', '');
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

function backgroundDialog() {
  const cur = () => screen.background || {};
  const set = async (bg) => {
    screen.background = bg;
    await applyBackground();
    persist();
    syncControls();
  };
  // Tweak the current moving background (speed, darken, slideshow timing) without starting over.
  const tweak = debounce(async (patch) => { await set({ ...cur(), ...patch }); }, 250);

  // --- library: ready-made pictures and loops that come with the site
  const libGrid = h('div', { class: 'bg-lib-grid' }, h('p', { class: 'hint' }, 'Loading…'));
  const libTiles = [];
  const fmtSecs = (d) => (d >= 60 ? `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}` : `${Math.round(d)}s`);
  loadLibrary().then((items) => {
    if (!items.length) { libGrid.replaceChildren(h('p', { class: 'hint' }, 'No library backgrounds yet.')); return; }
    libGrid.replaceChildren(...items.map((it) => {
      const thumb = h('img', { src: libURL(it.thumb, it.v), alt: '', loading: 'lazy' });
      const tile = h('button', {
        class: 'bg-lib-tile', title: it.name, 'aria-label': `Library background: ${it.name}${it.kind === 'video' ? ' (moving)' : ''}`,
        onclick: () => {
          const url = libURL(it.file, it.v);
          set(it.kind === 'video' ? { type: 'video', url, lib: it.file, name: it.name, dim: cur().dim || 0 } : { type: 'image', value: url, lib: it.file, name: it.name });
        },
      },
        h('span', { class: 'bg-lib-pic' }, thumb, it.kind === 'video' ? h('span', { class: 'bg-lib-badge' }, `▶ ${fmtSecs(it.duration || 0)}`) : null),
        h('small', {}, it.name),
      );
      tile.dataset.file = it.file;
      // Hover (mouse) plays a little preview of a moving background.
      if (it.kind === 'video') {
        let pv = null;
        tile.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'mouse' || pv) return;
          pv = h('video', { class: 'bg-lib-preview', src: libURL(it.file, it.v), muted: true, loop: true, autoplay: true, playsinline: true, preload: 'auto' });
          pv.muted = true;
          tile.firstChild.append(pv);
          pv.play().catch(() => {});
        });
        tile.addEventListener('pointerleave', () => { if (pv) { pv.pause(); pv.removeAttribute('src'); pv.load(); pv.remove(); pv = null; } });
      }
      libTiles.push(tile);
      return tile;
    }));
    syncControls();
  });

  // --- animated
  const speed = h('input', { type: 'range', min: 0.25, max: 2, step: 0.25, 'aria-label': 'Speed' });
  speed.addEventListener('input', () => tweak({ speed: Number(speed.value) }));
  const dim = h('input', { type: 'range', min: 0, max: 70, step: 5, 'aria-label': 'Darken' });
  dim.addEventListener('input', () => tweak({ dim: Number(dim.value) }));
  const animTiles = Object.entries(ANIMS).map(([k, a]) => h('button', {
    class: 'bg-anim-tile', style: { background: a.base }, title: a.label, 'aria-label': `Animated background: ${a.label}`,
    onclick: () => set({ type: 'anim', preset: k, speed: cur().type === 'anim' ? cur().speed || 1 : 1, dim: cur().dim || 0 }),
  }, h('span', { class: 'bg-anim-ic' }, a.icon), h('small', {}, a.label)));
  const speedRow = h('label', { class: 'bg-slider' }, h('span', {}, '🐢 Speed 🐇'), speed);
  const dimRow = h('label', { class: 'bg-slider' }, h('span', {}, '🌗 Darken (helps widgets stand out)'), dim);

  // --- video / web link / Drive / YouTube
  const urlIn = h('input', { type: 'url', placeholder: 'Paste a link: video, picture, GIF, YouTube or Google Drive' });
  const useLink = () => {
    const l = classifyLink(urlIn.value);
    if (!l) return;
    if (l.type === 'image') set({ type: 'image', value: l.value });
    else set({ ...l, dim: cur().dim || 0 });
    if (l.type === 'drive') toast('Google Drive: the file must be shared as “Anyone with the link”. Videos over about 100 MB can’t play this way.', { ms: 9000 });
    if (l.type === 'youtube') toast('YouTube plays muted and looping. It needs the internet, and school filters may block it.', { ms: 8000 });
  };
  urlIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') useLink(); });
  const uploadVideo = async () => {
    const [f] = await chooseFiles({ accept: 'video/*' });
    if (!f) return;
    if (f.size > 300e6) { toast('That video is very big — use a short clip (under 300 MB, ideally under 50 MB).'); return; }
    const id = uid('asset');
    await db.putAsset({ id, blob: f, name: f.name, type: f.type });
    set({ type: 'video', assetId: id, dim: cur().dim || 0 });
  };

  // --- slideshow from a folder
  const every = h('select', { 'aria-label': 'Change picture every' }, ...[[5, '5 seconds'], [10, '10 seconds'], [15, '15 seconds'], [30, '30 seconds'], [60, '1 minute'], [300, '5 minutes']].map(([v, t]) => h('option', { value: v }, t)));
  every.addEventListener('change', () => tweak({ every: Number(every.value) }));
  const effect = h('select', { 'aria-label': 'Effect' }, h('option', { value: 'fade' }, 'Fade'), h('option', { value: 'kenburns' }, 'Slow zoom (Ken Burns)'));
  effect.addEventListener('change', () => tweak({ effect: effect.value }));
  const progress = h('p', { class: 'hint', hidden: true });
  const slideshowFrom = async (folder) => {
    const files = (await chooseFiles({ folder })).filter((f) => /^(image|video)\//.test(f.type) || /\.(jpe?g|png|gif|webp|avif|mp4|webm|mov)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, MAX_SLIDES);
    if (!files.length) return;
    const ids = [];
    const kinds = [];
    progress.hidden = false;
    for (let i = 0; i < files.length; i++) {
      progress.textContent = `Adding ${i + 1} of ${files.length}…`;
      const f = files[i];
      const isVid = f.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(f.name);
      const blob = isVid ? f : await shrinkForScreen(f);
      const id = uid('asset');
      await db.putAsset({ id, blob, name: f.name, type: blob.type || f.type });
      ids.push(id);
      kinds.push(isVid ? 'video' : 'image');
    }
    progress.hidden = true;
    set({ type: 'slides', assetIds: ids, kinds, every: Number(every.value) || 15, effect: effect.value, shuffle: true, dim: cur().dim || 0, folder: files[0].webkitRelativePath?.split('/')[0] || '' });
  };

  const animControls = h('div', { class: 'bg-controls' }, speedRow);
  const slideControls = h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', {}, 'Change every'), every), h('label', { class: 'field' }, h('span', {}, 'Effect'), effect));
  const now = h('p', { class: 'bg-now' });
  function syncControls() {
    const b = cur();
    animTiles.forEach((t, i) => t.classList.toggle('on', b.type === 'anim' && Object.keys(ANIMS)[i] === b.preset));
    libTiles.forEach((t) => t.classList.toggle('on', b.lib === t.dataset.file));
    speed.value = String(b.speed || 1);
    dim.value = String(b.dim || 0);
    animControls.hidden = b.type !== 'anim';
    dimRow.hidden = !MOVING_TYPES.includes(b.type);
    every.value = String(b.every || 15);
    effect.value = b.effect || 'fade';
    const what = b.lib ? `Library: ${b.name || b.lib}` : { anim: `Animated: ${ANIMS[b.preset]?.label || ''}`, video: b.assetId ? 'Your video' : 'Video link', youtube: 'YouTube video', drive: 'Google Drive file', slides: `Slideshow: ${b.assetIds?.length || 0} items${b.folder ? ` from “${b.folder}”` : ''}`, image: 'Picture', gradient: 'Gradient', color: 'Colour' }[b.type] || '';
    now.textContent = what ? `Now showing: ${what}` : '';
  }

  // Four tabs instead of one long list: ready-made, animated, colours, or your own.
  const ownPicture = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    const id = uid('asset');
    await db.putAsset({ id, blob: f, name: f.name, type: f.type });
    set({ type: 'image', assetId: id });
  };
  const PANELS = [
    ['library', '📚 Library', [h('p', { class: 'hint' }, 'Pictures and gentle moving loops that come with the site. Hover (or tap) to preview.'), libGrid]],
    ['anim', '✨ Animated', [h('div', { class: 'bg-anim-grid' }, ...animTiles), animControls]],
    ['colour', '🎨 Colours', [
      h('h3', {}, 'Gradients'),
      h('div', { class: 'bg-grid' }, ...Object.entries(GRADIENTS).map(([k, v]) => h('button', { class: 'bg-swatch', style: { backgroundImage: v }, 'aria-label': k, title: k, onclick: () => set({ type: 'gradient', value: k }) }))),
      h('h3', {}, 'Plain colours'),
      h('div', { class: 'bg-grid' },
        ...SOLIDS.map((c) => h('button', { class: 'bg-swatch', style: { background: c }, 'aria-label': c, onclick: () => set({ type: 'color', value: c }) })),
        (() => {
          const ci = h('input', { type: 'color', value: '#88ccee', 'aria-label': 'Custom colour', class: 'bg-swatch' });
          ci.addEventListener('input', () => set({ type: 'color', value: ci.value }));
          return ci;
        })()),
    ]],
    ['own', '📁 Your own', [
      h('h3', {}, 'From this computer'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: ownPicture }, '🖼️ A picture'),
        h('button', { class: 'btn', onclick: uploadVideo }, '🎬 A looping video'),
      ),
      h('p', { class: 'hint' }, 'They stay on this computer (big photos are shrunk to screen size). Short MP4 loops of 10–30 seconds work best; videos play muted.'),
      h('h3', {}, 'A link — YouTube, Google Drive, or a video or picture on the web'),
      h('div', { class: 'row stretch' }, urlIn, h('button', { class: 'btn', onclick: useLink }, 'Use link')),
      h('p', { class: 'hint' }, 'Google Drive: share the file as “Anyone with the link”, then paste its link here.'),
      h('h3', {}, 'A slideshow'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => slideshowFrom(true) }, '📁 Choose a folder'),
        h('button', { class: 'btn', onclick: () => slideshowFrom(false) }, 'Choose pictures'),
      ),
      slideControls,
      progress,
      h('p', { class: 'hint' }, 'Videos in the folder play through once each.'),
    ]],
  ];
  const b0 = cur();
  const startTab = b0.lib ? 'library' : b0.type === 'anim' ? 'anim' : ['gradient', 'color'].includes(b0.type) ? 'colour' : 'own';
  const tabBtns = [];
  const panels = PANELS.map(([id, label, kids]) => {
    const panel = h('div', { class: 'bg-panel', role: 'tabpanel', 'aria-label': label }, ...kids);
    const btn = h('button', { class: 'bg-tab', role: 'tab', onclick: () => show(id) }, label);
    btn.dataset.id = id; panel.dataset.id = id;
    tabBtns.push(btn);
    return panel;
  });
  const tabBar = h('div', { class: 'bg-tabs', role: 'tablist' }, ...tabBtns);
  function show(id) {
    tabBtns.forEach((b) => { const on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    panels.forEach((p) => (p.hidden = p.dataset.id !== id));
  }
  show(startTab);
  modal('Background',
    now,
    dimRow,
    tabBar,
    ...panels,
  );
  syncControls();
}

// ---------- sharing ----------
function shareDialog() {
  persist.flush();
  const hasNames = screen.widgets.some((w) => (WIDGETS[w.type]?.privateKeys || []).some((k) => {
    const v = w.state[k];
    return v && (Array.isArray(v) ? v.length : String(v).trim().length);
  }) || (w.state?.source && w.state.source !== 'own'));   // uses a class list
  const out = h('textarea', { class: 'share-url', readonly: true, rows: 3 });
  const notes = h('p', { class: 'hint' });
  const warn = h('div', { class: 'share-warn', hidden: true, role: 'alert' });
  const includeNames = h('input', { type: 'checkbox' });
  includeNames.checked = true;   // sharing a class screen with its class lists is the usual case; untick to leave them out
  const copyBtn = h('button', { class: 'btn primary' }, '📋 Copy link');
  const fileBtn = h('button', { class: 'btn', onclick: () => { dlg.close(); exportDialog([screen.id]); } }, '💾 Save to a file instead');
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
      if (screen.background?.assetId || screen.background?.assetIds?.length) which.unshift('Background');
      lines.push(h('p', {}, h('b', {}, '⚠️ Your files won’t be in this link. '), `Pictures, video clips and sounds you added from this computer stay on this computer, so people opening the link will see empty widgets: ${which.join(', ')}.`));
    }
    if (other.length) lines.push(h('p', {}, h('b', {}, files.length ? 'Also missing: ' : '⚠️ Not in this link: '), `${other.join(', ')}.`));
    if (lines.length) lines.push(h('p', {}, 'To share everything, save it to a file and send that instead (they open it with ☰ → “Add screens from a file”, or drag it onto their screen).'));
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
    if (missing.some((d) => d.startsWith('uploaded'))) toast('Link copied — remember it doesn’t include your pictures, clips or sounds.', { action: '💾 Save to a file', onAction: () => exportDialog([screen.id]), ms: 8000 });
    setTimeout(() => (copyBtn.textContent = label), 2000);
  });
  const dlg = modal('Share this screen',
    h('p', {}, 'Anyone who opens this link gets their own copy of this screen layout.'),
    warn,
    hasNames ? h('label', { class: 'check' }, includeNames, h('span', {}, 'Include class lists and student names (and calendar events). Anyone with the link will see them, so only share it with colleagues.')) : null,
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
  if (screens.length >= (await db.listScreens()).length) markBackedUp();   // every screen saved = a backup
}

async function importDialog() {
  const f = await pickFile('.classroom,.zip,.json,application/json,application/zip');
  if (f) openFileForImport(f);
}
async function openFileForImport(f) {
  try { openImport(await readProjectFile(f)); }
  catch (e) { toast(e.message || 'That file could not be opened.'); }
}

/** A screen's contents without anything that differs from computer to computer (ids, stored-file ids). */
function screenSignature(sc) {
  const clean = (v) => JSON.stringify(v, (k, x) => (/AssetIds?$/.test(k) || k === 'id' || k === 'source' || k === 'updated' || k === 'order' ? undefined : x));
  return clean({ n: sc.name, b: sc.background, w: (sc.widgets || []).map((w) => ({ t: w.type, s: w.state, x: w.x, y: w.y, w: w.w, h: w.h })) });
}
const widgetIcons = (sc) => [...new Set((sc.widgets || []).map((w) => WIDGETS[w.type]?.icon).filter(Boolean))].slice(0, 7).join(' ');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One window for bringing screens in — from a file, a link or a file dropped on the screen.
 * Tick the screens you want; ones you already have are unticked; nothing changes until "Add".
 */
async function openImport(parsed, { blankToRemove = null } = {}) {
  persist.flush();
  const mine = await db.listScreens();
  const mySigs = new Map(mine.flatMap((m) => [[screenSignature(m), m], ...(m.copiedFrom ? [[m.copiedFrom, m]] : [])]));
  const items = parsed.screens.map((sc) => {
    const already = mySigs.get(screenSignature(sc)) || null;
    const box = h('input', { type: 'checkbox', 'aria-label': `Add ${sc.name || 'screen'}` });
    box.checked = !already;
    return { sc, already, box };
  });
  const classesOf = (list) => {
    if (parsed.backup && list.length) return parsed.classes || [];   // restoring a backup brings every class list
    const used = new Set(list.flatMap((it) => [...classIdsUsed(it.sc, parsed.currentClass)]));
    return (parsed.classes || []).filter((c) => used.has(c.id));
  };
  const addBtn = h('button', { class: 'btn primary' });
  const classLine = h('p', { class: 'imp-classes' });
  const allBox = h('input', { type: 'checkbox', 'aria-label': 'Choose all screens' });
  const sync = () => {
    const chosen = items.filter((it) => it.box.checked);
    addBtn.disabled = !chosen.length;
    addBtn.textContent = parsed.kind === 'link' && items.length === 1 ? 'Add it to my screens' : chosen.length ? `Add ${plural(chosen.length, 'screen')}` : 'Choose a screen to add';
    const cls = classesOf(chosen);
    classLine.textContent = cls.length ? `👥 Comes with class list${cls.length === 1 ? '' : 's'}: ${cls.map((c) => `${c.name} (${plural(c.students.length, 'student')})`).join(', ')} — added to your classes.` : '';
    classLine.hidden = !cls.length;
    allBox.checked = chosen.length === items.length;
    allBox.indeterminate = chosen.length > 0 && chosen.length < items.length;
  };
  allBox.addEventListener('change', () => { items.forEach((it) => (it.box.checked = allBox.checked)); sync(); });
  const rows = items.map((it) => {
    it.box.addEventListener('change', sync);
    const bits = [plural((it.sc.widgets || []).length, 'widget')];
    if (hasFiles(it.sc, parsed)) bits.push('📎 has its own pictures/sounds');
    return h('label', { class: `imp-row${it.already ? ' already' : ''}` },
      it.box,
      h('span', { class: 'imp-main' },
        h('b', {}, it.sc.name || 'Untitled screen'),
        h('small', {}, bits.join(' · ')),
        widgetIcons(it.sc) ? h('span', { class: 'screen-icons', 'aria-hidden': 'true' }, widgetIcons(it.sc)) : null),
      it.already ? h('span', { class: 'imp-badge' }, 'You already have this') : null);
  });
  const intro = parsed.kind === 'link'
    ? 'Someone shared a screen with you. Add it to your screens? Your own screens won’t change.'
    : `${parsed.name ? `“${parsed.name.replace(/\.(classroom|zip|json)$/i, '')}” has` : 'This file has'} ${plural(items.length, 'screen')}. Tick the ones you want — they’re added alongside your screens, which won’t change.`;
  const dlg = modal(parsed.kind === 'link' ? 'A shared screen' : 'Add screens from a file',
    h('p', {}, intro),
    items.length > 1 ? h('label', { class: 'check imp-all' }, allBox, h('span', {}, 'All screens')) : null,
    h('div', { class: 'imp-list' }, ...rows),
    classLine,
    h('div', { class: 'row end' },
      items.length === 1 && items[0].already ? h('button', { class: 'btn', onclick: async () => { dlg.close(); await openScreen(items[0].already); } }, 'Open the one I have') : null,
      h('button', { class: 'btn', onclick: () => dlg.close() }, parsed.kind === 'link' ? 'No thanks' : 'Cancel'),
      addBtn),
  );
  addBtn.addEventListener('click', async () => {
    const chosen = items.filter((it) => it.box.checked).map((it) => it.sc);
    if (!chosen.length) return;
    addBtn.disabled = true;
    if (await addChosen(parsed, chosen, blankToRemove)) dlg.close();
    else addBtn.disabled = false;
  });
  // 👁 Preview: have a look first, without adding anything
  rows.forEach((row, i) => row.append(h('button', { class: 'btn small imp-preview', title: 'Have a look without adding it (opens in a new tab, so your screen keeps running)', onclick: async (e) => {
    e.preventDefault();
    if (await previewInNewTab(parsed, items[i].sc)) return;   // this window stays open, to choose screens to add
    dlg.close(); startPreview(parsed, items[i].sc, blankToRemove);
  } }, '👁 Preview')));
  // Another tab copied a screen in (e.g. from a preview): mark it as one you already have.
  const refresh = async () => {
    if (!dlg.open) { removeEventListener('mcs-screens-added', refresh); return; }
    const now = await db.listScreens();
    const sigs = new Set(now.flatMap((m) => [screenSignature(m), m.copiedFrom].filter(Boolean)));
    items.forEach((it, i) => {
      if (it.already || !sigs.has(screenSignature(it.sc))) return;
      it.already = true; it.box.checked = false;
      rows[i].classList.add('already');
      rows[i].querySelector('.imp-main').after(h('span', { class: 'imp-badge' }, 'You already have this'));
    });
    sync();
  };
  addEventListener('mcs-screens-added', refresh);
  sync();
}

/** Add screens from a file or link alongside the teacher's own, and show the first one. */
async function addChosen(parsed, chosen, blankToRemove = null) {
  try {
    const { screens: added, addedClasses } = await addImported(parsed, chosen);
    const names = new Set((await db.listScreens()).map((x) => x.name));
    const top = Math.max(-1, ...(await db.listScreens()).map((x) => (Number.isFinite(x.order) ? x.order : -1)));
    added.forEach((sc, i) => {
      let name = sc.name || 'Shared screen';
      for (let n = 2; names.has(name); n++) name = `${sc.name || 'Shared screen'} (${n})`;
      sc.name = name; names.add(name);
      sc.order = top + 1 + i;   // new screens go at the end of your list
    });
    for (const sc of added) await db.putScreen(sc);
    // A first-time visitor's empty starter screen isn't needed once they have the shared one.
    if (blankToRemove && !undoStack.length && !redoStack.length) {   // they haven't done anything on it yet
      if (screen?.id === blankToRemove.id) persist.cancel();
      deletedScreens.add(blankToRemove.id);
      await db.deleteScreen(blankToRemove.id);
    }
    if (previewing?.inTab) {
      // In a preview tab the preview stays; the screens just join your screens (your home tab is told).
      added.forEach((sc) => notifyAdded(sc.name));
      dispatchEvent(new Event('mcs-screens-added'));
    } else await openScreen(added[0]);
    renderDrawer();
    toast(`Added ${added.length === 1 ? `“${added[0].name}”` : plural(added.length, 'screen')}. Your other screens are unchanged.${addedClasses.length ? ` Class list${addedClasses.length === 1 ? '' : 's'} added: ${addedClasses.join(', ')}.` : ''}`, { ms: 7000 });
    return true;
  } catch (e) {
    console.error(e);
    toast('Those screens couldn’t be added — the file may be damaged.');
    return false;
  }
}

/**
 * Look at a screen from a file or link without adding it. Nothing is saved, nothing of yours changes;
 * a banner offers "Add to my screens" or "Close preview" (back to your own screen).
 */
// ---------- previews: looking at a screen from a file or link without adding it ----------
// On a computer a preview opens in a new tab, so your own screen keeps running in this one.
// The file is held briefly in this browser's storage for the new tab to read; leftovers go after a day.
const PREVIEW_TTL = 24 * 60 * 60 * 1000;
const previewTabOK = () => innerWidth >= 700;   // phones and small tablets preview in place
async function previewInNewTab(parsed, raw) {
  if (!previewTabOK() || previewTabId) return false;   // already in a preview tab: preview here
  const index = parsed.screens.indexOf(raw);
  const source = parsed.kind === 'link' ? { kind: 'link', data: parsed.data } : parsed.file ? { kind: 'file', file: parsed.file, name: parsed.name } : null;
  if (!source || index < 0) return false;
  const id = uid('preview');
  const win = window.open(`${location.pathname}?preview=${id}`, '_blank');
  if (!win) return false;   // pop-ups blocked: preview here instead
  const all = await db.getMeta('previews', {});
  all[id] = { ...source, index, created: Date.now(), touched: Date.now(), assetIds: [] };
  await db.setMeta('previews', all);
  toast('👁 Opened in a new tab. This window stays open, so you can choose screens to add.');
  return true;
}
async function cleanOldPreviews() {
  const all = await db.getMeta('previews', {});
  let changed = false;
  for (const [id, p] of Object.entries(all)) if (Date.now() - (p.touched || p.created || 0) > PREVIEW_TTL) { delete all[id]; changed = true; }
  if (changed) await db.setMeta('previews', all);
  return all;
}
/** Pictures and sounds that previews open in other tabs are using (so the tidy-up leaves them). */
async function previewAssetIds() {
  const all = await db.getMeta('previews', {});
  return Object.values(all).filter((p) => Date.now() - (p.touched || 0) < 2 * 60 * 60 * 1000).flatMap((p) => p.assetIds || []);
}
let previewTabId = new URLSearchParams(location.search).get('preview');
async function touchPreviewRecord() {
  if (!previewTabId || !previewing || !screen) return;
  const all = await db.getMeta('previews', {});
  if (!all[previewTabId]) return;
  all[previewTabId].touched = Date.now();
  all[previewTabId].assetIds = [...assetIdsOfScreen(screen)];
  await db.setMeta('previews', all);
}

const previewPill = h('button', { class: 'pill preview-pill', hidden: true, title: 'Show the preview bar (copy this screen, or close the preview)', onclick: () => { if (previewing) { previewing.banner.hidden = false; previewPill.hidden = true; } } }, '👁 Preview');

async function startPreview(parsed, raw, blankToRemove = null) {
  persist.flush();
  commitPending();
  const inTab = !!previewTabId;   // this tab was opened just for previewing
  const backId = previewing ? previewing.backId : screen?.id;
  const shown = await previewImported(parsed, raw);
  const from = parsed.kind === 'link' ? 'a share link' : parsed.name ? `“${parsed.name.replace(/\.(classroom|zip|json)$/i, '')}”` : 'a file';
  const close = async () => {
    if (inTab) {
      if (changedSinceCopy() && !confirm('Close this preview? Changes you haven’t copied to your screens will be lost.')) return;
      previewing.cleanKey = comparable(screen);   // no second "leave site?" question
      window.close();
      await new Promise((res) => setTimeout(res, 300));
      // Still here (the browser wouldn't close it): show your own screens in this tab instead.
      previewTabId = null; history.replaceState(null, '', location.pathname);
    }
    const back = backId && (await db.getScreen(backId)); await openScreen(back || (await sortedScreens())[0]);
  };
  const others = parsed.screens.length > 1;
  const copyBtn = h('button', { class: 'btn primary small' }, '➕ Copy to my screens');
  const banner = h('div', { class: 'preview-banner', role: 'status' },
    h('span', {}, h('b', {}, `👁 Looking at “${raw.name || 'screen'}”`), ` from ${from} — nothing here is saved automatically.`),
    copyBtn,
    others ? h('button', { class: 'btn small', onclick: async () => { if (inTab) { openImport(parsed, {}); return; } await close(); openImport(parsed, { blankToRemove }); } }, '↩ Other screens in the file') : null,
    h('button', { class: 'btn small', onclick: close }, inTab ? '✕ Close this tab' : '✕ Close preview'),
    h('button', { class: 'w-btn preview-hide', title: 'Hide this bar (👁 Preview at the top brings it back)', 'aria-label': 'Hide this bar', onclick: () => { banner.hidden = true; previewPill.hidden = false; } }, '✕'),
  );
  copyBtn.addEventListener('click', async () => {
    copyBtn.disabled = true;
    try { await copyPreview(); } finally { copyBtn.disabled = false; }
    copyBtn.textContent = '⟳ Update my copy';
    copyBtn.title = 'Copy your latest changes to the screen you copied (it doesn’t make another one)';
  });
  if (previewing) previewing.banner.remove();
  previewing = { backId, parsed, raw, banner, inTab, copiedId: null, cleanKey: '' };
  document.body.classList.add('previewing');
  document.body.append(banner);
  previewPill.hidden = true;
  if (!previewPill.isConnected) nameBtn.after(previewPill);
  screen = shown;
  board.load(screen);
  previewing.cleanKey = comparable(screen);
  updatePauseBadge();
  await applyBackground();
  nameBtn.textContent = `👁 ${shown.name}`;
  document.title = `👁 ${shown.name} (preview) · My Classroom Screen`;
  touchPreviewRecord();
}
const changedSinceCopy = () => !!(previewing && screen && comparable(screen) !== previewing.cleanKey);

/** "Copy to my screens" (first time) / "Update my copy" (after): the screen as it is now. */
async function copyPreview() {
  if (!previewing || !screen) return;
  commitPending();
  const { parsed, raw } = previewing;
  const s = await copyPreviewToMine(parsed, raw, screen);
  s.copiedFrom = screenSignature(raw);   // so the import window knows you have it, even if you changed it
  const old = previewing.copiedId && (await db.getScreen(previewing.copiedId));
  if (old) { s.id = old.id; s.order = old.order; s.name = old.name; if (old.group) s.group = old.group; else delete s.group; }
  else {
    const names = new Set((await db.listScreens()).map((x) => x.name));
    const base = s.name || 'Shared screen';
    for (let n = 2; names.has(s.name); n++) s.name = `${base} (${n})`;
  }
  await db.putScreen(s);
  previewing.copiedId = s.id;
  previewing.cleanKey = comparable(screen);
  notifyAdded(s.name);
  dispatchEvent(new Event('mcs-screens-added'));
  toast(old ? `⟳ Updated “${s.name}” in your screens.` : `➕ “${s.name}” is now in your screens. This is still a preview — changes from here on aren’t saved unless you press Update my copy.`, { ms: old ? 3000 : 7000 });
}
addEventListener('beforeunload', (e) => {
  if (previewing?.inTab && changedSinceCopy()) { e.preventDefault(); e.returnValue = ''; }
});

/** Save screens to a .classroom file: tick which ones (this screen is ticked to start with). */
async function exportDialog(preselect = null) {
  persist.flush();
  const all = await sortedScreens();
  const pick = new Set(preselect || [screen.id]);
  const items = all.map((sc) => {
    const box = h('input', { type: 'checkbox', 'aria-label': `Save ${sc.name}` });
    box.checked = pick.has(sc.id);
    return { sc, box };
  });
  const allBox = h('input', { type: 'checkbox', 'aria-label': 'Choose all screens' });
  const saveBtn = h('button', { class: 'btn primary' });
  const sync = () => {
    const n = items.filter((it) => it.box.checked).length;
    saveBtn.disabled = !n;
    saveBtn.textContent = n ? `💾 Save ${plural(n, 'screen')}` : 'Choose a screen to save';
    allBox.checked = n === items.length;
    allBox.indeterminate = n > 0 && n < items.length;
  };
  allBox.addEventListener('change', () => { items.forEach((it) => (it.box.checked = allBox.checked)); sync(); });
  const dlg = modal('Save to a file',
    h('p', {}, 'Saves a .classroom file to your Downloads with everything inside — pictures, clips, sounds, recordings and the class lists these screens use. Open it on any computer with ☰ → “Add screens from a file”, or drag it onto the screen.'),
    items.length > 1 ? h('label', { class: 'check imp-all' }, allBox, h('span', {}, 'All screens')) : null,
    h('div', { class: 'imp-list' }, ...items.map((it) => {
      it.box.addEventListener('change', sync);
      return h('label', { class: 'imp-row' }, it.box,
        h('span', { class: 'imp-main' },
          h('b', {}, it.sc.name + (it.sc.id === screen.id ? ' (showing now)' : '')),
          h('small', {}, plural(it.sc.widgets.length, 'widget')),
          widgetIcons(it.sc) ? h('span', { class: 'screen-icons', 'aria-hidden': 'true' }, widgetIcons(it.sc)) : null));
    })),
    h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => dlg.close() }, 'Cancel'), saveBtn),
  );
  saveBtn.addEventListener('click', async () => {
    const chosen = items.filter((it) => it.box.checked).map((it) => it.sc);
    if (!chosen.length) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    await exportScreens(chosen, chosen.length === 1 ? chosen[0].name : 'my-classroom-screens');
    dlg.close();
    toast(`Saved ${plural(chosen.length, 'screen')} to your Downloads.`);
  });
  sync();
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
  initTabs({
    onClaimed: stepAside,
    onClasses: reloadClassLists,
    onAdded: (name) => {
      if (previewing?.inTab) return;
      toast(`➕ “${name}” was copied to your screens from another tab.`);
      forgetGroups();
      if (drawer.classList.contains('open')) renderDrawer();
      dispatchEvent(new Event('mcs-screens-added'));
    },
  });
  const busy = await askOthers();   // screens other tabs are showing
  let chooseInThisTab = false;

  // Opened from a share link? Ask first (the same window as opening a file).
  let sharedLink = null;
  try { sharedLink = await readShareHash(); } catch (e) { console.error(e); toast('That share link looks broken or incomplete.'); }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  let starter = null;

  if (!target) {
    if (!screens.length) {
      const first = newScreenFrom(TEMPLATES[1], 'My first screen');
      await db.putScreen(first);
      screens = [first];
      starter = structuredClone(first);
    }
    const lastId = await db.getMeta('lastScreen');
    target = screens.find((s) => s.id === lastId) || screens[0];
    // Another tab already showing that screen? Start this tab on a free one and let the teacher choose.
    if (busy.has(target.id) && !sharedLink) {
      chooseInThisTab = true;
      target = screens.find((s) => !busy.has(s.id)) || target;
    }
  }
  // A preview opened in a new tab: show it, without opening (or taking from another tab) any of your screens.
  const previews = await cleanOldPreviews();
  const pv = previewTabId && previews[previewTabId];
  if (previewTabId && !pv) { toast('That preview has been closed or has expired.'); previewTabId = null; history.replaceState(null, '', location.pathname); }
  if (pv) {
    try {
      const parsed = pv.kind === 'link' ? parsedFromLinkData(pv.data) : await readProjectFile(new File([pv.file], pv.name || 'screens.classroom'));
      if (pv.kind === 'file') parsed.file = pv.file;
      await startPreview(parsed, parsed.screens[pv.index] || parsed.screens[0]);
      setInterval(touchPreviewRecord, 5 * 60 * 1000);
    } catch (e) {
      console.error(e); toast('That preview couldn’t be opened.'); previewTabId = null;
      await openScreen(target);
    }
  } else await openScreen(target);
  if (pv && previewTabId) { /* a preview tab: no start-up notes or questions */ return finishStartup(); }
  if (sharedLink) openImport(sharedLink, { blankToRemove: starter });
  if (chooseInThisTab) tabChooser(busy, await sortedScreens());
  setTimeout(() => startupNotes({ firstRun: !!starter }).catch(console.error), 800);   // welcome / what's new / end of term
  return finishStartup({ notes: true });
}

/** The rest of start-up, for every tab (a preview tab skips the notes and questions). */
async function finishStartup({ notes = false } = {}) {
  if (!notes) { await initBackup(() => { if (drawer.classList.contains('open')) renderDrawer(); }); return startSweeping(); }
  // Records from the removed Data feature: offer to download and delete them (once nothing else is open).
  setTimeout(() => !document.querySelector('dialog[open]') && checkOldRecords(), 2500);
  await initBackup(() => { if (drawer.classList.contains('open')) renderDrawer(); });
  setTimeout(() => maybeAskOnce(), 20000);   // asks once, quietly, on a second day of use
  startSweeping();
}

/** Tidy up files nothing uses any more (deleted widgets / screens), soon and every half hour. */
function startSweeping() {
  const sweep = async () => {
    persist.flush();
    const keep = board.lastRemoved ? [...assetIdsOfScreen({ widgets: [board.lastRemoved] })] : [];
    if (previewing && screen) keep.push(...assetIdsOfScreen(screen));
    keep.push(...(await previewAssetIds()));   // previews open in other tabs
    setTimeout(() => sweepAssets(keep).catch((e) => console.warn('tidy-up', e)), 1500); // after the save lands
  };
  setTimeout(sweep, 15000);
  setInterval(sweep, 30 * 60 * 1000);
}

init();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
