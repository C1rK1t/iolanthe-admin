// Routes panel: the read-only Days tab (spec A2 §5.2, round 2 T8). The tube line on the left, day boxes on the right with
// one sub-box per stop and day; each sub-box is headed by the stop's name and that day's Arr/Dep line, then the items.
// No editing here; stops and items are edited on the cards. Created once per bind() by routes.js.
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const LINE_X = 16;        // x of the line inside the 32px middle column
  const LOOP_W = 14;        // loop (dwell) width
  const DOT_R = 6;

  // ctx: { core (IolantheItineraryCore), el, getRecord(), getCharter() (null for an unassigned route), getDayCount(), siteTitle(id), onStopClick(stopId) }
  function create(ctx) {
    const { core: c, el } = ctx;
    let box = null;
    let observer = null;
    const svgEl = (tag, attrs) => {
      const node = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
      return node;
    };

    function itemRow(a) {
      return el("div", { class: `days-item${a.site_id ? " site" : ""}` },
        a.time ? el("span", { class: "days-item-time" }, a.time) : null,
        el("span", {}, a.title || (a.site_id ? ctx.siteTitle(a.site_id) : "Untitled")));
    }
    // stop: a deriveDays() stop entry ({ id, name, arrive, depart, activities }); times: estimateTimes() map.
    function subBox(stop, day, times) {
      const label = c.subBoxTimesLabel(stop, times.get(stop.id), day);
      return el("div", { class: "days-sub", "data-stop-id": stop.id, "data-day": String(day) },
        el("div", { class: "days-sub-head", onclick: () => ctx.onStopClick(stop.id) },
          el("span", { class: "days-stop-name" }, stop.name || "Stop"),
          label ? el("span", { class: `days-stop-times muted${/~/.test(label) ? " est" : ""}` }, label) : null),
        ...stop.activities.map(itemRow));
    }
    // "Underway · Potipot to Hundred Islands" for a day with no stops.
    function passageLabel(record, dayNumber) {
      const stops = c.stopEntries(record.route.points).map((e) => e.point);
      const before = [...stops].reverse().find((s) => s.depart && s.depart.day < dayNumber);
      const after = stops.find((s) => s.arrive && s.arrive.day > dayNumber);
      return before && after ? `Underway · ${before.name || "previous stop"} to ${after.name || "next stop"}` : "At sea";
    }
    function dayBox(record, day, times) {
      const charter = ctx.getCharter();
      const date = charter ? c.dayDateLabel(charter, day.day) : "";
      return el("div", { class: "days-day", "data-day": String(day.day) },
        el("div", { class: "days-day-title" }, `Day ${day.day}`, date ? el("span", { class: "muted" }, ` · ${date}`) : null),
        ...day.stops.map((stop) => subBox(stop, day.day, times)),
        day.stops.length ? null : el("div", { class: "days-passage muted" }, passageLabel(record, day.day)));
    }

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

    // Renders into `target` (kept for later calls). Safe to call while the tab is hidden: the ResizeObserver redraws
    // the line when the box gets a size.
    function render(target) {
      box = target || box;
      if (!box) return;
      const record = ctx.getRecord();
      const n = ctx.getDayCount();
      if (observer) { observer.disconnect(); observer = null; }
      if (!record || !n || !c.stopEntries(record.route.points).length) {
        box.replaceChildren(el("div", { class: "empty" }, n ? "No stops yet." : "Set the charter's start and end dates to lay out the days."));
        return;
      }
      const daysList = c.deriveDays(record, n);
      const times = c.estimateTimes(record);
      const board = el("div", { class: "days-board" },
        svgEl("svg", { class: "days-line", "aria-hidden": "true" }),
        el("div", { class: "days-list" }, ...daysList.map((d) => dayBox(record, d, times))));
      box.replaceChildren(board);
      const draw = () => { if (box && box.contains(board) && board.offsetWidth) drawLine(board, daysList); };
      requestAnimationFrame(draw);
      observer = new ResizeObserver(draw);
      observer.observe(board);
    }

    return { render, destroy: () => { if (observer) observer.disconnect(); } };
  }

  window.IolantheRoutesDays = Object.freeze({ create });
})();
