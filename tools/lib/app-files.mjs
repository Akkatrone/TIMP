// Which files make up the app, as opposed to the repository around it.
// Shared by the build, the precache check and the tests.

import { readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const TOP_FILES = ["index.html", "manifest.webmanifest", "manifest-basic.webmanifest", "sw.js"];
const TOP_DIRS = ["css", "js", "vendor", "icons", "examples"];
const JUNK = /(^|\/)\.DS_Store$/;
// Published with the app, but not needed to run it offline. MapLibre draws only the
// interactive map, which needs a connection anyway: kept out of the install (1.6 MB),
// it is downloaded the first time a map is opened.
const NOT_PRECACHED = /(^|\/)(LICENSE|README\.md)$|^sw\.js$|^vendor\/maplibre\//;

function walk(dir, root){
  return readdirSync(dir).sort().flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p, root) : [relative(root, p).split("\\").join("/")];
  });
}

/** Every file that is published, relative to the root. */
export function appFiles(root = ROOT){
  return [...TOP_FILES, ...TOP_DIRS.flatMap(d => walk(join(root, d), root))].filter(f => !JUNK.test(f));
}

/** The files the service worker must store so the app opens offline. */
export function precacheList(root = ROOT){
  return ["./", ...appFiles(root).filter(f => !NOT_PRECACHED.test(f))];
}

const FILES_BLOCK = /const FILES = \[[\s\S]*?\];/;
const VERSION_LINE = /const VERSION = "[^"]*";/;

export function readSw(source){
  const block = source.match(FILES_BLOCK);
  const version = source.match(/const VERSION = "([^"]*)";/);
  if(!block || !version) throw new Error("sw.js: VERSION or FILES not found");
  return {version: version[1], files: [...block[0].matchAll(/"([^"]+)"/g)].map(m => m[1])};
}

export function stampSw(source, version, files){
  if(!FILES_BLOCK.test(source) || !VERSION_LINE.test(source)) throw new Error("sw.js: VERSION or FILES not found");
  return source
    .replace(VERSION_LINE, `const VERSION = ${JSON.stringify(version)};`)
    .replace(FILES_BLOCK, `const FILES = [\n${files.map(f => `  ${JSON.stringify(f)}`).join(",\n")}\n];`);
}
