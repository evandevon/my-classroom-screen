// Several tabs of the site at once. Every tab shares the same browser storage, so:
//  • each tab tells the others which screen it's showing (and keeps saying so every few seconds);
//  • opening a screen "claims" it: a tab already showing it steps aside ("Use it here"),
//    so one screen is only ever used in one tab — no clashing saves, no alarms ringing twice;
//  • when a tab changes the class lists, the others reload them straight away.
// Uses BroadcastChannel (all current browsers); without it, tabs simply don't know about each other.

const ch = 'BroadcastChannel' in window ? new BroadcastChannel('mcs-tabs') : null;
const me = Math.random().toString(36).slice(2);
const others = new Map();          // tab id → { screen, seen }
const STALE_MS = 90000;            // a tab not heard from for this long is gone (hidden tabs may only tick once a minute)
let current = '';
let hooks = { onScreens() {}, onClaimed() {}, onClasses() {} };

const post = (msg) => { try { ch?.postMessage({ ...msg, tab: me }); } catch { /* closed */ } };

function prune() {
  const now = Date.now();
  for (const [id, o] of others) if (now - o.seen > STALE_MS) others.delete(id);
}

/** Screens shown in other tabs right now. */
export function openElsewhere() {
  prune();
  return new Set([...others.values()].map((o) => o.screen).filter(Boolean));
}

export function initTabs(h) {
  hooks = { ...hooks, ...h };
  if (!ch) return;
  ch.onmessage = ({ data: m }) => {
    if (!m || m.tab === me) return;
    if (m.t === 'here') { const was = others.get(m.tab)?.screen; others.set(m.tab, { screen: m.screen, seen: Date.now() }); if (was !== m.screen) hooks.onScreens(); }
    else if (m.t === 'who') post({ t: 'here', screen: current });
    else if (m.t === 'bye') { others.delete(m.tab); hooks.onScreens(); }
    else if (m.t === 'claim') {
      others.set(m.tab, { screen: m.screen, seen: Date.now() });
      if (m.screen && m.screen === current) hooks.onClaimed(m.screen);
      hooks.onScreens();
    }
    else if (m.t === 'classes') hooks.onClasses();
  };
  setInterval(() => { post({ t: 'here', screen: current }); const n = others.size; prune(); if (others.size !== n) hooks.onScreens(); }, 4000);
  addEventListener('pagehide', () => post({ t: 'bye' }));
}

/** Ask the other tabs what they're showing (at start-up), waiting a moment for answers. */
export async function askOthers(ms = 250) {
  if (!ch) return new Set();
  post({ t: 'who' });
  await new Promise((r) => setTimeout(r, ms));
  return openElsewhere();
}

/** This tab has stepped aside: it no longer counts as showing a screen. */
export function release() { current = ''; post({ t: 'here', screen: '' }); }

/** This tab is now using a screen: any other tab showing it steps aside. */
export function claim(screenId) { current = screenId || ''; post({ t: 'claim', screen: current }); }
export function notifyClasses() { post({ t: 'classes' }); }
