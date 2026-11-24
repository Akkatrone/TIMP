// Alternatives for one moment of a day: a meal at one of three places, one museum or
// another. They are stops like the others (an id, a map, ticks, edits, joins), in the same
// list, with the same `choice`: the name of their group ("Lunch"), shown above it. The
// option the trip goes to has `chosen: true`; none: still to choose. The options not
// chosen stay in the trip, quieter: for whoever uses it as a base, and to look back.
//
// A group needs two options: a `choice` alone is a plain stop. Two options chosen (two
// phones chose apart, and the join kept both): the first by time, then by title, the
// same on every phone, until the next choice settles it. No DOM here.

import { minutesOf } from "./parts.js";
import { clockMinutes } from "./edit.js";

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
/** The group a stop is an option of, or null. */
export const groupOf = s => isObj(s) && typeof s.choice === "string" && s.choice.trim() ? s.choice.trim() : null;

/** The groups of a list, by name, their options in the list's order (two or more). */
export function groupsIn(stops){
  const all = new Map();
  for(const s of stops || []){
    const g = groupOf(s);
    if(!g) continue;
    if(!all.has(g)) all.set(g, []);
    all.get(g).push(s);
  }
  for(const [g, xs] of all) if(xs.length < 2) all.delete(g);
  return all;
}

const when = s => { const c = minutesOf(s.time); return c === null ? 1e9 : c; };

/** The option a group goes to, or null when it is still to choose. */
export function chosenIn(options){
  const xs = options.filter(s => s.chosen === true);
  if(!xs.length) return null;
  return xs.sort((a, b) => when(a) - when(b) || String(a.title).localeCompare(String(b.title)) || (String(a.id) < String(b.id) ? -1 : 1))[0];
}

/**
 * The stops the day goes through, in order: every stop outside a group, and the chosen
 * option of each group. The numbers, the route, the map, what the day costs and the
 * next stop follow these. The same objects as in the list.
 */
export function programOf(stops){
  const groups = groupsIn(stops), keep = new Set();
  for(const xs of groups.values()){ const c = chosenIn(xs); if(c) keep.add(c); }
  return (stops || []).filter(s => !groups.has(groupOf(s)) || keep.has(s));
}

/** The plan a day goes with: the one chosen in the trip, or the first. */
export function chosenPlan(day){
  if(!day.plans || !day.plans.length) return null;
  return day.plans.find(p => p.chosen === true) || day.plans[0];
}

/**
 * A name for a new group, from the stop it starts from: a meal at lunch or dinner time,
 * else "Alternatives". `names`: {lunch, dinner, other} in the app's language; never one
 * the list has already (a number after it).
 */
export function groupName(stop, names, stops){
  const c = minutesOf(stop.time);
  const base = stop.type === "food" && c !== null && c >= 11 * 60 && c < 16 * 60 ? names.lunch
    : stop.type === "food" && c !== null && c >= 18 * 60 ? names.dinner : names.other;
  const taken = new Set((stops || []).map(groupOf).filter(Boolean));
  let name = base, n = 2;
  while(taken.has(name)) name = `${base} ${n++}`;
  return name;
}

/* ---------- changes: each returns a new list, the one given untouched ---------- */

const without = (s, ...keys) => Object.fromEntries(Object.entries(s).filter(([k]) => !keys.includes(k)));

/** The option `id` chosen in its group, the others not. */
export function choose(stops, id){
  const s = stops.find(x => x.id === id), g = groupOf(s);
  if(!g) throw new Error(`no option ${id}`);
  return stops.map(x => x.id === id ? {...x, chosen: true} : groupOf(x) === g && x.chosen !== undefined ? without(x, "chosen") : x);
}

/**
 * Groups left with one option are plain stops again: without `choice` and `chosen`. After
 * a stop is removed or moved away; never in a join (a join changes nothing on its own).
 */
export function tidyGroups(stops){
  const counts = new Map();
  for(const s of stops) if(groupOf(s)) counts.set(groupOf(s), (counts.get(groupOf(s)) || 0) + 1);
  return stops.map(s => groupOf(s) && counts.get(groupOf(s)) < 2 ? without(s, "choice", "chosen") : s);
}

/** The stop `id` as the first option of a new group `name`, chosen: before an alternative is added to it. */
export function startGroup(stops, id, name){
  return stops.map(x => x.id === id ? {...x, choice: name, chosen: true} : x);
}

/**
 * The stops as I see them: in a group where I chose another option only for me (`mine`,
 * a set of stop ids: js/private.js), mine is the one chosen, marked `mine`, and the
 * group's is marked `theirs`. The trip's own stops are never changed.
 */
export function withMine(stops, mine){
  const pick = new Map();
  if(mine.size) for(const [g, xs] of groupsIn(stops)){
    const m = xs.find(x => mine.has(x.id)), theirs = chosenIn(xs);
    if(m && m !== theirs) pick.set(g, {m, theirs});
  }
  if(!pick.size) return stops;
  return stops.map(s => {
    const p = pick.get(groupOf(s));
    if(!p) return s;
    if(s === p.m) return {...s, chosen: true, mine: true};
    return s.chosen === true ? {...without(s, "chosen"), ...(s === p.theirs ? {theirs: true} : {})} : s;
  });
}
