// Share links (compressed screen in the URL hash) and project files (JSON with embedded assets).

import { db } from './storage.js';
import { blobToDataURL, dataURLToBlob, uid } from './util.js';
import { WIDGETS } from './widgets/index.js';
import { classLists } from './classes.js';

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
  if (copy.background?.assetId) {
    delete copy.background.assetId;
    copy.background.type = 'color';
    dropped.add('uploaded background image');
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
    }
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

async function encodeScreen(safe) {
  const payload = JSON.stringify({ f: FORMAT, v: VERSION, screen: safe });
  return toB64url(await deflate(payload));
}

export async function makeShareLink(screen, opts = {}) {
  let { screen: safe, dropped } = linkSafeScreen(screen, opts);
  let encoded = await encodeScreen(safe);
  if (encoded.length > MAX_LINK) {
    ({ screen: safe, dropped } = linkSafeScreen(screen, { ...opts, dropHeavy: true }));
    encoded = await encodeScreen(safe);
  }
  const url = `${location.origin}${location.pathname}#s=${encoded}`;
  return { url, dropped, long: encoded.length > MAX_LINK };
}

export async function readShareHash() {
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const data = JSON.parse(await inflate(fromB64url(m[1])));
  if (data.f !== FORMAT || !data.screen) throw new Error('Not a My Classroom Screen link');
  return data.screen;
}

// ---------- project files ----------
function assetIdsIn(screen) {
  const ids = new Set();
  if (screen.background?.assetId) ids.add(screen.background.assetId);
  for (const w of screen.widgets) {
    for (const [k, v] of Object.entries(w.state || {})) {
      if (k.endsWith('AssetId') && v) ids.add(v);
    }
  }
  return ids;
}

export async function buildProjectFile(screens) {
  const assets = {};
  for (const s of screens) {
    for (const id of assetIdsIn(s)) {
      if (assets[id]) continue;
      const a = await db.getAsset(id);
      if (a) assets[id] = { name: a.name, type: a.type, data: await blobToDataURL(a.blob) };
    }
  }
  const json = JSON.stringify({ format: FORMAT, version: VERSION, exported: new Date().toISOString(), screens, assets }, null, 1);
  return new Blob([json], { type: 'application/json' });
}

/** Returns new screens (with fresh ids) and stores their assets. */
export async function importProjectFile(text) {
  const data = JSON.parse(text);
  if (data.format !== FORMAT || !Array.isArray(data.screens)) throw new Error('This is not a My Classroom Screen project file.');
  const idMap = {};
  for (const [oldId, a] of Object.entries(data.assets || {})) {
    const id = uid('asset');
    idMap[oldId] = id;
    await db.putAsset({ id, name: a.name, type: a.type, blob: await dataURLToBlob(a.data) });
  }
  return data.screens.map((s) => prepareImportedScreen(s, idMap));
}

export function prepareImportedScreen(screen, idMap = {}) {
  const s = structuredClone(screen);
  s.id = uid('screen');
  s.updated = Date.now();
  if (s.background?.assetId) s.background.assetId = idMap[s.background.assetId] || null;
  for (const w of s.widgets || []) {
    w.id = uid('w');
    for (const k of Object.keys(w.state || {})) {
      if (k.endsWith('AssetId') && w.state[k]) w.state[k] = idMap[w.state[k]] || null;
    }
  }
  return s;
}
