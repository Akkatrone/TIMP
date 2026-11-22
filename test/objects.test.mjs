import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { versionStore } from "../js/objects.js";
import { memoryBackend } from "../js/store.js";
import { prepare } from "../js/trips.js";
import { commit } from "../js/version.js";
import { addStop, removeStop } from "../js/edit.js";

const demo = () => JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));
const bytes = async db => (await db.getAll("objects")).reduce((n, o) => n + JSON.stringify(o).length, 0);

test("a version comes back exactly as it went in, key order included", async () => {
  const db = memoryBackend(), versions = versionStore(db);
  const {trip} = await prepare(demo());
  await versions.put(trip);
  const back = await versions.get(trip.id, trip.version.id);
  assert.equal(JSON.stringify(back), JSON.stringify(trip));
  assert.deepEqual(await versions.ids(trip.id), [trip.version.id]);
  assert.equal(await versions.get(trip.id, "0000000000000000"), null);
});

test("a version that changes one stop adds a few small pieces and shares the rest", async () => {
  const db = memoryBackend(), versions = versionStore(db);
  const {trip: v1} = await prepare(demo());
  await versions.put(v1);
  const pieces1 = (await db.keys("objects")).length, size1 = await bytes(db);
  const v2 = await commit(addStop(v1, {date: "2027-05-14"}, {time: "12:15", title: "Gelato"}).trip, v1);
  await versions.put(v2);
  const added = (await db.keys("objects")).length - pieces1, grew = await bytes(db) - size1;
  assert.ok(added >= 2 && added <= 4, `${added} new pieces`);       // the stop, its day, the trip
  assert.ok(grew < size1 / 4, `${grew} bytes added to ${size1}`);
  assert.equal(JSON.stringify(await versions.get(v1.id, v1.version.id)), JSON.stringify(v1), "the old version is intact");
  await versions.put(v2);
  assert.equal(await bytes(db), size1 + grew, "keeping a version twice stores nothing");
});

test("dropping a trip removes its pieces, and keeps the ones another trip shares", async () => {
  const db = memoryBackend(), versions = versionStore(db);
  const {trip: a} = await prepare(demo());
  const b = {...a, id: "demo-copy"};
  await versions.put(a);
  await versions.put(b);
  const shared = (await db.keys("objects")).length;
  await versions.drop(a.id);
  assert.deepEqual(await versions.ids(a.id), []);
  assert.equal((await db.keys("objects")).length, shared - 1, "only the root differs: the id is in it");
  assert.equal(JSON.stringify(await versions.get(b.id, b.version.id)), JSON.stringify(b));
  await versions.drop(b.id);
  assert.equal((await db.keys("objects")).length, 0);
});

test("a version whose pieces are gone is reported as missing, not half built", async () => {
  const db = memoryBackend(), versions = versionStore(db);
  const {trip} = await prepare(demo());
  await versions.put(trip);
  const [one] = await db.keys("objects");
  await db.del("objects", one);
  assert.equal(await versions.get(trip.id, trip.version.id), null);
});

test("a long history costs little: fifty edits of one stop each", async () => {
  const db = memoryBackend(), versions = versionStore(db);
  let {trip} = await prepare(demo());
  await versions.put(trip);
  const first = await bytes(db);
  for(let i = 0; i < 25; i++){
    const {trip: next, ref} = addStop(trip, {date: "2027-05-15"}, {time: "20:" + String(i).padStart(2, "0"), title: "Stop " + i});
    const added = await commit(next, trip);
    await versions.put(added);
    trip = await commit(removeStop(added, ref), added);
    await versions.put(trip);
  }
  const total = await bytes(db), perEdit = (total - first) / 50;
  assert.equal((await versions.ids(trip.id)).length, 51);
  assert.ok(total * 5 < first * 51, `51 versions in ${total} bytes; as full copies ${first * 51}`);
  assert.ok(perEdit < 1500, `${Math.round(perEdit)} bytes per edit`);
});
