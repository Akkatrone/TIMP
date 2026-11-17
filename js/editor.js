// The form to add or change a stop, in a dialog over the page.
// It only collects the stop: saving, versions and files are the caller's job
// (onSave and onDelete), so the same form serves every way a stop arrives:
// the + button, the Edit link, and a place shared from Google Maps.

import { t, getLang } from "./i18n.js";
import { esc, dateParts } from "./util.js";
import { parseMapsInput, queryOf } from "./gmaps.js";
import { geocode, areaAround, resolveLink } from "./geocode.js";
import { loadLeaflet } from "./livemap.js";
import { icon } from "./icons.js";
import { TRAVEL, TYPES } from "./trip.js";
import { clockMinutes, dayAfter } from "./edit.js";
import { ask } from "./ask.js";

let dialog = null;

function ensureDialog(){
  if(dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.className = "sheet";
  dialog.setAttribute("aria-labelledby", "sheet-title");
  document.body.appendChild(dialog);
  // A tap on the dimmed backdrop closes it, as people expect from a sheet.
  dialog.addEventListener("click", e => { if(e.target === dialog) dialog.close(); });
  return dialog;
}

// "14:05" in the trip's time zone, for a stop added now.
function timeNow(timezone){
  try{
    return new Intl.DateTimeFormat("en-GB", {timeZone: timezone || undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).format(new Date());
  }catch(e){
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
}

// An address worth searching: it has a comma or a number, not just a name.
const looksLikeAddress = s => /,|\d/.test(String(s || ""));

/**
 * Opens the form.
 * @param {object} o
 *   trip, dayIndex, planId     where the stop is, or goes by default
 *   newDay                      true: it goes by default on a new day after the last
 *   stop                        the stop to change (absent: a new stop)
 *   prefill                     text to read as if pasted (a shared place)
 *   timezone, googleKey, dark
 *   onSave({stop, date, plan, newDay})  the stop as filled in, and where it goes;
 *                               newDay ({date, city}) when that day is still to be made
 *   onDelete()                  remove the stop being changed
 */
export function openStopEditor(o){
  const dlg = ensureDialog();
  const editing = !!o.stop;
  const lang = getLang();
  const st = {
    lat: o.stop ? o.stop.lat : undefined,
    lng: o.stop ? o.stop.lng : undefined,
    source: o.stop && o.stop.lat !== undefined ? "kept" : "",
    link: o.stop ? o.stop.link : undefined,
    address: (o.stop && o.stop.address) || "",
    travel: (o.stop && o.stop.travel) || "",
    type: (o.stop && o.stop.type) || "",
    searching: false
  };
  const s0 = o.stop || {};
  // The time: hour and minutes from two lists, or words ("Evening") for a time that is
  // not a clock time. A stop that has words keeps them. Not <input type="time">: Chrome
  // on Android opens its own clock, whose Set button falls off narrow screens.
  const time0 = s0.time || timeNow(o.timezone);
  const clock0 = clockMinutes(time0);
  const two = n => String(n).padStart(2, "0");
  const h0 = clock0 !== null ? Math.floor(clock0 / 60) : 12, m0 = clock0 !== null ? clock0 % 60 : 0;
  // Minutes in steps of five, plus the stop's own minute when it is not one of them.
  const minutes = [...new Set([...Array(12).keys()].map(i => i * 5).concat(m0))].sort((a, b) => a - b);
  const opts = (list, cur) => list.map(n => `<option value="${two(n)}"${n === cur ? " selected" : ""}>${two(n)}</option>`).join("");

  // The days of the trip, and one more after the last: a stop put there makes it (a
  // day cannot be empty). It is in the same city as the last day, until changed.
  const last = o.trip.days[o.trip.days.length - 1];
  const days = [...o.trip.days, {date: dayAfter(last.date), city: last.city, stops: [], isNew: true}];
  const dayIndex = o.newDay ? days.length - 1 : o.dayIndex;
  const dayOptions = days.map((d, i) => {
    const p = dateParts(d.date, lang), when = `${p.dow} ${p.long.split(" ").slice(1).join(" ")}`;
    const label = d.isNew ? t("newDayOption", {d: when})
      : `${t("day")} ${i + 1} · ${when}${d.title || d.city ? " · " + (d.title || d.city) : ""}`;
    return `<option value="${i}"${i === dayIndex ? " selected" : ""}>${esc(label)}</option>`;
  }).join("");

  // A row of buttons to pick one value of TYPES or TRAVEL, or none.
  const choice = (kind, values, label) => `<div class="field">
      <span class="label" id="${kind}-label">${esc(label)}</span>
      <div class="seg wrap" role="radiogroup" aria-labelledby="${kind}-label">
        ${["", ...values].map(m => `<button type="button" role="radio" data-${kind}="${m}" aria-checked="${st[kind] === m}">${icon(m, 16)}<span>${esc(t(m ? `${kind}_${m}` : `${kind}_none`))}</span></button>`).join("")}
      </div>
    </div>`;

  dlg.innerHTML = `
  <form method="dialog" class="sheet-form" novalidate>
    <div class="sheet-head">
      <h2 id="sheet-title">${esc(t(editing ? "editStopTitle" : "newStopTitle"))}</h2>
      <button type="button" class="iconbtn" data-close aria-label="${esc(t("cancel"))}">×</button>
    </div>

    <div class="field">
      <label for="stop-src">${esc(t("fAddress"))}</label>
      <div class="row">
        <textarea id="stop-src" rows="1" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(t("fAddressPh"))}"></textarea>
        <button type="button" class="btn small" data-paste>${esc(t("paste"))}</button>
      </div>
      <p class="foot" data-src-note>${esc(t("fAddressHelp"))}</p>
    </div>

    <div class="field">
      <label for="stop-title">${esc(t("fTitle"))}</label>
      <input id="stop-title" type="text" required value="${esc(s0.title || "")}">
    </div>

    <div class="field two">
      <div class="field">
        <label for="stop-day">${esc(t("fDay"))}</label>
        <select id="stop-day">${dayOptions}</select>
      </div>
      <div class="field">
        <label for="stop-hh" id="stop-time-label">${esc(t("fTime"))}</label>
        <span id="stop-time" class="clock" role="group" aria-labelledby="stop-time-label"${clock0 !== null ? "" : " hidden"}><select id="stop-hh" aria-label="${esc(t("fHour"))}">${opts([...Array(24).keys()], h0)}</select><span aria-hidden="true">:</span><select id="stop-mm" aria-label="${esc(t("fMinute"))}">${opts(minutes, m0)}</select></span>
        <input id="stop-time-words" type="text" autocomplete="off" aria-label="${esc(t("fTime"))}" placeholder="${esc(t("timeWordsPh"))}" value="${clock0 === null ? esc(time0) : ""}"${clock0 === null ? "" : " hidden"}>
        <button type="button" class="linkbtn" data-time-mode>${esc(t(clock0 !== null ? "timeWords" : "timeClock"))}</button>
      </div>
    </div>
    <div class="field" data-plan-field hidden>
      <label for="stop-plan">${esc(t("fPlan"))}</label>
      <select id="stop-plan"></select>
    </div>

    ${choice("type", TYPES, t("fType"))}
    ${choice("travel", TRAVEL, t("fTravel"))}

    <div class="field">
      <label for="stop-text">${esc(t("fText"))}</label>
      <textarea id="stop-text" rows="3">${esc(s0.text || "")}</textarea>
    </div>

    <div class="field">
      <span class="label">${esc(t("fPosition"))}</span>
      <p class="pos" data-pos></p>
      <div class="actions">
        <button type="button" class="btn small" data-find>${esc(t("posSearch"))}</button>
        <button type="button" class="btn small" data-pick aria-expanded="false">${esc(t("posPick"))}</button>
        <button type="button" class="btn small" data-clear-pos>${esc(t("posClear"))}</button>
      </div>
      <div class="pickwrap" data-pick-box hidden>
        <p class="foot">${esc(t("posPickHelp"))}</p>
        <div class="live pick${o.dark ? " dark" : ""}"><div class="msg">${esc(t("mapLoading"))}</div></div>
      </div>
    </div>

    <p class="errbox" data-error role="alert" hidden></p>

    <div class="sheet-actions">
      ${editing ? `<button type="button" class="btn small danger" data-delete>${esc(t("deleteStop"))}</button>` : ""}
      <span class="grow"></span>
      <button type="button" class="btn" data-close>${esc(t("cancel"))}</button>
      <button type="submit" class="btn primary">${esc(t("save"))}</button>
    </div>
  </form>`;

  const $ = sel => dlg.querySelector(sel);
  const form = $("form");

  function fillPlans(){
    const day = days[+$("#stop-day").value];
    const field = $("[data-plan-field]");
    if(!day.plans){ field.hidden = true; return; }
    field.hidden = false;
    const want = +$("#stop-day").value === o.dayIndex ? o.planId : null;
    $("#stop-plan").innerHTML = day.plans.map(p => `<option value="${esc(p.id)}"${p.id === want ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  }

  function showPos(){
    const has = st.lat !== undefined;
    const label = st.searching ? t("posSearching")
      : has ? `${st.lat.toFixed(5)}, ${st.lng.toFixed(5)}` + (st.source === "link" ? " · " + t("posFromLink") : st.source === "map" ? " · " + t("posFromMap") : st.source === "google" ? " · Google" : st.source === "osm" ? " · OpenStreetMap" : "")
      : t("posNone");
    $("[data-pos]").textContent = label;
    $("[data-pos]").classList.toggle("muted", !has);
    $("[data-clear-pos]").hidden = !has;
    $("[data-find]").disabled = st.searching;
  }

  function note(text){ $("[data-src-note]").textContent = text; }

  function setChoice(kind, value){
    st[kind] = value;
    dlg.querySelectorAll(`[data-${kind}]`).forEach(b => b.setAttribute("aria-checked", String(b.dataset[kind] === value)));
  }

  // Where the trip is: the stops of the chosen day, or of the whole trip.
  function area(){
    const day = days[+$("#stop-day").value];
    const stopsOf = d => d.plans ? d.plans.flatMap(p => p.stops) : d.stops;
    return areaAround(stopsOf(day)) || areaAround(days.flatMap(stopsOf));
  }

  // The source field grows with what is pasted or shared (name, address, link).
  function fitSource(){
    const el = $("#stop-src");
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight + 2, 104) + "px";   // about three lines, then it scrolls
  }

  // A small map to put the pin where it belongs, when the search got it wrong.
  let pick = null;
  async function openPicker(){
    const box = $("[data-pick-box]");
    if(!box.hidden){ closePicker(); return; }
    if(navigator.onLine === false){ note(t("posOffline")); return; }
    box.hidden = false;
    $("[data-pick]").setAttribute("aria-expanded", "true");
    const el = box.querySelector(".live");
    try{
      const L = await loadLeaflet();
      if(box.hidden || !dlg.open) return;
      el.innerHTML = "";
      const a = area();
      const start = st.lat !== undefined ? [st.lat, st.lng] : a ? [(a.south + a.north) / 2, (a.west + a.east) / 2] : [0, 0];
      const map = L.map(el, {zoomControl: true});
      map.attributionControl.setPrefix(false);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
      map.setView(start, st.lat !== undefined ? 17 : a ? 14 : 2);
      const icon = L.divIcon({className: "pinwrap", html: `<span class="pin pickpin">+</span>`, iconSize: [0, 0]});
      const marker = L.marker(start, {icon, draggable: true, keyboard: false}).addTo(map);
      const put = ll => { st.lat = Math.round(ll.lat * 1e5) / 1e5; st.lng = Math.round(ll.lng * 1e5) / 1e5; st.source = "map"; showPos(); };
      marker.on("dragend", () => put(marker.getLatLng()));
      map.on("click", e => { marker.setLatLng(e.latlng); put(e.latlng); });
      pick = {map, marker};
      el.scrollIntoView({block: "nearest", behavior: "smooth"});
    }catch(err){
      el.innerHTML = `<div class="msg">${esc(t("mapFailed"))}</div>`;
    }
  }
  function closePicker(){
    if(pick){ pick.map.remove(); pick = null; }
    const box = $("[data-pick-box]");
    box.hidden = true;
    box.querySelector(".live").innerHTML = `<div class="msg">${esc(t("mapLoading"))}</div>`;
    $("[data-pick]").setAttribute("aria-expanded", "false");
  }
  // A position found or pasted moves the pin on the open map.
  function movePick(){
    if(pick && st.lat !== undefined){ pick.marker.setLatLng([st.lat, st.lng]); pick.map.setView([st.lat, st.lng], Math.max(pick.map.getZoom(), 16)); }
  }

  // What the traveller pasted or typed in the first field.
  let lastRead = null;
  async function readSource(text){
    if(text === lastRead) return;   // the same text, read again on blur: nothing new
    lastRead = text;
    fitSource();
    const r = parseMapsInput(text);
    if(r.link) st.link = r.link;
    // A short link says nothing by itself: the link resolver, when there is one, reads
    // it and answers with name, address, position and kind of place.
    if(r.short){
      st.searching = true; showPos();
      const found = await resolveLink(r.link);
      st.searching = false;
      if(text !== lastRead) return;   // something else was pasted meanwhile
      if(found){
        // Its address has the town, which a shared line ("Via Roma, 3") lacks; a name
        // the traveller shared stays.
        for(const k of ["address", "lat", "lng"]) if(found[k] !== undefined) r[k] = found[k];
        if(found.title && !r.title) r.title = found.title;
        if(found.type && !st.type) setChoice("type", found.type);
      }
    }
    if(r.title && !$("#stop-title").value.trim()) $("#stop-title").value = r.title;
    st.address = r.address || (!r.link && looksLikeAddress(text) && r.lat === undefined ? text.trim() : "");
    if(r.lat !== undefined){ st.lat = r.lat; st.lng = r.lng; st.source = "link"; movePick(); }
    note(r.short && !r.title ? t("shortLinkNote") : t("fAddressHelp"));
    showPos();
    // A position is searched only for something that looks like an address, once.
    if(st.lat === undefined && (st.address || (r.title && r.address))) findPosition();
  }

  async function findPosition(){
    const day = days[+$("#stop-day").value];
    const title = $("#stop-title").value.trim();
    const text = st.address ? queryOf({title, address: st.address}) : [title, day.city].filter(Boolean).join(", ");
    if(!text) return;
    if(navigator.onLine === false){ note(t("posOffline")); return; }
    st.searching = true; showPos();
    // With a name and an address, the address alone is the more reliable search.
    const near = area();
    const hit = (st.address && await geocode(st.address, {googleKey: o.googleKey, lang, near})) || await geocode(text, {googleKey: o.googleKey, lang, near});
    st.searching = false;
    if(hit){
      st.lat = hit.lat; st.lng = hit.lng; st.source = hit.source; movePick();
      if(hit.type && !st.type) setChoice("type", hit.type);
    }
    else note(t("posNotFound"));
    showPos();
  }

  dlg.onclick = async e => {
    if(e.target === dlg) return;
    if(e.target.closest("[data-close]")){ dlg.close(); return; }
    if(e.target.closest("[data-time-mode]")){
      const clock = $("#stop-time"), words = $("#stop-time-words");
      const toWords = !clock.hidden;
      clock.hidden = toWords; words.hidden = !toWords;
      e.target.closest("[data-time-mode]").textContent = t(toWords ? "timeClock" : "timeWords");
      (toWords ? words : $("#stop-hh")).focus();
      return;
    }
    for(const kind of ["type", "travel"]){
      const b = e.target.closest(`[data-${kind}]`);
      if(b){ setChoice(kind, b.dataset[kind]); return; }
    }
    if(e.target.closest("[data-paste]")){
      try{
        const text = await navigator.clipboard.readText();
        $("#stop-src").value = text;
        readSource(text);
      }catch(err){
        note(t("clipboardDenied"));
        $("#stop-src").focus();
      }
      return;
    }
    if(e.target.closest("[data-find]")){ findPosition(); return; }
    if(e.target.closest("[data-pick]")){ openPicker(); return; }
    if(e.target.closest("[data-clear-pos]")){ st.lat = st.lng = undefined; st.source = ""; showPos(); return; }
    if(e.target.closest("[data-delete]")){
      const title = $("#stop-title").value.trim() || s0.title;
      const answer = await ask({title: t("deleteStopTitle"), text: t("deleteStopText", {t: title}),
        actions: [{id: "no", label: t("cancel")}, {id: "yes", label: t("deleteStop"), kind: "danger"}]});
      if(answer !== "yes") return;
      dlg.close();
      o.onDelete();
    }
  };

  $("#stop-src").addEventListener("change", e => readSource(e.target.value));
  $("#stop-src").addEventListener("paste", e => setTimeout(() => readSource(e.target.value), 0));
  $("#stop-src").addEventListener("input", fitSource);
  // Enter reads what was typed, as in a one-line field; Shift+Enter starts a new line.
  $("#stop-src").addEventListener("keydown", e => {
    if(e.key === "Enter" && !e.shiftKey && !e.isComposing){ e.preventDefault(); readSource(e.target.value); }
  });
  dlg.addEventListener("close", closePicker, {once: true});
  $("#stop-day").addEventListener("change", fillPlans);

  form.addEventListener("submit", e => {
    e.preventDefault();
    const title = $("#stop-title").value.trim();
    if(!title){
      const box = $("[data-error]");
      box.textContent = t("titleRequired");
      box.hidden = false;
      $("#stop-title").focus();
      return;
    }
    const day = days[+$("#stop-day").value];
    // What Map and Directions search for: the address, or else the name in its town.
    const address = st.address || (day.city ? `${title}, ${day.city}` : undefined);
    const stop = {
      ...s0,
      time: ($("#stop-time").hidden ? $("#stop-time-words").value.trim() : `${$("#stop-hh").value}:${$("#stop-mm").value}`) || timeNow(o.timezone),
      title,
      type: st.type || undefined,
      travel: st.travel || undefined,
      text: $("#stop-text").value.trim() || undefined,
      address,
      lat: st.lat, lng: st.lng,
      link: st.link
    };
    delete stop.id;
    if(st.lat === undefined){ delete stop.lat; delete stop.lng; }
    dlg.close();
    const newDay = day.isNew ? (day.city ? {date: day.date, city: day.city} : {date: day.date}) : null;
    o.onSave({stop, date: day.date, plan: day.plans ? $("#stop-plan").value : null, newDay});
  });

  fillPlans();
  showPos();
  dlg.showModal();
  if(o.prefill){ $("#stop-src").value = o.prefill; readSource(o.prefill); }
  else if(!editing) $("#stop-src").focus();
}

/**
 * The form to change a day: its city, title, where the night is spent, notes. The
 * date and the stops stay: stops are changed one by one, with their own form.
 * @param {object} o
 *   day                  the day as it is
 *   number               its number in the trip, for the title
 *   canDelete            false for the only day of a trip
 *   onSave(set)          the fields as filled in; an empty one is removed
 *   onDelete()           remove the day and its stops
 */
export function openDayEditor(o){
  const dlg = ensureDialog();
  const d = o.day, lang = getLang();
  const $ = sel => dlg.querySelector(sel);
  const stay = typeof d.stay === "string" ? {name: d.stay} : (d.stay || {});
  const p = dateParts(d.date, lang);
  dlg.innerHTML = `
  <form method="dialog" class="sheet-form" novalidate>
    <div class="sheet-head">
      <h2 id="sheet-title">${esc(t("editDayTitle", {n: o.number}))}</h2>
      <button type="button" class="iconbtn" data-close aria-label="${esc(t("cancel"))}">×</button>
    </div>
    <p class="foot">${esc(p.long)}</p>
    <div class="field">
      <label for="day-city">${esc(t("fCity"))}</label>
      <input id="day-city" type="text" autocomplete="off" value="${esc(d.city || "")}">
    </div>
    <div class="field">
      <label for="day-title">${esc(t("fDayTitle"))}</label>
      <input id="day-title" type="text" autocomplete="off" value="${esc(d.title || "")}">
    </div>
    <div class="field">
      <label for="day-stay">${esc(t("fStay"))}</label>
      <input id="day-stay" type="text" autocomplete="off" placeholder="${esc(t("fStayPh"))}" value="${esc(stay.name || "")}">
    </div>
    <div class="field">
      <label for="day-stay-address">${esc(t("fStayAddress"))}</label>
      <input id="day-stay-address" type="text" autocomplete="off" value="${esc(stay.address || "")}">
    </div>
    <div class="field">
      <label for="day-notes">${esc(t("fNotes"))}</label>
      <textarea id="day-notes" rows="3">${esc((d.notes || []).join("\n"))}</textarea>
      <p class="foot">${esc(t("fNotesHelp"))}</p>
    </div>
    <div class="sheet-actions">
      ${o.canDelete ? `<button type="button" class="btn small danger" data-delete>${esc(t("deleteDay"))}</button>` : ""}
      <span class="grow"></span>
      <button type="button" class="btn" data-close>${esc(t("cancel"))}</button>
      <button type="submit" class="btn primary">${esc(t("save"))}</button>
    </div>
  </form>`;

  dlg.onclick = async e => {
    if(e.target === dlg) return;
    if(e.target.closest("[data-close]")){ dlg.close(); return; }
    if(e.target.closest("[data-delete]")){
      const answer = await ask({title: t("deleteDayTitle"), text: t("deleteDayText", {n: o.number, d: p.long}),
        actions: [{id: "no", label: t("cancel")}, {id: "yes", label: t("deleteDay"), kind: "danger"}]});
      if(answer !== "yes") return;
      dlg.close();
      o.onDelete();
    }
  };
  $("form").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#day-stay").value.trim(), address = $("#day-stay-address").value.trim();
    // Where the night is spent: a place (with its address, or as it was) or plain text
    // ("Night train"), as the file had it. No name, no stay.
    let nextStay;
    if(name){
      if(address || typeof d.stay === "object") nextStay = Object.fromEntries(Object.entries({...stay, name, address: address || undefined}).filter(([, v]) => v !== undefined));
      else nextStay = name;
    }
    const same = JSON.stringify(nextStay) === JSON.stringify(d.stay);
    dlg.close();
    o.onSave({
      city: $("#day-city").value.trim(),
      title: $("#day-title").value.trim(),
      ...(same ? {} : {stay: nextStay}),
      notes: $("#day-notes").value.split("\n").map(s => s.trim()).filter(Boolean)
    });
  });
  dlg.showModal();
}
