// The interactive map, shown only when there is a connection.
// Google Maps if a key is available, otherwise OpenStreetMap through MapLibre: a map
// the phone draws from vector tiles (OpenFreeMap), with names the traveller can read.
// Both draw the same things: numbered pins, a straight line along the route, a small card per pin.

import { esc, mapsUrl, dirUrl } from "./util.js";
import { legsOf, bridgesOf, midpoint, pinGone, legGone } from "./geo.js";
import { icon } from "./icons.js";
import { t, getLang } from "./i18n.js";
import { loadGoogle, googleRefusedKey, whenGoogleRefuses } from "./google.js";

const active = new Set();           // live maps currently on screen

/* ---------- MapLibre and OpenFreeMap ---------- */

// The map of OpenStreetMap as vector tiles: free, no key, no cookies (openfreemap.org).
// Always light, in the dark theme too: a dark map is not readable on a phone outdoors
// (design/README.md, R11).
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
// The same map as images, from OpenStreetMap itself, when the vector one cannot be had.
const raster = () => ({version: 8, sources: {osm: {type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: OSM}},
  layers: [{id: "osm", type: "raster", source: "osm"}]});

function hasWebGL(){
  try{ const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }
  catch(e){ return false; }
}

let mapLibre = null;
// MapLibre, loaded once, the first time a map needs it (also the editor's map to pick
// a point). It needs WebGL; without it, the day keeps its sketch map.
export function loadMapLibre(){
  if(!mapLibre){
    mapLibre = (async () => {
      if(!hasWebGL()) throw new Error("webgl");
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "vendor/maplibre/maplibre-gl.css";
      document.head.appendChild(css);
      // Shipped as .js (any static host serves it as JavaScript); its worker is named here.
      const ml = await import(new URL("../vendor/maplibre/maplibre-gl.js", import.meta.url).href);
      ml.setWorkerUrl(new URL("../vendor/maplibre/maplibre-gl-worker.js", import.meta.url).href);
      return ml;
    })().catch(e => { mapLibre = null; throw e; });
  }
  return mapLibre;
}

// Names in the app's language, else in Latin letters, and under them the name as on
// the signs when it is in another script: "Kyoto" over "京都市". Buildings stay flat.
function readable(style, lang){
  const own = ["coalesce", ["get", "name:" + lang], ["get", "name:latin"], ["get", "name"]];
  const both = sep => ["case", ["all", ["has", "name:nonlatin"], ["!=", ["get", "name:nonlatin"], own]], ["concat", own, sep, ["get", "name:nonlatin"]], own];
  return {...style, layers: style.layers.filter(l => l.type !== "fill-extrusion").map(l => {
    const field = l.layout && l.layout["text-field"];
    const text = field ? JSON.stringify(field) : "";
    if(!text.includes("name")) return l;
    return {...l, layout: {...l.layout, "text-field": both(text.includes("\\n") ? "\n" : " ")}};
  })};
}

const styles = new Map();   // language → the style, asked for once
// The vector style, or the images of OpenStreetMap when it does not come.
export function mapStyle(){
  const key = getLang();
  if(!styles.has(key)){
    const ask = new AbortController();
    const late = setTimeout(() => ask.abort(), 8000);
    styles.set(key, fetch(STYLE_URL, {signal: ask.signal})
      .then(r => r.ok ? r.json() : Promise.reject(new Error("style " + r.status)))
      .then(style => readable(style, getLang()))
      .catch(() => { styles.delete(key); return raster(); })
      .finally(() => clearTimeout(late)));
  }
  return styles.get(key).then(style => structuredClone(style));
}

/** A MapLibre map in `canvas`, kept north up, with zoom buttons. */
export async function newMap(canvas, {zoomButtons = true, ...options} = {}){
  const ml = await loadMapLibre();
  const style = await mapStyle();
  const map = new ml.Map({container: canvas, style, attributionControl: {compact: true}, dragRotate: false, pitchWithRotate: false, touchPitch: false, ...options});
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // The day's map has two controls of its own (M5): zoom is with the fingers or the wheel.
  if(zoomButtons) map.addControl(new ml.NavigationControl({showCompass: false}), "top-left");
  // Vector tiles that keep failing before any arrives: the images of OpenStreetMap instead.
  let failed = 0, arrived = !style.sources.openmaptiles;
  map.on("sourcedata", e => { if(e.sourceId === "openmaptiles" && e.tile) arrived = true; });
  map.on("error", e => {
    if(arrived || e.sourceId !== "openmaptiles") return;
    if(++failed === 4) map.setStyle(raster());
  });
  return {ml, map};
}

// A marker MapLibre places by its corner: an empty box at the point, the pin centred on it by CSS.
const at = el => {
  const box = document.createElement("div");
  box.className = "pinwrap";
  box.appendChild(el);
  return box;
};
const lngLat = ll => [ll[1], ll[0]];

// When Google rejects the key, every map on screen switches to OpenStreetMap.
whenGoogleRefuses(() => [...active].forEach(m => m.onGoogleRefused()));

// Google shows the title in the popup's own header (`withTitle` false), MapLibre inside it.
// The app may add to a pin: `local` (the name as on the sign, with its `lang`), `dir`
// (directions from the stop before) and `review` ({site, url}, for a place to eat).
function popupNode(pt, withTitle = true){
  const el = document.createElement("div");
  el.className = "pop";
  const rows = pt.items.map(it => `<span class="when">${it.n}${it.time ? " · " + esc(it.time) : ""}${it.title !== pt.name ? " · " + esc(it.title) : ""}</span>`).join("");
  const local = pt.local ? `<span class="local"${pt.lang ? ` lang="${esc(pt.lang)}"` : ""}>${esc(pt.local)}</span>` : "";
  const review = pt.review ? `<a href="${esc(pt.review.url)}" target="_blank" rel="noopener" aria-label="${esc(t("reviewsOn", {s: pt.review.site}))}">${esc(pt.review.site)}</a>` : "";
  el.innerHTML = `${withTitle ? `<b>${esc(pt.name)}</b>` : ""}${local}${rows}<span class="links"><a href="${esc(mapsUrl(pt.q))}" target="_blank" rel="noopener">${esc(t("mapLink"))}</a><a href="${esc(pt.dir || dirUrl(pt.q))}" target="_blank" rel="noopener">${esc(t("routeLink"))}</a>${review}</span>`;
  return el;
}

// The icon in the middle of a leg travelled by metro, train, plane or boat.
function travelNode(leg, color){
  const el = document.createElement("span");
  el.className = "tvpin";
  el.style.setProperty("--pc", color);
  el.innerHTML = icon(leg.travel, 14);
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", t("travel_" + leg.travel));
  return el;
}

// Everything the two maps draw, whatever draws it: legs inside zones, jumps between
// zones, and the travel icons on both.
function routeOf(zones){
  const legs = zones.flatMap(z => legsOf(z)).map(l => ({...l, bridge: false}));
  const bridges = bridgesOf(zones).map(l => ({...l, bridge: true}));
  return [...legs, ...bridges];
}

// A numbered pin, with the icon of its kind of place when it has one, filled with the
// colour `paint` gives it (js/geo.js, painter).
function pinNode(pt, color, paint){
  const el = document.createElement("span");
  // A station: the stop's number in the colour of its kind, the same sign as in the list
  // (design/README.md, M1). Without colours (no painter), the icon of its kind.
  el.className = "pin" + (paint ? " painted station" : pt.type ? " typed" : "");
  el.style.setProperty("--pc", color);
  if(paint) el.style.setProperty("--pf", paint.pin(pt));
  el.innerHTML = (paint ? "" : icon(pt.type, 13)) + `<span>${esc(pt.nums.join("·"))}</span>`;
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", pt.name);
  if(pt.type) el.dataset.type = pt.type;
  return el;
}

// You, on the map: a dot, where the phone says it is. Asked only when the traveller
// taps "my position"; the position stays on the phone (V4).
// One action on a pin, by finger or keyboard.
function pick(el, fn){
  el.addEventListener("click", fn);
  el.addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); fn(e); } });
}

function meNode(){
  const el = document.createElement("span");
  el.className = "me-dot";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", t("mapYou"));
  return el;
}
const where = () => new Promise((ok, no) => {
  if(!navigator.geolocation) return no(new Error("no-geolocation"));
  navigator.geolocation.getCurrentPosition(p => ok([p.coords.latitude, p.coords.longitude]), no, {enableHighAccuracy: true, timeout: 15000, maximumAge: 60000});
});

async function drawOsm(canvas, zones, color, paint, onPick){
  const {ml, map} = await newMap(canvas, {zoomButtons: !onPick});
  const route = routeOf(zones);
  let gone = () => false, routeOn = true;
  // The legs as lines: a jump between zones (Hakone → Kyoto) is thinner, it is not a
  // walk; legs to stops done or skipped are dashed (a layer of their own).
  const lines = () => ({type: "FeatureCollection", features: route.map(leg => {
    const off = legGone(leg, gone);
    return {type: "Feature", properties: {color: paint ? paint.leg(leg) : color, w: leg.bridge ? 3 : 4, o: off || leg.bridge ? 0.55 : 0.75, gone: off},
      geometry: {type: "LineString", coordinates: [lngLat(leg.from.ll), lngLat(leg.to.ll)]}};
  })});
  const paintOf = {"line-color": ["get", "color"], "line-width": ["get", "w"], "line-opacity": ["get", "o"]};
  // Called again when the style changes (vector tiles that do not come).
  const addRoute = () => {
    if(map.getSource("route")) return;
    map.addSource("route", {type: "geojson", data: lines()});
    const visibility = routeOn ? "visible" : "none";
    map.addLayer({id: "route", type: "line", source: "route", filter: ["!", ["get", "gone"]], layout: {"line-cap": "round", visibility}, paint: paintOf});
    map.addLayer({id: "route-gone", type: "line", source: "route", filter: ["get", "gone"], layout: {"line-cap": "round", visibility}, paint: {...paintOf, "line-dasharray": [0.1, 2.2]}});
  };
  map.on("style.load", addRoute);
  if(map.isStyleLoaded()) addRoute();
  const marks = route.filter(leg => leg.travel).map(leg => {
    const el = travelNode(leg, paint ? paint.leg(leg) : color);
    return {leg, el, m: new ml.Marker({element: at(el)}).setLngLat(lngLat(midpoint(leg.from.ll, leg.to.ll))).addTo(map)};
  });
  // A pin, one action (M3): with onPick, the stop it is; without, its card on the map.
  const pins = zones.flatMap(z => z.pts.map(pt => {
    const el = pinNode(pt, color, paint);
    const m = new ml.Marker({element: at(el)}).setLngLat(lngLat(pt.ll));
    if(onPick) pick(el, () => { select(pt); onPick(pt.items[0].idx); });
    else m.setPopup(new ml.Popup({offset: 14, maxWidth: "250px"}).setDOMContent(popupNode(pt)));
    m.addTo(map);
    return {pt, el, m};
  }));
  const select = pt => pins.forEach(p => p.el.classList.toggle("sel", p.pt === pt));
  let me = null;
  const locate = async () => {
    const ll = await where();
    if(!me) me = new ml.Marker({element: meNode()});
    me.setLngLat(lngLat(ll)).addTo(map);
    map.jumpTo({center: lngLat(ll), zoom: Math.max(map.getZoom(), 15)});
  };
  // What the map draws, said on the page (a canvas has no elements to count): the
  // lines on show and how many are dashed; "ready" once the tiles are drawn.
  const say = () => {
    canvas.dataset.legs = routeOn ? route.length : 0;
    canvas.dataset.dashed = routeOn ? route.filter(leg => legGone(leg, gone)).length : 0;
  };
  map.on("idle", () => { canvas.dataset.ready = "1"; });
  const mark = fn => {
    gone = fn;
    say();
    const src = map.getSource("route");
    if(src) src.setData(lines());
    marks.forEach(k => k.el.classList.toggle("gone", legGone(k.leg, gone)));
    pins.forEach(p => p.el.classList.toggle("gone", pinGone(p.pt, gone)));
  };
  const fit = zi => {
    const pts = (zi == null ? zones : [zones[zi]]).flatMap(z => z.pts);
    if(pts.length === 1){ map.jumpTo({center: lngLat(pts[0].ll), zoom: 15}); return; }
    const b = new ml.LngLatBounds();
    pts.forEach(p => b.extend(lngLat(p.ll)));
    map.fitBounds(b, {padding: 36, maxZoom: 16, animate: false});
  };
  fit(null);
  const showRoute = on => {
    routeOn = on;
    say();
    for(const id of ["route", "route-gone"]) if(map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    marks.forEach(k => on ? k.m.addTo(map) : k.m.remove());
  };
  // The pin of the stop at `idx` in the day's list, in the middle, chosen (or with its card).
  const focus = idx => {
    const p = pins.find(x => x.pt.items.some(it => it.idx === idx));
    if(!p) return;
    map.jumpTo({center: lngLat(p.pt.ll), zoom: Math.max(map.getZoom(), 16)});
    if(onPick) select(p.pt);
    else if(!p.m.getPopup().isOpen()) p.m.togglePopup();
  };
  return {fit, mark, showRoute, focus, locate, refresh: () => map.resize(), destroy: () => map.remove()};
}

async function drawGoogle(canvas, zones, color, key, paint, onPick){
  const gm = await loadGoogle(key);
  const {Map, Polyline, InfoWindow, OverlayView} = await gm.importLibrary("maps");
  const {LatLng, LatLngBounds, ColorScheme} = await gm.importLibrary("core");
  if(googleRefusedKey(key)) throw new Error("google-refused");

  class Pin extends OverlayView {
    constructor(pos, el, pane = "overlayMouseTarget"){ super(); this.pos = pos; this.el = el; this.pane = pane; }
    // Both can be called after the map has been taken down (for example when
    // Google refuses the key a moment after the map was created).
    onAdd(){
      const panes = this.getPanes();
      if(panes) panes[this.pane].appendChild(this.el);
    }
    draw(){
      const proj = this.getProjection();
      const p = proj && proj.fromLatLngToDivPixel(this.pos);
      if(p){ this.el.style.left = p.x + "px"; this.el.style.top = p.y + "px"; }
    }
    onRemove(){ this.el.remove(); }
  }

  const map = new Map(canvas, {
    center: {lat: zones[0].pts[0].ll[0], lng: zones[0].pts[0].ll[1]},
    zoom: 13,
    mapTypeControl: false,
    zoomControl: !onPick,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
    // Always light (R11), whatever the theme of the page.
    ...(ColorScheme ? {colorScheme: ColorScheme.LIGHT} : {})
  });
  const info = new InfoWindow({maxWidth: 260});
  // A tap on the map, outside the card, closes it, as on the OpenStreetMap map.
  map.addListener("click", () => info.close());
  const drawn = [], legs = [], pins = [], marks = [];
  // Google has no dashed lines: a dashed leg is an invisible line that repeats a short stroke.
  const solid = leg => ({strokeOpacity: leg.bridge ? 0.55 : 0.75, strokeWeight: leg.bridge ? 3 : 4, icons: []});
  const dashed = leg => ({strokeOpacity: 0, strokeWeight: leg.bridge ? 3 : 4, icons: [{icon: {path: "M 0,-1 0,1", strokeOpacity: 0.55, strokeWeight: leg.bridge ? 3 : 4, scale: 1.5}, offset: "0", repeat: "13px"}]});
  routeOf(zones).forEach(leg => {
    const line = new Polyline({map, path: [leg.from, leg.to].map(p => ({lat: p.ll[0], lng: p.ll[1]})), strokeColor: paint ? paint.leg(leg) : color, clickable: false, ...solid(leg)});
    drawn.push(line);
    legs.push({...leg, line});
    if(leg.travel){
      const el = travelNode(leg, paint ? paint.leg(leg) : color);
      const [lat, lng] = midpoint(leg.from.ll, leg.to.ll);
      const icon = new Pin(new LatLng(lat, lng), el, "overlayLayer");
      icon.setMap(map);
      drawn.push(icon);
      marks.push({leg, el, icon});
    }
  });
  zones.forEach(z => {
    z.pts.forEach(pt => {
      const pos = new LatLng(pt.ll[0], pt.ll[1]);
      const el = pinNode(pt, color, paint);
      if(onPick) pick(el, e => { e.stopPropagation(); pins.forEach(p => p.el.classList.toggle("sel", p.pt === pt)); onPick(pt.items[0].idx); });
      else el.addEventListener("click", e => {
        e.stopPropagation();
        const head = document.createElement("b");
        head.className = "pop-h";
        head.textContent = pt.name;
        info.setOptions({headerContent: head});
        info.setContent(popupNode(pt, false));
        info.setPosition(pos);
        info.setOptions({pixelOffset: new gm.Size(0, -14)});
        info.open({map});
      });
      const pin = new Pin(pos, el);
      pin.setMap(map);
      drawn.push(pin);
      pins.push({pt, el, pos});
    });
  });
  const fit = zi => {
    const pts = (zi == null ? zones : [zones[zi]]).flatMap(z => z.pts);
    if(pts.length === 1){ map.setCenter({lat: pts[0].ll[0], lng: pts[0].ll[1]}); map.setZoom(15); return; }
    const b = new LatLngBounds();
    pts.forEach(p => b.extend({lat: p.ll[0], lng: p.ll[1]}));
    map.fitBounds(b, 40);
    gm.event.addListenerOnce(map, "idle", () => { if(map.getZoom() > 16) map.setZoom(16); });
  };
  fit(null);
  const mark = gone => {
    legs.forEach(l => l.line.setOptions(legGone(l, gone) ? dashed(l) : solid(l)));
    marks.forEach(m => m.el.classList.toggle("gone", legGone(m.leg, gone)));
    pins.forEach(p => p.el.classList.toggle("gone", pinGone(p.pt, gone)));
  };
  const showRoute = on => {
    legs.forEach(l => l.line.setVisible(on));
    marks.forEach(k => k.icon.setMap(on ? map : null));
  };
  const focus = idx => {
    const p = pins.find(x => x.pt.items.some(it => it.idx === idx));
    if(!p) return;
    map.setCenter(p.pos);
    if(map.getZoom() < 16) map.setZoom(16);
    if(onPick) pins.forEach(x => x.el.classList.toggle("sel", x === p)); else p.el.click();
  };
  let me = null;
  const locate = async () => {
    const [lat, lng] = await where();
    const pos = new LatLng(lat, lng);
    if(me) me.setMap(null);
    me = new Pin(pos, meNode(), "overlayLayer");
    me.setMap(map);
    drawn.push(me);
    map.setCenter(pos);
    if(map.getZoom() < 15) map.setZoom(15);
  };
  return {fit, mark, showRoute, focus, locate, refresh: () => {}, destroy: () => { info.close(); drawn.forEach(d => d.setMap(null)); }};
}

/**
 * Creates the map element. Append `el` to the page right away; drawing starts on its own.
 * @param {{zones: object[], color: string, googleKey: string, route?: boolean, onNotice: (key: string) => void, onPick?: (idx: number) => void}} o
 *   onPick: a tap on a pin chooses that stop (its index in the day's list), instead of
 *   opening a card on the map (M3).
 *   route: false hides the lines between the stops (and the travel icons on them);
 *   setRoute changes it later without drawing the map again.
 *   paint: the colours of pins and lines (painter in js/geo.js); without it, `color`.
 */
export function createLiveMap({zones, color, googleKey, route = true, paint = null, onNotice, onPick = null}){
  const el = document.createElement("div");
  el.className = "live";
  let canvas = null, impl = null, dead = false;
  let gone = () => false;   // which stops are done or skipped; kept so a map that loads late still shows them
  let routeOn = route, pending = null;   // the same for the lines, and a pin to show once drawn

  const message = text => {
    el.innerHTML = `<div class="msg">${esc(text)}</div>`;
    canvas = null;
  };

  async function start(useGoogle){
    if(impl){ try{ impl.destroy(); }catch(e){} impl = null; }
    message(t("mapLoading"));
    const fresh = document.createElement("div");
    fresh.className = "canvas";
    try{
      // The canvas must be on the page (with a size) before a map is drawn into it.
      el.appendChild(fresh);
      const made = useGoogle ? await drawGoogle(fresh, zones, color, googleKey, paint, onPick) : await drawOsm(fresh, zones, color, paint, onPick);
      if(dead){ made.destroy(); return; }
      const msg = el.querySelector(".msg");
      if(msg) msg.remove();
      canvas = fresh;
      impl = made;
      impl.mark(gone);
      impl.showRoute(routeOn);
      if(pending !== null){ impl.focus(pending); pending = null; }
    }catch(e){
      fresh.remove();
      if(dead) return;
      if(useGoogle){
        if(e.message === "google-refused") onNotice("googleKeyBad");
        return start(false);
      }
      message(t("mapFailed"));
    }
  }

  const handle = {
    el,
    fit: zi => { if(impl) impl.fit(zi); },
    refresh: () => { if(impl) impl.refresh(); },
    setMarks: fn => { gone = fn; if(impl) impl.mark(gone); },
    setRoute: on => { if(on !== routeOn){ routeOn = on; if(impl) impl.showRoute(on); } },
    // Shows the pin of the stop at `idx` in the day's list, now or once the map is drawn.
    focus: idx => { if(impl) impl.focus(idx); else pending = idx; },
    // You on the map (M5): asked of the phone now; refused, said.
    locate: () => impl ? impl.locate().catch(() => onNotice("mapNoPosition")) : Promise.resolve(),
    onGoogleRefused: () => { if(!dead){ onNotice("googleKeyBad"); start(false); } },
    destroy: () => {
      dead = true;
      active.delete(handle);
      if(impl){ try{ impl.destroy(); }catch(e){} impl = null; }
      el.remove();
    }
  };
  active.add(handle);
  // Start after the caller has had the chance to put `el` on the page.
  Promise.resolve().then(() => { if(!dead) start(!!googleKey && !googleRefusedKey(googleKey)); });
  return handle;
}
