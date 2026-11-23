import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sha256, isStopId, newStopId, oldStopId, uniqueStopIds, needsStopIds, findStopId } from "../js/ids.js";
import { ensureIds } from "../js/edit.js";
import { diffTrips } from "../js/diff.js";
import { followIds } from "../js/trips.js";
import { followIds as followIdsPrivate } from "../js/private.js";
import { demo, demoFile, ID } from "./demo.mjs";

const D1 = "2027-05-14", D3 = "2027-05-16";
const day = (t, date) => t.days.find(d => d.date === date);
const listOf = (t, date, plan) => plan ? day(t, date).plans.find(p => p.id === plan).stops : day(t, date).stops;
const allIds = t => t.days.flatMap(d => (d.plans || [d]).flatMap(l => l.stops.map(s => s.id)));

test("SHA-256 without waiting is Web Crypto's, around every block boundary and beyond ASCII", async () => {
  const web = async text => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).toString("hex");
  for(let n = 0; n < 200; n++){
    const text = "é漢✈".repeat(n % 5) + "x".repeat(n);
    assert.equal(sha256(text), await web(text), `length ${n}`);
  }
  assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("a stop id: twelve characters, the last a check; ids of before are told apart", () => {
  const ids = Array.from({length: 200}, newStopId);
  assert.ok(ids.every(isStopId));
  assert.equal(new Set(ids).size, ids.length);
  for(const old of ["se", "lunch", "cena-2", "monte-ortobene", "abcdefghijkl", "t7pu6hxjtrnu", "T7PU6HXJTRNT", 12, null]) assert.equal(isStopId(old), false, String(old));
});

test("the rule that turns an id of before into one of its own never changes", () => {
  // As written in js/ids.js, computed here a second way, and held to the first values.
  const rule = text => { const n = BigInt("0x" + createHash("sha256").update(text).digest("hex").slice(0, 16)) % 36n ** 11n; return n.toString(36).padStart(11, "0"); };
  assert.equal(oldStopId("demo-lisbon", D1, "se").slice(0, 11), rule(`demo-lisbon|${D1}|se`));
  assert.equal(oldStopId("demo-lisbon", D3, "station", "sintra").slice(0, 11), rule(`demo-lisbon|${D3}|station|sintra`));
  assert.equal(oldStopId("demo-lisbon", D1, "se"), "t7pu6hxjtrnt");
  assert.equal(oldStopId("demo-lisbon", D3, "station", "sintra"), "cz7yqlt8f8ux");
});

test("ids of before become their own, the same on every device; one met again in another plan of the day too", () => {
  const file = demoFile();
  const {trip, moves} = uniqueStopIds(file);
  assert.equal(listOf(trip, D1)[1].id, oldStopId("demo-lisbon", D1, "se"));
  // "station" is in both plans of the third day: the first by the day's rule, the other by its plan.
  const [first, second] = day(file, D3).plans.map(p => p.id);
  assert.ok(listOf(trip, D3, first).some(s => s.id === oldStopId("demo-lisbon", D3, "station")));
  assert.ok(listOf(trip, D3, second).some(s => s.id === oldStopId("demo-lisbon", D3, "station", second)));
  assert.equal(new Set(allIds(trip)).size, allIds(trip).length);
  assert.ok(allIds(trip).every(isStopId));
  assert.deepEqual(moves.find(m => m.from === "se"), {date: D1, plan: null, from: "se", to: oldStopId("demo-lisbon", D1, "se")});
  assert.deepEqual(uniqueStopIds(demoFile()).trip, trip, "the same file, the same ids");
  assert.deepEqual(file, demoFile(), "the trip given is untouched");
  const again = uniqueStopIds(trip);
  assert.equal(again.trip, trip, "nothing to do: the same object");
  assert.deepEqual(again.moves, []);
  assert.equal(needsStopIds(file), true);
  assert.equal(needsStopIds(trip), false);
});

test("a stop copied with its id: the original keeps it, the copy gets its own", () => {
  const base = demo(), se = listOf(base, D1)[1];
  // Copied to another day: the one where the base has it keeps the id.
  const other = demo(); listOf(other, "2027-05-15").unshift({...se});
  let fixed = uniqueStopIds(other, base).trip;
  assert.equal(listOf(fixed, D1)[1].id, se.id);
  assert.notEqual(listOf(fixed, "2027-05-15")[0].id, se.id);
  assert.ok(isStopId(listOf(fixed, "2027-05-15")[0].id));
  // Moved to an earlier day and copied back where it was, changed: the same place wins.
  const moved = demo(); listOf(moved, D1)[1].text = "Changed"; listOf(moved, D1).splice(0, 0, {...se, time: "09:00"});
  fixed = uniqueStopIds(moved, base).trip;
  assert.equal(listOf(fixed, D1).filter(s => s.id === se.id).length, 1);
  // Both in another place than the base's: the one with the base's content keeps it.
  const away = demo(); listOf(away, D1).splice(1, 1); listOf(away, D3, day(away, D3).plans[0].id).push({...se, time: "20:00"}, {...se});
  fixed = uniqueStopIds(away, base).trip;
  const there = listOf(fixed, D3, day(away, D3).plans[0].id).slice(-2);
  assert.deepEqual([there[0].id === se.id, there[1].id === se.id], [false, true]);
  // Without a base: the first keeps it. Always the same ids for the same trip.
  assert.equal(uniqueStopIds(other).trip.days[0].stops[1].id, se.id);
  assert.deepEqual(uniqueStopIds(other, base).trip, uniqueStopIds(other, base).trip);
});

test("a file an assistant wrote with a stop copied next to itself is fixed when it is loaded", () => {
  const file = demo(); listOf(file, D1).splice(2, 0, {...listOf(file, D1)[1], title: "Sé, again"});
  const {trip} = ensureIds(file, demo());
  assert.equal(new Set(allIds(trip)).size, allIds(trip).length);
  assert.equal(listOf(trip, D1)[1].id, ID("se"), "the one with the content it had keeps it");
});

test("a chat, or a changes file, that names a stop by its id of before finds it", () => {
  const trip = demo();
  assert.equal(findStopId(trip, D1, null, listOf(trip, D1), "se"), ID("se"));
  assert.equal(findStopId(trip, D1, null, listOf(trip, D1), ID("se")), ID("se"));
  assert.equal(findStopId(trip, D1, null, listOf(trip, D1), "nope"), undefined);
  const plan = day(trip, D3).plans[1].id;
  assert.equal(findStopId(trip, D3, plan, listOf(trip, D3, plan), "station"), ID("station", D3, plan));
});

test("versions from before and after the ids compare stop by stop: no change but the ids", () => {
  const d = diffTrips(demoFile(), demo());
  assert.deepEqual([d.added, d.removed, d.changed, d.moved], [[], [], [], []]);
  assert.equal(d.ids, true);
  assert.equal(diffTrips(demo(), demo()).ids, false);
});

test("ticks and private expenses saved under the ids of before follow the trip that came converted", () => {
  const trip = demo();
  const state = {done: {[`${D1}||se`]: 1, [`${D1}||${ID("castelo")}`]: 1}, skipped: {}, plans: {}};
  assert.deepEqual(followIds(state, trip).done, {[`${D1}||${ID("se")}`]: 1, [`${D1}||${ID("castelo")}`]: 1});
  const fine = {done: {[`${D1}||${ID("se")}`]: 1}, skipped: {}, plans: {}};
  assert.equal(followIds(fine, trip), fine);
  const priv = {owner: "p-x", expenses: [{id: "a", title: "Tiles", cost: 1, date: D1, stop: "castelo"}, {id: "b", title: "Hat", cost: 2}]};
  assert.deepEqual(followIdsPrivate(priv, trip).expenses.map(x => x.stop), [ID("castelo"), undefined]);
  const plan = day(trip, D3).plans[1].id;
  assert.equal(followIdsPrivate({owner: "p-x", expenses: [{id: "c", title: "Ticket", cost: 3, date: D3, stop: "station"}]}, trip).expenses[0].stop, ID("station", D3, day(trip, D3).plans[0].id));
  assert.ok(plan);
});

test("a join an app of before made with a converted trip is made again, converting first: nothing twice, removals kept", async () => {
  const { ensureVersion, commit, commitMerge, contentOf } = await import("../js/version.js");
  const { prepare, rejoin } = await import("../js/trips.js");
  const { updateStop, removeStop } = await import("../js/edit.js");
  const { mergeTrips } = await import("../js/merge.js");
  const { versionStore } = await import("../js/objects.js");
  const { memoryBackend } = await import("../js/store.js");
  const store = versionStore(memoryBackend());
  // The trip from before; this phone changed it offline; meanwhile it was converted elsewhere.
  const H = await ensureVersion(demoFile());
  const se = listOf(H, D1).find(s => s.id === "se");
  const L = await commit(removeStop(updateStop(H, {date: D1, id: "se"}, {...se, text: "Changed offline"}).trip, {date: D1, id: "castelo"}), H);
  const V = (await prepare(H)).trip;
  // The app of before joined them without converting: "se" twice, the castle back.
  const bad = JSON.parse(JSON.stringify(contentOf(L)));
  bad.days[0].stops.push(...listOf(V, D1));
  const M = await commitMerge(bad, L, V);
  for(const v of [H, L, V, M]) await store.put(v);
  const fixed = await rejoin(store, M);
  assert.deepEqual(fixed.version.parents, M.version.parents, "the same two versions joined");
  assert.equal(needsStopIds(fixed), false);
  assert.deepEqual(contentOf(fixed), contentOf(await commitMerge(mergeTrips(H, L, V), L, V)));
  const day1 = listOf(fixed, D1);
  assert.equal(day1.filter(s => s.title === se.title).length, 1, "once");
  assert.equal(day1.find(s => s.id === ID("se")).text, "Changed offline");
  assert.equal(day1.some(s => s.id === ID("castelo")), false, "the removal kept");
  assert.equal(await rejoin(store, V), V, "not such a join: as it is");
});
