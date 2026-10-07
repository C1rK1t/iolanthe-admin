# Routes Panel (admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Routes** panel to the admin's Charter section. It lists the library routes and lets Charter Admin on
the bridge draw and edit a route on a satellite map:
- add, insert, move and delete points, with undo/redo
- name, description and route speed
- stats tiles, plus Stops / Legs tabs with stop-to-stop leg cards and per-leg speeds
- Save (with the 409 clash flow), Save As, Delete, New and Add another route

**Architecture:** The approved mockup `docs/route-planner/planner-mockup.html` (as of `main` `274633d`) is the
working reference, and this plan ports it.
- **`routes-core.js`**: the pure logic (distances, stop-to-stop legs, per-leg speeds, joining routes, array helpers).
  It works as a browser global (`window.IolantheRoutesCore`) and as a Node module, so it's unit-tested with
  `node --test`.
- **`routes.js`**: the UI. It defines `window.IolantheRoutes = { render, bind }`.
- **`routes.css`**: the mockup's styles, scoped under `.routes-panel`. That makes the panel a first preview of the
  planned admin-wide style.
- **`admin.js`** gets only small hooks: a `window.IolantheAdmin` object exposing existing helpers, the panel entry,
  and render/bind dispatch.

**Tech Stack:** plain browser JavaScript (no build step, no npm, no dependencies), Leaflet 1.9.4 through admin.js's
existing `loadLeaflet()`, Esri satellite tiles, and `node:test` for `routes-core.js`.

**Server APIs it uses** (already live in `iolanthe-server` `main` `2ac4b8d`, Plan A). All are Charter Admin on the
bridge only:
- `GET /api/admin/routes` → `{ routes: [route] }`
- `POST /api/admin/routes/save`, body `{ route, base_revision }` → `{ route }`. Errors:
  - 400 for bad input
  - 404 if the route was deleted ("…Use Save As…")
  - 409 if someone else saved since you opened it
  - 500 if `routes.json` is unreadable
- `POST /api/admin/routes/delete`, body `{ id }` → `{ ok: true }`, or 404.
- A route has these fields:
  - `{ id, name, description, speed_kn, source, points, revision, created_at, updated_at }`
  - each point: `{ latitude, longitude, name?, anchorage_id?, site_id?, site_ids?, leg_speed_kn? }`

**Spec:** `docs/route-planner/spec.md` draft 2: §2.1, §4.1, §4.4, and §5 phase 1.

**Out of scope (later phases):**
- anchorage and site overlays, Anchorage mode, "Make stop at" and snapping (phase 2)
- import and export (phase 3)
- charter copies in the picker or in Add another route, and the Itinerary rows (phase 4)

**Phase 1 behaviour on stops:** stops can't be created yet (they come from anchorages in phase 2), but routes that
already have stops (`anchorage_id`) must show and keep them. The Stops tab shows "Stops arrive with anchorages in a
later update" when there are none.

---

## Facts this plan relies on (checked 2026-10-07)

| Fact | Where |
|---|---|
| admin.js is one IIFE with CRLF line endings that ends `  loadBootstrap();` then `})();` | admin.js:15606-15610 |
| The charter panels array is in `renderCharter()`: `{ id: "route-upload", label: "Route Upload" },` | admin.js:7933 |
| The render dispatch is `charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary, plannedRoute)` | admin.js:7879 |
| The bind dispatch is `bindCharterPanel(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary)` | admin.js:7898 |
| The toolbar hides the charter selector on Site Editor: `const showCharterSelector = !(section === "charter" && state.sectionPanels.charter === "sites");` | admin.js:2063 |
| `api(path, options)` adds `?key=`, parses JSON, and **throws** `Error(payload.error)` with `.status` on non-2xx | admin.js:141-162, 236-247 |
| `setStatus(message, tone)` writes to the status banner (tone `"ok"`, `"error"` or `""`). There's no toast. | admin.js:255 |
| `showAdminConfirm({title, message, confirmLabel, cancelLabel, tone})` returns `Promise<boolean>` | admin.js:3388 |
| `setPageUnsavedGuard({ isDirty, confirmOptions })` / `clearPageUnsavedGuard(guard)`. Panel navigation already calls `confirmDiscardPageChanges()`. | admin.js:3073-3110 |
| `loadLeaflet()` returns `Promise<L>`, loaded from unpkg 1.9.4 | admin.js:5566 |
| Esri tile URL `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | admin.js:5704 |
| `canManageCharterAdmin()` is true for Charter dept on the bridge role | admin.js:1777-1783 |
| `escapeHtml(v)` escapes `& < > " '` | admin.js:~275 |
| index.html loads `admin.css?v=admin-kml-site-import-v3` (line 13) and `admin.js?v=admin-kml-site-import-v3` with `defer` (line 101) | index.html |

Line numbers drift. Always find anchors by their exact text.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `routes-core.js` | Create | Pure route maths and editing helpers (browser global plus Node module) |
| `test/routes-core.test.js` | Create | `node --test` unit tests for routes-core |
| `routes.css` | Create | Panel styles (the mockup's), scoped under `.routes-panel` |
| `routes.js` | Create | The Routes panel UI: render/bind, side panel, map, editing, saving |
| `admin.js` | Modify | Expose `window.IolantheAdmin`; add the panel entry, dispatch hooks and toolbar rule |
| `index.html` | Modify | Include the three new files; bump the version strings |
| `CLAUDE.md` | Modify | Mention the new files and tests |

## How to run it locally (Tasks 2 and 4–7)

The admin has no server of its own. Use `iolanthe-server` with a throwaway data folder. Add this entry to the
workspace-root `S:\Users\David\OneDrive\Maker Space\GitHub\.claude\launch.json` (inside `configurations`) if it isn't
there, and start it with the browser pane's `preview_start` (`name: "routes-admin-dev"`). Don't start it with Bash.

```json
{
  "name": "routes-admin-dev",
  "runtimeExecutable": "node",
  "runtimeArgs": ["iolanthe/iolanthe-server/server.js"],
  "env": {
    "PORT": "8124",
    "DATA_DIR": "iolanthe/iolanthe-server/data-local/routes-dev/data",
    "BACKUP_DIR": "iolanthe/iolanthe-server/data-local/routes-dev/backups",
    "ADMIN_STATIC_DIR": "portal/iolanthe-admin"
  },
  "port": 8124
}
```

Open `http://localhost:8124/admin/?key=hotel` and log in as **Charter Admin**. The password is `passwords.charter` in
`iolanthe/iolanthe-server/data-local/routes-dev/data/settings.json`, a test value from the data templates. Localhost
counts as the bridge role. Seed two library routes once, from the browser console on that page:

```js
const post = (p, b) => fetch(p + "?key=hotel", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
await post("/api/admin/routes/save", { route: { name: "Coron loop", speed_kn: 8, points: [
  { latitude: 11.9975, longitude: 120.201, anchorage_id: "coron-town", name: "Coron Town" },
  { latitude: 12.004, longitude: 120.165 }, { latitude: 12.018, longitude: 120.125 },
  { latitude: 12.036, longitude: 120.096, anchorage_id: "lusong", name: "Lusong Island", leg_speed_kn: 6 },
  { latitude: 12.0036, longitude: 120.0413 }, { latitude: 12.0144, longitude: 119.9532 } ] }, base_revision: 0 });
await post("/api/admin/routes/save", { route: { name: "Culion run", speed_kn: 7, points: [
  { latitude: 11.9975, longitude: 120.201 }, { latitude: 11.96, longitude: 120.13 },
  { latitude: 11.91, longitude: 120.06 }, { latitude: 11.89, longitude: 120.015 } ] }, base_revision: 0 });
```

---

### Task 1: routes-core.js (pure logic, TDD)

**Files:**
- Create: `routes-core.js`
- Create: `test/routes-core.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/routes-core.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../routes-core.js");

const P = (latitude, longitude, extra) => ({ latitude, longitude, ...(extra || {}) });

test("distNm: one minute of latitude is about 1 nm", () => {
  assert.ok(Math.abs(core.distNm(P(12, 120), P(12 + 1 / 60, 120)) - 1) < 0.01);
});

test("routeNm sums the legs and is 0 for fewer than 2 points", () => {
  const a = P(12, 120), b = P(12 + 1 / 60, 120), c = P(12 + 2 / 60, 120);
  assert.ok(Math.abs(core.routeNm([a, b, c]) - 2) < 0.02);
  assert.equal(core.routeNm([a]), 0);
  assert.equal(core.routeNm([]), 0);
});

test("fmtHm formats hours as h:mm", () => {
  assert.equal(core.fmtHm(0.8375), "0:50");
  assert.equal(core.fmtHm(6.3), "6:18");
  assert.equal(core.fmtHm(1.999), "2:00");
});

test("array helpers return new arrays", () => {
  const arr = [1, 2, 3];
  assert.deepEqual(core.replaceAt(arr, 1, 9), [1, 9, 3]);
  assert.deepEqual(core.insertAt(arr, 1, 9), [1, 9, 2, 3]);
  assert.deepEqual(core.removeAt(arr, 1), [1, 3]);
  assert.deepEqual(arr, [1, 2, 3]);
});

test("stopLegs runs stop to stop, with Start/End for non-stop ends", () => {
  const pts = [P(12, 120), P(12.01, 120), P(12.02, 120, { anchorage_id: "a", name: "Alpha" }), P(12.03, 120), P(12.04, 120)];
  const legs = core.stopLegs(pts, 8);
  assert.deepEqual(legs.map((l) => [l.from, l.to, l.fromIndex, l.toIndex]), [["Start", "Alpha", 0, 2], ["Alpha", "End", 2, 4]]);
  assert.ok(Math.abs(legs[0].nm - core.routeNm(pts.slice(0, 3))) < 1e-9);
  assert.equal(legs[0].speed, 8);
  assert.equal(legs[0].own, 0);
  assert.ok(Math.abs(legs[0].hours - legs[0].nm / 8) < 1e-9);
});

test("stopLegs uses the leg's own speed from its start point", () => {
  const pts = [P(12, 120, { anchorage_id: "a", name: "A", leg_speed_kn: 6 }), P(12.1, 120, { anchorage_id: "b", name: "B" })];
  const [leg] = core.stopLegs(pts, 8);
  assert.equal(leg.own, 6);
  assert.equal(leg.speed, 6);
});

test("stopLegs gives null hours when there is no speed, and [] for under 2 points", () => {
  const legs = core.stopLegs([P(12, 120), P(12.1, 120)], 0);
  assert.equal(legs[0].hours, null);
  assert.equal(core.totalHours(legs), null);
  assert.deepEqual(core.stopLegs([P(12, 120)], 8), []);
});

test("totalHours adds the per-leg hours", () => {
  assert.equal(core.totalHours([{ hours: 1 }, { hours: 2.5 }]), 3.5);
  assert.equal(core.totalHours([]), null);
});

test("setLegSpeed sets and clears leg_speed_kn without mutating", () => {
  const pts = [P(12, 120), P(12.1, 120)];
  const set = core.setLegSpeed(pts, 0, 6);
  assert.equal(set[0].leg_speed_kn, 6);
  assert.equal(pts[0].leg_speed_kn, undefined);
  const cleared = core.setLegSpeed(set, 0, 0);
  assert.equal("leg_speed_kn" in cleared[0], false);
});

test("joinPoints appends, prepends and reverses", () => {
  const a = [P(1, 1), P(2, 2)];
  const b = [P(5, 5), P(6, 6)];
  assert.deepEqual(core.joinPoints(a, b, {}), [P(1, 1), P(2, 2), P(5, 5), P(6, 6)]);
  assert.deepEqual(core.joinPoints(a, b, { atStart: true }), [P(5, 5), P(6, 6), P(1, 1), P(2, 2)]);
  assert.deepEqual(core.joinPoints(a, b, { reverse: true }), [P(1, 1), P(2, 2), P(6, 6), P(5, 5)]);
});

test("joinPoints drops the duplicate where the routes meet", () => {
  const a = [P(1, 1), P(2, 2, { anchorage_id: "x" })];
  const sameStop = [P(2.3, 2.3, { anchorage_id: "x" }), P(3, 3)];
  assert.equal(core.joinPoints(a, sameStop, {}).length, 3);
  const sameSpot = [P(2.0001, 2.0001), P(3, 3)];
  assert.equal(core.joinPoints(a, sameSpot, {}).length, 3);
  assert.deepEqual(core.joinPoints([], sameSpot, {}), sameSpot);
});

test("joinGapNm measures the straight leg the join creates", () => {
  const a = [P(1, 1), P(2, 2)];
  const b = [P(2, 2.5), P(3, 3)];
  assert.ok(Math.abs(core.joinGapNm(a, b, {}) - core.distNm(P(2, 2), P(2, 2.5))) < 1e-9);
  assert.equal(core.joinGapNm([], b, {}), 0);
});

test("routeSnapshot covers only the editable fields", () => {
  const r = { id: "x", revision: 3, name: "A", description: "", speed_kn: 8, points: [P(1, 1)], updated_at: "t" };
  assert.equal(core.routeSnapshot(r), core.routeSnapshot({ ...r, revision: 4, updated_at: "u" }));
  assert.notEqual(core.routeSnapshot(r), core.routeSnapshot({ ...r, name: "B" }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (in the iolanthe-admin repo root): `node --test`
Expected: FAIL with `Cannot find module '../routes-core.js'`.

- [ ] **Step 3: Write the implementation**

Create `routes-core.js`:

```js
// Route Planner pure logic, shared by routes.js (browser) and test/routes-core.test.js (node --test).
// No DOM and no Leaflet here.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheRoutesCore = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const METRES_PER_NM = 1852;
  const EARTH_RADIUS_M = 6371000;
  const SAME_SPOT_M = 50; // a join point within this distance of the other route's end counts as the same place

  function distM(a, b) {
    const r = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * r;
    const dLon = (b.longitude - a.longitude) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }

  const distNm = (a, b) => distM(a, b) / METRES_PER_NM;

  function routeNm(points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += distNm(points[i - 1], points[i]);
    }
    return total;
  }

  function fmtHm(hours) {
    const minutes = Math.round(hours * 60);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  }

  const isStop = (point) => Boolean(point && point.anchorage_id);
  const replaceAt = (arr, index, value) => arr.map((item, j) => (j === index ? value : item));
  const insertAt = (arr, index, value) => [...arr.slice(0, index), value, ...arr.slice(index)];
  const removeAt = (arr, index) => arr.filter((_, j) => j !== index);

  // Legs run stop to stop. The first and last points count as ends (Start / End) even when they aren't stops.
  // A leg's own speed is stored on the point it starts from (leg_speed_kn); otherwise it uses routeSpeed.
  function stopLegs(points, routeSpeed) {
    if (points.length < 2) {
      return [];
    }
    const ends = points
      .map((point, index) => ({ point, index }))
      .filter(({ point, index }) => isStop(point) || index === 0 || index === points.length - 1);
    const label = ({ point, index }) => (isStop(point) ? (point.name || "Stop") : (index === 0 ? "Start" : "End"));
    return ends.slice(1).map((to, k) => {
      const from = ends[k];
      const own = from.point.leg_speed_kn || 0;
      const speed = own || routeSpeed || 0;
      const nm = routeNm(points.slice(from.index, to.index + 1));
      return { from: label(from), to: label(to), fromIndex: from.index, toIndex: to.index, nm, own, speed, hours: speed ? nm / speed : null };
    });
  }

  // Total time needs a speed for every leg; otherwise it's unknown.
  function totalHours(legs) {
    if (!legs.length || legs.some((leg) => leg.hours === null)) {
      return null;
    }
    return legs.reduce((sum, leg) => sum + leg.hours, 0);
  }

  function setLegSpeed(points, index, value) {
    const point = points[index];
    if (value) {
      return replaceAt(points, index, { ...point, leg_speed_kn: value });
    }
    const { leg_speed_kn: _removed, ...rest } = point;
    return replaceAt(points, index, rest);
  }

  function orderedForJoin(current, other, opts) {
    const extra = opts && opts.reverse ? [...other].reverse() : other;
    return opts && opts.atStart ? [extra, current] : [current, extra];
  }

  function joinPoints(current, other, opts) {
    const [first, second] = orderedForJoin(current, other, opts);
    if (!first.length || !second.length) {
      return [...first, ...second];
    }
    const a = first[first.length - 1];
    const b = second[0];
    const same = (a.anchorage_id && a.anchorage_id === b.anchorage_id) || distM(a, b) < SAME_SPOT_M;
    return same ? [...first, ...second.slice(1)] : [...first, ...second];
  }

  // Length of the straight leg the join adds between the two routes (0 when either is empty).
  function joinGapNm(current, other, opts) {
    const [first, second] = orderedForJoin(current, other, opts);
    return first.length && second.length ? distNm(first[first.length - 1], second[0]) : 0;
  }

  // What counts as "unsaved changes": the editable fields only.
  function routeSnapshot(route) {
    return JSON.stringify({ name: route.name, description: route.description, speed_kn: route.speed_kn, points: route.points });
  }

  return {
    METRES_PER_NM, distM, distNm, routeNm, fmtHm, isStop, replaceAt, insertAt, removeAt,
    stopLegs, totalHours, setLegSpeed, joinPoints, joinGapNm, routeSnapshot
  };
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: 13 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git switch -c feat/routes-panel
git add routes-core.js test/routes-core.test.js
git commit -m "feat: routes-core pure route logic with tests"
```

---

### Task 2: admin.js hooks, index.html includes, and a panel stub

**Files:**
- Modify: `admin.js`, which has CRLF line endings. Keep them: edit with exact-text replacements that assert each anchor
  appears exactly once.
- Modify: `index.html` (also CRLF)
- Create: `routes.js` (stub), `routes.css` (empty for now)

- [ ] **Step 1: Expose helpers to other admin scripts**

In `admin.js`, replace the final lines

```js
  loadBootstrap();
})();
```

with

```js
  // Helpers for panels that live in their own files (routes.js). Read-only; add to it only what those files need.
  window.IolantheAdmin = Object.freeze({
    api,
    setStatus,
    escapeHtml,
    showAdminConfirm,
    setPageUnsavedGuard,
    clearPageUnsavedGuard,
    loadLeaflet,
    canManageCharterAdmin
  });

  loadBootstrap();
})();
```

- [ ] **Step 2: Add the panel entry**

In `renderCharter()`, replace

```js
      { id: "route-upload", label: "Route Upload" },
```

with

```js
      { id: "routes", label: "Routes" },
      { id: "route-upload", label: "Route Upload" },
```

- [ ] **Step 3: Add render and bind dispatch**

In `charterPanelContent(...)`, replace

```js
    if (activePanel === "route-upload") {
      return renderRouteUploadPanel(plannedRoute, itinerary, charterInfo);
    }
```

with

```js
    if (activePanel === "routes") {
      return window.IolantheRoutes ? window.IolantheRoutes.render() : placeholderCard("Routes");
    }
    if (activePanel === "route-upload") {
      return renderRouteUploadPanel(plannedRoute, itinerary, charterInfo);
    }
```

In `bindCharterPanel(...)`, replace

```js
    if (activePanel === "route-upload") {
      const form = document.getElementById("route-upload-form");
```

with

```js
    if (activePanel === "routes") {
      if (window.IolantheRoutes) {
        window.IolantheRoutes.bind({ siteLibrary });
      }
      return;
    }
    if (activePanel === "route-upload") {
      const form = document.getElementById("route-upload-form");
```

- [ ] **Step 4: Hide the charter selector on Routes**

Routes is a library and isn't tied to a charter. Replace

```js
    const showCharterSelector = !(section === "charter" && state.sectionPanels.charter === "sites");
```

with

```js
    const showCharterSelector = !(section === "charter" && ["sites", "routes"].includes(state.sectionPanels.charter));
```

- [ ] **Step 5: Include the new files and bump the versions**

In `index.html`, replace `<link rel="stylesheet" href="/admin/admin.css?v=admin-kml-site-import-v3">` with:

```html
  <link rel="stylesheet" href="/admin/admin.css?v=admin-routes-v1">
  <link rel="stylesheet" href="/admin/routes.css?v=admin-routes-v1">
```

Replace `<script src="/admin/admin.js?v=admin-kml-site-import-v3" defer></script>` with:

```html
  <script src="/admin/admin.js?v=admin-routes-v1" defer></script>
  <script src="/admin/routes-core.js?v=admin-routes-v1" defer></script>
  <script src="/admin/routes.js?v=admin-routes-v1" defer></script>
```

Keep the original indentation and CRLF line endings.

- [ ] **Step 6: Create the stubs**

Create `routes.css` with one comment line: `/* Routes panel styles: scoped under .routes-panel (Task 3). */`

Create `routes.js`:

```js
// Routes panel (Charter → Routes). Uses window.IolantheAdmin (admin.js) and window.IolantheRoutesCore.
(function () {
  "use strict";

  function render() {
    return '<section class="card full routes-panel" id="routes-panel"><p>Loading routes…</p></section>';
  }

  function bind() {}

  window.IolantheRoutes = Object.freeze({ render, bind });
})();
```

- [ ] **Step 7: Verify in the browser**

Start `routes-admin-dev` (see "How to run it locally") and log in as Charter Admin.
- Expected: the Charter section shows a **Routes** tab before Route Upload.
- Clicking it shows "Loading routes…" with no charter selector in the toolbar.
- Route Upload and Site Editor still work.
- There are no console errors (`read_console_messages`).

- [ ] **Step 8: Commit**

```bash
git add admin.js index.html routes.js routes.css
git commit -m "feat: Routes panel hooks in admin.js and index.html"
```

---

### Task 3: routes.css (the mockup's styles, scoped)

**Files:**
- Modify: `routes.css`

The source is `docs/route-planner/planner-mockup.html`, inside its `<style>` element. Port the CSS with these rules:

- [ ] **Step 1: Write the tokens block**

Start `routes.css` with a `.routes-panel { ... }` rule that defines the mockup's `:root` custom properties (mockup
lines 9-34), except `--bg`. Copy the values exactly, including `--map-h`. Add `color: var(--ink);` to that rule.

- [ ] **Step 2: Port the component rules, prefixed**

Copy these mockup sections, prefixing **every selector** with `.routes-panel ` (and each part of a comma list):
- "Icon buttons" (lines 51-68)
- "Planner layout" through the end of `.speed-row input` (lines 70-113)
- "Map" (lines 115-130)
- "Leaflet markers" (lines 132-145)
- "Popups" (lines 147-161)
- the `.card-header` rules (lines 48-49)

Don't port these: the demo banner, `.top`, `.shell`, `.section-nav`, `.badge-new`, `.card` (the admin has its own
card), the modal block, `.toast` and the Itinerary block.

Two exceptions:
- The rule `.leaflet-popup-content` becomes `.routes-panel .leaflet-popup-content`. Leaflet popups render inside the map
  container, so the prefix still matches.
- Add `.routes-panel .map-wrap #routes-map { position: absolute; inset: 0; }`. The mockup's `#map` becomes `#routes-map`.

- [ ] **Step 3: Port the modal styles under their own root**

The panel's modals (Save As, Add another route) are appended to `document.body`, outside `.routes-panel`. Port the
"Modals" block (lines 163-174), prefixing each selector with `.routes-modal ` instead. Give the backdrop rule the name
`.routes-modal.modal-backdrop`, because the backdrop element itself carries both classes. Repeat the tokens block
from Step 1 on `.routes-modal`. Port the `.icon-btn`, `.icon-row`, `.text-btn` and `.field` rules a second time under
`.routes-modal `. Use `z-index: 3000` on the backdrop, so it sits above the admin's own modals.

- [ ] **Step 4: Port the responsive block**

Port the mockup's `@media (max-width: 900px)` block (lines 189-203), prefixing selectors with `.routes-panel `.

- [ ] **Step 5: Verify**

Run `node -e "require('fs').readFileSync('routes.css','utf8')"` (to check the file exists), then reload the admin
Routes tab. Expected: no visible change yet (the panel is still the stub), and no CSS 404 in
`read_network_requests`.

- [ ] **Step 6: Commit**

```bash
git add routes.css
git commit -m "feat: Routes panel styles from the approved mockup"
```

---

### Task 4: routes.js — panel layout, loading, and the side panel

**Files:**
- Modify: `routes.js`

Port from the mockup, keeping its behaviour and its user-facing text, with these differences:
- **Data:**
  - The mockup's `db` demo data becomes `routes` loaded from `GET /api/admin/routes` through
    `IolantheAdmin.api("/api/admin/routes")`.
  - The mockup's anchorage, site and charter-copy features aren't ported.
- **DOM ids:** prefix every mockup id with `routes-`, e.g. `route-picker` → `routes-picker`, `speed` → `routes-speed`,
  `map` → `routes-map`, `stats` → `routes-stats`, `legs` → `routes-legs`. Query them inside the panel element, not
  the whole document.
- **Pure logic** comes from `window.IolantheRoutesCore` (`stopLegs`, `totalHours`, `setLegSpeed`, `routeNm`, `fmtHm`,
  `isStop`, `replaceAt`, `insertAt`, `removeAt`, `routeSnapshot`). Don't copy those functions from the mockup.
- **Messages** go through `IolantheAdmin.setStatus(message, tone)` instead of the mockup's `toast`.

- [ ] **Step 1: Module state and markup**

Replace `routes.js` with an IIFE that holds this module state:

```js
  const A = () => window.IolantheAdmin;
  const core = () => window.IolantheRoutesCore;
  const DEFAULT_SPEED_KN = 8;
  const SPEED_KEY = "routePlanner.speed"; // last route speed used in this browser; seeds new routes only
  let panel = null;      // the #routes-panel element after bind()
  let routes = [];       // library from the server
  let work = null;       // { route, savedJson, baseRevision }
  let history = { undo: [], redo: [] };
  let mode = "select";
  let guard = null;      // page unsaved-changes guard
```

`render()` returns static markup with the same structure as the mockup's `#view-routes` section (lines 210-262).
The differences:
- The outer element is `<section class="card full routes-panel" id="routes-panel">`.
- Leave out the copy banner.
- In the map toolbar, include only the Select / Add / Delete modes. Anchorage arrives in phase 2.
- The Stops / Legs tab box is the same as the mockup's, including the `routes-speed` field in the Legs tab.
- There's no layers control yet.
- If `!IolantheAdmin.canManageCharterAdmin()`, render only this:

```html
<section class="card full routes-panel"><div class="card-header"><h2>Routes</h2></div><p class="empty">Routes are available to Charter Admin on the bridge.</p></section>
```

- [ ] **Step 2: Loading and opening routes**

`bind()` does these things:
- Finds `#routes-panel` (and returns if it's missing).
- Wires the events.
- Registers the unsaved guard: `guard = { isDirty, confirmOptions: { title: "Unsaved route", message: "Discard your unsaved route changes?", confirmLabel: "Discard", cancelLabel: "Cancel", tone: "danger" } }; IolantheAdmin.setPageUnsavedGuard(guard);`.
- Loads the library:
  - On success, it opens the first route, or a blank route if the library is empty.
  - On failure, it shows `setStatus(error.message, "error")` and an empty-state message in the panel.

Port these mockup functions:
- `setWork` and `isDirty` (lines 498-505), with `snapshot` replaced by `core().routeSnapshot`
- `openLibraryRoute` (507)
- `blankRoute` (511), using `loadSpeed()`
- `loadSpeed` and `storeSpeed` (449-452), keeping the try/catch
- `guardDiscard` (522), using `IolantheAdmin.showAdminConfirm`. Drop the pins text.
- `editPoints`, `undo` and `redo` (538-555)

- [ ] **Step 3: Side panel rendering**

Port these mockup functions:
- `renderPicker` (680): the Library group only, and a "New route (unsaved)" option.
- `renderStats` (695): the stats tiles plus the Stops tab. Leave out the anchorage-moved and deleted warnings and the
  site chips. When there are no stops, show the empty text "Stops arrive with anchorages in a later update."
- `timeStat`, `legSpeedControl`, `focusLeg`, `renderLegs` and `showTab` (733-813). They use `core().stopLegs(points,
  speed)` and `core().totalHours`. `setLegSpeed(leg, value)` becomes
  `editPoints((pts) => core().setLegSpeed(pts, leg.fromIndex, value))`.
- `renderAll` (838), without the layers.
- The input bindings for name, description and route speed from `bind()` in the mockup (lines 1518 onward). The speed
  field sets `work.route.speed_kn` and calls `storeSpeed`.

Use the mockup's `el()` helper (lines 401-413) to build the DOM. Copy it into routes.js. Leave out the `svg()` icon
helper and the `ICONS` map for now; they're needed in Task 5.

- [ ] **Step 4: Verify in the browser**

Reload, open Routes, and check:
- The picker lists "Coron loop" and "Culion run".
- The stats show nm, 2 stops, and h:mm.
- The Legs tab shows "Coron Town → Lusong Island" and "Lusong Island → End". The second leg runs at 6 kn and its
  card is tinted.
- Unticking or re-ticking the leg speed, and changing the route speed, update the times.
- Changing the name marks the route unsaved. Leaving the panel then asks "Discard your unsaved route changes?".
- There are no console errors.

- [ ] **Step 5: Commit**

```bash
git add routes.js
git commit -m "feat: Routes panel side panel, stats and stop-to-stop legs"
```

---

### Task 5: routes.js — map editing

**Files:**
- Modify: `routes.js`

- [ ] **Step 1: Port the map**

Port these mockup functions:
- **`ICONS` and `svg()`** (lines 302-318).
- **`MODES`** (lines 320-325): Select, Add and Delete only. Change the Select hint to "Tap a point to inspect it. Drag
  a point to move it, or drag a faint midpoint to insert one."
- **`initMap`** (859):
  - Use `await IolantheAdmin.loadLeaflet()` and the container `#routes-map`.
  - On failure, show the mockup's `.map-fallback` text "The map needs an internet connection (Leaflet and satellite
    tiles load online)."
  - Before re-binding, remove the previous map if one exists (`map.remove()`), because the panel re-renders when you
    switch tabs.
  - Call `map.invalidateSize()` after a `setTimeout(0)`, as admin.js does for its maps.
- **`divIcon` and `ll`** (875-876).
- **`renderMap`** (878): only the route line, midpoints and points. Leave out sites, anchorages, pins, tender lines
  and the stop "!" badge. Keep the stop marker with its number, because existing stops must show.
- **`focusPoint`** (962).
- **`onMapClick`**: the Add branch only.
- **`onPointClick`**.
- **`openPointPopup` and `pointPopup`** (995-1031): the heading, position, Name field and **Delete** button only. Leave
  out "Make anchorage", "Make site", "Make stop at" and the sites-served picker.
- **`renderModes` and `setMode`** (815-837).
- The point `dragend` handler, without `anchorageUnder` and snapping. A drop just moves the point.

- [ ] **Step 2: Header actions and keyboard**

Port `renderActions` (661) with these buttons, in this order:
- Save, Cancel
- separator
- Undo, Redo
- separator
- New, Save As, Add another route, Delete

Leave out Import and Export. The handlers come in Task 6; for now they can call a no-op. Port the Ctrl+Z / Ctrl+Y /
Ctrl+Shift+Z keyboard handler from the mockup's `bind()`. Attach it **once per bind** and remove it on the next bind,
because admin re-renders panels. It should only act while `#routes-panel` is in the document and no modal is open.

- [ ] **Step 3: Verify in the browser**

On "Coron loop":
- The satellite map shows the route, numbered stop markers 1 and 2, and white waypoint dots.
- In Add mode, tapping the map adds a point at the end.
- Dragging a midpoint inserts a point; dragging a point moves it.
- In Delete mode, tapping a point removes it.
- In Select mode, tapping a point opens the popup. Renaming it updates the stop-to-stop labels; Delete removes it.
- Undo and Redo (buttons and Ctrl+Z / Ctrl+Y) step back and forth.
- The stats and legs update after every edit.
- Switching to Route Upload and back works with no console errors. The map is re-created cleanly, with no "Map
  container is already initialized" error.

- [ ] **Step 4: Commit**

```bash
git add routes.js
git commit -m "feat: Routes panel map editing with undo/redo"
```

---

### Task 6: routes.js — saving, Save As, Delete, New, Cancel and Add another route

**Files:**
- Modify: `routes.js`

- [ ] **Step 1: Modal helper**

Port `openModal` (lines 464-484). The backdrop element gets the classes `routes-modal modal-backdrop`, and it's
appended to `document.body`. Keep the house rules:
- a green save button and a red cancel button, top right
- clicking outside the modal cancels
- Escape cancels

Use `IolantheAdmin.showAdminConfirm` for every yes/no question instead of porting `confirmDialog`.

- [ ] **Step 2: Saving against the server**

Port `validateRoute`, `saveRoute`, `saveAs`, `deleteRoute`, `newRoute` and `cancelChanges` (lines 586-658). They
change as follows.

**`saveRoute`:**
- If the route has no id, call `saveAs(true)`.
- Otherwise POST `/api/admin/routes/save` with `{ route: work.route, base_revision: work.baseRevision }`.
- On success, replace the route in `routes`, call `setWork(saved)`, and show
  `setStatus(\`Saved "${saved.name}" · revision ${saved.revision}\`, "ok")`.
- On `error.status === 409`, call `showAdminConfirm({ title: "Route changed elsewhere", message: \`${error.message} Reloading discards your changes; Cancel keeps them so you can Save As.\`, confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning" })`.
  If confirmed, re-fetch the library and `openLibraryRoute(id)`.
- On `error.status === 404`, show `setStatus(error.message, "error")` and leave the edits in place.
- Any other error: `setStatus(error.message, "error")`.
- `error.loginRequired` errors have an empty message. Ignore them, because admin.js handles them.

**`saveAs`:**
- The name modal as in the mockup.
- POST with `{ route: { ...work.route, id: "", source: work.route.source }, base_revision: 0 }`.
- On success, add the result to `routes` and call `setWork(saved)`.

**`deleteRoute`:**
- Ask `showAdminConfirm({ title: "Delete route?", message: \`Delete "${name}" from the library? Charters it was assigned to keep their own copy.\`, confirmLabel: "Delete", cancelLabel: "Cancel", tone: "danger" })`.
- POST `/api/admin/routes/delete` with `{ id }`.
- Remove the route from `routes`, then open the first remaining route, or a blank one.

**`newRoute` and `cancelChanges`:** as in the mockup, with confirms through `showAdminConfirm`.

**After any save or delete:** if the route is no longer dirty, call `IolantheAdmin.clearPageUnsavedGuard(guard)` and
then `setPageUnsavedGuard(guard)` again, so the guard stays registered for later edits.

**While a save is in flight:** disable the Save button, so a double click can't send two saves.

- [ ] **Step 3: Add another route**

Port `joinSources`, `openJoin` and the join flow (lines 1367-1430):
- Library routes only (no charter copies), excluding the open route.
- Use `core().joinPoints(work.route.points, other.points, opts)` and `core().joinGapNm(...)` for the preview text.
- Apply the join with `editPoints(..., { fit: true })`, as one undoable edit.

- [ ] **Step 4: Verify in the browser**

Check:
- Renaming "Culion run" and pressing Save shows "Saved … revision 2", and the picker updates.
- A clash: open the console and save the same route with `base_revision: 1` through `fetch` (see "How to run it
  locally"). Then edit in the panel and press Save. "Route changed elsewhere" appears, and Reload restores the server
  version.
- Save As "Culion run copy" creates a new picker entry with revision 1.
- Delete it and confirm; it disappears.
- New → Add mode → add 2 points → Save asks for a name and saves.
- Add another route: open Coron loop and add "Culion run" reversed after the end. The preview shows the gap or a
  seamless join, and applying it is undone with one Undo.
- Cancel discards unsaved changes after confirming.
- There are no console errors.

- [ ] **Step 5: Commit**

```bash
git add routes.js
git commit -m "feat: Routes panel saving, Save As, Delete, New and Add another route"
```

---

### Task 7: Responsive check, docs, and merge with David's approval

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/route-planner/HANDOFF.md`

- [ ] **Step 1: Phone and desktop check**

In the browser pane, at 1280×820 and then at 390×844 (`resize_window`), check:
- **Desktop:** the side panel's bottom lines up with the map's.
- **Phone:** the picker comes first, then the map, then the rest of the panel, with no sideways scroll
  (`document.documentElement.scrollWidth === innerWidth`).

Take a screenshot of each. Reset with `preset: "desktop"`.

- [ ] **Step 2: Run the unit tests**

Run: `node --test`
Expected: 13 pass, 0 fail.

- [ ] **Step 3: Update CLAUDE.md**

In `CLAUDE.md` under "## Stack", add:

```markdown
- `routes-core.js` — Route Planner pure logic (also a Node module; tests in `test/`, run `node --test`)
- `routes.js` / `routes.css` — Charter → Routes panel; uses `window.IolantheAdmin` helpers exposed at the end of admin.js
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: Routes panel files"
```

- [ ] **Step 5: Ask David before merging**

Merging `iolanthe-admin` to `main` releases it once the VM pulls; static files need no restart. Show David the two
screenshots and ask for approval. When he agrees:

```bash
git switch main
git merge --ff-only feat/routes-panel
git push origin main
git branch -d feat/routes-panel
```

- [ ] **Step 6: Update the handoff**

In `docs/route-planner/HANDOFF.md`, under "## Phase 1 progress", record that Plan B is done, with the merge hash. Note
that phase 1 is complete. Next is phase 2: the site and anchorage overlays, plus the spec §7 Q3 decision. Commit that
straight to `main`.

---

## Self-review notes

- **Spec coverage (§4.1, phase 1):**
  - route picker (library), name, description and route speed: Tasks 4 and 6
  - stats tiles and the Stops / Legs tabs with leg cards and per-leg speed: Task 4
  - Select / Add / Delete, drag, midpoint insert, popup with name and delete, undo/redo: Task 5
  - Save (409 and 404 flows), Save As, Delete, New, Cancel and Add another route (library): Task 6
  - the house modal rules (green save / red cancel, clicking outside cancels): Task 6
  - the unsaved-changes guard: Tasks 4 and 6
  - the phone layout (Q1): Tasks 3 and 7
  - Route Upload stays alongside: Task 2
  - the version bump: Task 2
  - phase 2+ items are deliberately left out (listed at the top)
- **Types:** core functions are named the same in Task 1 and Tasks 4–6. `stopLegs(points, routeSpeed)` returns
  `{from, to, fromIndex, toIndex, nm, own, speed, hours}`. `setLegSpeed(points, index, value)`.
- **Risk:** admin re-renders panels on navigation. Tasks 5 and 6 explicitly handle re-binding (the map is removed and
  re-created, and the keyboard listener is attached once per bind).
