# Creating a trip file

How to write a good trip for TIMP (Travel in my pocket), as a person or as an AI
assistant working for one. Every field, and what is valid: [trip-format.md](trip-format.md).

**If you are an AI assistant:** read this page and [trip-format.md](trip-format.md)
before writing anything, and follow the steps in order. If you cannot see
trip-format.md, ask for it: do not write the file from memory.

Write for someone standing in a street abroad, phone in one hand, often offline:
everything in the trip should help them decide what to do next.

## Steps

1. **Read everything you were given**, then ask only for what is missing and changes the
   result: the dates, where they sleep each night, fixed bookings (flights, trains, timed
   tickets). Only a rough idea ("5 days in Lisbon")? Agree on the programme first, then
   write.
2. **Write the trip** in the format, with the advice below it. Never invent bookings,
   hotels, times or prices: leave out what is not decided, or offer it as an option
   (`"tag": "Optional"`, a note, a `choice`).
3. **Check it.** TIMP lists every problem with its position
   (`days[2].stops[0].lat: must be a number between -90 and 90`), and "Copy for the
   assistant" sends that list back to be fixed. Then look at each day's map for a pin in
   the wrong place.
<!-- llms.txt: skip -->

   With Node, in a copy of this repository: `node tools/validate-trip.mjs --map
   private/<trip-name>.json` runs the same checks, then prints a line per day
   (`day 3 2027-05-16: Lisbon: 2 pins, 0.9 km across | Sintra: 4 pins, 1.3 km across`).
   Stops more than 12 km apart go on separate maps (`|`): an unexpected extra map, or a
   walking day 40 km across, means a position is wrong.
<!-- llms.txt: end -->
4. **Hand it over**, saying in a few lines what you could not verify (positions,
   prices, opening hours). The traveller opens TIMP from its Home Screen icon (on an
   iPhone not from Safari, which keeps another storage) and taps **Paste trip**, or
   **Load a file** for a `.json` file.

A trip holds hotels and dates: it is private, for the traveller only.
<!-- llms.txt: skip -->
In a copy of this repository, keep it in `private/<trip-name>.json`: Git ignores that
folder. Never commit a real trip.
<!-- llms.txt: end -->

## Days

- `city` written the same way every day: days in one city share a colour, and a change
  of city shows ("Lisbon → Porto").
- `stay` in full (name, address, a `note` with check-in and booking details) on every
  night in that hotel; a plain name for a night that is not one ("Night train").
- `notes`: only what would spoil the day if forgotten, and the way round it ("The last
  ferry back leaves at 17:30"). Zero to three.
- Stops in the order they happen, the practical ones too: arrival, check-in, the train
  to the next city, the way back to the hotel.
- Options for one moment (three places for lunch): two to four stops with the same
  `choice`, `"chosen": true` on the one you suggest, or on none. `plans` only when the
  whole day changes (a rainy day).

## Stops

- `time`: a clock time when it matters, a part of the day when it does not, none for
  all day.
- `text`: one to three sentences, the most useful first: how to get there from the stop
  before (line, minutes), price and hours, what to see, one tip. The app shows two lines
  until tapped. In the travellers' language and tone.
- `tag`: what to know at a glance: "Ticket needed", "Booked 19:30 · 2 people",
  "Cash only".
- `travel` whenever the way there is by metro, bus, train, plane or boat. A journey that
  is a stop of its own ("Train to Kyoto") has `travel` and no position.
- `booking: "booked"` only when the traveller says it is done.
- `local` wherever the sign is not in the Latin alphabet: staff and taxi drivers read
  it, and the app searches the reviews with it.
- Positions with four decimals, looked up whenever you can; from memory only for places
  you are sure of (major landmarks, main stations). Otherwise a good `address`, as typed
  into Google Maps: Map and Directions still work. No position for what is not a place
  ("free afternoon").

### Places to eat

- `text`: what to order, how it works (queue, ticket machine, counter seats, cash only),
  the price per person, one tip.
- `closed` days; where a place closes on irregular days, "check the closing days" in
  `text`. `booking` where a place takes only bookings.
- For a meal that matters (a famous place, a long queue), a second stop nearby tagged
  "Alternative".
- No links to review sites: the app links each place to the ones used in its country.

### Costs

Every amount is what this traveller pays, their share of what is split: a ¥1,200 ticket
is `1200`; a ¥12,000 dinner split in two, `6000`; a €200 double room for two, `100` a
night.

- `currency` on the trip: the destination's money; on a stop only when paid in another.
- Only prices you know. A free sight is `0`; an unsure price stays out, or goes in `text`
  as something to check.
- `expenses`: what is paid outside the stops (flights, hotels, passes), with the `date`
  it was paid. `private`: only when the traveller asks; keep `private.owner` as it is.

## Facts that go out of date

Prices, hours, closing days and timetables change. Verify them when you can; otherwise
leave them out or word them as something to check ("check the timetable on the day").
Never state an unverified time or price as certain.

## The Info page

What someone needs in a hurry: emergency numbers, how to pay and get cash, how luggage
moves between hotels, booking codes, five or six phrases. The app lists the stays itself.

## Updating a trip

- **In a chat**: the traveller sends an outline (TIMP → Plan it with your AI → Change
  this trip). Answer with the changes only, never the whole file again, with the
  outline's version in `from`.
- **With the whole file**: start from the latest one; keep the trip `id`, the `version`
  block, every stop's `id`, `private` and its `owner` exactly as they are (a new stop has
  no `id`); change only what was asked.

## A Google Maps key

Optional: without it the map is OpenStreetMap's. Only a key the traveller gives you, as
`"googleMapsKey"` at the top level; a file with a key is never published.

## Mistakes to avoid

- `"name"` for a stop (it is `"title"`); `lat` and `lng` swapped.
- Two entries for one date; a day with both `stops` and `plans`, or with neither.
- Colours, icons, map settings: the app chooses them.
- Long paragraphs, or HTML: only `**bold**` is formatting.
- Guessed prices, or the total for everyone in `cost`.
- Links to review or booking pages you did not get from the traveller.
- Comments or trailing commas in the JSON.
<!-- llms.txt: skip -->
- A real trip in a folder Git tracks.
<!-- llms.txt: end -->
