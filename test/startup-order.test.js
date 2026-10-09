"use strict";

// admin.js starts the console with loadBootstrap(), and the first render reads modules from the scripts after it in
// index.html (routes-ui.js, routes.js, itinerary-core.js, guest-preview.js, charter-pack.js). Deferred scripts run in
// order, but the browser keeps handling network replies while it waits for a slow one, so a bootstrap started as soon
// as admin.js runs can render before those modules exist (2026-10-09: "Cannot read properties of undefined (reading
// 'timeOptions')" on Charter Admin after a reload). DOMContentLoaded fires once every deferred script has run.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

// A stand-in for any DOM object: every property is another stand-in, calling one returns one, writes are ignored.
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

// Runs admin.js by itself, as the browser does while the deferred scripts after it are still downloading.
function runAdminAlone() {
  const requests = [];
  const listeners = {};
  const document = new Proxy(standIn(), {
    get: (target, prop) => (prop === "addEventListener"
      ? (type, listener) => { (listeners[type] = listeners[type] || []).push(listener); }
      : target[prop])
  });
  const window = {
    document,
    location: { search: "?key=test", origin: "http://admin.test" },
    addEventListener: () => {},
    fetch: url => { requests.push(String(url)); return new Promise(() => {}); },
    URL,
    URLSearchParams
  };
  window.window = window;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "admin.js"), "utf8"), window, { filename: "admin.js" });
  return {
    requests,
    fire: type => (listeners[type] || []).forEach(listener => listener({ type }))
  };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test("admin.js waits for DOMContentLoaded before it asks for the bootstrap", async () => {
  const admin = runAdminAlone();
  await settle();
  assert.deepEqual(admin.requests, [], "no request while the scripts after admin.js may still be loading");
  admin.fire("DOMContentLoaded");
  await settle();
  assert.equal(admin.requests.length, 1);
  assert.match(admin.requests[0], /\/api\/admin\/bootstrap\?key=test$/);
});

test("index.html loads every script with defer and none async, so DOMContentLoaded waits for all of them", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const scripts = html.match(/<script\b[^>]*>/gi) || [];
  assert.ok(scripts.length > 0);
  scripts.forEach(tag => {
    const attributeNames = tag.replace(/=\s*("[^"]*"|'[^']*')/g, "");   // so a src or ?v= can't match
    assert.match(attributeNames, /\bdefer\b/i, tag);
    assert.doesNotMatch(attributeNames, /\basync\b/i, tag);
  });
});
