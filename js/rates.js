// The exchange rates of the days a trip's costs are paid, from Frankfurter
// (frankfurter.dev, open source: the median of about 90 central banks, for every day of
// the calendar). No DOM here.
//
// What leaves the phone is only which month: the request is always "every currency,
// against the euro, for this month", so it says nothing about the trip's currency, its
// amounts or its places. Each month is kept on the phone (js/store.js): costs convert
// offline once it is there, and a month that is over is never asked for again.

import { getKV, setKV } from "./store.js";
import { ratesFrom, monthEnd, BASE } from "./money.js";

// Anyone hosting a copy can point it to their own Frankfurter.
export const RATES_URL = "https://api.frankfurter.dev/v2/rates";

const key = month => "rates:" + month;
const utcToday = () => new Date().toISOString().slice(0, 10);

/**
 * The months kept on the phone, as one table, and those kept but worth asking for
 * again: not over when they were fetched, and fetched before today. A month that is
 * not kept is asked for only when a cost needs it.
 * @param {string[]} months "YYYY-MM"
 * @returns {Promise<{rates: object, stale: string[]}>}
 */
export async function keptRates(months){
  const rates = {}, stale = [];
  for(const m of months){
    let rec = null;
    try{ rec = await getKV(key(m)); }catch(e){}
    if(!rec || !rec.days) continue;
    Object.assign(rates, rec.days);
    if(rec.fetched <= monthEnd(m) && rec.fetched < utcToday()) stale.push(m);
  }
  return {rates, stale};
}

/**
 * Asks for a month's rates and keeps them.
 * @returns {Promise<object>} its days, {"YYYY-MM-DD": {CUR: per euro}}
 */
export async function fetchMonth(month){
  const url = `${RATES_URL}?from=${month}-01&to=${monthEnd(month)}&base=${BASE}`;
  const res = await fetch(url, {cache: "no-store"});
  if(!res.ok) throw new Error(`rates: ${res.status}`);
  const days = ratesFrom(await res.json());
  if(!Object.keys(days).length) throw new Error("rates: none");
  await setKV(key(month), {fetched: utcToday(), days});
  return days;
}
