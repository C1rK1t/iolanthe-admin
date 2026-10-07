// Routes panel: the Stops and Legs tab lists and the time tile. Stop cards (depth, moved/deleted warnings, site
// chips) and stop-to-stop leg cards with per-leg speeds. Created once per bind() by routes.js.
(function () {
  "use strict";

  // ctx: { A, core, places, getWork, speedKn(), defaultSpeed, maxSpeed, editPoints(fn), focusPoint(i), focusLeg(leg) }
  function create(ctx) {
    const { core: c, places } = ctx;
    const { el } = window.IolantheRoutesUi;
    const points = () => ctx.getWork().route.points;
    const legsFor = (pts) => (pts.length < 2 ? [] : c.stopLegs(pts, ctx.speedKn()));

    function timeStat() {
      const legs = legsFor(points());
      const hours = c.totalHours(legs);
      const anyOwn = legs.some((l) => l.own);
      const label = hours === null ? "set a speed" : (anyOwn ? "h:mm underway" : `h:mm at ${ctx.speedKn()} kn`);
      return el("div", { class: "stat" }, el("b", {}, hours === null ? "—" : c.fmtHm(hours)), el("span", {}, label));
    }

    // A stop row with anchorage depth, moved/deleted warnings and site chips (ids that no longer exist are dropped quietly).
    function stopItem(p, i, n) {
      const a = places ? places.findAnchorage(p.anchorage_id) : null;
      const moved = places ? c.anchorageMovedM(p, a) : 0;
      const siteChips = places ? (p.site_ids || []).map(places.findSite).filter(Boolean).map((s) => el("span", { class: "chip" }, s.title)) : [];
      const deleted = places && places.isLoaded() && p.anchorage_id && !a;
      return el("div", { class: "stop-item", onclick: () => ctx.focusPoint(i) },
        el("div", { class: "title" }, el("span", { class: "stop-num" }, n), p.name || "Stop",
          a && a.depth_m ? el("span", { class: "meta", style: "font-weight:400" }, `${a.depth_m} m`) : null),
        moved ? el("div", { class: "warn-text" }, `⚠ Anchorage moved ${Math.round(moved)} m since placed`) : null,
        deleted ? el("div", { class: "warn-text" }, "⚠ Anchorage deleted. The stop keeps its position.") : null,
        siteChips.length ? el("div", { class: "chips" }, siteChips) : el("div", { class: "empty", style: "margin-top:4px" }, "No sites linked"));
    }

    function renderStops(box, countEl) {
      let n = 0;
      const stops = points().map((p, i) => ({ p, i })).filter(({ p }) => c.isStop(p)).map(({ p, i }) => {
        n += 1;
        return stopItem(p, i, n);
      });
      countEl.textContent = stops.length || "";
      box.replaceChildren(...(stops.length ? stops : [el("div", { class: "empty" }, "No stops yet. In Add mode, tap an anchorage to add one.")]));
    }

    function setLegSpeed(leg, value) {
      ctx.editPoints((pts) => c.setLegSpeed(pts, leg.fromIndex, value));
    }

    function legSpeedControl(leg) {
      const global = ctx.speedKn();
      const useRoute = el("input", { type: "checkbox", checked: !leg.own, "aria-label": "Use the route speed for this leg" });
      // Unticking starts the leg at the route speed so the time doesn't jump; reticking clears the leg's own speed.
      useRoute.addEventListener("change", () => setLegSpeed(leg, useRoute.checked ? 0 : (global || ctx.defaultSpeed)));
      const row = el("div", { class: "leg-speed", onclick: (e) => e.stopPropagation() },
        el("label", {}, useRoute, global ? `Route speed (${global} kn)` : "Route speed"));
      if (leg.own) {
        const input = el("input", { type: "number", min: "0.5", max: String(ctx.maxSpeed), step: "0.5", value: String(leg.own), "aria-label": "Speed for this leg in knots" });
        input.addEventListener("change", () => {
          const v = parseFloat(input.value);
          if (!(v > 0 && v <= ctx.maxSpeed)) { ctx.A.setStatus(`Enter a speed between 0.5 and ${ctx.maxSpeed} kn.`, "error"); input.value = String(leg.own); return; }
          setLegSpeed(leg, v);
        });
        row.append(el("label", {}, input, "kn for this leg"));
      }
      return row;
    }

    function renderLegs(box, countEl) {
      const legs = legsFor(points());
      countEl.textContent = legs.length || "";
      if (!legs.length) { box.replaceChildren(el("div", { class: "empty" }, "Add at least two points to see legs.")); return; }
      const total = legs.reduce((sum, l) => sum + l.nm, 0);
      const hours = c.totalHours(legs);
      box.replaceChildren(
        ...legs.map((l, k) => el("div", { class: `stop-item leg-item${l.own ? " custom" : ""}`, title: "Show this leg on the map", onclick: () => ctx.focusLeg(l) },
          el("div", { class: "title" }, el("span", { class: "stop-num" }, k + 1), `${l.from} → ${l.to}`),
          el("div", { class: "leg-meta" }, `${l.nm.toFixed(1)} nm`,
            l.hours !== null ? el("span", {}, " · ", el("b", {}, c.fmtHm(l.hours)), ` at ${l.speed} kn`) : null),
          legSpeedControl(l))),
        el("div", { class: "leg-total" }, el("span", {}, "Total"), el("span", {}, `${total.toFixed(1)} nm${hours !== null ? ` · ${c.fmtHm(hours)}` : ""}`)));
    }

    return { timeStat, renderStops, renderLegs };
  }

  window.IolantheRoutesLists = Object.freeze({ create });
})();
