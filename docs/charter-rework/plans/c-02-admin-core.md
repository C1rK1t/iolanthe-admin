# Spec C — Plan 2: Admin core (the merge engine and the revisioned saves)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply [spec-c.md](../spec-c.md) §3 to `iolanthe-admin`: a pure `merge-core.js` (three-way merge, the save
loop, labels, ids) and the admin's save helpers on top of it, so every save of the nine protected files sends
`base_revision`, merges a 409 silently where it can and hands a real clash to its caller.

**Architecture:** `merge-core.js` follows the `*-core.js` pattern (browser global `IolantheMerge`, Node module, no
DOM) with `node --test` coverage. In `admin.js`, `saveRevisioned` wraps `saveWithRebase` around `api()`;
`saveCharterFile` (the five charter files), `saveLibraryCopy` (drink stocks, Available Alcohol, cocktails) and
`saveSitesLibrary` use it. The merge base of a charter file is `state.bundle[file]`; a library file's base is kept per
working copy in a `WeakMap` (`libraryBases`), the sites' in `sitesBase`. The clash helpers (`recordClash`,
`pageClash`, `showClashMarks`, `showListClash`, `confirmDeleteAnyway`) are added here and used by plan c-03. After a
clash the working copy holds theirs, so a stale copy is never sent with the new revision. Pages are unchanged in this
plan: until c-03, a clash reports on the status line and redraws the section.

**Tech Stack:** plain JS, no build, `node --test` (185 tests → 207).

**Preconditions:** admin PR #39 (`fix/admin-password-hashing`) is merged: this plan's OLD blocks are written
against `main` with it. **Release order:** server plan c-01 first, this admin straight after (the new server refuses
the old admin's saves, which send no `base_revision`, until the tab reloads the new admin).

**Dry-run (done while planning, for plans c-02 and c-03 together):** the plan text was applied to a `git archive` copy
of admin PR #39's branch at `10ab701` (it has `main` at `e42f9df` merged in): `node --test` 207/207 and `node --check
admin.js` clean. The `?v=` step is a `sed` over every tag, so it does not depend on the tag #39 lands with. The result was served by a
scratch server running plan c-01's code on a copy of `data-scratch`, with a Node script playing the other person
(saving through the API with its own Charter or Hotel session). Browser pass, every item as designed:
- **Crew:** a silent merge ("Crew member saved. · merged with Charter Admin's change from 14:54", both edits listed);
  a clash on the same role (the dialog reopened on their member with the amber banner, a teal edge on my role and note,
  "↳ Charter Admin wrote: Chief Bosun"; Save stored mine at the next revision); a member deleted elsewhere while I
  edited (the list without them, "deleted PJ at 15:07. Save to add it back.", Save brought PJ back).
- **Hotel → Guests:** a clash on allergies with Hotel ("Hotel changed Guest 1 at 15:04", edges on preferred name and
  allergies, "↳ Hotel wrote: Nuts, shellfish"); Cancel kept Hotel's copy.
- **Charter Admin:** a page clash (their preference note merged in silently; my notes and flight on top, marked, the
  form unsaved; Save stored both).
- **Drink Stocks:** delete against change ("Hotel changed Absolut Mandrin … Delete anyway?", Delete removed it).
- **Galley menus:** both reordered ("Menu day moved. · merged with Charter Admin's change from 15:07 · the other order
  was replaced"; stored day numbers 1–9 match the positions).
- **Site Editor:** a clash reopened the dialog on their site with my description on top and their text as the hint;
  Save stored mine.
- **Cocktails:** a page clash (the banner, my description on top, the row edged with Hotel's value as its tooltip).
- **Freshness:** with Drink Stocks open and clean, another save moved Peach from 80 % to 50 %; a `visibilitychange`
  redrew the page ("Updated with changes saved elsewhere.").
- No console errors (only the expected 409 responses). The Crew clash was repeated on the final build: only the
  field I changed is edged (blank values compare equal, SC-D13).

**Shared checkout hazard:** other Claude sessions may work in the same checkouts. **Never** run `git checkout`,
`git switch`, `git stash` or `git add -A` in the main checkouts under `S:/Users/David/OneDrive/Maker Space/GitHub`. All
work happens in the worktree made in Task 0. Stage files by name. Before each task, run
`git -C <worktree> branch --show-current` and expect `feat/spec-c-admin`.

**Reading before you start (in the worktree):** `charters-core.js` (the module pattern), `admin.js` `api` (~150),
`saveCharterFile` (~13950), `loadDrinkStocks` … `saveCocktails` (~8550–8630), `loadSites` (~3540), `saveSitesLibrary`
(~4650), `normalizeGuestList` (~3683), `normalizeGuestListForCount` (~3864), `normalizeCocktailItem` (~13470).

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `merge-core.js` (new) + `test/merge-core.test.js` (new) | Task 1: `SCHEMAS`, `same`, `merge3`, `clashFields`, `changedFields`, `saveWithRebase`, labels, `newId`, `withSlotIds` |
| `admin.js` | Task 2: the revisioned saves, the library bases, the clash helpers, ids on cocktails and g-slot guests |
| `index.html`, `admin.css` | Task 3: `merge-core.js` loads before `admin.js`; every `?v=`; the clash banner and field marks |

---

### Task 0: Worktree (this session runs it, not an implementer)

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin"
git fetch -q origin
git log -1 --oneline origin/main   # must contain PR #39's merge
git worktree add "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-c-build/portal/iolanthe-admin" -b feat/spec-c-admin origin/main
cd "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/spec-c-build/portal/iolanthe-admin" && node --test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected `ℹ pass 185`, `ℹ fail 0`. Every path below is relative to this worktree.

---

### Task 1: `merge-core.js` and its tests

**Files:** create `test/merge-core.test.js`, create `merge-core.js`

- [ ] **Step 1: Write the failing test.** Create `test/merge-core.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../merge-core.js");

const S = core.SCHEMAS;
const fred = { id: "c-fred", name: "Fred", position: "Steward", description: "" };
const ana = { id: "c-ana", name: "Ana", position: "Chef", description: "" };
const ben = { id: "c-ben", name: "Ben", position: "Deckhand", description: "" };
const crewFile = (crew, revision = 4) => ({ crew, revision, saved_by: "hotel", saved_at: "2026-11-03T06:02:00.000Z" });

test("same: deep, ignores key order, missing = undefined", () => {
  assert.ok(core.same({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }));
  assert.ok(core.same({ a: 1, b: undefined }, { a: 1 }));
  assert.ok(core.same({ a: 1, b: null }, { a: 1 }), "null = missing");
  assert.ok(core.same({ a: 1, b: "" }, { a: 1 }), "\"\" = missing");
  assert.ok(!core.same({ a: 0 }, { a: null }));
  assert.ok(!core.same({ a: 1 }, { a: "1" }));
  assert.ok(!core.same([1, 2], [2, 1]));
});

test("edits to different records merge with no clash", () => {
  const base = crewFile([fred, ana]);
  const mine = crewFile([{ ...fred, position: "Head of Interior" }, ana]);
  const theirs = crewFile([fred, { ...ana, description: "Joins day 3" }], 5);
  const result = core.merge3(base, mine, theirs, S.crew);
  assert.deepEqual(result.clashes, []);
  assert.deepEqual(result.merged.crew, [{ ...fred, position: "Head of Interior" }, { ...ana, description: "Joins day 3" }]);
  assert.equal(result.merged.revision, 5, "theirs' stamp");
  assert.deepEqual(result.rebased, result.merged);
});

test("different fields of the same record merge", () => {
  const base = crewFile([fred]);
  const mine = crewFile([{ ...fred, description: "Joins in Coron" }]);
  const theirs = crewFile([{ ...fred, position: "Chief Steward" }], 5);
  const result = core.merge3(base, mine, theirs, S.crew);
  assert.deepEqual(result.clashes, []);
  assert.deepEqual(result.merged.crew, [{ ...fred, position: "Chief Steward", description: "Joins in Coron" }]);
});

test("the same field changed differently is a clash: merged keeps theirs, rebased keeps mine", () => {
  const base = crewFile([fred]);
  const mine = crewFile([{ ...fred, position: "Head of Interior", description: "Joins in Coron" }]);
  const theirs = crewFile([{ ...fred, position: "Chief Steward" }], 5);
  const result = core.merge3(base, mine, theirs, S.crew);
  assert.deepEqual(result.clashes, [{ kind: "field", list: "crew", key: "c-fred", parent: null, field: "position", base: "Steward", mine: "Head of Interior", theirs: "Chief Steward" }]);
  assert.equal(result.merged.crew[0].position, "Chief Steward");
  assert.equal(result.merged.crew[0].description, "Joins in Coron");
  assert.equal(result.rebased.crew[0].position, "Head of Interior");
  assert.deepEqual(core.clashFields(result.clashes, "crew", "c-fred"), { position: "Chief Steward" });
});

test("the same change on both sides is not a clash", () => {
  const base = crewFile([fred]);
  const both = crewFile([{ ...fred, position: "Purser" }]);
  assert.deepEqual(core.merge3(base, both, { ...both, revision: 5 }, S.crew).clashes, []);
});

test("delete against change, both ways", () => {
  const base = crewFile([fred, ana]);
  const iDeleted = core.merge3(base, crewFile([ana]), crewFile([{ ...fred, position: "Purser" }, ana], 5), S.crew);
  assert.deepEqual(iDeleted.clashes.map((c) => [c.kind, c.key]), [["deleted-by-me", "c-fred"]]);
  assert.deepEqual(iDeleted.merged.crew.map((m) => m.id), ["c-fred", "c-ana"], "merged keeps theirs");
  assert.deepEqual(iDeleted.rebased.crew.map((m) => m.id), ["c-ana"], "rebased = delete anyway");

  const theyDeleted = core.merge3(base, crewFile([{ ...fred, position: "Purser" }, ana]), crewFile([ana], 5), S.crew);
  assert.deepEqual(theyDeleted.clashes.map((c) => [c.kind, c.key]), [["deleted-by-them", "c-fred"]]);
  assert.deepEqual(theyDeleted.merged.crew.map((m) => m.id), ["c-ana"]);
  assert.deepEqual(theyDeleted.rebased.crew.map((m) => m.id), ["c-fred", "c-ana"], "rebased = add back, in my place");
});

test("a delete nobody else touched just applies, from either side", () => {
  const base = crewFile([fred, ana]);
  assert.deepEqual(core.merge3(base, crewFile([ana]), crewFile([fred, ana], 5), S.crew).merged.crew, [ana]);
  assert.deepEqual(core.merge3(base, crewFile([fred, ana]), crewFile([ana], 5), S.crew).merged.crew, [ana]);
});

test("adds on both sides are kept, each after the record it followed", () => {
  const base = crewFile([fred, ana]);
  const mine = crewFile([fred, ben, ana]);
  const zoe = { id: "c-zoe", name: "Zoe" };
  const theirs = crewFile([fred, ana, zoe], 5);
  const result = core.merge3(base, mine, theirs, S.crew);
  assert.deepEqual(result.clashes, []);
  assert.deepEqual(result.merged.crew.map((m) => m.id), ["c-fred", "c-ben", "c-ana", "c-zoe"]);
  const first = core.merge3(crewFile([fred]), crewFile([ben, fred]), crewFile([fred], 5), S.crew);
  assert.deepEqual(first.merged.crew.map((m) => m.id), ["c-ben", "c-fred"], "an add at the top stays first");
});

test("order: only I reordered -> mine; only they -> theirs; both -> mine with a note", () => {
  const base = crewFile([fred, ana, ben]);
  const onlyMine = core.merge3(base, crewFile([ben, fred, ana]), crewFile([fred, { ...ana, position: "Sous" }, ben], 5), S.crew);
  assert.deepEqual(onlyMine.merged.crew.map((m) => m.id), ["c-ben", "c-fred", "c-ana"]);
  assert.equal(onlyMine.merged.crew[2].position, "Sous");
  assert.deepEqual(onlyMine.notes, []);
  const onlyTheirs = core.merge3(base, crewFile([{ ...fred, position: "Purser" }, ana, ben]), crewFile([ana, ben, fred], 5), S.crew);
  assert.deepEqual(onlyTheirs.merged.crew.map((m) => m.id), ["c-ana", "c-ben", "c-fred"]);
  const both = core.merge3(base, crewFile([ben, ana, fred]), crewFile([ana, fred, ben], 5), S.crew);
  assert.deepEqual(both.merged.crew.map((m) => m.id), ["c-ben", "c-ana", "c-fred"]);
  assert.deepEqual(both.notes, [{ kind: "order-replaced", list: "crew" }]);
  assert.deepEqual(both.clashes, []);
});

test("Guest Alcohol: sections by category, items by stock_id", () => {
  const wine = (items) => ({ category: "Wine", items });
  const base = { sections: [wine([{ stock_id: "a" }, { stock_id: "b" }, { stock_id: "c" }])], revision: 1 };
  const mine = { sections: [wine([{ stock_id: "c" }, { stock_id: "a" }, { stock_id: "b" }])], revision: 1 };
  const theirs = { sections: [wine([{ stock_id: "a" }, { stock_id: "b", description: "Chilled" }, { stock_id: "c" }]), { category: "Spirits", items: [{ stock_id: "s" }] }], revision: 2 };
  const result = core.merge3(base, mine, theirs, S.guestDrinks);
  assert.deepEqual(result.clashes, []);
  assert.deepEqual(result.merged.sections.map((s) => s.category), ["Wine", "Spirits"]);
  assert.deepEqual(result.merged.sections[0].items, [{ stock_id: "c" }, { stock_id: "a" }, { stock_id: "b", description: "Chilled" }]);
  const clash = core.merge3(base,
    { sections: [wine([{ stock_id: "a", description: "Mine" }, { stock_id: "b" }, { stock_id: "c" }])] },
    { sections: [wine([{ stock_id: "a", description: "Theirs" }, { stock_id: "b" }, { stock_id: "c" }])], revision: 2 }, S.guestDrinks);
  assert.equal(clash.clashes.length, 1);
  assert.deepEqual([clash.clashes[0].list, clash.clashes[0].key, clash.clashes[0].field, clash.clashes[0].parent.key], ["items", "a", "description", "wine"]);
});

test("menus: a day drag plus a dish edit merge (derived fields ignored)", () => {
  const day = (id, n, dinner) => ({ id, order: n, day: n, charter_day: n, label: `Day ${n}`, date: null, dinner });
  const base = { menus: [day("m-1", 1, ["Beef"]), day("m-2", 2, ["Fish"]), day("m-3", 3, ["Pasta"])], revision: 3 };
  const mine = { menus: [day("m-2", 1, ["Fish"]), day("m-3", 2, ["Pasta"]), day("m-1", 3, ["Beef"])], revision: 3 };
  const theirs = { menus: [day("m-1", 1, ["Beef"]), day("m-2", 2, ["Fish", "Tart"]), day("m-3", 3, ["Pasta"])], revision: 4 };
  const result = core.merge3(base, mine, theirs, S.menus);
  assert.deepEqual(result.clashes, []);
  assert.deepEqual(result.merged.menus.map((m) => m.id), ["m-2", "m-3", "m-1"]);
  assert.deepEqual(result.merged.menus[0].dinner, ["Fish", "Tart"]);
  assert.deepEqual(result.merged.menus.map((m) => m.day), [1, 2, 3], "my order won, so my day numbers");
  const theirOrder = core.merge3(base,
    { menus: [day("m-1", 1, ["Beef", "Soup"]), base.menus[1], base.menus[2]], revision: 3 },
    { menus: [day("m-3", 1, ["Pasta"]), day("m-1", 2, ["Beef"]), day("m-2", 3, ["Fish"])], revision: 4 }, S.menus);
  assert.deepEqual(theirOrder.merged.menus.map((m) => [m.id, m.day]), [["m-3", 1], ["m-1", 2], ["m-2", 3]], "their order won, so their day numbers");
  assert.deepEqual(theirOrder.merged.menus[1].dinner, ["Beef", "Soup"]);
  const both = core.merge3(base,
    { menus: [day("m-1", 1, ["Beef", "Soup"]), base.menus[1], base.menus[2]] },
    { menus: [day("m-1", 1, ["Lamb"]), base.menus[1], base.menus[2]], revision: 4 }, S.menus);
  assert.deepEqual(both.clashes.map((c) => [c.key, c.field]), [["m-1", "dinner"]], "a day's dishes are one field");
});

test("charter.json: top-level fields", () => {
  const base = { name: "Csaba", guest_count: 4, notes: "", arrival: { time: "14:00" }, revision: 2 };
  const result = core.merge3(base, { ...base, notes: "VIP" }, { ...base, guest_count: 5, revision: 3 }, S.charter);
  assert.deepEqual(result.clashes, []);
  assert.deepEqual([result.merged.notes, result.merged.guest_count, result.merged.revision], ["VIP", 5, 3]);
  const clash = core.merge3(base, { ...base, arrival: { time: "15:00" } }, { ...base, arrival: { time: "16:00" }, revision: 3 }, S.charter);
  assert.deepEqual(clash.clashes.map((c) => [c.list, c.key, c.field]), [[null, null, "arrival"]]);
  assert.deepEqual(core.clashFields(clash.clashes, null, null), { arrival: { time: "16:00" } });
});

test("a list whose records have no keys merges as one field", () => {
  const base = { crew: [{ name: "Fred" }] };
  assert.deepEqual(core.merge3(base, { crew: [{ name: "Fred" }, { name: "Ana" }] }, base, S.crew).merged.crew, [{ name: "Fred" }, { name: "Ana" }]);
  const clash = core.merge3(base, { crew: [{ name: "A" }] }, { crew: [{ name: "B" }] }, S.crew);
  assert.deepEqual(clash.clashes.map((c) => [c.list, c.key, c.field]), [[null, null, "crew"]]);
});

test("merge3 does not mutate its inputs", () => {
  const base = crewFile([fred, ana]);
  const mine = crewFile([{ ...fred, position: "X" }, ana]);
  const theirs = crewFile([fred, ana, ben], 5);
  const copies = JSON.stringify([base, mine, theirs]);
  const result = core.merge3(base, mine, theirs, S.crew);
  result.merged.crew[0].name = "changed";
  assert.equal(JSON.stringify([base, mine, theirs]), copies);
});

test("changedFields", () => {
  assert.deepEqual(core.changedFields(fred, { ...fred, position: "X", note: "n", revision: 9 }), ["position", "note"]);
  assert.deepEqual(core.changedFields({ day: 1, dinner: [] }, { day: 2, dinner: [] }, ["day"]), []);
});

function conflict(data) {
  const error = new Error("Someone else saved this (revision 5).");
  error.status = 409;
  error.payload = { code: "revision", revision: data.revision, saved_by: "hotel", saved_at: "2026-11-03T06:02:00.000Z", data };
  return error;
}

test("saveWithRebase: a clean save", async () => {
  const sent = [];
  const result = await core.saveWithRebase({
    send: async (data, base) => { sent.push(base); return { ...data, revision: base + 1 }; },
    base: crewFile([fred]), mine: crewFile([ben]), schema: S.crew
  });
  assert.deepEqual(sent, [4]);
  assert.equal(result.ok, true);
  assert.equal(result.mergedWith, null);
  assert.equal(result.saved.revision, 5);
});

test("saveWithRebase: a 409 merges and sends again with the new revision", async () => {
  const theirs = crewFile([fred, { ...ana, position: "Sous" }], 5);
  const sent = [];
  const result = await core.saveWithRebase({
    send: async (data, base) => {
      sent.push([base, data.crew.map((m) => m.position)]);
      if (base === 4) throw conflict(theirs);
      return { ...data, revision: 6 };
    },
    base: crewFile([fred, ana]), mine: crewFile([{ ...fred, position: "Purser" }, ana]), schema: S.crew
  });
  assert.deepEqual(sent, [[4, ["Purser", "Chef"]], [5, ["Purser", "Sous"]]]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.mergedWith, { savedBy: "hotel", savedAt: "2026-11-03T06:02:00.000Z" });
});

test("saveWithRebase: a clash stops and returns both copies", async () => {
  const theirs = crewFile([{ ...fred, position: "Chief Steward" }], 5);
  let calls = 0;
  const result = await core.saveWithRebase({
    send: async () => { calls += 1; throw conflict(theirs); },
    base: crewFile([fred]), mine: crewFile([{ ...fred, position: "Purser" }]), schema: S.crew
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.clashes.length, 1);
  assert.equal(result.theirs, theirs);
  assert.equal(result.rebased.crew[0].position, "Purser");
  assert.equal(result.savedBy, "hotel");
});

test("saveWithRebase: gives up after three rounds; other errors pass through", async () => {
  let revision = 4;
  await assert.rejects(core.saveWithRebase({
    send: async () => { revision += 1; throw conflict(crewFile([fred, { id: `c-${revision}`, name: "x" }], revision)); },
    base: crewFile([fred]), mine: crewFile([fred, ben]), schema: S.crew
  }), (error) => error.status === 409);
  assert.equal(revision, 7, "three sends");
  const plain = new Error("Section not allowed");
  plain.status = 403;
  await assert.rejects(core.saveWithRebase({ send: async () => { throw plain; }, base: {}, mine: {}, schema: S.charter }), plain);
});

test("saveWithRebase: normalize runs on base and theirs, so a page's defaults are not taken for my change", async () => {
  // The page fills a missing cabin with "N/A" (mine); the stored copies lack it (base) or set it (theirs).
  const fill = (copy) => ({ ...copy, guests: (copy.guests || []).map((g) => ({ cabin: "N/A", ...g })) });
  const bare = { id: "g-1", full_name: "James" };
  const theirs = { guests: [{ ...bare, cabin: "Suite 2" }], revision: 5, saved_by: "hotel", saved_at: "2026-11-03T06:02:00.000Z" };
  const sent = [];
  const send = async (data, base) => {
    sent.push(data);
    if (base === 4) throw conflict(theirs);
    return data;
  };
  const mine = { guests: [{ ...bare, cabin: "N/A", preferred_name: "Jim" }], revision: 4 };
  const result = await core.saveWithRebase({ send, base: { guests: [bare], revision: 4 }, mine, schema: S.guests, normalize: fill });
  assert.equal(result.ok, true);
  assert.deepEqual(sent[1].guests[0], { id: "g-1", full_name: "James", cabin: "Suite 2", preferred_name: "Jim" });
  assert.equal(sent[1].revision, 5, "the stamp survives the normaliser");
  const without = await core.saveWithRebase({ send: async () => { throw conflict(theirs); }, base: { guests: [bare], revision: 4 }, mine, schema: S.guests });
  assert.equal(without.ok, false, "without normalize the filled default clashes");
});

test("labels and summaries", () => {
  const now = new Date(2026, 10, 3, 18, 0);
  assert.equal(core.departmentLabel("hotel"), "Hotel");
  assert.equal(core.departmentLabel("charter"), "Charter Admin");
  assert.equal(core.departmentLabel(""), "Someone");
  assert.equal(core.timeLabel(new Date(2026, 10, 3, 14, 2).toISOString(), now), "14:02");
  assert.equal(core.timeLabel(new Date(2026, 10, 2, 9, 5).toISOString(), now), "Mon 2 Nov, 09:05");
  assert.equal(core.timeLabel("", now), "");
  const at = new Date(2026, 10, 3, 14, 2).toISOString();
  assert.equal(core.savedStatus("Crew member saved.", { mergedWith: { savedBy: "hotel", savedAt: at }, notes: [] }, now), "Crew member saved. · merged with Hotel's change from 14:02");
  assert.equal(core.savedStatus("Saved.", { mergedWith: { savedBy: "galley", savedAt: at }, notes: [{ kind: "order-replaced", list: "menus" }] }, now), "Saved. · merged with Galley's change from 14:02 · the other order was replaced");
  assert.equal(core.savedStatus("Saved.", { mergedWith: null }), "Saved.");
  assert.equal(core.valueSummary(""), "(empty)");
  assert.equal(core.valueSummary(true), "Yes");
  assert.equal(core.valueSummary([{ name: "Beef" }, { name: "Tart" }]), "2 items: Beef, Tart");
  assert.equal(core.valueSummary([]), "(none)");
  assert.equal(core.valueSummary("x".repeat(100)).length, 80);
});

test("newId and withSlotIds mirror the server", () => {
  assert.match(core.newId("c"), /^c-[0-9a-z]{8}$/);
  const guests = [{ id: "g-aaaa0001" }, { full_name: "" }, { id: "g-slot-3" }, { full_name: "" }];
  assert.deepEqual(core.withSlotIds(guests).map((g) => g.id), ["g-aaaa0001", "g-slot-2", "g-slot-3", "g-slot-4"]);
  assert.deepEqual(core.withSlotIds([{}, { id: "g-slot-1" }]).map((g) => g.id), ["g-slot-2", "g-slot-1"]);
  assert.equal(guests[1].id, undefined);
});
```

- [ ] **Step 2: Run it and watch it fail.** `node --test test/merge-core.test.js` → fails with `Cannot find module '../merge-core.js'`.

- [ ] **Step 3: Write the module.** Create `merge-core.js`:

```js
// Conflict-safe saves (charter rework spec C §3): the three-way merge and the save loop, shared by admin.js (browser)
// and test/merge-core.test.js (node --test). No DOM here.
// base = the copy the admin last got from the server, mine = what it was about to send, theirs = the stored copy a 409
// returned. Records in keyed lists merge field by field; a field both sides changed differently is a clash.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheMerge = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STAMP_KEYS = ["revision", "saved_by", "saved_at"];
  const MAX_ROUNDS = 3;
  const DEPARTMENT_LABELS = { charter: "Charter Admin", galley: "Galley", hotel: "Hotel", system: "The server" };
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

  const sectionKey = (section) => String((section && (section.category || section.title)) || "").trim().toLocaleLowerCase();
  const stockKey = (item) => String((item && item.stock_id) || "").trim().toLocaleLowerCase();

  // One schema per protected file (spec C §3.1): the keyed lists, and fields recomputed from position.
  const SCHEMAS = Object.freeze({
    charter: {},
    crew: { lists: { crew: { key: "id" } } },
    guests: { lists: { guests: { key: "id" } } },
    menus: { lists: { menus: { key: "id", derived: ["order", "day", "charter_day", "label", "date"] } } },
    guestDrinks: { lists: { sections: { key: sectionKey, lists: { items: { key: stockKey } } } } },
    availableAlcohol: { lists: { items: { key: stockKey } } },
    drinkStocks: { lists: { items: { key: "id" } } },
    cocktails: { lists: { cocktails: { key: "id" } } },
    sites: { lists: { sites: { key: "id" } } }
  });

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  // Deep equality that ignores key order; a missing key, undefined, null and "" are the same (an editor writes null or
  // "" for a field the stored record leaves out).
  const blank = (value) => value === undefined || value === null || value === "";

  function same(a, b) {
    if (a === b || (blank(a) && blank(b))) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => same(item, b[index]));
    }
    if (isRecord(a) && isRecord(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        if (!same(a[key], b[key])) return false;
      }
      return true;
    }
    return false;
  }

  function revisionOf(data) {
    const revision = isRecord(data) ? data.revision : undefined;
    return Number.isInteger(revision) && revision >= 0 ? revision : 0;
  }

  function keyFn(spec) {
    return typeof spec.key === "function" ? spec.key : (record) => (isRecord(record) && typeof record[spec.key] === "string" ? record[spec.key] : "");
  }

  function setField(target, field, value) {
    if (value === undefined) {
      delete target[field];
    } else {
      target[field] = value;
    }
  }

  // Merges the fields of one record or of the top level. ctx: { list, key, parent } for clash reports.
  function mergeFields(base, mine, theirs, spec, ctx, out) {
    const b = isRecord(base) ? base : {};
    const m = isRecord(mine) ? mine : {};
    const t = isRecord(theirs) ? theirs : {};
    const lists = spec.lists || {};
    const skip = new Set([...STAMP_KEYS, ...(spec.derived || [])]);
    const merged = {};
    const rebased = {};
    const fields = [...new Set([...Object.keys(t), ...Object.keys(m), ...Object.keys(b)])];
    for (const field of fields) {
      if (skip.has(field)) {
        // Derived fields (a menu's day number) follow the side whose order won, so they match the positions.
        const kept = spec.derivedFrom === "mine" ? (field in m ? m[field] : t[field]) : (field in t ? t[field] : m[field]);
        if (!STAMP_KEYS.includes(field)) {
          setField(merged, field, kept);
          setField(rebased, field, kept);
        }
        continue;
      }
      if (lists[field]) {
        const result = mergeList(b[field], m[field], t[field], lists[field], { list: field, parent: ctx.key === undefined ? null : ctx }, out);
        merged[field] = result.merged;
        rebased[field] = result.rebased;
        continue;
      }
      const mineChanged = !same(m[field], b[field]);
      const theirsChanged = !same(t[field], b[field]);
      if (!mineChanged) {
        setField(merged, field, t[field]);
        setField(rebased, field, t[field]);
      } else if (!theirsChanged || same(m[field], t[field])) {
        setField(merged, field, m[field]);
        setField(rebased, field, m[field]);
      } else {
        out.clashes.push({ kind: "field", list: ctx.list || null, key: ctx.key === undefined ? null : ctx.key, parent: ctx.parent || null, field, base: b[field], mine: m[field], theirs: t[field] });
        setField(merged, field, t[field]);
        setField(rebased, field, m[field]);
      }
    }
    return { merged, rebased };
  }

  // True when my list changed the order of the records all three copies share.
  function mineReorderedKeys(baseKeys, mineKeys, theirsKeys) {
    const common = (keys) => keys.filter((key) => baseKeys.includes(key) && mineKeys.includes(key) && theirsKeys.includes(key));
    return !same(common(mineKeys), common(baseKeys));
  }

  // Order: the side that reordered wins (mine if both did, with a note); records only on the other side follow the
  // record they followed in their own list.
  function orderKeys(survivors, baseKeys, mineKeys, theirsKeys, listName, out, noteOnce) {
    const common = (keys) => keys.filter((key) => baseKeys.includes(key) && mineKeys.includes(key) && theirsKeys.includes(key));
    const mineReordered = mineReorderedKeys(baseKeys, mineKeys, theirsKeys);
    const theirsReordered = !same(common(theirsKeys), common(baseKeys));
    if (mineReordered && theirsReordered && noteOnce) {
      out.notes.push({ kind: "order-replaced", list: listName });
    }
    const primary = mineReordered ? mineKeys : theirsKeys;
    const secondary = mineReordered ? theirsKeys : mineKeys;
    const result = primary.filter((key) => survivors.has(key));
    let previous = null;
    for (const key of secondary) {
      if (survivors.has(key) && !result.includes(key)) {
        result.splice(previous === null ? 0 : result.indexOf(previous) + 1, 0, key);
      }
      if (result.includes(key)) previous = key;
    }
    return result;
  }

  function mergeList(baseList, mineList, theirsList, spec, ctx, out) {
    const lists = [baseList, mineList, theirsList].map((list) => (Array.isArray(list) ? list : []));
    const keyOf = keyFn(spec);
    const keyed = lists.every((list) => list.every((record) => isRecord(record) && keyOf(record)));
    if (!keyed) {
      // Records without keys cannot be matched: the list merges as one field of its parent.
      const [b, m, t] = lists;
      if (same(m, b)) return { merged: t, rebased: t };
      if (same(t, b) || same(m, t)) return { merged: m, rebased: m };
      const owner = ctx.parent || {};
      out.clashes.push({ kind: "field", list: owner.list || null, key: owner.key === undefined ? null : owner.key, parent: owner.parent || null, field: ctx.list, base: b, mine: m, theirs: t });
      return { merged: t, rebased: m };
    }
    const [B, M, T] = lists.map((list) => new Map(list.map((record) => [keyOf(record), record])));
    const allKeys = [...new Set([...T.keys(), ...M.keys(), ...B.keys()])];
    const mergedRecords = new Map();
    const rebasedRecords = new Map();
    const [baseKeys, mineKeys, theirsKeys] = lists.map((list) => list.map(keyOf));
    const recordSpec = { lists: spec.lists, derived: spec.derived, derivedFrom: mineReorderedKeys(baseKeys, mineKeys, theirsKeys) ? "mine" : "theirs" };
    for (const key of allKeys) {
      const b = B.get(key);
      const m = M.get(key);
      const t = T.get(key);
      const recordCtx = { list: ctx.list, key, parent: ctx.parent };
      if (m && t) {
        const result = mergeFields(b || {}, m, t, recordSpec, recordCtx, out);
        mergedRecords.set(key, result.merged);
        rebasedRecords.set(key, result.rebased);
      } else if (b && m && !t) {
        if (!same(m, b)) {
          out.clashes.push({ kind: "deleted-by-them", list: ctx.list, key, parent: ctx.parent || null, mine: m });
          rebasedRecords.set(key, m);
        }
      } else if (b && !m && t) {
        if (!same(t, b)) {
          out.clashes.push({ kind: "deleted-by-me", list: ctx.list, key, parent: ctx.parent || null, theirs: t });
          mergedRecords.set(key, t);
        }
      } else if (!b && m) {
        mergedRecords.set(key, m);
        rebasedRecords.set(key, m);
      } else if (!b && t) {
        mergedRecords.set(key, t);
        rebasedRecords.set(key, t);
      }
    }
    const mergedOrder = orderKeys(new Set(mergedRecords.keys()), baseKeys, mineKeys, theirsKeys, ctx.list, out, true);
    const rebasedOrder = orderKeys(new Set(rebasedRecords.keys()), baseKeys, mineKeys, theirsKeys, ctx.list, out, false);
    return {
      merged: mergedOrder.map((key) => mergedRecords.get(key)),
      rebased: rebasedOrder.map((key) => rebasedRecords.get(key))
    };
  }

  // -> { merged, rebased, clashes, notes }. merged keeps theirs where we clash (what the server would hold if mine were
  // dropped); rebased keeps mine there (what saving again means). Both carry theirs' stamp. Inputs are not mutated.
  function merge3(base, mine, theirs, schema) {
    const out = { clashes: [], notes: [] };
    const result = mergeFields(base, mine, theirs, schema || {}, {}, out);
    const stamp = {};
    STAMP_KEYS.forEach((key) => {
      if (isRecord(theirs) && theirs[key] !== undefined) stamp[key] = theirs[key];
    });
    return {
      merged: JSON.parse(JSON.stringify({ ...result.merged, ...stamp })),
      rebased: JSON.parse(JSON.stringify({ ...result.rebased, ...stamp })),
      clashes: out.clashes,
      notes: out.notes
    };
  }

  // The fields of one record both sides changed: { field: theirs value }.
  function clashFields(clashes, list, key) {
    const fields = {};
    (clashes || []).forEach((clash) => {
      if (clash.kind === "field" && clash.list === (list || null) && clash.key === (key === undefined ? null : key)) {
        fields[clash.field] = clash.theirs;
      }
    });
    return fields;
  }

  // The fields of a record I changed against the copy I started from (stamp and derived fields left out).
  function changedFields(base, mine, skip) {
    const b = isRecord(base) ? base : {};
    const m = isRecord(mine) ? mine : {};
    const ignore = new Set([...STAMP_KEYS, ...(skip || [])]);
    return [...new Set([...Object.keys(b), ...Object.keys(m)])].filter((field) => !ignore.has(field) && !same(b[field], m[field]));
  }

  // A copy run through a page's normaliser, keeping its stamp (some normalisers rebuild the object without it).
  function normalized(copy, normalize) {
    if (typeof normalize !== "function" || !isRecord(copy)) return copy;
    const stamp = {};
    STAMP_KEYS.forEach((key) => {
      if (copy[key] !== undefined) stamp[key] = copy[key];
    });
    return { ...normalize(JSON.parse(JSON.stringify(copy))), ...stamp };
  }

  // Runs one save: send(data, baseRevision) resolves with the saved copy or throws the api error (status, payload).
  // A 409 {code:"revision", data} is merged and sent again (MAX_ROUNDS in all); a clash stops and is returned.
  // normalize (optional): the page's normaliser, run on base and theirs so its defaults are not taken for changes.
  async function saveWithRebase({ send, base, mine, schema, normalize, maxRounds = MAX_ROUNDS }) {
    let currentBase = normalized(base, normalize);
    let payload = mine;
    let mergedWith = null;
    const notes = [];
    for (let round = 1; ; round += 1) {
      try {
        const saved = await send(payload, revisionOf(currentBase));
        return { ok: true, saved, mergedWith, notes };
      } catch (error) {
        const body = error && error.status === 409 && error.payload && error.payload.code === "revision" ? error.payload : null;
        if (!body || !isRecord(body.data) || round >= maxRounds) {
          throw error;
        }
        const who = { savedBy: body.saved_by || "", savedAt: body.saved_at || "" };
        const theirs = normalized(body.data, normalize);
        const result = merge3(currentBase, payload, theirs, schema);
        if (result.clashes.length) {
          return { ok: false, clashes: result.clashes, theirs, merged: result.merged, rebased: result.rebased, notes: notes.concat(result.notes), ...who };
        }
        mergedWith = who;
        notes.push(...result.notes);
        currentBase = theirs;
        payload = result.merged;
      }
    }
  }

  function departmentLabel(savedBy) {
    return DEPARTMENT_LABELS[savedBy] || "Someone";
  }

  // 24-hour time; the day too when it is not today.
  function timeLabel(savedAt, now) {
    const date = new Date(savedAt);
    if (!savedAt || Number.isNaN(date.getTime())) return "";
    const today = now instanceof Date ? now : new Date();
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    return sameDay ? time : `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}, ${time}`;
  }

  // "Hotel's change from 14:02"
  function whoLabel(savedBy, savedAt, now) {
    const when = timeLabel(savedAt, now);
    return `${departmentLabel(savedBy)}'s change${when ? ` from ${when}` : ""}`;
  }

  // The status line after a save that merged someone else's change.
  function savedStatus(message, result, now) {
    if (!result || !result.mergedWith) return message;
    const replaced = (result.notes || []).some((note) => note.kind === "order-replaced");
    return `${message} · merged with ${whoLabel(result.mergedWith.savedBy, result.mergedWith.savedAt, now)}${replaced ? " · the other order was replaced" : ""}`;
  }

  // One short line for "↳ Hotel wrote: …".
  function valueSummary(value) {
    const cut = (text) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);
    if (value === undefined || value === null || value === "") return "(empty)";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return cut(value.trim() || "(empty)");
    if (Array.isArray(value)) {
      if (!value.length) return "(none)";
      const names = value.map((item) => (isRecord(item) ? (item.name || item.title || item.stock_id || "") : String(item))).filter(Boolean);
      return cut(`${value.length} item${value.length === 1 ? "" : "s"}${names.length ? `: ${names.join(", ")}` : ""}`);
    }
    if (isRecord(value)) {
      return cut(Object.values(value).filter((item) => typeof item === "string" || typeof item === "number").join(", ") || "(empty)");
    }
    return cut(String(value));
  }

  // "<prefix>-" and 8 base-36 characters (the server's lib/record-ids.js format), not one already in taken.
  function newId(prefix, taken) {
    const used = taken instanceof Set ? taken : new Set();
    const random = (typeof crypto !== "undefined" && crypto.getRandomValues)
      ? () => crypto.getRandomValues(new Uint32Array(1))[0] % ID_ALPHABET.length
      : () => Math.floor(Math.random() * ID_ALPHABET.length);
    for (;;) {
      let tail = "";
      for (let i = 0; i < 8; i += 1) tail += ID_ALPHABET[random()];
      const id = `${prefix}-${tail}`;
      if (!used.has(id)) return id;
    }
  }

  // Mirror of the server's recordIds.withSlotIds: a guest without an id gets g-slot-<position>, past taken ids.
  function withSlotIds(guests) {
    if (!Array.isArray(guests)) return [];
    const idOf = (guest) => (isRecord(guest) && typeof guest.id === "string" ? guest.id.trim() : "");
    const taken = new Set(guests.map(idOf).filter(Boolean));
    return guests.map((guest, index) => {
      if (!isRecord(guest) || idOf(guest)) return guest;
      let n = index + 1;
      while (taken.has(`g-slot-${n}`)) n += 1;
      taken.add(`g-slot-${n}`);
      return { ...guest, id: `g-slot-${n}` };
    });
  }

  return {
    STAMP_KEYS, SCHEMAS, same, revisionOf, merge3, clashFields, changedFields, saveWithRebase, departmentLabel, timeLabel,
    whoLabel, savedStatus, valueSummary, newId, withSlotIds
  };
});
```

- [ ] **Step 4: Run the tests.** `node --test` → `ℹ pass 207`, `ℹ fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add merge-core.js test/merge-core.test.js
git commit -m "feat(admin): merge-core.js, the three-way merge and the save loop (spec C)"
```

---

### Task 2: `admin.js`, the revisioned saves

**Files:** modify `admin.js`

Every replacement below matches exactly once. Apply them in order.

- [ ] **Step 1: Apply the replacements.**

**1. saveCharterFile: the revisioned save, its helpers and the clash marks** — in `admin.js`, replace

```js
  async function saveCharterFile(file, data, successMessage) {
    try {
      const payload = await api(`/api/admin/charter/${encodeURIComponent(state.selectedCharter)}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file, data })
      });
      const savedData = payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data")
        ? payload.data
        : payload;
      if (state.bundle && file) {
        state.bundle[file] = cloneData(savedData);
      }
      setStatus(successMessage || `${file} saved.`, "ok");
      return savedData;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }
```

with

```js
  // ---- Conflict-safe saves (charter rework spec C §3.2, §4) -------------------------------------------------------
  // Every save of the nine protected files sends base_revision; a 409 is merged (merge-core.js) and sent again. A clash
  // (both changed the same field of the same record) goes to the caller's onClash, or is reported.
  // The base of a charter file's merge is state.bundle[file]: only loadCharter replaces it, and every page render calls
  // loadCharter before it builds its working copies; these saves set it to the copy they end with. A library file's
  // base is kept per working copy (libraryBases): the drink stock picker loads its own copy while a page holds an older
  // one. After a clash the working copy holds theirs, so a stale copy is never sent with the new revision.
  const mergeCore = () => window.IolantheMerge;
  const CHARTER_FILE_SCHEMAS = Object.freeze({
    "charter.json": "charter",
    "crew_list.json": "crew",
    "guest_list.json": "guests",
    "menus.json": "menus",
    [GUEST_DRINKS_FILE_NAME]: "guestDrinks"
  });
  const CHARTER_FILE_NORMALIZERS = Object.freeze({
    "charter.json": normalizeCharterInfo,
    "crew_list.json": normalizeCrewEditorList,
    "guest_list.json": normalizeGuestList,
    "menus.json": normalizeMenus,
    [GUEST_DRINKS_FILE_NAME]: normalizeGuestDrinks
  });
  const CHARTER_FILE_LABELS = Object.freeze({
    "charter.json": "the charter info",
    "crew_list.json": "the crew list",
    "guest_list.json": "the guest list",
    "menus.json": "the menus",
    [GUEST_DRINKS_FILE_NAME]: "Guest Alcohol"
  });
  const libraryBases = new WeakMap();
  // The revision of each library file (and available-alcohol.json, which is not in the bundle) last loaded or saved,
  // for the freshness check on tab focus (§4.4).
  const seenRevisions = {};

  function rememberLibraryBase(workingCopy, served, file) {
    libraryBases.set(workingCopy, cloneData(served));
    seenRevisions[file] = mergeCore().revisionOf(served);
    return workingCopy;
  }

  // -> merge-core's saveWithRebase result: { ok: true, saved, mergedWith, notes } or { ok: false, clashes, theirs,
  // merged, rebased, savedBy, savedAt }. Any other error is thrown.
  function saveRevisioned({ path, schema, base, mine, normalize, wrap, unwrap }) {
    return mergeCore().saveWithRebase({
      send: async (data, baseRevision) => unwrap(await api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wrap(data, baseRevision))
      })),
      base,
      mine,
      normalize,
      schema: mergeCore().SCHEMAS[schema]
    });
  }

  // "Hotel changed the guest list at 14:02. Your change wasn't saved."
  function clashMessage(result, what) {
    const when = mergeCore().timeLabel(result.savedAt);
    return `${mergeCore().departmentLabel(result.savedBy)} changed ${what}${when ? ` at ${when}` : ""}. Your change wasn't saved.`;
  }

  // Spec C §4.1: one record's clash, for the editor that reopens on their version with my changes on top (record).
  // null when nothing clashed on that record.
  function recordClash(result, list, key, name) {
    const own = result.clashes.filter(clash => clash.list === list && clash.key === key);
    if (!own.length) {
      return null;
    }
    const find = copy => (Array.isArray(copy && copy[list]) ? copy[list] : []).find(record => record && record.id === key) || null;
    const theirsRecord = find(result.theirs);
    const record = find(result.rebased);
    return {
      name,
      record,
      theirsRecord,
      savedBy: result.savedBy,
      savedAt: result.savedAt,
      deletedByThem: own.some(clash => clash.kind === "deleted-by-them"),
      deletedByMe: own.some(clash => clash.kind === "deleted-by-me"),
      changed: mergeCore().changedFields(theirsRecord || {}, record || {}),
      theirs: mergeCore().clashFields(result.clashes, list, key)
    };
  }

  // Spec C §4.2: a clash on a whole page (its top-level fields), in recordClash's shape.
  function pageClash(result, name) {
    return {
      name,
      record: result.rebased,
      theirsRecord: result.theirs,
      savedBy: result.savedBy,
      savedAt: result.savedAt,
      deletedByThem: false,
      deletedByMe: false,
      changed: mergeCore().changedFields(result.theirs, result.rebased),
      theirs: mergeCore().clashFields(result.clashes, null, null)
    };
  }

  // Mockup B: the amber banner before `before` (or first in the container), a teal edge on each field I changed and
  // "↳ Hotel wrote: …" under each field we both changed. fields: { field: selector or [selector, label] }; fields that
  // share an element (a day's meals share the section list) get one edge and one hint each, labelled.
  function showClashMarks(container, clash, fields, before) {
    if (!container || !clash) {
      return;
    }
    container.querySelectorAll(":scope > .clash-banner").forEach(old => old.remove());   // a page that clashed again
    const core = mergeCore();
    const who = core.departmentLabel(clash.savedBy);
    const when = core.timeLabel(clash.savedAt);
    const banner = document.createElement("div");
    banner.className = "clash-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML = `<span class="clash-pill">${escapeHtml(who)}</span><span>${clash.deletedByThem ? "deleted" : "changed"} ${escapeHtml(clash.name)}${when ? ` at ${escapeHtml(when)}` : ""}. ${clash.deletedByThem ? "Save to add it back." : "Your changes are on top; check them and save again."}</span>`;
    const anchor = before || container.firstElementChild;
    if (anchor) {
      anchor.before(banner);
    } else {
      container.prepend(banner);
    }
    setStatus(`${who} ${clash.deletedByThem ? "deleted" : "changed"} ${clash.name}${when ? ` at ${when}` : ""}. Check the marked fields and save again.`, "error");
    const hints = new Map();   // selector -> { after: the element the next hint follows, texts: hints already shown }
    Object.entries(fields || {}).forEach(([field, target]) => {
      const [selector, label] = Array.isArray(target) ? target : [target, ""];
      const mine = clash.changed.includes(field);
      const theirs = Object.prototype.hasOwnProperty.call(clash.theirs, field);
      const input = mine || theirs ? container.querySelector(selector) : null;
      if (!input) {
        return;
      }
      if (mine) {
        input.classList.add("field-mine");
      }
      if (!theirs) {
        return;
      }
      const text = `↳ ${who} wrote: ${label ? `${label}: ` : ""}${core.valueSummary(clash.theirs[field])}`;
      const shown = hints.get(selector) || { after: input, texts: new Set() };
      if (!shown.texts.has(text)) {
        const hint = document.createElement("span");
        hint.className = "field-theirs";
        hint.textContent = text;
        shown.after.after(hint);
        shown.after = hint;
        shown.texts.add(text);
        hints.set(selector, shown);
      }
    });
  }

  // Spec C §4.2: a whole-page clash on a list page: the banner before the list, and on each record we both changed a
  // teal edge with their value as its tooltip. elementFor(key) -> that record's element, or null.
  function showListClash(list, result, name, elementFor) {
    if (!list) {
      return;
    }
    showClashMarks(list.parentElement, pageClash(result, name), {}, list);
    const who = mergeCore().departmentLabel(result.savedBy);
    result.clashes.forEach(clash => {
      const element = clash.key === null ? null : elementFor(clash.key);
      if (!element) {
        return;
      }
      element.classList.add("field-mine");
      const text = clash.kind === "field" ? `${who} wrote: ${mergeCore().valueSummary(clash.theirs)}` : `${who} deleted this`;
      element.title = element.title ? `${element.title}
${text}` : text;
    });
  }

  // Spec C SC-D7: I deleted what they changed.
  function confirmDeleteAnyway(clash) {
    const when = mergeCore().timeLabel(clash.savedAt);
    return showAdminConfirm({
      title: "Changed Elsewhere",
      message: `${mergeCore().departmentLabel(clash.savedBy)} changed ${clash.name}${when ? ` at ${when}` : ""}. Delete anyway?`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger"
    });
  }

  // options.onClash(result): a clash. Without one the status line reports it and the section redraws from theirs.
  async function saveCharterFile(file, data, successMessage, options = {}) {
    const charterId = state.selectedCharter;
    try {
      const result = await saveRevisioned({
        path: `/api/admin/charter/${encodeURIComponent(charterId)}/save`,
        schema: CHARTER_FILE_SCHEMAS[file] || "charter",
        base: state.bundle && state.bundle[file] ? state.bundle[file] : {},
        mine: data,
        normalize: CHARTER_FILE_NORMALIZERS[file],
        wrap: (payload, baseRevision) => ({ file, data: payload, base_revision: baseRevision }),
        unwrap: payload => (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload)
      });
      if (state.bundle && file && state.selectedCharter === charterId) {
        state.bundle[file] = cloneData(result.ok ? result.saved : result.theirs);
      }
      if (!result.ok) {
        if (typeof options.onClash === "function") {
          options.onClash(result);
        } else {
          setStatus(clashMessage(result, CHARTER_FILE_LABELS[file] || file), "error");
          renderSection();
        }
        return null;
      }
      setStatus(mergeCore().savedStatus(successMessage || `${file} saved.`, result), "ok");
      return result.saved;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }
```

**2. drink stocks, available alcohol: loads remember their base, saves go through saveLibraryCopy** — in `admin.js`, replace

```js
  async function loadDrinkStocks() {
    return normalizeDrinkStocks(await api("/api/admin/drink-stocks"));
  }

  async function saveDrinkStocks(drinkStocks, successMessage) {
    try {
      const saved = normalizeDrinkStocks(await api("/api/admin/drink-stocks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: drinkStocks.items })
      }));
      drinkStocks.items = saved.items;
      setStatus(successMessage || "Drink stocks saved.", "ok");
      return saved;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }

  async function loadAvailableAlcohol(charterId = syncSelectedCharter()) {
    return normalizeAvailableAlcohol(await api(`/api/admin/charter/${encodeURIComponent(charterId)}/available-alcohol`));
  }

  async function saveAvailableAlcohol(charterId, availableAlcohol, successMessage) {
    try {
      const saved = normalizeAvailableAlcohol(await api(`/api/admin/charter/${encodeURIComponent(charterId)}/available-alcohol/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(availableAlcohol)
      }));
      availableAlcohol.items = saved.items;
      availableAlcohol.show_prices_to_guests = saved.show_prices_to_guests;
      setStatus(successMessage || "Available Alcohol saved.", "ok");
      return saved;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }
```

with

```js
  // Spec C: a library save (drink stocks, available alcohol, cocktails). The working copy adopts the copy the save ends
  // with: the saved one, or theirs after a clash (then options.onClash gets the result). -> the normalised saved copy,
  // or null after a clash. Other errors are thrown.
  async function saveLibraryCopy({ path, file, schema, workingCopy, mine, normalize, adopt, label, successMessage, options }) {
    const result = await saveRevisioned({
      path,
      schema,
      base: libraryBases.get(workingCopy) || {},
      mine,
      normalize,
      wrap: (data, baseRevision) => ({ ...data, base_revision: baseRevision }),
      unwrap: payload => payload
    });
    const served = result.ok ? result.saved : result.theirs;
    rememberLibraryBase(workingCopy, served, file);
    adopt(normalize(served));
    if (!result.ok) {
      if (options && typeof options.onClash === "function") {
        options.onClash(result);
      } else {
        setStatus(clashMessage(result, label), "error");
      }
      return null;
    }
    setStatus(mergeCore().savedStatus(successMessage, result), "ok");
    return normalize(served);
  }

  async function loadDrinkStocks() {
    const served = await api("/api/admin/drink-stocks");
    return rememberLibraryBase(normalizeDrinkStocks(served), served, "drink-stocks.json");
  }

  async function saveDrinkStocks(drinkStocks, successMessage, options = {}) {
    try {
      return await saveLibraryCopy({
        path: "/api/admin/drink-stocks/save",
        file: "drink-stocks.json",
        schema: "drinkStocks",
        workingCopy: drinkStocks,
        mine: { items: drinkStocks.items },
        normalize: normalizeDrinkStocks,
        adopt: copy => { drinkStocks.items = copy.items; },
        label: "the drink stocks",
        successMessage: successMessage || "Drink stocks saved.",
        options
      });
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }

  async function loadAvailableAlcohol(charterId = syncSelectedCharter()) {
    const served = await api(`/api/admin/charter/${encodeURIComponent(charterId)}/available-alcohol`);
    return rememberLibraryBase(normalizeAvailableAlcohol(served), served, "available-alcohol.json");
  }

  async function saveAvailableAlcohol(charterId, availableAlcohol, successMessage, options = {}) {
    try {
      return await saveLibraryCopy({
        path: `/api/admin/charter/${encodeURIComponent(charterId)}/available-alcohol/save`,
        file: "available-alcohol.json",
        schema: "availableAlcohol",
        workingCopy: availableAlcohol,
        mine: { show_prices_to_guests: availableAlcohol.show_prices_to_guests, items: availableAlcohol.items },
        normalize: normalizeAvailableAlcohol,
        adopt: copy => {
          availableAlcohol.items = copy.items;
          availableAlcohol.show_prices_to_guests = copy.show_prices_to_guests;
        },
        label: "Available Alcohol",
        successMessage: successMessage || "Available Alcohol saved.",
        options
      });
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }
```

**3. cocktails: the load remembers its base, the save goes through saveLibraryCopy** — in `admin.js`, replace

```js
  async function loadCocktails() {
    return normalizeCocktails(await api("/api/admin/cocktails"));
  }

  async function saveCocktails(cocktails, successMessage) {
    try {
      const saved = normalizeCocktails(await api("/api/admin/cocktails/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cocktails)
      }));
      cocktails.cocktails = saved.cocktails;
      setStatus(successMessage || "Cocktails saved.", "ok");
      return saved;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }
```

with

```js
  async function loadCocktails() {
    const served = await api("/api/admin/cocktails");
    return rememberLibraryBase(normalizeCocktails(served), served, "cocktails.json");
  }

  async function saveCocktails(cocktails, successMessage, options = {}) {
    try {
      return await saveLibraryCopy({
        path: "/api/admin/cocktails/save",
        file: "cocktails.json",
        schema: "cocktails",
        workingCopy: cocktails,
        mine: { cocktails: cocktails.cocktails },
        normalize: normalizeCocktails,
        adopt: copy => { cocktails.cocktails = copy.cocktails; },
        label: "the cocktails",
        successMessage: successMessage || "Cocktails saved.",
        options
      });
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }
```

**4. cocktails keep their ids** — in `admin.js`, replace

```js
    return {
      name: typeof source.name === "string" ? source.name.trim() : "",
      description: typeof source.description === "string"
        ? source.description
        : (typeof source.notes === "string" ? source.notes : ""),
      ingredients: legacyIngredients.map(normalizeCocktailIngredient).filter(Boolean)
    };
  }
```

with

```js
    return {
      ...(typeof source.id === "string" && source.id ? { id: source.id } : {}),
      name: typeof source.name === "string" ? source.name.trim() : "",
      description: typeof source.description === "string"
        ? source.description
        : (typeof source.notes === "string" ? source.notes : ""),
      ingredients: legacyIngredients.map(normalizeCocktailIngredient).filter(Boolean)
    };
  }
```

**5. sites: one base for the Site Editor's copy** — in `admin.js`, replace

```js
  async function loadSites() {
    const siteLibrary = normalizeSiteLibrary(await api("/api/admin/sites"));
    state.sites = siteLibrary.sites;
    return siteLibrary;
  }
```

with

```js
  // Spec C: the last sites.json the server sent, the base of the next sites save. One copy is edited at a time (the
  // Site Editor, or the Route page's Edit site, both from this load); saves pass a fresh object, so no per-copy base.
  let sitesBase = {};

  async function loadSites() {
    const served = await api("/api/admin/sites");
    sitesBase = cloneData(served);
    seenRevisions["sites.json"] = mergeCore().revisionOf(served);
    const siteLibrary = normalizeSiteLibrary(served);
    state.sites = siteLibrary.sites;
    return siteLibrary;
  }
```

**6. sites save: revisioned; without an onClash a clash is thrown and the base stays** — in `admin.js`, replace

```js
  async function saveSitesLibrary(siteLibrary, successMessage) {
    const normalized = validateSiteLibrary(siteLibrary);
    const saved = await api("/api/admin/sites/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized)
    });
    const normalizedSaved = normalizeSiteLibrary(saved);
    siteLibrary.sites = normalizedSaved.sites;
    state.sites = normalizedSaved.sites;
    setStatus(successMessage || "Sites saved.", "ok");
    return normalizedSaved;
  }
```

with

```js
  // Throws on a failed save. A clash goes to options.onClash(result) (the sites become theirs; returns null); without
  // one it is thrown as a message and the base stays, so a retry merges again rather than overwriting theirs.
  async function saveSitesLibrary(siteLibrary, successMessage, options = {}) {
    const normalized = validateSiteLibrary(siteLibrary);
    const result = await saveRevisioned({
      path: "/api/admin/sites/save",
      schema: "sites",
      base: sitesBase,
      mine: normalized,
      normalize: normalizeSiteLibrary,
      wrap: (data, baseRevision) => ({ ...data, base_revision: baseRevision }),
      unwrap: payload => payload
    });
    if (!result.ok && typeof options.onClash !== "function") {
      throw new Error(clashMessage(result, "the sites"));
    }
    const served = result.ok ? result.saved : result.theirs;
    sitesBase = cloneData(served);
    seenRevisions["sites.json"] = mergeCore().revisionOf(served);
    const normalizedSaved = normalizeSiteLibrary(served);
    siteLibrary.sites = normalizedSaved.sites;
    state.sites = normalizedSaved.sites;
    if (!result.ok) {
      options.onClash(result);
      return null;
    }
    setStatus(mergeCore().savedStatus(successMessage || "Sites saved.", result), "ok");
    return normalizedSaved;
  }
```

**7. guests read without an id get g-slot ids, like the server** — in `admin.js`, replace

```js
  function normalizeGuestList(value) {
    const guestList = value && typeof value === "object" ? cloneData(value) : {};
    guestList.guests = Array.isArray(guestList.guests) ? guestList.guests.map(normalizeGuestRecord) : [];
    guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests);
    return guestList;
  }
```

with

```js
  function normalizeGuestList(value) {
    const guestList = value && typeof value === "object" ? cloneData(value) : {};
    guestList.guests = Array.isArray(guestList.guests) ? guestList.guests.map(normalizeGuestRecord) : [];
    // Spec C: a guest without an id gets g-slot-<position> (the server's lib/record-ids.js withSlotIds)
    guestList.guests = mergeCore().withSlotIds(sortAndEnsurePrincipalGuests(guestList.guests));
    return guestList;
  }
```

**8. blank guest slots from the guest-count rule get g-slot ids** — in `admin.js`, replace

```js
      activeCount -= 1;
    }
    normalized.guests = sortAndEnsurePrincipalGuests(normalized.guests);
    return normalized;
  }
```

with

```js
      activeCount -= 1;
    }
    normalized.guests = mergeCore().withSlotIds(sortAndEnsurePrincipalGuests(normalized.guests));
    return normalized;
  }
```

- [ ] **Step 2: Check.** `node --check admin.js` and `node --test` → `ℹ pass 207`, `ℹ fail 0`.

- [ ] **Step 3: Commit.**

```bash
git add admin.js
git commit -m "feat(admin): revisioned saves for the nine protected files, merge on 409 (spec C)"
```

---

### Task 3: `index.html` and `admin.css`

**Files:** modify `index.html`, `admin.css`

- [ ] **Step 1: Apply the changes.**

**1. every ?v= becomes admin-conflict-safe** — in `index.html`, run

```bash
sed -i -E 's/\?v=[A-Za-z0-9._-]+/?v=admin-conflict-safe/g' index.html
```

**2. merge-core.js loads before admin.js** — in `index.html`, replace

```html
  <script src="/admin/admin.js?v=admin-conflict-safe" defer></script>
```

with

```html
  <script src="/admin/merge-core.js?v=admin-conflict-safe" defer></script>
  <script src="/admin/admin.js?v=admin-conflict-safe" defer></script>
```

**3. the clash banner and field marks (spec C §4.5, mockup B)** — in `admin.css`, replace

```css
.status-pill--none { background: #f7e3e1; color: var(--danger); }
```

with

```css
.status-pill--none { background: #f7e3e1; color: var(--danger); }

/* Spec C (conflict-safe saves), mockup B: someone else saved the same record while you edited it. */
.clash-banner {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0 0 0.8rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid #e6c88f;
  border-radius: 6px;
  background: var(--warn-bg);
  color: #5b3d0b;
  font-size: 0.88rem;
}

.clash-pill {
  flex: none;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: #f3e3c8;
  color: #7a4b0c;
}

.field-mine {
  border-color: var(--accent) !important;
  box-shadow: inset 3px 0 0 var(--accent);
}

.field-theirs {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.78rem;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--warn);
}
```

- [ ] **Step 2: Check.** `grep -c "admin-conflict-safe" index.html` → `32`; `node --test` → `ℹ pass 207`.

- [ ] **Step 3: Commit.**

```bash
git add index.html admin.css
git commit -m "feat(admin): load merge-core.js; the clash banner and field marks; assets admin-conflict-safe"
```

Plan c-03 continues on the same branch.
