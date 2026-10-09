# Spec P — Plan 3: Admin page (Charter → Charter Pack)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Charter Pack page of [spec-pack.md](../spec-pack.md) §1–§3 and §6: settings card, A4 preview with a pager,
the three themes and the branding layers, the route map, preset auto-save, cover upload, and Save as PDF.

**Architecture:** `charter-pack.js` (a `window.IolantheCharterPack` module with `render()` / `bind(ctx)` / `destroy()`,
like `guest-preview.js`) loads `/api/charter?charter=<id>` and the preset, builds the model with `pack-core.js`, renders
with `pack-render.js`, and lays each section's blocks onto real 210 × 297 mm pages: a block that overflows its page's
flow box starts a "continued" page. Pages are scaled to the preview column with a CSS transform; pages other than the
current one sit off-screen at full size, so the Leaflet map can size itself and the pagination can measure. The map is
built once and moved into each redraw's new slot. Save as PDF clones the pages into `#pack-print-host` in `<body>`, and
`charter-pack.css`'s print rules hide everything else and set `@page { size: A4; margin: 0 }`. `admin.js` gets the menu
entry, the render/bind calls, a `destroy()` on repaint (flushes a pending save) and exports `apiUrl` (the cover `<img>`
needs `?key=`).

**Tech Stack:** plain JS/CSS, Leaflet via `IolantheAdmin.loadLeaflet()`, Esri `World_Light_Gray_Base` tiles. Needs plan
P-2 committed in the same worktree and plan P-1's server for the browser pass.

**Dry-run (done while planning):** the files and replacements below were applied to a copy of admin `main` at `e108e7e`
(with P-2) and served by plan P-1's dry-run server on a scratch data copy: `node --check` clean on all four JS files,
`node --test` 168/168; in the browser, csaba gave 7 pages (cover, summary, route, route continued, crew, crew continued,
menus) with no flow overflowing, the map loaded and merged the three Busuanga stops, themes A/B/C rendered, typing
Prepared for / the note updated the cover and footer, an upload through the file input saved and showed the new cover,
unticking down to one section locked the last box, the print copy held exactly the visible pages and was removed on
`afterprint`, and a reload restored the preset. A real Save as PDF was **not** run (it opens the print dialog) — that is
Task 6's job.

**Shared checkout hazard:** another Claude session may work in the same checkouts. **Never** run `git checkout`,
`git switch`, `git stash` or `git add -A` in the main checkouts under `S:/Users/David/OneDrive/Maker Space/GitHub`. All
work happens in the worktree made in Task 0. Stage files by name. Before each task, run
`git -C <worktree> branch --show-current` and expect `feat/charter-pack`.

**Reading before you start:** `guest-preview.js` (the module shape this copies), `guest-preview.css` (`.gp-btn`),
`admin.css` `.segmented` and `.form-section` (~162–290), `admin.js` `renderCharter` (~6611), `charterPanelContent` /
`bindCharterPanel` (~6524–6575), `loadLeaflet` (~5229), `window.IolantheAdmin` (~13876).

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `assets/pack/` | Task 1: check `hero-default.jpg`, `stamp.png`, `vessel-line-art.png` are present |
| `charter-pack.css` (new) | Task 2: page layout, themes A/B/C, branding layers, cover, blocks, print rules |
| `charter-pack.js` (new) | Task 3: the page — settings, preview, pagination, map, saving, upload, print |
| `admin.js`, `index.html` | Task 4: menu entry, render/bind/destroy, `apiUrl` export, the new files, `?v=` bump |
| `CLAUDE.md` | Task 5: the new files and the menu |

---

### Task 1: Assets

- [ ] **Step 1:** `ls assets/pack` → `hero-default.jpg  stamp.png  vessel-line-art.png` (about 301 KB, 98 KB, 104 KB).
  They are committed already (from the spec PR): the default hero is a placeholder from the Zenith Superyachts photos
  (1600 × 900) until David supplies his own, the stamp is David's (484 × 484), the line art is the guest repo's. Nothing
  to commit.

---

### Task 2: `charter-pack.css`

**Files:** create `charter-pack.css`

- [ ] **Step 1: Create the file:**

```css
/* The Charter Pack page (charter rework spec P): the settings card, the A4 page preview, the pack pages and their three
   themes, and the print rules. Pages are real A4 boxes (210 × 297 mm), scaled down to fit the preview. */

/* ---- the admin page -------------------------------------------------------------------------------------------- */
.charter-pack .card-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.charter-pack .cp-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.charter-pack .cp-sep { width: 1px; height: 24px; background: var(--line); }
.charter-pack .cp-page-no { min-width: 48px; text-align: center; font-variant-numeric: tabular-nums; color: var(--muted); font-size: 13px; }
.charter-pack .cp-map-hint { color: var(--muted); font-size: 13px; }
.charter-pack .cp-btn {
  width: 36px; height: 36px; min-height: 0; padding: 0; border: 0; border-radius: 6px;
  display: inline-grid; place-items: center; background: #e8eef0; color: var(--ink); cursor: pointer;
}
.charter-pack .cp-btn:hover, .charter-pack .cp-btn:focus-visible { background: #d8e2e5; }
.charter-pack .cp-btn:disabled { opacity: .35; cursor: not-allowed; }
.charter-pack .cp-btn svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.charter-pack .cp-layout { display: grid; grid-template-columns: minmax(260px, 320px) minmax(0, 1fr); gap: 16px; margin-top: 12px; align-items: start; }
.charter-pack .cp-settings { display: grid; gap: 12px; min-width: 0; }
.charter-pack .cp-settings .segmented { flex-wrap: wrap; }
.charter-pack .cp-settings label:not(.inline-check) { display: grid; gap: 4px; }
.charter-pack .cp-settings input[type="text"], .charter-pack .cp-settings textarea { width: 100%; box-sizing: border-box; font: inherit; text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--ink); }
.charter-pack .cp-settings .inline-check { display: flex; align-items: center; gap: 8px; }
.charter-pack .cp-cover-row { display: flex; align-items: center; gap: 8px; }
.charter-pack .cp-cover-thumb { width: 96px; height: 54px; object-fit: cover; border-radius: 4px; border: 1px solid var(--line); background: #e8eef0; }
.charter-pack .cp-stage { position: relative; min-width: 0; max-width: 100%; overflow: hidden; }
.charter-pack .cp-scaler { transform-origin: top left; width: 210mm; }
.charter-pack .cp-scaler .pack-page { box-shadow: 0 6px 20px rgba(16, 32, 40, .18); }
.charter-pack .cp-scaler .pack-page:not(.is-current) { position: absolute; left: -30000px; top: 0; }
@media (max-width: 900px) {
  .charter-pack .cp-layout { grid-template-columns: minmax(0, 1fr); }
}

/* ---- themes (P-D6): one page structure, colours and type change ------------------------------------------------ */
.pack-theme-a { --pack-paper: #f8f4ec; --pack-ink: #081826; --pack-muted: #7a6a48; --pack-tint: #c8a96b; --pack-accent: #a88a4c; --pack-font: Georgia, "Times New Roman", serif; --pack-cover-bg: #081826; --pack-cover-ink: #f4ead7; }
.pack-theme-b { --pack-paper: #ffffff; --pack-ink: #172026; --pack-muted: #5f6b73; --pack-tint: #176f7a; --pack-accent: #176f7a; --pack-font: Arial, Helvetica, sans-serif; --pack-cover-bg: #ffffff; --pack-cover-ink: #172026; }
.pack-theme-c { --pack-paper: #fbf8f1; --pack-ink: #0f2d4a; --pack-muted: #6b5a35; --pack-tint: #0f2d4a; --pack-accent: #8a6d2f; --pack-font: "Times New Roman", Times, serif; --pack-cover-bg: #fbf8f1; --pack-cover-ink: #0f2d4a; }

/* ---- a page ---------------------------------------------------------------------------------------------------- */
.pack-page {
  position: relative; width: 210mm; height: 297mm; overflow: hidden; box-sizing: border-box;
  background: var(--pack-paper); color: var(--pack-ink); font-family: var(--pack-font); font-size: 10pt; line-height: 1.4;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.pack-page * { box-sizing: border-box; }
.pack-wm { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
.pack-wm text { font-family: "Times New Roman", Times, serif; font-size: 44px; fill: var(--pack-tint); opacity: .05; }
.pack-lineart {
  position: absolute; right: 8mm; bottom: 11mm; width: 105mm; aspect-ratio: 2264 / 656; z-index: 0; pointer-events: none;
  background: var(--pack-tint); opacity: .2;
  -webkit-mask: url(/admin/assets/pack/vessel-line-art.png) center / contain no-repeat;
  mask: url(/admin/assets/pack/vessel-line-art.png) center / contain no-repeat;
}
.pack-body { position: absolute; inset: 14mm 14mm 16mm 16mm; z-index: 1; display: flex; flex-direction: column; }
.pack-flow { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 4mm; }
.pack-foot { position: absolute; left: 16mm; right: 14mm; bottom: 7mm; z-index: 1; display: flex; justify-content: space-between; gap: 6mm; font-size: 7.5pt; color: var(--pack-muted); }
.pack-section-head { margin-bottom: 5mm; }
.pack-section-head h2 { margin: 0; font-size: 18pt; font-weight: normal; padding-bottom: 2mm; border-bottom: 1px solid var(--pack-tint); }
.pack-section-head h2 span { font-size: 9pt; color: var(--pack-muted); letter-spacing: .08em; text-transform: uppercase; }
.pack-block { flex: none; }
.pack-block h3 { margin: 0 0 1.5mm; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; color: var(--pack-accent); font-weight: bold; }
.pack-block h4 { margin: 0 0 1mm; font-size: 9pt; color: var(--pack-accent); }
.pack-block ul { margin: 0; padding-left: 4.5mm; }
.pack-block li { margin: .6mm 0; }
.pack-block li span { color: var(--pack-muted); }

/* summary */
.pack-facts { display: grid; grid-template-columns: 34mm 1fr; gap: 2mm 6mm; margin: 0; }
.pack-facts dt { color: var(--pack-accent); text-transform: uppercase; letter-spacing: .1em; font-size: 8pt; padding-top: .6mm; }
.pack-facts dd { margin: 0; }
.pack-welcome p { margin: 0; font-size: 11pt; font-style: italic; }

/* route */
.pack-map { width: 100%; height: 90mm; border: 1px solid var(--pack-tint); background: #e9edee; }
.pack-map .leaflet-control-attribution { font-size: 6pt; background: rgba(255, 255, 255, .7); }
.pack-map-failed { margin: 0; padding: 6mm; border: 1px dashed var(--pack-tint); color: var(--pack-muted); }
.pack-key { columns: 2; column-gap: 8mm; margin: 2.5mm 0 0; padding-left: 0; list-style: none; font-size: 8.5pt; }
.pack-marker span {
  position: relative; left: 0; top: 0; transform: translate(-50%, -50%); display: inline-block; white-space: nowrap;
  padding: 1px 5px; border-radius: 9px; background: var(--pack-tint); color: #fff; border: 1.5px solid #fff;
  font: bold 9px/1.3 Arial, Helvetica, sans-serif; box-shadow: 0 1px 3px rgba(0, 0, 0, .35);
}
.pack-day { border-top: 1px solid var(--pack-tint); padding-top: 1.5mm; }
.pack-day-head { display: flex; gap: 4mm; align-items: baseline; margin-bottom: 1mm; }
.pack-day-head b { color: var(--pack-accent); font-weight: normal; font-size: 11pt; }
.pack-day-head span { color: var(--pack-muted); font-size: 8.5pt; }
.pack-stop { margin: 0 0 1.5mm 2mm; }
.pack-stop-name { font-weight: bold; }
.pack-times { font-weight: normal; color: var(--pack-muted); font-size: 8.5pt; }

/* crew & yacht */
.pack-specs { display: grid; grid-template-columns: 40mm 1fr; gap: 1mm 6mm; margin: 0; }
.pack-specs dt { color: var(--pack-muted); }
.pack-specs dd { margin: 0; }
.pack-crew-group ul { list-style: none; padding-left: 0; columns: 2; column-gap: 8mm; }

/* menus & drinks */
.pack-menu-day { border-top: 1px solid var(--pack-tint); padding-top: 1.5mm; }
.pack-course { margin: 1mm 0 1.5mm 2mm; }
.pack-subhead { margin-top: 2mm !important; }

/* ---- the cover ------------------------------------------------------------------------------------------------- */
.pack-page--cover { background: var(--pack-cover-bg); color: var(--pack-cover-ink); }
.pack-cover { position: absolute; inset: 0; display: flex; flex-direction: column; }
.pack-cover-photo { display: block; width: 100%; height: 58%; object-fit: cover; }
.pack-cover-text { flex: 1; display: flex; flex-direction: column; gap: 2.5mm; padding: 12mm 16mm 14mm; }
.pack-kicker { font-size: 8pt; letter-spacing: .24em; text-transform: uppercase; color: var(--pack-tint); }
.pack-ornament { display: none; }
.pack-title { margin: 0; font-size: 26pt; font-weight: normal; line-height: 1.15; }
.pack-rule { width: 20mm; height: 1px; background: var(--pack-tint); margin: 1mm 0; }
.pack-route, .pack-dates { margin: 0; font-size: 12pt; }
.pack-stats { display: none; }
.pack-cover-foot { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; }
.pack-for { display: grid; gap: 1mm; max-width: 120mm; }
.pack-for-label { font-size: 8pt; letter-spacing: .18em; text-transform: uppercase; color: var(--pack-tint); }
.pack-for-name { font-size: 13pt; }
.pack-note { margin: 2mm 0 0; font-size: 9.5pt; font-style: italic; }
.pack-stamp { width: 32mm; height: 32mm; flex: none; }
/* A: navy cover, so the black stamp is inverted to cream (full contrast, P-D9) */
.pack-theme-a .pack-stamp { filter: invert(93%) sepia(18%) saturate(300%) hue-rotate(5deg); }
/* B: smaller photo, sans-serif title, stat tiles */
.pack-theme-b .pack-cover-photo { height: 48%; }
.pack-theme-b .pack-title { font-weight: bold; font-size: 24pt; }
.pack-theme-b .pack-kicker { align-self: flex-start; padding: 1mm 3mm; border-radius: 10px; background: var(--pack-tint); color: #fff; letter-spacing: .12em; }
.pack-theme-b .pack-stats { display: grid; grid-template-columns: repeat(3, 30mm); gap: 3mm; margin-top: 3mm; }
.pack-theme-b .pack-stats div { border: 1px solid #d7dde1; border-radius: 4px; padding: 2mm; text-align: center; color: var(--pack-muted); font-size: 8pt; }
.pack-theme-b .pack-stats b { display: block; font-size: 16pt; color: var(--pack-tint); }
/* C: the guest's paper look — inset photo, centred serif, gold ornament */
.pack-theme-c .pack-cover-photo { width: auto; height: 45%; margin: 16mm 16mm 0; border: 1px solid #d4b06a; }
.pack-theme-c .pack-cover-text { align-items: center; text-align: center; }
.pack-theme-c .pack-ornament { display: block; color: #d4b06a; font-size: 14pt; }
.pack-theme-c .pack-title { letter-spacing: .04em; }
.pack-theme-c .pack-rule { background: #d4b06a; }
.pack-theme-c .pack-cover-foot { width: 100%; text-align: left; }
.pack-theme-c .pack-day, .pack-theme-c .pack-menu-day { border-top-style: dotted; }

/* ---- printing (Save as PDF): only the copy in #pack-print-host prints ------------------------------------------ */
#pack-print-host { display: none; }
@media print {
  @page { size: A4; margin: 0; }
  body.pack-printing { margin: 0 !important; padding: 0 !important; background: #fff !important; min-height: 0 !important; }
  body.pack-printing > *:not(#pack-print-host) { display: none !important; }
  body.pack-printing #pack-print-host { display: block; }
  #pack-print-host .pack-page { position: relative !important; left: auto !important; box-shadow: none !important; margin: 0 !important; break-after: page; }
  #pack-print-host .pack-page:last-child { break-after: auto; }
}
```

- [ ] **Step 2: Commit.**

```bash
git add charter-pack.css
git commit -m "feat(pack): charter-pack.css, the pack pages, themes and print rules"
```

---

### Task 3: `charter-pack.js`

**Files:** create `charter-pack.js`

- [ ] **Step 1: Create the file:**

```js
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

  function removePrintHost() {
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

    // Lays each section's blocks onto A4 pages: a block that overflows its page starts the next ("continued") page.
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
          if (flow.scrollHeight > flow.clientHeight + 1 && flow.children.length > 1) {
            const moved = flow.lastElementChild;
            flow = newPage(section.title, true);
            flow.append(moved);
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

    function mapFailed(slot) {
      dropMap();
      if (slot && slot.isConnected) slot.replaceWith(el("p", { class: "pack-map-failed" }, "Map couldn't load — the route is listed below."));
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
      // "load" fires once every tile in view has finished, failed tiles included; no network at all is the timeout.
      const tiles = L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 16 });
      tiles.once("load", () => { window.clearTimeout(mapTimer); if (alive) setMapReady(true); });
      tiles.addTo(map);
      mapTimer = window.setTimeout(() => { if (!mapReady) mapFailed(mapBox); }, MAP_TIMEOUT_MS);
    }

    // ---- saving ------------------------------------------------------------------------------------------------
    async function save() {
      window.clearTimeout(saveTimer);
      saveTimer = 0;
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
    // Prints a copy of the pages placed straight in <body>; charter-pack.css hides everything else while printing.
    function printPack() {
      if (!mapReady) return;
      removePrintHost();
      const printHost = el("div", { id: "pack-print-host", class: `pack-theme-${pack.theme}` }, ...pages().map((p) => p.cloneNode(true)));
      document.body.append(printHost);
      document.body.classList.add("pack-printing");
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
```

- [ ] **Step 2: Check.** `node --check charter-pack.js` (no output).

- [ ] **Step 3: Commit.**

```bash
git add charter-pack.js
git commit -m "feat(pack): charter-pack.js, the Charter Pack page"
```

---

### Task 4: Wire it into `admin.js` and `index.html`

**Files:** modify `admin.js` (five replacements), `index.html` (two replacements, then the `?v=` bump)

- [ ] **Step 1: `admin.js`.**

**1. menu entry** — in `admin.js`, replace

```js
      { id: "crew", label: "Crew" },
      { id: "preview", label: "Guest view" },
      { id: "sites", label: "Site Editor" }
    ];
```

with

```js
      { id: "crew", label: "Crew" },
      { id: "pack", label: "Charter<br>Pack" },
      { id: "preview", label: "Guest view" },
      { id: "sites", label: "Site Editor" }
    ];
```

**2. destroy on repaint** — in `admin.js`, replace

```js
    const paint = (contentHtml, phase = "final") => {
      clearPageUnsavedGuard();
```

with

```js
    const paint = (contentHtml, phase = "final") => {
      clearPageUnsavedGuard();
      if (window.IolantheCharterPack) window.IolantheCharterPack.destroy();   // spec P: flushes a pending preset save
```

**3. panel content** — in `admin.js`, replace

```js
    if (activePanel === "preview") {
      return guestPreviewPanelHtml();
    }
    if (activePanel === "sites") {
      return renderSitesPanel();
    }
```

with

```js
    if (activePanel === "preview") {
      return guestPreviewPanelHtml();
    }
    if (activePanel === "pack") {
      return window.IolantheCharterPack ? window.IolantheCharterPack.render() : placeholderCard("Charter Pack");
    }
    if (activePanel === "sites") {
      return renderSitesPanel();
    }
```

**4. panel bind** — in `admin.js`, replace

```js
    if (activePanel === "preview") {
      bindGuestPreview(charterInfo, itinerary, "itinerary");
      return;
    }
    if (activePanel === "sites") {
```

with

```js
    if (activePanel === "preview") {
      bindGuestPreview(charterInfo, itinerary, "itinerary");
      return;
    }
    if (activePanel === "pack") {
      if (window.IolantheCharterPack) window.IolantheCharterPack.bind({ charterId: state.selectedCharter });
      return;
    }
    if (activePanel === "sites") {
```

**5. export apiUrl** — in `admin.js`, replace

```js
  window.IolantheAdmin = Object.freeze({
    api,
```

with

```js
  window.IolantheAdmin = Object.freeze({
    api,
    apiUrl,
```

- [ ] **Step 2: `index.html`.** The OLD blocks show `?v=admin-warn-fade3`; if `main` has moved on, use whatever tag
  `index.html` carries now (the replacement only adds lines after the guest-preview ones).

**1. css link** — in `index.html`, replace

```html
  <link rel="stylesheet" href="/admin/guest-preview.css?v=admin-warn-fade3">
```

with

```html
  <link rel="stylesheet" href="/admin/guest-preview.css?v=admin-warn-fade3">
  <link rel="stylesheet" href="/admin/charter-pack.css?v=admin-warn-fade3">
```

**2. scripts** — in `index.html`, replace

```html
  <script src="/admin/guest-preview.js?v=admin-warn-fade3" defer></script>
```

with

```html
  <script src="/admin/guest-preview.js?v=admin-warn-fade3" defer></script>
  <script src="/admin/pack-core.js?v=admin-warn-fade3" defer></script>
  <script src="/admin/pack-render.js?v=admin-warn-fade3" defer></script>
  <script src="/admin/charter-pack.js?v=admin-warn-fade3" defer></script>
```

- [ ] **Step 3: Bump every `?v=`.** `sed -i -E 's/\?v=[A-Za-z0-9-]+/?v=admin-charter-pack/g' index.html`, then
  `grep -c "?v=admin-charter-pack" index.html` → `30` and `grep -c "?v=" index.html` → `30`.

- [ ] **Step 4: Check.** `node --check admin.js` (no output); `node --test` → `ℹ pass 168`.

- [ ] **Step 5: Commit.**

```bash
git add admin.js index.html
git commit -m "feat(pack): Charter Pack in the Charter menu; assets admin-charter-pack"
```

---

### Task 5: `CLAUDE.md`

- [ ] **Step 1: Apply the replacements.**

**1. pack files** — in `CLAUDE.md`, replace

```md
  Device choice in localStorage `iolanthe-admin.preview.device`.
```

with

```md
  Device choice in localStorage `iolanthe-admin.preview.device`.
- `pack-core.js` / `pack-render.js` / `charter-pack.js` / `charter-pack.css` — **Charter Pack** (charter rework spec P):
  the charter's details as A4 pages for the client or agent, saved as a PDF with the browser's print dialog.
  `pack-core.js` (pure, Node-tested) holds the preset rules (mirror of the server's `lib/charter-pack.js`) and
  `buildPackModel(guestPayload, pack)`; `pack-render.js` (pure, Node-tested, no admin globals so phase 2 can reuse it)
  turns the model into the cover and per-section blocks; `charter-pack.js` lays the blocks onto pages, draws the Leaflet
  route map (light grey Esri tiles, day-number markers merged under 18 px, a key), auto-saves the preset to
  `/api/admin/charter/<id>/pack` and prints a copy of the pages placed in `<body>` (`#pack-print-host`). Data:
  `/api/charter?charter=<id>`. Themes A / B / C are classes `.pack-theme-a/b/c`; assets in `assets/pack/`.
```

**2. menu** — in `CLAUDE.md`, replace

```md
- The Charter section menu reads **Charter Admin** (the info panel, id `info`), **Route & Itinerary** (`routes`), Crew,
  Guest view, Site Editor; the two-line wraps are `<br>`s in the labels (`renderCharter`).
```

with

```md
- The Charter section menu reads **Charter Admin** (the info panel, id `info`), **Route & Itinerary** (`routes`), Crew,
  **Charter Pack** (`pack`), Guest view, Site Editor; the two-line wraps are `<br>`s in the labels (`renderCharter`).
```

**3. tests** — in `CLAUDE.md`, replace

```md
- `node --test` runs the tests in `test/` (146 tests), which cover `routes-core`, `itinerary-core`, `charters-core` and `guest-preview-core`
```

with

```md
- `node --test` runs the tests in `test/` (168 tests), which cover `routes-core`, `itinerary-core`, `charters-core`, `guest-preview-core`, `pack-core` and `pack-render`
```

- [ ] **Step 2: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs: Charter Pack files and menu"
```

---

### Task 6: Browser pass (this session runs it, not an implementer)

On a scratch server (plan P-1's worktree as the server, this worktree as `ADMIN_STATIC_DIR`, a **copy** of `data-scratch`
as `DATA_DIR`, its own port 8010+), log in as Charter Admin and open Charter → Charter Pack. Use a 1280-wide viewport
and screenshots at scale 0.6.

- [ ] csaba: 7 pages; the map loads (Save as PDF enabled, no "Loading map…"), markers carry day numbers, close stops merge.
- [ ] Themes A, B and C each render the cover and an inner page as in `pack-style.html`; A's stamp is cream on navy.
- [ ] IOLANTHE (5 %) and the line art (20 %) show behind every inner page and not on the cover.
- [ ] Proposal adds "Proposal — subject to change" to the footer; Charter Brief removes it.
- [ ] Prepared for and the cover note update the cover and the footer; the note keeps its line breaks.
- [ ] Upload a JPEG cover → it shows on the cover and in the thumbnail; Reset → back to the default; the charter's
  `pack/` folder holds only the cover in use after each save.
- [ ] Untick sections down to one → the last box is locked; untick Route → no map, Save as PDF enabled at once.
- [ ] Reload → the preset comes back.
- [ ] A charter with no stops (make one on the scratch copy) → no map page, no error.
- [ ] **Save as PDF** to a file: A4 portrait pages, one per preview page, no admin UI, colours and watermark printed
  (turn off the browser's headers and footers in the dialog). Send David the PDF.
- [ ] No console errors other than cancelled map tiles.

Then remove the temporary `launch.json` entry, push `feat/charter-pack`, and open the admin PR. **Merge only after the
server PR is released.** Final reviewer: one Sonnet review of the whole branch before the PR.
