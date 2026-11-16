import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateTrip, FORMAT } from "../js/trip.js";

const demo = () => JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));

const minimal = () => ({
  format: FORMAT,
  id: "rome-2027",
  title: "Rome",
  places: {rome: {name: "Roma", color: "#b8451b"}},
  days: [{date: "2027-04-10", place: "rome", title: "Day one", stops: [{time: "09:00", title: "Colosseum", lat: 41.8902, lng: 12.4922}]}]
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
  assert.equal(res.ok, true);
});

test("the smallest trip from the documentation is valid", () => {
  assert.deepEqual(validateTrip(minimal()).errors, []);
});

test("things that are not a trip are refused without throwing", () => {
  for(const junk of [null, 42, "trip", [], {}, {format: FORMAT}, {days: "tomorrow"}, {format: FORMAT, places: [], days: [null], stays: 3, info: [1]}]){
    assert.equal(validateTrip(junk).ok, false);
  }
});

test("format, id and title are required", () => {
  assert.ok(hasError(errorsAfter(t => { t.format = "travel-in-my-pocket/2"; }), "format"));
  assert.ok(hasError(errorsAfter(t => { t.id = "Rome 2027"; }), "id"));
  assert.ok(hasError(errorsAfter(t => { delete t.title; }), "title"));
});

test("a day must point to places and stays that exist", () => {
  assert.ok(hasError(errorsAfter(t => { t.days[0].place = "milan"; }), "days[0].place"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].from = "milan"; }), "days[0].from"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stay = "hotel"; }), "days[0].stay"));
  assert.ok(hasError(errorsAfter(t => { t.stays = {h: {name: "H", place: "milan"}}; }), "stays.h.place"));
});

test("dates must be real and ascending", () => {
  assert.ok(hasError(errorsAfter(t => { t.days[0].date = "2027-02-30"; }), "days[0].date"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].date = "10/04/2027"; }), "days[0].date"));
  assert.ok(hasError(errorsAfter(t => { t.days.push({...t.days[0]}); }), "days[1].date"));
});

test("a day has stops or plans, never both and never neither", () => {
  assert.ok(hasError(errorsAfter(t => { delete t.days[0].stops; }), "either"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].plans = [{id: "a", name: "A", stops: t.days[0].stops}, {id: "b", name: "B", stops: t.days[0].stops}]; }), "either"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].plans = [{id: "a", name: "A", stops: t.days[0].stops}]; delete t.days[0].stops; }), "at least two"));
});

test("coordinates come in pairs and inside the globe", () => {
  assert.ok(hasError(errorsAfter(t => { delete t.days[0].stops[0].lng; }), "together"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].lat = 141.89; }), "stops[0].lat"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].lng = "12.49"; }), "stops[0].lng"));
});

test("travel is one of the four ways the app can draw", () => {
  assert.deepEqual(errorsAfter(t => { t.days[0].stops[0].travel = "train"; }), []);
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].travel = "bus"; }), "stops[0].travel"));
  assert.ok(hasError(errorsAfter(t => { t.days[0].stops[0].travel = "Train"; }), "stops[0].travel"));
});

test("stop ids are unique within a list", () => {
  const errors = errorsAfter(t => { t.days[0].stops = [{id: "a", time: "1", title: "A"}, {id: "a", time: "2", title: "B"}]; });
  assert.ok(hasError(errors, "used twice"));
});

test("colours must be #rrggbb: nothing else can reach the page's styles", () => {
  assert.ok(hasError(errorsAfter(t => { t.places.rome.color = "red"; }), "places.rome.color"));
  assert.ok(hasError(errorsAfter(t => { t.places.rome.color = "#fff;background:url(//evil)"; }), "places.rome.color"));
  assert.ok(hasError(errorsAfter(t => { t.places.rome.colorDark = "var(--x)"; }), "places.rome.colorDark"));
});

test("embedded pictures must be png, jpeg or webp data URIs", () => {
  const image = src => t => { t.days[0].mapImages = [{src, width: 10, height: 10, pins: ["Colosseum"]}]; };
  assert.deepEqual(errorsAfter(image("data:image/png;base64,iVBORw0KGgo=")), []);
  assert.ok(hasError(errorsAfter(image("https://example.com/map.png")), "mapImages[0].src"));
  assert.ok(hasError(errorsAfter(image("data:image/svg+xml;base64,PHN2Zz4=")), "mapImages[0].src"));
  assert.ok(hasError(errorsAfter(image("javascript:alert(1)")), "mapImages[0].src"));
});

test("map zones need at least one real point", () => {
  const zone = points => t => { t.days[0].mapZones = [{name: "Z", points}]; };
  assert.deepEqual(errorsAfter(zone([{name: "A", lat: 1, lng: 1}, {name: "Ref", lat: 2, lng: 2, reference: true}])), []);
  assert.ok(hasError(errorsAfter(zone([{name: "Ref", lat: 2, lng: 2, reference: true}])), "not a reference"));
  assert.ok(hasError(errorsAfter(zone([{name: "A", lat: 1}])), "points[0].lng"));
});

test("info rows need a label and some content", () => {
  assert.deepEqual(errorsAfter(t => { t.info = [{title: "Help", rows: [{label: "Police", number: "112"}]}]; }), []);
  assert.ok(hasError(errorsAfter(t => { t.info = [{title: "Help", rows: [{label: "Police"}]}]; }), "info[0].rows[0]"));
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
