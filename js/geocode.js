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

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

function nominatimUrl(address, lang, near){
  const q = new URLSearchParams({q: address, format: "jsonv2", limit: "1", "accept-language": lang || "en"});
  if(near){
    q.set("viewbox", [near.west, near.north, near.east, near.south].join(","));
    q.set("bounded", "1");
  }
  return NOMINATIM + "?" + q.toString();
}

// The first result of a Nominatim search, or null.
function readNominatim(results){
  const r = Array.isArray(results) ? results[0] : null;
  if(!r) return null;
  const lat = +r.lat, lng = +r.lon;
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {lat: round(lat), lng: round(lng), source: "osm"};
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
  const hit = (results || []).map(r => r.geometry.location).map(l => ({lat: round(l.lat()), lng: round(l.lng()), source: "google"})).find(h => inside(h, near));
  return hit || null;
}

// Nominatim's rules: at most one request a second.
let lastOsm = 0;
async function viaOsm(address, lang, near){
  const wait = lastOsm + 1100 - Date.now();
  if(wait > 0) await new Promise(r => setTimeout(r, wait));
  lastOsm = Date.now();
  const res = await fetch(nominatimUrl(address, lang, near), {headers: {"Accept": "application/json"}});
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
 * @returns {Promise<{lat: number, lng: number, source: "google"|"osm"}|null>}
 *   null when no service found the address, or the device is offline.
 */
export async function geocode(address, {googleKey = "", lang = "en", near = null} = {}){
  const text = String(address || "").trim();
  if(!text || (typeof navigator !== "undefined" && navigator.onLine === false)) return null;
  for(const area of near ? [near, null] : [null]){
    if(googleKey && !googleGeocodingOff){
      try{
        const hit = await viaGoogle(text, googleKey, area);
        if(hit) return hit;
      }catch(e){
        // REQUEST_DENIED: the Geocoding API is not enabled on this key. Stop asking Google.
        if(/DENIED|not authorized|not activated/i.test(String(e && (e.code || e.message)))) googleGeocodingOff = true;
      }
    }
    try{
      const hit = await viaOsm(text, lang, area);
      if(hit) return hit;
    }catch(e){ return null; }
  }
  return null;
}
