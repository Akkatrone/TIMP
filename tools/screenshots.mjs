#!/usr/bin/env node
// Retakes the screenshots used in the README, from the example trip.
//   node tools/screenshots.mjs
//
// Needs Chrome or Chromium on this computer (see tools/lib/browser.mjs) and a
// connection, for the map tiles. Only the example trip is ever loaded, so no
// private data can end up in a picture.

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ROOT } from "./lib/app-files.mjs";
import { withApp } from "./lib/browser.mjs";

const OUT = join(ROOT, "docs", "screenshots");

await withApp(async ({run, until, theme, capture}) => {
  const shoot = async name => {
    // No message bubble and no focus ring left over from the clicks.
    await run(`document.getElementById("toast").hidden = true; if(document.activeElement) document.activeElement.blur(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`);
    await writeFile(join(OUT, name), await capture());
    console.log("  docs/screenshots/" + name);
  };
  // Puts the title of the day just under the strip of days, as after a short scroll.
  const scrollToTitle = `scrollTo(0, document.querySelector(".dayhead h1").getBoundingClientRect().top + scrollY - document.querySelector(".strip").offsetHeight - 14);`;

  await mkdir(OUT, {recursive: true});
  console.log("Writing:");

  // 1. The programme of a day: one stop done, one skipped, one opened with its zones.
  await run(`document.querySelector('[data-act="demo"]').click();`);
  await until("the example trip", `document.querySelectorAll("[data-tick]").length > 1`);
  const open = i => `document.querySelectorAll("[data-open]")[${i}].click(); await new Promise(r => setTimeout(r, 80));`;
  await run(`document.querySelectorAll("[data-tick]")[0].click(); await new Promise(r => setTimeout(r, 80)); ${open(1)} document.querySelector(".stop.open [data-skip]").click(); await new Promise(r => setTimeout(r, 80)); ${open(1)} ${open(2)} scrollTo(0, 0);`);
  await shoot("programme.png");

  // 2. The interactive map of day 2: train and ferry icons, two stops behind you dashed.
  await run(`location.hash = "#day-2";`);
  await until("day 2", `document.querySelectorAll(".stop").length === 7`);
  await run(`for(const i of [0, 1]) document.querySelectorAll("[data-tick]")[i].click(); document.querySelector("[data-map]").click(); document.querySelector('[data-view="live"]').click();`);
  await until("the map drawn", `document.querySelector(".live .canvas[data-ready]")`, 40000);
  await run(scrollToTitle);
  await new Promise(r => setTimeout(r, 600)); // tiles fade in
  await shoot("map.png");

  // 3. The sketch that replaces it offline.
  await run(`document.querySelector('[data-view="schema"]').click(); ${scrollToTitle}`);
  await until("the sketch", `document.querySelector(".mapsvg")`);
  await shoot("sketch.png");

  // 4. A stop added from a Google Maps link (an invented place), with how you get there.
  const PLACE = "https://www.google.com/maps/place/Pastelaria+Exemplo,+Rua+Augusta+10,+Lisboa/@38.7101,-9.1375,18z/data=!4m6!3m5!1s0x0:0x0!8m2!3d38.71012!4d-9.13751";
  await run(`document.querySelector("[data-map]").click(); location.hash = "#day-1";`);
  await until("day 1", `document.querySelectorAll(".stop").length === 6`);
  await run(`document.querySelector(".fab").click();`);
  await until("the form", `document.querySelector("dialog.sheet[open]")`);
  await run(`const el = document.getElementById("stop-src"); el.value = ${JSON.stringify(PLACE)}; el.dispatchEvent(new Event("change")); document.getElementById("stop-hh").value = "12"; document.getElementById("stop-mm").value = "15"; document.querySelector('[data-travel="metro"]').click(); document.getElementById("stop-text").value = "Custard tarts at the counter, three minutes from the square.";`);
  await shoot("new-stop.png");
  await run(`document.querySelector(".sheet form").requestSubmit(); await new Promise(r => setTimeout(r, 400));`);

  // 5. What the trip costs, at the end of Info: in dollars (the phone is en-US), at the
  //    rate of today for days still to come.
  await run(`location.hash = "#info";`);
  await until("the costs", `document.querySelector("[data-costs]")`);
  await run(`const d = document.querySelector("[data-costs]"); if(!d.open) d.querySelector("summary").click();`);
  await until("the summary", `document.querySelector(".chero")`);
  await until("the rates", `!document.querySelector(".chero .big").textContent.includes("NaN") && !document.querySelector(".costsbody .warnline")`, 20000).catch(() => {});
  await run(`scrollTo(0, document.querySelector("[data-costs]").getBoundingClientRect().top + scrollY - document.querySelector(".strip").offsetHeight - 14);`);
  await shoot("costs.png");

  // 6. A day with alternative plans, in the dark theme.
  await theme("dark");
  await run(`location.hash = "#day-3";`);   // the map was closed before the new stop
  await until("day 3", `document.querySelector("[data-plan]")`);
  await run(`scrollTo(0, 0);`);
  await shoot("plans-dark.png");

  // 7. Trips, in the dark theme: the version, and the reminder to save the changed trip.
  await run(`location.hash = "#trips";`);
  await until("the trips page", `document.querySelector(".unsaved")`);
  await run(`scrollTo(0, 0);`);
  await shoot("trips-dark.png");
}).catch(e => { console.error(e.message); process.exit(1); });
