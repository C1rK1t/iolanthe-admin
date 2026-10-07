// Routes panel (Charter → Routes). Uses window.IolantheAdmin (admin.js) and window.IolantheRoutesCore.
// Ported from docs/route-planner/planner-mockup.html. Saving and modals are added in a later task.
(function () {
  "use strict";

  const A = () => window.IolantheAdmin;
  const core = () => window.IolantheRoutesCore;
  const DEFAULT_SPEED_KN = 8;
  const MAX_SPEED_KN = 30;
  const NEARBY_ANCHORAGE_NM = 2; // "Make stop at" offers anchorages within this distance of a waypoint
  const MAX_NEARBY_BUTTONS = 3;
  const SITES_NEAR_NM = 5;       // sites within this distance of a stop are grouped first in "Sites served"
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
  const ui = { mode: "select", layers: { sites: true, anchorages: true } };
  let places = null;     // IolantheRoutesPlaces instance, created fresh by each bind()

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
    anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/>',
    erase: '<path d="M7 21h10M5 15l9-9 5 5-9 9H8z"/>',
    join: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><path d="M7 6h3a4 4 0 0 1 4 4v0a4 4 0 0 0 4 4h3M7 18h3a4 4 0 0 0 4-4"/><path d="M18 11l3 3-3 3"/>'
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  const MODES = [
    { id: "select", label: "Select", icon: "select", hint: "Tap a point to inspect it. Drag a point to move it, or drag a faint midpoint to insert one." },
    { id: "add", label: "Add", icon: "add", hint: "Tap the map to add a point at the end." },
    { id: "anchorage", label: "Anchorage", icon: "anchor", hint: "Tap the map to create an anchorage. Tap one to edit it, or drag it to move it." },
    { id: "delete", label: "Delete", icon: "erase", hint: "Tap a route point to delete it." }
  ];

  let saving = false;    // a save request is in flight
  let closeModal = null; // closes the open routes modal, if any
  const JSON_HEADERS = { "Content-Type": "application/json" };
  const post = (path, body) => A().api(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });

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

  async function guardDiscard() {
    if (!isDirty()) return true;
    const ok = await A().showAdminConfirm(guard.confirmOptions);
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
      return stopItem(p, i, n);
    });
    $("count-stops").textContent = stops.length || "";
    $("stops").replaceChildren(...(stops.length ? stops : [el("div", { class: "empty" }, "No stops yet. In Add mode, tap an anchorage to add one.")]));

    renderLegs();

    const r = work.route;
    const src = r.source || {};
    const srcText = src.type === "charter" ? "migrated from a charter" : src.type === "kml" || src.type === "gpx" ? `imported from ${src.filename || src.type}` : "planner";
    $("meta").textContent = r.id
      ? `Revision ${r.revision} · updated ${fmtDate(r.updated_at)} · source: ${srcText}${isDirty() ? " · unsaved changes" : ""}`
      : (isDirty() ? "Unsaved new route" : "");
  }

  // A stop row with anchorage depth, moved/deleted warnings and site chips (ids that no longer exist are dropped quietly).
  function stopItem(p, i, n) {
    const a = places ? places.findAnchorage(p.anchorage_id) : null;
    const moved = places ? core().anchorageMovedM(p, a) : 0;
    const siteChips = places ? (p.site_ids || []).map(places.findSite).filter(Boolean).map((s) => el("span", { class: "chip" }, s.title)) : [];
    const deleted = places && places.isLoaded() && p.anchorage_id && !a;
    return el("div", { class: "stop-item", onclick: () => focusPoint(i) },
      el("div", { class: "title" }, el("span", { class: "stop-num" }, n), p.name || "Stop",
        a && a.depth_m ? el("span", { class: "meta", style: "font-weight:400" }, `${a.depth_m} m`) : null),
      moved ? el("div", { class: "warn-text" }, `⚠ Anchorage moved ${Math.round(moved)} m since placed`) : null,
      deleted ? el("div", { class: "warn-text" }, "⚠ Anchorage deleted. The stop keeps its position.") : null,
      siteChips.length ? el("div", { class: "chips" }, siteChips) : el("div", { class: "empty", style: "margin-top:4px" }, "No sites linked"));
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
      b("join", "Add another route to this one", openJoin),
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
    $("layers").replaceChildren(item("sites", "var(--site)", "Sites"), item("anchorages", "var(--stop)", "Anchorages"));
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
    ["tender", "sites", "anchorages", "route", "mids", "points"].forEach((k) => { groups[k] = L.layerGroup().addTo(map); });
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
        usedAnchorageIds: new Set(pts.filter(c.isStop).map((p) => p.anchorage_id)),
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
        html = `<div class="mk-stop">${stopNo}</div>${flagged ? '<div class="mk-badge">!</div>' : ""}`;
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
    m.bindPopup(pointPopup(i), { minWidth: 250, maxWidth: 300, autoPanPadding: [20, 60] }).openPopup();
  }

  function pointPopup(i) {
    const p = work.route.points[i];
    const c = core();
    const stopIndex = work.route.points.slice(0, i + 1).filter(c.isStop).length;
    const nameInput = el("input", { type: "text", value: p.name || "", placeholder: "Optional label" });
    const heading = el("h3", {});
    const headingText = (q) => (c.isStop(q) ? `Stop ${stopIndex} · ${q.name || "Stop"}` : (q.name ? `Waypoint · ${q.name}` : "Waypoint"));
    heading.textContent = headingText(p);
    // Commit on Enter or blur without rebuilding the map, so the popup (and a Delete click) is not disturbed.
    const commitName = () => {
      const name = nameInput.value.trim();
      const current = work.route.points[i];
      if (!current || name === (current.name || "")) return;
      history.undo.push(work.route.points);
      history.redo = [];
      work.route = { ...work.route, points: c.replaceAt(work.route.points, i, { ...current, name: name || undefined }) };
      heading.textContent = headingText(work.route.points[i]);
      renderActions();
      renderStats();
    };
    nameInput.addEventListener("change", commitName);
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commitName(); nameInput.blur(); } });
    const stop = c.isStop(p);
    const anchorage = stop && places ? places.findAnchorage(p.anchorage_id) : null;
    const moved = places ? c.anchorageMovedM(p, anchorage) : 0;
    const nearby = !stop && places ? c.nearbyAnchorages(places.anchorages(), p, NEARBY_ANCHORAGE_NM).slice(0, MAX_NEARBY_BUTTONS) : [];
    const sub = `${fmtPos(p)}${anchorage && anchorage.depth_m ? ` · ${anchorage.depth_m} m` : ""}`;
    const box = el("div", { class: "pop" },
      heading,
      el("div", { class: "sub" }, sub),
      nearby.length ? el("div", { class: "nearby" },
        nearby.map((n) => el("button", { type: "button", class: "text-btn", onclick: () => makeStopAtAnchorage(i, n.anchorage) },
          `Make stop at ${n.anchorage.name}`, el("span", { class: "d" }, `${n.nm.toFixed(1)} nm`)))) : null,
      moved ? el("div", { class: "banner warn", style: "margin-bottom:8px" }, `The anchorage has moved ${Math.round(moved)} m since this stop was placed. `,
        el("button", { type: "button", class: "link-btn", onclick: () => editPoints((pts) => c.replaceAt(pts, i, { ...pts[i], latitude: anchorage.latitude, longitude: anchorage.longitude }), { popup: i }) }, "Move stop to anchorage")) : null,
      el("div", { class: "field" }, el("label", {}, "Name"), nameInput));
    if (stop && places) box.append(sitesServedPicker(i));
    box.append(el("div", { class: "actions" },
      !stop && places ? el("button", { type: "button", class: "text-btn secondary", onclick: () => makeAnchorageFromPoint(i) }, "Make anchorage") : null,
      places ? el("button", { type: "button", class: "text-btn secondary", onclick: () => makeSiteFromPoint(i) }, "Make site") : null,
      el("button", { type: "button", class: "text-btn danger-text", onclick: () => { map.closePopup(); editPoints((pts) => c.removeAt(pts, i)); } }, "Delete")));
    return box;
  }

  async function makeAnchorageFromPoint(i) {
    const p = work.route.points[i];
    map.closePopup();
    const saved = await places.openAnchorageModal(null, p, { name: p.name });
    if (saved && work.route.points[i]) makeStopAtAnchorage(i, saved);
  }

  async function makeSiteFromPoint(i) {
    const p = work.route.points[i];
    map.closePopup();
    const saved = await places.openSiteModal(null, p, { name: p.name });
    if (!saved || !work.route.points[i]) return;
    editPoints((pts) => {
      const current = pts[i];
      const next = { ...current, name: current.name || saved.title };
      if (!core().isStop(current)) next.site_id = saved.id;
      return core().replaceAt(pts, i, next);
    }, { popup: i });
  }

  // Tick list of sites a stop serves: those within SITES_NEAR_NM first, then the rest. Each tick re-opens the popup.
  function sitesServedPicker(i) {
    const c = core();
    const p = work.route.points[i];
    const chosen = new Set(p.site_ids || []);
    const sorted = places.sites().map((s) => ({ s, d: c.distNm(p, s) })).sort((x, y) => x.d - y.d);
    const row = ({ s, d }) => el("label", { class: d <= SITES_NEAR_NM ? "near" : "" },
      el("input", {
        type: "checkbox", checked: chosen.has(s.id),
        onchange: (e) => {
          const ticked = e.target.checked;
          editPoints((pts) => {
            const current = pts[i];
            const ids = ticked ? [...(current.site_ids || []).filter((x) => x !== s.id), s.id] : (current.site_ids || []).filter((x) => x !== s.id);
            return c.replaceAt(pts, i, { ...current, site_ids: ids });
          }, { popup: i });
        }
      }), s.title || s.id, el("span", { class: "d" }, `${d.toFixed(1)} nm`));
    const near = sorted.filter((x) => x.d <= SITES_NEAR_NM);
    const far = sorted.filter((x) => x.d > SITES_NEAR_NM);
    return el("div", { class: "field" }, el("label", {}, "Sites served"),
      el("div", { class: "site-pick" },
        near.length ? el("div", { class: "grp" }, `Within ${SITES_NEAR_NM} nm`) : null, near.map(row),
        far.length ? el("div", { class: "grp" }, "Further away") : null, far.map(row)));
  }

  // ---------- modals (house rules: green save + red cancel top right, outside click and Escape cancel) ----------
  function openModal({ title, body, onSave, saveTitle, wide, onClose }) {
    if (closeModal) closeModal();
    const backdrop = el("div", { class: "routes-modal modal-backdrop" });
    let busy = false;
    const close = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
      if (closeModal === close) closeModal = null;
      if (onClose) onClose();
    };
    const save = async () => {
      if (busy) return;
      busy = true;
      try { if ((await onSave()) !== false) close(); } finally { busy = false; }
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const iconBtn = (icon, label, cls, onclick) => {
      const btn = el("button", { type: "button", class: `icon-btn ${cls}`, title: label, "aria-label": label, onclick });
      btn.innerHTML = svg(icon);
      return btn;
    };
    const card = el("div", { class: "modal-card", role: "dialog", "aria-modal": "true", style: wide ? "width:min(640px,100%)" : null },
      el("div", { class: "card-header" },
        el("h2", {}, title),
        el("div", { class: "icon-row" },
          onSave ? iconBtn("check", saveTitle || "Save", "success", save) : null,
          iconBtn("cancel", "Cancel", "danger", close))),
      el("div", { class: "modal-body" }, body));
    backdrop.append(card);
    backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
    document.addEventListener("keydown", onKey);
    document.body.append(backdrop);
    closeModal = close;
    setTimeout(() => { const f = card.querySelector(".modal-body input, .modal-body select, .modal-body textarea"); if (f) f.focus(); }, 0);
    return { close, card };
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

  // ---------- add another route to this one ----------
  function openJoin() {
    if (!work) return;
    const others = routes.filter((r) => r.id !== work.route.id);
    if (!others.length) { status("There are no other routes to add.", ""); return; }
    const c = core();
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
        editPoints((pts) => c.joinPoints(pts, other.points.map((p) => ({ ...p })), opts), { fit: true });
        status(`Added ${other.name}.`, "ok");
        return true;
      }
    });
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
    if (closeModal) closeModal();
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
      isDirty,
      confirmOptions: { title: "Unsaved route", message: "Discard your unsaved route changes?", confirmLabel: "Discard", cancelLabel: "Cancel", tone: "danger" }
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
