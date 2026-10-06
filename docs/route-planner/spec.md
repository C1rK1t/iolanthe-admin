# Route Planner — spec (draft 1)

Status: draft for review, 2026-10-06. Follows [brainstorm.md](brainstorm.md). The clickable mockup is
[planner-mockup.html](planner-mockup.html).

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

Validation: points must hold valid lat/lon. A saved route must have at least 2 points. The name is required and is
not unique-checked. The id is.

---

## 4. Admin UI (`iolanthe-admin`)

### 4.1 Charter → **Routes** panel (replaces "Route Upload")

The layout is the map on the right, about 70% of the width. A side panel sits on the left and stacks above the map
on narrow screens.

**Side panel**
- **Route picker**: a library list with name, length and last updated. Below it a collapsed group of **Charter
  copies** (read-only).
- **Details**: name, description, total length in **nm**, point count, stop count.
- **Stops list**: each stop with its associated sites underneath. This is the list the itinerary can be built
  from by hand later.
- **Leg table**: from → to, distance (nm), bearing (°T). An optional **planning speed (kn)** adds a time column. The
  speed is remembered per browser and not saved with the route.
- Header actions, top right, following the house convention:
  - **Save** (green) and **Cancel** (red, which discards changes).
  - Then New, Save As, Import, Export and Delete as secondary icons.

**Map toolbar (modes)**

| Mode | Tap on map | Tap on route point | Tap on anchorage | Tap on site |
|---|---|---|---|---|
| **Select** (default) | — | point popup | edit anchorage | edit site (existing Site modal) |
| **Add** | add point at end | — | add as **stop** at end | add as waypoint at end |
| **Delete** | — | delete point | — | — |
| **Anchorage** | new anchorage here (modal) | — | edit anchorage | — |

- Points are **draggable in every mode except Delete**. Map panning is paused while a point is held.
- **Insert**: each leg shows a faint midpoint handle. Dragging it creates a new point there.
- **Undo / Redo** buttons plus Ctrl+Z / Ctrl+Y. The history covers route edits only. Saved anchorages and sites
  aren't undone.
- Point popup actions:
  - **Name** (optional label)
  - **Sites served** (stops only): tick sites from a distance-sorted list (D8)
  - **Make anchorage**: opens the anchorage modal with lat/lon filled in. On save the point becomes a stop.
  - **Make site**: opens the existing Add Site modal with lat/lon filled in.
  - **Delete**
- Styling:
  - Waypoints are small white dots. Stops are larger anchor markers, numbered in route order.
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

### 4.4 Itinerary page: route assignment

- Each plan (Primary / Alternative) gets a **Route** row under the plan buttons. It shows:
  - the assigned route's name, length and assigned date
  - a picker of library routes, an **Open in planner** link, and **Unassign**
- If the library route's `revision` is newer than the copy, it shows *"Edited since assigned"* with **Update** and
  **Keep**.
- After the end date, the row is read-only: no picker, no Update, no Unassign.
- The existing "Guests are using the Alternative itinerary but no Alternative route…" notice moves here.

### 4.5 Small related change

Settings → **Route Track** is renamed **Track Logging**, to avoid confusion with "Routes".

---

## 5. Phases (each one ships on its own via main)

| Phase | Server | Admin |
|---|---|---|
| 1 | routes + anchorages storage and APIs, migration | Routes panel: route list, map editing (add/insert/move/delete, undo), details and leg table, Save / Save As / Delete. Route Upload stays alongside for now. |
| 2 | — | Overlays: sites (click to edit, add as waypoint, point → Make site) and anchorages (add/edit/move/delete, stops) |
| 3 | — | KML/GPX import (Simplify, temporary pins) and export. Remove the old upload panel and pin modal. |
| 4 | assign / unassign, remove `upload-route` | Itinerary route rows, "edited since assigned", read-only after charter end |
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
