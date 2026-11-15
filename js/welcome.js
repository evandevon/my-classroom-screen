// The notes a teacher sees when opening the site, one at a time and never on top of each other:
//  • 👋 Welcome — the first visit only (a basic overview).
//  • ✨ What's new — once per update, for people who were already using the site.
//  • 🎉 End of term — once a term, in the last week, with ways to help.
// All three can be opened again from ☰ → Help.

import { h, toast } from './util.js';
import { db } from './storage.js';
import { SUPPORT, WHATS_NEW } from './config.js';
import { REGIONS, detectRegion } from './termdates.js';

const latest = () => Math.max(0, ...WHATS_NEW.map((w) => w.n));

/** **bold** in our own short notes, nothing else. */
function rich(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? h('b', {}, part) : part));
}

function modal(title, body, { primary = 'OK', cls = '' } = {}) {
  return new Promise((done) => {
    const dlg = h('dialog', { class: `modal note-modal ${cls}` },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'w-btn', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕')),
      h('div', { class: 'modal-body' }, ...body, h('div', { class: 'row note-actions' }, h('button', { class: 'btn primary', autofocus: true, onclick: () => dlg.close() }, primary))),
    );
    dlg.addEventListener('close', () => { setTimeout(() => dlg.remove(), 300); done(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/** "Ways to help": share it, send an idea or a kind word, or shout a coffee. Only what's set up shows. */
export function waysToHelp() {
  const url = location.origin + location.pathname;
  const tell = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'My Classroom Screen', text: 'A free classroom screen for the board — no accounts, works offline.', url }); return; }
      await navigator.clipboard.writeText(url);
      toast('🔗 Link copied — paste it in an email or the staff chat.');
    } catch { /* cancelled */ }
  };
  const { coffeeUrl, feedbackUrl, goal, thanks } = SUPPORT;
  const link = (href, text, primary = false) => h('a', { class: `btn${primary ? ' primary' : ''}`, href, target: '_blank', rel: 'noopener' }, text);
  return h('div', { class: 'ways' },
    h('p', {}, 'It’s made by one NSW teacher and free for everyone — no ads, no accounts, nothing sold. If it helps you, here’s how you can help it:'),
    h('div', { class: 'ways-grid' },
      h('button', { class: 'btn', onclick: tell }, '📣 Tell a colleague'),
      feedbackUrl ? link(feedbackUrl, '💡 Suggest an idea or report a bug') : null,
      feedbackUrl ? link(feedbackUrl, '💬 Send a kind word') : null,
      coffeeUrl ? link(coffeeUrl, '☕ Shout me a coffee', true) : null,
    ),
    coffeeUrl && goal ? h('div', { class: 'ways-goal' },
      h('span', {}, `☕ ${goal.have} of ${goal.need} coffees towards ${goal.label}`),
      h('span', { class: 'ways-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': goal.need, 'aria-valuenow': goal.have },
        h('span', { style: { width: `${Math.min(100, (100 * goal.have) / goal.need)}%` } })),
    ) : null,
    thanks?.length ? h('p', { class: 'hint ways-thanks' }, `Thank you to ${thanks.slice(0, 12).join(', ')}${thanks.length > 12 ? ' and others' : ''} for keeping it going. 💛`) : null,
  );
}

export function showWelcome() {
  const tip = (icon, title, text) => h('div', { class: 'welcome-tip' }, h('span', { class: 'wt-icon', 'aria-hidden': 'true' }, icon), h('div', {}, h('b', {}, title), h('p', {}, text)));
  return modal('👋 Welcome to My Classroom Screen', [
    h('p', { class: 'welcome-lead' }, 'A free screen for your classroom board: timers, name pickers, noise meters, schedules and more. No accounts, it works offline, and everything stays on this computer.'),
    h('div', { class: 'welcome-tips' },
      tip('⬇', 'Add widgets', 'Tap one in the bar at the bottom. Drag a widget to move it, drag its corner to resize it, and use ⚙ to change its settings.'),
      tip('☰', 'The menu', 'Your screens (one for each lesson or class), the background, saving and sharing, and class lists.'),
      tip('👥', 'Your class', 'Choose a class at the top so the name picker, groups and progress know your students.'),
      tip('↶', 'Undo anything', 'The ↶ button at the top right (or Ctrl + Z) takes back the last change, even a deleted widget.'),
      tip('💾', 'Saving is automatic', 'Everything saves in this browser as you go. Keep a copy with ☰ → Save to a file.'),
    ),
  ], { primary: 'Let’s go', cls: 'welcome' });
}

export function showWhatsNew(entries = WHATS_NEW.slice(0, 1)) {
  return modal('✨ What’s new', [
    ...entries.flatMap((w) => [
      entries.length > 1 ? h('h3', {}, w.title) : null,
      h('ul', { class: 'whatsnew-list' }, ...w.items.map((t) => h('li', {}, ...rich(t)))),
    ]),
    h('hr'),
    waysToHelp(),
  ], { primary: 'Thanks!' });
}

export function showWaysToHelp() {
  return modal('💛 Ways to help', [waysToHelp()], { primary: 'Close' });
}

/** The current term, if today is in its last week (Mon–Fri before its last day). */
function endOfTerm(today = new Date()) {
  const { region } = detectRegion();
  const reg = region && REGIONS[region];
  if (!reg) return null;
  const p = (n) => String(n).padStart(2, '0');
  const day = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;   // local date, not UTC
  for (const [i, t] of reg.terms.entries()) {
    if (day < t.start || day > t.end) continue;
    const left = (Date.parse(t.end) - Date.parse(day)) / 86400000;
    return left <= 6 ? { key: `${region}-${t.end}`, number: (i % 4) + 1 } : null;
  }
  return null;
}

function showEndOfTerm(term) {
  return modal(`🎉 You made it to the end of Term ${term.number}!`, [
    h('p', {}, 'Well done — have a proper rest. Thank you for using My Classroom Screen this term.'),
    waysToHelp(),
  ], { primary: 'Thanks!' });
}

/** Wait until nothing else (a shared link, an import window…) is open. */
async function whenClear(timeoutMs = 60000) {
  const until = Date.now() + timeoutMs;
  while (document.querySelector('dialog[open]')) {
    if (Date.now() > until) return false;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return true;
}

/** Start-up: welcome a first-time visitor, or show what's new / end of term to someone returning. */
export async function startupNotes({ firstRun }) {
  const seen = await db.getMeta('whatsNewSeen', 0);
  if (firstRun) {
    await db.setMeta('whatsNewSeen', latest());   // a new teacher has nothing "new" to catch up on
    if (await whenClear()) await showWelcome();
    return;
  }
  const fresh = WHATS_NEW.filter((w) => w.n > seen);
  if (fresh.length) {
    if (!(await whenClear())) return;
    await db.setMeta('whatsNewSeen', latest());
    await showWhatsNew(fresh);
    return;   // one note per visit is plenty
  }
  const term = endOfTerm();
  if (term && (await db.getMeta('termThanks', '')) !== term.key) {
    if (!(await whenClear())) return;
    await db.setMeta('termThanks', term.key);
    await showEndOfTerm(term);
  }
}
