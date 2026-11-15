#!/usr/bin/env node
// Retakes the screenshots used in the README, from the example trip.
//   node tools/screenshots.mjs
//
// Needs Chrome or Chromium on this computer (set CHROME=/path/to/chrome if it is
// not found) and a connection, for the map tiles. Nothing else to install: the
// script serves the project itself and drives the browser over the DevTools protocol.
// Only the example trip is ever loaded, so no private data can end up in a picture.

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./lib/app-files.mjs";

const OUT = join(ROOT, "docs", "screenshots");
const PHONE = {width: 375, height: 812, deviceScaleFactor: 2, mobile: true};
const TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png"};

/* ---------- a static server for the project ---------- */

function serve(){
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(ROOT, path === "" || path.endsWith("/") ? path + "index.html" : path);
    // Never serve the folders that hold real trips.
    if(!file.startsWith(ROOT) || /^(private|originale)([/\\]|$)/.test(path)){ res.writeHead(404).end(); return; }
    try{
      const data = await readFile(file);
      res.writeHead(200, {"content-type": TYPES[extname(file)] || "application/octet-stream"}).end(data);
    }catch(e){
      res.writeHead(404).end();
    }
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/* ---------- Chrome over the DevTools protocol ---------- */

function findChrome(){
  const names = [process.env.CHROME, "chromium", "chromium-browser", "google-chrome", "google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"].filter(Boolean);
  for(const name of names){
    const probe = spawnSync(name, ["--version"], {stdio: "ignore"});
    if(!probe.error && probe.status === 0) return name;
  }
  throw new Error("Chrome or Chromium not found. Set CHROME=/path/to/chrome and run again.");
}

async function launch(profile){
  const flags = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--disable-gpu",
    ...(process.env.CHROME_FLAGS ? process.env.CHROME_FLAGS.split(" ") : []), "about:blank"];
  const chrome = spawn(findChrome(), flags, {stdio: ["ignore", "ignore", "pipe"]});
  const wsUrl = await new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(() => reject(new Error("Chrome did not start:\n" + log)), 20000);
    chrome.stderr.on("data", chunk => {
      log += chunk;
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if(m){ clearTimeout(timer); resolve(m[1]); }
    });
    chrome.on("exit", code => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}):\n${log}`)); });
  });
  return {chrome, wsUrl};
}

async function connect(wsUrl){
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("cannot reach Chrome")); });
  let next = 0;
  const waiting = new Map();
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    const w = waiting.get(msg.id);
    if(!w) return;
    waiting.delete(msg.id);
    msg.error ? w.reject(new Error(msg.error.message)) : w.resolve(msg.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next;
    waiting.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, method, params, sessionId}));
  });
  const {targetId} = await send("Target.createTarget", {url: "about:blank"});
  const {sessionId} = await send("Target.attachToTarget", {targetId, flatten: true});
  const page = (method, params) => send(method, params, sessionId);
  return {page, close: () => ws.close()};
}

/* ---------- the pictures ---------- */

async function main(){
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const profile = await mkdtemp(join(tmpdir(), "timp-shots-"));
  const {chrome, wsUrl} = await launch(profile);
  try{
    const {page, close} = await connect(wsUrl);

    // Runs code in the page and returns its result. Errors in the page fail the script.
    const run = async code => {
      const r = await page("Runtime.evaluate", {expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true});
      if(r.exceptionDetails) throw new Error("in the page: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const until = async (what, condition, ms = 20000) => {
      const end = Date.now() + ms;
      while(Date.now() < end){
        if(await run(`return !!(${condition});`)) return;
        await new Promise(r => setTimeout(r, 150));
      }
      throw new Error("timed out waiting for: " + what);
    };
    const theme = value => page("Emulation.setEmulatedMedia", {features: [{name: "prefers-color-scheme", value}]});
    const shoot = async name => {
      // No message bubble and no focus ring left over from the clicks above.
      await run(`document.getElementById("toast").hidden = true; if(document.activeElement) document.activeElement.blur(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`);
      const {data} = await page("Page.captureScreenshot", {format: "png"});
      await writeFile(join(OUT, name), Buffer.from(data, "base64"));
      console.log("  docs/screenshots/" + name);
    };
    // Puts the title of the day just under the strip of days, as after a short scroll.
    const scrollToTitle = `scrollTo(0, document.querySelector(".headrow").getBoundingClientRect().top + scrollY - document.querySelector(".strip").offsetHeight - 14);`;

    await page("Emulation.setDeviceMetricsOverride", PHONE);
    await page("Emulation.setLocaleOverride", {locale: "en-US"});
    await theme("light");
    await page("Page.enable");
    await page("Page.navigate", {url: base});
    await until("the welcome screen", `document.querySelector('[data-act="demo"]')`);
    await mkdir(OUT, {recursive: true});
    console.log("Writing:");

    // 1. The programme of a day, with two stops done.
    await run(`document.querySelector('[data-act="demo"]').click();`);
    await until("the example trip", `document.querySelectorAll("[data-tick]").length > 1`);
    await run(`for(const i of [0, 1]) document.querySelectorAll("[data-tick]")[i].click(); scrollTo(0, 0);`);
    await shoot("programme.png");

    // 2. The interactive map.
    await run(`document.querySelector("[data-map]").click(); document.querySelector('[data-view="live"]').click();`);
    await until("the map tiles", `document.querySelectorAll(".leaflet-tile").length > 0 && document.querySelectorAll(".leaflet-tile").length === document.querySelectorAll(".leaflet-tile-loaded").length`, 40000);
    await run(scrollToTitle);
    await new Promise(r => setTimeout(r, 600)); // tiles fade in
    await shoot("map.png");

    // 3. The sketch that replaces it offline.
    await run(`document.querySelector('[data-view="schema"]').click(); ${scrollToTitle}`);
    await until("the sketch", `document.querySelector(".mapsvg")`);
    await shoot("sketch.png");

    // 4. A day with alternative plans, in the dark theme.
    await theme("dark");
    await run(`document.querySelector("[data-map]").click(); location.hash = "#day-3";`);
    await until("day 3", `document.querySelector("[data-plan]")`);
    await run(`scrollTo(0, 0);`);
    await shoot("plans-dark.png");

    close();
  }finally{
    chrome.kill();
    server.close();
    await rm(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}).catch(() => {});
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
