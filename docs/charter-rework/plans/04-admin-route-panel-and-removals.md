# Charter Itinerary Rework — Plan 4 of 5: Route Panel Charter Mode and Removals

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the captain add, move and remove stops for a charter on the existing Routes map editor, bound to the charter's own route, and remove the old Primary/Alternative itinerary code from the admin.

**Architecture:** The Routes panel gains a *subject*: a library route (as today) or this charter's route. In charter mode it loads from the version 2 itinerary and saves back through the plan-1 itinerary save endpoint. A pure `reconcileRoutePoints` in `itinerary-core.js` turns the edited point list into a valid itinerary: new stops get ids and days, removed stops take their activities with them after a confirm, and out-of-order days are re-seeded. The Itinerary panel's Edit route, thumbnail and "Open on map" jump to the Route panel through two small `admin.js` helpers.

**Tech Stack:** Plain JS, Leaflet (already vendored by the Routes panel), `node --test`. Repo: `portal/iolanthe-admin`. Spec: `docs/charter-rework/spec.md` §5, §4.7, §2.2.

**Depends on:** plans 1–3.

---

## File structure

| File | Responsibility |
|---|---|
| `routes-core.js` (modify) | `makeStopAt` keeps a stop's identity fields; `removeStop` strips the new fields; `routeSnapshot` sees them. |
| `itinerary-core.js` (modify) | `reconcileRoutePoints(itinerary, points, dayCount, random)` → `{ itinerary, removed, reseededFrom }`. |
| `test/routes-core.test.js`, `test/itinerary-core.test.js` (modify) | Tests. |
| `routes-popup.js` (modify) | Nights and Default departure fields on library stops. |
| `routes-lists.js` (modify) | Day span on stop cards in charter mode. |
| `routes.js` (modify) | Subject switch, charter-mode load/save/actions, read-only after the end date, Back to days. |
| `admin.js` (modify) | `state.charterContext`, `showCharterPanel`, `getCharterContext` on `IolantheAdmin`; remove the old itinerary code. |
| `admin.css` (modify) | Remove styles only the old itinerary code used. |
| `itinerary.js` (modify) | Edit route button, thumbnail click, popover "Open on map". |
| `index.html` (modify) | `?v=` bumps. |

---

### Task 1: `routes-core.js` — keep stop identity, strip new fields, snapshot keys

**Files:**
- Modify: `routes-core.js:125` (`routeSnapshot` keys), `:160-171` (`makeStopAt`), `:192-212` (`removeStop`)
- Modify: `test/routes-core.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/routes-core.test.js`:

```js
test("makeStopAt on an existing stop keeps its id, arrive and depart", () => {
  const anchorage = { id: "capones", name: "Capones", latitude: 14.95, longitude: 120.11 };
  const points = [P(14.8, 120.27, { stop: true }), P(14.94, 120.12, { stop: true, id: "stp_x", arrive: { day: 1 }, depart: { day: 2 }, leg_speed_kn: 7 }), P(15.3, 119.8, { stop: true })];
  const { points: out, merged } = core.makeStopAt(points, 1, anchorage, []);
  assert.equal(merged, false);
  assert.equal(out[1].anchorage_id, "capones");
  assert.equal(out[1].id, "stp_x");
  assert.deepEqual(out[1].arrive, { day: 1 });
  assert.deepEqual(out[1].depart, { day: 2 });
  assert.equal(out[1].leg_speed_kn, 7);
});

test("removeStop strips id, arrive, depart, nights and depart_time with the other stop fields", () => {
  const points = [P(1, 1), P(2, 2, { anchorage_id: "a", id: "stp_y", arrive: { day: 2 }, depart: { day: 3 }, nights: 1, depart_time: "08:00", site_ids: ["s"], name: "A" })];
  const out = core.removeStop(points, 1);
  assert.deepEqual(out[1], { latitude: 2, longitude: 2, name: "A" });
});

test("routeSnapshot changes when nights, depart_time, id, arrive or depart change", () => {
  const base = { name: "r", description: "", speed_kn: 8, points: [P(1, 1, { stop: true, id: "stp_a", nights: 1 }), P(2, 2)] };
  const a = core.routeSnapshot(base);
  assert.notEqual(a, core.routeSnapshot({ ...base, points: [P(1, 1, { stop: true, id: "stp_a", nights: 2 }), P(2, 2)] }));
  assert.notEqual(a, core.routeSnapshot({ ...base, points: [P(1, 1, { stop: true, id: "stp_a", nights: 1, depart_time: "09:00" }), P(2, 2)] }));
  assert.notEqual(a, core.routeSnapshot({ ...base, points: [P(1, 1, { stop: true, id: "stp_a", nights: 1, depart: { day: 1 } }), P(2, 2)] }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/routes-core.test.js`
Expected: three failures (`out[1].id` undefined; `nights` still present; snapshots equal).

- [ ] **Step 3: Make the changes**

In `routeSnapshot` (line ~125) change the keys list to:

```js
    const keys = ["latitude", "longitude", "name", "anchorage_id", "site_id", "site_ids", "leg_speed_kn", "stop", "id", "arrive", "depart", "nights", "depart_time"];
```

In `makeStopAt` replace

```js
    const old = points[index];
    const stop = stopAt(anchorage, sites);
    const next = old && old.leg_speed_kn ? { ...stop, leg_speed_kn: old.leg_speed_kn } : stop;
```

with

```js
    const old = points[index] || {};
    const stop = stopAt(anchorage, sites);
    // Keep what belongs to this stop in a charter itinerary (id, days) and its leg speed; the position comes from the anchorage.
    const carried = {};
    ["leg_speed_kn", "id", "arrive", "depart", "nights", "depart_time"].forEach((key) => { if (old[key] !== undefined) carried[key] = old[key]; });
    const next = { ...stop, ...carried };
```

In `removeStop` change the destructuring line to:

```js
    const { anchorage_id: _a, stop: _s, site_ids: _ids, id: _id, arrive: _arr, depart: _dep, nights: _n, depart_time: _dt, leg_speed_kn: speed, ...rest } = point;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/routes-core.test.js`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add routes-core.js test/routes-core.test.js
git commit -m "feat(routes-core): stops keep their itinerary identity through map edits

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `reconcileRoutePoints` in `itinerary-core.js`

Spec §5 "Stops". Input: the saved itinerary and the edited point list from the map. Output: a valid itinerary plus what to tell the captain.

**Files:**
- Modify: `itinerary-core.js`, `test/itinerary-core.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/itinerary-core.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/itinerary-core.test.js`
Expected: FAIL with `core.reconcileRoutePoints is not a function`.

- [ ] **Step 3: Add the function**

Insert before the export block in `itinerary-core.js`:

```js
  // ---- Route panel charter mode (spec §5) -------------------------------------------

  // Takes the saved itinerary and the point list edited on the map. Returns
  // { itinerary, removed: [{ id, name, activities }], reseededFrom: name | null } with a valid itinerary.
  function reconcileRoutePoints(itinerary, editedPoints, dayCount, random = Math.random) {
    const oldStops = stopEntries(itinerary.route.points).map((e) => e.point);
    const oldById = new Map(oldStops.map((p) => [p.id, p]));
    let points = (editedPoints || []).map((p) => normalizePoint(p, random)).filter(Boolean);

    // 1. New stops (no known id) get an id; everything else keeps what the map carried over.
    const knownIds = new Set(oldStops.map((p) => p.id));
    points = points.map((p) => (isStop(p) && !knownIds.has(p.id) ? { ...p, id: newId("stp", random), isNew: true } : p));

    // 2. Removed stops take their activities.
    const newIds = new Set(points.filter(isStop).map((p) => p.id));
    const removed = oldStops.filter((p) => !newIds.has(p.id)).map((p) => ({
      id: p.id,
      name: p.name || "Stop",
      activities: itinerary.activities.filter((a) => a.stop_id === p.id).sort((a, b) => a.day - b.day || a.order - b.order)
    }));
    const removedIds = new Set(removed.map((r) => r.id));
    let activities = itinerary.activities.filter((a) => !removedIds.has(a.stop_id));

    // 3. Days for new stops, origin/terminus rules, then order.
    const entries = stopEntries(points);
    const stops = entries.map((e) => ({ ...e.point }));
    stops.forEach((s, i) => {
      const prev = stops[i - 1];
      const next = stops[i + 1];
      if (s.isNew) {
        if (i === 0) {
          s.depart = { day: 1 };
          if (next && !next.arrive) next.arrive = { day: 1 };                           // old origin becomes a middle stop
        } else if (i === stops.length - 1) {
          const prevDay = prev.depart ? prev.depart.day : (prev.arrive ? prev.arrive.day : 1);
          if (!prev.depart) prev.depart = { day: prevDay };                              // old terminus becomes a middle stop
          s.arrive = { day: Math.min(Math.max(prevDay, 1), dayCount || prevDay) };
        } else {
          const day = prev.depart ? prev.depart.day : (prev.arrive ? prev.arrive.day : 1);
          s.arrive = { day };
          s.depart = { day };
        }
      }
      delete s.isNew;
    });
    if (stops.length) {
      delete stops[0].arrive;
      delete stops[stops.length - 1].depart;
      for (let i = 1; i < stops.length - 1; i += 1) {
        if (!stops[i].arrive) stops[i].arrive = { day: stops[i - 1].depart ? stops[i - 1].depart.day : 1 };
        if (!stops[i].depart) stops[i].depart = { day: stops[i].arrive.day };
      }
      if (stops.length > 1 && !stops[0].depart) stops[0].depart = { day: 1 };
      if (stops.length > 1 && !stops[stops.length - 1].arrive) stops[stops.length - 1].arrive = { day: stops[stops.length - 2].depart.day };
    }

    // 4. Days must not run backwards along the route. From the first stop that does, re-seed with zero nights.
    let reseededFrom = null;
    for (let i = 1; i < stops.length; i += 1) {
      const prevDepart = stops[i - 1].depart ? stops[i - 1].depart.day : 1;
      const arriveDay = stops[i].arrive ? stops[i].arrive.day : prevDepart;
      if (arriveDay < prevDepart || reseededFrom) {
        if (!reseededFrom) reseededFrom = stops[i].name || `stop ${i + 1}`;
        const day = dayCount ? Math.min(prevDepart, dayCount) : prevDepart;
        stops[i].arrive = { ...(stops[i].arrive || {}), day };
        if (stops[i].depart) stops[i].depart = { ...stops[i].depart, day };
      }
    }
    if (dayCount) {
      stops.forEach((s) => {
        if (s.arrive && s.arrive.day > dayCount) s.arrive.day = dayCount;
        if (s.depart && s.depart.day > dayCount) s.depart.day = dayCount;
      });
    }

    entries.forEach((e, i) => { points[e.index] = stops[i]; });
    let next = { ...itinerary, route: { ...itinerary.route, points }, activities: renumberActivities(activities) };
    stops.forEach((s) => { next = clampActivities(next, s.id, dayCount); });
    return { itinerary: next, removed, reseededFrom };
  }
```

Add `reconcileRoutePoints` to the export block.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(itinerary): reconcile map-edited points into a valid itinerary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Library stop popup — Nights and Default departure

**Files:**
- Modify: `routes-popup.js` (`pointPopup`, between the Name field at ~line 52 and the sites picker at ~53)

- [ ] **Step 1: Add the two fields for library stops only**

`create(ctx)` gains `ctx.subjectType` (`"library"` | `"charter"`, Task 6 passes it). In `pointPopup(i)` after the Name field `box.append(...)` and before `if (stop && places) box.append(sitesServedPicker(i));` add:

```js
        if (stop && ctx.subjectType !== "charter") {
          // Template fields (spec A §2.2): used when this library route is applied to a charter.
          const current = points()[i];
          const nightsInput = el("input", { type: "number", min: "0", max: "60", step: "1", value: current.nights === undefined ? "" : String(current.nights), placeholder: current.anchorage_id ? "1" : "0", "aria-label": "Nights at this stop when applied" });
          const departInput = el("input", { type: "time", value: current.depart_time || "", "aria-label": "Default departure time when applied" });
          const commitTemplate = () => {
            const p = points()[i];
            const n = nightsInput.value === "" ? undefined : Math.max(0, Math.min(60, parseInt(nightsInput.value, 10) || 0));
            const t = /^([01]\d|2[0-3]):[0-5]\d$/.test(departInput.value) ? departInput.value : undefined;
            const { nights: _n, depart_time: _t, ...rest } = p;
            ctx.editPointsQuiet((pts) => c.replaceAt(pts, i, { ...rest, ...(n === undefined ? {} : { nights: n }), ...(t ? { depart_time: t } : {}) }));
          };
          nightsInput.addEventListener("change", commitTemplate);
          departInput.addEventListener("change", commitTemplate);
          box.append(
            el("div", { class: "field field-inline" }, el("label", {}, "Nights"), nightsInput),
            el("div", { class: "field field-inline" }, el("label", {}, "Default departure"), departInput)
          );
        }
```

If `routes.css` has no `.field-inline`, add under `.routes-panel`:

```css
.routes-panel .field-inline, .routes-modal .field-inline { display: grid; grid-template-columns: 1fr 110px; align-items: center; gap: 6px; }
```

- [ ] **Step 2: Verify**

Routes panel → open a library route → click a stop: the popup shows Nights (placeholder 1 for an anchorage) and Default departure. Set 2 and 08:00: Save enables (snapshot sees the fields); Save; reload the route: the values persist (plan 1 Task 7 made the server keep them).

- [ ] **Step 3: Commit**

```bash
git add routes-popup.js routes.css
git commit -m "feat(routes): nights and default departure on library stops

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Stops tab shows the day span in charter mode

**Files:**
- Modify: `routes-lists.js` (`stopItem` ~line 23)

- [ ] **Step 1: Add an optional meta line**

`create(ctx)` gains `ctx.stopMeta` (a function `(point) → string`, optional). In `stopItem(p, i, n)` append after the title line:

```js
        ctx.stopMeta && ctx.stopMeta(p) ? el("div", { class: "stop-meta muted" }, ctx.stopMeta(p)) : null,
```

(inside the `el("div", { class: "stop-item" … }, …)` children list; `el` drops `null` children.) Add to `routes.css`: `.routes-panel .stop-meta { font-size: 11px; }`.

- [ ] **Step 2: Commit**

```bash
git add routes-lists.js routes.css
git commit -m "feat(routes): optional stop meta line for the Stops tab

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `admin.js` — charter context and programmatic panel switching

**Files:**
- Modify: `admin.js` (`state` ~14-26; `renderCharter` ~7965-7978; `bindCharterPanel` ~7915; `window.IolantheAdmin` ~15620)

- [ ] **Step 1: Keep the charter context**

In `state` add `charterContext: null, routesSubject: "library",`. In `renderCharter()` after `const itinerary = bundle["itinerary.json"] || {};` add:

```js
      state.charterContext = { charterId: state.selectedCharter, charter: charterInfo, itinerary, siteLibrary };
```

- [ ] **Step 2: Pass the subject to the Routes panel**

In `bindCharterPanel`, replace the routes branch body with:

```js
      if (window.IolantheRoutes) {
        const subject = state.routesSubject === "charter"
          ? { type: "charter", charterId: state.selectedCharter, charter: charterInfo, itinerary, focusStopId: state.routesFocusStopId || "" }
          : { type: "library" };
        state.routesFocusStopId = "";
        window.IolantheRoutes.bind({ siteLibrary, subject });
      }
      return;
```

- [ ] **Step 3: Two helpers on `IolantheAdmin`**

Add near `renderCharter`:

```js
  // Switch the Charter section to a panel from code (Itinerary ↔ Route). options.subject: "library" | "charter".
  async function showCharterPanel(panelId, options = {}) {
    if (!(await confirmDiscardPageChanges())) return false;
    if (options.subject) state.routesSubject = options.subject;
    if (options.focusStopId) state.routesFocusStopId = options.focusStopId;
    state.sectionPanels.charter = panelId;
    await renderCharter();
    return true;
  }
  const getCharterContext = () => state.charterContext;
```

Add `showCharterPanel, getCharterContext` to the `window.IolantheAdmin` object. Also widen the "Routes" nav label: in the `panels` array change `{ id: "routes", label: "Routes" }` to `{ id: "routes", label: "Route" }` (it now covers both the charter's route and the library).

- [ ] **Step 4: Expose the API error payload**

In `throwAdminApiError` add `error.payload = payload;` before `throw error;` (plan 3 Task 9 reads `error.payload.code`).

- [ ] **Step 5: Commit**

```bash
git add admin.js
git commit -m "feat(admin): charter context, programmatic panel switch and API error payload

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `routes.js` — subject switch and charter mode

**Files:**
- Modify: `routes.js`

- [ ] **Step 1: State**

After `let work = null;` add:

```js
  let subject = { type: "library" };   // or { type: "charter", charterId, charter, itinerary, focusStopId }
  const isCharter = () => subject.type === "charter";
  const charterEnded = () => {
    if (!isCharter() || !subject.charter || !subject.charter.end_date) return false;
    const end = window.IolantheItineraryCore.parseDateOnly(subject.charter.end_date);
    return end !== null && Date.now() > end + 86400000;   // the day after the end date, UTC midnight
  };
  const readOnly = () => isCharter() && charterEnded();
```

- [ ] **Step 2: Render the subject switch**

In `render()` replace the `#routes-picker` field with:

```html
          <div class="field">
            <label for="routes-subject">Working on</label>
            <select id="routes-subject">
              <option value="library">Library routes</option>
              <option value="charter">This charter's route</option>
            </select>
          </div>
          <div class="field" id="routes-picker-field">
            <label for="routes-picker">Route</label>
            <select id="routes-picker"></select>
          </div>
          <div class="field" id="routes-charter-note" hidden></div>
```

In `bindInputs()` add:

```js
    $("subject").addEventListener("change", async () => {
      const next = $("subject").value;
      if (next === subject.type) return;
      if (!(await guardDiscard())) { $("subject").value = subject.type; return; }
      await A().showCharterPanel("routes", { subject: next });
    });
```

- [ ] **Step 3: Load the charter route**

Add:

```js
  function charterRouteFromItinerary(itinerary) {
    const it = window.IolantheItineraryCore.normalizeItinerary(itinerary);
    const name = `${(subject.charter && subject.charter.name) || subject.charterId} route`;
    return { id: "charter", name, description: "", revision: it.revision, speed_kn: it.route.speed_kn, source: it.route.source, points: it.route.points, created_at: null, updated_at: null };
  }
```

In `bind(opts)` after `const siteLibrary = …` add `subject = (opts && opts.subject) || { type: "library" };` and at the end of `bind` replace `loadLibrary(mine);` with:

```js
    if (isCharter()) {
      $("subject").value = "charter";
      $("picker-field").hidden = true;
      $("name").closest(".field").hidden = true;
      $("desc").closest(".field").hidden = true;
      const note = $("charter-note");
      note.hidden = false;
      note.textContent = readOnly()
        ? `${subject.charter.name || subject.charterId} has ended. The route is read-only.`
        : `Stops you add here appear on the Itinerary panel with zero nights; set their days there.`;
      work = null;
      setWork(charterRouteFromItinerary(subject.itinerary));
      loadLibrary(mine);   // still needed for Add another route's library list; harmless
      if (subject.focusStopId) {
        const idx = work.route.points.findIndex((p) => p.id === subject.focusStopId);
        if (idx >= 0) setTimeout(() => focusPoint(idx), 300);
      }
    } else {
      $("subject").value = "library";
      loadLibrary(mine);
    }
```

Check `loadLibrary(mine)` (lines 675-685): it calls `setWork(routes[0] || blankRoute())` after loading. In charter mode that would replace the charter route. Guard it: inside `loadLibrary`, wrap the `setWork(...)` call with `if (!isCharter())`.

- [ ] **Step 4: Save in charter mode**

Add:

```js
  // Spec §5. Reconcile the edited points into the itinerary, confirm removed stops, save with the revision check.
  async function saveCharterRoute() {
    if (!work || saving) return;
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    const icore = window.IolantheItineraryCore;
    const dayCount = icore.charterDayCount(subject.charter);
    if (!dayCount) { status("Set the charter's start and end dates first.", "error"); return; }
    const base = icore.normalizeItinerary(subject.itinerary);
    const result = icore.reconcileRoutePoints({ ...base, route: { ...base.route, speed_kn: work.route.speed_kn || base.route.speed_kn } }, work.route.points, dayCount);
    if (result.removed.length) {
      const lines = result.removed.map((r) => `${r.name}${r.activities.length ? ` (${r.activities.length} activit${r.activities.length === 1 ? "y" : "ies"}: ${r.activities.map((a) => a.title).join(", ")})` : ""}`);
      const ok = await A().showAdminConfirm({ title: "Remove stops?", message: `These stops leave the itinerary with their activities: ${lines.join("; ")}.`, confirmLabel: "Remove and save", cancelLabel: "Cancel", tone: "danger" });
      if (!ok) return;
    }
    const mine = panel;
    saving = true;
    renderActions();
    try {
      const { itinerary } = await post(`/api/admin/charter/${encodeURIComponent(subject.charterId)}/itinerary/save`, { itinerary: result.itinerary, base_revision: base.revision });
      if (panel !== mine || !mine.isConnected) return;
      subject = { ...subject, itinerary };
      setWork(charterRouteFromItinerary(itinerary), { fit: false });
      afterPersist();
      status(result.reseededFrom ? `Saved. Days were reset from ${result.reseededFrom}; fix them on the Itinerary panel.` : `Charter route saved · revision ${itinerary.revision}`, result.reseededFrom ? "" : "ok");
    } catch (error) {
      if (panel !== mine || !mine.isConnected) return;
      if (error.status === 409) {
        const reload = await A().showAdminConfirm({ title: "Itinerary changed elsewhere", message: `${error.message} Reload to see the latest? Your map changes will be lost.`, confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning" });
        if (reload) await A().showCharterPanel("routes", { subject: "charter" });
      } else reportError(error);
    } finally {
      saving = false;
      if (panel === mine && mine.isConnected && work) renderActions();
    }
  }
```

- [ ] **Step 5: Actions per mode**

Replace the body of `renderActions()` with:

```js
    const dirty = isDirty();
    const hasId = Boolean(work.route.id);
    const b = (icon, title, onclick, cls, disabled) => {
      const btn = el("button", { type: "button", class: `icon-btn ${cls || ""}`.trim(), title, "aria-label": title, onclick, disabled });
      btn.innerHTML = svg(icon);
      return btn;
    };
    if (isCharter()) {
      const ro = readOnly();
      const back = el("button", { type: "button", class: "icon-btn", title: "Back to days", "aria-label": "Back to days", onclick: () => A().showCharterPanel("itinerary") });
      back.innerHTML = svg("undo");
      back.append(" Days");
      $("actions").replaceChildren(
        back,
        el("span", { class: "icon-sep" }),
        b("check", "Save charter route", saveCharterRoute, "success", ro || saving || !dirty),
        b("cancel", "Cancel (discard changes)", cancelChanges, "danger", ro || !dirty),
        el("span", { class: "icon-sep" }),
        b("undo", "Undo (Ctrl+Z)", undo, "", ro || !history.undo.length),
        b("redo", "Redo (Ctrl+Y)", redo, "", ro || !history.redo.length),
        el("span", { class: "icon-sep" }),
        b("import", "Import KML / GPX", () => io.openImport(), "", ro),
        b("export", "Export GPX / KML", () => io.openExport(), "", work.route.points.length < 2));
      return;
    }
    $("actions").replaceChildren(
      b("check", "Save", saveRoute, "success", saving || (!dirty && hasId)),
      b("cancel", "Cancel (discard changes)", cancelChanges, "danger", !dirty),
      el("span", { class: "icon-sep" }),
      b("undo", "Undo (Ctrl+Z)", undo, "", !history.undo.length),
      b("redo", "Redo (Ctrl+Y)", redo, "", !history.redo.length),
      el("span", { class: "icon-sep" }),
      b("plus", "New route", newRoute),
      b("saveAs", "Save As", () => saveAs(false), "", work.route.points.length < 2),
      b("join", "Add another route to this one", () => join.openJoin()),
      b("import", "Import KML / GPX", () => io.openImport()),
      b("export", "Export GPX / KML", () => io.openExport(), "", work.route.points.length < 2),
      b("trash", "Delete route", deleteRoute, "", !hasId));
```

`cancelChanges` in charter mode must restore the charter route, not a library one. Change its last line to:

```js
    if (ok) setWork(isCharter() ? charterRouteFromItinerary(subject.itinerary) : (routes.find((r) => r.id === work.route.id) || blankRoute()));
```

and the same substitution in `guardDiscard`.

- [ ] **Step 6: Read-only guard and the day-span meta**

At the top of `editPoints(fn, opts)` and `editPointsQuiet(fn)` add:

```js
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
```

In `renderMap` find the marker option `draggable: mode !== "delete"` (~line 374) and the midpoint markers (~357); change to `draggable: mode !== "delete" && !readOnly()`. In `onMapClick` / `onAnchorageClick` / `onSiteClick` add `if (readOnly()) return;` first.

In `bind`, pass to `window.IolantheRoutesLists.create({...})`:

```js
      stopMeta: (p) => {
        if (!isCharter() || !p.arrive && !p.depart) return "";
        const a = p.arrive ? p.arrive.day : 1;
        const d = p.depart ? p.depart.day : a;
        return a === d ? `Day ${a}` : `Days ${a}–${d}`;
      },
```

and to `window.IolantheRoutesPopup.create({...})` add `subjectType: subject.type`.

- [ ] **Step 7: Verify**

- Itinerary panel → (Task 7 wires the button; for now) Routes panel → "Working on: This charter's route": the map shows the charter route, the Stops tab lists stops with "Days 3–5", Name/Description are hidden, the note explains zero nights.
- Add mode → tap an anchorage: a new stop appears. Save: confirm not shown (nothing removed); status "Charter route saved · revision N". Back to days: the new stop shows as a dot on the day of the previous stop's departure.
- Delete a stop with activities → Save → confirm lists them → Remove and save → Itinerary panel no longer shows them.
- Drag stops into a different order → Save → status "Days were reset from …".
- A charter whose end date has passed: the note says read-only, Save and Undo disabled, markers not draggable, map taps do nothing.
- Library mode unchanged: picker, New, Save As, Delete, Join all present.

- [ ] **Step 8: Commit**

```bash
git add routes.js routes.css
git commit -m "feat(routes): charter-route subject - load, save with reconcile, read-only after the charter ends

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Itinerary panel → Route panel links

**Files:**
- Modify: `itinerary.js`

- [ ] **Step 1: Wire the three entry points**

In `renderHeader()` remove `disabled: ""` from the Edit route button and add:

```js
    actions.querySelector('[data-action="edit-route"]').addEventListener("click", () => A().showCharterPanel("routes", { subject: "charter" }));
```

In `renderThumb()` after `box.append(svg);` add:

```js
    box.onclick = () => A().showCharterPanel("routes", { subject: "charter" });
```

In `openStopPopover` replace the footer line with a real button:

```js
      (() => { const b = el("button", { type: "button", class: "itinerary-action itinerary-action--small" }, "Open on map"); b.addEventListener("click", () => A().showCharterPanel("routes", { subject: "charter", focusStopId: stopId })); return el("div", { class: "itinerary-pop__foot" }, b); })()
```

`showCharterPanel` runs the unsaved guard, so a dirty itinerary prompts before leaving.

- [ ] **Step 2: Verify and commit**

Edit route opens the Route panel in charter mode; the thumbnail does too; Open on map focuses the stop. With unsaved itinerary edits, the discard prompt appears first.

```bash
git add itinerary.js
git commit -m "feat(itinerary): Edit route, thumbnail and Open on map jump to the Route panel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Remove the old itinerary code from `admin.js` and `admin.css`

**Files:**
- Modify: `admin.js`, `admin.css`, `index.html`

- [ ] **Step 1: Delete the v1 itinerary functions**

Remove these from `admin.js`, each with its helpers that then have no callers (grep each name after deleting to confirm zero references): `ITINERARY_PLANS` (line 29), `state.selectedItineraryPlan`, `state.itinerarySelectedDays`, `normalizeItinerary` (v1, ~3650), `itineraryPlanById`, `ensureItineraryPlans`, `blankItineraryDay`, `nextItineraryDayId`, `normalizeItineraryDayList`, `normalizeItineraryForCharter`, `selectedItineraryPlan`, `renderItinerarySwitchControls`, `renderItineraryPanel`, `renderWelcomeMessageBlock`, `resolvedItineraryWelcomeMessage`, `siteOptionsHtml` (if only the day modal used it), `swapItineraryRows`, `getItineraryDateViewState`, `getItinerarySwitchState`, `drawItineraryDaySelector`, `rebuildGuestVisibleItineraryDays`, `switchGuestItineraryFromToday`, `drawItineraryDays`, `itineraryStopTitle`, `saveItinerary`, `stripItineraryTimingFields`, `syncItineraryPlanForSave`, `persistItineraryAndRedraw`, `updateItineraryFromSaved`, `openItineraryDayModal`, `normalizeItineraryStopDraft`, `openItineraryStopEditor`, `openCreateSiteModal` (dead), `bindItineraryPanel`, `syncItineraryPlanSelector`, `syncItineraryWelcomeMessage`, `bindItineraryPlanSelector`, `bindItinerarySwitchControls`, and the "Import Primary" handler.

Keep: `charterDurationDays` if Charter Info uses it; `parseLocalDateOnly`; everything the create-charter modal's "clone from" uses (it copies files whole, so nothing itinerary-specific).

Run `node --check admin.js`, then load every Charter, Galley and Hotel panel once in the browser with the console open: no `ReferenceError`.

- [ ] **Step 2: Styles**

In `admin.css` delete the rule blocks for classes that no longer appear in `admin.js` or `index.html`: `.itinerary-plan-selector`, `.itinerary-plan-button*`, `.itinerary-switch*`, `.itinerary-day-selector`, `.itinerary-day-pill*`, `.itinerary-panel-card`, `#itinerary-days`-specific rules, the day modal and stop editor blocks (`.itinerary-stop-editor*`, `#itinerary-day-*`). Verify with:

```bash
grep -o 'itinerary-[a-z-]*' admin.css | sort -u | while read c; do grep -q "$c" admin.js index.html itinerary.js || echo "unused: $c"; done
```

Expected after the cleanup: no `unused:` lines.

- [ ] **Step 3: Version bumps**

In `index.html` set `admin.js?v=admin-itin-v2`, `admin.css?v=admin-itin-v2`, `routes-core.js?v=admin-itin-v2`, `routes.js?v=admin-itin-v2`, `routes-popup.js?v=admin-itin-v2`, `routes-lists.js?v=admin-itin-v2`, `routes.css?v=admin-itin-v2`, `itinerary.js?v=admin-itin-v2`, `itinerary-core.js?v=admin-itin-v2`, `itinerary.css?v=admin-itin-v2`.

- [ ] **Step 4: Tests, docs and commit**

Run `node --test` → `# fail 0`. Update `CLAUDE.md`'s file table: add `itinerary-core.js`, `itinerary.js`, `itinerary.css`, describe the Route panel's two subjects, drop Route Upload.

```bash
git add admin.js admin.css index.html CLAUDE.md
git commit -m "refactor(admin): remove the Primary/Alternative itinerary editor and its styles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: End-to-end check against the local server

- [ ] **Step 1: Walk the captain's path**

1. Create a charter with dates (Charter Info). Itinerary: empty days, hint shown.
2. Apply library route from Day 1 → stops, loops, activities. Save not needed (apply saves).
3. Drag the Capones edge down (night at sea), set a Potipot departure time, add a free-text activity, drag a site activity within a day. Save → revision increments.
4. Edit route → add an anchorage stop in Add mode → Save → Back to days: the new stop sits on its day with zero nights; open its popover and give it a night; Save.
5. Edit route → remove a stop with activities → Save → confirm → Back: gone.
6. Promote to library → Save as new → Routes library shows it with Nights set on stops.
7. Open the same charter in a second browser tab, change the welcome message there and Save; back in the first tab change an activity and Save → 409 prompt → Reload → the other tab's text is there.
8. Guest site (`http://localhost:8000/`) still draws the planned route line (legacy wrapper) even before plan 5.

- [ ] **Step 2: Record**

Note anything that deviates from spec §4–§5 in `docs/charter-rework/decisions.md` under a "Deviations found in plan 4" heading, and commit:

```bash
git add docs/charter-rework/decisions.md
git commit -m "docs: charter rework plan 4 end-to-end notes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Spec coverage check (plan self-review)

| Spec A item | Task |
|---|---|
| §2.2 library `nights`, `depart_time` editable; snapshot sees them | 1, 3 |
| §5 subject switch; load from and save to the itinerary; activities deleted with confirm; inserted stops get id and zero nights (between / before origin / after terminus); merged stops keep id; reorder re-seeds with a notice; Stops tab day span; Back to days; read-only after end | 1, 2, 4, 5, 6 |
| §4.6 Edit route; §4.3 Open on map; thumbnail click | 7 |
| §4.7 removals (all of them) | 8 (plus plan 2 Task 0) |
| §8 manual checklist, 409 between two devices | 9 |
| Library mode unchanged | 6 (branch in `renderActions`), 9 |
