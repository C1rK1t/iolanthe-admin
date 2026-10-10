# The admin says when a file can't be read: admin part, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page that needs a data file the server can't read shows a clear notice instead of an empty editor, and saves
nothing. Shared data gets a strip, a save refused later gets a banner, and the import pickers refuse a damaged source.

**Architecture:** A pure `damaged-core.js` (`window.IolantheDamaged`, Node-tested) holds three things: the table of which
files each page needs, the readers of the server's `damaged` marker, and the wording. `admin.js` records what each load
said:
- `state.bundle` keeps the charter bundle's markers.
- `seenDamage` keeps the library GETs' markers.

Each renderer checks the page's files before it binds an editor or runs an auto-save, and draws the notice instead.
`routes.js` and `charter-pack.js` use the helpers that `admin.js` exposes on `window.IolantheAdmin`. A vm sandbox test
(`test/damaged-page.test.js`) runs `admin.js` on the pages that matter.

**Tech Stack:** Plain browser JavaScript, no build step and no npm packages; `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-10-damaged-file-notice-design.md`, A1 to A10. The server part is iolanthe-server
`docs/superpowers/plans/2026-10-10-damaged-file-notice-server.md`, done first. Against a server without the marker,
every page behaves as today. The browser check in Task 13 needs the server branch running.

---

## Before you start

- Work only in `S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/damaged-file-notice/iolanthe-admin`, on branch
  `feat/damaged-file-notice` (cut from `origin/main`, `5e6a50c`). Every command below runs from that folder.
- Never `git checkout`, `switch`, `stash` or `add -A` in the main checkouts. Stage files by name.
- Never rebase; merge `origin/main` if you need it (OneDrive read-only `.git` folders).
- Baseline: `node --test` passes 210 tests.
- Every server text that goes into HTML (file names, problems) passes through `escapeHtml`.
- `admin.js` is one IIFE. Function declarations are hoisted, and `const`s at its top level are initialised before
  `DOMContentLoaded`, so a helper may use a `const` declared further down.

## File structure

| File | Change |
|---|---|
| `damaged-core.js` | new: `PAGE_FILES`, `DATES_MESSAGE`, `damagedIn`, `bundleDamage`, `pageDamage`, `refusal`, `fileList`, `noticeText`, `stripText`, `bannerText`, `pickerMessage` |
| `test/damaged-core.test.js` | new: the core's tests |
| `test/damaged-page.test.js` | new: `admin.js` in a vm sandbox on Galley Menus, Hotel Guests and the Charter pages |
| `index.html` | `damaged-core.js` before `admin.js`; every `?v=` becomes `admin-damaged-files` |
| `admin.js` | `seenDamage`, the page blocks in `renderGalley` / `renderHotel` / `renderCharter`, the notice, strip and banner helpers, reserved periods, the import pickers, freshness, exports |
| `routes.js` | a damaged `routes.json` shows the card in the planner; a damaged `anchorages.json` a strip |
| `charter-pack.js` | a damaged `pack.json` shows the card; the cover upload's error goes through `throwAdminApiError` |
| `admin.css` | `.damaged-notice`, `.damaged-strip`, `.damaged-banner` |
| `CLAUDE.md` | the module and the behaviour, test count |

---

### Task 1: `damaged-core.js`

**Files:**
- Create: `damaged-core.js`
- Test: `test/damaged-core.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/damaged-core.test.js`:

```js
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
  assert.ok(Object.isFrozen(core.PAGE_FILES.galley));
  assert.ok(Object.isFrozen(core.PAGE_FILES.galley.menus));
});

test("damagedIn: a copy's problem, or \"\" when it is not marked", () => {
  assert.equal(core.damagedIn({ menus: [], revision: 0, damaged: PROBLEM }), PROBLEM);
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
  assert.deepEqual(core.bannerText("cocktails.json", "is not a JSON object or list"), {
    lead: "cocktails.json can't be read, so your change wasn't saved.",
    rest: "Copy anything you need from this page, then reload it once the file is fixed or restored.",
    detail: "cocktails.json is not a JSON object or list."
  });
  assert.equal(core.pickerMessage("Larry", "menus.json"), "Larry's menus.json can't be read, so its menus can't be imported. Fix or restore it first.");
  assert.equal(core.pickerMessage("Larry", "crew_list.json"), "Larry's crew_list.json can't be read, so its crew can't be imported. Fix or restore it first.");
  assert.equal(core.DATES_MESSAGE, "reserved-periods.json can't be read, so new dates can't be checked against the reserved periods. Fix or restore it first.");
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/damaged-core.test.js`
Expected: FAIL with `Cannot find module '../damaged-core.js'`.

- [ ] **Step 3: Implement**

Create `damaged-core.js`:

```js
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
    "anchorages.json": "Anchorages aren't shown, and can't be added or changed until it's fixed or restored."
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
    const files = (PAGE_FILES[section] && PAGE_FILES[section][panel]) || [];
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
      rest: STRIPS[file] || "It can't be shown or changed until it's fixed or restored.",
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
    return `${charterName}'s ${file} can't be read, so ${PICKED[file] || "it"} can't be imported. Fix or restore it first.`;
  }

  return { PAGE_FILES, DATES_MESSAGE, damagedIn, bundleDamage, pageDamage, refusal, fileList, noticeText, stripText, bannerText, pickerMessage };
});
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/damaged-core.test.js`, then `node --test`
Expected: PASS, 8 tests in the file and 218 in all.

- [ ] **Step 5: Commit**

```bash
git add damaged-core.js test/damaged-core.test.js
git commit -m "feat(admin): damaged-core.js, the page table, the marker readers and the wording (spec C 4.6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Load `damaged-core.js` and bump the asset versions (`index.html`)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Edit**

Run: `sed -i 's/?v=admin-conflict-safe/?v=admin-damaged-files/g' index.html`

Then add the script after `merge-core.js`, replacing:

```html
  <script src="/admin/merge-core.js?v=admin-damaged-files" defer></script>
```

with:

```html
  <script src="/admin/merge-core.js?v=admin-damaged-files" defer></script>
  <script src="/admin/damaged-core.js?v=admin-damaged-files" defer></script>
```

- [ ] **Step 2: Check**

Run: `grep -c "admin-conflict-safe" index.html; grep -n "damaged-core" index.html; node --test`
Expected: `0`, one line for `damaged-core.js` (line 119), and 218 passing. `startup-order.test.js` checks that every
script is `defer`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore(admin): load damaged-core.js; bump the asset versions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Galley Menus shows the notice instead of the page, and saves nothing

This is the case that changed good data: 0 days from a damaged `charter.json` made the day sync deactivate every filled
menu day and save `menus.json`.

**Files:**
- Create: `test/damaged-page.test.js`
- Modify: `admin.js`: `seenDamage` (next to `seenRevisions`, about line 14497), `rememberLibraryBase` (about line 14499),
  the new helper block after it, `renderGalley` (about line 7131)
- Modify: `admin.css` (after the refused-access card, about line 607)

- [ ] **Step 1: Write the failing test**

Create `test/damaged-page.test.js`:

```js
"use strict";

// Spec C §4.6 (SC-D16): a page that needs a data file the server can't read shows the notice instead of its editor, and
// saves nothing. Galley → Menus matters most: with a damaged charter.json it read 0 charter days, and until 2026-10 its
// day sync made every filled menu day inactive and saved menus.json by itself, which the server accepted (menus.json
// itself was fine). These run admin.js in a vm sandbox with the pure modules it uses, as refused-access.test.js does,
// with a workspace that keeps everything drawn into it. admin.js escapes the apostrophe, so "can't" is drawn as
// can&#39;t (a check for the plain text would never match, and a "no notice" check would pass vacuously).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SCRIPTS = ["charters-core.js", "itinerary-core.js", "merge-core.js", "damaged-core.js", "admin.js"];

// A stand-in for any DOM object these tests don't check: every property is another stand-in, calling one returns one,
// writes are ignored.
function standIn() {
  return new Proxy(function () {}, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return () => "";
      if (prop === Symbol.iterator) return function* () {};
      if (prop === "then") return undefined;
      return standIn();
    },
    set: () => true,
    apply: () => standIn(),
    construct: () => standIn()
  });
}

// An element that keeps what is written to it, and every innerHTML in order (drawn). Anything else is a stand-in.
function keepingElement() {
  const kept = { innerHTML: "", textContent: "", className: "", drawn: [] };
  return new Proxy(kept, {
    get: (target, prop) => (Object.prototype.hasOwnProperty.call(target, prop) ? target[prop] : standIn()),
    set: (target, prop, value) => {
      target[prop] = value;
      if (prop === "innerHTML") target.drawn.push(String(value));
      return true;
    }
  });
}

const settle = () => new Promise(resolve => setImmediate(resolve));
async function settleAll() {
  for (let i = 0; i < 12; i += 1) {
    await settle();
  }
}

const STAMP = { saved_by: "galley", saved_at: "2026-10-01T00:00:00.000Z" };
const PROBLEM = "is not valid JSON at line 3 column 5";
const DATED = { name: "Csaba", start_date: "2026-11-01", end_date: "2026-11-03", guest_count: 2, revision: 4, ...STAMP };
// What the server sends for a damaged charter.json (iolanthe-server#16): the defaults at revision 0 and `damaged`.
const DAMAGED = { name: "Csaba", start_date: null, end_date: null, guest_count: 1, revision: 0, saved_by: "", saved_at: "", damaged: PROBLEM };
// The same defaults unmarked: an older server, or a charter that really has no dates.
const UNDATED = { name: "Csaba", start_date: null, end_date: null, guest_count: 1, revision: 0, saved_by: "", saved_at: "" };

// Three filled menu days, for a charter of three days.
const menuDay = n => ({ id: `m-day-${n}`, order: n, day: n, charter_day: n, active: true, label: `Day ${n}`, todays_notes: `Beach barbecue ${n}`, breakfast: [], lunch: [], dinner: [], snacks: [] });

function bundleWith(charterJson) {
  return {
    charter_id: "csaba",
    "charter.json": charterJson,
    "itinerary.json": { version: 2, revision: 1, route: { points: [] }, activities: [], dirty_stop_ids: [] },
    "crew_list.json": { crew: [], revision: 1, ...STAMP },
    "guest_list.json": { guests: [], revision: 1, ...STAMP },
    "menus.json": { menus: [1, 2, 3].map(menuDay), revision: 3, ...STAMP },
    "guest_drinks.json": { sections: [], revision: 1, ...STAMP },
    "charter-alcohol-purchases.json": { items: [] }
  };
}

const CHARTER_SUMMARY = { id: "csaba", name: "Csaba", charter: { start_date: "2026-11-01", end_date: "2026-11-03" }, stops: 0, nights: 2, status: "upcoming" };
const signedIn = (department, sections) => ({
  role: "bridge",
  department,
  authenticated: true,
  active_charter: "csaba",
  charters: [CHARTER_SUMMARY],
  allowed_sections: sections,
  allowed_departments: sections.filter(section => section !== "settings"),
  settings: { sessionTimeoutMinutes: 30, isDevelopment: false }
});
const GALLEY = signedIn("galley", ["galley"]);

// Signs in with bootstrap, which opens its first section on its default page. Each request is answered from answers by
// its path (anything else gets {}). Returns the requests sent, the workspace and the window.
async function openAdmin(bootstrap, answers) {
  const requests = [];
  const workspace = keepingElement();
  const elements = { workspace, "status-panel": keepingElement() };
  const listeners = {};
  const document = new Proxy(standIn(), {
    get(target, prop) {
      if (prop === "addEventListener") {
        return (type, listener) => { (listeners[type] = listeners[type] || []).push(listener); };
      }
      if (prop === "getElementById") return id => elements[id] || standIn();
      return target[prop];
    }
  });
  const replies = { "/api/admin/bootstrap": bootstrap, ...answers };
  const window = {
    document,
    location: { search: "?key=test", origin: "http://admin.test", href: "http://admin.test/admin/?key=test" },
    addEventListener: () => {},
    fetch: async (url, options = {}) => {
      const { pathname } = new URL(String(url));
      requests.push({ method: options.method || "GET", pathname });
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => replies[pathname] || {} };
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    URL,
    URLSearchParams
  };
  window.window = window;
  const context = vm.createContext(window);
  SCRIPTS.forEach(name => vm.runInContext(fs.readFileSync(path.join(ROOT, name), "utf8"), context, { filename: name }));
  (listeners.DOMContentLoaded || []).forEach(listener => listener({ type: "DOMContentLoaded" }));
  await settleAll();
  return { requests, workspace, window };
}

const saves = requests => requests.filter(request => request.method !== "GET");
const everDrawn = (page, pattern) => page.workspace.drawn.some(html => pattern.test(html));

test("an unmarked bundle with no charter dates still syncs and saves the menus (the sandbox sees saves)", async () => {
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": bundleWith(UNDATED) });
  assert.deepEqual(saves(page.requests).map(request => request.pathname), ["/api/admin/charter/csaba/save"]);
});

test("Galley → Menus with charter.json marked damaged: the notice instead, and nothing saved", async () => {
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": bundleWith(DAMAGED) });
  assert.deepEqual(saves(page.requests), []);
  assert.match(page.workspace.innerHTML, /charter\.json can&#39;t be read/);
  assert.match(page.workspace.innerHTML, /charter\.json is not valid JSON at line 3 column 5\./);
  assert.match(page.workspace.innerHTML, /Nothing has been changed\./);
  assert.equal(everDrawn(page, /id="menu-days"/), false);
});

test("Galley → Menus with a good bundle draws the menus and saves nothing", async () => {
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": bundleWith(DATED) });
  assert.deepEqual(saves(page.requests), []);
  assert.ok(everDrawn(page, /id="menu-days"/));
  assert.equal(everDrawn(page, /can&#39;t be read/), false);
});
```

- [ ] **Step 2: Run it and watch the right test fail**

Run: `node --test test/damaged-page.test.js`
Expected: the first and third tests PASS. The second FAILS: `saves()` holds the `/api/admin/charter/csaba/save` POST and
no notice is drawn. If the first test fails, the sandbox is missing a browser API that `admin.js` touches. Add a
stand-in for it to `window` in `openAdmin`, as for `matchMedia`, and run again before going on.

- [ ] **Step 3: Implement the helpers and the Galley block**

In `admin.js`, next to `const mergeCore = () => window.IolantheMerge;` (about line 14472), add:

```js
  const damagedCore = () => window.IolantheDamaged;
```

Replace:

```js
  const seenRevisions = {};
```

with:

```js
  const seenRevisions = {};
  // Spec C §4.6: what each library file's (and Available Alcohol's) last load said of its damage: the problem, or "".
  const seenDamage = {};
```

In `rememberLibraryBase`, replace:

```js
    seenRevisions[file] = mergeCore().revisionOf(served);
    return workingCopy;
```

with:

```js
    seenRevisions[file] = mergeCore().revisionOf(served);
    seenDamage[file] = damagedCore().damagedIn(served);
    return workingCopy;
```

Right after the closing brace of `rememberLibraryBase`, insert:

```js

  // ---- A file the server can't read (spec C §4.6, SC-D16) ---------------------------------------------------------
  // Its GET marks it `damaged` (the bundle on each file's object, a single-file GET at its top level), and a save over it
  // is refused with {code: "damaged", file, damaged}. A page that needs such a file (damaged-core.js PAGE_FILES) draws
  // the notice instead of its editor, before any editor or auto-save is bound.

  // The files the open page needs that this render's loads found damaged: [{file, problem}] in the page's order.
  function pageDamage(section, panel) {
    return damagedCore().pageDamage(section, panel, { ...seenDamage, ...damagedCore().bundleDamage(state.bundle) });
  }

  // The card a page shows instead of its editor. options.embedded: inside another card (the Route planner, the Charter
  // Pack). options.libraryRoutes: the Route page's way to the library routes, which don't use this charter's files.
  function damagedNoticeHtml(list, options = {}) {
    const text = damagedCore().noticeText(list);
    const tag = options.embedded ? "div" : "section";
    return `
      <${tag} class="${options.embedded ? "" : "card full "}damaged-notice" role="alert">
        <h2>${escapeHtml(text.heading)}</h2>
        <p>${escapeHtml(text.body)}</p>
        ${text.details.length ? `<ul class="damaged-details">${text.details.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
        <div class="button-row">
          ${iconButtonHtml("refresh", "Try again", " data-damaged-retry")}
          ${options.libraryRoutes ? `<button type="button" data-damaged-library-routes>Work on the library routes</button>` : ""}
        </div>
      </${tag}>
    `;
  }

  // Try again draws the page again; "Work on the library routes" opens the Route page's library subject.
  function bindDamagedNotice(container) {
    container.querySelectorAll("[data-damaged-retry]").forEach(button => button.addEventListener("click", () => renderSection()));
    container.querySelectorAll("[data-damaged-library-routes]").forEach(button => button.addEventListener("click", () => showCharterPanel("routes", { subject: "library" })));
  }
```

In `renderGalley`, replace:

```js
      const itinerary = bundle["itinerary.json"] || {};
      const activeItineraryDayCount = window.IolantheItineraryCore
```

with:

```js
      const itinerary = bundle["itinerary.json"] || {};
      // Spec C §4.6: the notice instead of the page, before the menu sync. 0 days from a damaged charter.json would make
      // every filled day inactive and save that.
      const blocked = pageDamage("galley", activePanel);
      if (blocked.length) {
        els.workspace.innerHTML = sectionShell("galley", galleyPanelsForGuestList(guestList), activePanel, damagedNoticeHtml(blocked), sectionToolbarHtml("galley"));
        bindSectionNav("galley", renderGalley);
        bindSectionToolbar("galley", renderGalley);
        bindDamagedNotice(els.workspace);
        return;
      }
      const activeItineraryDayCount = window.IolantheItineraryCore
```

- [ ] **Step 4: Add the styles**

In `admin.css`, insert this after the `.status-panel.status-panel--refused { … }` block (it ends with
`text-wrap: balance;` and `}`, about line 607):

```css

/* Spec C §4.6 (SC-D16): a data file the server can't read. The notice takes the place of a page's editor; a strip sits
   above a page that otherwise works; a banner follows a refused save. The refused-access card's error tone. */
.damaged-notice,
.card.damaged-notice,
.damaged-strip,
.damaged-banner {
  border: 1px solid #f0b8b1;
  border-radius: 8px;
  background: #f7e3e1;
  color: var(--ink);
}

.damaged-notice,
.card.damaged-notice {
  display: grid;
  justify-items: start;
  gap: 0.6rem;
  padding: 1rem 1.1rem;
}

.damaged-notice h2 {
  margin: 0;
  color: var(--danger);
  font-size: 1.15rem;
}

.damaged-notice p,
.damaged-strip p,
.damaged-banner p {
  margin: 0;
  line-height: 1.4;
}

.damaged-details {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--muted);
  font-size: 0.86rem;
}

.damaged-strip,
.damaged-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  font-size: 0.9rem;
}

.damaged-text {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.damaged-strip strong,
.damaged-banner strong {
  color: var(--danger);
}

.damaged-detail {
  color: var(--muted);
  font-size: 0.82rem;
}

.damaged-banner > .admin-icon-button {
  flex: none;
  margin-left: auto;
}

@media (max-width: 640px) {
  .damaged-strip,
  .damaged-banner {
    flex-wrap: wrap;
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/damaged-page.test.js`, then `node --test`
Expected: PASS, 3 tests in the file and 221 in all.

- [ ] **Step 6: Commit**

```bash
git add admin.js admin.css test/damaged-page.test.js
git commit -m "feat(admin): Galley Menus shows a notice instead of the page when a file it needs can't be read" -m "Spec C 4.6: with a damaged charter.json the day sync read 0 days, made every filled menu day inactive and saved menus.json, which the server accepted. The page now draws the notice before any sync or editor." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Hotel pages

**Files:**
- Modify: `admin.js`: `renderHotel` (about line 14286) and a new `noteRevisionDamage` in the helper block
- Test: `test/damaged-page.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/damaged-page.test.js`:

```js
const HOTEL = signedIn("hotel", ["hotel"]);

test("Hotel → Guests with charter.json marked damaged: the notice instead of the guest list", async () => {
  const page = await openAdmin(HOTEL, { "/api/admin/charter/csaba": bundleWith(DAMAGED) });
  assert.match(page.workspace.innerHTML, /charter\.json can&#39;t be read/);
  assert.equal(everDrawn(page, /id="guest-editor-list"/), false);
  assert.deepEqual(saves(page.requests), []);
});

test("Hotel → Guests with a good bundle draws the guest list", async () => {
  const page = await openAdmin(HOTEL, { "/api/admin/charter/csaba": bundleWith(DATED) });
  assert.ok(everDrawn(page, /id="guest-editor-list"/));
  assert.equal(everDrawn(page, /can&#39;t be read/), false);
});
```

- [ ] **Step 2: Run them and watch the first fail**

Run: `node --test test/damaged-page.test.js`
Expected: `Hotel → Guests with charter.json marked damaged` FAILS: no notice, and the guest list is drawn.

- [ ] **Step 3: Implement**

In the helper block (after `bindDamagedNotice`), add:

```js

  // Purchased Alcohol loads neither the drink stocks nor Available Alcohol, so it reads their state from the revisions,
  // whose stamps carry `damaged` (SC-D16).
  async function noteRevisionDamage(charterId, files) {
    const stamps = await api(`/api/admin/revisions?charter=${encodeURIComponent(charterId)}`);
    const served = { ...(stamps && stamps.library), ...(stamps && stamps.charter) };
    files.forEach(file => {
      seenDamage[file] = damagedCore().damagedIn(served[file]);
    });
  }
```

In `renderHotel`, replace:

```js
      const purchases = activePanel === "purchased-alcohol" ? await loadCharterAlcoholPurchases(state.selectedCharter) : null;
      let content = "";
```

with:

```js
      const purchases = activePanel === "purchased-alcohol" ? await loadCharterAlcoholPurchases(state.selectedCharter) : null;
      if (activePanel === "purchased-alcohol") {
        await noteRevisionDamage(state.selectedCharter, ["drink-stocks.json", "available-alcohol.json"]);
      }
      // Spec C §4.6: the notice instead of a page that needs a file the server can't read.
      const blocked = pageDamage("hotel", activePanel);
      if (blocked.length) {
        els.workspace.innerHTML = sectionShell("hotel", panels, activePanel, damagedNoticeHtml(blocked), sectionToolbarHtml("hotel"));
        bindSectionNav("hotel", renderHotel);
        bindSectionToolbar("hotel", renderHotel);
        bindDamagedNotice(els.workspace);
        return;
      }
      let content = "";
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/damaged-page.test.js`, then `node --test`
Expected: PASS, 5 in the file and 223 in all.

- [ ] **Step 5: Commit**

```bash
git add admin.js test/damaged-page.test.js
git commit -m "feat(admin): the Hotel pages show the notice when a file they need can't be read" -m "Purchased Alcohol reads the drink stocks' and Available Alcohol's state from /api/admin/revisions." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Reserved periods: the strip, the period editor, and charter dates

**Files:**
- Modify: `admin.js`:
  - `state.reservedPeriods` (line 12)
  - `loadReservedPeriods` (about line 1658)
  - `openCreateCharterModal`'s `syncDates` (about line 5142)
  - `openReservedPeriodModal` (about line 5269)
  - `saveReservedPeriods` (about line 5374)
  - `syncCharterInfoOverlap` and a new `charterDatesHeldMessage` (about line 6738)
  - `bindCharterInfoPanel`'s save (about line 6814)
  - `renderCharter` (about line 7104)
  - the helper block (`damagedStripHtml`, `reservedPeriodsStripHtml`)
- Test: `test/damaged-page.test.js`

- [ ] **Step 1: Write the failing test**

Append to `test/damaged-page.test.js`:

```js
const CHARTER_ADMIN = signedIn("charter", ["charter", "galley", "hotel", "settings"]);
const charterAnswers = (bundle, extra = {}) => ({
  "/api/admin/charter/csaba": bundle,
  "/api/admin/sites": { sites: [], revision: 2, ...STAMP },
  "/api/admin/reserved-periods": { revision: 1, periods: [] },
  ...extra
});

test("Charter pages with reserved-periods.json marked damaged: the strip under the band, above a page that still works", async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundleWith(DATED), {
 "/api/admin/reserved-periods": { revision: 0, periods: [], damaged: "is not valid JSON at line 2 column 1" }
  }));
  assert.ok(page.workspace.drawn.some(html => html.includes('class="damaged-strip"')
 && html.includes("reserved-periods.json can&#39;t be read.")
 && html.includes("reserved-periods.json is not valid JSON at line 2 column 1.")
 && html.includes('id="charter-info-form"')));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/damaged-page.test.js`
Expected: that test FAILS, because no strip is drawn.

- [ ] **Step 3: Implement**

**1.** `state` (line 12): replace `reservedPeriods: { revision: 0, periods: [] },` with:

```js
    reservedPeriods: { revision: 0, periods: [], damaged: "" },   // damaged: spec C §4.6, the server's problem or ""
```

**2.** `loadReservedPeriods`: replace:

```js
      state.reservedPeriods = {
        revision: Number.isInteger(data && data.revision) ? data.revision : 0,
        periods: Array.isArray(data && data.periods) ? data.periods : []
      };
```

with:

```js
      state.reservedPeriods = {
        revision: Number.isInteger(data && data.revision) ? data.revision : 0,
        periods: Array.isArray(data && data.periods) ? data.periods : [],
        damaged: damagedCore().damagedIn(data)
      };
```

**3.** `saveReservedPeriods`: replace:

```js
      state.reservedPeriods = { revision: saved.revision, periods: Array.isArray(saved.periods) ? saved.periods : [] };
```

with:

```js
      state.reservedPeriods = { revision: saved.revision, periods: Array.isArray(saved.periods) ? saved.periods : [], damaged: "" };
```

**4.** `openReservedPeriodModal`: right after its `canManageCharterAdmin()` check (the `return;` and `}` that follow
`setStatus("Only Charter Admin on Bridge can edit reserved periods.", "error");`), insert:

```js
    if (state.reservedPeriods.damaged) {
      // Spec C §4.6: the editor would start from no periods, and its save would be refused.
      const text = damagedCore().stripText("reserved-periods.json", state.reservedPeriods.damaged);
      showAdminMessage({ title: "Reserved periods", message: `${text.lead} ${text.rest}`, tone: "danger" });
      return;
    }
```

**5.** In the helper block, add:

```js

  // A one-line notice above a page that otherwise works (spec C §4.6): reserved periods, anchorages.
  function damagedStripHtml(file, problem) {
    const text = damagedCore().stripText(file, problem);
    return `
      <div class="damaged-strip" role="status">
        <div class="damaged-text">
          <p><strong>${escapeHtml(text.lead)}</strong> ${escapeHtml(text.rest)}</p>
          ${text.detail ? `<p class="damaged-detail">${escapeHtml(text.detail)}</p>` : ""}
        </div>
      </div>
    `;
  }

  // Under the Gantt band on every Charter page while reserved-periods.json can't be read.
  function reservedPeriodsStripHtml() {
    return state.reservedPeriods.damaged ? damagedStripHtml("reserved-periods.json", state.reservedPeriods.damaged) : "";
  }
```

**6.** Above `syncCharterInfoOverlap`, add:

```js
  // Spec C §4.6, the server's rule (S3) ahead of it: while reserved-periods.json can't be read, dates that differ from
  // the stored ones can't be checked against the periods, so they wait with this message. "" otherwise.
  function charterDatesHeldMessage(core, candidate, stored) {
    const changed = String(candidate.start_date || "") !== String(stored.start_date || "")
      || String(candidate.end_date || "") !== String(stored.end_date || "");
    return state.reservedPeriods.damaged && changed && core.nights(candidate) !== null ? damagedCore().DATES_MESSAGE : "";
  }

```

In `syncCharterInfoOverlap`, replace:

```js
    const message = dateOrderMessage(core, candidate) || (clashes.length ? `${core.overlapMessage(clashes)}. Choose other dates.` : "");
```

with:

```js
    const stored = state.bundle && state.bundle["charter.json"] ? state.bundle["charter.json"] : {};
    const message = dateOrderMessage(core, candidate) || charterDatesHeldMessage(core, candidate, stored)
      || (clashes.length ? `${core.overlapMessage(clashes)}. Choose other dates.` : "");
```

**7.** In `bindCharterInfoPanel`'s `save`, replace:

```js
        if (syncCharterInfoOverlap()) {
          throw new Error("These dates overlap another charter or a reserved period.");
        }
```

with:

```js
        const overlap = syncCharterInfoOverlap();
        if (overlap) {
          throw new Error(overlap === damagedCore().DATES_MESSAGE ? overlap : "These dates overlap another charter or a reserved period.");
        }
```

**8.** In `openCreateCharterModal`'s `syncDates`, replace the two lines below. The period editor has the same
`const message` line, so the `const clashes` line above it, with `id: ""`, is part of the match:

```js
      const clashes = core.findOverlaps({ id: "", start_date: startInput.value, end_date: endInput.value }, core.overlapEntries(state.charters, state.reservedPeriods.periods), "charter");
      const message = dateOrderMessage(core, { start_date: startInput.value, end_date: endInput.value }) || (clashes.length ? `${core.overlapMessage(clashes)}. Choose other dates.` : "");
```

with:

```js
      const clashes = core.findOverlaps({ id: "", start_date: startInput.value, end_date: endInput.value }, core.overlapEntries(state.charters, state.reservedPeriods.periods), "charter");
      const range = { start_date: startInput.value, end_date: endInput.value };
      const message = dateOrderMessage(core, range) || charterDatesHeldMessage(core, range, {})
        || (clashes.length ? `${core.overlapMessage(clashes)}. Choose other dates.` : "");
```

**9.** In `renderCharter`, replace:

```js
      const content = charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary);
      paint(content);
```

with:

```js
      const content = charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary);
      paint(reservedPeriodsStripHtml() + content);
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/damaged-page.test.js`, then `node --test`
Expected: PASS, 6 in the file and 224 in all.

- [ ] **Step 5: Commit**

```bash
git add admin.js test/damaged-page.test.js
git commit -m "feat(admin): reserved periods that can't be read: a strip on the Charter pages, no period editor, new dates wait" -m "Spec C 4.6: Charter Admin and the create dialog hold new dates with the reason, as the server refuses them (S3)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Charter pages: Charter Admin, Crew, Site Editor, and this charter's route

**Files:**
- Modify: `admin.js`: `loadSites` and the sites save (about lines 3623 and 4772), and `renderCharter` (about line 7090)
- Test: `test/damaged-page.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/damaged-page.test.js`:

```js
test("Charter Admin with charter.json marked damaged: the notice instead of the form", async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundleWith(DAMAGED)));
  assert.match(page.workspace.innerHTML, /charter\.json can&#39;t be read/);
  assert.equal(everDrawn(page, /id="charter-info-form"/), false);
});

test("Charter Admin with a good bundle draws the form", async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundleWith(DATED)));
  assert.ok(everDrawn(page, /id="charter-info-form"/));
  assert.equal(everDrawn(page, /can&#39;t be read/), false);
});

// The next three start on Charter Admin with charter.json damaged, so that page binds no form, and no unsaved-changes
// question (which nobody answers in the sandbox) stops showCharterPanel. Each heading names only the files its page needs.
test("Crew with a plain-list crew_list.json (marked damaged): the notice instead of the crew editor", { timeout: 5000 }, async () => {
  const bundle = { ...bundleWith(DAMAGED), "crew_list.json": { crew: [], revision: 0, saved_by: "", saved_at: "", damaged: "is not a JSON object" } };
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundle));
  await page.window.IolantheAdmin.showCharterPanel("crew");
  await settleAll();
  assert.match(page.workspace.innerHTML, /<h2>crew_list\.json can&#39;t be read<\/h2>/);
  assert.match(page.workspace.innerHTML, /crew_list\.json is not a JSON object\./);
  assert.doesNotMatch(page.workspace.innerHTML, /id="crew-editor-list"/);
});

test("Site Editor with sites.json marked damaged: the notice instead of the sites", { timeout: 5000 }, async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundleWith(DAMAGED), {
    "/api/admin/sites": { sites: [], revision: 0, saved_by: "", saved_at: "", damaged: "is empty" }
  }));
  await page.window.IolantheAdmin.showCharterPanel("sites");
  await settleAll();
  assert.match(page.workspace.innerHTML, /<h2>sites\.json can&#39;t be read<\/h2>/);
  assert.doesNotMatch(page.workspace.innerHTML, /id="site-editor-list"/);
});

test("this charter's route with itinerary.json and charter.json marked damaged: one notice for both, and the way to the library routes", { timeout: 5000 }, async () => {
  const bundle = { ...bundleWith(DAMAGED), "itinerary.json": { version: 2, revision: 0, route: { points: [] }, activities: [], dirty_stop_ids: [], damaged: "is empty" } };
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundle));
  await page.window.IolantheAdmin.showCharterPanel("routes");
  await settleAll();
  assert.match(page.workspace.innerHTML, /<h2>itinerary\.json and charter\.json can&#39;t be read<\/h2>/);
  assert.match(page.workspace.innerHTML, /until they&#39;re fixed or restored/);
  assert.match(page.workspace.innerHTML, /data-damaged-library-routes/);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/damaged-page.test.js`
Expected: the four "marked damaged" tests FAIL. `Charter Admin with a good bundle draws the form` passes.

Without the block, Charter Admin binds its form first, so the three that navigate may fail by their 5-second timeout
instead of an assertion. That is still the right failure. Once the block is in, Charter Admin binds nothing and they
answer at once.

- [ ] **Step 3: Implement**

The line below appears twice, in `loadSites` (about line 3623) and after a sites save (about line 4772). Replace both
(Edit with `replace_all`):

```js
    seenRevisions["sites.json"] = mergeCore().revisionOf(served);
```

with:

```js
    seenRevisions["sites.json"] = mergeCore().revisionOf(served);
    seenDamage["sites.json"] = damagedCore().damagedIn(served);
```

In `renderCharter`, replace:

```js
      const crewList = normalizeCrewEditorList(bundle["crew_list.json"]);
      const content = charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary);
```

with:

```js
      const crewList = normalizeCrewEditorList(bundle["crew_list.json"]);
      // Spec C §4.6: the notice instead of a page that needs a file the server can't read. Route & Itinerary needs this
      // charter's files only on this charter's route; the library routes stay usable. The Charter Pack checks its own.
      const blocked = activePanel === "routes" && state.routesSubject !== "charter" ? [] : pageDamage("charter", activePanel);
      if (blocked.length) {
        state.charterInfoClash = null;
        paint(reservedPeriodsStripHtml() + damagedNoticeHtml(blocked, { libraryRoutes: activePanel === "routes" }));
        bindDamagedNotice(els.workspace);
        return;
      }
      const content = charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary);
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/damaged-page.test.js`, then `node --test`
Expected: PASS, 11 in the file and 229 in all.

- [ ] **Step 5: Commit**

```bash
git add admin.js test/damaged-page.test.js
git commit -m "feat(admin): Charter Admin, Crew, Site Editor and this charter's route show the notice for a file they need" -m "Spec C 4.6: on Route & Itinerary only this charter's route is blocked, with a way to the library routes." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: A refused save gets a banner, and a page never saves a file it loaded damaged

#16's "what the server cannot close" gap is the reason for the guard. A page that loaded a file while it was damaged
holds the defaults at revision 0. Once the file is repaired, if its revision is 0 too (not saved since migration v7, or
restored from before spec C), that page's save passes the revision check and replaces the repaired file. The notice
keeps the blocked pages from saving. Two kinds of view can still save from such a load:
- views that aren't blocked: the Route page's Edit site saves `sites.json`, and the drink stock picker loads its own copy;
- a page whose file broke after it loaded.

So `saveRevisioned` refuses a base marked damaged, and merge-core never merges the marker or counts it as a change.

**Files:**
- Modify: `merge-core.js` (`mergeFields`, `changedFields`)
- Modify: `admin.js`:
  - `api` and `uploadSiteMedia` (about lines 150-237)
  - `throwAdminApiError` (about line 239)
  - `saveRevisioned` (about line 14511) and its four callers: `saveCharterFile`, `saveLibraryCopy`, `saveSitesLibrary`,
    and the Charter Admin form
  - the helper block (`showDamagedBanner`, `damagedBaseError`)
  - the exports
- Test: `test/merge-core.test.js`, `test/damaged-page.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/merge-core.test.js`:

```js
test("the server's damaged marker is never merged in or counted as a change (SC-D16)", () => {
  const result = core.merge3({ name: "A" }, { name: "A", damaged: "is empty" }, { name: "A", revision: 2, saved_by: "hotel", saved_at: "2026-11-03T06:02:00.000Z" }, {});
  assert.equal("damaged" in result.merged, false);
  assert.equal("damaged" in result.rebased, false);
  assert.deepEqual(core.changedFields({ name: "A", damaged: "is empty" }, { name: "A" }), []);
});
```

Append to `test/damaged-page.test.js`:

```js
test("a save from a copy loaded while its file was damaged is refused before it is sent, even once the file is repaired", async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundleWith(DATED), {
    "/api/admin/sites": { sites: [], revision: 0, saved_by: "", saved_at: "", damaged: "is empty" }
  }));
  // The Route page's Edit site saves through saveSitesLibrary from this load (the Site Editor shows the notice instead).
  await assert.rejects(
    page.window.IolantheAdmin.saveSitesLibrary({ sites: [{ id: "coron", title: "Coron", latitude: 11.9975, longitude: 120.201 }] }, "Site saved."),
    { message: /^sites\.json can't be read, so your change wasn't saved\./ }
  );
  assert.deepEqual(saves(page.requests), []);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/merge-core.test.js test/damaged-page.test.js`
Expected:
- The merge-core test FAILS: `merged` keeps `damaged`, and `changedFields` gives `["damaged"]`.
- The sandbox test FAILS with `Missing expected rejection`, because the save was sent.

- [ ] **Step 3: Implement in `merge-core.js`**

Replace:

```js
  const STAMP_KEYS = ["revision", "saved_by", "saved_at"];
```

with:

```js
  const STAMP_KEYS = ["revision", "saved_by", "saved_at"];
  // The server's mark on a copy made from defaults (SC-D16): never part of a file, so never merged, kept or a change.
  const MARKER_KEYS = ["damaged"];
```

In `mergeFields`, replace:

```js
    const skip = new Set([...STAMP_KEYS, ...(spec.derived || [])]);
```

with:

```js
    const skip = new Set([...STAMP_KEYS, ...MARKER_KEYS, ...(spec.derived || [])]);
```

and, in the same function, replace:

```js
        if (!STAMP_KEYS.includes(field)) {
```

with:

```js
        if (!STAMP_KEYS.includes(field) && !MARKER_KEYS.includes(field)) {
```

In `changedFields`, replace:

```js
    const ignore = new Set([...STAMP_KEYS, ...(skip || [])]);
```

with:

```js
    const ignore = new Set([...STAMP_KEYS, ...MARKER_KEYS, ...(skip || [])]);
```

- [ ] **Step 4: Implement the banner in `admin.js`**

**1.** In `api`, replace:

```js
      throwAdminApiError(response, payload, "Request failed");
```

with:

```js
      throwAdminApiError(response, payload, "Request failed", options && options.method);
```

**2.** In `uploadSiteMedia`, replace:

```js
      throwAdminApiError(response, payload, "Image upload failed");
```

with:

```js
      throwAdminApiError(response, payload, "Image upload failed", "POST");
```

**3.** Replace the whole `throwAdminApiError` function with:

```js
  // method: the request's. A refusal of a damaged file (spec C §4.6) on anything but a GET also shows the banner.
  function throwAdminApiError(response, payload, fallbackMessage, method = "GET") {
    const message = payload && payload.error ? payload.error : String(payload || fallbackMessage);
    if (response.status === 401 && message === "Login required") {
      showOnboardingForLoginRequired();
      const error = new Error("");
      error.loginRequired = true;
      throw error;
    }
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    const refused = String(method).toUpperCase() !== "GET" && damagedCore() ? damagedCore().refusal(error) : null;
    if (refused) {
      showDamagedBanner(refused);
    }
    throw error;
  }
```

**4.** In the helper block, add:

```js

  // A save refused because its file can't be read: it broke after the page loaded, or the page loaded it damaged. The
  // banner goes at the top of the open page (under the band, the charter selector and any strip), replacing an earlier
  // one. What was typed stays on screen; Reload draws the page again, after the usual question when there are unsaved
  // changes.
  function showDamagedBanner(refused) {
    const content = els.workspace.querySelector(".section-content");
    if (!content) {
      return;
    }
    content.querySelectorAll(":scope > .damaged-banner").forEach(old => old.remove());
    const text = damagedCore().bannerText(refused.file, refused.problem);
    const banner = document.createElement("div");
    banner.className = "damaged-banner";
    banner.setAttribute("role", "alert");
    banner.innerHTML = `
      <div class="damaged-text">
        <p><strong>${escapeHtml(text.lead)}</strong> ${escapeHtml(text.rest)}</p>
        ${text.detail ? `<p class="damaged-detail">${escapeHtml(text.detail)}</p>` : ""}
      </div>
      ${iconButtonHtml("refresh", "Reload this page", " data-damaged-reload")}
    `;
    const top = Array.from(content.children).find(child => !child.matches(".charter-gantt-host, .section-toolbar, .damaged-strip"));
    content.insertBefore(banner, top || null);
    banner.querySelector("[data-damaged-reload]").addEventListener("click", async () => {
      if (await confirmDiscardPageChanges()) {
        renderSection();
      }
    });
  }

  // What a save gets when its page loaded the file damaged (saveRevisioned): the banner, and an error shaped like the
  // server's 500 for a damaged file.
  function damagedBaseError(file, problem) {
    const name = file || "This file";
    showDamagedBanner({ file: name, problem });
    const text = damagedCore().bannerText(name, problem);
    const error = new Error(`${text.lead} ${text.rest}`);
    error.status = 500;
    error.payload = { error: error.message, code: "damaged", file: name, damaged: problem };
    return error;
  }
```

**5.** In the `window.IolantheAdmin` exports, replace:

```js
    api,
    apiUrl,
```

with:

```js
    api,
    apiUrl,
    throwAdminApiError,
```

- [ ] **Step 5: Implement the guard in `saveRevisioned`**

Replace:

```js
  function saveRevisioned({ path, queue, schema, base, mine, normalize, wrap, unwrap }) {
    const snapshot = cloneData(mine);
```

with:

```js
  // file: the file's name, for the refusal below.
  function saveRevisioned({ path, queue, schema, base, mine, normalize, wrap, unwrap, file }) {
    // Spec C §4.6: a page never saves a file it loaded while the file was damaged, not even once it is repaired. A
    // repaired file at revision 0 would pass the server's revision check, and this page's copy was made from the defaults.
    const problem = damagedCore().damagedIn(base());
    if (problem) {
      return Promise.reject(damagedBaseError(file, problem));
    }
    const snapshot = cloneData(mine);
```

Then give each caller its file. In `saveCharterFile`, replace:

```js
        queue: `${charterId}/${file}`,
```

with:

```js
        queue: `${charterId}/${file}`,
        file,
```

In `saveLibraryCopy`, replace:

```js
      path,
      schema,
      base: () => libraryBases.get(workingCopy) || {},
```

with:

```js
      path,
      file,
      schema,
      base: () => libraryBases.get(workingCopy) || {},
```

In `saveSitesLibrary`, replace:

```js
      path: "/api/admin/sites/save",
      schema: "sites",
```

with:

```js
      path: "/api/admin/sites/save",
      file: "sites.json",
      schema: "sites",
```

In the Charter Admin form's save (`bindCharterInfoPanel`), replace:

```js
          queue: `${state.selectedCharter}/charter.json`,
```

with:

```js
          queue: `${state.selectedCharter}/charter.json`,
          file: "charter.json",
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/merge-core.test.js test/damaged-page.test.js`, then `node --test`
Expected: PASS, 231 in all. A server refusal's banner needs a real DOM (`.section-content`), so Task 13 checks it in
the browser.

- [ ] **Step 7: Commit**

```bash
git add merge-core.js admin.js test/merge-core.test.js test/damaged-page.test.js
git commit -m "feat(admin): a refused save gets a banner, and a page never saves a file it loaded damaged" -m "Spec C 4.6 and #16's 'what the server cannot close': a copy made from a damaged file's defaults at revision 0 would replace the file once it was repaired at revision 0 too. saveRevisioned refuses such a base before sending; merge-core never merges the damaged marker. A server refusal shows the same banner, and what was typed stays on screen." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The Route page: a damaged `routes.json` or `anchorages.json`

**Files:**
- Modify: `admin.js`: the helper block (`showDamagedStrip`) and the exports
- Modify: `routes.js`: `showLoadError` and `loadLibrary` (about line 1109), and the end of `bind` (about line 1258)
- Modify: `routes-places.js`: `saveLibrary` (about line 79)

- [ ] **Step 1: Implement in `admin.js`**

In the helper block, add:

```js

  // A strip at the top of a part of the page that otherwise works (the Route panel while anchorages.json can't be read),
  // after its header, replacing an earlier one.
  function showDamagedStrip(container, file, problem) {
    container.querySelectorAll(":scope > .damaged-strip").forEach(old => old.remove());
    const holder = document.createElement("div");
    holder.innerHTML = damagedStripHtml(file, problem);
    const header = container.querySelector(":scope > .card-header");
    if (header) {
      header.after(holder.firstElementChild);
    } else {
      container.prepend(holder.firstElementChild);
    }
  }
```

In the `window.IolantheAdmin` exports, replace:

```js
    showCharterPanel,
    getCharterContext
  });
```

with:

```js
    showCharterPanel,
    getCharterContext,
    damagedNoticeHtml,
    bindDamagedNotice,
    showDamagedStrip
  });
```

- [ ] **Step 2: Implement in `routes.js`**

Replace `showLoadError`:

```js
  function showLoadError(message) {
    panel.querySelector(".planner").replaceWith(el("p", { class: "empty" }, `Routes could not be loaded: ${message}`));
  }
```

with:

```js
  function showLoadError(error) {
    const planner = panel.querySelector(".planner");
    if (!planner) return;
    const refused = window.IolantheDamaged ? window.IolantheDamaged.refusal(error) : null;
    if (refused) {
      // Spec C §4.6: routes.json can't be read, so the page can't list its routes.
      const host = el("div", { class: "planner-damaged" });
      host.innerHTML = A().damagedNoticeHtml([refused], { embedded: true });
      planner.replaceWith(host);
      A().bindDamagedNotice(host);
      return;
    }
    planner.replaceWith(el("p", { class: "empty" }, `Routes could not be loaded: ${error.message}`));
  }
```

In `loadLibrary`, replace `if (panel === mine && mine.isConnected) showLoadError(error.message);` with:

```js
      if (panel === mine && mine.isConnected) showLoadError(error);
```

At the end of `bind`, replace:

```js
    }).catch((error) => {
      if (panel === mine) A().setStatus(error.message, "error");
    });
```

with:

```js
    }).catch((error) => {
      if (panel !== mine) return;
      const refused = window.IolantheDamaged ? window.IolantheDamaged.refusal(error) : null;
      // Spec C §4.6: the route works without its anchorages while anchorages.json can't be read, and the strip says so.
      if (refused) A().showDamagedStrip(mine, refused.file, refused.problem);
      else A().setStatus(error.message, "error");
    });
```

- [ ] **Step 3: The anchorages save waits for its library**

The anchorages save writes the whole library from the list `load()` filled, and has no revision check. After a failed
load (a damaged `anchorages.json`, or a dropped connection), adding one anchorage would replace them all once the file
reads again. In `routes-places.js` `saveLibrary`, replace:

```js
      return enqueue(async () => {
        const data = await A.api("/api/admin/anchorages/save", {
```

with:

```js
      return enqueue(async () => {
        // The save writes the whole library from this list: never before load() has filled it (spec C §4.6).
        if (!loaded) {
          throw new Error("The anchorages haven't been loaded, so they can't be saved. Reload the page.");
        }
        const data = await A.api("/api/admin/anchorages/save", {
```

Its callers already show a thrown message on the status line.

- [ ] **Step 4: Check**

Run: `node --test` (231 pass), then `node -e "require('./routes.js')"` and
`node -e "require('./routes-places.js')"`.
Expected: the tests pass. Each `require` throws `ReferenceError: window is not defined`, which is the file parsing
fine; a `SyntaxError` means a typo.

- [ ] **Step 5: Commit**

```bash
git add admin.js routes.js routes-places.js
git commit -m "feat(admin): the Route page shows the notice for a damaged routes.json and a strip for anchorages.json" -m "The anchorages save, which writes the whole library, waits for its load." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Charter Pack

**Files:**
- Modify: `charter-pack.js`: `bind` (about line 82) and `uploadCover` (about line 410)

- [ ] **Step 1: Implement**

In `bind`, replace:

```js
    if (!host.isConnected) return;

    let alive = true;
```

with:

```js
    if (!host.isConnected) return;
    // Spec C §4.6: a pack.json the server can't read shows the notice instead of the settings and the preview, so no
    // change auto-saves over it.
    const blocked = window.IolantheDamaged.pageDamage("charter", "pack", { "pack.json": window.IolantheDamaged.damagedIn(preset) });
    if (blocked.length) {
      host.innerHTML = A().damagedNoticeHtml(blocked, { embedded: true });
      A().bindDamagedNotice(host);
      return;
    }

    let alive = true;
```

In `uploadCover`, replace:

```js
        if (!response.ok) throw new Error(result.error || "The cover photo could not be uploaded.");
```

with:

```js
        // throwAdminApiError: the server's message, and the banner when pack.json can't be read (spec C §4.6)
        if (!response.ok) A().throwAdminApiError(response, result && result.error ? result : "", "The cover photo could not be uploaded.", "POST");
```

- [ ] **Step 2: Check**

Run: `node --test` (231 pass), then `node -e "require('./charter-pack.js')"`.
Expected: the tests pass, and the `require` throws `ReferenceError: window is not defined` (it parsed).

- [ ] **Step 3: Commit**

```bash
git add charter-pack.js
git commit -m "feat(admin): the Charter Pack shows the notice when pack.json can't be read" -m "Spec C 4.6: no change auto-saves over it; the cover upload's refusal gets the banner." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The import pickers refuse a damaged source

**Files:**
- Modify: `admin.js`: `openCrewImportModal`'s click handler (about line 4437) and `openMenuImportModal`'s submit
  handler (about line 8247)

- [ ] **Step 1: Implement the crew import**

Replace:

```js
        const bundle = await api(`/api/admin/charter/${encodeURIComponent(selected.value)}`);
        const sourceCrewList = normalizeCrewEditorList(bundle["crew_list.json"]);
```

with:

```js
        const bundle = await api(`/api/admin/charter/${encodeURIComponent(selected.value)}`);
        // Spec C §4.6: a source crew list the server can't read is not taken for an empty one.
        if (damagedCore().damagedIn(bundle["crew_list.json"])) {
          const source = sourceCharters.find(charter => charter.id === selected.value);
          errorField.textContent = damagedCore().pickerMessage(charterDisplayLabel(source || { id: selected.value }), "crew_list.json");
          importButton.disabled = false;
          return;
        }
        const sourceCrewList = normalizeCrewEditorList(bundle["crew_list.json"]);
```

- [ ] **Step 2: Implement the menu import**

The source is now read before the overwrite question. Replace, inside the `#menu-import-form` submit handler:

```js
      const sourceCharter = sourceCharters.find(charter => charter.id === selected.value);
      if (!await showAdminConfirm({
        title: "Import Menu",
        message: "Importing this menu will overwrite the current charter menu data.",
        confirmLabel: "Import",
        cancelLabel: "Cancel",
        tone: "warning"
      })) {
        return;
      }
      importButton.disabled = true;
      errorField.textContent = "";
      try {
        const bundle = await api(`/api/admin/charter/${encodeURIComponent(selected.value)}`);
        const nextMenus = importedMenusForItinerary(bundle["menus.json"], itineraryDayCount);
```

with:

```js
      const sourceCharter = sourceCharters.find(charter => charter.id === selected.value);
      importButton.disabled = true;
      errorField.textContent = "";
      try {
        // Spec C §4.6: the source is read before the overwrite question, and one whose menus.json the server can't read
        // is refused (it used to replace this charter's menus with blank days).
        const bundle = await api(`/api/admin/charter/${encodeURIComponent(selected.value)}`);
        if (damagedCore().damagedIn(bundle["menus.json"])) {
          errorField.textContent = damagedCore().pickerMessage(charterDisplayLabel(sourceCharter || { id: selected.value }), "menus.json");
          importButton.disabled = false;
          return;
        }
        if (!await showAdminConfirm({
          title: "Import Menu",
          message: "Importing this menu will overwrite the current charter menu data.",
          confirmLabel: "Import",
          cancelLabel: "Cancel",
          tone: "warning"
        })) {
          importButton.disabled = false;
          return;
        }
        const nextMenus = importedMenusForItinerary(bundle["menus.json"], itineraryDayCount);
```

(The rest of the handler, from `const saved = await saveMenusAndRender(` to the end of its `catch`, is unchanged.)

- [ ] **Step 3: Run the tests**

Run: `node --test`
Expected: PASS, 231.

- [ ] **Step 4: Commit**

```bash
git add admin.js
git commit -m "feat(admin): the crew and menu import pickers refuse a source file that can't be read" -m "Spec C 4.6: menu import read a damaged source as no menus and, after the overwrite question, replaced this charter's menus with blank days. It now reads the source first." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Coming back to the tab redraws a page whose file was fixed or broke

**Files:**
- Modify: `admin.js`: next to `knownRevision` (about line 3172), and `checkFreshness`

- [ ] **Step 1: Implement**

After the `knownRevision` function, add:

```js

  // What the page saw of a file's damage (spec C §4.6): its problem, "" when it read fine, null when it has not loaded it.
  function knownDamageOf(file, charterId) {
    const bundle = state.bundle && state.bundle.charter_id === charterId ? state.bundle : null;
    if (bundle && bundle[file]) {
      return damagedCore().damagedIn(bundle[file]);
    }
    return Object.prototype.hasOwnProperty.call(seenDamage, file) ? seenDamage[file] : null;
  }
```

In `checkFreshness`, replace:

```js
      const moved = files.some(file => {
        const known = knownRevision(file, charterId);
        return known !== null && served[file] && served[file].revision !== known;
      });
```

with:

```js
      const moved = files.some(file => {
        const now = served[file];
        if (!now) {
          return false;
        }
        const known = knownRevision(file, charterId);
        const seen = knownDamageOf(file, charterId);
        // A revision someone else saved, or a file fixed or broken since the page drew it (SC-D16's damaged on the stamp).
        return (known !== null && now.revision !== known) || (seen !== null && damagedCore().damagedIn(now) !== seen);
      });
```

- [ ] **Step 2: Run the tests**

Run: `node --test`
Expected: PASS, 231.

- [ ] **Step 3: Commit**

```bash
git add admin.js
git commit -m "feat(admin): coming back to the tab redraws a page whose file was fixed or can no longer be read" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Edit**

After the bullet that starts `- **Conflict-safe saves** (spec C):` (it ends `never over unsaved edits or an open
dialog.`), insert:

```markdown
- `damaged-core.js` — a data file the server can't read (spec C §4.6, SC-D16; design
  `docs/superpowers/specs/2026-10-10-damaged-file-notice-design.md`), pure, also a Node module (`window.IolantheDamaged`):
  `PAGE_FILES` (the files each page needs, counting the files its saves are worked out from), the readers of the
  server's `damaged` marker (`damagedIn`, `bundleDamage`, `pageDamage`) and of a refusal (`refusal`: 500
  `{code: "damaged", file, damaged}`), and the wording.
- **A damaged file** (spec C §4.6): each render keeps what its loads said (`state.bundle` holds the bundle's markers,
  `seenDamage` the library GETs', `noteRevisionDamage` the revisions for Purchased Alcohol). Before it binds any editor
  or auto-save, a page that needs a damaged file draws the notice card instead (`pageDamage`, `damagedNoticeHtml`: the
  files, "Nothing has been changed", the server's problem, Try again). So Galley Menus' day sync can no longer save
  menus made from a damaged `charter.json`'s missing days. Route & Itinerary blocks only this charter's route ("Work on
  the library routes"). A damaged `routes.json` puts the card in the planner and `anchorages.json` a strip. The Charter
  Pack draws the card itself. `reserved-periods.json` gets a strip under the band on every Charter page, the period
  editor won't open, and Charter Admin and the create dialog hold new dates (`charterDatesHeldMessage`). A save the
  server refuses for a damaged file shows a banner (`throwAdminApiError` → `showDamagedBanner`) and keeps what was typed.
  A page never saves a file it loaded damaged: `saveRevisioned` refuses such a base before sending (a repaired file at
  revision 0 would pass the server's revision check), merge-core never merges the marker, and the anchorages save waits
  for its load.
  The crew and menu import pickers refuse a damaged source. Coming back to the tab redraws a page whose file's
  `damaged` changed (`checkFreshness`). Against a server without the marker, everything behaves as before.
```

Then, in the bullet about `node --test`, find:

```text
runs the tests in `test/` (210 tests),
```

Replace with:

```text
runs the tests in `test/` (231 tests),
```

And in the same bullet, find:

```text
`merge-core`, the startup order
```

Replace with:

```text
`merge-core`, `damaged-core`, the damaged-file pages (`damaged-page.test.js`, `admin.js` in a `vm` sandbox), the startup order
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(admin): damaged-core.js and what the admin shows for a file it can't read" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Check it in the browser on the scratch server

Needs the server plan done: its branch is what the `iolanthe-damaged-notice` launch configuration runs (server
Task 10, Steps 2 and 3).

**Files:**
- Create (scratchpad, not the repo): `dn-file.js`

- [ ] **Step 1: The file helper**

Create
`C:/Users/david/AppData/Local/Temp/claude/S--Users-David-OneDrive-Maker-Space-GitHub/e02dca03-e7ae-44de-9d74-39096fe63640/scratchpad/dn-file.js`:

```js
// node dn-file.js damage <path under dn-data> [text] | restore <path> | list
// Damages a file of the scratch data copy, keeping its bytes (or that it was missing) in dn-keep, and puts it back.
const fs = require("fs");
const path = require("path");
const [command, rel, text = '{"broken": '] = process.argv.slice(2);
const data = path.join(__dirname, "dn-data");
const keep = path.join(__dirname, "dn-keep");
fs.mkdirSync(keep, { recursive: true });
const target = rel ? path.join(data, rel) : "";
const kept = rel ? path.join(keep, rel.replace(/[\\/]/g, "__")) : "";
if (command === "damage") {
  if (!fs.existsSync(kept) && !fs.existsSync(`${kept}.missing`)) {
 if (fs.existsSync(target)) fs.copyFileSync(target, kept); else fs.writeFileSync(`${kept}.missing`, "");
  }
  fs.writeFileSync(target, text);
  console.log(`damaged ${rel}`);
} else if (command === "restore") {
  if (fs.existsSync(`${kept}.missing`)) {
 fs.rmSync(target, { force: true });
 fs.rmSync(`${kept}.missing`);
  } else {
 fs.copyFileSync(kept, target);
 fs.rmSync(kept);
  }
  console.log(`restored ${rel}`);
} else {
  console.log(fs.readdirSync(keep).join("\n") || "nothing damaged");
}
```

Run commands as
`node "C:/Users/david/AppData/Local/Temp/claude/S--Users-David-OneDrive-Maker-Space-GitHub/e02dca03-e7ae-44de-9d74-39096fe63640/scratchpad/dn-file.js" damage charters/csaba/charter.json`.

- [ ] **Step 2: Open the admin**

`preview_start` `{ "name": "iolanthe-damaged-notice" }` (http://dn.localhost:8041). Open `/admin/?key=<key>` and log in
as Charter Admin. The key and the test password are in `scratchpad/dn-test-login.json`: read the file and type the
values with `form_input`. Never repeat them in the chat. After each change on disk, reload the page or press Try again.

- [ ] **Step 3: Go through the cases**

For each case: damage the file, open the page, check with `get_page_text` / `read_page`, screenshot the first of each
kind, restore the file.

**1.** `charters/csaba/charter.json`:
- Galley → Menus shows the card "charter.json can't be read", and `read_network_requests` shows no `/save`.
- Run `sha1sum dn-data/charters/csaba/menus.json` before and after: the same.
- Galley → Guests, Hotel → Guests, Charter → Charter Admin and Route & Itinerary each show the card.
- On Route & Itinerary, "Work on the library routes" opens a library route.
**2.** `charters/csaba/menus.json`: Galley → Menus shows the card.
**3.** `charters/csaba/crew_list.json` with text `[]`: Charter → Crew shows the card, with "crew_list.json is not a JSON
object."
**4.** `library/drink-stocks.json`: Drink Stocks, Guest Alcohol, Available Alcohol and Purchased Alcohol each show the
card.
**5.** `library/cocktails.json` with text `null`: Cocktails shows the card.
**6.** `library/sites.json`: the Site Editor shows the card.
**7.** `charters/csaba/pack.json`: the Charter Pack shows the card, and nothing is saved.
**8.** `library/routes.json`: Route & Itinerary shows the card in the planner.
**9.** `library/anchorages.json`: Route & Itinerary shows the strip "anchorages.json can't be read." Adding an anchorage
is refused ("The anchorages haven't been loaded …"), and still is after the file is restored, until the page reloads.
**10.** `reserved-periods.json`:
 - The strip shows under the band on Charter Admin and Crew.
 - The band's Reserved period button shows the message.
 - On Charter Admin, changing the end date shows the dates message in the overlap line and disables Save.
 - The create dialog with both dates set shows the message and disables Create; without dates, Create is enabled.
   Cancel it.
**11.** A late refusal:
 - Open Hotel → Cocktails, then damage `library/cocktails.json`.
 - Edit a cocktail and save. The banner shows at the top, and the typed text is still on screen.
 - Restore the file, press Reload (answer the unsaved-changes question), and the page is drawn again.
**12.** Import pickers:
 - Damage `charters/larry/menus.json`. On Galley → Menus (Csaba), Import → Larry shows the message in the dialog,
   with no overwrite question. Csaba's `menus.json` keeps the same `sha1sum`.
 - The same for `charters/larry/crew_list.json` with Charter → Crew → Import.
**13.** Freshness:
 - With `charters/csaba/menus.json` damaged, open Galley → Menus (the card) and restore the file.
 - Run `document.dispatchEvent(new Event("visibilitychange"))` with `javascript_tool`. The menus are drawn again.
**14.** Phone width: `resize_window` `{ "preset": "mobile" }`, then screenshot the card and the reserved-periods strip.
 Finish with `resize_window` `{ "preset": "desktop" }`.

- [ ] **Step 4: Put everything back**

Run `node …/dn-file.js list`. Expected: `nothing damaged`; restore anything it lists. Check `preview_logs` for
unexpected errors (the damaged-file log lines are expected). Then `preview_stop` the server.

- [ ] **Step 5: Fix what failed**

A failure means a code fix: write a failing sandbox or core test where the case allows, fix, and commit with a `fix(admin):`
message. Run Step 3's case again.

---

### Task 14: Review and hand-back

- [ ] **Step 1:** Run `node --test` (231 pass) and `git log --oneline origin/main..HEAD`.
- [ ] **Step 2:** Request a code review (superpowers:requesting-code-review) of `git diff origin/main...HEAD`, and fix
  what it finds.
- [ ] **Step 3:** Stop. Ask David before pushing or opening the PR. Release order: the server part (iolanthe-server#16
  is already live), then this. Merging the admin to `main` deploys it within 5 minutes.
