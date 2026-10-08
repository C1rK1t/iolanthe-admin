// Routes panel UI helpers shared by routes.js, routes-popup.js and routes-io.js: el(), the icon set, fmtPos and
// the modal shell. No route state lives here.
(function () {
  "use strict";

  const ICONS = {
    check: '<path d="M5 12l5 5 9-10"/>',
    cancel: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    saveAs: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    select: '<path d="M5 3l14 7-6 2-2 6z"/>',
    add: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
    anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/>',
    erase: '<path d="M7 21h10M5 15l9-9 5 5-9 9H8z"/>',
    join: '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><path d="M7 6h3a4 4 0 0 1 4 4v0a4 4 0 0 0 4 4h3M7 18h3a4 4 0 0 0 4-4"/><path d="M18 11l3 3-3 3"/>',
    import: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    export: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    revert: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    start: '<path d="M6 4l14 8-14 8z"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>'
  };
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    });
    children.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) node.append(c.nodeType ? c : String(c)); });
    return node;
  }

  const fmtPos = (p) => `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}`;

  // ---------- modals (house rules: green save + red cancel top right, outside click and Escape cancel) ----------
  let current = null; // closes the open routes modal, if any

  function openModal({ title, body, onSave, saveTitle, wide, onClose, cancelIcon, cancelTitle }) {
    if (current) current();
    const backdrop = el("div", { class: "routes-modal modal-backdrop" });
    let busy = false;
    const close = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
      if (current === close) current = null;
      if (onClose) onClose();
    };
    const save = async () => {
      if (busy) return;
      busy = true;
      try { if ((await onSave()) !== false) close(); } finally { busy = false; }
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const iconBtn = (icon, label, cls, onclick) => {
      const btn = el("button", { type: "button", class: `icon-btn ${cls}`, title: label, "aria-label": label, onclick });
      btn.innerHTML = svg(icon);
      return btn;
    };
    const card = el("div", { class: "modal-card", role: "dialog", "aria-modal": "true", style: wide ? "width:min(640px,100%)" : null },
      el("div", { class: "card-header" },
        el("h2", {}, title),
        el("div", { class: "icon-row" },
          onSave ? iconBtn("check", saveTitle || "Save", "success", save) : null,
          iconBtn(cancelIcon || "cancel", cancelTitle || "Cancel", "danger", close))),
      el("div", { class: "modal-body" }, body));
    backdrop.append(card);
    backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
    document.addEventListener("keydown", onKey);
    document.body.append(backdrop);
    current = close;
    setTimeout(() => { const f = card.querySelector(".modal-body input, .modal-body select, .modal-body textarea"); if (f) f.focus(); }, 0);
    return { close, card };
  }

  const closeModal = () => { if (current) current(); };

  window.IolantheRoutesUi = Object.freeze({ ICONS, svg, el, fmtPos, openModal, closeModal });
})();
