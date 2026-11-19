// Private expenses: what the traveller spends only for themselves (shopping, a meal
// alone). They are in the trip file, in its "private" section, and kept on the phone
// next to the trip, but never in its versions: they take no part in a merge, and a
// phone that receives the trip without them, or skips them, has the same trip with
// the same version. No DOM here.
//
//   "private": {"owner": "p-…", "expenses": [{id, title, cost, currency?, date?, stop?}]}
//
// owner: a random code, made by the phone of the person they belong to. A phone that
//   loads a file with its own code takes them without asking; any other phone asks.
// stop: the id of the stop where it was paid, on the day in `date`. When the stop is
//   deleted, the expense stays, with its own title and date.

import { addExpense, updateExpense, removeExpense, newId } from "./edit.js";

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);

/** A new owner code: nothing about the person, only a way to know their expenses again. */
export function newOwner(){
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return "p-" + [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}

/**
 * A checked file split in two: the trip, and its private expenses (with ids), or null.
 * @returns {{trip: object, priv: {owner?: string, expenses: object[]} | null}}
 */
export function splitPrivate(file){
  if(!isObj(file) || file.private === undefined) return {trip: file, priv: null};
  const {private: p, ...trip} = file;
  const list = isObj(p) && Array.isArray(p.expenses) ? p.expenses : [];
  const taken = new Set(list.filter(x => x.id).map(x => x.id));
  const expenses = list.map(x => {
    if(x.id) return {...x};
    const id = newId(x.title, taken);
    taken.add(id);
    return {id, ...x};
  });
  return {trip, priv: expenses.length ? {...(p.owner ? {owner: p.owner} : {}), expenses} : null};
}

/** The trip as a file, with the private expenses when there are any. */
export function withPrivate(trip, priv){
  if(!priv || !priv.expenses.length) return trip;
  return {...trip, private: {...(priv.owner ? {owner: priv.owner} : {}), expenses: priv.expenses}};
}

/**
 * What to do with the private expenses of a file being loaded.
 *   "none"   it has none
 *   "mine"   they are this phone's: joined without asking
 *   "other"  someone else's, and this phone has its own for the trip: left out
 *   "ask"    the traveller decides; `yes` is the answer to suggest: true when they are
 *            no one's yet (an assistant wrote them)
 * @param local     the private expenses this phone has for the trip, or null
 * @param incoming  those of the file, or null
 * @param owner     this phone's code, or ""
 */
export function onLoad(local, incoming, owner){
  if(!incoming || !incoming.expenses.length) return {action: "none"};
  const had = !!(local && local.expenses.length);
  if(had && incoming.owner && local.owner && local.owner !== incoming.owner) return {action: "other"};
  if(incoming.owner && (incoming.owner === (local && local.owner) || incoming.owner === owner)) return {action: "mine"};
  return {action: "ask", yes: !incoming.owner};
}

/**
 * The private expenses after taking those of a file: matched by id, the file's win.
 * The owner stays the one they had; else the file's; else `owner`, this phone's.
 */
export function join(local, incoming, owner){
  const byId = new Map((local ? local.expenses : []).map(x => [x.id, x]));
  for(const x of incoming.expenses) byId.set(x.id, x);
  const expenses = [...byId.values()].sort((a, b) => (a.date || "") < (b.date || "") ? -1 : (a.date || "") > (b.date || "") ? 1 : 0);
  return {owner: (local && local.owner) || incoming.owner || owner, expenses};
}

/* ---------- changes, as for the trip's own expenses (js/edit.js) ---------- */

// The expense functions work on anything with days and expenses.
const asTrip = (priv, trip) => ({days: trip.days, expenses: priv ? priv.expenses : []});
const back = (priv, owner, out) => ({owner: (priv && priv.owner) || owner, expenses: out.expenses || []});

/** Adds a private expense. Returns {priv, id}. */
export function addPrivate(priv, trip, owner, expense){
  const out = addExpense(asTrip(priv, trip), expense);
  return {priv: back(priv, owner, out.trip), id: out.id};
}

export function updatePrivate(priv, trip, id, expense){
  return back(priv, "", updateExpense(asTrip(priv, trip), id, expense));
}

export function removePrivate(priv, trip, id){
  return back(priv, "", removeExpense(asTrip(priv, trip), id));
}

/** The private expenses paid at a stop: on its day, with its id. */
export const atStop = (priv, date, id) => priv ? priv.expenses.filter(x => x.stop === id && x.date === date) : [];

/**
 * The private cost of a stop, from its form: one expense named as the stop. `id` is
 * the one the form showed; `cost` {cost, currency}, or null to remove it.
 */
export function setAtStop(priv, trip, owner, {date, stop, title}, cost, id){
  const had = id && priv && priv.expenses.some(x => x.id === id);
  if(!cost || cost.cost === undefined) return had ? removePrivate(priv, trip, id) : priv;
  const x = {title, cost: cost.cost, currency: cost.currency, date, stop};
  return had ? updatePrivate(priv, trip, id, x) : addPrivate(priv, trip, owner, x).priv;
}

/**
 * Links follow the stops that moved to another day or got another id. `moves` as for
 * ticks (moveMarks in js/trips.js): [{date, from, to, toDate?}].
 */
export function followStops(priv, moves){
  if(!priv || !moves || !moves.length) return priv;
  let changed = false;
  const expenses = priv.expenses.map(x => {
    const m = x.stop && moves.find(m => m.from === x.stop && m.date === x.date);
    if(!m || (m.to === x.stop && (m.toDate || m.date) === x.date)) return x;
    changed = true;
    return {...x, stop: m.to, date: m.toDate || m.date};
  });
  return changed ? {...priv, expenses} : priv;
}

/** A stop deleted: what was paid there stays, under its own title, without the link. */
export function unlinkStop(priv, date, id){
  if(!priv || !atStop(priv, date, id).length) return priv;
  return {...priv, expenses: priv.expenses.map(x => x.stop === id && x.date === date ? (({stop, ...rest}) => rest)(x) : x)};
}

/* ---------- with the sharing service (js/sync.js) ---------- */

// The same content, whatever the order of the fields.
const sameExpense = (a, b) => {
  const c = v => v && typeof v === "object" ? JSON.stringify(Object.keys(v).sort().reduce((o, k) => (o[k] = v[k], o), {})) : JSON.stringify(v);
  return c(a) === c(b);
};

/**
 * The private expenses changed on this phone and on the service since the last sync
 * (`base`), joined by id, as two copies of a trip are:
 *   changed on one side only: that side;  on both: this phone's;
 *   gone on one side and untouched on the other: gone;  gone on one, changed on the other: kept;
 *   new on either side: kept.
 * @returns {owner, expenses} or null when none are left
 */
export function mergePrivate(base, local, server){
  const map = s => new Map((s ? s.expenses : []).map(x => [x.id, x]));
  const B = map(base), L = map(local), S = map(server);
  const out = [];
  for(const id of new Set([...L.keys(), ...S.keys()])){
    const b = B.get(id), l = L.get(id), s = S.get(id);
    if(l && s) out.push(sameExpense(l, b) ? s : l);
    else if(l){ if(!b || !sameExpense(l, b)) out.push(l); }
    else if(s){ if(!b || !sameExpense(s, b)) out.push(s); }
  }
  if(!out.length) return null;
  // The same order on every phone: by date, then by id.
  const key = x => (x.date || "") + "\u0000" + x.id;
  out.sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  const owner = (local && local.owner) || (server && server.owner) || (base && base.owner);
  return {...(owner ? {owner} : {}), expenses: out};
}
