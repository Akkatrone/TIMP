// Icons for how a stop is reached (TRAVEL) and what kind of place it is (TYPES).
// Drawn for this project on a 24×24 grid, stroked with currentColor so they follow
// the theme. No DOM here: the sketch builds SVG text from them under Node too.
// The lists themselves belong to the format: js/trip.js.

const PATHS = {
  // ---- how you get there ----
  // the "M" of metro signs
  metro: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 16.5v-9l4 5 4-5v9"/>',
  // a bus seen from the side: windows, door, wheels
  bus: '<rect x="2.5" y="5" width="19" height="12" rx="2.5"/><path d="M2.5 10.5h19M8.5 5v5.5M15 5v12"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="18" cy="18.5" r="1.6"/>',
  // a train seen from the front, on its rails
  train: '<rect x="5.5" y="3" width="13" height="13" rx="3"/><path d="M8 7.5h8"/><circle cx="9" cy="12.5" r=".6"/><circle cx="15" cy="12.5" r=".6"/><path d="M8.5 16 6.5 20.5M15.5 16l2 4.5"/>',
  // a plane seen from above, pointing up
  plane: '<path d="M12 2.8c.9 0 1.4 1 1.4 2.3v4.2l6.6 4.1v2l-6.6-1.9v3.6l2.2 1.7v1.6L12 19.5l-3.6.9v-1.6l2.2-1.7v-3.6L4 15.4v-2l6.6-4.1V5.1c0-1.3.5-2.3 1.4-2.3z"/>',
  // a ferry: hull, cabin, funnel
  boat: '<path d="M3 14.5h18l-2.6 5H5.6z"/><path d="M6.5 14.5v-4h11v4"/><path d="M10.5 10.5v-4h3v4"/>',

  // ---- what kind of place ----
  // a monument: a star over a plinth
  sight: '<path d="M12 3.5l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z"/><path d="M6 20.5h12"/>',
  // a museum: pediment and columns
  museum: '<path d="M3.5 9 12 4l8.5 5z"/><path d="M6 10.5v7M10 10.5v7M14 10.5v7M18 10.5v7M3.5 20h17"/>',
  // fork and knife
  food: '<path d="M7 3.5v17M4.5 3.5v4.5a2.5 2.5 0 0 0 5 0V3.5"/><path d="M17 20.5v-17c-2.2 1.2-3.5 3.6-3.5 6.5v3.5H17"/>',
  // a tree
  park: '<path d="M12 21v-6"/><path d="M12 3.5c3.3 0 5.5 2.6 5.5 5.6 0 3.2-2.5 5.4-5.5 5.4s-5.5-2.2-5.5-5.4c0-3 2.2-5.6 5.5-5.6z"/>',
  // a mountain with the sun: a view
  view: '<path d="M2.5 19.5 9 9.5l4 6 2.5-3.5 6 7.5z"/><circle cx="17" cy="6" r="2.2"/>',
  // a shopping bag
  shop: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  // a walker's footprints
  walk: '<path d="M8 3.5c1.7 0 2.5 1.8 2.5 4s-.8 4-2.5 4-2.5-1.8-2.5-4 .8-4 2.5-4zM6 14.5h4"/><path d="M16 9.5c1.7 0 2.5 1.8 2.5 4s-.8 4-2.5 4-2.5-1.8-2.5-4 .8-4 2.5-4zM14 20.5h4"/>',
  // a bed
  hotel: '<path d="M3 18.5v-11M3 14h18v4.5M21 14v-2.5a3 3 0 0 0-3-3h-7V14"/><circle cx="7" cy="11" r="1.8"/>',

  // ---- the time of day ----
  // a crescent moon: after sunset
  moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>',
  // the sun: sunrise to sunset
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'
};

const known = name => Object.prototype.hasOwnProperty.call(PATHS, name);

// An inline SVG of the icon, `size` pixels wide; "" for a name without an icon.
export function icon(name, size = 16){
  if(!known(name)) return "";
  return `<svg class="tvicon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

// The same icon as a group of an SVG drawing, centred on (x, y).
export function glyph(name, x, y, size = 12){
  if(!known(name)) return "";
  const k = size / 24;
  return `<g class="tvglyph" transform="translate(${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}) scale(${k})" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</g>`;
}

/** Whether `name` has an icon: every value of TRAVEL and TYPES must. */
export const hasIcon = known;

// The parts of the day (js/parts.js; design/README.md, T3): the sun on its arc over the
// horizon, rising, high, setting; then the moon. Drawn on a 52×20 grid, currentColor.
const PART_SIGNS = (() => {
  const cx = 26, cy = 15, r = 11;
  const sky = `<path d="M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="currentColor" stroke-width="1.5" opacity=".45"/>`;
  const hz = `<path d="M${cx - r - 6} ${cy + .5}H${cx + r + 6}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`;
  const svg = inner => `<svg class="sun" viewBox="0 0 52 20" fill="none" aria-hidden="true">${sky}${hz}${inner}</svg>`;
  const sun = (pos, big) => { const a = Math.PI * (1 - pos); return `<circle cx="${(cx + r * Math.cos(a)).toFixed(1)}" cy="${(cy - r * Math.sin(a)).toFixed(1)}" r="${big ? 5 : 4}" fill="currentColor"/>`; };
  const half = x => `<path d="M${x - 5.5} ${cy}a5.5 5.5 0 0 1 11 0z" fill="currentColor"/>`;
  const moon = (x, y) => `<path d="M${x + 2} ${y - 4.5}a4.5 4.5 0 1 0 2.6 8a3.6 3.6 0 1 1 -2.6 -8z" fill="currentColor"/>`;
  return {sunrise: svg(half(cx - r)), morning: svg(sun(.25)), midday: svg(sun(.5)), afternoon: svg(sun(.75)),
    sunset: svg(half(cx + r)), evening: svg(moon(cx + 6, 10)), night: svg(moon(cx, 7) + `<circle cx="${cx - 9}" cy="6" r="1" fill="currentColor"/><circle cx="${cx - 4}" cy="3" r=".8" fill="currentColor"/>`)};
})();
/** The sign of a part of the day, as SVG text ("" for none). */
export const partSign = part => PART_SIGNS[part] || "";

/** A tick: a stop done, a place taken. */
export const CHECK = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
