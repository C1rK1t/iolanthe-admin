// A data file the server can't read (charter rework spec C §4.6, SC-D16): which files each page needs, the readers of the
// server's `damaged` marker on a GET or a refusal, and the wording. Shared by admin.js, routes.js and charter-pack.js
// (browser) and test/damaged-core.test.js (node --test). No DOM here.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheDamaged = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const freezeTable = (table) => Object.freeze(Object.fromEntries(Object.entries(table).map(([page, files]) => [page, Object.freeze(files.slice())])));

  // The files each page needs, in the order the notice names them: the files it shows and the files its saves are worked
  // out from (Galley Menus' day sync uses charter.json's dates). Route & Itinerary's are for this charter's route only.
  const PAGE_FILES = Object.freeze({
    charter: freezeTable({
      info: ["charter.json"],
      routes: ["itinerary.json", "charter.json"],
      crew: ["crew_list.json"],
      pack: ["pack.json"],
      sites: ["sites.json"]
    }),
    galley: freezeTable({
      menus: ["menus.json", "charter.json"],
      guests: ["guest_list.json", "charter.json"]
    }),
    hotel: freezeTable({
      guests: ["guest_list.json", "charter.json"],
      "drink-stocks": ["drink-stocks.json"],
      "guest-drinks": ["guest_drinks.json", "drink-stocks.json"],
      "available-alcohol": ["available-alcohol.json", "drink-stocks.json"],
      "purchased-alcohol": ["charter-alcohol-purchases.json", "drink-stocks.json", "available-alcohol.json"],
      cocktails: ["cocktails.json"]
    })
  });

  // What a strip says is out of action while its file can't be read.
  const STRIPS = Object.freeze({
    "reserved-periods.json": "Reserved periods aren't shown, and periods and charter dates can't be changed until it's fixed or restored.",
    "anchorages.json": "Anchorages aren't shown, and can't be added or changed until it's fixed or restored.",
    "crew-order.json": "The crew are shown in this charter's own order, and can't be re-ordered until it's fixed or restored."
  });
  const PICKED = Object.freeze({ "menus.json": "its menus", "crew_list.json": "its crew" });
  const DATES_MESSAGE = "reserved-periods.json can't be read, so new dates can't be checked against the reserved periods. Fix or restore it first.";

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  // A copy's `damaged` problem ("is not valid JSON at line 3 column 5"), or "" when it is not marked.
  function damagedIn(copy) {
    return isRecord(copy) && typeof copy.damaged === "string" ? copy.damaged : "";
  }

  // {file: problem} for each marked file of a charter bundle (GET /api/admin/charter/<id>).
  function bundleDamage(bundle) {
    const found = {};
    if (isRecord(bundle)) {
      Object.keys(bundle).forEach((file) => {
        const problem = damagedIn(bundle[file]);
        if (problem) found[file] = problem;
      });
    }
    return found;
  }

  // The page's damaged files, [{file, problem}] in the page's order, from known ({file: problem}).
  function pageDamage(section, panel, known) {
    const table = Object.hasOwn(PAGE_FILES, section) ? PAGE_FILES[section] : null;
    const files = table && Object.hasOwn(table, panel) ? table[panel] : [];
    const map = isRecord(known) ? known : {};
    return files.filter((file) => typeof map[file] === "string" && map[file] !== "").map((file) => ({ file, problem: map[file] }));
  }

  // {file, problem} for an api error that refused a damaged file (status 500, payload {code: "damaged", file, damaged}),
  // else null. A refusal about another charter's file has no code, so it is never taken for this page's.
  function refusal(error) {
    const payload = error && error.status === 500 && isRecord(error.payload) ? error.payload : null;
    if (!payload || payload.code !== "damaged" || typeof payload.file !== "string" || !payload.file) {
      return null;
    }
    return { file: payload.file, problem: typeof payload.damaged === "string" ? payload.damaged : "" };
  }

  // "a.json", "a.json and b.json", "a.json, b.json and c.json"
  function fileList(files) {
    const names = Array.isArray(files) ? files : [];
    return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] || "");
  }

  // "menus.json is not valid JSON at line 3 column 5.", or "" when the server gave no problem.
  function detailLine(file, problem) {
    return problem ? `${file} ${problem}.` : "";
  }

  // The card a page shows instead of its editor: {heading, body, details}.
  function noticeText(list) {
    const entries = Array.isArray(list) ? list : [];
    return {
      heading: `${fileList(entries.map((entry) => entry.file))} can't be read`,
      body: `This page can't be shown or saved until ${entries.length > 1 ? "they're" : "it's"} fixed or restored from a backup. Nothing has been changed.`,
      details: entries.map((entry) => detailLine(entry.file, entry.problem)).filter(Boolean)
    };
  }

  // A strip above a page that otherwise works: {lead, rest, detail}.
  function stripText(file, problem) {
    return {
      lead: `${file} can't be read.`,
      rest: Object.hasOwn(STRIPS, file) ? STRIPS[file] : "It can't be shown or changed until it's fixed or restored.",
      detail: detailLine(file, problem)
    };
  }

  // The banner after a save the server refused because its file can't be read: {lead, rest, detail}.
  function bannerText(file, problem) {
    return {
      lead: `${file} can't be read, so your change wasn't saved.`,
      rest: "Copy anything you need from this page, then reload it once the file is fixed or restored.",
      detail: detailLine(file, problem)
    };
  }

  // An import picker's refusal of a source file the server can't read.
  function pickerMessage(charterName, file) {
    const what = Object.hasOwn(PICKED, file) ? PICKED[file] : "it";
    return `${charterName}'s ${file} can't be read, so ${what} can't be imported. Fix or restore it first.`;
  }

  return { PAGE_FILES, DATES_MESSAGE, damagedIn, bundleDamage, pageDamage, refusal, fileList, noticeText, stripText, bannerText, pickerMessage };
});
