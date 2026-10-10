# Charter rework — spec C: conflict-safe saves (draft 1)

Written 2026-10-09 from the brainstorm recorded in [decisions.md](decisions.md) (entries SC-D1 … SC-D12; the changes made while planning are SC-D13). Spec A's
introduction reserved spec C for "conflict-safe saves for the remaining charter files". Today every file below is saved
as a whole-file overwrite: two people editing the same file at the same time silently lose one person's work. The
itinerary, the route library, the anchorages, the reserved periods and the charter pack already carry a revision and
answer a stale save with 409; this spec brings the rest into line and goes one step further: a clash between edits to
*different* records is merged without asking anyone.

Mockup (git-ignored, `.superpowers/brainstorm/451783-1791520463/content/`): `clash-dialog.html`, option **B** chosen.

Repos: **S** = `iolanthe/iolanthe-server`, **A** = `portal/iolanthe-admin`. The guest site is not touched. Release **S
first**, then **A**.

---

## 1. Decisions

| # | Decision |
|---|---|
| SC-D1 | **Scope: nine files.** Charter files `charter.json`, `crew_list.json`, `guest_list.json`, `menus.json`, `guest_drinks.json`, `available-alcohol.json`; shared library files `drink-stocks.json`, `cocktails.json`, `sites.json`. |
| SC-D2 | **Revision + auto-rebase.** A whole-file revision guards every save; on a 409 the admin merges its change into the stored copy and saves again. It asks only when both people changed the same field of the same record. |
| SC-D3 | **Stable record ids.** Crew members, guests, menus (one per day slot) and cocktails get an `id` once, through migration v7 (v6 is the admin password hashing, iolanthe-server#11). Drink stocks and sites already have ids; Guest Alcohol and Available Alcohol use their existing natural keys (section category, `stock_id`). |
| SC-D4 | **Old tabs are refused.** A save with no `base_revision` gets the same 409 as a stale one; reloading the page picks up the new admin. |
| SC-D5 | **Both reordered: mine wins, with a note.** Content edits from both sides are kept; the status line says the other order was replaced. |
| SC-D6 | **A real clash reopens the editor on their version** (mockup B): their saved record with my changes on top, what they wrote under each field we both changed. Save again, or Cancel to keep theirs. |
| SC-D7 | **Delete against change asks; the change wins by default.** I delete what they changed: "Hotel changed Fred at 14:02. Delete anyway?". I change what they deleted: the editor reopens with "Hotel deleted Fred at 14:02; save to add him back". |
| SC-D8 | **Freshness on page open and tab focus.** The admin checks the revisions when a page opens and when the tab becomes visible, and quietly redraws a page whose file moved, unless it has unsaved edits or an open dialog. No polling. |
| SC-D9 | **Who and when.** The server stamps each save with the department (`charter` / `galley` / `hotel`, or `system` for server-side writes) and the time; clash messages say "Hotel … 14:02". No personal names (logins are per department). |
| SC-D10 | **Merge in the admin, one helper.** A pure `merge-core.js` (Node-tested) and one save helper replace every whole-file save path. |
| SC-D11 | **Server-side writers bump the revision too** (bar purchase / reverse, the guest-count sync, charter create / clone, migration v7). |
| SC-D12 | **No wait on the style rollout.** Phase B has merged for every page spec C touches (only Settings and the login screen remain). |
| SC-D16 | **A stored file that does not parse is never saved over** (added 2026-10-10). A save of it answers 500 before the revision check; its GET marks it `damaged` instead of passing its defaults off as the data (§2.2). |

---

## 2. Server (S)

### 2.1 The revision stamp

A new pure module `lib/file-revisions.js` (Node-tested, `test/file-revisions.test.js`):

- `readRevision(data)` → the integer `data.revision`, or 0 when it is missing or not an integer.
- `checkBase(stored, baseRevision)` → `null` when `baseRevision` is an integer equal to `readRevision(stored)`;
  otherwise an error object for a 409: `{ status: 409, error: "Someone else saved this (revision N). …",
  code: "revision", revision: N, data: stored, saved_by, saved_at }`. A missing or non-integer `baseRevision`
  is refused the same way (SC-D4).
- `stamp(data, stored, savedBy, now)` → a new object: `data` with `revision: readRevision(stored) + 1`,
  `saved_by: savedBy`, `saved_at: now` (ISO 8601 with the server's offset). It never mutates its input.
- `stripStamp(data)` → a copy without `revision`, `saved_by`, `saved_at` (used by the public payloads).

The three stamp fields sit at the top level of each file (every one of the nine files is a JSON object). Any
`revision` / `saved_by` / `saved_at` in a request body is ignored; only the server sets them.

### 2.2 Endpoints

Every save below takes `base_revision` and answers with the saved copy (stamp included), or 409 per §2.1. Validation
errors (400 / 403 / 409 overlap, as today) are checked **after** the revision, so a stale tab never sees a validation
message about data it has not seen.

| File | Endpoint | Body | Record key (for the admin's merge) |
|---|---|---|---|
| `charter.json` | `POST /api/admin/charter/<id>/save` | `{file, data, base_revision}` | the file is one record |
| `crew_list.json` | same | same | `crew[].id` |
| `guest_list.json` | same | same | `guests[].id` |
| `menus.json` | same | same | `menus[].id` |
| `guest_drinks.json` | same | same | `sections[]` by category key → `items[].stock_id` |
| `available-alcohol.json` | `POST /api/admin/charter/<id>/available-alcohol/save` | `{show_prices_to_guests, items, base_revision}` | `items[].stock_id` |
| `drink-stocks.json` | `POST /api/admin/drink-stocks/save` | `{items, base_revision}` | `items[].id` |
| `cocktails.json` | `POST /api/admin/cocktails/save` | `{cocktails, base_revision}` | `cocktails[].id` |
| `sites.json` | `POST /api/admin/sites/save` | `{sites, base_revision}` | `sites[].id` |

The 409 body's `data` is the stored copy exactly as the matching GET would return it (normalised, hydrated where the
GET hydrates, as for Available Alcohol), so the admin can merge against it directly.

The GETs return the stamp with the data: the charter bundle (`GET /api/admin/charter/<id>`) carries it inside each
file's object; `drink-stocks`, `cocktails`, `sites` and `charter/<id>/available-alcohol` carry it at the top level.

**New: `GET /api/admin/revisions?charter=<id>`** (any admin session; 404 for an unknown charter) →
`{ charter: { "charter.json": {revision, saved_by, saved_at}, … six files }, library: { "drink-stocks.json": …,
"cocktails.json": …, "sites.json": … } }`. Without `charter=`, only `library`. It reads the files and returns no data,
so it is cheap enough to call on every page open and tab focus (SC-D8).

**A stored file that does not parse (SC-D16).** Only a missing file stands for its defaults at revision 0 (§2.3). One
that is there but cannot be read, is not valid JSON or is not a JSON object is never saved over:

- A save of it answers **500** `{error: "<file> can't be read. Fix or restore it before saving."}` and writes nothing.
  This is checked first, before the revision: the server reads the stored copy through `lib/data-file.js`
  (`dataFiles.readForWrite`, as for the data files in iolanthe-server#14), not `readJsonFileSafe`. That one turns a
  damaged file into its defaults at revision 0, so a page loaded from those defaults would pass the revision check and
  replace the file with what was edited from them.
- Its GET still answers, so the page opens: the file's object (or the top level, for the library files) holds the
  defaults at revision 0 and `damaged`, the problem in words that follow the file's name (`"is not valid JSON at line 3
  column 5"`, never the file's text), so the admin can say so instead of showing the defaults as the data.
  `GET /api/admin/revisions` adds the same `damaged` to that file's stamp.

### 2.3 Server-side writers (SC-D11)

Each of these writes through `stamp()` with `saved_by: "system"` (or the acting department where there is one), so a
later stale save is refused and merged rather than undoing it:

- bar purchase and reverse (`createCharterAlcoholPurchase` / `reverseCharterAlcoholPurchase` → `updateDrinkStocksDirect`
  on `drink-stocks.json`), saved_by the acting department;
- the guest-count sync after a `charter.json` save (`syncGuestListForCharter` on `guest_list.json`), saved_by the
  acting department, and only when the normalised list differs from the stored one;
- charter create and clone (`createAdminCharter`): new files start at `revision: 1`, `saved_by` the acting department;
- `readCocktails()` creating a missing file, and migration v7 (§2.4): `revision: 0`, `saved_by: "system"`.

### 2.4 Migration v7: record ids

A new entry in `DATA_MIGRATIONS` (`version: 7`), run like v5 (backup `data-before-migration-<stamp>` first, idempotent):

- every charter's `crew_list.json` `crew[]`, `guest_list.json` `guests[]` and `menus.json` `menus[]`, and the library's
  `cocktails.json` `cocktails[]`: each record without a string `id` gets one;
- ids are short random strings, unique within their list (`c-`, `g-`, `m-`, `k-` prefix + 8 base-36 characters);
  a guest that already carries `guest_id` keeps it as its `id`;
- every one of the nine files without an integer `revision` gets `revision: 0`, `saved_by: "system"`, `saved_at` now.

After v7 the normalisers keep and supply ids:

- `normalizeCocktailItem` keeps `id` (today it drops every field but name, description, ingredients);
- `normalizeGuestRecord` keeps an id; the crew and menu saves (which are not normalised today) give any record without
  an id a new one;
- **blank guest slots** made by `normalizeGuestListForCount` get a **deterministic** id, `g-slot-<n>` (n = the slot's
  position, 1-based, bumped past any id already in the list), because the charter bundle normalises the list on every
  read without writing it: a random id would change from one read to the next. The admin's mirror of the count rule
  uses the same ids. Once saved, a slot keeps its id like any guest;
- a record the admin creates carries an id the admin made (same format), so re-sending a merged add is idempotent.

### 2.5 Public payloads

`/api/charter` (`buildCharterPayload`) and the pack's data drop the stamp (`stripStamp`), so the guest site and the
pack see exactly what they see today. The record ids are harmless extra fields and stay.

---

## 3. Admin: the merge engine (A)

### 3.1 `merge-core.js`

A pure module (browser global `IolantheMerge` and a Node module, like the other `*-core.js` files), tested in
`test/merge-core.test.js`.

**`merge3(base, mine, theirs, schema)` → `{ merged, clashes, notes }`**

- `base`: the copy the admin last received from the server; `mine`: what it was about to send; `theirs`: the 409's
  `data`.
- `schema` (one per file, `SCHEMAS` in the module) names the keyed lists and the fields to skip:

  ```js
  crew:          { lists: { crew: { key: "id" } } }
  guests:        { lists: { guests: { key: "id" } } }
  menus:         { lists: { menus: { key: "id", derived: ["order", "day", "charter_day", "label", "date"] } } }
  guestDrinks:   { lists: { sections: { key: sectionKey, lists: { items: { key: "stock_id" } } } } }
  availableAlcohol: { lists: { items: { key: "stock_id" } } }
  drinkStocks:   { lists: { items: { key: "id" } } }
  cocktails:     { lists: { cocktails: { key: "id" } } }
  sites:         { lists: { sites: { key: "id" } } }
  charter:       { }                                   // top-level fields only
  ```

  The stamp fields (`revision`, `saved_by`, `saved_at`) are always skipped.

**Rules**

1. **Top-level fields** (outside the keyed lists) and **each record's fields** merge field by field: only I changed it
   → mine; only they changed it → theirs; same value on both sides → that value; different changes → a **field clash**
   `{ kind: "field", list, key, field, base, mine, theirs }`, and `merged` keeps **theirs** for that field.
   Equality is deep (JSON) equality; a nested array or object that is not a declared keyed list (a day's `dinner`
   dishes, a cocktail's `ingredients`, a site's `media`) counts as one field.
2. **Derived fields** listed in the schema are not compared; the page's normaliser recomputes them after the merge.
3. **Adds:** records only in `mine` or only in `theirs` are kept. Each sits after the nearest preceding record it
   followed in its own list (or first).
4. **Deletes:** a record I deleted that they left alone → deleted. A record they deleted that I left alone → deleted.
   I deleted it, they changed it → a **delete clash** `{ kind: "deleted-by-me", list, key, theirs }`, `merged` keeps
   theirs. They deleted it, I changed it → `{ kind: "deleted-by-them", list, key, mine }`, `merged` leaves it out.
5. **Order** of the records present on both sides: only I reordered → mine; only they reordered (or nobody) → theirs;
   both reordered → mine, and `notes` gets `{ kind: "order-replaced", list }` (SC-D5).
6. Nested keyed lists (Guest Alcohol items in a section) follow rules 1–5 inside their record.

`merge3` never mutates its inputs.

**Also exported:** `newId(prefix)` (the §2.4 format) and `clashFields(clashes, list, key)` (the clashed field names
for one record, for the editor in §4.1).

### 3.2 The save helper

One helper in `admin.js`, `saveRevisioned({ path, file, schema, base, mine, body })`, replaces the bodies of
`saveCharterFile`, `saveDrinkStocks`, `saveAvailableAlcohol`, `saveCocktails`, the Charter Info form's direct save and
the Site Editor's save:

1. POST `mine` with `base_revision: base.revision`. On 200 the saved copy becomes the new base (in `state.bundle[file]`
   or the library state) and the result is `{ ok: true, saved }`.
2. On a 409 with `code: "revision"`: `merge3(base, mine, error.payload.data, schema)`.
   - **No clashes:** POST `merged` with the new revision, at most 3 rounds in all (a third 409 reports the plain
     message and keeps the page dirty). The status line reads "Saved · merged with Hotel's change from 14:02" (the
     409's `saved_by` / `saved_at`, 24-hour time), plus "· the other order was replaced" for an `order-replaced` note.
   - **Clashes:** nothing is saved; the result is `{ ok: false, clashes, theirs, merged, savedBy, savedAt }`, the new
     base is `theirs`, and the caller shows them (§4).
3. Any other error behaves as today (status line or the dialog's error field).

The callers keep their success messages. A save is one at a time per file (a second save waits for the first), as
the reserved periods already do.

---

## 4. Admin: what people see (A)

### 4.1 Dialog edits: crew member, guest, site, drink stock, menu day, cocktail

On a clash the dialog that was saved reopens (or stays open) on **their** record with **my changed fields** applied on
top, clashed fields included (mockup B):

- an amber banner under the header: the department pill and "changed <name> at 14:02. Your changes are on top;
  check them and save again." (for `deleted-by-them`: "deleted <name> at 14:02. Save to add them back.");
- each field I changed has a teal left edge (`.field-mine`);
- under each field we both changed, in amber, "↳ Hotel wrote: <their value>" (`.field-theirs`; a list field such as a
  day's Dinner shows a one-line summary, e.g. "3 dishes: Beef Tenderloin, …");
- Save sends again with the new revision; Cancel closes and keeps theirs (and redraws the page from `theirs`).

### 4.2 Whole-page saves: Charter Info, Guest Alcohol order, Available Alcohol, Cocktails list

The page redraws from `merged` with my value put back in each clashed field (so: their changes, plus all of mine)
and stays **unsaved**; the same banner sits at
the top of the card, and the same edges and hints mark the fields. Save and Cancel work as they do now (Cancel = discard
→ theirs).

### 4.3 Actions that save at once

- **Drags** (menu days, guests) only change order: they merge silently (SC-D5).
- **Delete** with a `deleted-by-me` clash asks "Hotel changed <name> at 14:02. Delete anyway?" (Delete / Cancel; Cancel
  keeps theirs). Delete again sends with the new revision.
- **Promote, import crew, menu sync to itinerary days**: merged like any save; if a clash remains, the status line says
  "Hotel changed the <file> at 14:02. Your change wasn't saved." and the page redraws from `theirs`.

### 4.4 Freshness (SC-D8)

When a page that shows one of the nine files opens, and on `visibilitychange` to visible, the admin calls
`GET /api/admin/revisions` (with `charter=` when a charter is selected). For each file the page uses whose revision
differs from the copy it holds: if the page has no unsaved edits and no dialog is open, it fetches the file again
(the bundle, or the library GET) and redraws quietly; otherwise it does nothing and the next save merges.

### 4.5 Style

Shared classes in `admin.css`: `.clash-banner` (amber, as the reserved-period warning tone), `.field-mine`,
`.field-theirs`, with the existing `.status-pill` department colours for the pill. No new buttons; the Route-panel
icon buttons and D7's "little text" rule hold. Every time shown is 24-hour (R3b-2).

---

## 5. Out of scope

- Files that already have revisions: `itinerary.json`, the route library, anchorages, reserved periods, the pack.
- Settings, passwords, navigation feed, display, weather and route-track settings (one editor, on the bridge).
- Alcohol purchases (server-side actions, not file saves; their effect on drink stocks is covered by SC-D11).
- Live push or polling, personal names, per-field locks, an edit history.

---

## 6. Release and testing

**Order:** S, then A, the same day.

1. Rehearse migration v7 on docker-vm against a copy of the live `data` (as for v5: `git archive | ssh docker-vm tar
   -x` into a rehearsal folder, run the migration, inspect, delete the folder).
2. Compare the live server commit with origin/main, then `./update.sh`; check `/api/schema` live_version 7 and a
   409 from a save with no `base_revision`.
3. Merge A (auto-deploys in 5 min; pull at once). Tabs opened before the release get the 409 message until they
   reload (SC-D4). Bump every `?v=` in `index.html`.

**Tests**

- S `node --test`: `file-revisions` (check / stamp / strip, no mutation); migration v7 (ids added once and kept on a
  second run, `guest_id` reused, revision 0, backup made); `normalizeCocktailItem` and the guest normaliser keep ids.
- S endpoints: `scripts/check-revisions.js` (a Node script, like `check-admin-network.js`): for each of the nine files a good
  save (revision + 1, stamp), a stale save and a missing `base_revision` (409 with `data`), a purchase bumping
  `drink-stocks.json`, a guest-count change bumping `guest_list.json`, the revisions endpoint.
- A `node --test` `merge-core`: edits to different records (merged, no clash); the same field (clash, theirs kept);
  different fields of the same record (merged); delete against change both ways; adds on both sides placed after
  their neighbours; only-me / only-them / both reordered; Guest Alcohol nested items; a menu drag plus a dish edit
  (derived fields ignored, no clash); `charter.json` fields; inputs not mutated.
- Browser pass on a scratch server, with a Node script as "the other person" (its own department session, saving
  through the API): a silent merge on Crew (status line), a dialog clash on a guest (banner, edges, hint, Save, Cancel),
  a page clash on Charter Info, delete-anyway on a drink stock, both-reordered menus (note), a deleted-by-them
  re-add, freshness on tab focus (page redraws; does not when dirty).

**Plans** (`docs/charter-rework/plans/`, dry-run from the plan text as for spec P, Fable review before building):
`c-01-server.md`, `c-02-admin-core.md` (`merge-core.js`, `saveRevisioned`), `c-03-admin-pages.md` (callers, editors,
freshness, CSS, `?v=`).
