#!/usr/bin/env node
// Checks the app in a real browser, with the example trip: what the unit tests cannot see.
//   node tools/e2e.mjs
//
// Needs Chrome or Chromium on this computer (see tools/lib/browser.mjs).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withApp } from "./lib/browser.mjs";
import { prepare } from "../js/trips.js";
import { commit, relation, commonBase, commitMerge } from "../js/version.js";
import { mergeTrips } from "../js/merge.js";
import { addStop } from "../js/edit.js";
import { splitPrivate } from "../js/private.js";

let passed = 0;
async function step(name, fn){
  try{
    await fn();
    passed++;
    console.log("  ✔ " + name);
  }catch(e){
    console.error("  ✖ " + name + "\n    " + String(e.message).split("\n").join("\n    "));
    throw e;
  }
}

await withApp(async ({run, until, reload, blocked}) => {
  const count = sel => run(`return document.querySelectorAll(${JSON.stringify(sel)}).length;`);
  const text = sel => run(`const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : null;`);
  // What is done and skipped, without the day's cost after it.
  const progress = () => run(`const p = document.querySelector(".progress").cloneNode(true); const c = p.querySelector(".daycost"); if(c) c.remove(); return p.textContent.replace(/ · $/, "");`);
  const click = (sel, i = 0) => run(`document.querySelectorAll(${JSON.stringify(sel)})[${i}].click(); await new Promise(r => setTimeout(r, 60));`);

  await step("the example trip opens on its first day", async () => {
    await click('[data-act="demo"]');
    await until("the stops", `document.querySelectorAll(".stop").length === 6`);
    assert.equal(await run(`return document.documentElement.lang;`), "en");
  });

  await step("the bar of days gets an edge once the page scrolls under it", async () => {
    assert.equal(await run(`return document.querySelector(".strip").classList.contains("scrolled");`), false);
    await run(`window.scrollTo(0, 300); await new Promise(r => setTimeout(r, 200));`);
    assert.equal(await run(`return document.querySelector(".strip").classList.contains("scrolled");`), true);
    await run(`window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));`);
  });

  await step("descriptions are folded, links stay visible", async () => {
    assert.equal(await count(".desc.clamp"), await count(".desc"));
    assert.ok(await count(".stop.cut") > 0, "at least one description is cut short at phone width");
    assert.equal(await run(`return [...document.querySelectorAll(".stop .maplink, .stop .more, .stop .tick")].every(e => e.offsetParent !== null);`), true);
    assert.equal(await run(`return [...document.querySelectorAll(".stop .meta")].every(m => m.getBoundingClientRect().height < 30);`), true, "the links fit on one line");
  });

  await step("tapping a description opens that one only", async () => {
    const all = await count(".desc");
    await click("[data-open]", 0);
    assert.equal(await run(`return document.querySelector("[data-open]").getAttribute("aria-expanded");`), "true");
    assert.equal(await count(".desc.clamp"), all - 1);
    await click("[data-open]", 0);
    assert.equal(await count(".desc.clamp"), all);
  });

  await step("the button above the stops opens and folds them all", async () => {
    await click("[data-expand]");
    assert.equal(await count(".desc.clamp"), 0);
    assert.equal(await run(`return document.querySelector("[data-expand]").getAttribute("aria-pressed");`), "true");
    await click("[data-expand]");
    assert.equal(await count(".desc.clamp"), await count(".desc"));
  });

  await step("the ⋯ menu opens with Edit and Skip, and closes with Escape or a tap outside", async () => {
    assert.equal(await count(".menu:not([hidden])"), 0);
    await click(".stop [data-more]", 0);
    assert.equal(await count(".menu:not([hidden])"), 1);
    assert.deepEqual(await run(`return [...document.querySelectorAll(".menu:not([hidden]) [role=menuitem]")].map(b => b.textContent);`), ["Edit", "Skip"]);
    assert.equal(await run(`return document.activeElement.textContent;`), "Edit", "the first item takes the focus");
    await run(`document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));`);
    assert.equal(await count(".menu:not([hidden])"), 0);
    assert.equal(await run(`return document.activeElement.dataset.more !== undefined;`), true, "the focus goes back to ⋯");
    await click(".stop [data-more]", 0);
    await run(`document.querySelector("h1").click();`);
    assert.equal(await count(".menu:not([hidden])"), 0);
  });

  await step("a stop can be skipped and restored", async () => {
    await click("[data-skip]", 2);
    assert.equal(await count(".stop.skipped"), 1);
    assert.equal(await text(".stop.skipped [data-skip]"), "Restore");
    assert.equal(await progress(), "0/6 done · 1 skipped");
    await click(".stop.skipped [data-skip]");
    assert.equal(await count(".stop.skipped"), 0);
    await click("[data-skip]", 2);
  });

  await step("done and skipped are separate, and done wins", async () => {
    await click("[data-tick]", 0);
    assert.equal(await progress(), "1/6 done · 1 skipped");
    assert.equal(await run(`return !!document.querySelector(".stop.done [data-skip]");`), false);
    await click(".stop.skipped [data-tick]");
    assert.equal(await count(".stop.skipped"), 0);
    assert.equal(await progress(), "2/6 done");
    await click(".stop:nth-child(2) [data-skip]"); // now: stops 1 and 3 done, stop 2 skipped
  });

  await step("the sketch draws done stops dashed and takes skipped ones off the route", async () => {
    await click("[data-map]");
    await click('[data-view="schema"]');
    await until("the sketch", `document.querySelector(".mapsvg")`);
    assert.equal(await count(".mapsvg .badge"), 5);
    assert.equal(await count(".mapsvg .badge.gone"), 3);   // pins 1, 2, 3
    assert.equal(await count(".mapsvg .route"), 3);        // 1→3 (2 is skipped), 3→4, 4→6
    assert.equal(await count(".mapsvg .route.gone"), 1);   // the leg arriving at 3, done
  });

  await step("the interactive map does the same, and keeps the map when a stop is ticked", async () => {
    await click('[data-view="live"]');
    await until("the map", `document.querySelector(".live .maplibregl-map") && document.querySelectorAll(".live .pin").length === 5`);
    assert.equal(await count(".live .pin.gone"), 3);
    // A map drawn by the phone has no elements to count: it says what it draws.
    const lines = `+document.querySelector(".live .canvas").dataset.legs`;
    assert.equal(await run(`return ${lines};`), 3);
    assert.equal(await run(`return +document.querySelector(".live .canvas").dataset.dashed;`), 1);
    await run(`window.__map = document.querySelector(".live");`);
    await click("[data-tick]", 3);
    assert.equal(await run(`return window.__map === document.querySelector(".live");`), true);
    assert.equal(await count(".live .pin.gone"), 4);
    // Restoring the skipped stop puts it back on the route: the map is drawn again.
    await click(".stop.skipped [data-skip]");
    await until("the route through stop 2", `${lines} === 4`);
    await click(".stop:nth-child(2) [data-skip]");
    await until("the route past stop 2", `${lines} === 3`);
    // Under the open map, ⋯ and Edit leave the page where it is: it used to jump up by
    // the map's height, from the second time on.
    for(let round = 0; round < 3; round++){
      await run(`const b = [...document.querySelectorAll("[data-more]")].pop(); b.scrollIntoView({block: "center"}); await new Promise(r => setTimeout(r, 150)); window.__y = window.scrollY;`);
      assert.ok(await run(`return window.__y > 0;`), "the page is scrolled");
      await run(`[...document.querySelectorAll("[data-more]")].pop().click(); await new Promise(r => setTimeout(r, 300));`);
      assert.equal(await run(`return window.scrollY - window.__y;`), 0, "⋯ does not scroll the page");
      await run(`document.querySelector(".menu:not([hidden]) [data-edit]").click(); await new Promise(r => setTimeout(r, 400));`);
      assert.equal(await run(`return window.scrollY - window.__y;`), 0, "Edit does not scroll the page");
      await run(`document.querySelector("dialog.sheet [data-close]").click(); await new Promise(r => setTimeout(r, 300));`);
      assert.equal(await run(`return window.scrollY - window.__y;`), 0, "closing the form does not scroll the page");
    }
    await run(`window.scrollTo(0, 0);`);
    await click("[data-map]");
  });

  await step("what was ticked and skipped survives a reload", async () => {
    await reload();
    await until("the stops", `document.querySelectorAll(".stop").length === 6`);
    assert.equal(await progress(), "3/6 done · 1 skipped");
  });

  await step("the interface language can be chosen on the device", async () => {
    await run(`location.hash = "#me";`);
    await until("the trips page", `document.querySelector('[data-lang="it"]')`);
    await click('[data-lang="it"]');
    assert.equal(await run(`return document.documentElement.lang;`), "it");
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelector("[data-skip]")`);
    assert.equal(await text(".stop:not(.skipped):not(.done) [data-skip]"), "Salta");
    await reload();
    assert.equal(await run(`return document.documentElement.lang;`), "it");
    await run(`location.hash = "#me";`);
    await until("the trips page", `document.querySelector('[data-lang="auto"]')`);
    await click('[data-lang="auto"]');
    assert.equal(await run(`return document.documentElement.lang;`), "en");
  });

  await step("stops reached by metro, train, plane or boat show it, in the list and on both maps", async () => {
    await run(`location.hash = "#day-2";`);
    await until("day 2", `document.querySelectorAll(".stop").length === 7`);
    assert.deepEqual(await run(`return [...document.querySelectorAll(".stop .tvchip")].map(e => e.getAttribute("aria-label"));`), ["Train", "Boat"]);
    await run(`if(document.querySelector("[data-map]").getAttribute("aria-expanded") !== "true") document.querySelector("[data-map]").click(); document.querySelector('[data-view="schema"]').click();`);
    await until("the sketch", `document.querySelector(".mapsvg")`);
    assert.equal(await count(".mapsvg .tv"), 2);
    await click('[data-view="live"]');
    await until("the map", `document.querySelectorAll(".live .tvpin").length === 2`);
    assert.deepEqual(await run(`return [...document.querySelectorAll(".live .tvpin")].map(e => e.getAttribute("aria-label")).sort();`), ["Boat", "Train"]);
    await click("[data-map]");
  });

  await step("a journey without a pin shows its icon in the list", async () => {
    await run(`location.hash = "#day-3";`);
    await until("day 3", `document.querySelector('[data-plan="cascais"]')`);
    await click('[data-plan="cascais"]');
    assert.equal(await run(`return document.querySelector(".stop .tvchip").getAttribute("aria-label");`), "Train");
    await click('[data-plan="sintra"]');
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelectorAll(".stop").length === 6`);
  });

  await step("each kind of place has its icon, in the list and on the map's pins", async () => {
    // Day 1: two sights, a view, a sight, food, a view; the train stop has no kind.
    assert.deepEqual(await run(`return [...document.querySelectorAll(".stop .tychip")].map(e => e.getAttribute("aria-label"));`), ["Sight", "Sight", "View", "Sight", "Food", "View"]);
    await run(`if(document.querySelector("[data-map]").getAttribute("aria-expanded") !== "true") document.querySelector("[data-map]").click(); document.querySelector('[data-view="live"]').click();`);
    await until("the pins", `document.querySelectorAll(".live .pin").length === 5`);
    assert.equal(await count(".live .pin.typed svg"), 5);
    // Filled with the colour of their kind, shaded by the part of the day.
    assert.equal(await count(".live .pin.painted"), 5);
    const fills = await run(`return [...document.querySelectorAll(".live .pin")].map(p => p.style.getPropertyValue("--pf"));`);
    assert.ok(fills.every(f => /^#[0-9a-f]{6}$/.test(f)), fills.join(" "));
    assert.notEqual(fills[0], fills[2], "a sight and a view have different colours");
    // Sunrise and sunset worked out for Lisbon, and the stop after dark marked.
    assert.match(await text(".dayno .sun"), /^\d\d:\d\d–2\d:\d\d$/);
    assert.match(await run(`return document.querySelector(".dayno .sun").getAttribute("aria-label");`), /^Sunrise \d\d:\d\d · sunset 2\d:\d\d$/);
    assert.deepEqual(await run(`return [...document.querySelectorAll(".stop")].filter(li => li.querySelector(".nightmark")).map(li => li.querySelector("h3").textContent);`), ["Miradouro da Senhora do Monte"]);
    await click("[data-map]");
  });

  await step("the lines between the stops can be hidden on both maps, and the choice is kept", async () => {
    await run(`if(document.querySelector("[data-map]").getAttribute("aria-expanded") !== "true") document.querySelector("[data-map]").click(); document.querySelector('[data-view="live"]').click();`);
    const lines = `+(document.querySelector(".live .canvas") || {dataset: {}}).dataset.legs`;
    await until("the lines", `${lines} > 0`);
    // Hiding them keeps the map as it is: the same map, drawn once.
    await run(`window.__map = document.querySelector(".live .maplibregl-canvas");`);
    await click("[data-route]");
    await until("no lines", `${lines} === 0 && document.querySelectorAll(".live .pin").length === 5`);
    assert.equal(await run(`return document.querySelector("[data-route]").getAttribute("aria-pressed");`), "false");
    assert.equal(await run(`return document.querySelector(".live .maplibregl-canvas") === window.__map;`), true, "the map was not drawn again");
    await click("[data-route]");
    await until("the lines back", `${lines} > 0`);
    assert.equal(await run(`return document.querySelector(".live .maplibregl-canvas") === window.__map;`), true);
    await click("[data-route]");
    await until("no lines", `${lines} === 0`);
    await click('[data-view="schema"]');
    await until("the sketch", `document.querySelector(".mapsvg")`);
    assert.equal(await count(".mapsvg .route"), 0);
    await reload();
    await until("day 1", `document.querySelector("[data-route]")`);
    assert.equal(await run(`return document.querySelector("[data-route]").getAttribute("aria-pressed");`), "false", "kept after a reload");
    await click("[data-route]");
    assert.ok(await count(".mapsvg .route") > 0);
    await click("[data-map]");
  });

  await step("holding a stop's number shows it on the map; a tap does nothing", async () => {
    await run(`location.hash = "#day-1"; await new Promise(r => setTimeout(r, 200));`);
    await until("day 1", `document.querySelector('.nb[data-pin="2"]')`);
    if(await run(`return document.querySelector("[data-map]").getAttribute("aria-expanded") === "true";`)) await click("[data-map]");
    const press = (ms) => run(`const nb = document.querySelector('.nb[data-pin="2"]'); const r = nb.getBoundingClientRect(); const o = {bubbles: true, clientX: r.x + 4, clientY: r.y + 4, pointerType: "touch"};
      nb.dispatchEvent(new PointerEvent("pointerdown", o)); await new Promise(res => setTimeout(res, ${ms})); nb.dispatchEvent(new PointerEvent("pointerup", o)); await new Promise(res => setTimeout(res, 100));`);
    // While the finger is down nothing can be selected; after a tap, all as before.
    assert.equal(await run(`const nb = document.querySelector('.nb[data-pin="2"]'); const r = nb.getBoundingClientRect(); nb.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, clientX: r.x + 4, clientY: r.y + 4, pointerType: "touch"}));
      const on = document.documentElement.classList.contains("holding"); document.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerType: "touch"})); await new Promise(res => setTimeout(res, 50));
      return on && !document.documentElement.classList.contains("holding");`), true);
    await press(100);
    assert.equal(await run(`return document.querySelector("[data-map]").getAttribute("aria-expanded");`), "false", "a tap leaves the map closed");
    await press(700);
    assert.equal(await run(`return document.querySelector("[data-map]").getAttribute("aria-expanded");`), "true", "a hold opens it");
    await run(`document.querySelector('[data-view="live"]').click();`);
    await press(700);
    await until("the card of the third stop", `document.querySelector(".live .maplibregl-popup") && document.querySelector(".live .maplibregl-popup").textContent.includes("Miradouro de Santa Luzia")`);
    // The sketch: the badge of that stop pulses.
    await click('[data-view="schema"]');
    await until("the sketch", `document.querySelector(".mapsvg")`);
    await press(700);
    assert.equal(await run(`return [...document.querySelectorAll(".mapsvg .badge.hit")].map(b => b.dataset.idx).join();`), "2");
    await click('[data-view="live"]');
    await click("[data-map]");
  });

  await step("Directions start from the stop before; the first of a day from where the night was spent", async () => {
    await run(`location.hash = "#day-1"; await new Promise(r => setTimeout(r, 200));`);
    const dir = (title) => run(`const li = [...document.querySelectorAll(".stop")].find(li => li.querySelector("h3").textContent.includes(${JSON.stringify(title)})); const a = [...li.querySelectorAll(".maplink")].find(a => a.textContent.startsWith("Directions")); return new URL(a.href).searchParams.get("origin");`);
    assert.equal(await dir("Praça do Comércio"), null, "the first stop of the trip: from where the phone is");
    assert.equal(await dir("Lisbon Cathedral"), "Praça do Comércio Lisboa");
    await run(`location.hash = "#day-2"; await new Promise(r => setTimeout(r, 200));`);
    assert.equal(await dir("Mosteiro dos Jerónimos"), "Baixa, Lisboa", "the hotel of the night before");
    await run(`location.hash = "#day-1"; await new Promise(r => setTimeout(r, 200));`);
  });

  await step("the dark theme can be chosen, survives a reload, and darkens the map", async () => {
    const bg = () => run(`return getComputedStyle(document.body).backgroundColor;`);
    const light = await bg();
    await run(`location.hash = "#me";`);
    await until("the trips page", `document.querySelector('[data-theme-choice="dark"]')`);
    await click('[data-theme-choice="dark"]');
    assert.equal(await run(`return document.documentElement.dataset.theme;`), "dark");
    const dark = await bg();
    assert.notEqual(dark, light);
    await reload();
    assert.equal(await run(`return document.documentElement.dataset.theme;`), "dark");
    assert.equal(await bg(), dark);
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelector("[data-map]")`);
    await run(`document.querySelector("[data-map]").click(); document.querySelector('[data-view="live"]').click();`);
    await until("a dark map", `document.querySelector(".live.dark .maplibregl-map")`);
    await click("[data-map]");
    await run(`location.hash = "#me";`);
    await until("the trips page", `document.querySelector('[data-theme-choice="auto"]')`);
    await click('[data-theme-choice="auto"]');
    assert.equal(await run(`return document.documentElement.dataset.theme === undefined;`), true);
    assert.equal(await bg(), light);
  });

  // Invented place link, in the shape Google Maps gives on a computer: name, address, position.
  const PLACE = "https://www.google.com/maps/place/Pastelaria+Exemplo,+Rua+Augusta+10,+Lisboa/@38.7101,-9.1375,18z/data=!4m6!3m5!1s0x0:0x0!8m2!3d38.71012!4d-9.13751";
  const fill = (sel, value) => run(`const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("change", {bubbles: true}));`);
  const submit = () => run(`document.querySelector("dialog.sheet[open] form").requestSubmit(); await new Promise(r => setTimeout(r, 400));`);
  const stopTitles = () => run(`return [...document.querySelectorAll(".stop h3")].map(h => h.textContent);`);
  const sendFile = trip => run(`const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(JSON.stringify(trip))}], "from-a-friend.json")); const f = document.getElementById("file"); f.files = dt.files; f.dispatchEvent(new Event("change")); await new Promise(r => setTimeout(r, 600));`);
  const answer = id => run(`document.querySelector('dialog.ask [data-answer="${id}"]').click(); await new Promise(r => setTimeout(r, 600));`);
  let otherPhone = null;
  const versionOnPhone = () => run(`return await new Promise(r => { const q = indexedDB.open("travel-in-my-pocket"); q.onsuccess = () => { const g = q.result.transaction("trips").objectStore("trips").get("demo-lisbon"); g.onsuccess = () => r(g.result.trip.version); }; });`);

  await step("the + button adds a stop from a Google Maps link, in time order, as a new version", async () => {
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelectorAll(".stop").length === 6`);
    const before = await versionOnPhone();
    await run(`document.querySelector(".fab").click();`);
    await until("the form", `document.querySelector("dialog.sheet[open]")`);
    await fill("#stop-src", PLACE);
    assert.equal(await run(`return document.getElementById("stop-title").value;`), "Pastelaria Exemplo");
    assert.match(await run(`return document.querySelector("[data-pos]").textContent;`), /38\.71012, -9\.13751/);
    // The time from two lists, hour and minutes (no clock of the phone's own).
    assert.equal(await run(`return document.querySelector('input[type="time"]');`), null);
    await fill("#stop-hh", "12");
    await fill("#stop-mm", "15");
    await run(`document.querySelector('[data-travel="metro"]').click();`);
    await submit();
    assert.deepEqual((await stopTitles()).slice(2, 5), ["Miradouro de Santa Luzia", "Pastelaria Exemplo", "Castelo de São Jorge"]);
    const after = await versionOnPhone();
    assert.notEqual(after.id, before.id);
    assert.deepEqual(after.parents, [before.id]);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Stop added · version [0-9a-f]{7}/);
    assert.equal(await run(`return document.querySelectorAll(".stop .tvchip").length;`), 1);
  });

  await step("a stop can be edited, moved to another day with its tick, and deleted", async () => {
    await click('[data-tick]', 3);   // the new stop, ticked
    await run(`document.querySelector('[data-edit="pastelaria-exemplo"]').click();`);
    await until("the form", `document.querySelector("dialog.sheet[open]")`);
    assert.equal(await run(`return document.getElementById("stop-title").value;`), "Pastelaria Exemplo");
    await run(`document.getElementById("stop-day").value = "1"; document.getElementById("stop-day").dispatchEvent(new Event("change"));`);
    await submit();
    assert.ok(!(await stopTitles()).includes("Pastelaria Exemplo"));
    await run(`location.hash = "#day-2";`);
    await until("day 2", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent === "Pastelaria Exemplo")`);
    assert.equal(await run(`return document.querySelector('[data-edit="pastelaria-exemplo"]').closest(".stop").classList.contains("done");`), true, "the tick moved with it");
    await run(`document.querySelector('[data-edit="pastelaria-exemplo"]').click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] [data-delete]")`);
    // Delete asks first: Cancel keeps the stop and the form.
    await run(`document.querySelector("[data-delete]").click();`);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    assert.equal(await run(`return document.querySelector("dialog.ask h2").textContent;`), "Delete this stop?");
    assert.equal(await run(`return document.activeElement.dataset.answer;`), "no", "the safe button has the focus");
    await run(`document.querySelector('dialog.ask [data-answer="no"]').click(); await new Promise(r => setTimeout(r, 100));`);
    assert.equal(await run(`return !document.querySelector("dialog.ask") && document.querySelector("dialog.sheet").open;`), true);
    await run(`document.querySelector("[data-delete]").click();`);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    await run(`document.querySelector('dialog.ask [data-answer="yes"]').click(); await new Promise(r => setTimeout(r, 400));`);
    assert.ok(!(await stopTitles()).includes("Pastelaria Exemplo"));
  });

  await step("a short link keeps the link, has no position, and says what to add", async () => {
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelector(".fab") && !document.querySelector(".fab").hidden`);
    await run(`document.querySelector(".fab").click();`);
    await until("the form", `document.querySelector("dialog.sheet[open]")`);
    await fill("#stop-src", "https://maps.app.goo.gl/AbCdEfGh123456789?g_st=ac");
    assert.match(await run(`return document.querySelector("[data-src-note]").textContent;`), /Short Google Maps link/);
    await fill("#stop-title", "Tram 28");
    // A time in words instead of the clock.
    await run(`document.querySelector("[data-time-mode]").click();`);
    assert.equal(await run(`return document.getElementById("stop-time").hidden && !document.getElementById("stop-time-words").hidden;`), true);
    await fill("#stop-time-words", "Evening");
    await submit();
    assert.equal(await run(`return [...document.querySelectorAll(".stop")].find(li => li.querySelector("h3").textContent === "Tram 28").querySelector(".maplink").href;`), "https://maps.app.goo.gl/AbCdEfGh123456789?g_st=ac");
  });

  await step("an address shared on its own is searched around the trip; the pin can be put on a map", async () => {
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelector(".fab") && !document.querySelector(".fab").hidden`);
    // No request leaves the test: Nominatim answers from here.
    await run(`window.__geo = []; const real = window.fetch; window.fetch = (u, o) => String(u).includes("nominatim") ? (window.__geo.push(String(u)), Promise.resolve(new Response('[{"lat":"38.71","lon":"-9.1366","category":"tourism","type":"museum"}]'))) : real(u, o);`);
    await run(`document.querySelector(".fab").click();`);
    await until("the form", `document.querySelector("dialog.sheet[open]")`);
    assert.equal(await run(`return getComputedStyle(document.documentElement).overflow;`), "hidden", "the page under the form does not scroll");
    await fill("#stop-src", "Rua Augusta, 24https://maps.app.goo.gl/AbCdEfGh123456789?g_st=ac");
    assert.equal(await run(`return document.getElementById("stop-title").value;`), "Rua Augusta, 24");
    await until("the position", `/38\.71000, -9\.13660 · OpenStreetMap/.test(document.querySelector("[data-pos]").textContent)`);
    assert.equal(await run(`return document.querySelector('[data-type][aria-checked="true"]').dataset.type;`), "museum", "the kind of place OpenStreetMap gave");
    const url = new URL(await run(`return window.__geo[0];`));
    assert.equal(url.searchParams.get("q"), "Rua Augusta, 24");
    assert.equal(url.searchParams.get("bounded"), "1");
    const [w, n, e, so] = url.searchParams.get("viewbox").split(",").map(Number);
    assert.ok(w < -9.14 && e > -9.13 && so < 38.71 && n > 38.72, "the box is around the day's stops in Lisbon");
    await run(`document.querySelector("[data-pick]").click();`);
    await until("the map in the form", `document.querySelector(".live.pick.maplibregl-map") && document.querySelector(".live.pick .pickpin")`);
    await run(`const m = document.querySelector(".live.pick .maplibregl-canvas"), r = m.getBoundingClientRect(), at = {bubbles: true, clientX: r.left + r.width / 2 + 40, clientY: r.top + r.height / 2 + 30, button: 0};
      for(const type of ["mousedown", "mouseup", "click"]) m.dispatchEvent(new MouseEvent(type, at));`);
    await until("a position put by hand", `/placed on the map/.test(document.querySelector("[data-pos]").textContent)`);
    assert.notEqual(await run(`return document.querySelector("[data-pos]").textContent;`), "38.71000, -9.13660 · placed on the map");
    await run(`document.querySelector("dialog.sheet [data-close]").click();`);
    assert.equal(await run(`return getComputedStyle(document.documentElement).overflow;`), "visible");
    await reload();
  });

  let saved = null;
  await step("the trip is saved as a file with its version, and Trips stops asking", async () => {
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-act="save"]')`);
    assert.equal(await run(`return !!document.querySelector(".unsaved");`), true);
    await run(`window.__files = []; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = b => { window.__files.push(b); return make(b); }; HTMLAnchorElement.prototype.click = function(){ window.__name = this.download; };`);
    // As Chrome on Android does: the share sheet exists, but refuses a .json file.
    await run(`navigator.canShare = () => true; navigator.share = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));`);
    await run(`document.querySelector('[data-act="save"]').click();`);
    // The example's private expenses came with it: the app asks whether they go in the file.
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    assert.deepEqual(await run(`return [...document.querySelectorAll("dialog.ask [data-answer]")].map(b => b.textContent);`), ["Cancel", "Without", "With private expenses"]);
    await answer("with");
    assert.equal(await run(`return window.__files.length;`), 1, "refused by the share sheet, the file is downloaded instead");
    saved = JSON.parse(await run(`return await window.__files[0].text();`));
    assert.deepEqual(saved.private.expenses.map(x => x.cost), [24, 18]);
    assert.match(saved.private.owner, /^p-[0-9a-f]{12}$/, "this phone's code: the example's were no one's");
    const name = await run(`return window.__name;`);
    assert.equal(name, `demo-lisbon-${saved.version.id.slice(0, 7)}.json`);
    assert.equal((await versionOnPhone()).id, saved.version.id);
    assert.equal(await run(`return !!document.querySelector(".unsaved");`), false);
  });

  await step("a file changed on another phone is joined with this one, and offered for saving", async () => {
    // The other phone: the same example trip, with its own new stop.
    const {trip: root} = await prepare(splitPrivate(JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"))).trip);
    const other = await commit(addStop(root, {date: "2027-05-15"}, {time: "21:00", title: "Fado evening"}).trip, root);
    await sendFile(other);
    // Both changed: the app shows what, and asks.
    await until("the choice", `document.querySelector("dialog.ask[open]")`);
    assert.equal(await run(`return document.querySelector("dialog.ask h2").textContent;`), "The file and this phone changed separately");
    assert.deepEqual(await run(`return [...document.querySelectorAll("dialog.ask section")].map(s => [s.querySelector("h3").textContent, [...s.querySelectorAll("li")].map(l => l.textContent)]);`),
      [["In the file", ["+ Fado evening"]], ["Only on this phone", ["+ Tram 28"]]]);
    await answer("merge");
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Changes joined: 1 new, 0 changed, 0 removed · version [0-9a-f]{7}/);
    const merged = await versionOnPhone();
    assert.deepEqual([...merged.parents].sort(), [saved.version.id, other.version.id].sort());
    await run(`location.hash = "#day-2";`);
    await until("day 2", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent === "Fado evening")`);
    await run(`location.hash = "#day-1";`);
    await until("day 1", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent === "Tram 28")`);
    // The same file again: this phone already has everything in it.
    await sendFile(other);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /older than the trip on this phone/);
    otherPhone = {root, other};
  });

  await step("a file can replace this phone's changes, and Cancel keeps them", async () => {
    const {root} = otherPhone;
    const third = await commit(addStop(root, {date: "2027-05-14"}, {time: "18:00", title: "Sunset on the river"}).trip, root);
    const before = await versionOnPhone();
    await sendFile(third);
    await until("the choice", `document.querySelector("dialog.ask[open]")`);
    await answer("cancel");
    assert.equal((await versionOnPhone()).id, before.id, "Cancel changes nothing");
    await sendFile(third);
    await until("the choice", `document.querySelector("dialog.ask[open]")`);
    await answer("theirs");
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Now the trip is the one in the file/);
    await run(`location.hash = "#day-1";`);
    await until("day 1", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent === "Sunset on the river")`);
    assert.ok(!(await stopTitles()).includes("Tram 28"), "this phone's stop is gone");
    assert.deepEqual([...(await versionOnPhone()).parents].sort(), [before.id, third.version.id].sort());
  });

  await step("an older file can be taken back on purpose, as a new version", async () => {
    await sendFile(otherPhone.root);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /older than the trip on this phone/);
    const before = await versionOnPhone();
    await run(`document.querySelector("#toast .act").click(); await new Promise(r => setTimeout(r, 500));`);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Back to the file's version/);
    const after = await versionOnPhone();
    assert.deepEqual(after.parents, [before.id]);
    assert.ok(!(await stopTitles()).includes("Sunset on the river"));
  });

  await step("the history lists the versions with what changed, and restores one", async () => {
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-act="history"][data-id="demo-lisbon"]')`);
    await run(`document.querySelector('[data-act="history"][data-id="demo-lisbon"]').click();`);
    await until("the versions", `document.querySelector("dialog.history .versions [data-restore]")`);
    const rows = await run(`return [...document.querySelectorAll("dialog.history .versions > li")].map(li => li.textContent);`);
    assert.match(rows[0], /now/, "the current version first");
    assert.ok(rows.some(r => r.includes("− Sunset on the river")), rows.join(" | "));
    assert.ok(rows.some(r => r.includes("+ Sunset on the river")));
    assert.ok(rows.some(r => r.includes("Joined with ") && r.includes("which brought:")));
    assert.ok(rows.some(r => r.includes("First version")));
    // Back to the version that had "Sunset on the river".
    const before = await versionOnPhone();
    await run(`[...document.querySelectorAll("dialog.history .versions > li")].find(li => li.textContent.includes("+ Sunset on the river")).querySelector("[data-restore]").click();`);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    await answer("yes");
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Back to an earlier version · new version [0-9a-f]{7}/);
    assert.deepEqual((await versionOnPhone()).parents, [before.id], "restoring makes a new version");
    await run(`location.hash = "#day-1";`);
    await until("day 1", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent === "Sunset on the river")`);
  });

  await step("a place shared from Google Maps on Android opens the form already filled in", async () => {
    await run(`location.href = location.pathname + "?title=" + encodeURIComponent("Pastelaria Exemplo") + "&text=" + encodeURIComponent(${JSON.stringify(PLACE)});`);
    await until("the form", `document.querySelector("dialog.sheet[open]")`);
    assert.equal(await run(`return document.getElementById("stop-title").value;`), "Pastelaria Exemplo");
    assert.equal(await run(`return location.search;`), "", "the shared text leaves the address bar");
    await run(`document.querySelector("dialog.sheet [data-close]").click();`);
  });

  await step("a changed Google key is applied, a refused one falls back, Google can be turned off", async () => {
    // Needs a connection to Google, which refuses these invented keys.
    const KEY_A = "invented-test-key-one", KEY_B = "invented-test-key-two";
    // The keys of the Google scripts the app added (Google then adds its own, without a key).
    const googleScripts = `[...document.querySelectorAll('script[src*="maps.googleapis.com/maps/api/js"]')].map(s => new URL(s.src).searchParams.get("key")).filter(Boolean)`;
    const status = () => run(`return document.querySelector("[data-map-status]").dataset.mapStatus;`);
    const saveKey = async key => run(`document.getElementById("gkey").value = ${JSON.stringify(key)}; document.querySelector('[data-form="key"]').requestSubmit();`);
    const openLiveMap = async () => {
      await run(`location.hash = "#day-1";`);
      await until("day 1", `document.querySelector("[data-map]")`);
      await run(`if(document.querySelector("[data-map]").getAttribute("aria-expanded") !== "true") document.querySelector("[data-map]").click(); document.querySelector('[data-view="live"]').click();`);
    };

    await run(`location.hash = "#me";`);
    await until("the trips page", `document.getElementById("gkey")`);
    assert.equal(await status(), "statusNoKey");
    await saveKey(KEY_A);
    await until("the new status", `document.querySelector('[data-map-status="statusGoogleDevice"]')`);

    await openLiveMap();
    await until("Google to refuse key A and the map to fall back", `document.querySelector(".live .maplibregl-map")`, 30000);
    assert.deepEqual(await run(`return ${googleScripts};`), [KEY_A]);
    await run(`location.hash = "#me";`);
    await until("the trips page", `document.querySelector("[data-map-status]")`);
    assert.equal(await status(), "statusRefused");

    // The bug this guards against: the page kept using the first key it loaded.
    await run(`window.__samePage = true;`);
    await saveKey(KEY_B);
    await until("a fresh page", `!window.__samePage && document.querySelector("[data-map-status]")`);
    assert.equal(await status(), "statusGoogleDevice");
    await openLiveMap();
    await until("Google to refuse key B", `document.querySelector(".live .maplibregl-map")`, 30000);
    assert.deepEqual(await run(`return ${googleScripts};`), [KEY_B]);

    // Turned off: no request to Google at all, even with a key.
    await run(`location.hash = "#me";`);
    await until("the trips page", `document.querySelector('[data-provider="osm"]')`);
    await click('[data-provider="osm"]');
    await until("the status", `document.querySelector('[data-map-status="statusOsmChosen"]')`);
    await reload();
    await openLiveMap();
    await until("OpenStreetMap", `document.querySelector(".live .maplibregl-map")`);
    assert.deepEqual(await run(`return ${googleScripts};`), []);

    // Leave the device as it was.
    await run(`location.hash = "#me";`);
    await until("the trips page", `document.querySelector('[data-provider="google"]')`);
    await click('[data-provider="google"]');
    await saveKey("");
    await until("no key", `document.querySelector('[data-map-status="statusNoKey"]')`);
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelector("[data-map]")`);
    if(await run(`return document.querySelector("[data-map]").getAttribute("aria-expanded") === "true";`)) await click("[data-map]");
  });

  await step("a hostile trip file cannot run code or add elements", async () => {
    const evil = {
      format: "travel-in-my-pocket/1", id: "evil", title: `<img src=x onerror="window.__pwned=1">`,
      places: {a: {name: "<b>A</b>", color: "#336699"}},
      days: [{date: "2027-01-01", place: "a", title: "<script>window.__pwned=1</script>", reminders: ["**ok** <i>no</i>"], note: `<img src=x onerror="window.__pwned=1">`,
        stops: [{time: "<u>1</u>", title: "<u>s</u>", text: `**b** <img src=x onerror="window.__pwned=1">`, tag: "<s>t</s>", lat: 1, lng: 1, query: `"><script>window.__pwned=1</script>`}]}],
      info: [{title: "<i>x</i>", rows: [{label: "<i>l</i>", text: "<i>t</i>", number: "<i>n</i>"}]}], infoNote: "<i>x</i>"
    };
    await run(`const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(JSON.stringify(evil))}], "evil.json", {type: "application/json"})); const f = document.getElementById("file"); f.files = dt.files; f.dispatchEvent(new Event("change"));`);
    await until("the hostile trip", `document.title.includes("onerror")`);
    for(const hash of ["#day-1", "#info", "#trips"]){
      await run(`location.hash = ${JSON.stringify(hash)}; await new Promise(r => setTimeout(r, 150));`);
      assert.equal(await count("#app img, #app script, #app u, #app i, #app s"), 0, hash);
    }
    await run(`await new Promise(r => setTimeout(r, 300));`);
    assert.equal(await run(`return window.__pwned === undefined;`), true);
    assert.equal(await run(`location.hash = "#day-1"; await new Promise(r => setTimeout(r, 150)); return !!document.querySelector(".remind b");`), true);
  });

  await step("a file that is not a trip is refused with reasons", async () => {
    // Files are loaded from the Trips page, and that is where the reasons are shown.
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-act="pick"]')`);
    await run(`const dt = new DataTransfer(); dt.items.add(new File(['{"format":"travel-in-my-pocket/1","id":"x"}'], "bad.json")); const f = document.getElementById("file"); f.files = dt.files; f.dispatchEvent(new Event("change"));`);
    await until("the error box", `document.querySelector(".errbox li")`);
    assert.ok(await count(".errbox li") >= 2);
  });

  await step("a trip pasted from a chat loads; a wrong one gives its problems, ready for the assistant", async () => {
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-act="paste"]')`);
    // The message to start from is there, with the page of the format on this site.
    assert.match(await run(`return document.querySelector("details.aihow [data-prompt]").textContent;`), /^Read http:\/\/\S+\/llms\.txt and follow it exactly:/);
    await run(`window.__copied = null; navigator.clipboard.writeText = async t => { window.__copied = t; };`);
    await run(`document.querySelector("[data-act='copy-prompt']").click(); await new Promise(r => setTimeout(r, 100));`);
    const message = await run(`return window.__copied;`);
    assert.match(message, /\[where, dates or number of days/);
    // The line to fill in comes last: pasted in a chat, the cursor is already there.
    const last = text => text.trim().split("\n").pop();
    assert.match(last(message), /^My trip: \[where/);
    assert.ok(message.length < 400, "short enough to use on a phone");
    // For an assistant that opens no link: the same, with the format itself.
    await run(`document.querySelector("[data-act='copy-prompt-full']").click(); await new Promise(r => setTimeout(r, 100));`);
    const full = await run(`return window.__copied;`);
    assert.match(full, /TIMP trip file, format "travel-in-my-pocket\/2"/);
    assert.ok(!full.includes("llms.txt"));
    assert.match(last(full), /^My trip: \[where/);
    // Changing the open trip: the message carries the trip itself.
    await run(`document.querySelector("[data-act='copy-edit']").click(); await new Promise(r => setTimeout(r, 100));`);
    const edit = await run(`return window.__copied;`);
    assert.match(edit, /\[what to change\]/);
    assert.equal(last(edit), "Change my trip like this: [what to change].");
    // Written in the app: the request becomes the last line, and stays on the phone.
    const type = (sel, value) => run(`const b = document.querySelector(${JSON.stringify(sel)}); b.value = ${JSON.stringify(value)}; b.dispatchEvent(new Event("input", {bubbles: true}));`);
    await type("#ai-new", "Kyoto, 5 days in April, two of us, temples and food");
    assert.equal(last(await run(`return document.querySelector("[data-prompt]").textContent;`)), "My trip: Kyoto, 5 days in April, two of us, temples and food", "the preview follows");
    await run(`document.querySelector("[data-act='copy-prompt']").click(); await new Promise(r => setTimeout(r, 100));`);
    assert.equal(last(await run(`return window.__copied;`)), "My trip: Kyoto, 5 days in April, two of us, temples and food");
    await type("#ai-edit", "Move the castle to the morning");
    await run(`document.querySelector("[data-act='copy-edit']").click(); await new Promise(r => setTimeout(r, 100));`);
    assert.equal(last(await run(`return window.__copied;`)), "Change my trip like this: Move the castle to the morning");
    await new Promise(r => setTimeout(r, 600));   // drafts are kept after a short pause
    await reload();
    await run(`location.hash = "#trips";`);
    await until("the drafts kept", `document.querySelector("#ai-new") && document.querySelector("#ai-new").value.startsWith("Kyoto") && document.querySelector("#ai-edit").value === "Move the castle to the morning"`);
    await run(`document.querySelector("[data-act='clear-draft'][data-key='new']").click();`);
    assert.equal(await run(`return document.querySelector("#ai-new").value;`), "");
    assert.equal(last(await run(`return document.querySelector("[data-prompt]").textContent;`)), "My trip: [where, dates or number of days, who travels, what you like, how you get around].");
    await run(`document.querySelector("[data-act='clear-draft'][data-key^='edit:']").click(); await new Promise(r => setTimeout(r, 600));`);
    await run(`window.__copied = null; navigator.clipboard.writeText = async t => { window.__copied = t; };`);
    assert.match(edit, /travel-in-my-pocket\/changes/, "how to write changes");
    assert.match(edit, /\nTrip ".*", id [a-z0-9-]+, version [0-9a-f]{16}, \d+ days?\./, "the outline of the open trip");
    assert.ok(!edit.includes('"text":'), "not the whole file");
    // What Gemini wrote: "name" instead of "title", no format, no places.
    const wrong = {id: "rome-gemini", title: "Rome", days: [{date: "2027-05-01", place: "rome", title: "Day 1", stops: [{time: "09:00", name: "Colosseum"}]}]};
    await run(`document.querySelector('[data-act="paste"]').click();`);
    await until("the paste form", `document.querySelector("#paste-text")`);
    await run(`document.querySelector("#paste-text").value = "Here is your trip!\\n\\u0060\\u0060\\u0060json\\n" + ${JSON.stringify(JSON.stringify(wrong, null, 2))} + "\\n\\u0060\\u0060\\u0060\\nEnjoy Rome."; document.querySelector("#paste-text").closest("form").requestSubmit();`);
    await until("the problems", `document.querySelector(".errbox [data-act='copy-errors']")`);
    const items = await run(`return [...document.querySelectorAll(".errbox li")].map(li => li.textContent);`);
    assert.ok(items.some(x => x.startsWith("format:")) && items.some(x => x.startsWith("days[0].stops[0].title:")), items.join(" | "));
    await run(`window.__copied = null; navigator.clipboard.writeText = async t => { window.__copied = t; };`);
    await run(`document.querySelector("[data-act='copy-errors']").click(); await new Promise(r => setTimeout(r, 100));`);
    const copied = await run(`return window.__copied;`);
    assert.match(copied, /following the TIMP format/);
    assert.match(copied, /- days\[0\]\.stops\[0\]\.title: /);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Copied/);
    // The corrected answer, pasted with the assistant's words around it.
    const right = {format: "travel-in-my-pocket/1", id: "rome-gemini", title: "Rome", places: {rome: {name: "Roma", color: "#b8451b"}}, days: [{date: "2027-05-01", place: "rome", title: "Day 1", stops: [{time: "09:00", title: "Colosseum", lat: 41.8902, lng: 12.4922}]}]};
    await run(`document.querySelector('[data-act="paste"]').click();`);
    await until("the paste form", `document.querySelector("#paste-text") && document.querySelector("dialog.sheet[open]")`);
    await run(`document.querySelector("#paste-text").value = "Corrected: " + ${JSON.stringify(JSON.stringify(right))}; document.querySelector("#paste-text").closest("form").requestSubmit();`);
    await until("the new trip", `document.title === "Rome"`);
    assert.equal(await count("#app .errbox"), 0, "the problems are gone");
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-act="remove"]')`);
  });

  await step("changes from an assistant apply as one new version; a wrong one says why and changes nothing", async () => {
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-act="paste"]')`);
    // The example trip, opened.
    await run(`const b = [...document.querySelectorAll('[data-act="open"]')].find(b => b.closest(".tripcard").innerText.includes("Lisbon")); if(b) b.click(); await new Promise(r => setTimeout(r, 400));`);
    const before = await versionOnPhone();
    const paste = body => run(`location.hash = "#trips"; await new Promise(r => setTimeout(r, 200)); document.querySelector('[data-act="paste"]').click(); await new Promise(r => setTimeout(r, 200)); document.querySelector("#paste-text").value = ${JSON.stringify(body)}; document.querySelector("#paste-text").closest("form").requestSubmit(); await new Promise(r => setTimeout(r, 600));`);
    const wrong = {format: "travel-in-my-pocket/changes", trip: "demo-lisbon", changes: [{update: {day: "2027-05-14", stop: "nowhere", set: {time: "10:00"}}}]};
    await paste("Here you go:\n```json\n" + JSON.stringify(wrong) + "\n```");
    assert.match(await text("#app .errbox li"), /changes\[0\]: there is no stop "nowhere" on 2027-05-14/);
    assert.equal((await versionOnPhone()).id, before.id, "nothing changed");
    const right = {format: "travel-in-my-pocket/changes", trip: "demo-lisbon", changes: [
      {add: {day: "2027-05-14", stop: {time: "16:00", title: "Ginjinha bar", type: "food", lat: 38.7139, lng: -9.1375}}},
      {update: {day: "2027-05-14", stop: "se", set: {tag: "Free entry"}}}
    ]};
    await paste(JSON.stringify(right));
    const after = await versionOnPhone();
    assert.deepEqual(after.parents, [before.id], "one new version");
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Changes applied: 1 added, 1 changed, 0 removed/);
    await run(`location.hash = "#day-1";`);
    await until("the new stop", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent.includes("Ginjinha bar"))`);
    // Android: the assistant's answer shared to the app is loaded the same way.
    const shared = {format: "travel-in-my-pocket/changes", trip: "demo-lisbon", changes: [{remove: {day: "2027-05-14", stop: "ginjinha-bar"}}]};
    await run(`location.href = location.pathname + "?text=" + encodeURIComponent("Done! " + ${JSON.stringify(JSON.stringify(shared))}) + "#day-1";`);
    await until("the stop removed", `document.querySelectorAll(".stop").length > 0 && ![...document.querySelectorAll(".stop h3")].some(h => h.textContent.includes("Ginjinha bar"))`);
    assert.equal(await run(`return location.search;`), "");
  });

  await step("changes for an earlier version are joined with what changed since; a trip with the same id and no shared version is kept apart", async () => {
    const paste = body => run(`location.hash = "#trips"; await new Promise(r => setTimeout(r, 200)); document.querySelector('[data-act="paste"]').click(); await new Promise(r => setTimeout(r, 200)); document.querySelector("#paste-text").value = ${JSON.stringify(body)}; document.querySelector("#paste-text").closest("form").requestSubmit(); await new Promise(r => setTimeout(r, 600));`);
    const v1 = await versionOnPhone();
    // The outline names the version; the trip then changes on the phone.
    const message = await run(`const {outline} = await import(new URL("js/changes.js", location.href)); const st = await import(new URL("js/store.js", location.href)); return outline((await st.listTrips()).find(r => r.id === "demo-lisbon").trip);`);
    assert.ok(message.includes(`version ${v1.id}`), "the outline names the version");
    await paste(JSON.stringify({format: "travel-in-my-pocket/changes", trip: "demo-lisbon", changes: [{update: {day: "2027-05-14", stop: "se", set: {tag: "Changed on the phone"}}}]}));
    const v2 = await versionOnPhone();
    // The assistant answers for the version it saw.
    await paste(JSON.stringify({format: "travel-in-my-pocket/changes", trip: "demo-lisbon", from: v1.id, changes: [{update: {day: "2027-05-14", stop: "castelo", set: {tag: "From the assistant"}}}]}));
    assert.match(await run(`return document.getElementById("toast").textContent;`), /^Changes applied to version [0-9a-f]{7} and joined with what changed since: 0 added, 1 changed, 0 removed · version [0-9a-f]{7}/);
    const v3 = await versionOnPhone();
    assert.deepEqual([...v3.parents].sort().includes(v2.id), true);
    assert.equal(v3.parents.length, 2, "joined, as two files are");
    await run(`location.hash = "#day-1";`);
    await until("both tags", `["Changed on the phone", "From the assistant"].every(t => [...document.querySelectorAll(".eyebrow")].some(e => e.textContent === t))`);
    // A friend's trip with the same name and first day: same id, no version in common.
    const friend = JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));
    delete friend.private;
    friend.days[0].stops[0].title = "Breakfast at a friend's";
    await sendFile(friend);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    assert.equal(await run(`return document.querySelector("dialog.ask h2").textContent;`), "Another trip with the same name?");
    assert.deepEqual(await run(`return [...document.querySelectorAll("dialog.ask [data-answer]")].map(b => b.textContent);`), ["Cancel", "Join both", "Keep them apart"]);
    await answer("separate");
    assert.match(await run(`return document.getElementById("toast").textContent;`), /loaded as a trip of its own/);
    assert.equal((await versionOnPhone()).id, v3.id, "this phone's trip is untouched");
    await run(`location.hash = "#trips";`);
    await until("both trips", `document.querySelector('[data-act="remove"][data-id="demo-lisbon-2"]')`);
    await run(`document.querySelector('[data-act="remove"][data-id="demo-lisbon-2"]').click();`);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    await answer("yes");
    await run(`location.hash = "#trips";`);
    await until("the example", `document.querySelector('[data-act="open"][data-id="demo-lisbon"]') || document.querySelector('.tripcard.current [data-act="save"][data-id="demo-lisbon"]')`);
    await run(`const b = document.querySelector('[data-act="open"][data-id="demo-lisbon"]'); if(b) b.click(); await new Promise(r => setTimeout(r, 300));`);
  });

  await step("Paste at the bottom takes what was copied: a place opens the form, changes are applied", async () => {
    const clip = value => run(`navigator.clipboard.readText = async () => { if(${JSON.stringify(value)} === null) throw new Error("denied"); return ${JSON.stringify(value)}; };`);
    await run(`location.hash = "#trips";`);
    await until("the Paste button", `document.querySelector(".fab-paste") && !document.querySelector(".fabs").hidden`);
    assert.equal(await run(`return document.querySelector(".fab").hidden;`), true, "no + outside a day");
    // In the middle of a long page only its icon, scrolling up too; its word at the top.
    await run(`location.hash = "#info";`);
    await until("the Info page", `document.querySelector("#app .sec") && !document.querySelector(".fabs").hidden`);
    const scrollBy = y => run(`const el = document.documentElement.classList.contains("own-scroll") ? document.body : document.scrollingElement; el.scrollTop = ${y}; await new Promise(r => setTimeout(r, 120));`);
    await scrollBy(0); await scrollBy(300);
    assert.equal(await run(`return document.querySelector(".fabs").classList.contains("compact");`), true, "compact while scrolling down");
    assert.equal(await run(`return document.querySelector(".fab-paste").getAttribute("aria-label");`), "Paste");
    await scrollBy(200);
    assert.equal(await run(`return document.querySelector(".fabs").classList.contains("compact");`), true, "still compact scrolling up");
    await scrollBy(0);
    assert.equal(await run(`return document.querySelector(".fabs").classList.contains("compact");`), false, "its word back at the top");
    // Paste opens the sheet first: nothing is read until Paste in it is tapped.
    await run(`window.__reads = 0; const real = navigator.clipboard.readText; navigator.clipboard.readText = async () => { window.__reads++; return "x"; };`);
    await run(`document.querySelector(".fab-paste").click();`);
    await until("the paste sheet", `document.querySelector("dialog.sheet[open] #paste-text")`);
    assert.equal(await run(`return window.__reads;`), 0, "nothing read on opening");
    assert.equal(await text("#paste-title"), "Paste");
    assert.equal(await run(`return document.activeElement && document.activeElement.id;`) === "paste-text", false, "no keyboard over the Paste button");
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
    const pasteThenGo = value => run(`document.querySelector(".fab-paste").click(); await new Promise(r => setTimeout(r, 100));
      navigator.clipboard.readText = async () => ${JSON.stringify(value)};
      document.querySelector("dialog.sheet[open] [data-paste]").click(); await new Promise(r => setTimeout(r, 100));
      window.__shown = document.getElementById("paste-text").value;
      document.getElementById("paste-text").closest("form").requestSubmit(); await new Promise(r => setTimeout(r, 600));`);
    // A place copied from Google Maps: shown in the field, then the stop form, filled in.
    await pasteThenGo("Pastelaria Exemplo\n" + PLACE);
    assert.equal(await run(`return window.__shown;`), "Pastelaria Exemplo\n" + PLACE, "what was copied is in the field first");
    await until("the form", `document.querySelector("dialog.sheet[open] #stop-title")`);
    assert.equal(await run(`return document.getElementById("stop-title").value;`), "Pastelaria Exemplo");
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
    // An assistant's answer with changes: applied as a new version.
    const before = await versionOnPhone();
    const changes = {format: "travel-in-my-pocket/changes", trip: "demo-lisbon", changes: [{update: {day: "2027-05-14", stop: "se", set: {tag: "Pasted"}}}]};
    await pasteThenGo("Sure:\n```json\n" + JSON.stringify(changes) + "\n```");
    assert.deepEqual((await versionOnPhone()).parents, [before.id]);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Changes applied: 0 added, 1 changed/);
    // The phone refuses the clipboard: the field takes the focus, to paste by hand.
    await clip(null);
    await run(`location.hash = "#day-1"; await new Promise(r => setTimeout(r, 200)); document.querySelector(".fab-paste").click(); await new Promise(r => setTimeout(r, 100)); document.querySelector("dialog.sheet[open] [data-paste]").click(); await new Promise(r => setTimeout(r, 100));`);
    assert.equal(await run(`return document.activeElement.id;`), "paste-text");
    await run(`document.querySelector("#paste-text").value = ${JSON.stringify(PLACE)}; document.querySelector("#paste-text").closest("form").requestSubmit();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #stop-title")`);
    assert.equal(await run(`return document.getElementById("stop-title").value;`), "Pastelaria Exemplo");
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
  });

  await step("the day's ⋯ menu changes the day, adds one after the last with its first stop, and deletes it", async () => {
    await run(`location.hash = "#day-2";`);
    await until("day 2", `document.querySelector('[data-more="day"]')`);
    // Edit day: a new title and a note, the stops untouched.
    await run(`document.querySelector('[data-more="day"]').click();`);
    await until("the menu", `!document.querySelector('[data-more="day"] + .menu').hidden`);
    await run(`document.querySelector("[data-day-edit]").click();`);
    await until("the day form", `document.querySelector("dialog.sheet[open] #day-title")`);
    assert.equal(await run(`return document.getElementById("day-city").value;`), "Lisboa");
    await run(`document.getElementById("day-title").value = "Belém slowly"; document.getElementById("day-notes").value = "Pastéis before ten\\n\\nTram 15 from Praça da Figueira"; document.querySelector("dialog.sheet[open] form").requestSubmit(); await new Promise(r => setTimeout(r, 400));`);
    assert.equal(await text(".headrow h1"), "Belém slowly");
    assert.deepEqual(await run(`return [...document.querySelectorAll(".remind div")].map(d => d.textContent);`), ["Pastéis before ten", "Tram 15 from Praça da Figueira"]);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Day saved · version [0-9a-f]{7}/);
    // Add a day: the stop form, on a new day after the last.
    await run(`document.querySelector('[data-more="day"]').click(); document.querySelector("[data-day-add]").click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #stop-day")`);
    assert.match(await run(`const s = document.getElementById("stop-day"); return s.options[s.selectedIndex].textContent;`), /^New day · Tue May 18/);
    await fill("#stop-src", PLACE);
    await submit();
    await until("day 5", `location.hash === "#day-5"`);
    assert.deepEqual(await stopTitles(), ["Pastelaria Exemplo"]);
    assert.equal(await count(".dchip:not(.info)"), 5);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Day 5 added · version/);
    // Delete it: asked first, then gone with its stop.
    await run(`document.querySelector('[data-more="day"]').click(); document.querySelector("[data-day-edit]").click();`);
    await until("the day form", `document.querySelector("dialog.sheet[open] [data-delete]")`);
    await run(`document.querySelector("[data-delete]").click();`);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    assert.match(await run(`return document.querySelector("dialog.ask p").textContent;`), /Day 5, .* goes from the trip with all its stops/);
    await run(`document.querySelector('dialog.ask [data-answer="yes"]').click(); await new Promise(r => setTimeout(r, 500));`);
    assert.equal(await count(".dchip:not(.info)"), 4);
    assert.equal(await run(`return location.hash;`), "#day-4");
  });

  await step("places to eat: review link, local name, booking and closing-day warnings that follow the stop", async () => {
    await run(`location.hash = "#day-2";`);
    await until("day 2", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent.includes("Pastéis de Belém"))`);
    const stop = title => `[...document.querySelectorAll(".stop")].find(li => li.querySelector("h3").textContent.includes(${JSON.stringify(title)}))`;
    // Lisbon is in Europe: TheFork, searched by name and city; a museum gets none.
    assert.equal(await run(`return ${stop("Dinner in Cacilhas")}.querySelector('a[aria-label="Reviews on TheFork"]').href;`), "https://www.google.com/search?q=site%3Athefork.com%20Dinner%20in%20Cacilhas%20Lisboa");
    assert.equal(await run(`return ${stop("Dinner in Cacilhas")}.querySelector(".notice").textContent;`), "!Better booked");
    assert.equal(await run(`return ${stop("Mosteiro")}.querySelector('a[aria-label^="Reviews"]');`), null);
    // Booking required, closed on Saturdays (this day): two warnings, and the name on the sign.
    await run(`document.querySelector('[data-edit="pasteis"]').click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #stop-local")`);
    await run(`document.getElementById("stop-local").value = "Antiga Confeitaria de Belém"; document.querySelector('[data-booking="required"]').click(); document.querySelector('[data-closed="sat"]').click();`);
    assert.equal(await run(`return document.querySelector('[data-closed="sat"]').getAttribute("aria-pressed");`), "true");
    await submit();
    assert.deepEqual(await run(`return [...${stop("Pastéis de Belém")}.querySelectorAll(".notice")].map(n => n.textContent);`), ["!Booking required: not done yet", "!Closed on Saturday"]);
    assert.equal(await run(`return ${stop("Pastéis de Belém")}.querySelector(".local").textContent;`), "Antiga Confeitaria de Belém");
    // On the map too: the card of the pin has the name on the sign and the review link.
    await run(`if(document.querySelector("[data-map]").getAttribute("aria-expanded") !== "true") document.querySelector("[data-map]").click(); document.querySelector('[data-view="live"]').click();`);
    await until("the pins", `document.querySelector('.live .pin[aria-label="Pastéis de Belém"]')`);
    await run(`document.querySelector('.live .pin[aria-label="Pastéis de Belém"]').click();`);
    await until("the card", `document.querySelector(".live .maplibregl-popup .local")`);
    assert.equal(await run(`return document.querySelector(".live .maplibregl-popup .local").textContent;`), "Antiga Confeitaria de Belém");
    assert.ok(await run(`return !!document.querySelector('.live .maplibregl-popup a[aria-label="Reviews on TheFork"]');`));
    assert.equal(await run(`return new URL([...document.querySelectorAll(".live .maplibregl-popup a")].find(a => a.textContent.startsWith("Directions")).href).searchParams.get("origin");`), "Mosteiro dos Jerónimos");
    await click("[data-map]");
    // Booked: the warning goes, Booked shows; the closing day stays until the stop moves.
    await run(`document.querySelector('[data-edit="pasteis"]').click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #stop-local")`);
    await run(`document.querySelector('[data-booking="booked"]').click(); document.getElementById("stop-day").value = "2"; document.getElementById("stop-day").dispatchEvent(new Event("change"));`);
    await submit();
    await run(`location.hash = "#day-3";`);
    await until("day 3", `${stop("Pastéis de Belém")}`);
    assert.equal(await run(`return ${stop("Pastéis de Belém")}.querySelectorAll(".notice").length;`), 0, "Sunday: open, and booked");
    assert.equal(await run(`return ${stop("Pastéis de Belém")}.querySelector(".tag.ok").textContent;`), "Booked");
    const saved = await run(`return await new Promise(r => { const q = indexedDB.open("travel-in-my-pocket"); q.onsuccess = () => { const g = q.result.transaction("trips").objectStore("trips").get("demo-lisbon"); g.onsuccess = () => { const d = g.result.trip.days[2]; r((d.plans ? d.plans[0].stops : d.stops).find(s => s.id === "pasteis")); }; }; });`);
    assert.deepEqual([saved.local, saved.booking, saved.closed], ["Antiga Confeitaria de Belém", "booked", ["sat"]]);
  });

  await step("costs: small by the stop, in full when it is opened, at home with one more tap; the trip's at the end of Info", async () => {
    // Rates kept on the phone for the last days (1 € = 1.25 $), so nothing depends on the network.
    await run(`const store = await import(new URL("js/store.js", location.href));
      const today = new Date().toISOString().slice(0, 10), days = {};
      for(const k of [0, 1, 2, 3]) days[new Date(Date.now() - k * 864e5).toISOString().slice(0, 10)] = {USD: 1.25, JPY: 160};
      for(const m of new Set(Object.keys(days).map(d => d.slice(0, 7)))) await store.setKV("rates:" + m, {fetched: today, days});`);
    await reload();
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelector('[data-edit="castelo"]')`);
    const stop = id => `document.querySelector('[data-edit="${id}"]').closest(".stop")`;
    // In the margin, in the currency it is paid in; the day's total, and what it makes at home
    // (en-US: dollars), as an estimate: the trip is still to come.
    assert.equal(await run(`return ${stop("castelo")}.querySelector(".time .cost").textContent;`), "€30");
    // Lisbon Cathedral (€10) was skipped above: left out of the day.
    assert.equal(await run(`return document.querySelector(".daycost").textContent;`), "€68 · ≈ $85");
    assert.equal(await run(`return ${stop("castelo")}.querySelector(".costrow");`), null, "closed: no cost line");
    // Opened: the cost line; one more tap: dollars, the rate and that it can change.
    await run(`${stop("castelo")}.querySelector("[data-open]").click();`);
    assert.equal(await run(`return ${stop("castelo")}.querySelector(".costrow .y").textContent;`), "€30");
    assert.equal(await run(`return ${stop("castelo")}.querySelector(".costrow .rate");`), null);
    await run(`${stop("castelo")}.querySelector("[data-cost-rate]").click();`);
    assert.equal(await run(`return ${stop("castelo")}.querySelector(".costrow .rate b").textContent;`), "≈ $37.50");
    assert.match(await run(`return ${stop("castelo")}.querySelector(".costrow .rate span").textContent;`), /^Today's rate, .+: 1 \$ = 0\.8 €\. It may change by then\.$/);
    // A stop without a description opens too, for its cost.
    await run(`${stop("se")}.querySelector("[data-open]").click();`);
    assert.equal(await run(`return ${stop("se")}.querySelector(".costrow .y").textContent;`), "€10");
    // The form: the amount as people type it, the trip's currency or the traveller's own.
    await run(`document.querySelector('[data-edit="castelo"]').click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #stop-cost-amount")`);
    assert.equal(await run(`return document.getElementById("stop-cost-amount").value;`), "30");
    assert.deepEqual(await run(`return [...document.querySelectorAll('[data-money="stop-cost"] [data-cur]')].map(b => b.textContent + ":" + b.getAttribute("aria-checked"));`), ["€ EUR:true", "$ USD:false", "Other…:false"]);
    await run(`const a = document.getElementById("stop-cost-amount"); a.value = "1.234,5"; a.dispatchEvent(new Event("input"));`);
    assert.match(await run(`return document.querySelector("[data-money-hint]").textContent;`), /^≈ \$1,543\.13 · rate of .+, may change$/);
    await run(`const a = document.getElementById("stop-cost-amount"); a.value = "twelve"; a.dispatchEvent(new Event("input"));`);
    await run(`document.querySelector("dialog.sheet[open] form").requestSubmit();`);
    assert.equal(await run(`return document.querySelector("dialog.sheet[open] [data-error]").textContent;`), "Write only the amount, like 16000 or 4.50.");
    await run(`const a = document.getElementById("stop-cost-amount"); a.value = "40"; document.querySelector('[data-cur="USD"]').click();`);
    await submit();
    assert.equal(await run(`return ${stop("castelo")}.querySelector(".time .cost").textContent;`), "$40");
    const saved = await run(`return await new Promise(r => { const q = indexedDB.open("travel-in-my-pocket"); q.onsuccess = () => { const g = q.result.transaction("trips").objectStore("trips").get("demo-lisbon"); g.onsuccess = () => r(g.result.trip); }; });`);
    const castelo = saved.days[0].stops.find(s => s.id === "castelo"), se = saved.days[0].stops.find(s => s.id === "se");
    assert.deepEqual([castelo.cost, castelo.currency, se.cost, se.currency], [40, "USD", 10, undefined], "a cost in the trip's currency has no currency of its own");
    // Info: what the trip costs, folded at the end; open, a summary or a receipt, in a currency to pick.
    await run(`location.hash = "#info";`);
    await until("info", `document.querySelector("[data-costs]")`);
    assert.equal(await run(`const all = [...document.querySelectorAll("#app > section, #app > details")]; return all[all.length - 1].matches("[data-costs]") && !document.querySelector("[data-costs]").open;`), true);
    await run(`document.querySelector("[data-costs] summary").click();`);
    await until("the summary", `document.querySelector(".chero")`);
    await run(`document.querySelector('[data-cost-cur="EUR"]').click();`);
    assert.deepEqual(await run(`return [...document.querySelectorAll('[data-expense]')].map(b => b.querySelector(".a").textContent);`), ["€280", "€390"]);
    assert.ok(await run(`return document.querySelectorAll(".clist a.crow").length;`) >= 4, "a row for each day with costs");
    await run(`document.querySelector('[data-cost-view="receipt"]').click();`);
    assert.match(await run(`return document.querySelector(".receipt .tot").textContent;`), /^Total≈ €\d/);
    // An expense outside the stops: added, then deleted after the question.
    await run(`document.querySelector("[data-expense-add]").click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #exp-title")`);
    await run(`document.getElementById("exp-title").value = "Travel insurance"; const a = document.getElementById("exp-cost-amount"); a.value = "40";`);
    await submit();
    await run(`document.querySelector('[data-cost-view="sum"]').click();`);
    const added = await run(`return [...document.querySelectorAll('[data-expense]')].find(b => b.textContent.includes("Travel insurance")).dataset.expense;`);
    await run(`document.querySelector('[data-expense="${added}"]').click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] [data-delete]")`);
    await run(`document.querySelector("dialog.sheet[open] [data-delete]").click();`);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    await answer("yes");
    assert.equal(await run(`return document.querySelector('[data-expense="${added}"]');`), null);
    // The traveller's currency, on You: euro, and euro costs have nothing to convert.
    await run(`location.hash = "#me";`);
    await until("You", `document.querySelector("#home-cur")`);
    await run(`const s = document.querySelector("#home-cur"); s.value = "EUR"; s.dispatchEvent(new Event("change", {bubbles: true}));`);
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelector('[data-edit="se"]')`);
    assert.equal(await run(`return ${stop("se")}.querySelector("[data-cost-rate]");`), null);
    assert.equal(await run(`return !!${stop("castelo")}.querySelector("[data-cost-rate]");`), true, "dollars still convert");
    await run(`const st = await import(new URL("js/store.js", location.href)); await st.delKV("home");`);
  });

  await step("private expenses: by a stop or alone, out of the versions; a mistake moves with one tap; a file carries them only if asked", async () => {
    const rec = id => run(`return await new Promise(r => { const q = indexedDB.open("travel-in-my-pocket"); q.onsuccess = () => { const g = q.result.transaction("trips").objectStore("trips").get(${JSON.stringify(id)}); g.onsuccess = () => r(g.result); }; });`);
    const toastText = () => run(`return document.getElementById("toast").textContent;`);
    const before = await rec("demo-lisbon");
    assert.deepEqual(before.priv.expenses.map(x => x.cost), [24, 18]);
    assert.equal(before.trip.private, undefined, "never in the trip's versions");
    const owner = before.priv.owner;
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelector('[data-edit="castelo"]')`);
    const stop = id => `document.querySelector('[data-edit="${id}"]').closest(".stop")`;
    // Under the amount: the trip's or private. A second cost for the same stop, private.
    await run(`document.querySelector('[data-edit="castelo"]').click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #stop-cost-amount")`);
    assert.deepEqual(await run(`return [...document.querySelectorAll('[data-money="stop-cost"] [data-kind]')].map(b => b.textContent + ":" + b.getAttribute("aria-checked"));`), ["Trip:true", "Private:false"]);
    assert.equal(await run(`return document.querySelector('[data-money="stop-cost2"]').hidden;`), true);
    await run(`document.querySelector("[data-add-cost]").click();`);
    assert.equal(await run(`return document.querySelector('[data-money="stop-cost2"] [data-kind="private"]').getAttribute("aria-checked");`), "true");
    await run(`const a = document.getElementById("stop-cost2-amount"); a.value = "12"; a.dispatchEvent(new Event("input"));`);
    await submit();
    assert.match(await toastText(), /^Private expense saved\.Save the file/, "no version: nothing about one");
    const after = await rec("demo-lisbon");
    assert.equal(after.trip.version.id, before.trip.version.id, "no new version");
    assert.deepEqual(after.priv.expenses.filter(x => x.stop === "castelo").map(x => [x.cost, x.date, x.currency]), [[12, "2027-05-14", undefined]]);
    // Opened, the stop shows both.
    assert.equal(await run(`return ${stop("castelo")}.querySelector(".costrow .y").textContent;`), "$40");
    assert.equal(await run(`return ${stop("castelo")}.querySelector(".costrow .pv").textContent;`), "€12 private");
    // A mistake: the trip's cost was the private one. One choice changes both.
    await run(`document.querySelector('[data-edit="castelo"]').click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #stop-cost2-amount")`);
    assert.equal(await run(`return document.querySelector('[data-money="stop-cost2"]').hidden;`), false);
    await run(`document.querySelector('[data-money="stop-cost"] [data-kind="private"]').click();`);
    assert.equal(await run(`return document.querySelector('[data-money="stop-cost2"] [data-kind="trip"]').getAttribute("aria-checked");`), "true");
    await submit();
    const fixed = await rec("demo-lisbon");
    const castelo = fixed.trip.days[0].stops.find(s => s.id === "castelo");
    assert.deepEqual([castelo.cost, castelo.currency], [12, undefined]);
    assert.deepEqual(fixed.priv.expenses.filter(x => x.stop === "castelo").map(x => [x.cost, x.currency]), [[40, "USD"]]);
    assert.notEqual(fixed.trip.version.id, after.trip.version.id, "the trip's cost changed: a new version");
    // Info: the trip's costs and the private ones, apart; a tap moves one to the trip and back.
    await run(`location.hash = "#info";`);
    await until("the summary", `document.querySelector(".chero")`);
    assert.match(await run(`return document.querySelector(".chero .sub").textContent;`), /^Trip €[\d,]+ · Private \$[\d,]+$|^Trip .+ · Private .+$/);
    const privRows = () => run(`return [...document.querySelectorAll("[data-private-expense] b")].map(b => b.textContent);`);
    assert.equal((await privRows()).length, 3);
    assert.ok((await privRows()).includes("Azulejo tiles to take home (invented)"));
    await run(`document.querySelector('[data-private-expense="azulejo-tiles-to-take-home-invented"]').click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #exp-title")`);
    assert.equal(await run(`return document.querySelector('[data-money="exp-cost"] [data-kind="private"]').getAttribute("aria-checked");`), "true");
    await run(`document.querySelector('[data-money="exp-cost"] [data-kind="trip"]').click();`);
    await submit();
    assert.equal((await privRows()).length, 2);
    const moved = await run(`return [...document.querySelectorAll("[data-expense]")].find(b => b.textContent.includes("Azulejo")).dataset.expense;`);
    await run(`document.querySelector('[data-expense="${moved}"]').click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #exp-title")`);
    await run(`document.querySelector('[data-money="exp-cost"] [data-kind="private"]').click();`);
    await submit();
    assert.equal((await privRows()).length, 3);
    assert.equal((await rec("demo-lisbon")).trip.expenses.length, 2, "back out of the trip");
    // Saving: without them for someone else (the same version), with them for oneself.
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-act="save"][data-id="demo-lisbon"]')`);
    // The page was reloaded since the first file: catch the download again.
    await run(`window.__files = []; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = b => { window.__files.push(b); return make(b); }; HTMLAnchorElement.prototype.click = function(){ window.__name = this.download; };`);
    await run(`navigator.canShare = () => false;`);
    await run(`document.querySelector('[data-act="save"][data-id="demo-lisbon"]').click();`);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    await answer("without");
    const without = JSON.parse(await run(`return await window.__files[0].text();`));
    assert.equal(without.private, undefined);
    assert.equal(await run(`return !!document.querySelector(".unsaved");`), true, "the private ones are not saved yet");
    await run(`document.querySelector('[data-act="save"][data-id="demo-lisbon"]').click();`);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    await answer("with");
    const withThem = JSON.parse(await run(`return await window.__files[1].text();`));
    assert.equal(withThem.version.id, without.version.id, "the same version, with or without them");
    assert.deepEqual([withThem.private.owner, withThem.private.expenses.length], [owner, 3]);
    assert.equal(await run(`return !!document.querySelector(".unsaved");`), false);
    // Someone else's file: their private expenses stay out, this phone's are never mixed with them.
    await sendFile({...withThem, private: {owner: "p-bbbbbbbbbbbb", expenses: [{title: "A watch", cost: 900}]}});
    assert.match(await toastText(), /someone else's: left out/);
    assert.equal((await rec("demo-lisbon")).priv.expenses.length, 3);
    // A file an assistant wrote, with private expenses that are no one's yet: asked, and taken.
    await sendFile({format: "travel-in-my-pocket/2", title: "A weekend", days: [{date: "2027-06-05", stops: [{title: "Bookshop"}]}], private: {expenses: [{title: "Two books", cost: 30}]}});
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    assert.equal(await run(`return document.querySelector("dialog.ask h2").textContent;`), "Private expenses in the file");
    await answer("yes");
    assert.match(await toastText(), /Private expenses added: 1\./);
    const weekend = await rec("a-weekend-2027-06-05");
    assert.deepEqual([weekend.priv.owner, weekend.priv.expenses[0].title], [owner, "Two books"]);
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-act="open"][data-id="demo-lisbon"]')`);
    await run(`document.querySelector('[data-act="open"][data-id="demo-lisbon"]').click(); await new Promise(r => setTimeout(r, 300));`);
  });

  await step("a .json file shared on Android is loaded, through the service worker", async () => {
    await run(`await navigator.serviceWorker.ready;`);
    if(!await run(`return !!navigator.serviceWorker.controller;`)){ await reload(); await until("the service worker", `!!navigator.serviceWorker.controller`); }
    const shared = {format: "travel-in-my-pocket/changes", trip: "demo-lisbon", changes: [{update: {day: "2027-05-14", stop: "se", set: {tag: "Shared as a file"}}}]};
    await run(`const fd = new FormData(); fd.append("title", "changes.json"); fd.append("file", new File([${JSON.stringify(JSON.stringify(shared))}], "changes.json", {type: "application/json"})); const res = await fetch("share", {method: "POST", body: fd}); window.__shareStatus = res.status; location.href = location.pathname + "?shared=1#day-1";`);
    await until("the change applied", `[...document.querySelectorAll(".eyebrow")].some(e => e.textContent === "Shared as a file")`);
    assert.equal(await run(`return location.search;`), "", "nothing left in the address");
    assert.equal(await run(`return (await caches.open("timp-share").then(c => c.match("shared"))) === undefined;`), true, "read once, then gone");
  });

  await step("deleting a trip asks first; Escape or Cancel keep it", async () => {
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-act="remove"][data-id="evil"]')`);
    const remove = `document.querySelector('[data-act="remove"][data-id="evil"]').click();`;
    await run(remove);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    assert.match(await run(`return document.querySelector("dialog.ask p").textContent;`), /is removed from this phone, with its ticks and its versions/);
    await run(`document.querySelector("dialog.ask").dispatchEvent(new Event("cancel", {cancelable: true})); await new Promise(r => setTimeout(r, 100));`);
    assert.equal(await count('[data-act="remove"][data-id="evil"]'), 1, "Escape keeps the trip");
    await run(remove);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    await run(`document.querySelector('dialog.ask [data-answer="yes"]').click(); await new Promise(r => setTimeout(r, 400));`);
    assert.equal(await count('[data-act="remove"][data-id="evil"]'), 0);
  });

  await step("a locked trip stays at its version: no edit, no changes pasted, no deleting; unlocked, as before", async () => {
    const card = `[...document.querySelectorAll(".tripcard")].find(c => c.querySelector('[data-id="demo-lisbon"]'))`;
    await run(`location.hash = "#trips";`);
    await until("the trip", `${card} && ${card}.querySelector('[data-act="lock"]')`);
    const version = await run(`return ${card}.querySelector("[data-version]").dataset.version;`);
    await run(`${card}.querySelector('[data-act="lock"]').click();`);
    await until("asked", `document.querySelector("dialog.ask[open]")`);
    assert.equal(await text("dialog.ask #ask-title"), "Lock this trip?");
    await run(`document.querySelector('dialog.ask [data-answer="yes"]').click(); await new Promise(r => setTimeout(r, 300));`);
    assert.equal(await run(`return ${card}.querySelector("[data-locked]").textContent;`), "Locked");
    assert.equal(await run(`return ${card}.querySelector('[data-act="lock"]').textContent;`), "Unlock");
    // The day: said so, no + button.
    await run(`${card}.querySelector('[data-act="open"]') && ${card}.querySelector('[data-act="open"]').click(); location.hash = "#day-1";`);
    await until("the day", `document.querySelector(".lock-note")`);
    assert.equal(await run(`return document.querySelector(".fabs .fab").hidden;`), true);
    // Changes pasted (an assistant's): not taken.
    const changes = {format: "travel-in-my-pocket/changes", trip: "demo-lisbon", changes: [{update: {day: "2027-05-14", stop: "comercio", set: {time: "09:45"}}}]};
    await run(`location.hash = "#trips"; await new Promise(r => setTimeout(r, 200)); document.querySelector('[data-act="paste"]').click(); await new Promise(r => setTimeout(r, 200)); document.querySelector("#paste-text").value = ${JSON.stringify(JSON.stringify(changes))}; document.querySelector("#paste-text").closest("form").requestSubmit(); await new Promise(r => setTimeout(r, 600));`);
    await until("refused", `/is locked: these changes were not taken/.test(document.querySelector("#app .errbox") ? document.querySelector("#app .errbox").textContent : "")`);
    await run(`location.hash = "#trips";`);
    await until("the trip", `${card}`);
    assert.equal(await run(`return ${card}.querySelector("[data-version]").dataset.version;`), version, "still at its version");
    // Deleting: refused, said.
    await run(`${card}.querySelector('[data-act="remove"]').click();`);
    await until("said", `/unlock it in Trips to delete it/.test(document.getElementById("toast").textContent)`);
    assert.equal(await run(`return !!document.querySelector("dialog.ask[open]");`), false, "not even asked");
    // Unlocked: as before.
    await run(`${card}.querySelector('[data-act="lock"]').click();`);
    await until("asked", `document.querySelector("dialog.ask[open]")`);
    await run(`document.querySelector('dialog.ask [data-answer="yes"]').click(); await new Promise(r => setTimeout(r, 300));`);
    assert.equal(await run(`return !!${card}.querySelector("[data-locked]");`), false);
    await run(`location.hash = "#day-1";`);
    await until("the day", `document.querySelector(".stop")`);
    assert.equal(await run(`return document.querySelector(".fabs .fab").hidden || !!document.querySelector(".lock-note");`), false);
  });

  await step("Trips: the open trip on top; the others a line each, grouped by when, sorted, found; a line opens to its trip", async () => {
    // More trips on this phone: one under way, one coming, two past (two years).
    await run(`
      const st = await import(new URL("js/store.js", location.href)), tr = await import(new URL("js/trips.js", location.href));
      const vs = (await import(new URL("js/objects.js", location.href))).versionStore(await st.backend());
      const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
      const mk = async (id, title, from, n, city, at) => {
        const days = Array.from({length: n}, (_, i) => ({date: day(from + i), city, stops: [{title: "Stop " + (i + 1)}]}));
        const {trip} = await tr.prepare({format: "travel-in-my-pocket/2", id, title, days});
        await vs.put(trip);
        await st.putTrip({id, trip, importedAt: at, fileName: "", exported: trip.version.id});
      };
      await mk("now-trip", "Zagreb now", -1, 5, "Zagreb", 1);
      await mk("next-trip", "Bergen next", 30, 3, "Bergen", 2);
      await mk("past-a", "Athens before", -400, 3, "Athens", 3);
      await mk("past-b", "Oslo before", -40, 2, "Oslo", 4);
      await st.setKV("active", "now-trip");`);
    await reload();
    await run(`location.hash = "#trips";`);
    await until("the page", `document.querySelector(".active-trip")`);
    assert.equal(await text(".active-trip .t span"), "Zagreb now");
    assert.match(await text(".active-trip .eyebrow"), /^Under way · day 2 of 5$/);
    const groups = await run(`return [...document.querySelectorAll(".trip-group")].map(h => h.textContent);`);
    assert.equal(groups[0], "Coming");
    assert.ok(groups.slice(1).every(g => /^Past · \d{4}$/.test(g)), groups.join(", "));
    const titles = () => run(`return [...document.querySelectorAll(".trip-row summary .t > span:first-child")].map(s => s.textContent);`);
    assert.equal((await titles())[0], "Bergen next", "coming first");
    assert.ok((await titles()).indexOf("Oslo before") < (await titles()).indexOf("Athens before"), "the latest past first");
    // By name: one list, in order. Kept for next time.
    await run(`const s = document.querySelector("[data-trips-sort]"); s.value = "name"; s.dispatchEvent(new Event("change", {bubbles: true}));`);
    const byName = await titles();
    assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b, "en")));
    assert.equal(await run(`return document.querySelectorAll(".trip-group").length;`), 0);
    // Found by a city.
    if(await run(`return !!document.querySelector("[data-trips-search]");`)){
      await run(`const s = document.querySelector("[data-trips-search]"); s.value = "oslo"; s.dispatchEvent(new Event("input", {bubbles: true}));`);
      assert.deepEqual(await titles(), ["Oslo before"]);
      await run(`const s = document.querySelector("[data-trips-search]"); s.value = ""; s.dispatchEvent(new Event("input", {bubbles: true}));`);
    }
    // A line opens to its trip's details; Open makes it the open trip.
    await run(`[...document.querySelectorAll(".trip-row")].find(d => d.textContent.includes("Bergen next")).querySelector("summary").click();`);
    await run(`[...document.querySelectorAll(".trip-row")].find(d => d.textContent.includes("Bergen next")).querySelector('[data-act="open"]').click();`);
    await until("opened", `document.querySelector(".stop")`);
    await run(`location.hash = "#trips";`);
    await until("the page", `document.querySelector(".active-trip")`);
    assert.equal(await text(".active-trip .t span"), "Bergen next");
    assert.match(await text(".active-trip .eyebrow"), /^In 30 days$/);
    await run(`const s = document.querySelector("[data-trips-sort]"); s.value = "date"; s.dispatchEvent(new Event("change", {bubbles: true}));`);
  });

  await step("a phone coming from 2.1 moves its full copies of versions into pieces", async () => {
    // Rebuild the 2.1 database: a trip, and two versions kept as full copies.
    const {trip: v1} = await prepare(JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8")));
    const v2 = await commit(addStop(v1, {date: "2027-05-14"}, {time: "12:15", title: "Gelato"}).trip, v1);
    // A page of the same site without the app, so nothing keeps the database open.
    await run(`location.href = location.origin + "/examples/demo-trip.json";`);
    await until("a page without the app", `location.pathname === "/examples/demo-trip.json"`);
    await run(`await new Promise(r => { const d = indexedDB.deleteDatabase("travel-in-my-pocket"); d.onsuccess = d.onerror = d.onblocked = r; });
      await new Promise((resolve, reject) => {
        const q = indexedDB.open("travel-in-my-pocket", 2);
        q.onupgradeneeded = () => { const db = q.result; db.createObjectStore("trips", {keyPath: "id"}); db.createObjectStore("kv"); db.createObjectStore("versions"); };
        q.onsuccess = () => {
          const db = q.result, tx = db.transaction(["trips", "versions", "kv"], "readwrite");
          const v1 = ${JSON.stringify(v1)}, v2 = ${JSON.stringify(v2)};
          tx.objectStore("trips").put({id: v2.id, trip: v2, importedAt: 1, fileName: "old.json", exported: v1.version.id});
          tx.objectStore("versions").put(v1, v1.id + "@" + v1.version.id);
          tx.objectStore("versions").put(v2, v2.id + "@" + v2.version.id);
          tx.objectStore("kv").put(v2.id, "active");
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      });`);
    await run(`location.href = location.origin + "/#day-1";`);
    await until("the trip, opened by 2.2", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent === "Gelato")`);
    const counts = await run(`return await new Promise(r => { const q = indexedDB.open("travel-in-my-pocket"); q.onsuccess = () => { const db = q.result, tx = db.transaction(["versions", "commits", "objects"]); const out = {version: db.version}; let n = 0; for(const s of ["versions", "commits", "objects"]){ const c = tx.objectStore(s).count(); c.onsuccess = () => { out[s] = c.result; if(++n === 3){ db.close(); r(out); } }; } }; });`);
    assert.equal(counts.version, 3);
    assert.equal(counts.versions, 0, "the full copies are gone");
    assert.equal(counts.commits, 2, "both versions are kept, as commits");
    assert.ok(counts.objects > 10, `${counts.objects} pieces`);
  });
  await step("the Content-Security-Policy blocked nothing the app needs", async () => {
    assert.deepEqual(blocked(), []);
  });
}).then(() => { const api = fakeService(); return withApp(ctx => accountSteps({...ctx, service: api.state}), {api, host: "localhost"}); }).then(() => {
  console.log(`e2e: OK (${passed} checks)`);
}).catch(e => {
  console.error("e2e: FAILED");
  process.exit(1);
});

// The sharing service, faked: what js/share-api.js promises, and checks of what the
// browser sends. The real one is tested in its own repository.
function fakeService(){
  const b64 = s => Buffer.from(s).toString("base64url");
  const users = new Map(), keys = new Map(), codes = new Set(["TEST-CODE-0000-0001"]), sessions = new Map(), challenges = new Map();
  const trips = new Map(), privs = new Map();   // the service's trips and private expenses
  const chat = {answered: "", unlinked: false}; // a chat app's request, then its link
  let n = 0;
  const clone = v => JSON.parse(JSON.stringify(v));
  const pubs = new Map();                       // trip → its page, once published
  const summary = t => { const h = t.versions.get(t.head); return {id: t.id, localId: t.localId, title: h.title, head: t.head, role: "owner", visibility: pubs.has(t.id) ? "link" : "private",
    firstDay: h.days[0].date, lastDay: h.days[h.days.length - 1].date, days: h.days.length, updatedAt: "2026-11-19T00:00:00.000Z", ...(pubs.has(t.id) ? {publication: pubs.get(t.id)} : {})}; };
  const client = cred => JSON.parse(Buffer.from(cred.response.clientDataJSON, "base64url").toString());
  const calls = [], refuse = new Set();         // what the phone asked; local ids the service fails on
  const deleted = [];                           // accounts deleted
  const invites = new Map(), members = new Map(); // token → {trip, role, usedBy, revoked}; trip → user → role
  const flags = {stale: false};                 // the sign-in no longer recent (more than ten minutes ago)
  const recovery = new Map();                   // recovery code → {who, used}
  const handler = async (method, path, body, headers) => {
    calls.push(method + " " + path);
    if(method === "POST" && path === "/v1/trips" && body.trip && refuse.has(body.trip.id)) return {status: 500, body: {error: "server: something went wrong"}};
    const ok = b => ({status: 200, body: b}), no = (status, error) => ({status, body: {error}});
    const user = handle => ({id: "u-" + handle, handle, name: "", since: "2026-11-19T00:00:00.000Z"});
    const session = handle => { const token = "tok-" + ++n; sessions.set(token, handle); return ok({token, user: user(handle)}); };
    if(method === "POST" && path === "/v1/auth/register/options"){
      if(!codes.has(body.code)) return no(403, "code: not valid, expired or used");
      const id = "c" + ++n, challenge = b64("challenge-" + id);
      challenges.set(id, {challenge, handle: body.handle});
      return ok({challengeId: id, publicKey: {challenge, rp: {id: "localhost", name: "TIMP"}, user: {id: b64("u-" + body.handle), name: body.handle, displayName: body.handle},
        pubKeyCredParams: [{type: "public-key", alg: -7}], authenticatorSelection: {residentKey: "required", userVerification: "required"}, attestation: "none"}});
    }
    if(method === "POST" && path === "/v1/auth/register"){
      const c = challenges.get(body.challengeId), cred = body.credential, cd = client(cred);
      // What the real service needs: the challenge signed for this page, the key apart.
      if(!c || cd.type !== "webauthn.create" || cd.challenge !== c.challenge || !cd.origin.startsWith("http://localhost:")) return no(400, "passkey: could not be checked");
      if(!cred.response.publicKey || !cred.response.authenticatorData || cred.response.publicKeyAlgorithm !== -7) return no(400, "passkey: could not be checked");
      codes.clear();
      users.set(c.handle, true);
      keys.set(cred.id, c.handle);
      return session(c.handle);
    }
    // Every passkey lost: a recovery code, then a new passkey; every other device out.
    if(method === "POST" && path === "/v1/auth/recover/options"){
      const h = String(body.handle || "").trim().replace(/^@/, "").toLowerCase(), code = String(body.code || "").trim().toUpperCase(), r = recovery.get(code);
      if(!r || r.used || r.who !== h) return no(401, "recovery: handle or code not valid");
      const id = "c" + ++n, challenge = b64("challenge-" + id);
      challenges.set(id, {challenge, handle: h, recover: code});
      return ok({challengeId: id, publicKey: {challenge, rp: {id: "localhost", name: "TIMP"}, user: {id: b64("u-" + h), name: h, displayName: h},
        pubKeyCredParams: [{type: "public-key", alg: -7}], authenticatorSelection: {residentKey: "required", userVerification: "required"}, attestation: "none"}});
    }
    if(method === "POST" && path === "/v1/auth/recover"){
      const c = challenges.get(body.challengeId), cred = body.credential, cd = client(cred);
      if(!c || !c.recover || cd.type !== "webauthn.create" || cd.challenge !== c.challenge) return no(400, "passkey: could not be checked");
      const r = recovery.get(c.recover);
      if(r.used) return no(401, "recovery: handle or code not valid");
      r.used = true;
      // A reset: the other passkeys and every session go.
      for(const [tk, h] of sessions) if(h === c.handle) sessions.delete(tk);
      for(const [k, h] of keys) if(h === c.handle) keys.delete(k);
      keys.set(cred.id, c.handle);
      return session(c.handle);
    }
    if(method === "POST" && path === "/v1/auth/login/options"){
      const id = "c" + ++n, challenge = b64("challenge-" + id);
      challenges.set(id, {challenge});
      return ok({challengeId: id, publicKey: {challenge, rpId: "localhost", userVerification: "required"}});
    }
    if(method === "POST" && path === "/v1/auth/login"){
      const c = challenges.get(body.challengeId), cred = body.credential, cd = client(cred);
      if(!c || cd.type !== "webauthn.get" || cd.challenge !== c.challenge || !keys.has(cred.id) || !cred.response.signature) return no(401, "sign-in: failed");
      flags.stale = false;
      return session(keys.get(cred.id));
    }
    const who = sessions.get(String(headers.authorization || "").replace("Bearer ", ""));
    // Sharing: invites (a token, once), what is pending, members; accepting one.
    // Publishing: owner only; the choices checked as the contract says.
    const pb = path.match(/^\/v1\/trips\/([^/]+)\/publication$/);
    if(pb){
      if(!who) return no(401, "sign in first");
      const t = trips.get(pb[1]);
      if(!t || t.owner !== who) return no(404, "trip: not found");
      if(method === "DELETE"){ if(!pubs.has(t.id)) return no(404, "page: this trip is not published"); pubs.delete(t.id); return ok({ok: true}); }
      if(!["hidden", "real"].includes(body.dates) || !body.remove || typeof body.remove !== "object") return no(400, "publication: dates and remove");
      const before = pubs.get(t.id), at = "2026-11-20T18:00:00.000Z";
      pubs.set(t.id, {page: before ? before.page : "pagefortest" + String(++n).padStart(3, "0"), version: body.version || t.head, level: "link", dates: body.dates,
        publishedAt: before ? before.publishedAt : at, updatedAt: at});
      handler.state.lastPublish = body;
      return ok(pubs.get(t.id));
    }
    const sh = path.match(/^\/v1\/trips\/([^/]+)\/(invites|members)(?:\/([^/]+))?$/);
    if(sh || path === "/v1/invites/accept"){
      if(!who) return no(401, "sign in first");
      if(path === "/v1/invites/accept"){
        const inv = invites.get(body.token);
        if(!inv || inv.revoked) return no(404, "invite: not found or expired");
        if(inv.usedBy && inv.usedBy !== who) return no(410, "invite: already used");
        inv.usedBy = who;
        members.set(inv.trip, new Map([...(members.get(inv.trip) || []), [who, inv.role]]));
        return ok({...summary(trips.get(inv.trip)), role: inv.role});
      }
      const [, id, what, sub] = sh, t = trips.get(id);
      if(!t || t.owner !== who) return no(404, "trip: not found");
      if(what === "invites" && method === "POST"){ const token = "invite-token-" + ++n + "-abcdefgh"; invites.set(token, {trip: id, role: body.role}); return ok({token, role: body.role, expires: "2026-12-04T00:00:00.000Z"}); }
      if(what === "invites" && method === "GET") return ok({invites: [...invites].filter(([, i]) => i.trip === id && !i.usedBy && !i.revoked).map(([tk, i]) => ({id: "id-" + tk, role: i.role, expires: "2026-12-04T00:00:00.000Z"}))});
      if(what === "invites" && method === "DELETE"){ const i = invites.get(sub.replace(/^id-/, "")); if(!i) return no(404, "invite: not found"); i.revoked = true; return ok({ok: true}); }
      if(what === "members" && method === "GET") return ok({members: [{handle: who, role: "owner"}, ...[...(members.get(id) || [])].map(([u, r]) => ({id: "u-" + u, handle: u, role: r}))]});
      return no(404, "not found");
    }
    const m = path.match(/^\/v1\/trips(?:\/([^/]+)(?:\/(push|private|versions)(?:\/([^/]+))?)?)?$/);
    if(m && !who) return no(401, "sign in first");
    if(m && method === "GET" && !m[1]) return ok({trips: [...trips.values()].filter(t => t.owner === who || (members.get(t.id) || new Map()).has(who))
      .map(t => t.owner === who ? summary(t) : {...summary(t), role: members.get(t.id).get(who)})});
    if(m && m[1] && !m[2] && method === "DELETE"){ trips.delete(m[1]); return ok({ok: true}); }
    if(m && method === "POST" && !m[1]){
      const trip = body.trip, had = [...trips.values()].find(t => t.owner === who && t.localId === trip.id);
      if(!had){
        const id = "t" + ++n;
        trips.set(id, {id, owner: who, localId: trip.id, head: trip.version.id, versions: new Map([[trip.version.id, clone(trip)]])});
        return ok({trip: id, kind: "new", head: trip.version.id});
      }
      m[1] = had.id; m[2] = "push";
    }
    if(m && m[1] && m[2] === "push"){
      const t = trips.get(m[1]), trip = body.trip, head = t.versions.get(t.head), kind = relation(head, trip);
      if(kind === "same" || kind === "older") return ok({trip: t.id, kind, head: t.head});
      t.versions.set(trip.version.id, clone(trip));
      if(kind === "newer"){ t.head = trip.version.id; return ok({trip: t.id, kind, head: t.head}); }
      const baseId = commonBase(head, trip, new Set(t.versions.keys()));
      const merged = await commitMerge(mergeTrips(baseId ? t.versions.get(baseId) : null, head, trip), head, trip);
      t.versions.set(merged.version.id, merged);
      t.head = merged.version.id;
      return ok({trip: t.id, kind, head: t.head, merged});
    }
    if(m && m[1] && m[2] === "versions") return ok(clone(trips.get(m[1]).versions.get(m[3])));
    if(m && m[1] && m[2] === "private"){
      const k = who + "|" + m[1], cur = privs.get(k) || {data: null, rev: 0};
      if(method === "GET") return ok(cur);
      if(body.rev !== cur.rev) return {status: 409, body: {error: "private: changed on another phone", current: cur}};
      privs.set(k, {data: body.data, rev: cur.rev + 1});
      return ok(privs.get(k));
    }
    if(path === "/v1/account/recovery"){
      if(!who) return no(401, "sign in first");
      const mine = [...recovery.values()].filter(r => r.who === who);
      if(method === "GET") return ok({made: mine.length ? "2026-11-20T10:00:00.000Z" : null, left: mine.filter(r => !r.used).length});
      if(flags.stale) return no(403, "sign in again: this needs a sign-in from the last 10 minutes");
      for(const [code, r] of recovery) if(r.who === who) recovery.delete(code);
      const codes = Array.from({length: 10}, (_, i) => `RECO-${String(++n).padStart(4, "0")}-ABCD-EFG${i}`);
      for(const code of codes) recovery.set(code, {who, used: false});
      return ok({codes});
    }
    // Who can get in: the passkeys (one more, one taken off, never the last) and the
    // devices signed in. Adding or taking off a passkey needs a recent sign-in.
    if(path.startsWith("/v1/account/passkeys") || path.startsWith("/v1/account/sessions")){
      if(!who) return no(401, "sign in first");
      const token = String(headers.authorization || "").replace("Bearer ", "");
      const mine = () => [...keys].filter(([, h]) => h === who).map(([id]) => ({id, device: "", added: "2026-11-19T00:00:00.000Z", lastUsed: null}));
      if(path === "/v1/account/passkeys" && method === "GET") return ok({passkeys: mine()});
      if(path === "/v1/account/sessions" && method === "GET")
        return ok({sessions: [...sessions].filter(([, h]) => h === who).map(([tk]) => ({id: "s-" + tk, device: headers["user-agent"] || "", since: "2026-11-20T08:00:00.000Z", current: tk === token}))});
      if(path === "/v1/account/sessions/end" && method === "POST"){ for(const [tk, h] of sessions) if(h === who && tk !== token) sessions.delete(tk); return ok({ok: true}); }
      if(flags.stale) return no(403, "sign in again: this needs a sign-in from the last 10 minutes");
      if(path === "/v1/account/passkeys/options" && method === "POST"){
        const id = "c" + ++n, challenge = b64("challenge-" + id);
        challenges.set(id, {challenge, handle: who, adding: true});
        return ok({challengeId: id, publicKey: {challenge, rp: {id: "localhost", name: "TIMP"}, user: {id: b64("u-" + who), name: who, displayName: who},
          pubKeyCredParams: [{type: "public-key", alg: -7}], excludeCredentials: mine().map(k => ({type: "public-key", id: k.id})),
          authenticatorSelection: {residentKey: "required", userVerification: "required"}, attestation: "none"}});
      }
      if(path === "/v1/account/passkeys" && method === "POST"){
        const c = challenges.get(body.challengeId), cred = body.credential, cd = client(cred);
        if(!c || !c.adding || c.handle !== who || cd.type !== "webauthn.create" || cd.challenge !== c.challenge) return no(400, "passkey: could not be checked");
        keys.set(cred.id, who);
        return ok({ok: true});
      }
      const off = path.match(/^\/v1\/account\/passkeys\/([^/]+)$/);
      if(off && method === "DELETE"){
        const id = decodeURIComponent(off[1]);
        if(keys.get(id) !== who || mine().length < 2) return no(409, "passkey: not this account's, or its last one (an account keeps one at least)");
        keys.delete(id);
        return ok({ok: true});
      }
      return no(404, "not found");
    }
    // The account's data: a copy, and deleting it (the handle, and a passkey of it used now).
    if(path === "/v1/account/export" && method === "GET"){
      if(!who) return no(401, "sign in first");
      return ok({exportedAt: "2026-11-20T00:00:00.000Z", user: user(who), trips: [...trips.values()].filter(t => t.owner === who).map(t => ({id: t.id, role: "owner", file: t.versions.get(t.head)})),
        privateExpenses: [], linkedApps: [], audit: [{at: "2026-11-19T00:00:00.000Z", kind: "signup", route: null, detail: ""}]});
    }
    if(path === "/v1/account/delete" && method === "POST"){
      if(!who) return no(401, "sign in first");
      if(body.handle !== who) return no(400, "handle: write the account's handle to delete it");
      const c = challenges.get(body.challengeId), cred = body.credential, cd = client(cred);
      if(!c || cd.type !== "webauthn.get" || cd.challenge !== c.challenge || keys.get(cred.id) !== who) return no(403, "passkey: not one of this account");
      for(const [id, t] of trips) if(t.owner === who) trips.delete(id);
      for(const [k, h] of keys) if(h === who) keys.delete(k);
      for(const [tk, h] of sessions) if(h === who) sessions.delete(tk);
      users.delete(who);
      deleted.push(who);
      return ok({ok: true});
    }
    // The chats linked: Claude once the person said yes, until unlinked.
    if(path === "/v1/oauth/apps" && method === "GET"){
      if(!who) return no(401, "sign in first");
      return ok({apps: chat.answered === "yes" && !chat.unlinked ? [{id: "fam-1", client: "Claude", scopes: ["trips:read", "trips:write"], since: "2026-11-20T09:00:00.000Z", lastUsed: "2026-11-20T10:00:00.000Z"}] : []});
    }
    if(path === "/v1/oauth/apps/fam-1" && method === "DELETE"){
      if(!who) return no(401, "sign in first");
      chat.unlinked = true;
      return ok({ok: true});
    }
    // A chat app's request (Claude), answered by the person: the page goes back to it,
    // here the app's own address with the code, so the test can see where it went.
    if(method === "POST" && path.startsWith("/v1/oauth/")){
      if(!who) return no(401, "sign in first");
      if(body.request !== "req-0123456789abcdef" || chat.answered) return no(404, "request: expired or unknown, start again from the chat app");
      if(path === "/v1/oauth/request") return ok({client: "Claude", redirectHost: "claude.ai", scopes: ["trips:read", "trips:write", "private:read", "private:write"], expires: "2026-11-19T00:10:00.000Z"});
      // A link outlives sessions: a yes needs a recent sign-in.
      if(path.endsWith("/approve") && flags.stale) return no(403, "sign in again: this needs a sign-in from the last 10 minutes");
      chat.answered = path.endsWith("/approve") ? "yes" : "no";
      chat.scopes = body.scopes;
      return ok({redirect: `${headers.origin}/?chat=${chat.answered}#back`});
    }
    if(method === "POST" && path === "/v1/auth/logout"){
      sessions.delete(String(headers.authorization || "").replace("Bearer ", ""));
      return ok({ok: true});
    }
    return no(404, "not found");
  };
  handler.state = {trips, privs, chat, calls, refuse, deleted, invites, members, flags, sessions, recovery, pubs};
  return handler;
}

async function accountSteps({run, until, reload, page, blocked, service}){
  const text = sel => run(`const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : null;`);
  let authenticatorId = "";
  const openMe = async () => {
    await run(`location.hash = "#me";`);
    await until("the account", `document.querySelector("#app [data-me]")`);
  };
  await step("an account: made with an invitation code and a passkey, kept on the phone, signed out and in again", async () => {
    // A passkey as a phone makes it: kept on the device, opened with the fingerprint.
    await page("WebAuthn.enable", {enableUI: false});
    ({authenticatorId} = await page("WebAuthn.addVirtualAuthenticator", {options: {protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true}}));
    await run(`location.hash = "#me";`);
    await until("the account section", `document.querySelector(".acct [data-act='signup']")`);
    assert.equal(await text(".acct .who b"), "Account");
    await run(`document.querySelector(".acct [data-act='signup']").click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #acct-code")`);
    // A wrong code: said in the form, nothing made.
    await run(`document.getElementById("acct-code").value = "WRONG-CODE"; document.getElementById("acct-handle").value = "fra"; document.querySelector("dialog.sheet[open] form").requestSubmit();`);
    await until("the error", `!document.querySelector("dialog.sheet[open] [data-error]").hidden`);
    assert.equal(await text("dialog.sheet[open] [data-error]"), "That code does not work: wrong, expired or used.");
    await run(`document.getElementById("acct-code").value = "TEST-CODE-0000-0001"; document.querySelector("dialog.sheet[open] form").requestSubmit();`);
    await until("signed in", `document.querySelector(".acct .who b") && document.querySelector(".acct .who b").textContent === "@fra"`, 15000);
    assert.equal(await run(`return !!document.querySelector("dialog.sheet[open]");`), false);
    // Kept on the phone: still signed in after a reload.
    await reload();
    await run(`location.hash = "#me";`);
    await until("still signed in", `document.querySelector(".acct .who b") && document.querySelector(".acct .who b").textContent === "@fra"`);
    // Out, then in again with the same passkey (the phone lists it; one here).
    // On You: the account, its actions, the circle at the top right with its initial.
    assert.equal(await text("#me-btn span"), "F");
    assert.equal(await run(`return document.getElementById("me-btn").getAttribute("aria-current");`), "page");
    await run(`document.querySelector("#app [data-me='signout']").click();`);
    await until("signed out", `document.querySelector(".acct [data-act='signin']")`);
    await run(`document.querySelector(".acct [data-act='signin']").click();`);
    await until("signed in again", `document.querySelector(".acct .who b") && document.querySelector(".acct .who b").textContent === "@fra"`, 15000);
    assert.deepEqual(blocked(), []);
  });

  await step("signed in, trips go to the account and come back: a change made on another phone arrives here", async () => {
    // A trip on this phone (the example, with its private expenses): it goes up by itself.
    await run(`location.hash = "#trips";`);
    await until("the welcome screen", `document.querySelector('[data-act="demo"]')`);
    await run(`document.querySelector('[data-act="demo"]').click();`);
    await until("the trip", `document.querySelectorAll(".stop").length > 0`);
    for(let i = 0; i < 50 && !service.trips.size; i++) await new Promise(r => setTimeout(r, 200));
    assert.equal(service.trips.size, 1, "the trip went up");
    for(let i = 0; i < 50 && !service.privs.size; i++) await new Promise(r => setTimeout(r, 200));
    assert.deepEqual([...service.privs.values()][0].data.expenses.map(x => x.cost), [24, 18], "and its private expenses, for this account only");
    // Another phone of the same account adds a stop.
    const t = [...service.trips.values()][0], head = t.versions.get(t.head);
    const other = await commit(addStop(head, {date: "2027-05-14"}, {time: "22:00", title: "Added on the other phone"}).trip, head);
    t.versions.set(other.version.id, other);
    t.head = other.version.id;
    await run(`location.hash = "#trips";`);
    await until("synced", `document.querySelector('[data-sync="ok"]')`, 15000);
    assert.equal(await text(".tripcard .where"), "On your account");
    await run(`document.querySelector('[data-act="sync"]').click();`);
    await run(`location.hash = "#day-1";`);
    await until("the other phone's stop", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent.includes("Added on the other phone"))`, 15000);
    await run(`location.hash = "#trips";`);
    await until("synced again", `document.querySelector('[data-sync="ok"]')`, 15000);
    assert.equal(await run(`return !!document.querySelector(".tripcard .unsaved");`), false, "on the account: no file needed to keep it");
    assert.deepEqual(blocked(), []);
  });

  await step("a trip on the account: taken off this phone only stays away, comes back on request, or is deleted everywhere", async () => {
    const card = `document.querySelector('[data-act="remove"][data-id="demo-lisbon"]')`;
    const remove = async choice => {
      await run(`${card}.click();`);
      await until("the question", `document.querySelector("dialog.ask[open]")`);
      assert.deepEqual(await run(`return [...document.querySelectorAll("dialog.ask [data-answer]")].map(b => b.textContent);`), ["Cancel", "This phone only", "From my account"]);
      await answer(choice);
    };
    const answer = id => run(`document.querySelector('dialog.ask [data-answer="${id}"]').click(); await new Promise(r => setTimeout(r, 600));`);
    await run(`location.hash = "#trips";`);
    await until("the trip", card);
    await remove("here");
    assert.match(await text("#toast"), /Taken off this phone: it is still on your account\./);
    assert.equal(service.trips.size, 1, "still on the account");
    // A sync does not bring it back.
    await run(`location.hash = "#trips";`);
    await until("the account", `document.querySelector('[data-act="sync"]')`);
    await run(`document.querySelector('[data-act="sync"]').click();`);
    await until("synced", `document.querySelector('[data-sync="ok"]') && !document.querySelector('[data-sync="busy"]')`, 15000);
    await new Promise(r => setTimeout(r, 500));
    assert.equal(await run(`return !!${card};`), false, "not downloaded again");
    // On request, it comes back.
    await run(`document.querySelector('[data-act="unhide"]').click();`);
    await until("back", card, 15000);
    // From the account: gone everywhere, only once the trip's name is written.
    await remove("all");
    await until("the name asked", `document.querySelector("dialog.ask[open] .ask-type input")`);
    assert.equal(await text("dialog.ask[open] #ask-title"), "Delete from your account?");
    const forever = `document.querySelector('dialog.ask[open] [data-answer="yes"]')`;
    const write = v => run(`const i = document.querySelector("dialog.ask[open] .ask-type input"); i.value = ${JSON.stringify(v)}; i.dispatchEvent(new Event("input"));`);
    assert.equal(await run(`return ${forever}.disabled;`), true, "nothing written: it cannot be pressed");
    await write("Lisbon");
    assert.equal(await run(`return ${forever}.disabled;`), true, "another name: still not");
    assert.equal(service.trips.size, 1, "nothing deleted yet");
    await write("  lisbon in my pocket   (EXAMPLE) ");
    assert.equal(await run(`return ${forever}.disabled;`), false, "the name, whatever the case and spaces");
    await run(`${forever}.click(); await new Promise(r => setTimeout(r, 600));`);
    assert.match(await text("#toast"), /Deleted from your account and every phone\./);
    assert.equal(service.trips.size, 0);
    assert.equal(await run(`return !!${card};`), false);
  });

  await step("a chat app asks for the trips: the person sees who, what for and where the answer goes, and answers", async () => {
    // An unknown or late request: said, nothing else.
    await run(`location.hash = "#authorize=req-unknown-0000000000";`);
    await until("said", `/expired or was already answered/.test(document.getElementById("toast").textContent)`);
    assert.equal(await run(`return location.hash;`), "", "the request leaves the address");
    await run(`location.hash = "#authorize=req-0123456789abcdef";`);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    assert.equal(await text("dialog.ask #ask-title"), "Connect Claude to TIMP?");
    assert.equal(await text("dialog.ask h3"), "Claude will be able to, as @fra:");
    assert.deepEqual(await run(`return [...document.querySelectorAll("dialog.ask li")].map(li => li.textContent);`), ["read your trips and those shared with you", "change your trips and those you can edit"]);
    assert.equal(await text("dialog.ask p"), "Then you go back to claude.ai.");
    assert.deepEqual(await run(`return [...document.querySelectorAll("dialog.ask [data-answer]")].map(b => b.textContent);`), ["Deny", "Allow"]);
    assert.equal(await run(`return document.activeElement.dataset.answer;`), "no", "the safe answer first");
    // The private expenses: asked by the chat app, left out unless ticked.
    assert.equal(await text("dialog.ask .ask-check span"), "Also my private expenses: read them and change them");
    assert.equal(await run(`return document.querySelector("dialog.ask .ask-check input").checked;`), false);
    // The sign-in is not recent: the passkey asked again, then the yes goes.
    service.flags.stale = true;
    await run(`document.querySelector('dialog.ask [data-answer="yes"]').click();`);
    await until("asked to confirm", `document.querySelector("dialog.ask[open] #ask-title") && document.querySelector("dialog.ask[open] #ask-title").textContent === "Confirm it is you"`, 15000);
    await run(`document.querySelector('dialog.ask[open] [data-answer="yes"]').click();`);
    await until("back to the chat app", `location.search === "?chat=yes"`, 15000);
    assert.equal(service.flags.stale, false, "signed in again first");
    assert.equal(service.chat.answered, "yes");
    assert.deepEqual(service.chat.scopes, ["trips:read", "trips:write"], "allowed: the trips, not the private expenses");
    assert.deepEqual(blocked(), []);
  });

  await step("linked chats: what each can do and since when; unlinking asks first, then stops it", async () => {
    await run(`location.hash = "#me";`);
    await until("the account", `document.querySelector("#app [data-me='chats']")`);
    await run(`document.querySelector("#app [data-me='chats']").click();`);
    await until("the list", `document.querySelector("dialog.sheet[open] [data-chat]")`);
    assert.equal(await text("dialog.sheet[open] h2"), "Linked chats");
    assert.equal(await text("dialog.sheet[open] [data-chat] b"), "Claude");
    assert.equal(await text("dialog.sheet[open] [data-chat] small"), "reads and changes your trips");
    assert.match(await run(`return document.querySelectorAll("dialog.sheet[open] [data-chat] small")[1].textContent;`), /^linked .+$/);
    assert.match(await run(`return document.querySelectorAll("dialog.sheet[open] [data-chat] small")[2].textContent;`), /^last used .+$/);
    // Cancel keeps it.
    await run(`document.querySelector("dialog.sheet[open] [data-unlink]").click();`);
    await until("the question", `document.querySelector("dialog.ask[open]")`);
    assert.equal(await text("dialog.ask #ask-title"), "Unlink Claude?");
    await run(`document.querySelector('dialog.ask [data-answer="no"]').click();`);
    assert.equal(service.chat.unlinked, false);
    await run(`document.querySelector("dialog.sheet[open] [data-unlink]").click();`);
    await until("the question again", `document.querySelector("dialog.ask[open]")`);
    await run(`document.querySelector('dialog.ask [data-answer="yes"]').click();`);
    await until("gone from the list", `!document.querySelector("dialog.sheet[open] [data-chat]")`);
    assert.equal(service.chat.unlinked, true);
    assert.match(await text("dialog.sheet[open] [data-chats]"), /No chat app is linked/);
    await until("said", `/Unlinked: Claude\./.test(document.getElementById("toast").textContent)`);
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
    // The sheet goes on its "close" event, a moment after the tap (later on a slow machine).
    await until("the sheet gone", `!document.querySelector("dialog.sheet")`);
    assert.deepEqual(blocked(), []);
  });

  await step("a trip the service fails on does not stop the others, and says why; one no longer on the account goes back on request", async () => {
    // A trip made on another phone of the account, and the example here, which the service fails on.
    const {trip: other} = await prepare({...splitPrivate(JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"))).trip, id: "other-phone", title: "From the other phone"});
    service.trips.set("t-other", {id: "t-other", owner: "fra", localId: "other-phone", head: other.version.id, versions: new Map([[other.version.id, other]])});
    service.refuse.add("demo-lisbon");
    service.calls.length = 0;
    await run(`location.hash = "#trips";`);
    await until("the account", `document.querySelector('[data-act="demo"]')`);
    await run(`document.querySelector('[data-act="demo"]').click();`);
    await until("the trip", `document.querySelectorAll(".stop").length > 0`);
    await run(`location.hash = "#trips";`);
    const demoCard = `[...document.querySelectorAll(".tripcard")].find(c => c.querySelector('[data-id="demo-lisbon"]'))`;
    await until("said on its card", `${demoCard} && ${demoCard}.querySelector("[data-sync-error]")`, 15000);
    assert.equal(await run(`return ${demoCard}.querySelector("[data-sync-error]").textContent;`), "Not synced: server: something went wrong. It will try again.");
    assert.equal(await text(".sync-line small[data-sync]"), "1 trip(s) not synced: see the cards below");
    const failedAt = service.calls.indexOf("POST /v1/trips");
    assert.ok(failedAt >= 0 && service.calls.indexOf("GET /v1/trips/t-other/private") > failedAt, "the other trip was still synced after it: " + service.calls.join(", "));
    // The service works again: the next sync takes it, the card says nothing more.
    service.refuse.clear();
    await run(`document.querySelector('[data-act="sync"]').click();`);
    await until("synced", `document.querySelector('[data-sync="ok"]') && !${demoCard}.querySelector("[data-sync-error]")`, 15000);
    assert.equal(service.trips.size, 2);
    // Deleted from the account on another phone: kept here, marked; on request, back on the account.
    const id = [...service.trips.values()].find(t => t.localId === "demo-lisbon").id;
    service.trips.delete(id);
    await run(`document.querySelector('[data-act="sync"]').click();`);
    await until("marked", `${demoCard}.querySelector('[data-act="reup"]')`, 15000);
    assert.equal(await run(`return ${demoCard}.querySelector(".where").textContent;`), "No longer on your account: on this phone only");
    await run(`${demoCard}.querySelector('[data-act="reup"]').click();`);
    await until("back", `/Back on your account\./.test(document.getElementById("toast").textContent)`, 15000);
    assert.equal(await run(`return ${demoCard}.querySelector(".where").textContent;`), "On your account");
    assert.ok([...service.trips.values()].some(t => t.localId === "demo-lisbon"), "on the account again, as a new trip");
    assert.deepEqual(blocked(), []);
  });

  await step("sharing: the owner sees who has it, makes a link for one person, takes it back; a link received brings a trip shared with you", async () => {
    await run(`location.hash = "#trips";`);
    const card = `[...document.querySelectorAll(".tripcard")].find(c => c.querySelector('[data-id="demo-lisbon"]'))`;
    await until("the trip on the account", `${card} && ${card}.querySelector('[data-act="share-trip"]')`, 15000);
    await run(`${card}.querySelector('[data-act="share-trip"]').click();`);
    await until("the sheet", `document.querySelector("dialog.sheet[open] [data-person]")`);
    assert.match(await text("dialog.sheet[open] h2"), /^Share “Lisbon in my pocket \(example\)”$/);
    assert.equal(await text("dialog.sheet[open] [data-person] small"), "owner · you");
    await run(`document.querySelector("dialog.sheet[open] [data-role]").value = "edit"; document.querySelector("dialog.sheet[open] [data-make]").click();`);
    await until("the link", `!document.querySelector("dialog.sheet[open] [data-link]").hidden && document.querySelector("dialog.sheet[open] [data-invite]")`);
    assert.match(await run(`return document.querySelector("dialog.sheet[open] [data-link-text]").value;`), /#invite=invite-token-\d+-abcdefgh$/);
    assert.equal(await text("dialog.sheet[open] [data-invite] b"), "can change it");
    await run(`document.querySelector("dialog.sheet[open] [data-revoke]").click();`);
    await until("taken back", `!document.querySelector("dialog.sheet[open] [data-invite]")`);
    assert.ok([...service.invites.values()].every(i => i.revoked));
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
    // A trip of someone else's, and an invite to it, received as a link.
    const {trip: theirs} = await prepare({...splitPrivate(JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"))).trip, id: "from-ugo", title: "Ugo's trip"});
    service.trips.set("t-ugo", {id: "t-ugo", owner: "ugo", localId: "from-ugo", head: theirs.version.id, versions: new Map([[theirs.version.id, theirs]])});
    service.invites.set("for-fra-from-ugo-0001", {trip: "t-ugo", role: "read"});
    await run(`location.hash = "#invite=for-fra-from-ugo-0001";`);
    await until("taken", `/“Ugo's trip” is among your trips, shared with you/.test(document.getElementById("toast").textContent)`, 15000);
    assert.equal(await run(`return location.hash;`), "#day-1", "opened, the invite gone from the address");
    await run(`location.hash = "#trips";`);
    await until("its card", `document.querySelector(".active-trip .t span") && document.querySelector(".active-trip .t span").textContent === "Ugo's trip"`);
    assert.equal(await text(".active-trip .where"), "Shared with you, read only: your changes stay on this phone");
    // The same link again, by someone else: refused.
    service.invites.get("for-fra-from-ugo-0001").usedBy = "eve";
    await run(`location.hash = "#invite=for-fra-from-ugo-0001";`);
    await until("said", `/already used by someone else/.test(document.getElementById("toast").textContent)`);
    assert.deepEqual(blocked(), []);
  });

  await step("publishing with the link: what was found shown first, choices sent, the page's address, a sign on the card; withdrawn", async () => {
    await run(`location.hash = "#trips";`);
    const card = `[...document.querySelectorAll(".tripcard")].find(c => c.querySelector('[data-id="demo-lisbon"]'))`;
    await until("the trip on the account", `${card} && ${card}.querySelector('[data-act="share-trip"]')`, 15000);
    await run(`${card}.querySelector('[data-act="share-trip"]').click();`);
    await until("the sheet", `document.querySelector("dialog.sheet[open] [data-pub-make]")`);
    assert.match(await text("dialog.sheet[open] [data-pub] .foot"), /never shows up in searches/);
    await run(`document.querySelector("dialog.sheet[open] [data-pub-make]").click();`);
    await until("the review", `document.querySelector("dialog.sheet[open] #publish-title")`);
    assert.equal(await text("dialog.sheet[open] #publish-title"), "Publish “Lisbon in my pocket (example)”");
    // Found in the example: where you sleep, three nights; ticked (taken out).
    assert.deepEqual(await run(`return [...document.querySelectorAll("dialog.sheet[open] .found-row b")].map(b => b.textContent);`), ["Where you sleep: address and notes (3)"]);
    assert.equal(await run(`return document.querySelector('dialog.sheet[open] [data-take="stays"]').checked;`), true);
    // A trip not over yet: its dates hidden unless chosen.
    assert.equal(await run(`return document.querySelector('dialog.sheet[open] [data-dates="hidden"]').getAttribute("aria-pressed");`), "true");
    assert.match(await text("dialog.sheet[open] .publish .foot:last-of-type"), /./);
    await run(`document.querySelector('dialog.sheet[open] [data-take="stays"]').click(); document.querySelector("dialog.sheet[open] #publish-title").closest("form").requestSubmit();`);
    await until("published", `/Published: send the link/.test(document.getElementById("toast").textContent)`, 15000);
    assert.deepEqual(service.lastPublish, {dates: "hidden", remove: {codes: true, phones: true, emails: true, stays: false}}, "the stays kept, as unticked");
    await until("its address", `document.querySelector("dialog.sheet[open] [data-pub-link]")`);
    assert.match(await run(`return document.querySelector("dialog.sheet[open] [data-pub-link]").value;`), /\/t\/pagefortest\d{3}$/);
    assert.match(await text("dialog.sheet[open] [data-pub] .foot"), /^Version \w+ published on .+\. Dates shown as days of the week\.$/);
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
    await until("the sign on its card", `${card} && ${card}.querySelector("[data-published]")`, 15000);
    // Withdrawn, asked first.
    await run(`${card}.querySelector('[data-act="share-trip"]').click();`);
    await until("the sheet", `document.querySelector("dialog.sheet[open] [data-pub-off]")`);
    await run(`document.querySelector("dialog.sheet[open] [data-pub-off]").click();`);
    await until("asked", `document.querySelector("dialog.ask[open] #ask-title") && document.querySelector("dialog.ask[open] #ask-title").textContent === "Withdraw the page?"`);
    await run(`document.querySelector('dialog.ask[open] [data-answer="yes"]').click();`);
    await until("withdrawn", `/Withdrawn: the page no longer opens/.test(document.getElementById("toast").textContent)`, 15000);
    assert.equal(service.pubs.size, 0);
    await until("a way to publish again", `document.querySelector("dialog.sheet[open] [data-pub-make]")`);
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
    await until("no sign on its card", `${card} && !${card}.querySelector("[data-published]")`, 15000);
    assert.deepEqual(blocked(), []);
  });

  await step("passkeys and devices: one more after the passkey asked again, one taken off but never the last, the other devices signed out", async () => {
    const openDevices = async () => {
      await openMe();
      await run(`document.querySelector("#app [data-me='devices']").click();`);
      await until("the lists", `document.querySelector("dialog.sheet[open] [data-keys] .chat") && document.querySelector("dialog.sheet[open] [data-sessions] .chat")`);
    };
    const answer = async (title, id = "yes") => {
      await until(`asked: ${title}`, `document.querySelector("dialog.ask[open] #ask-title") && document.querySelector("dialog.ask[open] #ask-title").textContent === ${JSON.stringify(title)}`, 15000);
      await run(`document.querySelector('dialog.ask[open] [data-answer="${id}"]').click();`);
    };
    const toastSays = re => until(`the toast: ${re}`, `${re}.test(document.getElementById("toast").textContent)`, 15000);
    await openDevices();
    // One passkey: no Remove, and why; one device, this one: nobody else to sign out.
    assert.equal(await run(`return document.querySelectorAll("dialog.sheet[open] [data-remove-key]").length;`), 0);
    assert.match(await text("dialog.sheet[open] [data-keys] .foot"), /only passkey/);
    assert.equal(await run(`return document.querySelector("dialog.sheet[open] [data-end-others]").hidden;`), true);
    assert.deepEqual(await run(`return [...document.querySelectorAll("dialog.sheet[open] [data-current] .who > *")].map(e => e.textContent);`), ["Linux · Chrome", "this device"]);
    // The sign-in is old: the passkey asked again first, then the new one made; this
    // device has one of the account already, and says so.
    service.flags.stale = true;
    await run(`document.querySelector("dialog.sheet[open] [data-add-key]").click();`);
    await answer("Confirm it is you");
    await answer("Confirmed. Go on?");
    assert.equal(service.flags.stale, false, "signed in again");
    await toastSays(/already has a passkey of your account/);
    assert.equal([...service.sessions.values()].filter(h => h === "fra").length, 1, "the old session ended with the new one");
    // A device without one (its passkeys gone): added, recent sign-in, no question.
    await page("WebAuthn.clearCredentials", {authenticatorId});
    await run(`document.querySelector("dialog.sheet[open] [data-add-key]").click();`);
    await toastSays(/Passkey added/);
    await until("two passkeys", `document.querySelectorAll("dialog.sheet[open] [data-keys] .chat").length === 2`);
    // The older one taken off, asked first.
    await run(`document.querySelector("dialog.sheet[open] [data-remove-key]").click();`);
    await answer("Remove this passkey?");
    await toastSays(/Passkey removed/);
    await until("one passkey", `document.querySelectorAll("dialog.sheet[open] [data-keys] .chat").length === 1`);
    // Another device signed in: signed out from here, this one stays.
    service.sessions.set("tok-tablet", "fra");
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
    await openDevices();
    assert.equal(await run(`return document.querySelectorAll("dialog.sheet[open] [data-sessions] .chat").length;`), 2);
    await run(`document.querySelector("dialog.sheet[open] [data-end-others]").click();`);
    await answer("Sign out all other devices?");
    await toastSays(/other devices are signed out/);
    assert.equal(service.sessions.has("tok-tablet"), false);
    await until("only this device", `document.querySelectorAll("dialog.sheet[open] [data-sessions] .chat").length === 1`);
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
    assert.deepEqual(blocked(), []);
  });

  await step("recovery codes: made, shown once, made again only when asked; every passkey lost, one lets you in with a new passkey, once", async () => {
    await openMe();
    await run(`document.querySelector("#app [data-me='devices']").click();`);
    await until("the codes' state", `!document.querySelector("dialog.sheet[open] [data-make-codes]").hidden`);
    assert.match(await text("dialog.sheet[open] [data-recovery]"), /^None yet/);
    await run(`document.querySelector("dialog.sheet[open] [data-make-codes]").click();`);
    await until("the codes", `!document.querySelector("dialog.sheet[open] [data-codes]").hidden`);
    const first = (await run(`return document.querySelector("dialog.sheet[open] [data-codes] textarea").value;`)).split("\n");
    assert.equal(first.length, 10);
    await until("counted", `/^10 of 10 still usable/.test(document.querySelector("dialog.sheet[open] [data-recovery]").textContent)`);
    assert.equal(await text("dialog.sheet[open] [data-make-codes]"), "Make new codes");
    // Again: asked first, the old ones void.
    await run(`document.querySelector("dialog.sheet[open] [data-make-codes]").click();`);
    await until("asked", `document.querySelector("dialog.ask[open] #ask-title") && document.querySelector("dialog.ask[open] #ask-title").textContent === "Make new recovery codes?"`);
    await run(`document.querySelector('dialog.ask[open] [data-answer="yes"]').click();`);
    await until("new codes", `document.querySelector("dialog.sheet[open] [data-codes] textarea").value.split("\\n")[0] !== ${JSON.stringify(first[0])}`);
    const codes = (await run(`return document.querySelector("dialog.sheet[open] [data-codes] textarea").value;`)).split("\n");
    assert.equal(service.recovery.has(first[0]), false);
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
    // Signed out, and the phone's passkeys lost.
    service.sessions.set("tok-old-tablet", "fra");
    await openMe();
    await run(`document.querySelector("#app [data-me='signout']").click();`);
    await until("signed out", `document.querySelector(".acct [data-act='signup']")`, 15000);
    await page("WebAuthn.clearCredentials", {authenticatorId});
    await run(`document.querySelector(".acct [data-act='signup']").click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] [data-recover]")`);
    await run(`document.querySelector("dialog.sheet[open] [data-recover]").click();`);
    await until("the recovery form", `document.querySelector("dialog.sheet[open] #rec-code")`);
    // A wrong code: said, nothing else.
    await run(`document.getElementById("rec-handle").value = "@fra"; document.getElementById("rec-code").value = "AAAA-BBBB-CCCC-DDDD"; document.querySelector("dialog.sheet[open] form").requestSubmit();`);
    await until("refused", `!document.querySelector("dialog.sheet[open] [data-error]").hidden`);
    assert.equal(await text("dialog.sheet[open] [data-error]"), "That handle or recovery code is not valid.");
    // The right one, typed loosely: a new passkey, signed in, every other device out.
    await run(`document.getElementById("rec-code").value = ${JSON.stringify(" " + codes[3].toLowerCase() + " ")}; document.querySelector("dialog.sheet[open] form").requestSubmit();`);
    await until("signed in", `document.querySelector(".acct .who b") && document.querySelector(".acct .who b").textContent === "@fra"`, 20000);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /^Signed in as @fra, with a new passkey: the others and the linked chats no longer work/);
    assert.deepEqual([...service.sessions.values()].filter(h => h === "fra").length, 1, "the old tablet signed out");
    assert.equal(service.recovery.get(codes[3]).used, true);
    assert.deepEqual(blocked(), []);
  });

  await step("the account: a copy of its data; deleted for good with the handle and the passkey, the trips staying on the phone", async () => {
    await openMe();
    assert.deepEqual(await run(`return [...document.querySelectorAll("#app [data-me]")].map(b => b.textContent);`), ["Passkeys and devices", "Linked chats", "Export my data", "Sign out", "Delete account"]);
    service.calls.length = 0;
    await run(`document.querySelector("#app [data-me='export']").click();`);
    await until("the copy made", `/Your data is in the file/.test(document.getElementById("toast").textContent)`, 15000);
    assert.ok(service.calls.includes("GET /v1/account/export"));
    // Deleting: the handle first (nothing happens without it), then the passkey.
    await openMe();
    await run(`document.querySelector("#app [data-me='delete']").click();`);
    await until("the handle asked", `document.querySelector("dialog.ask[open] .ask-type input")`);
    assert.equal(await text("dialog.ask[open] #ask-title"), "Delete your account?");
    assert.equal(await run(`return document.querySelector('dialog.ask[open] [data-answer="yes"]').disabled;`), true);
    await run(`const i = document.querySelector("dialog.ask[open] .ask-type input"); i.value = "fra"; i.dispatchEvent(new Event("input"));`);
    await run(`document.querySelector('dialog.ask[open] [data-answer="yes"]').click();`);
    await until("deleted", `/Account deleted/.test(document.getElementById("toast").textContent)`, 15000);
    assert.deepEqual(service.deleted, ["fra"]);
    assert.equal([...service.trips.values()].filter(t => t.owner === "fra").length, 0, "its trips gone from the service (someone else's stay)");
    // Signed out; the trips stay on this phone, as this phone's.
    await run(`location.hash = "#me";`);
    await until("signed out", `document.querySelector(".acct [data-act='signup']")`);
    await run(`location.hash = "#trips";`);
    await until("the trips", `document.querySelector(".tripcard")`);
    assert.ok(await run(`return document.querySelectorAll(".tripcard").length > 0;`), "the trips stay");
    assert.equal(await run(`return [...document.querySelectorAll(".tripcard .where")].length;`), 0, "none says it is on an account");
    assert.deepEqual(blocked(), []);
  });
}
