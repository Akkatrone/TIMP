// What the app works out about a place from the stop itself: the part of the world it
// is in, the review site people there use, whether it is closed on the stop's day, and
// the language of its local name. Nothing of this is in the file. No DOM here.

import { WEEKDAYS } from "./trip.js";

// Rough boxes [south, north, west, east], checked in order: the first that holds the
// point wins. Good away from borders, which is enough to pick a website. Tsushima
// comes before Korea, Korea before Japan; Mexico is left out of North America.
const REGIONS = [
  ["jp", [34.0, 34.75, 129.15, 129.5]],     // Tsushima
  ["kr", [33.9, 38.7, 124.5, 129.6]],
  ["kr", [33.1, 33.6, 126.1, 127.0]],       // Jeju
  ["kr", [37.4, 37.6, 130.75, 131.0]],      // Ulleungdo
  ["jp", [30.9, 34.75, 128.5, 146.0]],      // Kyushu, Shikoku, the south of Honshu
  ["jp", [34.75, 41.6, 130.8, 146.0]],      // Honshu
  ["jp", [41.3, 45.6, 139.2, 146.0]],       // Hokkaido
  ["jp", [24.0, 30.9, 122.9, 131.4]],       // Okinawa and the islands to the south
  ["jp", [20.0, 30.9, 136.0, 154.0]],       // Ogasawara
  ["na", [32.55, 72.0, -170.0, -116.0]],    // the west, Alaska, western Canada
  ["na", [32.7, 72.0, -116.0, -114.7]],
  ["na", [31.33, 72.0, -114.7, -106.5]],
  ["na", [31.8, 72.0, -106.5, -52.0]],      // the rest of the United States and Canada
  ["na", [29.0, 31.8, -104.0, -93.5]],      // Texas
  ["na", [25.8, 29.0, -99.5, -93.5]],
  ["na", [24.4, 31.0, -93.5, -79.9]],       // the Gulf coast, Florida
  ["na", [18.9, 22.3, -160.3, -154.8]],     // Hawaii
  ["", [35.8, 37.4, -2.0, 11.6]],           // Algeria and Tunisia, not Europe
  ["eu", [35.8, 71.5, -10.5, 25.0]],
  ["eu", [27.6, 29.5, -18.2, -13.3]],       // the Canary Islands
  ["eu", [32.6, 33.2, -17.3, -16.2]],       // Madeira
  ["eu", [36.9, 39.8, -31.5, -25.0]]        // the Azores
];

// Without a position: the trip's time zone says where it is.
const ZONES = {jp: /^Asia\/Tokyo$/, kr: /^Asia\/Seoul$/,
  na: /^(America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Detroit|Boise|Indiana\/.+|Kentucky\/.+|Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina)|Pacific\/Honolulu)$/,
  eu: /^(Europe\/(Rome|Paris|Madrid|Lisbon|Brussels|Amsterdam|Zurich|Vienna|Stockholm|Copenhagen|London|Dublin|Monaco|Luxembourg|Vatican|San_Marino|Berlin|Oslo|Helsinki|Athens|Prague|Budapest|Warsaw)|Atlantic\/(Canary|Madeira|Azores))$/};

/** The part of the world of a stop: "jp", "kr", "na", "eu", or "" for any other. */
export function regionOf(stop, timezone){
  if(stop && typeof stop.lat === "number" && typeof stop.lng === "number"){
    const hit = REGIONS.find(([, [s, n, w, e]]) => stop.lat >= s && stop.lat <= n && stop.lng >= w && stop.lng <= e);
    return hit ? hit[0] : "";
  }
  for(const [region, re] of Object.entries(ZONES)) if(re.test(timezone || "")) return region;
  return "";
}

const q = s => encodeURIComponent(s);
// TheFork's site in the app's language; the English one otherwise.
const THEFORK = {it: "thefork.it"};

/**
 * Where people of that part of the world read about a place to eat, as a link the
 * traveller taps: nothing is fetched by the app. Japan: Tabelog, searched by the
 * local name when there is one. Korea: Naver Map. North America: Yelp. Europe:
 * TheFork, through a web search on its site in the app's language (thefork.it lists
 * restaurants of every country too). Its own search goes by city code, not by name,
 * and it lists only its partners: a list of results shows at once whether the place
 * is there, where a jump to the first one could land on another restaurant.
 * Elsewhere none: the Map link already opens Google, with its reviews.
 * @returns {{site: string, url: string} | null}
 */
export function reviewSite(stop, {city, timezone, lang} = {}){
  if(!stop || stop.type !== "food") return null;
  const name = stop.local || stop.title;
  switch(regionOf(stop, timezone)){
    case "jp": return {site: "Tabelog", url: "https://tabelog.com/en/rstLst/?sw=" + q(name)};
    case "kr": return {site: "Naver", url: "https://map.naver.com/p/search/" + q(name)};
    case "na": {
      const where = stop.address || city || "";
      return {site: "Yelp", url: "https://www.yelp.com/search?find_desc=" + q(stop.title) + (where ? "&find_loc=" + q(where) : "")};
    }
    case "eu": return {site: "TheFork", url: "https://www.google.com/search?q=" + q([`site:${THEFORK[lang] || "thefork.com"}`, stop.title, city].filter(Boolean).join(" "))};
    default: return null;
  }
}

/**
 * Whether a stop is closed on a date ("YYYY-MM-DD"): {weekday: "mon"} when that day
 * of the week is in `closed`, {date} when the date itself is, or null.
 */
export function closedOn(stop, date){
  const list = stop && Array.isArray(stop.closed) ? stop.closed : [];
  if(list.includes(date)) return {date};
  const weekday = WEEKDAYS[new Date(date + "T12:00:00Z").getUTCDay()];
  return list.includes(weekday) ? {weekday} : null;
}

/**
 * The language of a local name, for the lang attribute (it picks the right glyphs):
 * kana is Japanese, hangul Korean; Chinese characters alone follow the region.
 */
export function localLang(text, region){
  const s = String(text || "");
  if(/[぀-ヿ]/.test(s)) return "ja";
  if(/[가-힯ᄀ-ᇿ]/.test(s)) return "ko";
  if(/[一-鿿]/.test(s)) return region === "jp" ? "ja" : region === "kr" ? "ko" : "zh";
  return "";
}
