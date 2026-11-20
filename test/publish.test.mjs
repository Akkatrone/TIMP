import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publishable, sensitiveIn, dateShift, MASK, moveDates, asBase } from "../js/publish.js";
import { validateTrip } from "../js/trip.js";

const demo = () => JSON.parse(readFileSync(new URL("../examples/demo-trip.json", import.meta.url), "utf8"));

// An invented trip with everything a traveller might not want to publish.
function trip(){
  return {
    format: "travel-in-my-pocket/2", id: "porto-weekend", title: "Porto weekend", lang: "en", timezone: "Europe/Lisbon", currency: "EUR",
    googleMapsKey: "AIzaInventedKeyForTests000000000000000",
    version: {id: "1234567890abcdef", parents: [], at: "2027-03-01T10:00:00.000Z"},
    private: {owner: "p-0123456789ab", expenses: [{title: "Gift", cost: 20}]},
    info: [{title: "Numbers", items: [{label: "Host", text: "+351 912 345 678"}, {label: "Emergency", text: "112"}, {label: "Mail", text: "host@example.com"}]}],
    expenses: [{title: "Flights, booking ref XK7QL2", cost: 180, date: "2027-03-12"}],
    days: [
      {date: "2027-03-12", city: "Porto", stay: {name: "Casa Inventada", address: "Rua Inventada 12, Porto", note: "Door code 4471, check-in 15:00"},
        notes: ["Train confirmation: 8841-2290"],
        stops: [
          {title: "Livraria Lello", time: "10:00", type: "sight", cost: 10, closed: ["2027-03-13", "sun"], text: "Tickets online, order no. A99812. Opens 09:30, €10."},
          {title: "Casa Inventada", time: "15:00", type: "hotel", address: "Rua Inventada 12, Porto", lat: 41.15, lng: -8.61},
          {title: "Dinner", time: "20:00", type: "food", text: "Booked for 2 people, call 22 123 4567 to change. Tram line 1, platform A4."}
        ]},
      {date: "2027-03-13", city: "Porto", stay: "Casa Inventada",
        plans: [{name: "Sun", stops: [{title: "Ribeira", time: "10:00", type: "walk", text: "Flight TP1234 home at 18:00 on 2027-03-14."}]},
          {name: "Rain", stops: [{title: "Museum", time: "10:00", type: "museum"}]}]}
    ]
  };
}

test("never in the copy: private expenses, the Google key, the version, the trip's id; the trip itself unchanged", () => {
  const t = trip(), before = JSON.stringify(t);
  const {trip: out} = publishable(t);
  for(const k of ["private", "googleMapsKey", "version", "id"]) assert.equal(k in out, false, k);
  assert.equal(JSON.stringify(t), before, "the traveller's trip is not touched");
  assert.equal(out.title, "Porto weekend");
  assert.ok(validateTrip(out).ok, JSON.stringify(validateTrip(out).errors));
});

test("found, and taken out by default: booking codes, phone numbers, emails, where the nights are spent", () => {
  const {trip: out, found} = publishable(trip());
  // The door code in the stay's note too.
  assert.deepEqual(found.codes.map(c => c.match).sort(), ["4471", "8841-2290", "A99812", "TP1234", "XK7QL2"].sort());
  assert.deepEqual(found.phones.map(p => p.match).sort(), ["+351 912 345 678", "22 123 4567"].sort());
  assert.deepEqual(found.emails.map(e => e.match), ["host@example.com"]);
  assert.deepEqual(found.stays.map(s => [s.label, s.day, s.kind]), [["Casa Inventada", 1, "stay"], ["Casa Inventada", 1, "hotel"]]);
  // Where each was found, for people.
  assert.equal(found.codes.find(c => c.match === "A99812").label, "Livraria Lello");
  assert.equal(found.phones.find(p => p.match === "+351 912 345 678").label, "Numbers");
  const s = JSON.stringify(out);
  for(const gone of ["XK7QL2", "A99812", "8841-2290", "TP1234", "912 345 678", "22 123 4567", "host@example.com", "Rua Inventada", "4471"]) assert.ok(!s.includes(gone), gone);
  assert.equal(out.days[0].stops[0].text, `Tickets online, order no. ${MASK}. Opens 09:30, €10.`);
  assert.deepEqual(out.days[0].stay, {name: "Casa Inventada"}, "the name of the stay stays");
  assert.deepEqual(Object.keys(out.days[0].stops[1]).sort(), ["time", "title", "type"].sort(), "a hotel stop keeps its name, not where it is");
  assert.equal(out.info[0].items[1].text, "112", "short public numbers stay");
});

test("what is not sensitive stays: times, prices, dates, platforms, short numbers", () => {
  assert.deepEqual(sensitiveIn("Opens 09:30 to 18:00, €10, platform A4, line 28, on 2027-05-14 or 14/05/2027."), []);
  assert.deepEqual(sensitiveIn("Call 112 or 118."), []);
  assert.deepEqual(sensitiveIn("PNR: XK7QL2").map(x => x.kind), ["codes"]);
  assert.deepEqual(sensitiveIn("tel. 0039 06 1234 5678").map(x => x.kind), ["phones"]);
});

test("kept when the traveller says so: still listed, not taken out", () => {
  const {trip: out, found} = publishable(trip(), {remove: {codes: false, phones: false, emails: false, stays: false}});
  assert.equal(found.codes.length, 5);
  const s = JSON.stringify(out);
  for(const kept of ["XK7QL2", "+351 912 345 678", "host@example.com", "Rua Inventada", "Door code 4471"]) assert.ok(s.includes(kept), kept);
  assert.equal(out.days[0].stops[1].lat, 41.15);
});

test("dates hidden by default: moved to 2001, each day keeps its month and day of the week; real when chosen", () => {
  const t = trip();
  const {trip: out, dates} = publishable(t);
  assert.equal(dates, "hidden");
  const day = iso => new Date(iso + "T00:00:00Z").getUTCDay(), month = iso => iso.slice(5, 7);
  out.days.forEach((d, i) => {
    assert.equal(d.date.slice(0, 4), "2001");
    assert.equal(day(d.date), day(t.days[i].date), "same day of the week");
    assert.equal(month(d.date), month(t.days[i].date), "same month");
  });
  assert.equal(Date.parse(out.days[1].date) - Date.parse(out.days[0].date), 864e5, "days still follow each other");
  // Dates inside the trip move with it: a closing date, an expense.
  assert.equal(out.days[0].stops[0].closed[0], out.days[1].date);
  assert.equal(out.days[0].stops[0].closed[1], "sun");
  assert.equal(out.expenses[0].date, out.days[0].date);
  assert.ok(validateTrip(out).ok);
  const real = publishable(t, {dates: "real"});
  assert.equal(real.dates, "real");
  assert.deepEqual(real.trip.days.map(d => d.date), ["2027-03-12", "2027-03-13"]);
});

test("the date shift keeps the year 2001, the month and the day of the week, for any first day", () => {
  for(let t = Date.UTC(2026, 0, 1); t < Date.UTC(2031, 0, 1); t += 864e5){
    const first = new Date(t).toISOString().slice(0, 10), k = dateShift(first);
    assert.equal(Math.abs(k % 7), 0, first);
    const moved = new Date(t + k * 864e5);
    assert.equal(moved.getUTCFullYear(), 2001, first);
    assert.equal(moved.getUTCMonth(), new Date(t).getUTCMonth(), first);
    assert.ok(Math.abs(moved.getUTCDate() - new Date(t).getUTCDate()) <= 6, first);
  }
});

test("the example trip: published as it is, valid, the same twice", () => {
  const a = publishable(demo()), b = publishable(demo());
  assert.ok(validateTrip(a.trip).ok, JSON.stringify(validateTrip(a.trip).errors));
  assert.equal(JSON.stringify(a), JSON.stringify(b), "deterministic");
  assert.equal(a.trip.days.length, demo().days.length);
});

test("use as a base: the traveller's own copy, its dates from the day they choose, where it came from said", () => {
  const pub = {trip: publishable(trip()).trip, by: "fra"};
  const copy = asBase(pub, {url: "https://share.example/t/k7qm2hxprw9dtn", first: "2028-06-02"});
  assert.equal("id" in copy || "version" in copy || "private" in copy, false);
  assert.deepEqual(copy.basedOn, {url: "https://share.example/t/k7qm2hxprw9dtn", title: "Porto weekend", by: "fra"});
  assert.deepEqual(copy.days.map(d => d.date), ["2028-06-02", "2028-06-03"]);
  assert.equal(copy.expenses[0].date, "2028-06-02", "dates inside move with it");
  assert.ok(validateTrip(copy).ok, JSON.stringify(validateTrip(copy).errors));
  // Without a day: the dates as published.
  assert.deepEqual(asBase(pub, {url: "https://share.example/t/x"}).days.map(d => d.date), pub.trip.days.map(d => d.date));
  // A copy of a copy says only the last.
  assert.equal(asBase({trip: copy, by: "ugo"}, {url: "https://share.example/t/y"}).basedOn.by, "ugo");
  assert.deepEqual(moveDates(trip(), "nope").days.map(d => d.date), ["2027-03-12", "2027-03-13"], "an unreadable day changes nothing");
});
