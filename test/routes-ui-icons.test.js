"use strict";

// The Routes panel icon set (routes-ui.js). Captain feedback item 01, 2026-10-10: Load / Import / Export got new icons
// whose arrows must stay consistent (up = a route comes in, down = it goes out), and every icon name a button asks for
// must exist, so a typo draws an empty button instead of an icon.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

function loadUi() {
  const sandbox = { window: {}, document: {} };
  vm.runInNewContext(read("routes-ui.js"), sandbox, { filename: "routes-ui.js" });
  return sandbox.window.IolantheRoutesUi;
}

// Icon names the Routes panel files ask for: svg("x"), b("x", …) / iconBtn("x", …) buttons and `icon: "x"` tables.
function requestedIcons() {
  const names = new Set();
  const patterns = [/\bsvg\(\s*"([A-Za-z]+)"/g, /\b(?:b|iconBtn)\(\s*"([A-Za-z]+)"\s*,/g, /\bicon:\s*"([A-Za-z]+)"/g];
  const files = fs.readdirSync(ROOT).filter((f) => /^(routes[-a-z]*|stop-cards)\.js$/.test(f) && f !== "routes-core.js");
  for (const file of files) {
    const source = read(file);
    for (const re of patterns) for (const m of source.matchAll(re)) names.add(m[1]);
  }
  return [...names];
}

test("every icon the Routes panel asks for exists in the icon set", () => {
  const { ICONS } = loadUi();
  const names = requestedIcons();
  assert.ok(names.length > 20, `expected to find the panel's icon requests, found ${names.length}`);
  for (const name of ["loadRoute", "importRoute", "exportRoute", "assignRoute"]) assert.ok(names.includes(name), `${name} is on a button`);
  const missing = names.filter((n) => typeof ICONS[n] !== "string" || !ICONS[n].length);
  assert.deepEqual(missing, []);
});

test("svg() wraps a named icon in a 24 x 24 svg", () => {
  const { svg, ICONS } = loadUi();
  assert.equal(svg("loadRoute"), `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.loadRoute}</svg>`);
});

test("the Play icon is gone, so no button can read as play", () => {
  const { ICONS } = loadUi();
  assert.equal(ICONS.start, undefined);
  assert.doesNotMatch(read("routes.js"), /\bb\(\s*"start"/);
});

test("Load and Import use the same up arrow; Export and Assign the same down arrow", () => {
  const { ICONS } = loadUi();
  const arrow = (name) => ICONS[name].match(/<path d="M12 (?:\d+V2M8 6l4-4 4 4|2v\d+M8 \d+l4 4 4-4)"\/>/);
  for (const name of ["loadRoute", "importRoute", "exportRoute", "assignRoute"]) assert.ok(arrow(name), `${name} has the shared arrow`);
  // The head (its two strokes) must match; its height differs because the globe is shorter than the route line.
  const head = (name) => arrow(name)[0].match(/l4[^"]*"\/>$/)[0];
  assert.equal(head("loadRoute"), head("importRoute"));
  assert.equal(head("exportRoute"), head("assignRoute"));
  assert.notEqual(head("loadRoute"), head("exportRoute"));
});

test("Import and Export share one globe, Load and Assign share one route line", () => {
  const { ICONS } = loadUi();
  const body = (name) => ICONS[name].replace(/<path d="M12 [^"]*"\/>$/, "");
  assert.equal(body("importRoute"), body("exportRoute"));
  assert.equal(body("loadRoute"), body("assignRoute"));
  assert.notEqual(body("importRoute"), body("loadRoute"));
});

test("the three route buttons name their action in words, for hover and screen readers", () => {
  const source = read("routes.js");
  assert.match(source, /b\("loadRoute", "Load an existing route/);
  assert.match(source, /b\("importRoute", "Import an external route/);
  assert.match(source, /b\("exportRoute", "Export this route/);
  assert.match(source, /b\("assignRoute", "Assign this route to the charter"/);
});
