// Recording data was removed in mcs-v55 (see docs/removed-recording-data.md).
// If this browser still holds records from before, offer once to download them as a CSV
// and delete them, so they don't sit unseen on a shared classroom computer.
// Safe to delete this file (and its call in main.js) once nobody could have old records.

import { h, downloadBlob, toast } from './util.js';
import { db } from './storage.js';

const pad = (n) => String(n).padStart(2, '0');
const COLS = [
  ['Date', (e) => { const d = new Date(e.t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }],
  ['Time', (e) => { const d = new Date(e.t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }],
  ['Class', (e) => e.cls],
  ['Widget', (e) => e.widget],
  ['Student / team', (e) => e.who],
  ['What', (e) => e.label],
  ['Amount', (e) => e.value],
  ['Unit', (e) => e.unit],
  ['Note', (e) => e.note],
  ['Screen', (e) => e.screen],
];

function toCSV(events) {
  const esc = (v) => {
    const s = String(v ?? '');
    const safe = /^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s; // no spreadsheet formulas from typed names
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = [COLS.map((c) => c[0]).join(',')];
  for (const e of [...events].sort((a, b) => a.t - b.t)) rows.push(COLS.map(([, f]) => esc(f(e))).join(','));
  return `﻿${rows.join('\r\n')}`;
}

export async function checkOldRecords() {
  let events;
  try { events = (await db.allEvents()) || []; } catch { return; }
  if (!events.length) return;
  if (Date.now() < (await db.getMeta('oldRecordsLater', 0))) return;
  const n = events.length;
  let downloaded = false;
  const delBtn = h('button', { class: 'btn' }, '🗑 Delete them');
  const dlg = h('dialog', { class: 'modal' },
    h('div', { class: 'modal-head' }, h('h2', {}, '📊 Your old recorded data'), h('button', { class: 'w-btn', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕')),
    h('div', { class: 'modal-body' },
      h('p', {}, `Recording data has been taken out of My Classroom Screen. This browser still has ${n} record${n === 1 ? '' : 's'} from before (tallies, points, timings and so on).`),
      h('p', {}, 'Download them as a spreadsheet if you want to keep them, then delete them from this computer.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => {
          downloadBlob(new Blob([toCSV(events)], { type: 'text/csv' }), 'classroom-recorded-data.csv');
          downloaded = true;
        } }, '⬇ Download (CSV)'),
        delBtn,
        h('button', { class: 'btn', onclick: () => dlg.close() }, 'Ask me next week'),
      ),
    ),
  );
  delBtn.addEventListener('click', async () => {
    if (!downloaded && !confirm(`Delete ${n} record${n === 1 ? '' : 's'} without downloading them? This can’t be undone.`)) return;
    await db.deleteEvents(events.map((e) => e.id));
    toast('Old records deleted from this computer.');
    dlg.close();
  });
  // Closing without deleting asks again in a week.
  dlg.addEventListener('close', async () => {
    if ((await db.allEvents()).length) await db.setMeta('oldRecordsLater', Date.now() + 7 * 86400000);
    dlg.remove();
  });
  document.body.append(dlg);
  dlg.showModal();
}
