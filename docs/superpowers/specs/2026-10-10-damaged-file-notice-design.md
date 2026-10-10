# The admin says when a file can't be read

Date: 2026-10-10. Approved by David the same day. This is spec C §4 for SC-D16, which left "what the admin shows for a
damaged file" open, and the follow-up to iolanthe-server#15 (saves never replace a damaged file). It builds on
iolanthe-server#16 (merged as 8c7a877 and live on 2026-10-10), which marks a damaged spec C file on its GETs and in
`GET /api/admin/revisions`. #16 leaves one gap to the admin, and A5 closes it: a page that loaded a file while it was
damaged could replace the file once it is repaired at revision 0.

## Problem

A data file is damaged when it is there but the server can't read it as a JSON object: it does not parse, is empty,
holds something else, or can't be read (iolanthe-server `lib/data-file.js`). Since #15 no save replaces one: the save
answers 500 "`<file>` can't be read. Fix or restore it before saving." and writes nothing. But the admin still shows the
file as empty at revision 0. The crew see an empty page, type their changes, and learn of the damage only when the save
fails, from the small grey status line under the header.

Two paths do worse than fail to save:

- **Galley → Menus with a damaged `charter.json`.** The page reads 0 charter days, so its day sync makes every filled
  menu day inactive, drops the empty days, and saves `menus.json` on its own. The server accepts that save, since
  `menus.json` itself is fine. Once `charter.json` is restored, the chef has to reactivate each day by hand.
- **Menu import from a charter whose `menus.json` is damaged.** After the "will overwrite the current charter menu
  data" confirm, this charter's menus are replaced with blank days.

The Charter Pack auto-saves each change, so a damaged `pack.json` gives a 500 on every click.

The server has three blind spots of its own. The charter-date overlap check reads a damaged `reserved-periods.json` as
no periods, so a charter can be moved onto a maintenance period nobody can see. The reserved-period save reads a
damaged `charter.json` as a charter with no dates. Charter create, asked to copy a file from another charter, copies the
defaults of a damaged one without a word.

## Decisions (David, 2026-10-10)

| | |
|---|---|
| DN-1 | A page that needs a damaged file shows a notice **instead of its editor**, not a banner over an empty or read-only page. There is nothing to type into, and the page's auto-saves don't run. |
| DN-2 | A page needs the files it shows and the files its saves are worked out from (the Menus day sync needs `charter.json`). |
| DN-3 | The marker is SC-D16's `damaged` (#16): on each file's object in the charter bundle, at the top level of a single-file GET. This change adds it where #16 does not reach. |
| DN-4 | A `crew_list.json` kept as a plain list (an old format; none on the boat) counts as damaged, as #16 already marks it. No conversion. |
| DN-5 | The crew and menu import pickers refuse a damaged source file and say so. |
| DN-6 | The overlap check never runs blind. Charter dates are refused while `reserved-periods.json` is damaged, and a reserved-period save is refused while any charter's `charter.json` is damaged. Added after review (David, 2026-10-10): charter dates are also refused while another charter's `charter.json` is damaged, since that charter reads as undated. |
| DN-7 | Charter create refuses to copy a damaged file from another charter. |
| DN-8 | The OBS Feed (`navigation.json`) is left out: David plans to remove it. |

## Server (iolanthe-server, on top of #16)

### S1. The marker where #16 does not reach

`damaged` is the problem in words that follow the file's name, as in #16 (`"is not valid JSON at line 3 column 5"`,
never the file's text). It is read with the options the save reads with (`dataFiles.readForView`), so a GET and a save
always agree on what is damaged.

| GET | File marked | Where |
|---|---|---|
| `GET /api/admin/charter/<id>` | `itinerary.json`; `charter-alcohol-purchases.json` (a plain list allowed, as the purchase check reads it) | on the file's object, as #16's five |
| `GET /api/admin/reserved-periods` | `reserved-periods.json` | top level: `{revision: 0, periods: [], damaged}` |
| `GET /api/admin/charter/<id>/pack` | `pack.json` | top level: `{revision: 0, pack: <defaults>, damaged}` |

`damaged` is never stored and never sent to guests. The reserved-period and pack saves build their file from named
fields, so a page that sends it back can't store it.

### S2. A refusal names its file

The 500 for a damaged file carries the file and the problem:

```json
{ "error": "menus.json can't be read. Fix or restore it before saving.", "code": "damaged", "file": "menus.json",
  "damaged": "is not valid JSON at line 3 column 5" }
```

It comes from `lib/data-file.js` `damagedFileError` (every `readForWrite` and `assertWritable`) and
`lib/route-library.js` `readLibraryFile`, which also answers the routes and anchorages GETs. `file` and `damaged` join
`ADMIN_ERROR_DETAIL_KEYS` (`code` is there already). The message is unchanged, so an older admin shows what it shows
today.

Refusals about another charter's file keep a plain message and carry no `code`: the itinerary import's "`<name>`'s
itinerary.json can't be read. …", S4 and S5. So the admin never takes them for a file of the page it is on.

### S3. Charter dates while `reserved-periods.json` is damaged

When the candidate has a start and an end date, `assertNoCharterOverlap` reads the periods strictly: a damaged
`reserved-periods.json` answers S2's 500 (`file: "reserved-periods.json"`). That covers a `charter.json` save that
changes the dates (the only one that runs the check) and a charter created with dates. A charter created without dates
goes ahead. `lib/reserved-periods.js` gets the strict read; the GET keeps its lenient one (S1).

With dates, the check also answers 500 while any **other** charter's `charter.json` is damaged. That charter would
read as undated, so these dates could overlap it unseen. Its message names that charter only: "`<Charter>`'s
charter.json can't be read, so these dates can't be checked against its dates. Fix or restore it first." It is a plain
message with no `code`, like S4, because it is another charter's file. The admin shows it as any save error: in Charter
Admin's form message, or in the create dialog's error field. (David, 2026-10-10, after the code review of S3 to S5.)

### S4. Reserved periods while a `charter.json` is damaged

`POST /api/admin/reserved-periods/save` answers 500 before anything else when any charter's `charter.json` is damaged:
"`<Charter>`'s charter.json can't be read, so the reserved periods can't be checked against its dates. Fix or restore it
first." `<Charter>` is the name the charter list shows for it (formatted from its id, as its `charter.json` can't be
read). Plain message, no `code`.

### S5. Charter create copying a damaged file

`POST /api/admin/charters/create` with `clone_from` and a `copy` flag set (itinerary, crew, menus or drinks) answers 500
before anything is created when that source file is damaged: "`<Charter>`'s menus.json can't be read, so it can't be
copied. Fix or restore it first, or create the charter without copying it." Plain message, no `code`. A plain-list
`crew_list.json` counts as damaged here too (DN-4).

### S6. Tests and docs

- `node --test` against temp folders: `lib/data-file.js` (the refusal's fields), `lib/route-library.js` (the GET's and
  the save's 500 fields), `lib/reserved-periods.js` (the GET view with `damaged`, the strict read), `lib/charter-pack.js`
  (the GET view with `damaged`). `test/server-data-files.test.js` checks `server.js`'s wiring by its source: the
  bundle's two files, the detail keys, the strict overlap read, the period-save check and the create-copy check.
- A manual check against a scratch server on a copy of `data-scratch`: each new marker, each refusal's fields, S3 to S5,
  and every damaged file put back byte for byte.
- `CLAUDE.md`: Damaged data files, the charter and pack endpoints, Key constraints, the test count.

## Admin (iolanthe-admin)

### A1. `damaged-core.js`

A new pure module (`window.IolantheDamaged`, also a Node module, tested with `node --test`):

- `PAGE_FILES`: the table in A2.
- `damagedIn(copy)`: a copy's `damaged` problem, or `""` (a missing, empty or non-text `damaged` is none).
- `bundleDamage(bundle)`: `{file: problem}` for each marked file of the charter bundle.
- `pageDamage(section, panel, known)`: the page's damaged files in table order, `[{file, problem}]`, from `known`
  (`{file: problem}`).
- `refusal(error)`: `{file, problem}` for an api error with status 500 and `code: "damaged"`, else `null`.
- The wording in A6, as plain text (admin.js escapes it).

### A2. Which page needs which file

| Page | Needs |
|---|---|
| Charter → Charter Admin | `charter.json` |
| Charter → Route & Itinerary, this charter's route | `itinerary.json`, `charter.json` |
| Charter → Crew | `crew_list.json` |
| Charter → Charter Pack | `pack.json` |
| Charter → Site Editor | `sites.json` |
| Galley → Menus | `menus.json`, `charter.json` |
| Galley → Guests, Hotel → Guests | `guest_list.json`, `charter.json` |
| Hotel → Drink Stocks | `drink-stocks.json` |
| Hotel → Guest Alcohol | `guest_drinks.json`, `drink-stocks.json` |
| Hotel → Available Alcohol | `available-alcohol.json`, `drink-stocks.json` |
| Hotel → Purchased Alcohol | `charter-alcohol-purchases.json`, `drink-stocks.json`, `available-alcohol.json` |
| Hotel → Cocktails | `cocktails.json` |

The Guest view pages and the Charter Notes dialogs only read, and are never blocked. A page learns each file's state from
the GETs it already makes: the bundle, and the drink stocks, Available Alcohol, cocktails, sites and pack GETs.
Purchased Alcohol loads neither the drink stocks nor Available Alcohol, so it asks
`GET /api/admin/revisions?charter=<id>`, whose stamps carry `damaged` (#16).

### A3. The notice instead of the editor

A blocked page draws the notice card (A6) where its editor would be. The section menu, the Gantt band (Charter) and the
Select Charter toolbar (Galley, Hotel) stay, so the crew can go to another page or charter. The page binds no editor and
runs none of its auto-saves (the Menus day sync, the Charter Pack preset). The card's Try again button draws the page
again.

- **Route & Itinerary.** When this charter's `itinerary.json` or `charter.json` is damaged, the card takes the planner's
  place on "This charter's route", with a "Work on the library routes" button that opens the library subject. Library
  routes don't use this charter's files, so they are not blocked. When `routes.json` is damaged (its GET answers 500),
  the card takes the place of today's "Routes could not be loaded: …".
- **Charter Pack.** `charter-pack.js` draws the card in `#charter-pack` instead of the settings and the preview.

### A4. Strips for shared data

A strip is the notice as one line at the top of the page content, above an editor that otherwise works.

- **Reserved periods**, under the Gantt band on every Charter page, when `reserved-periods.json` is damaged. The band
  shows no periods. Its Reserved period button shows the strip's message in a dialog instead of opening the editor.
- **Charter dates** while `reserved-periods.json` is damaged:
  - Charter Admin's overlap line shows A6's date message as soon as a date differs from the stored one.
  - Save is refused with that message; the rest of the form saves as usual.
  - The create dialog does the same once it has dates.
  - The server refuses both anyway (S3).
- **A period save the server refuses** because a charter's `charter.json` is damaged (S4) shows the server's message
  in the period dialog's error field, as any error does today.
- **Anchorages**, on Route & Itinerary, when `anchorages.json` is damaged (its GET answers 500). Anchorages aren't shown;
  adding, moving or deleting one is refused by the server and gets A5's banner. The anchorages save writes the whole
  library from the list its load filled and has no revision check. So it waits for that load: until the list has
  loaded, it refuses with "The anchorages haven't been loaded, so they can't be saved. Reload the page." Otherwise, once
  the file read again, one new anchorage would replace them all.

### A5. A refused save, and no save from a damaged load

When a request other than a GET comes back as A1's `refusal`, the admin shows the banner (A6) at the top of the open
page's content, replacing an earlier one. This happens in `throwAdminApiError`, which `api()` and the upload helpers use;
the Charter Pack's cover upload is changed to use it too. What the crew typed stays on screen, and the caller's own
handling (status line, dialog error) carries on as today. The banner's Reload button draws the page again, which drops
the unsaved edits as any reload does.

**A page never saves a file it loaded while the file was damaged.** This is #16's "what the server cannot close". The
copy such a page holds was made from the defaults at revision 0. If the file is then repaired and its revision is 0 too
(not saved since migration v7, or restored from before spec C), that page's save passes the server's revision check and
replaces the repaired file. A3's notice keeps the blocked pages from saving. Two kinds of view can still save from such a
load:

- views that aren't blocked: the Route page's Edit site saves `sites.json`, and the drink stock picker loads its own copy;
- a page whose file broke after it loaded.

So the guard sits in the save itself:

- `saveRevisioned` refuses before sending when its base (the copy it loaded) carries `damaged`. It shows the same banner
  and throws an error shaped like the server's refusal.
- merge-core never merges the marker or counts it as a change, as for the stamp fields.
- The freshness check (A8) redraws a page when a file's `damaged` changes.

### A6. Wording

- **Card.**
  - Heading: "`<files>` can't be read", for example "menus.json can't be read", "charter.json and menus.json can't be
    read" or "a.json, b.json and c.json can't be read", the files in the page's table order.
  - Body: "This page can't be shown or saved until it's fixed or restored from a backup. Nothing has been changed." With
    two or more files: "until they're fixed or restored".
  - One detail line per file, "`<file>` `<problem>`.", from the server.
  - A Try again button.
- **Strip, reserved periods:** "reserved-periods.json can't be read. Reserved periods aren't shown, and periods and
  charter dates can't be changed until it's fixed or restored." The detail line follows.
- **Strip, anchorages:** "anchorages.json can't be read. Anchorages aren't shown, and can't be added or changed until
  it's fixed or restored." The detail line follows.
- **Banner:** "`<file>` can't be read, so your change wasn't saved. Copy anything you need from this page, then reload
  it once the file is fixed or restored." The detail line and a Reload button follow.
- **Pickers:**
  - Menus: "`<Charter>`'s menus.json can't be read, so its menus can't be imported. Fix or restore it first."
  - Crew: the same with "crew_list.json" and "its crew".
- **Dates:** "reserved-periods.json can't be read, so new dates can't be checked against the reserved periods. Fix or
  restore it first."

### A7. Import pickers

Crew import and menu import load the source charter's bundle. When its `crew_list.json` or `menus.json` is marked, the
dialog shows A6's picker message in its error field and nothing is saved. Menu import checks the source before its
overwrite confirm, so it never asks to confirm an import it will refuse. Charter create's copy is checked by the server
(S5); the create dialog shows its message in its error field, as any error does today.

### A8. Freshness

`checkFreshness` (spec C §4.4) also redraws when a file's `damaged` has changed since the page drew it, either fixed or
newly damaged, under the same rule: no unsaved edits and no dialog open. So a notice page for one of the nine spec C
files comes back by itself when the crew return to the tab after the file is fixed; the others need Try again.

### A9. Style, files, docs

- `admin.css`: `.damaged-notice` (the card), `.damaged-strip` and `.damaged-banner`, in the error tone of the
  refused-access card (`#f7e3e1` background, `#f0b8b1` border, `--danger` text). They are readable on the dark section
  background and full width at phone size.
- `index.html`: `damaged-core.js` before `admin.js`; every `?v=` bumped.
- `CLAUDE.md`: the module, the page table and the behaviours.

### A10. Tests

- `node --test` for `damaged-core`:
  - the table: each page's files, in order;
  - the marker readers: the bundle, a single GET, the revisions stamps and a refusal, ignoring a missing, empty or
    non-text `damaged`;
  - the wording for one, two and three files, with the problem lines.
- Sandbox tests, which run `admin.js` as `refused-access.test.js` does:
  - Galley → Menus with `charter.json` marked damaged draws the card and sends no save; with nothing marked it draws the
    menus as today.
  - The Hotel and Charter pages and the reserved-periods strip.
  - A save from a damaged load (`saveSitesLibrary`) is refused without being sent.
- `node --test` for merge-core: the marker is never merged in or counted as a change.
- A browser check on a scratch server (a copy of `data-scratch`, the server from S, the admin from A):
  - each blocked page;
  - both strips, the Reserved period button and a date change;
  - a refused save's banner (a file damaged after the page loaded);
  - both import pickers;
  - Try again and the freshness redraw;
  - phone width.

## Release

1. Merge and release this server change (#16 is already live). Run `./update.sh` on docker-vm. The admin of the day
   ignores the new fields.
2. Then merge the admin, which auto-deploys within 5 minutes. Against an older server it behaves as today.

Merge and release only on David's word.

## Out of scope

- The OBS Feed and `navigation.json` (DN-8).
- Read-only views of a damaged file: the Guest view, the guest site, the Charter Pack's content (from `/api/charter`)
  and the Charter Notes dialogs.
- `library/selections.json`, which has no admin editor.
- `settings.json`, which fails closed: admin is shut while it is damaged.
- Showing a plain-list `crew_list.json` (DN-4).
- A known limit: while `routes.json` is damaged, the whole Route page shows the card, this charter's route included,
  because the page lists both subjects from the library.
- The charter list (the Gantt band, Galley and Hotel's charter selector) takes each charter from `GET /api/admin/charters`,
  which reads `charter.json` leniently. A damaged one lists as an undated charter named after its id, with no mark. Its
  own pages show the notice (A3).
