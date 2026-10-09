# Style rollout A: the Admin-wide re-skin. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every Admin page gets the Route page's look (muted cards, square icon buttons, uppercase field labels,
off-white inputs, restyled left-hand menu) with no change to any page's layout, wording or button positions.

**Architecture:** CSS only. The existing classes in `admin.css` are restyled in place (spec SA-3); `admin.js`,
`routes.css`, `stop-cards.css`, `charter-gantt.css` and `guest-preview.css` are not edited. Every replacement below is
verbatim: find the OLD block exactly once in `admin.css` and replace it with the NEW block. Blocks marked
"all occurrences" are replaced everywhere they appear.

**Tech stack:** plain CSS, no build step. Spec: `docs/style-rollout/spec-a-reskin.md` (decisions SA-1 … SA-11).

**Branch:** `feat/style-reskin` off `main`. `admin.css` is CRLF; edit with the Edit tool or a CRLF-aware script, never
`sed -i`. Never `git checkout` anything else while working; another session uses a worktree under
`worktrees/charter-pack`, not this checkout.

**Known side effects (accepted):** the Gantt band (`charter-gantt.css` paints with `var(--panel)`) and the Guest view
frame become off-white `#f4f6f7` instead of white, because `--panel` changes; this matches the muted look. Inputs
inside labels stop inheriting the label's bold and size (today the Charter Admin inputs are 11.8 px bold); they become
15 px regular, as in the approved mockup.

---

### Task 1: Tokens

**Files:** Modify `admin.css:1-16`

- [ ] **Step 1: Replace the `:root` block**

OLD
```css
:root {
  color-scheme: light;
  --bg: #f3f5f6;
  --panel: #ffffff;
  --ink: #172026;
  --muted: #5f6b73;
  --line: #d7dde1;
  --accent: #176f7a;
  --accent-dark: #0e4f58;
  --danger: #a93d35;
  --ok: #28724c;
  --shadow: 0 12px 30px rgba(16, 32, 40, 0.12);
  --admin-icon-button-size: 36px;
  --admin-icon-button-icon-size: 21px;
  --admin-icon-button-preview-icon-size: 23px;
}
```
NEW
```css
:root {
  color-scheme: light;
  --bg: #f3f5f6;
  /* Style rollout A (2026-10-09): the Route page's muted palette for the whole admin */
  --panel: #f4f6f7; /* inputs, rows, inner panels, secondary buttons */
  --card-bg: #dfe6e9; /* cards and dialogs */
  --field-line: #cfd8dc;
  --ink: #172026;
  --muted: #5f6b73;
  --line: #d7dde1;
  --accent: #176f7a;
  --accent-dark: #0e4f58;
  --danger: #a93d35;
  --ok: #28724c;
  --warn: #9a6400;
  --warn-bg: #fff4dc;
  --shadow: 0 12px 30px rgba(16, 32, 40, 0.18);
  --admin-icon-button-size: 40px;
  --admin-icon-button-icon-size: 21px;
  --admin-icon-button-preview-icon-size: 23px;
}
```

- [ ] **Step 2: Commit** — `git add admin.css` then
  `git commit -m "style(admin): Route page tokens for the whole admin"`

### Task 2: Buttons (SA-5, SA-6)

**Files:** Modify `admin.css` (text buttons ~62-115, preview button ~354, icon button base ~2417, ≤480 px query ~2899)

- [ ] **Step 1: Text button base**

OLD
```css
button {
  min-height: 48px;
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  padding: 0.75rem 1rem;
  cursor: pointer;
}
```
NEW
```css
button {
  min-height: 40px;
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
}
```

- [ ] **Step 2: Secondary colour**

OLD
```css
button.secondary,
button.admin-icon-button--secondary {
  background: #e8eef0;
  color: var(--ink);
}
```
NEW
```css
button.secondary,
button.admin-icon-button--secondary {
  background: var(--panel);
  color: var(--ink);
}
```

- [ ] **Step 3: Danger hover**

OLD
```css
button.admin-icon-button--danger:focus {
  background: #b93434;
}
```
NEW
```css
button.admin-icon-button--danger:focus {
  background: #8a312b;
}
```

- [ ] **Step 4: Success colours**

OLD
```css
button.success,
button.admin-icon-button--success {
  background: #2f9a61;
}
```
NEW
```css
button.success,
button.admin-icon-button--success {
  background: var(--ok);
}
```

OLD
```css
button.admin-icon-button--success:focus {
  background: #237347;
}
```
NEW
```css
button.admin-icon-button--success:focus {
  background: #1e5a3b;
}
```

- [ ] **Step 5: Preview button square**

OLD
```css
button.admin-icon-button--preview {
  border-radius: 999px;
```
NEW
```css
button.admin-icon-button--preview {
  border-radius: 6px;
```

- [ ] **Step 6: Icon button base square**

OLD
```css
.admin-icon-button,
.icon-button {
  width: var(--admin-icon-button-size);
  min-width: var(--admin-icon-button-size);
  min-height: var(--admin-icon-button-size);
  border-radius: 999px;
```
NEW
```css
.admin-icon-button,
.icon-button {
  width: var(--admin-icon-button-size);
  min-width: var(--admin-icon-button-size);
  min-height: var(--admin-icon-button-size);
  border-radius: 6px;
```

- [ ] **Step 7: Phone width keeps a larger icon button**

OLD
```css
@media (max-width: 480px) {
  :root {
    --admin-icon-button-size: 40px;
```
NEW
```css
@media (max-width: 480px) {
  :root {
    --admin-icon-button-size: 44px;
```

- [ ] **Step 8: Commit** — `git commit -m "style(admin): square 40 px icon buttons and Route page text buttons"`

### Task 3: Inputs and labels (SA-7)

**Files:** Modify `admin.css` (~379-402)

- [ ] **Step 1: Inputs**

OLD
```css
input,
select,
textarea {
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--ink);
  padding: 0.7rem 0.8rem;
}
```
NEW
```css
input,
select,
textarea {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--field-line);
  border-radius: 6px;
  background: var(--panel);
  color: var(--ink);
  padding: 0.45rem 0.7rem;
}

input:focus,
select:focus,
textarea:focus {
  outline: 2px solid var(--accent);
  outline-offset: 0;
  border-color: var(--accent);
}
```

- [ ] **Step 2: Labels**

OLD
```css
label {
  display: grid;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 700;
}
```
NEW
```css
label {
  display: grid;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 700;
}

/* Field labels (a label holding a text field, select or textarea) read like the Route page's: small uppercase.
   Checkbox and radio labels keep sentence case. The field itself does not inherit the label's type. */
label:has(input:not([type="checkbox"]):not([type="radio"]), select, textarea) {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

label input,
label select,
label textarea {
  font-size: 0.94rem;
  font-weight: 400;
  text-transform: none;
  letter-spacing: normal;
}

label .field-hint {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}
```

- [ ] **Step 3: Commit** — `git commit -m "style(admin): uppercase field labels and off-white inputs"`

### Task 4: Cards, dialogs and inner panels (SA-8)

**Files:** Modify `admin.css` (~638, ~707, ~882, and the panels listed below)

- [ ] **Step 1: Dialog card**

OLD
```css
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 1.2rem;
  overflow: hidden;
}
```
NEW
```css
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card-bg);
  box-shadow: var(--shadow);
  padding: 1.2rem;
  overflow: hidden;
}
```

- [ ] **Step 2: Decision card** (`.admin-decision-card`)

OLD
```css
  overscroll-behavior: contain;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 1.2rem;
}
```
NEW
```css
  overscroll-behavior: contain;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card-bg);
  box-shadow: var(--shadow);
  padding: 1.2rem;
}
```

- [ ] **Step 3: Card**

OLD
```css
.card {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
```
NEW
```css
.card {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--card-bg);
```

- [ ] **Step 4: Near-white inner panels — all occurrences** (11: `.charter-notes-block`, `.settings-subsection`,
  `.weather-admin-status div`, `.editor-item`, `.record-row`, `.galley-guest-row`, `.welcome-message-panel`,
  `.menu-clone-source-row`, `.menu-day-modal-item`, `.crew-import-option`, `.cocktail-ingredient-row`)

OLD (all occurrences)
```css
  background: #fbfcfc;
```
NEW
```css
  background: var(--panel);
```

- [ ] **Step 5: White inner panels** — in each of these six rules replace `background: #fff;` with
  `background: var(--panel);`. Each OLD below is unique:

OLD
```css
  padding: 0.9rem 1rem;
  background: #fff;
```
NEW
```css
  padding: 0.9rem 1rem;
  background: var(--panel);
```
(`.form-section`)

OLD
```css
  overflow: hidden;
  background: #fff;
}
```
NEW
```css
  overflow: hidden;
  background: var(--panel);
}
```
(`.segmented`)

For `.charter-notes-grid-item`, `.telemetry-picker__option`, `.image-reference-row` and `.clone-panel` the line
`background: #fff;` is not unique on its own: open each rule by its selector and change that one line inside it.
Leave `.section-nav button[aria-pressed="true"]` (Task 5) and every `.menu-*`, `.print-*`, stock-report and
`.login-department*` rule alone.

- [ ] **Step 6: Commit** — `git commit -m "style(admin): muted cards and dialogs, off-white inner panels"`

### Task 5: Left-hand menu (SA-4)

**Files:** Modify `admin.css` (~1000-1025, ≤700 px query ~2750, ≤480 px query ~2938)

- [ ] **Step 1: Menu buttons**

OLD
```css
.section-nav button {
  width: 100%;
  min-height: 54px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 0.94rem;
  line-height: 1.1;
  padding: 0.6rem 0.7rem;
}

.section-nav button:hover,
.section-nav button:focus {
  background: rgba(255, 255, 255, 0.25);
}

.section-nav button[aria-pressed="true"] {
  background: #fff;
  color: var(--ink);
}
```
NEW
```css
.section-nav button {
  width: 100%;
  min-height: 48px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.2;
  padding: 0.5rem 0.7rem;
}

.section-nav button:hover,
.section-nav button:focus {
  background: rgba(255, 255, 255, 0.18);
}

.section-nav button[aria-pressed="true"] {
  background: var(--card-bg);
  color: var(--accent-dark);
  box-shadow: inset 4px 0 0 var(--accent);
}
```
(The `.galley-guests-alert` rules after it are more specific and keep their red and yellow.)

- [ ] **Step 2: Phone width** — in the ≤480 px query:

OLD
```css
  .section-nav button {
    font-size: 0.86rem;
    min-height: 46px;
  }
```
NEW
```css
  .section-nav button {
    font-size: 0.7rem;
    min-height: 46px;
  }
```

- [ ] **Step 3: Commit** — `git commit -m "style(admin): Route page look for the left-hand menu"`

### Task 6: Release prep and verification

- [ ] **Step 1: Bump the asset version** — replace every `?v=admin-warn-fade3` in `index.html` with
  `?v=admin-reskin-a` (26 occurrences; the five `?v=1` icon links stay). Check:
  `grep -c "admin-reskin-a" index.html` → 26.
- [ ] **Step 2: Tests** — `node --test` → 146 pass (no JS changed).
- [ ] **Step 3: Diff check** — `git diff main --stat` shows only `admin.css` and `index.html`;
  `git diff main --ignore-cr-at-eol admin.css | grep "^[-+]" | grep -c "menu-\|print-\|login-department"` → 0.
- [ ] **Step 4: Browser pass (reviewer, not the implementer)** on `http://127.0.0.1:8000/admin/?key=<urlKey>`,
  1400 × 900 then 820 × 1180. Measure with `getComputedStyle`:
  - any `.admin-icon-button`: 40 × 40, radius 6px; a `button.success`: `rgb(40, 114, 76)`.
  - `.card`, `.modal-card`: background `rgb(223, 230, 233)`, radius 10px.
  - a field label: 12px uppercase; its input: 15.04px, weight 400, background `rgb(244, 246, 247)`, 40px tall.
  - selected `.section-nav button`: background `rgb(223, 230, 233)`, inset teal bar.
  - Route & Itinerary: the header's `.icon-btn` still 40 × 40 / radius 6px, stop strip unchanged, map height unchanged.
  - Every panel in Charter, Galley, Hotel and Settings opens with no console errors; one dialog per section; the
    menu paper preview and a print preview look as before; Drink Stocks' action column still fits two icon buttons.
- [ ] **Step 5: Commit, push, PR** — `git add index.html` →
  `git commit -m "chore(admin): assets admin-reskin-a"`, `git push -u origin feat/style-reskin`,
  `gh pr create` (body: spec link, decisions, measured numbers, the two accepted side effects). Merge on David's word.

## Self-review

- Spec coverage: SA-1/SA-10 Task 1; SA-5/SA-6 Task 2; SA-7 Task 3; SA-8 Task 4; SA-4 Task 5; SA-9 by omission (Task 4
  Step 5 and Task 6 Step 3 guard it); SA-11 needs no CSS (no existing markup to hang a separator on without JS) and
  waits for phase B; SA-2 is this plan being A only.
- Every OLD block was copied from `admin.css` at main `92efc44` and dry-run: a script applied all 19 blocks plus the
  four per-rule `#fff` edits to a copy; every single-occurrence OLD matched exactly once, the `#fbfcfc` block 11 times.
