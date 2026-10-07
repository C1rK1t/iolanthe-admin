// Route Planner pure logic, shared by routes.js (browser) and test/routes-core.test.js (node --test).
// No DOM and no Leaflet here.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheRoutesCore = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const METRES_PER_NM = 1852;
  const EARTH_RADIUS_M = 6371000;
  const SAME_SPOT_M = 50; // a join point within this distance of the other route's end counts as the same place

  function distM(a, b) {
    const r = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * r;
    const dLon = (b.longitude - a.longitude) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }

  const distNm = (a, b) => distM(a, b) / METRES_PER_NM;

  function routeNm(points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += distNm(points[i - 1], points[i]);
    }
    return total;
  }

  function fmtHm(hours) {
    const minutes = Math.round(hours * 60);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  }

  const isStop = (point) => Boolean(point && point.anchorage_id);
  const replaceAt = (arr, index, value) => arr.map((item, j) => (j === index ? value : item));
  const insertAt = (arr, index, value) => [...arr.slice(0, index), value, ...arr.slice(index)];
  const removeAt = (arr, index) => arr.filter((_, j) => j !== index);

  // Legs run stop to stop. The first and last points count as ends (Start / End) even when they aren't stops.
  // A leg's own speed is stored on the point it starts from (leg_speed_kn); otherwise it uses routeSpeed.
  function stopLegs(points, routeSpeed) {
    if (points.length < 2) {
      return [];
    }
    const ends = points
      .map((point, index) => ({ point, index }))
      .filter(({ point, index }) => isStop(point) || index === 0 || index === points.length - 1);
    const label = ({ point, index }) => (isStop(point) ? (point.name || "Stop") : (index === 0 ? "Start" : "End"));
    return ends.slice(1).map((to, k) => {
      const from = ends[k];
      const own = from.point.leg_speed_kn || 0;
      const speed = own || routeSpeed || 0;
      const nm = routeNm(points.slice(from.index, to.index + 1));
      return { from: label(from), to: label(to), fromIndex: from.index, toIndex: to.index, nm, own, speed, hours: speed ? nm / speed : null };
    });
  }

  // Total time needs a speed for every leg; otherwise it's unknown.
  function totalHours(legs) {
    if (!legs.length || legs.some((leg) => leg.hours === null)) {
      return null;
    }
    return legs.reduce((sum, leg) => sum + leg.hours, 0);
  }

  function setLegSpeed(points, index, value) {
    const point = points[index];
    if (value) {
      return replaceAt(points, index, { ...point, leg_speed_kn: value });
    }
    const { leg_speed_kn: _removed, ...rest } = point;
    return replaceAt(points, index, rest);
  }

  function orderedForJoin(current, other, opts) {
    const extra = opts && opts.reverse ? [...other].reverse() : other;
    return opts && opts.atStart ? [extra, current] : [current, extra];
  }

  function joinPoints(current, other, opts) {
    const [first, second] = orderedForJoin(current, other, opts);
    if (!first.length || !second.length) {
      return [...first, ...second];
    }
    const a = first[first.length - 1];
    const b = second[0];
    const same = (a.anchorage_id && a.anchorage_id === b.anchorage_id) || distM(a, b) < SAME_SPOT_M;
    return same ? [...first, ...second.slice(1)] : [...first, ...second];
  }

  // Length of the straight leg the join adds between the two routes (0 when either is empty).
  function joinGapNm(current, other, opts) {
    const [first, second] = orderedForJoin(current, other, opts);
    return first.length && second.length ? distNm(first[first.length - 1], second[0]) : 0;
  }

  // What counts as "unsaved changes": the editable fields only.
  function routeSnapshot(route) {
    const keys = ["latitude", "longitude", "name", "anchorage_id", "site_id", "site_ids", "leg_speed_kn"];
    const points = (route.points || []).map((p) => {
      const out = {};
      keys.forEach((k) => { if (p[k] !== undefined) out[k] = p[k]; });
      return out;
    });
    const speed = route.speed_kn === undefined ? null : route.speed_kn;
    return JSON.stringify({ name: route.name, description: route.description, speed_kn: speed, points });
  }

  const AUTO_LINK_NM = 2;    // spec §7 Q4: anchorage stops auto-link sites within 2 nm
  const MOVED_WARN_M = 50;   // a stop more than this from its anchorage shows "moved"

  function sitesWithin(sites, pos, nm) {
    return (sites || []).filter((site) => distNm(pos, site) <= nm).map((site) => site.id);
  }

  function nearbyAnchorages(anchorages, pos, nm) {
    return (anchorages || [])
      .map((anchorage) => ({ anchorage, nm: distNm(pos, anchorage) }))
      .filter((x) => x.nm <= nm)
      .sort((x, y) => x.nm - y.nm);
  }

  function stopAt(anchorage, sites) {
    return {
      latitude: anchorage.latitude,
      longitude: anchorage.longitude,
      anchorage_id: anchorage.id,
      name: anchorage.name,
      site_ids: sitesWithin(sites, anchorage, AUTO_LINK_NM)
    };
  }

  const sameStop = (point, anchorage) => Boolean(point && point.anchorage_id && point.anchorage_id === anchorage.id);

  // Spec §7 Q3: making a point a stop at the anchorage already used by the stop before or after it merges
  // (the point is removed) instead of creating a second stop there.
  function makeStopAt(points, index, anchorage, sites) {
    if (sameStop(points[index - 1], anchorage) || sameStop(points[index + 1], anchorage)) {
      return { points: removeAt(points, index), merged: true };
    }
    const old = points[index];
    const stop = stopAt(anchorage, sites);
    const next = old && old.leg_speed_kn ? { ...stop, leg_speed_kn: old.leg_speed_kn } : stop;
    return { points: replaceAt(points, index, next), merged: false };
  }

  function appendStop(points, anchorage, sites) {
    if (sameStop(points[points.length - 1], anchorage)) {
      return { points, merged: true };
    }
    return { points: [...points, stopAt(anchorage, sites)], merged: false };
  }

  function anchorageMovedM(point, anchorage) {
    if (!point || !point.anchorage_id || !anchorage) {
      return 0;
    }
    const metres = distM(point, anchorage);
    return metres > MOVED_WARN_M ? metres : 0;
  }

  function routesUsingAnchorage(routes, anchorageId) {
    return (routes || []).filter((route) => (route.points || []).some((p) => p.anchorage_id === anchorageId));
  }

  // ---------- import / export (spec §4.2, §4.3) ----------
  const IMPORT_TARGET_POINTS = 60; // the default Simplify tolerance keeps an imported line under about this many points
  const MAX_TOLERANCE_M = 200;
  const TOLERANCE_STEP_M = 5;
  const PIN_MATCH_NM = 2;          // an imported pin is flagged "near X" within this range (the PR #2 rule)

  const validPos = (p) => Boolean(p) && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
    && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

  // KML <coordinates>: whitespace-separated "lon,lat[,alt]" tuples. Invalid tuples are dropped.
  function parseKmlCoordinates(text) {
    return String(text || "").trim().replace(/\s*,\s*/g, ",").split(/\s+/).filter(Boolean)
      .map((tuple) => tuple.split(",").map((part) => (part.trim() === "" ? NaN : Number(part))))
      .map(([longitude, latitude]) => ({ latitude, longitude }))
      .filter(validPos);
  }

  // KML descriptions are often HTML. Keeps the text, one line per <br> or block element.
  const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  function htmlToText(value) {
    return String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, e) => {
        if (e[0] === "#") {
          const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
        }
        const named = ENTITIES[e.toLowerCase()];
        return named === undefined ? match : named;
      })
      .split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
  }

  // Element helpers that match on localName, so default and prefixed namespaces (kml:Placemark) both work.
  const descendants = (node, name) => Array.from(node.getElementsByTagName("*")).filter((n) => n.localName === name);
  const child = (node, name) => (node ? Array.from(node.children || []).find((n) => n.localName === name) || null : null);
  const childText = (node, name) => { const n = child(node, name); return n ? String(n.textContent || "").trim() : ""; };
  const gpxPoint = (n) => ({ latitude: parseFloat(n.getAttribute("lat")), longitude: parseFloat(n.getAttribute("lon")) });

  // Reads a parsed KML or GPX document. root is the documentElement: the browser parses with DOMParser, and the tests
  // pass a tiny fake element. Lines: KML LineString, GPX rte / trk (all segments). Pins: KML Point placemarks, GPX wpt.
  // Invalid coordinates are dropped, and a line needs 2 valid points to count.
  function extractGeo(root, filename) {
    const byName = root.localName === "gpx" ? "gpx" : (root.localName === "kml" ? "kml" : "");
    const type = byName || (/\.gpx$/i.test(filename || "") ? "gpx" : "kml");
    const lines = [];
    const pins = [];
    let name;
    if (type === "gpx") {
      name = childText(child(root, "metadata"), "name");
      descendants(root, "rte").forEach((r, i) => lines.push({ name: childText(r, "name") || `Route ${i + 1}`, points: descendants(r, "rtept").map(gpxPoint) }));
      descendants(root, "trk").forEach((t, i) => lines.push({ name: childText(t, "name") || `Track ${i + 1}`, points: descendants(t, "trkpt").map(gpxPoint) }));
      descendants(root, "wpt").forEach((w, i) => pins.push({ name: childText(w, "name") || `Pin ${i + 1}`, description: childText(w, "desc") || childText(w, "cmt"), ...gpxPoint(w) }));
    } else {
      name = childText(child(root, "Document") || root, "name");
      descendants(root, "Placemark").forEach((pm, i) => {
        const pmName = childText(pm, "name") || `Placemark ${i + 1}`;
        descendants(pm, "LineString").forEach((ls) => lines.push({ name: pmName, points: parseKmlCoordinates(childText(ls, "coordinates")) }));
        descendants(pm, "Point").forEach((pt) => {
          const pos = parseKmlCoordinates(childText(pt, "coordinates"))[0];
          if (pos) pins.push({ name: pmName, description: htmlToText(childText(pm, "description")), ...pos });
        });
      });
    }
    return {
      type,
      name,
      lines: lines.map((l) => ({ ...l, points: l.points.filter(validPos) })).filter((l) => l.points.length >= 2),
      pins: pins.filter(validPos)
    };
  }

  // Douglas-Peucker on a local flat projection, tolerance in metres. Always keeps the first and last points.
  function simplify(points, tolM) {
    if (!(tolM > 0) || points.length < 3) return points.slice();
    const lat0 = points[0].latitude * Math.PI / 180;
    const xy = points.map((p) => [p.longitude * 111320 * Math.cos(lat0), p.latitude * 110540]);
    const segDist = (p, a, b) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    };
    const keep = points.map((_, i) => i === 0 || i === points.length - 1);
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let maxD = 0;
      let idx = -1;
      for (let i = s + 1; i < e; i += 1) {
        const d = segDist(xy[i], xy[s], xy[e]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tolM) { keep[idx] = true; stack.push([s, idx], [idx, e]); }
    }
    return points.filter((_, i) => keep[i]);
  }

  // The smallest tolerance (5 m steps, up to 200 m) that brings the line to IMPORT_TARGET_POINTS points or fewer.
  function defaultTolerance(points) {
    for (let t = 0; t <= MAX_TOLERANCE_M; t += TOLERANCE_STEP_M) {
      if (simplify(points, t).length <= IMPORT_TARGET_POINTS) return t;
    }
    return MAX_TOLERANCE_M;
  }

  // Joins lines in file order. A line that starts within 50 m of where the previous one ended loses that duplicate point.
  const joinLines = (lines) => lines.reduce((acc, line) => joinPoints(acc, line.points), []);

  // pick: { join: true } for all lines in file order, otherwise { line: index }.
  function chosenLinePoints(lines, pick) {
    if (pick && pick.join) return joinLines(lines);
    const line = lines[(pick && pick.line) || 0];
    return line ? line.points : [];
  }

  // Imported points as plain positions: they replace the route's points, or are appended (dropping a duplicate join point).
  function importPoints(current, incoming, mode) {
    const plain = incoming.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    return mode === "append" ? joinPoints(current, plain) : plain;
  }

  // The site or anchorage an imported pin may duplicate: the same name (ignoring case) first, then the nearest within 2 nm.
  function pinMatch(pin, sites, anchorages) {
    const key = (s) => String(s || "").trim().toLowerCase();
    const candidates = [
      ...(sites || []).map((s) => ({ kind: "site", name: s.title || s.id || "Site", pos: s })),
      ...(anchorages || []).map((a) => ({ kind: "anchorage", name: a.name || a.id, pos: a }))
    ].map((x) => ({ kind: x.kind, name: x.name, nm: validPos(x.pos) ? distNm(pin, x.pos) : Infinity, sameName: key(x.name) === key(pin.name) }))
      .filter((x) => x.sameName || x.nm <= PIN_MATCH_NM)
      .sort((x, y) => (y.sameName - x.sameName) || (x.nm - y.nm));
    return candidates[0] || null;
  }

  const XML_INVALID_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g; // not allowed in XML 1.0, even escaped
  const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
  const xmlEscape = (s) => String(s === undefined || s === null ? "" : s).replace(XML_INVALID_CHARS, "").replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
  const fix6 = (n) => Number(n).toFixed(6);

  function slugify(name) {
    return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  const exportBaseName = (route) => route.id || slugify(route.name) || "route";

  // GPX 1.1: stops as <wpt>, then one <rte> with every point. Stops and named points carry <name>.
  function toGpx(route) {
    const title = xmlEscape(route.name || "Route");
    const pts = route.points || [];
    const wpts = pts.filter(isStop).map((p) => `  <wpt lat="${fix6(p.latitude)}" lon="${fix6(p.longitude)}"><name>${xmlEscape(p.name || "Stop")}</name></wpt>`);
    const rtepts = pts.map((p) => {
      const label = p.name || (isStop(p) ? "Stop" : "");
      return `    <rtept lat="${fix6(p.latitude)}" lon="${fix6(p.longitude)}">${label ? `<name>${xmlEscape(label)}</name>` : ""}</rtept>`;
    });
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Iolanthe Admin" xmlns="http://www.topografix.com/GPX/1/1">',
      `  <metadata><name>${title}</name></metadata>`,
      ...wpts,
      "  <rte>",
      `    <name>${title}</name>`,
      ...rtepts,
      "  </rte>",
      "</gpx>",
      ""
    ].join("\n");
  }

  // KML: one LineString placemark plus a Point placemark per stop. KML coordinates are lon,lat,alt.
  function toKml(route) {
    const title = xmlEscape(route.name || "Route");
    const pts = route.points || [];
    const coord = (p) => `${fix6(p.longitude)},${fix6(p.latitude)},0`;
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${title}</name>`,
      `  <Placemark><name>${title}</name><LineString><coordinates>${pts.map(coord).join(" ")}</coordinates></LineString></Placemark>`,
      ...pts.filter(isStop).map((p) => `  <Placemark><name>${xmlEscape(p.name || "Stop")}</name><Point><coordinates>${coord(p)}</coordinates></Point></Placemark>`),
      "</Document></kml>",
      ""
    ].join("\n");
  }


  return {
    METRES_PER_NM, distM, distNm, routeNm, fmtHm, isStop, replaceAt, insertAt, removeAt,
    stopLegs, totalHours, setLegSpeed, joinPoints, joinGapNm, routeSnapshot,
    sitesWithin, nearbyAnchorages, stopAt, makeStopAt, appendStop, anchorageMovedM, routesUsingAnchorage,
    IMPORT_TARGET_POINTS, MAX_TOLERANCE_M, TOLERANCE_STEP_M, PIN_MATCH_NM, validPos, parseKmlCoordinates, htmlToText,
    extractGeo, simplify, defaultTolerance, joinLines, chosenLinePoints, importPoints, pinMatch, xmlEscape, slugify,
    exportBaseName, toGpx, toKml
  };
});
