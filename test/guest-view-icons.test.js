"use strict";

// Captain feedback item 02 (2026-10-10): the Charter section's left menu has a Guest view button, so the Charter pages
// no longer draw their own Guest view (eye) icon buttons. These read the sources: the Charter Info header and the Route
// header have no such button, and the helpers that only served them are gone.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("the Charter Info header has no Guest view icon button", () => {
  const admin = read("admin.js");
  assert.equal(admin.includes("charter-guest-view"), false);
  assert.equal(admin.includes('iconButtonHtml("preview", "Guest view"'), false);
  assert.equal(admin.includes("previewFocusDay"), false, "the day handed over by the Route header's button");
});

test("the Route header has no Guest view icon button", () => {
  const routes = read("routes.js");
  assert.equal(routes.includes('b("eye"'), false);
  assert.equal(routes.includes("previewDay"), false);
  assert.equal(/\beye:/.test(read("routes-ui.js")), false, "the eye icon only served that button");
  assert.equal(read("stop-cards.js").includes("selectedDay"), false, "only that button asked the strip for its day");
});

test("the Guest view panel no longer takes a focus day", () => {
  assert.equal(read("guest-preview.js").includes("focusDay"), false);
  assert.equal(read("guest-preview-core.js").includes("stepIndexForDay"), false);
});

test("the section menu still offers Guest view", () => {
  const admin = read("admin.js");
  assert.ok(admin.includes('{ id: "preview", label: "Guest view" }'));
});
