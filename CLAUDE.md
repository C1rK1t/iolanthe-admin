# iolanthe-admin

Crew-facing admin console for Princess Iolanthe. Served at `/admin/?key=<urlKey>`
by `iolanthe-server`. Requires the URL key configured in `settings.json`.

## Architecture position

```
iolanthe-server  (serves /admin/* from ADMIN_STATIC_DIR)
        ↓
iolanthe-admin  (index.html, admin.css, admin.js, assets/)
        ↓  API calls (all /api/* relative URLs)
/api/admin/*  /api/charter/*  /api/weather  /api/track  ...
```

## Departments / roles

| Department | URL key param | Password key in settings.json |
|------------|--------------|-------------------------------|
| Charter Admin | `charter` | `passwords.charter` |
| Galley | `galley` | `passwords.galley` |
| Hotel | `hotel` | `passwords.hotel` |

URL access also requires `?key=<settings.admin.urlKey>`.

## Stack

- Plain HTML, CSS, JavaScript — no build step, no framework
- `admin.css` — all styles
- `admin.js` — all client-side logic (~13.6k lines, IIFE)
- `assets/icons/admin/` — favicons and department login icons
- `routes-core.js` — Route Planner pure logic (also a Node module)
- `itinerary-core.js` — itinerary pure logic (also a Node module): normalisation, `deriveDays`, `charterDayCount`,
  validation and the line-geometry helpers
- `itinerary.js` / `itinerary.css` — Charter → Itinerary panel: the route-derived day-by-day view (days follow the
  charter's route, with per-stop activities and times). Styles use the `itinerary-` prefix
- `node --test` runs the tests in `test/`, which cover `routes-core` and `itinerary-core`
- `routes.js` / `routes.css` — the Route panel (Charter → Route): state, side panel, header, map, saving and wiring. A
  "Working on" selector gives it two subjects: the library routes (the route library, saved through
  `/api/admin/routes/*`) and this charter's route (the route stored in the charter's `itinerary.json`, saved through
  `/api/admin/charter/<id>/itinerary/save`; read-only once the charter has ended). It uses the
  `window.IolantheAdmin` helpers exposed at the end of `admin.js`, and its styles are scoped under `.routes-panel` /
  `.routes-modal`. Helper files, each created per bind with a `ctx` from routes.js:
  - `routes-ui.js` — `el()`, icons, `fmtPos` and the modal shell (`openModal`)
  - `routes-popup.js` — the point popup (Make stop at / Make stop here / Remove stop, sites served)
  - `routes-lists.js` — the Stops / Legs tab lists and per-leg speeds
  - `routes-join.js` — Add another route
  - `routes-places.js` — anchorages and sites on the map, the anchorage modal, and the bridge to the admin's Site
    Editor modal (`IolantheAdmin.openSiteEditorModal`)
  - `routes-io.js` — KML/GPX import (DOMParser, Simplify, Replace/Append), temporary imported pins, GPX/KML export

## Path conventions

All asset paths use the `/admin/` prefix so they are served from
`ADMIN_STATIC_DIR` by `iolanthe-server`:

```
/admin/admin.css
/admin/admin.js
/admin/assets/icons/admin/favicon.svg
/admin/assets/icons/admin/site.webmanifest
```

The one exception is `/assets/icons/onboard/web-app-manifest-512x512.png`
used as a print watermark in `admin.js` — that is a guest asset served by
`iolanthe-guest` from `GUEST_STATIC_DIR`.

## Running locally

The admin console has no server of its own — it is served by `iolanthe-server`.

```powershell
# In the iolanthe-server repo:
$env:DATA_DIR="$PWD\data-local"
$env:GUEST_STATIC_DIR="..\..\portal\iolanthe-guest"
$env:ADMIN_STATIC_DIR="..\..\portal\iolanthe-admin"
node server.js
```

Then open `http://localhost:8000/admin/?key=hotel` (or whatever `urlKey` is
set to in `data-local/settings.json`).

## Key constraints

- No build step. No npm. No dependencies.
- All API calls use relative URLs (no hardcoded host).
- Keep all asset paths prefixed with `/admin/` so they resolve correctly
  when served from `ADMIN_STATIC_DIR`.
- Do not cache `/api/*` responses.

## Deployment (docker-vm)

`iolanthe-server` bind-mounts `./iolanthe-admin:/static/admin:ro` in the
vessel compose file. **Merging to `main` releases it:** root's cron runs
`/opt/projects/vessel/update-vessel.sh` every 5 minutes. That script pulls the static repos (admin, guest, crew), and
the bind mount serves the new files with no restart. Bump the `?v=` strings in `index.html` so browsers fetch the
new CSS/JS. To pull straight away:

```bash
cd /opt/projects/vessel/iolanthe-admin && git pull
```

Server changes are different. `iolanthe-server` doesn't auto-update; run `./update.sh` there (see its CLAUDE.md).
