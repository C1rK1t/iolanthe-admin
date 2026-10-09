# Spec P — Plan 2: Admin core (`pack-core.js`, `pack-render.js`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pure half of [spec-pack.md](../spec-pack.md) §2–§4 and §7: the preset rules, the cover facts, the map
markers and key, `buildPackModel` (guest payload + preset → plain data) and the HTML for the cover and each section's
blocks. No DOM, no admin globals, so both run under `node --test` and phase 2 can reuse them.

**Architecture:** `pack-core.js` is a UMD module like `itinerary-core.js` and builds on it (`charterDayCount`,
`recordDayCount`, `deriveDays`, `stopSpan`, `dayDateLabel`, `distNm`); in the browser it reads
`window.IolantheItineraryCore`, so its `<script>` must load after `itinerary-core.js` (plan P-3 Task 4).
`pack-render.js` takes the model and returns `{ cover, sections: [{ id, title, blocks }] }` plus `pageHtml`,
`sectionHead` and `coverPageHtml`, which plan P-3's page uses to lay blocks onto A4 pages. The route list covers
`max(charter days, route days)`, so a route that runs past the charter still shows every stop; the cover's "days" tile is
the charter's own length.

**Tech Stack:** plain JS, `node --test` (146 tests → 169). Admin repo from `main` at `e108e7e` or later.

**Dry-run (done while planning):** both modules, both test files and the fixture were assembled from this plan's text
onto a copy of `main` at `e108e7e`: `node --test` 169/169; then used by plan P-3's page in the browser on a scratch server.

**Shared checkout hazard:** another Claude session may work in the same checkouts. **Never** run `git checkout`,
`git switch`, `git stash` or `git add -A` in the main checkouts under `S:/Users/David/OneDrive/Maker Space/GitHub`. All
work happens in the worktree made in Task 0. Stage files by name. Before each task, run
`git -C <worktree> branch --show-current` and expect `feat/charter-pack`.

**Reading before you start:** `itinerary-core.js` (the UMD wrapper at the top, `stopEntries`, `stopSpan`, `deriveDays`,
`charterDayCount`, `recordDayCount`, `dayDateLabel`), `test/guest-preview-core.test.js` (test style).

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `test/fixtures/pack-csaba.json` (new) | Task 1: the csaba guest payload, trimmed (7 stops, 13 activities, 2 menu days, 1 drinks section, vessel) |
| `pack-core.js` (new) + `test/pack-core.test.js` (new) | Task 1: preset rules, dates, route summary, markers, merge, key, `buildPackModel` |
| `pack-render.js` (new) + `test/pack-render.test.js` (new) | Task 2: cover and block HTML, `pageHtml`, `sectionHead`, `coverPageHtml` |

---

### Task 0: Worktree (this session runs it, not an implementer)

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin"
git fetch -q origin
git worktree add "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/charter-pack/portal/iolanthe-admin" -b feat/charter-pack origin/main
cd "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/charter-pack/portal/iolanthe-admin" && node --test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected `ℹ pass 146`, `ℹ fail 0` (more if other work merged first; the counts below assume 146). Plans P-2 and P-3 share
this worktree and branch. Check `assets/pack/` holds `hero-default.jpg`, `stamp.png` and `vessel-line-art.png` (they
came with the spec PR); if not, stop and tell David.

---

### Task 1: `pack-core.js`, its fixture and tests

**Files:** create `test/fixtures/pack-csaba.json`, `test/pack-core.test.js`, `pack-core.js`

- [ ] **Step 1: Create the fixture** `test/fixtures/pack-csaba.json`:

```json
{
  "itinerary": {
    "welcome_message": "We welcome you to your charter.  Starting in Cebu and finishing in Port Caltom, Busuanga.  On this whistle stop tour we hope to see the gracefull Thresher shark, the mighty Whale shark and the loveable Dugong.  The cruise will let you experience some of the most beautiful and stunning landscapes the Philippines has to offer while diving on some of the most famous spots in the world. \n \n Note:  The Itinerary is subject to change, for example due to adverse weather conditions. This will be discussed with you if a change is required.",
    "charter_name": "New",
    "guest_count": 1,
    "start_date": "2026-11-01",
    "end_date": "2026-11-09",
    "route": {
      "points": [
        {
          "latitude": 10.329364,
          "longitude": 123.975839,
          "stop": true,
          "name": "Cebu Yacht Club",
          "id": "stp_rj0hyg",
          "site_ids": [
            "cebu-yacht-club"
          ],
          "depart": {
            "day": 2
          }
        },
        {
          "latitude": 9.463219,
          "longitude": 123.380808,
          "stop": true,
          "name": "Oslob and Apo Island",
          "id": "stp_m8hxgt",
          "site_ids": [
            "oslob",
            "apo-island"
          ],
          "arrive": {
            "day": 2
          },
          "depart": {
            "day": 3
          }
        },
        {
          "latitude": 8.847239,
          "longitude": 119.916011,
          "stop": true,
          "name": "Tubbataha Reef",
          "id": "stp_rq7xt6",
          "site_ids": [
            "tubbataha-reef"
          ],
          "arrive": {
            "day": 4
          },
          "depart": {
            "day": 7
          }
        },
        {
          "latitude": 11.977719,
          "longitude": 120.043203,
          "stop": true,
          "name": "Coron Wrecks",
          "id": "stp_hnow92",
          "site_ids": [
            "coron-wrecks"
          ],
          "arrive": {
            "day": 8
          },
          "depart": {
            "day": 9
          }
        },
        {
          "latitude": 11.954372,
          "longitude": 120.213719,
          "stop": true,
          "name": "Coron Island",
          "id": "stp_g3r3vm",
          "site_ids": [
            "coron-island"
          ],
          "arrive": {
            "day": 9
          },
          "depart": {
            "day": 10
          }
        },
        {
          "latitude": 12.325233,
          "longitude": 119.907272,
          "stop": true,
          "name": "North Busuanga",
          "id": "stp_yjg7kf",
          "site_ids": [
            "dugong-sanctury",
            "black-island",
            "debotunay-island"
          ],
          "arrive": {
            "day": 10
          },
          "depart": {
            "day": 11
          }
        },
        {
          "latitude": 12.177978,
          "longitude": 120.094689,
          "stop": true,
          "name": "Port Caltom",
          "id": "stp_2y25bt",
          "site_ids": [
            "port-caltom"
          ],
          "arrive": {
            "day": 11
          }
        }
      ]
    },
    "activities": [
      {
        "id": "act_cv3gts",
        "stop_id": "stp_rj0hyg",
        "day": 1,
        "order": 0,
        "title": "Guests arrive for the start of the Charter",
        "notes": ""
      },
      {
        "id": "act_h0e6fv",
        "stop_id": "stp_m8hxgt",
        "day": 2,
        "order": 0,
        "title": "Diving with Whale Sharks in the morning and an afternoon dive at Apo Island",
        "notes": ""
      },
      {
        "id": "act_51eh5f",
        "stop_id": "stp_m8hxgt",
        "day": 2,
        "order": 1,
        "title": "Oslob",
        "notes": "Diving with whale sharks at 0800  followed by breakfast aboard",
        "site_id": "oslob"
      },
      {
        "id": "act_s2flio",
        "stop_id": "stp_m8hxgt",
        "day": 2,
        "order": 2,
        "title": "Apo Island",
        "notes": "Afternoon dive around Apo Island",
        "site_id": "apo-island"
      },
      {
        "id": "act_2i9yfn",
        "stop_id": "stp_rq7xt6",
        "day": 4,
        "order": 0,
        "title": "Arrival and check-in at the Ranger Station protecting the beautiful Tubbataha Reef. 2 dives scheduled with the option of",
        "notes": ""
      },
      {
        "id": "act_5yma20",
        "stop_id": "stp_rq7xt6",
        "day": 5,
        "order": 0,
        "title": "2 to 3 more dives planned on this world heritage.  Departing for Coron Island at the end of the day.",
        "notes": ""
      },
      {
        "id": "act_yynncs",
        "stop_id": "stp_hnow92",
        "day": 8,
        "order": 0,
        "title": "Diving on two of the famous WW2 wrecks in Coron",
        "notes": ""
      },
      {
        "id": "act_9dmbax",
        "stop_id": "stp_g3r3vm",
        "day": 9,
        "order": 0,
        "title": "Anchored close to the lagoons of the geologically stunning Coron Island.",
        "notes": ""
      },
      {
        "id": "act_bahw0o",
        "stop_id": "stp_yjg7kf",
        "day": 10,
        "order": 0,
        "title": "In search of Dugongs, exporing Black Island and relaxing evening BBQ around a bonfire",
        "notes": ""
      },
      {
        "id": "act_vn5juq",
        "stop_id": "stp_yjg7kf",
        "day": 10,
        "order": 1,
        "title": "Dugong Sanctury",
        "notes": "Eary dive with the Dugong brothers.",
        "site_id": "dugong-sanctury"
      },
      {
        "id": "act_vegbo0",
        "stop_id": "stp_yjg7kf",
        "day": 10,
        "order": 2,
        "title": "Black Island",
        "notes": "Explore Black Island beach and it's hidden cave.",
        "site_id": "black-island"
      },
      {
        "id": "act_m9xlum",
        "stop_id": "stp_yjg7kf",
        "day": 10,
        "order": 3,
        "title": "Debotunay Island",
        "notes": "Evening BBQ and bonfire on a beautiful beach.",
        "site_id": "debotunay-island"
      },
      {
        "id": "act_pg823y",
        "stop_id": "stp_2y25bt",
        "day": 11,
        "order": 0,
        "title": "Final destination.  Anchored as close to the airport as possible on Busuanga Island",
        "notes": ""
      }
    ]
  },
  "menus": {
    "menus": [
      {
        "order": 1,
        "day": 1,
        "charter_day": 1,
        "active": true,
        "label": "Day 1",
        "todays_notes": "Mediterranean Lunch / Classic Dinner",
        "breakfast": [
          {
            "name": "Fresh Fruit Plate",
            "description": "Seasonal tropical fruit selection"
          },
          {
            "name": "Eggs to Order",
            "description": "Served with toast and breakfast potatoes"
          }
        ],
        "lunch": [
          {
            "name": "Grilled Chicken Salad",
            "description": "Lemon herb dressing"
          },
          {
            "name": "Seafood Pasta",
            "description": "Light tomato and garlic sauce"
          }
        ],
        "dinner": [
          {
            "name": "Beef Tenderloin",
            "description": "Mash, green beans, red wine jus"
          },
          {
            "name": "Chocolate Tart",
            "description": "Served with vanilla cream"
          }
        ],
        "snacks": [],
        "date": null
      },
      {
        "order": 2,
        "day": 2,
        "charter_day": 2,
        "active": true,
        "label": "Day 2",
        "todays_notes": "",
        "breakfast": [],
        "lunch": [],
        "dinner": [],
        "snacks": []
      }
    ]
  },
  "guest_drinks": {
    "sections": [
      {
        "title": "Wine",
        "items": [
          {
            "name": "Whispering Angel - Rosé 2024",
            "description": "Provence rosé with pale colour, red fruit and crisp freshness."
          },
          {
            "name": "Calvet - Pomerol 2021",
            "description": "Right-bank Bordeaux red with Merlot-led dark fruit and soft tannins."
          }
        ]
      }
    ]
  },
  "vessel": {
    "description": "Captain Allen J. Sutton and all the crew welcome you onboard and hope you have a wonderful cruise. If there is anything you require, please do not hesitate to ask.",
    "details": [
      {
        "label": "Vessel Name",
        "value": "M/Y Princess Iolanthe"
      },
      {
        "label": "Type",
        "value": "Motor Yacht"
      },
      {
        "label": "Length",
        "value": "45.7 m / 149'11\""
      },
      {
        "label": "Beam",
        "value": "9 m / 29'6\""
      }
    ],
    "sections": [
      {
        "title": "General Notes",
        "items": [
          "Please read and familiarize yourself with the vessel safety brief included in this pack, including the evacuation route from your cabin.",
          "Life jackets and fire extinguishers are located in each cabin and around the vessel for use only in an emergency."
        ]
      }
    ],
    "crew_groups": [
      {
        "title": "Bridge and Deck",
        "members": [
          {
            "name": "Allen J. Sutton",
            "position": "Captain / Master"
          },
          {
            "name": "David",
            "position": "First Officer / ETO"
          }
        ]
      },
      {
        "title": "Interior",
        "members": [
          {
            "name": "Paul",
            "position": "Chef"
          },
          {
            "name": "Kio",
            "position": "Sous-chef"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Write the failing test.** Create `test/pack-core.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../pack-core.js");
const csaba = require("./fixtures/pack-csaba.json");

const ALL = ["summary", "route", "crew", "menus"];
const pack = (extra) => ({ ...core.defaultPack(), ...(extra || {}) });

test("defaultPack and normalizePack mirror the server rules", () => {
  assert.deepEqual(core.defaultPack(), { theme: "a", type: "proposal", prepared_for: "", cover_note: "", sections: ALL, cover_image: null });
  assert.deepEqual(core.normalizePack(null), core.defaultPack());
  const n = core.normalizePack({ theme: "c", type: "brief", prepared_for: "x".repeat(130), sections: ["menus", "route", "bogus"], cover_image: "cover-1700000000000.jpg" });
  assert.equal(n.theme, "c");
  assert.equal(n.type, "brief");
  assert.equal(n.prepared_for.length, 120);
  assert.deepEqual(n.sections, ["route", "menus"]);
  assert.equal(n.cover_image, "cover-1700000000000.jpg");
  assert.equal(core.normalizePack({ cover_image: "../x.jpg" }).cover_image, null);
  assert.deepEqual(core.normalizePack({ sections: [] }).sections, ALL);
});

test("toggleSection keeps the standard order and never empties the list", () => {
  assert.deepEqual(core.toggleSection(["summary", "menus"], "route"), ["summary", "route", "menus"]);
  assert.deepEqual(core.toggleSection(["summary", "menus"], "menus"), ["summary"]);
  assert.deepEqual(core.toggleSection(["crew"], "crew"), ["crew"]);
  assert.deepEqual(core.toggleSection(["crew"], "nope"), ["crew"]);
});

test("formatDateRange: same month, across months, across years, missing", () => {
  assert.equal(core.formatDateRange("2026-11-01", "2026-11-09"), "1 – 9 November 2026");
  assert.equal(core.formatDateRange("2026-11-28", "2026-12-03"), "28 November – 3 December 2026");
  assert.equal(core.formatDateRange("2026-12-28", "2027-01-03"), "28 December 2026 – 3 January 2027");
  assert.equal(core.formatDateRange("2026-11-01", "2026-11-01"), "1 November 2026");
  assert.equal(core.formatDateRange("2026-11-01", ""), "1 November 2026");
  assert.equal(core.formatDateRange("", ""), "");
});

test("routeSummary: none, one, many", () => {
  assert.equal(core.routeSummary([]), "");
  assert.equal(core.routeSummary([{ name: "Cebu" }]), "Cebu");
  assert.equal(core.routeSummary([{ name: "Cebu" }, { name: "Oslob" }, { name: "Port Caltom" }]), "Cebu → Port Caltom");
});

test("dayLabel: one day or a range", () => {
  assert.equal(core.dayLabel([2]), "2");
  assert.equal(core.dayLabel([4, 5, 6]), "4–6");
  assert.equal(core.dayLabel([]), "");
});

test("mapMarkers: one per charter stop with the days it covers; waypoints are skipped", () => {
  const markers = core.mapMarkers(csaba.itinerary);
  assert.equal(markers.length, 7);
  assert.deepEqual(markers.map((m) => m.label), ["1–2", "2–3", "4–7", "8–9", "9–10", "10–11", "11"]);
  assert.equal(markers[1].name, "Oslob and Apo Island");
  assert.ok(Number.isFinite(markers[0].lat) && Number.isFinite(markers[0].lng));
  assert.deepEqual(core.mapMarkers({ route: { points: [{ latitude: 1, longitude: 2 }] } }), []);
});

test("mapKey: one line per stop", () => {
  assert.deepEqual(core.mapKey([{ label: "2", name: "Oslob" }, { label: "4–5", name: "Apo" }]), ["2 · Oslob", "4–5 · Apo"]);
});

test("mergeMarkers: markers closer than the threshold share one marker", () => {
  const pts = [
    { x: 0, y: 0, label: "3", name: "A" },
    { x: 10, y: 5, label: "4", name: "B" },
    { x: 100, y: 0, label: "5", name: "C" },
    { x: 117, y: 0, label: "6", name: "D" },
    { x: 118, y: 0, label: "7", name: "E" }
  ];
  const merged = core.mergeMarkers(pts, 18);
  assert.deepEqual(merged.map((m) => m.label), ["3, 4", "5, 6", "7"]);
  assert.deepEqual(merged[0].names, ["A", "B"]);
  assert.deepEqual([merged[0].x, merged[0].y], [5, 2.5]);
  assert.equal(core.mergeMarkers([], 18).length, 0);
});

test("buildPackModel: cover facts from the csaba fixture", () => {
  const m = core.buildPackModel(csaba, pack({ prepared_for: "Mr & Mrs Csaba", cover_note: "Dear both" }));
  assert.equal(m.theme, "a");
  assert.equal(m.kicker, "Charter Proposal");
  assert.equal(m.vesselName, "M/Y Princess Iolanthe");
  assert.equal(m.routeSummary, "Cebu Yacht Club → Port Caltom");
  assert.equal(m.dates, "1 – 9 November 2026");
  assert.equal(m.preparedFor, "Mr & Mrs Csaba");
  assert.equal(m.coverNote, "Dear both");
  assert.equal(m.footer, "Charter Proposal · Mr & Mrs Csaba");
  assert.equal(m.subjectToChange, true);
  assert.deepEqual(m.stats.map((s) => s.label), ["days", "stops", "nm"]);
  assert.equal(m.stats[0].value, "9", "the charter's own length, not the route's");
  assert.equal(m.stats[1].value, "7");
  assert.ok(Number(m.stats[2].value) > 100);
  assert.equal(core.buildPackModel(csaba, pack({ type: "brief" })).subjectToChange, false);
  assert.equal(core.buildPackModel(csaba, pack({ type: "brief" })).footer, "Charter Brief");
});

test("buildPackModel: sections follow the ticked list and the data", () => {
  const all = core.buildPackModel(csaba, pack());
  assert.deepEqual(all.sections.map((s) => s.id), ALL);
  const two = core.buildPackModel(csaba, pack({ sections: ["menus", "summary"] }));
  assert.deepEqual(two.sections.map((s) => s.id), ["summary", "menus"]);
  const empty = { itinerary: { start_date: "2026-11-01", end_date: "2026-11-03", route: { points: [] }, activities: [] }, menus: { menus: [] }, guest_drinks: { sections: [] }, vessel: {} };
  assert.deepEqual(core.buildPackModel(empty, pack()).sections.map((s) => s.id), ["summary"]);
});

test("buildPackModel: summary rows", () => {
  const summary = core.buildPackModel(csaba, pack()).sections[0];
  assert.deepEqual(summary.rows, [
    { label: "Dates", value: "1 – 9 November 2026" },
    { label: "Nights", value: "8" },
    { label: "Guests", value: "1" },
    { label: "Embarkation", value: "Cebu Yacht Club" },
    { label: "Disembarkation", value: "Port Caltom" }
  ]);
  assert.match(summary.welcome, /^We welcome you to your charter/);
});

test("buildPackModel: route days carry dates, stops and that day's activities", () => {
  const route = core.buildPackModel(csaba, pack()).sections.find((s) => s.id === "route");
  assert.equal(route.days.length, 11);
  assert.equal(route.days[0].date, "Sun 1 Nov");
  assert.equal(route.days[1].stops.map((s) => s.name).join(" / "), "Cebu Yacht Club / Oslob and Apo Island");
  const oslob = route.days[1].stops[1];
  assert.ok(oslob.activities.length >= 2);
  assert.ok(oslob.activities.every((a) => typeof a.title === "string" && typeof a.notes === "string"));
  assert.equal(route.markers.length, 7);
  assert.equal(route.key[0], "1–2 · Cebu Yacht Club");
});

test("buildPackModel: stop times show on the day they happen", () => {
  const data = {
    itinerary: {
      start_date: "2026-11-01", end_date: "2026-11-02",
      route: { points: [
        { latitude: 1, longitude: 1, stop: true, id: "a", name: "A", depart: { day: 1, time: "07:00" } },
        { latitude: 2, longitude: 2, stop: true, id: "b", name: "B", arrive: { day: 2, time: "15:30" } }
      ] },
      activities: []
    }
  };
  const route = core.buildPackModel(data, pack()).sections.find((s) => s.id === "route");
  assert.equal(route.days[0].stops[0].times, "Departs 07:00");
  assert.equal(route.days[1].stops[0].times, "Arrives 15:30");
  const rows = core.buildPackModel(data, pack()).sections[0].rows;
  assert.equal(rows.find((r) => r.label === "Embarkation").value, "A, departs 07:00");
  assert.equal(rows.find((r) => r.label === "Disembarkation").value, "B, arrives 15:30");
  assert.equal(rows.find((r) => r.label === "Guests"), undefined, "an empty row is left out");
});

test("buildPackModel: crew and yacht", () => {
  const crew = core.buildPackModel(csaba, pack()).sections.find((s) => s.id === "crew");
  assert.match(crew.description, /welcome you onboard/);
  assert.deepEqual(crew.details[0], { label: "Vessel Name", value: "M/Y Princess Iolanthe" });
  assert.equal(crew.notes[0].title, "General Notes");
  assert.equal(crew.groups[0].title, "Bridge and Deck");
  assert.deepEqual(crew.groups[0].members[0], { name: "Allen J. Sutton", position: "Captain / Master" });
});

test("buildPackModel: menus keep active days with courses; drinks keep sections with items", () => {
  const menus = core.buildPackModel(csaba, pack()).sections.find((s) => s.id === "menus");
  assert.equal(menus.menus.length, 1, "Day 2 has no dishes and is left out");
  assert.equal(menus.menus[0].label, "Day 1");
  assert.equal(menus.menus[0].notes, "Mediterranean Lunch / Classic Dinner");
  assert.deepEqual(menus.menus[0].courses.map((c) => c.title), ["Breakfast", "Lunch", "Dinner"]);
  assert.deepEqual(menus.menus[0].courses[0].items[0], { name: "Fresh Fruit Plate", description: "Seasonal tropical fruit selection" });
  assert.deepEqual(menus.drinks.map((d) => d.title), ["Wine"]);
  assert.ok(menus.drinks[0].items.length > 0);
  const inactive = { ...csaba, menus: { menus: [{ ...csaba.menus.menus[0], active: false }] }, guest_drinks: { sections: [] } };
  assert.equal(core.buildPackModel(inactive, pack()).sections.find((s) => s.id === "menus"), undefined);
});
```

- [ ] **Step 3: Run it and watch it fail.** `node --test test/pack-core.test.js` → `Cannot find module '../pack-core.js'`.

- [ ] **Step 4: Write the module.** Create `pack-core.js`:

```js
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./itinerary-core.js"));
  } else {
    root.IolanthePackCore = factory(root.IolantheItineraryCore);
  }
})(typeof self !== "undefined" ? self : this, function (itin) {
  "use strict";

  // Pure logic for the Charter Pack page (charter rework spec P): the preset rules (mirror of the server's
  // lib/charter-pack.js), the cover facts, the map markers and key, and buildPackModel, which turns the guest payload
  // (/api/charter?charter=<id>) and a preset into plain data for pack-render.js. No DOM here.

  const THEMES = ["a", "b", "c"];
  const TYPES = ["proposal", "brief"];
  const SECTIONS = ["summary", "route", "crew", "menus"];
  const SECTION_TITLES = { summary: "Charter Summary", route: "Route & Itinerary", crew: "Crew & Yacht", menus: "Menus & Drinks" };
  const PREPARED_FOR_MAX = 120;
  const COVER_NOTE_MAX = 600;
  const COVER_NAME_RE = /^cover-\d{13}\.(?:jpg|png|webp)$/;
  const DEFAULT_VESSEL_NAME = "M/Y Princess Iolanthe";
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const COURSES = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks"]];

  const toObj = (v) => (v && typeof v === "object" ? v : {});
  const toArr = (v) => (Array.isArray(v) ? v : []);
  const text = (v) => (typeof v === "string" ? v.trim() : "");

  function defaultPack() {
    return { theme: "a", type: "proposal", prepared_for: "", cover_note: "", sections: [...SECTIONS], cover_image: null };
  }

  function normalizePack(raw) {
    const p = toObj(raw);
    const sections = SECTIONS.filter((id) => toArr(p.sections).includes(id));
    return {
      theme: THEMES.includes(p.theme) ? p.theme : "a",
      type: TYPES.includes(p.type) ? p.type : "proposal",
      prepared_for: typeof p.prepared_for === "string" ? p.prepared_for.slice(0, PREPARED_FOR_MAX) : "",
      cover_note: typeof p.cover_note === "string" ? p.cover_note.slice(0, COVER_NOTE_MAX) : "",
      sections: sections.length ? sections : [...SECTIONS],
      cover_image: typeof p.cover_image === "string" && COVER_NAME_RE.test(p.cover_image) ? p.cover_image : null
    };
  }

  // Ticks or unticks a section; the last ticked section stays ticked.
  function toggleSection(sections, id) {
    if (!SECTIONS.includes(id)) return [...sections];
    const has = sections.includes(id);
    if (has && sections.length === 1) return [...sections];
    return SECTIONS.filter((s) => (s === id ? !has : sections.includes(s)));
  }

  function parts(value) {
    const t = itin.parseDateOnly(value);
    if (t === null) return null;
    const d = new Date(t);
    return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
  }

  // "1 – 9 November 2026", "28 November – 3 December 2026", "28 December 2026 – 3 January 2027".
  function formatDateRange(start, end) {
    const a = parts(start);
    const b = parts(end);
    if (!a) return "";
    const full = (p) => `${p.day} ${MONTHS[p.month]} ${p.year}`;
    if (!b || (a.day === b.day && a.month === b.month && a.year === b.year)) return full(a);
    if (a.year !== b.year) return `${full(a)} – ${full(b)}`;
    if (a.month !== b.month) return `${a.day} ${MONTHS[a.month]} – ${full(b)}`;
    return `${a.day} – ${full(b)}`;
  }

  function routeSummary(stops) {
    const names = toArr(stops).map((s) => text(s.name)).filter(Boolean);
    if (!names.length) return "";
    return names.length === 1 ? names[0] : `${names[0]} → ${names[names.length - 1]}`;
  }

  function dayLabel(days) {
    const list = toArr(days);
    if (!list.length) return "";
    return list.length === 1 ? String(list[0]) : `${list[0]}–${list[list.length - 1]}`;
  }

  function stopsOf(itinerary) {
    return itin.stopEntries(toArr(toObj(toObj(itinerary).route).points)).map((e) => e.point);
  }

  function listDayCount(itinerary) {
    const charterDays = itin.charterDayCount(itinerary);
    const recordDays = itin.recordDayCount(toArr(toObj(toObj(itinerary).route).points));
    return Math.max(charterDays, recordDays);
  }

  // One marker per charter stop: { id, name, lat, lng, label } where label is the day(s) it covers.
  function mapMarkers(itinerary) {
    const stops = stopsOf(itinerary);
    const dayCount = listDayCount(itinerary);
    return stops.map((stop, i) => {
      const span = itin.stopSpan(stop, itin.positionOf(i, stops.length), dayCount);
      const days = [];
      for (let d = span.from; d <= span.to; d += 1) days.push(d);
      return { id: stop.id || `stop-${i + 1}`, name: text(stop.name) || `Stop ${i + 1}`, lat: stop.latitude, lng: stop.longitude, label: dayLabel(days) };
    });
  }

  function mapKey(markers) {
    return toArr(markers).map((m) => `${m.label} · ${m.name}`);
  }

  // points: [{ x, y, label, name }] in screen pixels. A point closer than minPx to a group's first point joins it.
  function mergeMarkers(points, minPx) {
    const groups = [];
    toArr(points).forEach((p) => {
      const group = groups.find((g) => Math.hypot(g.anchor.x - p.x, g.anchor.y - p.y) < minPx);
      if (group) group.members.push(p);
      else groups.push({ anchor: p, members: [p] });
    });
    return groups.map((g) => ({
      x: g.members.reduce((sum, p) => sum + p.x, 0) / g.members.length,
      y: g.members.reduce((sum, p) => sum + p.y, 0) / g.members.length,
      label: g.members.map((p) => p.label).join(", "),
      names: g.members.map((p) => p.name)
    }));
  }

  function routeNm(itinerary) {
    const points = toArr(toObj(toObj(itinerary).route).points);
    let nm = 0;
    for (let i = 1; i < points.length; i += 1) nm += itin.distNm(points[i - 1], points[i]);
    return Math.round(nm);
  }

  function stopTimes(stop, day) {
    const out = [];
    if (stop.arrive && stop.arrive.day === day && stop.arrive.time) out.push(`Arrives ${stop.arrive.time}`);
    if (stop.depart && stop.depart.day === day && stop.depart.time) out.push(`Departs ${stop.depart.time}`);
    return out.join(" · ");
  }

  function summarySection(itinerary, stops) {
    const first = stops[0];
    const last = stops[stops.length - 1];
    const dayCount = itin.charterDayCount(itinerary);
    const embark = first ? `${text(first.name)}${first.depart && first.depart.time ? `, departs ${first.depart.time}` : ""}` : "";
    const disembark = last && stops.length > 1 ? `${text(last.name)}${last.arrive && last.arrive.time ? `, arrives ${last.arrive.time}` : ""}` : "";
    const rows = [
      { label: "Dates", value: formatDateRange(itinerary.start_date, itinerary.end_date) },
      { label: "Nights", value: dayCount > 1 ? String(dayCount - 1) : "" },
      { label: "Guests", value: Number.isInteger(itinerary.guest_count) && itinerary.guest_count > 0 ? String(itinerary.guest_count) : "" },
      { label: "Embarkation", value: embark },
      { label: "Disembarkation", value: disembark }
    ].filter((row) => row.value);
    return { id: "summary", title: SECTION_TITLES.summary, rows, welcome: text(itinerary.welcome_message) };
  }

  function routeSection(itinerary, stops) {
    if (!stops.length) return null;
    const byId = new Map(stops.map((s) => [s.id, s]));
    const days = itin.deriveDays(itinerary, listDayCount(itinerary)).map((d) => ({
      day: d.day,
      date: itin.dayDateLabel(itinerary, d.day),
      stops: d.stops.map((s) => ({
        name: s.name,
        times: stopTimes(byId.get(s.id) || {}, d.day),
        activities: s.activities.map((a) => ({ title: text(a.title), notes: text(a.notes) }))
      }))
    }));
    const markers = mapMarkers(itinerary);
    return { id: "route", title: SECTION_TITLES.route, markers, key: mapKey(markers), days };
  }

  function crewSection(vessel) {
    const v = toObj(vessel);
    const details = toArr(v.details).map((d) => ({ label: text(toObj(d).label), value: text(toObj(d).value) })).filter((d) => d.label && d.value);
    const notes = toArr(v.sections).map((s) => ({ title: text(toObj(s).title), items: toArr(toObj(s).items).map(text).filter(Boolean) })).filter((s) => s.items.length);
    const groups = toArr(v.crew_groups).map((g) => ({
      title: text(toObj(g).title),
      members: toArr(toObj(g).members).map((m) => ({ name: text(toObj(m).name), position: text(toObj(m).position) })).filter((m) => m.name)
    })).filter((g) => g.members.length);
    const description = text(v.description);
    if (!description && !details.length && !notes.length && !groups.length) return null;
    return { id: "crew", title: SECTION_TITLES.crew, description, details, notes, groups };
  }

  function menusSection(menus, drinks) {
    const days = toArr(toObj(menus).menus).filter((m) => toObj(m).active !== false).map((m) => ({
      label: text(m.label),
      notes: text(m.todays_notes),
      courses: COURSES.map(([key, title]) => ({
        title,
        items: toArr(m[key]).map((i) => ({ name: text(toObj(i).name), description: text(toObj(i).description) })).filter((i) => i.name)
      })).filter((c) => c.items.length)
    })).filter((m) => m.courses.length);
    const drinkSections = toArr(toObj(drinks).sections).map((s) => ({
      title: text(toObj(s).title),
      items: toArr(toObj(s).items).map((i) => ({ name: text(toObj(i).name), description: text(toObj(i).description) })).filter((i) => i.name)
    })).filter((s) => s.items.length);
    if (!days.length && !drinkSections.length) return null;
    return { id: "menus", title: SECTION_TITLES.menus, menus: days, drinks: drinkSections };
  }

  // payload: the guest payload for the charter ({ itinerary, menus, guest_drinks, vessel }); pack: a preset.
  function buildPackModel(payload, rawPack) {
    const data = toObj(payload);
    const pack = normalizePack(rawPack);
    const itinerary = toObj(data.itinerary);
    const stops = stopsOf(itinerary);
    const vesselDetail = toArr(toObj(data.vessel).details).find((d) => text(toObj(d).label).toLowerCase() === "vessel name");
    const kicker = pack.type === "brief" ? "Charter Brief" : "Charter Proposal";
    const preparedFor = text(pack.prepared_for);
    const builders = {
      summary: () => summarySection(itinerary, stops),
      route: () => routeSection(itinerary, stops),
      crew: () => crewSection(data.vessel),
      menus: () => menusSection(data.menus, data.guest_drinks)
    };
    const dayCount = itin.charterDayCount(itinerary) || listDayCount(itinerary);
    return {
      theme: pack.theme,
      type: pack.type,
      kicker,
      vesselName: vesselDetail ? text(vesselDetail.value) || DEFAULT_VESSEL_NAME : DEFAULT_VESSEL_NAME,
      routeSummary: routeSummary(stops),
      dates: formatDateRange(itinerary.start_date, itinerary.end_date),
      preparedFor,
      coverNote: text(pack.cover_note),
      footer: preparedFor ? `${kicker} · ${preparedFor}` : kicker,
      subjectToChange: pack.type === "proposal",
      stats: [
        { label: "days", value: String(dayCount) },
        { label: "stops", value: String(stops.length) },
        { label: "nm", value: String(routeNm(itinerary)) }
      ],
      sections: pack.sections.map((id) => builders[id]()).filter(Boolean)
    };
  }

  return {
    THEMES, TYPES, SECTIONS, SECTION_TITLES, PREPARED_FOR_MAX, COVER_NOTE_MAX,
    defaultPack, normalizePack, toggleSection, formatDateRange, routeSummary, dayLabel,
    mapMarkers, mapKey, mergeMarkers, buildPackModel
  };
});
```

- [ ] **Step 5: Run the tests.** `node --test test/pack-core.test.js` → `ℹ pass 15`. `node --test` → `ℹ pass 161`.

- [ ] **Step 6: Commit.**

```bash
git add pack-core.js test/pack-core.test.js test/fixtures/pack-csaba.json
git commit -m "feat(pack): pack-core.js, the charter pack model"
```

---

### Task 2: `pack-render.js` and its tests

**Files:** create `test/pack-render.test.js`, `pack-render.js`

- [ ] **Step 1: Write the failing test.** Create `test/pack-render.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../pack-core.js");
const render = require("../pack-render.js");
const csaba = require("./fixtures/pack-csaba.json");

const OPTS = { coverUrl: "/admin/assets/pack/hero-default.jpg", stampUrl: "/admin/assets/pack/stamp.png" };
const model = (extra) => core.buildPackModel(csaba, { ...core.defaultPack(), ...(extra || {}) });

test("renderPack: the cover carries the facts, the photo and the stamp", () => {
  const out = render.renderPack(model({ prepared_for: "Mr & Mrs Csaba", cover_note: "Line one\nLine two" }), OPTS);
  assert.match(out.cover, /class="pack-kicker">Charter Proposal</);
  assert.match(out.cover, /M\/Y Princess Iolanthe/);
  assert.match(out.cover, /Cebu Yacht Club → Port Caltom/);
  assert.match(out.cover, /1 – 9 November 2026/);
  assert.match(out.cover, /src="\/admin\/assets\/pack\/hero-default\.jpg"/);
  assert.match(out.cover, /src="\/admin\/assets\/pack\/stamp\.png"/);
  assert.match(out.cover, /Mr &amp; Mrs Csaba/);
  assert.match(out.cover, /Line one<br>Line two/);
});

test("renderPack: no Prepared for block when it is empty", () => {
  const out = render.renderPack(model(), OPTS);
  assert.doesNotMatch(out.cover, /Prepared for/);
});

test("renderPack: escapes text from the charter data", () => {
  const data = { ...csaba, itinerary: { ...csaba.itinerary, welcome_message: "<script>alert(1)</script> & \"hi\"" } };
  const out = render.renderPack(core.buildPackModel(data, core.defaultPack()), OPTS);
  const html = out.sections[0].blocks.join("");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;hi&quot;/);
});

test("renderPack: the welcome text becomes one paragraph per line", () => {
  const data = { ...csaba, itinerary: { ...csaba.itinerary, welcome_message: "First line.\n\nSecond line.\nThird." } };
  const out = render.renderPack(core.buildPackModel(data, core.defaultPack()), OPTS);
  assert.equal(out.sections[0].blocks[1], '<div class="pack-block pack-welcome"><p>First line.</p><p>Second line.</p><p>Third.</p></div>');
});

test("renderPack: one entry per section, with blocks the paginator can move", () => {
  const out = render.renderPack(model(), OPTS);
  assert.deepEqual(out.sections.map((s) => s.id), ["summary", "route", "crew", "menus"]);
  assert.deepEqual(out.sections.map((s) => s.title), ["Charter Summary", "Route &amp; Itinerary", "Crew &amp; Yacht", "Menus &amp; Drinks"]);
  const route = out.sections[1];
  assert.match(route.blocks[0], /data-pack-map/);
  assert.match(route.blocks[0], /<li>1–2 · Cebu Yacht Club<\/li>/);
  assert.equal(route.blocks.length, 1 + 11, "the map block, then one block per day");
  assert.match(route.blocks[2], /Day 2/);
  assert.match(route.blocks[2], /Mon 2 Nov/);
  out.sections.forEach((s) => s.blocks.forEach((b) => assert.match(b, /^<div class="pack-block/)));
});

test("pageHtml: inner pages carry the branding layers and the footer", () => {
  const html = render.pageHtml({ head: render.sectionHead("Menus &amp; Drinks", false), blocks: ["<div class=\"pack-block\">x</div>"], footer: "Charter Proposal · A &amp; B", subjectToChange: true, pageNo: 3, total: 7 });
  assert.match(html, /^<section class="pack-page pack-page--inner">/);
  assert.match(html, /<svg class="pack-wm"/);
  assert.match(html, />IOLANTHE<\/text>/);
  assert.match(html, /class="pack-lineart"/);
  assert.match(html, /Charter Proposal · A &amp; B/);
  assert.match(html, /Proposal — subject to change/);
  assert.match(html, />3 \/ 7</);
  assert.doesNotMatch(render.pageHtml({ head: "", blocks: [], footer: "Charter Brief", subjectToChange: false, pageNo: 2, total: 2 }), /subject to change/);
});

test("sectionHead: a continued page says so", () => {
  assert.match(render.sectionHead("Route &amp; Itinerary", false), /<h2>Route &amp; Itinerary<\/h2>/);
  assert.match(render.sectionHead("Route &amp; Itinerary", true), /<h2>Route &amp; Itinerary <span>continued<\/span><\/h2>/);
});

test("coverPageHtml wraps the cover", () => {
  assert.equal(render.coverPageHtml("<div>c</div>"), '<section class="pack-page pack-page--cover"><div>c</div></section>');
});
```

- [ ] **Step 2: Run it and watch it fail.** `node --test test/pack-render.test.js` → `Cannot find module '../pack-render.js'`.

- [ ] **Step 3: Write the module.** Create `pack-render.js`:

```js
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.IolanthePackRender = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // HTML for the charter pack (spec P §2): the cover, then each section as a heading and a list of blocks that
  // charter-pack.js lays out onto A4 pages. Takes the plain model from pack-core.js and uses no admin globals or DOM,
  // so phase 2 (the zenvue.app mini-site) can run it away from the boat.

  const esc = (value) => String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const lines = (value) => esc(value).replace(/\r?\n/g, "<br>");
  const block = (cls, inner) => `<div class="pack-block ${cls}">${inner}</div>`;
  // One <p> per line, so a long text can continue on the next page (charter-pack.js splits blocks by paragraph).
  const paragraphs = (value) => String(value || "").split(/\r?\n+/).map((t) => t.trim()).filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join("");

  // Behind every inner page: IOLANTHE up the left edge, full height, and the vessel line art lower right (P-D8).
  const BRANDING = '<svg class="pack-wm" viewBox="0 0 210 297" preserveAspectRatio="none" aria-hidden="true">'
    + '<text transform="rotate(-90)" x="-291" y="35" textLength="285" lengthAdjust="spacing">IOLANTHE</text></svg>'
    + '<div class="pack-lineart" aria-hidden="true"></div>';

  function coverHtml(model, opts) {
    const stats = model.stats.map((s) => `<div><b>${esc(s.value)}</b>${esc(s.label)}</div>`).join("");
    const preparedFor = model.preparedFor || model.coverNote
      ? `<div class="pack-for">${model.preparedFor ? `<span class="pack-for-label">Prepared for</span><span class="pack-for-name">${esc(model.preparedFor)}</span>` : ""}`
        + `${model.coverNote ? `<p class="pack-note">${lines(model.coverNote)}</p>` : ""}</div>`
      : "<div></div>";
    return `<div class="pack-cover">`
      + `<img class="pack-cover-photo" src="${esc(opts.coverUrl)}" alt="">`
      + `<div class="pack-cover-text">`
      + `<div class="pack-kicker">${esc(model.kicker)}</div>`
      + `<div class="pack-ornament" aria-hidden="true">✦</div>`
      + `<h1 class="pack-title">${esc(model.vesselName)}</h1>`
      + `<div class="pack-rule"></div>`
      + (model.routeSummary ? `<p class="pack-route">${esc(model.routeSummary)}</p>` : "")
      + (model.dates ? `<p class="pack-dates">${esc(model.dates)}</p>` : "")
      + `<div class="pack-stats">${stats}</div>`
      + `<div class="pack-cover-foot">${preparedFor}<img class="pack-stamp" src="${esc(opts.stampUrl)}" alt="Princess Iolanthe stamp"></div>`
      + `</div></div>`;
  }

  function summaryBlocks(section) {
    const facts = section.rows.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join("");
    return [
      block("pack-facts-block", `<dl class="pack-facts">${facts}</dl>`),
      ...(section.welcome ? [block("pack-welcome", paragraphs(section.welcome))] : [])
    ];
  }

  function routeBlocks(section) {
    const key = section.key.map((k) => `<li>${esc(k)}</li>`).join("");
    const map = block("pack-map-block", `<div class="pack-map" data-pack-map></div><ol class="pack-key">${key}</ol>`);
    const days = section.days.map((d) => {
      const stops = d.stops.map((s) => {
        const items = s.activities.map((a) => `<li><b>${esc(a.title)}</b>${a.notes ? ` <span>${esc(a.notes)}</span>` : ""}</li>`).join("");
        return `<div class="pack-stop"><div class="pack-stop-name">${esc(s.name)}${s.times ? ` <span class="pack-times">${esc(s.times)}</span>` : ""}</div>`
          + (items ? `<ul>${items}</ul>` : "") + "</div>";
      }).join("");
      return block("pack-day", `<div class="pack-day-head"><b>Day ${d.day}</b><span>${esc(d.date)}</span></div>${stops}`);
    });
    return [map, ...days];
  }

  function crewBlocks(section) {
    const out = [];
    if (section.description) out.push(block("pack-welcome", paragraphs(section.description)));
    if (section.details.length) {
      out.push(block("pack-specs-block", `<h3>The yacht</h3><dl class="pack-specs">${section.details.map((d) => `<dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd>`).join("")}</dl>`));
    }
    section.groups.forEach((g) => {
      out.push(block("pack-crew-group", `<h3>${esc(g.title)}</h3><ul>${g.members.map((m) => `<li><b>${esc(m.name)}</b>${m.position ? ` <span>${esc(m.position)}</span>` : ""}</li>`).join("")}</ul>`));
    });
    section.notes.forEach((n) => {
      out.push(block("pack-notes", `<h3>${esc(n.title)}</h3><ul>${n.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`));
    });
    return out;
  }

  function dishList(items) {
    return `<ul>${items.map((i) => `<li><b>${esc(i.name)}</b>${i.description ? ` <span>${esc(i.description)}</span>` : ""}</li>`).join("")}</ul>`;
  }

  function menuBlocks(section) {
    const menus = section.menus.map((m) => block("pack-menu-day",
      `<div class="pack-day-head"><b>${esc(m.label)}</b>${m.notes ? `<span>${esc(m.notes)}</span>` : ""}</div>`
      + m.courses.map((c) => `<div class="pack-course"><h4>${esc(c.title)}</h4>${dishList(c.items)}</div>`).join("")));
    const drinks = section.drinks.map((d, i) => block("pack-drinks",
      `${i === 0 ? '<h3 class="pack-subhead">Your drinks</h3>' : ""}<div class="pack-course"><h4>${esc(d.title)}</h4>${dishList(d.items)}</div>`));
    return [...menus, ...drinks];
  }

  const BUILDERS = { summary: summaryBlocks, route: routeBlocks, crew: crewBlocks, menus: menuBlocks };

  // -> { cover: html, sections: [{ id, title (HTML-escaped), blocks: [html] }] }
  function renderPack(model, opts) {
    return {
      cover: coverHtml(model, opts || {}),
      sections: model.sections.map((s) => ({ id: s.id, title: esc(s.title), blocks: BUILDERS[s.id](s) }))
    };
  }

  function sectionHead(title, continued) {
    return `<header class="pack-section-head"><h2>${title}${continued ? " <span>continued</span>" : ""}</h2></header>`;
  }

  // footer and head are HTML (escape text with esc first). charter-pack.js lays pages out before it knows the total and
  // rewrites [data-page-no] afterwards.
  function pageHtml({ head, blocks, footer, subjectToChange, pageNo, total }) {
    return `<section class="pack-page pack-page--inner">${BRANDING}`
      + `<div class="pack-body">${head}<div class="pack-flow">${blocks.join("")}</div></div>`
      + `<footer class="pack-foot"><span>${footer}</span>${subjectToChange ? "<span>Proposal — subject to change</span>" : ""}<span data-page-no>${pageNo} / ${total}</span></footer>`
      + `</section>`;
  }

  function coverPageHtml(cover) {
    return `<section class="pack-page pack-page--cover">${cover}</section>`;
  }

  return { esc, renderPack, sectionHead, pageHtml, coverPageHtml };
});
```

- [ ] **Step 4: Run the tests.** `node --test test/pack-render.test.js` → `ℹ pass 8`. `node --test` → `ℹ pass 169`.

- [ ] **Step 5: Commit.**

```bash
git add pack-render.js test/pack-render.test.js
git commit -m "feat(pack): pack-render.js, the charter pack HTML"
```
