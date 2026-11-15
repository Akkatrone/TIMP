#!/usr/bin/env node
// Checks a trip file before it goes on a phone.
//   node tools/validate-trip.mjs path/to/my-trip.json
//   node tools/validate-trip.mjs --map path/to/my-trip.json
//
// --map also prints how each day's stops group into map zones, with the size of
// each zone in km. A wrong coordinate shows up there as an unexpected extra zone
// or as a zone far larger than a day on foot.

import { readFileSync } from "node:fs";
import { validateTrip } from "../js/trip.js";
import { zonesOf, distKm } from "../js/geo.js";

const args = process.argv.slice(2);
const showMap = args.includes("--map");
const files = args.filter(a => a !== "--map");
if(!files.length){
  console.error("Usage: node tools/validate-trip.mjs [--map] <trip.json> [more.json ...]");
  process.exit(2);
}

function zoneLine(z){
  let span = 0;
  z.pts.forEach(a => z.pts.forEach(b => { span = Math.max(span, distKm(a.ll, b.ll)); }));
  const size = span < 1 ? Math.round(span * 1000) + " m" : span.toFixed(1) + " km";
  return `${z.name || z.pts[0].name}: ${z.pts.filter(p => !p.ref).length} pins, ${size} across`;
}

function printMap(trip){
  trip.days.forEach((d, i) => {
    const lists = d.plans ? d.plans.map(p => [p, p.stops, ` [${p.name}]`]) : [[null, d.stops, ""]];
    lists.forEach(([plan, stops, label]) => {
      const zones = zonesOf(d, plan, stops);
      const without = stops.filter(s => s.lat === undefined).length;
      const head = `  day ${i + 1} ${d.date}${label}`;
      if(!zones.length){ console.log(`${head}: no map (no stop has coordinates)`); return; }
      console.log(`${head}: ${zones.map(zoneLine).join(" | ")}${without && !d.mapZones ? ` (${without} stops without a pin)` : ""}`);
    });
  });
}

let failed = false;
for(const file of files){
  let trip;
  try{
    trip = JSON.parse(readFileSync(file, "utf8"));
  }catch(e){
    console.error(`${file}: not readable as JSON (${e.message})`);
    failed = true;
    continue;
  }
  const {ok, errors, warnings} = validateTrip(trip);
  warnings.forEach(w => console.warn(`${file}: warning: ${w}`));
  errors.forEach(e => console.error(`${file}: error: ${e}`));
  if(ok){
    const stops = trip.days.reduce((n, d) => n + (d.stops ? d.stops.length : d.plans.reduce((m, p) => m + p.stops.length, 0)), 0);
    console.log(`${file}: OK (${trip.days.length} days, ${stops} stops${warnings.length ? `, ${warnings.length} warnings` : ""})`);
    if(showMap) printMap(trip);
  }else{
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
