# Contributing

Thank you for wanting to improve TIMP (Travel in my pocket). This page explains how the
project is put together and what a change needs before it can be merged.

## What the project promises

Three promises shape every decision. A change that breaks one of them will not be
merged, however useful it is otherwise.

1. **The trip never leaves the device.** No accounts, no server, no analytics, no
   request that carries trip data. Trip files are read locally and stored in IndexedDB.
   Two exceptions, only when a stop is added or changed: its name and address go to
   Google or OpenStreetMap to look up its position, and a Google Maps link pasted or
   shared goes to the link resolver (`worker/`), which keeps nothing.
2. **It works offline.** Everything except the interactive map must work in airplane
   mode, on iPhone and Android, after the app has been opened once.
3. **Anyone can host it.** The app is static files. No build step is needed to run it
   locally, no server-side code, no dependency to install. The link resolver is a
   separate, optional service: a copy without one works, minus the reading of short
   links.

## Run it

```bash
git clone https://github.com/Frafal/TIMP.git
cd TIMP
python3 -m http.server 4173
```

Open `http://localhost:4173/` and tap "Try the example trip". Any static server works.

There is nothing to install. Node 20 or later is needed only for the checks:

```bash
npm run check   # example trip, offline file list, no private data in the repository
npm test        # unit tests
npm run e2e     # the app in headless Chrome, with the example trip
```

All three run on every pull request. `npm run e2e` needs Chrome or Chromium; set
`CHROME=/path/to/chrome` if it is not found. When you change what a traveller sees or
taps, add a check to `tools/e2e.mjs`.

## How it is organised

| Path | What it does |
|---|---|
| `index.html`, `css/app.css` | The page and its styles. |
| `js/app.js` | Screens, navigation, events. The only file that touches the page. |
| `js/trip.js` | The trip file format: `FIELDS`, one table for every field, from which come the checks and the JSON Schema; the conversion of format 1; what the app works out (trip id, cities). No DOM. |
| `js/geo.js` | Groups stops into map zones, draws the offline sketch. No DOM. |
| `js/livemap.js` | The interactive map: Google Maps or Leaflet + OpenStreetMap. |
| `js/google.js` | Loads Google's script once per page, shared by the map and the address search. |
| `js/editor.js` | The form to add or change a stop. |
| `js/ask.js` | A question with buttons in a dialog: confirmations and choices. Use it instead of `confirm()`. |
| `js/edit.js` | Adds, changes, moves and removes stops, in time order. No DOM. |
| `js/changes.js` | Changes written by an AI assistant: an outline of the trip to send, the changes format it answers with (`travel-in-my-pocket/changes`), and applying it as one version. No DOM. |
| `js/gmaps.js` | Reads Google Maps links and shared text: name, address, position. No DOM. |
| `js/geocode.js` | Finds the coordinates of an address: Google, then OpenStreetMap. |
| `js/version.js` | Version ids, like Git's, and how two versions relate. No DOM. |
| `js/merge.js` | Three-way merge of two versions of a trip. No DOM. |
| `js/diff.js` | What changed between two versions, stop by stop: the only comparison, used by the history and by the choice when a file is loaded. No DOM. |
| `js/history.js` | The History sheet: the versions in words, and a way back to any of them. |
| `js/trips.js` | What happens on an edit or a file received: `inspect` says how a file relates to the trip on the phone, `apply` carries out the traveller's choice. Versions, merges, restores, saved marks. No DOM. |
| `js/objects.js` | Keeps versions the way Git does: snapshots made of shared pieces, each stored once under its SHA-256. No DOM. |
| `js/store.js` | Storage on the device: IndexedDB, or the same calls in memory when the browser refuses storage. The tests use the memory one. |
| `js/i18n.js` | Interface texts. |
| `js/util.js` | Escaping, links, dates. No DOM. |
| `js/icons.js` | Icons for the kinds of places (`TYPES`) and the ways of travelling (`TRAVEL`). No DOM. |
| `js/theme.js` | Applies the chosen theme before the page is drawn. Plain script. |
| `icons/` | `icon.svg` and `icon-maskable.svg` are the sources; the PNGs are made from them with `rsvg-convert` (192, 512, the maskable 512, and 180 for the iPhone, on a square without rounded corners). |
| `sw.js` | Service worker: keeps the app available offline. |
| `worker/` | The link resolver, a separate and optional service on Cloudflare Workers: a Google Maps link in, name, address, position and kind of place out. It keeps nothing. How to put it online: `worker/README.md`. |
| `tools/` | Command-line checks, the build used for publishing, the browser check and the screenshots. |
| `test/` | Unit tests (`node:test`, no dependencies). |
| `docs/trip-format.md` | The trip file format, for people who write trips. |
| `docs/creating-a-trip.md` | How to write a good trip file, for people and AI assistants. |
| `AGENTS.md` | Instructions for AI coding agents. `CLAUDE.md` only points to it. |
| `.claude/skills/create-trip-file/` | A short skill that sends the agent to the two documents above. |

The code is plain JavaScript modules, without a framework or a bundler. Please keep
it that way: it is what lets someone fork the repository and have a working copy in
two minutes.

## Rules for changes

**Text from a trip file is untrusted.** A trip file can come from anyone. Everything
from it goes through `esc()` or `rich()` in `js/util.js` before reaching the page, and
values used in styles or URLs are validated in `js/trip.js`. A new field needs both: a
rule in the validator and escaping where it is shown.

**Versions and merges must stay deterministic.** Two phones merging the same two
versions must end with the same trip and the same version id: the merge picks the
winner of a conflict by version id, never by which phone runs it. `test/versions.test.mjs`
checks it; keep it passing when you touch `js/version.js`, `js/merge.js` or `js/edit.js`.

**The trip format is a contract, and it is content only.** A trip file says what the
trip is; how it looks (colours, map zones, labels, icons) is worked out by the app and
never goes in the file. Files written today must keep loading. Adding an optional field
is fine. Renaming, removing or changing the meaning of a field is a breaking change: it
needs a new format version and a conversion in `upgrade()`, the way format 1 becomes 2.
A value of `type` or `travel` the app does not know is a warning, not an error, so a
new kind of place needs no new format: add it to `TYPES`, with an icon in
`js/icons.js` and a name in `js/i18n.js` (tests check both). When you add a field:

1. one entry in `FIELDS` in `js/trip.js` (the checks and the JSON Schema follow), with
   a test in `test/trip.test.mjs`;
2. `docs/trip-format.md` (a test fails if a field of `FIELDS` is missing there);
3. `docs/creating-a-trip.md`, if the field changes how a trip should be written;
4. `examples/demo-trip.json`, if the field is worth showing.

Instructions for assistants exist once: the format in `docs/trip-format.md`, the
method in `docs/creating-a-trip.md`, the rules of the repository in `AGENTS.md`.
The skill and `CLAUDE.md` only point to them. Please do not copy their content
into tool-specific files.

Chat assistants (Gemini, ChatGPT…) do not clone the repository: they read one page,
if they can open it at all. That page is `llms.txt`, made by `tools/lib/llms.mjs`: the
format in short (`formatBrief()` in `js/trip.js`, about forty lines made from `FIELDS`),
then the two documents and the example. It is published with the site and kept at the
root of the repository, because assistants open github.com pages more readily than a
small site; the app's message for an assistant points there. Never edit it by hand: run
`node tools/check-llms.mjs --fix` after changing `docs/`, `js/trip.js` or the example
(`npm run check` fails until you do). When assistants keep making the same mistake, add
a line to the rules in `formatBrief()`.

**New files must be available offline.** If you add or remove a file of the app, run
`node tools/check-precache.mjs --fix` to update the list in `sw.js`. You never need
to touch the version: the build computes it from the content.

**Interface texts go in `js/i18n.js`**, in every language. If you do not speak one of
them, write your best attempt and say so in the pull request. A test checks that all
languages have the same keys.

**No real trips, no keys.** Never commit a real trip file or an API key, not even in a
test. Use invented data, like `examples/demo-trip.json`. `npm run check` fails if it
finds either.

**No new network requests** at startup, and no third-party scripts, fonts or trackers.
Libraries are vendored under `vendor/` with their licence, and only when really needed.

**The Content-Security-Policy is part of the app.** It is the `<meta>` at the top of
`index.html`, and it says where the page may load code, images and fonts from and
where it may send requests. Keep it tight:

- no inline scripts and no `on…=` attributes in HTML: listeners are added from the
  modules. Never add `'unsafe-inline'` to `script-src`;
- a feature that needs a new host (a tile server, an API) adds that host, to the one
  directive that needs it, in the same change, with a line in the comment above the
  meta saying why;
- `npm run e2e` fails if the browser blocks anything while it drives the app, so a
  missing host shows up there. The Google map with a real key cannot run in the e2e:
  check it by hand on a copy with a key.

## Testing a change on a phone

Phones are where this app lives, and where most surprises are. Before opening a pull
request that touches the interface, storage or the service worker, please try:

- iPhone Safari and the app installed on the Home Screen (they behave differently);
- Android Chrome, installed;
- airplane mode, after one online visit;
- light and dark theme;
- if you touched stops, versions or files: add a stop with +, save the file, load it on
  a second phone, change it on both, swap the files, and check both end on the same
  version (Trips shows it);
- if you touched the manifest or the stop form: on Android, share a place from Google
  Maps to the installed app.

To reach your computer from a phone you need HTTPS (service workers require it
everywhere except `localhost`). The easiest way is to push your branch to your fork
and let GitHub Pages publish it.

If you could not test on one of these, say so in the pull request. That is fine and
much better than silence.

## Adding a language

1. Copy the `en` block in `js/i18n.js`, name it with the two-letter language code,
   translate the values.
2. Run `npm test`.
3. Trip files can then ask for it with `"lang": "xx"`.

## Pull requests

- One topic per pull request, with a description of what changes for the traveller.
- Screenshots for visual changes, at phone width. If the change is visible in the
  pictures of the README, retake them with `node tools/screenshots.mjs` (it needs
  Chrome or Chromium, and only ever loads the example trip).
- `npm run check`, `npm test` and `npm run e2e` pass.

## Reporting a problem

Open an issue with the phone model, the browser, whether the app was installed on the
Home Screen, and the steps to see the problem. **Do not attach your real trip file**:
reproduce the problem with the example trip, or with a file where names and places
have been changed.

To report a security problem (for example a trip file that can run code in the app),
please use GitHub's private vulnerability reporting on this repository instead of a
public issue.

## Licence

By contributing you agree that your contribution is released under the
[MIT licence](LICENSE) of the project.
