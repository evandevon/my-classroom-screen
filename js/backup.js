// Backups. Screens live only in this browser, so clearing it, a reimaged laptop or a new
// computer would lose them. We don't copy anything anywhere by ourselves; instead we:
//  • ask the browser not to clear our storage to free up space (no prompt in Chrome/Edge);
//  • show "Last backed up to a file: …" in the menu, with a warning when it's been a while;
//  • ask once, quietly, on a second day of use, whether to download a backup file;
//  • offer a backup in the end-of-term note (see welcome.js), before the holidays.
// A backup file is a .classroom file of every screen and class list; open it with ☰ → Open a file.

import { h, downloadBlob, toast } from './util.js';
import { db } from './storage.js';
import { buildProjectFile } from './share.js';

const STALE_DAYS = 28;     // after four weeks the menu line turns into a gentle warning

let onStatus = () => {};

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Remember a backup was made (also called when ☰ → Save to a file saves every screen). */
export async function markBackedUp() {
  await db.setMeta('backupLast', Date.now());
  await db.setMeta('backupAsked', true);
  onStatus();
}

/** Download a backup file of everything: all screens and all class lists. */
export async function downloadBackup() {
  const blob = await buildProjectFile(await db.listScreens(), { allClasses: true });
  downloadBlob(blob, `My Classroom Screen backup ${stamp()}.classroom`);
  await markBackedUp();
  toast('💾 Backup saved to your Downloads. Keep it somewhere safe (like OneDrive) — open it with ☰ → Open a file if you ever need it.', { ms: 8000 });
}

/** For the menu: when the last backup was, and whether it's time for another. */
export async function backupStatus() {
  const last = await db.getMeta('backupLast', 0);
  const widgets = (await db.listScreens()).reduce((n, s) => n + (s.widgets?.length || 0), 0);
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  let when = 'never';
  if (days === 0) when = 'today';
  else if (days === 1) when = 'yesterday';
  else if (days !== null && days < 14) when = `${days} days ago`;
  else if (days !== null && days < 60) when = `${Math.round(days / 7)} weeks ago`;
  else if (days !== null) when = `${Math.round(days / 30)} months ago`;
  return { last, when, stale: widgets > 0 && (days === null || days >= STALE_DAYS) };
}

/** Called at start-up. setStatus re-draws anything showing the backup state (the menu). */
export async function initBackup(setStatus) {
  onStatus = setStatus || (() => {});
  // Keep the browser from clearing our storage to free up space.
  navigator.storage?.persist?.().catch(() => {});
  // The live-folder copy was removed (mcs-v63); forget any folder chosen before.
  if (await db.getMeta('backupDir', null)) await db.setMeta('backupDir', null);
  // Count the days the site has been used, for asking (once) about a backup.
  const today = new Date().toDateString();
  const days = await db.getMeta('daysUsed', []);
  if (!days.includes(today)) await db.setMeta('daysUsed', [...days.slice(-9), today]);
}

/** Ask once, quietly: on the second day of use, if there's something worth keeping and no backup yet. */
export async function maybeAskOnce() {
  if (await db.getMeta('backupAsked', false)) return;
  if (await db.getMeta('backupLast', 0)) return;
  if ((await db.getMeta('daysUsed', [])).length < 2) return;
  const widgets = (await db.listScreens()).reduce((n, s) => n + (s.widgets?.length || 0), 0);
  if (widgets < 3 || document.querySelector('dialog[open]')) return;
  await db.setMeta('backupAsked', true);   // asked once, whatever the answer
  const card = h('div', { class: 'backup-ask', role: 'dialog', 'aria-label': 'Save a backup of your screens' },
    h('p', {}, h('b', {}, '💾 Save a backup of your screens?'), ' They only live in this browser, so clearing it or a new computer would lose them.'),
    h('p', { class: 'hint' }, 'A backup file holds every screen and class list. Keep it somewhere safe, like OneDrive. You can do this any time from ☰ → Save & share.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => { card.remove(); downloadBackup(); } }, '⬇ Save a backup file'),
      h('button', { class: 'btn', onclick: () => { card.remove(); toast('No problem — it’s in ☰ whenever you want it.'); } }, 'Not now'),
    ),
  );
  document.body.append(card);
}
