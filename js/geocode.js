// Finds the coordinates of an address: the one thing a link built from an address
// cannot give. Two services, in order:
//   1. Google's Geocoding, through the Maps JavaScript API, when there is a key and the
//      Geocoding API is enabled on it. Precise; counts against the key's free allowance.
//   2. OpenStreetMap's Nominatim otherwise: free, no key. One search per stop, made
//      only when the traveller saves or asks: its rules forbid searching as you type.
// Both look first around the trip (`near`): Google Maps often shares an address without
// its town ("Via Roma, 3"), and there is one in every town.
// The address leaves the device only here, and only for this.

import { loadGoogle } from "./google.js";
import { typeFrom, TYPES } from "./trip.js";
import { RESOLVER_URL } from "./config.js";
import { queryOf } from "./gmaps.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

function nominatimUrl(address, lang, near, limit = 1){
  const q = new URLSearchParams({q: address, format: "jsonv2", limit: String(limit), "accept-language": lang || "en"});
  if(near){
    q.set("viewbox", [near.west, near.north, near.east, near.south].join(","));
    q.set("bounded", "1");
  }
  return NOMINATIM + "?" + q.toString();
}

// The results of a Nominatim search, with their names (the place's own, or the label's first part).
function readNominatim(results){
  return (Array.isArray(results) ? results : []).map(r => {
    const lat = +r.lat, lng = +r.lon;
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const label = r.display_name ? String(r.display_name).slice(0, 200) : "";
    return {lat: round(lat), lng: round(lng), source: "osm", type: typeFrom([r.category, r.type]), name: String(r.name || label.split(",")[0] || "").trim(), ...(label ? {label} : {})};
  }).filter(Boolean);
}

const round = v => Math.round(v * 1e5) / 1e5;

let googleGeocodingOff = false;   // the key works for maps but not for Geocoding

const inside = (hit, b) => !b || (hit.lat >= b.south && hit.lat <= b.north && hit.lng >= b.west && hit.lng <= b.east);

// Google only prefers the area it is given: a result far from the trip counts as none,
// unless nothing is searched around the trip (`near` null).
async function viaGoogle(address, key, near){
  const gm = await loadGoogle(key);
  const {Geocoder} = await gm.importLibrary("geocoding");
  const {results} = await new Geocoder().geocode(near ? {address, bounds: near} : {address});
  return (results || []).map(r => ({lat: round(r.geometry.location.lat()), lng: round(r.geometry.location.lng()), source: "google", type: typeFrom(r.types || []),
    name: String(r.formatted_address || "").split(",")[0].trim(), ...(r.formatted_address ? {label: String(r.formatted_address).slice(0, 200)} : {})})).filter(h => inside(h, near));
}

// Nominatim's rules: at most one request a second.
let lastOsm = 0;
async function viaOsm(address, lang, near, limit){
  const wait = lastOsm + 1100 - Date.now();
  if(wait > 0) await new Promise(r => setTimeout(r, wait));
  lastOsm = Date.now();
  const res = await fetch(nominatimUrl(address, lang, near, limit), {headers: {"Accept": "application/json"}});
  if(!res.ok) throw new Error("osm " + res.status);
  return readNominatim(await res.json());
}

/**
 * The area to search first: the box around the given positions, widened by `km` on
 * every side. Null without positions.
 * @param {{lat: number, lng: number}[]} points
 */
export function areaAround(points, km = 15){
  const ps = (points || []).filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if(!ps.length) return null;
  const lats = ps.map(p => p.lat), lngs = ps.map(p => p.lng);
  const dLat = km / 110.57, mid = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLng = km / (111.32 * Math.max(0.1, Math.cos(mid * Math.PI / 180)));
  const r = v => Math.round(v * 1e4) / 1e4;
  return {south: r(Math.min(...lats) - dLat), north: r(Math.max(...lats) + dLat), west: r(Math.min(...lngs) - dLng), east: r(Math.max(...lngs) + dLng)};
}

/**
 * @param {string} address
 * @param {{googleKey?: string, lang?: string, near?: {south, west, north, east}|null}} o
 *   near: the area of the trip (areaAround); the search tries there first, then anywhere.
 * @returns {Promise<{lat: number, lng: number, source: "google"|"osm", type: string|null, label?: string}|null>}
 *   type: the kind of place (TYPES in js/trip.js) when the service says what it is.
 *   label: the place found, in the service's words ("Sé de Lisboa, Largo da Sé…"), to check it.
 *   null when no service found the address, or the device is offline.
 */
export async function geocode(address, o = {}){
  return (await searchPlaces(address, {...o, limit: 1}))[0] || null;
}

/**
 * Up to `limit` places for what was typed (the stop form's search, ST1): around the trip
 * first, then anywhere when nothing is there. Each as geocode answers, with `name`.
 * Asked once per search, never while typing (OpenStreetMap's rules).
 */
export async function searchPlaces(text, {googleKey = "", lang = "en", near = null, limit = 3} = {}){
  const q = String(text || "").trim();
  if(!q || (typeof navigator !== "undefined" && navigator.onLine === false)) return [];
  for(const area of near ? [near, null] : [null]){
    if(googleKey && !googleGeocodingOff){
      try{
        const hits = await viaGoogle(q, googleKey, area);
        if(hits.length) return hits.slice(0, limit);
      }catch(e){
        // REQUEST_DENIED: the Geocoding API is not enabled on this key. Stop asking Google.
        if(/DENIED|not authorized|not activated/i.test(String(e && (e.code || e.message)))) googleGeocodingOff = true;
      }
    }
    try{
      const hits = await viaOsm(q, lang, area, limit);
      if(hits.length) return hits.slice(0, limit);
    }catch(e){ return []; }
  }
  return [];
}

/**
 * A stop's position, searched the way the stop form searches it: with an address, the
 * address alone first (the more reliable), then name and address; without one, its
 * name and the day's city.
 * @param stop {title, address?}
 * @returns the same as geocode
 */
export async function findStop({title, address}, city, o = {}){
  const text = address ? queryOf({title, address}) : [title, city].filter(Boolean).join(", ");
  return (address && await geocode(address, o)) || await geocode(text, o);
}

// A signal that aborts after `ms`. AbortSignal.timeout is missing before Safari 16.
function timeout(ms){
  if(AbortSignal.timeout) return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/**
 * A Google Maps short link, read by the link resolver (worker/, when this copy of the
 * app has one): {title, address, lat, lng, type}, each only when known. Null without a
 * resolver, offline, or when it does not answer within a few seconds. Only the link
 * is sent.
 */
export async function resolveLink(link){
  if(!RESOLVER_URL || (typeof navigator !== "undefined" && navigator.onLine === false)) return null;
  try{
    const res = await fetch(RESOLVER_URL + "?url=" + encodeURIComponent(link), {signal: timeout(8000), credentials: "omit"});
    if(!res.ok) return null;
    const r = await res.json();
    const text = v => typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined;
    const num = (v, max) => Number.isFinite(v) && Math.abs(v) <= max ? round(v) : undefined;
    const out = {title: text(r.title), address: text(r.address), lat: num(r.lat, 90), lng: num(r.lng, 180), type: TYPES.includes(r.type) ? r.type : undefined};
    if(out.lat === undefined || out.lng === undefined) out.lat = out.lng = undefined;
    return out.title || out.address || out.lat !== undefined ? out : null;
  }catch(e){
    return null;
  }
}
