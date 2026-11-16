// Versions kept the way Git keeps them: every version is a full snapshot, made of
// pieces that versions share. A piece is every object in a list (a day, a stop, a plan)
// and any other part larger than SPLIT characters of JSON (a map picture, the hotels),
// stored once under the SHA-256 of its content; its parent holds {"\u0000": sha} in its
// place. A version that changes one stop adds a few small pieces (the stop, its list,
// its day, the list of days, the trip) and shares all the others.
//
// The version id does not change: it is still computed on the whole trip (js/version.js).
// Commits are kept under "<trip id>@<version id>": {root, parents, date}. The history is
// rebuilt from the parents, as Git does; it is kept as a list only for a version whose
// parents this device never had (the first file of a trip received from elsewhere).
// No DOM here: the backend (js/store.js) is passed in, the tests pass the memory one.

import { canonical, contentOf, withVersion, historyFrom } from "./version.js";

const REF = "\u0000";
const SPLIT = 200;

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const isRef = v => isObj(v) && REF in v;

const hashes = new Map();   // JSON text → sha, so unchanged pieces are hashed once
async function sha(text){
  let h = hashes.get(text);
  if(!h){
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    h = [...new Uint8Array(buf)].slice(0, 10).map(b => b.toString(16).padStart(2, "0")).join("");
    if(hashes.size > 20000) hashes.clear();
    hashes.set(text, h);
  }
  return h;
}

// The value with its pieces replaced by refs; the pieces go into `out`.
async function split(value, out, force = false){
  if(value === null || typeof value !== "object") return value;
  const node = Array.isArray(value)
    ? await Promise.all(value.map(v => split(v, out, isObj(v))))
    : Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await split(v, out)])));
  const text = canonical(node);
  if(!force && text.length <= SPLIT) return node;
  const id = await sha(text);
  out.set(id, node);
  return {[REF]: id};
}

// The refs a piece points to, not looking inside them.
function refsIn(v, acc = []){
  if(isRef(v)) acc.push(v[REF]);
  else if(Array.isArray(v)) v.forEach(x => refsIn(x, acc));
  else if(isObj(v)) Object.values(v).forEach(x => refsIn(x, acc));
  return acc;
}

function build(v, pieces){
  if(isRef(v)){
    const p = pieces.get(v[REF]);
    if(p === undefined) throw new Error("missing piece " + v[REF]);
    return build(p, pieces);
  }
  if(Array.isArray(v)) return v.map(x => build(x, pieces));
  if(isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, build(x, pieces)]));
  return v;
}

// Loads a piece and everything under it, one level at a time: a few reads in all.
async function load(db, root){
  const pieces = new Map();
  let want = [root];
  while(want.length){
    const got = await db.getMany("objects", want);
    got.forEach((v, k) => pieces.set(k, v));
    want = [...new Set([...got.values()].flatMap(v => refsIn(v)))].filter(id => !pieces.has(id));
  }
  return pieces;
}

/**
 * The versions of every trip on this device.
 *   put(trip)          keeps the version a trip carries (nothing if already kept)
 *   get(tripId, id)    the trip at that version, or null if this device does not have it
 *   ids(tripId)        the versions kept for a trip
 *   drop(tripId)       forgets all the versions of a trip
 */
export function versionStore(db){
  const known = new Set();   // pieces already in the store, to skip writing them again
  const key = (tripId, id) => tripId + "@" + id;

  // All the commits of a trip, by version id: one read.
  async function commitsOf(tripId){
    const keys = await db.keys("commits", tripId + "@");
    const got = await db.getMany("commits", keys);
    return new Map([...got].map(([k, c]) => [String(k).slice(tripId.length + 1), c]));
  }

  // A version's history from its parents; null if a parent is not on this device.
  function rebuild(parents, commits, memo = new Map()){
    if(parents.some(p => !commits.has(p))) return null;
    const of = p => {
      if(!memo.has(p)){ const c = commits.get(p); memo.set(p, c.history || rebuild(c.parents, commits, memo)); }
      return memo.get(p);
    };
    return historyFrom(parents, of);
  }

  async function sweep(){
    const roots = (await db.getAll("commits")).map(c => c.root);
    const keep = new Set();
    let want = roots;
    while(want.length){
      want = [...new Set(want)].filter(id => !keep.has(id));
      want.forEach(id => keep.add(id));
      want = [...(await db.getMany("objects", want)).values()].flatMap(v => refsIn(v));
    }
    const gone = (await db.keys("objects")).filter(id => !keep.has(id));
    if(gone.length) await db.del("objects", gone);
    gone.forEach(id => known.delete(id));
  }

  return {
    async put(trip){
      const v = trip.version, commits = await commitsOf(trip.id);
      if(commits.has(v.id)) return;
      const out = new Map();
      const root = (await split(contentOf(trip), out, true))[REF];
      const fresh = [...out].filter(([id]) => !known.has(id));
      if(fresh.length) await db.putMany("objects", fresh);
      out.forEach((p, id) => known.add(id));
      const c = {root, parents: v.parents, ...(v.date ? {date: v.date} : {})};
      const rebuilt = rebuild(v.parents, commits);
      if(!rebuilt || rebuilt.join() !== v.history.join()) c.history = v.history;
      await db.put("commits", c, key(trip.id, v.id));
    },
    async get(tripId, id){
      const commits = await commitsOf(tripId), c = commits.get(id);
      if(!c) return null;
      const version = {id, parents: c.parents, history: c.history || rebuild(c.parents, commits), ...(c.date ? {date: c.date} : {})};
      try{ return withVersion(build({[REF]: c.root}, await load(db, c.root)), version); }
      catch(e){ return null; }
    },
    async ids(tripId){
      return (await db.keys("commits", tripId + "@")).map(k => String(k).slice(tripId.length + 1));
    },
    async drop(tripId){
      const keys = await db.keys("commits", tripId + "@");
      if(keys.length) await db.del("commits", keys);
      await sweep();
    }
  };
}
