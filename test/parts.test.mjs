// Parts of the day (js/parts.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { PARTS, partOf, windowOf, minutesOf, clockOfTime, atTime } from "../js/parts.js";
import { setLang } from "../js/i18n.js";

test("seven parts, in the order of a day", () => {
  assert.deepEqual(PARTS, ["sunrise", "morning", "midday", "afternoon", "sunset", "evening", "night"]);
});

test("the fixed words, and words of before in several languages, name their part", () => {
  for(const p of PARTS) assert.equal(partOf(p), p);
  assert.equal(partOf("Evening"), "evening");
  assert.equal(partOf("Pomeriggio"), "afternoon");
  assert.equal(partOf("pranzo"), "midday");
  assert.equal(partOf("Lunch"), "midday");
  assert.equal(partOf("Tramonto"), "sunset");
  assert.equal(partOf("Après-midi"), "afternoon");
  assert.equal(partOf("Mañana"), "morning");
  assert.equal(partOf("夕方"), "sunset");
  assert.equal(partOf("09:30"), null, "a clock time is not a part");
  assert.equal(partOf("after the museum"), null, "an unknown word stays what it is");
  assert.equal(partOf(undefined), null);
});

test("each part has its window; sunrise and sunset at their real time", () => {
  assert.deepEqual(windowOf("midday"), [720, 870]);
  const light = {sunrise: 420, sunset: 1230};
  assert.deepEqual(windowOf("sunset", light), [1185, 1275]);
  assert.deepEqual(windowOf("sunrise", light), [390, 450]);
  for(const p of PARTS){ const [a, b] = windowOf(p, light); assert.ok(a < b, p); }
  // In the order of a day.
  const starts = PARTS.map(p => windowOf(p, light)[0]);
  assert.deepEqual([...starts].sort((x, y) => x - y), starts);
});

test("a time's place in the day: a clock time, or its part's start", () => {
  assert.equal(minutesOf("09:30"), 570);
  assert.equal(clockOfTime("9.05"), 545);
  assert.equal(minutesOf("evening", {sunrise: 400, sunset: 1200}), 1245);
  assert.equal(minutesOf("Sera", {sunrise: 400, sunset: 1200}), 1245);
  assert.equal(minutesOf("whenever"), null);
});

test("the format: a clock time or a part is fine, a word of before too; another word warns", async () => {
  const { validateTrip } = await import("../js/trip.js");
  const trip = time => ({format: "travel-in-my-pocket/2", title: "T", days: [{date: "2027-04-10", stops: [{title: "A", time, lat: 1, lng: 1}]}]});
  for(const t of ["09:30", "sunset", "Evening", "Pranzo"]) assert.deepEqual(validateTrip(trip(t)).warnings, [], t);
  assert.match(validateTrip(trip("after the museum")).warnings.join(), /days\[0\]\.stops\[0\]\.time: should be/);
});

test("a time inside a sentence: a clock time after \"at\", a part of the day as the language says it", () => {
  globalThis.document ??= {documentElement: {}};   // setLang marks the page's language
  setLang("it");
  assert.equal(atTime("12:30"), "alle 12:30");
  assert.deepEqual(PARTS.map(atTime), ["all'alba", "al mattino", "a mezzogiorno", "nel pomeriggio", "al tramonto", "di sera", "di notte"]);
  assert.equal(atTime("Pranzo"), "a mezzogiorno", "a word of before, as its part");
  setLang("en");
  assert.equal(atTime("afternoon"), "in the afternoon");
  assert.equal(atTime("09:00"), "at 09:00");
});
