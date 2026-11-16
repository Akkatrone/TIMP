// Icons for the ways of travelling a stop can be marked with.
// Drawn for this project on a 24×24 grid, stroked with currentColor so they follow
// the theme. No DOM here: the sketch builds SVG text from them under Node too.

export const TRAVEL = ["metro", "bus", "train", "plane", "boat"];

const PATHS = {
  // the "M" of metro signs
  metro: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 16.5v-9l4 5 4-5v9"/>',
  // a bus seen from the side: windows, door, wheels
  bus: '<rect x="2.5" y="5" width="19" height="12" rx="2.5"/><path d="M2.5 10.5h19M8.5 5v5.5M15 5v12"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="18" cy="18.5" r="1.6"/>',
  // a train seen from the front, on its rails
  train: '<rect x="5.5" y="3" width="13" height="13" rx="3"/><path d="M8 7.5h8"/><circle cx="9" cy="12.5" r=".6"/><circle cx="15" cy="12.5" r=".6"/><path d="M8.5 16 6.5 20.5M15.5 16l2 4.5"/>',
  // a plane seen from above, pointing up
  plane: '<path d="M12 2.8c.9 0 1.4 1 1.4 2.3v4.2l6.6 4.1v2l-6.6-1.9v3.6l2.2 1.7v1.6L12 19.5l-3.6.9v-1.6l2.2-1.7v-3.6L4 15.4v-2l6.6-4.1V5.1c0-1.3.5-2.3 1.4-2.3z"/>',
  // a ferry: hull, cabin, funnel
  boat: '<path d="M3 14.5h18l-2.6 5H5.6z"/><path d="M6.5 14.5v-4h11v4"/><path d="M10.5 10.5v-4h3v4"/>'
};

// An inline SVG of the icon, `size` pixels wide.
export function travelIcon(mode, size = 16){
  return `<svg class="tvicon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[mode]}</svg>`;
}

// The same icon as a group of an SVG drawing, centred on (x, y).
export function travelGlyph(mode, x, y, size = 12){
  const k = size / 24;
  return `<g class="tvglyph" transform="translate(${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}) scale(${k})" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${PATHS[mode]}</g>`;
}
