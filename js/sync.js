// A trip and the sharing service, until they agree: the same rules as two files
// (js/trips.js, inspect and apply), with the service as the other phone. No DOM here.
//
// A record that is on the service carries `share`: {id, role, head, privRev, privBase}.
//   id        the service's id of the trip
//   role      owner, edit or read: a trip read-only for this user is never sent
//   head      the version both had at the last sync
//   privRev, privBase  the revision of the private expenses, and the set, at the last sync
//
// api: {create(trip), push(id, trip), version(id, versionId), getPrivate(id), putPrivate(id, data, rev)}
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
