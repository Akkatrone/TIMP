import { test } from "node:test";
import assert from "node:assert/strict";
import { groupsIn, chosenIn, programOf, chosenPlan, groupName } from "../js/choices.js";
import { oldStopId } from "../js/ids.js";
import { addAlternative, chooseOption, removeStop, moveGroup, choosePlan, updateStop, leaveGroup } from "../js/edit.js";
import { applyChanges, outline, CHANGES } from "../js/changes.js";
import { validateTrip } from "../js/trip.js";
import { diffTrips } from "../js/diff.js";
import { describe } from "../js/history.js";
import { demo, ID } from "./demo.mjs";

const D1 = "2027-05-14", D2 = "2027-05-15", D3 = "2027-05-16";
const stopsOf = (t, date) => t.days.find(d => d.date === date).stops;
const names = {lunch: "Lunch", dinner: "Dinner", other: "Alternatives"};
const n = k => oldStopId("test", "alt", String(k));   // ids of their own kind, the same on every run

// The example's day 1 with "Lunch in Alfama" and two alternatives to it.
function withLunch(){
  let t = demo();
  const ref = {date: D1, plan: null, id: ID("lunch")};
  t = addAlternative(t, ref, {title: "Casa Exemplo", time: "13:00", type: "food", cost: 25}, "Lunch", n(1)).trip;
  t = addAlternative(t, ref, {title: "Mercado Exemplo", time: "13:15", type: "food", cost: 15}, "Ignored", n(2)).trip;
  return t;
}

test("a group: its options in the list's order, the chosen one, what the day goes through", () => {
  const t = withLunch(), list = stopsOf(t, D1);
  const g = groupsIn(list).get("Lunch");
  assert.deepEqual(g.map(s => s.title), ["Casa Exemplo", "Mercado Exemplo", "Lunch in Alfama"]);
  assert.equal(chosenIn(g).title, "Lunch in Alfama", "the stop the group started from is the one chosen");
  assert.deepEqual(programOf(list).map(s => s.title).filter(x => /Exemplo|Alfama/.test(x)), ["Lunch in Alfama"]);
  assert.equal(programOf(list).length, 6, "the day goes through one lunch");
  assert.deepEqual(validateTrip(t).errors, []);
  // A choice on one stop alone is a plain stop; none chosen: still to choose.
  assert.equal(groupsIn([{id: "a", choice: "X"}]).size, 0);
  assert.equal(chosenIn(g.map(({chosen, ...s}) => s)), null);
  assert.equal(programOf(list.map(({chosen, ...s}) => s)).length, 5, "a group to choose: none of it");
  // Two chosen (two phones chose apart): the first by time, the same everywhere.
  assert.equal(chosenIn(g.map(s => ({...s, chosen: true}))).title, "Casa Exemplo");
  assert.match(validateTrip({...t, days: t.days.map(d => d.date === D1 ? {...d, stops: d.stops.map(s => s.choice ? {...s, chosen: true} : s)} : d)}).warnings.join(), /3 options of "Lunch" are chosen/);
  assert.match(validateTrip({...t, days: t.days.map(d => d.date === D1 ? {...d, stops: d.stops.map(s => s.choice ? {...s, chosen: "yes"} : s)} : d)}).errors.join(), /chosen: must be true, or left out/);
});

test("choosing another option, removing options, moving one or the whole group", () => {
  const t = withLunch();
  const chosen = chooseOption(t, {date: D1, plan: null, id: n(2)});
  assert.deepEqual(stopsOf(chosen, D1).filter(s => s.chosen).map(s => s.title), ["Mercado Exemplo"]);
  assert.deepEqual(stopsOf(t, D1).filter(s => s.chosen).map(s => s.title), ["Lunch in Alfama"], "the trip given is untouched");
  // The chosen one removed: to choose. Left with one option: a plain stop again.
  const less = removeStop(chosen, {date: D1, plan: null, id: n(2)});
  assert.equal(chosenIn(groupsIn(stopsOf(less, D1)).get("Lunch")), null);
  const one = removeStop(less, {date: D1, plan: null, id: n(1)});
  const lunch = stopsOf(one, D1).find(s => s.title === "Lunch in Alfama");
  assert.equal(lunch.choice, undefined);
  assert.equal(lunch.chosen, undefined);
  // The whole group to day 2; or one option alone, out of its group.
  const all = moveGroup(t, {date: D1, plan: null}, "Lunch", {date: D2, plan: null});
  assert.equal(groupsIn(stopsOf(all, D1)).size, 0);
  assert.deepEqual(groupsIn(stopsOf(all, D2)).get("Lunch").map(s => s.title).sort(), ["Casa Exemplo", "Lunch in Alfama", "Mercado Exemplo"]);
  const casa = stopsOf(t, D1).find(s => s.id === n(1));
  const away = updateStop(t, {date: D1, plan: null, id: n(1)}, leaveGroup(casa), {date: D2, plan: null}).trip;
  assert.equal(stopsOf(away, D2).find(s => s.id === n(1)).choice, undefined);
  assert.equal(groupsIn(stopsOf(away, D1)).get("Lunch").length, 2);
});

test("a name for a new group: lunch or dinner from the time of a place to eat, never one the list has", () => {
  assert.equal(groupName({time: "13:00", type: "food"}, names, []), "Lunch");
  assert.equal(groupName({time: "20:30", type: "food"}, names, []), "Dinner");
  assert.equal(groupName({time: "10:00", type: "museum"}, names, []), "Alternatives");
  assert.equal(groupName({time: "13:00", type: "food"}, names, [{choice: "Lunch"}]), "Lunch 2");
});

test("the plan a day goes with: chosen in the trip, else the first", () => {
  const t = demo(), d = t.days.find(x => x.date === D3);
  assert.equal(chosenPlan(d).id, d.plans[0].id);
  const second = d.plans[1].id, out = choosePlan(t, D3, second);
  assert.equal(chosenPlan(out.days.find(x => x.date === D3)).id, second);
  assert.deepEqual(out.days.find(x => x.date === D3).plans.filter(p => p.chosen).map(p => p.id), [second]);
  assert.deepEqual(validateTrip(out).errors, []);
  assert.throws(() => choosePlan(t, D1, "x"), /no plan/);
});

test("an assistant sees the groups in the outline, adds an option, chooses one: the others lose it", () => {
  const t = withLunch();
  const text = outline(t);
  assert.match(text, /\] 14:00 Lunch in Alfama \(food, Lunch: chosen,/);
  assert.match(text, /\] 13:00 Casa Exemplo \(food, Lunch: option,/);
  const changes = list => ({format: CHANGES, trip: "demo-lisbon", changes: list});
  const r = applyChanges(t, changes([
    {add: {day: D1, stop: {time: "13:30", title: "Tasca Exemplo", type: "food", choice: "Lunch", chosen: true}}},
    {add: {day: D1, stop: {time: "20:00", title: "Alone", choice: "Dinner"}}}
  ]));
  assert.equal(r.ok, true, String(r.errors));
  const list = stopsOf(r.trip, D1);
  assert.deepEqual(list.filter(s => s.chosen).map(s => s.title), ["Tasca Exemplo"]);
  assert.equal(groupsIn(list).get("Lunch").length, 4);
  assert.equal(list.find(s => s.title === "Alone").choice, undefined, "a choice on one stop alone is a plain stop");
  const set = applyChanges(t, changes([{update: {day: D1, stop: n(1), set: {chosen: true}}}]));
  assert.deepEqual(stopsOf(set.trip, D1).filter(s => s.chosen).map(s => s.id), [n(1)]);
});

test("the history says choices in words", () => {
  const t = withLunch();
  const lines = describe(diffTrips(t, chooseOption(t, {date: D1, plan: null, id: n(2)})));
  assert.deepEqual(lines, ["Lunch: Mercado Exemplo chosen"]);
  const fresh = describe(diffTrips(demo(), withLunch()));
  assert.ok(fresh.includes("Lunch: 2 alternatives"), fresh.join(" | "));
});
