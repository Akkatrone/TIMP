import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyChanges, outline, changesBrief, isChanges, CHANGES } from "../js/changes.js";
import { validateTrip } from "../js/trip.js";
import { isStopId, oldStopId } from "../js/ids.js";
import { demoFile as demo, demo as loaded, ID } from "./demo.mjs";
const changes = list => ({format: CHANGES, trip: "demo-lisbon", changes: list});
const D1 = "2027-05-14", D2 = "2027-05-15", D3 = "2027-05-16";
const ids = (t, date, plan) => { const d = t.days.find(x => x.date === date); return (plan ? d.plans.find(p => p.id === plan) : d).stops.map(s => s.id); };
const titles = (t, date, plan) => { const d = t.days.find(x => x.date === date); return (plan ? d.plans.find(p => p.id === plan) : d).stops.map(s => s.title); };

test("the outline is a few lines per day with every stop's id, far shorter than the file", () => {
  const trip = demo(), text = outline(trip);
  assert.match(text, /^Trip "Lisbon in my pocket \(example\)", id demo-lisbon, 4 days, costs in EUR\./);
  assert.match(text, /\[se\] 11:00 Lisbon Cathedral \(sight, cost 10\)/);
  assert.match(text, /\[comercio\] 10:00 Praça do Comércio \(sight\)/);
  assert.match(text, /plan \[cascais\]/);
  assert.match(text, /\[train\] 08:40 Train from Rossio \(by train, cost 9\.2, no position\)/);
  assert.match(text, /Expenses outside the stops:\n  \[[a-z0-9-]+\] 2026-10-05 Flights to Lisbon and back \(invented\): 280/);
  assert.ok(text.length * 3 < JSON.stringify(trip).length, `${text.length} vs ${JSON.stringify(trip).length}`);
});

test("add, update, move and remove apply in order, as one new trip; ids of before still name their stops", () => {
  // A trip from before, and an outline from before: "se" is the stop's id of before.
  const res = applyChanges(demo(), changes([
    {add: {day: D1, stop: {time: "12:30", title: "Café A Brasileira", type: "food", lat: 38.7107, lng: -9.1423}}},
    {update: {day: D1, stop: "se", set: {time: "11:15", tag: "Free entry", text: null}}},
    {update: {day: D1, stop: "sunset", to: {day: D2}}},
    {remove: {day: D2, stop: "maat"}}
  ]));
  assert.equal(res.ok, true, String(res.errors));
  assert.deepEqual(res.counts, {added: 1, changed: 2, removed: 1});
  assert.ok(titles(res.trip, D1).includes("Café A Brasileira"));
  assert.ok(res.trip.days.every(d => (d.plans || [d]).every(l => l.stops.every(s => isStopId(s.id)))), "every stop with an id of its own");
  const se = res.trip.days[0].stops.find(s => s.id === ID("se"));
  assert.deepEqual([se.time, se.tag, se.text], ["11:15", "Free entry", undefined]);
  assert.ok(!ids(res.trip, D1).includes(ID("sunset")) && ids(res.trip, D2).includes(ID("sunset")));
  assert.ok(!ids(res.trip, D2).includes(ID("maat")));
  // Ticks follow: to the ids the stops got, then where the stop went.
  assert.deepEqual(res.moves.find(m => m.from === "se"), {date: D1, plan: null, from: "se", to: ID("se")});
  assert.deepEqual(res.moves.at(-1), {date: D1, plan: null, from: ID("sunset"), to: ID("sunset"), toDate: D2, toPlan: null});
  assert.deepEqual(validateTrip(res.trip).errors, []);
});

test("days can be changed, added and removed; plans are named by id", () => {
  const res = applyChanges(loaded(), changes([
    {setDay: {day: D2, set: {title: "Belém slowly", notes: null}}},
    {add: {day: D3, plan: "cascais", stop: {time: "18:00", title: "Sunset at the bay", type: "view"}}},
    {addDay: {date: "2027-05-18", city: "Lisboa", stops: [{time: "10:00", title: "Last coffee"}]}},
    {removeDay: {day: D1}}
  ]));
  assert.equal(res.ok, true, String(res.errors));
  assert.equal(res.trip.days[0].title, "Belém slowly");
  assert.ok(titles(res.trip, D3, "cascais").includes("Sunset at the bay"));
  assert.deepEqual(res.trip.days.map(d => d.date), [D2, D3, "2027-05-17", "2027-05-18"]);
  assert.equal(res.trip.days[3].stops[0].id, oldStopId("demo-lisbon", "2027-05-18", "last-coffee"), "new stops get their ids, the same on every phone");
});

test("a rainy-day plan: a day without plans gets two, the stops it had become the first, ticks follow", () => {
  const res = applyChanges(loaded(), changes([
    {addPlan: {day: D1, first: "Sunny", plan: {name: "If it rains", stops: [
      {time: "10:00", title: "Tile Museum", type: "museum"},
      {time: "13:00", title: "Lunch in Alfama", type: "food"}
    ]}}},
    {add: {day: D1, plan: "if-it-rains", stop: {time: "15:00", title: "Coffee at the castle", type: "food"}}}
  ]));
  assert.equal(res.ok, true, String(res.errors));
  const d = res.trip.days[0];
  assert.equal(d.stops, undefined);
  assert.deepEqual(d.plans.map(p => [p.id, p.name]), [["sunny", "Sunny"], ["if-it-rains", "If it rains"]]);
  assert.deepEqual(ids(res.trip, D1, "sunny"), ["comercio", "se", "santa-luzia", "castelo", "lunch", "sunset"].map(x => ID(x)));
  assert.deepEqual(titles(res.trip, D1, "if-it-rains"), ["Tile Museum", "Lunch in Alfama", "Coffee at the castle"]);
  assert.deepEqual(res.moves[0], {date: D1, plan: null, from: ID("comercio"), to: ID("comercio"), toDate: D1, toPlan: "sunny"});
  assert.equal(res.moves.length, 6);
  assert.deepEqual(res.counts, {added: 2, changed: 0, removed: 0});
  assert.deepEqual(validateTrip(res.trip).errors, []);
});

test("plans can be added to a day that has them, renamed and removed; one left is plain stops again", () => {
  const res = applyChanges(loaded(), changes([
    {addPlan: {day: D3, plan: {name: "Lazy morning", stops: [{time: "11:00", title: "Breakfast"}]}}},
    {setPlan: {day: D3, plan: "cascais", set: {name: "Coast"}}},
    {removePlan: {day: D3, plan: "sintra"}}
  ]));
  assert.equal(res.ok, true, String(res.errors));
  assert.deepEqual(res.trip.days[2].plans.map(p => [p.id, p.name]), [["cascais", "Coast"], ["lazy-morning", "Lazy morning"]]);
  const back = applyChanges(res.trip, changes([{removePlan: {day: D3, plan: "lazy-morning"}}]));
  assert.equal(back.ok, true, String(back.errors));
  assert.equal(back.trip.days[2].plans, undefined);
  assert.deepEqual(ids(back.trip, D3), [ID("coast-train"), ID("station", D3, "cascais"), ID("beach"), ID("boca")]);
  assert.deepEqual(back.moves[0], {date: D3, plan: "cascais", from: ID("coast-train"), to: ID("coast-train"), toDate: D3, toPlan: null});
  // Wrong ones: no name for the stops already there, a plan without stops, more than a name.
  const bad = applyChanges(demo(), changes([
    {addPlan: {day: D1, plan: {name: "Rain", stops: [{title: "Museum"}]}}},
    {addPlan: {day: D3, plan: {name: "Empty", stops: []}}},
    {setPlan: {day: D3, plan: "sintra", set: {stops: []}}},
    {removePlan: {day: D1, plan: "x"}}
  ]));
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /"first" must name/);
  assert.match(bad.errors[1], /needs its stops/);
  assert.match(bad.errors[2], /only the name/);
  assert.match(bad.errors[3], /has no plan "x"/);
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
  for(const k of ["add", "update", "remove", "setDay", "addDay", "removeDay", "addPlan", "setPlan", "removePlan"]) assert.match(brief, new RegExp(`"${k}"`));
  // 2,500 until 3.32 (the alternatives' line): still short.
  assert.ok(brief.length < 2800, String(brief.length));
});

test("changes can set what things cost: a stop's cost, the trip's currency, expenses", () => {
  const trip = demo();
  const first = applyChanges(trip, changes([{update: {day: D1, stop: "comercio", set: {cost: 0}}}])).trip;
  const exp = first.expenses[0].id;
  const r = applyChanges(first, changes([
    {update: {day: D1, stop: "se", set: {cost: 12, currency: "USD"}}},
    {setTrip: {set: {currency: "GBP"}}},
    {addExpense: {expense: {title: "Travel insurance", date: "2026-09-20", cost: 35, currency: "EUR"}}},
    {setExpense: {expense: exp, set: {cost: 260}}},
    {removeExpense: {expense: first.expenses[1].id}}
  ]));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.trip.currency, "GBP");
  const se = r.trip.days[0].stops.find(s => s.id === ID("se"));
  assert.deepEqual([se.cost, se.currency], [12, "USD"]);
  assert.equal(r.trip.days[0].stops.find(s => s.id === ID("comercio")).cost, 0);
  // in date order, each with an id
  assert.deepEqual(r.trip.expenses.map(x => [x.title, x.cost]), [["Travel insurance", 35], ["Flights to Lisbon and back (invented)", 260]]);
  assert.ok(r.trip.expenses.every(x => /^[a-z0-9-]+$/.test(x.id)));
  assert.deepEqual(r.counts, {added: 1, changed: 3, removed: 1});
  // only what setTrip may change; expenses named by id; a cost is a number
  assert.match(applyChanges(trip, changes([{setTrip: {set: {days: []}}}])).errors[0], /can change only title, lang, timezone, info, currency/);
  assert.match(applyChanges(trip, changes([{setExpense: {expense: "nope", set: {cost: 1}}}])).errors[0], /no expense "nope"/);
  assert.match(applyChanges(trip, changes([{update: {day: D1, stop: "se", set: {cost: "12 €"}}}])).errors[0], /cost: must be a number/);
  assert.match(changesBrief(), /addExpense/);
});
