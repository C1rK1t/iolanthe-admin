(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.IolanthePackRender = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // HTML for the charter pack (spec P §2): the cover, then each section as a heading and a list of blocks that
  // charter-pack.js lays out onto A4 pages. Takes the plain model from pack-core.js and uses no admin globals or DOM,
  // so phase 2 (the zenvue.app mini-site) can run it away from the boat.

  const esc = (value) => String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const lines = (value) => esc(value).replace(/\r?\n/g, "<br>");
  const block = (cls, inner) => `<div class="pack-block ${cls}">${inner}</div>`;
  // One <p> per line, so a long text can continue on the next page (charter-pack.js splits blocks by paragraph).
  const paragraphs = (value) => String(value || "").split(/\r?\n+/).map((t) => t.trim()).filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join("");

  // Behind every inner page: IOLANTHE up the left edge, full height, and the vessel line art lower right (P-D8).
  const BRANDING = '<svg class="pack-wm" viewBox="0 0 210 297" preserveAspectRatio="none" aria-hidden="true">'
    + '<text transform="rotate(-90)" x="-291" y="35" textLength="285" lengthAdjust="spacing">IOLANTHE</text></svg>'
    + '<div class="pack-lineart" aria-hidden="true"></div>';

  function coverHtml(model, opts) {
    const stats = model.stats.map((s) => `<div><b>${esc(s.value)}</b>${esc(s.label)}</div>`).join("");
    const preparedFor = model.preparedFor || model.coverNote
      ? `<div class="pack-for">${model.preparedFor ? `<span class="pack-for-label">Prepared for</span><span class="pack-for-name">${esc(model.preparedFor)}</span>` : ""}`
        + `${model.coverNote ? `<p class="pack-note">${lines(model.coverNote)}</p>` : ""}</div>`
      : "<div></div>";
    return `<div class="pack-cover">`
      + `<img class="pack-cover-photo" src="${esc(opts.coverUrl)}" alt="">`
      + `<div class="pack-cover-text">`
      + `<div class="pack-kicker">${esc(model.kicker)}</div>`
      + `<div class="pack-ornament" aria-hidden="true">✦</div>`
      + `<h1 class="pack-title">${esc(model.vesselName)}</h1>`
      + `<div class="pack-rule"></div>`
      + (model.routeSummary ? `<p class="pack-route">${esc(model.routeSummary)}</p>` : "")
      + (model.dates ? `<p class="pack-dates">${esc(model.dates)}</p>` : "")
      + `<div class="pack-stats">${stats}</div>`
      + `<div class="pack-cover-foot">${preparedFor}<img class="pack-stamp" src="${esc(opts.stampUrl)}" alt="Princess Iolanthe stamp"></div>`
      + `</div></div>`;
  }

  function summaryBlocks(section) {
    const facts = section.rows.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join("");
    return [
      block("pack-facts-block", `<dl class="pack-facts">${facts}</dl>`),
      ...(section.welcome ? [block("pack-welcome", paragraphs(section.welcome))] : [])
    ];
  }

  function routeBlocks(section) {
    const key = section.key.map((k) => `<li>${esc(k)}</li>`).join("");
    const map = block("pack-map-block", `<div class="pack-map" data-pack-map></div><ol class="pack-key">${key}</ol>`);
    const days = section.days.map((d) => {
      const stops = d.stops.map((s) => {
        const items = s.activities.map((a) => `<li><b>${esc(a.title)}</b>${a.notes ? ` <span>${esc(a.notes)}</span>` : ""}</li>`).join("");
        return `<div class="pack-stop"><div class="pack-stop-name">${esc(s.name)}${s.times ? ` <span class="pack-times">${esc(s.times)}</span>` : ""}</div>`
          + (items ? `<ul>${items}</ul>` : "") + "</div>";
      }).join("");
      return block("pack-day", `<div class="pack-day-head"><b>Day ${d.day}</b><span>${esc(d.date)}</span></div>${stops}`);
    });
    return [map, ...days];
  }

  function crewBlocks(section) {
    const out = [];
    if (section.description) out.push(block("pack-welcome", paragraphs(section.description)));
    if (section.details.length) {
      out.push(block("pack-specs-block", `<h3>The yacht</h3><dl class="pack-specs">${section.details.map((d) => `<dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd>`).join("")}</dl>`));
    }
    section.groups.forEach((g) => {
      out.push(block("pack-crew-group", `<h3>${esc(g.title)}</h3><ul>${g.members.map((m) => `<li><b>${esc(m.name)}</b>${m.position ? ` <span>${esc(m.position)}</span>` : ""}</li>`).join("")}</ul>`));
    });
    section.notes.forEach((n) => {
      out.push(block("pack-notes", `<h3>${esc(n.title)}</h3><ul>${n.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`));
    });
    return out;
  }

  function dishList(items) {
    return `<ul>${items.map((i) => `<li><b>${esc(i.name)}</b>${i.description ? ` <span>${esc(i.description)}</span>` : ""}</li>`).join("")}</ul>`;
  }

  function menuBlocks(section) {
    const menus = section.menus.map((m) => block("pack-menu-day",
      `<div class="pack-day-head"><b>${esc(m.label)}</b>${m.notes ? `<span>${esc(m.notes)}</span>` : ""}</div>`
      + m.courses.map((c) => `<div class="pack-course"><h4>${esc(c.title)}</h4>${dishList(c.items)}</div>`).join("")));
    const drinks = section.drinks.map((d, i) => block("pack-drinks",
      `${i === 0 ? '<h3 class="pack-subhead">Your drinks</h3>' : ""}<div class="pack-course"><h4>${esc(d.title)}</h4>${dishList(d.items)}</div>`));
    return [...menus, ...drinks];
  }

  const BUILDERS = { summary: summaryBlocks, route: routeBlocks, crew: crewBlocks, menus: menuBlocks };

  // -> { cover: html, sections: [{ id, title (HTML-escaped), blocks: [html] }] }
  function renderPack(model, opts) {
    return {
      cover: coverHtml(model, opts || {}),
      sections: model.sections.map((s) => ({ id: s.id, title: esc(s.title), blocks: BUILDERS[s.id](s) }))
    };
  }

  function sectionHead(title, continued) {
    return `<header class="pack-section-head"><h2>${title}${continued ? " <span>continued</span>" : ""}</h2></header>`;
  }

  // footer and head are HTML (escape text with esc first). charter-pack.js lays pages out before it knows the total and
  // rewrites [data-page-no] afterwards.
  function pageHtml({ head, blocks, footer, subjectToChange, pageNo, total }) {
    return `<section class="pack-page pack-page--inner">${BRANDING}`
      + `<div class="pack-body">${head}<div class="pack-flow">${blocks.join("")}</div></div>`
      + `<footer class="pack-foot"><span>${footer}</span>${subjectToChange ? "<span>Proposal — subject to change</span>" : ""}<span data-page-no>${pageNo} / ${total}</span></footer>`
      + `</section>`;
  }

  function coverPageHtml(cover) {
    return `<section class="pack-page pack-page--cover">${cover}</section>`;
  }

  return { esc, renderPack, sectionHead, pageHtml, coverPageHtml };
});
