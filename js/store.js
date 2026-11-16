// Everything the app remembers lives in IndexedDB on this device. When the browser
// refuses storage (some private windows), the same calls work in memory for the session.
//
// Stores: trips (by trip id), kv (settings and marks), objects and commits (versions,
// see js/objects.js). Database version 3 replaced the "versions" store of full copies
// with objects and commits; js/app.js moves what it held, once.

const DB = "travel-in-my-pocket";
const STORES = {trips: "id", kv: null, objects: null, commits: null};
const LEGACY = "versions";

// The same calls on top of Maps: for a browser that refuses storage, and for the tests.
export function memoryBackend(){
  const m = Object.fromEntries([...Object.keys(STORES), LEGACY].map(n => [n, new Map()]));
  return {
    has: name => name in m,
    get: async (name, key) => m[name].get(key),
    getMany: async (name, keys) => new Map(keys.filter(k => m[name].has(k)).map(k => [k, m[name].get(k)])),
    getAll: async name => [...m[name].values()],
    keys: async (name, prefix = "") => [...m[name].keys()].filter(k => String(k).startsWith(prefix)),
    put: async (name, value, key) => { m[name].set(STORES[name] ? value[STORES[name]] : key, value); },
    putMany: async (name, entries) => { for(const [k, v] of entries) m[name].set(k, v); },
    del: async (name, keys) => { for(const k of [].concat(keys)) m[name].delete(k); },
    clear: async name => { m[name].clear(); }
  };
}

function idbBackend(db){
  // One transaction; `fn` makes the requests and returns what to resolve with: a
  // request, a function read when the transaction completes, or nothing.
  // A failed write (storage full) rejects: the caller decides what to tell.
  const tx = (name, mode, fn) => new Promise((resolve, reject) => {
    const t = db.transaction(name, mode);
    const out = fn(t.objectStore(name));
    t.oncomplete = () => resolve(typeof out === "function" ? out() : out instanceof IDBRequest ? out.result : undefined);
    t.onerror = t.onabort = () => reject(t.error);
  });
  const prefixed = p => p ? IDBKeyRange.bound(p, p + "￿") : undefined;
  return {
    has: name => db.objectStoreNames.contains(name),
    get: (name, key) => tx(name, "readonly", s => s.get(key)),
    getMany: (name, keys) => tx(name, "readonly", s => {
      const reqs = keys.map(k => [k, s.get(k)]);
      return () => new Map(reqs.filter(([, r]) => r.result !== undefined).map(([k, r]) => [k, r.result]));
    }),
    getAll: name => tx(name, "readonly", s => s.getAll()),
    keys: (name, prefix = "") => tx(name, "readonly", s => s.getAllKeys(prefixed(prefix))),
    put: (name, value, key) => tx(name, "readwrite", s => { STORES[name] ? s.put(value) : s.put(value, key); }),
    putMany: (name, entries) => tx(name, "readwrite", s => { for(const [k, v] of entries) s.put(v, k); }),
    del: (name, keys) => tx(name, "readwrite", s => { for(const k of [].concat(keys)) s.delete(k); }),
    clear: name => tx(name, "readwrite", s => { s.clear(); })
  };
}

let backendPromise = null;
let persistent = true;

// The backend in use, opened once.
export function backend(){
  if(!backendPromise){
    backendPromise = new Promise(resolve => {
      const memory = () => { persistent = false; resolve(memoryBackend()); };
      let req;
      try{ req = indexedDB.open(DB, 3); }catch(e){ memory(); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        for(const [name, keyPath] of Object.entries(STORES)){
          if(!db.objectStoreNames.contains(name)) db.createObjectStore(name, keyPath ? {keyPath} : undefined);
        }
      };
      req.onsuccess = () => resolve(idbBackend(req.result));
      req.onerror = req.onblocked = memory;
    });
  }
  return backendPromise;
}

export const isPersistent = () => persistent;

export const listTrips = async () => (await backend()).getAll("trips");
export const putTrip = async rec => (await backend()).put("trips", rec);
export const deleteTrip = async id => (await backend()).del("trips", id);
export const getKV = async key => (await backend()).get("kv", key);
export const setKV = async (key, value) => (await backend()).put("kv", value, key);
export const delKV = async key => (await backend()).del("kv", key);

// Full copies kept by 2.0 and 2.1, to move into objects once, then empty.
export async function legacyVersions(){
  const b = await backend();
  return b.has(LEGACY) ? b.getAll(LEGACY) : [];
}
export async function clearLegacyVersions(){
  const b = await backend();
  if(b.has(LEGACY)) await b.clear(LEGACY);
}

// Asks the browser not to evict the data under storage pressure. Best effort.
export function askPersistence(){
  try{
    if(navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(() => false);
  }catch(e){}
  return Promise.resolve(false);
}
