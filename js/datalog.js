// Activity log: widgets record moments (points, tallies, timed sessions, noise warnings…)
// with a time, the class and the screen. Everything stays in this browser's IndexedDB —
// it is never put into share links or project files. Export is a CSV the teacher downloads.

import { db } from './storage.js';
import { uid, h } from './util.js';

let ctx = { getClass: () => '', getScreen: () => null };
const listeners = new Set();

/** main.js tells the log how to find the current class and screen. */
export function setLogContext(c) {
  ctx = { ...ctx, ...c };
}
export function onLogChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

/**
 * Record one event. Fields:
 *  widget (type), widgetId, kind, label (what), who (student/team), value (number), unit, note
 * Returns the stored event (so a widget can offer Undo).
 */
export async function logEvent(e) {
  const screen = ctx.getScreen();
  const ev = {
    id: uid('ev'),
    t: Date.now(),
    cls: ctx.getClass() || '',
    screen: screen?.name || '',
    widget: e.widget || '',
    widgetId: e.widgetId || '',
    kind: e.kind || '',
    label: e.label || '',
    who: e.who || '',
    value: typeof e.value === 'number' ? Math.round(e.value * 100) / 100 : 1,
    unit: e.unit || 'count',
    note: e.note || '',
  };
  try {
    await db.addEvent(ev);
    changed();
  } catch (err) {
    console.error('Could not record', err);
  }
  return ev;
}

export async function undoEvent(ev) {
  if (!ev) return;
  await db.deleteEvents([ev.id]);
  changed();
}

export async function allEvents() {
  const list = (await db.allEvents()) || [];
  return list.sort((a, b) => b.t - a.t);
}

export async function deleteEvents(ids) {
  await db.deleteEvents(ids);
  changed();
}

/** Remove records older than N days (0 = keep everything). */
export async function pruneOld(days) {
  if (!days) return 0;
  const cutoff = Date.now() - days * 86400000;
  const old = (await db.allEvents()).filter((e) => e.t < cutoff).map((e) => e.id);
  if (old.length) await deleteEvents(old);
  return old.length;
}

// ---------------------------------------------------------------- formatting
export const UNIT_LABEL = { points: 'points', count: '', seconds: 'seconds', level: 'level' };

export function fmtDuration(sec) {
  sec = Math.round(Math.abs(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

export function describe(ev) {
  if (ev.unit === 'seconds') return fmtDuration(ev.value);
  if (ev.unit === 'points') return `${ev.value > 0 ? '+' : ''}${ev.value} point${Math.abs(ev.value) === 1 ? '' : 's'}`;
  if (ev.unit === 'level') return `level ${Math.round(ev.value)}`;
  return ev.value === 1 ? '1' : String(ev.value);
}

const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const fmtClock = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

const COLS = [
  ['Date', (e) => fmtDate(e.t)],
  ['Time', (e) => fmtClock(e.t)],
  ['Day', (e) => new Date(e.t).toLocaleDateString([], { weekday: 'short' })],
  ['Class', (e) => e.cls],
  ['Widget', (e) => e.widget],
  ['Student / team', (e) => e.who],
  ['What', (e) => e.label],
  ['Amount', (e) => e.value],
  ['Unit', (e) => e.unit],
  ['Minutes', (e) => (e.unit === 'seconds' ? Math.round((e.value / 60) * 100) / 100 : '')],
  ['Note', (e) => e.note],
  ['Screen', (e) => e.screen],
];

/** CSV that opens cleanly in Excel / Google Sheets (with a BOM so emoji and accents survive). */
export function toCSV(events) {
  const esc = (v) => {
    const s = String(v ?? '');
    // Guard against spreadsheet formula injection from typed names/labels.
    const safe = /^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = [COLS.map((c) => c[0]).join(',')];
  for (const e of [...events].sort((a, b) => a.t - b.t)) rows.push(COLS.map(([, f]) => esc(f(e))).join(','));
  return `﻿${rows.join('\r\n')}`;
}

/** Tab-separated text: pastes straight into spreadsheet cells. */
export function toTSV(events) {
  const clean = (v) => String(v ?? '').replace(/[\t\n\r]/g, ' ');
  const rows = [COLS.map((c) => c[0]).join('\t')];
  for (const e of [...events].sort((a, b) => a.t - b.t)) rows.push(COLS.map(([, f]) => clean(f(e))).join('\t'));
  return rows.join('\n');
}

// ---------------------------------------------------------------- widget helpers
/** Small red "● REC" badge for widgets that are recording. */
export function recBadge() {
  return h('span', { class: 'rec-badge', title: 'Recording to the Data log (stays on this device)' }, '● REC');
}

export const RECORD_HINT = 'Records go to ☰ → 📊 Data. They stay on this device only and are never put into share links.';
