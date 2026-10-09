# Vessel tab — spec V: cabins and the vessel profile (draft 1)

Written 2026-10-09 from a brainstorm with David, for the backlog item "NEXT UP: Settings → Vessel tab". Settings gets a
**Vessel** tab where the boat's own record is kept: its **cabins** (name, deck, bed layout, berths, extra berths, standard
or on request) and its **vessel profile** (the description, specifications and notes the guest site shows on Vessel Info
and the Charter Pack prints). Guests are then assigned to cabin records instead of picking a bare name from the
read-only selections list, and Hotel → Guests shows how full each cabin is.

Today the cabins are a plain string list in `library/selections.json`, which has no save route (only edited by hand on
the server), and `library/vessel.json` (the profile) isn't editable in the admin at all. On the boat (checked
2026-10-09) the list is N/A, State Room, Starboard VIP, Starboard, Port VIP, Twin, Port Twin; guests across 5 charters
use N/A (30), Starboard VIP (2), Port Twin (2), Starboard Twin (2, not in the list), State Room (1) and Port VIP (1).

The normal configuration of Princess Iolanthe is **5 cabins**. On special request two more can be activated: a new
cabin on the bridge deck and a conversion of the Saloon. Other boats may use this software later, so the cabin
structure is set up in the tab (usually once) rather than built in.

Mockup: shown inline during the brainstorm (Settings → Vessel with the Cabins card, the cabin dialog and the profile
card), approved by David; §4.2 describes it.

Repos: **S** = `iolanthe/iolanthe-server`, **A** = `portal/iolanthe-admin`. The guest site is not touched. Release **S
first**, then **A** straight after (§6).

---

## 1. Decisions

| # | Decision |
|---|---|
| SV-D1 | **Scope: cabins and the vessel profile** in one tab (David chose this over cabins only). |
| SV-D2 | **Placement: Settings → Vessel**, edited by bridge Charter Admin like the rest of Settings. The cloud-admin ownership draft (`docs/cloud-admin/OWNERSHIP_DRAFT.md`) files cabins and the vessel profile under the Charter core module (cloud-owned); when that split comes the tab moves with Charter, and the data stays in `library/vessel.json`. |
| SV-D3 | **One vessel record** (approach A): `library/vessel.json` holds the profile and the cabins, with one read route and one save route guarded by a spec C revision. Rejected: a separate `cabins.json` (two saves in one tab), and guests keeping cabin names (renames would rewrite every guest list). |
| SV-D4 | **Cabin fields**: `id`, `name`, `deck`, `bed_layout`, `berths`, `extra_berths`, `on_request`. Maximum occupancy = berths + extra berths. Deck and bed layout are free text with suggestions, so another boat can use its own words. |
| SV-D5 | **Cabin ids** come from the name when the cabin is created (`port-vip`, then `port-vip-2`…: the site id rule) and never change, so a rename touches no guest. |
| SV-D6 | **Standard and on-request cabins.** Standard cabins are the normal configuration. An on-request cabin (here the bridge-deck cabin and the Saloon conversion) is offered for a charter only when it is switched on in **Charter Admin**, per charter. |
| SV-D7 | **Guests store `cabin_id`** ("" = no cabin) instead of the cabin name ("N/A" = no cabin today). |
| SV-D8 | **Capacity: show and warn.** Hotel → Guests counts the guests in each cabin; using the extra berth is fine; going over the maximum warns but never blocks a save. Only active guests count (those within the charter's guest count). |
| SV-D9 | **The crew sets up any cabin structure** in the tab: add, rename, reorder (drag), delete. |
| SV-D10 | **Delete guard**: a cabin with guests in a charter that hasn't ended can't be deleted (the message names the charters). Ended charters keep the id and show "Removed cabin". |
| SV-D11 | **Migration** builds the cabins from the names guests actually use, converts guests to ids, and removes `cabins` from the selections. The bridge-deck cabin and the Saloon are added in the tab after release, so the migration stays boat-neutral. Running it twice changes nothing. |
| SV-D12 | **Release S first, then A**, minutes apart. Until A is live the server maps an old-style cabin name on a guest save to its id, so an open old admin tab can't lose a cabin. |
| SV-D13 | **Guest site and Charter Pack unchanged**: the guest payload's `vessel` keeps today's shape (description, details, sections, crew), without the cabins or the revision stamp. |

---

## 2. Data (S)

### 2.1 `library/vessel.json`

```json
{
  "description": "Captain Allen J. Sutton and all the crew welcome you onboard…",
  "details": [
    { "label": "Vessel Name", "value": "M/Y Princess Iolanthe" },
    { "label": "Length", "value": "45.7 m / 149'11\"" }
  ],
  "sections": [
    { "title": "General Notes", "items": ["Please read and familiarize yourself with the vessel safety brief…"] }
  ],
  "cabins": [
    { "id": "state-room", "name": "State Room", "deck": "Main deck", "bed_layout": "Double",
      "berths": 2, "extra_berths": 0, "on_request": false },
    { "id": "saloon", "name": "Saloon", "deck": "Main deck", "bed_layout": "Sofa bed",
      "berths": 2, "extra_berths": 0, "on_request": true }
  ],
  "revision": 3,
  "saved_by": "bridge / charter",
  "saved_at": "2026-10-10T08:00:00.000Z"
}
```

The cabin values above are examples; the migration leaves deck, layout and berths blank (§3.3).

| Field | Rule |
|---|---|
| `description` | string, up to 4000 characters |
| `details[]` | up to 40 rows of `{label, value}`; label 1–40 characters, value up to 160; rows with both empty are dropped, a value without a label is an error |
| `sections[]` | up to 12 of `{title, items}`; title 1–60 characters; up to 40 items, each up to 500 characters; empty items are dropped |
| `cabins[]` | up to 30, in display order (the order the guest cabin picker uses) |
| `cabins[].id` | lower-case slug (`^[a-z0-9]+(-[a-z0-9]+)*$`), up to 48 characters, unique |
| `cabins[].name` | 1–40 characters after trimming, unique ignoring case |
| `cabins[].deck`, `bed_layout` | strings, up to 30 characters, may be empty |
| `cabins[].berths` | `null` (not set yet) or an integer 1–12 |
| `cabins[].extra_berths` | integer 0–4, default 0 |
| `cabins[].on_request` | boolean, default false |
| `revision`, `saved_by`, `saved_at` | set only by the server (spec C §2.1) |

### 2.2 Guests (`charters/<id>/guest_list.json`)

`guests[].cabin_id`: a cabin id, or "" for no cabin. It replaces `cabin` and the older `cabin_assignment`. Both
normalizers (server and admin) still read the old fields when `cabin_id` is missing: a name matching a cabin (ignoring
case) gives that cabin's id; "N/A", empty, or no match gives "". The normalized guest never carries `cabin` or
`cabin_assignment` again.

### 2.3 Charters (`charters/<id>/charter.json`)

`cabins_on_request`: the ids of the on-request cabins switched on for this charter (empty array by default). The server's
charter normalizer, which lists the fields it keeps, gains this field; on save it keeps only ids that name an on-request
cabin at that moment, without duplicates. It is saved with the Charter Admin page's existing charter save
(`POST /api/admin/charter/<id>/save`, `file: "charter.json"`).

### 2.4 Selections

`cabins` leaves the server's default selections, both selection normalizers and `/api/admin/selections`. The migration
removes it from `selections.json`.

---

## 3. Server (S)

### 3.1 `lib/vessel.js` (pure, Node-tested: `test/vessel.test.js`)

- `cabinIdFor(name, takenIds)`: slug of the name (or `cabin`), then `-2`, `-3`… until free. The admin's `vessel-core.js`
  uses the same rule.
- `normalizeVessel(raw)`: the record with defaults filled in and the old `DATA_DIR/vessel.json` fallback kept as today.
- `validateVessel(data)`: the §2.1 rules; returns a list of `{field, message}`, empty when valid.
- `removedCabinsInUse(storedCabins, nextCabins, guestListsByCharter, charterEnded)`: removed ids still used by a guest
  in a charter that hasn't ended (charters without dates count as not ended), with the charter names.
- `cabinIdForLegacyName(name, cabins)`: the old-name mapping of §2.2.
- `publicVessel(vessel)`: the profile without `cabins` and without the stamp (for the guest payload).
- `migrateCabins({selections, vessel, guestLists})`: the pure transform behind the migration (§3.3).

### 3.2 Routes

| Route | Who | Does |
|---|---|---|
| `GET /api/admin/vessel` | any admin session (Hotel and Galley need the cabins) | `{ vessel }`: the whole record with the stamp |
| `POST /api/admin/vessel/save` | bridge Charter Admin (the Settings rule) | body `{ data, base_revision }`: revision check (409 per spec C §2.1), then `validateVessel` (400 with the messages), then the delete guard (409, `code: "cabin-in-use"`, naming the cabin and the charters), then stamp, write, answer `{ vessel }` |

Also:

- **Guest lists**: the guest normalizer reads `cabin_id`, maps old names (§2.2), defaults to "" instead of "N/A", and
  drops `cabin` / `cabin_assignment`.
- **Charter save**: keeps `cabins_on_request` (§2.3).
- **Selections**: no `cabins` (§2.4).
- **Guest payload** (`/api/charter`): `vessel` = `publicVessel(vessel)` plus the crew, as today.

### 3.3 Migration `vessel-cabins` (the next free schema number when V1 is built)

The existing runner backs the data up first (`data-before-migration-<time>`). Then:

1. If `vessel.cabins` is missing: one cabin for each name in the selections `cabins` list that at least one guest uses,
   in the list's order, then each name guests use that the list lacks, in order of first use. "N/A" and empty are not
   cabins. Every cabin is standard, with blank deck and layout, `berths: null`, `extra_berths: 0`. On the boat this gives
   State Room, Starboard VIP, Port VIP, Port Twin, Starboard Twin ("Starboard" and "Twin" are dropped as unused).
2. Every charter's guest list: `cabin` / `cabin_assignment` → `cabin_id` (§2.2).
3. `selections.json` loses `cabins`.
4. Files it writes get their revision bumped when they carry a spec C stamp (spec C SC-D11).

A second run finds `vessel.cabins` present and no old fields, and changes nothing.

### 3.4 Templates

`data-templates/library/vessel.json` gains the seven Princess Iolanthe cabins (five standard, the bridge-deck cabin and
the Saloon on request, berths blank); `data-templates/library/selections.json` loses `cabins`; the template charter's
guest list uses `cabin_id`.

### 3.5 The revision module

The vessel save uses spec C's `lib/file-revisions.js`. If spec C hasn't landed when V1 is built, V1 adds that module
exactly as spec C §2.1 defines it (with its tests), and spec C reuses it.

---

## 4. Admin (A)

### 4.1 `vessel-core.js` (pure, Node-tested: `test/vessel-core.test.js`; also a Node module, like `charters-core.js`)

- `cabinIdFor(name, cabins)`: the §3.1 rule.
- `validateVesselDraft(draft)`: the §2.1 rules, as messages per field for the dialog and the page.
- `cabinTotals(cabins)`: `{standard: {count, berths, max}, onRequest: {count, berths, max}, berthsNotSet: [ids]}`.
- `offeredCabins(cabins, cabinsOnRequest)`: the standard cabins plus this charter's switched-on extras, in order.
- `charterCapacity(cabins, cabinsOnRequest)`: the Charter Admin capacity line (cabin counts, berths, max).
- `cabinOccupancy(cabins, cabinsOnRequest, activeGuests)`: per offered cabin `{id, name, count, berths, max, state}`
  with `state` one of `ok`, `extra` (into the extra berths), `over` (past the max); plus the no-cabin count and the
  guests whose cabin isn't offered (`not-on`) or no longer exists (`removed`).
- `cabinPickerOptions(cabins, cabinsOnRequest, activeGuests, currentCabinId)`: "No cabin", then the offered cabins as
  "Port VIP (1/2)" or "Starboard Twin (2/2 +1)", plus the guest's current cabin when it isn't offered: "Saloon (not on
  for this charter)" or "Removed cabin".

### 4.2 Settings → Vessel

`renderSettings` gains `{ id: "vessel", label: "Vessel" }` after Weather, with `loadVesselSettings`
(`GET /api/admin/vessel`), `renderVesselSettings` and `bindVesselSettingsActions`, like the other tabs.

- **One save for the tab**: the header's green tick and red cross (`settingsActionButtonsHtml`) save or discard the
  whole record with `base_revision`; leaving with changes asks first (`setPageUnsavedGuard`). On a 409 the page says
  someone else saved the vessel and offers to reload (spec C's merge engine can take this over later).
- **Cabins card**: summary chips ("Standard: 5 cabins · 10 berths · max 11", "On request: 2 cabins · +4 berths"),
  rows grouped Standard then On request (drag grip, name, deck · layout, a berths chip such as "2" or "2 +1", "berths not
  set" flagged, chevron), and an Add cabin button. Drag (`drag-reorder.js`) sets the order.
- **Cabin dialog** (tap a row, or Add cabin): Name, Deck and Bed layout (text with suggestions: the values already used,
  plus Lower deck / Main deck / Upper deck / Bridge deck / Sun deck and Double / King / Twin / Twin or double /
  Single / Bunks / Sofa bed), Berths, Extra berths, and an "On request (only when a charter asks for it)" switch. Its
  tick updates the page, cross cancels, and Delete sits inside the dialog (save, cancel, separator, delete: the Charter
  Admin order). A refused delete (`cabin-in-use`) shows the server's message on the page.
- **Vessel profile card** ("guest site Vessel Info and Charter Pack"): Description (text box); Specifications as
  label / value rows edited in place, with drag, add and remove; Notes sections as rows ("General Notes · 8 items")
  that open a dialog with the title and one item per line.
- Rows reuse the shared row look (`.crew-row, .site-row`, `.row-chevron`); new classes are scoped `.vessel-*`. At phone
  width the rows stack and the dialogs go full width.

### 4.3 Charter Admin

Under Guest count, when the vessel has on-request cabins: a "Cabins on request" group with one switch per on-request
cabin ("Bridge Deck Cabin · +2 berths", `label.switch-row`), saved with the page's existing charter save as
`cabins_on_request`. A capacity line reads "5 standard + 1 on request · 12 berths, max 13", with a warning pill when the
guest count is above that maximum. Switching a cabin off while guests are in it is allowed, with a note such as "2 guests
are in the Saloon".

### 4.4 Hotel → Guests and the other guest views

- The guest dialog's cabin select uses `cabinPickerOptions`; the selections-based code goes
  (`guestSelectionLibraryValues("cabin")`, the `cabin: { selectionKey: "cabins" … }` field entry,
  `bindGuestLegacySelection` for the cabin).
- A cabin strip above the Hotel → Guests list: one chip per offered cabin ("Port VIP 1/2"), neutral within berths, a
  quiet note in the extra berth, red over the maximum; plus "No cabin: N", and an amber chip for guests in a cabin that
  isn't on for this charter.
- The guest-row cabin tag (`guestRowElement`) shows the cabin name; a guest in an over-full cabin or a cabin that isn't
  on is flagged on the row too. Any other view that shows a guest's cabin shows the name, without counts.
- The admin keeps the vessel record in `state`, loaded with the selections at sign-in and again whenever the Vessel
  tab, Charter Admin or Hotel → Guests opens, so a cabin change made elsewhere shows up without a reload.

### 4.5 Assets and docs

All `?v=` strings in `index.html` bumped together, as usual. CLAUDE.md in both repos describes the vessel record, the
routes and the new files; the backlog entry is closed when this is live.

---

## 5. Out of scope

- Cabins on the guest site or in the Charter Pack (for example a cabin allocation page).
- Housekeeping or cabin status (the ownership draft's idea of widening Hotel to cabins / housekeeping).
- Deck plans or photos per cabin.
- Multi-boat tenancy itself: only the data is ready for it.
- Merging two people's simultaneous vessel edits: the vessel save refuses a stale revision; spec C's merge engine can
  take it on later.

---

## 6. Release and testing

**Phases**, each with its own plan (`docs/vessel/plans/`) and PR:

| Phase | Repo | Contents |
|---|---|---|
| V1 | S | `lib/vessel.js`, the routes, the migration, the guest-payload strip, the selections clean-up, the old-name mapping, templates, CLAUDE.md |
| V2 | A | `vessel-core.js` and the Settings → Vessel tab |
| V3 | A | Charter Admin switches, Hotel → Guests picker, strip and tags |

**Release** once all three are approved: merge S and run `./update.sh` on the boat (the migration backs up and runs),
then merge V2 and V3 (live within 5 minutes). Then, in the new tab: add the Bridge Deck Cabin and the Saloon as on
request, and fill in decks, layouts and berths for all seven.

**Tests**

- S, `node --test`: `lib/vessel.js` (validation, ids, the delete guard, the legacy mapping, the public strip) and the
  migration transform on fixtures (the boat's shapes, and a second run that changes nothing).
- A, `node --test`: `vessel-core.js` (totals, offered cabins, occupancy states, picker options including the
  switched-off and removed cases, ids, draft validation).
- Browser pane, on a scratch server: the Vessel tab (add, edit, drag, delete guard, save, a 409 from a second tab,
  phone width); Charter Admin switches and the capacity warning; Hotel → Guests picker, strip and flags; a profile edit
  showing up on the guest site's Vessel Info and in the Charter Pack.

**Coordination**

- Spec C: the revision module (§3.5), its own migration number, and its changes to the guest dialog's save path (its
  plans c-02 / c-03) overlap V3's picker change; whichever lands second rebases.
- Admin auth (iolanthe-server#11, iolanthe-admin#39, open on 2026-10-09): also touches Settings and the migration list;
  whichever lands second rebases.
