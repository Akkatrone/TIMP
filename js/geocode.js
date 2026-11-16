// Finds the coordinates of an address: the one thing a link built from an address
// cannot give. Two services, in order:
//   1. Google's Geocoding, through the Maps JavaScript API, when there is a key and the
//      Geocoding API is enabled on it. Precise; counts against the key's free allowance.
//   2. OpenStreetMap's Nominatim otherwise: free, no key. One search per stop, made
//      only when the traveller saves or asks: its rules forbid searching as you type.
// The address leaves the device only here, and only for this.

import { loadGoogle } from "./google.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

function nominatimUrl(address, lang){
  const q = new URLSearchParams({q: address, format: "jsonv2", limit: "1", "accept-language": lang || "en"});
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

async function viaGoogle(address, key){
  const gm = await loadGoogle(key);
  const {Geocoder} = await gm.importLibrary("geocoding");
  const {results} = await new Geocoder().geocode({address});
  const loc = results && results[0] && results[0].geometry.location;
  return loc ? {lat: round(loc.lat()), lng: round(loc.lng()), source: "google"} : null;
}

async function viaOsm(address, lang){
  const res = await fetch(nominatimUrl(address, lang), {headers: {"Accept": "application/json"}});
  if(!res.ok) throw new Error("osm " + res.status);
  return readNominatim(await res.json());
}

/**
 * @param {string} address
 * @param {{googleKey?: string, lang?: string}} o
 * @returns {Promise<{lat: number, lng: number, source: "google"|"osm"}|null>}
 *   null when no service found the address, or the device is offline.
 */
export async function geocode(address, {googleKey = "", lang = "en"} = {}){
  const text = String(address || "").trim();
  if(!text || (typeof navigator !== "undefined" && navigator.onLine === false)) return null;
  if(googleKey && !googleGeocodingOff){
    try{
      const hit = await viaGoogle(text, googleKey);
      if(hit) return hit;
    }catch(e){
      // REQUEST_DENIED: the Geocoding API is not enabled on this key. Stop asking Google.
      if(/DENIED|not authorized|not activated/i.test(String(e && (e.code || e.message)))) googleGeocodingOff = true;
    }
  }
  try{ return await viaOsm(text, lang); }catch(e){ return null; }
}
