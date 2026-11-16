// Groups the stops of a day into map zones and draws the offline sketch.

import { esc, mapsUrl } from "./util.js";

function kmXY(ll, lat0){ return [ll[1] * 111.32 * Math.cos(lat0 * Math.PI / 180), -ll[0] * 110.57]; }
export function distKm(a, b){
  const l = (a[0] + b[0]) / 2, p = kmXY(a, l), q = kmXY(b, l);
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}
const f1 = v => Math.round(v * 10) / 10;

/**
 * A zone is a group of points close enough to share one map.
 * Each point: {nums, name, ll: [lat, lng], q, ref, items: [{n, idx, time, title}]}
 * zone.path lists the points in visiting order (a point can repeat), and
 * zone.pathIdx the position in the day's list of the stop behind each of them
 * (-1 when the map is drawn from mapZones, whose points are not stops).
 */
export function zonesOf(day, plan, list){
  if(day.mapZones){
    return day.mapZones.map(z => {
      let k = 0;
      const pts = z.points.map(p => {
        const n = p.reference ? 0 : ++k;
        return {nums: n ? [n] : [], name: p.name, ll: [p.lat, p.lng], q: p.query || p.name, ref: !!p.reference, items: n ? [{n, idx: -1, time: "", title: p.name}] : []};
      });
      const path = pts.filter(p => !p.ref);
      return {name: z.name || "", pts, path, pathIdx: path.map(() => -1)};
    });
  }
  const split = day.mapSplitKm || 12, zones = [];
  let cur = null, prev = null;
  list.forEach((s, i) => {
    if(s.lat === undefined) return;
    const ll = [s.lat, s.lng];
    if(!cur || distKm(prev, ll) > split){ cur = {pts: [], path: [], pathIdx: []}; zones.push(cur); }
    let pt = cur.pts.find(p => distKm(p.ll, ll) < 0.03);
    if(!pt){ pt = {nums: [], name: s.mapLabel || s.title, ll, q: s.query || s.mapLabel || s.title, ref: false, items: []}; cur.pts.push(pt); }
    pt.nums.push(i + 1);
    pt.items.push({n: i + 1, idx: i, time: s.time, title: s.title});
    cur.path.push(pt);
    cur.pathIdx.push(i);
    prev = ll;
  });
  const names = (plan && plan.zoneNames) || day.zoneNames || [];
  zones.forEach((z, i) => { z.name = names[i] || ""; });
  return zones;
}

// A Google Maps link with the whole zone as a route.
export function routeUrl(z){
  const seq = z.path.filter((p, i, a) => i === 0 || p !== a[i - 1]);
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
// `idx` is the stop the leg arrives at, so a leg can be drawn as already travelled.
export function legsOf(z){
  const legs = [];
  for(let j = 1; j < z.path.length; j++){
    if(z.path[j] !== z.path[j - 1]) legs.push({from: z.path[j - 1], to: z.path[j], idx: z.pathIdx[j]});
  }
  return legs;
}

// A pin is behind you when every stop it stands for is done or skipped.
// Points drawn from mapZones (idx -1) are not stops, so they are never behind you.
export function pinGone(pt, gone){
  return pt.items.length > 0 && pt.items.every(it => it.idx >= 0 && gone(it.idx));
}

// Same rule for a leg of the route.
export const legGone = (leg, gone) => leg.idx >= 0 && gone(leg.idx);

// The offline map: an SVG sketch to scale, with numbered badges pushed apart so they never overlap.
// `gone(idx)` says whether the stop at that position in the list is done or skipped.
export function zoneSVG(z, label, gone = () => false){
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
  legsOf(z).forEach(leg => {
    const a = P[pts.indexOf(leg.from)], b = P[pts.indexOf(leg.to)];
    o += `<path class="route${legGone(leg, gone) ? " gone" : ""}" d="M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}"/>`;
  });
  pts.forEach((p, i) => {
    const c = P[i];
    if(p.ref){ o += `<path class="ref" d="M${f1(c[0])} ${f1(c[1] - 7)}L${f1(c[0] + 7)} ${f1(c[1] + 5)}L${f1(c[0] - 7)} ${f1(c[1] + 5)}Z"/><text class="sbt" x="${f1(c[0] + 11)}" y="${f1(c[1] + 4)}">${esc(p.name)}</text>`; return; }
    if(Math.hypot(B[i][0] - c[0], B[i][1] - c[1]) > 4) o += `<line class="lead" x1="${f1(c[0])}" y1="${f1(c[1])}" x2="${f1(B[i][0])}" y2="${f1(B[i][1])}"/><circle class="pt" cx="${f1(c[0])}" cy="${f1(c[1])}" r="3"/>`;
  });
  pts.forEach((p, i) => {
    if(p.ref) return;
    const lab = p.nums.join("·"), bw = Math.max(20, 9 + lab.length * 6.5), g = pinGone(p, gone) ? " gone" : "";
    o += `<rect class="badge${g}" x="${f1(B[i][0] - bw / 2)}" y="${f1(B[i][1] - 10)}" width="${f1(bw)}" height="20" rx="10"/><text class="bt${g}" x="${f1(B[i][0])}" y="${f1(B[i][1])}" dy="0.35em">${lab}</text>`;
  });
  const nice = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  let sb = nice[0];
  nice.forEach(v => { if(v * k <= 100) sb = v; });
  const x2 = W - 14, x1 = x2 - sb * k, y = H + 12;
  o += `<path class="sb" d="M${f1(x1)} ${y - 4}V${y + 4}M${f1(x1)} ${y}H${x2}M${x2} ${y - 4}V${y + 4}"/><text class="sbt" x="${f1(x1 - 6)}" y="${y + 3.5}" text-anchor="end">${sb < 1 ? sb * 1000 + " m" : sb + " km"}</text><text class="sbt" x="14" y="${y + 3.5}">N ↑</text>`;
  return o + `</svg>`;
}
