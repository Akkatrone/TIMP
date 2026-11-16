// The form to add or change a stop, in a dialog over the page.
// It only collects the stop: saving, versions and files are the caller's job
// (onSave and onDelete), so the same form serves every way a stop arrives:
// the + button, the Edit link, and a place shared from Google Maps.

import { t, getLang } from "./i18n.js";
import { esc, dateParts } from "./util.js";
import { parseMapsInput, queryOf } from "./gmaps.js";
import { geocode } from "./geocode.js";
import { travelIcon, TRAVEL } from "./icons.js";
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
 *   stop                        the stop to change (absent: a new stop)
 *   prefill                     text to read as if pasted (a shared place)
 *   timezone, googleKey
 *   onSave({stop, date, plan})  the stop as filled in, and where it goes
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
    address: "",
    travel: (o.stop && o.stop.travel) || "",
    searching: false
  };
  const s0 = o.stop || {};

  const days = o.trip.days;
  const dayOptions = days.map((d, i) => {
    const p = dateParts(d.date, lang);
    return `<option value="${i}"${i === o.dayIndex ? " selected" : ""}>${esc(t("day"))} ${i + 1} · ${esc(p.dow)} ${esc(p.long.split(" ").slice(1).join(" "))} · ${esc(d.title)}</option>`;
  }).join("");

  dlg.innerHTML = `
  <form method="dialog" class="sheet-form" novalidate>
    <div class="sheet-head">
      <h2 id="sheet-title">${esc(t(editing ? "editStopTitle" : "newStopTitle"))}</h2>
      <button type="button" class="iconbtn" data-close aria-label="${esc(t("cancel"))}">×</button>
    </div>

    <div class="field">
      <label for="stop-src">${esc(t("fAddress"))}</label>
      <div class="row">
        <input id="stop-src" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(t("fAddressPh"))}">
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
        <label for="stop-time">${esc(t("fTime"))}</label>
        <input id="stop-time" type="text" inputmode="text" autocomplete="off" value="${esc(s0.time || timeNow(o.timezone))}">
      </div>
    </div>
    <div class="field" data-plan-field hidden>
      <label for="stop-plan">${esc(t("fPlan"))}</label>
      <select id="stop-plan"></select>
    </div>

    <div class="field">
      <span class="label" id="travel-label">${esc(t("fTravel"))}</span>
      <div class="seg wrap" role="radiogroup" aria-labelledby="travel-label">
        ${["", ...TRAVEL].map(m => `<button type="button" role="radio" data-travel="${m}" aria-checked="${st.travel === m}">${m ? travelIcon(m, 16) : ""}<span>${esc(t(m ? "travel_" + m : "travel_none"))}</span></button>`).join("")}
      </div>
    </div>

    <div class="field">
      <label for="stop-text">${esc(t("fText"))}</label>
      <textarea id="stop-text" rows="3">${esc(s0.text || "")}</textarea>
    </div>

    <div class="field">
      <span class="label">${esc(t("fPosition"))}</span>
      <p class="pos" data-pos></p>
      <div class="actions">
        <button type="button" class="btn small" data-find>${esc(t("posSearch"))}</button>
        <button type="button" class="btn small" data-clear-pos>${esc(t("posClear"))}</button>
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
      : has ? `${st.lat.toFixed(5)}, ${st.lng.toFixed(5)}` + (st.source === "link" ? " · " + t("posFromLink") : st.source === "google" ? " · Google" : st.source === "osm" ? " · OpenStreetMap" : "")
      : t("posNone");
    $("[data-pos]").textContent = label;
    $("[data-pos]").classList.toggle("muted", !has);
    $("[data-clear-pos]").hidden = !has;
    $("[data-find]").disabled = st.searching;
  }

  function note(text){ $("[data-src-note]").textContent = text; }

  // What the traveller pasted or typed in the first field.
  function readSource(text){
    const r = parseMapsInput(text);
    if(r.link) st.link = r.link;
    if(r.title && !$("#stop-title").value.trim()) $("#stop-title").value = r.title;
    st.address = r.address || (!r.link && looksLikeAddress(text) && r.lat === undefined ? text.trim() : "");
    if(r.lat !== undefined){ st.lat = r.lat; st.lng = r.lng; st.source = "link"; }
    note(r.short && !r.title ? t("shortLinkNote") : t("fAddressHelp"));
    showPos();
    // A position is searched only for something that looks like an address, once.
    if(st.lat === undefined && (st.address || (r.title && r.address))) findPosition();
  }

  async function findPosition(){
    const day = days[+$("#stop-day").value];
    const title = $("#stop-title").value.trim();
    const text = st.address ? queryOf({title, address: st.address}) : [title, o.trip.places[day.place].name].filter(Boolean).join(", ");
    if(!text) return;
    if(navigator.onLine === false){ note(t("posOffline")); return; }
    st.searching = true; showPos();
    // With a name and an address, the address alone is the more reliable search.
    const hit = (st.address && await geocode(st.address, {googleKey: o.googleKey, lang})) || await geocode(text, {googleKey: o.googleKey, lang});
    st.searching = false;
    if(hit){ st.lat = hit.lat; st.lng = hit.lng; st.source = hit.source; }
    else note(t("posNotFound"));
    showPos();
  }

  dlg.onclick = async e => {
    if(e.target === dlg) return;
    if(e.target.closest("[data-close]")){ dlg.close(); return; }
    const tr = e.target.closest("[data-travel]");
    if(tr){
      st.travel = tr.dataset.travel;
      dlg.querySelectorAll("[data-travel]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.travel === st.travel)));
      return;
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
    const place = o.trip.places[day.place].name;
    // The search text behind Map and Directions: the address when there is one.
    const query = st.address ? queryOf({title, address: st.address})
      : (s0.query && title === s0.title ? s0.query : `${title}, ${place}`);
    const stop = {
      ...s0,
      time: $("#stop-time").value.trim() || timeNow(o.timezone),
      title,
      text: $("#stop-text").value.trim() || undefined,
      lat: st.lat, lng: st.lng,
      query,
      link: st.link,
      travel: st.travel || undefined
    };
    delete stop.id;
    if(st.lat === undefined){ delete stop.lat; delete stop.lng; delete stop.mapLabel; }
    dlg.close();
    o.onSave({stop, date: day.date, plan: day.plans ? $("#stop-plan").value : null});
  });

  fillPlans();
  showPos();
  dlg.showModal();
  if(o.prefill){ $("#stop-src").value = o.prefill; readSource(o.prefill); }
  else if(!editing) $("#stop-src").focus();
}
