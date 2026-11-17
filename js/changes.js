// Changes to a trip written by an AI assistant: instead of the whole file again, a
// short list of what to add, change, move or remove. The assistant gets an outline of
// the trip (outline), answers with a changes file, and the app applies it as one new
// version (applyChanges). Far fewer tokens both ways, and nothing else of the trip can
// be lost by accident. No DOM here.
//
//   {"format": "travel-in-my-pocket/changes", "trip": "<trip id>", "changes": [
//     {"add":    {"day": "2027-04-10", "plan": "<plan id, on days with plans>", "stop": {…a stop…}}},
//     {"update": {"day": "2027-04-10", "stop": "<stop id>", "set": {"time": "10:00", "tag": null},
//                 "to": {"day": "2027-04-11"}}},
//     {"remove": {"day": "2027-04-10", "stop": "<stop id>"}},
//     {"setDay": {"day": "2027-04-10", "set": {"title": "…", "city": "…", "stay": …, "notes": […]}}},
//     {"addDay": {…a day…}},
//     {"removeDay": {"day": "2027-04-12"}},
//     {"addPlan": {"day": "2027-04-11", "plan": {"name": "If it rains", "stops": […]}, "first": "Sunny"}},
//     {"setPlan": {"day": "2027-04-11", "plan": "<plan id>", "set": {"name": "…"}}},
//     {"removePlan": {"day": "2027-04-11", "plan": "<plan id>"}}
//   ]}
//
// In "set", null removes a field. A stop goes in time order. A day without plans that
// gets one has two: its stops become the first, named by "first"; a day left with one
// plan goes back to plain stops. Everything is checked against FIELDS once applied,
// like any trip file.

import { FIELDS, FORMAT, validateTrip } from "./trip.js";
import { addStop, updateStop, removeStop, ensureIds, addPlan, renamePlan, removePlan } from "./edit.js";

export const CHANGES = "travel-in-my-pocket/changes";

const KINDS = "add, update, remove, setDay, addDay, removeDay, addPlan, setPlan or removePlan";
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = v => JSON.parse(JSON.stringify(v));

/** Whether a parsed file is a list of changes rather than a whole trip. */
export const isChanges = data => isObj(data) && data.format === CHANGES;

/**
 * The trip in a few lines per day, for an assistant asked to change it: dates, cities,
 * titles, and each stop's id, time, title, kind and way of travelling. Descriptions and
 * positions stay out: the assistant does not need them to say what to change.
 */
export function outline(trip){
  const stop = s => {
    const extra = [s.type, s.travel && "by " + s.travel, s.lat === undefined && "no position"].filter(Boolean);
    return `[${s.id}] ${s.time ? s.time + " " : ""}${s.title}${extra.length ? " (" + extra.join(", ") + ")" : ""}`;
  };
  const stay = d => !d.stay ? "" : ` · night: ${typeof d.stay === "string" ? d.stay : d.stay.name}`;
  const n = trip.days.length;
  const lines = [`Trip "${trip.title}", id ${trip.id}, ${n} day${n === 1 ? "" : "s"}.`];
  for(const d of trip.days){
    lines.push("", `${d.date}${d.city ? " · " + d.city : ""}${d.title ? " · " + d.title : ""}${stay(d)}`);
    for(const n of d.notes || []) lines.push(`  note: ${n}`);
    if(d.plans) for(const p of d.plans){ lines.push(`  plan [${p.id}] ${p.name}:`); p.stops.forEach(s => lines.push("    " + stop(s))); }
    else d.stops.forEach(s => lines.push("  " + stop(s)));
  }
  return lines.join("\n");
}

/** How to write a changes file, for an assistant: the counterpart of formatBrief. */
export function changesBrief(){
  const stopFields = Object.keys(FIELDS.stop).filter(n => !FIELDS.stop[n].byApp).join(", ");
  return [
    `To change an existing trip, answer with ONE JSON object in one code block, format "${CHANGES}", listing only what changes:`,
    "",
    `{"format": "${CHANGES}", "trip": "<the trip id>", "changes": [ … ]}`,
    "",
    "Each change is one of:",
    `  {"add": {"day": "YYYY-MM-DD", "stop": {…}}}             a new stop (fields: ${stopFields}); it goes in time order`,
    `  {"update": {"day": "YYYY-MM-DD", "stop": "<id>", "set": {…}}}  changed fields of a stop; null removes a field`,
    `  {"update": {"day": …, "stop": "<id>", "to": {"day": "YYYY-MM-DD"}}}  moves the stop to another day (set may go with it)`,
    `  {"remove": {"day": "YYYY-MM-DD", "stop": "<id>"}}`,
    `  {"setDay": {"day": "YYYY-MM-DD", "set": {…}}}             a day's city, title, stay or notes`,
    `  {"addDay": {…a whole day, as in a trip file…}}`,
    `  {"removeDay": {"day": "YYYY-MM-DD"}}`,
    `  {"addPlan": {"day": "YYYY-MM-DD", "plan": {"name": "…", "stops": [{…}, …]}, "first": "…"}}  an alternative plan for the day (a rainy day, a lazy morning); the traveller picks one. On a day without plans, "first" names the plan made of the stops it has now`,
    `  {"setPlan": {"day": "YYYY-MM-DD", "plan": "<plan id>", "set": {"name": "…"}}}  renames a plan`,
    `  {"removePlan": {"day": "YYYY-MM-DD", "plan": "<plan id>"}}  with one plan left, the day has plain stops again`,
    "",
    `On days with plans, add "plan": "<plan id>" next to "day". Use the ids in square brackets from the outline. Give lat and lng for new places when you know them.`
  ].join("\n");
}

/**
 * Applies a changes file to a trip.
 * @returns {{ok: true, trip: object, moves: object[], counts: {added, changed, removed}} | {ok: false, errors: string[]}}
 *   moves: for ticks to follow moved stops (see moveMarks in js/trips.js).
 */
export function applyChanges(trip, data){
  const errors = [];
  if(!isChanges(data)) return {ok: false, errors: [`format: must be "${CHANGES}"`]};
  if(data.trip !== undefined && data.trip !== trip.id) return {ok: false, errors: [`trip: these changes are for "${data.trip}", the open trip is "${trip.id}"`]};
  if(!Array.isArray(data.changes) || !data.changes.length) return {ok: false, errors: ["changes: must be a non-empty list"]};

  let out = clone(trip);
  const moves = [], counts = {added: 0, changed: 0, removed: 0};
  const dayOf = date => out.days.find(d => d.date === date);
  const stopIn = (date, plan, id) => {
    const d = dayOf(date);
    if(!d) throw new Error(`there is no day ${date}`);
    if(d.plans && plan !== undefined && !d.plans.some(p => p.id === plan)) throw new Error(`${date} has no plan "${plan}"`);
    const list = d.plans ? d.plans.find(p => p.id === (plan || d.plans[0].id)).stops : d.stops;
    if(id !== undefined && !list.some(s => s.id === id)) throw new Error(`there is no stop "${id}" on ${date}${plan ? ` in plan "${plan}"` : ""}`);
    return list;
  };
  const withSet = (obj, set) => {
    if(!isObj(set)) throw new Error(`"set" must be an object`);
    const next = {...obj};
    for(const [k, v] of Object.entries(set)) if(v === null) delete next[k]; else next[k] = v;
    return next;
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
        out = addStop(out, {date: x.day, plan: x.plan || null}, stop).trip;
        counts.added++;
      }else if(kind === "update"){
        const list = stopIn(x.day, x.plan, x.stop);
        const old = list.find(s => s.id === x.stop);
        const to = x.to === undefined ? null : x.to;
        if(to !== null) stopIn(to.day, to.plan);
        const ref = {date: x.day, plan: x.plan || null, id: x.stop};
        const dest = to ? {date: to.day, plan: to.plan || null} : ref;
        const res = updateStop(out, ref, x.set === undefined ? old : withSet(old, x.set), dest);
        out = res.trip;
        if(to) moves.push({date: ref.date, plan: ref.plan, from: ref.id, to: res.ref.id, toDate: dest.date, toPlan: dest.plan});
        counts.changed++;
      }else if(kind === "remove"){
        stopIn(x.day, x.plan, x.stop);
        out = removeStop(out, {date: x.day, plan: x.plan || null, id: x.stop});
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
      }else{
        throw new Error(`"${kind}" is not a change: use ${KINDS}`);
      }
    }catch(e){
      errors.push(`${path}: ${e.message}`);
    }
  });
  if(errors.length) return {ok: false, errors};
  out = ensureIds(out).trip;   // stops of a new day get their ids
  // The result is checked like any trip file.
  const check = validateTrip({...out, format: FORMAT});
  if(!check.ok) return {ok: false, errors: check.errors.map(e => "after the changes, " + e)};
  return {ok: true, trip: out, moves, counts};
}
