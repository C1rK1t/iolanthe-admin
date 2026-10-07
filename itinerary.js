(function () {
  "use strict";

  // Charter → Itinerary panel (charter rework spec A §4). Plan 2 renders; plan 3 adds editing.
  // Uses window.IolantheAdmin (helpers exposed by admin.js), window.IolantheItineraryCore (pure logic) and
  // window.IolantheRoutesUi.el (DOM builder shared with the Routes panel).

  const A = () => window.IolantheAdmin;
  const core = () => window.IolantheItineraryCore;
  const el = (...args) => window.IolantheRoutesUi.el(...args);

  let panel = null;    // #itinerary-panel after bind()
  let ctx = null;      // { charterId, charter, siteLibrary }
  let work = null;     // { itinerary, savedJson, baseRevision }
  let resizeBound = false;

  const dayCount = () => core().charterDayCount(ctx.charter);
  const siteTitle = (id) => {
    const site = ((ctx.siteLibrary && ctx.siteLibrary.sites) || []).find((s) => s && s.id === id);
    return site && site.title ? site.title : id;
  };

  function render() {
    return `
      <section class="card full itinerary-panel" id="itinerary-panel">
        <div class="itinerary-panel__header">
          <div>
            <h2 id="itinerary-title"></h2>
            <div class="itinerary-panel__dates muted" id="itinerary-dates"></div>
          </div>
          <div class="itinerary-panel__actions" id="itinerary-actions"></div>
          <div class="itinerary-thumb" id="itinerary-thumb" title="Open the route"></div>
        </div>
        <div class="itinerary-panel__welcome" id="itinerary-welcome"></div>
        <div class="itinerary-panel__hint muted" id="itinerary-hint" hidden></div>
        <div class="itinerary-board" id="itinerary-board">
          <div class="itinerary-board__titles" id="itinerary-titles"></div>
          <svg class="itinerary-board__line" id="itinerary-line" aria-hidden="true"></svg>
          <div class="itinerary-board__days" id="itinerary-days"></div>
        </div>
      </section>`;
  }

  function renderHeader() {
    const c = ctx.charter || {};
    panel.querySelector("#itinerary-title").textContent = c.name || ctx.charterId;
    const n = dayCount();
    const dates = c.start_date && c.end_date ? `${c.start_date} → ${c.end_date} · ${n} day${n === 1 ? "" : "s"}` : "Set the charter dates on Charter Info";
    panel.querySelector("#itinerary-dates").textContent = dates;
    const actions = panel.querySelector("#itinerary-actions");
    actions.replaceChildren(
      el("button", { type: "button", class: "itinerary-action", "data-action": "edit-route", disabled: "" }, "Edit route"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "apply-route", disabled: "" }, "Apply library route…"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "promote", disabled: "" }, "Promote to library…")
    );
    // The buttons are enabled by plan 3 (Save, Apply, Promote) and plan 4 (Edit route).
  }

  function renderWelcome() {
    const box = panel.querySelector("#itinerary-welcome");
    const text = work.itinerary.welcome_message;
    box.replaceChildren(
      el("div", { class: "itinerary-welcome__label label" }, "Welcome message"),
      el("div", { class: `itinerary-welcome__text${text ? "" : " muted"}` }, text || "No welcome message yet.")
    );
  }

  function activityRow(activity) {
    const firstLine = (activity.notes || "").split("\n")[0];
    return el("div", { class: `itinerary-activity${activity.site_id ? " itinerary-activity--site" : " itinerary-activity--free"}`, "data-activity-id": activity.id },
      el("span", { class: "itinerary-activity__grip", "aria-hidden": "true" }, "⋮⋮"),
      el("span", { class: "itinerary-activity__title" }, activity.title || (activity.site_id ? siteTitle(activity.site_id) : "Untitled")),
      activity.time ? el("span", { class: "itinerary-activity__time" }, activity.time) : null,
      firstLine ? el("span", { class: "itinerary-activity__notes muted" }, firstLine) : null
    );
  }

  function subBox(stop, day) {
    return el("div", { class: "itinerary-sub", "data-stop-id": stop.id, "data-day": String(day) },
      el("div", { class: "itinerary-sub__gutter" },
        el("button", { type: "button", class: "itinerary-sub__add", title: `Add a site or activity at ${stop.name}`, disabled: "" }, "+")),
      el("div", { class: "itinerary-sub__activities" }, ...stop.activities.map(activityRow))
    );
  }

  function dayBox(day) {
    const date = core().dayDateLabel(ctx.charter, day.day);
    const isLast = day.day === dayCount();
    const ends = isLast && ctx.charter && ctx.charter.end_time ? ` · ends ${ctx.charter.end_time}` : "";
    return el("div", { class: "itinerary-day", "data-day": String(day.day) },
      el("div", { class: "itinerary-day__title" }, `Day ${day.day}`, el("span", { class: "muted" }, date ? ` · ${date}${ends}` : ends)),
      ...day.stops.map((stop) => subBox(stop, day.day)),
      day.stops.length ? null : el("div", { class: "itinerary-day__passage muted" }, passageLabel(day.day))
    );
  }

  // "Underway · Potipot to Hundred Islands" for a day with no stops.
  function passageLabel(dayNumber) {
    const stops = core().stopEntries(work.itinerary.route.points).map((e) => e.point);
    const before = [...stops].reverse().find((s) => s.depart && s.depart.day < dayNumber);
    const after = stops.find((s) => s.arrive && s.arrive.day > dayNumber);
    if (before && after) return `Underway · ${before.name || "previous stop"} to ${after.name || "next stop"}`;
    return "At sea";
  }

  function renderDays() {
    const n = dayCount();
    const days = core().deriveDays(work.itinerary, n);
    const daysEl = panel.querySelector("#itinerary-days");
    daysEl.replaceChildren(...days.map(dayBox));
    const hint = panel.querySelector("#itinerary-hint");
    const hasStops = core().stopEntries(work.itinerary.route.points).length > 0;
    hint.hidden = Boolean(n) && hasStops;
    hint.textContent = !n ? "Set the charter's start and end dates to lay out the days." : "Apply a library route or Edit route to start.";
    return days;
  }

  // A static SVG of the route path and stops; no tiles, so it needs nothing from the network.
  function renderThumb() {
    const box = panel.querySelector("#itinerary-thumb");
    const points = work.itinerary.route.points;
    box.replaceChildren();
    if (points.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const W = 160, H = 110, PAD = 8;
    const lats = points.map((p) => p.latitude), lons = points.map((p) => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const spanLat = Math.max(maxLat - minLat, 0.0001), spanLon = Math.max((maxLon - minLon) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180), 0.0001);
    const scale = Math.min((W - 2 * PAD) / spanLon, (H - 2 * PAD) / spanLat);
    const x = (p) => PAD + ((p.longitude - minLon) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180)) * scale;
    const y = (p) => H - PAD - (p.latitude - minLat) * scale;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "itinerary-thumb__svg" });
    svg.append(svgEl("path", { class: "itinerary-thumb__path", d: points.map((p, i) => `${i ? "L" : "M"} ${x(p).toFixed(1)} ${y(p).toFixed(1)}`).join(" ") }));
    points.filter(core().isStop).forEach((p) => svg.append(svgEl("circle", { class: "itinerary-thumb__stop", cx: x(p).toFixed(1), cy: y(p).toFixed(1), r: 3 })));
    box.append(svg);
  }

  function renderAll() {
    renderHeader();
    renderThumb();
    renderWelcome();
    const days = renderDays();
    requestAnimationFrame(() => drawLine(days));
  }

  // Filled in by Task 5.
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
    return node;
  };
  const LINE_X = 20;        // x of the line inside the 40px middle column
  const LOOP_W = 18;        // loop (dwell) width
  const DOT_R = 7;

  // Measures each sub-box, asks core for the geometry, then draws the SVG and places the titles.
  function drawLine(days) {
    const board = panel.querySelector("#itinerary-board");
    const daysEl = panel.querySelector("#itinerary-days");
    const svg = panel.querySelector("#itinerary-line");
    const titles = panel.querySelector("#itinerary-titles");
    const boardTop = board.getBoundingClientRect().top;
    const centres = new Map();
    daysEl.querySelectorAll(".itinerary-sub").forEach((node) => {
      const r = node.getBoundingClientRect();
      centres.set(`${node.dataset.stopId}:${node.dataset.day}`, r.top + r.height / 2 - boardTop);
    });
    const height = Math.max(daysEl.offsetHeight, 1);
    svg.setAttribute("viewBox", `0 0 40 ${height}`);
    svg.setAttribute("width", "40");
    svg.setAttribute("height", String(height));
    svg.replaceChildren();
    titles.replaceChildren();
    titles.style.height = `${height}px`;

    const geo = core().lineGeometry(days, centres);
    if (!geo.shapes.length) return;

    const stopsById = new Map(core().stopEntries(work.itinerary.route.points).map((e) => [e.point.id, e.point]));
    const times = core().estimateTimes(work.itinerary);

    // The trunk line runs from the first shape to the last.
    svg.append(svgEl("line", { class: "itinerary-line__trunk", x1: LINE_X, y1: geo.top, x2: LINE_X, y2: geo.bottom }));

    geo.shapes.forEach((shape) => {
      if (shape.terminal === "origin") {
        // Underground-style open loop: a U open at the top with the stem continuing down.
        svg.append(svgEl("path", { class: "itinerary-line__terminal", d: `M ${LINE_X - 9} ${shape.y1 - 14} V ${shape.y1} A 9 9 0 0 0 ${LINE_X + 9} ${shape.y1} V ${shape.y1 - 14}` }));
      } else if (shape.terminal === "terminus") {
        svg.append(svgEl("path", { class: "itinerary-line__terminal", d: `M ${LINE_X - 9} ${shape.y2 + 14} V ${shape.y2} A 9 9 0 0 1 ${LINE_X + 9} ${shape.y2} V ${shape.y2 + 14}` }));
      } else if (shape.kind === "loop") {
        svg.append(svgEl("rect", { class: "itinerary-line__loop", x: LINE_X - LOOP_W / 2, y: shape.y1 - 9, width: LOOP_W, height: shape.y2 - shape.y1 + 18, rx: 9 }));
      } else {
        svg.append(svgEl("circle", { class: "itinerary-line__dot", cx: LINE_X, cy: shape.y1, r: DOT_R }));
      }
      const stop = stopsById.get(shape.stopId);
      if (!stop) return;
      const title = el("div", { class: "itinerary-stop-title", "data-stop-id": shape.stopId },
        el("div", { class: "itinerary-stop-title__name" }, stop.name || "Stop"),
        el("div", { class: `itinerary-stop-title__times muted${/~/.test(core().stopTimesLabel(stop, times.get(shape.stopId))) ? " itinerary-stop-title__times--est" : ""}` }, core().stopTimesLabel(stop, times.get(shape.stopId)))
      );
      title.style.top = `${(shape.y1 + shape.y2) / 2}px`;
      titles.append(title);
    });
  }

  function bind(opts) {
    panel = document.getElementById("itinerary-panel");
    if (!panel) return;
    ctx = { charterId: opts.charterId, charter: opts.charter || {}, siteLibrary: opts.siteLibrary || { sites: [] } };
    const itinerary = core().normalizeItinerary(opts.itinerary);
    work = { itinerary, savedJson: core().itinerarySnapshot(itinerary), baseRevision: itinerary.revision };
    if (!resizeBound) {
      window.addEventListener("resize", () => { if (panel && panel.isConnected && work) drawLine(core().deriveDays(work.itinerary, dayCount())); });
      resizeBound = true;
    }
    renderAll();
  }

  window.IolantheItinerary = Object.freeze({ render, bind });
})();
