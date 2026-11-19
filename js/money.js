// Money: what a stop or an expense cost, in the currency it was paid in, and what that
// makes in another currency at the rate of the day it was paid. No DOM here, no
// network: the rates come in as a table (js/rates.js fetches and keeps them).
//
// A table of rates is {"YYYY-MM-DD": {"JPY": 175.21, "USD": 1.0991, …}}: how much of
// each currency one euro buys that day. Every conversion goes through the euro.

export const BASE = "EUR";

const isNum = v => typeof v === "number" && Number.isFinite(v);

/**
 * The amount in what a traveller typed: "16.000", "16000", "4,50", "1,234.50",
 * "¥ 2 400". One separator followed by exactly three digits groups thousands
 * ("16.000", "1,500"); otherwise the last separator is the decimal one.
 * @returns {number|null} null when there is no amount, or a negative one
 */
export function parseAmount(text){
  const s = String(text == null ? "" : text).replace(/[\s  ']/g, "");
  if(!/\d/.test(s) || /-\s*\d/.test(String(text))) return null;
  const core = s.replace(/^[^\d.,]+/, "").replace(/[^\d.,]+$/, "");
  if(!/^[\d.,]+$/.test(core) || /^[.,]|[.,]$/.test(core)) return null;
  const seps = core.match(/[.,]/g) || [];
  let num;
  if(!seps.length) num = core;
  else{
    const last = Math.max(core.lastIndexOf("."), core.lastIndexOf(","));
    const kinds = new Set(seps);
    const tail = core.slice(last + 1);
    if(kinds.size === 1 && (seps.length > 1 || tail.length === 3)){
      // only one kind of separator: thousands, if every group after the first has three digits
      const parts = core.split(seps[0]);
      if(parts.slice(1).some(p => p.length !== 3)) return null;
      num = parts.join("");
    }else{
      const int = core.slice(0, last).replace(/[.,]/g, "");
      num = int + "." + tail;
    }
  }
  const n = Number(num);
  return Number.isFinite(n) ? n : null;
}

/** How many decimals a currency is written with: 0 for the yen, 2 for the euro. */
export function decimals(currency){
  try{ return new Intl.NumberFormat("en", {style: "currency", currency}).resolvedOptions().maximumFractionDigits; }
  catch(e){ return 2; }
}

/**
 * An amount for people: "4400 ¥", "25,11 €", "$12". Whole amounts lose their ".00";
 * `round` drops the decimals, `compact` shortens big numbers ("1,2 Mln ¥").
 */
export function formatMoney(amount, currency, lang, {round = false, compact = false} = {}){
  if(!isNum(amount)) return "";
  const whole = Math.abs(amount - Math.round(amount)) < 1e-9;
  const opts = {style: "currency", currency, currencyDisplay: "narrowSymbol"};
  if(compact && Math.abs(amount) >= 1e6){ opts.notation = "compact"; opts.maximumFractionDigits = 1; }
  else if(round || whole){ opts.minimumFractionDigits = 0; opts.maximumFractionDigits = round ? 0 : decimals(currency); }
  try{ return new Intl.NumberFormat(lang, opts).format(amount); }
  catch(e){
    try{ return new Intl.NumberFormat(lang, {...opts, currencyDisplay: "code"}).format(amount); }
    catch(e2){ return `${amount} ${currency}`; }
  }
}

/** A number as it is typed back into a form, in the app's language: "16.000", "4,5". */
export function formatPlain(amount, lang){
  if(!isNum(amount)) return "";
  return new Intl.NumberFormat(lang, {maximumFractionDigits: 2}).format(amount);
}

/** One currency against another, for people: 1 € = 175,21 ¥. */
export function formatRate(rate, lang){
  const opts = rate >= 100 ? {maximumFractionDigits: 2} : rate >= 1 ? {maximumFractionDigits: 4} : {maximumSignificantDigits: 4};
  return new Intl.NumberFormat(lang, opts).format(rate);
}

/* ---------- dates and months ---------- */

const monthOf = date => date.slice(0, 7);

// A rate is looked for up to a week before its day: rates of public holidays, or of
// today before they are out.
const GAP = 7;
function shift(date, days){
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last day of a month "YYYY-MM", as "YYYY-MM-DD". */
export function monthEnd(month){
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * The months whose rates are needed for these dates. A date not yet come is converted
 * at the latest rate, so it needs the month of `today` instead of its own.
 * @returns {string[]} "YYYY-MM", in order
 */
export function monthsFor(dates, today){
  const out = new Set();
  for(const d of dates){
    if(typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if(d < today) out.add(monthOf(d));
    else{
      // today's rate may not be out yet: the days before it may be in the month before
      out.add(monthOf(today));
      out.add(monthOf(shift(today, -GAP)));
    }
  }
  return [...out].sort();
}

/**
 * The rates of Frankfurter's answer (api.frankfurter.dev/v2/rates, base EUR): a list
 * of {date, base, quote, rate}. Anything else in it is left out.
 */
export function ratesFrom(rows){
  const out = {};
  if(!Array.isArray(rows)) return out;
  for(const r of rows){
    if(!r || r.base !== BASE || typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    if(typeof r.quote !== "string" || !/^[A-Z]{3}$/.test(r.quote) || !isNum(r.rate) || r.rate <= 0) continue;
    (out[r.date] = out[r.date] || {})[r.quote] = r.rate;
  }
  return out;
}

/* ---------- conversion ---------- */

// The euro is not in the table: it is the unit.
const per = (day, cur) => cur === BASE ? 1 : day && day[cur];

/**
 * What `amount` in `from` makes in `to`, at the rate of `date`.
 *   - the same currency: the amount itself;
 *   - a date up to today: that day's rate (or the closest day before it, for a gap);
 *   - a date still to come, or today before its rate is out: the latest rate, as an
 *     estimate that can change.
 * @param {object} rates  {"YYYY-MM-DD": {CUR: per euro}}
 * @param {string} today  "YYYY-MM-DD" where the trip is
 * @returns {{value: number, on: string, rate: number, estimate: boolean} | null}
 *   rate: how much of `from` one `to` buys that day. null when the rates are missing.
 */
export function convert(amount, from, to, date, rates, today){
  if(!isNum(amount) || !from || !to) return null;
  if(from === to) return {value: amount, on: date, rate: 1, estimate: false};
  const has = d => rates && rates[d] && per(rates[d], from) && per(rates[d], to);
  const result = (d, estimate) => {
    const day = rates[d], f = per(day, from), t = per(day, to);
    return {value: amount / f * t, on: d, rate: f / t, estimate};
  };
  if(date <= today){
    if(has(date)) return result(date, false);
    for(let i = 1; i <= GAP; i++){
      const d = shift(date, -i);
      if(has(d)) return result(d, date === today);
    }
    return null;
  }
  // Still to come: the latest day with rates, if it is recent.
  const known = Object.keys(rates || {}).filter(d => d <= today && has(d)).sort();
  const last = known[known.length - 1];
  if(!last || last < shift(today, -GAP)) return null;
  return result(last, true);
}

/**
 * The sum of amounts in different currencies, in `to`.
 * @param {{amount: number, currency: string, date: string}[]} items
 * @returns {{value: number, estimate: boolean, missing: {amount: number, currency: string}[]}}
 *   missing: what could not be converted, summed by currency.
 */
export function total(items, to, rates, today){
  let value = 0, estimate = false;
  const missing = new Map();
  for(const it of items){
    const c = convert(it.amount, it.currency, to, it.date, rates, today);
    if(c){ value += c.value; estimate = estimate || c.estimate; }
    else missing.set(it.currency, (missing.get(it.currency) || 0) + it.amount);
  }
  return {value, estimate, missing: [...missing].map(([currency, amount]) => ({amount, currency}))};
}

/* ---------- which currency ---------- */

// Euro countries, and the currency of other places travellers often come from.
const EURO = "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK AD MC SM VA ME XK";
const BY_REGION = {US: "USD", GB: "GBP", CH: "CHF", LI: "CHF", JP: "JPY", KR: "KRW", CA: "CAD", AU: "AUD", NZ: "NZD",
  SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", IS: "ISK", TR: "TRY",
  CN: "CNY", HK: "HKD", TW: "TWD", SG: "SGD", IN: "INR", BR: "BRL", MX: "MXN", AR: "ARS", ZA: "ZAR", IL: "ILS",
  TH: "THB", VN: "VND", ID: "IDR", MY: "MYR", PH: "PHP", AE: "AED"};

/** The currency of a country ("IT" → "EUR"), or "" when the app does not know it. */
export function currencyOfRegion(region){
  const r = String(region || "").toUpperCase();
  if(EURO.split(" ").includes(r)) return "EUR";
  return BY_REGION[r] || "";
}

/**
 * The traveller's own currency, from the phone's language and country: "it-IT" → EUR,
 * "en-US" → USD. A language without a country takes its most likely one.
 */
export function homeOf(locale){
  let region = "";
  try{
    const loc = new Intl.Locale(locale || "en");
    region = loc.region || (loc.maximize ? loc.maximize().region : "") || "";
  }catch(e){}
  return currencyOfRegion(region) || "EUR";
}

/** Every currency code the phone knows, or the common ones on older phones. */
export function currencies(){
  try{ if(typeof Intl.supportedValuesOf === "function") return Intl.supportedValuesOf("currency"); }catch(e){}
  return [...new Set(["EUR", ...Object.values(BY_REGION)])].sort();
}

/** The name of a currency in a language: "yen giapponese". */
export function currencyName(code, lang){
  try{ return new Intl.DisplayNames([lang], {type: "currency"}).of(code) || code; }
  catch(e){ return code; }
}

/** The sign of a currency in a language: "¥", "€", "$"; the code when it has none. */
export function symbolOf(code, lang){
  try{
    const part = new Intl.NumberFormat(lang, {style: "currency", currency: code, currencyDisplay: "narrowSymbol"}).formatToParts(0).find(p => p.type === "currency");
    return part ? part.value : code;
  }catch(e){ return code; }
}
