---
name: create-trip-file
description: Create or update a trip file (.json) for TIMP, the "Travel in my pocket" web app, from an itinerary, notes, bookings or a conversation. Use when the user wants to turn a trip plan into a file they can load on their phone, asks for a "trip file", a "pocket guide", a "TIMP" or "travel in my pocket" file, or wants to change, extend or fix an existing trip file.
---

# Create a trip file for TIMP (Travel in my pocket)

The instructions for this task are the same for every assistant and live in the
project's documentation, so that they exist in one place only. Read them before
writing anything:

1. `docs/creating-a-trip.md` — how to write a good trip file, step by step. Follow it.
2. `docs/trip-format.md` — every field and what is valid. Use it as the reference.
3. `examples/demo-trip.json` — a complete, valid example.

Then:

- Save the file as `private/<trip-id>.json`. Git ignores that folder. Never save a
  real trip anywhere else in the repository and never commit one.
- Changing a trip that already exists: start from the latest file the app saved. Keep
  the trip `id`, every stop `id` and the `version` block as they are; never write or
  change `version`. The app makes a new version from your work.
- Check it, and read the map summary it prints:

  ```bash
  node tools/validate-trip.mjs --map private/<trip-id>.json
  ```

- Tell the user what you could not verify (coordinates, prices, opening hours) and
  how to load the file on a phone.

The rules for working in this repository are in `AGENTS.md`.

## If you are not inside the repository

This skill may have been installed on its own. In that case get the two documents
from the project page before you start, and do not write the file from memory:

- <https://github.com/Frafal/TIMP/blob/main/docs/creating-a-trip.md>
- <https://github.com/Frafal/TIMP/blob/main/docs/trip-format.md>

If you cannot reach them, ask the user to attach them. Without Node, the user checks
the file by loading it in the app, which lists every problem with its position.
