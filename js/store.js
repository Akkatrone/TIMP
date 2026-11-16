// Everything the app remembers lives in IndexedDB on this device.
// If the browser refuses storage (some private windows), it falls back to memory.

const DB = "travel-in-my-pocket";
let dbPromise = null;
let memory = null; // {trips: Map, kv: Map, versions: Map} when IndexedDB is unusable
const emptyMemory = () => ({trips: new Map(), kv: new Map(), versions: new Map()});

function open(){
  if(memory) return Promise.reject(new Error("memory"));
  if(!dbPromise){
    dbPromise = new Promise((resolve, reject) => {
      let req;
      // Version 2 added "versions": every version of every trip this device has seen,
      // so a merge can compare both sides with the version they last shared.
      try{ req = indexedDB.open(DB, 2); }catch(e){ reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains("trips")) db.createObjectStore("trips", {keyPath: "id"});
        if(!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if(!db.objectStoreNames.contains("versions")) db.createObjectStore("versions");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("blocked"));
    }).catch(e => {
      memory = emptyMemory();
      throw e;
    });
  }
  return dbPromise;
}

function run(store, mode, fn, fallback){
  // Only a failure to open the database switches to memory. A failed write
  // (for example: storage full) is reported to the caller instead.
  return open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error);
  }), () => fallback(memory));
}

export const isPersistent = () => !memory;

export const listTrips = () => run("trips", "readonly", s => s.getAll(), m => [...m.trips.values()]);
export const putTrip = rec => run("trips", "readwrite", s => s.put(rec), m => { m.trips.set(rec.id, rec); });
export const deleteTrip = id => run("trips", "readwrite", s => s.delete(id), m => { m.trips.delete(id); });
export const getKV = key => run("kv", "readonly", s => s.get(key), m => m.kv.get(key));
export const setKV = (key, value) => run("kv", "readwrite", s => s.put(value, key), m => { m.kv.set(key, value); });
export const delKV = key => run("kv", "readwrite", s => s.delete(key), m => { m.kv.delete(key); });

// Versions, keyed "<trip id>@<version id>". A trip file is about 100 KB, so even a
// few hundred versions stay well within what a phone gives a web app.
const vkey = (tripId, id) => tripId + "@" + id;
export const putVersion = trip => run("versions", "readwrite", s => s.put(trip, vkey(trip.id, trip.version.id)), m => { m.versions.set(vkey(trip.id, trip.version.id), trip); });
export const getVersion = (tripId, id) => run("versions", "readonly", s => s.get(vkey(tripId, id)), m => m.versions.get(vkey(tripId, id)));
export const versionIds = tripId => run("versions", "readonly", s => s.getAllKeys(IDBKeyRange.bound(tripId + "@", tripId + "@\uffff")),
  m => [...m.versions.keys()].filter(k => k.startsWith(tripId + "@"))).then(keys => (keys || []).map(k => String(k).slice(tripId.length + 1)));
export const deleteVersions = tripId => run("versions", "readwrite", s => s.delete(IDBKeyRange.bound(tripId + "@", tripId + "@\uffff")),
  m => { [...m.versions.keys()].filter(k => k.startsWith(tripId + "@")).forEach(k => m.versions.delete(k)); });

// Asks the browser not to evict the data under storage pressure. Best effort.
export function askPersistence(){
  try{
    if(navigator.storage && navigator.storage.persist) return navigator.storage.persist().catch(() => false);
  }catch(e){}
  return Promise.resolve(false);
}
