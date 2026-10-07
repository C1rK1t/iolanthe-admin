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
