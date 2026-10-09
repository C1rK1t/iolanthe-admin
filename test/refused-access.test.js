"use strict";

// A refused bootstrap (a wrong URL key, or a guest / owner / unknown network) leaves nothing on the page but its
// message. Until 2026-10-09 that message sat in the corner status line, white on the light page and almost invisible:
// applySectionTheme() wrote data-admin-section="" while signed out, and admin.css reads body[data-admin-section] as a
// dark section page. These run admin.js in a vm sandbox, as startup-order.test.js does, with working stand-ins for the
// elements they check.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const ADMIN_SOURCE = fs.readFileSync(path.join(ROOT, "admin.js"), "utf8");

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

// Just enough of an element for the status line, the panels and <body>: className, classList, textContent, dataset.
function fakeElement(className = "") {
  const element = { className, textContent: "", dataset: {} };
  const names = () => element.className.split(/\s+/).filter(Boolean);
  const add = (...added) => { element.className = [...new Set([...names(), ...added])].join(" "); };
  const remove = (...removed) => { element.className = names().filter(name => !removed.includes(name)).join(" "); };
  element.classList = {
    contains: name => names().includes(name),
    add,
    remove,
    toggle: (name, force) => {
      const on = force === undefined ? !names().includes(name) : Boolean(force);
      (on ? add : remove)(name);
      return on;
    }
  };
  return element;
}

const settle = () => new Promise(resolve => setImmediate(resolve));

// Loads admin.js, answers /api/admin/bootstrap with `bootstrap` (any other request gets {}), and fires
// DOMContentLoaded. The panels start as in index.html, or both shown with `panelsShown`: a bootstrap run again from the
// app (after a charter is created or deleted). Timers never fire; the signed-in path arms a 30-minute session timer.
async function bootWith(bootstrap, { panelsShown = false } = {}) {
  const elements = {
    "status-panel": fakeElement("status-panel"),
    "login-panel": fakeElement(panelsShown ? "login-panel" : "login-panel hidden"),
    "app-panel": fakeElement(panelsShown ? "" : "hidden")
  };
  const body = fakeElement();
  const listeners = {};
  const document = new Proxy(standIn(), {
    get(target, prop) {
      if (prop === "addEventListener") {
        return (type, listener) => { (listeners[type] = listeners[type] || []).push(listener); };
      }
      if (prop === "getElementById") return id => elements[id] || standIn();
      if (prop === "body") return body;
      return target[prop];
    }
  });
  const window = {
    document,
    location: { search: "?key=test", origin: "http://admin.test", href: "http://admin.test/admin/?key=test" },
    addEventListener: () => {},
    fetch: async url => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => (String(url).includes("/api/admin/bootstrap") ? bootstrap : {})
    }),
    setTimeout: () => 0,
    clearTimeout: () => {},
    URL,
    URLSearchParams
  };
  window.window = window;
  vm.runInNewContext(ADMIN_SOURCE, window, { filename: "admin.js" });
  (listeners.DOMContentLoaded || []).forEach(listener => listener({ type: "DOMContentLoaded" }));
  await settle();
  await settle();
  return { status: elements["status-panel"], login: elements["login-panel"], app: elements["app-panel"], body, window };
}

// What the server sends a signed-out request (iolanthe-server buildAdminBootstrap); each test adds the role.
const SIGNED_OUT = {
  authenticated: false,
  department: "",
  active_charter: "",
  charters: [],
  allowed_sections: [],
  allowed_departments: [],
  settings: { sessionTimeoutMinutes: 30, isDevelopment: false }
};

test("guest, owner and unknown networks get their message as the refused card, with no login", async () => {
  for (const role of ["guest", "owner", "unknown"]) {
    const page = await bootWith({ ...SIGNED_OUT, role }, { panelsShown: true });
    assert.equal(page.status.textContent, "This network cannot access admin.", role);
    assert.ok(page.status.classList.contains("status-panel--refused"), `${role}: "${page.status.className}"`);
    assert.ok(page.status.classList.contains("error"), `${role}: "${page.status.className}"`);
    assert.ok(page.login.classList.contains("hidden"), `${role}: login panel shown`);
    assert.ok(page.app.classList.contains("hidden"), `${role}: app panel shown`);
  }
});

test("a wrong URL key gets \"Access denied\" as the refused card", async () => {
  const page = await bootWith({ ...SIGNED_OUT, role: "denied" }, { panelsShown: true });
  assert.equal(page.status.textContent, "Access denied. Check the admin URL key.");
  assert.ok(page.status.classList.contains("status-panel--refused"), `"${page.status.className}"`);
  assert.ok(page.login.classList.contains("hidden"));
  assert.ok(page.app.classList.contains("hidden"));
});

test("signed out, <body> has no data-admin-section, so the dark-page status colour can't apply", async () => {
  for (const role of ["unknown", "denied", "bridge"]) {
    const page = await bootWith({ ...SIGNED_OUT, role });
    assert.equal("adminSection" in page.body.dataset, false,
      `${role}: data-admin-section=${JSON.stringify(page.body.dataset.adminSection)}`);
  }
});

test("the department chooser keeps the plain status line", async () => {
  const page = await bootWith({ ...SIGNED_OUT, role: "bridge" });
  assert.equal(page.login.classList.contains("hidden"), false);
  assert.equal(page.status.className, "status-panel");
});

test("the next status message clears the refused card", async () => {
  const page = await bootWith({ ...SIGNED_OUT, role: "unknown" });
  page.window.IolantheAdmin.setStatus("Saved.", "ok");
  assert.equal(page.status.className, "status-panel ok");
});

test("signed in, <body> carries the section, so status text stays white on the dark section page", async () => {
  const page = await bootWith({
    ...SIGNED_OUT,
    role: "bridge",
    department: "charter",
    authenticated: true,
    allowed_sections: ["charter"],
    allowed_departments: ["charter"]
  });
  assert.equal(page.body.dataset.adminSection, "charter");
});
