# Spec B — Plan 3: Admin (the Guest view tab) + the release

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply [spec-b.md](../spec-b.md) §3 to `iolanthe-admin`: a **Guest view** tab in the Charter section showing the live guest site in a same-origin iframe (`/?preview=<date>&charter=<id>#<tab>`) under a day slider (day before boarding … day after the charter), with phone / tablet sizes, reload and open-full-screen; eye buttons on the Charter Info and Route headers open it. Then the browser verification of plans b-01 … b-03 and the release.

**Architecture:** Pure logic (steps, the stop slept at each night, default step, URL, scale) in a new UMD module `guest-preview-core.js` with `node --test` coverage. The panel is a new browser module `guest-preview.js` (`window.IolantheGuestPreviewPanel.render()` / `.bind(ctx)`, DOM built with its own `el()`, Route-panel-style square icon buttons) with its own `guest-preview.css` scoped under `.guest-preview`. `admin.js` adds the panel to `renderCharter` and passes the context; `routes.js` adds the eye button through the existing `IolantheAdmin.showCharterPanel` (which already runs the unsaved-changes prompt).

**Tech Stack:** Plain JS, no build, `node --test` (140 tests → 146). Admin repo from `main` at `8388b6a` or later. Plans b-01 (server) and b-02 (guest) run first; this plan's browser task needs all three worktrees.

**Dry-run (done while planning):** every block below was applied from this plan's text onto a copy of the committed repo: `node --test` 146/146; `node --check` clean on `guest-preview-core.js`, `guest-preview.js`, `admin.js`, `routes.js`, `routes-ui.js`, `stop-cards.js`.

**Shared checkout hazard:** another Claude session works in the same checkouts. **Never** run `git checkout`, `git switch`, `git stash` or `git add -A` in `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin`. All work happens in the worktree made in Task 0. Stage files by name. Before each task run `git -C <worktree> branch --show-current` and expect `feat/spec-b-admin`.

**Reading before you start (in the worktree):** `charters-core.js` (UMD wrapper), `routes-ui.js` (`el`, `ICONS`), `admin.js` `renderCharterInfoPanel` (~4633), `bindCharterInfoPanel` (search `charter-delete`), `charterPanelContent` / `bindCharterPanel` / `renderCharter` / `showCharterPanel` (~6497–6610), `adminToday` (~1628), `charterInfoHeaderState` (~4601); `routes.js` `renderActions` (~317); `stop-cards.js` (`activeDay`, the return line); `index.html`.

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `guest-preview-core.js` (new) + `test/guest-preview-core.test.js` (new) | Task 1: `overnightName`, `previewSteps`, `defaultStepIndex`, `stepIndexForDay`, `stepIndexForDate`, `previewUrl`, `fitScale`, `DEVICES` |
| `guest-preview.js` (new), `guest-preview.css` (new) | Task 2: the panel (header, slider strip, stage) |
| `admin.js` | Task 3: the tab, its context, the Charter Info eye button, `showCharterPanel` `previewDay` |
| `routes.js`, `routes-ui.js`, `stop-cards.js` | Task 4: the Route header eye button opening the open card's day |
| `index.html`, `CLAUDE.md` | Task 5: the new files, `?v=admin-preview-1`, docs |

---

### Task 0: Worktree and the spec-b test server (this session runs it, not an implementer)

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin"
git fetch -q origin
git worktree add "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-b/portal/iolanthe-admin" -b feat/spec-b-admin origin/main
cd "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-b/portal/iolanthe-admin" && node --test 2>&1 | grep -E "^ℹ (pass|fail)"
cp -r "S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server/data-scratch" "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-b/data-scratch-b"
```

Expected `ℹ pass 140`. Then add this configuration to the `configurations` list in `S:/Users/David/OneDrive/Maker Space/GitHub/.claude/launch.json` (keep the existing one). Port 8010 never collides with the other session's 8000, and the data copy means two servers never write the same files. The relative static dirs resolve inside `worktrees/spec-b/`, i.e. to the guest and admin worktrees.

```json
{
  "name": "iolanthe-server-specb",
  "runtimeExecutable": "powershell",
  "runtimeArgs": [
    "-NoProfile",
    "-Command",
    "Set-Location 'S:\\Users\\David\\OneDrive\\Maker Space\\GitHub\\worktrees\\spec-b\\iolanthe\\iolanthe-server'; $env:PORT='8010'; $env:DATA_DIR='S:\\Users\\David\\OneDrive\\Maker Space\\GitHub\\worktrees\\spec-b\\data-scratch-b'; $env:GUEST_STATIC_DIR='..\\..\\portal\\iolanthe-guest'; $env:ADMIN_STATIC_DIR='..\\..\\portal\\iolanthe-admin'; node server.js"
  ],
  "port": 8010
}
```

---

### Task 1: `guest-preview-core.js` and its tests

**Files:** create `guest-preview-core.js`, create `test/guest-preview-core.test.js`

- [ ] **Step 1: Write the failing test.** Create `test/guest-preview-core.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../guest-preview-core.js");

const P = (name, extra) => ({ latitude: 12, longitude: 120, stop: true, name, ...(extra || {}) });
// Cebu (sails day 1) → Oslob (1 night) → Apo (2 nights) → overnight passage → Tubbataha (terminus, arrives day 6).
const points = [
  P("Cebu", { depart: { day: 1 } }),
  P("Oslob", { arrive: { day: 1 }, depart: { day: 2 } }),
  { latitude: 9.5, longitude: 123.2 },                      // a plain waypoint, not a stop
  P("Apo Island", { arrive: { day: 2 }, depart: { day: 4 } }),
  P("Lunch spot", { arrive: { day: 4 }, depart: { day: 4 } }),   // day stop
  P("Tubbataha", { arrive: { day: 6 } })
];
const charter = { start_date: "2026-11-01", end_date: "2026-11-09" };

test("overnightName: the stop slept at, a passage, the terminus", () => {
  assert.equal(core.overnightName(points, 1), "Oslob");
  assert.equal(core.overnightName(points, 2), "Apo Island");
  assert.equal(core.overnightName(points, 3), "Apo Island");
  assert.equal(core.overnightName(points, 4), "passage to Tubbataha");
  assert.equal(core.overnightName(points, 5), "passage to Tubbataha");
  assert.equal(core.overnightName(points, 6), "Tubbataha");
  assert.equal(core.overnightName(points, 9), "Tubbataha");
  assert.equal(core.overnightName([P("Only")], 1), "Only");
  assert.equal(core.overnightName([], 1), "");
  assert.equal(core.overnightName([P("", { depart: { day: 2 } }), P("B", { arrive: { day: 2 } })], 1), "Stop 1");
});

test("previewSteps: before, nine days, after", () => {
  const steps = core.previewSteps(charter, points);
  assert.equal(steps.length, 11);
  assert.deepEqual(steps[0], { date: "2026-10-31", kind: "before", day: null, label: "Sat 31 Oct", sub: "Day before boarding" });
  assert.deepEqual(steps[1], { date: "2026-11-01", kind: "day", day: 1, label: "Sun 1 Nov", sub: "Day 1 of 9 · Oslob" });
  assert.equal(steps[3].sub, "Day 3 of 9 · Apo Island");
  assert.equal(steps[4].sub, "Day 4 of 9 · passage to Tubbataha");
  assert.deepEqual(steps[10], { date: "2026-11-10", kind: "after", day: null, label: "Tue 10 Nov", sub: "Day after the charter" });
  assert.equal(core.previewSteps(charter, [])[1].sub, "Day 1 of 9");
});

test("previewSteps: no dates, bad dates, end before start", () => {
  assert.deepEqual(core.previewSteps({}, points), []);
  assert.deepEqual(core.previewSteps({ start_date: "2026-11-01" }, points), []);
  assert.deepEqual(core.previewSteps({ start_date: "2026-02-30", end_date: "2026-03-02" }, points), []);
  assert.deepEqual(core.previewSteps({ start_date: "2026-11-09", end_date: "2026-11-01" }, points), []);
  assert.deepEqual(core.previewSteps(null, points), []);
  assert.equal(core.previewSteps({ start_date: "2026-12-31", end_date: "2026-12-31" }, []).map((s) => s.date).join(","), "2026-12-30,2026-12-31,2027-01-01");
});

test("defaultStepIndex, stepIndexForDay, stepIndexForDate", () => {
  const steps = core.previewSteps(charter, points);
  assert.equal(core.defaultStepIndex(steps, "2026-11-03"), 3);
  assert.equal(core.defaultStepIndex(steps, "2026-10-31"), 0);
  assert.equal(core.defaultStepIndex(steps, "2026-12-25"), 1);
  assert.equal(core.defaultStepIndex([], "2026-11-03"), 0);
  assert.equal(core.stepIndexForDay(steps, 5), 5);
  assert.equal(core.stepIndexForDay(steps, 12), -1);
  assert.equal(core.stepIndexForDate(steps, "2026-11-10"), 10);
  assert.equal(core.stepIndexForDate(steps, "2027-01-01"), -1);
});

test("previewUrl: encoded params, only a plain tab id kept", () => {
  assert.equal(core.previewUrl({ date: "2026-11-03", charterId: "csaba", hash: "#itinerary" }), "/?preview=2026-11-03&charter=csaba#itinerary");
  assert.equal(core.previewUrl({ date: "2026-11-03", charterId: "csaba", hash: "" }), "/?preview=2026-11-03&charter=csaba");
  assert.equal(core.previewUrl({ date: "2026-11-03", charterId: "a b", hash: "#x\"><img" }), "/?preview=2026-11-03&charter=a%20b");
});

test("fitScale: fits width and height, never above 1, phone by default", () => {
  assert.equal(core.fitScale("phone", 1000, 2000), 1);
  assert.equal(core.fitScale("phone", 195, 2000), 0.5);
  assert.equal(core.fitScale("tablet", 2000, 590), 0.5);
  assert.equal(core.fitScale("nope", 195, 2000), 0.5);
  assert.equal(core.fitScale("phone", 0, 0), 1);
  assert.deepEqual(core.DEVICES.tablet, { w: 820, h: 1180 });
});
```

- [ ] **Step 2: Run it and see it fail.** `node --test test/guest-preview-core.test.js` → fails with `Cannot find module '../guest-preview-core.js'`.

- [ ] **Step 3: Create `guest-preview-core.js`:**

```js
// Guest view pure logic (charter rework spec B §3.4), shared by guest-preview.js (browser) and
// test/guest-preview-core.test.js (node --test): the slider steps, the default step, the iframe URL, the frame scale.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheGuestPreviewCore = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY_MS = 86400000;
  const DEVICES = Object.freeze({ phone: Object.freeze({ w: 390, h: 844 }), tablet: Object.freeze({ w: 820, h: 1180 }) });
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const isStop = (point) => Boolean(point && (point.anchorage_id || point.stop === true));

  function parseDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === "string" ? value.trim() : "");
    if (!m) return null;
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(t);
    return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? t : null;
  }
  const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
  const labelOf = (t) => {
    const d = new Date(t);
    return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  };

  // Where the boat is at the end of charter day `day`: the stop it spends the night at, "passage to X" on a night at
  // sea, the last stop once the route is done, "" without stops. The origin counts as reached on day 1.
  function overnightName(points, day) {
    const stops = (Array.isArray(points) ? points : []).filter(isStop);
    const nameOf = (p, i) => p.name || `Stop ${i + 1}`;
    for (let i = 0; i < stops.length; i += 1) {
      const p = stops[i];
      const arrive = i === 0 ? 1 : ((p.arrive && p.arrive.day) || 1);
      const depart = i === stops.length - 1 ? Infinity : ((p.depart && p.depart.day) || arrive);
      if (arrive <= day && day < depart) return nameOf(p, i);
    }
    const nextIndex = stops.findIndex((p, i) => i > 0 && p.arrive && p.arrive.day > day);
    if (nextIndex > 0) return `passage to ${nameOf(stops[nextIndex], nextIndex)}`;
    return stops.length ? nameOf(stops[stops.length - 1], stops.length - 1) : "";
  }

  // One step per charter day plus the day before boarding and the day after: [{ date, kind, day, label, sub }].
  // [] without valid start and end dates.
  function previewSteps(charter, points) {
    const c = charter && typeof charter === "object" ? charter : {};
    const start = parseDate(c.start_date);
    const end = parseDate(c.end_date);
    if (start === null || end === null || end < start) return [];
    const count = Math.round((end - start) / DAY_MS) + 1;
    const steps = [];
    for (let k = 0; k <= count + 1; k += 1) {
      const t = start + (k - 1) * DAY_MS;
      const kind = k === 0 ? "before" : (k === count + 1 ? "after" : "day");
      const where = kind === "day" ? overnightName(points, k) : "";
      const sub = kind === "before" ? "Day before boarding"
        : kind === "after" ? "Day after the charter"
          : `Day ${k} of ${count}${where ? ` · ${where}` : ""}`;
      steps.push({ date: isoOf(t), kind, day: kind === "day" ? k : null, label: labelOf(t), sub });
    }
    return steps;
  }

  // Today's step when today is in range, else the charter's Day 1.
  function defaultStepIndex(steps, todayIso) {
    const today = (steps || []).findIndex((s) => s.date === todayIso);
    if (today >= 0) return today;
    const first = (steps || []).findIndex((s) => s.kind === "day");
    return first >= 0 ? first : 0;
  }

  function stepIndexForDay(steps, day) {
    return (steps || []).findIndex((s) => s.kind === "day" && s.day === day);
  }

  function stepIndexForDate(steps, date) {
    return (steps || []).findIndex((s) => s.date === date);
  }

  // The iframe URL. The hash keeps the guest's tab, but only a plain tab id passes.
  function previewUrl({ date, charterId, hash }) {
    const tab = String(hash || "").replace(/^#/, "");
    return `/?preview=${encodeURIComponent(date)}&charter=${encodeURIComponent(charterId)}${/^[a-z-]+$/.test(tab) ? `#${tab}` : ""}`;
  }

  // Scale for a device frame drawn at its real size inside availW × availH; never above 1.
  function fitScale(device, availW, availH) {
    const d = DEVICES[device] || DEVICES.phone;
    const k = Math.min(1, availW / d.w, availH / d.h);
    return Number.isFinite(k) && k > 0 ? k : 1;
  }

  return { DEVICES, overnightName, previewSteps, defaultStepIndex, stepIndexForDay, stepIndexForDate, previewUrl, fitScale };
});
```

- [ ] **Step 4: Run the tests.** `node --test 2>&1 | grep -E "^ℹ (pass|fail)"` → `ℹ pass 146`, `ℹ fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add guest-preview-core.js test/guest-preview-core.test.js
git commit -m "feat(guest-view): guest-preview-core.js - slider steps, night stop names, preview URL, frame scale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The panel — `guest-preview.js` and `guest-preview.css`

**Files:** create `guest-preview.js`, create `guest-preview.css`

Notes for the implementer: selection happens on `pointerdown` (with pointer capture) and is applied on `pointerup`; do **not** move it to `click` (pointer capture swallows clicks — the Gantt band's lesson). Arrow keys on the focused track call `stopPropagation()` so no page-wide handler also reacts.

- [ ] **Step 1: Create `guest-preview.js`:**

```js
// The Guest view panel (Charter → Guest view, charter rework spec B §3): the live guest site in a same-origin iframe
// loaded with ?preview=<date>&charter=<id>, under a date slider. The guest does the rendering; this file only picks the
// date and the device size. Pure logic in guest-preview-core.js. admin.js calls render() then bind(ctx).
(function () {
  "use strict";

  const core = () => window.IolantheGuestPreviewCore;
  const DEVICE_KEY = "iolanthe-admin.preview.device";
  const DRAG_APPLY_MS = 250;
  const STAGE_MARGIN_PX = 32;
  const ICONS = {
    prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    today: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>',
    reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    open: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    tablet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M11 18h2"/>'
  };
  const chosenDate = new Map();   // charterId → the date last shown, for this admin session only
  let teardown = null;            // removes the previous bind's window listeners and observer

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    });
    children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c.nodeType ? c : String(c)); });
    return node;
  }

  function iconBtn(icon, title, onclick, extra) {
    const b = el("button", { type: "button", class: "gp-btn", title, "aria-label": title, onclick, ...(extra || {}) });
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
    return b;
  }

  function loadDevice() {
    try { return localStorage.getItem(DEVICE_KEY) === "tablet" ? "tablet" : "phone"; } catch (e) { return "phone"; }
  }
  function storeDevice(device) {
    try { localStorage.setItem(DEVICE_KEY, device); } catch (e) { /* per-browser convenience only */ }
  }

  function render() {
    return '<section class="card full guest-preview" id="guest-preview"></section>';
  }

  function destroy() {
    if (teardown) teardown();
    teardown = null;
  }

  // ctx: { charterId, charter, points, pill: { tone, text }, today: "YYYY-MM-DD", focusDay: n | 0, onOpenInfo() }
  function bind(ctx) {
    destroy();
    const host = document.getElementById("guest-preview");
    if (!host) return;
    const steps = core().previewSteps(ctx.charter, ctx.points);
    const title = el("h2", {}, "Guest view");
    const pill = el("span", { class: `status-pill status-pill--${ctx.pill.tone}` }, ctx.pill.text);
    if (!steps.length) {
      host.replaceChildren(
        el("div", { class: "card-header" }, title, pill),
        el("div", { class: "gp-empty" },
          el("p", {}, "Set the charter dates on Charter Info to preview the guest view."),
          el("button", { type: "button", class: "gp-text-btn", onclick: () => ctx.onOpenInfo() }, "Charter Info")));
      return;
    }

    const todayIndex = core().stepIndexForDate(steps, ctx.today);
    let index = pickIndex(steps, ctx);
    let device = loadDevice();
    let dragTimer = 0;
    let dragging = false;

    const frame = el("iframe", { class: "gp-frame", title: "Guest view preview" });
    const deviceBox = el("div", { class: "gp-device" }, frame);
    const stage = el("div", { class: "gp-stage" }, deviceBox);
    const readDate = el("b", {});
    const readSub = el("span", {});
    const ticks = steps.map((s) => el("span", {
      class: `gp-tick gp-tick--${s.kind}${s.date < ctx.today ? " gp-tick--past" : ""}${s.date === ctx.today ? " gp-tick--today" : ""}`,
      title: `${s.label} · ${s.sub}`
    }, el("span", { class: "gp-tick-d" }, s.label.split(" ")[1]), el("span", { class: "gp-tick-w" }, s.kind === "day" ? s.label.split(" ")[0] : s.kind)));
    const track = el("div", { class: "gp-track", role: "slider", tabindex: "0", "aria-label": "Preview date", "aria-valuemin": "0", "aria-valuemax": String(steps.length - 1) }, ...ticks);
    const prevBtn = iconBtn("prev", "Previous day", () => go(index - 1, true));
    const nextBtn = iconBtn("next", "Next day", () => go(index + 1, true));
    const todayBtn = iconBtn("today", todayIndex >= 0 ? "Jump to today" : "Today is outside this charter", () => go(todayIndex, true), { disabled: todayIndex < 0 });
    const deviceBtns = ["phone", "tablet"].map((d) => iconBtn(d, d === "phone" ? "Phone" : "Tablet", () => setDevice(d), { "data-device": d }));

    host.replaceChildren(
      el("div", { class: "card-header" }, title, pill,
        el("div", { class: "gp-actions" },
          el("div", { class: "gp-seg", role: "group", "aria-label": "Device" }, ...deviceBtns),
          el("span", { class: "gp-sep" }),
          iconBtn("reload", "Reload", reload),
          iconBtn("open", "Open full screen in a new tab", () => window.open(currentUrl(), "_blank", "noopener")))),
      el("div", { class: "gp-strip" }, prevBtn, el("div", { class: "gp-readout" }, readDate, readSub), track, nextBtn, todayBtn),
      stage);

    function currentHash() {
      try { return frame.contentWindow ? frame.contentWindow.location.hash : ""; } catch (e) { return ""; }
    }
    function currentUrl() {
      return core().previewUrl({ date: steps[index].date, charterId: ctx.charterId, hash: currentHash() });
    }
    function apply() {
      window.clearTimeout(dragTimer);
      frame.src = currentUrl();
    }
    function reload() {
      try { frame.contentWindow.location.reload(); } catch (e) { apply(); }
    }
    function go(i, now) {
      const next = Math.max(0, Math.min(steps.length - 1, i));
      const changed = next !== index;
      index = next;
      paintStep();
      chosenDate.set(ctx.charterId, steps[index].date);
      if (now) { if (changed || !frame.getAttribute("src")) apply(); return; }
      window.clearTimeout(dragTimer);
      dragTimer = window.setTimeout(apply, DRAG_APPLY_MS);
    }
    function paintStep() {
      const s = steps[index];
      readDate.textContent = s.label;
      readSub.textContent = s.sub;
      ticks.forEach((t, i) => t.classList.toggle("on", i === index));
      track.setAttribute("aria-valuenow", String(index));
      track.setAttribute("aria-valuetext", `${s.label} · ${s.sub}`);
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === steps.length - 1;
    }
    function nearestTick(clientX) {
      let best = 0;
      let bestDist = Infinity;
      ticks.forEach((t, i) => {
        const r = t.getBoundingClientRect();
        const dist = Math.abs(clientX - (r.left + r.width / 2));
        if (dist < bestDist) { best = i; bestDist = dist; }
      });
      return best;
    }
    function setDevice(d) {
      device = d;
      storeDevice(d);
      deviceBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.device === d)));
      fit();
    }
    function fit() {
      if (!host.isConnected) { destroy(); return; }
      const size = core().DEVICES[device];
      const k = core().fitScale(device, stage.clientWidth, window.innerHeight - STAGE_MARGIN_PX);
      frame.style.width = `${size.w}px`;
      frame.style.height = `${size.h}px`;
      frame.style.transform = `scale(${k})`;
      deviceBox.style.width = `${Math.round(size.w * k)}px`;
      deviceBox.style.height = `${Math.round(size.h * k)}px`;
    }

    // Slider: press anywhere on the track to pick the nearest day, drag to scrub (applied after a short pause), release
    // to apply. Selection happens on pointerdown, not click, so pointer capture cannot swallow it.
    track.addEventListener("pointerdown", (e) => {
      dragging = true;
      track.setPointerCapture(e.pointerId);
      go(nearestTick(e.clientX), false);
    });
    track.addEventListener("pointermove", (e) => { if (dragging) go(nearestTick(e.clientX), false); });
    const endDrag = () => { if (dragging) { dragging = false; apply(); } };
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    track.addEventListener("keydown", (e) => {
      const moves = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: steps.length - 1 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      e.stopPropagation();
      go(moves[e.key], true);
    });

    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    if (observer) observer.observe(stage);
    window.addEventListener("resize", fit);
    teardown = () => {
      window.clearTimeout(dragTimer);
      if (observer) observer.disconnect();
      window.removeEventListener("resize", fit);
    };

    setDevice(device);
    paintStep();
    go(index, true);
  }

  function pickIndex(steps, ctx) {
    const c = core();
    if (ctx.focusDay) {
      const i = c.stepIndexForDay(steps, ctx.focusDay);
      if (i >= 0) return i;
    }
    const remembered = c.stepIndexForDate(steps, chosenDate.get(ctx.charterId));
    return remembered >= 0 ? remembered : c.defaultStepIndex(steps, ctx.today);
  }

  window.IolantheGuestPreviewPanel = Object.freeze({ render, bind, destroy });
})();
```

- [ ] **Step 2: Create `guest-preview.css`:**

```css
/* The Guest view panel (charter rework spec B §3.2). Scoped under .guest-preview. */
.guest-preview .card-header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.guest-preview .card-header h2 { margin: 0; }
.guest-preview .gp-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.guest-preview .gp-sep { width: 1px; height: 26px; background: var(--line); }
.guest-preview .gp-seg { display: inline-flex; gap: 4px; }

.guest-preview .gp-btn {
  width: 36px; height: 36px; min-height: 0; padding: 0; border: 0; border-radius: 6px;
  display: inline-grid; place-items: center; background: #e8eef0; color: var(--ink); cursor: pointer;
}
.guest-preview .gp-btn:hover, .guest-preview .gp-btn:focus-visible { background: #d8e2e5; }
.guest-preview .gp-btn[aria-pressed="true"] { background: var(--accent); color: #fff; }
.guest-preview .gp-btn:disabled { opacity: .35; cursor: not-allowed; }
.guest-preview .gp-btn svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

/* Slider strip */
.guest-preview .gp-strip {
  display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 8px 10px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
}
.guest-preview .gp-readout { min-width: 150px; display: flex; flex-direction: column; }
.guest-preview .gp-readout b { font-size: 17px; font-variant-numeric: tabular-nums; }
.guest-preview .gp-readout span { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
.guest-preview .gp-track {
  flex: 1; min-width: 0; position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr);
  align-items: end; padding: 14px 0 2px; cursor: pointer; touch-action: none; user-select: none; outline: none; border-radius: 6px;
}
.guest-preview .gp-track:focus-visible { box-shadow: 0 0 0 2px var(--accent); }
.guest-preview .gp-track::before {
  content: ""; position: absolute; left: 2%; right: 2%; top: 21px; height: 3px; border-radius: 2px; background: #b9c6cb;
}
.guest-preview .gp-tick {
  position: relative; display: flex; flex-direction: column; align-items: center; padding-top: 22px;
  font-size: 10px; line-height: 1.25; color: var(--muted); font-variant-numeric: tabular-nums;
}
.guest-preview .gp-tick::before {
  content: ""; position: absolute; top: 2px; left: 50%; width: 5px; height: 14px; margin-left: -2.5px; border-radius: 3px; background: #7e9198;
}
.guest-preview .gp-tick--past::before { background: #a9b9be; }
.guest-preview .gp-tick--before, .guest-preview .gp-tick--after { color: #a8b5ba; }
.guest-preview .gp-tick--before::before, .guest-preview .gp-tick--after::before { background: #d6dde0; }
.guest-preview .gp-tick-w { text-transform: capitalize; }
.guest-preview .gp-tick.on { color: var(--ink); font-weight: 700; }
.guest-preview .gp-tick.on::before {
  top: -2px; width: 14px; height: 22px; margin-left: -7px; border-radius: 7px; background: var(--accent); box-shadow: 0 0 0 3px #cfe6ea;
}
.guest-preview .gp-tick--today::after {
  content: "today"; position: absolute; top: -14px; left: 0; right: 0; text-align: center;
  font-size: 9px; font-weight: 700; color: var(--danger);
}

/* Stage: the guest at its real device size, scaled to fit */
.guest-preview .gp-stage { display: flex; justify-content: center; padding: 14px 0 4px; min-width: 0; }
.guest-preview .gp-device { position: relative; overflow: hidden; border: 8px solid #1b1b1b; border-radius: 26px; background: #0f2d4a; box-sizing: content-box; }
.guest-preview .gp-frame { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; background: #0f2d4a; }

.guest-preview .gp-empty { padding: 18px 4px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; color: var(--muted); }
.guest-preview .gp-text-btn { min-height: 36px; border: 0; border-radius: 6px; padding: 0 12px; background: var(--accent); color: #fff; font-weight: 700; cursor: pointer; }

@media (max-width: 760px) {
  .guest-preview .gp-strip { flex-wrap: wrap; }
  .guest-preview .gp-readout { order: -1; flex: 1 0 100%; }
  .guest-preview .gp-tick-w { display: none; }
}
```

- [ ] **Step 3: Check.** `node --check guest-preview.js` (no output).

- [ ] **Step 4: Commit.**

```bash
git add guest-preview.js guest-preview.css
git commit -m "feat(guest-view): the Guest view panel - day slider over the live guest in an iframe, phone/tablet, reload, open

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `admin.js` — the tab, the Charter Info eye button

**Files:** `admin.js`. Every step is a verbatim replacement: find the OLD block (it occurs exactly once) and replace it with the NEW block.

- [ ] **Step 1: The panel list.** OLD:

```js
      { id: "routes", label: "Route" },
      { id: "sites", label: "Site Editor" }
    ];
```

NEW:

```js
      { id: "routes", label: "Route" },
      { id: "preview", label: "Guest view" },
      { id: "sites", label: "Site Editor" }
    ];
```

- [ ] **Step 2: The panel's markup.** OLD:

```js
    if (activePanel === "sites") {
      return renderSitesPanel();
    }
```

NEW:

```js
    if (activePanel === "preview") {
      return window.IolantheGuestPreviewPanel ? window.IolantheGuestPreviewPanel.render() : placeholderCard("Guest view");
    }
    if (activePanel === "sites") {
      return renderSitesPanel();
    }
```

- [ ] **Step 3: The panel's context (spec B §3).** OLD:

```js
    if (activePanel === "sites") {
      bindSitesPanel(siteLibrary);
    }
  }
```

NEW:

```js
    if (activePanel === "preview") {
      if (window.IolantheGuestPreviewPanel) {
        const route = itinerary && typeof itinerary === "object" && itinerary.route && typeof itinerary.route === "object" ? itinerary.route : {};
        window.IolantheGuestPreviewPanel.bind({
          charterId: state.selectedCharter,
          charter: charterInfo,
          points: Array.isArray(route.points) ? route.points : [],
          pill: charterInfoHeaderState(charterInfo).pill,
          today: adminToday(),
          focusDay: state.previewFocusDay || 0,
          onOpenInfo: () => showCharterPanel("info")
        });
      }
      state.previewFocusDay = 0;
      return;
    }
    if (activePanel === "sites") {
      bindSitesPanel(siteLibrary);
    }
  }
```

- [ ] **Step 4: `showCharterPanel` takes a day to open the preview on.** OLD:

```js
    if (options.startFrom !== undefined) state.routesStartFrom = options.startFrom;
```

NEW:

```js
    if (options.startFrom !== undefined) state.routesStartFrom = options.startFrom;
    if (options.previewDay !== undefined) state.previewFocusDay = options.previewDay;
```

- [ ] **Step 5: The Charter Info header's eye button, after ★ Make active.** OLD:

```js
            ${iconButtonHtml("star", makeActiveTitle, ` id="charter-make-active"${makeActiveDisabled ? " disabled" : ""}`)}
```

NEW:

```js
            ${iconButtonHtml("star", makeActiveTitle, ` id="charter-make-active"${makeActiveDisabled ? " disabled" : ""}`)}
            ${iconButtonHtml("preview", "Guest view", ` id="charter-guest-view"`)}
```

- [ ] **Step 6: Its click.** OLD:

```js
    const deleteButton = document.getElementById("charter-delete");
```

NEW:

```js
    const guestViewButton = document.getElementById("charter-guest-view");
    if (guestViewButton) {
      guestViewButton.addEventListener("click", () => showCharterPanel("preview"));   // spec B §3.1; the form's unsaved guard asks first
    }

    const deleteButton = document.getElementById("charter-delete");
```

- [ ] **Step 7: Check.** `node --check admin.js`; `node --test 2>&1 | grep -E "^ℹ (pass|fail)"` → `ℹ pass 146`.

- [ ] **Step 8: Commit.**

```bash
git add admin.js
git commit -m "feat(guest-view): Charter -> Guest view tab and the Charter Info eye button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Route page's eye button

**Files:** `routes.js`, `routes-ui.js`, `stop-cards.js`. Verbatim replacements.

- [ ] **Step 1: `routes-ui.js`, the eye icon.** OLD:

```js
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
```

NEW:

```js
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    eye: '<path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="3"/>',
```

- [ ] **Step 2: `stop-cards.js`, the open card's day tab.** OLD:

```js
    return { render, select, step, selectedId: () => selectedId, destroy: closeMenu };
```

NEW:

```js
    return { render, select, step, selectedId: () => selectedId, selectedDay: () => (selectedId && activeDay.get(selectedId)) || 0, destroy: closeMenu };
```

- [ ] **Step 3: `routes.js`, the button (charter subject only; an unassigned route has no guest view).** OLD:

```js
        b("export", "Export GPX / KML", () => io.openExport(), "", work.route.points.length < 2));
      return;
    }
```

NEW:

```js
        b("export", "Export GPX / KML", () => io.openExport(), "", work.route.points.length < 2),
        el("span", { class: "icon-sep" }),
        b("eye", "Guest view (the saved version)", () => A().showCharterPanel("preview", { previewDay: cards ? cards.selectedDay() : 0 })));
      return;
    }
```

- [ ] **Step 4: Check.** `node --check routes.js && node --check routes-ui.js && node --check stop-cards.js`; `node --test 2>&1 | grep -E "^ℹ (pass|fail)"` → `ℹ pass 146`.

- [ ] **Step 5: Commit.**

```bash
git add routes.js routes-ui.js stop-cards.js
git commit -m "feat(guest-view): Route page eye button opens the Guest view on the open card's day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `index.html` and `CLAUDE.md`

**Files:** `index.html`, `CLAUDE.md`.

- [ ] **Step 1: `index.html`, the stylesheet.** OLD:

```html
  <link rel="stylesheet" href="/admin/charter-gantt.css?v=admin-charters-2">
```

NEW:

```html
  <link rel="stylesheet" href="/admin/charter-gantt.css?v=admin-charters-2">
  <link rel="stylesheet" href="/admin/guest-preview.css?v=admin-charters-2">
```

- [ ] **Step 2: `index.html`, the scripts.** OLD:

```html
  <script src="/admin/itinerary-core.js?v=admin-charters-2" defer></script>
```

NEW:

```html
  <script src="/admin/itinerary-core.js?v=admin-charters-2" defer></script>
  <script src="/admin/guest-preview-core.js?v=admin-charters-2" defer></script>
  <script src="/admin/guest-preview.js?v=admin-charters-2" defer></script>
```

- [ ] **Step 3: Bump every asset version.** Run `sed -i "s/?v=admin-charters-2/?v=admin-preview-1/g" index.html`, then `grep -c "admin-preview-1" index.html` → `21` and `grep -c "admin-charters-2" index.html` → `0`.

- [ ] **Step 4: `CLAUDE.md`.** In "## Stack", after the `charter-gantt.js` / `charter-gantt.css` bullet (it ends "...so a background tab still draws."), add this bullet:

```markdown
- `guest-preview-core.js` / `guest-preview.js` / `guest-preview.css` — Charter → **Guest view** (charter rework spec B):
  the live guest site in a same-origin iframe at `/?preview=<date>&charter=<id>#<tab>`, under a day slider (day before
  boarding … day after the charter), phone 390 × 844 / tablet 820 × 1180 scaled to fit, reload, open full screen. Eye
  buttons on the Charter Info and Route headers open it (`showCharterPanel("preview", { previewDay })`). The server
  serves `?charter=` only to an admin session; the guest's preview mode lives in `iolanthe-guest/preview-mode.js`.
  Device choice in localStorage `iolanthe-admin.preview.device`.
```

Then in the `node --test` bullet change `(140 tests)` to `(146 tests)` and the list of covered modules to "`routes-core`, `itinerary-core`, `charters-core` and `guest-preview-core`".

- [ ] **Step 5: Commit.**

```bash
git add index.html CLAUDE.md
git commit -m "chore(guest-view): load the Guest view files, ?v=admin-preview-1, docs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Browser verification (this session; server `iolanthe-server-specb` on 8010)

Start it with `preview_start { name: "iolanthe-server-specb" }`; log in at `http://localhost:8010/admin/?key=<admin.urlKey>` as Charter Admin with the local dev password from `worktrees/spec-b/data-scratch-b/settings.json` (never echo it). First run plan b-01 Task 5's endpoint table. Then:

1. Charter → **Guest view** on csaba (1–9 Nov): 11 ticks, Day 1 selected (today is outside), readout "Sun 1 Nov · Day 1 of 9 · <stop>"; the frame shows the red "PREVIEW · SUN 1 NOV" banner and the itinerary pills with Day 1 current.
2. Step ‹ › and ← → through before / Day 1–9 / after: pills (past / current / future), the default day, Today's Menu, the welcome message and the banner follow; "before" shows the pre-charter state, "after" "Charter completed". Drag the knob across: the frame reloads once after the pause.
3. In the frame switch to the Navigation tab, step a day: the frame stays on Navigation. The track is cut at the date (needs a scratch track with points; add a few with timestamps to `data-scratch-b` if empty).
4. ▯ / ▭: the frame is 390 / 820 px wide inside (`frame.contentWindow.innerWidth`), scaled to fit; the choice survives a reload of the admin. ↻ reloads; ⧉ opens the same URL in a new tab with the banner and no slider.
5. Charter Info: the eye after ★ opens the Guest view. Route page (This charter's route): the eye button opens it on the open card's day tab; with an unsaved edit the admin's unsaved-changes prompt shows first. On an unassigned route there is no eye button.
6. larry (Dec, future, no track) and the seeded past charter (hoffmann, Nov 2025): both preview; a charter with no dates shows the empty state with the Charter Info button.
7. Logged out (log out of the admin in a second tab): reload the frame → banner "PREVIEW · LOG IN TO THE ADMIN AGAIN", no active-charter data.
8. A plain guest at `http://localhost:8010/` (new tab): no banner, the service worker registers (`navigator.serviceWorker.getRegistration()`), idle mode works as before, `?v=guest-b-1` assets load.
9. Phone-width admin (resize to 375): the strip wraps, the readout on its own row.
10. Console: no errors on the admin or in the frame.

---

### Task 7: Release (merge only on David's word)

1. Push the three branches, open three PRs (server, guest, admin), bind each with `ccd_pr`.
2. **Server first:** David merges → `ssh docker-vm`, then in `/opt/projects/vessel/iolanthe-server`: `git pull && docker compose up -d --build iolanthe-server` → check `/api/charter` and `/api/planned-route` return 200 for a plain guest and `/api/planned-route` has only `routes` and `source`.
3. **Guest + admin together:** David merges both → the 5-minute cron deploys them. Check on the boat: the guest loads with SW cache v5; Charter → Guest view works on the active charter.
4. Remove the worktrees and the `iolanthe-server-specb` launch entry after the merge (`git worktree remove …` from each main checkout; delete `worktrees/spec-b/data-scratch-b`).
5. Log the result in `decisions.md` and the memory file.

---

## Self-review against spec B §3 and §7–§8

| Spec | Task |
|---|---|
| §3.1 the tab after Route; eye buttons (Charter Info, Route charter subject only); unsaved prompt | 3 steps 1, 5, 6; 4 (via `showCharterPanel` → `confirmDiscardPageChanges`) |
| §3.2 header (pill, phone/tablet, reload, open), strip (‹ readout track › ◎, past/today/before/after ticks), stage scaled | 2 |
| §3.3 range, empty state, default date, remembered per charter, debounce 250 ms, hash kept, device in localStorage | 1, 2 |
| §3.4 core functions + tests | 1 |
| §7 browser pass | 6 |
| §8 rollout | 7 |
