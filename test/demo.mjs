// The example trip for the tests, as a file and as the app keeps it once loaded.
import { readFileSync } from "node:fs";
import { ensureIds } from "../js/edit.js";

const FILE = JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));
const LOADED = ensureIds(FILE);

/** The example file as it is: its stops with the ids it gives them ("se", "castelo"). */
export const demoFile = () => JSON.parse(JSON.stringify(FILE));

/** The example trip once loaded: every stop with an id of its own (js/ids.js). */
export const demo = () => JSON.parse(JSON.stringify(LOADED.trip));

/** The id a stop of the example has once loaded, by the id the file gives it (and the
 * day and plan, for one the file has twice: "station", in both plans of a day). */
export function ID(old, date, plan){
  const m = LOADED.renamed.find(x => x.from === old && (!date || x.date === date) && (!plan || x.plan === plan));
  if(!m) throw new Error(`the example has no stop "${old}"${date ? " on " + date : ""}${plan ? " in " + plan : ""}`);
  return m.to;
}
