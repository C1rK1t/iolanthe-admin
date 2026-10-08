"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../guest-preview-core.js");

const P = (name, extra) => ({ latitude: 12, longitude: 120, stop: true, name, ...(extra || {}) });
// Cebu (sails day 1) → Oslob (1 night) → Apo (2 nights) → overnight passage → Tubbataha (terminus, arrives day 6).
const points = [
  P("Cebu", { depart: { day: 1 } }),
  P("Oslob", { arrive: { day: 1 }, depart: { day: 2 } }),
  { latitude: 9.5, longitude: 123.2 },                      // a plain waypoint, not a stop
  P("Apo Island", { arrive: { day: 2 }, depart: { day: 4 } }),
  P("Lunch spot", { arrive: { day: 4 }, depart: { day: 4 } }),   // day stop
  P("Tubbataha", { arrive: { day: 6 } })
];
const charter = { start_date: "2026-11-01", end_date: "2026-11-09" };

test("overnightName: the stop slept at, a passage, the terminus", () => {
  assert.equal(core.overnightName(points, 1), "Oslob");
  assert.equal(core.overnightName(points, 2), "Apo Island");
  assert.equal(core.overnightName(points, 3), "Apo Island");
  assert.equal(core.overnightName(points, 4), "passage to Tubbataha");
  assert.equal(core.overnightName(points, 5), "passage to Tubbataha");
  assert.equal(core.overnightName(points, 6), "Tubbataha");
  assert.equal(core.overnightName(points, 9), "Tubbataha");
  assert.equal(core.overnightName([P("Only")], 1), "Only");
  assert.equal(core.overnightName([], 1), "");
  assert.equal(core.overnightName([P("", { depart: { day: 2 } }), P("B", { arrive: { day: 2 } })], 1), "Stop 1");
});

test("previewSteps: before, nine days, after", () => {
  const steps = core.previewSteps(charter, points);
  assert.equal(steps.length, 11);
  assert.deepEqual(steps[0], { date: "2026-10-31", kind: "before", day: null, label: "Sat 31 Oct", sub: "Day before boarding" });
  assert.deepEqual(steps[1], { date: "2026-11-01", kind: "day", day: 1, label: "Sun 1 Nov", sub: "Day 1 of 9 · Oslob" });
  assert.equal(steps[3].sub, "Day 3 of 9 · Apo Island");
  assert.equal(steps[4].sub, "Day 4 of 9 · passage to Tubbataha");
  assert.deepEqual(steps[10], { date: "2026-11-10", kind: "after", day: null, label: "Tue 10 Nov", sub: "Day after the charter" });
  assert.equal(core.previewSteps(charter, [])[1].sub, "Day 1 of 9");
});

test("previewSteps: no dates, bad dates, end before start", () => {
  assert.deepEqual(core.previewSteps({}, points), []);
  assert.deepEqual(core.previewSteps({ start_date: "2026-11-01" }, points), []);
  assert.deepEqual(core.previewSteps({ start_date: "2026-02-30", end_date: "2026-03-02" }, points), []);
  assert.deepEqual(core.previewSteps({ start_date: "2026-11-09", end_date: "2026-11-01" }, points), []);
  assert.deepEqual(core.previewSteps(null, points), []);
  assert.equal(core.previewSteps({ start_date: "2026-12-31", end_date: "2026-12-31" }, []).map((s) => s.date).join(","), "2026-12-30,2026-12-31,2027-01-01");
});

test("defaultStepIndex, stepIndexForDay, stepIndexForDate", () => {
  const steps = core.previewSteps(charter, points);
  assert.equal(core.defaultStepIndex(steps, "2026-11-03"), 3);
  assert.equal(core.defaultStepIndex(steps, "2026-10-31"), 0);
  assert.equal(core.defaultStepIndex(steps, "2026-12-25"), 1);
  assert.equal(core.defaultStepIndex([], "2026-11-03"), 0);
  assert.equal(core.stepIndexForDay(steps, 5), 5);
  assert.equal(core.stepIndexForDay(steps, 12), -1);
  assert.equal(core.stepIndexForDate(steps, "2026-11-10"), 10);
  assert.equal(core.stepIndexForDate(steps, "2027-01-01"), -1);
});

test("previewUrl: encoded params, only a plain tab id kept", () => {
  assert.equal(core.previewUrl({ date: "2026-11-03", charterId: "csaba", hash: "#itinerary" }), "/?preview=2026-11-03&charter=csaba#itinerary");
  assert.equal(core.previewUrl({ date: "2026-11-03", charterId: "csaba", hash: "" }), "/?preview=2026-11-03&charter=csaba");
  assert.equal(core.previewUrl({ date: "2026-11-03", charterId: "a b", hash: "#x\"><img" }), "/?preview=2026-11-03&charter=a%20b");
  assert.equal(core.previewUrl({ date: "2026-11-03", charterId: "csaba", hash: "#custom_tab-2" }), "/?preview=2026-11-03&charter=csaba#custom_tab-2");
});

test("fitScale: fits width and height, never above 1, phone by default", () => {
  assert.equal(core.fitScale("phone", 1000, 2000), 1);
  assert.equal(core.fitScale("phone", 195, 2000), 0.5);
  assert.equal(core.fitScale("tablet", 2000, 590), 0.5);
  assert.equal(core.fitScale("nope", 195, 2000), 0.5);
  assert.equal(core.fitScale("phone", 0, 0), 1);
  assert.deepEqual(core.DEVICES.tablet, { w: 820, h: 1180 });
});
