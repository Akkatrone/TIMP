#!/usr/bin/env node
// Checks the app in a real browser, with the example trip: what the unit tests cannot see.
//   node tools/e2e.mjs
//
// Needs Chrome or Chromium on this computer (see tools/lib/browser.mjs).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withApp } from "./lib/browser.mjs";
import { prepare } from "../js/trips.js";
import { commit } from "../js/version.js";
import { addStop } from "../js/edit.js";

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
    await click("[data-more]", 0);
    assert.equal(await count(".menu:not([hidden])"), 1);
    assert.deepEqual(await run(`return [...document.querySelectorAll(".menu:not([hidden]) [role=menuitem]")].map(b => b.textContent);`), ["Edit", "Skip"]);
    assert.equal(await run(`return document.activeElement.textContent;`), "Edit", "the first item takes the focus");
    await run(`document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));`);
    assert.equal(await count(".menu:not([hidden])"), 0);
    assert.equal(await run(`return document.activeElement.dataset.more !== undefined;`), true, "the focus goes back to ⋯");
    await click("[data-more]", 0);
    await run(`document.querySelector("h1").click();`);
    assert.equal(await count(".menu:not([hidden])"), 0);
  });

  await step("a stop can be skipped and restored", async () => {
    await click("[data-skip]", 2);
    assert.equal(await count(".stop.skipped"), 1);
    assert.equal(await text(".stop.skipped [data-skip]"), "Restore");
    assert.equal(await text(".progress"), "0/6 done · 1 skipped");
    await click(".stop.skipped [data-skip]");
    assert.equal(await count(".stop.skipped"), 0);
    await click("[data-skip]", 2);
  });

  await step("done and skipped are separate, and done wins", async () => {
    await click("[data-tick]", 0);
    assert.equal(await text(".progress"), "1/6 done · 1 skipped");
    assert.equal(await run(`return !!document.querySelector(".stop.done [data-skip]");`), false);
    await click(".stop.skipped [data-tick]");
    assert.equal(await count(".stop.skipped"), 0);
    assert.equal(await text(".progress"), "2/6 done");
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
    await until("the map", `document.querySelector(".live .leaflet-container") && document.querySelectorAll(".live .pin").length === 5`);
    assert.equal(await count(".live .pin.gone"), 3);
    const lines = `[...document.querySelectorAll(".live .leaflet-overlay-pane path")]`;
    assert.equal(await run(`return ${lines}.length;`), 3);
    assert.equal(await run(`return ${lines}.filter(p => p.getAttribute("stroke-dasharray")).length;`), 1);
    await run(`window.__map = document.querySelector(".live");`);
    await click("[data-tick]", 3);
    assert.equal(await run(`return window.__map === document.querySelector(".live");`), true);
    assert.equal(await count(".live .pin.gone"), 4);
    // Restoring the skipped stop puts it back on the route: the map is drawn again.
    await click(".stop.skipped [data-skip]");
    await until("the route through stop 2", `${lines}.length === 4`);
    await click(".stop:nth-child(2) [data-skip]");
    await until("the route past stop 2", `${lines}.length === 3`);
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
    assert.equal(await text(".progress"), "3/6 done · 1 skipped");
  });

  await step("the interface language can be chosen on the device", async () => {
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-lang="it"]')`);
    await click('[data-lang="it"]');
    assert.equal(await run(`return document.documentElement.lang;`), "it");
    await run(`location.hash = "#day-1";`);
    await until("day 1", `document.querySelector("[data-skip]")`);
    assert.equal(await text(".stop:not(.skipped):not(.done) [data-skip]"), "Salta");
    await reload();
    assert.equal(await run(`return document.documentElement.lang;`), "it");
    await run(`location.hash = "#trips";`);
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
    const lines = `document.querySelectorAll(".live .leaflet-overlay-pane path").length`;
    await until("the lines", `${lines} > 0`);
    await click("[data-route]");
    await until("no lines", `${lines} === 0 && document.querySelectorAll(".live .pin").length === 5`);
    assert.equal(await run(`return document.querySelector("[data-route]").getAttribute("aria-pressed");`), "false");
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

  await step("the dark theme can be chosen, survives a reload, and darkens the map", async () => {
    const bg = () => run(`return getComputedStyle(document.body).backgroundColor;`);
    const light = await bg();
    await run(`location.hash = "#trips";`);
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
    await until("a dark map", `document.querySelector(".live.dark .leaflet-container")`);
    await click("[data-map]");
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-theme-choice="auto"]')`);
    await click('[data-theme-choice="auto"]');
    assert.equal(await run(`return document.documentElement.dataset.theme === undefined;`), true);
    assert.equal(await bg(), light);
  });

  // Invented place link, in the shape Google Maps gives on a computer: name, address, position.
  const PLACE = "https://www.google.com/maps/place/Pastelaria+Exemplo,+Rua+Augusta+10,+Lisboa/@38.7101,-9.1375,18z/data=!4m6!3m5!1s0x0:0x0!8m2!3d38.71012!4d-9.13751";
  const fill = (sel, value) => run(`const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event("change", {bubbles: true}));`);
  const submit = () => run(`document.querySelector(".sheet form").requestSubmit(); await new Promise(r => setTimeout(r, 400));`);
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
    await until("the map in the form", `document.querySelector(".live.pick.leaflet-container") && document.querySelector(".live.pick .pickpin")`);
    await run(`const m = document.querySelector(".live.pick"), r = m.getBoundingClientRect(); m.dispatchEvent(new MouseEvent("click", {bubbles: true, clientX: r.left + r.width / 2 + 40, clientY: r.top + r.height / 2 + 30}));`);
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
    await run(`document.querySelector('[data-act="save"]').click(); await new Promise(r => setTimeout(r, 400));`);
    assert.equal(await run(`return window.__files.length;`), 1, "refused by the share sheet, the file is downloaded instead");
    saved = JSON.parse(await run(`return await window.__files[0].text();`));
    const name = await run(`return window.__name;`);
    assert.equal(name, `demo-lisbon-${saved.version.id.slice(0, 7)}.json`);
    assert.equal((await versionOnPhone()).id, saved.version.id);
    assert.equal(await run(`return !!document.querySelector(".unsaved");`), false);
  });

  await step("a file changed on another phone is joined with this one, and offered for saving", async () => {
    // The other phone: the same example trip, with its own new stop.
    const {trip: root} = await prepare(JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8")));
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

    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.getElementById("gkey")`);
    assert.equal(await status(), "statusNoKey");
    await saveKey(KEY_A);
    await until("the new status", `document.querySelector('[data-map-status="statusGoogleDevice"]')`);

    await openLiveMap();
    await until("Google to refuse key A and the map to fall back", `document.querySelector(".live .leaflet-container")`, 30000);
    assert.deepEqual(await run(`return ${googleScripts};`), [KEY_A]);
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector("[data-map-status]")`);
    assert.equal(await status(), "statusRefused");

    // The bug this guards against: the page kept using the first key it loaded.
    await run(`window.__samePage = true;`);
    await saveKey(KEY_B);
    await until("a fresh page", `!window.__samePage && document.querySelector("[data-map-status]")`);
    assert.equal(await status(), "statusGoogleDevice");
    await openLiveMap();
    await until("Google to refuse key B", `document.querySelector(".live .leaflet-container")`, 30000);
    assert.deepEqual(await run(`return ${googleScripts};`), [KEY_B]);

    // Turned off: no request to Google at all, even with a key.
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-provider="osm"]')`);
    await click('[data-provider="osm"]');
    await until("the status", `document.querySelector('[data-map-status="statusOsmChosen"]')`);
    await reload();
    await openLiveMap();
    await until("OpenStreetMap", `document.querySelector(".live .leaflet-container")`);
    assert.deepEqual(await run(`return ${googleScripts};`), []);

    // Leave the device as it was.
    await run(`location.hash = "#trips";`);
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
    assert.match(await run(`return document.querySelector("details.aihow [data-prompt]").textContent;`), /^Read http:\/\/\S+\/llms\.txt and follow it exactly\./);
    await run(`window.__copied = null; navigator.clipboard.writeText = async t => { window.__copied = t; };`);
    await run(`document.querySelector("[data-act='copy-prompt']").click(); await new Promise(r => setTimeout(r, 100));`);
    const message = await run(`return window.__copied;`);
    assert.match(message, /\[where, dates or number of days/);
    assert.ok(message.length < 400, "short enough to use on a phone");
    // For an assistant that opens no link: the same, with the format itself.
    await run(`document.querySelector("[data-act='copy-prompt-full']").click(); await new Promise(r => setTimeout(r, 100));`);
    const full = await run(`return window.__copied;`);
    assert.match(full, /TIMP trip file, format "travel-in-my-pocket\/2"/);
    assert.ok(!full.includes("llms.txt"));
    // Changing the open trip: the message carries the trip itself.
    await run(`document.querySelector("[data-act='copy-edit']").click(); await new Promise(r => setTimeout(r, 100));`);
    const edit = await run(`return window.__copied;`);
    assert.match(edit, /\[what to change\]/);
    assert.match(edit, /travel-in-my-pocket\/changes/, "how to write changes");
    assert.match(edit, /\nTrip ".*", id [a-z0-9-]+, \d+ days?\./, "the outline of the open trip");
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

  await step("Paste at the bottom takes what was copied: a place opens the form, changes are applied", async () => {
    const clip = value => run(`navigator.clipboard.readText = async () => { if(${JSON.stringify(value)} === null) throw new Error("denied"); return ${JSON.stringify(value)}; };`);
    await run(`location.hash = "#trips";`);
    await until("the Paste button", `document.querySelector(".fab-paste") && !document.querySelector(".fabs").hidden`);
    assert.equal(await run(`return document.querySelector(".fab").hidden;`), true, "no + outside a day");
    // Scrolling down it keeps only its icon; back at the top, its word again.
    const scrollBy = y => run(`const el = document.documentElement.classList.contains("own-scroll") ? document.body : document.scrollingElement; el.scrollTop = ${y}; await new Promise(r => setTimeout(r, 120));`);
    await scrollBy(0); await scrollBy(300);
    assert.equal(await run(`return document.querySelector(".fabs").classList.contains("compact");`), true, "compact while scrolling down");
    assert.equal(await run(`return document.querySelector(".fab-paste").getAttribute("aria-label");`), "Paste");
    await scrollBy(0);
    assert.equal(await run(`return document.querySelector(".fabs").classList.contains("compact");`), false, "its word back at the top");
    // A place copied from Google Maps: the stop form, filled in.
    await clip("Pastelaria Exemplo\n" + PLACE);
    await run(`document.querySelector(".fab-paste").click();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #stop-title")`);
    assert.equal(await run(`return document.getElementById("stop-title").value;`), "Pastelaria Exemplo");
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
    // An assistant's answer with changes: applied as a new version.
    const before = await versionOnPhone();
    const changes = {format: "travel-in-my-pocket/changes", trip: "demo-lisbon", changes: [{update: {day: "2027-05-14", stop: "se", set: {tag: "Pasted"}}}]};
    await clip("Sure:\n```json\n" + JSON.stringify(changes) + "\n```");
    await run(`document.querySelector(".fab-paste").click(); await new Promise(r => setTimeout(r, 600));`);
    assert.deepEqual((await versionOnPhone()).parents, [before.id]);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Changes applied: 0 added, 1 changed/);
    // The phone refuses the clipboard: a field to paste by hand, which takes a place too.
    await clip(null);
    await run(`location.hash = "#day-1"; await new Promise(r => setTimeout(r, 200)); document.querySelector(".fab-paste").click();`);
    await until("the paste field", `document.querySelector("dialog.sheet[open] #paste-text")`);
    assert.equal(await text("#paste-title"), "Paste");
    await run(`document.querySelector("#paste-text").value = ${JSON.stringify(PLACE)}; document.querySelector("#paste-text").closest("form").requestSubmit();`);
    await until("the form", `document.querySelector("dialog.sheet[open] #stop-title")`);
    assert.equal(await run(`return document.getElementById("stop-title").value;`), "Pastelaria Exemplo");
    await run(`document.querySelector("dialog.sheet[open] [data-close]").click();`);
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
}).then(() => {
  console.log(`e2e: OK (${passed} checks)`);
}).catch(e => {
  console.error("e2e: FAILED");
  process.exit(1);
});
