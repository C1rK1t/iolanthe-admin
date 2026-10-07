// Routes panel: places (anchorages and sites) on the map. Used by routes.js; pure logic is in routes-core.js.
// Task 3 is display only. Editing hooks (openAnchorageModal, deleteAnchorage, moveAnchorage, openSiteModal) arrive in Tasks 4 and 5.
(function () {
  "use strict";

  const SNAP_PX = 24; // a dropped point within this screen distance of an anchorage marker snaps to it (spec §7 Q4)
  const ANCHOR_PATH = '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/>';
  const ANCHOR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true">${ANCHOR_PATH}</svg>`;

  function create(ctx) {
    const { A, core } = ctx;
    let anchorageList = [];
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

    return { ctx, core, load, anchorages, sites, findAnchorage, findSite, draw, anchorageUnder };
  }

  window.IolantheRoutesPlaces = Object.freeze({ create });
})();
