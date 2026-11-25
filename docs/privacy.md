# Privacy, in full

The [README](../README.md#privacy) has the short version. This is everything the app
sends, to whom, and what stays on your phone.

## The app

- Trip files are read on the device and stored in the browser's local database
  (IndexedDB). They are never sent to the server that hosts the app.
- No analytics, no cookies and no third-party fonts or scripts at startup. The only
  library, MapLibre, is served with the app and loaded only when you open the
  interactive map.
- When you open the interactive map, its data is requested from
  [OpenFreeMap](https://openfreemap.org/) (OpenStreetMap as vector tiles: no key, no
  cookies), from OpenStreetMap when OpenFreeMap does not answer, or from Google. They
  see your IP address and the area you look at.
- "Map" and "Directions" links open Google Maps.
- When you add or change a stop and its position has to be looked up, its name and
  address are sent to Google (with a key) or to OpenStreetMap. A Google Maps short link
  you paste or share is sent to the link resolver, if the app has one.
- When a cost in another currency has to be converted, the app asks
  [Frankfurter](https://frankfurter.dev/) for the exchange rates of that month: every
  currency against the euro, so the request carries only the month, never an amount, a
  place or the trip's currency. Each month is kept on the phone.
- Nothing else of the trip is sent.
- The link resolver keeps nothing: no storage, no logs. Cloudflare, which runs it, sees
  the request like any web service. Its code is [worker/resolve.js](../worker/resolve.js).
- A saved trip file goes only where you send it. When the trip has private expenses,
  the app asks each time whether they go in the file.
- A Content-Security-Policy in `index.html` lets the page load code only from the app
  itself and from Google's map servers, and send requests only to the services above.
  Text in a trip file is always escaped; the policy is a second lock in case that ever
  fails.

## With an account

- An account is optional, and only on a copy of the app that has a sharing service.
  Making one sends that service a name and the public half of a passkey (the key itself
  never leaves the phone): no password, no email. Without an account nothing changes.
- Signed in, your trips and your private expenses go to the service too, encrypted
  where they are kept, so that they are on your other phones and shared only with the
  people you invite.
- **Chat apps.** A chat app (Claude, ChatGPT…) reaches your trips only if you link it to
  your account: the app shows who asks, what it will be able to do and where the answer
  goes, and you allow or deny it there, with your passkey (asked again if you did not
  just sign in). The chat app gets a key of its own, never your passkey or your session;
  your private expenses only if you tick them. You → Your AI shows which chats can
  reach your trips, and unlinks one at once.
- **Who can get in** is up to you: You → Passkeys and devices lists your passkeys and
  the devices signed in. Add a passkey on each phone you use, take one off (never the
  last), sign out every other device at once. Adding or taking off a passkey asks for
  your passkey again if you did not just sign in, so a phone left open is not enough to
  change who can get in. Removing a passkey signs out the devices it opened. The service
  keeps the name each browser gives itself, to tell your devices apart.
- **Recovery codes**, made there and shown once, let you back in if you lose every
  passkey: the service keeps only their hashes, each works once, and using one replaces
  your passkeys with a new one on that phone, signs every other device out and unlinks
  your chats. Whoever has a code can get in: keep them away from your phone.
- **Publishing.** A trip you publish (Share → With the link) is a page anyone with its
  address can read, even without the app; it never shows up in searches. Only the
  version you publish, and only what you reviewed first: your private expenses, a
  Google key and the trip's history never go; booking codes, phone numbers, emails and
  where you sleep are found and taken out unless you keep them; the dates show as days
  of the week unless you choose the real ones. Withdraw it whenever you want: the page
  then says it was withdrawn. Copies others made with "Use as a base" stay theirs.
- A trip someone else published opens in your app read only ("Open in TIMP" on its
  page): it stays on your phone and never goes to your account. "Use as a base" makes a
  copy all yours, which says where it came from (`basedOn`); the original's author
  learns nothing of it.
- **Your data is yours:** You → Export my data gives you a copy of everything the
  service keeps about you; Delete account deletes all of it for good (your handle
  written again, then your passkey).
