// The sheet to publish a trip "with the link": what goes out is shown first. What the
// copy leaves out is decided by js/publish.js, the same function the service runs on
// the version it holds: here it runs on the trip on this phone, so the traveller sees
// what was found (booking codes, phone numbers, emails, where the nights are spent)
// and chooses what to keep, and how its dates are shown. Only the trip's owner opens it.

import { t } from "./i18n.js";
import { esc } from "./util.js";
import { publishable } from "./publish.js";
import { publishTrip } from "./share.js";
import { accountError } from "./account.js";

const KINDS = ["codes", "phones", "emails", "stays"];

// Whether the trip is over: its dates are then no longer a sign of an empty home.
function over(trip){
  const days = trip.days || [], last = days.length ? days[days.length - 1].date : "";
  return !!last && last < new Date().toISOString().slice(0, 10);
}

/**
 * @param {object} o
 *   rec        the trip's record (on the account, owned)
 *   toast      says something short over the page
 *   onDone(p)  published: the publication as the service gives it
 */
export function openPublishSheet({rec, toast, onDone}){
  const {private: _own, ...trip} = rec.trip;
  const {found} = publishable(trip);
  const before = rec.share.publication || null;
  let dates = before ? before.dates : (over(trip) ? "real" : "hidden");
  // Unsynced changes stay out: the service publishes the version it has.
  const behind = rec.share.head && rec.share.head !== rec.trip.version.id;
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.setAttribute("aria-labelledby", "publish-title");
  const examples = list => [...new Set(list.map(x => x.label ? `${x.label}${x.match ? ": " + x.match : ""}` : x.match))].slice(0, 3);
  const rows = KINDS.filter(k => found[k].length).map(k => `
    <label class="found-row"><input type="checkbox" data-take="${k}" checked>
      <span><b>${esc(t("found_" + k, {n: found[k].length}))}</b>${examples(found[k]).map(e => `<small>${esc(e)}</small>`).join("")}</span></label>`).join("");
  dlg.innerHTML = `
  <form method="dialog" class="sheet-form publish">
    <div class="sheet-head">
      <h2 id="publish-title">${esc(t(before ? "republishTitle" : "publishTitle", {t: rec.trip.title}))}</h2>
      <button type="button" class="iconbtn" data-close aria-label="${esc(t("cancel"))}">×</button>
    </div>
    <p class="foot">${esc(t("publishLinkHelp"))}</p>
    <section><h3 class="sheet-h">${esc(t("publishDates"))}</h3>
      <div class="seg" role="group" aria-label="${esc(t("publishDates"))}">
        <button type="button" data-dates="hidden" aria-pressed="${dates === "hidden"}">${esc(t("datesHidden"))}</button>
        <button type="button" data-dates="real" aria-pressed="${dates === "real"}">${esc(t("datesReal"))}</button>
      </div>
      <p class="foot" data-dates-help>${esc(t(dates === "hidden" ? "datesHiddenHelp" : "datesRealHelp"))}</p>
    </section>
    <section><h3 class="sheet-h">${esc(t("publishFound"))}</h3>
      ${rows ? `<div class="found">${rows}</div><p class="foot">${esc(t("publishFoundHelp"))}</p>` : `<p class="foot">${esc(t("publishNothing"))}</p>`}
    </section>
    <p class="foot">${esc(t("publishNever"))}</p>
    ${behind ? `<p class="warnline">${esc(t("publishBehind"))}</p>` : ""}
    <p class="errbox" data-error role="alert" hidden></p>
    <div class="sheet-actions">
      <button type="button" class="btn" data-close>${esc(t("cancel"))}</button>
      <span class="grow"></span>
      <button type="submit" class="btn primary">${esc(t("publishNow"))}</button>
    </div>
  </form>`;
  document.body.appendChild(dlg);
  const $ = sel => dlg.querySelector(sel);
  dlg.addEventListener("close", () => dlg.remove());
  dlg.addEventListener("click", e => {
    if(e.target === dlg || e.target.closest("[data-close]")){ dlg.close(); return; }
    const d = e.target.closest("[data-dates]");
    if(!d) return;
    dates = d.dataset.dates;
    dlg.querySelectorAll("[data-dates]").forEach(b => b.setAttribute("aria-pressed", String(b === d)));
    $("[data-dates-help]").textContent = t(dates === "hidden" ? "datesHiddenHelp" : "datesRealHelp");
  });
  $("form").addEventListener("submit", async e => {
    e.preventDefault();
    const remove = Object.fromEntries(KINDS.map(k => { const box = dlg.querySelector(`[data-take="${k}"]`); return [k, box ? box.checked : true]; }));
    const go = $("[type=submit]");
    go.disabled = true;
    try{
      const pub = await publishTrip(rec.share.id, {dates, remove});
      dlg.close();
      onDone(pub);
    }catch(err){
      const box = $("[data-error]");
      box.textContent = accountError(err);
      box.hidden = false;
    }finally{ go.disabled = false; }
  });
  dlg.showModal();
}
