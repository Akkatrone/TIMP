// What happens to a trip when it changes: an edit on this phone, or a file received.
// It joins the pieces (js/edit.js, js/version.js, js/merge.js) and keeps every version
// in the store, so a later merge can find the base. No DOM here: the store is passed
// in, and the tests pass one that lives in memory.
//
// store: {putVersion(trip), getVersion(tripId, id), versionIds(tripId)}

import { validateTrip } from "./trip.js";
import { ensureIds } from "./edit.js";
import { ensureVersion, childOf, commit, commitMerge, relation, commonBase, isIntact } from "./version.js";
import { mergeTrips } from "./merge.js";

/**
 * Makes a trip ready for versions: every stop with an id, a version on the trip.
 * Files without them get both the same way on every device. `renamed` lists the
 * stops that got an id, so ticks saved under their old key can follow.
 */
export async function prepare(trip){
  const {trip: withIds, renamed} = ensureIds(trip);
  if(!withIds.version) return {trip: await ensureVersion(withIds), renamed};
  // A file edited by hand keeps the version it was made from, but its content changed,
  // so the id no longer matches: it becomes a new version made from the one it names.
  if(await isIntact(withIds)) return {trip: withIds, renamed};
  return {trip: await childOf(withIds, withIds.version), renamed};
}

/** An edit made on this phone: a new version made from the current one. */
export async function saveEdit(store, current, content){
  const next = await commit(content, current);
  if(next === current) return {trip: current, changed: false};
  const check = validateTrip(next);
  if(!check.ok) throw new Error(check.errors[0]);
  await store.putVersion(current);
  await store.putVersion(next);
  return {trip: next, changed: true};
}

/**
 * A file received for a trip this phone already has.
 * @returns {Promise<{kind: "same"|"newer"|"older"|"merged", trip: object, report?: object}>}
 *   newer:  the file was made from this phone's version; it replaces it
 *   older:  this phone already has everything in it; nothing changes
 *   merged: both changed; the result is a new version joining the two
 */
export async function receive(store, local, incoming){
  const kind = relation(local, incoming);
  await store.putVersion(local);
  await store.putVersion(incoming);
  if(kind === "same" || kind === "older") return {kind, trip: local};
  if(kind === "newer") return {kind, trip: incoming};

  const known = new Set(await store.versionIds(local.id));
  const baseId = commonBase(local, incoming, known);
  const base = baseId ? await store.getVersion(local.id, baseId) : null;
  const {trip: content, report} = mergeTrips(base, local, incoming);
  const merged = await commitMerge(content, local, incoming);
  const check = validateTrip(merged);
  if(!check.ok) throw new Error(check.errors[0]);
  await store.putVersion(merged);
  return {kind: "merged", trip: merged, report, base: !!base};
}

/**
 * Ticks and skips are saved under "date|plan|stop id". When stops get an id, or move
 * to another day or plan, their saved marks move with them.
 * moves: [{date, plan, from, to, toDate?, toPlan?}]
 */
export function moveMarks(state, moves){
  const out = {done: {...state.done}, skipped: {...state.skipped}, plans: {...state.plans}};
  for(const m of moves){
    const from = `${m.date}|${m.plan || ""}|${m.from}`;
    const to = `${m.toDate || m.date}|${(m.toDate ? m.toPlan : m.plan) || ""}|${m.to}`;
    if(from === to) continue;
    for(const set of [out.done, out.skipped]){
      if(set[from]){ set[to] = set[from]; delete set[from]; }
    }
  }
  return out;
}

/** The name of the file to save: the trip's id and the version's short id. */
export function fileName(trip){
  return `${trip.id}-${String(trip.version.id).slice(0, 7)}.json`;
}

/** The trip as a file: readable JSON, the version near the top. */
export function fileText(trip){
  return JSON.stringify(trip, null, 1) + "\n";
}
