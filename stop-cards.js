// Routes panel: the stop strip and the stop card (spec A2 §5.4–5.7, round 2 T11–T13). Every stop is a stacked edge
// either side of the open card; the card edits the stay and the departure time (Depart), shows the derived arrival,
// holds the day tabs with the itinerary items and the ⚙ settings tab. Created once per bind() by routes.js; the record
// itself stays in routes.js and is edited only through ctx.editRecord.
(function () {
  "use strict";

  const EDGE_WIDTHS = [28, 20, 14, 10, 8];   // px at a 1100-px strip; scaled up to 1.8x on wider screens (spec A2 T6)
  const EDGE_MIN = 6;
  const SWIPE_PX = 48;
  const SITES_NEAR_NM = 5;
  const KIND_LABEL = { anchorage: "anchorage", stop: "stop", plain: "plain stop" };

  // ctx: { A, core (IolantheItineraryCore), rcore (IolantheRoutesCore), el, svg, openModal, timeSelects, places,
  //        getWork(), getCharter() (null for an unassigned route), getDayCount(), getSiteLibrary(), readOnly(),
  //        editRecord(fn, opts), askDrop(dropped, verb), removeStop(stopId), panToStop(stopId), highlightStop(stopId),
  //        openStartFrom() (charter mode) , status(message, tone) }
  function create(ctx) {
    const { core: c, el, svg } = ctx;
    let host = null;          // #routes-strip
    const edgeScale = () => Math.min(1.8, Math.max(1, ((host && host.clientWidth) || 1100) / 1100));
    let selectedId = null;    // stop id of the open card
    let tab = "day";          // "day" | "settings"
    const activeDay = new Map();   // stopId → day shown
    let menu = null;          // the open add-item menu, if any

    const record = () => ctx.getWork() ? toRecord() : null;
    const toRecord = () => {
      const r = ctx.getWork().route;
      return { version: 2, route: { source: r.source || null, speed_kn: r.speed_kn, points: r.points }, activities: r.activities || [], dirty_stop_ids: r.dirty_stop_ids || [] };
    };
    const stops = (rec) => c.stopEntries(rec.route.points).map((e, i, all) => ({ point: e.point, index: e.index, n: i + 1, position: c.positionOf(i, all.length) }));
    const siteTitle = (id) => { const s = ((ctx.getSiteLibrary() || {}).sites || []).find((x) => x && x.id === id); return s && s.title ? s.title : id; };
    const dayLabel = (day) => { const ch = ctx.getCharter(); return ch && ch.start_date ? c.dayDateLabel(ch, day) : `Day ${day}`; };
    const shortDate = (day) => { const ch = ctx.getCharter(); return ch && ch.start_date ? c.dayDateLabel(ch, day).replace(/ \w+$/, "") : `Day ${day}`; };   // "Tue 13"
    const fmtHours = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`; };
    const iconBtn = (icon, title, onclick, cls, disabled) => {
      const b = el("button", { type: "button", class: `icon-btn small ${cls || ""}`.trim(), title, "aria-label": title, onclick, disabled: disabled || undefined });
      b.innerHTML = svg(icon);
      return b;
    };
    const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };

    // ---------- selection and navigation ----------

    function selectedIdOf(rec) {
      const list = stops(rec);
      if (!list.length) return null;
      if (!list.some((s) => s.point.id === selectedId)) selectedId = list[0].point.id;
      return selectedId;
    }

    // Opens a card. Spinning to a dirty card clears it (spec A2 D11, no confirm) and the map pans to the stop.
    // opts: { pan: true } pans the map; { reveal: true } also scrolls the strip into view (the Days tab, round 2 T10).
    function select(stopId, opts) {
      const rec = record();
      if (!rec || !stops(rec).some((s) => s.point.id === stopId)) return;
      const o = { pan: true, reveal: false, ...(opts || {}) };
      selectedId = stopId;
      tab = "day";
      closeMenu();
      if (rec.dirty_stop_ids.includes(stopId) && !ctx.readOnly()) {
        ctx.editRecord((r) => ({ ...r, dirty_stop_ids: r.dirty_stop_ids.filter((id) => id !== stopId) }), { history: false, map: false });
      } else {
        render();
      }
      if (o.pan) ctx.panToStop(stopId); else ctx.highlightStop(stopId);
      if (o.reveal && host && host.isConnected) host.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    function step(delta) {
      const rec = record();
      if (!rec) return;
      const list = stops(rec);
      const k = list.findIndex((s) => s.point.id === selectedIdOf(rec));
      const next = list[k + delta];
      if (next) select(next.point.id);
    }

    // ---------- the strip ----------

    function edge(stop, distance, rec, fitState) {
      const width = Math.round((EDGE_WIDTHS[distance - 1] || EDGE_MIN) * edgeScale());
      const dirty = rec.dirty_stop_ids.includes(stop.point.id);
      const good = fitState === "match" && stop.position === "terminus";
      const name = stop.point.name || "Stop";
      return el("button", {
        type: "button", class: `strip-edge${dirty ? " dirty" : ""}${good ? " good" : ""}`, style: `width:${width}px`,
        title: `${stop.n} · ${name}${dirty ? " · check this stop" : ""}`, "aria-label": `Open stop ${stop.n}, ${name}`,
        onclick: () => select(stop.point.id)
      }, el("span", { class: "strip-edge-label" }, `${stop.n} · ${name}`));
    }

    function render() {
      host = document.getElementById("routes-strip");
      const rec = record();
      if (!host || !rec) return;
      closeMenu();
      const list = stops(rec);
      if (!list.length) {
        host.replaceChildren(el("div", { class: "strip-empty" },
          el("span", { class: "empty" }, "No stops yet. Tap an anchorage in Add mode, or"),
          ctx.getCharter() && !ctx.readOnly() ? iconBtn("start", "Start from an unassigned route or another charter", () => ctx.openStartFrom()) : el("span", { class: "empty" }, " make a waypoint a stop.")));
        return;
      }
      const id = selectedIdOf(rec);
      const k = list.findIndex((s) => s.point.id === id);
      const fitState = c.fit(rec, ctx.getCharter()).state;
      const left = list.slice(0, k).map((s, i) => edge(s, k - i, rec, fitState));
      const right = list.slice(k + 1).map((s, i) => edge(s, i + 1, rec, fitState));
      const strip = el("div", { class: `strip${ctx.readOnly() ? " ro" : ""}` },
        iconBtn("prev", "Previous stop (←)", () => step(-1), "", k === 0),
        el("div", { class: "strip-edges left" }, ...left),
        card(list[k], rec),
        el("div", { class: "strip-edges right" }, ...right),
        iconBtn("next", "Next stop (→)", () => step(1), "", k === list.length - 1));
      host.replaceChildren(strip);
      if (ctx.readOnly()) strip.querySelectorAll(".stop-card input, .stop-card select, .stop-card textarea, .stop-card .edit-only").forEach((n) => { n.disabled = true; });
    }

    // ---------- the card ----------

    function card(stop, rec) {
      const p = stop.point;
      const anchorage = ctx.places && p.anchorage_id ? ctx.places.findAnchorage(p.anchorage_id) : null;
      const kind = p.anchorage_id ? (anchorage && anchorage.kind === "stop" ? "stop" : "anchorage") : "plain";
      const nights = p.arrive && p.depart ? p.depart.day - p.arrive.day : (p.depart && !p.arrive ? p.depart.day - 1 : 0);
      const stay = stop.position === "terminus" ? "end of route" : (nights ? `${nights} night${nights === 1 ? "" : "s"}` : "day stop");
      const art = el("article", { class: `stop-card${rec.dirty_stop_ids.includes(p.id) ? " dirty" : ""}`, tabindex: "0", "aria-label": `Stop ${stop.n}, ${p.name || "Stop"}`, "data-stop-id": p.id });
      art.append(
        el("header", { class: "stop-card-head" },
          el("span", { class: "stop-num" }, stop.n),
          el("div", { class: "stop-card-title" }, el("h3", {}, p.name || "Stop"), el("div", { class: "muted stop-card-sub" }, `${KIND_LABEL[kind]} · ${stay}`)),
          el("div", { class: "icon-row" },
            iconBtn("prev", "Previous stop (←)", () => step(-1), "", stop.position === "origin" || stop.position === "only"),
            iconBtn("next", "Next stop (→)", () => step(1), "", stop.position === "terminus" || stop.position === "only"),
            iconBtn("gear", "Stop settings", () => { tab = tab === "settings" ? "day" : "settings"; render(); }, tab === "settings" ? "on" : ""))),
        el("div", { class: "tiles" }, arriveTile(stop, rec), departTile(stop, rec), nextLegTile(stop, rec)),
        tab === "settings" ? settingsTab(stop, rec, kind) : dayTabs(stop, rec));
      // ← / → are handled page-wide by routes.js (spec A2 round 2 T15), so they work after a click on the map too.
      // A horizontal swipe on the header scrolls the strip (touch and mouse alike).
      const head = art.querySelector(".stop-card-head");
      head.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        const startX = e.clientX;
        const up = (ev) => { head.removeEventListener("pointerup", up); const dx = ev.clientX - startX; if (dx > SWIPE_PX) step(-1); else if (dx < -SWIPE_PX) step(1); };
        head.addEventListener("pointerup", up, { once: true });
      });
      return art;
    }

    function tile(label, value, sub, cls) {
      return el("div", { class: `tile ${cls || ""}`.trim() }, el("div", { class: "tile-k" }, label), el("div", { class: "tile-v" }, value), sub ? el("div", { class: "tile-s" }, sub) : null);
    }

    // Arrive: always derived from the previous departure and the leg (spec A2 T2); the origin shows boarding.
    function arriveTile(stop, rec) {
      const p = stop.point;
      if (stop.position === "origin" || stop.position === "only") {
        const ch = ctx.getCharter();
        return tile("Arrive", ch && ch.start_date ? c.dayDateLabel(ch, 1) : "Day 1", "boarding");
      }
      const times = c.estimateTimes(rec).get(p.id) || { arrive: null };
      const prev = stops(rec)[stop.n - 2];
      const leg = prev ? c.legSummaries(rec).get(prev.point.id) : null;
      const value = el("div", { class: "tile-row" }, el("span", { class: "est" }, times.arrive ? `~${times.arrive.time}` : "—"), el("span", {}, dayLabel(p.arrive ? p.arrive.day : 1)));
      const sub = leg ? `${leg.nm.toFixed(0)} nm · ${fmtHours(leg.hours)} from ${prev.point.name || "the previous stop"}` : "";
      return tile("Arrive", value, sub, "estimated");
    }

    // Depart (charter mode: a date no earlier than the arrival day) or Stop duration (unassigned route: a nights count),
    // with the hour/minute selects on the same line (captain, 2026-10-08). A stop with no stored time shows the T12 default with
    // "assumed" in the hint; the first stay change stores it. Spec A2 D1, §5.6, §5.7; round 2 T11, T12, T13.
    function departTile(stop, rec) {
      const p = stop.point;
      const ch = ctx.getCharter();
      const start = ch ? c.parseDateOnly(ch.start_date) : null;
      const title = start !== null ? "Depart" : "Stop duration";
      if (!p.depart) {
        return tile(title, "—", ch && ch.end_date ? `charter ends ${c.dayDateLabel(ch, c.charterDayCount(ch))}` : "end of route");
      }
      const arriveDay = p.arrive ? p.arrive.day : 1;
      const toIso = (day) => new Date(start + (day - 1) * 86400000).toISOString().slice(0, 10);
      const nights = p.depart.day - arriveDay;
      const dayInput = start !== null
        ? el("input", { type: "date", class: "tile-date edit-only", value: toIso(p.depart.day), min: toIso(arriveDay) })
        : el("input", { type: "number", class: "tile-nights edit-only", value: String(nights), min: "0", step: "1", "aria-label": "Nights at this stop" });
      const dayOf = () => {
        if (start === null) { const n = parseInt(dayInput.value, 10); return Number.isInteger(n) && n >= 0 ? arriveDay + n : NaN; }
        const t = c.parseDateOnly(dayInput.value);
        return t === null ? NaN : Math.round((t - start) / 86400000) + 1;
      };
      dayInput.addEventListener("change", async () => {
        const day = dayOf();
        if (!Number.isInteger(day) || day < arriveDay) { render(); return; }
        if (day < p.depart.day) {
          const dropped = c.droppedDays(rec, p.id, day);
          if (dropped.items.length && !(await ctx.askDrop(dropped, "Changing the date"))) { render(); return; }
        }
        ctx.editRecord((r) => c.setDeparture(r, p.id, { day }));
      });
      const assumed = !p.depart.time;
      const time = ctx.timeSelects({
        value: p.depart.time || c.defaultDepartTime(rec, p.id), cls: "edit-only",
        title: assumed ? "Assumed until you pick a time" : "Departure time",
        onChange: (v) => ctx.editRecord((r) => c.setDeparture(r, p.id, { time: v }))
      });
      const stay = stop.position === "origin" ? (nights ? `${nights} night${nights === 1 ? "" : "s"} aboard before sailing` : "sails on day 1") : (nights ? `${nights} night${nights === 1 ? "" : "s"}` : "day stop");
      const value = el("div", { class: "tile-row" }, dayInput, start === null ? el("span", { class: "muted" }, "nights") : null, time.root);
      return tile(title, value, assumed ? el("span", {}, stay, el("em", { class: "muted" }, " · assumed")) : stay);
    }

    function nextLegTile(stop, rec) {
      const leg = c.legSummaries(rec).get(stop.point.id);
      if (!leg) return el("div", { class: "tile blank" });
      const arrive = `${leg.overnight ? "overnight → " : ""}arrives ~${leg.arriveTime}${leg.overnight ? ` ${shortDate(leg.arriveDay)}` : ""}`;
      return tile("Next leg", `${leg.nm.toFixed(0)} nm · ${fmtHours(leg.hours)}`, `${arrive} · ${leg.toName}`);
    }

    // ---------- day tabs and items ----------

    function dayTabs(stop, rec) {
      const span = c.stopSpan(stop.point, stop.position, ctx.getDayCount());
      const days = [];
      for (let d = span.from; d <= span.to; d += 1) days.push(d);
      let day = activeDay.get(stop.point.id);
      if (!days.includes(day)) { day = days[0]; activeDay.set(stop.point.id, day); }
      const counts = new Map(days.map((d) => [d, rec.activities.filter((a) => a.stop_id === stop.point.id && a.day === d).length]));
      const hasDates = Boolean(ctx.getCharter() && ctx.getCharter().start_date);   // without dates the tab title already says "Day N"
      const tabs = el("div", { class: "card-tabs", role: "tablist" }, ...days.map((d) => {
        const b = el("button", { type: "button", role: "tab", class: "card-tab", "aria-selected": String(d === day), "data-day": String(d), onclick: () => { activeDay.set(stop.point.id, d); render(); } },
          el("span", { class: "card-tab-t" }, shortDate(d)), el("span", { class: "card-tab-d" }, `${hasDates ? `Day ${d} · ` : ""}${counts.get(d)} item${counts.get(d) === 1 ? "" : "s"}`));
        return b;
      }));
      return el("div", { class: "card-body" }, tabs, itemList(stop, rec, day));
    }

    function itemList(stop, rec, day) {
      const items = rec.activities.filter((a) => a.stop_id === stop.point.id && a.day === day).sort((a, b) => a.order - b.order);
      const clash = c.clashes(rec);
      const list = el("div", { class: "items", "data-stop-id": stop.point.id, "data-day": String(day) }, ...items.map((a) => itemRow(a, clash.get(a.id), stop, rec)));
      const add = el("div", { class: "items-add" },
        iconBtn("anchor", "Add an item from a site this stop serves", (e) => openAddMenu(stop, rec, day, e.currentTarget, "served"), "edit-only", !(stop.point.site_ids || []).length),
        iconBtn("search", "Add an item from any site", (e) => openAddMenu(stop, rec, day, e.currentTarget, "search"), "edit-only"),
        iconBtn("plus", "Add a free-text item", () => addItem(stop, rec, day, { title: "" }), "edit-only"),
        el("span", { class: "muted items-hint" }, items.length ? "" : "Nothing planned this day yet."));
      return el("div", { class: "day-panel" }, list, add);
    }

    // A row: coloured bar (blue site, teal free text, red clash), time, title, site, clash reason, grip, remove.
    function itemRow(a, clashReason, stop, rec) {
      const row = el("div", { class: `item${a.site_id ? " site" : " free"}${clashReason ? " clash" : ""}`, "data-activity-id": a.id, title: a.notes || "" },
        el("span", { class: "item-bar" }),
        el("span", { class: "item-time" }, a.time || "—"),
        el("span", { class: "item-title" }, a.title || (a.site_id ? siteTitle(a.site_id) : "Untitled")),
        el("span", { class: "muted item-site" }, clashReason ? "" : (a.site_id ? siteTitle(a.site_id) : "")),
        clashReason ? el("span", { class: "item-clash" }, clashReason) : null,
        el("span", { class: "item-grip edit-only", title: "Drag to reorder, or onto another day", "aria-hidden": "true" }),
        iconBtn("cancel", `Remove ${a.title || "item"}`, (e) => { e.stopPropagation(); ctx.editRecord((r) => c.removeActivity(r, a.id)); }, "quiet edit-only"));
      row.querySelector(".item-grip").innerHTML = svg("grip");
      row.addEventListener("click", (e) => { if (!ctx.readOnly() && !e.target.closest("button, .item-grip")) editItem(row, a); });
      row.querySelector(".item-grip").addEventListener("pointerdown", (e) => { if (!ctx.readOnly()) startDrag(e, a, row, stop); });
      return row;
    }

    // Inline editor: title, time, duration (minutes), notes. Enter or ✓ commits; Escape or ✕ cancels.
    function editItem(row, a) {
      closeMenu();
      const title = el("input", { type: "text", class: "edit-title", value: a.title, maxlength: String(c.MAX_TITLE_LENGTH), placeholder: "Title" });
      const time = ctx.timeSelects({ value: a.time || "", allowBlank: true, cls: "edit-time", title: "Time (blank: none)" });
      const duration = el("input", { type: "number", class: "edit-duration", value: a.duration_min === undefined ? "" : String(a.duration_min), min: String(c.MIN_DURATION_MIN), max: String(c.MAX_DURATION_MIN), step: "5", placeholder: "60", title: "Duration in minutes (1 h when blank)" });
      const notes = el("textarea", { class: "edit-notes", rows: "2", placeholder: "Notes for guests", maxlength: String(c.MAX_NOTES_LENGTH) }, a.notes || "");
      const done = () => ctx.editRecord((r) => c.updateActivity(r, a.id, { title: title.value, time: time.get(), duration_min: duration.value === "" ? "" : Number(duration.value), notes: notes.value }));
      const cancel = () => render();
      const form = el("div", { class: "item-edit" },
        el("div", { class: "item-edit-row" }, title, time.root, duration, el("span", { class: "muted" }, "min")),
        notes,
        el("div", { class: "icon-row" }, iconBtn("check", "Done (Enter)", done, "success"), iconBtn("cancel", "Cancel (Esc)", cancel, "danger")));
      [title, time.hour, time.minute, duration, notes].forEach((input) => input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        if (e.key === "Enter" && input !== notes) { e.preventDefault(); done(); }
      }));
      row.replaceChildren(form);
      row.classList.add("editing");
      title.focus();
      title.select();
    }

    function addItem(stop, rec, day, fields) {
      closeMenu();
      let added = null;
      ctx.editRecord((r) => { const next = c.addActivity(r, stop.point.id, day, fields); added = next.activities[next.activities.length - 1]; return next; });
      if (added && !fields.site_id) {
        const row = host.querySelector(`.item[data-activity-id="${added.id}"]`);
        if (row) editItem(row, added);
      }
    }

    // Add-item menu: "served" lists the stop's sites not yet on this day; "search" is a type-ahead over every site by distance.
    function openAddMenu(stop, rec, day, anchor, mode) {
      closeMenu();
      const p = stop.point;
      const onDay = new Set(rec.activities.filter((a) => a.stop_id === p.id && a.day === day && a.site_id).map((a) => a.site_id));
      const pick = (id, title) => addItem(stop, rec, day, { title, site_id: id });
      let rows;
      if (mode === "served") {
        rows = (p.site_ids || []).filter((id) => !onDay.has(id)).map((id) => el("button", { type: "button", class: "menu-item", onclick: () => pick(id, siteTitle(id)) }, siteTitle(id)));
        if (!rows.length) rows = [el("div", { class: "muted" }, "Every served site is already on this day.")];
        menu = el("div", { class: "card-menu", role: "menu" }, ...rows);
      } else {
        const all = c.sitesByDistance(ctx.getSiteLibrary(), p);
        const search = el("input", { type: "search", class: "menu-search", placeholder: "Site name…" });
        const results = el("div", { class: "menu-results" });
        const show = () => {
          const q = search.value.trim().toLowerCase();
          results.replaceChildren(...all.filter((s) => !q || s.title.toLowerCase().includes(q)).slice(0, 8).map((s) =>
            el("button", { type: "button", class: `menu-item${s.near ? " near" : ""}`, onclick: () => pick(s.id, s.title) }, `${s.title} `, el("span", { class: "muted" }, `${s.nm.toFixed(1)} nm`))));
        };
        search.addEventListener("input", show);
        show();
        menu = el("div", { class: "card-menu", role: "menu" }, search, results);
      }
      anchor.closest(".items-add").append(menu);
      setTimeout(() => document.addEventListener("pointerdown", (e) => { if (menu && !menu.contains(e.target) && e.target !== anchor) closeMenu(); }, { capture: true, once: true }), 0);
      const first = menu.querySelector("input, button");
      if (first) first.focus();
    }

    // Drag an item by its grip: within the day to reorder, or onto another Day tab to move it (pointer events, so touch works).
    function startDrag(event, a, row, stop) {
      event.preventDefault();
      const grip = event.currentTarget;
      grip.setPointerCapture(event.pointerId);
      const ghost = row.cloneNode(true);
      ghost.classList.add("ghost");
      ghost.style.width = `${row.offsetWidth}px`;
      document.body.append(ghost);
      row.classList.add("source");
      let target = null;   // { day, index }
      const clear = () => host.querySelectorAll(".card-tab.over, .items.over").forEach((n) => n.classList.remove("over"));
      const locate = (e) => {
        ghost.style.left = `${e.clientX + 8}px`;
        ghost.style.top = `${e.clientY - 10}px`;
        ghost.style.display = "none";
        const under = document.elementFromPoint(e.clientX, e.clientY);
        ghost.style.display = "";
        clear();
        const tabEl = under && under.closest ? under.closest(".card-tab") : null;
        const list = under && under.closest ? under.closest(".items") : null;
        if (tabEl) { tabEl.classList.add("over"); target = { day: Number(tabEl.dataset.day), index: undefined }; return; }
        if (list) {
          const rows = [...list.querySelectorAll(".item")].filter((r) => r !== row);
          const index = rows.filter((r) => { const b = r.getBoundingClientRect(); return e.clientY > b.top + b.height / 2; }).length;
          list.classList.add("over");
          target = { day: Number(list.dataset.day), index };
          return;
        }
        target = null;
      };
      const finish = () => {
        grip.removeEventListener("pointermove", locate);
        grip.removeEventListener("pointerup", finish);
        grip.removeEventListener("pointercancel", finish);
        ghost.remove();
        row.classList.remove("source");
        clear();
        if (!target) return;
        if (target.day !== a.day) activeDay.set(stop.point.id, target.day);
        ctx.editRecord((r) => c.moveActivity(r, a.id, stop.point.id, target.day, target.index));
      };
      grip.addEventListener("pointermove", locate);
      grip.addEventListener("pointerup", finish);
      grip.addEventListener("pointercancel", finish);
    }

    // ---------- ⚙ settings tab ----------

    function settingsTab(stop, rec, kind) {
      const p = stop.point;
      const name = el("input", { type: "text", value: p.name || "", maxlength: String(c.MAX_TITLE_LENGTH), placeholder: "Stop name" });
      name.addEventListener("change", () => ctx.editRecord((r) => ({ ...r, route: { ...r.route, points: r.route.points.map((q) => (c.isStop(q) && q.id === p.id ? { ...q, name: name.value.trim() || undefined } : q)) } }), { map: true }));

      const sites = c.sitesByDistance(ctx.getSiteLibrary(), p);
      const served = new Set(p.site_ids || []);
      const siteRows = sites.filter((s) => s.near || served.has(s.id)).map((s) => {
        const cb = el("input", { type: "checkbox", checked: served.has(s.id) || undefined });
        cb.addEventListener("change", async () => {
          const ids = cb.checked ? [...(p.site_ids || []), s.id] : (p.site_ids || []).filter((x) => x !== s.id);
          if (!cb.checked && rec.activities.some((a) => a.stop_id === p.id && a.site_id === s.id)) {
            const ok = await ctx.A.showAdminConfirm({ title: "Remove site", message: `Items at ${s.title} on this stop will be removed too.`, confirmLabel: "Remove", cancelLabel: "Keep", tone: "warning" });
            if (!ok) { cb.checked = true; return; }
          }
          ctx.editRecord((r) => c.setStopSites(r, p.id, ids), { map: true });
        });
        return el("label", { class: `site-row${s.near ? " near" : ""}` }, cb, ` ${s.title} `, el("span", { class: "muted d" }, `${s.nm.toFixed(1)} nm`));
      });
      const far = sites.filter((s) => !s.near && !served.has(s.id));
      const more = far.length ? el("details", { class: "site-more" }, el("summary", { class: "muted" }, `${far.length} further away`), ...far.map((s) => {
        const cb = el("input", { type: "checkbox" });
        cb.addEventListener("change", () => ctx.editRecord((r) => c.setStopSites(r, p.id, [...(p.site_ids || []), s.id]), { map: true }));
        return el("label", { class: "site-row" }, cb, ` ${s.title} `, el("span", { class: "muted d" }, `${s.nm.toFixed(1)} nm`));
      })) : null;

      const speed = stop.position !== "terminus" && stop.position !== "only" ? (() => {
        const input = el("input", { type: "number", min: "0.5", max: "30", step: "0.5", value: p.leg_speed_kn ? String(p.leg_speed_kn) : "", placeholder: String(rec.route.speed_kn || c.DEFAULT_SPEED_KN), title: "Speed for the leg leaving this stop; blank uses the route speed" });
        input.addEventListener("change", () => {
          const v = input.value === "" ? 0 : parseFloat(input.value);
          if (input.value !== "" && !(v > 0 && v <= 30)) { ctx.status("Enter a speed between 0.5 and 30 kn.", "error"); input.value = p.leg_speed_kn || ""; return; }
          ctx.editRecord((r) => c.recomputeArrivals({ ...r, route: { ...r.route, points: ctx.rcore.setLegSpeed(r.route.points, stop.index, v) } }), { map: true });
        });
        return el("div", { class: "field" }, el("label", {}, "Next leg speed"), el("div", { class: "tile-row" }, input, el("span", { class: "muted" }, "kn")));
      })() : null;

      const global = kind !== "anchorage" ? (() => {
        const cb = el("input", { type: "checkbox", checked: kind === "stop" || undefined, class: "edit-only" });
        cb.addEventListener("change", async () => {
          if (cb.checked) {
            const saved = await ctx.places.createStop(p);
            if (!saved) { cb.checked = false; return; }
            ctx.editRecord((r) => ({ ...r, route: { ...r.route, points: r.route.points.map((q) => (c.isStop(q) && q.id === p.id ? { ...q, anchorage_id: saved.id, stop: undefined } : q)) } }), { map: true });
          } else {
            ctx.editRecord((r) => ({ ...r, route: { ...r.route, points: r.route.points.map((q) => (c.isStop(q) && q.id === p.id ? { ...q, anchorage_id: undefined, stop: true } : q)) } }), { map: true });
          }
        });
        return el("label", { class: "switch-row" }, cb, el("span", {}, "Global stop"), el("span", { class: "muted" }, kind === "stop" ? "shown on every route map" : "save it to the library so every route map shows it"));
      })() : null;

      const remove = el("button", { type: "button", class: "text-btn danger-text edit-only", onclick: () => ctx.removeStop(p.id) }, "Remove stop");
      return el("div", { class: "card-body settings" },
        el("div", { class: "field" }, el("label", {}, "Name"), name),
        el("div", { class: "field" }, el("label", {}, "Sites served"), el("div", { class: "site-pick" }, ...(siteRows.length ? siteRows : [el("div", { class: "muted" }, `No sites within ${SITES_NEAR_NM} nm`)]), more)),
        speed,
        global,
        el("div", { class: "settings-foot" }, remove, el("span", { class: "muted" }, "The point stays as a waypoint; its items go.")));
    }

    return { render, select, step, selectedId: () => selectedId, destroy: closeMenu };
  }

  window.IolantheStopCards = Object.freeze({ create });
})();
