# Vessel tab V2: admin core and the Settings → Vessel tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Settings → Vessel tab of spec V (`docs/vessel/spec-v-vessel-tab.md` §4.1–4.2): the cabins (rows grouped Standard / On request, a cabin dialog, drag to reorder) and the vessel profile (description, specifications, notes sections), saved as one record with `base_revision`.

**Architecture:** A new pure module `vessel-core.js` (UMD like `charters-core.js`, global `IolantheVesselCore`, Node-tested) mirrors the server's record rules and adds the tab's helpers (totals, labels, suggestions, group-aware reordering). `admin.js` gets the tab's load / render / bind trio, reusing `bindSettingsFormController` (dirty tracking, the unsaved-changes guard, save and discard), `openDialogModal` with save / cancel / delete in the header (the Crew dialog pattern), `dragHandleHtml` + `IolantheDragReorder.attach`, and `rowChevronHtml`. The page edits a draft in `state.vesselDraft`; dialog edits and drags fire a synthetic `input` event on the form so the controller sees them.

**Tech Stack:** Plain HTML/CSS/JS (no build, no npm), `node:test`.

**Depends on:** V1 (`iolanthe-server` branch `feat/vessel-v1`): the routes and the migrated data. Browser checks run against a scratch server built from that branch.

**Repo and worktree:** `portal/iolanthe-admin`, branch `feat/vessel-v2` from `origin/main`, worktree
`S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/vessel-v2/iolanthe-admin` (stage files by name; never checkout,
switch, stash or `add -A` in the main checkout).

```bash
git -C "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin" fetch origin
git -C "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin" worktree add -b feat/vessel-v2 "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/vessel-v2/iolanthe-admin" origin/main
```

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `vessel-core.js` | create | record rules (mirror of the server's `lib/vessel.js`), ids, cabin / section checks, totals, labels, suggestions, group ordering |
| `test/vessel-core.test.js` | create | its tests |
| `admin.js` | modify | `state` fields, the Vessel tab (load, render, draw lists, two dialogs, save, bind), `renderSettings` wiring |
| `admin.css` | modify | `.vessel-*` styles |
| `index.html` | modify | load `vessel-core.js`; bump every `?v=` |
| `CLAUDE.md` | modify | the new module and tab, test count |

---

### Task 1: `vessel-core.js`: record rules

**Files:**
- Create: `vessel-core.js`
- Test: `test/vessel-core.test.js`

- [ ] **Step 1: Write the failing tests**

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../vessel-core.js");

test("cabinIdFor slugs the name and adds -2, -3 until free (the server's rule)", () => {
  assert.equal(core.cabinIdFor("Port VIP", []), "port-vip");
  assert.equal(core.cabinIdFor("Port VIP", [{ id: "port-vip" }]), "port-vip-2");
  assert.equal(core.cabinIdFor("", []), "cabin");
});

test("normalizeVesselDraft keeps the record's known fields, drops empty rows and the stamp", () => {
  assert.deepEqual(core.normalizeVesselDraft({
    description: "Welcome",
    details: [{ label: " Length ", value: "45.7 m" }, { label: "", value: " " }],
    sections: [{ title: "Notes", items: [" a ", ""] }],
    cabins: [{ id: "saloon", name: "Saloon", berths: 2, extra_berths: 1, on_request: true }],
    revision: 3,
    saved_by: "x",
    other: 1
  }), {
    description: "Welcome",
    details: [{ label: "Length", value: "45.7 m" }],
    sections: [{ title: "Notes", items: ["a"] }],
    cabins: [{ id: "saloon", name: "Saloon", deck: "", bed_layout: "", berths: 2, extra_berths: 1, on_request: true }]
  });
});

test("validateVesselDraft passes a good record and names the broken fields like the server", () => {
  const good = core.normalizeVesselDraft({
    description: "Welcome",
    details: [{ label: "Length", value: "45.7 m" }],
    sections: [{ title: "Notes", items: ["a"] }],
    cabins: [{ id: "twin", name: "Twin", berths: 2 }]
  });
  assert.deepEqual(core.validateVesselDraft(good), []);
  const bad = { ...good, details: [{ label: "", value: "v" }], cabins: [good.cabins[0], { ...good.cabins[0], name: "TWIN" }] };
  assert.deepEqual(core.validateVesselDraft(bad).map(error => error.field), ["details[0].label", "cabins[1].id", "cabins[1].name"]);
});

test("cabinErrors checks one cabin against the others", () => {
  const others = [{ id: "twin", name: "Twin" }];
  assert.deepEqual(core.cabinErrors({ name: "Saloon", deck: "", bed_layout: "", berths: 2, extra_berths: 0 }, others), []);
  assert.deepEqual(core.cabinErrors({ name: " twin ", deck: "", bed_layout: "", berths: null, extra_berths: 0 }, others),
    ["Another cabin already has this name."]);
  assert.deepEqual(core.cabinErrors({ name: "", deck: "d".repeat(31), bed_layout: "", berths: 13, extra_berths: 5 }, others), [
    "Give the cabin a name of at most 40 characters.",
    "The deck can be at most 30 characters.",
    "Berths must be from 1 to 12.",
    "Extra berths must be from 0 to 4."
  ]);
});

test("sectionErrors checks a notes section; items come from one per line", () => {
  assert.deepEqual(core.sectionItemsFromText(" one \n\n two \r\nthree "), ["one", "two", "three"]);
  assert.equal(core.sectionItemsToText(["one", "two"]), "one\ntwo");
  assert.deepEqual(core.sectionErrors({ title: "Notes", items: ["a"] }), []);
  assert.deepEqual(core.sectionErrors({ title: "", items: ["i".repeat(501)] }), [
    "Give the section a title of at most 60 characters.",
    "Each note can be at most 500 characters."
  ]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/vessel-core.test.js`
Expected: FAIL with `Cannot find module '../vessel-core.js'`.

- [ ] **Step 3: Write the module**

```js
// Vessel record pure logic (spec V, docs/vessel/spec-v-vessel-tab.md), shared by admin.js (browser) and
// test/vessel-core.test.js (node --test). The record rules mirror iolanthe-server lib/vessel.js: keep them in step.
// No DOM here.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheVesselCore = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

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

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function slugify(value) {
    return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function cabinIdFor(name, cabins) {
    const base = slugify(name).slice(0, LIMITS.cabinId - 4).replace(/-+$/g, "") || "cabin";
    const taken = new Set((Array.isArray(cabins) ? cabins : []).map(cabin => cabin && cabin.id));
    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function blankCabin() {
    return { id: "", name: "", deck: "", bed_layout: "", berths: null, extra_berths: 0, on_request: false };
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

  function normalizeVesselDraft(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      description: typeof source.description === "string" ? source.description : "",
      details: (Array.isArray(source.details) ? source.details : [])
        .map(row => ({ label: text(row && row.label), value: text(row && row.value) }))
        .filter(row => row.label || row.value),
      sections: (Array.isArray(source.sections) ? source.sections : [])
        .map(section => ({
          title: text(section && section.title),
          items: (Array.isArray(section && section.items) ? section.items : []).map(text).filter(Boolean)
        }))
        .filter(section => section.title || section.items.length),
      cabins: (Array.isArray(source.cabins) ? source.cabins : []).map(normalizeCabin)
    };
  }

  // The server's validateVessel, field for field.
  function validateVesselDraft(record) {
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

  // The cabin dialog's checks: one cabin against the others (by name, ignoring case).
  function cabinErrors(cabin, others) {
    const name = text(cabin.name);
    const messages = [];
    if (!name || name.length > LIMITS.cabinName) {
      messages.push(`Give the cabin a name of at most ${LIMITS.cabinName} characters.`);
    } else if ((Array.isArray(others) ? others : []).some(other => text(other.name).toLocaleLowerCase() === name.toLocaleLowerCase())) {
      messages.push("Another cabin already has this name.");
    }
    if (text(cabin.deck).length > LIMITS.cabinText) {
      messages.push(`The deck can be at most ${LIMITS.cabinText} characters.`);
    }
    if (text(cabin.bed_layout).length > LIMITS.cabinText) {
      messages.push(`The bed layout can be at most ${LIMITS.cabinText} characters.`);
    }
    if (cabin.berths !== null && (!Number.isInteger(cabin.berths) || cabin.berths < 1 || cabin.berths > LIMITS.berthsMax)) {
      messages.push(`Berths must be from 1 to ${LIMITS.berthsMax}.`);
    }
    if (!Number.isInteger(cabin.extra_berths) || cabin.extra_berths < 0 || cabin.extra_berths > LIMITS.extraBerthsMax) {
      messages.push(`Extra berths must be from 0 to ${LIMITS.extraBerthsMax}.`);
    }
    return messages;
  }

  function sectionItemsFromText(value) {
    return String(value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }

  function sectionItemsToText(items) {
    return (Array.isArray(items) ? items : []).join("\n");
  }

  function sectionErrors(section) {
    const messages = [];
    const title = text(section.title);
    if (!title || title.length > LIMITS.sectionTitle) {
      messages.push(`Give the section a title of at most ${LIMITS.sectionTitle} characters.`);
    }
    if (section.items.length > LIMITS.sectionItems) {
      messages.push(`A section can have at most ${LIMITS.sectionItems} items.`);
    }
    if (section.items.some(item => item.length > LIMITS.sectionItem)) {
      messages.push(`Each note can be at most ${LIMITS.sectionItem} characters.`);
    }
    return messages;
  }

  return {
    LIMITS,
    cabinIdFor,
    blankCabin,
    normalizeCabin,
    normalizeVesselDraft,
    validateVesselDraft,
    cabinErrors,
    sectionItemsFromText,
    sectionItemsToText,
    sectionErrors
  };
});
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test test/vessel-core.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add vessel-core.js test/vessel-core.test.js
git commit -m "feat(admin): vessel-core, the vessel record rules (spec V 4.1)"
```

---

### Task 2: `vessel-core.js`: totals, labels, suggestions, group ordering

**Files:**
- Modify: `vessel-core.js`
- Test: `test/vessel-core.test.js`

- [ ] **Step 1: Append the failing tests**

```js
const SEVEN = [
  { id: "state-room", name: "State Room", deck: "Main deck", bed_layout: "Double", berths: 2, extra_berths: 0, on_request: false },
  { id: "starboard-vip", name: "Starboard VIP", deck: "Lower deck", bed_layout: "Double", berths: 2, extra_berths: 0, on_request: false },
  { id: "port-vip", name: "Port VIP", deck: "lower deck", bed_layout: "Double", berths: 2, extra_berths: 0, on_request: false },
  { id: "port-twin", name: "Port Twin", deck: "", bed_layout: "Twin", berths: 2, extra_berths: 1, on_request: false },
  { id: "starboard-twin", name: "Starboard Twin", deck: "", bed_layout: "", berths: null, extra_berths: 0, on_request: false },
  { id: "bridge-deck-cabin", name: "Bridge Deck Cabin", deck: "Bridge deck", bed_layout: "Double", berths: 2, extra_berths: 0, on_request: true },
  { id: "saloon", name: "Saloon", deck: "Main deck", bed_layout: "Sofa bed", berths: 2, extra_berths: 0, on_request: true }
];

test("cabinTotals adds up standard and on-request cabins, and lists cabins without berths", () => {
  assert.deepEqual(core.cabinTotals(SEVEN), {
    standard: { count: 5, berths: 8, max: 9 },
    onRequest: { count: 2, berths: 4, max: 4 },
    berthsNotSet: ["starboard-twin"]
  });
});

test("the summaries read like the mockup", () => {
  const totals = core.cabinTotals(SEVEN);
  assert.equal(core.standardSummary(totals), "Standard: 5 cabins · 8 berths · max 9");
  assert.equal(core.onRequestSummary(totals), "On request: 2 cabins · +4 berths");
  const one = core.cabinTotals([SEVEN[0]]);
  assert.equal(core.standardSummary(one), "Standard: 1 cabin · 2 berths");
  assert.equal(core.standardSummary(core.cabinTotals([])), "Standard: no cabins");
});

test("berthsLabel and itemsLabel", () => {
  assert.equal(core.berthsLabel(SEVEN[0]), "2");
  assert.equal(core.berthsLabel(SEVEN[3]), "2 +1");
  assert.equal(core.berthsLabel(SEVEN[4]), "Berths not set");
  assert.equal(core.itemsLabel(1), "1 item");
  assert.equal(core.itemsLabel(8), "8 items");
  assert.equal(core.itemsLabel(0), "No items");
});

test("deck and layout suggestions: the values in use first, then the defaults, no repeats", () => {
  assert.deepEqual(core.deckSuggestions(SEVEN), ["Main deck", "Lower deck", "Bridge deck", "Upper deck", "Sun deck"]);
  assert.deepEqual(core.layoutSuggestions(SEVEN), ["Double", "Twin", "Sofa bed", "King", "Twin or double", "Single", "Bunks"]);
});

test("sortCabinsByGroup puts standard cabins first and keeps each group's order", () => {
  const mixed = [SEVEN[6], SEVEN[0], SEVEN[5], SEVEN[1]];
  assert.deepEqual(core.sortCabinsByGroup(mixed).map(cabin => cabin.id), ["state-room", "starboard-vip", "saloon", "bridge-deck-cabin"]);
});

test("moveCabinInGroup moves within one group and leaves the other alone", () => {
  assert.deepEqual(core.moveCabinInGroup(SEVEN, false, 0, 2).map(cabin => cabin.id),
    ["starboard-vip", "port-vip", "state-room", "port-twin", "starboard-twin", "bridge-deck-cabin", "saloon"]);
  assert.deepEqual(core.moveCabinInGroup(SEVEN, true, 1, 0).map(cabin => cabin.id),
    ["state-room", "starboard-vip", "port-vip", "port-twin", "starboard-twin", "saloon", "bridge-deck-cabin"]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/vessel-core.test.js`
Expected: FAIL with `core.cabinTotals is not a function`.

- [ ] **Step 3: Add the functions** to `vessel-core.js` (before `return {`), and add `cabinTotals, standardSummary, onRequestSummary, berthsLabel, itemsLabel, deckSuggestions, layoutSuggestions, sortCabinsByGroup, moveCabinInGroup` to the returned object.

```js
  const DECK_SUGGESTIONS = Object.freeze(["Lower deck", "Main deck", "Upper deck", "Bridge deck", "Sun deck"]);
  const LAYOUT_SUGGESTIONS = Object.freeze(["Double", "King", "Twin", "Twin or double", "Single", "Bunks", "Sofa bed"]);

  function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
  }

  function groupTotals(cabins) {
    return cabins.reduce((totals, cabin) => {
      const berths = Number.isInteger(cabin.berths) ? cabin.berths : 0;
      return {
        count: totals.count + 1,
        berths: totals.berths + berths,
        max: totals.max + berths + (Number.isInteger(cabin.extra_berths) ? cabin.extra_berths : 0)
      };
    }, { count: 0, berths: 0, max: 0 });
  }

  function cabinTotals(cabins) {
    const list = Array.isArray(cabins) ? cabins : [];
    return {
      standard: groupTotals(list.filter(cabin => !cabin.on_request)),
      onRequest: groupTotals(list.filter(cabin => cabin.on_request)),
      berthsNotSet: list.filter(cabin => !Number.isInteger(cabin.berths)).map(cabin => cabin.id)
    };
  }

  function standardSummary(totals) {
    const group = totals.standard;
    if (!group.count) {
      return "Standard: no cabins";
    }
    const max = group.max > group.berths ? ` · max ${group.max}` : "";
    return `Standard: ${plural(group.count, "cabin", "cabins")} · ${plural(group.berths, "berth", "berths")}${max}`;
  }

  function onRequestSummary(totals) {
    const group = totals.onRequest;
    const max = group.max > group.berths ? ` · max +${group.max}` : "";
    return `On request: ${plural(group.count, "cabin", "cabins")} · +${plural(group.berths, "berth", "berths")}${max}`;
  }

  function berthsLabel(cabin) {
    if (!Number.isInteger(cabin.berths)) {
      return "Berths not set";
    }
    return cabin.extra_berths > 0 ? `${cabin.berths} +${cabin.extra_berths}` : String(cabin.berths);
  }

  function itemsLabel(count) {
    return count ? plural(count, "item", "items") : "No items";
  }

  function suggestionsFrom(cabins, field, defaults) {
    const seen = new Set();
    return (Array.isArray(cabins) ? cabins : []).map(cabin => text(cabin[field])).concat(defaults)
      .filter(value => {
        const key = value.toLocaleLowerCase();
        if (!value || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  function deckSuggestions(cabins) {
    return suggestionsFrom(cabins, "deck", DECK_SUGGESTIONS);
  }

  function layoutSuggestions(cabins) {
    return suggestionsFrom(cabins, "bed_layout", LAYOUT_SUGGESTIONS);
  }

  // Standard cabins first, then on request; each group keeps its order (the order the guest cabin picker uses).
  function sortCabinsByGroup(cabins) {
    const list = Array.isArray(cabins) ? cabins : [];
    return list.filter(cabin => !cabin.on_request).concat(list.filter(cabin => cabin.on_request));
  }

  function moveCabinInGroup(cabins, onRequest, from, to) {
    const sorted = sortCabinsByGroup(cabins);
    const group = sorted.filter(cabin => Boolean(cabin.on_request) === Boolean(onRequest));
    const rest = sorted.filter(cabin => Boolean(cabin.on_request) !== Boolean(onRequest));
    const moved = group.slice();
    if (from >= 0 && to >= 0 && from < moved.length && to < moved.length && from !== to) {
      const [item] = moved.splice(from, 1);
      moved.splice(to, 0, item);
    }
    return onRequest ? rest.concat(moved) : moved.concat(rest);
  }
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test test/vessel-core.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add vessel-core.js test/vessel-core.test.js
git commit -m "feat(admin): vessel-core totals, labels, suggestions and group ordering"
```

---

### Task 3: Load `vessel-core.js` and hold the record in `state`

**Files:**
- Modify: `index.html`, `admin.js` (the `state` object, `clearAdminState`)

- [ ] **Step 1: The script tag.** In `index.html`, after the `drag-reorder.js` script tag, add:

```html
  <script src="/admin/vessel-core.js?v=admin-refused-card" defer></script>
```

(Task 9 bumps every `?v=` at once.)

- [ ] **Step 2: State fields.** In `admin.js`'s `const state = {`, after `selections: {},` add:

```js
    vessel: null,
    vesselDraft: null,
    vesselRevision: 0,
```

- [ ] **Step 3: Reset on sign-out.** In `clearAdminState`, after `state.selections = {};` add:

```js
    state.vessel = null;
    state.vesselDraft = null;
    state.vesselRevision = 0;
```

- [ ] **Step 4: Check nothing broke**

Run: `node --test`
Expected: all pass (185 before this plan, plus 11: 196). `startup-order.test.js` still passes: nothing renders before DOMContentLoaded.

- [ ] **Step 5: Commit**

```bash
git add index.html admin.js
git commit -m "feat(admin): load vessel-core and keep the vessel record in state"
```

---

### Task 4: The tab's load, render and wiring

**Files:**
- Modify: `admin.js` (`renderSettings`; new functions right after `bindWeatherSettingsActions`)

- [ ] **Step 1: Load and render.** Add after `function bindWeatherSettingsActions() { … }`:

```js
  // ---- Settings → Vessel (spec V §4.2): the vessel record, its cabins and the guest-facing profile, saved as one ----

  async function loadVesselSettings() {
    const payload = await api("/api/admin/vessel");
    const record = payload && payload.vessel && typeof payload.vessel === "object" ? payload.vessel : {};
    state.vessel = record;
    state.vesselRevision = Number.isInteger(record.revision) ? record.revision : 0;
    state.vesselDraft = window.IolantheVesselCore.normalizeVesselDraft(record);
    return state.vesselDraft;
  }

  function renderVesselSettings(draft) {
    return `
      <section class="card full vessel-settings">
        <div class="card-header">
          <h2>Vessel</h2>
          ${settingsActionButtonsHtml({
            formId: "vessel-form",
            cancelId: "vessel-cancel",
            saveLabel: "Save vessel",
            cancelLabel: "Discard vessel changes"
          })}
        </div>
        <form id="vessel-form" class="vessel-form">
          <section class="form-section full">
            <div class="vessel-section-header">
              <h3>Cabins</h3>
              <div id="vessel-cabin-totals" class="vessel-cabin-totals"></div>
            </div>
            <div id="vessel-cabins"></div>
            <div class="button-row">
              <button type="button" class="secondary" id="vessel-add-cabin">Add cabin</button>
            </div>
          </section>
          <section class="form-section full">
            <div class="vessel-section-header">
              <h3>Vessel profile</h3>
              <span class="muted">Shown on the guest site's Vessel Info and in the Charter Pack</span>
            </div>
            <label class="full">Description
              <textarea id="vessel-description" rows="4" maxlength="4000">${escapeHtml(draft.description)}</textarea>
            </label>
            <h4 class="vessel-subheading">Specifications</h4>
            <div id="vessel-details" class="vessel-list"></div>
            <div class="button-row">
              <button type="button" class="secondary" id="vessel-add-detail">Add specification</button>
            </div>
            <h4 class="vessel-subheading">Notes sections</h4>
            <div id="vessel-sections" class="vessel-list"></div>
            <div class="button-row">
              <button type="button" class="secondary" id="vessel-add-section">Add notes section</button>
            </div>
          </section>
        </form>
      </section>
    `;
  }

  // Dialog edits and drags don't fire input events on the form, so tell the settings controller ourselves.
  function markVesselFormChanged() {
    document.getElementById("vessel-form")?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function setVesselDraft(changes) {
    state.vesselDraft = { ...state.vesselDraft, ...changes };
  }
```

- [ ] **Step 2: Wire it into `renderSettings`.** In the `panels` array add the last entry:

```js
      { id: "weather", label: "Weather" },
      { id: "vessel", label: "Vessel" }
```

In the `content` chain, replace

```js
            : (activePanel === "weather"
              ? renderWeatherSettings(await loadWeatherSettings())
              : renderPasswordSettings((await api("/api/admin/passwords")).passwords || {}))));
```

with

```js
            : (activePanel === "weather"
              ? renderWeatherSettings(await loadWeatherSettings())
              : (activePanel === "vessel"
                ? renderVesselSettings(await loadVesselSettings())
                : renderPasswordSettings((await api("/api/admin/passwords")).passwords || {})))));
```

and in the bind chain add before the final `else`:

```js
      } else if (activePanel === "vessel") {
        bindVesselSettingsActions();
```

(`bindVesselSettingsActions` arrives in Task 8; until then the tab throws when opened, so don't open it before Task 8.)

- [ ] **Step 3: Check the syntax**

Run: `node --check admin.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add admin.js
git commit -m "feat(admin): Settings → Vessel tab skeleton"
```

---

### Task 5: Cabin rows and the cabin dialog

**Files:**
- Modify: `admin.js` (after `setVesselDraft`)

- [ ] **Step 1: Add the cabin list, row and dialog**

```js
  function drawVesselCabins() {
    const core = window.IolantheVesselCore;
    const container = document.getElementById("vessel-cabins");
    const totalsBox = document.getElementById("vessel-cabin-totals");
    if (!container || !totalsBox) {
      return;
    }
    const cabins = state.vesselDraft.cabins;
    const totals = core.cabinTotals(cabins);
    totalsBox.innerHTML = `
      <span class="status-pill">${escapeHtml(core.standardSummary(totals))}</span>
      ${totals.onRequest.count ? `<span class="status-pill">${escapeHtml(core.onRequestSummary(totals))}</span>` : ""}
    `;
    container.innerHTML = cabins.length ? "" : `<p class="muted">No cabins yet. Add the vessel's cabins.</p>`;
    [
      { onRequest: false, key: "standard", title: "Standard" },
      { onRequest: true, key: "on-request", title: "On request (switched on per charter in Charter Admin)" }
    ].forEach(group => {
      const groupCabins = cabins.filter(cabin => cabin.on_request === group.onRequest);
      if (!groupCabins.length) {
        return;
      }
      const box = document.createElement("div");
      box.className = "vessel-cabin-group";
      box.dataset.cabinGroup = group.key;
      box.innerHTML = `<p class="vessel-group-title">${escapeHtml(group.title)}</p><div class="vessel-list"></div>`;
      const list = box.querySelector(".vessel-list");
      groupCabins.forEach(cabin => list.appendChild(vesselCabinRowElement(cabin, groupCabins.length > 1)));
      window.IolantheDragReorder.attach(list, {
        items: () => [...list.querySelectorAll(":scope > .vessel-row")],
        handleSelector: ".vessel-cabin-grip",
        onMove: (from, to) => {
          setVesselDraft({ cabins: core.moveCabinInGroup(state.vesselDraft.cabins, group.onRequest, from, to) });
          drawVesselCabins();
          markVesselFormChanged();
        },
        afterMove: to => {
          document.querySelector(`[data-cabin-group="${group.key}"]`)?.querySelectorAll(".vessel-cabin-grip")[to]?.focus();
        }
      });
      container.appendChild(box);
    });
  }

  // A grip beside a tap-to-edit button (a button can't hold the grip button).
  function vesselCabinRowElement(cabin, movable) {
    const core = window.IolantheVesselCore;
    const row = document.createElement("div");
    row.className = "vessel-row";
    const meta = [cabin.deck, cabin.bed_layout].filter(Boolean).join(" · ");
    row.innerHTML = `
      ${movable ? dragHandleHtml(`Move ${cabin.name}`, "vessel-cabin-grip") : `<span class="vessel-grip-space"></span>`}
      <button type="button" class="vessel-row-open" title="Edit cabin">
        <strong>${escapeHtml(cabin.name)}</strong>
        <span class="vessel-row-meta">${escapeHtml(meta)}</span>
        <span class="status-pill${Number.isInteger(cabin.berths) ? "" : " vessel-berths-unset"}">${escapeHtml(core.berthsLabel(cabin))}</span>
        ${rowChevronHtml()}
      </button>
    `;
    row.querySelector(".vessel-row-open").addEventListener("click", () => {
      openVesselCabinModal(cabin, updated => {
        setVesselDraft({ cabins: core.sortCabinsByGroup(state.vesselDraft.cabins.map(entry => (entry === cabin ? updated : entry))) });
        drawVesselCabins();
        markVesselFormChanged();
      }, () => {
        setVesselDraft({ cabins: state.vesselDraft.cabins.filter(entry => entry !== cabin) });
        drawVesselCabins();
        markVesselFormChanged();
      });
    });
    return row;
  }

  // Add (cabin = null) or edit a cabin in the page's draft; the tab's save writes it.
  function openVesselCabinModal(cabin, onDone, onDelete) {
    const core = window.IolantheVesselCore;
    const draft = { ...core.blankCabin(), ...(cabin || {}) };
    const others = state.vesselDraft.cabins.filter(entry => entry !== cabin);
    const decks = core.deckSuggestions(state.vesselDraft.cabins);
    const layouts = core.layoutSuggestions(state.vesselDraft.cabins);
    const headerActionsHtml = `
      <div class="button-row modal-title-actions">
        ${iconSubmitButtonHtml("save", cabin ? "Done" : "Add cabin", ` form="vessel-cabin-form"`)}
        ${iconButtonHtml("cancel", "Cancel", ` data-modal-close`)}
        ${onDelete ? `<span class="header-sep"></span>${iconButtonHtml("remove", "Delete cabin", ` data-action="delete-cabin"`)}` : ""}
      </div>
    `;
    const modal = openDialogModal(cabin ? "Edit Cabin" : "Add Cabin", `
      <form id="vessel-cabin-form" class="form-grid">
        ${renderDatalist("vessel-deck-suggestions", decks)}
        ${renderDatalist("vessel-layout-suggestions", layouts)}
        <label class="full">Name
          <input id="vessel-cabin-name" value="${escapeAttribute(draft.name)}" maxlength="40" data-autofocus>
        </label>
        <label>Deck
          <input id="vessel-cabin-deck" value="${escapeAttribute(draft.deck)}" maxlength="30"${datalistAttribute("vessel-deck-suggestions", decks)}>
        </label>
        <label>Bed layout
          <input id="vessel-cabin-layout" value="${escapeAttribute(draft.bed_layout)}" maxlength="30"${datalistAttribute("vessel-layout-suggestions", layouts)}>
        </label>
        <label>Berths
          <input id="vessel-cabin-berths" type="number" min="1" max="12" step="1" value="${escapeAttribute(Number.isInteger(draft.berths) ? draft.berths : "")}">
        </label>
        <label>Extra berths
          <input id="vessel-cabin-extra" type="number" min="0" max="4" step="1" value="${escapeAttribute(draft.extra_berths)}">
        </label>
        <label class="switch-row full">
          <input id="vessel-cabin-on-request" type="checkbox"${draft.on_request ? " checked" : ""}>
          <span>On request (only when a charter asks for it)</span>
        </label>
        <p class="field-error full" id="vessel-cabin-error"></p>
      </form>
    `, { cardClass: "modal-welcome-message", hideClose: true, headerActionsHtml });
    modal.querySelector("#vessel-cabin-form").addEventListener("submit", event => {
      event.preventDefault();
      const berthsText = modal.querySelector("#vessel-cabin-berths").value.trim();
      const extraText = modal.querySelector("#vessel-cabin-extra").value.trim();
      const next = {
        ...draft,
        name: modal.querySelector("#vessel-cabin-name").value.trim(),
        deck: modal.querySelector("#vessel-cabin-deck").value.trim(),
        bed_layout: modal.querySelector("#vessel-cabin-layout").value.trim(),
        berths: berthsText === "" ? null : Number(berthsText),
        extra_berths: extraText === "" ? 0 : Number(extraText),
        on_request: modal.querySelector("#vessel-cabin-on-request").checked
      };
      const errors = core.cabinErrors(next, others);
      if (errors.length) {
        modal.querySelector("#vessel-cabin-error").textContent = errors[0];
        return;
      }
      const saved = { ...next, id: next.id || core.cabinIdFor(next.name, others) };
      markModalSaved(modal);
      closeDialogModal();
      onDone(saved);
    });
    modal.querySelector("[data-action='delete-cabin']")?.addEventListener("click", async () => {
      if (!await showAdminConfirm({
        title: "Delete Cabin",
        message: `Delete ${cabin.name}? Saving is refused while guests in a charter that hasn't ended are in it.`,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        tone: "danger"
      })) {
        return;
      }
      markModalSaved(modal);
      closeDialogModal();
      onDelete();
    });
  }
```

- [ ] **Step 2: Check the syntax**

Run: `node --check admin.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add admin.js
git commit -m "feat(admin): vessel cabin rows and the cabin dialog"
```

---

### Task 6: Specification rows

**Files:**
- Modify: `admin.js` (after `openVesselCabinModal`)

- [ ] **Step 1: Add the specification list**

```js
  // Label / value rows edited in place; drag to reorder.
  function drawVesselDetails() {
    const container = document.getElementById("vessel-details");
    if (!container) {
      return;
    }
    const details = state.vesselDraft.details;
    container.innerHTML = details.length ? "" : `<p class="muted">No specifications.</p>`;
    details.forEach((row, index) => {
      const element = document.createElement("div");
      element.className = "vessel-detail-row";
      element.innerHTML = `
        ${details.length > 1 ? dragHandleHtml(`Move ${row.label || "specification"}`, "vessel-detail-grip") : `<span class="vessel-grip-space"></span>`}
        <input class="vessel-detail-label" aria-label="Specification" value="${escapeAttribute(row.label)}" maxlength="40" placeholder="Length">
        <input class="vessel-detail-value" aria-label="Value" value="${escapeAttribute(row.value)}" maxlength="160" placeholder="45.7 m">
        ${iconButtonHtml("remove", "Remove specification", ` data-action="remove-detail"`)}
      `;
      element.querySelector(".vessel-detail-label").addEventListener("input", event => {
        setVesselDraft({ details: state.vesselDraft.details.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)) });
      });
      element.querySelector(".vessel-detail-value").addEventListener("input", event => {
        setVesselDraft({ details: state.vesselDraft.details.map((entry, i) => (i === index ? { ...entry, value: event.target.value } : entry)) });
      });
      element.querySelector("[data-action='remove-detail']").addEventListener("click", () => {
        setVesselDraft({ details: state.vesselDraft.details.filter((_, i) => i !== index) });
        drawVesselDetails();
        markVesselFormChanged();
      });
      container.appendChild(element);
    });
    window.IolantheDragReorder.attach(container, {
      items: () => [...container.querySelectorAll(":scope > .vessel-detail-row")],
      handleSelector: ".vessel-detail-grip",
      onMove: (from, to) => {
        setVesselDraft({ details: window.IolantheDragReorder.moveItem(state.vesselDraft.details, from, to) });
        drawVesselDetails();
        markVesselFormChanged();
      },
      afterMove: to => {
        container.querySelectorAll(":scope > .vessel-detail-row")[to]?.querySelector(".vessel-detail-grip")?.focus();
      }
    });
  }
```

- [ ] **Step 2: Check the syntax**

Run: `node --check admin.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add admin.js
git commit -m "feat(admin): vessel specification rows"
```

---

### Task 7: Notes sections and their dialog

**Files:**
- Modify: `admin.js` (after `drawVesselDetails`)

- [ ] **Step 1: Add the section list and dialog**

```js
  function drawVesselSections() {
    const core = window.IolantheVesselCore;
    const container = document.getElementById("vessel-sections");
    if (!container) {
      return;
    }
    const sections = state.vesselDraft.sections;
    container.innerHTML = sections.length ? "" : `<p class="muted">No notes sections.</p>`;
    sections.forEach((section, index) => {
      const row = document.createElement("div");
      row.className = "vessel-row";
      row.innerHTML = `
        ${sections.length > 1 ? dragHandleHtml(`Move ${section.title || "section"}`, "vessel-section-grip") : `<span class="vessel-grip-space"></span>`}
        <button type="button" class="vessel-row-open" title="Edit notes section">
          <strong>${escapeHtml(section.title || "Untitled section")}</strong>
          <span class="vessel-row-meta"></span>
          <span class="status-pill">${escapeHtml(core.itemsLabel(section.items.length))}</span>
          ${rowChevronHtml()}
        </button>
      `;
      row.querySelector(".vessel-row-open").addEventListener("click", () => {
        openVesselSectionModal(section, updated => {
          setVesselDraft({ sections: state.vesselDraft.sections.map((entry, i) => (i === index ? updated : entry)) });
          drawVesselSections();
          markVesselFormChanged();
        }, () => {
          setVesselDraft({ sections: state.vesselDraft.sections.filter((_, i) => i !== index) });
          drawVesselSections();
          markVesselFormChanged();
        });
      });
      container.appendChild(row);
    });
    window.IolantheDragReorder.attach(container, {
      items: () => [...container.querySelectorAll(":scope > .vessel-row")],
      handleSelector: ".vessel-section-grip",
      onMove: (from, to) => {
        setVesselDraft({ sections: window.IolantheDragReorder.moveItem(state.vesselDraft.sections, from, to) });
        drawVesselSections();
        markVesselFormChanged();
      },
      afterMove: to => {
        container.querySelectorAll(":scope > .vessel-row")[to]?.querySelector(".vessel-section-grip")?.focus();
      }
    });
  }

  function openVesselSectionModal(section, onDone, onDelete) {
    const core = window.IolantheVesselCore;
    const draft = section || { title: "", items: [] };
    const headerActionsHtml = `
      <div class="button-row modal-title-actions">
        ${iconSubmitButtonHtml("save", section ? "Done" : "Add section", ` form="vessel-section-form"`)}
        ${iconButtonHtml("cancel", "Cancel", ` data-modal-close`)}
        ${onDelete ? `<span class="header-sep"></span>${iconButtonHtml("remove", "Delete section", ` data-action="delete-section"`)}` : ""}
      </div>
    `;
    const modal = openDialogModal(section ? "Edit Notes Section" : "Add Notes Section", `
      <form id="vessel-section-form" class="form-grid">
        <label class="full">Title
          <input id="vessel-section-title" value="${escapeAttribute(draft.title)}" maxlength="60" data-autofocus>
        </label>
        <label class="full">Notes, one per line
          <textarea id="vessel-section-items" rows="10">${escapeHtml(core.sectionItemsToText(draft.items))}</textarea>
        </label>
        <p class="field-error full" id="vessel-section-error"></p>
      </form>
    `, { cardClass: "modal-welcome-message", hideClose: true, headerActionsHtml });
    modal.querySelector("#vessel-section-form").addEventListener("submit", event => {
      event.preventDefault();
      const next = {
        title: modal.querySelector("#vessel-section-title").value.trim(),
        items: core.sectionItemsFromText(modal.querySelector("#vessel-section-items").value)
      };
      const errors = core.sectionErrors(next);
      if (errors.length) {
        modal.querySelector("#vessel-section-error").textContent = errors[0];
        return;
      }
      markModalSaved(modal);
      closeDialogModal();
      onDone(next);
    });
    modal.querySelector("[data-action='delete-section']")?.addEventListener("click", async () => {
      if (!await showAdminConfirm({
        title: "Delete Notes Section",
        message: `Delete ${section.title || "this section"}?`,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        tone: "danger"
      })) {
        return;
      }
      markModalSaved(modal);
      closeDialogModal();
      onDelete();
    });
  }
```

- [ ] **Step 2: Check the syntax**

Run: `node --check admin.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add admin.js
git commit -m "feat(admin): vessel notes sections and their dialog"
```

---

### Task 8: Save, bind and the add buttons

**Files:**
- Modify: `admin.js` (after `openVesselSectionModal`)

- [ ] **Step 1: Add the save and the bind**

```js
  // Spec V §4.2: one save for the whole record. A stale revision offers a reload; other errors stay on the page.
  async function saveVesselSettings() {
    const core = window.IolantheVesselCore;
    const draft = core.normalizeVesselDraft(state.vesselDraft);
    const errors = core.validateVesselDraft(draft);
    if (errors.length) {
      throw new Error(errors[0].message);
    }
    try {
      const payload = await api("/api/admin/vessel/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: draft, base_revision: state.vesselRevision })
      });
      state.vessel = payload.vessel;
      setStatus("Vessel saved.", "ok");
    } catch (error) {
      if (error.status === 409 && error.payload && error.payload.code === "revision") {
        const reload = await showAdminConfirm({
          title: "Vessel Saved Elsewhere",
          message: `${error.message} Reload now? Your changes on this page will be lost.`,
          confirmLabel: "Reload",
          cancelLabel: "Keep Editing",
          tone: "warning"
        });
        if (reload) {
          setStatus("Reloaded the latest vessel record.", "ok");
          return;
        }
      }
      throw error;
    }
  }

  function bindVesselSettingsActions() {
    const core = window.IolantheVesselCore;
    drawVesselCabins();
    drawVesselDetails();
    drawVesselSections();
    document.getElementById("vessel-description")?.addEventListener("input", event => {
      setVesselDraft({ description: event.target.value });
    });
    document.getElementById("vessel-add-cabin")?.addEventListener("click", () => {
      openVesselCabinModal(null, created => {
        setVesselDraft({ cabins: core.sortCabinsByGroup(state.vesselDraft.cabins.concat([created])) });
        drawVesselCabins();
        markVesselFormChanged();
      });
    });
    document.getElementById("vessel-add-detail")?.addEventListener("click", () => {
      setVesselDraft({ details: state.vesselDraft.details.concat([{ label: "", value: "" }]) });
      drawVesselDetails();
      markVesselFormChanged();
      [...document.querySelectorAll("#vessel-details .vessel-detail-label")].pop()?.focus();
    });
    document.getElementById("vessel-add-section")?.addEventListener("click", () => {
      openVesselSectionModal(null, created => {
        setVesselDraft({ sections: state.vesselDraft.sections.concat([created]) });
        drawVesselSections();
        markVesselFormChanged();
      });
    });
    bindSettingsFormController({
      formId: "vessel-form",
      cancelButtonId: "vessel-cancel",
      readState: () => state.vesselDraft,
      save: saveVesselSettings,
      reload: renderSettings
    });
  }
```

- [ ] **Step 2: Check the syntax and the tests**

Run: `node --check admin.js` then `node --test`
Expected: no syntax output; 196 tests pass.

- [ ] **Step 3: Commit**

```bash
git add admin.js
git commit -m "feat(admin): save the vessel record, bind the tab"
```

---

### Task 9: Styles, asset versions, CLAUDE.md

**Files:**
- Modify: `admin.css`, `index.html`, `CLAUDE.md`

- [ ] **Step 1: Styles.** Append to `admin.css` before the first `@media` block that holds the phone rules (search `@media (max-width: 700px)`), a new block:

```css
/* Settings → Vessel (spec V): cabin and notes rows (a grip beside a tap-to-edit button), specification rows */
.vessel-section-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.6rem;
}

.vessel-section-header h3 {
  margin: 0;
}

.vessel-cabin-totals {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.vessel-group-title {
  margin: 0.8rem 0 0.35rem;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.vessel-list {
  display: grid;
  gap: 0.4rem;
}

.vessel-row,
.vessel-detail-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 0.4rem;
}

.vessel-detail-row {
  grid-template-columns: 32px minmax(8rem, 14rem) minmax(0, 1fr) var(--admin-icon-button-size);
}

.vessel-grip-space {
  width: 32px;
}

button.vessel-row-open {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) auto 20px;
  align-items: center;
  column-gap: 0.8rem;
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--ink);
  font-weight: 400;
  text-align: left;
  padding: 0.35rem 0.5rem 0.35rem 0.8rem;
}

button.vessel-row-open:hover,
button.vessel-row-open:focus {
  background: #e8eef0;
}

.vessel-row-meta {
  color: var(--muted);
  font-size: 0.86rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-pill.vessel-berths-unset {
  background: var(--warn-bg);
  color: var(--warn);
}

.vessel-subheading {
  margin: 1rem 0 0.4rem;
}
```

and inside the existing `@media (max-width: 700px)` block add:

```css
  button.vessel-row-open {
    grid-template-columns: minmax(0, 1fr) auto 20px;
  }

  .vessel-row-meta {
    grid-column: 1;
    grid-row: 2;
    white-space: normal;
  }

  .vessel-detail-row {
    grid-template-columns: 32px minmax(0, 1fr) var(--admin-icon-button-size);
  }

  .vessel-detail-value {
    grid-column: 2;
  }
```

- [ ] **Step 2: Asset versions.** Bump every `?v=` in `index.html` to one new tag (the repo's convention):

```bash
sed -i 's/?v=[a-z0-9-]*/?v=admin-vessel-v2/g' index.html
grep -o '?v=[a-z0-9-]*' index.html | sort | uniq -c
```

Expected: one line, `32 ?v=admin-vessel-v2` (31 before, plus `vessel-core.js`).

- [ ] **Step 3: CLAUDE.md.** In "Stack", after the `drag-reorder.js` bullet, add:

```markdown
- `vessel-core.js` — vessel record pure logic (spec V, also a Node module): the record rules (mirror of the server's
  `lib/vessel.js`, keep them in step), cabin ids, the cabin and notes-section checks, totals and labels, deck / layout
  suggestions, and group-aware reordering (standard cabins first, then on request). **Settings → Vessel** (`loadVesselSettings`,
  `renderVesselSettings`, `bindVesselSettingsActions`) edits the whole record in `state.vesselDraft` and saves it with
  `base_revision` to `POST /api/admin/vessel/save`; cabin and notes rows are a grip beside a tap-to-edit button, and the
  dialogs only change the draft.
```

and update the test count in the `node --test` bullet to the number `node --test` prints (196), adding `vessel-core` to the list of covered modules.

- [ ] **Step 4: Run the tests**

Run: `node --test`
Expected: 196 pass.

- [ ] **Step 5: Commit**

```bash
git add admin.css index.html CLAUDE.md
git commit -m "feat(admin): vessel tab styles, asset versions, docs"
```

---

### Task 10: Browser checks

Run against a scratch server on the V1 branch with this admin: in `GitHub/.claude/launch.json`, set the
`iolanthe-server-vessel` entry's `ADMIN_STATIC_DIR` to `S:\\Users\\David\\OneDrive\\Maker Space\\GitHub\\worktrees\\vessel-v2\\iolanthe-admin`
(its data is V1's migrated `worktrees/vessel/data-scratch-v`), start it with the preview tool, and sign in on
`vessel.localhost:8023` as in V1 Task 11 Step 4.

- [ ] **Step 1: The tab loads.** Settings → Vessel shows the five migrated cabins under Standard with "Berths not set"
  chips, "Standard: 5 cabins · 0 berths" (no on-request chip yet), the description, the specification rows and the notes
  sections. No console errors (`read_console_messages`).
- [ ] **Step 2: Cabins.** Add "Bridge Deck Cabin" (deck Bridge deck, Double, berths 2, on request) and "Saloon" (Main
  deck, Sofa bed, berths 2, on request): they appear under On request and the totals chips update. Edit Port Twin to
  berths 2, extra 1: its chip reads "2 +1". Drag State Room to the bottom of Standard. A duplicate name in the dialog
  shows "Another cabin already has this name." and keeps the dialog.
- [ ] **Step 3: Profile.** Change a specification value, add a row and remove another, drag one; open General Notes,
  add a line; edit the description.
- [ ] **Step 4: Save.** The header tick saves ("Vessel saved."). Reload the page: everything above is still there in
  the new order. `GET /api/admin/vessel` shows the revision went up by one.
- [ ] **Step 5: Guest site.** `GET /api/charter?key=…` (in the pane's console) shows the edited specification and note
  in `vessel.details` / `vessel.sections`, and no `cabins`.
- [ ] **Step 6: Unsaved guard.** Change a field, click the Weather tab: "Unsaved Changes" asks first; Cancel keeps the edit.
- [ ] **Step 7: Clash.** Open the tab in a second browser tab and save a change there; save a different change in the
  first: "Vessel Saved Elsewhere" offers Reload; Reload shows the second tab's change.
- [ ] **Step 8: Delete guard.** Give a guest in an upcoming charter a cabin through the API
  (`POST /api/admin/charter/<id>/save` with `file: "guest_list.json"` and that guest's `cabin_id` set), delete that
  cabin in the tab and save: the status line shows "… has guests in …. Move them to another cabin first." and the page
  keeps the unsaved draft. Discard (red cross) restores the cabin.
- [ ] **Step 9: Phone width.** At 375 px (`resize_window` preset mobile): rows stack (meta under the name), the
  specification value goes under its label, nothing scrolls sideways. Reset to desktop afterwards.
- [ ] **Step 10: Screenshot** the tab at 1024 px for the PR.

### Task 11: Review and PR

- [ ] **Step 1:** `node --test` passes; `node --check admin.js` is silent.
- [ ] **Step 2:** Run a code-review agent on the branch diff (model sonnet); apply what holds up; re-run the tests.
- [ ] **Step 3:** Merge `origin/main` if it moved (prefer merge over rebase in OneDrive worktrees); re-run the tests;
  re-bump the `?v=` strings if main bumped them.
- [ ] **Step 4:** Push and open the PR (`feat(admin): Settings → Vessel tab (spec V, V2)`), screenshot attached, body
  saying it needs the server's V1 and is released with V3 (the guest pages read cabins from the vessel record only from
  V3 on). Don't merge without David's word.
