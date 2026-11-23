#!/usr/bin/env node
// Checks that css/tokens.css is the one made from design/tokens.json.
//
//   node tools/tokens.mjs         -> fails if it is not
//   node tools/tokens.mjs --fix   -> writes it

import { readFileSync, writeFileSync } from "node:fs";
import { TOKENS_CSS, tokensCss } from "./lib/tokens.mjs";

const want = tokensCss();
let have = "";
try{ have = readFileSync(TOKENS_CSS, "utf8"); }catch(e){}
if(have === want){ console.log("css/tokens.css: up to date"); process.exit(0); }
if(process.argv.includes("--fix")){
  writeFileSync(TOKENS_CSS, want);
  console.log("css/tokens.css: written from design/tokens.json");
  process.exit(0);
}
console.error("css/tokens.css is not the one made from design/tokens.json: run node tools/tokens.mjs --fix");
process.exit(1);
