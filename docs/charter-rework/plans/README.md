# Charter itinerary rework — implementation plans

Spec: [../spec.md](../spec.md). Decisions: [../decisions.md](../decisions.md). Written 2026-10-07.

Five plans, one per shippable step, in build order. Each stands alone and ends with working, tested software.
Execute them with `superpowers:subagent-driven-development` or `superpowers:executing-plans`, one plan at a time.

| # | Plan | Repo | What lands | Verified while planning |
|---|---|---|---|---|
| 1 | [01-server.md](01-server.md) | `iolanthe-server` | `lib/itinerary.js` (v2 model, validation, apply-route, migration v1→v2, derived planned route), save and apply-route endpoints, migration v4, weather by stop span, upload-route removed | The plan's module and 27 tests were assembled from the plan text and run: 27 pass |
| 2 | [02-admin-core-and-panel.md](02-admin-core-and-panel.md) | `iolanthe-admin` | `itinerary-core.js` (mirrors the server rules + time estimates + line geometry), read-only Itinerary panel (tube line, day rows, sub-boxes, activities, thumbnail), Route Upload retired | Core: 11 tests pass; panel JS parses |
| 3 | [03-admin-editing.md](03-admin-editing.md) | `iolanthe-admin` | Edge drags, stop popover with cascade, activity add/edit/remove/drag, welcome editing, Save with 409, Apply library route, Promote to library | Core: 24 tests pass (cumulative) |
| 4 | [04-admin-route-panel-and-removals.md](04-admin-route-panel-and-removals.md) | `iolanthe-admin` | Route panel charter mode with `reconcileRoutePoints`, library stop `nights`/`depart_time`, Edit route / Open on map links, old itinerary code removed | Core: 30 tests pass (cumulative) |
| 5 | [05-guest.md](05-guest.md) | `iolanthe-guest` | `itinerary-days.js` (first tests in the guest repo), stop-block day card, passage days, pins, plan logic removed, SW bump, one-release shims and their removal | Module: 7 tests pass |

**Deploy order:** server (with a migration rehearsal on a copy of live data) → admin → guest, then plan 5 Task 8 once
all three are confirmed live. Plans 2–4 merge to `main` together or in order; do not deploy the admin before the
server, since the new panel needs the v2 bundle.

**Deviation recorded:** plan 1 Task 4 keeps every stop *reached* before the from-day and closes the current one on
the from-day (spec §3.2 originally said "departure before the from-day"); the spec has been updated to match.

## Spec A2: the Route page is the itinerary (2026-10-08)

Spec: [../spec-a2.md](../spec-a2.md). Two plans, server first; the admin branch merges only after the server is deployed
on the vessel (admin `main` auto-deploys every 5 minutes).

| # | Plan | Repo | What lands | Verified while planning |
|---|---|---|---|---|
| A2-1 | [a2-01-server.md](a2-01-server.md) | `iolanthe-server` | Record shape (`duration_min`, `dirty_stop_ids`, anchorage `kind`), unassigned routes in the record shape, `itinerary/import` replaces apply-route (re-bases, items travel, no length refusal), charter summaries `stops`, migration v5 | New code assembled onto the committed module: all new tests pass (the 3 exact-object tests the plan extends fail until extended) |
| A2-2 | [a2-02-admin.md](a2-02-admin.md) | `iolanthe-admin` (branch `feat/itinerary-a2`) | Core: arrivals, cascade, dropped days, clashes, fit, rebase; Route page: one Working-on select, pills, Legs/Days tabs, stop strip and card (`stop-cards.js`), Start from…, anchorage kinds; Itinerary panel deleted | Core + routes-core assembled from the plan text: 110 tests pass; `stop-cards.js` and `routes-days.js` parse |


## Spec P: the charter pack, phase 1 (2026-10-09)

Spec: [../spec-pack.md](../spec-pack.md). Three plans, server first; the admin branch merges only after the server is
released on the vessel. Plans P-2 and P-3 share the admin worktree and branch `feat/charter-pack`.

| # | Plan | Repo | What lands | Verified while planning |
|---|---|---|---|---|
| P-1 | [p-01-server.md](p-01-server.md) | `iolanthe-server` (branch `feat/charter-pack-server`) | `lib/charter-pack.js` (presets, 409 on a stale revision, cover upload rules and clean-up), `GET/PUT …/pack`, `POST …/pack/cover`, `GET …/pack/cover/<file>` | Plan text applied to `main` f8939ab: 117 tests pass; endpoints exercised on a scratch server |
| P-2 | [p-02-admin-core.md](p-02-admin-core.md) | `iolanthe-admin` (branch `feat/charter-pack`) | `pack-core.js` (preset rules, dates, markers, merge, `buildPackModel`), `pack-render.js` (cover and block HTML), csaba fixture | Plan text applied to `main` e108e7e: 169 tests pass |
| P-3 | [p-03-admin-page.md](p-03-admin-page.md) | `iolanthe-admin` (branch `feat/charter-pack`) | `charter-pack.js` / `.css` (settings, A4 pagination, map, auto-save, cover upload, Save as PDF), menu entry, `apiUrl` export, `?v=admin-charter-pack` | Plan text applied after P-2: 169 tests pass, `node --check` clean; page exercised in the browser on a scratch server; print output checked with headless Chrome `printToPDF` (11 A4 pages, no blank page, map and branding printed) |

The assets in `assets/pack/` (default hero placeholder, David's stamp, the line art) are committed with the spec PR, so
the plans only check them.
