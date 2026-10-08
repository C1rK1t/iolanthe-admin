# Captain round 3b — Plan: eye icon, 24-hour times, smooth band roll, click-anywhere strip (2026-10-09)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The captain's immediate feedback on round 3 (decisions.md R3b-1 … R3b-4): the VIEWING tag becomes an eye icon before the bar's name; every time display and picker is 24-hour (admin and guest); the band rolls up and down as a smooth transition; a click anywhere on the rolled-up strip rolls it down.

**Architecture:** `charter-gantt.js` keeps both folds (the strip and the body) in the DOM and toggles a class, so the roll is a CSS `grid-template-rows` transition instead of a re-render. The Charter Info arrival time uses the Route page's hour/minute selects (`IolantheRoutesUi.timeSelects`) with a hidden input carrying the value for save and the dirty guard. Every `Intl` / `toLocale*` time formatter gains `hour12: false`. Two repos: admin (Tasks 1–3) and guest (Task 4). No core change: admin `node --test` stays at 146, guest at 15.

**Tech Stack:** Plain JS, no build. Admin repo `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin` from `main` at `21d0983` or later; guest repo `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-guest` from `main` at `d515f4f` or later.

**Shared checkout rule:** implementers never run `git checkout`, `git add .` or `git add -A`; stage files by name; confirm the branch with `git branch --show-current` before editing (`feat/captain-round3b` in the admin repo, `feat/times-24h` in the guest repo).

---

## File structure

| Repo / file | Responsibility in this plan |
|---|---|
| admin `charter-gantt.js`, `charter-gantt.css` | Task 1: eye icon (R3b-1), folds + transition (R3b-3), strip click (R3b-4) |
| admin `admin.js`, `admin.css` | Task 2: arrival time as 24-hour selects, `hour12: false` on the two report stamps (R3b-2) |
| admin `index.html` | Task 3: asset version `admin-captain-r3b` |
| guest `guest.js`, `index.html`, `sw.js` | Task 4: `hour12: false` on six formatters, versions `guest-b-3` / static cache v7 (R3b-2) |

---

### Task 0: Branches

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin"
git checkout main && git pull && git checkout -b feat/captain-round3b && node --test 2>&1 | tail -8
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-guest"
git checkout main && git pull && git checkout -b feat/times-24h && node --test 2>&1 | tail -8
```

Expected `ℹ pass 146` and `ℹ pass 15`. (This session does Task 0 itself.)

---

### Task 1: The band — eye icon, folds with a transition, click-anywhere strip (R3b-1, R3b-3, R3b-4)

**Files:** `charter-gantt.js`, `charter-gantt.css`

- [ ] **Step 1: The eye icon.** OLD:

```js
    collapse: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'
  };
```

NEW:

```js
    collapse: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="3"/></svg>'
  };
```

- [ ] **Step 2: The eye before the bar's name (replaces the VIEWING tag).** In `barEl`, OLD:

```js
      }, [
        el("span", { class: "gantt-bar-name", text: w > 40 ? bar.name : "" }),
        meta ? el("small", { text: meta }) : null,
        bar.kind === "charter" && bar.id === ctx.selectedId && w > 90 ? el("small", { class: "gantt-viewing", text: "viewing" }) : null   // R3-6
      ]);
      return node;
```

NEW:

```js
      }, [
        bar.kind === "charter" && bar.id === ctx.selectedId ? el("span", { class: "gantt-eye", html: ICONS.eye, title: "Viewing" }) : null,   // R3b-1
        el("span", { class: "gantt-bar-name", text: w > 40 ? bar.name : "" }),
        meta ? el("small", { text: meta }) : null
      ]);
      return node;
```

and the bar's click rolls an overlay band up before the charter changes. OLD:

```js
        onclick: () => {
          if (Date.now() < suppressClickUntil) return;
          if (bar.kind === "charter") ctx.onSelectCharter(bar.id); else ctx.onOpenPeriod(bar.id);
        },
```

NEW:

```js
        onclick: () => {
          if (Date.now() < suppressClickUntil) return;
          if (bar.kind === "charter") {
            if (ctx.overlay && !ctx.collapsed) setCollapsed(true);   // R3b-3: roll up smoothly, then the page re-renders
            ctx.onSelectCharter(bar.id);
          } else {
            ctx.onOpenPeriod(bar.id);
          }
        },
```

- [ ] **Step 3: The legend uses the eye.** In `toolbar`, OLD:

```js
      const legend = el("span", { class: "gantt-legend", "aria-hidden": "true" }, [
        el("i", { class: "is-active" }), el("span", { text: "active" }),
        el("i", { class: "is-selected" }), el("span", { text: "viewing" })
      ]);
```

NEW:

```js
      const legend = el("span", { class: "gantt-legend", "aria-hidden": "true" }, [
        el("i", { class: "is-active" }), el("span", { text: "active" }),
        el("span", { class: "gantt-eye", html: ICONS.eye }), el("span", { text: "viewing" })
      ]);
```

- [ ] **Step 4: Collapse / Expand go through `setCollapsed`.** In `toolbar`, OLD:

```js
        ctx.locked ? null : iconBtn("collapse", "Collapse", { onclick: () => { ctx.collapsed = true; ctx.onToggleCollapsed(true); render(); } })
```

NEW:

```js
        ctx.locked ? null : iconBtn("collapse", "Collapse", { onclick: () => setCollapsed(true) })
```

In `strip`, OLD:

```js
      return el("div", { class: "gantt-strip" }, [
        el("strong", { text: sel ? (sel.name || sel.id) : "Charters" }),
        el("span", { class: "gantt-strip-dates", text: dates + (n !== null ? ` · ${n} nights` : "") }),
        el("span", { class: `status-pill status-pill--${pill.tone}`, text: pill.text }),
        el("span", { class: "gantt-strip-grow" }),
        iconBtn("expand", "Expand", { onclick: () => { ctx.collapsed = false; ctx.onToggleCollapsed(false); render(); } })
      ]);
```

NEW:

```js
      // R3b-4: the whole strip is the Expand control (click, Enter or Space), not just the button at its end.
      return el("div", {
        class: "gantt-strip", role: "button", tabindex: "0", "aria-label": "Expand the charter timeline",
        onclick: (e) => { if (!e.target.closest("button, select, a")) setCollapsed(false); },
        onkeydown: (e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); setCollapsed(false); } }
      }, [
        el("strong", { text: sel ? (sel.name || sel.id) : "Charters" }),
        el("span", { class: "gantt-strip-dates", text: dates + (n !== null ? ` · ${n} nights` : "") }),
        el("span", { class: `status-pill status-pill--${pill.tone}`, text: pill.text }),
        el("span", { class: "gantt-strip-grow" }),
        iconBtn("expand", "Expand", { onclick: () => setCollapsed(false) })
      ]);
```

- [ ] **Step 5: Both folds always in the DOM; `setCollapsed` toggles them.** Replace the whole `render` function. OLD:

```js
    function render(view) {
      hideTip();
      host.replaceChildren();
      root = el("section", { class: `charter-gantt${ctx.collapsed ? " is-collapsed" : ""}${ctx.overlay && !ctx.collapsed ? " is-overlay" : ""}`, tabindex: "0", "aria-label": "Charter timeline" });
      host.appendChild(root);
      syncOverlay();
      if (ctx.collapsed) {
        root.appendChild(strip());
        return;
      }
      root.appendChild(toolbar());
      viewport = el("div", { class: "gantt-viewport" });
      track = el("div", { class: "gantt-track" });
      viewport.appendChild(track);
      root.appendChild(viewport);
      if (!(ctx.charters || []).length) {
        root.appendChild(el("p", { class: "gantt-empty", text: "Use + to create your first charter." }));
      }
      bindPan();
      // Width is only known once laid out. A timeout, not requestAnimationFrame: rAF never fires in a hidden tab.
      afterLayout(() => {
        if (!viewport.isConnected) return;
        if (view) restoreView(view); else applyZoom(ctx.zoom);
      });
    }
```

NEW:

```js
    // R3b-3: the strip and the body are both in the DOM; collapsing toggles a class and CSS rolls the folds, so the
    // change is a transition, not a re-render. The body is drawn even while folded (its width is known).
    function render(view) {
      hideTip();
      host.replaceChildren();
      root = el("section", { class: `charter-gantt${ctx.collapsed ? " is-collapsed" : ""}${ctx.overlay && !ctx.collapsed ? " is-overlay" : ""}`, tabindex: "0", "aria-label": "Charter timeline" });
      host.appendChild(root);
      syncOverlay();
      root.appendChild(el("div", { class: "gantt-fold gantt-fold--strip" }, [el("div", {}, [strip()])]));
      const body = el("div", {});
      body.appendChild(toolbar());
      viewport = el("div", { class: "gantt-viewport" });
      track = el("div", { class: "gantt-track" });
      viewport.appendChild(track);
      body.appendChild(viewport);
      if (!(ctx.charters || []).length) {
        body.appendChild(el("p", { class: "gantt-empty", text: "Use + to create your first charter." }));
      }
      root.appendChild(el("div", { class: "gantt-fold gantt-fold--body" }, [body]));
      bindPan();
      // Width is only known once laid out. A timeout, not requestAnimationFrame: rAF never fires in a hidden tab.
      afterLayout(() => {
        if (!viewport.isConnected) return;
        if (view) restoreView(view); else applyZoom(ctx.zoom);
      });
    }

    function setCollapsed(collapsed) {
      if (ctx.locked && collapsed) return;
      hideTip();
      ctx.collapsed = collapsed;
      ctx.onToggleCollapsed(collapsed);
      root.classList.toggle("is-collapsed", collapsed);
      root.classList.toggle("is-overlay", Boolean(ctx.overlay && !collapsed));
      syncOverlay();
      if (!collapsed) afterLayout(() => { if (viewport.isConnected) { if (pxPerDay) syncTitle(); else applyZoom(ctx.zoom); } });
    }
```

- [ ] **Step 6: `onResize` redraws whenever the body has been drawn** (it is drawn while folded too). OLD:

```js
    const onResize = () => { if (!ctx.collapsed && pxPerDay && viewport && viewport.isConnected) { drawTrack(); syncTitle(); } };
```

NEW:

```js
    const onResize = () => { if (pxPerDay && viewport && viewport.isConnected) { drawTrack(); syncTitle(); } };
```

- [ ] **Step 7: CSS.** In `charter-gantt.css`, OLD:

```css
.charter-gantt .gantt-viewing { font-weight: 700; opacity: 1; margin-left: 6px; padding: 0 5px; border-radius: 4px; background: var(--ink); color: #fff; font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.05em; vertical-align: 1px; }
.charter-gantt .gantt-legend { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; color: var(--muted); white-space: nowrap; }
.charter-gantt .gantt-legend i { display: inline-block; width: 14px; height: 10px; border-radius: 3px; }
.charter-gantt .gantt-legend i.is-active { background: var(--gold); }
.charter-gantt .gantt-legend i.is-selected { background: var(--accent-dark); box-shadow: 0 0 0 2px var(--ink); margin-left: 6px; }
```

NEW:

```css
/* R3b-1: an eye before the name marks the bar being viewed (the tag at the end was clipped) */
.charter-gantt .gantt-eye { display: inline-block; width: 15px; height: 15px; margin-right: 5px; vertical-align: -3px; }
.charter-gantt .gantt-eye svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; display: block; }
.charter-gantt .gantt-legend { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; color: var(--muted); white-space: nowrap; }
.charter-gantt .gantt-legend i { display: inline-block; width: 14px; height: 10px; border-radius: 3px; }
.charter-gantt .gantt-legend i.is-active { background: var(--gold); }
.charter-gantt .gantt-legend .gantt-eye { margin-left: 6px; margin-right: 0; color: var(--ink); }
```

and OLD:

```css
.charter-gantt.is-collapsed { padding: 0.45rem 0.8rem; }
```

NEW:

```css
.charter-gantt.is-collapsed { padding: 0.45rem 0.8rem; }
/* R3b-3: the strip and the body are folds that roll with a transition; R3b-4: the strip is a button */
.charter-gantt { transition: padding 260ms ease; }
.charter-gantt .gantt-fold { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 260ms ease; }
.charter-gantt .gantt-fold > div { min-height: 0; overflow: hidden; }
.charter-gantt.is-collapsed .gantt-fold--body { grid-template-rows: 0fr; }
.charter-gantt:not(.is-collapsed) .gantt-fold--strip { grid-template-rows: 0fr; }
.charter-gantt .gantt-strip { cursor: pointer; border-radius: 6px; }
.charter-gantt .gantt-strip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .charter-gantt, .charter-gantt .gantt-fold { transition: none; } }
```

- [ ] **Step 8: Parse check and commit.**

```bash
node --check charter-gantt.js && grep -c "gantt-viewing" charter-gantt.js charter-gantt.css; git add charter-gantt.js charter-gantt.css && git commit -m "feat(gantt): eye icon before the viewed bar, folds roll with a transition, click anywhere on the strip expands (captain R3b-1,3,4)"
```

Expected grep counts `0` and `0`.

---

### Task 2: 24-hour times in the admin (R3b-2)

**Files:** `admin.js`, `admin.css`

- [ ] **Step 1: The arrival time control.** OLD:

```js
                ${charterInfoField("charter-info-arrival-time", "Time", `<input id="charter-info-arrival-time" type="time" value="${escapeAttribute(charterInfo.arrival?.time || "")}">`)}
```

NEW:

```js
                ${charterInfoField("charter-info-arrival-time", "Time", `<input id="charter-info-arrival-time" type="hidden" value="${escapeAttribute(charterInfo.arrival?.time || "")}"><span id="charter-info-arrival-time-ui" class="time-selects-host"></span>`)}
```

- [ ] **Step 2: Mount the hour/minute selects when the panel binds.** OLD:

```js
    form.addEventListener("input", syncTiles);
    syncCharterInfoOverlap();

    bindSettingsFormController({
      formId: "charter-info-form",
```

NEW:

```js
    form.addEventListener("input", syncTiles);
    syncCharterInfoOverlap();

    // Captain R3b-2: a 24-hour arrival time (the Route page's hour/minute selects). The hidden input carries the value
    // for readCharterInfoForm, and the dispatched input event keeps the form's dirty tracking honest.
    const arrivalTime = document.getElementById("charter-info-arrival-time");
    const arrivalHost = document.getElementById("charter-info-arrival-time-ui");
    if (arrivalTime && arrivalHost && window.IolantheRoutesUi) {
      const picker = window.IolantheRoutesUi.timeSelects({
        value: arrivalTime.value, allowBlank: true, title: "Arrival time (24-hour)",
        onChange: value => { arrivalTime.value = value; arrivalTime.dispatchEvent(new Event("input", { bubbles: true })); }
      });
      arrivalHost.replaceChildren(picker.root);
    }

    bindSettingsFormController({
      formId: "charter-info-form",
```

- [ ] **Step 3: The two report stamps.** OLD (occurs twice; replace both):

```js
    const generatedAt = new Date().toLocaleString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
```

NEW:

```js
    const generatedAt = new Date().toLocaleString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
```

(This step is the one exception to "occurs exactly once": the block occurs exactly twice, at the drink stock report and the alcohol invoice; replace both.)

- [ ] **Step 4: Styles for the selects inside the Charter Info form.** In `admin.css`, OLD:

```css
.charter-info-columns > div {
  display: grid;
  gap: 0.8rem;
}
```

NEW:

```css
.charter-info-columns > div {
  display: grid;
  gap: 0.8rem;
}

/* R3b-2: the arrival time's hour/minute selects sit side by side like one field */
.time-selects-host { display: block; }
.time-selects-host .time-selects { display: inline-flex; align-items: center; gap: 4px; }
.time-selects-host .time-selects select { width: auto; min-width: 4.5rem; }
.time-selects-host .time-colon { font-weight: 700; }
```

- [ ] **Step 5: Parse check and commit.**

```bash
node --check admin.js && grep -c 'type="time"' admin.js; grep -c "hour12: false" admin.js; git add admin.js admin.css && git commit -m "feat(admin): 24-hour arrival time selects and report stamps (captain R3b-2)"
```

Expected `0` and `2`.

---

### Task 3: Admin asset version

**Files:** `index.html`

- [ ] **Step 1:**

```bash
sed -i 's/?v=admin-captain-r3\b/?v=admin-captain-r3b/g' index.html && grep -c "admin-captain-r3b" index.html && grep -c "admin-captain-r3\"" index.html
```

Expected `21` and `0`.

- [ ] **Step 2: Commit.**

```bash
git add index.html && git commit -m "chore: asset version admin-captain-r3b"
```

---

### Task 4: 24-hour times in the guest (R3b-2)

**Repo:** `S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-guest`, branch `feat/times-24h`. **Files:** `guest.js`, `index.html`, `sw.js`

- [ ] **Step 1: Six formatters.** Each OLD occurs exactly once unless noted.

(a) OLD:

```js
      return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
```

NEW:

```js
      return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
```

(b) OLD:

```js
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
```

NEW:

```js
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
```

(c) OLD:

```js
          ? `Live NMEA update ${new Date(updatedAt).toLocaleTimeString()}.${windNote}${routeNote}`
```

NEW:

```js
          ? `Live NMEA update ${new Date(updatedAt).toLocaleTimeString([], { hour12: false })}.${windNote}${routeNote}`
```

(d) OLD (occurs exactly twice, in `formatOptionalClock` and `formatClockLegacy`; replace both):

```js
      return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit"
      }).format(date);
```

NEW:

```js
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(date);
```

(e) OLD:

```js
      clock.textContent = new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date());
```

NEW:

```js
      clock.textContent = new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date());
```

- [ ] **Step 2: Versions.** `index.html`: every `?v=guest-b-2` → `?v=guest-b-3` (4). `sw.js`: the four `?v=guest-b-2` entries in `STATIC_ASSETS` → `?v=guest-b-3`, and `STATIC_CACHE_NAME = "iolanthe-onboard-static-v6"` → `"iolanthe-onboard-static-v7"`.

```bash
sed -i 's/?v=guest-b-2/?v=guest-b-3/g' index.html sw.js && sed -i 's/iolanthe-onboard-static-v6/iolanthe-onboard-static-v7/' sw.js && grep -c "guest-b-3" index.html sw.js && grep -c "static-v7" sw.js && grep -c "guest-b-2" index.html sw.js
```

Expected `index.html:4`, `sw.js:4`, `1`, then `0` and `0`.

- [ ] **Step 3: Check, test, commit.**

```bash
node --check guest.js && node --check sw.js && grep -c "hour12: false" guest.js && node --test 2>&1 | grep -E "ℹ (pass|fail)" && git add guest.js index.html sw.js && git commit -m "feat(guest): every time display is 24-hour (captain R3b-2); cache v7, assets guest-b-3"
```

Expected `6`, `ℹ pass 15`.

---

### Task 5: Browser verification (this session)

- [ ] **R3b-1** on Charter Admin: the viewed bar starts with the eye and its name is not clipped (the 11 January 2027 bar from the captain's screenshot: narrow, name still readable); legend shows the eye.
- [ ] **R3b-3** on Route & Itinerary: Expand and Collapse animate (the band's height changes over ~260 ms, measured at two instants); picking a charter from an expanded overlay band rolls it up before the page re-renders.
- [ ] **R3b-4** clicking the strip's name or dates expands; clicking the pill expands; Enter on the focused strip expands; the Expand button still works; on Charter Admin the strip never shows.
- [ ] **R3b-2** admin: Charter Info arrival time shows hour and minute selects (00–23, 00/15/30/45, a blank option), a change makes the form dirty and saves as "HH:MM"; the two report stamps show e.g. "14:05", not "2:05 PM". Guest (preview on the scratch server): the idle clock, the day cards' times and the NMEA stamp read 24-hour.
- [ ] `node --test` → 146 (admin) and 15 (guest); no console errors.

Then PRs: admin `feat/captain-round3b` → `main`, guest `feat/times-24h` → `main`; merge on David's word (both auto-deploy within 5 minutes; the guest also needs the tablets' service worker to pick up cache v7 on their next load).
