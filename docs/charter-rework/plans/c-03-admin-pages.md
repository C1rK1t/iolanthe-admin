# Spec C — Plan 3: Admin pages (what people see on a clash)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply [spec-c.md](../spec-c.md) §4 to every page that saves one of the nine protected files: a clash in a
dialog reopens it on their version with my changes on top (mockup B), a whole-page save redraws the same way and stays
unsaved, deleting a record someone changed asks first, records are found by id, and the open page refreshes on tab focus.

**Architecture:** uses plan c-02's helpers only: `recordClash` / `pageClash` build the clash view, `showClashMarks`
draws the amber banner, the teal edge (`.field-mine`) and "↳ Hotel wrote: …" (`.field-theirs`), `showListClash` does
the same for list pages, `confirmDeleteAnyway` asks. Each dialog gets a `clash` argument (the draft comes from
`clash.record`) and a field → input map. Index- and identity-based edits become id-based, because after a merge the
list order can change under a dialog. The freshness check is a `visibilitychange` listener using a raw `fetch` of
`GET /api/admin/revisions` (not `api()`, which would count as session activity).

**Tech Stack:** plain JS, no build, `node --test` (209 tests, unchanged: the page code has no unit tests; the
browser pass covers it).

**Base:** admin `main` at `25c117c` (PR #39 merged 2026-10-09). If `main` has moved past it when this is
built, dry-run the plan again first. **Release order:** server plan c-01 first, this admin straight after (the new
server refuses the old admin's saves, which send no `base_revision`, until the tab reloads the new admin). Plan c-02 is done on the same branch.

**Dry-run (done while planning, for plans c-02 and c-03 together):** the plan text was applied to a `git archive` copy
of `main` at `25c117c`: `node --test` 209/209 and `node --check admin.js` clean. The `?v=` step is a `sed` over every
tag. The result was served by a
scratch server running plan c-01's code on a copy of `data-scratch`, with a Node script playing the other person
(saving through the API with its own Charter or Hotel session). Browser pass, every item as designed:
- **Crew:** a silent merge ("Crew member saved. · merged with Charter Admin's change from 14:54", both edits listed);
  a clash on the same role (the dialog reopened on their member with the amber banner, a teal edge on my role and note,
  "↳ Charter Admin wrote: Chief Bosun"; Save stored mine at the next revision); a member deleted elsewhere while I
  edited (the list without them, "deleted PJ at 15:07. Save to add it back.", Save brought PJ back).
- **Hotel → Guests:** a clash on allergies with Hotel ("Hotel changed Guest 1 at 15:04", edges on preferred name and
  allergies, "↳ Hotel wrote: Nuts, shellfish"); Cancel kept Hotel's copy.
- **Charter Admin:** a page clash (their preference note merged in silently; my notes and flight on top, marked, the
  form unsaved; Save stored both).
- **Drink Stocks:** delete against change ("Hotel changed Absolut Mandrin … Delete anyway?", Delete removed it).
- **Galley menus:** both reordered ("Menu day moved. · merged with Charter Admin's change from 15:07 · the other order
  was replaced"; stored day numbers 1–9 match the positions).
- **Site Editor:** a clash reopened the dialog on their site with my description on top and their text as the hint;
  Save stored mine.
- **Cocktails:** a page clash (the banner, my description on top, the row edged with Hotel's value as its tooltip).
- **Freshness:** with Drink Stocks open and clean, another save moved Peach from 80 % to 50 %; a `visibilitychange`
  redrew the page ("Updated with changes saved elsewhere.").
- No console errors (only the expected 409 responses). The Crew clash was repeated on the final build: only the
  field I changed is edged (blank values compare equal, SC-D13).
- **After the Fable review (SC-D14), on the final build:** Hotel changed Guest 3 while I edited Guest 1 (silent merge),
  then I edited Guest 2: Guest 3's change survived (the page adopts the saved copy; the `g-slot` ids matched on both
  sides); a day's new title survived their dish edit on another day; a day dialog clash on the notes (only the notes
  edged); two quick moves of menu days saved one after the other with a plain "Menu day moved." (the per-file queue);
  Cocktails: their change to a cocktail I deleted asked "Hotel changed Mojito at 15:35, which you deleted. Delete
  anyway?", and Keep put it back in its place with their change.

**Shared checkout hazard:** other Claude sessions may work in the same checkouts. **Never** run `git checkout`,
`git switch`, `git stash` or `git add -A` in the main checkouts under `S:/Users/David/OneDrive/Maker Space/GitHub`. All
work happens in the worktree made in Task 0. Stage files by name. Before each task, run
`git -C <worktree> branch --show-current` and expect `feat/spec-c-admin`.

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `admin.js` | Tasks 1–7: Crew, Guests, Menus, Charter Admin + Guest Alcohol, Hotel drinks, Site Editor, freshness |
| `CLAUDE.md` | Task 8: `merge-core.js`, the conflict-safe saves, the test count |

---

### Task 1: Crew

**Files:** modify `admin.js`. **Read first:** `importedCrewMembers` (~4289), `openCrewMemberModal` (~4211), `crewRowElement` and `saveCrewEdit` (~6430), `bindCrewPanel` (~6730).

The crew dialog reopens on a clash; edits, deletes and imports by id. Every replacement matches exactly once; apply them in order.

- [ ] **Step 1: Apply the replacements.**

**1. crew: an imported member gets a fresh id** — in `admin.js`, replace

```js
  function importedCrewMembers(destinationCrewList, sourceCrewList) {
    const existingNames = new Set((destinationCrewList.crew || [])
      .map(normalizedCrewName)
      .filter(Boolean));
    const imported = [];
    (sourceCrewList.crew || []).forEach(member => {
      const name = normalizedCrewName(member);
      if (!name || existingNames.has(name)) {
        return;
      }
      existingNames.add(name);
      imported.push(cloneData(member));
    });
    return imported;
  }
```

with

```js
  function importedCrewMembers(destinationCrewList, sourceCrewList) {
    const existingNames = new Set((destinationCrewList.crew || [])
      .map(normalizedCrewName)
      .filter(Boolean));
    const takenIds = new Set((destinationCrewList.crew || []).map(member => member.id).filter(Boolean));
    const imported = [];
    (sourceCrewList.crew || []).forEach(member => {
      const name = normalizedCrewName(member);
      if (!name || existingNames.has(name)) {
        return;
      }
      existingNames.add(name);
      // Spec C: a fresh id, so a member imported from another charter is a new record here
      const id = mergeCore().newId("c", takenIds);
      takenIds.add(id);
      imported.push({ ...cloneData(member), id });
    });
    return imported;
  }
```

**2. crew dialog: reopened on a clash with my changes on top** — in `admin.js`, replace

```js
  function openCrewMemberModal(crewList, memberOrOnSave, maybeOnSave, onDelete) {
    const existing = memberOrOnSave && typeof memberOrOnSave === "object" ? memberOrOnSave : null;
    const saveHandler = typeof maybeOnSave === "function" ? maybeOnSave : memberOrOnSave;
    // Style rollout B: delete lives in the Edit dialog, not on every row
    const canDelete = Boolean(existing && typeof onDelete === "function");
    const draft = {
      ...blankCrewMember(),
      ...(existing ? cloneData(existing) : {})
    };
```

with

```js
  // Spec C: the crew dialog's input for each record field, for the clash marks
  const CREW_CLASH_FIELDS = Object.freeze({
    name: "#crew-add-name",
    position: "#crew-add-position",
    role: "#crew-add-position",
    department: "#crew-add-department",
    position_order: "#crew-add-position-order",
    description: "#crew-add-description",
    note: "#crew-add-description"
  });

  // clash (spec C §4.1, from recordClash): the dialog opens on clash.record (theirs with my changes on top), marked.
  function openCrewMemberModal(crewList, memberOrOnSave, maybeOnSave, onDelete, clash) {
    const existing = memberOrOnSave && typeof memberOrOnSave === "object" ? memberOrOnSave : null;
    const saveHandler = typeof maybeOnSave === "function" ? maybeOnSave : memberOrOnSave;
    // Style rollout B: delete lives in the Edit dialog, not on every row
    const canDelete = Boolean(existing && typeof onDelete === "function");
    const draft = {
      ...blankCrewMember(),
      ...(existing ? cloneData(clash && clash.record ? clash.record : existing) : {})
    };
```

**3. crew dialog: the clash marks** — in `admin.js`, replace

```js
    `, { cardClass: "modal-welcome-message", hideClose: true, headerActionsHtml });
    modal.querySelector("#crew-add-form").addEventListener("submit", event => {
```

with

```js
    `, { cardClass: "modal-welcome-message", hideClose: true, headerActionsHtml });
    showClashMarks(modal, clash, CREW_CLASH_FIELDS, modal.querySelector("#crew-add-form"));
    modal.querySelector("#crew-add-form").addEventListener("submit", event => {
```

**4. crew row: edit and delete go through the editor, by id** — in `admin.js`, replace

```js
    row.addEventListener("click", () => {
      openCrewMemberModal(crewList, member, updatedMember => {
        saveCrewEdit(crewList, crewList.crew.map((entry, entryIndex) => entryIndex === index ? updatedMember : entry), "Crew member saved.");
      }, async () => {
        try {
          await saveCrewEdit(crewList, crewList.crew.filter((entry, entryIndex) => entryIndex !== index), "Crew member deleted.");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
    });
    return row;
  }

  async function saveCrewEdit(crewList, crew, message) {
    const saved = await saveCharterFile("crew_list.json", { ...crewList, crew }, message);
    if (!saved) {
      return;
    }
    crewList.crew = normalizeCrewEditorList(saved).crew;
    drawCrewEditors(crewList);
  }
```

with

```js
    row.addEventListener("click", () => openCrewMemberEditor(crewList, member));
    return row;
  }

  // Spec C: on a clash the list shows theirs, then onClash(result) decides what to reopen.
  async function saveCrewEdit(crewList, crew, message, onClash) {
    const saved = await saveCharterFile("crew_list.json", { ...crewList, crew }, message, {
      onClash: result => {
        crewList.crew = normalizeCrewEditorList(result.theirs).crew;
        drawCrewEditors(crewList);
        onClash(result);
      }
    });
    if (!saved) {
      return;
    }
    crewList.crew = normalizeCrewEditorList(saved).crew;
    drawCrewEditors(crewList);
  }

  // Spec C §4.1, §4.3: edit or delete one crew member, found by id. A clash on this member reopens the editor on their
  // version with my changes on top; deleting a member they changed asks first.
  function openCrewMemberEditor(crewList, member, clash) {
    const id = member.id;
    const name = member.name || "this crew member";
    openCrewMemberModal(crewList, member, updatedMember => {
      const crew = crewList.crew.some(entry => entry.id === id)
        ? crewList.crew.map(entry => (entry.id === id ? updatedMember : entry))
        : [...crewList.crew, updatedMember];   // adding back a member someone else deleted
      saveCrewEdit(crewList, crew, "Crew member saved.", result => {
        const again = recordClash(result, "crew", id, updatedMember.name || name);
        if (again) {
          openCrewMemberEditor(crewList, again.theirsRecord || again.record, again);
        } else {
          setStatus(clashMessage(result, "the crew list"), "error");
        }
      });
    }, () => deleteCrewMember(crewList, id, name), clash);
  }

  async function deleteCrewMember(crewList, id, name) {
    await saveCrewEdit(crewList, crewList.crew.filter(entry => entry.id !== id), "Crew member deleted.", async result => {
      const clash = recordClash(result, "crew", id, name);
      if (!clash) {
        setStatus(clashMessage(result, "the crew list"), "error");
      } else if (clash.deletedByMe && await confirmDeleteAnyway(clash)) {
        await deleteCrewMember(crewList, id, name);
      }
    });
  }
```

**5. crew add: the new member gets an id** — in `admin.js`, replace

```js
        openCrewMemberModal(crewList, async member => {
          const nextCrewList = {
            ...crewList,
            crew: [...crewList.crew, member]
          };
```

with

```js
        openCrewMemberModal(crewList, async member => {
          const id = mergeCore().newId("c", new Set(crewList.crew.map(entry => entry.id)));
          const nextCrewList = {
            ...crewList,
            crew: [...crewList.crew, { ...member, id }]
          };
```

- [ ] **Step 2: Check.** `node --check admin.js` and `node --test` → `ℹ pass 209`, `ℹ fail 0`.

- [ ] **Step 3: Commit.**

```bash
git add admin.js
git commit -m "feat(admin): Crew: reopen on a clash, delete anyway, ids (spec C)"
```

### Task 2: Hotel → Guests

**Files:** modify `admin.js`. **Read first:** `openGuestEditModal` (~6014), `saveGuestList`, `drawGuestEditors`, `guestRowElement`, `removeGuestFromList` (~6160–6300).

The guest dialog reopens on a clash; edits, clears and deletes by id. Every replacement matches exactly once; apply them in order.

- [ ] **Step 1: Apply the replacements.**

**1. guest dialog: reopened on a clash with my changes on top** — in `admin.js`, replace

```js
  function openGuestEditModal(guestList, guest, index, options, onSave, onDelete) {
    const settings = options || {};
    const inactiveGuest = guest.active === false;
    const draft = normalizeGuestRecord(guest);
```

with

```js
  // Spec C: the guest dialog's input for each record field, for the clash marks
  const GUEST_CLASH_FIELDS = Object.freeze({
    full_name: "#guest-edit-full-name",
    preferred_name: "#guest-edit-preferred-name",
    principal: "#guest-edit-principal",
    cabin: "#guest-edit-cabin",
    bcd_size: "#guest-edit-bcd-size",
    wetsuit_size: "#guest-edit-wetsuit-size",
    fin_size: "#guest-edit-fin-size",
    allergies: "#guest-edit-allergies",
    dietary_preferences: "#guest-edit-dietary",
    drinks_preferences: "#guest-edit-drinks-preferences",
    diving_ability: "#guest-edit-diving-ability",
    diving_qualification: "#guest-edit-diving-qualification",
    date_of_last_dive: "#guest-edit-last-dive-mode",
    medical_notes: "#guest-edit-medical-notes",
    notes: "#guest-edit-notes"
  });

  // clash (spec C §4.1, from recordClash): the dialog opens on clash.record (theirs with my changes on top), marked.
  function openGuestEditModal(guestList, guest, index, options, onSave, onDelete, clash) {
    const settings = options || {};
    const inactiveGuest = guest.active === false;
    const draft = normalizeGuestRecord(clash && clash.record ? clash.record : guest);
```

**2. guest dialog: the clash marks** — in `admin.js`, replace

```js
    `, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    const deleteGuestButton = modal.querySelector("[data-action='delete-guest']");
```

with

```js
    `, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    showClashMarks(modal, clash, GUEST_CLASH_FIELDS, modal.querySelector("#guest-edit-form"));
    const deleteGuestButton = modal.querySelector("[data-action='delete-guest']");
```

**3. saveGuestList: on a clash the list shows theirs, then onClash** — in `admin.js`, replace

```js
  async function saveGuestList(guestList, settings) {
    if (settings && settings.charterInfo) {
      const normalized = normalizeGuestListForCount(guestList, settings.charterInfo.guest_count);
      guestList.guests = normalized.guests;
    } else {
      guestList.guests = sortAndEnsurePrincipalGuests((guestList.guests || []).map(normalizeGuestRecord));
    }
    return saveCharterFile("guest_list.json", guestList, settings.saveSuccessMessage || "Guests saved.");
  }
```

with

```js
  // Spec C: on success the list takes the saved copy (it may hold a merged change); on a clash it shows theirs, then
  // onClash(result) decides what to reopen (without one: the status line).
  async function saveGuestList(guestList, settings, onClash) {
    if (settings && settings.charterInfo) {
      const normalized = normalizeGuestListForCount(guestList, settings.charterInfo.guest_count);
      guestList.guests = normalized.guests;
    } else {
      guestList.guests = sortAndEnsurePrincipalGuests((guestList.guests || []).map(normalizeGuestRecord));
    }
    const saved = await saveCharterFile("guest_list.json", guestList, settings.saveSuccessMessage || "Guests saved.", {
      onClash: result => {
        guestList.guests = (settings && settings.charterInfo
          ? normalizeGuestListForCount(result.theirs, settings.charterInfo.guest_count)
          : normalizeGuestList(result.theirs)).guests;
        drawGuestEditors(guestList, settings);
        if (typeof onClash === "function") {
          onClash(result);
        } else {
          setStatus(clashMessage(result, "the guest list"), "error");
        }
      }
    });
    if (saved) {
      // The saved copy may hold someone else's merged change: never keep editing the copy from before the save
      guestList.guests = (settings && settings.charterInfo
        ? normalizeGuestListForCount(saved, settings.charterInfo.guest_count)
        : normalizeGuestList(saved)).guests;
    }
    return saved;
  }
```

**4. guest row: edit, clear and delete go through the editor, by id** — in `admin.js`, replace

```js
    if (settings.allowEdit) {
      const canDelete = settings.allowDelete || (settings.allowDeleteInactive && inactive);
      bindTapRow(row, "Edit guest", () => {
        openGuestEditModal(guestList, guest, index, settings, async nextGuest => {
          if (nextGuest.principal && settings.canChangePrincipal) {
            guestList.guests.forEach(entry => {
              entry.principal = false;
            });
          }
          guestList.guests[index] = nextGuest;
          guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests);
          await saveGuestList(guestList, settings);
          drawGuestEditors(guestList, settings);
        }, canDelete ? () => removeGuestFromList(guestList, guest, index, settings) : null);
      });
    }
```

with

```js
    if (settings.allowEdit) {
      bindTapRow(row, "Edit guest", () => openGuestEditor(guestList, guest, settings));
    }
```

**5. removeGuestFromList by id; the editor that reopens on a clash** — in `admin.js`, replace

```js
  async function removeGuestFromList(guestList, guest, index, settings) {
    if (guest.active === false) {
      guestList.guests.splice(index, 1);
    } else {
      clearGuestSlot(guest);
    }
    guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests);
    await saveGuestList(guestList, settings);
    drawGuestEditors(guestList, settings);
  }
```

with

```js
  // Spec C §4.1, §4.3: edit, clear or delete one guest, found by id (the list re-sorts around them). A clash on this
  // guest reopens the editor on their version with my changes on top.
  function openGuestEditor(guestList, guest, settings, clash) {
    const id = guest.id;
    const index = Math.max(0, guestList.guests.findIndex(entry => entry.id === id));
    const name = guestDisplayName(guest, index);
    const canDelete = settings.allowDelete || (settings.allowDeleteInactive && guest.active === false);
    openGuestEditModal(guestList, guest, index, settings, async nextGuest => {
      if (nextGuest.principal && settings.canChangePrincipal) {
        guestList.guests.forEach(entry => {
          entry.principal = false;
        });
      }
      const at = guestList.guests.findIndex(entry => entry.id === id);
      if (at >= 0) {
        guestList.guests[at] = nextGuest;
      } else {
        guestList.guests.push(nextGuest);   // adding back a guest someone else deleted
      }
      guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests);
      await saveGuestList(guestList, settings, result => {
        const again = recordClash(result, "guests", id, name);
        if (again) {
          openGuestEditor(guestList, again.theirsRecord || again.record, settings, again);
        } else {
          setStatus(clashMessage(result, "the guest list"), "error");
        }
      });
      drawGuestEditors(guestList, settings);
    }, canDelete ? () => removeGuestFromList(guestList, guest, settings) : null, clash);
  }

  // An inactive guest is deleted, an active one's slot cleared. Deleting a guest someone else changed asks first.
  async function removeGuestFromList(guestList, guest, settings) {
    const id = guest.id;
    const name = guestDisplayName(guest, 0);
    const at = guestList.guests.findIndex(entry => entry.id === id);
    if (at < 0) {
      return;
    }
    if (guestList.guests[at].active === false) {
      guestList.guests.splice(at, 1);
    } else {
      clearGuestSlot(guestList.guests[at]);
    }
    guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests);
    await saveGuestList(guestList, settings, async result => {
      const clash = recordClash(result, "guests", id, name);
      if (clash && clash.deletedByMe) {
        if (await confirmDeleteAnyway(clash)) {
          await removeGuestFromList(guestList, clash.theirsRecord, settings);
        }
      } else {
        setStatus(clashMessage(result, "the guest list"), "error");
      }
    });
    drawGuestEditors(guestList, settings);
  }
```

- [ ] **Step 2: Check.** `node --check admin.js` and `node --test` → `ℹ pass 209`, `ℹ fail 0`.

- [ ] **Step 3: Commit.**

```bash
git add admin.js
git commit -m "feat(admin): Guests: reopen on a clash, delete anyway, by id (spec C)"
```

### Task 3: Galley menus

**Files:** modify `admin.js`. **Read first:** `syncMenusToItineraryDays` (~6987), `openMenuDayModal` (~7484), `saveMenusAndRender` (~8043).

The day dialog reopens on a clash; new days get ids. Every replacement matches exactly once; apply them in order.

- [ ] **Step 1: Apply the replacements.**

**1. menus: a day added to fill the itinerary gets an id** — in `admin.js`, replace

```js
    while (activeDays.length < itineraryDayCount) {
      activeDays.push(blankMenuDay(activeDays.length + 1));
    }
```

with

```js
    while (activeDays.length < itineraryDayCount) {
      const takenIds = new Set([...activeDays, ...inactiveDays].map(day => day.id).filter(Boolean));
      activeDays.push({ ...blankMenuDay(activeDays.length + 1), id: mergeCore().newId("m", takenIds) });
    }
```

**2. menu day dialog: reopened on a clash, marked** — in `admin.js`, replace

```js
  function openMenuDayModal(menus, menuIndex, itinerary, itineraryDayCount, dateLabel) {
    const original = menus.menus[menuIndex];
```

with

```js
  // Spec C: the day dialog's element for each field of a day's menu, for the clash marks
  const MENU_DAY_CLASH_FIELDS = Object.freeze({
    label: "#menu-day-title",
    title: "#menu-day-title",
    todays_notes: "#menu-day-notes",
    notes: "#menu-day-notes",
    breakfast: ["#menu-day-section-list", "Breakfast"],
    lunch: ["#menu-day-section-list", "Lunch"],
    dinner: ["#menu-day-section-list", "Dinner"],
    snacks: ["#menu-day-section-list", "Snacks"],
    children: ["#menu-day-section-list", "Other sections"]
  });

  // clash (spec C §4.1): menus is a copy of theirs with my day on top at menuIndex; the dialog is marked.
  function openMenuDayModal(menus, menuIndex, itinerary, itineraryDayCount, dateLabel, clash) {
    const original = menus.menus[menuIndex];
```

**3. menu day dialog: the marks after the sections draw** — in `admin.js`, replace

```js
    redrawSections();
    modal.querySelector("#clone-menu-day").addEventListener("click", () => {
```

with

```js
    redrawSections();
    showClashMarks(modal, clash, MENU_DAY_CLASH_FIELDS, modal.querySelector("#menu-day-form"));
    modal.querySelector("#clone-menu-day").addEventListener("click", () => {
```

**4. menu day dialog: deleting an inactive menu someone changed asks first** — in `admin.js`, replace

```js
      if (inactiveDay) {
        menus.menus = menus.menus.filter(entry => entry !== original);
        await saveMenusAndRender(menus, "Inactive menu deleted.");
        return;
      }
```

with

```js
      if (inactiveDay) {
        menus.menus = menus.menus.filter(entry => entry !== original);
        await saveMenusAndRender(menus, "Inactive menu deleted.", { onClash: result => deleteMenuDayAnyway(result, original.id) });
        return;
      }
```

**5. menu day dialog: a clash on save reopens it** — in `admin.js`, replace

```js
      applyMenuSectionsToDay(original, sectionDrafts);
      syncMenusToItineraryDays(menus, itineraryDayCount);
      const saved = await saveMenusAndRender(menus, "Menu day saved.");
      if (saved) {
        markModalSaved(modal);
        closeDialogModal();
      }
    });
  }
```

with

```js
      applyMenuSectionsToDay(original, sectionDrafts);
      syncMenusToItineraryDays(menus, itineraryDayCount);
      const saved = await saveMenusAndRender(menus, "Menu day saved.", {
        onClash: result => reopenMenuDayAfterClash(result, original.id, itinerary, itineraryDayCount, dateLabel)
      });
      if (saved) {
        markModalSaved(modal);
        closeDialogModal();
      }
    });
  }

  // Spec C §4.1: the day dialog reopens on a copy of their menus with my day on top; the page shows theirs.
  async function reopenMenuDayAfterClash(result, id, itinerary, itineraryDayCount, dateLabel) {
    await closeDialogModal({ force: true });
    await renderGalley();   // the page shows theirs (and may save its sync to the itinerary days) before the dialog opens
    const clash = recordClash(result, "menus", id, "this day's menu");
    if (!clash || !clash.record) {
      setStatus(clashMessage(result, "the menus"), "error");
      return;
    }
    const menus = normalizeMenus(state.bundle && state.bundle["menus.json"] ? state.bundle["menus.json"] : result.theirs);
    const at = menus.menus.findIndex(day => day.id === id);
    if (at >= 0) {
      menus.menus[at] = normalizeMenuDay(clash.record, at + 1);
    } else {
      menus.menus.push(normalizeMenuDay(clash.record, menus.menus.length + 1));   // adding back a day someone deleted
    }
    openMenuDayModal(menus, at >= 0 ? at : menus.menus.length - 1, itinerary, itineraryDayCount, dateLabel, clash);
  }

  // Spec C SC-D7: I deleted an inactive menu someone else changed.
  async function deleteMenuDayAnyway(result, id) {
    const clash = recordClash(result, "menus", id, "this inactive menu");
    if (clash && clash.deletedByMe && await confirmDeleteAnyway(clash)) {
      const menus = normalizeMenus(result.theirs);
      menus.menus = menus.menus.filter(day => day.id !== id);
      await saveMenusAndRender(menus, "Inactive menu deleted.");
      return;
    }
    if (!clash || !clash.deletedByMe) {
      setStatus(clashMessage(result, "the menus"), "error");
    }
    renderGalley();
  }
```

**6. saveMenusAndRender passes the save options** — in `admin.js`, replace

```js
  async function saveMenusAndRender(menus, successMessage) {
    const saved = await saveCharterFile("menus.json", menus, successMessage);
```

with

```js
  async function saveMenusAndRender(menus, successMessage, options = {}) {
    const saved = await saveCharterFile("menus.json", menus, successMessage, options);
```

- [ ] **Step 2: Check.** `node --check admin.js` and `node --test` → `ℹ pass 209`, `ℹ fail 0`.

- [ ] **Step 3: Commit.**

```bash
git add admin.js
git commit -m "feat(admin): Menus: the day dialog reopens on a clash; ids on new days (spec C)"
```

### Task 4: Charter Admin and Guest Alcohol

**Files:** modify `admin.js`. **Read first:** `bindSettingsFormController` (~2174), `renderCharter` (~6760), `bindCharterInfoPanel` (~6618), `bindGuestDrinksPanel` (~12379).

Whole-page saves redraw on their copy with my changes on top. Every replacement matches exactly once; apply them in order.

- [ ] **Step 1: Apply the replacements.**

**1. the form controller: a form redrawn after a clash starts unsaved** — in `admin.js`, replace

```js
    let savedSignature = settingsStateSignature(readState());
    const guard = {
      isDirty: () => settingsStateSignature(readState()) !== savedSignature,
      confirmOptions: options.confirmOptions || UNSAVED_CHANGES_CONFIRM
    };
```

with

```js
    let savedSignature = settingsStateSignature(readState());
    let forcedDirty = Boolean(options.startDirty);   // spec C: a form redrawn after a clash starts unsaved
    const guard = {
      isDirty: () => forcedDirty || settingsStateSignature(readState()) !== savedSignature,
      confirmOptions: options.confirmOptions || UNSAVED_CHANGES_CONFIRM
    };
```

**2. the form controller: a save or a cancel clears the forced dirty state** — in `admin.js`, replace

```js
        if (typeof options.save === "function") {
          await options.save();
        }
        savedSignature = settingsStateSignature(readState());
        clearPageUnsavedGuard(guard);
        await reload();
```

with

```js
        if (typeof options.save === "function") {
          await options.save();
        }
        forcedDirty = false;
        savedSignature = settingsStateSignature(readState());
        clearPageUnsavedGuard(guard);
        await reload();
```

**3. the form controller: cancel** — in `admin.js`, replace

```js
          const confirmed = await showAdminConfirm(options.confirmOptions || UNSAVED_CHANGES_CONFIRM);
          if (!confirmed) {
            return;
          }
        }
        clearPageUnsavedGuard(guard);
        await reload();
      });
    }
```

with

```js
          const confirmed = await showAdminConfirm(options.confirmOptions || UNSAVED_CHANGES_CONFIRM);
          if (!confirmed) {
            return;
          }
        }
        forcedDirty = false;
        clearPageUnsavedGuard(guard);
        await reload();
      });
    }
```

**4. the form controller: resetBaseline** — in `admin.js`, replace

```js
      resetBaseline() {
        savedSignature = settingsStateSignature(readState());
        syncDirtyState();
      },
```

with

```js
      resetBaseline() {
        forcedDirty = false;
        savedSignature = settingsStateSignature(readState());
        syncDirtyState();
      },
```

**5. Charter Admin opens on my changes after a clash** — in `admin.js`, replace

```js
        loadReservedPeriods()
      ]);
      const charterInfo = normalizeCharterInfo(bundle["charter.json"]);
```

with

```js
        loadReservedPeriods()
      ]);
      // Spec C §4.2: after a clash Charter Admin redraws on their copy with my changes on top (bindCharterInfoPanel)
      const infoClash = activePanel === "info" ? state.charterInfoClash : null;
      const charterInfo = normalizeCharterInfo(infoClash ? infoClash.rebased : bundle["charter.json"]);
```

**6. Charter Admin: the clash marks and the unsaved start** — in `admin.js`, replace

```js
    bindSettingsFormController({
      formId: "charter-info-form",
      cancelButtonId: "cancel-charter-info",
      readState: () => readCharterInfoForm(charterInfo),
      save: async () => {
        if (syncCharterInfoOverlap()) {
          throw new Error("These dates overlap another charter or a reserved period.");
        }
        Object.assign(charterInfo, readCharterInfoForm(charterInfo));
        // Not saveCharterFile(): its catch would swallow the server's message, and the controller needs the throw to keep the form dirty.
        const payload = await api(`/api/admin/charter/${encodeURIComponent(state.selectedCharter)}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file: "charter.json", data: charterInfo })
        });
        const saved = payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
        if (state.bundle) {
          state.bundle["charter.json"] = cloneData(saved);
        }
        setStatus("Charter info saved.", "ok");
```

with

```js
    const infoClash = state.charterInfoClash;
    state.charterInfoClash = null;
    bindSettingsFormController({
      formId: "charter-info-form",
      cancelButtonId: "cancel-charter-info",
      startDirty: Boolean(infoClash),
      readState: () => readCharterInfoForm(charterInfo),
      save: async () => {
        if (syncCharterInfoOverlap()) {
          throw new Error("These dates overlap another charter or a reserved period.");
        }
        Object.assign(charterInfo, readCharterInfoForm(charterInfo));
        // Not saveCharterFile(): its catch would swallow the server's message, and the controller needs the throw to keep the form dirty.
        const result = await saveRevisioned({
          path: `/api/admin/charter/${encodeURIComponent(state.selectedCharter)}/save`,
          queue: `${state.selectedCharter}/charter.json`,
          schema: "charter",
          base: () => (state.bundle && state.bundle["charter.json"] ? state.bundle["charter.json"] : {}),
          mine: charterInfo,
          normalize: normalizeCharterInfo,
          wrap: (payload, baseRevision) => ({ file: "charter.json", data: payload, base_revision: baseRevision }),
          unwrap: payload => (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload)
        });
        if (!result.ok) {
          // Spec C §4.2: redraw on their copy with my changes on top, still unsaved; the throw keeps this save unsaved
          if (state.bundle) {
            state.bundle["charter.json"] = cloneData(result.theirs);
          }
          state.charterInfoClash = result;
          await renderCharter();
          const when = mergeCore().timeLabel(result.savedAt);
          throw new Error(`${mergeCore().departmentLabel(result.savedBy)} changed the charter info${when ? ` at ${when}` : ""}. Check the marked fields and save again.`);
        }
        const saved = result.saved;
        if (state.bundle) {
          state.bundle["charter.json"] = cloneData(saved);
        }
        setStatus(mergeCore().savedStatus("Charter info saved.", result), "ok");
```

**7. Charter Admin: the marks after the form binds** — in `admin.js`, replace

```js
      reload: async () => {
        await renderCharter();
      }
    });

    const guestViewButton = document.getElementById("charter-guest-view");
```

with

```js
      reload: async () => {
        await renderCharter();
      }
    });
    if (infoClash) {
      showClashMarks(form.parentElement, pageClash(infoClash, "the charter info"), CHARTER_INFO_CLASH_FIELDS, form);
    }

    const guestViewButton = document.getElementById("charter-guest-view");
```

**8. Charter Admin's input for each charter.json field** — in `admin.js`, replace

```js
  function bindCharterInfoPanel(charterInfo) {
```

with

```js
  // Spec C: Charter Admin's input for each charter.json field, for the clash marks
  const CHARTER_INFO_CLASH_FIELDS = Object.freeze({
    name: "#charter-info-name",
    start_date: "#charter-info-start-date",
    end_date: "#charter-info-end-date",
    guest_count: "#charter-info-guest-count",
    diving_guest_count: "#charter-info-diving-guest-count",
    arrival: "#charter-info-arrival-date",
    primary_contact: "#charter-info-primary-contact-name",
    charter_style: "#charter-info-charter-style",
    non_swimmers_present: "#charter-info-non-swimmers-present",
    diving_planned: "#charter-info-diving-planned",
    medical_notes_present: "#charter-info-medical-notes-present",
    dietary_restrictions_present: "#charter-info-dietary-restrictions-present",
    charter_preference_notes: "#charter-info-charter-preference-notes",
    drink_preferences_notes: "#charter-info-drink-preferences-notes",
    notes: "#charter-info-notes"
  });

  function bindCharterInfoPanel(charterInfo) {
```

**9. Guest Alcohol: a clash redraws on their copy with my changes on top, unsaved** — in `admin.js`, replace

```js
      const saved = await saveCharterFile(GUEST_DRINKS_FILE_NAME, drinks, "Guest Alcohol saved.");
      if (saved) {
        drinks.sections = normalizeGuestDrinks(saved).sections;
        markClean();
        await renderHotel();
      }
```

with

```js
      const saved = await saveCharterFile(GUEST_DRINKS_FILE_NAME, drinks, "Guest Alcohol saved.", {
        onClash: result => {
          // Spec C §4.2: their copy with my changes on top, still unsaved
          drinks.sections = normalizeGuestDrinks(result.rebased).sections;
          markDirty();
          redraw();
          showListClash(document.getElementById("guest-drinks-sections"), result, "Guest Alcohol", () => null);
        }
      });
      if (saved) {
        drinks.sections = normalizeGuestDrinks(saved).sections;
        markClean();
        await renderHotel();
      }
```

- [ ] **Step 2: Check.** `node --check admin.js` and `node --test` → `ℹ pass 209`, `ℹ fail 0`.

- [ ] **Step 3: Commit.**

```bash
git add admin.js
git commit -m "feat(admin): Charter Admin and Guest Alcohol: page clashes, the form starts unsaved (spec C)"
```

### Task 5: Drink Stocks, Available Alcohol and Cocktails

**Files:** modify `admin.js`. **Read first:** `deleteDrinkStockRow` (~10277), `openDrinkStockModal` (~11676), `bindAvailableAlcoholPanel` (~13522), `bindCocktailsPanel` (~13990).

The stock dialog reopens on a clash; page clashes; delete anyway; ids on new cocktails. Every replacement matches exactly once; apply them in order.

- [ ] **Step 1: Apply the replacements.**

**1. drink stock delete: by id; deleting stock someone changed asks first** — in `admin.js`, replace

```js
  async function deleteDrinkStockRow(drinkStocks, displayRow) {
    const { index, isGrouped } = displayRow;
    if (isGrouped) {
      displayRow.indexes.slice().sort((left, right) => right - left).forEach(removeIndex => {
        drinkStocks.items.splice(removeIndex, 1);
      });
    } else {
      drinkStocks.items.splice(index, 1);
    }
    const saved = await saveDrinkStocks(drinkStocks, isGrouped ? "Drink stock group deleted." : "Drink stock item deleted.");
    if (saved) {
      drawDrinkStockRows(drinkStocks);
    }
  }
```

with

```js
  async function deleteDrinkStockRow(drinkStocks, displayRow) {
    const { index, isGrouped } = displayRow;
    const ids = (isGrouped ? displayRow.indexes : [index])
      .map(removeIndex => drinkStocks.items[removeIndex] && drinkStocks.items[removeIndex].id)
      .filter(Boolean);
    const item = drinkStocks.items[index] || {};
    const name = [item.name, item.variant].filter(Boolean).join(" ") || "this drink";
    await deleteDrinkStocksById(drinkStocks, ids, name, isGrouped ? "Drink stock group deleted." : "Drink stock item deleted.");
  }

  // Spec C SC-D7: deleting stock someone else changed asks first.
  async function deleteDrinkStocksById(drinkStocks, ids, name, message) {
    drinkStocks.items = drinkStocks.items.filter(item => !ids.includes(item.id));
    const saved = await saveDrinkStocks(drinkStocks, message, {
      onClash: async result => {
        drawDrinkStockRows(drinkStocks);
        const clashedId = ids.find(id => recordClash(result, "items", id, name));
        const clash = clashedId ? recordClash(result, "items", clashedId, name) : null;
        if (clash && clash.deletedByMe) {
          if (await confirmDeleteAnyway(clash)) {
            await deleteDrinkStocksById(drinkStocks, ids, name, message);
          }
        } else {
          setStatus(clashMessage(result, "the drink stocks"), "error");
        }
      }
    });
    if (saved) {
      drawDrinkStockRows(drinkStocks);
    }
  }
```

**2. drink stock dialog: opens on clash.record after a clash** — in `admin.js`, replace

```js
  function openDrinkStockModal(drinkStocks, item, index, options = {}) {
    const editing = Number.isInteger(index);
    const stacked = Boolean(options.stacked);
    const draft = normalizeDrinkStockItem(item || { in_stock: true, date_added: todayInputDate() });
```

with

```js
  // Spec C: the drink stock dialog's input for each record field, for the clash marks
  const DRINK_STOCK_CLASH_FIELDS = Object.freeze({
    name: "#drink-stock-name",
    variant: "#drink-stock-variant",
    description: "#drink-stock-description",
    category: "#drink-stock-category",
    sub_category: "#drink-stock-sub-category",
    in_stock: "#drink-stock-quantity",
    opened: "#drink-stock-opened",
    remaining: "#drink-stock-remaining",
    charter_specific: "#drink-stock-charter",
    charter_id: "#drink-stock-charter",
    date_added: "#drink-stock-date"
  });

  // options.clash (spec C §4.1, from recordClash): the dialog opens on clash.record (theirs with my changes on top).
  function openDrinkStockModal(drinkStocks, item, index, options = {}) {
    const editing = Number.isInteger(index);
    const stacked = Boolean(options.stacked);
    const draft = normalizeDrinkStockItem(options.clash && options.clash.record
      ? options.clash.record
      : (item || { in_stock: true, date_added: todayInputDate() }));
```

**3. drink stock dialog: the clash marks** — in `admin.js`, replace

```js
      : openDialogModal(modalTitle, modalBody, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    const deleteStockButton = modal.querySelector("[data-action='delete-stock']");
```

with

```js
      : openDialogModal(modalTitle, modalBody, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    showClashMarks(modal, options.clash, DRINK_STOCK_CLASH_FIELDS, modal.querySelector("#drink-stock-form"));
    const deleteStockButton = modal.querySelector("[data-action='delete-stock']");
```

**4. drink stock dialog: a clash on save reopens it on theirs** — in `admin.js`, replace

```js
      const saved = await saveDrinkStocks(drinkStocks, editing ? "Drink stock item saved." : "Drink stock item added.");
      if (!saved) {
        errorField.textContent = "Unable to save drink stock item.";
        return;
      }
```

with

```js
      let clashed = false;
      const saved = await saveDrinkStocks(drinkStocks, editing ? "Drink stock item saved." : "Drink stock item added.", {
        onClash: async result => {
          // Spec C §4.1: drinkStocks now holds theirs; reopen this item on theirs with my changes on top
          clashed = true;
          markModalSaved(modal);
          if (stacked) {
            await closeStackedDialogModal(modal);
          } else {
            await closeDialogModal({ force: true });
          }
          if (typeof options.onSaved !== "function") {
            drawDrinkStockRows(drinkStocks);
          }
          const clash = previousId ? recordClash(result, "items", previousId, nextItem.name || "this drink") : null;
          if (!clash || !clash.record) {
            setStatus(clashMessage(result, "the drink stocks"), "error");
            return;
          }
          const at = drinkStocks.items.findIndex(entry => entry.id === previousId);
          openDrinkStockModal(drinkStocks, at >= 0 ? drinkStocks.items[at] : clash.record, at >= 0 ? at : undefined, { ...options, group: undefined, clash });
        }
      });
      if (!saved) {
        if (!clashed) {
          errorField.textContent = "Unable to save drink stock item.";
        }
        return;
      }
```

**5. Available Alcohol: a clash redraws on their copy with my changes on top, unsaved** — in `admin.js`, replace

```js
      const saved = await saveAvailableAlcohol(charterId, availableAlcohol, "Available Alcohol saved.");
      if (saved) {
        markClean();
        await renderHotel();
      }
```

with

```js
      const saved = await saveAvailableAlcohol(charterId, availableAlcohol, "Available Alcohol saved.", {
        onClash: async result => {
          // Spec C §4.2: their copy with my changes on top, still unsaved (a drink I removed that they changed: asked)
          const rebased = normalizeAvailableAlcohol(await pageCopyAfterClash(result, "items", item => String(item.stock_id || "").trim().toLocaleLowerCase()));
          availableAlcohol.items = rebased.items;
          availableAlcohol.show_prices_to_guests = rebased.show_prices_to_guests;
          if (showPricesToggle) {
            showPricesToggle.checked = Boolean(rebased.show_prices_to_guests);
          }
          markDirty();
          redraw();
          showListClash(document.getElementById("available-alcohol-list"), result, "Available Alcohol", key => {
            const at = availableAlcohol.items.findIndex(item => String(item.stock_id || "").trim().toLocaleLowerCase() === key);
            return at >= 0 ? document.querySelector(`[data-price-index="${at}"]`) : null;
          });
        }
      });
      if (saved) {
        markClean();
        await renderHotel();
      }
```

**6. Cocktails: a new cocktail gets an id** — in `admin.js`, replace

```js
    document.getElementById("add-cocktail")?.addEventListener("click", () => {
      openCocktailItemModal(null, cocktail => {
        cocktails.cocktails.push(normalizeCocktailItem(cocktail));
```

with

```js
    document.getElementById("add-cocktail")?.addEventListener("click", () => {
      openCocktailItemModal(null, cocktail => {
        const id = mergeCore().newId("k", new Set(cocktails.cocktails.map(entry => entry.id)));
        cocktails.cocktails.push(normalizeCocktailItem({ ...cocktail, id }));
```

**7. Cocktails: a clash redraws on their copy with my changes on top, unsaved** — in `admin.js`, replace

```js
      const saved = await saveCocktails(cocktails, "Cocktails saved.");
      if (saved) {
        cocktails.cocktails = saved.cocktails;
        markClean();
        await renderHotel();
      }
```

with

```js
      const saved = await saveCocktails(cocktails, "Cocktails saved.", {
        onClash: async result => {
          // Spec C §4.2: their copy with my changes on top, still unsaved (a cocktail I deleted that they changed: asked)
          cocktails.cocktails = normalizeCocktails(await pageCopyAfterClash(result, "cocktails", cocktail => cocktail.id)).cocktails;
          markDirty();
          redraw();
          const list = document.getElementById("cocktails-list");
          showListClash(list, result, "the cocktails", key => {
            const at = cocktails.cocktails.findIndex(cocktail => cocktail.id === key);
            return at >= 0 && list ? list.children[at] || null : null;
          });
        }
      });
      if (saved) {
        cocktails.cocktails = saved.cocktails;
        markClean();
        await renderHotel();
      }
```

- [ ] **Step 2: Check.** `node --check admin.js` and `node --test` → `ℹ pass 209`, `ℹ fail 0`.

- [ ] **Step 3: Commit.**

```bash
git add admin.js
git commit -m "feat(admin): Hotel drinks: reopen on a clash, page clashes, delete anyway (spec C)"
```

### Task 6: Site Editor

**Files:** modify `admin.js`. **Read first:** `openSiteEditorModal` (~5533), `siteRowElement` (~6532).

The site dialog reopens on a clash; edit and delete by id. Every replacement matches exactly once; apply them in order.

- [ ] **Step 1: Apply the replacements.**

**1. site dialog: opens on clash.record after a clash** — in `admin.js`, replace

```js
  function openSiteEditorModal(siteLibrary, site, onSave, defaults, onDelete) {
    const editing = Boolean(site);
```

with

```js
  // Spec C: the site dialog's element for each record field, for the clash marks
  const SITE_CLASH_FIELDS = Object.freeze({
    title: "#site-editor-title",
    latitude: "#site-editor-latitude-degrees",
    longitude: "#site-editor-longitude-degrees",
    description: "#site-editor-description",
    tags: "#site-editor-tags",
    media: "#site-editor-images",
    images: "#site-editor-images"
  });

  // clash (spec C §4.1, from recordClash): the dialog opens on clash.record (theirs with my changes on top), marked.
  // An onSave that reopened the dialog after a clash throws an error with clashReopened set.
  function openSiteEditorModal(siteLibrary, site, onSave, defaults, onDelete, clash) {
    const editing = Boolean(site);
```

**2. site dialog: the draft from clash.record** — in `admin.js`, replace

```js
    const draft = {
      ...blankSite(),
      ...(editing ? cloneData(site) : (defaults || {}))
    };
    const mediaItems = siteMediaEntries(draft);
```

with

```js
    const draft = {
      ...blankSite(),
      ...(editing ? cloneData(clash && clash.record ? clash.record : site) : (defaults || {}))
    };
    const mediaItems = siteMediaEntries(draft);
```

**3. site dialog: the clash marks** — in `admin.js`, replace

```js
      </form>
    `, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });

    const deleteSiteButton = modal.querySelector("[data-action='delete-site']");
```

with

```js
      </form>
    `, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    showClashMarks(modal, clash, SITE_CLASH_FIELDS, modal.querySelector("#site-editor-form"));

    const deleteSiteButton = modal.querySelector("[data-action='delete-site']");
```

**4. site dialog: a reopened dialog is left open** — in `admin.js`, replace

```js
        await onSave(normalizeSiteEditorDraft(nextDraft, siteLibrary, site || null));
        markModalSaved(modal);
        closeDialogModal();
      } catch (error) {
        errorField.textContent = error.message || "Unable to save site.";
      }
```

with

```js
        await onSave(normalizeSiteEditorDraft(nextDraft, siteLibrary, site || null));
        markModalSaved(modal);
        closeDialogModal();
      } catch (error) {
        if (error && error.clashReopened) {
          return;   // spec C: the dialog has reopened on their version
        }
        errorField.textContent = error.message || "Unable to save site.";
      }
```

**5. site row: edit and delete by id; a clash reopens the editor** — in `admin.js`, replace

```js
    row.addEventListener("click", () => {
      openSiteEditorModal(siteLibrary, site, async updatedSite => {
        const nextLibrary = normalizeSiteLibrary({
          ...siteLibrary,
          sites: siteLibrary.sites.map((entry, entryIndex) => entryIndex === index ? updatedSite : entry)
        });
        const saved = await saveSitesLibrary(nextLibrary, "Site saved.");
        siteLibrary.sites = saved.sites;
        drawSiteEditors(siteLibrary);
      }, null, async () => {
        try {
          const nextLibrary = normalizeSiteLibrary({
            ...siteLibrary,
            sites: siteLibrary.sites.filter((entry, entryIndex) => entryIndex !== index)
          });
          const saved = await saveSitesLibrary(nextLibrary, "Site deleted.");
          siteLibrary.sites = saved.sites;
          drawSiteEditors(siteLibrary);
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
    });
    return row;
  }
```

with

```js
    row.addEventListener("click", () => openSiteEditor(siteLibrary, site));
    return row;
  }

  // Spec C §4.1, §4.3: edit or delete one site, found by id. A clash on this site reopens the editor on their version
  // with my changes on top; deleting a site they changed asks first.
  function openSiteEditor(siteLibrary, site, clash) {
    const id = site.id;
    const name = siteDisplayName(site, "this site");
    openSiteEditorModal(siteLibrary, site, async updatedSite => {
      const exists = siteLibrary.sites.some(entry => entry.id === id);
      const nextLibrary = normalizeSiteLibrary({
        ...siteLibrary,
        sites: exists ? siteLibrary.sites.map(entry => (entry.id === id ? updatedSite : entry)) : [...siteLibrary.sites, updatedSite]
      });
      let clashResult = null;
      const saved = await saveSitesLibrary(nextLibrary, "Site saved.", { onClash: result => { clashResult = result; } });
      if (!saved) {
        siteLibrary.sites = nextLibrary.sites;   // theirs
        drawSiteEditors(siteLibrary);
        const again = recordClash(clashResult, "sites", id, name);
        if (!again) {
          throw new Error(clashMessage(clashResult, "the sites"));
        }
        openSiteEditor(siteLibrary, siteLibrary.sites.find(entry => entry.id === id) || again.record, again);
        const reopened = new Error("");
        reopened.clashReopened = true;
        throw reopened;
      }
      siteLibrary.sites = saved.sites;
      drawSiteEditors(siteLibrary);
    }, null, () => deleteSite(siteLibrary, id, name), clash);
  }

  async function deleteSite(siteLibrary, id, name) {
    try {
      const nextLibrary = normalizeSiteLibrary({ ...siteLibrary, sites: siteLibrary.sites.filter(entry => entry.id !== id) });
      let clashResult = null;
      const saved = await saveSitesLibrary(nextLibrary, "Site deleted.", { onClash: result => { clashResult = result; } });
      if (saved) {
        siteLibrary.sites = saved.sites;
        drawSiteEditors(siteLibrary);
        return;
      }
      siteLibrary.sites = nextLibrary.sites;   // theirs
      drawSiteEditors(siteLibrary);
      const clash = recordClash(clashResult, "sites", id, name);
      if (clash && clash.deletedByMe) {
        if (await confirmDeleteAnyway(clash)) {
          await deleteSite(siteLibrary, id, name);
        }
      } else {
        setStatus(clashMessage(clashResult, "the sites"), "error");
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  }
```

- [ ] **Step 2: Check.** `node --check admin.js` and `node --test` → `ℹ pass 209`, `ℹ fail 0`.

- [ ] **Step 3: Commit.**

```bash
git add admin.js
git commit -m "feat(admin): Site Editor: reopen on a clash, delete anyway, by id (spec C)"
```

### Task 7: Freshness on tab focus

**Files:** modify `admin.js`. **Read first:** the `beforeunload` listener (~3135), `renderSection` (~2046).

The open page redraws when its files moved elsewhere. Every replacement matches exactly once; apply them in order.

- [ ] **Step 1: Apply the replacements.**

**1. freshness: the open page redraws on tab focus when its files moved** — in `admin.js`, replace

```js
  window.addEventListener("beforeunload", event => {
    if (!hasPageUnsavedChanges()) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });
```

with

```js
  window.addEventListener("beforeunload", event => {
    if (!hasPageUnsavedChanges()) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  // Spec C §4.4: back on the tab, the open page redraws when a file it shows was saved elsewhere, unless it has unsaved
  // edits or a dialog is open. Pages reload their files whenever they open, so tab focus is the only other moment. The
  // Route page keeps its own copy (itinerary.json), so it is left out. A raw fetch, not api(): this check is not
  // activity and must not keep an idle session alive.
  const FRESHNESS_PANEL_FILES = Object.freeze({
    charter: { info: ["charter.json"], crew: ["crew_list.json"], sites: ["sites.json"] },
    galley: { menus: ["menus.json", "charter.json"], guests: ["guest_list.json", "charter.json"] },
    hotel: {
      guests: ["guest_list.json", "charter.json"],
      "drink-stocks": ["drink-stocks.json"],
      "guest-drinks": [GUEST_DRINKS_FILE_NAME, "drink-stocks.json"],
      "available-alcohol": ["available-alcohol.json", "drink-stocks.json"],
      "purchased-alcohol": ["drink-stocks.json"],
      cocktails: ["cocktails.json"]
    }
  });
  let freshnessCheck = null;

  function knownRevision(file, charterId) {
    const bundle = state.bundle && state.bundle.charter_id === charterId ? state.bundle : null;
    if (bundle && bundle[file]) {
      return mergeCore().revisionOf(bundle[file]);
    }
    return Object.prototype.hasOwnProperty.call(seenRevisions, file) ? seenRevisions[file] : null;
  }

  async function checkFreshness() {
    const section = state.selectedSection;
    const files = ((FRESHNESS_PANEL_FILES[section] || {})[state.sectionPanels[section]]) || [];
    const charterId = state.selectedCharter;
    const busy = () => hasPageUnsavedChanges() || document.body.classList.contains("modal-open");
    if (!state.authenticated || !files.length || busy()) {
      return;
    }
    try {
      const response = await fetch(apiUrl(`/api/admin/revisions${charterId ? `?charter=${encodeURIComponent(charterId)}` : ""}`), { credentials: "same-origin" });
      if (!response.ok) {
        return;
      }
      const stamps = await response.json();
      const served = { ...(stamps.library || {}), ...(stamps.charter || {}) };
      const moved = files.some(file => {
        const known = knownRevision(file, charterId);
        return known !== null && served[file] && served[file].revision !== known;
      });
      if (moved && !busy() && state.selectedSection === section && state.selectedCharter === charterId) {
        await ({ charter: renderCharter, galley: renderGalley, hotel: renderHotel })[section]();
        setStatus("Updated with changes saved elsewhere.", "ok");
      }
    } catch (error) {
      // A missed check is harmless: the next save merges.
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !freshnessCheck) {
      freshnessCheck = checkFreshness().finally(() => {
        freshnessCheck = null;
      });
    }
  });
```

- [ ] **Step 2: Check.** `node --check admin.js` and `node --test` → `ℹ pass 209`, `ℹ fail 0`.

- [ ] **Step 3: Commit.**

```bash
git add admin.js
git commit -m "feat(admin): Freshness: redraw the open page on tab focus when its files moved (spec C)"
```

### Task 8: `CLAUDE.md` (Haiku)

**Files:** modify `CLAUDE.md`

- [ ] **Step 1: Apply the replacement.**

**1. merge-core.js and the conflict-safe saves** — in `CLAUDE.md`, replace

```markdown
- `node --test` runs the tests in `test/` (185 tests), which cover `routes-core`, `itinerary-core`, `charters-core`,
  `guest-preview-core`, `pack-core`, `pack-render`, `drag-reorder`, the startup order (`startup-order.test.js` runs
  `admin.js` alone in a `vm` sandbox) and the refused-access card (`refused-access.test.js`, the same sandbox)
```

with

```markdown
- `merge-core.js` — conflict-safe saves (charter rework spec C), pure, also a Node module (`window.IolantheMerge`):
  `merge3(base, mine, theirs, schema)` merges two people's copies of a file record by record and field by field
  (`SCHEMAS`: crew, guests, menus, Guest Alcohol, Available Alcohol, drink stocks, cocktails, sites, charter.json) and
  reports a clash where both changed the same field; `saveWithRebase` sends a save with `base_revision`, merges a 409
  and sends again (3 rounds), or returns the clash; labels, ids (`newId`, `withSlotIds`).
- **Conflict-safe saves** (spec C): every save of `charter.json`, `crew_list.json`, `guest_list.json`, `menus.json`,
  `guest_drinks.json`, Available Alcohol, drink stocks, cocktails and sites goes through `saveRevisioned` in admin.js
  (`saveCharterFile`, `saveLibraryCopy`, `saveSitesLibrary`, the Charter Admin form). The merge base of a charter file
  is `state.bundle[file]` (only `loadCharter`, which every page render calls, and these saves replace it); a library
  file's base is kept per working copy (`libraryBases`), the sites' in `sitesBase`. A silent merge says so on the status
  line; a clash reopens the dialog on their version with my changes on top (`recordClash`, `showClashMarks`: amber
  banner, `.field-mine` teal edge, "↳ Hotel wrote: …"), or redraws a whole-page save the same way, unsaved (`pageClash`,
  `showListClash`); deleting a record someone changed asks first (`confirmDeleteAnyway`). After a clash the working copy
  holds theirs, so a stale copy is never sent with the new revision. Records are found by `id` (crew, guests, menus,
  cocktails, drink stocks, sites), never by array index. Coming back to the tab redraws the open page when one of its
  files moved (`checkFreshness`, `GET /api/admin/revisions`, a raw fetch that is not session activity), never over
  unsaved edits or an open dialog.
- `node --test` runs the tests in `test/` (209 tests), which cover `routes-core`, `itinerary-core`, `charters-core`,
  `guest-preview-core`, `pack-core`, `pack-render`, `drag-reorder`, `merge-core`, the startup order
  (`startup-order.test.js` runs `admin.js` alone in a `vm` sandbox) and the refused-access card (`refused-access.test.js`,
  the same sandbox)
```

- [ ] **Step 2: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs(admin): merge-core.js and the conflict-safe saves (spec C)"
```

---

### Task 9: Browser pass (this session)

On a scratch server running the c-01 server branch (data copy with `127.0.0.1/32` in `admin.bridgeCidrs`, served at
`http://<name>.localhost:<port>` so the admin cookie is not shared), `ADMIN_STATIC_DIR` = this worktree, a Node script
saving as "the other person" with its own Charter or Hotel session. Repeat the dry run's list (above): a silent merge
on Crew, a clash on Crew and on a Hotel guest (Save, and Cancel keeps theirs), deleted-by-them on Crew, a Charter Admin
page clash, delete anyway on Drink Stocks, both-reordered menus with the day numbers checked in `menus.json`, a Site
Editor clash, a Cocktails page clash, freshness on `visibilitychange` (and no redraw while the page has unsaved edits),
no console errors. Also: a menu day dialog clash (two people editing the same day's dinner), the Route page's Edit
site on a stale copy (the dialog shows "… changed the sites at …"; a second save merges), and 820 / 390 px widths for
the banner. Then the final Sonnet review, the PR, and the release order in plan c-01.
