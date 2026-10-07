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

**Not yet surveyed:** click counts for common tasks (add a day, add a stop, change a site) and the day modal's
internals.

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
- **Not yet surveyed:** how each day is rendered in detail, and what every time call does.

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
