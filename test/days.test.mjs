// Moving days (js/edit.js, design/README.md MV1–MV6): two days swapped, a day's stops
// joined to another; what follows them; what to know first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { swapDays, moveDayStops, moveWarnings } from "../js/edit.js";
import { moveMarks } from "../js/trips.js";
import { validateTrip } from "../js/trip.js";

const trip = () => ({format: "travel-in-my-pocket/2", title: "T", days: [
  {date: "2027-05-14", city: "Lisboa", title: "Baixa", stay: {name: "Casa"}, notes: ["Card"], stops: [{id: "a", title: "Castle", time: "12:30", booking: "booked"}, {id: "b", title: "Bar", time: "18:00"}]},
  {date: "2027-05-15", city: "Lisboa", title: "Belém", stay: {name: "Casa"}, stops: [{id: "d", title: "Mosteiro", time: "10:00", closed: ["mon"]}, {id: "c", title: "Pastéis", time: "12:30"}]},
  {date: "2027-05-16", city: "Sintra", title: "Out of town", plans: [{id: "sintra", name: "Sintra", stops: [{id: "e", title: "Palace", time: "10:00"}]}, {id: "cascais", name: "Cascais", stops: [{id: "f", title: "Beach", time: "11:00"}]}]},
  {date: "2027-05-17", city: "Porto", title: "Porto", stay: {name: "Hotel Porto"}, stops: [{id: "g", title: "Train", time: "08:00", booking: "booked"}]}
]});

test("two days swap their programme; the dates and the nights stay (MV2)", () => {
  const t = trip(), {trip: out, marks} = swapDays(t, "2027-05-15", "2027-05-17");
  const [, two, , four] = out.days;
  assert.deepEqual([two.date, two.title, two.city, two.stay.name, two.stops.map(s => s.id)], ["2027-05-15", "Porto", "Porto", "Casa", ["g"]]);
  assert.deepEqual([four.date, four.title, four.city, four.stay.name, four.stops.map(s => s.id)], ["2027-05-17", "Belém", "Lisboa", "Hotel Porto", ["d", "c"]]);
  assert.deepEqual(validateTrip(out).errors, []);
  assert.deepEqual(t.days[1].title, "Belém", "the trip given stays as it was");
  // A day with plans swaps whole, its plans with it.
  const p = swapDays(t, "2027-05-16", "2027-05-14").trip;
  assert.deepEqual([p.days[0].plans.map(x => x.id), p.days[0].stops, p.days[2].stops.map(s => s.id)], [["sintra", "cascais"], undefined, ["a", "b"]]);
  assert.deepEqual(validateTrip(p).errors, []);
  // Ticks follow their stops.
  const state = moveMarks({done: {"2027-05-15||c": 1, "2027-05-17||g": 1}, skipped: {}, plans: {}}, marks);
  assert.deepEqual(Object.keys(state.done).sort(), ["2027-05-15||g", "2027-05-17||c"]);
});

test("a day's stops join another in time order; the day left empty goes (MV3)", () => {
  const {trip: out, marks} = moveDayStops(trip(), "2027-05-14", "2027-05-15");
  assert.deepEqual(out.days.map(d => d.date), ["2027-05-15", "2027-05-16", "2027-05-17"], "the dates after it stay");
  assert.deepEqual(out.days[0].stops.map(s => s.time + " " + s.title), ["10:00 Mosteiro", "12:30 Pastéis", "12:30 Castle", "18:00 Bar"]);
  assert.deepEqual(validateTrip(out).errors, []);
  assert.deepEqual(moveMarks({done: {"2027-05-14||a": 1}, skipped: {}, plans: {}}, marks).done, {"2027-05-15||a": 1});
  assert.throws(() => moveDayStops(trip(), "2027-05-16", "2027-05-17"), /plans/);
  assert.throws(() => moveDayStops(trip(), "2027-05-14", "2027-05-16"), /plans/);
});

test("before moving, what to know for each stop (MV4): closed, booked, the time taken", () => {
  const t = trip();
  // Belém to Monday the 17th: the Mosteiro is closed on Mondays.
  assert.deepEqual(moveWarnings(t, t.days[1].stops[0], {date: "2027-05-17", plan: null}, {date: "2027-05-15", plan: null, id: "d"}), [{kind: "closed", weekday: "mon"}]);
  // The castle, booked, to the 15th at 12:30: booked, and Pastéis there at 12:30.
  assert.deepEqual(moveWarnings(t, t.days[0].stops[0], {date: "2027-05-15", plan: null}, {date: "2027-05-14", plan: null, id: "a"}).map(w => w.kind), ["booked", "time"]);
});
