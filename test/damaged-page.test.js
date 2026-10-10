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

// A banner element: keeps its attributes and innerHTML, and leaves the list of banners when removed.
function bannerElement(banners, queries = {}) {
  const attributes = {};
  const element = keepingElement({
    querySelector: selector => (selector in queries ? queries[selector] : standIn()),
    setAttribute: (name, value) => { attributes[name] = String(value); },
    getAttribute: name => (name in attributes ? attributes[name] : null),
    remove: () => { const at = banners.indexOf(element); if (at >= 0) banners.splice(at, 1); }
  });
  return element;
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
// window, replies, statuses (a path's HTTP status, 200 unless set), banners (the damaged banners on the open page), retryButtons (the "Try again" buttons the latest drawing bound), libraryButtons (the "Work on the library routes"
// buttons it bound) and clickNav(panel), which presses
// that panel's tab in the section's nav and waits for the page to draw. Also listeners (the document's), created (every
// element admin.js made) and queries (what a created element's querySelector answers, by selector).
async function openAdmin(bootstrap, answers, extraElements = {}) {
  const requests = [];
  const navButtons = ["menus", "guests", "purchased-alcohol"].map(panel => clickable({ dataset: { panel } }));
  const retryButtons = [];
  const libraryButtons = [];
  const shell = new Proxy(standIn(), {
    get: (target, prop) => (prop === "querySelectorAll"
      ? selector => (selector === ".section-nav [data-panel]" ? navButtons : standIn())
      : target[prop])
  });
  // The open page's .section-content, which showDamagedBanner puts its banner into: the banners now inside it.
  const banners = [];
  const sectionContent = keepingElement({
    children: [],
    querySelectorAll: selector => (selector === ":scope > .damaged-banner" ? banners.slice() : standIn()),
    insertBefore: banner => { banners.push(banner); }
  });
  const workspace = keepingElement({
    querySelector: selector => {
      if (selector === ".section-content") return sectionContent;
      return selector.startsWith("[data-section-shell=") ? shell : standIn();
    },
    querySelectorAll: selector => {
      if (selector === "[data-damaged-library-routes]") {
        libraryButtons.length = 0;
        libraryButtons.push(clickable());
        return libraryButtons;
      }
      if (selector !== "[data-damaged-retry]") return standIn();
      retryButtons.length = 0;
      retryButtons.push(clickable());
      return retryButtons;
    }
  });
  const elements = { workspace, "status-panel": keepingElement(), ...extraElements };
  const listeners = {};
  // Every element admin.js created (the dialogs among them), and what a created element's querySelector answers.
  const created = [];
  const queries = {};
  const body = new Proxy(standIn(), {
    get: (target, prop) => (prop === "classList" ? new Proxy(standIn(), { get: (inner, name) => (name === "contains" ? () => false : inner[name]) }) : target[prop])
  });
  const document = new Proxy(standIn(), {
    get(target, prop) {
      if (prop === "addEventListener") {
        return (type, listener) => { (listeners[type] = listeners[type] || []).push(listener); };
      }
      if (prop === "getElementById") return id => elements[id] || standIn();
      if (prop === "createElement") return () => { const element = bannerElement(banners, queries); created.push(element); return element; };
      // The tab is visible, and no dialog is open (checkFreshness reads both).
      if (prop === "visibilityState") return "visible";
      if (prop === "body") return body;
      return target[prop];
    }
  });
  const replies = { "/api/admin/bootstrap": bootstrap, ...answers };
  const statuses = {};
  const window = {
    document,
    location: { search: "?key=test", origin: "http://admin.test", href: "http://admin.test/admin/?key=test" },
    addEventListener: () => {},
    fetch: async (url, options = {}) => {
      const { pathname } = new URL(String(url));
      requests.push({ method: options.method || "GET", pathname });
      const status = statuses[pathname] || 200;
      return { ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => replies[pathname] || {} };
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
  return { requests, workspace, window, replies, statuses, banners, retryButtons, libraryButtons, clickNav, listeners, created, queries };
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

const ROUTES_DAMAGED_BUNDLE = () => ({ ...bundleWith(DAMAGED), "itinerary.json": { version: 2, revision: 0, route: { points: [] }, activities: [], dirty_stop_ids: [], damaged: "is empty" } });

test("this charter's route with itinerary.json and charter.json damaged: the library routes are not blocked", { timeout: 5000 }, async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(ROUTES_DAMAGED_BUNDLE()));
  await page.window.IolantheAdmin.showCharterPanel("routes", { subject: "library" });
  await settleAll();
  assert.equal(page.workspace.innerHTML.includes("can&#39;t be read"), false);
  assert.equal(page.workspace.innerHTML.includes("data-damaged-library-routes"), false);
  assert.deepEqual(saves(page.requests), []);
});

test("the notice's \"Work on the library routes\" button switches to the library and drops the notice", { timeout: 5000 }, async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(ROUTES_DAMAGED_BUNDLE()));
  await page.window.IolantheAdmin.showCharterPanel("routes");
  await settleAll();
  assert.match(page.workspace.innerHTML, /can&#39;t be read/);
  assert.equal(page.libraryButtons.length, 1);

  await page.libraryButtons[0].handler();
  await settleAll();
  assert.equal(page.workspace.innerHTML.includes("can&#39;t be read"), false);
  assert.equal(page.workspace.innerHTML.includes("data-damaged-library-routes"), false);
  assert.deepEqual(saves(page.requests), []);
});

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
  assert.equal(page.banners.length, 1);
  assert.match(page.banners[0].innerHTML, /sites.json can&#39;t be read/);
});

test("a save the server refuses for a damaged file shows one banner, and the same refusal again leaves it alone", async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundleWith(DATED)));
  page.statuses["/api/admin/sites/save"] = 500;
  page.replies["/api/admin/sites/save"] = { error: "sites.json is empty", code: "damaged", file: "sites.json", damaged: "is empty" };
  const library = () => ({ sites: [{ id: "coron", title: "Coron", latitude: 11.9975, longitude: 120.201 }] });
  await assert.rejects(page.window.IolantheAdmin.saveSitesLibrary(library(), "Site saved."), { status: 500 });
  assert.equal(page.banners.length, 1);
  assert.match(page.banners[0].innerHTML, /sites.json can&#39;t be read/);
  assert.equal(page.banners[0].getAttribute("data-damaged-file"), "sites.json");
  const first = page.banners[0];

  await assert.rejects(page.window.IolantheAdmin.saveSitesLibrary(library(), "Site saved."), { status: 500 });
  assert.equal(page.banners.length, 1);
  assert.equal(page.banners[0], first);
});

test("the admin exposes the damaged-notice helpers the other pages call", async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundleWith(DATED)));
  const admin = page.window.IolantheAdmin;
  for (const name of ["damagedNoticeHtml", "bindDamagedNotice", "showDamagedStrip", "throwAdminApiError"]) {
    assert.equal(typeof admin[name], "function", name);
  }
  const html = admin.damagedNoticeHtml([{ file: "<b>x", problem: "p" }], { embedded: true });
  assert.equal(typeof html, "string");
  assert.ok(html.includes("damaged-notice"));
  assert.ok(html.includes("&lt;b&gt;x"));
  assert.ok(!html.includes("<b>x"));
});

test("a different refusal replaces the banner: still exactly one, and a new element", async () => {
  const page = await openAdmin(CHARTER_ADMIN, charterAnswers(bundleWith(DATED)));
  page.statuses["/api/admin/sites/save"] = 500;
  const refuse = problem => { page.replies["/api/admin/sites/save"] = { error: `sites.json ${problem}`, code: "damaged", file: "sites.json", damaged: problem }; };
  const library = () => ({ sites: [{ id: "coron", title: "Coron", latitude: 11.9975, longitude: 120.201 }] });
  refuse("is empty");
  await assert.rejects(page.window.IolantheAdmin.saveSitesLibrary(library(), "Site saved."), { status: 500 });
  const first = page.banners[0];

  refuse("is not valid JSON at line 2 column 1");
  await assert.rejects(page.window.IolantheAdmin.saveSitesLibrary(library(), "Site saved."), { status: 500 });
  assert.equal(page.banners.length, 1);
  assert.notEqual(page.banners[0], first);
  assert.match(page.banners[0].innerHTML, /not valid JSON/);
});

// ---- Spec C 4.6 A7: the import pickers refuse a damaged source -----------------------------------------------------

const LARRY_SUMMARY = { id: "larry", name: "Larry", charter: { start_date: "2026-12-01", end_date: "2026-12-03" }, stops: 0, nights: 2, status: "upcoming" };
const TWO_CHARTERS = { ...CHARTER_ADMIN, charters: [CHARTER_SUMMARY, LARRY_SUMMARY] };
const GALLEY_TWO = { ...GALLEY, charters: [CHARTER_SUMMARY, LARRY_SUMMARY] };
const larryBundle = overrides => ({ ...bundleWith(DATED), charter_id: "larry", ...overrides });
const damagedFile = (key, extra) => ({ [key]: { ...extra, revision: 0, saved_by: "", saved_at: "", damaged: PROBLEM } });

// The dialog openDialogModal builds: the picker's radio, button and error field, which the handlers read.
function pickerDialog(page, button, errorId, radioName) {
  const importButton = clickable({ disabled: false });
  const errorField = keepingElement();
  page.queries[button] = importButton;
  page.queries[`input[name='${radioName}']:checked`] = { value: "larry" };
  page.queries[errorId] = errorField;
  return { importButton, errorField };
}

const decisionDialogs = page => page.created.filter(element => String(element.className).includes("admin-decision-backdrop"));
const reads = (page, charter) => page.requests.filter(request => request.method === "GET" && request.pathname === `/api/admin/charter/${charter}`).length;

test("crew import from a charter whose crew_list.json is marked damaged: the picker message, nothing saved", async () => {
  const importCrew = clickable();
  const page = await openAdmin(TWO_CHARTERS, charterAnswers(bundleWith(DATED), { "/api/admin/charter/larry": larryBundle(damagedFile("crew_list.json", { crew: [] })) }), { "import-crew-list": importCrew });
  await page.window.IolantheAdmin.showCharterPanel("crew");
  await settleAll();
  assert.equal(typeof importCrew.handler, "function");
  const dialog = pickerDialog(page, "#confirm-crew-import", "#crew-import-error", "crew-import-source");

  importCrew.handler();
  await settleAll();
  await dialog.importButton.handler();
  await settleAll();

  assert.equal(dialog.errorField.textContent, "Larry's crew_list.json can't be read, so its crew can't be imported. Fix or restore it first.");
  assert.equal(dialog.importButton.disabled, false);
  assert.equal(reads(page, "larry"), 1);
  assert.deepEqual(saves(page.requests), []);
});

test("crew import from a charter whose crew_list.json reads fine goes on to import (no refusal)", async () => {
  const importCrew = clickable();
  const member = { id: "c-1", name: "Ana", role: "Deckhand" };
  const page = await openAdmin(TWO_CHARTERS, charterAnswers(bundleWith(DATED), { "/api/admin/charter/larry": larryBundle({ "crew_list.json": { crew: [member], revision: 2, ...STAMP } }) }), { "import-crew-list": importCrew });
  await page.window.IolantheAdmin.showCharterPanel("crew");
  await settleAll();
  const dialog = pickerDialog(page, "#confirm-crew-import", "#crew-import-error", "crew-import-source");

  importCrew.handler();
  await settleAll();
  await dialog.importButton.handler();
  await settleAll();

  assert.equal(dialog.errorField.textContent, "");
  assert.deepEqual(saves(page.requests).map(request => request.pathname), ["/api/admin/charter/csaba/save"]);
});

test("menu import from a charter whose menus.json is marked damaged: the picker message, no overwrite question, nothing saved", { timeout: 5000 }, async () => {
  const importMenu = clickable();
  const page = await openAdmin(GALLEY_TWO, { "/api/admin/charter/csaba": bundleWith(DATED), "/api/admin/charter/larry": larryBundle(damagedFile("menus.json", { menus: [] })) }, { "import-menu": importMenu });
  assert.equal(typeof importMenu.handler, "function");
  const form = clickable();
  form.addEventListener = (type, fn) => { if (type === "submit") form.handler = fn; };
  page.queries["#menu-import-form"] = form;
  const dialog = pickerDialog(page, "button[form='menu-import-form']", "#menu-import-error", "menu-import-source");

  importMenu.handler();
  await settleAll();
  await form.handler({ preventDefault() {} });
  await settleAll();

  assert.equal(dialog.errorField.textContent, "Larry's menus.json can't be read, so its menus can't be imported. Fix or restore it first.");
  assert.equal(dialog.importButton.disabled, false);
  assert.equal(decisionDialogs(page).length, 0, "no overwrite question for an import that is refused");
  assert.deepEqual(saves(page.requests), []);
});

test("menu import from a charter whose menus.json reads fine reads the source first, then asks the overwrite question", async () => {
  const importMenu = clickable();
  const page = await openAdmin(GALLEY_TWO, { "/api/admin/charter/csaba": bundleWith(DATED), "/api/admin/charter/larry": larryBundle({}) }, { "import-menu": importMenu });
  const form = clickable();
  form.addEventListener = (type, fn) => { if (type === "submit") form.handler = fn; };
  page.queries["#menu-import-form"] = form;
  const dialog = pickerDialog(page, "button[form='menu-import-form']", "#menu-import-error", "menu-import-source");

  importMenu.handler();
  await settleAll();
  form.handler({ preventDefault() {} }); // waits on the question, which nobody answers here
  await settleAll();

  assert.equal(reads(page, "larry"), 1);
  assert.equal(decisionDialogs(page).length, 1);
  assert.equal(dialog.errorField.textContent, "");
  assert.deepEqual(saves(page.requests), []);
});

// ---- Spec C 4.6 A8: coming back to the tab -------------------------------------------------------------------------

const comeBack = async page => {
  (page.listeners.visibilitychange || []).forEach(listener => listener({ type: "visibilitychange" }));
  await settleAll();
};
const stamps = (menus, charter) => ({ library: {}, charter: { "menus.json": menus, "charter.json": charter } });
const GOOD_STAMPS = stamps({ revision: 3 }, { revision: 4 });

test("coming back to the tab with nothing changed does not redraw the page", async () => {
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": bundleWith(DATED), "/api/admin/revisions": GOOD_STAMPS });
  const before = reads(page, "csaba");
  await comeBack(page);
  assert.equal(reads(page, "csaba"), before);
});

test("coming back to the tab after a file broke (same revision) redraws the page, now with the notice", async () => {
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": bundleWith(DATED), "/api/admin/revisions": GOOD_STAMPS });
  const before = reads(page, "csaba");
  page.replies["/api/admin/charter/csaba"] = { ...bundleWith(DATED), "menus.json": { menus: [], revision: 3, ...STAMP, damaged: PROBLEM } };
  page.replies["/api/admin/revisions"] = stamps({ revision: 3, damaged: PROBLEM }, { revision: 4 });
  await comeBack(page);
  assert.equal(reads(page, "csaba"), before + 1);
  assert.match(page.workspace.innerHTML, /menus\.json can&#39;t be read/);
});

test("coming back to the tab after a damaged file was fixed redraws the page without the notice", async () => {
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": bundleWith(DAMAGED), "/api/admin/revisions": stamps({ revision: 3 }, { revision: 0, damaged: PROBLEM }) });
  assert.match(page.workspace.innerHTML, /charter\.json can&#39;t be read/);
  const before = reads(page, "csaba");

  // Still damaged: left alone.
  await comeBack(page);
  assert.equal(reads(page, "csaba"), before);

  page.replies["/api/admin/charter/csaba"] = bundleWith(DATED);
  // Fixed at the same revision 0 the damaged stamp carried: only the marker changed.
  page.replies["/api/admin/revisions"] = stamps({ revision: 3 }, { revision: 0 });
  await comeBack(page);
  assert.equal(reads(page, "csaba"), before + 1);
  assert.match(page.workspace.innerHTML, /id="menu-days"/);
  assert.equal(page.workspace.innerHTML.includes("can&#39;t be read"), false);
});

test("coming back to the tab with a different damage problem redraws the page", async () => {
  const page = await openAdmin(GALLEY, { "/api/admin/charter/csaba": bundleWith(DAMAGED), "/api/admin/revisions": stamps({ revision: 3 }, { revision: 0, damaged: PROBLEM }) });
  const before = reads(page, "csaba");
  const other = "is empty";
  page.replies["/api/admin/charter/csaba"] = bundleWith({ ...DAMAGED, damaged: other });
  page.replies["/api/admin/revisions"] = stamps({ revision: 3 }, { revision: 0, damaged: other });
  await comeBack(page);
  assert.equal(reads(page, "csaba"), before + 1);
  assert.match(page.workspace.innerHTML, /charter\.json is empty\./);
});
