# Spec P — Plan 1: Server (charter pack presets and the cover photo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply [spec-pack.md](../spec-pack.md) §5 to `iolanthe-server`: a per-charter pack preset
(`charters/<id>/pack.json`, revision-checked) and an uploaded cover photo, behind four admin endpoints.

**Architecture:** The rules go into a new pure module `lib/charter-pack.js` (defaults, lenient read, strict save with a
409 on a stale revision, cover type/size checks, cover clean-up) with `node --test` coverage, mirroring
`lib/reserved-periods.js`. `server.js` gets one `require`, one detail key (`pack`, so a 409 carries the stored pack) and
one route block in front of the existing `charterMatch`. No new data endpoint: the admin reads the pack's content from
`GET /api/charter?charter=<id>` (spec B).

**Tech Stack:** Node ≥ 18, no dependencies, `node --test` (107 tests → 117). Server repo from `main` at `f8939ab` or later.

**Dry-run (done while planning):** this plan's text was applied to a copy of `main` at `f8939ab`: `node --test` 117/117,
`node --check server.js` clean, and the endpoints exercised on a scratch server (Task 4's script): 401 without a session,
404 unknown charter, defaults at revision 0, PUT 200 → 409 stale → 400 bad theme, JPEG cover 201 / GIF 400, cover GET
200 `image/jpeg`, 401 without a session, 404 for traversal and missing names, 405 for DELETE.

**Shared checkout hazard:** another Claude session may work in the same checkouts. **Never** run `git checkout`,
`git switch`, `git stash` or `git add -A` in the main checkouts under `S:/Users/David/OneDrive/Maker Space/GitHub`. All
work happens in the worktree made in Task 0. Stage files by name. Before each task, run
`git -C <worktree> branch --show-current` and expect `feat/charter-pack-server`.

**Reading before you start (in the worktree):** `lib/reserved-periods.js` (the pattern this module copies),
`server.js` around `ADMIN_ERROR_DETAIL_KEYS` (~29), `hasCharterDirectory` (~3997), `serveFileFromDirectory` (~7494),
`readRequestBody` (~5625), `requireAdmin` (~5832) and the `charterMatch` block (~7326).

---

## File structure

| File | Responsibility in this plan |
|---|---|
| `lib/charter-pack.js` (new) + `test/charter-pack.test.js` (new) | Task 1: `defaultPack`, `readPack`, `savePack`, `coverExtension`, `saveCover`, `coverFile` |
| `server.js` | Task 2: require, the `pack` detail key, the `/api/admin/charter/<id>/pack…` block |
| `CLAUDE.md` | Task 3: data layout, endpoint list, test count |

---

### Task 0: Worktree (this session runs it, not an implementer)

```bash
cd "S:/Users/David/OneDrive/Maker Space/GitHub/iolanthe/iolanthe-server"
git fetch -q origin
git worktree add "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/charter-pack/iolanthe/iolanthe-server" -b feat/charter-pack-server origin/main
cd "S:/Users/David/OneDrive/Maker Space/GitHub/worktrees/charter-pack/iolanthe/iolanthe-server" && node --test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected `ℹ pass 107`, `ℹ fail 0`. Every path below is relative to this worktree.

---

### Task 1: `lib/charter-pack.js` and its tests

**Files:** create `test/charter-pack.test.js`, create `lib/charter-pack.js`

- [ ] **Step 1: Write the failing test.** Create `test/charter-pack.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const lib = require("../lib/charter-pack");

function charterDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "charter-pack-"));
}

const VALID = { theme: "b", type: "brief", prepared_for: "Mr & Mrs Csaba", cover_note: "Dear both,\nWelcome.", sections: ["route", "summary"], cover_image: null };

test("readPack: no file gives the defaults at revision 0", () => {
  assert.deepEqual(lib.readPack(charterDir()), { revision: 0, pack: lib.defaultPack() });
  assert.deepEqual(lib.defaultPack(), {
    theme: "a", type: "proposal", prepared_for: "", cover_note: "", sections: ["summary", "route", "crew", "menus"], cover_image: null
  });
});

test("readPack: a damaged file falls back to the defaults, a partly bad one keeps its good fields", () => {
  const dir = charterDir();
  fs.writeFileSync(path.join(dir, "pack.json"), "{not json");
  assert.deepEqual(lib.readPack(dir), { revision: 0, pack: lib.defaultPack() });
  fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify({ revision: 3, theme: "z", type: "brief", sections: ["menus", "nope"], cover_image: "cover-1.jpg" }));
  const read = lib.readPack(dir);
  assert.equal(read.revision, 3);
  assert.equal(read.pack.theme, "a");
  assert.equal(read.pack.type, "brief");
  assert.deepEqual(read.pack.sections, ["menus"]);
  assert.equal(read.pack.cover_image, null, "a cover file that does not exist reads as null");
});

test("savePack: writes with revision + 1 and keeps sections in the standard order", () => {
  const dir = charterDir();
  const saved = lib.savePack(dir, { pack: VALID, base_revision: 0 });
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.pack.sections, ["summary", "route"]);
  assert.deepEqual(lib.readPack(dir), saved);
  assert.equal(lib.savePack(dir, { pack: { ...VALID, theme: "c" }, base_revision: 1 }).revision, 2);
});

test("savePack: a stale or missing base_revision is a 409 carrying the stored pack", () => {
  const dir = charterDir();
  lib.savePack(dir, { pack: VALID, base_revision: 0 });
  for (const base of [0, 5, undefined, "1"]) {
    assert.throws(() => lib.savePack(dir, { pack: VALID, base_revision: base }), (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "revision");
      assert.equal(error.revision, 1);
      assert.equal(error.pack.theme, "b");
      return true;
    });
  }
});

test("savePack: each bad field is a 400 naming the field", () => {
  const cases = [
    [{ theme: "d" }, "theme"],
    [{ type: "invoice" }, "type"],
    [{ prepared_for: "x".repeat(121) }, "prepared_for"],
    [{ prepared_for: 7 }, "prepared_for"],
    [{ cover_note: "x".repeat(601) }, "cover_note"],
    [{ sections: [] }, "sections"],
    [{ sections: ["summary", "prices"] }, "sections"],
    [{ sections: "summary" }, "sections"],
    [{ cover_image: "../settings.json" }, "cover_image"],
    [{ cover_image: "cover-1700000000000.jpg" }, "cover_image"]
  ];
  for (const [patch, field] of cases) {
    const dir = charterDir();
    assert.throws(() => lib.savePack(dir, { pack: { ...VALID, ...patch }, base_revision: 0 }), (error) => {
      assert.equal(error.statusCode, 400, field);
      assert.equal(error.field, field);
      return true;
    });
  }
});

test("coverExtension: JPEG, PNG and WebP only", () => {
  assert.equal(lib.coverExtension("image/jpeg"), ".jpg");
  assert.equal(lib.coverExtension("image/jpg"), ".jpg");
  assert.equal(lib.coverExtension("image/png; charset=binary"), ".png");
  assert.equal(lib.coverExtension("IMAGE/WEBP"), ".webp");
  for (const bad of ["image/gif", "video/mp4", "application/octet-stream", "", undefined]) {
    assert.equal(lib.coverExtension(bad), null, String(bad));
  }
});

test("saveCover: stores cover-<time>.<ext> in pack/ and refuses empty, oversized and unsupported files", () => {
  const dir = charterDir();
  const name = lib.saveCover(dir, Buffer.from("jpeg bytes"), "image/jpeg", 1700000000000);
  assert.equal(name, "cover-1700000000000.jpg");
  assert.equal(fs.readFileSync(path.join(dir, "pack", name), "utf8"), "jpeg bytes");
  assert.throws(() => lib.saveCover(dir, Buffer.alloc(0), "image/jpeg"), (e) => e.statusCode === 400);
  assert.throws(() => lib.saveCover(dir, Buffer.from("x"), "image/gif"), (e) => e.statusCode === 400);
  assert.throws(() => lib.saveCover(dir, Buffer.alloc(lib.COVER_MAX_BYTES + 1), "image/png"), (e) => e.statusCode === 413);
});

test("covers: a save deletes only the cover it replaces; an upload deletes older unclaimed uploads", () => {
  const dir = charterDir();
  const files = () => fs.readdirSync(path.join(dir, "pack")).sort();
  const first = lib.saveCover(dir, Buffer.from("one"), "image/png", 1700000000000);
  assert.equal(lib.savePack(dir, { pack: { ...VALID, cover_image: first }, base_revision: 0 }).pack.cover_image, first);
  const second = lib.saveCover(dir, Buffer.from("two"), "image/webp", 1700000000001);
  assert.deepEqual(files(), [first, second], "the cover in use stays until the pack stops using it");
  const third = lib.saveCover(dir, Buffer.from("three"), "image/jpeg", 1700000000002);
  assert.deepEqual(files(), [first, third], "an upload nobody saved is replaced by the next upload");
  lib.savePack(dir, { pack: { ...VALID, cover_image: third }, base_revision: 1 });
  assert.deepEqual(files(), [third]);
  lib.savePack(dir, { pack: { ...VALID, cover_image: null }, base_revision: 2 });
  assert.deepEqual(files(), []);
});

test("covers: a save that still names the old cover does not delete a fresh upload", () => {
  const dir = charterDir();
  const files = () => fs.readdirSync(path.join(dir, "pack")).sort();
  const a = lib.saveCover(dir, Buffer.from("a"), "image/jpeg", 1700000000000);
  lib.savePack(dir, { pack: { ...VALID, cover_image: a }, base_revision: 0 });
  const b = lib.saveCover(dir, Buffer.from("b"), "image/jpeg", 1700000000001);
  lib.savePack(dir, { pack: { ...VALID, prepared_for: "typed meanwhile", cover_image: a }, base_revision: 1 });
  assert.deepEqual(files(), [a, b]);
  assert.equal(lib.savePack(dir, { pack: { ...VALID, cover_image: b }, base_revision: 2 }).pack.cover_image, b);
  assert.deepEqual(files(), [b]);
});

test("coverFile: only an existing cover-<time>.<ext> inside pack/", () => {
  const dir = charterDir();
  const name = lib.saveCover(dir, Buffer.from("x"), "image/jpeg", 1700000000000);
  assert.equal(lib.coverFile(dir, name), path.join(dir, "pack", name));
  for (const bad of ["cover-1700000000001.jpg", "../pack.json", "cover-1700000000000.jpg/..", "pack.json", "", null]) {
    assert.equal(lib.coverFile(dir, bad), null, String(bad));
  }
});
```

- [ ] **Step 2: Run it and watch it fail.** `node --test test/charter-pack.test.js` → fails with
  `Cannot find module '../lib/charter-pack'`.

- [ ] **Step 3: Write the module.** Create `lib/charter-pack.js`:

```js
"use strict";

// Charter pack presets and cover photos (charter rework spec P §5).
// charters/<id>/pack.json holds {revision, theme, type, prepared_for, cover_note, sections, cover_image}, saved with a
// base_revision like the reserved periods; uploaded covers live in charters/<id>/pack/cover-<epoch ms>.<ext>.
// Pure Node built-ins. Every function takes the charter's directory, so tests can use temp folders.

const fs = require("fs");
const path = require("path");

const FILE_NAME = "pack.json";
const COVER_DIR = "pack";
const THEMES = ["a", "b", "c"];
const TYPES = ["proposal", "brief"];
const SECTIONS = ["summary", "route", "crew", "menus"];
const PREPARED_FOR_MAX = 120;
const COVER_NOTE_MAX = 600;
const COVER_MAX_BYTES = 10 * 1024 * 1024;
const COVER_TYPES = Object.freeze({ "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp" });
const COVER_NAME_RE = /^cover-\d{13}\.(?:jpg|png|webp)$/;

function httpError(statusCode, message, extra) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return Object.assign(error, extra || {});
}

function defaultPack() {
  return { theme: "a", type: "proposal", prepared_for: "", cover_note: "", sections: [...SECTIONS], cover_image: null };
}

function coverFile(charterDir, name) {
  if (typeof name !== "string" || !COVER_NAME_RE.test(name)) {
    return null;
  }
  const filePath = path.join(charterDir, COVER_DIR, name);
  try {
    return fs.statSync(filePath).isFile() ? filePath : null;
  } catch (error) {
    return null;
  }
}

// Lenient: keeps each good field of a stored pack and replaces the rest with the defaults.
function normalizePack(raw, charterDir) {
  const source = raw && typeof raw === "object" ? raw : {};
  const base = defaultPack();
  const sections = Array.isArray(source.sections) ? SECTIONS.filter((id) => source.sections.includes(id)) : [];
  return {
    theme: THEMES.includes(source.theme) ? source.theme : base.theme,
    type: TYPES.includes(source.type) ? source.type : base.type,
    prepared_for: typeof source.prepared_for === "string" ? source.prepared_for.slice(0, PREPARED_FOR_MAX) : "",
    cover_note: typeof source.cover_note === "string" ? source.cover_note.slice(0, COVER_NOTE_MAX) : "",
    sections: sections.length ? sections : base.sections,
    cover_image: coverFile(charterDir, source.cover_image) ? source.cover_image : null
  };
}

function readPack(charterDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(charterDir, FILE_NAME), "utf8"));
    return { revision: Number.isInteger(raw && raw.revision) ? raw.revision : 0, pack: normalizePack(raw, charterDir) };
  } catch (error) {
    return { revision: 0, pack: defaultPack() };
  }
}

// Strict: the first problem as {field, message}, or null.
function packError(pack, charterDir) {
  const p = pack && typeof pack === "object" ? pack : {};
  if (!THEMES.includes(p.theme)) return { field: "theme", message: "Theme must be a, b or c." };
  if (!TYPES.includes(p.type)) return { field: "type", message: "Pack type must be proposal or brief." };
  if (typeof p.prepared_for !== "string" || p.prepared_for.length > PREPARED_FOR_MAX) {
    return { field: "prepared_for", message: `Prepared for must be text of at most ${PREPARED_FOR_MAX} characters.` };
  }
  if (typeof p.cover_note !== "string" || p.cover_note.length > COVER_NOTE_MAX) {
    return { field: "cover_note", message: `The cover note must be text of at most ${COVER_NOTE_MAX} characters.` };
  }
  if (!Array.isArray(p.sections) || !p.sections.length || p.sections.some((id) => !SECTIONS.includes(id))) {
    return { field: "sections", message: "Pick at least one section: summary, route, crew or menus." };
  }
  if (p.cover_image !== null && !coverFile(charterDir, p.cover_image)) {
    return { field: "cover_image", message: "The cover photo was not found. Upload it again." };
  }
  return null;
}

// Deletes the cover files not named in keep (an array of names).
function removeCoversExcept(charterDir, keep) {
  const dir = path.join(charterDir, COVER_DIR);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (error) {
    return;
  }
  names.filter((name) => COVER_NAME_RE.test(name) && !keep.includes(name)).forEach((name) => fs.rmSync(path.join(dir, name), { force: true }));
}

// body: { pack, base_revision } -> { revision, pack }
function savePack(charterDir, body) {
  const request = body && typeof body === "object" ? body : {};
  const stored = readPack(charterDir);
  if (!Number.isInteger(request.base_revision) || request.base_revision !== stored.revision) {
    throw httpError(409, "Someone else changed this charter pack. It has been reloaded.", { code: "revision", revision: stored.revision, pack: stored.pack });
  }
  const problem = packError(request.pack, charterDir);
  if (problem) {
    throw httpError(400, problem.message, { field: problem.field });
  }
  const p = request.pack;
  const pack = {
    theme: p.theme,
    type: p.type,
    prepared_for: p.prepared_for,
    cover_note: p.cover_note,
    sections: SECTIONS.filter((id) => p.sections.includes(id)),
    cover_image: p.cover_image
  };
  const saved = { revision: stored.revision + 1, ...pack };
  const filePath = path.join(charterDir, FILE_NAME);
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(saved, null, 2)}\n`);
  fs.renameSync(`${filePath}.tmp`, filePath);
  // Only the cover this save replaces goes: a newer upload that a later save will name must survive (review H2).
  if (stored.pack.cover_image && stored.pack.cover_image !== pack.cover_image) {
    fs.rmSync(path.join(charterDir, COVER_DIR, stored.pack.cover_image), { force: true });
  }
  return { revision: saved.revision, pack };
}

function coverExtension(contentType) {
  const type = String(contentType || "").toLowerCase().split(";")[0].trim();
  return COVER_TYPES[type] || null;
}

// Stores an uploaded cover and returns its file name. The pack keeps using its old cover until it is saved with the new
// one; older uploads that no save ever named are deleted here.
function saveCover(charterDir, buffer, contentType, now = Date.now()) {
  const extension = coverExtension(contentType);
  if (!extension) {
    throw httpError(400, "The cover photo must be a JPEG, PNG or WebP image.");
  }
  if (!buffer || !buffer.length) {
    throw httpError(400, "The uploaded cover photo is empty.");
  }
  if (buffer.length > COVER_MAX_BYTES) {
    throw httpError(413, "The cover photo must be 10 MB or smaller.");
  }
  const dir = path.join(charterDir, COVER_DIR);
  fs.mkdirSync(dir, { recursive: true });
  let stamp = now;
  while (fs.existsSync(path.join(dir, `cover-${stamp}${extension}`))) {
    stamp += 1;
  }
  const name = `cover-${stamp}${extension}`;
  fs.writeFileSync(path.join(dir, name), buffer, { flag: "wx" });
  removeCoversExcept(charterDir, [readPack(charterDir).pack.cover_image, name]);
  return name;
}

module.exports = { FILE_NAME, THEMES, TYPES, SECTIONS, COVER_MAX_BYTES, defaultPack, readPack, savePack, coverExtension, saveCover, coverFile };
```

- [ ] **Step 4: Run the tests.** `node --test test/charter-pack.test.js` → `ℹ pass 10`, `ℹ fail 0`. Then `node --test` →
  `ℹ pass 117`, `ℹ fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add lib/charter-pack.js test/charter-pack.test.js
git commit -m "feat(pack): charter pack presets and cover photos (lib/charter-pack.js)"
```

---

### Task 2: the endpoints in `server.js`

**Files:** modify `server.js` (three replacements; each OLD block occurs exactly once)

- [ ] **Step 1: Apply the replacements.**

**1. require** — in `server.js`, replace

```js
const siteMediaLib = require("./lib/site-media");
```

with

```js
const siteMediaLib = require("./lib/site-media");
const charterPackLib = require("./lib/charter-pack");
```

**2. detail keys** — in `server.js`, replace

```js
const ADMIN_ERROR_DETAIL_KEYS = Object.freeze(["overlaps", "forced_charter", "field", "errors", "code", "revision", "periods"]);
```

with

```js
const ADMIN_ERROR_DETAIL_KEYS = Object.freeze(["overlaps", "forced_charter", "field", "errors", "code", "revision", "periods", "pack"]);
```

**3. pack routes** — in `server.js`, replace

```js
    const charterMatch = pathname.match(/^\/api\/admin\/charter\/([a-z0-9-]+)(?:\/(save|itinerary\/save|itinerary\/import))?$/);
```

with

```js
    // Charter pack (spec P §5): the preset, the cover upload and the cover file, for a Charter-section admin session.
    const packMatch = pathname.match(/^\/api\/admin\/charter\/([a-z0-9-]+)\/pack(?:\/cover(?:\/([A-Za-z0-9.-]+))?)?$/);
    if (packMatch) {
      // The session check comes first, so a caller without one cannot tell which charter ids exist.
      if (!requireAdmin(request, response, url, { section: "charter" })) {
        return;
      }
      const charterId = validateAdminCharterId(packMatch[1]);
      if (!charterId || !hasCharterDirectory(charterId)) {
        sendAdminError(response, 404, "Unknown charter");
        return;
      }
      const charterDir = path.join(CHARTERS_DIR, charterId);
      const isCover = pathname.includes("/pack/cover");
      const coverName = packMatch[2] || "";
      if (!isCover && method === "GET") {
        sendJson(response, 200, charterPackLib.readPack(charterDir));
        return;
      }
      if (!isCover && method === "PUT") {
        sendJson(response, 200, charterPackLib.savePack(charterDir, toPlainObject(await readJsonRequestBody(request))));
        return;
      }
      if (isCover && !coverName && method === "POST") {
        const length = Number(request.headers["content-length"]);
        if (Number.isFinite(length) && length > charterPackLib.COVER_MAX_BYTES) {
          sendAdminError(response, 413, "The cover photo is too large (10 MB max).");
          return;
        }
        // "too large" in the message is what the admin error handler maps to 413 for a chunked upload.
        const buffer = await readRequestBody(request, charterPackLib.COVER_MAX_BYTES, "The cover photo is too large (10 MB max).");
        sendJson(response, 201, { cover_image: charterPackLib.saveCover(charterDir, buffer, request.headers["content-type"]) });
        return;
      }
      if (isCover && coverName && method === "GET") {
        const filePath = charterPackLib.coverFile(charterDir, coverName);
        if (!filePath) {
          sendAdminError(response, 404, "Cover photo not found");
          return;
        }
        serveFileFromDirectory(path.dirname(filePath), `/${coverName}`, request, response);
        return;
      }
      sendAdminError(response, 405, "Method not allowed");
      return;
    }

    const charterMatch = pathname.match(/^\/api\/admin\/charter\/([a-z0-9-]+)(?:\/(save|itinerary\/save|itinerary\/import))?$/);
```

- [ ] **Step 2: Check.** `node --check server.js` (no output) and `node --test` → `ℹ pass 117`.

- [ ] **Step 3: Commit.**

```bash
git add server.js
git commit -m "feat(pack): GET/PUT /api/admin/charter/<id>/pack and the cover upload and file"
```

---

### Task 3: `CLAUDE.md`

**Files:** modify `CLAUDE.md` (three replacements)

- [ ] **Step 1: Apply the replacements.**

**1. data layout** — in `CLAUDE.md`, replace

```md
      track.json
      itinerary.v1.json          kept by migration v4 (also planned-route.v1.json); no longer read
```

with

```md
      track.json
      pack.json                  Charter pack preset (spec P): {revision, theme, type, prepared_for, cover_note, sections,
                                 cover_image}; absent = the defaults (lib/charter-pack.js)
      pack/                      the uploaded pack cover, cover-<epoch ms>.<jpg|png|webp>; unused ones go on save
      itinerary.v1.json          kept by migration v4 (also planned-route.v1.json); no longer read
```

**2. pack endpoints** — in `CLAUDE.md`, replace

```md
- `scripts/check-charter-endpoints.sh` is the manual checklist for these (usage in its header).
```

with

```md
- `scripts/check-charter-endpoints.sh` is the manual checklist for these (usage in its header).

Charter pack endpoints (spec P, a Charter-section admin session; rules in `lib/charter-pack.js`):

- `GET /api/admin/charter/<id>/pack` -> `{revision, pack}` (the defaults at revision 0 when there is no `pack.json`).
- `PUT /api/admin/charter/<id>/pack {pack, base_revision}` -> `{revision, pack}`; 409 `{code:"revision", revision, pack}`
  on a stale revision, 400 `{error, field}` on a bad field. Saving removes the cover files the pack no longer uses.
- `POST /api/admin/charter/<id>/pack/cover` (raw JPEG / PNG / WebP body, `Content-Type` set, 10 MB max) -> 201
  `{cover_image}`; the pack uses it once a PUT names it.
- `GET /api/admin/charter/<id>/pack/cover/<cover-…>` serves it (admin session only; 404 for any other name).
- The pack's content comes from `GET /api/charter?charter=<id>` (spec B's admin preview of the guest payload).
```

**3. test count** — in `CLAUDE.md`, replace

```md
Unit tests use Node's built-in runner (no npm packages): `npm test` (same as `node --test`, 92 tests). They cover `lib/`
```

with

```md
Unit tests use Node's built-in runner (no npm packages): `npm test` (same as `node --test`, 117 tests). They cover `lib/`
```

- [ ] **Step 2: Commit.**

```bash
git add CLAUDE.md
git commit -m "docs: charter pack endpoints and data layout"
```

---

### Task 4: Endpoint check on a scratch server (this session runs it, not an implementer)

Start the worktree's server with `preview_start` on its own port (8010+) with a **copy** of
`iolanthe/iolanthe-server/data-scratch` as `DATA_DIR` (a temporary `.claude/launch.json` entry; remove it afterwards),
then from the data copy's folder run:

```bash
node -e '
const s=require("./settings.json");const fs=require("fs");const B="http://127.0.0.1:<port>";const K="?key="+s.admin.urlKey;
(async()=>{
const r=await fetch(B+"/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:s.admin.urlKey,department:"charter",password:s.admin.passwords.charter})});
const C={Cookie:(r.headers.get("set-cookie")||"").split(";")[0]};
const show=async(label,res)=>{const t=await res.text();console.log(label.padEnd(28),res.status,t.slice(0,100).replace(/\s+/g," "));return t};
await show("GET no session",await fetch(B+"/api/admin/charter/csaba/pack"+K));
await show("GET default",await fetch(B+"/api/admin/charter/csaba/pack"+K,{headers:C}));
await show("GET unknown charter",await fetch(B+"/api/admin/charter/nobody/pack"+K,{headers:C}));
const put=(body)=>fetch(B+"/api/admin/charter/csaba/pack"+K,{method:"PUT",headers:{...C,"Content-Type":"application/json"},body:JSON.stringify(body)});
const pack={theme:"b",type:"brief",prepared_for:"Mr & Mrs Csaba",cover_note:"",sections:["summary","route"],cover_image:null};
await show("PUT ok",await put({pack,base_revision:0}));
await show("PUT stale",await put({pack,base_revision:0}));
await show("PUT bad theme",await put({pack:{...pack,theme:"q"},base_revision:1}));
const up=await fetch(B+"/api/admin/charter/csaba/pack/cover"+K,{method:"POST",headers:{...C,"Content-Type":"image/jpeg"},body:Buffer.from([0xff,0xd8,0xff,0xe0,1,2,3])});
const name=JSON.parse(await show("POST cover",up)).cover_image;
await show("POST gif",await fetch(B+"/api/admin/charter/csaba/pack/cover"+K,{method:"POST",headers:{...C,"Content-Type":"image/gif"},body:"GIF89a"}));
await show("PUT with cover",await put({pack:{...pack,cover_image:name},base_revision:1}));
const g=await fetch(B+"/api/admin/charter/csaba/pack/cover/"+name+K,{headers:C});console.log("GET cover".padEnd(28),g.status,g.headers.get("content-type"));
await show("GET cover no session",await fetch(B+"/api/admin/charter/csaba/pack/cover/"+name+K));
await show("GET cover traversal",await fetch(B+"/api/admin/charter/csaba/pack/cover/..%2Fpack.json"+K,{headers:C}));
await show("GET cover missing",await fetch(B+"/api/admin/charter/csaba/pack/cover/cover-1700000000000.jpg"+K,{headers:C}));
await show("DELETE",await fetch(B+"/api/admin/charter/csaba/pack"+K,{method:"DELETE",headers:C}));
})()'
```

Expected statuses in order: 401, 200 (revision 0, theme a), 404, 200 (revision 1), 409 (`code: revision`, `pack`),
400 (`field: theme`), 201 (`cover_image: cover-….jpg`), 400, 200 (revision 2), 200 `image/jpeg`, 401, 404, 404, 405.

Then push the branch and open the PR (`feat/charter-pack-server`). **Release order:** this server PR is merged and
released (`cd /opt/projects/vessel && ./update.sh` on docker-vm) before the admin PR from plans P-2 and P-3 merges.
