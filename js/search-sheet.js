// The Search sheet (design/README.md, S1–S5): it opens at once with the field ready,
// results follow every letter, a tap goes to the stop. What is found and how each result
// looks come from js/app.js (find); this file only draws and listens.

import { esc } from "./util.js";
import { t } from "./i18n.js";

let dialog = null;

const marked = s => s ? `${esc(s.before)}<mark>${esc(s.match)}</mark>${esc(s.after)}` : "";

/**
 * @param {{find: (query: string) => Array<{sign: string, meta: string, name: string,
 *   nameMark: object|null, where: object|null, label: string}>,
 *   onPick: (index: number) => void, query?: string}} o
 *   find: the results for a query, ready to show (sign: HTML of the stop's sign, made by
 *   js/app.js; the rest text); onPick: the result tapped, by its place in the last list.
 */
export function openSearch({find, onPick, query = ""}){
  if(!dialog){
    dialog = document.createElement("dialog");
    dialog.className = "sheet search";
    dialog.setAttribute("aria-labelledby", "search-title");
    document.body.appendChild(dialog);
    dialog.addEventListener("click", e => { if(e.target === dialog) dialog.close(); });
  }
  dialog.innerHTML = `<div class="sheet-form">
    <div class="sheet-head"><h2 id="search-title">${esc(t("search"))}</h2><button type="button" class="iconbtn" data-close aria-label="${esc(t("close"))}">×</button></div>
    <input type="search" id="search-q" class="search-q" autocomplete="off" enterkeyhint="search" aria-label="${esc(t("searchLabel"))}" placeholder="${esc(t("searchPlaceholder"))}" aria-controls="search-results">
    <p class="foot search-n" role="status" aria-live="polite"></p>
    <ol class="results" id="search-results"></ol></div>`;
  const input = dialog.querySelector("#search-q"), list = dialog.querySelector(".results"), count = dialog.querySelector(".search-n");
  let results = [];
  const draw = () => {
    const q = input.value.trim();
    results = q ? find(q) : [];
    list.innerHTML = results.map((r, i) => `<li><button type="button" class="res" data-res="${i}" aria-label="${esc(r.label)}">` +
      `<span class="rsign" aria-hidden="true">${r.sign}</span><span class="rt"><small>${esc(r.meta)}</small>` +
      `<b>${r.nameMark ? marked(r.nameMark) : esc(r.name)}</b>${r.where ? `<small class="rw">${marked(r.where)}</small>` : ""}</span></button></li>`).join("");
    count.textContent = !q ? "" : !results.length ? t("searchNone", {q}) : results.length === 1 ? t("searchOne") : t("searchCount", {n: results.length});
  };
  input.value = query;
  input.addEventListener("input", draw);
  // Enter takes the first result.
  input.addEventListener("keydown", e => { if(e.key === "Enter" && results.length){ e.preventDefault(); pick(0); } });
  const pick = i => { dialog.close(); onPick(i); };
  dialog.onclick = e => {
    if(e.target.closest("[data-close]")){ dialog.close(); return; }
    const b = e.target.closest("[data-res]");
    if(b) pick(+b.dataset.res);
  };
  dialog.showModal();
  draw();
  input.focus();
}
