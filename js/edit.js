// Changes to the stops of a trip: add, update, move, remove.
// Every function returns a new trip and leaves the one it was given untouched.
// No DOM here.

// A stop is found by the day (its date), the plan (its id, or null) and its own id.
// ref: {date, plan, id}

import { FIELDS, slug, tripId } from "./trip.js";

// An id made from the title, unique among `taken`.
export function newId(title, taken){
  const base = slug(title);
  let id = base, n = 2;
  while(taken.has(id)) id = `${base}-${n++}`;
  return id;
}

// Minutes since midnight for times like "9:30", "09:30" or "09.30"; null for "Evening".
export function clockMinutes(time){
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(time));
  if(!m) return null;
  const h = +m[1], min = +m[2];
  return h < 24 && min < 60 ? h * 60 + min : null;
}

// Where a stop at `time` goes in a list: after the last stop with a clock time not
// later than it. Stops with words for times ("Dinner") keep their place.
export function insertIndex(stops, time){
  const t = clockMinutes(time);
  if(t === null) return stops.length;
  let at = -1;
  stops.forEach((s, i) => { const c = clockMinutes(s.time); if(c !== null && c <= t) at = i; });
  if(at >= 0) return at + 1;
  const firstLater = stops.findIndex(s => { const c = clockMinutes(s.time); return c !== null && c > t; });
  return firstLater >= 0 ? firstLater : stops.length;
}

const clone = v => JSON.parse(JSON.stringify(v));

// The list of stops a ref points to, inside a trip that may be changed.
function listIn(trip, date, plan){
  const day = trip.days.find(d => d.date === date);
  if(!day) throw new Error(`no day ${date}`);
  if(day.plans){
    const p = day.plans.find(x => x.id === (plan || day.plans[0].id));
    if(!p) throw new Error(`no plan ${plan} on ${date}`);
    return p.stops;
  }
  return day.stops;
}

/**
 * Gives an id to the trip, and to every plan and stop, that has none. Files written by
 * hand or by an assistant usually lack them; edits, merges and ticks need them.
 * Returns the new trip and, for each stop, the old key the app used for it ("#3") and
 * the new id, so ticks can follow.
 */
export function ensureIds(trip){
  const out = clone(trip), renamed = [];
  if(!out.id) out.id = tripId(out);
  out.days.forEach(d => {
    if(!d.plans) return;
    const taken = new Set(d.plans.filter(p => p.id).map(p => p.id));
    d.plans.forEach(p => { if(!p.id){ p.id = newId(p.name, taken); taken.add(p.id); } });
  });
  const fix = (stops, date, plan) => {
    const taken = new Set(stops.filter(s => s.id).map(s => s.id));
    stops.forEach((s, i) => {
      if(s.id) return;
      s.id = newId(s.title, taken);
      taken.add(s.id);
      renamed.push({date, plan, from: "#" + i, to: s.id});
    });
  };
  out.days.forEach(d => d.plans ? d.plans.forEach(p => fix(p.stops, d.date, p.id)) : fix(d.stops, d.date, null));
  return {trip: out, renamed};
}

// Adds `stop` (without an id) to a day and plan, in time order. Returns {trip, ref}.
export function addStop(trip, {date, plan}, stop){
  const out = clone(trip);
  const list = listIn(out, date, plan);
  const s = {id: newId(stop.title, new Set(list.map(x => x.id))), ...clean(stop)};
  list.splice(insertIndex(list, s.time), 0, s);
  return {trip: out, ref: {date, plan: plan || null, id: s.id}};
}

// Replaces a stop with `stop`, possibly on another day or plan (`to`). The id stays,
// unless it is already taken where the stop goes. Returns {trip, ref}.
export function updateStop(trip, ref, stop, to = ref){
  const out = clone(trip);
  const from = listIn(out, ref.date, ref.plan);
  const i = from.findIndex(s => s.id === ref.id);
  if(i < 0) throw new Error(`no stop ${ref.id}`);
  const old = from[i];
  const moved = to.date !== ref.date || (to.plan || null) !== (ref.plan || null);
  const next = {...clean(stop), id: old.id};
  if(!moved && clockMinutes(next.time) === clockMinutes(old.time) && next.time === old.time){
    from[i] = orderLike(old, next);
    return {trip: out, ref};
  }
  from.splice(i, 1);
  const dest = listIn(out, to.date, to.plan);
  if(moved && dest.some(s => s.id === next.id)) next.id = newId(next.title, new Set(dest.map(s => s.id)));
  dest.splice(insertIndex(dest, next.time), 0, orderLike(old, next));
  return {trip: out, ref: {date: to.date, plan: to.plan || null, id: next.id}};
}

export function removeStop(trip, ref){
  const out = clone(trip);
  const list = listIn(out, ref.date, ref.plan);
  const i = list.findIndex(s => s.id === ref.id);
  if(i < 0) throw new Error(`no stop ${ref.id}`);
  list.splice(i, 1);
  return out;
}

// Empty fields are left out of the file.
function clean(stop){
  return Object.fromEntries(Object.entries(stop).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

// Keeps the field order the stop had, so a small edit is a small change in the file.
const ORDER = ["id", ...Object.keys(FIELDS.stop)];
function orderLike(old, next){
  const keys = [...new Set([...Object.keys(old), ...ORDER, ...Object.keys(next)])].filter(k => k in next);
  return Object.fromEntries(keys.map(k => [k, next[k]]));
}
