# Spec A2 — Plan 1 of 2: Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `iolanthe-server` the spec A2 record shape (one shape for charter and unassigned routes, item durations, dirty stops, anchorage kinds), replace the apply-route endpoint with a re-basing import, and migrate the data once.

**Architecture:** All logic stays in the pure module `lib/itinerary.js`; `lib/route-library.js` only learns to pass the new point fields through; `server.js` gets one new thin handler, loses one, and registers migration v5. The guest is untouched and the public endpoints do not change.

**Tech Stack:** Node (CommonJS, no dependencies), `node:test`. Repo: `S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server`, branch from `main` (a14009f or later). Spec: `portal/iolanthe-admin/docs/charter-rework/spec-a2.md` §3, §4, §7.

**Spec amendment recorded here:** spec A §2.1 rejected any day after the charter's last day. Spec A2 lets an import run over the charter and reports it with the fit pill, so that one rule is removed from `validateItinerary` (server here, admin in plan 2). Days must still never run backwards along the route.

**Reading before you start:** `lib/itinerary.js` in full (563 lines; you will be editing it throughout), `lib/route-library.js` lines 83–128 and 247–309, `test/itinerary.test.js` lines 1–110 (fixtures `seq`, `P`, `sevenDays`) and 212–227 (`northLoop`, `opts`), `server.js` 6241–6305 and 7183–7234. Line numbers are from a14009f and drift as you edit; search by name.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/itinerary.js` (modify) | Normalisation of the new fields; `daysFromTemplate`; `shiftDays`; `upgradeUnassignedRoute`; `normalizeUnassignedRoute`; `importRecord` (replaces `applyRoute`); validation amendment. |
| `test/itinerary.test.js` (modify) | Tests for each; the `applyRoute` tests are deleted with the function. |
| `lib/route-library.js` (modify) | Points pass `id`, `arrive`, `depart` through and drop the legacy template fields; routes carry `activities`; anchorages carry `kind`; `writeRoutes` exported for the migration. |
| `test/route-library.test.js` (modify) | Tests for the above. |
| `server.js` (modify) | `importRecordToCharter` + `itinerary/import`; `applyRouteToCharter` + its route removed; routes GET/save wrap the record normalisers; charter summaries gain `stops`; migration v5. |
| `data-templates/schema-version.json` (modify) | Version 5. |
| `scripts/check-itinerary-endpoints.sh` (modify) | Checks 8–10. |
| `CLAUDE.md` (modify) | Endpoints and migration. |

---

### Task 1: Normalise `duration_min` and `dirty_stop_ids`; drop the over-the-end rule

**Files:**
- Modify: `lib/itinerary.js` (`normalizeActivity`, `normalizeItinerary`, `validateItinerary`)
- Modify: `test/itinerary.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/itinerary.test.js`:

```js
// ---- spec A2 ----------------------------------------------------------------

test("A2 normalize: duration_min kept when an integer, dirty_stop_ids kept only for existing stops", () => {
  const it = lib.normalizeItinerary({
    version: 2,
    route: { points: [P(1, 1, { stop: true, id: "stp_a", depart: { day: 1 } }), P(2, 2, { stop: true, id: "stp_b", arrive: { day: 1 } })] },
    activities: [
      { id: "act_1", stop_id: "stp_a", day: 1, title: "x", duration_min: 90 },
      { id: "act_2", stop_id: "stp_a", day: 1, title: "y", duration_min: "45" },
      { id: "act_3", stop_id: "stp_a", day: 1, title: "z", duration_min: 7.5 }
    ],
    dirty_stop_ids: ["stp_b", "stp_nope", "stp_b", 7]
  }, seq());
  assert.deepEqual(it.activities.map((a) => a.duration_min), [90, 45, undefined]);
  assert.deepEqual(it.dirty_stop_ids, ["stp_b"]);
  assert.deepEqual(lib.normalizeItinerary({}).dirty_stop_ids, []);
});

test("A2 validate: duration bounds are errors; a day past the charter's end is NOT an error any more", () => {
  const it = sevenDays();
  it.activities[0].duration_min = 3;
  assert.deepEqual(lib.validateItinerary(it, 7).map((e) => e.field), ["activities[0].duration_min"]);
  it.activities[0].duration_min = 1441;
  assert.deepEqual(lib.validateItinerary(it, 7).map((e) => e.field), ["activities[0].duration_min"]);
  it.activities[0].duration_min = 60;
  it.route.points[7].arrive = { day: 9 };          // terminus two days past a 7-day charter
  assert.deepEqual(lib.validateItinerary(it, 7), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/itinerary.test.js`
Expected: the first fails on `duration_min` being `undefined` for all three; the second fails because the `dayCount` rule still fires.

- [ ] **Step 3: Implement**

In `lib/itinerary.js`:

Add the constants after `MAX_NOTES_LENGTH`:

```js
const MIN_DURATION_MIN = 5;
const MAX_DURATION_MIN = 1440;
```

In `normalizeActivity`, after the `time` handling, add:

```js
  const duration = Number(a.duration_min);
  if (Number.isInteger(duration)) out.duration_min = duration;
```

In `normalizeItinerary`, replace the returned object with:

```js
  const points = (Array.isArray(route.points) ? route.points : []).map((p) => normalizePoint(p, random, options)).filter(Boolean);
  const stopIds = new Set(points.filter(isStop).map((p) => p.id));
  const dirty = Array.isArray(v.dirty_stop_ids) ? v.dirty_stop_ids : [];
  return {
    version: ITINERARY_VERSION,
    revision: Number.isInteger(revision) && revision >= 0 ? revision : 0,
    welcome_message: toStr(v.welcome_message, MAX_NOTES_LENGTH),
    summary: toStr(v.summary, MAX_NOTES_LENGTH),
    route: {
      source: route.source && typeof route.source === "object" && !Array.isArray(route.source) ? route.source : null,
      speed_kn: cleanSpeed(route.speed_kn, DEFAULT_SPEED_KN),
      points
    },
    activities: (Array.isArray(v.activities) ? v.activities : []).map((a) => normalizeActivity(a, random)).filter(Boolean),
    dirty_stop_ids: [...new Set(dirty.filter((id) => typeof id === "string" && stopIds.has(id)))]
  };
```

In `validateItinerary`:
- delete the two lines that push `` `${field}.arrive.day` `` / `` `${field}.depart.day` `` for `> dayCount` (the "after the charter's last day" checks);
- in the activities loop, after the `title` check, add:

```js
    if (a.duration_min !== undefined && (a.duration_min < MIN_DURATION_MIN || a.duration_min > MAX_DURATION_MIN)) {
      push(`${field}.duration_min`, `Activity "${name}" duration must be between ${MIN_DURATION_MIN} minutes and ${MAX_DURATION_MIN / 60} hours.`);
    }
```

Update the existing test `normalizeItinerary: fills defaults and drops junk`: its expected object gains `dirty_stop_ids: []`
after `activities: []`.

Also delete the now-dead test `validateItinerary: each rule produces one error with a field path`'s `tooLate` case: remove the two lines

```js
  const tooLate = sevenDays(); tooLate.route.points[7].arrive = { day: 8 };
  assert.deepEqual(messages(tooLate), ["route.points[7].arrive.day"]);
```

Add `MIN_DURATION_MIN, MAX_DURATION_MIN` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/itinerary.test.js`
Expected: `# fail 0` (29 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "feat(itinerary): item duration, dirty stop ids; drop the over-the-end rule (spec A2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `daysFromTemplate`, `shiftDays`

These are the building blocks for importing and for migrating legacy library routes.

**Files:**
- Modify: `lib/itinerary.js`, `test/itinerary.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
test("daysFromTemplate: nights/depart_time on template stops become arrive/depart days from day 1", () => {
  const pts = lib.normalizeItinerary({ route: { points: northLoop().points } }, seq(), { keepTemplate: true }).route.points;
  const out = lib.daysFromTemplate(pts, 8);
  const stops = out.filter(lib.isStop);
  assert.deepEqual(stops.map((s) => [s.arrive && s.arrive.day, s.depart && s.depart.day]), [[undefined, 1], [1, 2], [2, 4], [5, 6], [6, undefined]]);
  assert.deepEqual(stops[0].depart, { day: 1, time: "09:00" });
  assert.deepEqual(stops[2].depart, { day: 4, time: "18:00" });
  stops.forEach((s) => { assert.equal(s.nights, undefined); assert.equal(s.depart_time, undefined); });
});

test("daysFromTemplate: stops that already have days are left alone; waypoints untouched", () => {
  const pts = sevenDays().route.points;
  assert.deepEqual(lib.daysFromTemplate(pts, 8), pts);
});

test("shiftDays moves every stop's days and every item's day; input untouched", () => {
  const it = sevenDays();
  const shifted = lib.shiftDays(it.route.points, it.activities, 3);
  const stops = shifted.points.filter(lib.isStop);
  assert.deepEqual(stops[0].depart, { day: 4, time: "09:00" });
  assert.deepEqual([stops[4].arrive.day, stops[4].depart.day], [6, 8]);
  assert.deepEqual(shifted.activities.map((a) => a.day), [4, 4, 7, 6]);
  assert.deepEqual(it.activities.map((a) => a.day), [1, 1, 4, 3]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/itinerary.test.js` → FAIL with `lib.daysFromTemplate is not a function`.

- [ ] **Step 3: Implement**

Insert before `// ---- applying a library route` (or, if you prefer, right after `extraDaysForLeg`):

```js
// ---- template days and shifting (spec A2) -------------------------------------------

// Lays arrive/depart days onto stops that have none, from legacy `nights` / `depart_time` template fields (one
// night per anchorage stop when unset). Stops that already carry days are left as they are. Strips the template fields.
function daysFromTemplate(points, speedKn) {
  const list = (points || []).map((p) => ({ ...p }));
  const stops = stopEntries(list);
  if (!stops.length) return list;
  const needsDays = stops.some((e, i) => {
    const isFirst = i === 0;
    const isLast = i === stops.length - 1;
    return (!isFirst && !e.point.arrive) || (!isLast && !e.point.depart);
  });
  if (!needsDays) {
    stops.forEach((e) => { delete list[e.index].nights; delete list[e.index].depart_time; });
    return list;
  }
  let prev = null;
  stops.forEach((entry, i) => {
    const p = list[entry.index];
    const nights = Number.isInteger(p.nights) ? p.nights : defaultNights(p);
    const departTime = p.depart_time;
    delete p.nights;
    delete p.depart_time;
    delete p.arrive;
    delete p.depart;
    const isLast = i === stops.length - 1;
    if (!prev) {
      p.depart = { day: 1 + nights };
    } else {
      const hours = legHours(list, prev.index, entry.index, speedKn || DEFAULT_SPEED_KN);
      const arriveDay = prev.point.depart.day + extraDaysForLeg(prev.point.depart.time, hours);
      p.arrive = { day: arriveDay };
      p.depart = { day: arriveDay + nights };
    }
    if (departTime && p.depart) p.depart.time = departTime;
    if (isLast) delete p.depart;
    prev = { index: entry.index, point: p };
  });
  return list;
}

// Shifts every stop's arrive/depart day and every activity's day by `delta`. Returns new arrays.
function shiftDays(points, activities, delta) {
  const shiftDt = (dt) => (dt ? { ...dt, day: dt.day + delta } : dt);
  return {
    points: (points || []).map((p) => (isStop(p) ? { ...p, ...(p.arrive ? { arrive: shiftDt(p.arrive) } : {}), ...(p.depart ? { depart: shiftDt(p.depart) } : {}) } : { ...p })),
    activities: (activities || []).map((a) => ({ ...a, day: a.day + delta }))
  };
}
```

`defaultNights` already exists (defined with `applyRoute`); if Task 3 later deletes `applyRoute`, keep `defaultNights`, `legHours`, `extraDaysForLeg` and `SEED_DEPART_TIME`, which these functions use.

Add `daysFromTemplate, shiftDays` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/itinerary.test.js` → `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "feat(itinerary): daysFromTemplate and shiftDays

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `upgradeUnassignedRoute`, `normalizeUnassignedRoute`

An unassigned route is a `routes.json` entry: `{ id, name, description, revision, speed_kn, source, points, activities? }`. These two functions make it the same shape as a charter record on the way out and on the way in.

**Files:**
- Modify: `lib/itinerary.js`, `test/itinerary.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
test("upgradeUnassignedRoute: a legacy route gains days from its template fields and an empty activities list", () => {
  const out = lib.upgradeUnassignedRoute(northLoop());
  assert.equal(out.id, "north-loop");
  assert.equal(out.revision, 4);
  const stops = out.points.filter(lib.isStop);
  assert.deepEqual(stops.map((s) => [s.arrive && s.arrive.day, s.depart && s.depart.day]), [[undefined, 1], [1, 2], [2, 4], [5, 6], [6, undefined]]);
  stops.forEach((s) => assert.match(s.id, /^stp_/));
  assert.deepEqual(out.activities, []);
  assert.equal(out.points[0].nights, undefined);
});

test("upgradeUnassignedRoute: an already-upgraded route is unchanged", () => {
  const once = lib.upgradeUnassignedRoute(northLoop());
  assert.deepEqual(lib.upgradeUnassignedRoute(once), once);
});

test("normalizeUnassignedRoute: validates points and items like a charter record, with the terminus day as the day count", () => {
  const it = sevenDays();
  const route = { id: "r", name: "Seven", description: "", speed_kn: it.route.speed_kn, source: { type: "planner" }, points: it.route.points, activities: it.activities };
  const ok = lib.normalizeUnassignedRoute(route);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.route.activities.length, 4);
  assert.equal(ok.route.points.filter(lib.isStop)[0].id, "stp_subic1");
  const bad = lib.normalizeUnassignedRoute({ ...route, activities: [{ id: "act_x", stop_id: "stp_nope", day: 1, title: "x" }] });
  assert.deepEqual(bad.errors.map((e) => e.field), ["activities[0].stop_id"]);
  const legacy = lib.normalizeUnassignedRoute(northLoop());
  assert.equal(legacy.errors.length, 0);
  assert.deepEqual(legacy.route.points.filter(lib.isStop)[2].depart, { day: 4, time: "18:00" });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/itinerary.test.js` → FAIL with `lib.upgradeUnassignedRoute is not a function`.

- [ ] **Step 3: Implement**

Insert after `shiftDays`:

```js
// ---- unassigned routes (library/routes.json) share the record shape ------------------

function recordDayCount(points) {
  const stops = stopEntries(points);
  if (!stops.length) return 0;
  const last = stops[stops.length - 1].point;
  return Math.max(1, last.arrive ? last.arrive.day : (last.depart ? last.depart.day : 1));
}

// Read side: a stored route (possibly legacy, with nights/depart_time and no ids) as a record. Idempotent.
function upgradeUnassignedRoute(route, random = Math.random) {
  const r = toObj(route);
  const normalized = normalizeItinerary({ version: ITINERARY_VERSION, route: { points: r.points, speed_kn: r.speed_kn }, activities: r.activities }, random, { keepTemplate: true });
  const points = daysFromTemplate(normalized.route.points, normalized.route.speed_kn);
  return { ...r, speed_kn: normalized.route.speed_kn, points, activities: normalized.activities };
}

// Write side: what the admin sends to routes/save. Returns { route, errors }.
function normalizeUnassignedRoute(route, random = Math.random) {
  const upgraded = upgradeUnassignedRoute(route, random);
  const asRecord = { version: ITINERARY_VERSION, route: { points: upgraded.points, speed_kn: upgraded.speed_kn }, activities: upgraded.activities };
  const errors = validateItinerary(asRecord, recordDayCount(upgraded.points));
  return { route: upgraded, errors };
}
```

Add `recordDayCount, upgradeUnassignedRoute, normalizeUnassignedRoute` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/itinerary.test.js` → `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "feat(itinerary): unassigned routes share the record shape (upgrade/normalize)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `importRecord` replaces `applyRoute`

**Files:**
- Modify: `lib/itinerary.js`, `test/itinerary.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
// A charter-shaped source record: the seven-day fixture with a name, as another charter's itinerary would arrive.
const charterSource = () => ({ ...sevenDays(), name: "Reyes 2026" });
// The plan-1 `seq()` random repeats after 36 values (six ids); imports mint many ids, so use a longer period here.
const a2opts = () => ({ random: (() => { let i = 0; return () => (i = (i + 7) % 997) / 997; })(), now: "2026-10-07T10:00:00Z", siteTitle: (id) => siteTitles[id] });

test("importRecord from day 1 onto an empty itinerary: day 1 of the record lands on day 1, a night at the origin survives, items kept, no dirty stops", () => {
  const src = lib.shiftDays(sevenDays().route.points, sevenDays().activities, 1);   // origin now leaves on day 2: one night aboard at the dock
  const record = { ...sevenDays(), route: { ...sevenDays().route, points: src.points }, activities: src.activities };
  const out = lib.importRecord(lib.normalizeItinerary({}), record, { type: "charter", id: "reyes" }, 1, 8, a2opts());
  const stops = lib.stopEntries(out.route.points).map((e) => e.point);
  assert.equal(stops.length, 7);
  assert.deepEqual(stops[0].depart, { day: 2, time: "09:00" });                 // kept, not pulled back to day 1
  assert.deepEqual([stops[4].arrive.day, stops[4].depart.day], [4, 6]);
  assert.equal(out.activities.length, 4);
  assert.deepEqual(out.activities.map((a) => a.day).sort(), [2, 2, 4, 5]);
  stops.forEach((s) => assert.match(s.id, /^stp_/));
  assert.ok(!stops.some((s) => s.id === "stp_poti"));                            // fresh ids
  assert.ok(out.activities.every((a) => stops.some((s) => s.id === a.stop_id))); // remapped
  assert.deepEqual(out.dirty_stop_ids, []);
  assert.deepEqual(out.route.source, { type: "import", from: { type: "charter", id: "reyes" }, from_day: 1, strip_items: false, imported_at: "2026-10-07T10:00:00Z" });
  assert.deepEqual(lib.validateItinerary(out, 8), []);
});

test("importRecord: strip_items drops the record's items but keeps the kept stops' own", () => {
  const out = lib.importRecord(sevenDays(), charterSource(), { type: "charter", id: "x" }, 4, 7, { ...a2opts(), stripItems: true });
  assert.ok(out.activities.some((a) => a.id === "act_4"));    // Potipot day 3, kept stop
  assert.ok(!out.activities.some((a) => /Sundowners|Lighthouse|Beach|Kayaks/.test(a.title) && a.day >= 4 && a.stop_id !== "stp_poti"));
  assert.equal(out.route.source.strip_items, true);
});

test("importRecord mid-charter: keeps reached stops, closes the current one, re-bases the record onto the from-day", () => {
  const out = lib.importRecord(sevenDays(), lib.upgradeUnassignedRoute(northLoop()), { type: "library", id: "north-loop" }, 4, 7, a2opts());
  const stops = lib.stopEntries(out.route.points).map((e) => e.point);
  assert.deepEqual(stops.slice(0, 5).map((s) => s.id), ["stp_subic1", "stp_anaw", "stp_capo", "stp_herm", "stp_poti"]);
  assert.deepEqual(stops[4].depart, { day: 4, time: "18:00" });                   // Potipot closed on day 4
  const imported = stops.slice(5);
  assert.deepEqual(imported.map((s) => s.name), ["Subic Bay", "Capones Is.", "Potipot", "Hundred Islands", "Subic Bay"]);
  assert.deepEqual(imported[0].arrive, { day: 4 });                              // record origin becomes a middle stop reached on the from-day
  assert.deepEqual(imported[0].depart, { day: 4, time: "09:00" });               // its day-1 departure, re-based to day 4
  assert.deepEqual([imported[2].arrive.day, imported[2].depart.day], [5, 7]);    // Potipot 2–4 → 5–7
  assert.equal(imported[4].depart, undefined);
  assert.equal(imported[4].arrive.day, 9);                                       // runs past the 7-day charter: allowed
  assert.deepEqual(lib.validateItinerary(out, 7), []);
  assert.deepEqual(out.dirty_stop_ids, []);
});

test("importRecord: same-spot first stop merges into the kept stop, keeping its id and union of sites", () => {
  const record = lib.upgradeUnassignedRoute({ id: "s", name: "South", revision: 1, speed_kn: 8, points: [
    P(15.60, 119.90, { anchorage_id: "potipot", name: "Potipot", site_ids: ["sandbar", "reef"], nights: 1 }),
    P(14.95, 120.11, { anchorage_id: "capones", name: "Capones Is.", nights: 1 }),
    P(14.80, 120.27, { stop: true, name: "Subic Bay" })
  ] });
  const out = lib.importRecord(sevenDays(), record, { type: "library", id: "s" }, 4, 7, a2opts());
  const stops = lib.stopEntries(out.route.points).map((e) => e.point);
  assert.deepEqual(stops.map((s) => s.name), ["Subic Bay", "Anawangin", "Capones Is.", "Hermana Mayor", "Potipot", "Capones Is.", "Subic Bay"]);
  assert.equal(stops[4].id, "stp_poti");
  assert.deepEqual(stops[4].site_ids, ["potipot-beach", "sandbar", "reef"]);
  assert.deepEqual(stops[4].depart, { day: 4, time: "18:00" });                   // kept stop's own departure wins
  assert.deepEqual(stops[5].arrive, { day: 5 });                                  // record's Capones: day 2 → 5 (delta = fromDay − 1 = 3)
  assert.deepEqual(lib.validateItinerary(out, 7), []);
});

test("importRecord refuses only a record with no stops or a bad from-day", () => {
  assert.throws(() => lib.importRecord(sevenDays(), { points: [P(1, 1), P(2, 2)] }, { type: "library", id: "x" }, 1, 7, a2opts()), /has no stops/);
  assert.throws(() => lib.importRecord(sevenDays(), charterSource(), { type: "charter", id: "x" }, 0, 7, a2opts()), /between 1 and 7/);
  assert.throws(() => lib.importRecord(sevenDays(), charterSource(), { type: "charter", id: "x" }, 8, 7, a2opts()), /between 1 and 7/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/itinerary.test.js` → FAIL with `lib.importRecord is not a function`.

- [ ] **Step 3: Implement, and delete `applyRoute`**

Delete the whole `applyRoute` function and the five `applyRoute …` tests in `test/itinerary.test.js` (`applyRoute from day 1 onto an empty itinerary…`, `applyRoute mid-charter…`, `applyRoute refuses a route that does not fit…`, `applyRoute refuses a route with no stops…`). Keep `legHours`, `extraDaysForLeg`, `defaultNights`, `SEED_DEPART_TIME` and the `legHours` / `extraDaysForLeg` tests.

Insert in place of `applyRoute`:

```js
// ---- importing a record into a charter (spec A2 §4) ------------------------------------

// `current`: the charter's stored itinerary. `record`: a charter itinerary ({route, activities}) or an unassigned route
// ({points, activities}), legacy or not. `from`: { type: "library" | "charter", id }. Returns a new itinerary.
// Throws httpError 400 for a record without stops or a bad from-day. Never refuses for length.
function importRecord(current, record, from, fromDay, dayCount, options = {}) {
  const random = options.random || Math.random;
  const now = options.now || new Date().toISOString();
  const stripItems = Boolean(options.stripItems);
  const base = normalizeItinerary(current, random);
  const r = toObj(record);
  const source = upgradeUnassignedRoute(r.route ? { ...r, points: toObj(r.route).points, speed_kn: toObj(r.route).speed_kn } : r, random);
  if (!stopEntries(source.points).length) throw httpError(400, `Record "${source.name || from.id || "?"}" has no stops.`);
  if (!Number.isInteger(fromDay) || fromDay < 1 || (dayCount && fromDay > dayCount)) throw httpError(400, `From day must be between 1 and ${dayCount}.`);

  // 1. Keep every stop already reached before fromDay and the path up to the last of them; close it on fromDay.
  const stops = stopEntries(base.route.points);
  const keptStops = stops.filter((e, i) => stopSpan(e.point, positionOf(i, stops.length), dayCount).from < fromDay);
  let points = keptStops.length ? base.route.points.slice(0, keptStops[keptStops.length - 1].index + 1) : [];
  const keptIds = new Set(keptStops.map((e) => e.point.id));
  let activities = base.activities.filter((a) => keptIds.has(a.stop_id));
  let last = null;
  if (points.length) {
    const lastIndex = points.length - 1;
    last = { ...points[lastIndex] };
    if (!last.depart || last.depart.day >= fromDay) last.depart = { ...(last.depart || {}), day: fromDay };
    points[lastIndex] = last;
    activities = activities.filter((a) => a.stop_id !== last.id || a.day <= last.depart.day);
  }

  // 2. Re-base the record onto fromDay and give its stops fresh ids, remapping its items.
  // A record's days are relative to its day 1, so day 1 lands on fromDay (a night spent at the origin survives).
  const shifted = shiftDays(source.points, stripItems ? [] : source.activities, fromDay - 1);
  const idMap = new Map();
  let incoming = shifted.points.map((p) => {
    if (!isStop(p)) return p;
    const id = newId("stp", random);
    idMap.set(p.id, id);
    return { ...p, id };
  });
  let incomingActivities = shifted.activities.filter((a) => idMap.has(a.stop_id)).map((a) => ({ ...a, id: newId("act", random), stop_id: idMap.get(a.stop_id) }));

  // 3. Same spot as the kept stop → merge into it (keep its id and departure; union the sites; re-home its items).
  if (last && isStop(incoming[0]) && distM(last, incoming[0]) < SAME_SPOT_M) {
    const mergedId = incoming[0].id;
    points[points.length - 1] = { ...last, site_ids: [...new Set([...(last.site_ids || []), ...(incoming[0].site_ids || [])])] };
    incomingActivities = incomingActivities.map((a) => (a.stop_id === mergedId ? { ...a, stop_id: last.id, day: Math.min(a.day, last.depart.day) } : a));
    incoming = incoming.slice(1);
  }

  // 4. Origin / terminus shape. With kept stops the record's origin is a middle stop reached on fromDay.
  const incomingStops = stopEntries(incoming);
  if (incomingStops.length) {
    const first = { ...incoming[incomingStops[0].index] };
    if (last) {
      if (!first.arrive) first.arrive = { day: first.depart ? Math.min(first.depart.day, fromDay) : fromDay };
    } else {
      delete first.arrive;
    }
    incoming[incomingStops[0].index] = first;
    const lastIdx = incomingStops[incomingStops.length - 1].index;
    const terminus = { ...incoming[lastIdx] };
    delete terminus.depart;
    incoming[lastIdx] = terminus;
  }

  points = points.concat(incoming);
  activities = renumberImported(activities.concat(incomingActivities));
  const speedKn = keptStops.length ? base.route.speed_kn : (source.speed_kn || base.route.speed_kn);
  return {
    ...base,
    route: { source: { type: "import", from: { type: from.type, id: from.id }, from_day: fromDay, strip_items: stripItems, imported_at: now }, speed_kn: speedKn, points },
    activities,
    dirty_stop_ids: []
  };
}

// 0..n within each (stop, day) group, keeping relative order (same rule as the admin's renumberActivities).
function renumberImported(activities) {
  const groups = new Map();
  activities.forEach((a) => {
    const key = `${a.stop_id}:${a.day}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  });
  const orderOf = new Map();
  groups.forEach((list) => list.sort((a, b) => a.order - b.order).forEach((a, i) => orderOf.set(a.id, i)));
  return activities.map((a) => ({ ...a, order: orderOf.get(a.id) }));
}
```

Replace `applyRoute` with `importRecord` in the export block (keep `legHours, extraDaysForLeg`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/itinerary.test.js` → `# fail 0`. If the mid-charter test's `imported[4].arrive.day` differs by one, check `daysFromTemplate` on `northLoop` (the 61 nm Potipot → Hundred Islands leg at 18:00 crosses midnight: Hundred Islands arrives day 5 relative, 8 after re-basing +3 → Subic day 9). Fix the fixture, not the function, if the leg geometry was transcribed differently.

- [ ] **Step 5: Commit**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "feat(itinerary): importRecord re-bases a record onto a charter; applyRoute removed

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Route library — new point fields, activities, anchorage kind, `writeRoutes`

**Files:**
- Modify: `lib/route-library.js` (`normalizePoint` 83–128, `normalizeRouteInput` 146–165, `normalizeAnchorage` 247–268, exports)
- Modify: `test/route-library.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/route-library.test.js`:

```js
test("saveRoute keeps stop ids, arrive/depart days and activities; drops legacy nights/depart_time when days are present", () => {
  const dir = tempDir();
  const saved = lib.saveRoute(dir, { route: { id: "", name: "Record", speed_kn: 8, points: [
    { latitude: 14.8, longitude: 120.27, stop: true, id: "stp_a", name: "Subic", depart: { day: 1, time: "09:00" }, nights: 0, depart_time: "09:00" },
    { latitude: 14.9, longitude: 120.2 },
    { latitude: 14.95, longitude: 120.11, anchorage_id: "capones", id: "stp_b", arrive: { day: 1, time: "15:45" }, depart: { day: 2 }, nights: 1 }
  ], activities: [{ id: "act_1", stop_id: "stp_b", day: 1, order: 0, title: "Walk", notes: "", duration_min: 90 }] }, base_revision: 0 });
  assert.deepEqual(saved.points[0].depart, { day: 1, time: "09:00" });
  assert.equal(saved.points[0].id, "stp_a");
  assert.equal(saved.points[0].nights, undefined);
  assert.equal(saved.points[0].depart_time, undefined);
  assert.deepEqual(saved.points[2].arrive, { day: 1, time: "15:45" });
  assert.equal(saved.points[2].nights, undefined);
  assert.equal(saved.points[1].id, undefined);                 // waypoints carry no id
  assert.deepEqual(saved.activities, [{ id: "act_1", stop_id: "stp_b", day: 1, order: 0, title: "Walk", notes: "", duration_min: 90 }]);
});

test("saveRoute still accepts legacy nights/depart_time on a stop without days", () => {
  const dir = tempDir();
  const saved = lib.saveRoute(dir, { route: { id: "", name: "Legacy", speed_kn: 8, points: [
    { latitude: 14.8, longitude: 120.27, stop: true, nights: 0, depart_time: "09:00" },
    { latitude: 14.95, longitude: 120.11, anchorage_id: "capones", nights: 2 }
  ] }, base_revision: 0 });
  assert.equal(saved.points[1].nights, 2);
  assert.equal(saved.points[0].depart_time, "09:00");
  assert.deepEqual(saved.activities, []);
});

test("saveAnchorages keeps kind, defaulting to anchorage", () => {
  const dir = tempDir();
  const out = lib.saveAnchorages(dir, { anchorages: [
    { name: "Coron Town", latitude: 11.99, longitude: 120.20, depth_m: 12, notes: "" },
    { name: "Drift dive", latitude: 12.1, longitude: 120.1, notes: "", kind: "stop" },
    { name: "Odd", latitude: 12.2, longitude: 120.2, notes: "", kind: "pier" }
  ] });
  assert.deepEqual(out.anchorages.map((a) => a.kind), ["anchorage", "stop", "anchorage"]);
});

test("writeRoutes is exported and round-trips through listRoutes", () => {
  const dir = tempDir();
  lib.writeRoutes(dir, [{ id: "a", name: "A", revision: 1, speed_kn: 8, points: [], activities: [] }]);
  assert.deepEqual(lib.listRoutes(dir).routes.map((r) => r.id), ["a"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/route-library.test.js` → four failures.

- [ ] **Step 3: Implement**

In `normalizePoint`, replace the "Template fields" block (lines ~117–126) with:

```js
  if (point.anchorage_id || point.stop === true) {
    const id = typeof input.id === "string" ? input.id.trim() : "";
    if (/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
      point.id = id;
    }
    const dayTime = (raw) => {
      const o = raw && typeof raw === "object" ? raw : null;
      const day = o ? Number(o.day) : NaN;
      if (!Number.isInteger(day) || day < 1) {
        return null;
      }
      const out = { day };
      if (typeof o.time === "string" && TIME_RE.test(o.time.trim())) {
        out.time = o.time.trim();
      }
      return out;
    };
    const arrive = dayTime(input.arrive);
    const depart = dayTime(input.depart);
    if (arrive) {
      point.arrive = arrive;
    }
    if (depart) {
      point.depart = depart;
    }
    // Legacy template fields (spec A §2.2) are kept only on stops that carry no days yet; migration v5 converts them.
    if (!arrive && !depart) {
      const nights = input.nights === null || input.nights === "" ? NaN : Number(input.nights);
      if (Number.isInteger(nights) && nights >= 0 && nights <= 60) {
        point.nights = nights;
      }
      if (typeof input.depart_time === "string" && TIME_RE.test(input.depart_time.trim())) {
        point.depart_time = input.depart_time.trim();
      }
    }
  }
```

Add near the constants at the top: `const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;`

In `normalizeRouteInput`'s returned object add, after `points`:

```js
    activities: Array.isArray(input.activities) ? input.activities.filter((a) => a && typeof a === "object") : []
```

(The server normalises and validates activities with `itineraryLib.normalizeUnassignedRoute` before calling `saveRoute`; the library only carries them.)

In `normalizeAnchorage`, before `anchorage.notes = …`, add:

```js
  anchorage.kind = input.kind === "stop" ? "stop" : "anchorage";
```

Export `writeRoutes` (it exists at ~line 199) by adding it to `module.exports`.

Update two existing tests whose expected objects are exact: `normalizeRouteInput keeps known fields and drops unknown
ones` gains `activities: []` on the expected route, and `saveAnchorages normalizes and stores the whole library` gains
`kind: "anchorage"` on each expected anchorage.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` → `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/route-library.js test/route-library.test.js
git commit -m "feat(routes): library points carry ids and days, routes carry items, anchorages carry kind

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Server — import endpoint, apply-route removed, routes wrapped, summaries, migration v5

**Files:**
- Modify: `server.js` (`applyRouteToCharter` ~6241–6305, charter router ~7183–7234, routes GET/save handlers, `listCharterSummaries` ~4055, `DATA_MIGRATIONS` ~502)
- Modify: `data-templates/schema-version.json`

- [ ] **Step 1: Replace `applyRouteToCharter` with `importRecordToCharter`**

Delete `applyRouteToCharter` and add in its place:

```js
// Spec A2 §4. body: { source: { type: "library" | "charter", id }, from_day, strip_items, base_revision }.
function importRecordToCharter(charterId, body) {
  const stored = itineraryLib.normalizeItinerary(readCharterJson(charterId, "itinerary.json", {}));
  const baseRevision = Number(body.base_revision);
  if (!Number.isInteger(baseRevision) || baseRevision !== stored.revision) {
    return {
      status: 409,
      payload: { error: `Someone else saved this itinerary (revision ${stored.revision}). Reload it to see their changes.`, code: "revision", itinerary: stored }
    };
  }
  const source = toPlainObject(body.source);
  const sourceType = source.type === "charter" ? "charter" : (source.type === "library" ? "library" : "");
  const sourceId = typeof source.id === "string" ? source.id.trim() : "";
  let record = null;
  if (sourceType === "library") {
    record = routeLibrary.listRoutes(LIBRARY_DIR).routes.find((entry) => entry.id === sourceId) || null;
  } else if (sourceType === "charter") {
    const safeId = validateAdminCharterId(sourceId);
    if (safeId && hasCharterDirectory(safeId)) {
      const other = itineraryLib.normalizeItinerary(readCharterJson(safeId, "itinerary.json", {}));
      const otherCharter = toPlainObject(readCharterJson(safeId, "charter.json", {}));
      record = { ...other, name: typeof otherCharter.name === "string" ? otherCharter.name : safeId };
    }
  }
  if (!record) {
    return { status: 404, payload: { error: "Unknown source record" } };
  }
  const charter = toPlainObject(readCharterJson(charterId, "charter.json", {}));
  const dayCount = itineraryLib.charterDayCount(charter);
  if (!dayCount) {
    return { status: 400, payload: { error: "Set the charter's start and end dates first.", field: "charter.start_date" } };
  }
  const fromDay = Number(body.from_day) || 1;
  try {
    const next = itineraryLib.importRecord(stored, record, { type: sourceType, id: sourceId }, fromDay, dayCount, { stripItems: body.strip_items === true });
    const saved = { ...next, revision: stored.revision + 1 };
    writeJsonFileAtomic(path.join(CHARTERS_DIR, charterId, "itinerary.json"), saved);
    return { status: 200, payload: { itinerary: saved } };
  } catch (error) {
    if (error && error.statusCode) {
      return { status: error.statusCode, payload: { error: error.message } };
    }
    throw error;
  }
}
```

- [ ] **Step 2: Route it**

Change the charter regex to:

```js
    const charterMatch = pathname.match(/^\/api\/admin\/charter\/([a-z0-9-]+)(?:\/(save|itinerary\/save|itinerary\/import))?$/);
```

Replace the `itinerary/apply-route` block with:

```js
      if (action === "itinerary/import" && method === "POST") {
        if (!requireAdmin(request, response, url, ROUTE_LIBRARY_ACCESS)) { return; }
        const result = importRecordToCharter(charterId, toPlainObject(await readJsonRequestBody(request)));
        sendJson(response, result.status, result.payload);
        return;
      }
```

- [ ] **Step 3: Routes GET and save wrap the record normalisers**

Find the `GET /api/admin/routes` handler (it sends `routeLibrary.listRoutes(LIBRARY_DIR)`) and change its send to:

```js
      const listed = routeLibrary.listRoutes(LIBRARY_DIR);
      sendJson(response, 200, { routes: listed.routes.map((route) => itineraryLib.upgradeUnassignedRoute(route)) });
```

Find the `POST /api/admin/routes/save` handler and change it to:

```js
      const body = toPlainObject(await readJsonRequestBody(request));
      const normalized = itineraryLib.normalizeUnassignedRoute(toPlainObject(body.route));
      if (normalized.errors.length) {
        sendJson(response, 400, { error: normalized.errors[0].message, field: normalized.errors[0].field, errors: normalized.errors });
        return;
      }
      const route = routeLibrary.saveRoute(LIBRARY_DIR, { route: { ...toPlainObject(body.route), ...normalized.route }, base_revision: body.base_revision });
      sendJson(response, 200, { route });
      return;
```

(`normalizeUnassignedRoute` returns `points` with ids and days and `activities` normalised; `saveRoute` keeps its own name/speed/source validation and the revision check.)

- [ ] **Step 4: Charter summaries gain a stop count**

In `listCharterSummaries`, inside the `.map(entry => { … })`, add before `return`:

```js
      const itinerary = itineraryLib.normalizeItinerary(readCharterJson(entry.name, "itinerary.json", {}));
      const stops = itineraryLib.stopEntries(itinerary.route.points).length;
```

and add `stops,` to the returned object.

- [ ] **Step 5: Migration v5**

Add after `migrateItinerariesToV2`:

```js
// Spec A2 §3: library routes get arrive/depart days (from legacy nights), charter records get dirty_stop_ids,
// anchorages get a kind.
function migrateRecordShapeV5(dataDir) {
  const libraryDir = path.join(dataDir, "library");
  const routesPath = path.join(libraryDir, routeLibrary.ROUTES_FILE_NAME);
  if (fs.existsSync(routesPath)) {
    const routes = routeLibrary.listRoutes(libraryDir).routes.map((route) => itineraryLib.upgradeUnassignedRoute(route));
    routeLibrary.writeRoutes(libraryDir, routes);
    console.log(`Record shape v5: ${routes.length} library route(s) carry arrive/depart days.`);
  }
  const anchoragesPath = path.join(libraryDir, routeLibrary.ANCHORAGES_FILE_NAME);
  if (fs.existsSync(anchoragesPath)) {
    const data = toPlainObject(readJsonFileSafe(anchoragesPath, { anchorages: [] }));
    const anchorages = (Array.isArray(data.anchorages) ? data.anchorages : []).map((a) => ({ ...a, kind: a.kind === "stop" ? "stop" : "anchorage" }));
    writeJsonFileAtomic(anchoragesPath, { anchorages });
    console.log(`Record shape v5: ${anchorages.length} anchorage(s) carry a kind.`);
  }
  const chartersDir = path.join(dataDir, "charters");
  if (fs.existsSync(chartersDir)) {
    let touched = 0;
    for (const entry of fs.readdirSync(chartersDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const itineraryPath = path.join(chartersDir, entry.name, "itinerary.json");
      if (!fs.existsSync(itineraryPath)) continue;
      const raw = toPlainObject(readJsonFileSafe(itineraryPath, {}));
      if (Array.isArray(raw.dirty_stop_ids)) continue;
      writeJsonFileAtomic(itineraryPath, itineraryLib.normalizeItinerary(raw));
      touched += 1;
    }
    console.log(`Record shape v5: ${touched} charter record(s) gained dirty_stop_ids.`);
  }
}
```

Add to `DATA_MIGRATIONS`: `{ version: 5, name: "record-shape", run: migrateRecordShapeV5 }`. Set `data-templates/schema-version.json` to version 5.

Note: `normalizeItinerary` regenerates nothing for a v2 record with ids, so rewriting a charter record through it only adds `dirty_stop_ids: []`. The migration backup runs first, as always.

- [ ] **Step 6: Smoke test**

Fresh scratch data: `Remove-Item -Recurse data-scratch; Copy-Item -Recurse data-local\routes-dev\data data-scratch` (PowerShell), then start the server on it as in spec A plan 1. Expected log lines: `Record shape v5: … library route(s)`, `… anchorage(s)`, `… charter record(s)`, `Applied data migration 5: record-shape`. `GET /api/admin/routes` (with the session cookie and `?key=`) shows `arrive`/`depart` on every library stop and `activities: []`. Then import the first library route into `csaba` from day 1 via `POST .../itinerary/import {"source":{"type":"library","id":"<id>"},"from_day":1,"strip_items":false,"base_revision":<rev>}` → 200 with stops carrying days; `POST .../itinerary/apply-route` → 404.

- [ ] **Step 7: Commit**

```bash
git add server.js data-templates/schema-version.json
git commit -m "feat(server): itinerary/import replaces apply-route; routes share the record shape; migration v5

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Checklist script and docs

**Files:**
- Modify: `scripts/check-itinerary-endpoints.sh`, `CLAUDE.md`

- [ ] **Step 1: Replace check 6 and add checks 8–10**

Replace check 6 (`apply-route with unknown id → 404`) and append after check 7, before `echo "done …"`:

```bash
echo "6. import with an unknown source -> 404"
curl "${auth[@]}" "${json[@]}" -X POST -d "{\"source\":{\"type\":\"library\",\"id\":\"nope\"},\"from_day\":1,\"base_revision\":$rev}" "$BASE/api/admin/charter/$CHARTER/itinerary/import?key=$KEY" | grep -q "Unknown source record" && ok || fail

echo "8. import the first library route from day 1 -> 200 with days"
first=$(curl "${auth[@]}" "$BASE/api/admin/routes?key=$KEY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).routes.find(x=>x.points.some(p=>p.anchorage_id||p.stop));console.log(r?r.id:"")})')
rev=$(curl "${auth[@]}" "$BASE/api/admin/charter/$CHARTER?key=$KEY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)["itinerary.json"].revision))')
curl "${auth[@]}" "${json[@]}" -X POST -d "{\"source\":{\"type\":\"library\",\"id\":\"$first\"},\"from_day\":1,\"strip_items\":false,\"base_revision\":$rev}" "$BASE/api/admin/charter/$CHARTER/itinerary/import?key=$KEY" | grep -q '"depart"' && ok || fail

echo "9. apply-route is gone -> 404"
code=$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE" -X POST "$BASE/api/admin/charter/$CHARTER/itinerary/apply-route?key=$KEY")
if [ "$code" = "404" ]; then echo "   ok ($code)"; else echo "   FAIL ($code)"; fails=$((fails+1)); fi

echo "10. a library save keeps items and days"
curl "${auth[@]}" "${json[@]}" -X POST -d '{"route":{"id":"","name":"Checklist record","speed_kn":8,"points":[{"latitude":14.8,"longitude":120.27,"stop":true,"id":"stp_chk001","name":"A","depart":{"day":1}},{"latitude":14.95,"longitude":120.11,"stop":true,"id":"stp_chk002","name":"B","arrive":{"day":1}}],"activities":[{"id":"act_chk001","stop_id":"stp_chk002","day":1,"order":0,"title":"Swim","notes":""}]},"base_revision":0}' "$BASE/api/admin/routes/save?key=$KEY" | grep -q '"title": *"Swim"' && ok || fail
```

Run the script against the scratch server: expected all `ok` and `done (0 failing)`. (Check 10 leaves a "Checklist record" route in the scratch library; that is fine for scratch data.)

- [ ] **Step 2: CLAUDE.md**

In the itinerary endpoints block replace the `apply-route` line with:

```
- `POST /api/admin/charter/<id>/itinerary/import {source:{type:"library"|"charter", id}, from_day, strip_items, base_revision}` —
  import a record (an unassigned route or another charter's itinerary) from a day, re-basing its days and bringing
  its items unless stripped. Never refused for length: the admin's fit indicator reports over/short. 404 unknown source.
```

Add: "`GET /api/admin/routes` returns every unassigned route in the record shape (stops carry `id`, `arrive`,
`depart`; `activities` present). `POST /api/admin/routes/save` validates items against stops like a charter save."
Under Data migrations add: "v5 `record-shape`: library routes get arrive/depart days from legacy nights, charter
records get `dirty_stop_ids`, anchorages get `kind`."

- [ ] **Step 3: Commit**

```bash
npm test
git add scripts/check-itinerary-endpoints.sh CLAUDE.md
git commit -m "docs(itinerary): import endpoint checks and CLAUDE.md for spec A2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Spec A2 coverage check (plan self-review)

| Spec A2 item | Task |
|---|---|
| §3 `duration_min`, `dirty_stop_ids`, over-the-end rule removed | 1 |
| §3 library records in the record shape; legacy nights converted | 2, 3, 5 |
| §3 anchorage `kind` | 5 |
| §3 `source` for imports; `last_applied` gone | 4 |
| §4 `itinerary/import` (keep, close, re-base, items travel or strip, same-spot merge, no refusal, 404 unknown source) | 4, 6 |
| §4 save accepts new fields; duration bounds; dirty ids filtered | 1 |
| §4 library saves keep items and days; routes GET upgraded | 5, 6 |
| §4 charter summaries `stops` | 6 |
| §4 apply-route removed | 4, 6 |
| §3 migration v5 | 6 |
| §7 server tests; curl checks 8–10 | 1–5, 7 |
| Guest, public endpoints untouched | by construction |
