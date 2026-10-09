# Vessel tab V1: server (vessel record, routes, migration v7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `iolanthe-server` the vessel record of spec V (`docs/vessel/spec-v-vessel-tab.md` in iolanthe-admin): cabins in `library/vessel.json`, `GET /api/admin/vessel` and `POST /api/admin/vessel/save`, guests stored by `cabin_id`, `charter.json.cabins_on_request`, and migration v7 that converts the boat's data.

**Architecture:** Pure logic in two new Node-tested modules: `lib/file-revisions.js` (spec C §2.1, the revision stamp; added here because spec C hasn't landed) and `lib/vessel.js` (normalize, validate, ids, delete guard, legacy names, the migration transform). `server.js` only reads and writes files and wires routes. The old selections `cabins` list passes through `normalizeSelections` until migration v7 turns it into cabins, because `ensureSelectionsFile()` runs before the migrations and would otherwise erase it.

**Tech Stack:** Node.js (no dependencies), `node:test`, plain JSON files under `DATA_DIR`.

**Repo and worktree:** `iolanthe/iolanthe-server`. Work in `S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/vessel/iolanthe-server` on branch `feat/vessel-v1` from `origin/main` (never checkout, switch, stash or `add -A` in the main checkout; stage files by name).

```bash
git -C "S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server" fetch origin
git -C "S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server" worktree add -b feat/vessel-v1 "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/vessel/iolanthe-server" origin/main
```

All commands below run from that worktree.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `lib/file-revisions.js` | create (skip Task 1 if it already exists on `origin/main`) | spec C §2.1: `readRevision`, `checkBase`, `stamp`, `stripStamp` |
| `test/file-revisions.test.js` | create | its tests |
| `lib/vessel.js` | create | spec V §3.1: the vessel record's rules and the migration transform |
| `test/vessel.test.js` | create | its tests |
| `server.js` | modify | selections pass-through, vessel read/save, routes, guest `cabin_id`, charter `cabins_on_request`, guest payload, migration v7 |
| `data-templates/library/vessel.json` | modify | the seven Princess Iolanthe cabins |
| `data-templates/library/selections.json` | modify | no `cabins` |
| `data-templates/charters/larry/guest_list.json` | modify | `cabin_id` instead of `cabin` |
| `CLAUDE.md` | modify | data layout, migration v7, the vessel routes, test count |

Migration number: this plan uses **7**. If spec C's record-ids migration has landed as 7 first, use the next free number everywhere this plan says 7 (`DATA_MIGRATIONS`, the function name, CLAUDE.md, commit messages).

---

### Task 1: The revision stamp module (spec C §2.1)

Skip this task if `git cat-file -e origin/main:lib/file-revisions.js` succeeds: spec C has landed it; use it as is.

**Files:**
- Create: `lib/file-revisions.js`
- Test: `test/file-revisions.test.js`

- [ ] **Step 1: Write the failing test**

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const revisions = require("../lib/file-revisions");

test("readRevision is the integer revision, or 0 when missing or not a positive integer", () => {
  assert.equal(revisions.readRevision({ revision: 4 }), 4);
  assert.equal(revisions.readRevision({}), 0);
  assert.equal(revisions.readRevision({ revision: "4" }), 0);
  assert.equal(revisions.readRevision({ revision: 2.5 }), 0);
  assert.equal(revisions.readRevision(null), 0);
});

test("checkBase passes a matching integer base revision", () => {
  assert.equal(revisions.checkBase({ revision: 3 }, 3), null);
  assert.equal(revisions.checkBase({}, 0), null);
});

test("checkBase refuses a stale, missing or non-integer base revision with a 409", () => {
  const stored = { revision: 3, saved_by: "bridge / charter", saved_at: "2026-10-10T08:00:00.000Z", x: 1 };
  for (const base of [2, undefined, "3", null]) {
    const clash = revisions.checkBase(stored, base);
    assert.equal(clash.status, 409);
    assert.equal(clash.code, "revision");
    assert.equal(clash.revision, 3);
    assert.equal(clash.saved_by, "bridge / charter");
    assert.equal(clash.saved_at, "2026-10-10T08:00:00.000Z");
    assert.deepEqual(clash.data, stored);
    assert.match(clash.error, /revision 3/);
  }
});

test("stamp sets the next revision and who saved, without touching its inputs", () => {
  const data = { a: 1, revision: 99, saved_by: "client", saved_at: "client" };
  const stored = { revision: 2 };
  const stamped = revisions.stamp(data, stored, "bridge / charter", "2026-10-10T08:00:00.000Z");
  assert.deepEqual(stamped, { a: 1, revision: 3, saved_by: "bridge / charter", saved_at: "2026-10-10T08:00:00.000Z" });
  assert.deepEqual(data, { a: 1, revision: 99, saved_by: "client", saved_at: "client" });
  assert.deepEqual(stored, { revision: 2 });
});

test("stripStamp copies without the stamp fields", () => {
  const data = { a: 1, revision: 3, saved_by: "x", saved_at: "y" };
  assert.deepEqual(revisions.stripStamp(data), { a: 1 });
  assert.equal(data.revision, 3);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/file-revisions.test.js`
Expected: FAIL with `Cannot find module '../lib/file-revisions'`.

- [ ] **Step 3: Write the module**

```js
"use strict";

// Spec C §2.1 (iolanthe-admin docs/charter-rework/spec-c.md): a whole-file revision guards a save. The three stamp
// fields sit at the top level of the file; only the server sets them. Pure functions.

const STAMP_FIELDS = ["revision", "saved_by", "saved_at"];

function readRevision(data) {
  const revision = data && typeof data === "object" ? data.revision : undefined;
  return Number.isInteger(revision) && revision > 0 ? revision : 0;
}

// null when baseRevision matches; otherwise the 409 payload. A missing or non-integer base is refused too (SC-D4).
function checkBase(stored, baseRevision) {
  const revision = readRevision(stored);
  if (Number.isInteger(baseRevision) && baseRevision === revision) {
    return null;
  }
  const source = stored && typeof stored === "object" ? stored : {};
  return {
    status: 409,
    error: `Someone else saved this (revision ${revision}). Reload to see their changes.`,
    code: "revision",
    revision,
    data: stored,
    saved_by: typeof source.saved_by === "string" ? source.saved_by : "",
    saved_at: typeof source.saved_at === "string" ? source.saved_at : ""
  };
}

function stripStamp(data) {
  const copy = { ...(data && typeof data === "object" ? data : {}) };
  STAMP_FIELDS.forEach(field => { delete copy[field]; });
  return copy;
}

function stamp(data, stored, savedBy, now) {
  return { ...stripStamp(data), revision: readRevision(stored) + 1, saved_by: savedBy, saved_at: now };
}

module.exports = { readRevision, checkBase, stamp, stripStamp };
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test test/file-revisions.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/file-revisions.js test/file-revisions.test.js
git commit -m "feat(server): revision stamp module (spec C 2.1) for the vessel record"
```

---

### Task 2: `lib/vessel.js`: cabin ids, normalizing and the public profile

**Files:**
- Create: `lib/vessel.js`
- Test: `test/vessel.test.js`

- [ ] **Step 1: Write the failing tests**

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const vessel = require("../lib/vessel");

test("cabinIdFor slugs the name and adds -2, -3 until free", () => {
  assert.equal(vessel.cabinIdFor("Port VIP", []), "port-vip");
  assert.equal(vessel.cabinIdFor("Port VIP", ["port-vip"]), "port-vip-2");
  assert.equal(vessel.cabinIdFor("Port VIP", ["port-vip", "port-vip-2"]), "port-vip-3");
  assert.equal(vessel.cabinIdFor("  ", []), "cabin");
  assert.equal(vessel.cabinIdFor("Saloon (conversion)", []), "saloon-conversion");
});

test("normalizeVessel keeps the profile shape, drops empty rows and unknown keys, keeps the stamp", () => {
  const record = vessel.normalizeVessel({
    description: "Welcome",
    details: [{ label: " Length ", value: " 45.7 m " }, { label: "", value: "" }],
    sections: [{ title: "General Notes", items: [" One ", "", "Two"] }, { title: "", items: [] }],
    cabins: [{ id: "port-vip", name: " Port VIP ", berths: 2, on_request: "yes" }],
    surprise: true,
    revision: 4,
    saved_by: "bridge / charter",
    saved_at: "2026-10-10T08:00:00.000Z"
  });
  assert.deepEqual(record, {
    description: "Welcome",
    details: [{ label: "Length", value: "45.7 m" }],
    sections: [{ title: "General Notes", items: ["One", "Two"] }],
    cabins: [{ id: "port-vip", name: "Port VIP", deck: "", bed_layout: "", berths: 2, extra_berths: 0, on_request: false }],
    revision: 4,
    saved_by: "bridge / charter",
    saved_at: "2026-10-10T08:00:00.000Z"
  });
});

test("normalizeVessel of nothing is an empty record", () => {
  assert.deepEqual(vessel.normalizeVessel(undefined), { description: "", details: [], sections: [], cabins: [] });
});

test("publicVessel is the profile only: no cabins, no stamp", () => {
  const record = vessel.normalizeVessel({
    description: "Welcome", details: [{ label: "Length", value: "45.7 m" }], sections: [],
    cabins: [{ id: "port-vip", name: "Port VIP" }], revision: 2, saved_by: "x", saved_at: "y"
  });
  assert.deepEqual(vessel.publicVessel(record), {
    description: "Welcome", details: [{ label: "Length", value: "45.7 m" }], sections: []
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/vessel.test.js`
Expected: FAIL with `Cannot find module '../lib/vessel'`.

- [ ] **Step 3: Write the module's first part**

```js
"use strict";

// Spec V (iolanthe-admin docs/vessel/spec-v-vessel-tab.md): the vessel record in library/vessel.json, which holds the
// guest-facing profile (description, details, sections) and the cabins. Pure functions; server.js reads and writes.

const LIMITS = Object.freeze({
  description: 4000,
  details: 40,
  detailLabel: 40,
  detailValue: 160,
  sections: 12,
  sectionTitle: 60,
  sectionItems: 40,
  sectionItem: 500,
  cabins: 30,
  cabinId: 48,
  cabinName: 40,
  cabinText: 30,
  berthsMax: 12,
  extraBerthsMax: 4
});
const CABIN_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STAMP_FIELDS = ["revision", "saved_by", "saved_at"];

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// The site id rule: the slug of the name, then -2, -3… until it is free. Ids never change after creation.
function cabinIdFor(name, takenIds) {
  const base = slugify(name).slice(0, LIMITS.cabinId - 4).replace(/-+$/g, "") || "cabin";
  const taken = new Set(Array.isArray(takenIds) ? takenIds : []);
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizeCabin(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    id: text(source.id),
    name: text(source.name),
    deck: text(source.deck),
    bed_layout: text(source.bed_layout),
    berths: Number.isInteger(source.berths) ? source.berths : null,
    extra_berths: Number.isInteger(source.extra_berths) ? source.extra_berths : 0,
    on_request: source.on_request === true
  };
}

// Only the known keys survive (the guest site gets this record), plus the stamp when the file carries one.
function normalizeVessel(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const details = (Array.isArray(source.details) ? source.details : [])
    .map(row => ({ label: text(row && row.label), value: text(row && row.value) }))
    .filter(row => row.label || row.value);
  const sections = (Array.isArray(source.sections) ? source.sections : [])
    .map(section => ({
      title: text(section && section.title),
      items: (Array.isArray(section && section.items) ? section.items : []).map(text).filter(Boolean)
    }))
    .filter(section => section.title || section.items.length);
  const record = {
    description: typeof source.description === "string" ? source.description : "",
    details,
    sections,
    cabins: (Array.isArray(source.cabins) ? source.cabins : []).map(normalizeCabin)
  };
  STAMP_FIELDS.filter(field => source[field] !== undefined).forEach(field => { record[field] = source[field]; });
  return record;
}

function publicVessel(record) {
  const { description, details, sections } = normalizeVessel(record);
  return { description, details, sections };
}

module.exports = { LIMITS, cabinIdFor, normalizeVessel, publicVessel };
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test test/vessel.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/vessel.js test/vessel.test.js
git commit -m "feat(server): vessel record module, cabin ids and the public profile"
```

---

### Task 3: `lib/vessel.js`: validation

**Files:**
- Modify: `lib/vessel.js`
- Test: `test/vessel.test.js`

- [ ] **Step 1: Append the failing tests**

```js
function validRecord() {
  return vessel.normalizeVessel({
    description: "Welcome",
    details: [{ label: "Length", value: "45.7 m" }],
    sections: [{ title: "General Notes", items: ["One"] }],
    cabins: [
      { id: "state-room", name: "State Room", deck: "Main deck", bed_layout: "Double", berths: 2 },
      { id: "saloon", name: "Saloon", berths: null, on_request: true }
    ]
  });
}

function fieldsOf(errors) {
  return errors.map(error => error.field);
}

test("validateVessel passes a good record", () => {
  assert.deepEqual(vessel.validateVessel(validRecord()), []);
});

test("validateVessel checks the profile limits", () => {
  const record = validRecord();
  record.description = "x".repeat(4001);
  record.details = [{ label: "", value: "orphan value" }, { label: "y".repeat(41), value: "z".repeat(161) }];
  record.sections = [{ title: "", items: ["item"] }, { title: "T", items: ["i".repeat(501)] }];
  assert.deepEqual(fieldsOf(vessel.validateVessel(record)), [
    "description",
    "details[0].label",
    "details[1].label",
    "details[1].value",
    "sections[0].title",
    "sections[1].items[0]"
  ]);
});

test("validateVessel checks counts", () => {
  const record = validRecord();
  record.details = Array.from({ length: 41 }, (_, i) => ({ label: `L${i}`, value: "v" }));
  record.sections = Array.from({ length: 13 }, (_, i) => ({ title: `S${i}`, items: [] }));
  record.cabins = Array.from({ length: 31 }, (_, i) => ({ id: `c-${i}`, name: `C${i}`, deck: "", bed_layout: "", berths: null, extra_berths: 0, on_request: false }));
  assert.deepEqual(fieldsOf(vessel.validateVessel(record)), ["details", "sections", "cabins"]);
});

test("validateVessel checks each cabin", () => {
  const record = validRecord();
  record.cabins = [
    { id: "Bad Id", name: "", deck: "d".repeat(31), bed_layout: "", berths: 13, extra_berths: 5, on_request: false },
    { id: "twin", name: "Twin", deck: "", bed_layout: "b".repeat(31), berths: 0, extra_berths: -1, on_request: false },
    { id: "twin", name: "twin", deck: "", bed_layout: "", berths: 2, extra_berths: 0, on_request: false }
  ];
  assert.deepEqual(fieldsOf(vessel.validateVessel(record)), [
    "cabins[0].id",
    "cabins[0].name",
    "cabins[0].deck",
    "cabins[0].berths",
    "cabins[0].extra_berths",
    "cabins[1].bed_layout",
    "cabins[1].berths",
    "cabins[1].extra_berths",
    "cabins[2].id",
    "cabins[2].name"
  ]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/vessel.test.js`
Expected: FAIL with `vessel.validateVessel is not a function`.

- [ ] **Step 3: Add `validateVessel` to `lib/vessel.js`** (above `module.exports`, and export it)

```js
// Spec V §2.1. Returns [{ field, message }], empty when the record can be saved.
function validateVessel(record) {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (record.description.length > LIMITS.description) {
    add("description", `The description can be at most ${LIMITS.description} characters.`);
  }
  if (record.details.length > LIMITS.details) {
    add("details", `There can be at most ${LIMITS.details} specifications.`);
  }
  record.details.forEach((row, i) => {
    if (!row.label || row.label.length > LIMITS.detailLabel) {
      add(`details[${i}].label`, `Each specification needs a label of at most ${LIMITS.detailLabel} characters.`);
    }
    if (row.value.length > LIMITS.detailValue) {
      add(`details[${i}].value`, `A specification value can be at most ${LIMITS.detailValue} characters.`);
    }
  });
  if (record.sections.length > LIMITS.sections) {
    add("sections", `There can be at most ${LIMITS.sections} notes sections.`);
  }
  record.sections.forEach((section, i) => {
    if (!section.title || section.title.length > LIMITS.sectionTitle) {
      add(`sections[${i}].title`, `Each notes section needs a title of at most ${LIMITS.sectionTitle} characters.`);
    }
    if (section.items.length > LIMITS.sectionItems) {
      add(`sections[${i}].items`, `A notes section can have at most ${LIMITS.sectionItems} items.`);
    }
    section.items.forEach((item, j) => {
      if (item.length > LIMITS.sectionItem) {
        add(`sections[${i}].items[${j}]`, `A note can be at most ${LIMITS.sectionItem} characters.`);
      }
    });
  });
  if (record.cabins.length > LIMITS.cabins) {
    add("cabins", `There can be at most ${LIMITS.cabins} cabins.`);
  }
  const seenIds = new Set();
  const seenNames = new Set();
  record.cabins.forEach((cabin, i) => {
    if (!CABIN_ID_PATTERN.test(cabin.id) || cabin.id.length > LIMITS.cabinId || seenIds.has(cabin.id)) {
      add(`cabins[${i}].id`, "Each cabin needs its own id.");
    }
    seenIds.add(cabin.id);
    const nameKey = cabin.name.toLocaleLowerCase();
    if (!cabin.name || cabin.name.length > LIMITS.cabinName || seenNames.has(nameKey)) {
      add(`cabins[${i}].name`, `Each cabin needs its own name of at most ${LIMITS.cabinName} characters.`);
    }
    seenNames.add(nameKey);
    if (cabin.deck.length > LIMITS.cabinText) {
      add(`cabins[${i}].deck`, `The deck can be at most ${LIMITS.cabinText} characters.`);
    }
    if (cabin.bed_layout.length > LIMITS.cabinText) {
      add(`cabins[${i}].bed_layout`, `The bed layout can be at most ${LIMITS.cabinText} characters.`);
    }
    if (cabin.berths !== null && (cabin.berths < 1 || cabin.berths > LIMITS.berthsMax)) {
      add(`cabins[${i}].berths`, `Berths must be from 1 to ${LIMITS.berthsMax}.`);
    }
    if (cabin.extra_berths < 0 || cabin.extra_berths > LIMITS.extraBerthsMax) {
      add(`cabins[${i}].extra_berths`, `Extra berths must be from 0 to ${LIMITS.extraBerthsMax}.`);
    }
  });
  return errors;
}
```

Change the export line to:

```js
module.exports = { LIMITS, cabinIdFor, normalizeVessel, publicVessel, validateVessel };
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test test/vessel.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/vessel.js test/vessel.test.js
git commit -m "feat(server): vessel record validation (spec V 2.1)"
```

---

### Task 4: `lib/vessel.js`: legacy names, on-request ids and the delete guard

**Files:**
- Modify: `lib/vessel.js`
- Test: `test/vessel.test.js`

- [ ] **Step 1: Append the failing tests**

```js
const CABINS = [
  { id: "state-room", name: "State Room", deck: "", bed_layout: "", berths: 2, extra_berths: 0, on_request: false },
  { id: "port-twin", name: "Port Twin", deck: "", bed_layout: "", berths: 2, extra_berths: 1, on_request: false },
  { id: "saloon", name: "Saloon", deck: "", bed_layout: "", berths: 2, extra_berths: 0, on_request: true },
  { id: "bridge-deck-cabin", name: "Bridge Deck Cabin", deck: "", bed_layout: "", berths: 2, extra_berths: 0, on_request: true }
];

test("isNoCabinName is true for empty and N/A", () => {
  assert.equal(vessel.isNoCabinName(""), true);
  assert.equal(vessel.isNoCabinName(" n/a "), true);
  assert.equal(vessel.isNoCabinName(undefined), true);
  assert.equal(vessel.isNoCabinName("Port Twin"), false);
});

test("cabinIdForLegacyName matches a cabin name ignoring case, else gives no cabin", () => {
  assert.equal(vessel.cabinIdForLegacyName("port twin", CABINS), "port-twin");
  assert.equal(vessel.cabinIdForLegacyName("N/A", CABINS), "");
  assert.equal(vessel.cabinIdForLegacyName("Starboard", CABINS), "");
  assert.equal(vessel.cabinIdForLegacyName("Port Twin", []), "");
});

test("normalizeCabinsOnRequest keeps on-request cabin ids once, in the given order", () => {
  assert.deepEqual(
    vessel.normalizeCabinsOnRequest(["saloon", "state-room", "nope", "saloon", " bridge-deck-cabin "], CABINS),
    ["saloon", "bridge-deck-cabin"]
  );
  assert.deepEqual(vessel.normalizeCabinsOnRequest("saloon", CABINS), []);
});

test("removedCabinsInUse lists removed cabins with guests in charters that haven't ended", () => {
  const next = CABINS.filter(cabin => cabin.id !== "port-twin" && cabin.id !== "saloon");
  const charters = [
    { name: "Smith", ended: false, guests: [{ cabin_id: "port-twin" }] },
    { name: "Jones", ended: true, guests: [{ cabin_id: "saloon" }] },
    { name: "Lee", ended: false, guests: [{ cabin_id: "port-twin" }, { cabin_id: "state-room" }] }
  ];
  assert.deepEqual(vessel.removedCabinsInUse(CABINS, next, charters), [
    { id: "port-twin", name: "Port Twin", charters: ["Smith", "Lee"] }
  ]);
  assert.deepEqual(vessel.removedCabinsInUse(CABINS, CABINS, charters), []);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/vessel.test.js`
Expected: FAIL with `vessel.isNoCabinName is not a function`.

- [ ] **Step 3: Add the functions** (above `module.exports`)

```js
// "N/A" was the old "no cabin".
function isNoCabinName(name) {
  const value = text(name).toLocaleLowerCase();
  return !value || value === "n/a";
}

// Spec V §2.2: an old-style cabin name (guest.cabin / cabin_assignment) → that cabin's id, or "" for no cabin.
function cabinIdForLegacyName(name, cabins) {
  if (isNoCabinName(name)) {
    return "";
  }
  const wanted = text(name).toLocaleLowerCase();
  const match = (Array.isArray(cabins) ? cabins : []).find(cabin => text(cabin.name).toLocaleLowerCase() === wanted);
  return match ? match.id : "";
}

// Spec V §2.3: charter.json keeps only ids that name an on-request cabin, without duplicates.
function normalizeCabinsOnRequest(value, cabins) {
  const onRequest = new Set((Array.isArray(cabins) ? cabins : []).filter(cabin => cabin.on_request).map(cabin => cabin.id));
  const ids = Array.isArray(value) ? value.map(text).filter(Boolean) : [];
  return [...new Set(ids)].filter(id => onRequest.has(id));
}

// Spec V SV-D10. charters: [{ name, ended, guests }]; a charter without dates counts as not ended.
function removedCabinsInUse(storedCabins, nextCabins, charters) {
  const nextIds = new Set((Array.isArray(nextCabins) ? nextCabins : []).map(cabin => cabin.id));
  return (Array.isArray(storedCabins) ? storedCabins : [])
    .filter(cabin => !nextIds.has(cabin.id))
    .map(cabin => ({
      id: cabin.id,
      name: cabin.name,
      charters: (Array.isArray(charters) ? charters : [])
        .filter(charter => !charter.ended && (Array.isArray(charter.guests) ? charter.guests : [])
          .some(guest => guest && guest.cabin_id === cabin.id))
        .map(charter => charter.name)
    }))
    .filter(entry => entry.charters.length);
}
```

Change the export line to:

```js
module.exports = {
  LIMITS,
  cabinIdFor,
  normalizeVessel,
  publicVessel,
  validateVessel,
  isNoCabinName,
  cabinIdForLegacyName,
  normalizeCabinsOnRequest,
  removedCabinsInUse
};
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test test/vessel.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/vessel.js test/vessel.test.js
git commit -m "feat(server): legacy cabin names, on-request ids and the cabin delete guard"
```

---

### Task 5: `lib/vessel.js`: the migration transform

**Files:**
- Modify: `lib/vessel.js`
- Test: `test/vessel.test.js`

- [ ] **Step 1: Append the failing tests** (the data is shaped like the boat's on 2026-10-09)

```js
function boatData() {
  return {
    selections: {
      crew_roles: ["Captain"],
      cabins: ["N/A", "State Room", "Starboard VIP", "Starboard", "Port VIP", "Twin", "Port Twin"]
    },
    vessel: { description: "Welcome", details: [], sections: [] },
    guestLists: [
      { charterId: "alpha", data: { guests: [{ full_name: "A", cabin: "Port Twin" }, { full_name: "B", cabin: "N/A" }] } },
      { charterId: "beta", data: { guests: [{ full_name: "C", cabin: "Starboard Twin" }, { full_name: "D", cabin: "State Room" }] } },
      { charterId: "gamma", data: { guests: [{ full_name: "E", cabin_assignment: "port vip" }, { full_name: "F", cabin: "Starboard VIP" }] } }
    ]
  };
}

test("migrateCabins builds cabins from the names guests use, in the list's order, then unlisted names", () => {
  const result = vessel.migrateCabins(boatData());
  assert.deepEqual(result.vessel.cabins.map(cabin => [cabin.id, cabin.name]), [
    ["state-room", "State Room"],
    ["starboard-vip", "Starboard VIP"],
    ["port-vip", "Port VIP"],
    ["port-twin", "Port Twin"],
    ["starboard-twin", "Starboard Twin"]
  ]);
  assert.deepEqual(result.vessel.cabins[0], {
    id: "state-room", name: "State Room", deck: "", bed_layout: "", berths: null, extra_berths: 0, on_request: false
  });
  assert.equal(result.vessel.description, "Welcome");
  assert.equal(result.vesselChanged, true);
});

test("migrateCabins moves guests to cabin_id and drops the old fields", () => {
  const result = vessel.migrateCabins(boatData());
  const guests = result.guestLists.flatMap(list => list.data.guests);
  assert.deepEqual(guests.map(guest => guest.cabin_id), ["port-twin", "", "starboard-twin", "state-room", "port-vip", "starboard-vip"]);
  assert.ok(guests.every(guest => !("cabin" in guest) && !("cabin_assignment" in guest)));
  assert.deepEqual(result.changedCharterIds, ["alpha", "beta", "gamma"]);
});

test("migrateCabins removes cabins from the selections", () => {
  const result = vessel.migrateCabins(boatData());
  assert.deepEqual(result.selections, { crew_roles: ["Captain"] });
  assert.equal(result.selectionsChanged, true);
});

test("migrateCabins leaves its input alone and a second run changes nothing", () => {
  const input = boatData();
  const before = JSON.stringify(input);
  const first = vessel.migrateCabins(input);
  assert.equal(JSON.stringify(input), before);
  const second = vessel.migrateCabins({ selections: first.selections, vessel: first.vessel, guestLists: first.guestLists });
  assert.equal(second.vesselChanged, false);
  assert.equal(second.selectionsChanged, false);
  assert.deepEqual(second.changedCharterIds, []);
  assert.deepEqual(second.vessel.cabins, first.vessel.cabins);
});

test("migrateCabins keeps existing cabins and maps guests against them", () => {
  const input = boatData();
  input.vessel.cabins = [{ id: "pt", name: "Port Twin", berths: 2 }];
  const result = vessel.migrateCabins(input);
  assert.deepEqual(result.vessel.cabins.map(cabin => cabin.id), ["pt"]);
  assert.equal(result.vesselChanged, false);
  assert.equal(result.guestLists[0].data.guests[0].cabin_id, "pt");
  assert.equal(result.guestLists[1].data.guests[0].cabin_id, "");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/vessel.test.js`
Expected: FAIL with `vessel.migrateCabins is not a function`.

- [ ] **Step 3: Add `migrateCabins`** (above `module.exports`, and add `migrateCabins` to the export list)

```js
function legacyCabinName(guest) {
  if (typeof guest.cabin === "string") {
    return guest.cabin;
  }
  return typeof guest.cabin_assignment === "string" ? guest.cabin_assignment : "";
}

// Spec V §3.3, pure. input: { selections, vessel, guestLists: [{ charterId, data }] } (raw file contents).
// Returns new objects and what changed; never mutates the input. A second run changes nothing.
function migrateCabins(input) {
  const selections = input && input.selections && typeof input.selections === "object" ? input.selections : {};
  const rawVessel = input && input.vessel && typeof input.vessel === "object" ? input.vessel : {};
  const guestLists = Array.isArray(input && input.guestLists) ? input.guestLists : [];
  const pendingGuests = guestLists.flatMap(list => {
    const guests = list && list.data && Array.isArray(list.data.guests) ? list.data.guests : [];
    return guests.filter(guest => guest && typeof guest.cabin_id !== "string");
  });

  let cabins = Array.isArray(rawVessel.cabins) ? rawVessel.cabins.map(cabin => normalizeVessel({ cabins: [cabin] }).cabins[0]) : null;
  const vesselChanged = cabins === null;
  if (cabins === null) {
    const used = [];
    pendingGuests.forEach(guest => {
      const name = text(legacyCabinName(guest));
      if (!isNoCabinName(name) && !used.some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        used.push(name);
      }
    });
    const listed = (Array.isArray(selections.cabins) ? selections.cabins : (Array.isArray(selections.cabin_assignments) ? selections.cabin_assignments : []))
      .map(text);
    const listedUsed = listed.filter(name => used.some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase()));
    const unlisted = used.filter(name => !listedUsed.some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase()));
    const names = listedUsed.filter((name, i) => listedUsed.findIndex(other => other.toLocaleLowerCase() === name.toLocaleLowerCase()) === i)
      .concat(unlisted);
    cabins = names.reduce((built, name) => built.concat([{
      id: cabinIdFor(name, built.map(cabin => cabin.id)),
      name,
      deck: "",
      bed_layout: "",
      berths: null,
      extra_berths: 0,
      on_request: false
    }]), []);
  }

  const changedCharterIds = [];
  const nextGuestLists = guestLists.map(list => {
    const data = list && list.data && typeof list.data === "object" ? list.data : {};
    const guests = Array.isArray(data.guests) ? data.guests : [];
    if (!guests.some(guest => guest && typeof guest.cabin_id !== "string")) {
      return { charterId: list.charterId, data };
    }
    changedCharterIds.push(list.charterId);
    return {
      charterId: list.charterId,
      data: {
        ...data,
        guests: guests.map(guest => {
          if (!guest || typeof guest.cabin_id === "string") {
            return guest;
          }
          const { cabin, cabin_assignment: cabinAssignment, ...rest } = guest;
          return { ...rest, cabin_id: cabinIdForLegacyName(legacyCabinName(guest), cabins) };
        })
      }
    };
  });

  const selectionsChanged = "cabins" in selections || "cabin_assignments" in selections;
  const { cabins: oldCabins, cabin_assignments: oldAssignments, ...restSelections } = selections;
  return {
    vessel: { ...rawVessel, cabins },
    vesselChanged,
    guestLists: nextGuestLists,
    changedCharterIds,
    selections: selectionsChanged ? restSelections : selections,
    selectionsChanged
  };
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test test/vessel.test.js`
Expected: PASS, 17 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all pass (194 before this plan, plus 5 from Task 1 and 17 here: 216).

- [ ] **Step 6: Commit**

```bash
git add lib/vessel.js test/vessel.test.js
git commit -m "feat(server): the cabin migration transform (spec V 3.3)"
```

---

### Task 6: `server.js`: selections keep the old cabins list until v7

**Files:**
- Modify: `server.js` (`DEFAULT_SELECTIONS`, `normalizeSelections`)

- [ ] **Step 1: Remove the `cabins` default.** In `DEFAULT_SELECTIONS`, delete the line

```js
  cabins: ["N/A", "State Room", "Starboard VIP", "Starboard", "Port VIP", "Twin", "Port Twin"],
```

- [ ] **Step 2: Replace `normalizeSelections`** with:

```js
function normalizeSelections(value) {
  const source = toPlainObject(value);
  const normalized = Object.fromEntries(Object.entries(DEFAULT_SELECTIONS).map(([key, fallback]) => {
    const values = normalizeStringArray(source[key], fallback);
    const merged = values.concat(fallback.filter(item => !values.some(existing => existing.toLocaleLowerCase() === item.toLocaleLowerCase())));
    return [key, merged];
  }));
  // Spec V: an old cabins list survives (ensureSelectionsFile runs before the migrations) until migration v7 turns it
  // into vessel.json cabins and removes it.
  const legacyCabins = Array.isArray(source.cabins) ? source.cabins : source.cabin_assignments;
  return Array.isArray(legacyCabins) ? { ...normalized, cabins: normalizeStringArray(legacyCabins, []) } : normalized;
}
```

- [ ] **Step 3: Check the server still starts**

Run: `node -e "require('./lib/vessel'); require('./lib/file-revisions'); console.log('ok')"` then `node --check server.js`
Expected: `ok`, and no output from `node --check`.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(server): selections drop the cabins default, keep an old list until v7"
```

---

### Task 7: `server.js`: read and save the vessel record

**Files:**
- Modify: `server.js` (requires at the top; new functions after `readAdminSelections`; two routes after the `/api/admin/selections` GET route)

- [ ] **Step 1: Require the modules.** Next to `const activeCharterLib = require("./lib/active-charter");` add:

```js
const fileRevisions = require("./lib/file-revisions");
const vesselLib = require("./lib/vessel");
```

- [ ] **Step 2: Add the record helpers** right after `function readAdminSelections() { … }`:

```js
// Spec V: the vessel record (the guest-facing profile and the cabins) in library/vessel.json.
function getVesselFilePath() {
  return path.join(LIBRARY_DIR, "vessel.json");
}

function readVesselRecord() {
  const legacyVessel = toPlainObject(readJsonFileSafe(path.join(DATA_DIR, "vessel.json"), {}));
  return vesselLib.normalizeVessel(readJsonFileSafe(getVesselFilePath(), legacyVessel));
}

function readVesselCabins() {
  return readVesselRecord().cabins;
}

function chartersWithGuests() {
  return listCharterSummaries().map(summary => {
    const guestList = toPlainObject(readCharterJson(summary.id, "guest_list.json", { guests: [] }));
    return {
      name: summary.name,
      ended: summary.status === "ended",
      guests: Array.isArray(guestList.guests) ? guestList.guests : []
    };
  });
}

// Spec V §3.2: the revision first (spec C), then the field rules, then the delete guard.
function saveVesselRecord(body, savedBy) {
  const stored = readVesselRecord();
  const clash = fileRevisions.checkBase(stored, body.base_revision);
  if (clash) {
    return { status: 409, payload: clash };
  }
  const next = vesselLib.normalizeVessel(fileRevisions.stripStamp(toPlainObject(body.data)));
  const errors = vesselLib.validateVessel(next);
  if (errors.length) {
    return { status: 400, payload: { error: errors[0].message, field: errors[0].field, errors } };
  }
  const inUse = vesselLib.removedCabinsInUse(stored.cabins, next.cabins, chartersWithGuests());
  if (inUse.length) {
    const first = inUse[0];
    return {
      status: 409,
      payload: {
        code: "cabin-in-use",
        error: `${first.name} has guests in ${first.charters.join(", ")}. Move them to another cabin first.`,
        cabins: inUse
      }
    };
  }
  const saved = fileRevisions.stamp(next, stored, savedBy, nowIso());
  writeJsonFileAtomic(getVesselFilePath(), saved);
  return { status: 200, payload: { vessel: saved } };
}
```

- [ ] **Step 3: Add the routes** right after the `/api/admin/selections` GET block:

```js
    if (pathname === "/api/admin/vessel" && method === "GET") {
      if (!requireAdmin(request, response, url)) {
        return;
      }
      sendJson(response, 200, { vessel: readVesselRecord() });
      return;
    }

    if (pathname === "/api/admin/vessel/save" && method === "POST") {
      const admin = requireBridgeCharterAdmin(request, response, url);
      if (!admin) {
        return;
      }
      const body = toPlainObject(await readJsonRequestBody(request));
      const result = saveVesselRecord(body, `${admin.role} / ${admin.department}`);
      sendJson(response, result.status, result.payload);
      return;
    }
```

- [ ] **Step 4: Check the syntax**

Run: `node --check server.js`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(server): GET /api/admin/vessel and POST /api/admin/vessel/save"
```

---

### Task 8: `server.js`: guests by `cabin_id`, charters' `cabins_on_request`, the guest payload

**Files:**
- Modify: `server.js` (the default guest object, `normalizeGuestRecord`, `normalizeAdminCharterData`, `buildCharterPayload`)

- [ ] **Step 1: The default guest.** In the default guest object (the one with `preferred_name: ""`, `principal: false`, `active: true`), replace

```js
    cabin: "N/A",
```

with

```js
    cabin_id: "",
```

- [ ] **Step 2: `normalizeGuestRecord`.** Replace the `const cabin = defaultSelection(…);` statement (three lines) with:

```js
  // Spec V §2.2: guests store a cabin id. An old-style name (an admin page from before the release) maps to its id.
  const legacyCabin = typeof source.cabin === "string" ? source.cabin : source.cabin_assignment;
  const cabinId = typeof source.cabin_id === "string"
    ? source.cabin_id.trim().slice(0, 60)
    : (vesselLib.isNoCabinName(legacyCabin) ? "" : vesselLib.cabinIdForLegacyName(legacyCabin, readVesselCabins()));
```

In the `normalized` object replace `cabin,` with `cabin_id: cabinId,`, and next to `delete normalized.cabin_assignment;` add:

```js
  delete normalized.cabin;
```

- [ ] **Step 3: `normalizeAdminCharterData`.** Add one property after `guest_count: normalizeGuestCount(source.guest_count),`:

```js
    cabins_on_request: vesselLib.normalizeCabinsOnRequest(source.cabins_on_request, readVesselCabins()),
```

- [ ] **Step 4: `buildCharterPayload`.** Delete the line

```js
  const legacyVessel = toPlainObject(readJsonFileSafe(path.join(DATA_DIR, "vessel.json"), {}));
```

and replace

```js
  const vessel = toPlainObject(readJsonFileSafe(path.join(LIBRARY_DIR, "vessel.json"), legacyVessel));
```

with

```js
  // Spec V SV-D13: the guest site gets the profile only (no cabins, no revision stamp).
  const vessel = vesselLib.publicVessel(readVesselRecord());
```

- [ ] **Step 5: Check the syntax and the suite**

Run: `node --check server.js` then `npm test`
Expected: no syntax output; all tests pass (216).

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat(server): guests store cabin_id, charters keep cabins_on_request, guests get the profile only"
```

---

### Task 9: `server.js`: migration v7 `vessel-cabins`

**Files:**
- Modify: `server.js` (new function before `const DATA_MIGRATIONS`, one entry in `DATA_MIGRATIONS`)

- [ ] **Step 1: Add the migration function** right before `const DATA_MIGRATIONS = [`:

```js
// v7 (spec V §3.3): cabins become records in library/vessel.json, built from the names guests use; guests store
// cabin_id; selections.json loses cabins. Files that already carry a spec C revision get it bumped.
function migrateVesselCabinsV7(dataDir) {
  const libraryDir = path.join(dataDir, "library");
  const vesselPath = path.join(libraryDir, "vessel.json");
  const selectionsPath = path.join(libraryDir, "selections.json");
  const chartersDir = path.join(dataDir, "charters");
  const guestLists = [];
  if (fs.existsSync(chartersDir)) {
    for (const entry of fs.readdirSync(chartersDir, { withFileTypes: true })) {
      const filePath = path.join(chartersDir, entry.name, "guest_list.json");
      if (entry.isDirectory() && fs.existsSync(filePath)) {
        guestLists.push({ charterId: entry.name, data: readJsonFileSafe(filePath, { guests: [] }) });
      }
    }
  }
  guestLists.sort((a, b) => a.charterId.localeCompare(b.charterId));
  const storedVessel = toPlainObject(readJsonFileSafe(vesselPath, readJsonFileSafe(path.join(dataDir, "vessel.json"), {})));
  const storedSelections = toPlainObject(readJsonFileSafe(selectionsPath, {}));
  const result = vesselLib.migrateCabins({ selections: storedSelections, vessel: storedVessel, guestLists });
  const bumped = (data, stored) => (fileRevisions.readRevision(stored) > 0
    ? fileRevisions.stamp(data, stored, "migration v7", nowIso())
    : data);
  if (result.vesselChanged) {
    writeJsonFileAtomic(vesselPath, bumped(result.vessel, storedVessel));
  }
  for (const list of result.guestLists.filter(item => result.changedCharterIds.includes(item.charterId))) {
    const stored = guestLists.find(item => item.charterId === list.charterId).data;
    writeJsonFileAtomic(path.join(chartersDir, list.charterId, "guest_list.json"), bumped(list.data, stored));
  }
  if (result.selectionsChanged) {
    writeJsonFileAtomic(selectionsPath, result.selections);
  }
  console.log(`Vessel cabins v7: ${result.vessel.cabins.length} cabin(s), ${result.changedCharterIds.length} guest list(s) moved to cabin ids.`);
}
```

- [ ] **Step 2: Register it.** Add after the v6 entry in `DATA_MIGRATIONS`:

```js
  { version: 6, name: "hash-admin-passwords", run: migrateAdminPasswordHashesV6 },
  { version: 7, name: "vessel-cabins", run: migrateVesselCabinsV7 }
```

(the v6 line gains a trailing comma).

- [ ] **Step 3: Check the syntax**

Run: `node --check server.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(server): migration v7 vessel-cabins"
```

---

### Task 10: Templates

**Files:**
- Modify: `data-templates/library/vessel.json`, `data-templates/library/selections.json`, `data-templates/charters/larry/guest_list.json`

- [ ] **Step 1: `vessel.json`.** Add a `cabins` array after `sections` (keep everything else):

```json
  "cabins": [
    { "id": "state-room", "name": "State Room", "deck": "", "bed_layout": "", "berths": null, "extra_berths": 0, "on_request": false },
    { "id": "starboard-vip", "name": "Starboard VIP", "deck": "", "bed_layout": "", "berths": null, "extra_berths": 0, "on_request": false },
    { "id": "port-vip", "name": "Port VIP", "deck": "", "bed_layout": "", "berths": null, "extra_berths": 0, "on_request": false },
    { "id": "port-twin", "name": "Port Twin", "deck": "", "bed_layout": "", "berths": null, "extra_berths": 0, "on_request": false },
    { "id": "starboard-twin", "name": "Starboard Twin", "deck": "", "bed_layout": "", "berths": null, "extra_berths": 0, "on_request": false },
    { "id": "bridge-deck-cabin", "name": "Bridge Deck Cabin", "deck": "Bridge deck", "bed_layout": "", "berths": null, "extra_berths": 0, "on_request": true },
    { "id": "saloon", "name": "Saloon", "deck": "", "bed_layout": "", "berths": null, "extra_berths": 0, "on_request": true }
  ]
```

- [ ] **Step 2: `selections.json`.** Delete the whole `"cabins": [ … ],` entry, including its trailing comma (`site_tags` follows it, so the JSON stays valid).

- [ ] **Step 3: `guest_list.json`.** Replace each `"cabin": "N/A",` (four guests) with `"cabin_id": "",`.

- [ ] **Step 4: Check the JSON**

Run: `node -e "for (const f of ['data-templates/library/vessel.json','data-templates/library/selections.json','data-templates/charters/larry/guest_list.json']) { const d = JSON.parse(require('fs').readFileSync(f,'utf8')); console.log(f, 'ok', d.cabins ? d.cabins.length : '') }"`
Expected: three `ok` lines, the first with `7`, the second with an empty count.

Leave `data-templates/schema-version.json` at 5 (so v6 and v7 also run on a fresh install; v7 finds nothing to do there).

- [ ] **Step 5: Commit**

```bash
git add data-templates/library/vessel.json data-templates/library/selections.json data-templates/charters/larry/guest_list.json
git commit -m "feat(server): templates carry the Princess Iolanthe cabins and cabin ids"
```

---

### Task 11: Run it on a scratch copy of boat-shaped data

**Files:** none committed (scratch data only).

- [ ] **Step 1: Make scratch data shaped like the boat's.** Copy `iolanthe/iolanthe-server/data-scratch` to `worktrees/vessel/data-scratch-v` and give it the boat's cabin names (this script edits the copy only):

```bash
cp -r "S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server/data-scratch" "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/vessel/data-scratch-v"
node -e "
const fs = require('fs'), path = require('path');
const root = 'S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/vessel/data-scratch-v';
const sel = path.join(root, 'library/selections.json');
const s = JSON.parse(fs.readFileSync(sel, 'utf8'));
s.cabins = ['N/A', 'State Room', 'Starboard VIP', 'Starboard', 'Port VIP', 'Twin', 'Port Twin'];
fs.writeFileSync(sel, JSON.stringify(s, null, 2));
const v = path.join(root, 'library/vessel.json');
if (fs.existsSync(v)) { const d = JSON.parse(fs.readFileSync(v, 'utf8')); delete d.cabins; fs.writeFileSync(v, JSON.stringify(d, null, 2)); }
const names = ['Port Twin', 'Starboard Twin', 'State Room', 'N/A', 'Port VIP', 'Starboard VIP'];
let i = 0;
for (const id of fs.readdirSync(path.join(root, 'charters'))) {
  const f = path.join(root, 'charters', id, 'guest_list.json');
  if (!fs.existsSync(f)) continue;
  const g = JSON.parse(fs.readFileSync(f, 'utf8'));
  (g.guests || []).forEach(guest => { delete guest.cabin_id; guest.cabin = names[i++ % names.length]; });
  fs.writeFileSync(f, JSON.stringify(g, null, 2));
}
const sv = path.join(root, 'schema-version.json');
const schema = JSON.parse(fs.readFileSync(sv, 'utf8')); schema.version = Math.min(schema.version, 6); fs.writeFileSync(sv, JSON.stringify(schema, null, 2));
console.log('scratch data ready');
"
```

- [ ] **Step 2: Start the server on it once.** Add a `.claude/launch.json` entry in the GitHub folder (`"name": "iolanthe-server-vessel"`, `PORT=8023`, `HTTP_HOST=127.0.0.1`, `DATA_DIR` = the scratch copy, `BACKUP_DIR` = `worktrees/vessel/backups-v`, `GUEST_STATIC_DIR` = `portal/iolanthe-guest`, `ADMIN_STATIC_DIR` = `portal/iolanthe-admin`, `"url": "http://vessel.localhost:8023"`) and start it with the preview tool. Read its log.

Expected log lines: `Backed up data before migration to …`, `Vessel cabins v7: 5 cabin(s), N guest list(s) moved to cabin ids.`, `Applied data migration 7: vessel-cabins`.

- [ ] **Step 3: Check the files**

```bash
node -e "
const fs = require('fs'), path = require('path');
const root = 'S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/vessel/data-scratch-v';
const v = JSON.parse(fs.readFileSync(path.join(root, 'library/vessel.json'), 'utf8'));
console.log('cabins:', v.cabins.map(c => c.id).join(', '));
const s = JSON.parse(fs.readFileSync(path.join(root, 'library/selections.json'), 'utf8'));
console.log('selections has cabins:', 'cabins' in s);
for (const id of fs.readdirSync(path.join(root, 'charters'))) {
  const f = path.join(root, 'charters', id, 'guest_list.json');
  if (!fs.existsSync(f)) continue;
  const g = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(id, (g.guests || []).map(x => JSON.stringify(x.cabin_id) + ('cabin' in x ? ' (old field left!)' : '')).join(' '));
}
console.log('schema:', JSON.parse(fs.readFileSync(path.join(root, 'schema-version.json'), 'utf8')).version);
"
```

Expected: `cabins: state-room, starboard-vip, port-vip, port-twin, starboard-twin`; `selections has cabins: false`; every guest shows a cabin id or `""`, none says "old field left"; `schema: 7`.

- [ ] **Step 4: Check the routes with a signed-in session.** Passwords are scrypt hashes since v6, but a plain value
  in `settings.json` is still accepted (and hashed at its first login), and the file is read on every request. So sign
  in with a throwaway password set on the **scratch copy only**, printing nothing but the session token:

```bash
node -e "
const fs = require('fs'), crypto = require('crypto'), http = require('http');
const settingsPath = 'S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/vessel/data-scratch-v/settings.json';
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const password = crypto.randomBytes(12).toString('hex');
settings.admin.passwords.charter = password;
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
const body = JSON.stringify({ key: settings.admin.urlKey, department: 'charter', password });
const req = http.request({ host: '127.0.0.1', port: 8023, path: '/api/admin/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
  const cookie = (res.headers['set-cookie'] || []).find(c => c.startsWith('iolanthe_admin_session=')) || '';
  console.log(res.statusCode, 'token:', cookie.split(';')[0].split('=')[1] || '(none)');
});
req.end(body);
"
```

Expected: `200 token: <hex>`. Open `http://vessel.localhost:8023/admin/?key=<scratch urlKey>` in the browser pane (from
the address of a page the server redirected with the key, so the key isn't typed), set the cookie there with
`document.cookie = "iolanthe_admin_session=<token>; path=/"`, reload, then in the pane's console:

```js
const key = new URLSearchParams(location.search).get("key");
const get = await (await fetch(`/api/admin/vessel?key=${key}`)).json();
const stale = await fetch(`/api/admin/vessel/save?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: get.vessel, base_revision: 99 }) });
const good = await fetch(`/api/admin/vessel/save?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { ...get.vessel, cabins: get.vessel.cabins.map(c => ({ ...c, berths: 2 })) }, base_revision: get.vessel.revision || 0 }) });
const removed = await fetch(`/api/admin/vessel/save?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { ...get.vessel, cabins: get.vessel.cabins.slice(1) }, base_revision: (await good.clone().json()).vessel.revision }) });
const guest = await (await fetch(`/api/charter?key=${key}`)).json();
({ cabins: get.vessel.cabins.length, stale: stale.status, good: good.status, removed: [removed.status, (await removed.json()).code], guestVesselKeys: Object.keys(guest.vessel) });
```

Expected: `cabins: 5`, `stale: 409`, `good: 200`, `removed` is `[409, "cabin-in-use"]` when a charter that hasn't ended has a State Room guest (or `[200, undefined]` when none has; then check that `state-room` is gone and restore it with another save), and `guestVesselKeys` has `description`, `details`, `sections` (and `crew`, `crew_groups` when the charter has crew), but no `cabins` or `revision`.

- [ ] **Step 5: Stop the server.** Keep the scratch copy until V3's browser checks are done.

---

### Task 12: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Key files.** In "Key files", add:

```markdown
- `lib/vessel.js` — the vessel record (spec V): `library/vessel.json` holds the guest-facing profile (description, details,
  sections) and the cabins; normalize, validate, cabin ids, the old-name mapping, on-request ids, the delete guard, the
  public profile and the v7 transform (`migrateCabins`)
- `lib/file-revisions.js` — spec C §2.1's revision stamp (`readRevision`, `checkBase`, `stamp`, `stripStamp`), used by
  the vessel save
```

- [ ] **Step 2: Data directory layout.** Next to `vessel.json` write `the vessel record: profile + cabins (spec V)`; next to
`selections.json` write `dropdown lists (no cabins since v7)`; and under the charter files add that `guest_list.json`
guests store `cabin_id` and `charter.json` keeps `cabins_on_request`.

- [ ] **Step 3: Data migrations.** Append:

```markdown
v7 `vessel-cabins` (spec V): one cabin per selections cabin name that a guest uses (in the list's order, then unlisted
names), with blank deck / layout / berths, in `library/vessel.json`; guests move from `cabin` names to `cabin_id`
("N/A" → ""); `selections.json` loses `cabins`. `normalizeSelections` passes an old `cabins` list through until then,
because `ensureSelectionsFile` runs before the migrations. The on-request cabins are added in the admin's Settings →
Vessel tab.
```

- [ ] **Step 4: A section for the routes.** After "Admin passwords and URL key", add:

```markdown
## Vessel record (spec V)

`GET /api/admin/vessel` (any admin session) returns `{ vessel }`, the whole record with its spec C stamp.
`POST /api/admin/vessel/save` (bridge Charter Admin) takes `{ data, base_revision }`: a stale revision gets 409
(`code: "revision"`), a rule break 400 with `errors`, removing a cabin that guests use in a charter that hasn't ended 409
(`code: "cabin-in-use"`). Guests store `cabin_id`; an old-style `cabin` name on a save maps to its id. `charter.json`
keeps `cabins_on_request` (ids of on-request cabins only). The guest payload's `vessel` is the profile without cabins or
stamp.
```

- [ ] **Step 5: Tests.** Change the test count to the number `npm test` prints (216 if nothing else landed).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(server): vessel record, migration v7, routes"
```

---

### Task 13: Review and PR

- [ ] **Step 1:** `npm test` passes; `node --check server.js` is silent.
- [ ] **Step 2:** Run a code-review agent on the branch diff (model sonnet), apply what holds up, re-run the tests.
- [ ] **Step 3:** Merge `origin/main` into the branch if it moved (prefer a merge to a rebase in OneDrive worktrees) and re-run the tests.
- [ ] **Step 4:** Push and open the PR against `main` (title `feat(server): vessel record and cabins (spec V, V1)`), saying in the body: release together with the admin V2 and V3 PRs, server first (`./update.sh` on the boat; the migration backs up first), then add the Bridge Deck Cabin and the Saloon in the new tab. Do not merge without David's word.
