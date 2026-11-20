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
  "manifest-basic.webmanifest",
  "css/app.css",
  "js/account.js",
  "js/app.js",
  "js/ask.js",
  "js/changes.js",
  "js/config.js",
  "js/diff.js",
  "js/edit.js",
  "js/editor.js",
  "js/geo.js",
  "js/geocode.js",
  "js/gmaps.js",
  "js/google.js",
  "js/history.js",
  "js/i18n.js",
  "js/icons.js",
  "js/livemap.js",
  "js/merge.js",
  "js/money.js",
  "js/objects.js",
  "js/places.js",
  "js/private.js",
  "js/publish.js",
  "js/rates.js",
  "js/share-api.js",
  "js/share.js",
  "js/sharing.js",
  "js/store.js",
  "js/sun.js",
  "js/sync.js",
  "js/theme.js",
  "js/trip.js",
  "js/trips.js",
  "js/util.js",
  "js/version.js",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon-maskable.svg",
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

// Something shared to the app on Android (share_target in manifest.webmanifest): a
// place from Google Maps, an assistant's answer, a .json file. It is kept for the page
// to read once (takeShared in js/app.js), and the app opens.
const SHARED = "timp-share";
async function receiveShare(req){
  const form = await req.formData();
  const field = name => typeof form.get(name) === "string" ? form.get(name) : "";
  const file = form.get("file");
  const shared = {title: field("title"), text: field("text"), url: field("url"),
    file: file && typeof file.text === "function" && file.size < 5e6 ? await file.text() : ""};
  await (await caches.open(SHARED)).put("shared", new Response(JSON.stringify(shared)));
  return Response.redirect(new URL("./?shared=1", self.registration.scope).href, 303);
}

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if(req.method === "POST" && url.origin === self.location.origin && url.pathname === new URL(self.registration.scope).pathname + "share"){
    event.respondWith(receiveShare(req));
    return;
  }
  if(req.method !== "GET") return;
  // Map tiles, Google Maps and anything else from other sites go straight to the network.
  if(url.origin !== self.location.origin) return;
  // Pages of the site that are not the app (llms.txt, LICENSE…) are left to the
  // browser, as if there were no service worker: answering them with the app, or
  // failing to, showed an empty page or ERR_CACHE_MISS instead of the text.
  const scope = new URL(self.registration.scope).pathname;
  if(req.mode === "navigate" && url.pathname !== scope && url.pathname !== scope + "index.html") return;

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
    // The app's own page, with or without the ?title=… of a shared place.
    if(req.mode === "navigate") return (await cache.match("index.html")) || fetch(req);
    const hit = await cache.match(req, {ignoreSearch: true});
    return hit || fetch(req);
  })());
});
