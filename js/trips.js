// What happens to a trip when it changes: an edit on this phone, a file received, a
// return to an earlier version. It joins the pieces (js/edit.js, js/version.js,
// js/merge.js, js/diff.js) and keeps every version (js/objects.js). No DOM here.
//
// versions: {put(trip), get(tripId, id), ids(tripId)} — see versionStore in js/objects.js

import { validateTrip, upgrade } from "./trip.js";
import { ensureIds } from "./edit.js";
import { ensureVersion, childOf, commit, commitMerge, relation, commonBase, isIntact } from "./version.js";
import { mergeTrips } from "./merge.js";
import { diffTrips } from "./diff.js";

/**
 * Makes a trip ready for versions: in format 2, with ids, with a version. Files
 * without them get them the same way on every device. `renamed` lists the stops that
 * got an id, so ticks saved under their old key can follow. A file in format 1 keeps
 * its version as the parent of the converted one.
 */
export async function prepare(trip){
  const {trip: withIds, renamed} = ensureIds(upgrade(trip));
  if(!withIds.version) return {trip: await ensureVersion(withIds), renamed};
  // A file edited by hand keeps the version it was made from, but its content changed,
  // so the id no longer matches: it becomes a new version made from the one it names.
  if(await isIntact(withIds)) return {trip: withIds, renamed};
  return {trip: await childOf(withIds, withIds.version), renamed};
}

// Keeps a version after checking it, and returns it.
async function keep(versions, trip){
  const check = validateTrip(trip);
  if(!check.ok) throw new Error(check.errors[0]);
  await versions.put(trip);
  return trip;
}

/** An edit made on this phone: a new version made from the current one. */
export async function saveEdit(versions, current, content){
  const next = await commit(content, current);
  if(next === current) return {trip: current, changed: false};
  await versions.put(current);
  return {trip: await keep(versions, next), changed: true};
}

/**
 * Back to an earlier version, the way git revert does it: a new version, made from the
 * current one, with the old content. Sent to another phone, it is newer than what that
 * phone has, so the change undone does not come back from there.
 */
export async function restore(versions, current, id){
  const old = await versions.get(current.id, id);
  if(!old) throw new Error("version not on this device: " + id);
  return saveEdit(versions, current, old);
}

/**
 * A file received for a trip this phone already has: what it is, and what each choice
 * would give. Nothing changes on the phone yet; apply() does it.
 *   same      the same version
 *   newer     made from this phone's version: take it as it is
 *   older     this phone already has everything in it
 *   diverged  both changed: `merged` is the two joined; `theirs` and `mine` say what
 *             changed on each side since the version they shared (js/diff.js)
 */
export async function inspect(versions, local, incoming){
  const kind = relation(local, incoming);
  await versions.put(local);
  await versions.put(incoming);
  if(kind !== "diverged") return {kind, local, incoming};
  const baseId = commonBase(local, incoming, new Set(await versions.ids(local.id)));
  const base = baseId ? await versions.get(local.id, baseId) : null;
  return {kind, local, incoming, base: !!base, merged: mergeTrips(base, local, incoming),
    theirs: diffTrips(base || local, incoming), mine: diffTrips(base || incoming, local)};
}

/**
 * Carries out a choice on what inspect() found, and returns the trip to keep.
 *   "merge"   the two joined, as a version with both as parents
 *   "theirs"  the file's content, as a version with both as parents (git merge -s theirs):
 *             what this phone drops cannot come back from an old copy of it
 *   "take"    a newer file, as it is
 *   "back"    an older file's content, as a new version made from this phone's one
 *   anything else keeps this phone's version
 */
export async function apply(versions, x, choice){
  if(choice === "merge" && x.kind === "diverged") return keep(versions, await commitMerge(x.merged, x.local, x.incoming));
  if(choice === "theirs" && x.kind === "diverged") return keep(versions, await commitMerge(x.incoming, x.local, x.incoming));
  if(choice === "take" && x.kind === "newer") return x.incoming;
  if(choice === "back" && x.kind === "older") return (await saveEdit(versions, x.local, x.incoming)).trip;
  return x.local;
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
