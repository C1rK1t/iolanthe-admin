"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../pack-core.js");
const render = require("../pack-render.js");
const csaba = require("./fixtures/pack-csaba.json");

const OPTS = { coverUrl: "/admin/assets/pack/hero-default.jpg", stampUrl: "/admin/assets/pack/stamp.png" };
const model = (extra) => core.buildPackModel(csaba, { ...core.defaultPack(), ...(extra || {}) });

test("renderPack: the cover carries the facts, the photo and the stamp", () => {
  const out = render.renderPack(model({ prepared_for: "Mr & Mrs Csaba", cover_note: "Line one\nLine two" }), OPTS);
  assert.match(out.cover, /class="pack-kicker">Charter Proposal</);
  assert.match(out.cover, /M\/Y Princess Iolanthe/);
  assert.match(out.cover, /Cebu Yacht Club → Port Caltom/);
  assert.match(out.cover, /1 – 9 November 2026/);
  assert.match(out.cover, /src="\/admin\/assets\/pack\/hero-default\.jpg"/);
  assert.match(out.cover, /src="\/admin\/assets\/pack\/stamp\.png"/);
  assert.match(out.cover, /Mr &amp; Mrs Csaba/);
  assert.match(out.cover, /Line one<br>Line two/);
});

test("renderPack: no Prepared for block when it is empty", () => {
  const out = render.renderPack(model(), OPTS);
  assert.doesNotMatch(out.cover, /Prepared for/);
});

test("renderPack: escapes text from the charter data", () => {
  const data = { ...csaba, itinerary: { ...csaba.itinerary, welcome_message: "<script>alert(1)</script> & \"hi\"" } };
  const out = render.renderPack(core.buildPackModel(data, core.defaultPack()), OPTS);
  const html = out.sections[0].blocks.join("");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;hi&quot;/);
});

test("renderPack: the welcome text becomes one paragraph per line", () => {
  const data = { ...csaba, itinerary: { ...csaba.itinerary, welcome_message: "First line.\n\nSecond line.\nThird." } };
  const out = render.renderPack(core.buildPackModel(data, core.defaultPack()), OPTS);
  assert.equal(out.sections[0].blocks[1], '<div class="pack-block pack-welcome"><p>First line.</p><p>Second line.</p><p>Third.</p></div>');
});

test("renderPack: one entry per section, with blocks the paginator can move", () => {
  const out = render.renderPack(model(), OPTS);
  assert.deepEqual(out.sections.map((s) => s.id), ["summary", "route", "crew", "menus"]);
  assert.deepEqual(out.sections.map((s) => s.title), ["Charter Summary", "Route &amp; Itinerary", "Crew &amp; Yacht", "Menus &amp; Drinks"]);
  const route = out.sections[1];
  assert.match(route.blocks[0], /data-pack-map/);
  assert.match(route.blocks[0], /<li>1–2 · Cebu Yacht Club<\/li>/);
  assert.equal(route.blocks.length, 1 + 11, "the map block, then one block per day");
  assert.match(route.blocks[2], /Day 2/);
  assert.match(route.blocks[2], /Mon 2 Nov/);
  out.sections.forEach((s) => s.blocks.forEach((b) => assert.match(b, /^<div class="pack-block/)));
});

test("pageHtml: inner pages carry the branding layers and the footer", () => {
  const html = render.pageHtml({ head: render.sectionHead("Menus &amp; Drinks", false), blocks: ["<div class=\"pack-block\">x</div>"], footer: "Charter Proposal · A &amp; B", subjectToChange: true, pageNo: 3, total: 7 });
  assert.match(html, /^<section class="pack-page pack-page--inner">/);
  assert.match(html, /<svg class="pack-wm"/);
  assert.match(html, />IOLANTHE<\/text>/);
  assert.match(html, /class="pack-lineart"/);
  assert.match(html, /Charter Proposal · A &amp; B/);
  assert.match(html, /Proposal — subject to change/);
  assert.match(html, />3 \/ 7</);
  assert.doesNotMatch(render.pageHtml({ head: "", blocks: [], footer: "Charter Brief", subjectToChange: false, pageNo: 2, total: 2 }), /subject to change/);
});

test("sectionHead: a continued page says so", () => {
  assert.match(render.sectionHead("Route &amp; Itinerary", false), /<h2>Route &amp; Itinerary<\/h2>/);
  assert.match(render.sectionHead("Route &amp; Itinerary", true), /<h2>Route &amp; Itinerary <span>continued<\/span><\/h2>/);
});

test("coverPageHtml wraps the cover", () => {
  assert.equal(render.coverPageHtml("<div>c</div>"), '<section class="pack-page pack-page--cover"><div>c</div></section>');
});
