// A trip and the sharing service, until they agree: the same rules as two files
// (js/trips.js, inspect and apply), with the service as the other phone. No DOM here.
//
// A record that is on the service carries `share`: {id, role, head, privRev, privBase}.
//   id        the service's id of the trip
//   role      owner, edit or read: a trip read-only for this user is never sent
//   head      the version both had at the last sync
//   privRev, privBase  the revision of the private expenses, and the set, at the last sync
//   groupSent  my choices as last shown to the group ("Where I go"), canonical
//   groupPending  my ticks and skips for the group not sent yet: {done, skipped} key → bool
// and `group`: what the service answered of the trip's group (js/share-api.js, "group").
//
// api: {create(trip), push(id, trip), version(id, versionId), getPrivate(id), putPrivate(id, data, rev),
//   getGroup(id), putGroup(id, where, ticks), markGroup(id, done, skipped)}
// (js/share.js gives it, on the routes of js/share-api.js).

import { inspect, apply } from "./trips.js";
import { mergePrivate } from "./private.js";
import { canonical } from "./version.js";

/**
 * One trip: what the service has that this phone lacks comes here (taken, or joined),
 * what this phone has goes there. `remote` is the trip in the service's list, or null.
 * @returns the record as it is now (the same object when nothing changed)
 */
export async function syncTrip(versions, rec, remote, api){
  let trip = rec.trip;
  const share = rec.share ? {...rec.share} : {role: "owner"};
  if(remote) share.role = remote.role;
  // 1. The service has a version this phone does not: taken, or joined here.
  if(share.id && remote && remote.head !== trip.version.id){
    const theirs = await api.version(share.id, remote.head);
    const x = await inspect(versions, trip, theirs);
    if(x.kind === "newer") trip = await apply(versions, x, "take");
    else if(x.kind === "diverged") trip = await apply(versions, x, "merge");
  }
  // 2. This phone has more: sent. The service may join it with what came meanwhile.
  if(share.role !== "read" && (!share.id || !remote || remote.head !== trip.version.id)){
    const r = share.id ? await api.push(share.id, trip) : await api.create(trip);
    share.id = r.trip;
    if(r.kind === "diverged" && r.merged){
      const x = await inspect(versions, trip, r.merged);
      if(x.kind === "newer") trip = await apply(versions, x, "take");
    }else if(r.kind === "older"){
      const x = await inspect(versions, trip, await api.version(share.id, r.head));
      if(x.kind === "newer") trip = await apply(versions, x, "take");
    }
    share.head = r.head;
  }else if(remote) share.head = remote.head;
  const next = {...rec, trip, share};
  return canonical({t: rec.trip.version.id, s: rec.share || null}) === canonical({t: trip.version.id, s: share}) ? rec : next;
}

/**
 * The traveller's private expenses of a synced trip: joined three ways with the set of
 * the last sync (js/private.js, mergePrivate), sent if they changed here.
 */
export async function syncPrivate(rec, api){
  if(!rec.share || !rec.share.id) return rec;
  const base = rec.share.privBase || null;
  let server = await api.getPrivate(rec.share.id);
  for(let attempt = 0; attempt < 3; attempt++){
    const next = mergePrivate(base, rec.priv || null, server.data);
    let rev = server.rev;
    if(canonical(next) !== canonical(server.data)){
      try{ rev = (await api.putPrivate(rec.share.id, next, server.rev)).rev; }
      catch(e){
        // Another phone got there first: join with what it sent, and again.
        if(e && e.status === 409 && e.current){ server = e.current; continue; }
        throw e;
      }
    }
    const same = canonical(next) === canonical(rec.priv || null) && rev === rec.share.privRev && canonical(next) === canonical(base);
    return same ? rec : {...rec, priv: next, share: {...rec.share, privRev: rev, privBase: next}};
  }
  throw new Error("private: busy, try again");
}

/* ---------- what the people of a shared trip show each other (G1–G7) ---------- */

const ones = m => Object.fromEntries(Object.keys(m || {}).map(k => [k, 1]));

/** My choices as the group sees them ("Where I go"): those of the personal set. */
export const whereOf = priv => ({chosen: {...((priv && priv.marks && priv.marks.chosen) || {})}, plans: {...((priv && priv.marks && priv.marks.plans) || {})}});

/**
 * My ticks and skips changed from `before` (the personal set's marks) to `state`, added to
 * what still waits (`pending`): key → true or false, for the group.
 */
export function pendingTicks(before, state, pending){
  const out = {done: {...((pending && pending.done) || {})}, skipped: {...((pending && pending.skipped) || {})}};
  for(const k of ["done", "skipped"]){
    const a = (before && before[k]) || {}, b = state[k] || {};
    for(const key of new Set([...Object.keys(a), ...Object.keys(b)])) if(!!a[key] !== !!b[key]) out[k][key] = !!b[key];
  }
  return Object.keys(out.done).length || Object.keys(out.skipped).length ? out : null;
}

/**
 * The group's answer kept with the trip; with "Ticks for everyone" on, the group's ticks
 * become mine (the personal set's), so the day shows them as it shows mine.
 */
export function withGroup(rec, g){
  let priv = rec.priv || null;
  if(g.ticks && g.marks) priv = {...(priv || {expenses: []}), marks: {...((priv && priv.marks) || {}), done: ones(g.marks.done), skipped: ones(g.marks.skipped)}};
  return {...rec, group: g, priv};
}

/**
 * A shared trip's group: my ticks waiting sent, my choices sent if shown and changed, the
 * group read. A trip nobody else has (mine, never shared): nothing asked.
 */
export async function syncGroup(rec, remote, api){
  if(!rec.share || !rec.share.id || !remote || (remote.role === "owner" && remote.visibility === "private")) return rec;
  const id = rec.share.id, pend = rec.share.groupPending;
  let g = await api.getGroup(id);
  if(g.ticks && pend) g = await api.markGroup(id, pend.done, pend.skipped);
  const where = whereOf(rec.priv);
  if(g.where && canonical(where) !== rec.share.groupSent) g = await api.putGroup(id, where, g.ticks);
  const share = {...rec.share, groupSent: g.where ? canonical(where) : null, groupPending: null};
  if(canonical(g) === canonical(rec.group || null) && canonical(share) === canonical(rec.share)) return rec;
  return withGroup({...rec, share}, g);
}
