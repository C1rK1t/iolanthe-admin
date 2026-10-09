# Vessel tab V3: Charter Admin on-request cabins and Hotel → Guests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish spec V (`docs/vessel/spec-v-vessel-tab.md` §4.3–4.4): Charter Admin switches the on-request cabins per charter (with a capacity line and warnings), and Hotel → Guests picks cabins from the vessel record by id, with counts per cabin, a cabin strip and flags on the rows. The selections-based cabin code goes.

**Architecture:** `vessel-core.js` gains the charter and guest logic (offered cabins, capacity, occupancy states, picker options, names, flags, and the server's legacy-name and on-request rules). `admin.js` keeps the vessel record in `state.vessel` (loaded at sign-in and whenever Charter Admin or Hotel → Guests opens), stores guests' `cabin_id`, adds the switches to the Charter Admin form (read by `readCharterInfoForm`, so the page's existing save and dirty tracking carry them), and draws the strip and flags in `drawGuestEditors` / `guestRowElement`.

**Tech Stack:** Plain HTML/CSS/JS (no build, no npm), `node:test`.

**Depends on:** V1 (server routes, guests by `cabin_id`, `cabins_on_request`) and V2 (`vessel-core.js`, `state.vessel`, the Vessel tab). Released together with them, server first.

**Repo and worktree:** `portal/iolanthe-admin`, branch `feat/vessel-v3` stacked on `feat/vessel-v2`, worktree
`S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/vessel-v3/iolanthe-admin`. The PR's base is `feat/vessel-v2`;
retarget it to `main` once V2 merges.

```bash
git -C "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin" fetch origin
git -C "S:/Users/David/OneDrive/Maker Space/GitHub/portal/iolanthe-admin" worktree add -b feat/vessel-v3 "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/vessel-v3/iolanthe-admin" origin/feat/vessel-v2
```

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `vessel-core.js` | modify | charter / guest logic for cabins |
| `test/vessel-core.test.js` | modify | its tests |
| `admin.js` | modify | vessel record loading, guests by `cabin_id`, selections without cabins, the guest dialog's cabin picker, the cabin strip and row flags, Charter Admin switches and capacity |
| `admin.css` | modify | strip, flags and switches |
| `index.html` | modify | bump every `?v=` |
| `CLAUDE.md` | modify | the guest and Charter Admin changes, test count |

---

### Task 1: `vessel-core.js`: charters and guests

**Files:**
- Modify: `vessel-core.js`
- Test: `test/vessel-core.test.js`

- [ ] **Step 1: Append the failing tests** (they use the `SEVEN` cabins already defined in this file by V2)

```js
test("offeredCabins: standard cabins plus the switched-on extras, standard first", () => {
  assert.deepEqual(core.offeredCabins(SEVEN, ["saloon"]).map(cabin => cabin.id),
    ["state-room", "starboard-vip", "port-vip", "port-twin", "starboard-twin", "saloon"]);
  assert.equal(core.offeredCabins(SEVEN, []).length, 5);
});

test("charterCapacity and capacityLine", () => {
  const capacity = core.charterCapacity(SEVEN, ["saloon"]);
  assert.deepEqual(capacity, { standardCount: 5, onRequestCount: 1, berths: 10, max: 11 });
  assert.equal(core.capacityLine(capacity), "5 standard + 1 on request · 10 berths, max 11");
  assert.equal(core.capacityLine(core.charterCapacity(SEVEN.slice(0, 1), [])), "1 standard · 2 berths");
});

test("cabinOccupancy counts active guests per offered cabin and sorts out the rest", () => {
  const guests = [
    { cabin_id: "port-twin" }, { cabin_id: "port-twin" }, { cabin_id: "port-twin" },
    { cabin_id: "state-room" }, { cabin_id: "state-room" }, { cabin_id: "state-room" },
    { cabin_id: "" },
    { cabin_id: "bridge-deck-cabin" },
    { cabin_id: "gone" }
  ];
  const occupancy = core.cabinOccupancy(SEVEN, ["saloon"], guests);
  assert.deepEqual(occupancy.cabins.map(entry => [entry.id, entry.count, entry.state]), [
    ["state-room", 3, "over"],
    ["starboard-vip", 0, "ok"],
    ["port-vip", 0, "ok"],
    ["port-twin", 3, "extra"],
    ["starboard-twin", 0, "ok"],
    ["saloon", 0, "ok"]
  ]);
  assert.equal(occupancy.noCabin, 1);
  assert.deepEqual(occupancy.notOn, ["bridge-deck-cabin"]);
  assert.deepEqual(occupancy.removed, ["gone"]);
});

test("occupancyLabel", () => {
  assert.equal(core.occupancyLabel({ name: "Port Twin", count: 3, berths: 2, extra_berths: 1 }), "Port Twin 3/2 +1");
  assert.equal(core.occupancyLabel({ name: "Port VIP", count: 1, berths: 2, extra_berths: 0 }), "Port VIP 1/2");
  assert.equal(core.occupancyLabel({ name: "Starboard Twin", count: 0, berths: null, extra_berths: 0 }), "Starboard Twin 0");
});

test("cabinPickerOptions: no cabin, the offered cabins with counts, and a guest's cabin that isn't offered", () => {
  const guests = [{ cabin_id: "port-vip" }, { cabin_id: "bridge-deck-cabin" }];
  assert.deepEqual(core.cabinPickerOptions(SEVEN, [], guests, "bridge-deck-cabin").map(option => option.label), [
    "No cabin",
    "State Room (0/2)",
    "Starboard VIP (0/2)",
    "Port VIP (1/2)",
    "Port Twin (0/2 +1)",
    "Starboard Twin (0)",
    "Bridge Deck Cabin (not on for this charter)"
  ]);
  assert.equal(core.cabinPickerOptions(SEVEN, [], [], "gone").pop().label, "Removed cabin");
  assert.deepEqual(core.cabinPickerOptions(SEVEN, [], [], "")[0], { value: "", label: "No cabin" });
});

test("cabinNameFor and guestCabinFlag", () => {
  assert.equal(core.cabinNameFor(SEVEN, "port-vip"), "Port VIP");
  assert.equal(core.cabinNameFor(SEVEN, ""), "");
  assert.equal(core.cabinNameFor(SEVEN, "gone"), "Removed cabin");
  const guests = [{ cabin_id: "state-room" }, { cabin_id: "state-room" }, { cabin_id: "state-room" }, { cabin_id: "saloon" }, { cabin_id: "gone" }];
  const occupancy = core.cabinOccupancy(SEVEN, [], guests);
  assert.equal(core.guestCabinFlag(guests[0], occupancy), "over");
  assert.equal(core.guestCabinFlag(guests[3], occupancy), "not-on");
  assert.equal(core.guestCabinFlag(guests[4], occupancy), "removed");
  assert.equal(core.guestCabinFlag({ cabin_id: "port-vip" }, occupancy), "");
  assert.equal(core.guestCabinFlag({ cabin_id: "state-room", active: false }, occupancy), "");
});

test("legacy names and on-request ids follow the server's rules", () => {
  assert.equal(core.isNoCabinName(" N/A "), true);
  assert.equal(core.cabinIdForLegacyName(" port vip ", SEVEN), "port-vip");
  assert.equal(core.cabinIdForLegacyName("N/A", SEVEN), "");
  assert.equal(core.cabinIdForLegacyName("Starboard", SEVEN), "");
  assert.deepEqual(core.normalizeCabinsOnRequest(["saloon", "state-room", "saloon"], SEVEN), ["saloon"]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/vessel-core.test.js`
Expected: FAIL with `core.offeredCabins is not a function`.

- [ ] **Step 3: Add the functions** to `vessel-core.js` (before `return {`), and add `isNoCabinName, cabinIdForLegacyName, normalizeCabinsOnRequest, offeredCabins, charterCapacity, capacityLine, cabinOccupancy, occupancyLabel, cabinPickerOptions, cabinNameFor, guestCabinFlag` to the returned object.

```js
  // ---- Charters and guests (spec V §4.3–4.4) ----

  // The server's rules (lib/vessel.js): "N/A" was the old "no cabin"; old names map to ids; charters keep only
  // ids of on-request cabins.
  function isNoCabinName(name) {
    const value = text(name).toLocaleLowerCase();
    return !value || value === "n/a";
  }

  function cabinIdForLegacyName(name, cabins) {
    if (isNoCabinName(name)) {
      return "";
    }
    const wanted = text(name).toLocaleLowerCase();
    const match = (Array.isArray(cabins) ? cabins : []).find(cabin => text(cabin.name).toLocaleLowerCase() === wanted);
    return match ? match.id : "";
  }

  function normalizeCabinsOnRequest(value, cabins) {
    const onRequest = new Set((Array.isArray(cabins) ? cabins : []).filter(cabin => cabin.on_request).map(cabin => cabin.id));
    const ids = Array.isArray(value) ? value.map(text).filter(Boolean) : [];
    return [...new Set(ids)].filter(id => onRequest.has(id));
  }

  // What a charter offers its guests: the standard cabins, then the on-request cabins switched on for it.
  function offeredCabins(cabins, cabinsOnRequest) {
    const list = sortCabinsByGroup(cabins);
    const switchedOn = new Set(normalizeCabinsOnRequest(cabinsOnRequest, list));
    return list.filter(cabin => !cabin.on_request || switchedOn.has(cabin.id));
  }

  function charterCapacity(cabins, cabinsOnRequest) {
    const offered = offeredCabins(cabins, cabinsOnRequest);
    const totals = groupTotals(offered);
    return {
      standardCount: offered.filter(cabin => !cabin.on_request).length,
      onRequestCount: offered.filter(cabin => cabin.on_request).length,
      berths: totals.berths,
      max: totals.max
    };
  }

  function capacityLine(capacity) {
    const parts = [`${capacity.standardCount} standard`];
    if (capacity.onRequestCount) {
      parts.push(`${capacity.onRequestCount} on request`);
    }
    const max = capacity.max > capacity.berths ? `, max ${capacity.max}` : "";
    return `${parts.join(" + ")} · ${plural(capacity.berths, "berth", "berths")}${max}`;
  }

  // ok, extra (into the extra berths) or over (past the maximum). A cabin without berths set is never judged.
  function occupancyState(count, cabin) {
    if (!Number.isInteger(cabin.berths)) {
      return "ok";
    }
    const max = cabin.berths + (Number.isInteger(cabin.extra_berths) ? cabin.extra_berths : 0);
    if (count > max) {
      return "over";
    }
    return count > cabin.berths ? "extra" : "ok";
  }

  // guests: the charter's active guests. notOn: cabins that exist but aren't offered; removed: ids no cabin has.
  function cabinOccupancy(cabins, cabinsOnRequest, guests) {
    const list = Array.isArray(cabins) ? cabins : [];
    const offered = offeredCabins(list, cabinsOnRequest);
    const counts = new Map(offered.map(cabin => [cabin.id, 0]));
    let noCabin = 0;
    const notOn = [];
    const removed = [];
    (Array.isArray(guests) ? guests : []).forEach(guest => {
      const id = text(guest && guest.cabin_id);
      if (!id) {
        noCabin += 1;
      } else if (counts.has(id)) {
        counts.set(id, counts.get(id) + 1);
      } else {
        (list.some(cabin => cabin.id === id) ? notOn : removed).push(id);
      }
    });
    return {
      cabins: offered.map(cabin => ({
        id: cabin.id,
        name: cabin.name,
        count: counts.get(cabin.id),
        berths: cabin.berths,
        extra_berths: cabin.extra_berths,
        state: occupancyState(counts.get(cabin.id), cabin)
      })),
      noCabin,
      notOn,
      removed
    };
  }

  function occupancyLabel(entry) {
    if (!Number.isInteger(entry.berths)) {
      return `${entry.name} ${entry.count}`;
    }
    return `${entry.name} ${entry.count}/${entry.berths}${entry.extra_berths > 0 ? ` +${entry.extra_berths}` : ""}`;
  }

  function cabinPickerOptions(cabins, cabinsOnRequest, guests, currentCabinId) {
    const list = Array.isArray(cabins) ? cabins : [];
    const occupancy = cabinOccupancy(list, cabinsOnRequest, guests);
    const options = [{ value: "", label: "No cabin" }].concat(occupancy.cabins.map(entry => {
      const count = Number.isInteger(entry.berths)
        ? `${entry.count}/${entry.berths}${entry.extra_berths > 0 ? ` +${entry.extra_berths}` : ""}`
        : String(entry.count);
      return { value: entry.id, label: `${entry.name} (${count})` };
    }));
    const current = text(currentCabinId);
    if (current && !options.some(option => option.value === current)) {
      const known = list.find(cabin => cabin.id === current);
      options.push({ value: current, label: known ? `${known.name} (not on for this charter)` : "Removed cabin" });
    }
    return options;
  }

  function cabinNameFor(cabins, cabinId) {
    const id = text(cabinId);
    if (!id) {
      return "";
    }
    const known = (Array.isArray(cabins) ? cabins : []).find(cabin => cabin.id === id);
    return known ? known.name : "Removed cabin";
  }

  // The flag on an active guest's cabin tag: "" | "over" | "not-on" | "removed".
  function guestCabinFlag(guest, occupancy) {
    const id = text(guest && guest.cabin_id);
    if (!id || (guest && guest.active === false)) {
      return "";
    }
    if (occupancy.removed.includes(id)) {
      return "removed";
    }
    if (occupancy.notOn.includes(id)) {
      return "not-on";
    }
    const entry = occupancy.cabins.find(cabin => cabin.id === id);
    return entry && entry.state === "over" ? "over" : "";
  }
```

- [ ] **Step 4: Run them to see them pass**

Run: `node --test test/vessel-core.test.js`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add vessel-core.js test/vessel-core.test.js
git commit -m "feat(admin): vessel-core charter and guest cabin logic (spec V 4.3-4.4)"
```

---

### Task 2: The vessel record for the guest pages and Charter Admin

**Files:**
- Modify: `admin.js` (`loadSelections` neighbourhood, `loadBootstrap`, the Charter section's `Promise.all`, `renderHotel`)

- [ ] **Step 1: Helpers.** Add right after `async function loadSelections() { … }`:

```js
  // Spec V: the vessel record for Charter Admin and the guest pages (Settings → Vessel loads it too).
  async function loadVesselRecord() {
    try {
      const payload = await api("/api/admin/vessel");
      state.vessel = payload && payload.vessel && typeof payload.vessel === "object" ? payload.vessel : null;
    } catch (error) {
      if (!error.loginRequired) {
        setStatus(error.message, "error");
      }
    }
  }

  function vesselCabins() {
    const core = window.IolantheVesselCore;
    return core && state.vessel ? core.normalizeVesselDraft(state.vessel).cabins : [];
  }

  function activeGuestsOf(guestList) {
    return (Array.isArray(guestList && guestList.guests) ? guestList.guests : []).filter(guest => guest && guest.active !== false);
  }
```

- [ ] **Step 2: At sign-in.** In `loadBootstrap`, after `await loadSelections();` add:

```js
      await loadVesselRecord();
```

- [ ] **Step 3: When Charter opens.** In the Charter section's render (the `Promise.all` that loads `loadCharter(selectedCharter)`, `loadSites()`, `loadReservedPeriods()`), add `loadVesselRecord()` as a fourth entry:

```js
      const [bundle, siteLibrary] = await Promise.all([
        loadCharter(selectedCharter),
        loadSites(),
        loadReservedPeriods(),
        loadVesselRecord()
      ]);
```

- [ ] **Step 4: When Hotel → Guests opens.** In `renderHotel`, right after the line `const guestList = normalizeGuestListForCount(bundle["guest_list.json"], charterInfo.guest_count);`, add:

```js
      if (activePanel === "guests") {
        await loadVesselRecord();
      }
```

- [ ] **Step 5: Check**

Run: `node --check admin.js` then `node --test`
Expected: no syntax output; all pass (203: 196 + 7). The refused-access sandbox's signed-in boot gets `{}` from `/api/admin/vessel` and leaves `state.vessel` null.

- [ ] **Step 6: Commit**

```bash
git add admin.js
git commit -m "feat(admin): load the vessel record at sign-in and on Charter / Hotel guests"
```

---

### Task 3: Guests store `cabin_id`; selections lose cabins

**Files:**
- Modify: `admin.js` (`normalizeSelections`, the default guest, `normalizeGuestRecord`, `GUEST_SELECT_FIELD_CONFIG`, `getSuggestionList`, `guestFieldLabel`)

- [ ] **Step 1: `normalizeSelections`.** Remove `"cabins", ` from the `keys` array, and replace

```js
        const values = Array.isArray(source[key] || (key === "cabins" ? source.cabin_assignments : null))
          ? (source[key] || source.cabin_assignments).map(item => String(item || "").trim()).filter(Boolean)
          : [];
```

with

```js
        const values = Array.isArray(source[key])
          ? source[key].map(item => String(item || "").trim()).filter(Boolean)
          : [];
```

- [ ] **Step 2: The default guest.** Replace `      cabin: "N/A",` (the blank guest object) with `      cabin_id: "",`.

- [ ] **Step 3: `normalizeGuestRecord`.** Replace

```js
    const cabin = defaultSelection(typeof source.cabin === "string" ? source.cabin : (typeof source.cabin_assignment === "string" ? source.cabin_assignment : ""));
```

with

```js
    // Spec V §2.2: guests store a cabin id; an old-style name maps to its id.
    const core = window.IolantheVesselCore;
    const legacyCabin = typeof source.cabin === "string" ? source.cabin : source.cabin_assignment;
    const cabinId = typeof source.cabin_id === "string"
      ? source.cabin_id.trim()
      : (core ? core.cabinIdForLegacyName(legacyCabin, vesselCabins()) : "");
```

In the `normalized` object replace `cabin,` with `cabin_id: cabinId,`, and next to `delete normalized.cabin_assignment;` add `delete normalized.cabin;`.

- [ ] **Step 4: The select config and suggestions.** Delete the `cabin: { selectionKey: "cabins", placeholder: "Select cabin..." },` line from `GUEST_SELECT_FIELD_CONFIG`, and delete from `getSuggestionList`:

```js
    if (typeOrFieldName === "cabin" || typeOrFieldName === "cabin_assignment") {
      return guestSelectionLibraryValues("cabin");
    }
```

- [ ] **Step 5: The field label.** In `guestFieldLabel`'s `labels`, add `cabin_id: "Cabin",` after `cabin: "Cabin",`.

- [ ] **Step 6: Check**

Run: `node --check admin.js` then `node --test`
Expected: no syntax output; 203 pass.

- [ ] **Step 7: Commit**

```bash
git add admin.js
git commit -m "feat(admin): guests store cabin_id; selections no longer carry cabins"
```

---

### Task 4: The guest dialog's cabin picker

**Files:**
- Modify: `admin.js` (new helper before `openGuestEditModal`; three edits inside it)

- [ ] **Step 1: The helper.** Add right before `function openGuestEditModal(`:

```js
  // Spec V §4.4: the standard cabins and this charter's switched-on extras, with counts; the guest's own cabin stays
  // in the list when it isn't offered any more.
  function guestCabinSelectHtml(guestList, charterInfo, currentCabinId, extraAttributes = "") {
    const options = window.IolantheVesselCore.cabinPickerOptions(
      vesselCabins(),
      charterInfo && charterInfo.cabins_on_request,
      activeGuestsOf(guestList),
      currentCabinId
    );
    return `<select id="guest-edit-cabin"${extraAttributes}>
      ${options.map(option => `<option value="${escapeAttribute(option.value)}"${option.value === currentCabinId ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
    </select>`;
  }
```

- [ ] **Step 2: Use it.** In `openGuestEditModal`, replace

```js
          ${renderGuestSelectionSelect("guest-edit-cabin", "cabin", draft.cabin || "", settings.readOnlyName ? " data-autofocus" : "")}
```

with

```js
          ${guestCabinSelectHtml(guestList, settings.charterInfo, draft.cabin_id || "", settings.readOnlyName ? " data-autofocus" : "")}
```

- [ ] **Step 3: Drop the legacy binding.** Delete the line

```js
    bindGuestLegacySelection(modal.querySelector("#guest-edit-cabin"), "cabin", draft.cabin);
```

- [ ] **Step 4: Save the id.** In the submit handler's `normalizeGuestRecord({ … })`, replace

```js
        cabin: modal.querySelector("#guest-edit-cabin").value,
```

with

```js
        cabin_id: modal.querySelector("#guest-edit-cabin").value,
```

- [ ] **Step 5: Check**

Run: `node --check admin.js` then `node --test`
Expected: no syntax output; 203 pass.

- [ ] **Step 6: Commit**

```bash
git add admin.js
git commit -m "feat(admin): the guest dialog picks a cabin from the vessel record"
```

---

### Task 5: Cabin strip and row flags on Hotel → Guests

**Files:**
- Modify: `admin.js` (`drawGuestEditors`, `guestRowElement`; a new helper)

- [ ] **Step 1: The strip helper.** Add right before `function drawGuestEditors(`:

```js
  // Spec V §4.4: one chip per offered cabin (count / berths), no-cabin count, and guests in a cabin that isn't on.
  function guestCabinStripHtml(occupancy) {
    const core = window.IolantheVesselCore;
    const stray = occupancy.notOn.length + occupancy.removed.length;
    return `
      <div class="guest-cabin-strip" aria-label="Cabins">
        ${occupancy.cabins.map(entry => `<span class="status-pill guest-cabin-chip is-${escapeAttribute(entry.state)}"${entry.state === "over" ? ` title="More guests than this cabin's maximum"` : ""}>${escapeHtml(core.occupancyLabel(entry))}</span>`).join("")}
        <span class="status-pill guest-cabin-chip">No cabin: ${escapeHtml(String(occupancy.noCabin))}</span>
        ${stray ? `<span class="status-pill guest-cabin-chip is-not-on">${escapeHtml(String(stray))} in a cabin that isn't on for this charter</span>` : ""}
      </div>
    `;
  }
```

- [ ] **Step 2: `drawGuestEditors`.** After the line `container.innerHTML = "";` (the one right after `guestList.guests = sortAndEnsurePrincipalGuests(…)`), add:

```js
    const cabins = vesselCabins();
    settings.cabinOccupancy = window.IolantheVesselCore.cabinOccupancy(
      cabins,
      settings.charterInfo && settings.charterInfo.cabins_on_request,
      activeGuestsOf(guestList)
    );
    if (settings.charterInfo && cabins.length && guestList.guests.length) {
      container.insertAdjacentHTML("beforeend", guestCabinStripHtml(settings.cabinOccupancy));
    }
```

(The drag list selects `:scope > .guest-row.is-movable`, so the strip doesn't join it.)

- [ ] **Step 3: `guestRowElement`.** Replace

```js
    const cabin = meaningfulGuestText(guestAdminFieldText(guest.cabin));
```

with

```js
    const core = window.IolantheVesselCore;
    const cabin = core.cabinNameFor(vesselCabins(), guest.cabin_id);
    const cabinFlag = settings.cabinOccupancy ? core.guestCabinFlag(guest, settings.cabinOccupancy) : "";
    const cabinFlagTitle = { over: "More guests than this cabin's maximum", "not-on": "This cabin isn't on for this charter", removed: "This cabin was removed" }[cabinFlag] || "";
```

and replace the cabin tag

```js
      <span class="guest-cabin${cabin ? "" : " is-empty"}">${cabin ? escapeHtml(cabin) : ""}</span>
```

with

```js
      <span class="guest-cabin${cabin ? "" : " is-empty"}${cabinFlag ? ` is-${cabinFlag}` : ""}"${cabinFlagTitle ? ` title="${escapeAttribute(cabinFlagTitle)}"` : ""}>${cabin ? escapeHtml(cabin) : ""}</span>
```

- [ ] **Step 4: Check**

Run: `node --check admin.js` then `node --test`
Expected: no syntax output; 203 pass.

- [ ] **Step 5: Commit**

```bash
git add admin.js
git commit -m "feat(admin): cabin strip and cabin flags on Hotel → Guests"
```

---

### Task 6: Charter Admin: on-request switches and capacity

**Files:**
- Modify: `admin.js` (new helpers before `renderCharterInfoPanel`; `renderCharterInfoPanel`, `readCharterInfoForm`, `bindCharterInfoPanel`)

- [ ] **Step 1: Helpers.** Add right before `function renderCharterInfoPanel(`:

```js
  // Spec V §4.3: the capacity line and, when the vessel has any, one switch per on-request cabin.
  function charterCabinsHtml(charterInfo) {
    const core = window.IolantheVesselCore;
    const cabins = vesselCabins();
    if (!core || !cabins.length) {
      return "";
    }
    const onRequest = cabins.filter(cabin => cabin.on_request);
    const switchedOn = core.normalizeCabinsOnRequest(charterInfo.cabins_on_request, cabins);
    return `
      <div class="full charter-cabins">
        <p class="charter-cabins-capacity" id="charter-info-cabin-capacity"></p>
        ${onRequest.length ? `
          <fieldset class="charter-cabins-on-request">
            <legend>Cabins on request</legend>
            ${onRequest.map(cabin => `
              <label class="switch-row">
                <input type="checkbox" data-cabin-on-request="${escapeAttribute(cabin.id)}"${switchedOn.includes(cabin.id) ? " checked" : ""}>
                <span>${escapeHtml(cabin.name)}${Number.isInteger(cabin.berths) ? ` · +${escapeHtml(String(cabin.berths))} berth${cabin.berths === 1 ? "" : "s"}` : ""}</span>
              </label>
            `).join("")}
            <p class="muted" id="charter-info-cabin-note"></p>
          </fieldset>
        ` : ""}
      </div>
    `;
  }

  function checkedCabinsOnRequest() {
    return [...document.querySelectorAll("[data-cabin-on-request]")]
      .filter(input => input.checked)
      .map(input => input.dataset.cabinOnRequest);
  }

  function syncCharterCabins() {
    const core = window.IolantheVesselCore;
    const line = document.getElementById("charter-info-cabin-capacity");
    if (!core || !line) {
      return;
    }
    const cabins = vesselCabins();
    const switchedOn = checkedCabinsOnRequest();
    const capacity = core.charterCapacity(cabins, switchedOn);
    const guestCount = normalizeGuestCount(document.getElementById("charter-info-guest-count")?.value);
    const over = capacity.max > 0 && guestCount > capacity.max;
    line.innerHTML = `Cabins: ${escapeHtml(core.capacityLine(capacity))}${over ? ` <span class="status-pill status-pill--none">${escapeHtml(String(guestCount))} guests, max ${escapeHtml(String(capacity.max))}</span>` : ""}`;
    const note = document.getElementById("charter-info-cabin-note");
    if (note) {
      const bundleGuests = state.bundle && state.bundle["guest_list.json"];
      const guests = activeGuestsOf({ guests: (bundleGuests && Array.isArray(bundleGuests.guests) ? bundleGuests.guests : []).map(normalizeGuestRecord) });
      note.textContent = cabins
        .filter(cabin => cabin.on_request && !switchedOn.includes(cabin.id))
        .map(cabin => ({ cabin, count: guests.filter(guest => guest.cabin_id === cabin.id).length }))
        .filter(entry => entry.count)
        .map(entry => `${entry.count} guest${entry.count === 1 ? " is" : "s are"} in the ${entry.cabin.name}.`)
        .join(" ");
    }
  }
```

- [ ] **Step 2: Render it.** In `renderCharterInfoPanel`, right after the `charter-info-diving-guest-count` field line (the last field in that `form-grid`), add:

```js
                ${charterCabinsHtml(charterInfo)}
```

- [ ] **Step 3: Read it.** In `readCharterInfoForm`'s returned object, after `guest_count: normalizeGuestCount(value("charter-info-guest-count"))`, add (with a comma after the previous line):

```js
      cabins_on_request: checkedCabinsOnRequest()
```

- [ ] **Step 4: Keep it in sync.** In `bindCharterInfoPanel`, at the end of the `syncTiles` arrow function add `syncCharterCabins();`, and right after `syncCharterInfoOverlap();` (the call that follows `form.addEventListener("input", syncTiles);`) add:

```js
    syncCharterCabins();
```

- [ ] **Step 5: Check**

Run: `node --check admin.js` then `node --test`
Expected: no syntax output; 203 pass.

- [ ] **Step 6: Commit**

```bash
git add admin.js
git commit -m "feat(admin): Charter Admin switches on-request cabins and shows capacity"
```

---

### Task 7: Styles, asset versions, CLAUDE.md

**Files:**
- Modify: `admin.css`, `index.html`, `CLAUDE.md`

- [ ] **Step 1: Styles.** After the existing `.guest-cabin.is-empty { … }` rule in `admin.css`, add:

```css
/* Spec V: cabin flags on Hotel → Guests rows, the cabin strip, and Charter Admin's on-request switches */
.guest-cabin.is-over {
  background: #f7e3e1;
  color: var(--danger);
}

.guest-cabin.is-not-on,
.guest-cabin.is-removed {
  background: var(--warn-bg);
  color: var(--warn);
}

.guest-cabin-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 0.6rem;
}

.guest-cabin-chip {
  text-transform: none;
  letter-spacing: 0;
}

.guest-cabin-chip.is-extra {
  background: #d9e8ea;
  color: var(--accent-dark);
}

.guest-cabin-chip.is-over {
  background: #f7e3e1;
  color: var(--danger);
}

.guest-cabin-chip.is-not-on {
  background: var(--warn-bg);
  color: var(--warn);
}

.charter-cabins-capacity {
  margin: 0;
  color: var(--muted);
}

.charter-cabins-on-request {
  display: grid;
  gap: 0.3rem;
  margin: 0.4rem 0 0;
  border: 0;
  padding: 0;
}

.charter-cabins-on-request legend {
  margin-bottom: 0.3rem;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

- [ ] **Step 2: Asset versions.**

```bash
sed -i 's/?v=[a-z0-9-]*/?v=admin-vessel-v3/g' index.html
grep -o '?v=[a-z0-9-]*' index.html | sort | uniq -c
```

Expected: `32 ?v=admin-vessel-v3`.

- [ ] **Step 3: CLAUDE.md.** Extend the `vessel-core.js` bullet (added by V2) with:

```markdown
  Guests store `cabin_id` (spec V); Hotel → Guests picks from the standard cabins plus the charter's switched-on extras
  (`cabinPickerOptions`, counts like "Port VIP (1/2)"), shows a cabin strip (`cabinOccupancy`: within berths, into the
  extra berths, over the maximum) and flags rows whose cabin is over full, not on for the charter, or removed. Charter
  Admin switches the on-request cabins per charter (`charter.json.cabins_on_request`, read by `readCharterInfoForm`)
  under a capacity line. `state.vessel` is loaded at sign-in and whenever Charter or Hotel → Guests opens; the
  selections no longer carry cabins.
```

and update the test count to what `node --test` prints (203).

- [ ] **Step 4: Run the tests**

Run: `node --test`
Expected: 203 pass.

- [ ] **Step 5: Commit**

```bash
git add admin.css index.html CLAUDE.md
git commit -m "feat(admin): guest cabin styles, asset versions, docs"
```

---

### Task 8: Browser checks

Same scratch server as V2 Task 10 (V1 server branch, `worktrees/vessel/data-scratch-v`), with the launch entry's
`ADMIN_STATIC_DIR` pointed at `worktrees/vessel-v3/iolanthe-admin`. Signed in on `vessel.localhost:8023`. The vessel
record should hold the seven cabins saved in V2 Task 10 (five standard with berths, Bridge Deck Cabin and Saloon on
request).

- [ ] **Step 1: Charter Admin.** Open an upcoming charter's Charter Admin: under Guests a line "Cabins: 5 standard ·
  N berths…", and "Cabins on request" with Bridge Deck Cabin and Saloon switches. Switch Saloon on: the line reads
  "5 standard + 1 on request · …". Raise Guests above the maximum: a red pill "N guests, max M". Save (the page's tick);
  reload: the switch is still on. `GET /api/admin/charter/<id>` shows `cabins_on_request: ["saloon"]`.
- [ ] **Step 2: Hotel → Guests picker.** Open Hotel → Guests for that charter: the strip shows one chip per offered
  cabin (Saloon included) and "No cabin: N". Edit a guest: the Cabin select lists "No cabin", then the cabins with
  counts, Saloon last. Pick Port Twin and save: the row's tag reads Port Twin; the strip's Port Twin chip counts it;
  `GET /api/admin/charter/<id>` shows the guest's `cabin_id: "port-twin"` and no `cabin`.
- [ ] **Step 3: States.** Put guests into Port Twin until its count passes the berths (chip turns the quiet "extra"
  colour) and then the maximum (chip and the rows' tags turn red, with a title). Switch Saloon off in Charter Admin while
  a guest is in it: the note "1 guest is in the Saloon." appears; save; back on Hotel → Guests the guest's tag is amber
  and the strip says "1 in a cabin that isn't on for this charter"; the guest's dialog lists "Saloon (not on for this
  charter)" and keeps it selected.
- [ ] **Step 4: Other pages.** Galley → Guests and the Charter Pack open without errors; the guest site
  (`/api/charter`) still has no `cabins` in `vessel`.
- [ ] **Step 5: Phone width.** At 375 px the strip wraps, the Charter Admin switches stack, nothing scrolls sideways.
  Reset to desktop.
- [ ] **Step 6:** No console errors on any of these pages. Screenshot Hotel → Guests with the strip for the PR.

### Task 9: Review and PR

- [ ] **Step 1:** `node --test` passes; `node --check admin.js` is silent.
- [ ] **Step 2:** Run a code-review agent on the V3 diff against `feat/vessel-v2` (model sonnet); apply what holds up.
- [ ] **Step 3:** Push and open the PR with base `feat/vessel-v2` (`feat(admin): on-request cabins and guest cabins
  (spec V, V3)`), screenshot attached; say it ships with the server's V1 and the admin's V2, server first, and that the
  base moves to `main` once V2 merges. Don't merge without David's word.
- [ ] **Step 4: Release (on David's word, all three together):** merge the server PR, run `./update.sh` on the boat
  and check its log for `Applied data migration 7: vessel-cabins`; merge V2, retarget V3 to `main`, merge it; within 5
  minutes the admin is live (`?v=admin-vessel-v3`). Then, in Settings → Vessel on the boat: add Bridge Deck Cabin and
  Saloon as on request and fill in decks, layouts and berths for all seven (David, or with him). Mark the backlog's
  "NEXT UP: Settings → Vessel tab" entry done (`docs/BACKLOG.md`) and remove the scratch worktrees, data and launch
  entry.
