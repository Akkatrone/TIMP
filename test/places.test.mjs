import { test } from "node:test";
import assert from "node:assert/strict";
import { regionOf, reviewSite, closedOn, localLang } from "../js/places.js";

const at = (lat, lng) => ({lat, lng});

test("the part of the world comes from the position, near borders too", () => {
  const cases = {
    jp: [[35.6595, 139.7005], [34.9671, 135.7727], [43.0618, 141.3545], [26.2124, 127.6809], [33.5902, 130.4017], [34.2, 129.3]],
    kr: [[37.5665, 126.978], [35.1796, 129.0756], [33.4996, 126.5312]],
    na: [[40.7128, -74.006], [37.7749, -122.4194], [32.7157, -117.1611], [43.6532, -79.3832], [25.7617, -80.1918], [29.7604, -95.3698], [21.3069, -157.8583]],
    eu: [[41.9028, 12.4964], [48.8566, 2.3522], [38.7223, -9.1393], [40.4168, -3.7038], [28.1235, -15.4363], [52.3676, 4.9041]],
    "": [[32.5149, -117.0382], [25.6866, -100.3161], [36.7538, 3.0588], [-33.8688, 151.2093], [31.2304, 121.4737], [43.1155, 131.8855]]
  };
  for(const [want, points] of Object.entries(cases))
    for(const [lat, lng] of points) assert.equal(regionOf(at(lat, lng)), want, `${lat},${lng}`);
  // Without a position: the trip's time zone.
  assert.equal(regionOf({title: "Ramen"}, "Asia/Tokyo"), "jp");
  assert.equal(regionOf({title: "Dinner"}, "Europe/Rome"), "eu");
  assert.equal(regionOf({title: "Diner"}, "America/Chicago"), "na");
  assert.equal(regionOf({title: "Tacos"}, "America/Mexico_City"), "");
});

test("a place to eat gets the review site of its part of the world; other stops none", () => {
  const ramen = {type: "food", title: "Ichiran Shibuya", local: "一蘭 渋谷店", lat: 35.6614, lng: 139.7006};
  assert.deepEqual(reviewSite(ramen), {site: "Tabelog", url: "https://tabelog.com/en/rstLst/?sw=%E4%B8%80%E8%98%AD%20%E6%B8%8B%E8%B0%B7%E5%BA%97"});
  assert.equal(reviewSite({...ramen, local: undefined}).url, "https://tabelog.com/en/rstLst/?sw=Ichiran%20Shibuya");
  assert.equal(reviewSite({type: "food", title: "Myeongdong Kyoja", local: "명동교자", lat: 37.5625, lng: 126.9856}).url, "https://map.naver.com/p/search/%EB%AA%85%EB%8F%99%EA%B5%90%EC%9E%90");
  assert.equal(reviewSite({type: "food", title: "Katz's Delicatessen", address: "205 E Houston St, New York", lat: 40.7223, lng: -73.9874}).url,
    "https://www.yelp.com/search?find_desc=Katz's%20Delicatessen&find_loc=205%20E%20Houston%20St%2C%20New%20York");
  // TheFork: its own pages only, on its site in the app's language.
  assert.deepEqual(reviewSite({type: "food", title: "Roscioli"}, {city: "Rome", timezone: "Europe/Rome"}),
    {site: "TheFork", url: "https://www.google.com/search?q=site%3Athefork.com%20Roscioli%20Rome"});
  assert.equal(reviewSite({type: "food", title: "Roscioli"}, {city: "Roma", timezone: "Europe/Rome", lang: "it"}).url,
    "https://www.google.com/search?q=site%3Athefork.it%20Roscioli%20Roma");
  assert.equal(reviewSite({type: "museum", title: "Louvre", lat: 48.8606, lng: 2.3376}), null);
  assert.equal(reviewSite({type: "food", title: "Bondi", lat: -33.89, lng: 151.27}), null, "elsewhere the Map link is enough");
});

test("a place is closed on its day of the week or on a date", () => {
  const s = {closed: ["mon", "2027-05-03"]};
  assert.deepEqual(closedOn(s, "2027-05-17"), {weekday: "mon"});
  assert.deepEqual(closedOn(s, "2027-05-03"), {date: "2027-05-03"});
  assert.equal(closedOn(s, "2027-05-18"), null);
  assert.equal(closedOn({}, "2027-05-17"), null);
});

test("the language of a local name, for its glyphs", () => {
  assert.equal(localLang("すし 銀座", ""), "ja");
  assert.equal(localLang("명동교자", ""), "ko");
  assert.equal(localLang("一蘭", "jp"), "ja");
  assert.equal(localLang("一蘭", ""), "zh");
  assert.equal(localLang("Café", "eu"), "");
});
