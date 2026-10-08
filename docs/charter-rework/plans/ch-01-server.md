# Charter Gantt spec — Plan 1 of 2: Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server compute the active charter from dates (in date = the day before start to the end date, else the crew's stored choice), refuse overlapping charter dates, and store reserved periods (maintenance / unavailable / other) in one revisioned file.

**Architecture:** Two new pure modules, `lib/active-charter.js` (the rule, statuses, overlaps) and `lib/reserved-periods.js` (file read / validate / save with revision), each with `node:test` tests. `server.js` swaps `getActiveCharterId()` onto the rule, drops `DEFAULT_ACTIVE_CHARTER`, adds the overlap check to charter create / save, adds two reserved-period routes and extends the charters payloads. Nothing public changes shape; the guest is untouched.

**Tech Stack:** Node (CommonJS, no dependencies), `node:test`. Repo: `S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server`, branch `feat/charter-gantt` from `main` (`cbde12e` or later). Spec: `portal/iolanthe-admin/docs/charter-rework/spec-charters.md` §3–§5, §11, §13.

**Reading before you start:** `lib/route-library.js` lines 1–60 (`httpError`, `slugify`, file helpers) and 235–262 (`saveRoute`, the 409 pattern); `test/route-library.test.js` lines 1–20 (`tempDir`); `server.js` by name: `sanitizeCharterId`, `resolveActiveCharterId`, `getActiveCharterId`, `listCharterSummaries`, `setActiveCharter`, `validateActiveCharterDateRange`, `localTodayDateValue`, `parseLocalDateOnlyValue`, `createAdminCharter`, `deleteAdminCharter`, `saveAdminJsonFile`, `buildAdminBootstrap`, the `/api/admin/active-charter` and `/api/admin/charters` handlers, the anchorages handlers. Line numbers below are from `cbde12e` and drift as you edit; search by name.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/active-charter.js` (create) | Pure: `addDays`, `isValidDate`, `nights`, `charterStatus`, `isInDate`, `activeCharterId`, `rangesOverlap`, `findOverlaps`. |
| `test/active-charter.test.js` (create) | Tests, driven by the shared fixture. |
| `test/fixtures/active-charter-cases.json` (create) | The active-rule cases; copied verbatim into the admin repo by plan 2 so both implementations agree. |
| `lib/reserved-periods.js` (create) | `readPeriods(dataDir)`, `normalizePeriod`, `validatePeriods`, `savePeriods(dataDir, body, charters)`; revision + 409; overlap via `active-charter`. |
| `test/reserved-periods.test.js` (create) | Tests with a temp data dir. |
| `server.js` (modify) | `getActiveCharterId` on the rule; `DEFAULT_ACTIVE_CHARTER` removed; `setActiveCharter` 409 while forced; summaries gain `nights` / `status`; charters + bootstrap payload fields; overlap check on create and `charter.json` save; reserved-period routes; `set_active` ignored. |
| `scripts/check-charter-endpoints.sh` (create) | Manual checks 1–8 against a running server. |
| `CLAUDE.md` (modify) | Data layout, endpoints, the active rule. |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch**

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server"
git checkout main && git pull --ff-only && git checkout -b feat/charter-gantt
node --test
```

Expected: `# pass 65`, `# fail 0`.

---

### Task 1: `lib/active-charter.js` — dates, status, the active rule

**Files:**
- Create: `lib/active-charter.js`
- Create: `test/fixtures/active-charter-cases.json`
- Create: `test/active-charter.test.js`

- [ ] **Step 1: Write the shared fixture**

`test/fixtures/active-charter-cases.json` (this exact file is copied to the admin repo in plan 2; do not add fields):

```json
{
  "charters": [
    { "id": "smith", "start_date": "2026-09-01", "end_date": "2026-09-08" },
    { "id": "csaba", "start_date": "2026-11-01", "end_date": "2026-11-09" },
    { "id": "larry", "start_date": "2026-11-10", "end_date": "2026-11-13" },
    { "id": "hoffmann", "start_date": "2027-01-14", "end_date": "2027-01-24" },
    { "id": "nodates", "start_date": null, "end_date": null },
    { "id": "backwards", "start_date": "2026-12-10", "end_date": "2026-12-01" }
  ],
  "cases": [
    { "name": "underway", "today": "2026-11-03", "stored": "", "expect": "csaba" },
    { "name": "day before start is in date", "today": "2026-10-31", "stored": "smith", "expect": "csaba" },
    { "name": "two days before start is not", "today": "2026-10-30", "stored": "smith", "expect": "smith" },
    { "name": "end date is still in date", "today": "2026-11-13", "stored": "smith", "expect": "larry" },
    { "name": "day after the end is not", "today": "2026-11-14", "stored": "smith", "expect": "smith" },
    { "name": "turnaround day: the next charter wins", "today": "2026-11-09", "stored": "", "expect": "larry" },
    { "name": "stored choice outside any window", "today": "2026-12-20", "stored": "hoffmann", "expect": "hoffmann" },
    { "name": "stored choice of an ended charter is honoured", "today": "2026-12-20", "stored": "smith", "expect": "smith" },
    { "name": "stored choice without dates is honoured", "today": "2026-12-20", "stored": "nodates", "expect": "nodates" },
    { "name": "stored choice that no longer exists falls back to the last ended", "today": "2026-12-20", "stored": "gone", "expect": "larry" },
    { "name": "no stored choice falls back to the last ended", "today": "2026-12-20", "stored": "", "expect": "larry" },
    { "name": "nothing ended yet and no stored choice", "today": "2026-08-01", "stored": "", "expect": "" },
    { "name": "backwards dates never match a window", "today": "2026-12-05", "stored": "", "expect": "larry" }
  ]
}
```

- [ ] **Step 2: Write the failing tests**

`test/active-charter.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const lib = require("../lib/active-charter");
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "active-charter-cases.json"), "utf8"));

test("addDays and isValidDate", () => {
  assert.equal(lib.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(lib.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(lib.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(lib.addDays("nope", 1), "");
  assert.equal(lib.isValidDate("2026-02-30"), false);
  assert.equal(lib.isValidDate("2026-02-28"), true);
  assert.equal(lib.isValidDate(null), false);
});

test("nights is end minus start, null when the range is unusable", () => {
  assert.equal(lib.nights({ start_date: "2026-11-01", end_date: "2026-11-09" }), 8);
  assert.equal(lib.nights({ start_date: "2026-11-01", end_date: "2026-11-01" }), 0);
  assert.equal(lib.nights({ start_date: "2026-11-09", end_date: "2026-11-01" }), null);
  assert.equal(lib.nights({ start_date: "", end_date: "2026-11-01" }), null);
});

test("charterStatus", () => {
  const c = { start_date: "2026-11-01", end_date: "2026-11-09" };
  assert.equal(lib.charterStatus(c, "2026-10-31"), "upcoming");
  assert.equal(lib.charterStatus(c, "2026-11-01"), "underway");
  assert.equal(lib.charterStatus(c, "2026-11-09"), "underway");
  assert.equal(lib.charterStatus(c, "2026-11-10"), "ended");
  assert.equal(lib.charterStatus({ start_date: null, end_date: null }, "2026-11-10"), "no-dates");
  assert.equal(lib.charterStatus({ start_date: "2026-11-09", end_date: "2026-11-01" }, "2026-11-10"), "no-dates");
});

test("isInDate covers the day before the start through the end date", () => {
  const c = { start_date: "2026-11-01", end_date: "2026-11-09" };
  assert.equal(lib.isInDate(c, "2026-10-30"), false);
  assert.equal(lib.isInDate(c, "2026-10-31"), true);
  assert.equal(lib.isInDate(c, "2026-11-09"), true);
  assert.equal(lib.isInDate(c, "2026-11-10"), false);
  assert.equal(lib.isInDate({ start_date: null, end_date: null }, "2026-11-01"), false);
});

for (const c of fixture.cases) {
  test(`activeCharterId: ${c.name}`, () => {
    assert.equal(lib.activeCharterId(fixture.charters, c.stored, c.today), c.expect);
  });
}

test("activeCharterId tolerates summaries that nest the dates under charter", () => {
  const charters = [{ id: "a", charter: { start_date: "2026-11-01", end_date: "2026-11-09" } }];
  assert.equal(lib.activeCharterId(charters, "", "2026-11-02"), "a");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/active-charter.test.js`
Expected: FAIL with `Cannot find module '../lib/active-charter'`.

- [ ] **Step 4: Write the module**

`lib/active-charter.js`:

```js
"use strict";

// The active-charter rule and the date helpers behind it. Pure: no fs, no clock. The admin repo carries the same
// functions in charters-core.js and the same fixture (test/fixtures/active-charter-cases.json); keep them in step.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDate(value) {
  const match = DATE_RE.exec(String(value || ""));
  if (!match) {
    return false;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3]);
}

function addDays(value, days) {
  if (!isValidDate(value)) {
    return "";
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

// The charter's dates, whether the summary nests them under `charter` or carries them directly.
function datesOf(charter) {
  const source = charter && charter.charter && typeof charter.charter === "object" ? charter.charter : (charter || {});
  const start = isValidDate(source.start_date) ? source.start_date : "";
  const end = isValidDate(source.end_date) ? source.end_date : "";
  return start && end && end >= start ? { start, end } : null;
}

function nights(charter) {
  const range = datesOf(charter);
  if (!range) {
    return null;
  }
  const [sy, sm, sd] = range.start.split("-").map(Number);
  const [ey, em, ed] = range.end.split("-").map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000);
}

function charterStatus(charter, today) {
  const range = datesOf(charter);
  if (!range) {
    return "no-dates";
  }
  if (today < range.start) {
    return "upcoming";
  }
  return today > range.end ? "ended" : "underway";
}

function isInDate(charter, today) {
  const range = datesOf(charter);
  return Boolean(range) && today >= addDays(range.start, -1) && today <= range.end;
}

// Spec §3. charters: summaries with id and dates; storedId: the crew's choice; today: "YYYY-MM-DD".
function activeCharterId(charters, storedId, today) {
  const list = Array.isArray(charters) ? charters.filter((c) => c && typeof c.id === "string" && c.id) : [];
  const inDate = list.filter((c) => isInDate(c, today))
    .sort((a, b) => datesOf(b).start.localeCompare(datesOf(a).start));
  if (inDate.length) {
    return inDate[0].id;
  }
  if (storedId && list.some((c) => c.id === storedId)) {
    return storedId;
  }
  const ended = list.filter((c) => charterStatus(c, today) === "ended")
    .sort((a, b) => datesOf(b).end.localeCompare(datesOf(a).end));
  return ended.length ? ended[0].id : "";
}

function rangesOverlap(a, b) {
  const ra = datesOf(a);
  const rb = datesOf(b);
  return Boolean(ra && rb) && ra.start <= rb.end && rb.start <= ra.end;
}

// Spec §4. candidate: {id?, start_date, end_date}; others: [{kind: "charter"|"period", id, name, start_date, end_date}].
// An entry with the candidate's own (non-empty) id and kind is skipped so a charter never clashes with itself.
function findOverlaps(candidate, others, selfKind = "charter") {
  return (Array.isArray(others) ? others : [])
    .filter((entry) => entry && !(candidate && candidate.id && entry.kind === selfKind && entry.id === candidate.id))
    .filter((entry) => rangesOverlap(candidate, entry))
    .map((entry) => ({ kind: entry.kind, id: entry.id, name: entry.name, start_date: entry.start_date, end_date: entry.end_date }));
}

function overlapMessage(overlaps) {
  const first = overlaps[0];
  return first ? `Overlaps ${first.name} (${first.start_date} – ${first.end_date})` : "";
}

module.exports = { isValidDate, addDays, datesOf, nights, charterStatus, isInDate, activeCharterId, rangesOverlap, findOverlaps, overlapMessage };
```

- [ ] **Step 5: Add the overlap tests and run everything**

Append to `test/active-charter.test.js`:

```js
test("rangesOverlap is inclusive and false for unusable dates", () => {
  const a = { start_date: "2026-11-01", end_date: "2026-11-09" };
  assert.equal(lib.rangesOverlap(a, { start_date: "2026-11-09", end_date: "2026-11-12" }), true);
  assert.equal(lib.rangesOverlap(a, { start_date: "2026-11-10", end_date: "2026-11-12" }), false);
  assert.equal(lib.rangesOverlap(a, { start_date: "2026-10-20", end_date: "2026-10-31" }), false);
  assert.equal(lib.rangesOverlap(a, { start_date: "2026-10-20", end_date: "2026-11-01" }), true);
  assert.equal(lib.rangesOverlap(a, { start_date: null, end_date: null }), false);
});

test("findOverlaps skips the candidate itself and reports the clashes", () => {
  const others = [
    { kind: "charter", id: "csaba", name: "Csaba", start_date: "2026-11-01", end_date: "2026-11-09" },
    { kind: "charter", id: "larry", name: "Larry", start_date: "2026-11-10", end_date: "2026-11-13" },
    { kind: "period", id: "p-1", name: "Maintenance · yard", start_date: "2026-11-12", end_date: "2026-11-20" }
  ];
  assert.deepEqual(lib.findOverlaps({ id: "csaba", start_date: "2026-11-01", end_date: "2026-11-11" }, others), [
    { kind: "charter", id: "larry", name: "Larry", start_date: "2026-11-10", end_date: "2026-11-13" }
  ]);
  assert.equal(lib.findOverlaps({ id: "new", start_date: "2026-11-14", end_date: "2026-11-15" }, others).length, 1);
  assert.equal(lib.findOverlaps({ id: "new", start_date: "2026-11-21", end_date: "2026-11-25" }, others).length, 0);
  assert.equal(lib.findOverlaps({ id: "p-1", start_date: "2026-11-12", end_date: "2026-11-20" }, others, "period").length, 1);
  assert.equal(lib.overlapMessage([others[1]]), "Overlaps Larry (2026-11-10 – 2026-11-13)");
  assert.equal(lib.overlapMessage([]), "");
});
```

Run: `node --test test/active-charter.test.js`
Expected: `# pass 20`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add lib/active-charter.js test/active-charter.test.js test/fixtures/active-charter-cases.json
git commit -m "feat(charters): active-charter rule, statuses and overlap detection as a pure module"
```

---

### Task 2: `lib/reserved-periods.js` — read, validate, save with revision

**Files:**
- Create: `lib/reserved-periods.js`
- Create: `test/reserved-periods.test.js`

- [ ] **Step 1: Write the failing tests**

`test/reserved-periods.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const lib = require("../lib/reserved-periods");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "reserved-periods-"));
}

const CHARTERS = [
  { kind: "charter", id: "csaba", name: "Csaba", start_date: "2026-11-01", end_date: "2026-11-09" }
];

test("readPeriods returns an empty file when absent", () => {
  assert.deepEqual(lib.readPeriods(tempDir()), { revision: 0, periods: [] });
});

test("validatePeriods: type, title, dates, description, ids", () => {
  const errors = lib.validatePeriods([
    { id: "p-1", type: "maintenance", title: "Yard", start_date: "2026-09-20", end_date: "2026-09-28", description: "" },
    { id: "bad id!", type: "party", title: "", start_date: "2026-09-30", end_date: "2026-09-29", description: 5 }
  ]);
  assert.deepEqual(errors.map((e) => e.field), ["periods[1].id", "periods[1].type", "periods[1].title", "periods[1].end_date", "periods[1].description"]);
});

test("validatePeriods catches periods that overlap each other", () => {
  const errors = lib.validatePeriods([
    { type: "maintenance", title: "A", start_date: "2026-09-20", end_date: "2026-09-28" },
    { type: "unavailable", title: "B", start_date: "2026-09-28", end_date: "2026-10-02" }
  ]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].field, "periods[1].start_date");
  assert.match(errors[0].message, /Overlaps Maintenance · A/);
});

test("savePeriods writes, generates ids, bumps the revision and refuses stale saves", () => {
  const dir = tempDir();
  const first = lib.savePeriods(dir, {
    base_revision: 0,
    periods: [{ type: "maintenance", title: "Yard", start_date: "2026-09-20", end_date: "2026-09-28", description: "Haul-out" }]
  }, CHARTERS);
  assert.equal(first.revision, 1);
  assert.match(first.periods[0].id, /^p-[a-z0-9]{6}$/);
  assert.deepEqual(lib.readPeriods(dir), first);

  assert.throws(() => lib.savePeriods(dir, { base_revision: 0, periods: [] }, CHARTERS), (error) => error.statusCode === 409 && error.revision === 1 && Array.isArray(error.periods));

  const second = lib.savePeriods(dir, { base_revision: 1, periods: [{ ...first.periods[0], title: "Yard 2" }] }, CHARTERS);
  assert.equal(second.revision, 2);
  assert.equal(second.periods[0].id, first.periods[0].id);
  assert.equal(second.periods[0].title, "Yard 2");
});

test("savePeriods refuses an overlap with a charter (400 with overlaps)", () => {
  const dir = tempDir();
  assert.throws(() => lib.savePeriods(dir, {
    base_revision: 0,
    periods: [{ type: "other", title: "Owner", start_date: "2026-11-05", end_date: "2026-11-06" }]
  }, CHARTERS), (error) => error.statusCode === 400 && /Overlaps Csaba/.test(error.message) && error.overlaps[0].id === "csaba");
});

test("savePeriods refuses invalid periods with 400 and the field", () => {
  assert.throws(() => lib.savePeriods(tempDir(), { base_revision: 0, periods: [{ type: "maintenance", title: "", start_date: "x", end_date: "y" }] }, []), (error) => error.statusCode === 400 && error.field === "periods[0].title");
});

test("periodEntries maps periods to the overlap entry shape", () => {
  const entries = lib.periodEntries([{ id: "p-1", type: "maintenance", title: "Yard", start_date: "2026-09-20", end_date: "2026-09-28" }]);
  assert.deepEqual(entries, [{ kind: "period", id: "p-1", name: "Maintenance · Yard", start_date: "2026-09-20", end_date: "2026-09-28" }]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/reserved-periods.test.js`
Expected: FAIL with `Cannot find module '../lib/reserved-periods'`.

- [ ] **Step 3: Write the module**

`lib/reserved-periods.js`:

```js
"use strict";

// Reserved periods (spec-charters §5): maintenance / unavailable / other spans that block charter dates.
// One file, data/reserved-periods.json, {revision, periods[]}, saved with a base_revision like the route library.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const active = require("./active-charter");

const FILE_NAME = "reserved-periods.json";
const TYPES = ["maintenance", "unavailable", "other"];
const TYPE_LABELS = { maintenance: "Maintenance", unavailable: "Unavailable", other: "Reserved" };
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 2000;

function httpError(statusCode, message, extra) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return Object.assign(error, extra || {});
}

function filePath(dataDir) {
  return path.join(dataDir, FILE_NAME);
}

function readPeriods(dataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(dataDir), "utf8"));
    const periods = Array.isArray(raw && raw.periods) ? raw.periods.map(normalizePeriod) : [];
    return { revision: Number.isInteger(raw && raw.revision) ? raw.revision : 0, periods };
  } catch (error) {
    return { revision: 0, periods: [] };
  }
}

function newId() {
  return `p-${crypto.randomBytes(4).readUInt32BE(0).toString(36).padStart(6, "0").slice(-6)}`;
}

function normalizePeriod(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    id: typeof source.id === "string" ? source.id.trim() : "",
    type: typeof source.type === "string" ? source.type.trim().toLowerCase() : "",
    title: typeof source.title === "string" ? source.title.trim() : "",
    start_date: typeof source.start_date === "string" ? source.start_date.trim() : "",
    end_date: typeof source.end_date === "string" ? source.end_date.trim() : "",
    description: typeof source.description === "string" ? source.description : (source.description == null ? "" : source.description)
  };
}

function periodName(period) {
  return `${TYPE_LABELS[period.type] || "Reserved"} · ${period.title}`;
}

function periodEntries(periods) {
  return (Array.isArray(periods) ? periods : []).map((p) => ({ kind: "period", id: p.id, name: periodName(p), start_date: p.start_date, end_date: p.end_date }));
}

// Returns [{field, message}]; empty when valid. Accepts raw or normalised periods.
function validatePeriods(periods) {
  const errors = [];
  const list = (Array.isArray(periods) ? periods : []).map(normalizePeriod);
  list.forEach((p, i) => {
    const at = `periods[${i}]`;
    if (p.id && !ID_RE.test(p.id)) errors.push({ field: `${at}.id`, message: "Invalid id." });
    if (!TYPES.includes(p.type)) errors.push({ field: `${at}.type`, message: "Type must be maintenance, unavailable or other." });
    if (!p.title || p.title.length > TITLE_MAX) errors.push({ field: `${at}.title`, message: `Title is required (up to ${TITLE_MAX} characters).` });
    if (!active.isValidDate(p.start_date)) errors.push({ field: `${at}.start_date`, message: "Start date is required." });
    if (!active.isValidDate(p.end_date) || (active.isValidDate(p.start_date) && p.end_date < p.start_date)) errors.push({ field: `${at}.end_date`, message: "End date must be on or after the start date." });
    if (typeof p.description !== "string" || p.description.length > DESCRIPTION_MAX) errors.push({ field: `${at}.description`, message: `Description must be text (up to ${DESCRIPTION_MAX} characters).` });
  });
  list.forEach((p, i) => {
    const others = periodEntries(list.slice(0, i));
    const clashes = active.findOverlaps({ id: p.id, start_date: p.start_date, end_date: p.end_date }, others, "period");
    if (clashes.length) errors.push({ field: `periods[${i}].start_date`, message: active.overlapMessage(clashes), overlaps: clashes });
  });
  return errors;
}

// body: { periods, base_revision }. charterEntries: [{kind:"charter", id, name, start_date, end_date}] for the overlap check.
function savePeriods(dataDir, body, charterEntries) {
  const request = body && typeof body === "object" ? body : {};
  const stored = readPeriods(dataDir);
  const baseRevision = Number(request.base_revision);
  if (!Number.isInteger(baseRevision) || baseRevision !== stored.revision) {
    throw httpError(409, `Someone else saved the reserved periods (revision ${stored.revision}). Reload to see their changes.`, { code: "revision", revision: stored.revision, periods: stored.periods });
  }
  const periods = (Array.isArray(request.periods) ? request.periods : []).map(normalizePeriod);
  const errors = validatePeriods(periods);
  if (errors.length) {
    throw httpError(400, errors[0].message, { field: errors[0].field, errors, overlaps: errors[0].overlaps || [] });
  }
  const used = new Set(periods.map((p) => p.id).filter(Boolean));
  const withIds = periods.map((p) => {
    if (p.id) return p;
    let id = newId();
    while (used.has(id)) id = newId();
    used.add(id);
    return { ...p, id };
  });
  withIds.forEach((p) => {
    const clashes = active.findOverlaps(p, Array.isArray(charterEntries) ? charterEntries : [], "period");
    if (clashes.length) throw httpError(400, active.overlapMessage(clashes), { field: "periods", overlaps: clashes });
  });
  const saved = { revision: stored.revision + 1, periods: withIds };
  const tmp = `${filePath(dataDir)}.tmp`;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(saved, null, 2)}\n`);
  fs.renameSync(tmp, filePath(dataDir));
  return saved;
}

module.exports = { FILE_NAME, TYPES, readPeriods, normalizePeriod, periodName, periodEntries, validatePeriods, savePeriods };
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/reserved-periods.test.js`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/reserved-periods.js test/reserved-periods.test.js
git commit -m "feat(charters): reserved periods file with validation, overlap check and revision"
```

---

### Task 3: `server.js` — the active rule replaces the stored id and the default

**Files:**
- Modify: `server.js` (`DEFAULT_ACTIVE_CHARTER`, `sanitizeCharterId`, `resolveActiveCharterId`, `getActiveCharterId`, `listCharterSummaries`, `setActiveCharter`, `validateActiveCharterDateRange`, `deleteAdminCharter`, `createAdminCharter`)

- [ ] **Step 1: Require the modules**

After `const itineraryLib = require("./lib/itinerary");` (line 25) add:

```js
const activeCharterLib = require("./lib/active-charter");
const reservedPeriodsLib = require("./lib/reserved-periods");
```

- [ ] **Step 2: Remove the default charter**

Delete line 42 `const DEFAULT_ACTIVE_CHARTER = "csaba";`. Replace `sanitizeCharterId` and `resolveActiveCharterId` with:

```js
function sanitizeCharterId(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9-]+$/.test(text) ? text : "";
}

// An id that names a charter directory, else "" (callers already treat "" as "no charter").
function resolveActiveCharterId(value) {
  const requestedCharter = sanitizeCharterId(value);
  return hasCharterDirectory(requestedCharter) ? requestedCharter : "";
}
```

Then run `node -e "require('./server.js')"`-free sanity: `grep -n DEFAULT_ACTIVE_CHARTER server.js` must print nothing.

- [ ] **Step 3: Summaries carry nights and status; the active id follows the rule**

Replace `getActiveCharterId` with:

```js
function readStoredActiveCharterId() {
  const config = toPlainObject(readJsonFileSafe(path.join(DATA_DIR, "active-charter.json"), {}));
  return sanitizeCharterId(config.active_charter);
}

// Spec-charters §3: the charter in date today (day before start → end date), else the stored choice, else the last ended.
function getActiveCharterId() {
  return resolveActiveCharterId(activeCharterLib.activeCharterId(listCharterSummaries(), readStoredActiveCharterId(), localTodayDateValue()));
}

// The charter that is forced active by its dates today, or "".
function forcedActiveCharterId() {
  const today = localTodayDateValue();
  return activeCharterLib.activeCharterId(listCharterSummaries().filter(c => activeCharterLib.isInDate(c, today)), "", today);
}
```

In `listCharterSummaries`, change the returned object to:

```js
      const today = localTodayDateValue();
      return {
        id: entry.name,
        name: typeof charter.name === "string" && charter.name.trim() ? charter.name.trim() : formatCharterNameFromId(entry.name),
        charter,
        stops,
        nights: activeCharterLib.nights(charter),
        status: activeCharterLib.charterStatus(charter, today)
      };
```

(`listCharterSummaries` is defined after `localTodayDateValue` hoists as a function declaration, so order is fine.)

Add, next to `listCharterSummaries`, the payload the admin reads:

```js
function buildChartersPayload() {
  const charters = listCharterSummaries();
  const forced = forcedActiveCharterId();
  return {
    charters,
    active_charter: getActiveCharterId(),
    stored_active_charter: readStoredActiveCharterId(),
    forced: Boolean(forced),
    forced_charter: forced,
    today: localTodayDateValue()
  };
}
```

- [ ] **Step 4: Make active: 409 while forced, no "completed" refusal**

Replace `setActiveCharter` and delete `validateActiveCharterDateRange` entirely:

```js
function setActiveCharter(charterId) {
  const safeId = validateAdminCharterId(charterId);
  if (!safeId || !hasCharterDirectory(safeId)) {
    throw new Error("Unknown charter");
  }
  const forced = forcedActiveCharterId();
  if (forced) {
    const name = listCharterSummaries().find(c => c.id === forced)?.name || forced;
    const error = new Error(`${name} is in date and stays active until it ends.`);
    error.statusCode = 409;
    error.forced_charter = forced;
    throw error;
  }
  writeJsonFileAtomic(path.join(DATA_DIR, "active-charter.json"), { active_charter: safeId });
  ensureTrackState(safeId);
  return safeId;
}
```

In `deleteAdminCharter`, replace the `let nextActiveCharter = activeCharter; if (activeCharter === charterId) {...}` block with one that only touches the stored choice (the rule decides the rest):

```js
  if (readStoredActiveCharterId() === charterId) {
    writeJsonFileAtomic(path.join(DATA_DIR, "active-charter.json"), { active_charter: fallbackCharter || "" });
  }
  const nextActiveCharter = getActiveCharterId();
```

and keep `activeCharter` only if something else still reads it (search; delete the `const activeCharter = getActiveCharterId();` line if not).

In `createAdminCharter`, delete the `if (body.set_active === true) { setActiveCharter(charterId); }` block.

- [ ] **Step 5: Run the suite and start the scratch server**

Run: `node --test`
Expected: `# pass 92`, `# fail 0`.

Run (PowerShell, from the server repo):
```powershell
$env:DATA_DIR="$PWD\data-scratch"; $env:GUEST_STATIC_DIR='..\..\portal\iolanthe-guest'; $env:ADMIN_STATIC_DIR='..\..\portal\iolanthe-admin'; node server.js
```
Then `curl -s http://localhost:8000/api/charter | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).active_charter))'`
Expected: `csaba` (scratch data: csaba 2026-11-01..09 and larry 2026-12-01..04; today 2026-10-08 is in no window, stored = csaba). Stop the server.

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(charters): active charter follows the in-date rule; Make active refused while forced; default charter removed"
```

---

### Task 4: `server.js` — overlap check on create and `charter.json` save

**Files:**
- Modify: `server.js` (`createAdminCharter`, `saveAdminJsonFile`, `sendAdminError`, the `handleAdminApi` catch)

- [ ] **Step 1: Add the check**

Next to `buildChartersPayload` add:

```js
// Spec-charters §4. Throws 400 with {overlaps} when the candidate's dates clash with another charter or a reserved period.
function assertNoCharterOverlap(charterId, charterJson) {
  const info = toPlainObject(charterJson);
  const candidate = { id: charterId, start_date: info.start_date, end_date: info.end_date };
  const others = listCharterSummaries()
    .map(c => ({ kind: "charter", id: c.id, name: c.name, start_date: c.charter.start_date, end_date: c.charter.end_date }))
    .concat(reservedPeriodsLib.periodEntries(reservedPeriodsLib.readPeriods(DATA_DIR).periods));
  const overlaps = activeCharterLib.findOverlaps(candidate, others, "charter");
  if (overlaps.length) {
    const error = new Error(activeCharterLib.overlapMessage(overlaps));
    error.statusCode = 400;
    error.overlaps = overlaps;
    throw error;
  }
}
```

In `createAdminCharter`, after `defaults["charter.json"] = {...}` and before `fs.mkdirSync(charterDir, …)`, add:

```js
  assertNoCharterOverlap(charterId, defaults["charter.json"]);
```

In `saveAdminJsonFile`, inside `if (fileName === "charter.json") { nextData = normalizeAdminCharterData(data); }` add after the normalise line:

```js
    assertNoCharterOverlap(safeId, nextData);
```

- [ ] **Step 2: Let errors carry details**

Replace `sendAdminError`:

```js
function sendAdminError(response, statusCode, message, details) {
  sendJson(response, statusCode, { error: message, ...(details && typeof details === "object" ? details : {}) });
}
```

In the `handleAdminApi` catch block, change the last line to pass the extra fields through:

```js
    const details = {};
    ["overlaps", "forced_charter", "field", "errors", "code", "revision", "periods"].forEach(key => {
      if (error && error[key] !== undefined) details[key] = error[key];
    });
    sendAdminError(response, status, message, details);
```

- [ ] **Step 3: Verify by hand**

Run: `node --test` → `# pass 92`.
Start the scratch server (Task 3 Step 5) and log in via the admin UI, then from Git Bash with the session cookie:

```bash
BASE=http://localhost:8000; KEY=hotel; COOKIE="iolanthe_admin_session=<token from the browser>"
curl -s -b "$COOKIE" -H "Content-Type: application/json" -X POST -d '{"charter_id":"clash","name":"Clash","start_date":"2026-11-05","end_date":"2026-11-06","guest_count":2}' "$BASE/api/admin/charters/create?key=$KEY"
```
Expected: `{"error":"Overlaps New (2026-11-01 – 2026-11-09)","overlaps":[{"kind":"charter","id":"csaba",...}]}` with HTTP 400, and no `data-scratch/charters/clash` folder.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(charters): refuse overlapping charter dates on create and save; admin errors carry details"
```

---

### Task 5: `server.js` — charters payload, bootstrap fields, reserved-period routes

**Files:**
- Modify: `server.js` (`buildAdminBootstrap`, the `/api/admin/charters` handler, new handlers after the anchorages handlers)

- [ ] **Step 1: Payloads**

In `buildAdminBootstrap`'s returned object, replace

```js
    active_charter: canSeeAdminData ? getActiveCharterId() : "",
    charters: canSeeAdminData ? listCharterSummaries() : [],
```
with
```js
    ...(canSeeAdminData ? buildChartersPayload() : { active_charter: "", charters: [], stored_active_charter: "", forced: false, forced_charter: "", today: localTodayDateValue() }),
```

Replace the `/api/admin/charters` GET handler body `sendJson(response, 200, { charters: listCharterSummaries() });` with `sendJson(response, 200, buildChartersPayload());`.

- [ ] **Step 2: Reserved-period routes**

After the `/api/admin/anchorages/save` handler add:

```js
    if (pathname === "/api/admin/reserved-periods" && method === "GET") {
      if (!requireAdmin(request, response, url)) {
        return;
      }
      sendJson(response, 200, reservedPeriodsLib.readPeriods(DATA_DIR));
      return;
    }

    if (pathname === "/api/admin/reserved-periods/save" && method === "POST") {
      if (!requireAdmin(request, response, url, ROUTE_LIBRARY_ACCESS)) {
        return;
      }
      const charterEntries = listCharterSummaries()
        .map(c => ({ kind: "charter", id: c.id, name: c.name, start_date: c.charter.start_date, end_date: c.charter.end_date }));
      sendJson(response, 200, reservedPeriodsLib.savePeriods(DATA_DIR, toPlainObject(await readJsonRequestBody(request)), charterEntries));
      return;
    }
```

(`ROUTE_LIBRARY_ACCESS` is `{section: "charter", bridgeOnly: true, department: "charter"}`: Charter Admin on bridge, the same guard as `active-charter`.)

- [ ] **Step 3: Manual check script**

`scripts/check-charter-endpoints.sh`:

```bash
#!/usr/bin/env bash
# Manual verification of the charter / reserved-period endpoints against a running local server.
# Usage: BASE=http://localhost:8000 KEY=<admin urlKey> COOKIE="iolanthe_admin_session=<token>" scripts/check-charter-endpoints.sh
set -uo pipefail
fails=0
ok() { echo "   ok"; }
fail() { echo "   FAIL"; fails=$((fails+1)); }
BASE="${BASE:-http://localhost:8000}"
auth=(-s -b "$COOKIE")
json=(-H "Content-Type: application/json")
js() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s);'"$1"'})'; }

echo "1. charters payload carries active, stored, forced, today, nights, status"
curl "${auth[@]}" "$BASE/api/admin/charters?key=$KEY" | js 'if(!("stored_active_charter" in b)||!("forced" in b)||!b.today||!("nights" in b.charters[0])||!b.charters[0].status)process.exit(1)' && ok || fail

echo "2. bootstrap carries the same fields"
curl "${auth[@]}" "$BASE/api/admin/bootstrap?key=$KEY" | js 'if(!("stored_active_charter" in b)||!("forced" in b))process.exit(1)' && ok || fail

echo "3. reserved periods GET (empty or existing)"
rev=$(curl "${auth[@]}" "$BASE/api/admin/reserved-periods?key=$KEY" | js 'console.log(b.revision)')
echo "   revision $rev"

echo "4. stale revision -> 409"
curl "${auth[@]}" "${json[@]}" -X POST -d '{"periods":[],"base_revision":999999}' "$BASE/api/admin/reserved-periods/save?key=$KEY" | grep -q '"code": *"revision"' && ok || fail

echo "5. invalid period -> 400 with field"
curl "${auth[@]}" "${json[@]}" -X POST -d "{\"periods\":[{\"type\":\"party\",\"title\":\"x\",\"start_date\":\"2030-01-01\",\"end_date\":\"2030-01-02\"}],\"base_revision\":$rev}" "$BASE/api/admin/reserved-periods/save?key=$KEY" | grep -q '"field": *"periods\[0\].type"' && ok || fail

echo "6. period overlapping a charter -> 400 with overlaps"
first=$(curl "${auth[@]}" "$BASE/api/admin/charters?key=$KEY" | js 'const c=b.charters.find(x=>x.charter.start_date);console.log(c?c.charter.start_date:"")')
curl "${auth[@]}" "${json[@]}" -X POST -d "{\"periods\":[{\"type\":\"other\",\"title\":\"x\",\"start_date\":\"$first\",\"end_date\":\"$first\"}],\"base_revision\":$rev}" "$BASE/api/admin/reserved-periods/save?key=$KEY" | grep -q '"overlaps"' && ok || fail

echo "7. charter create overlapping that charter -> 400 with overlaps"
curl "${auth[@]}" "${json[@]}" -X POST -d "{\"charter_id\":\"zz-clash\",\"name\":\"Clash\",\"start_date\":\"$first\",\"end_date\":\"$first\",\"guest_count\":1}" "$BASE/api/admin/charters/create?key=$KEY" | grep -q '"overlaps"' && ok || fail

echo "8. make active while forced -> 409 (only meaningful when a charter is in date today; otherwise 200)"
curl "${auth[@]}" "${json[@]}" -o /dev/null -w "   http %{http_code}\n" -X POST -d '{"charter_id":"'"$(curl "${auth[@]}" "$BASE/api/admin/charters?key=$KEY" | js 'console.log(b.charters[0].id)')"'"}' "$BASE/api/admin/active-charter?key=$KEY"

echo "fails: $fails"; exit $fails
```

Run it against the scratch server after logging in through the admin. Expected: checks 1–7 `ok`, check 8 prints `http 200` (nothing is in date on 2026-10-08).

- [ ] **Step 4: Commit**

```bash
git add server.js scripts/check-charter-endpoints.sh
git commit -m "feat(charters): charters payload with active/stored/forced, reserved-period endpoints, check script"
```

---

### Task 6: Docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the data layout and endpoints**

In the data layout block, replace `active-charter.json          { "id": "csaba" }` with:

```
  active-charter.json          { "active_charter": "<id>" } — the crew's choice; the live active charter is computed
                               (lib/active-charter.js): the charter in date today (day before start → end date), else
                               this choice, else the most recently ended
  reserved-periods.json        { revision, periods[] } maintenance / unavailable / other spans (lib/reserved-periods.js)
```

Under the endpoints / key files sections add:

```
- `GET /api/admin/charters` → { charters[{id,name,charter,stops,nights,status}], active_charter, stored_active_charter,
  forced, forced_charter, today }; the bootstrap carries the same fields.
- `POST /api/admin/active-charter {charter_id}` → 409 {error, forced_charter} while a charter is in date.
- Charter create and `charter.json` save refuse overlapping dates: 400 {error, overlaps[]}.
- `GET /api/admin/reserved-periods`, `POST /api/admin/reserved-periods/save {periods, base_revision}` (400 / 409 like
  the route library). `scripts/check-charter-endpoints.sh` exercises them.
```

Update the tests line to `node --test` runs 92 tests.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: active-charter rule, reserved periods and the charters payload"
```

---

## Self-review against the spec

- §3 rule, steps 1–4 and the turnaround tie-break → Task 1 (fixture cases) and Task 3 (`getActiveCharterId`, `forcedActiveCharterId`).
- §3 server: 409 on make-active while forced, "completed" refusal removed, payload fields, `set_active` ignored, default removed → Task 3 and Task 5.
- §4 overlaps on create, `charter.json` save and reserved-period save, 400 with `overlaps` → Task 2 (`savePeriods`), Task 4.
- §5 file shape, validation, ids, GET / save, 409 → Task 2 and Task 5.
- §11 server tests → Tasks 1–2; endpoint checks → Task 5 script.
- §13 rollout: branch `feat/charter-gantt`; PR after Task 6; `./update.sh` on the vessel; the live admin (pre plan 2) keeps working: it still posts `set_active` (ignored) and reads `charters` / `active_charter` from the bootstrap.
