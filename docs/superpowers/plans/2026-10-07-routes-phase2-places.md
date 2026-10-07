# Routes Phase 2 (sites, anchorages, stops) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sites and anchorages to the Routes panel map, and let Charter Admin make stops:
- **Anchorages:** create, edit, move and delete them, with an Anchorage mode.
- **Stops:** Add mode on an anchorage, "Make stop at", and drag-to-snap. A stop at the same anchorage as the
  stop before or after it **merges** (spec §7 Q3).
- **Sites:** add a site as a waypoint, click to edit, Make site from a point, and the sites-served picker on stops.
- **Display:** tender lines, "anchorage moved" warnings and a layers control.

**Architecture:**
- Phase 1 is live: `routes.js`, `routes-core.js` and `routes.css`, from `main` `91d679a`.
- The pure logic phase 2 needs (nearby search, making stops with the merge rule, moved distance) goes into
  `routes-core.js`, test-first.
- Everything about **places** (anchorage and site data, their markers, the anchorage modal, the bridge to the
  admin's Site Editor modal) goes in a new **`routes-places.js`**, because `routes.js` is already 810 lines. It
  exposes `window.IolantheRoutesPlaces.create(ctx)`; `routes.js` creates one instance per bind and wires it in.
- `admin.js` exposes its existing Site Editor modal and sites saving, with one small optional parameter so a new
  site can be pre-filled with a position.
- The approved mockup `docs/route-planner/planner-mockup.html` is the working reference again.

**Tech Stack:** plain browser JS (no build, no npm), Leaflet 1.9.4 (via `IolantheAdmin.loadLeaflet`), `node:test` for
`routes-core.js`.

**Server APIs (live, `iolanthe-server` `2ac4b8d`):**
- `GET /api/admin/anchorages` → `{ anchorages: [{ id, name, latitude, longitude, depth_m?, notes }] }`
- `POST /api/admin/anchorages/save` with body `{ anchorages: [...] }` (the **whole library**) → the saved library. Errors:
  - 400 for bad input or a duplicate id
  - 500 if the file is unreadable
- Sites: `GET /api/admin/sites` and `POST /api/admin/sites/save` (whole library), through admin.js's existing
  `saveSitesLibrary`.

**Spec:** `docs/route-planner/spec.md` draft 2: §2.1 and §2.2, §4.1 (mode table, snapping, point popup, styling,
layers) and §5 phase 2. §7: Q3 = merge, and Q4 distances: auto-link 2 nm, "Make stop at" 2 nm, sites-served highlight
5 nm, snap 24 px.

**Out of scope:** import and export (phase 3), the Itinerary rows and charter copies (phase 4), and the OpenSeaMap layer (phase 5).

---

## Facts this plan relies on (checked 2026-10-07, `main` at `1cff97c`)

| Fact | Where |
|---|---|
| `openSiteEditorModal(siteLibrary, site, onSave)`: `site` null means a new site. The draft is `{...blankSite(), ...(editing ? cloneData(site) : {})}`, and `onSave(normalizedSite)` is awaited before the modal closes. | admin.js:5756-5766, 6007 |
| Adding a site: `saveSitesLibrary(normalizeSiteLibrary({...siteLibrary, sites: [...siteLibrary.sites, site]}), "Site created.")`. Editing replaces it by index. | admin.js:7866-7872, 7563 |
| `saveSitesLibrary(siteLibrary, message)` POSTs, mutates `siteLibrary.sites` to the saved list, updates `state.sites` and calls `setStatus`. | admin.js:4830-4842 |
| `window.IolantheAdmin` is a frozen object just before `loadBootstrap();` | admin.js:15620-15629 |
| Routes bind receives `{ siteLibrary }` from `bindCharterPanel`. Sites have `{ id, title, latitude, longitude, ... }`. | admin.js (bindCharterPanel), routes.js `bind()` |
| routes.js keeps `panel`, `routes`, `work`, `map`, `editPoints(fn, opts)`, `renderAll(opts)`, `renderMap(opts)`, `pointPopup(i)`, `openModal({title, body, onSave, saveTitle, wide})`, `el()`, and `MODES` (Select / Add / Delete). | routes.js |
| The mockup reference functions are `stopAt`, `addStopFor`, `makeStopAt`, `nearbyAnchorages`, `anchorageUnder`, `renderMap` (the sites, anchorages and tender parts), `onAnchorageClick`, `onSiteClick`, `moveAnchorage`, `pointPopup`, `sitesServedPicker`, `openAnchorageModal`, `deleteAnchorage`, `renderStats` (warnings and chips) and `renderLayers`. | planner-mockup.html; find each **by name** |
| The Stops tab count shows an empty grey circle at 0 (seen live). | routes.css `.routes-panel .tabs .count` |

## File structure

| File | Action | Responsibility |
|---|---|---|
| `routes-core.js` | Modify | Add `sitesWithin`, `nearbyAnchorages`, `stopAt`, `makeStopAt` (with merge), `appendStop` (with merge), `anchorageMovedM`, `routesUsingAnchorage` |
| `test/routes-core.test.js` | Modify | Tests for the above |
| `routes-places.js` | Create | Anchorage and site data, markers, layers, the anchorage modal, the Site Editor bridge |
| `routes.js` | Modify | Wire places in: modes, map clicks, point popup additions, snapping, stops tab details |
| `routes.css` | Modify | Hide a zero tab count; styles for the layers control, anchorage and site markers and the popup (port any missing mockup rules) |
| `admin.js` | Modify | Expose `openSiteEditorModal`, `saveSitesLibrary` and `normalizeSiteLibrary`; let `openSiteEditorModal` take a `defaults` draft |
| `index.html` | Modify | Load `routes-places.js` between routes-core.js and routes.js; bump to `admin-routes-v2` |

Local dev: the `routes-admin-dev` launch entry in the workspace `.claude/launch.json` (port 8124). The test login is
**`admin.passwords.charter`** in `iolanthe/iolanthe-server/data-local/routes-dev/data/settings.json`. Seed two
anchorages through the console (Task 3 shows how).

---

### Task 1: routes-core: places logic with the merge rule (TDD)

**Files:**
- Modify: `routes-core.js`
- Modify: `test/routes-core.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/routes-core.test.js`:

```js
const SITES = [
  { id: "near", title: "Near", latitude: 12.01, longitude: 120 },   // ~0.6 nm from A
  { id: "far", title: "Far", latitude: 12.2, longitude: 120 }        // ~12 nm
];
const ANCH = { id: "a", name: "Alpha", latitude: 12, longitude: 120 };
const ANCH_B = { id: "b", name: "Bravo", latitude: 12.02, longitude: 120 };

test("sitesWithin returns ids within the range", () => {
  assert.deepEqual(core.sitesWithin(SITES, P(12, 120), 2), ["near"]);
});

test("nearbyAnchorages sorts by distance and respects the range", () => {
  const out = core.nearbyAnchorages([ANCH_B, ANCH], P(12.001, 120), 2);
  assert.deepEqual(out.map((x) => x.anchorage.id), ["a", "b"]);
  assert.ok(out[0].nm < out[1].nm);
  assert.deepEqual(core.nearbyAnchorages([ANCH], P(13, 120), 2), []);
});

test("stopAt builds a stop on the anchorage and auto-links sites within 2 nm", () => {
  assert.deepEqual(core.stopAt(ANCH, SITES), { latitude: 12, longitude: 120, anchorage_id: "a", name: "Alpha", site_ids: ["near"] });
});

test("makeStopAt replaces the point with a stop", () => {
  const pts = [P(11.9, 120), P(12.001, 120.001), P(12.1, 120)];
  const { points, merged } = core.makeStopAt(pts, 1, ANCH, SITES);
  assert.equal(merged, false);
  assert.equal(points[1].anchorage_id, "a");
  assert.equal(points.length, 3);
});

test("makeStopAt merges into an identical neighbouring stop (spec Q3)", () => {
  const prevStop = { ...P(12, 120), anchorage_id: "a", name: "Alpha" };
  const before = [P(11.9, 120), prevStop, P(12.001, 120.001), P(12.1, 120)];
  const r1 = core.makeStopAt(before, 2, ANCH, SITES);
  assert.equal(r1.merged, true);
  assert.deepEqual(r1.points, [before[0], prevStop, before[3]]);
  const after = [P(11.9, 120), P(12.001, 120.001), prevStop];
  const r2 = core.makeStopAt(after, 1, ANCH, SITES);
  assert.equal(r2.merged, true);
  assert.deepEqual(r2.points, [after[0], prevStop]);
});

test("makeStopAt does not merge with a stop at a different anchorage", () => {
  const otherStop = { ...P(12.02, 120), anchorage_id: "b", name: "Bravo" };
  const { merged, points } = core.makeStopAt([otherStop, P(12.001, 120)], 1, ANCH, SITES);
  assert.equal(merged, false);
  assert.equal(points.length, 2);
});

test("appendStop adds a stop at the end, or merges when the last point is the same anchorage", () => {
  const r1 = core.appendStop([P(11.9, 120)], ANCH, SITES);
  assert.equal(r1.merged, false);
  assert.equal(r1.points.length, 2);
  const r2 = core.appendStop(r1.points, ANCH, SITES);
  assert.equal(r2.merged, true);
  assert.equal(r2.points.length, 2);
});

test("anchorageMovedM is 0 within 50 m and the distance beyond", () => {
  const stop = { ...P(12, 120), anchorage_id: "a" };
  assert.equal(core.anchorageMovedM(stop, { ...ANCH, latitude: 12.0002 }), 0);
  assert.ok(core.anchorageMovedM(stop, { ...ANCH, latitude: 12.005 }) > 500);
  assert.equal(core.anchorageMovedM(P(12, 120), ANCH), 0);
  assert.equal(core.anchorageMovedM(stop, null), 0);
});

test("routesUsingAnchorage lists the routes with a stop there", () => {
  const routes = [
    { id: "r1", name: "One", points: [{ ...P(1, 1), anchorage_id: "a" }] },
    { id: "r2", name: "Two", points: [P(1, 1)] }
  ];
  assert.deepEqual(core.routesUsingAnchorage(routes, "a").map((r) => r.id), ["r1"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test`
Expected: the new tests fail with `core.sitesWithin is not a function` (and similar); the 14 existing tests still pass.

- [ ] **Step 3: Implement in routes-core.js**

Add these inside the factory, before `return {`:

```js
  const AUTO_LINK_NM = 2;    // spec §7 Q4: anchorage stops auto-link sites within 2 nm
  const MOVED_WARN_M = 50;   // a stop more than this from its anchorage shows "moved"

  function sitesWithin(sites, pos, nm) {
    return (sites || []).filter((site) => distNm(pos, site) <= nm).map((site) => site.id);
  }

  function nearbyAnchorages(anchorages, pos, nm) {
    return (anchorages || [])
      .map((anchorage) => ({ anchorage, nm: distNm(pos, anchorage) }))
      .filter((x) => x.nm <= nm)
      .sort((x, y) => x.nm - y.nm);
  }

  function stopAt(anchorage, sites) {
    return {
      latitude: anchorage.latitude,
      longitude: anchorage.longitude,
      anchorage_id: anchorage.id,
      name: anchorage.name,
      site_ids: sitesWithin(sites, anchorage, AUTO_LINK_NM)
    };
  }

  const sameStop = (point, anchorage) => Boolean(point && point.anchorage_id && point.anchorage_id === anchorage.id);

  // Spec §7 Q3: making a point a stop at the anchorage already used by the stop before or after it merges
  // (the point is removed) instead of creating a second stop there.
  function makeStopAt(points, index, anchorage, sites) {
    if (sameStop(points[index - 1], anchorage) || sameStop(points[index + 1], anchorage)) {
      return { points: removeAt(points, index), merged: true };
    }
    return { points: replaceAt(points, index, stopAt(anchorage, sites)), merged: false };
  }

  function appendStop(points, anchorage, sites) {
    if (sameStop(points[points.length - 1], anchorage)) {
      return { points, merged: true };
    }
    return { points: [...points, stopAt(anchorage, sites)], merged: false };
  }

  function anchorageMovedM(point, anchorage) {
    if (!point || !point.anchorage_id || !anchorage) {
      return 0;
    }
    const metres = distM(point, anchorage);
    return metres > MOVED_WARN_M ? metres : 0;
  }

  function routesUsingAnchorage(routes, anchorageId) {
    return (routes || []).filter((route) => (route.points || []).some((p) => p.anchorage_id === anchorageId));
  }
```

Add the new names to the returned object: `sitesWithin, nearbyAnchorages, stopAt, makeStopAt, appendStop,
anchorageMovedM, routesUsingAnchorage`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: 23 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git switch -c feat/routes-phase2
git add routes-core.js test/routes-core.test.js
git commit -m "feat: routes-core places logic with merge rule"
```

---

### Task 2: admin.js exposure, the Site Editor defaults, the routes-places.js stub and index.html

**Files:**
- Modify: `admin.js`. It has CRLF line endings: make exact-text edits with a Python script that opens the file
  with `newline=''` and asserts each anchor appears exactly once.
- Modify: `index.html` (CRLF)
- Create: `routes-places.js`

- [ ] **Step 1: Let the Site Editor take defaults for a new site**

In `admin.js`, replace

```js
  function openSiteEditorModal(siteLibrary, site, onSave) {
```

with

```js
  // defaults: optional draft fields for a NEW site (e.g. { title, latitude, longitude } from the Routes map).
  function openSiteEditorModal(siteLibrary, site, onSave, defaults) {
```

and replace

```js
      ...(editing ? cloneData(site) : {})
```

(the line inside that function's `const draft = {` block) with

```js
      ...(editing ? cloneData(site) : (defaults || {}))
```

- [ ] **Step 2: Expose the helpers**

In the `window.IolantheAdmin = Object.freeze({` block, after `canManageCharterAdmin`, add:

```js
    canManageCharterAdmin,
    openSiteEditorModal,
    saveSitesLibrary,
    normalizeSiteLibrary
```

That means replacing the `    canManageCharterAdmin` line (no trailing comma) with the four lines above.

- [ ] **Step 3: Create the routes-places.js stub**

```js
// Routes panel: places (anchorages and sites) on the map. Used by routes.js; pure logic is in routes-core.js.
(function () {
  "use strict";

  function create(ctx) {
    return { ctx };
  }

  window.IolantheRoutesPlaces = Object.freeze({ create });
})();
```

- [ ] **Step 4: index.html**

Replace every `?v=admin-routes-v1` with `?v=admin-routes-v2`. After the `routes-core.js` script tag, add a
`routes-places.js` tag the same way (`defer`, `/admin/` prefix, same version string), keeping the line endings.

- [ ] **Step 5: Verify and commit**

Run `node --check admin.js routes-places.js` and `node --test` (23 pass). Start `routes-admin-dev` with `preview_start`
and log in as Charter Admin. Check:
- the Routes panel works as before
- the Site Editor still adds and edits a site
- `routes-places.js` loads with 200
- the console has no errors

Then `preview_stop`.

```bash
git add admin.js index.html routes-places.js
git commit -m "feat: expose Site Editor to the Routes panel; routes-places stub"
```

---

### Task 3: routes-places.js: data, markers and layers (display only)

**Files:**
- Modify: `routes-places.js`, `routes.js`, `routes.css`

**The `create(ctx)` interface.** `ctx` holds:
- `A`: `IolantheAdmin`
- `core`: `IolantheRoutesCore`
- `el`, `openModal`
- `getSiteLibrary()`: returns the `{sites}` object from bind
- `getRoutes()`: the route library
- `getWork()`: returns `work`
- `onChanged()`: called after any place is saved, moved or deleted; routes.js does `renderAll()`

It returns:

```js
{
  load(),                       // GET /api/admin/anchorages → stores the list; returns a Promise
  anchorages(), sites(),        // current arrays
  findAnchorage(id), findSite(id),
  draw(L, groups, opts),        // opts: { mode, layers: {sites, anchorages}, usedAnchorageIds:Set, divIcon, onAnchorageClick(a), onSiteClick(s), onAnchorageDragEnd(a, latlng) }
  anchorageUnder(map, latlng),  // anchorage marker within 24 px (screen distance), or null
  openAnchorageModal(anchorage, pos, opts),   // Task 4
  deleteAnchorage(anchorage),                 // Task 4
  moveAnchorage(anchorage, latlng),           // Task 4
  openSiteModal(site, pos, opts)              // Task 5
}
```

- [ ] **Step 1: Port the display parts**

From the mockup, port:
- the sites and anchorages parts of `renderMap`: site pins `mk-site` with `zIndexOffset` 100; anchorage markers `mk-anch` with the label, dimmed when not in `usedAnchorageIds`, draggable only in Anchorage mode (`zIndexOffset` 200)
- `anchorageUnder`, using `core.nearbyAnchorages` only for the list; the pixel test uses `map.latLngToContainerPoint`

Escape names: never build marker HTML from names without `A.escapeHtml`. Labels go through `escapeHtml`; titles go
through the Leaflet `title` option.

- [ ] **Step 2: Wire it into routes.js**

In `bind()`:
- create `places = IolantheRoutesPlaces.create({...})` with the ctx above
- call `places.load()` together with `loadLibrary`
- on a load error, show `setStatus(error.message, "error")`; the panel still works without places

In `renderMap`:
- create two more layer groups, `sites` and `anchorages`, **below** the route groups
- call `places.draw(...)`
- add the mockup's **tender lines** (a stop to each site in its `site_ids`: dashed white, opacity 0.75, not
  interactive)
- add the stop marker's `!` badge when `core.anchorageMovedM(point, places.findAnchorage(point.anchorage_id)) > 0`
  or the anchorage no longer exists

Port `renderLayers` (Sites, Anchorages checkboxes; no Imported pins yet) into a `.layers` box in the map, as in the mockup.

In `renderStats` (Stops tab), port the mockup's per-stop details:
- the anchorage depth
- "⚠ Anchorage moved N m since placed"
- "⚠ Anchorage deleted. The stop keeps its position."
- site chips from `site_ids` (`places.findSite`). Drop ids that no longer exist **quietly** (spec §2.1).

Replace the phase-1 empty text with the mockup's: "No stops yet. In Add mode, tap an anchorage to add one."

- [ ] **Step 3: CSS**

In `routes.css`:
- add `.routes-panel .tabs .count:empty { display: none; }`
- port any mockup rules still missing for `.layers`, `.dot`, `.mk-anch`, `.mk-site`, `.mk-label`, `.mk-badge`,
  `.chips`, `.chip` and `.warn-text`, prefixed `.routes-panel `. Check which already exist first.

- [ ] **Step 4: Verify**

Start `routes-admin-dev`, log in, and seed anchorages from the console:

```js
await fetch("/api/admin/anchorages/save?key=hotel", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anchorages: [
  { name: "Coron Town", latitude: 11.9975, longitude: 120.201, depth_m: 12, notes: "Good holding in mud." },
  { name: "Lusong Island", latitude: 12.036, longitude: 120.096, depth_m: 15, notes: "" } ] }) }).then((r) => r.json());
```

Expected:
- the map shows site pins and anchorage markers (unused ones dimmed)
- the layer checkboxes hide and show them
- existing stops on "Coron loop" show tender lines and site chips
- the Stops count circle is hidden at 0
- the console has no errors

- [ ] **Step 5: Commit**

```bash
git add routes-places.js routes.js routes.css
git commit -m "feat: Routes map shows sites and anchorages with layers, tender lines and stop details"
```

---

### Task 4: Anchorages: Anchorage mode, the modal, move and delete; stops from Add mode

**Files:**
- Modify: `routes-places.js`, `routes.js`

- [ ] **Step 1: The anchorage modal (routes-places.js)**

Port the mockup's `openAnchorageModal` and `deleteAnchorage`:
- **Modal:** use `ctx.openModal` (green save / red cancel, clicking outside cancels).
- **Fields:** name, latitude/longitude, depth (m, optional), notes (max 500).
- **Saving:** sends the **whole library** to `POST /api/admin/anchorages/save` as `{anchorages: [...]}`:
  - a new anchorage gets an `id` from the server's slug of its name
  - an existing one keeps its id
- **Errors:** show the server message with `A.setStatus(message, "error")` and keep the modal open (return `false` from `onSave`).
- **Result:** `openAnchorageModal(anchorage, pos, opts)` returns a Promise that resolves to the saved anchorage, or
  `null` if cancelled.
- **Delete:**
  - confirm with `A.showAdminConfirm`
  - the message lists `core.routesUsingAnchorage(ctx.getRoutes(), id)` names: "Those stops keep their position and name."
  - then save the library without it
- **Moving:** `moveAnchorage(anchorage, latlng)` saves the library with the new position. Then call
  `A.setStatus("Anchorage moved and saved. Stops on N route(s) stay put and show a warning.", "ok")`.
- **After any of these:** call `ctx.onChanged()`.

- [ ] **Step 2: Anchorage mode and clicks (routes.js)**

- **MODES:** add `{ id: "anchorage", label: "Anchorage", icon: "anchor", hint: "Tap the map to create an anchorage. Tap one to edit it, or drag it to move it." }`.
- **ICONS:** add the mockup's `anchor` icon.
- **Map click:**
  - in Anchorage mode, `places.openAnchorageModal(null, pos)`
  - Add mode is unchanged
- **Anchorage click:**
  - Add mode: `editPoints((pts) => core.appendStop(pts, a, places.sites()).points)`. If `appendStop` reports
    `merged`, don't add an undo step; just `setStatus("Already the last stop: " + a.name, "")`.
  - Select or Anchorage mode: `places.openAnchorageModal(a)`.
- **Anchorage dragend** (Anchorage mode only): `places.moveAnchorage(a, latlng)`.

- [ ] **Step 3: Verify**

Check:
- Anchorage mode: tapping the map creates one; it appears, and a reload keeps it.
- Editing one changes its name and depth.
- Dragging one moves it, and an existing stop at it shows "moved" in the Stops tab plus the `!` badge.
- Delete asks to confirm and lists the routes using it; afterwards those stops show "Anchorage deleted".
- In Add mode, tapping an anchorage appends a stop with auto-linked sites (chips). Tapping the same anchorage again
  doesn't add a second stop.
- Undo and Redo still work.
- The console has no errors.

- [ ] **Step 4: Commit**

```bash
git add routes-places.js routes.js
git commit -m "feat: Routes anchorages - Anchorage mode, modal, move, delete, stops from Add mode"
```

---

### Task 5: Sites, the point popup additions, snapping and sites served

**Files:**
- Modify: `routes-places.js`, `routes.js`

- [ ] **Step 1: The Site Editor bridge (routes-places.js)**

`openSiteModal(site, pos, opts)` calls:

```js
A.openSiteEditorModal(siteLibrary, site, async (saved) => {
  const next = A.normalizeSiteLibrary({
    ...siteLibrary,
    sites: site ? siteLibrary.sites.map((s) => (s.id === site.id ? saved : s)) : [...siteLibrary.sites, saved]
  });
  await A.saveSitesLibrary(next, site ? "Site saved." : "Site created.");
  // saveSitesLibrary updates next.sites; copy the result back so the panel's library object stays current
  siteLibrary.sites = next.sites;
  resolve(saved);
}, site ? undefined : { title: (opts && opts.name) || "", latitude: pos.latitude, longitude: pos.longitude });
```

It's wrapped in a Promise that resolves to the saved site. If the dialog closes without saving, it resolves `null`:
watch for `#dialog-modal` getting the `hidden` class again with a `MutationObserver`, or check after close. Then call
`ctx.onChanged()`. This uses the admin's own Site Editor dialog, not a routes modal, so the keyboard guard's
`.admin-decision-backdrop` / `.routes-modal` check needs `#dialog-modal:not(.hidden)` added too.

- [ ] **Step 2: Site clicks (routes.js)**

- **Add mode:** append a waypoint `{ latitude, longitude, site_id, name: site.title }`, then `setStatus("Added waypoint at " + title, "")`.
- **Select mode:** `places.openSiteModal(site)`.

- [ ] **Step 3: Point popup additions (routes.js `pointPopup`)**

Port these from the mockup's `pointPopup`:
- **"Make stop at {name} · {nm} nm"** buttons (waypoints only): `core.nearbyAnchorages(places.anchorages(), p, 2)`,
  at most 3. Click → `editPoints((pts) => core.makeStopAt(pts, i, a, places.sites()).points)`. If merged, show
  `setStatus("Merged into the existing stop at " + a.name, "")`.
- **"Make anchorage"** (waypoints only):
  - `places.openAnchorageModal(null, p, { name: p.name })`
  - if it resolves to an anchorage, replace the point with `core.stopAt(saved, places.sites())`, following the
    merge rule via `makeStopAt`
- **"Make site":** `places.openSiteModal(null, p, { name: p.name })`. If saved, set the point's `site_id` (waypoints)
  and `name`, if it has no name yet.
- **"Move stop to anchorage"** link in a warning banner when `core.anchorageMovedM` > 0, as in the mockup.
- **Sites served** picker (stops only): port the mockup's `sitesServedPicker`.
  - Sites are sorted by distance; those within 5 nm are in a "Within 5 nm" group and bold, the rest under "Further away".
  - Each tick goes through `editPoints` and keeps the popup open (the mockup re-opens it with `{ popup: i }`).
  - Keep the Task 6 rule from phase 1: name edits must not rebuild the popup under the cursor.

- [ ] **Step 4: Snapping (routes.js point `dragend`)**

- If `places.anchorageUnder(map, latlng)` returns an anchorage (and Anchorages are visible), call
  `editPoints((pts) => core.makeStopAt(pts, i, a, places.sites()).points)`, then call `setStatus` with "{name} is now
  a stop" or "Merged into the existing stop at {name}".
- Otherwise, move the point as before.
- A stop dragged away keeps its `anchorage_id`, and shows "moved".

- [ ] **Step 5: Verify**

Check:
- In Select mode, clicking a site opens the real Site Editor; saving updates its pin.
- In Add mode, clicking a site adds a named waypoint.
- In the waypoint popup:
  - "Make stop at" appears near an anchorage and converts the waypoint
  - next to an existing stop at the same anchorage it merges, and the point disappears
- "Make anchorage" creates the anchorage, and the point becomes a stop.
- "Make site" opens the Site Editor pre-filled with the position and name; after saving, the pin appears.
- Snapping a dragged point onto an anchorage marker makes a stop; snapping next to the same stop merges.
- Sites served ticks add and remove chips and tender lines; the popup stays open.
- "Move stop to anchorage" clears the warning.
- Save, then reload: everything persists.
- The console has no errors.

- [ ] **Step 6: Commit**

```bash
git add routes-places.js routes.js
git commit -m "feat: Routes stops - Make stop at, snap with merge, Make site/anchorage, sites served"
```

---

### Task 6: Checks, docs, and merge with David's approval

- [ ] **Step 1:** At 1280×820 and 390×844, check:
  - the layers box doesn't cover the mode toolbar
  - the popups fit on a phone
  - there's no sideways scroll

  Take one screenshot of each, then reset with `preset: "desktop"`.
- [ ] **Step 2:** Run `node --test`: 23 pass.
- [ ] **Step 3:** In `CLAUDE.md` under "## Stack", add:
  `routes-places.js — Routes panel places (anchorages, sites, markers, anchorage modal, Site Editor bridge)`. Commit it.
- [ ] **Step 4:** Ask David before merging. Merging releases it: the cron pulls the admin within 5 minutes.
- [ ] **Step 5:** After the merge, update `docs/route-planner/HANDOFF.md`: phase 2 is done, with the merge hash; next is
  phase 3 (KML/GPX import and export, retire Route Upload). Commit straight to `main`.

---

## Self-review notes

- **Spec coverage:**
  - §4.1 mode table:
    - Add (map, anchorage → stop, site → waypoint): Tasks 4 and 5
    - Select (point popup, edit anchorage, edit site): Tasks 4 and 5
    - Delete: unchanged
    - Anchorage mode (new, edit): Task 4
  - Snapping (24 px): Task 5. Merge (Q3): Tasks 1, 4 and 5.
  - Point popup (Name, Sites served, Make anchorage, Make site, Delete, Make stop at): Task 5.
  - Styling (stop markers, dimmed unused anchorages, site pins, the "!" badge): Task 3. Layers (Sites, Anchorages): Task 3.
  - §2.1: stops hold their own position, "moved" warning; deleted site ids dropped quietly: Tasks 3 and 5.
  - §2.2: depth optional, notes 500, delete confirm listing the routes: Task 4.
  - Q4 distances (2 nm auto-link, 2 nm Make stop at, 5 nm highlight, 24 px snap): Tasks 1, 3 and 5.
  - The live bug (an empty count circle): Task 3.
- **Types:** core functions return `{ points, merged }` for `makeStopAt` and `appendStop`.
  `nearbyAnchorages(anchorages, pos, nm)` returns `[{anchorage, nm}]`. The `places.*` names are fixed in Task 3's
  interface and used unchanged in Tasks 4 and 5.
- **Risk:** the Site Editor is admin.js's shared `#dialog-modal`. Task 5 makes the keyboard guard respect it. Task 2
  confirms the Site Editor panel still works after the `defaults` change.
