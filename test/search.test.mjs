// Full-text search in a trip (js/search.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { searchTrip, snippet, fold } from "../js/search.js";

const demo = JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));
const trip = {days: [
  {date: "2027-05-14", city: "Lisboa", notes: ["Tram **28** early, before the crowds"], stops: [
    {id: "a", time: "10:00", title: "Praça do Comércio", type: "sight", text: "The big square on the river."},
    {id: "b", time: "12:30", title: "Castelo de São Jorge", type: "sight", tag: "Ticket needed", text: "The castle on the hill: the view over the river."},
    {id: "c", time: "14:00", title: "Lunch in Alfama", choice: "Lunch", chosen: true, address: "Rua dos Remédios 12"}
  ]},
  {date: "2027-05-15", city: "Sintra", plans: [
    {id: "p1", name: "Palaces", stops: [{id: "d", time: "10:00", title: "Palácio da Pena", text: "Up the hill by bus."}]},
    {id: "p2", name: "Coast", stops: [{id: "e", time: "11:00", title: "Cabo da Roca", text: "The most western point."}]}
  ]}
]};

test("no accents, no case: sao jorge finds São Jorge", () => {
  assert.equal(fold("São JORGE"), "sao jorge");
  const r = searchTrip(trip, "sao jorge");
  assert.deepEqual(r.map(x => x.stopId), ["b"]);
  assert.deepEqual(r[0].name, {before: "Castelo de ", match: "São", after: " Jorge"});
});

test("every word must be found, in the stop or its day", () => {
  assert.deepEqual(searchTrip(trip, "castle river").map(x => x.stopId), ["b"]);
  assert.deepEqual(searchTrip(trip, "castle sintra"), []);
  assert.deepEqual(searchTrip(trip, "lisboa river").map(x => x.stopId), ["a", "b"], "the city is the day's: both stops, in their order");
  assert.deepEqual(searchTrip(trip, "   "), []);
});

test("a word in the name comes before one in a description", () => {
  const r = searchTrip(trip, "hill");
  assert.deepEqual(r.map(x => x.stopId), ["b", "d"]);
  assert.equal(searchTrip(trip, "castelo")[0].field, "title");
  assert.equal(r[0].field, "text");
  assert.deepEqual(r[0].where, {before: "The castle on the ", match: "hill", after: ": the view over the river."});
});

test("labels, addresses, groups, plans and the day's notes are searched", () => {
  assert.deepEqual(searchTrip(trip, "ticket").map(x => x.stopId), ["b"]);
  assert.deepEqual(searchTrip(trip, "remedios").map(x => [x.stopId, x.field]), [["c", "address"]]);
  assert.deepEqual(searchTrip(trip, "lunch").map(x => x.stopId), ["c"]);
  assert.deepEqual(searchTrip(trip, "western").map(x => [x.stopId, x.planId, x.dayIndex]), [["e", "p2", 1]]);
  const note = searchTrip(trip, "tram crowds");
  assert.deepEqual(note.map(x => [x.kind, x.dayIndex, x.index]), [["note", 0, 0]]);
  assert.deepEqual(note[0].where, {before: "", match: "Tram", after: " 28 early, before the crowds"}, "bold marks are left out");
});

test("a snippet is cut at a word, and keeps the accents of the text", () => {
  const long = "Una lunga passeggiata nel quartiere più antico della città, fino alla Sé e oltre il castello di São Jorge";
  const s = snippet(long, ["sao"]);
  assert.equal(s.match, "São");
  assert.match(s.before, /^…\S/);
  assert.equal(snippet("nothing here", ["xyz"]), null);
});

test("the example trip: every stop can be found by its name", () => {
  for(const d of demo.days) for(const s of d.plans ? d.plans.flatMap(p => p.stops) : d.stops){
    const r = searchTrip(demo, s.title);
    assert.ok(r.some(x => x.title === s.title), s.title);
  }
});
