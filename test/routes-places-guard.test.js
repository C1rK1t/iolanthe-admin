// routes-places.js: the anchorages save writes the WHOLE library, so it must never run before load() has filled the list.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const GUARD_MESSAGE = "The anchorages haven't been loaded, so they can't be saved. Reload the page.";
const SAVE_PATH = "/api/admin/anchorages/save";
const STOP = { latitude: 1, longitude: 1, name: "x" };

// Builds a places instance whose API calls go through `answer(path, options)`; returns it with the calls and statuses seen.
function makePlaces(answer) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "routes-places.js"), "utf8"), sandbox, { filename: "routes-places.js" });
  const calls = [];
  const statuses = [];
  const A = {
    api: async (url, options) => { calls.push(url); return answer(url, options); },
    setStatus: (message, kind) => statuses.push({ message, kind })
  };
  const core = { uniqueName: (name) => name };
  const places = sandbox.window.IolantheRoutesPlaces.create({ A, core, el: () => ({}), onChanged: () => {} });
  return { places, calls, statuses };
}

const savedList = (options) => ({ anchorages: JSON.parse(options.body).anchorages.map((a, i) => ({ ...a, id: a.id || `a${i}` })) });

test("before load(), a save makes no API call and says why", async () => {
  const { places, calls, statuses } = makePlaces(() => ({}));
  assert.equal(await places.createStop(STOP), null);
  assert.deepEqual(calls, []);
  assert.deepEqual(statuses, [{ message: GUARD_MESSAGE, kind: "error" }]);
});

test("after a load() that failed, still no save call", async () => {
  const { places, calls } = makePlaces(() => { throw new Error("offline"); });
  await assert.rejects(places.load(), { message: "offline" });
  calls.length = 0;
  assert.equal(await places.createStop(STOP), null);
  assert.deepEqual(calls, []);
});

test("after a successful load(), the save POSTs the whole library", async () => {
  const { places, calls } = makePlaces((url, options) => (url === SAVE_PATH ? savedList(options) : { anchorages: [{ id: "old", name: "Old", latitude: 2, longitude: 2 }] }));
  await places.load();
  const saved = await places.createStop(STOP);
  assert.deepEqual(calls, ["/api/admin/anchorages", SAVE_PATH]);
  assert.equal(saved.name, "x");
  assert.deepEqual(places.anchorages().map((a) => a.name), ["Old", "x"]);
});

test("a rejected save does not wedge the queue: the next save still runs", async () => {
  let failNext = true;
  const { places, calls } = makePlaces((url, options) => {
    if (url !== SAVE_PATH) return { anchorages: [] };
    if (failNext) { failNext = false; throw new Error("server down"); }
    return savedList(options);
  });
  await places.load();
  assert.equal(await places.createStop(STOP), null);
  assert.equal((await places.createStop(STOP)).name, "x");
  assert.equal(calls.filter((c) => c === SAVE_PATH).length, 2);
});
