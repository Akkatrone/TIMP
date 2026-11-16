import { validateTrip } from "./trip.js";
import * as store from "./store.js";
import { t, setLang, deviceLang, getLang, LANGS } from "./i18n.js";
import { esc, rich, mapsUrl, dirUrl, stopQuery, dateParts, todayIn } from "./util.js";
import { zonesOf, routeUrl, zoneSVG } from "./geo.js";
import { travelIcon } from "./icons.js";
import { createLiveMap, googleNeedsReload, googleRefusedKey } from "./livemap.js";
import { REPO_URL } from "./config.js";
import { openStopEditor } from "./editor.js";
import { addStop, updateStop, removeStop } from "./edit.js";
import { prepare, saveEdit, receive, moveMarks, fileName, fileText } from "./trips.js";
import { shortId } from "./version.js";

const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const UNFOLD = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 6L8 2.5 11.5 6M4.5 10L8 13.5 11.5 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const FOLD = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 2.5L8 6l3.5-3.5M4.5 13.5L8 10l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const S = {
  records: [],            // [{id, trip, importedAt, fileName}]
  rec: null,              // the open one
  state: {done: {}, skipped: {}, plans: {}},
  ui: {mapOpen: false, mapView: "live", expandAll: false},
  langPref: "auto",       // "auto" follows the trip, or a language chosen on this device
  theme: document.documentElement.dataset.theme || "auto",   // set early by js/theme.js
  openStops: new Map(),   // descriptions opened or closed one by one, until the page is closed
  deviceKey: "",
  useGoogle: true,        // false: always OpenStreetMap, even with a key (saves Google map loads)
  importError: null,      // {title, items}
  online: navigator.onLine !== false,
  version: ""
};

const $app = document.getElementById("app");
const $strip = document.querySelector(".strip");
const $days = document.getElementById("days");
const $file = document.getElementById("file");
const $toast = document.getElementById("toast");

let live = null;          // {key, handle} — the interactive map survives re-renders
let toastTimer = 0;

/* ---------- small helpers ---------- */

let pendingOffer = null;  // a toast with a button waits behind short messages instead of being lost

function toast(text, action){
  clearTimeout(toastTimer);
  $toast.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  $toast.hidden = false;
  if(action){
    pendingOffer = {text, action};
    $toast.querySelector("button").onclick = () => { pendingOffer = null; $toast.hidden = true; action.run(); };
  }else{
    toastTimer = setTimeout(() => {
      $toast.hidden = true;
      if(pendingOffer) toast(pendingOffer.text, pendingOffer.action);
    }, 4000);
  }
}

const trip = () => S.rec && S.rec.trip;
const placeIndex = key => Object.keys(trip().places).indexOf(key);
const placeVar = key => `var(--p${placeIndex(key)})`;
// The key the interactive map uses: none if Google is turned off on this device;
// otherwise the key saved on this device, which wins over the one in the trip file.
const tripKey = () => (trip() && trip().map && trip().map.googleMapsKey) || "";
const googleKey = () => S.useGoogle ? (S.deviceKey || tripKey()) : "";

// After the key, the language or the trip changes: if Google's script is already in
// the page with other settings, only a fresh page can apply the new ones.
function applyMapSettings(){
  if(googleNeedsReload(googleKey())){ location.reload(); return true; }
  return false;
}
const saveState = () => { if(S.rec) store.setKV("state:" + S.rec.id, S.state).catch(() => {}); };
const saveUi = () => { store.setKV("ui", S.ui).catch(() => {}); };

function applyPlaceColors(){
  let el = document.getElementById("place-colors");
  if(!el){ el = document.createElement("style"); el.id = "place-colors"; document.head.appendChild(el); }
  if(!trip()){ el.textContent = ""; return; }
  const ps = Object.values(trip().places);
  const dark = ps.map((p, i) => `--p${i}:${p.colorDark || p.color}`).join(";");
  el.textContent = `:root{${ps.map((p, i) => `--p${i}:${p.color}`).join(";")}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}` +
    `:root[data-theme="dark"]{${dark}}`;
}

function todayIndex(){
  if(!trip()) return -1;
  const today = todayIn(trip().timezone);
  return trip().days.findIndex(d => d.date === today);
}

function route(){
  const h = location.hash.slice(1);
  if(!trip()) return {name: "welcome"};
  if(h === "trips") return {name: "trips"};
  if(h === "info") return {name: "info"};
  const m = h.match(/^day-(\d{1,3})$/);
  if(m && +m[1] >= 1 && +m[1] <= trip().days.length) return {name: "day", i: +m[1] - 1};
  const ti = todayIndex();
  return {name: "day", i: ti >= 0 ? ti : 0};
}

/* ---------- theme ---------- */

const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const isDark = () => S.theme === "dark" || (S.theme === "auto" && !!darkQuery && darkQuery.matches);

// "auto" follows the phone; "light" and "dark" are a choice made on this device.
// The choice is kept in localStorage so js/theme.js can apply it before the page is drawn.
function setTheme(value){
  S.theme = value;
  try{ value === "auto" ? localStorage.removeItem("timp-theme") : localStorage.setItem("timp-theme", value); }catch(e){}
  if(value === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
  syncThemeColor();
}

// The colour of the phone's status bar follows the theme in use.
function syncThemeColor(){
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    if(!m.dataset.auto) m.dataset.auto = m.getAttribute("content");
    m.setAttribute("content", S.theme === "auto" ? m.dataset.auto : (S.theme === "dark" ? "#101316" : "#f2f3f1"));
  });
}

// The interface follows the trip's language, unless one was chosen on this device.
function applyLang(){
  setLang(S.langPref !== "auto" ? S.langPref : ((trip() && trip().lang) || deviceLang()));
}

/* ---------- loading and switching trips ---------- */

async function openRecord(rec){
  S.rec = rec || null;
  S.state = {done: {}, skipped: {}, plans: {}};
  if(rec){
    const saved = await store.getKV("state:" + rec.id);
    if(saved && typeof saved === "object") S.state = {done: saved.done || {}, skipped: saved.skipped || {}, plans: saved.plans || {}};
    await store.setKV("active", rec.id);
  }else{
    await store.delKV("active");
  }
  S.openStops.clear();
  applyLang();
  document.title = rec ? rec.trip.title : "TIMP";
  applyPlaceColors();
}

// Saves a trip record and makes it the open one. `exported` is the version the
// traveller already has as a file: anything newer is offered for saving.
async function keepRecord(rec){
  await store.putTrip(rec);
  S.records = S.records.filter(r => r.id !== rec.id).concat(rec);
  if(S.rec && S.rec.id === rec.id){ S.rec = rec; applyPlaceColors(); document.title = rec.trip.title; }
  else await openRecord(rec);
}

const needsSaving = rec => !!rec && rec.exported !== rec.trip.version.id;

async function importText(text, name){
  let data;
  try{ data = JSON.parse(text); }
  catch(e){ S.importError = {title: t("importFailed"), items: [t("notJson")]}; render(); return; }
  const res = validateTrip(data);
  if(!res.ok){ S.importError = {title: t("importFailed"), items: res.errors.slice(0, 12)}; render(); window.scrollTo(0, 0); return; }
  S.importError = null;
  try{
    const {trip: incoming} = await prepare(data);
    const local = S.records.find(r => r.id === incoming.id);
    let rec, message, offer = false;
    if(!local){
      await store.putVersion(incoming);
      rec = {id: incoming.id, trip: incoming, importedAt: Date.now(), fileName: name || "", exported: incoming.version.id};
      message = t("imported", {t: incoming.title});
    }else{
      const got = await receive(store, local.trip, incoming);
      const v = shortId(got.trip.version.id);
      rec = {...local, trip: got.trip, importedAt: Date.now(), fileName: name || local.fileName};
      if(got.kind === "same") message = t("recvSame", {v});
      else if(got.kind === "older") message = t("recvOlder", {v});
      else if(got.kind === "newer"){ rec.exported = got.trip.version.id; message = t("recvNewer", {t: got.trip.title, v}); }
      else { message = t("recvMerged", {a: got.report.added, c: got.report.changed, r: got.report.removed, v}); offer = true; }
    }
    await keepRecord(rec);
    store.askPersistence();
    if(location.hash) history.replaceState(null, "", location.pathname + location.search);
    render();
    window.scrollTo(0, 0);
    if(offer) offerSave(rec, message); else toast(message);
  }catch(e){
    S.importError = {title: t("importFailed"), items: [String(e && e.message || e)]};
    render();
  }
}

/* ---------- editing stops ---------- */

// Applies an edit to the open trip: a new version, kept on the phone, then offered
// as a file. `change(trip)` returns {trip, marks?}: marks move ticks with a stop.
async function applyEdit(change, message){
  const cur = S.rec.trip;
  const out = change(cur);
  const {trip: next, changed} = await saveEdit(store, cur, out.trip);
  if(!changed) return;
  if(out.marks){ S.state = moveMarks(S.state, out.marks); saveState(); }
  const rec = {...S.rec, trip: next};
  await keepRecord(rec);
  render();
  offerSave(rec, t(message, {v: shortId(next.version.id)}));
}

function currentPlace(){
  const r = route();
  if(r.name !== "day") return {dayIndex: Math.max(0, todayIndex()), planId: null};
  const d = trip().days[r.i];
  const plan = d.plans ? (d.plans.find(p => p.id === S.state.plans[d.date]) || d.plans[0]) : null;
  return {dayIndex: r.i, planId: plan ? plan.id : null};
}

function editorBase(){
  return {trip: trip(), timezone: trip().timezone, googleKey: googleKey()};
}

// A new stop: on the day on screen, or today when the trip is under way.
function newStop(prefill){
  const here = currentPlace(), ti = todayIndex();
  const dayIndex = route().name === "day" ? here.dayIndex : (ti >= 0 ? ti : 0);
  openStopEditor({...editorBase(), dayIndex, planId: here.planId, prefill,
    onSave: ({stop, date, plan}) => applyEdit(tr => addStop(tr, {date, plan}, stop), "stopAdded")
      .then(() => { const k = trip().days.findIndex(d => d.date === date); if(route().name !== "day" || route().i !== k) location.hash = "#day-" + (k + 1); })
      .catch(err => toast(String(err.message || err)))});
}

function editStop(stopId){
  const here = currentPlace();
  const d = trip().days[here.dayIndex];
  const list = d.plans ? d.plans.find(p => p.id === here.planId).stops : d.stops;
  const stop = list.find(s => s.id === stopId);
  if(!stop) return;
  const ref = {date: d.date, plan: here.planId, id: stop.id};
  openStopEditor({...editorBase(), dayIndex: here.dayIndex, planId: here.planId, stop,
    onSave: ({stop: next, date, plan}) => applyEdit(tr => {
      const out = updateStop(tr, ref, next, {date, plan});
      return {trip: out.trip, marks: [{date: ref.date, plan: ref.plan, from: ref.id, to: out.ref.id, toDate: date, toPlan: plan}]};
    }, "stopSaved").catch(err => toast(String(err.message || err))),
    onDelete: () => applyEdit(tr => ({trip: removeStop(tr, ref)}), "stopDeleted").catch(err => toast(String(err.message || err)))});
}

/* ---------- the trip as a file ---------- */

function download(file){
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Chrome on Android offers the share sheet but refuses .json files in it
// (NotAllowedError: the type is not on its list). Once refused, download directly.
let shareRefused = false;

// Hands the file over: the share sheet where the phone has one and takes the file
// (WhatsApp, Drive, Files…), a download otherwise. Marks the version as saved.
async function saveFile(rec){
  const file = new File([fileText(rec.trip)], fileName(rec.trip), {type: "application/json"});
  try{
    if(!shareRefused && navigator.canShare && navigator.canShare({files: [file]})){
      try{
        await navigator.share({files: [file], title: rec.trip.title});
      }catch(e){
        if(e && e.name === "AbortError") return;   // the traveller closed the share sheet
        shareRefused = true;
        download(file);
      }
    }else{
      download(file);
    }
  }catch(e){
    toast(t("fileFailed"));
    return;
  }
  const done = {...rec, exported: rec.trip.version.id};
  await keepRecord(done);
  render();
  toast(t("fileSaved", {f: file.name}));
}

function offerSave(rec, message){
  toast(message, {label: t("saveFile"), run: () => saveFile(S.records.find(r => r.id === rec.id) || rec)});
}

async function loadDemo(){
  try{
    const r = await fetch("examples/demo-trip.json");
    if(!r.ok) throw new Error(String(r.status));
    await importText(await r.text(), "demo-trip.json");
  }catch(e){
    S.importError = {title: t("importFailed"), items: [String(e && e.message || e)]};
    render();
  }
}

async function removeRecord(id){
  const rec = S.records.find(r => r.id === id);
  if(!rec || !confirm(t("removeConfirm", {t: rec.trip.title}))) return;
  await store.deleteTrip(id);
  await store.delKV("state:" + id);
  S.records = S.records.filter(r => r.id !== id);
  if(S.rec && S.rec.id === id) await openRecord(S.records[S.records.length - 1] || null);
  if(!S.rec && location.hash) history.replaceState(null, "", location.pathname + location.search);
  render();
  toast(t("removed"));
}

/* ---------- rendering ---------- */

function renderStrip(r){
  if(!trip()){ $strip.hidden = true; return; }
  $strip.hidden = false;
  const lang = getLang(), ti = todayIndex();
  $days.setAttribute("aria-label", trip().title);
  $days.innerHTML = trip().days.map((d, i) => {
    const dp = dateParts(d.date, lang), cur = r.name === "day" && r.i === i;
    return `<a class="dchip${i === ti ? " today" : ""}" href="#day-${i + 1}" style="--c:${placeVar(d.place)}"${cur ? ' aria-current="page"' : ""} aria-label="${esc(t("day"))} ${i + 1}, ${esc(dp.long)}${i === ti ? ", " + esc(t("today")) : ""}"><span class="n">${i + 1}</span><span class="w">${esc(dp.dow)}</span></a>`;
  }).join("") +
    `<a class="dchip info" href="#info"${r.name === "info" ? ' aria-current="page"' : ""}>${esc(t("info"))}</a>` +
    `<a class="dchip info" href="#trips"${r.name === "trips" ? ' aria-current="page"' : ""}>${esc(t("trips"))}</a>`;
  const active = $days.querySelector('[aria-current="page"]');
  if(active) $days.scrollLeft = active.offsetLeft - ($days.clientWidth - active.offsetWidth) / 2;
}

function errorBox(){
  if(!S.importError) return "";
  return `<div class="errbox" role="alert"><b>${esc(S.importError.title)}</b><ul>${S.importError.items.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
}

function installSteps(){
  return `<section class="sec"><h2>${esc(t("installTitle"))}</h2><ol class="steps"><li>${rich(t("installIos"))}</li><li>${rich(t("installAndroid"))}</li><li>${rich(t("installOnce"))}</li></ol></section>`;
}

function langPicker(){
  const options = [["auto", t("langAuto")], ...Object.entries(LANGS)];
  return `<section class="sec"><h2>${esc(t("language"))}</h2><div class="seg" role="group" aria-label="${esc(t("language"))}">${options.map(([id, name]) =>
    `<button type="button" data-lang="${esc(id)}" aria-pressed="${S.langPref === id}">${esc(name)}</button>`).join("")}</div></section>`;
}

function themePicker(){
  const options = [["auto", t("themeAuto")], ["light", t("themeLight")], ["dark", t("themeDark")]];
  return `<section class="sec"><h2>${esc(t("theme"))}</h2><div class="seg" role="group" aria-label="${esc(t("theme"))}">${options.map(([id, name]) =>
    `<button type="button" data-theme-choice="${id}" aria-pressed="${S.theme === id}">${esc(name)}</button>`).join("")}</div></section>`;
}

function renderWelcome(){
  return `
  <section class="hero">
    <img src="icons/icon.svg" width="72" height="72" alt="">
    <h1>TIMP</h1>
    <p class="lead name">Travel in my pocket</p>
    <p class="lead">${esc(t("tagline"))}</p>
    <p class="lead">${esc(t("welcomeLead"))}</p>
  </section>
  ${errorBox()}
  <div class="actions">
    <button type="button" class="btn primary" data-act="pick">${esc(t("loadTrip"))}</button>
    <button type="button" class="btn" data-act="demo">${esc(t("tryDemo"))}</button>
  </div>
  ${installSteps()}
  ${langPicker()}
  ${themePicker()}
  ${REPO_URL ? `<p class="foot"><a href="${esc(REPO_URL)}#create-your-own-trip" target="_blank" rel="noopener">${esc(t("makeYourOwn"))} ↗</a></p>` : ""}
  ${store.isPersistent() ? "" : `<p class="foot">${esc(t("storageWarn"))}</p>`}`;
}

function renderTrips(){
  const lang = getLang();
  const cards = S.records.slice().reverse().map(r => {
    const cur = S.rec && S.rec.id === r.id;
    const when = new Intl.DateTimeFormat(lang, {day: "numeric", month: "short", year: "numeric"}).format(new Date(r.importedAt));
    return `<div class="tripcard${cur ? " current" : ""}">
      <div class="t"><span>${esc(r.trip.title)}</span>${cur ? `<span class="badge-on">${esc(t("current"))}</span>` : ""}</div>
      <div class="s">${esc(t("daysCount", {n: r.trip.days.length}))} · ${esc(t("loadedOn", {d: when}))}</div>
      <div class="s ver">${esc(t("versionLabel"))} <code data-version="${esc(r.trip.version.id)}">${esc(shortId(r.trip.version.id))}</code>${r.trip.version.date ? " · " + esc(new Intl.DateTimeFormat(lang, {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}).format(new Date(r.trip.version.date))) : ""}</div>
      ${needsSaving(r) ? `<div class="unsaved" role="status">${esc(t("unsaved"))}</div>` : ""}
      <div class="actions">${cur ? "" : `<button type="button" class="btn small" data-act="open" data-id="${esc(r.id)}">${esc(t("open"))}</button>`}<button type="button" class="btn small${needsSaving(r) ? " primary" : ""}" data-act="save" data-id="${esc(r.id)}">${esc(t("saveFile"))}</button><button type="button" class="btn small danger" data-act="remove" data-id="${esc(r.id)}">${esc(t("remove"))}</button></div>
    </div>`;
  }).join("");
  const key = googleKey();
  const status = !S.useGoogle ? "statusOsmChosen"
    : !key ? "statusNoKey"
    : googleRefusedKey(key) ? "statusRefused"
    : S.deviceKey ? "statusGoogleDevice" : "statusGoogleTrip";
  return `
  <h1>${esc(t("yourTrips"))}</h1>
  ${errorBox()}
  <section class="sec">${cards}
    <div class="actions">
      <button type="button" class="btn primary" data-act="pick">${esc(t("updateTrip"))}</button>
      ${S.records.some(r => r.fileName === "demo-trip.json") ? "" : `<button type="button" class="btn" data-act="demo">${esc(t("tryDemo"))}</button>`}
    </div>
  </section>
  <section class="sec"><h2>${esc(t("mapProvider"))}</h2>
    <div class="seg" role="group" aria-label="${esc(t("mapProvider"))}">
      <button type="button" data-provider="google" aria-pressed="${S.useGoogle}">Google Maps</button>
      <button type="button" data-provider="osm" aria-pressed="${!S.useGoogle}">OpenStreetMap</button>
    </div>
    <p class="foot" data-map-status="${status}"><b>${esc(t(status))}</b> ${esc(t("providerHelp"))}</p>
    <form class="field" data-form="key">
      <label for="gkey">${esc(t("googleKeyTitle"))}</label>
      <p class="foot">${esc(t("googleKeyHelp"))}${tripKey() ? " " + esc(t("googleKeyFromTrip")) : ""}</p>
      <input id="gkey" name="gkey" type="text" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(S.deviceKey)}" placeholder="AIza…">
      <div class="actions"><button type="submit" class="btn small">${esc(t("save"))}</button></div>
    </form>
  </section>
  ${langPicker()}
  ${themePicker()}
  ${installSteps()}
  <section class="sec"><h2>${esc(t("about"))}</h2>
    <p class="foot">TIMP · Travel in my pocket${S.version ? " · " + esc(t("version", {v: S.version})) : ""}${REPO_URL ? ` · <a href="${esc(REPO_URL)}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}</p>
    ${store.isPersistent() ? "" : `<p class="foot">${esc(t("storageWarn"))}</p>`}
  </section>`;
}

function renderInfo(){
  const tr = trip();
  const stays = Object.values(tr.stays || {}).map(h =>
    `<div class="card" style="--c:${placeVar(h.place)}"><div class="t"><span class="dot"></span>${esc(h.name)}</div>` +
    ((h.dates || h.address) ? `<div class="s">${esc([h.dates, h.address].filter(Boolean).join(" · "))}</div>` : "") +
    (h.note ? `<div class="s">${rich(h.note)}</div>` : "") +
    `<div><a class="maplink" href="${esc(mapsUrl(h.query || h.name))}" target="_blank" rel="noopener">${esc(t("mapLink"))}</a></div></div>`
  ).join("");
  const sections = (tr.info || []).map(sec =>
    `<section class="sec"><h2>${esc(sec.title)}</h2><div class="rows">` + sec.rows.map(r =>
      `<div><span class="k">${esc(r.label)}</span><span class="v">${r.number ? `<span class="num">${esc(r.number)}</span>` : ""}${r.number && r.text ? " · " : ""}${r.text ? rich(r.text) : ""}</span></div>`
    ).join("") + `</div></section>`
  ).join("");
  return `
  <h1>${esc(tr.title)}</h1>
  ${stays ? `<section class="sec"><h2>${esc(t("whereYouSleep"))}</h2>${stays}</section>` : ""}
  ${sections}
  ${tr.infoNote ? `<p class="foot">${rich(tr.infoNote)}</p>` : ""}`;
}

function imagesOf(day, planId){
  const all = day.mapImages || [];
  const own = all.filter(im => im.plan === planId);
  const list = planId && own.length ? own : all.filter(im => !im.plan);
  return list.length ? list : null;
}

function effectiveView(hasImages){
  let v = S.ui.mapView;
  if(v === "image" && !hasImages) v = "live";
  if(v === "live" && !S.online) v = hasImages ? "image" : "schema";
  return v;
}

function mapPanel(zs, color, numbered, imgs, view, gone){
  const zoneLink = z => {
    const real = z.pts.filter(p => !p.ref);
    return `<a class="maplink" href="${esc(real.length < 2 ? mapsUrl(real[0].q) : routeUrl(z))}" target="_blank" rel="noopener">${esc(real.length < 2 ? t("mapLink") : t("openInMaps"))}</a>`;
  };
  const zoneTitle = z => z.name || (zs.length > 1 ? z.pts[0].name : t("stopsOfDay"));
  const views = [["live", t("viewLive")]].concat(imgs ? [["image", t("viewImage")]] : [], [["schema", t("viewSchema")]]);

  let o = `<section class="mapbox" style="--c:${color}" aria-label="${esc(t("dayMap"))}">`;
  o += `<div class="seg" role="group" aria-label="${esc(t("mapType"))}">${views.map(([id, name]) => `<button type="button" data-view="${id}" aria-pressed="${id === view}">${esc(name)}</button>`).join("")}</div>`;
  if(!S.online && S.ui.mapView === "live") o += `<p class="off">${esc(t("offlineMap"))}</p>`;

  if(view === "live"){
    o += `<div class="livewrap">`;
    if(zs.length > 1) o += `<div class="zchips">${zs.map((z, i) => `<button type="button" class="zchip" data-fit="${i}">${esc(zoneTitle(z))}</button>`).join("")}</div>`;
    o += `<div id="live-slot"></div>`;
    o += zs.map(z => `<p class="off"><span>${esc(zoneTitle(z))}</span>${zoneLink(z)}</p>`).join("");
    o += `</div>`;
    return o + `<p class="foot">${esc(t("footLive"))}</p></section>`;
  }

  zs.forEach((z, zi) => {
    const real = z.pts.filter(p => !p.ref);
    if(z.enter && z.enter.travel){
      o += `<p class="off move${gone(z.enter.idx) ? " gone" : ""}"><span class="tvchip">${travelIcon(z.enter.travel, 16)}</span><span>${esc(t("travel_" + z.enter.travel))} · ${esc(z.enter.from.name)} → ${esc(zoneTitle(z))}</span></p>`;
    }
    const head = `<div class="zhead"><span class="zname">${esc(zoneTitle(z))}</span>${zoneLink(z)}</div>`;
    const im = view === "image" ? imgs.find(x => (x.zone || 0) === zi) : null;
    if(im){
      const q = name => { const p = z.pts.find(p => p.name === name); return p ? p.q : name; };
      o += `<div class="zone">${head}<img class="mapimg" src="${esc(im.src)}" width="${im.width}" height="${im.height}" alt="${esc(zoneTitle(z))}"><ol class="mlegend">${im.pins.map((n, i) => `<li><span class="mb">${i + 1}</span><a href="${esc(mapsUrl(q(n)))}" target="_blank" rel="noopener">${esc(n)}</a></li>`).join("")}</ol></div>`;
      return;
    }
    if(view === "image"){
      o += `<p class="off"><span>${esc(z.name || real[0].name)} · ${esc(t("onlyInSketch"))}</span>${zoneLink(z)}</p>`;
      return;
    }
    if(real.length < 2){
      o += `<p class="off"><span class="mb">${real[0].nums.join("·")}</span><span>${esc(real[0].name)} · ${esc(t("offSketch"))}</span>${zoneLink(z)}</p>`;
      return;
    }
    o += `<div class="zone">${head}${zoneSVG(z, zoneTitle(z), gone)}<ol class="mlegend">${real.map(p => `<li><span class="mb">${p.nums.join("·")}</span><a href="${esc(mapsUrl(p.q))}" target="_blank" rel="noopener">${esc(p.name)}</a></li>`).join("")}</ol></div>`;
  });
  const credit = view === "image" ? imgs.map(im => im.credit).filter(Boolean)[0] : "";
  const foot = view === "image"
    ? t("footImage") + (credit ? " " + credit + "." : "")
    : t("footSketch") + (numbered ? " " + t("footNumbers") : "");
  return o + `<p class="foot">${esc(foot)}</p></section>`;
}

const stopKey = (day, planId, s, i) => `${day.date}|${planId || ""}|${s.id || "#" + i}`;

const isOpen = id => S.openStops.has(id) ? S.openStops.get(id) : S.ui.expandAll;

function stopsHTML(day, planId, list, numbered, pins){
  return `<ol class="stops" style="--c:${placeVar(day.place)}">` + list.map((s, i) => {
    const id = stopKey(day, planId, s, i);
    const isDone = !!S.state.done[id], isSkipped = !isDone && !!S.state.skipped[id], open = isOpen(id);
    const q = stopQuery(s);
    // Links and the skip button stay outside the part that folds: they are always one tap away.
    const meta = `<div class="meta">${isSkipped ? `<span class="tag off">${esc(t("skipped"))}</span>` : ""}${s.tag ? `<span class="tag">${esc(s.tag)}</span>` : ""}` +
      (q || s.link ? `<a class="maplink" href="${esc(s.link || mapsUrl(q))}" target="_blank" rel="noopener">${esc(t("mapLink"))}</a>` : "") +
      (q ? `<a class="maplink" href="${esc(dirUrl(q))}" target="_blank" rel="noopener">${esc(t("routeLink"))}</a>` : "") +
      (isDone ? "" : `<button type="button" class="skip" data-skip="${esc(id)}" aria-pressed="${isSkipped}">${esc(t(isSkipped ? "unskip" : "skip"))}</button>`) +
      (s.id ? `<button type="button" class="skip" data-edit="${esc(s.id)}">${esc(t("editStop"))}</button>` : "") + `</div>`;
    const pn = pins ? pins[s.mapLabel || s.title] : (numbered && s.lat !== undefined ? i + 1 : 0);
    const nb = pn ? `<br><span class="nb">${pn}</span>` : "";
    const tv = s.travel ? `<span class="tvchip" role="img" aria-label="${esc(t("travel_" + s.travel))}" title="${esc(t("travel_" + s.travel))}">${travelIcon(s.travel, 16)}</span>` : "";
    const titleRow = `<div class="h">${tv}<h3>${esc(s.title)}</h3>${s.text ? `<span class="chev">${CHEVRON}</span>` : ""}</div>`;
    const head = s.text
      ? `<div class="tap" role="button" tabindex="0" data-open="${esc(id)}" aria-expanded="${open}">${titleRow}<p class="desc${open ? "" : " clamp"}">${rich(s.text)}</p></div>`
      : titleRow;
    return `<li class="stop${isDone ? " done" : ""}${isSkipped ? " skipped" : ""}${open ? " open" : ""}"><div class="time">${esc(s.time)}${nb}</div><div class="body">${head}${meta}</div><button class="tick" type="button" data-tick="${esc(id)}" aria-pressed="${isDone}" aria-label="${esc(t(isDone ? "markUndone" : "markDone"))}: ${esc(s.title)}">${CHECK}</button></li>`;
  }).join("") + `</ol>`;
}

// Shows the little arrow only on descriptions that are really cut short.
function markCut(){
  document.querySelectorAll(".stop:not(.open) .desc").forEach(p => {
    p.closest(".stop").classList.toggle("cut", p.scrollHeight - p.clientHeight > 1);
  });
}

// Returns the page and, when the interactive map is showing, what it must display.
function renderDay(i){
  const tr = trip(), d = tr.days[i], lang = getLang();
  const place = tr.places[d.place], color = placeVar(d.place);
  const prev = tr.days[i - 1], next = tr.days[i + 1];
  const plan = d.plans ? (d.plans.find(p => p.id === S.state.plans[d.date]) || d.plans[0]) : null;
  const list = plan ? plan.stops : d.stops;
  const pid = plan ? plan.id : null;
  const keys = list.map((s, k) => stopKey(d, pid, s, k));
  const doneCount = keys.filter(k => S.state.done[k]).length;
  const skipCount = keys.filter(k => !S.state.done[k] && S.state.skipped[k]).length;
  // For the map: is the stop at this position in the list done or skipped?
  const gone = k => k >= 0 && !!(S.state.done[keys[k]] || S.state.skipped[keys[k]]);
  const anyText = list.some(s => s.text);
  const stay = d.stay ? tr.stays[d.stay] : null;
  const zs = zonesOf(d, plan, list);
  const imgs = zs.length ? imagesOf(d, pid) : null;
  const view = effectiveView(!!imgs);
  const numbered = !d.mapZones;
  let pins = null;
  if(imgs && view === "image"){ pins = {}; imgs.forEach(im => im.pins.forEach((p, k) => { if(!pins[p]) pins[p] = k + 1; })); }
  const dp = dateParts(d.date, lang), ti = todayIndex();
  const fromName = d.from ? tr.places[d.from].name : "";
  const sign = place.glyph
    ? `<div class="kanji">${esc(place.glyph)}</div><div class="romaji">${esc(fromName ? fromName + " → " + place.name : place.name)}</div>`
    : `<div class="kanji plain">${esc(place.name)}</div>${fromName ? `<div class="romaji">${esc(fromName + " → " + place.name)}</div>` : ""}`;
  const neighbor = (x, k, cls) => {
    const p = dateParts(x.date, lang), name = esc(tr.places[x.place].name);
    return cls
      ? `<a class="next" href="#day-${k + 1}">${esc(p.dow)} <b>${k + 1}</b> · ${name} →</a>`
      : `<a href="#day-${k + 1}">← <b>${k + 1}</b> ${esc(p.dow)} · ${name}</a>`;
  };

  let html = `
  <section class="sign" style="--c:${color}" aria-label="${esc(t("day"))} ${i + 1}">
    <div class="sign-top">
      <div>${sign}</div>
      <div class="dayno"><div class="g">${esc(t("day"))} ${i + 1}${i === ti ? " · " + esc(t("today")) : ""}</div><div class="d">${esc(dp.long)}</div></div>
    </div>
    <div class="band"></div>
    <div class="neighbors">
      ${prev ? neighbor(prev, i - 1, false) : `<span>${esc(t("arrival"))}</span>`}
      ${next ? neighbor(next, i + 1, true) : `<a class="next" href="#info">${esc(t("info"))} →</a>`}
    </div>
  </section>
  <div class="headrow">
    <h1>${esc(d.title)}</h1>
    <div class="sleep">${stay
      ? `<span>${esc(t("night"))} · <b>${esc(stay.name)}</b></span><a class="maplink" href="${esc(mapsUrl(stay.query || stay.name))}" target="_blank" rel="noopener">${esc(t("mapLink"))}</a>`
      : (d.stayText ? `<span>${esc(t("night"))} · <b>${esc(d.stayText)}</b></span>` : "")}<span class="progress">${esc(t("doneCount", {a: doneCount, b: list.length}))}${skipCount ? " · " + esc(skipCount === 1 ? t("skippedOne") : t("skippedCount", {n: skipCount})) : ""}</span></div>
    ${zs.length || anyText ? `<div class="tools">` +
      (zs.length ? `<button type="button" class="mapbtn" data-map aria-expanded="${S.ui.mapOpen}">${esc(t(S.ui.mapOpen ? "mapClose" : "mapOpen"))}</button>` : "") +
      (anyText ? `<button type="button" class="iconbtn" data-expand aria-pressed="${S.ui.expandAll}" aria-label="${esc(t(S.ui.expandAll ? "collapseAll" : "expandAll"))}" title="${esc(t(S.ui.expandAll ? "collapseAll" : "expandAll"))}">${S.ui.expandAll ? FOLD : UNFOLD}</button>` : "") +
      `</div>` : ""}
  </div>`;

  let wanted = null;
  if(S.ui.mapOpen && zs.length){
    html += mapPanel(zs, color, numbered, imgs, view, gone);
    const dark = isDark();
    if(view === "live") wanted = {key: [S.rec.id, S.rec.importedAt, i, pid || "", googleKey(), lang, dark].join("|"), zones: zs, color: dark ? (place.colorDark || place.color) : place.color, dark, gone};
  }
  if(d.reminders) html += d.reminders.map(r => `<div class="remind"><span class="ic" aria-hidden="true">!</span><div>${rich(r)}</div></div>`).join("");
  if(d.plans){
    html += `<div class="seg" role="group" aria-label="${esc(t("choosePlan"))}">` + d.plans.map(p =>
      `<button type="button" data-plan="${esc(p.id)}" aria-pressed="${p.id === pid}">${esc(p.name)}</button>`).join("") + `</div>`;
  }
  html += stopsHTML(d, pid, list, numbered, pins);
  if(d.note) html += `<p class="alt">${rich(d.note)}</p>`;
  html += `<p class="foot">${esc(t("footDay"))}</p>`;
  return {html, wanted};
}

function syncLive(wanted){
  const slot = document.getElementById("live-slot");
  if(!wanted || !slot){
    if(live){ live.handle.destroy(); live = null; }
    return;
  }
  // A key that changed in another way (a trip loaded, an update) is caught here.
  if(applyMapSettings()) return;
  if(!live || live.key !== wanted.key){
    if(live) live.handle.destroy();
    live = {key: wanted.key, handle: createLiveMap({zones: wanted.zones, color: wanted.color, googleKey: googleKey(), dark: wanted.dark, onNotice: k => toast(t(k))})};
  }
  slot.appendChild(live.handle.el);
  live.handle.refresh();
  live.handle.setMarks(wanted.gone);
}

const $fab = document.createElement("button");
$fab.type = "button";
$fab.className = "fab";
$fab.hidden = true;
$fab.innerHTML = PLUS;
document.body.appendChild($fab);
$fab.addEventListener("click", () => newStop());

function render(){
  const r = route();
  renderStrip(r);
  $fab.hidden = r.name !== "day";
  $fab.setAttribute("aria-label", t("addStop"));
  $fab.title = t("addStop");
  document.body.classList.toggle("has-fab", r.name === "day");
  if(live) live.handle.el.remove(); // keep the map alive while the page is rebuilt
  let wanted = null;
  if(r.name === "welcome") $app.innerHTML = renderWelcome();
  else if(r.name === "trips") $app.innerHTML = renderTrips();
  else if(r.name === "info") $app.innerHTML = renderInfo();
  else { const out = renderDay(r.i); $app.innerHTML = out.html; wanted = out.wanted; }
  syncLive(wanted);
  markCut();
}

/* ---------- events ---------- */

function refocus(selector){
  const el = document.querySelector(selector);
  if(el) el.focus({preventScroll: true});
}

$app.addEventListener("click", e => {
  const tick = e.target.closest("[data-tick]");
  if(tick){
    const id = tick.dataset.tick;
    if(S.state.done[id]) delete S.state.done[id];
    else { S.state.done[id] = 1; delete S.state.skipped[id]; }
    saveState();
    render();
    refocus(`[data-tick="${CSS.escape(id)}"]`);
    return;
  }
  const skip = e.target.closest("[data-skip]");
  if(skip){
    const id = skip.dataset.skip;
    if(S.state.skipped[id]) delete S.state.skipped[id]; else S.state.skipped[id] = 1;
    saveState();
    render();
    refocus(`[data-skip="${CSS.escape(id)}"]`);
    return;
  }
  const edit = e.target.closest("[data-edit]");
  if(edit){ editStop(edit.dataset.edit); return; }
  const tap = e.target.closest("[data-open]");
  if(tap){ toggleStop(tap.dataset.open); return; }
  if(e.target.closest("[data-expand]")){
    S.ui.expandAll = !S.ui.expandAll;
    S.openStops.clear();
    saveUi();
    render();
    refocus("[data-expand]");
    return;
  }
  const themeBtn = e.target.closest("[data-theme-choice]");
  if(themeBtn){
    setTheme(themeBtn.dataset.themeChoice);
    render();
    refocus(`[data-theme-choice="${themeBtn.dataset.themeChoice}"]`);
    return;
  }
  const provider = e.target.closest("[data-provider]");
  if(provider){
    S.useGoogle = provider.dataset.provider === "google";
    store.setKV("useGoogle", S.useGoogle).catch(() => {}).then(() => {
      if(applyMapSettings()) return;
      render();
      refocus(`[data-provider="${provider.dataset.provider}"]`);
    });
    return;
  }
  const langBtn = e.target.closest("[data-lang]");
  if(langBtn){
    S.langPref = langBtn.dataset.lang;
    (S.langPref === "auto" ? store.delKV("lang") : store.setKV("lang", S.langPref)).catch(() => {});
    applyLang();
    if(applyMapSettings()) return;
    render();
    refocus(`[data-lang="${CSS.escape(S.langPref)}"]`);
    return;
  }
  if(e.target.closest("[data-map]")){
    S.ui.mapOpen = !S.ui.mapOpen;
    saveUi();
    render();
    refocus("[data-map]");
    return;
  }
  const view = e.target.closest("[data-view]");
  if(view){
    S.ui.mapView = view.dataset.view;
    saveUi();
    render();
    refocus(`[data-view="${view.dataset.view}"]`);
    return;
  }
  const fit = e.target.closest("[data-fit]");
  if(fit){ if(live) live.handle.fit(+fit.dataset.fit); return; }
  const plan = e.target.closest("[data-plan]");
  if(plan){
    const r = route();
    if(r.name !== "day") return;
    S.state.plans[trip().days[r.i].date] = plan.dataset.plan;
    saveState();
    render();
    refocus(`[data-plan="${CSS.escape(plan.dataset.plan)}"]`);
    return;
  }
  const act = e.target.closest("[data-act]");
  if(!act) return;
  const a = act.dataset.act;
  if(a === "pick"){ $file.value = ""; $file.click(); }
  else if(a === "demo") loadDemo();
  else if(a === "remove") removeRecord(act.dataset.id);
  else if(a === "save"){ const rec = S.records.find(r => r.id === act.dataset.id); if(rec) saveFile(rec); }
  else if(a === "open"){
    const rec = S.records.find(r => r.id === act.dataset.id);
    if(rec) openRecord(rec).then(() => { history.replaceState(null, "", location.pathname + location.search); if(applyMapSettings()) return; render(); window.scrollTo(0, 0); });
  }
});

function toggleStop(id){
  S.openStops.set(id, !isOpen(id));
  render();
  refocus(`[data-open="${CSS.escape(id)}"]`);
}

// The description is a button for the keyboard too.
$app.addEventListener("keydown", e => {
  if(e.key !== "Enter" && e.key !== " ") return;
  const tap = e.target.closest && e.target.closest("[data-open]");
  if(!tap || e.target !== tap) return;
  e.preventDefault();
  toggleStop(tap.dataset.open);
});

$app.addEventListener("submit", e => {
  const form = e.target.closest('[data-form="key"]');
  if(!form) return;
  e.preventDefault();
  S.deviceKey = form.elements.gkey.value.trim();
  (S.deviceKey ? store.setKV("googleKey", S.deviceKey) : store.delKV("googleKey")).then(() => {
    if(applyMapSettings()) return;
    render();
    toast(t("saved"));
  });
});

$file.addEventListener("change", async () => {
  const f = $file.files && $file.files[0];
  if(!f) return;
  try{
    await importText(await f.text(), f.name);
  }catch(e){
    S.importError = {title: t("importFailed"), items: [String(e && e.message || e)]};
    render();
  }
});

window.addEventListener("hashchange", () => { S.importError = null; render(); window.scrollTo(0, 0); });
window.addEventListener("resize", markCut);
// When the phone switches between light and dark, maps follow it.
if(darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", () => { if(S.theme === "auto") render(); });
window.addEventListener("online", () => { S.online = true; render(); });
window.addEventListener("offline", () => { S.online = false; render(); });

/* ---------- offline support ---------- */

function setupServiceWorker(){
  if(!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  const offer = sw => toast(t("updateReady"), {label: t("reload"), run: () => sw.postMessage("skip-waiting")});
  navigator.serviceWorker.register("sw.js").then(reg => {
    if(reg.waiting && hadController) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      if(sw) sw.addEventListener("statechange", () => { if(sw.state === "installed" && hadController) offer(sw); });
    });
    if(!hadController) navigator.serviceWorker.ready.then(() => toast(t("offlineReady")));
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if(reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

async function readVersion(){
  try{
    const keys = await caches.keys();
    const k = keys.filter(x => x.startsWith("timp-shell-")).sort().pop();
    if(k) S.version = k.slice("timp-shell-".length);
  }catch(e){}
}

// Android: a place shared from Google Maps opens the app as ?title=…&text=…&url=…
// (see share_target in manifest.webmanifest). The form opens already filled in.
function takeSharedPlace(){
  const q = new URLSearchParams(location.search);
  const parts = ["title", "text", "url"].map(k => q.get(k)).filter(Boolean);
  if(!parts.length) return;
  history.replaceState(null, "", location.pathname + location.hash);
  if(!trip()){ toast(t("shareNeedsTrip")); return; }
  // The Maps app often repeats the link inside the text: keep each piece once.
  const text = [...new Set(parts.join("\n").split("\n").map(s => s.trim()).filter(Boolean))].join("\n");
  newStop(text);
}

/* ---------- start ---------- */

async function start(){
  const [records, activeId, ui, key, lang, useGoogle] = await Promise.all([store.listTrips(), store.getKV("active"), store.getKV("ui"), store.getKV("googleKey"), store.getKV("lang"), store.getKV("useGoogle")]);
  if(useGoogle === false) S.useGoogle = false;
  if(typeof lang === "string" && LANGS[lang]) S.langPref = lang;
  S.records = (records || []).sort((a, b) => a.importedAt - b.importedAt);
  // Trips saved before versions existed: give them ids and a version, ticks follow.
  for(const rec of S.records.filter(r => !r.trip.version)){
    const {trip: ready, renamed} = await prepare(rec.trip);
    const saved = await store.getKV("state:" + rec.id);
    if(saved && renamed.length) await store.setKV("state:" + rec.id, moveMarks({done: {}, skipped: {}, plans: {}, ...saved}, renamed));
    Object.assign(rec, {trip: ready, exported: ready.version.id});
    await store.putTrip(rec);
    await store.putVersion(ready);
  }
  if(ui && typeof ui === "object") S.ui = {mapOpen: !!ui.mapOpen, mapView: ["live", "image", "schema"].includes(ui.mapView) ? ui.mapView : "live", expandAll: !!ui.expandAll};
  if(typeof key === "string") S.deviceKey = key;
  syncThemeColor();
  await openRecord(S.records.find(r => r.id === activeId) || S.records[S.records.length - 1] || null);
  await readVersion();
  render();
  setupServiceWorker();
  takeSharedPlace();
}

start().catch(e => {
  $app.innerHTML = `<div class="errbox" role="alert"><b>TIMP</b><ul><li>${esc(String(e && e.message || e))}</li></ul></div>`;
});
