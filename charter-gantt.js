// The charter Gantt band (spec-charters §6). Read-only: drag pans, wheel zooms, click selects / opens.
// mount(host, ctx) → {update(ctx), destroy()}. ctx: {charters, periods, selectedId, activeId, forcedId, today,
// zoom, collapsed, canManage, onSelectCharter(id), onOpenPeriod(id|null), onCreateCharter(),
// onZoomChange(level), onToggleCollapsed(bool)}.
(function () {
  "use strict";

  const core = window.IolantheChartersCore;
  const ZOOMS = [["active", "Active"], ["quarter", "Quarter"], ["year", "Year"], ["3years", "3 years"]];
  const MIN_PX_PER_DAY = 1.2;      // 3 years on ~1300 px
  const MAX_PX_PER_DAY = 80;       // ~2 weeks on ~1100 px
  const DRAG_THRESHOLD_PX = 4;

  const ICONS = {
    left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
    add: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    reserve: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16M8 3v4M16 3v4M7 13l4 4 6-7"/></svg>',
    collapse: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'
  };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
    });
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  function afterLayout(fn) {
    window.setTimeout(fn, 0);
  }

  function iconBtn(kind, label, extra) {
    return el("button", { type: "button", class: `gantt-ib${extra && extra.tone ? ` ${extra.tone}` : ""}`, title: label, "aria-label": label, html: ICONS[kind], disabled: extra && extra.disabled, onclick: extra && extra.onclick });
  }

  function barsOf(ctx) {
    const charters = (ctx.charters || []).map((c) => ({
      kind: "charter", id: c.id, name: c.name || c.id, start_date: (c.charter || {}).start_date, end_date: (c.charter || {}).end_date,
      nights: core.nights(c), guests: Number((c.charter || {}).guest_count) || 0, stops: Number(c.stops) || 0,
      status: core.charterStatus(c, ctx.today)
    }));
    const periods = (ctx.periods || []).map((p) => ({
      kind: "period", id: p.id, type: p.type, name: core.periodName(p), title: p.title,
      start_date: p.start_date, end_date: p.end_date, description: p.description || ""
    }));
    return { charters, periods };
  }

  function mount(initialHost, initialCtx) {
    let host = initialHost;
    let ctx = initialCtx;
    let pxPerDay = 0;
    let range = { start: "", end: "" };
    let tooltip = null;
    let viewport = null;
    let track = null;
    let root = null;
    let suppressClickUntil = 0;
    let lastView = null;   // {px, date}: the scale and left edge after the last draw, scroll or zoom

    function activeBar() {
      return (ctx.charters || []).find((c) => c.id === ctx.activeId) || null;
    }

    // ---- scroll / zoom maths ----
    function xOf(date) { return (core.dayIndex(date) - core.dayIndex(range.start)) * pxPerDay; }
    function dateAtX(x) { return core.dateFromIndex(core.dayIndex(range.start) + Math.floor(x / pxPerDay)); }
    function viewStart() { return dateAtX(viewport.scrollLeft); }
    function viewEnd() { return dateAtX(viewport.scrollLeft + viewport.clientWidth); }

    // The smallest scale: never narrower than the viewport, and small enough that "3 years" fits on a phone.
    function minScale() {
      const { charters, periods } = barsOf(ctx);
      const r = core.scrollRange(charters.concat(periods), ctx.today);
      const totalDays = Math.max(1, core.dayIndex(r.end) - core.dayIndex(r.start));
      return Math.max(viewport.clientWidth / totalDays, Math.min(MIN_PX_PER_DAY, viewport.clientWidth / core.ZOOM_DAYS["3years"]));
    }

    function clampScale(px) {
      return Math.max(minScale(), Math.min(MAX_PX_PER_DAY, px));
    }

    function applyZoom(level) {
      const span = core.zoomSpan(level, { active: activeBar() ? (activeBar().charter || activeBar()) : null, today: ctx.today });
      const days = core.dayIndex(span.end) - core.dayIndex(span.start);
      setScale(clampScale(viewport.clientWidth / days));
      viewport.scrollLeft = xOf(span.start);
      syncTitle();
    }

    // Re-draw at a known scale with a known left edge (after a re-render or a re-host).
    function restoreView(view) {
      setScale(clampScale(view.px));
      viewport.scrollLeft = xOf(view.date);
      syncTitle();
    }

    function setScale(next) {
      pxPerDay = next;
      drawTrack();
    }

    function centreOn(date) {
      viewport.scrollLeft = xOf(date) - viewport.clientWidth / 2;
      syncTitle();
    }

    function zoomAround(clientX, factor) {
      const rect = viewport.getBoundingClientRect();
      const localX = clientX - rect.left;
      const dayUnder = (viewport.scrollLeft + localX) / pxPerDay;
      const next = clampScale(pxPerDay * factor);
      if (next === pxPerDay) return;
      setScale(next);
      viewport.scrollLeft = dayUnder * pxPerDay - localX;
      ctx.zoom = "";   // a free zoom matches no preset
      syncZoomButtons();
      syncTitle();
    }

    // ---- drawing ----
    function syncTitle() {
      const t = root.querySelector(".gantt-span");
      if (!pxPerDay || !viewport.isConnected) return;   // nothing drawn yet (applyZoom runs after the first layout)
      lastView = { px: pxPerDay, date: viewStart() };
      if (t && viewport.clientWidth) t.textContent = `${core.fmtShort(viewStart())} – ${core.fmtShort(viewEnd())}`;
    }

    function drawTrack() {
      const { charters, periods } = barsOf(ctx);
      range = core.scrollRange(charters.concat(periods), ctx.today);
      const totalDays = core.dayIndex(range.end) - core.dayIndex(range.start);
      track.style.width = `${Math.round(totalDays * pxPerDay)}px`;
      track.replaceChildren();

      const months = el("div", { class: "gantt-months" });
      core.visibleMonths(range.start, range.end).forEach((m) => {
        const w = (core.dayIndex(m.end) - core.dayIndex(m.start) + 1) * pxPerDay;
        months.appendChild(el("span", { style: `left:${xOf(m.start)}px;width:${w}px`, text: w > 40 ? m.label : "" }));
      });
      track.appendChild(months);

      const weeks = el("div", { class: "gantt-weeks" });
      if (pxPerDay >= 4) {
        core.visibleWeeks(range.start, range.end).forEach((d) => {
          weeks.appendChild(el("span", { style: `left:${xOf(d)}px`, text: pxPerDay >= 9 ? String(Number(d.slice(8))) : "" }));
        });
      }
      track.appendChild(weeks);

      const lanes = el("div", { class: "gantt-lanes" });
      [["charters", charters], ["periods", periods]].forEach(([laneKind, bars]) => {
        const rows = core.packRows(bars);
        if (!rows.length) rows.push([]);
        rows.forEach((row) => {
          const rowEl = el("div", { class: `gantt-row gantt-row--${laneKind}` });
          row.forEach((bar) => rowEl.appendChild(barEl(bar)));
          lanes.appendChild(rowEl);
        });
      });
      track.appendChild(lanes);

      if (ctx.today >= range.start && ctx.today <= range.end) {
        track.appendChild(el("div", { class: "gantt-today", style: `left:${xOf(ctx.today) + pxPerDay / 2}px` }, [el("span", { text: "Today" })]));
      }
    }

    function barEl(bar) {
      const w = (core.dayIndex(bar.end_date) - core.dayIndex(bar.start_date) + 1) * pxPerDay;
      const classes = ["gantt-bar", `gantt-bar--${bar.kind}`];
      if (bar.kind === "charter") {
        if (bar.id === ctx.activeId) classes.push("is-active");
        else if (bar.status === "ended") classes.push("is-ended");
        if (bar.id === ctx.selectedId) classes.push("is-selected");
      } else {
        classes.push(`gantt-bar--${bar.type}`);
      }
      const meta = bar.kind === "charter"
        ? (w > 220 ? `${bar.stops} stops · ${bar.guests} guests` : (w > 140 && bar.nights !== null ? `${bar.nights} nights` : ""))
        : "";
      const node = el("button", {
        type: "button", class: classes.join(" "), style: `left:${xOf(bar.start_date)}px;width:${Math.max(6, w - 2)}px`,
        "aria-pressed": bar.kind === "charter" ? String(bar.id === ctx.selectedId) : undefined,
        "aria-label": `${bar.name}, ${core.fmtRange(bar.start_date, bar.end_date)}`,
        onclick: () => {
          if (Date.now() < suppressClickUntil) return;
          if (bar.kind === "charter") ctx.onSelectCharter(bar.id); else ctx.onOpenPeriod(bar.id);
        },
        onpointerenter: (e) => showTip(bar, e), onpointermove: (e) => moveTip(e), onpointerleave: hideTip,
        onfocus: (e) => showTip(bar, e), onblur: hideTip
      }, [el("span", { class: "gantt-bar-name", text: w > 40 ? bar.name : "" }), meta ? el("small", { text: meta }) : null]);
      return node;
    }

    // ---- tooltip ----
    function showTip(bar, event) {
      hideTip();
      const lines = bar.kind === "charter"
        ? [bar.name, core.fmtRange(bar.start_date, bar.end_date), `${bar.nights} nights · ${bar.guests} guests · ${bar.stops} stops`, bar.id === ctx.activeId ? "Active" : bar.status.replace("-", " ")]
        : [bar.name, core.fmtRange(bar.start_date, bar.end_date), bar.description.split("\n")[0]];
      tooltip = el("div", { class: "gantt-tip", role: "tooltip" }, lines.filter(Boolean).map((t, i) => el("div", { class: i === 0 ? "gantt-tip-title" : "", text: t })));
      document.body.appendChild(tooltip);
      moveTip(event);
    }

    function moveTip(event) {
      if (!tooltip) return;
      const x = (event && event.clientX) || (event && event.target && event.target.getBoundingClientRect().left) || 0;
      const y = (event && event.clientY) || (event && event.target && event.target.getBoundingClientRect().bottom) || 0;
      tooltip.style.left = `${Math.min(x + 12, window.innerWidth - tooltip.offsetWidth - 8)}px`;
      tooltip.style.top = `${y + 14}px`;
    }

    function hideTip() {
      if (tooltip) tooltip.remove();
      tooltip = null;
    }

    // ---- pointer panning ----
    function bindPan() {
      // Pointer capture is taken only once the pointer has moved past the drag threshold. Capturing on pointerdown
      // would retarget pointerup (and so the click) to the viewport, and bar clicks would never fire.
      let down = null;   // { id, x, scroll } while a button is held
      let dragging = false;
      viewport.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const rect = viewport.getBoundingClientRect();
        if (e.clientY - rect.top > viewport.clientHeight) return;   // on the native scrollbar
        down = { id: e.pointerId, x: e.clientX, scroll: viewport.scrollLeft };
        dragging = false;
      });
      viewport.addEventListener("pointermove", (e) => {
        if (!down || e.pointerId !== down.id) return;
        const dx = e.clientX - down.x;
        if (!dragging) {
          if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
          dragging = true;
          viewport.classList.add("is-dragging");
          try { viewport.setPointerCapture(e.pointerId); } catch (error) { /* capture is best effort */ }
        }
        viewport.scrollLeft = down.scroll - dx;
      });
      const end = (e) => {
        if (!down || e.pointerId !== down.id) return;
        if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
        viewport.classList.remove("is-dragging");
        if (dragging) suppressClickUntil = Date.now() + 150;
        dragging = false;
        down = null;
        syncTitle();
      };
      viewport.addEventListener("pointerup", end);
      viewport.addEventListener("pointercancel", end);
      viewport.addEventListener("scroll", syncTitle, { passive: true });
      viewport.addEventListener("wheel", (e) => {
        // Horizontal wheel / trackpad swipe: leave it to the native scroll. Vertical wheel: zoom around the pointer.
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.deltaY === 0) return;
        e.preventDefault();
        const step = e.deltaMode === 1 ? e.deltaY * 16 : (e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY);
        zoomAround(e.clientX, Math.max(0.7, Math.min(1.4, Math.exp(-step * 0.0015))));
      }, { passive: false });
      root.addEventListener("keydown", (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.target.closest("input, select, textarea")) return;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.stopPropagation();   // the Route page steps its stop cards on the same keys
          e.preventDefault();
          viewport.scrollLeft += (e.key === "ArrowLeft" ? -7 : 7) * pxPerDay;
          syncTitle();
        }
      });
    }

    // ---- toolbar / collapsed strip ----
    function toolbar() {
      const zoom = el("div", { class: "segmented gantt-zoom", role: "group", "aria-label": "Zoom" }, ZOOMS.map(([level, label]) =>
        el("button", { type: "button", "aria-pressed": String(ctx.zoom === level), text: label, onclick: () => { ctx.zoom = level; ctx.onZoomChange(level); applyZoom(level); syncZoomButtons(); } })));
      const noDates = (ctx.charters || []).filter((c) => !core.datesOf(c));
      const noDatesPill = noDates.length ? el("div", { class: "gantt-nodates" }, [
        el("select", { "aria-label": "Charters without dates", onchange: (e) => { if (e.target.value) ctx.onSelectCharter(e.target.value); e.target.value = ""; } },
          [el("option", { value: "", text: `${noDates.length} without dates…` })].concat(noDates.map((c) => el("option", { value: c.id, text: c.name || c.id }))))
      ]) : null;
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
    }

    function syncZoomButtons() {
      root.querySelectorAll(".gantt-zoom button").forEach((b, i) => b.setAttribute("aria-pressed", String(ZOOMS[i][0] === ctx.zoom)));
    }

    function strip() {
      const sel = (ctx.charters || []).find((c) => c.id === ctx.selectedId);
      const pill = sel ? core.pillFor(sel, { activeId: ctx.activeId, today: ctx.today }) : { tone: "none", text: "No charter" };
      const dates = sel ? core.fmtRange((sel.charter || {}).start_date, (sel.charter || {}).end_date) : "";
      const n = sel ? core.nights(sel) : null;
      return el("div", { class: "gantt-strip" }, [
        el("strong", { text: sel ? (sel.name || sel.id) : "Charters" }),
        el("span", { class: "gantt-strip-dates", text: dates + (n !== null ? ` · ${n} nights` : "") }),
        el("span", { class: `status-pill status-pill--${pill.tone}`, text: pill.text }),
        el("span", { class: "gantt-strip-grow" }),
        iconBtn("expand", "Expand", { onclick: () => { ctx.collapsed = false; ctx.onToggleCollapsed(false); render(); } })
      ]);
    }

    function render(view) {
      hideTip();
      host.replaceChildren();
      root = el("section", { class: `charter-gantt${ctx.collapsed ? " is-collapsed" : ""}`, tabindex: "0", "aria-label": "Charter timeline" });
      host.appendChild(root);
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

    // The scale and left edge to restore, or null when nothing has been drawn. Read from the last draw / scroll /
    // zoom rather than the live viewport: a node that has just been moved in the DOM reports scrollLeft 0.
    function currentView() {
      return lastView;
    }

    render();
    const onResize = () => { if (!ctx.collapsed && pxPerDay && viewport && viewport.isConnected) { drawTrack(); syncTitle(); } };
    window.addEventListener("resize", onResize);

    return {
      update(next) {
        const view = next.collapsed ? null : currentView();
        ctx = next;
        render(view);
      },
      // Move the band into a freshly rendered host, keeping its scale and scroll position.
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
    };
  }

  window.IolantheCharterGantt = Object.freeze({ mount });
})();
