# Route Planner — handoff

Last updated 2026-10-07, as of `main` at `274633d`. The brainstorm and spec (draft 2) are done. The captain has
reviewed the mockup and is positive, and his changes are applied. **No product code has been written yet.** Next:
**phase 1**. Nothing blocks it.

| File | What it is |
|---|---|
| [brainstorm.md](brainstorm.md) | Review of the existing code, risks, alternatives, and both rounds of David's answers |
| [spec.md](spec.md) | Draft 2 spec (2026-10-07): data files, server APIs, admin UI, phases, open questions (§7). **Start here.** |
| [planner-mockup.html](planner-mockup.html) | Self-contained clickable mockup with demo Coron data, kept in step with the review feedback below |
| [../BACKLOG.md](../BACKLOG.md) | Admin backlog: fuel estimation and the client itinerary report (Itinerary page), and the style rollout |

## Mockup: where to see it

- **Captain's link (boat LAN):** http://10.33.2.241/admin/docs/route-planner/planner-mockup.html
  - The admin server serves `/admin/*` files without the URL key.
  - It needs internet for Leaflet (unpkg) and the Esri satellite tiles.
  - It updates when the docker VM's scheduled job pulls `main`. To update it now, run `git pull` in
    `/opt/projects/vessel/iolanthe-admin`; no restart is needed. Claude has no SSH key for `dev@10.33.2.241`.
- **Locally:** start `route-planner-mockup` from the workspace-root `.claude/launch.json` (a Python static server on
  port 8766), or open the file in any browser that has internet access.
- **Not a claude.ai artifact.** The artifact viewer blocks external map tiles and downloads, so the satellite map
  and Export wouldn't work there.
- **Demo helpers:**
  - the yellow bar has "Simulate another user saving" (shows the 409 clash) and "Reset demo"
  - Import → "Use a sample KML"
  - Itinerary in the left menu shows the route assignment rows

Commits:
- `06f12cf`: brainstorm, spec, first mockup
- `831e8d7`: rebuild and review round 1
- `076ed59`: captain's first look
- `ad660fb`: handoff refresh
- `59d27d4`: spec draft 2
- `274633d`: per-leg and route speeds, backlog

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

## Mockup feedback, all applied

**David, review round 1** (`831e8d7`):
1. Point counts and numbers aren't shown: no "points" stat and no "Point 41 of 95" or "WP41" labels. The stats are
   nm, stops, and h:mm at the planning speed.
2. Legs run **stop to stop** (nm and h:mm; no bearings). The first and last points count as Start / End when they
   aren't stops.
3. A waypoint becomes a stop at an anchorage in two ways:
   - the waypoint popup offers **Make stop at <anchorage>** for anchorages within 2 nm
   - **dragging** a point onto an anchorage marker (within 24 px) snaps it there as a stop
4. **Undo / Redo** are square icon buttons in the header row, next to Save / Cancel. Ctrl+Z / Ctrl+Y still work.
5. **Add another route** (the join icon in the header) appends or prepends a library route or a charter copy, with
   an option to reverse it. A duplicate point where the two routes meet is dropped. Then use Save As to keep the
   originals.

**Captain's first look** (`076ed59`):
- **Stops and Legs share one tabbed box** with counts on the tabs. On desktop it fills the side panel, ends level
  with the bottom of the map, and scrolls inside. On phones it's capped at 70% of the screen height.
- **Legs are cards like the stops**: a blue numbered dot, "From → To", then nm and h:mm. A Total card sits at the
  end. Clicking a leg zooms the map to it.

**Captain's full review** (2026-10-07): positive. One concrete change, now applied to the mockup and spec:
- **Per-leg speed.** Each leg card has a "Route speed (*n* kn)" tickbox, ticked by default. Unticking it lets the
  leg have its own speed, starting at the route speed. Re-ticking it resets the leg to the route speed. The leg's
  speed is stored on the stop the leg starts from (`leg_speed_kn`) and saved with the route. In the demo, Lusong →
  Black Island runs at 6 kn.
- **The route speed is saved with the route** (`speed_kn`). David decided this on 2026-10-07, which closes spec Q5.
  New routes start at the last speed used in that browser.
- Two more captain requests belong on the **Itinerary** page and are logged in [../BACKLOG.md](../BACKLOG.md): fuel
  estimation, and a client itinerary report with a route overview.

## Spec status

All the feedback above is folded into [spec.md](spec.md) **draft 2** (2026-10-07). That draft adds:
- decisions D9 (stops and legs, not points) and D10 (joining routes)
- the rewritten §4.1 side panel, header actions, snapping and popup
- §4.4 Add another route
- the updated phase table
- per-leg speeds (§4.1) and the `speed_kn` / `leg_speed_kn` fields (§2.1)
- a pointer from §6 to the backlog

Spec §7 lists the decided questions:
- Q1: map after the picker on narrow screens
- Q4: default distances stand
- Q5: route speed saved with the route

Two questions are still open, and neither blocks phase 1:
- Q2: should charter copies keep their stops? Needed by phase 4.
- Q3: duplicate stop on snap. Needed by phase 2.

## Open items

- **Spec §7 Q2 and Q3** still need answers, before phase 4 and phase 2 respectively.
- Settings → "Route Track" gets renamed to "Track Logging" (phase 5). Confirm the name.
- Optional extras for phase 5: OpenSeaMap seamark overlay, vendored Leaflet (the admin currently needs internet
  for Leaflet and tiles).

## Style rollout (separate piece of work)

David wants the mockup's visual style used across the **whole Admin site**. That means the square icon buttons
(green save / red cancel, grey secondary, separators), the shaded stat tiles and panels, the tabbed box and cards,
the button styles, the type and the uppercase field labels. Do it after the Routes phases or alongside them. Start
by turning the mockup's CSS (`:root` tokens, `.icon-btn`, `.stat`, `.banner`, `.field`, `.text-btn`, `.seg`,
`.tabbox`, `.stop-item`, modal card) into shared `admin.css` classes.

## Phase 1 progress

- **Plan A (server) is done and merged** to `iolanthe-server` `main` at `2ac4b8d` (2026-10-07). The plan is
  `iolanthe-server/docs/superpowers/plans/2026-10-07-route-library-server.md`.
  - What it added:
    - `lib/route-library.js`, with 22 unit tests (`npm test`)
    - the endpoints `GET /api/admin/routes`, `POST routes/save` (`{route, base_revision}`, 409 on a clash, 404 if the
      route was deleted), `POST routes/delete`, `GET /api/admin/anchorages` and `POST anchorages/save`
    - migration v3, which imports the charter routes
  - It was verified by unit tests, a smoke test on throwaway data, and a logged-in browser check of every endpoint.
  - **Not yet live on the boat.** After the VM pulls, run
    `cd /opt/projects/vessel && docker compose up -d --build iolanthe-server`. Confirm that the log shows
    `Route library: imported N charter route(s).` and record N here.
- **Next: Plan B (admin Routes panel).** It hasn't been written yet. Findings from planning it:
  - admin.js exposes nothing on `window`. Plan B must add a small `window.IolantheAdmin` with `api`, `setStatus`,
    `showAdminConfirm`, `setPageUnsavedGuard`, `loadLeaflet`, `iconButtonHtml`, the escape helpers and so on.
  - Add a `routes` entry to the panels array in `renderCharter()`. It then hooks into `charterPanelContent` and
    `bindCharterPanel`.
  - There's no toast in the admin; use `setStatus`. Route Upload is only gated when it saves, not hidden.
  - Pure logic (legs, distances, joining) can go in a `routes-core.js` that is unit-tested with `node --test`.

## Next step: phase 1

From spec §5:
- **iolanthe-server** (`iolanthe/iolanthe-server` in the workspace):
  - `library/routes.json` and `library/anchorages.json` storage
  - `GET/POST /api/admin/routes[/save|/delete]` and `GET/POST /api/admin/anchorages[/save]`, with bridge-only
    Charter Admin on writes and a revision check (409) on route save
  - the one-off migration of existing `planned-route.json` routes into the library
- **iolanthe-admin**:
  - a new `routes.js` loaded after `admin.js`, with a hook in `admin.js` for a **Routes** panel
  - the panel: route list, map editing (add / insert via midpoint / move / delete, undo/redo), name, description,
    stats, Stops / Legs tabs, Save / Save As / Delete
  - "Route Upload" stays alongside until phase 3
- The mockup's JS is a working reference for the editing logic: undo history, midpoint insert, snapping,
  stop-to-stop legs, Douglas-Peucker simplify, KML/GPX parsing and export, and joining.

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
- David is fine merging straight to `main` for previews when no guests are onboard. Docs-only changes have been
  committed straight to `main`.
- Live admin: `http://10.33.2.241/admin/?key=hotel` (boat LAN only).
