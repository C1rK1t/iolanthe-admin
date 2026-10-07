// Routes panel: KML / GPX import (pick or join lines, Simplify, Replace / Append), the temporary imported pins, and
// GPX / KML export. The browser parses the file (DOMParser); everything after that is in routes-core.js.
(function () {
  "use strict";

  const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // larger files are refused before reading
  const MAX_SOURCE_TEXT = 120;               // the server's limit for a route name and source.filename
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // ctx: { A, core, places, getWork, getMap, isDirty(), editPoints(fn, opts), renderAll(opts), isCurrent() }
  // isCurrent() is false once the panel has been bound again; async work checks it after every await.
  function create(ctx) {
    const { A, core: c, places } = ctx;
    const { el, fmtPos, openModal } = window.IolantheRoutesUi;
    let pins = [];  // temporary imported pins { id, name, description, latitude, longitude }. Never saved.
    let pinSeq = 0;

    const closePopup = () => { const map = ctx.getMap(); if (map) map.closePopup(); };
    const dropPin = (id) => { pins = pins.filter((p) => p.id !== id); };

    function parseFile(text, filename) {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) throw new Error("the file is not valid XML");
      return c.extractGeo(doc.documentElement, filename);
    }

    // ---------- imported pins ----------
    function drawPins(L, group, opts) {
      if (!opts.show) return;
      pins.forEach((pin) => {
        const html = `<div class="mk-pin"></div><div class="mk-label">${A.escapeHtml(pin.name)}</div>`;
        L.marker([pin.latitude, pin.longitude], { icon: opts.divIcon(html), title: pin.name, zIndexOffset: 600 })
          .bindPopup(() => pinPopup(pin), { minWidth: 240, maxWidth: 300, autoPanPadding: [20, 60] })
          .addTo(group);
      });
    }

    // Make anchorage / Make site: the pin goes once the anchorage or site is saved; it stays if the modal is cancelled.
    async function promote(pin, open) {
      closePopup();
      const saved = await open();
      if (!saved || !ctx.isCurrent()) return;
      dropPin(pin.id);
      ctx.renderAll();
    }

    function pinPopup(pin) {
      const match = c.pinMatch(pin, places.sites(), places.anchorages());
      const near = match
        ? `Near ${match.kind} "${match.name}"${Number.isFinite(match.nm) ? ` (${match.nm.toFixed(1)} nm)` : ""}${match.sameName ? ", same name" : ""}. It may be a duplicate.`
        : "";
      const btn = (label, cls, onclick) => el("button", { type: "button", class: cls, onclick }, label);
      return el("div", { class: "pop" },
        el("h3", {}, pin.name),
        el("div", { class: "sub" }, `Imported pin · ${fmtPos(pin)} · not saved`),
        match ? el("div", { class: "banner warn", style: "margin-bottom:8px" }, near) : null,
        pin.description ? el("div", { class: "pin-desc" }, pin.description) : null,
        el("div", { class: "actions" },
          btn("Add to route", "text-btn secondary", () => {
            closePopup();
            dropPin(pin.id);
            ctx.editPoints((pts) => [...pts, { latitude: pin.latitude, longitude: pin.longitude, name: pin.name }]);
          }),
          btn("Make anchorage", "text-btn secondary", () => promote(pin, () => places.openAnchorageModal(null, pin, { name: pin.name }))),
          btn("Make site", "text-btn secondary", () => promote(pin, () => places.openSiteModal(null, pin, { name: pin.name, description: pin.description }))),
          btn("Delete", "text-btn danger-text", () => { closePopup(); dropPin(pin.id); ctx.renderAll(); })));
    }

    // ---------- import ----------
    function openImport() {
      if (!ctx.getWork()) return;
      const fileInput = el("input", { type: "file", accept: ".kml,.gpx" });
      const stage = el("div", {});
      let parsed = null;
      let filename = "";
      const pick = { line: 0, join: false, tol: 0, mode: "replace" };
      const raw = () => (parsed ? c.chosenLinePoints(parsed.lines, pick) : []);
      const retune = () => { pick.tol = c.defaultTolerance(raw()); };
      const radio = (name, checked, label, on) => el("label", {}, el("input", { type: "radio", name, checked, onchange: on }), label);

      function renderStage() {
        if (!parsed) {
          stage.replaceChildren(el("div", { class: "file-drop" },
            el("div", {}, "Choose a .kml or .gpx file. Lines become route points; pins appear as temporary orange markers."),
            fileInput));
          return;
        }
        const points = raw();
        const lineChoice = parsed.lines.length > 1 ? el("div", { class: "field" }, el("label", {}, "Line"),
          el("div", { class: "radio-list" },
            parsed.lines.map((l, i) => radio("import-line", !pick.join && pick.line === i, `${l.name} (${plural(l.points.length, "point")})`,
              () => { pick.join = false; pick.line = i; retune(); renderStage(); })),
            radio("import-line", pick.join, "Join all lines in file order", () => { pick.join = true; retune(); renderStage(); }))) : null;
        const slider = el("input", { type: "range", min: "0", max: String(c.MAX_TOLERANCE_M), step: String(c.TOLERANCE_STEP_M), value: String(pick.tol), "aria-label": "Simplify tolerance in metres" });
        const count = el("b", {}, plural(c.simplify(points, pick.tol).length, "point"));
        const tolLabel = el("span", { class: "meta" }, `${pick.tol} m`);
        slider.addEventListener("input", () => {
          pick.tol = Number(slider.value);
          count.textContent = plural(c.simplify(points, pick.tol).length, "point");
          tolLabel.textContent = `${pick.tol} m`;
        });
        const hasPoints = ctx.getWork().route.points.length > 0;
        stage.replaceChildren(...[
          el("p", {}, el("b", {}, filename), ` · ${plural(parsed.lines.length, "line")}, ${plural(parsed.pins.length, "pin")}`),
          lineChoice,
          parsed.lines.length
            ? el("div", { class: "field" }, el("label", {}, "Simplify"), el("div", { class: "slider-row" }, slider, tolLabel),
              el("div", { class: "meta" }, count, ` from ${points.length}. The default keeps it under about ${c.IMPORT_TARGET_POINTS}.`))
            : el("p", { class: "empty" }, "No lines found. Only pins will be imported."),
          hasPoints && parsed.lines.length ? el("div", { class: "field" }, el("label", {}, "The open route already has points"),
            el("div", { class: "radio-list" },
              radio("import-mode", pick.mode === "replace", "Replace them", () => { pick.mode = "replace"; }),
              radio("import-mode", pick.mode === "append", "Append to the end", () => { pick.mode = "append"; }))) : null,
          parsed.pins.length ? el("p", { class: "meta" }, `${plural(parsed.pins.length, "pin")} will show as temporary orange markers. They are not saved until you make them an anchorage or a site.`) : null
        ].filter(Boolean));
      }

      async function load(file) {
        if (!/\.(kml|gpx)$/i.test(file.name)) { A.setStatus("Choose a .kml or .gpx file. KMZ isn't supported: export it as KML first.", "error"); return; }
        if (file.size > MAX_IMPORT_BYTES) { A.setStatus("That file is over 10 MB, too big to import.", "error"); return; }
        try {
          const text = await file.text();
          if (!ctx.isCurrent()) return;
          const geo = parseFile(text, file.name);
          if (!geo.lines.length && !geo.pins.length) { A.setStatus("No lines or pins found in that file.", "error"); return; }
          parsed = geo;
          filename = file.name;
          pick.line = 0;
          pick.join = false;
          if (parsed.lines.length) retune(); else pick.tol = 0;
          renderStage();
        } catch (error) {
          if (ctx.isCurrent()) A.setStatus(`Couldn't read the file: ${error.message || "unknown error"}.`, "error");
        }
      }
      fileInput.addEventListener("change", () => { if (fileInput.files[0]) load(fileInput.files[0]); });

      renderStage();
      openModal({
        title: "Import KML / GPX", body: stage, wide: true, saveTitle: "Import",
        onSave: () => {
          if (!parsed) { A.setStatus("Choose a file first.", "error"); return false; }
          const work = ctx.getWork();
          const newPts = c.simplify(raw(), pick.tol);
          const added = parsed.pins.map((p) => ({ ...p, id: `pin-${++pinSeq}` }));
          pins = [...pins, ...added];
          if (newPts.length) {
            const mode = work.route.points.length ? pick.mode : "replace";
            const fresh = !work.route.id;
            if (fresh) {
              const name = work.route.name || (parsed.name || filename.replace(/\.(kml|gpx)$/i, "")).slice(0, MAX_SOURCE_TEXT);
              work.route = { ...work.route, name, source: { type: parsed.type, filename: filename.slice(0, MAX_SOURCE_TEXT) } };
            }
            ctx.editPoints((pts) => c.importPoints(pts, newPts, mode), { fit: true, inputs: fresh });
          } else {
            ctx.renderAll();
          }
          A.setStatus(`Imported ${plural(newPts.length, "point")} and ${plural(added.length, "pin")}.`, "ok");
          return true;
        }
      });
    }

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
        onclick: () => {
          try {
            download(`${base}.${ext}`, make(route), type);
            A.setStatus(`Download started: ${base}.${ext}`, "ok");
            modal.close();
          } catch (error) {
            A.setStatus(`Couldn't export the route: ${error.message || "unknown error"}.`, "error");
          }
        }
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

    return { openImport, openExport, drawPins, pinCount: () => pins.length };
  }

  window.IolantheRoutesIo = Object.freeze({ create });
})();
