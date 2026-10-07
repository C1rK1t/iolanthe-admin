// Routes panel: "Add another route" (spec D10, §4.4). Appends or prepends a library route, optionally reversed, as one
// undoable edit. Created once per bind() by routes.js.
(function () {
  "use strict";

  // ctx: { core, getWork, getRoutes, editPoints(fn, opts), status(message, tone) }
  function create(ctx) {
    const { core: c } = ctx;
    const { el, openModal } = window.IolantheRoutesUi;

    function openJoin() {
      const work = ctx.getWork();
      if (!work) return;
      const others = ctx.getRoutes().filter((r) => r.id !== work.route.id);
      if (!others.length) { ctx.status("There are no other routes to add.", ""); return; }
      const sel = el("select", {}, others.map((r) => el("option", { value: r.id }, `${r.name} · ${c.routeNm(r.points).toFixed(0)} nm`)));
      const opts = { atStart: false, reverse: false };
      const preview = el("div", { class: "banner info" });
      const update = () => {
        const other = others.find((r) => r.id === sel.value);
        const joined = c.joinPoints(work.route.points, other.points, opts);
        const gap = c.joinGapNm(work.route.points, other.points, opts);
        const dropped = joined.length < work.route.points.length + other.points.length || !work.route.points.length || !other.points.length;
        preview.textContent = `${work.route.name || "This route"} becomes ${c.routeNm(joined).toFixed(1)} nm with ${joined.filter(c.isStop).length} stops.`
          + (dropped ? " They share a stop or meet within 50 m, so the duplicate point is dropped." : ` The ${gap.toFixed(1)} nm gap between them becomes a straight leg; check it on the map.`);
      };
      sel.addEventListener("change", update);
      const radio = (name, checked, label, on) => el("label", {}, el("input", { type: "radio", name, checked, onchange: () => { on(); update(); } }), label);
      const body = el("div", { class: "modal-body" },
        el("p", {}, "Add a whole route to the one that is open, to build a longer route from ones you already have. The routes you add from are not changed."),
        el("div", { class: "field" }, el("label", {}, "Route to add"), sel),
        el("div", { class: "field" }, el("label", {}, "Where"), el("div", { class: "radio-list" },
          radio("where", true, "After the end of this route", () => { opts.atStart = false; }),
          radio("where", false, "Before the start of this route", () => { opts.atStart = true; }))),
        el("div", { class: "field" }, el("label", {}, "Direction"), el("div", { class: "radio-list" },
          radio("dir", true, "As saved", () => { opts.reverse = false; }),
          radio("dir", false, "Reversed", () => { opts.reverse = true; }))),
        preview,
        work.route.id ? el("p", { class: "meta" }, `Tip: use Save As afterwards to keep "${work.route.name}" as it is and save the joined route under a new name.`) : null);
      update();
      openModal({
        title: "Add another route", body, wide: true, saveTitle: "Add route",
        onSave: () => {
          const other = others.find((r) => r.id === sel.value);
          ctx.editPoints((pts) => c.joinPoints(pts, other.points.map((p) => ({ ...p })), opts), { fit: true });
          ctx.status(`Added ${other.name}.`, "ok");
          return true;
        }
      });
    }

    return { openJoin };
  }

  window.IolantheRoutesJoin = Object.freeze({ create });
})();
