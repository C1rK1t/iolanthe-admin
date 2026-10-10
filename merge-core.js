// Conflict-safe saves (charter rework spec C §3): the three-way merge and the save loop, shared by admin.js (browser)
// and test/merge-core.test.js (node --test). No DOM here.
// base = the copy the admin last got from the server, mine = what it was about to send, theirs = the stored copy a 409
// returned. Records in keyed lists merge field by field; a field both sides changed differently is a clash.
(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  } else {
    root.IolantheMerge = core;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STAMP_KEYS = ["revision", "saved_by", "saved_at"];
  // The server's mark on a copy made from defaults (SC-D16): never part of a file, so never merged, kept or a change.
  const MARKER_KEYS = ["damaged"];
  // Fields the server owns: never merged, kept or counted as a change.
  const SERVER_KEYS = [...STAMP_KEYS, ...MARKER_KEYS];
  const MAX_ROUNDS = 3;
  const DEPARTMENT_LABELS = { charter: "Charter Admin", galley: "Galley", hotel: "Hotel", system: "The server" };
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

  const sectionKey = (section) => String((section && (section.category || section.title)) || "").trim().toLocaleLowerCase();
  const stockKey = (item) => String((item && item.stock_id) || "").trim().toLocaleLowerCase();

  // One schema per protected file (spec C §3.1): the keyed lists, and fields recomputed from position.
  const SCHEMAS = Object.freeze({
    charter: {},
    crew: { lists: { crew: { key: "id" } } },
    guests: { lists: { guests: { key: "id" } } },
    menus: { lists: { menus: { key: "id", derived: ["order", "day", "charter_day", "date"] } } },
    guestDrinks: { lists: { sections: { key: sectionKey, lists: { items: { key: stockKey } } } } },
    availableAlcohol: { lists: { items: { key: stockKey } } },
    drinkStocks: { lists: { items: { key: "id" } } },
    cocktails: { lists: { cocktails: { key: "id" } } },
    sites: { lists: { sites: { key: "id" } } }
  });

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  // Deep equality that ignores key order; a missing key, undefined, null, "" and [] are the same (an editor writes null,
  // "" or an empty list for a field the stored record leaves out).
  const blank = (value) => value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length);

  function same(a, b) {
    if (a === b || (blank(a) && blank(b))) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => same(item, b[index]));
    }
    if (isRecord(a) && isRecord(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        if (!same(a[key], b[key])) return false;
      }
      return true;
    }
    return false;
  }

  function revisionOf(data) {
    const revision = isRecord(data) ? data.revision : undefined;
    return Number.isInteger(revision) && revision >= 0 ? revision : 0;
  }

  function keyFn(spec) {
    return typeof spec.key === "function" ? spec.key : (record) => (isRecord(record) && typeof record[spec.key] === "string" ? record[spec.key] : "");
  }

  function setField(target, field, value) {
    if (value === undefined) {
      delete target[field];
    } else {
      target[field] = value;
    }
  }

  // Merges the fields of one record or of the top level. ctx: { list, key, parent } for clash reports.
  function mergeFields(base, mine, theirs, spec, ctx, out) {
    const b = isRecord(base) ? base : {};
    const m = isRecord(mine) ? mine : {};
    const t = isRecord(theirs) ? theirs : {};
    const lists = spec.lists || {};
    const skip = new Set([...SERVER_KEYS, ...(spec.derived || [])]);
    const merged = {};
    const rebased = {};
    const fields = [...new Set([...Object.keys(t), ...Object.keys(m), ...Object.keys(b)])];
    for (const field of fields) {
      if (skip.has(field)) {
        // Derived fields (a menu's day number) follow the side whose order won, so they match the positions.
        const kept = spec.derivedFrom === "mine" ? (field in m ? m[field] : t[field]) : (field in t ? t[field] : m[field]);
        if (!SERVER_KEYS.includes(field)) {
          setField(merged, field, kept);
          setField(rebased, field, kept);
        }
        continue;
      }
      if (lists[field]) {
        const result = mergeList(b[field], m[field], t[field], lists[field], { list: field, parent: ctx.key === undefined ? null : ctx }, out);
        merged[field] = result.merged;
        rebased[field] = result.rebased;
        continue;
      }
      const mineChanged = !same(m[field], b[field]);
      const theirsChanged = !same(t[field], b[field]);
      if (!mineChanged) {
        setField(merged, field, t[field]);
        setField(rebased, field, t[field]);
      } else if (!theirsChanged || same(m[field], t[field])) {
        setField(merged, field, m[field]);
        setField(rebased, field, m[field]);
      } else {
        out.clashes.push({ kind: "field", list: ctx.list || null, key: ctx.key === undefined ? null : ctx.key, parent: ctx.parent || null, field, base: b[field], mine: m[field], theirs: t[field] });
        setField(merged, field, t[field]);
        setField(rebased, field, m[field]);
      }
    }
    return { merged, rebased };
  }

  // True when my list changed the order of the records all three copies share.
  function mineReorderedKeys(baseKeys, mineKeys, theirsKeys) {
    const common = (keys) => keys.filter((key) => baseKeys.includes(key) && mineKeys.includes(key) && theirsKeys.includes(key));
    return !same(common(mineKeys), common(baseKeys));
  }

  // Order: the side that reordered wins (mine if both did, with a note); records only on the other side follow the
  // record they followed in their own list.
  function orderKeys(survivors, baseKeys, mineKeys, theirsKeys, listName, out, noteOnce) {
    const common = (keys) => keys.filter((key) => baseKeys.includes(key) && mineKeys.includes(key) && theirsKeys.includes(key));
    const mineReordered = mineReorderedKeys(baseKeys, mineKeys, theirsKeys);
    const theirsReordered = !same(common(theirsKeys), common(baseKeys));
    if (mineReordered && theirsReordered && noteOnce) {
      out.notes.push({ kind: "order-replaced", list: listName });
    }
    const primary = mineReordered ? mineKeys : theirsKeys;
    const secondary = mineReordered ? theirsKeys : mineKeys;
    const result = primary.filter((key) => survivors.has(key));
    let previous = null;
    for (const key of secondary) {
      if (survivors.has(key) && !result.includes(key)) {
        result.splice(previous === null ? 0 : result.indexOf(previous) + 1, 0, key);
      }
      if (result.includes(key)) previous = key;
    }
    return result;
  }

  function mergeList(baseList, mineList, theirsList, spec, ctx, out) {
    const lists = [baseList, mineList, theirsList].map((list) => (Array.isArray(list) ? list : []));
    const keyOf = keyFn(spec);
    // A record only mine has and without a key yet (the server gives it one on save) is an add with a key of its own.
    const keysFor = (list, side) => list.map((record, index) => {
      const key = isRecord(record) ? keyOf(record) : "";
      return key || (side === "mine" && isRecord(record) ? `#new-${index}` : "");
    });
    const keyLists = [keysFor(lists[0], "base"), keysFor(lists[1], "mine"), keysFor(lists[2], "theirs")];
    const keyed = keyLists.every((keys) => keys.every(Boolean) && new Set(keys).size === keys.length);
    if (!keyed) {
      // Records without keys (or with repeated keys) cannot be matched: the list merges as one field of its parent.
      const [b, m, t] = lists;
      if (same(m, b)) return { merged: t, rebased: t };
      if (same(t, b) || same(m, t)) return { merged: m, rebased: m };
      const owner = ctx.parent || {};
      out.clashes.push({ kind: "field", list: owner.list || null, key: owner.key === undefined ? null : owner.key, parent: owner.parent || null, field: ctx.list, base: b, mine: m, theirs: t });
      return { merged: t, rebased: m };
    }
    const [B, M, T] = lists.map((list, side) => new Map(list.map((record, index) => [keyLists[side][index], record])));
    const allKeys = [...new Set([...T.keys(), ...M.keys(), ...B.keys()])];
    const mergedRecords = new Map();
    const rebasedRecords = new Map();
    const [baseKeys, mineKeys, theirsKeys] = keyLists;
    const recordSpec = { lists: spec.lists, derived: spec.derived, derivedFrom: mineReorderedKeys(baseKeys, mineKeys, theirsKeys) ? "mine" : "theirs" };
    for (const key of allKeys) {
      const b = B.get(key);
      const m = M.get(key);
      const t = T.get(key);
      const recordCtx = { list: ctx.list, key, parent: ctx.parent };
      if (m && t) {
        const result = mergeFields(b || {}, m, t, recordSpec, recordCtx, out);
        mergedRecords.set(key, result.merged);
        rebasedRecords.set(key, result.rebased);
      } else if (b && m && !t) {
        if (!same(m, b)) {
          out.clashes.push({ kind: "deleted-by-them", list: ctx.list, key, parent: ctx.parent || null, mine: m });
          rebasedRecords.set(key, m);
        }
      } else if (b && !m && t) {
        if (!same(t, b)) {
          out.clashes.push({ kind: "deleted-by-me", list: ctx.list, key, parent: ctx.parent || null, theirs: t });
          mergedRecords.set(key, t);
        }
      } else if (!b && m) {
        mergedRecords.set(key, m);
        rebasedRecords.set(key, m);
      } else if (!b && t) {
        mergedRecords.set(key, t);
        rebasedRecords.set(key, t);
      }
    }
    const mergedOrder = orderKeys(new Set(mergedRecords.keys()), baseKeys, mineKeys, theirsKeys, ctx.list, out, true);
    const rebasedOrder = orderKeys(new Set(rebasedRecords.keys()), baseKeys, mineKeys, theirsKeys, ctx.list, out, false);
    return {
      merged: mergedOrder.map((key) => mergedRecords.get(key)),
      rebased: rebasedOrder.map((key) => rebasedRecords.get(key))
    };
  }

  // -> { merged, rebased, clashes, notes }. merged keeps theirs where we clash (what the server would hold if mine were
  // dropped); rebased keeps mine there (what saving again means). Both carry theirs' stamp. Inputs are not mutated.
  function merge3(base, mine, theirs, schema) {
    const out = { clashes: [], notes: [] };
    const result = mergeFields(base, mine, theirs, schema || {}, {}, out);
    const stamp = {};
    STAMP_KEYS.forEach((key) => {
      if (isRecord(theirs) && theirs[key] !== undefined) stamp[key] = theirs[key];
    });
    return {
      merged: JSON.parse(JSON.stringify({ ...result.merged, ...stamp })),
      rebased: JSON.parse(JSON.stringify({ ...result.rebased, ...stamp })),
      clashes: out.clashes,
      notes: out.notes
    };
  }

  // The fields of one record both sides changed: { field: theirs value }.
  function clashFields(clashes, list, key) {
    const fields = {};
    (clashes || []).forEach((clash) => {
      if (clash.kind === "field" && clash.list === (list || null) && clash.key === (key === undefined ? null : key)) {
        fields[clash.field] = clash.theirs;
      }
    });
    return fields;
  }

  // The fields of a record I changed against the copy I started from (stamp and derived fields left out).
  function changedFields(base, mine, skip) {
    const b = isRecord(base) ? base : {};
    const m = isRecord(mine) ? mine : {};
    const ignore = new Set([...SERVER_KEYS, ...(skip || [])]);
    return [...new Set([...Object.keys(b), ...Object.keys(m)])].filter((field) => !ignore.has(field) && !same(b[field], m[field]));
  }

  // A copy run through a page's normaliser, keeping its stamp (some normalisers rebuild the object without it).
  function normalized(copy, normalize) {
    if (typeof normalize !== "function" || !isRecord(copy)) return copy;
    const stamp = {};
    STAMP_KEYS.forEach((key) => {
      if (copy[key] !== undefined) stamp[key] = copy[key];
    });
    return { ...normalize(JSON.parse(JSON.stringify(copy))), ...stamp };
  }

  // Runs one save: send(data, baseRevision) resolves with the saved copy or throws the api error (status, payload).
  // A 409 {code:"revision", data} is merged and sent again (MAX_ROUNDS in all); a clash stops and is returned.
  // normalize (optional): the page's normaliser, run on base and theirs so its defaults are not taken for changes.
  async function saveWithRebase({ send, base, mine, schema, normalize, maxRounds = MAX_ROUNDS }) {
    let currentBase = normalized(base, normalize);
    let payload = mine;
    let mergedWith = null;
    const notes = [];
    for (let round = 1; ; round += 1) {
      try {
        const saved = await send(payload, revisionOf(currentBase));
        return { ok: true, saved, mergedWith, notes };
      } catch (error) {
        const body = error && error.status === 409 && error.payload && error.payload.code === "revision" ? error.payload : null;
        if (!body || !isRecord(body.data) || round >= maxRounds) {
          throw error;
        }
        const who = { savedBy: body.saved_by || "", savedAt: body.saved_at || "" };
        const theirs = normalized(body.data, normalize);
        const result = merge3(currentBase, payload, theirs, schema);
        if (result.clashes.length) {
          return { ok: false, clashes: result.clashes, theirs, merged: result.merged, rebased: result.rebased, notes: notes.concat(result.notes), ...who };
        }
        mergedWith = who;
        notes.push(...result.notes);
        currentBase = theirs;
        payload = result.merged;
      }
    }
  }

  // A queued save's merge base. Its copy was taken when it was queued; if the save before it ended in a merge or a
  // clash, the base has since taken in someone else's change that copy lacks, so the base from queue time must stay
  // (the server then answers 409 and the merge keeps their change). After a clean save of my own, the latest base is
  // right.
  function queuedBase(previous, atQueue, latest) {
    const clean = !previous || (previous.ok === true && !previous.mergedWith);
    return clean ? latest : atQueue;
  }

  function departmentLabel(savedBy) {
    return DEPARTMENT_LABELS[savedBy] || "Someone";
  }

  // 24-hour time; the day too when it is not today.
  function timeLabel(savedAt, now) {
    const date = new Date(savedAt);
    if (!savedAt || Number.isNaN(date.getTime())) return "";
    const today = now instanceof Date ? now : new Date();
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    return sameDay ? time : `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}, ${time}`;
  }

  // "Hotel's change from 14:02"
  function whoLabel(savedBy, savedAt, now) {
    const when = timeLabel(savedAt, now);
    return `${departmentLabel(savedBy)}'s change${when ? ` from ${when}` : ""}`;
  }

  // The status line after a save that merged someone else's change.
  function savedStatus(message, result, now) {
    if (!result || !result.mergedWith) return message;
    const replaced = (result.notes || []).some((note) => note.kind === "order-replaced");
    return `${message} · merged with ${whoLabel(result.mergedWith.savedBy, result.mergedWith.savedAt, now)}${replaced ? " · the other order was replaced" : ""}`;
  }

  // One short line for "↳ Hotel wrote: …".
  function valueSummary(value) {
    const cut = (text) => (text.length > 80 ? `${text.slice(0, 79)}…` : text);
    if (value === undefined || value === null || value === "") return "(empty)";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return cut(value.trim() || "(empty)");
    if (Array.isArray(value)) {
      if (!value.length) return "(none)";
      const names = value.map((item) => (isRecord(item) ? (item.name || item.title || item.stock_id || "") : String(item))).filter(Boolean);
      return cut(`${value.length} item${value.length === 1 ? "" : "s"}${names.length ? `: ${names.join(", ")}` : ""}`);
    }
    if (isRecord(value)) {
      return cut(Object.values(value).filter((item) => typeof item === "string" || typeof item === "number").join(", ") || "(empty)");
    }
    return cut(String(value));
  }

  // "<prefix>-" and 8 base-36 characters (the server's lib/record-ids.js format), not one already in taken.
  function newId(prefix, taken) {
    const used = taken instanceof Set ? taken : new Set();
    const random = (typeof crypto !== "undefined" && crypto.getRandomValues)
      ? () => crypto.getRandomValues(new Uint32Array(1))[0] % ID_ALPHABET.length
      : () => Math.floor(Math.random() * ID_ALPHABET.length);
    for (;;) {
      let tail = "";
      for (let i = 0; i < 8; i += 1) tail += ID_ALPHABET[random()];
      const id = `${prefix}-${tail}`;
      if (!used.has(id)) return id;
    }
  }

  // Mirror of the server's recordIds.withSlotIds: a guest without an id gets g-slot-<position>, past taken ids.
  function withSlotIds(guests) {
    if (!Array.isArray(guests)) return [];
    const idOf = (guest) => (isRecord(guest) && typeof guest.id === "string" ? guest.id.trim() : "");
    const taken = new Set(guests.map(idOf).filter(Boolean));
    return guests.map((guest, index) => {
      if (!isRecord(guest) || idOf(guest)) return guest;
      let n = index + 1;
      while (taken.has(`g-slot-${n}`)) n += 1;
      taken.add(`g-slot-${n}`);
      return { ...guest, id: `g-slot-${n}` };
    });
  }

  return {
    STAMP_KEYS, SCHEMAS, same, revisionOf, merge3, clashFields, changedFields, saveWithRebase, queuedBase, departmentLabel, timeLabel,
    whoLabel, savedStatus, valueSummary, newId, withSlotIds
  };
});
