# Charter itinerary rework — spec A2: the Route page is the itinerary (draft 1)

Written 2026-10-08 from the brainstorm recorded in [decisions.md](decisions.md) (entries A2-D1 … A2-D18 and
A2-S1 … S4). It supersedes the admin parts of [spec.md](spec.md) (spec A), which is live on the vessel as of
2026-10-07. The model, server and guest from spec A stay; this spec changes how the admin edits a charter's itinerary
and adjusts the record shape in small, additive ways.

Mockups (git-ignored, `.superpowers/brainstorm/376-*/content/`): `route-page-carousel.html` (the page),
`stop-card-v2.html` (the card, the popup, the ⚙ tab). David's hand sketch of the carousel is the reference for the
stacked edges: every stop visible as an edge, red for dirty, green at the end when the route fits.

Repos: **S** = `iolanthe/iolanthe-server`, **A** = `portal/iolanthe-admin`. The guest (`portal/iolanthe-guest`) is
untouched.

---

## 1. Why

The captain's reaction to spec A was one sentence: "Why don't we just set up the itinerary on the route page?" He
found two panels and an "apply a route" step hard to follow, and the apply dialog had a refusal that showed nowhere.
Everything else in this spec is David's and Claude's design in response to that sentence.

## 2. Decisions this spec is built on

| # | Decision |
|---|---|
| D1 | A stop's stay is set by **picking the departure day as a date** (plus a time). "N nights" is a derived label. |
| D2 | The **tube-line day view survives as a read-only Days tab** in the Route page. The Itinerary panel goes. |
| D3 | The **Route planner stays as it is**; clicking a stop opens that stop's card. |
| D4 | **Arrive is derived**: previous departure + leg at its speed, rolling past midnight. The time may be pinned; the day is never typed. |
| D5/D11/D17 | **Stop cards are a carousel docked below the map.** Every stop is a stacked edge either side of the open card, edges narrowing with distance. Red edge = dirty; green last edge = the route fits the charter. Clicking a map stop spins the strip; opening a card centres the map. |
| D6 | Shortening a stay that drops days holding items asks first: "Changing the date will remove the itinerary entries for the 14th and 15th (4 items)" with ✓ OK / ↶ Revert. |
| D7 | **Style:** graphical, little text, the Route panel's icon buttons and stat tiles. A whole-Admin style guide is a separate task. |
| D8 | **Sites served** live in a ⚙ utility tab on the card, not on its face. |
| D9/D13 | **Global stops**: an anchorage-library entry with `kind: "stop"`; one editor, one map layer, two legend toggles. |
| D10/D12 | **Items colour a clash**: overlapping items on the same day (time + duration, default 1 h), or an item before the arrival / after the departure on that day. |
| D14/D15/D18 | **One record shape.** A library route is an **unassigned** route: the same record, possibly with standard items. Importing any record offers to strip its items. The library stays as the store of unassigned routes. |
| D16 | **Saving with red cards is allowed**; the dirty list is stored with the record. |
| S1 | **Day 1 is the charter's `start_date`, locked.** The first departure time is the origin stop's departure. No itinerary-level start field. |
| S4 | **Guest look and feel is preserved** exactly as it is. |

Constraints: no clients for at least a month; legacy data migrates.

---

## 3. The record

One shape for a charter's route and an unassigned route: spec A's version 2 itinerary plus optional fields. Existing
files stay valid; normalisers default the new fields.

```json
{
  "version": 2,
  "revision": 9,
  "welcome_message": "…",
  "summary": "…",
  "route": {
    "source": { "type": "import", "from": { "type": "library", "id": "north-loop" }, "from_day": 1, "strip_items": false, "imported_at": "…" },
    "speed_kn": 8,
    "points": [
      { "latitude": 14.80, "longitude": 120.27, "stop": true, "id": "stp_a1", "name": "Subic Bay", "depart": { "day": 1, "time": "09:00" } },
      { "latitude": 14.95, "longitude": 120.11, "anchorage_id": "capones", "id": "stp_b2", "name": "Capones Is.",
        "site_ids": ["capones-lh"], "arrive": { "day": 1, "time": "15:45" }, "depart": { "day": 2, "time": "08:30" } }
    ]
  },
  "activities": [
    { "id": "act_01", "stop_id": "stp_b2", "day": 1, "order": 0, "site_id": "capones-lh", "title": "Lighthouse walk",
      "notes": "", "time": "16:30", "duration_min": 90 }
  ],
  "dirty_stop_ids": ["stp_c3", "stp_d4"]
}
```

**Additions**
- `activities[].duration_min` — integer 5…1440, optional; treated as 60 when absent. Used only for clash detection.
- `dirty_stop_ids` — stop ids whose dates moved under them and have not been visited since. Unknown ids are dropped
  quietly on load. Empty when absent.
- `route.source` for an imported record: `{ type: "import", from: { type: "library" | "charter", id }, from_day,
  strip_items, imported_at }`. `type: "planner"` for a route built from scratch; `type: "charter-v1"` stays on migrated
  records. `last_applied` is gone.
- Anchorage library entries gain `kind: "anchorage" | "stop"`, default `anchorage`. Route points keep `anchorage_id`
  for either kind.

**Rules that change**
- `arrive.day` (and the arrival estimate) is **computed by the admin** on every change to a departure, a leg or a
  speed: previous departure (time, or 09:00 when unset) plus the leg at its speed, rolling past midnight. The captain
  may pin `arrive.time`; a pinned time re-anchors the chain for the stops after it. The server keeps spec A's
  validation (days never run backwards; origin has no arrive, terminus no depart), which is what guarantees the chain
  stayed consistent.
- **Unassigned routes** (`library/routes.json`) use the same point fields: `arrive`/`depart` days relative to day 1,
  optional `activities`. `nights` and `depart_time` are read as legacy and converted (one night per anchorage stop when
  nothing is set) until migration v5 rewrites the file; new saves write only days.
- **Computed, never stored:** nights (`depart.day − arrive.day`), days (spec A `deriveDays`), clashes, and **fit** —
  the last stop's arrival date against the charter's `end_date`: *matches*, *N days short*, *N days over*. Day 1 =
  `charter.start_date`; an unassigned route has no fit.

**Removed:** the `too-long` refusal (an import may run over; the fit pill says so).

**Migration v5 `record-shape`** (runs once, after the runner's backup): library routes get `arrive`/`depart` from
nights and lose `nights`/`depart_time`; charter records get `dirty_stop_ids: []`; anchorages get `kind`.

---

## 4. Server (`iolanthe-server`)

- **`POST /api/admin/charter/<id>/itinerary/import`** `{ source: { type: "library" | "charter", id }, from_day,
  strip_items, base_revision }`. Pure `importRecord(current, record, fromDay, dayCount, { stripItems, now })`:
  1. keep the current route's stops reached before `fromDay` and the path to the last of them, closing that stop on
     `fromDay` (exactly spec A §3.2 step 1);
  2. append the record's points with fresh stop ids; if the record's first stop is at the same spot as the last kept
     stop (`SAME_SPOT_M`), merge them, keeping the kept id;
  3. **re-base**: shift every imported `arrive`/`depart` day by `fromDay − firstDay`, where `firstDay` is the imported
     origin's `depart.day` (or `arrive.day` of the first stop, or 1), preserving spacing; recompute nothing else;
  4. items come along with their `stop_id` remapped and `day` shifted the same way, unless `strip_items`;
  5. `source` as in §3; `dirty_stop_ids` of the result = none (a fresh import is not dirty);
  6. no refusal for length. 409 on a stale `base_revision` with the stored record; 404 for an unknown source.
- **`itinerary/save`**: unchanged route; accepts the new fields. Validation adds `duration_min` bounds; dirty ids
  filtered to existing stops.
- **`routes/save`** (unassigned): accepts `arrive`/`depart` days and `activities`; drops legacy `nights`/`depart_time`
  on write; items are kept (they may be standard items for that route). Validation: the same stop/day/site rules as a
  charter record, with `dayCount` taken as the terminus's arrival day.
- **`anchorages/save`**: accepts `kind`.
- **`GET /api/admin/charters`**: each summary gains `stops` (count), so Start from… can list "Reyes family · 7 stops".
- **Removed:** `itinerary/apply-route`, `applyRoute` and its `too-long` error.
- **Unchanged:** `/api/charter`, `/api/planned-route` (and its one-release legacy wrapper), weather stop selection,
  everything the guest reads.
- **Migration v5** as §3. `scripts/check-itinerary-endpoints.sh` gains checks 8–10: import 200, apply-route 404,
  library save keeps items.

---

## 5. Admin: the Route page (`iolanthe-admin`)

### 5.1 Header

- **Working on:** *This charter's route*, then **Unassigned routes** as a group. (Other charters are not edited from
  here; they are import sources.)
- **Fit pill**: green ✓ when the last arrival date equals the charter's `end_date`; amber `−2 d` / `+1 d` otherwise;
  grey `—` for an unassigned route or a charter without dates. Tooltip: "Ends Sat 17 Oct; the charter ends Sun 18 Oct."
- **To-check pill**: `3 to check` while `dirty_stop_ids` is non-empty.
- Icon actions as today (Save, Cancel, Undo, Redo, Import KML/GPX, Export) plus **Start from…** and **Save as
  unassigned** (= today's Save As; items kept). Delete stays for unassigned routes.

### 5.2 Side column

Stat tiles as now. The tab box holds **Legs** (as now) and **Days**: the spec A tube-line renderer (`lineGeometry`,
`deriveDays`, titles left, day boxes with one sub-box per stop, items listed) with every editing affordance removed.
Below: map layer toggles **Sites · Anchorages · Stops**. The Stops list is gone; the strip is the stops.

### 5.3 Map

Behaviour unchanged. Clicking a stop spins the strip to its card and highlights the marker; opening a card from the
strip pans the map to the stop. The Stops layer shows anchorage-library entries with `kind: "stop"`; the anchorage
modal gains a **Kind** choice (Anchorage / Stop). Deleting a stop that has items, by any map action, goes through the
popup in §5.7 first.

### 5.4 The strip

Docked under the map, full width. Every stop is a card; the open card is in full, the others are stacked edges either
side, widths shrinking with distance from the open card, each edge showing its number and short name. **Clicking an
edge jumps to that card.** Edge colours: plain; **red** when the stop is in `dirty_stop_ids`; **green** on the last
card when fit is exact. Previous / Next icon buttons, the ← / → keys and a horizontal swipe scroll the strip.
**Selecting a card, by any of these means, pans the map to its stop; clicking a stop on the map selects its card.** Spinning to a red card removes it from the dirty
list (no confirm). On a narrow screen the strip keeps full width below the map.

### 5.5 The card

- **Header:** number badge, name, kind, "N nights" (or "day stop"); icon buttons ◀ ▶ and ⚙.
- **Tiles:** **Arrive** — `~15:45 · Mon 12 Oct`, italic when estimated, upright when pinned, with the inbound leg's
  distance and hours underneath; the origin's tile shows the charter start date and "boarding". **Depart** — a date
  picker whose earliest choice is the arrival day, and a time; underneath, the nights. **Next leg** — distance, hours
  at the leg speed, estimated arrival with "overnight" when it crosses midnight; absent on the terminus.
- **Day tabs:** one per day the boat is there (`arrive.day` … `depart.day`; origin from day 1; terminus to the last
  day), each labelled with the date, the day number and the item count. The active day lists its items as rows: a
  coloured bar (blue = site-backed, teal = free text, red = clash), time, title, site, grip, ✕. A clash row names what
  it clashes with. Three icon buttons add an item: from the stop's served sites, from any site (type-ahead by
  distance), or free text. Clicking a row edits title, time, duration and notes inline (Enter commits, Esc cancels).
  The grip reorders within the day; dropping on another Day tab moves the item to that day.
- **⚙ tab:** name; sites served (ticks, by distance, within 5 nm first); the next leg's speed; **Global stop** switch
  for a plain stop (saves it to the anchorage library with `kind: "stop"` and links the point to it); **Remove stop**.
- **Keyboard:** Tab order follows the card; ← / → change card when focus is on the card itself.

### 5.6 Changing a departure (the cascade)

Changing a stop's departure day by Δ shifts every later stop's `arrive` and `depart` days by Δ, and their items' days
with them; arrival times along the chain are recomputed from the legs; every later stop is added to
`dirty_stop_ids`; the fit pill updates. Changing only the departure time recomputes the chain's arrival estimates
and, where an estimate crosses midnight differently, shifts the affected later stop by a day and marks it dirty.

### 5.7 The popup

Before any change that would drop a day holding items (earlier departure, removing a stop, re-import), a popup:
"Changing the date will remove the itinerary entries for the 14th and 15th (4 items)." with **✓** (proceed; the
items are deleted) and **↶** (revert; nothing changes). It uses the Route panel's modal shell and icon buttons.

### 5.8 Start from…

A dialog listing unassigned routes and other charters ("Reyes family 2026 · 7 stops"), a **From day** picker
(default day 1 for a charter not yet started, today for one in progress), and **Strip items** (ticked by default when
the source is a charter, unticked for an unassigned route). On an empty route it is also offered inline on the strip.
Calls §4 import; the strip and map re-render from the response. Nothing is refused; the fit pill reports.

### 5.9 Removed from the admin

`itinerary.js`, `itinerary.css`, the Itinerary nav entry, the Apply-route and Promote dialogs, the Stops tab list
(`routes-lists.js` keeps Legs), `IolantheAdmin.showCharterPanel`/`getCharterContext` if nothing else uses them.

### 5.10 Code shape

- `stop-cards.js` / `stop-cards.css` — the strip and the card, created per bind with a `ctx` from `routes.js`
  (`getWork`, `editPoints`, `editRecord`, `focusPoint`, `status`, `openModal`, `places`, site library).
- `itinerary-core.js` gains: `recomputeArrivals(record, dayCount)`, `shiftFromStop(record, stopId, delta, dayCount)`
  (returns the record with dirty ids added), `droppedDays(record, stopId, newDepartDay)` (what the popup names),
  `clashes(record)` (map item id → reason), `fit(record, charter)`, `rebaseRecord(record, fromDay)`. Existing activity
  and day functions stay; `edgeStates`/`moveEdge` and the drag code are deleted with the panel.
- `routes.js`: header fields, Days tab, strip wiring, Start from…, unassigned grouping; Stops list removed.
- `routes-places.js`: anchorage kind, Stops layer and toggle.
- Styles scoped under `.routes-panel`; icon buttons and tiles reuse `routes.css` classes.
- Read-only after the charter's end date applies to the strip and card.

---

## 6. Guest app, data, rollout

- **Guest: no code change.** The stylised paper-list itinerary look is preserved exactly. New fields are ignored by the
  existing normaliser; pinned arrival times show as today.
- **Live data:** migration v5 at the next server deploy; existing v2 records change only by gaining the empty dirty
  list. The El Nido route imports with "+1 d" and is fixed on two cards.
- **Rollout:** server first (rehearsed on a copy of the live volume in a throwaway container), then admin in one
  release that adds the strip and deletes the Itinerary panel and Apply dialog together.

---

## 7. Testing

- **Server `node --test`:** `importRecord` (from day 1; mid-charter with kept stops and the current one closed;
  spacing preserved; items shifted; items stripped; same-spot merge; running past the charter is accepted); legacy
  nights → days; anchorage kind default; duration bounds; dirty-id filtering; migration v5 over fixtures. Curl script
  checks 8–10.
- **Admin `node --test`:** `recomputeArrivals` (midnight crossing; pinned time re-anchors), `shiftFromStop` (cascade +
  dirty), `droppedDays`, `clashes` (overlap, before arrival, after departure, default duration), `fit`
  (match/short/over/none), `rebaseRecord`; existing activity/day/validation tests keep passing.
- **Browser (local server):** map click spins the strip and the card pans the map; a departure change reddens later
  cards and ambers the pill; visiting clears red; the popup appears and ↶ restores; site, free and clashing items; drag
  between Day tabs; Start from an unassigned route with and without items; Save as unassigned keeps items; Days tab
  read-only; Legs and all map modes unchanged; read-only after the end date; every admin panel loads clean after the
  deletions.
- **Live rehearsal:** v5 on a copy of the live volume; El Nido import against the January charter → "+1 d".
- **On the boat:** touch on the bridge tablet; the captain's first real import.

## 8. Out of scope

A whole-Admin style guide (separate task); the guest preview with a date slider (spec B); revisions for the other
charter files (spec C); any change to the guest itinerary's appearance; de-duplicating anchorages vs stops in the
library beyond the `kind` field.

## 9. Open questions

None blocking. For the implementation plan to confirm on first contact: the exact shrink curve for the stacked edges
(start with 24 px, 16 px, 10 px, 6 px … minimum 4 px), and whether `routes-lists.js` keeps a file of its own once the
Stops list is gone or folds into `routes.js`.
