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
