# Link resolver

A small, optional web service that turns a Google Maps link into what a stop needs:

```
GET https://timp-resolve.<you>.workers.dev/?url=https://maps.app.goo.gl/AbCd…
{"link": "…", "title": "Via Roma, 12", "address": "Via Roma, 12, 00184 Roma RM",
 "lat": 41.8951, "lng": 12.4823, "type": "museum"}
```

The app calls it when a short link is pasted or shared, and AI assistants that can
open web addresses can call it too (`llms.txt` says how, when the site has one).

## Why it is a separate service

The app is static files: GitHub Pages runs no code. A browser may not follow a short
link to the place (Google sends no CORS header), and the full link it leads to often
has no position. A server can follow it; OpenStreetMap then gives the position and the
kind of place. That is all this does: [`resolve.js`](resolve.js), about a hundred
lines, reusing the app's own `js/gmaps.js` and `js/trip.js`.

## What it keeps: nothing

- no storage, no database, no cookies;
- no logs: `observability` is off in [`wrangler.toml`](wrangler.toml), and the code
  writes none;
- it follows links to Google only, and only reads where they lead;
- it sends OpenStreetMap the name and address the link gave, as the app does.

What it cannot promise: Cloudflare, which runs it, and Google and OpenStreetMap, which
it asks, see the request, like any web service. The trip itself never reaches it:
only the link being added.

## Put it online (Cloudflare's free plan: 100,000 requests a day)

You need a Cloudflare account and Node 20+. From this folder:

```bash
npx wrangler login
npx wrangler deploy
```

`wrangler deploy` prints the address, like `https://timp-resolve.<you>.workers.dev`.
Open it: it answers with a line of usage. Then tell the app where it is:

1. On GitHub, in the repository: **Settings → Secrets and variables → Actions →
   Variables → New repository variable**, name `RESOLVER_URL`, value the address.
2. Publish the app again (push to `main`, or run the Deploy workflow by hand).

The build puts the address in `js/config.js` and adds it to the
Content-Security-Policy of `index.html`, the only place the page may reach it from.
Without the variable the app works as before: it reads full links on its own and asks
for the name of a short one.

## Change it

`npm test` runs `test/worker.test.mjs`, which tries it against a stand-in for Google and
OpenStreetMap. Deploy again after a change.
