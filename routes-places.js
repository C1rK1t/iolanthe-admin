// Routes panel: places (anchorages and sites) on the map. Used by routes.js; pure logic is in routes-core.js.
// Display, plus anchorage editing (modal, move, delete) and the Site Editor bridge (openSiteModal).
(function () {
  "use strict";

  const SNAP_PX = 24; // a dropped point within this screen distance of an anchorage marker snaps to it (spec §7 Q4)
  const ANCHOR_PATH = '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/>';
  const DEFAULT_ANCHORAGE_NAME = "Anchorage";
  const ANCHOR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">${ANCHOR_PATH}</svg>`;

  function create(ctx) {
    const { A, core, el } = ctx;
    let anchorageList = [];
    let loaded = false; // true once load() has stored the list; until then "no such anchorage" means "not known yet"
    let shownLayers = { sites: true, anchorages: true };

    const ll = (p) => [p.latitude, p.longitude];
    const sites = () => ((ctx.getSiteLibrary() || {}).sites || []).filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
    const anchorages = () => anchorageList;
    const findAnchorage = (id) => (id ? anchorageList.find((a) => a.id === id) || null : null);
    const findSite = (id) => (id ? sites().find((s) => s.id === id) || null : null);

    // GET /api/admin/anchorages; the caller handles errors (the panel still works without places).
    async function load() {
      const data = await A.api("/api/admin/anchorages");
      anchorageList = Array.isArray(data.anchorages) ? data.anchorages : [];
      loaded = true;
      return anchorageList;
    }

    // Draws site pins and anchorage markers into groups.sites / groups.anchorages.
    // opts: { mode, layers, usedAnchorageIds, divIcon, onAnchorageClick(a), onSiteClick(s), onAnchorageDragEnd(a, latlng) }
    function draw(L, groups, opts) {
      const o = opts || {};
      shownLayers = { sites: true, anchorages: true, ...(o.layers || {}) };
      const used = o.usedAnchorageIds || new Set();
      const icon = o.divIcon;
      const noop = () => {};
      if (shownLayers.sites) {
        sites().forEach((s) => {
          L.marker(ll(s), { icon: icon('<div class="mk-site"></div>'), title: s.title || "Site", zIndexOffset: 100 })
            .on("click", () => (o.onSiteClick || noop)(s))
            .addTo(groups.sites);
        });
      }
      if (shownLayers.anchorages) {
        anchorageList.forEach((a) => {
          const html = `<div class="mk-anch ${used.has(a.id) ? "" : "dim"}">${ANCHOR_SVG}</div><div class="mk-label">${A.escapeHtml(a.name)}</div>`;
          const title = `${a.name}${a.depth_m ? ` · ${a.depth_m} m` : ""}`;
          L.marker(ll(a), { icon: icon(html), title, draggable: o.mode === "anchorage", zIndexOffset: 200 })
            .on("click", () => (o.onAnchorageClick || noop)(a))
            .on("dragend", (e) => (o.onAnchorageDragEnd || noop)(a, e.target.getLatLng()))
            .addTo(groups.anchorages);
        });
      }
    }

    // The nearest visible anchorage marker within SNAP_PX of latlng (screen distance, so it works at any zoom), or null.
    function anchorageUnder(map, latlng) {
      if (!map || !shownLayers.anchorages) return null;
      const pt = map.latLngToContainerPoint(latlng);
      const hits = anchorageList
        .map((a) => ({ a, px: pt.distanceTo(map.latLngToContainerPoint(ll(a))) }))
        .filter((x) => x.px <= SNAP_PX)
        .sort((x, y) => x.px - y.px);
      return hits.length ? hits[0].a : null;
    }

    // Saves run one at a time, each building its library from the latest list, so overlapping saves cannot revert each other.
    let chain = Promise.resolve();
    const enqueue = (fn) => (chain = chain.then(fn, fn));

    // Saves the WHOLE library: buildNext(currentList) returns the new list. The server derives a new anchorage's id
    // from its name. Replaces the local list; rejects to the caller on failure.
    function saveLibrary(buildNext) {
      return enqueue(async () => {
        const data = await A.api("/api/admin/anchorages/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anchorages: buildNext(anchorageList) })
        });
        anchorageList = Array.isArray(data.anchorages) ? data.anchorages : [];
        loaded = true;
        return anchorageList;
      });
    }

    const routeNames = (routes) => routes.map((r) => r.name).join(", ");

    // Create (anchorage null, pos given) or edit an anchorage. Resolves to the saved anchorage, or null on cancel.
    // opts: { name } pre-fills a new anchorage's name (default "Anchorage"). A new or renamed anchorage whose name
    // another anchorage already uses is saved as "<name> #NN" (core.uniqueName).
    function openAnchorageModal(anchorage, pos, opts) {
      return new Promise((resolve) => {
        const isNew = !anchorage;
        const src = anchorage || { name: (opts && opts.name) || DEFAULT_ANCHORAGE_NAME, latitude: pos.latitude, longitude: pos.longitude, depth_m: "", notes: "" };
        const f = {
          name: el("input", { type: "text", value: src.name, maxlength: "80" }),
          lat: el("input", { type: "number", step: "0.0001", value: src.latitude.toFixed(5) }),
          lon: el("input", { type: "number", step: "0.0001", value: src.longitude.toFixed(5) }),
          depth: el("input", { type: "number", step: "0.5", min: "0", value: src.depth_m === undefined || src.depth_m === null ? "" : src.depth_m }),
          notes: el("textarea", { maxlength: "500" })
        };
        f.notes.value = src.notes || "";
        const users = anchorage ? core.routesUsingAnchorage(ctx.getRoutes(), anchorage.id) : [];
        let settled = false;
        const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
        let modal = null;
        const body = el("div", {},
          el("div", { class: "field" }, el("label", {}, "Name"), f.name),
          el("div", { class: "grid2" },
            el("div", { class: "field" }, el("label", {}, "Latitude"), f.lat),
            el("div", { class: "field" }, el("label", {}, "Longitude"), f.lon)),
          el("div", { class: "field" }, el("label", {}, "Depth (m, optional)"), f.depth),
          el("div", { class: "field" }, el("label", {}, "Notes (max 500 characters)"), f.notes),
          users.length ? el("p", { class: "meta" }, `Used as a stop on: ${routeNames(users)}.`) : null,
          anchorage ? el("div", {}, el("button", { type: "button", class: "text-btn danger-text", onclick: () => { modal.close(); deleteAnchorage(anchorage); } }, "Delete anchorage")) : null);
        modal = ctx.openModal({
          title: isNew ? "New anchorage" : "Edit anchorage",
          saveTitle: "Save anchorage",
          body,
          onClose: () => finish(null),
          onSave: async () => {
            const name = f.name.value.trim();
            const latitude = parseFloat(f.lat.value);
            const longitude = parseFloat(f.lon.value);
            if (!name) { A.setStatus("Name is required.", "error"); return false; }
            if (!(Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180)) { A.setStatus("Enter a valid latitude and longitude.", "error"); return false; }
            const entry = { ...(anchorage || {}), name, latitude, longitude, notes: f.notes.value.slice(0, 500) };
            if (f.depth.value === "") delete entry.depth_m; else entry.depth_m = parseFloat(f.depth.value);
            const renamed = isNew || name !== anchorage.name;
            let beforeIds = new Set();
            let finalName = name;
            try {
              // The final name is worked out against the latest list, inside the queued save.
              const saved = await saveLibrary((list) => {
                beforeIds = new Set(list.map((a) => a.id));
                const others = list.filter((a) => isNew || a.id !== anchorage.id).map((a) => a.name);
                finalName = renamed ? core.uniqueName(name, others) : name;
                const next = { ...entry, name: finalName };
                return isNew ? [...list, next] : list.map((a) => (a.id === anchorage.id ? next : a));
              });
              const result = isNew
                ? saved.find((a) => !beforeIds.has(a.id)) || saved.find((a) => a.name === finalName)
                : saved.find((a) => a.id === anchorage.id);
              const done = isNew ? "Anchorage created." : "Anchorage saved.";
              A.setStatus(finalName !== name ? `Saved as "${finalName}".` : done, "ok");
              finish(result || null);
              ctx.onChanged();
              return true;
            } catch (error) {
              A.setStatus(error.message, "error");
              return false;
            }
          }
        });
      });
    }

    // Confirms (listing the routes that use it), then saves the library without it. Resolves true when deleted.
    async function deleteAnchorage(anchorage) {
      const users = core.routesUsingAnchorage(ctx.getRoutes(), anchorage.id);
      const message = users.length
        ? `Delete "${anchorage.name}"? It is a stop on: ${routeNames(users)}. Those stops keep their position and name.`
        : `Delete "${anchorage.name}"?`;
      const ok = await A.showAdminConfirm({ title: "Delete anchorage?", message, confirmLabel: "Delete", cancelLabel: "Cancel", tone: "danger" });
      if (!ok) return false;
      try {
        await saveLibrary((list) => list.filter((a) => a.id !== anchorage.id));
      } catch (error) {
        A.setStatus(error.message, "error");
        return false;
      }
      A.setStatus("Anchorage deleted.", "ok");
      ctx.onChanged();
      return true;
    }

    // Saves a new position (after a drag). On failure the marker is redrawn at its old position.
    async function moveAnchorage(anchorage, latlng) {
      try {
        await saveLibrary((list) => list.map((a) => (a.id === anchorage.id ? { ...a, latitude: latlng.lat, longitude: latlng.lng } : a)));
      } catch (error) {
        A.setStatus(error.message, "error");
        ctx.onChanged();
        return false;
      }
      const users = core.routesUsingAnchorage(ctx.getRoutes(), anchorage.id).length;
      A.setStatus(`Anchorage moved and saved.${users ? ` Stops on ${users} route${users === 1 ? "" : "s"} stay put and show a warning.` : ""}`, "ok");
      ctx.onChanged();
      return true;
    }

    // Opens the admin's own Site Editor dialog (#dialog-modal). Resolves to the saved site, or null when the dialog
    // closes without saving. opts: { name, description } pre-fill a new site; pos gives its position.
    function openSiteModal(site, pos, opts) {
      return new Promise((resolve) => {
        const siteLibrary = ctx.getSiteLibrary();
        if (!siteLibrary) { resolve(null); return; }
        let observer = null;
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          if (observer) observer.disconnect();
          resolve(value);
          if (value) ctx.onChanged();
        };
        const defaults = site ? undefined : { title: (opts && opts.name) || "", description: (opts && opts.description) || "", latitude: pos.latitude, longitude: pos.longitude, tags: [], images: [], media: [] };
        A.openSiteEditorModal(siteLibrary, site, async (saved) => {
          const next = A.normalizeSiteLibrary({
            ...siteLibrary,
            sites: site ? siteLibrary.sites.map((s) => (s.id === site.id ? saved : s)) : [...siteLibrary.sites, saved]
          });
          await A.saveSitesLibrary(next, site ? "Site saved." : "Site created.");
          // saveSitesLibrary updates next.sites; copy the result back so the panel's library object stays current
          siteLibrary.sites = next.sites;
          finish(site ? next.sites.find((s) => s.id === site.id) || saved : next.sites[next.sites.length - 1] || saved);
        }, defaults);
        const dialog = document.getElementById("dialog-modal");
        if (!dialog) { finish(null); return; }
        observer = new MutationObserver(() => { if (dialog.classList.contains("hidden")) finish(null); });
        observer.observe(dialog, { attributes: true, attributeFilter: ["class"] });
      });
    }

    return { ctx, core, load, isLoaded: () => loaded, anchorages, sites, findAnchorage, findSite, draw, anchorageUnder, openAnchorageModal, deleteAnchorage, moveAnchorage, openSiteModal };
  }

  window.IolantheRoutesPlaces = Object.freeze({ create });
})();
