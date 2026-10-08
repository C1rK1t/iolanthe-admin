# Spec A2 — Plan 4: Round 2 after the captain's first contact (2026-10-08)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply [spec-a2-round2.md](../spec-a2-round2.md): the Start from… dialog rebuilt as one grouped dropdown with a result line (T14), hour/minute time selects (T13), the Days tab with stop headers inside the sub-boxes and gaps (T8, T9), line → card → map with zoom (T10), "Stop duration" wording and a default departure time (T11, T12), arrow keys that work page-wide (T15), plus three housekeeping items.

**Architecture:** Admin only except one server constant. Pure logic (defaults, the result sentence, the sub-box times line, the time-option grid) goes into `itinerary-core.js` with `node --test` coverage; the time control is a small factory in `routes-ui.js`; the card, the Days tab and the Route page wire them in. Same execution pattern as plans a2-02/a2-03: branch from `main`, one Sonnet implementer per task, this session reviews each diff against the plan, browser check on `iolanthe-server-scratch`, merge on David's word (admin main auto-deploys within 5 minutes).

**Tech Stack:** Plain JS, no build, `node --test` (111 tests → 117). Admin repo `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin` from `main` at `b4a1b13` or later; server repo `S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server` from `main` at `cbde12e` (Task 8 only).

**Dry-run (done while planning):** Task 1's core code and tests were assembled onto a copy of the committed `itinerary-core.js` and pass `node --test` at 117/117. The browser modules are checked with `node --check` per task and in the browser (Task 9).

**Another session is editing this repo** (charter management; untracked `docs/charter-rework/plans/ch-01-server.md`). Touch `admin.js` only in Task 7 step 1, and only if `git status --short admin.js` is clean at that moment; otherwise skip that step and say so.

**Reading before you start:** `itinerary-core.js` (`estimateTimes`, `effectiveDepartMinutes`, `setDeparture`, `fit`, `rebaseRecord`, exports), `routes-ui.js` (`el`, `openModal`, the export line), `stop-cards.js` (`departTile`, `editItem`, `select`, the card's keydown), `routes-days.js` (all of it), `routes.js` (`openStartFrom` ~850–945, `initMap`, `panToStop`, `bindKeyboard`, the `days`/`cards` ctx in `bind`), `routes.css` (the `.routes-modal` and `.days-*` rules), `stop-cards.css` (tiles and `.item-edit-row`).

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `itinerary-core.js` + `test/itinerary-core.test.js` | Task 1: seed 07:00, day-stop dwell, `defaultDepartTime`, `setDeparture` default, `keptStopsBefore`, `fitSentence`, `subBoxTimesLabel`, `timeOptions`; header comment |
| `routes-ui.js` | Task 2: `timeSelects` factory |
| `stop-cards.js` / `stop-cards.css` | Task 3: Depart tile (T11 title, "Departure time" label, T12 assumed default, T13 selects), item editor time selects, card keydown removed (T15) |
| `routes-days.js` / `routes.css` | Task 4: T8 sub-box headers, titles column gone, T9 gaps |
| `routes.js` / `routes.css` | Task 5: T10 reveal + zoom, T15 page-wide arrows, Leaflet keyboard off. Task 6: T14 Start from… dialog + result-line styles |
| `admin.js`, `index.html`, `CLAUDE.md` | Task 7: dead `#panel-itinerary` selector, asset version `admin-itin-a2d`, doc line |
| server `lib/itinerary.js` + `test/itinerary.test.js` | Task 8: seed 07:00 |

---

### Task 0: Branch

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin"
git checkout main && git pull && git checkout -b feat/itinerary-a2-round2 && node --test 2>&1 | tail -8
```

Expected `ℹ pass 111`.

---

### Task 1: Core — defaults, the result sentence, the sub-box line, the time grid (T12, T13, T14, T8)

**Files:** `itinerary-core.js`, `test/itinerary-core.test.js`

Every step below is a verbatim replacement: find the OLD block (it occurs exactly once) and replace it with the NEW block.

- [ ] **Step 1: Header comment (housekeeping).** OLD:

```js
  // Pure logic for the Itinerary panel. Mirrors iolanthe-server/lib/itinerary.js for the shared rules
  // (normalise, spans, deriveDays, validate) and adds the admin-only pieces (time estimates, line geometry).
  // Spec: docs/charter-rework/spec.md.
```

NEW:

```js
  // Pure logic for the Route page (spec A2: the Route page is the itinerary). Mirrors iolanthe-server/lib/itinerary.js
  // for the shared rules (normalise, spans, deriveDays, validate) and adds the admin-only pieces (time estimates, the
  // departure cascade, clashes, fit, line geometry). Specs: docs/charter-rework/spec-a2.md, spec-a2-round2.md.
```

- [ ] **Step 2: Constants.** OLD:

```js
  const SEED_DEPART_TIME = "09:00";    // a stop with no departure time is assumed to leave at 09:00 (spec A2 D4)
```

NEW:

```js
  const SEED_DEPART_TIME = "07:00";    // an overnight stop with no departure time leaves at 07:00 (spec A2 round 2, T12)
  const DAY_STOP_DWELL_MIN = 120;      // a day stop with no departure time leaves 2 h after its estimated arrival (T12)
  const LAST_MINUTE = 23 * 60 + 59;    // a default never rolls into the next day
  const MINUTE_STEP = 15;              // the time control's minute grid (T13)
```

- [ ] **Step 3: `dwellAfter` helper.** OLD:

```js
  function minutesToTime(minutes) {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
```

NEW:

```js
  function minutesToTime(minutes) {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }
  // A day stop's assumed departure: 2 h after the arrival, never past 23:59 (spec A2 round 2, T12).
  const dwellAfter = (arriveTime) => minutesToTime(Math.min(timeToMinutes(arriveTime) + DAY_STOP_DWELL_MIN, LAST_MINUTE));
```

- [ ] **Step 4: `estimateTimes` day-stop rule.** OLD:

```js
      } else if (p.depart && nights === 0 && arrive) {
        depart = { time: arrive.time, estimated: true };
      } else if (p.depart) {
        depart = { time: SEED_DEPART_TIME, estimated: true };   // overnight stop with no departure time: assume 09:00
      }
```

NEW:

```js
      } else if (p.depart && nights === 0 && arrive) {
        depart = { time: dwellAfter(arrive.time), estimated: true };   // day stop with no departure time: arrival + 2 h
      } else if (p.depart) {
        depart = { time: SEED_DEPART_TIME, estimated: true };   // overnight stop with no departure time: assume 07:00
      }
```

- [ ] **Step 5: `effectiveDepartMinutes` and the new `defaultDepartTime`.** OLD:

```js
  // The time a stop leaves, for the next leg: its departure time, else (day stop) its arrival time, else 09:00.
  function effectiveDepartMinutes(point, arriveTime) {
    if (point.depart && point.depart.time) return timeToMinutes(point.depart.time);
    const dayStop = !point.arrive || !point.depart || point.arrive.day === point.depart.day;
    if (dayStop && arriveTime) return timeToMinutes(arriveTime);
    return timeToMinutes(SEED_DEPART_TIME);
  }
```

NEW:

```js
  // The time a stop leaves, for the next leg: its departure time, else (day stop) 2 h after its arrival, else 07:00.
  function effectiveDepartMinutes(point, arriveTime) {
    if (point.depart && point.depart.time) return timeToMinutes(point.depart.time);
    const dayStop = !point.arrive || !point.depart || point.arrive.day === point.depart.day;
    if (dayStop && arriveTime) return timeToMinutes(dwellAfter(arriveTime));
    return timeToMinutes(SEED_DEPART_TIME);
  }

  // Spec A2 round 2 T12: the departure time stored when the captain sets a stay without picking a time.
  // 07:00 for an overnight stop; the estimated arrival + 2 h for a day stop; 07:00 when nothing can be estimated.
  function defaultDepartTime(record, stopId) {
    const entry = stopEntries(record.route.points).find((e) => e.point.id === stopId);
    if (!entry || !entry.point.depart) return SEED_DEPART_TIME;
    const p = entry.point;
    const nights = p.arrive ? p.depart.day - p.arrive.day : p.depart.day - 1;
    if (nights > 0) return SEED_DEPART_TIME;
    const t = estimateTimes(record).get(stopId);
    return t && t.arrive ? dwellAfter(t.arrive.time) : SEED_DEPART_TIME;
  }
```

- [ ] **Step 6: `setDeparture` stores the default.** OLD:

```js
  // The card's Depart tile. change: { day?, time? } (time "" clears). The day is clamped to the arrival day; the stop's
  // own items beyond the new departure day are removed (the caller has shown the popup); arrivals are recomputed.
  function setDeparture(record, stopId, change) {
    const entry = stopEntries(record.route.points).find((e) => e.point.id === stopId);
    if (!entry || !entry.point.depart) return record;
    const p = entry.point;
    const c = toObj(change);
    const arriveDay = p.arrive ? p.arrive.day : 1;
    const day = Number.isInteger(c.day) ? Math.max(c.day, arriveDay) : p.depart.day;
    const time = "time" in c ? (TIME_RE.test(toStr(c.time)) ? toStr(c.time) : undefined) : p.depart.time;
    let next = shiftFromStop(record, stopId, day - p.depart.day);
    next = { ...next, activities: renumberActivities(next.activities.filter((a) => !(a.stop_id === stopId && a.day > day))) };
    next = withPoints(next, next.route.points.map((q) => (isStop(q) && q.id === stopId ? { ...q, depart: time ? { day, time } : { day } } : q)));
    return recomputeArrivals(next);
  }
```

NEW:

```js
  // The card's Depart tile. change: { day?, time? }. The day is clamped to the arrival day; the stop's own items beyond
  // the new departure day are removed (the caller has shown the popup); a departure left without a valid time gets the
  // T12 default; arrivals are recomputed.
  function setDeparture(record, stopId, change) {
    const entry = stopEntries(record.route.points).find((e) => e.point.id === stopId);
    if (!entry || !entry.point.depart) return record;
    const p = entry.point;
    const c = toObj(change);
    const arriveDay = p.arrive ? p.arrive.day : 1;
    const day = Number.isInteger(c.day) ? Math.max(c.day, arriveDay) : p.depart.day;
    const picked = "time" in c ? (TIME_RE.test(toStr(c.time)) ? toStr(c.time) : undefined) : p.depart.time;
    let next = shiftFromStop(record, stopId, day - p.depart.day);
    next = { ...next, activities: renumberActivities(next.activities.filter((a) => !(a.stop_id === stopId && a.day > day))) };
    const setDepart = (r, depart) => withPoints(r, r.route.points.map((q) => (isStop(q) && q.id === stopId ? { ...q, depart } : q)));
    next = setDepart(next, { day });
    const time = picked || defaultDepartTime(next, stopId);
    return recomputeArrivals(setDepart(next, { day, time }));
  }
```

- [ ] **Step 7: `keptStopsBefore`, `fitSentence`, `subBoxTimesLabel`, `timeOptions`.** Insert before `rebaseRecord`. OLD:

```js
  // A record's days are relative to its day 1; lay it onto `fromDay` (same rule as the server's import, spec A2-D20).
  function rebaseRecord(record, fromDay) {
```

NEW:

```js
  // Stops of the current record that an import from `fromDay` keeps: those reached before it (spec A2 §4 step 1).
  function keptStopsBefore(record, fromDay, dayCount) {
    const stops = stopEntries(toObj(toObj(record).route).points || []);
    return stops.filter((e, i) => stopSpan(e.point, positionOf(i, stops.length), dayCount).from < fromDay).length;
  }

  // Spec A2 round 2 T14: the Start from… result line. f = fit(rebased record, charter); info = { stops, fromDay, kept }.
  // { tone: "ok" | "warn" | "none", line1, line2 }.
  function fitSentence(f, charter, info) {
    const o = toObj(info);
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    if (!f || f.state === "none") return { tone: "none", line1: f && f.title ? f.title : "No stops to place.", line2: "" };
    const dayCount = charterDayCount(charter);
    const ends = dayDateLabel(charter, f.endsDay);
    const fromDay = Number.isInteger(o.fromDay) && o.fromDay > 0 ? o.fromDay : 1;
    const stops = Number.isInteger(o.stops) ? o.stops : 0;
    const kept = Number.isInteger(o.kept) ? o.kept : 0;
    const verdict = f.state === "match" ? "fits the charter"
      : `${plural(Math.abs(f.delta), "day")} ${f.state === "short" ? "before" : "after"} the charter ends`;
    const charterEnd = f.state === "match" ? "" : ` · the charter ends ${dayDateLabel(charter, dayCount)}`;
    const line2 = kept > 0
      ? `Keeps the ${plural(kept, "stop")} reached before ${dayDateLabel(charter, fromDay)}, then ${plural(stops, "stop")} to ${ends}${charterEnd}`
      : `${plural(stops, "stop")} · ${dayDateLabel(charter, fromDay)} to ${ends}${charterEnd}`;
    return { tone: f.state === "match" ? "ok" : "warn", line1: `Ends ${ends} · ${verdict}`, line2 };
  }

  // Spec A2 round 2 T8: the times line in a Days-tab sub-box for one day of a stop's stay. The arrival day shows the
  // arrival (and the departure when it leaves the same day); a middle day shows the nights; the departure day shows the
  // departure. "" when nothing applies.
  function subBoxTimesLabel(stop, times, day) {
    const t = times || { arrive: null, depart: null };
    const s = toObj(stop);
    const parts = [];
    const arriveDay = s.arrive ? s.arrive.day : null;
    const departDay = s.depart ? s.depart.day : null;
    if (arriveDay === day && t.arrive) parts.push(`Arr. ${t.arrive.estimated ? "~" : ""}${t.arrive.time}`);
    if (departDay === day && t.depart) parts.push(`Dep. ${t.depart.estimated ? "~" : ""}${t.depart.time}`);
    if (!parts.length && arriveDay !== null && departDay !== null && day > arriveDay && day < departDay) {
      const nights = departDay - arriveDay;
      parts.push(`${nights} night${nights === 1 ? "" : "s"}`);
    }
    return parts.join(" · ");
  }

  // Spec A2 round 2 T13: the hour and minute option lists for the time control. value "HH:MM" or "". A minute off the
  // 15-minute grid is kept as one extra option so a stored time is never rounded silently. allowBlank adds "" first.
  // { hours: [string], minutes: [string], hour: string, minute: string }.
  function timeOptions(value, opts) {
    const o = toObj(opts);
    const v = TIME_RE.test(toStr(value)) ? toStr(value) : "";
    const [hour, minute] = v ? v.split(":") : ["", ""];
    const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
    const minutes = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => String(i * MINUTE_STEP).padStart(2, "0"));
    if (minute && !minutes.includes(minute)) { minutes.push(minute); minutes.sort(); }
    if (o.allowBlank) { hours.unshift(""); minutes.unshift(""); }
    return { hours, minutes, hour, minute };
  }

  // A record's days are relative to its day 1; lay it onto `fromDay` (same rule as the server's import, spec A2-D20).
  function rebaseRecord(record, fromDay) {
```

- [ ] **Step 8: Exports.** OLD:

```js
    MIN_DURATION_MIN, MAX_DURATION_MIN, DEFAULT_DURATION_MIN, SEED_DEPART_TIME,
```

NEW:

```js
    MIN_DURATION_MIN, MAX_DURATION_MIN, DEFAULT_DURATION_MIN, SEED_DEPART_TIME, DAY_STOP_DWELL_MIN, MINUTE_STEP,
```

and OLD:

```js
    recordDayCount, recomputeArrivals, shiftFromStop, setDeparture, droppedDays, itemsDroppedByImport, dayOrdinal,
    removeStop, clashes, legSummaries, fit, rebaseRecord, toUnassignedRoute
```

NEW:

```js
    recordDayCount, recomputeArrivals, shiftFromStop, setDeparture, defaultDepartTime, droppedDays, itemsDroppedByImport, dayOrdinal,
    removeStop, clashes, legSummaries, fit, fitSentence, keptStopsBefore, subBoxTimesLabel, timeOptions, rebaseRecord, toUnassignedRoute
```

- [ ] **Step 9: Run the tests; expect 5 failures** (the seed moved and the cleared time is now defaulted):

```bash
node --test 2>&1 | grep -E "^not ok|ℹ (pass|fail)"
```

Expected `ℹ pass 106`, `ℹ fail 5`: the two `estimateTimes` tests, `stopTimesLabel`, `A2 setDeparture`, `A2 legSummaries`.

- [ ] **Step 10: Update the five expectations in `test/itinerary-core.test.js`.** Each is a verbatim replacement.

(a) OLD:

```js
test("estimateTimes: set times upright, arrivals estimated from the previous departure, an overnight stop without a departure time leaves at 09:00", () => {
```

NEW:

```js
test("estimateTimes: set times upright, arrivals estimated from the previous departure, an overnight stop without a departure time leaves at 07:00", () => {
```

(b) OLD:

```js
  assert.deepEqual(herm.depart, { time: "09:00", estimated: true });   // 1 night, no departure time set → 09:00 (spec A2 D4)
  const poti = times.get("stp_poti");
  assert.equal(poti.arrive.estimated, true);               // ~19 nm at 8 kn from 09:00 → about 11:22
  assert.match(poti.arrive.time, /^11:[1-3]\d$/);
```

NEW:

```js
  assert.deepEqual(herm.depart, { time: "07:00", estimated: true });   // 1 night, no departure time set → 07:00 (spec A2 round 2 T12)
  const poti = times.get("stp_poti");
  assert.equal(poti.arrive.estimated, true);               // ~19 nm at 8 kn from 07:00 → about 09:22
  assert.match(poti.arrive.time, /^09:[1-3]\d$/);
```

(c) OLD (the whole test):

```js
test("estimateTimes: a zero-night stop with no departure time leaves when it arrives", () => {
  const it = sevenDays();
  delete it.route.points[1].depart.time;                   // Anawangin: arrive ~09:40, depart estimated the same
  const t = core.estimateTimes(it).get("stp_anaw");
  assert.equal(t.depart.estimated, true);
  assert.equal(t.depart.time, t.arrive.time);
});
```

NEW:

```js
test("estimateTimes: a zero-night stop with no departure time leaves 2 h after it arrives, never past 23:59", () => {
  const it = sevenDays();
  delete it.route.points[1].depart.time;                   // Anawangin: arrive ~09:33, depart estimated ~11:33
  const t = core.estimateTimes(it).get("stp_anaw");
  assert.equal(t.depart.estimated, true);
  assert.equal(t.depart.time, core.minutesToTime(core.timeToMinutes(t.arrive.time) + core.DAY_STOP_DWELL_MIN));
  const late = sevenDays();
  late.route.points[0].depart.time = "22:30";              // Subic leaves late: Anawangin arrives ~23:03, departs 23:59 not 01:03
  delete late.route.points[1].depart.time;
  assert.equal(core.estimateTimes(late).get("stp_anaw").depart.time, "23:59");
});
```

(d) OLD:

```js
  assert.match(core.stopTimesLabel(stops[4], times.get("stp_poti")), /^Arr\. ~11:[1-3]\d · 2 nights · Dep\. 18:00$/);
```

NEW:

```js
  assert.match(core.stopTimesLabel(stops[4], times.get("stp_poti")), /^Arr\. ~09:[1-3]\d · 2 nights · Dep\. 18:00$/);
```

(e) OLD:

```js
  const cleared = core.setDeparture(it, "stp_poti", { time: "" });
  assert.deepEqual(stopOf(cleared, "stp_poti").depart, { day: 5 });
```

NEW:

```js
  const cleared = core.setDeparture(it, "stp_poti", { time: "" });
  assert.deepEqual(stopOf(cleared, "stp_poti").depart, { day: 5, time: "07:00" });   // no valid time → the T12 default (2 nights → 07:00)
```

(f) OLD:

```js
  assert.deepEqual([legs.get("stp_herm").departTime, legs.get("stp_herm").departEstimated], ["09:00", true]);
```

NEW:

```js
  assert.deepEqual([legs.get("stp_herm").departTime, legs.get("stp_herm").departEstimated], ["07:00", true]);
```

- [ ] **Step 11: Append the new tests** at the end of `test/itinerary-core.test.js` (after the `toUnassignedRoute` test). `CHARTER_7`, `stopOf` and `sevenDays` already exist in the file.

```js

// ---- spec A2 round 2 ---------------------------------------------------------------------

test("R2 defaultDepartTime: 07:00 with nights; arrival + 2 h for a day stop; clamped at 23:59; 07:00 without an estimate", () => {
  const it = sevenDays();
  assert.equal(core.defaultDepartTime(it, "stp_poti"), "07:00");                         // 2 nights
  assert.equal(core.defaultDepartTime(it, "stp_herm"), "07:00");                         // 1 night
  const anaw = core.estimateTimes(it).get("stp_anaw").arrive.time;                       // ~09:33
  assert.equal(core.defaultDepartTime(it, "stp_anaw"), core.minutesToTime(core.timeToMinutes(anaw) + 120));
  const late = sevenDays();
  late.route.points[0].depart.time = "22:30";
  assert.equal(core.defaultDepartTime(late, "stp_anaw"), "23:59");
  assert.equal(core.defaultDepartTime(it, "stp_subic1"), "07:00");                       // the origin has no arrival estimate
  assert.equal(core.defaultDepartTime(it, "stp_subic2"), "07:00");                       // the terminus has no departure
  assert.equal(core.defaultDepartTime(it, "stp_nope"), "07:00");
});

test("R2 setDeparture: a stay change on a stop with no time stores the default; a picked time is stored as picked", () => {
  const it = sevenDays();
  const herm = core.setDeparture(it, "stp_herm", { day: 4 });                            // Hermana had no time: 2 nights now → 07:00
  assert.deepEqual(stopOf(herm, "stp_herm").depart, { day: 4, time: "07:00" });
  const dayStop = core.setDeparture(it, "stp_herm", { day: 2 });                         // becomes a day stop → arrival + 2 h
  const arrive = core.estimateTimes(dayStop).get("stp_herm").arrive.time;
  assert.deepEqual(stopOf(dayStop, "stp_herm").depart, { day: 2, time: core.minutesToTime(core.timeToMinutes(arrive) + 120) });
  const picked = core.setDeparture(it, "stp_herm", { day: 4, time: "16:20" });
  assert.deepEqual(stopOf(picked, "stp_herm").depart, { day: 4, time: "16:20" });
  const kept = core.setDeparture(it, "stp_poti", { day: 6 });                            // Potipot keeps its 18:00
  assert.deepEqual(stopOf(kept, "stp_poti").depart, { day: 6, time: "18:00" });
});

test("R2 keptStopsBefore: stops reached before the from-day", () => {
  const it = sevenDays();
  assert.equal(core.keptStopsBefore(it, 1, 7), 0);
  assert.equal(core.keptStopsBefore(it, 2, 7), 3);                                       // Subic, Anawangin, Capones on day 1
  assert.equal(core.keptStopsBefore(it, 4, 7), 5);                                       // + Hermana (day 2), Potipot (day 3)
  assert.equal(core.keptStopsBefore(core.normalizeItinerary({}), 3, 7), 0);
});

test("R2 fitSentence: fits / short / over / kept stops / none, with day plurals", () => {
  const it = sevenDays();
  const match = core.fitSentence(core.fit(it, CHARTER_7), CHARTER_7, { stops: 7, fromDay: 1, kept: 0 });
  assert.deepEqual(match, { tone: "ok", line1: "Ends Sun 18 Oct · fits the charter", line2: "7 stops · Mon 12 Oct to Sun 18 Oct" });
  const short = core.fitSentence(core.fit(core.recomputeArrivals(it), CHARTER_7), CHARTER_7, { stops: 7, fromDay: 1, kept: 0 });
  assert.deepEqual(short, { tone: "warn", line1: "Ends Sat 17 Oct · 1 day before the charter ends", line2: "7 stops · Mon 12 Oct to Sat 17 Oct · the charter ends Sun 18 Oct" });
  const five = { start_date: "2026-10-12", end_date: "2026-10-16" };
  const over = core.fitSentence(core.fit(it, five), five, { stops: 7, fromDay: 1, kept: 0 });
  assert.deepEqual(over, { tone: "warn", line1: "Ends Sun 18 Oct · 2 days after the charter ends", line2: "7 stops · Mon 12 Oct to Sun 18 Oct · the charter ends Fri 16 Oct" });
  const mid = core.fitSentence(core.fit(core.rebaseRecord(it, 3), { start_date: "2026-10-12", end_date: "2026-10-20" }), { start_date: "2026-10-12", end_date: "2026-10-20" }, { stops: 7, fromDay: 3, kept: 1 });
  assert.deepEqual(mid, { tone: "ok", line1: "Ends Tue 20 Oct · fits the charter", line2: "Keeps the 1 stop reached before Wed 14 Oct, then 7 stops to Tue 20 Oct" });
  const none = core.fitSentence(core.fit(core.normalizeItinerary({}), CHARTER_7), CHARTER_7, {});
  assert.deepEqual(none, { tone: "none", line1: "No stops yet.", line2: "" });
  assert.equal(core.fitSentence(null, CHARTER_7, {}).tone, "none");
});

test("R2 subBoxTimesLabel: arrival day, middle day, departure day, same-day stop, origin", () => {
  const it = sevenDays();
  const times = core.estimateTimes(it);
  const stops = core.stopEntries(it.route.points).map((e) => e.point);
  assert.match(core.subBoxTimesLabel(stops[4], times.get("stp_poti"), 3), /^Arr\. ~09:[1-3]\d$/);   // Potipot arrives day 3
  assert.equal(core.subBoxTimesLabel(stops[4], times.get("stp_poti"), 4), "2 nights");
  assert.equal(core.subBoxTimesLabel(stops[4], times.get("stp_poti"), 5), "Dep. 18:00");
  assert.match(core.subBoxTimesLabel(stops[2], times.get("stp_capo"), 1), /^Arr\. ~15:[0-2]\d$/);     // Capones: in day 1, out day 2
  assert.equal(core.subBoxTimesLabel(stops[2], times.get("stp_capo"), 2), "Dep. 08:30");
  assert.match(core.subBoxTimesLabel(stops[1], times.get("stp_anaw"), 1), /^Arr\. ~09:[3-5]\d · Dep\. 14:00$/);   // same-day stop
  assert.equal(core.subBoxTimesLabel(stops[0], times.get("stp_subic1"), 1), "Dep. 09:00");            // the origin
  assert.equal(core.subBoxTimesLabel(stops[6], times.get("stp_subic2"), 7).startsWith("Arr. "), true);   // the terminus
  assert.equal(core.subBoxTimesLabel(stops[4], times.get("stp_poti"), 6), "");
  assert.equal(core.subBoxTimesLabel({ stop: true }, null, 1), "");
});

test("R2 timeOptions: the 15-minute grid, an off-grid minute kept once, blank first when allowed", () => {
  const on = core.timeOptions("07:30");
  assert.equal(on.hours.length, 24);
  assert.deepEqual([on.hours[0], on.hours[23]], ["00", "23"]);
  assert.deepEqual(on.minutes, ["00", "15", "30", "45"]);
  assert.deepEqual([on.hour, on.minute], ["07", "30"]);
  const off = core.timeOptions("09:20");
  assert.deepEqual(off.minutes, ["00", "15", "20", "30", "45"]);
  assert.deepEqual([off.hour, off.minute], ["09", "20"]);
  const blank = core.timeOptions("", { allowBlank: true });
  assert.deepEqual([blank.hours[0], blank.hours[1], blank.minutes[0], blank.minutes[1]], ["", "00", "", "00"]);
  assert.deepEqual([blank.hour, blank.minute], ["", ""]);
  assert.deepEqual(core.timeOptions("nonsense").minute, "");
  assert.equal(core.MINUTE_STEP, 15);
});
```

- [ ] **Step 12: Run the tests.**

```bash
node --test 2>&1 | grep -E "^not ok|ℹ (pass|fail)"
```

Expected `ℹ pass 117`, `ℹ fail 0`.

- [ ] **Step 13: Commit.**

```bash
git add itinerary-core.js test/itinerary-core.test.js
git commit -m "feat(core): 07:00 seed, day-stop dwell, default departure time, fitSentence, subBoxTimesLabel, timeOptions (spec A2 round 2)"
```

---

### Task 2: The time control factory (T13)

**Files:** `routes-ui.js`

- [ ] **Step 1: Add `timeSelects` after `closeModal`.** OLD:

```js
  const closeModal = () => { if (current) current(); };

  window.IolantheRoutesUi = Object.freeze({ ICONS, svg, el, fmtPos, openModal, closeModal });
```

NEW:

```js
  const closeModal = () => { if (current) current(); };

  // Spec A2 round 2 T13: a time as two native selects, hour (00–23) and minute (15-minute steps; a stored minute off the
  // grid is kept as one extra option by IolantheItineraryCore.timeOptions). { root, hour, minute, get(), set(value) };
  // onChange(value) fires on either select's change with the combined "HH:MM" (or "" when blank is allowed and the hour
  // is blank). allowBlank adds a "—" option to both selects for item times; an hour picked with a blank minute reads :00.
  function timeSelects({ value, allowBlank, onChange, cls, title }) {
    const core = window.IolantheItineraryCore;
    const hour = el("select", { class: "time-h", "aria-label": "Hour", title: title || null });
    const minute = el("select", { class: "time-m", "aria-label": "Minutes", title: title || null });
    const fill = (select, list, current) => select.replaceChildren(...list.map((v) => el("option", { value: v, selected: v === current || undefined }, v === "" ? "—" : v)));
    const set = (v) => {
      const o = core.timeOptions(v, { allowBlank: Boolean(allowBlank) });
      fill(hour, o.hours, o.hour);
      fill(minute, o.minutes, o.minute);
    };
    const get = () => (hour.value === "" ? "" : `${hour.value}:${minute.value || "00"}`);
    const changed = () => {
      if (hour.value === "") minute.value = "";
      else if (minute.value === "") minute.value = "00";
      if (onChange) onChange(get());
    };
    hour.addEventListener("change", changed);
    minute.addEventListener("change", changed);
    set(value || "");
    const root = el("span", { class: `time-selects ${cls || ""}`.trim() }, hour, el("span", { class: "time-colon", "aria-hidden": "true" }, ":"), minute);
    return { root, hour, minute, get, set };
  }

  window.IolantheRoutesUi = Object.freeze({ ICONS, svg, el, fmtPos, openModal, closeModal, timeSelects });
```

- [ ] **Step 2: Parse check and commit.**

```bash
node --check routes-ui.js && git add routes-ui.js && git commit -m "feat(routes-ui): timeSelects hour/minute control (T13)"
```

---

### Task 3: The card — Depart tile wording, default time, time selects; item editor; card keydown (T11, T12, T13, T15)

**Files:** `stop-cards.js`, `stop-cards.css`

- [ ] **Step 1: Header comment.** OLD:

```js
// Routes panel: the stop strip and the stop card (spec A2 §5.4–5.7). Every stop is a stacked edge either side of the
// open card; the card edits the stay (Depart), pins the arrival time, holds the day tabs with the itinerary items and
// the ⚙ settings tab. Created once per bind() by routes.js; the record itself stays in routes.js and is edited only
// through ctx.editRecord.
```

NEW:

```js
// Routes panel: the stop strip and the stop card (spec A2 §5.4–5.7, round 2 T11–T13). Every stop is a stacked edge
// either side of the open card; the card edits the stay and the departure time (Depart), shows the derived arrival,
// holds the day tabs with the itinerary items and the ⚙ settings tab. Created once per bind() by routes.js; the record
// itself stays in routes.js and is edited only through ctx.editRecord.
```

- [ ] **Step 2: ctx comment gains `timeSelects`.** OLD:

```js
  // ctx: { A, core (IolantheItineraryCore), rcore (IolantheRoutesCore), el, svg, openModal, places,
```

NEW:

```js
  // ctx: { A, core (IolantheItineraryCore), rcore (IolantheRoutesCore), el, svg, openModal, timeSelects, places,
```

- [ ] **Step 3: `select` gains `reveal` (T10: the Days tab scrolls the strip into view).** OLD:

```js
    // Opens a card. Spinning to a dirty card clears it (spec A2 D11, no confirm) and the map pans to the stop.
    function select(stopId, opts) {
      const rec = record();
      if (!rec || !stops(rec).some((s) => s.point.id === stopId)) return;
      const o = { pan: true, ...(opts || {}) };
      selectedId = stopId;
      tab = "day";
      closeMenu();
      if (rec.dirty_stop_ids.includes(stopId) && !ctx.readOnly()) {
        ctx.editRecord((r) => ({ ...r, dirty_stop_ids: r.dirty_stop_ids.filter((id) => id !== stopId) }), { history: false, map: false });
      } else {
        render();
      }
      if (o.pan) ctx.panToStop(stopId); else ctx.highlightStop(stopId);
    }
```

NEW:

```js
    // Opens a card. Spinning to a dirty card clears it (spec A2 D11, no confirm) and the map pans to the stop.
    // opts: { pan: true } pans the map; { reveal: true } also scrolls the strip into view (the Days tab, round 2 T10).
    function select(stopId, opts) {
      const rec = record();
      if (!rec || !stops(rec).some((s) => s.point.id === stopId)) return;
      const o = { pan: true, reveal: false, ...(opts || {}) };
      selectedId = stopId;
      tab = "day";
      closeMenu();
      if (rec.dirty_stop_ids.includes(stopId) && !ctx.readOnly()) {
        ctx.editRecord((r) => ({ ...r, dirty_stop_ids: r.dirty_stop_ids.filter((id) => id !== stopId) }), { history: false, map: false });
      } else {
        render();
      }
      if (o.pan) ctx.panToStop(stopId); else ctx.highlightStop(stopId);
      if (o.reveal && host && host.isConnected) host.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
```

- [ ] **Step 4: Remove the card's own arrow handler (T15: the page-wide handler in routes.js takes over).** OLD:

```js
      art.addEventListener("keydown", (e) => {
        if (e.target !== art) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      });
      // A horizontal swipe on the header scrolls the strip (touch and mouse alike).
```

NEW:

```js
      // ← / → are handled page-wide by routes.js (spec A2 round 2 T15), so they work after a click on the map too.
      // A horizontal swipe on the header scrolls the strip (touch and mouse alike).
```

- [ ] **Step 5: The Depart tile.** Replace the whole `departTile` function. OLD:

```js
    // Depart: a date (or day number without a charter) no earlier than the arrival day, and a time. Spec A2 D1, §5.6, §5.7.
    function departTile(stop, rec) {
      const p = stop.point;
      if (!p.depart) {
        const ch = ctx.getCharter();
        return tile("Depart", "—", ch && ch.end_date ? `charter ends ${c.dayDateLabel(ch, c.charterDayCount(ch))}` : "end of route");
      }
      const ch = ctx.getCharter();
      const start = ch ? c.parseDateOnly(ch.start_date) : null;
      const arriveDay = p.arrive ? p.arrive.day : 1;
      const toIso = (day) => new Date(start + (day - 1) * 86400000).toISOString().slice(0, 10);
      const nightsBefore = p.depart.day - arriveDay;
      const dayInput = start !== null
        ? el("input", { type: "date", class: "tile-date edit-only", value: toIso(p.depart.day), min: toIso(arriveDay) })
        : el("input", { type: "number", class: "tile-nights edit-only", value: String(nightsBefore), min: "0", step: "1", "aria-label": "Nights at this stop" });
      const timeInput = el("input", { type: "time", class: "tile-time edit-only", value: p.depart.time || "", title: "Departure time (blank: 09:00 is assumed)" });
      const dayOf = () => {
        if (start === null) { const n = parseInt(dayInput.value, 10); return Number.isInteger(n) && n >= 0 ? arriveDay + n : NaN; }
        const t = c.parseDateOnly(dayInput.value);
        return t === null ? NaN : Math.round((t - start) / 86400000) + 1;
      };
      dayInput.addEventListener("change", async () => {
        const day = dayOf();
        if (!Number.isInteger(day) || day < arriveDay) { render(); return; }
        if (day < p.depart.day) {
          const dropped = c.droppedDays(rec, p.id, day);
          if (dropped.items.length && !(await ctx.askDrop(dropped, "Changing the date"))) { render(); return; }
        }
        ctx.editRecord((r) => c.setDeparture(r, p.id, { day }));
      });
      timeInput.addEventListener("change", () => ctx.editRecord((r) => c.setDeparture(r, p.id, { time: timeInput.value })));
      const nights = p.depart.day - arriveDay;
      return tile("Depart", el("div", { class: "tile-row" }, dayInput, start === null ? el("span", { class: "muted" }, "nights") : null, timeInput), stop.position === "origin" ? (nights ? `${nights} night${nights === 1 ? "" : "s"} aboard before sailing` : "sails on day 1") : (nights ? `${nights} night${nights === 1 ? "" : "s"}` : "day stop"));
    }
```

NEW:

```js
    // Depart (charter mode: a date no earlier than the arrival day) or Stop duration (unassigned route: a nights count),
    // then a "Departure time" label over the hour/minute selects. A stop with no stored time shows the T12 default with
    // "assumed" in the hint; the first stay change stores it. Spec A2 D1, §5.6, §5.7; round 2 T11, T12, T13.
    function departTile(stop, rec) {
      const p = stop.point;
      const ch = ctx.getCharter();
      const start = ch ? c.parseDateOnly(ch.start_date) : null;
      const title = start !== null ? "Depart" : "Stop duration";
      if (!p.depart) {
        return tile(title, "—", ch && ch.end_date ? `charter ends ${c.dayDateLabel(ch, c.charterDayCount(ch))}` : "end of route");
      }
      const arriveDay = p.arrive ? p.arrive.day : 1;
      const toIso = (day) => new Date(start + (day - 1) * 86400000).toISOString().slice(0, 10);
      const nights = p.depart.day - arriveDay;
      const dayInput = start !== null
        ? el("input", { type: "date", class: "tile-date edit-only", value: toIso(p.depart.day), min: toIso(arriveDay) })
        : el("input", { type: "number", class: "tile-nights edit-only", value: String(nights), min: "0", step: "1", "aria-label": "Nights at this stop" });
      const dayOf = () => {
        if (start === null) { const n = parseInt(dayInput.value, 10); return Number.isInteger(n) && n >= 0 ? arriveDay + n : NaN; }
        const t = c.parseDateOnly(dayInput.value);
        return t === null ? NaN : Math.round((t - start) / 86400000) + 1;
      };
      dayInput.addEventListener("change", async () => {
        const day = dayOf();
        if (!Number.isInteger(day) || day < arriveDay) { render(); return; }
        if (day < p.depart.day) {
          const dropped = c.droppedDays(rec, p.id, day);
          if (dropped.items.length && !(await ctx.askDrop(dropped, "Changing the date"))) { render(); return; }
        }
        ctx.editRecord((r) => c.setDeparture(r, p.id, { day }));
      });
      const assumed = !p.depart.time;
      const time = ctx.timeSelects({
        value: p.depart.time || c.defaultDepartTime(rec, p.id), cls: "edit-only",
        title: assumed ? "Assumed until you pick a time" : "Departure time",
        onChange: (v) => ctx.editRecord((r) => c.setDeparture(r, p.id, { time: v }))
      });
      const stay = stop.position === "origin" ? (nights ? `${nights} night${nights === 1 ? "" : "s"} aboard before sailing` : "sails on day 1") : (nights ? `${nights} night${nights === 1 ? "" : "s"}` : "day stop");
      const value = el("div", { class: "depart-stack" },
        el("div", { class: "tile-row" }, dayInput, start === null ? el("span", { class: "muted" }, "nights") : null),
        el("div", { class: "tile-k tile-k2" }, "Departure time"),
        el("div", { class: "tile-row" }, time.root));
      return tile(title, value, assumed ? el("span", {}, stay, el("em", { class: "muted" }, " · assumed")) : stay);
    }
```

- [ ] **Step 6: The item editor uses the time selects.** OLD:

```js
      const title = el("input", { type: "text", class: "edit-title", value: a.title, maxlength: String(c.MAX_TITLE_LENGTH), placeholder: "Title" });
      const time = el("input", { type: "time", class: "edit-time", value: a.time || "" });
      const duration = el("input", { type: "number", class: "edit-duration", value: a.duration_min === undefined ? "" : String(a.duration_min), min: String(c.MIN_DURATION_MIN), max: String(c.MAX_DURATION_MIN), step: "5", placeholder: "60", title: "Duration in minutes (1 h when blank)" });
      const notes = el("textarea", { class: "edit-notes", rows: "2", placeholder: "Notes for guests", maxlength: String(c.MAX_NOTES_LENGTH) }, a.notes || "");
      const done = () => ctx.editRecord((r) => c.updateActivity(r, a.id, { title: title.value, time: time.value, duration_min: duration.value === "" ? "" : Number(duration.value), notes: notes.value }));
      const cancel = () => render();
      const form = el("div", { class: "item-edit" },
        el("div", { class: "item-edit-row" }, title, time, duration, el("span", { class: "muted" }, "min")),
        notes,
        el("div", { class: "icon-row" }, iconBtn("check", "Done (Enter)", done, "success"), iconBtn("cancel", "Cancel (Esc)", cancel, "danger")));
      [title, time, duration, notes].forEach((input) => input.addEventListener("keydown", (e) => {
```

NEW:

```js
      const title = el("input", { type: "text", class: "edit-title", value: a.title, maxlength: String(c.MAX_TITLE_LENGTH), placeholder: "Title" });
      const time = ctx.timeSelects({ value: a.time || "", allowBlank: true, cls: "edit-time", title: "Time (blank: none)" });
      const duration = el("input", { type: "number", class: "edit-duration", value: a.duration_min === undefined ? "" : String(a.duration_min), min: String(c.MIN_DURATION_MIN), max: String(c.MAX_DURATION_MIN), step: "5", placeholder: "60", title: "Duration in minutes (1 h when blank)" });
      const notes = el("textarea", { class: "edit-notes", rows: "2", placeholder: "Notes for guests", maxlength: String(c.MAX_NOTES_LENGTH) }, a.notes || "");
      const done = () => ctx.editRecord((r) => c.updateActivity(r, a.id, { title: title.value, time: time.get(), duration_min: duration.value === "" ? "" : Number(duration.value), notes: notes.value }));
      const cancel = () => render();
      const form = el("div", { class: "item-edit" },
        el("div", { class: "item-edit-row" }, title, time.root, duration, el("span", { class: "muted" }, "min")),
        notes,
        el("div", { class: "icon-row" }, iconBtn("check", "Done (Enter)", done, "success"), iconBtn("cancel", "Cancel (Esc)", cancel, "danger")));
      [title, time.hour, time.minute, duration, notes].forEach((input) => input.addEventListener("keydown", (e) => {
```

- [ ] **Step 7: CSS in `stop-cards.css`.** OLD:

```css
.routes-panel .tile input.tile-nights { width: 64px; min-height: 0; height: 28px; font: inherit; font-size: 13px; font-weight: 700; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; background: #fff; color: var(--ink); }
.routes-panel .tile input:disabled { opacity: .7; }
```

NEW:

```css
.routes-panel .tile input.tile-nights { width: 64px; min-height: 0; height: 28px; font: inherit; font-size: 13px; font-weight: 700; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; background: #fff; color: var(--ink); }
.routes-panel .tile input:disabled, .routes-panel .tile select:disabled { opacity: .7; }
/* Round 2 T9/T11: the stay and the departure time are two labelled rows inside the Depart tile */
.routes-panel .depart-stack { display: flex; flex-direction: column; gap: 4px; }
.routes-panel .tile-k2 { margin-top: 6px; }
/* Round 2 T13: hour and minute selects */
.routes-panel .time-selects { display: inline-flex; align-items: center; gap: 2px; }
.routes-panel .time-selects select { min-height: 0; height: 28px; width: auto; font: inherit; font-size: 13px; font-weight: 700; padding: 0 4px; border: 1px solid var(--line); border-radius: 5px; background: #fff; color: var(--ink); }
.routes-panel .time-colon { font-weight: 700; color: var(--muted); }
```

and the item editor row: OLD:

```css
.routes-panel .item-edit-row { display: grid; grid-template-columns: minmax(0, 1fr) 100px 72px auto; gap: 6px; align-items: center; }
```

NEW:

```css
.routes-panel .item-edit-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 72px auto; gap: 6px; align-items: center; }
.routes-panel .item-edit .time-selects select { height: 26px; font-weight: 400; }
```

- [ ] **Step 8: Parse check and commit.**

```bash
node --check stop-cards.js && git add stop-cards.js stop-cards.css && git commit -m "feat(stop-cards): Stop duration wording, Departure time label, assumed default time, hour/minute selects, item time selects (T11-T13)"
```

---

### Task 4: The Days tab — stop headers inside the sub-boxes, gaps (T8, T9)

**Files:** `routes-days.js`, `routes.css`

- [ ] **Step 1: Header comment.** OLD:

```js
// Routes panel: the read-only Days tab (spec A2 §5.2). The spec A tube-line day view: stop titles left, the line, day
// boxes with one sub-box per stop holding that day's items. No editing here; stops and items are edited on the cards.
// Created once per bind() by routes.js.
```

NEW:

```js
// Routes panel: the read-only Days tab (spec A2 §5.2, round 2 T8). The tube line on the left, day boxes on the right with
// one sub-box per stop and day; each sub-box is headed by the stop's name and that day's Arr/Dep line, then the items.
// No editing here; stops and items are edited on the cards. Created once per bind() by routes.js.
```

- [ ] **Step 2: `subBox` and `dayBox` take the times.** OLD:

```js
    function subBox(stop, day) {
      return el("div", { class: "days-sub", "data-stop-id": stop.id, "data-day": String(day) }, ...stop.activities.map(itemRow));
    }
```

NEW:

```js
    // stop: a deriveDays() stop entry ({ id, name, arrive, depart, activities }); times: estimateTimes() map.
    function subBox(stop, day, times) {
      const label = c.subBoxTimesLabel(stop, times.get(stop.id), day);
      return el("div", { class: "days-sub", "data-stop-id": stop.id, "data-day": String(day) },
        el("div", { class: "days-sub-head", onclick: () => ctx.onStopClick(stop.id) },
          el("span", { class: "days-stop-name" }, stop.name || "Stop"),
          label ? el("span", { class: `days-stop-times muted${/~/.test(label) ? " est" : ""}` }, label) : null),
        ...stop.activities.map(itemRow));
    }
```

and OLD:

```js
    function dayBox(record, day) {
      const charter = ctx.getCharter();
      const date = charter ? c.dayDateLabel(charter, day.day) : "";
      return el("div", { class: "days-day", "data-day": String(day.day) },
        el("div", { class: "days-day-title" }, `Day ${day.day}`, date ? el("span", { class: "muted" }, ` · ${date}`) : null),
        ...day.stops.map((stop) => subBox(stop, day.day)),
        day.stops.length ? null : el("div", { class: "days-passage muted" }, passageLabel(record, day.day)));
    }
```

NEW:

```js
    function dayBox(record, day, times) {
      const charter = ctx.getCharter();
      const date = charter ? c.dayDateLabel(charter, day.day) : "";
      return el("div", { class: "days-day", "data-day": String(day.day) },
        el("div", { class: "days-day-title" }, `Day ${day.day}`, date ? el("span", { class: "muted" }, ` · ${date}`) : null),
        ...day.stops.map((stop) => subBox(stop, day.day, times)),
        day.stops.length ? null : el("div", { class: "days-passage muted" }, passageLabel(record, day.day)));
    }
```

- [ ] **Step 3: `drawLine` no longer places titles.** Replace the whole function. OLD:

```js
    // Measures each sub-box, asks core for the geometry, then draws the SVG and places the titles.
    function drawLine(board, record, daysList) {
      const svg = board.querySelector(".days-line");
      const titles = board.querySelector(".days-titles");
      const list = board.querySelector(".days-list");
      const boardTop = board.getBoundingClientRect().top;
      const centres = new Map();
      list.querySelectorAll(".days-sub").forEach((node) => {
        const r = node.getBoundingClientRect();
        centres.set(`${node.dataset.stopId}:${node.dataset.day}`, r.top + r.height / 2 - boardTop);
      });
      const height = Math.max(list.offsetHeight, 1);
      svg.setAttribute("viewBox", `0 0 32 ${height}`);
      svg.setAttribute("width", "32");
      svg.setAttribute("height", String(height));
      svg.replaceChildren();
      titles.replaceChildren();
      titles.style.height = `${height}px`;
      const geo = c.lineGeometry(daysList, centres);
      if (!geo.shapes.length) return;
      const stopsById = new Map(c.stopEntries(record.route.points).map((e) => [e.point.id, e.point]));
      const times = c.estimateTimes(record);
      svg.append(svgEl("line", { class: "days-trunk", x1: LINE_X, y1: geo.top, x2: LINE_X, y2: geo.bottom }));
      geo.shapes.forEach((shape) => {
        if (shape.terminal === "origin") {
          svg.append(svgEl("path", { class: "days-terminal", d: `M ${LINE_X - 7} ${shape.y1 - 12} V ${shape.y2} A 7 7 0 0 0 ${LINE_X + 7} ${shape.y2} V ${shape.y1 - 12}` }));
        } else if (shape.terminal === "terminus") {
          svg.append(svgEl("path", { class: "days-terminal", d: `M ${LINE_X - 7} ${shape.y2 + 12} V ${shape.y1} A 7 7 0 0 1 ${LINE_X + 7} ${shape.y1} V ${shape.y2 + 12}` }));
        } else if (shape.kind === "loop") {
          svg.append(svgEl("rect", { class: "days-loop", x: LINE_X - LOOP_W / 2, y: shape.y1 - 7, width: LOOP_W, height: shape.y2 - shape.y1 + 14, rx: 7 }));
        } else {
          svg.append(svgEl("circle", { class: "days-dot", cx: LINE_X, cy: shape.y1, r: DOT_R }));
        }
        const stop = stopsById.get(shape.stopId);
        if (!stop) return;
        const label = c.stopTimesLabel(stop, times.get(shape.stopId));
        const title = el("div", { class: "days-stop-title", "data-stop-id": shape.stopId, onclick: () => ctx.onStopClick(shape.stopId) },
          el("div", { class: "days-stop-name" }, stop.name || "Stop"),
          el("div", { class: `days-stop-times muted${/~/.test(label) ? " est" : ""}` }, label));
        title.style.top = `${(shape.y1 + shape.y2) / 2}px`;
        titles.append(title);
        svg.lastElementChild.classList.add("days-clickable");
        svg.lastElementChild.addEventListener("click", () => ctx.onStopClick(shape.stopId));
      });
    }
```

NEW:

```js
    // Measures each sub-box, asks core for the geometry, then draws the SVG (the names live in the sub-box headers, T8).
    function drawLine(board, daysList) {
      const svg = board.querySelector(".days-line");
      const list = board.querySelector(".days-list");
      const boardTop = board.getBoundingClientRect().top;
      const centres = new Map();
      list.querySelectorAll(".days-sub").forEach((node) => {
        const r = node.getBoundingClientRect();
        centres.set(`${node.dataset.stopId}:${node.dataset.day}`, r.top + r.height / 2 - boardTop);
      });
      const height = Math.max(list.offsetHeight, 1);
      svg.setAttribute("viewBox", `0 0 32 ${height}`);
      svg.setAttribute("width", "32");
      svg.setAttribute("height", String(height));
      svg.replaceChildren();
      const geo = c.lineGeometry(daysList, centres);
      if (!geo.shapes.length) return;
      svg.append(svgEl("line", { class: "days-trunk", x1: LINE_X, y1: geo.top, x2: LINE_X, y2: geo.bottom }));
      geo.shapes.forEach((shape) => {
        if (shape.terminal === "origin") {
          svg.append(svgEl("path", { class: "days-terminal", d: `M ${LINE_X - 7} ${shape.y1 - 12} V ${shape.y2} A 7 7 0 0 0 ${LINE_X + 7} ${shape.y2} V ${shape.y1 - 12}` }));
        } else if (shape.terminal === "terminus") {
          svg.append(svgEl("path", { class: "days-terminal", d: `M ${LINE_X - 7} ${shape.y2 + 12} V ${shape.y1} A 7 7 0 0 1 ${LINE_X + 7} ${shape.y1} V ${shape.y2 + 12}` }));
        } else if (shape.kind === "loop") {
          svg.append(svgEl("rect", { class: "days-loop", x: LINE_X - LOOP_W / 2, y: shape.y1 - 7, width: LOOP_W, height: shape.y2 - shape.y1 + 14, rx: 7 }));
        } else {
          svg.append(svgEl("circle", { class: "days-dot", cx: LINE_X, cy: shape.y1, r: DOT_R }));
        }
        svg.lastElementChild.classList.add("days-clickable");
        svg.lastElementChild.addEventListener("click", () => ctx.onStopClick(shape.stopId));
      });
    }
```

- [ ] **Step 4: `render` builds a two-column board.** OLD:

```js
      const daysList = c.deriveDays(record, n);
      const board = el("div", { class: "days-board" },
        el("div", { class: "days-titles" }),
        svgEl("svg", { class: "days-line", "aria-hidden": "true" }),
        el("div", { class: "days-list" }, ...daysList.map((d) => dayBox(record, d))));
      box.replaceChildren(board);
      const draw = () => { if (box && box.contains(board) && board.offsetWidth) drawLine(board, record, daysList); };
```

NEW:

```js
      const daysList = c.deriveDays(record, n);
      const times = c.estimateTimes(record);
      const board = el("div", { class: "days-board" },
        svgEl("svg", { class: "days-line", "aria-hidden": "true" }),
        el("div", { class: "days-list" }, ...daysList.map((d) => dayBox(record, d, times))));
      box.replaceChildren(board);
      const draw = () => { if (box && box.contains(board) && board.offsetWidth) drawLine(board, daysList); };
```

- [ ] **Step 5: CSS in `routes.css`.** OLD:

```css
.routes-panel .days-board { display: grid; grid-template-columns: minmax(70px, 110px) 32px minmax(0, 1fr); gap: 0 6px; position: relative; align-items: start; }
.routes-panel .days-titles { position: relative; }
.routes-panel .days-line { display: block; overflow: visible; }
.routes-panel .days-list { display: flex; flex-direction: column; }
.routes-panel .days-stop-title { position: absolute; right: 0; transform: translateY(-50%); text-align: right; max-width: 100%; cursor: pointer; }
.routes-panel .days-stop-name { font-weight: 700; font-size: 12px; line-height: 1.2; }
.routes-panel .days-stop-times { font-size: 10.5px; line-height: 1.3; white-space: normal; }
.routes-panel .days-stop-times.est { font-style: italic; }
```

NEW:

```css
.routes-panel .days-board { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 0 6px; position: relative; align-items: start; }   /* T8: no titles column */
.routes-panel .days-line { display: block; overflow: visible; }
.routes-panel .days-list { display: flex; flex-direction: column; gap: 8px; }   /* T9: a gap between day boxes */
.routes-panel .days-sub-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; cursor: pointer; }
.routes-panel .days-stop-name { font-weight: 700; font-size: 12px; line-height: 1.2; }
.routes-panel .days-stop-times { font-size: 10.5px; line-height: 1.3; white-space: normal; }
.routes-panel .days-stop-times.est { font-style: italic; }
```

and OLD:

```css
.routes-panel .days-day { background: var(--day); border: 1.4px solid var(--day-border); border-radius: 6px; padding: 6px 8px 8px; }
.routes-panel .days-day + .days-day { border-top-left-radius: 0; border-top-right-radius: 0; border-top: none; }
.routes-panel .days-day:first-child:not(:last-child) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.routes-panel .days-day:not(:first-child):not(:last-child) { border-radius: 0; }
```

NEW:

```css
.routes-panel .days-day { background: var(--day); border: 1.4px solid var(--day-border); border-radius: 6px; padding: 6px 8px 8px; }
```

- [ ] **Step 6: Parse check and commit.**

```bash
node --check routes-days.js && git add routes-days.js routes.css && git commit -m "feat(days): stop name and times inside each sub-box, titles column gone, gaps between days (T8, T9)"
```

---

### Task 5: Route page — line → card → map with zoom, page-wide arrow keys (T10, T15)

**Files:** `routes.js`

- [ ] **Step 1: A zoom constant.** OLD:

```js
  const MAP_CENTER = [12.1, 120.0];
```

NEW:

```js
  const MAP_CENTER = [12.1, 120.0];
  const STOP_ZOOM = 13;   // selecting a card zooms in at least this far (spec A2 round 2 T10)
```

- [ ] **Step 2: Leaflet keyboard panning off.** OLD:

```js
    map = L.map(container, { zoomControl: false }).setView(MAP_CENTER, 10);
```

NEW:

```js
    map = L.map(container, { zoomControl: false, keyboard: false }).setView(MAP_CENTER, 10);   // ← / → step the strip (T15)
```

- [ ] **Step 3: `panToStop` zooms as well.** OLD:

```js
  function panToStop(stopId) {
    const i = work.route.points.findIndex((p) => p.id === stopId);
    if (map && i >= 0 && pointMarkers[i]) { map.closePopup(); map.panTo(pointMarkers[i].getLatLng()); }
    highlightStop(stopId);
  }
```

NEW:

```js
  function panToStop(stopId) {
    const i = work.route.points.findIndex((p) => p.id === stopId);
    if (map && i >= 0 && pointMarkers[i]) { map.closePopup(); map.setView(pointMarkers[i].getLatLng(), Math.max(map.getZoom(), STOP_ZOOM)); }
    highlightStop(stopId);
  }
```

- [ ] **Step 4: The page-wide handler steps the strip.** OLD:

```js
  function bindKeyboard() {
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    keyHandler = (e) => {
      if (!panel || !panel.isConnected || !work) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) return;
      if (document.querySelector(".routes-modal, .admin-decision-backdrop, #dialog-modal:not(.hidden)")) return;
      const key = (e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    document.addEventListener("keydown", keyHandler);
  }
```

NEW:

```js
  // Undo/redo and, since round 2 T15, ← / → to step the strip from anywhere on the page (not inside a field or a dialog).
  function bindKeyboard() {
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    keyHandler = (e) => {
      if (!panel || !panel.isConnected || !work) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) return;
      if (document.querySelector(".routes-modal, .admin-decision-backdrop, #dialog-modal:not(.hidden)")) return;
      const key = (e.key || "").toLowerCase();
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (plain && e.key === "ArrowLeft" && cards) { e.preventDefault(); cards.step(-1); }
      else if (plain && e.key === "ArrowRight" && cards) { e.preventDefault(); cards.step(1); }
    };
    document.addEventListener("keydown", keyHandler);
  }
```

- [ ] **Step 5: The Days tab reveals the card.** OLD:

```js
      onStopClick: (stopId) => { if (cards) cards.select(stopId); }
```

NEW:

```js
      onStopClick: (stopId) => { if (cards) cards.select(stopId, { reveal: true }); }   // T10: scroll the strip into view and zoom the map
```

- [ ] **Step 6: Pass `timeSelects` to the cards.** OLD:

```js
    cards = window.IolantheStopCards.create({
      A: A(), core: icore(), rcore: core(), el, svg, openModal, places: myPlaces,
```

NEW:

```js
    cards = window.IolantheStopCards.create({
      A: A(), core: icore(), rcore: core(), el, svg, openModal, timeSelects: window.IolantheRoutesUi.timeSelects, places: myPlaces,
```

- [ ] **Step 7: Parse check and commit.**

```bash
node --check routes.js && git add routes.js && git commit -m "feat(routes): page-wide arrow keys, Leaflet keyboard off, select zooms and reveals the card (T10, T15)"
```

---

### Task 6: The Start from… dialog (T14)

**Files:** `routes.js`, `routes.css`

- [ ] **Step 1: Replace `openStartFrom` from its comment down to the end of the `onSave` handler's `reportError(error); return false;` branch.** Find the OLD block that starts with:

```js
  // Spec A2 §5.8: import an unassigned route or another charter's record from a day. The server re-bases its days
  // onto the from-day and brings its items unless stripped; nothing is refused for length (the fit pill reports).
  // Spec A2 T7: open this charter's route with the Start from… dialog preselecting the route being edited.
  async function assignToCharter() {
```

and ends with the end of `openStartFrom` (the FIRST block below that occurs after the start; the Save handler earlier in the file ends the same way):

```js
          reportError(error);
          return false;
        } finally {
          saving = false;
          if (panel === mine && mine.isConnected && work) renderActions();
        }
      }
    });
  }
```

Replace that whole span (both functions) with:

```js
  // Spec A2 §5.8 / round 2 T14: import an unassigned route or another charter's record from a day. One grouped dropdown
  // for the record (unassigned routes, then charters by year, newest first), "Starting on", a "Bring its items" switch and
  // a result line from fitSentence. The server re-bases the record's days onto the from-day and brings its items unless
  // stripped; nothing is refused for length. A charter source's record is fetched when it is chosen.
  // Spec A2 T7: open this charter's route with the Start from… dialog preselecting the route being edited.
  async function assignToCharter() {
    if (!work || !work.route.id) return;
    if (!(await guardDiscard())) return;
    await A().showCharterPanel("routes", { subject: "charter", startFrom: work.route.id });
  }

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  async function openStartFrom(preselectId) {
    if (!work || saving || !isCharter()) return;
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    if (!(await guardDiscard())) return;
    const n = dayCount();
    if (!n) { status("Set the charter's start and end dates first.", "error"); return; }
    const mine = panel;
    let charters = [];
    try {
      const [routeData, charterData] = await Promise.all([A().api("/api/admin/routes"), A().api("/api/admin/charters")]);
      if (panel !== mine || !mine.isConnected) return;
      routes = Array.isArray(routeData.routes) ? routeData.routes : [];
      charters = (Array.isArray(charterData.charters) ? charterData.charters : []).filter((c) => c.id !== subject.charterId && c.stops > 0);
    } catch (error) { reportError(error); return; }
    const record = toRecord(work.route);
    const today = (() => {
      const start = icore().parseDateOnly(subject.charter.start_date);
      if (start === null) return 1;
      return Math.min(Math.max(Math.floor((Date.now() - start) / 86400000) + 1, 1), n);
    })();
    const hasStops = icore().stopEntries(record.route.points).length > 0;

    // Sources by option value: { kind, id, name, stops, record } — a charter's record is null until fetched.
    const sources = new Map();
    const withStops = routes.filter((r) => r.points.some(core().isStop)).sort((a, b) => a.name.localeCompare(b.name));
    withStops.forEach((r) => sources.set(`library:${r.id}`, { kind: "library", id: r.id, name: r.name, stops: r.points.filter(core().isStop).length, record: toRecord({ ...r, revision: 0 }) }));
    const startOf = (ch) => icore().parseDateOnly(ch.charter && ch.charter.start_date);
    const yearOf = (ch) => { const t = startOf(ch); return t === null ? null : new Date(t).getUTCFullYear(); };
    const monthOf = (ch) => { const t = startOf(ch); return t === null ? "" : MONTHS[new Date(t).getUTCMonth()]; };
    const byDate = charters.slice().sort((a, b) => (startOf(b) || 0) - (startOf(a) || 0) || a.name.localeCompare(b.name));
    byDate.forEach((ch) => sources.set(`charter:${ch.id}`, { kind: "charter", id: ch.id, name: ch.name, stops: ch.stops, record: null }));
    const years = [...new Set(byDate.map(yearOf).filter((y) => y !== null))].sort((a, b) => b - a);
    const option = (value, text) => el("option", { value }, text);
    const group = (label, options) => (options.length ? el("optgroup", { label }, ...options) : null);
    const select = el("select", { id: "routes-source" },
      group("Unassigned routes", withStops.map((r) => option(`library:${r.id}`, `${r.name} · ${plural(sources.get(`library:${r.id}`).stops, "stop")}`))),
      ...years.map((y) => group(`Charters ${y}`, byDate.filter((ch) => yearOf(ch) === y).map((ch) => option(`charter:${ch.id}`, `${ch.name} · ${monthOf(ch)} · ${plural(ch.stops, "stop")}`)))),
      group("Charters", byDate.filter((ch) => yearOf(ch) === null).map((ch) => option(`charter:${ch.id}`, `${ch.name} · ${plural(ch.stops, "stop")}`))));
    if (preselectId && sources.has(`library:${preselectId}`)) select.value = `library:${preselectId}`;

    const fromDay = el("select", { id: "routes-from-day" }, ...Array.from({ length: n }, (_, i) => el("option", { value: String(i + 1), selected: i + 1 === (hasStops ? today : 1) || undefined }, `Day ${i + 1} · ${icore().dayDateLabel(subject.charter, i + 1)}`)));
    const bring = el("input", { type: "checkbox", id: "routes-bring-items" });
    let bringTouched = false;
    bring.addEventListener("change", () => { bringTouched = true; });
    const bringLabel = el("span", {}, "Bring its items");
    const itemsField = el("div", { class: "field" }, el("label", { for: "routes-bring-items" }, "Itinerary items"), el("label", { class: "switch-row" }, bring, bringLabel));
    const dot = el("span", { class: "result-dot" });
    const line1 = el("div", { class: "result-l1" });
    const line2 = el("div", { class: "result-l2 muted" });
    const result = el("div", { class: "result" }, dot, el("div", { class: "result-text" }, line1, line2));

    const chosen = () => sources.get(select.value) || null;
    const recordOf = async (src) => {
      if (src.record) return src.record;
      const bundle = await A().api(`/api/admin/charter/${encodeURIComponent(src.id)}`);
      src.record = icore().normalizeItinerary(bundle["itinerary.json"]);
      return src.record;
    };
    const refresh = async () => {
      const src = chosen();
      if (!src) return;
      let rec = src.record;
      if (!rec) {
        line1.textContent = "Loading…";
        line2.textContent = "";
        try { rec = await recordOf(src); } catch (error) { reportError(error); line1.textContent = "Could not load that charter."; return; }
        if (chosen() !== src) return;
      }
      const items = rec.activities.length;
      bringLabel.textContent = items ? `Bring its ${plural(items, "item")}` : "Bring its items";
      itemsField.hidden = items === 0;
      if (!bringTouched) bring.checked = src.kind === "library";
      const day = Number(fromDay.value);
      const f = icore().fit(icore().rebaseRecord(rec, day), subject.charter);
      const s = icore().fitSentence(f, subject.charter, { stops: src.stops, fromDay: day, kept: icore().keptStopsBefore(record, day, n) });
      dot.className = `result-dot ${s.tone}`;
      line1.textContent = s.line1;
      line2.textContent = s.line2;
    };
    select.addEventListener("change", refresh);
    fromDay.addEventListener("change", refresh);
    refresh();

    openModal({
      title: "Start from…", saveTitle: "Import", wide: true,
      body: sources.size
        ? el("div", {},
          el("div", { class: "field" }, el("label", { for: "routes-source" }, "Record"), select),
          el("div", { class: "grid2" },
            el("div", { class: "field" }, el("label", { for: "routes-from-day" }, "Starting on"), fromDay),
            itemsField),
          result)
        : el("div", { class: "result" }, el("span", { class: "result-dot none" }), el("div", { class: "result-text" }, el("div", { class: "result-l1" }, "No unassigned routes or other charters with stops yet"))),
      onSave: sources.size ? async () => {
        const src = chosen();
        if (!src) { status("Pick a record to start from.", "error"); return false; }
        const day = Number(fromDay.value);
        const dropped = icore().itemsDroppedByImport(record, day, n);
        if (dropped.length && !(await askDrop({ days: [...new Set(dropped.map((a) => a.day))].sort((a, b) => a - b), items: dropped }, `Starting from day ${day}`))) return false;
        saving = true;
        renderActions();
        try {
          const { itinerary } = await post(`/api/admin/charter/${encodeURIComponent(subject.charterId)}/itinerary/import`, { source: { type: src.kind, id: src.id }, from_day: day, strip_items: !bring.checked, base_revision: work.baseRevision });
          if (panel !== mine || !mine.isConnected) return true;
          subject = { ...subject, itinerary };
          setWork(charterRouteFromItinerary(itinerary));
          afterPersist();
          const f = icore().fit(toRecord(work.route), subject.charter);
          status(`Started from "${src.name}" on day ${day} · revision ${itinerary.revision}${f.state === "match" ? " · fits the charter" : f.state === "none" ? "" : ` · ${f.label}`}`, "ok");
          return true;
        } catch (error) {
          if (error.status === 409) {
            const reload = await A().showAdminConfirm({ title: "Itinerary changed elsewhere", message: `${error.message} Reload to see the latest?`, confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning" });
            if (reload) await A().showCharterPanel("routes", { subject: "charter" });
            return true;
          }
          reportError(error);
          return false;
        } finally {
          saving = false;
          if (panel === mine && mine.isConnected && work) renderActions();
        }
      } : undefined
    });
  }
```

The server's import takes `source.type` as `"library"` or `"charter"`, which is what `src.kind` holds; the previous code split the same values out of the radio value.

- [ ] **Step 2: Result-line styles in `routes.css`.** OLD:

```css
.routes-modal .switch-row input[type=checkbox] { width: 16px; height: 16px; min-height: 0; padding: 0; margin: 0; flex: none; }
```

NEW:

```css
.routes-modal .switch-row input[type=checkbox] { width: 16px; height: 16px; min-height: 0; padding: 0; margin: 0; flex: none; }
/* Round 2 T14: the Start from… result line */
.routes-modal .result { display: flex; align-items: center; gap: 10px; background: var(--soft); border-radius: 8px; padding: 10px 12px; }
.routes-modal .result-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--line); flex: none; }
.routes-modal .result-dot.ok { background: var(--ok); }
.routes-modal .result-dot.warn { background: #d9a400; }
.routes-modal .result-text { min-width: 0; }
.routes-modal .result-l1 { font-weight: 600; font-size: 14px; line-height: 1.35; }
.routes-modal .result-l2 { font-size: 12px; line-height: 1.35; }
.routes-modal .field .switch-row { padding-top: 8px; }
```

- [ ] **Step 3: Parse check, tests, commit.**

```bash
node --check routes.js && node --test 2>&1 | grep -E "ℹ (pass|fail)" && git add routes.js routes.css && git commit -m "feat(routes): Start from dialog as one grouped dropdown with a result line (T14)"
```

Expected `ℹ pass 117`.

---

### Task 7: Housekeeping — dead selector, asset version, docs

**Files:** `admin.js` (conditional), `index.html`, `CLAUDE.md`

- [ ] **Step 1 (only if `git status --short admin.js` prints nothing):** in `admin.js`, remove the one line `    #panel-itinerary .itinerary-preview-list,` from the selector list that starts `#panel-menu .menu-subtitle,` (around line 1031). Nothing in the admin creates `#panel-itinerary` any more (`grep -n "panel-itinerary" admin.js index.html admin.css` must then return nothing). If admin.js is dirty, skip this step and report it.

- [ ] **Step 2: Asset version.** In `index.html` replace every `?v=admin-itin-a2c` with `?v=admin-itin-a2d` (15 occurrences: 3 stylesheets, 12 scripts).

```bash
sed -i 's/?v=admin-itin-a2c/?v=admin-itin-a2d/g' index.html && grep -c "admin-itin-a2d" index.html
```

Expected `15`.

- [ ] **Step 3: `CLAUDE.md`.** OLD:

```
  - `routes-days.js` — the read-only Days tab (tube line and day boxes)
```

NEW:

```
  - `routes-days.js` — the read-only Days tab (tube line; day boxes whose sub-boxes carry the stop name and times)
```

and OLD:

```
- `node --test` runs the tests in `test/` (110 tests), which cover `routes-core` and `itinerary-core`
```

NEW:

```
- `node --test` runs the tests in `test/` (117 tests), which cover `routes-core` and `itinerary-core`
```

- [ ] **Step 4: Commit.**

```bash
git add index.html CLAUDE.md admin.js && git commit -m "chore: asset version admin-itin-a2d, dead #panel-itinerary selector, CLAUDE.md"
```

(Drop `admin.js` from the `git add` if step 1 was skipped.)

---

### Task 8: Server — the seed moves to 07:00

**Repo:** `S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server`. **Files:** `lib/itinerary.js`, `test/itinerary.test.js`

- [ ] **Step 1: Branch.**

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server"
git checkout main && git pull && git checkout -b feat/seed-depart-0700 && node --test 2>&1 | grep -E "ℹ (pass|fail)"
```

Expected `ℹ pass 92`.

- [ ] **Step 2: The constant.** OLD:

```js
const SEED_DEPART_TIME = "09:00";   // only used to estimate midnight crossings when a template stop has no depart_time
```

NEW:

```js
const SEED_DEPART_TIME = "07:00";   // only used to estimate midnight crossings when a stop has no departure time (admin round 2 T12)
```

and OLD:

```js
// How many midnights a leg of `hours` crosses when it starts at departTime (default 09:00).
```

NEW:

```js
// How many midnights a leg of `hours` crosses when it starts at departTime (default 07:00).
```

- [ ] **Step 3: The test.** OLD:

```js
  assert.equal(lib.extraDaysForLeg(undefined, 16), 1);   // default 09:00 + 16h = 01:00 next day
```

NEW:

```js
  assert.equal(lib.extraDaysForLeg(undefined, 16), 0);   // default 07:00 + 16h = 23:00, same day
  assert.equal(lib.extraDaysForLeg(undefined, 18), 1);   // default 07:00 + 18h = 01:00 next day
```

- [ ] **Step 4: Run, commit, push, PR.**

```bash
node --test 2>&1 | grep -E "ℹ (pass|fail)"
git add lib/itinerary.js test/itinerary.test.js && git commit -m "fix(itinerary): assumed departure time 07:00, matching the admin (spec A2 round 2 T12)"
git push -u origin feat/seed-depart-0700
```

Expected `ℹ pass 92`. The PR is opened by this session; after David's merge: `ssh docker-vm`, `cd /opt/projects/vessel/iolanthe-server && git pull --ff-only && docker compose up -d --build iolanthe-server`.

---

### Task 9: Browser verification (this session, scratch server)

Start `iolanthe-server-scratch` (`.claude/launch.json`), log in as Charter Admin, open Charter → Route on charter `csaba` (7 stops / 13 items, 2026-11-01..09). Check, with a screenshot of each as proof:

- [ ] **T14** Start from…: the Record dropdown shows "Unassigned routes" (coron-loop, culion-run, places-test, E2E csaba copy) then "Charters 2026 · Larry · Dec · 3 stops"; the result line updates on record and day changes; green for a fitting route, amber short/over with the charter end date in line 2; choosing Larry fetches its record and shows "Bring its 3 items"; a route with no items hides the switch; Starting on day 4 says "Keeps the K stops reached before Wed 4 Nov"; import with the switch on brings items, off strips them; "Assign to this charter" from an unassigned route preselects it; with every source removed (temporarily rename `data-scratch/library/routes.json` and use a charter with no other charter) the grey "No unassigned routes…" line shows and there is no ✓.
- [ ] **T13** the Depart tile shows hour and minute selects; changing one stores the time and the Days tab and Next-leg tile follow; an off-grid stored time (set one to 09:20 by editing `data-scratch/charters/csaba/itinerary.json`) shows as an extra minute option; an item's time selects allow blank and store a time.
- [ ] **T11/T12** on an unassigned route the tile reads "Stop duration" with "nights"; on both, "Departure time" sits above the selects; a stop with no stored time shows the default and "· assumed" in the hint; changing its nights stores the default (the hint loses "assumed").
- [ ] **T8/T9** Days tab: each sub-box starts with the stop name and the right times line (arrival day, middle day "N nights", departure day); 8-px gaps between day boxes; no titles column; the tube line still aligns with the sub-boxes after the strip resizes.
- [ ] **T10** clicking a sub-box header or a tube-line dot scrolls the strip into view, opens the card and zooms the map to at least 13; the ◀ ▶ buttons and edges also zoom.
- [ ] **T15** click on the map, then press ← and →: the cards step; with the cursor in a text input or a select they do not; with a dialog open they do not; Leaflet no longer pans on the arrows.
- [ ] Housekeeping: drop a stop onto a *different* anchorage (snap path); every admin panel loads clean (no console errors); phone width (375 px) for the dialog and the Depart tile.
- [ ] `node --test` → 117.

Then PR `feat/itinerary-a2-round2` → `main`; merge on David's word; verify the vessel serves `admin-itin-a2d` within 5 minutes.
