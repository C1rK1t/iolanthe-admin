// Routes panel: KML / GPX import (pick or join lines, Simplify, Replace / Append), the temporary imported pins, and
// GPX / KML export. The browser parses the file (DOMParser); everything after that is in routes-core.js.
(function () {
  "use strict";

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // ctx: { A, core, places, getWork, getMap, isDirty(), editPoints(fn, opts), renderAll(opts) }
  function create(ctx) {
    const { A, core: c } = ctx;
    const { el, openModal } = window.IolantheRoutesUi;

    // ---------- export ----------
    function download(filename, text, type) {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = el("a", { href: url, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function openExport() {
      const work = ctx.getWork();
      if (!work || work.route.points.length < 2) { A.setStatus("A route needs at least 2 points to export.", "error"); return; }
      const route = work.route;
      const base = c.exportBaseName(route);
      const stops = route.points.filter(c.isStop).length;
      let modal = null;
      const button = (ext, cls, make, type) => el("button", {
        type: "button", class: cls,
        onclick: () => { download(`${base}.${ext}`, make(route), type); A.setStatus(`Downloaded ${base}.${ext}`, "ok"); modal.close(); }
      }, `Download ${base}.${ext}`);
      const body = el("div", {},
        el("p", {}, `${plural(stops, "stop")}. Stops and named points carry their names, so a chartplotter shows them as named waypoints.`),
        el("div", { class: "icon-row" },
          button("gpx", "text-btn", c.toGpx, "application/gpx+xml"),
          button("kml", "text-btn secondary", c.toKml, "application/vnd.google-earth.kml+xml")),
        el("p", { class: "meta" }, "GPX 1.1: one route with every point, plus the stops as waypoints. KML: one line plus a pin per stop."),
        ctx.isDirty() ? el("p", { class: "meta" }, "The file includes your unsaved changes.") : null);
      modal = openModal({ title: "Export route", body });
    }

    return { openExport };
  }

  window.IolantheRoutesIo = Object.freeze({ create });
})();
