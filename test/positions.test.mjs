import { test } from "node:test";
import assert from "node:assert/strict";
import { km, middleOf, distances, FAR_KM } from "../js/positions.js";

const SE = {lat: 38.7098, lng: -9.1326}, CASTELO = {lat: 38.7139, lng: -9.1335}, PORTO = {lat: 41.1496, lng: -8.611};

test("distances between points, and the middle of some", () => {
  assert.ok(Math.abs(km(SE, CASTELO) - 0.46) < 0.02, String(km(SE, CASTELO)));
  assert.ok(Math.abs(km(SE, PORTO) - 274) < 2, String(km(SE, PORTO)));
  assert.equal(km(SE, SE), 0);
  assert.deepEqual(middleOf([{lat: 0, lng: 0}, {lat: 2, lng: 4}]), {lat: 1, lng: 2});
  assert.equal(middleOf([]), null);
  assert.equal(middleOf([{lat: undefined, lng: 1}]), null);
});

test("a result far from the other stops of the day is marked far; without any, far from the other results", () => {
  const results = [{id: "a", hit: CASTELO}, {id: "b", hit: PORTO}, {id: "c", hit: null}];
  const withStops = distances(results, [SE]);
  assert.equal(withStops.get("a").far, false);
  assert.equal(withStops.get("b").far, true);
  assert.ok(withStops.get("b").km > FAR_KM);
  assert.equal(withStops.has("c"), false, "not found: no distance");
  // No stop of the day has a position: each result against the others.
  const alone = distances([{id: "a", hit: CASTELO}, {id: "x", hit: SE}, {id: "b", hit: PORTO}], []);
  assert.equal(alone.get("b").far, true);
  // One result and nothing to compare it with: no distance said.
  assert.equal(distances([{id: "a", hit: CASTELO}], []).size, 0);
});
