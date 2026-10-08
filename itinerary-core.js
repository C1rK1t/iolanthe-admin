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
  const MIN_DURATION_MIN = 5;
  const MAX_DURATION_MIN = 1440;
  const DEFAULT_DURATION_MIN = 60;     // an item with no duration occupies an hour (spec A2 D12)
  const SEED_DEPART_TIME = "09:00";    // a stop with no departure time is assumed to leave at 09:00 (spec A2 D4)
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
    // null, "" and booleans mean "no duration" (Number() would turn them into 0, which the bounds check rejects). Same as the server.
    const duration = a.duration_min === null || a.duration_min === "" || typeof a.duration_min === "boolean" ? NaN : Number(a.duration_min);
    if (Number.isInteger(duration)) out.duration_min = duration;
    const siteId = toStr(a.site_id);
    if (siteId) out.site_id = siteId;
    return out;
  }
  function normalizeItinerary(value, random = Math.random) {
    const v = toObj(value);
    const route = toObj(v.route);
    const revision = Number(v.revision);
    const points = (Array.isArray(route.points) ? route.points : []).map((p) => normalizePoint(p, random)).filter(Boolean);
    const stopIds = new Set(points.filter(isStop).map((p) => p.id));
    const dirty = Array.isArray(v.dirty_stop_ids) ? v.dirty_stop_ids : [];
    return {
      version: ITINERARY_VERSION,
      revision: Number.isInteger(revision) && revision >= 0 ? revision : 0,
      welcome_message: toStr(v.welcome_message, MAX_NOTES_LENGTH),
      summary: toStr(v.summary, MAX_NOTES_LENGTH),
      route: {
        source: route.source && typeof route.source === "object" && !Array.isArray(route.source) ? route.source : null,
        speed_kn: cleanSpeed(route.speed_kn, DEFAULT_SPEED_KN),
        points
      },
      activities: (Array.isArray(v.activities) ? v.activities : []).map((a) => normalizeActivity(a, random)).filter(Boolean),
      dirty_stop_ids: [...new Set(dirty.filter((id) => typeof id === "string" && stopIds.has(id)))]
    };
  }

  // What counts as "changed" for the Save button: everything the captain edits, not revision or source.
  function itinerarySnapshot(itinerary) {
    const it = toObj(itinerary);
    return JSON.stringify({ welcome_message: it.welcome_message, summary: it.summary, speed_kn: toObj(it.route).speed_kn, points: toObj(it.route).points, activities: it.activities, dirty_stop_ids: it.dirty_stop_ids || [] });
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
      if (a.duration_min !== undefined && (a.duration_min < MIN_DURATION_MIN || a.duration_min > MAX_DURATION_MIN)) {
        push(`${field}.duration_min`, `Activity "${name}" duration must be between ${MIN_DURATION_MIN} minutes and ${MAX_DURATION_MIN / 60} hours.`);
      }
      if (a.site_id && !(stop.point.site_ids || []).includes(a.site_id)) {
        push(`${field}.site_id`, `${stop.point.name || "That stop"} does not serve site ${a.site_id}.`);
      }
    });
    return errors;
  }

  // ---- times -----------------------------------------------------------------

  function legHours(points, fromIndex, toIndex, routeSpeed) {
    let nm = 0;
    for (let i = fromIndex; i < toIndex; i += 1) nm += distNm(points[i], points[i + 1]);
    const speed = cleanSpeed(points[fromIndex] && points[fromIndex].leg_speed_kn, routeSpeed);
    return speed > 0 ? nm / speed : 0;
  }
  function timeToMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  }
  function minutesToTime(minutes) {
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  // Map stop id → { arrive: {time, estimated} | null, depart: {time, estimated} | null }.
  function estimateTimes(itinerary) {
    const it = toObj(itinerary);
    const points = toObj(it.route).points || [];
    const speed = toObj(it.route).speed_kn || DEFAULT_SPEED_KN;
    const out = new Map();
    let prevDepart = null;   // { minutes, index } of the previous stop's known departure
    stopEntries(points).forEach((entry) => {
      const p = entry.point;
      let arrive = null;
      let depart = null;
      if (p.arrive && p.arrive.time) {
        arrive = { time: p.arrive.time, estimated: false };
      } else if (p.arrive && prevDepart) {
        arrive = { time: minutesToTime(prevDepart.minutes + legHours(points, prevDepart.index, entry.index, speed) * 60), estimated: true };
      }
      const nights = p.arrive && p.depart ? p.depart.day - p.arrive.day : 0;
      if (p.depart && p.depart.time) {
        depart = { time: p.depart.time, estimated: false };
      } else if (p.depart && nights === 0 && arrive) {
        depart = { time: arrive.time, estimated: true };
      } else if (p.depart) {
        depart = { time: SEED_DEPART_TIME, estimated: true };   // overnight stop with no departure time: assume 09:00
      }
      out.set(p.id, { arrive, depart });
      prevDepart = depart ? { minutes: timeToMinutes(depart.time), index: entry.index } : null;
    });
    return out;
  }

  // "Arr. ~15:45 · Dep. 08:30", "2 nights · Dep. 18:00", "Dep. 09:00", or "".
  function stopTimesLabel(stop, times) {
    const t = times || { arrive: null, depart: null };
    const parts = [];
    if (t.arrive) parts.push(`Arr. ${t.arrive.estimated ? "~" : ""}${t.arrive.time}`);
    const nights = stop && stop.arrive && stop.depart ? stop.depart.day - stop.arrive.day : 0;
    if (nights > 1) parts.push(`${nights} nights`);
    if (t.depart) parts.push(`Dep. ${t.depart.estimated ? "~" : ""}${t.depart.time}`);
    return parts.join(" · ");
  }

  // ---- line geometry ----------------------------------------------------------

  // days: deriveDays() output. centres: Map "stopId:day" → y (px). Returns shapes in route order.
  function lineGeometry(days, centres) {
    const byStop = new Map();   // stopId → { index, ys: [] }
    (days || []).forEach((d) => (d.stops || []).forEach((s) => {
      const y = centres.get(`${s.id}:${d.day}`);
      if (!Number.isFinite(y)) return;
      if (!byStop.has(s.id)) byStop.set(s.id, { index: s.index, ys: [] });
      byStop.get(s.id).ys.push(y);
    }));
    const ordered = [...byStop.entries()].sort((a, b) => a[1].index - b[1].index);
    const shapes = ordered.map(([stopId, entry], i) => {
      const y1 = Math.min(...entry.ys);
      const y2 = Math.max(...entry.ys);
      const terminal = ordered.length > 1 && i === 0 ? "origin" : (ordered.length > 1 && i === ordered.length - 1 ? "terminus" : null);
      return { stopId, kind: entry.ys.length > 1 ? "loop" : "dot", y1, y2, terminal };
    });
    if (!shapes.length) return { shapes: [], top: 0, bottom: 0 };
    return { shapes, top: shapes[0].y1, bottom: shapes[shapes.length - 1].y2 };
  }

  // ---- editing: pure, immutable -------------------------------------------------

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function replacePoint(itinerary, index, point) {
    const points = itinerary.route.points.map((p, i) => (i === index ? point : p));
    return { ...itinerary, route: { ...itinerary.route, points } };
  }

  // Activities of `stopId` whose day fell outside the stop's span move to the nearest day inside it.
  function clampActivities(itinerary, stopId, dayCount) {
    const stops = stopEntries(itinerary.route.points);
    const i = stops.findIndex((e) => e.point.id === stopId);
    if (i < 0) return itinerary;
    const span = stopSpan(stops[i].point, positionOf(i, stops.length), dayCount);
    const activities = itinerary.activities.map((a) => (a.stop_id !== stopId ? a : { ...a, day: Math.min(Math.max(a.day, span.from), span.to) }));
    return { ...itinerary, activities: renumberActivities(activities) };
  }

  // field: "arrive" | "depart"; time "HH:MM" sets, "" clears. Invalid input returns the same itinerary.
  function setStopTime(itinerary, stopId, field, time) {
    const entry = stopEntries(itinerary.route.points).find((e) => e.point.id === stopId);
    if (!entry || !entry.point[field]) return itinerary;
    const value = toStr(time);
    if (value && !TIME_RE.test(value)) return itinerary;
    const dayTime = value ? { day: entry.point[field].day, time: value } : { day: entry.point[field].day };
    return replacePoint(itinerary, entry.index, { ...entry.point, [field]: dayTime });
  }

  // Replaces the served sites. Site activities whose site is no longer served are removed.
  function setStopSites(itinerary, stopId, siteIds) {
    const entry = stopEntries(itinerary.route.points).find((e) => e.point.id === stopId);
    if (!entry) return itinerary;
    const ids = cleanIdList(siteIds);
    const next = replacePoint(itinerary, entry.index, { ...entry.point, site_ids: ids });
    const activities = next.activities.filter((a) => !(a.stop_id === stopId && a.site_id && !ids.includes(a.site_id)));
    return { ...next, activities: renumberActivities(activities) };
  }

  const NEAR_NM = 5;   // route-planner Q4: sites within 5 nm are shown first in the picker

  // [{ id, title, nm, near }] sorted by distance; sites without a position are left out.
  function sitesByDistance(siteLibrary, position) {
    return ((toObj(siteLibrary).sites) || [])
      .filter((s) => s && typeof s.id === "string" && Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)))
      .map((s) => {
        const nm = distNm(position, { latitude: Number(s.latitude), longitude: Number(s.longitude) });
        return { id: s.id, title: s.title || s.id, nm, near: nm <= NEAR_NM };
      })
      .sort((a, b) => a.nm - b.nm);
  }

  // 0..n within each (stop_id, day) group, keeping the current relative order.
  function renumberActivities(activities) {
    const groups = new Map();
    activities.forEach((a) => {
      const key = `${a.stop_id}:${a.day}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    });
    const orderOf = new Map();
    groups.forEach((list) => list.sort((a, b) => a.order - b.order).forEach((a, i) => orderOf.set(a.id, i)));
    return activities.map((a) => ({ ...a, order: orderOf.get(a.id) }));
  }

  function stopById(itinerary, stopId) {
    const stops = stopEntries(itinerary.route.points);
    const i = stops.findIndex((e) => e.point.id === stopId);
    return i < 0 ? null : { point: stops[i].point, index: stops[i].index, position: positionOf(i, stops.length) };
  }

  // Spec §4.4 drop rule.
  function canDropActivity(itinerary, activityId, targetStopId, targetDay, dayCount) {
    const activity = itinerary.activities.find((a) => a.id === activityId);
    const target = stopById(itinerary, targetStopId);
    if (!activity || !target) return false;
    const span = stopSpan(target.point, target.position, dayCount);
    if (targetDay < span.from || targetDay > span.to) return false;
    if (activity.site_id && activity.stop_id !== targetStopId && !(target.point.site_ids || []).includes(activity.site_id)) return false;
    return true;
  }

  // Moves an activity to (stop, day) at `index` within that group. Refused moves return the same itinerary.
  function moveActivity(itinerary, activityId, targetStopId, targetDay, index) {
    const dayCountGuess = Math.max(...itinerary.activities.map((a) => a.day), targetDay, ...stopEntries(itinerary.route.points).flatMap((e) => [e.point.arrive ? e.point.arrive.day : 0, e.point.depart ? e.point.depart.day : 0]));
    if (!canDropActivity(itinerary, activityId, targetStopId, targetDay, dayCountGuess)) return itinerary;
    const moving = itinerary.activities.find((a) => a.id === activityId);
    const others = itinerary.activities.filter((a) => a.id !== activityId);
    const group = others.filter((a) => a.stop_id === targetStopId && a.day === targetDay).sort((a, b) => a.order - b.order);
    const at = Math.min(Math.max(Number.isInteger(index) ? index : group.length, 0), group.length);
    const placed = { ...moving, stop_id: targetStopId, day: targetDay, order: at - 0.5 };   // sits between neighbours; renumber fixes it
    return { ...itinerary, activities: renumberActivities([...others, placed]) };
  }

  // Appends an activity to the (stop, day) group. A site not yet served by the stop is added to its site_ids.
  function addActivity(itinerary, stopId, day, fields, random = Math.random) {
    const target = stopById(itinerary, stopId);
    if (!target) return itinerary;
    const dayCountGuess = Math.max(day, ...stopEntries(itinerary.route.points).flatMap((e) => [e.point.arrive ? e.point.arrive.day : 0, e.point.depart ? e.point.depart.day : 0]));
    const span = stopSpan(target.point, target.position, dayCountGuess);
    if (day < span.from || day > span.to) return itinerary;
    const f = toObj(fields);
    const siteId = toStr(f.site_id);
    let next = itinerary;
    if (siteId && !(target.point.site_ids || []).includes(siteId)) {
      next = replacePoint(next, target.index, { ...target.point, site_ids: [...(target.point.site_ids || []), siteId] });
    }
    const groupSize = next.activities.filter((a) => a.stop_id === stopId && a.day === day).length;
    const activity = normalizeActivity({ id: newId("act", random), stop_id: stopId, day, order: groupSize, title: f.title, notes: f.notes, time: f.time, site_id: siteId }, random);
    return { ...next, activities: [...next.activities, activity] };
  }

  // patch: { title?, notes?, time? }. An invalid time clears the time.
  function updateActivity(itinerary, activityId, patch) {
    const p = toObj(patch);
    const activities = itinerary.activities.map((a) => {
      if (a.id !== activityId) return a;
      const out = { ...a };
      if ("title" in p) out.title = toStr(p.title, MAX_TITLE_LENGTH);
      if ("notes" in p) out.notes = toStr(p.notes, MAX_NOTES_LENGTH);
      if ("time" in p) {
        const time = toStr(p.time);
        if (time && TIME_RE.test(time)) out.time = time; else delete out.time;
      }
      if ("duration_min" in p) {
        const duration = Number(p.duration_min);
        if (Number.isInteger(duration) && duration >= MIN_DURATION_MIN && duration <= MAX_DURATION_MIN) out.duration_min = duration; else delete out.duration_min;
      }
      return out;
    });
    return { ...itinerary, activities };
  }

  function removeActivity(itinerary, activityId) {
    return { ...itinerary, activities: renumberActivities(itinerary.activities.filter((a) => a.id !== activityId)) };
  }

  // ---- Route panel charter mode (spec §5) -------------------------------------------

  // Takes the saved itinerary and the point list edited on the map. Returns
  // { itinerary, removed: [{ id, name, activities }], reseededFrom: name | null } with a valid itinerary.
  function reconcileRoutePoints(itinerary, editedPoints, dayCount, random = Math.random) {
    const oldStops = stopEntries(itinerary.route.points).map((e) => e.point);
    const oldById = new Map(oldStops.map((p) => [p.id, p]));
    let points = (editedPoints || []).map((p) => normalizePoint(p, random)).filter(Boolean);

    // 1. New stops (no known id) get an id; everything else keeps what the map carried over.
    const knownIds = new Set(oldStops.map((p) => p.id));
    points = points.map((p) => (isStop(p) && !knownIds.has(p.id) ? { ...p, id: newId("stp", random), isNew: true } : p));

    // 2. Removed stops take their activities.
    const newIds = new Set(points.filter(isStop).map((p) => p.id));
    const removed = oldStops.filter((p) => !newIds.has(p.id)).map((p) => ({
      id: p.id,
      name: p.name || "Stop",
      activities: itinerary.activities.filter((a) => a.stop_id === p.id).sort((a, b) => a.day - b.day || a.order - b.order)
    }));
    const removedIds = new Set(removed.map((r) => r.id));
    let activities = itinerary.activities.filter((a) => !removedIds.has(a.stop_id));

    // 3. Days for new stops, origin/terminus rules, then order.
    const entries = stopEntries(points);
    const stops = entries.map((e) => ({ ...e.point }));
    stops.forEach((s, i) => {
      const prev = stops[i - 1];
      const next = stops[i + 1];
      if (s.isNew) {
        if (i === 0) {
          s.depart = { day: 1 };
          if (next && !next.arrive) next.arrive = { day: 1 };                           // old origin becomes a middle stop
        } else if (i === stops.length - 1) {
          const prevDay = prev.depart ? prev.depart.day : (prev.arrive ? prev.arrive.day : 1);
          if (!prev.depart) prev.depart = { day: prevDay };                              // old terminus becomes a middle stop
          s.arrive = { day: Math.max(prevDay, 1) };
        } else {
          const day = prev.depart ? prev.depart.day : (prev.arrive ? prev.arrive.day : 1);
          s.arrive = { day };
          s.depart = { day };
        }
      }
      delete s.isNew;
    });
    if (stops.length) {
      delete stops[0].arrive;
      delete stops[stops.length - 1].depart;
      for (let i = 1; i < stops.length - 1; i += 1) {
        if (!stops[i].arrive) stops[i].arrive = { day: stops[i - 1].depart ? stops[i - 1].depart.day : 1 };
        if (!stops[i].depart) stops[i].depart = { day: stops[i].arrive.day };
      }
      if (stops.length > 1 && !stops[0].depart) stops[0].depart = { day: 1 };
      if (stops.length > 1 && !stops[stops.length - 1].arrive) stops[stops.length - 1].arrive = { day: stops[stops.length - 2].depart.day };
    }

    // 4. Days must not run backwards along the route. From the first stop that does, re-seed with zero nights.
    let reseededFrom = null;
    for (let i = 1; i < stops.length; i += 1) {
      const prevDepart = stops[i - 1].depart ? stops[i - 1].depart.day : 1;
      const arriveDay = stops[i].arrive ? stops[i].arrive.day : prevDepart;
      if (arriveDay < prevDepart || reseededFrom) {
        if (!reseededFrom) reseededFrom = stops[i].name || `stop ${i + 1}`;
        const day = prevDepart;
        stops[i].arrive = { ...(stops[i].arrive || {}), day };
        if (stops[i].depart) stops[i].depart = { ...stops[i].depart, day };
      }
    }

    entries.forEach((e, i) => { points[e.index] = stops[i]; });
    let next = { ...itinerary, route: { ...itinerary.route, points }, activities: renumberActivities(activities) };
    stops.forEach((s) => { next = clampActivities(next, s.id, dayCount); });
    return { itinerary: next, removed, reseededFrom };
  }

  return {
    ITINERARY_VERSION, DEFAULT_SPEED_KN, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH, TIME_RE,
    MIN_DURATION_MIN, MAX_DURATION_MIN, DEFAULT_DURATION_MIN, SEED_DEPART_TIME,
    distM, distNm, newId, isStop, parseDateOnly, charterDayCount, dayDateLabel,
    normalizePoint, normalizeItinerary, itinerarySnapshot,
    stopEntries, positionOf, stopSpan, deriveDays, validateItinerary,
    legHours, timeToMinutes, minutesToTime, estimateTimes, stopTimesLabel,
    lineGeometry,
    clampActivities,
    setStopTime, setStopSites, sitesByDistance,
    renumberActivities, canDropActivity, moveActivity, addActivity, updateActivity, removeActivity,
    reconcileRoutePoints
  };
});
