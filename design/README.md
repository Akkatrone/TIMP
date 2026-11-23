# TIMP's design system

How TIMP looks and behaves, for every screen and every component, today in the web
app and tomorrow in native ones. The rules are written as behaviour, not as CSS, so a
native app can follow them too.

- **`tokens.json`**: the only source of colours, type, space, shapes and motion
  ([W3C Design Tokens](https://design-tokens.github.io/community-group/format/) format).
  `css/tokens.css` is made from it: `node tools/tokens.mjs --fix` after a change
  (`npm run check` fails until you do). Names say what a value is for, never what it
  looks like.
- **`test/design.test.mjs`** holds what can be checked: the contrast of every pair in
  both themes, the colours of the map, and the styles that may only use tokens.
- **`tools/e2e.mjs`** checks the rest in the browser: names, states, sizes, focus.
- **`index.html`** (published at `/design/`) shows it all: the tokens, their contrast in
  the theme chosen, and every component drawn with the app's own styles.

A new component says, in its comment, which rules it follows. A change that breaks one
needs a reason in its pull request.

## The rules

**R1. One element, one action.** Everything that can be tapped does one thing, and it
is clear which. A closed stop: tapping it opens it; its circle marks it done. Going
there (Map, Directions, TheFork) and changing it (Edit, Skip, Alternative) live in the
opened stop.

**R2. Little on screen; actions grow only by opening.** A closed stop shows its time,
name, place, one signal and its circle. Opened, actions sit in **zones by meaning,
never mixed**: "Go" (leaves the app, ↗) above, "Change" (stays in the app) below a
line, quieter. At most four per zone.

**R3. One main action per screen, and it depends on the moment.** One filled element in
the accent colour, one thing floating. On a day: before and after the trip, **+**; on
the day itself, **going to the next stop**. Adding is always also the last row of the
list.

**R4. Three weights of button; the weight says the consequence.** Filled: the main
action. Outlined: an action that changes the trip. Text: add, open, cancel. Changes for
everyone on a shared trip ask first, saying who will see them.

**R5. Narrow places hold only values from a known set.** Never free text where the
width is fixed: nothing wraps, nothing is cut.

**R6. At once, then the content.** A sheet or a page appears on the tap (the first frame
within 100 ms) in its final shape; slow content (history, search, weather) arrives
inside it without anything jumping. Long lists are drawn in parts.

**R7. Motion explains, it does not decorate.** Three durations: a change of state, a
thing opening in place, a thing coming in (`motion` tokens). What has no action does not
move. With "reduce motion", things only fade.

**R8. It explains itself.** No paragraph of instructions on a screen. If something needs
explaining, change the thing.

**R9. For everyone.** See "Accessibility" below: it is part of every rule.

**R10. Tokens only.** Styles use the tokens. `test/design.test.mjs` counts the values
the older styles still have of their own: the counts may only go down.

**R11. The map is always light.** In the dark theme everything darkens but the map: a
dark map cannot be read outdoors. Pins and lines keep the light colours; the frame
around the map follows the theme.

**R12. No arrows to open in place.** What opens says so by what it hides: "+2" beside
alternatives, "+3" on the day's line, a description ending in "…". Opened, it closes
with "Close" or a tap on its heading. A sign remains only for what leads elsewhere (the
trip's title opens the list of trips) or out of the app (↗).

**R13. Distinct stops, read at a glance.** Every stop is a card of its own; the line of
the day joins them in the gaps. Inside, in the order they are looked for: the time
(marked, above), the name (full width, at most two lines, whole when opened), the place
(the area first). On the left only the number.

**R14. On the day, the list starts from now.** When the day shown is today (in the
trip's time zone), the list scrolls to the next stop, with the one before just visible;
a "now" mark on the line says the time and how long until the next; the next stop is
open; the stops done today are compact. It scrolls when the app opens and when it comes
back, never while the traveller scrolls. Other days, and after the trip, every stop has
the same shape.

**R15. Full, dots, dashes.** Three strokes, three meanings, in the list and on the map.
Full: what is there and ahead. Dots: where you have already been. Dashes: what is not
there yet (a choice to make, an option not chosen, "+ Add a stop").

## The line of the day

Every city is a line, every stop a station, as on a metro map. The line takes the
city's colour (`city` tokens); a station shows the stop's number in the colour of its
kind of place (`place` tokens), the same sign as on the map. Behind you the line turns
to dots; ahead it stays full; "now" is the accent's dot. When a day changes city, the
line changes colour at an interchange that shows the means and the times.

- **The circle**: to do (an empty ring), done (a full tick in ink: green means "in
  order", booked), skipped (a dash; the name struck through; the route leaves it out).
- **Stations**: to do (the kind's colour), done or skipped (empty, grey), to choose
  (dashed, no number), without a position (crossed, no number; a tap finds it).

**One colour, one meaning, per shape.** Accent: now and the main action. City: the line.
Kind of place: the station. Ink: text, and done. Yellow, green, red: attention, in
order, error. The accent belongs to none of the palettes.

## On the day (travelling)

- **V1** The day starts from now (R14).
- **V2** The main action changes with the moment (R3).
- **V3** The next stop's bar appears at the bottom, within reach of a thumb, when the
  next stop's card leaves the screen; it goes when the card comes back. Number, name,
  time, how long until it, distance; "Directions" from where you are; a tap on the rest
  brings back the card.
- **V4** Distances from your position, if you give it to the app: asked the first time
  it is needed, saying why; it stays on the phone. Without it, from the stop before.
- **V5** In the sun, tired, one hand: time and name always in full ink (7:1), the name
  at least 15 points; the actions of the moment at the bottom; no hidden gesture for
  anything important.
- **V6** No reproach: stops left behind do not warn and do not move.
- **V7** Offline, the whole day works; the map becomes the sketch.
- **V8** A choice still to make that is the next stop shows time, cost and distance for
  each option.

## Signals and warnings

Four levels: **error** (red; something failed or may be lost), **attention** (yellow;
it may leave you at a closed door), **to know** (grey), **in order** (green). The level
gives the colour; the kind gives the icon (a calendar for a closure, a cloud for the
weather, a ticket for a booking, a fork for a choice). Four places: the app (a strip
under the bar, one at a time), the day (one line that opens), the stop (one signal), the
moment (a message that passes, with Undo when there is one).

- **W1** Every warning says what to do, or why it matters.
- **W2** One fact, one place.
- **W3** Warnings end: a stop done or skipped, a day gone, a decision taken.
- **W4** The trip's own label (`tag`) stays free text, in "to know", last.
- **W5** Several signals on one stop: closed, it shows the first (closed, booking
  needed, weather, choice, booking advised, label, booked) and "+N"; opened, all of
  them first, one per row, each with its action.

## Search

- **S1** One field, the whole trip: a stop's name, its local name, description,
  address, label and group, the plan, the city and title of its day, the day's notes.
  On the phone, offline (`js/search.js`, no DOM).
- **S2** Letters without accents or case; every word typed must be found.
- **S3** A result is the stop's sign (its number in its kind's colour), its day and time,
  its name; the word found is marked, and where it was found when not in the name.
- **S4** A tap goes there: the day, the stop open and in view, the focus on it. An option
  not chosen: its group opened.
- **S5** At once (R6): the sheet opens with the field ready; results follow every
  letter; how many were found is said (a `status`), nothing found too.

## The map

- **M1** The same sign in the list and on the map: a station, the stop's number in its
  kind's colour; done or skipped, empty and grey; chosen, larger, with a ring.
- **M2** A view of the day (List | Map in the top bar), not a panel: the map takes the
  heading's place, right under the bar, and stays there while the list scrolls under it.
- **M3** A pin, one action: its stop comes up just under the map, marked. No card on the
  map. A stop's number in the list shows its pin.
- **M4** The lines are always there: full ahead, dots where you have been.
- **M5** Two controls: my position (asked of the phone only then; it stays on the
  phone), the whole day. Zoom is with the fingers or the wheel. A day in more than one
  place: a row of their names, a tap shows that one.
- **M6** Offline, the sketch by itself, in scale.
- **M7** Always light (R11), with its attribution.
- **M8** At once (R6): the stage has its size before the tiles come.
- **M9** Choosing a point (the stop form): the sign stays in the middle, the map moves.

## Accessibility

Part of every component, checked where it can be.

- **A1 Semantic HTML first.** A button is a `<button>`; a link (`<a href>`) only goes
  somewhere; lists are lists; headings in order (the page, the day, the stops);
  landmarks (`header`, `nav`, `main`).
- **A2 Every control has a name** a screen reader says, in the interface's language:
  its text, or `aria-label` from `js/i18n.js`. An icon alone always has one.
- **A3 States are said, not only shown**: `aria-pressed` (the circle, a view),
  `aria-expanded` with `aria-controls` (what opens in place), `aria-current` (the day),
  `aria-checked` (an option), `aria-disabled` with the reason a tap gives.
- **A4 Focus is visible** and follows the order on screen; a sheet keeps the focus inside
  and gives it back when it closes.
- **A5 Targets of at least 44 × 44** (`--touch`), even when the sign drawn is smaller.
- **A6 Live regions**: a passing message is a `status`, an error of the app an `alert`.
- **A7 Text grows**: sizes in `rem`, no fixed heights that cut text; at twice the size
  rows wrap, they do not overlap.
- **A8 Colour is never alone**: a level has its icon and its word; a state its shape.
- **A9 Contrast** (tokens): 4.5:1 for text, 3:1 for controls and lines, 7:1 for a stop's
  time and name.
- **A10 Language**: the page's `lang` follows the interface; a local name carries its
  own.
