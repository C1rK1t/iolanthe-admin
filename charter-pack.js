// The Charter Pack page (Charter → Charter Pack, charter rework spec P): settings on the left, the pack's A4 pages on the
// right, and Save as PDF through the browser's print dialog. The model comes from pack-core.js, the HTML from
// pack-render.js; this file lays the blocks out onto pages, draws the route map, and saves the preset.
// admin.js calls render() then bind(ctx).
(function () {
  "use strict";

  const core = () => window.IolanthePackCore;
  const R = () => window.IolanthePackRender;
  const A = () => window.IolantheAdmin;
  const ASSETS = "/admin/assets/pack";
  const SAVE_DELAY_MS = 800;
  const TEXT_REDRAW_MS = 250;
  const MAP_TIMEOUT_MS = 15000;
  const MERGE_PX = 18;
  // A light, low-detail base map (spec P §3): the Route page's satellite tiles print dark and busy.
  const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
  const TILE_ATTRIBUTION = "Esri, HERE, Garmin, © OpenStreetMap contributors";
  const THEME_LABELS = { a: "Editorial", b: "Modern", c: "Paper" };
  const TYPE_LABELS = { proposal: "Proposal", brief: "Charter Brief" };
  const ICONS = {
    prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M7 14h10v6H7z"/>',
    upload: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    reset: '<path d="M4 11a8 8 0 1 1 2.3 5.7"/><path d="M4 4v7h7"/>'
  };
  let teardown = null;

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    });
    children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c.nodeType ? c : String(c)); });
    return node;
  }

  function iconBtn(icon, title, onclick, extra) {
    const b = el("button", { type: "button", class: "cp-btn", title, "aria-label": title, onclick, ...(extra || {}) });
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
    return b;
  }

  function render() {
    return '<section class="card full charter-pack" id="charter-pack"></section>';
  }

  function destroy() {
    if (teardown) teardown();
    teardown = null;
  }

  let restorePrinted = null;   // puts the pages moved into #pack-print-host back into the preview

  function removePrintHost() {
    if (restorePrinted) restorePrinted();
    restorePrinted = null;
    const host = document.getElementById("pack-print-host");
    if (host) host.remove();
    document.body.classList.remove("pack-printing");
  }

  // ctx: { charterId }
  async function bind(ctx) {
    destroy();
    const host = document.getElementById("charter-pack");
    if (!host) return;
    host.replaceChildren(el("p", { class: "muted" }, "Loading the charter pack…"));
    const packPath = `/api/admin/charter/${encodeURIComponent(ctx.charterId)}/pack`;
    let payload;
    let preset;
    try {
      [payload, preset] = await Promise.all([A().api(`/api/charter?charter=${encodeURIComponent(ctx.charterId)}`), A().api(packPath)]);
    } catch (error) {
      if (!error.loginRequired) host.replaceChildren(el("p", { class: "muted" }, error.message || "The charter pack could not be loaded."));
      return;
    }
    if (!host.isConnected) return;

    let alive = true;
    let revision = preset.revision;
    let pack = core().normalizePack(preset.pack);
    let model = null;
    let pageIndex = 0;
    let saveTimer = 0;
    let redrawTimer = 0;
    let map = null;
    let mapBox = null;
    let mapLine = null;
    let mapTimer = 0;
    let mapReady = true;
    let mapBroken = false;      // once the map has failed, redraws show the note instead of retrying (review M2)
    let saving = null;          // the save in flight; saves run one at a time (review H1)
    let saveAgain = false;

    // ---- settings ----------------------------------------------------------------------------------------------
    function segmented(label, options, current, onPick) {
      const buttons = options.map(([value, text]) => el("button", { type: "button", "data-value": value, onclick: () => onPick(value) }, text));
      const group = el("div", { class: "segmented", role: "group", "aria-label": label }, ...buttons);
      group.sync = () => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.value === current())));
      return group;
    }
    const themeSeg = segmented("Theme", core().THEMES.map((t) => [t, `${t.toUpperCase()} · ${THEME_LABELS[t]}`]), () => pack.theme, (v) => update({ theme: v }));
    const typeSeg = segmented("Pack type", core().TYPES.map((t) => [t, TYPE_LABELS[t]]), () => pack.type, (v) => update({ type: v }));
    const preparedInput = el("input", { type: "text", maxlength: String(core().PREPARED_FOR_MAX), placeholder: "Mr & Mrs Smith · via the agent", oninput: (e) => update({ prepared_for: e.target.value }, true) });
    const noteInput = el("textarea", { rows: "4", maxlength: String(core().COVER_NOTE_MAX), placeholder: "A short note for the cover", oninput: (e) => update({ cover_note: e.target.value }, true) });
    const coverThumb = el("img", { class: "cp-cover-thumb", alt: "Cover photo" });
    const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: true, onchange: (e) => uploadCover(e.target.files && e.target.files[0]) });
    const resetBtn = iconBtn("reset", "Use the default cover photo", () => update({ cover_image: null }));
    const sectionBoxes = core().SECTIONS.map((id) => {
      const box = el("input", { type: "checkbox", "data-section": id, onchange: () => update({ sections: core().toggleSection(pack.sections, id) }) });
      return el("label", { class: "inline-check" }, box, core().SECTION_TITLES[id]);
    });

    function syncControls() {
      themeSeg.sync();
      typeSeg.sync();
      if (preparedInput.value !== pack.prepared_for) preparedInput.value = pack.prepared_for;
      if (noteInput.value !== pack.cover_note) noteInput.value = pack.cover_note;
      coverThumb.src = coverUrl();
      resetBtn.disabled = !pack.cover_image;
      sectionBoxes.forEach((label) => {
        const box = label.querySelector("input");
        box.checked = pack.sections.includes(box.dataset.section);
        box.disabled = box.checked && pack.sections.length === 1;
      });
    }

    function coverUrl() {
      return pack.cover_image ? A().apiUrl(`${packPath}/cover/${encodeURIComponent(pack.cover_image)}`) : `${ASSETS}/hero-default.jpg`;
    }

    // ---- preview -----------------------------------------------------------------------------------------------
    const scaler = el("div", { class: "cp-scaler" });
    const stage = el("div", { class: "cp-stage" }, scaler);
    const pageReadout = el("span", { class: "cp-page-no" });
    const prevBtn = iconBtn("prev", "Previous page", () => showPage(pageIndex - 1));
    const nextBtn = iconBtn("next", "Next page", () => showPage(pageIndex + 1));
    const printBtn = iconBtn("print", "Save as PDF", printPack);
    const mapHint = el("span", { class: "cp-map-hint" });

    host.replaceChildren(
      el("div", { class: "card-header" }, el("h2", {}, "Charter Pack"),
        el("div", { class: "cp-actions" }, prevBtn, pageReadout, nextBtn, el("span", { class: "cp-sep" }), mapHint, printBtn)),
      el("div", { class: "cp-layout" },
        el("div", { class: "cp-settings" },
          el("div", { class: "form-section" }, el("h3", {}, "Look"), themeSeg, typeSeg),
          el("div", { class: "form-section" }, el("h3", {}, "Cover"),
            el("label", {}, "Prepared for", preparedInput),
            el("label", {}, "Cover note", noteInput),
            el("div", { class: "cp-cover-row" }, coverThumb, iconBtn("upload", "Upload a cover photo", () => fileInput.click()), resetBtn, fileInput)),
          el("div", { class: "form-section" }, el("h3", {}, "Sections"), ...sectionBoxes)),
        stage));

    function pages() {
      return [...scaler.querySelectorAll(".pack-page")];
    }

    function showPage(index) {
      const all = pages();
      pageIndex = Math.max(0, Math.min(all.length - 1, index));
      all.forEach((p, i) => p.classList.toggle("is-current", i === pageIndex));
      pageReadout.textContent = `${pageIndex + 1} / ${all.length}`;
      prevBtn.disabled = pageIndex === 0;
      nextBtn.disabled = pageIndex === all.length - 1;
      fit();
    }

    function fit() {
      const current = pages()[pageIndex];
      if (!current) return;
      const scale = Math.min(1, stage.clientWidth / current.offsetWidth);
      scaler.style.transform = `scale(${scale})`;
      stage.style.height = `${Math.ceil(current.offsetHeight * scale)}px`;
    }

    const UNITS = "li, .pack-stop, .pack-course, .pack-crew-group, .pack-notes, .pack-welcome > p";
    const LABEL = ".pack-day-head, .pack-stop-name, h3, h4";
    const overflows = (flow) => flow.scrollHeight > flow.clientHeight + 1;

    // The flow's only block is taller than the page: move its tail, one item at a time (a list item, stop, course or
    // paragraph), into a continuation block until the page fits, keeping at least one item behind. Parts left holding
    // only their heading follow their items; the headings of parts that continue are repeated. Review H3.
    function splitBlock(flow) {
      const block = flow.lastElementChild;
      const rest = block.cloneNode(false);
      const clones = new Map([[block, rest]]);
      const cloneOf = (orig) => {
        if (!clones.has(orig)) {
          const c = orig.cloneNode(false);
          cloneOf(orig.parentElement).prepend(c);
          clones.set(orig, c);
        }
        return clones.get(orig);
      };
      while (overflows(flow)) {
        const units = [...block.querySelectorAll(UNITS)];
        const unit = units[units.length - 1];
        if (!unit || !units.some((u) => u !== unit && !u.contains(unit))) break;
        let parent = unit.parentElement;
        cloneOf(parent).prepend(unit);
        while (parent !== block && ![...parent.children].some((c) => !c.matches(LABEL))) {
          const up = parent.parentElement;
          const c = cloneOf(parent);
          [...parent.children].reverse().forEach((label) => c.prepend(label));
          parent.remove();
          parent = up;
        }
      }
      if (!rest.children.length) return null;
      clones.forEach((c, orig) => {
        if (!orig.isConnected || c.querySelector(`:scope > :is(${LABEL})`)) return;
        [...orig.children].filter((ch) => ch.matches(LABEL)).reverse().forEach((label) => {
          const copy = label.cloneNode(true);
          copy.classList.add("pack-cont");
          c.prepend(copy);
        });
      });
      return rest;
    }

    // Lays each section's blocks onto A4 pages: a block that overflows its page starts the next ("continued") page, and
    // a block taller than a whole page is split across pages.
    function drawPages() {
      model = core().buildPackModel(payload, pack);
      const out = R().renderPack(model, { coverUrl: coverUrl(), stampUrl: `${ASSETS}/stamp.png` });
      const footer = R().esc(model.footer);
      scaler.className = `cp-scaler pack-theme-${pack.theme}`;
      scaler.innerHTML = R().coverPageHtml(out.cover);
      const newPage = (title, continued) => {
        scaler.insertAdjacentHTML("beforeend", R().pageHtml({ head: R().sectionHead(title, continued), blocks: [], footer, subjectToChange: model.subjectToChange, pageNo: "", total: "" }));
        return scaler.lastElementChild.querySelector(".pack-flow");
      };
      out.sections.forEach((section) => {
        let flow = newPage(section.title, false);
        section.blocks.forEach((html) => {
          flow.insertAdjacentHTML("beforeend", html);
          while (overflows(flow)) {
            const next = flow.children.length > 1 ? flow.lastElementChild : splitBlock(flow);
            if (!next) break;   // a single item taller than a page: nothing left to move
            flow = newPage(section.title, true);
            flow.append(next);
          }
        });
      });
      const all = pages();
      all.forEach((p, i) => {
        const no = p.querySelector("[data-page-no]");
        if (no) no.textContent = `${i + 1} / ${all.length}`;
      });
      showPage(pageIndex);
      placeMap();
    }

    // ---- map ---------------------------------------------------------------------------------------------------
    function setMapReady(ready, hint) {
      mapReady = ready;
      printBtn.disabled = !ready;
      mapHint.textContent = hint || "";
    }

    function tint() {
      return getComputedStyle(scaler).getPropertyValue("--pack-tint").trim() || "#c8a96b";
    }

    function dropMap() {
      window.clearTimeout(mapTimer);
      if (map) map.remove();
      map = null;
      mapBox = null;
      mapLine = null;
    }

    const failedNote = () => el("p", { class: "pack-map-failed" }, "Map couldn't load — the route is listed below.");

    function mapFailed(slot) {
      dropMap();
      mapBroken = true;
      if (slot && slot.isConnected) slot.replaceWith(failedNote());
      setMapReady(true);
    }

    // A redraw makes a new empty map slot: move the live map into it, or build the map the first time.
    function placeMap() {
      const slot = scaler.querySelector("[data-pack-map]");
      if (!slot) {
        dropMap();
        setMapReady(true);
        return;
      }
      if (mapBroken) {
        slot.replaceWith(failedNote());
        return;
      }
      if (map && mapBox) {
        slot.replaceWith(mapBox);
        map.invalidateSize();
        if (mapLine) mapLine.setStyle({ color: tint() });
        return;
      }
      drawMap(slot);
    }

    async function drawMap(slot) {
      setMapReady(false, "Loading map…");
      let L;
      try {
        L = await A().loadLeaflet();
      } catch (error) {
        mapFailed(slot);
        return;
      }
      if (!alive || !slot.isConnected) return;
      try {
        buildMap(L, slot);
      } catch (error) {
        mapFailed(mapBox || slot);
      }
    }

    function buildMap(L, slot) {
      const route = model.sections.find((s) => s.id === "route");
      const line = payload.itinerary.route.points.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).map((p) => [p.latitude, p.longitude]);
      map = L.map(slot, {
        zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false,
        touchZoom: false, zoomSnap: 0.25, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false, inertia: false
      });
      mapBox = slot;
      map.attributionControl.setPrefix(false);
      map.fitBounds(L.latLngBounds(line).pad(0.08));
      mapLine = L.polyline(line, { color: tint(), weight: 2.5, opacity: 0.9, interactive: false }).addTo(map);
      const points = route.markers.map((m) => {
        const p = map.latLngToContainerPoint([m.lat, m.lng]);
        return { x: p.x, y: p.y, label: m.label, name: m.name };
      });
      core().mergeMarkers(points, MERGE_PX).forEach((g) => {
        const icon = L.divIcon({ className: "pack-marker", html: `<span>${R().esc(g.label)}</span>`, iconSize: null });
        L.marker(map.containerPointToLatLng([g.x, g.y]), { icon, interactive: false, keyboard: false }).addTo(map);
      });
      // "load" fires once every tile in view has finished, failed ones included: a few missing tiles are fine, none at
      // all (no internet) is a failure (review M1). The timeout covers tiles that never answer.
      const tiles = L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 16 });
      let tilesLoaded = 0;
      tiles.on("tileload", () => { tilesLoaded += 1; });
      tiles.once("load", () => {
        window.clearTimeout(mapTimer);
        if (!alive) return;
        if (tilesLoaded) setMapReady(true);
        else mapFailed(mapBox);
      });
      tiles.addTo(map);
      mapTimer = window.setTimeout(() => { if (!mapReady) mapFailed(mapBox); }, MAP_TIMEOUT_MS);
    }

    // ---- saving ------------------------------------------------------------------------------------------------
    function save() {
      window.clearTimeout(saveTimer);
      saveTimer = 0;
      if (saving) {
        saveAgain = true;
        return saving;
      }
      saving = sendPack().finally(() => {
        saving = null;
        if (saveAgain) {
          saveAgain = false;
          save();
        }
      });
      return saving;
    }

    async function sendPack() {
      try {
        const saved = await A().api(packPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack, base_revision: revision }) });
        revision = saved.revision;
      } catch (error) {
        if (error.loginRequired) return;
        if (error.status === 409 && error.payload && error.payload.pack) {
          revision = error.payload.revision;
          pack = core().normalizePack(error.payload.pack);
          if (alive) { syncControls(); drawPages(); }
        }
        A().setStatus(error.message || "The charter pack could not be saved.", "error");
      }
    }

    function update(patch, typing) {
      pack = { ...pack, ...patch };
      syncControls();
      window.clearTimeout(redrawTimer);
      if (typing) redrawTimer = window.setTimeout(drawPages, TEXT_REDRAW_MS);
      else drawPages();
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, SAVE_DELAY_MS);
    }

    async function uploadCover(file) {
      fileInput.value = "";
      if (!file) return;
      try {
        const response = await fetch(A().apiUrl(`${packPath}/cover`), {
          method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "The cover photo could not be uploaded.");
        update({ cover_image: result.cover_image });
        await save();
      } catch (error) {
        A().setStatus(error.message, "error");
      }
    }

    // ---- printing ----------------------------------------------------------------------------------------------
    // Moves the live pages (loaded images and map included) straight into <body> for printing and back afterwards;
    // charter-pack.css hides everything else while printing (review M3: a copy could print before its images load).
    function printPack() {
      if (!mapReady) return;
      removePrintHost();
      const printHost = el("div", { id: "pack-print-host", class: `pack-theme-${pack.theme}` }, ...pages());
      document.body.append(printHost);
      document.body.classList.add("pack-printing");
      restorePrinted = () => {
        scaler.append(...printHost.children);
        showPage(pageIndex);
        if (map) map.invalidateSize();
      };
      window.addEventListener("afterprint", removePrintHost, { once: true });
      window.print();
    }

    const resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(stage);
    teardown = () => {
      alive = false;
      window.clearTimeout(redrawTimer);
      if (saveTimer) save();
      resizeObserver.disconnect();
      dropMap();
      removePrintHost();
    };

    syncControls();
    drawPages();
  }

  window.IolantheCharterPack = Object.freeze({ render, bind, destroy });
})();
