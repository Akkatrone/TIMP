// Sunrise and sunset, worked out from the date and the place: nothing in the trip file,
// no network. The sunrise equation (the NOAA formulas in their short form), good to a
// minute or two away from the poles. No DOM here.
//
// The app uses it to tell the stops of the day from those after dark: they get a
// darker shade on the map and a moon in the list.

const RAD = Math.PI / 180;
const sin = d => Math.sin(d * RAD), cos = d => Math.cos(d * RAD);
const J2000 = 2451545, UNIX_EPOCH_JD = 2440587.5, DAY_MS = 86400000;

/**
 * When the sun rises and sets on `date` ("YYYY-MM-DD") at `lat`, `lng`.
 * @returns {{sunrise: Date, sunset: Date} | null}  null when the sun does not rise or
 *   does not set that day (polar day or night).
 */
export function sunTimes(date, lat, lng){
  const noon = new Date(date + "T12:00:00Z").getTime();
  if(!Number.isFinite(noon) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const n = Math.round(noon / DAY_MS + UNIX_EPOCH_JD - J2000 + 0.0008);
  const meanNoon = n - lng / 360;                                        // mean solar noon
  const M = (357.5291 + 0.98560028 * meanNoon) % 360;                    // solar mean anomaly
  const C = 1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M);   // equation of the centre
  const L = (M + C + 180 + 102.9372) % 360;                              // ecliptic longitude
  const transit = J2000 + meanNoon + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
  const decl = Math.asin(sin(L) * sin(23.4397)) / RAD;
  const cosH = (sin(-0.833) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl));
  if(cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH) / RAD / 360;
  const toDate = jd => new Date((jd - UNIX_EPOCH_JD) * DAY_MS);
  return {sunrise: toDate(transit - H), sunset: toDate(transit + H)};
}

/** Minutes after midnight of a moment, on the clock of `timezone` (the phone's if absent). */
export function clockOf(when, timezone){
  const parts = new Intl.DateTimeFormat("en-GB", {timeZone: timezone || undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(when);
  const get = type => +parts.find(p => p.type === type).value;
  return get("hour") * 60 + get("minute");
}

/**
 * Sunrise and sunset on the local clock of the trip, as minutes after midnight.
 * @returns {{sunrise: number, sunset: number} | null}
 */
export function daylight(date, lat, lng, timezone){
  const t = sunTimes(date, lat, lng);
  if(!t) return null;
  try{ return {sunrise: clockOf(t.sunrise, timezone), sunset: clockOf(t.sunset, timezone)}; }
  catch(e){ return null; }   // a time zone the phone does not know
}

// Words used for times ("Evening", "Cena"), and the part of the day they mean.
const WORDS = [
  ["night", /evening|night|dinner|sunset|sera|notte|cena|tramonto|aperitivo/i],
  ["afternoon", /afternoon|lunch|pomeriggio|pranzo/i],
  ["morning", /morning|breakfast|sunrise|mattin|colazione|alba/i]
];

/**
 * The part of the day of each stop of a list: "morning", "afternoon" or "night" (after
 * sunset or before sunrise). Clock times are compared with `light`; words such as
 * "Evening" say it themselves; a stop with neither takes the part of the stop before.
 * @param {(time: string) => number|null} minutesOf  reads "09:30" (clockMinutes in js/edit.js)
 */
export function partsOfDay(list, light, minutesOf){
  const noon = light ? (light.sunrise + light.sunset) / 2 : 13 * 60;
  const rise = light ? light.sunrise : 7 * 60, set = light ? light.sunset : 19 * 60;
  let last = "morning";
  return list.map(s => {
    const m = s.time ? minutesOf(s.time) : null;
    if(m !== null){
      last = m < rise || m >= set ? "night" : m < noon ? "morning" : "afternoon";
    }else if(s.time){
      const word = WORDS.find(([, re]) => re.test(s.time));
      if(word) last = word[0];
    }
    return last;
  });
}
