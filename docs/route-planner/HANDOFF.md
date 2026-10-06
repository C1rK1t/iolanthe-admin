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
- **The mockup hasn't been checked with live satellite tiles.** It was tested headless with Leaflet served locally
  and tiles blocked. It works at 1440 px and 390 px widths with no console errors.
- Small choices made by default, so confirm them:
  - Anchorages added as stops auto-link sites within 2 nm.
  - The "sites served" picker highlights sites within 5 nm.
  - Planning speed is per browser and isn't saved.
  - Settings → "Route Track" gets renamed to "Track Logging".
- Optional extras for phase 5: OpenSeaMap seamark overlay, vendored Leaflet (the admin currently needs internet
  for Leaflet and tiles).

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
