// What of a trip may be published: the copy that leaves for a page anyone with the link
// can read, and what was found in it for the traveller to review first. One function,
// `publishable`, so that every way out (the page, "Open in TIMP", "Use as a base") gives
// the same copy. No DOM, no network.
//
// Never in the copy: private expenses, the Google Maps key, the version and its history,
// the trip's own id (a copy is another trip). Found, and taken out unless the traveller
// keeps them: booking codes, phone numbers and email addresses in the texts (replaced by
// MASK), and where the nights are spent (a stay's address and note, the address and
// position of a stop of type "hotel"). The dates of a trip not over yet can move to a
// year that is plainly not the real one, keeping each day's month and day of the week:
// a published trip should not say when its traveller is away from home.

export const MASK = "•••";

// The year the dates move to when they are not shown: plainly not the trip's.
const SHOWN_YEAR = 2001;

// Keys whose values are not free text written by the traveller: never searched.
const NOT_TEXT = new Set(["format", "lang", "timezone", "currency", "date", "time", "type", "travel", "booking",
  "closed", "id", "link", "lat", "lng", "cost", "version", "private", "googleMapsKey", "owner", "stop"]);

// A booking code after the word that says so ("booking ABC123", "PNR: XK7QL2",
// "prenotazione n. 48213"), or on its own: 6 to 12 capitals and digits, both.
const CODE_AFTER = /\b(?:booking|reservation|confirmation|conferma|prenotazione|codice|code|pnr|ref|reference|riferimento|order|ordine|ticket|biglietto)(?:\s+(?:n[°º.]?|no\.?|number|numero|code|codice))?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,})/gi;
const CODE_ALONE = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,12}\b/g;
// A phone number: 8 digits at least, with the usual separators; never a date.
const PHONE = /(?:\+|\b00)?\d[\d ().\/-]{6,}\d/g;
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

const digits = s => (s.match(/\d/g) || []).length;

/** What in a text looks like a booking code, a phone number, an email: [{kind, match}]. */
export function sensitiveIn(text){
  const out = [], seen = new Set();
  const add = (kind, match) => { const k = kind + "\u0000" + match; if(!seen.has(k)){ seen.add(k); out.push({kind, match}); } };
  for(const m of String(text).matchAll(EMAIL)) add("emails", m[0]);
  const noMail = String(text).replace(EMAIL, " ");
  // A code named as one first: "confirmation 8841-2290" is not a phone number.
  const named = [];
  for(const m of noMail.matchAll(CODE_AFTER)){
    const c = m[1].replace(/-+$/, "");
    if(/\d/.test(c) || (c.length >= 6 && c === c.toUpperCase())){ named.push(c); add("codes", c); }
  }
  for(const m of noMail.matchAll(PHONE)){
    const p = m[0].trim();
    if(digits(p) >= 8 && !DATE_LIKE.test(p) && !named.some(c => c.includes(p) || p.includes(c))) add("phones", p);
  }
  for(const m of noMail.matchAll(CODE_ALONE)) if(!out.some(o => o.kind === "phones" && o.match.includes(m[0]))) add("codes", m[0]);
  return out;
}

// Every text of the trip a person wrote, with where it is and a label for people:
// the stop's title, the section's, the day's.
function* texts(trip){
  function* walk(v, path, label){
    if(typeof v === "string"){ yield {path, value: v, label}; return; }
    if(Array.isArray(v)){ for(let i = 0; i < v.length; i++) yield* walk(v[i], [...path, i], label); return; }
    if(v && typeof v === "object"){
      const here = typeof v.title === "string" ? v.title : typeof v.name === "string" ? v.name : label;
      for(const [k, x] of Object.entries(v)) if(!NOT_TEXT.has(k)) yield* walk(x, [...path, k], here);
    }
  }
  yield* walk({...trip, days: undefined}, [], trip.title);
  for(let i = 0; i < (trip.days || []).length; i++) yield* walk(trip.days[i], ["days", i], trip.days[i].title || trip.days[i].city || `#${i + 1}`);
}

const at = (o, path) => path.reduce((x, k) => x == null ? x : x[k], o);
function put(o, path, value){
  const last = path[path.length - 1], parent = at(o, path.slice(0, -1));
  if(parent != null) parent[last] = value;
}

// Where the nights are spent: a stay given as an object (its address, its note: check-in,
// door codes), and the stops of type "hotel" (their address and position).
function stays(trip){
  const out = [];
  (trip.days || []).forEach((d, i) => {
    if(d.stay && typeof d.stay === "object" && (d.stay.address || d.stay.note)) out.push({path: ["days", i, "stay"], label: d.stay.name, day: i + 1, kind: "stay"});
    const lists = d.plans ? d.plans.map((p, k) => [["plans", k, "stops"], p.stops]) : [[["stops"], d.stops]];
    for(const [where, stops] of lists) (stops || []).forEach((s, j) => {
      if(s.type === "hotel" && (s.address || s.lat != null || s.link)) out.push({path: ["days", i, ...where, j], label: s.title, day: i + 1, kind: "hotel"});
    });
  });
  return out;
}

const DAY = 864e5;
const parse = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = ms => new Date(ms).toISOString().slice(0, 10);

/**
 * How many days the dates move so that the first day falls in SHOWN_YEAR, in the same
 * month and on the same day of the week, as near as can be to the same day of the month.
 */
export function dateShift(first){
  const t = parse(first), d = new Date(t);
  // Within six days either way the same day of the week comes twice: at least one of
  // them is in the same month (months have 28 days or more).
  let best = null;
  for(let off = -6; off <= 6; off++){
    const c = Date.UTC(SHOWN_YEAR, d.getUTCMonth(), d.getUTCDate() + off), cd = new Date(c);
    if(cd.getUTCDay() === d.getUTCDay() && cd.getUTCMonth() === d.getUTCMonth() && (best === null || Math.abs(off) < Math.abs(best.off))) best = {off, c};
  }
  return Math.round((best.c - t) / DAY);
}

/**
 * The copy of a trip that may be published, and what was found in it.
 * @param trip     a trip as the app keeps it (not changed)
 * @param choices  {remove: {codes, phones, emails, stays}: true to take them out (all,
 *                 by default); dates: "hidden" (moved to SHOWN_YEAR, the default) or "real"}
 * @returns {trip, found: {codes, phones, emails, stays}, dates: "hidden"|"real"}
 *   each found entry: {label, match} for texts, {label, day, kind} for stays.
 */
export function publishable(trip, {remove = {}, dates = "hidden"} = {}){
  const take = {codes: true, phones: true, emails: true, stays: true, ...remove};
  const {private: _own, googleMapsKey: _key, version: _version, id: _id, ...content} = trip;
  const out = structuredClone(content);
  const found = {codes: [], phones: [], emails: [], stays: []};

  for(const {path, value, label} of [...texts(out)]){
    let text = value;
    for(const {kind, match} of sensitiveIn(value)){
      found[kind].push({label, match});
      if(take[kind]) text = text.split(match).join(MASK);
    }
    if(text !== value) put(out, path, text);
  }

  for(const s of stays(out)){
    found.stays.push({label: s.label, day: s.day, kind: s.kind});
    if(!take.stays) continue;
    const o = at(out, s.path);
    if(s.kind === "stay"){ delete o.address; delete o.note; }
    else{ delete o.address; delete o.lat; delete o.lng; delete o.link; }
  }

  if(dates !== "real" && out.days && out.days.length){
    const shift = dateShift(out.days[0].date) * DAY;
    const move = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? iso(parse(d) + shift) : d;
    for(const d of out.days){
      d.date = move(d.date);
      for(const s of [...(d.stops || []), ...(d.plans || []).flatMap(p => p.stops || [])]) if(Array.isArray(s.closed)) s.closed = s.closed.map(move);
    }
    for(const e of out.expenses || []) if(e.date) e.date = move(e.date);
  }
  return {trip: out, found, dates: dates === "real" ? "real" : "hidden"};
}

/** A copy of a trip with every date moved so that its first day is `first` ("YYYY-MM-DD"). */
export function moveDates(trip, first){
  const out = structuredClone(trip);
  if(!out.days || !out.days.length || !/^\d{4}-\d{2}-\d{2}$/.test(first || "")) return out;
  const shift = parse(first) - parse(out.days[0].date);
  const move = d => /^\d{4}-\d{2}-\d{2}$/.test(d) ? iso(parse(d) + shift) : d;
  for(const d of out.days) d.date = move(d.date);
  for(const e of out.expenses || []) if(e.date) e.date = move(e.date);
  return out;
}

/**
 * "Use as a base": a published trip made the traveller's own. A trip of its own (no id,
 * no version: the app gives them), its dates from `first` if given, and where it came
 * from in `basedOn`. Nothing else links it to the original.
 * @param pub   the published trip, as the service gives it: {trip, by}
 * @param o     {url: the page's address, first?: the first day}
 */
export function asBase(pub, {url, first} = {}){
  const {id: _id, version: _version, private: _own, basedOn: _was, ...trip} = pub.trip;
  const out = first ? moveDates(trip, first) : structuredClone(trip);
  // Hidden publications contain display dates. Their original calendar
  // exceptions cannot be recovered when planning another visit.
  if(pub.dates === "hidden"){
    for(const day of out.days){
      for(const plan of day.plans || [day]){
        for(const stop of plan.stops || []){
          if(!stop.closed) continue;
          stop.closed = stop.closed.filter(value => !/^\d{4}-/.test(value));
          if(!stop.closed.length) delete stop.closed;
        }
      }
    }
  }
  out.basedOn = {url, title: String(trip.title || ""), by: String(pub.by || "")};
  return out;
}
