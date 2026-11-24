// The weather of a day and of its stops (js/weather.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeOf, localHours, dayWeather, stopWeather } from "../js/weather.js";

// A day in Lisbon (UTC+1 in May): by the hour from 8:00 local, then 6 hours at night.
const hour = (h, more = {}) => ({t: new Date(Date.UTC(2027, 4, 15, h - 1)).toISOString(), h: 1, temp: 15 + h / 4, wind: 3, rain: 0, sky: "fair_day", ...more});
const FORECAST = {hours: [hour(8), hour(9), hour(14), hour(15, {rain: 1.6, sky: "rain"}), hour(16, {sky: "cloudy"}), hour(19, {wind: 12}),
  {t: new Date(Date.UTC(2027, 4, 15, 20)).toISOString(), h: 6, temp: 12, wind: 2, rain: 0, sky: "clearsky_night"}]};
const hours = localHours(FORECAST, "Europe/Lisbon");

test("a place to ask: rounded to about 10 km", () => {
  assert.equal(placeOf(38.7139, -9.1334), "38.7,-9.1");
});

test("the day's head: lowest and highest, and the worst sky of the day", () => {
  assert.deepEqual(hours.slice(0, 2).map(x => [x.date, x.from, x.to]), [["2027-05-15", 480, 540], ["2027-05-15", 540, 600]]);
  assert.deepEqual(dayWeather(hours, "2027-05-15"), {min: 12, max: 20, kind: "rain"});
  assert.equal(dayWeather(hours, "2027-05-19"), null, "no hours that day: nothing");
});

test("a stop outdoors at its time warns; indoors, or dry, it does not", () => {
  const D = "2027-05-15";
  assert.deepEqual(stopWeather(hours, D, {type: "park", time: "15:00"}), {kind: "rain", at: 900});
  assert.equal(stopWeather(hours, D, {type: "museum", time: "15:00"}), null, "a museum in the rain");
  assert.equal(stopWeather(hours, D, {type: "park", time: "09:00"}), null, "dry at 9");
  assert.deepEqual(stopWeather(hours, D, {type: "view", time: "afternoon"}), {kind: "rain", at: 900}, "a part of the day: its window");
  assert.deepEqual(stopWeather(hours, D, {type: "view", time: "19:00"}), {kind: "wind", at: 1140});
  assert.deepEqual(stopWeather(hours, D, {type: "walk"}), {kind: "rain", at: 900}, "all day: 9 to 19");
});
