# Charter setup and management — spec: the Gantt band and the active rule (draft 1)

Written 2026-10-08 from the brainstorm with David (companion mockups, git-ignored, in
`.superpowers/brainstorm/31923-*/content/`: `gantt-placement.html`, `gantt-interactions.html`, `info-layout.html`,
`dialogs.html`). It covers the Charter section's setup and management pages. The Route page built under
[spec-a2.md](spec-a2.md) is not changed by this spec; everything here must sit sympathetically above it.

Repos: **S** = `iolanthe/iolanthe-server`, **A** = `portal/iolanthe-admin`. The guest (`portal/iolanthe-guest`) is
untouched.

---

## 1. Why

Four asks from David (2026-10-08):

1. Improve the workflow and usability of charter setup and management.
2. Bring the Charter pages in line with the style chosen for the Route page (icon buttons, stat tiles, uppercase labels).
3. Rework "active" and "selected" so they make sense: the charter underway, or the next one, is active.
4. A Gantt chart across the top of the Charter page showing every charter over time, zoomed to the active charter by
   default, zoomable out to three years, scrollable, with Unavailable / Maintenance placeholders, and clicking an entry
   takes you to it.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | **The Gantt is the charter selector.** It sits under the Charter section's panel tabs on every panel (Charter Info, Crew, Route, Site Editor). The "Select Charter" dropdown goes from the Charter section. Galley and Hotel keep their dropdowns. |
| D2 | **On the Route page the band starts collapsed** to a one-row strip and can be expanded; the state is remembered per browser. |
| D3 | **Active = in date, else the crew's choice.** A charter is *in date* from the day before its start date to its end date inclusive; an in-date charter is forced active. Otherwise the stored choice applies (any charter, past or future); with no usable stored choice, the most recently ended charter. The end of a charter has no buffer. |
| D4 | **Back-to-back turnaround:** if A ends on the 9th and B starts on the 10th, B's day-before window wins on the 9th. |
| D5 | **No overlaps.** Charter dates may not overlap another charter's dates or a reserved period; setup refuses them. The day-before window is not part of the check. |
| D6 | **Make active is a button on the charter** (Info page header), disabled while any charter is in date. The active charter is gold on the Gantt and is what the guest portal shows and what track logging writes to. |
| D7 | **The Gantt is read-only.** Drag pans, the wheel zooms, arrows and the scrollbar pan. Clicking a charter bar selects it; clicking a reserved period opens its card. No drag-to-create, no date dragging, no context menu. |
| D8 | **Reserved periods** (Maintenance / Unavailable / Other) are created from a button beside New charter and edited or deleted from the same card, which also opens by clicking the bar. They are never active and invisible to guests. |
| D9 | **Both the Create step and the Info form are reworked.** Create lands on the new charter's Info; the form is regrouped into sections. |
| D10 | **Info page layout B:** two columns on wide screens (facts left, free text right), one column below 900 px. |
| D11 | **New charter keeps "Copy from"** (route & itinerary, crew, menus, drinks) and drops the "Set active" tick box. |
| D12 | Technical: the active rule runs on the **server**; the Gantt is **plain DOM**; reserved periods live in **one file** `data/reserved-periods.json`. |

## 3. The active rule

Pure function, implemented twice from shared fixtures (server `lib/active-charter.js`, admin `charters-core.js`):

```
activeCharterId(charters, storedId, today) →
  1. the charter whose window [start_date − 1 day, end_date] contains today
     (if more than one — only possible on a turnaround day — the one with the later start_date);
  2. else storedId, if that charter still exists;
  3. else the charter with the most recent end_date before today;
  4. else "".
```

- Charters with no valid dates (missing, unparsable, end before start) never match step 1 or 3; they can only be
  active through step 2.
- `today` is the server's local date (`localTodayDateValue`) on the server and the browser's local date in the admin.
  The charters list carries the server's `today` so the admin can show a warning if the two disagree.
- Reserved periods are never considered.

### Server

- `getActiveCharterId()` (S) becomes: read `active-charter.json`, call `activeCharterId(listCharterSummaries(),
  stored, localTodayDateValue())`. Everything that calls it today (guest `/api/charter`, planned route, weather stops,
  watches, track state, snapshot, admin runtime) follows without change. `ensureTrackState()` already reloads the track
  when the id changes, so logging switches on the changeover day by itself.
- `DEFAULT_ACTIVE_CHARTER` and `resolveActiveCharterId`'s fallback to it are removed; the rule replaces them.
- `POST /api/admin/active-charter {charter_id}`: refuses with **409** `{error, forced_charter}` while a charter is in
  date; otherwise writes the stored choice as today. The "completed charter cannot be set active" refusal and
  `validateActiveCharterDateRange` are removed.
- `GET /api/admin/charters` returns `{charters, active_charter, stored_active_charter, forced, today}`. Each summary
  gains `nights` (end − start, or `null`) and `status`: `underway` (start ≤ today ≤ end), `upcoming`, `ended`,
  `no-dates`. Existing fields (`id`, `name`, `charter`, `stops`) stay.
- `createAdminCharter` ignores `set_active`.

## 4. Overlaps

- Two date ranges overlap when `a.start ≤ b.end && b.start ≤ a.end` (inclusive days). Ranges with invalid dates never
  overlap anything.
- Checked on the server in `charters/create`, in `charter/:id/save` when `file === "charter.json"`, and in
  `reserved-periods/save` (each period against every charter and every other period). Failure is **400**
  `{error: "Overlaps <name> (<start> – <end>)", overlaps: [{kind: "charter"|"period", id, name, start_date, end_date}]}`.
- The admin runs the same check live in the Info form, the New charter dialog and the Reserved period card
  (`charters-core.js` `findOverlaps`), shows the clash under the date fields and disables Save. The server message
  is shown inline if it fires anyway.

## 5. Reserved periods

`data/reserved-periods.json`:

```json
{ "revision": 3,
  "periods": [
    { "id": "p-1a2b3c", "type": "maintenance", "title": "Subic yard period",
      "start_date": "2026-09-20", "end_date": "2026-09-28", "description": "Haul-out, antifoul" }
  ] }
```

- `type` ∈ `maintenance | unavailable | other`; `title` 1–80 chars; dates valid and `end ≥ start`; `description`
  free text (≤ 2000). Ids are generated server-side (`p-` + 6 base36 chars) when missing; client ids matching
  `^[A-Za-z0-9_-]{1,40}$` are kept.
- `GET /api/admin/reserved-periods` → the file (`{revision: 0, periods: []}` when absent). Admin auth, any department.
- `POST /api/admin/reserved-periods/save {periods, base_revision}` → 400 on validation or overlap, 409
  `{error, revision, periods}` when `base_revision ≠ revision`, else writes atomically, bumps `revision`, returns the
  file. Charter Admin on bridge only (same guard as `active-charter`).
- Nothing public reads the file; the guest payload is unchanged.

## 6. The Gantt band (admin)

### Files

- `charters-core.js` — pure, also a Node module: `activeCharterId`, `findOverlaps`, `charterStatus`, `nights`,
  `packLanes` (bars into rows without overlap; charters lane 1, periods lane 2), `zoomSpan(level, anchor)`,
  `dateToX` / `xToDate`, `visibleMonths`, `visibleWeeks`. Tests in `test/charters-core.test.js`.
- `charter-gantt.js` — `window.IolantheCharterGantt.mount(host, ctx)` returns `{update, destroy}`. `ctx` carries the
  charters list, reserved periods, selected id, active id, forced flag, today, and callbacks `onSelectCharter(id)`,
  `onOpenPeriod(id|null)`, `onCreateCharter()`, `onDeleteCharter()`, `onToggleCollapsed(bool)`.
- `charter-gantt.css` — scoped under `.charter-gantt`.
- Both added to `index.html` with the asset version string.

### Placement

- `sectionShell("charter", …)` renders `<div class="charter-gantt-host">` between the section nav and the section
  content. `renderCharter` mounts the band once per render with the current state; the panels render below as today.
- Collapsed (`localStorage` key `iolanthe-admin.gantt.collapsed`, default `true` on the Route panel, `false`
  elsewhere): a one-row strip with the selected charter's name, dates, nights, status pill and an expand button.
  Expanded: toolbar + chart, about 170 px tall.

### Toolbar (left to right)

Title "Charters" with the visible span (e.g. "Oct 2026 – Jan 2027"); ‹ › scroll buttons; ● Today; zoom segment
**Active · Quarter · Year · 3 years**; separator; **+ New charter**, **▦ Reserved period**, **🗑 Delete charter**
(icon buttons, charter-admin-on-bridge only, as the old toolbar buttons were); separator; collapse toggle.

### Chart

- Month header row and week tick row; lane 1 charters, lane 2 reserved periods; red today line with a label; a
  horizontal scrollbar under the lanes.
- Bar text: name, then meta when the bar is wider than ~140 px: "N nights" or "N stops · N guests" (wider than ~220 px).
- Colours (CSS variables added to `admin.css`): `--gantt-active: #c9a24a` (gold), charter `var(--accent)`, ended
  `#9aa7ad`, maintenance grey stripes, unavailable red-grey stripes, other lilac stripes. The selected charter has a
  3 px `var(--ink)` outline. Bars with no dates are not drawn; they are listed in the tooltip of a small "N charters
  without dates" pill on the toolbar, and selecting one of them is done from that pill's menu.
- Tooltip on hover/focus: name, "Sun 1 Nov – Mon 9 Nov 2026", nights, guests, stops, status; for periods: type,
  title, dates, description's first line.

### Interaction

- Drag the chart (pointer events, 4 px threshold) or the scrollbar to pan; ‹ › pan by a quarter of the visible span;
  ← → pan by a week when the band has focus; the mouse wheel zooms around the pointer (ctrl not needed), clamped
  between 2 weeks and 3 years visible; the zoom segment sets fixed spans: Active = the active charter plus 7 days
  either side (falls back to Quarter when there is none), Quarter = 13 weeks, Year, 3 years; each centred on the
  active charter, or today when there is none. ● Today centres today at the current zoom.
- The scrollable range is three years around today, widened to include every charter and period.
- Clicking a charter bar calls `onSelectCharter`; the host applies the same discard-changes guard as the dropdown did
  (`confirmDiscardPageChanges`), sets `state.selectedCharter`, clears the bundle and re-renders the current panel.
  Clicking a period bar calls `onOpenPeriod(id)`. Bars are buttons (keyboard-reachable, `aria-pressed` on the selected
  charter).
- Empty state: the toolbar plus "Use + to create your first charter".

## 7. Charter Info page

- **Header row:** charter name (h2), status pill, ★ Make active (gold tone; disabled with the tooltip "Csaba is in
  date and is active until 9 Nov" while forced), separator, ✓ Save (submit), ✕ Cancel. The old "N Days" title moves
  into the pill: "Active · day 3 of 9", "Upcoming · starts in 12 days", "Ended · 9 Nov 2026", "No dates".
- **Stat tiles:** Nights, Guests, Stops (from the summary), Divers.
- **Sections** (`.form-section` with an uppercase heading): left column Charter (name, style, start, end, guests,
  diving guests), Arrival (date, time, flight), Primary contact (name, phones); right column Preferences & flags
  (four tick boxes, charter preference notes, drink preference notes) and Notes. Below 900 px the columns stack.
- Field ids, normalisation and the save path (`saveCharterFile("charter.json", …)`) are unchanged. The overlap check
  runs on date input (section 4). The dirty guard, Cancel behaviour and the status line stay as today.
- **Make active:** confirm "Make Larry the active charter? Guest tablets will show it." → `POST active-charter` →
  on success update `state.activeCharter`, re-render the band and the pill; on 409 show the server's message.

## 8. Dialogs

- **New charter** (`openCreateCharterModal`, reworked): name (folder id shown as a hint, derived as today), start,
  end (nights hint), guests, Copy from (charters newest start date first, "— nothing —" default) enabling the four
  copy tick boxes, live overlap warning. Submit posts `charters/create` without `set_active`; on success
  `state.selectedCharter = id`, reload the bootstrap, render Info. Modal buttons are the ✓ / ✕ icon buttons.
- **Reserved period card** (`openReservedPeriodModal(id|null)`): type segment, title, start, end (days hint),
  description; 🗑 Delete in the header for an existing period (plain confirm). Save builds the new `periods` array
  and posts with `base_revision`; a 409 offers "Reload" (re-fetch and reopen with the latest list) / "Cancel".
- **Delete charter:** unchanged flow (checkbox + charter password), opened from the band's toolbar.

## 9. Shared styles

Added to `admin.css`, written as the first slice of the whole-admin style rollout (memory note of 2026-10-06), and
used by the band, the Info page and the two dialogs:

- `.stat-tiles` / `.stat-tile` (shaded tile, big number, uppercase caption) — mirrors the Route page's tiles.
- `.form-section` (card with an uppercase accent heading; uppercase 12 px field labels inside).
- `.status-pill` with `--active` (gold), `--upcoming`, `--ended`, `--none` tones.
- `.segmented` (the zoom and type segments).
- `.admin-icon-button--gold` tone for ★.

`routes.css`, `stop-cards.css` and the Route page's markup are not touched; the Route page adopts the shared classes
in a later style task.

## 10. Selection and other sections

- `syncSelectedCharter()` keeps its fallback order (selected if it exists, else active, else first). On login the
  Charter section therefore opens on the active charter.
- Galley and Hotel keep their "Select Charter" dropdowns and default to the active charter as now. The top bar's
  "Active charter · N Days" summary reads the computed active id from the charters response.
- `showCharterPanel` and the Route page's "Working on", Start from…, assign-to-charter (A2-T7) and the strip are
  unchanged; they read `state.selectedCharter` as before.

## 11. Testing

- **Server (`node --test`):** the active rule (today inside, the day before, the end day, turnaround day, no stored
  choice, stored choice removed, all ended, no dates); overlap detection with charters and periods; reserved-period
  validation, id generation and 409; `active-charter` 409 while forced; `charters` payload shape.
- **Admin (`node --test`):** `charters-core` with the same active-rule fixtures (a shared JSON fixture copied into both
  repos' `test/`), `findOverlaps`, `packLanes`, `zoomSpan`, `dateToX`/`xToDate` round trips, `visibleMonths`.
- **Browser checklist** on the scratch server with charter dates set around today: gold on the changeover day and the
  day after; pan by drag, scrollbar, ‹ ›, arrows; wheel zoom and the four fixed zooms; select by bar with the unsaved
  guard; collapsed by default on Route, state remembered; create refused on overlap (admin and server); reserved
  period create / edit / delete and a forced 409; Make active disabled while in date and working otherwise; Galley and
  Hotel unchanged; Route page regression (Working on, Start from…, strip, splitters, assign to charter).

## 12. Out of scope

Guest app; the Route page's internals; Galley and Hotel pages; the full admin style guide; drag-editing on the Gantt;
a date-range read of the track; the preview portal (spec B).

## 13. Rollout

1. Server on `feat/charter-gantt`: PR, review, merge, `./update.sh` on the vessel. The live admin keeps working: the
   endpoints it uses are kept, and the only behaviour change it sees is the active charter following the rule.
2. Admin on `feat/charter-gantt`: PR, merge (auto-deploys within 5 minutes), asset version `admin-charters-1`.
3. No data migration. `active-charter.json` keeps its shape; `reserved-periods.json` is created on first save.
