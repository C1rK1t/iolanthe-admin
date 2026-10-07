"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../itinerary-core.js");

const P = (latitude, longitude, extra) => ({ latitude, longitude, ...(extra || {}) });

// Same 7-day fixture as the server's test/itinerary.test.js, so both sides derive identical days.
function sevenDays() {
  return core.normalizeItinerary({
    version: 2, revision: 4, welcome_message: "Welcome", summary: "North",
    route: { speed_kn: 8, points: [
      P(14.80, 120.27, { stop: true, id: "stp_subic1", name: "Subic Bay", depart: { day: 1, time: "09:00" } }),
      P(14.83, 120.20, { stop: true, id: "stp_anaw", name: "Anawangin", arrive: { day: 1 }, depart: { day: 1, time: "14:00" } }),
      P(14.95, 120.11, { anchorage_id: "capones", id: "stp_capo", name: "Capones Is.", site_ids: ["capones-lh"], arrive: { day: 1 }, depart: { day: 2, time: "08:30" } }),
      P(15.30, 119.80, { anchorage_id: "hermana", id: "stp_herm", name: "Hermana Mayor", arrive: { day: 2 }, depart: { day: 3 } }),
      P(15.60, 119.90, { anchorage_id: "potipot", id: "stp_poti", name: "Potipot", site_ids: ["potipot-beach", "sandbar"], arrive: { day: 3 }, depart: { day: 5, time: "18:00" } }),
      P(16.00, 119.95),
      P(16.20, 120.00, { anchorage_id: "hundred", id: "stp_hund", name: "Hundred Islands", arrive: { day: 6 }, depart: { day: 7, time: "08:00" } }),
      P(14.80, 120.27, { stop: true, id: "stp_subic2", name: "Subic Bay", arrive: { day: 7 } })
    ] },
    activities: [
      { id: "act_1", stop_id: "stp_capo", day: 1, order: 1, title: "Sundowners", notes: "" },
      { id: "act_2", stop_id: "stp_capo", day: 1, order: 0, title: "Lighthouse walk", notes: "", site_id: "capones-lh" },
      { id: "act_3", stop_id: "stp_poti", day: 4, order: 0, title: "Kayaks", notes: "" },
      { id: "act_4", stop_id: "stp_poti", day: 3, order: 0, title: "Beach", notes: "", site_id: "potipot-beach" }
    ]
  });
}
const charter = { name: "Reyes family", start_date: "2026-10-12", end_date: "2026-10-18" };

test("charterDayCount: inclusive, 0 when invalid", () => {
  assert.equal(core.charterDayCount(charter), 7);
  assert.equal(core.charterDayCount({ start_date: "2026-10-12", end_date: "2026-10-11" }), 0);
  assert.equal(core.charterDayCount({}), 0);
});

test("normalizeItinerary: defaults for an empty value; keeps v2 fields; drops template fields", () => {
  assert.deepEqual(core.normalizeItinerary(null), { version: 2, revision: 0, welcome_message: "", summary: "", route: { source: null, speed_kn: 8, points: [] }, activities: [] });
  const it = core.normalizeItinerary({ version: 2, revision: 2, route: { points: [P(1, 1, { stop: true, id: "stp_a", nights: 2, depart_time: "08:00", depart: { day: 1, time: "9:00" } })] } });
  assert.equal(it.route.points[0].nights, undefined);
  assert.deepEqual(it.route.points[0].depart, { day: 1 });   // "9:00" is not HH:MM
});

test("deriveDays: matches the server's expectation for the shared fixture", () => {
  const days = core.deriveDays(sevenDays(), 7);
  assert.deepEqual(days.map((d) => d.stops.map((s) => s.id)), [
    ["stp_subic1", "stp_anaw", "stp_capo"], ["stp_capo", "stp_herm"], ["stp_herm", "stp_poti"], ["stp_poti"], ["stp_poti"], ["stp_hund"], ["stp_hund", "stp_subic2"]
  ]);
  assert.deepEqual(days[0].stops[2].activities.map((a) => a.id), ["act_2", "act_1"]);
  assert.equal(days[0].stops[2].nights, 1);
});

test("validateItinerary: fixture valid; a few rules", () => {
  assert.deepEqual(core.validateItinerary(sevenDays(), 7), []);
  const dup = sevenDays(); dup.route.points[3].id = "stp_capo";
  assert.deepEqual(core.validateItinerary(dup, 7).map((e) => e.field), ["route.points[3].id"]);
  const offDay = sevenDays(); offDay.activities[2].day = 6;
  assert.deepEqual(core.validateItinerary(offDay, 7).map((e) => e.field), ["activities[2].day"]);
  const unserved = sevenDays(); unserved.activities[1].site_id = "elsewhere";
  assert.deepEqual(core.validateItinerary(unserved, 7).map((e) => e.field), ["activities[1].site_id"]);
});

test("itinerarySnapshot: ignores revision and source, so a reload is not 'dirty'", () => {
  const a = sevenDays();
  const b = sevenDays(); b.revision = 9; b.route.source = { type: "library" };
  assert.equal(core.itinerarySnapshot(a), core.itinerarySnapshot(b));
  const c = sevenDays(); c.activities[0].title = "Changed";
  assert.notEqual(core.itinerarySnapshot(a), core.itinerarySnapshot(c));
});

test("dayDateLabel: weekday, day and month from the charter start", () => {
  assert.equal(core.dayDateLabel(charter, 1), "Mon 12 Oct");
  assert.equal(core.dayDateLabel(charter, 7), "Sun 18 Oct");
  assert.equal(core.dayDateLabel({}, 1), "");
});

test("legHours: distance at the leg's own speed, else the route speed", () => {
  const pts = [P(12, 120, { stop: true, leg_speed_kn: 4 }), P(12 + 1 / 60, 120), P(12 + 2 / 60, 120, { stop: true })];
  assert.ok(Math.abs(core.legHours(pts, 0, 2, 8) - 0.5) < 0.01);
});

test("estimateTimes: set times upright, arrivals estimated from the previous departure, chain breaks at an overnight stop without a departure time", () => {
  const times = core.estimateTimes(sevenDays());
  assert.deepEqual(times.get("stp_subic1"), { arrive: null, depart: { time: "09:00", estimated: false } });
  const anaw = times.get("stp_anaw");                      // ~5 nm at 8 kn from 09:00
  assert.equal(anaw.arrive.estimated, true);
  assert.match(anaw.arrive.time, /^09:[3-5]\d$/);
  assert.deepEqual(anaw.depart, { time: "14:00", estimated: false });
  const capo = times.get("stp_capo");                      // ~9 nm at 8 kn from 14:00 → about 15:07
  assert.equal(capo.arrive.estimated, true);
  assert.match(capo.arrive.time, /^15:[0-2]\d$/);
  assert.deepEqual(capo.depart, { time: "08:30", estimated: false });
  const herm = times.get("stp_herm");
  assert.equal(herm.arrive.estimated, true);
  assert.equal(herm.depart, null);                         // 1 night, no departure time set → unknown
  const poti = times.get("stp_poti");
  assert.equal(poti.arrive, null);                         // chain broken at Hermana
  assert.deepEqual(poti.depart, { time: "18:00", estimated: false });
  const hund = times.get("stp_hund");
  assert.equal(hund.arrive.estimated, true);               // re-anchored by Potipot's 18:00; shown mod 24 h
  assert.match(hund.arrive.time, /^\d\d:\d\d$/);
});

test("estimateTimes: a zero-night stop with no departure time leaves when it arrives", () => {
  const it = sevenDays();
  delete it.route.points[1].depart.time;                   // Anawangin: arrive ~09:40, depart estimated the same
  const t = core.estimateTimes(it).get("stp_anaw");
  assert.equal(t.depart.estimated, true);
  assert.equal(t.depart.time, t.arrive.time);
});

test("stopTimesLabel: Arr./Dep. with ~ for estimates, nights when more than one", () => {
  const it = sevenDays();
  const times = core.estimateTimes(it);
  const stops = core.stopEntries(it.route.points).map((e) => e.point);
  assert.equal(core.stopTimesLabel(stops[0], times.get("stp_subic1")), "Dep. 09:00");
  assert.match(core.stopTimesLabel(stops[2], times.get("stp_capo")), /^Arr\. ~15:[0-2]\d · Dep\. 08:30$/);
  assert.equal(core.stopTimesLabel(stops[4], times.get("stp_poti")), "2 nights · Dep. 18:00");
  assert.equal(core.stopTimesLabel(stops[3], times.get("stp_herm")).startsWith("Arr. ~"), true);
  assert.equal(core.stopTimesLabel({ stop: true }, { arrive: null, depart: null }), "");
});

test("lineGeometry: a dot per single-day stop, a loop spanning a multi-day stop, terminus flags, line extent", () => {
  const days = core.deriveDays(sevenDays(), 7);
  // Fake measurements: sub-box centre y per "stopId:day", 40px apart in render order.
  const centres = new Map();
  let y = 20;
  days.forEach((d) => d.stops.forEach((s) => { centres.set(`${s.id}:${d.day}`, y); y += 40; }));
  const geo = core.lineGeometry(days, centres);
  assert.deepEqual(geo.shapes.map((s) => [s.stopId, s.kind, s.y1, s.y2, s.terminal]), [
    ["stp_subic1", "dot", 20, 20, "origin"],
    ["stp_anaw", "dot", 60, 60, null],
    ["stp_capo", "loop", 100, 140, null],
    ["stp_herm", "loop", 180, 220, null],
    ["stp_poti", "loop", 260, 340, null],
    ["stp_hund", "loop", 380, 420, null],
    ["stp_subic2", "dot", 460, 460, "terminus"]
  ]);
  assert.equal(geo.top, 20);
  assert.equal(geo.bottom, 460);
  assert.deepEqual(core.lineGeometry([], new Map()), { shapes: [], top: 0, bottom: 0 });
});
