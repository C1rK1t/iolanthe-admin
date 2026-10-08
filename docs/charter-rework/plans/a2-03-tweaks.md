# Spec A2 — Plan 3: Tweak round after David's first look (2026-10-08)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the eight tweaks from David's first look at the live Route page (decisions.md A2-T1…T4 plus the three from his second note): the map fills the screen, arrival is fully derived, unassigned routes get a nights count, size sliders, anchorage-stop drag semantics with snapping, more generous edges on wide screens, "Assign to this charter" from an unassigned route. T0 (dialogs hidden behind the map) is already live as `7e8b410`.

**Architecture:** All changes are in the admin's Route page files (`routes.js`, `routes.css`, `stop-cards.js`, `stop-cards.css`, `routes-core.js`, `admin.js`); no server change, no core-logic change except one new pure helper in `routes-core.js`. Same pattern as plan a2-02: branch `feat/itinerary-a2-tweaks` from `main`, Sonnet implementers per task, browser check on `iolanthe-server-scratch`, merge releases to the vessel within 5 minutes (server A2 is live, so merging is safe at any point).

**Tech Stack:** Plain JS, no build, `node --test` (110 tests; T5 adds 2). Repo `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin`, from `main` at `7e8b410` or later.

**Reading before you start:** `routes.js` (`render`, `renderAll`, `renderMap` marker `dragend`, `makeStopAtAnchorage`, `bind`), `stop-cards.js` (`edge`, `render`, `arriveTile`, `departTile`), `routes-core.js` (`makeStopAt`, `makePlainStop`, `removeStop`, `anchorageMovedM`), `routes-places.js` (`anchorageUnder`, `findAnchorage`), `admin.js` 6340–6420 (`bindCharterPanel`, `showCharterPanel`), `routes.css` (A2 section at the end), `stop-cards.css`.

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `routes.js` | T1 `fitMap` (map height from the viewport, user override), T4 splitters, T5 drag semantics on stop markers + anchor badge, T7 `assign` action and `startFrom` handling |
| `routes.css` | T1/T4 variables and splitter styles, T5 badge, T6 nothing |
| `routes-core.js` + test | T5 `unlinkStop(points, index, latlng)` pure helper |
| `stop-cards.js` / `stop-cards.css` | T2 arrival display only, T3 nights count, T6 edge widths and labels |
| `admin.js` | T7 one-shot `routesStartFrom` |

---

### Task 0: Branch

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin"
git checkout main && git pull && git checkout -b feat/itinerary-a2-tweaks && node --test
```

Expected `# pass 110`.

---

### Task 1 (T1): The map fills the viewport above the strip

**Files:** `routes.js`, `routes.css`

- [ ] **Step 1: CSS** — in `routes.css` replace the A2 line `.routes-panel { --map-h: max(380px, min(calc(100vh - 380px), 640px)); }` with `.routes-panel { --map-h: 560px; }` (the JS below sets the real value).

- [ ] **Step 2: `fitMap` in `routes.js`** — add after `destroyMap()`:

```js
  const MAP_MIN_PX = 380;
  const MAP_GAP_PX = 32;        // panel padding + gaps between the map and the strip
  const MAP_H_KEY = "routePlanner.mapH";   // a splitter drag (T4) stores the user's height here; blank = fit the viewport
  let fitMapTimer = null;

  // Spec A2 T1: the map is as tall as the viewport allows above the docked strip, unless the user dragged the splitter.
  function fitMap() {
    if (!panel || !panel.isConnected) return;
    let h = 0;
    try { h = parseInt(localStorage.getItem(MAP_H_KEY), 10) || 0; } catch (e) { h = 0; }
    if (!h) {
      const strip = $("strip");
      const stripH = strip && strip.offsetHeight ? strip.offsetHeight : 260;
      const top = panel.querySelector(".planner").getBoundingClientRect().top + window.scrollY;
      const headerH = Math.max(0, Math.min(top, 240));   // the admin header and the Route page header above the map
      h = window.innerHeight - headerH - stripH - MAP_GAP_PX;
    }
    panel.style.setProperty("--map-h", `${Math.max(MAP_MIN_PX, Math.round(h))}px`);
    if (map) map.invalidateSize();
  }
  function scheduleFitMap() {
    clearTimeout(fitMapTimer);
    fitMapTimer = setTimeout(fitMap, 60);
  }
```

In `renderAll`, after `if (cards) cards.render();` add `scheduleFitMap();`. In `bind`, next to `bindKeyboard();`, add a window resize listener kept across binds:

```js
    if (!window.__routesFitMapBound) { window.addEventListener("resize", () => { if (panel && panel.isConnected) scheduleFitMap(); }); window.__routesFitMapBound = true; }
```

(`routes.js` already removes and re-adds its keydown listener per bind; the resize listener is guarded instead because `fitMap` checks the live panel.) In the `@media (max-width: 900px)` block of `routes.css` the phone map height stays `65vh`; `fitMap` must not override it: at the top of `fitMap` add `if (window.innerWidth <= 900) { panel.style.removeProperty("--map-h"); return; }`.

- [ ] **Step 3: Verify** — on a 1080-px-tall window the map reaches down to the strip with no empty band under the strip; adding items to a card (taller strip) shrinks the map on the next render; resizing the window follows; phone width unchanged.

- [ ] **Step 4: Commit** `feat(routes): the map fills the viewport above the strip (A2-T1)`.

---

### Task 2 (T2): Arrival is fully derived

**Files:** `stop-cards.js`

- [ ] **Step 1:** Replace `arriveTile` with:

```js
    // Arrive: always derived from the previous departure and the leg (spec A2 T2); the origin shows boarding.
    function arriveTile(stop, rec) {
      const p = stop.point;
      if (stop.position === "origin" || stop.position === "only") {
        const ch = ctx.getCharter();
        return tile("Arrive", ch && ch.start_date ? c.dayDateLabel(ch, 1) : "Day 1", "boarding");
      }
      const times = c.estimateTimes(rec).get(p.id) || { arrive: null };
      const prev = stops(rec)[stop.n - 2];
      const leg = prev ? c.legSummaries(rec).get(prev.point.id) : null;
      const value = el("div", { class: "tile-row" }, el("span", { class: "est" }, times.arrive ? `~${times.arrive.time}` : "—"), el("span", {}, dayLabel(p.arrive ? p.arrive.day : 1)));
      const sub = leg ? `${leg.nm.toFixed(0)} nm · ${fmtHours(leg.hours)} from ${prev.point.name || "the previous stop"}` : "";
      return tile("Arrive", value, sub, "estimated");
    }
```

Any stored `arrive.time` on old records is ignored by the card (the core still accepts it, so nothing breaks on load). Remove the now-unused `.tile-time.est` rule from `stop-cards.css` if nothing else uses it (`grep -n "tile-time" stop-cards.css stop-cards.js`).

- [ ] **Step 2: Verify** — the Arrive tile is text only (italic `~HH:MM` plus the day/date), still updates when the previous departure or a leg speed changes.

- [ ] **Step 3: Commit** `feat(routes): arrival is derived only, no pinned time (A2-T2)`.

---

### Task 3 (T3): Nights here on unassigned routes

**Files:** `stop-cards.js`

- [ ] **Step 1:** In `departTile`, replace the `const dayInput = start !== null ? … : …;` expression and the `dayOf` helper with:

```js
      const nightsBefore = p.depart.day - arriveDay;
      const dayInput = start !== null
        ? el("input", { type: "date", class: "tile-date edit-only", value: toIso(p.depart.day), min: toIso(arriveDay) })
        : el("input", { type: "number", class: "tile-nights edit-only", value: String(nightsBefore), min: "0", step: "1", "aria-label": "Nights at this stop" });
      const dayOf = () => {
        if (start === null) { const n = parseInt(dayInput.value, 10); return Number.isInteger(n) && n >= 0 ? arriveDay + n : NaN; }
        const t = c.parseDateOnly(dayInput.value);
        return t === null ? NaN : Math.round((t - start) / 86400000) + 1;
      };
```

and in the returned `tile(...)` wrap the number input with a unit: `el("div", { class: "tile-row" }, dayInput, start === null ? el("span", { class: "muted" }, "nights") : null, timeInput)`. Add to `stop-cards.css`: `.routes-panel .tile input.tile-nights { width: 64px; min-height: 0; height: 28px; font: inherit; font-size: 13px; font-weight: 700; padding: 0 6px; border: 1px solid var(--line); border-radius: 5px; background: #fff; color: var(--ink); }`.

- [ ] **Step 2: Verify** — on an unassigned route the Depart tile shows "N nights" with 0 allowed (day stop); raising it shifts later stops; lowering it over items shows the popup; on a charter route the date picker is unchanged.

- [ ] **Step 3: Commit** `feat(routes): nights count instead of a day number on unassigned routes (A2-T3)`.

---

### Task 4 (T4): Size sliders

**Files:** `routes.js`, `routes.css`

- [ ] **Step 1: Markup** — in `render()` add `<div class="splitter splitter-v" id="routes-split-v" title="Drag to resize"></div>` between `</aside>` and `<div class="map-wrap">`, and `<div class="splitter splitter-h" id="routes-split-h" title="Drag to resize"></div>` between the map-wrap `</div>` and the strip host.

- [ ] **Step 2: CSS** — in `routes.css`:

```css
.routes-panel .planner { grid-template-columns: minmax(300px, var(--side-w, 30%)) 10px minmax(0, 1fr); grid-template-areas: "side splitv map" "splith splith splith" "strip strip strip"; grid-template-rows: auto 10px auto; }
.routes-panel .splitter { background: transparent; border-radius: 4px; }
.routes-panel .splitter:hover, .routes-panel .splitter.dragging { background: var(--line); }
.routes-panel .splitter-v { grid-area: splitv; cursor: col-resize; touch-action: none; }
.routes-panel .splitter-h { grid-area: splith; cursor: row-resize; touch-action: none; }
@media (max-width: 900px) { .routes-panel .splitter { display: none; } .routes-panel .planner { grid-template-columns: minmax(0, 1fr); } }
```

(Replace the earlier A2 `grid-template-areas: "side map" "strip strip"; grid-template-rows: auto auto;` line and the `.planner` column rule; keep the phone overrides.)

- [ ] **Step 3: JS** — add after `fitMap`:

```js
  const SIDE_W_KEY = "routePlanner.sideW";
  // Spec A2 T4: drag the vertical splitter to resize the side column, the horizontal one to resize the map. Both remembered per browser.
  function bindSplitters() {
    const store = (key, value) => { try { localStorage.setItem(key, String(value)); } catch (e) { /* per-browser only */ } };
    let sideW = 0;
    try { sideW = parseInt(localStorage.getItem(SIDE_W_KEY), 10) || 0; } catch (e) { sideW = 0; }
    if (sideW) panel.style.setProperty("--side-w", `${sideW}px`);
    const drag = (handle, onMove, onEnd) => {
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        handle.classList.add("dragging");
        const move = (ev) => onMove(ev);
        const up = () => { handle.removeEventListener("pointermove", move); handle.classList.remove("dragging"); onEnd(); };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up, { once: true });
        handle.addEventListener("pointercancel", up, { once: true });
      });
    };
    const planner = panel.querySelector(".planner");
    drag($("split-v"), (ev) => {
      const w = Math.max(300, Math.min(ev.clientX - planner.getBoundingClientRect().left, planner.clientWidth * 0.6));
      panel.style.setProperty("--side-w", `${Math.round(w)}px`);
    }, () => store(SIDE_W_KEY, parseInt(panel.style.getPropertyValue("--side-w"), 10) || 0));
    drag($("split-h"), (ev) => {
      const mapTop = panel.querySelector(".map-wrap").getBoundingClientRect().top;
      const h = Math.max(MAP_MIN_PX, Math.round(ev.clientY - mapTop));
      panel.style.setProperty("--map-h", `${h}px`);
      if (map) map.invalidateSize();
    }, () => store(MAP_H_KEY, parseInt(panel.style.getPropertyValue("--map-h"), 10) || 0));
    $("split-h").addEventListener("dblclick", () => { store(MAP_H_KEY, ""); fitMap(); });   // double-click: back to fit-the-viewport
  }
```

Call `bindSplitters();` in `bind` after `bindInputs();`.

- [ ] **Step 4: Verify** — drag the vertical bar: the side column widens/narrows (300 px … 60%), the map redraws; drag the horizontal bar: the map height follows, the strip moves down; reload: both remembered; double-click the horizontal bar: back to the viewport fit; phone: no splitters.

- [ ] **Step 5: Commit** `feat(routes): size sliders between side column, map and strip (A2-T4)`.

---

### Task 5 (T5): Anchorage stops on the map — glyph, snapping, unlinking

**Files:** `routes-core.js`, `test/routes-core.test.js`, `routes.js`, `routes.css`

Rules (David, 2026-10-08): an anchorage stop's marker shows an anchor; dragging it within `STICKY_PX` of its own anchorage snaps it back (sticky); dropping it near another anchorage or global stop makes it a stop there (existing `anchorageUnder` snap, 24 px); dropping it anywhere else turns it into a plain stop at the new position, keeping its name, id, days, sites and items ("it can be defined as a new anchorage in the normal way"). Plain stops dropped near an anchorage snap to it (existing).

- [ ] **Step 1: Test** — append to `test/routes-core.test.js`:

```js
test("unlinkStop: an anchorage stop dropped elsewhere becomes a plain stop at the new position, keeping its identity", () => {
  const pts = [P(1, 1, { stop: true, id: "stp_a", name: "A", depart: { day: 1 } }), P(2, 2, { anchorage_id: "capones", id: "stp_b", name: "Capones Is.", site_ids: ["lh"], arrive: { day: 1 }, leg_speed_kn: 6 })];
  const out = core.unlinkStop(pts, 1, { lat: 2.5, lng: 2.5 });
  assert.deepEqual(out[1], { latitude: 2.5, longitude: 2.5, stop: true, id: "stp_b", name: "Capones Is.", site_ids: ["lh"], arrive: { day: 1 }, leg_speed_kn: 6 });
  assert.deepEqual(pts[1].anchorage_id, "capones");   // input untouched
  assert.equal(core.unlinkStop(pts, 0, { lat: 0, lng: 0 })[0].stop, true);   // a plain stop just moves
});
```

- [ ] **Step 2: Implement** — in `routes-core.js` after `removeStop`:

```js
  // Spec A2 T5: an anchorage stop dragged off its anchorage becomes a plain stop at the new position; everything else
  // about the stop (id, name, days, sites, leg speed) is kept. A plain stop just moves.
  function unlinkStop(points, index, latlng) {
    const point = points[index];
    if (!point) {
      return points;
    }
    const { anchorage_id: _a, ...rest } = point;
    return replaceAt(points, index, { ...rest, latitude: latlng.lat, longitude: latlng.lng, stop: true });
  }
```

Export it. Run `node --test` → 111 pass.

- [ ] **Step 3: `routes.js` marker drag** — in `renderMap`, replace the stop marker's `dragend` handler body with:

```js
      m.on("dragend", (e) => {
        const q = e.target.getLatLng();
        const cur = work.route.points[i];
        const own = c.isStop(cur) && cur.anchorage_id && places ? places.findAnchorage(cur.anchorage_id) : null;
        if (own && map.latLngToContainerPoint(q).distanceTo(map.latLngToContainerPoint([own.latitude, own.longitude])) <= STICKY_PX) {
          renderMap();   // sticky: it stays on its anchorage
          return;
        }
        const anchorage = places ? places.anchorageUnder(map, q) : null;
        if (anchorage && !(own && anchorage.id === own.id)) { makeStopAtAnchorage(i, anchorage, { snapped: true }); return; }
        if (own) {
          editPoints((arr) => c.unlinkStop(arr, i, q));
          status(`${cur.name || "Stop"} moved off ${own.name}; it is a plain stop now (make it an anchorage from its popup if you like).`, "");
          return;
        }
        editPoints((arr) => c.replaceAt(arr, i, { ...arr[i], latitude: q.lat, longitude: q.lng }));
      });
```

Add `const STICKY_PX = 40;   // an anchorage stop dropped this close to its anchorage snaps back (spec A2 T5)` near `MAP_CENTER`. Note `renderMap()` with no args redraws the marker at the stored position (the drag moved only the Leaflet marker).

- [ ] **Step 4: The glyph** — in `renderMap`, the stop marker html becomes:

```js
        html = `<div class="mk-stop${p.anchorage_id ? "" : " plain"}${selected ? " selected" : ""}">${stopNo}</div>${p.anchorage_id ? '<div class="mk-anchor-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/></svg></div>' : ""}${flagged ? '<div class="mk-badge">!</div>' : ""}`;
```

`routes.css`: `.routes-panel .mk-anchor-badge { position: absolute; bottom: -3px; right: -3px; width: 15px; height: 15px; border-radius: 50%; background: #fff; color: var(--stop); border: 1px solid var(--stop); display: grid; place-items: center; }` and `.routes-panel .mk-anchor-badge svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }`. Global stops (`kind: "stop"`) are anchorage-library entries too, so they get the badge as well; that is intended (they are "pre-defined stops").

- [ ] **Step 5: Verify** — anchorage stops show the anchor badge, plain stops the dashed circle; drag an anchorage stop 20 px: it snaps back; drag it 200 px into open water: it becomes a plain stop at the drop point with the same name, number and days, the status explains; drag it onto another anchorage: it becomes a stop there; drag a plain stop onto an anchorage: it snaps and gains the badge; Undo restores each.

- [ ] **Step 6: Commit** `feat(routes): anchorage stops snap, stick and unlink on drag; anchor badge on their markers (A2-T5)`.

---

### Task 6 (T6): Wider edges and clearer labels on big screens

**Files:** `stop-cards.js`, `stop-cards.css`

- [ ] **Step 1:** In `stop-cards.js` replace `const EDGE_WIDTHS = [26, 18, 12, 8, 6];` and `const EDGE_MIN = 4;` with:

```js
  const EDGE_WIDTHS = [28, 20, 14, 10, 8];   // px at a 1100-px strip; scaled up to 1.8× on wider screens (spec A2 T6)
  const EDGE_MIN = 6;
  const edgeScale = () => Math.min(1.8, Math.max(1, ((host && host.clientWidth) || 1100) / 1100));
```

and in `edge()` compute `const width = Math.round((EDGE_WIDTHS[distance - 1] || EDGE_MIN) * edgeScale());`. In `stop-cards.css` change `.routes-panel .strip-edge-label` to `font-size: 12px; font-weight: 600; color: var(--ink);` (keep position and writing-mode) and add `.routes-panel .strip-edge.dirty .strip-edge-label { color: #7a2a24; } .routes-panel .strip-edge.good .strip-edge-label { color: #1e5a3b; }`.

- [ ] **Step 2: Verify** — at 2000 px wide the nearest edges are about 50/36/25 px and the vertical names are readable; at 1024 px they are the base widths; phone unchanged (labels hidden).

- [ ] **Step 3: Commit** `feat(routes): wider stop edges and clearer labels on wide screens (A2-T6)`.

---

### Task 7 (T7): "Assign to this charter" from an unassigned route

David looked for a way to put the route he was editing onto the selected charter. The Start from… dialog does it from the charter side; this adds the same action from the unassigned route's side.

**Files:** `routes.js`, `admin.js`

- [ ] **Step 1: `admin.js`** — in `showCharterPanel` add `if (options.startFrom !== undefined) state.routesStartFrom = options.startFrom;`; in `bindCharterPanel` the charter subject gains `startFrom: state.routesStartFrom || ""` and `state.routesStartFrom = "";` is reset with the other one-shots.

- [ ] **Step 2: `routes.js`** — in `renderActions`'s library branch add, after the `saveAs` button: `b("start", "Assign this route to the charter (Start from…)", () => assignToCharter(), "", !work.route.id || work.route.points.length < 2),`. Add:

```js
  // Spec A2 T7: open this charter's route with the Start from… dialog preselecting the route being edited.
  async function assignToCharter() {
    if (!work || !work.route.id) return;
    if (!(await guardDiscard())) return;
    await A().showCharterPanel("routes", { subject: "charter", startFrom: work.route.id });
  }
```

`openStartFrom` takes an optional `preselectId`: change its signature to `async function openStartFrom(preselectId)` and, after `if (sourceRows.length) { … }`, add `const pre = sourceRows.find((s) => s.value === `library:${preselectId}`); if (pre) { pre.input.checked = true; strip.checked = false; }`. In `bind`'s charter branch, after the `focusStopId` handling, add `if (subject.startFrom) setTimeout(() => openStartFrom(subject.startFrom), 400);`. The `renderActions` call `b("start", …, openStartFrom, …)` must become `() => openStartFrom()` so the click event is not passed as `preselectId`.

- [ ] **Step 3: Verify** — on an unassigned route the new ▶ button opens the charter's route with Start from… showing that route preselected and Strip items unticked; Import works as before; the inline Start button on an empty strip still works.

- [ ] **Step 4: Commit** `feat(routes): assign an unassigned route to the charter from its own page (A2-T7)`.

---

### Task 8: Finish

- [ ] `node --test` → 111 pass; every panel loads clean; bump every `?v=admin-itin-a2b` in `index.html` to `?v=admin-itin-a2c`; commit `chore: asset version admin-itin-a2c`; push; PR; merge when David says so (auto-deploys); record in decisions.md.

## Coverage

| Feedback | Task |
|---|---|
| Yellow: empty band under the strip | 1 |
| Red: arrival editable | 2 |
| Blue: day-number picker on unassigned routes | 3 |
| Green: size sliders | 4 |
| Stop dragged off its anchorage: glyph, snap, sticky, unlink | 5 |
| Wider edges, clearer vertical names on big screens | 6 |
| Assigning the current route to the selected charter | 7 |
| Dialog hidden behind the map | done, `7e8b410` |
