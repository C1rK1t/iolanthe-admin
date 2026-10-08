# Charter itinerary rework — spec A2 round 2: the captain's first contact (draft 1)

Written 2026-10-08 from the brainstorm recorded in [decisions.md](decisions.md) (entries A2-T8 … A2-T15). It
refines [spec-a2.md](spec-a2.md), which is live on the vessel with its first tweak round (plan a2-03). Nothing in
the record shape changes; the server change is one constant.

Mockups (git-ignored, `.superpowers/brainstorm/34328-*/content/`): `start-from-layouts.html` (the three dialog
shapes; C chosen), `start-from-c-v2.html` (the chosen dialog in detail), `time-picker.html` (the four time
controls; B chosen with 15-minute steps).

Repos: **A** = `portal/iolanthe-admin`, **S** = `iolanthe/iolanthe-server`. The guest is untouched.

---

## 1. Why

The captain's first contact with the Route page on the bridge tablet, relayed by David on 2026-10-08:

- "All OK at first glance."
- The **Start from… dialog is a confusing mess** (screenshot in the session): a radio list, a from-day select and a
  "Strip the record's items" checkbox run together with no separation, routes carry a cryptic "−1 d" suffix, and a
  dense help paragraph explains what the result line should simply say. David added: what happens with several
  unassigned routes and twenty past charters? The radio list does not scale.
- **Cards should move left and right with the keyboard arrows.** They do, but only while the card itself has
  focus; after a click on the map the keys do nothing.

David's own second-look notes (A2-T8 … T13) are folded into the same round.

## 2. Decisions

| # | Decision |
|---|---|
| T8 | **Days tab:** the stop name and its Arr/Dep line move from the left titles column into that stop's sub-box, as a header above the items. The titles column goes. |
| T9 | **Separation:** a gap between consecutive day boxes; on the card, the nights/date control and the time control are separated, each with its own label. |
| T10 | **Line → card → map:** clicking a stop on the tube line scrolls the strip to its card and moves the map; every move of the map caused by the line or a card zooms in as well as pans. |
| T11 | **Wording on unassigned routes:** the Depart tile is titled "Stop duration"; a "Departure time" label sits above the time control in both modes. |
| T12 | **Default departure time** instead of a blank: 07:00 when the stop has nights; the estimated arrival + 2 h for a day stop. The blank-time fallback moves from 09:00 to 07:00 on both sides. |
| T13 | **Time control:** two native selects, hour (00–23) and minute (00, 15, 30, 45), chosen over the native time input, a ±15-minute nudge pair and a stepper. |
| T14 | **Start from… dialog, shape C:** one grouped dropdown for the record, "Starting on", a positive "Bring its N items" switch, and a result line that replaces the help text and the "−1 d" suffix. Chosen over a list-beside-settings layout (A) and a two-step wizard (B), which both struggled for width. |
| T15 | **Arrow keys anywhere:** ← / → step the strip whenever the Route page is showing and no field or dialog has focus; Leaflet's keyboard panning is off. |

Unchanged from spec A2: the record, the server API, the guest, the read-only guard (still switched off for data
repair; a reminder is set for mid-November 2026 to restore it).

---

## 3. The Start from… dialog (T14)

`openStartFrom` in `routes.js` keeps its data flow (fetch routes and charter summaries, `fit(rebaseRecord(…))`
preview, `askDrop` guard, `itinerary/import` call, 409 handling) and gets a new body:

**Record** — one native `<select>` with `<optgroup>`s:
- "Unassigned routes" first, sorted by name; option text `Name · N stops`.
- Then one group per year of `charter.start_date`, newest year first, labelled "Charters 2026"; inside a group the
  newest charter first; option text `Name · Mar · 7 stops` (the start month, short). Charters without a start date
  go last in a group "Charters" sorted by name.
- Records with no stops are left out (as today). The current charter is never listed.
- Preselect: the route id passed by "Assign to this charter" (T7), else the first option.
- The summaries endpoint already returns `charter` with its dates, so no server change.

**Starting on** — the existing day select (`Day 4 · Wed 4 Nov`), relabelled. Default unchanged: day 1 on a route
with no stops, today on one in progress, clamped to the charter.

**Itinerary items** — a switch labelled "Bring its N items" where N is the chosen unassigned route's activity count
(the routes list carries `activities`); for a charter source the label is "Bring its items" (the summaries carry no
item count and the server is not touched for one). The switch is hidden when an unassigned route has no items.
Default: on for an unassigned route, off for a charter; once flipped by hand it keeps its state across record
changes (today's `stripTouched` logic). Sent as `strip_items: !checked`.

**Result line** — a dot and two lines, recomputed on every change of record or day:

| State | Dot | Line 1 | Line 2 |
|---|---|---|---|
| match | green | Ends Tue 10 Nov · fits the charter | 11 stops · Sun 1 Nov to Tue 10 Nov |
| short | amber | Ends Mon 9 Nov · 1 day before the charter ends | 11 stops · Sun 1 Nov to Mon 9 Nov · the charter ends Tue 10 Nov |
| over | amber | Ends Thu 12 Nov · 2 days after the charter ends | 11 stops · Sun 1 Nov to Thu 12 Nov · the charter ends Tue 10 Nov |
| mid-charter, K stops kept | as above | as above | Keeps the K stops reached before Wed 4 Nov, then 11 stops to Tue 10 Nov |
| nothing to start from | grey | No unassigned routes or other charters with stops yet | — (✓ disabled) |

"1 day" / "2 days" pluralise. Line 1 and line 2 come from a new pure helper in `itinerary-core.js`:
`fitSentence(fitResult, charter, { stops, fromDay, keptStops })` → `{ line1, line2, tone: "ok" | "warn" | "none" }`,
so the wording is unit-tested. The help paragraph, the "−1 d" suffix and the "Items" field label are gone.

Layout: Record full width; Starting on and Itinerary items side by side (`grid2`); the result line below in a soft
box. Dialog width stays the wide modal. The ✓ (Import) / ✕ icon buttons stay in the header as on every Route page
dialog. Phone: the two settings stack.

## 4. The time control (T13)

`routes-ui.js` gains `timeSelects({ value, allowBlank, onChange })` returning `{ root, get, set }`: an hour
`<select>` (00–23) and a minute `<select>` (00, 15, 30, 45) in a `.time-selects` row with a ":" between. Rules:

- `value` is an `HH:MM` string or blank. A stored minute off the 15-minute grid (09:20 on migrated data) is added as
  one extra option, selected, so nothing is rounded silently; it disappears once another value is picked. The option
  lists come from a pure `timeOptions(value, { allowBlank })` → `{ hours, minutes, hour, minute }` in
  `itinerary-core.js`, so the grid logic is unit-tested without a DOM.
- `allowBlank` adds a leading "—" option to both selects (blank time); picking an hour with a blank minute sets `:00`.
  Used for item times only. Departure times never allow blank (T12 fills them).
- `onChange(value)` fires with the combined string on either select's `change`.
- Used by the Depart tile (`stop-cards.js` `departTile`) and the item inline editor (`editItem`). Values stay
  `HH:MM`, so `setDeparture`, `updateActivity`, validation and the server are untouched.
- Styles in `stop-cards.css`: same height and font as the current `.tile-time` input; selects sized to their content.

## 5. The Days tab (T8, T9, T10)

`routes-days.js` and the `.days-*` rules in `routes.css`; `lineGeometry` and `deriveDays` are unchanged.

- **T8.** `subBox(stop, day)` renders a header `.days-sub-head`: the stop name (bold) and a muted times line from
  `stopTimesLabel`, italic when estimated. Which times show depends on the day: the arrival day shows the arrival
  (and the departure if it is the same day); a middle day shows "N nights" only; the departure day shows the
  departure. A new pure `subBoxTimesLabel(stop, times, day)` in `itinerary-core.js` returns that text and is tested;
  `stopTimesLabel` stays for the card hint. The header is clickable (`ctx.onStopClick`), as the SVG shapes are.
  `.days-titles` and `.days-stop-title` go; the board grid is `32px minmax(0, 1fr)`.
- **T9.** Day boxes: `gap: 8px`, each with its own full border and radius (the joined-box `+` rules go). Card:
  see §6 for the Depart tile layout.
- **T10.** `onStopClick` in `routes.js` calls `cards.select(stopId, { reveal: true })`; `select` with `reveal`
  scrolls the strip host into view (`scrollIntoView({ block: "nearest", behavior: "smooth" })`) after rendering.
  `panToStop` becomes `map.setView(latlng, Math.max(map.getZoom(), STOP_ZOOM))` with `STOP_ZOOM = 13`, which covers
  the tube line, the card edges, ◀ ▶, the arrow keys and Start from… (all go through `select` → `panToStop`).
  Clicking a marker on the map keeps selecting without panning.

## 6. The card: wording and the default departure time (T11, T12)

- **Depart tile layout.** Title "Depart" (charter mode) or "Stop duration" (unassigned route). Row 1: the date
  picker (charter) or the nights count with "nights" (unassigned). Row 2: a small label "Departure time" above the
  time selects, with a 10-px gap from row 1. Row 3: the hint as today ("2 nights", "day stop", "sails on day 1",
  "N nights aboard before sailing"), plus " · assumed" in italics when no time is stored.
- **`defaultDepartTime(record, stopId)`** in `itinerary-core.js`: the stop's nights > 0 → `"07:00"`; a day stop →
  its estimated arrival (`estimateTimes`) + 120 minutes, clamped to `"23:59"`; no arrival estimate → `"07:00"`.
- **`setDeparture`** applies it: when the resulting departure has no valid time, the default is stored. So a nights
  or date change on a stop with no time stores the default and the chain is recomputed from it; a time change stores
  exactly what was picked. The selects always show the effective time (stored, else the default).
- **Fallbacks.** `SEED_DEPART_TIME` → `"07:00"` in `itinerary-core.js`; `estimateTimes` changes its day-stop rule
  from "departs at the arrival time" to "arrival + 2 h" (same clamp), so the tube line, the card and the chain agree
  with the helper. Server `lib/itinerary.js` `SEED_DEPART_TIME` → `"07:00"` (used only to estimate midnight
  crossings on import); its fixtures updated.
- Nothing is written to stored records by migration; defaults land stop by stop as the captain edits. The guest
  shows a departure time only when one is stored, as today.

## 7. Arrow keys (T15)

The page-wide `keyHandler` in `routes.js` (undo/redo) also handles `ArrowLeft` / `ArrowRight`: `cards.step(∓1)`
when the Route page is showing, no input/textarea/select has focus and no dialog is open (the existing guards). The
map is created with `keyboard: false` so Leaflet does not pan on the same keys. The card's own keydown handler stays
for when the card is focused and stops propagation so a press never steps twice.

## 8. Housekeeping in the same release

- `itinerary-core.js` header comment: "for the Itinerary panel" → the Route page.
- `#panel-itinerary` CSS in `admin.js`: delete if a grep shows no element or reference uses it, and only if the
  other session working on charter management has no `admin.js` change in flight; otherwise leave it and note it.
- Re-verify dropping a stop onto a *different* anchorage (pre-existing snap path) in the browser pass.

## 9. Testing

- **Admin `node --test`:** `fitSentence` (match / short / over / mid-charter keeps K / none; day plurals);
  `defaultDepartTime` (overnight 07:00; day stop arrival + 2 h; late arrival clamps at 23:59; no estimate → 07:00);
  `setDeparture` fills the default when no time is set and keeps a picked time; `estimateTimes` day-stop rule and the
  07:00 seed; `subBoxTimesLabel` (arrival day, middle day, departure day, same-day stop); `timeOptions` (grid, off-grid value
  added once, blank option). Existing tests keep
  passing; around 120 in total.
- **Server `node --test`:** the seed constant's fixtures updated; count unchanged.
- **Browser, scratch server:** Start from… with one source and with many (seed extra charters in `data-scratch`),
  each result-line state, switch on and off, mid-charter start naming the kept stops, preselect from "Assign to this
  charter"; time selects on the Depart tile and an item, an off-grid value preserved, blank item time; Days tab
  headers across a multi-day stay, gaps, click → card scrolls into view → map zooms; "Stop duration" on an
  unassigned route; default time stored on a nights change and shown as assumed before; arrows after clicking the
  map and after clicking a card; a different-anchorage drop; phone width; every admin panel loads clean.
- **On the boat:** the captain's second look.

## 10. Rollout

- **Admin:** branch `feat/itinerary-a2-round2`, one PR, asset version `admin-itin-a2d` on every `?v=` in
  `index.html`; merge on David's word (auto-deploys within 5 minutes).
- **Server:** branch `feat/seed-depart-0700`, one PR; after merge the manual `git pull --ff-only` and
  `docker compose up -d --build iolanthe-server` on docker-vm. No migration. Either order is safe: the admin
  recomputes arrivals itself, and the server constant only affects an import's midnight-crossing estimate.

## 11. Out of scope

Restoring the ended-charter read-only guard (reminder set for mid-November 2026); plan 5 Task 8 shims (guest v1
converter, legacy planned-route wrapper, guest `?v=`); specs B and C; any change to the guest.
