# Routes Phase 3 (KML/GPX import and export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KML/GPX import and GPX/KML export to the Charter → Routes panel, and retire the old Route Upload panel
and the KML pin import modal:
- **Import:** pick one line or join them all, a live Simplify slider, and Replace or Append.
- **Pins:** imported pins show as temporary orange markers with Add to route / Make anchorage / Make site / Delete
  and a "near X" flag. They are never saved.
- **Export:** GPX 1.1 and KML.

**Architecture:**
- Phases 1 and 2 are live (`main` at `405aabe`). `routes.js` is 976 lines, over the 800-line guideline.
- **Task 1 is a pure refactor.** It moves code out of `routes.js` into four focused files:
  - `routes-ui.js`: `el()`, the icons, `fmtPos` and the modal shell
  - `routes-popup.js`: the point popup
  - `routes-lists.js`: the Stops / Legs tab lists
  - `routes-join.js`: Add another route

  `routes.js` drops to 744 lines.
- **The pure import/export logic goes into `routes-core.js`, test-first:**
  - parsing a parsed XML tree
  - Douglas-Peucker and the default tolerance
  - joining lines, pin matching
  - GPX/KML writing with XML escaping
- **The browser part goes into a new `routes-io.js`:** DOMParser, the import modal, the pins, export and download.
  `routes.js` only gains the wiring and ends at 771 lines.
- Retiring Route Upload is a separate task (admin.js and admin.css only) with its own commit, so it can be held back.

**Tech Stack:** plain browser JS (no build, no npm), Leaflet 1.9.4 (through `IolantheAdmin.loadLeaflet`), `node:test` for
`routes-core.js`, Python 3 for exact-text edits on CRLF files.

**Spec:** `docs/route-planner/spec.md` draft 2:
- §4.2 Import
- §4.3 Export
- §4.1: header actions, layers ("Imported pins"), and the unsaved-changes guard
- §5 phase 3
- D9: no point counts in the planner. The import modal's Simplify count is the one exception, and §4.2 asks for it.

**Out of scope:**
- the server's `upload-route` endpoint: it stays, and is removed in phase 4
- the Itinerary route rows and charter copies (phase 4)
- OpenSeaMap (phase 5)
- KMZ files (zipped KML) and `gx:Track`


## Decisions (David, 2026-10-07)

1. **Hold Task 5 (retire Route Upload) until phase 4.** Build and commit it, but keep it OUT of the phase 3 merge, e.g.
   on its own branch `feat/routes-retire-upload` based on the phase 3 branch. Merge it only together with phase 4's
   assign-route. Until then charters can still get routes through Route Upload, and the Alternative-route notice
   stays.
2. **Pins are kept across route switches and New.** Leaving the panel or the tab warns about unpromoted pins (as in
   the plan).
3. **Make anchorage from a pin creates the anchorage only.** It doesn't add a stop (as in the plan and the mockup).

---

## Facts this plan relies on (checked 2026-10-07, `main` at `405aabe`)

| Fact | Where |
|---|---|
| Every source file has CRLF line endings in the working tree, and git has `core.autocrlf=true`. New files written with LF are normalised on commit. | `git ls-files --eol` |
| `routes.js` is 976 lines. It holds `ICONS`/`svg`, `el`, `fmtPos`, the Stops/Legs list renderers (`stopItem` … `renderLegs`), `pointPopup`, `makeAnchorageFromPoint`, `makeSiteFromPoint`, `sitesServedPicker`, `openModal` and `openJoin`. | routes.js |
| The name field in the point popup commits through its own history push plus `renderActions()`/`renderStats()`, with no map rebuild. That keeps the popup open. | routes.js `pointPopup` → `commitName` |
| `guard.confirmOptions` is read when the confirm opens (`showAdminConfirm(pageUnsavedGuard.confirmOptions …)`), so a getter works. `guard.isDirty()` drives both the in-app guard and `beforeunload`. | admin.js `confirmDiscardPageChanges`, `hasPageUnsavedChanges` |
| `routes-places.js` `openAnchorageModal(null, pos, { name })` and `openSiteModal(null, pos, { name })` resolve to the saved place, or `null` if cancelled. `openSiteModal` builds the new site's defaults from `{ title, latitude, longitude, tags, images, media }`. | routes-places.js:89-216 |
| `routes.css` already has `--pin`, `.mk-pin`, `.mk-label`, `.routes-modal .slider-row`, `.routes-modal .file-drop` and `.routes-modal .radio-list`. It has **no** `.routes-modal .meta`, `.empty` or `.banner`, so the join modal's preview banner is unstyled today. | routes.css |
| The server keeps `source.type` in `planner`/`kml`/`gpx`/`charter`, and caps `source.filename` and the route name at 120 characters. | iolanthe-server lib/route-library.js `normalizeSource`, `MAX_NAME_LENGTH` |
| Route Upload lives in admin.js. `routeUploadDateLabel` … `renderRouteUploadPanel` (lines 5226-5338) are used only by that panel. `uploadRoute` … `openKmlPinImportModal` (7992-8455) are used only by it too. The panel has an entry in `renderCharter`, plus branches in `charterPanelContent` and `bindCharterPanel`. `plannedRoute` is passed only for it. | admin.js |
| Helpers the removed admin.js code shares with the rest of admin.js stay: `openStackedDialogModal`, `markModalSaved`, `normalizeSiteEditorDraft`, `normalizedSiteName`, `siteIdForInput`, `siteDescriptionPreview`, `formatSitePosition`, `siteDisplayName`, `SITE_MAP_PICKED_ZOOM` and `itineraryPlanById`. `distanceNauticalMiles` and `formatNauticalMiles` are used only by the removed code, so they go. | grep counts in admin.js |
| The Route Upload CSS is `.route-upload-*` and `.route-plan-*` (admin.css 1988-2057), plus `.kml-pin-*` and `.kml-compare-*` (3151 to the end of the file). | admin.css |
| Nothing outside admin.js refers to the panel id `route-upload`. The server keeps `/api/admin/charter/<id>/upload-route` until phase 4. | grep in the admin, server and guest repos |
| `index.html` loads `admin.js`, `routes-core.js`, `routes-places.js` and `routes.js` (all `?v=admin-routes-v2`, `defer`). The page links `admin.css` and `routes.css` with the same version string. | index.html:13-14, 102-105 |
| Static files are served without a `Cache-Control` header, so a browser can keep an old `routes.js`. That's why the version string is bumped in Task 1. | iolanthe-server server.js `serveStaticFile` |
| `node --test` runs 28 tests today. | test/routes-core.test.js |

## File structure

| File | Action | Responsibility |
|---|---|---|
| `routes-ui.js` | Create (Task 1; icons added in Task 3) | `el()`, the icon set and `svg()`, `fmtPos`, the modal shell `openModal` / `closeModal`. No route state. |
| `routes-popup.js` | Create (Task 1) | The point popup: heading, Make stop at, moved warning, Name, Sites served, Make anchorage / Make site, Delete |
| `routes-lists.js` | Create (Task 1) | The Stops and Legs tab lists and the time tile, including the per-leg speed controls |
| `routes-join.js` | Create (Task 1) | "Add another route" (D10). Phase 4's charter copies in that modal will land here. |
| `routes.js` | Modify (Tasks 1, 3, 4) | Panel state, side panel, header, map, saving, wiring. 976 → 744 → 771 lines. |
| `routes-core.js` | Modify (Task 2) | Adds `extractGeo`, `parseKmlCoordinates`, `htmlToText`, `simplify`, `defaultTolerance`, `joinLines`, `chosenLinePoints`, `importPoints`, `pinMatch`, `xmlEscape`, `slugify`, `exportBaseName`, `toGpx`, `toKml`. 177 → 364 lines. |
| `test/routes-core.test.js` | Modify (Task 2) | 15 new tests (43 in total) |
| `routes-io.js` | Create (Task 3, completed in Task 4) | Export and download (Task 3). Import modal, DOMParser and the temporary pins (Task 4). |
| `routes-places.js` | Modify (Task 4) | `openSiteModal` also takes `opts.description` |
| `routes.css` | Modify (Tasks 3, 4) | `.routes-modal .meta/.empty/.banner` and `.routes-panel .pop .pin-desc` |
| `index.html` | Modify (Tasks 1, 3) | New script tags in load order, version `admin-routes-v3` |
| `admin.js`, `admin.css` | Modify (Task 5) | Remove Route Upload and the KML pin import modal / compare map |
| `CLAUDE.md`, `docs/route-planner/HANDOFF.md` | Modify (Task 6) | Stack list; phase 3 handoff |

Script load order (all `defer`, so they run in this order): `admin.js`, `routes-core.js`, `routes-ui.js`,
`routes-places.js`, `routes-popup.js`, `routes-lists.js`, `routes-join.js`, `routes-io.js`, `routes.js`. Only
`routes-ui.js` has to come before `routes.js`, because `routes.js` reads `window.IolantheRoutesUi` when it loads. The
others are used from `bind()`.

### Why parsing is split between the browser and routes-core

Node has no `DOMParser`. Options:
- **A tiny regex XML reader in routes-core.** Testable, but it would have to handle CDATA, entities, comments,
  namespace prefixes and self-closing tags. Every GPS app writes these a little differently.
- **Parse everything in the browser.** Simple, but the logic that decides what counts as a line or a pin would have
  no unit tests.
- **Chosen:** the browser's `DOMParser` does the XML parsing (a real parser, so entities, CDATA and encodings are
  right). `routes-core.extractGeo(root, filename)` then walks the tree through a tiny duck-typed interface:
  `localName`, `children`, `getElementsByTagName("*")`, `getAttribute` and `textContent`.
  - The tests build trees with a 12-line fake element, so everything after parsing is unit-tested: which elements
    count, names, coordinate parsing, validation and fallbacks.
  - The DOMParser call itself is three lines in `routes-io.js`, covered by the browser checks.
  - Matching on `localName` also handles prefixed KML (`kml:Placemark`), which the mockup's
    `getElementsByTagName("Placemark")` misses.
  - Names come from **direct** children, so a GPX `<rte>` without a name doesn't pick up its first `<rtept>`'s name
    (another mockup bug).

## How to run the browser checks (Tasks 1, 3, 4, 5, 6)

- **Start the server:** use the browser pane's `preview_start` with `name: "routes-admin-dev"` (port 8124, from the
  workspace `.claude/launch.json`). Never start it with Bash.
- **Login: the controller logs in to the browser pane first and hands the logged-in tab to the implementer.**
  - Subagents can't read the dev login password, because the auto-mode classifier blocks it.
  - Implementers: don't open `settings.json` or try to log in. If the tab shows the login screen, stop and ask the
    controller.
- **Open the panel:** `http://localhost:8124/admin/?key=hotel`, then Charter → **Routes**.
- **After each code change:** reload the tab with `navigate` to the same URL. The login survives a reload.
- **Seed data:** if the library has no "Coron loop" route, or there are no "Coron Town" and "Lusong Island"
  anchorages, run this once in the tab (`javascript_tool`):

```js
const post = (p, b) => fetch(p + "?key=hotel", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
const have = await fetch("/api/admin/anchorages?key=hotel", { credentials: "same-origin" }).then((r) => r.json());
const names = new Set((have.anchorages || []).map((a) => a.name));
const extra = [{ name: "Coron Town", latitude: 11.9975, longitude: 120.201, depth_m: 12, notes: "Good holding in mud." },
  { name: "Lusong Island", latitude: 12.036, longitude: 120.096, depth_m: 15, notes: "" }].filter((a) => !names.has(a.name));
if (extra.length) await post("/api/admin/anchorages/save", { anchorages: [...(have.anchorages || []), ...extra] });
const lib = await fetch("/api/admin/routes?key=hotel", { credentials: "same-origin" }).then((r) => r.json());
if (!(lib.routes || []).some((r) => r.name === "Coron loop")) await post("/api/admin/routes/save", { route: { name: "Coron loop", speed_kn: 8, points: [
  { latitude: 11.9975, longitude: 120.201, anchorage_id: "coron-town", name: "Coron Town" },
  { latitude: 12.004, longitude: 120.165 }, { latitude: 12.018, longitude: 120.125 },
  { latitude: 12.036, longitude: 120.096, anchorage_id: "lusong-island", name: "Lusong Island", leg_speed_kn: 6 },
  { latitude: 12.0036, longitude: 120.0413 }, { latitude: 12.0144, longitude: 119.9532 } ] }, base_revision: 0 });
"seeded";
```

- **Test helpers:** run this once per page load (`javascript_tool`). The browser tools can't pick a file in a file
  dialog, so `__feedImport` puts a generated file into the open Import modal. `__armExport` captures a download
  instead of saving a file.

```js
window.__feedImport = (text, name) => {
  const input = document.querySelector(".routes-modal input[type=file]");
  if (!input) return "Open the Import modal first";
  const dt = new DataTransfer();
  dt.items.add(new File([text], name, { type: "application/xml" }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change"));
  return `fed ${name}`;
};
// A dense, slightly wobbly 211-point track, a 3-point spur and 5 pins (two near the seeded anchorages).
window.__sampleKml = () => {
  const ctrl = [[11.9975, 120.201], [12.006, 120.16], [12.03, 120.1], [12.0036, 120.0413], [12.0144, 119.9532], [12.079, 119.9018], [12.1364, 119.865], [12.195, 119.845]];
  const dense = [];
  ctrl.slice(1).forEach(([la, lo], k) => { const [pa, po] = ctrl[k]; for (let s = 0; s < 30; s += 1) { const t = s / 30; dense.push([pa + (la - pa) * t + Math.sin(dense.length * 1.7) * 0.00015, po + (lo - po) * t + Math.cos(dense.length * 1.3) * 0.00015]); } });
  dense.push(ctrl[ctrl.length - 1]);
  const pm = (name, la, lo, desc) => `<Placemark><name>${name}</name>${desc ? `<description><![CDATA[${desc}]]></description>` : ""}<Point><coordinates>${lo},${la},0</coordinates></Point></Placemark>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>West Busuanga track</name>
<Placemark><name>Track to Black Island</name><LineString><coordinates>${dense.map(([la, lo]) => `${lo.toFixed(5)},${la.toFixed(5)},0`).join(" ")}</coordinates></LineString></Placemark>
<Placemark><name>Short spur</name><LineString><coordinates>120.0960,12.0360,0 120.0700,12.0150,0 120.0450,12.0050,0</coordinates></LineString></Placemark>
${pm("Siete Pecados", 12.0061, 120.1868, "<p>Snorkel <b>reef</b></p><p>Best at high tide</p>")}${pm("Quiet bay", 12.129, 119.906)}${pm("Reef &amp; shallows", 12.05, 119.93)}${pm("Lusong anchorage", 12.0372, 120.0975)}${pm("Coron Town", 11.9, 120.3)}
</Document></kml>`;
};
// A route and a track that meet end to start, one valid waypoint and one with an impossible latitude.
window.__sampleGpx = () => `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>Plotter &amp; test</name></metadata>
<wpt lat="12.0061" lon="120.1868"><name>Siete Pecados</name><desc>Reef</desc></wpt>
<wpt lat="91" lon="120"><name>Broken</name></wpt>
<rte><rtept lat="11.9975" lon="120.201"><name>Leaving</name></rtept><rtept lat="12.004" lon="120.165"/><rtept lat="12.018" lon="120.125"/></rte>
<trk><name>Afternoon track</name><trkseg><trkpt lat="12.018" lon="120.125"/><trkpt lat="12.03" lon="120.11"/></trkseg><trkseg><trkpt lat="12.036" lon="120.096"/></trkseg></trk>
</gpx>`;
// Captures the next download (file name and text) instead of saving a file.
window.__armExport = () => {
  window.__exported = [];
  if (!window.__realCreate) window.__realCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { blob.text().then((t) => window.__exported.push(t)); return window.__realCreate(blob); };
  HTMLAnchorElement.prototype.click = function () { window.__downloadName = this.download; };
  return "armed";
};
"helpers ready";
```

---

### Task 1: Split routes.js into focused files (refactor, behaviour unchanged)

**Files:**
- Create: `routes-ui.js`, `routes-popup.js`, `routes-lists.js`, `routes-join.js`
- Modify: `routes.js` (by script), `index.html`

All four new files hold code moved verbatim from `routes.js`. The only changes are how they reach state:
- through a `ctx` object
- `editPointsQuiet` replaces the name field's hand-written history push

- [ ] **Step 1: Create the branch**

```bash
cd "/s/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin"
git switch main && git pull --ff-only && git switch -c feat/routes-phase3
```

- [ ] **Step 2: Create `routes-ui.js`**

```js
// Routes panel UI helpers shared by routes.js, routes-popup.js and routes-io.js: el(), the icon set, fmtPos and
// the modal shell. No route state lives here.
(function () {
  "use strict";

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

  const fmtPos = (p) => `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`;

  // ---------- modals (house rules: green save + red cancel top right, outside click and Escape cancel) ----------
  let current = null; // closes the open routes modal, if any

  function openModal({ title, body, onSave, saveTitle, wide, onClose }) {
    if (current) current();
    const backdrop = el("div", { class: "routes-modal modal-backdrop" });
    let busy = false;
    const close = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
      if (current === close) current = null;
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
    current = close;
    setTimeout(() => { const f = card.querySelector(".modal-body input, .modal-body select, .modal-body textarea"); if (f) f.focus(); }, 0);
    return { close, card };
  }

  const closeModal = () => { if (current) current(); };

  window.IolantheRoutesUi = Object.freeze({ ICONS, svg, el, fmtPos, openModal, closeModal });
})();
```

- [ ] **Step 3: Create `routes-popup.js`**

```js
// Routes panel: the point popup (Select mode). Heading, "Make stop at", the moved warning, Name, Sites served,
// Make anchorage / Make site and Delete. Created once per bind() by routes.js; route state stays in routes.js.
(function () {
  "use strict";

  const NEARBY_ANCHORAGE_NM = 2; // "Make stop at" offers anchorages within this distance of a waypoint
  const MAX_NEARBY_BUTTONS = 3;
  const SITES_NEAR_NM = 5;       // sites within this distance of a stop are grouped first in "Sites served"

  // ctx: { core, places, getWork, getMap, editPoints(fn, opts), editPointsQuiet(fn), makeStopAtAnchorage(i, anchorage) }
  function create(ctx) {
    const { core: c, places } = ctx;
    const { el, fmtPos } = window.IolantheRoutesUi;
    const points = () => ctx.getWork().route.points;
    const closePopup = () => { const map = ctx.getMap(); if (map) map.closePopup(); };

    function pointPopup(i) {
      const p = points()[i];
      const stopIndex = points().slice(0, i + 1).filter(c.isStop).length;
      const nameInput = el("input", { type: "text", value: p.name || "", placeholder: "Optional label" });
      const heading = el("h3", {});
      const headingText = (q) => (c.isStop(q) ? `Stop ${stopIndex} · ${q.name || "Stop"}` : (q.name ? `Waypoint · ${q.name}` : "Waypoint"));
      heading.textContent = headingText(p);
      // Commit on Enter or blur without rebuilding the map, so the popup (and a Delete click) is not disturbed.
      const commitName = () => {
        const name = nameInput.value.trim();
        const current = points()[i];
        if (!current || name === (current.name || "")) return;
        ctx.editPointsQuiet((pts) => c.replaceAt(pts, i, { ...current, name: name || undefined }));
        heading.textContent = headingText(points()[i]);
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
          nearby.map((n) => el("button", { type: "button", class: "text-btn", onclick: () => ctx.makeStopAtAnchorage(i, n.anchorage) },
            `Make stop at ${n.anchorage.name}`, el("span", { class: "d" }, `${n.nm.toFixed(1)} nm`)))) : null,
        moved ? el("div", { class: "banner warn", style: "margin-bottom:8px" }, `The anchorage has moved ${Math.round(moved)} m since this stop was placed. `,
          el("button", { type: "button", class: "link-btn", onclick: () => ctx.editPoints((pts) => c.replaceAt(pts, i, { ...pts[i], latitude: anchorage.latitude, longitude: anchorage.longitude }), { popup: i }) }, "Move stop to anchorage")) : null,
        el("div", { class: "field" }, el("label", {}, "Name"), nameInput));
      if (stop && places) box.append(sitesServedPicker(i));
      box.append(el("div", { class: "actions" },
        !stop && places ? el("button", { type: "button", class: "text-btn secondary", onclick: () => makeAnchorageFromPoint(i) }, "Make anchorage") : null,
        places ? el("button", { type: "button", class: "text-btn secondary", onclick: () => makeSiteFromPoint(i) }, "Make site") : null,
        el("button", { type: "button", class: "text-btn danger-text", onclick: () => { closePopup(); ctx.editPoints((pts) => c.removeAt(pts, i)); } }, "Delete")));
      return box;
    }

    async function makeAnchorageFromPoint(i) {
      const p = points()[i];
      closePopup();
      const saved = await places.openAnchorageModal(null, p, { name: p.name });
      if (saved && points()[i]) ctx.makeStopAtAnchorage(i, saved);
    }

    async function makeSiteFromPoint(i) {
      const p = points()[i];
      closePopup();
      const saved = await places.openSiteModal(null, p, { name: p.name });
      if (!saved || !points()[i]) return;
      ctx.editPoints((pts) => {
        const current = pts[i];
        const next = { ...current, name: current.name || saved.title };
        if (!c.isStop(current)) next.site_id = saved.id;
        return c.replaceAt(pts, i, next);
      }, { popup: i });
    }

    // Tick list of sites a stop serves: those within SITES_NEAR_NM first, then the rest. Each tick re-opens the popup.
    function sitesServedPicker(i) {
      const p = points()[i];
      const chosen = new Set(p.site_ids || []);
      const sorted = places.sites().map((s) => ({ s, d: c.distNm(p, s) })).sort((x, y) => x.d - y.d);
      const row = ({ s, d }) => el("label", { class: d <= SITES_NEAR_NM ? "near" : "" },
        el("input", {
          type: "checkbox", checked: chosen.has(s.id),
          onchange: (e) => {
            const ticked = e.target.checked;
            ctx.editPoints((pts) => {
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

    return { pointPopup };
  }

  window.IolantheRoutesPopup = Object.freeze({ create });
})();
```

- [ ] **Step 4: Create `routes-lists.js`**

```js
// Routes panel: the Stops and Legs tab lists and the time tile. Stop cards (depth, moved/deleted warnings, site
// chips) and stop-to-stop leg cards with per-leg speeds. Created once per bind() by routes.js.
(function () {
  "use strict";

  // ctx: { A, core, places, getWork, speedKn(), defaultSpeed, maxSpeed, editPoints(fn), focusPoint(i), focusLeg(leg) }
  function create(ctx) {
    const { core: c, places } = ctx;
    const { el } = window.IolantheRoutesUi;
    const points = () => ctx.getWork().route.points;
    const legsFor = (pts) => (pts.length < 2 ? [] : c.stopLegs(pts, ctx.speedKn()));

    function timeStat() {
      const legs = legsFor(points());
      const hours = c.totalHours(legs);
      const anyOwn = legs.some((l) => l.own);
      const label = hours === null ? "set a speed" : (anyOwn ? "h:mm underway" : `h:mm at ${ctx.speedKn()} kn`);
      return el("div", { class: "stat" }, el("b", {}, hours === null ? "—" : c.fmtHm(hours)), el("span", {}, label));
    }

    // A stop row with anchorage depth, moved/deleted warnings and site chips (ids that no longer exist are dropped quietly).
    function stopItem(p, i, n) {
      const a = places ? places.findAnchorage(p.anchorage_id) : null;
      const moved = places ? c.anchorageMovedM(p, a) : 0;
      const siteChips = places ? (p.site_ids || []).map(places.findSite).filter(Boolean).map((s) => el("span", { class: "chip" }, s.title)) : [];
      const deleted = places && places.isLoaded() && p.anchorage_id && !a;
      return el("div", { class: "stop-item", onclick: () => ctx.focusPoint(i) },
        el("div", { class: "title" }, el("span", { class: "stop-num" }, n), p.name || "Stop",
          a && a.depth_m ? el("span", { class: "meta", style: "font-weight:400" }, `${a.depth_m} m`) : null),
        moved ? el("div", { class: "warn-text" }, `⚠ Anchorage moved ${Math.round(moved)} m since placed`) : null,
        deleted ? el("div", { class: "warn-text" }, "⚠ Anchorage deleted. The stop keeps its position.") : null,
        siteChips.length ? el("div", { class: "chips" }, siteChips) : el("div", { class: "empty", style: "margin-top:4px" }, "No sites linked"));
    }

    function renderStops(box, countEl) {
      let n = 0;
      const stops = points().map((p, i) => ({ p, i })).filter(({ p }) => c.isStop(p)).map(({ p, i }) => {
        n += 1;
        return stopItem(p, i, n);
      });
      countEl.textContent = stops.length || "";
      box.replaceChildren(...(stops.length ? stops : [el("div", { class: "empty" }, "No stops yet. In Add mode, tap an anchorage to add one.")]));
    }

    function setLegSpeed(leg, value) {
      ctx.editPoints((pts) => c.setLegSpeed(pts, leg.fromIndex, value));
    }

    function legSpeedControl(leg) {
      const global = ctx.speedKn();
      const useRoute = el("input", { type: "checkbox", checked: !leg.own, "aria-label": "Use the route speed for this leg" });
      // Unticking starts the leg at the route speed so the time doesn't jump; reticking clears the leg's own speed.
      useRoute.addEventListener("change", () => setLegSpeed(leg, useRoute.checked ? 0 : (global || ctx.defaultSpeed)));
      const row = el("div", { class: "leg-speed", onclick: (e) => e.stopPropagation() },
        el("label", {}, useRoute, global ? `Route speed (${global} kn)` : "Route speed"));
      if (leg.own) {
        const input = el("input", { type: "number", min: "0.5", max: String(ctx.maxSpeed), step: "0.5", value: String(leg.own), "aria-label": "Speed for this leg in knots" });
        input.addEventListener("change", () => {
          const v = parseFloat(input.value);
          if (!(v > 0 && v <= ctx.maxSpeed)) { ctx.A.setStatus(`Enter a speed between 0.5 and ${ctx.maxSpeed} kn.`, "error"); input.value = String(leg.own); return; }
          setLegSpeed(leg, v);
        });
        row.append(el("label", {}, input, "kn for this leg"));
      }
      return row;
    }

    function renderLegs(box, countEl) {
      const legs = legsFor(points());
      countEl.textContent = legs.length || "";
      if (!legs.length) { box.replaceChildren(el("div", { class: "empty" }, "Add at least two points to see legs.")); return; }
      const total = legs.reduce((sum, l) => sum + l.nm, 0);
      const hours = c.totalHours(legs);
      box.replaceChildren(
        ...legs.map((l, k) => el("div", { class: `stop-item leg-item${l.own ? " custom" : ""}`, title: "Show this leg on the map", onclick: () => ctx.focusLeg(l) },
          el("div", { class: "title" }, el("span", { class: "stop-num" }, k + 1), `${l.from} → ${l.to}`),
          el("div", { class: "leg-meta" }, `${l.nm.toFixed(1)} nm`,
            l.hours !== null ? el("span", {}, " · ", el("b", {}, c.fmtHm(l.hours)), ` at ${l.speed} kn`) : null),
          legSpeedControl(l))),
        el("div", { class: "leg-total" }, el("span", {}, "Total"), el("span", {}, `${total.toFixed(1)} nm${hours !== null ? ` · ${c.fmtHm(hours)}` : ""}`)));
    }

    return { timeStat, renderStops, renderLegs };
  }

  window.IolantheRoutesLists = Object.freeze({ create });
})();
```

- [ ] **Step 5: Create `routes-join.js`**

```js
// Routes panel: "Add another route" (spec D10, §4.4). Appends or prepends a library route, optionally reversed, as one
// undoable edit. Created once per bind() by routes.js.
(function () {
  "use strict";

  // ctx: { core, getWork, getRoutes, editPoints(fn, opts), status(message, tone) }
  function create(ctx) {
    const { core: c } = ctx;
    const { el, openModal } = window.IolantheRoutesUi;

    function openJoin() {
      const work = ctx.getWork();
      if (!work) return;
      const others = ctx.getRoutes().filter((r) => r.id !== work.route.id);
      if (!others.length) { ctx.status("There are no other routes to add.", ""); return; }
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
          ctx.editPoints((pts) => c.joinPoints(pts, other.points.map((p) => ({ ...p })), opts), { fit: true });
          ctx.status(`Added ${other.name}.`, "ok");
          return true;
        }
      });
    }

    return { openJoin };
  }

  window.IolantheRoutesJoin = Object.freeze({ create });
})();
```

- [ ] **Step 6: Edit routes.js with a checked script**

`routes.js` is CRLF. Don't hand-edit it. Save this script to your **scratchpad** (not the repo) as `task1_split.py`,
then run it from the repo root. It works on LF text, writes back with the file's own line endings, and stops with an
assertion if any anchor isn't found exactly once. It also checks that every moved block holds exactly the expected
functions.

```python
import re, sys

PATH = sys.argv[1] if len(sys.argv) > 1 else "routes.js"
raw = open(PATH, encoding="utf-8", newline="").read()
eol = "\r\n" if "\r\n" in raw else "\n"
text = raw.replace("\r\n", "\n")


def replace_once(old, new):
    global text
    count = text.count(old)
    assert count == 1, f"expected 1 match, found {count}: {old[:70]!r}"
    text = text.replace(old, new)


def cut_between(start, end):
    """Removes text from `start` up to (not including) `end`. Both must appear exactly once."""
    global text
    assert text.count(start) == 1, f"start anchor count {text.count(start)}: {start[:70]!r}"
    assert text.count(end) == 1, f"end anchor count {text.count(end)}: {end[:70]!r}"
    a = text.index(start)
    b = text.index(end)
    assert a < b, "anchors out of order"
    removed = text[a:b]
    text = text[:a] + text[b:]
    return removed


replace_once(
    "// Ported from docs/route-planner/planner-mockup.html. Saving and modals are added in a later task.\n",
    "// Ported from docs/route-planner/planner-mockup.html. Split into: routes-ui.js (el, icons, modal shell),\n"
    "// routes-popup.js (point popup), routes-lists.js (Stops / Legs lists), routes-join.js (Add another route),\n"
    "// routes-places.js (anchorages, sites).\n")

replace_once(
    '  const NEARBY_ANCHORAGE_NM = 2; // "Make stop at" offers anchorages within this distance of a waypoint\n'
    "  const MAX_NEARBY_BUTTONS = 3;\n"
    '  const SITES_NEAR_NM = 5;       // sites within this distance of a stop are grouped first in "Sites served"\n',
    "")

replace_once(
    "  let places = null;     // IolantheRoutesPlaces instance, created fresh by each bind()\n",
    "  let places = null;     // IolantheRoutesPlaces instance, created fresh by each bind()\n"
    "  let popup = null;      // IolantheRoutesPopup instance, created fresh by each bind()\n")

removed = cut_between("  const ICONS = {\n", "  const MODES = [\n")
assert "const svg = (name)" in removed
text = text.replace("  const MODES = [\n", "  const { el, svg, openModal, closeModal } = window.IolantheRoutesUi;\n\n  const MODES = [\n", 1)

replace_once("  let closeModal = null; // closes the open routes modal, if any\n", "")

removed = cut_between("  function el(tag, attrs, ...children) {\n", "  const $ = (id) =>")
assert removed.count("function ") == 1

replace_once("  const fmtPos = (p) => `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`;\n", "")

replace_once(
    "  function undo() {\n",
    "  // Like editPoints, but leaves the map (and an open popup) alone. Used for name edits typed in the point popup.\n"
    "  function editPointsQuiet(fn) {\n"
    "    history.undo.push(work.route.points);\n"
    "    history.redo = [];\n"
    "    work.route = { ...work.route, points: fn(work.route.points) };\n"
    "    renderActions();\n"
    "    renderStats();\n"
    "  }\n"
    "  function undo() {\n")

replace_once("    m.bindPopup(pointPopup(i), {", "    m.bindPopup(popup.pointPopup(i), {")

removed = cut_between("  function pointPopup(i) {\n", "  // ---------- saving against the server ----------\n")
names = re.findall(r"^  (?:async )?function (\w+)", removed, re.M)
assert names == ["pointPopup", "makeAnchorageFromPoint", "makeSiteFromPoint", "sitesServedPicker", "openModal"], names

replace_once("  function bind(opts) {\n    if (closeModal) closeModal();\n", "  function bind(opts) {\n    closeModal();\n")

replace_once(
    "    places = myPlaces;\n",
    "    places = myPlaces;\n"
    "    popup = window.IolantheRoutesPopup.create({\n"
    "      core: core(),\n"
    "      places: myPlaces,\n"
    "      getWork: () => work,\n"
    "      getMap: () => map,\n"
    "      editPoints,\n"
    "      editPointsQuiet,\n"
    "      makeStopAtAnchorage\n"
    "    });\n")

# ---- the Stops / Legs lists and the time tile move to routes-lists.js ----
replace_once(
    "  let popup = null;      // IolantheRoutesPopup instance, created fresh by each bind()\n",
    "  let popup = null;      // IolantheRoutesPopup instance, created fresh by each bind()\n"
    "  let lists = null;      // IolantheRoutesLists instance, created fresh by each bind()\n")

replace_once(
    "      timeStat(pts));\n"
    "\n"
    "    let n = 0;\n"
    "    const stops = pts.map((p, i) => ({ p, i })).filter(({ p }) => core().isStop(p)).map(({ p, i }) => {\n"
    "      n += 1;\n"
    "      return stopItem(p, i, n);\n"
    "    });\n"
    '    $("count-stops").textContent = stops.length || "";\n'
    '    $("stops").replaceChildren(...(stops.length ? stops : [el("div", { class: "empty" }, "No stops yet. In Add mode, tap an anchorage to add one.")]));\n'
    "\n"
    "    renderLegs();\n",
    "      lists.timeStat());\n"
    '    lists.renderStops($("stops"), $("count-stops"));\n'
    '    lists.renderLegs($("legs"), $("count-legs"));\n')

removed = cut_between(
    "  // A stop row with anchorage depth, moved/deleted warnings and site chips (ids that no longer exist are dropped quietly).\n",
    "  function showTab(name) {\n")
names = re.findall(r"^  function (\w+)", removed, re.M)
assert names == ["stopItem", "currentLegs", "timeStat", "setLegSpeed", "legSpeedControl", "renderLegs"], names

replace_once(
    "      makeStopAtAnchorage\n"
    "    });\n",
    "      makeStopAtAnchorage\n"
    "    });\n"
    "    lists = window.IolantheRoutesLists.create({\n"
    "      A: A(),\n"
    "      core: core(),\n"
    "      places: myPlaces,\n"
    "      getWork: () => work,\n"
    "      speedKn,\n"
    "      defaultSpeed: DEFAULT_SPEED_KN,\n"
    "      maxSpeed: MAX_SPEED_KN,\n"
    "      editPoints,\n"
    "      focusPoint,\n"
    "      focusLeg\n"
    "    });\n")

# ---- "Add another route" moves to routes-join.js ----
replace_once(
    "  let lists = null;      // IolantheRoutesLists instance, created fresh by each bind()\n",
    "  let lists = null;      // IolantheRoutesLists instance, created fresh by each bind()\n"
    "  let join = null;       // IolantheRoutesJoin instance, created fresh by each bind()\n")

replace_once(
    '      b("join", "Add another route to this one", openJoin),\n',
    '      b("join", "Add another route to this one", () => join.openJoin()),\n')

removed = cut_between("  // ---------- add another route to this one ----------\n", "  // ---------- wiring ----------\n")
assert re.findall(r"^  function (\w+)", removed, re.M) == ["openJoin"]

replace_once(
    "      focusLeg\n"
    "    });\n",
    "      focusLeg\n"
    "    });\n"
    "    join = window.IolantheRoutesJoin.create({\n"
    "      core: core(),\n"
    "      getWork: () => work,\n"
    "      getRoutes: () => routes,\n"
    "      editPoints,\n"
    "      status\n"
    "    });\n")

for gone in ["stopItem", "currentLegs", "legSpeedControl", "timeStat(", "renderLegs("]:
    assert text.count(gone) == text.count("lists." + gone), f"stray {gone}"

for gone in ["pointPopup(", "sitesServedPicker", "NEARBY_ANCHORAGE_NM", "SITES_NEAR_NM", "fmtPos", "ICONS"]:
    left = [m.start() for m in re.finditer(re.escape(gone), text)]
    if gone == "pointPopup(":
        assert text.count("popup.pointPopup(") == len(left), f"stray {gone}"
    else:
        assert not left, f"stray {gone}"

open(PATH, "w", encoding="utf-8", newline="").write(text.replace("\n", eol))
print(f"{PATH}: {text.count(chr(10))} lines")
```

Run: `python "<scratchpad>/task1_split.py" routes.js`
Expected: `routes.js: 744 lines`, with no assertion error.

- [ ] **Step 7: index.html: new script tags and version v3**

Replace every `?v=admin-routes-v2` with `?v=admin-routes-v3`: two stylesheet links and the script tags. The version
goes up now rather than in the last task, because the server sends no cache headers. Without the bump, the browser
pane could keep running the old `routes.js` during the checks.

Then make the script block read exactly as below, keeping CRLF. Use Edit, or a Python replace with `newline=''`.

```html
  <script src="/admin/admin.js?v=admin-routes-v3" defer></script>
  <script src="/admin/routes-core.js?v=admin-routes-v3" defer></script>
  <script src="/admin/routes-ui.js?v=admin-routes-v3" defer></script>
  <script src="/admin/routes-places.js?v=admin-routes-v3" defer></script>
  <script src="/admin/routes-popup.js?v=admin-routes-v3" defer></script>
  <script src="/admin/routes-lists.js?v=admin-routes-v3" defer></script>
  <script src="/admin/routes-join.js?v=admin-routes-v3" defer></script>
  <script src="/admin/routes.js?v=admin-routes-v3" defer></script>
```

- [ ] **Step 8: Static checks**

```bash
for f in routes.js routes-ui.js routes-popup.js routes-lists.js routes-join.js; do node --check "$f" || echo "FAIL $f"; done
node --test
wc -l routes.js
grep -c "admin-routes-v3" index.html
```

Expected:
- no `FAIL` lines
- `ℹ pass 28`, `ℹ fail 0`
- `744 routes.js`
- `10`, from 2 stylesheets and 8 scripts

- [ ] **Step 9: Browser regression check (behaviour must be identical)**

Follow "How to run the browser checks": the controller hands over the logged-in tab, then run the seed snippet if
needed. Reload, open Charter → Routes, and open "Coron loop". Check each item:

1. `read_network_requests` with `urlPattern: "routes-"`: `routes-ui.js`, `routes-popup.js`, `routes-lists.js` and
   `routes-join.js` load with `?v=admin-routes-v3` and status 200.
2. `read_console_messages` with `onlyErrors: true` shows nothing.
3. The stats tiles show nm, stops (2) and h:mm. The Stops tab shows 2 cards with numbered dots, the anchorage depth,
   any moved/deleted warning, and site chips or "No sites linked". The local data may already have an older "Coron
   loop" whose stop ids don't match the anchorages; it should look exactly as it did on `main` before the split.
4. Clicking a stop card pans to the stop and opens its popup.
5. **Legs tab:**
   - 3 leg cards and a Total card; the Lusong Island leg is tinted, at 6 kn
   - untick "Route speed" on the first leg: a speed field appears and the card is tinted
   - change it to 5: the leg time and the time tile update
   - re-tick it: the leg goes back
   - Ctrl+Z (click the map first so no input has focus) undoes the last change
6. **Select mode, waypoint popup:**
   - click the waypoint at 12.004, 120.165: the heading reads "Waypoint"
   - type a name and press Enter: the heading changes to "Waypoint · <name>", and **the popup stays open**
   - the header Undo is enabled; Undo restores the old name
7. **Stop popup:**
   - "Sites served" ticks keep the popup open and update the chips
   - "Make anchorage" (on a waypoint) and "Make site" open their modals; cancel both
   - "Delete" on a waypoint removes it; Undo brings it back
8. **"Make stop at":**
   - drag a waypoint to about 1 nm from "Lusong Island", not onto the marker, which would snap it
   - its popup offers "Make stop at Lusong Island · 1.0 nm"
   - clicking it merges into the existing stop if that stop is adjacent (spec Q3), otherwise it makes a stop
   - Undo
9. **Header:**
   - Save As opens its modal; Escape closes it, and so does a click outside it
   - "Add another route": the preview text updates when you switch Where and Direction; "Add route" joins the
     routes; Undo
10. Anchorage mode: clicking the map opens the "New anchorage" modal (this modal comes from `routes-ui.js` through
    `routes-places.js`). Cancel it.
11. **Unsaved guard:** make an edit, then click Charter → Itinerary. The "Unsaved route" confirm appears. Choose Cancel.
    Then click Routes' Cancel (red) to discard.

If anything differs from `main`, fix it before committing. This task must not change behaviour.

- [ ] **Step 10: Commit**

```bash
git add routes.js routes-ui.js routes-popup.js routes-lists.js routes-join.js index.html
git commit -m "refactor: split routes.js into routes-ui, routes-popup, routes-lists and routes-join"
```

---

### Task 2: routes-core: import and export logic (TDD)

**Files:**
- Modify: `test/routes-core.test.js` (append)
- Modify: `routes-core.js` (insert before `return {`, and extend the returned object)

- [ ] **Step 1: Write the failing tests**

Append to `test/routes-core.test.js`:

```js

// ---------- import / export (phase 3) ----------

// A tiny stand-in for a DOM element with just what extractGeo uses: localName, children,
// getElementsByTagName("*") (all descendants), getAttribute and textContent. String arguments are text.
function E(localName, attrs, ...kids) {
  const children = kids.filter((k) => typeof k === "object");
  const text = kids.filter((k) => typeof k === "string").join("");
  return {
    localName,
    children,
    getAttribute: (name) => (attrs && Object.prototype.hasOwnProperty.call(attrs, name) ? String(attrs[name]) : null),
    getElementsByTagName: () => children.flatMap((c) => [c, ...c.getElementsByTagName("*")]),
    get textContent() { return text + children.map((c) => c.textContent).join(""); }
  };
}

// A dense, slightly wobbly track like a Google Earth or Navionics export (211 points), as in the mockup's sampleKml.
function denseTrack() {
  const ctrl = [[11.9975, 120.201], [12.006, 120.16], [12.03, 120.1], [12.0036, 120.0413], [12.0144, 119.9532], [12.079, 119.9018], [12.1364, 119.865], [12.195, 119.845]];
  const out = [];
  ctrl.slice(1).forEach(([la, lo], k) => {
    const [pa, po] = ctrl[k];
    for (let s = 0; s < 30; s += 1) {
      const t = s / 30;
      out.push(P(pa + (la - pa) * t + Math.sin(out.length * 1.7) * 0.00015, po + (lo - po) * t + Math.cos(out.length * 1.3) * 0.00015));
    }
  });
  out.push(P(12.195, 119.845));
  return out;
}

test("parseKmlCoordinates reads lon,lat[,alt] tuples and drops invalid ones", () => {
  assert.deepEqual(core.parseKmlCoordinates(" 120.1,12.0,0\n\t120.2,12.1 "), [P(12, 120.1), P(12.1, 120.2)]);
  assert.deepEqual(core.parseKmlCoordinates("abc,def 200,10 120.1 ,12 120.3,12.3"), [P(12.3, 120.3)]);
  assert.deepEqual(core.parseKmlCoordinates(""), []);
  assert.deepEqual(core.parseKmlCoordinates(undefined), []);
});

test("htmlToText keeps the text of a KML HTML description, one line per break or block", () => {
  assert.equal(core.htmlToText("<p>Good <b>holding</b></p><br/>Depth &amp; 12 m&#33; &unknown;"), "Good holding\nDepth & 12 m! &unknown;");
  assert.equal(core.htmlToText(""), "");
});

test("extractGeo reads KML lines and pins, with names, and drops invalid coordinates", () => {
  const root = E("kml", {}, E("Document", {}, E("name", {}, "West Busuanga"),
    E("Placemark", {}, E("name", {}, "Track"), E("LineString", {}, E("coordinates", {}, "120.1,12.0,0 bad 120.2,12.1,0 120.3,12.2,0"))),
    E("Placemark", {}, E("name", {}, "Spur"), E("MultiGeometry", {}, E("LineString", {}, E("coordinates", {}, "120.4,12.0 120.5,12.0")))),
    E("Placemark", {}, E("name", {}, "Too short"), E("LineString", {}, E("coordinates", {}, "120.1,12.0 999,12"))),
    E("Placemark", {}, E("name", {}, "Quiet bay"), E("description", {}, "<p>Sand &amp; mud</p>"), E("Point", {}, E("coordinates", {}, "119.906,12.129,0"))),
    E("Placemark", {}, E("Point", {}, E("coordinates", {}, "119.9,12.1"))),
    E("Placemark", {}, E("name", {}, "Off the map"), E("Point", {}, E("coordinates", {}, "119.9,95")))));
  const geo = core.extractGeo(root, "west.kml");
  assert.equal(geo.type, "kml");
  assert.equal(geo.name, "West Busuanga");
  assert.deepEqual(geo.lines.map((l) => [l.name, l.points.length]), [["Track", 3], ["Spur", 2]]);
  assert.deepEqual(geo.pins, [
    { name: "Quiet bay", description: "Sand & mud", latitude: 12.129, longitude: 119.906 },
    { name: "Placemark 5", description: "", latitude: 12.1, longitude: 119.9 }
  ]);
});

test("extractGeo reads GPX routes, tracks (all segments) and waypoints", () => {
  const pt = (tag, lat, lon, ...kids) => E(tag, { lat, lon }, ...kids);
  const root = E("gpx", { version: "1.1" },
    E("metadata", {}, E("name", {}, "Plotter export")),
    pt("wpt", 12.1, 120.1, E("name", {}, "Reef"), E("desc", {}, "Shallow")),
    pt("wpt", "x", 120.1, E("name", {}, "Broken")),
    E("rte", {}, pt("rtept", 12.0, 120.0, E("name", {}, "Not the route name")), pt("rtept", 12.1, 120.1)),
    E("trk", {}, E("name", {}, "Day 1"), E("trkseg", {}, pt("trkpt", 12.0, 120.0), pt("trkpt", 12.01, 120.0)),
      E("trkseg", {}, pt("trkpt", 12.02, 120.0))));
  const geo = core.extractGeo(root, "export.gpx");
  assert.equal(geo.type, "gpx");
  assert.equal(geo.name, "Plotter export");
  assert.deepEqual(geo.lines.map((l) => [l.name, l.points.length]), [["Route 1", 2], ["Day 1", 3]]);
  assert.deepEqual(geo.pins, [{ name: "Reef", description: "Shallow", latitude: 12.1, longitude: 120.1 }]);
});

test("extractGeo falls back to the file extension when the root is neither kml nor gpx", () => {
  assert.equal(core.extractGeo(E("html", {}), "track.gpx").type, "gpx");
  assert.deepEqual(core.extractGeo(E("html", {}), "track.kml"), { type: "kml", name: "", lines: [], pins: [] });
});

test("simplify drops points within the tolerance and keeps the ends", () => {
  const straight = Array.from({ length: 11 }, (_, i) => P(12 + i * 0.001, 120));
  assert.deepEqual(core.simplify(straight, 1), [straight[0], straight[10]]);
  const zero = core.simplify(straight, 0);
  assert.equal(zero.length, 11);
  assert.notEqual(zero, straight);
  const peak = [P(12, 120), P(12.005, 120.0046), P(12.01, 120)]; // the middle point is about 500 m off the line
  assert.equal(core.simplify(peak, 100).length, 3);
  assert.equal(core.simplify(peak, 1000).length, 2);
  assert.deepEqual(core.simplify([P(1, 1), P(2, 2)], 50), [P(1, 1), P(2, 2)]);
  assert.equal(straight.length, 11);
});

test("defaultTolerance is the smallest 5 m step that keeps a line to 60 points or fewer", () => {
  const track = denseTrack();
  assert.equal(track.length, 211);
  const t = core.defaultTolerance(track);
  assert.ok(t > 0 && t <= core.MAX_TOLERANCE_M && t % core.TOLERANCE_STEP_M === 0);
  assert.ok(core.simplify(track, t).length <= core.IMPORT_TARGET_POINTS);
  assert.ok(core.simplify(track, t - core.TOLERANCE_STEP_M).length > core.IMPORT_TARGET_POINTS);
  assert.equal(core.defaultTolerance(track.slice(0, 40)), 0);
  const zigzag = Array.from({ length: 100 }, (_, i) => P(12 + i * 0.01, 120 + (i % 2) * 0.05)); // ~5 km swings
  assert.equal(core.defaultTolerance(zigzag), core.MAX_TOLERANCE_M);
});

test("joinLines joins in file order and drops the duplicate where lines meet", () => {
  const a = { points: [P(12, 120), P(12.1, 120)] };
  const b = { points: [P(12.1, 120.0001), P(12.2, 120)] }; // starts ~11 m from a's end
  const c = { points: [P(13, 121), P(13.1, 121)] };
  assert.equal(core.joinLines([a, b]).length, 3);
  assert.equal(core.joinLines([a, c]).length, 4);
  assert.deepEqual(core.joinLines([]), []);
});

test("chosenLinePoints picks one line or joins them all", () => {
  const lines = [{ points: [P(1, 1), P(1, 2)] }, { points: [P(5, 5), P(5, 6)] }];
  assert.deepEqual(core.chosenLinePoints(lines, { line: 1 }), [P(5, 5), P(5, 6)]);
  assert.equal(core.chosenLinePoints(lines, { join: true }).length, 4);
  assert.deepEqual(core.chosenLinePoints(lines, { line: 7 }), []);
  assert.deepEqual(core.chosenLinePoints([], { line: 0 }), []);
});

test("importPoints replaces or appends plain positions without mutating", () => {
  const current = [P(12, 120, { name: "Start" }), P(12.1, 120)];
  const incoming = [P(12.1, 120.0001, { name: "x", ele: 3 }), P(12.2, 120)];
  assert.deepEqual(core.importPoints(current, incoming, "replace"), [P(12.1, 120.0001), P(12.2, 120)]);
  const appended = core.importPoints(current, incoming, "append");
  assert.deepEqual(appended, [current[0], current[1], P(12.2, 120)]);
  assert.equal(current.length, 2);
});

test("pinMatch flags the same name first, then the nearest site or anchorage within 2 nm", () => {
  const sites = [{ id: "s1", title: "Twin Lagoon", latitude: 12.0, longitude: 120.0 }, { id: "s2", title: "Far reef", latitude: 12.5, longitude: 120.0 }];
  const anchorages = [{ id: "a1", name: "Coron Town", latitude: 12.01, longitude: 120.0 }];
  const near = core.pinMatch({ name: "Somewhere", latitude: 12.011, longitude: 120 }, sites, anchorages);
  assert.equal(near.kind, "anchorage");
  assert.equal(near.name, "Coron Town");
  assert.ok(near.nm < 0.1);
  const named = core.pinMatch({ name: "  far REEF ", latitude: 12.011, longitude: 120 }, sites, anchorages);
  assert.deepEqual([named.kind, named.name, named.sameName], ["site", "Far reef", true]);
  assert.equal(core.pinMatch({ name: "Lonely", latitude: 14, longitude: 121 }, sites, anchorages), null);
  const noPos = core.pinMatch({ name: "Hidden", latitude: 14, longitude: 121 }, [{ id: "h", title: "Hidden", latitude: "", longitude: "" }], []);
  assert.equal(noPos.nm, Infinity);
});

test("xmlEscape escapes the five XML characters", () => {
  assert.equal(core.xmlEscape(`A & B <"x"> 'y'`), "A &amp; B &lt;&quot;x&quot;&gt; &apos;y&apos;");
  assert.equal(core.xmlEscape(undefined), "");
});

const EXPORT_ROUTE = {
  id: "coron-loop",
  name: "Coron & Culion",
  points: [
    P(11.9975, 120.201, { anchorage_id: "coron-town", name: "Coron <Town>" }),
    P(12.004, 120.165),
    P(12.018, 120.125, { name: "Siete Pecados" }),
    P(12.036, 120.096, { anchorage_id: "lusong" })
  ]
};

test("toGpx writes GPX 1.1: stops as wpt, every point as rtept, names escaped", () => {
  const gpx = core.toGpx(EXPORT_ROUTE);
  assert.ok(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Iolanthe Admin" xmlns="http://www.topografix.com/GPX/1/1">'));
  assert.equal((gpx.match(/<wpt /g) || []).length, 2);
  assert.equal((gpx.match(/<rtept /g) || []).length, 4);
  assert.ok(gpx.includes("<metadata><name>Coron &amp; Culion</name></metadata>"));
  assert.ok(gpx.includes('<wpt lat="11.997500" lon="120.201000"><name>Coron &lt;Town&gt;</name></wpt>'));
  assert.ok(gpx.includes('<rtept lat="12.004000" lon="120.165000"></rtept>'));
  assert.ok(gpx.includes('<rtept lat="12.018000" lon="120.125000"><name>Siete Pecados</name></rtept>'));
  assert.ok(gpx.includes('<rtept lat="12.036000" lon="120.096000"><name>Stop</name></rtept>'));
  assert.ok(gpx.trimEnd().endsWith("</gpx>"));
});

test("toKml writes one LineString (lon,lat order) and a Point placemark per stop", () => {
  const kml = core.toKml(EXPORT_ROUTE);
  assert.ok(kml.includes('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Coron &amp; Culion</name>'));
  assert.ok(kml.includes("<LineString><coordinates>120.201000,11.997500,0 120.165000,12.004000,0 120.125000,12.018000,0 120.096000,12.036000,0</coordinates></LineString>"));
  assert.equal((kml.match(/<Point>/g) || []).length, 2);
  assert.ok(kml.includes("<Placemark><name>Coron &lt;Town&gt;</name><Point><coordinates>120.201000,11.997500,0</coordinates></Point></Placemark>"));
  assert.ok(kml.trimEnd().endsWith("</Document></kml>"));
});

test("exportBaseName uses the route id, else a slug of the name, else 'route'", () => {
  assert.equal(core.exportBaseName(EXPORT_ROUTE), "coron-loop");
  assert.equal(core.exportBaseName({ id: "", name: "Coron loop (copy)" }), "coron-loop-copy");
  assert.equal(core.exportBaseName({ id: "", name: "" }), "route");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test`
Expected:
- 15 new tests fail with `TypeError: core.parseKmlCoordinates is not a function` (and similar for `extractGeo`,
  `simplify` and the others)
- the 28 existing tests pass

- [ ] **Step 3: Implement in routes-core.js**

Insert this block inside the factory, directly before the line `  return {`:

```js
  // ---------- import / export (spec §4.2, §4.3) ----------
  const IMPORT_TARGET_POINTS = 60; // the default Simplify tolerance keeps an imported line under about this many points
  const MAX_TOLERANCE_M = 200;
  const TOLERANCE_STEP_M = 5;
  const PIN_MATCH_NM = 2;          // an imported pin is flagged "near X" within this range (the PR #2 rule)

  const validPos = (p) => Boolean(p) && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
    && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

  // KML <coordinates>: whitespace-separated "lon,lat[,alt]" tuples. Invalid tuples are dropped.
  function parseKmlCoordinates(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean)
      .map((tuple) => tuple.split(",").map((part) => (part.trim() === "" ? NaN : Number(part))))
      .map(([longitude, latitude]) => ({ latitude, longitude }))
      .filter(validPos);
  }

  // KML descriptions are often HTML. Keeps the text, one line per <br> or block element.
  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  function htmlToText(value) {
    return String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, e) => {
        if (e[0] === "#") {
          const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        const named = ENTITIES[e.toLowerCase()];
        return named === undefined ? match : named;
      })
      .split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
  }

  // Element helpers that match on localName, so default and prefixed namespaces (kml:Placemark) both work.
  const descendants = (node, name) => Array.from(node.getElementsByTagName("*")).filter((n) => n.localName === name);
  const child = (node, name) => (node ? Array.from(node.children || []).find((n) => n.localName === name) || null : null);
  const childText = (node, name) => { const n = child(node, name); return n ? String(n.textContent || "").trim() : ""; };
  const gpxPoint = (n) => ({ latitude: parseFloat(n.getAttribute("lat")), longitude: parseFloat(n.getAttribute("lon")) });

  // Reads a parsed KML or GPX document. root is the documentElement: the browser parses with DOMParser, and the tests
  // pass a tiny fake element. Lines: KML LineString, GPX rte / trk (all segments). Pins: KML Point placemarks, GPX wpt.
  // Invalid coordinates are dropped, and a line needs 2 valid points to count.
  function extractGeo(root, filename) {
    const byName = root.localName === "gpx" ? "gpx" : (root.localName === "kml" ? "kml" : "");
    const type = byName || (/\.gpx$/i.test(filename || "") ? "gpx" : "kml");
    const lines = [];
    const pins = [];
    let name;
    if (type === "gpx") {
      name = childText(child(root, "metadata"), "name");
      descendants(root, "rte").forEach((r, i) => lines.push({ name: childText(r, "name") || `Route ${i + 1}`, points: descendants(r, "rtept").map(gpxPoint) }));
      descendants(root, "trk").forEach((t, i) => lines.push({ name: childText(t, "name") || `Track ${i + 1}`, points: descendants(t, "trkpt").map(gpxPoint) }));
      descendants(root, "wpt").forEach((w, i) => pins.push({ name: childText(w, "name") || `Pin ${i + 1}`, description: childText(w, "desc") || childText(w, "cmt"), ...gpxPoint(w) }));
    } else {
      name = childText(child(root, "Document") || root, "name");
      descendants(root, "Placemark").forEach((pm, i) => {
        const pmName = childText(pm, "name") || `Placemark ${i + 1}`;
        descendants(pm, "LineString").forEach((ls) => lines.push({ name: pmName, points: parseKmlCoordinates(childText(ls, "coordinates")) }));
        descendants(pm, "Point").forEach((pt) => {
          const pos = parseKmlCoordinates(childText(pt, "coordinates"))[0];
          if (pos) pins.push({ name: pmName, description: htmlToText(childText(pm, "description")), ...pos });
        });
      });
    }
    return {
      type,
      name,
      lines: lines.map((l) => ({ ...l, points: l.points.filter(validPos) })).filter((l) => l.points.length >= 2),
      pins: pins.filter(validPos)
    };
  }

  // Douglas-Peucker on a local flat projection, tolerance in metres. Always keeps the first and last points.
  function simplify(points, tolM) {
    if (!(tolM > 0) || points.length < 3) return points.slice();
    const lat0 = points[0].latitude * Math.PI / 180;
    const xy = points.map((p) => [p.longitude * 111320 * Math.cos(lat0), p.latitude * 110540]);
    const segDist = (p, a, b) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    };
    const keep = points.map((_, i) => i === 0 || i === points.length - 1);
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let maxD = 0;
      let idx = -1;
      for (let i = s + 1; i < e; i += 1) {
        const d = segDist(xy[i], xy[s], xy[e]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tolM) { keep[idx] = true; stack.push([s, idx], [idx, e]); }
    }
    return points.filter((_, i) => keep[i]);
  }

  // The smallest tolerance (5 m steps, up to 200 m) that brings the line to IMPORT_TARGET_POINTS points or fewer.
  function defaultTolerance(points) {
    for (let t = 0; t <= MAX_TOLERANCE_M; t += TOLERANCE_STEP_M) {
      if (simplify(points, t).length <= IMPORT_TARGET_POINTS) return t;
    }
    return MAX_TOLERANCE_M;
  }

  // Joins lines in file order. A line that starts within 50 m of where the previous one ended loses that duplicate point.
  const joinLines = (lines) => lines.reduce((acc, line) => joinPoints(acc, line.points), []);

  // pick: { join: true } for all lines in file order, otherwise { line: index }.
  function chosenLinePoints(lines, pick) {
    if (pick && pick.join) return joinLines(lines);
    const line = lines[(pick && pick.line) || 0];
    return line ? line.points : [];
  }

  // Imported points as plain positions: they replace the route's points, or are appended (dropping a duplicate join point).
  function importPoints(current, incoming, mode) {
    const plain = incoming.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    return mode === "append" ? joinPoints(current, plain) : plain;
  }

  // The site or anchorage an imported pin may duplicate: the same name (ignoring case) first, then the nearest within 2 nm.
  function pinMatch(pin, sites, anchorages) {
    const key = (s) => String(s || "").trim().toLowerCase();
    const candidates = [
      ...(sites || []).map((s) => ({ kind: "site", name: s.title || s.id || "Site", pos: s })),
      ...(anchorages || []).map((a) => ({ kind: "anchorage", name: a.name || a.id, pos: a }))
    ].map((x) => ({ kind: x.kind, name: x.name, nm: validPos(x.pos) ? distNm(pin, x.pos) : Infinity, sameName: key(x.name) === key(pin.name) }))
      .filter((x) => x.sameName || x.nm <= PIN_MATCH_NM)
      .sort((x, y) => (y.sameName - x.sameName) || (x.nm - y.nm));
    return candidates[0] || null;
  }

  const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  const xmlEscape = (s) => String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
  const fix6 = (n) => Number(n).toFixed(6);

  function slugify(name) {
    return String(name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  const exportBaseName = (route) => route.id || slugify(route.name) || "route";

  // GPX 1.1: stops as <wpt>, then one <rte> with every point. Stops and named points carry <name>.
  function toGpx(route) {
    const title = xmlEscape(route.name || "Route");
    const pts = route.points || [];
    const wpts = pts.filter(isStop).map((p) => `  <wpt lat="${fix6(p.latitude)}" lon="${fix6(p.longitude)}"><name>${xmlEscape(p.name || "Stop")}</name></wpt>`);
    const rtepts = pts.map((p) => {
      const label = p.name || (isStop(p) ? "Stop" : "");
      return `    <rtept lat="${fix6(p.latitude)}" lon="${fix6(p.longitude)}">${label ? `<name>${xmlEscape(label)}</name>` : ""}</rtept>`;
    });
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Iolanthe Admin" xmlns="http://www.topografix.com/GPX/1/1">',
      `  <metadata><name>${title}</name></metadata>`,
      ...wpts,
      "  <rte>",
      `    <name>${title}</name>`,
      ...rtepts,
      "  </rte>",
      "</gpx>",
      ""
    ].join("\n");
  }

  // KML: one LineString placemark plus a Point placemark per stop. KML coordinates are lon,lat,alt.
  function toKml(route) {
    const title = xmlEscape(route.name || "Route");
    const pts = route.points || [];
    const coord = (p) => `${fix6(p.longitude)},${fix6(p.latitude)},0`;
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${title}</name>`,
      `  <Placemark><name>${title}</name><LineString><coordinates>${pts.map(coord).join(" ")}</coordinates></LineString></Placemark>`,
      ...pts.filter(isStop).map((p) => `  <Placemark><name>${xmlEscape(p.name || "Stop")}</name><Point><coordinates>${coord(p)}</coordinates></Point></Placemark>`),
      "</Document></kml>",
      ""
    ].join("\n");
  }

```

Then replace the last line of the returned object

```js
    sitesWithin, nearbyAnchorages, stopAt, makeStopAt, appendStop, anchorageMovedM, routesUsingAnchorage
  };
```

with

```js
    sitesWithin, nearbyAnchorages, stopAt, makeStopAt, appendStop, anchorageMovedM, routesUsingAnchorage,
    IMPORT_TARGET_POINTS, MAX_TOLERANCE_M, TOLERANCE_STEP_M, PIN_MATCH_NM, validPos, parseKmlCoordinates, htmlToText,
    extractGeo, simplify, defaultTolerance, joinLines, chosenLinePoints, importPoints, pinMatch, xmlEscape, slugify,
    exportBaseName, toGpx, toKml
  };
```

(`joinPoints`, `distNm` and `isStop` are already defined above in the same factory.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test`
Expected: `ℹ tests 43`, `ℹ pass 43`, `ℹ fail 0`. (For reference, the sample track's default tolerance is 25 m,
which gives 47 points.)

- [ ] **Step 5: Commit**

```bash
git add routes-core.js test/routes-core.test.js
git commit -m "feat: routes-core KML/GPX parsing, simplify, pin matching and GPX/KML export"
```

---

### Task 3: Export (GPX and KML) with the header button

**Files:**
- Create: `routes-io.js` (export part; Task 4 replaces it with the full file)
- Modify: `routes-ui.js` (icons), `routes.js` (by script), `routes.css`, `index.html`

- [ ] **Step 1: Add the import and export icons to routes-ui.js**

In `routes-ui.js`, replace the `join:` line of `ICONS` (the last entry, which has no trailing comma) with:

```js
    join: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><path d="M7 6h3a4 4 0 0 1 4 4v0a4 4 0 0 0 4 4h3M7 18h3a4 4 0 0 0 4-4"/><path d="M18 11l3 3-3 3"/>',
    import: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    export: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'
```

These are the mockup's own icons.

- [ ] **Step 2: Create `routes-io.js` (export only)**

```js
// Routes panel: KML / GPX import (pick or join lines, Simplify, Replace / Append), the temporary imported pins, and
// GPX / KML export. The browser parses the file (DOMParser); everything after that is in routes-core.js.
(function () {
  "use strict";

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // ctx: { A, core, places, getWork, getMap, isDirty(), editPoints(fn, opts), renderAll(opts) }
  function create(ctx) {
    const { A, core: c } = ctx;
    const { el, openModal } = window.IolantheRoutesUi;

    // ---------- export ----------
    function download(filename, text, type) {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = el("a", { href: url, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function openExport() {
      const work = ctx.getWork();
      if (!work || work.route.points.length < 2) { A.setStatus("A route needs at least 2 points to export.", "error"); return; }
      const route = work.route;
      const base = c.exportBaseName(route);
      const stops = route.points.filter(c.isStop).length;
      let modal = null;
      const button = (ext, cls, make, type) => el("button", {
        type: "button", class: cls,
        onclick: () => { download(`${base}.${ext}`, make(route), type); A.setStatus(`Downloaded ${base}.${ext}`, "ok"); modal.close(); }
      }, `Download ${base}.${ext}`);
      const body = el("div", {},
        el("p", {}, `${plural(stops, "stop")}. Stops and named points carry their names, so a chartplotter shows them as named waypoints.`),
        el("div", { class: "icon-row" },
          button("gpx", "text-btn", c.toGpx, "application/gpx+xml"),
          button("kml", "text-btn secondary", c.toKml, "application/vnd.google-earth.kml+xml")),
        el("p", { class: "meta" }, "GPX 1.1: one route with every point, plus the stops as waypoints. KML: one line plus a pin per stop."),
        ctx.isDirty() ? el("p", { class: "meta" }, "The file includes your unsaved changes.") : null);
      modal = openModal({ title: "Export route", body });
    }

    return { openExport };
  }

  window.IolantheRoutesIo = Object.freeze({ create });
})();
```

- [ ] **Step 3: Wire it into routes.js with a checked script**

Save as `<scratchpad>/wire_export.py`, then run `python "<scratchpad>/wire_export.py" routes.js` from the repo root.

```python
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else "routes.js"
raw = open(PATH, encoding="utf-8", newline="").read()
eol = "\r\n" if "\r\n" in raw else "\n"
text = raw.replace("\r\n", "\n")


def replace_once(old, new):
    global text
    count = text.count(old)
    assert count == 1, f"expected 1 match, found {count}: {old[:80]!r}"
    text = text.replace(old, new)


replace_once(
    "// routes-places.js (anchorages, sites).\n",
    "// routes-places.js (anchorages, sites), routes-io.js (KML / GPX import, imported pins, export).\n")

replace_once(
    "  let join = null;       // IolantheRoutesJoin instance, created fresh by each bind()\n",
    "  let join = null;       // IolantheRoutesJoin instance, created fresh by each bind()\n"
    "  let io = null;         // IolantheRoutesIo instance (import, pins, export), created fresh by each bind()\n")

replace_once(
    '      b("join", "Add another route to this one", () => join.openJoin()),\n',
    '      b("join", "Add another route to this one", () => join.openJoin()),\n'
    '      b("export", "Export GPX / KML", () => io.openExport(), "", work.route.points.length < 2),\n')

replace_once(
    "      editPoints,\n"
    "      status\n"
    "    });\n",
    "      editPoints,\n"
    "      status\n"
    "    });\n"
    "    io = window.IolantheRoutesIo.create({\n"
    "      A: A(),\n"
    "      core: core(),\n"
    "      places: myPlaces,\n"
    "      getWork: () => work,\n"
    "      getMap: () => map,\n"
    "      isDirty,\n"
    "      editPoints,\n"
    "      renderAll\n"
    "    });\n")

open(PATH, "w", encoding="utf-8", newline="").write(text.replace("\n", eol))
print(f"{PATH}: {text.count(chr(10))} lines")
```

Expected: `routes.js: 756 lines`.

- [ ] **Step 4: Modal text styles (routes.css)**

The export and import modals use `.meta`, `.empty` and `.banner`. Only `.routes-panel` defines them today, which also
leaves the join modal's preview banner unstyled. In `routes.css`, insert directly before the line
`@media (max-width: 900px) {`:

```css
.routes-modal .meta { font-size: 12px; color: var(--muted); }
.routes-modal .empty { color: var(--muted); font-size: 13px; }
.routes-modal .banner { border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.4; }
.routes-modal .banner.info { background: #e4f1f3; color: #0e4f58; }
.routes-modal .banner.warn { background: var(--warn-bg); color: #5c3c00; }

```

- [ ] **Step 5: index.html**

Add the `routes-io.js` tag between `routes-join.js` and `routes.js`:

```html
  <script src="/admin/routes-join.js?v=admin-routes-v3" defer></script>
  <script src="/admin/routes-io.js?v=admin-routes-v3" defer></script>
  <script src="/admin/routes.js?v=admin-routes-v3" defer></script>
```

- [ ] **Step 6: Static checks**

```bash
for f in routes.js routes-ui.js routes-io.js; do node --check "$f" || echo "FAIL $f"; done
node --test
grep -c "admin-routes-v3" index.html
```

Expected: no `FAIL`, 43 pass, `11`.

- [ ] **Step 7: Browser check**

Use the logged-in tab, reload it, run the helpers snippet, then open Charter → Routes → "Coron loop".

1. **The header row:** Save, Cancel | Undo, Redo | New, Save As, Add another route, **Export** (down-arrow-to-tray
   icon, tooltip "Export GPX / KML"), Delete.
2. Click New: the Export button is disabled (no points). Switch back to "Coron loop".
3. **The Export modal:**
   - Click Export: the modal "Export route" says "2 stops. …", with two buttons, "Download coron-loop.gpx" and
     "Download coron-loop.kml"
   - no point count appears anywhere (D9)
   - Escape closes it
4. **GPX:**
   - run `__armExport()`, open Export, click "Download coron-loop.gpx"
   - the modal closes and the status says "Downloaded coron-loop.gpx"
   - then run:

     ```js
     const t = window.__exported[0] || "";
     ({ name: window.__downloadName, gpx11: t.includes('<gpx version="1.1"'), wpt: (t.match(/<wpt /g) || []).length, rtept: (t.match(/<rtept /g) || []).length, named: t.includes("<name>Lusong Island</name>") })
     ```

     Expected: `{ name: "coron-loop.gpx", gpx11: true, wpt: 2, rtept: 6, named: true }`.
5. **KML:**
   - run `__armExport()` again and download the KML
   - `window.__exported[0]` contains `<LineString><coordinates>120.201000,11.997500,0 ` (lon,lat order) and two
     `<Point>`s
6. **Unsaved edits:**
   - make an edit (drag a waypoint) and open Export: it shows "The file includes your unsaved changes."
   - Cancel the edit with the red Cancel button
7. Reload the tab: this restores the real download functions. Confirm `read_console_messages` with `onlyErrors: true`
   is empty.

- [ ] **Step 8: Commit**

```bash
git add routes-io.js routes-ui.js routes.js routes.css index.html
git commit -m "feat: Routes export - GPX 1.1 and KML download from the header"
```

---

### Task 4: Import (KML/GPX) and the temporary imported pins

**Files:**
- Modify: `routes-io.js` (replace with the full file), `routes.js` (by script), `routes-places.js`, `routes.css`

**Behaviour decisions** (see "Decisions" in the self-review):
- Pins are never saved.
- Pins stay on the map when you switch routes or press New. **Leaving the panel**, or closing the tab, warns while any
  unpromoted pins remain.
- Make anchorage / Make site remove the pin once the place is saved. If the modal is cancelled, the pin stays.
- Importing into a new, unsaved route sets `source: {type, filename}` and, if the name is blank, a name taken from the
  file.

- [ ] **Step 1: Let the Site Editor bridge take a description**

In `routes-places.js`, replace

```js
    // closes without saving. opts: { name } pre-fills the title of a new site; pos gives its position.
```

with

```js
    // closes without saving. opts: { name, description } pre-fill a new site; pos gives its position.
```

and replace

```js
        const defaults = site ? undefined : { title: (opts && opts.name) || "", latitude: pos.latitude, longitude: pos.longitude, tags: [], images: [], media: [] };
```

with

```js
        const defaults = site ? undefined : { title: (opts && opts.name) || "", description: (opts && opts.description) || "", latitude: pos.latitude, longitude: pos.longitude, tags: [], images: [], media: [] };
```

The old KML pin importer carried a pin's description into the new site. This keeps that.

- [ ] **Step 2: Replace `routes-io.js` with the full version**

```js
// Routes panel: KML / GPX import (pick or join lines, Simplify, Replace / Append), the temporary imported pins, and
// GPX / KML export. The browser parses the file (DOMParser); everything after that is in routes-core.js.
(function () {
  "use strict";

  const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // larger files are refused before reading
  const MAX_SOURCE_TEXT = 120;               // the server's limit for a route name and source.filename
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // ctx: { A, core, places, getWork, getMap, isDirty(), editPoints(fn, opts), renderAll(opts) }
  function create(ctx) {
    const { A, core: c, places } = ctx;
    const { el, fmtPos, openModal } = window.IolantheRoutesUi;
    let pins = [];  // temporary imported pins { id, name, description, latitude, longitude }. Never saved.
    let pinSeq = 0;

    const closePopup = () => { const map = ctx.getMap(); if (map) map.closePopup(); };
    const dropPin = (id) => { pins = pins.filter((p) => p.id !== id); };

    function parseFile(text, filename) {
      const doc = new DOMParser().parseFromString(text, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) throw new Error("the file is not valid XML");
      return c.extractGeo(doc.documentElement, filename);
    }

    // ---------- imported pins ----------
    function drawPins(L, group, opts) {
      if (!opts.show) return;
      pins.forEach((pin) => {
        const html = `<div class="mk-pin"></div><div class="mk-label">${A.escapeHtml(pin.name)}</div>`;
        L.marker([pin.latitude, pin.longitude], { icon: opts.divIcon(html), title: pin.name, zIndexOffset: 600 })
          .bindPopup(() => pinPopup(pin), { minWidth: 240, maxWidth: 300, autoPanPadding: [20, 60] })
          .addTo(group);
      });
    }

    // Make anchorage / Make site: the pin goes once the anchorage or site is saved; it stays if the modal is cancelled.
    async function promote(pin, open) {
      closePopup();
      const saved = await open();
      if (!saved) return;
      dropPin(pin.id);
      ctx.renderAll();
    }

    function pinPopup(pin) {
      const match = c.pinMatch(pin, places.sites(), places.anchorages());
      const near = match
        ? `Near ${match.kind} "${match.name}"${Number.isFinite(match.nm) ? ` (${match.nm.toFixed(1)} nm)` : ""}${match.sameName ? ", same name" : ""}. It may be a duplicate.`
        : "";
      const btn = (label, cls, onclick) => el("button", { type: "button", class: cls, onclick }, label);
      return el("div", { class: "pop" },
        el("h3", {}, pin.name),
        el("div", { class: "sub" }, `Imported pin · ${fmtPos(pin)} · not saved`),
        match ? el("div", { class: "banner warn", style: "margin-bottom:8px" }, near) : null,
        pin.description ? el("div", { class: "pin-desc" }, pin.description) : null,
        el("div", { class: "actions" },
          btn("Add to route", "text-btn secondary", () => {
            closePopup();
            dropPin(pin.id);
            ctx.editPoints((pts) => [...pts, { latitude: pin.latitude, longitude: pin.longitude, name: pin.name }]);
          }),
          btn("Make anchorage", "text-btn secondary", () => promote(pin, () => places.openAnchorageModal(null, pin, { name: pin.name }))),
          btn("Make site", "text-btn secondary", () => promote(pin, () => places.openSiteModal(null, pin, { name: pin.name, description: pin.description }))),
          btn("Delete", "text-btn danger-text", () => { closePopup(); dropPin(pin.id); ctx.renderAll(); })));
    }

    // ---------- import ----------
    function openImport() {
      if (!ctx.getWork()) return;
      const fileInput = el("input", { type: "file", accept: ".kml,.gpx" });
      const stage = el("div", {});
      let parsed = null;
      let filename = "";
      const pick = { line: 0, join: false, tol: 0, mode: "replace" };
      const raw = () => (parsed ? c.chosenLinePoints(parsed.lines, pick) : []);
      const retune = () => { pick.tol = c.defaultTolerance(raw()); };
      const radio = (name, checked, label, on) => el("label", {}, el("input", { type: "radio", name, checked, onchange: on }), label);

      function renderStage() {
        if (!parsed) {
          stage.replaceChildren(el("div", { class: "file-drop" },
            el("div", {}, "Choose a .kml or .gpx file. Lines become route points; pins appear as temporary orange markers."),
            fileInput));
          return;
        }
        const points = raw();
        const lineChoice = parsed.lines.length > 1 ? el("div", { class: "field" }, el("label", {}, "Line"),
          el("div", { class: "radio-list" },
            parsed.lines.map((l, i) => radio("import-line", !pick.join && pick.line === i, `${l.name} (${plural(l.points.length, "point")})`,
              () => { pick.join = false; pick.line = i; retune(); renderStage(); })),
            radio("import-line", pick.join, "Join all lines in file order", () => { pick.join = true; retune(); renderStage(); }))) : null;
        const slider = el("input", { type: "range", min: "0", max: String(c.MAX_TOLERANCE_M), step: String(c.TOLERANCE_STEP_M), value: String(pick.tol), "aria-label": "Simplify tolerance in metres" });
        const count = el("b", {}, plural(c.simplify(points, pick.tol).length, "point"));
        const tolLabel = el("span", { class: "meta" }, `${pick.tol} m`);
        slider.addEventListener("input", () => {
          pick.tol = Number(slider.value);
          count.textContent = plural(c.simplify(points, pick.tol).length, "point");
          tolLabel.textContent = `${pick.tol} m`;
        });
        const hasPoints = ctx.getWork().route.points.length > 0;
        stage.replaceChildren(...[
          el("p", {}, el("b", {}, filename), ` · ${plural(parsed.lines.length, "line")}, ${plural(parsed.pins.length, "pin")}`),
          lineChoice,
          parsed.lines.length
            ? el("div", { class: "field" }, el("label", {}, "Simplify"), el("div", { class: "slider-row" }, slider, tolLabel),
              el("div", { class: "meta" }, count, ` from ${points.length}. The default keeps it under about ${c.IMPORT_TARGET_POINTS}.`))
            : el("p", { class: "empty" }, "No lines found. Only pins will be imported."),
          hasPoints && parsed.lines.length ? el("div", { class: "field" }, el("label", {}, "The open route already has points"),
            el("div", { class: "radio-list" },
              radio("import-mode", pick.mode === "replace", "Replace them", () => { pick.mode = "replace"; }),
              radio("import-mode", pick.mode === "append", "Append to the end", () => { pick.mode = "append"; }))) : null,
          parsed.pins.length ? el("p", { class: "meta" }, `${plural(parsed.pins.length, "pin")} will show as temporary orange markers. They are not saved until you make them an anchorage or a site.`) : null
        ].filter(Boolean));
      }

      async function load(file) {
        if (!/\.(kml|gpx)$/i.test(file.name)) { A.setStatus("Choose a .kml or .gpx file. KMZ isn't supported: export it as KML first.", "error"); return; }
        if (file.size > MAX_IMPORT_BYTES) { A.setStatus("That file is over 10 MB, too big to import.", "error"); return; }
        try {
          const geo = parseFile(await file.text(), file.name);
          if (!geo.lines.length && !geo.pins.length) { A.setStatus("No lines or pins found in that file.", "error"); return; }
          parsed = geo;
          filename = file.name;
          pick.line = 0;
          pick.join = false;
          if (parsed.lines.length) retune(); else pick.tol = 0;
          renderStage();
        } catch (error) {
          A.setStatus(`Couldn't read the file: ${error.message || "unknown error"}.`, "error");
        }
      }
      fileInput.addEventListener("change", () => { if (fileInput.files[0]) load(fileInput.files[0]); });

      renderStage();
      openModal({
        title: "Import KML / GPX", body: stage, wide: true, saveTitle: "Import",
        onSave: () => {
          if (!parsed) { A.setStatus("Choose a file first.", "error"); return false; }
          const work = ctx.getWork();
          const newPts = c.simplify(raw(), pick.tol);
          const added = parsed.pins.map((p) => ({ ...p, id: `pin-${++pinSeq}` }));
          pins = [...pins, ...added];
          if (newPts.length) {
            const mode = work.route.points.length ? pick.mode : "replace";
            const fresh = !work.route.id;
            if (fresh) {
              const name = work.route.name || (parsed.name || filename.replace(/\.(kml|gpx)$/i, "")).slice(0, MAX_SOURCE_TEXT);
              work.route = { ...work.route, name, source: { type: parsed.type, filename: filename.slice(0, MAX_SOURCE_TEXT) } };
            }
            ctx.editPoints((pts) => c.importPoints(pts, newPts, mode), { fit: true, inputs: fresh });
          } else {
            ctx.renderAll();
          }
          A.setStatus(`Imported ${plural(newPts.length, "point")} and ${plural(added.length, "pin")}.`, "ok");
          return true;
        }
      });
    }

    // ---------- export ----------
    function download(filename, text, type) {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = el("a", { href: url, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function openExport() {
      const work = ctx.getWork();
      if (!work || work.route.points.length < 2) { A.setStatus("A route needs at least 2 points to export.", "error"); return; }
      const route = work.route;
      const base = c.exportBaseName(route);
      const stops = route.points.filter(c.isStop).length;
      let modal = null;
      const button = (ext, cls, make, type) => el("button", {
        type: "button", class: cls,
        onclick: () => { download(`${base}.${ext}`, make(route), type); A.setStatus(`Downloaded ${base}.${ext}`, "ok"); modal.close(); }
      }, `Download ${base}.${ext}`);
      const body = el("div", {},
        el("p", {}, `${plural(stops, "stop")}. Stops and named points carry their names, so a chartplotter shows them as named waypoints.`),
        el("div", { class: "icon-row" },
          button("gpx", "text-btn", c.toGpx, "application/gpx+xml"),
          button("kml", "text-btn secondary", c.toKml, "application/vnd.google-earth.kml+xml")),
        el("p", { class: "meta" }, "GPX 1.1: one route with every point, plus the stops as waypoints. KML: one line plus a pin per stop."),
        ctx.isDirty() ? el("p", { class: "meta" }, "The file includes your unsaved changes.") : null);
      modal = openModal({ title: "Export route", body });
    }

    return { openImport, openExport, drawPins, pinCount: () => pins.length };
  }

  window.IolantheRoutesIo = Object.freeze({ create });
})();
```

- [ ] **Step 3: Wire import, pins, layers and the guard into routes.js**

Save as `<scratchpad>/wire_import.py`, then run `python "<scratchpad>/wire_import.py" routes.js` from the repo root.

```python
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else "routes.js"
raw = open(PATH, encoding="utf-8", newline="").read()
eol = "\r\n" if "\r\n" in raw else "\n"
text = raw.replace("\r\n", "\n")


def replace_once(old, new):
    global text
    count = text.count(old)
    assert count == 1, f"expected 1 match, found {count}: {old[:80]!r}"
    text = text.replace(old, new)


# Imported pins get a layer checkbox, a map layer group and a draw call.
replace_once(
    '  const ui = { mode: "select", layers: { sites: true, anchorages: true } };\n',
    '  const ui = { mode: "select", layers: { sites: true, anchorages: true, pins: true } };\n')

replace_once(
    '    $("layers").replaceChildren(item("sites", "var(--site)", "Sites"), item("anchorages", "var(--stop)", "Anchorages"));\n',
    '    const pinCount = io ? io.pinCount() : 0;\n'
    '    $("layers").replaceChildren(item("sites", "var(--site)", "Sites"), item("anchorages", "var(--stop)", "Anchorages"),\n'
    '      item("pins", "var(--pin)", `Imported pins${pinCount ? ` (${pinCount})` : ""}`));\n')

replace_once(
    '    ["tender", "sites", "anchorages", "route", "mids", "points"].forEach(',
    '    ["tender", "sites", "anchorages", "pins", "route", "mids", "points"].forEach(')

replace_once(
    "    routeLines = [\n",
    "    if (io) io.drawPins(L, groups.pins, { show: ui.layers.pins, divIcon });\n"
    "\n"
    "    routeLines = [\n")

# The Import header button, before Export.
replace_once(
    '      b("export", "Export GPX / KML", () => io.openExport(), "", work.route.points.length < 2),\n',
    '      b("import", "Import KML / GPX", () => io.openImport()),\n'
    '      b("export", "Export GPX / KML", () => io.openExport(), "", work.route.points.length < 2),\n')

# Unsaved guard: leaving the panel also warns about unpromoted pins (spec §4.1). Switching routes or New asks about
# route edits only, because the pins stay on the map until the panel is left.
replace_once(
    "  async function guardDiscard() {\n"
    "    if (!isDirty()) return true;\n"
    "    const ok = await A().showAdminConfirm(guard.confirmOptions);\n",
    "  const ROUTE_DISCARD = { title: \"Unsaved route\", message: \"Discard your unsaved route changes?\", confirmLabel: \"Discard\", cancelLabel: \"Cancel\", tone: \"danger\" };\n"
    "\n"
    "  // Leaving the panel loses unsaved route edits and the imported pins that weren't made into anchorages or sites.\n"
    "  function leaveConfirm() {\n"
    "    const n = io ? io.pinCount() : 0;\n"
    "    const pinText = n ? `${n} imported pin${n === 1 ? \" hasn't\" : \"s haven't\"} been made into an anchorage or site and will be lost.` : \"\";\n"
    "    const message = [isDirty() ? \"Discard your unsaved route changes?\" : \"\", pinText].filter(Boolean).join(\" \");\n"
    "    return { ...ROUTE_DISCARD, title: isDirty() ? \"Unsaved route\" : \"Imported pins\", message };\n"
    "  }\n"
    "\n"
    "  async function guardDiscard() {\n"
    "    if (!isDirty()) return true;\n"
    "    const ok = await A().showAdminConfirm(ROUTE_DISCARD);\n")

replace_once(
    "    guard = {\n"
    "      isDirty,\n"
    '      confirmOptions: { title: "Unsaved route", message: "Discard your unsaved route changes?", confirmLabel: "Discard", cancelLabel: "Cancel", tone: "danger" }\n'
    "    };\n",
    "    guard = {\n"
    "      isDirty: () => isDirty() || Boolean(io && io.pinCount()),\n"
    "      get confirmOptions() { return leaveConfirm(); }\n"
    "    };\n")

open(PATH, "w", encoding="utf-8", newline="").write(text.replace("\n", eol))
print(f"{PATH}: {text.count(chr(10))} lines")
```

Expected: `routes.js: 771 lines`.

Notes for the reviewer:
- `afterPersist()` still re-registers the guard only when the **route** is clean. That's correct, because the guard
  object itself now also checks pins.
- The keyboard guard already ignores Ctrl+Z while a `.routes-modal` is open, so the import modal is covered.

- [ ] **Step 4: Pin description style (routes.css)**

Insert after the line `.routes-panel .pop .nearby .d { font-weight: 400; opacity: .85; }`:

```css
.routes-panel .pop .pin-desc { white-space: pre-line; max-height: 7.5em; overflow: auto; font-size: 12px; color: var(--muted); margin-bottom: 8px; }
```

- [ ] **Step 5: Static checks**

```bash
for f in routes.js routes-io.js routes-places.js; do node --check "$f" || echo "FAIL $f"; done
node --test
wc -l routes.js routes-io.js
```

Expected: no `FAIL`, 43 pass, `771 routes.js`, `196 routes-io.js`.

- [ ] **Step 6: Browser check**

Use the logged-in tab, reload it, run the helpers snippet, then open Charter → Routes → "Coron loop".

1. **The header:** Import (up-arrow icon, tooltip "Import KML / GPX") sits between Add another route and Export.
   The layers box shows a third row, "Imported pins".
2. **Two lines and the Simplify slider:**
   - click Import, then run `__feedImport(__sampleKml(), "west-busuanga.kml")`
   - the modal shows "west-busuanga.kml · 2 lines, 5 pins" and a Line choice ("Track to Black Island (211 points)",
     "Short spur (3 points)", "Join all lines in file order")
   - Simplify shows "25 m" and "47 points from 211"
   - "The open route already has points" offers Replace them / Append to the end
   - dragging the slider to 0 shows "211 points from 211"; back to 25
3. **Replace:**
   - choose Replace and press Import (green)
   - the route is replaced (map fits the new line) and the status says "Imported 47 points and 5 pins."
   - 5 orange diamond pins appear with labels, and the layers row reads "Imported pins (5)"
   - the Stops tab is empty and the meta line says "unsaved changes"
4. **Undo and Redo:** Undo brings back the old Coron loop points (the pins stay); Redo re-applies the import.
5. **Pin popups:**
   - "Lusong anchorage" shows "Near anchorage "Lusong Island" (0.1 nm). It may be a duplicate." (If a dev-data site
     is nearer, that site is named instead: the nearest match wins.)
   - "Coron Town" (the pin at 11.9, 120.3) shows "Near anchorage "Coron Town" (8.3 nm), same name. It may be a
     duplicate." A same-name match wins at any distance.
   - "Siete Pecados" shows its description on two lines: "Snorkel reef" / "Best at high tide"
   - "Reef & shallows" shows the decoded "&" in its heading
6. **Pin actions:**
   - **Add to route** on "Quiet bay": the pin disappears and a named waypoint is appended (the route line now ends
     there). Count: Imported pins (4).
   - **Make anchorage** on "Reef & shallows": the anchorage modal opens with the name and position filled in.
     Cancel: the pin stays. Do it again and Save: an anchorage marker appears and the pin is gone (3).
   - **Make site** on "Siete Pecados": the admin's Site Editor opens with the title, position and description filled
     in. Cancel: the pin stays (still 3). Don't save a test site unless you delete it afterwards.
   - **Delete** on "Lusong anchorage": it's gone (2 left: "Siete Pecados" and "Coron Town").
7. **Layers:** unticking "Imported pins" hides the pins; ticking shows them again.
8. **Pins survive a route switch:**
   - discard the route edits: Cancel (red) → Discard. The pins stay.
   - pick "Culion run" in the route picker: there's no confirm, because the route is clean, and the pins are still on
     the map
9. **Leaving the panel warns about pins:**
   - with the route clean but pins left, click Charter → Itinerary
   - an "Imported pins" confirm appears: "N imported pins haven't been made into an anchorage or site and will be
     lost."
   - choose Cancel: you stay on Routes and the pins are still there
   - with route edits as well, the confirm is titled "Unsaved route" and mentions both
10. **Append and the duplicate drop:**
    - open "Coron loop", click Import, then run `__feedImport(__sampleGpx(), "plotter.gpx")`
    - it shows "2 lines, 1 pin": "Broken" is dropped for its impossible latitude, and the first line is named
      "Route 1", not "Leaving"
    - choose "Join all lines in file order": Simplify reads "… from 5". The route's last point and the track's first
      point are the same place, so the duplicate is dropped.
    - choose Append and Import: the points are added to the end, and the pin "Siete Pecados" appears (now as a second
      pin of that name if the first one is still there)
    - discard the edit
11. **A new route from a file:**
    - click New, click Import, feed `__sampleGpx()` as "plotter.gpx", pick the first line and Import
    - the Name field fills with "Plotter & test"
    - Save (green) opens "Save new route" with that name
    - Save it, then check the meta line: "source: imported from plotter.gpx"
    - delete this test route afterwards with the header Delete
12. **Bad files:**
    - feed `__feedImport("not xml <", "bad.kml")`: the status says "Couldn't read the file: the file is not valid
      XML." and the modal stays on the file chooser
    - feed `__feedImport("<kml xmlns='http://www.opengis.net/kml/2.2'/>", "empty.kml")`: "No lines or pins found in
      that file."
    - feed `__feedImport("x", "track.kmz")`: the KMZ message
    - press Import with no file loaded: "Choose a file first." and the modal stays open
13. **Round trip:**
    - open "Coron loop", run `__armExport()`, then Export → GPX
    - Import, then run `__feedImport(window.__exported[0], "roundtrip.gpx")`: 1 line (6 points) and 2 pins (the
      stops as waypoints)
    - Cancel
    - reload the tab afterwards to restore the download functions
14. `read_console_messages` with `onlyErrors: true` is empty throughout.

- [ ] **Step 7: Commit**

```bash
git add routes-io.js routes.js routes-places.js routes.css
git commit -m "feat: Routes import - KML/GPX lines with Simplify and Replace/Append, temporary imported pins"
```

---

### Task 5: Retire Route Upload and the KML pin import modal (admin.js, admin.css)

**Files:**
- Modify: `admin.js` and `admin.css` (both CRLF), through the checked script below

**What goes:**
- the Charter → "Route Upload" panel entry and its render and bind branches
- the panel's markup and status helpers: `routeUploadDateLabel` … `renderRouteUploadPanel`
- `uploadRoute`
- the KML pin parsing helpers, `parseKmlPins`, the PR #2 pin-to-site matching (`kmlPinMatches`), the compare map
  (`openKmlPinCompareMap`, PR #3) and the pin import modal (`openKmlPinImportModal`)
- `distanceNauticalMiles` and `formatNauticalMiles`, used only there
- the `plannedRoute` argument, passed only for this panel
- the `.route-upload-*`, `.route-plan-*`, `.kml-pin-*` and `.kml-compare-*` CSS

**What stays:**
- the server endpoint `/api/admin/charter/<id>/upload-route` (removed in phase 4)
- the shared helpers listed under "Facts"

**What else depends on the removed code** (checked; nothing breaks, but note these):
- The "Guests are using the Alternative itinerary, but no Alternative route is uploaded…" notice
  (`routeUploadFallbackNoticeHtml`) existed **only** on this panel, so it disappears until phase 4. Spec §4.5 moves it
  to the Itinerary route rows. The code is in git history at this task's parent commit.
- **Until phase 4 adds assign / unassign, nobody can change a charter's route from the admin.** Existing charter
  routes keep working for guests. This is open question 1. This task is its own commit so it can be held back from the
  merge.
- `renderCharter` still loads `planned-route.json` in its bundle, which is harmless. Phase 4's Itinerary rows will
  need it.

- [ ] **Step 1: Run the checked removal script**

Save as `<scratchpad>/retire_upload.py`, then run `python "<scratchpad>/retire_upload.py" .` from the repo root. Each
cut checks that the removed block defines exactly the expected functions, in order, so a moved or renamed function
stops the script before anything is written.

```python
"""Retires the Route Upload panel and the KML pin import modal / compare map (PRs #2/#3) from admin.js and admin.css.
Run from the repo root: python retire_upload.py .   (admin.js and admin.css use CRLF; line endings are kept.)"""
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."


def load(name):
    raw = open(f"{ROOT}/{name}", encoding="utf-8", newline="").read()
    return raw, ("\r\n" if "\r\n" in raw else "\n")


def save(name, text, eol):
    open(f"{ROOT}/{name}", "w", encoding="utf-8", newline="").write(text.replace("\n", eol))


def once(text, anchor):
    n = text.count(anchor)
    assert n == 1, f"expected 1 match, found {n}: {anchor[:80]!r}"
    return text.index(anchor)


def cut(text, start, end, expect_names):
    """Removes [start, end): end is kept. Checks the removed block defines exactly expect_names, in order."""
    a, b = once(text, start), once(text, end)
    assert a < b, "anchors out of order"
    block = text[a:b]
    names = re.findall(r"^  (?:async )?function (\w+)|^  const (\w+) = ", block, re.M)
    names = [x or y for x, y in names]
    assert names == expect_names, f"unexpected definitions in removed block: {names}"
    return text[:a] + text[b:]


def replace(text, old, new):
    once(text, old)
    return text.replace(old, new)


raw, eol = load("admin.js")
js = raw.replace("\r\n", "\n")

# 1. Panel markup and its status helpers (only the Route Upload panel uses them).
js = cut(js, "  function routeUploadDateLabel(value) {\n", "  function renderSitesPanel() {\n", [
    "routeUploadDateLabel", "routePlanLabel", "routePlanData", "routePlanHasData", "routeUploadFallbackNoticeHtml",
    "routeUploadPlanStatusHtml", "routeUploadStatusHtml", "renderRouteUploadPanel"])

# 2. Upload handler, KML pin parsing, pin-to-site matching, compare map and the pin import modal.
js = cut(js, "  async function uploadRoute(event) {\n", "  async function renderGalley() {\n", [
    "uploadRoute", "kmlChildrenByName", "kmlDescendantsByName", "kmlChildText", "kmlHtmlToText", "kmlExtendedData",
    "parseKmlPins", "KML_PIN_MATCH_RADIUS_NM", "distanceNauticalMiles", "formatNauticalMiles", "kmlPinSiteDescription",
    "kmlPinPreview", "kmlPinMatches", "kmlMatchLabel", "uniqueKmlSiteName", "mergeSiteDescription", "kmlTooltipHtml",
    "openKmlPinCompareMap", "openKmlPinImportModal"])

# 3. The panel entry, its render branch and its bind branch. plannedRoute was only passed for Route Upload.
js = replace(js, '      { id: "route-upload", label: "Route Upload" },\n', "")
js = replace(js,
    '    if (activePanel === "route-upload") {\n'
    "      return renderRouteUploadPanel(plannedRoute, itinerary, charterInfo);\n"
    "    }\n", "")
js = replace(js,
    '    if (activePanel === "route-upload") {\n'
    '      const form = document.getElementById("route-upload-form");\n'
    '      const fileInput = document.getElementById("route-file");\n'
    '      form.addEventListener("submit", uploadRoute);\n'
    '      document.getElementById("route-upload-cancel")?.addEventListener("click", () => {\n'
    "        form.reset();\n"
    "        if (fileInput) {\n"
    "          fileInput.focus();\n"
    "        }\n"
    "      });\n"
    "      return;\n"
    "    }\n", "")
js = replace(js,
    "  function charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary, plannedRoute) {\n",
    "  function charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary) {\n")
js = replace(js, '      const plannedRoute = bundle["planned-route.json"] || {};\n', "")
js = replace(js,
    "      const content = charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary, plannedRoute);\n",
    "      const content = charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary);\n")

for gone in ["route-upload", "uploadRoute", "parseKmlPins", "openKmlPin", "kmlPin", "KML_PIN_MATCH", "plannedRoute",
             "routePlanLabel", "distanceNauticalMiles", "formatNauticalMiles", "kmlTooltipHtml", "mergeSiteDescription"]:
    assert gone not in js, f"still referenced in admin.js: {gone}"
save("admin.js", js, eol)

raw, eol = load("admin.css")
css = raw.replace("\r\n", "\n")
a, b = once(css, ".route-upload-status {\n"), once(css, ".drink-stock-controls {\n")
block = css[a:b]
assert set(re.findall(r"^\.([\w-]+)", block, re.M)) == {"route-upload-status", "route-upload-status-grid", "route-upload-status--empty", "route-plan-selector", "route-plan-option"}
css = css[:a] + css[b:]
a = once(css, ".kml-pin-import {\n")
assert all(s.startswith((".kml-pin", ".kml-compare")) for s in re.findall(r"^\S[^{\n]*", css[a:], re.M) if s.strip() != "}")
css = css[:a].rstrip("\n") + "\n"
for gone in ["route-upload", "route-plan-", "kml-pin", "kml-compare"]:
    assert gone not in css, f"still in admin.css: {gone}"
save("admin.css", css, eol)
print("admin.js and admin.css: Route Upload and the KML pin import removed")
```

Expected: `admin.js and admin.css: Route Upload and the KML pin import removed`.

- [ ] **Step 2: Static checks**

```bash
node --check admin.js
grep -n "route-upload\|Route Upload\|kml-pin\|kml-compare\|parseKmlPins" admin.js admin.css index.html
wc -l admin.js admin.css
git diff --stat
file admin.js admin.css
```

Expected:
- `node --check` is silent
- grep finds nothing
- `15039 admin.js`, `3079 admin.css`
- the diff stat shows only deletions (about 597 in admin.js and 275 in admin.css), plus the 3 changed
  `charterPanelContent` / `renderCharter` lines
- both files still read "with CRLF line terminators"

- [ ] **Step 3: Browser check**

Use the logged-in tab and reload it.

1. The Charter section's panel buttons read Charter Info, Itinerary, Crew, Routes, Site Editor. There's no "Route
   Upload".
2. Each of those panels opens without errors:
   - Charter Info and Itinerary show the charter data
   - Site Editor lists sites, and Add site opens and cancels
   - Routes loads with its map
3. Galley opens: its render function directly follows the removed block.
4. `read_console_messages` with `onlyErrors: true` is empty.

- [ ] **Step 4: Commit**

```bash
git add admin.js admin.css
git commit -m "refactor: retire Route Upload and the KML pin import modal (replaced by Routes import)"
```

---

### Task 6: Desktop and phone checks, docs, merge with David's approval, handoff

**Files:**
- Modify: `CLAUDE.md`, `docs/route-planner/HANDOFF.md`

- [ ] **Step 1: Version string**

Run `grep -o "admin-routes-v[0-9]*" index.html | sort | uniq -c`.
Expected: `11 admin-routes-v3`, with no v2 left (2 stylesheets and 9 scripts). The bump itself landed in Task 1.

- [ ] **Step 2: Desktop and phone checks**

Use the logged-in tab, with Routes → "Coron loop" open and the sample KML imported (Replace, then Undo, so that pins
are showing). Check at desktop `resize_window` 1280×820, then at 390×844:
- **The header row:** 12 controls in all. Save and Cancel, then a separator, then Undo and Redo, then a separator,
  then New, Save As, Add another route, Import, Export and Delete. On the phone it wraps cleanly with no sideways
  scroll. Check that `document.documentElement.scrollWidth <= innerWidth` is true.
- **The Import modal** fits the screen on the phone. The slider can be used, and the Line radio labels wrap.
- **A pin popup** (one with a description) fits on the phone. All four action buttons can be reached.
- **The layers box,** now three rows, doesn't cover the mode toolbar on the phone.
- **The Export modal's** two download buttons wrap on the phone.

Take one screenshot at each size, then reset with `preset: "desktop"`. Discard the route edits, and leave the panel
through the pin warning.

- [ ] **Step 3: Tests**

Run: `node --test`
Expected: 43 pass, 0 fail.

- [ ] **Step 4: CLAUDE.md**

Under "## Stack", replace the `routes.js` / `routes.css` bullet and the `routes-places.js` bullet with:

```markdown
- `routes.js` / `routes.css` — Charter → Routes panel: state, side panel, header, map, saving and wiring. It uses the
  `window.IolantheAdmin` helpers exposed at the end of `admin.js`, and its styles are scoped under `.routes-panel` /
  `.routes-modal`. Helper files, each created per bind with a `ctx` from routes.js:
  - `routes-ui.js` — `el()`, icons, `fmtPos` and the modal shell (`openModal`)
  - `routes-popup.js` — the point popup
  - `routes-lists.js` — the Stops / Legs tab lists and per-leg speeds
  - `routes-join.js` — Add another route
  - `routes-places.js` — anchorages and sites on the map, the anchorage modal, and the bridge to the admin's Site
    Editor modal (`IolantheAdmin.openSiteEditorModal`)
  - `routes-io.js` — KML/GPX import (DOMParser, Simplify, Replace/Append), temporary imported pins, GPX/KML export
```

Commit:

```bash
git add CLAUDE.md
git commit -m "docs: routes helper files in CLAUDE.md"
```

- [ ] **Step 5: Ask David before merging**

Merging to `main` releases the admin: the cron pulls it within 5 minutes. Tell David:
- the branch and what it does
- that Route Upload is gone, so no route can be put on a charter until phase 4 (open question 1)
- that Task 5's commit can be left out of the merge if he wants Route Upload kept until then

Merge only on his clear yes, with his choice on Task 5:

```bash
git switch main && git merge --no-ff feat/routes-phase3 -m "Merge feat/routes-phase3: Routes KML/GPX import and export"
git push origin main
```

(If he wants Route Upload kept, revert the Task 5 commit on the branch before merging: `git revert <task5-hash>`.
Phase 4 then reverts that revert.)

- [ ] **Step 6: HANDOFF update (after the merge)**

In `docs/route-planner/HANDOFF.md`:
- **Top line:** "Phases 1, 2 and 3 are complete (phase 3 at `<merge hash>`)".
- **Add a "## Phase 3 (done, <date>)" section** with:
  - the plan path
  - the new files, and `routes.js` at 771 lines
  - 43 tests
  - version `admin-routes-v3`
  - features: import (pick or join lines, Simplify with a default of 60 points or fewer, Replace / Append), pins
    (Add to route, Make anchorage, Make site with the description, Delete, "near X", never saved, the leave
    warning), and export (GPX 1.1 and KML)
  - whether Route Upload was retired
  - the review fixes
- **Note for phase 4:**
  - `upload-route` is still on the server; remove it
  - the Alternative-route fallback notice needs rebuilding on the Itinerary rows. The old
    `routeUploadFallbackNoticeHtml` and `routePlanData` are at the Task 5 parent commit.
  - charter copies go into `routes-join.js`
- **Replace "## Next: phase 3"** with "## Next: phase 4", taken from spec §5, and mention that Q2 is still open.
- **Remove the follow-up** "routes.js is 974 lines …".

Commit straight to `main`, because it's docs only: `git commit -am "docs: Route Planner handoff - phase 3 done" && git push origin main`.

---

## Execution notes

**Order:** 1 → 2 → 3 → 4 → 5 → 6.

| Task | Files | Must follow | Could run alongside |
|---|---|---|---|
| 1 | routes.js, routes-ui/popup/lists/join.js (new), index.html | — | 2, 5 |
| 2 | routes-core.js, test/routes-core.test.js | — | 1, 5 |
| 3 | routes-io.js (new), routes-ui.js, routes.js, routes.css, index.html | 1 (routes.js, routes-ui.js, index.html), 2 (uses `core.toGpx` etc.) | 5 |
| 4 | routes-io.js, routes.js, routes-places.js, routes.css | 3 (routes-io.js, routes.js, routes.css) | 5 |
| 5 | admin.js, admin.css | — | 1–4 |
| 6 | CLAUDE.md, HANDOFF.md; checks across everything | 1–5 | — |

- **Same files, so these run one after another:**
  - Tasks 1 → 3 → 4 all edit `routes.js`
  - Tasks 1 and 3 both edit `index.html` and `routes-ui.js`
  - Tasks 3 and 4 both edit `routes-io.js` and `routes.css`
  - each wiring script checks for anchors that the previous task's script creates, so they must run in order
- **Independent by file:**
  - Task 2 touches only the pure module and its tests
  - Task 5 touches only `admin.js` and `admin.css`
- **In practice, run them one at a time anyway:**
  - every task commits to one branch in one working tree
  - the browser checks share one dev server and **one logged-in tab** that the controller hands over
  - David prefers agent batches one at a time

  Running 2 or 5 in parallel would need its own worktree and branch, cherry-picked afterwards, and its browser check
  would still have to wait for the tab. Only Task 2 has no browser check, so it's the one task that could sensibly run
  in a separate worktree while Task 1's browser check is going on.
- **Review after every task** (spec review, then quality review), as in phases 1 and 2.
- The scripts go in the scratchpad, not the repo. Re-running a script on an already-edited file fails its first
  `replace_once` assertion: that's the intended protection against double edits.

---

## Self-review notes

**Spec coverage:**
- §4.2:
  - `.kml` / `.gpx` accepted: Task 4 `load`
  - lines from LineString / rte / trk: Task 2 `extractGeo`
  - pick or join in file order: Task 2 `chosenLinePoints` / `joinLines`, and Task 4's Line radios
  - Simplify, 0–200 m, live count, default under about 60: Task 2 `simplify` / `defaultTolerance`, and the Task 4
    slider
  - Replace / Append when the route has points: Task 2 `importPoints`, and the Task 4 radios
  - pins from Point / wpt as orange markers: Tasks 2 and 4
  - pin popup with Add to route, Make anchorage, Make site and Delete: Task 4
  - "near X" (same name or within 2 nm, the PR #2 rule): Task 2 `pinMatch`
  - pins never saved: Task 4 (they live only in `routes-io.js` memory)
  - PR #2/#3 modal and compare map retired: Task 5
- §4.3:
  - GPX 1.1 with one rte and every rtept, names on stops and named points, stops also as wpt: Task 2 `toGpx`
  - KML with one LineString and a Point per stop: `toKml`
  - file name `<route-id>.gpx/.kml`: `exportBaseName`
  - generated in the browser: Task 3
- §4.1:
  - header Import / Export in the house icon style, in spec order: Tasks 3 and 4
  - the Layers "Imported pins" row: Task 4
  - the unsaved guard warning about unpromoted pins: Task 4
- §5 phase 3, "remove the old upload panel and pin modal": Task 5. The server endpoint stays, as §3 says.
- D9: no point counts outside the import modal. The Export modal shows stops only.

**Decisions made in this plan** (for David's review):
1. **Parsing split** (see "Why parsing is split"): DOMParser in the browser, and a duck-typed, unit-tested
   `extractGeo`. It matches on `localName` and takes names from direct children only. That fixes two mockup bugs:
   prefixed KML wasn't read, and a GPX route took its first point's name.
2. **The pure logic stays in `routes-core.js`** (364 lines), not a new module. It reuses `joinPoints`, `distNm` and
   `isStop`, and the existing Node/browser wrapper and test file.
3. **The Task 1 split goes further than the popup.** Moving only the popup and `openModal` left `routes.js` at 837
   lines, and phase 3 would push it to about 865. `routes-lists.js` and `routes-join.js` bring it to 744, and 771
   after phase 3. Phase 4's join changes then land in `routes-join.js`.
4. **Pins belong to the panel visit, not to a route.** Switching routes or New keeps them, and asks only about route
   edits. Leaving the panel, or closing the tab, warns. The mockup instead cleared the pins whenever the route's
   changes were discarded.
5. **Joining lines and Append drop a duplicate meeting point within 50 m**, reusing `joinPoints`, the same rule as Add
   another route.
6. **Importing into a new unsaved route** sets `source {type, filename}` and fills a blank name from the document name
   or the file name (both cut to 120 characters). Importing into a saved route keeps its source.
7. **Pin descriptions are kept.** KML HTML is turned into text, and GPX `desc`/`cmt` is used as it is. They show in
   the pin popup and pre-fill Make site's description, as the retired importer did. This is a one-line change to
   `routes-places.js`.
8. **Make anchorage on a pin** creates the anchorage only and doesn't add a stop, as in the mockup. Cancelling keeps
   the pin.
9. **Add to route appends a named waypoint.** Undo removes that point but doesn't bring the pin back.
10. **Limits:**
    - `.kml` / `.gpx` only, with a KMZ hint
    - 10 MB at most
    - invalid XML, or no lines and no pins, gives a status error and the modal stays open
    - the mockup's "Use a sample KML" demo button isn't ported; the browser checks feed files through
      `__feedImport` instead
11. **Export works on the working copy,** including unsaved edits, and says so. A stop with no name exports as "Stop".
12. **The version moves to `admin-routes-v3` in Task 1,** not at the end, because static files have no cache headers.
    Task 6 checks it.
13. **Task 5 also removes** the `plannedRoute` argument and the two nautical-mile helpers that only the removed code
    used. It adds the missing `.routes-modal .meta/.empty/.banner` styles (Task 3), which also fixes the unstyled
    join preview banner.

**Placeholder scan:**
- Every code step has complete code or a complete script.
- The only runtime values left to fill in are `<scratchpad>` (the executing agent's scratchpad path), `<merge hash>`,
  `<date>` and `<task5-hash>`.

**Type and name consistency:**
- **`ctx` shapes:**
  - `IolantheRoutesPopup.create` takes `{core, places, getWork, getMap, editPoints, editPointsQuiet, makeStopAtAnchorage}`
  - `IolantheRoutesLists.create` takes `{A, core, places, getWork, speedKn, defaultSpeed, maxSpeed, editPoints, focusPoint, focusLeg}`
  - `IolantheRoutesJoin.create` takes `{core, getWork, getRoutes, editPoints, status}`
  - `IolantheRoutesIo.create` takes `{A, core, places, getWork, getMap, isDirty, editPoints, renderAll}`

  Each matches its use in the wiring scripts.
- **`io` returns** `{openExport}` in Task 3. In Task 4 it returns `{openImport, openExport, drawPins, pinCount}`, and
  Task 4's script is the first to call `openImport`, `drawPins` and `pinCount`.
- **Core names** used in `routes-io.js` are all exported in Task 2: `extractGeo`, `chosenLinePoints`,
  `defaultTolerance`, `simplify`, `importPoints`, `pinMatch`, `exportBaseName`, `toGpx`, `toKml`, `isStop`,
  `MAX_TOLERANCE_M`, `TOLERANCE_STEP_M` and `IMPORT_TARGET_POINTS`.
- **Checked while writing this plan:**
  - the code was syntax-checked with `node --check`
  - the 43 tests pass against the Task 2 code
  - the new tests fail (`… is not a function`) against today's `routes-core.js`
  - the Task 1, Task 3 and Task 4 scripts applied in order to today's `routes.js` give 744, 756 and 771 lines
  - the Task 5 script applied to today's admin.js and admin.css gives files that pass `node --check` with CRLF kept
  - a DOM-free smoke run loaded all the modules together and called `create()` and each modal opener
  - **not yet browser-tested**: that's the job of each task's browser check
