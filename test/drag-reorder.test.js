"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { moveItem, dropIndex } = require("../drag-reorder.js");

test("moveItem moves an entry down and shifts the ones between up", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
});

test("moveItem moves an entry up and shifts the ones between down", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
});

test("moveItem returns a copy and leaves the input alone", () => {
  const list = ["a", "b", "c"];
  const moved = moveItem(list, 2, 0);
  assert.deepEqual(list, ["a", "b", "c"]);
  assert.notEqual(moved, list);
});

test("moveItem ignores out-of-range and same-place moves", () => {
  assert.deepEqual(moveItem(["a", "b"], 1, 1), ["a", "b"]);
  assert.deepEqual(moveItem(["a", "b"], -1, 0), ["a", "b"]);
  assert.deepEqual(moveItem(["a", "b"], 0, 5), ["a", "b"]);
});

// Four 40 px rows with 10 px gaps: tops 0, 50, 100, 150; middles 20, 70, 120, 170
const slots = [0, 50, 100, 150].map(top => ({ top, height: 40 }));

test("dropIndex stays put until the centre reaches a neighbour's middle", () => {
  assert.equal(dropIndex(slots, 1, 70), 1);
  assert.equal(dropIndex(slots, 1, 119), 1);
  assert.equal(dropIndex(slots, 1, 120), 2);
});

test("dropIndex passes several rows when dragged far", () => {
  assert.equal(dropIndex(slots, 0, 175), 3);
  assert.equal(dropIndex(slots, 3, 5), 0);
  assert.equal(dropIndex(slots, 2, 60), 1);
});

test("dropIndex clamps to the ends of the list", () => {
  assert.equal(dropIndex(slots, 1, 900), 3);
  assert.equal(dropIndex(slots, 2, -900), 0);
});

test("dropIndex reaches the last slot when the drag is clamped to the end of the list", () => {
  // Two 51 px rows 7 px apart: clamped, the first row's centre sits exactly on the second row's middle
  const pair = [{ top: 0, height: 51 }, { top: 58, height: 51 }];
  assert.equal(dropIndex(pair, 0, 58 + 51 / 2), 1);
  assert.equal(dropIndex(pair, 1, 51 / 2), 0);
});
