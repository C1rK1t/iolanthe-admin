# Route Planner — spec (draft 2)

Status: draft 2, 2026-10-07. Draft 1 (2026-10-06) plus David's mockup review round 1 and the captain's first look,
recorded in [HANDOFF.md](HANDOFF.md). Follows [brainstorm.md](brainstorm.md). The clickable mockup
[planner-mockup.html](planner-mockup.html) matches this draft. Questions still open are in §7.

Repos: `iolanthe-admin` (UI), `iolanthe-server` (storage and APIs). **No guest or crew changes.**

---

## 1. Decisions this spec is built on

| # | Decision |
|---|---|
| D1 | Routes live in a **library**. Assigning one to a charter **copies** it into that charter's `planned-route.json`. Past charters are never touched by library edits. |
| D2 | A route is **one continuous line**. Itinerary days are not linked to route legs (yet). |
| D3 | **Anchorages** are a planner-only layer: name, depth, notes. A route point placed on an anchorage is a **stop**. Stops are shown in the planner only. Guests get their information from the site-based itinerary. |
| D4 | **Sites** are shown on the planner map for reference and editing. They are rarely stops (often a tender ride away). |
| D5 | **Import and export KML and GPX.** |
| D6 | Planning and assigning are **Charter Admin on the bridge VLAN only**, the same as Route Upload today. |
| D7 | Existing charter routes are **imported into the library** once. |
| D8 | A **stop can be associated with sites** it serves (e.g. a tender ride to a dive site). The association is stored on the stop within the route. |
| D9 | The planner works in **stops and legs, not points**. Point counts and point numbers are never shown. Legs run stop to stop. |
| D10 | A route can be **built by joining existing routes** (append or prepend, optionally reversed), then saved with Save As. |

---

## 2. Data

### 2.1 `library/routes.json` (new)

```json
{
  "routes": [
    {
      "id": "coron-loop",
      "name": "Coron loop",
      "description": "Busuanga north side, return via Coron Town.",
      "revision": 4,
      "created_at": "2026-10-06T10:00:00Z",
      "updated_at": "2026-10-06T11:20:00Z",
      "source": { "type": "planner" },
      "points": [
        { "latitude": 11.9951, "longitude": 120.2049, "anchorage_id": "coron-town", "name": "Coron Town",
          "site_ids": ["coron-island", "coron-wrecks"] },
        { "latitude": 12.0500, "longitude": 120.1000 },
        { "latitude": 12.1780, "longitude": 120.0947, "site_id": "port-caltom", "name": "Port Caltom" }
      ]
    }
  ]
}
```

- `id` is a slug of the name, made unique. It never changes on rename.
- `revision` goes up on every save. A save sends the revision it started from. If the stored revision is newer, the
  server answers 409 and the UI says *"Someone else saved this route. Reload it?"*
- A point holds its **own copy of the position**. `anchorage_id` / `site_id` / `name` are labels taken when the point
  was placed. Moving an anchorage or site later doesn't move the point. The planner shows a small warning badge when
  they no longer match (decision: stay put plus a warning).
- `site_ids` (stops only): the sites this stop serves, in display order. It's set in the stop popup by ticking from
  a list of sites, sorted by distance, with those within 5 nm shown first. Sites that are deleted later are dropped
  quietly when the route loads. The planner draws a faint dashed "tender" line from the stop to each associated site.
- `source.type`: `planner`, `kml`, `gpx` (with `filename`), or `charter` (with `charter_id`, `plan`) for migrated routes.

### 2.2 `library/anchorages.json` (new)

```json
{ "anchorages": [
  { "id": "coron-town", "name": "Coron Town", "latitude": 11.9951, "longitude": 120.2049,
    "depth_m": 12, "notes": "Good holding in mud. Busy with bancas by day." }
] }
```

- `depth_m` is a number in metres and optional. `notes` is limited to 500 characters.
- Deleting an anchorage that saved routes use is allowed after a confirm that lists those routes. Their points keep
  their position and name.

### 2.3 `charters/<id>/planned-route.json` (format unchanged)

On assign, the server writes the chosen plan exactly as the guest app reads it today:

```json
"primary": {
  "source": { "type": "library", "route_id": "coron-loop", "route_name": "Coron loop",
              "revision": 4, "assigned_at": "2026-10-06T11:30:00Z" },
  "routes": [ { "name": "Coron loop", "description": "...", "coordinates": [ {"latitude":..,"longitude":..} ] } ]
}
```

The top-level `source` / `routes` legacy copy of primary is kept, as `writePlannedRoutePlan` does today.
Guest and crew code don't change.

A charter copy holds coordinates only, so stops, names and `site_ids` are lost when a copy is opened in the planner
or joined onto another route. Whether to add an additive field for them is open (§7, Q2).

### 2.4 Migration (D7)

When `library/routes.json` doesn't exist yet, the server creates it at startup. For every charter, each plan with
route data becomes a library route:
- The name is `"<charter name> — Primary"` (or `— Alternative`). Multiple KML lines are joined in file order.
- The source is `{type: "charter", charter_id, plan}`.
- The charter's own `planned-route.json` is not modified.

It runs once only, because the file then exists.

---

## 3. Server APIs (`iolanthe-server`)

All endpoints sit under `/api/admin/`. All writes use `requireAdmin(..., { section: "charter", bridgeOnly: true,
department: "charter" })`.

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/admin/routes` | — | `{routes:[...]}` (with points; the file is small) |
| POST | `/api/admin/routes/save` | `{route, base_revision}` | saved route; 409 on a revision clash; new `id` when `id` is blank |
| POST | `/api/admin/routes/delete` | `{id}` | `{ok:true}`. Charter copies are unaffected. |
| GET | `/api/admin/anchorages` | — | `{anchorages:[...]}` |
| POST | `/api/admin/anchorages/save` | whole library | saved library (same pattern as `sites/save`) |
| POST | `/api/admin/charter/<id>/assign-route` | `{plan, route_id}` | updated planned-route store. Refused (409) if the charter's end date has passed. |
| POST | `/api/admin/charter/<id>/unassign-route` | `{plan}` | clears that plan. Same refusal rule. |

`/api/admin/charter/<id>/upload-route` is removed in phase 4, once the planner import replaces it.

Joining routes (D10), simplifying, and KML/GPX import and export all run in the browser, so they need no endpoints.
A joined route is saved through `routes/save` like any other.

Validation: points must hold valid lat/lon. A saved route must have at least 2 points. The name is required and is
not unique-checked. The id is.

---

## 4. Admin UI (`iolanthe-admin`)

### 4.1 Charter → **Routes** panel (replaces "Route Upload")

The layout is the map on the right, about 70% of the width, with a side panel on the left. On desktop the side
panel is exactly as tall as the map, so its bottom edge lines up with the map's.

On narrow screens everything stacks in one column: the route picker, then the map, then the rest of the side panel.
This differs from draft 1, which put the whole side panel above the map; see §7, Q1.

**Header actions** (top right, house convention, all square icon buttons):
- **Save** (green) and **Cancel** (red, which discards changes).
- **Undo** and **Redo**, which are also Ctrl+Z and Ctrl+Y / Ctrl+Shift+Z. History covers route edits only. Saved
  anchorages and sites aren't undone.
- Then **New**, **Save As**, **Add another route** (D10), **Import**, **Export** and **Delete**.

**Side panel**, top to bottom:
- **Route picker**: library routes with name, length and last updated. Below them, a group of **Charter copies**
  (read-only).
- **Name** and **Description**.
- **Stats** as three shaded tiles: total **nm**, number of **stops**, and **h:mm** at the planning speed. There is no
  point count (D9).
- A **tabbed box** with two tabs, **Stops** and **Legs**, each showing its count. The box takes the remaining
  height and scrolls inside, so its bottom stays level with the map's. On narrow screens it's capped at about 70% of
  the screen height.
  - **Stops tab**: one card per stop in route order. Each card has a blue numbered dot, the name, the anchorage
    depth, any "anchorage moved / deleted" warning, and chips for the sites it serves. Clicking a card pans to the
    stop and opens its popup. This is the list the itinerary can be built from by hand later.
  - **Legs tab**: a **planning speed (kn)** field, remembered per browser and not saved with the route. Below it,
    one card per **stop-to-stop leg**, styled like the stop cards: a blue numbered dot, "From → To", then distance
    (nm) and time (h:mm, when a speed is set). There's no bearing column. If the route doesn't start or end at a
    stop, its first and last points count as **Start** / **End**. A **Total** card follows the legs. Clicking a leg
    zooms the map to it.
- A small meta line: revision, last updated, source, and an "unsaved changes" flag.

**Map toolbar (modes)**

| Mode | Tap on map | Tap on route point | Tap on anchorage | Tap on site |
|---|---|---|---|---|
| **Select** (default) | — | point popup | edit anchorage | edit site (existing Site modal) |
| **Add** | add point at end | — | add as **stop** at end (links sites within 2 nm) | add as waypoint at end |
| **Delete** | — | delete point | — | — |
| **Anchorage** | new anchorage here (modal) | — | edit anchorage | — |

- Points are **draggable in every mode except Delete**. Map panning is paused while a point is held.
- **Snap to anchorage**: a point dropped within 24 px of an anchorage marker becomes a **stop** at that anchorage.
  It takes the anchorage's position and name and links the sites within 2 nm. Dragging a stop away elsewhere keeps
  its anchorage link and shows the "moved" warning.
- **Insert**: each leg shows a faint midpoint handle. Dragging it creates a new point there.
- Point popup: the heading is "Stop *n* · *name*", or "Waypoint" (with its name if it has one). Below it are the
  position and the anchorage depth. Point numbers are not shown (D9). Actions:
  - **Make stop at *anchorage*** (waypoints only): one button per anchorage within 2 nm, nearest first, with its
    distance. It does the same as snapping.
  - **Name** (optional label)
  - **Sites served** (stops only): tick sites from a distance-sorted list (D8)
  - **Make anchorage**: opens the anchorage modal with lat/lon filled in. On save the point becomes a stop.
  - **Make site**: opens the existing Add Site modal with lat/lon filled in.
  - **Delete**
- Styling:
  - Waypoints are small white dots. Stops are larger blue markers, numbered in route order, with a small "!"
    badge when their anchorage has moved or been deleted.
  - Anchorages not used by the route are dimmed anchor markers. Sites use the existing site pin style.
- **Layers** control: Sites, Anchorages, Imported pins, and an optional OpenSeaMap seamarks overlay (phase 5).

**Modals** follow the house rules: green save and red cancel top right, and clicking outside cancels.
- The **anchorage modal** has name, latitude/longitude (with the PR #1 map picker), depth (m), notes, and Delete.
- The **site modal** is the existing Site Editor modal, reused as it is.

**Unsaved changes** use the existing `confirmDiscardPageChanges` guard. Leaving with unpromoted imported pins also
warns.

### 4.2 Import (KML / GPX), done in the browser

- Accepted files are `.kml` and `.gpx`.
- **Lines** come from KML `LineString` and GPX `rte`/`trk`.
  - If there are several, the user picks one or joins them in file order.
  - A **Simplify** slider (tolerance 0–200 m) shows the resulting point count live and defaults to what keeps the
    count under about 60.
  - If the open route already has points, the user chooses **Replace** or **Append**.
- **Pins** come from KML `Point` placemarks and GPX `wpt`. They appear as temporary orange markers.
  - Pin popup actions: Add to route, Make anchorage, Make site, Delete.
  - Pins near an existing site or anchorage (same name, or within 2 nm, reusing PR #2's matching) are flagged
    "near *X*".
  - Pins are never saved.
- The PR #2/#3 pin import modal and compare map are retired.

### 4.3 Export

- **GPX 1.1**: one `<rte>` with `<rtept>` for every point. Stops and named points carry `<name>`, so plotters show
  them as named waypoints. Stops are also written as `<wpt>`.
- **KML**: one `LineString` placemark plus a `Point` placemark per stop.
- The file name is `<route-id>.gpx` / `.kml`. The download is generated in the browser.

### 4.4 Add another route (D10)

- The header's **Add another route** button opens a modal with these fields:
  - **Route to add**: library routes, plus charter copies once phase 4 is in.
  - **Where**: after the end of this route, or before its start.
  - **Direction**: as saved, or reversed.
- A preview line gives the joined length and stop count. It also gives the gap that becomes a straight leg, or says
  the join is seamless.
- If the two routes meet at the same anchorage, or within 50 m, the duplicate point is dropped.
- The join is one undoable edit. The source route isn't changed. After joining a saved route, the modal suggests
  **Save As** to keep the original.
- The scenario it covers: open route A (or New), add route B, then Save As "A + B".

### 4.5 Itinerary page: route assignment

- Each plan (Primary / Alternative) gets a **Route** row under the plan buttons. It shows:
  - the assigned route's name, length and assigned date
  - a picker of library routes, an **Open in planner** link, and **Unassign**
- If the library route's `revision` is newer than the copy, it shows *"Edited since assigned"* with **Update** and
  **Keep**.
- After the end date, the row is read-only: no picker, no Update, no Unassign.
- The existing "Guests are using the Alternative itinerary but no Alternative route…" notice moves here.

### 4.6 Small related change

Settings → **Route Track** is renamed **Track Logging**, to avoid confusion with "Routes".

---

## 5. Phases (each one ships on its own via main)

| Phase | Server | Admin |
|---|---|---|
| 1 | routes + anchorages storage and APIs, migration | Routes panel: route picker, map editing (add/insert/move/delete), header Undo/Redo, name/description, stats tiles, Stops / Legs tabbed box with stop-to-stop leg cards, Save / Save As / Delete, Add another route (library routes). Route Upload stays alongside for now. |
| 2 | — | Overlays: sites (click to edit, add as waypoint, point → Make site) and anchorages (add/edit/move/delete, stops, "Make stop at", snap-to-anchorage, moved warnings) |
| 3 | — | KML/GPX import (Simplify, temporary pins) and export. Remove the old upload panel and pin modal. |
| 4 | assign / unassign, remove `upload-route` | Itinerary route rows, "edited since assigned", read-only after charter end; charter copies in the picker and in Add another route |
| 5 | — | OpenSeaMap overlay, vendored Leaflet, Track Logging rename |

The planner code goes in a new `admin/routes.js`, loaded after `admin.js`, to keep `admin.js` from growing further.
It needs a small hook from `admin.js` (`renderRoutesPanel` / `bindRoutesPanel`). Each phase bumps the admin CSS/JS
version strings.

---

## 6. Out of scope (for now)

- Day legs or a link between route points and itinerary days. Stop → site associations are the natural bridge
  for later, e.g. "fill the itinerary from this route's stops".
- Showing stops or anchorages to guests or crew.
- Offline map tiles.
- Multi-line routes.

---

## 7. Open questions

| # | Question | Mockup today |
|---|---|---|
| Q1 | On narrow screens, should the map come straight after the route picker (as in the mockup), or after the whole side panel (draft 1)? | Map after the picker |
| Q2 | Should a charter copy (§2.3) keep its stops, as an additive `stops: [{name, latitude, longitude, anchorage_id, site_ids}]` per route? The guest app ignores unknown fields. Without it, opening or joining a copy loses the stops. | Coordinates only |
| Q3 | When a point is snapped onto an anchorage that is already the next or previous stop, should it merge, be blocked, or create a second stop? | Creates a second stop |
| Q4 | Confirm the default distances: auto-link sites within 2 nm, "Make stop at" within 2 nm, the sites-served picker highlights within 5 nm, snapping within 24 px. | As listed |
| Q5 | Confirm that planning speed stays per browser and is not saved with the route. | Per browser |
