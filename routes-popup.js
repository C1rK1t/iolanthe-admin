// Routes panel: the point popup (Select mode). Heading, "Make stop at" / "Make stop here", the moved warning, Name,
// Sites served, Make anchorage / Make site, Remove stop and Delete. Created once per bind() by routes.js; route state
// stays in routes.js.
(function () {
  "use strict";

  const NEARBY_ANCHORAGE_NM = 2; // "Make stop at" offers anchorages within this distance of a waypoint
  const MAX_NEARBY_BUTTONS = 3;
  const SITES_NEAR_NM = 5;       // sites within this distance of a stop are grouped first in "Sites served"

  // ctx: { core, places, getWork, getMap, editPoints(fn, opts), editPointsQuiet(fn), makeStopAtAnchorage(i, anchorage), status(message, tone) }
  function create(ctx) {
    const { core: c, places } = ctx;
    const { el, fmtPos } = window.IolantheRoutesUi;
    const points = () => ctx.getWork().route.points;
    const closePopup = () => { const map = ctx.getMap(); if (map) map.closePopup(); };

    function pointPopup(i) {
      const p = points()[i];
      const stopIndex = points().slice(0, i + 1).filter(c.isStop).length;
      const nameInput = el("input", { type: "text", value: p.name || "", placeholder: "Optional label" });
      const heading = el("h3", {});
      const headingText = (q) => (c.isStop(q) ? `Stop ${stopIndex} · ${q.name || "Stop"}` : (q.name ? `Waypoint · ${q.name}` : "Waypoint"));
      heading.textContent = headingText(p);
      // Commit on Enter or blur without rebuilding the map, so the popup (and a Delete click) is not disturbed.
      const commitName = () => {
        const name = nameInput.value.trim();
        const current = points()[i];
        if (!current || name === (current.name || "")) return;
        ctx.editPointsQuiet((pts) => c.replaceAt(pts, i, { ...current, name: name || undefined }));
        heading.textContent = headingText(points()[i]);
      };
      nameInput.addEventListener("change", commitName);
      nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commitName(); nameInput.blur(); } });
      const stop = c.isStop(p);
      const atAnchorage = Boolean(p.anchorage_id); // a plain stop (stop: true) has no anchorage
      const anchorage = atAnchorage && places ? places.findAnchorage(p.anchorage_id) : null;
      const moved = places ? c.anchorageMovedM(p, anchorage) : 0;
      // Waypoints and plain stops are offered nearby anchorages; only waypoints get "Make stop here".
      const nearby = !atAnchorage && places ? c.nearbyAnchorages(places.anchorages(), p, NEARBY_ANCHORAGE_NM).slice(0, MAX_NEARBY_BUTTONS) : [];
      const sub = `${fmtPos(p)}${anchorage && anchorage.depth_m ? ` · ${anchorage.depth_m} m` : ""}`;
      const box = el("div", { class: "pop" },
        heading,
        el("div", { class: "sub" }, sub),
        nearby.length || !stop ? el("div", { class: "nearby" },
          nearby.map((n) => el("button", { type: "button", class: "text-btn", onclick: () => ctx.makeStopAtAnchorage(i, n.anchorage) },
            `Make stop at ${n.anchorage.name}`, el("span", { class: "d" }, `${n.nm.toFixed(1)} nm`))),
          !stop ? el("button", { type: "button", class: "text-btn", title: "Hold position or drift here, with no anchorage", onclick: () => makeStopHere(i) },
            "Make stop here", el("span", { class: "d" }, "no anchorage")) : null) : null,
        moved ? el("div", { class: "banner warn", style: "margin-bottom:8px" }, `The anchorage has moved ${Math.round(moved)} m since this stop was placed. `,
          el("button", { type: "button", class: "link-btn", onclick: () => ctx.editPoints((pts) => c.replaceAt(pts, i, { ...pts[i], latitude: anchorage.latitude, longitude: anchorage.longitude }), { popup: i }) }, "Move stop to anchorage")) : null,
        el("div", { class: "field" }, el("label", {}, "Name"), nameInput));
      if (stop && places) box.append(sitesServedPicker(i));
      box.append(el("div", { class: "actions" },
        !atAnchorage && places ? el("button", { type: "button", class: "text-btn secondary", onclick: () => makeAnchorageFromPoint(i) }, "Make anchorage") : null,
        places ? el("button", { type: "button", class: "text-btn secondary", onclick: () => makeSiteFromPoint(i) }, "Make site") : null,
        stop ? el("button", { type: "button", class: "text-btn secondary", title: "Turn this stop back into a waypoint", onclick: () => removeStopAt(i) }, "Remove stop") : null,
        el("button", { type: "button", class: "text-btn danger-text", onclick: () => { closePopup(); ctx.editPoints((pts) => c.removeAt(pts, i)); } }, "Delete")));
      return box;
    }

    function makeStopHere(i) {
      closePopup();
      ctx.editPoints((pts) => c.makePlainStop(pts, i), { popup: i });
      ctx.status(`Stop added here: ${points()[i].name}`, "");
    }

    function removeStopAt(i) {
      closePopup();
      ctx.editPoints((pts) => c.removeStop(pts, i), { popup: i });
      ctx.status("Stop removed. The point is a waypoint again.", "");
    }

    async function makeAnchorageFromPoint(i) {
      const p = points()[i];
      closePopup();
      // A plain stop's automatic "Stop" / "Stop #02" name isn't a useful anchorage name: use the "Anchorage" default.
      const name = p.name && !/^Stop( #\d+)?$/.test(p.name) ? p.name : undefined;
      const saved = await places.openAnchorageModal(null, p, { name });
      if (saved && points()[i]) ctx.makeStopAtAnchorage(i, saved);
    }

    async function makeSiteFromPoint(i) {
      const p = points()[i];
      closePopup();
      const saved = await places.openSiteModal(null, p, { name: p.name });
      if (!saved || !points()[i]) return;
      ctx.editPoints((pts) => {
        const current = pts[i];
        const next = { ...current, name: current.name || saved.title };
        if (!c.isStop(current)) next.site_id = saved.id;
        return c.replaceAt(pts, i, next);
      }, { popup: i });
    }

    // Tick list of sites a stop serves: those within SITES_NEAR_NM first, then the rest. Each tick re-opens the popup.
    function sitesServedPicker(i) {
      const p = points()[i];
      const chosen = new Set(p.site_ids || []);
      const sorted = places.sites().map((s) => ({ s, d: c.distNm(p, s) })).sort((x, y) => x.d - y.d);
      const row = ({ s, d }) => el("label", { class: d <= SITES_NEAR_NM ? "near" : "" },
        el("input", {
          type: "checkbox", checked: chosen.has(s.id),
          onchange: (e) => {
            const ticked = e.target.checked;
            ctx.editPoints((pts) => {
              const current = pts[i];
              const ids = ticked ? [...(current.site_ids || []).filter((x) => x !== s.id), s.id] : (current.site_ids || []).filter((x) => x !== s.id);
              return c.replaceAt(pts, i, { ...current, site_ids: ids });
            }, { popup: i });
          }
        }), s.title || s.id, el("span", { class: "d" }, `${d.toFixed(1)} nm`));
      const near = sorted.filter((x) => x.d <= SITES_NEAR_NM);
      const far = sorted.filter((x) => x.d > SITES_NEAR_NM);
      return el("div", { class: "field" }, el("label", {}, "Sites served"),
        el("div", { class: "site-pick" },
          near.length ? el("div", { class: "grp" }, `Within ${SITES_NEAR_NM} nm`) : null, near.map(row),
          far.length ? el("div", { class: "grp" }, "Further away") : null, far.map(row)));
    }

    return { pointPopup };
  }

  window.IolantheRoutesPopup = Object.freeze({ create });
})();
