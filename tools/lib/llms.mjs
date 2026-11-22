// llms.txt: everything an AI assistant needs to write a trip file, in one plain text
// page published with the app (https://frafal.github.io/TIMP/llms.txt).
//
// Chat assistants (Gemini, ChatGPT…) read one page when given a link; they do not
// clone the repository and open docs/. This page is made by the build: the version and
// the latest changes to the format, the format in short (formatBrief in js/trip.js, made
// from FIELDS, the same text the app copies for an assistant: every field), how to write
// changes, the guide (docs/creating-a-trip.md) without what only matters inside the
// repository (between <!-- llms.txt: skip --> and <!-- llms.txt: end -->), the example,
// compact. The field reference (docs/trip-format.md) stays for people: the format in
// short says the same in a fifth of the length. Nothing here is written twice: every
// line is read, and paid for, by every assistant that writes a trip.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./app-files.mjs";
import { formatBrief } from "../../js/trip.js";
import { changesBrief } from "../../js/changes.js";

const read = (root, f) => readFileSync(join(root, f), "utf8").trim();

// Parts of the documents for people working in the repository: the checker, the code,
// how versions and the map work inside the app.
const SKIP = /<!-- llms\.txt: skip -->[\s\S]*?<!-- llms\.txt: end -->\n?/g;
// What changed in the format, version by version: at the top of the page, so an
// assistant that reads it again sees first what is new.
const NEWS = /\n## What changed, version by version\n([\s\S]*?)(?=\n## |$)/;

// The example as a chat assistant should write it: no ids or version (the app adds
// them), one stop per line. A third of the length of the file as the app saves it.
function compactExample(trip){
  const t = JSON.parse(JSON.stringify(trip, (k, v) => k === "id" || k === "version" ? undefined : v));
  const one = v => JSON.stringify(v);
  const fields = (o, skip) => Object.entries(o).filter(([k]) => !skip.includes(k)).map(([k, v]) => `${one(k)}: ${one(v)}`).join(", ");
  const list = (items, pad) => "[\n" + items.map(x => pad + "  " + x).join(",\n") + "\n" + pad + "]";
  const stops = (l, pad) => list(l.map(one), pad);
  const plan = p => `{${fields(p, ["stops"])}, "stops": ${stops(p.stops, "      ")}}`;
  const day = d => `{${fields(d, ["stops", "plans"])},\n    ` +
    (d.plans ? `"plans": ${list(d.plans.map(plan), "    ")}}` : `"stops": ${stops(d.stops, "    ")}}`);
  return `{${fields(t, ["days", "info"])},\n "days": ${list(t.days.map(day), " ")}` +
    (t.info ? `,\n "info": ${list(t.info.map(one), " ")}` : "") + "\n}";
}

// The two documents point at each other and at files of the repository. Here they are
// both in one page, so those pointers are rewritten: an assistant that follows them
// finds nothing (a 404) and stops to ask for a file it already has.
const ELSEWHERE = /\*\*If you are an AI assistant:\*\*[\s\S]*?\n\n/;
function forOnePage(md){
  return md
    .replace(SKIP, "")
    .replace(NEWS, "")
    .replace(ELSEWHERE, "")
    .replace(/\[([^\]]+)\]\((?!https?:)[^)]+\)/g, "$1")
    .replace(/\btrip-format\.md\b/g, "the format reference (further down this page)")
    .replace(/\bcreating-a-trip\.md\b/g, "the guide (earlier in this page)")
    .replace(/`?examples\/demo-trip\.json`?/g, "the complete example (at the end of this page)")
    .replace(/\n{3,}/g, "\n\n");
}

export function llmsText({root = ROOT, site = "https://frafal.github.io/TIMP/", resolver = ""} = {}){
  const version = JSON.parse(read(root, "package.json")).version;
  const reference = read(root, "docs/trip-format.md");
  // The latest three: what an assistant that read an older page needs. All of them are
  // in docs/trip-format.md.
  const news = (NEWS.exec(reference) || ["", ""])[1].trim().split(/\n(?=- )/).slice(0, 4).join("\n");
  const links = resolver ? `
## Google Maps links

If the traveller gives you Google Maps links (\`https://maps.app.goo.gl/…\`) and you can
open web addresses, ask the link resolver of this site, one link at a time:

    GET ${resolver}?url=<the link, URL-encoded>

It answers with JSON: \`title\`, \`address\`, \`lat\`, \`lng\`, \`type\` (each only when
known) and \`link\`. Put them in the stop as they are. It keeps nothing.
` : "";
  return `# TIMP (Travel in my pocket): how to write a trip file

> For AI assistants asked to make or change a trip for TIMP, a web app (${site})
> that shows a day-by-day travel guide on a phone, offline. A trip is ONE JSON file that
> says what the trip is: days, stops, where to sleep, what to remember. Never how it
> looks: the app picks colours, draws maps and chooses icons. The app refuses the whole
> file if one rule is broken, so follow the format below exactly and invent no fields.
> This page is complete: the format, the guide and a full example are all here. Do not
> look for other files.
> The format as a JSON Schema: ${site}trip.schema.json

**Version ${version}.** TIMP is under active development and this page changes with it.
Remember this version. Before you change a trip later in the conversation, or when a
message from the app names a newer TIMP version, open this page again: if its version
is newer, read "What's new" and use it. If you cannot open it, ask the traveller for
the message the app copies (Trips → Have an AI assistant change this trip): it always
carries the current format.

## When TIMP is linked to this chat

If you have TIMP's tools (\`list_trips\`, \`get_trip\`, \`change_trip\`…), the traveller
linked their TIMP account to this chat: use the tools, not files. They read and change
the trips on the account directly, and say how. Without them, a traveller with a TIMP
account can link you: in TIMP, You → Linked chats → Link a chat.

## What's new

${news}

## The format, in short

\`\`\`text
${formatBrief()}
\`\`\`

## Changing a trip that already exists

When the traveller gives you an outline of their trip (lines like
\`[colosseum] 09:00 Colosseum (sight)\`), do not write the whole file again: answer
with the changes only.

\`\`\`text
${changesBrief()}
\`\`\`

## How the traveller loads it

They copy your answer and tap Paste in the app (or save it as a .json file and load
it). If the app refuses it, it lists each problem with its position, like
\`days[0].stops[2].title: is required\`, and a button copies that list to send back to
you. Fix every problem and send your answer again.
${links}
---

${forOnePage(read(root, "docs/creating-a-trip.md"))}

---

# A complete example

\`\`\`json
${compactExample(JSON.parse(read(root, "examples/demo-trip.json")))}
\`\`\`
`;
}
