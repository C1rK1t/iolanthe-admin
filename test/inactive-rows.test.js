"use strict";

// Captain feedback item 04 (docs/superpowers/specs/2026-10-10-inactive-rows-design.md): the inactive tail of Galley →
// Menus, Hotel → Guests and Galley → Guests is set apart by one divider, drawn just before the first inactive row, with a
// hint that says why the rows are there. These run admin.js in a vm sandbox, as damaged-page.test.js does, with list
// containers that keep what is drawn into them in order.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SCRIPTS = ["charters-core.js", "itinerary-core.js", "merge-core.js", "damaged-core.js", "drag-reorder.js", "admin.js"];

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

// An element that keeps what is written to it. Anything else is a stand-in, except the properties in extras.
function keepingElement(extras = {}) {
  const kept = { innerHTML: "", textContent: "", className: "", ...extras };
  return new Proxy(kept, {
    get: (target, prop) => (Object.prototype.hasOwnProperty.call(target, prop) ? target[prop] : standIn()),
    set: (target, prop, value) => { target[prop] = value; return true; }
  });
}

// A list container (#menu-days, #guest-editor-list): keeps its children in the order they were added. A child is the
// element appended, or the HTML inserted.
function listContainer() {
  const children = [];
  return keepingElement({
    children,
    appendChild: child => { children.push(child); },
    insertAdjacentHTML: (position, html) => { children.push(String(html)); },
    querySelectorAll: () => []
  });
}

const settle = () => new Promise(resolve => setImmediate(resolve));
async function settleAll() {
  for (let i = 0; i < 12; i += 1) {
    await settle();
  }
}

const STAMP = { saved_by: "galley", saved_at: "2026-10-01T00:00:00.000Z" };
const charterOf = (days, guestCount) => ({ name: "Csaba", start_date: "2026-11-01", end_date: `2026-11-0${days}`, guest_count: guestCount, revision: 4, ...STAMP });
const UNDATED = { name: "Csaba", start_date: null, end_date: null, guest_count: 1, revision: 0, saved_by: "", saved_at: "" };

const menuDay = (n, active) => ({ id: `m-day-${n}`, order: n, day: n, charter_day: n, active, label: `Day ${n}`, todays_notes: `Beach barbecue ${n}`, breakfast: [], lunch: [], dinner: [], snacks: [] });
const guest = (name, active, principal = false) => ({ id: `g-${name}`, preferred_name: name, full_name: `${name} Example`, active, principal, allergies: active ? "" : "Nuts" });

function bundleWith(charterJson, menus, guests) {
  return {
    charter_id: "csaba",
    "charter.json": charterJson,
    "itinerary.json": { version: 2, revision: 1, route: { points: [] }, activities: [], dirty_stop_ids: [] },
    "crew_list.json": { crew: [], revision: 1, ...STAMP },
    "guest_list.json": { guests, revision: 1, ...STAMP },
    "menus.json": { menus, revision: 3, ...STAMP },
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
const HOTEL = signedIn("hotel", ["hotel"]);

// A nav button that records the handler added for "click".
function clickable(extras = {}) {
  const button = { handler: null, addEventListener: (type, fn) => { if (type === "click") button.handler = fn; }, ...extras };
  return button;
}

// Signs in with bootstrap, which opens its first section on its default page (Galley → Menus, Hotel → Guests). Returns
// the workspace, the two list containers, the requests sent and clickNav(panel).
async function openAdmin(bootstrap, bundle) {
  const requests = [];
  const navButtons = ["menus", "guests"].map(panel => clickable({ dataset: { panel } }));
  const shell = new Proxy(standIn(), {
    get: (target, prop) => (prop === "querySelectorAll"
      ? selector => (selector === ".section-nav [data-panel]" ? navButtons : standIn())
      : target[prop])
  });
  const workspace = keepingElement({
    querySelector: selector => (String(selector).startsWith("[data-section-shell=") ? shell : standIn()),
    querySelectorAll: () => standIn()
  });
  const menuDays = listContainer();
  const guestEditorList = listContainer();
  const elements = { workspace, "status-panel": keepingElement(), "menu-days": menuDays, "guest-editor-list": guestEditorList };
  const listeners = {};
  const body = new Proxy(standIn(), {
    get: (target, prop) => (prop === "classList" ? new Proxy(standIn(), { get: (inner, name) => (name === "contains" ? () => false : inner[name]) }) : target[prop])
  });
  const document = new Proxy(standIn(), {
    get(target, prop) {
      if (prop === "addEventListener") {
        return (type, listener) => { (listeners[type] = listeners[type] || []).push(listener); };
      }
      if (prop === "getElementById") return id => elements[id] || standIn();
      if (prop === "createElement") return () => keepingElement();
      if (prop === "visibilityState") return "visible";
      if (prop === "body") return body;
      return target[prop];
    }
  });
  const replies = { "/api/admin/bootstrap": bootstrap, "/api/admin/charter/csaba": bundle };
  const window = {
    document,
    location: { search: "?key=test", origin: "http://admin.test", href: "http://admin.test/admin/?key=test" },
    addEventListener: () => {},
    removeEventListener: () => {},
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
  return { workspace, menuDays, guestEditorList, requests, clickNav };
}

const DIVIDER = /class="inactive-divider"/;
const saves = requests => requests.filter(request => request.method !== "GET");

// A container's children as a sequence: "divider" for the inserted divider, "inactive" or "active" for a row.
function sequenceOf(container) {
  return container.children.map(child => {
    if (typeof child === "string") return DIVIDER.test(child) ? "divider" : `html:${child.slice(0, 40)}`;
    return /\binactive\b/.test(child.className) ? "inactive" : "active";
  });
}
const dividerOf = container => container.children.find(child => typeof child === "string" && DIVIDER.test(child));
const rowHtml = container => container.children.filter(child => typeof child !== "string").map(child => child.innerHTML).join("\n");

test("Galley → Menus: one divider just before the first inactive day, naming the charter's days; no pill on the rows", async () => {
  const menus = [menuDay(1, true), menuDay(2, true), menuDay(3, true), menuDay(4, false), menuDay(5, false)];
  const page = await openAdmin(GALLEY, bundleWith(charterOf(3, 2), menus, []));
  assert.deepEqual(sequenceOf(page.menuDays), ["active", "active", "active", "divider", "inactive", "inactive"]);
  assert.match(dividerOf(page.menuDays), />Inactive</);
  assert.match(dividerOf(page.menuDays), /Beyond the charter&#39;s 3 days\. Not shown to guests\./);
  assert.equal(rowHtml(page.menuDays).includes("inactive-label"), false);
  assert.deepEqual(saves(page.requests), [], "drawing changes nothing");
});

test("Galley → Menus: a one-day charter says 1 day", async () => {
  const page = await openAdmin(GALLEY, bundleWith(charterOf(1, 2), [menuDay(1, true), menuDay(2, false)], []));
  assert.deepEqual(sequenceOf(page.menuDays), ["active", "divider", "inactive"]);
  assert.match(dividerOf(page.menuDays), /Beyond the charter&#39;s 1 day\. Not shown to guests\./);
});

test("Galley → Menus: no inactive day, no divider", async () => {
  const page = await openAdmin(GALLEY, bundleWith(charterOf(3, 2), [menuDay(1, true), menuDay(2, true), menuDay(3, true)], []));
  assert.deepEqual(sequenceOf(page.menuDays), ["active", "active", "active"]);
});

test("Galley → Menus: a charter with no days yet says so in the hint", async () => {
  const page = await openAdmin(GALLEY, bundleWith(UNDATED, [menuDay(1, false), menuDay(2, false)], []));
  assert.deepEqual(sequenceOf(page.menuDays), ["divider", "inactive", "inactive"]);
  assert.match(dividerOf(page.menuDays), /The charter has no days yet\. Not shown to guests\./);
});

const FOUR_GUESTS = [guest("Ana", true, true), guest("Ben", true), guest("Cat", false), guest("Dev", false)];

test("Hotel → Guests: one divider just before the first inactive guest, naming the guest count; the old heading is gone", async () => {
  const page = await openAdmin(HOTEL, bundleWith(charterOf(3, 2), [], FOUR_GUESTS));
  assert.deepEqual(sequenceOf(page.guestEditorList), ["active", "active", "divider", "inactive", "inactive"]);
  assert.match(dividerOf(page.guestEditorList), />Inactive</);
  assert.match(dividerOf(page.guestEditorList), /Beyond the guest count of 2\. Not shown to guests\./);
  assert.equal(page.guestEditorList.children.some(child => typeof child === "string" && /guest-group-title/.test(child)), false);
  assert.equal(rowHtml(page.guestEditorList).includes("inactive-label"), false);
  assert.deepEqual(saves(page.requests), [], "drawing changes nothing");
});

test("Hotel → Guests: no inactive guest, no divider", async () => {
  const page = await openAdmin(HOTEL, bundleWith(charterOf(3, 2), [], FOUR_GUESTS.slice(0, 2)));
  assert.deepEqual(sequenceOf(page.guestEditorList), ["active", "active"]);
});

// Galley → Guests is one HTML string: the divider splits it into the active rows and the inactive rows.
const GALLEY_ROW = /class="galley-guest-row(?! galley-guest-header)[^"]*"/g;
const GALLEY_INACTIVE_ROW = /class="galley-guest-row[^"]* inactive[^"]*"/g;
const count = (html, pattern) => (html.match(pattern) || []).length;

test("Galley → Guests: one divider between the active and the inactive guests, naming the guest count; no pill", async () => {
  const page = await openAdmin(GALLEY, bundleWith(charterOf(3, 2), [menuDay(1, true)], FOUR_GUESTS));
  await page.clickNav("guests");
  const html = page.workspace.innerHTML;
  const parts = html.split(DIVIDER);
  assert.equal(parts.length, 2, "one divider");
  const [before, after] = parts;
  assert.equal(count(before, GALLEY_ROW), 2);
  assert.equal(count(before, GALLEY_INACTIVE_ROW), 0);
  assert.equal(count(after, GALLEY_ROW), 2);
  assert.equal(count(after, GALLEY_INACTIVE_ROW), 2);
  assert.match(html, /Beyond the guest count of 2\. Not shown to guests\./);
  assert.equal(html.includes("inactive-label"), false);
});

test("Galley → Guests: no inactive guest, no divider", async () => {
  const page = await openAdmin(GALLEY, bundleWith(charterOf(3, 2), [menuDay(1, true)], FOUR_GUESTS.slice(0, 2)));
  await page.clickNav("guests");
  assert.equal(DIVIDER.test(page.workspace.innerHTML), false);
  assert.equal(count(page.workspace.innerHTML, GALLEY_ROW), 2);
});
