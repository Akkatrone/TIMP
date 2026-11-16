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

await withApp(async ({run, until, reload}) => {
  const count = sel => run(`return document.querySelectorAll(${JSON.stringify(sel)}).length;`);
  const text = sel => run(`const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent : null;`);
  const click = (sel, i = 0) => run(`document.querySelectorAll(${JSON.stringify(sel)})[${i}].click(); await new Promise(r => setTimeout(r, 60));`);

  await step("the example trip opens on its first day", async () => {
    await click('[data-act="demo"]');
    await until("the stops", `document.querySelectorAll(".stop").length === 6`);
    assert.equal(await run(`return document.documentElement.lang;`), "en");
  });

  await step("descriptions are folded, links stay visible", async () => {
    assert.equal(await count(".desc.clamp"), await count(".desc"));
    assert.ok(await count(".stop.cut") > 0, "at least one description is cut short at phone width");
    assert.equal(await run(`return [...document.querySelectorAll(".stop .maplink, .stop .skip")].every(e => e.offsetParent !== null);`), true);
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

  await step("a stop can be skipped and restored", async () => {
    await click("[data-skip]", 2);
    assert.equal(await count(".stop.skipped"), 1);
    assert.equal(await text(".stop.skipped .skip"), "Restore");
    assert.equal(await text(".progress"), "0/6 done · 1 skipped");
    await click(".stop.skipped .skip");
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

  await step("the sketch draws done and skipped stops dashed", async () => {
    await click("[data-map]");
    await click('[data-view="schema"]');
    await until("the sketch", `document.querySelector(".mapsvg")`);
    assert.equal(await count(".mapsvg .badge"), 5);
    assert.equal(await count(".mapsvg .badge.gone"), 3);   // pins 1, 2, 3
    assert.equal(await count(".mapsvg .route"), 4);        // 1→2, 2→3, 3→4, 4→6
    assert.equal(await count(".mapsvg .route.gone"), 2);   // the legs arriving at 2 and at 3
  });

  await step("the interactive map does the same, and keeps the map when a stop is ticked", async () => {
    await click('[data-view="live"]');
    await until("the map", `document.querySelector(".live .leaflet-container") && document.querySelectorAll(".live .pin").length === 5`);
    assert.equal(await count(".live .pin.gone"), 3);
    assert.equal(await run(`return [...document.querySelectorAll(".live path.leaflet-interactive, .live .leaflet-overlay-pane path")].filter(p => p.getAttribute("stroke-dasharray")).length;`), 2);
    await run(`window.__map = document.querySelector(".live");`);
    await click("[data-tick]", 3);
    assert.equal(await run(`return window.__map === document.querySelector(".live");`), true);
    assert.equal(await count(".live .pin.gone"), 4);
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
    await until("day 1", `document.querySelector(".skip")`);
    assert.equal(await text(".stop:not(.skipped):not(.done) .skip"), "Salta");
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
    await fill("#stop-time", "12:15");
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
    await run(`document.querySelector("[data-delete]").click();`);
    assert.equal(await run(`return document.querySelector("dialog.sheet").open;`), true, "the first tap only asks");
    await run(`document.querySelector("[data-delete]").click(); await new Promise(r => setTimeout(r, 400));`);
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
    await fill("#stop-time", "Evening");
    await submit();
    assert.equal(await run(`return [...document.querySelectorAll(".stop")].find(li => li.querySelector("h3").textContent === "Tram 28").querySelector(".maplink").href;`), "https://maps.app.goo.gl/AbCdEfGh123456789?g_st=ac");
  });

  let saved = null;
  await step("the trip is saved as a file with its version, and Trips stops asking", async () => {
    await run(`location.hash = "#trips";`);
    await until("the trips page", `document.querySelector('[data-act="save"]')`);
    assert.equal(await run(`return !!document.querySelector(".unsaved");`), true);
    await run(`window.__files = []; const make = URL.createObjectURL.bind(URL); URL.createObjectURL = b => { window.__files.push(b); return make(b); }; HTMLAnchorElement.prototype.click = function(){ window.__name = this.download; };`);
    await run(`document.querySelector('[data-act="save"]').click(); await new Promise(r => setTimeout(r, 400));`);
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
    const send = trip => run(`const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(JSON.stringify(trip))}], "from-a-friend.json")); const f = document.getElementById("file"); f.files = dt.files; f.dispatchEvent(new Event("change")); await new Promise(r => setTimeout(r, 600));`);
    await send(other);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /Changes joined: 1 new, 0 changed, 0 removed · version [0-9a-f]{7}/);
    const merged = await versionOnPhone();
    assert.deepEqual([...merged.parents].sort(), [saved.version.id, other.version.id].sort());
    await run(`location.hash = "#day-2";`);
    await until("day 2", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent === "Fado evening")`);
    await run(`location.hash = "#day-1";`);
    await until("day 1", `[...document.querySelectorAll(".stop h3")].some(h => h.textContent === "Tram 28")`);
    // The same file again: this phone already has everything in it.
    await send(other);
    assert.match(await run(`return document.getElementById("toast").textContent;`), /older than the trip on this phone/);
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
}).then(() => {
  console.log(`e2e: OK (${passed} checks)`);
}).catch(e => {
  console.error("e2e: FAILED");
  process.exit(1);
});
