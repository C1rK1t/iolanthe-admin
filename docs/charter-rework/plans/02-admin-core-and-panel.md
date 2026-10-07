# Charter Itinerary Rework — Plan 2 of 5: Admin Core and Read-Only Itinerary Panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `iolanthe-admin` a tested pure module for the version 2 itinerary and a new Itinerary panel that renders the approved v5 layout (tube line, day rows, per-stop sub-boxes, activities, estimated times) from the server's data, read-only.

**Architecture:** `itinerary-core.js` is a UMD module like `routes-core.js`: it works in the browser as `window.IolantheItineraryCore` and under Node for `node --test`. It mirrors the server's `deriveDays`/`validateItinerary` and adds the admin-only pieces: time estimates, line geometry. `itinerary.js` is the panel, wired like `routes.js` through `window.IolantheAdmin`, mounted by `admin.js`'s charter dispatcher. `itinerary.css` is scoped under `.itinerary-panel`. Editing arrives in plan 3; this plan only displays.

**Tech Stack:** Plain JS, no build, `node --test`. Repo: `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin`. Spec: `docs/charter-rework/spec.md` §4.1, §4.8. Approved mockup: `.superpowers/brainstorm/*/content/tube-line-v5.html`.

**Depends on:** plan 1 deployed to the local server you test against (the bundle must carry a v2 `itinerary.json`). Run the server from the `iolanthe-server` repo with `DATA_DIR` pointing at a copy of `data-local`, as its CLAUDE.md shows.

**Reading before you start:** `routes-core.js` lines 1-30 (UMD wrapper) and 430-439 (exports); `test/routes-core.test.js` lines 1-20; `routes.js` lines 1-60 and 700-779 (`bind`); `routes-ui.js` (`el()`); `admin.js` 7880-7990 (charter panel dispatcher). Line numbers are from admin `a5bf3c0`.

---

## File structure

| File | Responsibility |
|---|---|
| `itinerary-core.js` (new) | Pure: normalise, day count, spans, `deriveDays`, `validateItinerary`, `legHours`, `estimateTimes`, `stopTimesLabel`, `lineGeometry`, `dayDateLabel`, `itinerarySnapshot`. |
| `test/itinerary-core.test.js` (new) | Tests for every exported function. |
| `itinerary.js` (new) | The panel: `render()` returns the shell HTML, `bind(opts)` draws header, welcome, day rows, sub-boxes, activities, titles and the SVG line. |
| `itinerary.css` (new) | Styles under `.itinerary-panel`. |
| `admin.js` (modify) | Dispatcher mounts the new panel for `"itinerary"`; stops v1-normalising the itinerary; passes raw bundle data. |
| `index.html` (modify) | Script and stylesheet tags; `?v=` bumps. |

---

### Task 0: Land the Route Upload retirement branch

**Files:**
- Merge: `feat/routes-retire-upload` (one commit `6aff979`, deletes admin.js 5223-5341 and the KML pin modal; drops `plannedRoute` from `charterPanelContent`)

The old Route Upload panel reads the v1 itinerary (`getItinerarySwitchState`) and `planned-route.json`, which plan 1's server no longer sends. Retiring it first keeps the admin loading against the new bundle.

- [ ] **Step 1: Merge**

```bash
git checkout main
git merge --no-ff feat/routes-retire-upload -m "Merge feat/routes-retire-upload: retire Route Upload (replaced by Routes import; charter rework plan 2)"
```

Expected: clean merge (the branch is one commit behind main's docs only). If `admin.js` conflicts, keep the branch's deletions and main's additions.

- [ ] **Step 2: Bump and verify**

In `index.html` change `admin.js?v=admin-routes-v3` to `admin.js?v=admin-itin-v1` and `admin.css?v=admin-routes-v3` to `admin.css?v=admin-itin-v1`. Load `http://localhost:8000/admin/?key=<urlKey>` → Charter: the nav shows Charter Info, Itinerary, Crew, Routes, Site Editor (no Route Upload), and the console has no errors on load.

```bash
git add index.html
git commit -m "chore: bump admin asset versions after retiring Route Upload

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git branch -d feat/routes-retire-upload
```

---

### Task 1: `itinerary-core.js` — normalise, spans, `deriveDays`, `validateItinerary`

This mirrors `lib/itinerary.js` from plan 1 (same rules, same fixture) so the two sides can never disagree about which stop belongs to which day.

**Files:**
- Create: `itinerary-core.js`
- Create: `test/itinerary-core.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/itinerary-core.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from the repo root: `node --test test/itinerary-core.test.js`
Expected: FAIL with `Cannot find module '../itinerary-core.js'`.

- [ ] **Step 3: Create the module**

Create `itinerary-core.js`:

```js
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheItineraryCore = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Pure logic for the Itinerary panel. Mirrors iolanthe-server/lib/itinerary.js for the shared rules
  // (normalise, spans, deriveDays, validate) and adds the admin-only pieces (time estimates, line geometry).
  // Spec: docs/charter-rework/spec.md.

  const ITINERARY_VERSION = 2;
  const DEFAULT_SPEED_KN = 8;
  const MIN_SPEED_KN = 0.5;
  const MAX_SPEED_KN = 30;
  const MAX_TITLE_LENGTH = 120;
  const MAX_NOTES_LENGTH = 2000;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const METRES_PER_NM = 1852;
  const EARTH_RADIUS_M = 6371000;
  const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  const DAY_MS = 86400000;

  const toObj = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  const toStr = (value, max) => (typeof value === "string" ? value.trim().slice(0, max || 100000) : "");

  function toRad(deg) { return (deg * Math.PI) / 180; }
  function distM(a, b) {
    if (!a || !b || !Number.isFinite(a.latitude) || !Number.isFinite(a.longitude) || !Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)) return 0;
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
  function charterDayCount(charter) {
    const c = toObj(charter);
    const start = parseDateOnly(c.start_date);
    const end = parseDateOnly(c.end_date);
    if (start === null || end === null || end < start) return 0;
    return Math.round((end - start) / DAY_MS) + 1;
  }
  // "Mon 12 Oct" for charter day `day`; "" without a valid start date.
  function dayDateLabel(charter, day) {
    const start = parseDateOnly(toObj(charter).start_date);
    if (start === null || !Number.isInteger(day) || day < 1) return "";
    const d = new Date(start + (day - 1) * DAY_MS);
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
    return `${weekday} ${d.getUTCDate()} ${month}`;
  }

  // ---- normalisation (same rules as the server) ----------------------------

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
  function normalizePoint(value, random) {
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
  function normalizeItinerary(value, random = Math.random) {
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
        points: (Array.isArray(route.points) ? route.points : []).map((p) => normalizePoint(p, random)).filter(Boolean)
      },
      activities: (Array.isArray(v.activities) ? v.activities : []).map((a) => normalizeActivity(a, random)).filter(Boolean)
    };
  }

  // What counts as "changed" for the Save button: everything the captain edits, not revision or source.
  function itinerarySnapshot(itinerary) {
    const it = toObj(itinerary);
    return JSON.stringify({ welcome_message: it.welcome_message, summary: it.summary, speed_kn: toObj(it.route).speed_kn, points: toObj(it.route).points, activities: it.activities });
  }

  // ---- days (same rules as the server) --------------------------------------

  function stopEntries(points) {
    return (points || []).map((point, index) => ({ point, index })).filter((e) => isStop(e.point));
  }
  function positionOf(i, count) {
    if (count === 1) return "only";
    if (i === 0) return "origin";
    return i === count - 1 ? "terminus" : "middle";
  }
  function stopSpan(stop, position, dayCount) {
    const arriveDay = stop.arrive ? stop.arrive.day : 1;
    const departDay = stop.depart ? stop.depart.day : (dayCount || arriveDay);
    const from = position === "origin" || position === "only" ? 1 : arriveDay;
    const to = position === "terminus" || position === "only" ? Math.max(dayCount || departDay, arriveDay) : departDay;
    return { from, to: Math.max(from, to) };
  }
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
          id: p.id, index: entry.index, name: p.name || `Stop ${i + 1}`,
          arrive: p.arrive || null, depart: p.depart || null,
          nights: p.arrive && p.depart ? p.depart.day - p.arrive.day : 0,
          activities: activities.filter((a) => a.stop_id === p.id && a.day === day)
        });
      });
      days.push({ day, stops: dayStops });
    }
    return days;
  }

  // ---- validation (same rules as the server) --------------------------------

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

  return {
    ITINERARY_VERSION, DEFAULT_SPEED_KN, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH, TIME_RE,
    distM, distNm, newId, isStop, parseDateOnly, charterDayCount, dayDateLabel,
    normalizePoint, normalizeItinerary, itinerarySnapshot,
    stopEntries, positionOf, stopSpan, deriveDays, validateItinerary
  };
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/itinerary-core.test.js`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(itinerary): itinerary-core - normalise, days, validation (mirrors the server)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `estimateTimes`, `stopTimesLabel`, `dayDateLabel` test

**Files:**
- Modify: `itinerary-core.js`
- Modify: `test/itinerary-core.test.js`

Rule (spec §2.1 "Estimated times"): the chain starts at the first set departure time. Each later arrival estimate is the previous departure (set or estimated) plus the leg's hours at the leg's speed. A set arrival or departure re-anchors the chain. A stop with no nights and no set departure is estimated to leave when it arrives (a hold). A stop with nights and no set departure breaks the chain: the next arrival is unknown unless set.

- [ ] **Step 1: Write the failing tests**

Append to `test/itinerary-core.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/itinerary-core.test.js`
Expected: FAIL with `core.legHours is not a function`.

- [ ] **Step 3: Add the functions**

Insert before the `return {` export block in `itinerary-core.js`:

```js
  // ---- times -----------------------------------------------------------------

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
  function minutesToTime(minutes) {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  // Map stop id → { arrive: {time, estimated} | null, depart: {time, estimated} | null }.
  function estimateTimes(itinerary) {
    const it = toObj(itinerary);
    const points = toObj(it.route).points || [];
    const speed = toObj(it.route).speed_kn || DEFAULT_SPEED_KN;
    const out = new Map();
    let prevDepart = null;   // { minutes, index } of the previous stop's known departure
    stopEntries(points).forEach((entry) => {
      const p = entry.point;
      let arrive = null;
      let depart = null;
      if (p.arrive && p.arrive.time) {
        arrive = { time: p.arrive.time, estimated: false };
      } else if (p.arrive && prevDepart) {
        arrive = { time: minutesToTime(prevDepart.minutes + legHours(points, prevDepart.index, entry.index, speed) * 60), estimated: true };
      }
      const nights = p.arrive && p.depart ? p.depart.day - p.arrive.day : 0;
      if (p.depart && p.depart.time) {
        depart = { time: p.depart.time, estimated: false };
      } else if (p.depart && nights === 0 && arrive) {
        depart = { time: arrive.time, estimated: true };
      }
      out.set(p.id, { arrive, depart });
      prevDepart = depart ? { minutes: timeToMinutes(depart.time), index: entry.index } : null;
    });
    return out;
  }

  // "Arr. ~15:45 · Dep. 08:30", "2 nights · Dep. 18:00", "Dep. 09:00", or "".
  function stopTimesLabel(stop, times) {
    const t = times || { arrive: null, depart: null };
    const parts = [];
    if (t.arrive) parts.push(`Arr. ${t.arrive.estimated ? "~" : ""}${t.arrive.time}`);
    const nights = stop && stop.arrive && stop.depart ? stop.depart.day - stop.arrive.day : 0;
    if (nights > 1) parts.push(`${nights} nights`);
    if (t.depart) parts.push(`Dep. ${t.depart.estimated ? "~" : ""}${t.depart.time}`);
    return parts.join(" · ");
  }
```

Add `legHours, timeToMinutes, minutesToTime, estimateTimes, stopTimesLabel` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/itinerary-core.test.js`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(itinerary): estimated arrival times and stop time labels

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `lineGeometry`

The panel renders the day boxes first, measures each sub-box's vertical centre, then draws the line. This pure function turns those measurements into shapes.

**Files:**
- Modify: `itinerary-core.js`
- Modify: `test/itinerary-core.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/itinerary-core.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/itinerary-core.test.js`
Expected: FAIL with `core.lineGeometry is not a function`.

- [ ] **Step 3: Add the function**

Insert before the export block:

```js
  // ---- line geometry ----------------------------------------------------------

  // days: deriveDays() output. centres: Map "stopId:day" → y (px). Returns shapes in route order.
  function lineGeometry(days, centres) {
    const byStop = new Map();   // stopId → { index, ys: [] }
    (days || []).forEach((d) => (d.stops || []).forEach((s) => {
      const y = centres.get(`${s.id}:${d.day}`);
      if (!Number.isFinite(y)) return;
      if (!byStop.has(s.id)) byStop.set(s.id, { index: s.index, ys: [] });
      byStop.get(s.id).ys.push(y);
    }));
    const ordered = [...byStop.entries()].sort((a, b) => a[1].index - b[1].index);
    const shapes = ordered.map(([stopId, entry], i) => {
      const y1 = Math.min(...entry.ys);
      const y2 = Math.max(...entry.ys);
      const terminal = ordered.length > 1 && i === 0 ? "origin" : (ordered.length > 1 && i === ordered.length - 1 ? "terminus" : null);
      return { stopId, kind: entry.ys.length > 1 ? "loop" : "dot", y1, y2, terminal };
    });
    if (!shapes.length) return { shapes: [], top: 0, bottom: 0 };
    return { shapes, top: shapes[0].y1, bottom: shapes[shapes.length - 1].y2 };
  }
```

Add `lineGeometry` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: all admin tests pass, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(itinerary): lineGeometry turns sub-box measurements into dots and loops

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `itinerary.js` — panel shell, header, welcome, day rows, sub-boxes, activities

**Files:**
- Create: `itinerary.js`

No unit test (DOM). Verified in Task 7.

- [ ] **Step 1: Create the panel file**

Create `itinerary.js`:

```js
(function () {
  "use strict";

  // Charter → Itinerary panel (charter rework spec A §4). Plan 2 renders; plan 3 adds editing.
  // Uses window.IolantheAdmin (helpers exposed by admin.js), window.IolantheItineraryCore (pure logic) and
  // window.IolantheRoutesUi.el (DOM builder shared with the Routes panel).

  const A = () => window.IolantheAdmin;
  const core = () => window.IolantheItineraryCore;
  const el = (...args) => window.IolantheRoutesUi.el(...args);

  let panel = null;    // #itinerary-panel after bind()
  let ctx = null;      // { charterId, charter, siteLibrary }
  let work = null;     // { itinerary, savedJson, baseRevision }
  let resizeBound = false;

  const dayCount = () => core().charterDayCount(ctx.charter);
  const siteTitle = (id) => {
    const site = ((ctx.siteLibrary && ctx.siteLibrary.sites) || []).find((s) => s && s.id === id);
    return site && site.title ? site.title : id;
  };

  function render() {
    return `
      <section class="card full itinerary-panel" id="itinerary-panel">
        <div class="itinerary-panel__header">
          <div>
            <h2 id="itinerary-title"></h2>
            <div class="itinerary-panel__dates muted" id="itinerary-dates"></div>
          </div>
          <div class="itinerary-panel__actions" id="itinerary-actions"></div>
        </div>
        <div class="itinerary-panel__welcome" id="itinerary-welcome"></div>
        <div class="itinerary-panel__hint muted" id="itinerary-hint" hidden></div>
        <div class="itinerary-board" id="itinerary-board">
          <div class="itinerary-board__titles" id="itinerary-titles"></div>
          <svg class="itinerary-board__line" id="itinerary-line" aria-hidden="true"></svg>
          <div class="itinerary-board__days" id="itinerary-days"></div>
        </div>
      </section>`;
  }

  function renderHeader() {
    const c = ctx.charter || {};
    panel.querySelector("#itinerary-title").textContent = c.name || ctx.charterId;
    const n = dayCount();
    const dates = c.start_date && c.end_date ? `${c.start_date} → ${c.end_date} · ${n} day${n === 1 ? "" : "s"}` : "Set the charter dates on Charter Info";
    panel.querySelector("#itinerary-dates").textContent = dates;
    const actions = panel.querySelector("#itinerary-actions");
    actions.replaceChildren(
      el("button", { type: "button", class: "itinerary-action", "data-action": "edit-route", disabled: "" }, "Edit route"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "apply-route", disabled: "" }, "Apply library route…"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "promote", disabled: "" }, "Promote to library…")
    );
    // The buttons are enabled by plan 3 (Save, Apply, Promote) and plan 4 (Edit route).
  }

  function renderWelcome() {
    const box = panel.querySelector("#itinerary-welcome");
    const text = work.itinerary.welcome_message;
    box.replaceChildren(
      el("div", { class: "itinerary-welcome__label label" }, "Welcome message"),
      el("div", { class: `itinerary-welcome__text${text ? "" : " muted"}` }, text || "No welcome message yet.")
    );
  }

  function activityRow(activity) {
    const firstLine = (activity.notes || "").split("\n")[0];
    return el("div", { class: `itinerary-activity${activity.site_id ? " itinerary-activity--site" : " itinerary-activity--free"}`, "data-activity-id": activity.id },
      el("span", { class: "itinerary-activity__grip", "aria-hidden": "true" }, "⋮⋮"),
      el("span", { class: "itinerary-activity__title" }, activity.title || (activity.site_id ? siteTitle(activity.site_id) : "Untitled")),
      activity.time ? el("span", { class: "itinerary-activity__time" }, activity.time) : null,
      firstLine ? el("span", { class: "itinerary-activity__notes muted" }, firstLine) : null
    );
  }

  function subBox(stop, day) {
    return el("div", { class: "itinerary-sub", "data-stop-id": stop.id, "data-day": String(day) },
      el("div", { class: "itinerary-sub__gutter" },
        el("button", { type: "button", class: "itinerary-sub__add", title: `Add a site or activity at ${stop.name}`, disabled: "" }, "+")),
      el("div", { class: "itinerary-sub__activities" }, ...stop.activities.map(activityRow))
    );
  }

  function dayBox(day) {
    const date = core().dayDateLabel(ctx.charter, day.day);
    const isLast = day.day === dayCount();
    const ends = isLast && ctx.charter && ctx.charter.end_time ? ` · ends ${ctx.charter.end_time}` : "";
    return el("div", { class: "itinerary-day", "data-day": String(day.day) },
      el("div", { class: "itinerary-day__title" }, `Day ${day.day}`, el("span", { class: "muted" }, date ? ` · ${date}${ends}` : ends)),
      ...day.stops.map((stop) => subBox(stop, day.day)),
      day.stops.length ? null : el("div", { class: "itinerary-day__passage muted" }, passageLabel(day.day))
    );
  }

  // "Underway · Potipot to Hundred Islands" for a day with no stops.
  function passageLabel(dayNumber) {
    const stops = core().stopEntries(work.itinerary.route.points).map((e) => e.point);
    const before = [...stops].reverse().find((s) => s.depart && s.depart.day < dayNumber);
    const after = stops.find((s) => s.arrive && s.arrive.day > dayNumber);
    if (before && after) return `Underway · ${before.name || "previous stop"} to ${after.name || "next stop"}`;
    return "At sea";
  }

  function renderDays() {
    const n = dayCount();
    const days = core().deriveDays(work.itinerary, n);
    const daysEl = panel.querySelector("#itinerary-days");
    daysEl.replaceChildren(...days.map(dayBox));
    const hint = panel.querySelector("#itinerary-hint");
    const hasStops = core().stopEntries(work.itinerary.route.points).length > 0;
    hint.hidden = Boolean(n) && hasStops;
    hint.textContent = !n ? "Set the charter's start and end dates to lay out the days." : "Apply a library route or Edit route to start.";
    return days;
  }

  function renderAll() {
    renderHeader();
    renderWelcome();
    const days = renderDays();
    requestAnimationFrame(() => drawLine(days));
  }

  // Filled in by Task 5.
  function drawLine() {}

  function bind(opts) {
    panel = document.getElementById("itinerary-panel");
    if (!panel) return;
    ctx = { charterId: opts.charterId, charter: opts.charter || {}, siteLibrary: opts.siteLibrary || { sites: [] } };
    const itinerary = core().normalizeItinerary(opts.itinerary);
    work = { itinerary, savedJson: core().itinerarySnapshot(itinerary), baseRevision: itinerary.revision };
    if (!resizeBound) {
      window.addEventListener("resize", () => { if (panel && panel.isConnected && work) drawLine(core().deriveDays(work.itinerary, dayCount())); });
      resizeBound = true;
    }
    renderAll();
  }

  window.IolantheItinerary = Object.freeze({ render, bind });
})();
```

- [ ] **Step 2: Syntax check**

Run: `node --check itinerary.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add itinerary.js
git commit -m "feat(itinerary): Itinerary panel shell - header, welcome, day rows, sub-boxes, activities

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Draw the line and the titles column

**Files:**
- Modify: `itinerary.js` (replace the `drawLine` stub)

- [ ] **Step 1: Replace `drawLine`**

Replace `function drawLine() {}` with:

```js
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
    return node;
  };
  const LINE_X = 20;        // x of the line inside the 40px middle column
  const LOOP_W = 18;        // loop (dwell) width
  const DOT_R = 7;

  // Measures each sub-box, asks core for the geometry, then draws the SVG and places the titles.
  function drawLine(days) {
    const board = panel.querySelector("#itinerary-board");
    const daysEl = panel.querySelector("#itinerary-days");
    const svg = panel.querySelector("#itinerary-line");
    const titles = panel.querySelector("#itinerary-titles");
    const boardTop = board.getBoundingClientRect().top;
    const centres = new Map();
    daysEl.querySelectorAll(".itinerary-sub").forEach((node) => {
      const r = node.getBoundingClientRect();
      centres.set(`${node.dataset.stopId}:${node.dataset.day}`, r.top + r.height / 2 - boardTop);
    });
    const height = Math.max(daysEl.offsetHeight, 1);
    svg.setAttribute("viewBox", `0 0 40 ${height}`);
    svg.setAttribute("width", "40");
    svg.setAttribute("height", String(height));
    svg.replaceChildren();
    titles.replaceChildren();
    titles.style.height = `${height}px`;

    const geo = core().lineGeometry(days, centres);
    if (!geo.shapes.length) return;

    const stopsById = new Map(core().stopEntries(work.itinerary.route.points).map((e) => [e.point.id, e.point]));
    const times = core().estimateTimes(work.itinerary);

    // The trunk line runs from the first shape to the last.
    svg.append(svgEl("line", { class: "itinerary-line__trunk", x1: LINE_X, y1: geo.top, x2: LINE_X, y2: geo.bottom }));

    geo.shapes.forEach((shape) => {
      if (shape.terminal === "origin") {
        // Underground-style open loop: a U open at the top with the stem continuing down.
        svg.append(svgEl("path", { class: "itinerary-line__terminal", d: `M ${LINE_X - 9} ${shape.y1 - 14} V ${shape.y1} A 9 9 0 0 0 ${LINE_X + 9} ${shape.y1} V ${shape.y1 - 14}` }));
      } else if (shape.terminal === "terminus") {
        svg.append(svgEl("path", { class: "itinerary-line__terminal", d: `M ${LINE_X - 9} ${shape.y2 + 14} V ${shape.y2} A 9 9 0 0 1 ${LINE_X + 9} ${shape.y2} V ${shape.y2 + 14}` }));
      } else if (shape.kind === "loop") {
        svg.append(svgEl("rect", { class: "itinerary-line__loop", x: LINE_X - LOOP_W / 2, y: shape.y1 - 9, width: LOOP_W, height: shape.y2 - shape.y1 + 18, rx: 9 }));
      } else {
        svg.append(svgEl("circle", { class: "itinerary-line__dot", cx: LINE_X, cy: shape.y1, r: DOT_R }));
      }
      const stop = stopsById.get(shape.stopId);
      if (!stop) return;
      const title = el("div", { class: "itinerary-stop-title", "data-stop-id": shape.stopId },
        el("div", { class: "itinerary-stop-title__name" }, stop.name || "Stop"),
        el("div", { class: "itinerary-stop-title__times muted" }, core().stopTimesLabel(stop, times.get(shape.stopId)))
      );
      title.style.top = `${(shape.y1 + shape.y2) / 2}px`;
      titles.append(title);
    });
  }
```

Estimated times are shown with `~`; the CSS in Task 6 italicises the whole times line when it contains a `~` via a class, so also change the times `el(...)` to:

```js
        el("div", { class: `itinerary-stop-title__times muted${/~/.test(core().stopTimesLabel(stop, times.get(shape.stopId))) ? " itinerary-stop-title__times--est" : ""}` }, core().stopTimesLabel(stop, times.get(shape.stopId)))
```

- [ ] **Step 2: Syntax check and commit**

Run: `node --check itinerary.js` → no output.

```bash
git add itinerary.js
git commit -m "feat(itinerary): draw the tube line, terminus loops and the stop titles column

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `itinerary.css`

**Files:**
- Create: `itinerary.css`

- [ ] **Step 1: Create the stylesheet**

```css
/* Charter → Itinerary panel. Scoped under .itinerary-panel; mirrors the Routes panel's variable overrides. */
.itinerary-panel {
  --panel: #f4f6f7;
  --card-bg: #dfe6e9;
  --ink: #172026;
  --muted: #5f6b73;
  --line: #d7dde1;
  --soft: #eef2f4;
  --accent: #176f7a;
  --accent-dark: #0e4f58;
  --route: #8b0000;        /* the tube line */
  --day: rgba(120, 160, 255, 0.07);
  --day-border: rgba(120, 160, 255, 0.55);
  --sub-border: rgba(120, 160, 255, 0.45);
  --act-border: rgba(70, 170, 200, 0.8);
  color: var(--ink);
}
.itinerary-panel.card { background: var(--card-bg); }

.itinerary-panel__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.itinerary-panel__header h2 { margin: 0 0 4px; }
.itinerary-panel__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.itinerary-action { border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 6px; padding: 8px 12px; font: inherit; cursor: pointer; }
.itinerary-action:disabled { opacity: 0.5; cursor: default; }
.itinerary-action--primary { background: var(--accent); border-color: var(--accent); color: #fff; }

.itinerary-panel__welcome { margin: 16px 0; padding: 12px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.itinerary-welcome__label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-bottom: 4px; }
.itinerary-welcome__text { white-space: pre-wrap; }
.itinerary-panel__hint { margin: 8px 0 16px; }

/* Board: titles | line | days */
.itinerary-board { display: grid; grid-template-columns: minmax(120px, 180px) 40px minmax(0, 1fr); gap: 0 8px; position: relative; align-items: start; }
.itinerary-board__titles { position: relative; }
.itinerary-board__line { display: block; overflow: visible; }
.itinerary-board__days { display: flex; flex-direction: column; gap: 0; }

.itinerary-stop-title { position: absolute; right: 0; transform: translateY(-50%); text-align: right; max-width: 100%; }
.itinerary-stop-title__name { font-weight: 700; font-size: 13px; line-height: 1.2; }
.itinerary-stop-title__times { font-size: 11px; line-height: 1.3; white-space: nowrap; }
.itinerary-stop-title__times--est { font-style: italic; }

.itinerary-line__trunk { stroke: var(--route); stroke-width: 6; stroke-linecap: round; }
.itinerary-line__terminal { stroke: var(--route); stroke-width: 5; fill: none; stroke-linecap: round; }
.itinerary-line__loop { fill: #fff; stroke: var(--route); stroke-width: 4; }
.itinerary-line__dot { fill: var(--route); stroke: #fff; stroke-width: 2; }

.itinerary-day { background: var(--day); border: 1.4px solid var(--day-border); border-radius: 6px; padding: 8px 10px 10px; margin-bottom: 0; }
.itinerary-day + .itinerary-day { margin-top: 0; border-top-left-radius: 0; border-top-right-radius: 0; border-top: none; }
.itinerary-day:first-child { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.itinerary-day:not(:first-child):not(:last-child) { border-radius: 0; }
.itinerary-day__title { font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.itinerary-day__passage { font-size: 12px; padding: 6px 0 2px; }

.itinerary-sub { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 6px; background: rgba(255, 255, 255, 0.5); border: 1px solid var(--sub-border); border-radius: 4px; padding: 6px; min-height: 34px; }
.itinerary-sub + .itinerary-sub { margin-top: 4px; }
.itinerary-sub__gutter { display: flex; align-items: flex-start; justify-content: center; }
.itinerary-sub__add { width: 22px; height: 22px; border-radius: 50%; border: 1px dashed var(--muted); background: transparent; color: var(--muted); font: inherit; line-height: 1; cursor: pointer; }
.itinerary-sub__add:disabled { cursor: default; opacity: 0.5; }
.itinerary-sub__activities { display: flex; flex-direction: column; gap: 4px; }

.itinerary-activity { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 0 8px; align-items: baseline; background: rgba(255, 255, 255, 0.95); border: 1px solid var(--act-border); border-radius: 3px; padding: 3px 8px; font-size: 12.5px; }
.itinerary-activity--free { border-style: dashed; }
.itinerary-activity__grip { opacity: 0.4; cursor: grab; user-select: none; }
.itinerary-activity__title { font-weight: 500; }
.itinerary-activity__time { font-variant-numeric: tabular-nums; color: var(--muted); }
.itinerary-activity__notes { grid-column: 2 / span 2; font-size: 11.5px; }

@media (max-width: 720px) {
  .itinerary-board { grid-template-columns: minmax(90px, 120px) 32px minmax(0, 1fr); }
  .itinerary-stop-title__times { white-space: normal; }
}
```

- [ ] **Step 2: Commit**

```bash
git add itinerary.css
git commit -m "feat(itinerary): panel styles for the tube line, day rows and activities

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Mount the panel from `admin.js` and `index.html`

**Files:**
- Modify: `index.html` (lines 13-14 stylesheets, 102-110 scripts)
- Modify: `admin.js` (`charterPanelContent` ~7880, `bindCharterPanel` ~7915, `renderCharter` ~7965)

- [ ] **Step 1: Script and stylesheet tags**

In `index.html` after the `routes.css` link add:

```html
  <link rel="stylesheet" href="/admin/itinerary.css?v=admin-itin-v1">
```

After the `routes.js` script tag add:

```html
  <script src="/admin/itinerary-core.js?v=admin-itin-v1" defer></script>
  <script src="/admin/itinerary.js?v=admin-itin-v1" defer></script>
```

(`itinerary.js` uses `IolantheRoutesUi.el`, so it must load after `routes-ui.js`; `defer` keeps document order.)

- [ ] **Step 2: Dispatcher**

In `charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary)` replace the `"itinerary"` branch's `return renderItineraryPanel(itinerary, charterInfo);` with:

```js
    return window.IolantheItinerary ? window.IolantheItinerary.render() : placeholderCard("Itinerary");
```

In `bindCharterPanel(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary)` add before the `routes` branch:

```js
    if (activePanel === "itinerary") {
      if (window.IolantheItinerary) {
        window.IolantheItinerary.bind({ charterId: state.selectedCharter, charter: charterInfo, itinerary, siteLibrary });
      }
      return;
    }
```

and delete the old `bindItineraryPanel(charterInfo, itinerary, siteLibrary)` call for that panel.

In `renderCharter()` change

```js
      const itinerary = normalizeItineraryForCharter(charterInfo, bundle["itinerary.json"]);
```

to

```js
      const itinerary = bundle["itinerary.json"] || {};
```

`normalizeItineraryForCharter` and the rest of the v1 itinerary code stay in the file, unreferenced from the dispatcher, until plan 4 deletes them. Run `node --check admin.js`.

- [ ] **Step 3: Verify in the browser**

With the plan-1 server running on a migrated copy of local data, open `http://localhost:8000/admin/?key=<urlKey>`, log in as Charter Admin, pick a charter, open **Itinerary**. Check:

- the header shows the charter name, dates and day count; the three action buttons are present and disabled;
- the welcome message block shows the migrated text;
- one day box per charter day, each with "Day N · <date>"; sub-boxes with the migrated activities; a passage day shows "Underway · … to …";
- the line: terminus loops top and bottom, loops spanning the multi-night stops, dots for same-day stops, titles right-aligned with "Arr. … · Dep. …" where the migration set none (so all titles show only "N nights" or nothing). Resize the window: the line redraws.
- DevTools console: no errors. Switch to another charter: the panel re-renders.

Fix any layout mismatch against `tube-line-v5.html` before committing.

- [ ] **Step 4: Commit**

```bash
git add index.html admin.js
git commit -m "feat(itinerary): mount the new Itinerary panel from the charter dispatcher

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Static map thumbnail

**Files:**
- Modify: `itinerary.js` (`render`, `renderAll`)
- Modify: `itinerary.css`

- [ ] **Step 1: Add the thumbnail container**

In `render()` add inside `.itinerary-panel__header`, after the actions div:

```html
          <div class="itinerary-thumb" id="itinerary-thumb" title="Open the route"></div>
```

- [ ] **Step 2: Draw it as an SVG from the points**

Add to `itinerary.js` before `renderAll`:

```js
  // A static SVG of the route path and stops; no tiles, so it needs nothing from the network.
  function renderThumb() {
    const box = panel.querySelector("#itinerary-thumb");
    const points = work.itinerary.route.points;
    box.replaceChildren();
    if (points.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const W = 160, H = 110, PAD = 8;
    const lats = points.map((p) => p.latitude), lons = points.map((p) => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const spanLat = Math.max(maxLat - minLat, 0.0001), spanLon = Math.max((maxLon - minLon) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180), 0.0001);
    const scale = Math.min((W - 2 * PAD) / spanLon, (H - 2 * PAD) / spanLat);
    const x = (p) => PAD + ((p.longitude - minLon) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180)) * scale;
    const y = (p) => H - PAD - (p.latitude - minLat) * scale;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "itinerary-thumb__svg" });
    svg.append(svgEl("path", { class: "itinerary-thumb__path", d: points.map((p, i) => `${i ? "L" : "M"} ${x(p).toFixed(1)} ${y(p).toFixed(1)}`).join(" ") }));
    points.filter(core().isStop).forEach((p) => svg.append(svgEl("circle", { class: "itinerary-thumb__stop", cx: x(p).toFixed(1), cy: y(p).toFixed(1), r: 3 })));
    box.append(svg);
  }
```

Call `renderThumb();` inside `renderAll()` after `renderHeader();`. (Clicking through to the Route panel is wired in plan 4.)

- [ ] **Step 3: Styles**

Append to `itinerary.css`:

```css
.itinerary-thumb { width: 160px; height: 110px; background: rgba(80, 180, 120, 0.10); border: 1px solid rgba(80, 180, 120, 0.6); border-radius: 6px; overflow: hidden; cursor: pointer; }
.itinerary-thumb__path { fill: none; stroke: var(--route); stroke-width: 2; stroke-linejoin: round; }
.itinerary-thumb__stop { fill: var(--route); stroke: #fff; stroke-width: 1; }
```

- [ ] **Step 4: Verify and commit**

Reload the admin Itinerary panel: the thumbnail shows the path and stop dots top right. Bump nothing (the `?v=admin-itin-v1` strings were new in Task 7). Commit:

```bash
git add itinerary.js itinerary.css
git commit -m "feat(itinerary): static route thumbnail in the panel header

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Spec coverage check (plan self-review)

| Spec A item | Task |
|---|---|
| §4.1 titles column, line, day boxes, sub-boxes, activities, hints, thumbnail | 4, 5, 6, 8 |
| §4.1 estimated vs set times (italic, `~`) | 2, 5 |
| §4.8 `itinerary-core.js` pure + tests (`deriveDays`, `estimateTimes`, `normalizeItinerary`, `validateItinerary`) | 1, 2, 3 |
| §4.8 `itinerary.js`, `itinerary.css`, `IolantheAdmin` bridge | 4, 6, 7 |
| §4.7 Route Upload removal (part) | 0 |
| §4.2 edge drags, §4.3 popover, §4.4 activity editing, §4.5 saving, §4.6 actions | plan 3 |
| §4.8 `edgeStates`, `moveEdge`, `canDropActivity`, `promoteRoute` | plan 3 |
| §5 Route panel charter mode | plan 4 |
| §4.7 remaining removals | plan 4 |
