// What changed between two versions of a trip, stop by stop: the one place that
// answers it, for the history, the choice when a file is loaded, and merge reports.
// No DOM here.

import { canonical } from "./version.js";

// Same content, whatever the order of the fields.
const same = (a, b) => canonical(a) === canonical(b);

// Every stop of a trip, by "<id>", with where it is.
function stopsOf(trip){
  const out = new Map();
  for(const d of trip.days){
    const lists = d.plans ? d.plans.map(p => [p.id, p.stops]) : [[null, d.stops]];
    for(const [plan, stops] of lists) for(const s of stops) out.set(`${d.date}|${plan || ""}|${s.id}`, {date: d.date, plan, stop: s});
  }
  return out;
}

// The trip without its stops, to tell whether anything else changed.
function rest(trip){
  const {version, ...t} = trip;
  return {...t, days: t.days.map(({stops, plans, ...d}) => ({...d, plans: plans && plans.map(({stops, ...p}) => p)}))};
}

// Fields, grouped by what a traveller would call them.
const GROUPS = {time: "time", title: "title", local: "title", text: "text", travel: "travel", tag: "tag", type: "type",
  booking: "booking", closed: "closed", cost: "cost", currency: "cost", lat: "place", lng: "place", address: "place", link: "place"};

// A day's fields and the trip's, grouped the same way.
const DAY_GROUPS = {notes: "notes", stay: "stay", city: "title", title: "title", plans: "plans"};
const TRIP_GROUPS = {info: "info", expenses: "expenses"};
const changedKeys = (x, y, groups) => [...new Set(Object.keys({...x, ...y}).filter(k => !same(x[k], y[k])).map(k => groups[k] || "other"))];

// What changed besides the stops: each day's (notes, night, name…) and the trip's own.
function others(from, to){
  const {days: da, ...ta} = rest(from), {days: db, ...tb} = rest(to);
  const a = new Map(da.map(d => [d.date, d])), b = new Map(db.map(d => [d.date, d]));
  const days = [];
  for(const [date, y] of b){
    const x = a.get(date);
    const fields = x ? changedKeys(x, y, DAY_GROUPS) : ["added"];
    if(fields.length) days.push({date, fields});
  }
  for(const date of a.keys()) if(!b.has(date)) days.push({date, fields: ["removed"]});
  days.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  return {days, trip: changedKeys(ta, tb, TRIP_GROUPS)};
}

/**
 * @returns {{added: object[], removed: object[], changed: object[], moved: object[], other: boolean, days: object[], trip: string[]}}
 *   added, removed: {date, plan, stop}
 *   changed: {date, plan, stop, fields: ["time", "place", …]}  (the stop as it is in `to`)
 *   moved: {from: {date, plan}, date, plan, stop, fields}      (same stop id, another day or plan)
 *   other: something besides stops changed (days, hotels, info…), told by `days` and `trip`:
 *   days: {date, fields: ["notes", "stay", "title", "plans", "other"], or ["added"], or ["removed"]}
 *   trip: the trip's own fields that changed: "info", "expenses", "other"
 */
export function diffTrips(from, to){
  const a = stopsOf(from), b = stopsOf(to);
  const other = !same(rest(from), rest(to));
  const out = {added: [], removed: [], changed: [], moved: [], other, ...(other ? others(from, to) : {days: [], trip: []})};
  for(const [k, x] of b){
    const y = a.get(k);
    if(!y){ out.added.push(x); continue; }
    if(same(x.stop, y.stop)) continue;
    const keys = new Set([...Object.keys(x.stop), ...Object.keys(y.stop)]);
    const fields = [...new Set([...keys].filter(f => !same(x.stop[f], y.stop[f])).map(f => GROUPS[f] || "other"))];
    out.changed.push({...x, fields});
  }
  for(const [k, y] of a) if(!b.has(k)) out.removed.push(y);
  // A stop that left one list and arrived in another with the same id has moved.
  for(const r of [...out.removed]){
    const i = out.added.findIndex(x => x.stop.id === r.stop.id);
    if(i < 0) continue;
    const [x] = out.added.splice(i, 1);
    out.removed.splice(out.removed.indexOf(r), 1);
    const fields = [...new Set(Object.keys({...x.stop, ...r.stop}).filter(f => !same(x.stop[f], r.stop[f])).map(f => GROUPS[f] || "other"))];
    out.moved.push({...x, from: {date: r.date, plan: r.plan}, fields});
  }
  return out;
}

export const isEmpty = d => !d.added.length && !d.removed.length && !d.changed.length && !d.moved.length && !d.other;

// Counts for a short message: moved stops count as changed.
export const counts = d => ({added: d.added.length, changed: d.changed.length + d.moved.length, removed: d.removed.length});

