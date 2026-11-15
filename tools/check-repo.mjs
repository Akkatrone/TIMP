#!/usr/bin/env node
// Guards the promise the project makes: no real trip and no API key in the repository.
// Looks at every file Git tracks or is about to track.
//   node tools/check-repo.mjs

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ROOT } from "./lib/app-files.mjs";

// Trip files that are allowed to be public: invented ones.
const ALLOWED_TRIPS = /^(examples|test\/fixtures)\//;
const GOOGLE_KEY = /AIza[0-9A-Za-z_-]{35}/;

let tracked;
try{
  tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {cwd: ROOT, encoding: "utf8"}).split("\0").filter(Boolean);
}catch(e){
  console.error("check-repo: this folder is not a Git repository, nothing to check");
  process.exit(0);
}

const problems = [];
for(const file of tracked){
  if(/\.(png|jpg|jpeg|webp|gif|ico|woff2?)$/i.test(file)) continue;
  let text;
  try{ text = readFileSync(join(ROOT, file), "utf8"); }catch(e){ continue; }
  if(GOOGLE_KEY.test(text)) problems.push(`${file}: contains what looks like a Google API key`);
  if(file.endsWith(".json") && !ALLOWED_TRIPS.test(file)){
    try{
      const data = JSON.parse(text);
      if(data && typeof data.format === "string" && data.format.startsWith("travel-in-my-pocket/")){
        problems.push(`${file}: is a trip file outside examples/ — real trips belong in private/, which Git ignores`);
      }
    }catch(e){}
  }
}
problems.forEach(p => console.error(p));
if(problems.length) process.exit(1);
console.log(`repository: OK (${tracked.length} files, no trip files or keys)`);
