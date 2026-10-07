# Charter Itinerary Rework — Plan 1 of 5: Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `iolanthe-server` the version 2 itinerary model from spec A: one `itinerary.json` per charter holding the route and the activities, with save and apply-route endpoints, a derived planned route, a one-off migration from the old format, and weather stop selection driven by the new model.

**Architecture:** All logic lives in a new pure CommonJS module `lib/itinerary.js`, tested with `node --test`. `server.js` gains two thin POST handlers, loses the Primary/Alternative plan code and the KML upload endpoint, and registers migration v4. The public `/api/planned-route` is built from the itinerary's points and keeps the old wrapper for one release.

**Tech Stack:** Node (CommonJS, no dependencies), `node:test` + `node:assert/strict`. Repo: `S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server`. Spec: `portal/iolanthe-admin/docs/charter-rework/spec.md` (§2, §3, §7, §8).

**Honest deviation from the spec:** spec §8 asks for endpoint tests. The server has no HTTP test harness and `require("./server.js")` starts listening, so adding one is out of scope. The handlers are kept to a few lines each; the logic they call is in `lib/itinerary.js` and is unit-tested. Each handler is verified by the curl checklist in Task 13 against a local server.

**Reading before you start (10 minutes):**
- spec §2.1 (file shape and validation rules), §2.5 (migration), §3 (endpoints)
- `lib/route-library.js` lines 1-60 (helpers you will reuse: `httpError`, `readJson`, `writeJsonAtomic`) and `test/route-library.test.js` lines 1-40 (test style)
- `server.js` lines 502-577 (migrations), 7506-7560 (charter router), 4823-4922 (plan code you will delete)

Line numbers in this plan are from server.js at commit `0e68d98` and will drift as you edit. Search for the function name when a number is off.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/itinerary.js` (new) | Pure model logic: normalise, validate, derive days, apply a library route, migrate v1 → v2, build the public planned route. No file I/O. |
| `test/itinerary.test.js` (new) | Unit tests for every exported function. |
| `lib/route-library.js` (modify) | `normalizePoint` accepts the two template fields `nights` and `depart_time`. |
| `test/route-library.test.js` (modify) | One test for the template fields round-tripping through `saveRoute`. |
| `server.js` (modify) | Defaults, bundle normalisation, migration v4, the two new handlers, derived planned route, weather stop selection, removals. |
| `data-templates/schema-version.json` (modify) | Version 4. |
| `scripts/check-itinerary-endpoints.sh` (new) | The curl checklist from Task 13, runnable. |
| `CLAUDE.md` (modify) | Document the two new endpoints and the removed one. |

---

### Task 1: `lib/itinerary.js` skeleton — ids, distance, day count, normalisation

**Files:**
- Create: `lib/itinerary.js`
- Create: `test/itinerary.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/itinerary.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../lib/itinerary");

// Deterministic "random" so generated ids are stable in tests.
function seq() {
  let i = 0;
  return () => (i = (i + 7) % 36) / 36;
}

const P = (latitude, longitude, extra) => ({ latitude, longitude, ...(extra || {}) });

test("newId: prefix plus six base-36 characters", () => {
  assert.match(lib.newId("stp", seq()), /^stp_[0-9a-z]{6}$/);
  assert.match(lib.newId("act"), /^act_[0-9a-z]{6}$/);
});

test("distNm: one minute of latitude is about 1 nm", () => {
  assert.ok(Math.abs(lib.distNm(P(12, 120), P(12 + 1 / 60, 120)) - 1) < 0.01);
  assert.equal(lib.distNm(null, P(1, 1)), 0);
});

test("charterDayCount: inclusive count from charter dates, 0 when invalid", () => {
  assert.equal(lib.charterDayCount({ start_date: "2026-10-12", end_date: "2026-10-18" }), 7);
  assert.equal(lib.charterDayCount({ start_date: "2026-10-12", end_date: "2026-10-12" }), 1);
  assert.equal(lib.charterDayCount({ start_date: "2026-10-12", end_date: "2026-10-11" }), 0);
  assert.equal(lib.charterDayCount({ start_date: "", end_date: "2026-10-11" }), 0);
  assert.equal(lib.charterDayCount(null), 0);
});

test("normalizeItinerary: fills defaults and drops junk", () => {
  const out = lib.normalizeItinerary({}, seq());
  assert.deepEqual(out, {
    version: 2, revision: 0, welcome_message: "", summary: "",
    route: { source: null, speed_kn: 8, points: [] },
    activities: []
  });
});

test("normalizeItinerary: keeps stop fields, gives id-less stops an id, drops template fields", () => {
  const out = lib.normalizeItinerary({
    version: 2, revision: "3", welcome_message: " hi ", summary: 1,
    route: {
      source: { type: "library", route_id: "x" }, speed_kn: "7.5",
      points: [
        P(14.8, 120.27, { stop: true, name: "Subic", depart: { day: 1, time: "09:00" }, nights: 2, depart_time: "08:00" }),
        P(14.9, 120.2),
        P("bad", 1),
        P(14.95, 120.11, { anchorage_id: "capones", id: "stp_abc123", site_ids: ["a", "a", "", 3], arrive: { day: "1" }, depart: { day: 2, time: "25:00" }, leg_speed_kn: 99 })
      ]
    },
    activities: [
      { id: "act_1", stop_id: "stp_abc123", day: 1, order: 0, title: "Walk", notes: "", site_id: "a", time: "16:30" },
      { stop_id: "", day: 1, title: "orphan" },
      { stop_id: "stp_abc123", day: "x", title: "no day" }
    ]
  }, seq());
  assert.equal(out.revision, 3);
  assert.equal(out.welcome_message, "hi");
  assert.equal(out.summary, "");
  assert.equal(out.route.speed_kn, 7.5);
  assert.equal(out.route.points.length, 3);
  const [subic, mid, capones] = out.route.points;
  assert.match(subic.id, /^stp_/);
  assert.deepEqual(subic.depart, { day: 1, time: "09:00" });
  assert.equal(subic.nights, undefined);
  assert.equal(subic.depart_time, undefined);
  assert.deepEqual(mid, { latitude: 14.9, longitude: 120.2 });
  assert.equal(capones.id, "stp_abc123");
  assert.deepEqual(capones.site_ids, ["a"]);
  assert.deepEqual(capones.arrive, { day: 1 });
  assert.deepEqual(capones.depart, { day: 2 });
  assert.equal(capones.leg_speed_kn, undefined);
  assert.equal(out.activities.length, 1);
  assert.deepEqual(out.activities[0], { id: "act_1", stop_id: "stp_abc123", day: 1, order: 0, title: "Walk", notes: "", time: "16:30", site_id: "a" });
});

test("normalizeItinerary: keepTemplate keeps nights and depart_time on stops", () => {
  const out = lib.normalizeItinerary({ route: { points: [P(1, 1, { stop: true, nights: 2, depart_time: "08:00" })] } }, seq(), { keepTemplate: true });
  assert.equal(out.route.points[0].nights, 2);
  assert.equal(out.route.points[0].depart_time, "08:00");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from the repo root: `npm test -- test/itinerary.test.js`
Expected: FAIL with `Cannot find module '../lib/itinerary'`.

- [ ] **Step 3: Create the module**

Create `lib/itinerary.js`:

```js
"use strict";

// Pure logic for the version 2 charter itinerary (spec A: portal/iolanthe-admin/docs/charter-rework/spec.md).
// No file I/O lives here; server.js reads and writes the files and calls these functions.

const { httpError } = require("./route-library");

const ITINERARY_VERSION = 2;
const DEFAULT_SPEED_KN = 8;
const MIN_SPEED_KN = 0.5;
const MAX_SPEED_KN = 30;
const MAX_NIGHTS = 60;
const SEED_DEPART_TIME = "09:00";   // only used to estimate midnight crossings when a template stop has no depart_time
const SAME_SPOT_M = 50;              // same as routes-core.js: two stops this close are the same place
const SNAP_NM = 1;                   // migration: a stop within this of a path vertex replaces that vertex
const MAX_TITLE_LENGTH = 120;
const MAX_NOTES_LENGTH = 2000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const METRES_PER_NM = 1852;
const EARTH_RADIUS_M = 6371000;
const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

const toObj = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const toStr = (value, max) => (typeof value === "string" ? value.trim().slice(0, max || 100000) : "");
const isFiniteNum = (value) => typeof value === "number" && Number.isFinite(value);

function toRad(deg) { return (deg * Math.PI) / 180; }

function distM(a, b) {
  if (!a || !b || !isFiniteNum(a.latitude) || !isFiniteNum(a.longitude) || !isFiniteNum(b.latitude) || !isFiniteNum(b.longitude)) {
    return 0;
  }
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
const distNm = (a, b) => distM(a, b) / METRES_PER_NM;

function newId(prefix, random = Math.random) {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)];
  return `${prefix}_${suffix}`;
}

const isStop = (point) => Boolean(point && (point.anchorage_id || point.stop === true));

function parseDateOnly(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === "string" ? value.trim() : "");
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? t : null;
}

// Inclusive number of charter days from charter.json dates; 0 when the dates are missing or reversed.
function charterDayCount(charter) {
  const c = toObj(charter);
  const start = parseDateOnly(c.start_date);
  const end = parseDateOnly(c.end_date);
  if (start === null || end === null || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

// ---- normalisation -------------------------------------------------------

function cleanDayTime(value) {
  const o = toObj(value);
  const day = Number(o.day);
  if (!Number.isInteger(day) || day < 1) return null;
  const out = { day };
  if (typeof o.time === "string" && TIME_RE.test(o.time.trim())) out.time = o.time.trim();
  return out;
}

function cleanSpeed(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= MIN_SPEED_KN && n <= MAX_SPEED_KN ? n : fallback;
}

function cleanIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()))];
}

// options.keepTemplate keeps the library-route template fields (nights, depart_time) on stops.
function normalizePoint(value, random, options = {}) {
  const p = toObj(value);
  const latitude = Number(p.latitude);
  const longitude = Number(p.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const out = { latitude, longitude };
  if (typeof p.anchorage_id === "string" && p.anchorage_id.trim()) out.anchorage_id = p.anchorage_id.trim();
  if (!out.anchorage_id && p.stop === true) out.stop = true;
  if (typeof p.name === "string" && p.name.trim()) out.name = p.name.trim().slice(0, MAX_TITLE_LENGTH);
  if (typeof p.site_id === "string" && p.site_id.trim()) out.site_id = p.site_id.trim();
  const speed = cleanSpeed(p.leg_speed_kn, null);
  if (speed !== null) out.leg_speed_kn = speed;
  if (isStop(out)) {
    out.id = typeof p.id === "string" && p.id.trim() ? p.id.trim() : newId("stp", random);
    out.site_ids = cleanIdList(p.site_ids);
    const arrive = cleanDayTime(p.arrive);
    const depart = cleanDayTime(p.depart);
    if (arrive) out.arrive = arrive;
    if (depart) out.depart = depart;
    if (options.keepTemplate) {
      const nights = Number(p.nights);
      if (Number.isInteger(nights) && nights >= 0 && nights <= MAX_NIGHTS) out.nights = nights;
      if (typeof p.depart_time === "string" && TIME_RE.test(p.depart_time.trim())) out.depart_time = p.depart_time.trim();
    }
  }
  return out;
}

function normalizeActivity(value, random) {
  const a = toObj(value);
  const stopId = toStr(a.stop_id);
  const day = Number(a.day);
  if (!stopId || !Number.isInteger(day) || day < 1) return null;
  const order = Number(a.order);
  const out = {
    id: toStr(a.id) || newId("act", random),
    stop_id: stopId,
    day,
    order: Number.isInteger(order) && order >= 0 ? order : 0,
    title: toStr(a.title, MAX_TITLE_LENGTH),
    notes: toStr(a.notes, MAX_NOTES_LENGTH)
  };
  if (typeof a.time === "string" && TIME_RE.test(a.time.trim())) out.time = a.time.trim();
  const siteId = toStr(a.site_id);
  if (siteId) out.site_id = siteId;
  return out;
}

function normalizeItinerary(value, random = Math.random, options = {}) {
  const v = toObj(value);
  const route = toObj(v.route);
  const revision = Number(v.revision);
  return {
    version: ITINERARY_VERSION,
    revision: Number.isInteger(revision) && revision >= 0 ? revision : 0,
    welcome_message: toStr(v.welcome_message, MAX_NOTES_LENGTH),
    summary: toStr(v.summary, MAX_NOTES_LENGTH),
    route: {
      source: route.source && typeof route.source === "object" && !Array.isArray(route.source) ? route.source : null,
      speed_kn: cleanSpeed(route.speed_kn, DEFAULT_SPEED_KN),
      points: (Array.isArray(route.points) ? route.points : []).map((p) => normalizePoint(p, random, options)).filter(Boolean)
    },
    activities: (Array.isArray(v.activities) ? v.activities : []).map((a) => normalizeActivity(a, random)).filter(Boolean)
  };
}

module.exports = {
  ITINERARY_VERSION, DEFAULT_SPEED_KN, SAME_SPOT_M, SNAP_NM, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH,
  distM, distNm, newId, isStop, parseDateOnly, charterDayCount,
  normalizePoint, normalizeItinerary
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/itinerary.test.js`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "feat(itinerary): v2 model module - ids, distance, day count, normalisation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Stop spans and `deriveDays`

**Files:**
- Modify: `lib/itinerary.js`
- Modify: `test/itinerary.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/itinerary.test.js`:

```js
// A 7-day fixture matching the spec's worked example. Subic (origin, dep day 1) → Anawangin (lunch, day 1)
// → Capones (night 1) → Hermana (night 2) → Potipot (nights 3,4; dep day 5) → overnight passage → Hundred Is (night 6)
// → Subic (terminus, day 7).
function sevenDays() {
  return lib.normalizeItinerary({
    version: 2, revision: 4,
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
  }, seq());
}

test("stopEntries: stops with their point index", () => {
  const entries = lib.stopEntries(sevenDays().route.points);
  assert.deepEqual(entries.map((e) => [e.index, e.point.id]), [[0, "stp_subic1"], [1, "stp_anaw"], [2, "stp_capo"], [3, "stp_herm"], [4, "stp_poti"], [6, "stp_hund"], [7, "stp_subic2"]]);
});

test("stopSpan: origin from day 1, terminus to the last day, middle stops arrive..depart", () => {
  const stops = lib.stopEntries(sevenDays().route.points).map((e) => e.point);
  assert.deepEqual(lib.stopSpan(stops[0], "origin", 7), { from: 1, to: 1 });
  assert.deepEqual(lib.stopSpan(stops[1], "middle", 7), { from: 1, to: 1 });
  assert.deepEqual(lib.stopSpan(stops[4], "middle", 7), { from: 3, to: 5 });
  assert.deepEqual(lib.stopSpan(stops[6], "terminus", 7), { from: 7, to: 7 });
  assert.deepEqual(lib.stopSpan({ stop: true, depart: { day: 2 } }, "origin", 7), { from: 1, to: 2 });
  assert.deepEqual(lib.stopSpan({ stop: true, arrive: { day: 6 } }, "terminus", 7), { from: 6, to: 7 });
  assert.deepEqual(lib.stopSpan({ stop: true }, "only", 7), { from: 1, to: 7 });
});

test("deriveDays: one entry per charter day, stops in route order, activities by order", () => {
  const days = lib.deriveDays(sevenDays(), 7);
  assert.equal(days.length, 7);
  assert.deepEqual(days.map((d) => d.stops.map((s) => s.id)), [
    ["stp_subic1", "stp_anaw", "stp_capo"],
    ["stp_capo", "stp_herm"],
    ["stp_herm", "stp_poti"],
    ["stp_poti"],
    ["stp_poti"],
    ["stp_hund"],
    ["stp_hund", "stp_subic2"]
  ]);
  const capones = days[0].stops[2];
  assert.equal(capones.name, "Capones Is.");
  assert.equal(capones.nights, 1);
  assert.deepEqual(capones.activities.map((a) => a.id), ["act_2", "act_1"]);
  assert.deepEqual(days[3].stops[0].activities.map((a) => a.id), ["act_3"]);
  assert.deepEqual(days[4].stops[0].activities, []);
});

test("deriveDays: a passage day has no stops; an empty itinerary gives empty days", () => {
  const it = sevenDays();
  it.route.points[6].arrive = { day: 7 };   // Hundred Islands reached on day 7 → day 6 is at sea
  it.route.points[6].depart = { day: 7 };
  const days = lib.deriveDays(it, 7);
  assert.deepEqual(days[5].stops, []);
  assert.deepEqual(lib.deriveDays(lib.normalizeItinerary({}), 3).map((d) => d.stops), [[], [], []]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/itinerary.test.js`
Expected: FAIL with `lib.stopEntries is not a function`.

- [ ] **Step 3: Add the functions**

In `lib/itinerary.js`, insert before `module.exports`:

```js
// ---- days -----------------------------------------------------------------

function stopEntries(points) {
  return (points || []).map((point, index) => ({ point, index })).filter((e) => isStop(e.point));
}

// "origin" | "middle" | "terminus" | "only" (a route with a single stop)
function positionOf(i, count) {
  if (count === 1) return "only";
  if (i === 0) return "origin";
  return i === count - 1 ? "terminus" : "middle";
}

// The charter days a stop occupies. The origin is "there" from day 1 (guests board before departing);
// the terminus stays to the last day. Middle stops run arrive.day..depart.day.
function stopSpan(stop, position, dayCount) {
  const arriveDay = stop.arrive ? stop.arrive.day : 1;
  const departDay = stop.depart ? stop.depart.day : (dayCount || arriveDay);
  const from = position === "origin" || position === "only" ? 1 : arriveDay;
  const to = position === "terminus" || position === "only" ? Math.max(dayCount || departDay, arriveDay) : departDay;
  return { from, to: Math.max(from, to) };
}

// Takes a NORMALISED itinerary. Returns [{ day, stops: [{ id, index, name, arrive, depart, nights, activities }] }].
function deriveDays(itinerary, dayCount) {
  const stops = stopEntries(toObj(toObj(itinerary).route).points);
  const activities = [...(Array.isArray(toObj(itinerary).activities) ? itinerary.activities : [])].sort((a, b) => a.order - b.order);
  const days = [];
  for (let day = 1; day <= dayCount; day += 1) {
    const dayStops = [];
    stops.forEach((entry, i) => {
      const span = stopSpan(entry.point, positionOf(i, stops.length), dayCount);
      if (day < span.from || day > span.to) return;
      const p = entry.point;
      dayStops.push({
        id: p.id,
        index: entry.index,
        name: p.name || `Stop ${i + 1}`,
        arrive: p.arrive || null,
        depart: p.depart || null,
        nights: p.arrive && p.depart ? p.depart.day - p.arrive.day : 0,
        activities: activities.filter((a) => a.stop_id === p.id && a.day === day)
      });
    });
    days.push({ day, stops: dayStops });
  }
  return days;
}
```

Change the export block to:

```js
module.exports = {
  ITINERARY_VERSION, DEFAULT_SPEED_KN, SAME_SPOT_M, SNAP_NM, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH,
  distM, distNm, newId, isStop, parseDateOnly, charterDayCount,
  normalizePoint, normalizeItinerary,
  stopEntries, positionOf, stopSpan, deriveDays
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/itinerary.test.js`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "feat(itinerary): stop spans and deriveDays

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `validateItinerary`

**Files:**
- Modify: `lib/itinerary.js`
- Modify: `test/itinerary.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/itinerary.test.js`:

```js
test("validateItinerary: the fixture is valid", () => {
  assert.deepEqual(lib.validateItinerary(sevenDays(), 7), []);
});

test("validateItinerary: each rule produces one error with a field path", () => {
  const messages = (it, dayCount = 7) => lib.validateItinerary(it, dayCount).map((e) => e.field);

  const v = sevenDays(); v.version = 1;
  assert.deepEqual(messages(v), ["version"]);

  const dup = sevenDays(); dup.route.points[3].id = "stp_capo";
  assert.deepEqual(messages(dup), ["route.points[3].id"]);

  const originArr = sevenDays(); originArr.route.points[0].arrive = { day: 1 };
  assert.deepEqual(messages(originArr), ["route.points[0].arrive"]);

  const noArr = sevenDays(); delete noArr.route.points[3].arrive;
  assert.deepEqual(messages(noArr), ["route.points[3].arrive"]);

  const termDep = sevenDays(); termDep.route.points[7].depart = { day: 7 };
  assert.deepEqual(messages(termDep), ["route.points[7].depart"]);

  const noDep = sevenDays(); delete noDep.route.points[3].depart;
  assert.deepEqual(messages(noDep), ["route.points[3].depart"]);

  const backwards = sevenDays(); backwards.route.points[4].depart = { day: 2 };
  // depart before arrive; the span collapses to day 3, so the day-4 Kayaks activity is now outside it too
  assert.deepEqual(messages(backwards), ["route.points[4].depart", "activities[2].day"]);

  const tooLate = sevenDays(); tooLate.route.points[7].arrive = { day: 8 };
  assert.deepEqual(messages(tooLate), ["route.points[7].arrive.day"]);

  const overlap = sevenDays(); overlap.route.points[3].arrive = { day: 1 };  // Hermana reached before Capones leaves (day 2)
  assert.deepEqual(messages(overlap), ["route.points[3].arrive"]);

  const noDates = sevenDays();
  assert.deepEqual(messages(noDates, 0), ["route.points"]);

  const orphan = sevenDays(); orphan.activities[0].stop_id = "stp_nope";
  assert.deepEqual(messages(orphan), ["activities[0].stop_id"]);

  const offDay = sevenDays(); offDay.activities[2].day = 6;   // Kayaks at Potipot on day 6, span is 3–5
  assert.deepEqual(messages(offDay), ["activities[2].day"]);

  const untitled = sevenDays(); untitled.activities[0].title = "";
  assert.deepEqual(messages(untitled), ["activities[0].title"]);

  const unserved = sevenDays(); unserved.activities[1].site_id = "elsewhere";
  assert.deepEqual(messages(unserved), ["activities[1].site_id"]);
});

test("validateItinerary: a single-stop route needs neither arrive nor depart", () => {
  const it = lib.normalizeItinerary({ version: 2, route: { points: [P(1, 1, { stop: true, id: "stp_only" })] } });
  assert.deepEqual(lib.validateItinerary(it, 3), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/itinerary.test.js`
Expected: FAIL with `lib.validateItinerary is not a function`.

- [ ] **Step 3: Add the function**

Insert before `module.exports`:

```js
// ---- validation -----------------------------------------------------------

// Returns [] when valid, else [{ field, message }] in document order. Spec §2.1 "Validation rules".
function validateItinerary(itinerary, dayCount) {
  const errors = [];
  const push = (field, message) => errors.push({ field, message });
  const it = toObj(itinerary);
  if (it.version !== ITINERARY_VERSION) push("version", "Itinerary version must be 2.");

  const points = Array.isArray(toObj(it.route).points) ? it.route.points : [];
  const stops = stopEntries(points);
  const ids = new Set();
  stops.forEach((entry, i) => {
    const p = entry.point;
    const field = `route.points[${entry.index}]`;
    const label = p.name || `stop ${i + 1}`;
    if (!p.id) push(`${field}.id`, "Every stop needs an id.");
    else if (ids.has(p.id)) push(`${field}.id`, `Stop id ${p.id} is used twice.`);
    ids.add(p.id);
    const isFirst = i === 0;
    const isLast = i === stops.length - 1;
    if (isFirst && p.arrive) push(`${field}.arrive`, "The first stop is the origin and has no arrival.");
    if (!isFirst && !p.arrive) push(`${field}.arrive`, `${label} needs an arrival day.`);
    if (isLast && p.depart) push(`${field}.depart`, "The last stop is the terminus and has no departure.");
    if (!isLast && !p.depart) push(`${field}.depart`, `${label} needs a departure day.`);
    if (p.arrive && p.depart && p.arrive.day > p.depart.day) push(`${field}.depart`, `${label} departs before it arrives.`);
    if (p.arrive && dayCount && p.arrive.day > dayCount) push(`${field}.arrive.day`, `Day ${p.arrive.day} is after the charter's last day (${dayCount}).`);
    if (p.depart && dayCount && p.depart.day > dayCount) push(`${field}.depart.day`, `Day ${p.depart.day} is after the charter's last day (${dayCount}).`);
    const prev = stops[i - 1];
    if (prev && prev.point.depart && p.arrive && prev.point.depart.day > p.arrive.day) {
      push(`${field}.arrive`, `${label} is reached before ${prev.point.name || "the previous stop"} leaves.`);
    }
  });
  if (stops.length && !dayCount) push("route.points", "Set the charter's start and end dates first.");

  // First occurrence wins, so a duplicated id reports once (above) instead of also failing that stop's activities.
  const byId = new Map();
  stops.forEach((e, i) => {
    if (!byId.has(e.point.id)) byId.set(e.point.id, { point: e.point, span: stopSpan(e.point, positionOf(i, stops.length), dayCount) });
  });
  (Array.isArray(it.activities) ? it.activities : []).forEach((a, i) => {
    const field = `activities[${i}]`;
    const name = a.title || a.id || `activity ${i + 1}`;
    const stop = byId.get(a.stop_id);
    if (!stop) { push(`${field}.stop_id`, `Activity "${name}" points at a stop that does not exist.`); return; }
    if (a.day < stop.span.from || a.day > stop.span.to) {
      push(`${field}.day`, `Activity "${name}" is on day ${a.day}, outside ${stop.point.name || "its stop"}'s days ${stop.span.from}–${stop.span.to}.`);
    }
    if (!a.title) push(`${field}.title`, "An activity needs a title.");
    if (a.site_id && !(stop.point.site_ids || []).includes(a.site_id)) {
      push(`${field}.site_id`, `${stop.point.name || "That stop"} does not serve site ${a.site_id}.`);
    }
  });
  return errors;
}
```

Add `validateItinerary` to the export block (after `deriveDays`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/itinerary.test.js`
Expected: `# pass 13`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "feat(itinerary): validateItinerary with field paths

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `applyRoute` — splice a library route in from a day

**Files:**
- Modify: `lib/itinerary.js`
- Modify: `test/itinerary.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/itinerary.test.js`:

```js
// A library route: Subic → Capones (1 night) → Potipot (2 nights, dep 18:00) → Hundred Islands (1 night) → Subic.
function northLoop() {
  return {
    id: "north-loop", name: "7-day north loop", revision: 4, speed_kn: 8,
    points: [
      P(14.80, 120.27, { stop: true, name: "Subic Bay", depart_time: "09:00" }),
      P(14.95, 120.11, { anchorage_id: "capones", name: "Capones Is.", site_ids: ["capones-lh"] }),
      P(15.60, 119.90, { anchorage_id: "potipot", name: "Potipot", site_ids: ["potipot-beach", "sandbar"], nights: 2, depart_time: "18:00" }),
      P(16.10, 120.00),
      P(16.60, 120.10, { anchorage_id: "hundred", name: "Hundred Islands", site_ids: ["governors"] }),   // ~61 nm from Potipot: 18:00 + 7.7 h crosses midnight
      P(14.80, 120.27, { stop: true, name: "Subic Bay" })
    ]
  };
}
const siteTitles = { "capones-lh": "Capones lighthouse", "potipot-beach": "Potipot beach", sandbar: "Sandbar", governors: "Governor's Island" };
const opts = () => ({ random: seq(), now: "2026-10-07T10:00:00Z", siteTitle: (id) => siteTitles[id] });

test("legHours: distance of the leg at the leg's own speed, else the route speed", () => {
  const pts = [P(12, 120, { stop: true, leg_speed_kn: 4 }), P(12 + 1 / 60, 120), P(12 + 2 / 60, 120, { stop: true })];
  assert.ok(Math.abs(lib.legHours(pts, 0, 2, 8) - 0.5) < 0.01);   // 2 nm at 4 kn
  delete pts[0].leg_speed_kn;
  assert.ok(Math.abs(lib.legHours(pts, 0, 2, 8) - 0.25) < 0.01);  // 2 nm at 8 kn
});

test("extraDaysForLeg: counts midnights crossed", () => {
  assert.equal(lib.extraDaysForLeg("09:00", 3), 0);
  assert.equal(lib.extraDaysForLeg("18:00", 14.5), 1);
  assert.equal(lib.extraDaysForLeg(undefined, 16), 1);   // default 09:00 + 16h = 01:00 next day
  assert.equal(lib.extraDaysForLeg("23:00", 26), 2);
});

test("applyRoute from day 1 onto an empty itinerary: seeds days, times, activities and source", () => {
  const out = lib.applyRoute(lib.normalizeItinerary({}), northLoop(), 1, 7, opts());
  const stops = lib.stopEntries(out.route.points).map((e) => e.point);
  assert.equal(stops.length, 5);
  assert.deepEqual(stops.map((s) => [s.arrive && s.arrive.day, s.depart && s.depart.day]), [
    [undefined, 1],   // Subic origin, depart day 1 (nights default 0 for a plain stop)
    [1, 2],           // Capones, 1 night (anchorage default)
    [2, 4],           // Potipot, 2 nights
    [5, 6],           // Hundred Islands: 18:00 departure + long leg crosses midnight → arrive day 5, 1 night
    [6, undefined]    // Subic terminus
  ]);
  assert.deepEqual(stops[0].depart, { day: 1, time: "09:00" });
  assert.deepEqual(stops[2].depart, { day: 4, time: "18:00" });
  stops.forEach((s) => { assert.match(s.id, /^stp_/); assert.equal(s.nights, undefined); assert.equal(s.depart_time, undefined); });
  assert.deepEqual(out.activities.map((a) => [a.stop_id === stops[1].id ? "capones" : a.stop_id === stops[2].id ? "potipot" : "hundred", a.day, a.order, a.title, a.site_id]), [
    ["capones", 1, 0, "Capones lighthouse", "capones-lh"],
    ["potipot", 2, 0, "Potipot beach", "potipot-beach"],
    ["potipot", 2, 1, "Sandbar", "sandbar"],
    ["hundred", 5, 0, "Governor's Island", "governors"]
  ]);
  assert.deepEqual(out.route.source, { type: "library", route_id: "north-loop", route_name: "7-day north loop", revision: 4, applied_at: "2026-10-07T10:00:00Z" });
  assert.equal(out.route.speed_kn, 8);
  assert.deepEqual(lib.validateItinerary(out, 7), []);
});

test("applyRoute mid-charter keeps reached stops, closes the current one on from-day, drops later activities", () => {
  const base = sevenDays();   // at Potipot on day 4 (arrive 3, depart 5); switching from day 4
  const south = { id: "south", name: "Weather fallback south", revision: 1, speed_kn: 8, points: [
    P(15.60, 119.90, { anchorage_id: "potipot", name: "Potipot", site_ids: ["sandbar"] }),  // same spot as the stop we are at → merges
    P(14.95, 120.11, { anchorage_id: "capones", name: "Capones Is.", site_ids: ["capones-lh"], nights: 1 }),
    P(14.80, 120.27, { stop: true, name: "Subic Bay" })
  ] };
  const out = lib.applyRoute(base, south, 4, 7, opts());
  const stops = lib.stopEntries(out.route.points).map((e) => e.point);
  assert.deepEqual(stops.map((s) => s.name), ["Subic Bay", "Anawangin", "Capones Is.", "Hermana Mayor", "Potipot", "Capones Is.", "Subic Bay"]);
  const potipot = stops[4];
  assert.equal(potipot.id, "stp_poti");                       // kept stop keeps its id
  assert.deepEqual(potipot.depart, { day: 4, time: "18:00" }); // closed on the from-day, time kept
  assert.deepEqual(potipot.site_ids, ["potipot-beach", "sandbar"]);
  assert.deepEqual(stops[5].arrive, { day: 4 });              // ~41 nm at 8 kn from 18:00 lands 23:06, same day
  assert.deepEqual(stops[5].depart, { day: 5 });              // nights: 1
  assert.deepEqual(stops[6].arrive, { day: 5 });
  assert.equal(stops[6].depart, undefined);
  assert.ok(out.activities.some((a) => a.id === "act_4"));    // Potipot day 3 kept
  assert.ok(out.activities.some((a) => a.id === "act_3"));    // Potipot day 4 kept (4 ≤ new depart day 4)
  assert.ok(out.activities.some((a) => a.id === "act_1"));    // Capones day 1 kept
  assert.equal(out.route.source.type, undefined);             // base had no source...
  assert.deepEqual(out.route.source.last_applied, { route_id: "south", route_name: "Weather fallback south", revision: 1, applied_at: "2026-10-07T10:00:00Z", from_day: 4 });
  assert.deepEqual(lib.validateItinerary(out, 7), []);
});

test("applyRoute refuses a route that does not fit the remaining days", () => {
  assert.throws(() => lib.applyRoute(sevenDays(), northLoop(), 5, 7, opts()), (error) => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "too-long");
    assert.equal(error.remaining_days, 3);
    assert.ok(error.needed_days > 3);
    return true;
  });
});

test("applyRoute refuses a route with no stops and a bad from-day", () => {
  assert.throws(() => lib.applyRoute(sevenDays(), { id: "x", name: "x", points: [P(1, 1), P(2, 2)] }, 1, 7, opts()), /has no stops/);
  assert.throws(() => lib.applyRoute(sevenDays(), northLoop(), 0, 7, opts()), /between 1 and 7/);
  assert.throws(() => lib.applyRoute(sevenDays(), northLoop(), 8, 7, opts()), /between 1 and 7/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/itinerary.test.js`
Expected: FAIL with `lib.legHours is not a function`.

- [ ] **Step 3: Add the functions**

Insert before `module.exports`:

```js
// ---- applying a library route ---------------------------------------------

function legHours(points, fromIndex, toIndex, routeSpeed) {
  let nm = 0;
  for (let i = fromIndex; i < toIndex; i += 1) nm += distNm(points[i], points[i + 1]);
  const speed = cleanSpeed(points[fromIndex] && points[fromIndex].leg_speed_kn, routeSpeed);
  return speed > 0 ? nm / speed : 0;
}

function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// How many midnights a leg of `hours` crosses when it starts at departTime (default 09:00).
function extraDaysForLeg(departTime, hours) {
  const start = TIME_RE.test(departTime || "") ? departTime : SEED_DEPART_TIME;
  return Math.floor((timeToMinutes(start) + hours * 60) / 1440);
}

const defaultNights = (point) => (point.anchorage_id ? 1 : 0);

// Spec §3.2. `itinerary` is the stored v2 file; `libraryRoute` is a routes.json entry; `fromDay` is 1..dayCount.
// options: { random, now, siteTitle(id) → string }. Throws httpError 400/409.
function applyRoute(itinerary, libraryRoute, fromDay, dayCount, options = {}) {
  const random = options.random || Math.random;
  const now = options.now || new Date().toISOString();
  const siteTitle = options.siteTitle || ((id) => id);
  const base = normalizeItinerary(itinerary, random);
  const lib = toObj(libraryRoute);
  const libPoints = (Array.isArray(lib.points) ? lib.points : []).map((p) => normalizePoint(p, random, { keepTemplate: true })).filter(Boolean);
  if (!stopEntries(libPoints).length) throw httpError(400, `Route "${lib.name || lib.id || "?"}" has no stops.`);
  if (!Number.isInteger(fromDay) || fromDay < 1 || fromDay > dayCount) throw httpError(400, `From day must be between 1 and ${dayCount}.`);

  // 1. Keep every stop already reached before fromDay, and the path up to the last of them.
  const stops = stopEntries(base.route.points);
  const keptStops = stops.filter((e, i) => stopSpan(e.point, positionOf(i, stops.length), dayCount).from < fromDay);
  let points = keptStops.length ? base.route.points.slice(0, keptStops[keptStops.length - 1].index + 1) : [];
  const keptIds = new Set(keptStops.map((e) => e.point.id));
  let activities = base.activities.filter((a) => keptIds.has(a.stop_id));
  let prev = null;
  if (points.length) {
    const lastIndex = points.length - 1;
    const last = { ...points[lastIndex] };
    if (!last.depart || last.depart.day >= fromDay) last.depart = { ...(last.depart || {}), day: fromDay };
    points[lastIndex] = last;
    activities = activities.filter((a) => a.stop_id !== last.id || a.day <= last.depart.day);
    prev = { index: lastIndex, point: last };
  }

  // 2. Append the library route. If its first stop is where we already are, merge it into the kept stop.
  const appended = [...libPoints];
  if (prev && isStop(appended[0]) && distM(prev.point, appended[0]) < SAME_SPOT_M) {
    const merged = { ...prev.point, site_ids: [...new Set([...(prev.point.site_ids || []), ...(appended[0].site_ids || [])])] };
    points[prev.index] = merged;
    prev = { index: prev.index, point: merged };
    appended.shift();
  }
  const speedKn = keptStops.length ? base.route.speed_kn : cleanSpeed(lib.speed_kn, DEFAULT_SPEED_KN);
  const startIndex = points.length;
  points = points.concat(appended.map((p) => {
    if (!isStop(p)) return p;
    const { nights, depart_time, arrive, depart, ...rest } = p;
    return { ...rest, id: newId("stp", random) };
  }));

  // 3. Seed arrival and departure days.
  const newStops = stopEntries(points).filter((e) => e.index >= startIndex);
  newStops.forEach((entry, i) => {
    const template = appended[entry.index - startIndex];
    const nights = Number.isInteger(template.nights) ? template.nights : defaultNights(template);
    const point = { ...entry.point };
    const isLast = i === newStops.length - 1;
    if (!prev) {
      point.depart = { day: 1 + nights };
    } else {
      const hours = legHours(points, prev.index, entry.index, speedKn);
      const arriveDay = prev.point.depart.day + extraDaysForLeg(prev.point.depart.time, hours);
      point.arrive = { day: arriveDay };
      point.depart = { day: arriveDay + nights };
    }
    if (template.depart_time) point.depart.time = template.depart_time;
    if (isLast) delete point.depart;
    points[entry.index] = point;
    prev = { index: entry.index, point };
  });

  const terminus = newStops.length ? points[newStops[newStops.length - 1].index] : null;
  const lastDay = terminus ? (terminus.arrive ? terminus.arrive.day : (terminus.depart ? terminus.depart.day : 1)) : 0;
  if (lastDay > dayCount) {
    const error = httpError(409, `This route needs ${lastDay - fromDay + 1} days but only ${dayCount - fromDay + 1} remain.`);
    error.code = "too-long";
    error.needed_days = lastDay - fromDay + 1;
    error.remaining_days = dayCount - fromDay + 1;
    throw error;
  }

  // 4. Seed one site activity per served site, on the stop's arrival day.
  newStops.forEach((entry) => {
    const p = points[entry.index];
    const day = p.arrive ? p.arrive.day : (p.depart ? p.depart.day : 1);
    (p.site_ids || []).forEach((siteId, order) => {
      activities.push({ id: newId("act", random), stop_id: p.id, day, order, title: toStr(siteTitle(siteId), MAX_TITLE_LENGTH) || siteId, notes: "", site_id: siteId });
    });
  });

  // 5. Source.
  const applied = { route_id: lib.id, route_name: lib.name, revision: lib.revision, applied_at: now };
  const source = keptStops.length
    ? { ...(base.route.source || {}), last_applied: { ...applied, from_day: fromDay } }
    : { type: "library", ...applied };
  return { ...base, route: { source, speed_kn: speedKn, points }, activities };
}
```

Add `legHours, extraDaysForLeg, applyRoute` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/itinerary.test.js`
Expected: `# pass 19`, `# fail 0`. If a midnight assertion disagrees with the real haversine distance of a fixture leg, adjust the fixture coordinates, not the function. The rule the tests encode: Potipot → Hundred Islands in `northLoop` is about 61 nm, so at 8 kn from 18:00 it lands after midnight; Potipot → Capones in the `south` route is about 41 nm, so it lands before midnight.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "feat(itinerary): applyRoute splices a library route in from a day

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `migrateItineraryV1` and path snapping

**Files:**
- Modify: `lib/itinerary.js`
- Modify: `test/itinerary.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/itinerary.test.js`:

```js
const sites = new Map([
  ["subic", { id: "subic", title: "Subic Bay Yacht Club", latitude: 14.80, longitude: 120.27 }],
  ["capones", { id: "capones", title: "Capones Island", latitude: 14.95, longitude: 120.11 }],
  ["capones-lh", { id: "capones-lh", title: "Capones lighthouse", latitude: 14.951, longitude: 120.112 }],
  ["potipot", { id: "potipot", title: "Potipot Island", latitude: 15.60, longitude: 119.90 }]
]);

function v1Fixture() {
  return {
    summary: "North loop",
    welcome_message: "",
    days: [],
    alternative_days: [],
    active_plan_by_day: { "3": "alternative" },
    plans: {
      primary: { welcome_message: "Welcome aboard", days: [
        { id: "day-001", day: 1, site_id: "subic", title_override: "Subic Bay", notes: "Board at 0900\nSafety brief on the aft deck", stops: [] },
        { id: "day-002", day: 2, site_id: "capones", notes: "", stops: [{ site_id: "capones-lh", notes: "Walk up before sunset" }] },
        { id: "day-003", day: 3, site_id: "potipot", notes: "Beach day", stops: [] },
        { id: "day-004", day: 4, site_id: "potipot", notes: "", stops: [] },
        { id: "day-005", day: 5, notes: "Passage south", stops: [] },
        { id: "day-006", day: 6, site_id: "subic", notes: "", stops: [] }
      ] },
      alternative: { welcome_message: "Plan B", days: [{ id: "alt-day-001", day: 1, site_id: "capones", notes: "", stops: [] }] }
    }
  };
}
const v1Charter = { start_date: "2026-03-01", end_date: "2026-03-06" };

test("migrateItineraryV1: consecutive same-site days collapse into stops with nights; notes and stops become activities", () => {
  const out = lib.migrateItineraryV1(v1Fixture(), v1Charter, null, sites, { random: seq(), today: "2026-02-01" });
  assert.equal(out.version, 2);
  assert.equal(out.revision, 1);
  assert.equal(out.welcome_message, "Welcome aboard");
  assert.equal(out.summary, "North loop");
  assert.deepEqual(out.route.source, { type: "charter-v1", plan: "primary" });
  const stops = lib.stopEntries(out.route.points).map((e) => e.point);
  assert.deepEqual(stops.map((s) => [s.name, s.arrive && s.arrive.day, s.depart && s.depart.day, s.site_ids]), [
    ["Subic Bay", undefined, 2, ["subic"]],
    ["Capones Island", 2, 3, ["capones", "capones-lh"]],
    ["Potipot Island", 3, 6, ["potipot"]],       // days 3,4 at Potipot, day 5 passage notes extend it, leave day 6
    ["Subic Bay Yacht Club", 6, undefined, ["subic"]]
  ]);
  const byTitle = Object.fromEntries(out.activities.map((a) => [a.title, a]));
  assert.deepEqual([byTitle["Board at 0900"].day, byTitle["Board at 0900"].notes, byTitle["Board at 0900"].site_id], [1, "Safety brief on the aft deck", undefined]);
  assert.deepEqual([byTitle["Capones lighthouse"].day, byTitle["Capones lighthouse"].site_id, byTitle["Capones lighthouse"].notes], [2, "capones-lh", "Walk up before sunset"]);
  assert.equal(byTitle["Beach day"].day, 3);
  assert.equal(byTitle["Passage south"].day, 5);
  assert.equal(byTitle["Passage south"].stop_id, stops[2].id);
  assert.deepEqual(lib.validateItinerary(out, 6), []);
});

test("migrateItineraryV1: a finished charter uses the plan guests saw on its last mapped day", () => {
  const out = lib.migrateItineraryV1(v1Fixture(), v1Charter, null, sites, { random: seq(), today: "2026-04-01" });
  assert.deepEqual(out.route.source, { type: "charter-v1", plan: "alternative" });
  assert.equal(out.welcome_message, "Plan B");
  assert.equal(lib.stopEntries(out.route.points).length, 1);
});

test("migrateItineraryV1: without a planned route, legs are straight (points are just the stops)", () => {
  const out = lib.migrateItineraryV1(v1Fixture(), v1Charter, null, sites, { random: seq(), today: "2026-02-01" });
  assert.equal(out.route.points.length, 4);
});

test("snapStopsToPath: stops near a vertex replace it, far stops are inserted, order is kept", () => {
  const stopA = { latitude: 14.80, longitude: 120.27, stop: true, id: "a" };
  const stopB = { latitude: 15.60, longitude: 119.90, stop: true, id: "b" };
  const path = [P(14.80, 120.27), P(15.0, 120.1), P(15.3, 119.95), P(15.601, 119.90)];
  const out = lib.snapStopsToPath([stopA, stopB], path);
  assert.equal(out.length, 4);
  assert.equal(out[0].id, "a");
  assert.equal(out[3].id, "b");
  assert.equal(out[3].latitude, 15.60);
  const far = { latitude: 15.15, longitude: 120.4, stop: true, id: "c" };   // off the path, inserted on its nearest segment
  const withFar = lib.snapStopsToPath([stopA, far, stopB], path);
  assert.equal(withFar.length, 5);
  assert.deepEqual(withFar.filter(lib.isStop).map((s) => s.id), ["a", "c", "b"]);
});

test("snapStopsToPath: falls back to straight legs when the path would reorder the stops", () => {
  const stopA = { latitude: 14.80, longitude: 120.27, stop: true, id: "a" };
  const stopB = { latitude: 15.60, longitude: 119.90, stop: true, id: "b" };
  const reversed = [P(15.60, 119.90), P(15.0, 120.1), P(14.80, 120.27)];
  assert.deepEqual(lib.snapStopsToPath([stopA, stopB], reversed).map((p) => p.id), ["a", "b"]);
});

test("migrateItineraryV1: with a planned route, the path is used and stops snap onto it", () => {
  const planned = { route: { primary: { source: { type: "kml" }, routes: [{ coordinates: [
    { latitude: 14.80, longitude: 120.27 }, { latitude: 14.90, longitude: 120.15 }, { latitude: 14.95, longitude: 120.11 },
    { latitude: 15.30, longitude: 119.95 }, { latitude: 15.60, longitude: 119.90 }, { latitude: 15.2, longitude: 120.1 }, { latitude: 14.80, longitude: 120.27 }
  ] }] } } };
  const out = lib.migrateItineraryV1(v1Fixture(), v1Charter, planned, sites, { random: seq(), today: "2026-02-01" });
  assert.equal(out.route.points.length, 7);
  assert.deepEqual(out.route.points.filter(lib.isStop).map((p) => p.name), ["Subic Bay", "Capones Island", "Potipot Island", "Subic Bay Yacht Club"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/itinerary.test.js`
Expected: FAIL with `lib.migrateItineraryV1 is not a function`.

- [ ] **Step 3: Add the functions**

Insert before `module.exports`:

```js
// ---- migration v1 → v2 (spec §2.5) -----------------------------------------

function v1DayNumber(day, index) {
  const d = toObj(day);
  const n = [d.charter_day, d.order, d.day].map(Number).find((x) => Number.isInteger(x) && x > 0);
  return n || index + 1;
}

function v1PlanDays(v1, plan) {
  const fromPlans = toObj(toObj(v1.plans)[plan]).days;
  if (Array.isArray(fromPlans) && fromPlans.length) return fromPlans;
  const legacy = plan === "alternative" ? v1.alternative_days : v1.days;
  return Array.isArray(legacy) ? legacy : [];
}

// A finished charter migrates the plan guests saw on the last mapped day; anything else migrates Primary.
function v1PlanToMigrate(v1, charter, today) {
  const end = parseDateOnly(toObj(charter).end_date);
  const todayMs = parseDateOnly(today);
  if (end === null || todayMs === null || end >= todayMs) return "primary";
  const map = toObj(v1.active_plan_by_day);
  const numbers = Object.keys(map).map(Number).filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => b - a);
  return numbers.length && String(map[String(numbers[0])]).toLowerCase() === "alternative" ? "alternative" : "primary";
}

function v1PathCoordinates(plannedRoute, plan) {
  const store = toObj(plannedRoute);
  const planData = toObj(toObj(store.route)[plan]);
  let routes = Array.isArray(planData.routes) ? planData.routes : [];
  if (!routes.length && plan === "primary" && Array.isArray(store.routes)) routes = store.routes;
  const coords = [];
  routes.forEach((r) => (Array.isArray(toObj(r).coordinates) ? r.coordinates : []).forEach((c) => {
    const p = normalizePoint(c);
    if (p) coords.push({ latitude: p.latitude, longitude: p.longitude });
  }));
  return coords;
}

function firstLine(text) {
  const t = toStr(text);
  const nl = t.indexOf("\n");
  return (nl === -1 ? t : t.slice(0, nl)).trim();
}
function restLines(text) {
  const t = toStr(text);
  const nl = t.indexOf("\n");
  return nl === -1 ? "" : t.slice(nl + 1).trim();
}

// Nearest vertex that is not already a stop (a route that returns to its origin has two stops at one position).
function nearestVertexIndex(path, pos) {
  let index = -1;
  let nm = Infinity;
  path.forEach((p, i) => {
    if (isStop(p)) return;
    const d = distNm(p, pos);
    if (d < nm) { nm = d; index = i; }
  });
  return { index, nm };
}

// Index to insert `pos` at so it lands on the segment whose midpoint is closest. Good enough for 1 nm snaps.
function nearestSegmentInsertIndex(path, pos) {
  let best = 1;
  let bestNm = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const mid = { latitude: (path[i].latitude + path[i + 1].latitude) / 2, longitude: (path[i].longitude + path[i + 1].longitude) / 2 };
    const nm = distNm(mid, pos);
    if (nm < bestNm) { bestNm = nm; best = i + 1; }
  }
  return best;
}

// Lays the stops onto an existing polyline. A stop within SNAP_NM of a vertex replaces it; otherwise it is inserted
// on its nearest segment. If that would change the stops' order, the path is abandoned for straight legs.
function snapStopsToPath(stops, path) {
  if (!Array.isArray(path) || path.length < 2 || !stops.length) return stops.map((s) => ({ ...s }));
  const points = path.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  for (const stop of stops) {
    const { index, nm } = nearestVertexIndex(points, stop);
    if (index >= 0 && nm <= SNAP_NM) points[index] = { ...stop };
    else points.splice(nearestSegmentInsertIndex(points, stop), 0, { ...stop });
  }
  const order = stops.map((s) => points.findIndex((p) => p.id === s.id));
  const inOrder = order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]));
  return inOrder ? points : stops.map((s) => ({ ...s }));
}

// v1Input: the old itinerary.json; charter: charter.json; plannedRoute: old planned-route.json or null;
// sitesById: Map of site id → site. options: { random, today: "YYYY-MM-DD" }.
function migrateItineraryV1(v1Input, charter, plannedRoute, sitesById, options = {}) {
  const random = options.random || Math.random;
  const today = options.today || new Date().toISOString().slice(0, 10);
  const v1 = toObj(v1Input);
  const sites = sitesById instanceof Map ? sitesById : new Map();
  const plan = v1PlanToMigrate(v1, charter, today);
  const dayCount = charterDayCount(charter);
  const rawDays = v1PlanDays(v1, plan).map((d, i) => ({ day: toObj(d), number: v1DayNumber(d, i) })).sort((a, b) => a.number - b.number);
  const siteOf = (id) => {
    const site = typeof id === "string" && id.trim() ? sites.get(id.trim()) : undefined;
    return site && Number.isFinite(Number(site.latitude)) && Number.isFinite(Number(site.longitude)) ? site : undefined;
  };

  const stops = [];
  const activities = [];
  let current = null;

  const addActivities = (stop, day, dayNumber) => {
    let order = activities.filter((a) => a.stop_id === stop.id && a.day === dayNumber).length;
    if (toStr(day.notes)) {
      activities.push({ id: newId("act", random), stop_id: stop.id, day: dayNumber, order: order++, title: firstLine(day.notes).slice(0, MAX_TITLE_LENGTH) || "Notes", notes: restLines(day.notes).slice(0, MAX_NOTES_LENGTH) });
    }
    (Array.isArray(day.stops) ? day.stops : []).forEach((s) => {
      const st = toObj(s);
      const siteId = toStr(st.site_id);
      if (!siteId) return;
      const site = sites.get(siteId);
      if (!stop.site_ids.includes(siteId)) stop.site_ids.push(siteId);
      activities.push({ id: newId("act", random), stop_id: stop.id, day: dayNumber, order: order++, title: toStr(site && site.title, MAX_TITLE_LENGTH) || siteId, notes: toStr(st.notes || st.note, MAX_NOTES_LENGTH), site_id: siteId });
    });
  };

  rawDays.forEach(({ day, number }) => {
    const dayNumber = dayCount ? Math.min(Math.max(number, 1), dayCount) : number;
    const candidates = [day.site_id, ...(Array.isArray(day.stops) ? day.stops.map((s) => toObj(s).site_id) : [])].map(toStr);
    const siteId = candidates.find((id) => id && siteOf(id));
    const hasContent = Boolean(toStr(day.notes)) || (Array.isArray(day.stops) && day.stops.length > 0);
    if (!siteId) {
      // No position for this day. Hang its content off the stop we are at and stay there one more night.
      if (current && hasContent) {
        if (current.depart.day < dayNumber + 1) current.depart = { day: dayNumber + 1 };
        addActivities(current, day, dayNumber);
      }
      return;
    }
    if (current && current.site_ids[0] === siteId) {
      current.depart = { day: dayNumber + 1 };
    } else {
      const site = siteOf(siteId);
      current = {
        latitude: Number(site.latitude), longitude: Number(site.longitude), stop: true, id: newId("stp", random),
        name: toStr(day.title_override || day.title, MAX_TITLE_LENGTH) || toStr(site.title, MAX_TITLE_LENGTH) || siteId,
        site_ids: [siteId], arrive: { day: dayNumber }, depart: { day: dayNumber + 1 }
      };
      stops.push(current);
    }
    addActivities(current, day, dayNumber);
  });

  if (stops.length) {
    delete stops[0].arrive;
    delete stops[stops.length - 1].depart;
  }
  if (dayCount) {
    stops.forEach((s) => {
      if (s.arrive && s.arrive.day > dayCount) s.arrive.day = dayCount;
      if (s.depart && s.depart.day > dayCount) s.depart.day = dayCount;
    });
  }

  const plans = toObj(v1.plans);
  return {
    version: ITINERARY_VERSION,
    revision: 1,
    welcome_message: toStr(toObj(plans[plan]).welcome_message, MAX_NOTES_LENGTH) || toStr(v1.welcome_message, MAX_NOTES_LENGTH) || toStr(v1.summary, MAX_NOTES_LENGTH),
    summary: toStr(v1.summary, MAX_NOTES_LENGTH),
    route: { source: { type: "charter-v1", plan }, speed_kn: DEFAULT_SPEED_KN, points: snapStopsToPath(stops, v1PathCoordinates(plannedRoute, plan)) },
    activities
  };
}
```

Add `snapStopsToPath, migrateItineraryV1` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/itinerary.test.js`
Expected: `# pass 25`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "feat(itinerary): migrate v1 itineraries to v2 with path snapping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `plannedRouteFromItinerary`

**Files:**
- Modify: `lib/itinerary.js`
- Modify: `test/itinerary.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/itinerary.test.js`:

```js
test("plannedRouteFromItinerary: coordinates from the points, with the legacy primary wrapper", () => {
  const out = lib.plannedRouteFromItinerary(sevenDays(), "Reyes family");
  assert.equal(out.routes.length, 1);
  assert.equal(out.routes[0].name, "Reyes family");
  assert.equal(out.routes[0].coordinates.length, 8);
  assert.deepEqual(out.routes[0].coordinates[0], { latitude: 14.8, longitude: 120.27 });
  assert.equal(out.route.primary.routes, out.routes);
  assert.deepEqual(out.route.alternative, { source: null, routes: [] });
  assert.equal(out.active_plan, "primary");
});

test("plannedRouteFromItinerary: fewer than two points gives no routes", () => {
  const out = lib.plannedRouteFromItinerary(lib.normalizeItinerary({}), "x");
  assert.deepEqual(out.routes, []);
  assert.deepEqual(out.route.primary.routes, []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/itinerary.test.js`
Expected: FAIL with `lib.plannedRouteFromItinerary is not a function`.

- [ ] **Step 3: Add the function**

Insert before `module.exports`:

```js
// ---- public planned route (spec §3.4) --------------------------------------

// The `route`, `requested_plan`, `active_plan` and `fallback_plan` keys are the pre-rework wrapper. They are kept for
// ONE release so a guest app cached before the rework still draws the line. Remove them in plan 5's cleanup task.
function plannedRouteFromItinerary(itinerary, name) {
  const it = normalizeItinerary(itinerary);
  const coordinates = it.route.points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  const routes = coordinates.length >= 2 ? [{ name: toStr(name) || "Planned route", description: "", coordinates }] : [];
  const plan = { source: it.route.source, routes };
  return { ...plan, route: { primary: plan, alternative: { source: null, routes: [] } }, requested_plan: "primary", active_plan: "primary", fallback_plan: "" };
}
```

Add `plannedRouteFromItinerary` to the export block. The final export block is:

```js
module.exports = {
  ITINERARY_VERSION, DEFAULT_SPEED_KN, SAME_SPOT_M, SNAP_NM, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH,
  distM, distNm, newId, isStop, parseDateOnly, charterDayCount,
  normalizePoint, normalizeItinerary,
  stopEntries, positionOf, stopSpan, deriveDays,
  validateItinerary,
  legHours, extraDaysForLeg, applyRoute,
  snapStopsToPath, migrateItineraryV1,
  plannedRouteFromItinerary
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all itinerary and route-library tests pass (`# fail 0`).

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "feat(itinerary): derive the public planned route from the itinerary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Library route template fields `nights` and `depart_time`

**Files:**
- Modify: `lib/route-library.js:83-118` (`normalizePoint`)
- Modify: `test/route-library.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/route-library.test.js` (it already has `tempDir()` and `lib`):

```js
test("saveRoute keeps nights and depart_time on stops and drops them on waypoints and when invalid", () => {
  const dir = tempDir();
  const saved = lib.saveRoute(dir, { route: { id: "", name: "Template", speed_kn: 8, points: [
    { latitude: 14.8, longitude: 120.27, stop: true, name: "Subic", nights: 0, depart_time: "09:00" },
    { latitude: 14.9, longitude: 120.2, nights: 3, depart_time: "10:00" },
    { latitude: 14.95, longitude: 120.11, anchorage_id: "capones", nights: 2, depart_time: "25:00" },
    { latitude: 15.6, longitude: 119.9, anchorage_id: "potipot", nights: -1 }
  ] }, base_revision: 0 });
  assert.equal(saved.points[0].nights, 0);
  assert.equal(saved.points[0].depart_time, "09:00");
  assert.equal(saved.points[1].nights, undefined);
  assert.equal(saved.points[1].depart_time, undefined);
  assert.equal(saved.points[2].nights, 2);
  assert.equal(saved.points[2].depart_time, undefined);
  assert.equal(saved.points[3].nights, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/route-library.test.js`
Expected: FAIL on `saved.points[0].nights` being `undefined`.

- [ ] **Step 3: Extend `normalizePoint`**

In `lib/route-library.js`, inside `normalizePoint(raw, index)`, after the `leg_speed_kn` block and before `return point;`, add:

```js
  // Template fields (charter rework spec A §2.2): only meaningful on stops.
  if (point.anchorage_id || point.stop === true) {
    const nights = Number(input.nights);
    if (Number.isInteger(nights) && nights >= 0 && nights <= 60) {
      point.nights = nights;
    }
    if (typeof input.depart_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.depart_time.trim())) {
      point.depart_time = input.depart_time.trim();
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/route-library.js test/route-library.test.js
git commit -m "feat(routes): library stops carry nights and depart_time template fields

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Wire the module into `server.js` — defaults, bundle, migration v4

**Files:**
- Modify: `server.js` (require near the `routeLibrary` require; `ADMIN_WRITE_FILES`/`ADMIN_CHARTER_FILES` at ~97-98; `defaultCharterData` ~4128-4190; `readAdminCharterBundle` ~4192-4209; `DATA_MIGRATIONS` ~502)
- Modify: `data-templates/schema-version.json`

No unit test covers these (they are wiring in `server.js`); Task 13 verifies them end to end.

- [ ] **Step 1: Require the module**

Next to the existing `const routeLibrary = require("./lib/route-library");` add:

```js
const itineraryLib = require("./lib/itinerary");
```

- [ ] **Step 2: File lists**

Replace lines ~97-98 with:

```js
// itinerary.json is saved only through /itinerary/save (revision-checked), so it is not in the generic write set.
const ADMIN_WRITE_FILES = new Set(["charter.json", "crew_list.json", "guest_list.json", "menus.json", GUEST_DRINKS_FILE_NAME]);
const ADMIN_CHARTER_FILES = ["charter.json", "itinerary.json", "crew_list.json", "guest_list.json", "menus.json", GUEST_DRINKS_FILE_NAME, CHARTER_ALCOHOL_PURCHASES_FILE_NAME];
```

- [ ] **Step 3: Defaults**

In `defaultCharterData(charterId, name)` replace the `"itinerary.json": { summary: "", days: [], ... }` entry with:

```js
    "itinerary.json": itineraryLib.normalizeItinerary({}),
```

and delete the `[PLANNED_ROUTE_FILE_NAME]: emptyPlannedRoute()` entry.

- [ ] **Step 4: Bundle normalisation**

In `readAdminCharterBundle(charterId)` delete the line `bundle[PLANNED_ROUTE_FILE_NAME] = normalizePlannedRouteData(...)` and add, in the same place:

```js
  bundle["itinerary.json"] = itineraryLib.normalizeItinerary(bundle["itinerary.json"]);
```

- [ ] **Step 5: Migration v4**

Add after `migrateAddCharterDateFields` (before `DATA_MIGRATIONS`):

```js
// Charter rework spec A §2.5: itinerary.json v1 (plans, days, planned-route.json) → v2 (route + activities).
function migrateItinerariesToV2(dataDir) {
  const chartersDir = path.join(dataDir, "charters");
  if (!fs.existsSync(chartersDir)) {
    return;
  }
  const siteLibrary = toPlainObject(readJsonFileSafe(path.join(dataDir, "library", "sites.json"), { sites: [] }));
  const sitesById = new Map((Array.isArray(siteLibrary.sites) ? siteLibrary.sites : [])
    .filter((site) => site && typeof site.id === "string")
    .map((site) => [site.id, site]));
  const today = localTodayDateValue();
  let converted = 0;
  const charterIds = fs.readdirSync(chartersDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const charterId of charterIds) {
    const dir = path.join(chartersDir, charterId);
    const itineraryPath = path.join(dir, "itinerary.json");
    const plannedPath = path.join(dir, PLANNED_ROUTE_FILE_NAME);
    if (!fs.existsSync(itineraryPath)) {
      continue;
    }
    const v1 = toPlainObject(readJsonFileSafe(itineraryPath, {}));
    if (v1.version === itineraryLib.ITINERARY_VERSION) {
      continue;
    }
    const charter = toPlainObject(readJsonFileSafe(path.join(dir, "charter.json"), {}));
    const planned = fs.existsSync(plannedPath) ? readJsonFileSafe(plannedPath, null) : null;
    const v2 = itineraryLib.migrateItineraryV1(v1, charter, planned, sitesById, { today });
    fs.renameSync(itineraryPath, path.join(dir, "itinerary.v1.json"));
    if (fs.existsSync(plannedPath)) {
      fs.renameSync(plannedPath, path.join(dir, "planned-route.v1.json"));
    }
    writeJsonFileAtomic(itineraryPath, v2);
    converted += 1;
    console.log(`Itinerary v2: converted charter ${charterId} (${itineraryLib.stopEntries(v2.route.points).length} stops, ${v2.activities.length} activities, plan ${v2.route.source.plan}).`);
  }
  console.log(`Itinerary v2: converted ${converted} charter(s).`);
}
```

And add to `DATA_MIGRATIONS` after the v3 entry:

```js
  { version: 4, name: "itinerary-v2", run: migrateItinerariesToV2 }
```

`localTodayDateValue` is defined later in the file (S:4238); that is fine because the migration runs after the module has loaded.

- [ ] **Step 6: Template schema version**

Set `data-templates/schema-version.json` to:

```json
{"version": 4, "updated_at": "2026-10-07T00:00:00.000Z", "applied_migrations": []}
```

- [ ] **Step 7: Start the server against a scratch copy of local data and watch the migration run**

```powershell
Copy-Item -Recurse data-local data-scratch
$env:DATA_DIR="$PWD\data-scratch"; $env:GUEST_STATIC_DIR="..\..\portal\iolanthe-guest"; $env:ADMIN_STATIC_DIR="..\..\portal\iolanthe-admin"
node server.js
```

Expected in the log: `Applied data migration 4: itinerary-v2` preceded by one `Itinerary v2: converted charter …` line per charter. Check `data-scratch/charters/<id>/itinerary.json` has `"version": 2` and `itinerary.v1.json` exists beside it. Stop the server (Ctrl+C). Add `data-scratch/` to `.gitignore` if it is not already ignored.

- [ ] **Step 8: Commit**

```bash
git add server.js data-templates/schema-version.json .gitignore
git commit -m "feat(itinerary): v2 defaults, bundle normalisation and migration v4

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `POST /api/admin/charter/:id/itinerary/save`

**Files:**
- Modify: `server.js` (charter router ~7506-7540; add `saveCharterItinerary` near `saveAdminJsonFile` ~6600)

- [ ] **Step 1: Add the save function**

After `saveAdminJsonFile` add:

```js
// Spec A §3.1. Returns { status, payload } so the handler stays a one-liner.
function saveCharterItinerary(charterId, body) {
  const stored = itineraryLib.normalizeItinerary(readCharterJson(charterId, "itinerary.json", {}));
  const baseRevision = Number(body.base_revision);
  if (!Number.isInteger(baseRevision) || baseRevision !== stored.revision) {
    return {
      status: 409,
      payload: {
        error: `Someone else saved this itinerary (revision ${stored.revision}). Reload it to see their changes.`,
        code: "revision",
        itinerary: stored
      }
    };
  }
  const charter = toPlainObject(readCharterJson(charterId, "charter.json", {}));
  const incoming = itineraryLib.normalizeItinerary(body.itinerary);
  const errors = itineraryLib.validateItinerary(incoming, itineraryLib.charterDayCount(charter));
  if (errors.length) {
    return { status: 400, payload: { error: errors[0].message, field: errors[0].field, errors } };
  }
  const saved = { ...incoming, revision: stored.revision + 1 };
  writeJsonFileAtomic(path.join(CHARTERS_DIR, charterId, "itinerary.json"), saved);
  return { status: 200, payload: { itinerary: saved } };
}
```

- [ ] **Step 2: Route it**

Change the charter regex at ~S:7506 to:

```js
    const charterMatch = pathname.match(/^\/api\/admin\/charter\/([a-z0-9-]+)(?:\/(save|itinerary\/save|itinerary\/apply-route|upload-route))?$/);
```

(`upload-route` is removed in Task 11.) After the `if (action === "save" && method === "POST") { … }` block add:

```js
        if (action === "itinerary/save" && method === "POST") {
          const adminContext = requireAdmin(request, response, url);
          if (!adminContext) { return; }
          if (!adminContext.allowedSections.includes("charter")) { sendAdminError(response, 403, "Section not allowed"); return; }
          const result = saveCharterItinerary(charterId, toPlainObject(await readJsonRequestBody(request)));
          sendJson(response, result.status, result.payload);
          return;
        }
```

- [ ] **Step 3: Smoke test by hand**

Start the server on `data-scratch` as in Task 8 step 7. In another shell, with the admin URL key from `data-scratch/settings.json` (`admin.urlKey`) and a logged-in session cookie (log in once through the browser at `http://localhost:8000/admin/?key=<urlKey>` as Charter Admin, then copy the cookie from DevTools → Application → Cookies):

```bash
curl -s -b "iolanthe_admin=<cookie>" "http://localhost:8000/api/admin/charter/csaba?key=<urlKey>" | head -c 600
```

Expected: JSON whose `"itinerary.json"` has `"version": 2` and a `"revision"`. Then post a save with the wrong revision:

```bash
curl -s -b "iolanthe_admin=<cookie>" -H "Content-Type: application/json" -X POST \
  -d '{"itinerary":{"version":2,"route":{"points":[]},"activities":[]},"base_revision":999}' \
  "http://localhost:8000/api/admin/charter/csaba/itinerary/save?key=<urlKey>"
```

Expected: HTTP 409 with `"code": "revision"` and the stored itinerary. Repeat with the correct `base_revision`: expected 200 and `revision` one higher. Then try the old generic save for `itinerary.json`:

```bash
curl -s -b "iolanthe_admin=<cookie>" -H "Content-Type: application/json" -X POST \
  -d '{"file":"itinerary.json","data":{}}' "http://localhost:8000/api/admin/charter/csaba/save?key=<urlKey>"
```

Expected: 400 `"File is not editable"`.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(itinerary): revision-checked itinerary save endpoint

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: `POST /api/admin/charter/:id/itinerary/apply-route`

**Files:**
- Modify: `server.js` (next to `saveCharterItinerary`; the charter router)

- [ ] **Step 1: Add the function**

After `saveCharterItinerary` add:

```js
// Spec A §3.2.
function applyRouteToCharter(charterId, body) {
  const stored = itineraryLib.normalizeItinerary(readCharterJson(charterId, "itinerary.json", {}));
  const baseRevision = Number(body.base_revision);
  if (!Number.isInteger(baseRevision) || baseRevision !== stored.revision) {
    return {
      status: 409,
      payload: { error: `Someone else saved this itinerary (revision ${stored.revision}). Reload it to see their changes.`, code: "revision", itinerary: stored }
    };
  }
  const routeId = typeof body.route_id === "string" ? body.route_id.trim() : "";
  const route = routeLibrary.listRoutes(LIBRARY_DIR).routes.find((entry) => entry.id === routeId);
  if (!route) {
    return { status: 404, payload: { error: "Unknown route" } };
  }
  const charter = toPlainObject(readCharterJson(charterId, "charter.json", {}));
  const dayCount = itineraryLib.charterDayCount(charter);
  if (!dayCount) {
    return { status: 400, payload: { error: "Set the charter's start and end dates first.", field: "charter.start_date" } };
  }
  const fromDay = Number(body.from_day) || 1;
  const siteLibrary = toPlainObject(readJsonFileSafe(path.join(LIBRARY_DIR, "sites.json"), { sites: [] }));
  const titles = new Map((Array.isArray(siteLibrary.sites) ? siteLibrary.sites : []).map((site) => [site.id, site.title]));
  try {
    const next = itineraryLib.applyRoute(stored, route, fromDay, dayCount, { siteTitle: (id) => titles.get(id) || id });
    const saved = { ...next, revision: stored.revision + 1 };
    writeJsonFileAtomic(path.join(CHARTERS_DIR, charterId, "itinerary.json"), saved);
    return { status: 200, payload: { itinerary: saved } };
  } catch (error) {
    if (error && error.statusCode) {
      return { status: error.statusCode, payload: { error: error.message, code: error.code, needed_days: error.needed_days, remaining_days: error.remaining_days } };
    }
    throw error;
  }
}
```

- [ ] **Step 2: Route it**

After the `itinerary/save` block add:

```js
        if (action === "itinerary/apply-route" && method === "POST") {
          if (!requireAdmin(request, response, url, ROUTE_LIBRARY_ACCESS)) { return; }
          const result = applyRouteToCharter(charterId, toPlainObject(await readJsonRequestBody(request)));
          sendJson(response, result.status, result.payload);
          return;
        }
```

(`ROUTE_LIBRARY_ACCESS` = Charter Admin on the bridge VLAN, the same gate as the route library, per route-planner D6.)

- [ ] **Step 3: Smoke test by hand**

With the server on `data-scratch`, list routes to pick an id, then apply:

```bash
curl -s -b "iolanthe_admin=<cookie>" "http://localhost:8000/api/admin/routes?key=<urlKey>" | grep -o '"id": *"[^"]*"' | head
curl -s -b "iolanthe_admin=<cookie>" -H "Content-Type: application/json" -X POST \
  -d '{"route_id":"<an id>","from_day":1,"base_revision":<current revision>}' \
  "http://localhost:8000/api/admin/charter/csaba/itinerary/apply-route?key=<urlKey>"
```

Expected: 200 with stops carrying `arrive`/`depart` and one activity per served site. Apply a long route from the charter's last day: expected 409 `"code": "too-long"`.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(itinerary): apply a library route to a charter from a day

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Derived public planned route; remove Primary/Alternative and upload-route

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Replace `readPlannedRoute`**

Replace the whole block from `function normalizeRoutePlanId` (~S:4704) through `function writePlannedRoutePlan … }` (~S:4922), i.e. `normalizeRoutePlanId`, `normalizePlannedRouteCoordinate`, `normalizePlannedRoute`, `normalizeSinglePlannedRouteData`, `plannedRouteHasData`, `getActiveRouteForPlan`, `normalizePlannedRouteData`, `readPlannedRouteStore`, `storedItineraryDayNumber`, `storedItineraryPlanFromDayId`, `displayedItineraryDayNumberForDate`, `displayedItineraryPlanForDay`, `guestVisibleItineraryPlanForToday`, `readPlannedRoute`, `writePlannedRoutePlan`, with:

```js
// Spec A §3.4: the planned route is derived from the itinerary's points.
function readPlannedRoute(charterId = getActiveCharterId()) {
  const activeCharter = resolveActiveCharterId(charterId);
  const charter = toPlainObject(readCharterJson(activeCharter, "charter.json", {}));
  const itinerary = readCharterJson(activeCharter, "itinerary.json", {});
  return itineraryLib.plannedRouteFromItinerary(itinerary, typeof charter.name === "string" ? charter.name : "");
}
```

Also delete `emptyPlannedRoute` (~S:4689) and the constants `ROUTE_PLAN_IDS` (~S:46) and `ADMIN_MAX_KML_BYTES` (~S:93). Keep `PLANNED_ROUTE_FILE_NAME` (the migration renames that file). Keep `parseLocalDateOnlyValue` and `localTodayDateValue`.

Run `node --check server.js` and then grep for every deleted name to find stragglers:

```bash
grep -n "normalizeRoutePlanId\|ROUTE_PLAN_IDS\|getActiveRouteForPlan\|readPlannedRouteStore\|storedItineraryDayNumber\|storedItineraryPlanFromDayId\|displayedItineraryDayNumberForDate\|displayedItineraryPlanForDay\|guestVisibleItineraryPlanForToday\|writePlannedRoutePlan\|emptyPlannedRoute\|normalizePlannedRouteData" server.js
```

Expected: no matches except inside `activeCharterWeatherStops` (`storedItineraryDayNumber`), which Task 12 rewrites. If `readAdminCharterBundle` or anything else still references `normalizePlannedRouteData`, Task 8 step 4 was missed; fix it.

- [ ] **Step 2: Remove upload-route**

- Delete the handler block `if (action === "upload-route" && method === "POST") { … }` (~S:7542-7558) and drop `|upload-route` from the charter regex.
- Delete `parseRouteUpload` (~S:6164-6181), `parseKmlRoute` (~S:4960-4998), `parseKmlCoordinateList`, `firstXmlText`, `stripXmlTags`, `decodeXmlEntities` (~S:4924-4958).
- Remove `parseKmlRoute` from `module.exports` at the bottom of the file.

Run `node --check server.js`; then `grep -n "parseKmlRoute\|parseRouteUpload\|upload-route" server.js` — expected: no matches.

- [ ] **Step 3: Charter dates in the public payload**

In `buildCharterPayload` the `itinerary` object currently takes `start_date` / `end_date` from the itinerary first. The v2 itinerary has no dates, so simplify both lines to the charter's:

```js
      start_date: typeof charterInfo.start_date === "string" ? charterInfo.start_date : "",
      end_date: typeof charterInfo.end_date === "string" ? charterInfo.end_date : "",
```

(The guest reads the dates from `itinerary.start_date` / `end_date` only, so they must stay on this object.)

- [ ] **Step 4: Smoke test**

Start the server on `data-scratch` and:

```bash
curl -s http://localhost:8000/api/planned-route | head -c 400
curl -s http://localhost:8000/api/charter | grep -o '"version": *2' | head -1
```

Expected: the first shows `"routes": [{ "name": …, "coordinates": [...] }]` and a `"route": { "primary": …, "alternative": … }` wrapper; the second prints `"version": 2`.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "refactor(server): derive planned route from the itinerary; remove plan ids and upload-route

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Weather stop selection from the v2 model

**Files:**
- Modify: `server.js` (`activeCharterWeatherStops` ~S:2955-2992, `selectActiveCharterWeatherLocations` ~S:2994-3035; delete `weatherStopLabel` and `weatherStopLocation` ~S:2933-2953 if nothing else uses them)

- [ ] **Step 1: Replace both functions**

```js
// Spec A §3.4: one weather stop per itinerary stop, with the charter days it spans.
function activeCharterWeatherStops() {
  const charterId = getActiveCharterId();
  const charter = toPlainObject(readCharterJson(charterId, "charter.json", {}));
  const itinerary = itineraryLib.normalizeItinerary(readCharterJson(charterId, "itinerary.json", {}));
  const dayCount = itineraryLib.charterDayCount(charter);
  const stops = itineraryLib.stopEntries(itinerary.route.points);
  return stops.map((entry, index) => {
    const span = itineraryLib.stopSpan(entry.point, itineraryLib.positionOf(index, stops.length), dayCount);
    const location = normalizeWeatherLocation(entry.point.latitude, entry.point.longitude, entry.point.name || `Stop ${index + 1}`, "Active charter itinerary");
    return { from_day: span.from, to_day: span.to, order: index, location };
  }).filter((stop) => stop.location);
}

function selectActiveCharterWeatherLocations() {
  const stops = activeCharterWeatherStops();
  if (!stops.length) {
    return { current: null, next: null };
  }
  const charter = toPlainObject(readCharterJson(getActiveCharterId(), "charter.json", {}));
  const offset = localDateDiffDays(charter.start_date, localTodayDateValue());
  const todayNumber = Number.isFinite(offset) ? offset + 1 : null;
  let currentIndex = 0;
  if (todayNumber !== null) {
    const spanIndex = stops.findIndex((stop) => todayNumber >= stop.from_day && todayNumber <= stop.to_day);
    if (spanIndex >= 0) {
      currentIndex = spanIndex;
    } else if (todayNumber > stops[stops.length - 1].to_day) {
      currentIndex = stops.length - 1;
    } else {
      // Underway between two stops today: the next stop is where the weather matters.
      const nextIndex = stops.findIndex((stop) => stop.from_day > todayNumber);
      currentIndex = nextIndex >= 0 ? nextIndex : 0;
    }
  }
  return {
    current: stops[currentIndex].location,
    next: stops[currentIndex + 1] ? stops[currentIndex + 1].location : stops[currentIndex].location
  };
}
```

Then `grep -n "weatherStopLabel\|weatherStopLocation\|readWeatherSitesLookup\|weatherSiteTitle" server.js`. Delete `weatherStopLabel` and `weatherStopLocation` if they have no other callers; keep `readWeatherSitesLookup` / `weatherSiteTitle` if anything else (e.g. the weather site resolver) still uses them.

- [ ] **Step 2: Smoke test**

Server on `data-scratch`: `curl -s http://localhost:8000/api/weather | head -c 800`. Expected: a payload with `next_stop_forecast` naming a stop from the active charter's itinerary (or `null` if the charter has no stops), and no error in the server log.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(weather): pick the current and next stop from the v2 itinerary spans

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Endpoint checklist script, docs, rehearsal

**Files:**
- Create: `scripts/check-itinerary-endpoints.sh`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the checklist script**

Create `scripts/check-itinerary-endpoints.sh`:

```bash
#!/usr/bin/env bash
# Manual verification of the itinerary endpoints against a running local server.
# Usage: BASE=http://localhost:8000 KEY=<admin urlKey> COOKIE="iolanthe_admin=<session>" CHARTER=csaba scripts/check-itinerary-endpoints.sh
set -euo pipefail
BASE="${BASE:-http://localhost:8000}"; CHARTER="${CHARTER:-csaba}"
auth=(-s -b "$COOKIE")
json=(-H "Content-Type: application/json")

echo "1. bundle has itinerary v2"
rev=$(curl "${auth[@]}" "$BASE/api/admin/charter/$CHARTER?key=$KEY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s)["itinerary.json"];if(b.version!==2)process.exit(1);console.log(b.revision)})')
echo "   revision $rev"

echo "2. stale revision → 409 revision"
curl "${auth[@]}" "${json[@]}" -X POST -d '{"itinerary":{"version":2},"base_revision":999999}' "$BASE/api/admin/charter/$CHARTER/itinerary/save?key=$KEY" | grep -q '"code": *"revision"' && echo "   ok"

echo "3. invalid itinerary → 400 with field"
curl "${auth[@]}" "${json[@]}" -X POST -d "{\"itinerary\":{\"version\":1},\"base_revision\":$rev}" "$BASE/api/admin/charter/$CHARTER/itinerary/save?key=$KEY" | grep -q '"field": *"version"' && echo "   ok"

echo "4. generic save refuses itinerary.json"
curl "${auth[@]}" "${json[@]}" -X POST -d '{"file":"itinerary.json","data":{}}' "$BASE/api/admin/charter/$CHARTER/save?key=$KEY" | grep -q "not editable" && echo "   ok"

echo "5. public planned route derived"
curl -s "$BASE/api/planned-route" | grep -q '"routes"' && echo "   ok"

echo "6. apply-route with unknown id → 404"
curl "${auth[@]}" "${json[@]}" -X POST -d "{\"route_id\":\"nope\",\"from_day\":1,\"base_revision\":$rev}" "$BASE/api/admin/charter/$CHARTER/itinerary/apply-route?key=$KEY" | grep -q "Unknown route" && echo "   ok"

echo "7. upload-route is gone → 404"
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE" -X POST "$BASE/api/admin/charter/$CHARTER/upload-route?key=$KEY")
[ "$code" = "404" ] && echo "   ok ($code)"
echo "done"
```

Run it against the `data-scratch` server. Expected: seven `ok` lines and `done`.

- [ ] **Step 2: Document the endpoints**

In `CLAUDE.md`, in the section that lists admin API routes (search for `/api/admin/routes/save`), add:

```
- `POST /api/admin/charter/<id>/itinerary/save {itinerary, base_revision}` — the only way to write
  `itinerary.json` (v2). 400 `{error, field}` on validation, 409 `{code:"revision", itinerary}` on a stale revision.
- `POST /api/admin/charter/<id>/itinerary/apply-route {route_id, from_day, base_revision}` — splice a library route in
  from a day (spec A §3.2). 409 `{code:"too-long", needed_days, remaining_days}` when it does not fit.
- `GET /api/planned-route` is derived from `itinerary.json` (`lib/itinerary.js plannedRouteFromItinerary`). The old
  `route.primary` wrapper is kept for one release.
- Removed: `POST /charter/<id>/upload-route`, `planned-route.json`, Primary/Alternative plan ids.
```

Also note under data/migrations: `v4 itinerary-v2 renames the old files to itinerary.v1.json / planned-route.v1.json`.

- [ ] **Step 3: Rehearse the migration on a copy of the live data**

On the Docker VM (`ssh docker-vm`), copy the live data directory and run the new server against the copy once, exactly as Task 8 step 7 did locally, then diff a converted charter by eye:

```bash
ssh docker-vm 'cd /opt/projects/vessel && cp -r iolanthe-server/data /tmp/data-rehearsal && ls /tmp/data-rehearsal/charters'
```

Then run the server image or `node server.js` with `DATA_DIR=/tmp/data-rehearsal` and confirm every charter logs a `converted` line and `/api/charter` returns `"version": 2`. Record the stop and activity counts per charter in the PR description. Delete `/tmp/data-rehearsal` afterwards. Do not deploy from this plan; deployment is `./update.sh` on the server repo per its CLAUDE.md, done when plans 1 to 3 are all ready (the admin must ship before crew use the new file).

- [ ] **Step 4: Full test run and commit**

```bash
npm test
git add scripts/check-itinerary-endpoints.sh CLAUDE.md
git commit -m "docs(itinerary): endpoint checklist script and CLAUDE.md for the v2 itinerary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Spec coverage check (plan self-review)

| Spec A item | Task |
|---|---|
| §2.1 shape, normalisation, validation rules | 1, 3 |
| §2.1 derived days, nights, spans | 2 |
| §2.2 library `nights`, `depart_time` | 7 |
| §2.3 charter dates only on charter.json | 11 step 3 |
| §2.4 files removed / write list | 8, 11 |
| §2.5 migration v4, `.v1` renames, template schema 4 | 5, 8 |
| §3.1 save endpoint, 400 field, 409 stored, generic save refuses | 9 |
| §3.2 apply-route, too-long, same-spot merge, midnight crossing, activities seeded | 4, 10 |
| §3.3 promote (admin-side only) | none needed here; plan 4 |
| §3.4 derived planned route with legacy wrapper; weather by span | 6, 11, 12 |
| §3.5 removals | 11 |
| §3.6 bundle | 8 |
| §8 server tests | 1–7; endpoints by script in 13 |
| Estimated times (§2.1 "Estimated times") | not server-side: the admin computes estimates (plan 2); the server only uses leg time for midnight crossing in `applyRoute` |

Deviation to record in the spec: §3.2 said "keep every stop whose departure day is before the from-day". Task 4 keeps every stop *reached* before the from-day and closes the current one on the from-day, so a mid-charter switch starts from where the boat actually is. Update spec §3.2 step 1 to match when this plan lands.
