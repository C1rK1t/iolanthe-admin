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
- **2026-10-07 plan 3 (admin editing) done** on admin `feat/itinerary-v2`, verified in the browser: keyboard and
  pointer edge steps, popover, add menu, inline edit, real pointer drag of an activity to another stop, Save
  (revision 2 on the dev server), Cancel with the discard dialog, Apply and Promote modals. Fixes found in the
  browser: admin global `button` styles swelled the edge handles (hardened), oversized popover checkboxes, thumbnail
  wrapping (header is now a two-row grid). Implementer's sound deviations: edges overlay not confined to grid column
  3; `.itinerary-panel` positioned for the popover; handles re-positioned on resize.
- **2026-10-07 plan 4 (Route panel charter mode + removals) done** on admin `feat/itinerary-v2`, verified in the
  browser: all Charter/Galley/Hotel panels load with no script errors after ~1,500 lines of v1 itinerary code were
  removed; Edit route opens charter mode (picker and name hidden, note, day spans on Stops cards, "Charter route ·
  revision N"); deleting a stop with activities → Save → "Remove stops?" confirm → revision 3 on the server with the
  activities gone; subject switch back to library mode shows the unchanged library actions; Back to days re-derives
  the itinerary. Extra fixes: Galley day count now from charter dates (not the v1 normaliser); charter-mode header
  meta; every admin asset tag at `admin-itin-v2`.
- **2026-10-07 plan 5 (guest) done** on guest `feat/itinerary-v2` (8 commits, 7 tests), verified in the browser against
  the dev server: nine day pills, stop blocks with activities and notes, v2 module drives `getItineraryDays`. Fixes
  made during execution: one pin per stop; idle map shows stops only; camera button normalises site media as v1 did.
  Not verifiable locally: map pins (no vessel position) — check on the boat. **Deploy caution:** `guest.js` has no
  `?v=` cache-buster and the server sends no cache headers, so a tablet can keep a stale `guest.js` until its service
  worker updates; plan 5 Task 8 (one release later) is the moment to add a `?v=` to the guest script tags too.
- **State at end of 2026-10-07:** all five plans executed on `feat/itinerary-v2` branches in server, admin and guest.
  Nothing merged to any `main` (admin and guest mains auto-deploy). Open: merge/PR decision, Docker-VM migration
  rehearsal, deploy order server → admin → guest, then plan 5 Task 8 cleanup; specs B and C still to brainstorm.
- **2026-10-07 PRs opened and rehearsal done.** PRs: server C1rK1t/iolanthe-server#1, admin C1rK1t/iolanthe-admin#5,
  guest C1rK1t/iolanthe-guest#1. Migration rehearsed on docker-vm in a throwaway container against a copy of the
  live data volume: 6 charters converted (3 future ones were empty in v1 → 0 stops; csaba 8 stops / 24 activities;
  larry 3 / 3 but has no dates), all validate, backup and `.v1` copies written, live container untouched. Merge
  order when ready: server (then `./update.sh` on the vessel) → admin → guest.
- **2026-10-07 server DEPLOYED.** PR iolanthe-server#1 merged as `a14009f`; `./update.sh` on the vessel rebuilt and
  restarted `iolanthe-server`. Live migration v4 ran at startup: backup `data-before-migration-2026-10-07-104626`,
  6 charters converted (same counts as the rehearsal), schema 4, `/api/charter` version 2, `/api/planned-route` 200.
  The live admin (still old `main`) has an Itinerary panel that no longer matches the data until admin#5 merges;
  the live guest shows the active `test` charter, which is empty anyway. Next: merge admin#5, then guest#1.
- **2026-10-07 ALL THREE DEPLOYED.** admin#5 merged `b947078`, guest#1 merged `a83e066`; both pulled onto the vessel
  and served (admin assets at `admin-itin-v2`; guest `itinerary-days.js` + `guest.js` v2, SW cache v4). The charter
  itinerary rework spec A is live. Follow-ups: plan 5 Task 8 one release later (drop the v1 converter and the legacy
  planned-route wrapper, add `?v=` to the guest script tags); captain's tweak round on the editor; specs B and C.

## Spec A2 brainstorm (2026-10-08): "the Route page is the itinerary"

Captain's reaction to the first version: "Why don't we just set up the Itinerary on the route page?" He found the two
panels and the apply-a-route step hard to follow. Model, server and guest stay as they are; the admin gets one
workplace per charter.

- **A2-D1. Stay length is set by picking the departure day as a date.** Each stop card shows "Arrive <date> · Depart
  <date> · <time>"; Depart is a date picker whose earliest choice is the arrival day. "N nights" is shown as a derived
  label. Library templates keep storing `nights` underneath.
- **A2-D2. The tube-line day view survives as a read-only tab inside the Route page** (beside Stops and Legs). Drag
  handles, popover and add menus go. The separate Itinerary panel goes.
- **A2-D3. Route planner stays as it is; clicking a stop opens a stop card.** No layout change to the Route panel.
  The card carries Arrive, Depart (date picker + time), sites served, and one Day tab per day the stop spans, where
  the itinerary items for that day are added, edited and removed. Day tabs are created dynamically from the dates;
  moving a departure earlier must not silently lose a filled day (warn / move the items).
- **A2-D4. Arrive is derived** (previous departure + leg at its speed, rolling past midnight); the day is never typed,
  the time may be pinned. The origin's arrival is the itinerary start date and boarding time.
- **A2-D5. Stop cards are a carousel.** Only the current card is fully visible; the edges of the previous and next
  cards show. Previous / Next scroll it, Done closes it. A change that affects other stops tints those cards (they
  must be visited to confirm); the last card stays tinted until the route's days match the charter's.
- **A2-D6. Shortening a stay removes that day's items after a popup**: "Changing the date will remove the itinerary
  entries for the 14th and 15th" with OK / Revert. (Not silent moving.)
- **A2-D7. Style:** more graphical, less text; reuse the Route screen's icon buttons (no button text unless needed).
  A style guide for the whole Admin is wanted; this spec adopts the Route panel's look and the guide is a separate
  task (see memory "Iolanthe Admin style rollout").
- **A2-D8. Served sites move off the card face into a stop utility tab** (stop settings) alongside the Day tabs.
- **A2-D9. Global stops.** Like anchorages, a stop can be saved globally and shown on every route map; the legend gets
  Anchorages and Stops toggles.
- **A2-D10. Itinerary items colour-code timing conflicts** with each other and with the stop's arrival/departure.
- **A2-D11. Carousel visual (David's sketch):** every stop is visible as a stacked card edge either side of the
  current card, so the whole route's state is readable at a glance. Red edge = dirty (a change upstream altered its
  dates; needs checking); green last edge = the route's days match the charter's; plain = fine. Any change that
  alters the number of days dirties all downstream stops. Visiting a dirty card clears it automatically (no confirm).
- **A2-D12. Clash rule:** items have a time and an optional duration (default 1 h); a clash is overlapping items on
  the same day, or an item before the arrival or after the departure on the day the boat arrives or leaves.
- **A2-D13. Global stops live in the anchorages library with `kind: "stop"`**; one editor, one map layer, two legend
  toggles (Anchorages, Stops) filtering by kind.
- **A2-D14. One record shape.** "Route" and "itinerary" are synonyms: a record is the path, the stops with their
  stays (arrive/depart days and times), and the itinerary items. A library route is the same record with no items.
  Starting a charter from any record imports everything, with an option to strip the items. The charter-vs-library
  distinction is blurred; the library's `nights`/`depart_time` template fields are replaced by the same arrive/depart
  days as a charter (relative to day 1).
- **A2-D15. The library stays** as a store of records with no charter and no items. The Route page keeps "Working
  on" (this charter's route / a library route); library cards show stays but no Day item tabs. "Start from…" on an
  empty charter lists library routes and previous charters; importing offers to strip items. "Save to library" strips
  items.
- **A2-D16. Saving with red (dirty) cards is allowed.** The header shows the count ("3 stops to check") and the dirty
  stop ids are stored with the record, so the red edges survive a reload.
- **A2-D17. One page: carousel docked below the map.** Clicking a stop on the map spins the strip to its card; opening
  a card centres the map. The side column loses its Stops list (the strip is the stops) and keeps stats, Legs, a
  read-only Days tab, layer toggles, Start from… / Save to library. Header gains the start date, boarding time and the
  fit indicator. Approved as the shape to build.
- **Logged for later (David, 2026-10-08):** stacked card edges get progressively narrower away from the open card;
  the fit indicator should be as short as possible, ideally graphical with a tooltip; the right-hand stack in the
  page mockup was mis-drawn (mockup artefact only).
- **A2-S1 Record (approved):** v2 shape plus optional `duration_min` on items, `dirty_stop_ids` on the record,
  anchorage `kind`; library records drop `nights`/`depart_time` for arrive/depart days and never carry items; arrival
  days are computed by the admin; fit and clashes computed, never stored; `too-long` refusal removed; migration v5.
  **Start date/time is the charter's `start_date` (and a boarding time on the charter), locked, not an itinerary
  field** — no override, to avoid inconsistency. Library records have no start.
- **A2-S2 Server (approved):** `itinerary/import {source, from_day, strip_items, base_revision}` replaces apply-route
  (re-bases days, items travel, no length refusal); save accepts `duration_min` and `dirty_stop_ids`; library saves
  take arrive/depart days and drop items; anchorages `kind`; charter summaries gain a stop count; migration v5.
- **A2-D18. "Library route" = "unassigned route".** In the Route page's record picker, library routes appear under
  an "Unassigned" heading rather than "Library"; the words library/unassigned mean the same record.
- **A2-S3 Route page (approved)** as presented: pill fit indicator, side column without a Stops list (Legs + read-only
  Days), strip docked below the map, card with Arrive/Depart/Next-leg tiles, Day tabs + ⚙ tab, items with coloured
  bars, popup guard for dropped days, dirty cascade, Start from…, `stop-cards.js`, Itinerary panel deleted.
  **Correction to S1/S2 and D14/D15: unassigned routes MAY carry items** (standard items for that route). Save As
  keeps them; the server does not strip on library save. The strip-items option lives on import, for both sources.
- **A2-S4 Guest, data, rollout (approved).** Guest app untouched; its stylised paper-list itinerary look is to be
  preserved as it is for now. Migration v5; rollout server (rehearsed) → admin; the Itinerary panel and the Apply
  dialog go in the same admin release that adds the strip.
- **A2-D19 (notes, 2026-10-08):** clicking a card edge jumps to that card; ← / → scroll the carousel; map stop →
  card and card → map pan are both-ways. **Spec A2 approved by David**; next = implementation plans.
- **A2-D20 (planning, 2026-10-08).** Re-basing on import maps the record's **day 1** onto the from-day (delta =
  from-day − 1), so nights spent at the origin survive. The over-the-end validation rule from spec A is removed
  (server plan task 1; the admin core mirrors it in plan A2-02). Library stop ids accept any `[A-Za-z0-9_-]{1,40}`.
- **Handoff (end of 2026-10-08 session):** server plan `plans/a2-01-server.md` written and dry-run (new code
  assembled onto the committed module: 62/65 pass; the 3 failures are the pre-existing exact-object tests the plan
  says to extend). **Admin plan `a2-02-admin.md` still to write** — it needs a fresh verbatim survey of `routes.js`,
  `routes-lists.js`, `routes-places.js`, `routes-popup.js`, `routes-ui.js`, `itinerary.js` (Days-tab renderer to
  reuse), `itinerary-core.js` exports and `admin.js`'s charter dispatcher (the previous survey lived in a session temp
  file). Then execute both with Sonnet subagents + browser verification, server first.
- **A2-D21 (planning, 2026-10-08, admin plan `a2-02-admin.md` written and dry-run).** Decisions taken while writing the
  admin plan, for David to confirm on review: (1) `setStopDays` and `promoteRoute` are deleted along with
  `edgeStates`/`moveEdge` (the former carries the removed over-the-end rule, the latter writes the legacy template
  fields; `toUnassignedRoute` replaces it); (2) `estimateTimes` assumes 09:00 for an overnight stop with no departure
  time instead of breaking the chain, so every card shows an estimated arrival; (3) the welcome message, previously
  edited only on the Itinerary panel, is edited in the Route page's Description slot (relabelled "Welcome message" in
  charter mode); (4) edge shrink curve 26, 18, 12, 8, 6 then 4 px; `routes-lists.js` keeps its own file (Legs);
  (5) undo/redo history holds the whole working route (points, items, dirty ids). Dry-run: the core and routes-core code
  assembled from the plan text passes 110 tests; the two new browser modules parse. Next: execute A2-01 (server, with
  the docker-vm migration rehearsal), deploy, then A2-02 on `feat/itinerary-a2` with Sonnet subagents and browser
  verification, then merge.
- **2026-10-08 plan A2-01 (server) EXECUTED** on `iolanthe-server` branch `feat/itinerary-a2` (9 commits, 65 tests, was
  52), Sonnet/Haiku implementers with this session reviewing each diff against the plan. One fix beyond the plan: a
  `null` or empty `duration_min` means "no duration" (Number() made it 0 and the bounds check rejected it); mirrored in
  plan a2-02. Checklist 10/10 on the scratch server; migration v5 rehearsed on docker-vm in a throwaway container on a
  copy of the live volume (4 routes, 16 anchorages, 6 charters; live untouched, `live_version` 4). PR
  C1rK1t/iolanthe-server#2 open. Next: David's go to merge + `./update.sh` on the vessel, then execute plan a2-02 on
  admin `feat/itinerary-a2`.
- **2026-10-08 server DEPLOYED (spec A2).** PR iolanthe-server#2 merged as `cbde12e`; safe server-only update on the
  vessel (`git pull --ff-only` + `docker compose up -d --build iolanthe-server`). Live migration v5 ran at startup:
  backup `data-before-migration-2026-10-08-035503`, 4 library routes, 16 anchorages, 6 charter records; `/api/schema`
  `live_version` 5; `/api/charter` and `/api/planned-route` 200. Until admin plan a2-02 merges, the live admin's
  Itinerary panel "Apply library route" calls the removed `apply-route` endpoint (404); everything else on the live
  admin works. Next: execute a2-02 on admin `feat/itinerary-a2`.
- **2026-10-08 plan A2-02 (admin) EXECUTED** on admin branch `feat/itinerary-a2` (18 commits; 110 tests). Sonnet/Haiku
  implementers per task, every diff reviewed against the plan (all verbatim), browser passes by this session on the
  scratch server. Fixes found in the browser: `renderPills` appended the text "null" when there was nothing to check
  (`replaceChildren(null)`); the sticky map floated over the strip when scrolling (map now scrolls with the page and is
  sized so map + strip fit: `--map-h: max(380px, min(100vh − 380px, 640px))`); admin's global input styles inflated
  the Start from… radios; "Day N" was doubled on the tabs of a route without charter dates; phone width needed the
  edges as thin rows above and below a full-width card. Observed on the migrated csaba data: the stored arrival days
  disagree with the computed ones, so the first geometry edit re-dates most stops and marks them to check (by design;
  the captain will see it on first contact). Not exercised (code paths unchanged): KML/GPX import/export, Add another
  route. PR C1rK1t/iolanthe-admin#6 open; merging releases it to the vessel within 5 minutes (server A2 is live).
- **2026-10-08 admin DEPLOYED (spec A2 complete on the vessel).** PR iolanthe-admin#6 merged as `0aa5f0a`, pulled
  onto the vessel straight away; the live admin serves the 15 `admin-itin-a2` assets, `itinerary.js` is gone (404),
  guest and `/api/charter` unaffected. **Decision (David): the read-only guard for ended charters is switched off for
  now** (`readOnly = () => false` in routes.js, one line to restore) so the migrated historical itineraries can be
  repaired by hand; the old data is not precious. Next: the captain's first contact on the bridge tablet; then specs
  B (guest preview with a date slider) and C (revisions for the other charter files); restore the read-only guard once
  the historical records are tidy.

## Spec A2 tweak round (David's first look at the live Route page, 2026-10-08)

- **A2-T1 Empty band under the strip.** The map is capped at 640 px (`--map-h`), so on a 2000-px screen the page ends
  with a large empty band. To do: size the map to the viewport minus the header and the strip (min 380 px, no cap) so
  the map grows into the space and the strip stays docked.
- **A2-T2 Arrival must be derived, not editable.** The Arrive tile's pinned-time input (spec D4 "the time may be
  pinned") goes; arrival time and day are always computed from the previous departure and the leg. Display only,
  estimate in italics.
- **A2-T3 Depart picker on unassigned routes.** With no charter dates the plan used a day-number input (min = arrival
  day), which reads as a "number of days" picker and refuses values below the arrival day. To do: date picker when
  the record has charter dates (as now); on an unassigned route a **nights here** count (0 = day stop) instead of a
  day number. Multi-day passages (0 stops on a day) already work: a long leg lands the arrival one or more days later
  and the Days tab shows "Underway".
- **A2-T4 Size sliders.** A vertical splitter between the side column and the map and a horizontal one between the
  map and the strip, remembered per browser (localStorage); the map redraws on resize already.
- **A2-T5 Anchorage stops on the map** (David's second note): the marker must show it is an anchorage; dragged off the
  anchorage it reverts to a plain stop (definable as a new anchorage in the normal way); snapping to a nearby
  anchorage or pre-defined stop, and sticky when dragged a little way off its own anchorage.
- **A2-T6 Wider edges on big screens**, keep the vertical names and make them clearer.
- **A2-T7 Assign the current route to the selected charter** from the unassigned route's page (David looked for it
  there; today it is only reachable from the charter side via Start from…).
- **A2-T0 FIXED and live (`7e8b410`, assets `admin-itin-a2b`):** switching "Working on" with unsaved changes greyed the
  page except the map and needed a refresh: the "Unsaved route" dialog (backdrop z-index 140) was drawn behind the
  Leaflet panes (z-index 400). The map container now has its own stacking context.
- Plan for T1–T7: `plans/a2-03-tweaks.md` (written 2026-10-08, not yet executed).
- **2026-10-08 tweak round DEPLOYED.** Plan a2-03 executed on `feat/itinerary-a2-tweaks` (T1–T7), PR iolanthe-admin#7
  merged `9966099`, pulled onto the vessel (assets `admin-itin-a2c`, 111 tests). Fixes found while verifying: `fitMap`
  must use the measured height above the planner (no 240-px cap); the planner gap doubled up around the splitter
  tracks (now 4 px). Not exercised: dropping a stop onto a *different* anchorage (pre-existing snap path). Next: the
  captain's first contact on the bridge tablet; restore the ended-charter read-only guard once the historical records
  are repaired; plan 5 Task 8 shims; specs B and C.

## Spec A2 tweak round 2 (David, 2026-10-08, after the first round went live) — NOT YET PLANNED

- **A2-T8 Days tab: stop text into the sub-boxes.** The stop name and its Arr/Dep line move from the left titles column
  into the (currently empty) blue sub-box for that stop and day, as a header above the items; the titles column goes
  and the tube line sits directly left of the day boxes. Frees width in the narrow side column.
- **A2-T9 Separation.** A gap between consecutive day boxes in the Days tab, and spacing between the nights input and
  the time input in the Depart tile.
- **A2-T10 Line → card → map.** Clicking a stop on the tube line scrolls the strip's card into view *and* moves the map
  to that stop; and whenever the map moves because of the line or a card, it zooms in on the stop as well as panning
  (`setView(latlng, max(currentZoom, ~13))`), not just `panTo`.
- **A2-T11 Wording on unassigned routes:** the Depart tile is titled "Stop duration"; a "Departure time" label sits
  above the time picker (both modes).
- **A2-T12 Default departure time** instead of a blank picker: 07:00 when nights > 0; for a day stop (nights = 0)
  the arrival estimate + 2 h (confirmed by David, 2026-10-08). The stored default is written when the card sets or
  changes the stay; the blank-time fallback in `estimateTimes` / the server's `SEED_DEPART_TIME` moves from 09:00 to
  07:00 on both sides.
- **A2-T13 (question) time picker usability:** the native `<input type="time">` is fiddly on the tablet; consider a
  pair of selects (hour, 5-minute steps) or ±15-min buttons beside it.


## Charter setup spec: the Gantt band and the active rule (2026-10-08)

Brainstormed with the visual companion (`.superpowers/brainstorm/31923-*/content/`). Written up as
[spec-charters.md](spec-charters.md).

- **C-D1. The Gantt is the charter selector** above every Charter panel; the Charter section's dropdown goes (Galley and
  Hotel keep theirs). Collapsed by default to a strip on the Route page, remembered per browser.
- **C-D2. Active = in date, else the crew's choice.** In date = the day before start to the end date; forced. Otherwise
  the stored choice (any charter), else the most recently ended. No end-of-charter buffer; on a back-to-back turnaround
  the next charter wins on the last day. Rule runs on the server; `DEFAULT_ACTIVE_CHARTER` goes.
- **C-D3. No overlapping dates** between charters and reserved periods; refused on create / save, checked live in the
  admin. The day-before window is not part of the check.
- **C-D4. Make active is a button on the charter's Info header**, disabled while any charter is in date. Gold on the
  Gantt. Past charters may be made active (old "completed" refusal removed).
- **C-D5. The Gantt is read-only:** drag pans, wheel zooms, arrows and scrollbar pan; click a charter to select it, click a
  reserved period to open its card. No drag-create, no date dragging, no context menu.
- **C-D6. Reserved periods** (maintenance / unavailable / other) in `data/reserved-periods.json` with revision + 409;
  created from a button beside New charter; edited / deleted in the same card. Never active, invisible to guests.
- **C-D7. Info page layout B** (two columns on wide screens), Route-page style via new shared `admin.css` classes
  (stat tiles, form sections, status pill, segmented control, gold icon tone). `routes.css` untouched.
- **C-D8. New charter keeps Copy from**, drops Set active, lands on the new charter's Info.
- Rollout: server `feat/charter-gantt` then admin `feat/charter-gantt` (`admin-charters-1`); no migration.
- **A2-T14 Start from… dialog (the captain: "a confusing mess", 2026-10-08).** Rebuilt as shape C: one grouped
  native dropdown for the record (Unassigned routes, then charters by year, newest first, each with its stop count),
  "Starting on", a positive "Bring its N items" switch, and a result line with a coloured dot ("Ends Mon 9 Nov · 1 day
  before the charter ends") that replaces the help paragraph and the "−1 d" suffix. Shapes A (list beside settings)
  and B (two steps) were drawn and rejected for width. Scales to twenty past charters without a server change.
- **A2-T15 Arrow keys (the captain).** ← / → only worked while the card had focus; they now step the strip page-wide
  (same guards as undo/redo) and Leaflet keyboard panning is off.
- **A2-T13 decided:** hour and minute selects, minutes in 15-minute steps; an off-grid stored value is kept as one extra
  option. T12 confirmed: 07:00 with nights, arrival + 2 h for a day stop, clamp 23:59; seeds move to 07:00 both sides.
- **Round 2 design approved (David, 2026-10-08)** section by section; spec `spec-a2-round2.md` (T8–T15 + housekeeping);
  read-only guard stays off with a reminder for mid-November 2026. Next: plan `plans/a2-04-round2.md`.
- **2026-10-08 plan A2-04 (round 2) WRITTEN and dry-run:** `plans/a2-04-round2.md`, 9 tasks. Core code and tests assembled
  from the plan text pass 117/117 (111 + 6 new; 5 expectations moved with the 07:00 seed and the defaulted cleared time);
  the four browser modules parse after the plan's replacements. Decisions taken while planning: the card's own ← / →
  handler is deleted (the page-wide handler covers a focused card too, no double step); a charter source's record is
  fetched lazily from `GET /api/admin/charter/<id>` for the item count and the result line; a stop with no stored time
  shows the default in the selects with "· assumed" in the hint; the server's `extraDaysForLeg` default test moves to an
  18-hour leg. Next: David's go → execute with Sonnet implementers on `feat/itinerary-a2-round2`.


- **2026-10-08 plan ch-01 (server) EXECUTED, review fixes PENDING.** Branch `iolanthe-server` `feat/charter-gantt`, 7 commits
  (`fe89d8e`..`eb61b0e`), 92 tests, scratch server runs it (`/api/charter` active = csaba). Final Sonnet review said
  Request changes: (1) CRITICAL `/api/charter` crashes the process when the rule yields "" (`readAvailableAlcohol` /
  `buildPurchasedAlcoholGuestSummary` throw; public handler has no try/catch); (2) `loadTrack("")` writes
  `data/charters/track.json`; (3) `charter.json` save should only run the overlap check when the dates changed;
  (4) duplicate period ids defeat the overlap check; (5) error-detail passthrough should apply only to app errors
  (statusCode set), not fs `code`; (6) period-vs-charter overlap should report the row field + errors. Decided fix for
  (1): amend the rule so after "most recently ended" it falls back to the earliest upcoming, then any charter (first
  id), then "" (fixture case "nothing ended yet" expects smith; spec §3 and plan ch-02 charters-core must mirror it).
  A patch script for all six sits in the session scratchpad (`review_fixes.py`, needs its CRLF-aware `rw()` repaired);
  the working tree is clean. NEXT: apply the fixes + tests, re-run 92+, run `scripts/check-charter-endpoints.sh`
  (needs David to log in to the scratch admin), PR, `./update.sh` on the vessel, then execute plan ch-02 (admin).

- **2026-10-08 server review fixes DONE** (`7a23db7`, 97 tests): the rule gained two fallbacks (earliest upcoming, then any
  charter) so `/api/charter` and track logging never see an empty id with charters present; the public charter route
  is wrapped in try/catch; `loadTrack("")` stays in memory; `charter.json` saves only run the overlap check when the
  dates changed; admin error details pass through only for app-raised errors; reserved periods reject duplicate ids,
  require an integer `base_revision`, and report charter overlaps per row. Spec §3 and plan ch-02 updated to match.
  Captain's multi-visit anchorage request logged in BACKLOG.md. NEXT: endpoint checks (David logs in), PR, vessel
  `./update.sh`, then plan ch-02.
- **2026-10-08 plan A2-04 (round 2) EXECUTED** on admin `feat/itinerary-a2-round2` (7 code commits, 117 tests) and server
  `feat/seed-depart-0700` (1 commit, 65 tests); Sonnet implementers for the code tasks, Haiku for housekeeping and the
  server constant, every diff reviewed against the plan by this session (all verbatim). Browser pass on the shared scratch
  server (csaba + two seeded charters Hoffmann 2025 / Reyes 2026): dialog year groups and result-line states, items switch
  per source kind, import with items (csaba now revision 5), time selects (blank item option, off-grid 09:20 kept), Days
  tab headers and gaps, line → card → map zoom 7 → 13, arrows after a map click and guarded in a select, date change stores
  07:00, phone width, no console errors. Not re-exercised: a drop onto a different anchorage. PRs iolanthe-admin#8 and
  iolanthe-server#4 open; merge on David's word. Lesson: both sessions share one working tree per repo, so the other
  session's docs commits landed on this branch (docs only) and a Haiku implementer briefly switched the server checkout
  off the other session's branch (restored at once) — give implementers in a shared checkout an explicit "do not checkout".


- **2026-10-08 server PR #3 OPEN and verified** (C1rK1t/iolanthe-server#3, `7a23db7`, 97 tests). Endpoint checks run from the
  logged-in scratch admin: charters/bootstrap payload fields, reserved periods GET / 409 stale / 400 invalid / 400 overlap /
  400 duplicate id, create overlap 400, make-active 200; and the day-before rule live (Larry moved to start tomorrow ->
  forced active + guest payload flips, make-active Csaba -> 409 "Larry is in date…", restore -> Csaba). No conflict with
  server PR #4 (itinerary.js only). Admin main is at 117 tests (round-2 work), so plan ch-02 totals read +6. ch-02 starts
  with the new files; index.html / CLAUDE.md wiring waits for admin PR #8. NEXT: David merges #3 + `./update.sh`.
- **2026-10-08 plan ch-02 (admin) EXECUTED; PR C1rK1t/iolanthe-admin#9 OPEN** (branch `feat/charter-gantt`, 140 tests). Sonnet
  implementers for the admin.js tasks, pure modules and CSS installed from the dry run, browser passes by this session on
  the scratch server. Final Sonnet review found a blocker (pointer capture on pointerdown swallowed real bar clicks; the
  scripted `.click()` checks had hidden it) plus eight follow-ups, all fixed: wheel ignores horizontal scroll and scales by
  delta, arrows stop propagation (Route stop cards), the band is re-attached across repaints keeping zoom + scroll (view
  restored from the last drawn state), active/forced recomputed after a dates save, Make active keeps the form guard,
  409 Reload force-closes the card, end-before-start refused, one period label map ("Other"), today corrected to the
  server date. Also fixed while verifying: grid `min-width:auto` let the track widen the page; first layout via setTimeout
  (rAF never fires in a hidden tab); `cloneCharterInfo` restored after an over-eager delete. Real-mouse checks passed.
  Scratch data keeps a test charter "hoffmann-two". Deferred minors from the review: `charter-gantt.js` has no automated
  test (a Playwright bar-click smoke test would have caught the blocker); tooltip edge flip; localStorage fallback.
  Merge order: server #3 -> vessel `./update.sh` -> admin #9 (resolve `index.html` ?v= and CLAUDE.md against #8).
- **2026-10-08 round 2 LIVE.** Admin PR #8 merged by David (with the charter-management PR #9; main `7c8339a`, assets
  `admin-charters-1`, 140 tests) and pulled onto the vessel; server PR #4 merged `4aaaff2` and deployed with the manual
  pull + rebuild (seed 07:00, `live_version` 5, `/api/charter` and `/api/planned-route` 200). Pre-merge check: the other
  session's work touched none of the round-2 files; arrows still step the cards on the merged main. Branch
  `feat/itinerary-a2-round2` deleted. Next: the captain's second look; plan 5 Task 8 shims; specs B and C; restore the
  ended-charter read-only guard when the reminder fires (2026-11-16).

## Captain's second look at round 2 (2026-10-08)

- Captain happy with progress. Fixes shipped in admin PR C1rK1t/iolanthe-admin#10 (merged `c825810`, assets
  `admin-charters-2`): the departure time sits on the same line as the date / nights (Depart tile 1.35x wide); the fit
  pill shows a red warning triangle instead of "+N d" with a wrapping tooltip "Route is N days longer/shorter than the
  charter: ..."; Delete charter moved from the Gantt band toolbar to the Charter Info header.

## Spec B brainstorm (2026-10-08): the guest preview

- **B-D1 Home:** a "Guest view" tab in the Charter section; the live guest in a same-origin iframe, the slider in the
  admin page; eye buttons on the Route and Charter Info headers (layout A of `preview-layout.html`).
- **B-D2 Charter:** the selected charter (future, active or past).
- **B-D3 Data:** the saved record only; a dirty Route page asks Save / Preview saved version.
- **B-D4 Slider:** whole days, plus a day-before-boarding and a day-after step.
- **B-D5 Live data:** position and weather stay live; the track is the previewed charter's own, cut at the end of the
  slider date (tracks are kept only 3 days after a charter, so old ones show none).
- **B-D6 Security:** `?charter=` on the guest endpoints only with a valid admin session; 401 otherwise, never a silent
  fallback. The preview track read uses `loadTrack` (read-only), never `ensureTrackState`.
- **B-D7 Plan 5 Task 8 bundled** into the spec B guest and server releases, plus guest `?v=` cache-busters.
- **B-D8 Release order:** server, then guest + admin together.
- Spec written: [spec-b.md](spec-b.md) (draft 1).
- **Plans written (2026-10-08):** [b-01-server](plans/b-01-server.md) (lib/preview.js + server.js wiring + Task 8 wrapper,
  97 -> 102 tests), [b-02-guest](plans/b-02-guest.md) (preview-mode.js + guest.js hooks + Task 8 converter + ?v=guest-b-1
  + SW v5, 7 -> 11), [b-03-admin](plans/b-03-admin.md) (guest-preview-core.js + guest-preview.js/.css + admin.js / Route
  wiring + ?v=admin-preview-1, 140 -> 146). Each dry-run from the plan text (`apply_plan.py`). The three assembled copies
  were also run together on a throwaway server (port 8011): the tab renders 11 ticks, stepping keeps the guest's tab,
  the banner follows the date, before/after work, logged out gives 401 and the "LOG IN TO THE ADMIN AGAIN" banner. Work
  happens in git worktrees under `GitHub/worktrees/spec-b/` (no branch switching in the shared checkouts) with its own
  test server config `iolanthe-server-specb` on port 8010. Spec amended to draft 2 (dirty Route uses the usual
  unsaved prompt; stage height = window - 32 px; refusal messages in the banner only).
- **2026-10-08 spec B EXECUTED; three PRs open:** C1rK1t/iolanthe-server#5 (`feat/spec-b-server`, 102 tests),
  C1rK1t/iolanthe-guest#2 (`feat/spec-b-guest`, 11), C1rK1t/iolanthe-admin#11 (`feat/spec-b-admin`, 146). Built in git
  worktrees under `GitHub/worktrees/spec-b/` (no branch switching in the shared checkouts) by Sonnet implementers (Haiku
  for docs), every file compared byte-for-byte with the dry-run copies (two implementer slips fixed: a literal BOM for
  `﻿`, stray `\·` escapes). Browser pass on `iolanthe-server-specb` (port 8010, data copy `data-scratch-b`): endpoint
  table incl. 401/400/404 and the read-only track (no file created, mtime unchanged), slider by keyboard / real click /
  real drag, tab kept, tablet/phone, both eye buttons, dirty-route prompt, larry/hoffmann, no-dates empty state, phone
  width, logged-out banner, plain guest unchanged (SW v5, no preview entries cached). Final Sonnet review: nothing
  Critical; minors fixed (banner clears after re-login, left-button drags + lostpointercapture, tab ids with digits).
  Lesson: a guest.js change under an already-cached `?v=` is invisible to a device whose SW cached it; bump the tag
  whenever a cached file changes. Open question for David: the vessel server container has `TZ` unset (UTC), so the
  track cut and the existing active-charter day rule flip at 08:00 Philippine time (set `TZ=Asia/Manila` in compose?).
  Deferred: track read is synchronous per request (fine at 3-day retention sizes). Merge order: server #5 -> deploy ->
  guest #2 + admin #11 together; then remove the worktrees and the `iolanthe-server-specb` launch entry.
- **2026-10-08 spec B LIVE.** Server #5 merged `fbafd0a`, pulled and rebuilt on docker-vm (`/api/charter`,
  `/api/planned-route`, `/api/track` 200; `?charter=` without a session 401; `/api/version` main-fbafd0a). Guest #2
  `d731236` and admin #11 `8f94ca4` merged and pulled onto the vessel straight away (guest `?v=guest-b-1`, SW v5; admin
  `admin-preview-1`). Worktrees, the data copy, the test-server launch entry and the feature branches removed. Plan 5
  Task 8 is done with it. Next: David / the captain try Charter -> Guest view on the boat; the vessel TZ question
  (deferred by David); spec C (revisions for crew / guests / menus / drinks).
- **2026-10-08 Guest view follow-up LIVE** (admin #12, `81bdd89`, `admin-preview-3`): David asked for a **PC view** (1280 x 800,
  monitor bezel, beside phone / tablet) and a **steady slider**: the title is one line above, the row below is only
  ‹ track › ◎, so the track never moves (verified identical position and width on all 11 steps). Also fixed: a frame wider
  than the panel used to widen the card instead of scaling.
- **2026-10-08 Guest view round 2 LIVE** (guest #3 `d515f4f`, `guest-b-2`, SW v6; admin #13 `ee593b9`, `admin-preview-4`):
  in a preview the guest has no live NMEA, so it shows a stand-in position (where the boat spends that night; halfway
  along the route on a night at sea; first / last stop outside the charter) in the header, and Navigation, Weather,
  Vessel Info and Safety are greyed out. The captain wants the preview for Hotel and Galley too: **Guest view** is now
  a tab in the Charter, Galley and Hotel sections, opening the guest on Itinerary / Today's Menu / Wine & Drinks.
  Verified with real Galley and Hotel logins on a local server. Seen once, not reproduced: a stale Charter Info unsaved
  guard threw on the first section click after a login in a tab that had held a Charter Admin page.

## Captain round 3 (2026-10-09, relayed by David after the round-2 release)

- **R3-1 Clear this route.** On a charter's route a trash icon "Clear this route" (charter mode only, next to Start
  from…) empties the points and the items after the popup names the items it drops; the blank canvas is unsaved until
  Save, and Cancel brings everything back. Unassigned routes keep their Delete.
- **R3-2 Map labels.** Anchorage and global-stop markers lose the always-on text label and keep the hover tooltip
  sites have (the name is in the tap popup on the tablet); unnamed waypoints get no tooltip; named waypoints and the
  numbered route stops keep theirs. The map was too cluttered zoomed out.
- **R3-3 Gantt default zoom: Quarter** (3 months) instead of Active.
- **R3-4 Gantt gridlines.** Faint vertical lines through the lanes at month boundaries, a bolder one at year
  boundaries, and alternate month headers banded.
- **R3-5 Band per page.** "Charter Admin" (the Charter Info page) keeps the band open with no Collapse button; on
  Route & Itinerary, Crew, Guest view and Site Editor it starts as the collapsed strip, Expand rolls it down OVER the
  page (no reflow), and it collapses again when a charter is picked, the page changes, or Collapse is pressed. Nothing
  is remembered per browser any more.
- **R3-6 Selected vs active.** The selected ("viewing") bar gets a dark fill with the thick outline and a small
  VIEWING tag; active stays gold; the toolbar carries a two-swatch legend (gold = active, outlined = viewing); the
  bar tooltip says "Viewing". David: partly a training issue, but make it obvious.
- **R3-7 Topbar label.** "NEXT ACTIVE CHARTER" when the active charter starts in the future, "ACTIVE CHARTER" while it
  runs, "LAST CHARTER" when it has ended.
- **R3-8 Route page default.** Opening Route & Itinerary from the nav lands on this charter's route; an explicit
  "open this unassigned route" still goes to the library.
- Plan: `plans/r3-captain-round3.md`. No other session is running; David will warn the next one to look for recent
  changes.
- **2026-10-09 round 3 EXECUTED** on `feat/captain-round3` (6 commits, 146 tests, assets `admin-captain-r3`), one Sonnet
  implementer for Tasks 1–5 (all replacements verbatim), browser pass by this session on the scratch server at
  `127.0.0.1:8000` (the pane refuses `localhost:8000`): band at Quarter with gridlines, banding, legend and the VIEWING
  tag; locked on Charter Admin, overlay elsewhere (host held at the strip's 52 px so the page does not shift), collapsing
  on pick / page change / Collapse; Clear this route on Larry (popup, empty canvas, Cancel restores); anchorage labels
  gone with tooltips kept; Route opens on the charter route; topbar "Next Active Charter"; no console errors. Not
  exercised: LAST / ACTIVE CHARTER headings (need a past or running active charter). PR iolanthe-admin#15 open; merge
  on David's word.

## Captain round 3b (2026-10-09, immediate feedback on round 3)

- **R3b-1** The VIEWING tag was clipped on narrow bars: an eye icon before the bar's name instead (and in the legend).
- **R3b-2** Every time display and picker is 24-hour: the Charter Info arrival time becomes the Route page's hour/minute
  selects (a hidden input carries the value), the two report stamps and the guest's six formatters get `hour12: false`.
  A native `<input type="time">` cannot be forced to 24-hour, hence the selects.
- **R3b-3** The band's roll-up / roll-down was a jarring re-render: both folds stay in the DOM and a `grid-template-rows`
  transition rolls them (260 ms; none under prefers-reduced-motion). Picking a charter from an overlay band rolls it up
  first.
- **R3b-4** Rolled up, a click (or Enter / Space) anywhere on the strip rolls it down, not just the Expand button.
- Plan: `plans/r3b-captain-immediate.md` (admin branch `feat/captain-round3b`, guest branch `feat/times-24h`).
- **2026-10-09 round 3b EXECUTED:** admin `feat/captain-round3b` (3 commits, 146 tests, assets `admin-captain-r3b`), guest
  `feat/times-24h` (1 commit, 15 tests, cache v7 / `guest-b-3`); one Sonnet implementer, all replacements verbatim.
  Browser pass: eye before the viewed bar and in the legend; the band rolls 52 → 153 → 205 px over ~0.5 s and back;
  strip name click and Enter expand; a charter pick from an overlay rolls it up at once; arrival time selects write
  "HH:MM" to the hidden input and dirty the form; guest clock "Friday 9 Oct, 07:52". PRs iolanthe-admin#17 and
  iolanthe-guest#4 open; merge on David's word.
- **2026-10-09 R3b-3 follow-up (captain: roll-up still jumpy and pushes the page down).** Cause: on Collapse the overlay
  class was dropped at the same moment the fold started closing, so the full-height band fell into the page flow first.
  Fix: `setCollapsed(true)` keeps the band floating until the body fold's `grid-template-rows` transition has ended
  (or 340 ms), then drops the overlay. Measured roll-up 205 → 183 → 120 → 80 → 60 → 54 → 52 px with the map's top
  fixed throughout. Assets `admin-band-roll`.
- **2026-10-09 captain (after round 3b): fit warning as a road sign, light-red tint, fade between charters.** The fit
  warning is the attached road-sign icon alone (red border, white gap, amber face, white exclamation; 34 px; the wrapping
  tooltip bubble stays), no pill. EXPERIMENT: while the route does not fit, the Route page card tints light red
  (`.routes-panel.fit-warn`, #f1d9d6, with the inputs/tiles a shade lighter) — David/captain to judge. A charter switch
  from the band fades the old panel out (180 ms) and the new one in (220 ms) while the band stays put; nothing under
  prefers-reduced-motion. Measured: 0.53 → 0.24 → 0.04 → 0, then 0.19 → 0.52 → 0.83 → 1. Assets `admin-warn-fade`.
- **2026-10-09 DROPPED: red outline on the last stop card when the route does not fit.** David: the whole Route page
  background already tints light red while the route does not fit, so the outline adds nothing (red card edges keep
  meaning "check this stop"). Do not offer it again unless the captain asks for it specifically.


## Spec P brainstorm (2026-10-09): the charter pack

The captain wants to package a charter's details for the client or the agent. David thought of a PDF; the captain
suggested zenvue.app. Spec: [spec-pack.md](spec-pack.md). Mockups in `.superpowers/brainstorm/180653-*/content/`.

- **P-D1 Both, in phases.** Phase 1 = a print-styled pack saved as PDF from the admin (the quick win). Phase 2 = a
  separate mini-site on a zenvue.app subdomain (for example `charters.zenvue.app`), own spec later. Shoehorning it
  into the ZenVue app (my.zenvue.app) is ruled out.
- **P-D2 Purpose.** Pre-booking proposal and confirmed charter brief (not live tracking, not a souvenir).
- **P-D3 Home.** A Charter Pack page under Charter Admin: settings left, live A4 preview with a pager right (mockup A,
  over a header-button dialog).
- **P-D4 Contents.** Charter summary, Route & itinerary, Crew & yacht, Menus & drinks, each a tick-box chosen by the
  captain per pack.
- **P-D5 Customising.** Pack type (Proposal / Charter Brief), Prepared for, cover note, and saved presets. No per-day
  picking.
- **P-D6 Themes.** The captain picks A Editorial (navy & gold), B Modern (admin teal) or C Paper (guest look). A's navy
  cover is ink-heavy on paper; accepted.
- **P-D7 Engine.** A print-styled HTML page and the browser's Save as PDF; no server-side PDF, no PDF library.
- **P-D8 Branding.** IOLANTHE in Times New Roman, bottom to top, the full page height, behind the content at 5 %; the
  vessel line art lower right at 20 %. Tinted per theme.
- **P-D9 Stamp.** The boat stamp (OFF# 739708 / IMO# 1009144 / 498 GRT, supplied by David) appears once, full contrast,
  on the cover. Random faint stamps on every page were tried and dropped.
- **P-D10 Cover photo.** One default hero shot, overridable per pack by an upload (a Zenith Superyachts photo set makes
  no sense in an Iolanthe pack).
- **P-D11 Map.** Live Leaflet map, low detail: only the charter's route and stops, no track waypoints, anchorages or
  unrelated sites; day numbers on markers, names in a key, overlapping markers merged.
- **P-D12 Crew.** Text only (name, position, department); crew photos are a later feature.
- **P-D13 Presets.** Stored on the server per charter (`charters/<id>/pack.json`), so they follow the captain to any
  device. Server released first.
- **P-D14 Review.** No Fable review of the spec (David's choices, not technical risk); a Fable review of the plan after
  the weekly reset (Sunday 2026-10-11 03:00).
- Open: stamp says 498 GRT, `vessel.json` says 495 GT. The site-image upload is broken on the boat (Media References
  show broken images); fix it before planning spec P.
- **P-D15 Site marker style (David, 2026-10-09).** Use a ring of yellow pips around a small centre as the **site**
  marker on our Leaflet maps (admin Route page, guest and crew maps, and the pack map if sites ever show there), with
  the name in white text with a dark halo to its right. Reference: [assets/site-marker-pips.png](assets/site-marker-pips.png).
  Source: the Apo Reef dive map (`images/sites/map.jpeg`, credited snorkeling-report.com), so we draw our own
  icon in that spirit (SVG or CSS), not a copy. Today the admin uses a teardrop pin (`.mk-site`, routes.css) and the guest a plain `circleMarker`. Not scheduled;
  pick it up with the next map work.
- **P-D16 Plans and review (2026-10-09).** Plans `plans/p-01-server.md`, `p-02-admin-core.md`, `p-03-admin-page.md`,
  written from a dry run (the plan text rebuilds the tested code exactly: server 117, admin 169 tests). No new data
  endpoint: the pack reads `/api/charter?charter=<id>`. The route list runs to the longer of the charter and the route
  (csaba's route goes to day 11 of a 9-day charter); the cover's days tile is the charter's. Fable reviewed the plans
  (ready after fixes); folded in: saves one at a time (H1), cover clean-up that cannot delete a fresh upload (H2), blocks
  taller than a page split with "(continued)" headings (H3), no tiles at all = map failed and it stays failed (M1, M2),
  print the live pages not a copy (M3), 413 for an oversize chunked upload (M4), session check before the charter lookup
  (L1), map errors caught (L7). A real print (headless Chrome `printToPDF`) found the stamp's white ground showing as a
  box; fixed with `mix-blend-mode`. Default tiles: Esri World Light Gray Base.
- **2026-10-09 spec P EXECUTED** on `feat/charter-pack` (admin) and `feat/charter-pack-server` (server PR
  iolanthe-server#7), one Sonnet implementer per task (Haiku for the CLAUDE.md tasks); every file matched the dry run.
  Browser pass on a scratch server (port 8013): csaba 7 pages, map and merged markers, themes A/B/C, branding on inner
  pages only, proposal/brief footers, Prepared for and note, upload → shown and saved, reset → cover file deleted,
  untick to one section (locked), no Route → no map, reload keeps the preset, a no-stops charter, a 90-activity day
  split over four pages, offline map note; real print via headless Chrome `printToPDF`: 7 A4 pages in each theme.
  **Deviation from plan P-3:** with every tile failing, removing the map inside Leaflet's own `load` handler threw an
  uncaught `_fadeAnimated of null`; `mapFailed` now runs on the next tick (charter-pack.js), and the CLAUDE.md line on
  printing now says the live pages are moved, not copied.
- **2026-10-09 final Sonnet review** (no blocking issues), three fixes in charter-pack.js, each verified: the 15 s map
  limit now also covers Leaflet's own download (a held leaflet.js request: "Loading map…" at 5 s, the map note and
  Save as PDF enabled at 16 s); `fitBounds` caps the zoom at 14 so a one-stop route draws its map instead of failing;
  Save as PDF first draws any typing from the last 250 ms, and a redraw puts printed pages back before rebuilding (no
  duplicate pages where print() does not block). Not fixed: an edit typed less than 800 ms before closing the tab is
  not saved (no pagehide flush). Found and raised separately (a pre-existing server issue): `/data/` serves every
  DATA_DIR file except settings.json without a session.
- **2026-10-09 spec P LIVE** (server#7 ec0b0ea released, admin#24 d588c08). David's first Save as PDF looked good.
  Devices: the captain makes packs on the bridge PC and on a laptop on the Bridge VLAN, so the tested Chrome/Edge
  print path covers both (assuming Chrome or Edge on the laptop); the iPad/Safari question is closed. Pinned for later
  in `docs/BACKLOG.md` → *Charter pack*: a dedicated Save / Download PDF button, the charter name as the cover title,
  and yacht information written for on board (General Notes mention the safety brief "included in this pack").
