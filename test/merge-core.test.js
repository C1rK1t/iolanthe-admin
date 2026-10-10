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
  assert.ok(core.same({ a: 1, b: [] }, { a: 1 }), "[] = missing");
  assert.ok(!core.same({ a: [] }, { a: [0] }));
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

test("menus: a day's title is mine to edit, not derived", () => {
  const day = (id, n, label, dinner) => ({ id, order: n, day: n, charter_day: n, label, date: null, dinner });
  const base = { menus: [day("m-1", 1, "Day 1", []), day("m-3", 2, "Day 2", [])], revision: 3 };
  const mine = { menus: [day("m-1", 1, "Day 1", []), day("m-3", 2, "Beach BBQ", [])], revision: 3 };
  const theirs = { menus: [day("m-1", 1, "Day 1", ["Beef"]), day("m-3", 2, "Day 2", [])], revision: 4 };
  const result = core.merge3(base, mine, theirs, S.menus);
  assert.deepEqual(result.clashes, []);
  assert.equal(result.merged.menus[1].label, "Beach BBQ", "a title edit survives their dish edit");
  assert.deepEqual(result.merged.menus[0].dinner, ["Beef"]);
});

test("a record I add before it has a key is an add; repeated keys fall back to one field", () => {
  const base = crewFile([fred]);
  const added = core.merge3(base, crewFile([fred, { name: "New hand" }]), crewFile([{ ...fred, position: "Purser" }], 5), S.crew);
  assert.deepEqual(added.clashes, []);
  assert.deepEqual(added.merged.crew, [{ ...fred, position: "Purser" }, { name: "New hand" }]);
  const twice = core.merge3(base, crewFile([fred, fred]), crewFile([{ ...fred, position: "Purser" }], 5), S.crew);
  assert.deepEqual(twice.clashes.map((c) => c.field), ["crew"]);
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

test("queuedBase: the latest base after my own clean save, the queued one after a merge, a clash or a failure", () => {
  const atQueue = { revision: 4 };
  const latest = { revision: 6 };
  assert.equal(core.queuedBase(null, atQueue, latest), latest, "nothing before it");
  assert.equal(core.queuedBase({ ok: true, mergedWith: null }, atQueue, latest), latest);
  assert.equal(core.queuedBase({ ok: true, mergedWith: { savedBy: "hotel" } }, atQueue, latest), atQueue);
  assert.equal(core.queuedBase({ ok: false, clashes: [] }, atQueue, latest), atQueue);
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

test("the server's damaged marker is never merged in or counted as a change (SC-D16)", () => {
  const result = core.merge3({ name: "A" }, { name: "A", damaged: "is empty" }, { name: "A", revision: 2, saved_by: "hotel", saved_at: "2026-11-03T06:02:00.000Z" }, {});
  assert.equal("damaged" in result.merged, false);
  assert.equal("damaged" in result.rebased, false);
  assert.deepEqual(core.changedFields({ name: "A", damaged: "is empty" }, { name: "A" }), []);
});
