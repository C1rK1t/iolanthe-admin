# Admin style rollout: phase B, page by page

*Started 2026-10-09, after re-skin A went live (admin `b87e31a`, assets `admin-reskin-a`). One page per branch / PR,
designed with David in the visual companion and steered by the captain's feedback. Spec A:
`spec-a-reskin.md`.*

Order (David, 2026-10-09: start with Crew): Crew → Site Editor → Galley Menus → Galley Guests → Drink Stocks → the
other Hotel alcohol pages → Cocktails → Settings → login screen.

Patterns carried from the Route page and Charter Admin: header actions top right (save green, cancel red, a separator,
delete last); icons over text; tap targets of at least 40 px; no per-row clutter.

## Crew (2026-10-09)

Mockup `crew-b.html` (`.superpowers/brainstorm/229391-1791509684/content/`); David chose **A, the grouped list**, and
the dialog as shown.

- **SB-C1 Grouped by department.** Crew sit under small uppercase department headings (teal) with a headcount pill;
  the Department column is gone. The order inside a department is unchanged (position order, then role, then name).
- **SB-C2 Slim rows, tap to edit.** One 44 px row per person: name (bold), role (muted), the note on one line
  (ellipsis) and a chevron. The whole row is a button that opens the Edit dialog; the pencil and the red trash on
  every row are gone. Sessions that may not manage crew see the same rows without the chevron, not clickable.
- **SB-C3 Delete lives in the Edit dialog** after a separator: save, cancel, separator, delete, the order Charter
  Admin's header already uses (the mockup showed delete first; consistency won). It still asks "Delete <name>?" first.
  The Add dialog has no delete.
- **SB-C4 Header:** import, then add.
- At ≤ 700 px the row stacks name, role and note with the chevron on the right.

**2026-10-09 EXECUTED** on `feat/crew-b` (assets `admin-crew-b`): `renderCrewPanel`, `openCrewMemberModal` (new
`onDelete` argument), `drawCrewEditors` rewritten with `crewRowElement` and `saveCrewEdit`; the old
`.crew-record-summary` / `.crew-position` / `.crew-department` rules replaced by `.crew-group*` / `.crew-row*`. 146 tests.
Browser pass on the scratch server: 3 groups (Bridge and Deck 7, Engineering 2, Interior 5), rows 44 px; Fred's
dialog shows save, cancel, separator, delete; delete → Cancel keeps the dialog; a temporary member added (new
"Testing" group, long note truncated), edited ("Tester") and deleted ("Crew member deleted.", back to 14); 820 and
390 px wide with no sideways scroll; no console errors.

**2026-10-09 LIVE:** PR iolanthe-admin#22 merged (`32e5213`) and pulled onto the boat.

## Site Editor (2026-10-09)

Mockup `sites-b.html`; David chose **B, name first** (like Crew), the dialog as shown, but the media rows' preview and
remove buttons smaller. Media means images and short clips (mp4, webm, mov).

- **SB-S1 Slim rows, tap to edit.** One 44 px row per site, alphabetical as before: name (bold), position (DMM),
  the description on one line (ellipsis), a small camera with a count where the site has media, a chevron. The
  pencil, camera and red trash on every row are gone; the media preview is in the dialog.
- **SB-S2 Delete in the Edit dialog:** save, cancel, separator, delete (as Crew). The Route page's "Edit site" opens
  the same dialog with no delete (it passes no `onDelete`).
- **SB-S3 Position on one line each:** latitude and longitude side by side, each `deg ° min ' N/S`, with the map-pick
  pin beside them (the "Pick the position on a map…" sentence is gone; the pin has its tooltip). At ≤ 700 px they
  stack with the pin beside both.
- **SB-S4 Media:** heading "Media" (was "Media References"); the preview and remove buttons are 32 px (17 px icons),
  centred in the row.
- **SB-S5 Header separator** (`.card-header .header-sep`) is `#b9c4ca`: `var(--line)` vanished on the muted card
  (affects Charter Admin's header and the Crew / Site dialogs).

**2026-10-09 EXECUTED** on `feat/sites-b` (assets `admin-sites-b`): `coordinateFieldsHtml`, `sitePickerButtonHtml`,
`openSiteEditorModal` (new `onDelete` argument, delete handler, position row, "Media"), `drawSiteEditors` with
`siteRowElement`; CSS `.site-row*` (sharing the Crew row base), `.site-position-row` / `.coordinate-*`, the media row
buttons; the old `.site-record-summary`, `.coordinate-card` / `.coordinate-grid`, `.site-map-picker-row` rules removed.
146 tests. Browser pass: 12 rows, 44 px, camera count on Tubbataha only; dialog 852 → 638 px; media buttons 32 px and
centred; map picker opens and Escape returns to the dialog; the Route-page call has no delete; a temporary site added
(10°30.500'N 120°15.000'E), edited (10°45.250'N) and deleted (back to 12); 820 and 390 px wide with no sideways scroll;
no console errors.
- **SB-S6 (David, before merge): no position in the list.** The row is name, one-line description, media count and
  chevron; the position stays in the dialog. `formatSitePosition` and `formatDmmCoordinate` had no other callers and
  went too.

**2026-10-09 LIVE:** PR iolanthe-admin#23 merged (`cbc0e3e`) and pulled onto the boat.

## Galley Menus (2026-10-09)

Mockup `menus-b.html`; David approved the list and the day dialog and asked for **drag and drop instead of Move up /
Move down** (backlog "Drag and drop instead of Move up / Move down"), days included.

- **SB-M1 Day rows, tap to edit.** One 52 px row per day: grip, DAY n and the date, the title with the notes on one
  line under it (was a strip below the row), meal chips (green = has dishes, dashed = empty; they replace
  "Breakfast: Set | Lunch: Empty"), a 32 px preview eye, a chevron. Inactive days keep a dashed border, the INACTIVE
  label and their promote button, with no grip. Edit, Move up, Move down and the red Clear left the row.
- **SB-M2 Drag a day's menu.** Dropping Day 2's menu on Day 5 moves it there and shifts Days 3-5 up, exactly what
  pressing Move down three times did (`moveActiveMenuDay` step by step); it saves at once, as the arrows did.
- **SB-M3 Day dialog.** Title "Day n · date"; the read-only Day box is gone. Header: save, cancel, separator, copy from
  another day (the old Clone), clear this day (red; "delete this inactive menu" on an inactive day), with the same
  confirmations the row had.
- **SB-M4 Sections.** No gradient and no red trash: a teal uppercase heading, a 32 px + (add dish) and, for Breakfast /
  Lunch / Dinner, a grey eye-off (hide, same confirmation). A custom section has a grip and a pencil; its delete moved
  into the section editor (save, cancel, separator, delete). Custom sections drag among the visible sections one
  neighbour at a time, as Move up / Move down did.
- **SB-M5 Dishes.** Tap a dish to edit it; its delete moved into the dish editor (save, cancel, separator, delete);
  drag the grip to reorder (saved with the day).
- **SB-M6 Drag to reorder** (`drag-reorder.js`, shared): a 28 px grip; pointer events (mouse, finger, pen: HTML5 drag
  and drop does not fire on touch) with `touch-action: none` on the grip; the item lifts and the others slide
  (150 ms, none under reduced motion); the list auto-scrolls near the edge of its scroller (the dialog body or the
  page); the arrow keys on a focused grip move one place and keep focus; a grip never opens its row.

**2026-10-09 EXECUTED** on `feat/menus-b` (assets `admin-menus-b`, now 27 `?v=` strings with `drag-reorder.js`):
`drag-reorder.js` + `test/drag-reorder.test.js` (154 tests); `admin.js` (grip and eye-off icons, `dragHandleHtml`,
`rowChevronHtml`, `bindTapRow`, `menuSectionChipsHtml` replacing `menuSectionSummaryHtml`, `drawMenuRows`,
`drawMenuDaySectionEditors`, `drawMenuFoodItems`, the day / section / dish dialogs); `admin.css` (day rows, chips,
dialog sections and dishes, the grip; the old menu-row, notes-strip and read-only Day box rules removed). Two bugs found
in the browser pass and fixed: a drop could not reach the last slot (the clamped centre sat exactly on its middle;
`dropIndex` now counts reaching the middle), and keyboard focus was lost because `renderGalley` re-renders after the
move (the list now refocuses the moved day's grip when it next draws). Browser pass on the scratch server: a real mouse
drag of Day 1's menu onto Day 3 (Days 2-3 moved up), back with ArrowUp twice (focus kept); a dish dragged below its
neighbour in the dialog; Snacks added, moved up two places by keyboard, deleted from its editor; Cancel → Discard kept
the saved order; Clear on an empty Day 2 confirmed and saved; 820 and 390 px with no sideways scroll; no console
errors. Not tried: a real finger on the bridge tablet.
