# Changelog

Versions follow [Semantic Versioning](https://semver.org/). The trip file format has
its own version (`travel-in-my-pocket/1`), which has not changed: files written for
1.0 load in 2.0, and 1.0 ignores what 2.0 adds.

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
