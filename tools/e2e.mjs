#!/usr/bin/env node
// Checks the app in a real browser, with the example trip: what the unit tests cannot see.
//   node tools/e2e.mjs
//
// Needs Chrome or Chromium on this computer (see tools/lib/browser.mjs).

import assert from "node:assert/strict";
import { withApp } from "./lib/browser.mjs";

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
