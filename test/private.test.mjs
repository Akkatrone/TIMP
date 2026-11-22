import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newOwner, splitPrivate, withPrivate, onLoad, join, addPrivate, updatePrivate, removePrivate, atStop, setAtStop, followStops, unlinkStop } from "../js/private.js";
import { ensureVersion, isIntact } from "../js/version.js";
import { fileText } from "../js/trips.js";
import { applyChanges, outline, CHANGES } from "../js/changes.js";
import { ensureIds } from "../js/edit.js";
import { oldStopId } from "../js/ids.js";
import { validateTrip } from "../js/trip.js";

const demo = () => JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));
const D1 = "2027-05-14", D2 = "2027-05-15";
const ME = "p-aaaaaaaaaaaa", YOU = "p-bbbbbbbbbbbb";
const exp = (id, cost, more = {}) => ({id, title: id, cost, ...more});

test("a file's private expenses come apart from the trip, with ids, and go back in only when asked", async () => {
  const file = demo();
  const {trip, priv} = splitPrivate(file);
  assert.equal(trip.private, undefined);
  assert.equal(priv.owner, undefined, "the example's are no one's yet");
  assert.deepEqual(priv.expenses.map(x => x.id), ["azulejo-tiles-to-take-home-invented", "port-wine-a-bottle-for-home-invented"]);
  assert.deepEqual(splitPrivate(trip), {trip, priv: null});
  // in the file at the end, only with expenses; never in what the version is made of
  const ready = await ensureVersion(ensureIds(trip).trip);
  const text = fileText(ready, {owner: ME, ...priv});
  assert.match(text, /"private": \{\n  "owner": "p-a{12}",\n  "expenses": \[/);
  assert.equal(fileText(ready), fileText(ready, {owner: ME, expenses: []}));
  assert.ok(!fileText(ready).includes('"private"'));
  const back = JSON.parse(text);
  assert.equal(await isIntact(back), true, "the same version, with or without them");
  assert.deepEqual(validateTrip(back).errors, []);
  assert.match(newOwner(), /^p-[0-9a-f]{12}$/);
  assert.notEqual(newOwner(), newOwner());
});

test("a loaded file's private expenses: this phone's are taken, someone else's asked about or left out", () => {
  const mine = {owner: ME, expenses: [exp("gelato", 4)]}, yours = {owner: YOU, expenses: [exp("watch", 900)]};
  assert.deepEqual(onLoad(mine, null, ME), {action: "none"});
  assert.deepEqual(onLoad(null, {owner: ME, expenses: [exp("gelato", 5)]}, ME), {action: "mine"}, "this phone's code");
  assert.deepEqual(onLoad({owner: ME, expenses: []}, {owner: ME, expenses: [exp("a", 1)]}, ""), {action: "mine"}, "the trip's own code");
  assert.deepEqual(onLoad(mine, yours, ME), {action: "other"}, "this phone has its own: never mixed");
  assert.deepEqual(onLoad(null, yours, ME), {action: "ask", yes: false}, "a new phone, or a friend's file");
  assert.deepEqual(onLoad(null, yours, ""), {action: "ask", yes: false});
  assert.deepEqual(onLoad(mine, {expenses: [exp("a", 1)]}, ME), {action: "ask", yes: true}, "an assistant wrote them: no one's yet");
  // taken: by id, the file's win; the owner stays the trip's, else the file's, else this phone's
  const joined = join(mine, {owner: ME, expenses: [exp("gelato", 5, {date: "2027-05-15"}), exp("bag", 30, {date: "2027-05-14"})]}, ME);
  assert.deepEqual(joined, {owner: ME, expenses: [exp("bag", 30, {date: "2027-05-14"}), exp("gelato", 5, {date: "2027-05-15"})]});
  assert.equal(join(null, yours, ME).owner, YOU, "a new phone takes them as they are");
  assert.equal(join(null, {expenses: [exp("a", 1)]}, ME).owner, ME);
  assert.equal(join(mine, {expenses: [exp("a", 1)]}, YOU).owner, ME);
});

test("private expenses change like the trip's, and follow the stop they were paid at", () => {
  const {trip} = splitPrivate(demo());
  let {priv, id} = addPrivate(null, trip, ME, {title: "Gloves", cost: 45, date: D2});
  assert.deepEqual(priv, {owner: ME, expenses: [{id: "gloves", title: "Gloves", cost: 45, date: D2}]});
  priv = updatePrivate(priv, trip, id, {title: "Gloves", cost: 40, date: D2});
  assert.equal(priv.expenses[0].cost, 40);
  assert.deepEqual(removePrivate(priv, trip, id), {owner: ME, expenses: []});
  // at a stop: added from its form, changed, moved with the stop, kept when it is deleted
  priv = setAtStop(priv, trip, ME, {date: D1, stop: "castelo", title: "São Jorge Castle"}, {cost: 12}, null);
  const [paid] = atStop(priv, D1, "castelo");
  assert.deepEqual([paid.title, paid.cost, paid.date], ["São Jorge Castle", 12, D1]);
  priv = setAtStop(priv, trip, ME, {date: D1, stop: "castelo", title: "Castle"}, {cost: 15, currency: "USD"}, paid.id);
  assert.deepEqual(atStop(priv, D1, "castelo").map(x => [x.title, x.cost, x.currency]), [["Castle", 15, "USD"]]);
  const moved = followStops(priv, [{date: D1, plan: null, from: "castelo", to: "castelo-2", toDate: D2}]);
  assert.deepEqual(atStop(moved, D2, "castelo-2").length, 1);
  assert.equal(followStops(priv, [{date: D1, from: "castelo", to: "castelo", toDate: D1}]), priv, "nothing moved: the same");
  const kept = unlinkStop(priv, D1, "castelo");
  assert.deepEqual(kept.expenses.find(x => x.id === paid.id), {id: paid.id, title: "Castle", cost: 15, currency: "USD", date: D1});
  assert.equal(setAtStop(priv, trip, ME, {date: D1, stop: "castelo", title: "Castle"}, null, paid.id).expenses.length, 1, "emptied: gone");
});

test("an assistant changes private expenses too, with \"private\": true; the outline lists them", () => {
  const {trip: file, priv: theirs} = splitPrivate(demo());
  const trip = ensureIds(file).trip, priv = {owner: ME, ...theirs};
  const text = outline(trip, priv);
  assert.match(text, /Private expenses \(the traveller's own, not shared with the trip\):\n  \[azulejo-tiles-to-take-home-invented\] 2027-05-15 Azulejo tiles to take home \(invented\): 24/);
  assert.ok(!outline(trip).includes("Private"));
  const changes = list => ({format: CHANGES, trip: "demo-lisbon", changes: list});
  const r = applyChanges(trip, changes([
    {addExpense: {private: true, expense: {title: "Castle souvenir", cost: 8, date: D1, stop: "castelo"}}},
    {setExpense: {private: true, expense: "port-wine-a-bottle-for-home-invented", set: {cost: 22}}},
    {removeExpense: {private: true, expense: "azulejo-tiles-to-take-home-invented"}},
    {update: {day: D1, stop: "castelo", to: {day: D2}}}
  ]), priv, ME);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.trip.expenses, trip.expenses, "the trip's expenses are untouched");
  // "castelo", the id of before in an outline from before: the stop it became.
  const castelo = oldStopId("demo-lisbon", D1, "castelo");
  assert.deepEqual(r.priv.expenses.map(x => [x.title, x.cost, x.date, x.stop]), [["Castle souvenir", 8, D2, castelo], ["Port wine, a bottle for home (invented)", 22, "2027-05-17", undefined]]);
  assert.deepEqual(r.counts, {added: 1, changed: 2, removed: 1});
  assert.ok(outline(r.trip, r.priv).includes(`Castle souvenir: 8 (at [${castelo}])`));
  // the first private expense makes the section, with this phone's code
  assert.equal(applyChanges(trip, changes([{addExpense: {private: true, expense: {title: "Hat", cost: 20}}}]), null, ME).priv.owner, ME);
  // a stop that is not there; a private expense that is not there; a trip expense cannot have a stop
  assert.match(applyChanges(trip, changes([{addExpense: {private: true, expense: {title: "X", cost: 1, date: D1, stop: "nope"}}}]), priv, ME).errors[0], /no stop "nope" on 2027-05-14/);
  assert.match(applyChanges(trip, changes([{removeExpense: {private: true, expense: "nope"}}]), priv, ME).errors[0], /no private expense "nope"/);
  assert.match(applyChanges(trip, changes([{addExpense: {expense: {title: "X", cost: 1, date: D1, stop: "castelo"}}}]), priv, ME).errors[0], /only private expenses have a stop/);
  // a stop removed: what was paid there stays, without the link
  const gone = applyChanges(r.trip, changes([{remove: {day: D2, stop: castelo}}]), r.priv, ME);
  assert.deepEqual(gone.priv.expenses[0].stop, undefined);
  assert.equal(gone.priv.expenses[0].title, "Castle souvenir");
});
