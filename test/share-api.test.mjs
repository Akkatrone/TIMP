import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROUTES, SHAPES, checkRequest, checkAnswer, pathOf, lockOf, breaks, openApi, API } from "../js/share-api.js";

const clone = v => JSON.parse(JSON.stringify(v));

test("requests and answers are checked against the contract; what a check does not know goes through", () => {
  assert.deepEqual(checkRequest("registerOptions", {code: "ABCD", handle: "fra"}), []);
  assert.deepEqual(checkRequest("registerOptions", {code: 12}), ["code: must be a text", "handle: is required"]);
  assert.deepEqual(checkRequest("invite", {role: "admin"}), ["role: must be one of read, edit"]);
  assert.deepEqual(checkRequest("putPrivate", {data: null, rev: 0, later: "a newer app may send more"}), []);
  const summary = {id: "t", localId: "x", title: "X", head: "0123456789abcdef", role: "owner", visibility: "private", firstDay: null, lastDay: null, days: 0, updatedAt: "2026-11-19"};
  assert.deepEqual(checkAnswer("trips", {trips: [summary]}), []);
  assert.deepEqual(checkAnswer("trips", {trips: [{...summary, days: "4"}]}), ["trips[0].days: must be a number"]);
  assert.deepEqual(checkAnswer("register", {token: "t", user: {id: "u", handle: "fra", since: "2026"}}), []);
  assert.deepEqual(checkAnswer("version", {anything: true}), [], "a trip file: checked by the format, not here");
  assert.equal(pathOf("removeMember", {id: "a b", user: "u/1"}), "/v1/trips/a%20b/members/u%2F1");
  assert.throws(() => pathOf("push", {}), /missing id/);
});

test("the lock: additions pass, anything that would break a client does not", () => {
  const lock = lockOf();
  assert.deepEqual(breaks(lock), [], "the contract as it is");
  assert.deepEqual(JSON.parse(readFileSync(new URL(`../contract/v${API}.lock.json`, import.meta.url), "utf8")), lock, "the lock is up to date");
  const now = clone(lock);
  now.routes.publish = {method: "POST", path: "/v1/trips/:id/publish", auth: true, body: {}, answer: "ok"};
  now.shapes.tripSummary.copies = {type: "number"};
  now.routes.putPrivate.body.note = {type: "text"};
  now.routes.invite.body.role.values.push("comment");
  assert.deepEqual(breaks(lock, now), [], "new route, new answer field, new optional request field, a value more to send");
  const bad = clone(lock);
  delete bad.routes.members;
  delete bad.shapes.tripSummary.head;
  bad.shapes.user.since.type = "number";
  bad.shapes.tripSummary.firstDay = {type: "text"};
  bad.routes.push.path = "/v1/trips/:id/versions";
  bad.routes.invite.body.note = {type: "text", req: true};
  bad.shapes.tripSummary.role.values.push("admin");
  assert.deepEqual(breaks(lock, bad).sort(), [
    "route invite request.note: new and required", "route members: removed", "route push: path changed",
    "shape tripSummary.firstDay: no longer always there", "shape tripSummary.head: removed", "shape tripSummary.role: new values",
    "shape user.since: type changed"
  ]);
});

test("the contract is also an OpenAPI document", () => {
  const doc = openApi();
  assert.equal(doc.openapi, "3.1.0");
  assert.equal(Object.values(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0), Object.keys(ROUTES).length);
  assert.deepEqual(doc.paths["/v1/trips/{id}/push"].post.parameters.map(p => p.name), ["id"]);
  assert.deepEqual(Object.keys(doc.components.schemas).sort(), Object.keys(SHAPES).sort());
});
