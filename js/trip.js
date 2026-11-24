// The trip file format, travel-in-my-pocket/2: the contract between a trip file and
// the app. No DOM here: it also runs under Node (tools/, tests) and in the link
// resolver (worker/).
//
// One table, FIELDS, says everything about the format. The checks, the JSON Schema
// for AI assistants and the reference test of docs/trip-format.md are all made from
// it: a field is added in one place.
//
// The file says what the trip is, nothing about how it looks. Colours, map zones,
// labels and icons are the app's job, worked out from the content.

import { PARTS, partOf, clockOfTime } from "./parts.js";

export const FORMAT = "travel-in-my-pocket/2";
export const FORMAT_1 = "travel-in-my-pocket/1";

// How a stop is reached, and what kind of place it is. Keep in step with js/icons.js.
// A value the app does not know yet is accepted with a warning and drawn as a plain
// stop, so new kinds can be added without breaking files or older apps.
export const TRAVEL = ["metro", "bus", "train", "plane", "boat"];
export const TYPES = ["sight", "museum", "food", "park", "view", "shop", "walk", "hotel"];
// Whether a stop needs booking, and whether it is done. Unknown values: a warning.
export const BOOKING = ["required", "advised", "booked"];
// The days a place is closed: days of the week, as in `closed`.
export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HASH = /^[0-9a-f]{16}$/;
const HTTPS = /^https:\/\/[^\s<>"]+$/;
// A page of a sharing service: https, or this machine while developing one.
const PAGE_URL = /^(https:\/\/[^\s<>"]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s<>"]*)$/;
// A currency, as its ISO 4217 code.
const CURRENCY = /^[A-Z]{3}$/;
const CURRENCY_HINT = "a currency code like \"JPY\"";

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = v => typeof v === "string" && v.trim() !== "";
const isNum = v => typeof v === "number" && Number.isFinite(v);

function realDate(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// A closing day: a day of the week, or a date.
function closedDay(s){
  return WEEKDAYS.includes(s) || realDate(s);
}

// A formatter per check was most of the time of checking a big trip: each zone is
// asked once (a few hundred kept at most, whatever a file brings).
const ZONES = new Map();
function realTimezone(s){
  if(ZONES.has(s)) return ZONES.get(s);
  let ok = false;
  try{ new Intl.DateTimeFormat("en", {timeZone: s}); ok = true; }catch(e){}
  if(ZONES.size < 500) ZONES.set(s, ok);
  return ok;
}

/*
 * Every field of the format. A field is
 *   {type, req, doc, ...}
 * type: "text" | "number" | "list" | "fixed" | "yes" | "any" | "<name of another entry>"
 *   yes: true, or left out.
 *   list: `of` is the type of the items, `min` the fewest items; `item`, a text field
 *     every item must match (its `pattern`, `test` and `hint`).
 *   text: `pattern` + `hint`, or `test` + `hint`, or `values` (one of them).
 *   number: `min`, `max`.
 * soft: a value outside `values` is a warning, not an error.
 * byApp: written by the app; a file may leave it out.
 * inBrief: false: left out of formatBrief, which an assistant follows to write a new file
 *   (a key it must never write; a link to a stop id the file does not have yet).
 * A type can also be a union: "stay" is a text or an object (see `stayOrText`).
 */
export const FIELDS = {
  trip: {
    format: {type: "fixed", value: FORMAT, req: true, doc: `Always "${FORMAT}".`},
    title: {type: "text", req: true, doc: "The name of the trip."},
    days: {type: "list", of: "day", min: 1, req: true, doc: "One entry per date, in date order."},
    lang: {type: "text", values: ["en", "it"], soft: true, doc: "Language of the app while this trip is open. Without it, the phone's."},
    timezone: {type: "text", test: realTimezone, hint: "an IANA time zone such as \"Europe/Rome\"", doc: "Time zone of the destination: decides which day is today."},
    info: {type: "list", of: "section", doc: "Sections of the Info page: numbers, words, transport."},
    currency: {type: "text", pattern: CURRENCY, hint: CURRENCY_HINT, doc: "The currency of every cost without its own."},
    expenses: {type: "list", of: "expense", min: 1, doc: "Money spent outside the stops: flights, hotels, passes."},
    private: {type: "private", doc: "The traveller's own spending, not shared."},
    googleMapsKey: {type: "text", inBrief: false, doc: "A Google Maps key for everyone who loads the trip (see docs/google-maps.md). Without it, OpenStreetMap."},
    basedOn: {type: "basedOn", byApp: true, inBrief: false, doc: "Written by the app: the published trip this one was copied from (\"Use as a base\")."},
    id: {type: "text", pattern: ID, hint: "lowercase letters, digits and dashes", byApp: true, doc: "Written by the app. Keep it when you change a file the app saved."},
    version: {type: "any", byApp: true, doc: "Written by the app. Keep it as it is."}
  },
  day: {
    date: {type: "text", req: true, test: realDate, hint: "a real date as \"YYYY-MM-DD\"", doc: "The date."},
    city: {type: "text", doc: "Where the day is spent: a city or an area."},
    title: {type: "text", doc: "What the day is about, in a few words."},
    stay: {type: "stay", doc: "Where the night is spent: a name, or an object with name, address and note."},
    notes: {type: "list", of: "text", doc: "Things to remember that day, shown at the top."},
    stops: {type: "list", of: "stop", min: 1, doc: "The stops, in order. A day has `stops` or `plans`."},
    plans: {type: "list", of: "plan", min: 2, doc: "Alternative plans for the day, each with its own stops."}
  },
  plan: {
    name: {type: "text", req: true, doc: "The name of the plan, shown on its button."},
    stops: {type: "list", of: "stop", min: 1, req: true, doc: "The stops of this plan, in order."},
    chosen: {type: "yes", hint: "true", doc: "On the plan the day goes with. None: the first."},
    id: {type: "text", pattern: ID, hint: "lowercase letters, digits and dashes", byApp: true, doc: "Written by the app."}
  },
  stop: {
    title: {type: "text", req: true, doc: "The name of the place or of the activity."},
    local: {type: "text", doc: "The name in the local script, as on the sign (\"一蘭 渋谷店\"): to show staff, and to search it."},
    time: {type: "text", hint: "\"HH:MM\" or " + PARTS.join("|"), examples: ["09:30", ...PARTS], advise: t => clockOfTime(t) !== null || partOf(t) !== null,
      doc: "When: a clock time, or a part of the day (sunrise and sunset at their real time where the day is). For all day, no time."},
    type: {type: "text", values: TYPES, soft: true, doc: "What kind of place it is; it gives the stop its icon and pin."},
    travel: {type: "text", values: TRAVEL, soft: true, doc: "How you get there from the stop before."},
    text: {type: "text", doc: "What to know: what to see, what to order, tickets. **bold** is allowed."},
    tag: {type: "text", doc: "A short label shown on the stop, like \"Booked 19:30\" or \"Optional\"."},
    booking: {type: "text", values: BOOKING, soft: true, doc: "\"required\": no entry without it (the app warns); \"advised\": better booked; \"booked\": done."},
    cost: {type: "number", min: 0, max: 1e12, doc: "What the traveller pays. 0: free."},
    currency: {type: "text", pattern: CURRENCY, hint: CURRENCY_HINT, doc: "The currency of `cost`, if not the trip's."},
    closed: {type: "list", of: "text", min: 1, item: {type: "text", pattern: /^(sun|mon|tue|wed|thu|fri|sat|\d{4}-\d{2}-\d{2})$/, test: closedDay, hint: "\"mon\" to \"sun\", or a date as \"YYYY-MM-DD\""}, doc: "Days of the week and dates the place is closed: the app warns on them."},
    address: {type: "text", doc: "As you would search it in Google Maps: a street address, or name and town."},
    lat: {type: "number", min: -90, max: 90, doc: "Latitude, with `lng`: the pin on the map."},
    lng: {type: "number", min: -180, max: 180, doc: "Longitude, with `lat`."},
    link: {type: "text", pattern: HTTPS, hint: "an https:// address", doc: "A Google Maps link to the exact place."},
    choice: {type: "text", doc: "Options for one moment: stops of a day with the same choice (\"Lunch\"), 2 to 4."},
    chosen: {type: "yes", hint: "true", doc: "On the option the day goes to. None: to choose."},
    id: {type: "text", pattern: ID, hint: "lowercase letters, digits and dashes", byApp: true, doc: "Written by the app."}
  },
  expense: {
    title: {type: "text", req: true, doc: "What it was: \"Flights\", \"Hotel, 3 nights\"."},
    cost: {type: "number", req: true, min: 0, max: 1e12, doc: "What the traveller pays."},
    currency: {type: "text", pattern: CURRENCY, hint: CURRENCY_HINT, doc: "The currency of `cost`, if not the trip's."},
    date: {type: "text", test: realDate, hint: "a real date as \"YYYY-MM-DD\"", doc: "When it was paid: the day of its rate. Without it, the trip's first day."},
    stop: {type: "text", pattern: ID, hint: "a stop id", inBrief: false, doc: "Private expenses only: the id of the stop it was paid at, on the day in `date`."},
    id: {type: "text", pattern: ID, hint: "lowercase letters, digits and dashes", byApp: true, doc: "Written by the app."}
  },
  basedOn: {
    url: {type: "text", req: true, pattern: PAGE_URL, hint: "an https:// address", doc: "The page of the trip it was copied from."},
    title: {type: "text", req: true, doc: "That trip's title."},
    by: {type: "text", req: true, doc: "The handle of whoever published it."}
  },
  private: {
    expenses: {type: "list", of: "expense", min: 1, req: true, doc: "Shopping, a meal alone."},
    owner: {type: "text", pattern: ID, hint: "a code written by the app", byApp: true, doc: "Written by the app: whose they are. Keep it, never invent it."}
  },
  stay: {
    name: {type: "text", req: true, doc: "The name of the hotel or flat."},
    address: {type: "text", doc: "Its address."},
    note: {type: "text", doc: "Check-in, booking, how to get in."}
  },
  section: {
    title: {type: "text", req: true, doc: "The title of the section."},
    items: {type: "list", of: "item", min: 1, req: true, doc: "Its lines."}
  },
  item: {
    label: {type: "text", req: true, doc: "What the line is about."},
    text: {type: "text", req: true, doc: "The line itself. Phone numbers become a link to call."}
  }
};

/* ---------- checks ---------- */

/**
 * Checks a parsed trip file against FIELDS, plus the few rules that tie fields
 * together. Errors stop the file from loading; warnings do not.
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validateTrip(trip){
  const errors = [], warnings = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  const warn = (path, msg) => warnings.push(`${path}: ${msg}`);

  function value(v, f, path){
    switch(f.type){
      case "fixed": if(v !== f.value) err(path, `must be "${f.value}"`); return;
      case "yes": if(v !== true) err(path, "must be true, or left out"); return;
      case "any": return;
      case "number":
        if(!isNum(v) || v < f.min || v > f.max) err(path, `must be a number between ${f.min} and ${f.max}`);
        return;
      case "text":
        if(!isStr(v)){ err(path, "must be a non-empty text"); return; }
        if(f.values && !f.values.includes(v)){
          const msg = `should be one of ${f.values.map(x => `"${x}"`).join(", ")}`;
          if(f.soft) warn(path, msg + "; shown as a plain one"); else err(path, msg);
        }
        if((f.pattern && !f.pattern.test(v)) || (f.test && !f.test(v))) err(path, `must be ${f.hint}`);
        else if(f.advise && !f.advise(v)) warn(path, `should be ${f.hint}; shown as written`);
        return;
      case "list":
        if(!Array.isArray(v)){ err(path, "must be a list"); return; }
        if(f.min && v.length < f.min) err(path, f.min === 1 ? "must not be empty" : `needs at least ${f.min} entries`);
        v.forEach((x, i) => value(x, f.item || {type: f.of}, `${path}[${i}]`));
        return;
      case "stay":
        if(typeof v === "string") value(v, {type: "text"}, path); else object(v, "stay", path);
        return;
      default:
        object(v, f.type, path);
    }
  }

  function object(o, kind, path){
    if(!isObj(o)){ err(path, "must be an object"); return; }
    const fields = FIELDS[kind];
    for(const [k, f] of Object.entries(fields)){
      if(o[k] === undefined){ if(f.req) err(path ? `${path}.${k}` : k, "is required"); continue; }
      value(o[k], f, path ? `${path}.${k}` : k);
    }
    for(const k of Object.keys(o)) if(!fields[k]) warn(path ? `${path}.${k}` : k, "unknown field, ignored");
    RULES[kind] && RULES[kind](o, path, err, warn);
  }

  if(!isObj(trip)) return {ok: false, errors: ["The file must contain one JSON object, starting with {"], warnings};
  if(trip.format === FORMAT_1) return {ok: false, errors: [`format: "${FORMAT_1}" is the old format: load it in the app, which converts it`], warnings};
  object(trip, "trip", "");
  return {ok: errors.length === 0, errors, warnings};
}

// What one field cannot say alone.
const RULES = {
  trip(t, path, err){
    const days = Array.isArray(t.days) ? t.days : [];
    days.forEach((d, i) => {
      if(i && isObj(d) && isObj(days[i - 1]) && isStr(d.date) && !(d.date > days[i - 1].date)) err(`days[${i}].date`, "must come after the day before: one entry per date, in order");
    });
    unique(t.expenses, "expenses", err);
    (Array.isArray(t.expenses) ? t.expenses : []).forEach((x, i) => {
      if(isObj(x) && x.stop !== undefined) err(`expenses[${i}].stop`, "only private expenses have a stop: what the trip pays at a stop is its \"cost\"");
    });
    if(t.version !== undefined){
      const v = t.version, ok = isObj(v) && HASH.test(v.id) && ["parents", "history"].every(k => Array.isArray(v[k]) && v[k].every(x => HASH.test(x)));
      if(!ok) err("version", "is written by the app: keep it as it is, or remove it");
    }
  },
  day(d, path, err, warn){
    if((d.stops === undefined) === (d.plans === undefined)) err(path, "needs \"stops\" or \"plans\" (one of the two)");
    const lists = Array.isArray(d.plans) ? d.plans.map(p => isObj(p) && p.stops) : [d.stops];
    lists.forEach((l, j) => unique(l, `${path}${d.plans ? `.plans[${j}]` : ""}.stops`, err));
    unique(d.plans, `${path}.plans`, err);
    const all = lists.flatMap(l => Array.isArray(l) ? l : []);
    if(all.length && all.every(s => !isObj(s) || s.lat === undefined)) warn(path, "no stop has lat/lng: this day has no map");
    // Alternatives: one chosen in a group (two: the first by time is shown).
    lists.forEach((l, j) => {
      const chosen = new Map();
      for(const s of Array.isArray(l) ? l : []) if(isObj(s) && s.chosen === true && isStr(s.choice)) chosen.set(s.choice.trim(), (chosen.get(s.choice.trim()) || 0) + 1);
      for(const [g, n] of chosen) if(n > 1) warn(`${path}${d.plans ? `.plans[${j}]` : ""}.stops`, `${n} options of "${g}" are chosen: one is enough (the first by time is shown)`);
    });
    if(Array.isArray(d.plans) && d.plans.filter(p => isObj(p) && p.chosen === true).length > 1) warn(`${path}.plans`, "more than one plan is chosen: the first is shown");
  },
  private(p, path, err){
    unique(p.expenses, `${path}.expenses`, err);
  },
  expense(x, path, err){
    if(x.stop !== undefined && x.date === undefined) err(path, "\"stop\" needs \"date\", the day of the stop");
  },
  stop(s, path, err, warn){
    if((s.lat === undefined) !== (s.lng === undefined)) err(path, "\"lat\" and \"lng\" go together");
    if(s.currency !== undefined && s.cost === undefined) warn(path, "\"currency\" without \"cost\" says nothing");
  }
};

// Ids written by the app must stay unique in their list.
function unique(list, path, err){
  if(!Array.isArray(list)) return;
  const seen = new Set();
  list.forEach((x, i) => {
    if(!isObj(x) || !isStr(x.id)) return;
    if(seen.has(x.id)) err(`${path}[${i}].id`, `"${x.id}" is used twice`);
    seen.add(x.id);
  });
}

/* ---------- JSON Schema, for assistants and tools that can follow one ---------- */

/** The format as a JSON Schema (draft 2020-12), made from FIELDS. */
export function tripSchema(){
  const prop = f => {
    const doc = {description: f.doc};
    switch(f.type){
      case "fixed": return {...doc, const: f.value};
      case "yes": return {...doc, const: true};
      case "any": return doc;
      case "number": return {...doc, type: "number", minimum: f.min, maximum: f.max};
      case "text": return {...doc, type: "string", minLength: 1, ...(f.values && !f.soft ? {enum: f.values} : {}), ...(f.values && f.soft ? {examples: f.values} : {}), ...(f.pattern ? {pattern: f.pattern.source} : {}), ...(f.examples ? {examples: f.examples} : {})};
      case "list": return {...doc, type: "array", ...(f.min ? {minItems: f.min} : {}), items: f.of === "text" ? {type: "string", minLength: 1, ...(f.item && f.item.pattern ? {pattern: f.item.pattern.source} : {})} : {$ref: `#/$defs/${f.of}`}};
      case "stay": return {...doc, anyOf: [{type: "string", minLength: 1}, {$ref: "#/$defs/stay"}]};
      default: return {...doc, $ref: `#/$defs/${f.type}`};
    }
  };
  const def = kind => {
    const fields = Object.entries(FIELDS[kind]);
    return {type: "object", properties: Object.fromEntries(fields.map(([k, f]) => [k, prop(f)])), required: fields.filter(([, f]) => f.req).map(([k]) => k)};
  };
  const defs = Object.fromEntries(Object.keys(FIELDS).filter(k => k !== "trip").map(k => [k, def(k)]));
  defs.day.oneOf = [{required: ["stops"]}, {required: ["plans"]}];
  defs.stop.dependentRequired = {lat: ["lng"], lng: ["lat"]};
  return {$schema: "https://json-schema.org/draft/2020-12/schema", title: "TIMP trip file", ...def("trip"), $defs: defs};
}

/* ---------- the format in a few lines, for any AI assistant ---------- */

// The smallest useful file, shown in the brief: one of everything an assistant must get right.
const EXAMPLE = {
  format: FORMAT,
  title: "Rome in three days",
  lang: "en",
  days: [{
    date: "2027-04-10", city: "Rome", title: "The ancient city",
    stay: {name: "Hotel Example", address: "Via Cavour 1, Rome"},
    notes: ["Colosseum tickets booked for 9:00"],
    stops: [
      {time: "09:00", title: "Colosseum", type: "sight", text: "Enter from the Via Sacra side.", address: "Piazza del Colosseo, Rome", lat: 41.8902, lng: 12.4922},
      {time: "midday", title: "Lunch in Monti", type: "food", travel: "metro"}
    ]
  }],
  info: [{title: "In case of need", items: [{label: "Emergency", text: "112"}]}]
};

/**
 * The whole format in about forty lines of plain text, made from FIELDS: what a
 * person pastes into any chat, so the assistant needs no link and no browsing.
 */
export function formatBrief(){
  const kind = (k, name) => {
    const f = FIELDS[k][name];
    if(f.type === "fixed") return `  ${name} (required): ${JSON.stringify(f.value)}`;
    const what = f.type === "list" ? `list of ${f.item ? f.item.hint : f.of}` : f.type === "stay" ? "text or stay"
      : f.type === "number" ? (f.max >= 1e9 ? `number, ${f.min} or more` : `number from ${f.min} to ${f.max}`) : f.values ? f.values.join("|") : f.hint || f.type;
    return `  ${name}${f.req ? " (required)" : ""}: ${what}. ${f.doc}`;
  };
  const shown = ([, f]) => !f.byApp && f.inBrief !== false;
  const block = k => `${k}:\n` + Object.entries(FIELDS[k]).filter(shown).map(([n]) => kind(k, n)).join("\n");
  // Only the kinds an assistant writes: those its fields lead to (not basedOn, the app's).
  const kinds = new Set(["trip"]);
  for(const k of Object.keys(FIELDS)) for(const e of Object.entries(FIELDS[k]).filter(shown)) for(const x of [e[1].type, e[1].of]) if(FIELDS[x]) kinds.add(x);
  return [
    `TIMP trip file, format "${FORMAT}". Answer with ONE JSON object in one code block: double quotes, no comments, no trailing commas. Use only these fields; invent none.`,
    "",
    ...Object.keys(FIELDS).filter(k => kinds.has(k)).map(block),
    "",
    "Rules: days in date order, one per date. A day has stops or plans (two or more), never both. Plans only when the whole day changes; for one meal, a choice. lat and lng go together. No colours, icons, ids or versions: the app adds them. Do not invent bookings, hotels or prices. A cost is what the traveller pays: their share if split. Give lat/lng only for places you are sure about; otherwise an address.",
    "",
    "Example:",
    JSON.stringify(EXAMPLE)
  ].join("\n");
}

/* ---------- what the app works out from the content ---------- */

/** "Caffè Greco" → "caffe-greco": text made fit for an id. */
export function slug(text, fallback = "stop"){
  return String(text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "") || fallback;
}

/**
 * The trip's id when the file has none: its title and first date, so a corrected file
 * an assistant writes again for the same trip updates it instead of adding another.
 */
export const tripId = trip => `${slug(trip.title, "trip")}-${trip.days[0].date}`;

/** The cities of a trip, in the order they first appear. A day's colour is its city's. */
export function citiesOf(trip){
  return [...new Set(trip.days.map(d => d.city || ""))];
}

/** A day's stay as an object, whether the file gives a name or {name, address, note}. */
export const stayOf = s => !s ? null : typeof s === "string" ? {name: s} : s;

/** The place a stop stands for, as text for Google Maps: its address, or its position. */
export function placeQuery(s){
  if(s.address) return s.address;
  if(s.lat !== undefined) return s.lat + "," + s.lng;
  return "";
}

/**
 * The kind of a place, from the tags OpenStreetMap or Google give it. Null when none
 * of TYPES fits.
 */
export function typeFrom(tags){
  const has = (...xs) => xs.some(x => tags.includes(x));
  if(has("museum", "gallery", "art_gallery", "arts_centre")) return "museum";
  if(has("hotel", "hostel", "guest_house", "apartment", "motel", "lodging", "camp_site")) return "hotel";
  if(has("restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "food_court", "bakery", "food", "meal_takeaway", "biergarten")) return "food";
  if(has("viewpoint", "peak")) return "view";
  if(has("park", "garden", "nature_reserve", "beach", "zoo", "national_park", "natural_feature")) return "park";
  if(has("shop", "marketplace", "mall", "store", "shopping_mall", "department_store", "supermarket")) return "shop";
  if(has("attraction", "artwork", "monument", "memorial", "castle", "ruins", "place_of_worship", "church", "tourist_attraction", "historic", "archaeological_site", "fountain")) return "sight";
  return null;
}

/* ---------- the old format ---------- */

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined && o[k] !== "").map(k => [k, o[k]]));

/**
 * A travel-in-my-pocket/1 file in the new format; any other value is returned as it
 * is. Nothing that matters to the traveller is lost: map settings (zones, pictures,
 * labels, colours) are dropped, the app works them out now. The result is the same on
 * every device, so the version it becomes is the same too.
 */
export function upgrade(trip){
  if(!isObj(trip) || trip.format !== FORMAT_1) return trip;
  const places = isObj(trip.places) ? trip.places : {}, stays = isObj(trip.stays) ? trip.stays : {};
  const stop = s => !isObj(s) ? s : {...pick(s, ["id", "time", "title", "travel", "text", "tag"]), ...(s.query ? {address: s.query} : {}), ...pick(s, ["lat", "lng", "link"])};
  const stay = d => {
    const s = d.stay && stays[d.stay];
    if(!s) return d.stayText || undefined;
    const address = s.address || s.query;
    return address || s.note ? {name: s.name, ...(address ? {address} : {}), ...pick(s, ["note"])} : s.name;
  };
  const day = d => !isObj(d) ? d : {
    date: d.date,
    ...(places[d.place] ? {city: places[d.place].name} : {}),
    ...pick(d, ["title"]),
    ...(stay(d) ? {stay: stay(d)} : {}),
    ...(d.reminders || d.note ? {notes: [...(d.reminders || []), ...(d.note ? [d.note] : [])]} : {}),
    ...(Array.isArray(d.plans) ? {plans: d.plans.map(p => isObj(p) ? {...pick(p, ["id", "name"]), stops: (p.stops || []).map(stop)} : p)} : {stops: (d.stops || []).map(stop)})
  };
  const info = (Array.isArray(trip.info) ? trip.info : []).map(sec => !isObj(sec) ? sec : {
    title: sec.title,
    items: (sec.rows || []).map(r => !isObj(r) ? r : {label: r.label, text: [r.number, r.text].filter(Boolean).join(" · ")})
  });
  if(trip.infoNote) info.push({title: trip.lang === "it" ? "Note" : "Notes", items: [{label: trip.lang === "it" ? "Nota" : "Note", text: trip.infoNote}]});
  return {
    format: FORMAT,
    ...pick(trip, ["id", "version", "title", "lang", "timezone"]),
    ...(trip.map && trip.map.googleMapsKey ? {googleMapsKey: trip.map.googleMapsKey} : {}),
    days: (trip.days || []).map(day),
    ...(info.length ? {info} : {})
  };
}
