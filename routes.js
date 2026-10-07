// Routes panel (Charter → Routes). Uses window.IolantheAdmin (admin.js) and window.IolantheRoutesCore.
// Ported from docs/route-planner/planner-mockup.html. Split into: routes-ui.js (el, icons, modal shell),
// routes-popup.js (point popup), routes-lists.js (Stops / Legs lists), routes-join.js (Add another route),
// routes-places.js (anchorages, sites), routes-io.js (KML / GPX import, imported pins, export).
(function () {
  "use strict";

  const A = () => window.IolantheAdmin;
  const core = () => window.IolantheRoutesCore;
  const DEFAULT_SPEED_KN = 8;
  const MAX_SPEED_KN = 30;
  const SPEED_KEY = "routePlanner.speed"; // last route speed used in this browser; seeds new routes only
  let panel = null;      // the #routes-panel element after bind()
  let routes = [];       // library from the server
  let work = null;       // { route, savedJson, baseRevision }
  let history = { undo: [], redo: [] };
  let guard = null;      // page unsaved-changes guard

  const MAP_CENTER = [12.1, 120.0];
  let map = null;        // Leaflet map for the current panel
  const groups = {};     // Leaflet layer groups
  let routeLines = [];
  let pointMarkers = [];
  let keyHandler = null; // document keydown listener (undo/redo), removed on the next bind
  const ui = { mode: "select", layers: { sites: true, anchorages: true, pins: true } };
  let places = null;     // IolantheRoutesPlaces instance, created fresh by each bind()
  let popup = null;      // IolantheRoutesPopup instance, created fresh by each bind()
  let lists = null;      // IolantheRoutesLists instance, created fresh by each bind()
  let join = null;       // IolantheRoutesJoin instance, created fresh by each bind()
  let io = null;         // IolantheRoutesIo instance (import, pins, export), created fresh by each bind()

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

  function loadSpeed() {
    try { const v = parseFloat(localStorage.getItem(SPEED_KEY)); return Number.isFinite(v) ? v : DEFAULT_SPEED_KN; } catch (e) { return DEFAULT_SPEED_KN; }
  }
  function storeSpeed(v) { try { localStorage.setItem(SPEED_KEY, String(v)); } catch (e) { /* per-browser convenience only */ } }

  // ---------- markup ----------
  function render() {
    if (!A().canManageCharterAdmin()) {
      return '<section class="card full routes-panel"><div class="card-header"><h2>Routes</h2></div><p class="empty">Routes are available to Charter Admin on the bridge.</p></section>';
    }
    return `<section class="card full routes-panel" id="routes-panel">
      <div class="card-header">
        <h2>Routes</h2>
        <div class="icon-row" id="routes-actions"></div>
      </div>
      <div class="planner">
        <aside class="side">
          <div class="field">
            <label for="routes-picker">Route</label>
            <select id="routes-picker"></select>
          </div>
          <div class="field">
            <label for="routes-name">Name</label>
            <input id="routes-name" type="text" autocomplete="off" placeholder="Route name">
          </div>
          <div class="field">
            <label for="routes-desc">Description</label>
            <textarea id="routes-desc" placeholder="Optional"></textarea>
          </div>
          <div class="stats" id="routes-stats"></div>
          <div class="tabbox">
            <div class="tabs" role="tablist" aria-label="Stops and legs">
              <button type="button" role="tab" id="routes-tab-stops" aria-controls="routes-panel-stops" aria-selected="true">Stops</button>
              <button type="button" role="tab" id="routes-tab-legs" aria-controls="routes-panel-legs" aria-selected="false">Legs</button>
            </div>
            <div class="tab-panel" role="tabpanel" id="routes-panel-stops" aria-labelledby="routes-tab-stops">
              <div class="stops" id="routes-stops"></div>
            </div>
            <div class="tab-panel" role="tabpanel" id="routes-panel-legs" aria-labelledby="routes-tab-legs" hidden>
              <div class="legs-head">
                <label class="speed-row" title="Saved with the route. Legs use it unless they have their own speed.">Route speed <input id="routes-speed" type="number" min="0" max="30" step="0.5"> kn</label>
                <button type="button" class="icon-btn small" id="routes-copy-legs" title="Copy the legs for Excel" aria-label="Copy the legs for Excel"></button>
              </div>
              <div class="stops" id="routes-legs"></div>
            </div>
          </div>
          <div class="meta" id="routes-meta"></div>
        </aside>
        <div class="map-wrap">
          <div id="routes-map"></div>
          <div class="layers" id="routes-layers"></div>
          <div class="map-toolbar">
            <div class="seg" id="routes-modes"></div>
          </div>
          <div class="map-hint" id="routes-map-hint"></div>
        </div>
      </div>
    </section>`;
  }

  // ---------- working route ----------
  const isDirty = () => Boolean(work) && core().routeSnapshot(work.route) !== work.savedJson;

  function setWork(route, opts) {
    const clone = JSON.parse(JSON.stringify(route));
    work = { route: clone, savedJson: core().routeSnapshot(clone), baseRevision: clone.revision || 0 };
    history = { undo: [], redo: [] };
    renderAll({ fit: true, inputs: true, ...(opts || {}) });
  }

  function openLibraryRoute(id) {
    const r = routes.find((x) => x.id === id);
    if (r) setWork(r);
  }

  function blankRoute() {
    return { id: "", name: "", description: "", revision: 0, speed_kn: loadSpeed(), created_at: null, updated_at: null, source: { type: "planner" }, points: [] };
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
    if (ok) setWork(routes.find((r) => r.id === work.route.id) || blankRoute());
    return ok;
  }

  // Every route-geometry edit goes through here so undo/redo stays consistent.
  function editPoints(fn, opts) {
    history.undo.push(work.route.points);
    history.redo = [];
    work.route = { ...work.route, points: fn(work.route.points) };
    renderAll(opts);
  }
  // Like editPoints, but leaves the map (and an open popup) alone. Used for name edits typed in the point popup.
  function editPointsQuiet(fn) {
    history.undo.push(work.route.points);
    history.redo = [];
    work.route = { ...work.route, points: fn(work.route.points) };
    renderActions();
    renderStats();
  }
  function undo() {
    if (!history.undo.length) return;
    history.redo.push(work.route.points);
    work.route = { ...work.route, points: history.undo.pop() };
    renderAll();
  }
  function redo() {
    if (!history.redo.length) return;
    history.undo.push(work.route.points);
    work.route = { ...work.route, points: history.redo.pop() };
    renderAll();
  }

  // ---------- side panel ----------
  function renderPicker() {
    const sel = $("picker");
    const libGroup = el("optgroup", { label: "Library" },
      routes.map((r) => el("option", { value: `lib:${r.id}` }, `${r.name} · ${core().routeNm(r.points).toFixed(0)} nm · ${fmtDate(r.updated_at)}`)));
    const unsaved = !work.route.id ? el("option", { value: "new" }, "New route (unsaved)") : null;
    sel.replaceChildren(...[unsaved, libGroup].filter(Boolean));
    sel.value = work.route.id ? `lib:${work.route.id}` : "new";
  }

  function renderStats() {
    const pts = work.route.points;
    const stopCount = pts.filter(core().isStop).length;
    $("stats").replaceChildren(
      el("div", { class: "stat" }, el("b", {}, core().routeNm(pts).toFixed(1)), el("span", {}, "nm total")),
      el("div", { class: "stat" }, el("b", {}, `${stopCount} / ${lists.legCount()}`), el("span", {}, "stops / legs")),
      lists.timeStat());
    lists.renderStops($("stops"));
    lists.renderLegs($("legs"));

    const r = work.route;
    const src = r.source || {};
    const srcText = src.type === "charter" ? "migrated from a charter" : src.type === "kml" || src.type === "gpx" ? `imported from ${src.filename || src.type}` : "planner";
    $("meta").textContent = r.id
      ? `Revision ${r.revision} · updated ${fmtDate(r.updated_at)} · source: ${srcText}${isDirty() ? " · unsaved changes" : ""}`
      : (isDirty() ? "Unsaved new route" : "");
  }

  function showTab(name) {
    ["stops", "legs"].forEach((t) => {
      $(`tab-${t}`).setAttribute("aria-selected", String(t === name));
      $(`panel-${t}`).hidden = t !== name;
    });
  }

  function renderAll(opts) {
    const o = opts || {};
    if (o.inputs) {
      $("name").value = work.route.name;
      $("desc").value = work.route.description || "";
      $("speed").value = work.route.speed_kn || "";
    }
    renderPicker();
    renderActions();
    renderStats();
    renderModes();
    renderLayers();
    renderMap(o);
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
    $("layers").replaceChildren(item("sites", "var(--site)", "Sites"), item("anchorages", "var(--stop)", "Anchorages"),
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
        L.marker(ll(mid), { icon: divIcon('<div class="mk-mid"></div>', 24), draggable: true, title: "Drag to insert a point", zIndexOffset: 400 })
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
        html = `<div class="mk-stop${p.anchorage_id ? "" : " plain"}">${stopNo}</div>${flagged ? '<div class="mk-badge">!</div>' : ""}`;
      }
      else html = `<div class="mk-wp ${p.name ? "named" : ""}"></div>`;
      const m = L.marker(ll(p), { icon: divIcon(html), draggable: ui.mode !== "delete", title: p.name || "Waypoint", zIndexOffset: c.isStop(p) ? 1100 : 1000 });
      m.on("click", () => onPointClick(i));
      m.on("drag", (e) => {
        const q = e.target.getLatLng();
        const live = pts.map((x, j) => (j === i ? [q.lat, q.lng] : ll(x)));
        routeLines.forEach((line) => line.setLatLngs(live));
      });
      m.on("dragend", (e) => {
        const q = e.target.getLatLng();
        const anchorage = places ? places.anchorageUnder(map, q) : null;
        const cur = work.route.points[i];
        // A stop nudged near its OWN anchorage is just moved, so its name and ticked sites are kept.
        if (anchorage && !(c.isStop(cur) && cur.anchorage_id === anchorage.id)) { makeStopAtAnchorage(i, anchorage, { snapped: true }); return; }
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
    map.panTo(pointMarkers[i].getLatLng());
    openPointPopup(i);
  }

  function focusLeg(leg) {
    if (!map || !work) return;
    map.closePopup();
    map.fitBounds(window.L.latLngBounds(work.route.points.slice(leg.fromIndex, leg.toIndex + 1).map(ll)).pad(0.25));
  }

  function onMapClick(e) {
    if (!work) return;
    const pos = { latitude: e.latlng.lat, longitude: e.latlng.lng };
    if (ui.mode === "anchorage" && places) places.openAnchorageModal(null, pos);
    else if (ui.mode === "add") editPoints((pts) => [...pts, pos]);
  }

  function onAnchorageClick(anchorage) {
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
    if (ui.mode === "select") openPointPopup(i);
    else if (ui.mode === "delete") editPoints((pts) => core().removeAt(pts, i));
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
    if (!isNewRoute && work.route.id !== saved.id) { renderPicker(); return; }
    const nameNow = isNewRoute && work.route.name === oldName ? saved.name : work.route.name;
    const current = { ...work.route, name: (nameNow || "").trim() };
    if (core().routeSnapshot(current) === sent) { setWork(saved, { fit: false }); afterPersist(); return; }
    work.baseRevision = saved.revision;
    work.route = { ...work.route, name: nameNow, id: saved.id, revision: saved.revision, updated_at: saved.updated_at, created_at: saved.created_at, source: saved.source };
    work.savedJson = core().routeSnapshot(saved);
    renderPicker();
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
      title: isFirstSave ? "Save new route" : "Save As", saveTitle: "Save",
      body: el("div", { class: "field" }, el("label", {}, "New route name"), nameInput),
      onSave: async () => {
        const name = nameInput.value.trim();
        if (!name) { status("Name is required.", "error"); return false; }
        saving = true;
        renderActions();
        try {
          const route = withSpeed({ ...work.route, id: "", name, source: work.route.source });
          const sent = core().routeSnapshot(route);
          const oldName = work.route.name;
          const { route: saved } = await post("/api/admin/routes/save", { route, base_revision: 0 });
          if (panel !== mine || !mine.isConnected) return true;
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
    if (ok) setWork(routes.find((r) => r.id === work.route.id) || blankRoute());
  }

  // ---------- wiring ----------
  function bindInputs() {
    $("picker").addEventListener("change", async (e) => {
      if (!work) return;
      const value = e.target.value;
      if (!(await guardDiscard())) { renderPicker(); return; }
      if (value.startsWith("lib:")) openLibraryRoute(value.slice(4));
      else setWork(blankRoute());
    });
    $("name").addEventListener("input", (e) => { if (!work) return; work.route = { ...work.route, name: e.target.value }; renderActions(); renderStats(); });
    $("desc").addEventListener("input", (e) => { if (!work) return; work.route = { ...work.route, description: e.target.value }; renderActions(); renderStats(); });
    $("tab-stops").addEventListener("click", () => showTab("stops"));
    $("copy-legs").innerHTML = svg("copy");
    $("copy-legs").addEventListener("click", () => lists.copyLegs());
    $("tab-legs").addEventListener("click", () => showTab("legs"));
    // The route speed is saved with the route. The last value used also seeds new routes in this browser.
    const applySpeed = (v) => {
      work.route = { ...work.route, speed_kn: v };
      if (v !== undefined) storeSpeed(v);
      renderActions();
      renderStats();
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
      setWork(routes.length ? routes[0] : blankRoute());
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
    history = { undo: [], redo: [] };
    guard = {
      isDirty: () => isDirty() || Boolean(io && io.pinCount()),
      get confirmOptions() { return leaveConfirm(); }
    };
    A().setPageUnsavedGuard(guard);
    bindInputs();
    bindKeyboard();
    const siteLibrary = (opts && opts.siteLibrary) || { sites: [] };
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
      status
    });
    lists = window.IolantheRoutesLists.create({
      A: A(),
      core: core(),
      places: myPlaces,
      getWork: () => work,
      speedKn,
      defaultSpeed: DEFAULT_SPEED_KN,
      maxSpeed: MAX_SPEED_KN,
      editPoints,
      focusPoint,
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
    initMap(mine);
    loadLibrary(mine);
    myPlaces.load().then(() => {
      if (panel === mine && mine.isConnected && places === myPlaces && work) renderAll();
    }).catch((error) => {
      if (panel === mine) A().setStatus(error.message, "error");
    });
  }

  window.IolantheRoutes = Object.freeze({ render, bind });
})();
