import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { resolve } from "../worker/resolve.js";

// A stand-in for the network: Google redirects, OpenStreetMap answers. Invented places.
const SHORT = "https://maps.app.goo.gl/AbCdEfGh123456789";
const PLACE = "https://www.google.com/maps/place/Via+Roma,+12,+00184+Roma+RM/data=!4m2!3m1!1s0x0:0x0";
function network({viaConsent = false, osm = [{lat: "41.8951", lon: "12.4823", category: "building", type: "yes"}]} = {}){
  const asked = [];
  const get = async (url, opts) => {
    asked.push({url: String(url), opts});
    if(url === SHORT){
      const to = viaConsent ? "https://consent.google.com/m?continue=" + encodeURIComponent(PLACE) : PLACE;
      return new Response(null, {status: 302, headers: {location: to}});
    }
    if(String(url).startsWith("https://nominatim.openstreetmap.org/")) return Response.json(osm);
    throw new Error("unexpected request " + url);
  };
  return {get, asked};
}

test("a short link becomes name, address, position and kind of place", async () => {
  const net = network({osm: [{lat: "41.8902", lon: "12.4922", category: "tourism", type: "museum"}]});
  const out = await resolve(SHORT, net.get);
  assert.deepEqual(out, {link: SHORT, title: "Via Roma, 12", address: "Via Roma, 12, 00184 Roma RM", lat: 41.8902, lng: 12.4922, type: "museum"});
  const osm = new URL(net.asked[1].url);
  assert.equal(osm.searchParams.get("q"), "Via Roma, 12, 00184 Roma RM", "the address, not the name twice");
  assert.match(net.asked[1].opts.headers["user-agent"], /TIMP/, "OpenStreetMap's rules: say who asks");
  assert.equal(net.asked[0].opts.redirect, "manual", "redirects are read, not followed blindly");
});

test("Google's cookie page in Europe is stepped over", async () => {
  const out = await resolve(SHORT, network({viaConsent: true}).get);
  assert.equal(out.title, "Via Roma, 12");
});

test("without OpenStreetMap the answer still has what the link said", async () => {
  const out = await resolve(SHORT, network({osm: []}).get);
  assert.deepEqual(out, {link: SHORT, title: "Via Roma, 12", address: "Via Roma, 12, 00184 Roma RM"});
});

test("a full link with a position is read without following anything", async () => {
  const link = "https://www.google.com/maps/place/Pantheon/@41.8986,12.4769,18z";
  const net = network({osm: [{lat: "1", lon: "1", category: "historic", type: "monument"}]});
  const out = await resolve(link, net.get);
  assert.deepEqual([out.title, out.lat, out.lng, out.type], ["Pantheon", 41.8986, 12.4769, "sight"], "the link's position wins");
  assert.ok(net.asked.every(a => a.url.startsWith("https://nominatim.")));
});

test("only Google Maps links are accepted", async () => {
  for(const bad of ["https://evil.example/maps", "http://maps.app.goo.gl/x", "https://maps.app.goo.gl.evil.example/x", "javascript:alert(1)", ""]){
    await assert.rejects(resolve(bad, () => { throw new Error("no request may be made"); }), e => e.status === 400, bad);
  }
});

test("a short link that leads elsewhere is not followed further", async () => {
  const get = async () => new Response(null, {status: 302, headers: {location: "https://evil.example/"}});
  await assert.rejects(resolve(SHORT, get), e => e.status === 404);
});

test("the web answer is JSON anyone may read, never cached", async () => {
  const res = await worker.fetch(new Request("https://resolver.example/?url=" + encodeURIComponent("https://evil.example/")));
  assert.equal(res.status, 400);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match((await res.json()).error, /Google Maps links/);
  const usage = await (await worker.fetch(new Request("https://resolver.example/"))).json();
  assert.match(usage.usage, /\?url=/);
  assert.equal((await worker.fetch(new Request("https://resolver.example/", {method: "POST"}))).status, 405);
});
