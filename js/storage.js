// IndexedDB persistence: screens (layouts), assets (uploaded images/audio), meta (settings).

const DB_NAME = 'my-classroom-screen';
const DB_VERSION = 1;
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
    };
    req.onsuccess = () => resolve(req.result);
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
  putAsset: (asset) => tx('assets', 'readwrite', (s) => s.put(asset)),
  deleteAsset: (id) => tx('assets', 'readwrite', (s) => s.delete(id)),

  // Meta key/value
  async getMeta(key, fallback = null) {
    const r = await tx('meta', 'readonly', (s) => s.get(key));
    return r ? r.value : fallback;
  },
  setMeta: (key, value) => tx('meta', 'readwrite', (s) => s.put({ key, value })),
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
