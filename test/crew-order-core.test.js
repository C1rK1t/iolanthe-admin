"use strict";

// The remembered crew order's rules (crew-order-core.js), against the fixture iolanthe-server's lib/crew-order.js is tested
// with (test/fixtures/crew-order-cases.json, a copy: the two must agree).

const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../crew-order-core");
const cases = require("./fixtures/crew-order-cases.json");

test("keys: trimmed, inner spaces collapsed, lower-cased (shared fixture)", () => {
  for (const { input, expect } of cases.keys) {
    assert.equal(core.keyOf(input), expect, JSON.stringify(input));
  }
  assert.equal(core.nameKey({ name: " San  San " }), "san san");
  assert.equal(core.departmentKey({ department: "Bridge  and Deck" }), "bridge and deck");
  assert.equal(core.departmentKey({}), "");
  assert.equal(core.nameKey(null), "");
});

test("order within a department (shared fixture)", () => {
  for (const c of cases.within) {
    const entries = c.members.map((member, index) => ({ member: { ...member, department: c.department }, index }));
    const sorted = entries.slice().sort(core.compareWithinDepartment(c.departments));
    assert.deepEqual(sorted.map(entry => entry.member.name), c.expect, c.name);
  }
});

test("reorderDepartment (shared fixture), and it mutates nothing", () => {
  for (const c of cases.reorder) {
    const before = JSON.stringify(c.departments);
    const key = core.keyOf(c.department);
    const result = core.reorderDepartment(c.departments, key, c.sequence);
    assert.deepEqual(result[key], c.expect, c.name);
    assert.equal(JSON.stringify(c.departments), before, `${c.name}: input untouched`);
    for (const [other, list] of Object.entries(c.others || {})) {
      assert.deepEqual(result[other], list, `${c.name}: ${other}`);
    }
  }
});

test("normalizeOrder keeps the server's stamp and departments, and survives anything else", () => {
  const served = { revision: 3, saved_by: "charter", saved_at: "2026-10-10T08:00:00.000Z", departments: { interior: ["paul", "kio"] } };
  assert.deepEqual(core.normalizeOrder(served), served);
  assert.deepEqual(core.normalizeOrder({ ...served, damaged: "is empty" }), { ...served, damaged: "is empty" });
  assert.deepEqual(core.normalizeOrder(null), { revision: 0, saved_by: "", saved_at: "", departments: {} });
  assert.deepEqual(core.normalizeOrder({ revision: "x", departments: [1, 2] }), { revision: 0, saved_by: "", saved_at: "", departments: {} });
  assert.deepEqual(core.normalizeOrder({ departments: { a: "no", b: ["Ok", 4] } }).departments, { b: ["ok"] });
});

test("normalizeOrder is a copy: changing it does not change what was served", () => {
  const served = { revision: 1, departments: { interior: ["a"] } };
  const copy = core.normalizeOrder(served);
  copy.departments.interior.push("b");
  assert.deepEqual(served.departments.interior, ["a"]);
});

test("a department called constructor or __proto__ is an ordinary name", () => {
  const order = core.normalizeOrder({ departments: JSON.parse('{"__proto__": ["a"], "constructor": ["b"]}') });
  assert.deepEqual(Object.keys(order.departments).sort(), ["__proto__", "constructor"]);
  assert.equal(Object.getPrototypeOf(order.departments), Object.prototype);
  const entries = [{ name: "B" }, { name: "A" }].map((member, index) => ({ member: { ...member, department: "constructor" }, index }));
  assert.deepEqual(entries.sort(core.compareWithinDepartment({})).map(entry => entry.member.name), ["B", "A"]);
});

test("sequenceOf lists a department's rows as name keys, in the order shown", () => {
  assert.deepEqual(core.sequenceOf([{ name: "San San" }, { name: " Paul " }, { name: "" }]), ["san san", "paul"]);
});
