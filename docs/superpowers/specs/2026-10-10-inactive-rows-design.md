# Inactive menu days and guests get a gap and a divider

Date: 2026-10-10. Captain feedback item 04: "A space and a distinction should be added for inactive menu days and
inactive guests." Approved by David the same day (approach 1 of three).

## Problem

Three lists in the admin end in a tail of inactive rows:

- **Galley → Menus** draws one row per menu day. The day sync (`syncMenusToItineraryDays`) numbers the active days 1 to
  N from the charter's day count and files the rest after them as inactive.
- **Hotel → Guests** and **Galley → Guests** list the charter's guests. `normalizeGuestListForCount` marks the guests
  beyond the charter's guest count inactive and sorts them to the bottom.

In every list the truth is the record's `active: false`; the position follows the flag, so the inactive rows are always a
contiguous tail. Today an inactive row has a dashed border, muted text and a small "INACTIVE" pill, Hotel → Guests also
has a small grey heading, and Galley → Guests tints the row a grey that is near invisible against the row colour. None of
them has a gap. On the bridge the captain could not tell at a glance where the charter's days and guests end.

## Design

**One divider, the same in all three lists.** Between the last active and the first inactive row, a block with a clear
gap above it, a thin rule, the word "Inactive" in the small uppercase style the card headings use, and a one-line muted
hint saying why the rows are there:

- Menus: "Beyond the charter's N days. Not shown to guests." (N = 1: "Beyond the charter's 1 day."). When the charter
  has no days yet: "The charter has no days yet. Not shown to guests."
- Guests: "Beyond the guest count of N. Not shown to guests."

The hint is true: the server's guest payload drops inactive guests and the guest site drops inactive menu days. The
divider is a full-width row, so it needs no column tricks at phone width; the hint wraps under the label. The divider is
drawn only when there is at least one inactive row, and once.

**Hollow inactive rows.** An inactive row loses its fill so the card shows through, keeps the dashed border and muted
text, and its chips are greyed. The per-row "INACTIVE" pill goes from these three lists (the divider names the group) and
the Hotel → Guests heading is replaced by the divider. The menu import picker keeps its pill: its rows are a different list.

**Behaviour unchanged.** Tap to edit, drag to reorder the active rows, promote, clear, delete and the dialogs stay as they
are. The order of the records and the saves do not change.

**Code.** One helper in admin.js, `inactiveDividerHtml(hint)`, used by `drawMenuRows`, `drawGuestEditors` and
`renderGalleyGuestsPanel`. One block of rules in admin.css: `.inactive-divider`, and the hollow style for
`.menu-day-row.inactive`, `.guest-row.inactive` and `.galley-guest-row.inactive`.

## Tests

`test/inactive-rows.test.js` runs admin.js in the vm sandbox (as `damaged-page.test.js` does) and, for each of the three
lists, asserts one divider placed just before the first inactive row with the right count in its hint, no pill on the
rows, and no divider when nothing is inactive.

## Release

Bump the `?v=` strings in index.html to `admin-inactive-rows`. Static repo: merging to main releases it.
