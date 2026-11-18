import { makeZip, readZip, isZip } from './zip.js';
// Share links (compressed screen in the URL hash) and project files (JSON with embedded assets).

import { db, assetIdsOfScreen } from './storage.js';
import { dataURLToBlob, uid } from './util.js';
import { WIDGETS } from './widgets/index.js';
import { classLists, classesForScreens, addSharedClasses } from './classes.js';
import { groupsForScreens, addGroupsFrom } from './groups.js';

const FORMAT = 'my-classroom-screen';
const VERSION = 1;

// ---------- base64url + deflate ----------
function toB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
async function deflate(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

/**
 * Make a copy of a screen that is safe for a link:
 * - removes uploaded assets (they live only on this device)
 * - removes heavy data (e.g. whiteboard drawings)
 * - optionally removes student names
 */
export function linkSafeScreen(screen, { includeNames = false, dropHeavy = false } = {}) {
  const copy = structuredClone(screen);
  const dropped = new Set();
  // A paused screen is shared ready to go (held timers simply show their time left).
  delete copy.paused;
  for (const w of copy.widgets) if (w.state?.held) w.state.held = false;
  if (copy.background?.assetId || copy.background?.assetIds?.length) {
    delete copy.background.assetId;
    delete copy.background.assetIds;
    copy.background = { type: 'gradient', value: 'sky' };
    dropped.add('uploaded background (picture, video or slideshow)');
  }
  for (const w of copy.widgets) {
    const def = WIDGETS[w.type];
    if (!def) continue;
    const defaults = def.defaultState();
    for (const k of Object.keys(w.state || {})) {
      if (k.endsWith('AssetId') && w.state[k]) {
        w.state[k] = null;
        dropped.add('uploaded files (images/audio)');
      }
      if (k.endsWith('AssetIds') && w.state[k]?.length) {
        w.state[k] = structuredClone(defaults[k] ?? []);
        for (const extra of def.assetCompanions?.[k] || []) w.state[extra] = structuredClone(defaults[extra]);
        dropped.add('uploaded files (images/audio)');
      }
    }
    // Cached data (e.g. the last weather) is fetched again on the other computer.
    for (const k of def.cacheKeys || []) w.state[k] = structuredClone(defaults[k]);
    if (dropHeavy) {
      for (const k of def.heavyKeys || []) {
        if (w.state[k]) {
          w.state[k] = structuredClone(defaults[k]);
          dropped.add(`${def.title.toLowerCase()} content (too big for a link)`);
        }
      }
    }
    if (!includeNames) {
      // Widgets that can hold student names in other fields (e.g. scoreboard rows) scrub them.
      if (def.scrubNames) {
        const known = new Set(classLists().flatMap((c) => c.students.map((n) => n.toLowerCase())));
        if (def.scrubNames(w.state, known)) dropped.add('student names');
      }
      for (const k of def.privateKeys || []) {
        const v = w.state[k];
        if (v && (Array.isArray(v) ? v.length : String(v).length)) {
          w.state[k] = structuredClone(defaults[k]);
          dropped.add('student names');
        }
      }
    }
  }
  return { screen: copy, dropped: [...dropped] };
}

const MAX_LINK = 16000; // characters; longer links break in email/Teams

async function encodeScreen(safe, cls) {
  const payload = JSON.stringify({ f: FORMAT, v: VERSION, screen: safe, ...(cls?.classes.length ? { classes: cls.classes, currentClass: cls.current } : {}) });
  return toB64url(await deflate(payload));
}

/** With includeNames, the class lists the screen uses travel with it (the teacher decides who gets the link). */
export async function makeShareLink(screen, opts = {}) {
  const cls = opts.includeNames ? classesForScreens([screen]) : null;
  let { screen: safe, dropped } = linkSafeScreen(screen, opts);
  let encoded = await encodeScreen(safe, cls);
  if (encoded.length > MAX_LINK) {
    ({ screen: safe, dropped } = linkSafeScreen(screen, { ...opts, dropHeavy: true }));
    encoded = await encodeScreen(safe, cls);
  }
  const url = `${location.origin}${location.pathname}#s=${encoded}`;
  return { url, dropped, long: encoded.length > MAX_LINK };
}

/** A share link's contents again (for a preview opened in a new tab). */
export function parsedFromLinkData(data) {
  return { kind: 'link', screens: [data.screen], classes: data.classes || [], currentClass: data.currentClass || '', assets: {}, zip: null, data };
}

export async function readShareHash() {
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const data = JSON.parse(await inflate(fromB64url(m[1])));
  if (data.f !== FORMAT || !data.screen) throw new Error('Not a My Classroom Screen link');
  // Read only: nothing is added until the teacher chooses (see addImported).
  return { kind: 'link', screens: [data.screen], classes: data.classes || [], currentClass: data.currentClass || '', assets: {}, zip: null, data };
}

// ---------- project files ----------
function assetIdsIn(screen) {
  const ids = new Set();
  if (screen.background?.assetId) ids.add(screen.background.assetId);
  for (const id of screen.background?.assetIds || []) ids.add(id);
  for (const w of screen.widgets) {
    for (const [k, v] of Object.entries(w.state || {})) {
      if (k.endsWith('AssetId') && v) ids.add(v);
      if (k.endsWith('AssetIds') && Array.isArray(v)) v.forEach((id) => id && ids.add(id));
    }
  }
  return ids;
}

const EXT_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg' };
const README = `My Classroom Screen — saved screens
https://evandevon.github.io/my-classroom-screen/

To open: in My Classroom Screen, menu ☰ → Save & share → Add screens from a file (or drag this file onto the screen), then tick the screens you want.

This file is a normal zip. Rename it to .zip to look inside:
  classroom.json   the screens and their settings (and any class lists they use)
  files/           photos, video clips, pictures and sounds used by the screens
`;

/**
 * A ".classroom" file: a zip holding classroom.json (screens) plus each stored file as itself
 * (no base64 bloat, so clips and photos stay their real size).
 */
export async function buildProjectFile(screens, { allClasses = false } = {}) {
  const assets = {};
  const files = [];
  for (const s of screens) {
    for (const id of assetIdsIn(s)) {
      if (assets[id]) continue;
      const a = await db.getAsset(id);
      if (!a) continue;
      const type = a.type || a.blob.type || '';
      const ext = (a.name?.match(/\.([a-z0-9]{1,5})$/i)?.[1] || EXT_BY_TYPE[type.split(';')[0]] || 'bin').toLowerCase();
      const file = `files/${id}.${ext}`;
      assets[id] = { name: a.name, type, file };
      files.push({ name: file, data: a.blob, compress: !/^(image\/(jpeg|png|gif|webp)|video|audio)/.test(type) });
    }
  }
  const { classes, current } = classesForScreens(screens, allClasses);   // the class lists these screens use go with them
  const groups = await groupsForScreens(screens);   // so a backup brings its screen groups back
  const json = JSON.stringify({ format: FORMAT, version: VERSION, exported: new Date().toISOString(), screens, assets, ...(classes.length ? { classes, currentClass: current } : {}), ...(groups.length ? { groups } : {}), ...(allClasses ? { backup: true } : {}) }, null, 1);
  return makeZip([{ name: 'classroom.json', data: json, compress: true }, { name: 'README.txt', data: README }, ...files], 'application/x-classroom+zip');
}

/** Opens a .classroom (zip) file, or an older .json project file. */
/** Look inside a .classroom file (or an older .json one) without changing anything. */
export async function readProjectFile(file) {
  let data;
  let zip = null;
  if (typeof file !== 'string' && (await isZip(file))) {
    zip = await readZip(file);
    const entry = zip.get('classroom.json');
    if (!entry) throw new Error('This is not a My Classroom Screen file.');
    data = JSON.parse(new TextDecoder().decode(await entry.read()));
  } else {
    try { data = JSON.parse(typeof file === 'string' ? file : await file.text()); } catch { throw new Error('This is not a My Classroom Screen file.'); }
  }
  if (data.format !== FORMAT || !Array.isArray(data.screens)) throw new Error('This is not a My Classroom Screen file.');
  return { kind: 'file', name: file.name || '', screens: data.screens, classes: data.classes || [], currentClass: data.currentClass || '', groups: data.groups || [], backup: !!data.backup || /^My Classroom Screen backup/i.test(file.name || ''), assets: data.assets || {}, zip, file: typeof file === 'string' ? null : file };
}

/** Which of a file's class lists a screen uses ('current' means the sender's current class). */
export function classIdsUsed(screen, currentClass = '') {
  const ids = new Set();
  for (const w of screen.widgets || []) {
    const src = w.state?.source;
    if (src === 'current') { if (currentClass) ids.add(currentClass); }
    else if (src && src !== 'own') ids.add(src);
  }
  return ids;
}
/** Does a screen in a file carry its own pictures, clips or sounds? */
export const hasFiles = (screen, parsed) => [...assetIdsIn(screen)].some((id) => parsed.assets?.[id]);

/**
 * Add the chosen screens from a file or link, with only the pictures, clips, sounds and class lists
 * those screens use. Returns the screens as stored on this computer and the class lists that were added.
 */
async function storeAssets(parsed, screens) {
  const need = new Set(screens.flatMap((sc) => [...assetIdsIn(sc)]));
  const idMap = {};
  for (const [oldId, a] of Object.entries(parsed.assets || {})) {
    if (!need.has(oldId)) continue;
    let blob = null;
    if (a.file && parsed.zip?.get(a.file)) blob = await parsed.zip.get(a.file).blob(a.type);
    else if (a.data) blob = await dataURLToBlob(a.data); // older .json files
    if (!blob) continue;
    const id = uid('asset');
    idMap[oldId] = id;
    await db.putAsset({ id, name: a.name, type: a.type, blob, created: Date.now() });
  }
  return idMap;
}

export async function addImported(parsed, chosen, { noFileGroup = new Set() } = {}) {
  const idMap = await storeAssets(parsed, chosen);
  // A backup brings back every class list in it; a shared file only the ones its chosen screens use.
  const used = parsed.backup ? new Set((parsed.classes || []).map((c) => c.id)) : new Set(chosen.flatMap((sc) => [...classIdsUsed(sc, parsed.currentClass)]));
  const { idMap: classMap, added } = await addSharedClasses((parsed.classes || []).filter((c) => used.has(c.id)), used.has(parsed.currentClass) ? parsed.currentClass : '');
  // Screen groups come too (reusing a group of the same name here).
  // (Not for screens given a different group, or replacing one of yours: no empty groups left behind.)
  const groupMap = await addGroupsFrom((parsed.groups || []).filter((g) => chosen.some((sc) => sc.group === g.id && !noFileGroup.has(sc))));
  const screens = chosen.map((sc) => {
    const s = prepareImportedScreen(sc, idMap, classMap);
    if (groupMap[sc.group]) s.group = groupMap[sc.group]; else delete s.group;
    return s;
  });
  return { screens, addedClasses: added };
}

/**
 * "Copy to my screens" from a preview: the screen as it is now (with any changes made while
 * previewing) becomes one of your screens. Its class lists and group come too, and the pictures and
 * sounds it uses (already stored for the preview) are kept.
 */
export async function copyPreviewToMine(parsed, raw, current, { fileGroup = true } = {}) {
  const used = new Set(classIdsUsed(raw, parsed.currentClass));
  const { idMap: classMap } = await addSharedClasses((parsed.classes || []).filter((c) => used.has(c.id)), used.has(parsed.currentClass) ? parsed.currentClass : '');
  const groupMap = fileGroup ? await addGroupsFrom((parsed.groups || []).filter((g) => g.id === raw.group)) : {};
  const keep = Object.fromEntries([...assetIdsOfScreen(current)].map((id) => [id, id]));
  const s = prepareImportedScreen(current, keep, classMap);
  if (groupMap[raw.group]) s.group = groupMap[raw.group]; else delete s.group;
  return s;
}

/**
 * A look at one screen from a file or link without adding it: its pictures and sounds are made
 * available (and tidied away later if it isn't added); class lists aren't added.
 */
export async function previewImported(parsed, sc) {
  const idMap = await storeAssets(parsed, [sc]);
  const s = prepareImportedScreen(sc, idMap, {});
  delete s.group;
  return s;
}

/** Everything in a file, added in one go (kept for older callers). */
export async function importProjectFile(file) {
  const parsed = await readProjectFile(file);
  const { screens, addedClasses } = await addImported(parsed, parsed.screens);
  screens.addedClasses = addedClasses;
  return screens;
}

export function prepareImportedScreen(screen, idMap = {}, classMap = {}) {
  const s = structuredClone(screen);
  s.id = uid('screen');
  s.updated = Date.now();
  if (s.background?.assetId) s.background.assetId = idMap[s.background.assetId] || null;
  if (Array.isArray(s.background?.assetIds)) s.background.assetIds = s.background.assetIds.map((id) => idMap[id] || null);
  for (const w of s.widgets || []) {
    w.id = uid('w');
    if (w.state?.source && classMap[w.state.source]) w.state.source = classMap[w.state.source];   // the class as saved on this computer
    // A widget that refers to files deeper in its state (e.g. whiteboard pictures) remaps those itself,
    // before the ...AssetId(s) lists are changed.
    WIDGETS[w.type]?.remapAssets?.(w.state || {}, (id) => idMap[id] || null);
    for (const k of Object.keys(w.state || {})) {
      if (k.endsWith('AssetId') && w.state[k]) w.state[k] = idMap[w.state[k]] || null;
      if (k.endsWith('AssetIds') && Array.isArray(w.state[k])) w.state[k] = w.state[k].map((id) => idMap[id] || null);
    }
  }
  return s;
}
