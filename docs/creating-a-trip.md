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

One JSON file in the format `travel-in-my-pocket/2`. It says what the trip is: days,
stops, stays, things to remember. Never how it looks: the app picks colours, draws the
maps and chooses the icons from the content.

A trip file contains hotels and dates. Treat it as private: give it to the traveller and
nobody else, and never publish it.
<!-- llms.txt: skip -->

Inside a copy of this repository, save it in `private/<trip-name>.json`: Git ignores
that folder. Never save a real trip anywhere else in the repository and never commit one.
<!-- llms.txt: end -->

## 1. Collect the trip

You need: the dates, the places, where the travellers sleep each night, and what they
do each day. Read everything you were given before asking anything. Then ask only for
what is missing and changes the result: travel dates, hotel names, fixed bookings
(flights, trains, timed tickets).

Do not invent bookings, hotels, flight times or reservations. If something is not
decided, leave it out or present it as an option (`"tag": "Optional"`, a line in
`notes`, or alternative `plans`).

If there is only a rough idea ("5 days in Lisbon"), agree on a programme first and
write the file afterwards. A file is a bad place to negotiate an itinerary.

## 2. Write the days

One entry per date, from the arrival day to the departure day, in date order.

- `city`: where the day is spent ("Lisbon", "Sintra"). Days in the same city share a
  colour, and a change of city shows on the day ("Lisbon → Porto"). Write it the same
  way every day.
- `title`: what the day is about, in a few words ("Baixa and Alfama on foot").
- `stay`: where the night is spent. The full object (`name`, `address`, `note` with
  check-in and booking details) on every night in that hotel; a plain name for nights
  that are not a hotel ("Night train").
- `notes`: only what would spoil the day if forgotten, and the alternative. "The last
  ferry back leaves at 17:30." "If it rains, swap with day 4." Zero to three per day.
- `stops`: in the order they happen. Include the practical ones too: arrival,
  check-in, the train to the next city, the way back to the hotel.
- `plans` instead of `stops` when the travellers will choose on the spot between two
  or three different days. Each plan has a `name` and its `stops`.

## 3. Write the stops

- `time`: a clock time when it matters ("09:30"), a word when it does not ("Evening",
  "Dinner"). Leave it out when there is no time at all.
- `title`: the name of the place as written on maps and signs.
- `local`: the same name in the local script, as on the sign ("一蘭 渋谷店", "명동교자"),
  wherever the country does not write in the Latin alphabet. Leave it out otherwise.
- `type`: what kind of place it is. One of `sight` (monuments, churches, squares),
  `museum`, `food` (restaurants, cafés, markets to eat at), `park` (parks, gardens,
  beaches), `view` (viewpoints), `shop`, `walk` (a stroll through a quarter), `hotel`.
  Leave it out for anything else (a station, a journey).
- `travel`: how the travellers reach this stop, when it is by `metro`, `bus`, `train`,
  `plane` or `boat`. Set it every time the description says so ("bus 7 from the
  station"). Leave it out for walking and anything else. A journey that is a stop of
  its own ("Train to Kyoto", "Flight to Rome") gets `travel` and no position.
- `text`: one to three sentences, in this order of usefulness: how to get there from
  the previous stop (line, direction, minutes), price and opening hours, what to look
  at, one tip. The app shows the first two lines until the traveller taps, so put what
  matters most first. Write in the travellers' language and tone.
- `tag`: what to know at a glance, in the trip's language: "Ticket needed",
  "Booked 19:30 · 2 people", "Cash only", "Optional".
- `booking`: `required` when there is no way in without booking, `advised` when going
  without is a gamble, `booked` only when the traveller says it is done. Never write
  `booked` on your own. Museums and shows can need it too.
- `closed`: the regular closing days ("mon") and closures on the dates of the trip
  ("2027-05-03"), when you know them. The app warns if the stop falls on one.
- `address`: where it is, as someone would type it into Google Maps: a street address,
  or the name and the town ("Pantheon, Rome"). It drives the Map and Directions links.
- `lat`, `lng`: the position, four decimal places. Look it up on a map or on the web
  whenever you can. From memory, give it only for places you are sure about (major
  landmarks, main stations). For a small restaurant you cannot verify, leave the
  position out and write a good `address`: the stop still gets working links.
- `link`: a Google Maps link to the exact place, when the traveller gave you one.
- No position for stops that are not a place: a train ride, "free afternoon".

Tell the traveller which positions were not verified.

### Places to eat

Meals are what travellers remember, and what goes wrong most easily: a closed door, a
two-hour queue, a counter that only takes bookings. For every place to eat:

- `type`: `food`, and `local` wherever the sign is not in the Latin alphabet. In Japan
  many places have a sign only in Japanese; the app also searches the reviews by it.
- `booking` and `closed` as above. Many restaurants in Japan close one fixed day a
  week, and some on irregular days: then write "check the closing days" in `text`.
- `text`: what to order, how it works (queue, ticket machine at the door, counter
  seats, cash only), the price per person, then one tip.
- No links to review sites (Tabelog, Yelp, TheFork, Tripadvisor): their addresses carry
  numbers you cannot know. The app links each place to the reviews used in that
  country by itself.
- For a meal that matters (a famous place, a long queue), add a fallback nearby: a
  second food stop with the tag "Alternative".

Tell the traveller which closing days and booking rules were not verified.

### Costs

The app adds up what the trip costs the traveller who holds it, at the exchange rate of
each day. Every amount is **what that traveller pays**: their own share of what is split
with others. You know from the conversation who shares what; the app does not need to
know how many people travel. Give it what you know, and nothing you do not:

- `currency` on the trip: the money of the destination (`"JPY"` in Japan).
- `cost` on a stop, as a number: what the traveller pays there. A museum ticket at
  ¥1,200 is `1200`, whoever comes along; a dinner for two at ¥12,000 split in half is
  `6000`. Only prices you know: tickets, trains, a booked menu. A free sight is `0`; a
  price you are not sure of stays out, or goes in `text` as something to check.
- `currency` on a stop only when it is paid in another money (a ticket bought from home).
- `expenses` for what is paid outside the stops, often before leaving: flights,
  hotels, rail passes, insurance, each with `title`, `cost` and the `date` it was paid.
  A double room for two at €200 a night is `100` a night for the traveller. Only the
  ones the traveller told you about.
- `private` for what the traveller spends only for themselves and does not want in the
  shared trip: shopping, a meal alone. `{"expenses": [...]}`, written like the trip's
  expenses. Only when the traveller asks for it. In a file the app saved, keep
  `private.owner` exactly as it is; never write one yourself.

## 4. Facts that go out of date

Prices, opening hours, closing days, timetables and seasonal closures change.
Verify them when you can. When you cannot, either leave the detail out or word it as
something to check ("check the timetable on the day"), and tell the traveller which
facts were not verified. Never state an unverified price or time as certain.

## 5. The Info page

Keep it to what someone needs in a hurry: emergency numbers, how to pay and get cash,
how luggage moves between hotels, booking codes, five or six phrases in the local
language. Each section has a `title` and `items` of `label` and `text`; a text that is
only a phone number can be tapped to call. The stays are listed there by the app.

## 6. Check the file

<!-- llms.txt: skip -->
**With Node and a copy of the repository:**

```bash
node tools/validate-trip.mjs --map private/<trip-name>.json
```

Fix every error. Then read the `--map` lines, one per day:

```
day 3 2027-05-16: Lisbon: 2 pins, 0.9 km across | Sintra: 4 pins, 1.3 km across
```

- Each `|` separates a map: stops more than 12 km apart are drawn on separate maps. A
  walking day in one city should be one map, a few km across.
- An unexpected extra map, or a walking day that is 40 km across, means a position is
  wrong. Find it and fix it.

<!-- llms.txt: end -->
**Without Node:** load the file in the app (or paste it: Trips → Paste a trip). It
runs the same checks and lists every problem with its position in the file, for
example `days[2].stops[0].lat: must be a number between -90 and 90`. Fix them and load
it again. When an assistant wrote the file, "Copy for the assistant" copies the list
with a request to fix it, ready to paste into the chat. Then open the map of each day
and look for a pin in the wrong place.

## 7. Hand it over

Tell the travellers, briefly:

1. Send the file to each phone (chat, AirDrop, Drive), or the JSON to copy.
2. Open the app **from its Home Screen icon** and choose "Load a trip file", or
   "Paste a trip". On an iPhone, loading it in Safari instead puts it in a different
   storage.
3. Open the app once with a connection before leaving.
4. What could not be verified: positions, prices, hours.

## Updating a file later

**An AI assistant in a chat:** the traveller sends an outline of the trip (from Trips →
Have an AI assistant change this trip). Answer with the changes only, in the format
`travel-in-my-pocket/changes` described in the format reference: never the whole file
again. Put the version named at the top of the outline in `from`.

**With the whole file:**

- Start from the latest file: travellers change trips in the app too, and save them
  from Trips → Save the file. An older copy loses nothing, because the app merges, but
  starting from the latest one avoids surprises.
- Keep the trip `id` and the `version` block exactly as they are, if the file has
  them: the app then updates the trip, keeps what was ticked, and makes a new version.
  Never write or change `version` yourself.
- Keep the `id` of every stop that still exists, even if it is renamed or moved.
- Keep `private` and its `owner` as they are, unless the traveller asked to change
  their private expenses.
- Change only what was asked. Do not rewrite texts nobody mentioned.
- Check the file again.

## The Google Maps key

Optional. Without it the interactive map uses OpenStreetMap. If the traveller has a
key and wants Google Maps, add `"googleMapsKey": "..."` at the top level.

- Only use a key the traveller gives you. Never invent one, never reuse one from
  another file.
- The key must be restricted to the app's address and to the Maps JavaScript API, with
  a daily quota. [Google Maps](google-maps.md) explains how.
- A file with a key must not be published.

## Mistakes to avoid

- `"name"` for a stop: it is `"title"`. And `"format": "travel-in-my-pocket/2"` first.
- Positions swapped (`lat` is north-south, between -90 and 90).
- Two entries for the same date. Use `plans` for alternatives.
- A day with both `stops` and `plans`, or with neither.
- Colours, icons or map settings: the file has none.
- Long paragraphs in `text`. The traveller reads this standing up.
- Links to review or booking pages you did not get from the traveller.
- Prices you guessed, or the total for everyone in `cost`: it is the traveller's share.
- Comments or trailing commas in the JSON.
- HTML in the texts. Only `**bold**` is formatting; everything else is shown as written.
<!-- llms.txt: skip -->
- Saving the real trip in a folder Git tracks.
<!-- llms.txt: end -->
