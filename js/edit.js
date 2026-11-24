// Changes to the stops, days and plans of a trip: add, update, move, remove.
// Every function returns a new trip and leaves the one it was given untouched.
// No DOM here.

// A stop is found by the day (its date), the plan (its id, or null) and its own id.
// ref: {date, plan, id}

import { minutesOf } from "./parts.js";
import { FIELDS, slug, tripId } from "./trip.js";
import { newStopId, uniqueStopIds } from "./ids.js";
import { groupOf, choose, tidyGroups } from "./choices.js";

// An id made from the title, unique among `taken`: for plans and expenses, unique in
// their list. Stops have ids of their own kind (js/ids.js).
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

// Where a stop at `time` goes in a list: after the last stop with a time not later than
// it (a clock time, or the start of its part of the day: js/parts.js). Stops with words
// that name no part keep their place.
export function insertIndex(stops, time){
  const t = minutesOf(time);
  if(t === null) return stops.length;
  let at = -1;
  stops.forEach((s, i) => { const c = minutesOf(s.time); if(c !== null && c <= t) at = i; });
  if(at >= 0) return at + 1;
  const firstLater = stops.findIndex(s => { const c = minutesOf(s.time); return c !== null && c > t; });
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
 * Gives an id to the trip, and to every plan and stop, that has none; and makes every
 * stop id one of its own, once in the trip (uniqueStopIds in js/ids.js: ids of before
 * converted, copies told apart; `base`, the version the trip was made from, says which
 * is the original). Files written by hand or by an assistant usually lack them; edits,
 * merges and ticks need them. The same file gives the same ids on every device.
 * Returns the new trip and, for each stop, the old key the app used for it ("#3", or its
 * id of before) and the new id, so ticks can follow.
 */
export function ensureIds(trip, base = null){
  const out = clone(trip), named = [];
  const days = Array.isArray(out.days) ? out.days.filter(d => d && typeof d === "object") : [];
  if(!out.id && days.length && typeof days[0].date === "string") out.id = tripId(out);
  days.forEach(d => {
    if(!Array.isArray(d.plans)) return;
    const taken = new Set(d.plans.filter(p => p && p.id).map(p => p.id));
    d.plans.forEach(p => { if(p && typeof p === "object" && !p.id){ p.id = newId(p.name, taken); taken.add(p.id); } });
  });
  // A stop without an id gets one from its title first, the way ids were made before:
  // then the same as any id of before.
  const fix = (stops, date, plan) => {
    if(!Array.isArray(stops)) return;
    const taken = new Set(stops.filter(s => s && s.id).map(s => s.id));
    stops.forEach((s, i) => {
      if(!s || typeof s !== "object" || s.id) return;
      s.id = newId(s.title, taken);
      taken.add(s.id);
      named.push({date, plan, from: "#" + i, to: s.id});
    });
  };
  days.forEach(d => Array.isArray(d.plans) ? d.plans.forEach(p => p && fix(p.stops, d.date, p.id)) : fix(d.stops, d.date, null));
  if(Array.isArray(out.expenses)){
    const taken = new Set(out.expenses.filter(x => x && x.id).map(x => x.id));
    out.expenses.forEach(x => { if(x && typeof x === "object" && !x.id){ x.id = newId(x.title, taken); taken.add(x.id); } });
  }
  const {trip: ready, moves} = uniqueStopIds(out, base);
  const final = (date, plan, id) => (moves.find(m => m.date === date && m.plan === plan && m.from === id) || {to: id}).to;
  const renamed = [...named.map(m => ({...m, to: final(m.date, m.plan, m.to)})), ...moves];
  return {trip: ready, renamed};
}

// Adds `stop` (without an id) to a day and plan, in time order, with a new id (`id`:
// one made elsewhere, by the tests). A stop with no time is all day: at the top of the
// day, after the other all-day ones. Returns {trip, ref}.
export function addStop(trip, {date, plan}, stop, id = newStopId()){
  const out = clone(trip);
  const list = listIn(out, date, plan);
  const s = {id, ...clean(stop)};
  const allDay = s.time === undefined || s.time === "";
  const top = list.findIndex(x => x.time !== undefined && x.time !== "");
  list.splice(allDay ? (top < 0 ? list.length : top) : insertIndex(list, s.time), 0, s);
  return {trip: out, ref: {date, plan: plan || null, id: s.id}};
}

// Replaces a stop with `stop`, possibly on another day or plan (`to`). The id stays
// (unless a trip from before has it where the stop goes: then a new one). Returns {trip, ref}.
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
  if(moved && dest.some(s => s.id === next.id)) next.id = newStopId();
  dest.splice(insertIndex(dest, next.time), 0, orderLike(old, next));
  return {trip: out, ref: {date: to.date, plan: to.plan || null, id: next.id}};
}

// Removes a stop. An option of a group: the group goes on without it (to choose, if it
// was the one chosen); left with one option, that one is a plain stop again.
export function removeStop(trip, ref){
  const out = clone(trip);
  const list = listIn(out, ref.date, ref.plan);
  const i = list.findIndex(s => s.id === ref.id);
  if(i < 0) throw new Error(`no stop ${ref.id}`);
  const [gone] = list.splice(i, 1);
  if(groupOf(gone)) list.splice(0, list.length, ...tidyGroups(list));
  return out;
}

/* ---------- alternatives (js/choices.js) ---------- */

// Chooses the option `ref.id` of its group, for the trip: the others of the group not.
export function chooseOption(trip, ref){
  const out = clone(trip);
  const list = listIn(out, ref.date, ref.plan);
  list.splice(0, list.length, ...choose(list, ref.id));
  return out;
}

// Adds `stop` (without an id) as an alternative to the stop `ref.id`: in its group, or in a
// new one named `name`, of which that stop is the first option, chosen. Returns {trip, ref}.
export function addAlternative(trip, ref, stop, name, id = newStopId()){
  const out = clone(trip);
  const list = listIn(out, ref.date, ref.plan);
  const s = list.find(x => x.id === ref.id);
  if(!s) throw new Error(`no stop ${ref.id}`);
  const group = groupOf(s) || String(name || "").trim();
  if(!group) throw new Error("the group needs a name");
  // The first alternative: the stop becomes the first option, chosen (the day went there).
  if(list.filter(x => groupOf(x) === group).length < 2){ s.choice = group; s.chosen = true; }
  const {chosen, ...rest} = stop;
  const x = {id, ...clean({...rest, choice: group})};
  list.splice(insertIndex(list, x.time), 0, orderLike({}, x));
  return {trip: out, ref: {date: ref.date, plan: ref.plan || null, id}};
}

// Moves every option of the group `name` to another day or plan (`to`), in their order
// and each in time order there: the group goes on there as it was.
export function moveGroup(trip, {date, plan}, name, to){
  const out = clone(trip);
  const from = listIn(out, date, plan), dest = listIn(out, to.date, to.plan);
  const options = from.filter(s => groupOf(s) === name);
  if(!options.length) throw new Error(`no group ${name}`);
  from.splice(0, from.length, ...from.filter(s => groupOf(s) !== name));
  for(const s of options) dest.splice(insertIndex(dest, s.time), 0, s);
  return out;
}

// The plan `id` chosen for the day, for everyone: the others not.
export function choosePlan(trip, date, id){
  const out = clone(trip);
  const d = dayAt(out, date);
  if(!d.plans || !d.plans.some(p => p.id === id)) throw new Error(`${date} has no plan "${id}"`);
  d.plans = d.plans.map(p => p.id === id ? {...p, chosen: true} : (({chosen, ...rest}) => rest)(p));
  return out;
}

// A stop out of its group: without `choice` and `chosen`; the group it leaves tidied.
export function leaveGroup(stop){
  const {choice, chosen, ...rest} = stop;
  return rest;
}

/* ---------- days ---------- */

// The date after "YYYY-MM-DD".
export function dayAfter(date){
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const byDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
const dayAt = (trip, date) => {
  const d = trip.days.find(x => x.date === date);
  if(!d) throw new Error(`there is no day ${date}`);
  return d;
};

// Adds a day, with its stops or plans, in date order. Days are known by their date:
// there cannot be two on the same one.
export function addDay(trip, day){
  const out = clone(trip);
  if(out.days.some(d => d.date === day.date)) throw new Error(`there is already a day ${day.date}`);
  out.days.push(clone(day));
  out.days.sort(byDate);
  return out;
}

// Changes a day's own fields (city, title, stay, notes). An empty value removes the
// field; the date, the stops and the plans are not changed here.
export function updateDay(trip, date, set){
  const out = clone(trip);
  const i = out.days.indexOf(dayAt(out, date));
  const old = out.days[i], next = {...old};
  for(const [k, v] of Object.entries(set)){
    if(k === "date" || k === "stops" || k === "plans") throw new Error(`cannot change ${k}: change the stops one by one`);
    if(v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) delete next[k]; else next[k] = v;
  }
  // The day's fields in their usual order, stops or plans last.
  const keys = [...new Set([...Object.keys(old).filter(k => k !== "stops" && k !== "plans"), ...DAY_ORDER])].filter(k => k in next);
  out.days[i] = Object.fromEntries(keys.map(k => [k, next[k]]));
  return out;
}

// Removes a day and its stops. A trip keeps at least one day.
export function removeDay(trip, date){
  const out = clone(trip);
  const d = dayAt(out, date);
  if(out.days.length === 1) throw new Error("a trip needs at least one day");
  out.days.splice(out.days.indexOf(d), 1);
  return out;
}

/* ---------- plans ---------- */

// Adds an alternative plan ({name, stops}, an id if it has a free one) to a day. A day
// without plans gets two: the stops it has become the first, named `first`, and their
// ticks follow (marks). Returns {trip, id, marks}.
export function addPlan(trip, date, plan, first){
  const out = clone(trip);
  const d = dayAt(out, date);
  if(!plan || typeof plan.name !== "string" || !plan.name.trim()) throw new Error("the plan needs a name");
  if(!Array.isArray(plan.stops) || !plan.stops.length) throw new Error("the plan needs its stops");
  const marks = [];
  if(!d.plans){
    if(typeof first !== "string" || !first.trim()) throw new Error(`"first" must name the plan made of the stops ${date} has now`);
    const id0 = newId(first, new Set());
    d.plans = [{id: id0, name: first.trim(), stops: d.stops}];
    for(const s of d.stops) if(s.id) marks.push({date, plan: null, from: s.id, to: s.id, toDate: date, toPlan: id0});
    delete d.stops;
  }
  const taken = new Set(d.plans.map(p => p.id));
  const id = typeof plan.id === "string" && plan.id && !taken.has(plan.id) ? plan.id : newId(plan.name, taken);
  d.plans.push({id, name: plan.name.trim(), stops: clone(plan.stops)});
  return {trip: out, id, marks};
}

// Renames a plan.
export function renamePlan(trip, date, id, name){
  const out = clone(trip);
  const d = dayAt(out, date);
  const p = d.plans && d.plans.find(x => x.id === id);
  if(!p) throw new Error(`${date} has no plan "${id}"`);
  if(typeof name !== "string" || !name.trim()) throw new Error("the plan needs a name");
  p.name = name.trim();
  return out;
}

// Removes a plan. With one plan left, the day goes back to plain stops: that plan's,
// with their ticks (marks). Returns {trip, marks}.
export function removePlan(trip, date, id){
  const out = clone(trip);
  const d = dayAt(out, date);
  const i = d.plans ? d.plans.findIndex(x => x.id === id) : -1;
  if(i < 0) throw new Error(`${date} has no plan "${id}"`);
  d.plans.splice(i, 1);
  const marks = [];
  if(d.plans.length === 1){
    const last = d.plans[0];
    for(const s of last.stops) marks.push({date, plan: last.id, from: s.id, to: s.id, toDate: date, toPlan: null});
    d.stops = last.stops;
    delete d.plans;
  }
  return {trip: out, marks};
}

/* ---------- expenses: money spent outside the stops ---------- */

// The trip's expenses stay in date order; one without a date counts as the first day.
const EXPENSE_ORDER = ["id", ...Object.keys(FIELDS.expense)];
function sortExpenses(trip){
  const first = trip.days.length ? trip.days[0].date : "";
  const when = x => x.date || first;
  trip.expenses.sort((a, b) => when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : 0);
}

/** Adds an expense (without an id). Returns {trip, id}. */
export function addExpense(trip, expense){
  const out = clone(trip);
  const list = out.expenses || (out.expenses = []);
  const x = {id: newId(expense.title, new Set(list.map(e => e.id))), ...clean(expense)};
  list.push(orderLike({}, x, EXPENSE_ORDER));
  sortExpenses(out);
  return {trip: out, id: x.id};
}

/** Replaces the expense with this id; its id stays. */
export function updateExpense(trip, id, expense){
  const out = clone(trip);
  const list = out.expenses || [];
  const i = list.findIndex(x => x.id === id);
  if(i < 0) throw new Error(`no expense ${id}`);
  list[i] = orderLike(list[i], {...clean(expense), id}, EXPENSE_ORDER);
  sortExpenses(out);
  return out;
}

/** Removes an expense; the list goes when it is empty. */
export function removeExpense(trip, id){
  const out = clone(trip);
  const list = out.expenses || [];
  const i = list.findIndex(x => x.id === id);
  if(i < 0) throw new Error(`no expense ${id}`);
  list.splice(i, 1);
  if(!list.length) delete out.expenses;
  return out;
}

// Empty fields are left out of the file.
function clean(stop){
  return Object.fromEntries(Object.entries(stop).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

// Keeps the field order the stop had, so a small edit is a small change in the file.
const ORDER = ["id", ...Object.keys(FIELDS.stop)];
const DAY_ORDER = Object.keys(FIELDS.day);
function orderLike(old, next, order = ORDER){
  const keys = [...new Set([...Object.keys(old), ...order, ...Object.keys(next)])].filter(k => k in next);
  return Object.fromEntries(keys.map(k => [k, next[k]]));
}
