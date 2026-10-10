# Cloud Admin: data ownership draft

Status: discussion draft, 2026-10-09. Not a spec yet. Uncommitted on purpose.

Context: the captain wants the Admin console hosted off the boat (remote charter
editing, chef access between charters, hosted backups, and eventually a
subscription product for other vessels at `<vessel>.zenvue.app`). The Guest
Portal stays on the boat and works offline from a published bundle.

This document tags every piece of data the server holds today with an owner and
a module, so we can see how clean the split is before designing the bundle.

## 1. Modules

| Module | Role | Sells as |
|---|---|---|
| **Charter** | core: charter, guests, cabins, itinerary, routes, sites, vessel profile, notices, charter pack | included |
| **Galley** | menus, dietary annotations on guests | optional |
| **Hotel** (today really "Bar & Drinks") | drink stocks, guest alcohol, available/purchased alcohol, cocktails | optional |
| **Crew** (later) | watches, roster, hours of rest | not yet |
| **Vessel** | live nav, weather, display, route track, local auth | never: stays on the boat, not part of the product |

Rules: core never depends on a module; modules never depend on each other;
shared entities (guest, cabin, charter) live in core and modules only annotate
them.

## 2. Ownership table (server data as it exists today)

Owner key: **Cloud** = edited online, published to the boat. **Boat** = created
on board, never leaves (or only comes back in a return package). **Handover** =
cloud before the charter, boat during it, cloud again after.

### Per charter (`charters/<id>/`)

| File | Module | Owner | Guest-facing | Notes |
|---|---|---|---|---|
| `charter.json` | Charter | Cloud → Handover | partly | name, dates, guest count, dietary/medical/diving flags |
| `guest_list.json` | Charter | Cloud → Handover | yes (first names) | shared entity; Galley and Hotel annotate it |
| `crew_list.json` | Charter (→ Crew later) | Cloud | yes | captain assigns crew; moves to Crew module when that exists |
| `itinerary.json` | Charter | Handover | yes | most edited on board during a charter |
| `notices.json` | Charter | Handover | yes | boat adds "tender times" style notices live |
| `menus.json` | Galley | Cloud → Handover | yes | the chef's main reason for cloud access |
| `guest_drinks.json` | Hotel | Cloud → Handover | no | annotation keyed to guests |
| `available-alcohol.json` | Hotel | Handover | yes | depends on what is actually aboard |
| `watches.json` | Crew / Vessel | **Boat** | no | crew-facing; never needs to leave the boat |
| `track.json` | Vessel | **Boat** | yes (live) | recorded GPS; boat-only, large |

### Library (`library/`)

| File | Module | Owner | Guest-facing | Notes |
|---|---|---|---|---|
| `sites.json` + `media/sites/*` | Charter | Cloud | yes | biggest bundle payload; sync images by content hash |
| `vessel.json` | Charter | Cloud | yes | vessel profile; becomes the tenant record |
| `cocktails.json` | Hotel | Cloud | yes | reference list |
| `drink-stocks.json` | Hotel | **Boat** (return package) | no | stock is consumed on board; cloud wants the numbers for reorder, boat owns truth |
| `selections.json` | Charter + Hotel (split) | Cloud | no | read-only dropdown vocabulary (`GET /api/admin/selections`, no save route; seeded by `ensureSelectionsFile`). `cabins`, `guest_categories`, `bcd_sizes`, `fin_sizes`, `site_tags`, `crew_roles`, `crew_departments` are Charter (cabins belong with the vessel profile); `drink_categories`, `available_alcohol_categories`, `drink_stock_types` are Hotel. Becomes a per-module `vocab.json` |

### Routes (admin routes API)

| Data | Module | Owner | Guest-facing | Notes |
|---|---|---|---|---|
| routes, anchorages | Charter | Cloud → Handover | via planned-route | planning is done remotely; live tweaks aboard |
| reserved periods | Charter | Cloud | no | the Gantt / calendar; broker-facing later |

### Root and settings

| Data | Module | Owner | Notes |
|---|---|---|---|
| `active-charter.json` | Vessel | **Boat** | the handover pointer; boat decides what is live |
| `settings.site_title/subtitle` | Charter | Cloud | branding, part of tenant record |
| `settings.tabs` | Charter | Cloud | guest tab list; becomes derived from the module manifest |
| `settings.idle_screensaver`, `display` | Vessel | Boat | hardware-specific |
| `settings.weather` | Vessel | Boat | provider keys and failover |
| `settings.admin` (urlKey, passwords, CIDRs, timeout) | Vessel | Boat | replaced by cloud identity for the cloud admin; still needed for the boat-local Vessel admin |
| `schema-version.json` | both | each side | per-module schema versions in the bundle manifest |

## 3. Admin screens mapped

| Department | Sub-tab | Goes to |
|---|---|---|
| Charter | Charter Admin | Cloud |
| Charter | Route & Itinerary | Cloud, with handover |
| Charter | Crew | Cloud (Crew module later) |
| Charter | Charter Pack | Cloud (this *is* the proposal) |
| Charter | Guest view | Cloud: must render from the bundle, not from the live boat |
| Charter | Site Editor | Cloud |
| Galley | Menus, Guests | Cloud |
| Hotel | Guests, Guest Alcohol, Available Alcohol, Purchased Alcohol, Cocktails | Cloud |
| Hotel | Drink Stocks | Boat (or boat-first with return package) |
| Settings | Passwords, Display Settings, Route Track, Weather | **Stays on the boat** as a slim Vessel admin |

So the boat keeps a small admin: Settings department, drink stocks, watches,
and the handover switch. Everything else moves.

## 4. How clean is the split?

Good news: the existing Charter / Galley / Hotel departments already match the
modules almost exactly. Three things need deciding:

1. **Guests appear in three departments.** Fine if `guest_list.json` stays in
   core and Galley/Hotel keep annotations in their own files (`guest_drinks.json`
   already does this). Dietary notes should move out of `charter.json`/guest
   rows into a Galley annotation file so Galley can be switched off cleanly.
2. **Hotel is really a bar module.** Either rename it ("Bar & Cellar"?) or widen
   it to cabins/housekeeping before it is sold under the Hotel name.
3. **Handover data** (itinerary, notices, available alcohol, menus during the
   charter) needs the one-writer-at-a-time rule: cloud owns until T-48h, the
   boat owns during, a return package hands it back. Spec C's conflict-safe
   saves cover simultaneous edits within one side only.

## 5. Bundle sketch

```
bundle/
  manifest.json      vessel, charter id, published_at, signature,
                     modules: { charter: 5, galley: 3 }   # hotel absent = off
  charter/           charter.json guest_list.json crew_list.json itinerary.json
                     notices.json routes.json vessel.json sites.json
  galley/            menus.json dietary.json
  hotel/             cocktails.json guest_drinks.json available-alcohol.json
  media/<sha256>     only files the boat does not already have
```

- Boat **pulls** (NAT/Starlink); it never needs an inbound connection.
- The bundle goes to the boat *server*, so it carries full module files; the
  guest-facing filtering stays in `buildCharterPayload` as today (spec M, M-D2).
  Boat-only files (watches, track, drink stocks, settings.admin) are never in it.
- Guest Portal builds its tab list from `manifest.modules`, replacing
  `settings.tabs`. Core tabs that reference module data (itinerary says "see
  menu") need a fallback when the module is absent.
- Return package = the handover files plus `drink-stocks.json`, same format,
  direction reversed.

## 6. Open questions for the captain

- Internet at sea or only in port? Sets pull frequency and bundle size limits.
- Who else needs remote access: owner, brokers, management company?
- During a charter, may the office edit at all, or is the boat in charge?
- Should drink stock be counted on board (boat-owned) or ordered from shore
  (cloud-owned with a boat count-back)?
- "Hotel" or "Interior" as the name the crew will recognise?
- Is there a second vessel in view? Decides how much tenant/billing work to do now.

## 7. Suggested order

1. Confirm this table with the captain and chef (one sitting).
2. Move dietary notes into a Galley annotation file; split `selections.json` into per-module vocab files.
3. Define the manifest and bundle, and make the boat's Guest Portal read from it
   (still served by the boat server, no cloud yet).
4. Cloud admin for Charter + Galley with one-way publish.
5. Handover switch and return package.
6. Hotel module, tenancy, billing.
