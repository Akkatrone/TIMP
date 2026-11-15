#!/usr/bin/env node
// Prepares the folder to publish: only the files of the app, with the service
// worker stamped with a version and the exact list of files to keep offline.
//
//   node tools/build.mjs                         -> dist/
//   node tools/build.mjs --out _site --repo https://github.com/you/your-fork
//
// The version is the package version plus a fingerprint of the app's content.
// Same content, same version: phones are asked to update only when something
// in the app really changed.

import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve, relative } from "node:path";
import { ROOT, appFiles, precacheList, stampSw } from "./lib/app-files.mjs";

function option(name, fallback){
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const out = resolve(ROOT, option("out", "dist"));
const repoUrl = option("repo", "");
const inside = relative(ROOT, out);
if(!inside || inside.startsWith("..") || appFiles().some(f => f === inside || f.startsWith(inside + "/"))){
  console.error(`Refusing to build into "${out}": choose an empty folder inside the project, like dist/ or _site/.`);
  process.exit(2);
}
if(repoUrl && !/^https:\/\/[\w.-]+\/[\w./-]+$/.test(repoUrl)){
  console.error(`--repo must be an https address, got "${repoUrl}"`);
  process.exit(2);
}

const files = appFiles();
const contents = new Map(files.map(f => [f, readFileSync(join(ROOT, f))]));

if(repoUrl){
  const src = contents.get("js/config.js").toString("utf8");
  const next = src.replace(/export const REPO_URL = "[^"]*";/, `export const REPO_URL = ${JSON.stringify(repoUrl)};`);
  if(next === src && !src.includes(JSON.stringify(repoUrl))){ console.error("js/config.js: REPO_URL not found"); process.exit(1); }
  contents.set("js/config.js", Buffer.from(next));
}

const hash = createHash("sha256");
files.filter(f => f !== "sw.js").forEach(f => { hash.update(f); hash.update("\0"); hash.update(contents.get(f)); hash.update("\0"); });
// The service worker's own logic counts too: zero out what the build stamps, hash the rest.
hash.update(stampSw(contents.get("sw.js").toString("utf8"), "", []));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const version = option("version", `${pkg.version}+${hash.digest("hex").slice(0, 8)}`);

contents.set("sw.js", Buffer.from(stampSw(contents.get("sw.js").toString("utf8"), version, precacheList())));

rmSync(out, {recursive: true, force: true});
for(const [f, data] of contents){
  const target = join(out, f);
  mkdirSync(dirname(target), {recursive: true});
  writeFileSync(target, data);
}
copyFileSync(join(ROOT, "LICENSE"), join(out, "LICENSE"));

console.log(`Built ${files.length} files into ${relative(ROOT, out)}/ — version ${version}`);
