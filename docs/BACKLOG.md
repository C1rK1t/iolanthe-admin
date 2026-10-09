# Admin backlog

Ideas and requests that aren't scheduled yet. Each item says where it came from and what it depends on.

## Itinerary page

### Fuel estimation

*Requested by the captain, 2026-10-07, during the Route Planner review.*

Estimate fuel burn for a charter from its assigned route.
- Enter a **base fuel burn in litres per hour (LPH)**. Decide whether it's a vessel setting (in `library/vessel.json`)
  that the charter can override, or set per charter.
- **Per leg**: litres = leg hours × LPH. The leg hours come from the route's stop-to-stop legs, using each leg's
  own speed or the route speed (see [route-planner/spec.md](route-planner/spec.md) §2.1, `speed_kn` /
  `leg_speed_kn`).
- **Per trip**: the total over all legs, for the Primary plan and for the Alternative.
- It belongs on the **Itinerary** page next to the route assignment rows, because it depends on which route a
  charter uses.
- **Depends on:** Route Planner phase 4 (routes assigned to charters). The charter copy also needs to keep its
  speeds; see spec §7 Q2.
- **To decide:**
  - Fuel burn changes with speed, so is one LPH enough? Options: a per-leg LPH override (like the per-leg speed),
    or a simple speed-to-burn table for the vessel.
  - Add generator burn at anchor (LPH × hours at each stop)?
  - Add a reserve margin (%)?
  - Should crew or guests ever see it? Probably admin only.

### Client itinerary report with route overview

*Requested by the captain, 2026-10-07, during the Route Planner review.*

A report to send to clients before or during a charter. It's an **itinerary report** that includes a **route
overview**, not a separate route report.
- **Contents:** charter name and dates, the day-by-day itinerary (sites, activities) and an overview map of the
  route. Possibly per-day distances and times. Stops and anchorages stay hidden from guests (Route Planner decision
  3), so the map shows the route line and the itinerary's sites.
- **Format:** probably a PDF.
  - The admin already has print-ready A4 pages (`charter-page print-a4`, including `itinerary-print-area`) that
    are printed through the browser. Extending that page and using "Save as PDF" is the cheapest route.
  - A server-generated PDF would need a library, which `iolanthe-server` doesn't allow (no npm dependencies).
- **Map image:** a Leaflet map with satellite tiles doesn't always print cleanly. Options: a print-only static map
  rendered to a canvas and embedded as an image, or a simple line-on-chart drawing without imagery.
- **Depends on:** Route Planner phase 4 (an assigned route to draw).
- **To decide:**
  - Which itinerary fields go to clients?
  - Branding (the vessel logo and the watermark already used on print pages)?
  - Should it show the Primary plan only, or both plans?

## Route page

### Visit the same anchorage more than once (captain, 2026-10-08)

*Relayed by David, 2026-10-08.* The captain wants a route to call at one anchorage twice, above all when a charter
starts and ends at the same anchorage.

- **What already works:** the record allows two stops with the same `anchorage_id` as long as they are not next to
  each other (`routes-core.js` `makeStopAt` / `appendStop` only merge with the neighbouring stop, spec A §7 Q3). Days,
  items and legs are per stop, so nothing in the itinerary model needs to change.
- **What breaks:** both stops sit on the same position, so their map markers stack; only the top one can be seen,
  clicked or dragged, and the number badge shows one stop number. Snap / sticky logic in `routes-places.js` and
  `routes.js` also assumes one point per anchorage (`sameStop`, `routesUsingAnchorage`).
- **Captain's map solution (sketch received):** where an anchorage or plain stop has more than one visit, the marker
  shows a "multiple" glyph instead of a number; on hover (or tap) N satellite markers fan out around it, one per
  visit, each carrying its stop number; a satellite selects, opens the card, or drags like a normal single-visit stop.
- **Also asked, parked:** back-tracking along the same path (a leg that retraces an earlier leg). The path is the
  legs, so retracing means duplicate points on the line; David's view is that the juice isn't worth the squeeze.
- **To decide:** fan-out geometry and radius at each zoom; whether the first and last visit get distinct glyphs
  (origin / terminus loops on the Days tab already exist); how the stop strip labels the two cards.

## Admin-wide

### Roll the Route Planner mockup style out across the Admin site

*David, 2026-10-06.* Use the mockup's look everywhere: the square icon buttons, shaded stat tiles and panels, tabbed
boxes and cards, button styles, type and uppercase field labels. See
[route-planner/HANDOFF.md](route-planner/HANDOFF.md#style-rollout-separate-piece-of-work).

### Drag and drop instead of Move up / Move down (David, 2026-10-09)

Replace every pair of Move up / Move down buttons, and the swap logic behind them, with drag to reorder. Four places
use them today: dishes in a menu section, custom menu sections and menu days (all on Galley Menus), and guest order
(Galley / Hotel Guests). It must work with touch on the bridge tablet (pointer events and a grip handle, not HTML5
drag and drop, which does not fire on touch) and keep a keyboard way to move an item. Planned as one shared helper,
built with the Galley Menus phase B page and reused on Guests (`docs/style-rollout/spec-b-pages.md`).
