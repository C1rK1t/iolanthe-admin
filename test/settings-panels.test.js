"use strict";

// Settings → OBS Feed and the OBS fields of Display Settings are gone (2026-10-10; iolanthe-server
// docs/superpowers/specs/2026-10-10-remove-obs-feed-design.md). These run admin.js in a vm sandbox, as
// refused-access.test.js does, signed in with the Settings section, and read what it writes into the workspace.

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

// The workspace keeps the HTML admin.js writes into it. The section menu's buttons are read back from that HTML and
// keep their click listeners, so a test can open a panel the way a click does.
function fakeWorkspace() {
  const workspace = { html: "", buttons: [] };
  const shell = {
    querySelectorAll: () => {
      workspace.buttons = [...workspace.html.matchAll(/data-panel="([^"]+)"/g)].map(([, panel]) => {
        const listeners = {};
        return {
          dataset: { panel },
          addEventListener: (type, listener) => { listeners[type] = listener; },
          click: () => listeners.click()
        };
      });
      return workspace.buttons;
    }
  };
  workspace.element = new Proxy(standIn(), {
    get(target, prop) {
      if (prop === "innerHTML") return workspace.html;
      if (prop === "querySelector") {
        return selector => (String(selector).startsWith("[data-section-shell") ? shell : null);
      }
      if (prop === "querySelectorAll") return () => [];
      return target[prop];
    },
    set(target, prop, value) {
      if (prop === "innerHTML") workspace.html = String(value);
      return true;
    }
  });
  return workspace;
}

const settle = async (rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

// What a server from before the removal still sends for Display Settings.
const OLD_DISPLAY_SETTINGS = {
  display_settings: {
    enabled: true, timeout_seconds: 60, zoom_cycle_seconds: 15,
    obsFeedEnabled: true, obs_feed_interval_seconds: 50, obs_feed_duration_seconds: 20,
    obs_feed_transition_seconds: 2, obs_ratio: "16:9",
    show_weather: true, show_itinerary: true, show_telemetry: true, telemetry_items: ["cog", "sog"]
  }
};

const SIGNED_IN = {
  role: "bridge",
  authenticated: true,
  department: "charter",
  active_charter: "",
  charters: [],
  allowed_sections: ["settings"],
  allowed_departments: ["charter"],
  settings: { sessionTimeoutMinutes: 30, isDevelopment: false }
};

// Loads admin.js signed in with the Settings section and fires DOMContentLoaded. Timers never fire. lookedUp lists
// every id admin.js asks document.getElementById for, in order.
async function bootSettings() {
  const workspace = fakeWorkspace();
  const requested = [];
  const lookedUp = [];
  const listeners = {};
  const document = new Proxy(standIn(), {
    get(target, prop) {
      if (prop === "addEventListener") {
        return (type, listener) => { (listeners[type] = listeners[type] || []).push(listener); };
      }
      if (prop === "getElementById") {
        return id => {
          lookedUp.push(String(id));
          return id === "workspace" ? workspace.element : standIn();
        };
      }
      return target[prop];
    }
  });
  const window = {
    document,
    location: { search: "?key=test", origin: "http://admin.test", href: "http://admin.test/admin/?key=test" },
    addEventListener: () => {},
    fetch: async url => {
      requested.push(String(url));
      const body = String(url).includes("/api/admin/bootstrap")
        ? SIGNED_IN
        : (String(url).includes("/api/admin/display-settings") ? OLD_DISPLAY_SETTINGS : {});
      return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body };
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    URL,
    URLSearchParams
  };
  window.window = window;
  vm.runInNewContext(ADMIN_SOURCE, window, { filename: "admin.js" });
  (listeners.DOMContentLoaded || []).forEach(listener => listener({ type: "DOMContentLoaded" }));
  await settle();
  return { workspace, requested, lookedUp };
}

// Opens a panel the way a click on its menu button does.
async function openPanel(workspace, panel) {
  workspace.buttons.find(button => button.dataset.panel === panel).click();
  await settle();
}

test("the Settings menu is Passwords, Display Settings, Route Track and Weather, with no OBS Feed", async () => {
  const { workspace, requested } = await bootSettings();
  const panels = [...workspace.html.matchAll(/data-panel="([^"]+)"/g)].map(([, panel]) => panel);
  assert.deepEqual(panels, ["passwords", "display-settings", "route-track", "weather"]);
  assert.equal(/\bOBS\b/i.test(workspace.html), false);
  assert.equal(requested.some(url => url.includes("navigation-feed")), false);
});

test("each Settings menu button opens its own panel", async () => {
  const { workspace } = await bootSettings();
  const expected = {
    passwords: ["Passwords", "passwords-form"],
    "display-settings": ["Display Settings", "display-settings-form"],
    "route-track": ["Route Track", "route-track-form"],
    weather: ["Weather", "weather-settings-form"]
  };
  for (const [panel, [heading, formId]] of Object.entries(expected)) {
    if (panel !== "passwords") {
      await openPanel(workspace, panel);
    }
    assert.match(workspace.html, new RegExp(`<h2>${heading}</h2>`), panel);
    assert.match(workspace.html, new RegExp(`id="${formId}"`), panel);
  }
});

test("Display Settings shows no OBS field, even when an older server still sends them", async () => {
  const { workspace, requested, lookedUp } = await bootSettings();
  const before = lookedUp.length;
  await openPanel(workspace, "display-settings");
  assert.ok(requested.some(url => url.includes("/api/admin/display-settings")));
  assert.match(workspace.html, /id="display-settings-form"/);
  assert.equal(/\bOBS\b|idle-obs-/i.test(workspace.html), false);
  assert.deepEqual([...workspace.html.matchAll(/id="(idle-[^"]+)"/g)].map(([, id]) => id), [
    "idle-enabled", "idle-timeout", "idle-zoom-cycle", "idle-show-weather", "idle-show-itinerary", "idle-show-telemetry"
  ]);
  // The form's change tracking reads the panel when it binds: it must ask only for fields the panel has.
  const formReads = lookedUp.slice(before).filter(id => id.startsWith("idle-"));
  assert.ok(formReads.includes("idle-zoom-cycle"), "the Display Settings form was not read");
  assert.deepEqual(formReads.filter(id => !workspace.html.includes(`id="${id}"`)), []);
});

test("no shipped admin file asks for a navigation-feed endpoint or keeps an OBS setting", () => {
  const shipped = fs.readdirSync(ROOT).filter(name => /\.(js|css|html)$/.test(name));
  assert.ok(shipped.includes("admin.js") && shipped.includes("index.html"));
  for (const name of shipped) {
    // Without the ?v= release tags: this release's, admin-no-obs, names the removal itself.
    const source = fs.readFileSync(path.join(ROOT, name), "utf8").replace(/\?v=[\w.-]+/g, "");
    for (const text of [
      "navigation-feed", "NavigationFeed", "obsFeed", "ObsFeed", "obs_feed", "obs_ratio", "OBS_Ratio", "idle-obs",
      "hls_url", "stream_key"
    ]) {
      assert.equal(source.includes(text), false, `${name}: ${text}`);
    }
    assert.equal(/\bOBS\b/i.test(source), false, `${name}: OBS`);
  }
});
