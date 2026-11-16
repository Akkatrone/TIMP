# Changelog

Versions follow [Semantic Versioning](https://semver.org/). The trip file format has
its own version: `travel-in-my-pocket/2` since 3.0. Files in `travel-in-my-pocket/1`
(1.0 to 2.4) still load: the app converts them.

## 3.0.2

- The message to give an AI assistant is short again (three lines). It points to
  `llms.txt` in the GitHub repository, which assistants open more readily than the
  app's site; the copy there is checked by `npm run check` and never falls behind.
- For an assistant that opens no link at all, a second button copies the message with
  the whole format.
- At the bottom of Trips, "With an AI assistant": the message to write a new trip, and
  **Have an AI assistant change this trip**, three steps and one button that copies the
  message together with the trip. The answer comes back through Paste a trip, as a new
  version merged like any changed file.

## 3.0.1

- The message to give an AI assistant (first screen, and Trips) now carries the whole
  format, about forty lines made from the table of fields: the assistant needs no link.
  Gemini could not open llms.txt. The message for the problems of a refused file no
  longer points to a link either.
- llms.txt starts with the same short format.

## 3.0.0

A simpler trip file, kinds of places, and Google Maps short links that work.

**The trip file, format 2.** It says what the trip is, and nothing about how it looks:
the app picks colours, draws the maps and chooses the icons.

- Required: `format`, `title`, and for each day its `date` and `stops` (or `plans`);
  for each stop its `title`. Everything else is optional, `time` included.
- No more cross-references: a day has its `city` as a name and its `stay` inside it
  (a name, or `{name, address, note}`); `places` and `stays` are gone.
- Gone, worked out by the app: colours (`color`, `colorDark`), `glyph`, the trip and
  plan `id` (made from title and date when missing), `from`, `mapZones`, `mapImages`,
  `zoneNames`, `mapSplitKm`, `mapLabel`, the stays' `dates`.
- Renamed: `query` → `address`, `reminders` and `note` → `notes`, info `rows` →
  `items` (`number` folds into `text`: a phone number becomes a link to call),
  `map.googleMapsKey` → `googleMapsKey`. `infoNote` becomes an Info section.
- A `type` or `travel` the app does not know yet is a warning, not an error, so newer
  files load in older apps.
- One table in `js/trip.js` describes every field. The checks, the JSON Schema
  (`trip.schema.json`, published with the app for models that follow one) and the
  reference test of the documentation are made from it.
- Old files and the trips on the phone are converted on their own, as a new version
  made from the old one; the same on every phone.

**Kinds of places.** `type`: `sight`, `museum`, `food`, `park`, `view`, `shop`, `walk`,
`hotel`. Each has an icon by the stop's title and on its pin on the map; the stop form
has a row to pick one, filled in from OpenStreetMap or Google when a position is looked up.

**Google Maps short links.** The new link resolver (`worker/`, on Cloudflare Workers)
follows a short link and answers with name, address, position and kind of place. The
app uses it when a short link is pasted or shared; AI assistants that open web
addresses can call it too. It keeps nothing. It is optional: the build gets its address
from the repository variable `RESOLVER_URL` and adds it to the Content-Security-Policy.

Also:

- A link to a street address keeps the house number in the stop's name.
- `llms.txt` and other pages of the site open in a browser where the app is installed:
  the service worker answered them with the app, or with ERR_CACHE_MISS.
- The first screen explains how to have a trip written by an AI assistant, with the
  message to copy; the Trips page has the same, folded.
- The Info page lists the places to sleep with their nights, worked out from the days.
- The map has two views, the interactive map and the sketch: the "Picture" view of
  embedded map pictures is gone with `mapImages`.

## 2.4.0

Trips written by chat assistants (Gemini, ChatGPT…), which read one page and not the
repository.

- `llms.txt` is published with the app (https://frafal.github.io/TIMP/llms.txt): the
  whole format in one page, with a checklist of the mistakes chat assistants make
  first (no "format", "name" instead of "title", places without a colour) and a
  complete example. The build makes it from the documents, so it never falls behind.
- The README tells an assistant reading it to start from that page, and has a prompt
  to copy.
- **Paste a trip**, on the Trips page and the first screen: paste what the assistant
  answered, even with its sentences and the ```json fences around the file. No file
  to save on the phone.
- When a file is refused, **Copy for the assistant** copies every problem with a
  request to fix them following llms.txt, ready to paste into the chat. A text that
  is not JSON says where it breaks.

## 2.3.2

- With the interactive map open, tapping ⋯ or Edit on a stop no longer scrolls the
  page up by the height of the map. The page was rebuilt with the map taken out for a
  moment; it now keeps its height until the map is back.

## 2.3.1

Adding a stop from Google Maps, and the route on the map.

- A street address shared from the Maps app on Android ("Via Roma, 3" and a short
  link) becomes the stop's name and is looked up, instead of being glued to the link
  with no position.
- Positions are searched around the stops of that day first, then anywhere: an
  address without its town is found in the right town. OpenStreetMap is asked at most
  once a second, as its rules want.
- **On the map**, in the stop form: a small map to put the pin by hand, by tapping or
  dragging, when the search got it wrong.
- The field for what Maps shares shows it on several lines.
- A skipped stop leaves the route: the line goes from the stop before it to the one
  after, on the interactive map, on the sketch and in "Open in Google Maps". Its pin
  stays, greyed.
- While a form or a question is open, the page under it no longer scrolls.

## 2.3.0

History, choices when files disagree, and a Content-Security-Policy.

- **History**, on the Trips page: the versions on the phone, each with what it added,
  removed, changed or moved ("+ Museum", "~ Lunch · time"), and **Restore** on any
  earlier one. Restoring makes a new version with the old content, like `git revert`:
  nothing is deleted, and the restore can itself be undone from the History.
- A file that changed separately from the phone no longer merges silently. A dialog
  shows what is new in the file and what is new on the phone, and offers **Join both**,
  **Use only the file** (the file's content, as a new version that remembers the phone's
  changes) or **Cancel**.
- An older file still changes nothing, but its message has **Use this one**, to go back
  to it on purpose, as a new version.
- New way of getting there: **bus**, with its icon by the stop and on the map
  (`"travel": "bus"`).
- A Content-Security-Policy limits where the page may load code from and send requests
  to: the app itself, Google's map servers, OpenStreetMap. It is a second lock behind
  the escaping of trip text. The browser test now fails if the policy blocks anything.
- Trip files do not change; the format stays `travel-in-my-pocket/1`.

## 2.2.0

Versions are kept the way Git keeps them.

- Each version on the phone is a snapshot made of pieces shared with the other versions
  (a stop, a day, a map picture), each stored once under its SHA-256. A version that
  changes one stop adds about 2 KB instead of a full copy of the trip: for a trip of
  100 KB, a hundred changes take about 290 KB instead of 10 MB.
- The history of a version is rebuilt from its parents instead of being stored with
  each one, so it does not grow faster than the versions themselves.
- After a merge, the history lists the versions in the same order on every phone.
- Deleting a trip now deletes its versions too (2.0 and 2.1 left them behind).
- Deleting a trip or a stop asks first, in a dialog of the app with Cancel and Delete.
  It replaces the browser's own box (which claude.ai answers "no" without showing) and
  the second tap on the stop's Delete button.
- The browser database moves to version 3; the full copies kept by 2.0 and 2.1 are moved
  into pieces on first start.
- Trip files do not change.

## 2.1.1

- The message at the bottom of the screen ("New version available", "Save the file")
  uses the whole width: its text no longer wraps one word per line. Messages with a
  button also have a × to close them.
- An app left open in the background looks for a new version when you come back to
  it, and once an hour while it is open, not only when it starts.
- Italian: the merge message reads "tappe nuove 1" instead of "1 nuove".

## 2.1.0

A more compact stop, so more of the day fits on the screen.

- The way you get there (metro, train, plane, boat) moves to the left column, under the
  time and the pin number. The title starts at the edge and has the whole line.
- Labels like "Booking needed" sit above the title, small, and no longer push the links
  onto a second line.
- Skip and Edit move into a ⋯ menu under the tick. The links row keeps only Map and
  Directions, on one line. The menu works with the keyboard, closes with Escape or a tap
  outside, and opens upwards when there is no room below.

## 2.0.2

- "Save the file" works on Android. Chrome offers the share sheet but refuses to share
  `.json` files in it; the app took that refusal as a failure. It now downloads the file
  instead (to Downloads), and goes straight to the download for the rest of the session.

## 2.0.1

- The new icon now shows up after an update. Browsers keep icons by address, apart
  from the page, so the same address kept showing the 1.x icon in the tab and in the
  manifest. The published copy now gives the icons an address per version.

## 2.0.0

Trips can now change on the phone and travel between friends. The app is now called
**TIMP**, with a new icon: a station nameplate with the line's colours and the day's stops.

- **Add, edit, move and delete stops** from the app: a + button on each day and an
  Edit link on each stop. Paste what Google Maps shares, an address or coordinates:
  name, address and position are filled in.
- **Positions are looked up** from the address when they are missing: with Google's
  Geocoding API when the key allows it, with OpenStreetMap otherwise.
- **Android:** the app appears in the Share menu of Google Maps.
- **Versions**, with ids like Git's: every change makes one, shown on the Trips page.
- **Save and share the trip as a file** after a change; the Trips page reminds you
  until the latest version is saved.
- **Merge:** a file of the same trip that changed separately is joined with the one on
  the phone, the same way on every phone.
- New stop field `link`; new top-level field `version`, written by the app.
- A file edited by hand with its old version left in becomes a new version.

Breaking for people who host a copy: the browser database moves to version 2 (a new
store for versions); trips saved by 1.0 are upgraded on first start.

## 1.0.0

First release: offline day-by-day guide from a private trip file; folding descriptions,
done and skipped stops; metro, train, plane and boat icons; interactive map (Google
Maps or OpenStreetMap) and offline sketch; light and dark theme; English and Italian.
