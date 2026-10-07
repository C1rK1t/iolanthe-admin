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

const SITES = [
  { id: "near", title: "Near", latitude: 12.01, longitude: 120 },   // ~0.6 nm from A
  { id: "far", title: "Far", latitude: 12.2, longitude: 120 }        // ~12 nm
];
const ANCH = { id: "a", name: "Alpha", latitude: 12, longitude: 120 };
const ANCH_B = { id: "b", name: "Bravo", latitude: 12.02, longitude: 120 };

test("sitesWithin returns ids within the range", () => {
  assert.deepEqual(core.sitesWithin(SITES, P(12, 120), 2), ["near"]);
});

test("nearbyAnchorages sorts by distance and respects the range", () => {
  const out = core.nearbyAnchorages([ANCH_B, ANCH], P(12.001, 120), 2);
  assert.deepEqual(out.map((x) => x.anchorage.id), ["a", "b"]);
  assert.ok(out[0].nm < out[1].nm);
  assert.deepEqual(core.nearbyAnchorages([ANCH], P(13, 120), 2), []);
});

test("stopAt builds a stop on the anchorage and auto-links sites within 2 nm", () => {
  assert.deepEqual(core.stopAt(ANCH, SITES), { latitude: 12, longitude: 120, anchorage_id: "a", name: "Alpha", site_ids: ["near"] });
});

test("makeStopAt replaces the point with a stop", () => {
  const pts = [P(11.9, 120), P(12.001, 120.001), P(12.1, 120)];
  const { points, merged } = core.makeStopAt(pts, 1, ANCH, SITES);
  assert.equal(merged, false);
  assert.equal(points[1].anchorage_id, "a");
  assert.equal(points.length, 3);
});

test("makeStopAt merges into an identical neighbouring stop (spec Q3)", () => {
  const prevStop = { ...P(12, 120), anchorage_id: "a", name: "Alpha" };
  const before = [P(11.9, 120), prevStop, P(12.001, 120.001), P(12.1, 120)];
  const r1 = core.makeStopAt(before, 2, ANCH, SITES);
  assert.equal(r1.merged, true);
  assert.deepEqual(r1.points, [before[0], prevStop, before[3]]);
  const after = [P(11.9, 120), P(12.001, 120.001), prevStop];
  const r2 = core.makeStopAt(after, 1, ANCH, SITES);
  assert.equal(r2.merged, true);
  assert.deepEqual(r2.points, [after[0], prevStop]);
});

test("makeStopAt does not merge with a stop at a different anchorage", () => {
  const otherStop = { ...P(12.02, 120), anchorage_id: "b", name: "Bravo" };
  const { merged, points } = core.makeStopAt([otherStop, P(12.001, 120)], 1, ANCH, SITES);
  assert.equal(merged, false);
  assert.equal(points.length, 2);
});

test("appendStop adds a stop at the end, or merges when the last point is the same anchorage", () => {
  const r1 = core.appendStop([P(11.9, 120)], ANCH, SITES);
  assert.equal(r1.merged, false);
  assert.equal(r1.points.length, 2);
  const r2 = core.appendStop(r1.points, ANCH, SITES);
  assert.equal(r2.merged, true);
  assert.equal(r2.points.length, 2);
});

test("anchorageMovedM is 0 within 50 m and the distance beyond", () => {
  const stop = { ...P(12, 120), anchorage_id: "a" };
  assert.equal(core.anchorageMovedM(stop, { ...ANCH, latitude: 12.0002 }), 0);
  assert.ok(core.anchorageMovedM(stop, { ...ANCH, latitude: 12.005 }) > 500);
  assert.equal(core.anchorageMovedM(P(12, 120), ANCH), 0);
  assert.equal(core.anchorageMovedM(stop, null), 0);
});

test("routesUsingAnchorage lists the routes with a stop there", () => {
  const routes = [
    { id: "r1", name: "One", points: [{ ...P(1, 1), anchorage_id: "a" }] },
    { id: "r2", name: "Two", points: [P(1, 1)] }
  ];
  assert.deepEqual(core.routesUsingAnchorage(routes, "a").map((r) => r.id), ["r1"]);
});
