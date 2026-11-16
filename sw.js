// Service worker: keeps a copy of the app on the device so it opens without a connection.
// Trip files are NOT handled here: they live in IndexedDB and never touch the network.
//
// VERSION and FILES below are for development. The published site gets both from
// tools/build.mjs: a version that changes whenever the app's content changes, and
// the exact list of files. Phones that already have the app notice the new sw.js,
// download everything again and offer an update.

const VERSION = "dev";
const SHELL = "timp-shell-" + VERSION;
const DEV = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

// Every file the app needs offline. Kept in sync by: node tools/check-precache.mjs --fix
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/app.js",
  "js/config.js",
  "js/geo.js",
  "js/i18n.js",
  "js/icons.js",
  "js/livemap.js",
  "js/store.js",
  "js/theme.js",
  "js/trip.js",
  "js/util.js",
  "vendor/leaflet/leaflet.css",
  "vendor/leaflet/leaflet.js",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "examples/demo-trip.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL).then(cache => cache.addAll(FILES.map(url => new Request(url, {cache: "reload"}))))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("timp-shell-") && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if(event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;
  const url = new URL(req.url);
  // Map tiles, Google Maps and anything else from other sites go straight to the network.
  if(url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    if(DEV){
      // While developing: always the files on disk, the copy only when the server is off.
      try{ return await fetch(req); }
      catch(e){
        const copy = await cache.match(req.mode === "navigate" ? "index.html" : req, {ignoreSearch: true});
        if(copy) return copy;
        throw e;
      }
    }
    if(req.mode === "navigate"){
      return (await cache.match("index.html")) || fetch(req);
    }
    const hit = await cache.match(req, {ignoreSearch: true});
    return hit || fetch(req);
  })());
});
