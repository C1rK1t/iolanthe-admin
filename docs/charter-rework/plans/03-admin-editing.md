# Charter Itinerary Rework — Plan 3 of 5: Admin Editing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Itinerary panel editable: drag day edges between snap states, edit a stop's days, times and served sites in a popover, add, edit, remove and drag activities, edit the welcome message, and Save with the revision check. Add the Apply library route and Promote to library actions.

**Architecture:** Every state change is a pure function in `itinerary-core.js` that returns a new itinerary (never mutates), tested under Node. `itinerary.js` turns pointer and keyboard events into those calls, re-renders, and saves through the plan-1 endpoints following the Routes panel's pattern (`work`, snapshot, `setPageUnsavedGuard`, 409 prompt).

**Tech Stack:** Plain JS, Pointer Events, `node --test`. Repo: `portal/iolanthe-admin`. Spec: `docs/charter-rework/spec.md` §4.2–§4.6, §3.1–§3.3.

**Depends on:** plan 2 merged; plan 1 server running locally.

---

## File structure

| File | Responsibility |
|---|---|
| `itinerary-core.js` (modify) | Add `edgeStates`, `moveEdge`, `setStopDays`, `setStopTime`, `setStopSites`, `clampActivities`, `canDropActivity`, `moveActivity`, `addActivity`, `updateActivity`, `removeActivity`, `renumberActivities`, `promoteRoute`, `sitesByDistance`. |
| `test/itinerary-core.test.js` (modify) | Tests for each. |
| `itinerary.js` (modify) | Edge handles, popover, add menu, inline edit, activity drag, welcome edit, Save/Cancel, Apply and Promote modals. |
| `itinerary.css` (modify) | Styles for handles, popover, menu, modal, drag states. |
| `admin.js` (modify) | Expose `cloneData`? No: the panel uses JSON clone. Nothing else. |

---

### Task 1: Edge states and `moveEdge`

**Files:**
- Modify: `itinerary-core.js`, `test/itinerary-core.test.js`

Rules (spec §4.2): edge *d* sits between day *d* and *d+1*. It is **inside the dwell** of stop *k* when *k* is present on both days; **on the leg** *k→k+1* when *k* leaves on or before *d* and *k+1* arrives on or after *d+1*. A step changes one field of one stop; it never cascades; it is refused (returns `null`) when it would need the origin's arrival or the terminus's departure.

- [ ] **Step 1: Write the failing tests**

Append to `test/itinerary-core.test.js`:

```js
test("edgeStates: dwell edges name the stop, leg edges name both ends", () => {
  const states = core.edgeStates(sevenDays(), 7);
  assert.deepEqual(states.map((s) => [s.day, s.kind, s.stopId || `${s.fromStopId}>${s.toStopId}`]), [
    [1, "dwell", "stp_capo"],
    [2, "dwell", "stp_herm"],
    [3, "dwell", "stp_poti"],
    [4, "dwell", "stp_poti"],
    [5, "leg", "stp_poti>stp_hund"],
    [6, "dwell", "stp_hund"]
  ]);
  assert.deepEqual(core.edgeStates(core.normalizeItinerary({}), 3).map((s) => s.kind), ["none", "none"]);
});

test("moveEdge: the four transitions change exactly one field", () => {
  const it = sevenDays();
  const byId = (x, id) => core.stopEntries(x.route.points).map((e) => e.point).find((p) => p.id === id);

  // dwell of Capones (edge 1), down → Capones leaves on day 1, the night is at sea
  const a = core.moveEdge(it, 1, "down", 7);
  assert.deepEqual(byId(a, "stp_capo").depart, { day: 1, time: "08:30" });
  assert.equal(core.edgeStates(a, 7)[0].kind, "leg");
  assert.deepEqual(byId(it, "stp_capo").depart, { day: 2, time: "08:30" });   // input untouched

  // dwell of Capones (edge 1), up → Capones is reached on day 2
  const b = core.moveEdge(it, 1, "up", 7);
  assert.deepEqual(byId(b, "stp_capo").arrive, { day: 2 });

  // leg Potipot→Hundred (edge 5), down → Hundred Islands reached on day 5
  const c = core.moveEdge(it, 5, "down", 7);
  assert.deepEqual(byId(c, "stp_hund").arrive, { day: 5 });

  // leg (edge 5), up → one more night at Potipot
  const d = core.moveEdge(it, 5, "up", 7);
  assert.deepEqual(byId(d, "stp_poti").depart, { day: 6, time: "18:00" });

  // every result stays valid
  [a, b, c, d].forEach((x) => assert.deepEqual(core.validateItinerary(x, 7), []));
});

test("moveEdge: refused when it needs the origin's arrival or the terminus's departure, or on a 'none' edge", () => {
  const it = sevenDays();
  it.route.points[0].depart = { day: 2, time: "09:00" };   // origin stays at Subic for a night → edge 1 is inside its dwell
  it.route.points[1].arrive = { day: 2 }; it.route.points[1].depart = { day: 2, time: "14:00" };
  it.route.points[2].arrive = { day: 2 };
  assert.equal(core.moveEdge(it, 1, "up", 7), null);        // would need origin.arrive
  assert.notEqual(core.moveEdge(it, 1, "down", 7), null);  // origin leaves day 1 instead: fine
  const end = sevenDays();
  end.route.points[6].depart = { day: 6, time: "08:00" };
  end.route.points[7].arrive = { day: 6 };                  // Subic reached day 6; edge 6 is inside the terminus dwell
  assert.equal(core.moveEdge(end, 6, "down", 7), null);     // would need terminus.depart
  assert.equal(core.moveEdge(core.normalizeItinerary({}), 1, "down", 3), null);
});

test("moveEdge: an activity pushed outside its stop's span is clamped to the nearest day inside", () => {
  const it = sevenDays();   // Potipot act_3 on day 4; move edge 3 up?? no: shrink Potipot from the end: edge 4 (dwell Potipot) down → depart day 4
  const out = core.moveEdge(it, 4, "down", 7);
  const kayaks = out.activities.find((a) => a.id === "act_3");
  assert.equal(kayaks.day, 4);
  const again = core.moveEdge(out, 3, "down", 7);           // depart day 3 → Kayaks (day 4) clamps to 3
  assert.equal(again.activities.find((a) => a.id === "act_3").day, 3);
  assert.deepEqual(core.validateItinerary(again, 7), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/itinerary-core.test.js`
Expected: FAIL with `core.edgeStates is not a function`.

- [ ] **Step 3: Add the functions**

Insert before the export block in `itinerary-core.js`:

```js
  // ---- editing: pure, immutable -------------------------------------------------

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function replacePoint(itinerary, index, point) {
    const points = itinerary.route.points.map((p, i) => (i === index ? point : p));
    return { ...itinerary, route: { ...itinerary.route, points } };
  }

  // Activities of `stopId` whose day fell outside the stop's span move to the nearest day inside it.
  function clampActivities(itinerary, stopId, dayCount) {
    const stops = stopEntries(itinerary.route.points);
    const i = stops.findIndex((e) => e.point.id === stopId);
    if (i < 0) return itinerary;
    const span = stopSpan(stops[i].point, positionOf(i, stops.length), dayCount);
    const activities = itinerary.activities.map((a) => (a.stop_id !== stopId ? a : { ...a, day: Math.min(Math.max(a.day, span.from), span.to) }));
    return { ...itinerary, activities: renumberActivities(activities) };
  }

  // One entry per edge d = 1..dayCount-1: { day, kind: "dwell"|"leg"|"none", stopId?, fromStopId?, toStopId?, stopIndex?, fromIndex? }
  function edgeStates(itinerary, dayCount) {
    const stops = stopEntries(toObj(toObj(itinerary).route).points);
    const spans = stops.map((e, i) => stopSpan(e.point, positionOf(i, stops.length), dayCount));
    const out = [];
    for (let d = 1; d < dayCount; d += 1) {
      let state = { day: d, kind: "none" };
      for (let k = 0; k < stops.length; k += 1) {
        if (spans[k].from <= d && spans[k].to >= d + 1) { state = { day: d, kind: "dwell", stopId: stops[k].point.id, stopIndex: k }; break; }
        const next = stops[k + 1];
        if (next && spans[k].to <= d && spans[k + 1].from >= d + 1) {
          state = { day: d, kind: "leg", fromStopId: stops[k].point.id, toStopId: next.point.id, fromIndex: k };
          break;
        }
      }
      out.push(state);
    }
    return out;
  }

  // Spec §4.2 table. direction: "down" (later) | "up" (earlier). Returns a new itinerary, or null when refused.
  function moveEdge(itinerary, edgeDay, direction, dayCount) {
    const state = edgeStates(itinerary, dayCount)[edgeDay - 1];
    if (!state || state.kind === "none") return null;
    const stops = stopEntries(itinerary.route.points);
    const change = (k, field, day) => {
      const entry = stops[k];
      const current = entry.point[field];
      if (!current) return null;                       // origin has no arrive, terminus has no depart
      const point = { ...entry.point, [field]: { ...current, day } };
      return clampActivities(replacePoint(itinerary, entry.index, point), point.id, dayCount);
    };
    if (state.kind === "dwell") {
      return direction === "down" ? change(state.stopIndex, "depart", edgeDay) : change(state.stopIndex, "arrive", edgeDay + 1);
    }
    return direction === "down" ? change(state.fromIndex + 1, "arrive", edgeDay) : change(state.fromIndex, "depart", edgeDay + 1);
  }
```

`renumberActivities` is defined in Task 3; add a forward stub now so Task 1's tests run:

```js
  // Replaced in Task 3 with the real renumbering.
  function renumberActivities(activities) { return activities; }
```

Add `clampActivities, edgeStates, moveEdge` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/itinerary-core.test.js`
Expected: `# pass 15`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(itinerary): edge states and discrete edge moves

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Stop popover logic — `setStopDays` (with cascade), `setStopTime`, `setStopSites`, `sitesByDistance`

**Files:**
- Modify: `itinerary-core.js`, `test/itinerary-core.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
test("setStopDays: a later departure shifts every later stop; the last day is a hard limit", () => {
  const it = sevenDays();
  const p = (x, id) => core.stopEntries(x.route.points).map((e) => e.point).find((s) => s.id === id);
  const refused = core.setStopDays(it, "stp_herm", { departDay: 4 }, 7);  // would push Subic's arrival to day 8
  assert.match(refused.error, /Day 7 is the last day/);
  const shorter = core.setStopDays(it, "stp_poti", { departDay: 4 }, 7);  // one night fewer at Potipot: later stops move a day earlier
  assert.equal(shorter.error, undefined);
  assert.deepEqual([p(shorter.itinerary, "stp_hund").arrive.day, p(shorter.itinerary, "stp_hund").depart.day], [5, 6]);
  assert.equal(p(shorter.itinerary, "stp_subic2").arrive.day, 6);
  assert.equal(p(shorter.itinerary, "stp_poti").depart.time, "18:00");  // times kept
  assert.deepEqual(core.validateItinerary(shorter.itinerary, 7), []);
  const tooEarly = core.setStopDays(it, "stp_poti", { departDay: 2 }, 7); // before its own arrival (day 3)
  assert.match(tooEarly.error, /before it arrives/);
});

test("setStopDays: an arrival change moves only that stop and is clamped between its neighbours", () => {
  const it = sevenDays();
  const p = (x, id) => core.stopEntries(x.route.points).map((e) => e.point).find((s) => s.id === id);
  const later = core.setStopDays(it, "stp_poti", { arriveDay: 4 }, 7);   // arrive day 4 instead of 3
  assert.equal(later.error, undefined);
  assert.equal(p(later.itinerary, "stp_poti").arrive.day, 4);
  assert.equal(p(later.itinerary, "stp_hund").arrive.day, 6);           // untouched
  assert.equal(later.itinerary.activities.find((a) => a.id === "act_4").day, 4);   // Beach (day 3) clamped into the span
  const tooEarly = core.setStopDays(it, "stp_poti", { arriveDay: 2 }, 7); // Hermana leaves day 3
  assert.match(tooEarly.error, /Hermana Mayor leaves/);
  const origin = core.setStopDays(it, "stp_subic1", { arriveDay: 1 }, 7);
  assert.match(origin.error, /origin/);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/itinerary-core.test.js`
Expected: FAIL with `core.setStopDays is not a function`.

- [ ] **Step 3: Add the functions**

Insert before the export block:

```js
  // Spec §4.3. Returns { itinerary } or { error }. A departure change cascades to every later stop; an arrival change
  // moves only that stop.
  function setStopDays(itinerary, stopId, change, dayCount) {
    const stops = stopEntries(itinerary.route.points);
    const k = stops.findIndex((e) => e.point.id === stopId);
    if (k < 0) return { error: "Unknown stop." };
    const stop = stops[k].point;
    const name = stop.name || `stop ${k + 1}`;
    let next = itinerary;

    if (Number.isInteger(change.arriveDay)) {
      if (!stop.arrive) return { error: `${name} is the origin and has no arrival.` };
      const prev = stops[k - 1];
      if (prev && prev.point.depart && change.arriveDay < prev.point.depart.day) return { error: `${prev.point.name || "The previous stop"} leaves on day ${prev.point.depart.day}; ${name} cannot arrive before that.` };
      if (stop.depart && change.arriveDay > stop.depart.day) return { error: `${name} departs on day ${stop.depart.day}; it cannot arrive after that.` };
      if (change.arriveDay < 1 || change.arriveDay > dayCount) return { error: `Day ${dayCount} is the last day.` };
      next = replacePoint(next, stops[k].index, { ...stop, arrive: { ...stop.arrive, day: change.arriveDay } });
      next = clampActivities(next, stopId, dayCount);
    }

    if (Number.isInteger(change.departDay)) {
      const current = stopEntries(next.route.points)[k].point;
      if (!current.depart) return { error: `${name} is the terminus and has no departure.` };
      const arriveDay = current.arrive ? current.arrive.day : 1;
      if (change.departDay < arriveDay) return { error: `${name} arrives on day ${arriveDay}; it cannot depart before it arrives.` };
      const delta = change.departDay - current.depart.day;
      const shifted = stopEntries(next.route.points).map((e, i) => {
        if (i < k) return e.point;
        if (i === k) return { ...e.point, depart: { ...e.point.depart, day: change.departDay } };
        const p = { ...e.point };
        if (p.arrive) p.arrive = { ...p.arrive, day: p.arrive.day + delta };
        if (p.depart) p.depart = { ...p.depart, day: p.depart.day + delta };
        return p;
      });
      const last = shifted[shifted.length - 1];
      const lastDay = last.arrive ? last.arrive.day : (last.depart ? last.depart.day : 1);
      if (lastDay > dayCount) return { error: `Day ${dayCount} is the last day; this would put ${last.name || "the terminus"} on day ${lastDay}.` };
      if (shifted.some((p) => (p.arrive && p.arrive.day < 1) || (p.depart && p.depart.day < 1))) return { error: "Day 1 is the first day." };
      let points = next.route.points;
      stopEntries(points).forEach((e, i) => { points = points.map((p, idx) => (idx === e.index ? shifted[i] : p)); });
      next = { ...next, route: { ...next.route, points } };
      shifted.slice(k).forEach((p) => { next = clampActivities(next, p.id, dayCount); });
    }
    return { itinerary: next };
  }

  // field: "arrive" | "depart"; time "HH:MM" sets, "" clears. Invalid input returns the same itinerary.
  function setStopTime(itinerary, stopId, field, time) {
    const entry = stopEntries(itinerary.route.points).find((e) => e.point.id === stopId);
    if (!entry || !entry.point[field]) return itinerary;
    const value = toStr(time);
    if (value && !TIME_RE.test(value)) return itinerary;
    const dayTime = value ? { day: entry.point[field].day, time: value } : { day: entry.point[field].day };
    return replacePoint(itinerary, entry.index, { ...entry.point, [field]: dayTime });
  }

  // Replaces the served sites. Site activities whose site is no longer served are removed.
  function setStopSites(itinerary, stopId, siteIds) {
    const entry = stopEntries(itinerary.route.points).find((e) => e.point.id === stopId);
    if (!entry) return itinerary;
    const ids = cleanIdList(siteIds);
    const next = replacePoint(itinerary, entry.index, { ...entry.point, site_ids: ids });
    const activities = next.activities.filter((a) => !(a.stop_id === stopId && a.site_id && !ids.includes(a.site_id)));
    return { ...next, activities: renumberActivities(activities) };
  }

  const NEAR_NM = 5;   // route-planner Q4: sites within 5 nm are shown first in the picker

  // [{ id, title, nm, near }] sorted by distance; sites without a position are left out.
  function sitesByDistance(siteLibrary, position) {
    return ((toObj(siteLibrary).sites) || [])
      .filter((s) => s && typeof s.id === "string" && Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)))
      .map((s) => {
        const nm = distNm(position, { latitude: Number(s.latitude), longitude: Number(s.longitude) });
        return { id: s.id, title: s.title || s.id, nm, near: nm <= NEAR_NM };
      })
      .sort((a, b) => a.nm - b.nm);
  }
```

Add `setStopDays, setStopTime, setStopSites, sitesByDistance` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/itinerary-core.test.js`
Expected: `# pass 19`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(itinerary): stop day cascade, times, served sites and site distances

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Activity operations and `promoteRoute`

**Files:**
- Modify: `itinerary-core.js`, `test/itinerary-core.test.js`

- [ ] **Step 1: Write the failing tests**

Append:

```js
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

test("promoteRoute: strips charter fields, writes nights and depart_time, sets the library id or a new name", () => {
  const it = sevenDays();
  const overwrite = core.promoteRoute(it, { id: "north-loop", revision: 4 });
  assert.equal(overwrite.id, "north-loop");
  assert.equal(overwrite.revision, 4);
  const stops = overwrite.points.filter(core.isStop);
  stops.forEach((p) => { assert.equal(p.id, undefined); assert.equal(p.arrive, undefined); assert.equal(p.depart, undefined); });
  assert.deepEqual([stops[0].nights, stops[0].depart_time], [0, "09:00"]);        // origin: depart day 1 → 0 nights
  assert.deepEqual([stops[2].nights, stops[2].depart_time], [1, "08:30"]);        // Capones
  assert.deepEqual([stops[4].nights, stops[4].depart_time], [2, "18:00"]);        // Potipot
  assert.deepEqual([stops[6].nights, stops[6].depart_time], [undefined, undefined]);   // terminus
  assert.deepEqual(overwrite.source, { type: "planner" });
  assert.equal(overwrite.speed_kn, 8);
  const fresh = core.promoteRoute(it, { name: "Reyes family 2026" });
  assert.deepEqual([fresh.id, fresh.name, fresh.revision], ["", "Reyes family 2026", 0]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/itinerary-core.test.js`
Expected: FAIL (the renumber stub returns input unchanged, so the first new test fails on order).

- [ ] **Step 3: Replace the stub and add the functions**

Delete the `renumberActivities` stub from Task 1 and insert before the export block:

```js
  // 0..n within each (stop_id, day) group, keeping the current relative order.
  function renumberActivities(activities) {
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

  function stopById(itinerary, stopId) {
    const stops = stopEntries(itinerary.route.points);
    const i = stops.findIndex((e) => e.point.id === stopId);
    return i < 0 ? null : { point: stops[i].point, index: stops[i].index, position: positionOf(i, stops.length) };
  }

  // Spec §4.4 drop rule.
  function canDropActivity(itinerary, activityId, targetStopId, targetDay, dayCount) {
    const activity = itinerary.activities.find((a) => a.id === activityId);
    const target = stopById(itinerary, targetStopId);
    if (!activity || !target) return false;
    const span = stopSpan(target.point, target.position, dayCount);
    if (targetDay < span.from || targetDay > span.to) return false;
    if (activity.site_id && activity.stop_id !== targetStopId && !(target.point.site_ids || []).includes(activity.site_id)) return false;
    return true;
  }

  // Moves an activity to (stop, day) at `index` within that group. Refused moves return the same itinerary.
  function moveActivity(itinerary, activityId, targetStopId, targetDay, index) {
    const dayCountGuess = Math.max(...itinerary.activities.map((a) => a.day), targetDay, ...stopEntries(itinerary.route.points).flatMap((e) => [e.point.arrive ? e.point.arrive.day : 0, e.point.depart ? e.point.depart.day : 0]));
    if (!canDropActivity(itinerary, activityId, targetStopId, targetDay, dayCountGuess)) return itinerary;
    const moving = itinerary.activities.find((a) => a.id === activityId);
    const others = itinerary.activities.filter((a) => a.id !== activityId);
    const group = others.filter((a) => a.stop_id === targetStopId && a.day === targetDay).sort((a, b) => a.order - b.order);
    const at = Math.min(Math.max(Number.isInteger(index) ? index : group.length, 0), group.length);
    const placed = { ...moving, stop_id: targetStopId, day: targetDay, order: at - 0.5 };   // sits between neighbours; renumber fixes it
    return { ...itinerary, activities: renumberActivities([...others, placed]) };
  }

  // Appends an activity to the (stop, day) group. A site not yet served by the stop is added to its site_ids.
  function addActivity(itinerary, stopId, day, fields, random = Math.random) {
    const target = stopById(itinerary, stopId);
    if (!target) return itinerary;
    const dayCountGuess = Math.max(day, ...stopEntries(itinerary.route.points).flatMap((e) => [e.point.arrive ? e.point.arrive.day : 0, e.point.depart ? e.point.depart.day : 0]));
    const span = stopSpan(target.point, target.position, dayCountGuess);
    if (day < span.from || day > span.to) return itinerary;
    const f = toObj(fields);
    const siteId = toStr(f.site_id);
    let next = itinerary;
    if (siteId && !(target.point.site_ids || []).includes(siteId)) {
      next = replacePoint(next, target.index, { ...target.point, site_ids: [...(target.point.site_ids || []), siteId] });
    }
    const groupSize = next.activities.filter((a) => a.stop_id === stopId && a.day === day).length;
    const activity = normalizeActivity({ id: newId("act", random), stop_id: stopId, day, order: groupSize, title: f.title, notes: f.notes, time: f.time, site_id: siteId }, random);
    return { ...next, activities: [...next.activities, activity] };
  }

  // patch: { title?, notes?, time? }. An invalid time clears the time.
  function updateActivity(itinerary, activityId, patch) {
    const p = toObj(patch);
    const activities = itinerary.activities.map((a) => {
      if (a.id !== activityId) return a;
      const out = { ...a };
      if ("title" in p) out.title = toStr(p.title, MAX_TITLE_LENGTH);
      if ("notes" in p) out.notes = toStr(p.notes, MAX_NOTES_LENGTH);
      if ("time" in p) {
        const time = toStr(p.time);
        if (time && TIME_RE.test(time)) out.time = time; else delete out.time;
      }
      return out;
    });
    return { ...itinerary, activities };
  }

  function removeActivity(itinerary, activityId) {
    return { ...itinerary, activities: renumberActivities(itinerary.activities.filter((a) => a.id !== activityId)) };
  }

  // Spec §3.3 / §4.6: the charter route as a library route. target: { id, revision } to overwrite, or { name } for new.
  function promoteRoute(itinerary, target) {
    const t = toObj(target);
    const points = itinerary.route.points.map((p) => {
      if (!isStop(p)) return { ...p };
      const { id, arrive, depart, ...rest } = p;
      const out = { ...rest };
      if (depart) {
        out.nights = depart.day - (arrive ? arrive.day : 1);
        if (depart.time) out.depart_time = depart.time;
      }
      return out;
    });
    return {
      id: toStr(t.id),
      name: toStr(t.name, MAX_TITLE_LENGTH) || "",
      description: "",
      revision: Number.isInteger(Number(t.revision)) ? Number(t.revision) : 0,
      speed_kn: itinerary.route.speed_kn,
      source: { type: "planner" },
      points
    };
  }
```

Add `renumberActivities, canDropActivity, moveActivity, addActivity, updateActivity, removeActivity, promoteRoute` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: `# fail 0` across all admin tests.

- [ ] **Step 5: Commit**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(itinerary): activity add/move/update/remove rules and promoteRoute

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Panel state, Save, Cancel and the unsaved guard

**Files:**
- Modify: `itinerary.js`, `itinerary.css`

- [ ] **Step 1: Add the commit/save machinery to `itinerary.js`**

After the module-level `let` declarations add:

```js
  let saving = false;
  let guard = null;
  const JSON_HEADERS = { "Content-Type": "application/json" };
  const post = (path, body) => A().api(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  const status = (message, tone) => A().setStatus(message, tone);
  const isDirty = () => Boolean(work) && core().itinerarySnapshot(work.itinerary) !== work.savedJson;

  // Every edit goes through here: pure function in, new itinerary out, re-render.
  function commit(next, opts) {
    if (!next || next === work.itinerary) return false;
    work.itinerary = next;
    renderAll(opts);
    return true;
  }

  async function save() {
    if (!work || saving) return;
    const n = dayCount();
    const problems = core().validateItinerary(work.itinerary, n);
    if (problems.length) { status(problems[0].message, "error"); return; }
    const sent = core().itinerarySnapshot(work.itinerary);
    const mine = panel;
    saving = true;
    renderHeader();
    try {
      const { itinerary } = await post(`/api/admin/charter/${encodeURIComponent(ctx.charterId)}/itinerary/save`, { itinerary: work.itinerary, base_revision: work.baseRevision });
      if (panel !== mine || !mine.isConnected) return;
      const saved = core().normalizeItinerary(itinerary);
      // Keep edits made while the request was in flight: only adopt the server copy if nothing changed since we sent.
      if (core().itinerarySnapshot(work.itinerary) === sent) work.itinerary = saved;
      work.baseRevision = saved.revision;
      work.savedJson = core().itinerarySnapshot(saved);
      status(`Itinerary saved · revision ${saved.revision}`, "ok");
      renderAll();
    } catch (error) {
      if (panel !== mine || !mine.isConnected) return;
      if (error.status === 409) await handleClash(error);
      else if (error && !error.loginRequired && error.message) status(error.message, "error");
    } finally {
      saving = false;
      if (panel === mine && mine.isConnected && work) renderHeader();
    }
  }

  async function handleClash(error) {
    const reload = await A().showAdminConfirm({
      title: "Itinerary changed elsewhere",
      message: `${error.message} Reloading discards your changes; Cancel keeps them so you can copy anything you need.`,
      confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning"
    });
    if (!reload) return;
    await reloadFromServer();
  }

  async function reloadFromServer() {
    const bundle = await A().api(`/api/admin/charter/${encodeURIComponent(ctx.charterId)}`);
    const itinerary = core().normalizeItinerary(bundle["itinerary.json"]);
    work = { itinerary, savedJson: core().itinerarySnapshot(itinerary), baseRevision: itinerary.revision };
    renderAll();
  }

  async function cancelEdits() {
    if (!isDirty()) return;
    const ok = await A().showAdminConfirm({ title: "Discard changes?", message: "Your unsaved itinerary changes will be lost.", confirmLabel: "Discard", cancelLabel: "Keep editing", tone: "warning" });
    if (ok) await reloadFromServer();
  }
```

Replace `renderHeader()`'s `actions.replaceChildren(...)` with:

```js
    const dirty = isDirty();
    actions.replaceChildren(
      el("button", { type: "button", class: "itinerary-action", "data-action": "edit-route", disabled: "" }, "Edit route"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "apply-route", ...(dirty ? { disabled: "" } : {}) }, "Apply library route…"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "promote", ...(dirty || !core().stopEntries(work.itinerary.route.points).length ? { disabled: "" } : {}) }, "Promote to library…"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "cancel", ...(dirty && !saving ? {} : { disabled: "" }) }, "Cancel"),
      el("button", { type: "button", class: "itinerary-action itinerary-action--primary", "data-action": "save", ...(dirty && !saving ? {} : { disabled: "" }) }, saving ? "Saving…" : "Save")
    );
    actions.querySelector('[data-action="save"]').addEventListener("click", save);
    actions.querySelector('[data-action="cancel"]').addEventListener("click", cancelEdits);
    actions.querySelector('[data-action="apply-route"]').addEventListener("click", openApplyModal);
    actions.querySelector('[data-action="promote"]').addEventListener("click", openPromoteModal);
```

(`openApplyModal` and `openPromoteModal` arrive in Task 9; add empty stubs `function openApplyModal() {}` and `function openPromoteModal() {}` for now.) Edit route stays disabled until plan 4.

In `bind(opts)`, after `work = {...}` add:

```js
    guard = {
      isDirty,
      get confirmOptions() {
        return { title: "Unsaved itinerary changes", message: "Leave this panel and discard your changes?", confirmLabel: "Discard", cancelLabel: "Stay", tone: "warning" };
      }
    };
    A().setPageUnsavedGuard(guard);
```

Confirm in `admin.js` that `setPageUnsavedGuard(guard)` reads `guard.isDirty()` and `guard.confirmOptions` (lines ~3084-3110; `routes.js` uses the same shape).

- [ ] **Step 2: Verify**

Reload the admin. Save and Cancel appear disabled (nothing is dirty). In the console run `IolantheItineraryCore` to confirm the module loaded. No errors.

- [ ] **Step 3: Commit**

```bash
git add itinerary.js
git commit -m "feat(itinerary): commit/save/cancel machinery with revision clash prompt and unsaved guard

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Edge handles — pointer and keyboard

**Files:**
- Modify: `itinerary.js`, `itinerary.css`

- [ ] **Step 1: Overlay for handles**

In `render()` add inside `.itinerary-board`, after the days div:

```html
          <div class="itinerary-board__edges" id="itinerary-edges"></div>
```

- [ ] **Step 2: Position and drive the handles**

Add to `itinerary.js`:

```js
  const EDGE_STEP_PX = 28;   // pointer travel per snap step

  // One handle per edge, positioned at the boundary between day boxes. Called after every render.
  function positionEdges(days) {
    const board = panel.querySelector("#itinerary-board");
    const edgesEl = panel.querySelector("#itinerary-edges");
    const boardRect = board.getBoundingClientRect();
    const states = core().edgeStates(work.itinerary, dayCount());
    const dayEls = [...panel.querySelectorAll(".itinerary-day")];
    edgesEl.replaceChildren();
    states.forEach((state) => {
      const below = dayEls[state.day];                      // the day box that starts at this edge
      if (!below) return;
      const y = below.getBoundingClientRect().top - boardRect.top;
      const handle = el("button", {
        type: "button",
        class: `itinerary-edge itinerary-edge--${state.kind}`,
        "data-edge": String(state.day),
        title: state.kind === "none" ? "Nothing to move here" : `Day ${state.day} / ${state.day + 1} edge. Drag or use the arrow keys.`,
        "aria-label": `Edge between day ${state.day} and day ${state.day + 1}`,
        ...(state.kind === "none" ? { disabled: "" } : {})
      });
      handle.style.top = `${y}px`;
      handle.style.right = "12px";
      handle.addEventListener("pointerdown", onEdgePointerDown);
      handle.addEventListener("keydown", onEdgeKey);
      edgesEl.append(handle);
    });
  }

  function stepEdge(edgeDay, direction) {
    const next = core().moveEdge(work.itinerary, edgeDay, direction, dayCount());
    if (!next) { flashEdge(edgeDay); return false; }
    return commit(next, { keepFocusEdge: edgeDay });
  }

  function flashEdge(edgeDay) {
    const handle = panel.querySelector(`.itinerary-edge[data-edge="${edgeDay}"]`);
    if (!handle) return;
    handle.classList.add("itinerary-edge--refused");
    setTimeout(() => handle.classList.remove("itinerary-edge--refused"), 350);
  }

  function onEdgeKey(event) {
    const edgeDay = Number(event.currentTarget.dataset.edge);
    if (event.key === "ArrowDown") { event.preventDefault(); stepEdge(edgeDay, "down"); }
    if (event.key === "ArrowUp") { event.preventDefault(); stepEdge(edgeDay, "up"); }
  }

  function onEdgePointerDown(event) {
    const handle = event.currentTarget;
    const edgeDay = Number(handle.dataset.edge);
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("itinerary-edge--dragging");
    let anchorY = event.clientY;
    const move = (e) => {
      const dy = e.clientY - anchorY;
      if (dy > EDGE_STEP_PX) { anchorY = e.clientY; stepEdge(edgeDay, "down"); }
      else if (dy < -EDGE_STEP_PX) { anchorY = e.clientY; stepEdge(edgeDay, "up"); }
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      handle.classList.remove("itinerary-edge--dragging");
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }
```

Because each step re-renders, the handle under the pointer is recreated. Keep the drag alive by re-attaching: in `renderAll(opts)`, after `drawLine(days)` call `positionEdges(days)`, and if `opts && opts.keepFocusEdge` then focus the new handle:

```js
  function renderAll(opts) {
    renderHeader();
    renderThumb();
    renderWelcome();
    const days = renderDays();
    requestAnimationFrame(() => {
      drawLine(days);
      positionEdges(days);
      if (opts && opts.keepFocusEdge) {
        const h = panel.querySelector(`.itinerary-edge[data-edge="${opts.keepFocusEdge}"]`);
        if (h) h.focus({ preventScroll: true });
      }
    });
  }
```

Pointer capture survives the re-render because capture is on the *old* element, which stays alive while captured; its `pointermove` listener keeps calling `stepEdge(edgeDay, …)` by day number, not by element. That is why the handlers close over `edgeDay`, not `handle` state.

- [ ] **Step 3: Styles**

Append to `itinerary.css`:

```css
.itinerary-board__edges { position: absolute; inset: 0; pointer-events: none; grid-column: 3; }
.itinerary-edge { position: absolute; pointer-events: auto; width: 48px; height: 8px; margin-top: -4px; border: none; border-radius: 4px; background: rgba(120, 160, 255, 0.95); cursor: ns-resize; padding: 0; touch-action: none; }
.itinerary-edge:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.itinerary-edge--leg { background: rgba(139, 0, 0, 0.75); }
.itinerary-edge--none { background: var(--line); cursor: default; }
.itinerary-edge--dragging { transform: scaleX(1.15); }
.itinerary-edge--refused { animation: itinerary-shake 0.35s; background: var(--danger, #a93d35); }
@keyframes itinerary-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
```

The edges overlay must sit over the days column only: give `.itinerary-board` `position: relative` (already) and in `positionEdges` set `edgesEl.style.left = \`${daysEl.offsetLeft}px\`; edgesEl.style.width = \`${daysEl.offsetWidth}px\`;` before placing handles (add those two lines using `const daysEl = panel.querySelector("#itinerary-days");`).

- [ ] **Step 4: Verify**

Reload. Blue bars sit on each day boundary, dark red where the edge is on a leg. Drag the Capones edge down: Capones' departure moves to day 1, the loop becomes a dot plus a leg, Save enables. Arrow keys on a focused handle step too. Dragging the first edge up past the origin shakes red and nothing changes. Cancel restores.

- [ ] **Step 5: Commit**

```bash
git add itinerary.js itinerary.css
git commit -m "feat(itinerary): draggable day edges with discrete snap steps and keyboard support

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Stop popover

**Files:**
- Modify: `itinerary.js`, `itinerary.css`

- [ ] **Step 1: Open the popover from a title or a shape**

In `drawLine`, after `titles.append(title)`, add a click handler on both the title and the shape just appended (`svg.lastElementChild`):

```js
      title.addEventListener("click", () => openStopPopover(shape.stopId, title));
      svg.lastElementChild.addEventListener("click", () => openStopPopover(shape.stopId, title));
      svg.lastElementChild.classList.add("itinerary-line__clickable");
```

Add to `itinerary.js`:

```js
  let popover = null;

  function closePopover() {
    if (popover) { popover.remove(); popover = null; }
    document.removeEventListener("pointerdown", onDocPointerDown, true);
  }
  function onDocPointerDown(event) {
    if (popover && !popover.contains(event.target)) closePopover();
  }

  function dayOptions(selected, n) {
    return Array.from({ length: n }, (_, i) => el("option", { value: String(i + 1), ...(i + 1 === selected ? { selected: "" } : {}) }, `Day ${i + 1} · ${core().dayDateLabel(ctx.charter, i + 1)}`));
  }

  function openStopPopover(stopId, anchor) {
    closePopover();
    const stop = core().stopEntries(work.itinerary.route.points).map((e) => e.point).find((p) => p.id === stopId);
    if (!stop) return;
    const n = dayCount();
    const times = core().estimateTimes(work.itinerary).get(stopId) || { arrive: null, depart: null };
    const nights = stop.arrive && stop.depart ? stop.depart.day - stop.arrive.day : 0;

    const dayTimeRow = (label, field) => {
      const value = stop[field];
      if (!value) return el("div", { class: "itinerary-pop__row muted" }, `${label}: ${field === "arrive" ? "origin" : "terminus"}`);
      const daySel = el("select", { class: "itinerary-pop__day" }, ...dayOptions(value.day, n));
      const timeIn = el("input", { type: "time", class: "itinerary-pop__time", value: value.time || "", placeholder: times[field] && times[field].estimated ? `~${times[field].time}` : "" });
      daySel.addEventListener("change", () => {
        const result = core().setStopDays(work.itinerary, stopId, field === "arrive" ? { arriveDay: Number(daySel.value) } : { departDay: Number(daySel.value) }, n);
        if (result.error) { status(result.error, "error"); daySel.value = String(value.day); return; }
        commit(result.itinerary);
        openStopPopover(stopId, panel.querySelector(`.itinerary-stop-title[data-stop-id="${stopId}"]`) || anchor);
      });
      timeIn.addEventListener("change", () => { commit(core().setStopTime(work.itinerary, stopId, field, timeIn.value)); });
      const est = times[field] && times[field].estimated ? el("span", { class: "muted itinerary-pop__est" }, `est. ${times[field].time}`) : null;
      return el("div", { class: "itinerary-pop__row" }, el("label", {}, label), daySel, timeIn, est);
    };

    const sitesList = core().sitesByDistance(ctx.siteLibrary, stop);
    const served = new Set(stop.site_ids || []);
    const siteRows = sitesList.filter((s) => s.near || served.has(s.id)).map((s) => {
      const cb = el("input", { type: "checkbox", ...(served.has(s.id) ? { checked: "" } : {}) });
      cb.addEventListener("change", () => {
        const ids = cb.checked ? [...(stop.site_ids || []), s.id] : (stop.site_ids || []).filter((x) => x !== s.id);
        if (!cb.checked && work.itinerary.activities.some((a) => a.stop_id === stopId && a.site_id === s.id)) {
          A().showAdminConfirm({ title: "Remove site", message: `Activities at ${s.title} on this stop will be removed too.`, confirmLabel: "Remove", cancelLabel: "Keep", tone: "warning" })
            .then((ok) => { if (ok) { commit(core().setStopSites(work.itinerary, stopId, ids)); openStopPopover(stopId, anchor); } else { cb.checked = true; } });
          return;
        }
        commit(core().setStopSites(work.itinerary, stopId, ids));
      });
      return el("label", { class: "itinerary-pop__site" }, cb, ` ${s.title} `, el("span", { class: "muted" }, `${s.nm.toFixed(1)} nm`));
    });

    popover = el("div", { class: "itinerary-pop", role: "dialog", "aria-label": `${stop.name || "Stop"} details` },
      el("div", { class: "itinerary-pop__head" }, el("strong", {}, stop.name || "Stop"), el("button", { type: "button", class: "itinerary-pop__close", "aria-label": "Close" }, "×")),
      dayTimeRow("Arrival", "arrive"),
      dayTimeRow("Departure", "depart"),
      el("div", { class: "itinerary-pop__row muted" }, `Nights: ${nights}`),
      el("div", { class: "itinerary-pop__sites" }, el("div", { class: "label" }, "Sites served"), ...(siteRows.length ? siteRows : [el("div", { class: "muted" }, "No sites within 5 nm")])),
      el("div", { class: "itinerary-pop__foot muted" }, "Open on map arrives with the Route panel (plan 4).")
    );
    popover.querySelector(".itinerary-pop__close").addEventListener("click", closePopover);
    panel.append(popover);
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    popover.style.top = `${a.top - p.top}px`;
    popover.style.left = `${Math.max(8, a.right - p.left + 48)}px`;
    setTimeout(() => document.addEventListener("pointerdown", onDocPointerDown, true), 0);
  }
```

Call `closePopover()` at the top of `renderDays()` only when the popover's stop no longer exists; simplest: in `bind()` call `closePopover()`; in `commit()` do nothing (the popover re-opens itself where needed, as the day select handler does).

- [ ] **Step 2: Styles**

Append to `itinerary.css`:

```css
.itinerary-line__clickable { cursor: pointer; }
.itinerary-stop-title { cursor: pointer; }
.itinerary-pop { position: absolute; z-index: 5; width: 300px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 10px 12px; font-size: 12.5px; }
.itinerary-pop__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.itinerary-pop__close { border: none; background: transparent; font-size: 18px; cursor: pointer; line-height: 1; }
.itinerary-pop__row { display: grid; grid-template-columns: 70px minmax(0, 1fr) 84px; gap: 6px; align-items: center; margin: 4px 0; }
.itinerary-pop__row label { color: var(--muted); }
.itinerary-pop__day, .itinerary-pop__time { font: inherit; padding: 3px 4px; border: 1px solid var(--line); border-radius: 4px; background: #fff; min-width: 0; }
.itinerary-pop__est { grid-column: 2 / span 2; font-size: 11px; }
.itinerary-pop__sites { margin-top: 8px; max-height: 180px; overflow: auto; }
.itinerary-pop__site { display: block; padding: 2px 0; }
.itinerary-pop__foot { margin-top: 8px; font-size: 11px; }
```

- [ ] **Step 3: Verify**

Click "Potipot" on the line: the popover shows Arrival day 3, Departure day 5 18:00, Nights 2, the sites within 5 nm with the served ones ticked. Change Departure to day 6: Hundred Islands and Subic shift a day later (if that passes day 7 you get the "last day" status instead). Set an arrival time; the title's "Arr." loses its tilde. Untick a served site that has an activity: a confirm appears.

- [ ] **Step 4: Commit**

```bash
git add itinerary.js itinerary.css
git commit -m "feat(itinerary): stop popover for days, times and sites served

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Activities — add menu, inline edit, remove

**Files:**
- Modify: `itinerary.js`, `itinerary.css`

- [ ] **Step 1: Enable the `+` and make rows editable**

In `subBox(stop, day)` remove `disabled: ""` from the add button and add:

```js
    box.querySelector(".itinerary-sub__add").addEventListener("click", (e) => openAddMenu(stop, day, e.currentTarget));
```

(so `subBox` must build `const box = el(...)` then return `box`). In `activityRow(activity)` add a remove button and click-to-edit:

```js
  function activityRow(activity) {
    const firstLine = (activity.notes || "").split("\n")[0];
    const row = el("div", { class: `itinerary-activity${activity.site_id ? " itinerary-activity--site" : " itinerary-activity--free"}`, "data-activity-id": activity.id, draggable: "false" },
      el("span", { class: "itinerary-activity__grip", "aria-hidden": "true", title: "Drag to move" }, "⋮⋮"),
      el("span", { class: "itinerary-activity__title" }, activity.title || (activity.site_id ? siteTitle(activity.site_id) : "Untitled")),
      activity.time ? el("span", { class: "itinerary-activity__time" }, activity.time) : el("span"),
      el("button", { type: "button", class: "itinerary-activity__remove", "aria-label": `Remove ${activity.title}` }, "×"),
      firstLine ? el("span", { class: "itinerary-activity__notes muted" }, firstLine) : null
    );
    row.querySelector(".itinerary-activity__remove").addEventListener("click", (e) => { e.stopPropagation(); commit(core().removeActivity(work.itinerary, activity.id)); });
    row.querySelector(".itinerary-activity__title").addEventListener("click", () => editActivity(row, activity));
    row.querySelector(".itinerary-activity__grip").addEventListener("pointerdown", (e) => startActivityDrag(e, activity, row));   // Task 8
    return row;
  }

  // Inline editor: title, time, notes. Enter / blur commits, Escape cancels.
  function editActivity(row, activity) {
    const title = el("input", { type: "text", class: "itinerary-edit__title", value: activity.title, maxlength: String(core().MAX_TITLE_LENGTH), placeholder: "Title" });
    const time = el("input", { type: "time", class: "itinerary-edit__time", value: activity.time || "" });
    const notes = el("textarea", { class: "itinerary-edit__notes", rows: "2", placeholder: "Notes for guests" }, activity.notes || "");
    const form = el("div", { class: "itinerary-edit" }, title, time, notes);
    const done = () => commit(core().updateActivity(work.itinerary, activity.id, { title: title.value, time: time.value, notes: notes.value })) || renderAll();
    const cancel = () => renderAll();
    [title, time, notes].forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        if (e.key === "Enter" && input !== notes) { e.preventDefault(); done(); }
      });
    });
    form.addEventListener("focusout", (e) => { if (!form.contains(e.relatedTarget)) done(); });
    row.replaceChildren(form);
    title.focus();
    title.select();
  }

  let addMenu = null;
  function closeAddMenu() { if (addMenu) { addMenu.remove(); addMenu = null; } }

  // Three groups: sites served here (not yet on this day), other library sites (type-ahead), free text.
  function openAddMenu(stop, day, anchor) {
    closeAddMenu();
    const point = core().stopEntries(work.itinerary.route.points).map((e) => e.point).find((p) => p.id === stop.id);
    const onDay = new Set(work.itinerary.activities.filter((a) => a.stop_id === stop.id && a.day === day && a.site_id).map((a) => a.site_id));
    const add = (fields) => { closeAddMenu(); const next = core().addActivity(work.itinerary, stop.id, day, fields); if (commit(next)) { const added = next.activities[next.activities.length - 1]; const row = panel.querySelector(`.itinerary-activity[data-activity-id="${added.id}"]`); if (row && !fields.site_id) editActivity(row, added); } };
    const servedRows = (point.site_ids || []).filter((id) => !onDay.has(id)).map((id) => { const b = el("button", { type: "button", class: "itinerary-menu__item" }, siteTitle(id)); b.addEventListener("click", () => add({ title: siteTitle(id), site_id: id })); return b; });
    const search = el("input", { type: "search", class: "itinerary-menu__search", placeholder: "Other site…" });
    const results = el("div", { class: "itinerary-menu__results" });
    const all = core().sitesByDistance(ctx.siteLibrary, point);
    const showResults = () => {
      const q = search.value.trim().toLowerCase();
      results.replaceChildren(...all.filter((s) => !(point.site_ids || []).includes(s.id) && (!q || s.title.toLowerCase().includes(q))).slice(0, 8).map((s) => {
        const b = el("button", { type: "button", class: "itinerary-menu__item" }, `${s.title} `, el("span", { class: "muted" }, `${s.nm.toFixed(1)} nm`));
        b.addEventListener("click", () => add({ title: s.title, site_id: s.id }));
        return b;
      }));
    };
    search.addEventListener("input", showResults);
    const free = el("button", { type: "button", class: "itinerary-menu__item itinerary-menu__item--free" }, "+ Free text activity");
    free.addEventListener("click", () => add({ title: "" }));
    addMenu = el("div", { class: "itinerary-menu", role: "menu" },
      servedRows.length ? el("div", { class: "label" }, "Sites served here") : null, ...servedRows,
      el("div", { class: "label" }, "Other sites"), search, results,
      free
    );
    showResults();
    anchor.closest(".itinerary-sub").append(addMenu);
    setTimeout(() => document.addEventListener("pointerdown", (e) => { if (addMenu && !addMenu.contains(e.target) && e.target !== anchor) closeAddMenu(); }, { capture: true, once: true }), 0);
    search.focus();
  }
```

Note: `addActivity` with an empty title creates an untitled row that opens in edit mode; the server rejects an empty title on Save (`An activity needs a title.`), and `validateItinerary` in `save()` reports it first.

- [ ] **Step 2: Styles**

Append to `itinerary.css`:

```css
.itinerary-activity__title { cursor: text; }
.itinerary-activity__remove { border: none; background: transparent; opacity: 0.45; cursor: pointer; font-size: 14px; line-height: 1; padding: 0 2px; }
.itinerary-activity__remove:hover { opacity: 1; color: var(--danger, #a93d35); }
.itinerary-activity { grid-template-columns: auto minmax(0, 1fr) auto auto; }
.itinerary-activity__notes { grid-column: 2 / span 3; }
.itinerary-edit { display: grid; grid-template-columns: minmax(0, 1fr) 90px; gap: 4px; grid-column: 1 / -1; }
.itinerary-edit__notes { grid-column: 1 / -1; }
.itinerary-edit input, .itinerary-edit textarea { font: inherit; font-size: 12.5px; padding: 3px 6px; border: 1px solid var(--line); border-radius: 3px; }
.itinerary-sub { position: relative; }
.itinerary-menu { position: absolute; z-index: 6; left: 34px; top: 100%; width: 280px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.itinerary-menu .label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin-top: 4px; }
.itinerary-menu__item { text-align: left; border: 1px solid var(--line); background: #fff; border-radius: 4px; padding: 5px 8px; font: inherit; cursor: pointer; }
.itinerary-menu__item:hover { border-color: var(--accent); }
.itinerary-menu__item--free { border-style: dashed; }
.itinerary-menu__search { font: inherit; padding: 4px 6px; border: 1px solid var(--line); border-radius: 4px; }
.itinerary-menu__results { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow: auto; }
```

- [ ] **Step 3: Verify**

`+` on Potipot day 4 lists the served sites not yet on that day, a search for other sites, and free text. Pick a site: a solid-bordered row appears; Save enables. Free text: a dashed row opens in edit mode; type a title, Enter. Click a title to edit, Escape cancels. × removes. Save: the server accepts; reload shows the same.

- [ ] **Step 4: Commit**

```bash
git add itinerary.js itinerary.css
git commit -m "feat(itinerary): add menu, inline activity editing and removal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Activity drag with pointer events

**Files:**
- Modify: `itinerary.js`, `itinerary.css`

- [ ] **Step 1: Drag implementation**

Add to `itinerary.js`:

```js
  // Drag an activity by its grip. Pointer events so mouse and touch behave the same (touch-action: none on the grip).
  function startActivityDrag(event, activity, row) {
    event.preventDefault();
    const grip = event.currentTarget;
    grip.setPointerCapture(event.pointerId);
    const ghost = row.cloneNode(true);
    ghost.classList.add("itinerary-activity--ghost");
    ghost.style.width = `${row.offsetWidth}px`;
    document.body.append(ghost);
    row.classList.add("itinerary-activity--source");
    let target = null;   // { sub, stopId, day, index, ok }

    const locate = (e) => {
      ghost.style.left = `${e.clientX + 8}px`;
      ghost.style.top = `${e.clientY - 10}px`;
      ghost.style.display = "none";
      const under = document.elementFromPoint(e.clientX, e.clientY);
      ghost.style.display = "";
      const sub = under && under.closest ? under.closest(".itinerary-sub") : null;
      panel.querySelectorAll(".itinerary-sub--over, .itinerary-sub--refused").forEach((n) => n.classList.remove("itinerary-sub--over", "itinerary-sub--refused"));
      if (!sub) { target = null; return; }
      const stopId = sub.dataset.stopId;
      const day = Number(sub.dataset.day);
      const ok = core().canDropActivity(work.itinerary, activity.id, stopId, day, dayCount());
      const rows = [...sub.querySelectorAll(".itinerary-activity")].filter((r) => r !== row);
      const index = rows.filter((r) => { const b = r.getBoundingClientRect(); return e.clientY > b.top + b.height / 2; }).length;
      sub.classList.add(ok ? "itinerary-sub--over" : "itinerary-sub--refused");
      target = { sub, stopId, day, index, ok };
    };
    const finish = () => {
      grip.removeEventListener("pointermove", locate);
      grip.removeEventListener("pointerup", finish);
      grip.removeEventListener("pointercancel", finish);
      ghost.remove();
      row.classList.remove("itinerary-activity--source");
      panel.querySelectorAll(".itinerary-sub--over, .itinerary-sub--refused").forEach((n) => n.classList.remove("itinerary-sub--over", "itinerary-sub--refused"));
      if (target && target.ok) commit(core().moveActivity(work.itinerary, activity.id, target.stopId, target.day, target.index));
      else if (target && !target.ok) status(activity.site_id ? `${siteTitle(activity.site_id)} is not served from that stop.` : "That day is outside the stop's span.", "error");
    };
    grip.addEventListener("pointermove", locate);
    grip.addEventListener("pointerup", finish);
    grip.addEventListener("pointercancel", finish);
  }
```

- [ ] **Step 2: Styles**

Append to `itinerary.css`:

```css
.itinerary-activity__grip { touch-action: none; }
.itinerary-activity--ghost { position: fixed; z-index: 50; pointer-events: none; opacity: 0.85; box-shadow: var(--shadow); }
.itinerary-activity--source { opacity: 0.35; }
.itinerary-sub--over { outline: 2px solid var(--accent); outline-offset: -1px; }
.itinerary-sub--refused { outline: 2px dashed var(--danger, #a93d35); outline-offset: -1px; }
```

- [ ] **Step 3: Verify**

Drag "Sundowners" (free text) from Capones day 1 to Potipot day 4: the target outlines green, drop reorders it there. Drag "Lighthouse walk" (site) to Potipot: the target outlines dashed red and the drop is refused with a status message. Drag within a sub-box to reorder. On the bridge tablet (or DevTools device mode), touch dragging works and the page does not scroll while dragging the grip.

- [ ] **Step 4: Commit**

```bash
git add itinerary.js itinerary.css
git commit -m "feat(itinerary): drag activities between days and stops with the served-site rule

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Welcome message editing, Apply library route, Promote to library

**Files:**
- Modify: `itinerary.js`, `itinerary.css`

- [ ] **Step 1: Welcome message**

Replace `renderWelcome()`:

```js
  function renderWelcome() {
    const box = panel.querySelector("#itinerary-welcome");
    const text = work.itinerary.welcome_message;
    const edit = el("button", { type: "button", class: "itinerary-action itinerary-action--small" }, "Edit");
    edit.addEventListener("click", () => {
      const ta = el("textarea", { class: "itinerary-welcome__edit", rows: "4", maxlength: String(core().MAX_NOTES_LENGTH) }, text);
      const done = el("button", { type: "button", class: "itinerary-action itinerary-action--small" }, "Done");
      done.addEventListener("click", () => commit({ ...work.itinerary, welcome_message: ta.value.trim() }) || renderWelcome());
      box.replaceChildren(el("div", { class: "itinerary-welcome__label label" }, "Welcome message"), ta, done);
      ta.focus();
    });
    box.replaceChildren(
      el("div", { class: "itinerary-welcome__head" }, el("div", { class: "itinerary-welcome__label label" }, "Welcome message"), edit),
      el("div", { class: `itinerary-welcome__text${text ? "" : " muted"}` }, text || "No welcome message yet.")
    );
  }
```

- [ ] **Step 2: A small modal helper**

Add to `itinerary.js`:

```js
  // Minimal modal: returns { root, body, close }. Buttons are built by the caller.
  function openModal(title) {
    const body = el("div", { class: "itinerary-modal__body" });
    const close = () => root.remove();
    const root = el("div", { class: "itinerary-modal", role: "dialog", "aria-modal": "true", "aria-label": title },
      el("div", { class: "itinerary-modal__card" },
        el("div", { class: "itinerary-modal__head" }, el("h3", {}, title), el("button", { type: "button", class: "itinerary-pop__close", "aria-label": "Close" }, "×")),
        body));
    root.querySelector(".itinerary-pop__close").addEventListener("click", close);
    root.addEventListener("click", (e) => { if (e.target === root) close(); });
    document.body.append(root);
    return { root, body, close };
  }
```

- [ ] **Step 3: Apply library route**

Replace the `openApplyModal` stub:

```js
  async function openApplyModal() {
    if (isDirty()) { status("Save or cancel your changes first.", "error"); return; }
    const n = dayCount();
    if (!n) { status("Set the charter's start and end dates first.", "error"); return; }
    let routes = [];
    try { routes = (await A().api("/api/admin/routes")).routes || []; } catch (error) { status(error.message, "error"); return; }
    const modal = openModal("Apply a library route");
    const picker = el("select", { class: "itinerary-modal__select" }, ...routes.map((r) => el("option", { value: r.id }, `${r.name} · ${r.points.filter(core().isStop).length} stops`)));
    const today = (() => { const start = core().parseDateOnly(ctx.charter.start_date); if (start === null) return 1; const d = Math.floor((Date.now() - start) / 86400000) + 1; return Math.min(Math.max(d, 1), n); })();
    const fromDay = el("select", { class: "itinerary-modal__select" }, ...dayOptions(core().stopEntries(work.itinerary.route.points).length ? today : 1, n));
    const preview = el("div", { class: "muted itinerary-modal__preview" });
    const updatePreview = () => {
      const route = routes.find((r) => r.id === picker.value);
      const from = Number(fromDay.value);
      const nights = route ? route.points.filter(core().isStop).reduce((sum, p) => sum + (Number.isInteger(p.nights) ? p.nights : (p.anchorage_id ? 1 : 0)), 0) : 0;
      const kept = core().stopEntries(work.itinerary.route.points).filter((e, i, all) => core().stopSpan(e.point, core().positionOf(i, all.length), n).from < from).length;
      preview.textContent = route ? `Keeps ${kept} stop${kept === 1 ? "" : "s"}, replaces from Day ${from}. The route plans about ${nights} night${nights === 1 ? "" : "s"}; ${n - from + 1} day${n - from + 1 === 1 ? "" : "s"} remain.` : "";
    };
    picker.addEventListener("change", updatePreview);
    fromDay.addEventListener("change", updatePreview);
    updatePreview();
    const apply = el("button", { type: "button", class: "itinerary-action itinerary-action--primary" }, "Apply");
    apply.addEventListener("click", async () => {
      apply.disabled = true;
      try {
        const { itinerary } = await post(`/api/admin/charter/${encodeURIComponent(ctx.charterId)}/itinerary/apply-route`, { route_id: picker.value, from_day: Number(fromDay.value), base_revision: work.baseRevision });
        const saved = core().normalizeItinerary(itinerary);
        work = { itinerary: saved, savedJson: core().itinerarySnapshot(saved), baseRevision: saved.revision };
        modal.close();
        status(`Applied "${picker.selectedOptions[0].textContent}" from Day ${fromDay.value}.`, "ok");
        renderAll();
      } catch (error) {
        apply.disabled = false;
        if (error.status === 409 && error.payload && error.payload.code === "too-long") status(error.message, "error");
        else if (error.status === 409) { modal.close(); await handleClash(error); }
        else status(error.message, "error");
      }
    });
    modal.body.append(
      el("label", { class: "itinerary-modal__field" }, "Route", picker),
      el("label", { class: "itinerary-modal__field" }, "From day", fromDay),
      preview,
      el("div", { class: "itinerary-modal__actions" }, apply)
    );
  }
```

Check how `A().api` surfaces a non-OK response: `throwAdminApiError(response, payload, …)` in `admin.js` (~line 170). The error must expose `status` and the parsed payload. If it exposes only `status` and `message`, add `error.payload = payload` inside `throwAdminApiError` (one line) so the `too-long` code can be read; `routes.js` only needs `status`, so this is additive.

- [ ] **Step 4: Promote to library**

Replace the `openPromoteModal` stub:

```js
  async function openPromoteModal() {
    if (isDirty()) { status("Save your changes first.", "error"); return; }
    let routes = [];
    try { routes = (await A().api("/api/admin/routes")).routes || []; } catch (error) { status(error.message, "error"); return; }
    const source = work.itinerary.route.source || {};
    const parent = source.type === "library" ? routes.find((r) => r.id === source.route_id) : null;
    const modal = openModal("Promote this route to the library");
    const overwrite = el("input", { type: "radio", name: "promote", value: "overwrite", ...(parent ? { checked: "" } : { disabled: "" }) });
    const asNew = el("input", { type: "radio", name: "promote", value: "new", ...(parent ? {} : { checked: "" }) });
    const name = el("input", { type: "text", class: "itinerary-modal__text", placeholder: "New route name", value: `${ctx.charter.name || ctx.charterId} route` });
    const go = el("button", { type: "button", class: "itinerary-action itinerary-action--primary" }, "Promote");
    go.addEventListener("click", async () => {
      go.disabled = true;
      const target = overwrite.checked && parent ? { id: parent.id, revision: parent.revision, name: parent.name } : { name: name.value.trim() };
      if (!target.id && !target.name) { status("Give the new route a name.", "error"); go.disabled = false; return; }
      const route = core().promoteRoute(work.itinerary, target);
      if (target.id) route.name = parent.name;
      try {
        const { route: saved } = await post("/api/admin/routes/save", { route, base_revision: target.id ? parent.revision : 0 });
        modal.close();
        status(`Library route "${saved.name}" saved · revision ${saved.revision}`, "ok");
      } catch (error) {
        go.disabled = false;
        status(error.message, "error");
      }
    });
    modal.body.append(
      el("label", { class: "itinerary-modal__radio" }, overwrite, ` Overwrite "${parent ? parent.name : "(no parent library route)"}"`),
      el("label", { class: "itinerary-modal__radio" }, asNew, " Save as a new library route"),
      el("label", { class: "itinerary-modal__field" }, "Name", name),
      el("div", { class: "itinerary-modal__actions" }, go)
    );
  }
```

- [ ] **Step 5: Styles**

Append to `itinerary.css`:

```css
.itinerary-action--small { padding: 3px 8px; font-size: 12px; }
.itinerary-welcome__head { display: flex; justify-content: space-between; align-items: center; }
.itinerary-welcome__edit { width: 100%; font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 4px; margin: 6px 0; }
.itinerary-modal { position: fixed; inset: 0; z-index: 40; background: rgba(16, 32, 40, 0.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
.itinerary-modal__card { background: var(--panel, #fff); color: var(--ink, #172026); border-radius: 10px; box-shadow: 0 12px 30px rgba(16, 32, 40, 0.3); width: min(480px, 100%); padding: 14px 16px; }
.itinerary-modal__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.itinerary-modal__head h3 { margin: 0; font-size: 16px; }
.itinerary-modal__field { display: grid; gap: 4px; margin: 8px 0; font-size: 12.5px; color: var(--muted); }
.itinerary-modal__select, .itinerary-modal__text { font: inherit; padding: 6px 8px; border: 1px solid var(--line, #d7dde1); border-radius: 4px; color: var(--ink, #172026); }
.itinerary-modal__radio { display: block; margin: 6px 0; }
.itinerary-modal__preview { margin: 8px 0; }
.itinerary-modal__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
```

- [ ] **Step 6: Verify**

- Welcome: Edit, type, Done → Save enables; Save persists.
- Apply: on a fresh charter pick a library route, Day 1, Apply → stops, days and seeded activities appear; status shows the applied name. On a charter in progress the From day defaults to today. Pick a long route from the last day → "needs N days" status.
- Promote: with a saved itinerary, Save as new → the route appears in the Routes panel picker with stop `nights` set.

- [ ] **Step 7: Commit**

```bash
git add itinerary.js itinerary.css admin.js
git commit -m "feat(itinerary): welcome editing, Apply library route and Promote to library

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Spec coverage check (plan self-review)

| Spec A item | Task |
|---|---|
| §4.2 edge drags (four transitions, no cascade, activity clamping, refuse at origin/terminus) | 1, 5 |
| §4.3 popover: arrival/departure day+time, nights, sites served, cascade and limits | 2, 6 |
| §4.4 activities: add menu (served, other, free), inline edit, remove, drag with the drop rule | 3, 7, 8 |
| §4.5 saving: draft, snapshot, guard, base revision, 409 prompt, in-flight edits kept | 4 |
| §4.6 Apply modal (route picker, From day default, preview, too-long), Promote modal (overwrite or new) | 9 |
| §3.3 `promoteRoute` transform | 3 |
| §4.8 core functions `edgeStates`, `moveEdge`, `canDropActivity`, `promoteRoute` tested | 1, 3 |
| §4.6 Edit route button, §4.3 "Open on map" | plan 4 |
