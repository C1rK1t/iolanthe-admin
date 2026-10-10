# Crew order: admin plan

Spec: iolanthe-server `docs/superpowers/specs/2026-10-10-crew-order-design.md` (§5 admin). Needs the server PR first (an older server 404s the GET: fallback order, no grips).

1. **`crew-order-core.js`** (pure, Node module too) and `test/crew-order-core.test.js` against the shared fixture copy `test/fixtures/crew-order-cases.json`.
2. **Crew page**: load `GET /api/admin/crew-order` in `bindCrewPanel`; `sortedCrewEntries` uses the order; rows get a grip; `IolantheDragReorder.attach` per department group; save with `base_revision` and the 409 re-apply loop; damaged strip with no grips; freshness list; remove the Position order field from the member dialog. `index.html` script tag and `?v=` bump.
3. **Tests** in the `vm` sandbox style (`test/crew-order-page.test.js`).
4. **CLAUDE.md** (Stack list, Crew page notes).
5. **Browser check** on a scratch server (`crew-order.localhost:<port>`), then review and PR.
