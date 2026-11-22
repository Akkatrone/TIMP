# AGENTS.md

Instructions for AI coding agents working in this repository. People: start from
[README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

TIMP (Travel in my pocket) is a static web app (a PWA, no framework, no build step to
run it) that shows a day-by-day travel guide on a phone and works offline. The app is
public; each trip is a private JSON file on the traveller's device. Every change is a
version of the trip, like a Git commit, and copies changed apart are joined.

You will get one of two kinds of request. Work out which one before you start.

## Rules that always apply

- **Never commit, publish or paste anywhere public a real trip file or an API key.**
  Real trips live in `private/` (ignored by Git) or outside the repository: never move
  them, never `git add -f` them, never copy their content into tests, examples,
  screenshots, issues, commit messages or pull requests. The only trip data in the
  repository is invented, like `examples/demo-trip.json`.
- `npm run check` fails if a trip file or a Google key is about to be tracked. Run it
  before you say a task is done.

## Request A: create or update a trip file

Someone wants their itinerary turned into a file for the app. No code changes.

1. Read [docs/creating-a-trip.md](docs/creating-a-trip.md) and follow it step by step.
2. Use [docs/trip-format.md](docs/trip-format.md) as the reference for every field,
   and [examples/demo-trip.json](examples/demo-trip.json) as a model.
3. Save the file as `private/<trip-id>.json`.
   **Updating a trip that already exists:** start from the latest file the app saved
   (Trips → Save the file). Keep the trip `id`, every stop `id`, the `version` block and
   `private.owner` exactly as they are: never write or change `version` or `owner`. The
   app sees that the content changed, makes a new version and joins it with the copies
   on other phones.
4. Check it and read the map summary:

   ```bash
   node tools/validate-trip.mjs --map private/<trip-id>.json
   ```

5. Tell the person what you could not verify (coordinates, prices, opening hours,
   closing days, booking rules, costs) and how to load the file on a phone.

## Request B: change the app

```bash
python3 -m http.server 4173      # run it: http://localhost:4173/ (any static server works)
npm run check                    # example trip, offline file list, contract, no private data
npm test                         # unit and property tests (node:test, no dependencies)
npm run e2e                      # the app in headless Chrome, with the example trip
node tools/check-precache.mjs --fix   # after adding or removing a file of the app
npm run screenshots              # retake the README pictures
```

Node 22+ runs the checks; `e2e` and `screenshots` also need Chrome or Chromium
(`CHROME=/path/to/chrome` if not found). **Read [CONTRIBUTING.md](CONTRIBUTING.md)
before changing code**: where everything is, the three promises, and the rules below
in full.

The rules, in one line each:

- **The three promises:** the trip never leaves the device except where
  [docs/privacy.md](docs/privacy.md) says; it works offline; anyone can host it (static
  files). A change that breaks one is not merged. A change to what leaves the phone
  goes in `docs/privacy.md` in the same change.
- **Text from a trip file is untrusted:** only through `esc()` or `rich()`
  (`js/util.js`); values for styles or URLs validated in `js/trip.js`.
- **The Content-Security-Policy stays tight** (`index.html`): no inline scripts, never
  `'unsafe-inline'`; a new host in the one directive that needs it, with its reason.
- **The trip format is a contract, and content only:** add optional fields (`FIELDS` in
  `js/trip.js`, a test, `docs/trip-format.md`); anything else needs a new format
  version and a conversion in `upgrade()`.
- **Joins are deterministic and lose nothing:** the same two versions give the same
  version on every phone (`test/versions.test.mjs`); `test/merge-properties.test.mjs`
  holds the rules of `js/merge.js` on random edits. A new kind of edit, or a new list in
  the format, gets its step in that generator in the same change. A failure names its
  seed: fix the join, never the seed.
- **Interface texts** in `js/i18n.js`, in every language (a test compares the keys).
- **No new dependencies, bundlers or frameworks**; no third-party scripts, fonts or
  requests at startup. **Never edit `VERSION` in `sw.js`**: the build stamps it.
- **The README stays short:** details go in `docs/`. `llms.txt` is generated: never
  edit it, run `node tools/check-llms.mjs --fix`.
- Keep the style of the file you are in: plain ES modules, two-space indent.

### Before you finish

- `npm run check`, `npm test` and `npm run e2e` pass. If you changed what a traveller
  sees or taps, `tools/e2e.mjs` checks it.
- You looked at the change at phone width, in the light and the dark theme, and with
  the server stopped if it touches storage or the service worker.
- If the pictures in the README no longer match the app, retake them.
- You say plainly what you could not test: real iPhones and Android phones behave
  differently from a desktop browser.
