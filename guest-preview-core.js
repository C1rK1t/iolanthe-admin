// Guest view pure logic (charter rework spec B §3.4), shared by guest-preview.js (browser) and
// test/guest-preview-core.test.js (node --test): the slider steps, the default step, the iframe URL, the frame scale.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheGuestPreviewCore = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY_MS = 86400000;
  const DEVICES = Object.freeze({
    phone: Object.freeze({ w: 390, h: 844 }),
    tablet: Object.freeze({ w: 820, h: 1180 }),
    pc: Object.freeze({ w: 1280, h: 800 })   // a laptop browser window
  });
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const isStop = (point) => Boolean(point && (point.anchorage_id || point.stop === true));

  function parseDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof value === "string" ? value.trim() : "");
    if (!m) return null;
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(t);
    return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? t : null;
  }
  const isoOf = (t) => new Date(t).toISOString().slice(0, 10);
  const labelOf = (t) => {
    const d = new Date(t);
    return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  };

  // Where the boat is at the end of charter day `day`: the stop it spends the night at, "passage to X" on a night at
  // sea, the last stop once the route is done, "" without stops. The origin counts as reached on day 1.
  function overnightName(points, day) {
    const stops = (Array.isArray(points) ? points : []).filter(isStop);
    const nameOf = (p, i) => p.name || `Stop ${i + 1}`;
    for (let i = 0; i < stops.length; i += 1) {
      const p = stops[i];
      const arrive = i === 0 ? 1 : ((p.arrive && p.arrive.day) || 1);
      const depart = i === stops.length - 1 ? Infinity : ((p.depart && p.depart.day) || arrive);
      if (arrive <= day && day < depart) return nameOf(p, i);
    }
    const nextIndex = stops.findIndex((p, i) => i > 0 && p.arrive && p.arrive.day > day);
    if (nextIndex > 0) return `passage to ${nameOf(stops[nextIndex], nextIndex)}`;
    return stops.length ? nameOf(stops[stops.length - 1], stops.length - 1) : "";
  }

  // One step per charter day plus the day before boarding and the day after: [{ date, kind, day, label, sub }].
  // [] without valid start and end dates.
  function previewSteps(charter, points) {
    const c = charter && typeof charter === "object" ? charter : {};
    const start = parseDate(c.start_date);
    const end = parseDate(c.end_date);
    if (start === null || end === null || end < start) return [];
    const count = Math.round((end - start) / DAY_MS) + 1;
    const steps = [];
    for (let k = 0; k <= count + 1; k += 1) {
      const t = start + (k - 1) * DAY_MS;
      const kind = k === 0 ? "before" : (k === count + 1 ? "after" : "day");
      const where = kind === "day" ? overnightName(points, k) : "";
      const sub = kind === "before" ? "Day before boarding"
        : kind === "after" ? "Day after the charter"
          : `Day ${k} of ${count}${where ? ` · ${where}` : ""}`;
      steps.push({ date: isoOf(t), kind, day: kind === "day" ? k : null, label: labelOf(t), sub });
    }
    return steps;
  }

  // Today's step when today is in range, else the charter's Day 1.
  function defaultStepIndex(steps, todayIso) {
    const today = (steps || []).findIndex((s) => s.date === todayIso);
    if (today >= 0) return today;
    const first = (steps || []).findIndex((s) => s.kind === "day");
    return first >= 0 ? first : 0;
  }

  function stepIndexForDay(steps, day) {
    return (steps || []).findIndex((s) => s.kind === "day" && s.day === day);
  }

  function stepIndexForDate(steps, date) {
    return (steps || []).findIndex((s) => s.date === date);
  }

  // The iframe URL. The hash keeps the guest's tab, but only a plain tab id (letters, digits, - and _) passes.
  function previewUrl({ date, charterId, hash }) {
    const tab = String(hash || "").replace(/^#/, "");
    return `/?preview=${encodeURIComponent(date)}&charter=${encodeURIComponent(charterId)}${/^[a-z0-9_-]+$/.test(tab) ? `#${tab}` : ""}`;
  }

  // Scale for a device frame drawn at its real size inside availW × availH; never above 1.
  function fitScale(device, availW, availH) {
    const d = DEVICES[device] || DEVICES.phone;
    const k = Math.min(1, availW / d.w, availH / d.h);
    return Number.isFinite(k) && k > 0 ? k : 1;
  }

  return { DEVICES, overnightName, previewSteps, defaultStepIndex, stepIndexForDay, stepIndexForDate, previewUrl, fitScale };
});
