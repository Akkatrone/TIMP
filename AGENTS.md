# AGENTS.md

Instructions for AI coding agents working in this repository.
People: start from [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

TIMP (Travel in my pocket) is a static web app (a PWA, no framework, no build step to
run it) that shows a day-by-day travel guide on a phone and works offline. The app is
generic and public. Each trip is a private JSON file that a traveller loads on their own
device. Since 2.0 travellers also add and change stops in the app: every change is a
version of the trip, like a Git commit, and copies changed on different phones are
merged when a file is loaded.

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
   **Updating a trip that already exists:** start from the latest file the app saved
   (the person finds it in Trips → Save the file). Keep the trip `id`, every stop `id`,
   the `version` block and `private.owner` exactly as they are: never write or change
   `version` or `owner`. The
   app sees that the content changed and makes a new version from it, then merges it
   with the copies on other phones. Starting from an older copy works too, but the
   changes made in the app since then come back only through that merge.
4. Check it and read the map summary:

   ```bash
   node tools/validate-trip.mjs --map private/<trip-id>.json
   ```

5. Tell the person what you could not verify (coordinates, prices, opening hours,
   closing days, booking rules, costs) and how to load the file on a phone.

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
| `js/trip.js` | The trip format: `FIELDS` (one table for every field), checks, JSON Schema, conversion from format 1. No DOM. |
| `js/geo.js` | Map zones, the offline sketch, the colours of pins and lines. No DOM. |
| `js/sun.js` | Sunrise and sunset from date and place, and each stop's part of the day. No DOM. |
| `js/money.js` | Amounts as people type them, in their currency, and what they make in another at the rate of their own day. No DOM, no network. |
| `js/rates.js` | The exchange rates of a month, from Frankfurter, kept on the phone. No DOM. |
| `js/share.js` | The app's side of the sharing service: the account kept on the phone, passkeys (WebAuthn), calls checked against `js/share-api.js`, the answer to a chat app asking for the trips (`#authorize=`). Nothing runs without `SHARE_URL` in `js/config.js`. |
| `js/sync.js` | Trips and the sharing service until they agree, with the rules of two files (inspect, apply): taken, joined, sent; read-only trips never sent. Private expenses joined three ways (`mergePrivate` in `js/private.js`). No DOM. |
| `js/publishing.js` | The sheet to publish a trip "with the link": what `publishable` found, ticked to take out; the dates hidden or real; then the page. And the first day asked for "Use as a base". |
| `js/sharing.js` | The sheet to share a trip on the account: who sees it, invites not accepted yet (taken back), a new invite as a link. |
| `js/account.js` | The account's sheets: the form to make one (invitation code, name, passkey), passkeys and devices (add one here, take one off, recovery codes, sign out the others; the passkey asked again when the sign-in is not recent), back in with a recovery code, the linked chats (what each can do, unlink). |
| `js/share-api.js` | The contract with the sharing service (accounts, sync, sharing): every route, what it takes and answers; checks and an OpenAPI page made from it. Inside a version only additions: `contract/v1.lock.json` is the released contract and `node tools/check-contract.mjs` fails on a change that would break it (`--fix` records additions). No DOM. |
| `js/publish.js` | What of a trip may be published (`publishable`): never private expenses, the Google key, the version or the id; booking codes, phones, emails and where the nights are spent found and taken out unless kept; dates of a trip not over moved to 2001 (same month and weekday). No DOM. |
| `js/private.js` | Private expenses: in the file and on the phone, never in a version or a merge; what to do with those a loaded file brings. No DOM. |
| `js/places.js` | What the app works out about a place: its part of the world, its review site (Tabelog, Naver, Yelp, TheFork), closing days, the language of its local name. No DOM. |
| `js/livemap.js` | Interactive map: Google Maps, or MapLibre with OpenStreetMap from OpenFreeMap (names in the app's language over the local ones). |
| `js/google.js` | Google's script, loaded once, shared by map and address search. |
| `js/editor.js` | The add / edit stop form, and the day form. |
| `js/ask.js` | Question dialog for confirmations and choices; never use `confirm()`. |
| `js/edit.js` | Changes to stops (in time order), days and plans. No DOM. |
| `js/changes.js` | Changes written by an AI assistant: the trip's outline, the changes format, applying it. No DOM. |
| `js/gmaps.js` | Reads Google Maps links and shared text. No DOM. |
| `js/geocode.js` | Address to coordinates: Google, then OpenStreetMap. |
| `js/version.js` | Version ids like Git's, and how versions relate. No DOM. |
| `js/merge.js` | Deterministic three-way merge of two versions. No DOM. |
| `js/diff.js` | What changed between two versions, stop by stop. The only comparison. No DOM. |
| `js/history.js` | The History sheet: versions in words, restore any of them. |
| `js/trips.js` | Edits and received files (`inspect`, then `apply` the choice): versions, merges, restores, marks. No DOM. |
| `js/objects.js` | Versions stored as shared pieces by SHA-256, like Git. No DOM. |
| `js/store.js` | IndexedDB storage; the same calls in memory (also used by the tests). |
| `js/i18n.js` | Interface texts, every language. |
| `js/util.js` | Escaping, links, dates. No DOM. |
| `js/icons.js` | Icons for the kinds of places and ways of travelling. No DOM. |
| `js/theme.js` | Applies the chosen theme before the page is drawn. Plain script. |
| `sw.js` | Service worker: offline copy of the app. |
| `tools/`, `test/` | Checks, build, tests. `tools/e2e.mjs` drives a real browser. |
| `tools/lib/llms.mjs` | Builds `llms.txt` (format for chat assistants) from the docs, with the version of `package.json`; text between `<!-- llms.txt: skip -->` and `<!-- llms.txt: end -->` stays out. A change to what a file can say goes in "What changed, version by version" in `docs/trip-format.md`. It is published with the site and kept at the root of the repository: never edit it, run `node tools/check-llms.mjs --fix` after changing `docs/`, `js/trip.js`, the example or the version in `package.json` (`npm run check` fails otherwise). |
| `worker/` | The optional link resolver (Cloudflare Workers): a Google Maps link in, name, address, position and kind out. Keeps nothing. |
| `vendor/` | Third-party code, unmodified (MapLibre: see its README). Do not edit. |

### What a change must respect

The project makes three promises. Do not break them, even if asked for a feature that
seems to need it: say so instead.

1. **The trip never leaves the device.** No accounts, no server, no analytics, no
   request that carries trip data. Two exceptions, both when a stop is added or
   changed: its name and address go to Google or OpenStreetMap to find its position,
   and a Google Maps link pasted or shared goes to the link resolver (`worker/`),
   which keeps nothing. And one for costs in another currency: the month whose
   exchange rates are needed goes to Frankfurter, always asking for every currency
   against the euro (`js/rates.js`), so no amount, place or currency of the trip. And
   an account, only on a copy built with a sharing service (`--share`) and only if the
   traveller makes one: its name and the public half of its passkey go to that
   service; signed in, the traveller's trips and private expenses go there too, to be
   on their other phones and shared with whom they choose (sealed at rest). And a chat
   app (Claude, ChatGPT…) the traveller connects to that account reads there what they
   allowed in the app (`#authorize=`, which shows who asks, what for, where it goes).
   And a trip its owner publishes "with the link": only the version chosen, only what
   they reviewed (`js/publish.js`, run again by the service on the version it holds),
   readable by anyone with the page's address until they withdraw it.
2. **It works offline.** Everything except the interactive map, after one online visit.
3. **Anyone can host it.** Static files only; running it needs no build and no
   installed dependency. The link resolver is optional: without it the app loses only
   the reading of short links.

And these rules:

- **Text from a trip file is untrusted.** It reaches the page only through `esc()` or
  `rich()` from `js/util.js`. Values used in styles or URLs are validated in `js/trip.js`.
- **The Content-Security-Policy stays tight.** It is the `<meta>` in `index.html`. No
  inline scripts, no `on…=` attributes, never `'unsafe-inline'` in `script-src`. A new
  host goes in the one directive that needs it, in the same change, with a reason in
  the comment above. `npm run e2e` fails if the browser blocks anything.
- **The trip format is a contract, and it is content only.** A trip file says what the
  trip is; anything about how it looks (colours, map settings, labels) is worked out by
  the app and never goes in the format. Adding an optional field is fine. Renaming,
  removing or changing the meaning of a field needs a new format version and a
  conversion in `upgrade()`. A new field is one entry in `FIELDS` in `js/trip.js` (the
  checks and the JSON Schema follow), plus a test in `test/trip.test.mjs`, an entry in
  `docs/trip-format.md` (a test checks it), and a mention in `docs/creating-a-trip.md`
  if it changes how a trip should be written. New kinds of places or ways of
  travelling: add the value to `TYPES` or `TRAVEL`, an icon in `js/icons.js` and a name
  in `js/i18n.js`; unknown values are warnings, so old apps still load new files.
- **Versions and merges stay deterministic.** Two phones merging the same two versions
  must end with the same trip and the same version id: conflicts are settled by version
  id, never by which phone runs the merge. `test/versions.test.mjs` checks it.
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
