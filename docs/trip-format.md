# The trip file

A trip is one JSON file. The app reads it, checks it, and keeps it on the device.
Nothing in it is ever sent to a server.

This page is the reference: every field and what is valid. How to write a *good*
trip (what to put in a stop, when to give coordinates, what to verify) is in
[creating-a-trip.md](creating-a-trip.md).

- Working example: [`examples/demo-trip.json`](../examples/demo-trip.json)
- Check a file before sending it to a phone: `node tools/validate-trip.mjs my-trip.json`

The checker and the app use the same rules ([`js/trip.js`](../js/trip.js)), so a file
that passes the checker loads in the app.

## Smallest valid file

```json
{
  "format": "travel-in-my-pocket/1",
  "id": "rome-2027",
  "title": "Rome in my pocket",
  "places": {
    "rome": {"name": "Roma", "color": "#b8451b"}
  },
  "days": [
    {
      "date": "2027-04-10",
      "place": "rome",
      "title": "The ancient city",
      "stops": [
        {"time": "09:00", "title": "Colosseum", "lat": 41.8902, "lng": 12.4922}
      ]
    }
  ]
}
```

## Top level

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Always `"travel-in-my-pocket/1"`. |
| `version` | no | Written by the app. See [Versions](#versions). |
| `id` | yes | Identifies the trip on the device: lowercase letters, digits, dashes. Loading a file with the same `id` **updates** the trip and keeps the stops already ticked or skipped. A different `id` adds a second trip. |
| `title` | yes | Shown as the name of the trip. |
| `lang` | no | Language of the interface while this trip is open: `"en"` or `"it"`. Without it, the device language is used. |
| `timezone` | no | IANA time zone of the destination, e.g. `"Europe/Lisbon"`. Decides which day is "today". Without it, the phone's own time zone is used. |
| `places` | yes | The cities or areas of the trip. See below. |
| `stays` | no | Hotels and other places to sleep. See below. |
| `days` | yes | One entry per date, in ascending order. See below. |
| `info` | no | Sections of the Info page. See below. |
| `infoNote` | no | A closing note at the bottom of the Info page. |
| `map` | no | `{"googleMapsKey": "..."}`. See [Google Maps key](#google-maps-key). |

## `places`

An object. The keys are short names you choose (lowercase letters, digits, dashes)
and use in `days` and `stays`.

```json
"places": {
  "athens": {"name": "Athens", "glyph": "Αθήνα", "color": "#4f9a2a", "colorDark": "#86c95a"},
  "naxos": {"name": "Naxos", "glyph": "Νάξος", "color": "#7a56a8", "colorDark": "#ad8cdb"}
}
```

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Name shown in the app. |
| `glyph` | no | A short name in the local script, shown large at the top of the day (two to four characters work best). Without it, `name` is shown large. |
| `color` | yes | `#rrggbb`. Colours the day, the route and the pins. It must be readable on a white background, so pick a medium or dark tone. |
| `colorDark` | no | The same colour for the dark theme: a lighter tone. Without it, `color` is used. |

## `stays`

An object, with keys you choose.

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Name of the hotel. |
| `place` | yes | A key of `places`. |
| `address` | no | Shown on the Info page. |
| `dates` | no | Free text, e.g. `"14 → 17 May"`. |
| `note` | no | Check-in times, luggage room, anything practical. |
| `query` | no | What to search in Google Maps. Without it, `name` is used. |

## `days`

A list. Each entry is one date. Day 1 is the first entry.

| Field | Required | Meaning |
|---|---|---|
| `date` | yes | `"YYYY-MM-DD"`. Dates must go up; gaps are allowed. |
| `place` | yes | A key of `places`: where the day is spent, or where it ends. |
| `from` | no | A key of `places`: where the day starts, on travel days. Shown as "Lisboa → Sintra". |
| `stay` | no | A key of `stays`: where you sleep that night. |
| `stayText` | no | Free text for the night when there is no entry in `stays` (e.g. `"Night flight"`). |
| `title` | yes | Title of the day. |
| `reminders` | no | List of short warnings shown above the stops. Use them for things that must not be forgotten that day. |
| `stops` | one of the two | The stops of the day. |
| `plans` | one of the two | Two or more alternative programmes for the day. The traveller picks one in the app. |
| `note` | no | A closing paragraph under the stops: plan B, rain alternative. |
| `zoneNames` | no | Names for the map zones of the day, in order. See [How the map is built](#how-the-map-is-built). |
| `mapSplitKm` | no | Distance in km beyond which a stop starts a new map zone. Default `12`. |
| `mapZones` | no | Draw the map from this list instead of from the stops. See below. |
| `mapImages` | no | Pictures of a map embedded in the file. See below. |

### Stops

| Field | Required | Meaning |
|---|---|---|
| `time` | yes | Free text: `"09:30"`, `"Evening"`, `"Dinner"`. |
| `title` | yes | Name of the stop. |
| `text` | no | The description: how to get there, price, opening hours, what to look at. The app shows the first two lines and the rest on a tap. |
| `lat`, `lng` | no, but together | Coordinates in decimal degrees. A stop with coordinates gets a numbered pin; a stop without them (a train ride, "free afternoon") has no pin. |
| `mapLabel` | no | Name used on the map when the title is not a place name (title `"Check-out"`, mapLabel `"Hotel Roma"`). |
| `query` | no | What to search in Google Maps for the "Map" and "Directions" links. Use the name people would type, with the city. Without it, the coordinates are used. |
| `tag` | no | A short label: `"Booking needed"`, `"Optional"`. |
| `link` | no | A Google Maps link to the exact place, `https://` only. When present, "Map" opens it instead of a search. The app keeps the link pasted when a stop is added. |
| `travel` | no | How you reach this stop: `"metro"`, `"bus"`, `"train"`, `"plane"` or `"boat"`. Shown as an icon in the stop's left column and on the map leg that arrives here. Leave it out when you walk, or for any other way (taxi, cable car). See [How the map is built](#how-the-map-is-built). |
| `id` | recommended | Lowercase letters, digits, dashes; unique within the list. The app uses it to remember that the stop was ticked or skipped. Without it, the position in the list is used, so reordering stops in an updated file would move the ticks. |

### Plans

```json
"plans": [
  {"id": "sintra",  "name": "Sintra", "zoneNames": ["Sintra"], "stops": [ ... ]},
  {"id": "cascais", "name": "Cascais + the coast", "stops": [ ... ]}
]
```

`id` and `name` are required; `stops` follows the same rules as above; `zoneNames`
is optional and replaces the day's `zoneNames` for that plan. The first plan is the
one shown until the traveller chooses.

## Text formatting

All texts are plain text. The only formatting is `**bold**`, which works in `text`,
`note`, `reminders`, `info` rows and `infoNote`. HTML is shown as written, never run.

## How the map is built

For each day the app shows a "Map of the day" button if at least one stop has coordinates.

- **Online**: an interactive map with numbered pins, a straight line between
  consecutive stops and a card for each pin.
- **Offline**: a sketch to scale, drawn from the coordinates, with the same numbers.

The number on a pin is the position of the stop in the list.

Stops are grouped into **zones**. A new zone starts when a stop is more than
`mapSplitKm` km from the previous one. A day in Lisbon is one zone; a day that starts in
Lisbon and ends in Porto has two. Zones get their names from `zoneNames`, in order.
Each zone has its own sketch and its own "Open in Google Maps" link with the whole route.

**How legs are travelled.** A stop with `travel` marks the leg that arrives at it: the
icon is drawn in the middle of that leg, on the interactive map and in the sketch. A
stop without coordinates that is the journey itself ("Train to Kyoto", `travel: "train"`)
marks the leg from the previous pin to the next one. When that leg jumps from one zone
to the next (Hakone → Kyoto), the interactive map draws it as a thinner line, and the
sketch writes it between the two zones: "Train · Odawara → Kyoto".

### `mapZones`

For a day that is not a walk from stop to stop (a bus tour, for example), list the
points of the map yourself. The stops of the day then need no coordinates.

```json
"mapZones": [
  {"name": "Around Mount Etna", "points": [
    {"name": "Rifugio Sapienza", "lat": 37.6996, "lng": 14.9993},
    {"name": "Zafferana Etnea", "lat": 37.6919, "lng": 15.1042},
    {"name": "Mount Etna", "lat": 37.751, "lng": 14.9934, "reference": true}
  ]}
]
```

Each point needs `name`, `lat`, `lng`; `query` is optional. A point with
`"reference": true` is a landmark: it is drawn as a triangle, without a number, and
is not part of the route.

### `mapImages`

A picture of a map that travels inside the file, for a day where a real map is worth
having offline. It adds a "Picture" view next to "Map" and "Sketch".

| Field | Required | Meaning |
|---|---|---|
| `src` | yes | The picture as a data URI: `"data:image/jpeg;base64,..."` (png, jpeg or webp). |
| `width`, `height` | yes | Size in pixels. |
| `pins` | yes | Names of the numbered pins drawn in the picture, in order. A name equal to a stop's `mapLabel` or `title` puts the same number next to that stop. |
| `zone` | no | Which zone of the day the picture shows, from `0`. Default `0`. |
| `plan` | no | The `id` of the plan the picture belongs to, on days with `plans`. |
| `credit` | no | Credit line for the picture. |

Keep pictures small (about 600 px wide, JPEG): every phone stores the whole file.
Only embed pictures you are allowed to redistribute.

## `info`

The Info page: sections with rows of label and text.

```json
"info": [
  {"title": "In case of need", "rows": [
    {"label": "Emergency", "number": "112"},
    {"label": "Booking code", "number": "AB12CD", "text": "ferry to the island, show it at the gate"}
  ]},
  {"title": "Money", "rows": [
    {"label": "Cash", "text": "ATMs in convenience stores accept foreign cards."}
  ]}
]
```

Each row needs `label` and at least one of `text` and `number`. `number` is shown in
a monospaced font and is selected with one tap, ready to copy: use it for phone
numbers and booking codes.

The hotels in `stays` are listed on the Info page automatically.

## Google Maps key

Without a key, the interactive map uses OpenStreetMap. With a key, it uses Google Maps.

```json
"map": {"googleMapsKey": "AIza..."}
```

The key travels with the file, so everyone you send the file to gets the Google map
without doing anything. Keep these three things in mind:

1. Restrict the key to the address of the app (HTTP referrer) and to the
   "Maps JavaScript API". A restricted key is useless on any other site.
2. Set a daily quota on the key, so it can never cost more than you decided.
3. Never put a file with a key in a public repository.

How to create the key is in the [README](../README.md#google-maps-optional).
On each device, the Trips page of the app can also save a key that takes the place
of the trip's key, or turn Google Maps off and use OpenStreetMap even when a key is
present.

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
| `history` | Every earlier version, newest first. A device compares it with its own to tell a newer file from an older one or from one that changed separately. |
| `date` | When the version was made. Not part of the id. |

A file without `version` gets one when it is loaded, computed from its content, so two
phones loading the same file agree on it.

The file carries the ids of earlier versions, not their content. Each phone keeps the
content of every version it has seen, the way Git does: as pieces shared between
versions (a stop, a day…), each stored once. A change to one stop costs about 2 KB, so a
long history takes little space. It is what lets a merge compare both sides with the
last version they shared.

**Editing a file by hand:** leave `version` as it is. The app notices that the content
no longer matches the id and makes a new version from the one written in the file, so
the change is not mistaken for the version it came from.

## Checks the app makes

The app refuses a file and says why when: `format` is wrong, a required field is
missing, a day refers to a place or a stay that does not exist, dates are not in
ascending order, coordinates are out of range, an `id` is repeated, a colour is
not `#rrggbb`, or an embedded picture is not a png/jpeg/webp data URI.

Unknown fields are ignored with a warning in the command-line checker, so a typo in
a field name does not pass unnoticed there.
