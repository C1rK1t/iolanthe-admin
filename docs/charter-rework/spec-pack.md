# Charter rework — spec P: the charter pack (draft 1)

Written 2026-10-09 from the brainstorm recorded in [decisions.md](decisions.md) (entries P-D1 … P-D14). The captain
wants to send a charter's details to the client or the charter agent: a **proposal** before booking and a **charter
brief** once confirmed. David's first thought was a polished PDF; the captain suggested the web (zenvue.app). Both are
wanted, in two phases:

- **Phase 1 (this spec):** a Charter Pack page in the admin that renders the pack as A4 pages and saves it as a PDF
  through the browser's print dialog.
- **Phase 2 (own spec, later):** a separate mini-site on a zenvue.app subdomain (for example `charters.zenvue.app`)
  that publishes a static snapshot of the same pack. It does **not** touch the ZenVue app (my.zenvue.app); it is a new
  nginx vhost + certificate on the droplet. Phase 1 must keep the pack renderable away from the boat (see §7).

Mockups (git-ignored, `.superpowers/brainstorm/180653-*/content/`): `pack-generator-layout.html` (A chosen),
`pack-style.html` (themes A/B/C), `pack-watermark.html` and `pack-watermark-v3.html` (branding; v3 is the chosen
direction with the stamp dropped).

Repos: **A** = `portal/iolanthe-admin`, **S** = `iolanthe/iolanthe-server`. Release **S first**, then **A**.

---

## 1. Where it lives (P-D3)

A new entry in the Charter section menu, **Charter Pack** (two-line label `Charter<br>Pack`), after Route & Itinerary
and Crew, before Guest view. It is a Charter-department page only. The Gantt band behaves as on the other non-Info
pages (collapsed strip, R3-5).

Layout, two columns (stacking on a narrow screen):

- **Left — settings card**, in the shared admin classes (`.form-section`, `.segmented`, square icon buttons):
  - **Theme**: segmented A · B · C (labels "Editorial", "Modern", "Paper"; P-D6).
  - **Pack type**: segmented Proposal · Charter Brief (P-D5).
  - **Prepared for**: one line (for example "Mr & Mrs Csaba · via Fraser").
  - **Cover note**: a short textarea (plain text, line breaks kept, 600 characters max).
  - **Cover photo**: a thumbnail of the current cover, with square buttons Upload (camera icon) and Reset (back to the
    default hero shot). Upload accepts JPEG, PNG or WebP up to 10 MB.
  - **Sections**: four tick-boxes — Charter summary, Route & itinerary, Crew & yacht, Menus & drinks. At least one
    must stay ticked (the last one cannot be unticked).
- **Right — preview**: the pack's A4 pages, one at a time, scaled to fit the column, with ‹ › page buttons and
  "page n of N". A square ⎙ **Save as PDF** button in the panel header calls `window.print()`.

Settings auto-save (debounced, 800 ms after the last change) as the charter's **preset** (§5); the next visit opens on
the saved settings. A charter with no preset starts on: theme A, type Proposal, empty Prepared for and note, default
cover, all four sections ticked.

Ended charters (the read-only guard is off today) behave like any other: the pack can still be made, for a record.

## 2. The pack document (P-D4, P-D7 … P-D10)

A4 portrait, about 14 mm margins (16 mm on the left, beside the watermark), `@page { size: A4; margin: 0 }` with the margin drawn inside each page box so the
watermark reaches the edge. Pages, in order, each only when its section is ticked and it has content:

1. **Cover** (always). The cover photo (top ~58% of the page, `object-fit: cover`), then the title block:
   pack-type kicker ("CHARTER PROPOSAL" / "CHARTER BRIEF"), "M/Y Princess Iolanthe", the route summary
   ("Cebu → Port Caltom, Busuanga" — first and last stop names; omitted if the charter has no stops), the dates
   ("1 – 9 November 2026"), then "Prepared for …" and the cover note when filled. The **boat stamp** appears once,
   full contrast, beside the Prepared-for block (P-D9).
2. **Charter summary**: dates, nights, guest count, embarkation and disembarkation (first and last stop, with the
   first stop's depart time and the last stop's arrive time when set), and the itinerary's `welcome_message`.
3. **Route & itinerary**: the map (§3) and a day-by-day list — for each charter day, the day number and date, the
   stop name(s), and that day's activities (title, then notes) in order. Long lists flow onto further pages; a day's
   block never splits across a page (`break-inside: avoid`).
4. **Crew & yacht**: the vessel's `description`, its `details` (label / value table) and its `sections` (general
   notes), then the crew list grouped by department (name, position; no photos — P-D12).
5. **Menus & drinks**: each active menu day (label, `todays_notes`, then breakfast / lunch / dinner and any other
   courses, each item name with its description), then the charter's guest drinks (`guest_drinks.json` sections and
   items). An empty file is skipped silently.

Every page after the cover carries:

- **Footer**: pack type · Prepared for (when set) · page number. A proposal adds "Proposal — subject to change".
- **Branding** (P-D8), behind the content, never shifting it:
  - **IOLANTHE** in Times New Roman, reading bottom to top up the left side, stretched to the **full page height**
    (SVG `textLength`), at **5 % opacity**. The content runs over it, not beside it.
  - The **vessel line art** (`vessel-line-art.png`) in the lower right, about half the page width, at **20 % opacity**.
  - Both use the theme's tint colour (A gold `#c8a96b`, B teal `#176f7a`, C navy `#0f2d4a`); the line art is tinted by
    a CSS mask so one asset serves all three.

### Themes (P-D6)

One page structure; the theme is a class on the pack root (`.pack-theme-a/-b/-c`) that changes only colours, fonts
and ornaments:

| | A — Editorial | B — Modern | C — Paper |
|---|---|---|---|
| Inner page | cream `#f8f4ec`, navy ink `#081826` | white, ink `#172026` | cream `#fbf8f1`, navy `#0f2d4a` |
| Cover | navy `#081826` with photo | white with photo, stat tiles (days · stops · nm) | cream, centred, no tiles |
| Type | Georgia / serif | Arial / sans-serif | Times New Roman |
| Accents | gold rules, gold kickers | teal day badges, teal rules | gold ✦ ornament, dotted rules |

A's navy cover is ink-heavy on paper (David: acceptable — packs are mostly sent as PDF).

## 3. The route map (P-D11)

A Leaflet map in the Route & itinerary page, built only for the pack (Leaflet loaded through the existing
`IolantheAdmin.loadLeaflet()`):

- **Base map**: a light, low-detail map (land, sea, coastline; the plan picks the tile provider), not the Route
  page's satellite tiles, which print dark and busy.

- **Shows**: the charter route's line and one numbered marker per **charter stop**. **Hides**: track waypoints,
  unnamed route points, anchorages, sites and global stops not part of this charter. No zoom controls, attribution
  small in the corner (it is required by the tile licence).
- **Labels**: a marker shows only the day number(s) it serves ("2", or "4–5" for a multi-day stay). Stop names go in a
  **key** under the map ("2 · Oslob & Apo Island"), so labels can never collide.
- **Overlap**: at the map's print size and fitted zoom, markers closer than 18 px merge into one marker carrying both
  labels ("3, 4"); the key keeps one line per stop.
- **Fit**: bounds of the route with 8 % padding; fixed size (full content width × 90 mm).
- **Loading**: Save as PDF stays disabled with a "Loading map…" hint until the tiles report `load`; after 15 s, or when
  no tile loaded at all (no internet; a few missing tiles are fine), the map is replaced by "Map couldn't load — the
  route is listed below" and printing is allowed. A failed map stays failed until the page is reopened.
- A charter with no stops shows no map and no key.

## 4. Data used

All read from the server through existing admin endpoints where they exist (the plan pins exact calls): the charter
(`charter.json`), itinerary (`itinerary.json` v2: route, stops, `activities`, `welcome_message`; days derived with
`itinerary-core.js` `deriveDays`), crew (`crew_list.json`), vessel (`library/vessel.json`), menus (`menus.json`) and
guest drinks (`guest_drinks.json`). Nothing is copied into the pack file; the pack always shows current data.

Open data question for David (does not block): the stamp reads **498 GRT**, `vessel.json` says **495 GT**. The pack
prints `vessel.json`; correct whichever is wrong.

## 5. Server (repo S, released first)

- `GET /api/admin/charter/<id>/pack` → `{ pack, revision }`; a charter with no `pack.json` returns the defaults with
  `revision: 0`.
- `PUT /api/admin/charter/<id>/pack` with `{ pack, base_revision }` → writes `charters/<id>/pack.json`
  (`{ revision, theme, type, prepared_for, cover_note, sections, cover_image }`), refusing a stale `base_revision`
  with 409 like the other charter saves. Validation: `theme` ∈ a/b/c, `type` ∈ proposal/brief, `prepared_for` ≤ 120
  chars, `cover_note` ≤ 600 chars, `sections` a non-empty subset of `summary, route, crew, menus`, `cover_image` null
  or the name of a file in the charter's pack folder.
- `POST /api/admin/charter/<id>/pack/cover` uploads the cover, following the existing
  `/api/admin/sites/images/upload` pattern (`siteMediaUploadInfo`-style type check, image types only, 10 MB cap,
  `readRequestBody` with a limit). Stored as `charters/<id>/pack/cover-<timestamp>.<ext>`. A save deletes only the cover
  it replaces; an upload deletes older uploads no save ever named (Fable review H2). Returns the file name; the admin
  then saves it into the preset.
- `GET /api/admin/charter/<id>/pack/cover/<file>` serves it, admin session only, with a strict file-name check (no
  path traversal).
- All four routes need the Charter Admin session, like the rest of `/api/admin/charter/*`.

## 6. Assets (repo A)

- `assets/pack/hero-default.jpg` — the default hero shot (David to supply; until then the placeholder is
  `web_PI_elnido_anchorage_01.JPG` from the Zenith Superyachts site, resized to ≤ 400 KB).
- `assets/pack/stamp.png` — the boat stamp (484 × 484, from David, 2026-10-09).
- `assets/pack/vessel-line-art.png` — copied from the guest repo so the admin does not depend on `GUEST_STATIC_DIR`.

## 7. Code structure (repo A)

- **`pack-core.js`** — pure logic, also a Node module, with `node --test` coverage:
  `defaultPack()`, `validatePack(pack)`, `buildPackModel({ charter, itinerary, crew, vessel, menus, drinks }, pack)` →
  a plain object of pages and their content (no DOM), `mapMarkers(stops, days)` → markers with day labels,
  `mergeMarkers(points, minPx)` → merged markers, `routeSummary(stops)`, `formatDateRange(start, end)`.
- **`pack-render.js`** — `renderPack(model, { theme })` → an HTML string for all pages (the map is a placeholder
  element that the page fills in). It uses no admin globals, so phase 2 can run the same file away from the boat.
- **`charter-pack.js` / `charter-pack.css`** — the page: settings card, preset load and auto-save, cover upload,
  preview pager, the Leaflet map fill, print wiring; `charter-pack.css` holds the themes, branding layers and the
  `@media print` rules (only the pack pages print).
- **`admin.js`** — only the menu entry and a `bindCharterPack` call, as `bindGuestPreview` is wired. Every `?v=` in
  `index.html` is bumped.

## 8. Testing

- `node --test` for `pack-core.js`: defaults, validation (each bad field), model building on the csaba fixture and an
  empty charter, section filtering, marker labels for single and multi-day stops, merging at the threshold, route
  summary with 0 / 1 / many stops, date ranges across months and years.
- Server: node tests for GET defaults, PUT round trip, 409 on stale revision, each validation refusal, upload type and
  size refusals, and the cover file-name check.
- Browser pass on a scratch server: all three themes × both pack types; each section alone and all four; csaba (full)
  and a charter with no stops or menus; upload and reset the cover; reload keeps the preset; Save as PDF to a file and
  check the page breaks, the watermark on every inner page, and that nothing of the admin UI prints.

## 9. Out of scope

Phase 2 (the zenvue.app mini-site); crew photos (P-D12); picking individual days or menu days; emailing the pack from
the admin; prices or contracts. Known gap: custom menu sections beyond breakfast / lunch / dinner / snacks are not in
the pack (the guest site ignores them too).

## 10. Before planning

The site-image upload is broken on the boat today (Site Editor → Media References show broken images). It is a
separate bug, to be fixed **before** this plan, since §5 follows the same upload pattern.
