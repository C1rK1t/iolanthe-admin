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

The server stores the passwords as scrypt hashes and never sends them (iolanthe-server `lib/admin-auth.js`). Settings →
Passwords (Charter Admin on the bridge) therefore starts with empty fields: it sends only the passwords typed, and a
blank field keeps that department's password. It needs the server release with the hashing (iolanthe-server#11): an
older server refuses any save with a blank field (400), so release the server first. On local dev data the passwords
become hashes on the first start of that server; to log in, type a plain test password into the data folder's
`settings.json`.

Settings has Passwords, Display Settings, Route Track and Weather. The OBS Feed panel and Display Settings' OBS fields
went with the feed itself in 2026-10 (iolanthe-server `docs/superpowers/specs/2026-10-10-remove-obs-feed-design.md`).

The server also checks the network (iolanthe-server `lib/admin-network.js`) and reports it as the bootstrap `role`:
bridge gets every department, crew Galley and Hotel. Guest, owner and `unknown` (an address in no CIDR) get no admin,
and the console shows "This network cannot access admin." instead of the login, as a centred error card
(`showAccessRefused`, `.status-panel--refused`); a bootstrap with a wrong key gets "Access denied" the same way. The
server answers a wrong key at `/admin/` itself (plain 403), so to see that card load `/admin/index.html?key=wrong`.
`<body data-admin-section>` is set only on a section page, whose background is dark: admin.css makes the status text
white for any body that has it.

## Stack

- Plain HTML, CSS, JavaScript — no build step, no framework
- `admin.css` — all styles
- `admin.js` — all client-side logic (~13.6k lines, IIFE)
- `assets/icons/admin/` — favicons and department login icons
- `routes-core.js` — Route Planner pure logic (also a Node module)
- `itinerary-core.js` — itinerary pure logic (also a Node module): normalisation, `deriveDays`, `charterDayCount`,
  validation, time estimates, `recomputeArrivals`, the departure cascade (`setDeparture`, `shiftFromStop`), `clashes`,
  `fit`, `legSummaries` and the line-geometry helpers. The Route page is the only itinerary editor (spec A2).
- `charters-core.js` — charter list pure logic (also a Node module): the active rule (mirror of the server's
  `lib/active-charter.js`, shared fixture `test/fixtures/active-charter-cases.json`), overlaps, statuses, `pillFor`, and
  the band's layout maths (`packRows`, `zoomSpan`, `scrollRange`, `visibleMonths`, `visibleWeeks`).
- `charter-gantt.js` / `charter-gantt.css` — the Gantt band above every Charter panel (spec-charters §6): the charter
  selector. Read-only: drag pans, wheel zooms, ← → pan, click selects a charter or opens a reserved period's card.
  Collapsed to a strip by default on the Route panel (localStorage `iolanthe-admin.gantt.collapsed`). Mounted by
  `admin.js` (`mountCharterGantt`) into `#charter-gantt-host`, which `sectionShell` renders for the Charter section.
  The first layout runs on a timeout, not requestAnimationFrame, so a background tab still draws.
- `guest-preview-core.js` / `guest-preview.js` / `guest-preview.css` — **Guest view** (charter rework spec B), a tab in the
  Charter, Galley and Hotel sections (`bindGuestPreview` in admin.js; it opens the guest on Itinerary / Today's Menu /
  Wine & Drinks):
  the live guest site in a same-origin iframe at `/?preview=<date>&charter=<id>#<tab>`, under a day slider (day before
  boarding … day after the charter), phone 390 × 844 / tablet 820 × 1180 / PC 1280 × 800 scaled to fit, reload, open full screen. Eye
  buttons on the Charter Info and Route headers open it (`showCharterPanel("preview", { previewDay })`). The server
  serves `?charter=` only to an admin session; the guest's preview mode lives in `iolanthe-guest/preview-mode.js`.
  Device choice in localStorage `iolanthe-admin.preview.device`.
- `pack-core.js` / `pack-render.js` / `charter-pack.js` / `charter-pack.css` — **Charter Pack** (charter rework spec P):
  the charter's details as A4 pages for the client or agent, saved as a PDF with the browser's print dialog.
  `pack-core.js` (pure, Node-tested) holds the preset rules (mirror of the server's `lib/charter-pack.js`) and
  `buildPackModel(guestPayload, pack)`; `pack-render.js` (pure, Node-tested, no admin globals so phase 2 can reuse it)
  turns the model into the cover and per-section blocks; `charter-pack.js` lays the blocks onto pages, draws the Leaflet
  route map (light grey Esri tiles, day-number markers merged under 18 px, a key), auto-saves the preset to
  `/api/admin/charter/<id>/pack` and prints by moving the live pages into `<body>` (`#pack-print-host`) and back on
  `afterprint`. Data:
  `/api/charter?charter=<id>`. Themes A / B / C are classes `.pack-theme-a/b/c`; assets in `assets/pack/`.
- The Charter section menu reads **Charter Admin** (the info panel, id `info`), **Route & Itinerary** (`routes`), Crew,
  **Charter Pack** (`pack`), Guest view, Site Editor; the two-line wraps are `<br>`s in the labels (`renderCharter`).
- Reserved periods (maintenance / unavailable / other) come from `/api/admin/reserved-periods` and save with a
  `base_revision`; the admin and the server both refuse dates that overlap a charter or a period.
- The active charter is computed by the server (in date = the day before start to the end date, else the crew's
  choice, else the last ended, else the next upcoming); the Info page's ★ "Make active" is disabled while a charter is
  in date. Charter Info uses the shared `admin.css` classes (`.stat-tiles`, `.form-section`, `.status-pill`,
  `.segmented`, gold icon tone), the first slice of the admin style rollout. Galley and Hotel keep their "Select
  Charter" dropdowns.
- `drag-reorder.js` — drag to reorder with a grip (pointer events, so it works on touch, plus the arrow keys on the
  focused grip), `window.IolantheDragReorder.attach(container, { items, handleSelector, onMove, afterMove })`; it
  replaces the Move up / Move down pairs (style rollout B: Galley Menus first). `moveItem` / `dropIndex` are pure.
- `merge-core.js` — conflict-safe saves (charter rework spec C), pure, also a Node module (`window.IolantheMerge`):
  `merge3(base, mine, theirs, schema)` merges two people's copies of a file record by record and field by field
  (`SCHEMAS`: crew, guests, menus, Guest Alcohol, Available Alcohol, drink stocks, cocktails, sites, charter.json) and
  reports a clash where both changed the same field; `saveWithRebase` sends a save with `base_revision`, merges a 409
  and sends again (3 rounds), or returns the clash; labels, ids (`newId`, `withSlotIds`).
- **Conflict-safe saves** (spec C): every save of `charter.json`, `crew_list.json`, `guest_list.json`, `menus.json`,
  `guest_drinks.json`, Available Alcohol, drink stocks, cocktails and sites goes through `saveRevisioned` in admin.js
  (`saveCharterFile`, `saveLibraryCopy`, `saveSitesLibrary`, the Charter Admin form). The merge base of a charter file
  is `state.bundle[file]` (only `loadCharter`, which every page render calls, and these saves replace it); a library
  file's base is kept per working copy (`libraryBases`), the sites' in `sitesBase`. A silent merge says so on the status
  line; a clash reopens the dialog on their version with my changes on top (`recordClash`, `showClashMarks`: amber
  banner, `.field-mine` teal edge, "↳ Hotel wrote: …"), or redraws a whole-page save the same way, unsaved (`pageClash`,
  `showListClash`); deleting a record someone changed asks first (`confirmDeleteAnyway`). After a clash the working copy
  holds theirs, so a stale copy is never sent with the new revision. Records are found by `id` (crew, guests, menus,
  cocktails, drink stocks, sites), never by array index. Coming back to the tab redraws the open page when one of its
  files moved (`checkFreshness`, `GET /api/admin/revisions`, a raw fetch that is not session activity), never over
  unsaved edits or an open dialog.
- `damaged-core.js` — a data file the server can't read (spec C §4.6, SC-D16; design
  `docs/superpowers/specs/2026-10-10-damaged-file-notice-design.md`), pure, loaded before `admin.js`, also a Node
  module (`window.IolantheDamaged`): `PAGE_FILES` (the files each page needs, counting the files its saves are worked
  out from), the readers of the server's `damaged` marker (`damagedIn`, `bundleDamage`, `pageDamage`) and of a refusal
  (`refusal`: 500 `{code: "damaged", file, damaged}`), and the wording.
- **A damaged file** (spec C §4.6): each render keeps what its loads said (`state.bundle` holds the bundle's markers,
  `seenDamage` the library GETs', `noteRevisionDamage` the revisions for Purchased Alcohol).
  - The notice: before it binds any editor or auto-save, a page that needs a damaged file draws the notice card instead
    (`pageDamage`, `damagedNoticeHtml`: the files, "Nothing has been changed", the server's problem, Try again; Galley
    and Hotel draw it through `drawDamagedPage`, the Charter pages paint it with the reserved-periods strip). So Galley
    Menus' day sync can no longer save menus made from a damaged `charter.json`'s missing days. Route & Itinerary blocks
    only this charter's route ("Work on the library routes"). A damaged `routes.json` puts the card in the planner. The
    Charter Pack draws the card itself.
  - The strips: `anchorages.json` gets a strip. `reserved-periods.json` gets a strip under the band on every Charter
    page, the period editor won't open, and Charter Admin and the create dialog hold new dates
    (`charterDatesHeldMessage`).
  - The save guard: a save the server refuses for a damaged file shows a banner (`throwAdminApiError` →
    `showDamagedBanner`) and keeps what was typed. A page never saves a file it loaded damaged: `saveRevisioned` refuses
    such a base before sending (a repaired file at revision 0 would pass the server's revision check), merge-core never
    merges the marker, and the anchorages save waits for its load.
  - The pickers: the crew and menu import pickers refuse a damaged source (`damagedSourceMessage`).
  - The freshness check: coming back to the tab redraws a page whose file's `damaged` changed (`checkFreshness`,
    comparing `knownDamageOf`).
  - A server without the marker simply lacks the marker-driven behaviour above. Three things changed for every server:
    the anchorages save waits for its load, the menu import reads the source before the overwrite question, and the
    pack cover upload goes through `throwAdminApiError` (login handling and the banner).
- `node --test` runs the tests in `test/` (263 tests), which cover `routes-core`, `itinerary-core`, `charters-core`,
  `guest-preview-core`, `pack-core`, `pack-render`, `drag-reorder`, `merge-core`, `damaged-core`, the damaged-file
  pages (`damaged-page.test.js`, `admin.js` in a `vm` sandbox), the anchorages save guard
  (`routes-places-guard.test.js`), the startup order (`startup-order.test.js` runs `admin.js` alone in a `vm` sandbox),
  the refused-access card (`refused-access.test.js`, the same sandbox) and the Settings panels
  (`settings-panels.test.js`, the same sandbox)
- `routes.js` / `routes.css` — the Route panel (Charter → Route): state, side panel, header, map, saving and wiring. A
  "Working on" selector gives it two subjects: the library routes (the route library, saved through
  `/api/admin/routes/*`) and this charter's route (the route stored in the charter's `itinerary.json`, saved through
  `/api/admin/charter/<id>/itinerary/save`; read-only once the charter has ended). "Working on" lists this charter's
  route and the **unassigned** routes (the route library). The header shows a fit pill and a to-check pill; the side
  column holds stat tiles, Legs and a read-only Days tab; the stop strip under the map (`stop-cards.js`) edits stays,
  items and stop settings; Start from… imports a record through `/api/admin/charter/<id>/itinerary/import`. It uses the
  `window.IolantheAdmin` helpers exposed at the end of `admin.js`, and its styles are scoped under `.routes-panel` /
  `.routes-modal`. Helper files, each created per bind with a `ctx` from routes.js:
  - `routes-ui.js` — `el()`, icons, `fmtPos` and the modal shell (`openModal`)
  - `routes-popup.js` — the point popup (Make stop at / Make stop here / Remove stop, sites served)
  - `routes-lists.js` — the Legs tab list and per-leg speeds
  - `routes-join.js` — Add another route
  - `routes-places.js` — anchorages and sites on the map, the anchorage modal, and the bridge to the admin's Site
    Editor modal (`IolantheAdmin.openSiteEditorModal`)
  - `routes-io.js` — KML/GPX import (DOMParser, Simplify, Replace/Append), temporary imported pins, GPX/KML export
  - `stop-cards.js` / `stop-cards.css` — the stop strip (stacked edges, red = dirty, green = fits) and the stop card
    (Arrive / Depart / Next-leg tiles, Day tabs with items, ⚙ settings)
  - `routes-days.js` — the read-only Days tab (tube line; day boxes whose sub-boxes carry the stop name and times)

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
- Every script in `index.html` is `defer` (never `async`), and `admin.js` starts (`loadBootstrap()`) on
  `DOMContentLoaded`: the first render reads modules from the scripts after it (routes-ui, routes, itinerary-core,
  guest-preview, charter-pack). Don't start rendering from a script's top level.

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
