import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateTrip, upgrade, tripSchema, tripId, typeFrom, citiesOf, FIELDS, FORMAT, FORMAT_1, TRAVEL, TYPES } from "../js/trip.js";
import { hasIcon } from "../js/icons.js";

const demo = () => JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));

// The smallest file: what an assistant must get right, and nothing more.
const minimal = () => ({
  format: FORMAT,
  title: "Rome",
  days: [{date: "2027-04-10", stops: [{title: "Colosseum", lat: 41.8902, lng: 12.4922}]}]
});

// Applies a change to a valid trip and returns the errors it causes.
function errorsAfter(change, base = minimal){
  const trip = base();
  change(trip);
  return validateTrip(trip).errors;
}
const hasError = (errors, fragment) => errors.some(e => e.includes(fragment));

test("the example trip is valid and has no warnings", () => {
  const res = validateTrip(demo());
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.warnings, []);
});

test("the smallest file needs only format, title, and days with dated stops that have a title", () => {
  assert.deepEqual(validateTrip(minimal()).errors, []);
  assert.ok(hasError(errorsAfter(t => { delete t.format; }), "format: is required"));
  assert.ok(hasError(errorsAfter(t => { t.format = "travel-in-my-pocket/3"; }), "format"));
  assert.ok(hasError(errorsAfter(t => { delete t.title; }), "title: is required"));
  assert.ok(hasError(errorsAfter(t => { t.days = []; }), "days: must not be empty"));
  assert.ok(hasError(errorsAfter(t => { delete t.days[0].stops[0].title; }), "days[0].stops[0].title: is required"));
});

test("things that are not a trip are refused without throwing", () => {
  for(const junk of [null, 42, "trip", [], {}, {format: FORMAT}, {days: "tomorrow"}, {format: FORMAT, title: "x", days: [null, {stops: [1]}], info: [1]}]){
    assert.equal(validateTrip(junk).ok, false);
  }
});

test("dates must be real and ascending", () => {
  assert.ok(hasError(errorsAfter(t => { t.days[0].date = "2027-02-30"; }), "days[0].date"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].date = "10/04/2027"; }), "days[0].date"));
  assert.ok(hasError(errorsAfter(t => { t.days.push({...t.days[0]}); }), "days[1].date"));
});

test("a day has stops or plans, one of the two; plans come at least two", () => {
  assert.ok(hasError(errorsAfter(t => { delete t.days[0].stops; }), "one of the two"));
  const plans = t => [{name: "A", stops: t.days[0].stops}, {name: "B", stops: t.days[0].stops}];
  assert.ok(hasError(errorsAfter(t => { t.days[0].plans = plans(t); }), "one of the two"));
  assert.deepEqual(errorsAfter(t => { t.days[0].plans = plans(t); delete t.days[0].stops; }), []);
  assert.ok(hasError(errorsAfter(t => { t.days[0].plans = plans(t).slice(0, 1); delete t.days[0].stops; }), "at least 2"));
});

test("a stay is a name, or an object with a name", () => {
  assert.deepEqual(errorsAfter(t => { t.days[0].stay = "Hotel Roma"; }), []);
  assert.deepEqual(errorsAfter(t => { t.days[0].stay = {name: "Hotel Roma", address: "Via Cavour 1"}; }), []);
  assert.ok(hasError(errorsAfter(t => { t.days[0].stay = {address: "Via Cavour 1"}; }), "stay.name"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stay = 3; }), "days[0].stay"));
});

test("coordinates come in pairs and inside the globe", () => {
  assert.ok(hasError(errorsAfter(t => { delete t.days[0].stops[0].lng; }), "together"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].lat = 141.89; }), "stops[0].lat"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].lng = "12.49"; }), "stops[0].lng"));
});

test("a version written by the app is checked, and a link must be https", () => {
  const v = {id: "0123456789abcdef", parents: ["fedcba9876543210"], history: ["fedcba9876543210"], date: "2026-11-16T10:00:00Z"};
  assert.deepEqual(errorsAfter(t => { t.version = v; }), []);
  assert.ok(hasError(errorsAfter(t => { t.version = {...v, id: "xyz"}; }), "version"));
  assert.deepEqual(errorsAfter(t => { t.days[0].stops[0].link = "https://maps.app.goo.gl/AbC"; }), []);
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].link = "javascript:alert(1)"; }), "stops[0].link"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].link = "http://example.com"; }), "stops[0].link"));
});

test("a kind of place or a way of travelling the app does not know is a warning, not an error", () => {
  const trip = minimal();
  Object.assign(trip.days[0].stops[0], {type: "nightclub", travel: "taxi"});
  const res = validateTrip(trip);
  assert.deepEqual(res.errors, []);
  assert.ok(res.warnings.some(w => w.startsWith("days[0].stops[0].type")));
  assert.ok(res.warnings.some(w => w.startsWith("days[0].stops[0].travel")));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].type = ""; }), "stops[0].type"));
});

test("a stop can say its local name, whether it needs booking and when it is closed", () => {
  const ok = errorsAfter(t => Object.assign(t.days[0].stops[0], {local: "コロッセオ", booking: "required", closed: ["mon", "2027-04-25"]}));
  assert.deepEqual(ok, []);
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].closed = ["monday"]; }), "closed[0]: must be \"mon\" to \"sun\""));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].closed = ["2027-02-30"]; }), "closed[0]"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].closed = []; }), "closed: must not be empty"));
  // A booking value from a newer app is a warning: the file still loads.
  const trip = minimal(); trip.days[0].stops[0].booking = "waitlist";
  const res = validateTrip(trip);
  assert.equal(res.ok, true);
  assert.match(res.warnings.join(), /booking: should be one of "required", "advised", "booked"/);
  assert.match(tripSchema().$defs.stop.properties.closed.items.pattern, /sun\|mon/);
});

test("a stop can say what it costs; the trip its currency and the expenses outside the stops", () => {
  const ok = errorsAfter(t => {
    Object.assign(t.days[0].stops[0], {cost: 2400});
    t.currency = "JPY";
    t.expenses = [{title: "Flights", cost: 1280, currency: "EUR", date: "2027-02-01"}, {title: "Rail pass", cost: 50000}];
  });
  assert.deepEqual(ok, []);
  assert.deepEqual(errorsAfter(t => { t.days[0].stops[0].cost = 0; }), [], "free");
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].cost = "2400"; }), "cost: must be a number"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].cost = -5; }), "cost: must be a number"));
  assert.ok(hasError(errorsAfter(t => { t.currency = "yen"; }), "currency: must be a currency code"));
  assert.ok(hasError(errorsAfter(t => { t.expenses = [{title: "Flights"}]; }), "expenses[0].cost: is required"));
  assert.ok(hasError(errorsAfter(t => { t.expenses = [{title: "Flights", cost: 10, date: "2027-02-30"}]; }), "expenses[0].date"));
  assert.ok(hasError(errorsAfter(t => { t.expenses = []; }), "expenses: must not be empty"));
  assert.ok(hasError(errorsAfter(t => { t.expenses = [{id: "a", title: "A", cost: 1}, {id: "a", title: "B", cost: 2}]; }), "expenses[1].id"));
  // a currency without a cost says nothing: a warning
  const trip = minimal(); trip.days[0].stops[0].currency = "EUR";
  assert.match(validateTrip(trip).warnings.join(), /"currency" without "cost"/);
  assert.equal(tripSchema().$defs.expense.properties.currency.pattern, "^[A-Z]{3}$");
});

test("private expenses: the traveller's own, with the stop they were paid at and whose they are", () => {
  const ok = errorsAfter(t => {
    t.days[0].stops[0].id = "colosseum";
    t.private = {owner: "p-3f9a1c0b7d2e", expenses: [{title: "Gelato", cost: 4.5}, {title: "Colosseum", cost: 18, date: "2027-04-10", stop: "colosseum"}]};
  });
  assert.deepEqual(ok, []);
  assert.deepEqual(errorsAfter(t => { t.private = {expenses: [{title: "Gelato", cost: 4.5}]}; }), [], "no owner yet: an assistant wrote it");
  assert.ok(hasError(errorsAfter(t => { t.private = {owner: "p-1"}; }), "private.expenses: is required"));
  assert.deepEqual(errorsAfter(t => { t.private = {expenses: [], marks: {done: {"2027-04-10||colosseum": 1}}}; }), [], "on the account: marks only");
  assert.ok(hasError(errorsAfter(t => { t.private = {owner: "Mario Rossi", expenses: [{title: "A", cost: 1}]}; }), "private.owner: must be a code written by the app"));
  assert.ok(hasError(errorsAfter(t => { t.private = {expenses: [{id: "a", title: "A", cost: 1}, {id: "a", title: "B", cost: 2}]}; }), "private.expenses[1].id"));
  // a stop goes with its day; and only private expenses have one: the trip's cost at a stop is the stop's
  assert.ok(hasError(errorsAfter(t => { t.private = {expenses: [{title: "A", cost: 1, stop: "colosseum"}]}; }), "\"stop\" needs \"date\""));
  assert.ok(hasError(errorsAfter(t => { t.expenses = [{title: "A", cost: 1, date: "2027-04-10", stop: "colosseum"}]; }), "only private expenses have a stop"));
  assert.ok(tripSchema().$defs.private.properties.expenses);
  assert.deepEqual(tripSchema().$defs.private.required, ["expenses"]);
});

test("every kind of place and way of travelling has its icon", () => {
  for(const v of [...TYPES, ...TRAVEL]) assert.ok(hasIcon(v), v);
});

test("ids are written by the app, and stay unique in their list", () => {
  assert.ok(hasError(errorsAfter(t => { t.id = "Rome 2027"; }), "id"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops = [{id: "a", title: "A"}, {id: "a", title: "B"}]; }), "used twice"));
  assert.equal(tripId({title: "Caffè e Colosseo!", days: [{date: "2027-04-10"}]}), "caffe-e-colosseo-2027-04-10");
});

test("info sections need a title and lines with a label and a text", () => {
  assert.deepEqual(errorsAfter(t => { t.info = [{title: "Help", items: [{label: "Police", text: "112"}]}]; }), []);
  assert.ok(hasError(errorsAfter(t => { t.info = [{title: "Help", items: [{label: "Police"}]}]; }), "info[0].items[0].text"));
});

test("unknown fields and days without a map are warnings, not errors", () => {
  const trip = minimal();
  trip.days[0].titel = "typo";
  delete trip.days[0].stops[0].lat;
  delete trip.days[0].stops[0].lng;
  const res = validateTrip(trip);
  assert.equal(res.ok, true);
  assert.ok(res.warnings.some(w => w.includes("days[0].titel")));
  assert.ok(res.warnings.some(w => w.includes("no map")));
});

test("the kind of a place is read from OpenStreetMap's and Google's tags", () => {
  assert.equal(typeFrom(["tourism", "museum"]), "museum");
  assert.equal(typeFrom(["amenity", "restaurant"]), "food");
  assert.equal(typeFrom(["leisure", "park"]), "park");
  assert.equal(typeFrom(["tourism", "viewpoint"]), "view");
  assert.equal(typeFrom(["lodging", "point_of_interest"]), "hotel");
  assert.equal(typeFrom(["highway", "residential"]), null);
});

test("cities get their colour in the order they first appear", () => {
  assert.deepEqual(citiesOf({days: [{city: "Rome"}, {}, {city: "Naples"}, {city: "Rome"}]}), ["Rome", "", "Naples"]);
});

/* ---------- the JSON Schema ---------- */

test("the JSON Schema has every field of the table, and the same required ones", () => {
  const schema = tripSchema();
  assert.deepEqual(Object.keys(schema.properties), Object.keys(FIELDS.trip));
  assert.deepEqual(schema.required, ["format", "title", "days"]);
  for(const kind of Object.keys(FIELDS).filter(k => k !== "trip")){
    assert.deepEqual(Object.keys(schema.$defs[kind].properties), Object.keys(FIELDS[kind]), kind);
  }
  assert.equal(schema.properties.format.const, FORMAT);
  assert.equal(JSON.parse(JSON.stringify(schema)).$defs.stop.properties.lat.maximum, 90);
});

/* ---------- the old format ---------- */

const old = () => ({
  format: FORMAT_1, id: "rome-2027", title: "Rome", lang: "it",
  version: {id: "0123456789abcdef", parents: [], history: []},
  places: {rome: {name: "Roma", glyph: "R", color: "#b8451b"}, naples: {name: "Napoli", color: "#2f6fb0"}},
  stays: {h: {name: "Hotel Roma", place: "rome", query: "Hotel Roma, Via Cavour", note: "Check-in 14:00", dates: "10 → 11"}},
  map: {googleMapsKey: "invented-test-key-old"},
  days: [
    {date: "2027-04-10", place: "rome", stay: "h", title: "Day one", reminders: ["Book"], note: "If it rains", zoneNames: ["Z"], mapSplitKm: 5,
      stops: [{id: "colosseo", time: "09:00", title: "Colosseum", query: "Colosseo, Roma", mapLabel: "C", lat: 41.89, lng: 12.49, tag: "Booked"}]},
    {date: "2027-04-11", place: "naples", from: "rome", stayText: "Night train", title: "Day two",
      plans: [{id: "a", name: "A", stops: [{time: "10:00", title: "X", travel: "train"}]}, {id: "b", name: "B", stops: [{time: "11:00", title: "Y"}]}]}
  ],
  info: [{title: "Help", rows: [{label: "Police", number: "112"}, {label: "Bus", text: "Tickets", number: "+39 06"}]}],
  infoNote: "Have fun"
});

test("a file in the old format becomes a valid one, losing only map settings", () => {
  const t = upgrade(old());
  assert.deepEqual(validateTrip(t).errors, []);
  assert.deepEqual(validateTrip(t).warnings, ["days[1]: no stop has lat/lng: this day has no map"]);
  assert.equal(t.format, FORMAT);
  assert.deepEqual([t.id, t.version.id, t.googleMapsKey], ["rome-2027", "0123456789abcdef", "invented-test-key-old"]);
  assert.deepEqual(t.days[0].stay, {name: "Hotel Roma", address: "Hotel Roma, Via Cavour", note: "Check-in 14:00"});
  assert.deepEqual(t.days[0].notes, ["Book", "If it rains"]);
  assert.deepEqual(t.days[0].stops[0], {id: "colosseo", time: "09:00", title: "Colosseum", tag: "Booked", address: "Colosseo, Roma", lat: 41.89, lng: 12.49});
  assert.deepEqual([t.days[1].city, t.days[1].stay, t.days[1].plans[0].id], ["Napoli", "Night train", "a"]);
  assert.deepEqual(t.info[0].items, [{label: "Police", text: "112"}, {label: "Bus", text: "+39 06 · Tickets"}]);
  assert.deepEqual(t.info[1], {title: "Note", items: [{label: "Nota", text: "Have fun"}]});
  assert.deepEqual(upgrade(old()), t, "the same on every device");
  assert.equal(upgrade(t), t, "a file in the new format is left as it is");
  assert.ok(hasError(validateTrip(old()).errors, "old format"));
});

test("basedOn: where a copy came from, checked; written by the app", () => {
  const base = JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));
  assert.ok(validateTrip({...base, basedOn: {url: "https://share.example/t/abc", title: "Lisbon", by: "fra"}}).ok);
  assert.ok(validateTrip({...base, basedOn: {url: "http://localhost:8787/t/abc", title: "Lisbon", by: "fra"}}).ok, "a service on this machine, while developing");
  const bad = validateTrip({...base, basedOn: {url: "http://share.example/t/abc", title: "Lisbon"}});
  assert.ok(!bad.ok);
  assert.ok(bad.errors.some(e => e.startsWith("basedOn.url")) && bad.errors.some(e => e.startsWith("basedOn.by")));
});
