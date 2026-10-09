"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../pack-core.js");
const csaba = require("./fixtures/pack-csaba.json");

const ALL = ["summary", "route", "crew", "menus"];
const pack = (extra) => ({ ...core.defaultPack(), ...(extra || {}) });

test("defaultPack and normalizePack mirror the server rules", () => {
  assert.deepEqual(core.defaultPack(), { theme: "a", type: "proposal", prepared_for: "", cover_note: "", sections: ALL, cover_image: null });
  assert.deepEqual(core.normalizePack(null), core.defaultPack());
  const n = core.normalizePack({ theme: "c", type: "brief", prepared_for: "x".repeat(130), sections: ["menus", "route", "bogus"], cover_image: "cover-1700000000000.jpg" });
  assert.equal(n.theme, "c");
  assert.equal(n.type, "brief");
  assert.equal(n.prepared_for.length, 120);
  assert.deepEqual(n.sections, ["route", "menus"]);
  assert.equal(n.cover_image, "cover-1700000000000.jpg");
  assert.equal(core.normalizePack({ cover_image: "../x.jpg" }).cover_image, null);
  assert.deepEqual(core.normalizePack({ sections: [] }).sections, ALL);
});

test("toggleSection keeps the standard order and never empties the list", () => {
  assert.deepEqual(core.toggleSection(["summary", "menus"], "route"), ["summary", "route", "menus"]);
  assert.deepEqual(core.toggleSection(["summary", "menus"], "menus"), ["summary"]);
  assert.deepEqual(core.toggleSection(["crew"], "crew"), ["crew"]);
  assert.deepEqual(core.toggleSection(["crew"], "nope"), ["crew"]);
});

test("formatDateRange: same month, across months, across years, missing", () => {
  assert.equal(core.formatDateRange("2026-11-01", "2026-11-09"), "1 – 9 November 2026");
  assert.equal(core.formatDateRange("2026-11-28", "2026-12-03"), "28 November – 3 December 2026");
  assert.equal(core.formatDateRange("2026-12-28", "2027-01-03"), "28 December 2026 – 3 January 2027");
  assert.equal(core.formatDateRange("2026-11-01", "2026-11-01"), "1 November 2026");
  assert.equal(core.formatDateRange("2026-11-01", ""), "1 November 2026");
  assert.equal(core.formatDateRange("", ""), "");
});

test("routeSummary: none, one, many", () => {
  assert.equal(core.routeSummary([]), "");
  assert.equal(core.routeSummary([{ name: "Cebu" }]), "Cebu");
  assert.equal(core.routeSummary([{ name: "Cebu" }, { name: "Oslob" }, { name: "Port Caltom" }]), "Cebu → Port Caltom");
});

test("dayLabel: one day or a range", () => {
  assert.equal(core.dayLabel([2]), "2");
  assert.equal(core.dayLabel([4, 5, 6]), "4–6");
  assert.equal(core.dayLabel([]), "");
});

test("mapMarkers: one per charter stop with the days it covers; waypoints are skipped", () => {
  const markers = core.mapMarkers(csaba.itinerary);
  assert.equal(markers.length, 7);
  assert.deepEqual(markers.map((m) => m.label), ["1–2", "2–3", "4–7", "8–9", "9–10", "10–11", "11"]);
  assert.equal(markers[1].name, "Oslob and Apo Island");
  assert.ok(Number.isFinite(markers[0].lat) && Number.isFinite(markers[0].lng));
  assert.deepEqual(core.mapMarkers({ route: { points: [{ latitude: 1, longitude: 2 }] } }), []);
});

test("mapKey: one line per stop", () => {
  assert.deepEqual(core.mapKey([{ label: "2", name: "Oslob" }, { label: "4–5", name: "Apo" }]), ["2 · Oslob", "4–5 · Apo"]);
});

test("mergeMarkers: markers closer than the threshold share one marker", () => {
  const pts = [
    { x: 0, y: 0, label: "3", name: "A" },
    { x: 10, y: 5, label: "4", name: "B" },
    { x: 100, y: 0, label: "5", name: "C" },
    { x: 117, y: 0, label: "6", name: "D" },
    { x: 118, y: 0, label: "7", name: "E" }
  ];
  const merged = core.mergeMarkers(pts, 18);
  assert.deepEqual(merged.map((m) => m.label), ["3, 4", "5, 6", "7"]);
  assert.deepEqual(merged[0].names, ["A", "B"]);
  assert.deepEqual([merged[0].x, merged[0].y], [5, 2.5]);
  assert.equal(core.mergeMarkers([], 18).length, 0);
});

test("buildPackModel: cover facts from the csaba fixture", () => {
  const m = core.buildPackModel(csaba, pack({ prepared_for: "Mr & Mrs Csaba", cover_note: "Dear both" }));
  assert.equal(m.theme, "a");
  assert.equal(m.kicker, "Charter Proposal");
  assert.equal(m.vesselName, "M/Y Princess Iolanthe");
  assert.equal(m.routeSummary, "Cebu Yacht Club → Port Caltom");
  assert.equal(m.dates, "1 – 9 November 2026");
  assert.equal(m.preparedFor, "Mr & Mrs Csaba");
  assert.equal(m.coverNote, "Dear both");
  assert.equal(m.footer, "Charter Proposal · Mr & Mrs Csaba");
  assert.equal(m.subjectToChange, true);
  assert.deepEqual(m.stats.map((s) => s.label), ["days", "stops", "nm"]);
  assert.equal(m.stats[0].value, "9", "the charter's own length, not the route's");
  assert.equal(m.stats[1].value, "7");
  assert.ok(Number(m.stats[2].value) > 100);
  assert.equal(core.buildPackModel(csaba, pack({ type: "brief" })).subjectToChange, false);
  assert.equal(core.buildPackModel(csaba, pack({ type: "brief" })).footer, "Charter Brief");
});

test("buildPackModel: sections follow the ticked list and the data", () => {
  const all = core.buildPackModel(csaba, pack());
  assert.deepEqual(all.sections.map((s) => s.id), ALL);
  const two = core.buildPackModel(csaba, pack({ sections: ["menus", "summary"] }));
  assert.deepEqual(two.sections.map((s) => s.id), ["summary", "menus"]);
  const empty = { itinerary: { start_date: "2026-11-01", end_date: "2026-11-03", route: { points: [] }, activities: [] }, menus: { menus: [] }, guest_drinks: { sections: [] }, vessel: {} };
  assert.deepEqual(core.buildPackModel(empty, pack()).sections.map((s) => s.id), ["summary"]);
});

test("buildPackModel: summary rows", () => {
  const summary = core.buildPackModel(csaba, pack()).sections[0];
  assert.deepEqual(summary.rows, [
    { label: "Dates", value: "1 – 9 November 2026" },
    { label: "Nights", value: "8" },
    { label: "Guests", value: "1" },
    { label: "Embarkation", value: "Cebu Yacht Club" },
    { label: "Disembarkation", value: "Port Caltom" }
  ]);
  assert.match(summary.welcome, /^We welcome you to your charter/);
});

test("buildPackModel: route days carry dates, stops and that day's activities", () => {
  const route = core.buildPackModel(csaba, pack()).sections.find((s) => s.id === "route");
  assert.equal(route.days.length, 11);
  assert.equal(route.days[0].date, "Sun 1 Nov");
  assert.equal(route.days[1].stops.map((s) => s.name).join(" / "), "Cebu Yacht Club / Oslob and Apo Island");
  const oslob = route.days[1].stops[1];
  assert.ok(oslob.activities.length >= 2);
  assert.ok(oslob.activities.every((a) => typeof a.title === "string" && typeof a.notes === "string"));
  assert.equal(route.markers.length, 7);
  assert.equal(route.key[0], "1–2 · Cebu Yacht Club");
});

test("buildPackModel: stop times show on the day they happen", () => {
  const data = {
    itinerary: {
      start_date: "2026-11-01", end_date: "2026-11-02",
      route: { points: [
        { latitude: 1, longitude: 1, stop: true, id: "a", name: "A", depart: { day: 1, time: "07:00" } },
        { latitude: 2, longitude: 2, stop: true, id: "b", name: "B", arrive: { day: 2, time: "15:30" } }
      ] },
      activities: []
    }
  };
  const route = core.buildPackModel(data, pack()).sections.find((s) => s.id === "route");
  assert.equal(route.days[0].stops[0].times, "Departs 07:00");
  assert.equal(route.days[1].stops[0].times, "Arrives 15:30");
  const rows = core.buildPackModel(data, pack()).sections[0].rows;
  assert.equal(rows.find((r) => r.label === "Embarkation").value, "A, departs 07:00");
  assert.equal(rows.find((r) => r.label === "Disembarkation").value, "B, arrives 15:30");
  assert.equal(rows.find((r) => r.label === "Guests"), undefined, "an empty row is left out");
});

test("buildPackModel: crew and yacht", () => {
  const crew = core.buildPackModel(csaba, pack()).sections.find((s) => s.id === "crew");
  assert.match(crew.description, /welcome you onboard/);
  assert.deepEqual(crew.details[0], { label: "Vessel Name", value: "M/Y Princess Iolanthe" });
  assert.equal(crew.notes[0].title, "General Notes");
  assert.equal(crew.groups[0].title, "Bridge and Deck");
  assert.deepEqual(crew.groups[0].members[0], { name: "Allen J. Sutton", position: "Captain / Master" });
});

test("buildPackModel: menus keep active days with courses; drinks keep sections with items", () => {
  const menus = core.buildPackModel(csaba, pack()).sections.find((s) => s.id === "menus");
  assert.equal(menus.menus.length, 1, "Day 2 has no dishes and is left out");
  assert.equal(menus.menus[0].label, "Day 1");
  assert.equal(menus.menus[0].notes, "Mediterranean Lunch / Classic Dinner");
  assert.deepEqual(menus.menus[0].courses.map((c) => c.title), ["Breakfast", "Lunch", "Dinner"]);
  assert.deepEqual(menus.menus[0].courses[0].items[0], { name: "Fresh Fruit Plate", description: "Seasonal tropical fruit selection" });
  assert.deepEqual(menus.drinks.map((d) => d.title), ["Wine"]);
  assert.ok(menus.drinks[0].items.length > 0);
  const inactive = { ...csaba, menus: { menus: [{ ...csaba.menus.menus[0], active: false }] }, guest_drinks: { sections: [] } };
  assert.equal(core.buildPackModel(inactive, pack()).sections.find((s) => s.id === "menus"), undefined);
});
