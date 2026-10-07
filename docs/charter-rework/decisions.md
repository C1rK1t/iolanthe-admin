# Charter rework — brainstorm decisions (running log)

Started 2026-10-07. Each line is a decision David made during the brainstorm. The spec is written from this.

## Scope

- Four sub-projects, one spec each, in this order:
  1. New itinerary model built on library routes, named alternatives replace Primary/Alternative, plus migration.
  2. Admin itinerary editor rebuilt around it, with drag and drop.
  3. Guest preview with a date slider, wrapping the live guest site.
  4. Conflict-safe saves (revision + 409), copying the route-library pattern.

## Sub-project 1: the model

- **D1. Stops are the unit; routes are templates.** The itinerary is an ordered list of stops. Attaching a library
  route seeds stops. Legs between consecutive stops are computed. The planned route is derived from the itinerary,
  not stored separately.
- **D2. Legs and days are decoupled.** One leg can span more than one day (overnight passage). One day can hold more
  than one leg. So days are a time axis over the stops, not containers that stops belong to.
- **D3. Timing level B: day plus optional time.** Each stop has an arrival day and a departure day; each may carry
  an optional clock time. Missing times are filled with a suggested ETA from the route planner's leg speed and
  distance. The guest card shows a time only when the captain set it.
- **D4. One itinerary per charter; the route library is the pool of alternatives.** A charter holds exactly one
  itinerary (a stop list placed on days). Primary/Alternative and `active_plan_by_day` go away. Nothing is stored
  as "alternatives" inside the charter. To change course, the captain picks a library route (or builds a new one) and
  applies it *from day N onward*: stops before day N stay as sailed, stops from day N on are replaced by the route's
  stops seeded onto the remaining days. In practice one itinerary is locked weeks ahead; two-ready-to-go only
  happened once, for weather.
- **D5. Library route stops carry an optional `nights` dwell** (default 1 for anchorage stops, 0 for plain hold/drift
  stops). Applying a route from day N walks the stops adding nights, and uses leg times to flag passages that run
  overnight. The library route is therefore a reusable itinerary template.

## Sub-project 2: editor ideas captured early (not yet decided)

- David's picture: the route drawn as a line start to finish with a dot per stop, like a London Underground line
  map. Days overlaid as boxes that resize like Excel row heights / column widths, snapping to leg times or the
  midpoints between stops. A boundary on a stop = a night at anchor; a boundary on a leg = an overnight passage.
- **D6. Vertical layout (days as rows), line first.** Horizontal would clutter on long charters. Column order: the
  line with its stops on the left, then the day rows, with activity boxes inside the day rows.
- **D7. Day edges never land on a stop** (that would mean arriving at midnight). Every stop is drawn as a dwell bar
  from arrival to departure. An edge inside a dwell bar = a night at anchor there; an edge on a leg = an overnight
  passage. Snap targets are dwell-bar midpoints and leg midpoints, so dragging an edge steps between discrete states
  rather than resizing freely. Within a day, stops are spread evenly (one stop centred, two equally spaced), not by
  clock time.
- **D8. Activities are a new concept.** Each is a small box inside a day row, dragged in from a list. At least one
  per stop, possibly several per stop; an activity hangs off at most one stop. Definition still to be decided.
- **D9. Activity = a free item that may point at a site.** Fields: title, notes, optional time, optional `site_id`.
  A linked site supplies images and description. Activities are grouped under their stop and are orderable. The
  stop's "sites served" from the route setup pre-populate one activity box each; the captain adds or removes sites or
  free-form activities per stop as he sees fit. No new activity library (can grow later).
- **Editor visual refinements (2026-10-07):** stop names right-aligned to the left of the line, or dropped (guests care
  about the site, not the anchorage). Overnight anchorages are open loops; day stops are plain dots. Overnight passage
  is a plain line, not dashed. No connector lines between activities and the line. This editor is crew-facing only
  for now.
- **D10. Editor layout v4 (2026-10-07):** Underground-style open terminus loops mark the route's origin and terminus.
  No moon symbols. Stop titles live inside the day box, in a column to the left of the activity boxes; under each
  title, smaller: "Arr. 0900 / Dep. 1630". Estimated arrival is pre-populated from the previous departure plus the
  leg time. Clicking a stop's dot or loop on the line opens arrival/departure editing; default times may be stored
  on the library route stop as well.
- **D11. Activity movement rules.** Activities reorder freely within a stop. A *site* activity may only move to a
  stop whose sites-served list includes that site (no Children's Island cave at Subic Bay). Free-text activities
  move anywhere.
- **D12. Times and edits live in the charter; the library route is a template.** Once a route is assigned, all edits
  are separate from the library route. Library route stops carry defaults (`nights`, optional default departure
  time). A "promote" action can write the charter's current route back: overwrite the parent library route, or save
  it as a new library route.
- **D13. Editor layout v5 (David's sketch, 2026-10-07):**
  - Stop titles (bold) with timings underneath sit to the LEFT of the line, aligned with the stop's dot or loop.
  - Day boxes carry "Day N · date" and grow and shrink dynamically with their contents.
  - Inside a day box there is one sub-box per stop that falls within the day: no title, minimum one row high even
    when empty, and the user cannot add or remove them. Their number is set by the stops the day spans. Activities
    are added inside them, stacked vertically (never side by side).
  - A night loop visually joins the same stop's sub-box in day N to its sub-box in day N+1.
- **D14. Editor layout v5 approved as the base** (`.superpowers/brainstorm/*/content/tube-line-v5.html`). More tweaks
  expected later.
- **D15. Stops are added and reordered on the map only.** The charter's route opens in the existing Routes map
  editor, bound to the charter's copy instead of a library route. Add a stop by making a point a stop; reorder by
  reshaping the path. The line is a read-only rendering of the route that recomputes days as the route changes. The
  path *is* the legs.
- **D16. Two panels: Itinerary (line and days, full width) and Route (map).** The Itinerary panel shows a small
  static map thumbnail with an "Edit route" button that jumps to the Route panel, which is the existing Routes editor
  in a "charter route" mode. Coming back redraws the line. Side-by-side (A) and two-mode (C) were rejected over
  horizontal width and scrolling.

## Design sections approved

- **S1 Data model (approved):** one `itinerary.json` v2 per charter holding `revision`, `welcome_message`, `summary`,
  `route` (Route Planner point shape + stable `id`, `arrive`, `depart` on stops; `{day, time?}`), and `activities[]`
  (`stop_id`, `day`, `order`, `title`, `notes`, optional `site_id`). Days and nights are derived. Library route stops
  gain optional `nights` and `depart_time`. Planned route is derived from `route.points`; `planned-route.json` goes
  away after migration. Charter dates live only on `charter.json`.
- **S2 Server (approved):** `itinerary/save {itinerary, base_revision}` with 400 validation and 409 clash;
  `itinerary/apply-route {route_id, from_day, base_revision}` as a server-side pure module with tests; promote via
  the existing `routes/save`; public planned-route derived from points with the legacy wrapper kept one release;
  plan ids, alt-day, upload-route removed; weather stop selection by arrive/depart span; migration v4 collapses
  consecutive same-site days into stops, keeps `.v1` copies, template schema → 4.
- **S3 Admin editor (approved):** v5 layout panel with Edit route / Apply library route / Promote / Preview actions
  and a static map thumbnail; discrete edge drags that cascade later stops and respect the charter end; stop popover;
  activity "+" menu, inline edit, pointer-event drag with the D11 rule; explicit Save + guard + base_revision + 409
  prompt; Route panel with a charter-route subject (activities deleted with confirm when a stop goes; inserted stops
  get id and zero nights; read-only after end date); old itinerary UI, Route Upload and legacy mirrors removed;
  `itinerary-core.js` (pure, tested) + `itinerary.js` + `itinerary.css`; Charter Admin only.
- **S4 Guest (approved):** days derived in the guest; day card = one block per stop touched (stop name as context,
  set times only), activities under it, passage card for stop-less days; single welcome message; pins for stops and
  activity sites; screensaver uses stop names + first activity; v1 fallback for one release; SW cache bump.
- **S5 Testing and rollout (approved):** server pure-module + endpoint tests, migration rehearsal on a copy of live
  data; admin `itinerary-core.js` tests + manual drag checklist; guest pure day derivation; rollout server → admin →
  guest, no feature flag.

## Execution notes

- **2026-10-07 plan 1 (server) done** on `iolanthe-server` branch `feat/itinerary-v2`, 16 commits, 52 tests. The
  checklist found and fixed one bug: `itinerary/save` must check the payload's own `version` before normalising.
  Template charters now ship as v2. Docker-VM migration rehearsal deferred to deploy time.
- **2026-10-07 plan 2 (admin core + read-only panel) done** on admin branch `feat/itinerary-v2`, verified in the
  browser against migrated dev data. Fix found in the browser: origin/terminus marks must span a multi-day dwell
  (open-ended loop), not sit on the first day only.
- **Polish for the tweak round (not blocking):** the route thumbnail wraps under the header at 1024 px instead of
  sitting top right; `renderGalley` still runs the v1 itinerary normaliser (plan 4 must give the Galley panel a v2
  day count before deleting it).
