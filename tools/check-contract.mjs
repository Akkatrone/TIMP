#!/usr/bin/env node
// Keeps contract/v<API>.lock.json: the sharing service's API (js/share-api.js) as
// released. Fails on a change that would break an app or a service built on it.
//   node tools/check-contract.mjs          check
//   node tools/check-contract.mjs --fix    record additions in the lock (never a break)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROOT } from "./lib/app-files.mjs";
import { lockOf, breaks, API, ROUTES } from "../js/share-api.js";

const file = join(ROOT, "contract", `v${API}.lock.json`);
const fix = process.argv.includes("--fix");
const now = lockOf(), text = JSON.stringify(now, null, 1) + "\n";

if(existsSync(file)){
  const broken = breaks(JSON.parse(readFileSync(file, "utf8")), now);
  if(broken.length){
    broken.forEach(b => console.error(`contract: ${b}`));
    console.error(`These break API v${API}. Make them additions, or start the next version next to this one (js/share-api.js).`);
    process.exit(1);
  }
  if(readFileSync(file, "utf8") === text){ console.log(`contract: OK (v${API}, ${Object.keys(ROUTES).length} routes)`); process.exit(0); }
  if(!fix){ console.error(`contract: v${API}.lock.json is behind js/share-api.js (additions only). Run: node tools/check-contract.mjs --fix`); process.exit(1); }
}else if(!fix){
  console.error(`contract: v${API}.lock.json is missing. Run: node tools/check-contract.mjs --fix`);
  process.exit(1);
}
mkdirSync(dirname(file), {recursive: true});
writeFileSync(file, text);
console.log(`contract: v${API}.lock.json written`);
