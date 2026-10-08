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
  assert.deepEqual(core.normalizeItinerary(null), { version: 2, revision: 0, welcome_message: "", summary: "", route: { source: null, speed_kn: 8, points: [] }, activities: [], dirty_stop_ids: [] });
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

test("estimateTimes: set times upright, arrivals estimated from the previous departure, an overnight stop without a departure time leaves at 07:00", () => {
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
  assert.deepEqual(herm.depart, { time: "07:00", estimated: true });   // 1 night, no departure time set → 07:00 (spec A2 round 2 T12)
  const poti = times.get("stp_poti");
  assert.equal(poti.arrive.estimated, true);               // ~19 nm at 8 kn from 07:00 → about 09:22
  assert.match(poti.arrive.time, /^09:[1-3]\d$/);
  assert.deepEqual(poti.depart, { time: "18:00", estimated: false });
  const hund = times.get("stp_hund");
  assert.equal(hund.arrive.estimated, true);               // re-anchored by Potipot's 18:00; shown mod 24 h
  assert.match(hund.arrive.time, /^\d\d:\d\d$/);
});

test("estimateTimes: a zero-night stop with no departure time leaves 2 h after it arrives, never past 23:59", () => {
  const it = sevenDays();
  delete it.route.points[1].depart.time;                   // Anawangin: arrive ~09:33, depart estimated ~11:33
  const t = core.estimateTimes(it).get("stp_anaw");
  assert.equal(t.depart.estimated, true);
  assert.equal(t.depart.time, core.minutesToTime(core.timeToMinutes(t.arrive.time) + core.DAY_STOP_DWELL_MIN));
  const late = sevenDays();
  late.route.points[0].depart.time = "22:30";              // Subic leaves late: Anawangin arrives ~23:03, departs 23:59 not 01:03
  delete late.route.points[1].depart.time;
  assert.equal(core.estimateTimes(late).get("stp_anaw").depart.time, "23:59");
});

test("stopTimesLabel: Arr./Dep. with ~ for estimates, nights when more than one", () => {
  const it = sevenDays();
  const times = core.estimateTimes(it);
  const stops = core.stopEntries(it.route.points).map((e) => e.point);
  assert.equal(core.stopTimesLabel(stops[0], times.get("stp_subic1")), "Dep. 09:00");
  assert.match(core.stopTimesLabel(stops[2], times.get("stp_capo")), /^Arr\. ~15:[0-2]\d · Dep\. 08:30$/);
  assert.match(core.stopTimesLabel(stops[4], times.get("stp_poti")), /^Arr\. ~09:[1-3]\d · 2 nights · Dep\. 18:00$/);
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

test("setStopTime and setStopSites", () => {
  const it = sevenDays();
  const p = (x, id) => core.stopEntries(x.route.points).map((e) => e.point).find((s) => s.id === id);
  const timed = core.setStopTime(it, "stp_herm", "arrive", "12:40");
  assert.deepEqual(p(timed, "stp_herm").arrive, { day: 2, time: "12:40" });
  const cleared = core.setStopTime(timed, "stp_herm", "arrive", "");
  assert.deepEqual(p(cleared, "stp_herm").arrive, { day: 2 });
  assert.equal(core.setStopTime(it, "stp_herm", "arrive", "25:00"), it);          // invalid → unchanged
  const sited = core.setStopSites(it, "stp_herm", ["reef-east", "reef-west"]);
  assert.deepEqual(p(sited, "stp_herm").site_ids, ["reef-east", "reef-west"]);
  // removing a served site drops the site activities that pointed at it
  const unsited = core.setStopSites(it, "stp_capo", []);
  assert.equal(unsited.activities.some((a) => a.id === "act_2"), false);
  assert.equal(unsited.activities.some((a) => a.id === "act_1"), true);
});

test("sitesByDistance: nearest first, with the within-5nm flag", () => {
  const sitesLib = { sites: [
    { id: "far", title: "Far", latitude: 16.0, longitude: 121.0 },
    { id: "near", title: "Near", latitude: 15.31, longitude: 119.81 },
    { id: "bad", title: "No position" }
  ] };
  const list = core.sitesByDistance(sitesLib, { latitude: 15.30, longitude: 119.80 });
  assert.deepEqual(list.map((s) => [s.id, s.near]), [["near", true], ["far", false]]);
  assert.ok(list[0].nm < 1 && list[1].nm > 50);
});

test("renumberActivities: 0..n within each (stop, day) group by relative order; array order is kept", () => {
  const out = core.renumberActivities([
    { id: "a", stop_id: "s", day: 1, order: 5 }, { id: "b", stop_id: "s", day: 1, order: 2 }, { id: "c", stop_id: "s", day: 2, order: 9 }
  ]);
  assert.deepEqual(out.map((a) => [a.id, a.order]), [["a", 1], ["b", 0], ["c", 0]]);
});

test("canDropActivity: site activities only onto a stop that serves the site; free text anywhere in span", () => {
  const it = sevenDays();
  assert.equal(core.canDropActivity(it, "act_2", "stp_capo", 2, 7), true);     // same stop, other day in span
  assert.equal(core.canDropActivity(it, "act_2", "stp_capo", 3, 7), false);    // day 3 outside Capones (1–2)
  assert.equal(core.canDropActivity(it, "act_2", "stp_poti", 3, 7), false);    // Potipot does not serve capones-lh
  assert.equal(core.canDropActivity(it, "act_1", "stp_poti", 4, 7), true);     // free text
  assert.equal(core.canDropActivity(it, "act_1", "stp_nope", 4, 7), false);
});

test("moveActivity: re-homes and renumbers both groups; insertion index respected", () => {
  const it = sevenDays();
  const out = core.moveActivity(it, "act_1", "stp_poti", 4, 0);               // Sundowners → Potipot day 4, first
  const poti4 = out.activities.filter((a) => a.stop_id === "stp_poti" && a.day === 4).sort((a, b) => a.order - b.order);
  assert.deepEqual(poti4.map((a) => a.id), ["act_1", "act_3"]);
  const capo1 = out.activities.filter((a) => a.stop_id === "stp_capo" && a.day === 1);
  assert.deepEqual(capo1.map((a) => [a.id, a.order]), [["act_2", 0]]);
  assert.equal(core.moveActivity(it, "act_2", "stp_poti", 3, 0), it);         // refused: not served → unchanged
  const reorder = core.moveActivity(it, "act_1", "stp_capo", 1, 0);           // within the group, to the top
  assert.deepEqual(reorder.activities.filter((a) => a.stop_id === "stp_capo").sort((a, b) => a.order - b.order).map((a) => a.id), ["act_1", "act_2"]);
});

test("addActivity, updateActivity, removeActivity", () => {
  const it = sevenDays();
  const seqRandom = (() => { let i = 0; return () => (i = (i + 7) % 36) / 36; })();
  const added = core.addActivity(it, "stp_herm", 2, { title: "Snorkel", site_id: "reef-east" }, seqRandom);
  const act = added.activities.find((a) => a.title === "Snorkel");
  assert.match(act.id, /^act_/);
  assert.deepEqual([act.stop_id, act.day, act.order, act.site_id], ["stp_herm", 2, 0, "reef-east"]);
  const herm = core.stopEntries(added.route.points).map((e) => e.point).find((p) => p.id === "stp_herm");
  assert.deepEqual(herm.site_ids, ["reef-east"]);                             // served site added
  assert.deepEqual(core.validateItinerary(added, 7), []);
  const updated = core.updateActivity(added, act.id, { title: "Snorkel the reef", notes: "East side", time: "10:00" });
  const u = updated.activities.find((a) => a.id === act.id);
  assert.deepEqual([u.title, u.notes, u.time], ["Snorkel the reef", "East side", "10:00"]);
  assert.equal(core.updateActivity(added, act.id, { time: "bad" }).activities.find((a) => a.id === act.id).time, undefined);
  const removed = core.removeActivity(updated, act.id);
  assert.equal(removed.activities.some((a) => a.id === act.id), false);
  assert.equal(core.addActivity(it, "stp_herm", 5, { title: "x" }, seqRandom), it);   // day outside span → unchanged
});

const seqRandom2 = () => { let i = 0; return () => (i = (i + 11) % 36) / 36; };

test("reconcileRoutePoints: unchanged points give the same stops and no notices", () => {
  const it = sevenDays();
  const out = core.reconcileRoutePoints(it, it.route.points, 7, seqRandom2());
  assert.deepEqual(out.removed, []);
  assert.equal(out.reseededFrom, null);
  assert.deepEqual(core.stopEntries(out.itinerary.route.points).map((e) => e.point), core.stopEntries(it.route.points).map((e) => e.point));
  assert.deepEqual(out.itinerary.activities, it.activities);
});

test("reconcileRoutePoints: a new stop between two stops gets an id and zero nights on the previous departure day", () => {
  const it = sevenDays();
  const pts = [...it.route.points];
  pts.splice(3, 0, P(15.1, 119.9, { anchorage_id: "new-anch", name: "New anchorage" }));   // between Capones (dep 2) and Hermana (arr 2)
  const out = core.reconcileRoutePoints(it, pts, 7, seqRandom2());
  const added = core.stopEntries(out.itinerary.route.points).map((e) => e.point).find((p) => p.anchorage_id === "new-anch");
  assert.match(added.id, /^stp_/);
  assert.deepEqual([added.arrive, added.depart], [{ day: 2 }, { day: 2 }]);
  assert.deepEqual(core.validateItinerary(out.itinerary, 7), []);
});

test("reconcileRoutePoints: a new stop before the origin becomes the origin; the old origin gains an arrival on day 1", () => {
  const it = sevenDays();
  const pts = [P(14.7, 120.3, { stop: true, name: "Marina" }), ...it.route.points];
  const out = core.reconcileRoutePoints(it, pts, 7, seqRandom2());
  const stops = core.stopEntries(out.itinerary.route.points).map((e) => e.point);
  assert.equal(stops[0].name, "Marina");
  assert.equal(stops[0].arrive, undefined);
  assert.deepEqual(stops[0].depart, { day: 1 });
  assert.deepEqual(stops[1].arrive, { day: 1 });                 // old origin Subic
  assert.deepEqual(stops[1].depart, { day: 1, time: "09:00" });
  assert.deepEqual(core.validateItinerary(out.itinerary, 7), []);
});

test("reconcileRoutePoints: a new stop after the terminus becomes the terminus", () => {
  const it = sevenDays();
  const pts = [...it.route.points, P(14.6, 120.4, { stop: true, name: "Fuel dock" })];
  const out = core.reconcileRoutePoints(it, pts, 7, seqRandom2());
  const stops = core.stopEntries(out.itinerary.route.points).map((e) => e.point);
  assert.equal(stops[stops.length - 1].name, "Fuel dock");
  assert.deepEqual(stops[stops.length - 1].arrive, { day: 7 });
  assert.equal(stops[stops.length - 1].depart, undefined);
  assert.deepEqual(stops[stops.length - 2].depart, { day: 7 });  // old terminus Subic gains a departure
  assert.deepEqual(core.validateItinerary(out.itinerary, 7), []);
});

test("reconcileRoutePoints: a removed stop takes its activities and is reported", () => {
  const it = sevenDays();
  const pts = it.route.points.filter((p) => p.id !== "stp_capo");
  const out = core.reconcileRoutePoints(it, pts, 7, seqRandom2());
  assert.deepEqual(out.removed.map((r) => [r.name, r.activities.map((a) => a.title)]), [["Capones Is.", ["Lighthouse walk", "Sundowners"]]]);
  assert.equal(out.itinerary.activities.some((a) => a.stop_id === "stp_capo"), false);
  assert.deepEqual(core.validateItinerary(out.itinerary, 7), []);
});

test("reconcileRoutePoints: reordered stops re-seed days from the first out-of-order stop", () => {
  const it = sevenDays();
  const pts = [...it.route.points];
  // Swap Hermana (idx 3) and Potipot (idx 4): Potipot (arr 3) now comes before Hermana (arr 2) → out of order at Hermana
  [pts[3], pts[4]] = [pts[4], pts[3]];
  const out = core.reconcileRoutePoints(it, pts, 7, seqRandom2());
  assert.equal(out.reseededFrom, "Hermana Mayor");
  const stops = core.stopEntries(out.itinerary.route.points).map((e) => e.point);
  const herm = stops.find((p) => p.id === "stp_herm");
  const poti = stops.find((p) => p.id === "stp_poti");
  assert.deepEqual([poti.arrive.day, poti.depart.day], [3, 5]);     // unchanged, it is in order after Capones (dep 2)
  assert.deepEqual([herm.arrive.day, herm.depart.day], [5, 5]);     // re-seeded: arrive when Potipot leaves, zero nights
  const hund = stops.find((p) => p.id === "stp_hund");
  assert.deepEqual([hund.arrive.day, hund.depart.day], [5, 5]);     // cascaded re-seed, zero nights, clamped within 7
  assert.deepEqual(core.validateItinerary(out.itinerary, 7), []);
});

const CHARTER_7 = { start_date: "2026-10-12", end_date: "2026-10-18" };
const stopOf = (record, id) => core.stopEntries(record.route.points).map((e) => e.point).find((p) => p.id === id);
const daysOf = (record, id) => { const p = stopOf(record, id); return [p.arrive ? p.arrive.day : null, p.depart ? p.depart.day : null]; };
const itemDays = (record) => Object.fromEntries(record.activities.map((a) => [a.id, a.day]));

test("A2 normalize: duration_min kept when an integer; dirty_stop_ids kept only for existing stops", () => {
  const it = core.normalizeItinerary({
    version: 2,
    route: { points: [P(1, 1, { stop: true, id: "stp_a", depart: { day: 1 } }), P(2, 2, { stop: true, id: "stp_b", arrive: { day: 1 } })] },
    activities: [
      { id: "act_1", stop_id: "stp_a", day: 1, title: "x", duration_min: 90 },
      { id: "act_2", stop_id: "stp_a", day: 1, title: "y", duration_min: "45" },
      { id: "act_3", stop_id: "stp_a", day: 1, title: "z", duration_min: 7.5 },
      { id: "act_4", stop_id: "stp_a", day: 1, title: "n", duration_min: null },
      { id: "act_5", stop_id: "stp_a", day: 1, title: "e", duration_min: "" }
    ],
    dirty_stop_ids: ["stp_b", "stp_nope", "stp_b", 7]
  });
  assert.deepEqual(it.activities.map((a) => a.duration_min), [90, 45, undefined, undefined, undefined]);
  assert.deepEqual(it.dirty_stop_ids, ["stp_b"]);
});

test("A2 validate: duration bounds are errors; a day past the charter's end is not an error any more", () => {
  const it = sevenDays();
  it.activities[0].duration_min = 3;
  assert.deepEqual(core.validateItinerary(it, 7).map((e) => e.field), ["activities[0].duration_min"]);
  it.activities[0].duration_min = 1441;
  assert.deepEqual(core.validateItinerary(it, 7).map((e) => e.field), ["activities[0].duration_min"]);
  it.activities[0].duration_min = 60;
  it.route.points[7].arrive = { day: 9 };          // terminus two days past a 7-day charter: the fit pill reports it
  assert.deepEqual(core.validateItinerary(it, 7), []);
});

test("A2 itinerarySnapshot: visiting a dirty card is a change worth saving", () => {
  const a = sevenDays();
  const b = { ...sevenDays(), dirty_stop_ids: ["stp_hund"] };
  assert.notEqual(core.itinerarySnapshot(a), core.itinerarySnapshot(b));
});

test("A2 updateActivity: a valid duration_min is set, an invalid one clears it", () => {
  const it = sevenDays();
  const withDuration = core.updateActivity(it, "act_3", { duration_min: 90 });
  assert.equal(withDuration.activities.find((a) => a.id === "act_3").duration_min, 90);
  const cleared = core.updateActivity(withDuration, "act_3", { duration_min: 2 });
  assert.equal(cleared.activities.find((a) => a.id === "act_3").duration_min, undefined);
  assert.equal(core.updateActivity(withDuration, "act_3", { title: "Kayaks!" }).activities.find((a) => a.id === "act_3").duration_min, 90);
});

test("A2 reconcileRoutePoints no longer clamps days to the charter", () => {
  const it = sevenDays();
  it.route.points[7].arrive = { day: 9 };
  const pts = [...it.route.points, P(14.6, 120.4, { stop: true, name: "Fuel dock" })];
  const out = core.reconcileRoutePoints(it, pts, 7, seqRandom2());
  const stops = core.stopEntries(out.itinerary.route.points).map((e) => e.point);
  assert.deepEqual(stops[stops.length - 1].arrive, { day: 9 });
  assert.deepEqual(stops[stops.length - 2].depart, { day: 9 });
});

test("A2 recordDayCount: the terminus's arrival day; 0 without stops", () => {
  assert.equal(core.recordDayCount(sevenDays().route.points), 7);
  assert.equal(core.recordDayCount([P(1, 1), P(2, 2)]), 0);
  assert.equal(core.recordDayCount([P(1, 1, { stop: true, id: "a" })]), 1);
});

test("A2 recomputeArrivals: Potipot 18:00 + 36.5 nm at 8 kn reaches Hundred Islands at ~22:34 the same day, so the fixture's day-6 arrival moves to day 5 and the stay follows", () => {
  const it = sevenDays();
  const out = core.recomputeArrivals(it);
  assert.deepEqual(daysOf(out, "stp_hund"), [5, 6]);        // was 6–7: the arrival day is computed, the night is kept
  assert.deepEqual(daysOf(out, "stp_subic2"), [6, null]);   // 08:00 day 6 + 85.5 nm → ~18:41 day 6
  assert.deepEqual(daysOf(out, "stp_poti"), [3, 5]);        // untouched: 09:00 day 3 + 19 nm → 11:22 day 3
  assert.deepEqual(out.dirty_stop_ids, ["stp_hund", "stp_subic2"]);
  assert.deepEqual(itemDays(out), itemDays(it));            // no items at the moved stops
  assert.deepEqual(daysOf(it, "stp_hund"), [6, 7]);         // input untouched
  assert.deepEqual(core.recomputeArrivals(out), out);       // idempotent, same object back
  assert.deepEqual(core.validateItinerary(out, 7), []);
  const t = core.estimateTimes(out);
  assert.deepEqual(t.get("stp_hund").arrive, { time: "22:34", estimated: true });
  assert.deepEqual(t.get("stp_subic2").arrive, { time: "18:41", estimated: true });
});

test("A2 recomputeArrivals: a pinned arrival time is kept; items move with their stop", () => {
  const it = sevenDays();
  it.route.points[6].arrive = { day: 6, time: "23:00" };    // Hundred Islands pinned
  it.activities.push({ id: "act_5", stop_id: "stp_hund", day: 7, order: 0, title: "Island hop", notes: "" });
  const out = core.recomputeArrivals(core.normalizeItinerary(it));
  assert.deepEqual(stopOf(out, "stp_hund").arrive, { day: 5, time: "23:00" });
  assert.equal(out.activities.find((a) => a.id === "act_5").day, 6);
  assert.deepEqual(core.validateItinerary(out, 7), []);
});

test("A2 shiftFromStop: the stop's departure and everything after it move by delta, items too; later stops are dirty", () => {
  const it = sevenDays();
  const out = core.shiftFromStop(it, "stp_herm", 1);
  assert.deepEqual(daysOf(out, "stp_herm"), [2, 4]);        // arrival unchanged, departure +1
  assert.deepEqual(daysOf(out, "stp_poti"), [4, 6]);
  assert.deepEqual(daysOf(out, "stp_hund"), [7, 8]);
  assert.deepEqual(daysOf(out, "stp_subic2"), [8, null]);
  assert.deepEqual(daysOf(out, "stp_capo"), [1, 2]);        // earlier stops untouched
  assert.deepEqual(itemDays(out), { act_1: 1, act_2: 1, act_3: 5, act_4: 4 });
  assert.deepEqual(out.dirty_stop_ids, ["stp_poti", "stp_hund", "stp_subic2"]);
  assert.deepEqual(daysOf(it, "stp_poti"), [3, 5]);         // input untouched
  assert.equal(core.shiftFromStop(it, "stp_herm", 0), it);
  assert.equal(core.shiftFromStop(it, "stp_nope", 1), it);
});

test("A2 setDeparture: a later day cascades then recomputes; an earlier day drops that stop's later items; a time change alone can roll a later arrival past midnight", () => {
  const it = sevenDays();
  const later = core.setDeparture(it, "stp_poti", { day: 6 });
  assert.deepEqual(stopOf(later, "stp_poti").depart, { day: 6, time: "18:00" });
  assert.deepEqual(daysOf(later, "stp_hund"), [6, 7]);      // shifted +1 to 7–8, then recomputed back to 6–7 (22:34 on day 6)
  assert.deepEqual(daysOf(later, "stp_subic2"), [7, null]);
  assert.deepEqual(later.dirty_stop_ids, ["stp_hund", "stp_subic2"]);
  assert.deepEqual(core.validateItinerary(later, 7), []);

  const earlier = core.setDeparture(it, "stp_poti", { day: 3 });   // Kayaks (day 4) goes, Beach (day 3) stays
  assert.deepEqual(stopOf(earlier, "stp_poti").depart, { day: 3, time: "18:00" });
  assert.deepEqual(itemDays(earlier), { act_1: 1, act_2: 1, act_4: 3 });
  assert.deepEqual(daysOf(earlier, "stp_hund"), [3, 4]);
  assert.deepEqual(daysOf(earlier, "stp_subic2"), [4, null]);
  assert.deepEqual(core.validateItinerary(earlier, 7), []);

  const clamped = core.setDeparture(it, "stp_poti", { day: 1 });  // never before its own arrival
  assert.equal(stopOf(clamped, "stp_poti").depart.day, 3);

  const base = core.recomputeArrivals(it);                         // Hundred Islands 5–6
  const night = core.setDeparture(base, "stp_poti", { time: "20:00" });
  assert.deepEqual(stopOf(night, "stp_poti").depart, { day: 5, time: "20:00" });
  assert.deepEqual(daysOf(night, "stp_hund"), [6, 7]);      // 20:00 + 4.57 h = 00:34, so the arrival rolls to day 6
  assert.deepEqual(core.estimateTimes(night).get("stp_hund").arrive, { time: "00:34", estimated: true });
  const cleared = core.setDeparture(it, "stp_poti", { time: "" });
  assert.deepEqual(stopOf(cleared, "stp_poti").depart, { day: 5, time: "07:00" });   // no valid time → the T12 default (2 nights → 07:00)
  assert.equal(core.setDeparture(it, "stp_subic2", { day: 9 }), it);   // the terminus has no departure
});

test("A2 droppedDays names the stop's items beyond the new departure day, or all of them for a removal", () => {
  const it = sevenDays();
  assert.deepEqual(core.droppedDays(it, "stp_poti", 3), { days: [4], items: [it.activities[2]] });
  assert.deepEqual(core.droppedDays(it, "stp_poti", 5).items, []);
  const all = core.droppedDays(it, "stp_poti", null);
  assert.deepEqual(all.days, [3, 4]);
  assert.deepEqual(all.items.map((a) => a.title), ["Beach", "Kayaks"]);
});

test("A2 itemsDroppedByImport: items after the from-day, plus items on it at stops not yet reached", () => {
  const it = sevenDays();
  assert.deepEqual(core.itemsDroppedByImport(it, 4, 7).map((a) => a.id), []);                   // Kayaks on day 4 at Potipot (reached day 3) survives
  assert.deepEqual(core.itemsDroppedByImport(it, 2, 7).map((a) => a.id), ["act_3", "act_4"]);
  assert.deepEqual(core.itemsDroppedByImport(it, 1, 7).map((a) => a.id), ["act_1", "act_2", "act_3", "act_4"]);
});

test("A2 dayOrdinal: date ordinals from the charter start, 'day N' without one", () => {
  assert.deepEqual([1, 10, 11, 12].map((d) => core.dayOrdinal(CHARTER_7, d)), ["12th", "21st", "22nd", "23rd"]);
  assert.deepEqual([11, 12, 13].map((d) => core.dayOrdinal({ start_date: "2026-10-01" }, d)), ["11th", "12th", "13th"]);
  assert.equal(core.dayOrdinal(null, 4), "day 4");
});

test("A2 removeStop: the point stays as a waypoint, its items go, later arrivals recompute and go dirty", () => {
  const it = sevenDays();
  const out = core.removeStop(it, "stp_capo");
  const point = out.route.points[2];
  assert.deepEqual(point, { latitude: 14.95, longitude: 120.11, name: "Capones Is." });
  assert.deepEqual(out.activities.map((a) => a.id), ["act_3", "act_4"]);
  assert.deepEqual(daysOf(out, "stp_herm"), [1, 2]);        // Anawangin 14:00 + 36.5 nm → 18:34 day 1
  assert.deepEqual(daysOf(out, "stp_poti"), [2, 4]);
  assert.deepEqual(daysOf(out, "stp_hund"), [4, 5]);
  assert.deepEqual(daysOf(out, "stp_subic2"), [5, null]);
  assert.deepEqual(itemDays(out), { act_3: 3, act_4: 2 });
  assert.deepEqual(out.dirty_stop_ids, ["stp_herm", "stp_poti", "stp_hund", "stp_subic2"]);
  assert.deepEqual(core.validateItinerary(out, 7), []);

  const noOrigin = core.removeStop(it, "stp_subic1");
  assert.equal(stopOf(noOrigin, "stp_anaw").arrive, undefined);          // Anawangin is the origin now
  assert.deepEqual(stopOf(noOrigin, "stp_anaw").depart, { day: 1, time: "14:00" });
  assert.deepEqual(core.validateItinerary(noOrigin, 7), []);

  const noTerminus = core.removeStop(it, "stp_subic2");
  assert.equal(stopOf(noTerminus, "stp_hund").depart, undefined);        // Hundred Islands is the terminus now
  assert.deepEqual(core.validateItinerary(noTerminus, 7), []);
  assert.equal(core.removeStop(it, "stp_nope"), it);
});

test("A2 clashes: overlapping windows on a day (default 1 h), before the arrival, after the departure", () => {
  const it = sevenDays();
  it.activities = [
    { id: "k", stop_id: "stp_poti", day: 4, order: 0, title: "Kayaks", notes: "", time: "09:30" },
    { id: "s", stop_id: "stp_poti", day: 4, order: 1, title: "Snorkel", notes: "", time: "10:00", duration_min: 30 },
    { id: "b", stop_id: "stp_poti", day: 4, order: 2, title: "BBQ", notes: "", time: "10:30" },                 // starts when Kayaks ends: no clash
    { id: "n", stop_id: "stp_poti", day: 4, order: 3, title: "Nap", notes: "" },                                 // no time, never clashes
    { id: "e", stop_id: "stp_capo", day: 1, order: 0, title: "Early", notes: "", time: "14:00" },                // Capones is reached ~15:07
    { id: "l", stop_id: "stp_capo", day: 2, order: 0, title: "Late", notes: "", time: "08:00" },                 // Capones leaves 08:30
    { id: "f", stop_id: "stp_capo", day: 1, order: 1, title: "Fine", notes: "", time: "16:00" }
  ];
  const out = core.clashes(core.normalizeItinerary(it));
  assert.equal(out.get("k"), "clashes with Snorkel");
  assert.equal(out.get("s"), "clashes with Kayaks");
  assert.equal(out.get("b"), undefined);
  assert.equal(out.get("n"), undefined);
  assert.equal(out.get("e"), "before arrival ~15:07");
  assert.equal(out.get("l"), "after departure 08:30");
  assert.equal(out.get("f"), undefined);
});

test("A2 legSummaries: distance, hours and the computed arrival of the leg leaving each stop; none for the terminus", () => {
  const it = sevenDays();
  const legs = core.legSummaries(it);
  const first = legs.get("stp_subic1");
  assert.ok(Math.abs(first.nm - 4.44) < 0.05);
  assert.ok(Math.abs(first.hours - 0.56) < 0.01);
  assert.deepEqual([first.toName, first.departTime, first.departEstimated, first.arriveTime, first.arriveDay, first.overnight], ["Anawangin", "09:00", false, "09:33", 1, false]);
  assert.deepEqual([legs.get("stp_herm").departTime, legs.get("stp_herm").departEstimated], ["07:00", true]);
  assert.equal(legs.get("stp_poti").arriveTime, "22:34");
  assert.equal(legs.has("stp_subic2"), false);
  const night = core.setDeparture(it, "stp_poti", { time: "20:00" });
  const leg = core.legSummaries(night).get("stp_poti");
  assert.deepEqual([leg.arriveTime, leg.arriveDay, leg.overnight], ["00:34", 6, true]);
});

test("A2 fit: match, short, over, none", () => {
  const it = sevenDays();
  assert.deepEqual(core.fit(it, CHARTER_7), { state: "match", delta: 0, endsDay: 7, label: "✓", title: "Ends Sun 18 Oct; the charter ends Sun 18 Oct." });
  const short = core.fit(core.recomputeArrivals(it), CHARTER_7);
  assert.deepEqual([short.state, short.delta, short.label, short.title], ["short", -1, "−1 d", "Ends Sat 17 Oct; the charter ends Sun 18 Oct."]);
  const over = core.fit(it, { start_date: "2026-10-12", end_date: "2026-10-16" });
  assert.deepEqual([over.state, over.delta, over.label], ["over", 2, "+2 d"]);
  assert.equal(core.fit(it, {}).state, "none");
  assert.equal(core.fit(core.normalizeItinerary({}), CHARTER_7).state, "none");
  assert.equal(core.fit(core.normalizeItinerary({}), CHARTER_7).label, "—");
});

test("A2 rebaseRecord: day 1 lands on the from-day; items follow; from-day 1 is the same record", () => {
  const it = sevenDays();
  const out = core.rebaseRecord(it, 3);
  assert.deepEqual(stopOf(out, "stp_subic1").depart, { day: 3, time: "09:00" });
  assert.deepEqual(daysOf(out, "stp_poti"), [5, 7]);
  assert.deepEqual(itemDays(out), { act_1: 3, act_2: 3, act_3: 6, act_4: 5 });
  assert.equal(core.rebaseRecord(it, 1), it);
  assert.deepEqual(daysOf(it, "stp_poti"), [3, 5]);
});

test("A2 toUnassignedRoute: a new library record with the same stops, days and items", () => {
  const it = { ...sevenDays(), dirty_stop_ids: ["stp_hund"] };
  const route = core.toUnassignedRoute(it, "  North loop  ");
  assert.deepEqual([route.id, route.name, route.revision, route.speed_kn, route.source], ["", "North loop", 0, 8, { type: "planner" }]);
  assert.deepEqual(route.points, it.route.points);
  assert.deepEqual(route.activities, it.activities);
  assert.equal("dirty_stop_ids" in route, false);
  assert.notEqual(route.points, it.route.points);                      // copies, not the same arrays
});
// ---- spec A2 round 2 ---------------------------------------------------------------------

test("R2 defaultDepartTime: 07:00 with nights; arrival + 2 h for a day stop; clamped at 23:59; 07:00 without an estimate", () => {
  const it = sevenDays();
  assert.equal(core.defaultDepartTime(it, "stp_poti"), "07:00");                         // 2 nights
  assert.equal(core.defaultDepartTime(it, "stp_herm"), "07:00");                         // 1 night
  const anaw = core.estimateTimes(it).get("stp_anaw").arrive.time;                       // ~09:33
  assert.equal(core.defaultDepartTime(it, "stp_anaw"), core.minutesToTime(core.timeToMinutes(anaw) + 120));
  const late = sevenDays();
  late.route.points[0].depart.time = "22:30";
  assert.equal(core.defaultDepartTime(late, "stp_anaw"), "23:59");
  assert.equal(core.defaultDepartTime(it, "stp_subic1"), "07:00");                       // the origin has no arrival estimate
  assert.equal(core.defaultDepartTime(it, "stp_subic2"), "07:00");                       // the terminus has no departure
  assert.equal(core.defaultDepartTime(it, "stp_nope"), "07:00");
});

test("R2 setDeparture: a stay change on a stop with no time stores the default; a picked time is stored as picked", () => {
  const it = sevenDays();
  const herm = core.setDeparture(it, "stp_herm", { day: 4 });                            // Hermana had no time: 2 nights now → 07:00
  assert.deepEqual(stopOf(herm, "stp_herm").depart, { day: 4, time: "07:00" });
  const dayStop = core.setDeparture(it, "stp_herm", { day: 2 });                         // becomes a day stop → arrival + 2 h
  const arrive = core.estimateTimes(dayStop).get("stp_herm").arrive.time;
  assert.deepEqual(stopOf(dayStop, "stp_herm").depart, { day: 2, time: core.minutesToTime(core.timeToMinutes(arrive) + 120) });
  const picked = core.setDeparture(it, "stp_herm", { day: 4, time: "16:20" });
  assert.deepEqual(stopOf(picked, "stp_herm").depart, { day: 4, time: "16:20" });
  const kept = core.setDeparture(it, "stp_poti", { day: 6 });                            // Potipot keeps its 18:00
  assert.deepEqual(stopOf(kept, "stp_poti").depart, { day: 6, time: "18:00" });
});

test("R2 keptStopsBefore: stops reached before the from-day", () => {
  const it = sevenDays();
  assert.equal(core.keptStopsBefore(it, 1, 7), 0);
  assert.equal(core.keptStopsBefore(it, 2, 7), 3);                                       // Subic, Anawangin, Capones on day 1
  assert.equal(core.keptStopsBefore(it, 4, 7), 5);                                       // + Hermana (day 2), Potipot (day 3)
  assert.equal(core.keptStopsBefore(core.normalizeItinerary({}), 3, 7), 0);
});

test("R2 fitSentence: fits / short / over / kept stops / none, with day plurals", () => {
  const it = sevenDays();
  const match = core.fitSentence(core.fit(it, CHARTER_7), CHARTER_7, { stops: 7, fromDay: 1, kept: 0 });
  assert.deepEqual(match, { tone: "ok", line1: "Ends Sun 18 Oct · fits the charter", line2: "7 stops · Mon 12 Oct to Sun 18 Oct" });
  const short = core.fitSentence(core.fit(core.recomputeArrivals(it), CHARTER_7), CHARTER_7, { stops: 7, fromDay: 1, kept: 0 });
  assert.deepEqual(short, { tone: "warn", line1: "Ends Sat 17 Oct · 1 day before the charter ends", line2: "7 stops · Mon 12 Oct to Sat 17 Oct · the charter ends Sun 18 Oct" });
  const five = { start_date: "2026-10-12", end_date: "2026-10-16" };
  const over = core.fitSentence(core.fit(it, five), five, { stops: 7, fromDay: 1, kept: 0 });
  assert.deepEqual(over, { tone: "warn", line1: "Ends Sun 18 Oct · 2 days after the charter ends", line2: "7 stops · Mon 12 Oct to Sun 18 Oct · the charter ends Fri 16 Oct" });
  const mid = core.fitSentence(core.fit(core.rebaseRecord(it, 3), { start_date: "2026-10-12", end_date: "2026-10-20" }), { start_date: "2026-10-12", end_date: "2026-10-20" }, { stops: 7, fromDay: 3, kept: 1 });
  assert.deepEqual(mid, { tone: "ok", line1: "Ends Tue 20 Oct · fits the charter", line2: "Keeps the 1 stop reached before Wed 14 Oct, then 7 stops to Tue 20 Oct" });
  const none = core.fitSentence(core.fit(core.normalizeItinerary({}), CHARTER_7), CHARTER_7, {});
  assert.deepEqual(none, { tone: "none", line1: "No stops yet.", line2: "" });
  assert.equal(core.fitSentence(null, CHARTER_7, {}).tone, "none");
});

test("R2 subBoxTimesLabel: arrival day, middle day, departure day, same-day stop, origin", () => {
  const it = sevenDays();
  const times = core.estimateTimes(it);
  const stops = core.stopEntries(it.route.points).map((e) => e.point);
  assert.match(core.subBoxTimesLabel(stops[4], times.get("stp_poti"), 3), /^Arr\. ~09:[1-3]\d$/);   // Potipot arrives day 3
  assert.equal(core.subBoxTimesLabel(stops[4], times.get("stp_poti"), 4), "2 nights");
  assert.equal(core.subBoxTimesLabel(stops[4], times.get("stp_poti"), 5), "Dep. 18:00");
  assert.match(core.subBoxTimesLabel(stops[2], times.get("stp_capo"), 1), /^Arr\. ~15:[0-2]\d$/);     // Capones: in day 1, out day 2
  assert.equal(core.subBoxTimesLabel(stops[2], times.get("stp_capo"), 2), "Dep. 08:30");
  assert.match(core.subBoxTimesLabel(stops[1], times.get("stp_anaw"), 1), /^Arr\. ~09:[3-5]\d · Dep\. 14:00$/);   // same-day stop
  assert.equal(core.subBoxTimesLabel(stops[0], times.get("stp_subic1"), 1), "Dep. 09:00");            // the origin
  assert.equal(core.subBoxTimesLabel(stops[6], times.get("stp_subic2"), 7).startsWith("Arr. "), true);   // the terminus
  assert.equal(core.subBoxTimesLabel(stops[4], times.get("stp_poti"), 6), "");
  assert.equal(core.subBoxTimesLabel({ stop: true }, null, 1), "");
});

test("R2 timeOptions: the 15-minute grid, an off-grid minute kept once, blank first when allowed", () => {
  const on = core.timeOptions("07:30");
  assert.equal(on.hours.length, 24);
  assert.deepEqual([on.hours[0], on.hours[23]], ["00", "23"]);
  assert.deepEqual(on.minutes, ["00", "15", "30", "45"]);
  assert.deepEqual([on.hour, on.minute], ["07", "30"]);
  const off = core.timeOptions("09:20");
  assert.deepEqual(off.minutes, ["00", "15", "20", "30", "45"]);
  assert.deepEqual([off.hour, off.minute], ["09", "20"]);
  const blank = core.timeOptions("", { allowBlank: true });
  assert.deepEqual([blank.hours[0], blank.hours[1], blank.minutes[0], blank.minutes[1]], ["", "00", "", "00"]);
  assert.deepEqual([blank.hour, blank.minute], ["", ""]);
  assert.deepEqual(core.timeOptions("nonsense").minute, "");
  assert.equal(core.MINUTE_STEP, 15);
});
