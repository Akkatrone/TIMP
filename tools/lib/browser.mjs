// Opens the app in headless Chrome at phone size and hands back a few helpers.
// Used by tools/screenshots.mjs and tools/e2e.mjs. No dependencies: the project is
// served by a small static server here, and Chrome is driven over the DevTools protocol.
//
// Needs Chrome or Chromium on this computer. Set CHROME=/path/to/chrome if it is
// not found, and CHROME_FLAGS for extra flags (for example "--no-sandbox" in a container).

import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./app-files.mjs";

const PHONE = {width: 375, height: 812, deviceScaleFactor: 2, mobile: true};
const TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png"};

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
  return {page: (method, params) => send(method, params, sessionId), close: () => ws.close()};
}

/**
 * Runs `work` with the app open on its welcome screen, in a fresh browser profile.
 * Helpers:
 *   run(code)             runs code in the page (it may use await and return a value)
 *   until(what, cond, ms) waits until the expression `cond` is true in the page
 *   theme("light"|"dark") switches the colour scheme
 *   reload()              reloads the page and waits for the app
 *   capture()             returns a PNG of the screen as a Buffer
 */
export async function withApp(work){
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const profile = await mkdtemp(join(tmpdir(), "timp-browser-"));
  const {chrome, wsUrl} = await launch(profile);
  try{
    const {page, close} = await connect(wsUrl);
    const run = async code => {
      const r = await page("Runtime.evaluate", {expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true});
      if(r.exceptionDetails) throw new Error("in the page: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const until = async (what, condition, ms = 20000) => {
      const end = Date.now() + ms;
      while(Date.now() < end){
        if(await run(`return !!(${condition});`)) return;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error("timed out waiting for: " + what);
    };
    const theme = value => page("Emulation.setEmulatedMedia", {features: [{name: "prefers-color-scheme", value}]});
    const ready = () => until("the app", `document.querySelector("#app") && document.querySelector("#app").children.length > 0`);
    const reload = async () => { await page("Page.reload"); await new Promise(r => setTimeout(r, 300)); await ready(); };
    const capture = async () => Buffer.from((await page("Page.captureScreenshot", {format: "png"})).data, "base64");

    await page("Emulation.setDeviceMetricsOverride", PHONE);
    await page("Emulation.setLocaleOverride", {locale: "en-US"});
    await theme("light");
    await page("Page.enable");
    await page("Page.navigate", {url: base});
    await until("the welcome screen", `document.querySelector('[data-act="demo"]')`);

    await work({run, until, theme, reload, capture, base});
    close();
  }finally{
    chrome.kill();
    server.close();
    await rm(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}).catch(() => {});
  }
}
