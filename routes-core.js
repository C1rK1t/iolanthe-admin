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

  return {
    METRES_PER_NM, distM, distNm, routeNm, fmtHm, isStop, replaceAt, insertAt, removeAt,
    stopLegs, totalHours, setLegSpeed, joinPoints, joinGapNm, routeSnapshot,
    sitesWithin, nearbyAnchorages, stopAt, makeStopAt, appendStop, anchorageMovedM, routesUsingAnchorage
  };
});
