// Routes panel (Charter → Routes). Uses window.IolantheAdmin (admin.js) and window.IolantheRoutesCore.
(function () {
  "use strict";

  function render() {
    return '<section class="card full routes-panel" id="routes-panel"><p>Loading routes…</p></section>';
  }

  function bind() {}

  window.IolantheRoutes = Object.freeze({ render, bind });
})();
