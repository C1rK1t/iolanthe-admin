(function () {
  "use strict";

  // Charter → Itinerary panel (charter rework spec A §4). Plan 2 renders; plan 3 adds editing.
  // Uses window.IolantheAdmin (helpers exposed by admin.js), window.IolantheItineraryCore (pure logic) and
  // window.IolantheRoutesUi.el (DOM builder shared with the Routes panel).

  const A = () => window.IolantheAdmin;
  const core = () => window.IolantheItineraryCore;
  const el = (...args) => window.IolantheRoutesUi.el(...args);

  let panel = null;    // #itinerary-panel after bind()
  let ctx = null;      // { charterId, charter, siteLibrary }
  let work = null;     // { itinerary, savedJson, baseRevision }
  let resizeBound = false;
  let saving = false;
  let guard = null;
  const JSON_HEADERS = { "Content-Type": "application/json" };
  const post = (path, body) => A().api(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
  const status = (message, tone) => A().setStatus(message, tone);
  const isDirty = () => Boolean(work) && core().itinerarySnapshot(work.itinerary) !== work.savedJson;

  // Every edit goes through here: pure function in, new itinerary out, re-render.
  function commit(next, opts) {
    if (!next || next === work.itinerary) return false;
    work.itinerary = next;
    renderAll(opts);
    return true;
  }

  async function save() {
    if (!work || saving) return;
    const n = dayCount();
    const problems = core().validateItinerary(work.itinerary, n);
    if (problems.length) { status(problems[0].message, "error"); return; }
    const sent = core().itinerarySnapshot(work.itinerary);
    const mine = panel;
    saving = true;
    renderHeader();
    try {
      const { itinerary } = await post(`/api/admin/charter/${encodeURIComponent(ctx.charterId)}/itinerary/save`, { itinerary: work.itinerary, base_revision: work.baseRevision });
      if (panel !== mine || !mine.isConnected) return;
      const saved = core().normalizeItinerary(itinerary);
      // Keep edits made while the request was in flight: only adopt the server copy if nothing changed since we sent.
      if (core().itinerarySnapshot(work.itinerary) === sent) work.itinerary = saved;
      work.baseRevision = saved.revision;
      work.savedJson = core().itinerarySnapshot(saved);
      status(`Itinerary saved · revision ${saved.revision}`, "ok");
      renderAll();
    } catch (error) {
      if (panel !== mine || !mine.isConnected) return;
      if (error.status === 409) await handleClash(error);
      else if (error && !error.loginRequired && error.message) status(error.message, "error");
    } finally {
      saving = false;
      if (panel === mine && mine.isConnected && work) renderHeader();
    }
  }

  async function handleClash(error) {
    const reload = await A().showAdminConfirm({
      title: "Itinerary changed elsewhere",
      message: `${error.message} Reloading discards your changes; Cancel keeps them so you can copy anything you need.`,
      confirmLabel: "Reload", cancelLabel: "Cancel", tone: "warning"
    });
    if (!reload) return;
    await reloadFromServer();
  }

  async function reloadFromServer() {
    const bundle = await A().api(`/api/admin/charter/${encodeURIComponent(ctx.charterId)}`);
    const itinerary = core().normalizeItinerary(bundle["itinerary.json"]);
    work = { itinerary, savedJson: core().itinerarySnapshot(itinerary), baseRevision: itinerary.revision };
    renderAll();
  }

  async function cancelEdits() {
    if (!isDirty()) return;
    const ok = await A().showAdminConfirm({ title: "Discard changes?", message: "Your unsaved itinerary changes will be lost.", confirmLabel: "Discard", cancelLabel: "Keep editing", tone: "warning" });
    if (ok) await reloadFromServer();
  }

  // Minimal modal: returns { root, body, close }. Buttons are built by the caller.
  function openModal(title) {
    const body = el("div", { class: "itinerary-modal__body" });
    const close = () => root.remove();
    const root = el("div", { class: "itinerary-modal", role: "dialog", "aria-modal": "true", "aria-label": title },
      el("div", { class: "itinerary-modal__card" },
        el("div", { class: "itinerary-modal__head" }, el("h3", {}, title), el("button", { type: "button", class: "itinerary-pop__close", "aria-label": "Close" }, "×")),
        body));
    root.querySelector(".itinerary-pop__close").addEventListener("click", close);
    root.addEventListener("click", (e) => { if (e.target === root) close(); });
    document.body.append(root);
    return { root, body, close };
  }

  async function openApplyModal() {
    if (isDirty()) { status("Save or cancel your changes first.", "error"); return; }
    const n = dayCount();
    if (!n) { status("Set the charter's start and end dates first.", "error"); return; }
    let routes = [];
    try { routes = (await A().api("/api/admin/routes")).routes || []; } catch (error) { status(error.message, "error"); return; }
    const modal = openModal("Apply a library route");
    const picker = el("select", { class: "itinerary-modal__select" }, ...routes.map((r) => el("option", { value: r.id }, `${r.name} · ${r.points.filter(core().isStop).length} stops`)));
    const today = (() => { const start = core().parseDateOnly(ctx.charter.start_date); if (start === null) return 1; const d = Math.floor((Date.now() - start) / 86400000) + 1; return Math.min(Math.max(d, 1), n); })();
    const fromDay = el("select", { class: "itinerary-modal__select" }, ...dayOptions(core().stopEntries(work.itinerary.route.points).length ? today : 1, n));
    const preview = el("div", { class: "muted itinerary-modal__preview" });
    const updatePreview = () => {
      const route = routes.find((r) => r.id === picker.value);
      const from = Number(fromDay.value);
      const nights = route ? route.points.filter(core().isStop).reduce((sum, p) => sum + (Number.isInteger(p.nights) ? p.nights : (p.anchorage_id ? 1 : 0)), 0) : 0;
      const kept = core().stopEntries(work.itinerary.route.points).filter((e, i, all) => core().stopSpan(e.point, core().positionOf(i, all.length), n).from < from).length;
      preview.textContent = route ? `Keeps ${kept} stop${kept === 1 ? "" : "s"}, replaces from Day ${from}. The route plans about ${nights} night${nights === 1 ? "" : "s"}; ${n - from + 1} day${n - from + 1 === 1 ? "" : "s"} remain.` : "";
    };
    picker.addEventListener("change", updatePreview);
    fromDay.addEventListener("change", updatePreview);
    updatePreview();
    const apply = el("button", { type: "button", class: "itinerary-action itinerary-action--primary" }, "Apply");
    apply.addEventListener("click", async () => {
      apply.disabled = true;
      try {
        const { itinerary } = await post(`/api/admin/charter/${encodeURIComponent(ctx.charterId)}/itinerary/apply-route`, { route_id: picker.value, from_day: Number(fromDay.value), base_revision: work.baseRevision });
        const saved = core().normalizeItinerary(itinerary);
        work = { itinerary: saved, savedJson: core().itinerarySnapshot(saved), baseRevision: saved.revision };
        modal.close();
        status(`Applied "${picker.selectedOptions[0].textContent}" from Day ${fromDay.value}.`, "ok");
        renderAll();
      } catch (error) {
        apply.disabled = false;
        if (error.status === 409 && error.payload && error.payload.code === "too-long") status(error.message, "error");
        else if (error.status === 409) { modal.close(); await handleClash(error); }
        else status(error.message, "error");
      }
    });
    modal.body.append(
      el("label", { class: "itinerary-modal__field" }, "Route", picker),
      el("label", { class: "itinerary-modal__field" }, "From day", fromDay),
      preview,
      el("div", { class: "itinerary-modal__actions" }, apply)
    );
  }

  async function openPromoteModal() {
    if (isDirty()) { status("Save your changes first.", "error"); return; }
    let routes = [];
    try { routes = (await A().api("/api/admin/routes")).routes || []; } catch (error) { status(error.message, "error"); return; }
    const source = work.itinerary.route.source || {};
    const parent = source.type === "library" ? routes.find((r) => r.id === source.route_id) : null;
    const modal = openModal("Promote this route to the library");
    const overwrite = el("input", { type: "radio", name: "promote", value: "overwrite", ...(parent ? { checked: "" } : { disabled: "" }) });
    const asNew = el("input", { type: "radio", name: "promote", value: "new", ...(parent ? {} : { checked: "" }) });
    const name = el("input", { type: "text", class: "itinerary-modal__text", placeholder: "New route name", value: `${ctx.charter.name || ctx.charterId} route` });
    const go = el("button", { type: "button", class: "itinerary-action itinerary-action--primary" }, "Promote");
    go.addEventListener("click", async () => {
      go.disabled = true;
      const target = overwrite.checked && parent ? { id: parent.id, revision: parent.revision, name: parent.name } : { name: name.value.trim() };
      if (!target.id && !target.name) { status("Give the new route a name.", "error"); go.disabled = false; return; }
      const route = core().promoteRoute(work.itinerary, target);
      if (target.id) route.name = parent.name;
      try {
        const { route: saved } = await post("/api/admin/routes/save", { route, base_revision: target.id ? parent.revision : 0 });
        modal.close();
        status(`Library route "${saved.name}" saved · revision ${saved.revision}`, "ok");
      } catch (error) {
        go.disabled = false;
        status(error.message, "error");
      }
    });
    modal.body.append(
      el("label", { class: "itinerary-modal__radio" }, overwrite, ` Overwrite "${parent ? parent.name : "(no parent library route)"}"`),
      el("label", { class: "itinerary-modal__radio" }, asNew, " Save as a new library route"),
      el("label", { class: "itinerary-modal__field" }, "Name", name),
      el("div", { class: "itinerary-modal__actions" }, go)
    );
  }

  const dayCount = () => core().charterDayCount(ctx.charter);
  const siteTitle = (id) => {
    const site = ((ctx.siteLibrary && ctx.siteLibrary.sites) || []).find((s) => s && s.id === id);
    return site && site.title ? site.title : id;
  };

  function render() {
    return `
      <section class="card full itinerary-panel" id="itinerary-panel">
        <div class="itinerary-panel__header">
          <div>
            <h2 id="itinerary-title"></h2>
            <div class="itinerary-panel__dates muted" id="itinerary-dates"></div>
          </div>
          <div class="itinerary-panel__actions" id="itinerary-actions"></div>
          <div class="itinerary-thumb" id="itinerary-thumb" title="Open the route"></div>
        </div>
        <div class="itinerary-panel__welcome" id="itinerary-welcome"></div>
        <div class="itinerary-panel__hint muted" id="itinerary-hint" hidden></div>
        <div class="itinerary-board" id="itinerary-board">
          <div class="itinerary-board__titles" id="itinerary-titles"></div>
          <svg class="itinerary-board__line" id="itinerary-line" aria-hidden="true"></svg>
          <div class="itinerary-board__days" id="itinerary-days"></div>
          <div class="itinerary-board__edges" id="itinerary-edges"></div>
        </div>
      </section>`;
  }

  function renderHeader() {
    const c = ctx.charter || {};
    panel.querySelector("#itinerary-title").textContent = c.name || ctx.charterId;
    const n = dayCount();
    const dates = c.start_date && c.end_date ? `${c.start_date} → ${c.end_date} · ${n} day${n === 1 ? "" : "s"}` : "Set the charter dates on Charter Info";
    panel.querySelector("#itinerary-dates").textContent = dates;
    const actions = panel.querySelector("#itinerary-actions");
    const dirty = isDirty();
    actions.replaceChildren(
      el("button", { type: "button", class: "itinerary-action", "data-action": "edit-route" }, "Edit route"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "apply-route", ...(dirty ? { disabled: "" } : {}) }, "Apply library route…"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "promote", ...(dirty || !core().stopEntries(work.itinerary.route.points).length ? { disabled: "" } : {}) }, "Promote to library…"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "cancel", ...(dirty && !saving ? {} : { disabled: "" }) }, "Cancel"),
      el("button", { type: "button", class: "itinerary-action itinerary-action--primary", "data-action": "save", ...(dirty && !saving ? {} : { disabled: "" }) }, saving ? "Saving…" : "Save")
    );
    actions.querySelector('[data-action="edit-route"]').addEventListener("click", () => A().showCharterPanel("routes", { subject: "charter" }));
    actions.querySelector('[data-action="save"]').addEventListener("click", save);
    actions.querySelector('[data-action="cancel"]').addEventListener("click", cancelEdits);
    actions.querySelector('[data-action="apply-route"]').addEventListener("click", openApplyModal);
    actions.querySelector('[data-action="promote"]').addEventListener("click", openPromoteModal);
  }

  function renderWelcome() {
    const box = panel.querySelector("#itinerary-welcome");
    const text = work.itinerary.welcome_message;
    const edit = el("button", { type: "button", class: "itinerary-action itinerary-action--small" }, "Edit");
    edit.addEventListener("click", () => {
      const ta = el("textarea", { class: "itinerary-welcome__edit", rows: "4", maxlength: String(core().MAX_NOTES_LENGTH) }, text);
      const done = el("button", { type: "button", class: "itinerary-action itinerary-action--small" }, "Done");
      done.addEventListener("click", () => commit({ ...work.itinerary, welcome_message: ta.value.trim() }) || renderWelcome());
      box.replaceChildren(el("div", { class: "itinerary-welcome__label label" }, "Welcome message"), ta, done);
      ta.focus();
    });
    box.replaceChildren(
      el("div", { class: "itinerary-welcome__head" }, el("div", { class: "itinerary-welcome__label label" }, "Welcome message"), edit),
      el("div", { class: `itinerary-welcome__text${text ? "" : " muted"}` }, text || "No welcome message yet.")
    );
  }

  function activityRow(activity) {
    const firstLine = (activity.notes || "").split("\n")[0];
    const row = el("div", { class: `itinerary-activity${activity.site_id ? " itinerary-activity--site" : " itinerary-activity--free"}`, "data-activity-id": activity.id, draggable: "false" },
      el("span", { class: "itinerary-activity__grip", "aria-hidden": "true", title: "Drag to move" }, "⋮⋮"),
      el("span", { class: "itinerary-activity__title" }, activity.title || (activity.site_id ? siteTitle(activity.site_id) : "Untitled")),
      activity.time ? el("span", { class: "itinerary-activity__time" }, activity.time) : el("span"),
      el("button", { type: "button", class: "itinerary-activity__remove", "aria-label": `Remove ${activity.title}` }, "×"),
      firstLine ? el("span", { class: "itinerary-activity__notes muted" }, firstLine) : null
    );
    row.querySelector(".itinerary-activity__remove").addEventListener("click", (e) => { e.stopPropagation(); commit(core().removeActivity(work.itinerary, activity.id)); });
    row.querySelector(".itinerary-activity__title").addEventListener("click", () => editActivity(row, activity));
    row.querySelector(".itinerary-activity__grip").addEventListener("pointerdown", (e) => startActivityDrag(e, activity, row));   // Task 8
    return row;
  }

  // Inline editor: title, time, notes. Enter / blur commits, Escape cancels.
  function editActivity(row, activity) {
    const title = el("input", { type: "text", class: "itinerary-edit__title", value: activity.title, maxlength: String(core().MAX_TITLE_LENGTH), placeholder: "Title" });
    const time = el("input", { type: "time", class: "itinerary-edit__time", value: activity.time || "" });
    const notes = el("textarea", { class: "itinerary-edit__notes", rows: "2", placeholder: "Notes for guests" }, activity.notes || "");
    const form = el("div", { class: "itinerary-edit" }, title, time, notes);
    const done = () => commit(core().updateActivity(work.itinerary, activity.id, { title: title.value, time: time.value, notes: notes.value })) || renderAll();
    const cancel = () => renderAll();
    [title, time, notes].forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        if (e.key === "Enter" && input !== notes) { e.preventDefault(); done(); }
      });
    });
    form.addEventListener("focusout", (e) => { if (!form.contains(e.relatedTarget)) done(); });
    row.replaceChildren(form);
    title.focus();
    title.select();
  }

  // Drag an activity by its grip. Pointer events so mouse and touch behave the same (touch-action: none on the grip).
  function startActivityDrag(event, activity, row) {
    event.preventDefault();
    const grip = event.currentTarget;
    grip.setPointerCapture(event.pointerId);
    const ghost = row.cloneNode(true);
    ghost.classList.add("itinerary-activity--ghost");
    ghost.style.width = `${row.offsetWidth}px`;
    document.body.append(ghost);
    row.classList.add("itinerary-activity--source");
    let target = null;   // { sub, stopId, day, index, ok }

    const locate = (e) => {
      ghost.style.left = `${e.clientX + 8}px`;
      ghost.style.top = `${e.clientY - 10}px`;
      ghost.style.display = "none";
      const under = document.elementFromPoint(e.clientX, e.clientY);
      ghost.style.display = "";
      const sub = under && under.closest ? under.closest(".itinerary-sub") : null;
      panel.querySelectorAll(".itinerary-sub--over, .itinerary-sub--refused").forEach((n) => n.classList.remove("itinerary-sub--over", "itinerary-sub--refused"));
      if (!sub) { target = null; return; }
      const stopId = sub.dataset.stopId;
      const day = Number(sub.dataset.day);
      const ok = core().canDropActivity(work.itinerary, activity.id, stopId, day, dayCount());
      const rows = [...sub.querySelectorAll(".itinerary-activity")].filter((r) => r !== row);
      const index = rows.filter((r) => { const b = r.getBoundingClientRect(); return e.clientY > b.top + b.height / 2; }).length;
      sub.classList.add(ok ? "itinerary-sub--over" : "itinerary-sub--refused");
      target = { sub, stopId, day, index, ok };
    };
    const finish = () => {
      grip.removeEventListener("pointermove", locate);
      grip.removeEventListener("pointerup", finish);
      grip.removeEventListener("pointercancel", finish);
      ghost.remove();
      row.classList.remove("itinerary-activity--source");
      panel.querySelectorAll(".itinerary-sub--over, .itinerary-sub--refused").forEach((n) => n.classList.remove("itinerary-sub--over", "itinerary-sub--refused"));
      if (target && target.ok) commit(core().moveActivity(work.itinerary, activity.id, target.stopId, target.day, target.index));
      else if (target && !target.ok) status(activity.site_id ? `${siteTitle(activity.site_id)} is not served from that stop.` : "That day is outside the stop's span.", "error");
    };
    grip.addEventListener("pointermove", locate);
    grip.addEventListener("pointerup", finish);
    grip.addEventListener("pointercancel", finish);
  }

  let addMenu = null;
  function closeAddMenu() { if (addMenu) { addMenu.remove(); addMenu = null; } }

  // Three groups: sites served here (not yet on this day), other library sites (type-ahead), free text.
  function openAddMenu(stop, day, anchor) {
    closeAddMenu();
    const point = core().stopEntries(work.itinerary.route.points).map((e) => e.point).find((p) => p.id === stop.id);
    const onDay = new Set(work.itinerary.activities.filter((a) => a.stop_id === stop.id && a.day === day && a.site_id).map((a) => a.site_id));
    const add = (fields) => { closeAddMenu(); const next = core().addActivity(work.itinerary, stop.id, day, fields); if (commit(next)) { const added = next.activities[next.activities.length - 1]; const row = panel.querySelector(`.itinerary-activity[data-activity-id="${added.id}"]`); if (row && !fields.site_id) editActivity(row, added); } };
    const servedRows = (point.site_ids || []).filter((id) => !onDay.has(id)).map((id) => { const b = el("button", { type: "button", class: "itinerary-menu__item" }, siteTitle(id)); b.addEventListener("click", () => add({ title: siteTitle(id), site_id: id })); return b; });
    const search = el("input", { type: "search", class: "itinerary-menu__search", placeholder: "Other site…" });
    const results = el("div", { class: "itinerary-menu__results" });
    const all = core().sitesByDistance(ctx.siteLibrary, point);
    const showResults = () => {
      const q = search.value.trim().toLowerCase();
      results.replaceChildren(...all.filter((s) => !(point.site_ids || []).includes(s.id) && (!q || s.title.toLowerCase().includes(q))).slice(0, 8).map((s) => {
        const b = el("button", { type: "button", class: "itinerary-menu__item" }, `${s.title} `, el("span", { class: "muted" }, `${s.nm.toFixed(1)} nm`));
        b.addEventListener("click", () => add({ title: s.title, site_id: s.id }));
        return b;
      }));
    };
    search.addEventListener("input", showResults);
    const free = el("button", { type: "button", class: "itinerary-menu__item itinerary-menu__item--free" }, "+ Free text activity");
    free.addEventListener("click", () => add({ title: "" }));
    addMenu = el("div", { class: "itinerary-menu", role: "menu" },
      servedRows.length ? el("div", { class: "label" }, "Sites served here") : null, ...servedRows,
      el("div", { class: "label" }, "Other sites"), search, results,
      free
    );
    showResults();
    anchor.closest(".itinerary-sub").append(addMenu);
    setTimeout(() => document.addEventListener("pointerdown", (e) => { if (addMenu && !addMenu.contains(e.target) && e.target !== anchor) closeAddMenu(); }, { capture: true, once: true }), 0);
    search.focus();
  }

  function subBox(stop, day) {
    const box = el("div", { class: "itinerary-sub", "data-stop-id": stop.id, "data-day": String(day) },
      el("div", { class: "itinerary-sub__gutter" },
        el("button", { type: "button", class: "itinerary-sub__add", title: `Add a site or activity at ${stop.name}` }, "+")),
      el("div", { class: "itinerary-sub__activities" }, ...stop.activities.map(activityRow))
    );
    box.querySelector(".itinerary-sub__add").addEventListener("click", (e) => openAddMenu(stop, day, e.currentTarget));
    return box;
  }

  function dayBox(day) {
    const date = core().dayDateLabel(ctx.charter, day.day);
    const isLast = day.day === dayCount();
    const ends = isLast && ctx.charter && ctx.charter.end_time ? ` · ends ${ctx.charter.end_time}` : "";
    return el("div", { class: "itinerary-day", "data-day": String(day.day) },
      el("div", { class: "itinerary-day__title" }, `Day ${day.day}`, el("span", { class: "muted" }, date ? ` · ${date}${ends}` : ends)),
      ...day.stops.map((stop) => subBox(stop, day.day)),
      day.stops.length ? null : el("div", { class: "itinerary-day__passage muted" }, passageLabel(day.day))
    );
  }

  // "Underway · Potipot to Hundred Islands" for a day with no stops.
  function passageLabel(dayNumber) {
    const stops = core().stopEntries(work.itinerary.route.points).map((e) => e.point);
    const before = [...stops].reverse().find((s) => s.depart && s.depart.day < dayNumber);
    const after = stops.find((s) => s.arrive && s.arrive.day > dayNumber);
    if (before && after) return `Underway · ${before.name || "previous stop"} to ${after.name || "next stop"}`;
    return "At sea";
  }

  function renderDays() {
    const n = dayCount();
    const days = core().deriveDays(work.itinerary, n);
    const daysEl = panel.querySelector("#itinerary-days");
    daysEl.replaceChildren(...days.map(dayBox));
    const hint = panel.querySelector("#itinerary-hint");
    const hasStops = core().stopEntries(work.itinerary.route.points).length > 0;
    hint.hidden = Boolean(n) && hasStops;
    hint.textContent = !n ? "Set the charter's start and end dates to lay out the days." : "Apply a library route or Edit route to start.";
    return days;
  }

  // A static SVG of the route path and stops; no tiles, so it needs nothing from the network.
  function renderThumb() {
    const box = panel.querySelector("#itinerary-thumb");
    const points = work.itinerary.route.points;
    box.replaceChildren();
    if (points.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const W = 160, H = 110, PAD = 8;
    const lats = points.map((p) => p.latitude), lons = points.map((p) => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const spanLat = Math.max(maxLat - minLat, 0.0001), spanLon = Math.max((maxLon - minLon) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180), 0.0001);
    const scale = Math.min((W - 2 * PAD) / spanLon, (H - 2 * PAD) / spanLat);
    const x = (p) => PAD + ((p.longitude - minLon) * Math.cos((minLat + maxLat) / 2 * Math.PI / 180)) * scale;
    const y = (p) => H - PAD - (p.latitude - minLat) * scale;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "itinerary-thumb__svg" });
    svg.append(svgEl("path", { class: "itinerary-thumb__path", d: points.map((p, i) => `${i ? "L" : "M"} ${x(p).toFixed(1)} ${y(p).toFixed(1)}`).join(" ") }));
    points.filter(core().isStop).forEach((p) => svg.append(svgEl("circle", { class: "itinerary-thumb__stop", cx: x(p).toFixed(1), cy: y(p).toFixed(1), r: 3 })));
    box.append(svg);
    box.onclick = () => A().showCharterPanel("routes", { subject: "charter" });
  }

  function renderAll(opts) {
    renderHeader();
    renderThumb();
    renderWelcome();
    const days = renderDays();
    requestAnimationFrame(() => {
      drawLine(days);
      positionEdges(days);
      if (opts && opts.keepFocusEdge) {
        const h = panel.querySelector(`.itinerary-edge[data-edge="${opts.keepFocusEdge}"]`);
        if (h) h.focus({ preventScroll: true });
      }
    });
  }

  const EDGE_STEP_PX = 28;   // pointer travel per snap step

  // One handle per edge, positioned at the boundary between day boxes. Called after every render.
  function positionEdges(days) {
    const board = panel.querySelector("#itinerary-board");
    const daysEl = panel.querySelector("#itinerary-days");
    const edgesEl = panel.querySelector("#itinerary-edges");
    const boardRect = board.getBoundingClientRect();
    const states = core().edgeStates(work.itinerary, dayCount());
    const dayEls = [...panel.querySelectorAll(".itinerary-day")];
    edgesEl.style.left = `${daysEl.offsetLeft}px`;
    edgesEl.style.width = `${daysEl.offsetWidth}px`;
    edgesEl.replaceChildren();
    states.forEach((state) => {
      const below = dayEls[state.day];                      // the day box that starts at this edge
      if (!below) return;
      const y = below.getBoundingClientRect().top - boardRect.top;
      const handle = el("button", {
        type: "button",
        class: `itinerary-edge itinerary-edge--${state.kind}`,
        "data-edge": String(state.day),
        title: state.kind === "none" ? "Nothing to move here" : `Day ${state.day} / ${state.day + 1} edge. Drag or use the arrow keys.`,
        "aria-label": `Edge between day ${state.day} and day ${state.day + 1}`,
        ...(state.kind === "none" ? { disabled: "" } : {})
      });
      handle.style.top = `${y}px`;
      handle.style.right = "12px";
      handle.addEventListener("pointerdown", onEdgePointerDown);
      handle.addEventListener("keydown", onEdgeKey);
      edgesEl.append(handle);
    });
  }

  function stepEdge(edgeDay, direction) {
    const next = core().moveEdge(work.itinerary, edgeDay, direction, dayCount());
    if (!next) { flashEdge(edgeDay); return false; }
    return commit(next, { keepFocusEdge: edgeDay });
  }

  function flashEdge(edgeDay) {
    const handle = panel.querySelector(`.itinerary-edge[data-edge="${edgeDay}"]`);
    if (!handle) return;
    handle.classList.add("itinerary-edge--refused");
    setTimeout(() => handle.classList.remove("itinerary-edge--refused"), 350);
  }

  function onEdgeKey(event) {
    const edgeDay = Number(event.currentTarget.dataset.edge);
    if (event.key === "ArrowDown") { event.preventDefault(); stepEdge(edgeDay, "down"); }
    if (event.key === "ArrowUp") { event.preventDefault(); stepEdge(edgeDay, "up"); }
  }

  function onEdgePointerDown(event) {
    const handle = event.currentTarget;
    const edgeDay = Number(handle.dataset.edge);
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("itinerary-edge--dragging");
    let anchorY = event.clientY;
    const move = (e) => {
      const dy = e.clientY - anchorY;
      if (dy > EDGE_STEP_PX) { anchorY = e.clientY; stepEdge(edgeDay, "down"); }
      else if (dy < -EDGE_STEP_PX) { anchorY = e.clientY; stepEdge(edgeDay, "up"); }
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      handle.classList.remove("itinerary-edge--dragging");
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
    return node;
  };
  const LINE_X = 20;        // x of the line inside the 40px middle column
  const LOOP_W = 18;        // loop (dwell) width
  const DOT_R = 7;

  // Measures each sub-box, asks core for the geometry, then draws the SVG and places the titles.
  function drawLine(days) {
    const board = panel.querySelector("#itinerary-board");
    const daysEl = panel.querySelector("#itinerary-days");
    const svg = panel.querySelector("#itinerary-line");
    const titles = panel.querySelector("#itinerary-titles");
    const boardTop = board.getBoundingClientRect().top;
    const centres = new Map();
    daysEl.querySelectorAll(".itinerary-sub").forEach((node) => {
      const r = node.getBoundingClientRect();
      centres.set(`${node.dataset.stopId}:${node.dataset.day}`, r.top + r.height / 2 - boardTop);
    });
    const height = Math.max(daysEl.offsetHeight, 1);
    svg.setAttribute("viewBox", `0 0 40 ${height}`);
    svg.setAttribute("width", "40");
    svg.setAttribute("height", String(height));
    svg.replaceChildren();
    titles.replaceChildren();
    titles.style.height = `${height}px`;

    const geo = core().lineGeometry(days, centres);
    if (!geo.shapes.length) return;

    const stopsById = new Map(core().stopEntries(work.itinerary.route.points).map((e) => [e.point.id, e.point]));
    const times = core().estimateTimes(work.itinerary);

    // The trunk line runs from the first shape to the last.
    svg.append(svgEl("line", { class: "itinerary-line__trunk", x1: LINE_X, y1: geo.top, x2: LINE_X, y2: geo.bottom }));

    geo.shapes.forEach((shape) => {
      if (shape.terminal === "origin") {
        // Open at the top, rounded at the bottom; spans the dwell when the origin stop is slept at.
        svg.append(svgEl("path", { class: "itinerary-line__terminal", d: `M ${LINE_X - 9} ${shape.y1 - 14} V ${shape.y2} A 9 9 0 0 0 ${LINE_X + 9} ${shape.y2} V ${shape.y1 - 14}` }));
      } else if (shape.terminal === "terminus") {
        // Open at the bottom, rounded at the top.
        svg.append(svgEl("path", { class: "itinerary-line__terminal", d: `M ${LINE_X - 9} ${shape.y2 + 14} V ${shape.y1} A 9 9 0 0 1 ${LINE_X + 9} ${shape.y1} V ${shape.y2 + 14}` }));
      } else if (shape.kind === "loop") {
        svg.append(svgEl("rect", { class: "itinerary-line__loop", x: LINE_X - LOOP_W / 2, y: shape.y1 - 9, width: LOOP_W, height: shape.y2 - shape.y1 + 18, rx: 9 }));
      } else {
        svg.append(svgEl("circle", { class: "itinerary-line__dot", cx: LINE_X, cy: shape.y1, r: DOT_R }));
      }
      const stop = stopsById.get(shape.stopId);
      if (!stop) return;
      const title = el("div", { class: "itinerary-stop-title", "data-stop-id": shape.stopId },
        el("div", { class: "itinerary-stop-title__name" }, stop.name || "Stop"),
        el("div", { class: `itinerary-stop-title__times muted${/~/.test(core().stopTimesLabel(stop, times.get(shape.stopId))) ? " itinerary-stop-title__times--est" : ""}` }, core().stopTimesLabel(stop, times.get(shape.stopId)))
      );
      title.style.top = `${(shape.y1 + shape.y2) / 2}px`;
      titles.append(title);
      title.addEventListener("click", () => openStopPopover(shape.stopId, title));
      svg.lastElementChild.addEventListener("click", () => openStopPopover(shape.stopId, title));
      svg.lastElementChild.classList.add("itinerary-line__clickable");
    });
  }

  let popover = null;

  function closePopover() {
    if (popover) { popover.remove(); popover = null; }
    document.removeEventListener("pointerdown", onDocPointerDown, true);
  }
  function onDocPointerDown(event) {
    if (popover && !popover.contains(event.target)) closePopover();
  }

  function dayOptions(selected, n) {
    return Array.from({ length: n }, (_, i) => el("option", { value: String(i + 1), ...(i + 1 === selected ? { selected: "" } : {}) }, `Day ${i + 1} · ${core().dayDateLabel(ctx.charter, i + 1)}`));
  }

  function openStopPopover(stopId, anchor) {
    closePopover();
    const stop = core().stopEntries(work.itinerary.route.points).map((e) => e.point).find((p) => p.id === stopId);
    if (!stop) return;
    const n = dayCount();
    const times = core().estimateTimes(work.itinerary).get(stopId) || { arrive: null, depart: null };
    const nights = stop.arrive && stop.depart ? stop.depart.day - stop.arrive.day : 0;

    const dayTimeRow = (label, field) => {
      const value = stop[field];
      if (!value) return el("div", { class: "itinerary-pop__row muted" }, `${label}: ${field === "arrive" ? "origin" : "terminus"}`);
      const daySel = el("select", { class: "itinerary-pop__day" }, ...dayOptions(value.day, n));
      const timeIn = el("input", { type: "time", class: "itinerary-pop__time", value: value.time || "", placeholder: times[field] && times[field].estimated ? `~${times[field].time}` : "" });
      daySel.addEventListener("change", () => {
        const result = core().setStopDays(work.itinerary, stopId, field === "arrive" ? { arriveDay: Number(daySel.value) } : { departDay: Number(daySel.value) }, n);
        if (result.error) { status(result.error, "error"); daySel.value = String(value.day); return; }
        commit(result.itinerary);
        openStopPopover(stopId, panel.querySelector(`.itinerary-stop-title[data-stop-id="${stopId}"]`) || anchor);
      });
      timeIn.addEventListener("change", () => { commit(core().setStopTime(work.itinerary, stopId, field, timeIn.value)); });
      const est = times[field] && times[field].estimated ? el("span", { class: "muted itinerary-pop__est" }, `est. ${times[field].time}`) : null;
      return el("div", { class: "itinerary-pop__row" }, el("label", {}, label), daySel, timeIn, est);
    };

    const sitesList = core().sitesByDistance(ctx.siteLibrary, stop);
    const served = new Set(stop.site_ids || []);
    const siteRows = sitesList.filter((s) => s.near || served.has(s.id)).map((s) => {
      const cb = el("input", { type: "checkbox", ...(served.has(s.id) ? { checked: "" } : {}) });
      cb.addEventListener("change", () => {
        const ids = cb.checked ? [...(stop.site_ids || []), s.id] : (stop.site_ids || []).filter((x) => x !== s.id);
        if (!cb.checked && work.itinerary.activities.some((a) => a.stop_id === stopId && a.site_id === s.id)) {
          A().showAdminConfirm({ title: "Remove site", message: `Activities at ${s.title} on this stop will be removed too.`, confirmLabel: "Remove", cancelLabel: "Keep", tone: "warning" })
            .then((ok) => { if (ok) { commit(core().setStopSites(work.itinerary, stopId, ids)); openStopPopover(stopId, anchor); } else { cb.checked = true; } });
          return;
        }
        commit(core().setStopSites(work.itinerary, stopId, ids));
      });
      return el("label", { class: "itinerary-pop__site" }, cb, ` ${s.title} `, el("span", { class: "muted" }, `${s.nm.toFixed(1)} nm`));
    });

    popover = el("div", { class: "itinerary-pop", role: "dialog", "aria-label": `${stop.name || "Stop"} details` },
      el("div", { class: "itinerary-pop__head" }, el("strong", {}, stop.name || "Stop"), el("button", { type: "button", class: "itinerary-pop__close", "aria-label": "Close" }, "×")),
      dayTimeRow("Arrival", "arrive"),
      dayTimeRow("Departure", "depart"),
      el("div", { class: "itinerary-pop__row muted" }, `Nights: ${nights}`),
      el("div", { class: "itinerary-pop__sites" }, el("div", { class: "label" }, "Sites served"), ...(siteRows.length ? siteRows : [el("div", { class: "muted" }, "No sites within 5 nm")])),
      (() => { const b = el("button", { type: "button", class: "itinerary-action itinerary-action--small" }, "Open on map"); b.addEventListener("click", () => A().showCharterPanel("routes", { subject: "charter", focusStopId: stopId })); return el("div", { class: "itinerary-pop__foot" }, b); })()
    );
    popover.querySelector(".itinerary-pop__close").addEventListener("click", closePopover);
    panel.append(popover);
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    popover.style.top = `${a.top - p.top}px`;
    popover.style.left = `${Math.max(8, a.right - p.left + 48)}px`;
    setTimeout(() => document.addEventListener("pointerdown", onDocPointerDown, true), 0);
  }

  function bind(opts) {
    panel = document.getElementById("itinerary-panel");
    if (!panel) return;
    closePopover();
    ctx = { charterId: opts.charterId, charter: opts.charter || {}, siteLibrary: opts.siteLibrary || { sites: [] } };
    const itinerary = core().normalizeItinerary(opts.itinerary);
    work = { itinerary, savedJson: core().itinerarySnapshot(itinerary), baseRevision: itinerary.revision };
    guard = {
      isDirty,
      get confirmOptions() {
        return { title: "Unsaved itinerary changes", message: "Leave this panel and discard your changes?", confirmLabel: "Discard", cancelLabel: "Stay", tone: "warning" };
      }
    };
    A().setPageUnsavedGuard(guard);
    if (!resizeBound) {
      window.addEventListener("resize", () => { if (panel && panel.isConnected && work) { const days = core().deriveDays(work.itinerary, dayCount()); drawLine(days); positionEdges(days); } });
      resizeBound = true;
    }
    renderAll();
  }

  window.IolantheItinerary = Object.freeze({ render, bind });
})();
