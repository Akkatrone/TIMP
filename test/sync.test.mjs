import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { syncTrip, syncPrivate } from "../js/sync.js";
import { mergePrivate, splitPrivate } from "../js/private.js";
import { prepare } from "../js/trips.js";
import { commit, relation, commonBase, commitMerge } from "../js/version.js";
import { mergeTrips } from "../js/merge.js";
import { addStop } from "../js/edit.js";
import { versionStore } from "../js/objects.js";
import { memoryBackend } from "../js/store.js";

const demo = () => JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));
const clone = v => JSON.parse(JSON.stringify(v));
const D1 = "2027-05-14", D2 = "2027-05-15";
const titles = (t, date) => t.days.find(d => d.date === date).stops.map(s => s.title);
const withStop = (t, date, title, time = "12:00") => commit(addStop(t, {date}, {time, title}).trip, t);

// The service, as js/share-api.js describes it, with the same rules as the real one:
// a version made from the head moves it, two that changed separately are joined.
function service(){
  const trips = new Map(), privs = new Map();
  let n = 0;
  const as = user => ({
    async create(trip){
      const had = [...trips.values()].find(t => t.owner === user && t.localId === trip.id);
      if(had) return this.push(had.id, trip);
      const id = "t" + ++n;
      trips.set(id, {id, owner: user, localId: trip.id, head: trip.version.id, versions: new Map([[trip.version.id, clone(trip)]]), members: new Map()});
      return {trip: id, kind: "new", head: trip.version.id};
    },
    async push(id, trip){
      const t = trips.get(id);
      if(t.owner !== user && t.members.get(user) !== "edit") throw Object.assign(new Error("trip: needs the edit role"), {status: 403});
      const head = t.versions.get(t.head), kind = relation(head, trip);
      if(kind === "same" || kind === "older") return {trip: id, kind, head: t.head};
      t.versions.set(trip.version.id, clone(trip));
      if(kind === "newer"){ t.head = trip.version.id; return {trip: id, kind, head: t.head}; }
      const baseId = commonBase(head, trip, new Set(t.versions.keys()));
      const merged = await commitMerge(mergeTrips(baseId ? t.versions.get(baseId) : null, head, trip), head, trip);
      t.versions.set(merged.version.id, merged);
      t.head = merged.version.id;
      return {trip: id, kind, head: t.head, merged: clone(merged)};
    },
    async version(id, vid){ return clone(trips.get(id).versions.get(vid)); },
    async list(){ return [...trips.values()].filter(t => t.owner === user || t.members.has(user)).map(t => ({id: t.id, head: t.head, role: t.owner === user ? "owner" : t.members.get(user)})); },
    async getPrivate(id){ return clone(privs.get(user + "|" + id) || {data: null, rev: 0}); },
    async putPrivate(id, data, rev){
      const k = user + "|" + id, cur = privs.get(k) || {data: null, rev: 0};
      if(cur.rev !== rev) throw Object.assign(new Error("private: changed on another phone"), {status: 409, current: clone(cur)});
      privs.set(k, {data: clone(data), rev: rev + 1});
      return clone(privs.get(k));
    }
  });
  return {as, trips};
}

// A phone: its version store and its records; sync() does what the app does.
function phone(api){
  const versions = versionStore(memoryBackend()), records = new Map();
  return {versions, records,
    async sync(){
      const remote = await api.list();
      for(const r of remote){
        if([...records.values()].some(x => x.share && x.share.id === r.id)) continue;
        const trip = await api.version(r.id, r.head);
        await versions.put(trip);
        records.set(trip.id, {id: trip.id, trip, share: {id: r.id, role: r.role, head: r.head}});
      }
      for(const [id, rec] of records){
        const next = await syncTrip(versions, rec, remote.find(r => rec.share && r.id === rec.share.id) || null, api);
        records.set(id, next);
      }
    }};
}

test("a trip goes up from one phone, comes down to another, and changes made on both meet", async () => {
  const s = service();
  const a = phone(s.as("fra")), b = phone(s.as("fra"));
  const v1 = (await prepare(splitPrivate(demo()).trip)).trip;
  await a.versions.put(v1);
  a.records.set(v1.id, {id: v1.id, trip: v1});
  await a.sync();
  assert.ok(a.records.get(v1.id).share.id, "on the service");
  await b.sync();
  assert.equal(b.records.get(v1.id).trip.version.id, v1.version.id, "the other phone has it");
  // Both change it, apart.
  const ra = a.records.get(v1.id), rb = b.records.get(v1.id);
  a.records.set(v1.id, {...ra, trip: await withStop(ra.trip, D1, "Gelato")});
  b.records.set(v1.id, {...rb, trip: await withStop(rb.trip, D2, "Fado evening", "21:00")});
  await a.sync();
  await b.sync();   // joins here what A sent with its own, and sends the joined one
  await a.sync();   // takes the joined one
  const ta = a.records.get(v1.id).trip, tb = b.records.get(v1.id).trip;
  assert.equal(ta.version.id, tb.version.id, "both phones on the same version");
  assert.equal(ta.version.id, s.trips.get(ra.share.id).head, "and the service");
  assert.ok(titles(ta, D1).includes("Gelato") && titles(ta, D2).includes("Fado evening"));
  // Nothing new: nothing changes, the same records.
  const before = a.records.get(v1.id);
  await a.sync();
  assert.equal(a.records.get(v1.id), before);
});

test("a trip shared read-only comes down, but this phone's changes to it stay here", async () => {
  const s = service();
  const owner = phone(s.as("fra")), guest = phone(s.as("ugo"));
  const v1 = (await prepare(splitPrivate(demo()).trip)).trip;
  await owner.versions.put(v1);
  owner.records.set(v1.id, {id: v1.id, trip: v1});
  await owner.sync();
  s.trips.get(owner.records.get(v1.id).share.id).members.set("ugo", "read");
  await guest.sync();
  const g = guest.records.get(v1.id);
  assert.equal(g.share.role, "read");
  guest.records.set(v1.id, {...g, trip: await withStop(g.trip, D1, "Ugo's own note")});
  await guest.sync();   // nothing sent: read-only
  assert.equal(s.trips.get(g.share.id).head, v1.version.id);
  // The owner changes it: the guest gets it, joined with what stayed here.
  const o = owner.records.get(v1.id);
  owner.records.set(v1.id, {...o, trip: await withStop(o.trip, D2, "Tram 28")});
  await owner.sync();
  await guest.sync();
  assert.ok(titles(guest.records.get(v1.id).trip, D2).includes("Tram 28"));
});

const exp = (id, cost, more = {}) => ({id, title: id, cost, ...more});

test("private expenses: three ways, by id; what changed wins, deletions travel", () => {
  const base = {owner: "p-1", expenses: [exp("hat", 10), exp("tea", 5), exp("map", 3)]};
  const local = {owner: "p-1", expenses: [exp("hat", 12), exp("tea", 5), exp("gift", 30)]};   // hat changed, map gone, gift new
  const server = {owner: "p-1", expenses: [exp("hat", 10), exp("map", 3), exp("book", 20)]}; // tea gone, book new
  assert.deepEqual(mergePrivate(base, local, server).expenses.map(x => [x.id, x.cost]).sort(),
    [["book", 20], ["gift", 30], ["hat", 12]], "hat changed here; tea gone there; map gone here; both new kept");
  // Changed on both: this phone's. Gone there, changed here: kept.
  assert.equal(mergePrivate(base, {expenses: [exp("hat", 15)]}, {expenses: [exp("hat", 11)]}).expenses[0].cost, 15);
  assert.deepEqual(mergePrivate(base, {expenses: [exp("tea", 7)]}, {expenses: []}).expenses.map(x => x.cost), [7]);
  assert.equal(mergePrivate(base, {expenses: []}, {expenses: []}), null);
  // First sync: nothing in common yet; both kept.
  assert.equal(mergePrivate(null, {expenses: [exp("a", 1)]}, {expenses: [exp("b", 2)]}).expenses.length, 2);
});

test("private expenses sync between two phones of the same person, and the second waits its turn", async () => {
  const s = service();
  const api = s.as("fra");
  const v1 = (await prepare(splitPrivate(demo()).trip)).trip;
  const {trip: id} = await api.create(v1);
  let a = {id: v1.id, trip: v1, share: {id, role: "owner", head: v1.version.id}, priv: {owner: "p-1", expenses: [exp("hat", 10)]}};
  let b = {id: v1.id, trip: v1, share: {id, role: "owner", head: v1.version.id}, priv: {owner: "p-1", expenses: [exp("tea", 5)]}};
  a = await syncPrivate(a, api);
  b = await syncPrivate(b, api);   // joins with what A sent
  a = await syncPrivate(a, api);
  assert.deepEqual(a.priv.expenses.map(x => x.id).sort(), ["hat", "tea"]);
  assert.deepEqual(b.priv, a.priv);
  // A deletes the hat; B, behind, changes the tea at the same time.
  a = {...a, priv: {...a.priv, expenses: a.priv.expenses.filter(x => x.id !== "hat")}};
  b = {...b, priv: {...b.priv, expenses: b.priv.expenses.map(x => x.id === "tea" ? {...x, cost: 6} : x)}};
  a = await syncPrivate(a, api);
  b = await syncPrivate(b, api);
  a = await syncPrivate(a, api);
  assert.deepEqual(a.priv.expenses.map(x => [x.id, x.cost]), [["tea", 6]]);
  assert.deepEqual(b.priv, a.priv);
  assert.equal((await api.getPrivate(id)).rev, a.share.privRev);
});
