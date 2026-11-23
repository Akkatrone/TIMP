// Search in the top bar (design/README.md, S1–S6): the lens becomes ✕, the field takes
// the title's place, the circle of you stays; the results fill a panel fixed under the
// bar, which scrolls on its own and never changes size as one types. What is found and
// how each result looks come from js/app.js (find); this file only draws and listens.

import { esc } from "./util.js";
import { t } from "./i18n.js";

const marked = s => s ? `${esc(s.before)}<mark>${esc(s.match)}</mark>${esc(s.after)}` : "";
let open = null;   // {close} while searching

export const searching = () => !!open;

/**
 * @param {{strip: HTMLElement, button: HTMLButtonElement, find: (query: string) => Array<{sign: string,
 *   meta: string, name: string, nameMark: object|null, where: object|null, label: string}>,
 *   onPick: (index: number) => void, icons: {lens: string, close: string}}} o
 *   find: the results for a query, ready to show (sign: HTML of the stop's sign, made by
 *   js/app.js; the rest text); onPick: the result tapped, by its place in the last list.
 */
export function openSearch({strip, button, find, onPick, icons}){
  if(open) return;
  const tbar = strip.querySelector(".tbar");
  const input = document.createElement("input");
  Object.assign(input, {type: "search", id: "search-q", className: "search-q", autocomplete: "off", placeholder: t("searchPlaceholder")});
  input.setAttribute("enterkeyhint", "search");
  input.setAttribute("aria-label", t("searchLabel"));
  input.setAttribute("aria-controls", "search-results");
  tbar.insertBefore(input, button);
  const panel = document.createElement("div");
  panel.className = "search-panel";
  panel.id = "search-panel";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", t("search"));
  panel.innerHTML = `<p class="search-n" role="status" aria-live="polite"></p><ol class="results" id="search-results"></ol>`;
  document.body.appendChild(panel);
  strip.classList.add("searching");
  document.documentElement.classList.add("searching");
  button.innerHTML = icons.close;
  button.setAttribute("aria-label", t("searchClose"));
  button.title = t("searchClose");
  button.setAttribute("aria-expanded", "true");
  button.setAttribute("aria-controls", "search-panel");

  // The panel starts where the bar ends, under an iPhone's notch too, and keeps that place.
  const place = () => { panel.style.top = strip.getBoundingClientRect().bottom + "px"; };
  place();
  window.addEventListener("resize", place);

  const list = panel.querySelector(".results"), count = panel.querySelector(".search-n");
  let results = [];
  const draw = () => {
    const q = input.value.trim();
    results = q ? find(q) : [];
    list.innerHTML = results.map((r, i) => `<li><button type="button" class="res" data-res="${i}" aria-label="${esc(r.label)}">` +
      `<span class="rsign" aria-hidden="true">${r.sign}</span><span class="rt"><small>${esc(r.meta)}</small>` +
      `<b>${r.nameMark ? marked(r.nameMark) : esc(r.name)}</b>${r.where ? `<small class="rw">${marked(r.where)}</small>` : ""}</span></button></li>`).join("");
    count.textContent = !q ? "" : !results.length ? t("searchNone", {q}) : results.length === 1 ? t("searchOne") : t("searchCount", {n: results.length});
    panel.scrollTop = 0;
  };
  const close = (focusBack = true) => {
    if(!open) return;
    open = null;
    window.removeEventListener("resize", place);
    input.remove();
    panel.remove();
    strip.classList.remove("searching");
    document.documentElement.classList.remove("searching");
    button.innerHTML = icons.lens;
    button.setAttribute("aria-label", t("search"));
    button.title = t("search");
    button.setAttribute("aria-expanded", "false");
    if(focusBack) button.focus({preventScroll: true});
  };
  input.addEventListener("input", draw);
  input.addEventListener("keydown", e => {
    if(e.key === "Escape"){ e.preventDefault(); close(); }
    // Enter takes the first result.
    if(e.key === "Enter" && results.length){ e.preventDefault(); close(false); onPick(0); }
  });
  panel.addEventListener("click", e => {
    const b = e.target.closest("[data-res]");
    if(b){ close(false); onPick(+b.dataset.res); }
  });
  open = {close};
  input.focus();
}

/** Closes the search, if it is open. */
export function closeSearch(focusBack = true){ if(open) open.close(focusBack); }
