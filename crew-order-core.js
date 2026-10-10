// The remembered crew order (captain item 09): the rules the Crew page uses. Pure; also a Node module
// (test/crew-order-core.test.js). A mirror of iolanthe-server's lib/crew-order.js, and both are tested against
// test/fixtures/crew-order-cases.json, so change them together.
//
// The server keeps one ranked list of names per department in library/crew-order.json, shared by every charter:
//   { revision, saved_by, saved_at, departments: { "interior": ["san san", "paul"], ... }[, damaged] }
// A member is found by name (trimmed, inner spaces collapsed, lower-cased, as the crew import finds a duplicate), because
// crew ids belong to one charter.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.IolantheCrewOrder = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  // Trimmed, inner runs of white space collapsed to one space, lower-cased. "" for anything that is not text.
  function keyOf(text) {
    return typeof text === "string" ? text.trim().replace(/\s+/g, " ").toLocaleLowerCase() : "";
  }

  function nameKey(member) {
    return keyOf(isRecord(member) ? member.name : "");
  }

  function departmentKey(member) {
    return keyOf(isRecord(member) ? member.department : "");
  }

  // The list stored for a department, [] when it has none. Own properties only: a department called "constructor" or
  // "__proto__" is an ordinary name.
  function listFor(departments, key) {
    return isRecord(departments) && Object.prototype.hasOwnProperty.call(departments, key) && Array.isArray(departments[key])
      ? departments[key]
      : [];
  }

  // A copy of a served crew order (GET /api/admin/crew-order) that is safe to keep and change: the stamp, the departments
  // (names through keyOf, bad entries dropped) and the server's `damaged` marker when it sent one. Never throws.
  function normalizeOrder(served) {
    const source = isRecord(served) ? served : {};
    const departments = {};
    if (isRecord(source.departments)) {
      Object.entries(source.departments).forEach(([rawKey, rawList]) => {
        if (!Array.isArray(rawList)) {
          return;
        }
        const key = keyOf(rawKey);
        const names = Object.prototype.hasOwnProperty.call(departments, key) ? departments[key] : [];
        rawList.forEach(rawName => {
          const name = keyOf(rawName);
          if (name && !names.includes(name)) {
            names.push(name);
          }
        });
        Object.defineProperty(departments, key, { value: names, enumerable: true, writable: true, configurable: true });
      });
      Object.keys(departments).forEach(key => {
        if (!departments[key].length) {
          delete departments[key];
        }
      });
    }
    const order = {
      revision: Number.isInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
      saved_by: typeof source.saved_by === "string" ? source.saved_by : "",
      saved_at: typeof source.saved_at === "string" ? source.saved_at : "",
      departments
    };
    if (typeof source.damaged === "string" && source.damaged) {
      order.damaged = source.damaged;
    }
    return order;
  }

  // A comparator over { member, index } entries of one department: the names the stored list knows, in its order; then the
  // others by position_order (those with one first, ascending), then by file position.
  function compareWithinDepartment(departments) {
    const ranks = new Map();
    const rankOf = entry => {
      const key = departmentKey(entry.member);
      if (!ranks.has(key)) {
        ranks.set(key, new Map(listFor(departments, key).map((name, at) => [name, at])));
      }
      const at = ranks.get(key).get(nameKey(entry.member));
      return at === undefined ? Infinity : at;
    };
    const orderOf = entry => {
      const order = Number(entry.member.position_order);
      return Number.isInteger(order) && order >= 1 ? order : Infinity;
    };
    return (a, b) => {
      const rankA = rankOf(a);
      const rankB = rankOf(b);
      if (rankA !== rankB) {
        return rankA < rankB ? -1 : 1;
      }
      const orderA = orderOf(a);
      const orderB = orderOf(b);
      if (orderA !== orderB) {
        return orderA < orderB ? -1 : 1;
      }
      return a.index - b.index;
    };
  }

  // The name keys of one department's rows, in the order the page shows them (empty names left out).
  function sequenceOf(members) {
    return (members || []).map(nameKey).filter(Boolean);
  }

  // A drag: sequence is one department's member names in their new order as the page shows them. Returns new departments
  // with that department's list changed. Names the page does not show (other charters' crew) keep their slots, the shown
  // names fill the slots they held in the new order, and names the list did not know join its bottom first.
  function reorderDepartment(departments, key, sequence) {
    const shown = [];
    (Array.isArray(sequence) ? sequence : []).forEach(rawName => {
      const name = keyOf(rawName);
      if (name && !shown.includes(name)) {
        shown.push(name);
      }
    });
    const known = listFor(departments, key).slice();
    shown.forEach(name => {
      if (!known.includes(name)) {
        known.push(name);
      }
    });
    const slots = known.map((name, at) => (shown.includes(name) ? at : -1)).filter(at => at >= 0);
    const result = known.slice();
    slots.forEach((slot, at) => {
      result[slot] = shown[at];
    });
    return { ...(isRecord(departments) ? departments : {}), [key]: result };
  }

  return { keyOf, nameKey, departmentKey, normalizeOrder, compareWithinDepartment, sequenceOf, reorderDepartment };
});
