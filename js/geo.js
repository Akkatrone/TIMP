// Groups the stops of a day into map zones and draws the offline sketch.
// Everything here is worked out from the stops: the file says nothing about the map.

import { esc, mapsUrl } from "./util.js";
import { glyph } from "./icons.js";
import { TRAVEL, TYPES, placeQuery } from "./trip.js";

// Stops further apart than this are drawn on separate maps (a city, then the next one).
const SPLIT_KM = 12;

// Colours on the maps. The kind of place gives a pin its hue, the city of the day gives
// the lines theirs; the part of the day gives the shade: lighter in the morning, full in
// the afternoon, darker after sunset (js/sun.js). Stops of no kind take the city's hue.
export const TYPE_COLORS = {sight: "#c98a00", museum: "#7a55c7", food: "#d24f2b", park: "#3a8a3a",
  view: "#178aae", shop: "#c23f7e", walk: "#8a6a3a", hotel: "#4a5fb0"};

export function shade(hex, part){
  if(!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const k = part === "morning" ? 0.3 : part === "night" ? -0.45 : 0;
  return "#" + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
    .map(v => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)).toString(16).padStart(2, "0")).join("");
}

/**
 * The colours of a day's maps. `color` is the city's (#rrggbb), `parts[i]` the part of
 * the day of the i-th stop ("morning", "afternoon", "night").
 */
export function painter(color, parts){
  const stop = (type, idx) => shade(TYPE_COLORS[type] || color, parts[idx]);
  return {
    stop,                                         // a stop of the list: its kind, its index
    pin: pt => stop(pt.type, pt.items[0].idx),    // a pin: its first stop
    leg: leg => shade(color, parts[leg.idx])      // a line: the stop it arrives at
  };
}

function kmXY(ll, lat0){ return [ll[1] * 111.32 * Math.cos(lat0 * Math.PI / 180), -ll[0] * 110.57]; }
export function distKm(a, b){
  const l = (a[0] + b[0]) / 2, p = kmXY(a, l), q = kmXY(b, l);
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}
const f1 = v => Math.round(v * 10) / 10;

/**
 * A zone is a group of points close enough to share one map.
 * Each point: {nums, name, ll: [lat, lng], q, type, items: [{n, idx, time, title}]}
 *   (stops less than 30 m apart share a point; its name and type are the first one's)
 * zone.path lists the points in visiting order (a point can repeat), and
 * zone.pathIdx the position in the day's list of the stop behind each of them, and
 * zone.pathTravel how each of them is reached: one of TRAVEL, or null.
 *
 * `travel` on a stop says how you reach it, like its description does: the leg that
 * arrives at it is travelled that way. A stop without a pin that is the journey itself
 * ("Train to Kyoto") marks the leg from the previous pin to the next one.
 * zone.enter, when set, is the jump from the previous zone: {from, idx, travel}.
 *
 * `skipped(idx)` says which stops the traveller skips: they keep their pin, but the
 * route goes from the stop before them straight to the one after.
 */
export function zonesOf(list, skipped = () => false){
  const zones = [];
  // Zones group every pin, skipped or not, so they do not change when a stop is skipped.
  // The route (path) only takes the stops that are still on.
  let cur = null, prev = null, last = null, lastZone = null, travel = null;
  const known = (v, values) => values.includes(v) ? v : null;
  list.forEach((s, i) => {
    const off = skipped(i);
    if(s.lat === undefined){
      if(known(s.travel, TRAVEL) && !off) travel = s.travel;
      return;
    }
    const ll = [s.lat, s.lng];
    if(!cur || distKm(prev, ll) > SPLIT_KM){
      cur = {pts: [], path: [], pathIdx: [], pathTravel: [], enter: null};
      zones.push(cur);
    }
    prev = ll;
    let pt = cur.pts.find(p => distKm(p.ll, ll) < 0.03);
    if(!pt){ pt = {nums: [], name: s.title, ll, q: placeQuery(s), type: known(s.type, TYPES), items: []}; cur.pts.push(pt); }
    pt.nums.push(i + 1);
    pt.items.push({n: i + 1, idx: i, time: s.time, title: s.title});
    if(off) return;
    const arriving = known(s.travel, TRAVEL) || travel;
    travel = null;
    if(last && lastZone !== cur && !cur.path.length) cur.enter = {from: last, idx: i, travel: arriving};
    cur.path.push(pt);
    cur.pathIdx.push(i);
    cur.pathTravel.push(cur.path.length > 1 ? arriving : null);
    last = pt;
    lastZone = cur;
  });
  return zones;
}

// A Google Maps link with the whole zone as a route.
export function routeUrl(z){
  const seq = z.path.filter((p, i, a) => i === 0 || p !== a[i - 1]);
  if(!seq.length) return mapsUrl(z.pts[0].q);   // every stop of the zone skipped
  if(seq.length < 2) return mapsUrl(seq[0].q);
  let mid = seq.slice(1, -1);
  if(mid.length > 8){ const step = mid.length / 8; mid = Array.from({length: 8}, (_, i) => mid[Math.floor(i * step)]); }
  let far = 0;
  z.pts.forEach(a => z.pts.forEach(b => { far = Math.max(far, distKm(a.ll, b.ll)); }));
  let u = "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(seq[0].q) + "&destination=" + encodeURIComponent(seq[seq.length - 1].q);
  if(mid.length) u += "&waypoints=" + encodeURIComponent(mid.map(p => p.q).join("|"));
  return u + "&travelmode=" + (far > 6 ? "driving" : "walking");
}

// The legs of a zone's route: from each point of the path to the next one.
// `idx` is the stop the leg arrives at, so a leg can be drawn as already travelled;
// `travel` is how it is travelled, or null.
export function legsOf(z){
  const legs = [];
  for(let j = 1; j < z.path.length; j++){
    if(z.path[j] !== z.path[j - 1]) legs.push({from: z.path[j - 1], to: z.path[j], idx: z.pathIdx[j], travel: z.pathTravel[j] || null});
  }
  return legs;
}

// The jumps between consecutive zones of a day, shaped like legs.
export function bridgesOf(zones){
  return zones.filter(z => z.enter).map(z => ({from: z.enter.from, to: z.path[0], idx: z.enter.idx, travel: z.enter.travel}));
}

export const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// A pin is behind you when every stop it stands for is done or skipped.
export const pinGone = (pt, gone) => pt.items.every(it => gone(it.idx));

// Same rule for a leg of the route.
export const legGone = (leg, gone) => gone(leg.idx);

// The offline map: an SVG sketch to scale, with numbered badges pushed apart so they never overlap.
// `gone(idx)` says whether the stop at that position in the list is done or skipped;
// `route` false leaves out the lines between the stops and the travel icons on them;
// `paint` (painter) colours pins and lines, otherwise they take the day's colour.
export function zoneSVG(z, label, gone = () => false, route = true, paint = null){
  const pts = z.pts, lat0 = pts.reduce((a, p) => a + p.ll[0], 0) / pts.length;
  const xy = pts.map(p => kmXY(p.ll, lat0));
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
  const W = 340, PAD = 30, FOOT = 26;
  const k = Math.min((W - 2 * PAD) / Math.max(w, 0.3), 200 / Math.max(h, 0.3));
  const H = Math.max(120, Math.round(h * k + 2 * PAD));
  const ox = (W - w * k) / 2, oy = (H - h * k) / 2;
  const P = xy.map(p => [ox + (p[0] - minX) * k, oy + (p[1] - minY) * k]);
  const B = P.map(p => [p[0], p[1]]);
  for(let it = 0; it < 80; it++){
    for(let i = 0; i < B.length; i++) for(let j = i + 1; j < B.length; j++){
      let dx = B[j][0] - B[i][0], dy = B[j][1] - B[i][1], dd = Math.hypot(dx, dy);
      if(dd < 25){
        if(dd < 0.5){ const a = i * 2.4 + j; dx = Math.cos(a); dy = Math.sin(a); dd = 1; }
        const m = (25 - dd) / 2 + 0.5;
        B[i][0] -= dx / dd * m; B[i][1] -= dy / dd * m; B[j][0] += dx / dd * m; B[j][1] += dy / dd * m;
      }
    }
    B.forEach(b => { b[0] = Math.min(W - 16, Math.max(16, b[0])); b[1] = Math.min(H - 13, Math.max(13, b[1])); });
  }
  let o = `<svg class="mapsvg" viewBox="0 0 ${W} ${H + FOOT}" role="img" aria-label="${esc(label)}">`;
  const legs = route ? legsOf(z) : [];
  legs.forEach(leg => {
    const a = P[pts.indexOf(leg.from)], b = P[pts.indexOf(leg.to)];
    o += `<path class="route${legGone(leg, gone) ? " gone" : ""}"${paint ? ` style="stroke:${paint.leg(leg)}"` : ""} d="M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}"/>`;
  });
  // How a leg is travelled: an icon in the middle of it, under the numbered badges.
  legs.filter(leg => leg.travel).forEach(leg => {
    const a = P[pts.indexOf(leg.from)], b = P[pts.indexOf(leg.to)];
    const [x, y] = midpoint(a, b), g = legGone(leg, gone) ? " gone" : "";
    o += `<g class="tv${g}"${paint ? ` style="color:${paint.leg(leg)}"` : ""}><circle class="tvbg"${paint ? ` style="stroke:${paint.leg(leg)}"` : ""} cx="${f1(x)}" cy="${f1(y)}" r="9"/>${glyph(leg.travel, x, y, 12)}</g>`;
  });
  pts.forEach((p, i) => {
    const c = P[i];
    if(Math.hypot(B[i][0] - c[0], B[i][1] - c[1]) > 4) o += `<line class="lead" x1="${f1(c[0])}" y1="${f1(c[1])}" x2="${f1(B[i][0])}" y2="${f1(B[i][1])}"/><circle class="pt" cx="${f1(c[0])}" cy="${f1(c[1])}" r="3"/>`;
  });
  pts.forEach((p, i) => {
    const lab = p.nums.join("·"), bw = Math.max(20, 9 + lab.length * 6.5), g = pinGone(p, gone) ? " gone" : "";
    const fill = paint ? ` style="fill:${paint.pin(p)}"` : "", painted = paint ? " painted" : "";
    o += `<rect class="badge${painted}${g}"${fill} x="${f1(B[i][0] - bw / 2)}" y="${f1(B[i][1] - 10)}" width="${f1(bw)}" height="20" rx="10"/><text class="bt${painted}${g}" x="${f1(B[i][0])}" y="${f1(B[i][1])}" dy="0.35em">${lab}</text>`;
  });
  const nice = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  let sb = nice[0];
  nice.forEach(v => { if(v * k <= 100) sb = v; });
  const x2 = W - 14, x1 = x2 - sb * k, y = H + 12;
  o += `<path class="sb" d="M${f1(x1)} ${y - 4}V${y + 4}M${f1(x1)} ${y}H${x2}M${x2} ${y - 4}V${y + 4}"/><text class="sbt" x="${f1(x1 - 6)}" y="${y + 3.5}" text-anchor="end">${sb < 1 ? sb * 1000 + " m" : sb + " km"}</text><text class="sbt" x="14" y="${y + 3.5}">N ↑</text>`;
  return o + `</svg>`;
}
