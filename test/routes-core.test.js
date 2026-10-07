"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../routes-core.js");

const P = (latitude, longitude, extra) => ({ latitude, longitude, ...(extra || {}) });

test("distNm: one minute of latitude is about 1 nm", () => {
  assert.ok(Math.abs(core.distNm(P(12, 120), P(12 + 1 / 60, 120)) - 1) < 0.01);
});

test("routeNm sums the legs and is 0 for fewer than 2 points", () => {
  const a = P(12, 120), b = P(12 + 1 / 60, 120), c = P(12 + 2 / 60, 120);
  assert.ok(Math.abs(core.routeNm([a, b, c]) - 2) < 0.02);
  assert.equal(core.routeNm([a]), 0);
  assert.equal(core.routeNm([]), 0);
});

test("fmtHm formats hours as h:mm", () => {
  assert.equal(core.fmtHm(0.8375), "0:50");
  assert.equal(core.fmtHm(6.3), "6:18");
  assert.equal(core.fmtHm(1.999), "2:00");
});

test("array helpers return new arrays", () => {
  const arr = [1, 2, 3];
  assert.deepEqual(core.replaceAt(arr, 1, 9), [1, 9, 3]);
  assert.deepEqual(core.insertAt(arr, 1, 9), [1, 9, 2, 3]);
  assert.deepEqual(core.removeAt(arr, 1), [1, 3]);
  assert.deepEqual(arr, [1, 2, 3]);
});

test("stopLegs runs stop to stop, with Start/End for non-stop ends", () => {
  const pts = [P(12, 120), P(12.01, 120), P(12.02, 120, { anchorage_id: "a", name: "Alpha" }), P(12.03, 120), P(12.04, 120)];
  const legs = core.stopLegs(pts, 8);
  assert.deepEqual(legs.map((l) => [l.from, l.to, l.fromIndex, l.toIndex]), [["Start", "Alpha", 0, 2], ["Alpha", "End", 2, 4]]);
  assert.ok(Math.abs(legs[0].nm - core.routeNm(pts.slice(0, 3))) < 1e-9);
  assert.equal(legs[0].speed, 8);
  assert.equal(legs[0].own, 0);
  assert.ok(Math.abs(legs[0].hours - legs[0].nm / 8) < 1e-9);
});

test("stopLegs uses the leg's own speed from its start point", () => {
  const pts = [P(12, 120, { anchorage_id: "a", name: "A", leg_speed_kn: 6 }), P(12.1, 120, { anchorage_id: "b", name: "B" })];
  const [leg] = core.stopLegs(pts, 8);
  assert.equal(leg.own, 6);
  assert.equal(leg.speed, 6);
});

test("stopLegs gives null hours when there is no speed, and [] for under 2 points", () => {
  const legs = core.stopLegs([P(12, 120), P(12.1, 120)], 0);
  assert.equal(legs[0].hours, null);
  assert.equal(core.totalHours(legs), null);
  assert.deepEqual(core.stopLegs([P(12, 120)], 8), []);
});

test("totalHours adds the per-leg hours", () => {
  assert.equal(core.totalHours([{ hours: 1 }, { hours: 2.5 }]), 3.5);
  assert.equal(core.totalHours([]), null);
});

test("setLegSpeed sets and clears leg_speed_kn without mutating", () => {
  const pts = [P(12, 120), P(12.1, 120)];
  const set = core.setLegSpeed(pts, 0, 6);
  assert.equal(set[0].leg_speed_kn, 6);
  assert.equal(pts[0].leg_speed_kn, undefined);
  const cleared = core.setLegSpeed(set, 0, 0);
  assert.equal("leg_speed_kn" in cleared[0], false);
});

test("joinPoints appends, prepends and reverses", () => {
  const a = [P(1, 1), P(2, 2)];
  const b = [P(5, 5), P(6, 6)];
  assert.deepEqual(core.joinPoints(a, b, {}), [P(1, 1), P(2, 2), P(5, 5), P(6, 6)]);
  assert.deepEqual(core.joinPoints(a, b, { atStart: true }), [P(5, 5), P(6, 6), P(1, 1), P(2, 2)]);
  assert.deepEqual(core.joinPoints(a, b, { reverse: true }), [P(1, 1), P(2, 2), P(6, 6), P(5, 5)]);
});

test("joinPoints drops the duplicate where the routes meet", () => {
  const a = [P(1, 1), P(2, 2, { anchorage_id: "x" })];
  const sameStop = [P(2.3, 2.3, { anchorage_id: "x" }), P(3, 3)];
  assert.equal(core.joinPoints(a, sameStop, {}).length, 3);
  const sameSpot = [P(2.0001, 2.0001), P(3, 3)];
  assert.equal(core.joinPoints(a, sameSpot, {}).length, 3);
  assert.deepEqual(core.joinPoints([], sameSpot, {}), sameSpot);
});

test("joinGapNm measures the straight leg the join creates", () => {
  const a = [P(1, 1), P(2, 2)];
  const b = [P(2, 2.5), P(3, 3)];
  assert.ok(Math.abs(core.joinGapNm(a, b, {}) - core.distNm(P(2, 2), P(2, 2.5))) < 1e-9);
  assert.equal(core.joinGapNm([], b, {}), 0);
});

test("routeSnapshot covers only the editable fields", () => {
  const r = { id: "x", revision: 3, name: "A", description: "", speed_kn: 8, points: [P(1, 1)], updated_at: "t" };
  assert.equal(core.routeSnapshot(r), core.routeSnapshot({ ...r, revision: 4, updated_at: "u" }));
  assert.notEqual(core.routeSnapshot(r), core.routeSnapshot({ ...r, name: "B" }));
});

test("routeSnapshot ignores point key order, undefined values and null speed", () => {
  const a = { name: "A", description: "", speed_kn: undefined, points: [{ latitude: 1, longitude: 2, name: "X", anchorage_id: undefined }] };
  const b = { name: "A", description: "", speed_kn: null, points: [{ name: "X", longitude: 2, latitude: 1 }] };
  assert.equal(core.routeSnapshot(a), core.routeSnapshot(b));
});

const SITES = [
  { id: "near", title: "Near", latitude: 12.01, longitude: 120 },   // ~0.6 nm from A
  { id: "far", title: "Far", latitude: 12.2, longitude: 120 }        // ~12 nm
];
const ANCH = { id: "a", name: "Alpha", latitude: 12, longitude: 120 };
const ANCH_B = { id: "b", name: "Bravo", latitude: 12.02, longitude: 120 };

test("sitesWithin returns ids within the range", () => {
  assert.deepEqual(core.sitesWithin(SITES, P(12, 120), 2), ["near"]);
});

test("nearbyAnchorages sorts by distance and respects the range", () => {
  const out = core.nearbyAnchorages([ANCH_B, ANCH], P(12.001, 120), 2);
  assert.deepEqual(out.map((x) => x.anchorage.id), ["a", "b"]);
  assert.ok(out[0].nm < out[1].nm);
  assert.deepEqual(core.nearbyAnchorages([ANCH], P(13, 120), 2), []);
});

test("stopAt builds a stop on the anchorage and auto-links sites within 2 nm", () => {
  assert.deepEqual(core.stopAt(ANCH, SITES), { latitude: 12, longitude: 120, anchorage_id: "a", name: "Alpha", site_ids: ["near"] });
});

test("makeStopAt replaces the point with a stop", () => {
  const pts = [P(11.9, 120), P(12.001, 120.001), P(12.1, 120)];
  const { points, merged } = core.makeStopAt(pts, 1, ANCH, SITES);
  assert.equal(merged, false);
  assert.equal(points[1].anchorage_id, "a");
  assert.equal(points.length, 3);
});

test("makeStopAt merges into an identical neighbouring stop (spec Q3)", () => {
  const prevStop = { ...P(12, 120), anchorage_id: "a", name: "Alpha" };
  const before = [P(11.9, 120), prevStop, P(12.001, 120.001), P(12.1, 120)];
  const r1 = core.makeStopAt(before, 2, ANCH, SITES);
  assert.equal(r1.merged, true);
  assert.deepEqual(r1.points, [before[0], prevStop, before[3]]);
  const after = [P(11.9, 120), P(12.001, 120.001), prevStop];
  const r2 = core.makeStopAt(after, 1, ANCH, SITES);
  assert.equal(r2.merged, true);
  assert.deepEqual(r2.points, [after[0], prevStop]);
});

test("makeStopAt does not merge with a stop at a different anchorage", () => {
  const otherStop = { ...P(12.02, 120), anchorage_id: "b", name: "Bravo" };
  const { merged, points } = core.makeStopAt([otherStop, P(12.001, 120)], 1, ANCH, SITES);
  assert.equal(merged, false);
  assert.equal(points.length, 2);
});

test("appendStop adds a stop at the end, or merges when the last point is the same anchorage", () => {
  const r1 = core.appendStop([P(11.9, 120)], ANCH, SITES);
  assert.equal(r1.merged, false);
  assert.equal(r1.points.length, 2);
  const r2 = core.appendStop(r1.points, ANCH, SITES);
  assert.equal(r2.merged, true);
  assert.equal(r2.points.length, 2);
});

test("anchorageMovedM is 0 within 50 m and the distance beyond", () => {
  const stop = { ...P(12, 120), anchorage_id: "a" };
  assert.equal(core.anchorageMovedM(stop, { ...ANCH, latitude: 12.0002 }), 0);
  assert.ok(core.anchorageMovedM(stop, { ...ANCH, latitude: 12.005 }) > 500);
  assert.equal(core.anchorageMovedM(P(12, 120), ANCH), 0);
  assert.equal(core.anchorageMovedM(stop, null), 0);
});

test("routesUsingAnchorage lists the routes with a stop there", () => {
  const routes = [
    { id: "r1", name: "One", points: [{ ...P(1, 1), anchorage_id: "a" }] },
    { id: "r2", name: "Two", points: [P(1, 1)] }
  ];
  assert.deepEqual(core.routesUsingAnchorage(routes, "a").map((r) => r.id), ["r1"]);
});

const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === "object") deepFreeze(v); }); return Object.freeze(o); };

test("makeStopAt keeps the replaced point's leg speed and drops its other fields", () => {
  const pts = [P(11.9, 120), P(12.001, 120.001, { leg_speed_kn: 6, site_id: "x", name: "Old", site_ids: ["z"] }), P(12.1, 120)];
  const { points, merged } = core.makeStopAt(pts, 1, ANCH, SITES);
  assert.equal(merged, false);
  assert.equal(points[1].leg_speed_kn, 6);
  assert.equal(points[1].name, "Alpha");
  assert.deepEqual(points[1].site_ids, ["near"]);
  assert.equal(points[1].site_id, undefined);
});

test("makeStopAt works at the first and last index", () => {
  const pts = [P(12.001, 120), P(12.1, 120), P(12.001, 120.001)];
  const first = core.makeStopAt(pts, 0, ANCH, SITES);
  assert.equal(first.merged, false);
  assert.equal(first.points[0].anchorage_id, "a");
  assert.equal(first.points.length, 3);
  const last = core.makeStopAt(pts, 2, ANCH, SITES);
  assert.equal(last.merged, false);
  assert.equal(last.points[2].anchorage_id, "a");
  assert.equal(last.points.length, 3);
});

test("makeStopAt does not merge when only the next neighbour is a stop at a different anchorage", () => {
  const next = { ...P(12.02, 120), anchorage_id: "b", name: "Bravo" };
  const { merged, points } = core.makeStopAt([P(11.9, 120), P(12.001, 120), next], 1, ANCH, SITES);
  assert.equal(merged, false);
  assert.equal(points.length, 3);
  assert.equal(points[1].anchorage_id, "a");
});

test("makeStopAt removes the point once when both neighbours are stops at the same anchorage", () => {
  const stop = { ...P(12, 120), anchorage_id: "a", name: "Alpha" };
  const { merged, points } = core.makeStopAt([stop, P(12.001, 120), stop], 1, ANCH, SITES);
  assert.equal(merged, true);
  assert.deepEqual(points, [stop, stop]);
});

test("makeStopAt and appendStop do not mutate their inputs", () => {
  const stop = { ...P(12, 120), anchorage_id: "a", name: "Alpha" };
  const pts = deepFreeze([P(11.9, 120), P(12.001, 120, { leg_speed_kn: 5 }), P(12.1, 120)]);
  assert.doesNotThrow(() => core.makeStopAt(pts, 1, ANCH, SITES));
  const merging = deepFreeze([stop, P(12.001, 120)]);
  assert.doesNotThrow(() => core.makeStopAt(merging, 1, ANCH, SITES));
  assert.doesNotThrow(() => core.appendStop(pts, ANCH, SITES));
});


// ---------- import / export (phase 3) ----------

// A tiny stand-in for a DOM element with just what extractGeo uses: localName, children,
// getElementsByTagName("*") (all descendants), getAttribute and textContent. String arguments are text.
function E(localName, attrs, ...kids) {
  const children = kids.filter((k) => typeof k === "object");
  const text = kids.filter((k) => typeof k === "string").join("");
  return {
    localName,
    children,
    getAttribute: (name) => (attrs && Object.prototype.hasOwnProperty.call(attrs, name) ? String(attrs[name]) : null),
    getElementsByTagName: () => children.flatMap((c) => [c, ...c.getElementsByTagName("*")]),
    get textContent() { return text + children.map((c) => c.textContent).join(""); }
  };
}

// A dense, slightly wobbly track like a Google Earth or Navionics export (211 points), as in the mockup's sampleKml.
function denseTrack() {
  const ctrl = [[11.9975, 120.201], [12.006, 120.16], [12.03, 120.1], [12.0036, 120.0413], [12.0144, 119.9532], [12.079, 119.9018], [12.1364, 119.865], [12.195, 119.845]];
  const out = [];
  ctrl.slice(1).forEach(([la, lo], k) => {
    const [pa, po] = ctrl[k];
    for (let s = 0; s < 30; s += 1) {
      const t = s / 30;
      out.push(P(pa + (la - pa) * t + Math.sin(out.length * 1.7) * 0.00015, po + (lo - po) * t + Math.cos(out.length * 1.3) * 0.00015));
    }
  });
  out.push(P(12.195, 119.845));
  return out;
}

test("parseKmlCoordinates reads lon,lat[,alt] tuples and drops invalid ones", () => {
  assert.deepEqual(core.parseKmlCoordinates(" 120.1,12.0,0\n\t120.2,12.1 "), [P(12, 120.1), P(12.1, 120.2)]);
  assert.deepEqual(core.parseKmlCoordinates("abc,def 200,10 120.1 120.3,12.3"), [P(12.3, 120.3)]);
  assert.deepEqual(core.parseKmlCoordinates(""), []);
  assert.deepEqual(core.parseKmlCoordinates(undefined), []);
});

test("htmlToText keeps the text of a KML HTML description, one line per break or block", () => {
  assert.equal(core.htmlToText("<p>Good <b>holding</b></p><br/>Depth &amp; 12 m&#33; &unknown;"), "Good holding\nDepth & 12 m! &unknown;");
  assert.equal(core.htmlToText(""), "");
});

test("extractGeo reads KML lines and pins, with names, and drops invalid coordinates", () => {
  const root = E("kml", {}, E("Document", {}, E("name", {}, "West Busuanga"),
    E("Placemark", {}, E("name", {}, "Track"), E("LineString", {}, E("coordinates", {}, "120.1,12.0,0 bad 120.2,12.1,0 120.3,12.2,0"))),
    E("Placemark", {}, E("name", {}, "Spur"), E("MultiGeometry", {}, E("LineString", {}, E("coordinates", {}, "120.4,12.0 120.5,12.0")))),
    E("Placemark", {}, E("name", {}, "Too short"), E("LineString", {}, E("coordinates", {}, "120.1,12.0 999,12"))),
    E("Placemark", {}, E("name", {}, "Quiet bay"), E("description", {}, "<p>Sand &amp; mud</p>"), E("Point", {}, E("coordinates", {}, "119.906,12.129,0"))),
    E("Placemark", {}, E("Point", {}, E("coordinates", {}, "119.9,12.1"))),
    E("Placemark", {}, E("name", {}, "Off the map"), E("Point", {}, E("coordinates", {}, "119.9,95")))));
  const geo = core.extractGeo(root, "west.kml");
  assert.equal(geo.type, "kml");
  assert.equal(geo.name, "West Busuanga");
  assert.deepEqual(geo.lines.map((l) => [l.name, l.points.length]), [["Track", 3], ["Spur", 2]]);
  assert.deepEqual(geo.pins, [
    { name: "Quiet bay", description: "Sand & mud", latitude: 12.129, longitude: 119.906 },
    { name: "Placemark 5", description: "", latitude: 12.1, longitude: 119.9 }
  ]);
});

test("extractGeo reads GPX routes, tracks (all segments) and waypoints", () => {
  const pt = (tag, lat, lon, ...kids) => E(tag, { lat, lon }, ...kids);
  const root = E("gpx", { version: "1.1" },
    E("metadata", {}, E("name", {}, "Plotter export")),
    pt("wpt", 12.1, 120.1, E("name", {}, "Reef"), E("desc", {}, "Shallow")),
    pt("wpt", "x", 120.1, E("name", {}, "Broken")),
    E("rte", {}, pt("rtept", 12.0, 120.0, E("name", {}, "Not the route name")), pt("rtept", 12.1, 120.1)),
    E("trk", {}, E("name", {}, "Day 1"), E("trkseg", {}, pt("trkpt", 12.0, 120.0), pt("trkpt", 12.01, 120.0)),
      E("trkseg", {}, pt("trkpt", 12.02, 120.0))));
  const geo = core.extractGeo(root, "export.gpx");
  assert.equal(geo.type, "gpx");
  assert.equal(geo.name, "Plotter export");
  assert.deepEqual(geo.lines.map((l) => [l.name, l.points.length]), [["Route 1", 2], ["Day 1", 3]]);
  assert.deepEqual(geo.pins, [{ name: "Reef", description: "Shallow", latitude: 12.1, longitude: 120.1 }]);
});

test("extractGeo falls back to the file extension when the root is neither kml nor gpx", () => {
  assert.equal(core.extractGeo(E("html", {}), "track.gpx").type, "gpx");
  assert.deepEqual(core.extractGeo(E("html", {}), "track.kml"), { type: "kml", name: "", lines: [], pins: [] });
});

test("simplify drops points within the tolerance and keeps the ends", () => {
  const straight = Array.from({ length: 11 }, (_, i) => P(12 + i * 0.001, 120));
  assert.deepEqual(core.simplify(straight, 1), [straight[0], straight[10]]);
  const zero = core.simplify(straight, 0);
  assert.equal(zero.length, 11);
  assert.notEqual(zero, straight);
  const peak = [P(12, 120), P(12.005, 120.0046), P(12.01, 120)]; // the middle point is about 500 m off the line
  assert.equal(core.simplify(peak, 100).length, 3);
  assert.equal(core.simplify(peak, 1000).length, 2);
  assert.deepEqual(core.simplify([P(1, 1), P(2, 2)], 50), [P(1, 1), P(2, 2)]);
  assert.equal(straight.length, 11);
});

test("defaultTolerance is the smallest 5 m step that keeps a line to 60 points or fewer", () => {
  const track = denseTrack();
  assert.equal(track.length, 211);
  const t = core.defaultTolerance(track);
  assert.ok(t > 0 && t <= core.MAX_TOLERANCE_M && t % core.TOLERANCE_STEP_M === 0);
  assert.ok(core.simplify(track, t).length <= core.IMPORT_TARGET_POINTS);
  assert.ok(core.simplify(track, t - core.TOLERANCE_STEP_M).length > core.IMPORT_TARGET_POINTS);
  assert.equal(core.defaultTolerance(track.slice(0, 40)), 0);
  const zigzag = Array.from({ length: 100 }, (_, i) => P(12 + i * 0.01, 120 + (i % 2) * 0.05)); // ~5 km swings
  assert.equal(core.defaultTolerance(zigzag), core.MAX_TOLERANCE_M);
});

test("defaultTolerance matches a linear scan of the 5 m steps", () => {
  const linear = (pts) => {
    for (let t = 0; t <= core.MAX_TOLERANCE_M; t += core.TOLERANCE_STEP_M) if (core.simplify(pts, t).length <= core.IMPORT_TARGET_POINTS) return t;
    return core.MAX_TOLERANCE_M;
  };
  const wobble = (n, amp) => Array.from({ length: n }, (_, i) => P(12 + i * 0.0005 + Math.sin(i * 1.7) * amp, 120 + i * 0.0004 + Math.cos(i * 1.3) * amp));
  [denseTrack(), wobble(300, 0.0002), wobble(500, 0.0006), wobble(1000, 0.001), wobble(61, 0.0003)].forEach((pts) => {
    assert.equal(core.defaultTolerance(pts), linear(pts));
  });
});

test("joinLines joins in file order and drops the duplicate where lines meet", () => {
  const a = { points: [P(12, 120), P(12.1, 120)] };
  const b = { points: [P(12.1, 120.0001), P(12.2, 120)] }; // starts ~11 m from a's end
  const c = { points: [P(13, 121), P(13.1, 121)] };
  assert.equal(core.joinLines([a, b]).length, 3);
  assert.equal(core.joinLines([a, c]).length, 4);
  assert.deepEqual(core.joinLines([]), []);
});

test("chosenLinePoints picks one line or joins them all", () => {
  const lines = [{ points: [P(1, 1), P(1, 2)] }, { points: [P(5, 5), P(5, 6)] }];
  assert.deepEqual(core.chosenLinePoints(lines, { line: 1 }), [P(5, 5), P(5, 6)]);
  assert.equal(core.chosenLinePoints(lines, { join: true }).length, 4);
  assert.deepEqual(core.chosenLinePoints(lines, { line: 7 }), []);
  assert.deepEqual(core.chosenLinePoints([], { line: 0 }), []);
});

test("importPoints replaces or appends plain positions without mutating", () => {
  const current = [P(12, 120, { name: "Start" }), P(12.1, 120)];
  const incoming = [P(12.1, 120.0001, { name: "x", ele: 3 }), P(12.2, 120)];
  assert.deepEqual(core.importPoints(current, incoming, "replace"), [P(12.1, 120.0001), P(12.2, 120)]);
  const appended = core.importPoints(current, incoming, "append");
  assert.deepEqual(appended, [current[0], current[1], P(12.2, 120)]);
  assert.equal(current.length, 2);
});

test("pinMatch flags the same name first, then the nearest site or anchorage within 2 nm", () => {
  const sites = [{ id: "s1", title: "Twin Lagoon", latitude: 12.0, longitude: 120.0 }, { id: "s2", title: "Far reef", latitude: 12.5, longitude: 120.0 }];
  const anchorages = [{ id: "a1", name: "Coron Town", latitude: 12.01, longitude: 120.0 }];
  const near = core.pinMatch({ name: "Somewhere", latitude: 12.011, longitude: 120 }, sites, anchorages);
  assert.equal(near.kind, "anchorage");
  assert.equal(near.name, "Coron Town");
  assert.ok(near.nm < 0.1);
  const named = core.pinMatch({ name: "  far REEF ", latitude: 12.011, longitude: 120 }, sites, anchorages);
  assert.deepEqual([named.kind, named.name, named.sameName], ["site", "Far reef", true]);
  assert.equal(core.pinMatch({ name: "Lonely", latitude: 14, longitude: 121 }, sites, anchorages), null);
  const noPos = core.pinMatch({ name: "Hidden", latitude: 14, longitude: 121 }, [{ id: "h", title: "Hidden", latitude: "", longitude: "" }], []);
  assert.equal(noPos.nm, Infinity);
});

test("xmlEscape escapes the five XML characters", () => {
  assert.equal(core.xmlEscape(`A & B <"x"> 'y'`), "A &amp; B &lt;&quot;x&quot;&gt; &apos;y&apos;");
  assert.equal(core.xmlEscape(undefined), "");
});

const EXPORT_ROUTE = {
  id: "coron-loop",
  name: "Coron & Culion",
  points: [
    P(11.9975, 120.201, { anchorage_id: "coron-town", name: "Coron <Town>" }),
    P(12.004, 120.165),
    P(12.018, 120.125, { name: "Siete Pecados" }),
    P(12.036, 120.096, { anchorage_id: "lusong" })
  ]
};

test("toGpx writes GPX 1.1: stops as wpt, every point as rtept, names escaped", () => {
  const gpx = core.toGpx(EXPORT_ROUTE);
  assert.ok(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Iolanthe Admin" xmlns="http://www.topografix.com/GPX/1/1">'));
  assert.equal((gpx.match(/<wpt /g) || []).length, 2);
  assert.equal((gpx.match(/<rtept /g) || []).length, 4);
  assert.ok(gpx.includes("<metadata><name>Coron &amp; Culion</name></metadata>"));
  assert.ok(gpx.includes('<wpt lat="11.997500" lon="120.201000"><name>Coron &lt;Town&gt;</name></wpt>'));
  assert.ok(gpx.includes('<rtept lat="12.004000" lon="120.165000"></rtept>'));
  assert.ok(gpx.includes('<rtept lat="12.018000" lon="120.125000"><name>Siete Pecados</name></rtept>'));
  assert.ok(gpx.includes('<rtept lat="12.036000" lon="120.096000"><name>Stop</name></rtept>'));
  assert.ok(gpx.trimEnd().endsWith("</gpx>"));
});

test("toKml writes one LineString (lon,lat order) and a Point placemark per stop", () => {
  const kml = core.toKml(EXPORT_ROUTE);
  assert.ok(kml.includes('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Coron &amp; Culion</name>'));
  assert.ok(kml.includes("<LineString><coordinates>120.201000,11.997500,0 120.165000,12.004000,0 120.125000,12.018000,0 120.096000,12.036000,0</coordinates></LineString>"));
  assert.equal((kml.match(/<Point>/g) || []).length, 2);
  assert.ok(kml.includes("<Placemark><name>Coron &lt;Town&gt;</name><Point><coordinates>120.201000,11.997500,0</coordinates></Point></Placemark>"));
  assert.ok(kml.trimEnd().endsWith("</Document></kml>"));
});

test("exportBaseName uses the route id, else a slug of the name, else 'route'", () => {
  assert.equal(core.exportBaseName(EXPORT_ROUTE), "coron-loop");
  assert.equal(core.exportBaseName({ id: "", name: "Coron loop (copy)" }), "coron-loop-copy");
  assert.equal(core.exportBaseName({ id: "", name: "" }), "route");
});

test("slugify strips combining accents", () => {
  assert.equal(core.slugify("Cr\u00e8me Br\u00fbl\u00e9e to Hydra"), "creme-brulee-to-hydra");
});

test("htmlToText strips tags that only appear after decoding entities", () => {
  assert.ok(!core.htmlToText("&lt;/textarea&gt;&lt;img src=x onerror=alert(1)&gt;").includes("<"));
  assert.equal(core.htmlToText("Depth &lt;b&gt;12&lt;/b&gt; m"), "Depth 12 m");
});

test("parseKmlCoordinates tolerates spaces after the commas", () => {
  assert.deepEqual(core.parseKmlCoordinates("120.1, 12.1, 0 120.2, 12.2, 0"), [P(12.1, 120.1), P(12.2, 120.2)]);
});

test("xmlEscape strips control characters that XML 1.0 forbids but keeps tab, LF and CR", () => {
  assert.equal(core.xmlEscape("A\u0008B\u000BC\u0000D\uFFFEE"), "ABCDE");
  assert.equal(core.xmlEscape("a\tb\nc\rd"), "a\tb\nc\rd");
  assert.ok(core.toGpx({ id: "x", name: "A\u0008B", points: [P(1, 1), P(2, 2)] }).includes("<name>AB</name>"));
});
