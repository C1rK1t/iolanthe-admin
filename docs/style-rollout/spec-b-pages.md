# Admin style rollout: phase B, page by page

*Started 2026-10-09, after re-skin A went live (admin `b87e31a`, assets `admin-reskin-a`). One page per branch / PR,
designed with David in the visual companion and steered by the captain's feedback. Spec A:
`spec-a-reskin.md`.*

Order (David, 2026-10-09: start with Crew): Crew → Site Editor → Galley Menus → Galley Guests → Hotel Guests (added
2026-10-09: it holds the guest-order arrows) → Drink Stocks → the other Hotel alcohol pages → Cocktails → Settings →
login screen.

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

**2026-10-09 LIVE:** PR iolanthe-admin#25 merged (`92577fe`, after merging main: the charter-pack PR #24 had landed;
assets `admin-menus-b2`, 31 `?v=` strings, 177 tests) and pulled onto the boat.

## Galley Guests (2026-10-09)

Mockup `galley-guests-b.html`. Read-only: the chef's view of allergies and preferences (editing is on Hotel → Guests).
Before choosing, David asked what already alerts the chef and how Hotel orders guests:

- **Already there:** the Galley menu's Guests button turns red with a yellow border when an active guest has anything in
  Allergies, and the allergy text was red and bold. Charter Notes' "Dietary restrictions present" is a manual Charter
  Admin tick box, not linked to the guests. Nothing on Menus mentions allergies.
- **Hotel guest order** (`normalizeGuestListForCount`, `findGuestDemotionTargetIndex`, `demoteGuestAtIndex`,
  `moveGuest`, `promoteInactiveGuest`): the principal is always first and cannot be moved past; active guests, then
  inactive. When the charter's guest count drops, blank slots go first (from the bottom), then the last active
  non-principal guest becomes inactive (details kept); when it rises, inactive guests come back first, then blank slots.
  Promoting an inactive guest demotes the last active one. Hotel applies this when Guests opens and saves it with the
  next save there. So the order decides who goes inactive first.

Decisions (David chose **B-lite**, fix both loose ends, add the hint):
- **SB-G1 B-lite.** A red edge and a warning pill on a guest with allergies; a quiet dash for no allergies / no
  preferences (was "No Allergies" / "No Preferences"). No count banner (the red menu button already alerts). Order
  unchanged; inactive guests keep the INACTIVE label and still show their allergies.
- **SB-G2 "None" is not an allergy.** `meaningfulGuestText` treats none, no, nil, nothing, n/a, nka, nkda, "no (known)
  (food) allergies", "no preference(s)", dashes and 0 (trailing . or ! ignored) as empty, for the menu alert and the
  Galley list (allergies and preferences).
- **SB-G3 Galley follows the guest count.** Galley now applies the same `normalizeGuestListForCount` as Hotel, so both
  show the same active guests (before, Galley showed the saved list until Hotel saved).
- **SB-G4 Hotel → Guests hint:** "If the guest count drops, the bottom of the list goes inactive first." under the
  title. The drag that replaces Hotel's arrows comes with its own phase B pass, next, and must keep every rule above
  (principal fixed with no grip, only active non-principal guests draggable, no drop above the principal, inactive
  guests keep Promote, each drop = `moveGuest` steps).

**2026-10-09 EXECUTED** on `feat/galley-guests-b` (assets `admin-galley-guests-b`). Browser pass on the scratch server,
Larry's charter temporarily seeded (4 guests: allergies "Shellfish, tree nuts", "None", "N/A.", "Gluten (coeliac)";
preferences including "no preferences"; guest count 4 → 3) and restored afterwards: Galley showed James (principal)
and Emma with red edges and pills, Sarah and Oliver with dashes, Emma inactive (count 3, last non-principal), the menu
button red; with James's allergy set to "none" the button turned off (Emma is inactive). Hotel → Guests showed the
hint and the same active guests. 177 tests; no console errors from this change.

**2026-10-09 LIVE:** PR iolanthe-admin#27 merged (`cf3fc9f`) and pulled onto the boat.

## Hotel Guests (2026-10-09)

Mockup `hotel-guests-b.html`; David chose **B, icon chips**.

- **SB-H1 Tap to edit; drag to reorder.** One 52 px row per guest: grip, preferred name (♛ for the principal) with the
  full name under it, the cabin as a teal tag, icon chips, a chevron. The principal has no grip; only active guests
  other than the principal have one and only they are drop targets, so nothing lands above the principal. Each drop runs
  `moveGuest` step by step (what Move up / Move down did) and saves; the arrow keys on a grip move one place.
  Grips appear only with full access (`allowReorder`: Charter Admin on the bridge), as the arrows did.
- **SB-H2 Icon chips:** medical notes first (amber), then drinks, diving (ability, qualification, last dive, wetsuit)
  and notes; "None" / "N/A" and the like are left out. Allergies and dietary preferences stay off this list (Galley's
  page); the dialog still edits them.
- **SB-H3 Inactive guests** sit under an "Inactive" heading with a dashed border and keep Promote on the row (same
  confirmation; the last active guest is demoted to make room).
- **SB-H4 Delete in the dialog:** an inactive guest's dialog has delete after a separator (same confirmation). Active
  guests have no delete on Hotel (`allowDelete: false`), as before; "Clear guest slot" appears only where a caller
  allows it.
- **SB-H5 Header:** the guest count as a pill by the title; the order hint (SB-G4) under it.

**2026-10-09 EXECUTED** on `feat/hotel-guests-b` (assets `admin-hotel-guests-b`): `drawGuestEditors` rewritten with
`guestRowElement`, `removeGuestFromList` and `guestDetailChipsHtml`; `openGuestEditModal` gets `onDelete`;
`renderGuestsPanel` gets `count`; CSS `.guest-row*`, `.guest-chip*`, `.guest-cabin`, `.guest-group-title` (the old
`.guest-record-*` rules removed). 177 tests. Browser pass with Larry's charter temporarily seeded (5 guests, count 4)
and restored afterwards: chips as designed (Oliver's "Diving: None" dropped, Sarah's medical chip first and amber);
a real mouse drag of Emma onto the principal stopped just below him; ArrowDown twice moved her back with focus kept;
ArrowUp on the first movable guest did nothing; Promote on Liam demoted Emma; Emma's dialog showed delete (Cancel kept
the dialog), Oliver's none; 820 and 390 px with no sideways scroll.

**2026-10-09 LIVE:** PR iolanthe-admin#28 merged (`c727ed6`) and pulled onto the boat.

## Drink Stocks (2026-10-09)

Mockup `drink-stocks-b.html`; David chose **B, Remaining as a picture**. Found while surveying: the six filters
(minimum widths) and the fixed-width columns made the page scroll sideways below ~1230 px, i.e. on the bridge tablet in
landscape (1180 px).

- **SB-D1 Tap a row to edit.** The pencil and red trash on every row are gone; delete is in the dialog after a
  separator, with the same wording ("Delete all 3 unopened bottles of …?" for a group).
- **SB-D2 Remaining as a picture:** an open bottle is a level bar with its percentage (amber at 25 % or less); unopened
  stock is a bottle × count; none is a dash. The full wording ("3 unopened bottles", "Open 80%") is the tooltip.
- **SB-D3 Pills:** Stock (green in stock, red out of stock, grey sold) and Charter (grey available or sold, teal
  charter, amber internal use).
- **SB-D4 Header:** print as an icon before +; the printable report itself (a paper layout) is unchanged.
- **SB-D5 Layout:** the filters wrap (`auto-fill`, search two tracks wide, 36 px controls) and the columns flex (the
  per-column width measuring is gone), so nothing scrolls sideways; at ≤ 860 px a row is two compact lines (name and
  remaining; category and the pills) instead of the old labelled stack.

**2026-10-09 EXECUTED** on `feat/drink-stocks-b` (assets `admin-drink-stocks-b`): `drawDrinkStockRows` rewritten with
`deleteDrinkStockRow`, `drinkStockRemainingHtml`, `drinkStockStatusTone`, `drinkStockCharterTone`;
`updateDrinkStockListSizing` removed; `openDrinkStockModal` takes `onDelete` / `deleteLabel` / `deleteMessage`; print
icon tone secondary. 177 tests. Browser pass: at 1180 × 820 the six filters sit on one line, no sideways scroll, rows
46 px; Peach 80 % bar, Citron bottle × 3 (tooltip "3 unopened bottles"); a temporary item added, opened and deleted
from its dialog (back to 54); the group dialog's delete reads "Delete all 3 unopened bottles of Absolut?" (cancelled);
print opens the unchanged report; 820 px rows 62 px, 390 px 71 px, no sideways scroll.

**2026-10-09 LIVE:** PR iolanthe-admin#29 merged (`898f89a`) and pulled onto the boat.

## Guest Alcohol (2026-10-09)

No mockup: the page only sets the order (sections, and the drinks in each) in which the charter-linked drinks appear on
the guests' Wine & Drinks page; nothing is edited here and the page saves as a whole. Built directly and shown in the PR.

- **SB-A1 Drag to reorder** replaces Move up / Move down for sections (a grip only when there is more than one section)
  and for the drinks in a section; each move marks the page unsaved, as the arrows did; Save / Cancel unchanged.
- **SB-A2 Rows:** 48 px: grip, name, the description on one line, bottle × count (when more than one; tooltip
  "8 bottles"). Sections: a teal uppercase heading and an item-count pill (the arrows and the "6 items" line went).
- **SB-A3 Header:** preview, separator, save, cancel (Charter Admin's pattern); the line under the title says what the
  order is for.

**2026-10-09 EXECUTED** on `feat/guest-alcohol-b` (assets `admin-guest-alcohol-b`): `drawGuestDrinkSections` /
`drawGuestDrinkItems` rewritten; CSS `.guest-drinks-section-header`, `.guest-drinks-row`, `.guest-drinks-text`. 177
tests. Browser pass on charter "New" (one Wine section, 6 drinks): a real mouse drag of Chablis to the top; Cancel asked
to discard and restored the saved order; ArrowDown / ArrowUp on a grip with focus kept; nothing saved.
