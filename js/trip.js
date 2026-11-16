// Trip file format: validation and small pure helpers.
// No DOM in this file: it is also used by tools/validate-trip.mjs under Node.

export const FORMAT = "travel-in-my-pocket/1";

// How a stop can be travelled. Keep in step with js/icons.js and docs/trip-format.md.
export const TRAVEL = ["metro", "bus", "train", "plane", "boat"];

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const HASH = /^[0-9a-f]{16}$/;
const HTTPS = /^https:\/\/[^\s<>"]+$/;

const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = v => typeof v === "string" && v.trim() !== "";
const isNum = v => typeof v === "number" && Number.isFinite(v);

function validDate(s){
  if(!DATE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validTimezone(tz){
  try{ new Intl.DateTimeFormat("en", {timeZone: tz}); return true; }catch(e){ return false; }
}

/**
 * Checks a parsed trip file.
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validateTrip(trip){
  const errors = [], warnings = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  const warn = (path, msg) => warnings.push(`${path}: ${msg}`);

  if(!isObj(trip)){ return {ok: false, errors: ["The file must contain a JSON object."], warnings}; }

  const optStr = (obj, key, path) => {
    if(obj[key] !== undefined && typeof obj[key] !== "string") err(`${path}.${key}`, "must be a string");
  };
  const reqStr = (obj, key, path) => {
    if(!isStr(obj[key])) err(`${path}.${key}`, "is required and must be a non-empty string");
  };
  const known = (obj, keys, path) => {
    Object.keys(obj).forEach(k => { if(!keys.includes(k)) warn(`${path}.${k}`, "unknown field, ignored"); });
  };

  if(trip.format !== FORMAT) err("format", `must be "${FORMAT}"`);
  if(!isStr(trip.id) || !ID.test(trip.id)) err("id", "is required: lowercase letters, digits and dashes (e.g. \"rome-2027\")");
  reqStr(trip, "title", "trip");
  optStr(trip, "lang", "trip");
  if(trip.timezone !== undefined && (!isStr(trip.timezone) || !validTimezone(trip.timezone))) err("timezone", "must be an IANA time zone such as \"Europe/Rome\"");
  known(trip, ["format", "id", "version", "title", "lang", "timezone", "places", "stays", "days", "info", "infoNote", "map"], "trip");

  // version: written by the app, see js/version.js
  if(trip.version !== undefined){
    const v = trip.version;
    if(!isObj(v)) err("version", "must be an object");
    else {
      if(!HASH.test(v.id)) err("version.id", "must be 16 lowercase hex characters");
      ["parents", "history"].forEach(k => {
        if(!Array.isArray(v[k]) || v[k].some(x => !HASH.test(x))) err(`version.${k}`, "must be a list of version ids");
      });
      if(Array.isArray(v.parents) && v.parents.length > 2) err("version.parents", "has at most two versions");
      optStr(v, "date", "version");
      known(v, ["id", "parents", "history", "date"], "version");
    }
  }

  // places
  const places = isObj(trip.places) ? trip.places : {};
  if(!isObj(trip.places) || !Object.keys(trip.places).length) err("places", "is required and must contain at least one place");
  Object.entries(places).forEach(([key, p]) => {
    const path = `places.${key}`;
    if(!ID.test(key)) err(path, "key must use lowercase letters, digits and dashes");
    if(!isObj(p)){ err(path, "must be an object"); return; }
    reqStr(p, "name", path);
    optStr(p, "glyph", path);
    if(!isStr(p.color) || !HEX.test(p.color)) err(`${path}.color`, "is required: a colour like \"#4f9a2a\"");
    if(p.colorDark !== undefined && (!isStr(p.colorDark) || !HEX.test(p.colorDark))) err(`${path}.colorDark`, "must be a colour like \"#86c95a\"");
    known(p, ["name", "glyph", "color", "colorDark"], path);
  });
  const hasPlace = k => Object.prototype.hasOwnProperty.call(places, k);

  // stays
  const stays = isObj(trip.stays) ? trip.stays : {};
  if(trip.stays !== undefined && !isObj(trip.stays)) err("stays", "must be an object");
  Object.entries(stays).forEach(([key, s]) => {
    const path = `stays.${key}`;
    if(!ID.test(key)) err(path, "key must use lowercase letters, digits and dashes");
    if(!isObj(s)){ err(path, "must be an object"); return; }
    reqStr(s, "name", path);
    if(!isStr(s.place) || !hasPlace(s.place)) err(`${path}.place`, "must be one of the keys in \"places\"");
    ["address", "dates", "note", "query"].forEach(k => optStr(s, k, path));
    known(s, ["name", "place", "address", "dates", "note", "query"], path);
  });
  const hasStay = k => Object.prototype.hasOwnProperty.call(stays, k);

  // stops
  const checkStops = (list, path) => {
    if(!Array.isArray(list) || !list.length){ err(path, "must be a non-empty list"); return; }
    const ids = new Set();
    list.forEach((s, i) => {
      const p = `${path}[${i}]`;
      if(!isObj(s)){ err(p, "must be an object"); return; }
      reqStr(s, "time", p);
      reqStr(s, "title", p);
      ["text", "mapLabel", "query", "tag"].forEach(k => optStr(s, k, p));
      if(s.link !== undefined && (!isStr(s.link) || !HTTPS.test(s.link) || s.link.length > 2000)) err(`${p}.link`, "must be an https:// address");
      if(s.travel !== undefined && !TRAVEL.includes(s.travel)) err(`${p}.travel`, `must be one of ${TRAVEL.map(x => `"${x}"`).join(", ")}`);
      if(s.id !== undefined){
        if(!isStr(s.id) || !ID.test(s.id)) err(`${p}.id`, "must use lowercase letters, digits and dashes");
        else if(ids.has(s.id)) err(`${p}.id`, `"${s.id}" is used twice in this list`);
        else ids.add(s.id);
      }
      const hasLat = s.lat !== undefined, hasLng = s.lng !== undefined;
      if(hasLat !== hasLng) err(p, "\"lat\" and \"lng\" must be given together");
      if(hasLat && (!isNum(s.lat) || s.lat < -90 || s.lat > 90)) err(`${p}.lat`, "must be a number between -90 and 90");
      if(hasLng && (!isNum(s.lng) || s.lng < -180 || s.lng > 180)) err(`${p}.lng`, "must be a number between -180 and 180");
      if(!hasLat && s.mapLabel !== undefined) warn(`${p}.mapLabel`, "has no effect without lat/lng");
      known(s, ["id", "time", "title", "text", "lat", "lng", "mapLabel", "query", "link", "tag", "travel"], p);
    });
  };

  // days
  if(!Array.isArray(trip.days) || !trip.days.length) err("days", "is required and must be a non-empty list");
  let prevDate = null;
  (Array.isArray(trip.days) ? trip.days : []).forEach((d, i) => {
    const path = `days[${i}]`;
    if(!isObj(d)){ err(path, "must be an object"); return; }
    if(!isStr(d.date) || !validDate(d.date)) err(`${path}.date`, "is required: a real date as \"YYYY-MM-DD\"");
    else {
      if(prevDate && d.date <= prevDate) err(`${path}.date`, "days must be in ascending date order, one entry per date");
      prevDate = d.date;
    }
    if(!isStr(d.place) || !hasPlace(d.place)) err(`${path}.place`, "must be one of the keys in \"places\"");
    if(d.from !== undefined && (!isStr(d.from) || !hasPlace(d.from))) err(`${path}.from`, "must be one of the keys in \"places\"");
    if(d.stay !== undefined && (!isStr(d.stay) || !hasStay(d.stay))) err(`${path}.stay`, "must be one of the keys in \"stays\"");
    optStr(d, "stayText", path);
    reqStr(d, "title", path);
    optStr(d, "note", path);
    if(d.reminders !== undefined && (!Array.isArray(d.reminders) || d.reminders.some(r => !isStr(r)))) err(`${path}.reminders`, "must be a list of strings");
    if(d.zoneNames !== undefined && (!Array.isArray(d.zoneNames) || d.zoneNames.some(z => typeof z !== "string"))) err(`${path}.zoneNames`, "must be a list of strings");
    if(d.mapSplitKm !== undefined && (!isNum(d.mapSplitKm) || d.mapSplitKm <= 0)) err(`${path}.mapSplitKm`, "must be a positive number");

    const hasStops = d.stops !== undefined, hasPlans = d.plans !== undefined;
    if(hasStops === hasPlans) err(path, "needs either \"stops\" or \"plans\" (not both)");
    if(hasStops) checkStops(d.stops, `${path}.stops`);
    const planIds = new Set();
    if(hasPlans){
      if(!Array.isArray(d.plans) || d.plans.length < 2) err(`${path}.plans`, "must list at least two alternative plans");
      else d.plans.forEach((p, j) => {
        const pp = `${path}.plans[${j}]`;
        if(!isObj(p)){ err(pp, "must be an object"); return; }
        if(!isStr(p.id) || !ID.test(p.id)) err(`${pp}.id`, "is required: lowercase letters, digits and dashes");
        else if(planIds.has(p.id)) err(`${pp}.id`, `"${p.id}" is used twice`);
        else planIds.add(p.id);
        reqStr(p, "name", pp);
        if(p.zoneNames !== undefined && (!Array.isArray(p.zoneNames) || p.zoneNames.some(z => typeof z !== "string"))) err(`${pp}.zoneNames`, "must be a list of strings");
        checkStops(p.stops, `${pp}.stops`);
        known(p, ["id", "name", "zoneNames", "stops"], pp);
      });
    }

    if(d.mapZones !== undefined){
      if(!Array.isArray(d.mapZones) || !d.mapZones.length) err(`${path}.mapZones`, "must be a non-empty list");
      else d.mapZones.forEach((z, j) => {
        const zp = `${path}.mapZones[${j}]`;
        if(!isObj(z)){ err(zp, "must be an object"); return; }
        optStr(z, "name", zp);
        if(!Array.isArray(z.points) || !z.points.length){ err(`${zp}.points`, "must be a non-empty list"); return; }
        z.points.forEach((pt, k) => {
          const tp = `${zp}.points[${k}]`;
          if(!isObj(pt)){ err(tp, "must be an object"); return; }
          reqStr(pt, "name", tp);
          optStr(pt, "query", tp);
          if(!isNum(pt.lat) || pt.lat < -90 || pt.lat > 90) err(`${tp}.lat`, "is required: a number between -90 and 90");
          if(!isNum(pt.lng) || pt.lng < -180 || pt.lng > 180) err(`${tp}.lng`, "is required: a number between -180 and 180");
          if(pt.reference !== undefined && typeof pt.reference !== "boolean") err(`${tp}.reference`, "must be true or false");
          known(pt, ["name", "lat", "lng", "query", "reference"], tp);
        });
        if(z.points.every(pt => isObj(pt) && pt.reference)) err(`${zp}.points`, "needs at least one point that is not a reference");
      });
    }

    if(d.mapImages !== undefined){
      if(!Array.isArray(d.mapImages)) err(`${path}.mapImages`, "must be a list");
      else d.mapImages.forEach((im, j) => {
        const ip = `${path}.mapImages[${j}]`;
        if(!isObj(im)){ err(ip, "must be an object"); return; }
        if(!isStr(im.src) || !IMG.test(im.src)) err(`${ip}.src`, "must be an embedded image: \"data:image/jpeg;base64,...\" (png, jpeg or webp)");
        if(!Number.isInteger(im.width) || im.width <= 0) err(`${ip}.width`, "is required: width in pixels");
        if(!Number.isInteger(im.height) || im.height <= 0) err(`${ip}.height`, "is required: height in pixels");
        if(im.zone !== undefined && (!Number.isInteger(im.zone) || im.zone < 0)) err(`${ip}.zone`, "must be a zone index starting from 0");
        if(im.plan !== undefined && !planIds.has(im.plan)) err(`${ip}.plan`, "must be the id of one of this day's plans");
        optStr(im, "credit", ip);
        if(!Array.isArray(im.pins) || im.pins.some(n => !isStr(n))) err(`${ip}.pins`, "is required: the names of the numbered pins in the picture, in order");
        known(im, ["src", "width", "height", "zone", "plan", "credit", "pins"], ip);
      });
    }

    const lists = hasStops && Array.isArray(d.stops) ? [d.stops] : (Array.isArray(d.plans) ? d.plans.map(p => (isObj(p) && Array.isArray(p.stops)) ? p.stops : []) : []);
    if(!d.mapZones && lists.length && lists.every(l => l.every(s => !isObj(s) || s.lat === undefined))) warn(path, "no stop has coordinates: this day will have no map");
    known(d, ["date", "place", "from", "stay", "stayText", "title", "note", "reminders", "zoneNames", "mapSplitKm", "stops", "plans", "mapZones", "mapImages"], path);
  });

  // info
  if(trip.info !== undefined){
    if(!Array.isArray(trip.info)) err("info", "must be a list of sections");
    else trip.info.forEach((sec, i) => {
      const sp = `info[${i}]`;
      if(!isObj(sec)){ err(sp, "must be an object"); return; }
      reqStr(sec, "title", sp);
      if(!Array.isArray(sec.rows) || !sec.rows.length){ err(`${sp}.rows`, "must be a non-empty list"); return; }
      sec.rows.forEach((r, j) => {
        const rp = `${sp}.rows[${j}]`;
        if(!isObj(r)){ err(rp, "must be an object"); return; }
        reqStr(r, "label", rp);
        optStr(r, "text", rp);
        optStr(r, "number", rp);
        if(!isStr(r.text) && !isStr(r.number)) err(rp, "needs \"text\" or \"number\"");
        known(r, ["label", "text", "number"], rp);
      });
      known(sec, ["title", "rows"], sp);
    });
  }
  optStr(trip, "infoNote", "trip");

  // map
  if(trip.map !== undefined){
    if(!isObj(trip.map)) err("map", "must be an object");
    else {
      optStr(trip.map, "googleMapsKey", "map");
      known(trip.map, ["googleMapsKey"], "map");
    }
  }

  return {ok: errors.length === 0, errors, warnings};
}
