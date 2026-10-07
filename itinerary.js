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
        </div>
        <div class="itinerary-panel__welcome" id="itinerary-welcome"></div>
        <div class="itinerary-panel__hint muted" id="itinerary-hint" hidden></div>
        <div class="itinerary-board" id="itinerary-board">
          <div class="itinerary-board__titles" id="itinerary-titles"></div>
          <svg class="itinerary-board__line" id="itinerary-line" aria-hidden="true"></svg>
          <div class="itinerary-board__days" id="itinerary-days"></div>
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
    actions.replaceChildren(
      el("button", { type: "button", class: "itinerary-action", "data-action": "edit-route", disabled: "" }, "Edit route"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "apply-route", disabled: "" }, "Apply library route…"),
      el("button", { type: "button", class: "itinerary-action", "data-action": "promote", disabled: "" }, "Promote to library…")
    );
    // The buttons are enabled by plan 3 (Save, Apply, Promote) and plan 4 (Edit route).
  }

  function renderWelcome() {
    const box = panel.querySelector("#itinerary-welcome");
    const text = work.itinerary.welcome_message;
    box.replaceChildren(
      el("div", { class: "itinerary-welcome__label label" }, "Welcome message"),
      el("div", { class: `itinerary-welcome__text${text ? "" : " muted"}` }, text || "No welcome message yet.")
    );
  }

  function activityRow(activity) {
    const firstLine = (activity.notes || "").split("\n")[0];
    return el("div", { class: `itinerary-activity${activity.site_id ? " itinerary-activity--site" : " itinerary-activity--free"}`, "data-activity-id": activity.id },
      el("span", { class: "itinerary-activity__grip", "aria-hidden": "true" }, "⋮⋮"),
      el("span", { class: "itinerary-activity__title" }, activity.title || (activity.site_id ? siteTitle(activity.site_id) : "Untitled")),
      activity.time ? el("span", { class: "itinerary-activity__time" }, activity.time) : null,
      firstLine ? el("span", { class: "itinerary-activity__notes muted" }, firstLine) : null
    );
  }

  function subBox(stop, day) {
    return el("div", { class: "itinerary-sub", "data-stop-id": stop.id, "data-day": String(day) },
      el("div", { class: "itinerary-sub__gutter" },
        el("button", { type: "button", class: "itinerary-sub__add", title: `Add a site or activity at ${stop.name}`, disabled: "" }, "+")),
      el("div", { class: "itinerary-sub__activities" }, ...stop.activities.map(activityRow))
    );
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

  function renderAll() {
    renderHeader();
    renderWelcome();
    const days = renderDays();
    requestAnimationFrame(() => drawLine(days));
  }

  // Filled in by Task 5.
  function drawLine() {}

  function bind(opts) {
    panel = document.getElementById("itinerary-panel");
    if (!panel) return;
    ctx = { charterId: opts.charterId, charter: opts.charter || {}, siteLibrary: opts.siteLibrary || { sites: [] } };
    const itinerary = core().normalizeItinerary(opts.itinerary);
    work = { itinerary, savedJson: core().itinerarySnapshot(itinerary), baseRevision: itinerary.revision };
    if (!resizeBound) {
      window.addEventListener("resize", () => { if (panel && panel.isConnected && work) drawLine(core().deriveDays(work.itinerary, dayCount())); });
      resizeBound = true;
    }
    renderAll();
  }

  window.IolantheItinerary = Object.freeze({ render, bind });
})();
