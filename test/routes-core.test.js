"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../routes-core.js");

const P = (latitude, longitude, extra) => ({ latitude, longitude, ...(extra || {}) });

test("distNm: one minute of latitude is about 1 nm", () => {
  assert.ok(Math.abs(core.distNm(P(12, 120), P(12 + 1 / 60, 120)) - 1) < 0.01);
});

test("routeNm sums the legs and is 0 for fewer than 2 points", () => {
  const a = P(12, 120), b = P(12 + 1 / 60, 120), c = P(12 + 2 / 60, 120);
  assert.ok(Math.abs(core.routeNm([a, b, c]) - 2) < 0.02);
  assert.equal(core.routeNm([a]), 0);
  assert.equal(core.routeNm([]), 0);
});

test("fmtHm formats hours as h:mm", () => {
  assert.equal(core.fmtHm(0.8375), "0:50");
  assert.equal(core.fmtHm(6.3), "6:18");
  assert.equal(core.fmtHm(1.999), "2:00");
});

test("array helpers return new arrays", () => {
  const arr = [1, 2, 3];
  assert.deepEqual(core.replaceAt(arr, 1, 9), [1, 9, 3]);
  assert.deepEqual(core.insertAt(arr, 1, 9), [1, 9, 2, 3]);
  assert.deepEqual(core.removeAt(arr, 1), [1, 3]);
  assert.deepEqual(arr, [1, 2, 3]);
});

test("stopLegs runs stop to stop, with Start/End for non-stop ends", () => {
  const pts = [P(12, 120), P(12.01, 120), P(12.02, 120, { anchorage_id: "a", name: "Alpha" }), P(12.03, 120), P(12.04, 120)];
  const legs = core.stopLegs(pts, 8);
  assert.deepEqual(legs.map((l) => [l.from, l.to, l.fromIndex, l.toIndex]), [["Start", "Alpha", 0, 2], ["Alpha", "End", 2, 4]]);
  assert.ok(Math.abs(legs[0].nm - core.routeNm(pts.slice(0, 3))) < 1e-9);
  assert.equal(legs[0].speed, 8);
  assert.equal(legs[0].own, 0);
  assert.ok(Math.abs(legs[0].hours - legs[0].nm / 8) < 1e-9);
});

test("stopLegs uses the leg's own speed from its start point", () => {
  const pts = [P(12, 120, { anchorage_id: "a", name: "A", leg_speed_kn: 6 }), P(12.1, 120, { anchorage_id: "b", name: "B" })];
  const [leg] = core.stopLegs(pts, 8);
  assert.equal(leg.own, 6);
  assert.equal(leg.speed, 6);
});

test("stopLegs gives null hours when there is no speed, and [] for under 2 points", () => {
  const legs = core.stopLegs([P(12, 120), P(12.1, 120)], 0);
  assert.equal(legs[0].hours, null);
  assert.equal(core.totalHours(legs), null);
  assert.deepEqual(core.stopLegs([P(12, 120)], 8), []);
});

test("totalHours adds the per-leg hours", () => {
  assert.equal(core.totalHours([{ hours: 1 }, { hours: 2.5 }]), 3.5);
  assert.equal(core.totalHours([]), null);
});

test("setLegSpeed sets and clears leg_speed_kn without mutating", () => {
  const pts = [P(12, 120), P(12.1, 120)];
  const set = core.setLegSpeed(pts, 0, 6);
  assert.equal(set[0].leg_speed_kn, 6);
  assert.equal(pts[0].leg_speed_kn, undefined);
  const cleared = core.setLegSpeed(set, 0, 0);
  assert.equal("leg_speed_kn" in cleared[0], false);
});

test("joinPoints appends, prepends and reverses", () => {
  const a = [P(1, 1), P(2, 2)];
  const b = [P(5, 5), P(6, 6)];
  assert.deepEqual(core.joinPoints(a, b, {}), [P(1, 1), P(2, 2), P(5, 5), P(6, 6)]);
  assert.deepEqual(core.joinPoints(a, b, { atStart: true }), [P(5, 5), P(6, 6), P(1, 1), P(2, 2)]);
  assert.deepEqual(core.joinPoints(a, b, { reverse: true }), [P(1, 1), P(2, 2), P(6, 6), P(5, 5)]);
});

test("joinPoints drops the duplicate where the routes meet", () => {
  const a = [P(1, 1), P(2, 2, { anchorage_id: "x" })];
  const sameStop = [P(2.3, 2.3, { anchorage_id: "x" }), P(3, 3)];
  assert.equal(core.joinPoints(a, sameStop, {}).length, 3);
  const sameSpot = [P(2.0001, 2.0001), P(3, 3)];
  assert.equal(core.joinPoints(a, sameSpot, {}).length, 3);
  assert.deepEqual(core.joinPoints([], sameSpot, {}), sameSpot);
});

test("joinGapNm measures the straight leg the join creates", () => {
  const a = [P(1, 1), P(2, 2)];
  const b = [P(2, 2.5), P(3, 3)];
  assert.ok(Math.abs(core.joinGapNm(a, b, {}) - core.distNm(P(2, 2), P(2, 2.5))) < 1e-9);
  assert.equal(core.joinGapNm([], b, {}), 0);
});

test("routeSnapshot covers only the editable fields", () => {
  const r = { id: "x", revision: 3, name: "A", description: "", speed_kn: 8, points: [P(1, 1)], updated_at: "t" };
  assert.equal(core.routeSnapshot(r), core.routeSnapshot({ ...r, revision: 4, updated_at: "u" }));
  assert.notEqual(core.routeSnapshot(r), core.routeSnapshot({ ...r, name: "B" }));
});

test("routeSnapshot ignores point key order, undefined values and null speed", () => {
  const a = { name: "A", description: "", speed_kn: undefined, points: [{ latitude: 1, longitude: 2, name: "X", anchorage_id: undefined }] };
  const b = { name: "A", description: "", speed_kn: null, points: [{ name: "X", longitude: 2, latitude: 1 }] };
  assert.equal(core.routeSnapshot(a), core.routeSnapshot(b));
});
