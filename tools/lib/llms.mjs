// llms.txt: everything an AI assistant needs to write a trip file, in one plain text
// page published with the app (https://frafal.github.io/TIMP/llms.txt).
//
// Chat assistants (Gemini, ChatGPT…) read one page when given a link; they do not
// clone the repository and open docs/. This page is made by the build from the same
// documents agents read, with a checklist of the mistakes chat assistants make first.
// Nothing here is written twice: change the documents, not this file.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./app-files.mjs";

const read = (root, f) => readFileSync(join(root, f), "utf8").trim();

// Links between the documents point at files in the repository; on the published
// page they would lead nowhere, so they become plain names.
const unlink = md => md.replace(/\[([^\]]+)\]\((?!https?:)[^)]+\)/g, "$1");

export function llmsText({root = ROOT, site = "https://frafal.github.io/TIMP/", resolver = ""} = {}){
  const links = resolver ? `
## Google Maps links

If the traveller gives you Google Maps links (\`https://maps.app.goo.gl/…\`) and you can
open web addresses, ask the link resolver of this site, one link at a time:

    GET ${resolver}?url=<the link, URL-encoded>

It answers with JSON: \`title\`, \`address\`, \`lat\`, \`lng\`, \`type\` (each only when
known) and \`link\`. Put them in the stop as they are. It keeps nothing.
` : "";
  return `# TIMP (Travel in my pocket): how to write a trip file

> For AI assistants asked to make a trip for TIMP. TIMP is a web app (${site}) that
> shows a day-by-day travel guide on a phone, offline. A trip is ONE JSON file that
> says what the trip is: days, stops, where to sleep, what to remember. Never how it
> looks: the app picks colours, draws maps and chooses icons. The app refuses the whole
> file if one rule is broken, so follow the format below exactly and invent no fields.
> The format as a JSON Schema: ${site}trip.schema.json

## Checklist: check every point before you hand over the file

1. The first field is \`"format": "travel-in-my-pocket/2"\`, then \`"title"\`.
2. \`"days"\` is a list, one entry per date, \`"date": "YYYY-MM-DD"\`, in date order.
3. Each day has \`"stops"\` (a list), or \`"plans"\` (two or more, each with \`"name"\` and
   \`"stops"\`), never both. Give it \`"city"\` and \`"title"\` too.
4. Each stop has \`"title"\` (not "name", not "place"). Add \`"time"\`, \`"type"\`, \`"address"\`,
   and \`"lat"\` and \`"lng"\` as numbers when you know the position.
5. \`"type"\` is one of: sight, museum, food, park, view, shop, walk, hotel.
   \`"travel"\` (how you get there) is one of: metro, bus, train, plane, boat.
6. \`"stay"\` is a name, or \`{"name", "address", "note"}\`. \`"info"\` sections have
   \`"title"\` and \`"items"\` of \`{"label", "text"}\`.
7. No colours, icons, ids or versions: the app writes those. Only the fields listed
   below. Valid JSON: double quotes, no comments, no trailing commas. Hand over the
   whole file, in one block.

The smallest valid file:

\`\`\`json
{
  "format": "travel-in-my-pocket/2",
  "title": "Rome in three days",
  "days": [
    {
      "date": "2027-04-10",
      "city": "Rome",
      "title": "The ancient city",
      "stops": [
        {"time": "09:00", "title": "Colosseum", "type": "sight", "address": "Piazza del Colosseo, Rome", "lat": 41.8902, "lng": 12.4922}
      ]
    }
  ]
}
\`\`\`

## How the traveller loads it

They copy your answer and, in the app, tap Trips → Paste a trip (or save it as a .json
file and load it). If the app refuses it, it lists each problem with its position, like
\`days[0].stops[2].title: is required\`, and a button copies that list to send back to
you. Fix every problem and hand over the whole file again.
${links}
---

${unlink(read(root, "docs/creating-a-trip.md"))}

---

${unlink(read(root, "docs/trip-format.md"))}

---

# A complete example

\`\`\`json
${read(root, "examples/demo-trip.json")}
\`\`\`
`;
}
