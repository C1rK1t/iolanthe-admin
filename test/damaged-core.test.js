"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../damaged-core.js");

const PROBLEM = "is not valid JSON at line 3 column 5";

test("PAGE_FILES: each page's files, in the order the notice names them", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(core.PAGE_FILES)), {
    charter: { info: ["charter.json"], routes: ["itinerary.json", "charter.json"], crew: ["crew_list.json"], pack: ["pack.json"], sites: ["sites.json"] },
    galley: { menus: ["menus.json", "charter.json"], guests: ["guest_list.json", "charter.json"] },
    hotel: {
      guests: ["guest_list.json", "charter.json"],
      "drink-stocks": ["drink-stocks.json"],
      "guest-drinks": ["guest_drinks.json", "drink-stocks.json"],
      "available-alcohol": ["available-alcohol.json", "drink-stocks.json"],
      "purchased-alcohol": ["charter-alcohol-purchases.json", "drink-stocks.json", "available-alcohol.json"],
      cocktails: ["cocktails.json"]
    }
  });
  for (const table of [core.PAGE_FILES, core.PAGE_FILES.charter, core.PAGE_FILES.galley, core.PAGE_FILES.hotel]) {
    assert.ok(Object.isFrozen(table));
  }
  assert.ok(Object.isFrozen(core.PAGE_FILES.galley.menus));
  assert.ok(Object.isFrozen(core.PAGE_FILES.hotel["purchased-alcohol"]));
  // Names a file name from a server payload could carry: never an inherited key.
  assert.deepEqual(core.pageDamage("__proto__", "toString", { "charter.json": PROBLEM }), []);
  assert.deepEqual(core.pageDamage("galley", "constructor", { "charter.json": PROBLEM }), []);
});

test("damagedIn: a copy's problem, or \"\" when it is not marked", () => {
  assert.equal(core.damagedIn({ menus: [], revision: 0, damaged: PROBLEM }), PROBLEM);
  // The server always gives a reason (describeReadError), so an empty one counts as not marked.
  assert.equal(core.damagedIn({ damaged: "" }), "");
  for (const copy of [{ menus: [] }, { damaged: 7 }, { damaged: null }, null, undefined, "csaba", [{ damaged: PROBLEM }]]) {
    assert.equal(core.damagedIn(copy), "", JSON.stringify(copy));
  }
});

test("bundleDamage: the marked files of a charter bundle", () => {
  const bundle = {
    charter_id: "csaba",
    "charter.json": { name: "Csaba", revision: 0, damaged: PROBLEM },
    "menus.json": { menus: [], revision: 3 },
    "itinerary.json": { version: 2, damaged: "is empty" }
  };
  assert.deepEqual(core.bundleDamage(bundle), { "charter.json": PROBLEM, "itinerary.json": "is empty" });
  assert.deepEqual(core.bundleDamage(null), {});
});

test("pageDamage: the page's damaged files in its order; other files and blank problems don't count", () => {
  const known = { "charter.json": PROBLEM, "menus.json": "is empty", "sites.json": "", "cocktails.json": "is empty" };
  assert.deepEqual(core.pageDamage("galley", "menus", known), [
    { file: "menus.json", problem: "is empty" },
    { file: "charter.json", problem: PROBLEM }
  ]);
  assert.deepEqual(core.pageDamage("charter", "sites", known), []);
  assert.deepEqual(core.pageDamage("charter", "preview", known), []);
  assert.deepEqual(core.pageDamage("settings", "passwords", known), []);
  assert.deepEqual(core.pageDamage("galley", "menus", null), []);
});

test("refusal: a 500 naming a damaged file, else null", () => {
  const error = { status: 500, payload: { error: "menus.json can't be read. Fix or restore it before saving.", code: "damaged", file: "menus.json", damaged: PROBLEM } };
  assert.deepEqual(core.refusal(error), { file: "menus.json", problem: PROBLEM });
  assert.deepEqual(core.refusal({ status: 500, payload: { code: "damaged", file: "menus.json" } }), { file: "menus.json", problem: "" });
  const others = [
    { status: 409, payload: { code: "revision" } },
    { status: 500, payload: { error: "Larry's itinerary.json can't be read. Fix or restore it before importing from it." } },
    { status: 500, payload: { code: "damaged" } },
    { status: 400, payload: { code: "damaged", file: "menus.json" } },
    { status: 500, payload: "Request failed" },
    new Error("Network"),
    null
  ];
  for (const other of others) {
    assert.equal(core.refusal(other), null, JSON.stringify(other));
  }
});

test("fileList: one, two or three names", () => {
  assert.equal(core.fileList(["menus.json"]), "menus.json");
  assert.equal(core.fileList(["menus.json", "charter.json"]), "menus.json and charter.json");
  assert.equal(core.fileList(["a.json", "b.json", "c.json"]), "a.json, b.json and c.json");
  assert.equal(core.fileList([]), "");
});

test("noticeText: the card for one file, and for several", () => {
  assert.deepEqual(core.noticeText([{ file: "menus.json", problem: PROBLEM }]), {
    heading: "menus.json can't be read",
    body: "This page can't be shown or saved until it's fixed or restored from a backup. Nothing has been changed.",
    details: [`menus.json ${PROBLEM}.`]
  });
  const three = core.noticeText([
    { file: "charter-alcohol-purchases.json", problem: "is empty" },
    { file: "drink-stocks.json", problem: "" },
    { file: "available-alcohol.json", problem: "is not a JSON object" }
  ]);
  assert.equal(three.heading, "charter-alcohol-purchases.json, drink-stocks.json and available-alcohol.json can't be read");
  assert.equal(three.body, "This page can't be shown or saved until they're fixed or restored from a backup. Nothing has been changed.");
  assert.deepEqual(three.details, ["charter-alcohol-purchases.json is empty.", "available-alcohol.json is not a JSON object."]);
});

test("stripText, bannerText, pickerMessage and DATES_MESSAGE", () => {
  assert.deepEqual(core.stripText("reserved-periods.json", "is empty"), {
    lead: "reserved-periods.json can't be read.",
    rest: "Reserved periods aren't shown, and periods and charter dates can't be changed until it's fixed or restored.",
    detail: "reserved-periods.json is empty."
  });
  assert.equal(core.stripText("anchorages.json", "").rest, "Anchorages aren't shown, and can't be added or changed until it's fixed or restored.");
  assert.equal(core.stripText("anchorages.json", "").detail, "");
  assert.equal(core.stripText("sites.json", "").rest, "It can't be shown or changed until it's fixed or restored.");
  assert.equal(core.stripText("constructor", "").rest, "It can't be shown or changed until it's fixed or restored.");
  assert.deepEqual(core.bannerText("cocktails.json", "is not a JSON object or list"), {
    lead: "cocktails.json can't be read, so your change wasn't saved.",
    rest: "Copy anything you need from this page, then reload it once the file is fixed or restored.",
    detail: "cocktails.json is not a JSON object or list."
  });
  assert.equal(core.pickerMessage("Larry", "menus.json"), "Larry's menus.json can't be read, so its menus can't be imported. Fix or restore it first.");
  assert.equal(core.pickerMessage("Larry", "crew_list.json"), "Larry's crew_list.json can't be read, so its crew can't be imported. Fix or restore it first.");
  assert.equal(core.pickerMessage("Larry", "pack.json"), "Larry's pack.json can't be read, so it can't be imported. Fix or restore it first.");
  assert.equal(core.pickerMessage("Larry", "constructor"), "Larry's constructor can't be read, so it can't be imported. Fix or restore it first.");
  assert.equal(core.DATES_MESSAGE, "reserved-periods.json can't be read, so new dates can't be checked against the reserved periods. Fix or restore it first.");
});
