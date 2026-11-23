#!/usr/bin/env node
// The app in WebKit, Safari's engine: the layout checks that Chrome does not catch
// (design/README.md, A11). No dependencies: WebDriver is plain HTTP.
//
// On a Mac, Safari through safaridriver (`sudo safaridriver --enable` once). On Linux,
// WebKitGTK's MiniBrowser through WebKitWebDriver (Debian, Ubuntu: webkit2gtk-driver;
// Arch: webkitgtk-6.0); without a screen, under xvfb-run. The CI runs it on Ubuntu.
//
//   node tools/webkit.mjs        # WEBKIT_DRIVER, WEBKIT_BROWSER to point at others
//
// Only the example trip is loaded, with a note and a description made very long on
// purpose: a text kept on one line must never make a page wider than the screen.

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/app-files.mjs";
import { serve } from "./lib/browser.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 4444 + Math.floor(Math.random() * 1000);
const MAC = process.platform === "darwin";
const DRIVER = process.env.WEBKIT_DRIVER || (MAC ? "safaridriver" : "WebKitWebDriver");
const driver = spawn(DRIVER, MAC ? ["-p", String(PORT)] : [`--port=${PORT}`], {stdio: "inherit"});
driver.on("error", e => { console.error(`${DRIVER}: ${e.message}`); process.exit(1); });

// What to drive: Safari on a Mac; elsewhere WebKitGTK's own small browser.
function capabilities(){
  if(MAC) return {browserName: "safari"};
  const binary = process.env.WEBKIT_BROWSER || [
    "/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser", "/usr/lib/aarch64-linux-gnu/webkit2gtk-4.1/MiniBrowser",
    "/usr/lib/x86_64-linux-gnu/webkitgtk-6.0/MiniBrowser", "/usr/lib/webkitgtk-6.0/MiniBrowser", "/usr/lib/webkit2gtk-4.1/MiniBrowser",
    "/usr/libexec/webkit2gtk-4.1/MiniBrowser", "/usr/libexec/webkitgtk-6.0/MiniBrowser"
  ].find(p => existsSync(p));
  if(!binary) throw new Error("WebKitGTK's MiniBrowser not found: set WEBKIT_BROWSER");
  return {browserName: "MiniBrowser", "webkitgtk:browserOptions": {binary, args: ["--automation"]}};
}
const base = `http://127.0.0.1:${PORT}`;

async function wd(method, path, body){
  const r = await fetch(base + path, {method, headers: {"content-type": "application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(j.value || j)}`);
  return j.value;
}

let server = null, sid = null, passed = 0;
const failures = [];
async function check(name, fn){
  try{ await fn(); passed++; console.log("  ✔ " + name); }
  catch(e){ failures.push(name); console.error("  ✖ " + name + "\n    " + e.message); }
}
const ok = (cond, msg) => { if(!cond) throw new Error(msg); };

try{
  for(let i = 0; ; i++){
    try{ await fetch(base + "/status"); break; }
    catch(e){ if(i > 75) throw new Error(`${DRIVER} did not start` + (MAC ? ": run `sudo safaridriver --enable` once" : "")); await sleep(200); }
  }
  server = await serve({});
  const app = `http://127.0.0.1:${server.address().port}/`;
  sid = (await wd("POST", "/session", {capabilities: {alwaysMatch: capabilities()}})).sessionId;
  // As narrow as Safari lets a window be: the layout must hold at any width.
  await wd("POST", `/session/${sid}/window/rect`, {width: 390, height: 844}).catch(() => {});
  await wd("POST", `/session/${sid}/url`, {url: app});

  // A script in the page, awaited; what it returns comes back.
  const run = async script => {
    const v = await wd("POST", `/session/${sid}/execute/async`, {args: [], script:
      `const done = arguments[arguments.length - 1]; (async () => { ${script} })().then(v => done({v}), e => done({error: String(e && e.stack || e)}));`});
    if(v && v.error) throw new Error("in the page: " + v.error);
    return v ? v.v : undefined;
  };
  const until = async (what, cond, ms = 20000) => {
    const end = Date.now() + ms;
    while(Date.now() < end){ try{ if(await run(`return !!(${cond});`)) return; }catch(e){} await sleep(150); }
    throw new Error("timed out waiting for: " + what);
  };

  // The example trip, with a very long note and description on its first day.
  const trip = JSON.parse(readFileSync(join(ROOT, "examples", "demo-trip.json"), "utf8"));
  delete trip.version; delete trip.private;
  Object.assign(trip, {id: "webkit-check", title: "A trip with a rather long title to see how the bar holds it"});
  const long = "Before the controls: the QR code of the arrival form ready on the phone, the passport open at the right page, the address of the first night written down " .repeat(3);
  // Every stop with a position, so the long note is what the day's line shows closed.
  for(const d of trip.days) for(const st of d.plans ? d.plans.flatMap(p => p.stops) : d.stops) if(st.lat === undefined){ st.lat = 38.7139; st.lng = -9.1334; }
  trip.days[0].notes = [long];
  const s0 = (trip.days[0].stops || trip.days[0].plans[0].stops)[0];
  s0.text = long;
  s0.title = "A stop with a name long enough to need two lines on a phone held upright";
  // Pasted, as from a chat: WebKitGTK cannot be handed a file the way Chrome is.
  await until("the app", `document.querySelector('[data-act="demo"]')`);
  await run(`document.querySelector('[data-act="demo"]').click();`);
  await until("the example trip", `document.querySelector(".stop")`);
  await run(`location.hash = "#trips";`);
  await until("Paste", `document.querySelector('[data-act="paste"]')`);
  await run(`document.querySelector('[data-act="paste"]').click();`);
  await until("the paste form", `document.querySelector("#paste-text")`);
  await run(`document.querySelector("#paste-text").value = ${JSON.stringify(JSON.stringify(trip))}; document.querySelector("#paste-text").closest("form").requestSubmit();`);
  await until("the trip", `document.title.includes("rather long title")`);

  console.log("  window: " + await run(`return innerWidth + "×" + innerHeight;`));
  const pages = ["#day-1", "#day-2", "#info", "#trips", "#me"];
  const heights = [];
  for(const h of pages){
    await check(`${h}: nothing wider than the screen`, async () => {
      await run(`location.hash = "${h}"; await new Promise(r => setTimeout(r, 400));`);
      const out = await run(`const w = innerWidth, bad = [];
        if(document.documentElement.scrollWidth > w + 1) bad.push("page " + document.documentElement.scrollWidth + " > " + w);
        for(const el of document.querySelectorAll("#app > *, .stop, .group, .dayline, .strip")) if(el.getBoundingClientRect().right > w + 1) bad.push((el.className || el.tagName) + " ends at " + Math.round(el.getBoundingClientRect().right));
        return bad;`);
      ok(!out.length, out.join("; "));
      heights.push(await run(`return document.querySelector(".strip").offsetHeight;`));
    });
  }
  await check("the bar keeps one size on every page", async () => ok(new Set(heights).size === 1, "heights: " + heights.join(", ")));

  await check("the map stays right under the bar, still, while the list scrolls", async () => {
    await run(`location.hash = "#day-2"; await new Promise(r => setTimeout(r, 300)); document.querySelector("#view-toggle [data-map]").click(); await new Promise(r => setTimeout(r, 600));`);
    for(const y of [0, 10, 300]){
      const gap = await run(`window.scrollTo(0, ${y}); await new Promise(r => setTimeout(r, 200)); return Math.abs(document.querySelector(".mapstage").getBoundingClientRect().top - document.querySelector(".strip").getBoundingClientRect().bottom);`);
      ok(gap < 1.5, `at ${y}: ${gap}px between the bar and the map`);
    }
    await run(`window.scrollTo(0, 0); document.querySelector("#view-toggle [data-view-list]").click();`);
  });

  await check("search: a field Safari does not zoom into, results fixed under the bar", async () => {
    await run(`document.getElementById("search-btn").click(); await new Promise(r => setTimeout(r, 300));`);
    const size = await run(`return parseFloat(getComputedStyle(document.getElementById("search-q")).fontSize);`);
    ok(size >= 16, `the field's text is ${size}px: Safari zooms into less than 16`);
    const box = `JSON.stringify(document.querySelector(".search-panel").getBoundingClientRect())`;
    const before = await run(`return ${box};`);
    const gap = await run(`return Math.abs(document.querySelector(".search-panel").getBoundingClientRect().top - document.querySelector(".strip").getBoundingClientRect().bottom);`);
    ok(gap < 1.5, `${gap}px between the bar and the results`);
    await run(`const q = document.getElementById("search-q"); q.value = "a"; q.dispatchEvent(new Event("input")); await new Promise(r => setTimeout(r, 200));`);
    ok(await run(`return document.querySelectorAll(".search-panel .res").length > 0;`), "no results for “a”");
    ok(await run(`return ${box};`) === before, "the panel moved or changed size as one typed");
    ok(await run(`return document.documentElement.scrollWidth <= innerWidth + 1;`), "wider than the screen while searching");
    await run(`document.getElementById("search-btn").click();`);
  });
}catch(e){
  failures.push("setup");
  console.error("  ✖ " + e.message);
}finally{
  if(sid) await wd("DELETE", `/session/${sid}`).catch(() => {});
  if(server) server.close();
  driver.kill();
}
console.log(failures.length ? `webkit: FAILED (${failures.length} of ${passed + failures.length})` : `webkit: OK (${passed} checks)`);
process.exit(failures.length ? 1 : 0);
