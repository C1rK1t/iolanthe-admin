# Charter rework — how charters and itineraries work today

Context for brainstorming the Charter / Itinerary rework (2026-10-07). The material was gathered by a read-only
survey of the three repos. Line numbers are approximate as of these commits: admin `3efe758`, server `0e68d98`,
guest `main` on 2026-10-07. Check them before relying on them.

Keys: **S** = `iolanthe/iolanthe-server/server.js`, **A** = `portal/iolanthe-admin/admin.js`,
**G** = `portal/iolanthe-guest/guest.js`.

## The captain's direction (relayed by David, 2026-10-07)

- **Rework Charter / Itinerary management**, building it on the new Routes planner. Library routes become the basis
  for setting up a charter's itinerary.
- **Drop Primary / Secondary (Alternative) plans.** Instead, **alternative itineraries** are attached to a charter
  before it starts. Routes and itineraries can be **changed on the fly** while a charter is in progress.
- **Make setup and maintenance very intuitive.** He calls today's version "clunky" and mentioned **drag and drop** a
  lot. This needs discussing.
- **Guest-portal preview with a date slider.** It shows what guests see on each day of a charter, and can also be used
  to review past charters. It should **use the live guest site inside a date wrapper**, not a duplicate. This needs
  discussing.

**Constraints:**
- No clients for at least a month, so breaking the live system isn't an immediate problem.
- Legacy data structures are not a limit, as long as old data can be migrated.

## 1. Data on disk

### The charter folder

`charters/<id>/` holds these files:

| File | What it holds |
|---|---|
| `charter.json` | The charter's details (see below) |
| `itinerary.json` | Days and plans (see below) |
| `crew_list.json`, `guest_list.json` | Crew and guests |
| `menus.json` | Menus |
| guest-drinks, alcohol-purchases, `available-alcohol.json` | Drinks |
| `planned-route.json` | Per-plan routes |
| `track.json` | The actual track |
| `notices.json`, `watches.json` | Notices and watches |

- The files admin can write are listed at S:97. The bundle sent to admin is listed at S:98.
- Defaults are in `defaultCharterData` (S:~4120–4190).
- The libraries live in `library/`:
  - `sites.json`
  - `routes.json` and `anchorages.json` (`lib/route-library.js`)
  - `vessel.json`
  - cocktails and drink stocks
- The active charter is recorded in `active-charter.json` as `{active_charter}`.

### charter.json

Fields:
- name, guest_count, start_date, end_date, notes
- arrival date, time and flight
- primary_contact `{name, phones[]}`
- charter_style
- flags: non_swimmers_present, diving_planned, medical_notes_present, dietary_restrictions_present
- diving_guest_count, charter_preference_notes, drink_preferences_notes

The edit form is at A:4931–5000.

### itinerary.json

The default is at S:4154.

| Field | What it is |
|---|---|
| `summary` | Charter summary |
| `days[]` | What **guests read**: a pre-built copy made from the plans by the admin client (`rebuildGuestVisibleItineraryDays`, A:6459) |
| `alternative_days[]` | A legacy mirror |
| `active_plan_by_day` | `{"<dayNum>": "primary" \| "alternative"}` |
| `plans.primary`, `plans.alternative` | Each is `{welcome_message, days[]}` |
| optional `start_date` / `end_date` | Override the charter's dates (S:5079) |

- **Day:**
  - Fields: `day`, `site_id`, `title_override`, `notes`, `timing`, plus a list of stops (stop editor at A:6857).
  - Day ids start with `day…` or `alt-day…`. The server works out the plan from that prefix (S:4823).
- **Plans:** defined in `ITINERARY_PLANS` (id, planKey, legacyDaysKey, idPrefix). Helpers: `itineraryPlanById`
  (A:3668), `ensureItineraryPlans` (A:3694) and `normalizeItinerary` (A:3651).
- **Which plan guests see** is set per day in `active_plan_by_day`. The button "Use Alternative/Primary From Today"
  (`switchGuestItineraryFromToday`, A:6539) writes every day from today on, then rebuilds `days`. The server decides
  in this order (S:4862):
  1. the day's entry in the map
  2. the day-id prefix
  3. the earliest mapped day
  4. Primary

### Sites

`library/sites.json` holds `{sites:[{id,title,latitude,longitude,description,images,media,tags}]}`. The validation is
at S:~7060.
- Days and stops refer to a site by `site_id`, with an optional `title_override`.
- Guests get the whole library inside `/api/charter` (S:5070).

### planned-route.json

- Shape: `{source, routes[], route:{primary:{source,routes[]}, alternative:{…}}}`.
- The top-level fields mirror Primary.
- Only two plan ids exist: `ROUTE_PLAN_IDS` / `normalizeRoutePlanId` (S:4704).

## 2. Admin UX today: why it's "clunky"

**Panels:**
- Charter Info: one big form (A:4931).
- Itinerary (A:5030): a Primary/Alternative selector, a day selector, a welcome message, and "Use X From Today"
  (A:5008).
- Routes: the new planner.
- Route Upload: per-plan KML.
- Site Editor (A:5339).

**Modals:**
- Create charter (A:5353 → `/charters/create`): id, name, dates, guest count, and "clone from" (itinerary, crew,
  menus, drinks, route).
- Delete charter (asks for a password).
- Day modal (A:6698), which opens a stop editor (A:6857), which opens a site modal (A:5526/5757), which opens a map
  picker (A:5609).

**Pain points:**
- Modals open inside modals: day, then stop, then site, then map.
- Stops reorder only with move up / down buttons (A:6820). There is **no drag and drop anywhere**.
- Two parallel plans duplicate their days, and a legacy mirror (`days`, `alternative_days`, `plans.*`) is kept in step
  by hand.
- The plan switch is whole-day and "from today", behind a confirm dialog.
- The route is a separate KML upload per plan, not tied to the itinerary's stops.

### Click counts (surveyed 2026-10-07; admin.js is ~15,600 lines, so the A: numbers above run low)

Counted from the Itinerary panel with the right day already showing (add 1 to click a day pill first).

| Task | Path | Clicks |
|---|---|---|
| Add a day | **No control exists.** Days are generated from the charter's start/end dates (`normalizeItineraryDayList` ~A:3805). Workaround: Charter Info → End Date → Save → back to Itinerary. `swapItineraryRows` is dead code, so days can't be reordered either. | ~4, indirect |
| Add a stop (existing site) | Edit day → + Add stop → pick site → Save stop → Save day | 5 (6 with notes) |
| Change a stop's site | Edit day → Edit stop → pick site → Save stop → Save day | 5 |
| New site from the stop editor | **Not possible.** The stop editor is a site dropdown only; the shared dialog means opening the site modal would replace the day modal (`openCreateSiteModal` is dead code). Workaround via the Site Editor tab → pick on map → back to Itinerary → add stop. | ~16–18 |
| Move a stop 4 → 1 | Edit day → Move up ×3 → Save day | 5 |
| Switch guests to Alternative from today | Button → confirm. Saves immediately. | 2 |
| Edit title / notes / timing | Edit day → Title → Notes → Save. **No timing fields exist**; `stripItineraryTimingFields` (~A:6163) deletes `start_time`, `end_time`, `timing`, `timings` from every day and stop on each save. | 4 |

### Day modal internals (`openItineraryDayModal` ~A:6698)

- Fields: Primary Site (select, required if the library has sites → `site_id`), Day Title (→ `title` and
  `title_override`), Notes (→ `notes`), Stops (list rows with Edit / Up / Down / Delete → `stops[]`). Picking a site
  fills an empty title with the site name.
- Edits go to a draft copy; nothing is written until Save day. Leaving dirty asks to confirm.
- On Save: the live day object is mutated, then `persistItineraryAndRedraw` → `saveItinerary` runs
  `syncItineraryPlanForSave` (mirrors the plan into `plans.*` and `alternative_days`), **always runs
  `rebuildGuestVisibleItineraryDays`**, and whole-file saves `itinerary.json`. **The modal closes even if the save
  fails**, with the in-memory day already changed.
- Day ids are `${prefix}-${NNN}` (`day-001`, `alt-day-003`); `normalizeItineraryDayList` keeps ids, sorts by `order`,
  pads blank days to the charter duration and renumbers `order` / `charter_day` / `day` 1..N.
- Day fields: `id, order, charter_day, day, active, site_id, title, title_override, notes, stops[]`.
- **Stop object:** `{site_id, notes, include_site_notes (default true), ...passthrough}`. **Stops have no id and no
  title_override**; order is array position. Display name falls back to the site's name, then "Stop N".
- **Drag and drop:** none anywhere in admin.js. Every list reorders with up/down swap buttons (stops, guests, menu
  sections, food items, menu days, generic list). The only draggable is the Leaflet pin in the site picker map,
  which is a *stacked* dialog (`openStackedDialogModal`) and so can sit over another modal.
- **Routes panel:** no list reordering either; the Stops and Legs tabs are read-only cards. All editing is on the
  map with draggable Leaflet markers and midpoint-insert markers, through `ctx.editPoints(fn)`. Unsaved state is a
  snapshot comparison plus a page-level guard.
- **Itinerary ↔ Routes:** fully independent. `routes.js` never mentions the itinerary and is only passed
  `{siteLibrary}`. The only bridge is Route Upload, which warns when guests are on Alternative with no Alternative
  route uploaded. `window.IolantheAdmin` exposes no itinerary helpers.
- **Save path:** `saveCharterFile(file, data)` → `api()` → `POST /api/admin/charter/:id/save {file, data}`. No
  revision or etag; last save wins. No autosave or debounce. The model to copy is `routes.js` `saveRoute`
  (`{route, base_revision}`, 409 → Reload/Cancel prompt, and `applySaved` keeps in-flight edits).

## 3. Server endpoints

The router is a hand-written `if pathname ===` chain (`handleAdminApi`, S:7108). The public routes start at S:7761.

**Charters:**
- `GET /api/admin/charters` lists summaries.
- `POST /api/admin/charters/create` (`createAdminCharter`, S:4576) writes every file, can clone, and can set the
  charter active.
- `POST /api/admin/charters/delete` needs a password.
- `POST /api/admin/active-charter` (`setActiveCharter`, S:4211) checks the date range and switches track logging.

**One charter:**
- `GET /api/admin/charter/:id` returns the bundle.
- `POST /api/admin/charter/:id/save {file, data}` is a **whole-file overwrite** (S:6600). There are no per-day or
  per-stop endpoints, and no revision or locking.
- `POST /api/admin/charter/:id/upload-route?plan=` parses KML into one plan's planned route.

**Libraries:**
- Sites: GET, save (whole-file overwrite) and images/upload.
- Routes and anchorages: these have a revision (409 on a clash).

**Public (no auth):**
- `GET /api/charter` returns everything for the active charter (S:5051). `buildCharterPayload` takes a charter
  override, but the route doesn't use it.
- `GET /api/planned-route` returns today's plan (S:4898).
- Also: `/api/track`, `/api/track/status`, `/api/weather`, `/api/nmea`, `/api/charter/watches`, `/api/schema` and
  `/api/version`.
- `/data/*` serves the data directory as static files; only settings.json is blocked (S:7738).

## 4. Guest app

- **Guests write nothing.** There are no guest POST routes; every write is under `/api/admin`. G fetches only GETs
  (G:50–64). localStorage is used only for the install prompt.
- **"Today" is worked out twice:**
  - **Guest:** `calculateCurrentCharterDayState({today})` (G:755) defaults to `new Date()` and **already takes a
    `today` option**. `getCurrentDateKey` uses `new Date()` (G:890). `getDisplayedItineraryPlan` (G:3005) repeats the
    server's plan rules. Other time calls are at G:4829, 5722, 5780, 5977 and 6698; they haven't been reviewed.
  - **Server:** `localTodayDateValue` (S:4238) drives `displayedItineraryDayNumberForDate` (S:4837) and
    `guestVisibleItineraryPlanForToday` (S:4890), which `/api/planned-route` uses. Weather and moon use `new Date()`
    (S:7804).
- **What guests see:** itinerary days, the planned route, live position and track, weather and the next-stop
  forecast, sites, menus, drinks, crew, notices and watches.
### Every clock read in the guest app (surveyed 2026-10-07; guest.js is 8,293 lines, G: numbers above run ~3 low)

**Headline:** the guest works out "today" itself from the browser clock; nothing comes from the server. Every
charter-date decision funnels through two functions, so a preview date needs **one module-level override** used as
the default in both:

- `calculateCurrentCharterDayState` (G:765): `options.today ?? new Date()`. Nobody passes `today`.
- `getCurrentDateKey` (G:890): `new Date()` → `YYYY-MM-DD`.

| Class | Readers |
|---|---|
| CHARTER-DATE (must follow a preview date; all go via the two above) | `getSelectedMenuEntry` (menu of the day, G:958), `getGuestItineraryDateViewState` (pill status + default day, G:4147), `getDisplayedItineraryDayNumber` (G:3000), `normalizePlannedRouteData` (picks primary/alt route, G:3103), `renderItineraryTab` welcome message (G:7746), `getIdleItinerarySummary` (screensaver Today/Tomorrow, "Charter completed", G:5894) |
| AMBIGUOUS | `updateIdleClock` (screensaver clock text, G:5780) |
| WALL-CLOCK (stay real) | NMEA ETA/age/"live update" stamps, weather hour rows (server-driven `forecast.current.time`), tile-error window, idle throttle, weather refresh throttle |

The client **ignores the server's chosen route plan** and picks one itself (G:3103), so overriding the client date
is enough for the route to follow the preview. Weather location and moon phase follow the real server date.

### How a day is rendered

- `renderItineraryTab` (G:7744) → `renderDaySelector` (G:7756, a row of pill buttons; only one day shows at a time,
  no scrolling or carousel) → `renderSelectedDay` (G:7794). Clicking a pill sets `selectedItineraryDayId` and
  re-renders the panel. Default selection (`resolveGuestSelectedItineraryDay`, G:4182): today's day, else the last
  day if all are past, else the first. The selection resets when the current day number changes.
- `getItineraryDays` (G:2703) normalises raw days, reading `charter_day`/`day`/`order`, `id`, `site_id`,
  `title_override`, `location`, `notes`/`summary`, `timing`, `date`/`start_date`, `stops[]`, `map_label`, `plan`,
  `latitude`/`longitude`. Output: `{id, day:"Day N", dayNumber, date, area, summary, timing, hasExplicitStops,
  stops}`. `area` = first of `title_override`, `location`, site title.
- `resolveStop` (G:2723) reads `site_id`, `title_override`, `location`, `map_label`, `notes`, `plan`, `timing`,
  lat/long (stop → stop site → day site), `include_site_notes`/`exclude_site_notes`. The stop text is the first
  not-yet-used value of `notes`, `plan`, `timing`, site description (a dedupe set stops repeats). Images come from
  the site. A day with no `stops[]` becomes one synthetic stop.
- Site lookup: `getSiteById` (G:918), linear search of the library sent in the bundle. A missing site falls back
  silently (`location` → `map_label` → day area → "Day N Stop k"); no error UI. Stops with neither text nor images
  are hidden. An empty day shows "No itinerary has been added for this day."
- Card: header (`day` + `area`), `summary`, then stops, each with a "Stop k" label, a camera button for the image
  viewer, and the stop text. **Day-level `timing` is never displayed.** Pills carry `--past` (grey), `--current`
  (dark border, cream), `--future` (plain).
- Welcome message: `plans[planId].welcome_message` → `itinerary.welcome_message` → `itinerary.summary`.
- Screensaver (`syncIdleItinerarySection`, G:6372) shows Today and Tomorrow using only `summary`.

### Route and track on the guest side

- Planned route: `refreshPlannedRouteData` (G:3214) runs at start and after every 30 s charter refresh. The whole
  chosen plan is drawn as one dashed polyline. **No per-day leg, no today highlight.** `syncNavigationItineraryOverlay`
  (G:3268) pins every stop of every day with no today emphasis.
- Track: `/api/track` every 30 s, sorted and drawn as one polyline on both maps. No per-day filtering.

### Where a preview mode could hook in

- Globals (`itineraryData`, `charterBundleData`, `charterSitesData`, `plannedRouteData`, `navigationTrackData`, …)
  live at G:238–360 in classic-script global scope. `applySavedCharterBundle` (G:8103) is the single writer.
  `render()` (G:8218) boots everything; `refreshSavedCharterBundle` (G:8176) runs every 30 s while visible.
- API URLs are constants at G:50–64, easy to parameterise. The only URL read today is `location.hash` for the tab.
- **Iframe hazards:** `redirectToGuestLanding()` (G:367) navigates to `/` when idle mode starts below 700 px wide.
  The service worker (`sw.js`, scope `/`) serves `guest.js`/`guest.css` cache-first (`STATIC_CACHE_NAME` v3), so a
  preview sees stale JS until the cache name is bumped; `/api/*`, `/data/*` and `*.json` are network-only. The
  server sets no `X-Frame-Options` or CSP, so a same-origin iframe works.
- **Server side:** `localTodayDateValue` (S:4238) uses the Node process's local timezone (nothing sets `TZ`).
  `buildCharterPayload(charterIdOverride)` already takes a charter id and uses no date; `/api/charter` just doesn't
  pass the query string. `readPlannedRoute(charterId)` and `ensureTrackState(charterId)` take an id too. Only
  `guestVisibleItineraryPlanForToday` needs a date parameter; weather needs both an id and a date.

## 5. Track logging (planned versus actual is possible)

- `maybeRecordTrackPoint` (S:5723) records points at an adaptive interval and buffers writes to disk.
- Storage is `charters/<activeId>/track.json`, shaped `{charter, started_at, updated_at,
  retention_days_after_charter, logging, points[]}`.
- Settings are at `/api/admin/route-track`.
- `/api/track` returns the **whole file, for the active charter only**. There's no date-range query.

## 6. Past charters

- There's no archive or "completed" state. Charters are just folders, and deleting one is permanent.
- The active charter is set by hand (`setActiveCharter`, which checks the date range).
- Dates outside the charter clamp to its first or last day (S:4850).

## 7. Migrations

- `DATA_MIGRATIONS` (S:502) is a list of `{version, name, run(dataDir)}`:
  - v2: `add-charter-date-fields`
  - v3: `import-charter-routes-into-library`
- `runDataMigrations` (S:527):
  1. backs up the whole data directory first
  2. runs the pending migrations in order
  3. records each one in `DATA_DIR/schema-version.json`

  It never migrates down.
- The template's `schema-version.json` is still at 2, while the code is at 3. The next migration must keep both in
  step.

## Riskiest coupling points for the rework

1. **Primary / Alternative is hard-coded in at least four places that must change together:**
   - **server:** `ROUTE_PLAN_IDS`, `normalizeRoutePlanId`, `getActiveRouteForPlan` and the shape of
     `planned-route.json`
   - **the `alt-day` id prefix**, read by the server (S:4823) and the guest app (G:~3030)
   - **admin:** `ITINERARY_PLANS`, the legacy mirrors and `rebuildGuestVisibleItineraryDays`
   - **guest:** `getDisplayedItineraryPlan`
2. **`itinerary.days` is a pre-built copy made in the admin client.** Named alternatives that can change mid-charter
   need it rebuilt on the server, or replaced.
3. **The planned route isn't tied to the itinerary's stops.** Building itineraries from library routes means linking
   the route library to days, and replacing `upload-route`.
4. **"Today" is worked out separately in the server and the guest app.** A preview date must reach both. The guest
   side already takes a `today` option; the server side doesn't.
5. **Saves overwrite whole files with no revision check.** Mid-charter edits from two devices will overwrite each
   other. The route library's revision and 409 pattern is the model to follow.
6. **Public endpoints are tied to the active charter and take no charter id.** Previewing a past or future charter
   needs one. The date override must be **admin-only**.
7. **Changing the data shape needs a migration** (see §7).
8. **`track.json` is one unbounded file**, and the only way to read it returns the whole thing. Showing planned versus
   actual per day needs a date-range read.

## Already built and reusable (Route Planner phases 1–3)

- the route library with revisions
- anchorages
- stops: anchorage stops and plain hold/drift stops
- sites served
- leg speeds, and stop-to-stop legs with times
- KML/GPX import and export
- copy legs for Excel
- the Routes panel's map editing

See [../route-planner/HANDOFF.md](../route-planner/HANDOFF.md) and [../route-planner/spec.md](../route-planner/spec.md).

**Not started, and probably replaced by this rework:**
- Route Planner phase 4: assigning routes to Primary / Alternative
- spec Q2: stops in charter copies

The held branch `feat/routes-retire-upload` removes Route Upload. It should land with whatever replaces route
assignment.
