# Charter Itinerary Rework — Plan 5 of 5: Guest App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the guest portal read the version 2 itinerary: derive days from stops, render one block per stop with its activities, show a passage card for stop-less days, pin stops and activity sites, drop the Primary/Alternative logic, keep a version 1 converter for one release, and bump the service worker cache.

**Architecture:** A new small UMD module `itinerary-days.js` holds the pure derivation (`deriveGuestDays`, `v1ToGuestDays`) and is the first file in this repo with Node tests. `guest.js`'s `getItineraryDays` calls it and keeps returning the shape the rest of the app already consumes (`{id, day, dayNumber, date, area, summary, stops[]}`), so pins, the screensaver, the menu picker and the pills need only small edits. Each stop-block becomes one `stops[]` entry carrying its activities; `renderSelectedDay` renders blocks and activities.

**Tech Stack:** Plain JS classic scripts (4-space indented, no wrapper), Leaflet, `node --test`. Repo: `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-guest`. Spec: `docs/charter-rework/spec.md` §6 (in the admin repo).

**Depends on:** plan 1 live on the server you test against. The guest reads `itinerary.start_date` / `end_date` that `buildCharterPayload` still adds (plan 1 Task 11 step 3).

Line numbers are from guest `1017f14`.

---

## File structure

| File | Responsibility |
|---|---|
| `itinerary-days.js` (new) | Pure: `charterDayCount`, `deriveGuestDays(itinerary, dayCount, sites)`, `v1ToGuestDays(v1, dayCount, sites)`. UMD so `guest.js` sees `window.IolantheItineraryDays` and Node can test it. |
| `test/itinerary-days.test.js` (new) | Tests. |
| `guest.js` (modify) | `getItineraryDays` → module; `renderSelectedDay` blocks; plan logic removed; planned route from `routes[]`; pins; screensaver; day state. |
| `index.html` (modify) | Script tag for the module before `guest.js`. |
| `sw.js` (modify) | Cache name bump; add the module to the static list. |
| `README-dev.md` / `CLAUDE.md` (modify) | How to run the tests. |

---

### Task 1: `itinerary-days.js` — `deriveGuestDays`

**Files:**
- Create: `itinerary-days.js`, `test/itinerary-days.test.js`

Output shape per day (what `guest.js` consumes):

```
{ id: "day-3", day: "Day 3", dayNumber: 3, date: "2026-10-14", area: "Hermana Mayor · Potipot", summary: "",
  passage: "" | "Underway · Potipot to Hundred Islands",
  stops: [ { id: "stp_poti", name: "Potipot", arriveTime: "" | "12:40", departTime: "" | "18:00", nights: 2,
             latitude, longitude,
             activities: [ { id, title, notes, time: "", siteId: "", site: <library site | null>, images: [...] } ] } ] }
```

- [ ] **Step 1: Write the failing tests**

Create `test/itinerary-days.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const days = require("../itinerary-days.js");

const P = (latitude, longitude, extra) => ({ latitude, longitude, ...(extra || {}) });
const sites = { sites: [
  { id: "capones-lh", title: "Capones lighthouse", description: "Climb at sunset", latitude: 14.951, longitude: 120.112, images: ["/data/sites/capones-lh/1.jpg"] },
  { id: "potipot-beach", title: "Potipot beach", description: "", latitude: 15.6, longitude: 119.9, images: [] }
] };

// Same 7-day fixture as the server and admin tests.
const itinerary = {
  version: 2, revision: 4, welcome_message: "Welcome", summary: "North", start_date: "2026-10-12", end_date: "2026-10-18",
  route: { speed_kn: 8, points: [
    P(14.80, 120.27, { stop: true, id: "stp_subic1", name: "Subic Bay", depart: { day: 1, time: "09:00" } }),
    P(14.83, 120.20, { stop: true, id: "stp_anaw", name: "Anawangin", arrive: { day: 1 }, depart: { day: 1, time: "14:00" } }),
    P(14.95, 120.11, { anchorage_id: "capones", id: "stp_capo", name: "Capones Is.", site_ids: ["capones-lh"], arrive: { day: 1 }, depart: { day: 2, time: "08:30" } }),
    P(15.30, 119.80, { anchorage_id: "hermana", id: "stp_herm", name: "Hermana Mayor", arrive: { day: 2 }, depart: { day: 3 } }),
    P(15.60, 119.90, { anchorage_id: "potipot", id: "stp_poti", name: "Potipot", site_ids: ["potipot-beach", "sandbar"], arrive: { day: 3 }, depart: { day: 5, time: "18:00" } }),
    P(16.00, 119.95),
    P(16.20, 120.00, { anchorage_id: "hundred", id: "stp_hund", name: "Hundred Islands", arrive: { day: 6 }, depart: { day: 7, time: "08:00" } }),
    P(14.80, 120.27, { stop: true, id: "stp_subic2", name: "Subic Bay", arrive: { day: 7 } })
  ] },
  activities: [
    { id: "act_1", stop_id: "stp_capo", day: 1, order: 1, title: "Sundowners", notes: "Bring a jumper" },
    { id: "act_2", stop_id: "stp_capo", day: 1, order: 0, title: "Lighthouse walk", notes: "", site_id: "capones-lh", time: "16:30" },
    { id: "act_3", stop_id: "stp_poti", day: 4, order: 0, title: "Kayaks", notes: "" },
    { id: "act_4", stop_id: "stp_poti", day: 3, order: 0, title: "Beach", notes: "", site_id: "potipot-beach" }
  ]
};

test("charterDayCount from the itinerary's dates", () => {
  assert.equal(days.charterDayCount(itinerary), 7);
  assert.equal(days.charterDayCount({}), 0);
});

test("deriveGuestDays: one entry per day with the stops that touch it, in route order", () => {
  const out = days.deriveGuestDays(itinerary, 7, sites);
  assert.equal(out.length, 7);
  assert.deepEqual(out.map((d) => d.stops.map((s) => s.id)), [
    ["stp_subic1", "stp_anaw", "stp_capo"], ["stp_capo", "stp_herm"], ["stp_herm", "stp_poti"], ["stp_poti"], ["stp_poti"], ["stp_hund"], ["stp_hund", "stp_subic2"]
  ]);
  assert.deepEqual([out[0].id, out[0].day, out[0].dayNumber, out[0].date], ["day-1", "Day 1", 1, "2026-10-12"]);
  assert.equal(out[2].area, "Hermana Mayor · Potipot");
});

test("deriveGuestDays: set times only, never estimates; nights on multi-night stops", () => {
  const out = days.deriveGuestDays(itinerary, 7, sites);
  const capo = out[0].stops[2];
  assert.deepEqual([capo.arriveTime, capo.departTime, capo.nights], ["", "", 1]);   // arrival time not set → ""; departure is day 2 so not shown on day 1
  const capoDay2 = out[1].stops[0];
  assert.deepEqual([capoDay2.arriveTime, capoDay2.departTime], ["", "08:30"]);
  const poti = out[2].stops[1];
  assert.deepEqual([poti.arriveTime, poti.departTime, poti.nights], ["", "", 2]);
  assert.equal(out[4].stops[0].departTime, "18:00");
  assert.equal(out[0].stops[0].departTime, "09:00");
});

test("deriveGuestDays: activities in order with site, images and time", () => {
  const out = days.deriveGuestDays(itinerary, 7, sites);
  const acts = out[0].stops[2].activities;
  assert.deepEqual(acts.map((a) => a.id), ["act_2", "act_1"]);
  assert.equal(acts[0].site.title, "Capones lighthouse");
  assert.deepEqual(acts[0].images, ["/data/sites/capones-lh/1.jpg"]);
  assert.equal(acts[0].time, "16:30");
  assert.equal(acts[1].site, null);
  assert.equal(acts[1].notes, "Bring a jumper");
  assert.deepEqual(out[3].stops[0].activities.map((a) => a.title), ["Kayaks"]);
  assert.deepEqual(out[4].stops[0].activities, []);
});

test("deriveGuestDays: a passage day names the stops either side", () => {
  const it = JSON.parse(JSON.stringify(itinerary));
  it.route.points[6].arrive = { day: 7 }; it.route.points[6].depart = { day: 7, time: "08:00" };
  const out = days.deriveGuestDays(it, 7, sites);
  assert.deepEqual(out[5].stops, []);
  assert.equal(out[5].passage, "Underway · Potipot to Hundred Islands");
  assert.equal(out[0].passage, "");
});

test("deriveGuestDays: a missing site falls back quietly", () => {
  const out = days.deriveGuestDays(itinerary, 7, { sites: [] });
  const act = out[0].stops[2].activities[0];
  assert.equal(act.site, null);
  assert.deepEqual(act.images, []);
  assert.equal(act.title, "Lighthouse walk");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

From the guest repo root: `node --test`
Expected: FAIL with `Cannot find module '../itinerary-days.js'`.

- [ ] **Step 3: Create the module**

Create `itinerary-days.js`:

```js
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  } else {
    root.IolantheItineraryDays = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Pure derivation of guest-facing days from the version 2 itinerary (charter rework spec A §6).
  // Mirrors the server's deriveDays rule: a day holds every stop whose span includes it, in route order.

  const DAY_MS = 86400000;
  const toObj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  const isStop = (p) => Boolean(p && (p.anchorage_id || p.stop === true));

  function parseDateOnly(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
    if (!m) return null;
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isFinite(t) ? t : null;
  }
  function dateKey(startMs, day) {
    const d = new Date(startMs + (day - 1) * DAY_MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  // The guest receives start_date / end_date on the itinerary object (the server copies them from charter.json).
  function charterDayCount(source) {
    const s = toObj(source);
    const start = parseDateOnly(s.start_date);
    const end = parseDateOnly(s.end_date);
    if (start === null || end === null || end < start) return 0;
    return Math.round((end - start) / DAY_MS) + 1;
  }

  function stopEntries(points) {
    return (Array.isArray(points) ? points : []).map((point, index) => ({ point, index })).filter((e) => isStop(e.point));
  }
  function positionOf(i, count) {
    if (count === 1) return "only";
    if (i === 0) return "origin";
    return i === count - 1 ? "terminus" : "middle";
  }
  function stopSpan(stop, position, dayCount) {
    const arriveDay = stop.arrive ? stop.arrive.day : 1;
    const departDay = stop.depart ? stop.depart.day : (dayCount || arriveDay);
    const from = position === "origin" || position === "only" ? 1 : arriveDay;
    const to = position === "terminus" || position === "only" ? Math.max(dayCount || departDay, arriveDay) : departDay;
    return { from, to: Math.max(from, to) };
  }

  function siteIndex(siteLibrary) {
    const map = new Map();
    (toObj(siteLibrary).sites || []).forEach((site) => { if (site && typeof site.id === "string") map.set(site.id, site); });
    return map;
  }
  function siteImages(site) {
    if (!site) return [];
    const list = Array.isArray(site.images) ? site.images : [];
    return list.filter((x) => typeof x === "string" && x.trim());
  }

  function deriveGuestDays(itinerary, dayCount, siteLibrary) {
    const it = toObj(itinerary);
    const route = toObj(it.route);
    const stops = stopEntries(route.points);
    const sites = siteIndex(siteLibrary);
    const startMs = parseDateOnly(it.start_date);
    const activities = (Array.isArray(it.activities) ? it.activities : []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const spans = stops.map((e, i) => stopSpan(e.point, positionOf(i, stops.length), dayCount));
    const out = [];
    for (let day = 1; day <= dayCount; day += 1) {
      const dayStops = [];
      stops.forEach((entry, i) => {
        if (day < spans[i].from || day > spans[i].to) return;
        const p = entry.point;
        dayStops.push({
          id: p.id,
          name: text(p.name) || `Stop ${i + 1}`,
          arriveTime: p.arrive && p.arrive.day === day && p.arrive.time ? p.arrive.time : "",
          departTime: p.depart && p.depart.day === day && p.depart.time ? p.depart.time : "",
          nights: p.arrive && p.depart ? p.depart.day - p.arrive.day : 0,
          latitude: p.latitude,
          longitude: p.longitude,
          activities: activities.filter((a) => a.stop_id === p.id && a.day === day).map((a) => {
            const site = a.site_id ? (sites.get(a.site_id) || null) : null;
            return { id: a.id, title: text(a.title) || (site ? text(site.title) : "") || "Activity", notes: text(a.notes), time: text(a.time), siteId: text(a.site_id), site, images: siteImages(site) };
          })
        });
      });
      let passage = "";
      if (!dayStops.length && stops.length) {
        const before = stops.slice().reverse().find((e, k) => { const idx = stops.length - 1 - k; return spans[idx].to < day; });
        const after = stops.find((e, idx) => spans[idx].from > day);
        passage = before && after ? `Underway · ${text(before.point.name) || "previous stop"} to ${text(after.point.name) || "next stop"}` : "At sea";
      }
      out.push({
        id: `day-${day}`,
        day: `Day ${day}`,
        dayNumber: day,
        date: startMs === null ? "" : dateKey(startMs, day),
        area: dayStops.map((s) => s.name).filter((v, i, arr) => arr.indexOf(v) === i).join(" · "),
        summary: "",
        passage,
        stops: dayStops
      });
    }
    return out;
  }

  return { charterDayCount, deriveGuestDays, stopEntries, isStop, parseDateOnly };
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add itinerary-days.js test/itinerary-days.test.js
git commit -m "feat(itinerary): pure guest day derivation for the v2 itinerary, with tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `v1ToGuestDays` — the one-release fallback

**Files:**
- Modify: `itinerary-days.js`, `test/itinerary-days.test.js`

- [ ] **Step 1: Write the failing test**

Append to the test file:

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

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test` → FAIL with `days.v1ToGuestDays is not a function`.

- [ ] **Step 3: Add the function**

Insert before the `return {` export in `itinerary-days.js`:

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
```

Add `v1ToGuestDays` to the export.

- [ ] **Step 4: Run and commit**

`node --test` → `# pass 7`.

```bash
git add itinerary-days.js test/itinerary-days.test.js
git commit -m "feat(itinerary): v1 itinerary converter for the transition release

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `guest.js` — `getItineraryDays` on the module; day state; load order

**Files:**
- Modify: `index.html:117-119`, `guest.js` (`getItineraryDays` 2703-2812, `getGuestItineraryDateViewState` 4147, `getIdleItineraryStops` 5861, `getItineraryMapPoints` 2814)

- [ ] **Step 1: Load the module before `guest.js`**

In `index.html` before `<script src="/guest.js" defer></script>` add:

```html
  <script src="/itinerary-days.js" defer></script>
```

- [ ] **Step 2: Replace `getItineraryDays`**

Replace the whole function (G:2703-2812) with:

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

- [ ] **Step 3: Adapt the consumers of the old `stops[]` shape**

- `getItineraryMapPoints()` (G:2814): it flattens `day.stops` with finite `latitude`/`longitude` into pins. Keep it, and add activity-site pins: for each stop, also push `{ latitude: a.site.latitude, longitude: a.site.longitude, label: a.title, day: day.day, location: stop.name, plan: a.notes, isSite: true }` for each activity with a `site` that has a position. The stop pin itself uses `{ latitude, longitude, label: stop.name, day: day.day, location: stop.name, plan: "" }`.
- `getGuestItineraryVisibleStops(day)` (G:4129): return `day.stops` unchanged (a stop block is always visible; an empty block still names where guests are).
- `guestItineraryDayHasContent(day)` (G:4136): `return !!(day.passage || (day.stops && day.stops.length));`
- `getIdleItineraryStops` (G:5861): map each day's stops to `{ id, dayId: day.id, day: day.day, area: day.area, daySummary: firstActivityTitle(stop), location: stop.name, label: stop.name, plan: firstActivityTitle(stop), latitude, longitude }` where `firstActivityTitle = (stop) => stop.activities[0] ? stop.activities[0].title : ""`.
- `getIdleItinerarySummary` (G:5894-5916): replace `getDisplayedItineraryDayNumber({ itinerary: itineraryData })` with `calculateCurrentCharterDayState({ startDate: itineraryData && itineraryData.start_date, endDate: itineraryData && itineraryData.end_date, dayNumbers: days.map((d) => d.dayNumber) }).defaultDayNumber`.
- `syncIdleItinerarySection` (G:6407-6410): `todayNotes` = `today.stops.map((s) => s.name).join(" → ") + (first activity ? " · " + title : "")` or "Underway" from `today.passage`, fallback "No itinerary for today."; same for tomorrow.
- `getSelectedMenuEntry` (G:958): unchanged (uses `dayNumber`/date).

- [ ] **Step 4: Syntax check and commit**

`node --check guest.js` → no output.

```bash
git add index.html guest.js
git commit -m "feat(guest): derive itinerary days from the v2 itinerary

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Day card — stop blocks and activities

**Files:**
- Modify: `guest.js` (`renderSelectedDay` inside `renderItineraryTab`, G:7794-7843; `renderItineraryImageButton` callers; `renderItineraryStopTitle` G:2558)
- Modify: `guest.css`

- [ ] **Step 1: Replace `renderSelectedDay`**

```js
        function renderSelectedDay(day) {
          if (!day) {
            return el("div", { class: "menu-note" }, ["Itinerary data will be added shortly."]);
          }
          if (!guestItineraryDayHasContent(day)) {
            return el("div", { class: "guest-itinerary-day-empty" }, ["No itinerary has been added for this day."]);
          }
          if (day.passage) {
            return makeList([day], (d) => el("li", { class: "list-item" }, [
              el("div", { class: "itinerary-day-header" }, [el("strong", {}, [d.day])]),
              el("div", { class: "muted itinerary-passage" }, [d.passage])
            ]));
          }
          return makeList([day], (d) => el("li", { class: "list-item" }, [
            el("div", { class: "itinerary-day-header" }, [el("strong", {}, [d.day])]),
            el("ul", { class: "list itinerary-stop-list" }, d.stops.map((stop) => {
              const times = [stop.arriveTime ? `Arrive ${stop.arriveTime}` : "", stop.departTime ? `Depart ${stop.departTime}` : ""].filter(Boolean).join(" · ");
              return el("li", { class: "list-item itinerary-stop-block" }, [
                el("div", { class: "itinerary-stop-block-head" }, [
                  el("strong", {}, [stop.name]),
                  times ? el("span", { class: "muted itinerary-stop-times" }, [times]) : null
                ]),
                stop.activities.length
                  ? el("ul", { class: "list itinerary-activity-list" }, stop.activities.map((activity) =>
                    el("li", { class: "list-item itinerary-activity" }, [
                      el("div", { class: "itinerary-stop-title" }, [
                        el("div", { class: "itinerary-stop-title-main" }, [
                          el("span", { class: "itinerary-activity-title" }, [activity.title]),
                          activity.time ? el("span", { class: "muted itinerary-activity-time" }, [activity.time]) : null
                        ]),
                        activity.images.length ? renderItineraryImageButton({ images: activity.images, location: activity.title }) : null
                      ]),
                      activity.notes ? el("div", { class: "muted itinerary-stop-plan" }, [activity.notes]) : null
                    ])))
                  : null
              ]);
            }))
          ]));
        }
```

`renderItineraryImageButton(stop)` (search for it near G:2600) reads `stop.images` and a label; confirm it accepts the `{ images, location }` object and adjust the property names in the call to match.

- [ ] **Step 2: Styles**

Append to `guest.css`:

```css
.itinerary-stop-block { padding-top: 10px; }
.itinerary-stop-block-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.itinerary-stop-times { font-size: 0.9em; }
.itinerary-activity-list { margin-top: 6px; }
.itinerary-activity-title { font-weight: 600; }
.itinerary-activity-time { margin-left: 8px; font-variant-numeric: tabular-nums; }
.itinerary-passage { font-style: italic; padding: 8px 0; }
```

- [ ] **Step 3: Verify**

Serve the guest from the local server (`GUEST_STATIC_DIR` per the server CLAUDE.md), open `http://localhost:8000/#itinerary`. Day 1 shows the stop blocks (Subic Bay with "Depart 09:00", Anawangin, Capones Is.) each with its activities, camera buttons on site-backed ones, and the pills behave as before. A passage day shows "Underway · … to …".

- [ ] **Step 4: Commit**

```bash
git add guest.js guest.css
git commit -m "feat(guest): day card renders stop blocks with activities and passage days

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Remove the plan logic; planned route from `routes[]`

**Files:**
- Modify: `guest.js` (G:62 `ROUTE_PLAN_IDS`; 2929-2937; 2966-3065; 3067-3123; 3157-3220; 348 `plannedRouteData`)

- [ ] **Step 1: Delete**

Remove `ROUTE_PLAN_IDS`, `normalizeRoutePlanId`, `explicitRoutePlanId`, `plannedRoutePlanHasData` (keep a renamed `plannedRouteHasData(route)` below), `routePlanFromDisplayedDayId`, `getDisplayedItineraryDayNumber`, `getDisplayedItineraryPlan`, `itineraryWelcomeMessageForPlan`, `getDisplayedItineraryWelcomeMessage`, `getActiveRouteForPlan`, `getDisplayedPlannedRoute`.

- [ ] **Step 2: Replace the planned-route normaliser and consumers**

```js
    function plannedRouteHasData(route) {
      return !!(route && Array.isArray(route.routes) && route.routes.some(r => Array.isArray(r.coordinates) && r.coordinates.length >= 2));
    }

    // /api/planned-route is derived from the itinerary's points (spec A §3.4). The pre-rework `route.primary`
    // wrapper may still be present for one release; `routes` is authoritative.
    function normalizePlannedRouteData(rawData) {
      const data = rawData && typeof rawData === "object" ? rawData : {};
      const normalized = normalizeSinglePlannedRouteData(data);
      return {
        source: normalized.source,
        routes: normalized.routes,
        routeCount: normalized.routes.length,
        coordinateCount: normalized.routes.reduce((total, route) => total + route.coordinates.length, 0)
      };
    }

    function hasPlannedRoute() {
      return plannedRouteHasData(plannedRouteData);
    }
```

Set the initial `plannedRouteData` (G:348) to `{ source: null, routes: [], routeCount: 0, coordinateCount: 0 }`. In `createPlannedRouteLayer` replace `const activeRoute = getDisplayedPlannedRoute();` with `const activeRoute = plannedRouteData;`.

- [ ] **Step 3: Welcome message**

In `renderItineraryTab` replace `getDisplayedItineraryWelcomeMessage({ itinerary: itineraryInfo })` with:

```js
        const welcomeMessage = getItineraryTextValue(itineraryInfo.welcome_message, itineraryInfo.summary);
```

(For a v1 payload during the transition this shows the top-level `welcome_message` or `summary`; the Primary plan's own message is not reproduced. Acceptable for one release.)

- [ ] **Step 4: Verify and commit**

`node --check guest.js`; `grep -n "alt-day\|ROUTE_PLAN_IDS\|getDisplayedItineraryPlan\|active_plan_by_day" guest.js` → no matches. In the browser the map draws the planned route line and the toggle works.

```bash
git add guest.js
git commit -m "refactor(guest): drop Primary/Alternative plan logic; planned route from routes[]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Pins and tooltips

**Files:**
- Modify: `guest.js` (`syncNavigationItineraryOverlay` G:3268-3323)

- [ ] **Step 1: Two marker styles**

In the `points.forEach(point => { … })` body, choose the marker by `point.isSite`:

```js
          const marker = window.L.circleMarker([point.latitude, point.longitude], point.isSite
            ? { radius: 4, weight: 1.5, color: "#fff5d8", fillColor: "#8fb3c9", fillOpacity: 0.95 }
            : { radius: 6, weight: 2, color: "#fff5d8", fillColor: "#d4b06a", fillOpacity: 0.95 });
```

Keep the popup lines (`point.day`: `point.location` header, `point.plan` body) and bind the permanent tooltip only for stops (`if (!point.isSite) marker.bindTooltip(...)`) so activity sites do not crowd the map.

- [ ] **Step 2: Verify and commit**

Navigation map: gold stop pins with labels, smaller blue-grey pins at activity sites with a popup naming the activity.

```bash
git add guest.js
git commit -m "feat(guest): pins for itinerary stops and activity sites

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Service worker and docs

**Files:**
- Modify: `sw.js:1-30`, `README-dev.md` (or `CLAUDE.md`)

- [ ] **Step 1: Bump and add**

`const STATIC_CACHE_NAME = "iolanthe-onboard-static-v4";` and add `"/itinerary-days.js"` to `STATIC_ASSETS` after `"/guest.js"`.

- [ ] **Step 2: Docs**

Add to `README-dev.md`: "Tests: `node --test` runs `test/itinerary-days.test.js`. `itinerary-days.js` is a UMD module shared by the browser and the tests."

- [ ] **Step 3: Verify, commit**

Hard-reload the guest twice: DevTools → Application → Cache Storage shows `iolanthe-onboard-static-v4` only.

```bash
git add sw.js README-dev.md
git commit -m "chore(guest): cache bump for the itinerary rework; document tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Follow-up (one release later) — remove the transition shims

Do this only after the server (plan 1), admin (plans 2–4) and guest (this plan) are all confirmed live on the vessel.

- [ ] **Step 1: Guest**

Delete `v1ToGuestDays` and its test; `getItineraryDays` returns `[]` for anything that is not `version === 2`.

- [ ] **Step 2: Server**

In `lib/itinerary.js` `plannedRouteFromItinerary`, return only `{ source, routes }`; update its test; bump nothing else.

- [ ] **Step 3: Commit both**

```bash
# guest
git commit -am "chore(guest): remove the v1 itinerary converter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
# server
git commit -am "chore(server): drop the legacy planned-route wrapper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Spec coverage check (plan self-review)

| Spec A item | Task |
|---|---|
| §6 days derived in the guest with the same rule | 1, 3 |
| §6 day card: one block per stop, set times only, activities with notes/time/camera, passage card | 1, 4 |
| §6 welcome message single field | 5 |
| §6 planned route from `routes[]`; plan logic and alt-day removed | 5 |
| §6 pins for stops and activity sites | 3 (points), 6 (markers) |
| §6 screensaver Today/Tomorrow from stop names and first activity | 3 |
| §6 pills/status/default selection unchanged | 3 (`dayNumbers` from derived days) |
| §6 v1 fallback for one release; SW cache bump | 2, 7, 8 |
| §8 guest tests (pure derivation) | 1, 2 |
