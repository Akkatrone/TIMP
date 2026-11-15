// The interactive map, shown only when there is a connection.
// Google Maps if a key is available, otherwise OpenStreetMap through Leaflet.
// Both draw the same things: numbered pins, a straight line along the route, a small card per pin.

import { esc, mapsUrl, dirUrl } from "./util.js";
import { t, getLang } from "./i18n.js";

let leafletPromise = null;
let googlePromise = null;
let googleRefused = false;          // set when Google rejects the key for this site
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

function loadGoogle(key){
  if(googleRefused) return Promise.reject(new Error("google-refused"));
  if(!googlePromise){
    googlePromise = new Promise((resolve, reject) => {
      window.__timpGoogleReady = () => resolve(window.google.maps);
      const js = document.createElement("script");
      js.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) +
        "&v=weekly&loading=async&callback=__timpGoogleReady&language=" + encodeURIComponent(getLang());
      js.async = true;
      js.onerror = () => reject(new Error("google-load"));
      document.head.appendChild(js);
    }).catch(e => { googlePromise = null; throw e; });
  }
  return googlePromise;
}

// Google calls this global when the key is missing, wrong, or not allowed on this site.
window.gm_authFailure = () => {
  googleRefused = true;
  [...active].forEach(m => m.onGoogleRefused());
};

function popupNode(pt){
  const el = document.createElement("div");
  el.className = "pop";
  const rows = pt.items.map(it => `<span class="when">${it.n}${it.time ? " · " + esc(it.time) : ""}${it.title !== pt.name ? " · " + esc(it.title) : ""}</span>`).join("");
  el.innerHTML = `<b>${esc(pt.name)}</b>${rows}<span class="links"><a href="${esc(mapsUrl(pt.q))}" target="_blank" rel="noopener">${esc(t("mapLink"))}</a><a href="${esc(dirUrl(pt.q))}" target="_blank" rel="noopener">${esc(t("routeLink"))}</a></span>`;
  return el;
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

async function drawLeaflet(canvas, zones, color){
  const L = await loadLeaflet();
  const map = L.map(canvas, {zoomControl: true});
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(map);
  zones.forEach(z => {
    if(z.path.length > 1) L.polyline(z.path.map(p => p.ll), {color, weight: 4, opacity: 0.75, interactive: false}).addTo(map);
    z.pts.forEach(pt => {
      const icon = L.divIcon({className: "pinwrap", html: pinNode(pt, color), iconSize: [0, 0]});
      const m = L.marker(pt.ll, {icon, keyboard: !pt.ref, interactive: !pt.ref, title: pt.name}).addTo(map);
      if(!pt.ref) m.bindPopup(popupNode(pt), {offset: [0, -10], maxWidth: 250});
    });
  });
  const fit = zi => {
    const pts = (zi == null ? zones : [zones[zi]]).flatMap(z => z.pts);
    if(pts.length === 1) map.setView(pts[0].ll, 15);
    else map.fitBounds(L.latLngBounds(pts.map(p => p.ll)), {padding: [36, 36], maxZoom: 16});
  };
  fit(null);
  return {fit, refresh: () => map.invalidateSize(), destroy: () => map.remove()};
}

async function drawGoogle(canvas, zones, color, key){
  const gm = await loadGoogle(key);
  const {Map, Polyline, InfoWindow, OverlayView} = await gm.importLibrary("maps");
  const {LatLng, LatLngBounds} = await gm.importLibrary("core");
  if(googleRefused) throw new Error("google-refused");

  class Pin extends OverlayView {
    constructor(pos, el){ super(); this.pos = pos; this.el = el; }
    // Both can be called after the map has been taken down (for example when
    // Google refuses the key a moment after the map was created).
    onAdd(){
      const panes = this.getPanes();
      if(panes) panes.overlayMouseTarget.appendChild(this.el);
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
    clickableIcons: false
  });
  const info = new InfoWindow();
  const drawn = [];
  zones.forEach(z => {
    if(z.path.length > 1) drawn.push(new Polyline({map, path: z.path.map(p => ({lat: p.ll[0], lng: p.ll[1]})), strokeColor: color, strokeOpacity: 0.75, strokeWeight: 4, clickable: false}));
    z.pts.forEach(pt => {
      const pos = new LatLng(pt.ll[0], pt.ll[1]);
      const el = pinNode(pt, color);
      if(!pt.ref) el.addEventListener("click", e => {
        e.stopPropagation();
        info.setContent(popupNode(pt));
        info.setPosition(pos);
        info.setOptions({pixelOffset: new gm.Size(0, -14)});
        info.open({map});
      });
      const pin = new Pin(pos, el);
      pin.setMap(map);
      drawn.push(pin);
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
  return {fit, refresh: () => {}, destroy: () => { info.close(); drawn.forEach(d => d.setMap(null)); }};
}

/**
 * Creates the map element. Append `el` to the page right away; drawing starts on its own.
 * @param {{zones: object[], color: string, googleKey: string, onNotice: (key: string) => void}} o
 */
export function createLiveMap({zones, color, googleKey, onNotice}){
  const el = document.createElement("div");
  el.className = "live";
  let canvas = null, impl = null, dead = false;

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
      const made = useGoogle ? await drawGoogle(fresh, zones, color, googleKey) : await drawLeaflet(fresh, zones, color);
      if(dead){ made.destroy(); return; }
      const msg = el.querySelector(".msg");
      if(msg) msg.remove();
      canvas = fresh;
      impl = made;
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
  Promise.resolve().then(() => { if(!dead) start(!!googleKey && !googleRefused); });
  return handle;
}
