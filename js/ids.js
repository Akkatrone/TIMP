// Stop ids. A stop keeps its id for ever: ticks, skips, the private expenses paid there,
// joins and chats find it by it, so one is unique in its trip.
//
// An id is twelve characters from 0-9 and a-z, the last a check of the other eleven:
// that tells it from the ids of before, made from titles ("lunch", "cena-2") and unique
// only in their list. A new stop gets a random one (newStopId). An id of before becomes
// one by a fixed rule (oldStopId), so every phone, the service, a join and a chat that
// still names "lunch" make the same id from it, without asking each other.
//
// Every list of stops a trip has, where an id is checked or fixed: the plain stops of a
// day, or the stops of each of its plans. No DOM here.

import { canonical } from "./version.js";

const ABC = "0123456789abcdefghijklmnopqrstuvwxyz";
const SPACE = 36n ** 11n;
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);

function check(body){
  let n = 0;
  for(let i = 0; i < body.length; i++) n = (n * 7 + ABC.indexOf(body[i])) % 36;
  return ABC[n];
}

/** Whether a text is a stop id of this kind (an id of before is not, but 1 in 36 of
 * twelve letters and digits would pass the check by chance: harmless, see uniqueStopIds). */
export const isStopId = id => typeof id === "string" && /^[0-9a-z]{12}$/.test(id) && check(id.slice(0, 11)) === id[11];

/** A new stop's id: eleven random characters and the check (~57 bits). */
export function newStopId(){
  let body = "";
  while(body.length < 11){
    for(const b of crypto.getRandomValues(new Uint8Array(16))) if(b < 252 && body.length < 11) body += ABC[b % 36];
  }
  return body + check(body);
}

/* ---------- SHA-256, without waiting: joins run without awaiting anything ---------- */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const ror = (x, n) => (x >>> n) | (x << (32 - n));

const W = new Uint32Array(64), UTF8 = new TextEncoder();

// The eight words of the SHA-256 of a text (UTF-8).
function digest(text){
  const data = UTF8.encode(text), l = data.length, size = Math.ceil((l + 9) / 64) * 64, m = new Uint8Array(size);
  m.set(data); m[l] = 0x80;
  const bits = l * 8;
  for(let i = 0; i < 4; i++) m[size - 1 - i] = (bits >>> (8 * i)) & 0xff;
  m[size - 5] = Math.floor(l / 0x20000000) & 0xff;
  const h = Uint32Array.from(H0), w = W;
  for(let o = 0; o < size; o += 64){
    for(let i = 0; i < 16; i++){ const j = o + i * 4; w[i] = (m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | m[j + 3]; }
    for(let i = 16; i < 64; i++){
      const x = w[i - 15], y = w[i - 2];
      w[i] = w[i - 16] + (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) + w[i - 7] + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10));
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for(let i = 0; i < 64; i++){
      const t1 = (k + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
  }
  return h;
}

/** SHA-256 of a text (UTF-8), as hex: the same as Web Crypto's (test/ids.test.mjs). */
export const sha256 = text => [...digest(text)].map(x => x.toString(16).padStart(8, "0")).join("");

// An id from a text: the first 64 bits of its SHA-256, as eleven characters, and the check.
function idFrom(text){
  const h = digest(text);
  const body = (((BigInt(h[0]) << 32n) | BigInt(h[1])) % SPACE).toString(36).padStart(11, "0");
  return body + check(body);
}

/**
 * The id a stop's id of before becomes: from the trip's id, the day, and that id; `plan`
 * only for the same id met again in another plan of the day (the first one keeps the
 * day's, so plain stops that become a plan keep their ids). The rule never changes:
 *   SHA-256 of "<trip>|<date>|<old id>" (or "<trip>|<date>|<old id>|<plan>"), its first
 *   64 bits modulo 36^11 in base 36 (eleven digits), then the check.
 */
export const oldStopId = (trip, date, old, plan = null) => idFrom([trip, date, old, ...(plan === null ? [] : [plan || ""])].join("|"));

// A copy's id: where it is, what it copies, and a counter.
const copyId = (trip, date, plan, id, n) => idFrom(["copy", trip, date, plan || "", id, n].join("|"));

// Every list of stops of a trip: [date, plan id or null, stops]. Anything not shaped
// like a trip is skipped (a file not checked yet).
function listsOf(trip){
  const out = [];
  for(const d of isObj(trip) && Array.isArray(trip.days) ? trip.days : []){
    if(!isObj(d)) continue;
    if(Array.isArray(d.plans)) for(const p of d.plans){ if(isObj(p) && Array.isArray(p.stops)) out.push([d.date, p.id ?? null, p.stops]); }
    else if(Array.isArray(d.stops)) out.push([d.date, null, d.stops]);
  }
  return out;
}

// Whether every stop that has an id has one of this kind, used once in the trip.
function fine(trip){
  const seen = new Set();
  for(const [, , stops] of listsOf(trip)) for(const s of stops){
    if(!isObj(s) || s.id === undefined) continue;
    if(!isStopId(s.id) || seen.has(s.id)) return false;
    seen.add(s.id);
  }
  return true;
}

/** Whether a trip has stop ids to fix: of before, or used twice. */
export const needsStopIds = trip => !fine(trip);

/**
 * Every stop id of this kind, once in the trip. Ids of before become oldStopId. An id in
 * more than one place (a stop an assistant copied with its id, a file edited by hand):
 * the original keeps it, the copies get one of their own. The original is the one where
 * `base` (the version the trip was made from, if known) has that id (of those, the one
 * with the content it had there); or one with that content; or the first. The same trip always gives the same ids, on any
 * device: two phones fixing the same file make the same version.
 * @returns {{trip, moves}} the trip (the same object when nothing changed) and, for the
 *   ticks and private expenses saved under the ids of before: [{date, plan, from, to}]
 */
export function uniqueStopIds(trip, base = null){
  if(fine(trip)) return {trip, moves: []};
  const out = JSON.parse(JSON.stringify(trip)), tid = String(out.id || ""), moves = [];
  // Ids of before: the first in the day by the day's rule, again in another plan by its own.
  const firstIn = new Map();
  for(const [date, plan, stops] of listsOf(out)){
    if(!firstIn.has(date)) firstIn.set(date, new Set());
    const seen = firstIn.get(date);
    for(const s of stops){
      if(!isObj(s) || typeof s.id !== "string" || isStopId(s.id)) continue;
      const to = seen.has(s.id) ? oldStopId(tid, date, s.id, plan) : oldStopId(tid, date, s.id);
      seen.add(s.id);
      moves.push({date, plan, from: s.id, s});
      s.id = to;
    }
  }
  // An id in more than one place: the copies get their own.
  const where = t => {
    const m = new Map();
    for(const [date, plan, stops] of listsOf(t)) for(const s of stops) if(isObj(s) && typeof s.id === "string"){
      if(!m.has(s.id)) m.set(s.id, []);
      m.get(s.id).push({date, plan, s});
    }
    return m;
  };
  const all = where(out), was = base ? where(uniqueStopIds(base).trip) : new Map(), taken = new Set(all.keys());
  const content = s => { const {id, ...rest} = s; return canonical(rest); };
  for(const [id, xs] of all){
    if(xs.length < 2) continue;
    const before = was.get(id) || [];
    const same = x => before.some(b => content(b.s) === content(x.s));
    const there = xs.filter(x => before.some(b => b.date === x.date && b.plan === x.plan));
    const keep = there.find(same) || there[0] || xs.find(same) || xs[0];
    let n = 0;
    for(const x of xs){
      if(x === keep) continue;
      let to;
      do to = copyId(tid, x.date, x.plan, id, n++); while(taken.has(to));
      taken.add(to);
      x.s.id = to;
    }
  }
  return {trip: out, moves: moves.map(({s, ...m}) => ({...m, to: s.id}))};
}

/**
 * The stop an id names in a list, for ids that come from outside (a chat, a changes
 * file): the id itself, or, for an id of before, what it became. Undefined when none.
 */
export function findStopId(trip, date, plan, stops, id){
  if(stops.some(s => s.id === id)) return id;
  if(typeof id !== "string" || isStopId(id)) return undefined;
  const tid = String(trip.id || "");
  return [oldStopId(tid, date, id), oldStopId(tid, date, id, plan)].find(c => stops.some(s => s.id === c));
}
