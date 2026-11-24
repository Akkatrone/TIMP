// The weather of a day and of its stops (design/README.md, WX1–WX7): the forecast of a
// place (the service's /v1/weather, from MET Norway) read on the trip's clock, for the
// day's head and the signals of the stops outdoors. No DOM, no network.

import { minutesOf, partOf, windowOf } from "./parts.js";

/** Today and the next 3 days: further away a forecast is not trusted (WX4). */
export const AHEAD = 3;
/** Kinds of places outdoors, where the weather changes something (WX2). */
export const OUTDOORS = new Set(["park", "view", "walk"]);

/** The place to ask: about 10 km, enough for the weather and nothing more (WX7). */
export const placeOf = (lat, lng) => `${(+lat).toFixed(1)},${(+lng).toFixed(1)}`;

// The sky as a kind, the worst first (MET Norway's symbol codes).
const KINDS = [["storm", /thunder/], ["snow", /snow|sleet/], ["rain", /rain/], ["fog", /fog/], ["cloud", /cloudy/], ["sun", /./]];
const kindOf = sky => KINDS.find(([, re]) => re.test(sky))[0];
const worst = kinds => KINDS.find(([k]) => kinds.includes(k))[0];

/** The forecast's hours on the clock of `timezone`: each with its date and minutes [from, to). */
export function localHours(forecast, timezone){
  const f = new Intl.DateTimeFormat("en-CA", {timeZone: timezone || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
  return forecast.hours.map(x => {
    const p = Object.fromEntries(f.formatToParts(new Date(x.t)).map(q => [q.type, q.value]));
    const from = +p.hour * 60 + +p.minute;
    return {...x, date: `${p.year}-${p.month}-${p.day}`, from, to: from + x.h * 60};
  });
}

/** The day's head (WX1): {min, max, kind}, the kind the worst from 8:00 to 20:00; null without hours that day. */
export function dayWeather(hours, date){
  const xs = hours.filter(x => x.date === date);
  if(!xs.length) return null;
  const temps = xs.map(x => x.temp), light = xs.filter(x => x.to > 480 && x.from < 1200);
  return {min: Math.round(Math.min(...temps)), max: Math.round(Math.max(...temps)), kind: worst((light.length ? light : xs).map(x => kindOf(x.sky)))};
}

// What changes something outdoors, the most important first (WX2).
const WARN = [["storm", x => /thunder/.test(x.sky)], ["rain", x => x.rain / x.h >= 1], ["wind", x => x.wind >= 10], ["heat", x => x.temp >= 35], ["cold", x => x.temp <= -5]];

/**
 * What the weather says of a stop outdoors at its time: its clock time and the hour
 * after, its part of the day, or, with no time, the day from 9:00 to 19:00. {kind, at}
 * (minutes) or null.
 */
export function stopWeather(hours, date, stop, light){
  if(!OUTDOORS.has(stop.type)) return null;
  const c = minutesOf(stop.time, light), p = partOf(stop.time);
  const [a, b] = p ? windowOf(p, light) : c !== null ? [c, c + 60] : [540, 1140];
  const xs = hours.filter(x => x.date === date && x.to > a && x.from < b);
  for(const [kind, test] of WARN){ const x = xs.find(test); if(x) return {kind, at: Math.max(a, x.from)}; }
  return null;
}
