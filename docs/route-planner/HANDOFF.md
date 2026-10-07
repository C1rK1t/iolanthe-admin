# Route Planner — handoff

Last updated 2026-10-07. **Phases 1, 2 and 3 are complete and live** (phase 3 merged at `9828511`, with the
server at `0e68d98`). Two captain style tweaks followed (live at `ff53ea8`, see "After phase 3"). Next: **phase 4**
(assign routes to charters). Spec Q2 is still open and is needed first.

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
  - It updates within 5 minutes of a merge to `main` (the `update-vessel.sh` cron; see "Release process").
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
- Q3: merge (a point made into a stop at an anchorage that is already the next or previous stop is removed)

One question is still open:
- Q2: should charter copies keep their stops? Needed by phase 4.

## Open items

- **Spec §7 Q2** (stops in charter copies) still needs an answer before phase 4. Q3 was decided on 2026-10-07: **merge**.
- Settings → "Route Track" gets renamed to "Track Logging" (phase 5). Confirm the name.
- Optional extras for phase 5: OpenSeaMap seamark overlay, vendored Leaflet (the admin currently needs internet
  for Leaflet and tiles).

## Style rollout (separate piece of work)

David wants the mockup's visual style used across the **whole Admin site**. That means the square icon buttons
(green save / red cancel, grey secondary, separators), the shaded stat tiles and panels, the tabbed box and cards,
the button styles, the type and the uppercase field labels. Do it after the Routes phases or alongside them. Start
by turning the mockup's CSS (`:root` tokens, `.icon-btn`, `.stat`, `.banner`, `.field`, `.text-btn`, `.seg`,
`.tabbox`, `.stop-item`, modal card) into shared `admin.css` classes.
- The captain asked for **muted whites** on the Routes panel (2026-10-07). Its `--card-bg` / `--panel` colours in
  `routes.css` are a good starting point for the admin-wide palette. Check with David whether every panel should get them.

## Phase 1 (done, 2026-10-07)

- **Plan A (server)** is merged to `iolanthe-server` `main` at `2ac4b8d` (plan:
  `iolanthe-server/docs/superpowers/plans/2026-10-07-route-library-server.md`).
  - What it added:
    - `lib/route-library.js`, with 22 unit tests (`npm test`)
    - the endpoints `GET /api/admin/routes`, `POST routes/save` (`{route, base_revision}`, 409 on a clash, 404 if the
      route was deleted, 500 if the file is unreadable), `POST routes/delete`, `GET /api/admin/anchorages` and
      `POST anchorages/save`
    - migration v3, which imports the charter routes
  - **Live on the boat**: `/api/schema` shows `live_version` 3, with `import-charter-routes-into-library` applied.
    Migration v3 imported **4 routes**: "11th Janaury 2027 — Primary", "Csaba - COMPLETED — Primary" and
    "— Alternative", and "TEST — Primary" (119–130 points each). "Janaury" is the charter's own spelling.
- **Plan B (admin Routes panel)** is merged to `iolanthe-admin` `main` at `91d679a` (plan:
  `docs/superpowers/plans/2026-10-07-routes-panel-admin.md`). **It's live on the boat**: the VM is at `3ee328f`, and
  `/admin/routes.js` is served.
  - Files:
    - `routes-core.js`: pure logic, 14 tests with `node --test`
    - `routes.js`: the panel
    - `routes.css`: the mockup style, scoped under `.routes-panel` / `.routes-modal`
    - small hooks at the end of `admin.js`: `window.IolantheAdmin`, the `routes` panel entry and its dispatch
  - What the panel does:
    - route picker, name, description and route speed
    - nm / stops / time tiles
    - Stops / Legs tabs, with stop-to-stop leg cards and per-leg speeds
    - a satellite map with Select / Add / Delete, drag, midpoint insert, a point popup and undo/redo
    - Save (409 → "Route changed elsewhere"), Save As, Delete, New, Cancel and Add another route
    - the unsaved-changes guard
    - Route Upload stays alongside
  - **Not in phase 1:** creating stops (it needs anchorages, phase 2), sites and anchorages on the map, import and
    export (phase 3), and charter copies / Itinerary assignment (phase 4).
  - **Known behaviour:** a blank route speed saves as the server default, 8 kn.
- **How it was built:** subagent-driven, one agent at a time, with a spec and quality review after every task.
  Reviews caught several issues, all fixed before merge:
  - a corrupt `routes.json` could have been read as empty and overwritten
  - edits made while a save was in flight were lost
  - the map view reset after every save
  - deleting a route that was already gone left it in the picker
  - a Save As regression kept the old name on the new copy
- **Local dev server for the admin:** `routes-admin-dev` in the workspace `.claude/launch.json` (port 8124, data in
  `iolanthe-server/data-local/routes-dev`). The Charter Admin test password is at `admin.passwords.charter` in that
  folder's `settings.json`.

## Phase 2 (done, 2026-10-07)

- **Merged** to `iolanthe-admin` `main` at `24d6568`. The plan is `docs/superpowers/plans/2026-10-07-routes-phase2-places.md`.
  **Live on the boat:** the VM is at `405aabe`, and `routes-places.js` is served.
- **New file:** `routes-places.js` (anchorages and sites on the map, the anchorage modal, the Site Editor bridge).
  `routes-core.js` gained the places logic, and tests are now 28 (`node --test`). admin.js exposes
  `openSiteEditorModal` (with an optional `defaults` argument for a new site), `saveSitesLibrary` and
  `normalizeSiteLibrary`. Version strings are `admin-routes-v2`.
- **Features:**
  - Anchorage mode: create, edit, move and delete (with a used-by confirm). Anchorage library saves are serialised.
  - Stops:
    - created from Add mode, "Make stop at" (2 nm) and drag-to-snap (24 px)
    - **merge** with an adjacent stop at the same anchorage (Q3)
    - a stop nudged near its own anchorage keeps its name and sites
  - Sites: pins, click to edit (the real Site Editor), Add → named waypoint, and Make site (for waypoints only)
  - Sites served (5 nm groups), tender lines, "moved"/"deleted" warnings with the "!" badge, Move stop to
    anchorage, and a layers toggle
- **Reviews caught and fixed:**
  - the leg speed being lost on re-snap
  - false "deleted" warnings while anchorages were loading
  - the wrong new anchorage being picked
  - overlapping saves losing an update
  - re-snapping a nudged stop
- **Follow-ups:**
  - Local dev data has leftover test anchorages and routes.
  - Browser checks need the local test login; David allowed agents to read the dev password, but the auto-mode
    classifier still blocks subagents. The workaround is for the main session to log in to the browser pane and
    hand over the session.

## Phase 3 (done, 2026-10-07)

- **Merged** to `iolanthe-admin` `main` at `9828511` (plan: `docs/superpowers/plans/2026-10-07-routes-phase3-import-export.md`).
  It went live via the cron. **Server** `iolanthe-server` `main` at `0e68d98`, deployed with `./update.sh` on
  2026-10-07 (the server went first, because the admin's plain stops and anchorage ids need it).
- **Files:** `routes.js` was split into `routes-ui.js`, `routes-popup.js`, `routes-lists.js` and `routes-join.js`, plus the
  new `routes-io.js` (import, pins, export). `routes.js` is now 775 lines. Tests: 63 (`node --test`); server 24
  (`npm test`). The version string is `admin-routes-v3`.
- **Features:**
  - **Import** KML/GPX: pick one line or join them all, Simplify (the default aims for 60 points or fewer, found by binary
    search and cached per line), and Replace / Append. Importing into a new route fills its name and source.
  - **Pins:** temporary orange markers with Add to route, Make anchorage (creates the anchorage only), Make site (with
    the description), Delete and "near X". They're never saved, survive route switches and New, and leaving the panel
    warns. Re-importing skips duplicate pins.
  - **Export:** GPX 1.1 and KML of the working copy, including unsaved edits.
- **Captain's feedback, added to phase 3:**
  - Leg cards are compact: a small black-and-white tickbox, with distance, time and leg speed on one line.
  - New anchorages default to "Anchorage". A duplicate name (ignoring case) is saved as "<name> #02", "#03", …
    The server gives a new anchorage a free id, because a renamed anchorage keeps its old slug. It also rejects
    duplicate names, ignoring case.
  - **Plain stops** (hold position / drift): `stop: true` on a point with no anchorage. Waypoints get "Make stop here";
    every stop gets "Remove stop". Plain stops have a dashed-ring marker and show "Holding / drifting" in the Stops tab.
- **After phase 3, more captain tweaks (2026-10-07, merged and pulled on the VM straight away):**
  - **Muted whites** (`c646130`): the Routes panel background is a slightly darker blue-grey (`--card-bg: #dfe6e9`)
    instead of the admin's white card. Inputs, the route dropdown, stop/leg cards and the active tab use a muted
    off-white (`--panel: #f4f6f7`), and the Stops/Legs list area is `#e9eef0`. It's scoped to `.routes-panel`, so the
    rest of the admin is still white. This is a pointer for the style rollout below.
  - **Counts moved** (`ff53ea8`): the Stops / Legs tab titles no longer have count pills. The middle stat tile reads
    "11 / 10" with the label "stops / legs" (`lists.legCount()`).
  - Version strings are now mixed: `routes.css` v5, `routes.js` and `routes-lists.js` v4, everything else v3. Bump
    only the files you change.
- **Reviews caught and fixed:**
  - **Security:** every admin `<textarea>` and three `<option>`s filled HTML through `escapeText`, which escapes nothing.
    An imported pin description could inject script via Make site. They now use `escapeHtml`. `htmlToText` also
    strips tags again after decoding entities.
  - a stale-bind guard (`isCurrent`) after every await in the import
  - stale file loads
  - KML coordinates with spaces after the commas
  - control characters in exported names
  - accents in export file names
  - long pin names exceeding the server's 120-character limit
  - the slow default tolerance on huge tracks
  - a default-named anchorage clashing on its id
- **Task 5 is HELD:** retiring Route Upload is on branch `feat/routes-retire-upload` (`6aff979`, pushed and reviewed).
  It removes the Route Upload panel and the old KML pin import modal from admin.js/admin.css. Merge it **only with
  phase 4**. Until then Route Upload stays, so charters can still get routes.
- **Local dev:** the worktree session used its own `.claude/launch.json` (excluded via `.git/info/exclude`), so the
  dev server served the worktree. Restarting the dev server logs the browser tab out.

## Next: phase 4

From spec §5: assign / unassign routes to charters from the Itinerary route rows, "edited since assigned", read-only
after the charter's end date, charter copies in the route picker and in Add another route, and removing the server's
`upload-route`.
- **Spec Q2 is still open** (should charter copies keep their stops?). Decide before planning. Plain stops (`stop: true`)
  are now part of that question too.
- Merge the held `feat/routes-retire-upload` with phase 4. The Alternative-route fallback notice must be rebuilt on the
  Itinerary rows. The old `routeUploadFallbackNoticeHtml` and `routePlanData` are in admin.js at the Task 5 parent
  commit `9247000`.
- Charter copies in "Add another route" go into `routes-join.js`.

**Follow-ups (not blocking):**
- `iolanthe-guest` puts site titles/descriptions into Leaflet tooltips and popups as raw HTML (guest.js ~3165,
  3294–3305, 6548). Imported pins can now become sites, so escape them there (a separate task was suggested).
- Import decodes files as UTF-8 only (Latin-1 / UTF-16 GPX files would garble or fail).
- The server sends no `Cache-Control` for static files; consider `no-cache` for `admin/index.html`.
- Undo after importing into a new route restores the points but keeps the imported name and source.
- `admin.js` `<option value="${id}">` attributes for charter and site ids are unescaped (ids are slugs, so low risk).
- "Add mode" stays on after New (existing behaviour).

## Release process and conventions

- **Admin, guest and crew: merging to `main` releases them.** Root's cron on the docker VM runs
  `/opt/projects/vessel/update-vessel.sh` every 5 minutes. It pulls those three static repos, and the bind mounts
  serve the files with no restart.
- **The server is manual, by design (David, 2026-10-07).** `iolanthe-server` and `iolanthe-signalk` never
  auto-update. After merging server changes, run this on the VM:

  ```bash
  cd /opt/projects/vessel && ./update.sh
  ```

  It pulls all five repos and rebuilds the containers if anything changed. A rebuild without a pull rebuilds the old
  code. Check what's live with `curl http://10.33.2.241/api/schema`.
  - `update.sh` used to fail at SignalK with a container-name conflict. **That was fixed on 2026-10-07.** SignalK now
    runs from the vessel compose file, with `cap_add: NET_ADMIN, NET_RAW` for the CAN feed. The repo
    (`iolanthe-signalk` `8ee2da0`) retired its standalone compose file and keeps a reference copy in
    `vessel-compose-service.yml`, because `/opt/projects/vessel/docker-compose.yml` isn't in git. `update.sh` was
    then run successfully on 2026-10-07, and all five repos are current on the VM.
  - The SignalK block also has `ulimits: core: 0` now (`47c4002`). SignalK had written three ~2.8 GB core dumps,
    probably from heap exhaustion. The leak itself is not yet investigated.
  - Not Route Planner work, handled in a separate session: SignalK's cat-engine plugin never loaded. It's **fixed
    and live** (`iolanthe-signalk` `5ec38df`, plan `7a15438`), and SignalK now has `propulsion.*` engine data. The cat-genset-analysis crash-loop was fixed and deployed (`f374845`).
  - Server-only alternative:
    `cd /opt/projects/vessel && git -C iolanthe-server pull --ff-only && docker compose up -d --build iolanthe-server`
- **Claude has direct SSH to the VM:** `ssh docker-vm` (an alias in `~/.ssh/config`, root, key
  `~/.ssh/id_claude_dockervm`). It's a live boat system: read-only checks are fine; confirm restarts, rebuilds and
  edits with David first.
- **Bump the CSS/JS version strings** in `index.html` whenever `admin.css` / `admin.js` (or the new `routes.js`)
  change, so browsers pick up the new code.
- **Popups and forms**: green save and red cancel icon buttons top right. Clicking outside the popup cancels.
- No build step, no npm, no dependencies. All API calls are relative URLs. Asset paths are prefixed `/admin/`.
- David is fine merging straight to `main` for previews when no guests are onboard. Docs-only changes have been
  committed straight to `main`.
- Live admin: `http://10.33.2.241/admin/?key=hotel` (boat LAN only).
