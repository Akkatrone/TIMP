// The design system's page (design/index.html): the swatches, sizes and durations read
// from the tokens in use (css/tokens.css), the contrast computed in the theme shown, and
// the switch between the light and the dark theme. Nothing here is copied from the
// tokens: change design/tokens.json and this page follows.

import { partSign } from "../js/icons.js";

const root = document.documentElement;
const v = name => getComputedStyle(root).getPropertyValue(name).trim();

function contrast(a, b){
  const lum = h => {
    const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);

// [token, what it is for, the background it is read on]
const COLOURS = [
  ["bg", "The page", "ink"], ["surface", "Sheets, bars", "ink"], ["card", "A stop", "ink"], ["card-off", "A quieter card", "ink"],
  ["ink", "Text, a stop done", "card"], ["muted", "Secondary text", "card"], ["line", "Hairlines", "card"], ["line-strong", "A control's edge", "card"],
  ["sel", "What is chosen", "ink"], ["chip", "A count", "ink"], ["link", "Links", "surface"], ["accent", "Now, the main action", "bg"],
  ["warn", "Attention", "warn-bg"], ["ok", "In order", "ok-bg"], ["err", "Error", "err-bg"]
];
const PLACES = ["sight", "museum", "food", "park", "view", "shop", "walk", "hotel"];

function draw(){
  const ratio = (fg, bg) => contrast(v("--" + fg), v("--" + bg)).toFixed(1);
  document.querySelector("[data-ds-colours]").innerHTML = COLOURS.map(([k, what, on]) => {
    const isBg = ["bg", "surface", "card", "card-off", "sel", "chip", "line"].includes(k);
    const r = isBg ? ratio("ink", k) : ratio(k, on);
    return `<div class="ds-sw"><i style="background:var(--${k})"></i><span><b>${esc(k)}</b><small>${esc(what)}</small><small>${esc(v("--" + k))} · ${isBg ? "ink on it" : "on " + on} ${r}:1</small></span></div>`;
  }).join("");
  document.querySelector("[data-ds-places]").innerHTML = PLACES.map(k =>
    `<div class="ds-sw"><i style="background:var(--t-${k});color:var(--on-place)">4</i><span><b>${k}</b><small>${esc(v("--t-" + k))} · white ${contrast("#ffffff", v("--t-" + k)).toFixed(1)}:1</small></span></div>`).join("");
  document.querySelector("[data-ds-cities]").innerHTML = [0, 1, 2, 3, 4, 5, 6, 7].map(i =>
    `<div class="ds-sw"><i style="background:linear-gradient(var(--p${i}),var(--p${i})) center/var(--line-w) 100% no-repeat"></i><span><b>City ${i + 1}</b><small>${esc(v("--p" + i))} · on the card ${ratio("p" + i, "card")}:1</small></span></div>`).join("");
}

const TYPE = [["xxl", "A page's title", 650], ["xl", "The trip's title", 650], ["l", "The day's heading", 600], ["base", "A stop's name, body text", 500], ["m", "Times, buttons", 600], ["s", "The place line, signals", 500], ["xs", "Captions", 500]];
document.querySelector("[data-ds-type]").innerHTML = TYPE.map(([k, what, w]) =>
  `<div><small>--fs-${k} · ${esc(v("--fs-" + k))}</small><span style="font:${w} var(--fs-${k})/1.3 var(--f-body)">${esc(what)} · 10:45 Castelo de São Jorge</span></div>`).join("");
document.querySelector("[data-ds-space]").classList.add("ds-space");
document.querySelector("[data-ds-space]").innerHTML = [1, 2, 3, 4, 5, 6, 7].map(i =>
  `<div><span style="width:var(--sp-${i})"></span>--sp-${i} · ${esc(v("--sp-" + i))}</div>`).join("");
// R17: the space to use, by what it separates; each on the scale above.
document.querySelector("[data-ds-gaps]").innerHTML = [["tight", "an icon and its label"], ["related", "within a group: a text and its action"], ["group", "between groups"], ["section", "between sections"]].map(([k, what]) =>
  `<div class="ds-gap"><span style="width:var(--gap-${k})"></span><b>--gap-${k}</b> · ${esc(v("--gap-" + k).replace(/var\(--sp-(\d)\)/, (_, n) => v("--sp-" + n)))} · ${esc(what)}</div>`).join("");
document.querySelector("[data-ds-radii]").innerHTML = ["s", "m", "l", "full"].map(k =>
  `<div style="border-radius:var(--r-${k})">${k}</div>`).join("");
document.querySelector("[data-ds-motion]").innerHTML = [["state", "A change of state"], ["expand", "Opening in place"], ["enter", "Coming in (a sheet)"]].map(([k, what]) =>
  `<tr><td>${esc(v("--dur-" + k))}</td><td>${esc(what)}</td></tr>`).join("");

// Light or dark, as the app does it (data-theme on the root).
for(const b of document.querySelectorAll("[data-ds-theme]")){
  b.addEventListener("click", () => {
    root.dataset.theme = b.dataset.dsTheme;
    for(const x of document.querySelectorAll("[data-ds-theme]")) x.setAttribute("aria-pressed", String(x === b));
    draw();
  });
}
if(matchMedia("(prefers-color-scheme: dark)").matches) document.querySelector('[data-ds-theme="dark"]').click();
draw();

// The parts of the day with their signs (T3), as a stop's time line draws them.
const PARTS = [["sunrise", "Sunrise · 07:14"], ["morning", "Morning"], ["midday", "Midday"], ["afternoon", "Afternoon"], ["sunset", "Sunset · 20:12"], ["evening", "Evening"], ["night", "Night"]];
document.querySelector("[data-ds-parts]").innerHTML = PARTS.map(([p, name]) => `<li><p class="when"><span class="tm part">${partSign(p)}<span>${esc(name)}</span></span></p></li>`).join("");
for(const el of document.querySelectorAll("[data-ds-part]")) el.insertAdjacentHTML("afterbegin", partSign(el.dataset.dsPart));
