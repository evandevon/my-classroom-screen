// IndexedDB persistence: screens (layouts), assets (uploaded images/audio), meta (settings),
// events (the activity log used for data collection — never leaves this device).

const DB_NAME = 'my-classroom-screen';
const DB_VERSION = 2;
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('screens')) db.createObjectStore('screens', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('events')) {
        const ev = db.createObjectStore('events', { keyPath: 'id' });
        ev.createIndex('t', 't');
      }
    };
    // Another tab has the old version open: let the upgrade go ahead.
    req.onblocked = () => console.warn('Close other My Classroom Screen tabs to finish updating.');
    req.onsuccess = () => {
      // If a newer version of the app opens in another tab, let it upgrade the database.
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => (result = r.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  // Screens
  listScreens: () => tx('screens', 'readonly', (s) => s.getAll()),
  getScreen: (id) => tx('screens', 'readonly', (s) => s.get(id)),
  putScreen: (screen) => tx('screens', 'readwrite', (s) => s.put(structuredClone(screen))),
  deleteScreen: (id) => tx('screens', 'readwrite', (s) => s.delete(id)),

  // Assets: { id, blob, name, type }
  getAsset: (id) => tx('assets', 'readonly', (s) => s.get(id)),
  putAsset: (asset) => tx('assets', 'readwrite', (s) => s.put({ created: Date.now(), ...asset })),
  listAssetKeys: () => tx('assets', 'readonly', (s) => s.getAllKeys()),
  deleteAsset: (id) => tx('assets', 'readwrite', (s) => s.delete(id)),

  // Meta key/value
  async getMeta(key, fallback = null) {
    const r = await tx('meta', 'readonly', (s) => s.get(key));
    return r ? r.value : fallback;
  },
  setMeta: (key, value) => tx('meta', 'readwrite', (s) => s.put({ key, value })),

  // Activity log
  addEvent: (ev) => tx('events', 'readwrite', (s) => s.put(ev)),
  allEvents: () => tx('events', 'readonly', (s) => s.getAll()),
  deleteEvents: async (ids) => {
    const dbh = await open();
    return new Promise((resolve, reject) => {
      const t = dbh.transaction('events', 'readwrite');
      const st = t.objectStore('events');
      for (const id of ids) st.delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};

// Object URLs for assets, cached so widgets can share them.
const urlCache = new Map();
export async function assetURL(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const a = await db.getAsset(id);
  if (!a) return null;
  const url = URL.createObjectURL(a.blob);
  urlCache.set(id, url);
  return url;
}

// Ask the browser not to evict our data under storage pressure.
navigator.storage?.persist?.().catch(() => {});

/** Every uploaded file a screen points to (background, widget files, picture lists). */
export function assetIdsOfScreen(screen) {
  const ids = new Set();
  if (screen?.background?.assetId) ids.add(screen.background.assetId);
  for (const w of screen?.widgets || []) {
    for (const [k, v] of Object.entries(w.state || {})) {
      if (k.endsWith('AssetId') && v) ids.add(v);
      if (k.endsWith('AssetIds') && Array.isArray(v)) v.forEach((x) => x && ids.add(x));
    }
  }
  return ids;
}

/**
 * Delete stored files (photos, clips, voice recordings…) that no screen uses any more,
 * e.g. after a widget or screen is deleted. Files added in the last 10 minutes are left
 * alone (they may belong to something not saved yet, or to an undo).
 */
export async function sweepAssets(keep = []) {
  const used = new Set(keep);
  for (const sc of await db.listScreens()) for (const id of assetIdsOfScreen(sc)) used.add(id);
  let freed = 0;
  for (const id of await db.listAssetKeys()) {
    if (used.has(id)) continue;
    const a = await db.getAsset(id);
    if (a?.created && Date.now() - a.created < 10 * 60 * 1000) continue;
    freed += a?.blob?.size || 0;
    await db.deleteAsset(id);
  }
  return freed;
}
