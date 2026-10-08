# Spec B — Plan 1: Server (the preview query on the guest endpoints, Task 8 wrapper removal)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply [spec-b.md](../spec-b.md) §5 to `iolanthe-server`: `/api/charter`, `/api/planned-route`, `/api/track` and `/api/charter/watches` accept `?charter=<id>` (admin session only; 401 / 400 / 404 otherwise) and `/api/track` accepts `?preview=<YYYY-MM-DD>` (points cut at the end of that local day, the previewed charter's file read without touching the live logging state). Plus plan 5 Task 8's server half: the legacy planned-route wrapper goes.

**Architecture:** The rules go into a new pure module `lib/preview.js` (query parsing, the decision, the track cut) with `node --test` coverage. `server.js` gets two helpers (`previewContext`, `readTrackForPreview`) plus one refusal helper, and four endpoint blocks call them. Without the new params every endpoint answers exactly as before.

**Tech Stack:** Node ≥ 18, no dependencies, `node --test` (97 tests → 102). Server repo from `main` at `4aaaff2` or later.

**Dry-run (done while planning):** Task 1's module and tests and Task 3's library/test edits were assembled from this plan's text onto a copy of the committed `lib/` and `test/`: `node --test` 102/102. Task 2's `server.js` blocks are checked with `node --check` and in the browser (plan b-03 Task 9).

**Shared checkout hazard:** another Claude session works in the same checkouts. **Never** run `git checkout`, `git switch`, `git stash` or `git add -A` in `S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server`. All work happens in the worktree made in Task 0. Stage files by name. Before each task, run `git -C <worktree> branch --show-current` and expect `feat/spec-b-server`.

**Reading before you start (in the worktree):** `server.js` around `validateAdminCharterId` (~4036), `hasCharterDirectory` (~3994), `readPlannedRoute` (~4683), `buildCharterPayload` (~4742), `getTrackFilePath` (~4822), `normalizeTrackData` (~4992), `loadTrack` / `ensureTrackState` (~5045 / ~5131), `getAdminSession` (~5705), and the public API dispatcher (~7557–7650). `lib/active-charter.js` (`isValidDate`), `lib/itinerary.js` (`plannedRouteFromItinerary`), `test/itinerary.test.js` (~338–353).

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `lib/preview.js` (new) + `test/preview.test.js` (new) | Task 1: `previewQuery`, `previewDecision`, `endOfLocalDayMs`, `cutTrack` |
| `server.js` | Task 2: require, `previewContext`, `sendPreviewRefusal`, `readTrackForPreview`, the four endpoint blocks |
| `lib/itinerary.js` + `test/itinerary.test.js` | Task 3: `plannedRouteFromItinerary` returns `{ source, routes }` only |
| `CLAUDE.md` | Task 4: one paragraph on the preview params |

---

### Task 0: Worktree (this session runs it, not an implementer)

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server"
git fetch -q origin
git worktree add "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-b/iolanthe/iolanthe-server" -b feat/spec-b-server origin/main
cd "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-b/iolanthe/iolanthe-server" && node --test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected `ℹ pass 97`, `ℹ fail 0`. Every path below is relative to this worktree.

---

### Task 1: `lib/preview.js` and its tests

**Files:** create `lib/preview.js`, create `test/preview.test.js`

- [ ] **Step 1: Write the failing test.** Create `test/preview.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const lib = require("../lib/preview");

const q = (s) => lib.previewQuery(new URLSearchParams(s));

test("previewQuery: absent, present, normalised; only real dates kept", () => {
  assert.deepEqual(q(""), { charterParam: null, date: "" });
  assert.deepEqual(q("charter=%20Csaba%20&preview=2026-11-03"), { charterParam: "csaba", date: "2026-11-03" });
  assert.deepEqual(q("charter="), { charterParam: "", date: "" });
  assert.equal(q("preview=2026-02-30").date, "");
  assert.equal(q("preview=3/11/2026").date, "");
  assert.deepEqual(lib.previewQuery(null), { charterParam: null, date: "" });
});

test("previewDecision: no charter param serves as before (the date alone passes through)", () => {
  assert.deepEqual(lib.previewDecision({ charterParam: null, hasSession: false, validId: "", charterExists: false, date: "2026-11-03" }),
    { status: 200, charterId: null, date: "2026-11-03" });
  assert.deepEqual(lib.previewDecision({ charterParam: null, hasSession: false, validId: "", charterExists: false, date: "bad" }),
    { status: 200, charterId: null, date: "" });
});

test("previewDecision: a charter param needs a session, a valid id and an existing charter", () => {
  const base = { charterParam: "csaba", hasSession: true, validId: "csaba", charterExists: true, date: "2026-11-03" };
  assert.deepEqual(lib.previewDecision(base), { status: 200, charterId: "csaba", date: "2026-11-03" });
  assert.equal(lib.previewDecision({ ...base, hasSession: false }).status, 401);
  assert.equal(lib.previewDecision({ ...base, hasSession: false, validId: "" }).status, 401);   // 401 before revealing anything
  assert.equal(lib.previewDecision({ ...base, validId: "" }).status, 400);
  assert.equal(lib.previewDecision({ ...base, charterExists: false }).status, 404);
  assert.match(lib.previewDecision({ ...base, hasSession: false }).error, /Admin login required/);
});

test("endOfLocalDayMs: the next local midnight", () => {
  assert.equal(lib.endOfLocalDayMs("2026-11-03"), new Date(2026, 10, 4).getTime());
  assert.equal(lib.endOfLocalDayMs("2026-12-31"), new Date(2027, 0, 1).getTime());
  assert.ok(Number.isNaN(lib.endOfLocalDayMs("")));
});

test("cutTrack: keeps points before the end of the date, copies, never mutates", () => {
  const at = (y, m, d, h) => new Date(y, m - 1, d, h).toISOString();
  const track = { charter: "csaba", points: [
    { timestamp: at(2026, 11, 3, 8) }, { timestamp: at(2026, 11, 3, 23) }, { timestamp: at(2026, 11, 4, 0) }, { timestamp: "nope" }
  ] };
  const cut = lib.cutTrack(track, "2026-11-03");
  assert.deepEqual(cut.points.map(p => p.timestamp), [at(2026, 11, 3, 8), at(2026, 11, 3, 23)]);
  assert.equal(cut.charter, "csaba");
  assert.equal(track.points.length, 4);
  assert.notEqual(cut, track);
  assert.equal(lib.cutTrack(track, ""), track);
  assert.deepEqual(lib.cutTrack({ charter: "x" }, "2026-11-03").points, []);
});
```

- [ ] **Step 2: Run it and see it fail.** `node --test test/preview.test.js` → fails with `Cannot find module '../lib/preview'`.

- [ ] **Step 3: Create `lib/preview.js`:**

```js
"use strict";

// Spec B: the guest preview. The guest endpoints take ?charter=<id> (admin session only) and ?preview=<YYYY-MM-DD>.
// Pure: no fs, no sessions; the server passes in what it looked up. The only clock-like call is endOfLocalDayMs, which
// uses the process's local timezone on purpose (the same notion of "today" as localTodayDateValue in server.js).

const { isValidDate } = require("./active-charter");

// The raw query: charterParam is null when the param is absent ("" when present but empty); date is "" unless valid.
function previewQuery(searchParams) {
  const raw = searchParams && typeof searchParams.get === "function" ? searchParams.get("charter") : null;
  const preview = searchParams && typeof searchParams.get === "function" ? searchParams.get("preview") : null;
  return {
    charterParam: raw === null ? null : String(raw).trim().toLowerCase(),
    date: isValidDate(preview) ? preview : ""
  };
}

// What a guest endpoint should serve. charterId is null when the caller sent no charter (serve exactly as before).
// hasSession: a valid admin session; validId: validateAdminCharterId(charterParam); charterExists: its folder exists.
function previewDecision({ charterParam, hasSession, validId, charterExists, date }) {
  const day = isValidDate(date) ? date : "";
  if (charterParam === null) {
    return { status: 200, charterId: null, date: day };
  }
  if (!hasSession) {
    return { status: 401, error: "Admin login required for a charter preview" };
  }
  if (!validId) {
    return { status: 400, error: "Invalid charter id" };
  }
  if (!charterExists) {
    return { status: 404, error: "Charter not found" };
  }
  return { status: 200, charterId: validId, date: day };
}

// Milliseconds at the end of that local date (the next local midnight), or NaN for an invalid date.
function endOfLocalDayMs(date) {
  if (!isValidDate(date)) {
    return NaN;
  }
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d + 1).getTime();
}

// A copy of the track keeping the points recorded before the end of `date`. No date: the track unchanged (same object).
function cutTrack(track, date) {
  const limit = endOfLocalDayMs(date);
  if (!Number.isFinite(limit) || !track || typeof track !== "object") {
    return track;
  }
  const points = Array.isArray(track.points) ? track.points : [];
  return {
    ...track,
    points: points.filter(point => {
      const at = Date.parse(point && point.timestamp);
      return Number.isFinite(at) && at < limit;
    })
  };
}

module.exports = { previewQuery, previewDecision, endOfLocalDayMs, cutTrack };
```

- [ ] **Step 4: Run the tests.** `node --test 2>&1 | grep -E "^ℹ (pass|fail)"` → `ℹ pass 102`, `ℹ fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add lib/preview.js test/preview.test.js
git commit -m "feat(preview): lib/preview.js - the guest preview query, decision and track cut

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `server.js` wiring

**Files:** `server.js`. Every step is a verbatim replacement: find the OLD block (it occurs exactly once) and replace it with the NEW block.

- [ ] **Step 1: Require the module.** OLD:

```js
const activeCharterLib = require("./lib/active-charter");
```

NEW:

```js
const activeCharterLib = require("./lib/active-charter");
const previewLib = require("./lib/preview");
```

- [ ] **Step 2: The helpers, after `readPlannedRoute`.** OLD:

```js
function readPlannedRoute(charterId = getActiveCharterId()) {
  const activeCharter = resolveActiveCharterId(charterId);
  const charter = toPlainObject(readCharterJson(activeCharter, "charter.json", {}));
  const itinerary = readCharterJson(activeCharter, "itinerary.json", {});
  return itineraryLib.plannedRouteFromItinerary(itinerary, typeof charter.name === "string" ? charter.name : "");
}
```

NEW:

```js
function readPlannedRoute(charterId = getActiveCharterId()) {
  const activeCharter = resolveActiveCharterId(charterId);
  const charter = toPlainObject(readCharterJson(activeCharter, "charter.json", {}));
  const itinerary = readCharterJson(activeCharter, "itinerary.json", {});
  return itineraryLib.plannedRouteFromItinerary(itinerary, typeof charter.name === "string" ? charter.name : "");
}

// Spec B: the guest preview. Resolves ?charter= / ?preview= on a guest endpoint (rules in lib/preview.js).
// The session is only read: a preview never extends the admin's idle timeout.
function previewContext(request, url) {
  const query = previewLib.previewQuery(url.searchParams);
  const validId = query.charterParam === null ? "" : validateAdminCharterId(query.charterParam);
  return previewLib.previewDecision({
    charterParam: query.charterParam,
    hasSession: query.charterParam !== null && Boolean(getAdminSession(request)),
    validId,
    charterExists: Boolean(validId) && hasCharterDirectory(validId),
    date: query.date
  });
}

// Answers a refused preview (401 / 400 / 404); true when the request is done.
function sendPreviewRefusal(response, preview) {
  if (preview.status === 200) {
    return false;
  }
  sendJson(response, preview.status, { error: preview.error });
  return true;
}

// The previewed charter's track, read-only: ensureTrackState would switch the live logging state to this charter and
// loadTrack would create or upgrade the file. The active charter keeps its live track (with unflushed points).
function readTrackForPreview(charterId) {
  if (charterId === getActiveCharterId()) {
    return ensureTrackState();
  }
  const trackPath = getTrackFilePath(charterId);
  let rawTrack = null;
  try {
    if (fs.existsSync(trackPath)) {
      rawTrack = JSON.parse(fs.readFileSync(trackPath, "utf8").replace(/^\uFEFF/, ""));
    }
  } catch (error) {
    console.error(`Unable to read ${formatPathForLog(trackPath)}: ${error.message}`);
  }
  return normalizeTrackData(rawTrack, charterId);
}
```

- [ ] **Step 3: `/api/charter/watches`.** OLD:

```js
  if (pathname === "/api/charter/watches") {
    const activeCharter = getActiveCharterId();
```

NEW:

```js
  if (pathname === "/api/charter/watches") {
    const preview = previewContext(request, url);
    if (sendPreviewRefusal(response, preview)) {
      return;
    }
    const activeCharter = preview.charterId || getActiveCharterId();
```

- [ ] **Step 4: `/api/charter`.** OLD:

```js
  if (pathname.startsWith("/api/charter")) {
    try {
      sendJson(response, 200, buildCharterPayload());
```

NEW:

```js
  if (pathname.startsWith("/api/charter")) {
    const preview = previewContext(request, url);
    if (sendPreviewRefusal(response, preview)) {
      return;
    }
    try {
      sendJson(response, 200, preview.charterId ? buildCharterPayload(preview.charterId) : buildCharterPayload());
```

- [ ] **Step 5: `/api/track` and `/api/planned-route`.** OLD:

```js
  if (pathname.startsWith("/api/track")) {
    sendJson(response, 200, ensureTrackState());
    return;
  }

  if (pathname.startsWith("/api/planned-route")) {
    sendJson(response, 200, readPlannedRoute());
    return;
  }
```

NEW:

```js
  if (pathname.startsWith("/api/track")) {
    const preview = previewContext(request, url);
    if (sendPreviewRefusal(response, preview)) {
      return;
    }
    const track = preview.charterId ? readTrackForPreview(preview.charterId) : ensureTrackState();
    sendJson(response, 200, previewLib.cutTrack(track, preview.date));
    return;
  }

  if (pathname.startsWith("/api/planned-route")) {
    const preview = previewContext(request, url);
    if (sendPreviewRefusal(response, preview)) {
      return;
    }
    sendJson(response, 200, preview.charterId ? readPlannedRoute(preview.charterId) : readPlannedRoute());
    return;
  }
```

- [ ] **Step 6: Check.** `node --check server.js` (no output) and `node --test 2>&1 | grep -E "^ℹ (pass|fail)"` → `ℹ pass 102`. Confirm the dispatcher's `url` variable is in scope at these blocks: `grep -n "const url = new URL(request.url, \`http://\${request.headers.host}\`);" server.js` shows the line (~7557) of the function that holds them.

- [ ] **Step 7: Commit.**

```bash
git add server.js
git commit -m "feat(preview): ?charter= (admin session) and ?preview= on the guest charter, planned-route, track and watches endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Plan 5 Task 8, server half — drop the legacy planned-route wrapper

**Files:** `lib/itinerary.js`, `test/itinerary.test.js`. Verbatim replacements.

- [ ] **Step 1: `lib/itinerary.js`.** OLD:

```js
// The `route`, `requested_plan`, `active_plan` and `fallback_plan` keys are the pre-rework wrapper. They are kept for
// ONE release so a guest app cached before the rework still draws the line. Remove them in plan 5's cleanup task.
function plannedRouteFromItinerary(itinerary, name) {
  const it = normalizeItinerary(itinerary);
  const coordinates = it.route.points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  const routes = coordinates.length >= 2 ? [{ name: toStr(name) || "Planned route", description: "", coordinates }] : [];
  const plan = { source: it.route.source, routes };
  return { ...plan, route: { primary: plan, alternative: { source: null, routes: [] } }, requested_plan: "primary", active_plan: "primary", fallback_plan: "" };
}
```

NEW:

```js
// The public planned route: one polyline through every point of the itinerary's route.
function plannedRouteFromItinerary(itinerary, name) {
  const it = normalizeItinerary(itinerary);
  const coordinates = it.route.points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  const routes = coordinates.length >= 2 ? [{ name: toStr(name) || "Planned route", description: "", coordinates }] : [];
  return { source: it.route.source, routes };
}
```

- [ ] **Step 2: `test/itinerary.test.js`, first test.** OLD:

```js
test("plannedRouteFromItinerary: coordinates from the points, with the legacy primary wrapper", () => {
```

NEW:

```js
test("plannedRouteFromItinerary: coordinates from the points, no legacy wrapper", () => {
```

- [ ] **Step 3: same file.** OLD:

```js
  assert.equal(out.route.primary.routes, out.routes);
  assert.deepEqual(out.route.alternative, { source: null, routes: [] });
  assert.equal(out.active_plan, "primary");
});
```

NEW:

```js
  assert.deepEqual(Object.keys(out).sort(), ["routes", "source"]);
});
```

- [ ] **Step 4: same file, second test.** OLD:

```js
  assert.deepEqual(out.routes, []);
  assert.deepEqual(out.route.primary.routes, []);
});
```

NEW:

```js
  assert.deepEqual(out.routes, []);
});
```

- [ ] **Step 5: Run.** `node --test 2>&1 | grep -E "^ℹ (pass|fail)"` → `ℹ pass 102`, `ℹ fail 0`. Then `grep -n "route.primary\|active_plan\|requested_plan\|fallback_plan" server.js lib/*.js` shows only `lib/itinerary.js`'s v1 migration line (`active_plan_by_day`).

- [ ] **Step 6: Commit.**

```bash
git add lib/itinerary.js test/itinerary.test.js
git commit -m "chore(itinerary): drop the legacy planned-route wrapper (plan 5 Task 8)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `CLAUDE.md`

**Files:** `CLAUDE.md` (haiku-sized task).

- [ ] **Step 1:** In the section that lists the public guest endpoints (search for `/api/planned-route`), add this paragraph after that list; if there is no such list, append it under a new heading `## Guest preview (spec B)` at the end of the file:

```markdown
**Guest preview (spec B).** `/api/charter`, `/api/planned-route`, `/api/track` and `/api/charter/watches` take
`?charter=<id>` only with a valid admin session cookie (401 without one, 400 for a bad id, 404 for an unknown charter;
never a silent fallback). `/api/track?preview=YYYY-MM-DD` keeps the points before the end of that local day. A
previewed charter's track is read without touching the live logging state (`readTrackForPreview`, not
`ensureTrackState`). Rules: `lib/preview.js`. `/api/planned-route` returns `{ source, routes }` only (the pre-rework
wrapper is gone).
```

- [ ] **Step 2: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs: the guest preview params

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Endpoint check (this session, after Task 4)

Run the worktree's server on port 8010 against a copy of the scratch data (config `iolanthe-server-specb`, added in plan b-03 Task 0) and check in the browser pane's console:

| Request | Expected |
|---|---|
| `fetch("/api/charter")` logged out | 200, the active charter (as before) |
| `fetch("/api/charter?charter=larry")` logged out | 401 `{ error: "Admin login required for a charter preview" }` |
| same, logged in to the admin | 200, `charter.name` of larry |
| `?charter=Bad--id` logged in | 400 |
| `?charter=nobody` logged in | 404 |
| `/api/planned-route?charter=larry` logged in | 200, keys `routes`, `source` only |
| `/api/track?charter=hoffmann&preview=2025-11-03` logged in | 200, every point before 4 Nov local; no `track.json` created or rewritten for hoffmann (check its mtime before/after) |
| `/api/track` logged out, twice | 200, the live track; `/api/track/status` still reports the active charter |

---

## Self-review against spec B §5

| Spec | Task |
|---|---|
| §5.1 preview context, 401 / 400 / 404, session read-only | 1 (`previewDecision`), 2 (`previewContext`) |
| §5.2 four endpoints, unchanged without params | 2 steps 3–5 |
| §5.3 read-only track, cut at local end of day, missing file → empty | 1 (`cutTrack`), 2 (`readTrackForPreview`; `normalizeTrackData(null, id)` gives `points: []`) |
| §5.4 Task 8 wrapper | 3 |
| §7 server tests | 1, 3 |
