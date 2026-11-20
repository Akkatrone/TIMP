# Changelog

Versions follow [Semantic Versioning](https://semver.org/). The trip file format has
its own version: `travel-in-my-pocket/2` since 3.0. Files in `travel-in-my-pocket/1`
(1.0 to 2.4) still load: the app converts them.

## 3.15.0

Chats that change your trips; deleting for good asks for the trip's name.

- **Delete from my account** now asks once more: write the trip's name, and only then
  "Delete for good" can be pressed. It goes from every phone and for the people it is
  shared with, so one tap is no longer enough. "This phone only" asks as before.
- **Claude, ChatGPT and other chat apps can change your trips** (on the sharing
  service): they change the version they read and their changes join those made on
  your phones; anything they would take away or empty, they ask you first. They can
  also put a new trip on your account. Your private expenses stay out of their reach.

## 3.14.1

Sync that says what went wrong.

- **One trip does not stop the others**: if the service fails on a trip, the others
  still sync; that trip's card says "Not synced" and why, and the next sync tries it
  again. Before, one failing trip stopped every trip after it, with only "Sync did not
  work" to see.
- **Put on my account**: a trip marked "No longer on your account" (deleted from the
  account on another phone, or no longer shared with you) can go back on it, as yours.
- The service let a trip deleted from the account block the same trip going on it
  again (the example, loaded once more): fixed there.

## 3.14.0

Linked chats.

- **Trips → Linked chats**: the chat apps that can reach your trips, what each can do,
  since when and when it was last used. Unlink stops one at once; to link it again you
  start from the chat.
- **Chats can read your trips**: in a few words, the trip day by day with the ids of
  its stops, then a day, a stop or the practical information in full. Your private
  expenses stay out.

## 3.13.0

Your trips in Claude and ChatGPT: the first step.

- **A chat app can ask for your trips**: connecting TIMP in Claude, ChatGPT or Claude
  Code opens the app, which shows who asks, what it will be able to do (read your trips,
  change them) and where the answer goes. You allow or deny, signed in with your
  passkey; the chat app gets a key of its own, never your passkey or your session. Only
  on a copy of the app with a sharing service, and only with an account.
- For now the chat lists your trips. Reading their days and stops, and changing them,
  come next.

## 3.12.2

Asking an AI assistant, from the phone.

- **Write your request in the app**: a box for the trip to write ("Your trip") and one
  for the changes to the open trip ("What to change"). Copy makes the whole message,
  with your words as its last line: in the chat you only paste and send. What you wrote
  stays on the phone until you clear it, one draft per trip.
- **The messages end with the line to fill in**: the format and the trip come first.
  With an empty box, the part in brackets is there to complete in the chat, right
  where the cursor is.

## 3.12.1

Deleting a trip that is on your account.

- **Delete asks where**: from this phone only (it stays on your account and your other
  phones, and is not downloaded here again, until "Bring back trips taken off"), or
  from your account (gone from every phone, also for the people you shared it with).
  A trip shared with you: this phone only, or leave the sharing.
- **A trip deleted on another phone, or no longer shared with you**, stays on this
  phone, marked "No longer on your account", and is no longer sent: before, every sync
  failed on it.
- **A new phone** that signs in shows the trips that arrive from the account: before,
  they came but nothing opened them.

## 3.12.0

Your trips on every phone.

- **Sync**: signed in, your trips go to your account and come back on your other
  phones, by themselves: after every change, when the connection comes back, when you
  open the app, or with "Sync now". The same rules as two files: what one side has is
  taken, what both changed is joined, the same version on every phone.
- **Private expenses** sync too, for you only: joined by expense, what changed wins and
  what you delete goes from your other phones as well.
- **Trips shared with you** come down; read-only ones keep your changes on your phone.
- A synced trip no longer asks to be saved as a file: the account keeps it. Files work
  as before.

## 3.11.0

An account, if you want one.

- **Account**, at the top of Trips and on the welcome screen, only on a copy of the app
  that has a sharing service (built with `--share`). Created with an invitation code
  and a **passkey**: no password, no email; the phone makes a key that never leaves
  it, opened with your fingerprint, face or PIN. Sign in again on any phone with the
  same passkey; sign out when you like. Without an account the app is as before.
- **The sharing service's API is a contract** (`js/share-api.js`): every route, what it
  takes and answers, checked on both sides; `contract/v1.lock.json` and
  `tools/check-contract.mjs` keep it from breaking. Next: your trips synced between
  phones, and shared with people.

## 3.10.0

Maps you can read, wherever you are.

- **The map of OpenStreetMap is drawn by the phone** (MapLibre, with OpenFreeMap's
  vector tiles), instead of being a mosaic of pictures. Names are in the app's
  language, or in Latin letters, and under them as on the signs when the place writes
  in another script: "Kyoto" over "京都市", "Shibuya Station" over "渋谷駅",
  "Jongno 3-ga" over "종로3가". In Europe nothing changes but the look.
- **A real dark map** in the dark theme, instead of the light one turned around.
- **Sturdier**: if OpenFreeMap does not answer, the same map comes as pictures from
  OpenStreetMap, as before. A phone without WebGL keeps the sketch.
- MapLibre takes the place of Leaflet. It is downloaded the first time a map is
  opened, not with the app: the interactive map needs a connection anyway.

## 3.9.0

Ready for trips that are not only yours.

- **Two trips with the same name and first day** have the same id. A file that shares
  no version with the trip on the phone (a friend's trip, say) was offered for a
  merge; now the app asks, and can keep it as a trip of its own, under a new id. It
  can still join them, for the same trip written again from scratch.
- **Changes say which version they were written for.** The outline for an assistant
  names the trip's version, and the changes carry it back in `from`. If the trip has
  changed on the phone in the meantime, the changes are applied to the version the
  assistant saw and joined with what came after, as two files are, instead of
  landing on a trip the assistant never read.

## 3.8.1

Buttons that feel like buttons.

- **No box around a tapped button**: the phone's own tap highlight, a rectangle that
  ignored the round shape of the buttons, is gone everywhere. A pressed button gives
  way a little instead; links and rows fade while pressed.
- **No ring after a tap**: the app puts the focus back on the button it draws again,
  or on the first button of a dialog, for keyboards and screen readers. After a tap
  that showed a ring wider than the button, on iPhone above all. Rings now show only
  after a key.
- Text on buttons is not selected by a long press, and hover effects stay with the
  mouse: on a phone they stuck after the tap.

## 3.8.0

What the trip costs you, and what you keep for yourself.

- **A cost is what you pay**: your share of what is split with others, so a double
  room for two is half its price. The app no longer needs to know how many travel:
  the trip's total is what it costs the person who holds it. In 3.7 a cost was the
  total for everyone; costs written then are worth a look.
- **Private expenses**, for what you buy only for yourself: a watch, a thousand
  onigiri. Under every amount, Trip or Private; a stop can have both, its cost and
  what you spent there privately ("€30 · ¥1,500 private"). A mistake is one tap away:
  change the choice and save, and the expense moves.
- **Kept out of the shared trip**: private expenses are on your phone and in your
  file, but never in a version or a merge. The trip with or without them is the same
  version, so a friend who skips them shares the trip with you as before.
- **You choose what a file carries**: Save the file asks, when there are private
  expenses, whether they go in it (for you) or not (for someone else).
- **A file with private expenses** is recognised: your own are taken; someone else's
  are asked about, in the merge question or in one of their own, and left out unless
  you say so. Those an assistant wrote, no one's yet, become yours if you take them.
- **Info** counts them apart: the trip's costs and the private ones, a list of them,
  and a lock on the receipt.
- **AI assistants** see them in the outline and change them with `"private": true`;
  the format guide says a cost is the traveller's share.

## 3.7.0

What the trip costs, and stops as cards.

- **Stops are cards**, as in the lists of Android (Gmail, Settings): a light card on a
  darker page, a little apart, rounder at the two ends of the list. In the dark theme
  the page is nearly black and the cards dark grey. Done and skipped stops sink halfway
  into the page.
- **What a stop costs**: written in its form (the amount as you type it, "16.000" or
  "4,50", and its currency on two buttons, the trip's and yours, or any other). It
  shows small under the stop's time, in the currency it is paid in; an opened stop has
  it as its last line, and one more tap shows what it makes in your currency, with the
  rate. Next to "2/5 done", the day's total.
- **At the rate of its day**: each cost is converted at the rate of the day it is paid,
  a stop on its day, an expense on the date it was paid, not the day you look at it.
  Days still to come use today's rate, marked ≈, as an estimate that may change.
- **Expenses outside the stops**: flights, hotels, passes, often paid before leaving,
  each with the date it was paid.
- **What the trip costs**, folded at the end of Info: the total in your currency, the
  dollar, the euro or the trip's, how much is done and how much still to come; day by
  day, by kind of place, and the expenses. Or the same as a receipt.
- **Your currency** is a setting of the phone (Trips), taken from its language at
  first: two people on the same trip can each see their own.
- The rates come from Frankfurter (frankfurter.dev, open source, the median of about
  90 central banks for every day). What leaves the phone is only which month: the
  request is always "every currency against the euro, this month", never an amount, a
  place or the trip's currency. Each month is kept on the phone, so costs convert
  offline once it is there. A new exception to "the trip never leaves the device",
  written in the README.
- Trip format: optional `cost` and `currency` on a stop, `currency` and `expenses` on
  the trip. Changes from an assistant can set them: `setTrip`, `addExpense`,
  `setExpense`, `removeExpense`. Older apps load these files and ignore the costs.

## 3.6.1

What a first try on real phones showed.

- **Holding a number** no longer leaves words selected: while the finger is down
  nothing on the page can be selected, and the phone's own menu does not open.
- **Directions start from the stop before** (not skipped, with a place), in the list
  and on the map. The first stop of a day starts from where the night before was
  spent, or else from the last place of the day before. From where you are: Map.
- **The cards on the map** show the name as on the sign and, for a place to eat, the
  review link. On Google Maps a tap outside the card closes it, and its close button
  shows in the dark theme too (the page's dark color-scheme drew it white on white).
- **Paste** opens its sheet first; Paste in the sheet reads what was copied into the
  field, where you see it before Continue. The phone asks for permission only then.
- **iPhone:** the fields of the forms are 16 px, so the page no longer zooms in when
  you type; lists look the same on every phone, and Day and Time line up.

## 3.6.0

- **Hold a stop's number to see it on the map.** The map opens if it is closed, and the
  pin comes to the middle with its card; on the sketch, its badge pulses. Only a hold:
  a tap or a scroll that starts on the number does nothing.
- The TheFork link searches only TheFork's pages, on its site in the app's language
  (thefork.it in Italian, thefork.com otherwise): a list shows at once whether the
  place is there. TheFork lists only its partners, so a jump to the first result
  could land on another restaurant.
- **Lines on and off without drawing the map again.** The lines and the travel icons
  are always drawn and only hidden: the map keeps its zoom and its place.
- **llms.txt says its version**, and what changed in the format version by version, at
  the top. It asks the assistant to remember the version and to read the page again
  before changing a trip later in the chat. The list comes from a new section of
  docs/trip-format.md, "What changed, version by version".
- The messages the app copies for an assistant (change this trip, problems to fix)
  carry the app's version and the guide's address: in a chat that read an older guide,
  that is the signal to read it again.
- llms.txt is shorter: about 535 lines instead of 991. What only matters inside the
  repository (the checker, the code, versions and maps inside the app, the old format)
  is left out between `<!-- llms.txt: skip -->` markers in the docs, and the complete
  example is one stop per line, without the ids the app writes.

## 3.5.0

- **Places to eat.** Three optional fields for every stop, so files written for 3.4
  still load and older apps ignore them with a warning:
  - `local`: the name as on the sign ("一蘭 渋谷店"), shown under the title.
  - `booking`: `required` shows a warning until it is done, `advised` a softer line,
    `booked` the Booked label. Set it in the stop form (Booking: Done after booking).
  - `closed`: days of the week and dates. The stop warns when its day is one of them,
    also after it is moved. Seven day buttons in the form.
- A review link on food stops, from the stop's position or the trip's time zone:
  Tabelog in Japan (searched by the local name), Naver Map in Korea, Yelp in North
  America, TheFork in Europe (through a web search: its own search pages cannot be
  linked by a name). New js/places.js, no DOM. Nothing is fetched by the app.
- The guide for assistants (docs/creating-a-trip.md, llms.txt) has a section on places
  to eat: local names, booking, closing days, how the place works, a fallback nearby,
  and no invented links to review sites. The outline for changes shows booking and
  closing days.
- The example trip: a dinner that is better booked, a lunch closed on Sundays.

## 3.4.0

- **Days in the app.** Each day has its own ⋯, next to Map of the day. **Edit day**
  changes its city, title, where you sleep and its notes, or deletes the day (asked
  first; History brings it back). **Add a day** opens the stop form on a new day after
  the last: a day cannot be empty, so it is made with its first stop. The stop form
  also offers that new day at the end of its list of days.
- **Plans from an AI assistant.** The changes format has `addPlan`, `setPlan` and
  `removePlan`: "add a plan B for day 3 if it rains" gives the day a second plan to
  choose. On a day without plans, the stops it has become the first plan, named by
  `first`, with their ticks; a day left with one plan has plain stops again.
- Plans stay out of the app's forms on purpose: an alternative itinerary is written
  when the trip is planned, and an assistant writes it better than a phone keyboard.

## 3.3.1

- Paste shows its word only at the top or at the end of a page; anywhere in between it
  is only its icon, scrolling up as well.

## 3.3.0

- **Paste**, at the bottom of every page of a trip, next to +: it reads what you copied
  and does what the Share menu does on Android. A place from Google Maps opens the stop
  form filled in; an AI assistant's answer, a trip or its changes, is loaded. On an
  iPhone, where web apps cannot appear in the Share menu, this is the way in: Copy, then
  Paste. If the phone does not hand over what was copied, a field to paste it opens.
  While the page scrolls down it shrinks to its icon; scrolling up, its word is back.
- The time of a stop is chosen from two lists, hour and minutes, instead of the phone's
  clock: Chrome on Android put that clock's Set button off narrow screens.
- The + button is the accent colour in both themes: the dark one was hard to see.

## 3.2.1

- Samsung Internet can install the app again: it failed ("Download failed") with the
  manifest whose share target takes files. It now gets the same manifest sharing text
  and links only (manifest-basic.webmanifest); Chrome keeps file sharing.
- The list of days shows no scroll bar in Samsung Internet either: the bar is drawn in
  room below the list that its box cuts off.
- Dark theme: the + button is a dark raised button instead of a white disc. The page
  declares it supports light and dark (color-scheme), and the manifest gives the colours
  of the installed app's bars for a dark phone, for the browsers that read them.
- The time picker has no Clear button, which pushed Set off narrow screens on Android.

## 3.2.0

Colours that say what and when, sunrise and sunset, and files shared to the app.

- **Colours on the maps.** Each pin is filled with the colour of its kind of place
  (gold for sights, violet for museums, red for food, green for parks, blue for views,
  pink for shops, brown for walks, indigo for hotels); the lines take the city's. The
  shade follows the part of the day: lighter in the morning, full in the afternoon,
  darker after sunset. The numbers in the list and in the sketch's legend, and the icon
  by each title, use the same colours.
- **Sunrise and sunset**, worked out on the phone from the date and the first stop with
  a position (js/sun.js: no network, nothing in the file). The day shows them under its
  date, and the stops after dark have a moon by their time.
- **Android: share a .json file to TIMP.** The app now accepts files in the Share menu,
  such as a trip or a list of changes from Claude or another assistant, besides text
  and links. Android may take a day to notice; reinstalling the app is immediate.
  iPhone does not let web apps receive shares: copy and paste, or Files and Load.
- **No scroll bar on Android.** The page scrolls inside the app instead of the window,
  whose bar Android draws whatever the styles say.

## 3.1.1

- No scroll bars at all: 3.1.0 hid them only on devices that call themselves touch
  only, and some phones do not.
- The bar of days is frosted glass: the page shows blurred under it while scrolling,
  and an edge appears once it has scrolled. The list of days fades out on the side
  where there are more days to scroll to. Day buttons are a little more polished.
- Older Safari (iOS 15.4 to 16.1): solid colours where color-mix() is missing, and the
  link resolver works without AbortSignal.timeout.
- **Lines**, next to Map and Sketch: hides the lines between the stops (and the travel
  icons on them), on both maps. The choice is kept.
- The example trip shows what the app does now: a fourth day in Porto, reached by train,
  with every kind of place, the metro and the flight home, a night that is not a place
  to sleep, two stops sharing a pin, a map of its own for the airport; the bus up to
  Pena; a Google Maps link on a stop; the emergency number to call with a tap.

## 3.1.0

Changing a trip with an AI assistant costs a few lines, not the whole file again.

- **Changes instead of the whole file.** "Have an AI assistant change this trip" copies
  a message with how to write changes and an outline of the trip (a few lines per day,
  every stop with its id). The assistant answers with the changes only, format
  `travel-in-my-pocket/changes`: add, update, move and remove stops; change, add and
  remove days. Paste a trip applies them as one new version, all or none, with the
  reason when one is wrong. llms.txt and the format reference describe it.
- **Android: share the answer to TIMP.** An assistant's answer with a trip or with
  changes, shared to the app, is loaded as if pasted: no copy and paste.
- **A clock for the time** in the stop form: the phone's own time picker. "Write it in
  words" keeps times like "Evening".
- No scroll bars on phones and tablets.
- The note under a day's stops stands apart from them.

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
