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

test("estimateTimes: set times upright, arrivals estimated from the previous departure, an overnight stop without a departure time leaves at 09:00", () => {
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
  assert.deepEqual(herm.depart, { time: "09:00", estimated: true });   // 1 night, no departure time set → 09:00 (spec A2 D4)
  const poti = times.get("stp_poti");
  assert.equal(poti.arrive.estimated, true);               // ~19 nm at 8 kn from 09:00 → about 11:22
  assert.match(poti.arrive.time, /^11:[1-3]\d$/);
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
  assert.match(core.stopTimesLabel(stops[4], times.get("stp_poti")), /^Arr\. ~11:[1-3]\d · 2 nights · Dep\. 18:00$/);
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
