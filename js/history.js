// The history of a trip, in words, and a way back to any version this phone has.
// describe() turns a comparison (js/diff.js) into short lines; openHistory() lists the
// versions with what each one changed, and offers "Restore" on the earlier ones.

import { t, getLang } from "./i18n.js";
import { esc, dateParts } from "./util.js";
import { diffTrips } from "./diff.js";
import { shortId } from "./version.js";
import { ask } from "./ask.js";

const day = date => dateParts(date, getLang()).long;
const fields = fs => fs.map(f => t("field_" + f)).join(", ");

/** Short lines saying what changed, at most `max` of them. */
export function describe(d, max = 6){
  const lines = [
    ...d.added.map(x => "+ " + x.stop.title),
    ...d.removed.map(x => "− " + x.stop.title),
    ...d.changed.map(x => `~ ${x.stop.title} · ${fields(x.fields)}`),
    ...d.moved.map(x => `→ ${x.stop.title} · ${day(x.date)}`),
    ...(d.other ? [t("changedOther")] : [])
  ];
  if(!lines.length) return [t("changedNothing")];
  return lines.length > max ? [...lines.slice(0, max - 1), t("changedMore", {n: lines.length - max + 1})] : lines;
}

let dialog = null;

/**
 * @param {{trip: object, versions: object, onRestore: (id: string) => Promise<void>}} o
 */
export async function openHistory({trip, versions, onRestore}){
  if(!dialog){
    dialog = document.createElement("dialog");
    dialog.className = "sheet history";
    dialog.setAttribute("aria-labelledby", "history-title");
    document.body.appendChild(dialog);
    dialog.addEventListener("click", e => { if(e.target === dialog) dialog.close(); });
  }
  const ids = [trip.version.id, ...trip.version.history];
  const here = new Set(await versions.ids(trip.id));
  const fmt = new Intl.DateTimeFormat(getLang(), {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"});
  dialog.innerHTML = `<div class="sheet-form">
    <div class="sheet-head"><h2 id="history-title">${esc(t("historyTitle"))}</h2><button type="button" class="iconbtn" data-close aria-label="${esc(t("close"))}">×</button></div>
    <p class="foot">${esc(t("historyHelp"))}</p>
    <ol class="versions"><li class="foot">${esc(t("mapLoading"))}</li></ol></div>`;
  dialog.showModal();
  dialog.onclick = async e => {
    if(e.target.closest("[data-close]")){ dialog.close(); return; }
    const b = e.target.closest("[data-restore]");
    if(!b) return;
    const answer = await ask({title: t("restoreTitle", {v: shortId(b.dataset.restore)}), text: t("restoreText"),
      actions: [{id: "no", label: t("cancel")}, {id: "yes", label: t("restore"), kind: "primary"}]});
    if(answer !== "yes") return;
    dialog.close();
    await onRestore(b.dataset.restore);
  };

  // Each row compares a version with the one it was made from. Rebuilding a version
  // takes a few milliseconds; the 60 most recent are enough to find one's way back.
  const rows = [];
  let away = 0;
  const flush = () => { if(away){ rows.push(`<li class="away">${esc(t("historyAway", {n: away}))}</li>`); away = 0; } };
  for(const id of ids.slice(0, 60)){
    const v = here.has(id) ? await versions.get(trip.id, id) : null;
    if(!v){ away++; continue; }
    flush();
    const parent = v.version.parents[0] && here.has(v.version.parents[0]) ? await versions.get(trip.id, v.version.parents[0]) : null;
    const what = !v.version.parents.length ? [t("historyFirst")]
      : parent ? describe(diffTrips(parent, v)) : [t("historyUnknown")];
    if(v.version.parents.length > 1) what.unshift(t("historyMerge", {v: shortId(v.version.parents[1])}));
    const when = v.version.date ? fmt.format(new Date(v.version.date)) : "";
    const current = id === trip.version.id;
    rows.push(`<li class="${current ? "current" : ""}"><div class="vid"><code>${esc(shortId(id))}</code><span>${esc(when)}</span></div>` +
      `<ul class="what">${what.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` +
      (current ? `<span class="badge-on">${esc(t("historyCurrent"))}</span>` : `<button type="button" class="btn small" data-restore="${esc(id)}">${esc(t("restore"))}</button>`) + `</li>`);
  }
  flush();
  if(ids.length > 60) rows.push(`<li class="away">${esc(t("historyOlder", {n: ids.length - 60}))}</li>`);
  if(dialog.open) dialog.querySelector(".versions").innerHTML = rows.join("");
}
