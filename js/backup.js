// Keeping a copy of everything outside the browser.
// Screens live only in this browser, so clearing it (or a new laptop) loses them.
// In Chrome and Edge the teacher can choose a folder once (OneDrive, Google Drive, Documents…)
// and a .classroom file there is kept up to date by itself while the site is open.
// Other browsers get a one-off "Download a backup file" offer instead.
// We ask once, quietly, after a teacher has used the site on two different days.

import { h, downloadBlob, toast } from './util.js';
import { db } from './storage.js';
import { buildProjectFile } from './share.js';

export const folderSupported = () => 'showDirectoryPicker' in window;
const FILE = 'My Classroom Screen backup.classroom';
const KEEP_WEEKLY = 4;                     // also keep the last four weekly copies, in case something goes wrong
const AFTER_CHANGE_MS = 60 * 1000;         // write a minute after the last change

let dir = null;                            // FileSystemDirectoryHandle
let paused = false;                        // the browser wants permission again (new visit)
let timer = 0;
let dirty = false;
let onStatus = () => {};

const weekTag = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const wk = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
};

async function everything() {
  const screens = await db.listScreens();
  return buildProjectFile(screens, { allClasses: true });
}

async function writeFile(name, blob) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

/** Write the backup now (if a folder is chosen and allowed). Returns true when written. */
export async function writeBackup() {
  if (!dir) return false;
  try {
    if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') { paused = true; onStatus(); return false; }
    const screens = await db.listScreens();
    // Never replace a backup that has widgets with one that has none (e.g. after the browser lost everything).
    const widgets = screens.reduce((n, s) => n + (s.widgets?.length || 0), 0);
    if (!widgets && (await db.getMeta('backupLast', 0))) return false;
    const blob = await everything();
    await writeFile(FILE, blob);
    // One copy per week too, keeping the last few.
    const weekly = `My Classroom Screen backup ${weekTag()}.classroom`;
    let names = [];
    for await (const [n] of dir.entries()) if (/^My Classroom Screen backup \d{4}-W\d\d\.classroom$/.test(n)) names.push(n);
    if (!names.includes(weekly)) { await writeFile(weekly, blob); names.push(weekly); }
    names = names.sort().reverse();
    for (const old of names.slice(KEEP_WEEKLY)) await dir.removeEntry(old).catch(() => {});
    paused = false;
    dirty = false;
    await db.setMeta('backupLast', Date.now());
    onStatus();
    return true;
  } catch (e) {
    console.error(e);
    if (e?.name === 'NotFoundError') { toast('The backup folder can’t be found any more — choose it again from ☰ → Keep a copy in a folder.'); await forgetFolder(); }
    return false;
  }
}

/** Something changed: write a backup a minute later. */
export function noteChange() {
  if (!dir) return;
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(writeBackup, AFTER_CHANGE_MS);
}

/** Choose (or change) the folder. Must be called from a tap or click. */
export async function chooseFolder() {
  if (!folderSupported()) { await downloadBackup(); return; }
  let handle;
  try {
    handle = await window.showDirectoryPicker({ id: 'mcs-backup', mode: 'readwrite', startIn: 'documents' });
  } catch (e) {
    if (e?.name !== 'AbortError') toast('That folder can’t be used — try another one.');
    return;
  }
  dir = handle;
  await db.setMeta('backupDir', handle);
  await db.setMeta('backupAsked', true);
  if (await writeBackup()) toast(`💾 Saved a copy in “${handle.name}”. It updates by itself while this site is open.`, { ms: 7000 });
}

export async function forgetFolder() {
  dir = null;
  paused = false;
  clearTimeout(timer);
  await db.setMeta('backupDir', null);
  onStatus();
}

/** After a new visit Chrome may need permission again — ask with a tap. */
export async function resumeFolder() {
  if (!dir) return;
  try {
    if ((await dir.requestPermission({ mode: 'readwrite' })) === 'granted') { paused = false; await writeBackup(); toast('💾 Back to keeping a copy in your folder.'); }
  } catch { /* declined */ }
  onStatus();
}

export async function downloadBackup() {
  downloadBlob(await everything(), FILE);
  await db.setMeta('backupLast', Date.now());
  await db.setMeta('backupAsked', true);
  toast('💾 Backup file saved to your Downloads. Open it with ☰ → Open a file if you ever need it.', { ms: 7000 });
}

export function backupState() {
  return { supported: folderSupported(), folder: dir?.name || '', paused };
}

/** Called at start-up. setStatus re-draws anything showing the backup state (the menu). */
export async function initBackup(setStatus) {
  onStatus = setStatus || (() => {});
  if (folderSupported()) {
    dir = (await db.getMeta('backupDir', null)) || null;
    if (dir) {
      try { paused = (await dir.queryPermission({ mode: 'readwrite' })) !== 'granted'; } catch { dir = null; }
      if (paused) {
        toast('💾 Keep copying your screens to your backup folder?', { action: 'Yes', onAction: resumeFolder, ms: 12000 });
      }
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) writeBackup(); });
  // Keep the browser from clearing our storage to free up space (no prompt in Chrome/Edge).
  navigator.storage?.persist?.().catch(() => {});
  // Count the days the site has been used, for asking (once) about a backup.
  const today = new Date().toDateString();
  const days = await db.getMeta('daysUsed', []);
  if (!days.includes(today)) await db.setMeta('daysUsed', [...days.slice(-9), today]);
  onStatus();
}

/** Ask once, quietly: on the second day of use, if there's something worth keeping and no backup yet. */
export async function maybeAskOnce() {
  if (await db.getMeta('backupAsked', false)) return;
  if (dir || (await db.getMeta('backupLast', 0))) return;
  if ((await db.getMeta('daysUsed', [])).length < 2) return;
  const widgets = (await db.listScreens()).reduce((n, s) => n + (s.widgets?.length || 0), 0);
  if (widgets < 3 || document.querySelector('dialog[open]')) return;
  await db.setMeta('backupAsked', true);   // asked once, whatever the answer
  const card = h('div', { class: 'backup-ask', role: 'dialog', 'aria-label': 'Keep a copy of your screens' },
    h('p', {}, h('b', {}, '💾 Keep a copy of your screens?'), ' They only live in this browser, so clearing it or a new computer would lose them.'),
    h('p', { class: 'hint' }, folderSupported()
      ? 'Choose a folder once (OneDrive, Google Drive or Documents work well) and a copy there updates by itself.'
      : 'Save a backup file now — you can do this any time from ☰ → Save to a file.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => { card.remove(); chooseFolder(); } }, folderSupported() ? '📁 Choose a folder' : '⬇ Save a backup file'),
      h('button', { class: 'btn', onclick: () => { card.remove(); toast('No problem — it’s in ☰ whenever you want it.'); } }, 'Not now'),
    ),
  );
  document.body.append(card);
}
