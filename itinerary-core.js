(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheItineraryCore = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Pure logic for the Itinerary panel. Mirrors iolanthe-server/lib/itinerary.js for the shared rules
  // (normalise, spans, deriveDays, validate) and adds the admin-only pieces (time estimates, line geometry).
  // Spec: docs/charter-rework/spec.md.

  const ITINERARY_VERSION = 2;
  const DEFAULT_SPEED_KN = 8;
  const MIN_SPEED_KN = 0.5;
  const MAX_SPEED_KN = 30;
  const MAX_TITLE_LENGTH = 120;
  const MAX_NOTES_LENGTH = 2000;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const METRES_PER_NM = 1852;
  const EARTH_RADIUS_M = 6371000;
  const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  const DAY_MS = 86400000;

  const toObj = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  const toStr = (value, max) => (typeof value === "string" ? value.trim().slice(0, max || 100000) : "");

  function toRad(deg) { return (deg * Math.PI) / 180; }
  function distM(a, b) {
    if (!a || !b || !Number.isFinite(a.latitude) || !Number.isFinite(a.longitude) || !Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)) return 0;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const distNm = (a, b) => distM(a, b) / METRES_PER_NM;

  function newId(prefix, random = Math.random) {
    let suffix = "";
    for (let i = 0; i < 6; i += 1) suffix += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)];
    return `${prefix}_${suffix}`;
  }

  const isStop = (point) => Boolean(point && (point.anchorage_id || point.stop === true));

  function parseDateOnly(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === "string" ? value.trim() : "");
    if (!m) return null;
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isFinite(t) ? t : null;
  }
  function charterDayCount(charter) {
    const c = toObj(charter);
    const start = parseDateOnly(c.start_date);
    const end = parseDateOnly(c.end_date);
    if (start === null || end === null || end < start) return 0;
    return Math.round((end - start) / DAY_MS) + 1;
  }
  // "Mon 12 Oct" for charter day `day`; "" without a valid start date.
  function dayDateLabel(charter, day) {
    const start = parseDateOnly(toObj(charter).start_date);
    if (start === null || !Number.isInteger(day) || day < 1) return "";
    const d = new Date(start + (day - 1) * DAY_MS);
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
    return `${weekday} ${d.getUTCDate()} ${month}`;
  }

  // ---- normalisation (same rules as the server) ----------------------------

  function cleanDayTime(value) {
    const o = toObj(value);
    const day = Number(o.day);
    if (!Number.isInteger(day) || day < 1) return null;
    const out = { day };
    if (typeof o.time === "string" && TIME_RE.test(o.time.trim())) out.time = o.time.trim();
    return out;
  }
  function cleanSpeed(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n >= MIN_SPEED_KN && n <= MAX_SPEED_KN ? n : fallback;
  }
  function cleanIdList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()))];
  }
  function normalizePoint(value, random) {
    const p = toObj(value);
    const latitude = Number(p.latitude);
    const longitude = Number(p.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    const out = { latitude, longitude };
    if (typeof p.anchorage_id === "string" && p.anchorage_id.trim()) out.anchorage_id = p.anchorage_id.trim();
    if (!out.anchorage_id && p.stop === true) out.stop = true;
    if (typeof p.name === "string" && p.name.trim()) out.name = p.name.trim().slice(0, MAX_TITLE_LENGTH);
    if (typeof p.site_id === "string" && p.site_id.trim()) out.site_id = p.site_id.trim();
    const speed = cleanSpeed(p.leg_speed_kn, null);
    if (speed !== null) out.leg_speed_kn = speed;
    if (isStop(out)) {
      out.id = typeof p.id === "string" && p.id.trim() ? p.id.trim() : newId("stp", random);
      out.site_ids = cleanIdList(p.site_ids);
      const arrive = cleanDayTime(p.arrive);
      const depart = cleanDayTime(p.depart);
      if (arrive) out.arrive = arrive;
      if (depart) out.depart = depart;
    }
    return out;
  }
  function normalizeActivity(value, random) {
    const a = toObj(value);
    const stopId = toStr(a.stop_id);
    const day = Number(a.day);
    if (!stopId || !Number.isInteger(day) || day < 1) return null;
    const order = Number(a.order);
    const out = {
      id: toStr(a.id) || newId("act", random),
      stop_id: stopId,
      day,
      order: Number.isInteger(order) && order >= 0 ? order : 0,
      title: toStr(a.title, MAX_TITLE_LENGTH),
      notes: toStr(a.notes, MAX_NOTES_LENGTH)
    };
    if (typeof a.time === "string" && TIME_RE.test(a.time.trim())) out.time = a.time.trim();
    const siteId = toStr(a.site_id);
    if (siteId) out.site_id = siteId;
    return out;
  }
  function normalizeItinerary(value, random = Math.random) {
    const v = toObj(value);
    const route = toObj(v.route);
    const revision = Number(v.revision);
    return {
      version: ITINERARY_VERSION,
      revision: Number.isInteger(revision) && revision >= 0 ? revision : 0,
      welcome_message: toStr(v.welcome_message, MAX_NOTES_LENGTH),
      summary: toStr(v.summary, MAX_NOTES_LENGTH),
      route: {
        source: route.source && typeof route.source === "object" && !Array.isArray(route.source) ? route.source : null,
        speed_kn: cleanSpeed(route.speed_kn, DEFAULT_SPEED_KN),
        points: (Array.isArray(route.points) ? route.points : []).map((p) => normalizePoint(p, random)).filter(Boolean)
      },
      activities: (Array.isArray(v.activities) ? v.activities : []).map((a) => normalizeActivity(a, random)).filter(Boolean)
    };
  }

  // What counts as "changed" for the Save button: everything the captain edits, not revision or source.
  function itinerarySnapshot(itinerary) {
    const it = toObj(itinerary);
    return JSON.stringify({ welcome_message: it.welcome_message, summary: it.summary, speed_kn: toObj(it.route).speed_kn, points: toObj(it.route).points, activities: it.activities });
  }

  // ---- days (same rules as the server) --------------------------------------

  function stopEntries(points) {
    return (points || []).map((point, index) => ({ point, index })).filter((e) => isStop(e.point));
  }
  function positionOf(i, count) {
    if (count === 1) return "only";
    if (i === 0) return "origin";
    return i === count - 1 ? "terminus" : "middle";
  }
  function stopSpan(stop, position, dayCount) {
    const arriveDay = stop.arrive ? stop.arrive.day : 1;
    const departDay = stop.depart ? stop.depart.day : (dayCount || arriveDay);
    const from = position === "origin" || position === "only" ? 1 : arriveDay;
    const to = position === "terminus" || position === "only" ? Math.max(dayCount || departDay, arriveDay) : departDay;
    return { from, to: Math.max(from, to) };
  }
  function deriveDays(itinerary, dayCount) {
    const stops = stopEntries(toObj(toObj(itinerary).route).points);
    const activities = [...(Array.isArray(toObj(itinerary).activities) ? itinerary.activities : [])].sort((a, b) => a.order - b.order);
    const days = [];
    for (let day = 1; day <= dayCount; day += 1) {
      const dayStops = [];
      stops.forEach((entry, i) => {
        const span = stopSpan(entry.point, positionOf(i, stops.length), dayCount);
        if (day < span.from || day > span.to) return;
        const p = entry.point;
        dayStops.push({
          id: p.id, index: entry.index, name: p.name || `Stop ${i + 1}`,
          arrive: p.arrive || null, depart: p.depart || null,
          nights: p.arrive && p.depart ? p.depart.day - p.arrive.day : 0,
          activities: activities.filter((a) => a.stop_id === p.id && a.day === day)
        });
      });
      days.push({ day, stops: dayStops });
    }
    return days;
  }

  // ---- validation (same rules as the server) --------------------------------

  function validateItinerary(itinerary, dayCount) {
    const errors = [];
    const push = (field, message) => errors.push({ field, message });
    const it = toObj(itinerary);
    if (it.version !== ITINERARY_VERSION) push("version", "Itinerary version must be 2.");
    const points = Array.isArray(toObj(it.route).points) ? it.route.points : [];
    const stops = stopEntries(points);
    const ids = new Set();
    stops.forEach((entry, i) => {
      const p = entry.point;
      const field = `route.points[${entry.index}]`;
      const label = p.name || `stop ${i + 1}`;
      if (!p.id) push(`${field}.id`, "Every stop needs an id.");
      else if (ids.has(p.id)) push(`${field}.id`, `Stop id ${p.id} is used twice.`);
      ids.add(p.id);
      const isFirst = i === 0;
      const isLast = i === stops.length - 1;
      if (isFirst && p.arrive) push(`${field}.arrive`, "The first stop is the origin and has no arrival.");
      if (!isFirst && !p.arrive) push(`${field}.arrive`, `${label} needs an arrival day.`);
      if (isLast && p.depart) push(`${field}.depart`, "The last stop is the terminus and has no departure.");
      if (!isLast && !p.depart) push(`${field}.depart`, `${label} needs a departure day.`);
      if (p.arrive && p.depart && p.arrive.day > p.depart.day) push(`${field}.depart`, `${label} departs before it arrives.`);
      if (p.arrive && dayCount && p.arrive.day > dayCount) push(`${field}.arrive.day`, `Day ${p.arrive.day} is after the charter's last day (${dayCount}).`);
      if (p.depart && dayCount && p.depart.day > dayCount) push(`${field}.depart.day`, `Day ${p.depart.day} is after the charter's last day (${dayCount}).`);
      const prev = stops[i - 1];
      if (prev && prev.point.depart && p.arrive && prev.point.depart.day > p.arrive.day) {
        push(`${field}.arrive`, `${label} is reached before ${prev.point.name || "the previous stop"} leaves.`);
      }
    });
    if (stops.length && !dayCount) push("route.points", "Set the charter's start and end dates first.");
    const byId = new Map();
    stops.forEach((e, i) => {
      if (!byId.has(e.point.id)) byId.set(e.point.id, { point: e.point, span: stopSpan(e.point, positionOf(i, stops.length), dayCount) });
    });
    (Array.isArray(it.activities) ? it.activities : []).forEach((a, i) => {
      const field = `activities[${i}]`;
      const name = a.title || a.id || `activity ${i + 1}`;
      const stop = byId.get(a.stop_id);
      if (!stop) { push(`${field}.stop_id`, `Activity "${name}" points at a stop that does not exist.`); return; }
      if (a.day < stop.span.from || a.day > stop.span.to) {
        push(`${field}.day`, `Activity "${name}" is on day ${a.day}, outside ${stop.point.name || "its stop"}'s days ${stop.span.from}–${stop.span.to}.`);
      }
      if (!a.title) push(`${field}.title`, "An activity needs a title.");
      if (a.site_id && !(stop.point.site_ids || []).includes(a.site_id)) {
        push(`${field}.site_id`, `${stop.point.name || "That stop"} does not serve site ${a.site_id}.`);
      }
    });
    return errors;
  }

  return {
    ITINERARY_VERSION, DEFAULT_SPEED_KN, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH, TIME_RE,
    distM, distNm, newId, isStop, parseDateOnly, charterDayCount, dayDateLabel,
    normalizePoint, normalizeItinerary, itinerarySnapshot,
    stopEntries, positionOf, stopSpan, deriveDays, validateItinerary
  };
});
