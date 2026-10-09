# Spec C — Plan 1: Server (revisions, record ids, migration v7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply [spec-c.md](../spec-c.md) §2 to `iolanthe-server`: nine files get a `{revision, saved_by, saved_at}`
stamp, every save of them takes `base_revision` and answers a stale one with 409 and the stored copy, records get
stable ids (migration v7), server-side writers bump revisions, and `GET /api/admin/revisions` reports the stamps.

**Architecture:** Two new pure modules with `node --test` coverage: `lib/file-revisions.js` (the stamp, the 409 error,
the list of the nine files) and `lib/record-ids.js` (ids, deterministic `g-slot-<n>` guest ids, migration v7 over a
data directory). `server.js` wires them into the existing read / save functions; a 409 travels through the existing
admin error handler (`ADMIN_ERROR_DETAIL_KEYS` gains `data`, `saved_by`, `saved_at`). No change to the guest site: the
public `/api/charter` strips the stamp.

**Tech Stack:** Node ≥ 18, no dependencies, `node --test` (194 tests → 206). **Precondition:** server PR #11
(`fix/admin-password-hashing`, migration v6 `hash-admin-passwords`) is merged first; this plan's migration is v7 and
its OLD blocks are written against `main` with #11 in it.

**Dry-run (done while planning):** this plan's text was applied to a `git archive` copy of #11's branch at `42fefcd`:
`node --test` 206/206, `node --check server.js` clean, and `scripts/check-revisions.js` (Task 5) passed every check
against a scratch server on a copy of `data-scratch`: migration v7 stamped 33 files; for each of the nine files a good
save (revision + 1, `saved_by` charter), a stale save and a missing `base_revision` (409 with the stored copy); ids on
crew, guests and cocktails; a guest-count change bumping `guest_list.json`; the revisions endpoint (match, library
only, 404); a purchase and its reverse bumping `drink-stocks.json`; the public payload unstamped.

**Shared checkout hazard:** other Claude sessions may work in the same checkouts. **Never** run `git checkout`,
`git switch`, `git stash` or `git add -A` in the main checkouts under `S:/Users/David/OneDrive/Maker Space/GitHub`. All
work happens in the worktree made in Task 0. Stage files by name. Before each task, run
`git -C <worktree> branch --show-current` and expect `feat/spec-c-server`.

**Reading before you start (in the worktree):** `lib/reserved-periods.js` and `lib/charter-pack.js` (the revision
pattern this generalises), `server.js` around `ADMIN_ERROR_DETAIL_KEYS` (~32), `DATA_MIGRATIONS` (~588),
`readDrinkStocks` (~1076), `createCharterAlcoholPurchase` (~2251), `readAvailableAlcoholAdmin` (~2454), `readCocktails`
(~3647), `readAdminCharterBundle` (~4218), `normalizeGuestListForCount` (~4545), `syncGuestListForCharter` (~4583),
`buildCharterPayload` (~4795), `saveAdminJsonFile` (~6244) and the admin route chain (`handleAdminApi`, ~6900 on).

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `lib/file-revisions.js` (new) + `test/file-revisions.test.js` (new) | Task 1: `CHARTER_FILES`, `LIBRARY_FILES`, `readRevision`, `stampOf`, `stripStamp`, `withStampOf`, `revisionConflict`, `assertBase`, `stamp`, `initialStamp` |
| `lib/record-ids.js` (new) + `test/record-ids.test.js` (new) | Task 2: `newRecordId`, `ensureRecordIds`, `withSlotIds`, `migrateRecordIds` |
| `server.js` | Task 3: the charter files (bundle, generic save, guest ids, guest-count sync, charter create, migration v7). Task 4: the library files (drink stocks and purchases, available alcohol, cocktails, sites), the revisions endpoint, the public payload |
| `scripts/check-revisions.js` (new) | Task 5: the endpoint checklist |
| `CLAUDE.md` | Task 6: key files, data layout, the conflict-safe save endpoints, migration v7, test count |

---

### Task 0: Worktree (this session runs it, not an implementer)

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server"
git fetch -q origin
git worktree add "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-c-build/iolanthe/iolanthe-server" -b feat/spec-c-server origin/main
cd "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-c-build/iolanthe/iolanthe-server" && node --test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected `ℹ pass 194`, `ℹ fail 0`. Every path below is relative to this worktree.

---

### Task 1: `lib/file-revisions.js` and its tests

**Files:** create `test/file-revisions.test.js`, create `lib/file-revisions.js`

- [ ] **Step 1: Write the failing test.** Create `test/file-revisions.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const lib = require("../lib/file-revisions");

const NOW = "2026-11-03T06:02:00.000Z";

test("readRevision: integers of 0 or more, else 0", () => {
  assert.equal(lib.readRevision({ revision: 7 }), 7);
  assert.equal(lib.readRevision({ revision: 0 }), 0);
  assert.equal(lib.readRevision({ revision: -1 }), 0);
  assert.equal(lib.readRevision({ revision: "7" }), 0);
  assert.equal(lib.readRevision({ revision: 1.5 }), 0);
  assert.equal(lib.readRevision({}), 0);
  assert.equal(lib.readRevision(null), 0);
  assert.equal(lib.readRevision([1, 2]), 0);
});

test("stampOf and stripStamp", () => {
  const data = { crew: [], revision: 3, saved_by: "hotel", saved_at: NOW };
  assert.deepEqual(lib.stampOf(data), { revision: 3, saved_by: "hotel", saved_at: NOW });
  assert.deepEqual(lib.stampOf({ crew: [] }), { revision: 0, saved_by: "", saved_at: "" });
  assert.deepEqual(lib.stripStamp(data), { crew: [] });
  assert.deepEqual(data, { crew: [], revision: 3, saved_by: "hotel", saved_at: NOW }, "input not mutated");
});

test("withStampOf puts the raw file's stamp on a view", () => {
  const raw = { guests: [{ id: "g-1" }], revision: 4, saved_by: "charter", saved_at: NOW };
  const view = { guests: [{ id: "g-1", active: true }], revision: 99 };
  assert.deepEqual(lib.withStampOf(view, raw), { guests: [{ id: "g-1", active: true }], revision: 4, saved_by: "charter", saved_at: NOW });
  assert.deepEqual(lib.withStampOf({ items: [] }, {}), { items: [], revision: 0, saved_by: "", saved_at: "" });
});

test("revisionConflict: a matching base is fine", () => {
  assert.equal(lib.revisionConflict({ revision: 2 }, 2), null);
  assert.equal(lib.revisionConflict({}, 0), null);
});

test("revisionConflict: stale, missing and non-integer bases are refused with the stored copy", () => {
  const stored = { crew: [{ id: "c-1" }], revision: 5, saved_by: "hotel", saved_at: NOW };
  for (const base of [4, 6, undefined, null, "5", 5.5]) {
    const error = lib.revisionConflict(stored, base);
    assert.ok(error instanceof Error, `base ${String(base)}`);
    assert.equal(error.statusCode, 409);
    assert.equal(error.code, "revision");
    assert.equal(error.revision, 5);
    assert.equal(error.saved_by, "hotel");
    assert.equal(error.saved_at, NOW);
    assert.equal(error.data, stored);
    assert.match(error.message, /revision 5/);
  }
});

test("assertBase throws the conflict", () => {
  assert.doesNotThrow(() => lib.assertBase({ revision: 1 }, 1));
  assert.throws(() => lib.assertBase({ revision: 1 }, 0), (error) => error.statusCode === 409 && error.code === "revision");
});

test("stamp: stored revision + 1, who and when; any incoming stamp is dropped", () => {
  const incoming = { crew: [{ id: "c-1" }], revision: 40, saved_by: "galley", saved_at: "old" };
  const saved = lib.stamp(incoming, { revision: 2 }, "hotel", NOW);
  assert.deepEqual(saved, { crew: [{ id: "c-1" }], revision: 3, saved_by: "hotel", saved_at: NOW });
  assert.equal(incoming.revision, 40, "input not mutated");
  assert.equal(lib.stamp({}, {}, "", NOW).saved_by, "system");
  assert.equal(lib.stamp({}, {}, "charter", NOW).revision, 1);
});

test("initialStamp: revision 0 by system", () => {
  assert.deepEqual(lib.initialStamp({ items: [], revision: 9 }, NOW), { items: [], revision: 0, saved_by: "system", saved_at: NOW });
});
```

- [ ] **Step 2: Run it and watch it fail.** `node --test test/file-revisions.test.js` → fails with `Cannot find module '../lib/file-revisions'`.

- [ ] **Step 3: Write the module.** Create `lib/file-revisions.js`:

```js
"use strict";

// Conflict-safe saves (charter rework spec C §2.1). Every protected file carries {revision, saved_by, saved_at} at its
// top level. A save names the revision it started from (base_revision); a stale or missing one is refused with 409 and
// the stored copy, so the admin can merge its change into it and save again.

const STAMP_KEYS = Object.freeze(["revision", "saved_by", "saved_at"]);
// The nine files spec C protects (SC-D1): six in each charters/<id>/ folder, three in library/.
const CHARTER_FILES = Object.freeze(["charter.json", "crew_list.json", "guest_list.json", "menus.json", "guest_drinks.json", "available-alcohol.json"]);
const LIBRARY_FILES = Object.freeze(["drink-stocks.json", "cocktails.json", "sites.json"]);

function plain(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readRevision(data) {
  const revision = plain(data).revision;
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function stampOf(data) {
  const source = plain(data);
  return {
    revision: readRevision(source),
    saved_by: typeof source.saved_by === "string" ? source.saved_by : "",
    saved_at: typeof source.saved_at === "string" ? source.saved_at : ""
  };
}

function stripStamp(data) {
  const copy = { ...plain(data) };
  STAMP_KEYS.forEach((key) => { delete copy[key]; });
  return copy;
}

// A normalised view of a file with the stamp of the raw file it was made from.
function withStampOf(view, raw) {
  return { ...stripStamp(view), ...stampOf(raw) };
}

// stored: the copy exactly as the matching GET returns it. Returns null when baseRevision matches, else the 409 error
// the admin error handler turns into {error, code, revision, saved_by, saved_at, data}.
function revisionConflict(stored, baseRevision) {
  const current = stampOf(stored);
  if (Number.isInteger(baseRevision) && baseRevision === current.revision) {
    return null;
  }
  const error = new Error(`Someone else saved this (revision ${current.revision}). Reload the page to see their changes.`);
  error.statusCode = 409;
  error.code = "revision";
  error.revision = current.revision;
  error.saved_by = current.saved_by;
  error.saved_at = current.saved_at;
  error.data = stored;
  return error;
}

function assertBase(stored, baseRevision) {
  const error = revisionConflict(stored, baseRevision);
  if (error) {
    throw error;
  }
}

// The next copy to write: data without any stamp it arrived with, then the stored revision + 1 and who saved it.
function stamp(data, stored, savedBy, now) {
  return {
    ...stripStamp(data),
    revision: readRevision(stored) + 1,
    saved_by: typeof savedBy === "string" && savedBy ? savedBy : "system",
    saved_at: now
  };
}

// The stamp a file gets the first time the server writes it without a save (migration v7, a created default file).
function initialStamp(data, now) {
  return { ...stripStamp(data), revision: 0, saved_by: "system", saved_at: now };
}

module.exports = { STAMP_KEYS, CHARTER_FILES, LIBRARY_FILES, readRevision, stampOf, stripStamp, withStampOf, revisionConflict, assertBase, stamp, initialStamp };
```

- [ ] **Step 4: Run the tests.** `node --test test/file-revisions.test.js` → `ℹ pass 8`, `ℹ fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add lib/file-revisions.js test/file-revisions.test.js
git commit -m "feat(server): lib/file-revisions, the revision stamp and the 409 (spec C)"
```

---

### Task 2: `lib/record-ids.js` and its tests

**Files:** create `test/record-ids.test.js`, create `lib/record-ids.js`

- [ ] **Step 1: Write the failing test.** Create `test/record-ids.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const lib = require("../lib/record-ids");

const NOW = "2026-11-03T06:02:00.000Z";
const ID_RE = /^c-[0-9a-z]{8}$/;

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("newRecordId: prefix and 8 base-36 characters, never one already taken", () => {
  assert.match(lib.newRecordId("c"), ID_RE);
  const taken = new Set();
  for (let i = 0; i < 200; i += 1) {
    const id = lib.newRecordId("c", taken);
    assert.ok(!taken.has(id));
    taken.add(id);
  }
});

test("ensureRecordIds keeps ids, reuses a legacy id, fills the rest, splits duplicates", () => {
  const list = [
    { id: "c-keep0001", name: "A" },
    { name: "B" },
    { guest_id: "legacy-7", name: "C" },
    { id: "c-keep0001", name: "D" },
    "not a record"
  ];
  const result = lib.ensureRecordIds(list, "c", "guest_id");
  assert.equal(result[0], list[0], "untouched record kept as is");
  assert.match(result[1].id, ID_RE);
  assert.equal(result[2].id, "legacy-7");
  assert.match(result[3].id, ID_RE);
  assert.notEqual(result[3].id, "c-keep0001");
  assert.equal(result[4], "not a record");
  assert.equal(new Set(result.slice(0, 4).map((r) => r.id)).size, 4);
  assert.equal(list[1].id, undefined, "input not mutated");
  assert.deepEqual(lib.ensureRecordIds(null, "c"), []);
});

test("withSlotIds: g-slot-<position>, bumped past taken ids, the same on every call", () => {
  const guests = [{ id: "g-aaaa0001" }, { full_name: "" }, { id: "g-slot-3" }, { full_name: "" }];
  const once = lib.withSlotIds(guests);
  assert.deepEqual(once.map((g) => g.id), ["g-aaaa0001", "g-slot-2", "g-slot-3", "g-slot-4"]);
  assert.deepEqual(lib.withSlotIds(guests), once);
  assert.deepEqual(lib.withSlotIds([{ id: "g-slot-1" }, {}]).map((g) => g.id), ["g-slot-1", "g-slot-2"]);
  assert.deepEqual(lib.withSlotIds([{}, { id: "g-slot-1" }]).map((g) => g.id), ["g-slot-2", "g-slot-1"]);
  assert.equal(guests[1].id, undefined, "input not mutated");
});

test("migrateRecordIds: ids and revision 0 on the nine files, once", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "record-ids-"));
  const charter = path.join(dataDir, "charters", "csaba");
  writeJson(path.join(charter, "crew_list.json"), { crew: [{ name: "Fred" }, { name: "Ana" }] });
  writeJson(path.join(charter, "guest_list.json"), { guests: [{ guest_id: "g-old", full_name: "James" }, { full_name: "" }] });
  writeJson(path.join(charter, "menus.json"), { menus: [{ day: 1, dinner: [] }] });
  writeJson(path.join(charter, "charter.json"), { name: "Csaba", revision: 3, saved_by: "charter", saved_at: NOW });
  writeJson(path.join(charter, "guest_drinks.json"), { sections: [] });
  writeJson(path.join(charter, "itinerary.json"), { version: 2, revision: 4 });
  writeJson(path.join(dataDir, "library", "cocktails.json"), { cocktails: [{ name: "Mule", ingredients: [] }] });
  writeJson(path.join(dataDir, "library", "drink-stocks.json"), { items: [{ id: "malibu-1", name: "Malibu" }] });
  fs.mkdirSync(path.join(dataDir, "charters", "not-a-dir-file"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "charters", "stray.json"), "{}");

  const first = lib.migrateRecordIds(dataDir, NOW);
  assert.equal(first.written, 6, "crew, guests, menus, guest drinks, cocktails, drink stocks");

  const crew = readJson(path.join(charter, "crew_list.json"));
  assert.equal(crew.crew.length, 2);
  crew.crew.forEach((member) => assert.match(member.id, ID_RE));
  assert.deepEqual([crew.revision, crew.saved_by, crew.saved_at], [0, "system", NOW]);
  const guests = readJson(path.join(charter, "guest_list.json"));
  assert.equal(guests.guests[0].id, "g-old");
  assert.match(guests.guests[1].id, /^g-[0-9a-z]{8}$/);
  assert.match(readJson(path.join(charter, "menus.json")).menus[0].id, /^m-[0-9a-z]{8}$/);
  assert.deepEqual(readJson(path.join(charter, "charter.json")), { name: "Csaba", revision: 3, saved_by: "charter", saved_at: NOW }, "already stamped: untouched");
  assert.deepEqual(readJson(path.join(charter, "itinerary.json")), { version: 2, revision: 4 }, "itinerary is not one of the nine");
  assert.match(readJson(path.join(dataDir, "library", "cocktails.json")).cocktails[0].id, /^k-[0-9a-z]{8}$/);
  assert.equal(readJson(path.join(dataDir, "library", "drink-stocks.json")).items[0].id, "malibu-1");
  assert.equal(fs.existsSync(path.join(dataDir, "library", "sites.json")), false, "missing files are not created");

  const crewIds = crew.crew.map((member) => member.id);
  assert.deepEqual(lib.migrateRecordIds(dataDir, "2026-11-04T00:00:00.000Z"), { written: 0 }, "second run changes nothing");
  assert.deepEqual(readJson(path.join(charter, "crew_list.json")).crew.map((member) => member.id), crewIds);
});
```

- [ ] **Step 2: Run it and watch it fail.** `node --test test/record-ids.test.js` → fails with `Cannot find module '../lib/record-ids'`.

- [ ] **Step 3: Write the module.** Create `lib/record-ids.js`:

```js
"use strict";

// Stable record ids (charter rework spec C §2.4). The admin merges two people's saves record by record, so every crew
// member, guest, day's menu and cocktail needs an id that survives edits and moves. Drink stocks and sites already have
// ids; Guest Alcohol and Available Alcohol key on category / stock_id.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const fileRevisions = require("./file-revisions");

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
// The keyed lists migration v7 fills: file -> [list field, id prefix, legacy id field].
const CHARTER_LISTS = Object.freeze({
  "crew_list.json": ["crew", "c", ""],
  "guest_list.json": ["guests", "g", "guest_id"],
  "menus.json": ["menus", "m", ""]
});
const LIBRARY_LISTS = Object.freeze({
  "cocktails.json": ["cocktails", "k", ""]
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordId(record) {
  return isRecord(record) && typeof record.id === "string" ? record.id.trim() : "";
}

// "<prefix>-" and 8 base-36 characters, not already in taken (a Set of ids).
function newRecordId(prefix, taken = new Set()) {
  for (;;) {
    let tail = "";
    for (let i = 0; i < 8; i += 1) {
      tail += ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)];
    }
    const id = `${prefix}-${tail}`;
    if (!taken.has(id)) {
      return id;
    }
  }
}

// A copy of list where every record has a unique string id: an existing id is kept (the first of any duplicates),
// a legacy id field (guest_id) is reused, anything else gets a new id. Values that are not records are left alone.
function ensureRecordIds(list, prefix, legacyKey = "") {
  if (!Array.isArray(list)) {
    return [];
  }
  const own = (record) => recordId(record)
    || (legacyKey && typeof record[legacyKey] === "string" ? record[legacyKey].trim() : "");
  const taken = new Set(list.filter(isRecord).map(own).filter(Boolean));
  const used = new Set();
  return list.map((record) => {
    if (!isRecord(record)) {
      return record;
    }
    const id = own(record);
    if (id && !used.has(id)) {
      used.add(id);
      return record.id === id ? record : { ...record, id };
    }
    const fresh = newRecordId(prefix, taken);
    taken.add(fresh);
    used.add(fresh);
    return { ...record, id: fresh };
  });
}

// Guests the server makes or meets without an id while reading (blank slots from the guest-count rule, a guest an old
// admin added) get g-slot-<n>: n is the guest's 1-based position, bumped past ids already in the list. It is the same
// on every read, because the charter bundle normalises the guest list without writing it. The admin mirrors this.
function withSlotIds(guests) {
  if (!Array.isArray(guests)) {
    return [];
  }
  const taken = new Set(guests.map(recordId).filter(Boolean));
  return guests.map((guest, index) => {
    if (!isRecord(guest) || recordId(guest)) {
      return guest;
    }
    let n = index + 1;
    while (taken.has(`g-slot-${n}`)) {
      n += 1;
    }
    const id = `g-slot-${n}`;
    taken.add(id);
    return { ...guest, id };
  });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

// One file: ids on its keyed list (if any), an initial stamp if it has none. Returns true when it wrote the file.
function migrateFile(filePath, listSpec, now) {
  const raw = readJson(filePath);
  if (!isRecord(raw)) {
    return false;
  }
  let next = raw;
  if (listSpec && Array.isArray(raw[listSpec[0]])) {
    next = { ...next, [listSpec[0]]: ensureRecordIds(raw[listSpec[0]], listSpec[1], listSpec[2]) };
  }
  if (!Number.isInteger(raw.revision)) {
    next = fileRevisions.initialStamp(next, now);
  }
  if (JSON.stringify(next) === JSON.stringify(raw)) {
    return false;
  }
  writeJsonAtomic(filePath, next);
  return true;
}

// Migration v7: ids and revision 0 for the nine protected files under dataDir. Safe to run twice.
function migrateRecordIds(dataDir, now) {
  let written = 0;
  const chartersDir = path.join(dataDir, "charters");
  if (fs.existsSync(chartersDir)) {
    for (const entry of fs.readdirSync(chartersDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      for (const fileName of fileRevisions.CHARTER_FILES) {
        if (migrateFile(path.join(chartersDir, entry.name, fileName), CHARTER_LISTS[fileName], now)) {
          written += 1;
        }
      }
    }
  }
  for (const fileName of fileRevisions.LIBRARY_FILES) {
    if (migrateFile(path.join(dataDir, "library", fileName), LIBRARY_LISTS[fileName], now)) {
      written += 1;
    }
  }
  return { written };
}

module.exports = { CHARTER_LISTS, LIBRARY_LISTS, newRecordId, ensureRecordIds, withSlotIds, migrateRecordIds };
```

- [ ] **Step 4: Run the tests.** `node --test` → `ℹ pass 206`, `ℹ fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add lib/record-ids.js test/record-ids.test.js
git commit -m "feat(server): lib/record-ids, stable record ids and migration v7 (spec C)"
```

---

### Task 3: `server.js`, the charter files and migration v7

**Files:** modify `server.js`

Every replacement below matches exactly once in `server.js`. Apply them in order.

- [ ] **Step 1: Apply the replacements.**

**1. require the two new libraries** — in `server.js`, replace

```js
const charterPackLib = require("./lib/charter-pack");
```

with

```js
const charterPackLib = require("./lib/charter-pack");
const fileRevisions = require("./lib/file-revisions");
const recordIds = require("./lib/record-ids");
```

**2. a 409 carries the stored copy and its stamp** — in `server.js`, replace

```js
const ADMIN_ERROR_DETAIL_KEYS = Object.freeze(["overlaps", "forced_charter", "field", "errors", "code", "revision", "periods", "pack"]);
```

with

```js
const ADMIN_ERROR_DETAIL_KEYS = Object.freeze(["overlaps", "forced_charter", "field", "errors", "code", "revision", "periods", "pack", "data", "saved_by", "saved_at"]);
```

**3. migration v7** — in `server.js`, replace

```js
  { version: 6, name: "hash-admin-passwords", run: migrateAdminPasswordHashesV6 }
];
```

with

```js
  { version: 6, name: "hash-admin-passwords", run: migrateAdminPasswordHashesV6 },
  {
    version: 7,
    name: "record-ids",
    run: (dataDir) => {
      const result = recordIds.migrateRecordIds(dataDir, nowIso());
      console.log(`Record ids v7: ${result.written} file(s) gained record ids or a revision.`);
    }
  }
];
```

**4. the bundle: one view per protected file, stamp included** — in `server.js`, replace

```js
function readAdminCharterBundle(charterId) {
  const safeId = validateAdminCharterId(charterId);
  if (!safeId || !hasCharterDirectory(safeId)) {
    return null;
  }

  const defaults = defaultCharterData(safeId);
  const bundle = ADMIN_CHARTER_FILES.reduce((result, fileName) => {
    result[fileName] = readCharterJson(safeId, fileName, defaults[fileName]);
    return result;
  }, { charter_id: safeId });
  bundle["charter.json"] = normalizeAdminCharterData(bundle["charter.json"]);
  bundle["guest_list.json"] = normalizeGuestListForCount(bundle["guest_list.json"], bundle["charter.json"].guest_count);
  bundle[GUEST_DRINKS_FILE_NAME] = normalizeGuestDrinksPresentation(bundle[GUEST_DRINKS_FILE_NAME]);
```

with

```js
// Spec C §2.2: the copy of one charter file the admin edits, as the bundle and a 409 both show it (stamp included).
function adminCharterFileView(charterId, fileName, raw) {
  let view = raw;
  if (fileName === "charter.json") {
    view = normalizeAdminCharterData(raw);
  } else if (fileName === "guest_list.json") {
    const guestCount = normalizeAdminCharterData(readCharterJson(charterId, "charter.json", {})).guest_count;
    view = normalizeGuestListForCount(raw, guestCount);
  } else if (fileName === GUEST_DRINKS_FILE_NAME) {
    view = normalizeGuestDrinksPresentation(raw);
  }
  return fileRevisions.withStampOf(view, raw);
}

// Spec C §2.4: crew members and day menus keep their ids; one saved without an id gets a new one.
function withCharterRecordIds(fileName, data) {
  const source = toPlainObject(data);
  const spec = recordIds.CHARTER_LISTS[fileName];
  if (!spec || fileName === "guest_list.json" || !Array.isArray(source[spec[0]])) {
    return source;
  }
  return { ...source, [spec[0]]: recordIds.ensureRecordIds(source[spec[0]], spec[1], spec[2]) };
}

function readAdminCharterBundle(charterId) {
  const safeId = validateAdminCharterId(charterId);
  if (!safeId || !hasCharterDirectory(safeId)) {
    return null;
  }

  const defaults = defaultCharterData(safeId);
  const bundle = ADMIN_CHARTER_FILES.reduce((result, fileName) => {
    result[fileName] = readCharterJson(safeId, fileName, defaults[fileName]);
    return result;
  }, { charter_id: safeId });
  ADMIN_CHARTER_FILES.filter(fileName => fileRevisions.CHARTER_FILES.includes(fileName)).forEach(fileName => {
    bundle[fileName] = adminCharterFileView(safeId, fileName, bundle[fileName]);
  });
```

**5. guests without an id get a g-slot id on every read** — in `server.js`, replace

```js
  return {
    ...source,
    guests: sortAndEnsurePrincipalGuests(guests)
  };
}
```

with

```js
  return {
    ...source,
    guests: recordIds.withSlotIds(sortAndEnsurePrincipalGuests(guests))
  };
}
```

**6. the guest-count sync writes only a change, as a stamped save** — in `server.js`, replace

```js
function syncGuestListForCharter(charterId, guestCount) {
  const current = readCharterJson(charterId, "guest_list.json", { guests: [] });
  const normalized = normalizeGuestListForCount(current, guestCount);
  writeJsonFileAtomic(path.join(CHARTERS_DIR, charterId, "guest_list.json"), normalized);
  return normalized;
}

function createAdminCharter(payload) {
```

with

```js
// Spec C §2.3: rewrites the guest list only when the guest-count rule changes it, as a stamped save.
function syncGuestListForCharter(charterId, guestCount, savedBy) {
  const current = readCharterJson(charterId, "guest_list.json", { guests: [] });
  const normalized = normalizeGuestListForCount(current, guestCount);
  if (JSON.stringify(fileRevisions.stripStamp(normalized)) === JSON.stringify(fileRevisions.stripStamp(current))) {
    return current;
  }
  const saved = fileRevisions.stamp(normalized, current, savedBy, nowIso());
  writeJsonFileAtomic(path.join(CHARTERS_DIR, charterId, "guest_list.json"), saved);
  return saved;
}

function createAdminCharter(payload, savedBy) {
```

**7. a new charter's files start at revision 1** — in `server.js`, replace

```js
    writeJsonFileAtomic(path.join(charterDir, fileName), value);
  });
  writeJsonFileAtomic(path.join(charterDir, AVAILABLE_ALCOHOL_FILE_NAME), defaults[AVAILABLE_ALCOHOL_FILE_NAME]);
  syncGuestListForCharter(charterId, defaults["charter.json"].guest_count);
```

with

```js
    if (fileRevisions.CHARTER_FILES.includes(fileName)) {
      value = fileRevisions.stamp(withCharterRecordIds(fileName, value), {}, savedBy, nowIso());
    }
    writeJsonFileAtomic(path.join(charterDir, fileName), value);
  });
  writeJsonFileAtomic(path.join(charterDir, AVAILABLE_ALCOHOL_FILE_NAME), fileRevisions.stamp(defaults[AVAILABLE_ALCOHOL_FILE_NAME], {}, savedBy, nowIso()));
  syncGuestListForCharter(charterId, defaults["charter.json"].guest_count, savedBy);
```

**8. the generic charter save: revision first, then the checks, then a stamped write** — in `server.js`, replace

```js
function saveAdminJsonFile(adminContext, charterId, fileName, data) {
  const safeId = validateAdminCharterId(charterId);
  if (!safeId || !hasCharterDirectory(safeId)) {
    throw new Error("Unknown charter");
  }
  if (!ADMIN_WRITE_FILES.has(fileName)) {
    throw new Error("File is not editable");
  }
  const filePath = path.join(CHARTERS_DIR, safeId, fileName);
  if (!isPathInside(CHARTERS_DIR, filePath)) {
    throw new Error("Invalid file path");
  }
  let nextData = data;
  if (fileName === "charter.json") {
    nextData = normalizeAdminCharterData(data);
    const stored = toPlainObject(readCharterJson(safeId, "charter.json", {}));
    if (nextData.start_date !== stored.start_date || nextData.end_date !== stored.end_date) {
      assertNoCharterOverlap(safeId, nextData);
    }
  } else if (fileName === "guest_list.json") {
    const charterInfo = normalizeAdminCharterData(readCharterJson(safeId, "charter.json", {}));
    nextData = adminContext && adminContext.department === "hotel"
      ? validateHotelGuestListUpdate(safeId, data)
      : normalizeGuestListForCount(data, charterInfo.guest_count);
  } else if (fileName === GUEST_DRINKS_FILE_NAME) {
    nextData = normalizeGuestDrinksPresentation(data);
  }
  writeJsonFileAtomic(filePath, nextData);
  if (fileName === "charter.json") {
    syncGuestListForCharter(safeId, nextData.guest_count);
  }
  return readCharterJson(safeId, fileName, {});
}
```

with

```js
function saveAdminJsonFile(adminContext, charterId, fileName, data, baseRevision) {
  const safeId = validateAdminCharterId(charterId);
  if (!safeId || !hasCharterDirectory(safeId)) {
    throw new Error("Unknown charter");
  }
  if (!ADMIN_WRITE_FILES.has(fileName)) {
    throw new Error("File is not editable");
  }
  const filePath = path.join(CHARTERS_DIR, safeId, fileName);
  if (!isPathInside(CHARTERS_DIR, filePath)) {
    throw new Error("Invalid file path");
  }
  const savedBy = adminContext && adminContext.department ? adminContext.department : "system";
  const stored = readCharterJson(safeId, fileName, defaultCharterData(safeId)[fileName]);
  // Spec C: the revision first, so a stale tab never sees a validation message about data it has not seen.
  fileRevisions.assertBase(adminCharterFileView(safeId, fileName, stored), baseRevision);
  let nextData = data;
  if (fileName === "charter.json") {
    nextData = normalizeAdminCharterData(data);
    const storedInfo = toPlainObject(stored);
    if (nextData.start_date !== storedInfo.start_date || nextData.end_date !== storedInfo.end_date) {
      assertNoCharterOverlap(safeId, nextData);
    }
  } else if (fileName === "guest_list.json") {
    const charterInfo = normalizeAdminCharterData(readCharterJson(safeId, "charter.json", {}));
    nextData = adminContext && adminContext.department === "hotel"
      ? validateHotelGuestListUpdate(safeId, data)
      : normalizeGuestListForCount(data, charterInfo.guest_count);
  } else if (fileName === GUEST_DRINKS_FILE_NAME) {
    nextData = normalizeGuestDrinksPresentation(data);
  } else {
    nextData = withCharterRecordIds(fileName, data);
  }
  writeJsonFileAtomic(filePath, fileRevisions.stamp(nextData, stored, savedBy, nowIso()));
  if (fileName === "charter.json") {
    syncGuestListForCharter(safeId, nextData.guest_count, savedBy);
  }
  return adminCharterFileView(safeId, fileName, readCharterJson(safeId, fileName, {}));
}
```

**9. charter create: saved by Charter Admin** — in `server.js`, replace

```js
      sendJson(response, 201, createAdminCharter(body));
```

with

```js
      sendJson(response, 201, createAdminCharter(body, "charter"));
```

**10. the charter save passes base_revision** — in `server.js`, replace

```js
          data: saveAdminJsonFile(adminContext, charterId, fileName, body.data)
```

with

```js
          data: saveAdminJsonFile(adminContext, charterId, fileName, body.data, body.base_revision)
```

- [ ] **Step 2: Check.** `node --check server.js` (no output) and `node --test` → `ℹ pass 206`, `ℹ fail 0`.

- [ ] **Step 3: Commit.**

```bash
git add server.js
git commit -m "feat(server): revision-checked charter file saves, record ids, migration v7 (spec C)"
```

---

### Task 4: `server.js`, the library files, purchases and the revisions endpoint

**Files:** modify `server.js`

- [ ] **Step 1: Apply the replacements.**

**11. drink stocks: read with the stamp, save with a base_revision** — in `server.js`, replace

```js
function readDrinkStocks() {
  return normalizeDrinkStocks(readJsonFileSafe(getDrinkStocksFilePath(), { items: [] }));
}

function saveDrinkStocks(data) {
  const existing = readDrinkStocks();
  const normalized = normalizeDrinkStocks(preserveOpenedDrinkStockRecords(data, existing));
  writeJsonFileAtomic(getDrinkStocksFilePath(), normalized);
  return normalized;
}
```

with

```js
function readDrinkStocks() {
  const raw = readJsonFileSafe(getDrinkStocksFilePath(), { items: [] });
  return fileRevisions.withStampOf(normalizeDrinkStocks(raw), raw);
}

// Spec C: body {items, base_revision}; 409 with the stored copy on a stale revision.
function saveDrinkStocks(data, savedBy) {
  const source = toPlainObject(data);
  const existing = readDrinkStocks();
  fileRevisions.assertBase(existing, source.base_revision);
  const normalized = normalizeDrinkStocks(preserveOpenedDrinkStockRecords(source, existing));
  const saved = fileRevisions.stamp(normalized, existing, savedBy, nowIso());
  writeJsonFileAtomic(getDrinkStocksFilePath(), saved);
  return saved;
}
```

**12. a purchase or reverse is a stamped save of drink stocks** — in `server.js`, replace

```js
function updateDrinkStocksDirect(items) {
  const normalized = normalizeDrinkStocks({ items: Array.isArray(items) ? items : [] });
  writeJsonFileAtomic(getDrinkStocksFilePath(), normalized);
  return normalized;
}

function createCharterAlcoholPurchase(charterId, payload) {
```

with

```js
// Spec C §2.3: a purchase or reverse bumps the revision, so a Drink Stocks page loaded before it cannot undo it.
function updateDrinkStocksDirect(items, savedBy) {
  const stored = readJsonFileSafe(getDrinkStocksFilePath(), { items: [] });
  const normalized = normalizeDrinkStocks({ items: Array.isArray(items) ? items : [] });
  const saved = fileRevisions.stamp(normalized, stored, savedBy, nowIso());
  writeJsonFileAtomic(getDrinkStocksFilePath(), saved);
  return saved;
}

function createCharterAlcoholPurchase(charterId, payload, savedBy) {
```

**13. purchase passes who saved** — in `server.js`, replace

```js
        ...(Object.prototype.hasOwnProperty.call(stock, "purchased") ? { purchased: true } : {})
      };
    })
  );
```

with

```js
        ...(Object.prototype.hasOwnProperty.call(stock, "purchased") ? { purchased: true } : {})
      };
    }),
    savedBy
  );
```

**14. reverse takes who saved** — in `server.js`, replace

```js
function reverseCharterAlcoholPurchase(charterId, purchaseId) {
```

with

```js
function reverseCharterAlcoholPurchase(charterId, purchaseId, savedBy) {
```

**15. reverse passes who saved** — in `server.js`, replace

```js
          ...(Object.prototype.hasOwnProperty.call(item, "purchased") ? { purchased: false } : {})
        }
      : item)
  );
```

with

```js
          ...(Object.prototype.hasOwnProperty.call(item, "purchased") ? { purchased: false } : {})
        }
      : item),
    savedBy
  );
```

**16. available alcohol: read with the stamp, save with a base_revision** — in `server.js`, replace

```js
function readAvailableAlcoholAdmin(charterId, drinkStocks = null) {
  const normalized = normalizeAvailableAlcohol(readJsonFileSafe(getAvailableAlcoholFilePath(charterId), { items: [] }));
  return {
    show_prices_to_guests: normalized.show_prices_to_guests,
    items: hydrateAvailableAlcoholItems(
      normalized,
      drinkStocks || readDrinkStocks()
    )
  };
}

function saveAvailableAlcohol(charterId, data) {
  const normalized = normalizeAvailableAlcohol(data);
  writeJsonFileAtomic(getAvailableAlcoholFilePath(charterId), normalized);
  return normalized;
}
```

with

```js
function readAvailableAlcoholAdmin(charterId, drinkStocks = null) {
  const raw = readJsonFileSafe(getAvailableAlcoholFilePath(charterId), { items: [] });
  const normalized = normalizeAvailableAlcohol(raw);
  return fileRevisions.withStampOf({
    show_prices_to_guests: normalized.show_prices_to_guests,
    items: hydrateAvailableAlcoholItems(
      normalized,
      drinkStocks || readDrinkStocks()
    )
  }, raw);
}

// Spec C: body {show_prices_to_guests, items, base_revision}; answers with the copy the GET returns (hydrated).
function saveAvailableAlcohol(charterId, data, savedBy) {
  const source = toPlainObject(data);
  fileRevisions.assertBase(readAvailableAlcoholAdmin(charterId), source.base_revision);
  const filePath = getAvailableAlcoholFilePath(charterId);
  const stored = readJsonFileSafe(filePath, { items: [] });
  writeJsonFileAtomic(filePath, fileRevisions.stamp(normalizeAvailableAlcohol(source), stored, savedBy, nowIso()));
  return readAvailableAlcoholAdmin(charterId);
}
```

**17. cocktails keep their ids** — in `server.js`, replace

```js
  return {
    name: typeof source.name === "string" ? source.name.trim() : "",
    description,
    ingredients: legacyIngredients.map(normalizeCocktailIngredient).filter(Boolean)
  };
}
```

with

```js
  return {
    ...(typeof source.id === "string" && source.id.trim() ? { id: source.id.trim() } : {}),
    name: typeof source.name === "string" ? source.name.trim() : "",
    description,
    ingredients: legacyIngredients.map(normalizeCocktailIngredient).filter(Boolean)
  };
}
```

**18. cocktails: read with the stamp, save with a base_revision** — in `server.js`, replace

```js
function readCocktails() {
  const filePath = getCocktailsFilePath();
  const normalized = normalizeCocktails(readJsonFileSafe(filePath, { cocktails: [] }));
  if (!fs.existsSync(filePath)) {
    writeJsonFileAtomic(filePath, normalized);
  }
  return normalized;
}

function saveCocktails(data) {
  const normalized = normalizeCocktails(data);
  writeJsonFileAtomic(getCocktailsFilePath(), normalized);
  return normalized;
}
```

with

```js
function readCocktails() {
  const filePath = getCocktailsFilePath();
  const raw = readJsonFileSafe(filePath, { cocktails: [] });
  const normalized = normalizeCocktails(raw);
  if (!fs.existsSync(filePath)) {
    const created = fileRevisions.initialStamp(normalized, nowIso());
    writeJsonFileAtomic(filePath, created);
    return created;
  }
  return fileRevisions.withStampOf(normalized, raw);
}

// Spec C: body {cocktails, base_revision}; a cocktail without an id gets one.
function saveCocktails(data, savedBy) {
  const stored = readCocktails();
  fileRevisions.assertBase(stored, toPlainObject(data).base_revision);
  const normalized = normalizeCocktails(data);
  const withIds = { ...normalized, cocktails: recordIds.ensureRecordIds(normalized.cocktails, "k") };
  const saved = fileRevisions.stamp(withIds, stored, savedBy, nowIso());
  writeJsonFileAtomic(getCocktailsFilePath(), saved);
  return saved;
}
```

**19. the public payload: cocktails without the stamp** — in `server.js`, replace

```js
    cocktails: readCocktails()
```

with

```js
    cocktails: fileRevisions.stripStamp(readCocktails())
```

**20. the public payload: menus and sites without the stamp** — in `server.js`, replace

```js
    menus,
    guest_drinks: guestDrinks,
    hotel_drinks: hotelDrinks,
    notices,
    sites,
```

with

```js
    menus: fileRevisions.stripStamp(menus),
    guest_drinks: guestDrinks,
    hotel_drinks: hotelDrinks,
    notices,
    sites: fileRevisions.stripStamp(sites),
```

**21. the revisions endpoint, before the sites GET; sites GET carries the stamp** — in `server.js`, replace

```js
    if (pathname === "/api/admin/sites" && method === "GET") {
      if (!requireAdmin(request, response, url, { section: "charter", bridgeOnly: true, department: "charter" })) {
        return;
      }
      sendJson(response, 200, readJsonFileSafe(path.join(LIBRARY_DIR, "sites.json"), { sites: [] }));
      return;
    }
```

with

```js
    // Spec C §2.2: the stamps of the nine protected files, no data, for the admin's freshness check.
    if (pathname === "/api/admin/revisions" && method === "GET") {
      if (!requireAdmin(request, response, url, { refreshActivity: false })) {
        return;
      }
      const stampsIn = (dir, fileNames) => Object.fromEntries(fileNames.map(fileName => [
        fileName,
        fileRevisions.stampOf(readJsonFileSafe(path.join(dir, fileName), {}))
      ]));
      const library = stampsIn(LIBRARY_DIR, fileRevisions.LIBRARY_FILES);
      const charterParam = url.searchParams.get("charter") || "";
      if (!charterParam) {
        sendJson(response, 200, { library });
        return;
      }
      const charterId = validateAdminCharterId(charterParam);
      if (!charterId || !hasCharterDirectory(charterId)) {
        sendAdminError(response, 404, "Unknown charter");
        return;
      }
      sendJson(response, 200, { charter: stampsIn(path.join(CHARTERS_DIR, charterId), fileRevisions.CHARTER_FILES), library });
      return;
    }

    if (pathname === "/api/admin/sites" && method === "GET") {
      if (!requireAdmin(request, response, url, { section: "charter", bridgeOnly: true, department: "charter" })) {
        return;
      }
      const sites = readJsonFileSafe(path.join(LIBRARY_DIR, "sites.json"), { sites: [] });
      sendJson(response, 200, fileRevisions.withStampOf(sites, sites));
      return;
    }
```

**22. drink stocks save: who saved** — in `server.js`, replace

```js
    if (pathname === "/api/admin/drink-stocks/save" && method === "POST") {
      if (!requireDrinkStocksAdmin(request, response, url)) {
        return;
      }
      const body = await readJsonRequestBody(request);
      sendJson(response, 200, saveDrinkStocks(body));
      return;
    }
```

with

```js
    if (pathname === "/api/admin/drink-stocks/save" && method === "POST") {
      const adminContext = requireDrinkStocksAdmin(request, response, url);
      if (!adminContext) {
        return;
      }
      const body = await readJsonRequestBody(request);
      sendJson(response, 200, saveDrinkStocks(body, adminContext.department));
      return;
    }
```

**23. cocktails save: who saved** — in `server.js`, replace

```js
    if (pathname === "/api/admin/cocktails/save" && method === "POST") {
      if (!requireDrinkStocksAdmin(request, response, url)) {
        return;
      }
      const body = await readJsonRequestBody(request);
      sendJson(response, 200, saveCocktails(body));
      return;
    }
```

with

```js
    if (pathname === "/api/admin/cocktails/save" && method === "POST") {
      const adminContext = requireDrinkStocksAdmin(request, response, url);
      if (!adminContext) {
        return;
      }
      const body = await readJsonRequestBody(request);
      sendJson(response, 200, saveCocktails(body, adminContext.department));
      return;
    }
```

**24. sites save: revision first, stamped write** — in `server.js`, replace

```js
      const body = validateAdminSitesPayload(await readJsonRequestBody(request));
      writeJsonFileAtomic(path.join(LIBRARY_DIR, "sites.json"), body);
      sendJson(response, 200, body);
      return;
```

with

```js
      // Spec C: body {sites, base_revision}.
      const payload = { ...toPlainObject(await readJsonRequestBody(request)) };
      const sitesPath = path.join(LIBRARY_DIR, "sites.json");
      const stored = readJsonFileSafe(sitesPath, { sites: [] });
      fileRevisions.assertBase(fileRevisions.withStampOf(stored, stored), payload.base_revision);
      delete payload.base_revision;
      const saved = fileRevisions.stamp(validateAdminSitesPayload(payload), stored, "charter", nowIso());
      writeJsonFileAtomic(sitesPath, saved);
      sendJson(response, 200, saved);
      return;
```

**25. available alcohol: who saved** — in `server.js`, replace

```js
      if (!requireDrinkStocksAdmin(request, response, url)) {
        return;
      }
      if (!isSave && method === "GET") {
```

with

```js
      const adminContext = requireDrinkStocksAdmin(request, response, url);
      if (!adminContext) {
        return;
      }
      if (!isSave && method === "GET") {
```

**26. available alcohol save passes who saved** — in `server.js`, replace

```js
        sendJson(response, 200, saveAvailableAlcohol(charterId, body));
```

with

```js
        sendJson(response, 200, saveAvailableAlcohol(charterId, body, adminContext.department));
```

**27. purchases: who saved** — in `server.js`, replace

```js
      if (!requireDrinkStocksAdmin(request, response, url)) {
        return;
      }
      if (!action && method === "GET") {
        sendJson(response, 200, hydrateCharterAlcoholPurchases(charterId));
        return;
      }
      if (action === "purchase" && method === "POST") {
        const body = await readJsonRequestBody(request);
        sendJson(response, 200, createCharterAlcoholPurchase(charterId, body));
        return;
      }
      if (action === "reverse" && method === "POST") {
        const body = toPlainObject(await readJsonRequestBody(request));
        sendJson(response, 200, reverseCharterAlcoholPurchase(charterId, body.id));
        return;
      }
```

with

```js
      const adminContext = requireDrinkStocksAdmin(request, response, url);
      if (!adminContext) {
        return;
      }
      if (!action && method === "GET") {
        sendJson(response, 200, hydrateCharterAlcoholPurchases(charterId));
        return;
      }
      if (action === "purchase" && method === "POST") {
        const body = await readJsonRequestBody(request);
        sendJson(response, 200, createCharterAlcoholPurchase(charterId, body, adminContext.department));
        return;
      }
      if (action === "reverse" && method === "POST") {
        const body = toPlainObject(await readJsonRequestBody(request));
        sendJson(response, 200, reverseCharterAlcoholPurchase(charterId, body.id, adminContext.department));
        return;
      }
```

- [ ] **Step 2: Check.** `node --check server.js` and `node --test` → `ℹ pass 206`, `ℹ fail 0`. Then
`grep -c "fileRevisions\." server.js` → `29`.

- [ ] **Step 3: Commit.**

```bash
git add server.js
git commit -m "feat(server): revision-checked library saves, stamped purchases, GET /api/admin/revisions (spec C)"
```

---

### Task 5: `scripts/check-revisions.js` (the implementer writes it; this session runs it)

**Files:** create `scripts/check-revisions.js`

- [ ] **Step 1: Create the script.** Create `scripts/check-revisions.js`:

```js
#!/usr/bin/env node
"use strict";
// Manual verification of spec C (conflict-safe saves) against a running local server. It SAVES: use a data copy.
// Usage: BASE=http://127.0.0.1:8000 KEY=<admin urlKey> COOKIE="iolanthe_admin_session=<token>" CHARTER=csaba \
//        node scripts/check-revisions.js
// COOKIE is a Charter Admin session on the bridge network (POST /api/admin/login sets it).

const BASE = process.env.BASE || "http://127.0.0.1:8000";
const KEY = process.env.KEY || "";
const COOKIE = process.env.COOKIE || "";
const CHARTER = process.env.CHARTER || "csaba";
let fails = 0;

function check(label, condition, detail = "") {
  console.log(`${condition ? "   ok  " : "   FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!condition) fails += 1;
}

async function call(method, path, body) {
  const url = new URL(path, BASE);
  url.searchParams.set("key", KEY);
  const response = await fetch(url, {
    method,
    headers: { Cookie: COOKIE, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch (error) { json = null; }
  return { status: response.status, json };
}

// Saves the copy unchanged three times: good, stale, no base_revision.
async function roundTrip(label, read, save) {
  console.log(label);
  const before = await read();
  const revision = before.revision;
  check("GET carries an integer revision", Number.isInteger(revision), `revision ${revision}`);
  const good = await save(before, revision);
  const saved = good.json && (good.json.data || good.json);
  check("good save -> 200, revision + 1, saved_by charter", good.status === 200 && saved.revision === revision + 1 && saved.saved_by === "charter",
    `${good.status} r${saved && saved.revision} ${saved && saved.saved_by}`);
  const stale = await save(before, revision);
  check("stale save -> 409 revision with the stored copy", stale.status === 409 && stale.json.code === "revision"
    && stale.json.revision === revision + 1 && stale.json.data && stale.json.data.revision === revision + 1, `${stale.status}`);
  const missing = await save(before, undefined);
  check("no base_revision -> 409", missing.status === 409 && missing.json.code === "revision", `${missing.status}`);
  return revision + 1;
}

async function bundle() {
  const { json } = await call("GET", `/api/admin/charter/${CHARTER}`);
  return json;
}

async function main() {
  const charterFiles = ["charter.json", "crew_list.json", "guest_list.json", "menus.json", "guest_drinks.json"];
  for (const file of charterFiles) {
    await roundTrip(`charter file ${file}`, async () => (await bundle())[file],
      (data, base) => call("POST", `/api/admin/charter/${CHARTER}/save`, { file, data, base_revision: base }));
  }

  const crew = (await bundle())["crew_list.json"];
  check("crew members carry ids", crew.crew.every((member) => typeof member.id === "string" && member.id), `${crew.crew.length} members`);
  const guests = (await bundle())["guest_list.json"];
  check("guests carry ids", guests.guests.every((guest) => typeof guest.id === "string" && guest.id), `${guests.guests.length} guests`);

  await roundTrip("available alcohol", async () => (await call("GET", `/api/admin/charter/${CHARTER}/available-alcohol`)).json,
    (data, base) => call("POST", `/api/admin/charter/${CHARTER}/available-alcohol/save`, { ...data, base_revision: base }));
  await roundTrip("drink stocks", async () => (await call("GET", "/api/admin/drink-stocks")).json,
    (data, base) => call("POST", "/api/admin/drink-stocks/save", { items: data.items, base_revision: base }));
  await roundTrip("cocktails", async () => (await call("GET", "/api/admin/cocktails")).json,
    (data, base) => call("POST", "/api/admin/cocktails/save", { cocktails: data.cocktails, base_revision: base }));
  const cocktails = (await call("GET", "/api/admin/cocktails")).json;
  check("cocktails carry ids", cocktails.cocktails.every((cocktail) => typeof cocktail.id === "string" && cocktail.id));
  await roundTrip("sites", async () => (await call("GET", "/api/admin/sites")).json,
    (data, base) => call("POST", "/api/admin/sites/save", { sites: data.sites, base_revision: base }));

  console.log("a guest-count change bumps guest_list.json");
  const start = await bundle();
  const info = start["charter.json"];
  const guestRevision = start["guest_list.json"].revision;
  const up = await call("POST", `/api/admin/charter/${CHARTER}/save`, { file: "charter.json", data: { ...info, guest_count: info.guest_count + 1 }, base_revision: info.revision });
  const afterUp = await bundle();
  check("guest list revision bumped, saved by charter", up.status === 200 && afterUp["guest_list.json"].revision === guestRevision + 1
    && afterUp["guest_list.json"].saved_by === "charter", `r${afterUp["guest_list.json"].revision}`);
  await call("POST", `/api/admin/charter/${CHARTER}/save`, { file: "charter.json", data: info, base_revision: afterUp["charter.json"].revision });

  console.log("revisions endpoint");
  const now = await bundle();
  const revisions = await call("GET", `/api/admin/revisions?charter=${CHARTER}`);
  check("charter stamps match the bundle", revisions.status === 200 && charterFiles.every((file) => revisions.json.charter[file].revision === now[file].revision));
  check("library stamps present", ["drink-stocks.json", "cocktails.json", "sites.json"].every((file) => Number.isInteger(revisions.json.library[file].revision)));
  const libraryOnly = await call("GET", "/api/admin/revisions");
  check("no charter= -> library only", libraryOnly.status === 200 && !libraryOnly.json.charter && libraryOnly.json.library);
  const unknown = await call("GET", "/api/admin/revisions?charter=no-such-charter");
  check("unknown charter -> 404", unknown.status === 404, `${unknown.status}`);

  console.log("a purchase and its reverse bump drink-stocks.json");
  const available = (await call("GET", `/api/admin/charter/${CHARTER}/available-alcohol`)).json;
  const item = available.items.find((entry) => entry.stock_id);
  if (!item) {
    console.log("   skip  (no Available Alcohol item on this charter)");
  } else {
    const stockRevision = (await call("GET", "/api/admin/drink-stocks")).json.revision;
    const bought = await call("POST", `/api/admin/charter/${CHARTER}/alcohol-purchases/purchase`, { available_alcohol_id: item.stock_id, stock_item_id: item.stock_id, name: item.name || "" });
    const afterBuy = (await call("GET", "/api/admin/drink-stocks")).json;
    check("purchase -> revision + 1", bought.status === 200 && afterBuy.revision === stockRevision + 1, `${bought.status} r${afterBuy.revision}`);
    const purchaseId = bought.json && bought.json.purchase ? bought.json.purchase.id : "";
    const reversed = await call("POST", `/api/admin/charter/${CHARTER}/alcohol-purchases/reverse`, { id: purchaseId });
    const afterReverse = (await call("GET", "/api/admin/drink-stocks")).json;
    check("reverse -> revision + 1", reversed.status === 200 && afterReverse.revision === stockRevision + 2, `${reversed.status} r${afterReverse.revision}`);
  }

  console.log("public payload carries no stamp");
  const publicPayload = (await call("GET", `/api/charter?charter=${CHARTER}`)).json;
  check("menus, sites and cocktails unstamped", publicPayload && publicPayload.menus.revision === undefined
    && publicPayload.sites.revision === undefined && publicPayload.hotel_drinks.cocktails.revision === undefined);

  console.log(fails ? `${fails} check(s) FAILED` : "all checks passed");
  process.exit(fails ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Check.** `node --check scripts/check-revisions.js`.

- [ ] **Step 3: Commit.**

```bash
git add scripts/check-revisions.js
git commit -m "test(server): scripts/check-revisions.js, the spec C endpoint checklist"
```

- [ ] **Step 4 (this session): run it against a scratch server.** Copy `data-scratch` to the scratchpad, add
`"127.0.0.1/32"` to the copy's `admin.bridgeCidrs` (a loopback request has no `X-Real-IP` and is otherwise
`unknown`), seed an Available Alcohol item on `csaba` (two in-stock `stock_id`s), start the worktree's server on its own
port with `DATA_DIR` = the copy and `BACKUP_DIR` in the scratchpad, log in from a Node script and run the checklist.
Expected: the migration log line `Record ids v7: … file(s) gained record ids or a revision.` and `all checks passed`.

---

### Task 6: `CLAUDE.md` (Haiku)

**Files:** modify `CLAUDE.md`

- [ ] **Step 1: Apply the replacements.**

**1. key files: the two new modules** — in `CLAUDE.md`, replace

```markdown
| `lib/timezone.js` | Ship's time: applied first thing in `server.js`, so every server-side "today" is local to the vessel |
```

with

```markdown
| `lib/timezone.js` | Ship's time: applied first thing in `server.js`, so every server-side "today" is local to the vessel |
| `lib/file-revisions.js` | Conflict-safe saves (spec C): the `{revision, saved_by, saved_at}` stamp, the 409 on a stale `base_revision` |
| `lib/record-ids.js` | Stable record ids (crew, guests, menus, cocktails), `g-slot-<n>` guest ids, migration v7 |
```

**2. data layout: the stamp** — in `CLAUDE.md`, replace

```markdown
      charter.json
      itinerary.json             v2 (stops, activities, route); written only via the itinerary endpoints
```

with

```markdown
      charter.json               charter.json, menus.json, guest_drinks.json, available-alcohol.json, crew_list.json and
                                 guest_list.json carry {revision, saved_by, saved_at} at the top level (spec C)
      itinerary.json             v2 (stops, activities, route); written only via the itinerary endpoints
```

**3. endpoints: conflict-safe saves** — in `CLAUDE.md`, replace

```markdown
## Data migrations
```

with

```markdown
Conflict-safe saves (charter rework spec C; rules in `lib/file-revisions.js`):

- Nine files carry `{revision, saved_by, saved_at}` at their top level: the six charter files above and the library's
  `drink-stocks.json`, `cocktails.json`, `sites.json`. Only the server sets the stamp (`saved_by` = the department, or
  `system`); a request's own stamp fields are ignored.
- Every save of them takes `base_revision`: `POST /api/admin/charter/<id>/save {file, data, base_revision}`,
  `POST /api/admin/charter/<id>/available-alcohol/save {show_prices_to_guests, items, base_revision}`,
  `POST /api/admin/drink-stocks/save {items, base_revision}`, `POST /api/admin/cocktails/save {cocktails, base_revision}`,
  `POST /api/admin/sites/save {sites, base_revision}`. A stale or missing one gets 409 `{error, code:"revision",
  revision, saved_by, saved_at, data}` where `data` is the stored copy exactly as the GET returns it; the revision is
  checked before any validation. A good save answers with the saved copy, `revision + 1`.
- The GETs carry the stamp (the charter bundle inside each file's object). Bar purchases and reverses, the guest-count
  sync after a `charter.json` save and charter create also bump revisions, so a stale page cannot undo them.
- `GET /api/admin/revisions[?charter=<id>]` -> `{charter: {file: stamp}, library: {file: stamp}}`, no data, for the
  admin's freshness check (404 for an unknown charter).
- Records carry ids (`lib/record-ids.js`): crew `c-…`, guests `g-…`, menus `m-…`, cocktails `k-…`; a guest the server
  meets without one while reading gets `g-slot-<position>` (stable from read to read). `/api/charter` strips the stamp.
- `scripts/check-revisions.js` is the manual checklist (it saves; run it against a data copy; usage in its header).

## Data migrations
```

**4. migrations: v7** — in `CLAUDE.md`, replace

```markdown
## Tests
```

with

```markdown
v7 `record-ids` (spec C): crew members, guests (reusing `guest_id`), day menus and cocktails get ids, and the nine
protected files without a revision get `revision: 0` (`lib/record-ids.js migrateRecordIds`). Like v6, it also runs on a
fresh install (the template schema stays at 5).

## Tests
```

**5. tests: count** — in `CLAUDE.md`, replace

```markdown
Unit tests use Node's built-in runner (no npm packages): `npm test` (same as `node --test`, 194 tests). They cover `lib/`
```

with

```markdown
Unit tests use Node's built-in runner (no npm packages): `npm test` (same as `node --test`, 206 tests). They cover `lib/`
```

- [ ] **Step 2: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs(server): conflict-safe saves, record ids, migration v7 (spec C)"
```

---

## Release (this session, after the admin plans are ready; spec C §6)

1. Rehearse v7 on docker-vm against a copy of the live data (`git archive | ssh docker-vm tar -x` into
   `/root/c-rehearsal`, a data copy beside it, run the server once on another port with `DATA_DIR` = the copy, check the
   log line and a few files, delete the folder).
2. On the VM: `git -C /opt/projects/vessel/iolanthe-server log -1` must equal `origin/main` before the merge (release
   only this change). Merge the PR, then `cd /opt/projects/vessel && ./update.sh`.
3. Check `curl http://10.33.2.241/api/schema` → `live_version` 6, and that a save with no `base_revision` gets 409.
4. Merge the admin PR straight after (the live admin before it sends no `base_revision`: its saves fail with the reload
   message until the new admin is pulled).
