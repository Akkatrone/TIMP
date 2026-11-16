// The interactive map, shown only when there is a connection.
// Google Maps if a key is available, otherwise OpenStreetMap through Leaflet.
// Both draw the same things: numbered pins, a straight line along the route, a small card per pin.

import { esc, mapsUrl, dirUrl } from "./util.js";
import { legsOf, bridgesOf, midpoint, pinGone, legGone } from "./geo.js";
import { travelIcon } from "./icons.js";
import { t } from "./i18n.js";
import { loadGoogle, googleRefusedKey, whenGoogleRefuses } from "./google.js";

let leafletPromise = null;
const active = new Set();           // live maps currently on screen

function loadLeaflet(){
  if(!leafletPromise){
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "vendor/leaflet/leaflet.css";
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = "vendor/leaflet/leaflet.js";
      js.onload = () => resolve(window.L);
      js.onerror = () => reject(new Error("leaflet"));
      document.head.appendChild(js);
    }).catch(e => { leafletPromise = null; throw e; });
  }
  return leafletPromise;
}

// When Google rejects the key, every map on screen switches to OpenStreetMap.
whenGoogleRefuses(() => [...active].forEach(m => m.onGoogleRefused()));

// Google shows the title in the popup's own header (`withTitle` false), Leaflet inside it.
function popupNode(pt, withTitle = true){
  const el = document.createElement("div");
  el.className = "pop";
  const rows = pt.items.map(it => `<span class="when">${it.n}${it.time ? " · " + esc(it.time) : ""}${it.title !== pt.name ? " · " + esc(it.title) : ""}</span>`).join("");
  el.innerHTML = `${withTitle ? `<b>${esc(pt.name)}</b>` : ""}${rows}<span class="links"><a href="${esc(mapsUrl(pt.q))}" target="_blank" rel="noopener">${esc(t("mapLink"))}</a><a href="${esc(dirUrl(pt.q))}" target="_blank" rel="noopener">${esc(t("routeLink"))}</a></span>`;
  return el;
}

// The icon in the middle of a leg travelled by metro, train, plane or boat.
function travelNode(leg, color){
  const el = document.createElement("span");
  el.className = "tvpin";
  el.style.setProperty("--pc", color);
  el.innerHTML = travelIcon(leg.travel, 14);
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

function pinNode(pt, color){
  const el = document.createElement("span");
  if(pt.ref){
    el.className = "pin ref";
    el.textContent = "▲ " + pt.name;
  }else{
    el.className = "pin";
    el.style.setProperty("--pc", color);
    el.textContent = pt.nums.join("·");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", pt.name);
  }
  return el;
}

// In the dark theme the tiles are darkened by CSS (.live.dark), see css/app.css.
async function drawLeaflet(canvas, zones, color){
  const L = await loadLeaflet();
  const map = L.map(canvas, {zoomControl: true});
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(map);
  const legs = [], pins = [], marks = [];
  // A jump between zones (Hakone → Kyoto) is thinner: it is not a walk.
  const style = (leg, isGone) => ({weight: leg.bridge ? 3 : 4, opacity: isGone || leg.bridge ? 0.55 : 0.75, dashArray: isGone ? "5 10" : null});
  routeOf(zones).forEach(leg => {
    legs.push({...leg, line: L.polyline([leg.from.ll, leg.to.ll], {color, interactive: false, ...style(leg, false)}).addTo(map)});
    if(leg.travel){
      const el = travelNode(leg, color);
      L.marker(midpoint(leg.from.ll, leg.to.ll), {icon: L.divIcon({className: "pinwrap", html: el, iconSize: [0, 0]}), interactive: false, keyboard: false, zIndexOffset: -1000}).addTo(map);
      marks.push({leg, el});
    }
  });
  zones.forEach(z => {
    z.pts.forEach(pt => {
      const el = pinNode(pt, color);
      const icon = L.divIcon({className: "pinwrap", html: el, iconSize: [0, 0]});
      const m = L.marker(pt.ll, {icon, keyboard: !pt.ref, interactive: !pt.ref, title: pt.name}).addTo(map);
      if(!pt.ref) m.bindPopup(popupNode(pt), {offset: [0, -10], maxWidth: 250});
      pins.push({pt, el});
    });
  });
  // Legs and pins of stops that are done or skipped turn dashed.
  const mark = gone => {
    legs.forEach(l => l.line.setStyle(style(l, legGone(l, gone))));
    marks.forEach(m => m.el.classList.toggle("gone", legGone(m.leg, gone)));
    pins.forEach(p => p.el.classList.toggle("gone", pinGone(p.pt, gone)));
  };
  const fit = zi => {
    const pts = (zi == null ? zones : [zones[zi]]).flatMap(z => z.pts);
    if(pts.length === 1) map.setView(pts[0].ll, 15);
    else map.fitBounds(L.latLngBounds(pts.map(p => p.ll)), {padding: [36, 36], maxZoom: 16});
  };
  fit(null);
  return {fit, mark, refresh: () => map.invalidateSize(), destroy: () => map.remove()};
}

async function drawGoogle(canvas, zones, color, key, dark){
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
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
    // Can only be chosen when the map is made: a change of theme makes a new map.
    ...(ColorScheme ? {colorScheme: dark ? ColorScheme.DARK : ColorScheme.LIGHT} : {})
  });
  const info = new InfoWindow({maxWidth: 260});
  const drawn = [], legs = [], pins = [], marks = [];
  // Google has no dashed lines: a dashed leg is an invisible line that repeats a short stroke.
  const solid = leg => ({strokeOpacity: leg.bridge ? 0.55 : 0.75, strokeWeight: leg.bridge ? 3 : 4, icons: []});
  const dashed = leg => ({strokeOpacity: 0, strokeWeight: leg.bridge ? 3 : 4, icons: [{icon: {path: "M 0,-1 0,1", strokeOpacity: 0.55, strokeWeight: leg.bridge ? 3 : 4, scale: 1.5}, offset: "0", repeat: "13px"}]});
  routeOf(zones).forEach(leg => {
    const line = new Polyline({map, path: [leg.from, leg.to].map(p => ({lat: p.ll[0], lng: p.ll[1]})), strokeColor: color, clickable: false, ...solid(leg)});
    drawn.push(line);
    legs.push({...leg, line});
    if(leg.travel){
      const el = travelNode(leg, color);
      const [lat, lng] = midpoint(leg.from.ll, leg.to.ll);
      const icon = new Pin(new LatLng(lat, lng), el, "overlayLayer");
      icon.setMap(map);
      drawn.push(icon);
      marks.push({leg, el});
    }
  });
  zones.forEach(z => {
    z.pts.forEach(pt => {
      const pos = new LatLng(pt.ll[0], pt.ll[1]);
      const el = pinNode(pt, color);
      if(!pt.ref) el.addEventListener("click", e => {
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
      pins.push({pt, el});
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
  return {fit, mark, refresh: () => {}, destroy: () => { info.close(); drawn.forEach(d => d.setMap(null)); }};
}

/**
 * Creates the map element. Append `el` to the page right away; drawing starts on its own.
 * @param {{zones: object[], color: string, googleKey: string, dark: boolean, onNotice: (key: string) => void}} o
 */
export function createLiveMap({zones, color, googleKey, dark, onNotice}){
  const el = document.createElement("div");
  el.className = "live" + (dark ? " dark" : "");
  let canvas = null, impl = null, dead = false;
  let gone = () => false;   // which stops are done or skipped; kept so a map that loads late still shows them

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
      const made = useGoogle ? await drawGoogle(fresh, zones, color, googleKey, dark) : await drawLeaflet(fresh, zones, color);
      if(dead){ made.destroy(); return; }
      const msg = el.querySelector(".msg");
      if(msg) msg.remove();
      canvas = fresh;
      impl = made;
      impl.mark(gone);
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
