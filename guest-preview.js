// The Guest view panel (Charter → Guest view, charter rework spec B §3): the live guest site in a same-origin iframe
// loaded with ?preview=<date>&charter=<id>, under a date slider. The guest does the rendering; this file only picks the
// date and the device size. Pure logic in guest-preview-core.js. admin.js calls render() then bind(ctx).
(function () {
  "use strict";

  const core = () => window.IolantheGuestPreviewCore;
  const DEVICE_KEY = "iolanthe-admin.preview.device";
  const DRAG_APPLY_MS = 250;
  const STAGE_MARGIN_PX = 32;
  const ICONS = {
    prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    today: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>',
    reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    open: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    tablet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M11 18h2"/>',
    pc: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>'
  };
  const chosenDate = new Map();   // charterId → the date last shown, for this admin session only
  let teardown = null;            // removes the previous bind's window listeners and observer

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
    const b = el("button", { type: "button", class: "gp-btn", title, "aria-label": title, onclick, ...(extra || {}) });
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
    return b;
  }

  function loadDevice() {
    try {
      const stored = localStorage.getItem(DEVICE_KEY);
      return core().DEVICES[stored] ? stored : "phone";
    } catch (e) { return "phone"; }
  }
  function storeDevice(device) {
    try { localStorage.setItem(DEVICE_KEY, device); } catch (e) { /* per-browser convenience only */ }
  }

  function render() {
    return '<section class="card full guest-preview" id="guest-preview"></section>';
  }

  function destroy() {
    if (teardown) teardown();
    teardown = null;
  }

  // ctx: { charterId, charter, points, pill: { tone, text }, today: "YYYY-MM-DD", focusDay: n | 0, onOpenInfo(),
  //        initialTab: the guest tab a fresh frame opens on (Charter: itinerary, Galley: menu, Hotel: drinks) }
  function bind(ctx) {
    destroy();
    const host = document.getElementById("guest-preview");
    if (!host) return;
    const steps = core().previewSteps(ctx.charter, ctx.points);
    const title = el("h2", {}, "Guest view");
    const pill = el("span", { class: `status-pill status-pill--${ctx.pill.tone}` }, ctx.pill.text);
    if (!steps.length) {
      host.replaceChildren(
        el("div", { class: "card-header" }, title, pill),
        el("div", { class: "gp-empty" },
          el("p", {}, "Set the charter dates on Charter Admin to preview the guest view."),
          el("button", { type: "button", class: "gp-text-btn", onclick: () => ctx.onOpenInfo() }, "Charter Admin")));
      return;
    }

    const todayIndex = core().stepIndexForDate(steps, ctx.today);
    let index = pickIndex(steps, ctx);
    let device = loadDevice();
    let dragTimer = 0;
    let dragging = false;

    const frame = el("iframe", { class: "gp-frame", title: "Guest view preview" });
    const deviceBox = el("div", { class: "gp-device" }, frame);
    const stage = el("div", { class: "gp-stage" }, deviceBox);
    const readDate = el("b", {});
    const readSub = el("span", {});
    const ticks = steps.map((s) => el("span", {
      class: `gp-tick gp-tick--${s.kind}${s.date < ctx.today ? " gp-tick--past" : ""}${s.date === ctx.today ? " gp-tick--today" : ""}`,
      title: `${s.label} · ${s.sub}`
    }, el("span", { class: "gp-tick-d" }, s.label.split(" ")[1]), el("span", { class: "gp-tick-w" }, s.kind === "day" ? s.label.split(" ")[0] : s.kind)));
    const track = el("div", { class: "gp-track", role: "slider", tabindex: "0", "aria-label": "Preview date", "aria-valuemin": "0", "aria-valuemax": String(steps.length - 1) }, ...ticks);
    const prevBtn = iconBtn("prev", "Previous day", () => go(index - 1, true));
    const nextBtn = iconBtn("next", "Next day", () => go(index + 1, true));
    const todayBtn = iconBtn("today", todayIndex >= 0 ? "Jump to today" : "Today is outside this charter", () => go(todayIndex, true), { disabled: todayIndex < 0 });
    const DEVICE_TITLES = { phone: "Phone", tablet: "Tablet", pc: "PC" };
    const deviceBtns = Object.keys(DEVICE_TITLES).map((d) => iconBtn(d, DEVICE_TITLES[d], () => setDevice(d), { "data-device": d }));

    host.replaceChildren(
      el("div", { class: "card-header" }, title, pill,
        el("div", { class: "gp-actions" },
          el("div", { class: "gp-seg", role: "group", "aria-label": "Device" }, ...deviceBtns),
          el("span", { class: "gp-sep" }),
          iconBtn("reload", "Reload", reload),
          iconBtn("open", "Open full screen in a new tab", () => window.open(currentUrl(), "_blank", "noopener")))),
      // The title sits on its own line above the slider, so its changing length never moves the track (David, 2026-10-08).
      el("div", { class: "gp-strip" }, el("div", { class: "gp-readout" }, readDate, readSub), el("div", { class: "gp-slide" }, prevBtn, track, nextBtn, todayBtn)),
      stage);

    function currentHash() {
      try { return frame.contentWindow ? frame.contentWindow.location.hash : ""; } catch (e) { return ""; }
    }
    function currentUrl() {
      return core().previewUrl({ date: steps[index].date, charterId: ctx.charterId, hash: currentHash() || ctx.initialTab || "" });
    }
    function apply() {
      window.clearTimeout(dragTimer);
      frame.src = currentUrl();
    }
    function reload() {
      try { frame.contentWindow.location.reload(); } catch (e) { apply(); }
    }
    function go(i, now) {
      const next = Math.max(0, Math.min(steps.length - 1, i));
      const changed = next !== index;
      index = next;
      paintStep();
      chosenDate.set(ctx.charterId, steps[index].date);
      if (now) { if (changed || !frame.getAttribute("src")) apply(); return; }
      window.clearTimeout(dragTimer);
      dragTimer = window.setTimeout(apply, DRAG_APPLY_MS);
    }
    function paintStep() {
      const s = steps[index];
      readDate.textContent = s.label;
      readSub.textContent = s.sub;
      ticks.forEach((t, i) => t.classList.toggle("on", i === index));
      track.setAttribute("aria-valuenow", String(index));
      track.setAttribute("aria-valuetext", `${s.label} · ${s.sub}`);
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === steps.length - 1;
    }
    function nearestTick(clientX) {
      let best = 0;
      let bestDist = Infinity;
      ticks.forEach((t, i) => {
        const r = t.getBoundingClientRect();
        const dist = Math.abs(clientX - (r.left + r.width / 2));
        if (dist < bestDist) { best = i; bestDist = dist; }
      });
      return best;
    }
    function setDevice(d) {
      device = d;
      storeDevice(d);
      deviceBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.device === d)));
      deviceBox.classList.toggle("gp-device--pc", d === "pc");
      fit();
    }
    function fit() {
      if (!host.isConnected) { destroy(); return; }
      const size = core().DEVICES[device];
      const k = core().fitScale(device, stage.clientWidth, window.innerHeight - STAGE_MARGIN_PX);
      frame.style.width = `${size.w}px`;
      frame.style.height = `${size.h}px`;
      frame.style.transform = `scale(${k})`;
      deviceBox.style.width = `${Math.round(size.w * k)}px`;
      deviceBox.style.height = `${Math.round(size.h * k)}px`;
    }

    // Slider: press anywhere on the track to pick the nearest day, drag to scrub (applied after a short pause), release
    // to apply. Selection happens on pointerdown, not click, so pointer capture cannot swallow it.
    track.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;   // left button / touch / pen only
      dragging = true;
      track.setPointerCapture(e.pointerId);
      go(nearestTick(e.clientX), false);
    });
    track.addEventListener("pointermove", (e) => { if (dragging) go(nearestTick(e.clientX), false); });
    const endDrag = () => { if (dragging) { dragging = false; apply(); } };
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    track.addEventListener("lostpointercapture", endDrag);
    track.addEventListener("keydown", (e) => {
      const moves = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: steps.length - 1 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      e.stopPropagation();
      go(moves[e.key], true);
    });

    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    if (observer) observer.observe(stage);
    window.addEventListener("resize", fit);
    teardown = () => {
      window.clearTimeout(dragTimer);
      if (observer) observer.disconnect();
      window.removeEventListener("resize", fit);
    };

    setDevice(device);
    paintStep();
    go(index, true);
  }

  function pickIndex(steps, ctx) {
    const c = core();
    if (ctx.focusDay) {
      const i = c.stepIndexForDay(steps, ctx.focusDay);
      if (i >= 0) return i;
    }
    const remembered = c.stepIndexForDate(steps, chosenDate.get(ctx.charterId));
    return remembered >= 0 ? remembered : c.defaultStepIndex(steps, ctx.today);
  }

  window.IolantheGuestPreviewPanel = Object.freeze({ render, bind, destroy });
})();
