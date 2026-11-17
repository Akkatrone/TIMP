import { test } from "node:test";
import assert from "node:assert/strict";
import { sunTimes, daylight, partsOfDay } from "../js/sun.js";
import { clockMinutes } from "../js/edit.js";

const hm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const near = (actual, expected, label) => {
  const [h, m] = expected.split(":").map(Number);
  assert.ok(Math.abs(actual - (h * 60 + m)) <= 3, `${label}: ${hm(actual)}, expected about ${expected}`);
};

test("sunrise and sunset are right to a few minutes, on the trip's own clock", () => {
  // Reference times, rounded, from published almanacs; the formulas agree to a few minutes.
  const lisbon = daylight("2027-05-14", 38.7075, -9.1364, "Europe/Lisbon");
  near(lisbon.sunrise, "06:26", "Lisbon sunrise"); near(lisbon.sunset, "20:38", "Lisbon sunset");
  const rome = daylight("2027-12-21", 41.9028, 12.4964, "Europe/Rome");
  near(rome.sunrise, "07:34", "Rome sunrise"); near(rome.sunset, "16:42", "Rome sunset");
  const tokyo = daylight("2026-12-02", 35.6812, 139.7671, "Asia/Tokyo");
  near(tokyo.sunrise, "06:33", "Tokyo sunrise"); near(tokyo.sunset, "16:28", "Tokyo sunset");
  const sydney = daylight("2027-01-15", -33.8688, 151.2093, "Australia/Sydney");
  near(sydney.sunrise, "05:59", "Sydney sunrise"); near(sydney.sunset, "20:09", "Sydney sunset");
});

test("no sunrise or no sunset near the poles, and no answer without a place", () => {
  assert.equal(sunTimes("2027-06-21", 69.65, 18.96), null, "midnight sun in Tromsø");
  assert.equal(sunTimes("2027-12-21", 69.65, 18.96), null, "polar night");
  assert.equal(sunTimes("2027-06-21", undefined, 12), null);
  assert.equal(daylight("2027-06-21", 41.9, 12.5, "Not/AZone"), null, "a time zone the phone does not know");
});

test("each stop's part of the day: clock times against the sun, words, or the stop before", () => {
  const light = {sunrise: 7 * 60, sunset: 17 * 60};   // noon at 12:00
  const stops = ["06:30", "09:00", undefined, "13:00", "Lunch", "16:59", "17:00", "Cena", undefined].map(time => ({time}));
  assert.deepEqual(partsOfDay(stops, light, clockMinutes),
    ["night", "morning", "morning", "afternoon", "afternoon", "afternoon", "night", "night", "night"]);
  assert.deepEqual(partsOfDay([{time: "Evening"}, {time: "Morning"}], null, clockMinutes), ["night", "morning"]);
});
