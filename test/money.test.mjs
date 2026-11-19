import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, formatMoney as fmt, formatPlain, convert, total, monthsFor, monthEnd, ratesFrom, homeOf, currencyOfRegion, decimals, symbolOf } from "../js/money.js";

// Euro rates of a few days of November 2026 (Frankfurter).
const RATES = {
  "2026-11-17": {JPY: 175.5, USD: 1.1005},
  "2026-11-18": {JPY: 175.29, USD: 1.0997},
  "2026-11-19": {JPY: 175.21, USD: 1.0991}
};
const TODAY = "2026-11-19";
const near = (a, b) => Math.abs(a - b) < 1e-6;

test("an amount is read as people type it, in any language", () => {
  const cases = {"16000": 16000, "16.000": 16000, "16,000": 16000, "1.500.000": 1500000, "4,50": 4.5, "4.50": 4.5,
    "1.234,56": 1234.56, "1,234.56": 1234.56, "¥ 2 400": 2400, "12 €": 12, "€12.50": 12.5, "12.50 EUR": 12.5,
    "1 500,25": 1500.25, "0": 0, "1.5": 1.5};
  for(const [text, want] of Object.entries(cases)) assert.equal(parseAmount(text), want, text);
  for(const text of ["", "abc", "-5", "1,000,5", "12..5", ",5", "5,"]) assert.equal(parseAmount(text), null, text);
});

test("a cost converts at the rate of its own day, not of the day it is looked at", () => {
  const c = convert(4400, "JPY", "EUR", "2026-11-18", RATES, TODAY);
  assert.ok(near(c.value, 4400 / 175.29));
  assert.deepEqual([c.on, c.rate, c.estimate], ["2026-11-18", 175.29, false]);
  // through the euro: yen to dollars on the 17th
  const d = convert(4400, "JPY", "USD", "2026-11-17", RATES, TODAY);
  assert.ok(near(d.value, 4400 / 175.5 * 1.1005));
  // the same currency is the amount itself
  assert.deepEqual(convert(12, "EUR", "EUR", "2030-01-01", {}, TODAY), {value: 12, on: "2030-01-01", rate: 1, estimate: false});
});

test("a day still to come uses today's rate, as an estimate that can change", () => {
  const c = convert(4400, "JPY", "EUR", "2026-12-24", RATES, TODAY);
  assert.deepEqual([c.on, c.estimate], ["2026-11-19", true]);
  assert.ok(near(c.value, 4400 / 175.21));
  // today before its rate is out: yesterday's, as an estimate
  const early = {"2026-11-18": RATES["2026-11-18"]};
  assert.deepEqual(convert(100, "JPY", "EUR", TODAY, early, TODAY).estimate, true);
  // a past day with a gap takes the day before, and it is not an estimate
  assert.deepEqual(convert(100, "JPY", "EUR", "2026-11-18", {"2026-11-17": RATES["2026-11-17"]}, TODAY).estimate, false);
  // no rates, or only old ones: nothing, rather than a wrong number
  assert.equal(convert(100, "JPY", "EUR", "2026-10-02", RATES, TODAY), null);
  assert.equal(convert(100, "JPY", "EUR", "2026-12-24", {"2026-10-01": {JPY: 170}}, TODAY), null);
  assert.equal(convert(100, "XYZ", "EUR", "2026-11-18", RATES, TODAY), null);
});

test("a total in one currency: estimates are marked, what cannot be converted is listed", () => {
  const r = total([
    {amount: 4400, currency: "JPY", date: "2026-11-18"},
    {amount: 10, currency: "EUR", date: "2026-11-18"},
    {amount: 1000, currency: "JPY", date: "2026-12-01"},
    {amount: 5, currency: "CHF", date: "2026-11-18"}
  ], "EUR", RATES, TODAY);
  assert.ok(near(r.value, 4400 / 175.29 + 10 + 1000 / 175.21));
  assert.equal(r.estimate, true);
  assert.deepEqual(r.missing, [{amount: 5, currency: "CHF"}]);
});

test("rates are asked for by month: past days their own, days to come today's", () => {
  assert.deepEqual(monthsFor(["2026-09-30", "2026-11-17", "2027-05-14"], TODAY), ["2026-09", "2026-11"]);
  // early in a month, today's rate may not be out: the month before comes too
  assert.deepEqual(monthsFor(["2027-05-14"], "2026-12-03"), ["2026-11", "2026-12"]);
  assert.equal(monthEnd("2026-02"), "2026-02-28");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
  // Frankfurter's answer becomes a table; anything odd in it is left out
  assert.deepEqual(ratesFrom([
    {date: "2026-11-17", base: "EUR", quote: "JPY", rate: 175.5},
    {date: "2026-11-17", base: "USD", quote: "JPY", rate: 159},
    {date: "2026-11-17", base: "EUR", quote: "usd", rate: 1.1},
    {date: "2026-11-17", base: "EUR", quote: "BAD", rate: -1},
    {date: "17/11/2026", base: "EUR", quote: "GBP", rate: 0.88}
  ]), {"2026-11-17": {JPY: 175.5}});
  assert.deepEqual(ratesFrom({message: "error"}), {});
});

test("amounts read as people write them, and the traveller's currency comes from the phone", () => {
  // Intl puts no-break spaces between the number and the sign
  const formatMoney = (...a) => fmt(...a).replace(/[\u00a0\u202f]/g, " ");
  assert.equal(formatMoney(4400, "JPY", "it"), "4400 ¥");
  assert.equal(formatMoney(25.11, "EUR", "it"), "25,11 €");
  assert.equal(formatMoney(12, "EUR", "it"), "12 €");
  assert.equal(formatMoney(12, "USD", "en"), "$12");
  assert.equal(formatMoney(12.5, "USD", "en"), "$12.50");
  assert.equal(formatMoney(25.6, "EUR", "en", {round: true}), "€26");
  assert.match(formatMoney(1234567, "JPY", "en", {compact: true}), /^¥1\.2M$/);
  assert.equal(formatPlain(16000, "it"), "16.000");
  assert.equal(parseAmount(formatPlain(1234.5, "it")), 1234.5);
  assert.equal(parseAmount(formatPlain(1234.5, "en")), 1234.5);
  assert.deepEqual([decimals("JPY"), decimals("EUR")], [0, 2]);
  assert.deepEqual([symbolOf("JPY", "it"), symbolOf("EUR", "en")], ["¥", "€"]);
  assert.deepEqual([homeOf("it-IT"), homeOf("it"), homeOf("en-US"), homeOf("en-GB"), homeOf("ja-JP"), homeOf("de-CH")], ["EUR", "EUR", "USD", "GBP", "JPY", "CHF"]);
  assert.equal(currencyOfRegion("PT"), "EUR");
  assert.equal(homeOf("xx"), "EUR");
});
