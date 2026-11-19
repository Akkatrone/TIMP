import { validateTrip, upgrade, citiesOf, stayOf, placeQuery, formatBrief, FORMAT, TRAVEL, TYPES } from "./trip.js";
import * as store from "./store.js";
import { t, setLang, deviceLang, getLang, LANGS } from "./i18n.js";
import { esc, rich, mapsUrl, dirUrl, dateParts, todayIn, jsonIn, weekdayName } from "./util.js";
import { zonesOf, routeUrl, zoneSVG, painter, TYPE_COLORS } from "./geo.js";
import { daylight, partsOfDay } from "./sun.js";
import { reviewSite, closedOn, regionOf, localLang } from "./places.js";
import { clockMinutes } from "./edit.js";
import { icon } from "./icons.js";
import { createLiveMap } from "./livemap.js";
import { googleNeedsReload, googleRefusedKey } from "./google.js";
import { versionStore } from "./objects.js";
import { REPO_URL } from "./config.js";
import { openStopEditor, openDayEditor, openExpenseEditor } from "./editor.js";
import { ask } from "./ask.js";
import { addStop, updateStop, removeStop, addDay, updateDay, removeDay, addExpense, updateExpense, removeExpense } from "./edit.js";
import { convert, monthsFor, formatMoney, formatRate, symbolOf, homeOf, currencies, currencyName } from "./money.js";
import { keptRates, fetchMonth } from "./rates.js";
import { prepare, saveEdit, inspect, apply, restore, moveMarks, fileName, fileText } from "./trips.js";
import { isChanges, applyChanges, outline, changesBrief } from "./changes.js";
import { diffTrips, counts } from "./diff.js";
import { describe, openHistory } from "./history.js";
import { shortId } from "./version.js";

const CHEVRON = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const UNFOLD = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 6L8 2.5 11.5 6M4.5 10L8 13.5 11.5 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const FOLD = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 2.5L8 6l3.5-3.5M4.5 13.5L8 10l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const CLIP = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5.5" y="4.5" width="13" height="16" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M9 4.5h6v2.5H9z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12h6M9 15.5h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const DOTS = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="12.5" cy="8" r="1.5" fill="currentColor"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const S = {
  records: [],            // [{id, trip, importedAt, fileName}]
  rec: null,              // the open one
  state: {done: {}, skipped: {}, plans: {}},
  ui: {mapOpen: false, mapView: "live", expandAll: false, route: true, costsOpen: false, costView: "sum", costCur: ""},
  langPref: "auto",       // "auto" follows the trip, or a language chosen on this device
  theme: document.documentElement.dataset.theme || "auto",   // set early by js/theme.js
  openStops: new Map(),   // descriptions opened or closed one by one, until the page is closed
  menuFor: null,          // the stop whose ⋯ menu is open
  deviceKey: "",
  useGoogle: true,        // false: always OpenStreetMap, even with a key (saves Google map loads)
  importError: null,      // {title, items, all}: items shown, all copied for an assistant
  online: navigator.onLine !== false,
  version: "",
  home: homeOf(navigator.language),   // the traveller's own currency
  rates: {},              // exchange rates of the days the trip needs (js/money.js)
  openCosts: new Set()    // stops whose cost shows what it makes at home, until the page is closed
};

const $app = document.getElementById("app");
const $strip = document.querySelector(".strip");
const $days = document.getElementById("days");
// The element the page scrolls in: <body> on Android (js/theme.js), the window elsewhere.
const scroller = document.documentElement.classList.contains("own-scroll") ? document.body : null;
const scrollTop = () => scroller ? scroller.scrollTop : window.scrollY;
const scrollToY = y => { if(scroller) scroller.scrollTop = y; else window.scrollTo(0, y); };
const $file = document.getElementById("file");
const $toast = document.getElementById("toast");

let live = null;          // {key, handle} — the interactive map survives re-renders
let versions = null;      // every version of every trip on this phone (js/objects.js), set at start
let toastTimer = 0;

/* ---------- small helpers ---------- */

let pendingOffer = null;  // a toast with a button waits behind short messages instead of being lost

// A short message at the bottom. With an action it stays, with its button and a ✕,
// until the traveller answers; messages without one go after four seconds.
function toast(text, action){
  clearTimeout(toastTimer);
  $toast.innerHTML = `<span class="msg">${esc(text)}</span>` + (action
    ? `<button type="button" class="act">${esc(action.label)}</button><button type="button" class="x" aria-label="${esc(t("close"))}">×</button>`
    : "");
  $toast.hidden = false;
  if(action){
    pendingOffer = {text, action};
    $toast.querySelector(".act").onclick = () => { pendingOffer = null; $toast.hidden = true; action.run(); };
    $toast.querySelector(".x").onclick = () => { pendingOffer = null; $toast.hidden = true; };
  }else{
    toastTimer = setTimeout(() => {
      $toast.hidden = true;
      if(pendingOffer) toast(pendingOffer.text, pendingOffer.action);
    }, 4000);
  }
}

const trip = () => S.rec && S.rec.trip;
// Each city of the trip gets a colour of the palette in css/app.css (--p0…--p7), in
// the order the cities first appear: the file says nothing about colours.
const PALETTE = 8;
const cityIndex = city => Math.max(0, citiesOf(trip()).indexOf(city || "")) % PALETTE;
const cityVar = city => `var(--p${cityIndex(city)})`;
// The same colour as a value, for the interactive map, in the theme on screen.
const cityColor = city => getComputedStyle(document.documentElement).getPropertyValue(`--p${cityIndex(city)}`).trim();
// The key the interactive map uses: none if Google is turned off on this device;
// otherwise the key saved on this device, which wins over the one in the trip file.
const tripKey = () => (trip() && trip().googleMapsKey) || "";
const googleKey = () => S.useGoogle ? (S.deviceKey || tripKey()) : "";

// After the key, the language or the trip changes: if Google's script is already in
// the page with other settings, only a fresh page can apply the new ones.
function applyMapSettings(){
  if(googleNeedsReload(googleKey())){ location.reload(); return true; }
  return false;
}
const saveState = () => { if(S.rec) store.setKV("state:" + S.rec.id, S.state).catch(() => {}); };
const saveUi = () => { store.setKV("ui", S.ui).catch(() => {}); };

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
    m.setAttribute("content", S.theme === "auto" ? m.dataset.auto : (S.theme === "dark" ? "#0d1012" : "#eceeeb"));
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
  S.openCosts.clear();
  applyLang();
  document.title = rec ? rec.trip.title : "TIMP";
  await loadRates();
}

// Saves a trip record and makes it the open one. `exported` is the version the
// traveller already has as a file: anything newer is offered for saving.
async function keepRecord(rec){
  await store.putTrip(rec);
  S.records = S.records.filter(r => r.id !== rec.id).concat(rec);
  if(S.rec && S.rec.id === rec.id){ S.rec = rec; document.title = rec.trip.title; }
  else await openRecord(rec);
}

const needsSaving = rec => !!rec && rec.exported !== rec.trip.version.id;

// A list of changes written by an AI assistant (js/changes.js): applied to the trip it
// names, or to the open one, as one new version, like an edit made on this phone.
async function importChanges(data){
  const rec = data.trip ? S.records.find(r => r.id === data.trip) : S.rec;
  const fail = items => { S.importError = {title: t("changesFailed"), items: items.slice(0, 12), all: items}; render(); scrollToY(0); };
  if(!rec) return fail([data.trip ? t("changesNoTrip", {id: data.trip}) : t("changesNoOpen")]);
  const res = applyChanges(rec.trip, data);
  if(!res.ok) return fail(res.errors);
  S.importError = null;
  if(S.rec !== rec) await openRecord(rec);
  await applyEdit(() => ({trip: res.trip, marks: res.moves}), "changesApplied", res.counts);
}

async function importText(text, name){
  let data;
  try{ data = JSON.parse(text); }
  catch(e){
    const why = t("notJson") + " " + String(e && e.message || "");
    S.importError = {title: t("importFailed"), items: [why], all: [why]};
    render(); scrollToY(0); return;
  }
  if(isChanges(data)){ await importChanges(data); return; }
  data = upgrade(data);   // a file in the old format is converted, then checked
  const res = validateTrip(data);
  if(!res.ok){ S.importError = {title: t("importFailed"), items: res.errors.slice(0, 12), all: res.errors}; render(); scrollToY(0); return; }
  S.importError = null;
  try{
    const {trip: incoming} = await prepare(data);
    const local = S.records.find(r => r.id === incoming.id);
    let rec, message, offer = false;
    if(!local){
      await versions.put(incoming);
      rec = {id: incoming.id, trip: incoming, importedAt: Date.now(), fileName: name || "", exported: incoming.version.id};
      message = t("imported", {t: incoming.title});
    }else{
      const x = await inspect(versions, local.trip, incoming);
      const choice = x.kind === "diverged" ? await chooseMerge(x) : x.kind === "newer" ? "take" : "keep";
      if(choice === null) return;   // the traveller cancelled: nothing changes
      const trip = await apply(versions, x, choice);
      const v = shortId(trip.version.id);
      rec = {...local, trip, importedAt: Date.now(), fileName: name || local.fileName};
      if(x.kind === "same") message = t("recvSame", {v});
      else if(x.kind === "newer"){ rec.exported = trip.version.id; message = t("recvNewer", {t: trip.title, v}); }
      else if(x.kind === "older"){
        // Nothing changes, unless the traveller wants this older file back.
        toast(t("recvOlder", {v}), {label: t("backToFile"), run: () => backToFile(x)});
        return;
      }
      else if(choice === "theirs"){ message = t("recvTheirs", {v}); offer = true; }
      else { const c = counts(diffTrips(local.trip, trip)); message = t("recvMerged", {a: c.added, c: c.changed, r: c.removed, v}); offer = true; }
    }
    await keepRecord(rec);
    store.askPersistence();
    if(location.hash) history.replaceState(null, "", location.pathname + location.search);
    render();
    scrollToY(0);
    if(offer) offerSave(rec, message); else toast(message);
  }catch(e){
    S.importError = {title: t("importFailed"), items: [String(e && e.message || e)]};
    render();
  }
}

// Both the file and this phone changed: show what, and ask what to do.
async function chooseMerge(x){
  const answer = await ask({
    title: t("divTitle"),
    text: [
      {title: t("divInFile"), items: describe(x.theirs, 4)},
      {title: t("divOnPhone"), items: describe(x.mine, 4)},
      x.base ? "" : t("divNoBase")
    ],
    actions: [{id: "cancel", label: t("cancel")}, {id: "theirs", label: t("useFile")}, {id: "merge", label: t("mergeBoth"), kind: "primary"}]
  });
  return answer === "theirs" || answer === "merge" ? answer : null;
}

// An older file loaded on purpose: its content comes back as a new version.
async function backToFile(x){
  const trip = await apply(versions, x, "back");
  const rec = {...S.records.find(r => r.id === trip.id), trip};
  await keepRecord(rec);
  render();
  offerSave(rec, t("recvBack", {v: shortId(trip.version.id)}));
}

// The history of the open trip, with a way back to any version this phone has.
function showHistory(id){
  const rec = S.records.find(r => r.id === id);
  if(!rec) return;
  openHistory({trip: rec.trip, versions, onRestore: async vid => {
    const {trip} = await restore(versions, rec.trip, vid);
    const next = {...rec, trip};
    await keepRecord(next);
    render();
    offerSave(next, t("restored", {v: shortId(trip.version.id)}));
  }}).catch(err => toast(String(err.message || err)));
}

/* ---------- editing stops ---------- */

// Applies an edit to the open trip: a new version, kept on the phone, then offered
// as a file. `change(trip)` returns {trip, marks?}: marks move ticks with a stop.
async function applyEdit(change, message, extra = {}){
  const cur = S.rec.trip;
  const out = change(cur);
  const {trip: next, changed} = await saveEdit(versions, cur, out.trip);
  if(!changed) return;
  if(out.marks && out.marks.length){ S.state = moveMarks(S.state, out.marks); saveState(); }
  const rec = {...S.rec, trip: next};
  await keepRecord(rec);
  render();
  offerSave(rec, t(message, {v: shortId(next.version.id), ...extra}));
}

function currentPlace(){
  const r = route();
  if(r.name !== "day") return {dayIndex: Math.max(0, todayIndex()), planId: null};
  const d = trip().days[r.i];
  const plan = d.plans ? (d.plans.find(p => p.id === S.state.plans[d.date]) || d.plans[0]) : null;
  return {dayIndex: r.i, planId: plan ? plan.id : null};
}

function editorBase(){
  return {trip: trip(), timezone: trip().timezone, googleKey: googleKey(), dark: isDark()};
}

// The trip with the day a stop goes to, when the form chose a new one after the last.
const withDay = (tr, newDay) => newDay ? addDay(tr, {...newDay, stops: []}) : tr;
const goToDay = date => { const k = trip().days.findIndex(d => d.date === date); if(route().name !== "day" || route().i !== k) location.hash = "#day-" + (k + 1); };

// A new stop: on the day on screen, or today when the trip is under way; with
// newDay, on a new day after the last.
function newStop(prefill, newDay = false){
  const here = currentPlace(), ti = todayIndex();
  const dayIndex = route().name === "day" ? here.dayIndex : (ti >= 0 ? ti : 0);
  openStopEditor({...editorBase(), money: moneyOptions(), dayIndex, planId: here.planId, prefill, newDay,
    onSave: ({stop, date, plan, newDay}) => applyEdit(tr => addStop(withDay(tr, newDay), {date, plan}, stop), newDay ? "dayAdded" : "stopAdded", newDay ? {n: trip().days.length + 1} : {})
      .then(() => goToDay(date))
      .catch(err => toast(String(err.message || err)))});
}

// The day on screen: its city, title, night and notes, or deleted with its stops.
function editDay(){
  const i = currentPlace().dayIndex, d = trip().days[i];
  openDayEditor({day: d, number: i + 1, canDelete: trip().days.length > 1,
    onSave: set => applyEdit(tr => ({trip: updateDay(tr, d.date, set)}), "daySaved").catch(err => toast(String(err.message || err))),
    onDelete: () => applyEdit(tr => ({trip: removeDay(tr, d.date)}), "dayDeleted")
      .then(() => { location.hash = "#day-" + Math.max(1, Math.min(i + 1, trip().days.length)); })
      .catch(err => toast(String(err.message || err)))});
}

function editStop(stopId){
  const here = currentPlace();
  const d = trip().days[here.dayIndex];
  const list = d.plans ? d.plans.find(p => p.id === here.planId).stops : d.stops;
  const stop = list.find(s => s.id === stopId);
  if(!stop) return;
  const ref = {date: d.date, plan: here.planId, id: stop.id};
  openStopEditor({...editorBase(), money: moneyOptions(), dayIndex: here.dayIndex, planId: here.planId, stop,
    onSave: ({stop: next, date, plan, newDay}) => applyEdit(tr => {
      const out = updateStop(withDay(tr, newDay), ref, next, {date, plan});
      return {trip: out.trip, marks: [{date: ref.date, plan: ref.plan, from: ref.id, to: out.ref.id, toDate: date, toPlan: plan}]};
    }, "stopSaved").catch(err => toast(String(err.message || err))),
    onDelete: () => applyEdit(tr => ({trip: removeStop(tr, ref)}), "stopDeleted").catch(err => toast(String(err.message || err)))});
}

// An expense outside the stops: a new one, or the one with this id.
function editExpense(id){
  const tr = trip(), x = id ? (tr.expenses || []).find(e => e.id === id) : null;
  if(id && !x) return;
  openExpenseEditor({expense: x, money: moneyOptions(), tripCurrency: tr.currency || "", today: tripToday(),
    onSave: e => applyEdit(cur => x ? {trip: updateExpense(cur, x.id, e)} : addExpense(cur, e), x ? "expenseSaved" : "expenseAdded").catch(err => toast(String(err.message || err))),
    onDelete: () => applyEdit(cur => ({trip: removeExpense(cur, x.id)}), "expenseDeleted").catch(err => toast(String(err.message || err)))});
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
  if(!rec) return;
  const answer = await ask({title: t("removeTripTitle"), text: t("removeConfirm", {t: rec.trip.title}),
    actions: [{id: "no", label: t("cancel")}, {id: "yes", label: t("remove"), kind: "danger"}]});
  if(answer !== "yes") return;
  await store.deleteTrip(id);
  await store.delKV("state:" + id);
  await versions.drop(id);
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
    return `<a class="dchip${i === ti ? " today" : ""}" href="#day-${i + 1}" style="--c:${cityVar(d.city)}"${cur ? ' aria-current="page"' : ""} aria-label="${esc(t("day"))} ${i + 1}, ${esc(dp.long)}${i === ti ? ", " + esc(t("today")) : ""}"><span class="n">${i + 1}</span><span class="w">${esc(dp.dow)}</span></a>`;
  }).join("") +
    `<a class="dchip info" href="#info"${r.name === "info" ? ' aria-current="page"' : ""}>${esc(t("info"))}</a>` +
    `<a class="dchip info" href="#trips"${r.name === "trips" ? ' aria-current="page"' : ""}>${esc(t("trips"))}</a>`;
  const active = $days.querySelector('[aria-current="page"]');
  if(active) $days.scrollLeft = active.offsetLeft - ($days.clientWidth - active.offsetWidth) / 2;
  markStrip();
}

// The bar of days: an edge once the page has scrolled under it, and a fade on each side
// of the list of days where there is more to scroll (css/app.css, .strip).
function markStrip(){
  $strip.classList.toggle("scrolled", scrollTop() > 4);
  const max = $days.scrollWidth - $days.clientWidth;
  $days.classList.toggle("more-l", $days.scrollLeft > 2);
  $days.classList.toggle("more-r", $days.scrollLeft < max - 2);
}
// Paste at the bottom: with its word only at the top or at the end of the page; in
// between only its icon, so it covers less of the stops.
function markFabs(){
  const y = scrollTop(), el = scroller || document.documentElement;
  const atEnd = y + el.clientHeight >= el.scrollHeight - 24;
  $fabs.classList.toggle("compact", y >= 40 && !atEnd);
}
let stripFrame = 0;
const onScroll = () => { if(!stripFrame) stripFrame = requestAnimationFrame(() => { stripFrame = 0; markStrip(); markFabs(); }); };
(scroller || window).addEventListener("scroll", onScroll, {passive: true});
window.addEventListener("resize", onScroll, {passive: true});
$days.addEventListener("scroll", onScroll, {passive: true});

function errorBox(){
  const e = S.importError;
  if(!e) return "";
  const more = e.all && e.all.length > e.items.length ? `<li>${esc(t("moreProblems", {n: e.all.length - e.items.length}))}</li>` : "";
  return `<div class="errbox" role="alert"><b>${esc(e.title)}</b><ul>${e.items.map(x => `<li>${esc(x)}</li>`).join("")}${more}</ul>` +
    (e.all ? `<p class="aihelp">${esc(t("aiHelp"))}</p><div class="actions"><button type="button" class="btn small" data-act="copy-errors">${esc(t("copyForAi"))}</button></div>` : "") + `</div>`;
}

// How to have a trip written by an AI assistant: a short message to copy and fill in,
// then Paste a trip. On the first screen, and folded on the Trips page.
// The message points to llms.txt in the project's repository: chat assistants open
// github.com pages more readily than a small site (tools/check-llms.mjs keeps it up to
// date). For an assistant that opens no link at all, the second button copies the
// format itself (formatBrief), about forty lines.
const llmsUrl = () => REPO_URL ? `${REPO_URL}/blob/main/llms.txt` : new URL("llms.txt", document.baseURI).href;
const aiMessage = () => t("aiPrompt", {url: llmsUrl()});
const aiMessageFull = () => t("aiPromptFull") + "\n\n" + formatBrief();

function aiSection(folded){
  const body = `<ol class="steps"><li>${esc(t("aiStep1"))}</li><li>${esc(t("aiStep2"))}</li></ol>
    <pre class="prompt" data-prompt>${esc(aiMessage())}</pre>
    <div class="actions"><button type="button" class="btn small" data-act="copy-prompt">${esc(t("copyPrompt"))}</button><button type="button" class="btn small" data-act="paste">${esc(t("pasteTrip"))}</button></div>
    <p class="foot">${esc(t("aiNoLinks"))} <button type="button" class="linkbtn" data-act="copy-prompt-full">${esc(t("copyPromptFull"))}</button></p>`;
  return folded
    ? `<details class="aihow"><summary>${esc(t("aiTitle"))}</summary>${body}</details>`
    : `<section class="sec aihow"><h2>${esc(t("aiTitle"))}</h2>${body}</section>`;
}

// How to have the open trip changed by an AI assistant: the message carries how to
// write changes and an outline of the trip (js/changes.js), so it needs no link; the
// assistant answers with only the changes, which come back through Paste a trip as one
// new version. Few tokens either way.
// The version of the app, for an assistant that read the format guide (llms.txt) earlier
// in the chat: a newer one tells it to read the guide again. Only on a published copy.
const appVersion = () => (/^\d+\.\d+\.\d+/.exec(S.version) || [""])[0];
const versionLine = () => appVersion() ? "\n\n" + t("aiVersion", {v: appVersion(), url: llmsUrl()}) : "";
const aiEditMessage = () => t("aiEditPrompt") + versionLine() + "\n\n" + changesBrief() + "\n\n" + outline(S.rec.trip);

function aiEditSection(){
  return `<details class="aihow"><summary>${esc(t("aiEditTitle"))}</summary>
    <ol class="steps"><li>${esc(t("aiEdit1"))}</li><li>${esc(t("aiEdit2"))}</li><li>${esc(t("aiEdit3"))}</li></ol>
    <pre class="prompt">${esc(t("aiEditPrompt"))}\n${esc(t("aiEditMore", {t: S.rec.trip.title}))}</pre>
    <div class="actions"><button type="button" class="btn small" data-act="copy-edit">${esc(t("copyEdit"))}</button><button type="button" class="btn small" data-act="paste">${esc(t("pasteTrip"))}</button></div>
  </details>`;
}

// Copies a message for an assistant. Without a clipboard a short one is shown to copy
// by hand; a long one (a whole trip) cannot be, so the file is the way instead.
async function copyText(text, done){
  try{ await navigator.clipboard.writeText(text); toast(done); }
  catch(e){
    if(text.length > 4000){ toast(t("copyTooLong")); return; }
    await ask({title: t("copyByHand"), text: text.split("\n").filter(Boolean), actions: [{id: "ok", label: t("close")}]});
  }
}

// The problems of a refused file, worded for the assistant that wrote it.
function messageForAi(){
  return t("aiFixPrompt") + versionLine() + "\n\n" + S.importError.all.map(x => "- " + x).join("\n");
}

function copyErrors(){
  if(S.importError && S.importError.all) copyText(messageForAi(), t("copiedForAi"));
}

// A trip pasted as text, as a chat assistant gives it: no file to save on the phone.
// `any`: opened by the Paste button at the bottom, so it takes a place too (takeText
// decides what it is).
let pasteDialog = null;
function pasteTrip(any = false){
  if(!pasteDialog){
    pasteDialog = document.createElement("dialog");
    pasteDialog.className = "sheet";
    pasteDialog.setAttribute("aria-labelledby", "paste-title");
    document.body.appendChild(pasteDialog);
    pasteDialog.addEventListener("click", e => { if(e.target === pasteDialog) pasteDialog.close(); });
  }
  const d = pasteDialog;
  d.innerHTML = `<form class="sheet-form" novalidate>
    <div class="sheet-head"><h2 id="paste-title">${esc(t(any ? "paste" : "pasteTrip"))}</h2><button type="button" class="iconbtn" data-close aria-label="${esc(t("cancel"))}">×</button></div>
    <p class="foot">${esc(t(any ? "pasteAnyHelp" : "pasteHelp"))}</p>
    <textarea id="paste-text" rows="8" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(any ? t("pasteAnyPh") : '{"format": "travel-in-my-pocket/2", …}')}"></textarea>
    <p class="errbox" data-error role="alert" hidden></p>
    <div class="sheet-actions">
      <button type="button" class="btn small" data-paste>${esc(t("paste"))}</button>
      <span class="grow"></span>
      <button type="button" class="btn" data-close>${esc(t("cancel"))}</button>
      <button type="submit" class="btn primary">${esc(t(any ? "pasteGo" : "pasteLoad"))}</button>
    </div>
  </form>`;
  const area = d.querySelector("#paste-text");
  d.onclick = async e => {
    if(e.target.closest("[data-close]")){ d.close(); return; }
    if(e.target.closest("[data-paste]")){
      try{ area.value = await navigator.clipboard.readText(); }
      catch(err){ area.focus(); }
    }
  };
  d.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    if(!area.value.trim()){
      const box = d.querySelector("[data-error]");
      box.textContent = t("pasteEmpty");
      box.hidden = false;
      return;
    }
    d.close();
    try{ if(any) await takeText(area.value, "pasted.json"); else await importText(jsonIn(area.value), "pasted.json"); }
    catch(err){ S.importError = {title: t("importFailed"), items: [String(err && err.message || err)]}; render(); }
  };
  d.showModal();
  // From the Paste button the next tap is Paste in the sheet: no keyboard over it.
  if(!any) area.focus();
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

// The traveller's own currency: what costs are converted into.
function homePicker(){
  const lang = getLang();
  const common = ["EUR", "USD", "GBP", "CHF", "JPY"];
  const all = [...new Set([S.home, ...common, ...currencies()])];
  const opt = c => `<option value="${c}"${c === S.home ? " selected" : ""}>${esc(c + " · " + currencyName(c, lang))}</option>`;
  return `<section class="sec"><h2>${esc(t("homeCurrency"))}</h2><div class="field">
    <select id="home-cur" aria-label="${esc(t("homeCurrency"))}">${all.map(opt).join("")}</select>
    <p class="foot">${esc(t("homeCurrencyHelp"))}</p></div></section>`;
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
    <button type="button" class="btn" data-act="paste">${esc(t("pasteTrip"))}</button>
    <button type="button" class="btn" data-act="demo">${esc(t("tryDemo"))}</button>
  </div>
  ${aiSection(false)}
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
      <div class="actions">${cur ? "" : `<button type="button" class="btn small" data-act="open" data-id="${esc(r.id)}">${esc(t("open"))}</button>`}<button type="button" class="btn small${needsSaving(r) ? " primary" : ""}" data-act="save" data-id="${esc(r.id)}">${esc(t("saveFile"))}</button><button type="button" class="btn small" data-act="history" data-id="${esc(r.id)}">${esc(t("history"))}</button><button type="button" class="btn small danger" data-act="remove" data-id="${esc(r.id)}">${esc(t("remove"))}</button></div>
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
      <button type="button" class="btn" data-act="paste">${esc(t("pasteTrip"))}</button>
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
  ${homePicker()}
  ${installSteps()}
  <section class="sec"><h2>${esc(t("aiTitleShort"))}</h2>
    ${aiSection(true)}
    ${S.rec ? aiEditSection() : ""}
  </section>
  <section class="sec"><h2>${esc(t("about"))}</h2>
    <p class="foot">TIMP · Travel in my pocket${S.version ? " · " + esc(t("version", {v: S.version})) : ""}${REPO_URL ? ` · <a href="${esc(REPO_URL)}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}</p>
    ${store.isPersistent() ? "" : `<p class="foot">${esc(t("storageWarn"))}</p>`}
  </section>`;
}

// A line of the Info page that is only a phone number becomes a link to call it.
const PHONE = /^\+?\d[\d ().-]{1,18}\d$/;

// The places to sleep of the trip, from its days, each with the nights it covers. A
// stay given as plain text ("Night train") is not a place: it shows on its day only.
function staysOf(tr){
  const byName = new Map();
  tr.days.forEach(d => {
    if(!d.stay || typeof d.stay !== "object") return;
    const s = d.stay;
    const seen = byName.get(s.name);
    if(seen) seen.last = d.date;
    else byName.set(s.name, {...s, city: d.city, first: d.date, last: d.date});
  });
  return [...byName.values()];
}

function renderInfo(){
  const tr = trip(), lang = getLang();
  const nights = h => {
    const a = dateParts(h.first, lang).short, b = dateParts(h.last, lang).short;
    return a === b ? a : `${a} → ${b}`;
  };
  const stays = staysOf(tr).map(h =>
    `<div class="card" style="--c:${cityVar(h.city)}"><div class="t"><span class="dot"></span>${esc(h.name)}</div>` +
    `<div class="s">${esc([nights(h), h.address].filter(Boolean).join(" · "))}</div>` +
    (h.note ? `<div class="s">${rich(h.note)}</div>` : "") +
    `<div><a class="maplink" href="${esc(mapsUrl(h.address || h.name))}" target="_blank" rel="noopener">${esc(t("mapLink"))}</a></div></div>`
  ).join("");
  const line = text => PHONE.test(text) ? `<a class="num" href="tel:${esc(text.replace(/[^\d+]/g, ""))}">${esc(text)}</a>` : rich(text);
  const sections = (tr.info || []).map(sec =>
    `<section class="sec"><h2>${esc(sec.title)}</h2><div class="rows">` + sec.items.map(r =>
      `<div><span class="k">${esc(r.label)}</span><span class="v">${line(r.text)}</span></div>`
    ).join("") + `</div></section>`
  ).join("");
  return `
  <h1>${esc(tr.title)}</h1>
  ${stays ? `<section class="sec"><h2>${esc(t("whereYouSleep"))}</h2>${stays}</section>` : ""}
  ${sections}
  ${costsSection()}`;
}

/* ---------- what the trip cost ---------- */

// The currencies the totals can be shown in: the traveller's, the trip's, euro or dollar.
function costCurrencies(){
  return [...new Set([S.home, localCurrency(), S.home === "EUR" ? "USD" : "EUR"])].slice(0, 3);
}

// At the end of Info, folded: what the trip costs, as a summary or as a receipt.
function costsSection(){
  const tr = trip(), lang = getLang();
  const items = costItems(tr).filter(x => !x.skipped);
  const choices = costCurrencies();
  const to = choices.includes(S.ui.costCur) ? S.ui.costCur : S.home;
  const all = sumIn(items, to);
  const approx = all.estimate || all.missing.length ? "≈ " : "";
  const head = items.length ? `<span class="tot">${esc(approx + money(all.value, to, {round: true}))}</span>` : "";
  let body = "";
  if(S.ui.costsOpen){
    const view = S.ui.costView === "receipt" ? "receipt" : "sum";
    const seg = (attr, list, cur, label) => `<div class="seg" role="group" aria-label="${esc(label)}">${list.map(([id, name]) => `<button type="button" ${attr}="${esc(id)}" aria-pressed="${id === cur}">${esc(name)}</button>`).join("")}</div>`;
    body = `<div class="costtools">${seg("data-cost-view", [["sum", t("costSummary")], ["receipt", t("costReceipt")]], view, t("costView"))}${seg("data-cost-cur", choices.map(c => [c, c]), to, t("fCurrency"))}</div>` +
      (!items.length ? `<p class="foot">${esc(t("costNone"))}</p>` : view === "sum" ? costSummary(items, to, all) : costReceipt(items, to, all)) +
      `<button type="button" class="btn small" data-expense-add>${esc(t("addExpense"))}</button>` +
      (all.missing.length ? `<p class="foot warnline">${esc(t(S.online ? "costMissingOnline" : "costMissing", {a: all.missing.map(x => money(x.amount, x.currency)).join(" + ")}))}</p>` : "") +
      `<p class="foot">${esc(t("costNote"))}</p>`;
  }
  return `<details class="costs" data-costs${S.ui.costsOpen ? " open" : ""}><summary><span class="h">${esc(t("tripCost"))}</span>${head}<span class="chev">${CHEVRON}</span></summary><div class="costsbody">${body}</div></details>`;
}

// Approximate when any rate is an estimate.
const approxMoney = (r, to, o) => (r.estimate ? "≈ " : "") + money(r.value, to, o);

// The summary: the total, done and still to do, then day by day, by kind of place, and
// the expenses outside the stops (a tap changes one).
function costSummary(items, to, all){
  const tr = trip(), lang = getLang();
  const stops = items.filter(x => x.kind === "stop"), outside = items.filter(x => x.kind === "expense");
  const done = sumIn(items.filter(x => x.done), to), todo = sumIn(items.filter(x => !x.done), to);
  const inStops = sumIn(stops, to), inOutside = sumIn(outside, to);
  // Day by day
  const byDay = tr.days.map((d, i) => {
    const list = stops.filter(x => x.day === i);
    if(!list.length) return null;
    const sum = sumIn(list, to), curs = [...new Set(list.map(x => x.currency))];
    const own = curs.length === 1 && curs[0] !== to ? money(list.reduce((a, x) => a + x.amount, 0), curs[0]) : "";
    return {d, i, sum, own};
  }).filter(x => x && x.sum.value > 0);
  const max = Math.max(1, ...byDay.map(x => x.sum.value));
  const days = byDay.map(x => `<a class="crow" href="#day-${x.i + 1}" style="--c:${cityVar(x.d.city)}"><span class="n">${x.i + 1}</span>` +
    `<span class="w"><b>${esc(x.d.city || dateParts(x.d.date, lang).long)}<small>${esc(dateParts(x.d.date, lang).short)}</small></b><span class="bar"><i style="width:${(x.sum.value / max * 100).toFixed(1)}%"></i></span></span>` +
    `<span class="a">${esc(approxMoney(x.sum, to, {round: true}))}${x.own ? `<small>${esc(x.own)}</small>` : ""}</span></a>`).join("");
  // By kind of place: a stop without one that is a journey counts as getting around.
  const kinds = new Map();
  for(const x of stops){
    const k = x.stop.type || (x.stop.travel ? "travel" : "");
    if(!kinds.has(k)) kinds.set(k, []);
    kinds.get(k).push(x);
  }
  const kindRows = [...kinds].map(([k, list]) => ({k, list, sum: sumIn(list, to)})).filter(x => x.sum.value > 0).sort((a, b) => b.sum.value - a.sum.value);
  const kindName = k => k === "travel" ? t("costTravel") : k && TYPES.includes(k) ? t("type_" + k) : t("type_none");
  const kindIcon = x => x.k === "travel" ? icon(x.list[0].stop.travel, 16) : x.k && TYPES.includes(x.k) ? icon(x.k, 16) : "";
  const kindsHTML = kindRows.map(x => `<div class="crow" style="--c:${x.k && TYPE_COLORS[x.k] ? TYPE_COLORS[x.k] : "var(--muted)"}"><span class="n ic">${kindIcon(x)}</span>` +
    `<span class="w"><b>${esc(kindName(x.k))}<small>${esc(x.list.length === 1 ? t("stopsOne") : t("stopsCount", {n: x.list.length}))}</small></b></span>` +
    `<span class="a">${esc(approxMoney(x.sum, to, {round: true}))}<small>${inStops.value ? Math.round(x.sum.value / inStops.value * 100) : 0}%</small></span></div>`).join("");
  // Outside the stops
  const outsideHTML = outside.map(x => {
    const c = conv(x.amount, x.currency, to, x.date);
    const sub = [x.expense.date ? dateParts(x.expense.date, lang).short : "", x.currency !== to ? money(x.amount, x.currency) : ""].filter(Boolean).join(" · ");
    return `<button type="button" class="crow" data-expense="${esc(x.expense.id)}" style="--c:var(--muted)"><span class="n ic">${esc(symbolOf(x.currency, lang))}</span>` +
      `<span class="w"><b>${esc(x.expense.title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>` +
      `<span class="a">${c ? esc(approxMoney(c, to, {round: true})) : esc(money(x.amount, x.currency))}</span></button>`;
  }).join("");
  const total = all.value || 1;
  return `<div class="chero">
      <span class="lab">${esc(t("costTotal"))}</span>
      <span class="big">${esc((all.estimate || all.missing.length ? "≈ " : "") + money(all.value, to, {round: true}))}</span>
      <span class="sub">${esc([stops.length ? t("costInStops", {a: money(inStops.value, to, {round: true})}) : "", outside.length ? t("costOutside", {a: money(inOutside.value, to, {round: true})}) : ""].filter(Boolean).join(" · "))}</span>
      <span class="split" aria-hidden="true"><i class="done" style="flex:${done.value}"></i><i class="todo" style="flex:${Math.max(todo.value, todo.value ? total * .03 : 0)}"></i></span>
      <span class="legend"><span><i class="done"></i>${esc(t("costDone"))} <b>${esc(approxMoney(done, to, {round: true}))}</b></span><span><i class="todo"></i>${esc(t("costTodo"))} <b>${esc(approxMoney(todo, to, {round: true}))}</b></span></span>
    </div>` +
    (days ? `<h3 class="ch">${esc(t("costByDay"))}</h3><div class="clist">${days}</div>` : "") +
    (kindsHTML ? `<h3 class="ch">${esc(t("costByKind"))}</h3><div class="clist">${kindsHTML}</div>` : "") +
    (outsideHTML ? `<h3 class="ch">${esc(t("costOutsideTitle"))}</h3><div class="clist">${outsideHTML}</div>` : "");
}

// The receipt: every cost in a column, day by day, with the rate of the day.
function costReceipt(items, to, all){
  const tr = trip(), lang = getLang();
  const line = (name, amount, cls = "") => `<div class="ln${cls}"><span class="t">${esc(name)}</span><span class="f"></span><span>${esc(amount)}</span></div>`;
  let html = "";
  tr.days.forEach((d, i) => {
    const list = items.filter(x => x.kind === "stop" && x.day === i);
    if(!list.length) return;
    const p = dateParts(d.date, lang);
    html += `<div class="dy" style="--c:${cityVar(d.city)}"><b>${i + 1}</b> · ${esc(p.short)}${d.city ? " · " + esc(d.city) : ""}</div>`;
    html += list.map(x => line(x.stop.title, x.amount === 0 ? t("free") : money(x.amount, x.currency))).join("");
    const curs = [...new Set(list.map(x => x.currency))];
    const sum = sumIn(list, to);
    if(curs.length === 1 && curs[0] !== to){
      const c = conv(1, to, curs[0], d.date);
      html += line(c ? `${c.estimate ? t("rateGuess") + " " : ""}1 ${symbolOf(to, lang)} = ${formatRate(c.value, lang)} ${symbolOf(curs[0], lang)}` : "", sum.missing.length ? "" : approxMoney(sum, to), " sub");
    }else if(curs.length > 1 || sum.missing.length) html += line("", approxMoney(sum, to), " sub");
  });
  const outside = items.filter(x => x.kind === "expense");
  if(outside.length){
    html += `<div class="dy">${esc(t("costOutsideTitle"))}</div>`;
    for(const x of outside){
      html += line(x.expense.title, money(x.amount, x.currency));
      if(x.currency !== to){ const c = conv(x.amount, x.currency, to, x.date); if(c) html += line("", approxMoney(c, to), " sub"); }
    }
  }
  const todo = sumIn(items.filter(x => !x.done), to);
  const first = dateParts(tr.days[0].date, lang).short, last = dateParts(tr.days[tr.days.length - 1].date, lang).short;
  return `<div class="receipt"><div class="hd"><b>${esc(tr.title)}</b>${esc(first === last ? first : first + " – " + last)}</div>${html}` +
    `<div class="tot"><span>${esc(t("costTotal"))}</span><span>${esc((all.estimate || all.missing.length ? "≈ " : "") + money(all.value, to))}</span></div>` +
    (todo.value ? line(t("costTodoOf"), approxMoney(todo, to), " sub") : "") + `</div>`;
}

function effectiveView(){
  return S.ui.mapView === "schema" || !S.online ? "schema" : "live";
}

function mapPanel(zs, color, view, gone, paint){
  const zoneLink = z => `<a class="maplink" href="${esc(z.pts.length < 2 ? mapsUrl(z.pts[0].q) : routeUrl(z))}" target="_blank" rel="noopener">${esc(z.pts.length < 2 ? t("mapLink") : t("openInMaps"))}</a>`;
  const zoneTitle = z => zs.length > 1 ? z.pts[0].name : t("stopsOfDay");
  const views = [["live", t("viewLive")], ["schema", t("viewSchema")]];

  let o = `<section class="mapbox" style="--c:${color}" aria-label="${esc(t("dayMap"))}">`;
  o += `<div class="maptools"><div class="seg" role="group" aria-label="${esc(t("mapType"))}">${views.map(([id, name]) => `<button type="button" data-view="${id}" aria-pressed="${id === view}">${esc(name)}</button>`).join("")}</div>` +
    `<button type="button" class="chipbtn" data-route aria-pressed="${S.ui.route}">${esc(t("routeLines"))}</button></div>`;
  if(!S.online && S.ui.mapView === "live") o += `<p class="off">${esc(t("offlineMap"))}</p>`;

  if(view === "live"){
    o += `<div class="livewrap">`;
    if(zs.length > 1) o += `<div class="zchips">${zs.map((z, i) => `<button type="button" class="zchip" data-fit="${i}">${esc(zoneTitle(z))}</button>`).join("")}</div>`;
    o += `<div id="live-slot"></div>`;
    o += zs.map(z => `<p class="off"><span>${esc(zoneTitle(z))}</span>${zoneLink(z)}</p>`).join("");
    o += `</div>`;
    return o + `<p class="foot">${esc(t("footLive"))}</p></section>`;
  }

  zs.forEach(z => {
    if(z.enter && z.enter.travel){
      o += `<p class="off move${gone(z.enter.idx) ? " gone" : ""}"><span class="tvchip">${icon(z.enter.travel, 16)}</span><span>${esc(t("travel_" + z.enter.travel))} · ${esc(z.enter.from.name)} → ${esc(zoneTitle(z))}</span></p>`;
    }
    if(z.pts.length < 2){
      o += `<p class="off"><span class="mb" style="--pf:${paint.pin(z.pts[0])}">${z.pts[0].nums.join("·")}</span><span>${esc(z.pts[0].name)} · ${esc(t("offSketch"))}</span>${zoneLink(z)}</p>`;
      return;
    }
    const head = `<div class="zhead"><span class="zname">${esc(zoneTitle(z))}</span>${zoneLink(z)}</div>`;
    o += `<div class="zone">${head}${zoneSVG(z, zoneTitle(z), gone, S.ui.route, paint)}<ol class="mlegend">${z.pts.map(p => `<li><span class="mb" style="--pf:${paint.pin(p)}">${p.nums.join("·")}</span><a href="${esc(mapsUrl(p.q))}" target="_blank" rel="noopener">${esc(p.name)}</a></li>`).join("")}</ol></div>`;
  });
  return o + `<p class="foot">${esc(t("footSketch") + " " + t("footNumbers"))}</p></section>`;
}

const stopKey = (day, planId, s, i) => `${day.date}|${planId || ""}|${s.id || "#" + i}`;

const isOpen = id => S.openStops.has(id) ? S.openStops.get(id) : S.ui.expandAll;

// An icon with its name for screen readers, for a value of TRAVEL or TYPES. Values the
// app does not know (a newer file) get none.
function chip(kind, value){
  const known = kind === "travel" ? TRAVEL : TYPES;
  if(!known.includes(value)) return "";
  const name = esc(t(kind + "_" + value));
  const hue = kind === "type" ? ` style="color:${TYPE_COLORS[value]}"` : "";
  return `<span class="${kind === "travel" ? "tvchip" : "tychip"}"${hue} role="img" aria-label="${name}" title="${name}">${icon(value, kind === "travel" ? 16 : 15)}</span>`;
}

// Where the traveller comes from to reach the stop at `k` of a day's list: the stop
// before it that has a place and is not skipped; for the first one, where the night
// before was spent (the day before's stay, when it is a place), or else the last place
// of the day before. "" when there is none: directions then start from the phone.
function comingFrom(dayIndex, list, k, skipped){
  for(let j = k - 1; j >= 0; j--){ if(skipped(j)) continue; const q = placeQuery(list[j]); if(q) return q; }
  const prev = trip().days[dayIndex - 1];
  if(!prev) return "";
  if(prev.stay && typeof prev.stay === "object") return prev.stay.address || prev.stay.name;
  const plan = prev.plans ? (prev.plans.find(p => p.id === S.state.plans[prev.date]) || prev.plans[0]) : null;
  const before = plan ? plan.stops : prev.stops;
  for(let j = before.length - 1; j >= 0; j--){
    const key = stopKey(prev, plan ? plan.id : null, before[j], j);
    if(!S.state.done[key] && S.state.skipped[key]) continue;
    const q = placeQuery(before[j]);
    if(q) return q;
  }
  return "";
}

/* ---------- money ---------- */

// The currency of a place, when the trip does not say: from where its stops are.
const REGION_CURRENCY = {jp: "JPY", kr: "KRW", na: "USD", eu: "EUR"};
function localCurrency(){
  const tr = trip();
  if(tr.currency) return tr.currency;
  const here = tr.days.flatMap(d => d.plans ? d.plans.flatMap(p => p.stops) : d.stops).find(s => s.lat !== undefined);
  return REGION_CURRENCY[regionOf(here || {}, tr.timezone)] || S.home;
}
// A stop's or an expense's currency.
const costCurrency = x => x.currency || localCurrency();
const tripToday = () => todayIn(trip().timezone) || new Date().toISOString().slice(0, 10);
const money = (amount, currency, o) => formatMoney(amount, currency, getLang(), o);
const shortDay = date => new Intl.DateTimeFormat(getLang(), {day: "numeric", month: "short", timeZone: "UTC"}).format(new Date(date + "T12:00:00Z"));

// Rates are asked for a month at a time, only when a cost on screen needs them, and
// only once while the app is open (again after a failure, when back online).
const ratesAsked = new Set();
let ratesWanted = new Set(), ratesTimer = 0, ratesListener = null;
function conv(amount, from, to, date){
  const today = tripToday();
  const c = convert(amount, from, to, date, S.rates, today);
  if(!c) for(const m of monthsFor([date], today)) if(!ratesAsked.has(m)) ratesWanted.add(m);
  return c;
}
function askRates(){
  if(!ratesWanted.size || !S.online || ratesTimer) return;
  ratesTimer = setTimeout(async () => {
    const months = [...ratesWanted];
    ratesWanted = new Set();
    let got = false;
    for(const m of months){
      if(ratesAsked.has(m)) continue;
      ratesAsked.add(m);
      try{ Object.assign(S.rates, await fetchMonth(m)); got = true; }
      catch(e){ ratesFailed.add(m); }
    }
    ratesTimer = 0;
    if(got){ renderKeepingFocus(); if(ratesListener) ratesListener(); }
  }, 30);
}
const ratesFailed = new Set();
function retryRates(){ for(const m of ratesFailed) ratesAsked.delete(m); ratesFailed.clear(); }

// The rates kept on the phone for the trip's costs; the months not over yet are asked
// for again once, for today's rate.
async function loadRates(){
  S.rates = {};
  if(!trip()) return;
  const {rates, stale} = await keptRates(monthsFor(costItems(trip()).map(x => x.date), tripToday()));
  S.rates = rates;
  for(const m of stale) ratesWanted.add(m);
}

// The sum of some costs in a currency, converted on their days.
function sumIn(items, to){
  let value = 0, estimate = false;
  const missing = new Map();
  for(const x of items){
    const c = conv(x.amount, x.currency, to, x.date);
    if(c){ value += c.value; estimate = estimate || c.estimate; }
    else missing.set(x.currency, (missing.get(x.currency) || 0) + x.amount);
  }
  return {value, estimate, missing: [...missing].map(([currency, amount]) => ({amount, currency}))};
}

/**
 * Every cost of the trip: the stops of the plan chosen for each day, then the expenses
 * outside the stops. done: a stop ticked, or an expense paid by today; skipped stops
 * are marked, and left out of every sum.
 */
function costItems(tr){
  const items = [];
  tr.days.forEach((d, i) => {
    const plan = d.plans ? (d.plans.find(p => p.id === S.state.plans[d.date]) || d.plans[0]) : null;
    (plan ? plan.stops : d.stops).forEach((s, k) => {
      if(typeof s.cost !== "number") return;
      const key = stopKey(d, plan ? plan.id : null, s, k);
      const done = !!S.state.done[key];
      items.push({kind: "stop", day: i, date: d.date, stop: s, amount: s.cost, currency: costCurrency(s), done, skipped: !done && !!S.state.skipped[key]});
    });
  });
  const first = tr.days[0].date, today = tripToday();
  for(const x of tr.expenses || []){
    if(typeof x.cost !== "number") continue;
    const date = x.date || first;
    items.push({kind: "expense", expense: x, date, amount: x.cost, currency: costCurrency(x), done: date <= today, skipped: false});
  }
  return items;
}

// What the form needs to write a cost and show what it makes at home.
function moneyOptions(){
  return {local: localCurrency(), home: S.home,
    convert: (amount, currency, date) => { const c = conv(amount, currency, S.home, date); askRates(); return c; },
    onRates: fn => { ratesListener = fn; }};
}

// The cost in the margin of a stop: small, in the currency it is paid in.
const costShort = s => s.cost === 0 ? t("free") : money(s.cost, costCurrency(s), {compact: true});

// The last line of an opened stop: its cost, and with one more tap what it makes at home.
function costRow(s, id, date){
  const cur = costCurrency(s), lang = getLang();
  const amount = s.cost === 0 ? t("free") : money(s.cost, cur);
  if(s.cost === 0 || cur === S.home) return `<div class="costrow"><span class="costbtn"><span class="l">${esc(t("cost"))}</span><span class="y">${esc(amount)}</span></span></div>`;
  const shown = S.openCosts.has(id);
  let rate = "";
  if(shown){
    const c = conv(s.cost, cur, S.home, date);
    rate = c
      ? `<p class="rate"><b>${c.estimate ? "≈" : "="} ${esc(money(c.value, S.home))}</b><span>${esc(t(c.estimate ? "rateEstimateFull" : "rateOfFull", {d: shortDay(c.on), r: `1 ${symbolOf(S.home, lang)} = ${formatRate(c.rate, lang)} ${symbolOf(cur, lang)}`}))}</span></p>`
      : `<p class="rate">${esc(t(S.online ? "rateLoading" : "rateOffline", {c: S.home}))}</p>`;
  }
  return `<div class="costrow"><button type="button" class="costbtn" data-cost-rate="${esc(id)}" aria-expanded="${shown}" aria-label="${esc(t("costIn", {c: S.home}))}"><span class="l">${esc(t("cost"))}</span><span class="y">${esc(amount)}</span><span class="to">${esc(symbolOf(S.home, lang))}<span class="chev">${CHEVRON}</span></span></button>${rate}</div>`;
}

// The day's total, by its progress: in the currency of its costs, and what it makes at home.
function dayTotal(items){
  const paid = items.filter(x => !x.skipped);
  const sum = paid.reduce((a, x) => a + x.amount, 0);
  if(!paid.length || !sum) return "";
  const curs = [...new Set(paid.map(x => x.currency))];
  const home = sumIn(paid, S.home);
  const homeText = home.missing.length ? "" : (home.estimate ? "≈ " : "") + money(home.value, S.home, {round: true});
  if(curs.length === 1){
    const own = money(sum, curs[0], {compact: true});
    return ` · <span class="daycost"><b>${esc(own)}</b>${curs[0] !== S.home && homeText ? " · " + esc(homeText) : ""}</span>`;
  }
  return homeText ? ` · <span class="daycost"><b>${esc(homeText)}</b></span>` : "";
}

function stopsHTML(day, planId, list, parts, paint){
  const dayIndex = trip().days.indexOf(day);
  const skippedAt = j => { const k = stopKey(day, planId, list[j], j); return !S.state.done[k] && !!S.state.skipped[k]; };
  return `<ol class="stops" style="--c:${cityVar(day.city)}">` + list.map((s, i) => {
    const id = stopKey(day, planId, s, i);
    const isDone = !!S.state.done[id], isSkipped = !isDone && !!S.state.skipped[id], open = isOpen(id);
    const q = placeQuery(s);
    // Left column: when, where on the map, how you get there.
    const dark = parts && parts[i] === "night" ? `<span class="nightmark" role="img" aria-label="${esc(t("afterDark"))}" title="${esc(t("afterDark"))}">${icon("moon", 13)}</span>` : "";
    // The cost, small, under them: in the currency it is paid in.
    const hasCost = typeof s.cost === "number";
    const left = `<div class="time"><span>${esc(s.time || "")}${dark}</span>${s.lat !== undefined ? `<span class="nb" data-pin="${i}" style="--pf:${paint.stop(s.type, i)}">${i + 1}</span>` : ""}${chip("travel", s.travel)}${hasCost ? `<span class="cost">${esc(costShort(s))}</span>` : ""}</div>`;
    // Middle: a label above the title, the title with its kind, the description that folds, the links.
    // The name as on the sign, under the title, in its own language (for the glyphs).
    const lang = s.local ? localLang(s.local, regionOf(s, trip().timezone)) : "";
    const titleRow = `<div class="h"><h3>${chip("type", s.type)}${esc(s.title)}</h3>${s.text || hasCost ? `<span class="chev">${CHEVRON}</span>` : ""}</div>` +
      (s.local ? `<p class="local"${lang ? ` lang="${lang}"` : ""}>${esc(s.local)}</p>` : "");
    // Opened, a stop shows all its description, and its cost as the last line.
    const head = s.text || hasCost
      ? `<div class="tap" role="button" tabindex="0" data-open="${esc(id)}" aria-expanded="${open}">${titleRow}${s.text ? `<p class="desc${open ? "" : " clamp"}">${rich(s.text)}</p>` : ""}</div>`
      : titleRow;
    // What could leave the traveller at a closed door, while the stop is still ahead.
    const closed = closedOn(s, day.date);
    const notices = isDone || isSkipped ? "" : [
      s.booking === "required" ? ["warn", t("bookingRequired")] : s.booking === "advised" ? ["soft", t("bookingAdvised")] : null,
      closed ? ["warn", closed.date ? t("closedDate") : t("closedWeekday", {d: weekdayName(closed.weekday, getLang())})] : null
    ].filter(Boolean).map(([k, x]) => `<p class="notice ${k}"><span class="ic" aria-hidden="true">!</span><span>${esc(x)}</span></p>`).join("");
    // Map and Directions, and for a place to eat the review site of that part of the world.
    const review = reviewSite(s, {city: day.city, timezone: trip().timezone, lang: getLang()});
    const links = (q || s.link ? `<a class="maplink" href="${esc(s.link || mapsUrl(q))}" target="_blank" rel="noopener">${esc(t("mapLink"))}</a>` : "") +
      (q ? `<a class="maplink" href="${esc(dirUrl(q, comingFrom(dayIndex, list, i, skippedAt)))}" target="_blank" rel="noopener">${esc(t("routeLink"))}</a>` : "") +
      (review ? `<a class="maplink" href="${esc(review.url)}" target="_blank" rel="noopener" aria-label="${esc(t("reviewsOn", {s: review.site}))}">${esc(review.site)}</a>` : "");
    const booked = s.booking === "booked" ? `<span class="tag ok">${esc(t("booked"))}</span>` : "";
    const meta = isSkipped || links || booked ? `<div class="meta">${isSkipped ? `<span class="tag off">${esc(t("skipped"))}</span>` : ""}${booked}${links}</div>` : "";
    const eyebrow = s.tag ? `<span class="eyebrow">${esc(s.tag)}</span>` : "";
    // Right: the tick, and the ⋯ menu with the actions used less often.
    const menuOpen = S.menuFor === id;
    const items = (s.id ? `<button type="button" role="menuitem" data-edit="${esc(s.id)}">${esc(t("editStop"))}</button>` : "") +
      (isDone ? "" : `<button type="button" role="menuitem" data-skip="${esc(id)}" aria-pressed="${isSkipped}">${esc(t(isSkipped ? "unskip" : "skip"))}</button>`);
    const side = `<div class="side"><button class="tick" type="button" data-tick="${esc(id)}" aria-pressed="${isDone}" aria-label="${esc(t(isDone ? "markUndone" : "markDone"))}: ${esc(s.title)}">${CHECK}</button>` +
      (items ? `<button class="more" type="button" data-more="${esc(id)}" aria-haspopup="menu" aria-expanded="${menuOpen}" aria-label="${esc(t("moreActions"))}: ${esc(s.title)}">${DOTS}</button>` +
        `<div class="menu" role="menu"${menuOpen ? "" : " hidden"}>${items}</div>` : "") + `</div>`;
    const cost = hasCost && open ? costRow(s, id, day.date) : "";
    return `<li class="stop${isDone ? " done" : ""}${isSkipped ? " skipped" : ""}${open ? " open" : ""}${hasCost ? " has-cost" : ""}">${left}<div class="body">${eyebrow}${head}${notices}${meta}${cost}</div>${side}</li>`;
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
  const color = cityVar(d.city);
  const prev = tr.days[i - 1], next = tr.days[i + 1];
  const plan = d.plans ? (d.plans.find(p => p.id === S.state.plans[d.date]) || d.plans[0]) : null;
  const list = plan ? plan.stops : d.stops;
  const pid = plan ? plan.id : null;
  const keys = list.map((s, k) => stopKey(d, pid, s, k));
  const doneCount = keys.filter(k => S.state.done[k]).length;
  const skipCount = keys.filter(k => !S.state.done[k] && S.state.skipped[k]).length;
  // For the map: is the stop at this position in the list done or skipped?
  const gone = k => !!(S.state.done[keys[k]] || S.state.skipped[keys[k]]);
  const isSkipped = k => !S.state.done[keys[k]] && !!S.state.skipped[keys[k]];
  const anyText = list.some(s => s.text || typeof s.cost === "number");
  const costsToday = costItems(tr).filter(x => x.kind === "stop" && x.day === i);
  const stay = stayOf(d.stay);
  const zs = zonesOf(list, isSkipped);
  // What the cards on the map add to a pin: the name as on the sign, directions from
  // the stop before, and the review site for a place to eat.
  for(const z of zs) for(const pt of z.pts){
    const k = pt.items[0].idx, s = list[k];
    if(pt.q) pt.dir = dirUrl(pt.q, comingFrom(i, list, k, isSkipped));
    pt.review = reviewSite(s, {city: d.city, timezone: tr.timezone, lang});
    if(s.local){ pt.local = s.local; pt.lang = localLang(s.local, regionOf(s, tr.timezone)); }
  }
  const view = effectiveView();
  // Sunrise and sunset where the day is (its first stop with a position), and so the
  // part of the day of each stop: it shades the maps and marks the stops after dark.
  const here = list.find(s => s.lat !== undefined);
  const light = here ? daylight(d.date, here.lat, here.lng, tr.timezone) : null;
  const parts = partsOfDay(list, light, clockMinutes);
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  // The colours of this day's pins, lines and numbers (js/geo.js).
  const paint = painter(cityColor(d.city), parts);
  const dp = dateParts(d.date, lang), ti = todayIndex();
  // The sign at the top: the city, and where the day starts when that is another one.
  const city = d.city || "";
  const from = prev && prev.city && city && prev.city !== city ? prev.city : "";
  const sign = `<div class="kanji">${esc(city || dp.long)}</div>${from ? `<div class="romaji">${esc(from + " → " + city)}</div>` : ""}`;
  const neighbor = (x, k, cls) => {
    const p = dateParts(x.date, lang), name = x.city ? " · " + esc(x.city) : "";
    return cls
      ? `<a class="next" href="#day-${k + 1}">${esc(p.dow)} <b>${k + 1}</b>${name} →</a>`
      : `<a href="#day-${k + 1}">← <b>${k + 1}</b> ${esc(p.dow)}${name}</a>`;
  };

  let html = `
  <section class="sign" style="--c:${color}" aria-label="${esc(t("day"))} ${i + 1}">
    <div class="sign-top">
      <div>${sign}</div>
      <div class="dayno"><div class="g">${esc(t("day"))} ${i + 1}${i === ti ? " · " + esc(t("today")) : ""}</div><div class="d">${esc(dp.long)}</div>${light ? `<div class="sun" role="img" aria-label="${esc(t("sunTimes", {r: hhmm(light.sunrise), s: hhmm(light.sunset)}))}">${icon("sun", 13)}<span>${hhmm(light.sunrise)}–${hhmm(light.sunset)}</span></div>` : ""}</div>
    </div>
    <div class="band"></div>
    <div class="neighbors">
      ${prev ? neighbor(prev, i - 1, false) : `<span>${esc(t("arrival"))}</span>`}
      ${next ? neighbor(next, i + 1, true) : `<a class="next" href="#info">${esc(t("info"))} →</a>`}
    </div>
  </section>
  <div class="headrow">
    ${d.title ? `<h1>${esc(d.title)}</h1>` : ""}
    <div class="sleep">${stay ? `<span>${esc(t("night"))} · <b>${esc(stay.name)}</b></span>${typeof d.stay === "object" ? `<a class="maplink" href="${esc(mapsUrl(stay.address || stay.name))}" target="_blank" rel="noopener">${esc(t("mapLink"))}</a>` : ""}` : ""}<span class="progress">${esc(t("doneCount", {a: doneCount, b: list.length}))}${skipCount ? " · " + esc(skipCount === 1 ? t("skippedOne") : t("skippedCount", {n: skipCount})) : ""}${dayTotal(costsToday)}</span></div>
    <div class="tools">${
      (zs.length ? `<button type="button" class="mapbtn" data-map aria-expanded="${S.ui.mapOpen}">${esc(t(S.ui.mapOpen ? "mapClose" : "mapOpen"))}</button>` : "") +
      (anyText ? `<button type="button" class="iconbtn" data-expand aria-pressed="${S.ui.expandAll}" aria-label="${esc(t(S.ui.expandAll ? "collapseAll" : "expandAll"))}" title="${esc(t(S.ui.expandAll ? "collapseAll" : "expandAll"))}">${S.ui.expandAll ? FOLD : UNFOLD}</button>` : "") +
      // The day's own ⋯ menu: change the day, or add one after the last.
      `<span class="daymore"><button type="button" class="iconbtn" data-more="day" aria-haspopup="menu" aria-expanded="${S.menuFor === "day"}" aria-label="${esc(t("dayActions"))}" title="${esc(t("dayActions"))}">${DOTS}</button>` +
      `<div class="menu" role="menu"${S.menuFor === "day" ? "" : " hidden"}><button type="button" role="menuitem" data-day-edit>${esc(t("editDay"))}</button><button type="button" role="menuitem" data-day-add>${esc(t("addDay"))}</button></div></span>`
    }</div>
  </div>`;

  let wanted = null;
  if(S.ui.mapOpen && zs.length){
    html += mapPanel(zs, color, view, gone, paint);
    const dark = isDark();
    // Skipping a stop changes the route: the map is drawn again.
    const skippedNow = list.map((s, k) => isSkipped(k) ? k : -1).filter(k => k >= 0).join(",");
    // The lines are not in the key: hiding them keeps the map, its zoom and its place.
    if(view === "live") wanted = {key: [S.rec.id, S.rec.trip.version.id, i, pid || "", googleKey(), lang, dark, skippedNow].join("|"), zones: zs, color: cityColor(d.city), dark, gone, paint};
  }
  if(d.notes) html += d.notes.map(r => `<div class="remind"><span class="ic" aria-hidden="true">!</span><div>${rich(r)}</div></div>`).join("");
  if(d.plans){
    html += `<div class="seg" role="group" aria-label="${esc(t("choosePlan"))}">` + d.plans.map(p =>
      `<button type="button" data-plan="${esc(p.id)}" aria-pressed="${p.id === pid}">${esc(p.name)}</button>`).join("") + `</div>`;
  }
  html += stopsHTML(d, pid, list, light ? parts : null, paint);
  html += `<p class="foot dayfoot">${esc(t("footDay"))}</p>`;
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
    live = {key: wanted.key, handle: createLiveMap({zones: wanted.zones, color: wanted.color, googleKey: googleKey(), dark: wanted.dark, route: S.ui.route, paint: wanted.paint, onNotice: k => toast(t(k))})};
  }
  slot.appendChild(live.handle.el);
  live.handle.refresh();
  live.handle.setMarks(wanted.gone);
  live.handle.setRoute(S.ui.route);
}

// The buttons at the bottom right: Paste on every page of an open trip, + on a day.
const $fabs = document.createElement("div");
$fabs.className = "fabs";
$fabs.hidden = true;
$fabs.innerHTML = `<button type="button" class="fab-paste">${CLIP}<span></span></button><button type="button" class="fab">${PLUS}</button>`;
document.body.appendChild($fabs);
const $fab = $fabs.querySelector(".fab"), $fabPaste = $fabs.querySelector(".fab-paste");
$fab.addEventListener("click", () => newStop());
$fabPaste.addEventListener("click", () => pasteAnything());

function render(){
  const r = route();
  renderStrip(r);
  $fabs.hidden = r.name === "welcome";
  $fab.hidden = r.name !== "day";
  $fab.setAttribute("aria-label", t("addStop"));
  $fab.title = t("addStop");
  $fabPaste.querySelector("span").textContent = t("paste");
  $fabPaste.title = t("pasteAnyHelp");
  $fabPaste.setAttribute("aria-label", t("paste"));
  document.body.classList.toggle("has-fab", !$fabs.hidden);
  // While the page is rebuilt the interactive map is out of it, and the page is shorter
  // by its height: a browser that lays the page out in that moment pulls the scroll up
  // (a tap on ⋯ or Edit under an open map jumped by the map's height). The page keeps
  // its height until the map is back.
  const y = scrollTop();
  $app.style.minHeight = $app.offsetHeight + "px";
  if(live) live.handle.el.remove(); // keep the map alive while the page is rebuilt
  let wanted = null;
  if(r.name === "welcome") $app.innerHTML = renderWelcome();
  else if(r.name === "trips") $app.innerHTML = renderTrips();
  else if(r.name === "info") $app.innerHTML = renderInfo();
  else { const out = renderDay(r.i); $app.innerHTML = out.html; wanted = out.wanted; }
  syncLive(wanted);
  markCut();
  $app.style.minHeight = "";
  if(scrollTop() !== y) scrollToY(y);
  markFabs();
  askRates();
}

// The page drawn again by itself (rates arrived): what had the focus keeps it.
function renderKeepingFocus(){
  const a = document.activeElement;
  let sel = null;
  if(a && a !== document.body && $app.contains(a)){
    if(a.id) sel = "#" + CSS.escape(a.id);
    else{
      const attr = a.getAttributeNames().find(n => n.startsWith("data-"));
      if(attr) sel = `[${attr}="${CSS.escape(a.getAttribute(attr))}"]`;
    }
  }
  render();
  if(sel) refocus(sel);
}

/* ---------- events ---------- */

function refocus(selector){
  const el = document.querySelector(selector);
  if(el) el.focus({preventScroll: true});
}

$app.addEventListener("click", e => {
  // Any tap outside the open ⋯ menu closes it first (its own button toggles it below).
  if(S.menuFor && !e.target.closest(".menu") && !e.target.closest("[data-more]")) hideMenu();
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
    S.menuFor = null;
    if(S.state.skipped[id]) delete S.state.skipped[id]; else S.state.skipped[id] = 1;
    saveState();
    render();
    refocus(`[data-skip="${CSS.escape(id)}"]`);
    return;
  }
  const more = e.target.closest("[data-more]");
  if(more){
    S.menuFor = S.menuFor === more.dataset.more ? null : more.dataset.more;
    render();
    const menu = S.menuFor && document.querySelector(`[data-more="${CSS.escape(S.menuFor)}"] + .menu`);
    if(menu){ placeMenu(menu); menu.querySelector("[role=menuitem]").focus({preventScroll: true}); }
    else refocus(`[data-more="${CSS.escape(more.dataset.more)}"]`);
    return;
  }
  const edit = e.target.closest("[data-edit]");
  if(edit){ S.menuFor = null; render(); editStop(edit.dataset.edit); return; }
  if(e.target.closest("[data-day-edit]")){ S.menuFor = null; render(); editDay(); return; }
  if(e.target.closest("[data-day-add]")){ S.menuFor = null; render(); newStop(undefined, true); return; }
  const rate = e.target.closest("[data-cost-rate]");
  if(rate){
    const id = rate.dataset.costRate;
    if(S.openCosts.has(id)) S.openCosts.delete(id); else S.openCosts.add(id);
    render();
    refocus(`[data-cost-rate="${CSS.escape(id)}"]`);
    return;
  }
  const tap = e.target.closest("[data-open]");
  if(tap){ toggleStop(tap.dataset.open); return; }
  for(const [attr, field] of [["data-cost-view", "costView"], ["data-cost-cur", "costCur"]]){
    const b = e.target.closest(`[${attr}]`);
    if(!b) continue;
    S.ui[field] = b.getAttribute(attr);
    saveUi();
    render();
    refocus(`[${attr}="${CSS.escape(b.getAttribute(attr))}"]`);
    return;
  }
  if(e.target.closest("[data-expense-add]")){ editExpense(null); return; }
  const expense = e.target.closest("[data-expense]");
  if(expense){ editExpense(expense.dataset.expense); return; }
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
  // The lines between the stops on both maps: shown or hidden, remembered.
  if(e.target.closest("[data-route]")){
    S.ui.route = !S.ui.route;
    saveUi();
    render();
    refocus("[data-route]");
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
  else if(a === "paste") pasteTrip();
  else if(a === "copy-errors") copyErrors();
  else if(a === "copy-prompt") copyText(aiMessage(), t("copiedPrompt"));
  else if(a === "copy-prompt-full") copyText(aiMessageFull(), t("copiedPrompt"));
  else if(a === "copy-edit" && S.rec) copyText(aiEditMessage(), t("copiedEdit"));
  else if(a === "demo") loadDemo();
  else if(a === "remove") removeRecord(act.dataset.id);
  else if(a === "save"){ const rec = S.records.find(r => r.id === act.dataset.id); if(rec) saveFile(rec); }
  else if(a === "history") showHistory(act.dataset.id);
  else if(a === "open"){
    const rec = S.records.find(r => r.id === act.dataset.id);
    if(rec) openRecord(rec).then(() => { history.replaceState(null, "", location.pathname + location.search); if(applyMapSettings()) return; render(); scrollToY(0); });
  }
});

// Holding a stop's number shows it on the day's map: the map opens if it is closed and
// the pin comes to the middle, with its card. Only a hold: a tap or a scroll that
// starts on the number does nothing. While the finger is down nothing on the page can
// be selected: a long press would otherwise select the words near the number, and
// leave them selected once the map is open.
let hold = null;
const $root = document.documentElement;
const clearSelection = () => { try{ const sel = getSelection(); if(sel && sel.rangeCount) sel.removeAllRanges(); }catch(e){} };
function endHold(){
  if(!hold) return;
  clearTimeout(hold.timer);
  const fired = hold.fired;
  hold = null;
  // The phone may still select or open its menu as the finger lifts: wait a moment.
  setTimeout(() => { $root.classList.remove("holding"); if(fired) clearSelection(); }, fired ? 400 : 0);
}
$app.addEventListener("pointerdown", e => {
  const nb = e.target.closest("[data-pin]");
  endHold();
  if(!nb || (e.pointerType === "mouse" && e.button !== 0)) return;
  $root.classList.add("holding");
  hold = {x: e.clientX, y: e.clientY, fired: false};
  hold.timer = setTimeout(() => { if(!hold) return; hold.fired = true; clearSelection(); showOnMap(+nb.dataset.pin); }, 450);
});
document.addEventListener("pointermove", e => { if(hold && !hold.fired && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) endHold(); });
for(const type of ["pointerup", "pointercancel"]) document.addEventListener(type, endHold);
// The phone's own menu for a long press (copy, select) would open on top of the map.
document.addEventListener("contextmenu", e => { if($root.classList.contains("holding")) e.preventDefault(); });
document.addEventListener("selectionchange", () => { if(hold && hold.fired) clearSelection(); });

function showOnMap(idx){
  try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){}
  if(!S.ui.mapOpen){ S.ui.mapOpen = true; saveUi(); render(); }
  const box = document.querySelector(".mapbox");
  if(!box) return;
  scrollToY(scrollTop() + box.getBoundingClientRect().top - $strip.offsetHeight - 12);
  if(live && document.getElementById("live-slot")) live.handle.focus(idx);
  // The sketch: its badge for that stop pulses.
  else box.querySelectorAll(".badge").forEach(b => {
    if(!String(b.dataset.idx || "").split(" ").includes(String(idx))) return;
    b.classList.remove("hit"); void b.getBoundingClientRect(); b.classList.add("hit");
  });
}

function toggleStop(id){
  S.openStops.set(id, !isOpen(id));
  render();
  refocus(`[data-open="${CSS.escape(id)}"]`);
}

// The ⋯ menu opens upwards when there is no room below it (the + button is there).
function placeMenu(menu){
  menu.classList.toggle("up", menu.getBoundingClientRect().bottom > window.innerHeight - 76);
}

// Closes the menu where it is, without redrawing the page.
function hideMenu(){
  S.menuFor = null;
  document.querySelectorAll(".menu").forEach(m => { m.hidden = true; });
  document.querySelectorAll("[data-more]").forEach(b => b.setAttribute("aria-expanded", "false"));
}

function closeMenu(){
  const id = S.menuFor;
  hideMenu();
  if(id) refocus(`[data-more="${CSS.escape(id)}"]`);
}

// Menu keys: Escape closes it, arrows move between its items.
document.addEventListener("keydown", e => {
  if(!S.menuFor) return;
  if(e.key === "Escape"){ e.preventDefault(); closeMenu(); return; }
  const items = [...document.querySelectorAll(".menu:not([hidden]) [role=menuitem]")];
  const at = items.indexOf(document.activeElement);
  if(at < 0 || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
  e.preventDefault();
  items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
});

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

// What the trip cost, folded at the end of Info: open or closed, remembered.
$app.addEventListener("toggle", e => {
  if(!e.target.matches || !e.target.matches("[data-costs]") || S.ui.costsOpen === e.target.open) return;
  S.ui.costsOpen = e.target.open;
  saveUi();
  render();
}, true);

$app.addEventListener("change", e => {
  if(e.target.id !== "home-cur") return;
  S.home = e.target.value;
  store.setKV("home", S.home).catch(() => {});
  S.openCosts.clear();
  render();
  refocus("#home-cur");
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

window.addEventListener("hashchange", () => { S.importError = null; S.menuFor = null; render(); scrollToY(0); });
// A tap outside the app's content (the strip of days, the + button) closes the menu.
// The path is the one at the time of the tap: the page may have been redrawn since.
document.addEventListener("click", e => { if(S.menuFor && !e.composedPath().includes($app)) closeMenu(); });
window.addEventListener("resize", markCut);
// When the phone switches between light and dark, maps follow it.
if(darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", () => { if(S.theme === "auto") render(); });
window.addEventListener("online", () => { S.online = true; retryRates(); render(); });
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
    // The browser looks for a new version when the app opens. An app left open in the
    // background is checked again when it comes back, and once an hour while open.
    const check = () => { reg.update().catch(() => {}); };
    document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") check(); });
    setInterval(check, 60 * 60 * 1000);
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

// Android: what is shared to the app (share_target in manifest.webmanifest) is kept by
// the service worker and the app opens with ?shared=1; older installs still send it as
// ?title=…&text=…&url=…. An AI assistant's answer or a .json file with a trip or a list
// of changes is loaded as if pasted; a place shared from Google Maps opens the stop
// form, filled in.
async function takeSharedPlace(){
  const q = new URLSearchParams(location.search);
  let parts = ["title", "text", "url"].map(k => q.get(k)).filter(Boolean);
  if(q.get("shared") === "1"){
    try{
      const box = await caches.open("timp-share");
      const res = await box.match("shared");
      await box.delete("shared");
      const got = res ? await res.json() : {};
      parts = [got.title, got.text, got.url, got.file].filter(x => typeof x === "string" && x.trim());
    }catch(e){ parts = []; }
  }
  if(!parts.length && q.get("shared") !== "1") return;
  history.replaceState(null, "", location.pathname + location.hash);
  if(!parts.length) return;
  takeText(parts.join("\n"), "shared.json");
}

// What was shared or pasted, wherever it came from: JSON (a trip, or an assistant's
// changes, even with text around it) is loaded; anything else is a place, and opens
// the stop form filled in. The share menu on Android and the Paste button everywhere
// end here, so they behave the same.
async function takeText(text, name){
  const json = jsonIn(text);
  if(json.startsWith("{")){ await importText(json, name); return; }
  if(!trip()){ toast(t("shareNeedsTrip")); return; }
  // The Maps app often repeats the link inside the text: keep each piece once.
  newStop([...new Set(String(text).split("\n").map(s => s.trim()).filter(Boolean))].join("\n"));
}

// The Paste button: the sheet first, then Paste in it reads what was copied into the
// field, where the traveller sees it before going on. The phone asks for permission
// (or shows its own Paste bubble) only then, on a tap meant for it.
function pasteAnything(){
  pasteTrip(true);
}

/* ---------- start ---------- */

async function start(){
  versions = versionStore(await store.backend());
  // 2.0 and 2.1 kept each version as a full copy: move them into pieces, once.
  const legacy = await store.legacyVersions();
  if(legacy.length){
    for(const trip of legacy) await versions.put(trip);
    await store.clearLegacyVersions();
  }
  const [records, activeId, ui, key, lang, useGoogle, home] = await Promise.all([store.listTrips(), store.getKV("active"), store.getKV("ui"), store.getKV("googleKey"), store.getKV("lang"), store.getKV("useGoogle"), store.getKV("home")]);
  if(typeof home === "string" && /^[A-Z]{3}$/.test(home)) S.home = home;
  if(useGoogle === false) S.useGoogle = false;
  if(typeof lang === "string" && LANGS[lang]) S.langPref = lang;
  S.records = (records || []).sort((a, b) => a.importedAt - b.importedAt);
  // Trips saved before versions existed, or in format 1: ids, a version, format 2.
  // A converted trip is a new version made from the old one; ticks follow.
  for(const rec of S.records.filter(r => !r.trip.version || r.trip.format !== FORMAT)){
    const {trip: ready, renamed} = await prepare(rec.trip);
    const saved = await store.getKV("state:" + rec.id);
    if(saved && renamed.length) await store.setKV("state:" + rec.id, moveMarks({done: {}, skipped: {}, plans: {}, ...saved}, renamed));
    Object.assign(rec, {trip: ready, exported: ready.version.id});
    await store.putTrip(rec);
    await versions.put(ready);
  }
  if(ui && typeof ui === "object") S.ui = {mapOpen: !!ui.mapOpen, mapView: ui.mapView === "schema" ? "schema" : "live", expandAll: !!ui.expandAll, route: ui.route !== false,
    costsOpen: !!ui.costsOpen, costView: ui.costView === "receipt" ? "receipt" : "sum", costCur: typeof ui.costCur === "string" ? ui.costCur : ""};
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
