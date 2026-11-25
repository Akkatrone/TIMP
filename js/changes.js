// Changes to a trip written by an AI assistant: instead of the whole file again, a
// short list of what to add, change, move or remove. The assistant gets an outline of
// the trip (outline), answers with a changes file, and the app applies it as one new
// version (applyChanges). Far fewer tokens both ways, and nothing else of the trip can
// be lost by accident. No DOM here.
//
//   {"format": "travel-in-my-pocket/changes", "trip": "<trip id>", "from": "<version id>", "changes": [
//     {"add":    {"day": "2027-04-10", "plan": "<plan id, on days with plans>", "stop": {…a stop…}}},
//     {"update": {"day": "2027-04-10", "stop": "<stop id>", "set": {"time": "10:00", "tag": null},
//                 "to": {"day": "2027-04-11"}}},
//     {"remove": {"day": "2027-04-10", "stop": "<stop id>"}},
//     {"setDay": {"day": "2027-04-10", "set": {"title": "…", "city": "…", "stay": …, "notes": […]}}},
//     {"addDay": {…a day…}},
//     {"removeDay": {"day": "2027-04-12"}},
//     {"addPlan": {"day": "2027-04-11", "plan": {"name": "If it rains", "stops": […]}, "first": "Sunny"}},
//     {"setPlan": {"day": "2027-04-11", "plan": "<plan id>", "set": {"name": "…"}}},
//     {"removePlan": {"day": "2027-04-11", "plan": "<plan id>"}},
//     {"setTrip": {"set": {"currency": "JPY"}}},
//     {"addExpense": {"expense": {"title": "Flights", "date": "2027-02-01", "cost": 640, "currency": "EUR"}}},
//     {"setExpense": {"expense": "<expense id>", "set": {"cost": 610}}},
//     {"removeExpense": {"expense": "<expense id>"}},
//     {"addExpense": {"private": true, "expense": {"title": "Souvenirs", "cost": 3000, "date": "2027-04-10", "stop": "<stop id>"}}}
//   ]}
//
// In "set", null removes a field. A stop goes in time order. A day without plans that
// gets one has two: its stops become the first, named by "first"; a day left with one
// plan goes back to plain stops. "from" is the version the outline showed: when the
// trip has changed since, the app applies the changes to that version and joins the
// result with what changed after (js/trips.js joinChanges). "private": true on an
// expense change is for the traveller's private expenses (js/private.js): they change
// on this phone, outside the trip's versions. Everything is checked against FIELDS once
// applied, like any trip file.

import { FIELDS, FORMAT, validateTrip } from "./trip.js";
import { addStop, updateStop, removeStop, ensureIds, addPlan, renamePlan, removePlan, addExpense, updateExpense, removeExpense } from "./edit.js";
import { withPrivate, addPrivate, updatePrivate, removePrivate, followStops, unlinkStop } from "./private.js";
import { findStopId } from "./ids.js";
import { groupOf, groupsIn, choose, tidyGroups } from "./choices.js";

export const CHANGES = "travel-in-my-pocket/changes";

const KINDS = "add, update, remove, setDay, addDay, removeDay, addPlan, setPlan, removePlan, setTrip, addExpense, setExpense or removeExpense";
// What setTrip may change: the rest has its own changes, or is the app's.
const TRIP_SET = Object.keys(FIELDS.trip).filter(k => !FIELDS.trip[k].byApp && !["format", "days", "expenses", "googleMapsKey"].includes(k));
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));

// The stop `ref` chosen: the other options of its group not (an assistant that chooses
// one says only that one).
function chosenAlone(trip, ref){
  const d = trip.days.find(x => x.date === ref.date), l = d.plans ? d.plans.find(p => p.id === (ref.plan || d.plans[0].id)) : d;
  const s = l.stops.find(x => x.id === ref.id);
  if(!s || s.chosen !== true || !groupOf(s)) return trip;
  l.stops = choose(l.stops, s.id);
  return trip;
}

/** Whether a parsed file is a list of changes rather than a whole trip. */
export const isChanges = data => isObj(data) && data.format === CHANGES;

/**
 * The trip in a few lines per day, for an assistant asked to change it: dates, cities,
 * titles, and each stop's id, time, title, kind, way of travelling and cost; then the
 * expenses, and the traveller's private ones when `priv` has any. Descriptions and
 * positions stay out: the assistant does not need them to say what to change.
 */
export function outline(trip, priv = null){
  const stop = (s, list) => {
    const g = groupOf(s), inGroup = g && groupsIn(list).has(g);
    const extra = [s.type, inGroup && `${g}: ${s.chosen === true ? "chosen" : "option"}`, s.travel && "by " + s.travel, s.booking && "booking " + s.booking, s.closed && "closed " + s.closed.join(" "),
      s.cost !== undefined && `cost ${s.cost}${s.currency ? " " + s.currency : ""}`, s.lat === undefined && "no position"].filter(Boolean);
    return `[${s.id}] ${s.time ? s.time + " " : ""}${s.title}${extra.length ? " (" + extra.join(", ") + ")" : ""}`;
  };
  const stay = d => !d.stay ? "" : ` · night: ${typeof d.stay === "string" ? d.stay : d.stay.name}`;
  const n = trip.days.length;
  const lines = [`Trip "${trip.title}", id ${trip.id}${trip.version ? `, version ${trip.version.id}` : ""}, ${n} day${n === 1 ? "" : "s"}${trip.currency ? `, costs in ${trip.currency}` : ""}.`];
  for(const d of trip.days){
    lines.push("", `${d.date}${d.city ? " · " + d.city : ""}${d.title ? " · " + d.title : ""}${stay(d)}`);
    for(const n of d.notes || []) lines.push(`  note: ${n}`);
    if(d.plans) for(const p of d.plans){ lines.push(`  plan [${p.id}] ${p.name}${p.chosen === true ? " (chosen)" : ""}:`); p.stops.forEach(s => lines.push("    " + stop(s, p.stops))); }
    else d.stops.forEach(s => lines.push("  " + stop(s, d.stops)));
  }
  if(trip.expenses && trip.expenses.length){
    lines.push("", "Expenses outside the stops:");
    for(const x of trip.expenses) lines.push(`  [${x.id}] ${x.date ? x.date + " " : ""}${x.title}: ${x.cost}${x.currency ? " " + x.currency : ""}`);
  }
  if(priv && priv.expenses.length){
    lines.push("", "Private expenses (the traveller's own, not shared with the trip):");
    for(const x of priv.expenses) lines.push(`  [${x.id}] ${x.date ? x.date + " " : ""}${x.title}: ${x.cost}${x.currency ? " " + x.currency : ""}${x.stop ? ` (at [${x.stop}])` : ""}`);
  }
  return lines.join("\n");
}

/** How to write a changes file, for an assistant: the counterpart of formatBrief. */
export function changesBrief(){
  const stopFields = Object.keys(FIELDS.stop).filter(n => !FIELDS.stop[n].byApp).join(", ");
  return [
    `To change an existing trip, answer with ONE JSON object in one code block, minified on a single line, format "${CHANGES}", listing only what changes:`,
    "",
    `{"format": "${CHANGES}", "trip": "<the trip id>", "from": "<the version in the outline>", "changes": [ … ]}`,
    "",
    `"from" lets the app apply the changes to the trip as you saw it, and join them with what changed on the phone since.`,
    "",
    "Each change is one of:",
    `  {"add": {"day": "YYYY-MM-DD", "stop": {…}}}             a new stop (fields: ${stopFields}); it goes in time order`,
    `  {"update": {"day": "YYYY-MM-DD", "stop": "<id>", "set": {…}}}  changed fields of a stop; null removes a field`,
    `  {"update": {"day": …, "stop": "<id>", "to": {"day": "YYYY-MM-DD"}}}  moves the stop to another day (set may go with it)`,
    `  {"remove": {"day": "YYYY-MM-DD", "stop": "<id>"}}`,
    `  {"setDay": {"day": "YYYY-MM-DD", "set": {…}}}             a day's city, title, stay or notes ("notes": the whole list, as it should be)`,
    `  {"addDay": {…a whole day, as in a trip file…}}`,
    `  {"removeDay": {"day": "YYYY-MM-DD"}}`,
    `  {"addPlan": {"day": "YYYY-MM-DD", "plan": {"name": "…", "stops": [{…}, …]}, "first": "…"}}  an alternative plan for the day (a rainy day, a lazy morning); the traveller picks one. On a day without plans, "first" names the plan made of the stops it has now`,
    `  {"setPlan": {"day": "YYYY-MM-DD", "plan": "<plan id>", "set": {"name": "…"}}}  renames a plan`,
    `  {"removePlan": {"day": "YYYY-MM-DD", "plan": "<plan id>"}}  with one plan left, the day has plain stops again`,
    `  {"setTrip": {"set": {…}}}  the trip's ${TRIP_SET.join(", ")}`,
    `  {"addExpense": {"expense": {"title": "…", "cost": 0, "currency": "EUR", "date": "YYYY-MM-DD"}}}  money spent outside the stops (flights, hotels)`,
    `  {"setExpense": {"expense": "<id>", "set": {…}}}  /  {"removeExpense": {"expense": "<id>"}}`,
    `  "private": true next to "expense", in these three: the traveller's private expenses (shopping, a meal alone), not shared with the trip. A private one paid at a stop has "stop": "<stop id>" and that day as "date"`,
    "",
    `Options for one moment (a meal): stops with the same "choice" ("Lunch"), 2 to 4; "chosen": true on the one the day goes to (the others lose it). Plans only when the whole day changes.`,
    "",
    `On days with plans, add "plan": "<plan id>" next to "day". Use the ids in square brackets from the outline, copied exactly; new stops have none. Give lat and lng for new places when you know them. A cost is what the traveller pays (their share of what is split), in the trip's currency unless the stop says another; write only prices you know.`
  ].join("\n");
}

/**
 * Applies a changes file to a trip, and to its private expenses.
 * @param priv   the private expenses on this phone, or null
 * @param owner  this phone's owner code, for the first private expense
 * @returns {{ok: true, trip: object, priv: object|null, moves: object[], counts: {added, changed, removed}} | {ok: false, errors: string[]}}
 *   moves: for ticks to follow moved stops (see moveMarks in js/trips.js).
 */
export function applyChanges(trip, data, priv = null, owner = ""){
  const errors = [];
  if(!isChanges(data)) return {ok: false, errors: [`format: must be "${CHANGES}"`]};
  if(data.trip !== undefined && data.trip !== trip.id) return {ok: false, errors: [`trip: these changes are for "${data.trip}", the open trip is "${trip.id}"`]};
  if(!Array.isArray(data.changes) || !data.changes.length) return {ok: false, errors: ["changes: must be a non-empty list"]};
  if(data.from !== undefined && !/^[0-9a-f]{16}$/.test(data.from)) return {ok: false, errors: ["from: must be the version named in the outline, 16 characters from 0-9 and a-f"]};

  // A trip whose stops still have ids of before gets their own first (js/ids.js): ticks
  // and private expenses follow (moves); an outline from before still names them.
  const ready = ensureIds(trip);
  let out = ready.trip, mine = followStops(priv, ready.renamed);
  const moves = [...ready.renamed], counts = {added: 0, changed: 0, removed: 0};
  const dayOf = date => out.days.find(d => d.date === date);
  // The list of a day (and plan); with `id`, the id of the stop it names there, as it is
  // now (an id of before from an old outline: the one it became).
  const stopIn = (date, plan, id) => {
    const d = dayOf(date);
    if(!d) throw new Error(`there is no day ${date}`);
    if(d.plans && plan !== undefined && !d.plans.some(p => p.id === plan)) throw new Error(`${date} has no plan "${plan}"`);
    const p = d.plans ? d.plans.find(x => x.id === (plan || d.plans[0].id)) : null;
    const list = p ? p.stops : d.stops;
    if(id === undefined) return list;
    const found = findStopId(out, date, p ? p.id : null, list, id);
    if(found === undefined) throw new Error(`there is no stop "${id}" on ${date}${plan ? ` in plan "${plan}"` : ""}`);
    return found;
  };
  const withSet = (obj, set) => {
    if(!isObj(set)) throw new Error(`"set" must be an object`);
    const next = {...obj};
    for(const [k, v] of Object.entries(set)) if(v === null) delete next[k]; else next[k] = v;
    return next;
  };

  // The expense a change names, among the trip's or the private ones.
  const expenseOf = x => {
    const list = x.private ? (mine ? mine.expenses : []) : (out.expenses || []);
    const found = list.find(e => e.id === x.expense);
    if(!found) throw new Error(`there is no ${x.private ? "private " : ""}expense "${x.expense}"`);
    return found;
  };
  // A private expense paid at a stop names a stop of that day: the expense with its id
  // as it is now.
  const atStop = e => {
    if(e.stop === undefined) return e;
    const d = dayOf(e.date);
    const lists = !d ? [] : d.plans ? d.plans.map(p => [p.id, p.stops]) : [[null, d.stops]];
    for(const [plan, l] of lists){ const id = findStopId(out, e.date, plan, l, e.stop); if(id !== undefined) return {...e, stop: id}; }
    throw new Error(`there is no stop "${e.stop}" on ${e.date === undefined ? "the day in \"date\"" : e.date}`);
  };

  data.changes.forEach((c, i) => {
    const path = `changes[${i}]`;
    try{
      if(!isObj(c) || Object.keys(c).length !== 1) throw new Error(`must be one of ${KINDS}`);
      const [kind, x] = Object.entries(c)[0];
      if(!isObj(x)) throw new Error(`"${kind}" must be an object`);
      if(kind === "add"){
        stopIn(x.day, x.plan);
        if(!isObj(x.stop)) throw new Error(`"stop" must be an object`);
        const {id, ...stop} = x.stop;
        const added = addStop(out, {date: x.day, plan: x.plan || null}, stop);
        out = chosenAlone(added.trip, added.ref);
        counts.added++;
      }else if(kind === "update"){
        const id = stopIn(x.day, x.plan, x.stop);
        const old = stopIn(x.day, x.plan).find(s => s.id === id);
        const to = x.to === undefined ? null : x.to;
        if(to !== null) stopIn(to.day, to.plan);
        const ref = {date: x.day, plan: x.plan || null, id};
        const dest = to ? {date: to.day, plan: to.plan || null} : ref;
        const res = updateStop(out, ref, x.set === undefined ? old : withSet(old, x.set), dest);
        out = chosenAlone(res.trip, res.ref);
        if(to) moves.push({date: ref.date, plan: ref.plan, from: ref.id, to: res.ref.id, toDate: dest.date, toPlan: dest.plan});
        counts.changed++;
      }else if(kind === "remove"){
        const id = stopIn(x.day, x.plan, x.stop);
        out = removeStop(out, {date: x.day, plan: x.plan || null, id});
        mine = unlinkStop(mine, x.day, id);
        counts.removed++;
      }else if(kind === "setDay"){
        const d = dayOf(x.day);
        if(!d) throw new Error(`there is no day ${x.day}`);
        const forbidden = Object.keys(x.set || {}).filter(k => k === "date" || k === "stops" || k === "plans");
        if(forbidden.length) throw new Error(`"set" cannot change ${forbidden.join(", ")}: change the stops one by one`);
        out.days[out.days.indexOf(d)] = withSet(d, x.set);
        counts.changed++;
      }else if(kind === "addDay"){
        if(dayOf(x.date)) throw new Error(`there is already a day ${x.date}`);
        out.days.push(clone(x));
        out.days.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
        counts.added++;
      }else if(kind === "removeDay"){
        const d = dayOf(x.day);
        if(!d) throw new Error(`there is no day ${x.day}`);
        out.days.splice(out.days.indexOf(d), 1);
        counts.removed++;
      }else if(kind === "addPlan"){
        if(!isObj(x.plan)) throw new Error(`"plan" must be an object with name and stops`);
        const res = addPlan(out, x.day, x.plan, x.first);
        out = res.trip;
        moves.push(...res.marks);
        counts.added++;
      }else if(kind === "setPlan"){
        const other = Object.keys(x.set || {}).filter(k => k !== "name");
        if(!isObj(x.set) || other.length) throw new Error(`"set" can change only the name of a plan: change its stops one by one`);
        out = renamePlan(out, x.day, x.plan, x.set.name);
        counts.changed++;
      }else if(kind === "removePlan"){
        const res = removePlan(out, x.day, x.plan);
        out = res.trip;
        moves.push(...res.marks);
        counts.removed++;
      }else if(kind === "setTrip"){
        const other = Object.keys(x.set || {}).filter(k => !TRIP_SET.includes(k));
        if(!isObj(x.set) || other.length) throw new Error(`"set" can change only ${TRIP_SET.join(", ")} of the trip`);
        out = withSet(out, x.set);
        counts.changed++;
      }else if(kind === "addExpense"){
        if(!isObj(x.expense)) throw new Error(`"expense" must be an object`);
        const {id, ...expense} = x.expense;
        if(x.private) mine = addPrivate(mine, out, owner, atStop(expense)).priv;
        else out = addExpense(out, expense).trip;
        counts.added++;
      }else if(kind === "setExpense"){
        const old = expenseOf(x);
        const next = withSet(old, x.set);
        if(x.private) mine = updatePrivate(mine, out, old.id, atStop(next));
        else out = updateExpense(out, old.id, next);
        counts.changed++;
      }else if(kind === "removeExpense"){
        expenseOf(x);
        if(x.private) mine = removePrivate(mine, out, x.expense);
        else out = removeExpense(out, x.expense);
        counts.removed++;
      }else{
        throw new Error(`"${kind}" is not a change: use ${KINDS}`);
      }
    }catch(e){
      errors.push(`${path}: ${e.message}`);
    }
  });
  if(errors.length) return {ok: false, errors};
  // Stops of a new day or plan get their ids; one copied with its id gets its own. A
  // choice left on one stop alone is a plain stop.
  out = ensureIds(out, ready.trip).trip;
  for(const d of out.days) for(const l of d.plans || [d]) l.stops = tidyGroups(l.stops);
  mine = followStops(mine, moves);
  if(mine && !mine.expenses.length) mine = null;
  // The result is checked like any trip file.
  const check = validateTrip({...withPrivate(out, mine), format: FORMAT});
  if(!check.ok) return {ok: false, errors: check.errors.map(e => "after the changes, " + e)};
  return {ok: true, trip: out, priv: mine, moves, counts};
}
