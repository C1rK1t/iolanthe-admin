# Route Planner — brainstorm notes

Status: brainstorming, no code yet. Written 2026-10-06 from David's proposal (captain's request) and a read of
`iolanthe-admin`, `iolanthe-guest`, `iolanthe-crew` and `iolanthe-server` on `main`.

---

## 0. Decisions so far (David, 2026-10-06)

1. **Preservation:** copy on assign (§3). Library routes are editable. A charter keeps a frozen copy.
2. **Shape:** one continuous line per route for now. The itinerary stays separate (no day legs yet).
3. **Anchorages:** a planner-only layer. Choosing an anchorage as a route point makes it a **stop** on that route,
   and stops are displayed with the route. **Sites are rarely stops.** A dive or POI is often a tender ride from
   where the boat is, so sites stay as an overlay for reference and editing. They aren't the main source of stops.
4. **Import and export KML and GPX**, both directions.
5. **`iolanthe-server`** is in the project's repos.

Consequences for the design:
- A route point is either a plain **waypoint** or an **anchorage stop** (it holds `anchorage_id` plus a copy of
  its name and position at the time). A site can still be snapped to as a waypoint, but it's not treated as a stop.
- "Point → Add Site" stays as a convenience, but most stops come from anchorages.
- To display stops with the route, `planned-route.json` gains an additive `stops: [{name, latitude, longitude}]`
  per route. Old readers ignore it. The guest map then draws named stop markers, which is a small guest change.
- Import: KML/GPX lines become waypoints, and pins/waypoints become temporary pins you can promote to an anchorage
  or a site. Export: the route as a GPX route/track with stops as named waypoints, and the same as KML.

---

## 1. What exists today (the facts the plan has to fit)

| Piece | Where | Notes |
|---|---|---|
| Route Upload panel | `admin.js` `renderRouteUploadPanel` / `uploadRoute` (~5306, ~7981) | Charter Admin on the bridge VLAN only. Picks Primary or Alternative, posts the KML. Then runs the KML pin import modal (PRs #2/#3). |
| KML → route conversion | **server**, `server.js` `parseKmlRoute` (~4949) | Only `LineString`s are kept. Each becomes `{name, description, coordinates:[{latitude, longitude, altitude}]}`. |
| Stored route | `charters/<id>/planned-route.json` | `{ route: { primary: {source, routes[]}, alternative: {source, routes[]} }, source, routes }` (top-level copy of primary for legacy readers). One file per charter; there is **no route library**. |
| Who reads it | Guest app only (`/api/planned-route`, guest.js ~2940–3200) | Server picks primary/alternative from today's `itinerary.active_plan_by_day`, falls back to primary. Crew app does **not** draw the planned route (only `/api/track`). |
| Sites | `library/sites.json` | `{id (slug), title, latitude, longitude, description, images, media, tags}`. Itinerary days/stops reference sites by `site_id`. |
| Itinerary | `charters/<id>/itinerary.json` | Primary + Alternative plans, `active_plan_by_day` decides what guests see. |
| "Completed" charter | `activeCharterDateStatus` (admin.js ~4890) | **Derived from end_date**, not a stored state. Nothing happens at completion time. |
| Charter delete | server `deleteAdminCharter` | `rmSync` of the whole charter folder, including its route. |
| Map stack | admin.js `loadLeaflet` (~5564) | Leaflet from unpkg + Esri satellite tiles, both over the internet. Admin has **no service worker**. |

Server work is unavoidable: there's no route library or anchorage store today. `iolanthe-server` is now in the
project's repos.

---

## 2. Comments on the proposal

Overall the proposal is sound and fits the existing code well. The big win is that sites, anchorages and the route
all live on one map. Section by section:

**Rename "Route Upload" → "Routes".** Agreed. Watch the clash with the existing **Settings → Route Track** panel. It is
unrelated (it handles the live GPS track), and people will mix the two up. Suggest renaming it "Track Logging".

**Click to add, delete, move, insert, extend.** Use explicit **modes** on a small toolbar (Add to end / Insert /
Move / Delete) rather than overloading clicks. On an iPad, a tap can't do "add point", "select", and "pan" all at
once. Insert works best with the usual "ghost midpoint" handle on each leg: drag it to make a new point. Add
**Undo / Redo** (Ctrl+Z plus buttons). It's cheap and essential when one stray tap adds a point.

**Sites overlaid and selectable as points.** When a site is used as a point, store the site's `id` with it, plus the
coordinates. Then the leg table can show names and an export can label waypoints. Open question: if the site is
later moved, should the route point move too? Suggest no, with a "site has moved" hint.

**Point → Site via the Add Site modal, clicking a site edits it.** Agreed. This reuses the Site Editor modal and the
map picker shipped in PR #1. Clicking a site needs to choose between "edit site" and "use as route point". Suggest
that in Add/Insert mode a click on a site uses it as a point, and in any other mode it opens the editor.

**Anchorages (independent, always shown, name/depth/notes).** Agreed, as a new `library/anchorages.json`. Two fields
worth adding while we're there: **holding/seabed** (sand, coral, mud) and **sheltered from** (wind directions).
Those are what a captain picks an anchorage on. Decide if guests/crew ever see them (see questions).

**Name/description panel with live length.** Agreed. Show **nautical miles** total plus a **leg table** (from → to,
distance, bearing). Optionally add a **planning speed** (e.g. 8 kn) to get hours per leg. That turns "where" into "how
many days", which is what the itinerary needs.

**Upload reduced to "import KML into the planner".** Agreed. Notes:
- This retires the pin-import modal and compare map from PRs #2/#3. The planner map itself shows the pins next to
  existing sites. The match logic (same name / within 2 nm) is still useful to flag pins that duplicate a site.
- KML `LineString`s from Google Earth/Navionics can have hundreds of vertices. Hundreds of drag handles is unusable,
  so offer **Simplify** (Douglas-Peucker, tolerance in metres) at import.
- KML parsing moves to the browser (admin already parses pins client-side). The server upload endpoint can then go.
- "Unpromoted pins don't persist": warn on leaving the planner if there are unpromoted pins.

**Recall / edit / delete / Save As.** Agreed. See §3 for how this ties into preservation.

**Completed-charter routes preserved, maybe copy and lock on completion.** This is the one place I'd suggest a
different mechanism (§3). "On completion" has no trigger today because completion is just a date comparison.

**Primary/Alternative route designation moves to Itinerary.** Agreed. It belongs there, next to the Primary/Alternative
itinerary switch that already decides what guests see.

---

## 3. Suggested alternative: copy on assign, not lock on completion

- **Route library** (`library/routes/<route-id>.json` or one `library/routes.json`): editable, deletable, Save As.
- **Assigning** a route to a charter's Primary or Alternative (on the Itinerary page) **copies** it into that charter's
  `planned-route.json`, in exactly today's format. The copy is tagged `source: {type: "library", route_id, route_name,
  assigned_at, revision}`.
- The charter therefore always owns a frozen copy. Editing or deleting the library route can never alter a past
  charter. Nothing needs to happen "on completion".
- When the library route has changed since assignment, the Itinerary page shows *"Route has been edited since it was
  assigned"* with **Update** / **Keep**. Charters whose end date has passed are read-only (no Update, no re-assign).
- "Load a previous charter's route" = open the charter's copy in the planner. Saving forces Save As into the
  library. That matches the rule "must be saved as a new route if changed".

Why it's better:
- **Zero changes to the guest app or `/api/planned-route`.** The guest file format is untouched.
- No background job, and nothing to lock.
- It survives deleting the library route.

The cost is that an update made after assignment isn't automatic. That's arguably right mid-charter, because it avoids
silently changing what guests see.

---

## 4. Risks and gaps

1. **Needs the internet.** Leaflet loads from unpkg and Esri tiles stream live. If the boat's connection drops, the
   planner is blank. Mitigations: vendor Leaflet into `admin/vendor/` (like guest's `hls.min.js`). Tile caching for an
   offline area is possible but a bigger job.
2. **Satellite imagery is not a chart.** There's no depth, reefs or nav marks. Suggest an optional **OpenSeaMap
   seamark overlay** (free tile layer). Also a clear "not for navigation" note, plus **GPX/KML export** so the real
   passage plan is done in the chartplotter. The captain will probably want the route on the plotter anyway.
3. **Server scope.** New endpoints are needed: routes CRUD, anchorages CRUD, and assign-to-charter. The server repo
   isn't in the project yet.
4. **Migration.** Existing charters' `planned-route.json` keep working as they are. Optionally do a one-off "import
   existing charter routes into the library" so they appear in Routes.
5. **Multiple lines per plan.** Today's format allows several lines per plan (one per KML LineString). The planner
   should handle one route = one line. On import, either let the user pick a line or join them in order.
6. **Concurrent edits.** Two people editing the same route means the last save wins. Low risk on this boat, but a
   cheap fix is a revision number checked on save ("someone else saved this route, reload?").
7. **Permissions.** Upload is Charter Admin on the bridge VLAN only. Keep the same for the planner unless told
   otherwise.
8. **Size of the change.** admin.js is already ~15.6k lines. The planner is easily 1.5–2.5k more. It's worth putting
   it in its own `routes.js` file (still no build step) to keep it reviewable.
9. **Touch/tablet.** Drag handles need ≥ 32 px hit areas, and Move mode must disable map dragging while a point is
   held.

---

## 5. Enhancements worth considering

- **GPX/KML export** of a route, with waypoints named after sites and anchorages, for the chartplotter.
- **Leg table with ETA** at a planning speed, with day breaks you can mark on points. This feeds the itinerary.
- **Snap** to sites and anchorages within a few pixels while adding points.
- **Layer toggles and legend**: Sites / Anchorages / Imported pins / Other charters' routes (faint, for reference).
- **Measure tool** (temporary ruler) that doesn't change the route.
- **Show anchorages on the crew Navigation map.** Crew already has a Leaflet map. Crew/bridge only, never guests.
- **Route thumbnail** in the route list, to make picking easier.

---

## 6. Suggested phasing (each phase shippable on its own)

1. **Server**: route library and anchorage storage plus APIs. **Admin**: Routes panel with the planner map (add,
   insert, move, delete, undo), name/description/length, Save / Save As / Delete, route list.
2. Overlays: sites (use as point, click to edit, point → Add Site with lat/lon filled in) and anchorages
   (add/edit/move/delete).
3. KML import into the planner (lines with Simplify, pins as temporary markers, promote to site). Retire the old
   upload and pin modal.
4. Itinerary: Primary/Alternative route pickers, copy-on-assign, "edited since assigned" banner, read-only for past
   charters. Remove the old Route Upload server endpoint.
5. Extras: GPX export, OpenSeaMap overlay, ETA/day breaks, vendored Leaflet.

---

## 7. Second round (answered)

1. Stops on the guest map: **no**. Guests use the site-based itinerary.
2. Planning is **bridge only** (Charter Admin).
3. Existing charter routes **are imported** into the library.
4. Moving an anchorage a route uses: the stop **stays put, with a warning** (my default, adopted in the spec).

Next: [spec.md](spec.md) and [planner-mockup.html](planner-mockup.html).
