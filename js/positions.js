// The stops of a day without a position, found all at once: each one searched as the
// stop form searches it (js/geocode.js, findStop), one after the other, then shown to be
// checked before anything is saved: the place found in the service's words, its kind,
// how far it is from the other stops, and on a tap the point on a small map with the
// day's other stops (design/README.md, SH3). A result far from the day comes unticked: a
// common name ("Taberna") can be in another town. What is ticked is saved by the
// caller, as one new version.

import { t, getLang } from "./i18n.js";
import { esc } from "./util.js";
import { openSheet } from "./sheet.js";

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
 * @returns Promise<{found: [{id, lat, lng}]} | {open: stopId} | null>  null: Not now; found
 *   empty: none to save, decided ("Leave as it is")
 */
export function openFindPositions(o){
  const lang = getLang();
  const dlg = openSheet({id: "pos-title", title: t("posFinding", {a: 0, b: o.stops.length}), body: `
    <p class="foot">${esc(t("posFindHelp"))}</p>
    <div class="founds" data-founds aria-busy="true">${o.stops.map(s => `<div class="found wait" data-row="${esc(s.id)}"><span class="tickph" aria-hidden="true"></span><span class="what"><b>${esc(s.title)}</b><small>${esc(t("posSearching"))}</small><small>&nbsp;</small></span></div>`).join("")}</div>
    <div class="sheet-actions">
      <button type="button" class="btn" data-close>${esc(t("notNow"))}</button>
      <button type="button" class="btn primary" data-save disabled>${esc(t("posSave"))}</button>
    </div>`});
  const results = [], touched = new Set();
  let closed = false, answer = null, mini = null;
  const fmt = d => new Intl.NumberFormat(lang, {maximumFractionDigits: d < 10 ? 1 : 0}).format(d);
  const ticked = () => [...dlg.querySelectorAll("[data-found]:checked")].map(x => x.dataset.found);
  const rowOf = id => dlg.querySelector(`[data-row="${CSS.escape(id)}"]`);
  const count = () => {
    const n = ticked().length, b = dlg.querySelector("[data-save]");
    // Nothing ticked once all are in: "Leave as it is", a decision too (a train has no
    // position on purpose): the line goes below the stops, as after saving.
    const done = results.length === o.stops.length;
    b.textContent = !done ? t("posSave") : t(!n ? "posLeave" : n === 1 ? "posSaveOne" : "posSaveN", {n});
    b.disabled = !done;
  };
  // Every row looked at again once a result arrives (the distances depend on all of
  // them), but changed only when what it shows changes: no flicker, no jump.
  const shown = new Map();
  const put = (row, cls, html) => {
    if(shown.get(row) === cls + html) return;
    shown.set(row, cls + html);
    row.className = cls;
    row.innerHTML = html;
  };
  const draw = () => {
    // A tick the traveller changed stays; the others follow how far the result is.
    const far = distances(results, o.around), was = new Set(ticked());
    for(const r of results){
      const row = rowOf(r.id), s = o.stops.find(x => x.id === r.id);
      if(!r.hit){
        put(row, "found none", `<span class="what"><b>${esc(s.title)}</b><small>${esc(t("posNoneFound"))}</small></span><button type="button" class="btn small" data-open-stop="${esc(r.id)}">${esc(t("posOpen"))}</button>`);
        continue;
      }
      const f = far.get(r.id), on = touched.has(r.id) ? was.has(r.id) : !(f && f.far);
      const where = [r.hit.type ? t("type_" + r.hit.type) : "", f ? t(f.far ? "posFar" : "posNear", {d: fmt(f.km)}) : ""].filter(Boolean).join(" · ");
      // Two actions: the tick takes the point, the row shows it (SH3).
      put(row, "found" + (f && f.far ? " far" : ""), `<input type="checkbox" data-found="${esc(r.id)}" aria-label="${esc(s.title)}"${on ? " checked" : ""}>` +
        `<button type="button" class="what" data-show="${esc(r.id)}" aria-expanded="${!!mini && mini.id === r.id}"><b>${esc(s.title)}</b>${r.hit.label ? `<small>${esc(r.hit.label)}</small>` : ""}${where ? `<small class="dist">${esc(where)}</small>` : ""}</button>`);
    }
    count();
  };
  // The small map under a row: the point found, the day's stops around it. One at a time;
  // a tap on its row again closes it.
  const hide = () => {
    if(!mini) return;
    if(mini.map) mini.map.remove();
    mini.box.remove();
    const b = rowOf(mini.id).querySelector("[data-show]");
    if(b) b.setAttribute("aria-expanded", "false");
    mini = null;
  };
  async function show(id){
    const again = mini && mini.id === id;
    hide();
    if(again) return;
    const hit = results.find(x => x.id === id).hit, row = rowOf(id);
    const m = mini = {id, box: document.createElement("div"), map: null};
    m.box.className = "live mini";
    m.box.innerHTML = `<div class="msg">${esc(t("mapLoading"))}</div>`;
    row.after(m.box);
    row.querySelector("[data-show]").setAttribute("aria-expanded", "true");
    try{
      const {miniMap} = await import("./livemap.js");
      const map = await miniMap(m.box, hit, o.around);
      if(mini !== m){ map.remove(); return; }
      m.map = map;
    }catch(e){
      if(mini === m) m.box.innerHTML = `<div class="msg">${esc(t("mapFailed"))}</div>`;
    }
  }
  return new Promise(resolve => {
    dlg.addEventListener("close", () => { closed = true; hide(); resolve(answer); });
    dlg.addEventListener("change", e => { if(e.target.matches("[data-found]")){ touched.add(e.target.dataset.found); count(); } });
    dlg.addEventListener("click", e => {
      const row = e.target.closest("[data-show]");
      if(row){ show(row.dataset.show); return; }
      const open = e.target.closest("[data-open-stop]");
      if(open){ answer = {open: open.dataset.openStop}; dlg.close(); return; }
      if(e.target.closest("[data-save]")){
        const ids = new Set(ticked());
        answer = {found: results.filter(r => r.hit && ids.has(r.id)).map(r => ({id: r.id, lat: r.hit.lat, lng: r.hit.lng}))};
        dlg.close();
      }
    });
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
