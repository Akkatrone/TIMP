// The traveller's personal set of a trip: private expenses, what they spend only for
// themselves (shopping, a meal alone), and on the account their marks. Kept on the
// phone next to the trip, never in its versions: it takes no part in a merge, and a
// phone that receives the trip without it has the same trip with the same version.
// The expenses go in a saved file too, in its "private" section; the marks never do.
// No DOM here.
//
//   "private": {"owner": "p-…", "expenses": [{id, title, cost, currency?, date?, stop?}], "marks": {…}}
//
// marks: as the app keeps them (S.state): done, skipped {"date|plan|id": 1}; plans
//   {date: plan id}; chosen {stop id: 1}, the options chosen only for me (js/choices.js).
//
// owner: a random code, made by the phone of the person they belong to. A phone that
//   loads a file with its own code takes them without asking; any other phone asks.
// stop: the id of the stop where it was paid, on the day in `date`. When the stop is
//   deleted, the expense stays, with its own title and date.

import { addExpense, updateExpense, removeExpense, newId } from "./edit.js";
import { findStopId } from "./ids.js";

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

/* ---------- marks: ticks, skips, a plan and options of my own ---------- */

const MARKS = ["done", "skipped", "plans", "chosen"];

/** A set with nothing in it: no expenses, no marks. */
export const emptySet = p => !p || (!(p.expenses || []).length && !MARKS.some(k => p.marks && p.marks[k] && Object.keys(p.marks[k]).length));

/** The set with the marks of `state`; null when nothing is left. Always with `marks`: without it, an app of before wrote the set (mergePrivate). */
export function withMarks(priv, state){
  const out = {...(priv || {expenses: []}), marks: Object.fromEntries(MARKS.filter(k => state[k] && Object.keys(state[k]).length).map(k => [k, state[k]]))};
  return emptySet(out) ? null : out;
}

/** The state with the set's marks, when it has any. */
export const marksInto = (state, priv) => priv && priv.marks ? {...state, ...Object.fromEntries(MARKS.map(k => [k, {...priv.marks[k]}]))} : state;

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
  return {...(local && local.marks ? {marks: local.marks} : {}), owner: (local && local.owner) || incoming.owner || owner, expenses};
}

/* ---------- changes, as for the trip's own expenses (js/edit.js) ---------- */

// The expense functions work on anything with days and expenses.
const asTrip = (priv, trip) => ({days: trip.days, expenses: priv ? priv.expenses : []});
const back = (priv, owner, out) => ({...priv, owner: (priv && priv.owner) || owner, expenses: out.expenses || []});

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

/**
 * Links to a stop's id of before, when the trip came with the ids it became (js/ids.js):
 * to the id it became, on that day. The same set when nothing changed.
 */
export function followIds(priv, trip){
  if(!priv) return priv;
  let changed = false;
  const expenses = priv.expenses.map(x => {
    const d = x.stop && trip.days.find(y => y.date === x.date);
    if(!d) return x;
    const lists = d.plans ? d.plans.map(p => [p.id, p.stops]) : [[null, d.stops]];
    if(lists.some(([, l]) => l.some(s => s.id === x.stop))) return x;
    for(const [plan, l] of lists){
      const to = findStopId(trip, x.date, plan, l, x.stop);
      if(to){ changed = true; return {...x, stop: to}; }
    }
    return x;
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
const same = (a, b) => {
  const c = v => v && typeof v === "object" ? JSON.stringify(Object.keys(v).sort().reduce((o, k) => (o[k] = v[k], o), {})) : JSON.stringify(v);
  return c(a) === c(b);
};

// Entry by entry, as two copies of a trip are joined: changed on one side only, that
// side; on both, this phone's; gone on one side and untouched on the other, gone; gone
// on one, changed on the other, kept; new on either side, kept.
function join3(B, L, S){
  const out = new Map();
  for(const k of new Set([...L.keys(), ...S.keys()])){
    const b = B.get(k), l = L.get(k), s = S.get(k);
    if(l !== undefined && s !== undefined) out.set(k, same(l, b) ? s : l);
    else if(l !== undefined){ if(b === undefined || !same(l, b)) out.set(k, l); }
    else if(b === undefined || !same(s, b)) out.set(k, s);
  }
  return out;
}

/**
 * The personal set changed on this phone and on the service since the last sync
 * (`base`), joined three ways: the expenses by id, each mark by its key. A set from the
 * service without marks was written by an app of before, which knows none: its marks
 * are taken as unchanged, never as all removed.
 * @returns the set, or null when nothing is left
 */
export function mergePrivate(base, local, server){
  const byId = s => new Map((s ? s.expenses || [] : []).map(x => [x.id, x]));
  // The same order on every phone: by date, then by id.
  const key = x => (x.date || "") + "\u0000" + x.id;
  const expenses = [...join3(byId(base), byId(local), byId(server)).values()].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  const marksOf = s => (s && s.marks) || {};
  const theirs = server && server.marks ? server.marks : marksOf(base);
  const marks = Object.fromEntries(MARKS.map(k => [k, Object.fromEntries(join3(...[marksOf(base), marksOf(local), theirs].map(m => new Map(Object.entries(m[k] || {})))))]).filter(([, v]) => Object.keys(v).length));
  const owner = (local && local.owner) || (server && server.owner) || (base && base.owner);
  const out = {...(owner ? {owner} : {}), expenses, marks};
  return emptySet(out) ? null : out;
}
