import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { esc, rich, stopQuery, dateParts, mapsUrl } from "../js/util.js";
import { zonesOf, routeUrl, zoneSVG, distKm, legsOf, bridgesOf, pinGone } from "../js/geo.js";
import { TRAVEL as TRAVEL_ICONS } from "../js/icons.js";
import { TRAVEL as TRAVEL_FORMAT } from "../js/trip.js";
import { STRINGS } from "../js/i18n.js";
import { ROOT, precacheList, readSw } from "../tools/lib/app-files.mjs";

/* ---------- text from trip files is never trusted ---------- */

test("text from a trip file cannot become HTML", () => {
  assert.equal(esc(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(rich("**bold** <script>x</script>"), "<b>bold</b> &lt;script&gt;x&lt;/script&gt;");
  assert.equal(rich("**<i>x</i>**"), "<b>&lt;i&gt;x&lt;/i&gt;</b>");
});

test("links to Google Maps encode what they are given", () => {
  assert.equal(mapsUrl(`Colosseum "Rome" & more`), "https://www.google.com/maps/search/?api=1&query=Colosseum%20%22Rome%22%20%26%20more");
  assert.equal(stopQuery({title: "A", query: "A, Rome"}), "A, Rome");
  assert.equal(stopQuery({title: "A", lat: 41.9, lng: 12.5}), "41.9,12.5");
  assert.equal(stopQuery({title: "Free afternoon"}), "");
});

test("dates are written in the language of the trip", () => {
  assert.equal(dateParts("2027-05-14", "en").long, "Friday, May 14");
  assert.equal(dateParts("2027-05-14", "it").long, "Venerdì 14 maggio");
  assert.equal(dateParts("2027-05-14", "it").dow, "ven");
});

/* ---------- map zones ---------- */

const stop = (title, lat, lng, extra = {}) => ({time: "10:00", title, lat, lng, ...extra});
const ROME = [stop("Colosseum", 41.8902, 12.4922), stop("Forum", 41.8925, 12.4853), {time: "13:00", title: "Lunch"}, stop("Pantheon", 41.8986, 12.4769)];

test("stops close to each other share one zone, numbered by position in the list", () => {
  const zones = zonesOf({}, null, ROME);
  assert.equal(zones.length, 1);
  assert.deepEqual(zones[0].pts.map(p => p.nums), [[1], [2], [4]]);
  assert.deepEqual(zones[0].path.map(p => p.name), ["Colosseum", "Forum", "Pantheon"]);
});

test("a long jump starts a new zone, named from zoneNames", () => {
  const day = {zoneNames: ["Rome", "Florence"]};
  const zones = zonesOf(day, null, [...ROME, stop("Duomo", 43.7731, 11.256)]);
  assert.deepEqual(zones.map(z => z.name), ["Rome", "Florence"]);
  assert.equal(zonesOf({mapSplitKm: 500}, null, [...ROME, stop("Duomo", 43.7731, 11.256)]).length, 1);
});

test("a place visited twice is one pin with both numbers", () => {
  const zones = zonesOf({}, null, [stop("Hotel", 41.9, 12.5), stop("Forum", 41.8925, 12.4853), stop("Back to the hotel", 41.9, 12.5, {mapLabel: "Hotel"})]);
  assert.deepEqual(zones[0].pts.map(p => p.nums), [[1, 3], [2]]);
  assert.equal(zones[0].path.length, 3);
});

test("a plan's zone names win over the day's", () => {
  const zones = zonesOf({zoneNames: ["Day"]}, {zoneNames: ["Plan"]}, ROME);
  assert.equal(zones[0].name, "Plan");
});

test("mapZones replace the stops, and reference points stay out of the route", () => {
  const day = {mapZones: [{name: "Volcano", points: [{name: "Lake", lat: 10.42, lng: 20.86}, {name: "Summit", lat: 10.36, lng: 20.73, reference: true}]}]};
  const [zone] = zonesOf(day, null, [{time: "08:00", title: "Bus tour"}]);
  assert.deepEqual(zone.pts.map(p => p.nums), [[1], []]);
  assert.deepEqual(zone.path.map(p => p.name), ["Lake"]);
});

test("a day without coordinates has no zones", () => {
  assert.deepEqual(zonesOf({}, null, [{time: "08:00", title: "Train"}]), []);
});

test("the route link walks short distances and drives long ones", () => {
  const [walk] = zonesOf({}, null, ROME);
  assert.match(routeUrl(walk), /origin=Colosseum&destination=Pantheon&waypoints=Forum&travelmode=walking$/);
  const [drive] = zonesOf({mapSplitKm: 500}, null, [...ROME, stop("Duomo", 43.7731, 11.256)]);
  assert.match(routeUrl(drive), /travelmode=driving$/);
});

test("each leg of the route knows the stop it arrives at", () => {
  // Hotel, Forum, Lunch (no pin), Pantheon, back to the hotel
  const list = [stop("Hotel", 41.9, 12.5), stop("Forum", 41.8925, 12.4853), {time: "13:00", title: "Lunch"}, stop("Pantheon", 41.8986, 12.4769), stop("Back", 41.9, 12.5, {mapLabel: "Hotel"})];
  const [zone] = zonesOf({}, null, list);
  assert.deepEqual(zone.pathIdx, [0, 1, 3, 4]);
  assert.deepEqual(legsOf(zone).map(l => [l.from.name, l.to.name, l.idx]), [["Hotel", "Forum", 1], ["Forum", "Pantheon", 3], ["Pantheon", "Hotel", 4]]);
});

test("travel marks the leg that arrives at a stop, or the one a journey without a pin spans", () => {
  const list = [
    stop("Hotel", 41.9, 12.5),
    stop("Colosseum", 41.8902, 12.4922, {travel: "metro"}),
    stop("Forum", 41.8925, 12.4853),
    {time: "14:00", title: "Train to Florence", travel: "train"},
    {time: "16:00", title: "Coffee"},
    stop("Duomo", 43.7731, 11.256),
    stop("Ferry", 43.7712, 11.2531, {travel: "boat"})
  ];
  const zones = zonesOf({}, null, list);
  assert.equal(zones.length, 2);
  assert.deepEqual(legsOf(zones[0]).map(l => [l.to.name, l.travel]), [["Colosseum", "metro"], ["Forum", null]]);
  assert.deepEqual(bridgesOf(zones).map(b => [b.from.name, b.to.name, b.idx, b.travel]), [["Forum", "Duomo", 5, "train"]]);
  assert.deepEqual(legsOf(zones[1]).map(l => [l.to.name, l.travel]), [["Ferry", "boat"]]);
});

test("a skipped stop keeps its pin, and the route goes past it", () => {
  const list = [stop("Colosseum", 41.8902, 12.4922), stop("Forum", 41.8925, 12.4853, {travel: "bus"}), stop("Pantheon", 41.8986, 12.4769)];
  const [zone] = zonesOf({}, null, list, i => i === 1);
  assert.deepEqual(zone.pts.map(p => p.name), ["Colosseum", "Forum", "Pantheon"], "every pin is still there");
  assert.deepEqual(legsOf(zone).map(l => [l.from.name, l.to.name, l.idx, l.travel]), [["Colosseum", "Pantheon", 2, null]], "the bus took you to the Forum, not past it");
  assert.ok(!routeUrl(zone).includes("Forum"));
  // A zone of skipped stops only: its pins, no route into it, a link still made.
  const far = [...list, {time: "14:00", title: "Train", travel: "train"}, stop("Duomo", 43.7731, 11.256), stop("Back in Rome", 41.9, 12.5)];
  const zones = zonesOf({}, null, far, i => i === 4);
  assert.equal(zones.length, 3, "skipping does not move pins between zones");
  assert.deepEqual(zones[1].path, []);
  assert.ok(routeUrl(zones[1]).includes("Duomo"));
  assert.deepEqual(bridgesOf(zones).map(b => [b.from.name, b.to.name]), [["Pantheon", "Back in Rome"]]);
  assert.deepEqual(zonesOf({}, null, list).map(z => legsOf(z).length), [2], "nothing skipped: the route as before");
});

test("the sketch shows how a leg is travelled", () => {
  const [zone] = zonesOf({}, null, [stop("A", 41.9, 12.5), stop("B", 41.91, 12.51, {travel: "metro"})]);
  const svg = zoneSVG(zone, "x");
  assert.equal((svg.match(/class="tv"/g) || []).length, 1);
  assert.ok(zoneSVG(zone, "x", i => i === 1).includes('class="tv gone"'));
});

test("a pin is behind you only when every stop it stands for is done or skipped", () => {
  const list = [stop("Hotel", 41.9, 12.5), stop("Forum", 41.8925, 12.4853), stop("Back", 41.9, 12.5, {mapLabel: "Hotel"})];
  const [zone] = zonesOf({}, null, list);
  const hotel = zone.pts[0];
  assert.equal(pinGone(hotel, i => i === 0), false, "left the hotel, not back yet");
  assert.equal(pinGone(hotel, i => i === 0 || i === 2), true);
  const fromZones = zonesOf({mapZones: [{points: [{name: "A", lat: 1, lng: 1}]}]}, null, [])[0];
  assert.equal(pinGone(fromZones.pts[0], () => true), false, "points drawn from mapZones are not stops");
});

test("the sketch dashes the legs and pins already behind you", () => {
  const [zone] = zonesOf({}, null, ROME);
  const none = zoneSVG(zone, "Rome");
  assert.equal((none.match(/class="route"/g) || []).length, 2);
  assert.ok(!none.includes("gone"));
  const some = zoneSVG(zone, "Rome", i => i <= 1); // Colosseum and Forum done
  assert.equal((some.match(/class="route gone"/g) || []).length, 1, "the leg arriving at the Forum");
  assert.equal((some.match(/class="badge gone"/g) || []).length, 2);
});

test("distances are right to within a few percent", () => {
  const km = distKm([41.8902, 12.4922], [43.7731, 11.256]); // Rome to Florence, about 232 km
  assert.ok(km > 225 && km < 240, String(km));
});

test("the sketch escapes names and draws one badge per pin", () => {
  const [zone] = zonesOf({mapZones: [{points: [{name: "A", lat: 1, lng: 1}, {name: "B", lat: 1.01, lng: 1.01}, {name: `<b>"ref"</b>`, lat: 1.02, lng: 1, reference: true}]}]}, null, []);
  const svg = zoneSVG(zone, `Zone "one"`);
  assert.equal((svg.match(/class="badge"/g) || []).length, 2);
  assert.ok(svg.includes("&lt;b&gt;&quot;ref&quot;&lt;/b&gt;"));
  assert.ok(svg.includes(`aria-label="Zone &quot;one&quot;"`));
  assert.ok(!svg.includes("<b>"));
});

test("every way of travelling has an icon and a name", () => {
  assert.deepEqual(TRAVEL_ICONS, TRAVEL_FORMAT);
  for(const mode of TRAVEL_FORMAT) assert.ok(STRINGS.en["travel_" + mode], mode);
});

/* ---------- interface texts ---------- */

test("every language has exactly the same texts as English", () => {
  const en = Object.keys(STRINGS.en).sort();
  for(const [lang, strings] of Object.entries(STRINGS)){
    assert.deepEqual(Object.keys(strings).sort(), en, `language "${lang}"`);
    for(const [key, value] of Object.entries(strings)){
      const placeholders = s => (s.match(/\{\w+\}/g) || []).sort();
      assert.deepEqual(placeholders(value), placeholders(STRINGS.en[key]), `${lang}.${key}`);
    }
  }
});

/* ---------- offline ---------- */

test("the service worker lists every file of the app", () => {
  const {files} = readSw(readFileSync(join(ROOT, "sw.js"), "utf8"));
  assert.deepEqual([...files].sort(), precacheList().sort());
});

test("the build publishes only the app, stamped with a version", () => {
  const out = mkdtempSync(join(ROOT, ".build-test-"));
  try{
    execFileSync(process.execPath, [join(ROOT, "tools/build.mjs"), "--out", out, "--repo", "https://github.com/someone/fork"], {stdio: "pipe"});
    const {version, files} = readSw(readFileSync(join(out, "sw.js"), "utf8"));
    assert.match(version, /^\d+\.\d+\.\d+\+[0-9a-f]{8}$/);
    for(const f of files.filter(f => f !== "./")) assert.ok(existsSync(join(out, f)), f);
    assert.ok(readFileSync(join(out, "js/config.js"), "utf8").includes(`"https://github.com/someone/fork"`));
    // Icons get an address per version, so browsers do not keep showing an old one.
    const v = version.split("+").pop();
    const html = readFileSync(join(out, "index.html"), "utf8");
    assert.ok(html.includes(`<link rel="icon" href="icons/icon.svg?v=${v}"`), "favicon");
    assert.ok(html.includes(`<link rel="apple-touch-icon" href="icons/apple-touch-icon.png?v=${v}"`), "iPhone icon");
    const manifest = JSON.parse(readFileSync(join(out, "manifest.webmanifest"), "utf8"));
    assert.ok(manifest.icons.length > 0 && manifest.icons.every(i => i.src.endsWith(`?v=${v}`)), "manifest icons");
    for(const i of manifest.icons) assert.ok(existsSync(join(out, i.src.split("?")[0])), i.src);
    for(const f of ["README.md", "package.json", "tools", "test", "private", ".claude", ".github"]) assert.ok(!existsSync(join(out, f)), f);
  }finally{
    rmSync(out, {recursive: true, force: true});
  }
});

/* ---------- documentation ---------- */

test("the format reference mentions every field the validator knows", () => {
  const validator = readFileSync(join(ROOT, "js/trip.js"), "utf8");
  const reference = readFileSync(join(ROOT, "docs/trip-format.md"), "utf8");
  const fields = new Set([...validator.matchAll(/known\([^[\]]*\[([^\]]*)\]/g)].flatMap(m => [...m[1].matchAll(/"(\w+)"/g)].map(f => f[1])));
  assert.ok(fields.size > 30, "field lists not found in js/trip.js");
  const missing = [...fields].filter(f => !new RegExp("\\b" + f + "\\b").test(reference));
  assert.deepEqual(missing, [], "documented in docs/trip-format.md");
});

test("instructions for assistants point to files that exist", () => {
  for(const doc of ["AGENTS.md", "CLAUDE.md", ".claude/skills/create-trip-file/SKILL.md", "docs/creating-a-trip.md"]){
    const text = readFileSync(join(ROOT, doc), "utf8");
    const paths = [...text.matchAll(/`((?:docs|examples|tools|js|test)\/[\w./-]+\.\w+)`/g)].map(m => m[1]);
    for(const p of paths) assert.ok(existsSync(join(ROOT, p)), `${doc} mentions ${p}`);
  }
  assert.match(readFileSync(join(ROOT, "CLAUDE.md"), "utf8"), /^@AGENTS\.md$/m);
});
