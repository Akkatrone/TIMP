# Using the app, in detail

The [README](../README.md) has the short version. This page has the details: installing,
changing a trip on the way, versions and files.

## Installing

1. Open <https://frafal.github.io/TIMP/>.
2. Install it on the Home Screen:
   - **iPhone**: open the page in Safari (or Chrome), tap Share, then "Add to Home Screen".
   - **Android**: open the browser menu, tap "Install app" or "Add to Home screen".
3. Open it from the new icon and tap **Load a trip file**. Pick the `.json` file you
   received (from Files, Drive, a chat).
4. Done. From now on it also opens in airplane mode.

Good to know:

- **iPhone: load the trip from the Home Screen icon, not from Safari.** The two keep
  separate storage. Installed on the Home Screen, the trip is also safe from Safari's
  habit of clearing data of sites not visited for a week.
- **Open the app once with a connection** before you leave, so the phone can save it.
- **Without an account, the phone holds the only copy.** Keep the trip file somewhere
  (Files, Drive, a chat) in case you change phone or clear the browser data.
- **To update a trip**, load the new version of the file from the Trips page. The stops
  already ticked stay ticked.
- You can keep several trips on the same phone and switch between them from Trips.

## Changing the trip on the way

Tap **+** at the bottom right of a day to add a stop. Each stop has a **⋯** button under
its tick: **Edit** changes it, moves it to another day or deletes it; **Skip** marks a
stop you leave out. On the map a skipped stop keeps its pin, greyed, and the route goes
from the stop before it straight to the one after.

The day has its own **⋯**, next to Map of the day: **Edit day** changes its city, title,
where you sleep and its notes, or deletes it; **Add a day** opens the stop form on a new
day after the last. Alternative plans for a day, like one for when it rains, are a job
for an AI assistant: "add a plan for day 3 if it rains" is all it takes.

### Places to eat

A meal is the easiest thing to lose, so food stops get more help:

- The name as on the sign, under the title ("一蘭 渋谷店"): to find the door, and to show
  it to the staff or a taxi driver.
- **Booking**: a stop that needs one shows a warning until you mark it done in the form
  (Booking: Done); then it shows Booked.
- **Closing days**: a stop on a day its place is closed shows a warning, also after you
  move it to another day.
- A link to the reviews people use there, searched by the local name or the title:
  **Tabelog** in Japan, **Naver** in Korea, **Yelp** in the United States and Canada,
  **TheFork** in Europe. Nothing is fetched: the link opens only when you tap it.

### Pasting a place

The quickest way to fill in a stop is to paste what Google Maps gives you. The form
reads it on the phone:

| You paste | The stop gets |
|---|---|
| A link copied from Google Maps in a browser (`google.com/maps/place/…`) | name, address, position |
| The text the Maps app shares (name, address, link) | name, address; the position is looked up |
| A full address | the address; the position is looked up |
| A short link (`maps.app.goo.gl/…`), or the Maps app's text with one | name, address, position and kind of place, through the link resolver (below); without it, the link, and the name and address the text gives |
| Coordinates, `geo:` links, Apple Maps links | the position |

**Android:** once the app is installed, it appears in the Share menu: share a place from
Google Maps and the form opens already filled in; share an AI assistant's answer, or a
`.json` file, and the trip or the changes are loaded. (After an update, Android can take
a day to learn that TIMP accepts files; removing the app and installing it again is
immediate.)

**iPhone:** iOS does not let web apps receive shared content. Copy instead, then tap
**Paste** at the bottom of the app and **Paste** in the sheet that opens; **Continue**
does the same as the Share menu on Android. In Maps, Share → Copy; from an AI assistant,
copy the answer. A `.json` file: save it in Files and use **Load a trip file**.

When a position has to be looked up, the app asks Google (with a key that has the
Geocoding API enabled, see [Google Maps](google-maps.md)) or OpenStreetMap otherwise. It
searches around the stops of that day first, because Maps often shares an address
without its town. If the pin lands in the wrong place, or nothing is found, tap **On the
map** and put it where it belongs. A stop without a position is saved without a pin: its
Map and Directions links work all the same. When the place is known, its kind (museum,
restaurant, park…) is filled in too.

**The link resolver.** A browser is not allowed to follow a short link to the place
(Google sends no CORS header). So the app asks a tiny service of this project, the
[link resolver](../worker/README.md), which follows the link and answers with name,
address, position and kind of place. Only the link is sent, and the resolver keeps
nothing. It is optional: a copy of the app without one reads full links on its own and
asks for the name of a short one.

## Versions, files and merges

Each change makes a new version of the trip, with an id like Git's, shown on the Trips
page (`Version 3f2a9c1`). Without an account, after a change the app offers to **save
the file**: on an iPhone that opens the share sheet (WhatsApp, Drive, Files…); on
Android and on a computer it downloads `<trip>-<version>.json`. Trips shows a notice
until the latest version has been saved. With an account, versions sync by themselves.

When someone loads a file of a trip they already have (same trip `id`):

- **a newer version** made from theirs replaces it;
- **an older one** changes nothing, unless they tap **Use this one**: the old content
  then comes back as a new version, and nothing is lost;
- **a version that changed separately** shows what is new in the file and what is new
  on the phone, and asks:
  - **Join both** merges the two: what was added on either side is kept (stops, notes,
    expenses, lines of the Info page), a stop changed on one side takes that change, a
    stop removed on one side and untouched on the other goes, a stop moved to another day
    on one side and changed on the other is moved and changed. A stop is never doubled,
    and the stops stay in time order. When both changed the same detail, the same side
    wins on every phone, so two friends who swap files end on the same version;
  - **Use only the file** keeps the file as it is, as a new version that still remembers
    the phone's changes;
  - **Cancel** loads nothing.

**History** (on the Trips page) lists the versions with what each one changed, and who
made it on a trip on your account. Any of them can come back: going back makes a new
version with the old content, the way `git revert` does, so it can itself be undone.

Ticked and skipped stops are never part of the file: they stay on each phone.

## Changing a trip with an AI assistant, without an account

Small changes are quicker in the app (+ and Edit). For bigger ones, at the bottom of
**Trips** open **Have an AI assistant change this trip**: one button copies a message
with an outline of the trip, you write what to change, and the assistant answers with
the changes only, a few lines instead of the whole file. Copy them and tap **Paste** (on
Android, share the answer to TIMP): the app applies them as a new version, and Undo is
one tap in History.

When a new trip from an assistant has a problem, the app lists each one with its
position in the file; **Copy for the assistant** copies that list with a request to fix
it. An assistant that cannot open links at all: **Copy the message with the whole
format** puts the format itself in the message.
