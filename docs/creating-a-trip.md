# Creating a trip file

How to turn a trip plan into a file for TIMP (Travel in my pocket). This guide is for whoever
writes the file: a person, or an AI assistant working for one. It says how to write a
*good* file; the list of fields and what is valid is in [trip-format.md](trip-format.md).

**If you are an AI assistant:** read this page and [trip-format.md](trip-format.md)
before writing anything, and follow the steps in order. If you cannot see
trip-format.md, ask for it: do not write the file from memory.

The reader of the result is someone standing in a street abroad with a phone in one
hand, often without a connection. Everything in the file should help that person
decide what to do next.

## What you produce

One JSON file in the format `travel-in-my-pocket/1`, named `<trip-id>.json`.

A trip file contains hotels and dates. Treat it as private:

- Inside a copy of this repository, save it in `private/`. Git ignores that folder.
  Never save a real trip anywhere else in the repository and never commit one.
- Anywhere else, give the file to the traveller and nobody else. Do not publish it.

## 1. Collect the trip

You need: the dates, the places, where the travellers sleep each night, and what they
do each day. Read everything you were given before asking anything. Then ask only for
what is missing and changes the result: travel dates, hotel names, fixed bookings
(flights, trains, timed tickets).

Do not invent bookings, hotels, flight times or reservations. If something is not
decided, leave it out or present it as an option (`tag: "Optional"`, a `note`, or
alternative `plans`).

If there is only a rough idea ("5 days in Lisbon"), agree on a programme first and
write the file afterwards. A file is a bad place to negotiate an itinerary.

## 2. Lay out the structure

- `places`: one entry per city or area where time is spent. A day trip does not need
  its own place unless you want it to have its own colour.
- `stays`: one entry per hotel.
- `days`: one entry per date, from the arrival day to the departure day.

Pick a colour for each place from this list. Each pair is readable in the light and
in the dark theme:

| `color` | `colorDark` |
|---|---|
| `#4f9a2a` | `#86c95a` |
| `#0c7aa3` | `#45afd8` |
| `#7a56a8` | `#ad8cdb` |
| `#d65f22` | `#f2905a` |
| `#b8651b` | `#e9a25c` |
| `#2f7d4f` | `#6cc58f` |
| `#b23a5b` | `#ee88a4` |
| `#3f63b5` | `#8aa7ee` |

Use `glyph` only when the place has a short name in a non-Latin script that the
traveller will see on signs (東京, Αθήνα, Київ). Otherwise leave it out.

## 3. Write the days

For each day:

- `title`: what the day is about, in a few words ("Baixa and Alfama on foot").
- `stops`: in the order they happen. Include the practical ones too: arrival,
  check-in, the train to the next city, the way back to the hotel.
- `reminders`: only what would spoil the day if forgotten. "The last ferry back
  leaves at 17:30." "Tickets go on sale 14 days before." Zero to two per day.
- `note`: the alternative. What to skip if tired, what to do if it rains.
- `plans` instead of `stops` when the travellers will choose on the spot between two
  or three different days.

For each stop:

- `time`: a clock time when it matters ("09:30"), a word when it does not ("Evening",
  "Dinner", "Afternoon").
- `title`: the name of the place as written on maps and signs.
- `text`: one to three sentences, in this order of usefulness: how to get there from
  the previous stop (line, direction, minutes), price and opening hours, what to
  look at, one tip. The app shows only the first two lines until the traveller taps,
  so put what matters most first. Write in the travellers' language and tone.
- `tag`: "Booking needed", "Ticket needed", "Optional", in the trip's language.
- `id`: a short slug (`colosseum`). Always set it: it is how the app remembers that
  the stop was ticked or skipped when the file is updated later.
- `query`: the name plus the city, as someone would type it into Google Maps
  ("Colosseum Rome"). It drives the "Map" and "Directions" links.
- `mapLabel`: when the title is an action and not a place ("Check-out" → the hotel name).
- `link`: a Google Maps link to the exact place, when the traveller gave you one.
- `travel`: how the travellers reach this stop, when it is by metro, train, plane or
  boat. It is what they see at a glance, in the list and on the map, so set it every
  time the description says so ("JR to Yotsuya", "the ferry crosses in ten minutes").
  Leave it out for walking and for anything else (bus, taxi, cable car): only these
  four have an icon. For a journey that is a stop of its own without a place ("Train
  to Kyoto", "Flight to Rome"), set it on that stop and give it no coordinates.

## 4. Coordinates

A stop with `lat` and `lng` gets a pin on the map. A wrong pin is worse than no pin:
it sends people to the wrong place with full confidence.

- Look coordinates up on a map or on the web whenever you can. Use four decimal places.
- From memory, give coordinates only for places you are sure about: major landmarks,
  main stations. For a small restaurant or a hotel you cannot verify, leave `lat` and
  `lng` out and set a good `query`: the stop still gets working map links.
- Give no coordinates to stops that are not a place: a train ride, "free afternoon".
- Tell the traveller which coordinates were not verified.

Then check the geometry, in step 6. A typo in a coordinate shows up there as a map
zone that should not exist, or one that is absurdly wide.

## 5. Facts that go out of date

Prices, opening hours, closing days, timetables and seasonal closures change.
Verify them when you can. When you cannot, either leave the detail out or word it as
something to check ("check the timetable on the day"), and tell the traveller which
facts were not verified. Never state an unverified price or time as certain.

## 6. Check the file

**With Node and a copy of the repository:**

```bash
node tools/validate-trip.mjs --map private/<trip-id>.json
```

Fix every error. Then read the `--map` lines, one per day:

```
day 3 2027-05-16: Lisbon: 2 pins, 0.9 km across | Sintra: 4 pins, 1.3 km across
```

- Each `|` separates a map zone. A walking day in one city should be one zone, a few
  km across. A travel day has one zone per city.
- An unexpected extra zone, or a walking day that is 40 km across, means a coordinate
  is wrong. Find it and fix it.
- When a day has several zones, name them with `zoneNames`.
- If two parts of one day are split when they should not be (or the reverse), adjust
  `mapSplitKm` for that day. The default is 12.

**Without Node:** load the file in the app. It runs the same checks and lists every
problem with its position in the file, for example
`days[2].stops[0].lat: must be a number between -90 and 90`. Fix them (or paste them
back to the assistant that wrote the file) and load it again. Then open the map of
each day and look for a pin in the wrong place.

## 7. Hand it over

Tell the travellers, briefly:

1. Send the file to each phone (chat, AirDrop, Drive).
2. Open the app **from its Home Screen icon** and choose "Load a trip file". On an
   iPhone, loading it in Safari instead puts it in a different storage.
3. Open the app once with a connection before leaving.
4. What could not be verified: coordinates, prices, hours.

## Updating a file later

- Start from the latest file: travellers change trips in the app too, and save them
  from Trips → Save the file. An older copy loses nothing, because the app merges, but
  starting from the latest one avoids surprises.
- Keep the trip `id`: the app then replaces the trip and keeps the ticked and skipped stops.
- Leave the `version` block as it is, if the file has one: the app sees the change and
  makes a new version from it. Never write or change `version` yourself.
- Keep the `id` of every stop that still exists, even if it is renamed or moved.
- Change only what was asked. Do not rewrite texts nobody mentioned.
- Check the file again.

## The Google Maps key

Optional. Without it the interactive map uses OpenStreetMap. If the traveller has a
key and wants Google Maps, add `"map": {"googleMapsKey": "..."}`.

- Only use a key the traveller gives you. Never invent one, never reuse one from
  another file.
- The key must be restricted to the app's address and to the Maps JavaScript API, with
  a daily quota. The [README](../README.md#google-maps-optional) explains how.
- A file with a key must not be published.

## What a good Info page contains

Keep it to what someone needs in a hurry: emergency numbers (`number`), how to pay
and get cash, how luggage moves between hotels, booking codes (`number`), five or six
phrases in the local language. Hotels are listed automatically from `stays`.

## Mistakes to avoid

- Coordinates swapped (`lat` is north-south, between -90 and 90).
- A `stay` or `place` key used in a day but not defined.
- Two entries for the same date. Use `plans` for alternatives.
- A day with both `stops` and `plans`.
- Long paragraphs in `text`. The traveller reads this standing up.
- Comments or trailing commas in the JSON.
- HTML in the texts. Only `**bold**` is formatting; everything else is shown as written.
- Saving the real trip in a folder Git tracks.
