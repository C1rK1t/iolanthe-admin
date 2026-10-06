// Routes panel (Charter → Routes). Uses window.IolantheAdmin (admin.js) and window.IolantheRoutesCore.
// Ported from docs/route-planner/planner-mockup.html. The map, saving and modals are added in later tasks.
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

  // Hooks the map (Task 5) fills in. Until then they do nothing.
  const mapHooks = {
    render: (opts) => {},
    focusPoint: (index) => {},
    focusLeg: (leg) => {}
  };

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
      return el("div", { class: "stop-item", onclick: () => mapHooks.focusPoint(i) },
        el("div", { class: "title" }, el("span", { class: "stop-num" }, n), p.name || "Stop"));
    });
    $("count-stops").textContent = stops.length || "";
    $("stops").replaceChildren(...(stops.length ? stops : [el("div", { class: "empty" }, "Stops arrive with anchorages in a later update.")]));

    renderLegs();

    const r = work.route;
    const src = r.source || {};
    const srcText = src.type === "charter" ? "migrated from a charter" : src.type === "kml" || src.type === "gpx" ? `imported from ${src.filename}` : "planner";
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
      ...legs.map((l, k) => el("div", { class: `stop-item leg-item${l.own ? " custom" : ""}`, title: "Show this leg on the map", onclick: () => mapHooks.focusLeg(l) },
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
    renderStats();
    mapHooks.render(o);
  }

  // ---------- wiring ----------
  function bindInputs() {
    $("picker").addEventListener("change", async (e) => {
      const value = e.target.value;
      if (!(await guardDiscard())) { renderPicker(); return; }
      if (value.startsWith("lib:")) openLibraryRoute(value.slice(4));
      else setWork(blankRoute());
    });
    $("name").addEventListener("input", (e) => { work.route = { ...work.route, name: e.target.value }; renderStats(); });
    $("desc").addEventListener("input", (e) => { work.route = { ...work.route, description: e.target.value }; renderStats(); });
    $("tab-stops").addEventListener("click", () => showTab("stops"));
    $("tab-legs").addEventListener("click", () => showTab("legs"));
    // The route speed is saved with the route. The last value used also seeds new routes in this browser.
    $("speed").addEventListener("input", () => {
      const v = parseFloat($("speed").value);
      work.route = { ...work.route, speed_kn: v > 0 ? v : undefined };
      if (v > 0) storeSpeed(v);
      renderStats();
    });
  }

  function showLoadError(message) {
    panel.querySelector(".planner").replaceWith(el("p", { class: "empty" }, `Routes could not be loaded: ${message}`));
  }

  async function loadLibrary() {
    try {
      const data = await A().api("/api/admin/routes");
      if (!panel.isConnected) return;
      routes = Array.isArray(data.routes) ? data.routes : [];
      setWork(routes.length ? routes[0] : blankRoute());
    } catch (error) {
      A().setStatus(error.message, "error");
      if (panel.isConnected) showLoadError(error.message);
    }
  }

  function bind() {
    panel = document.getElementById("routes-panel");
    if (!panel) return;
    work = null;
    guard = {
      isDirty,
      confirmOptions: { title: "Unsaved route", message: "Discard your unsaved route changes?", confirmLabel: "Discard", cancelLabel: "Cancel", tone: "danger" }
    };
    A().setPageUnsavedGuard(guard);
    bindInputs();
    loadLibrary();
  }

  window.IolantheRoutes = Object.freeze({ render, bind });
})();
