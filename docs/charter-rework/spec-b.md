# Charter itinerary rework — spec B: the guest preview with a date slider (draft 2)

Written 2026-10-08 from the brainstorm (draft 2: three small amendments while planning, marked "amended") recorded in [decisions.md](decisions.md) (entries B-D1 … B-D8). Sub-project 3 of
the rework: "Guest preview with a date slider, wrapping the live guest site." It builds on spec A (guest days derived
from the route-based itinerary) and spec A2 (the Route page as the itinerary editor), both live.

Mockups (git-ignored, `.superpowers/brainstorm/103448-*/content/`): `preview-layout.html` (three homes for the
preview; A chosen), `preview-tab-v2.html` (the chosen tab in detail).

Repos: **A** = `portal/iolanthe-admin`, **G** = `portal/iolanthe-guest`, **S** = `iolanthe/iolanthe-server`.

---

## 1. Why

The captain asked for "a guest-portal preview with a date slider", showing what guests see on each day of a charter,
also usable to review past charters, and built by wrapping the **live guest site**, not a copy
([current-state.md](current-state.md), "The captain's direction"). Today the only way to check a guest's day is to
wait for it, or to change the device clock.

## 2. Decisions

| # | Decision |
|---|---|
| B-D1 | **Home:** a new **Guest view** tab in the admin's Charter section (beside Charter Info, Crew, Route, Site Editor). The live guest site runs in a same-origin `<iframe>`; the slider lives in the admin page. An eye icon button on the Route and Charter Info headers opens the tab. |
| B-D2 | **Which charter:** the charter selected in the admin (Gantt band / Charter Info): future, active or past. |
| B-D3 | **Which data:** the **saved** record only. If the Route page has unsaved changes, the eye button asks Save / Preview the saved version first. No unsaved data is passed into the guest. |
| B-D4 | **Slider:** one step per charter day, plus a "day before boarding" and a "day after the charter" step (pre-charter and "Charter completed" states). Whole days only; the guest's view changes only by date. |
| B-D5 | **Live data:** the boat position (NMEA) and the weather/moon stay live; they cannot be replayed. The **track** is the previewed charter's own recorded track, cut at the end of the slider date. A future charter shows no track. |
| B-D6 | **Security:** the guest endpoints accept `?charter=<id>` only with a valid admin session (any department). With the param and no valid session they answer **401** (never a silent fallback to the active charter). Ordinary guests never send it and see no change. |
| B-D7 | **Plan 5 Task 8 is bundled:** drop the guest's v1 itinerary converter, drop the server's legacy planned-route wrapper, add `?v=` cache-busters to the guest's local script and stylesheet tags. |
| B-D8 | **Release order:** server first (the new params are inert without the guest), then guest and admin together. |

## 3. Admin: the Guest view tab (A)

### 3.1 Placement and entry

- `renderCharter`'s panel list gains `{ id: "preview", label: "Guest view" }` after Route (before Site Editor). The
  Gantt band sits above it like every Charter panel.
- **Eye buttons:** an icon button (eye icon, secondary tone, title "Guest view") in the Charter Info header (next to
  ★ Make active) and in the Route page header (next to the pills). Both switch to the Guest view panel. The Route
  page's button opens it on the day of the selected stop card when the card has a date, else on the default date
  (§3.3). If the Route page is dirty, the admin's usual unsaved-changes prompt runs first (`showCharterPanel` →
  `confirmDiscardPageChanges`): save first, or discard and preview the saved version (amended while planning: one
  prompt for every panel switch, no new dialog).
- The Route page's button is shown only while the subject is "This charter's route" (an unassigned route has no
  guest view).

### 3.2 Layout (mockup `preview-tab-v2.html`)

One card, `.guest-preview` (own stylesheet `guest-preview.css`, scoped under `.guest-preview`):

1. **Header:** `h2` "Guest view", the charter's status pill (same `pillFor` as Charter Info), then right-aligned icon
   buttons: **▯ Phone** / **▭ Tablet** (a two-button segmented control, `aria-pressed`), a separator, **↻ Reload**
   (reloads the iframe at the same date and tab) and **⧉ Full screen** (opens the iframe's current URL in a new
   browser tab; the guest there shows the banner, no slider).
2. **Slider strip** (white rounded box): **‹** previous day, a readout (bold date "Tue 3 Nov"; below it
   "Day 3 of 9 · Apo Island", or "Day before boarding" / "Day after the charter"), the **track** (one tick per step,
   evenly spaced, labelled with the day of the month and the weekday; the "before" and "after" ticks pale; past ticks
   (before today) greyed; the selected tick a large teal knob; a small red "today" marker above today's tick when
   today is in range), **›** next day and **◎** jump to today (disabled when today is outside the range).
   Interaction: click a tick, drag the knob (snaps to ticks), ‹ ›, or ← → / Home / End while the strip has focus
   (`tabindex="0"`, `role="slider"` with `aria-valuemin/max/now` and `aria-valuetext` = the readout). A tick's title:
   "Tue 3 Nov · Day 3 · Apo Island".
3. **Stage:** the iframe, centred, in a device frame (dark border, rounded). Its CSS size is the device's: phone
   390 × 844, tablet 820 × 1180. It is scaled with `transform: scale(k)` (origin top left, inside a box of the scaled
   size) so it fits the stage's width and the window height less 32 px, never above 1; the page scrolls to it.

The stop name in the readout and tick titles is the stop where the boat is at the end of that day (the last stop
whose arrival day ≤ the day; on a passage day, "passage to <next stop>"), from `itinerary-core`'s `deriveDays`.

### 3.3 Behaviour

- **Range:** steps are `start − 1 day … end + 1 day` (B-D4). A charter with no start date (or no end date) shows an
  empty state instead of the strip and stage: "Set the charter dates on Charter Info to preview the guest view", with
  a button that switches to Charter Info.
- **Default date** on opening the tab: today if it is within the range, else the charter's Day 1. The chosen date is
  kept per charter for the session (memory only), so switching panels and back keeps it.
- **Changing the date** replaces the iframe `src` (debounced 250 ms while dragging; a click or key applies at
  once). The guest's current tab is kept: the admin reads `iframe.contentWindow.location.hash` (same origin) before
  the change and appends it.
- **iframe URL:** `/?preview=<YYYY-MM-DD>&charter=<id>#<tab>` (built by `guest-preview-core.js`, §3.4).
- **Charter switch** (Gantt band) re-renders the tab for the new charter with its default date.
- The device choice is remembered in localStorage (`iolanthe-admin.preview.device`, wrapped in try/catch;
  default phone).
- Errors: the guest shows its own error states in the frame (§4.4); the admin adds nothing beyond the empty state.

### 3.4 `guest-preview-core.js` (pure, also a Node module)

| Function | Returns |
|---|---|
| `previewSteps(charter, record)` | `[{ date: "YYYY-MM-DD", kind: "before" \| "day" \| "after", day: n \| null, label: "Tue 3 Nov", sub: "Day 3 of 9 · Apo Island" }]`, or `[]` without both dates |
| `defaultStepIndex(steps, todayIso)` | index of today if present, else of the first `kind: "day"` step |
| ~~`stepIndexForDay(steps, day)`~~ | removed 2026-10-10 with the page-level eye buttons (decisions.md, B-D1 amended): it only served the Route header's eye button |
| `previewUrl({ date, charterId, hash })` | `/?preview=…&charter=…` (URL-encoded) plus `#hash` when it is a plain tab id (`/^[a-z-]+$/`) |
| `fitScale(device, availW, availH)` | `min(1, availW / w, availH / h)` |

`DEVICES = { phone: { w: 390, h: 844 }, tablet: { w: 820, h: 1180 } }`. Tests in `test/guest-preview-core.test.js`.

## 4. Guest: preview mode (G)

### 4.1 `preview-mode.js` (pure, also a Node module; loaded before `guest.js`)

- `parsePreview(search)` → `{ active, date, charterId }`. `date` must match `YYYY-MM-DD` and be a real calendar
  date; `charterId` must pass the same rule as the server's `validateAdminCharterId` (`/^[a-z0-9][a-z0-9-]{0,62}$/`, no `--`). Preview is
  `active` when `date` is valid; an invalid `charter` is dropped (the date alone still previews the active charter).
- `withPreviewParams(url, preview)` → the API URL with `charter=` and `preview=` appended (respecting an existing
  `?`); the URL unchanged when not active.
- `bannerText(preview)` → `"PREVIEW · TUE 3 NOV"` (uppercase weekday, day, short month; English, like the rest of the
  guest).
- Tests in `test/preview-mode.test.js`.

### 4.2 Hooks in `guest.js`

- One module-level `const PREVIEW = IolantheGuestPreview.parsePreview(location.search);` near the API constants.
- **The two clock functions:** `calculateCurrentCharterDayState` uses `options.today`, else the preview date (as a
  local `Date` at 12:00), else `new Date()`. `getCurrentDateKey` returns the preview date when active. Every
  charter-date reader already funnels through these two (current-state §4): pills and default day, menu of the day,
  welcome message, screensaver Today/Tomorrow.
- **API URLs:** the fetches of `CHARTER_API_URL`, `PLANNED_ROUTE_API_URL` and `TRACK_API_URL` go through
  `withPreviewParams`. Weather, NMEA and version stay as they are (B-D5).
- **Off in preview:** service-worker registration (no SW is installed or updated from a preview frame; a SW the
  device already has still controls the frame, which is why the `?v=` busters of §4.3 matter), idle mode
  (`enterIdleMode` returns early, so no screensaver and no `redirectToGuestLanding`), and the install prompt.
- **Banner:** a fixed red strip at the top of the page (`.guest-preview-banner`, ~22 px, white bold uppercase
  text, `z-index` above the guest's header) with `bannerText`. The page gets top padding so nothing is covered.
  The guest's own look is otherwise untouched (spec A2-S4).
- The wall-clock readers (NMEA ages, ETAs, weather rows, throttles, the idle clock) stay on the real clock.

### 4.3 Task 8 (bundled, B-D7)

- `itinerary-days.js`: delete `v1ToGuestDays`; `guest.js`'s `getItineraryDays` returns `[]` for anything that is not
  `version === 2`. Remove its test.
- `index.html`: `/guest.css`, `/itinerary-days.js`, `/preview-mode.js` and `/guest.js` get `?v=guest-b-1`.
  `sw.js`: `STATIC_CACHE_NAME` → `iolanthe-onboard-static-v5`; the precache list gains `/preview-mode.js` and uses
  the same `?v=` URLs as `index.html` (the cache-first lookup matches the full URL).

### 4.4 Errors in the frame

- `/api/charter` 401 (session expired) → the banner turns dark red and reads "PREVIEW · LOG IN TO THE ADMIN AGAIN";
  the guest shows its empty states and never falls back to the active charter's data (amended while planning: the
  banner carries the message, the guest's panels stay untouched).
- 404 (charter deleted) → "PREVIEW · CHARTER NOT FOUND" the same way.
- Other failures keep the guest's existing fallbacks.

## 5. Server (S)

### 5.1 Preview context

A helper `previewContext(request, url)` → `{ charterId, date }`, or `{ error: 401 | 404 | 400 }`:

- No `charter` param → `{ charterId: getActiveCharterId(), date: validDate(url.searchParams.get("preview")) }`
  (the date alone is harmless; it only affects the track cut, §5.3).
- `charter` param present: `getAdminSession(request)` must return a valid session (any department), else 401
  `{ error: "Admin login required for a charter preview" }`. The id must pass `validateAdminCharterId` (else 400) and
  its folder must exist (404 `{ error: "Charter not found" }`). The session's activity timestamp is not refreshed by
  these reads.

### 5.2 Endpoints

| Endpoint | With a preview context |
|---|---|
| `GET /api/charter` | `buildCharterPayload(charterId)` (already takes an id) |
| `GET /api/planned-route` | `readPlannedRoute(charterId)` |
| `GET /api/track` | §5.3 |
| `GET /api/charter/watches` | the previewed charter's `watches.json` (same gating; the guest does not read it today, kept consistent) |

Without the params every endpoint answers exactly as today. Responses stay `no-store`.

### 5.3 Track

- With a `charter` param: read that charter's file read-only through `loadTrack(charterId)`, **never**
  `ensureTrackState` (which would switch the live logging state to the previewed charter). Without one: the live
  `ensureTrackState()` as now.
- With a `preview` date: keep only points whose `timestamp` is on or before the end of that date in the server's local
  time (the same local-date notion as `localTodayDateValue`). A missing track file (retention is 3 days after the
  charter) gives an empty `points` array, no error.

### 5.4 Task 8 (bundled)

`lib/itinerary.js` `plannedRouteFromItinerary` returns only `{ source, routes }`; its test is updated. Checked
2026-10-08: no other repo in the workspace reads `/api/planned-route` (only the guest, which reads the top-level
`routes`).

## 6. Out of scope

- Replaying position, weather or moon for a past or future date.
- Previewing an unassigned route or unsaved edits (B-D3).
- Keeping tracks longer than the 3-day retention.
- A time-of-day slider.
- Spec C (revisions for the other charter files).

## 7. Testing

- **S** `node --test`: preview context (no param; date only; charter without a session → 401; bad id → 400; unknown
  id → 404; valid → id), track cut at the end of the date (local time), the preview read leaves the live
  `trackState` untouched, the Task 8 wrapper removal.
- **G** `node --test`: `preview-mode.js` (parse valid / invalid date and id, URL building with and without `?`,
  banner text); the v1-converter test removed.
- **A** `node --test`: `guest-preview-core.js` (steps for a 9-day charter with before / after and stop names, a
  passage day, no dates → `[]`, default index today / Day 1, URL encoding and the hash filter, `fitScale`).
- **Browser** (Claude pane, scratch server): step csaba from the day before to the day after (pills, default day,
  menu of the day, welcome, banner), device toggles and the scale, the guest tab kept across date changes, the eye
  buttons (Route dirty → the confirm), preview larry (future, no track) and a seeded past charter, a logged-out tab
  at the iframe URL → 401 messages, a plain guest at `/` unchanged (no banner, SW registered, idle works), phone
  width admin.

## 8. Rollout

1. **S** PR → David merges → manual pull + `docker compose up -d --build iolanthe-server` on docker-vm. Check
   `/api/charter` and `/api/planned-route` 200 for the plain guest.
2. **G** + **A** PRs merged together (the 5-minute cron deploys both). Guest `sw.js` cache v5; admin `?v=` bumped.
