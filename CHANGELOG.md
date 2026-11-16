# Changelog

Versions follow [Semantic Versioning](https://semver.org/). The trip file format has
its own version (`travel-in-my-pocket/1`), which has not changed: files written for
1.0 load in 2.0, and 1.0 ignores what 2.0 adds.

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
