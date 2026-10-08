# Charter Gantt spec — Plan 2 of 2: Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a read-only charter Gantt band above every Charter panel as the charter selector, restyle the Charter Info page in the Route page's look, rework the New charter dialog, add the Reserved period card, and show the computed active charter (gold) with a Make active button that respects the server's rule.

**Architecture:** A pure module `charters-core.js` (UMD like `routes-core.js`, Node-tested, same active rule and fixture as the server) feeds `charter-gantt.js`, a self-contained DOM component mounted by `admin.js` into a host div that `sectionShell` renders for the Charter section. `admin.js` loses the Charter section's dropdown and toolbar buttons, gains the band wiring, a regrouped Info page with an unsaved-changes guard, and two reworked dialogs. New shared classes in `admin.css`; `routes.css`, `stop-cards.css` and the Route page's code are untouched.

**Tech Stack:** Plain HTML / CSS / JS, no build, `node --test`. Repo: `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin`, branch `feat/charter-gantt` from `main` (`98f5c07` or later). Spec: `docs/charter-rework/spec-charters.md` §3, §4, §6–§11. Requires plan 1 (server) deployed or running locally on the scratch server.

**Reading before you start:** `routes-core.js` lines 1–12 (the UMD wrapper); `admin.js` by name: the `state` object (top), `loadBootstrap`, `syncSelectedCharter`, `sectionToolbarHtml`, `sectionShell`, `bindSectionNav`, `bindSectionToolbar`, `bindSettingsFormController`, `settingsStateSignature`, `renderCharterInfoPanel`, `bindCharterInfoPanel`, `fillCharterInfoForm`, `openCreateCharterModal`, `createCharter`, `openDeleteCharterModal`, `renderCharter`, `setActiveCharter`, `iconButtonTone`, `buttonIconSvg`, `openDialogModal`, `modalActionButtonsHtml`, `showAdminConfirm`; `admin.css` lines 60–115 (button tones) and 752–830 (section shell). Line numbers drift; search by name.

---

## File structure

| File | Responsibility |
|---|---|
| `charters-core.js` (create) | Pure: the active rule (mirror of the server), `findOverlaps`, `charterStatus`, `nights`, `pillFor`, `packRows`, `zoomSpan`, `scrollRange`, `dayIndex` / `dateFromIndex`, `visibleMonths`, `visibleWeeks`, `fmtRange`. |
| `test/charters-core.test.js` (create) | Tests; the active-rule cases come from `test/fixtures/active-charter-cases.json`, copied verbatim from the server repo. |
| `charter-gantt.js` (create) | `window.IolantheCharterGantt.mount(host, ctx)`: toolbar, chart, pan, zoom, keys, tooltip, collapse. |
| `charter-gantt.css` (create) | Styles scoped under `.charter-gantt`. |
| `admin.css` (modify) | Shared classes: `.stat-tiles`, `.stat-tile`, `.form-section`, `.status-pill`, `.segmented`, gold icon tone, `.charter-info-columns`, `.charter-gantt-host`. |
| `admin.js` (modify) | State fields; bootstrap fields; band host + mounting; Charter toolbar removed; Info page; Make active; New charter dialog; Reserved period card; star icon. |
| `index.html` (modify) | New CSS / JS tags; asset version `admin-charters-1`. |
| `CLAUDE.md` (modify) | The band, the core, the new files. |

---

### Task 0: Branch and fixture

- [ ] **Step 1: Branch**

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin"
git checkout main && git pull --ff-only && git checkout -b feat/charter-gantt
node --test
```
Expected: `# pass 111`, `# fail 0`.

- [ ] **Step 2: Copy the shared fixture**

```bash
mkdir -p test/fixtures
cp "S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server/test/fixtures/active-charter-cases.json" test/fixtures/active-charter-cases.json
git add test/fixtures/active-charter-cases.json
git commit -m "test: shared active-charter fixture from the server repo"
```

---

### Task 1: `charters-core.js` — the rule, overlaps, statuses

**Files:**
- Create: `charters-core.js`
- Create: `test/charters-core.test.js`

- [ ] **Step 1: Write the failing tests**

`test/charters-core.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/charters-core.test.js`
Expected: FAIL with `Cannot find module '../charters-core.js'`.

- [ ] **Step 3: Write the module (part 1)**

`charters-core.js`:

```js
// Charter list pure logic, shared by charter-gantt.js / admin.js (browser) and test/charters-core.test.js (node --test).
// The active rule, statuses and overlaps mirror iolanthe-server lib/active-charter.js and share its fixture. No DOM here.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheChartersCore = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MS_DAY = 86400000;
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---- dates ------------------------------------------------------------------------------------------------

  function isValidDate(value) {
    const m = DATE_RE.exec(String(value || ""));
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  }

  // Whole days since 1970-01-01 (UTC), so date maths never meets DST.
  function dayIndex(value) {
    if (!isValidDate(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
  }

  function dateFromIndex(index) {
    return new Date(Math.round(index) * MS_DAY).toISOString().slice(0, 10);
  }

  function addDays(value, days) {
    const i = dayIndex(value);
    return i === null ? "" : dateFromIndex(i + days);
  }

  function todayLocal(now = new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parts(value) {
    const [y, m, d] = value.split("-").map(Number);
    return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  }

  function fmtDate(value) {
    if (!isValidDate(value)) return "No dates";
    const p = parts(value);
    return `${DAY_NAMES[p.dow]} ${p.d} ${MONTH_NAMES[p.m - 1]} ${p.y}`;
  }

  function fmtShort(value) {
    if (!isValidDate(value)) return "";
    const p = parts(value);
    return `${p.d} ${MONTH_NAMES[p.m - 1]} ${p.y}`;
  }

  function fmtRange(start, end) {
    if (!isValidDate(start) || !isValidDate(end)) return "No dates";
    const a = parts(start);
    const b = parts(end);
    if (a.y === b.y) {
      return `${DAY_NAMES[a.dow]} ${a.d} ${MONTH_NAMES[a.m - 1]} – ${DAY_NAMES[b.dow]} ${b.d} ${MONTH_NAMES[b.m - 1]} ${b.y}`;
    }
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  }

  // ---- the active rule (mirror of the server) ---------------------------------------------------------------

  function datesOf(charter) {
    const source = charter && charter.charter && typeof charter.charter === "object" ? charter.charter : (charter || {});
    const start = isValidDate(source.start_date) ? source.start_date : "";
    const end = isValidDate(source.end_date) ? source.end_date : "";
    return start && end && end >= start ? { start, end } : null;
  }

  function nights(charter) {
    const r = datesOf(charter);
    return r ? dayIndex(r.end) - dayIndex(r.start) : null;
  }

  function charterStatus(charter, today) {
    const r = datesOf(charter);
    if (!r) return "no-dates";
    if (today < r.start) return "upcoming";
    return today > r.end ? "ended" : "underway";
  }

  function isInDate(charter, today) {
    const r = datesOf(charter);
    return Boolean(r) && today >= addDays(r.start, -1) && today <= r.end;
  }

  function activeCharterId(charters, storedId, today) {
    const list = Array.isArray(charters) ? charters.filter((c) => c && typeof c.id === "string" && c.id) : [];
    const inDate = list.filter((c) => isInDate(c, today)).sort((a, b) => datesOf(b).start.localeCompare(datesOf(a).start));
    if (inDate.length) return inDate[0].id;
    if (storedId && list.some((c) => c.id === storedId)) return storedId;
    const ended = list.filter((c) => charterStatus(c, today) === "ended").sort((a, b) => datesOf(b).end.localeCompare(datesOf(a).end));
    if (ended.length) return ended[0].id;
    const upcoming = list.filter((c) => charterStatus(c, today) === "upcoming").sort((a, b) => datesOf(a).start.localeCompare(datesOf(b).start));
    if (upcoming.length) return upcoming[0].id;
    const any = list.slice().sort((a, b) => a.id.localeCompare(b.id));
    return any.length ? any[0].id : "";
  }

  function rangesOverlap(a, b) {
    const ra = datesOf(a);
    const rb = datesOf(b);
    return Boolean(ra && rb) && ra.start <= rb.end && rb.start <= ra.end;
  }

  function findOverlaps(candidate, others, selfKind = "charter") {
    return (Array.isArray(others) ? others : [])
      .filter((e) => e && !(candidate && candidate.id && e.kind === selfKind && e.id === candidate.id))
      .filter((e) => rangesOverlap(candidate, e))
      .map((e) => ({ kind: e.kind, id: e.id, name: e.name, start_date: e.start_date, end_date: e.end_date }));
  }

  function overlapMessage(overlaps) {
    const f = overlaps[0];
    return f ? `Overlaps ${f.name} (${f.start_date} – ${f.end_date})` : "";
  }

  // The entries the overlap check compares against: every charter and every reserved period.
  function overlapEntries(charters, periods) {
    const PERIOD_LABELS = { maintenance: "Maintenance", unavailable: "Unavailable", other: "Reserved" };
    return (Array.isArray(charters) ? charters : [])
      .map((c) => ({ kind: "charter", id: c.id, name: c.name || c.id, start_date: (c.charter || {}).start_date, end_date: (c.charter || {}).end_date }))
      .concat((Array.isArray(periods) ? periods : []).map((p) => ({ kind: "period", id: p.id, name: `${PERIOD_LABELS[p.type] || "Reserved"} · ${p.title}`, start_date: p.start_date, end_date: p.end_date })));
  }

  // {tone: active|upcoming|ended|none, text}
  function pillFor(charter, opts) {
    const r = datesOf(charter);
    const isActive = Boolean(opts.activeId) && charter.id === opts.activeId;
    if (!r) return { tone: isActive ? "active" : "none", text: isActive ? "Active · no dates" : "No dates" };
    const status = charterStatus(charter, opts.today);
    let detail;
    if (status === "underway") {
      detail = `day ${dayIndex(opts.today) - dayIndex(r.start) + 1} of ${nights(charter) + 1}`;
    } else if (status === "upcoming") {
      const inDays = dayIndex(r.start) - dayIndex(opts.today);
      detail = inDays === 1 ? "starts tomorrow" : `starts in ${inDays} days`;
    } else {
      detail = `ended ${fmtShort(r.end)}`;
    }
    if (isActive) return { tone: "active", text: `Active · ${detail}` };
    if (status === "upcoming") return { tone: "upcoming", text: `Upcoming · ${detail}` };
    if (status === "ended") return { tone: "ended", text: `Ended · ${fmtShort(r.end)}` };
    return { tone: "upcoming", text: `Underway · ${detail}` };
  }
```

(Leave the file open: Task 2 appends the layout maths and the `return` block.)

- [ ] **Step 4: Temporarily close the module and run the tests**

Append to the file for now:

```js
  return { MS_DAY, isValidDate, dayIndex, dateFromIndex, addDays, todayLocal, fmtDate, fmtShort, fmtRange, datesOf, nights, charterStatus, isInDate, activeCharterId, rangesOverlap, findOverlaps, overlapMessage, overlapEntries, pillFor };
});
```

Run: `node --test test/charters-core.test.js`
Expected: `# pass 18`, `# fail 0` (14 fixture cases + 4).

- [ ] **Step 5: Commit**

```bash
git add charters-core.js test/charters-core.test.js
git commit -m "feat(charters): charters-core with the active rule, overlaps, statuses and pills"
```

---

### Task 2: `charters-core.js` — layout maths for the band

**Files:**
- Modify: `charters-core.js`
- Modify: `test/charters-core.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/charters-core.test.js`:

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/charters-core.test.js`
Expected: 4 new tests FAIL (`core.packRows is not a function`, …).

- [ ] **Step 3: Add the layout maths**

Replace the temporary `return {...}; });` at the end of `charters-core.js` with:

```js
  // ---- band layout ------------------------------------------------------------------------------------------

  // Greedy row packing: bars sorted by start go on the first row whose last bar ended before they start.
  // Bars without usable dates are dropped (the band lists them in its "no dates" pill instead).
  function packRows(bars) {
    const sorted = (Array.isArray(bars) ? bars : []).filter((b) => datesOf(b)).slice()
      .sort((a, b) => datesOf(a).start.localeCompare(datesOf(b).start) || datesOf(a).end.localeCompare(datesOf(b).end));
    const rows = [];
    sorted.forEach((bar) => {
      const row = rows.find((r) => datesOf(r[r.length - 1]).end < datesOf(bar).start);
      if (row) row.push(bar); else rows.push([bar]);
    });
    return rows;
  }

  const ZOOM_DAYS = { quarter: 91, year: 365, "3years": 1095 };
  const ACTIVE_PAD_DAYS = 7;

  // {start, end} for a zoom level. opts: {active: {start_date, end_date}|null, today}.
  function zoomSpan(level, opts) {
    const active = opts.active && datesOf(opts.active) ? datesOf(opts.active) : null;
    if (level === "active" && active) {
      return { start: addDays(active.start, -ACTIVE_PAD_DAYS), end: addDays(active.end, ACTIVE_PAD_DAYS) };
    }
    const days = ZOOM_DAYS[level] || ZOOM_DAYS.quarter;
    const anchor = active ? Math.round((dayIndex(active.start) + dayIndex(active.end)) / 2) : dayIndex(opts.today);
    const start = anchor - Math.floor(days / 2);
    return { start: dateFromIndex(start), end: dateFromIndex(start + days) };
  }

  const RANGE_HALF_DAYS = 548;   // 1.5 years either side of today
  const RANGE_PAD_DAYS = 30;

  function scrollRange(bars, today) {
    let start = dayIndex(today) - RANGE_HALF_DAYS;
    let end = dayIndex(today) + RANGE_HALF_DAYS;
    (Array.isArray(bars) ? bars : []).forEach((bar) => {
      const r = datesOf(bar);
      if (!r) return;
      start = Math.min(start, dayIndex(r.start) - RANGE_PAD_DAYS);
      end = Math.max(end, dayIndex(r.end) + RANGE_PAD_DAYS);
    });
    return { start: dateFromIndex(start), end: dateFromIndex(end) };
  }

  function visibleMonths(start, end) {
    const out = [];
    let cursor = start;
    while (cursor <= end) {
      const p = parts(cursor);
      const lastOfMonth = dateFromIndex(dayIndex(`${p.m === 12 ? p.y + 1 : p.y}-${String(p.m === 12 ? 1 : p.m + 1).padStart(2, "0")}-01`) - 1);
      const monthEnd = lastOfMonth < end ? lastOfMonth : end;
      out.push({ label: `${MONTH_NAMES[p.m - 1]} ${p.y}`, start: cursor, end: monthEnd });
      cursor = addDays(lastOfMonth, 1);
    }
    return out;
  }

  // Every Monday strictly inside (start, end].
  function visibleWeeks(start, end) {
    const out = [];
    const first = dayIndex(start);
    const last = dayIndex(end);
    for (let i = first + 1; i <= last; i += 1) {
      if (new Date(i * MS_DAY).getUTCDay() === 1) out.push(dateFromIndex(i));
    }
    return out;
  }

  return {
    MS_DAY, ZOOM_DAYS, isValidDate, dayIndex, dateFromIndex, addDays, todayLocal, fmtDate, fmtShort, fmtRange,
    datesOf, nights, charterStatus, isInDate, activeCharterId, rangesOverlap, findOverlaps, overlapMessage, overlapEntries, pillFor,
    packRows, zoomSpan, scrollRange, visibleMonths, visibleWeeks
  };
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test`
Expected: `# pass 133`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add charters-core.js test/charters-core.test.js
git commit -m "feat(charters): row packing, zoom spans, scroll range and calendar helpers for the band"
```

---

### Task 3: Shared styles in `admin.css`

**Files:**
- Modify: `admin.css` (append after the `button.admin-icon-button--success:focus` block at ~line 113; the `.charter-info-columns` media rule next to the existing `@media (max-width: 900px)` block)

- [ ] **Step 1: Append the shared classes**

After the `button.success:hover, …admin-icon-button--success:focus { background: #237347; }` block insert:

```css
/* ---- shared Route-page look (spec-charters §9): the first slice of the admin style rollout ---- */
:root {
  --gold: #c9a24a;
  --gold-dark: #a8842f;
  --soft: #eef2f4;
}

button.admin-icon-button--gold {
  background: var(--gold);
  color: var(--ink);
}

button.admin-icon-button--gold:hover,
button.admin-icon-button--gold:focus {
  background: var(--gold-dark);
  color: #fff;
}

.stat-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.6rem;
}

.stat-tile {
  background: var(--soft);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  min-width: 0;
}

.stat-tile b {
  display: block;
  font-size: 1.5rem;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.stat-tile span {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.form-section {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.9rem 1rem;
  background: #fff;
  display: grid;
  gap: 0.7rem;
  align-content: start;
}

.form-section > h3 {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--accent);
}

.form-section .form-grid {
  gap: 0.7rem;
}

.form-section label:not(.inline-check) {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.form-section .field-hint {
  font-size: 0.8rem;
  color: var(--muted);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}

.form-section .field-error,
.modal-overlap-warning {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--danger);
  background: #f7e3e1;
  border-radius: 6px;
  padding: 0.5rem 0.7rem;
}

.form-section .field-error:empty,
.modal-overlap-warning:empty {
  display: none;
}

.status-pill {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  background: var(--soft);
  color: var(--muted);
  white-space: nowrap;
}

.status-pill--active { background: var(--gold); color: var(--ink); }
.status-pill--upcoming { background: #d9e8ea; color: var(--accent-dark); }
.status-pill--ended { background: #e3e7e9; color: var(--muted); }
.status-pill--none { background: #f7e3e1; color: var(--danger); }

.segmented {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}

.segmented button,
.segmented label {
  min-height: 36px;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--muted);
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0 0.75rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.segmented button + button,
.segmented label + label {
  border-left: 1px solid var(--line);
}

.segmented button:hover,
.segmented label:hover {
  background: var(--soft);
  color: var(--ink);
}

.segmented button[aria-pressed="true"],
.segmented label:has(input:checked) {
  background: var(--accent);
  color: #fff;
}

.segmented input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  margin: 0;
}

.card-header .header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.card-header .header-sep {
  width: 1px;
  height: 28px;
  background: var(--line);
  margin: 0 0.15rem;
}

.charter-info-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  align-items: start;
}

.charter-info-columns > div {
  display: grid;
  gap: 0.8rem;
}

.charter-gantt-host:empty {
  display: none;
}
```

Inside the existing `@media (max-width: 900px) {` block add:

```css
  .charter-info-columns {
    grid-template-columns: minmax(0, 1fr);
  }
```

- [ ] **Step 2: Commit**

```bash
git add admin.css
git commit -m "style: shared stat tiles, form sections, status pills, segmented control and gold tone"
```

---

### Task 4: `charter-gantt.js` + `charter-gantt.css` — the band

**Files:**
- Create: `charter-gantt.js`
- Create: `charter-gantt.css`

- [ ] **Step 1: Write the component**

`charter-gantt.js`:

```js
// The charter Gantt band (spec-charters §6). Read-only: drag pans, wheel zooms, click selects / opens.
// mount(host, ctx) → {update(ctx), destroy()}. ctx: {charters, periods, selectedId, activeId, forcedId, today,
// zoom, collapsed, canManage, onSelectCharter(id), onOpenPeriod(id|null), onCreateCharter(), onDeleteCharter(),
// onZoomChange(level), onToggleCollapsed(bool)}.
(function () {
  "use strict";

  const core = window.IolantheChartersCore;
  const ZOOMS = [["active", "Active"], ["quarter", "Quarter"], ["year", "Year"], ["3years", "3 years"]];
  const MIN_PX_PER_DAY = 1.2;      // 3 years on ~1300 px
  const MAX_PX_PER_DAY = 80;       // ~2 weeks on ~1100 px
  const DRAG_THRESHOLD_PX = 4;
  const PERIOD_LABELS = { maintenance: "Maintenance", unavailable: "Unavailable", other: "Reserved" };

  const ICONS = {
    left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
    add: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    reserve: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16M8 3v4M16 3v4M7 13l4 4 6-7"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
    collapse: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'
  };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
    });
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  function iconBtn(kind, label, extra) {
    return el("button", { type: "button", class: `gantt-ib${extra && extra.tone ? ` ${extra.tone}` : ""}`, title: label, "aria-label": label, html: ICONS[kind], disabled: extra && extra.disabled, onclick: extra && extra.onclick });
  }

  function barsOf(ctx) {
    const charters = (ctx.charters || []).map((c) => ({
      kind: "charter", id: c.id, name: c.name || c.id, start_date: (c.charter || {}).start_date, end_date: (c.charter || {}).end_date,
      nights: core.nights(c), guests: Number((c.charter || {}).guest_count) || 0, stops: Number(c.stops) || 0,
      status: core.charterStatus(c, ctx.today)
    }));
    const periods = (ctx.periods || []).map((p) => ({
      kind: "period", id: p.id, type: p.type, name: `${PERIOD_LABELS[p.type] || "Reserved"} · ${p.title}`, title: p.title,
      start_date: p.start_date, end_date: p.end_date, description: p.description || ""
    }));
    return { charters, periods };
  }

  function mount(host, initialCtx) {
    let ctx = initialCtx;
    let pxPerDay = 0;
    let range = { start: "", end: "" };
    let tooltip = null;
    let viewport = null;
    let track = null;
    let root = null;
    let suppressClickUntil = 0;

    function activeBar() {
      return (ctx.charters || []).find((c) => c.id === ctx.activeId) || null;
    }

    // ---- scroll / zoom maths ----
    function xOf(date) { return (core.dayIndex(date) - core.dayIndex(range.start)) * pxPerDay; }
    function dateAtX(x) { return core.dateFromIndex(core.dayIndex(range.start) + Math.floor(x / pxPerDay)); }
    function viewStart() { return dateAtX(viewport.scrollLeft); }
    function viewEnd() { return dateAtX(viewport.scrollLeft + viewport.clientWidth); }

    function applyZoom(level) {
      const span = core.zoomSpan(level, { active: activeBar() ? (activeBar().charter || activeBar()) : null, today: ctx.today });
      const days = core.dayIndex(span.end) - core.dayIndex(span.start);
      setScale(Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, viewport.clientWidth / days)));
      viewport.scrollLeft = xOf(span.start);
      syncTitle();
    }

    function setScale(next) {
      pxPerDay = next;
      drawTrack();
    }

    function centreOn(date) {
      viewport.scrollLeft = xOf(date) - viewport.clientWidth / 2;
      syncTitle();
    }

    function zoomAround(clientX, factor) {
      const rect = viewport.getBoundingClientRect();
      const localX = clientX - rect.left;
      const dayUnder = (viewport.scrollLeft + localX) / pxPerDay;
      const next = Math.max(MIN_PX_PER_DAY, Math.min(MAX_PX_PER_DAY, pxPerDay * factor));
      if (next === pxPerDay) return;
      setScale(next);
      viewport.scrollLeft = dayUnder * pxPerDay - localX;
      syncTitle();
    }

    // ---- drawing ----
    function syncTitle() {
      const t = root.querySelector(".gantt-span");
      if (t && viewport.clientWidth) t.textContent = `${core.fmtShort(viewStart())} – ${core.fmtShort(viewEnd())}`;
    }

    function drawTrack() {
      const { charters, periods } = barsOf(ctx);
      range = core.scrollRange(charters.concat(periods), ctx.today);
      const totalDays = core.dayIndex(range.end) - core.dayIndex(range.start);
      track.style.width = `${Math.round(totalDays * pxPerDay)}px`;
      track.replaceChildren();

      const months = el("div", { class: "gantt-months" });
      core.visibleMonths(range.start, range.end).forEach((m) => {
        const w = (core.dayIndex(m.end) - core.dayIndex(m.start) + 1) * pxPerDay;
        months.appendChild(el("span", { style: `left:${xOf(m.start)}px;width:${w}px`, text: w > 40 ? m.label : "" }));
      });
      track.appendChild(months);

      const weeks = el("div", { class: "gantt-weeks" });
      if (pxPerDay >= 4) {
        core.visibleWeeks(range.start, range.end).forEach((d) => {
          weeks.appendChild(el("span", { style: `left:${xOf(d)}px`, text: pxPerDay >= 9 ? String(Number(d.slice(8))) : "" }));
        });
      }
      track.appendChild(weeks);

      const lanes = el("div", { class: "gantt-lanes" });
      [["charters", charters], ["periods", periods]].forEach(([laneKind, bars]) => {
        const rows = core.packRows(bars);
        if (!rows.length) rows.push([]);
        rows.forEach((row) => {
          const rowEl = el("div", { class: `gantt-row gantt-row--${laneKind}` });
          row.forEach((bar) => rowEl.appendChild(barEl(bar)));
          lanes.appendChild(rowEl);
        });
      });
      track.appendChild(lanes);

      if (ctx.today >= range.start && ctx.today <= range.end) {
        track.appendChild(el("div", { class: "gantt-today", style: `left:${xOf(ctx.today) + pxPerDay / 2}px` }, [el("span", { text: "Today" })]));
      }
    }

    function barEl(bar) {
      const w = (core.dayIndex(bar.end_date) - core.dayIndex(bar.start_date) + 1) * pxPerDay;
      const classes = ["gantt-bar", `gantt-bar--${bar.kind}`];
      if (bar.kind === "charter") {
        if (bar.id === ctx.activeId) classes.push("is-active");
        else if (bar.status === "ended") classes.push("is-ended");
        if (bar.id === ctx.selectedId) classes.push("is-selected");
      } else {
        classes.push(`gantt-bar--${bar.type}`);
      }
      const meta = bar.kind === "charter"
        ? (w > 220 ? `${bar.stops} stops · ${bar.guests} guests` : (w > 140 && bar.nights !== null ? `${bar.nights} nights` : ""))
        : "";
      const node = el("button", {
        type: "button", class: classes.join(" "), style: `left:${xOf(bar.start_date)}px;width:${Math.max(6, w - 2)}px`,
        "aria-pressed": bar.kind === "charter" ? String(bar.id === ctx.selectedId) : undefined,
        "aria-label": `${bar.name}, ${core.fmtRange(bar.start_date, bar.end_date)}`,
        onclick: () => {
          if (Date.now() < suppressClickUntil) return;
          if (bar.kind === "charter") ctx.onSelectCharter(bar.id); else ctx.onOpenPeriod(bar.id);
        },
        onpointerenter: (e) => showTip(bar, e), onpointermove: (e) => moveTip(e), onpointerleave: hideTip,
        onfocus: (e) => showTip(bar, e), onblur: hideTip
      }, [el("span", { class: "gantt-bar-name", text: w > 40 ? bar.name : "" }), meta ? el("small", { text: meta }) : null]);
      return node;
    }

    // ---- tooltip ----
    function showTip(bar, event) {
      hideTip();
      const lines = bar.kind === "charter"
        ? [bar.name, core.fmtRange(bar.start_date, bar.end_date), `${bar.nights} nights · ${bar.guests} guests · ${bar.stops} stops`, bar.id === ctx.activeId ? "Active" : bar.status.replace("-", " ")]
        : [bar.name, core.fmtRange(bar.start_date, bar.end_date), bar.description.split("\n")[0]];
      tooltip = el("div", { class: "gantt-tip", role: "tooltip" }, lines.filter(Boolean).map((t, i) => el("div", { class: i === 0 ? "gantt-tip-title" : "", text: t })));
      document.body.appendChild(tooltip);
      moveTip(event);
    }

    function moveTip(event) {
      if (!tooltip) return;
      const x = (event && event.clientX) || (event && event.target && event.target.getBoundingClientRect().left) || 0;
      const y = (event && event.clientY) || (event && event.target && event.target.getBoundingClientRect().bottom) || 0;
      tooltip.style.left = `${Math.min(x + 12, window.innerWidth - tooltip.offsetWidth - 8)}px`;
      tooltip.style.top = `${y + 14}px`;
    }

    function hideTip() {
      if (tooltip) tooltip.remove();
      tooltip = null;
    }

    // ---- pointer panning ----
    function bindPan() {
      let startX = 0;
      let startScroll = 0;
      let dragging = false;
      viewport.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        startX = e.clientX;
        startScroll = viewport.scrollLeft;
        dragging = false;
        viewport.setPointerCapture(e.pointerId);
      });
      viewport.addEventListener("pointermove", (e) => {
        if (!viewport.hasPointerCapture(e.pointerId)) return;
        const dx = e.clientX - startX;
        if (!dragging && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        viewport.classList.add("is-dragging");
        viewport.scrollLeft = startScroll - dx;
      });
      const end = (e) => {
        if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
        viewport.classList.remove("is-dragging");
        if (dragging) suppressClickUntil = Date.now() + 150;
        dragging = false;
        syncTitle();
      };
      viewport.addEventListener("pointerup", end);
      viewport.addEventListener("pointercancel", end);
      viewport.addEventListener("scroll", syncTitle, { passive: true });
      viewport.addEventListener("wheel", (e) => {
        e.preventDefault();
        zoomAround(e.clientX, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      }, { passive: false });
      root.addEventListener("keydown", (e) => {
        if (e.target.closest("input, select, textarea")) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          viewport.scrollLeft += (e.key === "ArrowLeft" ? -7 : 7) * pxPerDay;
          syncTitle();
        }
      });
    }

    // ---- toolbar / collapsed strip ----
    function toolbar() {
      const zoom = el("div", { class: "segmented gantt-zoom", role: "group", "aria-label": "Zoom" }, ZOOMS.map(([level, label]) =>
        el("button", { type: "button", "aria-pressed": String(ctx.zoom === level), text: label, onclick: () => { ctx.zoom = level; ctx.onZoomChange(level); applyZoom(level); syncZoomButtons(); } })));
      const noDates = (ctx.charters || []).filter((c) => !core.datesOf(c));
      const noDatesPill = noDates.length ? el("div", { class: "gantt-nodates" }, [
        el("select", { "aria-label": "Charters without dates", onchange: (e) => { if (e.target.value) ctx.onSelectCharter(e.target.value); e.target.value = ""; } },
          [el("option", { value: "", text: `${noDates.length} without dates…` })].concat(noDates.map((c) => el("option", { value: c.id, text: c.name || c.id }))))
      ]) : null;
      return el("div", { class: "gantt-toolbar" }, [
        el("div", { class: "gantt-title" }, [el("strong", { text: "Charters" }), el("span", { class: "gantt-span" })]),
        iconBtn("left", "Scroll left", { onclick: () => { viewport.scrollLeft -= viewport.clientWidth / 4; syncTitle(); } }),
        iconBtn("right", "Scroll right", { onclick: () => { viewport.scrollLeft += viewport.clientWidth / 4; syncTitle(); } }),
        iconBtn("today", "Jump to today", { onclick: () => centreOn(ctx.today) }),
        el("span", { class: "gantt-sep" }),
        zoom,
        noDatesPill,
        el("span", { class: "gantt-sep" }),
        iconBtn("add", "New charter", { disabled: !ctx.canManage, onclick: () => ctx.onCreateCharter() }),
        iconBtn("reserve", "Reserved period", { disabled: !ctx.canManage, onclick: () => ctx.onOpenPeriod(null) }),
        iconBtn("trash", "Delete charter", { tone: "danger", disabled: !ctx.canManage || !ctx.selectedId || (ctx.charters || []).length < 2, onclick: () => ctx.onDeleteCharter() }),
        el("span", { class: "gantt-sep" }),
        iconBtn("collapse", "Collapse", { onclick: () => { ctx.collapsed = true; ctx.onToggleCollapsed(true); render(); } })
      ]);
    }

    function syncZoomButtons() {
      root.querySelectorAll(".gantt-zoom button").forEach((b, i) => b.setAttribute("aria-pressed", String(ZOOMS[i][0] === ctx.zoom)));
    }

    function strip() {
      const sel = (ctx.charters || []).find((c) => c.id === ctx.selectedId);
      const pill = sel ? core.pillFor(sel, { activeId: ctx.activeId, today: ctx.today }) : { tone: "none", text: "No charter" };
      const dates = sel ? core.fmtRange((sel.charter || {}).start_date, (sel.charter || {}).end_date) : "";
      const n = sel ? core.nights(sel) : null;
      return el("div", { class: "gantt-strip" }, [
        el("strong", { text: sel ? (sel.name || sel.id) : "Charters" }),
        el("span", { class: "gantt-strip-dates", text: dates + (n !== null ? ` · ${n} nights` : "") }),
        el("span", { class: `status-pill status-pill--${pill.tone}`, text: pill.text }),
        el("span", { class: "gantt-strip-grow" }),
        iconBtn("expand", "Expand", { onclick: () => { ctx.collapsed = false; ctx.onToggleCollapsed(false); render(); } })
      ]);
    }

    function render() {
      hideTip();
      host.replaceChildren();
      root = el("section", { class: `charter-gantt${ctx.collapsed ? " is-collapsed" : ""}`, tabindex: "0", "aria-label": "Charter timeline" });
      host.appendChild(root);
      if (ctx.collapsed) {
        root.appendChild(strip());
        return;
      }
      root.appendChild(toolbar());
      viewport = el("div", { class: "gantt-viewport" });
      track = el("div", { class: "gantt-track" });
      viewport.appendChild(track);
      root.appendChild(viewport);
      if (!(ctx.charters || []).length) {
        root.appendChild(el("p", { class: "gantt-empty", text: "Use + to create your first charter." }));
      }
      bindPan();
      // Width is only known once laid out.
      requestAnimationFrame(() => { if (viewport.isConnected) applyZoom(ctx.zoom); });
    }

    render();
    const onResize = () => { if (!ctx.collapsed && viewport && viewport.isConnected) { drawTrack(); syncTitle(); } };
    window.addEventListener("resize", onResize);

    return {
      update(next) {
        const keepScroll = viewport && viewport.isConnected && !ctx.collapsed && !next.collapsed ? viewport.scrollLeft : null;
        ctx = next;
        render();
        if (keepScroll !== null) requestAnimationFrame(() => { if (viewport.isConnected) { setScale(pxPerDay); viewport.scrollLeft = keepScroll; syncTitle(); } });
      },
      destroy() {
        hideTip();
        window.removeEventListener("resize", onResize);
        host.replaceChildren();
      }
    };
  }

  window.IolantheCharterGantt = Object.freeze({ mount });
})();
```

- [ ] **Step 2: Write the styles**

`charter-gantt.css`:

```css
/* The charter Gantt band (spec-charters §6). Scoped under .charter-gantt. */
.charter-gantt {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.6rem 0.8rem;
  box-shadow: var(--shadow);
  outline: none;
}

.charter-gantt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.charter-gantt .gantt-toolbar { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.charter-gantt .gantt-title { flex: 1; min-width: 160px; display: flex; align-items: baseline; gap: 0.6rem; }
.charter-gantt .gantt-title strong { font-size: 1rem; }
.charter-gantt .gantt-span { font-size: 0.8rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.charter-gantt .gantt-sep { width: 1px; height: 26px; background: var(--line); margin: 0 0.15rem; }

.charter-gantt .gantt-ib {
  width: 36px; height: 36px; min-height: 0; padding: 0; border: 0; border-radius: 6px;
  display: inline-grid; place-items: center; background: #e8eef0; color: var(--ink); cursor: pointer;
}
.charter-gantt .gantt-ib:hover, .charter-gantt .gantt-ib:focus { background: #d8e2e5; }
.charter-gantt .gantt-ib.danger { background: var(--danger); color: #fff; }
.charter-gantt .gantt-ib.danger:hover, .charter-gantt .gantt-ib.danger:focus { background: #8a312b; }
.charter-gantt .gantt-ib:disabled { opacity: 0.35; cursor: not-allowed; }
.charter-gantt .gantt-ib svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.charter-gantt .gantt-nodates select { min-height: 36px; font-size: 0.8rem; padding: 0 0.5rem; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--muted); }

.charter-gantt .gantt-viewport {
  position: relative; overflow-x: auto; overflow-y: hidden; border: 1px solid var(--line); border-radius: 8px;
  background: #f8fafb; cursor: grab; user-select: none; -webkit-user-select: none; touch-action: pan-y;
  scrollbar-width: thin;
}
.charter-gantt .gantt-viewport.is-dragging { cursor: grabbing; }
.charter-gantt .gantt-track { position: relative; height: 128px; min-width: 100%; }

.charter-gantt .gantt-months { position: absolute; top: 0; left: 0; right: 0; height: 22px; background: #e9eef0; border-bottom: 1px solid var(--line); }
.charter-gantt .gantt-months span {
  position: absolute; top: 0; height: 22px; line-height: 22px; padding: 0 6px; box-sizing: border-box; overflow: hidden; white-space: nowrap;
  border-right: 1px solid var(--line); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted);
}
.charter-gantt .gantt-weeks { position: absolute; top: 22px; left: 0; right: 0; height: 16px; border-bottom: 1px solid #e3e8eb; }
.charter-gantt .gantt-weeks span { position: absolute; top: 0; height: 16px; line-height: 16px; padding-left: 3px; font-size: 0.62rem; color: #8a959b; border-left: 1px dashed #dde3e6; }

.charter-gantt .gantt-lanes { position: absolute; top: 44px; left: 0; right: 0; bottom: 0; padding-top: 6px; }
.charter-gantt .gantt-row { position: relative; height: 26px; margin-bottom: 6px; }
.charter-gantt .gantt-row--periods { height: 22px; }

.charter-gantt .gantt-bar {
  position: absolute; top: 0; height: 26px; min-height: 0; margin: 0 1px; padding: 0 8px; border: 0; border-radius: 6px;
  background: var(--accent); color: #fff; font-size: 0.74rem; font-weight: 700; line-height: 26px; text-align: left;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}
.charter-gantt .gantt-bar small { font-weight: 400; opacity: 0.85; margin-left: 6px; }
.charter-gantt .gantt-bar:hover, .charter-gantt .gantt-bar:focus { filter: brightness(1.08); }
.charter-gantt .gantt-bar:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
.charter-gantt .gantt-bar.is-ended { background: #9aa7ad; }
.charter-gantt .gantt-bar.is-active { background: var(--gold); color: var(--ink); }
.charter-gantt .gantt-bar.is-selected { box-shadow: 0 0 0 3px var(--ink); }
.charter-gantt .gantt-bar--period { height: 22px; line-height: 22px; color: var(--ink); box-shadow: none; }
.charter-gantt .gantt-bar--maintenance { background: repeating-linear-gradient(45deg, #b9c2c7, #b9c2c7 5px, #dfe5e8 5px, #dfe5e8 10px); }
.charter-gantt .gantt-bar--unavailable { background: repeating-linear-gradient(45deg, #d9b7b4, #d9b7b4 5px, #f0dcda 5px, #f0dcda 10px); }
.charter-gantt .gantt-bar--other { background: repeating-linear-gradient(45deg, #c8c4d6, #c8c4d6 5px, #e6e3ee 5px, #e6e3ee 10px); }

.charter-gantt .gantt-today { position: absolute; top: 22px; bottom: 0; width: 2px; background: var(--danger); pointer-events: none; }
.charter-gantt .gantt-today span { position: absolute; top: 0; left: 4px; font-size: 0.62rem; font-weight: 700; color: var(--danger); }

.charter-gantt .gantt-empty { margin: 0.5rem 0 0; color: var(--muted); font-size: 0.9rem; }

.charter-gantt.is-collapsed { padding: 0.45rem 0.8rem; }
.charter-gantt .gantt-strip { display: flex; align-items: center; gap: 0.7rem; flex-wrap: wrap; }
.charter-gantt .gantt-strip strong { font-size: 1rem; }
.charter-gantt .gantt-strip-dates { font-size: 0.85rem; color: var(--muted); }
.charter-gantt .gantt-strip-grow { flex: 1; }

.gantt-tip {
  position: fixed; z-index: 500; max-width: 320px; padding: 0.45rem 0.6rem; border-radius: 6px; background: var(--ink); color: #fff;
  font-size: 0.78rem; line-height: 1.4; pointer-events: none; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
}
.gantt-tip-title { font-weight: 700; }

@media (max-width: 700px) {
  .charter-gantt .gantt-title { flex-basis: 100%; }
  .charter-gantt .gantt-span { display: none; }
}
```

- [ ] **Step 3: Parse check and commit**

Run: `node -e "new Function(require('fs').readFileSync('charter-gantt.js','utf8'))"` → no output (parses).

```bash
git add charter-gantt.js charter-gantt.css
git commit -m "feat(charters): the Gantt band component (toolbar, chart, pan, wheel zoom, keys, tooltip, strip)"
```

---

### Task 5: `admin.js` — state, bootstrap, the band host and wiring; Charter toolbar removed

**Files:**
- Modify: `admin.js` (`state`, `loadBootstrap`, `sectionToolbarHtml`, `sectionShell`, `bindSectionToolbar`, `renderCharter`, `setActiveCharter`; new `mountCharterGantt`, `loadReservedPeriods`)
- Modify: `index.html`

- [ ] **Step 1: index.html**

Add after the `stop-cards.css` link:
```html
  <link rel="stylesheet" href="/admin/charter-gantt.css?v=admin-charters-1">
```
Add before the `admin.js` script tag:
```html
  <script src="/admin/charters-core.js?v=admin-charters-1" defer></script>
  <script src="/admin/charter-gantt.js?v=admin-charters-1" defer></script>
```
(`admin.js` runs `loadBootstrap()` at the end of its IIFE, which is async, so the two scripts above are defined before any render; keeping them first makes that obvious.) Then replace every `admin-itin-a2c` with `admin-charters-1`:

```bash
sed -i 's/admin-itin-a2c/admin-charters-1/g' index.html
grep -c "admin-charters-1" index.html
```
Expected: 18.

- [ ] **Step 2: State and bootstrap**

In the `state` object add after `activeCharter: "",`:

```js
    storedActiveCharter: "",
    forcedCharter: "",
    serverToday: "",
    reservedPeriods: { revision: 0, periods: [] },
    ganttZoom: "active",
    gantt: null,
```

In `loadBootstrap`, after `state.activeCharter = data.active_charter || "";` add:

```js
      state.storedActiveCharter = data.stored_active_charter || "";
      state.forcedCharter = data.forced_charter || "";
      state.serverToday = data.today || "";
```

Add, after `syncSelectedCharter()`'s definition:

```js
  const GANTT_COLLAPSED_KEY = "iolanthe-admin.gantt.collapsed";

  function ganttCollapsedDefault() {
    try {
      const stored = window.localStorage.getItem(GANTT_COLLAPSED_KEY);
      if (stored === "true" || stored === "false") {
        return stored === "true";
      }
    } catch (error) {
      // localStorage unavailable: fall through to the panel default.
    }
    return state.sectionPanels.charter === "routes";
  }

  function rememberGanttCollapsed(collapsed) {
    try {
      window.localStorage.setItem(GANTT_COLLAPSED_KEY, collapsed ? "true" : "false");
    } catch (error) {
      // ignore
    }
  }

  async function loadReservedPeriods() {
    try {
      const data = await api("/api/admin/reserved-periods");
      state.reservedPeriods = {
        revision: Number.isInteger(data && data.revision) ? data.revision : 0,
        periods: Array.isArray(data && data.periods) ? data.periods : []
      };
    } catch (error) {
      setStatus(error.message, "error");
    }
    return state.reservedPeriods;
  }

  function ganttContext() {
    return {
      charters: state.charters,
      periods: state.reservedPeriods.periods,
      selectedId: state.selectedCharter,
      activeId: state.activeCharter,
      forcedId: state.forcedCharter,
      today: window.IolantheChartersCore.todayLocal(),
      zoom: state.ganttZoom,
      collapsed: ganttCollapsedDefault(),
      canManage: canManageCharterAdmin(),
      onSelectCharter: async charterId => {
        if (charterId === state.selectedCharter || !state.charters.some(charter => charter.id === charterId)) {
          return;
        }
        if (!await confirmDiscardPageChanges()) {
          return;
        }
        state.selectedCharter = charterId;
        state.bundle = null;
        renderCharter();
      },
      onOpenPeriod: periodId => openReservedPeriodModal(periodId),
      onCreateCharter: openCreateCharterModal,
      onDeleteCharter: openDeleteCharterModal,
      onZoomChange: level => { state.ganttZoom = level; },
      onToggleCollapsed: rememberGanttCollapsed
    };
  }

  // Mounts (or refreshes) the band in the Charter section's host. Safe to call after every workspace render.
  function mountCharterGantt() {
    const host = document.getElementById("charter-gantt-host");
    if (!host || !window.IolantheCharterGantt) {
      state.gantt = null;
      return;
    }
    if (state.gantt && state.gantt.host === host) {
      state.gantt.handle.update(ganttContext());
      return;
    }
    state.gantt = { host, handle: window.IolantheCharterGantt.mount(host, ganttContext()) };
  }

  function refreshCharterGantt() {
    if (state.gantt && document.getElementById("charter-gantt-host") === state.gantt.host) {
      state.gantt.handle.update(ganttContext());
    }
  }
```

- [ ] **Step 3: The shell renders a host; the Charter toolbar goes**

In `sectionShell`, change `<div class="section-content">${toolbarHtml || ""}${contentHtml}</div>` to:

```js
        <div class="section-content">${section === "charter" ? `<div id="charter-gantt-host" class="charter-gantt-host"></div>` : ""}${toolbarHtml || ""}${contentHtml}</div>
```

In `sectionToolbarHtml`, add as the first line of the body:

```js
    if (section === "charter") {
      return "";
    }
```
and delete the now-dead `showCharterSelector` / `showCharterActions` / `charterActions` logic (keep the select for galley / hotel: the function reduces to the `selectId`, `hasCharters` and the returned `<div class="section-toolbar">…<select>…</div>`).

In `bindSectionToolbar`, delete the whole `if (section === "charter") { … }` block (set-active, create, delete buttons).

- [ ] **Step 4: renderCharter mounts the band after every paint**

Rewrite `renderCharter` so each `els.workspace.innerHTML = …` goes through one helper:

```js
  async function renderCharter() {
    const panels = [
      { id: "info", label: "Charter Info" },
      { id: "crew", label: "Crew" },
      { id: "routes", label: "Route" },
      { id: "sites", label: "Site Editor" }
    ];
    const activePanel = panels.some(panel => panel.id === state.sectionPanels.charter) ? state.sectionPanels.charter : "info";
    state.sectionPanels.charter = activePanel;
    const paint = contentHtml => {
      state.gantt = null;
      els.workspace.innerHTML = sectionShell("charter", panels, activePanel, contentHtml, "");
      bindSectionNav("charter", renderCharter);
      mountCharterGantt();
    };
    paint(`<section class="card"><p class="muted">Loading charter data...</p></section>`);
    const selectedCharter = syncSelectedCharter();
    if (!selectedCharter) {
      paint(`
        <section class="card full">
          <div class="card-header"><h2>No Charters</h2></div>
          <p class="muted">Use the + button in the timeline above to create your first charter.</p>
        </section>
      `);
      return;
    }
    try {
      const [bundle, siteLibrary] = await Promise.all([
        loadCharter(selectedCharter),
        loadSites(),
        loadReservedPeriods()
      ]);
      const charterInfo = normalizeCharterInfo(bundle["charter.json"]);
      const itinerary = bundle["itinerary.json"] || {};
      state.charterContext = { charterId: state.selectedCharter, charter: charterInfo, itinerary, siteLibrary };
      const guestList = normalizeGuestList(bundle["guest_list.json"]);
      const crewList = normalizeCrewEditorList(bundle["crew_list.json"]);
      const content = charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary);
      paint(content);
      bindCharterPanel(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary);
    } catch (error) {
      setStatus(error.message, "error");
      paint(`
        <section class="card full">
          <div class="card-header"><h2>Charter</h2></div>
          <p class="muted">${escapeHtml(error.message)}</p>
        </section>
      `);
    }
  }
```

(`loadReservedPeriods` resolves to the state object; the destructuring ignores it.)

- [ ] **Step 5: Make active uses the server's answer**

Replace `setActiveCharter`, and delete `activeCharterDateStatus` and `confirmActiveCharterDateStatus` (now unused; check with `grep -n "activeCharterDateStatus\|confirmActiveCharterDateStatus" admin.js` → only the definitions):

```js
  async function setActiveCharter(charterId) {
    if (!canChangeActiveCharter()) {
      setStatus("Only Charter Admin on Bridge can change the active charter.", "error");
      return false;
    }
    const charter = state.charters.find(candidate => candidate.id === charterId);
    if (!charterId || !charter) {
      setStatus("Unknown charter.", "error");
      return false;
    }
    if (!await showAdminConfirm({
      title: "Make Active",
      message: `Make ${charter.name || charterId} the active charter? Guest tablets will show it.`,
      confirmLabel: "Make active",
      cancelLabel: "Cancel",
      tone: "normal"
    })) {
      return false;
    }
    try {
      const result = await api("/api/admin/active-charter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charter_id: charterId })
      });
      state.activeCharter = result.active_charter;
      state.storedActiveCharter = result.active_charter;
      syncTopbar();
      refreshCharterGantt();
      setStatus("Active charter updated.", "ok");
      return true;
    } catch (error) {
      setStatus(error.message, "error");
      return false;
    }
  }
```

- [ ] **Step 6: Smoke test in the browser**

Start the scratch server (`preview_start` name `iolanthe-server-scratch`, or the PowerShell line in the server plan), open `http://localhost:8000/admin/?key=hotel`, log in as Charter Admin. Expected: the band shows above Charter Info with bars for Csaba and Larry, Csaba gold (stored active) and outlined (selected); the "Select Charter" dropdown is gone from the Charter section; clicking Larry's bar renders Larry's Info; Route panel shows the collapsed strip; the console has no errors. Galley still shows its dropdown. (The Info page is still the old form until Task 6; the + / reserve / delete buttons open the old dialogs or do nothing until Task 7.)

- [ ] **Step 7: Commit**

```bash
git add admin.js index.html
git commit -m "feat(charters): Gantt band as the Charter section's selector; toolbar dropdown and buttons removed; Make active via the server rule"
```

---

### Task 6: Charter Info page (layout B, pill, tiles, overlap check, unsaved guard)

**Files:**
- Modify: `admin.js` (`renderCharterInfoPanel`, `bindCharterInfoPanel`, `fillCharterInfoForm` stays; delete `charterDayCountTitle`; `iconButtonTone`, `buttonIconSvg` gain `star`)

- [ ] **Step 1: The star icon**

In `buttonIconSvg`, before `if (kind === "cancel") {` add:

```js
    if (kind === "star") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
        </svg>
      `;
    }
```

In `iconButtonTone`, before the `if (kind === "purchase" || …` line add:

```js
    if (kind === "star") {
      return "gold";
    }
```

- [ ] **Step 2: Render**

Replace `renderCharterInfoPanel` with:

```js
  function charterInfoField(id, label, inputHtml, extra) {
    return `<label${extra && extra.full ? ` class="full"` : ""}>${escapeHtml(label)}${inputHtml}${extra && extra.hint ? `<span class="field-hint" id="${id}-hint">${escapeHtml(extra.hint)}</span>` : ""}</label>`;
  }

  function renderCharterInfoPanel(charterInfo) {
    const core = window.IolantheChartersCore;
    const summary = currentCharterSummary() || { id: state.selectedCharter, charter: charterInfo };
    const pill = core.pillFor({ id: summary.id, charter: charterInfo }, { activeId: state.activeCharter, today: core.todayLocal() });
    const nights = core.nights(charterInfo);
    const forced = state.forcedCharter && state.forcedCharter !== summary.id
      ? state.charters.find(charter => charter.id === state.forcedCharter)
      : null;
    const makeActiveDisabled = !canChangeActiveCharter() || summary.id === state.activeCharter || Boolean(state.forcedCharter);
    const makeActiveTitle = summary.id === state.activeCharter
      ? "This is the active charter"
      : (state.forcedCharter
        ? `${forced ? (forced.name || forced.id) : "A charter"} is in date and stays active until ${forced && forced.charter ? core.fmtShort(forced.charter.end_date) : "it ends"}`
        : "Make active");
    return `
      <section class="card full charter-info-panel">
        <div class="card-header">
          <h2 id="charter-info-title">${escapeHtml(charterInfo.name || summary.name || summary.id)}</h2>
          <div class="header-actions">
            <span class="status-pill status-pill--${pill.tone}" id="charter-info-pill">${escapeHtml(pill.text)}</span>
            ${iconButtonHtml("star", makeActiveTitle, ` id="charter-make-active"${makeActiveDisabled ? " disabled" : ""}`)}
            <span class="header-sep"></span>
            ${iconSubmitButtonHtml("save", "Save Charter Information", ` form="charter-info-form" id="charter-info-save"`)}
            ${iconButtonHtml("cancel", "Cancel changes", ` id="cancel-charter-info"`)}
          </div>
        </div>
        <div class="stat-tiles">
          <div class="stat-tile"><b id="charter-tile-nights">${nights === null ? "–" : nights}</b><span>Nights</span></div>
          <div class="stat-tile"><b id="charter-tile-guests">${escapeHtml(String(normalizeGuestCount(charterInfo.guest_count)))}</b><span>Guests</span></div>
          <div class="stat-tile"><b>${escapeHtml(String(Number(summary.stops) || 0))}</b><span>Stops</span></div>
          <div class="stat-tile"><b id="charter-tile-divers">${escapeHtml(String(normalizeNonNegativeInteger(charterInfo.diving_guest_count)))}</b><span>Divers</span></div>
        </div>
        <form id="charter-info-form" class="charter-info-columns">
          <div>
            <section class="form-section">
              <h3>Charter</h3>
              <div class="form-grid">
                ${charterInfoField("charter-info-name", "Name", `<input id="charter-info-name" value="${escapeAttribute(charterInfo.name || "")}" required>`)}
                ${charterInfoField("charter-info-charter-style", "Style", `<input id="charter-info-charter-style" value="${escapeAttribute(charterInfo.charter_style || "flexible")}">`)}
                ${charterInfoField("charter-info-start-date", "Start date", `<input id="charter-info-start-date" type="date" value="${escapeAttribute(charterInfo.start_date || "")}">`)}
                ${charterInfoField("charter-info-end-date", "End date", `<input id="charter-info-end-date" type="date" value="${escapeAttribute(charterInfo.end_date || "")}">`)}
                <p class="field-error full" id="charter-info-overlap" role="alert"></p>
                ${charterInfoField("charter-info-guest-count", "Guests", `<input id="charter-info-guest-count" type="number" min="1" step="1" value="${escapeAttribute(normalizeGuestCount(charterInfo.guest_count))}">`)}
                ${charterInfoField("charter-info-diving-guest-count", "Diving guests", `<input id="charter-info-diving-guest-count" type="number" min="0" step="1" value="${escapeAttribute(normalizeNonNegativeInteger(charterInfo.diving_guest_count))}">`)}
              </div>
            </section>
            <section class="form-section">
              <h3>Arrival</h3>
              <div class="form-grid">
                ${charterInfoField("charter-info-arrival-date", "Date", `<input id="charter-info-arrival-date" type="date" value="${escapeAttribute(charterInfo.arrival?.date || "")}">`)}
                ${charterInfoField("charter-info-arrival-time", "Time", `<input id="charter-info-arrival-time" type="time" value="${escapeAttribute(charterInfo.arrival?.time || "")}">`)}
                ${charterInfoField("charter-info-arrival-flight", "Flight", `<input id="charter-info-arrival-flight" value="${escapeAttribute(charterInfo.arrival?.flight || "")}">`, { full: true })}
              </div>
            </section>
            <section class="form-section">
              <h3>Primary contact</h3>
              <div class="form-grid">
                ${charterInfoField("charter-info-primary-contact-name", "Name", `<input id="charter-info-primary-contact-name" value="${escapeAttribute(charterInfo.primary_contact?.name || "")}">`)}
                ${charterInfoField("charter-info-primary-contact-phones", "Phones", `<textarea id="charter-info-primary-contact-phones" placeholder="One phone number per line">${escapeHtml(charterPhoneListText(charterInfo.primary_contact?.phones || []))}</textarea>`)}
              </div>
            </section>
          </div>
          <div>
            <section class="form-section">
              <h3>Preferences &amp; flags</h3>
              <div class="form-grid">
                <label class="inline-check"><input id="charter-info-non-swimmers-present" type="checkbox" ${charterInfo.non_swimmers_present ? "checked" : ""}> Non-swimmers present</label>
                <label class="inline-check"><input id="charter-info-diving-planned" type="checkbox" ${charterInfo.diving_planned ? "checked" : ""}> Diving planned</label>
                <label class="inline-check"><input id="charter-info-medical-notes-present" type="checkbox" ${charterInfo.medical_notes_present ? "checked" : ""}> Medical notes present</label>
                <label class="inline-check"><input id="charter-info-dietary-restrictions-present" type="checkbox" ${charterInfo.dietary_restrictions_present ? "checked" : ""}> Dietary restrictions present</label>
                ${charterInfoField("charter-info-charter-preference-notes", "Charter preferences", `<textarea id="charter-info-charter-preference-notes">${escapeHtml(charterInfo.charter_preference_notes || "")}</textarea>`, { full: true })}
                ${charterInfoField("charter-info-drink-preferences-notes", "Drink preferences", `<textarea id="charter-info-drink-preferences-notes">${escapeHtml(charterInfo.drink_preferences_notes || "")}</textarea>`, { full: true })}
              </div>
            </section>
            <section class="form-section">
              <h3>Notes</h3>
              <div class="form-grid">
                ${charterInfoField("charter-info-notes", "Charter notes", `<textarea id="charter-info-notes" rows="8">${escapeHtml(charterInfo.notes || "")}</textarea>`, { full: true })}
              </div>
            </section>
          </div>
        </form>
      </section>
    `;
  }
```

Delete `charterDayCountTitle` (grep: only its definition remains).

- [ ] **Step 3: Bind, with the overlap check and the unsaved guard**

Replace `bindCharterInfoPanel` with:

```js
  function readCharterInfoForm(charterInfo) {
    const value = id => document.getElementById(id).value;
    const checked = id => document.getElementById(id).checked;
    return {
      ...charterInfo,
      name: value("charter-info-name").trim(),
      start_date: value("charter-info-start-date"),
      end_date: value("charter-info-end-date"),
      arrival: { date: value("charter-info-arrival-date"), time: value("charter-info-arrival-time"), flight: value("charter-info-arrival-flight").trim() },
      primary_contact: { name: value("charter-info-primary-contact-name").trim(), phones: normalizeCharterPhoneList(value("charter-info-primary-contact-phones")) },
      charter_style: value("charter-info-charter-style").trim() || "flexible",
      non_swimmers_present: checked("charter-info-non-swimmers-present"),
      diving_planned: checked("charter-info-diving-planned"),
      diving_guest_count: normalizeNonNegativeInteger(value("charter-info-diving-guest-count")),
      medical_notes_present: checked("charter-info-medical-notes-present"),
      dietary_restrictions_present: checked("charter-info-dietary-restrictions-present"),
      charter_preference_notes: value("charter-info-charter-preference-notes"),
      drink_preferences_notes: value("charter-info-drink-preferences-notes"),
      notes: value("charter-info-notes"),
      guest_count: normalizeGuestCount(value("charter-info-guest-count"))
    };
  }

  // Spec-charters §4: the live overlap check. Returns the message ("" when clear) and toggles Save.
  function syncCharterInfoOverlap() {
    const core = window.IolantheChartersCore;
    const warning = document.getElementById("charter-info-overlap");
    const save = document.getElementById("charter-info-save");
    if (!warning) {
      return "";
    }
    const candidate = { id: state.selectedCharter, start_date: document.getElementById("charter-info-start-date").value, end_date: document.getElementById("charter-info-end-date").value };
    const clashes = core.findOverlaps(candidate, core.overlapEntries(state.charters, state.reservedPeriods.periods), "charter");
    const message = clashes.length ? `${core.overlapMessage(clashes)}. Choose other dates.` : "";
    warning.textContent = message;
    if (save) {
      save.disabled = Boolean(message);
    }
    return message;
  }

  function bindCharterInfoPanel(charterInfo) {
    const form = document.getElementById("charter-info-form");
    if (!form) {
      return;
    }
    const core = window.IolantheChartersCore;
    let savedCharterInfo = cloneCharterInfo(charterInfo);
    const syncTiles = () => {
      const draft = readCharterInfoForm(charterInfo);
      const nights = core.nights(draft);
      document.getElementById("charter-tile-nights").textContent = nights === null ? "–" : String(nights);
      document.getElementById("charter-tile-guests").textContent = String(draft.guest_count);
      document.getElementById("charter-tile-divers").textContent = String(draft.diving_guest_count);
      document.getElementById("charter-info-title").textContent = draft.name || savedCharterInfo.name || state.selectedCharter;
    };
    ["charter-info-start-date", "charter-info-end-date"].forEach(id => {
      document.getElementById(id).addEventListener("input", syncCharterInfoOverlap);
    });
    form.addEventListener("input", syncTiles);
    syncCharterInfoOverlap();

    bindSettingsFormController({
      formId: "charter-info-form",
      cancelButtonId: "cancel-charter-info",
      readState: () => readCharterInfoForm(charterInfo),
      save: async () => {
        if (syncCharterInfoOverlap()) {
          throw new Error("These dates overlap another charter or a reserved period.");
        }
        Object.assign(charterInfo, readCharterInfoForm(charterInfo));
        // Not saveCharterFile(): its catch would swallow the server's message, and the controller needs the throw to keep the form dirty.
        const payload = await api(`/api/admin/charter/${encodeURIComponent(state.selectedCharter)}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: "charter.json", data: charterInfo })
        });
        const saved = payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
        if (state.bundle) {
          state.bundle["charter.json"] = cloneData(saved);
        }
        setStatus("Charter info saved.", "ok");
        const normalizedSaved = normalizeCharterInfo(saved);
        Object.assign(charterInfo, normalizedSaved);
        const summary = currentCharterSummary();
        if (summary) {
          summary.name = normalizedSaved.name || summary.id;
          summary.charter = cloneCharterInfo(normalizedSaved);
          summary.nights = core.nights(normalizedSaved);
          summary.status = core.charterStatus(normalizedSaved, core.todayLocal());
        }
        savedCharterInfo = cloneCharterInfo(normalizedSaved);
        syncTopbar();
      },
      reload: async () => {
        await renderCharter();
      }
    });

    const makeActive = document.getElementById("charter-make-active");
    if (makeActive) {
      makeActive.addEventListener("click", async () => {
        if (!await confirmDiscardPageChanges()) {
          return;
        }
        if (await setActiveCharter(state.selectedCharter)) {
          renderCharter();
        }
      });
    }
  }
```

Note: `bindSettingsFormController` shows a thrown error's message in the status line and keeps the form dirty, so a server refusal (an overlap the admin missed comes back as 400 "Overlaps …") is shown as-is. The Cancel button's confirm comes from `bindSettingsFormController`. `fillCharterInfoForm` is no longer called by this panel; delete it if `grep -n fillCharterInfoForm admin.js` shows only the definition.

- [ ] **Step 4: Browser check**

Reload the admin. Expected on Charter Info: header with the name, pill ("Active · starts in 24 days" for Csaba on 2026-10-08), ★ disabled with the tooltip "This is the active charter", ✓ ✕; four tiles; two columns of sections, one column below 900 px (use `resize_window` width 800). Type an end date of 2026-12-02 for Csaba → the red warning "Overlaps Larry (2026-12-01 – 2026-12-04). Choose other dates." appears and ✓ is disabled; restore the date → warning gone. Edit the name, click Larry's bar → the "Unsaved changes" dialog appears; Cancel keeps the page. Save a change → status "Charter info saved.", the band's bar label updates. On Larry's page the ★ is enabled; click → confirm → Larry turns gold on the band and the top bar reads Larry.

- [ ] **Step 5: Commit**

```bash
git add admin.js
git commit -m "feat(charters): Charter Info in the Route-page style with status pill, stat tiles, Make active, overlap check and unsaved guard"
```

---

### Task 7: New charter dialog and the Reserved period card

**Files:**
- Modify: `admin.js` (`openCreateCharterModal`, `createCharter`; new `openReservedPeriodModal`, `saveReservedPeriods`)

- [ ] **Step 1: New charter**

Replace `openCreateCharterModal` and `createCharter` with:

```js
  function openCreateCharterModal() {
    if (!canManageCharterAdmin()) {
      setStatus("Only Charter Admin on Bridge can create charters.", "error");
      return;
    }
    const core = window.IolantheChartersCore;
    const sources = state.charters.slice().sort((a, b) => String((b.charter || {}).start_date || "").localeCompare(String((a.charter || {}).start_date || "")));
    const modal = openDialogModal("New charter", `
      <form id="create-charter-form" class="form-section">
        <div class="form-grid">
          <label class="full">Charter name
            <input id="new-charter-name" required placeholder="Display name" data-autofocus>
            <span class="field-hint">Folder id: <code id="new-charter-id">—</code></span>
          </label>
          <label>Start date
            <input id="new-charter-start-date" type="date">
          </label>
          <label>End date
            <input id="new-charter-end-date" type="date">
            <span class="field-hint" id="new-charter-nights"></span>
          </label>
          <p class="modal-overlap-warning full" id="new-charter-overlap" role="alert"></p>
          <label>Guests
            <input id="new-charter-guest-count" type="number" min="1" step="1" value="1">
          </label>
          <label>Copy from
            <select id="clone-from">
              <option value="">— nothing —</option>
              ${sources.map(charter => `<option value="${escapeAttribute(charter.id)}">${escapeHtml(charter.name || charter.id)}${(charter.charter || {}).start_date ? ` · ${escapeHtml(core.fmtShort(charter.charter.start_date))}` : ""}</option>`).join("")}
            </select>
          </label>
          <div class="full">
            <span class="field-hint">Copy</span>
            <div class="check-grid">
              ${[["itinerary", "Route & itinerary"], ["crew", "Crew"], ["menus", "Menus"], ["drinks", "Drinks"]].map(([value, label]) => `
                <label class="inline-check"><input type="checkbox" name="copy" value="${value}" disabled> ${label}</label>
              `).join("")}
            </div>
          </div>
          <p id="create-charter-error" class="modal-error full" role="alert"></p>
          ${modalActionButtonsHtml({ submitKind: "save", submitLabel: "Create charter", submitAttributes: ` id="create-charter-submit"` })}
        </div>
      </form>
    `, { cardClass: "modal-wide", hideClose: true });
    const nameInput = modal.querySelector("#new-charter-name");
    const idLabel = modal.querySelector("#new-charter-id");
    const startInput = modal.querySelector("#new-charter-start-date");
    const endInput = modal.querySelector("#new-charter-end-date");
    const cloneSelect = modal.querySelector("#clone-from");
    const copyInputs = Array.from(modal.querySelectorAll("input[name='copy']"));
    const syncGeneratedId = () => {
      idLabel.textContent = slugify(nameInput.value) || "—";
    };
    const syncCopyAvailability = () => {
      const enabled = Boolean(cloneSelect.value);
      copyInputs.forEach(input => {
        input.disabled = !enabled;
        if (!enabled) {
          input.checked = false;
        }
      });
    };
    const syncDates = () => {
      const nights = core.nights({ start_date: startInput.value, end_date: endInput.value });
      modal.querySelector("#new-charter-nights").textContent = nights === null ? "" : `${nights} ${nights === 1 ? "night" : "nights"}`;
      const clashes = core.findOverlaps({ id: "", start_date: startInput.value, end_date: endInput.value }, core.overlapEntries(state.charters, state.reservedPeriods.periods), "charter");
      modal.querySelector("#new-charter-overlap").textContent = clashes.length ? `${core.overlapMessage(clashes)}. Choose other dates.` : "";
      modal.querySelector("#create-charter-submit").disabled = clashes.length > 0;
    };
    nameInput.addEventListener("input", syncGeneratedId);
    cloneSelect.addEventListener("change", syncCopyAvailability);
    startInput.addEventListener("input", syncDates);
    endInput.addEventListener("input", syncDates);
    syncGeneratedId();
    syncCopyAvailability();
    syncDates();
    modal.querySelector("#create-charter-form").addEventListener("submit", createCharter);
  }

  async function createCharter(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.querySelector("#new-charter-name").value.trim();
    const charterId = slugify(name);
    const errorField = form.querySelector("#create-charter-error");
    errorField.textContent = "";
    if (!charterId) {
      errorField.textContent = "Charter name is required.";
      return;
    }
    if (state.charters.some(charter => charter.id === charterId)) {
      errorField.textContent = `A charter with the id ${charterId} already exists.`;
      return;
    }
    const copy = {};
    form.querySelectorAll("input[name='copy']").forEach(input => {
      copy[input.value] = input.checked;
    });
    const body = {
      charter_id: charterId,
      name,
      start_date: form.querySelector("#new-charter-start-date").value,
      end_date: form.querySelector("#new-charter-end-date").value,
      notes: "",
      guest_count: normalizeGuestCount(form.querySelector("#new-charter-guest-count").value),
      clone_from: form.querySelector("#clone-from").value,
      copy
    };
    try {
      await api("/api/admin/charters/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      state.selectedCharter = charterId;
      state.sectionPanels.charter = "info";
      markModalSaved(document.getElementById("dialog-modal"));
      closeDialogModal();
      setStatus("Charter created.", "ok");
      await loadBootstrap();
    } catch (error) {
      errorField.textContent = error.message;
    }
  }
```

- [ ] **Step 2: Reserved period card**

Add after `deleteCurrentCharter`:

```js
  const RESERVED_PERIOD_TYPES = Object.freeze([["maintenance", "Maintenance"], ["unavailable", "Unavailable"], ["other", "Other"]]);

  // Spec-charters §8. periodId null = new.
  function openReservedPeriodModal(periodId) {
    if (!canManageCharterAdmin()) {
      setStatus("Only Charter Admin on Bridge can edit reserved periods.", "error");
      return;
    }
    const core = window.IolantheChartersCore;
    const existing = periodId ? state.reservedPeriods.periods.find(period => period.id === periodId) : null;
    const period = existing || { id: "", type: "maintenance", title: "", start_date: "", end_date: "", description: "" };
    const modal = openDialogModal(existing ? "Reserved period" : "New reserved period", `
      <form id="reserved-period-form" class="form-section">
        <div class="form-grid">
          <div class="full">
            <span class="field-hint">Type</span>
            <div class="segmented" role="radiogroup" aria-label="Type">
              ${RESERVED_PERIOD_TYPES.map(([value, label]) => `<label><input type="radio" name="period-type" value="${value}" ${period.type === value ? "checked" : ""}>${label}</label>`).join("")}
            </div>
          </div>
          <label class="full">Title
            <input id="period-title" required maxlength="80" value="${escapeAttribute(period.title)}" data-autofocus>
          </label>
          <label>Start date
            <input id="period-start" type="date" required value="${escapeAttribute(period.start_date)}">
          </label>
          <label>End date
            <input id="period-end" type="date" required value="${escapeAttribute(period.end_date)}">
            <span class="field-hint" id="period-days"></span>
          </label>
          <p class="modal-overlap-warning full" id="period-overlap" role="alert"></p>
          <label class="full">Description
            <textarea id="period-description" rows="4">${escapeHtml(period.description || "")}</textarea>
          </label>
          <p id="period-error" class="modal-error full" role="alert"></p>
          ${modalActionButtonsHtml({ submitKind: "save", submitLabel: existing ? "Save period" : "Add period", submitAttributes: ` id="period-submit"` })}
        </div>
      </form>
    `, {
      headerActionsHtml: existing ? `<div class="button-row modal-title-actions">${iconButtonHtml("remove", "Delete period", ` id="period-delete"`)}</div>` : "",
      hideClose: true
    });
    const startInput = modal.querySelector("#period-start");
    const endInput = modal.querySelector("#period-end");
    const syncDates = () => {
      const nights = core.nights({ start_date: startInput.value, end_date: endInput.value });
      modal.querySelector("#period-days").textContent = nights === null ? "" : `${nights + 1} ${nights === 0 ? "day" : "days"}`;
      const others = core.overlapEntries(state.charters, state.reservedPeriods.periods.filter(other => other.id !== period.id));
      const clashes = core.findOverlaps({ id: period.id, start_date: startInput.value, end_date: endInput.value }, others, "period");
      modal.querySelector("#period-overlap").textContent = clashes.length ? `${core.overlapMessage(clashes)}. Choose other dates.` : "";
      modal.querySelector("#period-submit").disabled = clashes.length > 0;
    };
    startInput.addEventListener("input", syncDates);
    endInput.addEventListener("input", syncDates);
    syncDates();

    modal.querySelector("#reserved-period-form").addEventListener("submit", async event => {
      event.preventDefault();
      const errorField = modal.querySelector("#period-error");
      errorField.textContent = "";
      const draft = {
        id: period.id,
        type: (modal.querySelector("input[name='period-type']:checked") || {}).value || "maintenance",
        title: modal.querySelector("#period-title").value.trim(),
        start_date: startInput.value,
        end_date: endInput.value,
        description: modal.querySelector("#period-description").value
      };
      const periods = existing
        ? state.reservedPeriods.periods.map(other => (other.id === period.id ? draft : other))
        : state.reservedPeriods.periods.concat([draft]);
      if (await saveReservedPeriods(periods, errorField)) {
        markModalSaved(document.getElementById("dialog-modal"));
        closeDialogModal();
        setStatus(existing ? "Reserved period saved." : "Reserved period added.", "ok");
      }
    });

    const deleteButton = modal.querySelector("#period-delete");
    if (deleteButton) {
      deleteButton.addEventListener("click", async () => {
        if (!await showAdminConfirm({ title: "Delete reserved period", message: `Delete "${period.title}"?`, confirmLabel: "Delete", cancelLabel: "Cancel", tone: "danger" })) {
          return;
        }
        if (await saveReservedPeriods(state.reservedPeriods.periods.filter(other => other.id !== period.id), modal.querySelector("#period-error"))) {
          markModalSaved(document.getElementById("dialog-modal"));
          closeDialogModal();
          setStatus("Reserved period deleted.", "ok");
        }
      });
    }
  }

  // Posts the whole list with base_revision; on 409 offers a reload. Returns true when saved.
  async function saveReservedPeriods(periods, errorField) {
    try {
      const saved = await api("/api/admin/reserved-periods/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periods, base_revision: state.reservedPeriods.revision })
      });
      state.reservedPeriods = { revision: saved.revision, periods: Array.isArray(saved.periods) ? saved.periods : [] };
      refreshCharterGantt();
      return true;
    } catch (error) {
      if (error && error.status === 409) {
        const reload = await showAdminConfirm({ title: "Reserved periods changed", message: `${error.message} Reload them now? Your edit will be lost.`, confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning" });
        if (reload) {
          await loadReservedPeriods();
          refreshCharterGantt();
          closeDialogModal();
        }
        return false;
      }
      if (errorField) {
        errorField.textContent = error.message;
      } else {
        setStatus(error.message, "error");
      }
      return false;
    }
  }
```

`throwAdminApiError` sets `error.status` to the HTTP status and `error.payload` to the JSON body, which the 409 branch above relies on.

- [ ] **Step 3: Browser check**

New charter: + on the band → dialog; type "Hoffmann", dates 2027-01-14..24 → "10 nights", id `hoffmann`; set start 2026-11-05 → overlap warning, ✓ disabled; back to January → ✓ → the page lands on Hoffmann's Info, selected on the band. Reserved period: ▦ → Maintenance, "Subic yard", 2026-09-20..28 → "9 days" → ✓ → a striped bar appears; click it → the card opens with the values and a delete button; change the title → ✓ → bar label updates; open again → delete → confirm → gone. Set a period over Csaba's dates → warning and ✓ disabled. Delete charter: 🗑 on the band → the old password flow (delete Hoffmann; use the dev charter password typed by David). Galley and Hotel unchanged.

- [ ] **Step 4: Commit**

```bash
git add admin.js
git commit -m "feat(charters): New charter dialog (copy from, overlap warning, lands on Info) and the Reserved period card"
```

---

### Task 8: Docs, tests, final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md**

In the Stack list add after the `itinerary-core.js` bullet:

```
- `charters-core.js` — charter list pure logic (also a Node module): the active rule (mirror of the server's
  `lib/active-charter.js`, shared fixture `test/fixtures/active-charter-cases.json`), overlaps, statuses, `pillFor`, and
  the band's layout maths (`packRows`, `zoomSpan`, `scrollRange`, `visibleMonths`, `visibleWeeks`).
- `charter-gantt.js` / `charter-gantt.css` — the Gantt band above every Charter panel (spec-charters §6): the charter
  selector. Read-only: drag pans, wheel zooms, ← → pan, click selects a charter or opens a reserved period's card.
  Collapsed to a strip by default on the Route panel (localStorage `iolanthe-admin.gantt.collapsed`). Mounted by
  `admin.js` (`mountCharterGantt`) into `#charter-gantt-host`, which `sectionShell` renders for the Charter section.
- Reserved periods (maintenance / unavailable / other) come from `/api/admin/reserved-periods` and save with a
  `base_revision`; the admin and the server both refuse dates that overlap a charter or a period.
- The active charter is computed by the server (in date = the day before start to the end date, else the crew's
  choice); the Info page's ★ "Make active" is disabled while a charter is in date. Galley and Hotel keep their
  "Select Charter" dropdowns.
```

Change the tests line to `node --test` runs the tests in `test/` (133 tests), which cover `routes-core`, `itinerary-core` and `charters-core`.

- [ ] **Step 2: Full test run and the browser checklist**

Run: `node --test` → `# pass 133`, `# fail 0`.

Browser checklist (scratch server, Charter Admin). To see the changeover colours, give Csaba dates around today through its Info page (start = tomorrow, end = tomorrow + 8), then:
1. Band: Csaba gold without any button press (in date from today); ★ on Larry disabled with the tooltip naming Csaba and its end date; restore Csaba's dates afterwards.
2. Pan by dragging the chart, by the scrollbar, by ‹ ›, and by ← → with the band focused; the span label follows.
3. Wheel over the chart zooms around the pointer; the four zoom pills set Active / Quarter / Year / 3 years; ● Today centres today.
4. Click a bar with unsaved Info edits → the discard dialog; Cancel keeps the edits.
5. Route panel: strip by default; expand → band; reload → still expanded (remembered); collapse again.
6. Create refused on overlap in the dialog; a server refusal (edit the dates in two tabs) shows inline.
7. Reserved period create / edit / delete; a 409 (save in two tabs) offers Reload.
8. Phone width (`resize_window` mobile): toolbar wraps, chart scrolls, Info is one column.
9. Regression: Route page Working on, Start from…, the strip, splitters, assign to charter; Galley and Hotel dropdowns; Site Editor; Crew.
10. Console clean on every panel.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: charter Gantt band, charters-core and reserved periods"
```

- [ ] **Step 4: PR**

```bash
git push -u origin feat/charter-gantt
gh pr create --title "Charter Gantt band, computed active charter, reserved periods" --body "Spec: docs/charter-rework/spec-charters.md. Requires iolanthe-server feat/charter-gantt (deployed). Assets admin-charters-1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-review against the spec

- §6 files, placement, collapsed strip, toolbar, chart, interaction, empty state → Tasks 2, 4, 5. The "N charters without dates" pill is the `gantt-nodates` select in the toolbar (Task 4).
- §7 Info page header, pill texts, ★ disabled rules, tiles, sections, columns, overlap check, Make active confirm → Task 6.
- §8 New charter (copy from newest first, no set_active, lands on Info), Reserved period card (segment, delete, 409 Reload), Delete charter from the band → Task 7 and Task 5 (`onDeleteCharter`).
- §9 shared classes → Task 3; `routes.css` untouched.
- §10 selection fallback unchanged; Galley / Hotel dropdowns kept (`sectionToolbarHtml` early return only for charter) → Task 5.
- §11 admin tests (fixture, overlaps, packRows, zoomSpan, calendar) → Tasks 1–2; browser checklist → Task 8.
- §13 assets `admin-charters-1` → Task 5 Step 1.
- Type consistency: `ganttContext()` keys match the `ctx` the component reads (`charters, periods, selectedId, activeId, forcedId, today, zoom, collapsed, canManage, onSelectCharter, onOpenPeriod, onCreateCharter, onDeleteCharter, onZoomChange, onToggleCollapsed`); `state.gantt` is `{host, handle}` everywhere; `overlapEntries` / `findOverlaps` / `overlapMessage` / `pillFor` / `nights` / `fmtShort` / `todayLocal` all exported in Task 2's return block.
