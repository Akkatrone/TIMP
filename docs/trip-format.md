# The trip file

A trip is one JSON file, in the format `travel-in-my-pocket/2`. The app reads it,
checks it, and keeps it on the device. Nothing in it is ever sent to a server.

The file says **what the trip is**: days, stops, where you sleep, what to remember. It
says nothing about how the app looks: colours, map zones, labels and icons are worked
out by the app from the content. How to write a *good* trip is in
[creating-a-trip.md](creating-a-trip.md).

<!-- llms.txt: skip -->
- Working example: [`examples/demo-trip.json`](../examples/demo-trip.json)
- Check a file: `node tools/validate-trip.mjs --map my-trip.json`
- The same rules as a JSON Schema, for tools and AI assistants that can follow one:
  `trip.schema.json`, published next to the app (for example
  https://frafal.github.io/TIMP/trip.schema.json).

The checker, the schema and the app are all made from one table in
[`js/trip.js`](../js/trip.js) (`FIELDS`): what passes the checker loads in the app.
<!-- llms.txt: end -->

## Smallest valid file

```json
{
  "format": "travel-in-my-pocket/2",
  "title": "Rome in three days",
  "days": [
    {"date": "2027-04-10", "stops": [{"title": "Colosseum"}]}
  ]
}
```

A useful one gives each day a `city` and a `title`, and each stop a `time`, a `type`,
an `address` and its position (`lat`, `lng`):

```json
{
  "format": "travel-in-my-pocket/2",
  "title": "Rome in three days",
  "lang": "en",
  "timezone": "Europe/Rome",
  "days": [
    {
      "date": "2027-04-10",
      "city": "Rome",
      "title": "The ancient city",
      "stay": {"name": "Hotel Example", "address": "Via Cavour 1, Rome"},
      "notes": ["Colosseum tickets booked for 9:00"],
      "stops": [
        {"time": "09:00", "title": "Colosseum", "type": "sight", "tag": "Booked",
         "text": "Enter from the Via Sacra side.", "address": "Piazza del Colosseo, Rome",
         "lat": 41.8902, "lng": 12.4922},
        {"time": "13:00", "title": "Lunch in Monti", "type": "food"},
        {"time": "15:00", "title": "Capitoline Museums", "type": "museum", "travel": "bus",
         "address": "Piazza del Campidoglio 1, Rome", "lat": 41.8930, "lng": 12.4828}
      ]
    }
  ],
  "info": [
    {"title": "In case of need", "items": [{"label": "Emergency", "text": "112"}]}
  ]
}
```

## The trip

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Always `"travel-in-my-pocket/2"`. |
| `title` | yes | The name of the trip. |
| `days` | yes | One entry per date, in date order. |
| `lang` | no | Language of the app while this trip is open: `"en"` or `"it"`. Without it, the phone's. |
| `timezone` | no | IANA time zone of the destination, like `"Europe/Rome"`: decides which day is "today". Without it, the phone's. |
| `info` | no | Sections of the Info page. |
| `googleMapsKey` | no | A Google Maps key for everyone who loads the trip. See [Google Maps key](#google-maps-key). |
| `id` | written by the app | Identifies the trip on the phone. Without it the app makes one from the title and the first date, so a corrected file for the same trip updates it. Keep it when you change a file the app saved. |
| `version` | written by the app | Keep it exactly as it is.<!-- llms.txt: skip --> See [Versions](#versions).<!-- llms.txt: end --> |

## A day

| Field | Required | Meaning |
|---|---|---|
| `date` | yes | `"YYYY-MM-DD"`. |
| `stops` | one of the two | The stops, in order. |
| `plans` | one of the two | Two or more alternative plans for the day, each with a `name` (on its button) and its `stops`. The traveller picks one. |
| `city` | no | Where the day is spent: a city or an area. Days in the same city share a colour; a day in another city than the day before shows "Rome → Naples". |
| `title` | no | What the day is about, in a few words. |
| `stay` | no | Where the night is spent: an object with `name` (required), `address` and `note`, listed with its nights on the Info page; or plain text for a night that is not a place to sleep (`"Night train"`), shown on its day only. |
| `notes` | no | Things to remember that day, shown at the top: tickets, what to bring, what to do if it rains. |

## A stop

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | The name of the place or of the activity. |
| `local` | no | The name in the local language and script, as on the sign: `"一蘭 渋谷店"`. Shown under the title, to recognise the place, show it to staff or a taxi driver, and search it: the review link uses it. |
| `time` | no | `"09:30"`, or words like `"Evening"`. Clock times keep new stops in order. |
| `type` | no | What kind of place it is: `sight`, `museum`, `food`, `park`, `view`, `shop`, `walk`, `hotel`. It gives the stop its icon, in the list and on the map pin. |
| `travel` | no | How you get there from the stop before: `metro`, `bus`, `train`, `plane`, `boat`. Drawn on the leg of the map that arrives at the stop. |
| `text` | no | What to know: what to see, what to order, tickets. |
| `tag` | no | A short label above the title, like `"Booked 19:30"` or `"Optional"`. |
| `booking` | no | `"required"`: no entry without booking, and the stop shows a warning until it is done; `"advised"`: better booked; `"booked"`: done, shown as Booked (the time and the people go in `tag`). |
| `closed` | no | When the place is closed: days of the week (`"mon"` … `"sun"`) and dates (`"2027-05-03"`). The stop shows a warning when its day is one of them, also after it is moved. |
| `address` | no | Where it is, as you would search it in Google Maps: a street address, or name and town (`"Pantheon, Rome"`). Used by the Map and Directions links. |
| `lat`, `lng` | no | The position, both or neither. Gives the stop its pin on the map. |
| `link` | no | A Google Maps link (`https://…`) to the exact place. The Map link opens it. |
| `id` | written by the app | Lets ticks, edits and merges follow the stop. |

A stop without a position is still shown, without a pin. A journey can be a stop of its
own ("Train to Naples", `"travel": "train"`, no position): it marks the leg from the
pin before it to the pin after it.

A `type`, `travel` or `booking` the app does not know yet is accepted with a warning and
drawn as a plain stop: files written for a newer app still load.

A stop of `type` `food` also gets a link to the reviews people read in that part of the
world, searched by its `local` name or its title: Tabelog in Japan, Naver Map in Korea,
Yelp in the United States and Canada, TheFork in Europe. The app picks the site from
the position, or from the trip's `timezone`; nothing about it goes in the file.

## Info

```json
"info": [
  {"title": "In case of need", "items": [
    {"label": "Emergency", "text": "112"},
    {"label": "Ferry booking", "text": "AB12CD, show it at the gate"}
  ]},
  {"title": "Words", "items": [{"label": "Thank you", "text": "Grazie"}]}
]
```

Each section has a `title` and `items`; each item a `label` and a `text`. A text that is
only a phone number becomes a link to call it.

## Text formatting

Texts are plain text. The only formatting is `**bold**`, in a stop's `text`, in
`notes`, in a stay's `note` and in info items. HTML is shown as written, never run.

<!-- llms.txt: skip -->
## How the app draws the map

The file gives positions; the app does the rest.

- **Online**: an interactive map with a pin per stop (its number, and the icon of its
  `type`), a straight line from stop to stop, and a card for each pin.
- **Offline**: a sketch to scale, with the same numbers.
- Stops more than 12 km apart are drawn on separate maps (a day in Rome, then Naples).
- Stops less than 30 m apart share a pin, named after the first one.
- Skipped stops keep their pin, greyed; the line goes past them.
- Each pin has the colour of its `type`, the lines that of the day's `city`. Their
  shade follows the part of the day: lighter in the morning, darker after sunset.
- Sunrise and sunset are worked out from the date and the first stop with a position,
  on the clock of `timezone`. Stops after sunset get a moon in the list. A `time` in
  words counts too: "Evening", "Dinner", "Sera", "Cena" are after dark.

<!-- llms.txt: end -->
<!-- llms.txt: skip -->
## Google Maps key

Without a key, the interactive map uses OpenStreetMap. With `googleMapsKey`, it uses
Google Maps, for everyone who loads the file. Restrict the key to the address of the
app and to the Maps JavaScript API, set a daily quota, and never put a file with a key
in a public repository. How to create one is in the
[README](../README.md#google-maps-optional). Each phone can also save its own key, or
turn Google Maps off, on the Trips page.

<!-- llms.txt: end -->
<!-- llms.txt: skip -->
## Versions

The app writes a `version` into every file it saves:

```json
"version": {
  "id": "3f2a9c1e0b7d4a55",
  "parents": ["a1b2c3d4e5f60718"],
  "history": ["a1b2c3d4e5f60718", "0f9e8d7c6b5a4938"],
  "date": "2026-11-16T10:42:00.000Z"
}
```

| Field | Meaning |
|---|---|
| `id` | 16 hex characters: the start of the SHA-256 of the trip's content (without `version`, keys in a fixed order) and of its parents. The same content from the same parents has the same id on every device. |
| `parents` | The version this one was made from; two after a merge; none for the first. |
| `history` | Every earlier version, newest first. It tells a newer file from an older one, or from one that changed separately. |
| `date` | When the version was made. Not part of the id. |

A file without `version` gets one when it is loaded, computed from its content, so two
phones loading the same file agree on it. Each phone keeps the content of every version
it has seen, the way Git does, as pieces shared between versions.

**Changing a file by hand or with an assistant:** leave `id` and `version` as they are.
The app sees that the content no longer matches the version and makes a new version
from it, then joins it with what changed on other phones.

<!-- llms.txt: end -->
## Changes

To change a trip that already exists, an AI assistant does not need to write the whole
file again. The app gives it an outline of the trip (Trips → Have an AI assistant change
this trip), and the assistant answers with a short list of changes, which the app applies
as one new version (Paste, at the bottom of the app):

```json
{"format": "travel-in-my-pocket/changes", "trip": "rome-in-three-days-2027-04-10", "changes": [
  {"add": {"day": "2027-04-10", "stop": {"time": "13:00", "title": "Lunch in Monti", "type": "food"}}},
  {"update": {"day": "2027-04-10", "stop": "colosseum", "set": {"time": "10:00", "tag": null}}},
  {"update": {"day": "2027-04-10", "stop": "pantheon", "to": {"day": "2027-04-11"}}},
  {"remove": {"day": "2027-04-11", "stop": "trevi"}},
  {"setDay": {"day": "2027-04-11", "set": {"title": "Churches and squares"}}},
  {"addDay": {"date": "2027-04-12", "city": "Rome", "stops": [{"title": "Last coffee"}]}},
  {"removeDay": {"day": "2027-04-13"}},
  {"addPlan": {"day": "2027-04-11", "first": "Sunny", "plan": {"name": "If it rains", "stops": [
    {"time": "10:00", "title": "Vatican Museums", "type": "museum"}]}}},
  {"setPlan": {"day": "2027-04-11", "plan": "sunny", "set": {"name": "Squares"}}},
  {"removePlan": {"day": "2027-04-12", "plan": "lazy-morning"}}
]}
```

Stops are named by their `id`, plans by theirs (`"plan": "…"` next to `"day"`). In
`set`, `null` removes a field. A new stop goes in time order. `addPlan` gives a day an
alternative plan; on a day that has none yet, the stops it has become the first plan,
named by `first`, and their ticks follow. A day left with one plan by `removePlan` has
plain stops again. `setPlan` changes only the name: the stops of a plan change one by
one. The changes are applied in order, all or none: if one is wrong, the app lists
which one and why, and changes nothing. The result is checked like any trip file.
`trip` may be left out: the changes then apply to the trip open on the phone.
<!-- llms.txt: skip -->The rules are in [`js/changes.js`](../js/changes.js).<!-- llms.txt: end -->

<!-- llms.txt: skip -->
## The old format

Files in `travel-in-my-pocket/1` (TIMP 1.0 to 2.4) still load: the app converts them
once, as a new version made from the old one. Map settings of the old format
(`places` colours, `glyph`, `mapZones`, `mapImages`, `zoneNames`, `mapSplitKm`,
`mapLabel`) are dropped; the app works them out now.

<!-- llms.txt: end -->
<!-- llms.txt: skip -->
## Checks the app makes

The app refuses a file, and lists every problem with its position, when: it is not JSON,
`format` is wrong, `title`, `days`, a day's `date` or a stop's `title` is missing, a day
has neither `stops` nor `plans` (or both), dates are not real or not in order,
coordinates are out of range or not in pairs, a `link` is not `https://`, or an `id` is
used twice in a list.

Unknown fields, an unknown `type` or `travel`, and days without any position are
warnings: the file loads, and the command-line checker shows them.
<!-- llms.txt: end -->

## What changed, version by version

Only what a trip file, or a list of changes, can say differently. Files written for an
older version still load.

- **3.5**: three optional stop fields: `local` (the name as on the sign), `booking`
  (`required`, `advised`, `booked`) and `closed` (days of the week and dates).
- **3.4**: changes can add, rename and remove a day's plans: `addPlan`, `setPlan`,
  `removePlan`.
- **3.1**: a list of changes instead of the whole file again:
  `travel-in-my-pocket/changes`.
- **3.0**: format `travel-in-my-pocket/2`: the file says only what the trip is, and
  `type` gives each stop its kind of place.
