// Reads what Google Maps gives when a place is shared or copied, without the network.
//
// What each form carries:
//   https://www.google.com/maps/place/Name,+Address/@35.65,139.70,17z/data=…!3d35.658!4d139.702
//       name, address and position
//   https://www.google.com/maps/search/?api=1&query=35.65,139.70   (or ?q=…, ?ll=…)
//       position, or a name
//   geo:35.65,139.70   and plain "35.65, 139.70"
//       position
//   https://maps.app.goo.gl/…   (short link)
//       nothing readable: a browser cannot follow it to the place (Google does not
//       allow it), so the link is kept as it is and opens the exact place in Maps.
//   The text the Maps app shares: "Name\nAddress\nhttps://maps.app.goo.gl/…"
//       name and address from the lines, the link as above
// No DOM here.

const URL_RE = /https?:\/\/[^\s<>"]+/i;
const SHORT_RE = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i;

function coords(lat, lng){
  const a = +lat, b = +lng;
  if(!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return {lat: Math.round(a * 1e5) / 1e5, lng: Math.round(b * 1e5) / 1e5};
}

const LATLNG = /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/;

function decode(part){
  try{ return decodeURIComponent(part.replace(/\+/g, " ")); }catch(e){ return part.replace(/\+/g, " "); }
}

// "Colosseo, Piazza del Colosseo, 1, 00184 Roma RM" → name and address.
function splitPlace(text){
  const parts = text.split(",").map(s => s.trim()).filter(Boolean);
  return {title: parts[0] || "", address: parts.slice(1).join(", ")};
}

function fromUrl(raw){
  let url;
  try{ url = new URL(raw); }catch(e){ return {}; }
  const out = {};
  const path = url.pathname;
  const place = /\/maps\/place\/([^/]+)/.exec(path);
  if(place){
    const p = splitPlace(decode(place[1]));
    if(!LATLNG.test(p.title) || p.address) Object.assign(out, p);
  }
  const search = /\/maps\/search\/([^/]+)/.exec(path);
  if(search && !out.title){
    const text = decode(search[1]);
    const c = LATLNG.exec(text);
    if(c && c[0].length === text.trim().length) Object.assign(out, coords(c[1], c[2]));
    else Object.assign(out, splitPlace(text));
  }
  // The place's own position, more exact than the map's centre.
  const exact = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(raw);
  const centre = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(path);
  const c = (exact && coords(exact[1], exact[2])) || (centre && coords(centre[1], centre[2]));
  if(c) Object.assign(out, c);
  for(const key of ["query", "q", "ll", "destination"]){
    const v = url.searchParams.get(key);
    if(!v) continue;
    const m = LATLNG.exec(v);
    if(m && m[0].length === v.trim().length){ if(out.lat === undefined) Object.assign(out, coords(m[1], m[2])); }
    else if(!out.title) Object.assign(out, splitPlace(v));
  }
  return out;
}

/**
 * @param {string} input  a link, the text the Maps app shares, or coordinates
 * @returns {{title?: string, address?: string, lat?: number, lng?: number, link?: string, short: boolean}}
 *   `link` is set for links worth keeping on the stop (Google Maps links).
 */
export function parseMapsInput(input){
  const text = String(input || "").trim();
  const out = {short: false};
  if(!text) return out;

  const geo = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(text);
  if(geo) return Object.assign(out, coords(geo[1], geo[2]));

  const urlMatch = URL_RE.exec(text);
  if(!urlMatch){
    const c = LATLNG.exec(text);
    if(c && c[0].length === text.length) return Object.assign(out, coords(c[1], c[2]));
    return Object.assign(out, splitPlace(text.split("\n")[0]));
  }

  const link = urlMatch[0].replace(/[).,;]+$/, "");
  const isGoogle = SHORT_RE.test(link) || /^https?:\/\/(www\.)?google\.[a-z.]+\/maps|^https?:\/\/maps\.google\./i.test(link);
  if(isGoogle) out.link = link;
  out.short = SHORT_RE.test(link);
  if(!out.short) Object.assign(out, fromUrl(link));

  // The lines around the link, as the Maps app shares them: name first, then the address.
  const lines = text.replace(urlMatch[0], "").split(/\n+/).map(s => s.trim()).filter(Boolean);
  if(lines.length && !out.title){
    out.title = lines[0];
    if(lines.length > 1 && !out.address) out.address = lines.slice(1).join(", ");
  }
  return out;
}

// The text to search for the stop in Maps: name and address.
export function queryOf({title, address}){
  return [title, address].filter(Boolean).join(", ");
}
