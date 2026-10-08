"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const core = require("../charters-core.js");

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "active-charter-cases.json"), "utf8"));

for (const c of fixture.cases) {
  test(`activeCharterId: ${c.name}`, () => {
    assert.equal(core.activeCharterId(fixture.charters, c.stored, c.today), c.expect);
  });
}

test("addDays, isValidDate, nights, charterStatus, isInDate", () => {
  assert.equal(core.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(core.addDays("bad", 1), "");
  assert.equal(core.isValidDate("2026-02-30"), false);
  assert.equal(core.nights({ start_date: "2026-11-01", end_date: "2026-11-09" }), 8);
  assert.equal(core.nights({ start_date: "", end_date: "" }), null);
  const c = { start_date: "2026-11-01", end_date: "2026-11-09" };
  assert.equal(core.charterStatus(c, "2026-10-31"), "upcoming");
  assert.equal(core.charterStatus(c, "2026-11-09"), "underway");
  assert.equal(core.charterStatus(c, "2026-11-10"), "ended");
  assert.equal(core.charterStatus({}, "2026-11-10"), "no-dates");
  assert.equal(core.isInDate(c, "2026-10-31"), true);
  assert.equal(core.isInDate(c, "2026-10-30"), false);
});

test("findOverlaps skips self and reports clashes; overlapMessage", () => {
  const others = [
    { kind: "charter", id: "csaba", name: "Csaba", start_date: "2026-11-01", end_date: "2026-11-09" },
    { kind: "period", id: "p-1", name: "Maintenance · yard", start_date: "2026-11-12", end_date: "2026-11-20" }
  ];
  assert.equal(core.findOverlaps({ id: "csaba", start_date: "2026-11-01", end_date: "2026-11-09" }, others).length, 0);
  const hits = core.findOverlaps({ id: "new", start_date: "2026-11-09", end_date: "2026-11-12" }, others);
  assert.deepEqual(hits.map((h) => h.id), ["csaba", "p-1"]);
  assert.equal(core.overlapMessage(hits), "Overlaps Csaba (2026-11-01 – 2026-11-09)");
});

test("pillFor describes the charter relative to today and the active id", () => {
  const c = { id: "csaba", charter: { start_date: "2026-11-01", end_date: "2026-11-09" } };
  assert.deepEqual(core.pillFor(c, { activeId: "csaba", today: "2026-11-03" }), { tone: "active", text: "Active · day 3 of 9" });
  assert.deepEqual(core.pillFor(c, { activeId: "csaba", today: "2026-10-20" }), { tone: "active", text: "Active · starts in 12 days" });
  assert.deepEqual(core.pillFor(c, { activeId: "x", today: "2026-10-20" }), { tone: "upcoming", text: "Upcoming · starts in 12 days" });
  assert.deepEqual(core.pillFor(c, { activeId: "x", today: "2026-10-31" }), { tone: "upcoming", text: "Upcoming · starts tomorrow" });
  assert.deepEqual(core.pillFor(c, { activeId: "x", today: "2026-12-01" }), { tone: "ended", text: "Ended · 9 Nov 2026" });
  assert.deepEqual(core.pillFor(c, { activeId: "csaba", today: "2026-12-01" }), { tone: "active", text: "Active · ended 9 Nov 2026" });
  assert.deepEqual(core.pillFor({ id: "n", charter: {} }, { activeId: "x", today: "2026-12-01" }), { tone: "none", text: "No dates" });
});

test("fmtDate and fmtRange", () => {
  assert.equal(core.fmtDate("2026-11-01"), "Sun 1 Nov 2026");
  assert.equal(core.fmtRange("2026-11-01", "2026-11-09"), "Sun 1 Nov – Mon 9 Nov 2026");
  assert.equal(core.fmtRange("2026-12-28", "2027-01-03"), "Mon 28 Dec 2026 – Sun 3 Jan 2027");
  assert.equal(core.fmtRange("", ""), "No dates");
});

test("packRows places non-overlapping bars on one row and overlapping ones below", () => {
  const rows = core.packRows([
    { id: "a", start_date: "2026-11-01", end_date: "2026-11-09" },
    { id: "b", start_date: "2026-11-10", end_date: "2026-11-13" },
    { id: "c", start_date: "2026-11-05", end_date: "2026-11-06" },
    { id: "nodates", start_date: "", end_date: "" }
  ]);
  assert.deepEqual(rows.map((row) => row.map((bar) => bar.id)), [["a", "b"], ["c"]]);
});

test("zoomSpan: active fits the charter plus 7 days, others are fixed widths centred on the anchor", () => {
  const active = { start_date: "2026-11-01", end_date: "2026-11-09" };
  assert.deepEqual(core.zoomSpan("active", { active, today: "2026-10-08" }), { start: "2026-10-25", end: "2026-11-16" });
  const q = core.zoomSpan("quarter", { active, today: "2026-10-08" });
  assert.equal(core.dayIndex(q.end) - core.dayIndex(q.start), 91);
  assert.equal(core.dayIndex("2026-11-05") - core.dayIndex(q.start), 45);
  const y = core.zoomSpan("year", { active: null, today: "2026-10-08" });
  assert.equal(core.dayIndex(y.end) - core.dayIndex(y.start), 365);
  assert.equal(core.dayIndex("2026-10-08") - core.dayIndex(y.start), 182);
  assert.equal(core.dayIndex(core.zoomSpan("3years", { active: null, today: "2026-10-08" }).end) - core.dayIndex(core.zoomSpan("3years", { active: null, today: "2026-10-08" }).start), 1095);
  assert.deepEqual(core.zoomSpan("active", { active: null, today: "2026-10-08" }), core.zoomSpan("quarter", { active: null, today: "2026-10-08" }));
});

test("scrollRange spans three years around today, widened to the bars", () => {
  const r = core.scrollRange([{ start_date: "2024-01-10", end_date: "2024-01-20" }], "2026-10-08");
  assert.equal(r.start, "2023-12-11");
  assert.equal(r.end, "2028-04-08");
  const r2 = core.scrollRange([], "2026-10-08");
  assert.equal(r2.start, "2025-04-08");
  assert.equal(r2.end, "2028-04-08");
});

test("visibleMonths and visibleWeeks clip to the span", () => {
  const months = core.visibleMonths("2026-10-20", "2026-12-05");
  assert.deepEqual(months.map((m) => [m.label, m.start, m.end]), [["Oct 2026", "2026-10-20", "2026-10-31"], ["Nov 2026", "2026-11-01", "2026-11-30"], ["Dec 2026", "2026-12-01", "2026-12-05"]]);
  const weeks = core.visibleWeeks("2026-10-20", "2026-11-05");
  assert.deepEqual(weeks, ["2026-10-26", "2026-11-02"]);
});
