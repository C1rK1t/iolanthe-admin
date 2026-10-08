# Captain round 3 — Plan: Clear route, map labels, Gantt band behaviour, topbar label, Route default (2026-10-09)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the eight items of the captain's third round (decisions.md R3-1 … R3-8): a "Clear this route" action, anchorage labels as tooltips only, the Gantt band defaulting to Quarter with month/year gridlines, the band locked open on Charter Admin and rolling over the other pages, a clearer "viewing" bar, the topbar saying NEXT ACTIVE / ACTIVE / LAST CHARTER, and Route & Itinerary opening on this charter's route.

**Architecture:** Admin only, no server change, no record change. Route items in `routes.js` / `routes-places.js` / `routes.css`; band items in `charter-gantt.js` / `charter-gantt.css` with their state in `admin.js`; the topbar label and the Route default in `admin.js`. No core-logic change, so `node --test` stays at 140; browser modules are checked with `node --check` and in the browser (Task 6). Same execution pattern as plan a2-04: branch from `main`, one Sonnet implementer per task, this session reviews each diff, browser check on the scratch server, merge on David's word (admin main auto-deploys within 5 minutes).

**Tech Stack:** Plain JS, no build. Repo `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin` from `main` at `b856468` or later.

**Shared checkout rule:** implementers never run `git checkout`, `git add .` or `git add -A`; stage files by name; confirm `git branch --show-current` prints `feat/captain-round3` before editing.

**Reading before you start:** `routes.js` (`renderActions` ~318–350, `askDrop` ~605, `editRecord` ~222, the marker loop ~530–545), `routes-places.js` (`draw` ~34–58), `charter-gantt.js` (whole file, 384 lines), `charter-gantt.css`, `admin.js` (state init 1–45, `GANTT_COLLAPSED_KEY` ~1626–1660, `ganttContext` ~1676–1702, `syncTopbar` ~1754, `bindSectionNav` ~2075, `renderCharter` ~6576–6625).

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `routes.js` | Task 1 `clearRoute` + its action button (R3-1); Task 2 waypoint tooltip rule (R3-2) |
| `routes-places.js`, `routes.css` | Task 2 anchorage label removed (R3-2) |
| `charter-gantt.js`, `charter-gantt.css` | Task 3 gridlines + banding (R3-4), locked/overlay modes (R3-5), viewing tag + legend + tooltip (R3-6) |
| `admin.js` | Task 4 default Quarter (R3-3), band state without localStorage + collapse rules (R3-5), topbar heading (R3-7), Route default (R3-8) |
| `index.html` | Task 5 asset version `admin-captain-r3` |

---

### Task 0: Branch

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin"
git checkout main && git pull && git checkout -b feat/captain-round3 && node --test 2>&1 | tail -8
```

Expected `ℹ pass 140`.

---

### Task 1: Clear this route (R3-1)

**Files:** `routes.js`

- [ ] **Step 1: The action button.** OLD:

```js
        b("start", "Start from an unassigned route or another charter…", () => openStartFrom(), "", ro || saving),
        b("saveAs", "Save as an unassigned route (items kept)", () => saveAs(false), "", work.route.points.length < 2),
```

NEW:

```js
        b("start", "Start from an unassigned route or another charter…", () => openStartFrom(), "", ro || saving),
        b("trash", "Clear this route (start afresh)", clearRoute, "", ro || saving || !work.route.points.length),
        b("saveAs", "Save as an unassigned route (items kept)", () => saveAs(false), "", work.route.points.length < 2),
```

- [ ] **Step 2: The function.** Insert before `deletePoint`. OLD:

```js
  // Deleting a point or turning a stop back into a waypoint drops that stop's items: ask first when there are any.
  async function deletePoint(i) {
```

NEW:

```js
  // Captain round 3 (R3-1): start afresh. Empties the charter route, points and items, after the popup names the
  // items it drops (or a plain confirm when there are none). The blank canvas is unsaved: Save keeps it, Cancel
  // brings everything back.
  async function clearRoute() {
    if (!work || saving || !isCharter() || readOnly() || !work.route.points.length) return;
    const items = toRecord(work.route).activities;
    if (items.length) {
      if (!(await askDrop({ days: [...new Set(items.map((a) => a.day))].sort((a, b) => a - b), items }, "Clearing the route"))) return;
    } else if (!(await A().showAdminConfirm({ title: "Clear this route?", message: "Every stop and waypoint goes. The charter route stays blank until you save.", confirmLabel: "Clear", cancelLabel: "Cancel", tone: "danger" }))) {
      return;
    }
    if (map) map.closePopup();
    editRecord((r) => ({ ...r, route: { ...r.route, points: [] }, activities: [], dirty_stop_ids: [] }), { map: true });
    status("Route cleared · Save to keep it, Cancel to bring it back", "ok");
  }

  // Deleting a point or turning a stop back into a waypoint drops that stop's items: ask first when there are any.
  async function deletePoint(i) {
```

- [ ] **Step 3: Parse check and commit.**

```bash
node --check routes.js && git add routes.js && git commit -m "feat(routes): Clear this route on a charter route (captain R3-1)"
```

---

### Task 2: Anchorage labels become tooltips; unnamed waypoints get none (R3-2)

**Files:** `routes-places.js`, `routes.js`, `routes.css`

- [ ] **Step 1: No text label on anchorage and global-stop markers.** In `routes-places.js`, OLD:

```js
        const html = `<div class="mk-anch${isStopKind ? " kind-stop" : ""} ${used.has(a.id) ? "" : "dim"}">${isStopKind ? STOP_SVG : ANCHOR_SVG}</div><div class="mk-label">${A.escapeHtml(a.name)}</div>`;
```

NEW:

```js
        // Captain round 3 (R3-2): the name is a hover tooltip (the marker's title) and in the tap popup, not a label on the map.
        const html = `<div class="mk-anch${isStopKind ? " kind-stop" : ""} ${used.has(a.id) ? "" : "dim"}">${isStopKind ? STOP_SVG : ANCHOR_SVG}</div>`;
```

- [ ] **Step 2: Waypoints without a name get no tooltip.** In `routes.js`, OLD:

```js
      const m = L.marker(ll(p), { icon: divIcon(html), draggable: ui.mode !== "delete" && !readOnly(), title: p.name || "Waypoint", zIndexOffset: c.isStop(p) ? 1100 : 1000 });
```

NEW:

```js
      const m = L.marker(ll(p), { icon: divIcon(html), draggable: ui.mode !== "delete" && !readOnly(), title: c.isStop(p) ? (p.name || "Stop") : (p.name || ""), zIndexOffset: c.isStop(p) ? 1100 : 1000 });   // R3-2: plain waypoints have no tooltip
```

- [ ] **Step 3: CSS comment.** In `routes.css`, OLD:

```css
.routes-panel .mk-label { position: absolute; top: 30px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 11px; font-weight: 700; color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000; pointer-events: none; }
```

NEW:

```css
.routes-panel .mk-label { position: absolute; top: 30px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 11px; font-weight: 700; color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000; pointer-events: none; }   /* imported pins only; anchorages use tooltips (R3-2) */
```

- [ ] **Step 4: Parse check and commit.**

```bash
node --check routes-places.js && node --check routes.js && git add routes-places.js routes.js routes.css && git commit -m "feat(routes): anchorage names as tooltips, no tooltip on plain waypoints (captain R3-2)"
```

---

### Task 3: The band — gridlines, banding, viewing tag, legend, locked and overlay modes (R3-4, R3-5, R3-6)

**Files:** `charter-gantt.js`, `charter-gantt.css`

- [ ] **Step 1: Header comment.** OLD:

```js
// The charter Gantt band (spec-charters §6). Read-only: drag pans, wheel zooms, click selects / opens.
// mount(host, ctx) → {update(ctx), destroy()}. ctx: {charters, periods, selectedId, activeId, forcedId, today,
// zoom, collapsed, canManage, onSelectCharter(id), onOpenPeriod(id|null), onCreateCharter(),
// onZoomChange(level), onToggleCollapsed(bool)}.
```

NEW:

```js
// The charter Gantt band (spec-charters §6; captain round 3 R3-4..6). Read-only: drag pans, wheel zooms, click selects / opens.
// mount(host, ctx) → {update(ctx), attach(host), destroy()}. ctx: {charters, periods, selectedId, activeId, forcedId, today,
// zoom, collapsed, locked (no Collapse button), overlay (an expanded band floats over the page instead of reflowing it),
// canManage, onSelectCharter(id), onOpenPeriod(id|null), onCreateCharter(), onZoomChange(level), onToggleCollapsed(bool)}.
```

- [ ] **Step 2: Month header banding, year boundaries and the gridlines.** In `drawTrack`, OLD:

```js
      const months = el("div", { class: "gantt-months" });
      core.visibleMonths(range.start, range.end).forEach((m) => {
        const w = (core.dayIndex(m.end) - core.dayIndex(m.start) + 1) * pxPerDay;
        months.appendChild(el("span", { style: `left:${xOf(m.start)}px;width:${w}px`, text: w > 40 ? m.label : "" }));
      });
      track.appendChild(months);
```

NEW:

```js
      // R3-4: alternate months banded, a bolder line where a year starts, and faint month lines down through the lanes.
      const months = el("div", { class: "gantt-months" });
      const grid = el("div", { class: "gantt-grid" });
      core.visibleMonths(range.start, range.end).forEach((m, i) => {
        const w = (core.dayIndex(m.end) - core.dayIndex(m.start) + 1) * pxPerDay;
        const isYear = m.start.slice(5) === "01-01";
        const isMonthStart = m.start.slice(8) === "01";
        months.appendChild(el("span", { class: `${i % 2 ? "alt" : ""}${isYear ? " is-year" : ""}`.trim(), style: `left:${xOf(m.start)}px;width:${w}px`, text: w > 40 ? m.label : "" }));
        if (isMonthStart) grid.appendChild(el("span", { class: isYear ? "is-year" : "", style: `left:${xOf(m.start)}px` }));
      });
      track.appendChild(months);
      track.appendChild(grid);
```

- [ ] **Step 3: The viewing tag on the selected bar.** In `barEl`, OLD:

```js
      }, [el("span", { class: "gantt-bar-name", text: w > 40 ? bar.name : "" }), meta ? el("small", { text: meta }) : null]);
      return node;
```

NEW:

```js
      }, [
        el("span", { class: "gantt-bar-name", text: w > 40 ? bar.name : "" }),
        meta ? el("small", { text: meta }) : null,
        bar.kind === "charter" && bar.id === ctx.selectedId && w > 90 ? el("small", { class: "gantt-viewing", text: "viewing" }) : null   // R3-6
      ]);
      return node;
```

- [ ] **Step 4: The tooltip says Viewing.** In `showTip`, OLD:

```js
        ? [bar.name, core.fmtRange(bar.start_date, bar.end_date), `${bar.nights} nights · ${bar.guests} guests · ${bar.stops} stops`, bar.id === ctx.activeId ? "Active" : bar.status.replace("-", " ")]
```

NEW:

```js
        ? [bar.name, core.fmtRange(bar.start_date, bar.end_date), `${bar.nights} nights · ${bar.guests} guests · ${bar.stops} stops`, `${bar.id === ctx.activeId ? "Active" : bar.status.replace("-", " ")}${bar.id === ctx.selectedId ? " · viewing" : ""}`]
```

- [ ] **Step 5: Legend in the toolbar; Collapse only when not locked.** In `toolbar`, OLD:

```js
      return el("div", { class: "gantt-toolbar" }, [
        el("div", { class: "gantt-title" }, [el("strong", { text: "Charters" }), el("span", { class: "gantt-span" })]),
        iconBtn("left", "Scroll left", { onclick: () => { viewport.scrollLeft -= viewport.clientWidth / 4; syncTitle(); } }),
        iconBtn("right", "Scroll right", { onclick: () => { viewport.scrollLeft += viewport.clientWidth / 4; syncTitle(); } }),
        iconBtn("today", "Jump to today", { onclick: () => centreOn(ctx.today) }),
        el("span", { class: "gantt-sep" }),
        zoom,
        noDatesPill,
        el("span", { class: "gantt-sep" }),
        iconBtn("add", "New charter", { disabled: !ctx.canManage, onclick: () => ctx.onCreateCharter() }),
        iconBtn("reserve", "Reserved period", { disabled: !ctx.canManage, onclick: () => ctx.onOpenPeriod(null) }),
        el("span", { class: "gantt-sep" }),
        iconBtn("collapse", "Collapse", { onclick: () => { ctx.collapsed = true; ctx.onToggleCollapsed(true); render(); } })
      ]);
```

NEW:

```js
      // R3-6: a two-swatch legend (gold = active, outlined = viewing). R3-5: no Collapse button while the band is locked open.
      const legend = el("span", { class: "gantt-legend", "aria-hidden": "true" }, [
        el("i", { class: "is-active" }), el("span", { text: "active" }),
        el("i", { class: "is-selected" }), el("span", { text: "viewing" })
      ]);
      return el("div", { class: "gantt-toolbar" }, [
        el("div", { class: "gantt-title" }, [el("strong", { text: "Charters" }), el("span", { class: "gantt-span" })]),
        iconBtn("left", "Scroll left", { onclick: () => { viewport.scrollLeft -= viewport.clientWidth / 4; syncTitle(); } }),
        iconBtn("right", "Scroll right", { onclick: () => { viewport.scrollLeft += viewport.clientWidth / 4; syncTitle(); } }),
        iconBtn("today", "Jump to today", { onclick: () => centreOn(ctx.today) }),
        el("span", { class: "gantt-sep" }),
        zoom,
        noDatesPill,
        el("span", { class: "gantt-sep" }),
        legend,
        el("span", { class: "gantt-sep" }),
        iconBtn("add", "New charter", { disabled: !ctx.canManage, onclick: () => ctx.onCreateCharter() }),
        iconBtn("reserve", "Reserved period", { disabled: !ctx.canManage, onclick: () => ctx.onOpenPeriod(null) }),
        ctx.locked ? null : el("span", { class: "gantt-sep" }),
        ctx.locked ? null : iconBtn("collapse", "Collapse", { onclick: () => { ctx.collapsed = true; ctx.onToggleCollapsed(true); render(); } })
      ]);
```

- [ ] **Step 6: Overlay class on the root and the host.** In `render`, OLD:

```js
    function render(view) {
      hideTip();
      host.replaceChildren();
      root = el("section", { class: `charter-gantt${ctx.collapsed ? " is-collapsed" : ""}`, tabindex: "0", "aria-label": "Charter timeline" });
      host.appendChild(root);
```

NEW:

```js
    // R3-5: when ctx.overlay is set an expanded band floats over the page content; the host keeps the strip's height.
    function syncOverlay() {
      host.classList.toggle("is-overlay", Boolean(ctx.overlay && !ctx.collapsed));
    }

    function render(view) {
      hideTip();
      host.replaceChildren();
      root = el("section", { class: `charter-gantt${ctx.collapsed ? " is-collapsed" : ""}${ctx.overlay && !ctx.collapsed ? " is-overlay" : ""}`, tabindex: "0", "aria-label": "Charter timeline" });
      host.appendChild(root);
      syncOverlay();
```

and in `attach` / `destroy`, OLD:

```js
      attach(nextHost) {
        hideTip();
        const view = currentView();
        host = nextHost;
        host.replaceChildren(root);
        if (view) afterLayout(() => { if (viewport.isConnected) restoreView(view); });
      },
      destroy() {
        hideTip();
        window.removeEventListener("resize", onResize);
        host.replaceChildren();
      }
```

NEW:

```js
      attach(nextHost) {
        hideTip();
        const view = currentView();
        host.classList.remove("is-overlay");
        host = nextHost;
        host.replaceChildren(root);
        syncOverlay();
        if (view) afterLayout(() => { if (viewport.isConnected) restoreView(view); });
      },
      destroy() {
        hideTip();
        window.removeEventListener("resize", onResize);
        host.classList.remove("is-overlay");
        host.replaceChildren();
      }
```

- [ ] **Step 7: CSS.** In `charter-gantt.css`, OLD:

```css
.charter-gantt .gantt-months span {
  position: absolute; top: 0; height: 22px; line-height: 22px; padding: 0 6px; box-sizing: border-box; overflow: hidden; white-space: nowrap;
  border-right: 1px solid var(--line); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted);
}
```

NEW:

```css
.charter-gantt .gantt-months span {
  position: absolute; top: 0; height: 22px; line-height: 22px; padding: 0 6px; box-sizing: border-box; overflow: hidden; white-space: nowrap;
  border-right: 1px solid var(--line); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted);
}
/* R3-4: banded month headers, a bolder year boundary, faint month lines through the lanes */
.charter-gantt .gantt-months span.alt { background: #dde4e8; }
.charter-gantt .gantt-months span.is-year { border-left: 2px solid rgba(29, 53, 64, 0.45); }
.charter-gantt .gantt-grid { position: absolute; top: 22px; left: 0; right: 0; bottom: 0; pointer-events: none; }
.charter-gantt .gantt-grid span { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px solid rgba(29, 53, 64, 0.14); }
.charter-gantt .gantt-grid span.is-year { border-left: 2px solid rgba(29, 53, 64, 0.45); }
```

and OLD:

```css
.charter-gantt .gantt-bar.is-active { background: var(--gold); color: var(--ink); }
.charter-gantt .gantt-bar.is-selected { box-shadow: 0 0 0 3px var(--ink); }
```

NEW:

```css
.charter-gantt .gantt-bar.is-active { background: var(--gold); color: var(--ink); }
/* R3-6: the bar being viewed is unmistakable: dark fill, thick outline and a VIEWING tag; an active one stays gold */
.charter-gantt .gantt-bar.is-selected { box-shadow: 0 0 0 3px var(--ink); background: var(--accent-dark); }
.charter-gantt .gantt-bar.is-selected.is-active { background: var(--gold); }
.charter-gantt .gantt-viewing { font-weight: 700; opacity: 1; margin-left: 6px; padding: 0 5px; border-radius: 4px; background: var(--ink); color: #fff; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; vertical-align: 1px; }
.charter-gantt .gantt-legend { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; color: var(--muted); white-space: nowrap; }
.charter-gantt .gantt-legend i { display: inline-block; width: 14px; height: 10px; border-radius: 3px; }
.charter-gantt .gantt-legend i.is-active { background: var(--gold); }
.charter-gantt .gantt-legend i.is-selected { background: var(--accent-dark); box-shadow: 0 0 0 2px var(--ink); margin-left: 6px; }
```

and OLD:

```css
.charter-gantt.is-collapsed { padding: 0.45rem 0.8rem; }
```

NEW:

```css
.charter-gantt.is-collapsed { padding: 0.45rem 0.8rem; }
/* R3-5: on every page but Charter Admin an expanded band floats over the page; the host holds the strip's height */
.charter-gantt-host { position: relative; z-index: 20; }
.charter-gantt-host.is-overlay { min-height: 54px; }
.charter-gantt.is-overlay { position: absolute; top: 0; left: 0; right: 0; box-shadow: 0 18px 40px rgba(16, 32, 40, 0.38); }
```

- [ ] **Step 8: Parse check and commit.**

```bash
node --check charter-gantt.js && git add charter-gantt.js charter-gantt.css && git commit -m "feat(gantt): month/year gridlines and banding, viewing tag and legend, locked and overlay modes (captain R3-4..6)"
```

---

### Task 4: admin.js — default Quarter, band state, topbar heading, Route default (R3-3, R3-5, R3-7, R3-8)

**Files:** `admin.js`

- [ ] **Step 1: State defaults.** OLD:

```js
    ganttZoom: "active",
    gantt: null,
```

NEW:

```js
    ganttZoom: "quarter",   // captain R3-3: three months by default
    gantt: null,
    ganttOpen: false,       // R3-5: the band has been expanded over a page other than Charter Admin (reset on every charter render)
```

and OLD:

```js
    routesSubject: "library",
```

NEW:

```js
    routesSubject: "charter",   // captain R3-8: Route & Itinerary opens on this charter's route
```

- [ ] **Step 2: No per-browser memory of the band; the page decides.** OLD:

```js
  const GANTT_COLLAPSED_KEY = "iolanthe-admin.gantt.collapsed";
```

NEW:

```js
  // R3-5: the band is locked open on Charter Admin and starts collapsed everywhere else; nothing is remembered per browser.
  const ganttLocked = () => state.sectionPanels.charter === "info";
```

and OLD (the two functions, verbatim):

```js
  function ganttCollapsedDefault() {
    try {
      const stored = window.localStorage.getItem(GANTT_COLLAPSED_KEY);
      if (stored === "true" || stored === "false") {
        return stored === "true";
      }
    } catch (error) {
      // localStorage unavailable: fall through to the panel default.
    }
    return state.sectionPanels.charter === "routes";
  }

  function rememberGanttCollapsed(collapsed) {
    try {
      window.localStorage.setItem(GANTT_COLLAPSED_KEY, collapsed ? "true" : "false");
    } catch (error) {
      // ignore
    }
  }
```

NEW:

```js
  function ganttCollapsedDefault() {
    return !ganttLocked() && !state.ganttOpen;
  }
```

- [ ] **Step 3: The band context.** OLD:

```js
      zoom: state.ganttZoom,
      collapsed: ganttCollapsedDefault(),
      canManage: canManageCharterAdmin(),
      onSelectCharter: async charterId => {
        if (charterId === state.selectedCharter || !state.charters.some(charter => charter.id === charterId)) {
          return;
        }
        if (!await confirmDiscardPageChanges()) {
          return;
        }
        state.selectedCharter = charterId;
        state.bundle = null;
        renderCharter();
      },
      onOpenPeriod: periodId => openReservedPeriodModal(periodId),
      onCreateCharter: openCreateCharterModal,
      onZoomChange: level => { state.ganttZoom = level; },
      onToggleCollapsed: rememberGanttCollapsed
```

NEW:

```js
      zoom: state.ganttZoom,
      collapsed: ganttCollapsedDefault(),
      locked: ganttLocked(),
      overlay: !ganttLocked(),
      canManage: canManageCharterAdmin(),
      onSelectCharter: async charterId => {
        if (charterId === state.selectedCharter || !state.charters.some(charter => charter.id === charterId)) {
          return;
        }
        if (!await confirmDiscardPageChanges()) {
          return;
        }
        state.selectedCharter = charterId;
        state.bundle = null;
        state.ganttOpen = false;   // R3-5: picking a charter rolls the band back up
        renderCharter();
      },
      onOpenPeriod: periodId => openReservedPeriodModal(periodId),
      onCreateCharter: openCreateCharterModal,
      onZoomChange: level => { state.ganttZoom = level; },
      onToggleCollapsed: collapsed => { state.ganttOpen = !collapsed; }
```

- [ ] **Step 4: The topbar heading.** OLD:

```js
  function activeCharterLabel() {
    const active = state.charters.find(charter => charter.id === state.activeCharter);
    return active ? (active.name || active.id) : (state.activeCharter || "None");
  }
```

NEW:

```js
  function activeCharterLabel() {
    const active = state.charters.find(charter => charter.id === state.activeCharter);
    return active ? (active.name || active.id) : (state.activeCharter || "None");
  }

  // Captain R3-7: the topbar says which kind of "active" this is.
  function activeCharterHeading() {
    const active = state.charters.find(charter => charter.id === state.activeCharter);
    const status = active && window.IolantheChartersCore ? window.IolantheChartersCore.charterStatus(active, adminToday()) : "no-dates";
    if (status === "upcoming") return "Next Active Charter";
    if (status === "ended") return "Last Charter";
    return "Active Charter";
  }
```

and OLD:

```js
    els.activeSummary.querySelector("strong").textContent = activeCharterLabel();
```

NEW:

```js
    els.activeSummary.querySelector("span").textContent = activeCharterHeading();
    els.activeSummary.querySelector("strong").textContent = activeCharterLabel();
```

- [ ] **Step 5: The nav lands Route & Itinerary on this charter's route.** In `bindSectionNav`, OLD:

```js
        state.sectionPanels[section] = button.dataset.panel;
        renderFn();
```

NEW:

```js
        state.sectionPanels[section] = button.dataset.panel;
        if (section === "charter" && button.dataset.panel === "routes") state.routesSubject = "charter";   // captain R3-8
        renderFn();
```

- [ ] **Step 6: Every charter render starts with the band rolled up (unless locked).** In `renderCharter`, OLD:

```js
    const activePanel = panels.some(panel => panel.id === state.sectionPanels.charter) ? state.sectionPanels.charter : "info";
    state.sectionPanels.charter = activePanel;
    const paint = contentHtml => {
```

NEW:

```js
    const activePanel = panels.some(panel => panel.id === state.sectionPanels.charter) ? state.sectionPanels.charter : "info";
    state.sectionPanels.charter = activePanel;
    state.ganttOpen = false;   // R3-5: a page change or a charter change rolls the band up again
    const paint = contentHtml => {
```

- [ ] **Step 7: Parse check, grep, commit.**

```bash
node --check admin.js && grep -c "GANTT_COLLAPSED_KEY\|rememberGanttCollapsed" admin.js; git add admin.js && git commit -m "feat(admin): Gantt defaults to Quarter, locked on Charter Admin and overlay elsewhere, NEXT ACTIVE / LAST CHARTER heading, Route opens on the charter route (captain R3-3,5,7,8)"
```

Expected grep count `0`.

---

### Task 5: Asset version

**Files:** `index.html`

- [ ] **Step 1:** replace every `?v=admin-menu-1` with `?v=admin-captain-r3` (keep the `?v=1` icon links).

```bash
sed -i 's/?v=admin-menu-1/?v=admin-captain-r3/g' index.html && grep -c "admin-captain-r3" index.html && grep -c "admin-menu-1" index.html
```

Expected the first count ≥ 18 and the second `0`.

- [ ] **Step 2: Commit.**

```bash
git add index.html && git commit -m "chore: asset version admin-captain-r3"
```

---

### Task 6: Browser verification (this session, scratch server)

Scratch admin at `http://127.0.0.1:8000/admin/?key=<admin.urlKey>` (the pane refuses `localhost:8000`), Charter Admin login.

- [ ] **R3-1** on csaba's route: the trash button is enabled; pressing it names the items; ✓ empties the strip and the map (fit pill "—", "No stops yet"); Cancel brings the route back; Save after clearing persists an empty record (then Start from… restores a route).
- [ ] **R3-2** anchorage markers show no text; hovering shows the name; a plain waypoint shows no tooltip, a named one does; stop numbers keep their name tooltip; imported pins still carry labels.
- [ ] **R3-3** a fresh load of Charter Admin shows the band at Quarter (three months in the title).
- [ ] **R3-4** month lines through the lanes, a bolder line at 1 Jan 2027, banded month headers.
- [ ] **R3-5** Charter Admin: band open, no Collapse button. Route & Itinerary: strip only; Expand rolls the band over the map without moving it (the page below does not shift); picking another charter collapses it; Collapse collapses it; switching pages collapses it; nothing in localStorage under `iolanthe-admin.gantt.collapsed` is read any more.
- [ ] **R3-6** the selected bar is dark with the outline and a VIEWING tag; the active one gold; both when the same; legend in the toolbar; tooltip ends "· viewing".
- [ ] **R3-7** with the active charter in the future the topbar reads NEXT ACTIVE CHARTER; make a past charter active (temporarily) → LAST CHARTER; one underway → ACTIVE CHARTER.
- [ ] **R3-8** clicking Route & Itinerary in the nav opens this charter's route even after an unassigned route was open.
- [ ] `node --test` → 140; no console errors on each Charter page, Galley and Hotel.

Then PR `feat/captain-round3` → `main`; merge on David's word.
