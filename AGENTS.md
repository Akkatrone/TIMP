# AGENTS.md

Instructions for AI coding agents working in this repository.
People: start from [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

Travel in my pocket is a static web app (a PWA, no framework, no build step to run it)
that shows a day-by-day travel guide on a phone and works offline. The app is generic
and public. Each trip is a private JSON file that a traveller loads on their own device.

You will get one of two kinds of request here. Work out which one before you start.

## Rules that always apply

- **Never commit, publish or paste anywhere public a real trip file or an API key.**
  Real trips live in `private/` (ignored by Git) or outside the repository. Do not move
  them elsewhere, do not `git add -f` them, and do not copy their content into tests,
  examples, screenshots, issues, commit messages or pull requests.
- The only trip data allowed in the repository is invented, like `examples/demo-trip.json`.
- `npm run check` fails if a trip file or a Google key is about to be tracked. Run it
  before you say a task is done.

## Request A: create or update a trip file

Someone wants their itinerary turned into a file for the app. No code changes.

1. Read [docs/creating-a-trip.md](docs/creating-a-trip.md) and follow it step by step.
2. Use [docs/trip-format.md](docs/trip-format.md) as the reference for every field,
   and [examples/demo-trip.json](examples/demo-trip.json) as a model.
3. Save the file as `private/<trip-id>.json`.
4. Check it and read the map summary:

   ```bash
   node tools/validate-trip.mjs --map private/<trip-id>.json
   ```

5. Tell the person what you could not verify (coordinates, prices, opening hours) and
   how to load the file on a phone.

## Request B: change the app

### Commands

```bash
python3 -m http.server 4173      # run it: http://localhost:4173/ (any static server works)
npm run check                    # example trip, offline file list, no private data
npm test                         # unit tests (node:test, no dependencies)
npm run e2e                      # the app in headless Chrome, with the example trip
node tools/check-precache.mjs --fix   # after adding or removing a file of the app
npm run screenshots              # retake the README pictures
```

Nothing needs installing. Node 20+ is used only by the checks and tools; `e2e` and
`screenshots` also need Chrome or Chromium (`CHROME=/path/to/chrome` if not found).

### Where things are

| Path | What it does |
|---|---|
| `js/app.js` | Screens, navigation, events. The only file that touches the page. |
| `js/trip.js` | Trip format validation. No DOM: also runs under Node. |
| `js/geo.js` | Map zones and the offline sketch. No DOM. |
| `js/livemap.js` | Interactive map: Google Maps, or Leaflet + OpenStreetMap. |
| `js/store.js` | IndexedDB storage, with a memory fallback. |
| `js/i18n.js` | Interface texts, every language. |
| `js/util.js` | Escaping, links, dates. No DOM. |
| `sw.js` | Service worker: offline copy of the app. |
| `tools/`, `test/` | Checks, build, tests. `tools/e2e.mjs` drives a real browser. |
| `vendor/` | Third-party code, unmodified. Do not edit. |

### What a change must respect

The project makes three promises. Do not break them, even if asked for a feature that
seems to need it: say so instead.

1. **The trip never leaves the device.** No accounts, no server, no analytics, no
   request that carries trip data.
2. **It works offline.** Everything except the interactive map, after one online visit.
3. **Anyone can host it.** Static files only; running it needs no build and no
   installed dependency.

And these rules:

- **Text from a trip file is untrusted.** It reaches the page only through `esc()` or
  `rich()` from `js/util.js`. Values used in styles or URLs are validated in `js/trip.js`.
- **The trip format is a contract.** Adding an optional field is fine. Renaming,
  removing or changing the meaning of a field is a breaking change and needs a new
  format version. A new field needs: a rule in `js/trip.js`, a test in
  `test/trip.test.mjs`, an entry in `docs/trip-format.md`, and a mention in
  `docs/creating-a-trip.md` if it changes how a trip should be written.
- **Interface texts** go in `js/i18n.js`, in every language. A test compares the keys.
- **No new dependencies, bundlers or frameworks.** No third-party scripts, fonts or
  requests at startup.
- **Never edit `VERSION` in `sw.js`.** The build stamps it from the content.
- Keep the code style of the file you are in: plain ES modules, two-space indent.

### Before you finish

- `npm run check`, `npm test` and `npm run e2e` pass. If you changed what a traveller
  sees or taps, `tools/e2e.mjs` checks it.
- You looked at the change at phone width, in the light and the dark theme, and with
  the server stopped if it touches storage or the service worker.
- If the pictures in the README no longer match the app, retake them.
- You say plainly what you could not test. Real iPhones and Android phones behave
  differently from a desktop browser, and you probably did not have one.
