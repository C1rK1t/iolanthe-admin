// Routes panel (Charter → Routes). Uses window.IolantheAdmin (admin.js) and window.IolantheRoutesCore.
// Ported from docs/route-planner/planner-mockup.html. Saving and modals are added in a later task.
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
  const ui = { mode: "select" };

  const ICONS = {
    check: '<path d="M5 12l5 5 9-10"/>',
    cancel: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    saveAs: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    select: '<path d="M5 3l14 7-6 2-2 6z"/>',
    add: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
    erase: '<path d="M7 21h10M5 15l9-9 5 5-9 9H8z"/>',
    join: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><path d="M7 6h3a4 4 0 0 1 4 4v0a4 4 0 0 0 4 4h3M7 18h3a4 4 0 0 0 4-4"/><path d="M18 11l3 3-3 3"/>'
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  const MODES = [
    { id: "select", label: "Select", icon: "select", hint: "Tap a point to inspect it. Drag a point to move it, or drag a faint midpoint to insert one." },
    { id: "add", label: "Add", icon: "add", hint: "Tap the map to add a point at the end." },
    { id: "delete", label: "Delete", icon: "erase", hint: "Tap a route point to delete it." }
  ];

  // Task 6 wires the header actions that use this.
  const noop = () => {};

  // ---------- helpers ----------
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
  const $ = (id) => panel.querySelector(`#routes-${id}`);
  const fmtDate = (iso) => (iso || "").slice(0, 10);
  const fmtPos = (p) => `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`;
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
              <button type="button" role="tab" id="routes-tab-stops" aria-controls="routes-panel-stops" aria-selected="true">Stops <span class="count" id="routes-count-stops"></span></button>
              <button type="button" role="tab" id="routes-tab-legs" aria-controls="routes-panel-legs" aria-selected="false">Legs <span class="count" id="routes-count-legs"></span></button>
            </div>
            <div class="tab-panel" role="tabpanel" id="routes-panel-stops" aria-labelledby="routes-tab-stops">
              <div class="stops" id="routes-stops"></div>
            </div>
            <div class="tab-panel" role="tabpanel" id="routes-panel-legs" aria-labelledby="routes-tab-legs" hidden>
              <label class="speed-row" title="Saved with the route. Legs use it unless they have their own speed.">Route speed <input id="routes-speed" type="number" min="0" max="30" step="0.5"> kn</label>
              <div class="stops" id="routes-legs"></div>
            </div>
          </div>
          <div class="meta" id="routes-meta"></div>
        </aside>
        <div class="map-wrap">
          <div id="routes-map"></div>
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

  function setWork(route) {
    const clone = JSON.parse(JSON.stringify(route));
    work = { route: clone, savedJson: core().routeSnapshot(clone), baseRevision: clone.revision || 0 };
    history = { undo: [], redo: [] };
    renderAll({ fit: true, inputs: true });
  }

  function openLibraryRoute(id) {
    const r = routes.find((x) => x.id === id);
    if (r) setWork(r);
  }

  function blankRoute() {
    return { id: "", name: "", description: "", revision: 0, speed_kn: loadSpeed(), created_at: null, updated_at: null, source: { type: "planner" }, points: [] };
  }

  async function guardDiscard() {
    if (!isDirty()) return true;
    const ok = await A().showAdminConfirm(guard.confirmOptions);
    if (ok) {
      work.route = { ...work.route, ...JSON.parse(work.savedJson) };
      history = { undo: [], redo: [] };
      renderAll({ inputs: true });
    }
    return ok;
  }

  // Every route-geometry edit goes through here so undo/redo stays consistent.
  function editPoints(fn, opts) {
    history.undo.push(work.route.points);
    history.redo = [];
    work.route = { ...work.route, points: fn(work.route.points) };
    renderAll(opts);
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
      el("div", { class: "stat" }, el("b", {}, stopCount), el("span", {}, "stops")),
      timeStat(pts));

    let n = 0;
    const stops = pts.map((p, i) => ({ p, i })).filter(({ p }) => core().isStop(p)).map(({ p, i }) => {
      n += 1;
      return el("div", { class: "stop-item", onclick: () => focusPoint(i) },
        el("div", { class: "title" }, el("span", { class: "stop-num" }, n), p.name || "Stop"));
    });
    $("count-stops").textContent = stops.length || "";
    $("stops").replaceChildren(...(stops.length ? stops : [el("div", { class: "empty" }, "Stops arrive with anchorages in a later update.")]));

    renderLegs();

    const r = work.route;
    const src = r.source || {};
    const srcText = src.type === "charter" ? "migrated from a charter" : src.type === "kml" || src.type === "gpx" ? `imported from ${src.filename || src.type}` : "planner";
    $("meta").textContent = r.id
      ? `Revision ${r.revision} · updated ${fmtDate(r.updated_at)} · source: ${srcText}${isDirty() ? " · unsaved changes" : ""}`
      : (isDirty() ? "Unsaved new route" : "");
  }

  function currentLegs() {
    const pts = work.route.points;
    return pts.length < 2 ? [] : core().stopLegs(pts, speedKn());
  }

  function timeStat(pts) {
    const legs = pts.length < 2 ? [] : core().stopLegs(pts, speedKn());
    const hours = core().totalHours(legs);
    const anyOwn = legs.some((l) => l.own);
    const label = hours === null ? "set a speed" : (anyOwn ? "h:mm underway" : `h:mm at ${speedKn()} kn`);
    return el("div", { class: "stat" }, el("b", {}, hours === null ? "—" : core().fmtHm(hours)), el("span", {}, label));
  }

  function setLegSpeed(leg, value) {
    editPoints((pts) => core().setLegSpeed(pts, leg.fromIndex, value));
  }

  function legSpeedControl(leg) {
    const global = speedKn();
    const useRoute = el("input", { type: "checkbox", checked: !leg.own, "aria-label": "Use the route speed for this leg" });
    // Unticking starts the leg at the route speed so the time doesn't jump; reticking clears the leg's own speed.
    useRoute.addEventListener("change", () => setLegSpeed(leg, useRoute.checked ? 0 : (global || DEFAULT_SPEED_KN)));
    const row = el("div", { class: "leg-speed", onclick: (e) => e.stopPropagation() },
      el("label", {}, useRoute, global ? `Route speed (${global} kn)` : "Route speed"));
    if (leg.own) {
      const input = el("input", { type: "number", min: "0.5", max: String(MAX_SPEED_KN), step: "0.5", value: String(leg.own), "aria-label": "Speed for this leg in knots" });
      input.addEventListener("change", () => {
        const v = parseFloat(input.value);
        if (!(v > 0 && v <= MAX_SPEED_KN)) { A().setStatus(`Enter a speed between 0.5 and ${MAX_SPEED_KN} kn.`, "error"); input.value = String(leg.own); return; }
        setLegSpeed(leg, v);
      });
      row.append(el("label", {}, input, "kn for this leg"));
    }
    return row;
  }

  function renderLegs() {
    const legs = currentLegs();
    $("count-legs").textContent = legs.length || "";
    if (!legs.length) { $("legs").replaceChildren(el("div", { class: "empty" }, "Add at least two points to see legs.")); return; }
    const total = legs.reduce((sum, l) => sum + l.nm, 0);
    const hours = core().totalHours(legs);
    $("legs").replaceChildren(
      ...legs.map((l, k) => el("div", { class: `stop-item leg-item${l.own ? " custom" : ""}`, title: "Show this leg on the map", onclick: () => focusLeg(l) },
        el("div", { class: "title" }, el("span", { class: "stop-num" }, k + 1), `${l.from} → ${l.to}`),
        el("div", { class: "leg-meta" }, `${l.nm.toFixed(1)} nm`,
          l.hours !== null ? el("span", {}, " · ", el("b", {}, core().fmtHm(l.hours)), ` at ${l.speed} kn`) : null),
        legSpeedControl(l))),
      el("div", { class: "leg-total" }, el("span", {}, "Total"), el("span", {}, `${total.toFixed(1)} nm${hours !== null ? ` · ${core().fmtHm(hours)}` : ""}`)));
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
      b("check", "Save", noop, "success", !dirty && hasId),
      b("cancel", "Cancel (discard changes)", noop, "danger", !dirty),
      el("span", { class: "icon-sep" }),
      b("undo", "Undo (Ctrl+Z)", undo, "", !history.undo.length),
      b("redo", "Redo (Ctrl+Y)", redo, "", !history.redo.length),
      el("span", { class: "icon-sep" }),
      b("plus", "New route", noop),
      b("saveAs", "Save As", noop, "", work.route.points.length < 2),
      b("join", "Add another route to this one", noop),
      b("trash", "Delete route", noop, "", !hasId));
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
    ["route", "mids", "points"].forEach((k) => { groups[k] = L.layerGroup().addTo(map); });
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
      if (c.isStop(p)) { stopNo += 1; html = `<div class="mk-stop">${stopNo}</div>`; }
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
    if (!work || ui.mode !== "add") return;
    const pos = { latitude: e.latlng.lat, longitude: e.latlng.lng };
    editPoints((pts) => [...pts, pos]);
  }

  function onPointClick(i) {
    if (ui.mode === "select") openPointPopup(i);
    else if (ui.mode === "delete") editPoints((pts) => core().removeAt(pts, i));
  }

  function openPointPopup(i) {
    const m = pointMarkers[i];
    if (!m) return;
    m.unbindPopup();
    m.bindPopup(pointPopup(i), { minWidth: 250, maxWidth: 300, autoPanPadding: [20, 60] }).openPopup();
  }

  function pointPopup(i) {
    const p = work.route.points[i];
    const c = core();
    const stopIndex = work.route.points.slice(0, i + 1).filter(c.isStop).length;
    const nameInput = el("input", { type: "text", value: p.name || "", placeholder: "Optional label" });
    nameInput.addEventListener("change", () => {
      const name = nameInput.value.trim();
      editPoints((pts) => c.replaceAt(pts, i, { ...pts[i], name: name || undefined }), { popup: i });
    });
    return el("div", { class: "pop" },
      el("h3", {}, c.isStop(p) ? `Stop ${stopIndex} · ${p.name}` : (p.name ? `Waypoint · ${p.name}` : "Waypoint")),
      el("div", { class: "sub" }, fmtPos(p)),
      el("div", { class: "field" }, el("label", {}, "Name"), nameInput),
      el("div", { class: "actions" },
        el("button", { type: "button", class: "text-btn danger-text", onclick: () => { map.closePopup(); editPoints((pts) => c.removeAt(pts, i)); } }, "Delete")));
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
    $("tab-legs").addEventListener("click", () => showTab("legs"));
    // The route speed is saved with the route. The last value used also seeds new routes in this browser.
    $("speed").addEventListener("input", () => {
      if (!work) return;
      const raw = $("speed").value.trim();
      const v = parseFloat(raw);
      if (raw !== "" && !(v > 0 && v <= MAX_SPEED_KN)) {
        A().setStatus(`Enter a route speed above 0 and up to ${MAX_SPEED_KN} kn.`, "error");
        return;
      }
      work.route = { ...work.route, speed_kn: raw === "" ? undefined : v };
      if (raw !== "") storeSpeed(v);
      renderActions();
      renderStats();
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
      if (document.querySelector(".routes-modal")) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    document.addEventListener("keydown", keyHandler);
  }

  function bind() {
    destroyMap();
    if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; }
    panel = document.getElementById("routes-panel");
    if (!panel) return;
    const mine = panel;
    work = null;
    history = { undo: [], redo: [] };
    guard = {
      isDirty,
      confirmOptions: { title: "Unsaved route", message: "Discard your unsaved route changes?", confirmLabel: "Discard", cancelLabel: "Cancel", tone: "danger" }
    };
    A().setPageUnsavedGuard(guard);
    bindInputs();
    bindKeyboard();
    initMap(mine);
    loadLibrary(mine);
  }

  window.IolantheRoutes = Object.freeze({ render, bind });
})();
