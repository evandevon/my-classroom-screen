// ⭐ My widgets: a library of widgets saved just as they were set up — settings, content, size,
// spot on the screen, colour theme and text size — to add again on any screen.
// Saved widgets start fresh when added (timers reset, picks and scores cleared; see each widget's
// fresh()). The library is one list for the whole app, kept in this browser (meta 'myWidgets')
// and included in "Back up everything". A saved widget is a copy: changing one on a screen
// doesn't change the saved one, or the other way round.

import { WIDGETS } from './widgets/index.js';
import { h, uid, toast } from './util.js';
import { db } from './storage.js';
import { fmtTime } from './widgets/_common.js';
import { sourceName } from './classes.js';
import { snapshotWidget } from './snapshot.js';

const KEY = 'myWidgets';
let cache = null;
const listeners = new Set();
export const onMyWidgetsChange = (fn) => listeners.add(fn);

export async function listMyWidgets() {
  if (!cache) cache = (await db.getMeta(KEY, [])) || [];
  return cache;
}
async function store(list) {
  cache = list;
  await db.setMeta(KEY, list);
  listeners.forEach((fn) => fn(list));
}
/** Forget the cached copy (another tab changed it, or a backup was restored). */
export function forgetMyWidgets() { cache = null; listeners.forEach((fn) => fn(null)); }

/** The widget's settings and content, with its activity reset (as when added from My widgets). */
export function freshState(type, state) {
  const s = structuredClone(state || {});
  const def = WIDGETS[type];
  try { def?.fresh?.(s); } catch (e) { console.warn('fresh', type, e); }
  for (const k of def?.volatileKeys || []) delete s[k];
  return s;
}

/** The first line of a text note's writing (lines are <div>, <p>, <br>, list items…). */
const firstLine = (html) => {
  const d = document.createElement('div');
  d.innerHTML = String(html || '').replace(/<\/?(br|p|div|li|ul|ol|h\d)\b[^>]*>/gi, '\n');
  return (d.textContent || '').split('\n').map((t) => t.replace(/\s+/g, ' ').trim()).find(Boolean) || '';
};
const short = (t, n = 28) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** A short description, e.g. "5:00 · Pack up" or "Science groups". */
export function summary(type, s = {}) {
  const bits = [];
  switch (type) {
    case 'timer': bits.push(fmtTime(s.duration || 0), s.label); break;
    case 'interval': bits.push(`${s.work}s on · ${s.rest}s off × ${s.rounds}`); break;
    case 'text': bits.push(short(firstLine(s.html))); break;
    case 'list': bits.push(s.heading); break;
    case 'nownext': bits.push(short(String(s.items || '').split('\n')[0] || '')); break;
    case 'countdown': bits.push(`${s.icon || ''} ${s.title || ''}`.trim()); break;
    case 'scoreboard': bits.push(short((s.teams || []).map((t) => t.name).join(' v '))); break;
    case 'gotoscreen': bits.push(s.label || (s.targetName ? `→ ${s.targetName}` : '')); break;
    case 'dice': bits.push(`${s.count} × d${s.sides}`); break;
    case 'traffic': break;
    default: bits.push(s.label, s.heading, s.title, s.question, typeof s.caption === 'string' ? s.caption : '', s.fileName);
  }
  if (s.source && s.source !== 'own' && !bits.some(Boolean)) {
    try { bits.push(s.source === 'current' ? 'current class' : sourceName(s.source)); } catch { /* no classes yet */ }
  }
  return bits.map((b) => (typeof b === 'string' ? b.trim() : b)).filter(Boolean).slice(0, 2).join(' · ');
}

const lc = (t) => String(t || '').trim().toLowerCase();
function freeName(want, list) {
  const taken = new Set(list.map((m) => lc(m.name)));
  let name = want;
  for (let n = 2; taken.has(lc(name)); n++) name = `${want} (${n})`;
  return name;
}

/** ☆ on a widget's title bar. */
export async function saveToMyWidgets(rec, el, { onRename } = {}) {
  const def = WIDGETS[rec.type];
  if (!def) return null;
  let thumb = null;
  try { thumb = await snapshotWidget(el); } catch (e) { console.warn('widget picture', e); }
  const list = await listMyWidgets();
  const sum = summary(rec.type, rec.state);
  const item = {
    id: uid('mw'),
    type: rec.type,
    name: freeName(sum ? `${def.title} · ${sum}` : def.title, list),
    x: rec.x, y: rec.y, w: rec.w, h: rec.h,
    ...(rec.theme ? { theme: rec.theme } : {}),
    ...(rec.shadow ? { shadow: true } : {}),
    ...(rec.fs && rec.fs !== 1 ? { fs: rec.fs } : {}),
    state: freshState(rec.type, rec.state),
    thumb,
    saved: Date.now(),
  };
  await store([item, ...list]);
  toast(`⭐ Saved to My widgets as “${item.name}”.`, {
    ms: 8000,
    actions: [
      ['Rename', () => onRename?.(item)],
      ['Undo', () => removeMyWidget(item.id, { quiet: true })],
    ],
  });
  return item;
}

export async function renameMyWidget(id, name) {
  const list = await listMyWidgets();
  const item = list.find((m) => m.id === id);
  if (!item || !name?.trim()) return;
  item.name = freeName(name.trim(), list.filter((m) => m !== item));
  await store([...list]);
}

export async function removeMyWidget(id, { quiet = false } = {}) {
  const list = await listMyWidgets();
  const i = list.findIndex((m) => m.id === id);
  if (i < 0) return;
  const [gone] = list.splice(i, 1);
  await store([...list]);
  if (quiet) return;
  toast(`Removed “${gone.name}” from My widgets.`, {
    ms: 8000,
    action: 'Undo',
    onAction: async () => {
      const now = await listMyWidgets();
      now.splice(Math.min(i, now.length), 0, gone);
      await store([...now]);
    },
  });
}

/** Files (pictures, sounds, clips) the saved widgets use: kept by the tidy-up. */
export async function myWidgetsAsScreen() {
  return { id: 'my-widgets', name: 'My widgets', widgets: (await listMyWidgets()).map((m) => ({ id: m.id, type: m.type, state: m.state })) };
}

/** From a backup file: add saved widgets that aren't here yet (the same type, name and settings). */
export async function restoreMyWidgets(items = []) {
  if (!items.length) return 0;
  const list = await listMyWidgets();
  const sig = (m) => JSON.stringify([m.type, lc(m.name), m.state]);
  const have = new Set(list.map(sig));
  const add = items.filter((m) => WIDGETS[m.type] && !have.has(sig(m))).map((m) => ({ ...m, id: uid('mw') }));
  if (add.length) await store([...list, ...add]);
  return add.length;
}

/** Where a saved widget goes on this screen: its saved spot, kept inside the edges, nudged off a twin. */
export function placeOnBoard(item, widgets) {
  const w = Math.min(item.w ?? 0.3, 0.98);
  const hh = Math.min(item.h ?? 0.3, 0.9);
  let x = Math.min(Math.max(0, item.x ?? 0.3), 1 - w);
  let y = Math.min(Math.max(0, item.y ?? 0.2), 1 - hh);
  for (let n = 0; n < 8 && widgets.some((o) => o.type === item.type && Math.abs(o.x - x) < 0.01 && Math.abs(o.y - y) < 0.01); n++) {
    x = Math.min(x + 0.03, 1 - w);
    y = Math.min(y + 0.04, 1 - hh);
  }
  return { x, y, w, h: hh };
}

/** The tray's contents: one card per saved widget. */
export function myWidgetCards(list, { onAdd, onRename, onRemove }) {
  if (!list.length) {
    return [h('div', { class: 'mw-empty' },
      h('p', {}, h('b', {}, 'Nothing saved yet.')),
      h('p', {}, 'Set up a widget just how you like it — size, spot, settings and content — then tap ', h('b', {}, '☆'), ' on its title bar. It’s kept here to add to any screen, starting fresh each time.'))];
  }
  return list.map((m) => {
    const def = WIDGETS[m.type];
    return h('div', { class: 'mw-card' },
      h('button', { class: 'mw-add', title: `Add “${m.name}” to this screen`, onclick: () => onAdd(m) },
        h('span', { class: 'mw-pic' },
          m.thumb ? h('img', { src: m.thumb, alt: '' }) : h('span', { class: 'mw-icon', 'aria-hidden': 'true' }, def?.icon || '▫️')),
        h('span', { class: 'mw-name' }, h('span', { class: 'mw-type', 'aria-hidden': 'true' }, def?.icon || ''), m.name)),
      h('div', { class: 'mw-tools' },
        h('button', { class: 'w-btn', title: 'Rename', 'aria-label': `Rename ${m.name}`, onclick: () => onRename(m) }, '✎'),
        h('button', { class: 'w-btn', title: 'Remove from My widgets', 'aria-label': `Remove ${m.name} from My widgets`, onclick: () => onRemove(m) }, '✕')));
  });
}
