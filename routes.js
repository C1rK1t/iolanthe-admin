// Routes panel (Charter → Routes). Uses window.IolantheAdmin (admin.js) and window.IolantheRoutesCore.
// Ported from docs/route-planner/planner-mockup.html. Split into: routes-ui.js (el, icons, modal shell),
// routes-popup.js (point popup), routes-lists.js (Stops / Legs lists), routes-join.js (Add another route),
// routes-places.js (anchorages, sites), routes-io.js (KML / GPX import, imported pins, export).
(function () {
  "use strict";

  const A = () => window.IolantheAdmin;
  const core = () => window.IolantheRoutesCore;
  const icore = () => window.IolantheItineraryCore;
  const DEFAULT_SPEED_KN = 8;
  const MAX_SPEED_KN = 30;
  const SPEED_KEY = "routePlanner.speed"; // last route speed used in this browser; seeds new routes only
  let panel = null;      // the #routes-panel element after bind()
  let routes = [];       // library from the server
  let work = null;       // { route, savedJson, baseRevision }; route carries points, activities, dirty_stop_ids, welcome_message
  let subject = { type: "library" };   // or { type: "charter", charterId, charter, itinerary, focusStopId }; a library subject may carry routeId
  const isCharter = () => subject.type === "charter";
  const charterEnded = () => {
    if (!isCharter() || !subject.charter || !subject.charter.end_date) return false;
    const end = icore().parseDateOnly(subject.charter.end_date);
    return end !== null && Date.now() > end + 86400000;   // the day after the end date, UTC midnight
  };
  // Temporarily off (David, 2026-10-08): ended charters stay editable so their migrated data can be repaired.
  // Restore with: const readOnly = () => isCharter() && charterEnded();
  const readOnly = () => false;
  let history = { undo: [], redo: [] };
  let guard = null;      // page unsaved-changes guard

  const MAP_CENTER = [12.1, 120.0];
  const STICKY_PX = 40;   // an anchorage stop dropped this close to its anchorage snaps back (spec A2 T5)
  let map = null;        // Leaflet map for the current panel
  const groups = {};     // Leaflet layer groups
  let routeLines = [];
  let pointMarkers = [];
  let keyHandler = null; // document keydown listener (undo/redo), removed on the next bind
  const ui = { mode: "select", layers: { sites: true, anchorages: true, stops: true, pins: true } };
  let places = null;     // IolantheRoutesPlaces instance, created fresh by each bind()
  let popup = null;      // IolantheRoutesPopup instance, created fresh by each bind()
  let lists = null;      // IolantheRoutesLists instance, created fresh by each bind()
  let join = null;       // IolantheRoutesJoin instance, created fresh by each bind()
  let io = null;         // IolantheRoutesIo instance (import, pins, export), created fresh by each bind()
  let cards = null;      // IolantheStopCards instance (the strip), created fresh by each bind()
  let days = null;       // IolantheRoutesDays instance (the Days tab), created fresh by each bind()
  const MAX_HISTORY = 100;

  const { el, svg, openModal, closeModal } = window.IolantheRoutesUi;

  const MODES = [
    { id: "select", label: "Select", icon: "select", hint: "Tap a point to inspect it. Drag a point to move it, or drag a faint midpoint to insert one." },
    { id: "add", label: "Add", icon: "add", hint: "Tap the map to add a point at the end." },
    { id: "anchorage", label: "Anchorage", icon: "anchor", hint: "Tap the map to create an anchorage. Tap one to edit it, or drag it to move it." },
    { id: "delete", label: "Delete", icon: "erase", hint: "Tap a route point to delete it." }
  ];

  let saving = false;    // a save request is in flight
  const JSON_HEADERS = { "Content-Type": "application/json" };
  const post = (path, body) => A().api(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });

  // ---------- helpers ----------
  const $ = (id) => panel.querySelector(`#routes-${id}`);
  const fmtDate = (iso) => (iso || "").slice(0, 10);
  const speedKn = () => (work && work.route.speed_kn) || 0;

  // Days available to the record: the charter's for a charter route, the terminus's arrival day for an unassigned one.
  const dayCount = () => (isCharter() ? icore().charterDayCount(subject.charter) : icore().recordDayCount(work ? work.route.points : []));
  const charterOrNull = () => (isCharter() ? subject.charter : null);

  // The panel works on a route-shaped object; itinerary-core works on the record shape. Same data, two spellings.
  function toRecord(route) {
    return icore().normalizeItinerary({
      version: 2, revision: route.revision || 0, welcome_message: route.welcome_message || "", summary: route.summary || "",
      route: { source: route.source || null, speed_kn: route.speed_kn, points: route.points },
      activities: route.activities || [], dirty_stop_ids: route.dirty_stop_ids || []
    });
  }
  // Keeps the route's own speed (a blank library speed must stay blank) and everything itinerary-core does not know about.
  const fromRecord = (route, record) => ({ ...route, points: record.route.points, activities: record.activities, dirty_stop_ids: record.dirty_stop_ids, welcome_message: record.welcome_message });

  function loadSpeed() {
    try { const v = parseFloat(localStorage.getItem(SPEED_KEY)); return Number.isFinite(v) ? v : DEFAULT_SPEED_KN; } catch (e) { return DEFAULT_SPEED_KN; }
  }
  function storeSpeed(v) { try { localStorage.setItem(SPEED_KEY, String(v)); } catch (e) { /* per-browser convenience only */ } }

  // ---------- markup ----------
  function render() {
    if (!A().canManageCharterAdmin()) {
      return '<section class="card full routes-panel"><div class="card-header"><h2>Route</h2></div><p class="empty">The Route page is available to Charter Admin on the bridge.</p></section>';
    }
    return `<section class="card full routes-panel" id="routes-panel">
      <div class="card-header">
        <h2>Route</h2>
        <label class="subject" for="routes-subject"><span class="side-label">Working on</span><select id="routes-subject"></select></label>
        <div class="pills" id="routes-pills"></div>
        <div class="icon-row" id="routes-actions"></div>
      </div>
      <div class="planner">
        <aside class="side">
          <div class="field" id="routes-charter-note" hidden></div>
          <div class="field" id="routes-name-field">
            <label for="routes-name">Name</label>
            <input id="routes-name" type="text" autocomplete="off" placeholder="Route name">
          </div>
          <div class="field">
            <label for="routes-desc" id="routes-desc-label">Description</label>
            <textarea id="routes-desc" placeholder="Optional"></textarea>
          </div>
          <div class="stats" id="routes-stats"></div>
          <div class="tabbox">
            <div class="tabs" role="tablist" aria-label="Legs and days">
              <button type="button" role="tab" id="routes-tab-legs" aria-controls="routes-panel-legs" aria-selected="true">Legs</button>
              <button type="button" role="tab" id="routes-tab-days" aria-controls="routes-panel-days" aria-selected="false">Days</button>
            </div>
            <div class="tab-panel" role="tabpanel" id="routes-panel-legs" aria-labelledby="routes-tab-legs">
              <div class="legs-head">
                <label class="speed-row" title="Saved with the route. Legs use it unless they have their own speed.">Route speed <input id="routes-speed" type="number" min="0" max="30" step="0.5"> kn</label>
                <button type="button" class="icon-btn small" id="routes-copy-legs" title="Copy the legs for Excel" aria-label="Copy the legs for Excel"></button>
              </div>
              <div class="stops" id="routes-legs"></div>
            </div>
            <div class="tab-panel" role="tabpanel" id="routes-panel-days" aria-labelledby="routes-tab-days" hidden>
              <div class="days" id="routes-days"></div>
            </div>
          </div>
          <div class="meta" id="routes-meta"></div>
        </aside>
        <div class="splitter splitter-v" id="routes-split-v" title="Drag to resize"></div>
        <div class="map-wrap">
          <div id="routes-map"></div>
          <div class="layers" id="routes-layers"></div>
          <div class="map-toolbar">
            <div class="seg" id="routes-modes"></div>
          </div>
          <div class="map-hint" id="routes-map-hint"></div>
        </div>
        <div class="splitter splitter-h" id="routes-split-h" title="Drag to resize"></div>
        <div class="strip-host" id="routes-strip"></div>
      </div>
    </section>`;
  }

  // ---------- working route ----------
  const isDirty = () => Boolean(work) && core().routeSnapshot(work.route) !== work.savedJson;

  function setWork(route, opts) {
    const clone = JSON.parse(JSON.stringify(route));
    clone.activities = Array.isArray(clone.activities) ? clone.activities : [];
    clone.dirty_stop_ids = Array.isArray(clone.dirty_stop_ids) ? clone.dirty_stop_ids : [];
    work = { route: clone, savedJson: core().routeSnapshot(clone), baseRevision: clone.revision || 0 };
    history = { undo: [], redo: [] };
    renderAll({ fit: true, inputs: true, ...(opts || {}) });
  }

  function openLibraryRoute(id) {
    const r = routes.find((x) => x.id === id);
    if (r) setWork(r);
  }

  // The charter's itinerary.json as the panel's route-shaped record (spec A2 D14: one record shape).
  function charterRouteFromItinerary(itinerary) {
    const it = icore().normalizeItinerary(itinerary);
    const name = `${(subject.charter && subject.charter.name) || subject.charterId} route`;
    return {
      id: "charter", name, description: "", revision: it.revision, speed_kn: it.route.speed_kn, source: it.route.source, points: it.route.points,
      activities: it.activities, dirty_stop_ids: it.dirty_stop_ids, welcome_message: it.welcome_message, summary: it.summary, created_at: null, updated_at: null
    };
  }

  function blankRoute() {
    return { id: "", name: "", description: "", revision: 0, speed_kn: loadSpeed(), created_at: null, updated_at: null, source: { type: "planner" }, points: [], activities: [], dirty_stop_ids: [] };
  }

  const ROUTE_DISCARD = { title: "Unsaved route", message: "Discard your unsaved route changes?", confirmLabel: "Discard", cancelLabel: "Cancel", tone: "danger" };

  // Leaving the panel loses unsaved route edits and the imported pins that weren't made into anchorages or sites.
  function leaveConfirm() {
    const n = io ? io.pinCount() : 0;
    const dirty = isDirty();
    const pinText = n ? `${n} imported pin${n === 1 ? " hasn't" : "s haven't"} been made into an anchorage or site.` : "";
    const ask = !dirty && n === 1 ? "Discard it?" : "Discard them?";
    const message = [dirty ? "You have unsaved route changes." : "", pinText, ask].filter(Boolean).join(" ");
    return { ...ROUTE_DISCARD, title: dirty ? "Unsaved route" : "Imported pins", message };
  }

  async function guardDiscard() {
    if (!isDirty()) return true;
    const ok = await A().showAdminConfirm(ROUTE_DISCARD);
    if (ok) setWork(isCharter() ? charterRouteFromItinerary(subject.itinerary) : (routes.find((r) => r.id === work.route.id) || blankRoute()));
    return ok;
  }

  function pushHistory() {
    history.undo.push(work.route);
    if (history.undo.length > MAX_HISTORY) history.undo.shift();
    history.redo = [];
  }

  // Every route-geometry edit goes through here so undo/redo stays consistent. The edited points are reconciled into
  // the record (new stops get an id and zero nights, removed stops take their items, days never run backwards) and
  // every arrival is recomputed from the departures and the legs (spec A2 D4).
  function editPoints(fn, opts) {
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    pushHistory();
    const result = icore().reconcileRoutePoints(toRecord(work.route), fn(work.route.points), dayCount());
    work.route = fromRecord(work.route, icore().recomputeArrivals(result.itinerary));
    renderAll(opts);
  }
  // Like editPoints, but leaves the map (and an open popup) alone. Used for name edits typed in the point popup.
  function editPointsQuiet(fn) {
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    pushHistory();
    const result = icore().reconcileRoutePoints(toRecord(work.route), fn(work.route.points), dayCount());
    work.route = fromRecord(work.route, icore().recomputeArrivals(result.itinerary));
    renderActions();
    renderStats();
    if (cards) cards.render();
    if (days) days.render();
  }
  // Card edits (dates, items, sites, the dirty list) go through here: pure function on the record in, record out.
  // opts.history false for bookkeeping (clearing a dirty flag); opts.map true when a point changed.
  function editRecord(fn, opts) {
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    const o = { map: false, history: true, ...(opts || {}) };
    const next = fn(toRecord(work.route));
    if (!next) return;
    if (o.history) pushHistory();
    work.route = fromRecord(work.route, next);
    renderAll(o);
  }
  function undo() {
    if (!history.undo.length) return;
    history.redo.push(work.route);
    work.route = history.undo.pop();
    renderAll();
  }
  function redo() {
    if (!history.redo.length) return;
    history.undo.push(work.route);
    work.route = history.redo.pop();
    renderAll();
  }

  // ---------- side panel ----------
  // One select: this charter's route, then the unassigned routes (spec A2 D18: "library route" = "unassigned route").
  function renderSubject() {
    const sel = $("subject");
    const unassigned = el("optgroup", { label: "Unassigned" },
      routes.map((r) => el("option", { value: `lib:${r.id}` }, `${r.name} · ${r.points.filter(core().isStop).length} stops`)));
    const unsaved = !isCharter() && !work.route.id ? el("option", { value: "new" }, "New route (unsaved)") : null;
    sel.replaceChildren(el("option", { value: "charter" }, "This charter's route"), ...[unsaved, unassigned].filter(Boolean));
    sel.value = isCharter() ? "charter" : (work.route.id ? `lib:${work.route.id}` : "new");
  }

  // Spec A2 §5.1: the fit pill (last arrival against the charter's end) and the to-check pill (dirty stops).
  function renderPills() {
    const f = icore().fit(toRecord(work.route), charterOrNull());
    const dirty = (work.route.dirty_stop_ids || []).length;
    $("pills").replaceChildren(...[
      el("span", { class: `pill fit-${f.state}`, title: f.title, "aria-label": `Fit: ${f.title}` }, f.label),
      dirty ? el("span", { class: "pill check", title: "Stops whose dates moved under them. Open each card to clear it." }, `${dirty} to check`) : null
    ].filter(Boolean));   // replaceChildren(null) would insert the text "null"
  }

  function renderStats() {
    const pts = work.route.points;
    const stopCount = pts.filter(core().isStop).length;
    $("stats").replaceChildren(
      el("div", { class: "stat" }, el("b", {}, core().routeNm(pts).toFixed(1)), el("span", {}, "nm total")),
      el("div", { class: "stat" }, el("b", {}, `${stopCount} / ${lists.legCount()}`), el("span", {}, "stops / legs")),
      lists.timeStat());
    lists.renderLegs($("legs"));
    renderPills();

    const r = work.route;
    const src = r.source || {};
    const srcText = src.type === "import" ? `imported from ${src.from && src.from.type === "charter" ? "a charter" : "an unassigned route"}` : src.type === "charter-v1" || src.type === "charter" ? "migrated from a charter" : src.type === "kml" || src.type === "gpx" ? `imported from ${src.filename || src.type}` : "planner";
    $("meta").textContent = isCharter()
      ? `Charter route · revision ${(subject.itinerary && subject.itinerary.revision) || 0} · ${srcText}${isDirty() ? " · unsaved changes" : ""}`
      : r.id
      ? `Revision ${r.revision} · updated ${fmtDate(r.updated_at)} · source: ${srcText}${isDirty() ? " · unsaved changes" : ""}`
      : (isDirty() ? "Unsaved new route" : "");
  }

  function showTab(name) {
    ["legs", "days"].forEach((t) => {
      $(`tab-${t}`).setAttribute("aria-selected", String(t === name));
      $(`panel-${t}`).hidden = t !== name;
    });
    if (name === "days" && days) days.render();   // the tube line measures boxes, so draw it once the tab is visible
  }

  function renderAll(opts) {
    const o = opts || {};
    if (o.inputs) {
      $("name").value = work.route.name;
      $("desc").value = isCharter() ? (work.route.welcome_message || "") : (work.route.description || "");
      $("speed").value = work.route.speed_kn || "";
    }
    renderSubject();
    renderActions();
    renderStats();
    renderModes();
    renderLayers();
    if (o.map !== false) renderMap(o);
    if (cards) cards.render();
    scheduleFitMap();
    if (days && !$("panel-days").hidden) days.render();
  }

  // ---------- header actions ----------
  function renderActions() {
    const dirty = isDirty();
    const hasId = Boolean(work.route.id);
    const b = (icon, title, onclick, cls, disabled) => {
      const btn = el("button", { type: "button", class: `icon-btn ${cls || ""}`.trim(), title, "aria-label": title, onclick, disabled });
      btn.innerHTML = svg(icon);
      return btn;
    };
    if (isCharter()) {
      const ro = readOnly();
      $("actions").replaceChildren(
        b("check", "Save charter route", saveCharterRoute, "success", ro || saving || !dirty),
        b("cancel", "Cancel (discard changes)", cancelChanges, "danger", ro || !dirty),
        el("span", { class: "icon-sep" }),
        b("undo", "Undo (Ctrl+Z)", undo, "", ro || !history.undo.length),
        b("redo", "Redo (Ctrl+Y)", redo, "", ro || !history.redo.length),
        el("span", { class: "icon-sep" }),
        b("start", "Start from an unassigned route or another charter…", openStartFrom, "", ro || saving),
        b("saveAs", "Save as an unassigned route (items kept)", () => saveAs(false), "", work.route.points.length < 2),
        b("import", "Import KML / GPX", () => io.openImport(), "", ro),
        b("export", "Export GPX / KML", () => io.openExport(), "", work.route.points.length < 2));
      return;
    }
    $("actions").replaceChildren(
      b("check", "Save", saveRoute, "success", saving || (!dirty && hasId)),
      b("cancel", "Cancel (discard changes)", cancelChanges, "danger", !dirty),
      el("span", { class: "icon-sep" }),
      b("undo", "Undo (Ctrl+Z)", undo, "", !history.undo.length),
      b("redo", "Redo (Ctrl+Y)", redo, "", !history.redo.length),
      el("span", { class: "icon-sep" }),
      b("plus", "New route", newRoute),
      b("saveAs", "Save As", () => saveAs(false), "", work.route.points.length < 2),
      b("join", "Add another route to this one", () => join.openJoin()),
      b("import", "Import KML / GPX", () => io.openImport()),
      b("export", "Export GPX / KML", () => io.openExport(), "", work.route.points.length < 2),
      b("trash", "Delete route", deleteRoute, "", !hasId));
  }

  // ---------- map ----------
  function renderModes() {
    $("modes").replaceChildren(...MODES.map((m) => {
      const btn = el("button", { type: "button", "aria-pressed": String(ui.mode === m.id), title: m.label, onclick: () => setMode(m.id) });
      btn.innerHTML = `${svg(m.icon)}<span class="lbl">${m.label}</span>`;
      return btn;
    }));
    $("map-hint").textContent = MODES.find((m) => m.id === ui.mode).hint;
  }

  function renderLayers() {
    const item = (key, color, label) => el("label", {},
      el("input", { type: "checkbox", checked: ui.layers[key], onchange: (e) => { ui.layers[key] = e.target.checked; renderMap(); } }),
      el("span", { class: "dot", style: `background:${color}` }), label);
    const pinCount = io ? io.pinCount() : 0;
    $("layers").replaceChildren(item("sites", "var(--site)", "Sites"), item("anchorages", "var(--stop)", "Anchorages"), item("stops", "var(--stop)", "Stops"),
      item("pins", "var(--pin)", `Imported pins${pinCount ? ` (${pinCount})` : ""}`));
  }

  function applyModeClass() {
    if (!map) return;
    const box = $("map");
    MODES.forEach((m) => box.classList.toggle(`mode-${m.id}`, m.id === ui.mode));
  }

  function setMode(mode) {
    ui.mode = mode;
    if (map) { map.closePopup(); applyModeClass(); }
    renderModes();
    renderMap();
  }

  function destroyMap() {
    if (map) { map.remove(); map = null; }
    Object.keys(groups).forEach((k) => delete groups[k]);
    routeLines = [];
    pointMarkers = [];
  }

  const MAP_MIN_PX = 380;
  const MAP_GAP_PX = 32;        // panel padding + gaps between the map and the strip
  const MAP_H_KEY = "routePlanner.mapH";   // a splitter drag (T4) stores the user's height here; blank = fit the viewport
  let fitMapTimer = null;

  // Spec A2 T1: the map is as tall as the viewport allows above the docked strip, unless the user dragged the splitter.
  function fitMap() {
    if (!panel || !panel.isConnected) return;
    if (window.innerWidth <= 900) { panel.style.removeProperty("--map-h"); return; }
    let h = 0;
    try { h = parseInt(localStorage.getItem(MAP_H_KEY), 10) || 0; } catch (e) { h = 0; }
    if (!h) {
      const strip = $("strip");
      const stripH = strip && strip.offsetHeight ? strip.offsetHeight : 260;
      const top = panel.querySelector(".planner").getBoundingClientRect().top + window.scrollY;
      const headerH = Math.max(0, top);   // everything above the planner (admin header, department bar, Route page header)
      h = window.innerHeight - headerH - stripH - MAP_GAP_PX;
    }
    panel.style.setProperty("--map-h", `${Math.max(MAP_MIN_PX, Math.round(h))}px`);
    if (map) map.invalidateSize();
  }
  function scheduleFitMap() {
    clearTimeout(fitMapTimer);
    fitMapTimer = setTimeout(fitMap, 60);
  }
  const SIDE_W_KEY = "routePlanner.sideW";
  // Spec A2 T4: drag the vertical splitter to resize the side column, the horizontal one to resize the map. Both remembered per browser.
  function bindSplitters() {
    const store = (key, value) => { try { localStorage.setItem(key, String(value)); } catch (e) { /* per-browser only */ } };
    let sideW = 0;
    try { sideW = parseInt(localStorage.getItem(SIDE_W_KEY), 10) || 0; } catch (e) { sideW = 0; }
    if (sideW) panel.style.setProperty("--side-w", `${sideW}px`);
    const drag = (handle, onMove, onEnd) => {
      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        handle.classList.add("dragging");
        const move = (ev) => onMove(ev);
        const up = () => { handle.removeEventListener("pointermove", move); handle.classList.remove("dragging"); onEnd(); };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up, { once: true });
        handle.addEventListener("pointercancel", up, { once: true });
      });
    };
    const planner = panel.querySelector(".planner");
    drag($("split-v"), (ev) => {
      const w = Math.max(300, Math.min(ev.clientX - planner.getBoundingClientRect().left, planner.clientWidth * 0.6));
      panel.style.setProperty("--side-w", `${Math.round(w)}px`);
    }, () => store(SIDE_W_KEY, parseInt(panel.style.getPropertyValue("--side-w"), 10) || 0));
    drag($("split-h"), (ev) => {
      const mapTop = panel.querySelector(".map-wrap").getBoundingClientRect().top;
      const h = Math.max(MAP_MIN_PX, Math.round(ev.clientY - mapTop));
      panel.style.setProperty("--map-h", `${h}px`);
      if (map) map.invalidateSize();
    }, () => store(MAP_H_KEY, parseInt(panel.style.getPropertyValue("--map-h"), 10) || 0));
    $("split-h").addEventListener("dblclick", () => { store(MAP_H_KEY, ""); fitMap(); });   // double-click: back to fit-the-viewport
  }

  async function initMap(mine) {
    const container = $("map");
    let L;
    try {
      L = await A().loadLeaflet();
    } catch (error) {
      if (panel !== mine || !mine.isConnected) return;
      container.replaceChildren(el("div", { class: "map-fallback" }, "The map needs an internet connection (Leaflet and satellite tiles load online)."));
      A().setStatus(error.message || "The map could not be loaded.", "error");
      return;
    }
    if (panel !== mine || !mine.isConnected) return;
    destroyMap();
    map = L.map(container, { zoomControl: false }).setView(MAP_CENTER, 10);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18, attribution: "Tiles &copy; Esri"
    }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    ["tender", "sites", "anchorages", "pins", "route", "mids", "points"].forEach((k) => { groups[k] = L.layerGroup().addTo(map); });
    map.on("click", onMapClick);
    applyModeClass();
    const leafletMap = map;
    setTimeout(() => { if (map === leafletMap) leafletMap.invalidateSize(); }, 0);
    if (work) renderMap({ fit: true });
  }

  const divIcon = (html, size) => {
    const n = size || 32;
    return window.L.divIcon({ className: "mk", html: `<div class="mk-hit">${html}</div>`, iconSize: [n, n], iconAnchor: [n / 2, n / 2] });
  };
  const ll = (p) => [p.latitude, p.longitude];

  function renderMap(opts) {
    if (!map || !work) return;
    const L = window.L;
    const o = opts || {};
    Object.values(groups).forEach((g) => g.clearLayers());
    pointMarkers = [];
    const pts = work.route.points;
    const c = core();

    if (places) {
      places.draw(L, groups, {
        mode: ui.mode,
        layers: ui.layers,
        usedAnchorageIds: new Set(pts.filter((p) => p.anchorage_id).map((p) => p.anchorage_id)),
        divIcon,
        onAnchorageClick,
        onSiteClick,
        onAnchorageDragEnd
      });
      // tender lines: each stop to every site it serves
      pts.filter(c.isStop).forEach((p) => (p.site_ids || []).map(places.findSite).filter(Boolean).forEach((s) => {
        L.polyline([ll(p), ll(s)], { color: "#fff", weight: 1.5, opacity: 0.75, dashArray: "4 6", interactive: false }).addTo(groups.tender);
      }));
    }

    if (io) io.drawPins(L, groups.pins, { show: ui.layers.pins, divIcon });

    routeLines = [
      L.polyline(pts.map(ll), { color: "#1d3540", weight: 6, opacity: 0.6, interactive: false }).addTo(groups.route),
      L.polyline(pts.map(ll), { color: getComputedStyle(panel).getPropertyValue("--route").trim() || "#ffd23f", weight: 3, interactive: false }).addTo(groups.route)
    ];

    if (ui.mode !== "delete") {
      pts.slice(1).forEach((p, k) => {
        const mid = { latitude: (pts[k].latitude + p.latitude) / 2, longitude: (pts[k].longitude + p.longitude) / 2 };
        L.marker(ll(mid), { icon: divIcon('<div class="mk-mid"></div>', 24), draggable: !readOnly(), title: "Drag to insert a point", zIndexOffset: 400 })
          .on("click", () => editPoints((arr) => c.insertAt(arr, k + 1, mid)))
          .on("dragend", (e) => { const q = e.target.getLatLng(); editPoints((arr) => c.insertAt(arr, k + 1, { latitude: q.lat, longitude: q.lng })); })
          .addTo(groups.mids);
      });
    }

    let stopNo = 0;
    pts.forEach((p, i) => {
      let html;
      if (c.isStop(p)) {
        stopNo += 1;
        const a = places && p.anchorage_id ? places.findAnchorage(p.anchorage_id) : null;
        const flagged = places && p.anchorage_id && ((!a && places.isLoaded()) || c.anchorageMovedM(p, a) > 0);
        const selected = cards && cards.selectedId() === p.id;
        html = `<div class="mk-stop${p.anchorage_id ? "" : " plain"}${selected ? " selected" : ""}">${stopNo}</div>${p.anchorage_id ? '<div class="mk-anchor-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/></svg></div>' : ""}${flagged ? '<div class="mk-badge">!</div>' : ""}`;
      }
      else html = `<div class="mk-wp ${p.name ? "named" : ""}"></div>`;
      const m = L.marker(ll(p), { icon: divIcon(html), draggable: ui.mode !== "delete" && !readOnly(), title: p.name || "Waypoint", zIndexOffset: c.isStop(p) ? 1100 : 1000 });
      m.on("click", () => onPointClick(i));
      m.on("drag", (e) => {
        const q = e.target.getLatLng();
        const live = pts.map((x, j) => (j === i ? [q.lat, q.lng] : ll(x)));
        routeLines.forEach((line) => line.setLatLngs(live));
      });
      m.on("dragend", (e) => {
        const q = e.target.getLatLng();
        const cur = work.route.points[i];
        const own = c.isStop(cur) && cur.anchorage_id && places ? places.findAnchorage(cur.anchorage_id) : null;
        if (own && map.latLngToContainerPoint(q).distanceTo(map.latLngToContainerPoint([own.latitude, own.longitude])) <= STICKY_PX) {
          renderMap();   // sticky: it stays on its anchorage
          return;
        }
        const anchorage = places ? places.anchorageUnder(map, q) : null;
        if (anchorage && !(own && anchorage.id === own.id)) { makeStopAtAnchorage(i, anchorage, { snapped: true }); return; }
        if (own) {
          editPoints((arr) => c.unlinkStop(arr, i, q));
          status(`${cur.name || "Stop"} moved off ${own.name}; it is a plain stop now (make it an anchorage from its popup if you like).`, "");
          return;
        }
        editPoints((arr) => c.replaceAt(arr, i, { ...arr[i], latitude: q.lat, longitude: q.lng }));
      });
      m.addTo(groups.points);
      pointMarkers[i] = m;
    });

    if (o.fit && pts.length) map.fitBounds(L.latLngBounds(pts.map(ll)).pad(0.15));
    if (o.fit && !pts.length) map.setView(MAP_CENTER, 10);
    if (Number.isInteger(o.popup) && pointMarkers[o.popup]) openPointPopup(o.popup);
  }

  function focusPoint(i) {
    if (!map || !pointMarkers[i]) return;
    const p = work.route.points[i];
    if (core().isStop(p) && cards) { cards.select(p.id); return; }
    map.panTo(pointMarkers[i].getLatLng());
    openPointPopup(i);
  }

  // Spec A2 §5.3: the selected card's stop is drawn larger on the map; selecting a card pans to it.
  function highlightStop(stopId) {
    if (!work) return;
    work.route.points.forEach((p, i) => {
      const m = pointMarkers[i];
      const node = m && m.getElement ? m.getElement() : null;
      const dot = node ? node.querySelector(".mk-stop") : null;
      if (dot) dot.classList.toggle("selected", Boolean(stopId) && p.id === stopId);
    });
  }
  function panToStop(stopId) {
    const i = work.route.points.findIndex((p) => p.id === stopId);
    if (map && i >= 0 && pointMarkers[i]) { map.closePopup(); map.panTo(pointMarkers[i].getLatLng()); }
    highlightStop(stopId);
  }

  // Spec A2 §5.7: dropping a day that holds items asks first. verb: "Changing the date" | "Removing the stop" | "Starting from day N".
  function dayListLabel(daysList) {
    const c = charterOrNull();
    const names = daysList.map((d) => icore().dayOrdinal(c, d));
    const text = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    return c && c.start_date ? `the ${text}` : text;
  }
  function askDrop(dropped, verb) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => { if (!settled) { settled = true; resolve(value); } };
      const n = dropped.items.length;
      openModal({
        title: `${verb}?`,
        body: el("p", {}, `${verb} will remove the itinerary entries for ${dayListLabel(dropped.days)} (${n} item${n === 1 ? "" : "s"}).`),
        saveTitle: "OK", cancelIcon: "revert", cancelTitle: "Revert",
        onSave: () => { done(true); return true; },
        onClose: () => done(false)
      });
    });
  }
  // Deleting a point or turning a stop back into a waypoint drops that stop's items: ask first when there are any.
  async function deletePoint(i) {
    const p = work.route.points[i];
    if (!p) return;
    if (core().isStop(p) && !(await askDrop(icore().droppedDays(toRecord(work.route), p.id, null), "Removing the stop"))) return;
    if (map) map.closePopup();
    editPoints((pts) => core().removeAt(pts, i));
  }
  async function removeStopAt(i) {
    const p = work.route.points[i];
    if (!p || !core().isStop(p)) return;
    if (!(await askDrop(icore().droppedDays(toRecord(work.route), p.id, null), "Removing the stop"))) return;
    if (map) map.closePopup();
    editRecord((rec) => icore().removeStop(rec, p.id), { map: true });
    status("Stop removed. The point is a waypoint again.", "");
  }

  function focusLeg(leg) {
    if (!map || !work) return;
    map.closePopup();
    map.fitBounds(window.L.latLngBounds(work.route.points.slice(leg.fromIndex, leg.toIndex + 1).map(ll)).pad(0.25));
  }

  function onMapClick(e) {
    if (readOnly()) return;
    if (!work) return;
    const pos = { latitude: e.latlng.lat, longitude: e.latlng.lng };
    if (ui.mode === "anchorage" && places) places.openAnchorageModal(null, pos);
    else if (ui.mode === "add") editPoints((pts) => [...pts, pos]);
  }

  function onAnchorageClick(anchorage) {
    if (readOnly()) return;
    if (!work || !places) return;
    if (ui.mode === "add") {
      const result = core().appendStop(work.route.points, anchorage, places.sites());
      if (result.merged) status(`Already the last stop: ${anchorage.name}`, "");
      else editPoints(() => result.points);
    } else if (ui.mode === "select" || ui.mode === "anchorage") {
      map.closePopup();
      places.openAnchorageModal(anchorage);
    }
  }
  function onSiteClick(site) {
    if (readOnly()) return;
    if (!work || !places) return;
    if (ui.mode === "add") {
      editPoints((pts) => [...pts, { latitude: site.latitude, longitude: site.longitude, site_id: site.id, name: site.title }]);
      status(`Added waypoint at ${site.title}`, "");
    } else if (ui.mode === "select") {
      map.closePopup();
      places.openSiteModal(site);
    }
  }

  // Turns point i into a stop at the anchorage (or merges it into the adjacent stop there, spec Q3).
  // Reopens the point's popup afterwards unless the point was merged away or the change came from a drag.
  function makeStopAtAnchorage(i, anchorage, opts) {
    const result = core().makeStopAt(work.route.points, i, anchorage, places.sites());
    map.closePopup();
    editPoints(() => result.points, result.merged || (opts && opts.snapped) ? undefined : { popup: i });
    status(result.merged ? `Merged into the existing stop at ${anchorage.name}` : `${anchorage.name} is now a stop`, "");
  }
  function onAnchorageDragEnd(anchorage, latlng) {
    if (ui.mode === "anchorage" && places) places.moveAnchorage(anchorage, latlng);
  }

  function onPointClick(i) {
    const p = work.route.points[i];
    if (ui.mode === "select") { if (core().isStop(p) && cards) cards.select(p.id, { pan: false }); else openPointPopup(i); }
    else if (ui.mode === "delete") deletePoint(i);
  }

  function openPointPopup(i) {
    const m = pointMarkers[i];
    if (!m) return;
    m.unbindPopup();
    m.bindPopup(popup.pointPopup(i), { minWidth: 250, maxWidth: 300, autoPanPadding: [20, 60] }).openPopup();
  }

  // ---------- saving against the server ----------
  const status = (message, tone) => A().setStatus(message, tone);
  const reportError = (error) => { if (error && !error.loginRequired && error.message) status(error.message, "error"); };

  function validateRoute() {
    if (!work.route.name.trim()) return "Give the route a name before saving.";
    if (work.route.points.length < 2) return "A route needs at least 2 points.";
    return "";
  }

  // After any save, Save As or delete: the route is clean again, and the unsaved guard stays registered for later edits.
  function afterPersist() {
    if (isDirty()) return;
    A().clearPageUnsavedGuard(guard);
    A().setPageUnsavedGuard(guard);
  }

  function replaceInLibrary(saved) {
    routes = routes.some((r) => r.id === saved.id) ? routes.map((r) => (r.id === saved.id ? saved : r)) : [...routes, saved];
  }

  async function reloadLibrary() {
    const data = await A().api("/api/admin/routes");
    routes = Array.isArray(data.routes) ? data.routes : [];
  }

  // The server turns a missing speed into its default, so a blank speed is sent as an explicit null.
  const withSpeed = (route) => ({ ...route, speed_kn: route.speed_kn == null ? null : route.speed_kn });

  // Applies a server-saved route. If the user kept editing while the request was in flight, keep those edits as unsaved.
  // For Save As and first saves, oldName is the working name when the request started; if it is unchanged, the new name applies.
  function applySaved(saved, sent, isNewRoute, oldName) {
    replaceInLibrary(saved);
    if (!isNewRoute && work.route.id !== saved.id) { renderSubject(); return; }
    const nameNow = isNewRoute && work.route.name === oldName ? saved.name : work.route.name;
    const current = { ...work.route, name: (nameNow || "").trim() };
    if (core().routeSnapshot(current) === sent) { setWork(saved, { fit: false }); afterPersist(); return; }
    work.baseRevision = saved.revision;
    work.route = { ...work.route, name: nameNow, id: saved.id, revision: saved.revision, updated_at: saved.updated_at, created_at: saved.created_at, source: saved.source };
    work.savedJson = core().routeSnapshot(saved);
    renderSubject();
    renderActions();
    renderStats();
  }

  async function saveRoute() {
    if (!work || saving) return;
    if (!work.route.id) { saveAs(true); return; }
    const problem = validateRoute();
    if (problem) { status(problem, "error"); return; }
    const mine = panel;
    const route = withSpeed({ ...work.route, name: work.route.name.trim() });
    const id = route.id;
    const sent = core().routeSnapshot(route);
    saving = true;
    renderActions();
    try {
      const { route: saved } = await post("/api/admin/routes/save", { route, base_revision: work.baseRevision });
      if (panel !== mine || !mine.isConnected) return;
      applySaved(saved, sent, false);
      status(`Saved "${saved.name}" · revision ${saved.revision}`, "ok");
    } catch (error) {
      if (panel !== mine || !mine.isConnected) return;
      if (error.status === 409) await handleClash(error, id);
      else reportError(error);
    } finally {
      saving = false;
      if (panel === mine && mine.isConnected && work) renderActions();
    }
  }

  // Spec A2: the record in work is already reconciled and recomputed; validate, then save with the revision check.
  async function saveCharterRoute() {
    if (!work || saving) return;
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    const record = toRecord(work.route);
    const problems = icore().validateItinerary(record, dayCount());
    if (problems.length) { status(problems[0].message, "error"); return; }
    const mine = panel;
    saving = true;
    renderActions();
    try {
      const { itinerary } = await post(`/api/admin/charter/${encodeURIComponent(subject.charterId)}/itinerary/save`, { itinerary: record, base_revision: work.baseRevision });
      if (panel !== mine || !mine.isConnected) return;
      subject = { ...subject, itinerary };
      const selected = cards ? cards.selectedId() : null;
      setWork(charterRouteFromItinerary(itinerary), { fit: false });
      if (cards && selected) cards.select(selected, { pan: false });
      afterPersist();
      status(`Charter route saved · revision ${itinerary.revision}`, "ok");
    } catch (error) {
      if (panel !== mine || !mine.isConnected) return;
      if (error.status === 409) {
        const reload = await A().showAdminConfirm({ title: "Itinerary changed elsewhere", message: `${error.message} Reload to see the latest? Your changes will be lost.`, confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning" });
        if (reload) await A().showCharterPanel("routes", { subject: "charter" });
      } else reportError(error);
    } finally {
      saving = false;
      if (panel === mine && mine.isConnected && work) renderActions();
    }
  }

  async function handleClash(error, id) {
    const reload = await A().showAdminConfirm({
      title: "Route changed elsewhere",
      message: `${error.message} Reloading discards your changes; Cancel keeps them so you can Save As.`,
      confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning"
    });
    if (!reload) return;
    try {
      await reloadLibrary();
      setWork(routes.find((r) => r.id === id) || (routes[0] || blankRoute()));
      afterPersist();
    } catch (e) { reportError(e); }
  }

  function saveAs(isFirstSave) {
    if (!work || saving) return;
    if (work.route.points.length < 2) { status("A route needs at least 2 points.", "error"); return; }
    const mine = panel;
    const defaultName = isFirstSave ? work.route.name : `${work.route.name || "Route"} (copy)`;
    const nameInput = el("input", { type: "text", value: defaultName, autocomplete: "off" });
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); card.querySelector(".icon-btn.success").click(); }
    });
    const { card } = openModal({
      title: isFirstSave ? "Save new route" : (isCharter() ? "Save as an unassigned route" : "Save As"), saveTitle: "Save",
      body: el("div", { class: "field" }, el("label", {}, "New route name"), nameInput),
      onSave: async () => {
        const name = nameInput.value.trim();
        if (!name) { status("Name is required.", "error"); return false; }
        saving = true;
        renderActions();
        try {
          const route = withSpeed({ ...work.route, id: "", name, source: isCharter() ? { type: "planner" } : work.route.source, dirty_stop_ids: undefined, welcome_message: undefined, summary: undefined });
          const sent = core().routeSnapshot(route);
          const oldName = work.route.name;
          const { route: saved } = await post("/api/admin/routes/save", { route, base_revision: 0 });
          if (panel !== mine || !mine.isConnected) return true;
          if (isCharter()) {
            replaceInLibrary(saved);
            renderSubject();
            status(`Saved "${saved.name}" as an unassigned route · ${saved.activities ? saved.activities.length : 0} items kept`, "ok");
            return true;
          }
          applySaved(saved, sent, true, oldName);
          status(`Saved "${saved.name}" to the library`, "ok");
          return true;
        } catch (error) {
          reportError(error);
          return false;
        } finally {
          saving = false;
          if (panel === mine && mine.isConnected && work) renderActions();
        }
      }
    });
  }

  // Spec A2 §5.8: import an unassigned route or another charter's record from a day. The server re-bases its days
  // onto the from-day and brings its items unless stripped; nothing is refused for length (the fit pill reports).
  async function openStartFrom() {
    if (!work || saving || !isCharter()) return;
    if (readOnly()) { status("This charter has ended; the route is read-only.", "error"); return; }
    if (!(await guardDiscard())) return;
    const n = dayCount();
    if (!n) { status("Set the charter's start and end dates first.", "error"); return; }
    const mine = panel;
    let charters = [];
    try {
      const [routeData, charterData] = await Promise.all([A().api("/api/admin/routes"), A().api("/api/admin/charters")]);
      if (panel !== mine || !mine.isConnected) return;
      routes = Array.isArray(routeData.routes) ? routeData.routes : [];
      charters = (Array.isArray(charterData.charters) ? charterData.charters : []).filter((c) => c.id !== subject.charterId && c.stops > 0);
    } catch (error) { reportError(error); return; }
    const record = toRecord(work.route);
    const today = (() => {
      const start = icore().parseDateOnly(subject.charter.start_date);
      if (start === null) return 1;
      return Math.min(Math.max(Math.floor((Date.now() - start) / 86400000) + 1, 1), n);
    })();
    const hasStops = icore().stopEntries(record.route.points).length > 0;
    const fromDay = el("select", { id: "routes-from-day" }, ...Array.from({ length: n }, (_, i) => el("option", { value: String(i + 1), selected: i + 1 === (hasStops ? today : 1) || undefined }, `Day ${i + 1} · ${icore().dayDateLabel(subject.charter, i + 1)}`)));
    const strip = el("input", { type: "checkbox", id: "routes-strip-items" });
    let stripTouched = false;
    strip.addEventListener("change", () => { stripTouched = true; });
    const fitLabel = (route) => {
      const f = icore().fit(icore().rebaseRecord(toRecord({ ...route, revision: 0 }), Number(fromDay.value)), subject.charter);
      return f.state === "none" ? "" : ` · ${f.label}`;
    };
    const sourceRows = [];
    const row = (value, label, kind) => {
      const input = el("input", { type: "radio", name: "routes-source", value, "data-kind": kind });
      const text = el("span", {}, label);
      input.addEventListener("change", () => { if (!stripTouched) strip.checked = kind === "charter"; });
      sourceRows.push({ input, text, value, kind });
      return el("label", {}, input, text);
    };
    const withStops = routes.filter((r) => r.points.some(core().isStop));
    const list = el("div", { class: "radio-list" },
      withStops.length ? el("div", { class: "side-label" }, "Unassigned routes") : null,
      ...withStops.map((r) => row(`library:${r.id}`, `${r.name} · ${r.points.filter(core().isStop).length} stops`, "library")),
      charters.length ? el("div", { class: "side-label" }, "Other charters") : null,
      ...charters.map((c) => row(`charter:${c.id}`, `${c.name} · ${c.stops} stops`, "charter")));
    const refreshFit = () => sourceRows.forEach((s) => {
      if (s.kind !== "library") return;
      const r = routes.find((x) => `library:${x.id}` === s.value);
      s.text.textContent = `${r.name} · ${r.points.filter(core().isStop).length} stops${fitLabel(r)}`;
    });
    fromDay.addEventListener("change", refreshFit);
    refreshFit();
    if (sourceRows.length) { sourceRows[0].input.checked = true; strip.checked = sourceRows[0].kind === "charter"; }
    openModal({
      title: "Start from…", saveTitle: "Import", wide: true,
      body: el("div", {},
        sourceRows.length ? list : el("p", { class: "empty" }, "No unassigned routes or other charters with stops yet."),
        el("div", { class: "grid2" },
          el("div", { class: "field" }, el("label", { for: "routes-from-day" }, "From day"), fromDay),
          el("div", { class: "field" }, el("label", { for: "routes-strip-items" }, "Items"), el("label", { class: "switch-row" }, strip, " Strip the record's items"))),
        el("p", { class: "meta" }, "Stops reached before the from-day stay; the record's day 1 lands on it. The fit pill reports if the route runs short or over.")),
      onSave: async () => {
        const chosen = sourceRows.find((s) => s.input.checked);
        if (!chosen) { status("Pick a record to start from.", "error"); return false; }
        const day = Number(fromDay.value);
        const dropped = icore().itemsDroppedByImport(record, day, n);
        if (dropped.length && !(await askDrop({ days: [...new Set(dropped.map((a) => a.day))].sort((a, b) => a - b), items: dropped }, `Starting from day ${day}`))) return false;
        const [type, id] = chosen.value.split(":");
        saving = true;
        renderActions();
        try {
          const { itinerary } = await post(`/api/admin/charter/${encodeURIComponent(subject.charterId)}/itinerary/import`, { source: { type, id }, from_day: day, strip_items: strip.checked, base_revision: work.baseRevision });
          if (panel !== mine || !mine.isConnected) return true;
          subject = { ...subject, itinerary };
          setWork(charterRouteFromItinerary(itinerary));
          afterPersist();
          const f = icore().fit(toRecord(work.route), subject.charter);
          status(`Started from "${chosen.text.textContent.split(" · ")[0]}" on day ${day} · revision ${itinerary.revision}${f.state === "match" ? " · fits the charter" : f.state === "none" ? "" : ` · ${f.label}`}`, "ok");
          return true;
        } catch (error) {
          if (error.status === 409) {
            const reload = await A().showAdminConfirm({ title: "Itinerary changed elsewhere", message: `${error.message} Reload to see the latest?`, confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning" });
            if (reload) await A().showCharterPanel("routes", { subject: "charter" });
            return true;
          }
          reportError(error);
          return false;
        } finally {
          saving = false;
          if (panel === mine && mine.isConnected && work) renderActions();
        }
      }
    });
  }

  async function deleteRoute() {
    if (!work || !work.route.id || saving) return;
    const { id, name } = work.route;
    const ok = await A().showAdminConfirm({
      title: "Delete route?",
      message: `Delete "${name}" from the library? Charters it was assigned to keep their own copy.`,
      confirmLabel: "Delete", cancelLabel: "Cancel", tone: "danger"
    });
    if (!ok) return;
    const mine = panel;
    try {
      await post("/api/admin/routes/delete", { id });
      if (panel !== mine || !mine.isConnected) return;
      routes = routes.filter((r) => r.id !== id);
      setWork(routes.length ? routes[0] : blankRoute());
      afterPersist();
      status(`Deleted "${name}"`, "ok");
    } catch (error) {
      if (error.status !== 404) { reportError(error); return; }
      try {
        await reloadLibrary();
        if (panel !== mine || !mine.isConnected) return;
        setWork(routes[0] || blankRoute());
        afterPersist();
        status("That route had already been deleted.", "");
      } catch (e) { reportError(e); }
    }
  }

  async function newRoute() {
    if (!work || !(await guardDiscard())) return;
    setWork(blankRoute());
    setMode("add");
  }

  async function cancelChanges() {
    if (!work || !isDirty()) return;
    const ok = await A().showAdminConfirm({
      title: "Discard changes?", message: "Go back to the last saved version of this route?",
      confirmLabel: "Discard", cancelLabel: "Cancel", tone: "danger"
    });
    if (ok) setWork(isCharter() ? charterRouteFromItinerary(subject.itinerary) : (routes.find((r) => r.id === work.route.id) || blankRoute()));
  }

  // ---------- wiring ----------
  function bindInputs() {
    $("subject").addEventListener("change", async (e) => {
      const value = e.target.value;
      if (!work) return;
      if (!(await guardDiscard())) { renderSubject(); return; }
      if (value === "charter") { if (!isCharter()) await A().showCharterPanel("routes", { subject: "charter" }); return; }
      if (isCharter()) { await A().showCharterPanel("routes", { subject: "library", routeId: value.startsWith("lib:") ? value.slice(4) : "" }); return; }
      if (value.startsWith("lib:")) openLibraryRoute(value.slice(4)); else setWork(blankRoute());
    });
    $("name").addEventListener("input", (e) => { if (!work) return; work.route = { ...work.route, name: e.target.value }; renderActions(); renderStats(); });
    $("desc").addEventListener("input", (e) => {
      if (!work) return;
      work.route = isCharter() ? { ...work.route, welcome_message: e.target.value } : { ...work.route, description: e.target.value };
      renderActions(); renderStats();
    });
    $("copy-legs").innerHTML = svg("copy");
    $("copy-legs").addEventListener("click", () => lists.copyLegs());
    $("tab-legs").addEventListener("click", () => showTab("legs"));
    $("tab-days").addEventListener("click", () => showTab("days"));
    // The route speed is saved with the route. The last value used also seeds new routes in this browser.
    const applySpeed = (v) => {
      const next = { ...work.route, speed_kn: v };
      work.route = fromRecord(next, icore().recomputeArrivals(toRecord(next)));
      if (v !== undefined) storeSpeed(v);
      renderActions(); renderStats();
      if (cards) cards.render();
      if (days && !$("panel-days").hidden) days.render();
    };
    // Valid values apply live and silently; invalid or half-typed ones (like "0" on the way to "0.5") are ignored until change.
    $("speed").addEventListener("input", () => {
      if (!work) return;
      const v = parseFloat($("speed").value);
      if (v > 0 && v <= MAX_SPEED_KN) applySpeed(v);
    });
    $("speed").addEventListener("change", () => {
      if (!work) return;
      const raw = $("speed").value.trim();
      const v = parseFloat(raw);
      if (raw === "") { applySpeed(undefined); return; }
      if (!(v > 0 && v <= MAX_SPEED_KN)) {
        A().setStatus(`Enter a route speed above 0 and up to ${MAX_SPEED_KN} kn.`, "error");
        $("speed").value = work.route.speed_kn || "";
        return;
      }
      applySpeed(v);
    });
  }

  function showLoadError(message) {
    panel.querySelector(".planner").replaceWith(el("p", { class: "empty" }, `Routes could not be loaded: ${message}`));
  }

  async function loadLibrary(mine) {
    try {
      const data = await A().api("/api/admin/routes");
      if (panel !== mine || !mine.isConnected) return;
      routes = Array.isArray(data.routes) ? data.routes : [];
      if (!isCharter()) setWork(routes.find((r) => r.id === subject.routeId) || routes[0] || blankRoute());
      else renderSubject();
    } catch (error) {
      A().setStatus(error.message, "error");
      if (panel === mine && mine.isConnected) showLoadError(error.message);
    }
  }

  function bindKeyboard() {
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    keyHandler = (e) => {
      if (!panel || !panel.isConnected || !work) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) return;
      if (document.querySelector(".routes-modal, .admin-decision-backdrop, #dialog-modal:not(.hidden)")) return;
      const key = (e.key || "").toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    document.addEventListener("keydown", keyHandler);
  }

  function bind(opts) {
    closeModal();
    document.querySelectorAll(".routes-modal").forEach((n) => n.remove());
    saving = false;
    destroyMap();
    if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; }
    panel = document.getElementById("routes-panel");
    if (!panel) return;
    const mine = panel;
    work = null;
    cards = null;
    days = null;
    history = { undo: [], redo: [] };
    guard = {
      isDirty: () => isDirty() || Boolean(io && io.pinCount()),
      get confirmOptions() { return leaveConfirm(); }
    };
    A().setPageUnsavedGuard(guard);
    bindInputs();
    bindSplitters();
    bindKeyboard();
    if (!window.__routesFitMapBound) { window.addEventListener("resize", () => { if (panel && panel.isConnected) scheduleFitMap(); }); window.__routesFitMapBound = true; }
    const siteLibrary = (opts && opts.siteLibrary) || { sites: [] };
    subject = (opts && opts.subject) || { type: "library" };
    const myPlaces = window.IolantheRoutesPlaces.create({
      A: A(),
      core: core(),
      el,
      openModal,
      getSiteLibrary: () => siteLibrary,
      getRoutes: () => routes,
      getWork: () => work,
      onChanged: () => { if (work && panel === mine && places === myPlaces) renderAll(); }
    });
    places = myPlaces;
    popup = window.IolantheRoutesPopup.create({
      core: core(),
      places: myPlaces,
      getWork: () => work,
      getMap: () => map,
      editPoints,
      editPointsQuiet,
      makeStopAtAnchorage,
      removeStopAt,
      deletePoint,
      status
    });
    lists = window.IolantheRoutesLists.create({
      A: A(),
      core: core(),
      getWork: () => work,
      speedKn,
      defaultSpeed: DEFAULT_SPEED_KN,
      maxSpeed: MAX_SPEED_KN,
      editPoints,
      focusLeg
    });
    join = window.IolantheRoutesJoin.create({
      core: core(),
      getWork: () => work,
      getRoutes: () => routes,
      editPoints,
      status
    });
    io = window.IolantheRoutesIo.create({
      A: A(),
      core: core(),
      places: myPlaces,
      getWork: () => work,
      getMap: () => map,
      isDirty,
      editPoints,
      renderAll,
      isCurrent: () => panel === mine && mine.isConnected && places === myPlaces
    });
    days = window.IolantheRoutesDays.create({
      core: icore(),
      el,
      getRecord: () => (work ? toRecord(work.route) : null),
      getCharter: charterOrNull,
      getDayCount: dayCount,
      siteTitle: (id) => { const s = (siteLibrary.sites || []).find((x) => x && x.id === id); return s && s.title ? s.title : id; },
      onStopClick: (stopId) => { if (cards) cards.select(stopId); }
    });
    days.render($("days"));
    cards = window.IolantheStopCards.create({
      A: A(), core: icore(), rcore: core(), el, svg, openModal, places: myPlaces,
      getWork: () => work, getCharter: charterOrNull, getDayCount: dayCount, getSiteLibrary: () => siteLibrary,
      readOnly, editRecord, askDrop,
      removeStop: (stopId) => { const i = work.route.points.findIndex((p) => p.id === stopId); if (i >= 0) removeStopAt(i); },
      panToStop, highlightStop, openStartFrom, status
    });
    initMap(mine);
    if (isCharter()) {
      $("name-field").hidden = true;
      $("desc-label").textContent = "Welcome message";
      $("desc").placeholder = "Shown to guests at the top of their itinerary";
      const note = $("charter-note");
      note.hidden = !readOnly();
      note.textContent = readOnly() ? `${subject.charter.name || subject.charterId} has ended. The route is read-only.` : "";
      work = null;
      setWork(charterRouteFromItinerary(subject.itinerary));
      loadLibrary(mine);   // fills the Unassigned group and Add another route's list
      if (subject.focusStopId) {
        const idx = work.route.points.findIndex((p) => p.id === subject.focusStopId);
        if (idx >= 0) setTimeout(() => focusPoint(idx), 300);
      }
    } else {
      $("name-field").hidden = false;
      $("desc-label").textContent = "Description";
      $("desc").placeholder = "Optional";
      $("charter-note").hidden = true;
      loadLibrary(mine);
    }
    myPlaces.load().then(() => {
      if (panel === mine && mine.isConnected && places === myPlaces && work) renderAll();
    }).catch((error) => {
      if (panel === mine) A().setStatus(error.message, "error");
    });
  }

  window.IolantheRoutes = Object.freeze({ render, bind });
})();
