import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyChanges, outline, changesBrief, isChanges, CHANGES } from "../js/changes.js";
import { validateTrip } from "../js/trip.js";

const demo = () => JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));
const changes = list => ({format: CHANGES, trip: "demo-lisbon", changes: list});
const D1 = "2027-05-14", D2 = "2027-05-15", D3 = "2027-05-16";
const ids = (t, date, plan) => { const d = t.days.find(x => x.date === date); return (plan ? d.plans.find(p => p.id === plan) : d).stops.map(s => s.id); };

test("the outline is a few lines per day with every stop's id, far shorter than the file", () => {
  const trip = demo(), text = outline(trip);
  assert.match(text, /^Trip "Lisbon in my pocket \(example\)", id demo-lisbon, 3 days\./);
  assert.match(text, /\[se\] 11:00 Lisbon Cathedral \(sight\)/);
  assert.match(text, /plan \[cascais\]/);
  assert.match(text, /\[train\] 08:40 Train from Rossio \(by train, no position\)/);
  assert.ok(text.length * 3 < JSON.stringify(trip).length, `${text.length} vs ${JSON.stringify(trip).length}`);
});

test("add, update, move and remove apply in order, as one new trip", () => {
  const res = applyChanges(demo(), changes([
    {add: {day: D1, stop: {time: "12:30", title: "Café A Brasileira", type: "food", lat: 38.7107, lng: -9.1423}}},
    {update: {day: D1, stop: "se", set: {time: "11:15", tag: "Free entry", text: null}}},
    {update: {day: D1, stop: "sunset", to: {day: D2}}},
    {remove: {day: D2, stop: "maat"}}
  ]));
  assert.equal(res.ok, true, String(res.errors));
  assert.deepEqual(res.counts, {added: 1, changed: 2, removed: 1});
  assert.ok(ids(res.trip, D1).includes("cafe-a-brasileira"));
  const se = res.trip.days[0].stops.find(s => s.id === "se");
  assert.deepEqual([se.time, se.tag, se.text], ["11:15", "Free entry", undefined]);
  assert.ok(!ids(res.trip, D1).includes("sunset") && ids(res.trip, D2).includes("sunset"));
  assert.ok(!ids(res.trip, D2).includes("maat"));
  assert.deepEqual(res.moves, [{date: D1, plan: null, from: "sunset", to: "sunset", toDate: D2, toPlan: null}]);
  assert.deepEqual(validateTrip(res.trip).errors, []);
});

test("days can be changed, added and removed; plans are named by id", () => {
  const res = applyChanges(demo(), changes([
    {setDay: {day: D2, set: {title: "Belém slowly", notes: null}}},
    {add: {day: D3, plan: "cascais", stop: {time: "18:00", title: "Sunset at the bay", type: "view"}}},
    {addDay: {date: "2027-05-17", city: "Lisboa", stops: [{time: "10:00", title: "Last coffee"}]}},
    {removeDay: {day: D1}}
  ]));
  assert.equal(res.ok, true, String(res.errors));
  assert.equal(res.trip.days[0].title, "Belém slowly");
  assert.ok(ids(res.trip, D3, "cascais").includes("sunset-at-the-bay"));
  assert.deepEqual(res.trip.days.map(d => d.date), [D2, D3, "2027-05-17"]);
  assert.equal(res.trip.days[2].stops[0].id, "last-coffee", "new stops get their ids");
});

test("a wrong change says which one and why, and nothing is applied", () => {
  const trip = demo();
  const res = applyChanges(trip, changes([
    {add: {day: D1, stop: {time: "12:00", title: "Fine"}}},
    {update: {day: D1, stop: "wawel", set: {time: "10:00"}}},
    {remove: {day: "2027-06-01", stop: "se"}},
    {rename: {day: D1}},
    {add: {day: D3, plan: "porto", stop: {title: "X"}}},
    {setDay: {day: D1, set: {stops: []}}}
  ]));
  assert.equal(res.ok, false);
  assert.deepEqual(res.errors.map(e => e.split(":")[0]), ["changes[1]", "changes[2]", "changes[3]", "changes[4]", "changes[5]"]);
  assert.match(res.errors[0], /no stop "wawel" on 2027-05-14/);
  assert.match(res.errors[2], /"rename" is not a change/);
  assert.deepEqual(trip, demo(), "the trip given is untouched");
});

test("changes are checked like a trip file once applied, and must be for the open trip", () => {
  const bad = applyChanges(demo(), changes([{update: {day: D1, stop: "se", set: {lat: 200}}}]));
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /after the changes, .*lat/);
  assert.match(applyChanges(demo(), {...changes([{removeDay: {day: D1}}]), trip: "rome-2027"}).errors[0], /for "rome-2027"/);
  assert.equal(applyChanges(demo(), {format: CHANGES, changes: [{removeDay: {day: D1}}]}).ok, true, "without trip: the open one");
  assert.equal(isChanges({format: CHANGES}), true);
  assert.equal(isChanges(demo()), false);
});

test("the brief for assistants names every kind of change", () => {
  const brief = changesBrief();
  for(const k of ["add", "update", "remove", "setDay", "addDay", "removeDay"]) assert.match(brief, new RegExp(`"${k}"`));
  assert.ok(brief.length < 2500, String(brief.length));
});
