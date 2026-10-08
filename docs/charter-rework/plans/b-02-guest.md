# Spec B — Plan 2: Guest (preview mode, Task 8 converter removal, cache-busters)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply [spec-b.md](../spec-b.md) §4 to `iolanthe-guest`: a preview mode read from `?preview=YYYY-MM-DD&charter=<id>` that moves the guest's "today", sends the params to the charter / planned-route / track endpoints, shows a red banner, and switches off the service-worker registration, the install prompt and idle mode. Plus plan 5 Task 8's guest half (the v1 itinerary converter goes) and `?v=` cache-busters on the local CSS/JS.

**Architecture:** The parsing, URL building and banner text go into a new pure module `preview-mode.js` (UMD like `itinerary-days.js`, `node --test` coverage), loaded before `guest.js`. `guest.js` gets one `PREVIEW` constant and small edits at the API constants, the two clock functions, `loadJSON`, the charter-bundle error paths, idle mode and the boot lines. Without `?preview=` the guest behaves exactly as today, and its look is untouched (spec A2-S4).

**Tech Stack:** Plain JS, no build, `node --test` (7 tests → 11). Guest repo from `main` at `a83e066` or later.

**Dry-run (done while planning):** every block below was applied from this plan's text onto a copy of the committed repo: `node --test` 11/11, `node --check` clean on `guest.js`, `preview-mode.js`, `itinerary-days.js` and `sw.js`.

**Shared checkout hazard:** another Claude session works in the same checkouts. **Never** run `git checkout`, `git switch`, `git stash` or `git add -A` in `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-guest`. All work happens in the worktree made in Task 0. Stage files by name. Before each task run `git -C <worktree> branch --show-current` and expect `feat/spec-b-guest`.

**Reading before you start (in the worktree):** `itinerary-days.js` (the UMD wrapper, `v1ToGuestDays`, the export line), `test/itinerary-days.test.js`, `guest.js` lines 40–70 (constants), 354–390 (`redirectToGuestLanding`, `loadJSON`, `loadCharterBundle`), 544–552 (`registerGuestServiceWorker`), 743–760 (`calculateCurrentCharterDayState`), 876–878 (`getCurrentDateKey`), 2676–2690 (`getItineraryDays`), 5303–5310 (`enterIdleMode`), 7944–7975 (`refreshSavedCharterBundle`), 8040–8060 (boot), `guest.css` lines 1–40, `index.html`, `sw.js`.

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `preview-mode.js` (new) + `test/preview-mode.test.js` (new) | Task 1: `parsePreview`, `withPreviewParams`, `bannerText`, `validCharterId` |
| `guest.js`, `guest.css` | Task 2: `PREVIEW`, API URLs, clocks, `loadJSON` status, preview problems, banner, idle / SW / install prompt off |
| `itinerary-days.js`, `test/itinerary-days.test.js`, `guest.js` | Task 3: Task 8 — the v1 converter goes |
| `index.html`, `sw.js` | Task 4: `preview-mode.js` script tag, `?v=guest-b-1`, cache v5, preview navigations network-only |
| `CLAUDE.md`, `README-dev.md` | Task 5: docs |

---

### Task 0: Worktree (this session runs it, not an implementer)

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-guest"
git fetch -q origin
git worktree add "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-b/portal/iolanthe-guest" -b feat/spec-b-guest origin/main
cd "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-b/portal/iolanthe-guest" && node --test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected `ℹ pass 7`, `ℹ fail 0`. Every path below is relative to this worktree.

---

### Task 1: `preview-mode.js` and its tests

**Files:** create `preview-mode.js`, create `test/preview-mode.test.js`

- [ ] **Step 1: Write the failing test.** Create `test/preview-mode.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pm = require("../preview-mode.js");

test("parsePreview: a real date turns preview on; the charter id is validated", () => {
  assert.deepEqual(pm.parsePreview("?preview=2026-11-03&charter=csaba"), { active: true, date: "2026-11-03", charterId: "csaba" });
  assert.deepEqual(pm.parsePreview("?preview=2026-11-03"), { active: true, date: "2026-11-03", charterId: "" });
  assert.deepEqual(pm.parsePreview("?preview=2026-11-03&charter=Bad--id"), { active: true, date: "2026-11-03", charterId: "" });
  assert.deepEqual(pm.parsePreview("?charter=csaba"), { active: false, date: "", charterId: "" });
  assert.deepEqual(pm.parsePreview("?preview=2026-02-30"), { active: false, date: "", charterId: "" });
  assert.deepEqual(pm.parsePreview(""), { active: false, date: "", charterId: "" });
  assert.deepEqual(pm.parsePreview(undefined), { active: false, date: "", charterId: "" });
});

test("validCharterId: the server's validateAdminCharterId rule", () => {
  assert.equal(pm.validCharterId(" Csaba "), "csaba");
  assert.equal(pm.validCharterId("e2e-csaba-copy"), "e2e-csaba-copy");
  assert.equal(pm.validCharterId("a--b"), "");
  assert.equal(pm.validCharterId("-abc"), "");
  assert.equal(pm.validCharterId("a".repeat(64)), "");
  assert.equal(pm.validCharterId(null), "");
});

test("withPreviewParams: appends charter and preview, respecting an existing query", () => {
  const p = { active: true, date: "2026-11-03", charterId: "csaba" };
  assert.equal(pm.withPreviewParams("/api/charter", p), "/api/charter?charter=csaba&preview=2026-11-03");
  assert.equal(pm.withPreviewParams("/api/track?x=1", p), "/api/track?x=1&charter=csaba&preview=2026-11-03");
  assert.equal(pm.withPreviewParams("/api/track", { ...p, charterId: "" }), "/api/track?preview=2026-11-03");
  assert.equal(pm.withPreviewParams("/api/charter", { active: false, date: "", charterId: "" }), "/api/charter");
  assert.equal(pm.withPreviewParams("/api/charter", null), "/api/charter");
});

test("bannerText: the date, or the problem", () => {
  const p = { active: true, date: "2026-11-03", charterId: "csaba" };
  assert.equal(pm.bannerText(p), "PREVIEW · TUE 3 NOV");
  assert.equal(pm.bannerText({ ...p, date: "2026-12-31" }), "PREVIEW · THU 31 DEC");
  assert.equal(pm.bannerText(p, 401), "PREVIEW · LOG IN TO THE ADMIN AGAIN");
  assert.equal(pm.bannerText(p, 404), "PREVIEW · CHARTER NOT FOUND");
  assert.equal(pm.bannerText(p, 500), "PREVIEW · TUE 3 NOV");
  assert.equal(pm.bannerText({ active: false, date: "", charterId: "" }), "");
});
```

- [ ] **Step 2: Run it and see it fail.** `node --test test/preview-mode.test.js` → fails with `Cannot find module '../preview-mode.js'`.

- [ ] **Step 3: Create `preview-mode.js`:**

```js
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  } else {
    root.IolantheGuestPreview = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Charter rework spec B §4.1: the guest preview mode, read from ?preview=YYYY-MM-DD&charter=<id>. The admin's
  // Guest view tab loads the guest in an iframe with these params. Pure: no DOM, no fetch.

  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const PROBLEMS = { 401: "LOG IN TO THE ADMIN AGAIN", 404: "CHARTER NOT FOUND" };

  function isRealDate(value) {
    const m = DATE_RE.exec(String(value || ""));
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  }

  // The server's validateAdminCharterId rule.
  function validCharterId(value) {
    const t = typeof value === "string" ? value.trim().toLowerCase() : "";
    return /^[a-z0-9][a-z0-9-]{0,62}$/.test(t) && !t.includes("--") ? t : "";
  }

  // { active, date, charterId }: active only with a real date; a bad charter id is dropped (the active charter shows).
  function parsePreview(search) {
    const params = new URLSearchParams(typeof search === "string" ? search : "");
    const date = params.get("preview");
    if (!isRealDate(date)) return { active: false, date: "", charterId: "" };
    return { active: true, date, charterId: validCharterId(params.get("charter")) };
  }

  function withPreviewParams(url, preview) {
    if (!preview || !preview.active) return url;
    const extra = `${preview.charterId ? `charter=${encodeURIComponent(preview.charterId)}&` : ""}preview=${preview.date}`;
    return `${url}${url.includes("?") ? "&" : "?"}${extra}`;
  }

  // "PREVIEW · TUE 3 NOV", or the problem for a refused preview (401 / 404); "" when not previewing.
  function bannerText(preview, status) {
    if (!preview || !preview.active) return "";
    if (PROBLEMS[status]) return `PREVIEW · ${PROBLEMS[status]}`;
    const [y, m, d] = preview.date.split("-").map(Number);
    return `PREVIEW · ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
  }

  return { parsePreview, withPreviewParams, bannerText, validCharterId };
});
```

- [ ] **Step 4: Run the tests.** `node --test 2>&1 | grep -E "^ℹ (pass|fail)"` → `ℹ pass 11`, `ℹ fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add preview-mode.js test/preview-mode.test.js
git commit -m "feat(preview): preview-mode.js - parse ?preview=/&charter=, API URLs, banner text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `guest.js` and `guest.css` hooks

**Files:** `guest.js`, `guest.css`. Every step is a verbatim replacement: find the OLD block (it occurs exactly once) and replace it with the NEW block.

- [ ] **Step 1: `PREVIEW` and the API URLs.** OLD:

```js
    const CHARTER_API_URL = "/api/charter";
    const CHARTER_REFRESH_INTERVAL_MS = 30 * 1000;
    const LOCAL_DAY_MS = 24 * 60 * 60 * 1000;
    const NMEA_API_URL = "/api/nmea";
    const TRACK_API_URL = "/api/track";
    const PLANNED_ROUTE_API_URL = "/api/planned-route";
```

NEW:

```js
    // Charter rework spec B: the admin's Guest view loads this page with ?preview=YYYY-MM-DD&charter=<id>. The preview
    // date replaces the browser clock for every charter-date decision; weather and NMEA stay live.
    const PREVIEW_MODULE = window.IolantheGuestPreview || null;
    const PREVIEW = PREVIEW_MODULE ? PREVIEW_MODULE.parsePreview(location.search) : { active: false, date: "", charterId: "" };
    const previewApiUrl = url => (PREVIEW_MODULE ? PREVIEW_MODULE.withPreviewParams(url, PREVIEW) : url);
    let previewProblemStatus = 0;
    const CHARTER_API_URL = previewApiUrl("/api/charter");
    const CHARTER_REFRESH_INTERVAL_MS = 30 * 1000;
    const LOCAL_DAY_MS = 24 * 60 * 60 * 1000;
    const NMEA_API_URL = "/api/nmea";
    const TRACK_API_URL = previewApiUrl("/api/track");
    const PLANNED_ROUTE_API_URL = previewApiUrl("/api/planned-route");
```

- [ ] **Step 2: No redirect away from a preview, `loadJSON` keeps the status, the charter bundle notes a refused preview.** OLD:

```js
    function redirectToGuestLanding() {
      window.location.href = "/";
    }

    async function loadJSON(path) {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
```

NEW:

```js
    function redirectToGuestLanding() {
      if (PREVIEW.active) {
        return;
      }
      window.location.href = "/";
    }

    // Spec B §4.4: a refused preview (401 session expired, 404 charter deleted) shows in the banner; the guest never
    // falls back to the active charter's data inside a preview.
    function notePreviewProblem(error) {
      const status = error && Number(error.status);
      if (!PREVIEW.active || (status !== 401 && status !== 404)) {
        return;
      }
      previewProblemStatus = status;
      syncPreviewBanner();
    }

    function syncPreviewBanner() {
      if (!PREVIEW.active || !PREVIEW_MODULE) {
        return;
      }
      document.documentElement.classList.add("guest-preview");
      let banner = document.getElementById("guestPreviewBanner");
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "guestPreviewBanner";
        banner.className = "guest-preview-banner";
        banner.setAttribute("role", "status");
        document.body.prepend(banner);
      }
      banner.textContent = PREVIEW_MODULE.bannerText(PREVIEW, previewProblemStatus);
      banner.classList.toggle("guest-preview-banner--problem", previewProblemStatus !== 0);
    }

    async function loadJSON(path) {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) {
        const error = new Error(`Failed to load ${path}: ${res.status}`);
        error.status = res.status;
        throw error;
      }
```

- [ ] **Step 3: `loadCharterBundle`.** OLD:

```js
    async function loadCharterBundle() {
      try {
        return await loadJSON(CHARTER_API_URL);
      } catch (error) {
        console.error(error);
```

NEW:

```js
    async function loadCharterBundle() {
      try {
        return await loadJSON(CHARTER_API_URL);
      } catch (error) {
        console.error(error);
        notePreviewProblem(error);
```

- [ ] **Step 4: No service worker or install prompt from a preview.** OLD:

```js
    function registerGuestServiceWorker() {
      if (!("serviceWorker" in navigator)) {
        return;
      }
```

NEW:

```js
    function registerGuestServiceWorker() {
      if (!("serviceWorker" in navigator) || PREVIEW.active) {
        return;
      }
```

- [ ] **Step 5: The first clock.** OLD:

```js
      const today = normalizeLocalDate(options.today === undefined ? new Date() : options.today);
```

NEW:

```js
      const today = normalizeLocalDate(options.today !== undefined ? options.today : (PREVIEW.active ? PREVIEW.date : new Date()));
```

- [ ] **Step 6: The second clock.** OLD:

```js
    function getCurrentDateKey() {
      return localDateKeyFromDate(normalizeLocalDate(new Date()));
    }
```

NEW:

```js
    function getCurrentDateKey() {
      return localDateKeyFromDate(normalizeLocalDate(PREVIEW.active ? PREVIEW.date : new Date()));
    }
```

- [ ] **Step 7: No idle mode in a preview.** OLD:

```js
    function enterIdleMode() {
      if (!isTabletOrLarger()) {
```

NEW:

```js
    function enterIdleMode() {
      if (PREVIEW.active) {
        return;
      }
      if (!isTabletOrLarger()) {
```

- [ ] **Step 8: A refused preview during the 30 s refresh.** OLD:

```js
      })().catch(error => {
        if (!options.silent) {
          console.error(error);
        }
        return null;
      }).finally(() => {
        charterRefreshPromise = null;
      });
```

NEW:

```js
      })().catch(error => {
        if (!options.silent) {
          console.error(error);
        }
        notePreviewProblem(error);
        return null;
      }).finally(() => {
        charterRefreshPromise = null;
      });
```

- [ ] **Step 9: Boot.** OLD:

```js
    initializeInstallPrompt();
    registerGuestServiceWorker();
```

NEW:

```js
    if (PREVIEW.active) {
      syncPreviewBanner();
    } else {
      initializeInstallPrompt();
    }
    registerGuestServiceWorker();
```

- [ ] **Step 10: `guest.css`, the banner.** OLD:

```css
    header {
      position: sticky;
      top: 0;
      z-index: 20;
```

NEW:

```css
    /* Spec B: the preview banner (admin Guest view). Sticky above the sticky header, which moves down by its height. */
    .guest-preview-banner {
      position: sticky;
      top: 0;
      z-index: 21;
      height: 22px;
      line-height: 22px;
      background: #a93d35;
      color: #fff;
      font: 700 12px/22px system-ui, -apple-system, "Segoe UI", sans-serif;
      letter-spacing: .08em;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
    }
    .guest-preview-banner--problem { background: #6d1f1a; }
    html.guest-preview header { top: 22px; }

    header {
      position: sticky;
      top: 0;
      z-index: 20;
```

- [ ] **Step 11: Check.** `node --check guest.js` (no output). `grep -n "PREVIEW.active" guest.js | wc -l` → `8`.

- [ ] **Step 12: Commit.**

```bash
git add guest.js guest.css
git commit -m "feat(preview): guest preview mode - preview date as today, preview params on the charter/route/track APIs, banner, no SW/idle/install prompt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Plan 5 Task 8, guest half — the v1 converter goes

**Files:** `itinerary-days.js`, `test/itinerary-days.test.js`, `guest.js`. Verbatim replacements.

- [ ] **Step 1: `itinerary-days.js`, delete the converter.** OLD:

```js
  // Pre-rework itinerary.json (plans/days) read directly, for ONE release after the server change. Alternatives are
  // ignored. Remove when the server release is confirmed live (plan 5 Task 8).
  function v1ToGuestDays(v1Input, dayCount, siteLibrary) {
    const v1 = toObj(v1Input);
    const sites = siteIndex(siteLibrary);
    const startMs = parseDateOnly(v1.start_date);
    const planDays = toObj(toObj(v1.plans).primary).days;
    const raw = Array.isArray(planDays) && planDays.length ? planDays : (Array.isArray(v1.days) ? v1.days : []);
    const byNumber = new Map();
    raw.forEach((d, i) => {
      const day = toObj(d);
      const n = [day.charter_day, day.order, day.day].map(Number).find((x) => Number.isInteger(x) && x > 0) || i + 1;
      byNumber.set(n, day);
    });
    const out = [];
    const count = dayCount || Math.max(0, ...byNumber.keys());
    for (let n = 1; n <= count; n += 1) {
      const day = byNumber.get(n);
      const stops = [];
      if (day) {
        const site = text(day.site_id) ? sites.get(text(day.site_id)) || null : null;
        const activities = [];
        if (text(day.notes)) {
          const lines = text(day.notes).split("\n");
          activities.push({ id: `${day.id || n}-notes`, title: lines[0].trim(), notes: lines.slice(1).join("\n").trim(), time: "", siteId: "", site: null, images: [] });
        }
        (Array.isArray(day.stops) ? day.stops : []).forEach((s, k) => {
          const st = toObj(s);
          const stopSite = text(st.site_id) ? sites.get(text(st.site_id)) || null : null;
          activities.push({ id: `${day.id || n}-stop-${k + 1}`, title: (stopSite && text(stopSite.title)) || text(st.title_override) || text(st.site_id) || `Stop ${k + 1}`, notes: text(st.notes || st.note), time: "", siteId: text(st.site_id), site: stopSite, images: siteImages(stopSite) });
        });
        if (site || activities.length) {
          stops.push({ id: day.id || `day-${n}`, name: text(day.title_override) || (site && text(site.title)) || `Day ${n}`, arriveTime: "", departTime: "", nights: 0, latitude: site ? site.latitude : undefined, longitude: site ? site.longitude : undefined, activities });
        }
      }
      out.push({ id: `day-${n}`, day: `Day ${n}`, dayNumber: n, date: startMs === null ? "" : dateKey(startMs, n), area: stops.map((s) => s.name).join(" · "), summary: "", passage: "", stops });
    }
    return out;
  }

  return { charterDayCount, deriveGuestDays, v1ToGuestDays, stopEntries, isStop, parseDateOnly };
```

NEW:

```js
  return { charterDayCount, deriveGuestDays, stopEntries, isStop, parseDateOnly };
```

- [ ] **Step 2: `test/itinerary-days.test.js`, delete its test.** OLD:

```js
test("v1ToGuestDays: Primary days become one stop block each with the day's stops as activities and notes as a free activity", () => {
  const v1 = { start_date: "2026-03-01", end_date: "2026-03-03", summary: "Old", plans: { primary: { welcome_message: "Hi", days: [
    { id: "day-001", day: 1, site_id: "capones-lh", title_override: "Capones", notes: "Board 0900\nBrief", stops: [{ site_id: "potipot-beach", notes: "Swim" }] },
    { id: "day-002", day: 2, notes: "", stops: [] },
    { id: "day-003", day: 3, site_id: "potipot-beach", notes: "", stops: [] }
  ] }, alternative: { days: [{ id: "alt-day-001", day: 1, site_id: "potipot-beach" }] } } };
  const out = days.v1ToGuestDays(v1, 3, sites);
  assert.equal(out.length, 3);
  assert.equal(out[0].stops[0].name, "Capones");
  assert.deepEqual(out[0].stops[0].activities.map((a) => [a.title, a.notes, a.siteId]), [["Board 0900", "Brief", ""], ["Potipot beach", "Swim", "potipot-beach"]]);
  assert.deepEqual(out[1].stops, []);
  assert.equal(out[1].passage, "");
  assert.equal(out[2].stops[0].name, "Potipot beach");
  assert.equal(out[2].date, "2026-03-03");
});
```

NEW:

```js
test("the v1 converter is gone (plan 5 Task 8)", () => {
  assert.equal(days.v1ToGuestDays, undefined);
});
```

- [ ] **Step 3: `guest.js`, `getItineraryDays`.** OLD:

```js
    // Charter rework spec A §6: days are derived from the v2 itinerary. A v1 payload (no `version`) goes through the
    // converter for one release.
    function getItineraryDays(source = itineraryData) {
      const data = source && typeof source === "object" ? source : {};
      const mod = window.IolantheItineraryDays;
      if (!mod) {
        return [];
      }
      const dayCount = mod.charterDayCount(data);
      if (data.version === 2) {
        return mod.deriveGuestDays(data, dayCount, charterSitesData);
      }
      return mod.v1ToGuestDays(data, dayCount, charterSitesData);
    }
```

NEW:

```js
    // Charter rework spec A §6: days are derived from the v2 itinerary; anything else shows no days.
    function getItineraryDays(source = itineraryData) {
      const data = source && typeof source === "object" ? source : {};
      const mod = window.IolantheItineraryDays;
      if (!mod || data.version !== 2) {
        return [];
      }
      return mod.deriveGuestDays(data, mod.charterDayCount(data), charterSitesData);
    }
```

- [ ] **Step 4: Run.** `node --test 2>&1 | grep -E "^ℹ (pass|fail)"` → `ℹ pass 11`. `node --check guest.js && node --check itinerary-days.js`. `grep -rn "v1ToGuestDays" --include=*.js .` shows only the new test line.

- [ ] **Step 5: Commit.**

```bash
git add itinerary-days.js test/itinerary-days.test.js guest.js
git commit -m "chore(guest): remove the v1 itinerary converter (plan 5 Task 8)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `index.html` and `sw.js` — the new script, cache-busters, cache v5

**Files:** `index.html`, `sw.js`. Verbatim replacements.

- [ ] **Step 1: `index.html`, stylesheet.** OLD:

```html
  <link rel="stylesheet" href="/guest.css">
```

NEW:

```html
  <link rel="stylesheet" href="/guest.css?v=guest-b-1">
```

- [ ] **Step 2: `index.html`, scripts.** OLD:

```html
  <script src="/itinerary-days.js" defer></script>
  <script src="/guest.js" defer></script>
```

NEW:

```html
  <script src="/itinerary-days.js?v=guest-b-1" defer></script>
  <script src="/preview-mode.js?v=guest-b-1" defer></script>
  <script src="/guest.js?v=guest-b-1" defer></script>
```

- [ ] **Step 3: `sw.js`, cache name and the precache list.** OLD:

```js
const STATIC_CACHE_NAME = "iolanthe-onboard-static-v4";
const LEAFLET_ASSET_CACHE_NAME = "iolanthe-onboard-leaflet-v1";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/guest.css",
  "/guest.js",
  "/itinerary-days.js",
```

NEW:

```js
const STATIC_CACHE_NAME = "iolanthe-onboard-static-v5";
const LEAFLET_ASSET_CACHE_NAME = "iolanthe-onboard-leaflet-v1";

// The local CSS/JS carry the same ?v= as index.html: the cache is keyed by the full URL, so a new ?v= is fetched fresh.
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/guest.css?v=guest-b-1",
  "/guest.js?v=guest-b-1",
  "/itinerary-days.js?v=guest-b-1",
  "/preview-mode.js?v=guest-b-1",
```

- [ ] **Step 4: `sw.js`, path set without the query.** OLD:

```js
const STATIC_ASSET_PATHS = new Set(STATIC_ASSETS);
```

NEW:

```js
const STATIC_ASSET_PATHS = new Set(STATIC_ASSETS.map(asset => asset.split("?")[0]));
```

- [ ] **Step 5: `sw.js`, preview pages are never cached (one entry per date would pile up).** OLD:

```js
  if (isAdminRequest(url) || isLiveDataRequest(url)) {
    event.respondWith(networkOnly(event.request));
    return;
  }
```

NEW:

```js
  if (isAdminRequest(url) || isLiveDataRequest(url) || url.searchParams.has("preview")) {
    event.respondWith(networkOnly(event.request));
    return;
  }
```

- [ ] **Step 6: Check.** `node --check sw.js`. `grep -c "guest-b-1" index.html sw.js` → `index.html:4`, `sw.js:4`.

- [ ] **Step 7: Commit.**

```bash
git add index.html sw.js
git commit -m "chore(guest): preview-mode.js script, ?v=guest-b-1 cache-busters, SW cache v5, preview pages network-only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Docs

**Files:** `CLAUDE.md`, `README-dev.md` (haiku-sized task).

- [ ] **Step 1: `CLAUDE.md`.** In "## Key constraints", after the line `- Bump STATIC_CACHE_NAME in sw.js whenever static assets change.` add:

```markdown
- Local CSS/JS are loaded with `?v=<tag>` in `index.html`; change the tag in `index.html` **and** the matching
  `STATIC_ASSETS` entries in `sw.js` on every release (the cache is keyed by the full URL).
- Preview mode (charter rework spec B): `?preview=YYYY-MM-DD&charter=<id>` (parsed by `preview-mode.js`) replaces the
  browser clock in `calculateCurrentCharterDayState` / `getCurrentDateKey`, adds the params to `/api/charter`,
  `/api/planned-route` and `/api/track`, shows a red banner, and switches off the SW registration, the install prompt
  and idle mode. The admin's Guest view tab loads it in an iframe. Without the params nothing changes.
```

- [ ] **Step 2: `README-dev.md`.** In "## Project Layout", after the `sw.js` line add the two lines:

```
  itinerary-days.js       Guest days derived from the v2 itinerary (pure, node --test)
  preview-mode.js         Preview mode params, API URLs, banner text (pure, node --test)
```

(If `itinerary-days.js` is already listed, add only the `preview-mode.js` line.)

- [ ] **Step 3: Commit.**

```bash
git add CLAUDE.md README-dev.md
git commit -m "docs: preview mode and the ?v= rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review against spec B §4

| Spec | Task |
|---|---|
| §4.1 `preview-mode.js` (parse, URLs, banner) + tests | 1 |
| §4.2 the two clocks; API URLs (charter, planned-route, track); weather/NMEA untouched | 2 steps 1, 5, 6 |
| §4.2 SW, idle (and its redirect), install prompt off; banner, header moved down | 2 steps 2, 4, 7, 9, 10 |
| §4.3 Task 8 converter; `?v=`; SW v5 | 3, 4 |
| §4.4 401 / 404 shown in the banner, no fallback to active data | 2 steps 2, 3, 8 (the empty bundle stays empty; the banner names the problem) |
| §7 guest tests | 1, 3 |
