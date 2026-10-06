# Route Planner — handoff

Handoff from the Claude project thread to a desktop session, 2026-10-06. The work is at the end of brainstorming
and spec. **No code has been written yet.**

| File | What it is |
|---|---|
| [brainstorm.md](brainstorm.md) | Review of the existing code, risks, alternatives, and both rounds of David's answers |
| [spec.md](spec.md) | Draft 1 spec: data files, server APIs, admin UI, phases. **Start here.** |
| [planner-mockup.html](planner-mockup.html) | Self-contained clickable mockup with demo Coron data. Open it in a browser with internet (Leaflet from unpkg, Esri tiles). It includes a built-in sample KML (Import → "Use a sample KML"). |

## Background

The captain asked to plan routes inside the admin pages instead of uploading KML from elsewhere. The proposal
renames Charter → "Route Upload" to **Routes**, a map-based planner. Routes are kept in a library and assigned to
charters from the Itinerary page.

## Decisions so far (David, 2026-10-06)

1. **Copy on assign.** Routes live in `library/routes.json`. Assigning one to a charter's Primary or Alternative
   plan copies it into `charters/<id>/planned-route.json` in today's format. Library edits never change a charter.
   If the library route changes later, the Itinerary page offers Update / Keep. Charters past their end date are
   read-only.
2. **One continuous line per route.** The itinerary stays separate, with no day legs for now.
3. **Anchorages** (`library/anchorages.json`: name, depth, notes) are a planner-only layer.
   - A route point placed on an anchorage is a **stop**.
   - Stops are **not** shown to guests, who get their information from the site-based itinerary.
4. **Sites are rarely stops.** They're often a tender ride away, so **a stop can be associated with the sites it
   serves** (`site_ids` on the stop).
5. **Import and export KML and GPX.** Imported pins are temporary until promoted to an anchorage or a site.
6. Planning is **Charter Admin on the bridge VLAN only**, the same as Route Upload today.
7. Existing charter routes are **imported into the library once** (server migration).
8. Moving an anchorage leaves saved stops where they are and shows a "moved" warning.
9. **No guest or crew app changes.** The guest app keeps reading `/api/planned-route` unchanged.

## Open items

- **Captain review** of the spec and mockup has not happened yet.
- **The mockup was rebuilt on 2026-10-06** in the desktop session, because the Claude Projects version didn't work
  there. It was tested with live Esri tiles at 1280 px and 390 px, with no console errors. To run it locally, use
  the `route-planner-mockup` entry in the workspace `.claude/launch.json` (a Python static server on port 8766), or
  open the file in any browser that has internet access.
  - On phones it puts the map straight after the route picker, which differs from spec §4.1 ("side panel stacks
    above the map").
  - It shows a gap in the spec: a charter copy (§2.3) keeps coordinates only, so stops and names are lost when you
    open a charter copy in the planner. Decide whether to add an additive `stops` field to the copy.
- Small choices made by default, so confirm them:
  - Anchorages added as stops auto-link sites within 2 nm.
  - The "sites served" picker highlights sites within 5 nm.
  - Planning speed is per browser and isn't saved.
  - Settings → "Route Track" gets renamed to "Track Logging".
- Optional extras for phase 5: OpenSeaMap seamark overlay, vendored Leaflet (the admin currently needs internet
  for Leaflet and tiles).

## Mockup review round 1 (David, 2026-10-06), now applied to the mockup

1. Point counts and numbers aren't useful, so they're no longer shown: no "points" stat and no "Point 41 of 95" or
   "WP41" labels. The stats are now nm, stops, and h:mm at the planning speed.
2. The leg table runs **stop to stop** (nm and h:mm; no bearings). The first and last points count as Start / End
   when they aren't stops.
3. A waypoint becomes a stop at an anchorage in two ways:
   - the waypoint popup offers **Make stop at <anchorage>** for anchorages within 2 nm
   - **dragging** a point onto an anchorage marker (within 24 px) snaps it there as a stop
4. **Undo / Redo** are square icon buttons in the header row, next to Save / Cancel. Ctrl+Z / Ctrl+Y still work.
5. **Add another route** (the join icon in the header) appends or prepends a library route or a charter copy, with
   an option to reverse it. A duplicate point where the two routes meet is dropped. Then use Save As to keep the
   originals. Spec §3/§4.1 need this added: it's browser-only, so there's no new API.

**Style rollout:** David wants the mockup's visual style used across the **whole Admin site**. That means the square
icon buttons (green save / red cancel, grey secondary, separators), the shaded stat tiles and panels, the button
styles, the type and the uppercase field labels. Plan it as its own piece of work after the Routes phases, or
alongside them. Start by turning the mockup's CSS (`:root` tokens, `.icon-btn`, `.stat`, `.banner`, `.field`,
`.text-btn`, `.seg`, modal card) into shared `admin.css` classes.

## Next step: phase 1

From spec §5:
- **iolanthe-server**:
  - `library/routes.json` and `library/anchorages.json` storage
  - `GET/POST /api/admin/routes[/save|/delete]` and `GET/POST /api/admin/anchorages[/save]`, with bridge-only
    Charter Admin on writes and a revision check (409) on route save
  - the one-off migration of existing `planned-route.json` routes into the library
- **iolanthe-admin**:
  - a new `routes.js` loaded after `admin.js`, with a hook in `admin.js` for a **Routes** panel
  - the panel: route list, map editing (add / insert via midpoint / move / delete, undo/redo), name, description,
    live length and leg table, Save / Save As / Delete
  - "Route Upload" stays alongside until phase 3

## Release process and conventions

- **Merging to `main` releases it.** A scheduled job on the docker VM (10.33.2.241, login `dev`) pulls the repos
  from GitHub. Admin lives at `/opt/projects/vessel/iolanthe-admin` and is bind-mounted, so static files need no
  restart.
  - Not yet verified: `iolanthe-server` runs `server.js` in a container. Server changes will probably need
    `docker compose up -d --build iolanthe-server` (or a restart) after the pull. Check that before relying on it.
- **Bump the CSS/JS version strings** in `index.html` whenever `admin.css` / `admin.js` (or the new `routes.js`)
  change, so browsers pick up the new code.
- **Popups and forms**: green save and red cancel icon buttons top right. Clicking outside the popup cancels.
- No build step, no npm, no dependencies. All API calls are relative URLs. Asset paths are prefixed `/admin/`.
- David is fine merging straight to `main` for previews when no guests are onboard.
- Live admin: `http://10.33.2.241/admin/?key=hotel` (boat LAN only).
