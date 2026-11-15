#!/usr/bin/env node
// Verifies that the FILES list in sw.js matches the files of the app.
// The published site gets its list from tools/build.mjs; this check keeps the
// list in the source right too, so offline works the same while developing.
//   node tools/check-precache.mjs          check
//   node tools/check-precache.mjs --fix    rewrite the list in sw.js

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, precacheList, readSw, stampSw } from "./lib/app-files.mjs";

const swPath = join(ROOT, "sw.js");
const source = readFileSync(swPath, "utf8");
const {version, files: listed} = readSw(source);
const needed = precacheList();

if(process.argv.includes("--fix")){
  writeFileSync(swPath, stampSw(source, version, needed));
  console.log(`sw.js: FILES rewritten (${needed.length} entries)`);
  process.exit(0);
}

const missing = needed.filter(f => !listed.includes(f));
const gone = listed.filter(f => !needed.includes(f));
missing.forEach(f => console.error(`sw.js: "${f}" exists but is not in FILES (it would not work offline)`));
gone.forEach(f => console.error(`sw.js: "${f}" is in FILES but is not a file of the app (installation would fail)`));
if(missing.length || gone.length){
  console.error("Run: node tools/check-precache.mjs --fix");
  process.exit(1);
}
console.log(`sw.js: OK (${listed.length} files)`);
