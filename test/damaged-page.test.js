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

// An element that keeps what is written to it, and every innerHTML in order (drawn). Anything else is a stand-in, except
// the properties in extras.
function keepingElement(extras = {}) {
  const kept = { innerHTML: "", textContent: "", className: "", drawn: [], ...extras };
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

// A button that records the handler added for "click" (the stand-in's addEventListener would drop it).
function clickable(extras = {}) {
  const button = { handler: null, addEventListener: (type, fn) => { if (type === "click") button.handler = fn; }, ...extras };
  return button;
}

// Signs in with bootstrap, which opens its first section on its default page. Each request is answered from answers by
// its path (anything else gets {}), and replies can be changed later. Returns the requests sent, the workspace, the
// window, replies, retryButtons (the "Try again" buttons the latest drawing bound) and clickNav(panel), which presses
// that panel's tab in the section's nav and waits for the page to draw.
async function openAdmin(bootstrap, answers, extraElements = {}) {
  const requests = [];
  const navButtons = ["menus", "guests", "purchased-alcohol"].map(panel => clickable({ dataset: { panel } }));
  const retryButtons = [];
  const shell = new Proxy(standIn(), {
    get: (target, prop) => (prop === "querySelectorAll"
      ? selector => (selector === ".section-nav [data-panel]" ? navButtons : standIn())
      : target[prop])
  });
  const workspace = keepingElement({
    querySelector: selector => (selector.startsWith("[data-section-shell=") ? shell : standIn()),
    querySelectorAll: selector => {
      if (selector !== "[data-damaged-retry]") return standIn();
      retryButtons.length = 0;
      retryButtons.push(clickable());
      return retryButtons;
    }
  });
  const elements = { workspace, "status-panel": keepingElement(), ...extraElements };
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
  const clickNav = async panel => {
    await navButtons.find(button => button.dataset.panel === panel).handler();
    await settleAll();
  };
  return { requests, workspace, window, replies, retryButtons, clickNav };
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

test("a problem text with markup is drawn escaped, never as an element", async () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": bundleWith({ ...DAMAGED, damaged: hostile }) });
  assert.match(page.workspace.innerHTML, /charter\.json can&#39;t be read/);
  assert.ok(page.workspace.innerHTML.includes("&lt;img"));
  assert.equal(page.workspace.innerHTML.includes("<img src=x"), false);
  assert.deepEqual(saves(page.requests), []);
});

test("Try again reads the charter again, and shows the page once the file is fixed", async () => {
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": bundleWith(DAMAGED) });
  const reads = () => page.requests.filter(request => request.method === "GET" && request.pathname === "/api/admin/charter/csaba").length;
  assert.equal(page.retryButtons.length, 1);
  assert.equal(reads(), 1);

  // Still damaged: another read, the notice again.
  await page.retryButtons[0].handler();
  await settleAll();
  assert.equal(reads(), 2);
  assert.match(page.workspace.innerHTML, /charter\.json can&#39;t be read/);

  // Fixed on the server: the read after Try again draws the menus and the notice is gone.
  page.replies["/api/admin/charter/csaba"] = bundleWith(DATED);
  await page.retryButtons[0].handler();
  await settleAll();
  assert.equal(reads(), 3);
  assert.match(page.workspace.innerHTML, /id="menu-days"/);
  assert.equal(page.workspace.innerHTML.includes("can&#39;t be read"), false);
  assert.deepEqual(saves(page.requests), []);
});

test("Galley → Menus with menus.json marked damaged (charter.json fine): the notice names menus.json, nothing saved", async () => {
  const menus = { menus: [], revision: 0, saved_by: "", saved_at: "", damaged: PROBLEM };
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": { ...bundleWith(DATED), "menus.json": menus } });
  assert.deepEqual(saves(page.requests), []);
  assert.match(page.workspace.innerHTML, /menus\.json can&#39;t be read/);
  assert.match(page.workspace.innerHTML, /menus\.json is not valid JSON at line 3 column 5\./);
  assert.equal(page.workspace.innerHTML.includes("charter.json"), false);
  assert.equal(everDrawn(page, /id="menu-days"/), false);
});

test("Galley → Guests with guest_list.json marked damaged: the notice, nothing saved (Menus still works)", async () => {
  const guests = { guests: [], revision: 0, saved_by: "", saved_at: "", damaged: PROBLEM };
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": { ...bundleWith(DATED), "guest_list.json": guests } });
  assert.ok(everDrawn(page, /id="menu-days"/), "the Menus panel is not blocked by guest_list.json");
  assert.equal(page.workspace.innerHTML.includes("can&#39;t be read"), false);

  await page.clickNav("guests");
  assert.match(page.workspace.innerHTML, /guest_list\.json can&#39;t be read/);
  assert.match(page.workspace.innerHTML, /guest_list\.json is not valid JSON at line 3 column 5\./);
  assert.match(page.workspace.innerHTML, /Nothing has been changed\./);
  assert.deepEqual(saves(page.requests), []);
});

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

test("Charter pages with reserved-periods.json fine: no strip", async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundleWith(DATED)));
  assert.ok(everDrawn(page, /id="charter-info-form"/));
  assert.equal(everDrawn(page, /damaged-strip/), false);
});

// The revisions stamps carry `damaged` for the files Purchased Alcohol doesn't load itself (SC-D16).
const drinkStocksDamaged = { library: { "drink-stocks.json": { revision: 0, damaged: PROBLEM } }, charter: {} };

test("Hotel → Purchased Alcohol with drink-stocks.json marked damaged in the revisions: the notice names it, nothing saved", async () => {
  const page = await openAdmin(HOTEL, { "/api/admin/charter/csaba": bundleWith(DATED), "/api/admin/revisions": drinkStocksDamaged });
  await page.clickNav("purchased-alcohol");
  assert.match(page.workspace.innerHTML, /drink-stocks.json can&#39;t be read/);
  assert.match(page.workspace.innerHTML, /drink-stocks.json is not valid JSON at line 3 column 5./);
  assert.deepEqual(saves(page.requests), []);
});

test("Hotel → Purchased Alcohol when the revisions can't be read: the page still draws, no notice, nothing saved", async () => {
  const page = await openAdmin(HOTEL, { "/api/admin/charter/csaba": bundleWith(DATED) });
  const failing = page.window.fetch;
  page.window.fetch = async (url, options) => {
    if (new URL(String(url)).pathname === "/api/admin/revisions") throw new Error("network down");
    return failing(url, options);
  };
  await page.clickNav("purchased-alcohol");
  assert.equal(everDrawn(page, /can&#39;t be read/), false);
  assert.match(page.workspace.innerHTML, /id="purchased-alcohol-list-shell"/);
  assert.deepEqual(saves(page.requests), []);
});

// The Charter Admin dates hold (spec C 4.6): with reserved-periods.json unreadable, dates that differ from the stored ones
// can't be checked, so Save waits; the stored dates are not held.
test("Charter Admin with reserved-periods.json marked damaged: new dates wait with the message, the stored dates do not", async () => {
  const input = value => { const el = { value, handler: null, addEventListener: (type, fn) => { if (type === "input") el.handler = fn; } }; return el; };
  const start = input(DATED.start_date);
  const end = input(DATED.end_date);
  const overlap = keepingElement();
  const save = keepingElement({ disabled: false });
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundleWith(DATED), {
    "/api/admin/reserved-periods": { revision: 0, periods: [], damaged: PROBLEM }
  }), { "charter-info-start-date": start, "charter-info-end-date": end, "charter-info-overlap": overlap, "charter-info-save": save });
  const held = window => window.IolantheDamagedCore.DATES_MESSAGE;
  assert.equal(overlap.textContent, "");
  assert.equal(save.disabled, false);

  start.value = "2026-12-01";
  end.value = "2026-12-05";
  start.handler();
  assert.equal(overlap.textContent, require("../damaged-core.js").DATES_MESSAGE);
  assert.equal(save.disabled, true);

  start.value = DATED.start_date;
  end.value = DATED.end_date;
  start.handler();
  assert.equal(overlap.textContent, "");
  assert.equal(save.disabled, false);
  assert.deepEqual(saves(page.requests), []);
});
