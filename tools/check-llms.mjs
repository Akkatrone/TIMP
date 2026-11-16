#!/usr/bin/env node
// Verifies that llms.txt at the root of the repository is up to date. It is the page
// for AI assistants (tools/lib/llms.mjs), kept in the repository too because chat
// assistants open github.com pages more readily than a small site. Never edit it by
// hand: change docs/, js/trip.js or the example, then run --fix.
//   node tools/check-llms.mjs          check
//   node tools/check-llms.mjs --fix    write it again

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/app-files.mjs";
import { llmsText } from "./lib/llms.mjs";

const path = join(ROOT, "llms.txt");
const fresh = llmsText();

if(process.argv.includes("--fix")){
  writeFileSync(path, fresh);
  console.log("llms.txt: written");
  process.exit(0);
}
if(!existsSync(path) || readFileSync(path, "utf8") !== fresh){
  console.error("llms.txt: out of date with docs/, js/trip.js or the example. Run: node tools/check-llms.mjs --fix");
  process.exit(1);
}
console.log("llms.txt: OK");
