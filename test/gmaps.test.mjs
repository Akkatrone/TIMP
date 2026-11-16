import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMapsInput, queryOf } from "../js/gmaps.js";

// Invented links in the shapes Google Maps produces.
const PLACE = "https://www.google.com/maps/place/Colosseo,+Piazza+del+Colosseo,+1,+00184+Roma+RM/@41.8905,12.4910,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d41.8902102!4d12.4922309!16zL20vMGRwMG0";
const SHORT = "https://maps.app.goo.gl/AbCdEfGh123456789?g_st=ac";

test("a full place link gives name, address and the place's own position", () => {
  const r = parseMapsInput(PLACE);
  assert.equal(r.title, "Colosseo");
  assert.equal(r.address, "Piazza del Colosseo, 1, 00184 Roma RM");
  assert.deepEqual([r.lat, r.lng], [41.89021, 12.49223], "from !3d!4d, not the map's centre");
  assert.equal(r.link, PLACE);
  assert.equal(r.short, false);
  assert.equal(queryOf(r), "Colosseo, Piazza del Colosseo, 1, 00184 Roma RM");
});

test("without the place's own position, the map's centre is used", () => {
  const r = parseMapsInput("https://www.google.com/maps/place/Pantheon/@41.8986,12.4769,18z");
  assert.deepEqual([r.title, r.lat, r.lng], ["Pantheon", 41.8986, 12.4769]);
});

test("a short link alone gives nothing but the link, which is kept", () => {
  const r = parseMapsInput(SHORT);
  assert.deepEqual(r, {short: true, link: SHORT});
});

test("the text the Maps app shares gives name and address from its lines", () => {
  const r = parseMapsInput(`Colosseo\nPiazza del Colosseo, 1, 00184 Roma RM\n${SHORT}`);
  assert.equal(r.title, "Colosseo");
  assert.equal(r.address, "Piazza del Colosseo, 1, 00184 Roma RM");
  assert.equal(r.link, SHORT);
  assert.equal(r.lat, undefined);
});

test("an address shared alone is the name and the text to search, even glued to the link", () => {
  for(const text of [`Via Roma, 12\n${SHORT}`, `Via Roma, 12${SHORT}`]){
    const r = parseMapsInput(text);
    assert.equal(r.title, "Via Roma, 12");
    assert.equal(r.address, "Via Roma, 12");
    assert.equal(r.link, SHORT);
  }
  // A name without a number is not taken for an address.
  assert.equal(parseMapsInput(`Pantheon\n${SHORT}`).address, undefined);
});

test("a link to a street address keeps the house number in the name", () => {
  const r = parseMapsInput("https://www.google.com/maps/place/Via+Roma,+12,+00184+Roma+RM/data=!4m2!3m1!1s0x0:0x0");
  assert.equal(r.title, "Via Roma, 12");
  assert.equal(r.address, "Via Roma, 12, 00184 Roma RM");
  assert.equal(r.lat, undefined, "this kind of link has no position");
});

test("search links, query parameters, geo: and plain coordinates", () => {
  assert.deepEqual(pick(parseMapsInput("https://www.google.com/maps/search/?api=1&query=35.6586,139.7454")), [undefined, 35.6586, 139.7454]);
  assert.deepEqual(pick(parseMapsInput("https://maps.google.com/?q=Tokyo+Tower")), ["Tokyo Tower", undefined, undefined]);
  assert.deepEqual(pick(parseMapsInput("https://www.google.com/maps/search/Shibuya+Sky/@35.658,139.702,17z")), ["Shibuya Sky", 35.658, 139.702]);
  assert.deepEqual(pick(parseMapsInput("geo:35.6586,139.7454?q=Tokyo")), [undefined, 35.6586, 139.7454]);
  assert.deepEqual(pick(parseMapsInput(" 35.6586, 139.7454 ")), [undefined, 35.6586, 139.7454]);
});

test("other links and plain text are read without inventing anything", () => {
  const other = parseMapsInput("https://example.com/somewhere");
  assert.equal(other.link, undefined, "only Google Maps links are kept");
  assert.equal(parseMapsInput("Ramen at the station").title, "Ramen at the station");
  assert.deepEqual(parseMapsInput(""), {short: false});
  assert.equal(parseMapsInput("999, 999").lat, undefined);
});

function pick(r){ return [r.title, r.lat, r.lng]; }
