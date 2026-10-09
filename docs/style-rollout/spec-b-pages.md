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
