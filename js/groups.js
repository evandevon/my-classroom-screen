// Screen groups: a one-level way to tidy lots of screens in the menu (e.g. "4K", "Science", "Routines").
// A group is { id, name, colour, collapsed }; a screen belongs to one group or none (screen.group).
// A screen whose group isn't on this computer simply shows as ungrouped.

import { db } from './storage.js';
import { uid } from './util.js';

export const GROUP_COLOURS = [
  ['#e5484d', 'Red'], ['#f5a524', 'Orange'], ['#e9c600', 'Yellow'], ['#2a9d8f', 'Green'],
  ['#3b6fd8', 'Blue'], ['#8e5bd9', 'Purple'], ['#e05aa8', 'Pink'], ['#8a94a6', 'Grey'],
];

let groups = null;

export async function getGroups() {
  if (!groups) groups = (await db.getMeta('screenGroups', [])) || [];
  return groups;
}
export async function saveGroups(list = groups) {
  groups = list;
  await db.setMeta('screenGroups', groups);
}
/** Another tab may have changed them: read again next time. */
export function forgetGroups() { groups = null; }

export async function addGroup(name) {
  const list = await getGroups();
  const used = new Set(list.map((g) => g.colour));
  const colour = (GROUP_COLOURS.find(([c]) => !used.has(c)) || GROUP_COLOURS[list.length % GROUP_COLOURS.length])[0];
  const g = { id: uid('group'), name, colour, collapsed: false };
  await saveGroups([...list, g]);
  return g;
}
export async function updateGroup(id, changes) {
  await saveGroups((await getGroups()).map((g) => (g.id === id ? { ...g, ...changes } : g)));
}
export async function removeGroup(id) {
  await saveGroups((await getGroups()).filter((g) => g.id !== id));
}

/** For a saved file: the groups these screens use. */
export async function groupsForScreens(screens) {
  const ids = new Set(screens.map((s) => s.group).filter(Boolean));
  return (await getGroups()).filter((g) => ids.has(g.id)).map(({ id, name, colour }) => ({ id, name, colour }));
}

/**
 * Screens coming from a file: bring their groups too. A group this computer already has (same id,
 * or the same name) is reused. Returns old id → id here, for the screens' `group`.
 */
export async function addGroupsFrom(incoming = []) {
  const list = [...(await getGroups())];
  const map = {};
  for (const g of incoming) {
    const same = list.find((x) => x.id === g.id) || list.find((x) => x.name.toLowerCase() === String(g.name || '').toLowerCase());
    if (same) { map[g.id] = same.id; continue; }
    const fresh = { id: uid('group'), name: g.name || 'Group', colour: g.colour || GROUP_COLOURS[0][0], collapsed: false };
    list.push(fresh);
    map[g.id] = fresh.id;
  }
  if (incoming.length) await saveGroups(list);
  return map;
}
