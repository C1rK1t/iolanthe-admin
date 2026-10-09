# Cloud admin — spec M: the manifest and bundle (draft 1)

Draft 1, 2026-10-09. Builds on `OWNERSHIP_DRAFT.md` (the module and owner table). Not yet confirmed with the
captain; the open questions are in §11. Decisions are numbered M-D1 … so plans can cite them.

Keys: **S** = `iolanthe/iolanthe-server`, **A** = `portal/iolanthe-admin`, **G** = `portal/iolanthe-guest`,
**C** = the cloud admin (new, lives with `zenvue-platform`; not designed here).

## 0. What this is

The cloud admin edits charters, menus and drinks off the boat. The boat keeps serving the Guest Portal offline.
A **bundle** is how edits reach the boat: a versioned, signed set of data files plus a **manifest** that lists them,
says which modules are present, and says who owns each charter right now. A **return package** is the same thing
in the other direction, carrying what the boat changed while it owned a charter.

Three facts about today's system shape the design:

- The guest already consumes one JSON payload, `GET /api/charter`, assembled by `buildCharterPayload` (S) from the
  charter folder, `library/` and `settings.json`. It never reads files directly.
- The server already has a data schema version (`schema-version.json`, version 5) with migrations that run on
  startup.
- The admin's departments (Charter / Galley / Hotel / Settings) already match the modules.

## 1. The bundle is the data directory (M-D1)

The bundle does not introduce a new schema. It carries the **same files, at the same paths, that the server
reads today**, so `buildCharterPayload` and the boat admin keep working unchanged:

```
<bundle>/
  manifest.json
  charters/<id>/charter.json  guest_list.json  crew_list.json  itinerary.json
                notices.json  menus.json  guest_drinks.json  available-alcohol.json
                routes.json  (per-charter route, if separate from itinerary)
  library/sites.json  vessel.json  cocktails.json  routes.json  anchorages.json
  library/vocab/charter.json  galley.json  hotel.json     (selections.json, split per module)
  settings/public.json         (site_title, site_subtitle; nothing from settings.admin)
  reserved-periods.json
```

Never in a bundle: `active-charter.json`, `watches.json`, `track.json`, `drink-stocks.json`, `navigation.json`,
`settings.admin`, weather, display or screensaver settings. Those are boat-owned (ownership draft §2).

Module membership of each file is fixed by the ownership draft. A module that is switched off for a vessel simply
has no files in the bundle and no entry in `manifest.modules`.

**Server-to-server, not server-to-guest (M-D2).** The bundle goes to the boat *server*. Guest-facing filtering
(`sanitizePublicSettings`, the guest list's first-names-only rule, and so on) stays where it is, in
`buildCharterPayload`. So the bundle may contain crew-only data (full guest records, provisioning notes) that the
guest never sees. This corrects the ownership draft's §5, which said only guest-facing slices travel.

## 2. The manifest (M-D3)

`manifest.json`, canonical JSON (sorted keys, no whitespace) when signed:

```json
{
  "format": 1,
  "bundle_id": "01J9W2…",                 ULID, sorts by time
  "direction": "publish",                 "publish" (cloud → boat) or "return" (boat → cloud)
  "vessel": "iolanthe",
  "published_at": "2026-10-09T08:12:00Z",
  "publisher": { "kind": "cloud", "user": "captain@…" },
  "schema": 5,                            the server data schema this bundle was written at
  "modules": { "charter": 1, "galley": 1, "hotel": 1 },   per-module content versions (§6)
  "charters": {
    "csaba": { "owner": "cloud", "handover_at": "2026-11-01T00:00:00Z" },
    "larry": { "owner": "boat",  "handover_at": null }
  },
  "files": [ { "path": "charters/csaba/menus.json", "sha256": "…", "bytes": 4120 }, … ],
  "media": [ { "path": "images/sites/coron-01.jpg", "sha256": "…", "bytes": 812233 }, … ],
  "base": { "bundle_id": "01J9V…" },      the bundle this one was derived from (null for the first)
  "signature": { "alg": "ed25519", "key_id": "iolanthe-2026-10", "sig": "…" }
}
```

- `files` lists every data file in the bundle with its hash. `media` lists the Site Editor files the bundle's
  `sites.json` refers to; they are fetched by hash, not shipped inline (§4).
- `charters` carries ownership (§5). A charter absent from `charters` is untouched by this bundle.
- `signature` covers the canonical manifest without the `signature` member. The boat verifies it with the
  publisher's public key installed at pairing (§8). An unsigned or wrongly signed bundle is refused and logged.

## 3. Transport: the boat pulls (M-D4)

The boat is behind NAT/Starlink and must never need an inbound connection.

| Call | Who | What |
|---|---|---|
| `GET /v1/vessels/<vessel>/bundles/latest` | boat → C | the latest manifest, or 304 if `If-None-Match` matches |
| `GET /v1/vessels/<vessel>/bundles/<id>/files/<path>` | boat → C | one data file |
| `GET /v1/vessels/<vessel>/media/<sha256>` | boat → C | one media file by content hash |
| `POST /v1/vessels/<vessel>/returns` | boat → C | a return package (manifest + files, multipart) |

Auth: `Authorization: Bearer <vessel token>` on every call. The token is long-lived, per vessel, stored in the
boat's `settings.json` under `bundles.token`, rotatable from the cloud (the old token keeps working for 24 h).
The boat sends `X-Iolanthe-Schema: 5` so the cloud can refuse to publish ahead of the boat (§6).

Cadence: the boat polls every 15 minutes while it has a connection (configurable, `bundles.poll_minutes`), and the
boat Vessel admin has **Pull now**. A pull that finds no new manifest costs one small request.

## 4. Apply: stage, verify, swap (M-D5)

Done by a new `lib/bundle.js` (S), pure where possible so it is Node-tested with fixtures.

1. Fetch the manifest; verify the signature; refuse if `schema` is newer than the boat's (§6).
2. Diff `files` and `media` hashes against the boat's current data (a `data/bundle-state.json` records the applied
   manifest, so the diff is manifest-to-manifest, not a disk scan). Fetch only what changed.
3. Stage everything under `data/incoming/<bundle_id>/`. Re-hash on arrival; any mismatch aborts the whole bundle.
4. For each charter in `manifest.charters` whose `owner` is `cloud`: replace the charter folder's bundle files by
   rename. For charters the **boat owns**, replace nothing (§5). Library and vocab files are always replaced.
5. Copy new media into `SITE_MEDIA_DIR` under the paths `sites.json` uses (the hash is only for diffing;
   paths stay stable so existing links keep working). Keep a `media-index.json` of path → sha256.
6. Write `bundle-state.json` `{ applied_bundle_id, applied_at, manifest }`; keep the previous two bundles under
   `data/bundles/` for rollback (**Roll back** in the Vessel admin).
7. Run the normal startup migrations if the bundle's `schema` is older than the boat's.

Partial application never happens: a failure before step 6 leaves the previous state in place.

**Phase 1 has no cloud (M-D6).** The first implementation adds `node scripts/bundle.js publish` (writes a bundle
from the boat's own data dir) and `… apply <dir>` on the server, and makes `/api/charter` carry the applied manifest
(§7). That proves the format, the apply logic and the manifest-driven guest tabs with the boat alone. The cloud
endpoints in §3 come with the cloud admin.

## 5. Ownership and handover (M-D7)

One writer at a time, per charter. The manifest's `charters.<id>.owner` is the rule, and the **boat is the
authority** on when it changes:

| Owner | Cloud may | Boat may |
|---|---|---|
| `cloud` | edit all module files | read; the boat admin shows the charter locked ("edited ashore") |
| `boat` | read; the cloud admin shows it locked ("on board") | edit the handover files |

Handover files are those the ownership draft marks Handover: `itinerary.json`, `notices.json`, `menus.json`,
`available-alcohol.json`, `charter.json`, `guest_list.json`, `guest_drinks.json`. The rest of the charter's files
stay cloud-owned even during the charter.

- **Taking over.** The cloud sets `handover_at` (default: start date minus 48 h, editable). When the boat applies a
  bundle whose `handover_at` has passed, or when the crew presses **Take over** in the Vessel admin, the boat
  records `owner: boat` locally with the hashes of the files at that moment (`base`). It reports this on its next
  pull (`X-Iolanthe-Owned: csaba`), and the cloud locks the charter.
- **Handing back.** When the charter ends (or the crew presses **Hand back**), the boat builds a return package
  (§5a) and, once the cloud acknowledges it, records `owner: cloud` again.
- A bundle that tries to change a boat-owned charter's handover files is applied **except** for those files, and
  the skipped files are listed in the apply log and the Vessel admin. Nothing is lost on either side.

Spec C's conflict-safe saves (base revision on `itinerary.json`) continue to protect two people editing on the
same side; they are unchanged by this spec.

### 5a. The return package (M-D8)

The same format with `direction: "return"`. It contains, for each boat-owned charter being handed back, the handover
files that differ from `base`, plus always `library/drink-stocks.json` (counted on board) and, if the crew ticks it,
`charters/<id>/track.json`. The boat signs it with its own key (installed at pairing). The cloud checks each file's
`base` hash against what it holds: if the cloud copy is still at `base`, the file is applied; otherwise the charter is
flagged for a person to resolve. The cloud never merges silently.

## 6. Versions (M-D9)

Two independent numbers:

- `schema`: the server's existing data schema (5). The cloud writes at the boat's schema or older, never newer: the
  boat must be upgraded first, and the cloud sees the boat's version on every pull. A bundle with `schema > boat`
  is refused with a clear message in the Vessel admin ("Update the boat server to apply this bundle").
- `modules.<name>`: a content version per module, starting at 1, bumped when a module's files change shape in a way
  the Guest Portal must know about. Changes are additive wherever possible (new optional fields) so the guest can
  read a newer version by ignoring what it doesn't know. The guest logs a warning for a version above what it was
  built for and still renders.

## 7. The Guest Portal (M-D10)

The server adds two members to the `/api/charter` payload:

```json
"bundle":  { "id": "01J9W2…", "published_at": "…", "applied_at": "…" },   null when no bundle has ever been applied
"modules": { "charter": 1, "galley": 1, "hotel": 1 }
```

The guest replaces `settings.tabs` as the source of its tab list with a **tab registry** in `guest.js`:

| Tab id | Label | Module | Shown when |
|---|---|---|---|
| `navigation` | Navigation | vessel | always (boat data) |
| `itinerary` | Itinerary | charter | always (core) |
| `menu` | Today's Menu | galley | `modules.galley` present |
| `drinks` | Wine & Drinks | hotel | `modules.hotel` present |
| `vessel` | Vessel Info | charter | always |

Labels stay overridable from `settings.tabs` (branding), but presence is decided by the registry. Transitional rule:
a payload with **no** `modules` member (today's boat, before any bundle) is treated as all modules present, so
behaviour is identical until a bundle is applied. The server emits `modules` from the applied manifest, or, with no
bundle, from which module files exist on disk.

Core places that mention module data need a fallback when the module is absent: the itinerary's "see today's
menu" link, the stop card's drinks note, and the Charter Pack's menu section (which is cloud-side later, but the
boat-side preview renders it). A plan will list them from a grep of `menu`/`drinks` references in G and A's
`pack-render.js`.

## 8. Pairing and keys (M-D11)

One-time, from the boat Vessel admin: paste a pairing code issued by the cloud for this vessel. The boat calls
`POST /v1/pairings` with it and receives the vessel token, the cloud's publishing public key (`key_id`), and
registers its own return-package public key (generated locally, private key in `settings.json` under
`bundles.keys`). Keys rotate by publishing a bundle whose manifest is signed with the old key and carries the new
public key; the boat trusts both for 30 days.

## 9. Boat Vessel admin: the Bundles tab (M-D12)

In the Settings department (A), which stays on the boat: last pull time and result, applied bundle id and
published time, **Pull now**, **Roll back** (to either kept bundle), per-charter ownership with **Take over** /
**Hand back**, the skipped-files list from the last apply, return-package status, and pairing. No module data is
edited here.

## 10. Code, tests, release order

- **S first:** `lib/bundle.js` (manifest build, canonicalise, sign/verify, diff, apply plan, ownership rules;
  pure functions over an injected fs), `scripts/bundle.js` (publish/apply CLI for phase 1), the `bundle` and
  `modules` payload members, `bundle-state.json`. Node tests with fixture bundles including a tampered file, a
  boat-owned charter, a schema-too-new manifest, and a rollback. Released alone: nothing changes for the guest
  until a bundle is applied.
- **G second:** the tab registry and the module fallbacks. Tests for tab derivation with and without `modules`.
- **A third:** the Bundles tab.
- **C last:** the cloud endpoints of §3, when the cloud admin exists.

Size guide: `lib/bundle.js` should stay under 800 lines; split signing and apply if it grows.

## 11. Out of scope

The cloud admin's UI and identity (Clerk), billing and tenancy, the Crew module, two-way live sync, guest-device
bundles (the guest keeps talking to the boat server), and moving media hosting off the boat.

## 12. Before planning

Confirm with the captain and chef:

1. The handover default (T-48 h) and whether the office may edit anything during a charter.
2. Drink stocks: boat-counted only (as specced) or also ordered from shore.
3. Track in the return package: never, opt-in (as specced), or always.
4. Poll cadence and any data cap on Starlink.
5. Whether `routes.json` per charter is a separate file by the time this is built (depends on route planner
   phase 4).
