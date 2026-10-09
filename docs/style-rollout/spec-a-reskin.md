# Admin style rollout: spec A, the re-skin

*2026-10-09. Brainstormed with David (visual companion: `palette.html`, `reskin-before-after.html` in
`.superpowers/brainstorm/229391-1791509684/content/`).*

## Goal

Give every Admin page the Route page's look in one release, without changing any page's layout, wording or button
positions. The page-by-page layout work (save/cancel in the header, stat tiles, text buttons to icons) is **phase B**,
done afterwards one page at a time.

Origin: David, 2026-10-06 ("roll the Route Planner mockup look out to the whole Admin"); the captain's "muted whites"
on the Route page, 2026-10-07. Backlog entry: `docs/BACKLOG.md`, "Roll the Route Planner mockup style out…".

## Decisions

- **SA-1 Palette: muted, like the Route page** (David picked B over white cards). Cards and dialogs `#dfe6e9`; inputs,
  list rows, tiles and secondary buttons `#f4f6f7`; ink, muted, line, accent, danger and ok as in `routes.css`.
- **SA-2 Phasing: A then B.** A is a site-wide re-skin in one release; B reworks pages one at a time, each on its own
  branch and PR, steered by the captain's feedback.
- **SA-3 Method: restyle the existing classes in place** in `admin.css` (option 1). Not an override stylesheet, not new
  class names in `admin.js`. The diff is CSS (plus the `?v=` bump); `admin.js` is not edited unless a rule cannot be
  reached from CSS (none is expected).
- **SA-4 Left-hand menu:** uppercase labels (12 px, letter-spaced) like the Route page tabs; items 48 px tall, 8 px
  radius, a fainter translucent fill; the selected page is `#dfe6e9` with teal text and a 4 px teal bar on its left
  edge. The Galley guests alert (red with a yellow border) keeps its colours.
- **SA-5 Icon buttons:** the round `.admin-icon-button` / `.icon-button` become 40 px squares with a 6 px radius,
  21 px icons; colours as the Route page (`--ok` green, `--danger` red, `#f4f6f7` secondary, gold kept). The parchment
  preview button keeps its colours and becomes square too. The phone-width query (≤ 480 px) keeps its larger size.
- **SA-6 Text buttons** (bare `button`, `.secondary`, `.danger`, `.success`): 40 px tall (was 48), the Route page's
  `.text-btn` padding and colours. The ≤ 480 px query keeps `min-height: 44px`.
- **SA-7 Labels and inputs:** field labels 11–12 px bold uppercase, muted, letter-spaced; inputs, selects and
  textareas 40 px (was 46), `#f4f6f7` with a `#cfd8dc` border and a 2 px teal focus ring. Checkbox labels
  (`.inline-check`, `.check-grid`) keep sentence case.
- **SA-8 Cards and dialogs:** `.card`, `.modal-card` and the settings sub-panels take the muted card colour; dialogs
  get a 10 px radius and the Route page's shadow; inner panels that were near-white (`#fbfcfc`, `#fff`) become
  `#f4f6f7`.
- **SA-9 Left alone:** the department background colours; the login screen's department tiles; everything that mirrors
  paper (menu paper previews, `.print-*` A4 layouts, the drink stock report tables); the Route page and the Gantt band
  (their own stylesheets are not edited in A); the Guest view's device frame.
- **SA-10 Tokens:** `admin.css` `:root` gains the Route page tokens it lacks (`--card-bg`, `--warn`, `--warn-bg`) and
  `--panel` becomes `#f4f6f7`. Every current `var(--panel)` use (3 in `admin.css`, 3 in the scoped sheets) is checked
  and moved to `--card-bg` where it paints a card. `routes.css` keeps its own scoped copies for now; de-duplicating
  them is a B task.
- **SA-11 Separator before save/cancel:** only where existing markup already allows it from CSS; otherwise it comes
  with that page's B pass.

## Scope of change

| Area | Where (admin.css, approx.) | Change |
|---|---|---|
| Tokens | 1–16, 116–120 | SA-10 |
| Text buttons | 62–115 | SA-6, Route colours |
| Icon buttons | 2417–2460, 354–374, 122–130 | SA-5 |
| Inputs, labels | 379–402 | SA-7 |
| Modals | 622–700 | SA-8 |
| Cards, card header | 882–900, 1075–1090 | SA-8 |
| Section nav | 990–1075 | SA-4 |
| Form grid, settings sub-panels, weather status, telemetry picker | 1151–1260 | SA-7, SA-8 |
| Lists (`.editor-list`, `.record-row`, `.record-summary`) | 1299–1480 | rows `#f4f6f7`, 8 px radius |
| Media queries | 2495–2988 | sizes only where they override the above |

Out of the table on purpose: `.menu-*`, `.print-*`, stock-report tables, `.login-department*`,
`.department-buttons` colours, `body[data-admin-section]` backgrounds.

## Risks

- **Shared class names with the Route page** (`.card`, `.card-header`, `.modal-card`, `.modal-backdrop`, global
  `button`, `input`). The Route page sets its own values under `.routes-panel` / `.routes-modal`, but any property it
  does not set will now inherit the new global value. Check the Route page, its dialogs and the stop strip for
  shifts after the change.
- **Heights:** 48 → 40 px buttons and 46 → 40 px inputs move content up; check the drink stock action column
  (`--drink-stock-actions-width` is computed from the icon size) and any row that aligns an input with a button.
- **Hard-coded whites** in `admin.css` (93 raw hex values) may leave white islands on the muted cards; the plan lists
  each one it changes and each it leaves (paper previews).

## Verification

- `node --test` still 146 (no JS logic changes).
- Browser pass on the scratch server (`127.0.0.1:8000`, 1400 × 900 and a tablet width 820): every section and panel
  (Charter: Charter Admin, Route & Itinerary, Crew, Guest view, Site Editor; Galley: Menus, Guests, Guest view; Hotel:
  Guests, Drink Stocks, Guest Alcohol, Available / Purchased Alcohol, Cocktails, Guest view; Settings: Passwords, OBS
  Feed, Display, Route Track, Weather), one dialog per section, the login screen. Measure with computed styles
  (button 40 px, radius 6 px, card `rgb(223, 230, 233)`) rather than relying on screenshots.
- The Route page and the Gantt band look unchanged (compare computed sizes before and after).
- Menu paper and print previews unchanged.
- Release: bump every `?v=` string in `index.html` (keep the five `?v=1` icon links).

## Phase B (after A is live)

One page per branch/PR: header actions top right (save green / cancel red, separator), stat tiles where they help,
remaining text buttons to icons, plus `routes.css` token de-duplication. Proposed order, busiest first (David to
confirm when A is live): Crew → Site Editor → Galley Menus → Galley Guests → Drink Stocks → the other Hotel alcohol
pages → Cocktails → Settings → login screen.
