# Spec A2 — Plan 2 of 2: Admin Implementation Plan (the Route page is the itinerary)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin's Route page the one place a charter's itinerary is edited: a carousel of stop cards docked under the map (dates, items, dirty cascade, fit pill), a read-only Days tab, Start from… import, anchorage kinds, and the Itinerary panel, Apply and Promote dialogs deleted.

**Architecture:** `itinerary-core.js` (pure, `node --test`) gains the arrival/cascade/clash/fit logic and loses the edge-drag and promote code. `routes.js` keeps the whole record (points, items, dirty ids) in its `work` object and routes every edit through two functions: `editPoints` for map geometry (reconcile + recompute arrivals) and `editRecord` for card edits. New `stop-cards.js` renders the strip and card from a `ctx` routes.js gives it; new `routes-days.js` renders the tube-line Days tab read-only. The server from plan A2-01 must be running: the admin calls its `itinerary/import`, sends `duration_min`/`dirty_stop_ids`, and reads `kind` and `stops`.

**Tech Stack:** Plain JS, no build, Leaflet via `IolantheAdmin.loadLeaflet`, `node --test`. Repo: `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin`, branch `feat/itinerary-a2` from `main` (bf6a5e8 or later). Spec: `docs/charter-rework/spec-a2.md` §3, §5, §7. Mockups (git-ignored): `.superpowers/brainstorm/376-*/content/route-page-carousel.html`, `stop-card-v2.html`.

**Deploy constraint:** admin `main` auto-deploys to the vessel every 5 minutes. Everything here lands on `feat/itinerary-a2`; it merges only after the server plan A2-01 is deployed with `./update.sh` (the live admin would otherwise call an endpoint that does not exist yet).

**Deviations and decisions recorded here (David to confirm on review):**
1. Spec §5.10 lists `edgeStates`/`moveEdge` as the deletions. This plan also deletes `setStopDays` (its "last day is a hard limit" rule is the over-the-end rule the spec removes, and nothing calls it once the popover goes) and `promoteRoute` (it writes the legacy `nights`/`depart_time` fields the server now drops). `toUnassignedRoute` replaces it.
2. `estimateTimes` now assumes 09:00 for an overnight stop with no departure time (spec D4) instead of breaking the chain, so every card can show an estimated arrival.
3. The welcome message was edited only on the Itinerary panel. On the Route page in charter mode the Description field becomes **Welcome message** (same slot, bound to the record's `welcome_message`), so the guest's welcome text still has an editor. Not in the spec; flagged for review.
4. Spec §9: the edge shrink curve starts at 26, 18, 12, 8, 6 px, then 4 px; `routes-lists.js` keeps its own file holding Legs only.
5. `history` in routes.js stores the whole working route (points + items + dirty ids), not just points, so undo/redo covers card edits.

**Reading before you start:** `itinerary-core.js` in full (657 lines); `routes.js` in full (897 lines); `routes-ui.js` (82); `routes-popup.js` (144); `routes-places.js` (231); `routes-lists.js` (109); `itinerary.js` lines 358–398 and 510–573 (the day boxes and tube line you will port); `admin.js` 6309–6420 (the charter dispatcher) and 13583–13598 (`IolantheAdmin`); `test/itinerary-core.test.js` 1–60 (the `sevenDays` fixture). Line numbers are from `bf6a5e8` and drift as you edit; search by name.

---

## File structure

| File | Responsibility |
|---|---|
| `itinerary-core.js` (modify) | Normalisation of `duration_min`/`dirty_stop_ids`; `recordDayCount`, `recomputeArrivals`, `shiftFromStop`, `setDeparture`, `droppedDays`, `itemsDroppedByImport`, `dayOrdinal`, `removeStop`, `clashes`, `legSummaries`, `fit`, `rebaseRecord`, `toUnassignedRoute`; over-the-end rule removed; `edgeStates`, `moveEdge`, `setStopDays`, `promoteRoute` deleted. |
| `test/itinerary-core.test.js` (modify) | Tests for each; the deleted functions' tests go. |
| `routes-core.js` (modify) | `routeSnapshot` covers items, dirty ids and the welcome message; drops the legacy template keys. |
| `test/routes-core.test.js` (modify) | The snapshot test. |
| `routes-ui.js` (modify) | Icons for the card (prev, next, gear, revert, start, site, search, drag) and `openModal` options `cancelIcon`/`cancelTitle`. |
| `routes-places.js` (modify) | Anchorage `kind`; Stops layer; `createStop`. |
| `routes-popup.js` (modify) | Nights / Default departure fields removed; stop removal and point deletion go through routes.js guards. |
| `routes-lists.js` (modify) | Stops list removed; Legs stays. |
| `routes.js` (modify) | The record in `work`; `editRecord`; one "Working on" select with an Unassigned group; fit and to-check pills; Legs/Days tabs; Welcome message field; Save as unassigned; Start from…; strip wiring; map ↔ card; guarded removals; Stops layer toggle. |
| `routes.css` (modify) | Header pills, Days tab styles, selected marker, layout tweaks. |
| `stop-cards.js` / `stop-cards.css` (new) | The strip and the card. |
| `routes-days.js` (new) | The read-only Days tab (tube line + day boxes), ported from itinerary.js. |
| `admin.js` (modify) | Itinerary panel entries removed; `routeId` option for `showCharterPanel`. |
| `index.html` (modify) | Script and stylesheet tags; `?v=admin-itin-a2`. |
| `itinerary.js`, `itinerary.css` (delete) | The Itinerary panel. |
| `CLAUDE.md` (modify) | File list and the Route page description. |

**Shapes used throughout.** A *record* is itinerary-shaped: `{ version, revision, welcome_message, summary, route: { source, speed_kn, points }, activities, dirty_stop_ids }`. The Route panel's `work.route` is route-shaped and carries the same data: `{ id, name, description, revision, speed_kn, source, points, activities, dirty_stop_ids, welcome_message, created_at, updated_at }`. Task 6 adds `toRecord(route)` / `fromRecord(route, record)` to convert.

---

### Task 0: Branch

- [ ] **Step 1: Create the branch**

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin"
git checkout main && git pull
git checkout -b feat/itinerary-a2
node --test
```

Expected: `# pass 98`, `# fail 0`.

---

### Task 1: `itinerary-core.js` — new fields, the over-the-end rule, deletions

**Files:**
- Modify: `itinerary-core.js`
- Modify: `test/itinerary-core.test.js`

- [ ] **Step 1: Delete the tests of the functions that go, and update three tests**

In `test/itinerary-core.test.js`:

1. Delete everything from the line `test("edgeStates: dwell edges name the stop, leg edges name both ends", () => {` up to (not including) `test("setStopTime and setStopSites", () => {` (lines 146–237: `edgeStates`, three `moveEdge` tests, two `setStopDays` tests).
2. Delete the `promoteRoute` test (lines 312–325, from `test("promoteRoute: strips charter fields` up to the line `const seqRandom2 = …`).
3. In `normalizeItinerary: defaults for an empty value…` change the expected object to end with `activities: [], dirty_stop_ids: []`:

```js
  assert.deepEqual(core.normalizeItinerary(null), { version: 2, revision: 0, welcome_message: "", summary: "", route: { source: null, speed_kn: 8, points: [] }, activities: [], dirty_stop_ids: [] });
```

4. Rename the first `estimateTimes` test to `estimateTimes: set times upright, arrivals estimated from the previous departure, an overnight stop without a departure time leaves at 09:00` and replace its Hermana/Potipot lines with:

```js
  const herm = times.get("stp_herm");
  assert.equal(herm.arrive.estimated, true);
  assert.deepEqual(herm.depart, { time: "09:00", estimated: true });   // 1 night, no departure time set → 09:00 (spec A2 D4)
  const poti = times.get("stp_poti");
  assert.equal(poti.arrive.estimated, true);               // ~19 nm at 8 kn from 09:00 → about 11:22
  assert.match(poti.arrive.time, /^11:[1-3]\d$/);
  assert.deepEqual(poti.depart, { time: "18:00", estimated: false });
```

5. In `stopTimesLabel: …` replace the Potipot assertion with:

```js
  assert.match(core.stopTimesLabel(stops[4], times.get("stp_poti")), /^Arr\. ~11:[1-3]\d · 2 nights · Dep\. 18:00$/);
```

- [ ] **Step 2: Write the failing tests**

Append to `test/itinerary-core.test.js`:

<!-- dryrun:test-t1 -->
```js
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/itinerary-core.test.js`
Expected: the A2 tests fail (`dirty_stop_ids` undefined, the over-the-end rule still fires, snapshot equal, duration ignored, reconcile clamps to day 7); the three updated tests also fail until Step 4.

- [ ] **Step 4: Implement**

In `itinerary-core.js`:

(a) After `const MAX_NOTES_LENGTH = 2000;` add:

<!-- dryrun:core-constants -->
```js
  const MIN_DURATION_MIN = 5;
  const MAX_DURATION_MIN = 1440;
  const DEFAULT_DURATION_MIN = 60;     // an item with no duration occupies an hour (spec A2 D12)
  const SEED_DEPART_TIME = "09:00";    // a stop with no departure time is assumed to leave at 09:00 (spec A2 D4)
```

(b) In `normalizeActivity`, after the `time` line, add:

<!-- dryrun:core-activity-duration -->
```js
    // null, "" and booleans mean "no duration" (Number() would turn them into 0, which the bounds check rejects). Same as the server.
    const duration = a.duration_min === null || a.duration_min === "" || typeof a.duration_min === "boolean" ? NaN : Number(a.duration_min);
    if (Number.isInteger(duration)) out.duration_min = duration;
```

(c) In `normalizeItinerary`, replace from `const revision = Number(v.revision);` to the end of the function body with:

<!-- dryrun:core-normalize -->
```js
    const revision = Number(v.revision);
    const points = (Array.isArray(route.points) ? route.points : []).map((p) => normalizePoint(p, random)).filter(Boolean);
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

(d) In `itinerarySnapshot` replace the `return JSON.stringify(…)` line with:

<!-- dryrun:core-snapshot -->
```js
    return JSON.stringify({ welcome_message: it.welcome_message, summary: it.summary, speed_kn: toObj(it.route).speed_kn, points: toObj(it.route).points, activities: it.activities, dirty_stop_ids: it.dirty_stop_ids || [] });
```

(e) In `validateItinerary` delete these two lines (the over-the-end rule, spec A2 §3 "Removed"):

```js
      if (p.arrive && dayCount && p.arrive.day > dayCount) push(`${field}.arrive.day`, `Day ${p.arrive.day} is after the charter's last day (${dayCount}).`);
      if (p.depart && dayCount && p.depart.day > dayCount) push(`${field}.depart.day`, `Day ${p.depart.day} is after the charter's last day (${dayCount}).`);
```

and in the activities loop, after `if (!a.title) push(…)`, add:

<!-- dryrun:core-validate-duration -->
```js
      if (a.duration_min !== undefined && (a.duration_min < MIN_DURATION_MIN || a.duration_min > MAX_DURATION_MIN)) {
        push(`${field}.duration_min`, `Activity "${name}" duration must be between ${MIN_DURATION_MIN} minutes and ${MAX_DURATION_MIN / 60} hours.`);
      }
```

(f) In `estimateTimes`, replace

```js
      } else if (p.depart && nights === 0 && arrive) {
        depart = { time: arrive.time, estimated: true };
      }
```

with:

<!-- dryrun:core-estimate-fallback -->
```js
      } else if (p.depart && nights === 0 && arrive) {
        depart = { time: arrive.time, estimated: true };
      } else if (p.depart) {
        depart = { time: SEED_DEPART_TIME, estimated: true };   // overnight stop with no departure time: assume 09:00
      }
```

(g) In `updateActivity`, after the `if ("time" in p) { … }` block, add:

<!-- dryrun:core-update-duration -->
```js
      if ("duration_min" in p) {
        const duration = Number(p.duration_min);
        if (Number.isInteger(duration) && duration >= MIN_DURATION_MIN && duration <= MAX_DURATION_MIN) out.duration_min = duration; else delete out.duration_min;
      }
```

(h) Delete four functions with their comments: `edgeStates` and `moveEdge` (from the comment `// One entry per edge d = 1..dayCount-1` up to the comment `// field: "arrive" | "depart"; time "HH:MM" sets, "" clears.`), `setStopDays` (from `// Spec §4.3. Returns { itinerary } or { error }.` up to that same `// field:` comment; it sits between `moveEdge` and `setStopTime`, so one cut from `// One entry per edge` to `// field: "arrive"` removes all three), and `promoteRoute` (from `// Spec §3.3 / §4.6: the charter route as a library route.` up to `// ---- Route panel charter mode (spec §5)`). Keep `clampActivities`: `reconcileRoutePoints` uses it.

(i) In `reconcileRoutePoints` remove the three clamps to the charter's last day:
- `s.arrive = { day: Math.min(Math.max(prevDay, 1), dayCount || prevDay) };` → `s.arrive = { day: Math.max(prevDay, 1) };`
- `const day = dayCount ? Math.min(prevDepart, dayCount) : prevDepart;` → `const day = prevDepart;`
- delete the block
  ```js
      if (dayCount) {
        stops.forEach((s) => {
          if (s.arrive && s.arrive.day > dayCount) s.arrive.day = dayCount;
          if (s.depart && s.depart.day > dayCount) s.depart.day = dayCount;
        });
      }
  ```

(j) In the export block: add `MIN_DURATION_MIN, MAX_DURATION_MIN, DEFAULT_DURATION_MIN, SEED_DEPART_TIME,` after the `TIME_RE,` line; remove `edgeStates, moveEdge,`, `setStopDays,` and `promoteRoute,`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test`
Expected: `# pass 96` (routes-core 68 + itinerary-core 28), `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(itinerary-core): item duration, dirty stop ids, 09:00 departure fallback; drop the over-the-end rule and the edge/promote code (spec A2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `itinerary-core.js` — arrivals, the cascade, dropped days

These are the pure rules behind the Depart tile and the popup (spec A2 §5.6, §5.7).

**Files:**
- Modify: `itinerary-core.js`, `test/itinerary-core.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/itinerary-core.test.js`:

<!-- dryrun:test-t2 -->
```js
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
  assert.deepEqual(stopOf(cleared, "stp_poti").depart, { day: 5 });
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/itinerary-core.test.js` → FAIL with `core.recordDayCount is not a function`.

- [ ] **Step 3: Implement**

Insert before the final `return {` of `itinerary-core.js`:

<!-- dryrun:core-t2 -->
```js
  // ---- spec A2: the Route page is the itinerary ---------------------------------------
  // A "record" below is an itinerary-shaped object: { route: { points, speed_kn }, activities, dirty_stop_ids }.

  const addDirty = (record, ids) => ({ ...record, dirty_stop_ids: [...new Set([...(record.dirty_stop_ids || []), ...ids])] });
  const withPoints = (record, points) => ({ ...record, route: { ...record.route, points } });

  // Day count of a record with no charter: the terminus's arrival day (an unassigned route). Same rule as the server.
  function recordDayCount(points) {
    const stops = stopEntries(points);
    if (!stops.length) return 0;
    const last = stops[stops.length - 1].point;
    return Math.max(1, last.arrive ? last.arrive.day : (last.depart ? last.depart.day : 1));
  }

  // The time a stop leaves, for the next leg: its departure time, else (day stop) its arrival time, else 09:00.
  function effectiveDepartMinutes(point, arriveTime) {
    if (point.depart && point.depart.time) return timeToMinutes(point.depart.time);
    const dayStop = !point.arrive || !point.depart || point.arrive.day === point.depart.day;
    if (dayStop && arriveTime) return timeToMinutes(arriveTime);
    return timeToMinutes(SEED_DEPART_TIME);
  }

  // Spec A2 §3 / §5.6: every arrival day is the previous departure plus the leg at its speed, rolling past midnight.
  // A stop whose arrival day moves keeps its stay (depart moves with it), its items move with it, and it becomes dirty.
  // A pinned arrival time is kept; the day is never typed. Idempotent.
  function recomputeArrivals(record) {
    const points = record.route.points;
    const speed = record.route.speed_kn || DEFAULT_SPEED_KN;
    const stops = stopEntries(points);
    if (stops.length < 2) return record;
    const next = points.slice();
    const deltas = new Map();   // stopId → days moved
    let prev = null;            // { index, minutes, day } of the previous stop's departure
    stops.forEach((entry, k) => {
      let p = next[entry.index];
      let arriveTime = p.arrive && p.arrive.time ? p.arrive.time : null;
      if (k > 0 && prev && p.arrive) {
        const total = prev.minutes + legHours(next, prev.index, entry.index, speed) * 60;
        const day = prev.day + Math.floor(total / 1440);
        if (!arriveTime) arriveTime = minutesToTime(total);
        const delta = day - p.arrive.day;
        if (delta) {
          p = { ...p, arrive: { ...p.arrive, day }, ...(p.depart ? { depart: { ...p.depart, day: p.depart.day + delta } } : {}) };
          deltas.set(p.id, delta);
        }
      }
      next[entry.index] = p;
      prev = p.depart ? { index: entry.index, minutes: effectiveDepartMinutes(p, arriveTime), day: p.depart.day } : null;
    });
    if (!deltas.size) return record;
    const activities = record.activities.map((a) => (deltas.has(a.stop_id) ? { ...a, day: a.day + deltas.get(a.stop_id) } : a));
    return addDirty({ ...withPoints(record, next), activities }, [...deltas.keys()]);
  }

  // Spec A2 §5.6: the stop's departure and every later stop (with their items) move by `delta` days; later stops are dirty.
  function shiftFromStop(record, stopId, delta) {
    const stops = stopEntries(record.route.points);
    const k = stops.findIndex((e) => e.point.id === stopId);
    if (k < 0 || !delta) return record;
    const later = new Set(stops.slice(k + 1).map((e) => e.point.id));
    const shift = (dt) => ({ ...dt, day: dt.day + delta });
    const points = record.route.points.map((p) => {
      if (!isStop(p)) return p;
      if (p.id === stopId) return p.depart ? { ...p, depart: shift(p.depart) } : p;
      if (!later.has(p.id)) return p;
      return { ...p, ...(p.arrive ? { arrive: shift(p.arrive) } : {}), ...(p.depart ? { depart: shift(p.depart) } : {}) };
    });
    const activities = record.activities.map((a) => (later.has(a.stop_id) ? { ...a, day: a.day + delta } : a));
    return addDirty({ ...withPoints(record, points), activities }, [...later]);
  }

  // The card's Depart tile. change: { day?, time? } (time "" clears). The day is clamped to the arrival day; the stop's
  // own items beyond the new departure day are removed (the caller has shown the popup); arrivals are recomputed.
  function setDeparture(record, stopId, change) {
    const entry = stopEntries(record.route.points).find((e) => e.point.id === stopId);
    if (!entry || !entry.point.depart) return record;
    const p = entry.point;
    const c = toObj(change);
    const arriveDay = p.arrive ? p.arrive.day : 1;
    const day = Number.isInteger(c.day) ? Math.max(c.day, arriveDay) : p.depart.day;
    const time = "time" in c ? (TIME_RE.test(toStr(c.time)) ? toStr(c.time) : undefined) : p.depart.time;
    let next = shiftFromStop(record, stopId, day - p.depart.day);
    next = { ...next, activities: renumberActivities(next.activities.filter((a) => !(a.stop_id === stopId && a.day > day))) };
    next = withPoints(next, next.route.points.map((q) => (isStop(q) && q.id === stopId ? { ...q, depart: time ? { day, time } : { day } } : q)));
    return recomputeArrivals(next);
  }

  // What the popup names before a departure moves earlier (newDepartDay) or a stop goes (newDepartDay null):
  // { days: [day…], items: [activity…] } of that stop beyond the day.
  function droppedDays(record, stopId, newDepartDay) {
    const items = record.activities
      .filter((a) => a.stop_id === stopId && (newDepartDay === null || newDepartDay === undefined || a.day > newDepartDay))
      .sort((a, b) => a.day - b.day || a.order - b.order);
    return { days: [...new Set(items.map((a) => a.day))], items };
  }

  // Items lost when a record is imported from `fromDay` (spec A2 §4 step 1 keeps stops reached before it and closes the
  // current one on it): items after fromDay, plus items on fromDay at stops not yet reached.
  function itemsDroppedByImport(record, fromDay, dayCount) {
    const stops = stopEntries(record.route.points);
    const reached = new Set(stops.filter((e, i) => stopSpan(e.point, positionOf(i, stops.length), dayCount).from < fromDay).map((e) => e.point.id));
    return record.activities.filter((a) => a.day > fromDay || (a.day === fromDay && !reached.has(a.stop_id)));
  }

  // "14th" for a charter day, or "day 4" without charter dates.
  function dayOrdinal(charter, day) {
    const start = parseDateOnly(toObj(charter).start_date);
    if (start === null) return `day ${day}`;
    const n = new Date(start + (day - 1) * DAY_MS).getUTCDate();
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] || "th");
    return `${n}${suffix}`;
  }
```

Add to the export block, after `reconcileRoutePoints`:

```js
    recordDayCount, recomputeArrivals, shiftFromStop, setDeparture, droppedDays, itemsDroppedByImport, dayOrdinal,
```

(`timeToMinutes`, `minutesToTime`, `legHours`, `stopSpan`, `positionOf`, `renumberActivities`, `parseDateOnly` and `DAY_MS` already exist above.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test` → `# pass 104`, `# fail 0`. The geometry in the assertions was checked by hand: Subic → Anawangin 4.4 nm (0.56 h from 09:00 → 09:33), Anawangin → Capones 8.9 nm (→ 15:07), Hermana 09:00 → Potipot 18.9 nm (→ 11:22), Potipot 18:00 → Hundred Islands 36.5 nm (→ 22:34 the same day, which is why the fixture's day-6 arrival moves to day 5), Hundred Islands 08:00 → Subic 85.5 nm (→ 18:41). If a time is off by a minute, check `legHours` rounding, not the tests.

- [ ] **Step 5: Commit**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(itinerary-core): recomputeArrivals, the departure cascade, dropped days (spec A2 §5.6-5.7)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `itinerary-core.js` — remove stop, clashes, leg summaries, fit, rebase, unassigned route

**Files:**
- Modify: `itinerary-core.js`, `test/itinerary-core.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

<!-- dryrun:test-t3 -->
```js
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
  assert.deepEqual([legs.get("stp_herm").departTime, legs.get("stp_herm").departEstimated], ["09:00", true]);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/itinerary-core.test.js` → FAIL with `core.removeStop is not a function`.

- [ ] **Step 3: Implement**

Insert after `toUnassignedRoute`'s future position, i.e. right after the `rebaseRecord`-less block you added in Task 2 (before the final `return {`):

<!-- dryrun:core-t3 -->
```js
  // Spec A2 §5.5 ⚙ Remove stop: the point becomes a waypoint, its items go, origin/terminus rules re-apply, arrivals recompute.
  function removeStop(record, stopId) {
    const stops = stopEntries(record.route.points);
    const k = stops.findIndex((e) => e.point.id === stopId);
    if (k < 0) return record;
    const { anchorage_id: _a, stop: _s, site_ids: _ids, id: _id, arrive: _arr, depart: _dep, leg_speed_kn: speed, ...rest } = stops[k].point;
    let points = record.route.points.map((p, i) => (i === stops[k].index ? (i === 0 && speed ? { ...rest, leg_speed_kn: speed } : rest) : p));
    const remaining = stopEntries(points);
    if (remaining.length) {
      const first = remaining[0].index;
      const last = remaining[remaining.length - 1].index;
      points = points.map((p, i) => {
        if (i === first && p.arrive) { const { arrive: _x, ...q } = p; p = q; }
        if (i === last && p.depart) { const { depart: _y, ...q } = p; p = q; }
        return p;
      });
    }
    const activities = renumberActivities(record.activities.filter((a) => a.stop_id !== stopId));
    return recomputeArrivals(addDirty({ ...withPoints(record, points), activities }, remaining.slice(k).map((e) => e.point.id)));
  }

  // Spec A2 D12. Map activity id → reason: overlapping windows on the same day (default 1 h), or outside the boat's
  // presence on the day it arrives or leaves. Items without a time never clash.
  function clashes(record) {
    const out = new Map();
    const times = estimateTimes(record);
    const stops = new Map(stopEntries(record.route.points).map((e) => [e.point.id, e.point]));
    const timed = record.activities.filter((a) => a.time);
    const windowOf = (a) => { const start = timeToMinutes(a.time); return [start, start + (a.duration_min || DEFAULT_DURATION_MIN)]; };
    timed.forEach((a) => {
      const [s, e] = windowOf(a);
      const other = timed.find((b) => b.id !== a.id && b.day === a.day && (([s2, e2]) => s < e2 && s2 < e)(windowOf(b)));
      if (other) { out.set(a.id, `clashes with ${other.title || "another item"}`); return; }
      const stop = stops.get(a.stop_id);
      const t = stop ? times.get(stop.id) : null;
      if (!stop || !t) return;
      if (stop.arrive && a.day === stop.arrive.day && t.arrive && s < timeToMinutes(t.arrive.time)) {
        out.set(a.id, `before arrival ${t.arrive.estimated ? "~" : ""}${t.arrive.time}`);
      } else if (stop.depart && a.day === stop.depart.day && t.depart && e > timeToMinutes(t.depart.time)) {
        out.set(a.id, `after departure ${t.depart.estimated ? "~" : ""}${t.depart.time}`);
      }
    });
    return out;
  }

  // The leg that leaves each stop, for the Next-leg and Arrive tiles. Map stopId → { nm, hours, toId, toName,
  // departTime, departEstimated, arriveTime, arriveDay, overnight }; the terminus has no entry.
  function legSummaries(record) {
    const points = record.route.points;
    const speed = record.route.speed_kn || DEFAULT_SPEED_KN;
    const times = estimateTimes(record);
    const stops = stopEntries(points);
    const out = new Map();
    stops.forEach((entry, k) => {
      const to = stops[k + 1];
      if (!to || !entry.point.depart) return;
      let nm = 0;
      for (let i = entry.index; i < to.index; i += 1) nm += distNm(points[i], points[i + 1]);
      const hours = legHours(points, entry.index, to.index, speed);
      const t = times.get(entry.point.id);
      const departMinutes = t && t.depart ? timeToMinutes(t.depart.time) : timeToMinutes(SEED_DEPART_TIME);
      const total = departMinutes + hours * 60;
      const arriveDay = entry.point.depart.day + Math.floor(total / 1440);
      out.set(entry.point.id, {
        nm, hours, toId: to.point.id, toName: to.point.name || `Stop ${k + 2}`,
        departTime: minutesToTime(departMinutes), departEstimated: !(t && t.depart && !t.depart.estimated),
        arriveTime: minutesToTime(total), arriveDay, overnight: arriveDay > entry.point.depart.day
      });
    });
    return out;
  }

  // Spec A2 §5.1 fit pill: the last arrival day against the charter's day count.
  // { state: "match" | "short" | "over" | "none", delta, endsDay, label, title }.
  function fit(record, charter) {
    const dayCount = charterDayCount(charter);
    const stops = stopEntries(toObj(toObj(record).route).points);
    if (!dayCount || !stops.length) {
      return { state: "none", delta: 0, endsDay: 0, label: "—", title: dayCount ? "No stops yet." : "No charter dates." };
    }
    const last = stops[stops.length - 1].point;
    const endsDay = last.arrive ? last.arrive.day : (last.depart ? last.depart.day : 1);
    const delta = endsDay - dayCount;
    const title = `Ends ${dayDateLabel(charter, endsDay)}; the charter ends ${dayDateLabel(charter, dayCount)}.`;
    if (!delta) return { state: "match", delta, endsDay, label: "✓", title };
    return { state: delta > 0 ? "over" : "short", delta, endsDay, label: `${delta > 0 ? "+" : "−"}${Math.abs(delta)} d`, title };
  }

  // A record's days are relative to its day 1; lay it onto `fromDay` (same rule as the server's import, spec A2-D20).
  function rebaseRecord(record, fromDay) {
    const delta = (Number.isInteger(fromDay) ? fromDay : 1) - 1;
    if (!delta) return record;
    const shift = (dt) => (dt ? { ...dt, day: dt.day + delta } : dt);
    const points = record.route.points.map((p) => (isStop(p) ? { ...p, ...(p.arrive ? { arrive: shift(p.arrive) } : {}), ...(p.depart ? { depart: shift(p.depart) } : {}) } : p));
    return { ...withPoints(record, points), activities: record.activities.map((a) => ({ ...a, day: a.day + delta })) };
  }

  // Spec A2 §5.1 Save as unassigned: the same record as a new library route, items kept, dirty list dropped.
  function toUnassignedRoute(record, name) {
    return {
      id: "",
      name: toStr(name, MAX_TITLE_LENGTH),
      description: "",
      revision: 0,
      speed_kn: record.route.speed_kn,
      source: { type: "planner" },
      points: record.route.points.map((p) => ({ ...p })),
      activities: record.activities.map((a) => ({ ...a }))
    };
  }
```

Add to the export block, after the Task 2 line:

```js
    removeStop, clashes, legSummaries, fit, rebaseRecord, toUnassignedRoute
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test` → `# pass 110`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(itinerary-core): removeStop, clashes, legSummaries, fit, rebaseRecord, toUnassignedRoute (spec A2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `routes-core.js` — the snapshot covers the record

**Files:**
- Modify: `routes-core.js` (`routeSnapshot`, ~line 124)
- Modify: `test/routes-core.test.js` (the last test, ~line 590)

- [ ] **Step 1: Replace the last test**

Replace the test `routeSnapshot changes when nights, depart_time, id, arrive or depart change` with:

<!-- dryrun:test-rc -->
```js
test("routeSnapshot changes when id, arrive, depart, an item or the dirty list change; ignores the legacy template fields", () => {
  const base = { name: "r", description: "", speed_kn: 8, points: [P(1, 1, { stop: true, id: "stp_a", depart: { day: 1 } }), P(2, 2)], activities: [], dirty_stop_ids: [] };
  const a = core.routeSnapshot(base);
  assert.notEqual(a, core.routeSnapshot({ ...base, points: [P(1, 1, { stop: true, id: "stp_b", depart: { day: 1 } }), P(2, 2)] }));
  assert.notEqual(a, core.routeSnapshot({ ...base, points: [P(1, 1, { stop: true, id: "stp_a", depart: { day: 2 } }), P(2, 2)] }));
  assert.notEqual(a, core.routeSnapshot({ ...base, points: [P(1, 1, { stop: true, id: "stp_a", arrive: { day: 1 }, depart: { day: 1 } }), P(2, 2)] }));
  assert.notEqual(a, core.routeSnapshot({ ...base, activities: [{ id: "act_1", stop_id: "stp_a", day: 1, order: 0, title: "Swim", notes: "" }] }));
  assert.notEqual(a, core.routeSnapshot({ ...base, dirty_stop_ids: ["stp_a"] }));
  assert.notEqual(a, core.routeSnapshot({ ...base, welcome_message: "Hello" }));
  assert.equal(a, core.routeSnapshot({ ...base, points: [P(1, 1, { stop: true, id: "stp_a", depart: { day: 1 }, nights: 2, depart_time: "08:00" }), P(2, 2)] }));
  assert.equal(a, core.routeSnapshot({ name: "r", description: "", speed_kn: 8, points: base.points }));   // missing lists count as empty
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/routes-core.test.js` → the new test fails on the `activities` assertion.

- [ ] **Step 3: Implement**

Replace `routeSnapshot` with:

<!-- dryrun:core-rc -->
```js
  // What counts as "changed" for Save: the editable fields of the record (spec A2: items and the dirty list included).
  function routeSnapshot(route) {
    const keys = ["latitude", "longitude", "name", "anchorage_id", "site_id", "site_ids", "leg_speed_kn", "stop", "id", "arrive", "depart"];
    const points = (route.points || []).map((p) => {
      const out = {};
      keys.forEach((k) => { if (p[k] !== undefined) out[k] = p[k]; });
      return out;
    });
    const speed = route.speed_kn === undefined ? null : route.speed_kn;
    return JSON.stringify({
      name: route.name, description: route.description, welcome_message: route.welcome_message || "", speed_kn: speed, points,
      activities: route.activities || [], dirty_stop_ids: route.dirty_stop_ids || []
    });
  }
```

Also in `makeStopAt` (~line 170) shorten the carried keys to `["leg_speed_kn", "id", "arrive", "depart"]` (the template fields are gone), and in `removeStop` (~line 208) the destructuring may keep `nights: _n, depart_time: _dt` harmlessly; leave it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test` → `# pass 110`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add routes-core.js test/routes-core.test.js
git commit -m "feat(routes-core): the save snapshot covers items, dirty stops and the welcome message

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Helper files — icons and modal options, anchorage kind and Stops layer, popup and lists trimmed

No tests (DOM code); verified in Task 13. Each file is small; read it in full first.

**Files:**
- Modify: `routes-ui.js`, `routes-places.js`, `routes-popup.js`, `routes-lists.js`, `routes.css`

- [ ] **Step 1: `routes-ui.js` — icons and the modal's cancel button**

Add to `ICONS` after `copy`:

```js
    prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    revert: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    start: '<path d="M6 4l14 8-14 8z"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>'
```

Change `openModal`'s signature and the cancel button so a caller can show ↶ Revert instead of ✕ Cancel (spec A2 §5.7):

```js
  function openModal({ title, body, onSave, saveTitle, wide, onClose, cancelIcon, cancelTitle }) {
```

```js
          iconBtn(cancelIcon || "cancel", cancelTitle || "Cancel", "danger", close))),
```

- [ ] **Step 2: `routes-places.js` — kind, Stops layer, `createStop`**

After `const ANCHOR_SVG = …` add:

```js
  const STOP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>';
  const DEFAULT_STOP_NAME = "Stop";
```

Change the layer defaults (two places): `let shownLayers = { sites: true, anchorages: true, stops: true };` and in `draw` `shownLayers = { sites: true, anchorages: true, stops: true, ...(o.layers || {}) };`.

Replace the `if (shownLayers.anchorages) { … }` block in `draw` with:

```js
      anchorageList.forEach((a) => {
        const isStopKind = a.kind === "stop";
        if (isStopKind ? !shownLayers.stops : !shownLayers.anchorages) return;
        const html = `<div class="mk-anch${isStopKind ? " kind-stop" : ""} ${used.has(a.id) ? "" : "dim"}">${isStopKind ? STOP_SVG : ANCHOR_SVG}</div><div class="mk-label">${A.escapeHtml(a.name)}</div>`;
        const title = `${a.name}${a.depth_m ? ` · ${a.depth_m} m` : ""}`;
        L.marker(ll(a), { icon: icon(html), title, draggable: o.mode === "anchorage", zIndexOffset: 200 })
          .on("click", () => (o.onAnchorageClick || noop)(a))
          .on("dragend", (e) => (o.onAnchorageDragEnd || noop)(a, e.target.getLatLng()))
          .addTo(groups.anchorages);
      });
```

In `anchorageUnder` replace the first two lines with:

```js
      if (!map || (!shownLayers.anchorages && !shownLayers.stops)) return null;
      const pt = map.latLngToContainerPoint(latlng);
      const hits = anchorageList
        .filter((a) => (a.kind === "stop" ? shownLayers.stops : shownLayers.anchorages))
```

(the `.map((a) => …)` chain continues as before).

In `openAnchorageModal`: add to `f` after `depth`:

```js
          kind: el("select", {}, el("option", { value: "anchorage" }, "Anchorage"), el("option", { value: "stop" }, "Stop (hold or drift, no anchorage)")),
```

after `f.notes.value = src.notes || "";` add `f.kind.value = src.kind === "stop" ? "stop" : "anchorage";`; in `body` add after the Name field:

```js
          el("div", { class: "field" }, el("label", {}, "Kind"), f.kind),
```

and in `onSave` give `entry` the kind: `const entry = { ...(anchorage || {}), name, latitude, longitude, kind: f.kind.value, notes: f.notes.value.slice(0, 500) };`. Title: `title: isNew ? "New anchorage or stop" : (src.kind === "stop" ? "Edit stop" : "Edit anchorage"),`.

Add after `moveAnchorage`:

```js
    // Spec A2 D9/D13: saves a plain stop to the library with kind "stop" so every route map shows it. Resolves to the
    // saved entry, or null on failure. The name is made unique against the library (core.uniqueName).
    async function createStop(point) {
      const base = point.name && !/^Stop( #\d+)?$/.test(point.name) ? point.name : DEFAULT_STOP_NAME;
      let beforeIds = new Set();
      let finalName = base;
      try {
        const saved = await saveLibrary((list) => {
          beforeIds = new Set(list.map((a) => a.id));
          finalName = core.uniqueName(base, list.map((a) => a.name));
          return [...list, { name: finalName, latitude: point.latitude, longitude: point.longitude, notes: "", kind: "stop" }];
        });
        const result = saved.find((a) => !beforeIds.has(a.id)) || saved.find((a) => a.name === finalName) || null;
        A.setStatus(result ? `"${finalName}" saved as a global stop.` : "The stop was not saved.", result ? "ok" : "error");
        ctx.onChanged();
        return result;
      } catch (error) {
        A.setStatus(error.message, "error");
        return null;
      }
    }
```

Add `createStop` to the returned object.

- [ ] **Step 3: `routes-popup.js` — template fields out, removals through routes.js**

Delete the whole `if (stop && ctx.subjectType !== "charter") { … }` block (lines 53–71). Change the two removal buttons:

```js
        stop ? el("button", { type: "button", class: "text-btn secondary", title: "Turn this stop back into a waypoint", onclick: () => ctx.removeStopAt(i) }, "Remove stop") : null,
        el("button", { type: "button", class: "text-btn danger-text", onclick: () => ctx.deletePoint(i) }, "Delete")));
```

Delete the local `removeStopAt` function (lines 87–91). Update the ctx comment on line 11 to:

```js
  // ctx: { core, places, getWork, getMap, editPoints(fn, opts), editPointsQuiet(fn), makeStopAtAnchorage(i, anchorage), removeStopAt(i), deletePoint(i), status(message, tone) }
```

- [ ] **Step 4: `routes-lists.js` — Legs only**

Delete `stopItem` and `renderStops` (lines 21–45). Change the return to `return { timeStat, renderLegs, copyLegs, legCount: () => legsFor(points()).length };`, the header comment to `// Routes panel: the Legs tab list and the time tile. Stop-to-stop leg cards with per-leg speeds. Created once per bind() by routes.js.` and the ctx comment to `// ctx: { A, core, getWork, speedKn(), defaultSpeed, maxSpeed, editPoints(fn), focusLeg(leg) }`. Remove `places` from the destructuring on line 8 (`const { core: c } = ctx;`).

- [ ] **Step 5: `routes.css` — the stop-kind marker**

After `.routes-panel .mk-anch.dim { opacity: .6; }` add:

```css
.routes-panel .mk-anch.kind-stop svg { fill: currentColor; stroke: none; }
```

- [ ] **Step 6: Parse check and commit**

```bash
for f in routes-ui.js routes-places.js routes-popup.js routes-lists.js; do node --check "$f" || exit 1; done
git add routes-ui.js routes-places.js routes-popup.js routes-lists.js routes.css
git commit -m "feat(routes): card icons and modal cancel option; anchorage kind with a Stops layer; popup and lists trimmed for spec A2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `routes.js` — the record in `work`, one Working-on select, pills, Legs/Days tabs, guards, Save as unassigned

This is the structural task. After it the panel works end to end without the strip (Task 8 adds it) and the Days tab shows "coming" until Task 7. Read `routes.js` in full before starting; the edits below are in file order.

**Files:**
- Modify: `routes.js`, `routes.css`, `admin.js` (6345–6349 and 6411–6419)

- [ ] **Step 1: State and helpers (lines 8–61)**

After `const core = () => window.IolantheRoutesCore;` add `const icore = () => window.IolantheItineraryCore;`. Replace every other `window.IolantheItineraryCore` in the file with `icore()` (lines 20, 142, 585).

Change `let work = null;       // { route, savedJson, baseRevision }` to:

```js
  let work = null;       // { route, savedJson, baseRevision }; route carries points, activities, dirty_stop_ids, welcome_message
```

Change `let subject = …` comment to `// or { type: "charter", charterId, charter, itinerary, focusStopId }; a library subject may carry routeId`.

Change `const ui = …` to `const ui = { mode: "select", layers: { sites: true, anchorages: true, stops: true, pins: true } };`.

After `let io = null;` add:

```js
  let cards = null;      // IolantheStopCards instance (the strip), created fresh by each bind()
  let days = null;       // IolantheRoutesDays instance (the Days tab), created fresh by each bind()
  const MAX_HISTORY = 100;
```

After `const speedKn = …` add:

```js
  // Days available to the record: the charter's for a charter route, the terminus's arrival day for an unassigned one.
  const dayCount = () => (isCharter() ? icore().charterDayCount(subject.charter) : icore().recordDayCount(work ? work.route.points : []));
  const charterOrNull = () => (isCharter() ? subject.charter : null);

  // The panel works on a route-shaped object; itinerary-core works on the record shape. Same data, two spellings.
  function toRecord(route) {
    return icore().normalizeItinerary({
      version: 2, revision: route.revision || 0, welcome_message: route.welcome_message || "", summary: route.summary || "",
      route: { source: route.source || null, speed_kn: route.speed_kn, points: route.points },
      activities: route.activities || [], dirty_stop_ids: route.dirty_stop_ids || []
    });
  }
  // Keeps the route's own speed (a blank library speed must stay blank) and everything itinerary-core does not know about.
  const fromRecord = (route, record) => ({ ...route, points: record.route.points, activities: record.activities, dirty_stop_ids: record.dirty_stop_ids, welcome_message: record.welcome_message });
```

- [ ] **Step 2: `render()` (lines 64–124)**

Replace the whole function with:

```js
  function render() {
    if (!A().canManageCharterAdmin()) {
      return '<section class="card full routes-panel"><div class="card-header"><h2>Route</h2></div><p class="empty">The Route page is available to Charter Admin on the bridge.</p></section>';
    }
    return `<section class="card full routes-panel" id="routes-panel">
      <div class="card-header">
        <h2>Route</h2>
        <label class="subject" for="routes-subject"><span class="side-label">Working on</span><select id="routes-subject"></select></label>
        <div class="pills" id="routes-pills"></div>
        <div class="icon-row" id="routes-actions"></div>
      </div>
      <div class="planner">
        <aside class="side">
          <div class="field" id="routes-charter-note" hidden></div>
          <div class="field" id="routes-name-field">
            <label for="routes-name">Name</label>
            <input id="routes-name" type="text" autocomplete="off" placeholder="Route name">
          </div>
          <div class="field">
            <label for="routes-desc" id="routes-desc-label">Description</label>
            <textarea id="routes-desc" placeholder="Optional"></textarea>
          </div>
          <div class="stats" id="routes-stats"></div>
          <div class="tabbox">
            <div class="tabs" role="tablist" aria-label="Legs and days">
              <button type="button" role="tab" id="routes-tab-legs" aria-controls="routes-panel-legs" aria-selected="true">Legs</button>
              <button type="button" role="tab" id="routes-tab-days" aria-controls="routes-panel-days" aria-selected="false">Days</button>
            </div>
            <div class="tab-panel" role="tabpanel" id="routes-panel-legs" aria-labelledby="routes-tab-legs">
              <div class="legs-head">
                <label class="speed-row" title="Saved with the route. Legs use it unless they have their own speed.">Route speed <input id="routes-speed" type="number" min="0" max="30" step="0.5"> kn</label>
                <button type="button" class="icon-btn small" id="routes-copy-legs" title="Copy the legs for Excel" aria-label="Copy the legs for Excel"></button>
              </div>
              <div class="stops" id="routes-legs"></div>
            </div>
            <div class="tab-panel" role="tabpanel" id="routes-panel-days" aria-labelledby="routes-tab-days" hidden>
              <div class="days" id="routes-days"></div>
            </div>
          </div>
          <div class="meta" id="routes-meta"></div>
        </aside>
        <div class="map-wrap">
          <div id="routes-map"></div>
          <div class="layers" id="routes-layers"></div>
          <div class="map-toolbar">
            <div class="seg" id="routes-modes"></div>
          </div>
          <div class="map-hint" id="routes-map-hint"></div>
        </div>
        <div class="strip-host" id="routes-strip"></div>
      </div>
    </section>`;
  }
```

- [ ] **Step 3: Working route (lines 126–198)**

Replace `setWork`, `charterRouteFromItinerary`, `blankRoute`, `editPoints`, `editPointsQuiet`, `undo`, `redo` with:

```js
  function setWork(route, opts) {
    const clone = JSON.parse(JSON.stringify(route));
    clone.activities = Array.isArray(clone.activities) ? clone.activities : [];
    clone.dirty_stop_ids = Array.isArray(clone.dirty_stop_ids) ? clone.dirty_stop_ids : [];
    work = { route: clone, savedJson: core().routeSnapshot(clone), baseRevision: clone.revision || 0 };
    history = { undo: [], redo: [] };
    renderAll({ fit: true, inputs: true, ...(opts || {}) });
  }

  function openLibraryRoute(id) {
    const r = routes.find((x) => x.id === id);
    if (r) setWork(r);
  }

  // The charter's itinerary.json as the panel's route-shaped record (spec A2 D14: one record shape).
  function charterRouteFromItinerary(itinerary) {
    const it = icore().normalizeItinerary(itinerary);
    const name = `${(subject.charter && subject.charter.name) || subject.charterId} route`;
    return {
      id: "charter", name, description: "", revision: it.revision, speed_kn: it.route.speed_kn, source: it.route.source, points: it.route.points,
      activities: it.activities, dirty_stop_ids: it.dirty_stop_ids, welcome_message: it.welcome_message, summary: it.summary, created_at: null, updated_at: null
    };
  }

  function blankRoute() {
    return { id: "", name: "", description: "", revision: 0, speed_kn: loadSpeed(), created_at: null, updated_at: null, source: { type: "planner" }, points: [], activities: [], dirty_stop_ids: [] };
  }
```

(keep `ROUTE_DISCARD`, `leaveConfirm`, `guardDiscard` as they are), then:

```js
  function pushHistory() {
    history.undo.push(work.route);
    if (history.undo.length > MAX_HISTORY) history.undo.shift();
    history.redo = [];
  }

  // Every route-geometry edit goes through here so undo/redo stays consistent. The edited points are reconciled into
  // the record (new stops get an id and zero nights, removed stops take their items, days never run backwards) and
  // every arrival is recomputed from the departures and the legs (spec A2 D4).
  function editPoints(fn, opts) {
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    pushHistory();
    const result = icore().reconcileRoutePoints(toRecord(work.route), fn(work.route.points), dayCount());
    work.route = fromRecord(work.route, icore().recomputeArrivals(result.itinerary));
    renderAll(opts);
  }
  // Like editPoints, but leaves the map (and an open popup) alone. Used for name edits typed in the point popup.
  function editPointsQuiet(fn) {
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    pushHistory();
    const result = icore().reconcileRoutePoints(toRecord(work.route), fn(work.route.points), dayCount());
    work.route = fromRecord(work.route, icore().recomputeArrivals(result.itinerary));
    renderActions();
    renderStats();
    if (cards) cards.render();
    if (days) days.render();
  }
  // Card edits (dates, items, sites, the dirty list) go through here: pure function on the record in, record out.
  // opts.history false for bookkeeping (clearing a dirty flag); opts.map true when a point changed.
  function editRecord(fn, opts) {
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    const o = { map: false, history: true, ...(opts || {}) };
    const next = fn(toRecord(work.route));
    if (!next) return;
    if (o.history) pushHistory();
    work.route = fromRecord(work.route, next);
    renderAll(o);
  }
  function undo() {
    if (!history.undo.length) return;
    history.redo.push(work.route);
    work.route = history.undo.pop();
    renderAll();
  }
  function redo() {
    if (!history.redo.length) return;
    history.undo.push(work.route);
    work.route = history.redo.pop();
    renderAll();
  }
```

- [ ] **Step 4: Side panel and header (lines 200–250)**

Replace `renderPicker`, `renderStats`, `showTab`, `renderAll` with:

```js
  // One select: this charter's route, then the unassigned routes (spec A2 D18: "library route" = "unassigned route").
  function renderSubject() {
    const sel = $("subject");
    const unassigned = el("optgroup", { label: "Unassigned" },
      routes.map((r) => el("option", { value: `lib:${r.id}` }, `${r.name} · ${r.points.filter(core().isStop).length} stops`)));
    const unsaved = !isCharter() && !work.route.id ? el("option", { value: "new" }, "New route (unsaved)") : null;
    sel.replaceChildren(el("option", { value: "charter" }, "This charter's route"), ...[unsaved, unassigned].filter(Boolean));
    sel.value = isCharter() ? "charter" : (work.route.id ? `lib:${work.route.id}` : "new");
  }

  // Spec A2 §5.1: the fit pill (last arrival against the charter's end) and the to-check pill (dirty stops).
  function renderPills() {
    const f = icore().fit(toRecord(work.route), charterOrNull());
    const dirty = (work.route.dirty_stop_ids || []).length;
    $("pills").replaceChildren(...[
      el("span", { class: `pill fit-${f.state}`, title: f.title, "aria-label": `Fit: ${f.title}` }, f.label),
      dirty ? el("span", { class: "pill check", title: "Stops whose dates moved under them. Open each card to clear it." }, `${dirty} to check`) : null
    ].filter(Boolean));   // replaceChildren(null) would insert the text "null"
  }

  function renderStats() {
    const pts = work.route.points;
    const stopCount = pts.filter(core().isStop).length;
    $("stats").replaceChildren(
      el("div", { class: "stat" }, el("b", {}, core().routeNm(pts).toFixed(1)), el("span", {}, "nm total")),
      el("div", { class: "stat" }, el("b", {}, `${stopCount} / ${lists.legCount()}`), el("span", {}, "stops / legs")),
      lists.timeStat());
    lists.renderLegs($("legs"));
    renderPills();

    const r = work.route;
    const src = r.source || {};
    const srcText = src.type === "import" ? `imported from ${src.from && src.from.type === "charter" ? "a charter" : "an unassigned route"}` : src.type === "charter-v1" || src.type === "charter" ? "migrated from a charter" : src.type === "kml" || src.type === "gpx" ? `imported from ${src.filename || src.type}` : "planner";
    $("meta").textContent = isCharter()
      ? `Charter route · revision ${(subject.itinerary && subject.itinerary.revision) || 0} · ${srcText}${isDirty() ? " · unsaved changes" : ""}`
      : r.id
      ? `Revision ${r.revision} · updated ${fmtDate(r.updated_at)} · source: ${srcText}${isDirty() ? " · unsaved changes" : ""}`
      : (isDirty() ? "Unsaved new route" : "");
  }

  function showTab(name) {
    ["legs", "days"].forEach((t) => {
      $(`tab-${t}`).setAttribute("aria-selected", String(t === name));
      $(`panel-${t}`).hidden = t !== name;
    });
    if (name === "days" && days) days.render();   // the tube line measures boxes, so draw it once the tab is visible
  }

  function renderAll(opts) {
    const o = opts || {};
    if (o.inputs) {
      $("name").value = work.route.name;
      $("desc").value = isCharter() ? (work.route.welcome_message || "") : (work.route.description || "");
      $("speed").value = work.route.speed_kn || "";
    }
    renderSubject();
    renderActions();
    renderStats();
    renderModes();
    renderLayers();
    if (o.map !== false) renderMap(o);
    if (cards) cards.render();
    if (days && !$("panel-days").hidden) days.render();
  }
```

- [ ] **Step 5: `renderActions()` (lines 253–292)**

Replace the charter branch (from `if (isCharter()) {` to its `return;`) with:

```js
    if (isCharter()) {
      const ro = readOnly();
      $("actions").replaceChildren(
        b("check", "Save charter route", saveCharterRoute, "success", ro || saving || !dirty),
        b("cancel", "Cancel (discard changes)", cancelChanges, "danger", ro || !dirty),
        el("span", { class: "icon-sep" }),
        b("undo", "Undo (Ctrl+Z)", undo, "", ro || !history.undo.length),
        b("redo", "Redo (Ctrl+Y)", redo, "", ro || !history.redo.length),
        el("span", { class: "icon-sep" }),
        b("start", "Start from an unassigned route or another charter…", openStartFrom, "", ro || saving),
        b("saveAs", "Save as an unassigned route (items kept)", () => saveAs(false), "", work.route.points.length < 2),
        b("import", "Import KML / GPX", () => io.openImport(), "", ro),
        b("export", "Export GPX / KML", () => io.openExport(), "", work.route.points.length < 2));
      return;
    }
```

(`openStartFrom` is written in Task 11; until then add a one-line stub after `renderActions`: `async function openStartFrom() { status("Start from… arrives in Task 11.", ""); }` and delete it in Task 11.)

- [ ] **Step 6: Layers and map (lines 304–311, 408–446, 498–501)**

In `renderLayers` add the Stops toggle after Anchorages:

```js
    $("layers").replaceChildren(item("sites", "var(--site)", "Sites"), item("anchorages", "var(--stop)", "Anchorages"), item("stops", "var(--stop)", "Stops"),
      item("pins", "var(--pin)", `Imported pins${pinCount ? ` (${pinCount})` : ""}`));
```

In `renderMap`, the stop marker html (line 415) becomes:

```js
        const selected = cards && cards.selectedId() === p.id;
        html = `<div class="mk-stop${p.anchorage_id ? "" : " plain"}${selected ? " selected" : ""}">${stopNo}</div>${flagged ? '<div class="mk-badge">!</div>' : ""}`;
```

Replace `focusPoint` and `onPointClick` with:

```js
  function focusPoint(i) {
    if (!map || !pointMarkers[i]) return;
    const p = work.route.points[i];
    if (core().isStop(p) && cards) { cards.select(p.id); return; }
    map.panTo(pointMarkers[i].getLatLng());
    openPointPopup(i);
  }

  // Spec A2 §5.3: the selected card's stop is drawn larger on the map; selecting a card pans to it.
  function highlightStop(stopId) {
    if (!work) return;
    work.route.points.forEach((p, i) => {
      const m = pointMarkers[i];
      const node = m && m.getElement ? m.getElement() : null;
      const dot = node ? node.querySelector(".mk-stop") : null;
      if (dot) dot.classList.toggle("selected", Boolean(stopId) && p.id === stopId);
    });
  }
  function panToStop(stopId) {
    const i = work.route.points.findIndex((p) => p.id === stopId);
    if (map && i >= 0 && pointMarkers[i]) { map.closePopup(); map.panTo(pointMarkers[i].getLatLng()); }
    highlightStop(stopId);
  }

  // Spec A2 §5.7: dropping a day that holds items asks first. verb: "Changing the date" | "Removing the stop" | "Starting from day N".
  function dayListLabel(daysList) {
    const c = charterOrNull();
    const names = daysList.map((d) => icore().dayOrdinal(c, d));
    const text = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    return c && c.start_date ? `the ${text}` : text;
  }
  function askDrop(dropped, verb) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => { if (!settled) { settled = true; resolve(value); } };
      const n = dropped.items.length;
      openModal({
        title: `${verb}?`,
        body: el("p", {}, `${verb} will remove the itinerary entries for ${dayListLabel(dropped.days)} (${n} item${n === 1 ? "" : "s"}).`),
        saveTitle: "OK", cancelIcon: "revert", cancelTitle: "Revert",
        onSave: () => { done(true); return true; },
        onClose: () => done(false)
      });
    });
  }
  // Deleting a point or turning a stop back into a waypoint drops that stop's items: ask first when there are any.
  async function deletePoint(i) {
    const p = work.route.points[i];
    if (!p) return;
    if (core().isStop(p) && !(await askDrop(icore().droppedDays(toRecord(work.route), p.id, null), "Removing the stop"))) return;
    if (map) map.closePopup();
    editPoints((pts) => core().removeAt(pts, i));
  }
  async function removeStopAt(i) {
    const p = work.route.points[i];
    if (!p || !core().isStop(p)) return;
    if (!(await askDrop(icore().droppedDays(toRecord(work.route), p.id, null), "Removing the stop"))) return;
    if (map) map.closePopup();
    editRecord((rec) => icore().removeStop(rec, p.id), { map: true });
    status("Stop removed. The point is a waypoint again.", "");
  }

  function onPointClick(i) {
    const p = work.route.points[i];
    if (ui.mode === "select") { if (core().isStop(p) && cards) cards.select(p.id, { pan: false }); else openPointPopup(i); }
    else if (ui.mode === "delete") deletePoint(i);
  }
```

- [ ] **Step 7: Saving (lines 555–710)**

Replace `saveCharterRoute` with:

```js
  // Spec A2: the record in work is already reconciled and recomputed; validate, then save with the revision check.
  async function saveCharterRoute() {
    if (!work || saving) return;
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    const record = toRecord(work.route);
    const problems = icore().validateItinerary(record, dayCount());
    if (problems.length) { status(problems[0].message, "error"); return; }
    const mine = panel;
    saving = true;
    renderActions();
    try {
      const { itinerary } = await post(`/api/admin/charter/${encodeURIComponent(subject.charterId)}/itinerary/save`, { itinerary: record, base_revision: work.baseRevision });
      if (panel !== mine || !mine.isConnected) return;
      subject = { ...subject, itinerary };
      const selected = cards ? cards.selectedId() : null;
      setWork(charterRouteFromItinerary(itinerary), { fit: false });
      if (cards && selected) cards.select(selected, { pan: false });
      afterPersist();
      status(`Charter route saved · revision ${itinerary.revision}`, "ok");
    } catch (error) {
      if (panel !== mine || !mine.isConnected) return;
      if (error.status === 409) {
        const reload = await A().showAdminConfirm({ title: "Itinerary changed elsewhere", message: `${error.message} Reload to see the latest? Your changes will be lost.`, confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning" });
        if (reload) await A().showCharterPanel("routes", { subject: "charter" });
      } else reportError(error);
    } finally {
      saving = false;
      if (panel === mine && mine.isConnected && work) renderActions();
    }
  }
```

In `saveAs`, change the title and the success branch so a charter route saved as unassigned does not replace the working route:

```js
      title: isFirstSave ? "Save new route" : (isCharter() ? "Save as an unassigned route" : "Save As"), saveTitle: "Save",
```

```js
          const route = withSpeed({ ...work.route, id: "", name, source: isCharter() ? { type: "planner" } : work.route.source, dirty_stop_ids: undefined, welcome_message: undefined, summary: undefined });
          const sent = core().routeSnapshot(route);
          const oldName = work.route.name;
          const { route: saved } = await post("/api/admin/routes/save", { route, base_revision: 0 });
          if (panel !== mine || !mine.isConnected) return true;
          if (isCharter()) {
            replaceInLibrary(saved);
            renderSubject();
            status(`Saved "${saved.name}" as an unassigned route · ${saved.activities ? saved.activities.length : 0} items kept`, "ok");
            return true;
          }
          applySaved(saved, sent, true, oldName);
```

In `cancelChanges` and `guardDiscard` nothing changes (they already restore `charterRouteFromItinerary(subject.itinerary)`).

- [ ] **Step 8: Wiring (lines 713–894)**

Replace the `$("subject")` and `$("picker")` listeners at the top of `bindInputs` with:

```js
    $("subject").addEventListener("change", async (e) => {
      const value = e.target.value;
      if (!work) return;
      if (!(await guardDiscard())) { renderSubject(); return; }
      if (value === "charter") { if (!isCharter()) await A().showCharterPanel("routes", { subject: "charter" }); return; }
      if (isCharter()) { await A().showCharterPanel("routes", { subject: "library", routeId: value.startsWith("lib:") ? value.slice(4) : "" }); return; }
      if (value.startsWith("lib:")) openLibraryRoute(value.slice(4)); else setWork(blankRoute());
    });
```

Change the `$("desc")` listener to bind the welcome message in charter mode:

```js
    $("desc").addEventListener("input", (e) => {
      if (!work) return;
      work.route = isCharter() ? { ...work.route, welcome_message: e.target.value } : { ...work.route, description: e.target.value };
      renderActions(); renderStats();
    });
```

Replace the tab listeners: `$("tab-legs").addEventListener("click", () => showTab("legs"));` and `$("tab-days").addEventListener("click", () => showTab("days"));` (delete the `tab-stops` line).

Replace `applySpeed` so a route speed change recomputes arrivals:

```js
    const applySpeed = (v) => {
      const next = { ...work.route, speed_kn: v };
      work.route = fromRecord(next, icore().recomputeArrivals(toRecord(next)));
      if (v !== undefined) storeSpeed(v);
      renderActions(); renderStats();
      if (cards) cards.render();
      if (days && !$("panel-days").hidden) days.render();
    };
```

In `loadLibrary` change the `setWork` line to:

```js
      if (!isCharter()) setWork(routes.find((r) => r.id === subject.routeId) || routes[0] || blankRoute());
      else renderSubject();
```

In `bind(opts)`:
- the popup ctx: remove `subjectType: subject.type,` and add `removeStopAt, deletePoint,` after `makeStopAtAnchorage,`;
- the lists ctx: remove `places: myPlaces,`, `focusPoint,` and the whole `stopMeta: (p) => { … },` entry;
- replace the `if (isCharter()) { … } else { … }` block near the end with:

```js
    if (isCharter()) {
      $("name-field").hidden = true;
      $("desc-label").textContent = "Welcome message";
      $("desc").placeholder = "Shown to guests at the top of their itinerary";
      const note = $("charter-note");
      note.hidden = !readOnly();
      note.textContent = readOnly() ? `${subject.charter.name || subject.charterId} has ended. The route is read-only.` : "";
      work = null;
      setWork(charterRouteFromItinerary(subject.itinerary));
      loadLibrary(mine);   // fills the Unassigned group and Add another route's list
      if (subject.focusStopId) {
        const idx = work.route.points.findIndex((p) => p.id === subject.focusStopId);
        if (idx >= 0) setTimeout(() => focusPoint(idx), 300);
      }
    } else {
      $("name-field").hidden = false;
      $("desc-label").textContent = "Description";
      $("desc").placeholder = "Optional";
      $("charter-note").hidden = true;
      loadLibrary(mine);
    }
```

Near the top of `bind`, right after `work = null;`, add `cards = null; days = null;` so a re-bind never keeps a stale instance (they are created in Tasks 7 and 8).

- [ ] **Step 9: `admin.js` — a one-shot route id for the library subject**

In `bindCharterPanel` (6345–6348):

```js
        const subject = state.routesSubject === "charter"
          ? { type: "charter", charterId: state.selectedCharter, charter: charterInfo, itinerary, focusStopId: state.routesFocusStopId || "" }
          : { type: "library", routeId: state.routesRouteId || "" };
        state.routesFocusStopId = "";
        state.routesRouteId = "";
```

In `showCharterPanel` after the `focusStopId` line: `if (options.routeId !== undefined) state.routesRouteId = options.routeId;`. Update its comment to `// Switch the Charter section to a panel from code. options.subject: "library" | "charter"; options.routeId opens that unassigned route.`

- [ ] **Step 10: `routes.css` — header, pills, selected marker, strip host, Days placeholder**

Append:

```css
/* Spec A2: header with the Working-on select and the pills; the strip docked under the map */
.routes-panel .card-header .subject { display: flex; align-items: center; gap: 8px; margin: 0; }
.routes-panel .card-header .subject .side-label { margin: 0; white-space: nowrap; }
.routes-panel .card-header .subject select { min-width: 200px; max-width: 320px; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; background: var(--panel); color: var(--ink); font: inherit; }
.routes-panel .pills { display: flex; gap: 6px; align-items: center; flex: 1; }
.routes-panel .pill { display: inline-grid; place-items: center; min-width: 36px; height: 28px; padding: 0 10px; border-radius: 999px; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; background: var(--soft); color: var(--muted); cursor: help; }
.routes-panel .pill.fit-match { background: #cfe8cf; color: #1e5a3b; }
.routes-panel .pill.fit-short, .routes-panel .pill.fit-over { background: var(--warn-bg); color: var(--warn); }
.routes-panel .pill.check { background: #f5c6c2; color: #7a2a24; }
.routes-panel .planner { grid-template-areas: "side map" "strip strip"; grid-template-rows: auto auto; }
.routes-panel .planner .side { grid-area: side; }
.routes-panel .planner .map-wrap { grid-area: map; }
.routes-panel .strip-host { grid-area: strip; min-width: 0; }
.routes-panel .mk-stop.selected { width: 34px; height: 34px; background: var(--accent); border-width: 3px; font-size: 14px; }
.routes-panel .mk-stop.plain.selected { background: #fff; color: var(--accent); border-color: var(--accent); }
@media (max-width: 900px) {
  .routes-panel .planner { grid-template-areas: none; grid-template-rows: none; }
  .routes-panel .planner .side, .routes-panel .planner .map-wrap, .routes-panel .strip-host { grid-area: auto; }
  .routes-panel .strip-host { order: 3; }
  .routes-panel .side > .field:first-child { order: 3; }
}
```

(The phone layout rule `.routes-panel .side > .field:first-child { order: 1; }` was for the old picker; the override above neutralises it.)

- [ ] **Step 11: Verify in the browser**

Start the local server (`.claude/launch.json` → `iolanthe-server-scratch`; it must be running plan A2-01's code, migrated to schema 5). Open `/admin/?key=<urlKey>` → Charter → Route:

- Header: "Working on" lists *This charter's route* and an *Unassigned* group; the fit pill shows (✓ / −N d / +N d / —); the Stops tab is gone, Legs and Days tabs present; the Description field reads "Welcome message" in charter mode and holds the charter's welcome text.
- Switching to an unassigned route and back keeps the selection and the discard guard.
- Add mode → tap an anchorage: a stop appears with zero nights after the previous stop (check via the Legs tab and the meta); Undo restores; Delete mode on a stop with items asks "Removing the stop?" with ✓ / ↶.
- Changing the route speed changes nothing visible yet except the Legs times (arrivals are checked once the strip exists).
- Save: status "Charter route saved · revision N". Reload: the welcome message and the `dirty_stop_ids` (if any) persist (check `GET /api/admin/charter/<id>` in the network pane).
- Save as unassigned: a new route appears in the Unassigned group; the charter route stays the working route.
- Console: no errors.

- [ ] **Step 12: Commit**

```bash
node --check routes.js && node --check admin.js
git add routes.js routes.css admin.js
git commit -m "feat(routes): the record lives in the Route panel - one Working-on select, fit and to-check pills, Legs/Days tabs, guarded removals, Save as unassigned (spec A2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `routes-days.js` — the read-only Days tab

The spec A tube-line view, ported from `itinerary.js` (`dayBox`, `subBox`, `renderDays`, `drawLine`, 358–398 and 510–573) with every editing affordance left behind. Styles go in `routes.css` with a `days-` prefix.

**Files:**
- Create: `routes-days.js`
- Modify: `routes.css`, `routes.js` (`bind`), `index.html`

- [ ] **Step 1: Create the module**

Create `routes-days.js`:

<!-- dryrun:routes-days -->
```js
// Routes panel: the read-only Days tab (spec A2 §5.2). The spec A tube-line day view: stop titles left, the line, day
// boxes with one sub-box per stop holding that day's items. No editing here; stops and items are edited on the cards.
// Created once per bind() by routes.js.
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const LINE_X = 16;        // x of the line inside the 32px middle column
  const LOOP_W = 14;        // loop (dwell) width
  const DOT_R = 6;

  // ctx: { core (IolantheItineraryCore), el, getRecord(), getCharter() (null for an unassigned route), getDayCount(), siteTitle(id), onStopClick(stopId) }
  function create(ctx) {
    const { core: c, el } = ctx;
    let box = null;
    let observer = null;
    const svgEl = (tag, attrs) => {
      const node = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
      return node;
    };

    function itemRow(a) {
      return el("div", { class: `days-item${a.site_id ? " site" : ""}` },
        a.time ? el("span", { class: "days-item-time" }, a.time) : null,
        el("span", {}, a.title || (a.site_id ? ctx.siteTitle(a.site_id) : "Untitled")));
    }
    function subBox(stop, day) {
      return el("div", { class: "days-sub", "data-stop-id": stop.id, "data-day": String(day) }, ...stop.activities.map(itemRow));
    }
    // "Underway · Potipot to Hundred Islands" for a day with no stops.
    function passageLabel(record, dayNumber) {
      const stops = c.stopEntries(record.route.points).map((e) => e.point);
      const before = [...stops].reverse().find((s) => s.depart && s.depart.day < dayNumber);
      const after = stops.find((s) => s.arrive && s.arrive.day > dayNumber);
      return before && after ? `Underway · ${before.name || "previous stop"} to ${after.name || "next stop"}` : "At sea";
    }
    function dayBox(record, day) {
      const charter = ctx.getCharter();
      const date = charter ? c.dayDateLabel(charter, day.day) : "";
      return el("div", { class: "days-day", "data-day": String(day.day) },
        el("div", { class: "days-day-title" }, `Day ${day.day}`, date ? el("span", { class: "muted" }, ` · ${date}`) : null),
        ...day.stops.map((stop) => subBox(stop, day.day)),
        day.stops.length ? null : el("div", { class: "days-passage muted" }, passageLabel(record, day.day)));
    }

    // Measures each sub-box, asks core for the geometry, then draws the SVG and places the titles.
    function drawLine(board, record, daysList) {
      const svg = board.querySelector(".days-line");
      const titles = board.querySelector(".days-titles");
      const list = board.querySelector(".days-list");
      const boardTop = board.getBoundingClientRect().top;
      const centres = new Map();
      list.querySelectorAll(".days-sub").forEach((node) => {
        const r = node.getBoundingClientRect();
        centres.set(`${node.dataset.stopId}:${node.dataset.day}`, r.top + r.height / 2 - boardTop);
      });
      const height = Math.max(list.offsetHeight, 1);
      svg.setAttribute("viewBox", `0 0 32 ${height}`);
      svg.setAttribute("width", "32");
      svg.setAttribute("height", String(height));
      svg.replaceChildren();
      titles.replaceChildren();
      titles.style.height = `${height}px`;
      const geo = c.lineGeometry(daysList, centres);
      if (!geo.shapes.length) return;
      const stopsById = new Map(c.stopEntries(record.route.points).map((e) => [e.point.id, e.point]));
      const times = c.estimateTimes(record);
      svg.append(svgEl("line", { class: "days-trunk", x1: LINE_X, y1: geo.top, x2: LINE_X, y2: geo.bottom }));
      geo.shapes.forEach((shape) => {
        if (shape.terminal === "origin") {
          svg.append(svgEl("path", { class: "days-terminal", d: `M ${LINE_X - 7} ${shape.y1 - 12} V ${shape.y2} A 7 7 0 0 0 ${LINE_X + 7} ${shape.y2} V ${shape.y1 - 12}` }));
        } else if (shape.terminal === "terminus") {
          svg.append(svgEl("path", { class: "days-terminal", d: `M ${LINE_X - 7} ${shape.y2 + 12} V ${shape.y1} A 7 7 0 0 1 ${LINE_X + 7} ${shape.y1} V ${shape.y2 + 12}` }));
        } else if (shape.kind === "loop") {
          svg.append(svgEl("rect", { class: "days-loop", x: LINE_X - LOOP_W / 2, y: shape.y1 - 7, width: LOOP_W, height: shape.y2 - shape.y1 + 14, rx: 7 }));
        } else {
          svg.append(svgEl("circle", { class: "days-dot", cx: LINE_X, cy: shape.y1, r: DOT_R }));
        }
        const stop = stopsById.get(shape.stopId);
        if (!stop) return;
        const label = c.stopTimesLabel(stop, times.get(shape.stopId));
        const title = el("div", { class: "days-stop-title", "data-stop-id": shape.stopId, onclick: () => ctx.onStopClick(shape.stopId) },
          el("div", { class: "days-stop-name" }, stop.name || "Stop"),
          el("div", { class: `days-stop-times muted${/~/.test(label) ? " est" : ""}` }, label));
        title.style.top = `${(shape.y1 + shape.y2) / 2}px`;
        titles.append(title);
        svg.lastElementChild.classList.add("days-clickable");
        svg.lastElementChild.addEventListener("click", () => ctx.onStopClick(shape.stopId));
      });
    }

    // Renders into `target` (kept for later calls). Safe to call while the tab is hidden: the ResizeObserver redraws
    // the line when the box gets a size.
    function render(target) {
      box = target || box;
      if (!box) return;
      const record = ctx.getRecord();
      const n = ctx.getDayCount();
      if (observer) { observer.disconnect(); observer = null; }
      if (!record || !n || !c.stopEntries(record.route.points).length) {
        box.replaceChildren(el("div", { class: "empty" }, n ? "No stops yet." : "Set the charter's start and end dates to lay out the days."));
        return;
      }
      const daysList = c.deriveDays(record, n);
      const board = el("div", { class: "days-board" },
        el("div", { class: "days-titles" }),
        svgEl("svg", { class: "days-line", "aria-hidden": "true" }),
        el("div", { class: "days-list" }, ...daysList.map((d) => dayBox(record, d))));
      box.replaceChildren(board);
      const draw = () => { if (box && box.contains(board) && board.offsetWidth) drawLine(board, record, daysList); };
      requestAnimationFrame(draw);
      observer = new ResizeObserver(draw);
      observer.observe(board);
    }

    return { render, destroy: () => { if (observer) observer.disconnect(); } };
  }

  window.IolantheRoutesDays = Object.freeze({ create });
})();
```

- [ ] **Step 2: Styles**

Append to `routes.css`:

```css
/* Days tab: the read-only tube line (spec A2 §5.2), ported from itinerary.css */
.routes-panel .days { --tube: #8b0000; --day: rgba(120, 160, 255, 0.07); --day-border: rgba(120, 160, 255, 0.55); --sub-border: rgba(120, 160, 255, 0.45); --act-border: rgba(70, 170, 200, 0.8); }
.routes-panel .days-board { display: grid; grid-template-columns: minmax(70px, 110px) 32px minmax(0, 1fr); gap: 0 6px; position: relative; align-items: start; }
.routes-panel .days-titles { position: relative; }
.routes-panel .days-line { display: block; overflow: visible; }
.routes-panel .days-list { display: flex; flex-direction: column; }
.routes-panel .days-stop-title { position: absolute; right: 0; transform: translateY(-50%); text-align: right; max-width: 100%; cursor: pointer; }
.routes-panel .days-stop-name { font-weight: 700; font-size: 12px; line-height: 1.2; }
.routes-panel .days-stop-times { font-size: 10.5px; line-height: 1.3; white-space: normal; }
.routes-panel .days-stop-times.est { font-style: italic; }
.routes-panel .days-trunk { stroke: var(--tube); stroke-width: 5; stroke-linecap: round; }
.routes-panel .days-terminal { stroke: var(--tube); stroke-width: 4; fill: #fff; stroke-linecap: round; }
.routes-panel .days-loop { fill: #fff; stroke: var(--tube); stroke-width: 3.5; }
.routes-panel .days-dot { fill: var(--tube); stroke: #fff; stroke-width: 2; }
.routes-panel .days-clickable { cursor: pointer; }
.routes-panel .days-day { background: var(--day); border: 1.4px solid var(--day-border); border-radius: 6px; padding: 6px 8px 8px; }
.routes-panel .days-day + .days-day { border-top-left-radius: 0; border-top-right-radius: 0; border-top: none; }
.routes-panel .days-day:first-child:not(:last-child) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.routes-panel .days-day:not(:first-child):not(:last-child) { border-radius: 0; }
.routes-panel .days-day-title { font-size: 11.5px; font-weight: 600; margin-bottom: 4px; }
.routes-panel .days-passage { font-size: 11.5px; padding: 4px 0 2px; }
.routes-panel .days-sub { background: rgba(255, 255, 255, 0.5); border: 1px solid var(--sub-border); border-radius: 4px; padding: 4px 6px; min-height: 26px; display: flex; flex-direction: column; gap: 3px; }
.routes-panel .days-sub + .days-sub { margin-top: 4px; }
.routes-panel .days-item { display: flex; gap: 6px; align-items: baseline; background: rgba(255, 255, 255, 0.95); border: 1px dashed var(--act-border); border-radius: 3px; padding: 2px 6px; font-size: 11.5px; }
.routes-panel .days-item.site { border-style: solid; }
.routes-panel .days-item-time { font-variant-numeric: tabular-nums; color: var(--muted); }
```

- [ ] **Step 3: Wire it in `routes.js` and `index.html`**

In `bind(opts)`, after `io = window.IolantheRoutesIo.create({ … });` add:

```js
    days = window.IolantheRoutesDays.create({
      core: icore(),
      el,
      getRecord: () => (work ? toRecord(work.route) : null),
      getCharter: charterOrNull,
      getDayCount: dayCount,
      siteTitle: (id) => { const s = (siteLibrary.sites || []).find((x) => x && x.id === id); return s && s.title ? s.title : id; },
      onStopClick: (stopId) => { if (cards) cards.select(stopId); }
    });
    days.render($("days"));
```

In `index.html` add after the `routes-io.js` script tag:

```html
  <script src="/admin/routes-days.js?v=admin-itin-v2" defer></script>
```

(The `?v=` is bumped for every tag in Task 12.)

- [ ] **Step 4: Verify in the browser**

Route page → Days tab: the tube line, day boxes and sub-boxes appear with the items; the origin/terminus open loops span multi-day dwells; clicking a stop title does nothing yet (Task 8 wires the card). Resize the window: the line follows. Switch to an unassigned route with stops: days 1…N from its own days, no dates. No console errors.

- [ ] **Step 5: Commit**

```bash
node --check routes-days.js
git add routes-days.js routes.css routes.js index.html
git commit -m "feat(routes): read-only Days tab - the tube-line day view inside the Route page (spec A2 §5.2)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `stop-cards.js` / `stop-cards.css` — the strip and the card

The whole module lands here (it is one unit: the strip, the card, its tiles, tabs, items and settings all read the same record). Tasks 9 and 10 are the browser passes over its two halves, each with its own fix commit. Read spec A2 §5.4–5.7 and the two mockups before starting.

**Files:**
- Create: `stop-cards.js`, `stop-cards.css`
- Modify: `routes.js` (`bind`), `index.html`

- [ ] **Step 1: Create `stop-cards.js`**

<!-- dryrun:stop-cards -->
```js
// Routes panel: the stop strip and the stop card (spec A2 §5.4–5.7). Every stop is a stacked edge either side of the
// open card; the card edits the stay (Depart), pins the arrival time, holds the day tabs with the itinerary items and
// the ⚙ settings tab. Created once per bind() by routes.js; the record itself stays in routes.js and is edited only
// through ctx.editRecord.
(function () {
  "use strict";

  const EDGE_WIDTHS = [26, 18, 12, 8, 6];   // px, by distance from the open card; further edges are EDGE_MIN
  const EDGE_MIN = 4;
  const SWIPE_PX = 48;
  const SITES_NEAR_NM = 5;
  const KIND_LABEL = { anchorage: "anchorage", stop: "stop", plain: "plain stop" };

  // ctx: { A, core (IolantheItineraryCore), rcore (IolantheRoutesCore), el, svg, openModal, places,
  //        getWork(), getCharter() (null for an unassigned route), getDayCount(), getSiteLibrary(), readOnly(),
  //        editRecord(fn, opts), askDrop(dropped, verb), removeStop(stopId), panToStop(stopId), highlightStop(stopId),
  //        openStartFrom() (charter mode) , status(message, tone) }
  function create(ctx) {
    const { core: c, el, svg } = ctx;
    let host = null;          // #routes-strip
    let selectedId = null;    // stop id of the open card
    let tab = "day";          // "day" | "settings"
    const activeDay = new Map();   // stopId → day shown
    let menu = null;          // the open add-item menu, if any

    const record = () => ctx.getWork() ? toRecord() : null;
    const toRecord = () => {
      const r = ctx.getWork().route;
      return { version: 2, route: { source: r.source || null, speed_kn: r.speed_kn, points: r.points }, activities: r.activities || [], dirty_stop_ids: r.dirty_stop_ids || [] };
    };
    const stops = (rec) => c.stopEntries(rec.route.points).map((e, i, all) => ({ point: e.point, index: e.index, n: i + 1, position: c.positionOf(i, all.length) }));
    const siteTitle = (id) => { const s = ((ctx.getSiteLibrary() || {}).sites || []).find((x) => x && x.id === id); return s && s.title ? s.title : id; };
    const dayLabel = (day) => { const ch = ctx.getCharter(); return ch && ch.start_date ? c.dayDateLabel(ch, day) : `Day ${day}`; };
    const shortDate = (day) => { const ch = ctx.getCharter(); return ch && ch.start_date ? c.dayDateLabel(ch, day).replace(/ \w+$/, "") : `Day ${day}`; };   // "Tue 13"
    const fmtHours = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`; };
    const iconBtn = (icon, title, onclick, cls, disabled) => {
      const b = el("button", { type: "button", class: `icon-btn small ${cls || ""}`.trim(), title, "aria-label": title, onclick, disabled: disabled || undefined });
      b.innerHTML = svg(icon);
      return b;
    };
    const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };

    // ---------- selection and navigation ----------

    function selectedIdOf(rec) {
      const list = stops(rec);
      if (!list.length) return null;
      if (!list.some((s) => s.point.id === selectedId)) selectedId = list[0].point.id;
      return selectedId;
    }

    // Opens a card. Spinning to a dirty card clears it (spec A2 D11, no confirm) and the map pans to the stop.
    function select(stopId, opts) {
      const rec = record();
      if (!rec || !stops(rec).some((s) => s.point.id === stopId)) return;
      const o = { pan: true, ...(opts || {}) };
      selectedId = stopId;
      tab = "day";
      closeMenu();
      if (rec.dirty_stop_ids.includes(stopId) && !ctx.readOnly()) {
        ctx.editRecord((r) => ({ ...r, dirty_stop_ids: r.dirty_stop_ids.filter((id) => id !== stopId) }), { history: false, map: false });
      } else {
        render();
      }
      if (o.pan) ctx.panToStop(stopId); else ctx.highlightStop(stopId);
    }
    function step(delta) {
      const rec = record();
      if (!rec) return;
      const list = stops(rec);
      const k = list.findIndex((s) => s.point.id === selectedIdOf(rec));
      const next = list[k + delta];
      if (next) select(next.point.id);
    }

    // ---------- the strip ----------

    function edge(stop, distance, rec, fitState) {
      const width = EDGE_WIDTHS[distance - 1] || EDGE_MIN;
      const dirty = rec.dirty_stop_ids.includes(stop.point.id);
      const good = fitState === "match" && stop.position === "terminus";
      const name = stop.point.name || "Stop";
      return el("button", {
        type: "button", class: `strip-edge${dirty ? " dirty" : ""}${good ? " good" : ""}`, style: `width:${width}px`,
        title: `${stop.n} · ${name}${dirty ? " · check this stop" : ""}`, "aria-label": `Open stop ${stop.n}, ${name}`,
        onclick: () => select(stop.point.id)
      }, el("span", { class: "strip-edge-label" }, `${stop.n} · ${name}`));
    }

    function render() {
      host = document.getElementById("routes-strip");
      const rec = record();
      if (!host || !rec) return;
      closeMenu();
      const list = stops(rec);
      if (!list.length) {
        host.replaceChildren(el("div", { class: "strip-empty" },
          el("span", { class: "empty" }, "No stops yet. Tap an anchorage in Add mode, or"),
          ctx.getCharter() && !ctx.readOnly() ? iconBtn("start", "Start from an unassigned route or another charter", () => ctx.openStartFrom()) : el("span", { class: "empty" }, " make a waypoint a stop.")));
        return;
      }
      const id = selectedIdOf(rec);
      const k = list.findIndex((s) => s.point.id === id);
      const fitState = c.fit(rec, ctx.getCharter()).state;
      const left = list.slice(0, k).map((s, i) => edge(s, k - i, rec, fitState));
      const right = list.slice(k + 1).map((s, i) => edge(s, i + 1, rec, fitState));
      const strip = el("div", { class: `strip${ctx.readOnly() ? " ro" : ""}` },
        iconBtn("prev", "Previous stop (←)", () => step(-1), "", k === 0),
        el("div", { class: "strip-edges left" }, ...left),
        card(list[k], rec),
        el("div", { class: "strip-edges right" }, ...right),
        iconBtn("next", "Next stop (→)", () => step(1), "", k === list.length - 1));
      host.replaceChildren(strip);
      if (ctx.readOnly()) strip.querySelectorAll(".stop-card input, .stop-card select, .stop-card textarea, .stop-card .edit-only").forEach((n) => { n.disabled = true; });
    }

    // ---------- the card ----------

    function card(stop, rec) {
      const p = stop.point;
      const anchorage = ctx.places && p.anchorage_id ? ctx.places.findAnchorage(p.anchorage_id) : null;
      const kind = p.anchorage_id ? (anchorage && anchorage.kind === "stop" ? "stop" : "anchorage") : "plain";
      const nights = p.arrive && p.depart ? p.depart.day - p.arrive.day : (p.depart && !p.arrive ? p.depart.day - 1 : 0);
      const stay = stop.position === "terminus" ? "end of route" : (nights ? `${nights} night${nights === 1 ? "" : "s"}` : "day stop");
      const art = el("article", { class: `stop-card${rec.dirty_stop_ids.includes(p.id) ? " dirty" : ""}`, tabindex: "0", "aria-label": `Stop ${stop.n}, ${p.name || "Stop"}`, "data-stop-id": p.id });
      art.append(
        el("header", { class: "stop-card-head" },
          el("span", { class: "stop-num" }, stop.n),
          el("div", { class: "stop-card-title" }, el("h3", {}, p.name || "Stop"), el("div", { class: "muted stop-card-sub" }, `${KIND_LABEL[kind]} · ${stay}`)),
          el("div", { class: "icon-row" },
            iconBtn("prev", "Previous stop (←)", () => step(-1), "", stop.position === "origin" || stop.position === "only"),
            iconBtn("next", "Next stop (→)", () => step(1), "", stop.position === "terminus" || stop.position === "only"),
            iconBtn("gear", "Stop settings", () => { tab = tab === "settings" ? "day" : "settings"; render(); }, tab === "settings" ? "on" : ""))),
        el("div", { class: "tiles" }, arriveTile(stop, rec), departTile(stop, rec), nextLegTile(stop, rec)),
        tab === "settings" ? settingsTab(stop, rec, kind) : dayTabs(stop, rec));
      art.addEventListener("keydown", (e) => {
        if (e.target !== art) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      });
      // A horizontal swipe on the header scrolls the strip (touch and mouse alike).
      const head = art.querySelector(".stop-card-head");
      head.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        const startX = e.clientX;
        const up = (ev) => { head.removeEventListener("pointerup", up); const dx = ev.clientX - startX; if (dx > SWIPE_PX) step(-1); else if (dx < -SWIPE_PX) step(1); };
        head.addEventListener("pointerup", up, { once: true });
      });
      return art;
    }

    function tile(label, value, sub, cls) {
      return el("div", { class: `tile ${cls || ""}`.trim() }, el("div", { class: "tile-k" }, label), el("div", { class: "tile-v" }, value), sub ? el("div", { class: "tile-s" }, sub) : null);
    }

    // Arrive: estimated (italic) or pinned (upright) time with the inbound leg underneath; the origin shows boarding.
    function arriveTile(stop, rec) {
      const p = stop.point;
      if (stop.position === "origin" || stop.position === "only") {
        const ch = ctx.getCharter();
        return tile("Arrive", ch && ch.start_date ? c.dayDateLabel(ch, 1) : "Day 1", "boarding");
      }
      const times = c.estimateTimes(rec).get(p.id) || { arrive: null };
      const prev = stops(rec)[stop.n - 2];
      const leg = prev ? c.legSummaries(rec).get(prev.point.id) : null;
      const estimated = !(p.arrive && p.arrive.time);
      const timeInput = el("input", { type: "time", class: `tile-time${estimated ? " est" : ""}`, value: times.arrive ? times.arrive.time : "", title: estimated ? "Estimated from the previous departure. Set a time to pin it." : "Pinned arrival time. Clear it to estimate again." });
      timeInput.addEventListener("change", () => ctx.editRecord((r) => c.recomputeArrivals(c.setStopTime(r, p.id, "arrive", timeInput.value))));
      const value = el("div", { class: "tile-row" }, estimated ? el("span", { class: "est" }, "~") : null, timeInput, el("span", {}, dayLabel(p.arrive ? p.arrive.day : 1)));
      const sub = leg ? `${leg.nm.toFixed(0)} nm · ${fmtHours(leg.hours)} from ${prev.point.name || "the previous stop"}` : "";
      return tile("Arrive", value, sub, estimated ? "estimated" : "pinned");
    }

    // Depart: a date (or day number without a charter) no earlier than the arrival day, and a time. Spec A2 D1, §5.6, §5.7.
    function departTile(stop, rec) {
      const p = stop.point;
      if (!p.depart) {
        const ch = ctx.getCharter();
        return tile("Depart", "—", ch && ch.end_date ? `charter ends ${c.dayDateLabel(ch, c.charterDayCount(ch))}` : "end of route");
      }
      const ch = ctx.getCharter();
      const start = ch ? c.parseDateOnly(ch.start_date) : null;
      const arriveDay = p.arrive ? p.arrive.day : 1;
      const toIso = (day) => new Date(start + (day - 1) * 86400000).toISOString().slice(0, 10);
      const dayInput = start !== null
        ? el("input", { type: "date", class: "tile-date edit-only", value: toIso(p.depart.day), min: toIso(arriveDay) })
        : el("input", { type: "number", class: "tile-date edit-only", value: String(p.depart.day), min: String(arriveDay), step: "1", "aria-label": "Departure day" });
      const timeInput = el("input", { type: "time", class: "tile-time edit-only", value: p.depart.time || "", title: "Departure time (blank: 09:00 is assumed)" });
      const dayOf = () => {
        if (start === null) return parseInt(dayInput.value, 10);
        const t = c.parseDateOnly(dayInput.value);
        return t === null ? NaN : Math.round((t - start) / 86400000) + 1;
      };
      dayInput.addEventListener("change", async () => {
        const day = dayOf();
        if (!Number.isInteger(day) || day < arriveDay) { render(); return; }
        if (day < p.depart.day) {
          const dropped = c.droppedDays(rec, p.id, day);
          if (dropped.items.length && !(await ctx.askDrop(dropped, "Changing the date"))) { render(); return; }
        }
        ctx.editRecord((r) => c.setDeparture(r, p.id, { day }));
      });
      timeInput.addEventListener("change", () => ctx.editRecord((r) => c.setDeparture(r, p.id, { time: timeInput.value })));
      const nights = p.depart.day - arriveDay;
      return tile("Depart", el("div", { class: "tile-row" }, dayInput, timeInput), stop.position === "origin" ? (nights ? `${nights} night${nights === 1 ? "" : "s"} aboard before sailing` : "sails on day 1") : (nights ? `${nights} night${nights === 1 ? "" : "s"}` : "day stop"));
    }

    function nextLegTile(stop, rec) {
      const leg = c.legSummaries(rec).get(stop.point.id);
      if (!leg) return el("div", { class: "tile blank" });
      const arrive = `${leg.overnight ? "overnight → " : ""}arrives ~${leg.arriveTime}${leg.overnight ? ` ${shortDate(leg.arriveDay)}` : ""}`;
      return tile("Next leg", `${leg.nm.toFixed(0)} nm · ${fmtHours(leg.hours)}`, `${arrive} · ${leg.toName}`);
    }

    // ---------- day tabs and items ----------

    function dayTabs(stop, rec) {
      const span = c.stopSpan(stop.point, stop.position, ctx.getDayCount());
      const days = [];
      for (let d = span.from; d <= span.to; d += 1) days.push(d);
      let day = activeDay.get(stop.point.id);
      if (!days.includes(day)) { day = days[0]; activeDay.set(stop.point.id, day); }
      const counts = new Map(days.map((d) => [d, rec.activities.filter((a) => a.stop_id === stop.point.id && a.day === d).length]));
      const tabs = el("div", { class: "card-tabs", role: "tablist" }, ...days.map((d) => {
        const b = el("button", { type: "button", role: "tab", class: "card-tab", "aria-selected": String(d === day), "data-day": String(d), onclick: () => { activeDay.set(stop.point.id, d); render(); } },
          el("span", { class: "card-tab-t" }, shortDate(d)), el("span", { class: "card-tab-d" }, `Day ${d} · ${counts.get(d)} item${counts.get(d) === 1 ? "" : "s"}`));
        return b;
      }));
      return el("div", { class: "card-body" }, tabs, itemList(stop, rec, day));
    }

    function itemList(stop, rec, day) {
      const items = rec.activities.filter((a) => a.stop_id === stop.point.id && a.day === day).sort((a, b) => a.order - b.order);
      const clash = c.clashes(rec);
      const list = el("div", { class: "items", "data-stop-id": stop.point.id, "data-day": String(day) }, ...items.map((a) => itemRow(a, clash.get(a.id), stop, rec)));
      const add = el("div", { class: "items-add" },
        iconBtn("anchor", "Add an item from a site this stop serves", (e) => openAddMenu(stop, rec, day, e.currentTarget, "served"), "edit-only", !(stop.point.site_ids || []).length),
        iconBtn("search", "Add an item from any site", (e) => openAddMenu(stop, rec, day, e.currentTarget, "search"), "edit-only"),
        iconBtn("plus", "Add a free-text item", () => addItem(stop, rec, day, { title: "" }), "edit-only"),
        el("span", { class: "muted items-hint" }, items.length ? "" : "Nothing planned this day yet."));
      return el("div", { class: "day-panel" }, list, add);
    }

    // A row: coloured bar (blue site, teal free text, red clash), time, title, site, clash reason, grip, remove.
    function itemRow(a, clashReason, stop, rec) {
      const row = el("div", { class: `item${a.site_id ? " site" : " free"}${clashReason ? " clash" : ""}`, "data-activity-id": a.id, title: a.notes || "" },
        el("span", { class: "item-bar" }),
        el("span", { class: "item-time" }, a.time || "—"),
        el("span", { class: "item-title" }, a.title || (a.site_id ? siteTitle(a.site_id) : "Untitled")),
        el("span", { class: "muted item-site" }, clashReason ? "" : (a.site_id ? siteTitle(a.site_id) : "")),
        clashReason ? el("span", { class: "item-clash" }, clashReason) : null,
        el("span", { class: "item-grip edit-only", title: "Drag to reorder, or onto another day", "aria-hidden": "true" }),
        iconBtn("cancel", `Remove ${a.title || "item"}`, (e) => { e.stopPropagation(); ctx.editRecord((r) => c.removeActivity(r, a.id)); }, "quiet edit-only"));
      row.querySelector(".item-grip").innerHTML = svg("grip");
      row.addEventListener("click", (e) => { if (!ctx.readOnly() && !e.target.closest("button, .item-grip")) editItem(row, a); });
      row.querySelector(".item-grip").addEventListener("pointerdown", (e) => { if (!ctx.readOnly()) startDrag(e, a, row, stop); });
      return row;
    }

    // Inline editor: title, time, duration (minutes), notes. Enter or ✓ commits; Escape or ✕ cancels.
    function editItem(row, a) {
      closeMenu();
      const title = el("input", { type: "text", class: "edit-title", value: a.title, maxlength: String(c.MAX_TITLE_LENGTH), placeholder: "Title" });
      const time = el("input", { type: "time", class: "edit-time", value: a.time || "" });
      const duration = el("input", { type: "number", class: "edit-duration", value: a.duration_min === undefined ? "" : String(a.duration_min), min: String(c.MIN_DURATION_MIN), max: String(c.MAX_DURATION_MIN), step: "5", placeholder: "60", title: "Duration in minutes (1 h when blank)" });
      const notes = el("textarea", { class: "edit-notes", rows: "2", placeholder: "Notes for guests", maxlength: String(c.MAX_NOTES_LENGTH) }, a.notes || "");
      const done = () => ctx.editRecord((r) => c.updateActivity(r, a.id, { title: title.value, time: time.value, duration_min: duration.value === "" ? "" : Number(duration.value), notes: notes.value }));
      const cancel = () => render();
      const form = el("div", { class: "item-edit" },
        el("div", { class: "item-edit-row" }, title, time, duration, el("span", { class: "muted" }, "min")),
        notes,
        el("div", { class: "icon-row" }, iconBtn("check", "Done (Enter)", done, "success"), iconBtn("cancel", "Cancel (Esc)", cancel, "danger")));
      [title, time, duration, notes].forEach((input) => input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        if (e.key === "Enter" && input !== notes) { e.preventDefault(); done(); }
      }));
      row.replaceChildren(form);
      row.classList.add("editing");
      title.focus();
      title.select();
    }

    function addItem(stop, rec, day, fields) {
      closeMenu();
      let added = null;
      ctx.editRecord((r) => { const next = c.addActivity(r, stop.point.id, day, fields); added = next.activities[next.activities.length - 1]; return next; });
      if (added && !fields.site_id) {
        const row = host.querySelector(`.item[data-activity-id="${added.id}"]`);
        if (row) editItem(row, added);
      }
    }

    // Add-item menu: "served" lists the stop's sites not yet on this day; "search" is a type-ahead over every site by distance.
    function openAddMenu(stop, rec, day, anchor, mode) {
      closeMenu();
      const p = stop.point;
      const onDay = new Set(rec.activities.filter((a) => a.stop_id === p.id && a.day === day && a.site_id).map((a) => a.site_id));
      const pick = (id, title) => addItem(stop, rec, day, { title, site_id: id });
      let rows;
      if (mode === "served") {
        rows = (p.site_ids || []).filter((id) => !onDay.has(id)).map((id) => el("button", { type: "button", class: "menu-item", onclick: () => pick(id, siteTitle(id)) }, siteTitle(id)));
        if (!rows.length) rows = [el("div", { class: "muted" }, "Every served site is already on this day.")];
        menu = el("div", { class: "card-menu", role: "menu" }, ...rows);
      } else {
        const all = c.sitesByDistance(ctx.getSiteLibrary(), p);
        const search = el("input", { type: "search", class: "menu-search", placeholder: "Site name…" });
        const results = el("div", { class: "menu-results" });
        const show = () => {
          const q = search.value.trim().toLowerCase();
          results.replaceChildren(...all.filter((s) => !q || s.title.toLowerCase().includes(q)).slice(0, 8).map((s) =>
            el("button", { type: "button", class: `menu-item${s.near ? " near" : ""}`, onclick: () => pick(s.id, s.title) }, `${s.title} `, el("span", { class: "muted" }, `${s.nm.toFixed(1)} nm`))));
        };
        search.addEventListener("input", show);
        show();
        menu = el("div", { class: "card-menu", role: "menu" }, search, results);
      }
      anchor.closest(".items-add").append(menu);
      setTimeout(() => document.addEventListener("pointerdown", (e) => { if (menu && !menu.contains(e.target) && e.target !== anchor) closeMenu(); }, { capture: true, once: true }), 0);
      const first = menu.querySelector("input, button");
      if (first) first.focus();
    }

    // Drag an item by its grip: within the day to reorder, or onto another Day tab to move it (pointer events, so touch works).
    function startDrag(event, a, row, stop) {
      event.preventDefault();
      const grip = event.currentTarget;
      grip.setPointerCapture(event.pointerId);
      const ghost = row.cloneNode(true);
      ghost.classList.add("ghost");
      ghost.style.width = `${row.offsetWidth}px`;
      document.body.append(ghost);
      row.classList.add("source");
      let target = null;   // { day, index }
      const clear = () => host.querySelectorAll(".card-tab.over, .items.over").forEach((n) => n.classList.remove("over"));
      const locate = (e) => {
        ghost.style.left = `${e.clientX + 8}px`;
        ghost.style.top = `${e.clientY - 10}px`;
        ghost.style.display = "none";
        const under = document.elementFromPoint(e.clientX, e.clientY);
        ghost.style.display = "";
        clear();
        const tabEl = under && under.closest ? under.closest(".card-tab") : null;
        const list = under && under.closest ? under.closest(".items") : null;
        if (tabEl) { tabEl.classList.add("over"); target = { day: Number(tabEl.dataset.day), index: undefined }; return; }
        if (list) {
          const rows = [...list.querySelectorAll(".item")].filter((r) => r !== row);
          const index = rows.filter((r) => { const b = r.getBoundingClientRect(); return e.clientY > b.top + b.height / 2; }).length;
          list.classList.add("over");
          target = { day: Number(list.dataset.day), index };
          return;
        }
        target = null;
      };
      const finish = () => {
        grip.removeEventListener("pointermove", locate);
        grip.removeEventListener("pointerup", finish);
        grip.removeEventListener("pointercancel", finish);
        ghost.remove();
        row.classList.remove("source");
        clear();
        if (!target) return;
        if (target.day !== a.day) activeDay.set(stop.point.id, target.day);
        ctx.editRecord((r) => c.moveActivity(r, a.id, stop.point.id, target.day, target.index));
      };
      grip.addEventListener("pointermove", locate);
      grip.addEventListener("pointerup", finish);
      grip.addEventListener("pointercancel", finish);
    }

    // ---------- ⚙ settings tab ----------

    function settingsTab(stop, rec, kind) {
      const p = stop.point;
      const name = el("input", { type: "text", value: p.name || "", maxlength: String(c.MAX_TITLE_LENGTH), placeholder: "Stop name" });
      name.addEventListener("change", () => ctx.editRecord((r) => ({ ...r, route: { ...r.route, points: r.route.points.map((q) => (c.isStop(q) && q.id === p.id ? { ...q, name: name.value.trim() || undefined } : q)) } }), { map: true }));

      const sites = c.sitesByDistance(ctx.getSiteLibrary(), p);
      const served = new Set(p.site_ids || []);
      const siteRows = sites.filter((s) => s.near || served.has(s.id)).map((s) => {
        const cb = el("input", { type: "checkbox", checked: served.has(s.id) || undefined });
        cb.addEventListener("change", async () => {
          const ids = cb.checked ? [...(p.site_ids || []), s.id] : (p.site_ids || []).filter((x) => x !== s.id);
          if (!cb.checked && rec.activities.some((a) => a.stop_id === p.id && a.site_id === s.id)) {
            const ok = await ctx.A.showAdminConfirm({ title: "Remove site", message: `Items at ${s.title} on this stop will be removed too.`, confirmLabel: "Remove", cancelLabel: "Keep", tone: "warning" });
            if (!ok) { cb.checked = true; return; }
          }
          ctx.editRecord((r) => c.setStopSites(r, p.id, ids), { map: true });
        });
        return el("label", { class: `site-row${s.near ? " near" : ""}` }, cb, ` ${s.title} `, el("span", { class: "muted d" }, `${s.nm.toFixed(1)} nm`));
      });
      const far = sites.filter((s) => !s.near && !served.has(s.id));
      const more = far.length ? el("details", { class: "site-more" }, el("summary", { class: "muted" }, `${far.length} further away`), ...far.map((s) => {
        const cb = el("input", { type: "checkbox" });
        cb.addEventListener("change", () => ctx.editRecord((r) => c.setStopSites(r, p.id, [...(p.site_ids || []), s.id]), { map: true }));
        return el("label", { class: "site-row" }, cb, ` ${s.title} `, el("span", { class: "muted d" }, `${s.nm.toFixed(1)} nm`));
      })) : null;

      const speed = stop.position !== "terminus" && stop.position !== "only" ? (() => {
        const input = el("input", { type: "number", min: "0.5", max: "30", step: "0.5", value: p.leg_speed_kn ? String(p.leg_speed_kn) : "", placeholder: String(rec.route.speed_kn || c.DEFAULT_SPEED_KN), title: "Speed for the leg leaving this stop; blank uses the route speed" });
        input.addEventListener("change", () => {
          const v = input.value === "" ? 0 : parseFloat(input.value);
          if (input.value !== "" && !(v > 0 && v <= 30)) { ctx.status("Enter a speed between 0.5 and 30 kn.", "error"); input.value = p.leg_speed_kn || ""; return; }
          ctx.editRecord((r) => c.recomputeArrivals({ ...r, route: { ...r.route, points: ctx.rcore.setLegSpeed(r.route.points, stop.index, v) } }), { map: true });
        });
        return el("div", { class: "field" }, el("label", {}, "Next leg speed"), el("div", { class: "tile-row" }, input, el("span", { class: "muted" }, "kn")));
      })() : null;

      const global = kind !== "anchorage" ? (() => {
        const cb = el("input", { type: "checkbox", checked: kind === "stop" || undefined, class: "edit-only" });
        cb.addEventListener("change", async () => {
          if (cb.checked) {
            const saved = await ctx.places.createStop(p);
            if (!saved) { cb.checked = false; return; }
            ctx.editRecord((r) => ({ ...r, route: { ...r.route, points: r.route.points.map((q) => (c.isStop(q) && q.id === p.id ? { ...q, anchorage_id: saved.id, stop: undefined } : q)) } }), { map: true });
          } else {
            ctx.editRecord((r) => ({ ...r, route: { ...r.route, points: r.route.points.map((q) => (c.isStop(q) && q.id === p.id ? { ...q, anchorage_id: undefined, stop: true } : q)) } }), { map: true });
          }
        });
        return el("label", { class: "switch-row" }, cb, el("span", {}, "Global stop"), el("span", { class: "muted" }, kind === "stop" ? "shown on every route map" : "save it to the library so every route map shows it"));
      })() : null;

      const remove = el("button", { type: "button", class: "text-btn danger-text edit-only", onclick: () => ctx.removeStop(p.id) }, "Remove stop");
      return el("div", { class: "card-body settings" },
        el("div", { class: "field" }, el("label", {}, "Name"), name),
        el("div", { class: "field" }, el("label", {}, "Sites served"), el("div", { class: "site-pick" }, ...(siteRows.length ? siteRows : [el("div", { class: "muted" }, `No sites within ${SITES_NEAR_NM} nm`)]), more)),
        speed,
        global,
        el("div", { class: "settings-foot" }, remove, el("span", { class: "muted" }, "The point stays as a waypoint; its items go.")));
    }

    return { render, select, step, selectedId: () => selectedId, destroy: closeMenu };
  }

  window.IolantheStopCards = Object.freeze({ create });
})();
```

- [ ] **Step 2: Create `stop-cards.css`**

<!-- dryrun:stop-cards-css -->
```css
/* The stop strip and the stop card (spec A2 §5.4–5.5). Scoped under .routes-panel; colours follow routes.css. */

/* Strip: prev | left edges | card | right edges | next */
.routes-panel .strip { display: flex; align-items: stretch; gap: 6px; min-height: 240px; }
.routes-panel .strip > .icon-btn { align-self: center; flex: none; }
.routes-panel .strip-edges { display: flex; align-items: stretch; gap: 2px; flex: none; }
.routes-panel .strip-edges.left { flex-direction: row; }
.routes-panel .strip-edges.right { flex-direction: row; }
.routes-panel .strip-edge { position: relative; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--muted); padding: 0; min-height: 0; cursor: pointer; overflow: hidden; font-weight: 400; }
.routes-panel .strip-edge:hover { border-color: var(--accent); background: #fff; }
.routes-panel .strip-edge:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.routes-panel .strip-edge-label { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); writing-mode: vertical-rl; font-size: 11px; white-space: nowrap; color: inherit; }
.routes-panel .strip-edge.dirty { background: #f5c6c2; border-color: var(--danger); color: #7a2a24; }
.routes-panel .strip-edge.good { background: #cfe8cf; border-color: var(--ok); color: #1e5a3b; }
.routes-panel .strip-empty { display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 12px 14px; border: 1px dashed var(--line); border-radius: 8px; }

/* Card */
.routes-panel .stop-card { flex: 1; min-width: 0; background: #fff; border: 1.6px solid var(--accent); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.routes-panel .stop-card.dirty { border-color: var(--danger); }
.routes-panel .stop-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.routes-panel .stop-card-head { display: flex; align-items: center; gap: 10px; touch-action: pan-y; }
.routes-panel .stop-card-head .stop-num { width: 26px; height: 26px; font-size: 13px; }
.routes-panel .stop-card-title { flex: 1; min-width: 0; }
.routes-panel .stop-card-title h3 { margin: 0; font-size: 16px; line-height: 1.2; }
.routes-panel .stop-card-sub { font-size: 12px; }
.routes-panel .icon-btn.small.on { background: var(--accent); color: #fff; }
.routes-panel .icon-btn.small.quiet { background: transparent; }
.routes-panel .icon-btn.small.quiet:hover { background: #f7e3e1; color: var(--danger); }

/* Tiles: Arrive · Depart · Next leg */
.routes-panel .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.routes-panel .tile { background: var(--soft); border-radius: 8px; padding: 8px 10px; min-height: 64px; }
.routes-panel .tile.blank { background: transparent; }
.routes-panel .tile-k { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.routes-panel .tile-v { font-size: 15px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
.routes-panel .tile.estimated .tile-v { color: var(--muted); font-style: italic; font-weight: 600; }
.routes-panel .tile-s { font-size: 11px; color: var(--muted); margin-top: 3px; }
.routes-panel .tile-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.routes-panel .tile input.tile-time, .routes-panel .tile input.tile-date { min-height: 0; height: 28px; font: inherit; font-size: 13px; font-weight: 700; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; background: #fff; color: var(--ink); }
.routes-panel .tile input.tile-time { width: 92px; }
.routes-panel .tile input.tile-date { width: 150px; }
.routes-panel .tile input.tile-time.est { font-style: italic; font-weight: 600; color: var(--muted); }
.routes-panel .tile input:disabled { opacity: .7; }

/* Day tabs and the ⚙ tab */
.routes-panel .card-body { display: flex; flex-direction: column; gap: 8px; }
.routes-panel .card-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.routes-panel .card-tab { border: 1px solid var(--line); border-radius: 6px; background: var(--soft); color: var(--ink); padding: 4px 10px; min-height: 0; text-align: left; cursor: pointer; display: grid; font-weight: 400; }
.routes-panel .card-tab[aria-selected="true"] { background: #fff; border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.routes-panel .card-tab.over { outline: 2px solid var(--accent); outline-offset: 1px; }
.routes-panel .card-tab-t { font-size: 12px; font-weight: 700; }
.routes-panel .card-tab-d { font-size: 10px; color: var(--muted); }

/* Items */
.routes-panel .items { display: flex; flex-direction: column; gap: 4px; min-height: 28px; border-radius: 6px; }
.routes-panel .items.over { outline: 2px solid var(--accent); outline-offset: 2px; }
.routes-panel .item { display: grid; grid-template-columns: 4px 48px minmax(0, 1fr) auto auto auto; align-items: center; gap: 8px; background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 0 6px 0 0; min-height: 30px; font-size: 13px; cursor: text; }
.routes-panel .item-bar { align-self: stretch; border-radius: 6px 0 0 6px; background: var(--accent); }
.routes-panel .item.site .item-bar { background: var(--stop); }
.routes-panel .item.clash { background: #fbeeed; border-color: var(--danger); }
.routes-panel .item.clash .item-bar { background: var(--danger); }
.routes-panel .item-time { font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; padding-left: 4px; }
.routes-panel .item-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.routes-panel .item-site { font-size: 12px; white-space: nowrap; }
.routes-panel .item-clash { font-size: 12px; color: var(--danger); white-space: nowrap; }
.routes-panel .item-grip { display: inline-grid; place-items: center; width: 22px; height: 22px; color: var(--muted); cursor: grab; touch-action: none; }
.routes-panel .item-grip svg { width: 16px; height: 16px; fill: currentColor; stroke: none; }
.routes-panel .item .icon-btn.small { width: 26px; height: 26px; }
.routes-panel .item .icon-btn.small svg { width: 14px; height: 14px; }
.routes-panel .item.ghost { position: fixed; z-index: 50; pointer-events: none; opacity: .85; box-shadow: var(--shadow); width: auto; }
.routes-panel .item.source { opacity: .35; }
.routes-panel .item.editing { display: block; padding: 6px; cursor: default; }
.routes-panel .item-edit { display: flex; flex-direction: column; gap: 6px; }
.routes-panel .item-edit-row { display: grid; grid-template-columns: minmax(0, 1fr) 100px 72px auto; gap: 6px; align-items: center; }
.routes-panel .item-edit input, .routes-panel .item-edit textarea { font: inherit; font-size: 13px; min-height: 0; padding: 4px 6px; border: 1px solid var(--line); border-radius: 4px; background: #fff; color: var(--ink); }
.routes-panel .item-edit textarea { resize: vertical; min-height: 40px; }
.routes-panel .items-add { position: relative; display: flex; align-items: center; gap: 6px; }
.routes-panel .items-hint { font-size: 12px; margin-left: 6px; }
.routes-panel .card-menu { position: absolute; z-index: 600; left: 0; top: 100%; margin-top: 4px; width: min(320px, 100%); background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.routes-panel .menu-item { text-align: left; border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 4px; padding: 5px 8px; min-height: 0; font-weight: 400; cursor: pointer; }
.routes-panel .menu-item:hover { border-color: var(--accent); background: #fff; }
.routes-panel .menu-item.near { font-weight: 700; }
.routes-panel .menu-search { font: inherit; padding: 4px 6px; border: 1px solid var(--line); border-radius: 4px; }
.routes-panel .menu-results { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow: auto; }

/* ⚙ settings */
.routes-panel .settings .site-pick { max-height: 180px; }
.routes-panel .settings .site-row { display: flex; gap: 6px; align-items: center; padding: 3px 0; font-size: 12.5px; text-transform: none; letter-spacing: 0; color: var(--ink); font-weight: 400; margin: 0; cursor: pointer; }
.routes-panel .settings .site-row.near { font-weight: 700; }
.routes-panel .settings .site-row .d { margin-left: auto; font-weight: 400; }
.routes-panel .settings .site-row input[type=checkbox], .routes-panel .settings .switch-row input[type=checkbox] { width: 16px; height: 16px; min-height: 0; padding: 0; margin: 0; flex: none; }
.routes-panel .settings .site-more summary { cursor: pointer; font-size: 12px; padding: 4px 0; }
.routes-panel .settings .switch-row { display: flex; gap: 8px; align-items: center; font-size: 13px; cursor: pointer; }
.routes-panel .settings .field input[type=number] { width: 80px; }
.routes-panel .settings-foot { display: flex; align-items: center; gap: 10px; font-size: 12px; }

/* Read-only after the charter has ended */
.routes-panel .strip.ro .stop-card { border-style: dashed; }
.routes-panel .strip.ro .items-add, .routes-panel .strip.ro .item-grip, .routes-panel .strip.ro .item .icon-btn { display: none; }

@media (max-width: 900px) {
  .routes-panel .tiles { grid-template-columns: 1fr; }
  .routes-panel .item { grid-template-columns: 4px 48px minmax(0, 1fr) auto auto; }
  .routes-panel .item-site { display: none; }
  .routes-panel .strip-edge-label { display: none; }
}
```

- [ ] **Step 3: Wire it into `routes.js`**

In `bind(opts)`, after the `days = …; days.render($("days"));` lines from Task 7, add:

```js
    cards = window.IolantheStopCards.create({
      A: A(), core: icore(), rcore: core(), el, svg, openModal, places: myPlaces,
      getWork: () => work, getCharter: charterOrNull, getDayCount: dayCount, getSiteLibrary: () => siteLibrary,
      readOnly, editRecord, askDrop,
      removeStop: (stopId) => { const i = work.route.points.findIndex((p) => p.id === stopId); if (i >= 0) removeStopAt(i); },
      panToStop, highlightStop, openStartFrom, status
    });
```

In `index.html` add the stylesheet after `routes.css` and the script after `routes-days.js`:

```html
  <link rel="stylesheet" href="/admin/stop-cards.css?v=admin-itin-v2">
```
```html
  <script src="/admin/stop-cards.js?v=admin-itin-v2" defer></script>
```

- [ ] **Step 4: Verify the strip and navigation in the browser**

Route page, charter route with stops (the scratch data's `csaba` has 7 stops and 13 items):

- The strip sits under the map at full width: Previous button, stacked edges on the left (26, 18, 12 … px, each labelled vertically "N · Name"), the open card, edges on the right, Next button. The first card opens by default.
- Click an edge: that card opens and the map pans to its stop; the stop's marker is drawn larger in teal. Click a stop on the map: the strip spins to it without panning. ◀ ▶, the ← → keys (with the card focused: click its white area first) and a horizontal swipe on the card header all move one card.
- Card header: number badge, name, kind ("anchorage" / "stop" / "plain stop") and the stay ("2 nights" / "day stop" / "end of route").
- Tiles: Arrive shows an italic "~" estimate with the inbound leg under it (origin: the charter start date and "boarding"); Depart shows a date picker and a time; Next leg shows nm, hours and the computed arrival ("overnight →" when it crosses midnight; absent on the terminus).
- Day tabs: one per day of the span with the date, "Day N · M items"; the active day lists rows with a blue (site) or teal (free) bar, time, title and site. The ⚙ button swaps the body for the settings tab and back.
- Switch to an unassigned route with stops: the same strip with "Day N" labels and a number input for the departure day; no fit colour on the last edge. An unassigned route with no stops shows the empty strip without the Start button; the charter's empty route shows it.
- Console: no errors; `node --check stop-cards.js` passes.

- [ ] **Step 5: Commit**

```bash
node --check stop-cards.js
git add stop-cards.js stop-cards.css routes.js index.html
git commit -m "feat(routes): the stop strip and the stop card - edges, tiles, day tabs, items, settings (spec A2 §5.4-5.5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Browser pass — dates, the cascade, the popup, the settings tab

**Files:**
- Modify (fixes only): `stop-cards.js`, `stop-cards.css`, `itinerary-core.js`

- [ ] **Step 1: The Depart tile and the cascade (spec A2 §5.6)**

On a middle stop, pick a departure date two days later: every later card's Arrive and Depart move two days, their items move with them (check a later card's Day tabs), every later edge turns red, the fit pill goes amber (`+2 d`), the header shows "N to check". Open a red card: its edge turns plain and the count drops by one; the Save button is enabled even with red cards left (spec D16). Save, reload: the remaining red edges are still red (`dirty_stop_ids` persisted). Undo (Ctrl+Z) restores dates, items and the dirty list together.

- [ ] **Step 2: Earlier departure and the popup (spec A2 §5.7)**

On a stop with items on its last day, pick an earlier departure date: the popup says "Changing the date will remove the itinerary entries for the 14th (N items)." with ✓ and ↶. ↶: the date picker shows the old date, nothing changed. ✓: the items are gone, later stops moved earlier and are red. The date picker refuses a date before the arrival (its `min`).

- [ ] **Step 3: Times**

Change a departure time so the next leg crosses midnight (e.g. Potipot → Hundred Islands at 20:00 in the fixture-like scratch data): the Next-leg tile shows "overnight → arrives ~00:xx <next day>", the next card's Arrive day moves by one and it turns red. Type an arrival time on a card: the tile goes upright (pinned) and the next leg's estimate uses it when the stop is a day stop; clear it: italic again.

- [ ] **Step 4: The ⚙ tab (spec A2 §5.5)**

Name: typing a name and tabbing out renames the stop everywhere (card header, edge, map label, Days tab). Sites served: ticking a site within 5 nm adds it; unticking a site that has items on this stop asks first and removes the items on Remove. "N further away" expands the rest. Next leg speed: setting 6 kn changes the Legs tab, the Next-leg tile and later arrivals; blank restores the route speed. Global stop (plain stops only): ticking saves an anchorage-library entry of kind "stop" (a dot marker appears under the Stops layer toggle, and the anchorage modal shows Kind = Stop) and the card's kind label becomes "stop"; unticking turns the point back into a plain stop and keeps the library entry. Remove stop: with items, the popup "Removing the stop?" appears; on ✓ the point is a waypoint, items gone, later stops red where their day moved.

- [ ] **Step 5: Read-only**

Set a charter's end date to yesterday (Charter Info) and open its route: a note says it has ended, the card's inputs are disabled, the add row, grips and ✕ buttons are hidden, edges and ◀ ▶ still navigate, Save is disabled. Restore the date.

- [ ] **Step 6: Commit the fixes**

```bash
node --test && node --check stop-cards.js
git add -A stop-cards.js stop-cards.css itinerary-core.js test
git commit -m "fix(routes): stop card dates, cascade and settings fixes from the browser pass

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Skip the commit if nothing needed fixing; say so in the task report.)

---

### Task 10: Browser pass — items

**Files:**
- Modify (fixes only): `stop-cards.js`, `stop-cards.css`

- [ ] **Step 1: Adding (spec A2 §5.5)**

⚓ lists the stop's served sites not yet on this day; picking one adds a row titled after the site with a blue bar. ⌕ opens the type-ahead over every site by distance (nearest first, those within 5 nm bold); picking one adds it and, if the stop did not serve it, adds the site to the stop (check ⚙). ＋ adds a free-text row already in edit mode with the title focused. Clicking outside the menu closes it; Escape in the editor cancels.

- [ ] **Step 2: Editing and removing**

Click a row: title, time, duration (minutes, 60 when blank) and notes appear; Enter or ✓ commits, Esc or ✕ cancels; the row's title tooltip shows the notes. ✕ on a row removes it (no confirm; Undo restores). The Day tab's item count follows.

- [ ] **Step 3: Clashes (spec A2 D12)**

Two timed items whose windows overlap on one day both turn red with "clashes with <other>"; a 09:30 item and a 10:30 item (default 1 h) do not clash. An item on the arrival day earlier than the estimated arrival shows "before arrival ~HH:MM"; one on the departure day running past the departure time shows "after departure HH:MM". An item without a time never clashes.

- [ ] **Step 4: Drag**

Drag a row by its grip above another row: the list outlines, the order changes on release and the `order` values stay 0..n (check a save payload). Drag a row onto another Day tab: the tab outlines, the item moves to that day and the tab switches to it. Touch: the same on the tablet or in device emulation (`touch-action: none` on the grip). Releasing outside any target changes nothing.

- [ ] **Step 5: Commit the fixes**

```bash
node --check stop-cards.js
git add stop-cards.js stop-cards.css
git commit -m "fix(routes): stop card item fixes from the browser pass

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Start from… (spec A2 §5.8)

**Files:**
- Modify: `routes.js`

- [ ] **Step 1: Replace the stub with the dialog**

Delete the Task 6 stub `async function openStartFrom() { … }` and add, after `saveAs`:

```js
  // Spec A2 §5.8: import an unassigned route or another charter's record from a day. The server re-bases its days
  // onto the from-day and brings its items unless stripped; nothing is refused for length (the fit pill reports).
  async function openStartFrom() {
    if (!work || saving || !isCharter()) return;
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    if (!(await guardDiscard())) return;
    const n = dayCount();
    if (!n) { status("Set the charter's start and end dates first.", "error"); return; }
    const mine = panel;
    let charters = [];
    try {
      const [routeData, charterData] = await Promise.all([A().api("/api/admin/routes"), A().api("/api/admin/charters")]);
      if (panel !== mine || !mine.isConnected) return;
      routes = Array.isArray(routeData.routes) ? routeData.routes : [];
      charters = (Array.isArray(charterData.charters) ? charterData.charters : []).filter((c) => c.id !== subject.charterId && c.stops > 0);
    } catch (error) { reportError(error); return; }
    const record = toRecord(work.route);
    const today = (() => {
      const start = icore().parseDateOnly(subject.charter.start_date);
      if (start === null) return 1;
      return Math.min(Math.max(Math.floor((Date.now() - start) / 86400000) + 1, 1), n);
    })();
    const hasStops = icore().stopEntries(record.route.points).length > 0;
    const fromDay = el("select", { id: "routes-from-day" }, ...Array.from({ length: n }, (_, i) => el("option", { value: String(i + 1), selected: i + 1 === (hasStops ? today : 1) || undefined }, `Day ${i + 1} · ${icore().dayDateLabel(subject.charter, i + 1)}`)));
    const strip = el("input", { type: "checkbox", id: "routes-strip-items" });
    let stripTouched = false;
    strip.addEventListener("change", () => { stripTouched = true; });
    const fitLabel = (route) => {
      const f = icore().fit(icore().rebaseRecord(toRecord({ ...route, revision: 0 }), Number(fromDay.value)), subject.charter);
      return f.state === "none" ? "" : ` · ${f.label}`;
    };
    const sourceRows = [];
    const row = (value, label, kind) => {
      const input = el("input", { type: "radio", name: "routes-source", value, "data-kind": kind });
      const text = el("span", {}, label);
      input.addEventListener("change", () => { if (!stripTouched) strip.checked = kind === "charter"; });
      sourceRows.push({ input, text, value, kind });
      return el("label", {}, input, text);
    };
    const withStops = routes.filter((r) => r.points.some(core().isStop));
    const list = el("div", { class: "radio-list" },
      withStops.length ? el("div", { class: "side-label" }, "Unassigned routes") : null,
      ...withStops.map((r) => row(`library:${r.id}`, `${r.name} · ${r.points.filter(core().isStop).length} stops`, "library")),
      charters.length ? el("div", { class: "side-label" }, "Other charters") : null,
      ...charters.map((c) => row(`charter:${c.id}`, `${c.name} · ${c.stops} stops`, "charter")));
    const refreshFit = () => sourceRows.forEach((s) => {
      if (s.kind !== "library") return;
      const r = routes.find((x) => `library:${x.id}` === s.value);
      s.text.textContent = `${r.name} · ${r.points.filter(core().isStop).length} stops${fitLabel(r)}`;
    });
    fromDay.addEventListener("change", refreshFit);
    refreshFit();
    if (sourceRows.length) { sourceRows[0].input.checked = true; strip.checked = sourceRows[0].kind === "charter"; }
    openModal({
      title: "Start from…", saveTitle: "Import", wide: true,
      body: el("div", {},
        sourceRows.length ? list : el("p", { class: "empty" }, "No unassigned routes or other charters with stops yet."),
        el("div", { class: "grid2" },
          el("div", { class: "field" }, el("label", { for: "routes-from-day" }, "From day"), fromDay),
          el("div", { class: "field" }, el("label", { for: "routes-strip-items" }, "Items"), el("label", { class: "switch-row" }, strip, " Strip the record's items"))),
        el("p", { class: "meta" }, "Stops reached before the from-day stay; the record's day 1 lands on it. The fit pill reports if the route runs short or over.")),
      onSave: async () => {
        const chosen = sourceRows.find((s) => s.input.checked);
        if (!chosen) { status("Pick a record to start from.", "error"); return false; }
        const day = Number(fromDay.value);
        const dropped = icore().itemsDroppedByImport(record, day, n);
        if (dropped.length && !(await askDrop({ days: [...new Set(dropped.map((a) => a.day))].sort((a, b) => a - b), items: dropped }, `Starting from day ${day}`))) return false;
        const [type, id] = chosen.value.split(":");
        saving = true;
        renderActions();
        try {
          const { itinerary } = await post(`/api/admin/charter/${encodeURIComponent(subject.charterId)}/itinerary/import`, { source: { type, id }, from_day: day, strip_items: strip.checked, base_revision: work.baseRevision });
          if (panel !== mine || !mine.isConnected) return true;
          subject = { ...subject, itinerary };
          setWork(charterRouteFromItinerary(itinerary));
          afterPersist();
          const f = icore().fit(toRecord(work.route), subject.charter);
          status(`Started from "${chosen.text.textContent.split(" · ")[0]}" on day ${day} · revision ${itinerary.revision}${f.state === "match" ? " · fits the charter" : f.state === "none" ? "" : ` · ${f.label}`}`, "ok");
          return true;
        } catch (error) {
          if (error.status === 409) {
            const reload = await A().showAdminConfirm({ title: "Itinerary changed elsewhere", message: `${error.message} Reload to see the latest?`, confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning" });
            if (reload) await A().showCharterPanel("routes", { subject: "charter" });
            return true;
          }
          reportError(error);
          return false;
        } finally {
          saving = false;
          if (panel === mine && mine.isConnected && work) renderActions();
        }
      }
    });
  }
```

(`askDrop` opens a second routes modal over the first; `openModal` closes the one that is open, so the Start from… dialog closes when the popup appears. ↶ therefore cancels the import; that matches "nothing changes".)

- [ ] **Step 2: Styles**

Append to `routes.css`:

```css
.routes-modal .radio-list .side-label { margin: 6px 0 2px; }
.routes-modal .switch-row { display: flex; gap: 8px; align-items: center; font-size: 13px; text-transform: none; letter-spacing: 0; color: var(--ink); font-weight: 400; cursor: pointer; }
.routes-modal .switch-row input[type=checkbox] { width: 16px; height: 16px; min-height: 0; padding: 0; margin: 0; flex: none; }
```

- [ ] **Step 3: Verify in the browser**

- Charter route, Start from…: the dialog lists the unassigned routes with stops (each with its fit preview, e.g. "Coron loop · 2 stops · −7 d") and the other charters with their stop counts; From day defaults to day 1 for a future charter; Strip items is ticked when a charter source is selected and unticked for an unassigned route, and stays as set once touched.
- With items from the from-day onwards, Import first shows "Starting from day N?" with ✓ / ↶; ↶ leaves everything as it was.
- Import an unassigned route with items from day 1 without stripping: the strip and map re-render from the server's response, the items are on the cards, the status names the fit; with Strip ticked the cards are empty. Import another charter from day 3: the stops reached before day 3 stay and the current one closes on day 3 (its Depart tile shows day 3).
- A route that runs over the charter imports and the pill says `+N d`; nothing is refused.
- Empty charter route: the strip's inline Start button opens the same dialog.

- [ ] **Step 4: Commit**

```bash
node --check routes.js
git add routes.js routes.css
git commit -m "feat(routes): Start from... imports an unassigned route or another charter from a day (spec A2 §5.8)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Delete the Itinerary panel; asset versions; docs

**Files:**
- Delete: `itinerary.js`, `itinerary.css`
- Modify: `admin.js` (6309–6338, 6359–6365), `index.html`, `CLAUDE.md`

- [ ] **Step 1: `admin.js`**

In `renderCharter` remove `{ id: "itinerary", label: "Itinerary" },` from the panels array. In `charterPanelContent` delete the `if (activePanel === "itinerary") { … }` branch; in `bindCharterPanel` delete its `if (activePanel === "itinerary") { … }` branch. Nothing else in admin.js references `IolantheItinerary` (the Galley panel uses `IolantheItineraryCore.charterDayCount`, which stays).

- [ ] **Step 2: Delete the files and fix the tags**

```bash
git rm itinerary.js itinerary.css
```

In `index.html` delete the `itinerary.css` link and the `itinerary.js` script tag, and change every `?v=admin-itin-v2` to `?v=admin-itin-a2` (admin.css, routes.css, stop-cards.css, admin.js, routes-core.js, routes-ui.js, routes-places.js, routes-popup.js, routes-lists.js, routes-join.js, routes-io.js, routes-days.js, stop-cards.js, routes.js, itinerary-core.js). Check: `grep -c "admin-itin-a2" index.html` → 15, `grep -c "admin-itin-v2" index.html` → 0.

Grep the repo for leftovers: `grep -rn "IolantheItinerary\b\|itinerary\.js\|itinerary\.css\|showCharterPanel(\"itinerary\"\|apply-route\|promoteRoute\|edgeStates\|moveEdge\|setStopDays" --include=*.js --include=*.html --include=*.css --include=*.md . | grep -v "docs/charter-rework" | grep -v node_modules` → only `routes.js` comments mentioning history, if any; fix anything else.

- [ ] **Step 3: `CLAUDE.md`**

In the Stack list replace the `itinerary-core.js` and `itinerary.js / itinerary.css` bullets with:

```
- `itinerary-core.js` — itinerary pure logic (also a Node module): normalisation, `deriveDays`, `charterDayCount`,
  validation, time estimates, `recomputeArrivals`, the departure cascade (`setDeparture`, `shiftFromStop`), `clashes`,
  `fit`, `legSummaries` and the line-geometry helpers. The Route page is the only itinerary editor (spec A2).
```

Extend the `routes.js / routes.css` bullet: "Working on" lists this charter's route and the **unassigned** routes (the route library); the header shows a fit pill and a to-check pill; the side column holds stat tiles, Legs and a read-only Days tab; the stop strip under the map (`stop-cards.js`) edits stays, items and stop settings; Start from… imports a record through `/api/admin/charter/<id>/itinerary/import`. Add two helper bullets:

```
  - `stop-cards.js` / `stop-cards.css` — the stop strip (stacked edges, red = dirty, green = fits) and the stop card
    (Arrive / Depart / Next-leg tiles, Day tabs with items, ⚙ settings)
  - `routes-days.js` — the read-only Days tab (tube line and day boxes)
```

and change the `routes-lists.js` bullet to "the Legs tab list and per-leg speeds". Update the `node --test` line if the count is mentioned.

- [ ] **Step 4: Every panel loads clean**

Reload the admin. Charter: Charter Info, Crew, Route, Site Editor (no Itinerary); each loads with no console errors. Galley: menus load with the day count from the charter dates. Hotel: guests load. Route page: the strip, Days tab, Legs, map modes, import/export and Add another route all still work after the deletion.

- [ ] **Step 5: Commit**

```bash
node --test
git add -A admin.js index.html CLAUDE.md itinerary.js itinerary.css
git commit -m "feat(admin): remove the Itinerary panel, Apply and Promote dialogs; the Route page is the itinerary (spec A2 §5.9)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: End-to-end check against the local server (spec A2 §7)

Run with the scratch server (`iolanthe-server-scratch`, plan A2-01 deployed locally, schema 5). Work through every line; fix and commit as you go.

- [ ] Map click on a stop spins the strip to its card; opening a card from an edge, ◀ ▶, ← → or a swipe pans the map and enlarges the marker.
- [ ] A later departure reddens every later edge and ambers the pill; visiting a red card clears it and the count drops; Save with red cards left works and the red survives a reload.
- [ ] An earlier departure over days with items shows the popup; ↶ restores the picker, ✓ removes the items.
- [ ] Site, free-text and clashing items: colours and reasons as in Task 10; drag within a day and onto another Day tab.
- [ ] Start from an unassigned route with and without stripping; Start from another charter from day 3; a route that runs over imports with `+N d`.
- [ ] Save as unassigned keeps items (open the new route under Unassigned: its cards show the items; `GET /api/admin/routes` shows `activities`).
- [ ] Days tab: read-only, follows every edit, titles open the card.
- [ ] Legs tab, per-leg speeds, route speed, copy legs, Select/Add/Anchorage/Delete modes, KML/GPX import and export, Add another route, anchorage modal (with Kind), Sites/Anchorages/Stops/Imported pins toggles: all as before.
- [ ] Read-only after the end date: strip and card disabled as in Task 9 Step 5.
- [ ] Every admin panel (Charter Info, Crew, Route, Site Editor, Galley, Hotel) loads with no script errors.
- [ ] Phone width (≤ 900 px): header wraps, the map, then the side column, then the strip at full width; tiles stack; edges show without labels.
- [ ] `node --test` → `# fail 0`; `git status` clean on `feat/itinerary-a2`.

Then record the outcome in `docs/charter-rework/decisions.md` under "Execution notes" (fixes found, deviations) and stop: the merge to `main` waits for the server plan to be deployed on the vessel.

---

## Spec A2 coverage check (plan self-review)

| Spec A2 item | Task |
|---|---|
| §3 `duration_min`, `dirty_stop_ids` normalised; over-the-end rule removed (admin side) | 1 |
| §3 arrivals computed by the admin on every change (departure, leg, speed); pinned time kept | 2, 6 (`editPoints`, `applySpeed`), 8 (tiles) |
| §3 computed never stored: nights, days, clashes, fit | 2, 3, 8 |
| §5.1 Working on: this charter's route + Unassigned group | 6 |
| §5.1 fit pill, to-check pill | 3, 6 |
| §5.1 icon actions + Start from… + Save as unassigned (items kept) | 6, 11 |
| §5.2 stat tiles; Legs + read-only Days tab; Sites · Anchorages · Stops toggles; Stops list gone | 5, 6, 7 |
| §5.3 map click → card, card → pan; Stops layer; anchorage Kind; deleting a stop with items asks | 5, 6, 8 |
| §5.4 strip: stacked narrowing edges, red dirty, green fit, click edge, ◀ ▶ / ← → / swipe, visiting clears red | 8, 9 |
| §5.5 card header, Arrive/Depart/Next-leg tiles, Day tabs, items with bars and clash tint, three add buttons, inline edit, grip reorder, drop on a Day tab, ⚙ tab (name, sites, speed, Global stop, Remove stop), keyboard | 8, 9, 10 |
| §5.6 cascade, dirty list, midnight re-roll | 2, 9 |
| §5.7 popup ✓ / ↶ before dropping days (date, removal, import) | 2, 5 (modal option), 6 (`askDrop`), 8, 11 |
| §5.8 Start from… (sources, from-day default, strip default, inline on an empty strip, no refusal) | 8, 11 |
| §5.9 itinerary.js/.css, nav entry, Apply/Promote, Stops list removed; `showCharterPanel` kept (routes.js uses it) | 5, 6, 12 |
| §5.10 code shape (`stop-cards.js`, core additions, `routes.js`, `routes-places.js`, scoped styles, read-only after end) | 2, 3, 5, 6, 8 |
| §6 guest untouched | by construction (no guest file changes) |
| §7 admin tests; browser checklist | 1–4, 13 |
| D1 departure picked as a date; D2 Days tab; D7 icon buttons and tiles; D9/D13 global stops; D16 save with red; D18 "Unassigned"; D19 edge click / arrows / both-way map link; S1 day 1 locked to the charter (no start field) | 8 / 7 / 8 / 5+8 / 9 / 6 / 8 / 8 (origin tile) |

**Placeholder scan:** the only forward reference is the one-line `openStartFrom` stub in Task 6, replaced in Task 11. **Type consistency:** `editRecord(fn, opts)` with `{ history, map }`, `askDrop(dropped, verb)`, `removeStopAt(i)` / `deletePoint(i)`, `panToStop(stopId)` / `highlightStop(stopId)`, `cards.select(stopId, { pan })` / `cards.selectedId()`, `days.render(target?)`, `places.createStop(point)`, core `fit(record, charter)`, `legSummaries(record)`, `setDeparture(record, stopId, { day?, time? })`, `droppedDays(record, stopId, newDepartDay|null)` are used with the same names and shapes in every task.
