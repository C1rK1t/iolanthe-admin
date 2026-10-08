// Charter list pure logic, shared by charter-gantt.js / admin.js (browser) and test/charters-core.test.js (node --test).
// The active rule, statuses and overlaps mirror iolanthe-server lib/active-charter.js and share its fixture. No DOM here.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheChartersCore = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MS_DAY = 86400000;
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---- dates ------------------------------------------------------------------------------------------------

  function isValidDate(value) {
    const m = DATE_RE.exec(String(value || ""));
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  }

  // Whole days since 1970-01-01 (UTC), so date maths never meets DST.
  function dayIndex(value) {
    if (!isValidDate(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / MS_DAY);
  }

  function dateFromIndex(index) {
    return new Date(Math.round(index) * MS_DAY).toISOString().slice(0, 10);
  }

  function addDays(value, days) {
    const i = dayIndex(value);
    return i === null ? "" : dateFromIndex(i + days);
  }

  function todayLocal(now = new Date()) {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parts(value) {
    const [y, m, d] = value.split("-").map(Number);
    return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  }

  function fmtDate(value) {
    if (!isValidDate(value)) return "No dates";
    const p = parts(value);
    return `${DAY_NAMES[p.dow]} ${p.d} ${MONTH_NAMES[p.m - 1]} ${p.y}`;
  }

  function fmtShort(value) {
    if (!isValidDate(value)) return "";
    const p = parts(value);
    return `${p.d} ${MONTH_NAMES[p.m - 1]} ${p.y}`;
  }

  function fmtRange(start, end) {
    if (!isValidDate(start) || !isValidDate(end)) return "No dates";
    const a = parts(start);
    const b = parts(end);
    if (a.y === b.y) {
      return `${DAY_NAMES[a.dow]} ${a.d} ${MONTH_NAMES[a.m - 1]} – ${DAY_NAMES[b.dow]} ${b.d} ${MONTH_NAMES[b.m - 1]} ${b.y}`;
    }
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  }

  // ---- the active rule (mirror of the server) ---------------------------------------------------------------

  function datesOf(charter) {
    const source = charter && charter.charter && typeof charter.charter === "object" ? charter.charter : (charter || {});
    const start = isValidDate(source.start_date) ? source.start_date : "";
    const end = isValidDate(source.end_date) ? source.end_date : "";
    return start && end && end >= start ? { start, end } : null;
  }

  function nights(charter) {
    const r = datesOf(charter);
    return r ? dayIndex(r.end) - dayIndex(r.start) : null;
  }

  function charterStatus(charter, today) {
    const r = datesOf(charter);
    if (!r) return "no-dates";
    if (today < r.start) return "upcoming";
    return today > r.end ? "ended" : "underway";
  }

  function isInDate(charter, today) {
    const r = datesOf(charter);
    return Boolean(r) && today >= addDays(r.start, -1) && today <= r.end;
  }

  function activeCharterId(charters, storedId, today) {
    const list = Array.isArray(charters) ? charters.filter((c) => c && typeof c.id === "string" && c.id) : [];
    const inDate = list.filter((c) => isInDate(c, today)).sort((a, b) => datesOf(b).start.localeCompare(datesOf(a).start));
    if (inDate.length) return inDate[0].id;
    if (storedId && list.some((c) => c.id === storedId)) return storedId;
    const ended = list.filter((c) => charterStatus(c, today) === "ended").sort((a, b) => datesOf(b).end.localeCompare(datesOf(a).end));
    if (ended.length) return ended[0].id;
    const upcoming = list.filter((c) => charterStatus(c, today) === "upcoming").sort((a, b) => datesOf(a).start.localeCompare(datesOf(b).start));
    if (upcoming.length) return upcoming[0].id;
    const any = list.slice().sort((a, b) => a.id.localeCompare(b.id));
    return any.length ? any[0].id : "";
  }

  function rangesOverlap(a, b) {
    const ra = datesOf(a);
    const rb = datesOf(b);
    return Boolean(ra && rb) && ra.start <= rb.end && rb.start <= ra.end;
  }

  function findOverlaps(candidate, others, selfKind = "charter") {
    return (Array.isArray(others) ? others : [])
      .filter((e) => e && !(candidate && candidate.id && e.kind === selfKind && e.id === candidate.id))
      .filter((e) => rangesOverlap(candidate, e))
      .map((e) => ({ kind: e.kind, id: e.id, name: e.name, start_date: e.start_date, end_date: e.end_date }));
  }

  function overlapMessage(overlaps) {
    const f = overlaps[0];
    return f ? `Overlaps ${f.name} (${f.start_date} – ${f.end_date})` : "";
  }

  // The entries the overlap check compares against: every charter and every reserved period.
  function overlapEntries(charters, periods) {
    const PERIOD_LABELS = { maintenance: "Maintenance", unavailable: "Unavailable", other: "Reserved" };
    return (Array.isArray(charters) ? charters : [])
      .map((c) => ({ kind: "charter", id: c.id, name: c.name || c.id, start_date: (c.charter || {}).start_date, end_date: (c.charter || {}).end_date }))
      .concat((Array.isArray(periods) ? periods : []).map((p) => ({ kind: "period", id: p.id, name: `${PERIOD_LABELS[p.type] || "Reserved"} · ${p.title}`, start_date: p.start_date, end_date: p.end_date })));
  }

  // {tone: active|upcoming|ended|none, text}
  function pillFor(charter, opts) {
    const r = datesOf(charter);
    const isActive = Boolean(opts.activeId) && charter.id === opts.activeId;
    if (!r) return { tone: isActive ? "active" : "none", text: isActive ? "Active · no dates" : "No dates" };
    const status = charterStatus(charter, opts.today);
    let detail;
    if (status === "underway") {
      detail = `day ${dayIndex(opts.today) - dayIndex(r.start) + 1} of ${nights(charter) + 1}`;
    } else if (status === "upcoming") {
      const inDays = dayIndex(r.start) - dayIndex(opts.today);
      detail = inDays === 1 ? "starts tomorrow" : `starts in ${inDays} days`;
    } else {
      detail = `ended ${fmtShort(r.end)}`;
    }
    if (isActive) return { tone: "active", text: `Active · ${detail}` };
    if (status === "upcoming") return { tone: "upcoming", text: `Upcoming · ${detail}` };
    if (status === "ended") return { tone: "ended", text: `Ended · ${fmtShort(r.end)}` };
    return { tone: "upcoming", text: `Underway · ${detail}` };
  }

  // ---- band layout ------------------------------------------------------------------------------------------

  // Greedy row packing: bars sorted by start go on the first row whose last bar ended before they start.
  // Bars without usable dates are dropped (the band lists them in its "no dates" pill instead).
  function packRows(bars) {
    const sorted = (Array.isArray(bars) ? bars : []).filter((b) => datesOf(b)).slice()
      .sort((a, b) => datesOf(a).start.localeCompare(datesOf(b).start) || datesOf(a).end.localeCompare(datesOf(b).end));
    const rows = [];
    sorted.forEach((bar) => {
      const row = rows.find((r) => datesOf(r[r.length - 1]).end < datesOf(bar).start);
      if (row) row.push(bar); else rows.push([bar]);
    });
    return rows;
  }

  const ZOOM_DAYS = { quarter: 91, year: 365, "3years": 1095 };
  const ACTIVE_PAD_DAYS = 7;

  // {start, end} for a zoom level. opts: {active: {start_date, end_date}|null, today}.
  function zoomSpan(level, opts) {
    const active = opts.active && datesOf(opts.active) ? datesOf(opts.active) : null;
    if (level === "active" && active) {
      return { start: addDays(active.start, -ACTIVE_PAD_DAYS), end: addDays(active.end, ACTIVE_PAD_DAYS) };
    }
    const days = ZOOM_DAYS[level] || ZOOM_DAYS.quarter;
    const anchor = active ? Math.round((dayIndex(active.start) + dayIndex(active.end)) / 2) : dayIndex(opts.today);
    const start = anchor - Math.floor(days / 2);
    return { start: dateFromIndex(start), end: dateFromIndex(start + days) };
  }

  const RANGE_HALF_DAYS = 548;   // 1.5 years either side of today
  const RANGE_PAD_DAYS = 30;

  function scrollRange(bars, today) {
    let start = dayIndex(today) - RANGE_HALF_DAYS;
    let end = dayIndex(today) + RANGE_HALF_DAYS;
    (Array.isArray(bars) ? bars : []).forEach((bar) => {
      const r = datesOf(bar);
      if (!r) return;
      start = Math.min(start, dayIndex(r.start) - RANGE_PAD_DAYS);
      end = Math.max(end, dayIndex(r.end) + RANGE_PAD_DAYS);
    });
    return { start: dateFromIndex(start), end: dateFromIndex(end) };
  }

  function visibleMonths(start, end) {
    const out = [];
    let cursor = start;
    while (cursor <= end) {
      const p = parts(cursor);
      const lastOfMonth = dateFromIndex(dayIndex(`${p.m === 12 ? p.y + 1 : p.y}-${String(p.m === 12 ? 1 : p.m + 1).padStart(2, "0")}-01`) - 1);
      const monthEnd = lastOfMonth < end ? lastOfMonth : end;
      out.push({ label: `${MONTH_NAMES[p.m - 1]} ${p.y}`, start: cursor, end: monthEnd });
      cursor = addDays(lastOfMonth, 1);
    }
    return out;
  }

  // Every Monday strictly inside (start, end].
  function visibleWeeks(start, end) {
    const out = [];
    const first = dayIndex(start);
    const last = dayIndex(end);
    for (let i = first + 1; i <= last; i += 1) {
      if (new Date(i * MS_DAY).getUTCDay() === 1) out.push(dateFromIndex(i));
    }
    return out;
  }

  return {
    MS_DAY, ZOOM_DAYS, isValidDate, dayIndex, dateFromIndex, addDays, todayLocal, fmtDate, fmtShort, fmtRange,
    datesOf, nights, charterStatus, isInDate, activeCharterId, rangesOverlap, findOverlaps, overlapMessage, overlapEntries, pillFor,
    packRows, zoomSpan, scrollRange, visibleMonths, visibleWeeks
  };
});
