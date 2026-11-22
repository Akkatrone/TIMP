// The stops of a day without a position, found all at once: each one searched as the
// stop form searches it (js/geocode.js, findStop), one after the other, then shown to be
// checked before anything is saved: the place found in the service's words, its kind,
// how far it is from the other stops, and Verify, Google Maps on the point found. A
// result far from the day comes unticked: a common name ("Taberna") can be in another
// town. What is ticked is saved by the caller, as one new version.

import { t, getLang } from "./i18n.js";
import { esc, mapsUrl } from "./util.js";

// Farther than this from the other stops of the day: probably another place.
export const FAR_KM = 30;

/** The distance between two points, in km. */
export function km(a, b){
  const rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The middle of some points, or null without any. */
export function middleOf(points){
  const ps = (points || []).filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return ps.length ? {lat: ps.reduce((n, p) => n + p.lat, 0) / ps.length, lng: ps.reduce((n, p) => n + p.lng, 0) / ps.length} : null;
}

/**
 * How far each result is, and which ones are far: from the stops of the day that have a
 * position; without any, from the middle of the other results (two or more).
 * @param results [{id, hit: {lat, lng}|null}]
 * @param around  the day's stops with a position
 * @returns Map id → {km, far}
 */
export function distances(results, around){
  const out = new Map(), found = results.filter(r => r.hit);
  for(const r of found){
    const ref = middleOf(around) || (found.length > 1 ? middleOf(found.filter(x => x !== r).map(x => x.hit)) : null);
    if(!ref) continue;
    const d = km(ref, r.hit);
    out.set(r.id, {km: d, far: d > FAR_KM});
  }
  return out;
}

/**
 * The sheet: searches, shows, and answers with what to do.
 * @param o {stops: [{id, title, address?}], city, near, around: [{lat, lng}], googleKey}
 * @returns Promise<{found: [{id, lat, lng}]} | {open: stopId} | null>  null: Not now
 */
export function openFindPositions(o){
  const lang = getLang();
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.setAttribute("aria-labelledby", "pos-title");
  dlg.innerHTML = `
  <div class="sheet-form">
    <div class="sheet-head">
      <h2 id="pos-title">${esc(t("posFinding", {a: 0, b: o.stops.length}))}</h2>
      <button type="button" class="iconbtn" data-close aria-label="${esc(t("close"))}">×</button>
    </div>
    <p class="foot">${esc(t("posFindHelp"))}</p>
    <div class="founds" data-founds aria-busy="true">${o.stops.map(s => `<div class="found wait" data-row="${esc(s.id)}"><span class="what"><b>${esc(s.title)}</b><small>…</small></span></div>`).join("")}</div>
    <div class="sheet-actions">
      <button type="button" class="btn" data-close>${esc(t("notNow"))}</button>
      <button type="button" class="btn primary" data-save disabled>${esc(t("posSave"))}</button>
    </div>
  </div>`;
  document.body.appendChild(dlg);
  const results = [], touched = new Set();
  let closed = false, answer = null;
  const fmt = d => new Intl.NumberFormat(lang, {maximumFractionDigits: d < 10 ? 1 : 0}).format(d);
  const ticked = () => [...dlg.querySelectorAll("[data-found]:checked")].map(x => x.dataset.found);
  const count = () => {
    const n = ticked().length, b = dlg.querySelector("[data-save]");
    b.textContent = t(!n ? "posSave" : n === 1 ? "posSaveOne" : "posSaveN", {n});
    b.disabled = !n || results.length < o.stops.length;
  };
  // Every row drawn again once a result arrives: the distances depend on all of them.
  const draw = () => {
    // A tick the traveller changed stays; the others follow how far the result is.
    const far = distances(results, o.around), was = new Set(ticked());
    for(const r of results){
      const row = dlg.querySelector(`[data-row="${CSS.escape(r.id)}"]`);
      const s = o.stops.find(x => x.id === r.id);
      if(!r.hit){
        row.className = "found none";
        row.innerHTML = `<span class="what"><b>${esc(s.title)}</b><small>${esc(t("posNoneFound"))}</small></span><button type="button" class="btn small" data-open-stop="${esc(r.id)}">${esc(t("posOpen"))}</button>`;
        continue;
      }
      const f = far.get(r.id), on = touched.has(r.id) ? was.has(r.id) : !(f && f.far);
      const where = [r.hit.type ? t("type_" + r.hit.type) : "", f ? t(f.far ? "posFar" : "posNear", {d: fmt(f.km)}) : ""].filter(Boolean).join(" · ");
      row.className = "found" + (f && f.far ? " far" : "");
      row.innerHTML = `<label><input type="checkbox" data-found="${esc(r.id)}"${on ? " checked" : ""}><span class="what"><b>${esc(s.title)}</b>${r.hit.label ? `<small>${esc(r.hit.label)}</small>` : ""}${where ? `<small class="dist">${esc(where)}</small>` : ""}</span></label>` +
        `<a class="maplink" href="${esc(mapsUrl(r.hit.lat + "," + r.hit.lng))}" target="_blank" rel="noopener">${esc(t("posVerify"))}</a>`;
    }
    count();
  };
  const finish = () => {
    if(closed) return;
    closed = true;
    if(dlg.open) dlg.close();
    dlg.remove();
  };
  return new Promise(resolve => {
    dlg.addEventListener("close", () => { finish(); resolve(answer); });
    dlg.addEventListener("change", e => { if(e.target.matches("[data-found]")){ touched.add(e.target.dataset.found); count(); } });
    dlg.addEventListener("click", e => {
      if(e.target === dlg || e.target.closest("[data-close]")){ finish(); resolve(null); return; }
      const open = e.target.closest("[data-open-stop]");
      if(open){ answer = {open: open.dataset.openStop}; dlg.close(); return; }
      if(e.target.closest("[data-save]")){
        const ids = new Set(ticked());
        answer = {found: results.filter(r => r.hit && ids.has(r.id)).map(r => ({id: r.id, lat: r.hit.lat, lng: r.hit.lng}))};
        dlg.close();
      }
    });
    dlg.showModal();
    (async () => {
      // Loaded here: the search needs a page (Google's script), the rest of this file does not.
      const {findStop} = await import("./geocode.js");
      for(const s of o.stops){
        if(closed) return;
        let hit = null;
        try{ hit = await findStop(s, o.city, {googleKey: o.googleKey, lang, near: o.near}); }catch(e){ hit = null; }
        if(closed) return;
        results.push({id: s.id, hit});
        dlg.querySelector("#pos-title").textContent = results.length < o.stops.length ? t("posFinding", {a: results.length, b: o.stops.length}) : t("posFound");
        draw();
      }
      dlg.querySelector("[data-founds]").removeAttribute("aria-busy");
      count();
    })();
  });
}
