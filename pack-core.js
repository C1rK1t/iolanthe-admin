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
