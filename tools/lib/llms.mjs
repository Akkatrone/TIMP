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

export function llmsText({root = ROOT, site = "https://frafal.github.io/TIMP/"} = {}){
  return `# TIMP (Travel in my pocket): how to write a trip file

> For AI assistants asked to make a trip for TIMP. TIMP is a web app (${site}) that
> shows a day-by-day travel guide on a phone, offline. A trip is ONE JSON file. The app
> checks it strictly and refuses the whole file if a single rule is broken, so follow
> the format below exactly: do not invent field names.

## Checklist: check every point before you hand over the file

1. The first field is \`"format": "travel-in-my-pocket/1"\`.
2. \`"id"\` is lowercase letters, digits and dashes, like \`"rome-2027"\`.
3. \`"title"\` is the name of the trip.
4. \`"places"\` is an object with at least one entry. Each key is lowercase with dashes
   (\`"rome"\`), and each entry has \`"name"\` AND \`"color"\` as \`"#rrggbb"\`
   (a medium or dark tone, like \`"#b8451b"\`).
5. \`"days"\` is a list, one entry per date, dates as \`"YYYY-MM-DD"\` in ascending order.
   Each day has \`"date"\`, \`"place"\` (one of the keys of "places"), \`"title"\`, and
   \`"stops"\`.
6. Each stop has \`"time"\` and \`"title"\` (not "name", not "place"). Give \`"lat"\` and
   \`"lng"\` as numbers for every stop that is a place, and \`"query"\` (name and town)
   for the Google Maps link.
7. Only the fields listed below. Valid JSON: double quotes, no comments, no trailing
   commas. Hand over the whole file, in one block.

The smallest valid file:

\`\`\`json
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
        {"time": "09:00", "title": "Colosseum", "lat": 41.8902, "lng": 12.4922, "query": "Colosseum, Rome"}
      ]
    }
  ]
}
\`\`\`

## How the traveller loads it

They copy the JSON and, in the app, tap Trips → Paste a trip (or save it as a .json
file and load it). If the app refuses it, it lists each problem with its position, like
\`days[0].stops[2].title: is required\`, and a button copies that list to send back to
you. Fix every problem and hand over the whole file again.

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
