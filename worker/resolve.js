// TIMP link resolver: a Google Maps link in, what a stop of a trip file needs out.
//
//   GET /?url=https://maps.app.goo.gl/AbCd…
//   → {"title": "…", "address": "…", "lat": 41.89, "lng": 12.49, "type": "sight", "link": "…"}
//
// Why it exists: a browser may not follow a short link to the place (Google sends no
// CORS header), and the full link Google redirects to has a name and an address but
// often no position. Here, on a server, the link can be followed; OpenStreetMap then
// gives the position and the kind of place.
//
// What it does not do: keep anything. No storage, no logs (see wrangler.toml), no
// cookies, nothing about who asked. It follows links to Google only, and reads only
// where they lead. Runs on Cloudflare Workers; see worker/README.md.
//
// It reuses the app's own code: js/gmaps.js reads Google Maps links, js/trip.js knows
// the kinds of places. No dependencies.

import { parseMapsInput } from "../js/gmaps.js";
import { typeFrom } from "../js/trip.js";

// Links it accepts: short ones to follow, full ones to read.
const SHORT = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\/[\w-]+(\?[\w=&%.-]*)?$/i;
const FULL = /^https:\/\/(www\.)?google\.[a-z.]{2,6}\/maps[/?]|^https:\/\/maps\.google\.[a-z.]{2,6}\//i;
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const AGENT = "TIMP link resolver (https://github.com/Frafal/TIMP)";

/**
 * Follows a Google Maps link to the place. `get` is fetch, or a stand-in in tests.
 * @returns {Promise<{title?, address?, lat?, lng?, type?, link}>}
 * @throws {Error} with .status 400 for a link it does not accept, 404 for one that
 *   does not lead to a place.
 */
export async function resolve(link, get = fetch){
  if(!SHORT.test(link) && !FULL.test(link)) throw fail(400, "Only Google Maps links are accepted.");
  let url = link;
  for(let hops = 0; !FULL.test(url) && hops < 4; hops++){
    const res = await get(url, {redirect: "manual", headers: {"user-agent": "Mozilla/5.0"}});
    const next = res.headers.get("location");
    if(!next) break;
    url = new URL(next, url).href;
    // From Europe Google first sends to its cookie page; the place is in ?continue=.
    const u = new URL(url);
    if(/^consent\.google\./.test(u.hostname) && u.searchParams.get("continue")) url = u.searchParams.get("continue");
  }
  if(!FULL.test(url)) throw fail(404, "The link does not lead to a place on Google Maps.");

  const place = parseMapsInput(url);
  const out = {link};
  for(const k of ["title", "address", "lat", "lng"]) if(place[k] !== undefined && place[k] !== "") out[k] = place[k];
  if(!out.title && !out.address && out.lat === undefined) throw fail(404, "The link does not say which place it is.");

  // Position and kind of place from OpenStreetMap: the address when there is one,
  // otherwise the name near the position the link gave.
  const q = new URLSearchParams({format: "jsonv2", limit: "1"});
  if(out.address) q.set("q", !out.title || out.address.includes(out.title) ? out.address : `${out.title}, ${out.address}`);
  else q.set("q", out.title || `${out.lat},${out.lng}`);
  if(out.lat !== undefined) q.set("viewbox", [out.lng - 0.01, out.lat + 0.01, out.lng + 0.01, out.lat - 0.01].join(","));
  let hit = await nominatim(q, get);
  // The name and the address together may be too much: the address alone, then.
  if(!hit && out.address) hit = await nominatim(new URLSearchParams({...Object.fromEntries(q), q: out.address}), get);
  if(hit){
    if(out.lat === undefined){ out.lat = round(+hit.lat); out.lng = round(+hit.lon); }
    const type = typeFrom([hit.category, hit.type]);
    if(type) out.type = type;
  }
  return out;
}

async function nominatim(params, get){
  try{
    const res = await get(NOMINATIM + "?" + params, {headers: {"user-agent": AGENT, "accept": "application/json"}});
    if(!res.ok) return null;
    const list = await res.json();
    const hit = Array.isArray(list) ? list[0] : null;
    return hit && Number.isFinite(+hit.lat) && Number.isFinite(+hit.lon) ? hit : null;
  }catch(e){
    return null;   // without OpenStreetMap the answer still has what the link said
  }
}

const round = v => Math.round(v * 1e5) / 1e5;
const fail = (status, message) => Object.assign(new Error(message), {status});

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: HEADERS});

export default {
  async fetch(request){
    if(request.method === "OPTIONS") return new Response(null, {headers: {...HEADERS, "access-control-allow-methods": "GET"}});
    if(request.method !== "GET") return reply({error: "Use GET."}, 405);
    const link = new URL(request.url).searchParams.get("url");
    if(!link) return reply({usage: "GET ?url=<a Google Maps link>", about: "https://github.com/Frafal/TIMP/tree/main/worker"});
    try{
      return reply(await resolve(link.trim()));
    }catch(e){
      return reply({error: e.status ? e.message : "Google Maps could not be reached."}, e.status || 502);
    }
  }
};
