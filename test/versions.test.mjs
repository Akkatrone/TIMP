import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ensureVersion, commit, commitMerge, relation, commonBase, versionId, canonical, shortId } from "../js/version.js";
import { mergeTrips } from "../js/merge.js";
import { ensureIds, addStop, updateStop, removeStop, insertIndex, clockMinutes, newId } from "../js/edit.js";
import { validateTrip } from "../js/trip.js";

const demo = () => JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));
const stopsOf = (trip, date) => trip.days.find(d => d.date === date).stops;
const ids = (trip, date) => stopsOf(trip, date).map(s => s.id);
const DAY1 = "2027-05-14", DAY2 = "2027-05-15";

/* ---------- versions ---------- */

test("the same content and parents always give the same id, key order does not matter", async () => {
  const a = {format: "x", id: "t", b: 1, a: [1, {d: 2, c: 3}]};
  const b = {a: [1, {c: 3, d: 2}], id: "t", b: 1, format: "x"};
  assert.equal(canonical(a), canonical(b));
  assert.equal(await versionId(a, ["p2", "p1"]), await versionId(b, ["p1", "p2"]));
  assert.notEqual(await versionId(a, []), await versionId(a, ["p1"]));
  assert.match(await versionId(a, []), /^[0-9a-f]{16}$/);
  assert.equal(shortId("0123456789abcdef"), "0123456");
});

test("a file without a version gets the same root version on every device, and the version is ignored by the id", async () => {
  const one = await ensureVersion(demo()), two = await ensureVersion(demo());
  assert.equal(one.version.id, two.version.id);
  assert.deepEqual(one.version.parents, []);
  assert.equal(Object.keys(one).indexOf("version"), 2, "written right after format and id");
  assert.equal(await ensureVersion(one), one, "a trip with a version keeps it");
  assert.deepEqual(validateTrip(one).errors, []);
});

test("an edit makes a child version; no change makes none", async () => {
  const root = await ensureVersion(demo());
  const {trip: edited} = addStop(root, {date: DAY1}, {time: "12:00", title: "Coffee"});
  const v2 = await commit(edited, root);
  assert.deepEqual(v2.version.parents, [root.version.id]);
  assert.deepEqual(v2.version.history, [root.version.id]);
  assert.equal(await commit(root, root), root);
  const v3 = await commit(removeStop(v2, {date: DAY1, id: "coffee"}), v2);
  assert.deepEqual(v3.version.history, [v2.version.id, root.version.id]);
  assert.deepEqual(validateTrip(v3).errors, []);
});

test("relation tells newer, older, same and diverged apart", async () => {
  const root = await ensureVersion(demo());
  const a1 = await commit(addStop(root, {date: DAY1}, {time: "12:00", title: "A"}).trip, root);
  const b1 = await commit(addStop(root, {date: DAY1}, {time: "13:00", title: "B"}).trip, root);
  assert.equal(relation(root, root), "same");
  assert.equal(relation(root, a1), "newer");
  assert.equal(relation(a1, root), "older");
  assert.equal(relation(a1, b1), "diverged");
  assert.equal(commonBase(a1, b1, new Set([root.version.id])), root.version.id);
  assert.equal(commonBase(a1, b1, new Set()), null, "a base whose content is gone cannot be used");
});

/* ---------- merge ---------- */

async function fork(){
  const root = await ensureVersion(demo());
  const a = await commit(addStop(root, {date: DAY1}, {time: "12:15", title: "Gelato", travel: "metro"}).trip, root);
  let bt = addStop(root, {date: DAY2}, {time: "13:00", title: "Lunch by the river"}).trip;
  bt = updateStop(bt, {date: DAY1, id: "se"}, {...stopsOf(bt, DAY1).find(s => s.id === "se"), text: "Changed on the other phone."}).trip;
  const b = await commit(bt, root);
  return {root, a, b};
}

test("a merge keeps what both sides added and what only one side changed", async () => {
  const {root, a, b} = await fork();
  const {trip, report} = mergeTrips(root, a, b);
  assert.ok(ids(trip, DAY1).includes("gelato"));
  assert.ok(ids(trip, DAY2).includes("lunch-by-the-river"));
  assert.equal(stopsOf(trip, DAY1).find(s => s.id === "se").text, "Changed on the other phone.");
  assert.deepEqual(report, {added: 1, changed: 1, removed: 0});
  assert.deepEqual(validateTrip(trip).errors, []);
});

test("a merge gives the same trip and the same version on both phones", async () => {
  const {root, a, b} = await fork();
  const ab = await commitMerge(mergeTrips(root, a, b).trip, a, b);
  const ba = await commitMerge(mergeTrips(root, b, a).trip, b, a);
  assert.equal(canonical(ab), canonical(ba).replace(ba.version.date, ab.version.date));
  assert.equal(ab.version.id, ba.version.id);
  assert.equal(relation(ab, a), "older");
  assert.equal(relation(a, ab), "newer");
});

test("a stop removed on one side goes, unless the other side changed it", async () => {
  const root = await ensureVersion(demo());
  const a = await commit(removeStop(root, {date: DAY1, id: "castelo"}), root);
  const b = await commit(addStop(root, {date: DAY2}, {time: "08:00", title: "Early coffee"}).trip, root);
  let merged = mergeTrips(root, a, b);
  assert.ok(!ids(merged.trip, DAY1).includes("castelo"));
  assert.equal(merged.report.removed, 0, "already gone on this phone");
  assert.equal(mergeTrips(root, b, a).report.removed, 1, "seen from the phone that still had it");

  const castelo = stopsOf(root, DAY1).find(s => s.id === "castelo");
  const c = await commit(updateStop(root, {date: DAY1, id: "castelo"}, {...castelo, time: "13:00"}).trip, root);
  merged = mergeTrips(root, a, c);
  assert.ok(ids(merged.trip, DAY1).includes("castelo"), "changed on one side wins over removed");
});

test("both sides changed the same field: the same side wins on both phones", async () => {
  const root = await ensureVersion(demo());
  const se = stopsOf(root, DAY1).find(s => s.id === "se");
  const a = await commit(updateStop(root, {date: DAY1, id: "se"}, {...se, time: "11:05"}).trip, root);
  const b = await commit(updateStop(root, {date: DAY1, id: "se"}, {...se, time: "11:10"}).trip, root);
  const winner = a.version.id > b.version.id ? "11:05" : "11:10";
  assert.equal(stopsOf(mergeTrips(root, a, b).trip, DAY1).find(s => s.id === "se").time, winner);
  assert.equal(stopsOf(mergeTrips(root, b, a).trip, DAY1).find(s => s.id === "se").time, winner);
});

test("without a base nothing is removed, and a stop added at the same place by both is kept once", async () => {
  const {a, b} = await fork();
  const {trip} = mergeTrips(null, a, b);
  for(const id of ids(a, DAY1)) assert.ok(ids(trip, DAY1).includes(id), id);
  assert.ok(ids(trip, DAY2).includes("lunch-by-the-river"));
  assert.equal(new Set(ids(trip, DAY1)).size, ids(trip, DAY1).length);
});

test("a stop moved to another day on one side moves", async () => {
  const root = await ensureVersion(demo());
  const lunch = stopsOf(root, DAY1).find(s => s.id === "lunch");
  const a = await commit(updateStop(root, {date: DAY1, id: "lunch"}, lunch, {date: DAY2}).trip, root);
  const b = await commit(addStop(root, {date: DAY2}, {time: "17:00", title: "Shopping"}).trip, root);
  const {trip} = mergeTrips(root, a, b);
  assert.ok(!ids(trip, DAY1).includes("lunch"));
  assert.ok(ids(trip, DAY2).includes("lunch"));
});

test("places, stays and plans merge entry by entry", async () => {
  const root = await ensureVersion(demo());
  const a0 = JSON.parse(JSON.stringify(root)); a0.places.porto = {name: "Porto", color: "#3f63b5"};
  const b0 = JSON.parse(JSON.stringify(root)); b0.stays.casa.note = "New note"; b0.days[2].plans[1].name = "Cascais and the coast";
  const a = await commit(a0, root), b = await commit(b0, root);
  const {trip} = mergeTrips(root, a, b);
  assert.equal(trip.places.porto.name, "Porto");
  assert.equal(trip.stays.casa.note, "New note");
  assert.equal(trip.days[2].plans[1].name, "Cascais and the coast");
  assert.deepEqual(validateTrip(trip).errors, []);
});

/* ---------- edits ---------- */

test("times order the stops; words for times keep their place", () => {
  assert.equal(clockMinutes("9:30"), 570);
  assert.equal(clockMinutes("21.05"), 1265);
  assert.equal(clockMinutes("Evening"), null);
  assert.equal(clockMinutes("25:00"), null);
  const list = [{time: "09:00"}, {time: "Lunch"}, {time: "14:00"}, {time: "Evening"}];
  assert.equal(insertIndex(list, "08:00"), 0);
  assert.equal(insertIndex(list, "10:00"), 1);
  assert.equal(insertIndex(list, "14:00"), 3);
  assert.equal(insertIndex(list, "20:00"), 3);
  assert.equal(insertIndex(list, "Night"), 4);
  assert.equal(insertIndex([], "10:00"), 0);
});

test("a new stop gets a unique id from its title and goes in time order", () => {
  const trip = demo();
  const {trip: t2, ref} = addStop(trip, {date: DAY1}, {time: "11:15", title: "Sé", text: "", lat: 1, lng: 2});
  assert.equal(ref.id, "se-2");
  assert.deepEqual(ids(t2, DAY1).slice(0, 4), ["comercio", "se", "se-2", "santa-luzia"]);
  assert.equal("text" in stopsOf(t2, DAY1)[2], false, "empty fields are left out");
  assert.equal(ids(trip, DAY1).length, 6, "the original is untouched");
  assert.equal(newId("Café São Jorge!", new Set()), "cafe-sao-jorge");
});

test("an edit keeps the id and the field order; a new time or day moves the stop", () => {
  const trip = demo();
  const se = stopsOf(trip, DAY1)[1];
  const same = updateStop(trip, {date: DAY1, id: "se"}, {...se, text: "New"}).trip;
  assert.deepEqual(Object.keys(stopsOf(same, DAY1)[1]), Object.keys(se));
  const later = updateStop(trip, {date: DAY1, id: "se"}, {...se, time: "12:45"}).trip;
  assert.deepEqual(ids(later, DAY1).slice(0, 4), ["comercio", "santa-luzia", "castelo", "se"]);
  const moved = updateStop(trip, {date: DAY1, id: "se"}, se, {date: DAY2});
  assert.deepEqual(moved.ref, {date: DAY2, plan: null, id: "se"});
  assert.ok(ids(moved.trip, DAY2).includes("se"));
});

test("stops without an id get one, and the old keys are reported so ticks can follow", () => {
  const trip = demo();
  delete stopsOf(trip, DAY1)[4].id;
  const {trip: fixed, renamed} = ensureIds(trip);
  assert.equal(stopsOf(fixed, DAY1)[4].id, "lunch-in-alfama");
  assert.deepEqual(renamed, [{date: DAY1, plan: null, from: "#4", to: "lunch-in-alfama"}]);
});

/* ---------- receiving files and editing, as the app does ---------- */

import { prepare, saveEdit, receive, moveMarks, fileName } from "../js/trips.js";
import { versionStore } from "../js/objects.js";
import { memoryBackend } from "../js/store.js";

// The real version store, on the memory backend the app uses when storage is refused.
const memoryStore = () => versionStore(memoryBackend());

test("two phones edit the same trip; each one receiving the other's file ends on the same version", async () => {
  const phoneA = memoryStore(), phoneB = memoryStore();
  const {trip: root} = await prepare(demo());
  // Both load the same file, then each adds a stop.
  const a = (await saveEdit(phoneA, root, addStop(root, {date: DAY1}, {time: "12:15", title: "Gelato"}).trip)).trip;
  const b = (await saveEdit(phoneB, root, addStop(root, {date: DAY2}, {time: "13:00", title: "Lunch"}).trip)).trip;
  const onA = await receive(phoneA, a, b), onB = await receive(phoneB, b, a);
  assert.equal(onA.kind, "merged");
  assert.equal(onA.base, true);
  assert.equal(onA.trip.version.id, onB.trip.version.id);
  assert.deepEqual(onA.report, {added: 1, changed: 0, removed: 0});
  // A sends the merged file back: B sees it as the same version.
  assert.equal((await receive(phoneB, onB.trip, onA.trip)).kind, "same");
});

test("a newer file replaces, an older one changes nothing", async () => {
  const store = memoryStore();
  const {trip: root} = await prepare(demo());
  const v2 = (await saveEdit(store, root, addStop(root, {date: DAY1}, {time: "12:15", title: "Gelato"}).trip)).trip;
  assert.equal((await receive(store, root, v2)).kind, "newer");
  const older = await receive(store, v2, root);
  assert.equal(older.kind, "older");
  assert.equal(older.trip, v2);
});

test("a merge without the base keeps both sides' stops", async () => {
  const {trip: root} = await prepare(demo());
  const a = await commit(removeStop(root, {date: DAY1, id: "castelo"}), root);
  const b = await commit(addStop(root, {date: DAY2}, {time: "13:00", title: "Lunch"}).trip, root);
  const r = await receive(memoryStore(), a, b);   // a phone that never saw the base
  assert.equal(r.base, false);
  assert.ok(ids(r.trip, DAY1).includes("castelo"), "without the base the removal cannot be told from an addition");
  assert.ok(ids(r.trip, DAY2).includes("lunch"));
});

test("a file edited by hand, with its old version left in, becomes a new version made from it", async () => {
  const store = memoryStore();
  const {trip: v1} = await prepare(demo());
  const byHand = JSON.parse(JSON.stringify(v1));
  stopsOf(byHand, DAY1)[0].time = "09:45";
  const {trip: v2} = await prepare(byHand);
  assert.notEqual(v2.version.id, v1.version.id);
  assert.deepEqual(v2.version.parents, [v1.version.id]);
  const r = await receive(store, v1, v2);
  assert.equal(r.kind, "newer");
  assert.equal(stopsOf(r.trip, DAY1)[0].time, "09:45");
  assert.equal((await prepare(v2)).trip.version.id, v2.version.id, "an intact file keeps its version");
});

test("saving without changes makes no version", async () => {
  const {trip: root} = await prepare(demo());
  const r = await saveEdit(memoryStore(), root, JSON.parse(JSON.stringify(root)));
  assert.equal(r.changed, false);
  assert.equal(r.trip, root);
});

test("marks follow a stop that gets an id or moves", () => {
  const state = {done: {[`${DAY1}||#4`]: 1}, skipped: {[`${DAY1}||se`]: 1}, plans: {}};
  const moved = moveMarks(state, [
    {date: DAY1, plan: null, from: "#4", to: "lunch-in-alfama"},
    {date: DAY1, plan: null, from: "se", to: "se", toDate: DAY2, toPlan: null}
  ]);
  assert.deepEqual(moved.done, {[`${DAY1}||lunch-in-alfama`]: 1});
  assert.deepEqual(moved.skipped, {[`${DAY2}||se`]: 1});
  assert.deepEqual(state.done, {[`${DAY1}||#4`]: 1}, "the original is untouched");
});

test("the file name carries the trip and the short version", async () => {
  const {trip} = await prepare(demo());
  assert.match(fileName(trip), /^demo-lisbon-[0-9a-f]{7}\.json$/);
});
