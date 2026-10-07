# Charter itinerary rework — spec A: model and editor (draft 1)

Written 2026-10-07 from the brainstorm recorded in [decisions.md](decisions.md). Background and the survey of
today's system are in [current-state.md](current-state.md). The approved editor mockup is
`.superpowers/brainstorm/*/content/tube-line-v5.html` (git-ignored; re-create from §5 if lost).

This spec covers sub-projects 1 and 2 of the rework: the new itinerary model with its migration and server
endpoints, and the admin editor rebuilt around it. Two short companion specs follow it:

- **Spec B — guest preview** with a date slider that wraps the live guest site.
- **Spec C — conflict-safe saves** for the remaining charter files. The itinerary file gets revisions in this spec,
  so spec C covers crew, guests, menus and drinks only.

Repos: **S** = `iolanthe/iolanthe-server`, **A** = `portal/iolanthe-admin`, **G** = `portal/iolanthe-guest`.

---

## 1. Decisions this spec is built on

| # | Decision |
|---|---|
| D1 | **Stops are the unit; routes are templates.** A charter itinerary is an ordered list of stops along one route path. The planned route is derived from the itinerary, never stored separately. |
| D2 | **Legs and days are decoupled.** One leg can span more than one day (overnight passage); one day can hold several legs. Days are a time axis laid over the stops, not containers. |
| D3 | **Timing = day plus optional time.** Each stop has an arrival day and a departure day; each may carry a clock time. Missing times are estimated from the previous departure plus leg time at leg speed. Guests see set times only. |
| D4 | **One itinerary per charter.** Primary/Alternative and `active_plan_by_day` go. The route library is the pool of alternatives. Changing course mid-charter = apply a library route *from day N onward*; sailed days stay. |
| D5 | **Library route stops carry an optional `nights`** (default 1 for anchorage stops, 0 for plain stops) and an optional `depart_time`, so a route works as a template. |
| D6 | **Vertical editor, line first.** Days are rows. |
| D7 | **Day edges never land on a stop.** A night at anchor is a dwell loop spanning the edge; an overnight passage is a plain leg crossing it. Edge drags step between discrete snap states (dwell midpoints and leg midpoints). |
| D8–D9 | **Activities** are free items (title, notes, optional time, optional `site_id`) grouped under a stop and a day, orderable. A stop's sites served pre-populate one activity each. No activity library. |
| D11 | A **site activity may only move to a stop that serves its site**. Free-text activities move anywhere. |
| D12 | **Edits live in the charter.** The library route is untouched. A *promote* action writes the charter route back: overwrite the parent, or save as new. |
| D13–D14 | **Layout v5**: titles and timings left of the line; day boxes grow with content; one fixed sub-box per stop the day touches (min one row, empty allowed); activities stacked. |
| D15 | **Stops are added and reordered on the map only**, in the existing Routes editor bound to the charter's route. The line is a read-only rendering of the route. The path *is* the legs. |
| D16 | **Two panels**: Itinerary (line and days, full width) and Route (map). Side-by-side and two-mode layouts were rejected over width. |

Constraints relayed from the captain: no clients for at least a month; legacy data is not a limit as long as it
migrates.

---

## 2. Data

### 2.1 `charters/<id>/itinerary.json` (version 2)

One file replaces today's `itinerary.json` (v1) and `planned-route.json`. The route and the itinerary are the same
object, so one save and one revision cover both.

```json
{
  "version": 2,
  "revision": 7,
  "welcome_message": "Welcome aboard Iolanthe…",
  "summary": "Seven days north from Subic.",
  "route": {
    "source": { "type": "library", "route_id": "north-loop", "route_name": "7-day north loop",
                "revision": 4, "applied_at": "2026-09-01T09:00:00Z" },
    "speed_kn": 8,
    "points": [
      { "latitude": 14.80, "longitude": 120.27, "stop": true, "id": "stp_a1", "name": "Subic Bay",
        "depart": { "day": 1, "time": "09:00" } },
      { "latitude": 14.92, "longitude": 120.15 },
      { "latitude": 14.95, "longitude": 120.11, "anchorage_id": "capones", "id": "stp_b2", "name": "Capones Is.",
        "site_ids": ["capones-lighthouse", "capones-beach"],
        "arrive": { "day": 1 }, "depart": { "day": 2, "time": "08:30" }, "leg_speed_kn": 7 }
    ]
  },
  "activities": [
    { "id": "act_01", "stop_id": "stp_b2", "day": 1, "order": 0, "site_id": "capones-lighthouse",
      "title": "Capones lighthouse walk", "notes": "" },
    { "id": "act_02", "stop_id": "stp_b2", "day": 1, "order": 1, "title": "Sundowners on the beach", "notes": "" }
  ]
}
```

**Top level**
- `version` is `2`. The server upgrades v1 on migration (§2.5) and refuses to save anything else.
- `revision` goes up on every save. A save sends the revision it started from; a stale one gets a 409 (§3.1).
- `welcome_message` and `summary` are the only prose fields. `summary` feeds the screensaver fallback.

**`route`**
- `source`, `speed_kn` and `points[]` are exactly the Route Planner's library route shape (route-planner/spec.md
  §2.1): a point holds its own position; `anchorage_id` or `stop: true` marks a stop; `name`, `site_ids[]`,
  `leg_speed_kn` as there. `source.type` is `library` (with `route_id`, `route_name`, `revision`, `applied_at`) or
  `planner` when built from scratch in the Route panel.
- Three additive fields on **stops only**:
  - `id` — stable, `stp_` + 6 random base-36 chars, assigned when a point becomes a stop. Survives moves and edits.
    Merging two stops keeps the surviving stop's id (route-planner Q3). Removing a stop removes its id and its
    activities (§5.6).
  - `arrive` — `{ "day": <1..N>, "time"?: "HH:MM" }`. Absent on the origin (first stop).
  - `depart` — same shape. Absent on the terminus (last stop).
- A single-stop route has neither `arrive` nor `depart` on it and is an empty charter at anchor; allowed.

**`activities[]`**
- `id` — `act_` + 6 random base-36 chars.
- `stop_id` — a stop's `id`. `day` — a charter day within that stop's span (`arrive.day ≤ day ≤ depart.day`, with
  the missing end open). `order` — 0-based within the `(stop_id, day)` pair.
- `title` (required, ≤120 chars), `notes` (≤2000 chars), `time?` ("HH:MM"), `site_id?`.
- A site activity's `site_id` must be in its stop's `site_ids`. The admin enforces this by adding the site to
  `site_ids` when a site activity is created for a site the stop does not yet serve. The server validates it.

**Derived, never stored**
- **Nights** at a stop = `depart.day − arrive.day`.
- **Days.** For day *d* in `1..N` (N from `charter.json` dates): the stops whose span includes *d*, in route order.
  A day with no stops is a **passage day**. The function is `deriveDays(itinerary, dayCount)` and lives in both
  `itinerary-core.js` (A) and the server's pure module; the two implementations share a fixture test set.
- **Estimated times.** Walk the stops in order. The first set `depart.time` anchors the chain; each later arrival
  estimate = previous departure (set or estimated) + leg duration at the leg's speed. A set `arrive.time` or
  `depart.time` re-anchors the chain. Where no time is set anywhere, nothing is estimated. Guests never see
  estimates.
- **Planned route** = `route.points` as a polyline (§3.4).

**Validation rules** (server 400, admin pre-check): version 2; unique stop ids; every stop except the first has
`arrive`, every stop except the last has `depart`; `arrive.day ≤ depart.day` on a stop; days are non-decreasing
along the route (`depart.day` of stop *k* ≤ `arrive.day` of stop *k+1*); all days within `1..N`; activity days
inside their stop's span; `site_id` served by the stop; times match `HH:MM`. Unknown site ids and anchorage ids
are dropped quietly on load, as the route library does.

### 2.2 `library/routes.json` additions

Two optional fields on stop points, both additive:
- `nights` — integer ≥ 0. Default on read: 1 if `anchorage_id`, else 0.
- `depart_time` — "HH:MM".

`applyRoute` (§3.2) turns them into `arrive` / `depart`; `promote` (§5.4) turns `arrive` / `depart` back into them.

### 2.3 `charter.json`

Unchanged. It is the only source of `start_date` / `end_date`; the v1 itinerary date override is dropped.

### 2.4 Files removed

- `charters/<id>/planned-route.json` — after migration, renamed to `planned-route.v1.json`. The public route
  endpoint derives from the itinerary (§3.4).
- The v1 `itinerary.json` — renamed to `itinerary.v1.json` by the migration.
- `S:97` writable-files list loses `planned-route.json`; `itinerary.json` is served in the bundle but is saved only
  through §3.1.

### 2.5 Migration v4 `itinerary-v2`

Added to `DATA_MIGRATIONS` (S:502). `runDataMigrations` already backs up the whole data directory first. The
template's `schema-version.json` moves to 4 together with the code (it is currently at 2 while the code is at 3;
this migration brings both to 4).

For every `charters/<id>/` with a v1 `itinerary.json`:

1. **Pick the plan.** For a charter whose end date has passed, the plan `active_plan_by_day` records for the final
   day (server rules S:4862); otherwise Primary.
2. **Collapse days into stops.** Walk the plan's days in order. Consecutive days with the same `site_id` form one
   stop: `stop: true`, position from the site, `name` = `title_override` || site title, `site_ids` = [the day's
   `site_id`] ∪ the old stops' `site_id`s, `arrive.day` = first day, `depart.day` = last day + 1. The first stop
   drops `arrive`; the last stop drops `depart`. A day with no `site_id` and no stops is skipped (a passage day).
   A day with stops but no `site_id` uses the first stop's site for position.
3. **Activities.** Each old stop → a site activity `{site_id, title: site title, notes: stop.notes}` on that stop
   and day, in order. The day's `notes` → a free-text activity `{title: first line (≤120), notes: rest}` placed
   first. The old `include_site_notes` flag is dropped: the site's description is reached through the site view,
   not inlined.
4. **Path.** If the chosen plan has coordinates in `planned-route.json`, they become the path and each stop is
   snapped to its nearest vertex (within 1 nm) or inserted at the nearest segment. Otherwise the path is the stops
   alone (straight legs). `source` = `{type: "charter-v1", plan}`; `speed_kn` = 8.
5. **Prose.** `welcome_message` = `plans[plan].welcome_message` || `welcome_message` || `summary`; `summary` kept.
6. **Write** the v2 file with `revision: 1`, rename the old files to `.v1.json`.

A unit test runs the converter over fixture charters (a copy of `data-local` plus hand-built edge cases: no
planned route, alternative active, empty days, day with stops but no site).

---

## 3. Server (`iolanthe-server`)

### 3.1 Save

`POST /api/admin/charter/<id>/itinerary/save` body `{ itinerary, base_revision }`.

- Validates per §2.1; a failure is `400 { error, field }` with a JSON-pointer-ish field path.
- If `base_revision !== stored.revision` → `409 { error: "revision", itinerary: stored }`.
- Else `revision = stored.revision + 1`, write, return `{ itinerary }`.
- The generic `POST /charter/<id>/save` refuses `file === "itinerary.json"` and `planned-route.json` with 400.
- Charter Admin only, bridge VLAN, like the other charter writes.

### 3.2 Apply a route

`POST /api/admin/charter/<id>/itinerary/apply-route` body `{ route_id, from_day, base_revision }`.

Pure function `applyRoute(itinerary, libraryRoute, fromDay, dayCount)` in `lib/itinerary.js`:

1. Keep every stop already *reached* before `fromDay` (its span starts before `fromDay`; the origin always counts
   when `fromDay > 1`) and the path points up to and including the last kept stop. If the last kept stop was still
   there on `fromDay` (or was the terminus), it now departs on `fromDay`, keeping any set time, so the new route
   starts from where the boat actually is. Kept stops keep their activities up to that departure day; activities
   planned for later days are dropped with the stops they belonged to. (`fromDay === 1` keeps nothing.)
2. Append the library route's points. The join is a straight leg from the last kept stop to the route's first
   point. If the route's first point is a stop and the last kept stop is at the same spot (route-planner
   `SAME_SPOT_M`), merge them keeping the kept stop's id.
3. Seed timing. With no kept stop (`fromDay === 1`) the route's first stop is the origin: `depart.day = 1`, no
   `arrive`. Otherwise the first appended stop gets `arrive.day = fromDay`. Every stop then gets
   `depart.day = arrive.day + nights`, and each following stop `arrive.day` = previous `depart.day`, **plus one**
   when the leg's estimated duration (distance at leg speed) from the departure time crosses midnight; the
   departure time is `depart_time` when set, else 09:00 for this estimate only. `depart_time` → `depart.time`.
   The terminus drops `depart`. If the terminus's arrival would exceed `dayCount`, the whole operation is refused
   with `409 { error: "too-long", needed_days }` and nothing is written.
4. Seed activities: one site activity per `site_ids` entry, in order, on the stop's arrival day.
5. `source` = `{type: "library", route_id, route_name, revision, applied_at}` when `fromDay === 1`; otherwise the
   existing source is kept and `source.last_applied = {route_id, from_day, applied_at}` is added.

The endpoint loads the library route, runs the function, saves with the usual revision bump, and returns the
itinerary. Applying to an empty itinerary from day 1 is the ordinary first assignment.

### 3.3 Promote

No new endpoint. The admin builds a library route from `itinerary.route` (`promoteRoute` in `itinerary-core.js`:
strip `id`, `arrive`, `depart`; set `nights` and `depart_time`; `source = {type: "planner"}`) and calls the
existing `POST /api/admin/routes/save` with either the parent's `id` + its `revision` (overwrite) or a blank `id`
and a name (save as new).

### 3.4 Public endpoints

- `GET /api/charter` — unchanged route; the bundle's `itinerary` is now v2. The guest derives days.
- `GET /api/planned-route` — built from the active charter's `route.points`:
  `{ source, routes: [{ name, coordinates: [{latitude, longitude}] }] }`. For **one release** the legacy wrapper is
  kept too: `route: { primary: { source, routes } }` and `activePlan: "primary"`, so a cached pre-rework guest
  still draws a line. A follow-up removes it once the guest release is confirmed live.
- Weather stop selection (`selectActiveCharterWeatherLocations`, S:2994) picks the stop whose span includes today
  and the next stop after it, by `arrive.day` / `depart.day`, instead of the site of the day.

### 3.5 Removed

`ROUTE_PLAN_IDS`, `normalizeRoutePlanId`, `getActiveRouteForPlan`, `writePlannedRoutePlan`, `readPlannedRoute`'s
plan logic, `displayedItineraryPlanForDay`, `guestVisibleItineraryPlanForToday`, the `alt-day` prefix check
(S:4823), `POST /charter/<id>/upload-route`. The never-built `assign-route` / `unassign-route` from the Route
Planner plan are dropped. `displayedItineraryDayNumberForDate` stays (weather uses it).

### 3.6 Admin bundle

`GET /api/admin/charter/<id>` returns the v2 itinerary; `planned-route.json` is no longer in the bundle list
(S:98).

---

## 4. Admin: Itinerary panel (`iolanthe-admin`)

### 4.1 Layout (v5)

```
┌ header: <charter name> · <dates> · [Edit route] [Apply library route…] [Promote to library…] [Preview as guest] ┐
│ welcome message (Edit / Preview)                                           ┌ static map thumbnail ┐            │
│                                                                            └───────────────────────┘            │
│  titles        line   ┌ Day 1 · Mon 12 Oct ───────────────────────────────────────────────────┐                 │
│  Subic Bay      ⊔     │ ┌ sub-box: Subic ────────────────── [+] [⋮⋮ Welcome aboard …     ×] ┐ │                 │
│  Dep. 0900      │     │ └────────────────────────────────────────────────────────────────────┘ │                 │
│  Anawangin      ●     │ ┌ sub-box: Anawangin ───────────────[+] [⋮⋮ Anawangin Cove …     ×] ┐ │                 │
│  ~1130 · 1400   │     │ └────────────────────────────────────────────────────────────────────┘ │                 │
│  Capones Is.   ╭─╮    │ ┌ sub-box: Capones ─────────────────[+] [⋮⋮ Lighthouse walk      ×] ┐ │                 │
│  ~1545 · 0830  │ │    │ │                                        [⋮⋮ Sundowners           ×]  │ │ ◄ edge handle   │
│                │ │    ├ Day 2 · Tue 13 ──────────────────────────────────────────────────────┤                 │
│                ╰─╯    │ ┌ sub-box: Capones (empty, one row) ────────────────[+]              ┐ │                 │
│  Hermana Mayor ╭─╮    │ ┌ sub-box: Hermana ────────────────[+] [⋮⋮ Snorkel the reef     ×] ┐ │                 │
│  …                                                                                                                │
```

- **Titles column**: stop `name` in bold, under it `Arr. HH:MM · Dep. HH:MM` (set times upright, estimates italic
  with `~`; "N nights" when > 1; "At anchor" on a middle day of a multi-night stop). Vertically centred on the
  stop's dot or loop.
- **Line**: Underground-style open terminus loops at origin and end; a filled dot for a stop left the same day; an
  open loop for a stop with ≥1 night, running from its sub-box in the arrival day to its sub-box in the departure
  day. Passages, including overnight ones, are the plain line. Nothing else is drawn on the line.
- **Day boxes**: "Day N · <weekday day month>" (the last adds "· ends HH:MM" from `charter.json` if present).
  Height = content. Contain one **sub-box per stop** in `deriveDays(d)`, min one activity row high, no title, not
  user-addable or removable. Activities stack inside; a small `+` sits in the sub-box's left gutter.
- **Edge handles**: a short bar at the right end of each day boundary.
- **Empty itinerary**: day boxes with no sub-boxes and a hint: "Apply a library route or Edit route to start."
- **Map thumbnail**: non-interactive Leaflet (or static SVG from points) with the path and stop dots; click →
  Route panel.

### 4.2 Edge drags

An edge between day *d* and *d+1* has a current snap state: it lies inside stop *k*'s dwell (night at *k*) or on
leg *k→k+1* (passage). Dragging steps to the neighbouring state, one step per snap target crossed. **Each step
changes exactly one field of one stop and never cascades**, because every step keeps the day order valid on its
own:

| Edge is… | Dragging the edge down (later) | Dragging up (earlier) |
|---|---|---|
| inside the dwell of stop *k* | onto leg *k→k+1*: `k.depart.day = d`. Stop *k* now leaves on day *d* and the night is at sea. | onto leg *k−1→k*: `k.arrive.day = d+1`. Stop *k* is now reached on day *d+1*. |
| on leg *k→k+1* | into the dwell of *k+1*: `k+1.arrive.day = d`. Guests reach *k+1* before the day ends and sleep there. | into the dwell of *k*: `k.depart.day = d+1`. One more night at *k*. |

- The edge can't be dragged past the terminus's arrival or the origin's departure (there is no state beyond them),
  so no end-of-charter check is needed here.
- Activities whose `day` falls outside their stop's new span move to the nearest day inside it.
- Times are kept as set; estimates recompute.
- Cascading (shifting every later stop) happens only from the stop popover, §4.3.

### 4.3 Stop popover

Click a dot or loop (or the title): popover with **Arrival** (day select + time), **Departure** (day select +
time), **Nights** (read-only, derived), **Sites served** (ticks, ordered by distance, as the Route Planner's picker),
**Open on map** (→ Route panel with this stop selected). Clearing a time returns it to an estimate.

Day changes made here **cascade**: changing a stop's `depart.day` by Δ shifts `arrive.day` and `depart.day` of
every later stop by Δ, so their nights are kept. Changing `arrive.day` moves only that stop and is clamped to
`prev.depart.day ≤ arrive.day ≤ depart.day`. If a cascade would put the terminus's `arrive.day` past N, the change
is refused with the status line "Day 7 is the last day"; a `depart.day` can't go below 1.

### 4.4 Activities

- **Add** (`+` in a sub-box): a small menu with three groups: *Sites served here* not yet added on this day; *Other
  sites* (type-ahead over the site library; choosing one also adds it to the stop's `site_ids`); *Free text*
  (creates an untitled activity in edit mode).
- **Edit**: click the activity → inline title, notes, optional time. Enter / blur commits to the draft.
- **Remove**: `×` removes without confirm (Save is explicit; Cancel restores).
- **Drag** (grip `⋮⋮`), pointer events, mouse and touch:
  - within a sub-box: reorder;
  - to the same stop's sub-box on another day in its span: move;
  - to another stop's sub-box: allowed only if `site_id` is in that stop's `site_ids`, or the activity is free text.
    Disallowed targets do not highlight and the drop snaps back.
- Site-backed boxes have a solid border; free text dashed. The title shows the site name by default.

### 4.5 Saving

As `routes.js`: a `work` draft with `savedJson` snapshot; Save enabled when different; `setPageUnsavedGuard` while
dirty; Save sends `{itinerary, base_revision}`; a 409 opens the existing clash prompt (Reload / Cancel) and
`applySaved` keeps in-flight edits where it can. Welcome-message edits are part of the same draft and the same Save.
No autosave.

### 4.6 Header actions

- **Edit route** → Route panel in charter mode (§5). Blocked while dirty ("Save or cancel first").
- **Apply library route…** → modal: route picker (name, stops, nights total, length), **From day** select
  (default: day 1 for a charter not started, today for one in progress), a preview line "Keeps 2 stops, replaces
  from Day 3; route needs 5 days, 5 remain". Confirm → §3.2; a `too-long` 409 shows "Needs 6 days, 5 remain".
- **Promote to library…** → modal: *Overwrite "<parent name>"* (only when `source.type === "library"` and the
  parent still exists) or *Save as new route* with a name field → §3.3.
- **Preview as guest** → spec B. Hidden until that lands.

### 4.7 Removed from the admin

Itinerary panel internals: plan selector, `renderItinerarySwitchControls`, `switchGuestItineraryFromToday`,
`openItineraryDayModal`, `openItineraryStopEditor`, `rebuildGuestVisibleItineraryDays`, `syncItineraryPlanForSave`,
`stripItineraryTimingFields`, `ITINERARY_PLANS`, `itineraryPlanById`, `ensureItineraryPlans`,
`normalizeItinerary` (v1), `normalizeItineraryDayList`, `swapItineraryRows`, `openCreateSiteModal` (dead). Route
Upload panel and `uploadRoute` (land `feat/routes-retire-upload`).

### 4.8 Code shape

- `itinerary-core.js` — pure, also a Node module, tests in `test/`: `deriveDays`, `estimateTimes`, `edgeStates`,
  `moveEdge` (with cascade and limit), `canDropActivity`, `promoteRoute`, `normalizeItinerary` (v2 read with
  defaults), `validateItinerary` (mirror of the server rules).
- `itinerary.js` — the panel: render, drag, popover, modals, saving; wired like `routes.js` through
  `window.IolantheAdmin` (`api`, `setStatus`, `showAdminConfirm`, `setPageUnsavedGuard`, `openSiteEditorModal`).
- `itinerary.css` — scoped under `.itinerary-panel`.
- `admin.js` loses §4.7 and gains only the panel mount and the `IolantheAdmin` bridge for anything new it needs.
- Access: Charter Admin only (same as today's itinerary).

---

## 5. Admin: Route panel (charter mode)

The existing Routes panel gains a **subject**: *Library routes* (as today) or *This charter's route*.

- **Load**: `work.route = bundle.itinerary.route` plus the itinerary for activities; `savedJson` from it.
- **Save**: `POST …/itinerary/save` with the whole itinerary (route replaced, activities adjusted per below),
  `base_revision`, same clash handling. The library Save As is replaced by **Promote to library…** (§4.6).
- **Stops**:
  - A point that becomes a stop gets an `id` and zero nights, for the captain to adjust on the line: between stops
    *k* and *k+1* it gets `arrive.day = depart.day = k.depart.day`; before the origin it becomes the new origin
    with `depart.day = 1` and the old origin gains `arrive.day = 1`; after the terminus it becomes the new terminus
    with `arrive.day` = the old terminus's `arrive.day`, which gains `depart.day` of the same value. Its `site_ids`
    auto-link as today (2 nm); no activities are seeded (the `+` menu offers them).
  - A stop that stops being a stop (or is deleted): its activities are deleted after a confirm listing them.
  - Merge (Q3): the surviving stop keeps its id and the union of activities.
  - Reordering by reshaping the path keeps stop ids; days are re-derived; if the order of `arrive.day`s is no
    longer non-decreasing, the panel re-seeds days from the first out-of-order stop (zero nights each) and shows
    "Days reset from <stop>; fix them on the Itinerary panel".
- **Line strip**: not shown (D16); the Stops tab lists stops with their day span.
- **Back to days** button → Itinerary panel.
- **Read-only** after the charter's end date (route-planner §4.5 rule): no editing, no Save; viewing is fine.
- Library mode is unchanged except that stop popups gain **Nights** and **Default departure** fields (§2.2).

---

## 6. Guest app (`iolanthe-guest`)

- **`getItineraryDays`** (G:2703) reads v2: `deriveDays(itinerary, dayCount)` from the charter dates. Output per
  day: `{ dayNumber, date, stops: [{ id, name, arriveTime?, departTime?, activities: [...] }] }`. A v1 payload
  (no `version`) is converted on the fly by a small `itineraryV1ToDays` function for **one release**: each
  Primary-plan day becomes one stop block named from `title_override` or the site, with the day's stops as site
  activities and its notes as a free-text activity. Alternatives are ignored. The converter is deleted once the
  server release is confirmed live.
- **Day card** (`renderSelectedDay`, G:7794): one block per stop. Header = stop `name` + "Arrive HH:MM" /
  "Depart HH:MM" only when set. Then activities in order: title, notes, time if set, camera button → the linked
  site's images (`itineraryMediaEntriesForStopSite` keyed by `site_id`). A **passage day** renders "Underway ·
  <previous stop> to <next stop>" and nothing else. An empty stop block shows nothing extra.
- **Pills** and status (`guestItineraryDayStatus`) unchanged. Default selection unchanged.
- **Welcome message** = `welcome_message` || `summary`.
- **Planned route**: read `routes[]` from §3.4; drop `getDisplayedItineraryPlan`, the alt-day check (G:~2970) and
  the primary/alternative branch in `normalizePlannedRouteData`.
- **Pins** (`syncNavigationItineraryOverlay`): one per stop (stop position, popup "Day N · name"), and one per site
  activity at the site's position (smaller marker).
- **Screensaver** (`syncIdleItinerarySection`): Today / Tomorrow line = stop names joined with " → ", then the
  first activity title.
- **Menu of the day**: unchanged.
- `sw.js`: bump `STATIC_CACHE_NAME`.

---

## 7. Rollout

1. **Server**: migration v4, endpoints, derived planned route with the legacy wrapper. Rehearse the migration on a
   copy of the live data directory on docker-vm; verify every charter converts; keep the runner's backup.
2. **Admin**: Itinerary panel + Route panel charter mode; retire Route Upload. Merge to main (cron pulls).
3. **Guest**: v2 reader with v1 fallback; cache bump.
4. **Follow-up**: remove the planned-route legacy wrapper and the guest v1 fallback once both are confirmed live.

No feature flag: no live clients for at least a month.

Suggested build order for the implementation plan, each step shippable on its own:

1. Server: `lib/itinerary.js` pure module with tests; migration v4; save and apply-route endpoints; derived
   planned route with the legacy wrapper.
2. Admin: `itinerary-core.js` with tests; Itinerary panel read-only (line, days, sub-boxes, activities displayed).
3. Admin: edge drags, popover, activity add/edit/remove/drag, Save with 409.
4. Admin: Route panel charter mode; Apply and Promote modals; remove the old panels and Route Upload.
5. Guest: v2 reader with the v1 converter, day card, pins, screensaver; cache bump.
6. Cleanup: remove the legacy wrapper and the v1 converter.

---

## 8. Testing

- **Server** (`node --test`): `lib/itinerary.js` — `deriveDays`, `applyRoute` (keep/replace boundary, same-spot
  merge, midnight-crossing legs, `too-long`), `validateItinerary` (each rule), `migrateItineraryV1` over fixtures.
  Endpoint tests: save happy path, 400 per rule, 409 clash returns stored, generic save refuses the two files.
- **Admin** (`node --test test/`): `itinerary-core.js` — `deriveDays` (shared fixtures with the server),
  `estimateTimes` (anchor and re-anchor), `edgeStates` / `moveEdge` (all four transitions, cascade, both limits,
  activity day clamping), `canDropActivity`, `promoteRoute` round-trips `applyRoute`. Manual checklist: drag with
  mouse and with touch on the bridge tablet; 409 prompt; Apply from today mid-charter; Promote both ways.
- **Guest**: extract `deriveDays` into a pure function and test it if the repo has a runner; otherwise verify via
  the preview (spec B) and the live site on the docker-vm staging data.

---

## 9. Out of scope (for now)

- Guest preview with a date slider — **spec B**.
- Revisions for the other charter files — **spec C**.
- Highlighting today's leg or stop on the guest map.
- Per-day track reads (`/api/track` date range) — needed by spec B for past-charter review.
- A reusable activity library (D9 says grow it later if the captain keeps retyping).
- Any change to crew, guests, menus, drinks, notices, watches.
- "Edited since applied" badges comparing `source.revision` with the library route.

## 10. Open questions

None blocking. Items the implementation plan should confirm on first contact with the code:

- Whether `routes.js`'s subject switch is cleaner as a `ctx.subject` option on `IolantheRoutes.bind` or as a second
  bind on the Itinerary panel's "Edit route" target.
- Exact snap tolerance for migration path snapping (1 nm proposed).
