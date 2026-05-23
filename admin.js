(function () {
  const params = new URLSearchParams(window.location.search);
  const adminKey = params.get("key") || "";
  const state = {
    role: "denied",
    department: "",
    authenticated: false,
    activeCharter: "",
    charters: [],
    allowedSections: [],
    allowedDepartments: [],
    isDevelopment: false,
    loginDepartmentTitle: "",
    sectionPanels: {
      charter: "info",
      galley: "menus",
      hotel: "guests",
      settings: "passwords"
    },
    selectedSection: "",
    selectedCharter: "",
    selectedItineraryPlan: "primary",
    itinerarySelectedDays: {},
    sites: [],
    selections: {},
    bundle: null
  };

  const ITINERARY_PLANS = Object.freeze([
    { id: "primary", label: "Primary Itinerary", planKey: "primary", legacyDaysKey: "days", idPrefix: "day" },
    { id: "alternative", label: "Alternative Itinerary", planKey: "alternative", legacyDaysKey: "alternative_days", idPrefix: "alt-day" }
  ]);

  const GALLEY_PANELS = Object.freeze([
    { id: "menus", label: "Menus" },
    { id: "guests", label: "Guests" }
  ]);
  const GUEST_DRINKS_FILE_NAME = "guest_drinks.json";
  const CHARTER_ALCOHOL_PURCHASES_FILE_NAME = "charter-alcohol-purchases.json";
  const DRINK_STOCK_CATEGORIES = Object.freeze(["Champagne", "Wine", "Spirits", "Beers", "Other"]);
  const DEFAULT_AVAILABLE_ALCOHOL_CATEGORIES = DRINK_STOCK_CATEGORIES;
  const AVAILABLE_ALCOHOL_GLOBAL_ASSIGNMENT_KEYS = new Set(["available", "global", "general"]);
  const AVAILABLE_ALCOHOL_MAX_PRICE = 999999;
  const AVAILABLE_ALCOHOL_SUBCATEGORY_FALLBACK = "Other";
  const INTERNAL_USE_ASSIGNMENT_ID = "internal-use";
  const INTERNAL_USE_ASSIGNMENT_LABEL = "Internal Use";
  const DEFAULT_IDLE_TELEMETRY_ITEMS = Object.freeze(["cog", "sog", "depth", "wind_speed", "wind_direction", "eta"]);
  const DEFAULT_ADMIN_SESSION_TIMEOUT_MINUTES = 30;
  const TELEMETRY_FIELD_OPTIONS = Object.freeze([
    { key: "latitude", label: "Latitude", unit: "degrees" },
    { key: "longitude", label: "Longitude", unit: "degrees" },
    { key: "cog", label: "COG", unit: "degrees true" },
    { key: "sog", label: "SOG / Speed", unit: "knots" },
    { key: "heading", label: "Heading", unit: "degrees true" },
    { key: "depth", label: "Depth", unit: "metres" },
    { key: "rot", label: "Rate of Turn", unit: "deg/min" },
    { key: "pitch", label: "Pitch", unit: "degrees" },
    { key: "roll", label: "Roll", unit: "degrees" },
    { key: "yaw", label: "Yaw", unit: "degrees" },
    { key: "wind_speed", label: "Wind Speed", unit: "knots" },
    { key: "wind_direction", label: "Wind Direction", unit: "degrees true" },
    { key: "apparent_wind_speed", label: "Apparent Wind Speed", unit: "knots" },
    { key: "apparent_wind_angle", label: "Apparent Wind Angle", unit: "degrees" },
    { key: "origin_waypoint", label: "Origin Waypoint" },
    { key: "destination_waypoint", label: "Destination Waypoint" },
    { key: "destination_latitude", label: "Destination Latitude", unit: "degrees" },
    { key: "destination_longitude", label: "Destination Longitude", unit: "degrees" },
    { key: "distance_to_waypoint", label: "Distance to Waypoint", unit: "nm" },
    { key: "bearing_to_waypoint", label: "Bearing to Waypoint", unit: "degrees true" },
    { key: "cross_track_error", label: "Cross-track Error", unit: "nm" },
    { key: "steer_direction", label: "Steer Direction" },
    { key: "closing_velocity", label: "Closing Speed", unit: "knots" },
    { key: "ttg", label: "Time to Go" },
    { key: "eta", label: "ETA" },
    { key: "arrival_status", label: "Arrival Status" }
  ]);
  const TELEMETRY_ITEM_ALIASES = Object.freeze({
    latitude: ["latitude", "lat", "position.latitude", "vessel.latitude"],
    longitude: ["longitude", "lon", "lng", "position.longitude", "vessel.longitude"],
    cog: ["cog", "COG", "course", "courseOverGround", "course_over_ground", "nav.course", "vessel.cog"],
    sog: ["sog", "SOG", "speed", "Speed", "speedOverGround", "speed_over_ground", "nav.speed", "vessel.sog"],
    heading: ["heading", "Heading", "headingTrue", "heading_true", "headingTrueDeg", "nav.heading"],
    depth: ["depth", "Depth", "nav.depth", "vessel.depth"],
    rot: ["rot", "ROT", "rateOfTurn", "turnRate"],
    pitch: ["pitch", "Pitch", "nav.pitch"],
    roll: ["roll", "Roll", "nav.roll"],
    yaw: ["yaw", "Yaw", "nav.yaw"],
    wind_speed: ["windSpeed", "wind_speed", "trueWindSpeed", "true_wind_speed", "tws", "TWS"],
    wind_direction: ["windDirection", "wind_direction", "trueWindDirection", "true_wind_direction", "twd", "TWD"],
    apparent_wind_speed: ["apparentWindSpeed", "apparent_wind_speed", "aws", "AWS"],
    apparent_wind_angle: ["apparentWindAngle", "apparent_wind_angle", "awa", "AWA"],
    origin_waypoint: ["originWaypoint", "origin_waypoint", "route.origin"],
    destination_waypoint: ["destinationWaypoint", "destination_waypoint", "waypoint", "route.destination"],
    destination_latitude: ["destinationLatitude", "destination_latitude", "waypointLatitude"],
    destination_longitude: ["destinationLongitude", "destination_longitude", "waypointLongitude"],
    distance_to_waypoint: ["distanceToWaypoint", "distance_to_waypoint", "dtw"],
    bearing_to_waypoint: ["bearingToWaypoint", "bearing_to_waypoint", "btw"],
    cross_track_error: ["crossTrackError", "cross_track_error", "xte", "XTE"],
    steer_direction: ["steerDirection", "steer_direction"],
    closing_velocity: ["closingVelocity", "closing_velocity", "vmg"],
    ttg: ["ttg", "TTG"],
    eta: ["eta", "ETA"],
    arrival_status: ["arrivalStatus", "arrival_status", "arrival"]
  });
  const TELEMETRY_ALIAS_LOOKUP = Object.freeze(Object.keys(TELEMETRY_ITEM_ALIASES).reduce((lookup, canonical) => {
    TELEMETRY_ITEM_ALIASES[canonical].forEach(alias => {
      lookup[getTelemetryAliasToken(alias)] = canonical;
    });
    if (canonical === "wind_speed") {
      lookup.wind = ["wind_speed", "wind_direction"];
    }
    return lookup;
  }, {}));

  const els = {
    status: document.getElementById("status-panel"),
    loginPanel: document.getElementById("login-panel"),
    loginForm: document.getElementById("login-form"),
    department: document.getElementById("admin-department"),
    password: document.getElementById("admin-password"),
    loginButton: document.querySelector("#login-form button[type='submit']"),
    loginChoices: document.querySelector(".login-choices"),
    loginModal: document.getElementById("login-modal"),
    loginModalTitle: document.getElementById("login-modal-title"),
    loginError: document.getElementById("login-error"),
    cancelLoginButton: document.getElementById("cancel-login-button"),
    appPanel: document.getElementById("app-panel"),
    activeSummary: document.getElementById("active-charter-summary"),
    charterDaysLabel: document.getElementById("charter-days-label"),
    settingsButton: document.getElementById("settings-button"),
    switchDepartmentButton: document.getElementById("switch-department-button"),
    resetSessionButton: document.getElementById("reset-session-button"),
    departmentButtons: document.getElementById("department-buttons"),
    workspace: document.getElementById("workspace")
  };
  let adminSessionTimeoutTimer = null;
  let adminSessionTimeoutMs = DEFAULT_ADMIN_SESSION_TIMEOUT_MINUTES * 60 * 1000;
  let adminLogoutInProgress = false;
  const activeAdminDecisionCloseHandlers = new Set();

  function apiUrl(path) {
    const url = new URL(path, window.location.origin);
    url.searchParams.set("key", adminKey);
    return url.toString();
  }

  async function api(path, options) {
    const response = await fetch(apiUrl(path), {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options && options.headers ? options.headers : {})
      }
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      throwAdminApiError(response, payload, "Request failed");
    }
    markAdminSessionActivityFromClient(path);
    return payload;
  }

  function markAdminSessionActivityFromClient(path) {
    if (
      adminLogoutInProgress
      || !state.authenticated
      || typeof path !== "string"
      || !path.startsWith("/api/admin/")
      || path === "/api/admin/login"
      || path === "/api/admin/logout"
    ) {
      return;
    }
    scheduleAdminSessionTimeout();
  }

  function getTelemetryAliasToken(value) {
    return String(value || "")
      .trim()
      .replace(/[\s_-]+/g, "")
      .toLowerCase();
  }

  function normalizeTelemetryItemKey(value) {
    const text = String(value || "").trim();
    const token = getTelemetryAliasToken(text);
    if (!token) {
      return "";
    }
    return TELEMETRY_ALIAS_LOOKUP[token] || text.toLowerCase();
  }

  function expandTelemetryItemKeys(value) {
    const normalized = normalizeTelemetryItemKey(value);
    return Array.isArray(normalized) ? normalized : (normalized ? [normalized] : []);
  }

  function normalizeTelemetryItems(items, fallbackItems = DEFAULT_IDLE_TELEMETRY_ITEMS) {
    const sourceItems = Array.isArray(items)
      ? items
      : (typeof items === "string" ? items.split(",") : fallbackItems);
    return sourceItems.reduce((result, item) => {
      expandTelemetryItemKeys(item).forEach(normalized => {
        if (normalized && !result.includes(normalized)) {
          result.push(normalized);
        }
      });
      return result;
    }, []);
  }

  async function uploadSiteMedia(file, title) {
    if (!file) {
      throw new Error("Choose a media file to upload.");
    }
    const response = await fetch(apiUrl("/api/admin/sites/images/upload"), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Filename": encodeURIComponent(file.name || "site-media"),
        "X-Media-Title": encodeURIComponent(title || "")
      },
      body: file
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      throwAdminApiError(response, payload, "Image upload failed");
    }
    markAdminSessionActivityFromClient("/api/admin/sites/images/upload");
    return payload;
  }

  function throwAdminApiError(response, payload, fallbackMessage) {
    const message = payload && payload.error ? payload.error : String(payload || fallbackMessage);
    if (response.status === 401 && message === "Login required") {
      showOnboardingForLoginRequired();
      const error = new Error("");
      error.loginRequired = true;
      throw error;
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  function showOnboardingForLoginRequired() {
    clearAdminState();
    replaceAdminRouteWithOnboarding();
    setStatus("");
  }

  function setStatus(message, tone) {
    if (message === "Login required") {
      showOnboardingForLoginRequired();
      return;
    }
    els.status.textContent = message || "";
    els.status.className = `status-panel ${tone || ""}`.trim();
  }

  function escapeText(value) {
    return String(value === null || value === undefined ? "" : value);
  }

  function escapeAttribute(value) {
    return escapeText(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeHtml(value) {
    return escapeText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function previewMultilineHtml(value) {
    return escapeHtml(value).replace(/\r?\n/g, "<br>");
  }

  function renderPreviewItems(items, emptyMessage, renderItem) {
    if (!Array.isArray(items) || !items.length) {
      return `<div class="menu-note print-section">${escapeHtml(emptyMessage)}</div>`;
    }
    return items.map(renderItem).join("");
  }

  function previewThemeForDepartment(department) {
    if (department === "galley") {
      return { baseColor: "#705027", baseColorDark: "#5c421f" };
    }
    if (department === "hotel") {
      return { baseColor: "#5a2d4a", baseColorDark: "#472239" };
    }
    if (department === "charter") {
      return { baseColor: "#12333d", baseColorDark: "#0b2238" };
    }
    return { baseColor: "#0f2d4a", baseColorDark: "#0b2238" };
  }

  function previewAssetUrl(path) {
    return new URL(path, window.location.origin).toString();
  }

  function groupBeveragesByCategory(items, categorySourceForItem = item => item) {
    const groups = DRINK_STOCK_CATEGORIES.map(category => ({ category, title: category, items: [] }));
    const groupsByKey = new Map(groups.map(group => [drinkCategoryKey(group.category), group]));
    (Array.isArray(items) ? items : []).forEach(item => {
      const source = categorySourceForItem(item) || {};
      const category = normalizeDrinkCategory(source.category, source.stock_type);
      const group = groupsByKey.get(drinkCategoryKey(category)) || groupsByKey.get(drinkCategoryKey("Other"));
      group.items.push(item);
    });
    return groups;
  }

  function renderAvailableAlcoholPreview(data) {
    const availableAlcohol = normalizeAvailableAlcohol(data);
    const showPricesToGuests = availableAlcohol.show_prices_to_guests === true;
    const previewItems = availableAlcohol.items.map(item => showPricesToGuests ? item : { ...item, price_per_bottle: null });
    const sections = groupAvailableAlcoholSections(previewItems)
      .filter(section => section.items.length);
    const sectionHtml = sections.length
      ? sections.map(section => `
        <section class="menu-section print-section">
          <div class="menu-section-title">${escapeHtml(section.title)}</div>
          ${section.subgroups.map(subgroup => `
            <div class="available-alcohol-subgroup">
              ${subgroup.summaryOnly ? "" : `<div class="available-alcohol-subgroup-title">${escapeHtml(subgroup.title)}</div>`}
              ${renderPreviewItems(subgroup.items, section.summaryOnly ? "No purchased alcohol yet." : "Available onboard upon request.", item => `
                <div class="menu-item print-item">
                  <span class="menu-item-name">${escapeHtml(formatAvailableAlcoholName(item))}</span>
                  ${section.summaryOnly
                    ? ""
                    : `${item && item.description ? `<div class="menu-item-desc">${previewMultilineHtml(item.description)}</div>` : ""}
                  ${showPricesToGuests ? `<div class="menu-item-desc">${escapeHtml(availableAlcoholPriceText(item))}</div>` : ""}`}
                </div>
              `)}
            </div>
          `).join("")}
        </section>
      `).join("")
      : `<div class="menu-note print-section">Available alcohol information will be added shortly.</div>`;
    return `
      <section class="tab-panel active" id="panel-drinks">
        <div class="charter-stack">
          <article class="menu-paper charter-page print-a4">
            <div class="print-header">
              <div class="menu-heading">Onboard Cellar</div>
              <h2 class="menu-title">Available Alcohol</h2>
              <div class="menu-subtitle">Alcohol available to purchase onboard</div>
              <div class="flourish" aria-hidden="true">Flourish</div>
            </div>
            <div class="print-content">
              ${sectionHtml}
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function renderCocktailsPreview(data) {
    const cocktails = normalizeCocktails(data);
    const sectionHtml = renderPreviewItems(cocktails.cocktails, "Cocktails are available to order onboard.", item => {
      return `
        <div class="menu-item print-item cocktail-print-item">
          <span class="menu-item-name">${escapeHtml(item && item.name ? item.name : "Cocktail")}</span>
          ${item && item.description ? `<div class="menu-item-desc">${previewMultilineHtml(item.description)}</div>` : ""}
        </div>
      `;
    });
    return `
      <section class="tab-panel active" id="panel-drinks">
        <div class="charter-stack">
          <article class="menu-paper charter-page print-a4 cocktails-print-preview">
            <div class="print-header cocktails-print-header">
              <div class="menu-heading">Onboard Cellar</div>
              <h2 class="menu-title">Cocktails</h2>
              <div class="menu-subtitle">Cocktails available onboard to order</div>
              <div class="flourish" aria-hidden="true">Flourish</div>
            </div>
            <div class="print-content cocktails-print-body">
              <section class="menu-section cocktails-list">${sectionHtml}</section>
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function cocktailsPreviewStyles() {
    return `
    .cocktails-print-preview,
    .cocktails-print-body,
    .cocktails-list {
      break-before: auto !important;
      page-break-before: auto !important;
      break-after: auto !important;
      page-break-after: auto !important;
      min-height: auto !important;
      height: auto !important;
    }

    .cocktails-print-preview.charter-page,
    .cocktails-print-body,
    .cocktails-list {
      break-inside: auto !important;
      page-break-inside: auto !important;
    }

    .cocktail-print-item {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    @media print {
      .cocktails-print-preview,
      .cocktails-print-body,
      .cocktails-list {
        break-before: auto !important;
        page-break-before: auto !important;
        break-after: auto !important;
        page-break-after: auto !important;
        break-inside: auto !important;
        page-break-inside: auto !important;
        min-height: auto !important;
        height: auto !important;
      }

      .cocktails-print-header {
        break-after: auto !important;
        page-break-after: auto !important;
      }

      .cocktails-list {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }

      .cocktail-print-item {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      .print-a4.print-fit-one-page .cocktails-print-header {
        margin-bottom: 2mm !important;
      }

      .print-a4.print-fit-one-page .cocktails-print-header .menu-title {
        margin-bottom: 2mm !important;
      }

      .print-a4.print-fit-one-page .cocktails-print-header .menu-subtitle {
        margin-bottom: 1.5mm !important;
      }

      .print-a4.print-fit-one-page .cocktails-print-header .flourish {
        height: 12px !important;
        margin: 5px auto 6px !important;
      }

      .print-a4.print-fit-one-page .cocktails-list .cocktail-print-item:first-child {
        padding-top: 2px !important;
      }
    }`;
  }

  function renderMenuDayPreview(dayData) {
    const day = dayData && typeof dayData === "object" ? dayData : {};
    const charterDayValue = Number(day.charter_day);
    const charterDayLabel = Number.isFinite(charterDayValue) ? `CHARTER DAY ${Math.round(charterDayValue)}` : "";
    const label = String(day.label || "").trim();
    const subtitle = label || charterDayLabel || "Today's selection";
    const metaItems = label && charterDayLabel ? [charterDayLabel] : [];
    const notes = String(day.todays_notes || day.notes || "").trim();
    const previewSections = menuDayPreviewSections(day);
    const hasMenuContent = previewSections.some(section => menuValueHasMeaning(section.items));
    const sections = hasMenuContent
      ? previewSections.map(section => `
        <section class="menu-section print-section">
          <div class="menu-section-title">${escapeHtml(section.title)}</div>
          ${renderPreviewItems(section.items, "Selection will be added shortly.", item => `
            <div class="menu-item print-item">
              <span class="menu-item-name">${escapeHtml(item && item.name ? item.name : "Item")}</span>
              ${item && item.description ? `<div class="menu-item-desc">${previewMultilineHtml(item.description)}</div>` : ""}
            </div>
          `)}
        </section>
      `).join("")
      : `<div class="menu-note print-section">Menu to be confirmed</div>`;
    return `
      <section class="tab-panel active" id="panel-menu">
        <div class="charter-stack">
          <article class="menu-paper charter-page print-a4">
            <div class="print-header">
              <div class="menu-heading">Onboard Dining</div>
              <h2 class="menu-title">Today's Menu</h2>
              ${metaItems.length ? `<div class="menu-meta-row">${metaItems.map(item => `<div class="menu-meta-line">${escapeHtml(item)}</div>`).join("")}</div>` : ""}
              <div class="menu-subtitle">${escapeHtml(subtitle)}</div>
              <div class="flourish" aria-hidden="true">Flourish</div>
            </div>
            <div class="print-content">
              ${notes ? `<div class="menu-note menu-day-notes print-section">${previewMultilineHtml(notes)}</div>` : ""}
              ${sections}
              <div class="menu-note print-section">Prepared onboard with seasonal ingredients where available.</div>
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function renderItineraryPreview(itineraryData, charterInfo, siteLibrary, planId = "primary") {
    const itinerary = normalizeItinerary(itineraryData);
    const plan = itineraryPlanById(planId);
    const welcomeMessage = resolvedItineraryWelcomeMessage(itinerary, plan.id);
    const days = [...itineraryDaysForPlan(itinerary, plan.id)]
      .filter(day => day && day.active !== false)
      .sort((a, b) => Number(a.order || a.charter_day || a.day || 0) - Number(b.order || b.charter_day || b.day || 0));
    const metaItems = [
      charterInfo && charterInfo.start_date ? itineraryDayDateLabel(charterInfo, { charter_day: 1, order: 1, day: 1 }) : "",
      days.length ? `${days.length} day${days.length === 1 ? "" : "s"}` : ""
    ].filter(Boolean);
    const daysHtml = days.length
      ? `
        <ul class="list itinerary-preview-list">
          ${days.map((day, index) => {
            const dayNumber = day.charter_day || day.day || day.order || index + 1;
            const primarySite = itinerarySiteName(siteLibrary, day.site_id || "");
            const hasPrimarySite = primarySite && primarySite !== "No site selected";
            const title = String(day.title || day.title_override || "").trim();
            const notes = String(day.notes || "").trim();
            const stops = Array.isArray(day.stops) ? day.stops.filter(stop => stop && stop.active !== false) : [];
            return `
              <li class="list-item itinerary-preview-day-card print-section">
                <div class="itinerary-day-header">
                  <strong>Day ${escapeHtml(dayNumber)}</strong>
                  ${hasPrimarySite ? `<div class="itinerary-day-area">${escapeHtml(primarySite)}</div>` : ""}
                </div>
                ${title ? `<div class="itinerary-preview-title">${escapeHtml(title)}</div>` : ""}
                ${notes ? `<div class="muted itinerary-day-summary">${escapeHtml(notes)}</div>` : ""}
                ${stops.length ? `
                  <ul class="list itinerary-stop-list">
                    ${stops.map((stop, stopIndex) => {
                      const stopNotes = itineraryStopDescription(stop);
                      return `
                        <li class="list-item itinerary-preview-stop-card print-item">
                          <div class="itinerary-stop-title">
                            <div class="itinerary-stop-title-main">
                              <span class="itinerary-stop-index">Stop ${escapeHtml(stopIndex + 1)}</span>
                              <strong>${escapeHtml(itineraryStopTitle(stop, stopIndex, siteLibrary))}</strong>
                            </div>
                          </div>
                          ${stopNotes ? `<div class="muted itinerary-stop-plan">${escapeHtml(stopNotes)}</div>` : ""}
                        </li>
                      `;
                    }).join("")}
                  </ul>
                ` : ""}
              </li>
            `;
          }).join("")}
        </ul>
      `
      : `<div class="menu-note itinerary-empty-note print-section">Itinerary data will be added shortly.</div>`;
    return `
      <section class="tab-panel active" id="panel-itinerary">
        <div class="charter-stack">
          <article class="menu-paper charter-page print-a4 itinerary-print-area">
            <div class="print-header itinerary-print-header">
              <div class="menu-heading">Voyage Outline</div>
              <h2 class="menu-title">${escapeHtml(plan.label)}</h2>
              <div class="menu-subtitle">Current voyage plan</div>
              ${metaItems.length ? `<div class="menu-meta-row">${metaItems.map(item => `<div class="menu-meta-line">${escapeHtml(item)}</div>`).join("")}</div>` : ""}
              ${welcomeMessage ? `<div class="menu-section-copy itinerary-intro">${escapeHtml(welcomeMessage)}</div>` : ""}
              <div class="flourish" aria-hidden="true">Flourish</div>
            </div>
            <div class="print-content itinerary-print-body">
              ${daysHtml}
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function itineraryPreviewStyles() {
    const guestPortalWatermarkUrl = previewAssetUrl("/images/nautical_watermark_dark.png");
    return `
    @media print {
      .itinerary-print-area.charter-page {
        min-height: auto !important;
      }

      .itinerary-print-area::before {
        background-image: none !important;
        opacity: 0 !important;
      }

      .itinerary-print-area.print-watermark-enabled::before {
        content: "";
        position: fixed;
        inset: 0;
        display: block !important;
        background-image: url("${guestPortalWatermarkUrl}");
        background-repeat: no-repeat;
        background-position: center center;
        background-size: 180mm auto;
        opacity: 0.06;
        z-index: 0;
        pointer-events: none;
      }

      .itinerary-print-area.print-watermark-enabled > * {
        position: relative;
        z-index: 1;
      }

      .itinerary-print-header {
        break-after: avoid !important;
        page-break-after: avoid !important;
      }

      .itinerary-print-body,
      .itinerary-preview-list,
      .itinerary-stop-list {
        break-inside: auto !important;
        page-break-inside: auto !important;
      }

      .itinerary-intro,
      .itinerary-preview-day-card,
      .itinerary-preview-stop-card {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      .itinerary-day-header,
      .itinerary-preview-title,
      .itinerary-stop-title,
      .itinerary-stop-title-main,
      .itinerary-stop-index {
        break-after: avoid !important;
        page-break-after: avoid !important;
      }
    }`;
  }

  function renderParchmentPreviewDocument(title, bodyHtml, options) {
    const safeTitle = escapeHtml(title);
    const previewTheme = previewThemeForDepartment(options && options.department);
    const watermarkUrl = previewAssetUrl("/images/nautical_watermark_dark.png");
    const printWatermarkLogoUrl = previewAssetUrl("/assets/icons/onboard/web-app-manifest-512x512.png?v=1");
    const showPrintButton = Boolean(options && options.printable);
    const showPrintOptions = showPrintButton && (!options || options.showPrintOptions !== false);
    const showPrintFitOption = showPrintOptions && (!options || options.showPrintFitOption !== false);
    const printButtonLabel = typeof options?.printButtonLabel === "string" && options.printButtonLabel.trim()
      ? options.printButtonLabel.trim()
      : "Print preview";
    const extraStyles = typeof options?.extraStyles === "string" ? options.extraStyles : "";
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: ${previewTheme.baseColor};
      --bg-soft: ${previewTheme.baseColorDark};
      --parchment-flourish: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 32'%3E%3Cg fill='none' stroke='%23574329' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 17c18-11 36-11 54 0s36 11 54 0' stroke-width='2.3'/%3E%3Cpath d='M98 17c7-8 14-8 21 0' stroke-width='2.1'/%3E%3Cpath d='M314 17c-18-11-36-11-54 0s-36 11-54 0' stroke-width='2.3'/%3E%3Cpath d='M222 17c-7-8-14-8-21 0' stroke-width='2.1'/%3E%3Cpath d='M126 17c9-12 18-12 27 0' stroke-width='2.7'/%3E%3Cpath d='M167 17c9-12 18-12 27 0' stroke-width='2.7'/%3E%3Cpath d='M140 17c7 10 14 10 21 0' stroke-width='2.3'/%3E%3Cpath d='M159 17c7 10 14 10 21 0' stroke-width='2.3'/%3E%3C/g%3E%3C/svg%3E");
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: "Times New Roman", Times, serif;
      background: linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 100%);
      color: #f4f7fb;
      min-height: 100vh;
    }

    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      justify-content: flex-end;
      max-width: 1200px;
      margin: 0 auto;
      padding: 16px 20px 0;
      pointer-events: none;
    }

    .preview-toolbar > * {
      pointer-events: auto;
    }

    .preview-toolbar-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-left: auto;
    }

    .preview-print-options {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      padding: 6px 12px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 999px;
      background: rgba(11,34,56,0.3);
      backdrop-filter: blur(8px);
      color: #f3e3bd;
      font: 600 0.84rem/1.2 Arial, Helvetica, sans-serif;
      box-shadow:
        0 10px 24px rgba(0,0,0,0.18),
        inset 0 1px 0 rgba(255,255,255,0.14);
      white-space: nowrap;
    }

    .preview-print-options input {
      width: 15px;
      height: 15px;
      margin: 0;
      accent-color: #d4b06a;
    }

    .preview-print-hint {
      color: rgba(243,227,189,0.82);
      font: 500 0.76rem/1.3 Arial, Helvetica, sans-serif;
      max-width: 320px;
    }

    .preview-action {
      width: 36px;
      min-width: 36px;
      min-height: 36px;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 999px;
      background: rgba(11,34,56,0.3);
      backdrop-filter: blur(8px);
      color: #f3e3bd;
      cursor: pointer;
      font: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      box-shadow:
        0 10px 24px rgba(0,0,0,0.18),
        inset 0 1px 0 rgba(255,255,255,0.14);
    }

    .preview-action svg {
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
    }

    .preview-action:hover,
    .preview-action:focus-visible {
      background: rgba(11,34,56,0.46);
      border-color: rgba(212,176,106,0.64);
      color: #fff;
    }

    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px 20px 40px;
    }

    .tab-panel {
      display: block;
    }

    .charter-stack {
      display: grid;
      gap: 26px;
    }

    .charter-page {
      width: min(100%, 920px);
      margin: 0 auto;
      min-height: clamp(620px, 78vh, 980px);
      display: flex;
      flex-direction: column;
    }

    .menu-paper {
      --parchment-flourish: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 32'%3E%3Cg fill='none' stroke='%23574329' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 17c18-11 36-11 54 0s36 11 54 0' stroke-width='2.3'/%3E%3Cpath d='M98 17c7-8 14-8 21 0' stroke-width='2.1'/%3E%3Cpath d='M314 17c-18-11-36-11-54 0s-36 11-54 0' stroke-width='2.3'/%3E%3Cpath d='M222 17c-7-8-14-8-21 0' stroke-width='2.1'/%3E%3Cpath d='M126 17c9-12 18-12 27 0' stroke-width='2.7'/%3E%3Cpath d='M167 17c9-12 18-12 27 0' stroke-width='2.7'/%3E%3Cpath d='M140 17c7 10 14 10 21 0' stroke-width='2.3'/%3E%3Cpath d='M159 17c7 10 14 10 21 0' stroke-width='2.3'/%3E%3C/g%3E%3C/svg%3E");
      position: relative;
      overflow: hidden;
      isolation: isolate;
      background:
        linear-gradient(180deg, rgba(250,244,230,0.2) 0%, rgba(237,225,195,0.32) 100%),
        radial-gradient(circle at 50% 12%, rgba(255,249,236,0.16), rgba(255,249,236,0) 28%),
        repeating-linear-gradient(0deg, rgba(116,84,46,0.012) 0, rgba(116,84,46,0.012) 1px, rgba(255,255,255,0) 1px, rgba(255,255,255,0) 11px),
        linear-gradient(180deg, #ecdcb6 0%, #e2cc9f 54%, #d9bf8f 100%);
      color: #24170d;
      border: none;
      outline: none;
      border-radius: 24px;
      box-shadow: none;
      padding: clamp(24px, 4vw, 40px) clamp(20px, 3vw, 34px);
    }

    .menu-paper::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        radial-gradient(circle at 50% 10%, rgba(255,249,233,0.14), rgba(255,249,233,0) 34%),
        url("${watermarkUrl}");
      background-position:
        center top,
        center top;
      background-repeat:
        no-repeat,
        no-repeat;
      background-size:
        100% 100%,
        100% auto;
      opacity: 0.29;
      mix-blend-mode: multiply;
      filter: sepia(0.28) saturate(0.72) contrast(1.2) brightness(1.04);
      transform: none;
      z-index: 0;
      pointer-events: none;
    }

    .menu-paper::after {
      content: none;
      display: none;
      position: absolute;
      top: 12px;
      right: 12px;
      bottom: 12px;
      left: 12px;
      border: none;
      border-radius: 20px;
      transform: none;
      z-index: 3;
      pointer-events: none;
    }

    .menu-paper > * {
      position: relative;
      z-index: 2;
    }

    .menu-heading,
    .menu-title,
    .menu-subtitle,
    .flourish,
    .menu-note,
    .menu-section-title,
    .available-alcohol-subgroup-title,
    .menu-section-copy,
    .menu-item,
    .menu-item-name,
    .menu-item-desc,
    .menu-table th,
    .menu-table td {
      position: relative;
      z-index: 1;
    }

    .menu-heading {
      text-align: center;
      color: #46301a;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      margin-bottom: 6px;
      font-size: 0.84rem;
    }

    .menu-title {
      text-align: center;
      color: #23160d;
      font-size: 2.2rem;
      letter-spacing: 0.06em;
      margin: 8px 0 10px;
    }

    .menu-subtitle {
      text-align: center;
      color: #3e2b1b;
      line-height: 1.55;
      margin-bottom: 18px;
      white-space: pre-wrap;
    }

    .flourish {
      position: relative;
      width: min(220px, calc(100% - 160px));
      height: 20px;
      margin: 12px auto 24px;
      color: transparent;
      font-size: 0;
      letter-spacing: 0;
    }

    .flourish::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image: var(--parchment-flourish);
      background-repeat: no-repeat;
      background-position: center;
      background-size: contain;
      opacity: 0.62;
      pointer-events: none;
    }

    .menu-section-title {
      text-align: left;
      color: #2f2113;
      font-size: 1.08rem;
      margin: 6px 0 14px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .available-alcohol-subgroup + .available-alcohol-subgroup {
      margin-top: 18px;
    }

    .available-alcohol-subgroup-title {
      color: #6a4a27;
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      margin: 0 0 10px;
      text-transform: uppercase;
    }

    .menu-section {
      position: relative;
    }

    .menu-section + .menu-section {
      margin-top: 34px;
      padding-top: 42px;
      border-top: 0;
    }

    .menu-section + .menu-section::before {
      content: "";
      position: absolute;
      top: 2px;
      left: 50%;
      width: min(250px, calc(100% - 160px));
      height: 24px;
      transform: translateX(-50%);
      background-image: var(--parchment-flourish);
      background-repeat: no-repeat;
      background-position: center;
      background-size: contain;
      opacity: 0.7;
      pointer-events: none;
    }

    .menu-section-copy {
      text-align: left;
      color: #3f2d1d;
      font-size: 0.98rem;
      margin: -4px 0 14px;
      line-height: 1.65;
      white-space: pre-wrap;
    }

    .menu-item {
      position: relative;
      text-align: left;
      border-bottom: 0;
      padding: 14px 0 34px;
    }

    .menu-item:not(:last-child)::before {
      content: "";
      position: absolute;
      left: 50%;
      bottom: 4px;
      width: min(176px, calc(100% - 132px));
      height: 16px;
      transform: translateX(-50%);
      background-image: var(--parchment-flourish);
      background-repeat: no-repeat;
      background-position: center;
      background-size: contain;
      opacity: 0.34;
      pointer-events: none;
    }

    .menu-item:not(:last-child)::after {
      content: none;
    }

    .menu-item:last-child {
      padding-bottom: 0;
    }

    .menu-item-name {
      display: block;
      font-size: 1.08rem;
      color: #24160d;
      margin-bottom: 6px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .menu-item-desc {
      color: #43301f;
      line-height: 1.55;
      white-space: pre-wrap;
    }

    .menu-meta-row {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 18px;
    }

    .menu-meta-line {
      color: #4b3623;
      font-size: 0.86rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .menu-note {
      text-align: center;
      color: #4a3522;
      line-height: 1.6;
      white-space: pre-wrap;
      margin-top: 18px;
      font-style: italic;
    }

    .menu-day-notes {
      margin-top: 0;
      margin-bottom: 18px;
      text-align: center;
      font-style: normal;
    }

    .list {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .list-item {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 14px;
    }

    .list-item strong {
      display: block;
      margin-bottom: 6px;
      font-size: 1rem;
    }

    .itinerary-day-header {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 8px 12px;
      margin-bottom: 6px;
    }

    .itinerary-day-header strong {
      margin-bottom: 0;
    }

    .itinerary-day-area,
    .itinerary-preview-title {
      color: #24160d;
    }

    .menu-paper .muted {
      color: #43301f;
    }

    .itinerary-preview-title {
      margin-bottom: 8px;
      font-weight: 700;
      line-height: 1.35;
    }

    .itinerary-day-summary,
    .itinerary-stop-plan {
      white-space: pre-wrap;
      line-height: 1.6;
    }

    .itinerary-stop-list {
      margin-top: 12px;
    }

    .menu-paper .itinerary-stop-list .list-item {
      background: rgba(255,255,255,0.22);
    }

    .itinerary-stop-title {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 6px;
    }

    .itinerary-stop-title-main {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .itinerary-stop-title strong,
    .itinerary-stop-title-main strong {
      margin-bottom: 0;
    }

    .itinerary-stop-index {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 50px;
      padding: 3px 8px;
      border: 1.4px solid rgba(56, 38, 22, 0.44);
      border-radius: 999px;
      background: rgba(255,255,255,0.28);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.48);
      color: #382616;
      font-size: 0.68rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    #panel-menu .menu-subtitle,
    #panel-menu .menu-meta-row,
    #panel-menu .menu-section,
    #panel-menu .menu-note,
    #panel-itinerary .itinerary-preview-list,
    #panel-drinks .menu-subtitle,
    #panel-drinks .menu-meta-row,
    #panel-drinks .menu-section,
    #panel-drinks .menu-note {
      width: min(100%, 720px);
      margin-left: auto;
      margin-right: auto;
    }

    #panel-menu .menu-item,
    #panel-drinks .menu-item {
      padding-left: 22px;
      padding-right: 22px;
    }

    #panel-menu .menu-section-title,
    #panel-menu .menu-section-copy,
    #panel-menu .menu-item,
    #panel-menu .menu-item-name,
    #panel-menu .menu-item-desc,
    #panel-drinks .menu-section-title,
    #panel-drinks .available-alcohol-subgroup-title,
    #panel-drinks .menu-section-copy,
    #panel-drinks .menu-item,
    #panel-drinks .menu-item-name,
    #panel-drinks .menu-item-desc {
      text-align: center;
    }

    @media print {
      @page {
        size: A4 portrait;
        margin: 12mm;
      }

      html,
      body {
        width: auto;
        min-height: auto;
        margin: 0 !important;
        background: #fff !important;
        color: #24170d;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .no-print,
      .preview-toolbar,
      .modal-actions,
      .modal-close,
      .admin-only,
      nav,
      footer.admin-only,
      header.admin-only,
      button.admin-only {
        display: none !important;
      }

      .preview-toolbar {
        display: none !important;
      }

      main {
        width: 100%;
        max-width: none;
        padding: 0;
        display: block;
      }

      .charter-stack {
        width: 100%;
        gap: 0;
        overflow: visible !important;
      }

      .tab-panel {
        width: 100%;
        overflow: visible !important;
      }

      .print-a4 {
        position: relative;
        display: block;
        width: 100%;
        max-width: 186mm;
        margin: 0 auto;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        background: transparent !important;
        color: #111 !important;
        overflow: visible !important;
      }

      .charter-page {
        display: block;
        width: 100%;
        overflow: visible !important;
      }

      .menu-paper {
        background:
          linear-gradient(180deg, rgba(252,248,238,0.96) 0%, rgba(248,242,228,0.94) 100%),
          radial-gradient(circle at 50% 12%, rgba(255,250,240,0.18), rgba(255,250,240,0) 34%);
        border: none !important;
        outline: none !important;
        border-radius: 18px;
        box-shadow: none !important;
        padding: 10mm 9mm 8mm;
      }

      .menu-paper::before {
        display: block !important;
        opacity: 0.16;
        filter: sepia(0.18) saturate(0.58) contrast(1.06) brightness(1.08);
        background-size:
          100% 100%,
          118% auto;
      }

      .menu-paper::after {
        content: none !important;
        display: none !important;
        border: none !important;
      }

      .print-a4.print-watermark-enabled::before {
        content: "";
        position: fixed;
        inset: 0;
        background-image: url("${printWatermarkLogoUrl}");
        background-repeat: no-repeat;
        background-position: center center;
        background-size: 180mm auto;
        opacity: 0.06;
        z-index: 0;
        pointer-events: none;
      }

      .print-a4.print-watermark-enabled::after {
        content: "IOLANTHE";
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(36,23,13,0.035);
        font: 700 80pt/1 "Times New Roman", Times, serif;
        letter-spacing: 10px;
        z-index: 0;
        pointer-events: none;
      }

      .print-a4.print-watermark-enabled > * {
        position: relative;
        z-index: 1;
      }

      .print-header,
      .preview-title,
      .print-title {
        display: block;
      }

      .print-content,
      .preview-body,
      .print-body {
        display: block;
      }

      .print-content > *,
      .preview-body > *,
      .print-body > * {
        width: 100%;
      }

      .print-a4.print-fit-one-page {
        font-size: 85%;
        line-height: 1.18;
      }

      .print-a4.print-fit-one-page .menu-heading {
        font-size: 0.68rem;
        margin-bottom: 4px;
      }

      .print-a4.print-fit-one-page .menu-title {
        font-size: 18pt;
        margin: 0 0 4mm;
      }

      .print-a4.print-fit-one-page .menu-meta-row {
        gap: 6px;
        margin-bottom: 2mm;
      }

      .print-a4.print-fit-one-page .menu-meta-line {
        font-size: 10pt;
      }

      .print-a4.print-fit-one-page .menu-subtitle {
        font-size: 10.5pt;
        margin-bottom: 2mm;
      }

      .print-a4.print-fit-one-page .flourish {
        height: 14px;
        margin: 8px auto 12px;
      }

      .print-a4.print-fit-one-page .flourish::before {
        opacity: 0.48;
      }

      .print-a4.print-fit-one-page .menu-section + .menu-section::before {
        top: 0;
        width: min(180px, calc(100% - 120px));
        height: 18px;
        opacity: 0.5;
      }

      .print-a4.print-fit-one-page .menu-item:not(:last-child)::before {
        bottom: 2px;
        width: min(136px, calc(100% - 110px));
        height: 12px;
        opacity: 0.22;
      }

      .print-a4.print-fit-one-page .print-section {
        margin-top: 2mm;
        margin-bottom: 2mm;
      }

      .print-a4.print-fit-one-page .menu-section + .menu-section {
        margin-top: 3mm;
        padding-top: 0;
      }

      .print-a4.print-fit-one-page .menu-section-title {
        font-size: 12pt;
        margin: 2mm 0 1.5mm;
      }

      .print-a4.print-fit-one-page .menu-item {
        padding: 6px 0 9px;
      }

      .print-a4.print-fit-one-page .menu-item-name {
        font-size: 11pt;
        margin-bottom: 1mm;
      }

      .print-a4.print-fit-one-page .menu-item-desc,
      .print-a4.print-fit-one-page .menu-note {
        font-size: 9.8pt;
        line-height: 1.28;
      }

      .print-a4.print-fit-one-page .menu-day-notes,
      .print-a4.print-fit-one-page .menu-note {
        margin-top: 2mm;
        margin-bottom: 2mm;
      }

      .print-section,
      .print-item,
      .menu-meta-row,
      .menu-note,
      .menu-section-title,
      .available-alcohol-subgroup-title,
      .menu-item-name {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .menu-title {
        font-size: 24pt;
        margin: 0 0 8pt;
      }

      .menu-subtitle,
      .menu-section-copy,
      .available-alcohol-subgroup-title,
      .menu-item-desc,
      .menu-note,
      .menu-meta-line {
        font-size: 11pt;
      }

      .menu-section-title,
      .available-alcohol-subgroup-title,
      .menu-item-name {
        break-after: avoid;
        page-break-after: avoid;
      }
    }

    @media (max-width: 640px) {
      .preview-toolbar {
        padding: 12px 14px 0;
      }

      .preview-toolbar-actions {
        margin-left: auto;
      }

      main {
        padding: 16px 14px 32px;
      }

      .charter-page {
        min-height: auto;
      }

      .menu-paper {
        border-radius: 20px;
      }
    }
    ${extraStyles}
  </style>
</head>
  <body>
  <div class="preview-toolbar no-print admin-only">
    <div class="preview-toolbar-actions modal-actions">
      ${showPrintOptions ? `<label class="preview-print-options no-print admin-only"><input id="print-watermark-toggle" type="checkbox"><span>Print watermark</span></label>` : ""}
      ${showPrintFitOption ? `<label class="preview-print-options no-print admin-only" title="Reduce print spacing to try to fit on a single A4 page when possible"><input id="print-fit-toggle" type="checkbox"><span>Fit to one page</span></label>` : ""}
      ${showPrintOptions ? `<span class="preview-print-hint no-print admin-only">Turn off browser headers and footers in the print dialog for the cleanest result. Large content may still require more than one page.</span>` : ""}
      ${showPrintButton ? `<button id="print-preview" class="preview-action no-print admin-only" type="button" title="${escapeAttribute(printButtonLabel)}" aria-label="${escapeAttribute(printButtonLabel)}">${buttonIconSvg("print")}</button>` : ""}
      <button id="close-preview" class="preview-action no-print admin-only modal-close" type="button" title="Close preview" aria-label="Close preview">${buttonIconSvg("cancel")}</button>
    </div>
  </div>
  <main>
    ${bodyHtml}
  </main>
  <script>
    var printWatermarkToggle = document.getElementById("print-watermark-toggle");
    var printFitToggle = document.getElementById("print-fit-toggle");
    function syncPrintPreviewState() {
      var watermarkEnabled = Boolean(printWatermarkToggle && printWatermarkToggle.checked);
      var fitEnabled = Boolean(printFitToggle && printFitToggle.checked);
      document.querySelectorAll(".print-a4").forEach(function (node) {
        node.classList.toggle("print-watermark-enabled", watermarkEnabled);
        node.classList.toggle("print-fit-one-page", fitEnabled);
      });
    }
    if (printWatermarkToggle) {
      printWatermarkToggle.addEventListener("change", syncPrintPreviewState);
    }
    if (printFitToggle) {
      printFitToggle.addEventListener("change", syncPrintPreviewState);
    }
    var printButton = document.getElementById("print-preview");
    if (printButton) {
      printButton.addEventListener("click", function () {
        syncPrintPreviewState();
        window.print();
      });
    }
    document.querySelectorAll("[data-preview-print]").forEach(function (button) {
      button.addEventListener("click", function () {
        syncPrintPreviewState();
        window.print();
      });
    });
    window.addEventListener("beforeprint", syncPrintPreviewState);
    syncPrintPreviewState();
    document.getElementById("close-preview").addEventListener("click", function () {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "iolanthe-preview-close" }, "*");
      } else {
        window.close();
      }
    });
  </script>
</body>
</html>`;
  }

  let previewLightbox = null;

  function ensurePreviewLightbox() {
    if (previewLightbox) {
      return previewLightbox;
    }
    previewLightbox = document.createElement("div");
    previewLightbox.id = "preview-lightbox";
    previewLightbox.className = "preview-lightbox hidden";
    previewLightbox.setAttribute("role", "dialog");
    previewLightbox.setAttribute("aria-modal", "true");
    previewLightbox.setAttribute("tabindex", "-1");
    previewLightbox.innerHTML = `
      <div class="preview-lightbox-backdrop" data-preview-close></div>
      <div class="preview-lightbox-shell">
        <iframe class="preview-lightbox-frame" title="Admin preview"></iframe>
      </div>
    `;
    previewLightbox.addEventListener("click", event => {
      if (event.target.closest("[data-preview-close]")) {
        closePreviewLightbox();
      }
    });
    window.addEventListener("keydown", event => {
      if (event.key === "Escape" && previewLightbox && !previewLightbox.classList.contains("hidden")) {
        closePreviewLightbox();
      }
    });
    window.addEventListener("message", event => {
      const frame = previewLightbox && previewLightbox.querySelector(".preview-lightbox-frame");
      if (frame && event.source === frame.contentWindow && event.data && event.data.type === "iolanthe-preview-close") {
        closePreviewLightbox();
      }
    });
    document.body.appendChild(previewLightbox);
    return previewLightbox;
  }

  function closePreviewLightbox() {
    if (!previewLightbox) {
      return;
    }
    const frame = previewLightbox.querySelector(".preview-lightbox-frame");
    if (frame) {
      frame.removeAttribute("srcdoc");
    }
    previewLightbox.classList.add("hidden");
  }

  function renderPreviewLightbox(title, bodyHtml, options) {
    const lightbox = ensurePreviewLightbox();
    const frame = lightbox.querySelector(".preview-lightbox-frame");
    frame.style.background = previewThemeForDepartment(options && options.department).baseColor;
    frame.srcdoc = renderParchmentPreviewDocument(title, bodyHtml, options);
    lightbox.classList.remove("hidden");
    lightbox.focus();
  }

  let siteMediaLightbox = null;
  const siteMediaLightboxState = {
    items: [],
    index: 0
  };

  function ensureSiteMediaLightbox() {
    if (siteMediaLightbox) {
      return siteMediaLightbox;
    }
    siteMediaLightbox = document.createElement("div");
    siteMediaLightbox.id = "site-media-lightbox";
    siteMediaLightbox.className = "site-media-lightbox hidden";
    siteMediaLightbox.setAttribute("role", "dialog");
    siteMediaLightbox.setAttribute("aria-modal", "true");
    siteMediaLightbox.setAttribute("tabindex", "-1");
    siteMediaLightbox.innerHTML = `
      <div class="site-media-lightbox__backdrop" data-site-media-close></div>
      <div class="site-media-lightbox__panel">
        <div class="site-media-lightbox__header">
          <div class="site-media-lightbox__title"></div>
          ${iconButtonHtml("cancel", "Close media preview", ` data-site-media-close`)}
        </div>
        <div class="site-media-lightbox__stage"></div>
        <div class="site-media-lightbox__footer">
          <div class="site-media-lightbox__counter"></div>
          <div class="site-media-lightbox__actions">
            ${iconButtonHtml("prev", "Previous media", ` data-site-media-prev`)}
            ${iconButtonHtml("next", "Next media", ` data-site-media-next`)}
          </div>
        </div>
      </div>
    `;
    siteMediaLightbox.addEventListener("click", event => {
      if (event.target.closest("[data-site-media-close]")) {
        closeSiteMediaLightbox();
      }
      if (event.target.closest("[data-site-media-prev]")) {
        showSiteMediaAt(siteMediaLightboxState.index - 1);
      }
      if (event.target.closest("[data-site-media-next]")) {
        showSiteMediaAt(siteMediaLightboxState.index + 1);
      }
    });
    window.addEventListener("keydown", event => {
      if (!siteMediaLightbox || siteMediaLightbox.classList.contains("hidden")) {
        return;
      }
      if (event.key === "Escape") {
        closeSiteMediaLightbox();
      }
      if (event.key === "ArrowLeft") {
        showSiteMediaAt(siteMediaLightboxState.index - 1);
      }
      if (event.key === "ArrowRight") {
        showSiteMediaAt(siteMediaLightboxState.index + 1);
      }
    });
    document.body.appendChild(siteMediaLightbox);
    return siteMediaLightbox;
  }

  function openSiteMediaLightbox(mediaItems, startIndex) {
    const items = (Array.isArray(mediaItems) ? mediaItems : [])
      .map(normalizeSiteMediaEntry)
      .filter(item => item.src);
    if (!items.length) {
      return;
    }
    siteMediaLightboxState.items = items;
    siteMediaLightboxState.index = Math.min(Math.max(Number(startIndex) || 0, 0), items.length - 1);
    const lightbox = ensureSiteMediaLightbox();
    lightbox.classList.remove("hidden");
    renderSiteMediaLightbox();
    lightbox.focus();
  }

  function closeSiteMediaLightbox() {
    if (!siteMediaLightbox) {
      return;
    }
    const stage = siteMediaLightbox.querySelector(".site-media-lightbox__stage");
    if (stage) {
      stage.innerHTML = "";
    }
    siteMediaLightbox.classList.add("hidden");
  }

  function showSiteMediaAt(index) {
    const items = siteMediaLightboxState.items;
    if (!items.length) {
      return;
    }
    siteMediaLightboxState.index = (index + items.length) % items.length;
    renderSiteMediaLightbox();
  }

  function renderSiteMediaLightbox() {
    const lightbox = ensureSiteMediaLightbox();
    const items = siteMediaLightboxState.items;
    const item = items[siteMediaLightboxState.index];
    if (!item) {
      return;
    }
    const title = item.title || item.caption || item.alt || item.src || "Site media";
    lightbox.querySelector(".site-media-lightbox__title").textContent = title;
    lightbox.querySelector(".site-media-lightbox__counter").textContent = `${siteMediaLightboxState.index + 1} of ${items.length}`;
    const stage = lightbox.querySelector(".site-media-lightbox__stage");
    stage.innerHTML = item.type === "video"
      ? `<video src="${escapeAttribute(item.src)}" controls preload="metadata"></video>`
      : `<img src="${escapeAttribute(item.src)}" alt="${escapeAttribute(item.alt || title)}">`;
    lightbox.querySelector("[data-site-media-prev]").disabled = items.length < 2;
    lightbox.querySelector("[data-site-media-next]").disabled = items.length < 2;
  }

  function makeOption(value, label, selected) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    return option;
  }

  function fillCharterSelect(select, selectedId) {
    if (!select) {
      return;
    }
    select.innerHTML = "";
    if (!Array.isArray(state.charters) || !state.charters.length) {
      select.appendChild(makeOption("", "No charters available", true));
      select.disabled = true;
      return;
    }
    select.disabled = false;
    state.charters.forEach(charter => {
      select.appendChild(makeOption(charter.id, charter.name || charter.id, charter.id === selectedId));
    });
  }

  function syncSelectedCharter() {
    if (!Array.isArray(state.charters) || !state.charters.length) {
      state.selectedCharter = "";
      return "";
    }
    const activeExists = state.charters.some(charter => charter.id === state.activeCharter);
    const selectedExists = state.charters.some(charter => charter.id === state.selectedCharter);
    if (!selectedExists) {
      state.selectedCharter = activeExists ? state.activeCharter : state.charters[0].id;
    }
    return state.selectedCharter;
  }

  function activeCharterLabel() {
    const active = state.charters.find(charter => charter.id === state.activeCharter);
    return active ? (active.name || active.id) : (state.activeCharter || "None");
  }

  function activeCharterDayCountLabel() {
    const active = state.charters.find(charter => charter.id === state.activeCharter);
    const info = active && active.charter ? active.charter : {};
    const start = parseLocalDateOnly(info.start_date);
    const end = parseLocalDateOnly(info.end_date);
    if (!start || !end || end < start) {
      return "";
    }
    const days = Math.round((end - start) / 86400000) + 1;
    return `${days} ${days === 1 ? "Day" : "Days"}`;
  }

  function canChangeActiveCharter() {
    return state.authenticated && state.role === "bridge" && state.department === "charter";
  }

  function canManageCharterAdmin() {
    return canChangeActiveCharter();
  }

  function applySectionTheme() {
    const section = state.authenticated && state.selectedSection ? state.selectedSection : "";
    document.body.dataset.adminSection = section;
  }

  function syncTopbar() {
    els.activeSummary.classList.toggle("hidden", !state.authenticated);
    els.activeSummary.querySelector("strong").textContent = activeCharterLabel();
    const dayCountLabel = activeCharterDayCountLabel();
    els.charterDaysLabel.textContent = dayCountLabel;
    els.charterDaysLabel.classList.toggle("hidden", !state.authenticated || !dayCountLabel);
    els.settingsButton.classList.add("hidden");
    els.switchDepartmentButton.classList.toggle("hidden", !state.authenticated);
    els.resetSessionButton.classList.toggle("hidden", !state.isDevelopment || state.authenticated);
    applySectionTheme();
  }

  function clearAdminSessionTimeoutTimer() {
    if (adminSessionTimeoutTimer) {
      window.clearTimeout(adminSessionTimeoutTimer);
      adminSessionTimeoutTimer = null;
    }
  }

  function clearAdminOnlyTimers() {
    clearAdminSessionTimeoutTimer();
  }

  function clearAdminDecisionModals() {
    Array.from(activeAdminDecisionCloseHandlers).forEach(closeDecision => closeDecision());
    document.querySelectorAll(".admin-decision-backdrop").forEach(backdrop => backdrop.remove());
  }

  function clearAdminOverlays() {
    closePreviewLightbox();
    closeSiteMediaLightbox();
    clearAdminDecisionModals();
    document.querySelectorAll(".menu-form-modal").forEach(modal => modal.remove());
    if (dialogModal) {
      if (typeof dialogModal._pickerCancelHandler === "function") {
        dialogModal._pickerCancelHandler();
        dialogModal._pickerCancelHandler = null;
      }
      dialogCloseGuard = null;
      setParentModalActionsDisabled(dialogModal, false);
      setNestedPanelCloseHandler(dialogModal, null);
      dialogModal.classList.add("hidden");
      dialogModal.innerHTML = "";
    }
    syncModalOpenState();
  }

  function updateAdminSessionTimeoutFromSettings(settings) {
    const minutes = Number(settings && settings.sessionTimeoutMinutes);
    adminSessionTimeoutMs = Number.isFinite(minutes) && minutes > 0
      ? Math.max(1, Math.round(minutes)) * 60 * 1000
      : DEFAULT_ADMIN_SESSION_TIMEOUT_MINUTES * 60 * 1000;
  }

  function scheduleAdminSessionTimeout() {
    clearAdminSessionTimeoutTimer();
    if (!state.authenticated || adminLogoutInProgress || !Number.isFinite(adminSessionTimeoutMs) || adminSessionTimeoutMs <= 0) {
      return;
    }
    adminSessionTimeoutTimer = window.setTimeout(() => {
      logoutAndReturnToOnboarding("timeout");
    }, adminSessionTimeoutMs);
  }

  function syncAdminSessionTimeoutFromBootstrap(settings) {
    updateAdminSessionTimeoutFromSettings(settings);
    if (state.authenticated) {
      scheduleAdminSessionTimeout();
    } else {
      clearAdminOnlyTimers();
    }
  }

  function clearAdminState() {
    clearAdminOnlyTimers();
    clearPageUnsavedGuard();
    clearAdminOverlays();
    state.role = "denied";
    state.department = "";
    state.authenticated = false;
    state.activeCharter = "";
    state.charters = [];
    state.allowedSections = [];
    state.allowedDepartments = [];
    state.loginDepartmentTitle = "";
    state.selectedSection = "";
    state.selectedCharter = "";
    state.sites = [];
    state.selections = {};
    state.bundle = null;
    applySectionTheme();
    els.password.value = "";
    els.loginError.textContent = "";
    closeLoginModal();
    els.workspace.innerHTML = "";
    els.appPanel.classList.add("hidden");
    els.loginPanel.classList.remove("hidden");
    syncTopbar();
  }

  function adminLoginUrl() {
    const url = new URL("/admin", window.location.origin);
    if (adminKey) {
      url.searchParams.set("key", adminKey);
    }
    return url.toString();
  }

  function replaceAdminRouteWithOnboarding() {
    const targetUrl = adminLoginUrl();
    if (window.location.href !== targetUrl && window.history && typeof window.history.replaceState === "function") {
      try {
        window.history.replaceState(null, "", targetUrl);
      } catch (error) {
        // The admin page is same-origin in normal use; if history is unavailable, the DOM state is already reset.
      }
    }
    return targetUrl;
  }

  async function logoutAndReturnToOnboarding(reason) {
    if (adminLogoutInProgress) {
      return;
    }
    adminLogoutInProgress = true;
    clearAdminState();
    replaceAdminRouteWithOnboarding();
    const isTimeout = reason === "timeout";
    setStatus(isTimeout ? "Admin session timed out. Sign in again to continue." : "", isTimeout ? "error" : "");
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch (error) {
      // Expired or missing sessions still switch locally back to login.
    } finally {
      adminLogoutInProgress = false;
    }
  }

  async function logoutAndReturnToLogin() {
    return logoutAndReturnToOnboarding("manual");
  }

  async function resetSessionForDevelopment() {
    try {
      await api("/api/admin/logout", { method: "POST" });
      setStatus("Admin session reset.", "ok");
    } catch (error) {
      setStatus("Admin session reset locally.", "ok");
    } finally {
      clearAdminState();
    }
  }

  function openLoginModal(department, title) {
    state.loginDepartmentTitle = title || departmentLabel(department);
    els.department.value = department;
    els.loginModalTitle.textContent = state.loginDepartmentTitle;
    els.password.value = "";
    els.loginError.textContent = "";
    els.loginModal.classList.remove("hidden");
    syncModalOpenState();
    window.setTimeout(() => els.password.focus(), 0);
  }

  function closeLoginModal() {
    els.loginModal.classList.add("hidden");
    els.password.value = "";
    els.loginError.textContent = "";
    els.loginButton.disabled = false;
    syncModalOpenState();
  }

  async function loadBootstrap() {
    try {
      const data = await api("/api/admin/bootstrap");
      state.role = data.role || "denied";
      state.department = data.department || "";
      state.authenticated = Boolean(data.authenticated);
      state.activeCharter = data.active_charter || "";
      state.charters = Array.isArray(data.charters) ? data.charters : [];
      syncSelectedCharter();
      state.allowedSections = Array.isArray(data.allowed_sections) ? data.allowed_sections : [];
      state.allowedDepartments = Array.isArray(data.allowed_departments) ? data.allowed_departments : [];
      state.isDevelopment = Boolean(data.settings && data.settings.isDevelopment);
      syncAdminSessionTimeoutFromBootstrap(data.settings);
      syncTopbar();

      if (state.role === "denied") {
        els.loginPanel.classList.add("hidden");
        els.appPanel.classList.add("hidden");
        setStatus("Access denied. Check the admin URL key.", "error");
        return;
      }
      if (state.role === "guest" || state.role === "owner") {
        els.loginPanel.classList.add("hidden");
        els.appPanel.classList.add("hidden");
        setStatus("This network cannot access admin.", "error");
        return;
      }
      if (!state.authenticated) {
        els.loginPanel.classList.remove("hidden");
        els.appPanel.classList.add("hidden");
        setStatus("");
        return;
      }

      await loadSelections();

      els.loginPanel.classList.add("hidden");
      els.appPanel.classList.remove("hidden");
      setStatus(`Signed in on ${state.role}.`, "ok");
      if (!state.allowedSections.includes(state.selectedSection)) {
        state.selectedSection = state.allowedSections[0] || "";
      }
      syncTopbar();
      renderDepartments();
      renderSection();
    } catch (error) {
      if (error && error.loginRequired) {
        return;
      }
      setStatus(error.message, "error");
    }
  }

  function renderDepartments() {
    const showTabs = state.allowedSections.includes("settings");
    els.departmentButtons.classList.toggle("hidden", !showTabs);
    els.departmentButtons.querySelectorAll("button").forEach(button => {
      const section = button.dataset.section;
      const allowed = state.allowedSections.includes(section);
      button.disabled = !allowed;
      button.setAttribute("aria-pressed", section === state.selectedSection ? "true" : "false");
    });
  }

  async function loadCharter(charterId) {
    state.selectedCharter = charterId || state.selectedCharter || state.activeCharter;
    syncSelectedCharter();
    state.bundle = await api(`/api/admin/charter/${encodeURIComponent(state.selectedCharter)}`);
    return state.bundle;
  }

  function renderSection() {
    applySectionTheme();
    renderDepartments();
    if (state.selectedSection === "charter") {
      renderCharter();
    } else if (state.selectedSection === "galley") {
      renderGalley();
    } else if (state.selectedSection === "hotel") {
      renderHotel();
    } else if (state.selectedSection === "settings") {
      renderSettings();
    } else {
      els.workspace.innerHTML = "";
    }
  }

  function charterOptionsHtml() {
    syncSelectedCharter();
    if (!Array.isArray(state.charters) || !state.charters.length) {
      return `<option value="">No charters available</option>`;
    }
    return state.charters.map(charter => `<option value="${charter.id}" ${charter.id === state.selectedCharter ? "selected" : ""}>${escapeText(charter.name || charter.id)}</option>`).join("");
  }

  function sectionToolbarHtml(section) {
    if (!["charter", "galley", "hotel"].includes(section)) {
      return "";
    }
    const selectId = `${section}-charter-select`;
    const hasCharters = Array.isArray(state.charters) && state.charters.length > 0;
    const showCharterSelector = !(section === "charter" && state.sectionPanels.charter === "sites");
    const showCharterActions = section === "charter"
      && state.sectionPanels.charter === "info"
      && canManageCharterAdmin();
    const charterActions = showCharterActions
      ? `
          <div class="toolbar-actions">
            ${iconButtonHtml("confirm", "Set active charter", ` id="charter-set-active"${hasCharters ? "" : " disabled"}`)}
            ${iconButtonHtml("add", "Create new charter", ` id="charter-create"`)}
            ${iconButtonHtml("remove", "Delete current charter", ` id="charter-delete"${hasCharters && state.charters.length > 1 ? "" : " disabled"}`)}
          </div>
      `
      : "";
    if (!showCharterSelector && !charterActions) {
      return "";
    }
    return `
      <div class="section-toolbar" data-toolbar="${section}">
        ${showCharterSelector ? `
          <label class="toolbar-field" for="${selectId}">Select Charter
            <select id="${selectId}" ${hasCharters ? "" : "disabled"}>
              ${charterOptionsHtml()}
            </select>
          </label>
        ` : ""}
        ${charterActions}
      </div>
    `;
  }

  function sectionNotesActionHtml(section) {
    if (!["galley", "hotel"].includes(section)) {
      return "";
    }
    return `<button type="button" id="${section}-notes-button" aria-label="${escapeAttribute(`${departmentLabel(section)} charter notes`)}">Charter Notes</button>`;
  }

  function placeholderCard(title) {
    return `<div class="card"><h3>${title}</h3><p class="muted">V1 editor coming next.</p></div>`;
  }

  function sectionShell(section, items, activeId, contentHtml, toolbarHtml) {
    return `
      <div class="section-shell" data-section-shell="${section}">
        <nav class="section-nav" aria-label="${departmentLabel(section)} section">
          ${items.map(item => `
            <div class="section-nav-item">
              <button type="button" data-panel="${item.id}" aria-pressed="${item.id === activeId ? "true" : "false"}"${item.className ? ` class="${escapeAttribute(item.className)}"` : ""}>
                ${item.label}
              </button>
              ${item.id === "guests" ? sectionNotesActionHtml(section) : ""}
            </div>
          `).join("")}
        </nav>
        <div class="section-content">${toolbarHtml || ""}${contentHtml}</div>
      </div>
    `;
  }

  function bindSectionNav(section, renderFn) {
    const shell = els.workspace.querySelector(`[data-section-shell="${section}"]`);
    if (!shell) {
      return;
    }
    shell.querySelectorAll(".section-nav [data-panel]").forEach(button => {
      button.addEventListener("click", async () => {
        if (button.dataset.panel === state.sectionPanels[section]) {
          return;
        }
        if (!await confirmDiscardPageChanges()) {
          return;
        }
        state.sectionPanels[section] = button.dataset.panel;
        renderFn();
      });
    });
  }

  function stableSettingsValue(value) {
    if (Array.isArray(value)) {
      return value.map(stableSettingsValue);
    }
    if (value && typeof value === "object") {
      return Object.keys(value)
        .sort()
        .reduce((result, key) => {
          result[key] = stableSettingsValue(value[key]);
          return result;
        }, {});
    }
    return value === undefined ? null : value;
  }

  function settingsStateSignature(value) {
    return JSON.stringify(stableSettingsValue(value));
  }

  function settingsActionButtonsHtml(options = {}) {
    const formAttribute = options.formId ? ` form="${escapeAttribute(options.formId)}"` : "";
    const cancelId = options.cancelId ? ` id="${escapeAttribute(options.cancelId)}"` : "";
    const refresh = options.refreshId
      ? iconButtonHtml("refresh", options.refreshLabel || "Refresh", ` id="${escapeAttribute(options.refreshId)}"`)
      : "";
    return `
      <div class="button-row settings-action-buttons">
        ${iconSubmitButtonHtml("confirm", options.saveLabel || "Save settings", formAttribute)}
        ${iconButtonHtml("cancel", options.cancelLabel || "Discard changes", cancelId)}
        ${refresh}
        ${options.extraActionsHtml || ""}
      </div>
    `;
  }

  function bindSettingsFormController(options = {}) {
    const form = document.getElementById(options.formId);
    const readState = typeof options.readState === "function" ? options.readState : () => ({});
    if (!form) {
      return {
        isDirty: () => false,
        confirmDirtyAction: async () => true
      };
    }

    let savedSignature = settingsStateSignature(readState());
    const guard = {
      isDirty: () => settingsStateSignature(readState()) !== savedSignature,
      confirmOptions: options.confirmOptions || UNSAVED_CHANGES_CONFIRM
    };
    const syncDirtyState = () => {
      form.dataset.dirty = guard.isDirty() ? "true" : "false";
    };
    const reload = async () => {
      if (typeof options.reload === "function") {
        await options.reload();
      } else {
        savedSignature = settingsStateSignature(readState());
        syncDirtyState();
      }
    };

    setPageUnsavedGuard(guard);
    form.addEventListener("input", syncDirtyState);
    form.addEventListener("change", syncDirtyState);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      try {
        if (typeof options.save === "function") {
          await options.save();
        }
        savedSignature = settingsStateSignature(readState());
        clearPageUnsavedGuard(guard);
        await reload();
      } catch (error) {
        setStatus(error.message, "error");
        syncDirtyState();
      }
    });

    const cancelButton = options.cancelButtonId ? document.getElementById(options.cancelButtonId) : null;
    if (cancelButton) {
      cancelButton.addEventListener("click", async () => {
        if (guard.isDirty()) {
          const confirmed = await showAdminConfirm(options.confirmOptions || UNSAVED_CHANGES_CONFIRM);
          if (!confirmed) {
            return;
          }
        }
        clearPageUnsavedGuard(guard);
        await reload();
      });
    }
    syncDirtyState();

    return {
      isDirty: guard.isDirty,
      resetBaseline() {
        savedSignature = settingsStateSignature(readState());
        syncDirtyState();
      },
      clearGuard() {
        clearPageUnsavedGuard(guard);
      },
      async confirmDirtyAction(confirmOptions) {
        if (!guard.isDirty()) {
          return true;
        }
        const confirmed = await showAdminConfirm(confirmOptions || options.confirmOptions || UNSAVED_CHANGES_CONFIRM);
        if (confirmed) {
          clearPageUnsavedGuard(guard);
        }
        return confirmed;
      }
    };
  }

  function activeGuestAllergyCount(guestList) {
    const guests = Array.isArray(guestList?.guests) ? guestList.guests : [];
    return guests.filter(guest => guest && guest.active !== false && String(guest.allergies || "").trim()).length;
  }

  function galleyPanelsForGuestList(guestList) {
    const hasAllergies = activeGuestAllergyCount(guestList) > 0;
    return GALLEY_PANELS.map(panel => ({
      ...panel,
      className: panel.id === "guests" && hasAllergies ? "galley-guests-alert" : ""
    }));
  }

  function bindSectionToolbar(section, rerender) {
    const select = document.getElementById(`${section}-charter-select`);
    if (select) {
      fillCharterSelect(select, syncSelectedCharter());
      select.addEventListener("change", async event => {
        const nextCharter = event.target.value;
        if (nextCharter === state.selectedCharter) {
          return;
        }
        if (!await confirmDiscardPageChanges()) {
          fillCharterSelect(select, state.selectedCharter);
          return;
        }
        state.selectedCharter = nextCharter;
        state.bundle = null;
        rerender();
      });
    }
    if (section === "charter") {
      const setActiveButton = document.getElementById("charter-set-active");
      if (setActiveButton) {
        setActiveButton.addEventListener("click", () => {
          setActiveCharter(state.selectedCharter);
        });
      }
      const createButton = document.getElementById("charter-create");
      if (createButton) {
        createButton.addEventListener("click", openCreateCharterModal);
      }
      const deleteButton = document.getElementById("charter-delete");
      if (deleteButton) {
        deleteButton.addEventListener("click", openDeleteCharterModal);
      }
    }
    if (section === "galley" || section === "hotel") {
      const notesButton = document.getElementById(`${section}-notes-button`);
      if (notesButton) {
        notesButton.addEventListener("click", () => {
          openSectionNotesModal(section);
        });
      }
    }
  }

  function departmentLabel(department) {
    if (department === "charter") {
      return "Charter Admin";
    }
    if (department === "galley") {
      return "Galley";
    }
    if (department === "hotel") {
      return "Hotel";
    }
    return department;
  }

  async function renderSettings() {
    if (!state.allowedSections.includes("settings")) {
      els.workspace.innerHTML = "";
      return;
    }
    renderDepartments();
    const panels = [
      { id: "passwords", label: "Passwords" },
      { id: "navigation-feed", label: "OBS Feed" },
      { id: "display-settings", label: "Display Settings" },
      { id: "route-track", label: "Route Track" },
      { id: "weather", label: "Weather" }
    ];
    if (state.sectionPanels.settings === "idle-screen") {
      state.sectionPanels.settings = "display-settings";
    }
    const activePanel = panels.some(panel => panel.id === state.sectionPanels.settings) ? state.sectionPanels.settings : "passwords";
    state.sectionPanels.settings = activePanel;
    els.workspace.innerHTML = sectionShell("settings", panels, activePanel, `
      <section class="card full">
        <div class="card-header"><h2>Settings</h2></div>
        <p class="muted">Loading settings...</p>
      </section>
    `, "");
    bindSectionNav("settings", renderSettings);
    try {
      const content = activePanel === "navigation-feed"
        ? renderNavigationFeedSettings(await loadNavigationFeedSettings())
        : (activePanel === "display-settings"
          ? renderDisplaySettings(await loadDisplaySettings())
          : (activePanel === "route-track"
            ? renderRouteTrackSettings(await loadRouteTrackSettings())
            : (activePanel === "weather"
              ? renderWeatherSettings(await loadWeatherSettings())
              : renderPasswordSettings((await api("/api/admin/passwords")).passwords || {}))));
      els.workspace.innerHTML = sectionShell("settings", panels, activePanel, content, "");
      bindSectionNav("settings", renderSettings);
      if (activePanel === "navigation-feed") {
        bindNavigationFeedSettingsActions();
      } else if (activePanel === "display-settings") {
        bindDisplaySettingsActions();
      } else if (activePanel === "route-track") {
        bindRouteTrackSettingsActions();
      } else if (activePanel === "weather") {
        bindWeatherSettingsActions();
      } else {
        bindPasswordSettingsActions();
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function renderPasswordSettings(passwords) {
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Passwords</h2>
          ${settingsActionButtonsHtml({
            formId: "passwords-form",
            cancelId: "passwords-cancel",
            saveLabel: "Save passwords",
            cancelLabel: "Discard password changes"
          })}
        </div>
        <form id="passwords-form" class="form-grid">
          <label>Charter Password
            <input id="password-charter" type="text" value="${escapeAttribute(passwords.charter || "")}" autocomplete="off" required minlength="4">
          </label>
          <label>Galley Password
            <input id="password-galley" type="text" value="${escapeAttribute(passwords.galley || "")}" autocomplete="off" required minlength="4">
          </label>
          <label>Hotel Password
            <input id="password-hotel" type="text" value="${escapeAttribute(passwords.hotel || "")}" autocomplete="off" required minlength="4">
          </label>
        </form>
      </section>
    `;
  }

  async function loadNavigationFeedSettings() {
    const payload = await api("/api/admin/navigation-feed");
    const navigation = payload && payload.navigation && typeof payload.navigation === "object"
      ? payload.navigation
      : {};
    const idleSettings = payload && payload.idle_screensaver && typeof payload.idle_screensaver === "object"
      ? payload.idle_screensaver
      : {};
    return normalizeNavigationFeedSettings({
      ...navigation,
      obsFeedEnabled: navigation.obsFeedEnabled !== undefined
        ? navigation.obsFeedEnabled
        : (idleSettings.obsFeedEnabled !== undefined ? idleSettings.obsFeedEnabled : idleSettings.obs_feed_enabled)
    });
  }

  function isObsFeedEnabled(settings) {
    const value = settings && typeof settings === "object" ? settings : {};
    const raw = value.obsFeedEnabled !== undefined ? value.obsFeedEnabled : value.obs_feed_enabled;
    return raw !== false;
  }

  function normalizeNavigationFeedSettings(navigation) {
    const value = navigation && typeof navigation === "object" ? navigation : {};
    return {
      hls_url: typeof value.hls_url === "string" ? value.hls_url : "",
      stream_key: typeof value.stream_key === "string" ? value.stream_key : "",
      obsFeedEnabled: isObsFeedEnabled(value)
    };
  }

  function renderNavigationFeedSettings(navigation) {
    return `
      <section class="card full">
        <div class="card-header">
          <h2>OBS Feed</h2>
          ${settingsActionButtonsHtml({
            formId: "navigation-feed-form",
            cancelId: "navigation-feed-cancel",
            saveLabel: "Save OBS feed settings",
            cancelLabel: "Discard OBS feed changes"
          })}
        </div>
        <form id="navigation-feed-form" class="form-grid">
          <div class="full">
            <label class="inline-check">
              <input id="navigation-feed-enabled" type="checkbox" ${navigation.obsFeedEnabled ? "checked" : ""}>
              Show OBS Feed
            </label>
            <p class="muted">Show OBS feed in the Navigation page and idle cycle.</p>
          </div>
          <label class="full">HLS Playlist URL
            <input id="navigation-feed-hls-url" inputmode="url" autocomplete="off" spellcheck="false" value="${escapeAttribute(navigation.hls_url)}">
          </label>
          <label>Stream Key
            <input id="navigation-feed-stream-key" autocomplete="off" spellcheck="false" value="${escapeAttribute(navigation.stream_key)}">
          </label>
        </form>
      </section>
    `;
  }

  async function loadDisplaySettings() {
    const payload = await api("/api/admin/display-settings");
    return normalizeDisplaySettings(payload.display_settings || payload.idle_screensaver || {});
  }

  function normalizeDisplaySettings(settings) {
    const value = settings && typeof settings === "object" ? settings : {};
    return {
      enabled: value.enabled !== false,
      timeout_seconds: numberOrDefault(value.timeout_seconds, 60),
      zoom_cycle_seconds: numberOrDefault(value.zoom_cycle_seconds, 15),
      obsFeedEnabled: isObsFeedEnabled(value),
      obs_feed_interval_seconds: numberOrDefault(value.obs_feed_interval_seconds, 50),
      obs_feed_duration_seconds: numberOrDefault(value.obs_feed_duration_seconds, 20),
      obs_feed_transition_seconds: numberOrDefault(value.obs_feed_transition_seconds, 2),
      obs_ratio: typeof value.obs_ratio === "string" && value.obs_ratio ? value.obs_ratio : "16:9",
      show_weather: value.show_weather !== false,
      show_itinerary: value.show_itinerary !== false,
      show_telemetry: value.show_telemetry !== false,
      telemetry_items: normalizeTelemetryItems(value.telemetry_items, DEFAULT_IDLE_TELEMETRY_ITEMS)
    };
  }

  function numberOrDefault(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function renderTelemetryPicker(selectedItems) {
    const selected = new Set(normalizeTelemetryItems(selectedItems, []));
    return `
      <div class="telemetry-picker" role="group" aria-label="Telemetry items">
        ${TELEMETRY_FIELD_OPTIONS.map(option => `
          <label class="telemetry-picker__option">
            <input type="checkbox" data-telemetry-key="${escapeAttribute(option.key)}" ${selected.has(option.key) ? "checked" : ""}>
            <span>
              <strong>${escapeHtml(option.label)}</strong>
              ${option.unit ? `<small>${escapeHtml(option.unit)}</small>` : ""}
            </span>
          </label>
        `).join("")}
      </div>
    `;
  }

  function renderDisplaySettings(settings) {
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Display Settings</h2>
          ${settingsActionButtonsHtml({
            formId: "display-settings-form",
            cancelId: "display-settings-cancel",
            saveLabel: "Save display settings",
            cancelLabel: "Discard display changes"
          })}
        </div>
        <form id="display-settings-form" class="form-grid">
          <div class="settings-subsection full">
            <h3>Idle Screen</h3>
            <div class="form-grid">
              <label class="inline-check full">
                <input id="idle-enabled" type="checkbox" ${settings.enabled ? "checked" : ""}>
                Enable idle screen
              </label>
              <label>Idle Timeout Seconds
                <input id="idle-timeout" type="number" min="0" step="1" value="${escapeAttribute(settings.timeout_seconds)}">
              </label>
              <label>Zoom Cycle Seconds
                <input id="idle-zoom-cycle" type="number" min="0" step="1" value="${escapeAttribute(settings.zoom_cycle_seconds)}">
              </label>
              <label>OBS Feed Interval Seconds
                <input id="idle-obs-interval" type="number" min="0" step="1" value="${escapeAttribute(settings.obs_feed_interval_seconds)}">
              </label>
              <label>OBS Feed Duration Seconds
                <input id="idle-obs-duration" type="number" min="0" step="1" value="${escapeAttribute(settings.obs_feed_duration_seconds)}">
              </label>
              <label>OBS Transition Seconds
                <input id="idle-obs-transition" type="number" min="0" step="1" value="${escapeAttribute(settings.obs_feed_transition_seconds)}">
              </label>
              <label>OBS Ratio
                <input id="idle-obs-ratio" value="${escapeAttribute(settings.obs_ratio)}">
              </label>
              <div class="check-grid full">
                <label><input id="idle-show-weather" type="checkbox" ${settings.show_weather ? "checked" : ""}> Show weather</label>
                <label><input id="idle-show-itinerary" type="checkbox" ${settings.show_itinerary ? "checked" : ""}> Show itinerary</label>
              </div>
            </div>
          </div>
          <div class="settings-subsection full">
            <h3>Telemetry</h3>
            <label class="inline-check">
              <input id="idle-show-telemetry" type="checkbox" ${settings.show_telemetry ? "checked" : ""}>
              Show telemetry
            </label>
            ${renderTelemetryPicker(settings.telemetry_items)}
          </div>
        </form>
      </section>
    `;
  }

  function readPasswordSettingsForm() {
    return {
      charter: document.getElementById("password-charter").value,
      galley: document.getElementById("password-galley").value,
      hotel: document.getElementById("password-hotel").value
    };
  }

  async function savePasswordSettings() {
    const passwords = readPasswordSettingsForm();
    if (Object.values(passwords).some(value => value.length < 4)) {
      throw new Error("All passwords must be at least 4 characters.");
    }

    await api("/api/admin/passwords/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwords })
    });
    setStatus("Passwords updated successfully", "ok");
  }

  function bindPasswordSettingsActions() {
    bindSettingsFormController({
      formId: "passwords-form",
      cancelButtonId: "passwords-cancel",
      readState: readPasswordSettingsForm,
      save: savePasswordSettings,
      reload: renderSettings
    });
  }

  function readNavigationFeedSettingsForm() {
    return {
      obsFeedEnabled: document.getElementById("navigation-feed-enabled").checked,
      hls_url: document.getElementById("navigation-feed-hls-url").value.trim(),
      stream_key: document.getElementById("navigation-feed-stream-key").value.trim()
    };
  }

  async function saveNavigationFeedSettings() {
    const navigation = readNavigationFeedSettingsForm();
    await api("/api/admin/navigation-feed/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ navigation })
    });
    setStatus("OBS feed settings saved.", "ok");
  }

  function bindNavigationFeedSettingsActions() {
    bindSettingsFormController({
      formId: "navigation-feed-form",
      cancelButtonId: "navigation-feed-cancel",
      readState: readNavigationFeedSettingsForm,
      save: saveNavigationFeedSettings,
      reload: renderSettings
    });
  }

  function readDisplaySettingsForm() {
    return {
      enabled: document.getElementById("idle-enabled").checked,
      timeout_seconds: Number(document.getElementById("idle-timeout").value),
      zoom_cycle_seconds: Number(document.getElementById("idle-zoom-cycle").value),
      obs_feed_interval_seconds: Number(document.getElementById("idle-obs-interval").value),
      obs_feed_duration_seconds: Number(document.getElementById("idle-obs-duration").value),
      obs_feed_transition_seconds: Number(document.getElementById("idle-obs-transition").value),
      obs_ratio: document.getElementById("idle-obs-ratio").value.trim(),
      show_weather: document.getElementById("idle-show-weather").checked,
      show_itinerary: document.getElementById("idle-show-itinerary").checked,
      show_telemetry: document.getElementById("idle-show-telemetry").checked,
      telemetry_items: normalizeTelemetryItems(
        Array.from(document.querySelectorAll("[data-telemetry-key]:checked")).map(input => input.dataset.telemetryKey),
        []
      )
    };
  }

  async function saveDisplaySettings() {
    const display_settings = readDisplaySettingsForm();
    await api("/api/admin/display-settings/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_settings })
    });
    setStatus("Display settings saved.", "ok");
  }

  function bindDisplaySettingsActions() {
    bindSettingsFormController({
      formId: "display-settings-form",
      cancelButtonId: "display-settings-cancel",
      readState: readDisplaySettingsForm,
      save: saveDisplaySettings,
      reload: renderSettings
    });
  }

  async function loadRouteTrackSettings() {
    return api("/api/admin/route-track");
  }

  function normalizeRouteTrackAdminPayload(payload) {
    const routeTrack = payload && payload.route_track && typeof payload.route_track === "object" ? payload.route_track : {};
    const runtime = payload && payload.runtime && typeof payload.runtime === "object" ? payload.runtime : {};
    return {
      route_track: {
        active_charter: typeof routeTrack.active_charter === "string" ? routeTrack.active_charter : state.activeCharter,
        retention_days_after_charter: numberOrDefault(routeTrack.retention_days_after_charter, 3)
      },
      runtime: {
        active_charter: typeof runtime.active_charter === "string" ? runtime.active_charter : "",
        point_count: Number.isFinite(Number(runtime.point_count)) ? Number(runtime.point_count) : 0,
        started_at: typeof runtime.started_at === "string" ? runtime.started_at : "",
        updated_at: typeof runtime.updated_at === "string" ? runtime.updated_at : "",
        current_logging_mode: typeof runtime.current_logging_mode === "string" ? runtime.current_logging_mode : "",
        anchor_mode: Boolean(runtime.anchor_mode),
        track_file: typeof runtime.track_file === "string" ? runtime.track_file : "",
        logging: runtime.logging && typeof runtime.logging === "object" ? runtime.logging : {}
      }
    };
  }

  function renderRouteTrackSettings(payload) {
    const normalized = normalizeRouteTrackAdminPayload(payload);
    const routeTrack = normalized.route_track;
    const runtime = normalized.runtime;
    const logging = runtime.logging || {};
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Route Track</h2>
          ${settingsActionButtonsHtml({
            formId: "route-track-form",
            cancelId: "route-track-cancel",
            saveLabel: "Save route track settings",
            cancelLabel: "Discard route track changes",
            extraActionsHtml: iconButtonHtml("restart-route", "Restart tracked route", ` id="route-track-restart"`)
          })}
        </div>
        <div class="weather-admin-status full">
          <div><strong>Active charter</strong><span>${escapeHtml(charterDisplayName(runtime.active_charter || routeTrack.active_charter))}</span></div>
          <div><strong>Track points</strong><span>${escapeHtml(runtime.point_count)}</span></div>
          <div><strong>Started</strong><span>${escapeHtml(weatherAdminTime(runtime.started_at))}</span></div>
          <div><strong>Updated</strong><span>${escapeHtml(weatherAdminTime(runtime.updated_at))}</span></div>
          <div><strong>Logging mode</strong><span>${escapeHtml(runtime.current_logging_mode || logging.mode || "Initial")}</span></div>
          <div><strong>Logging interval</strong><span>${escapeHtml(logging.current_interval_seconds || 0)} seconds</span></div>
        </div>
        <form id="route-track-form" class="form-grid">
          <label>Retention Days After Charter
            <input id="route-track-retention-days" type="number" min="0" step="1" value="${escapeAttribute(routeTrack.retention_days_after_charter)}">
          </label>
          <p class="muted full">Restart clears current track progress for the active charter only. It does not delete the uploaded planned route.</p>
        </form>
      </section>
    `;
  }

  function readRouteTrackSettingsForm() {
    return {
      retention_days_after_charter: Number(document.getElementById("route-track-retention-days").value)
    };
  }

  async function saveRouteTrackSettings() {
    const route_track = readRouteTrackSettingsForm();
    await api("/api/admin/route-track/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route_track })
    });
    setStatus("Route track settings saved.", "ok");
  }

  function bindRouteTrackSettingsActions() {
    const controller = bindSettingsFormController({
      formId: "route-track-form",
      cancelButtonId: "route-track-cancel",
      readState: readRouteTrackSettingsForm,
      save: saveRouteTrackSettings,
      reload: renderSettings
    });
    document.getElementById("route-track-restart")?.addEventListener("click", async () => {
      if (controller.isDirty()) {
        const discardUnsaved = await showAdminConfirm({
          title: "Unsaved Route Track Settings",
          message: "Restart uses the currently saved route track settings. Save your changes first, or continue and the unsaved edits will be ignored.",
          confirmLabel: "Restart Without Saving",
          cancelLabel: "Keep Editing",
          tone: "warning"
        });
        if (!discardUnsaved) {
          return;
        }
      }
      const confirmed = await showAdminConfirm({
        title: "Restart Tracked Route",
        message: "This restarts the tracked route for the active charter and clears the current route-track progress. This cannot be undone.",
        confirmLabel: "Restart Route",
        cancelLabel: "Cancel",
        tone: "danger"
      });
      if (!confirmed) {
        return;
      }
      controller.clearGuard();
      await postRouteTrackRestart();
    });
  }

  async function postRouteTrackRestart() {
    try {
      const result = await api("/api/route-track/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const cleared = Number(result && result.cleared_points);
      setStatus(`Route track restarted${Number.isFinite(cleared) ? `; cleared ${cleared} point${cleared === 1 ? "" : "s"}.` : "."}`, "ok");
      await renderSettings();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function loadWeatherSettings() {
    return api("/api/admin/weather");
  }

  function weatherAdminTime(value) {
    if (!value) {
      return "Never";
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
  }

  function normalizeWeatherAdminPayload(payload) {
    const weather = payload && payload.weather && typeof payload.weather === "object" ? payload.weather : {};
    const runtime = payload && payload.runtime && typeof payload.runtime === "object" ? payload.runtime : {};
    const fallback = weather.fallback_location && typeof weather.fallback_location === "object" ? weather.fallback_location : {};
    return {
      weather: {
        enabled: weather.enabled !== false,
        primary_provider: typeof weather.primary_provider === "string" ? weather.primary_provider : "open_meteo",
        backup_providers: Array.isArray(weather.backup_providers) ? weather.backup_providers : [],
        cache_ttl_minutes: numberOrDefault(weather.cache_ttl_minutes, 30),
        failover_hours: numberOrDefault(weather.failover_hours, 24),
        request_timeout_seconds: numberOrDefault(weather.request_timeout_seconds, 10),
        max_requests_per_hour: numberOrDefault(weather.max_requests_per_hour, 4),
        show_moon_phase_images: weather.show_moon_phase_images !== false,
        use_last_known_good: weather.use_last_known_good !== false,
        fallback_location: {
          latitude: fallback.latitude,
          longitude: fallback.longitude,
          label: typeof fallback.label === "string" ? fallback.label : ""
        }
      },
      runtime: {
        enabled: runtime.enabled !== false,
        active_provider: runtime.active_provider || "",
        primary_provider: runtime.primary_provider || "",
        backup_providers: Array.isArray(runtime.backup_providers) ? runtime.backup_providers : [],
        failover_until: runtime.failover_until || "",
        failed_provider: runtime.failed_provider || "",
        last_success_at: runtime.last_success_at || "",
        last_error: runtime.last_error || "",
        request_log_summary: runtime.request_log_summary && typeof runtime.request_log_summary === "object" ? runtime.request_log_summary : {},
        providers: Array.isArray(runtime.providers) ? runtime.providers : []
      }
    };
  }

  function weatherProviderList(providers) {
    return providers.length ? providers : [
      { id: "open_meteo", label: "Open-Meteo" },
      { id: "met_no", label: "MET Norway" },
      { id: "wttr_in", label: "wttr.in" }
    ];
  }

  function renderWeatherProviderOptions(providers, selected) {
    const list = weatherProviderList(providers);
    return list.map(provider => `
      <option value="${escapeAttribute(provider.id)}"${provider.id === selected ? " selected" : ""}>${escapeHtml(provider.label || provider.id)}</option>
    `).join("");
  }

  function renderWeatherBackupProviderOptions(providers, primaryProvider, selected) {
    const list = weatherProviderList(providers).filter(provider => provider.id !== primaryProvider);
    const selectedId = list.some(provider => provider.id === selected)
      ? selected
      : (list[0] ? list[0].id : "");
    if (!list.length) {
      return `<option value="">No backup provider available</option>`;
    }
    return list.map(provider => `
      <option value="${escapeAttribute(provider.id)}"${provider.id === selectedId ? " selected" : ""}>${escapeHtml(provider.label || provider.id)}</option>
    `).join("");
  }

  function renderWeatherSettings(payload) {
    const normalized = normalizeWeatherAdminPayload(payload);
    const weather = normalized.weather;
    const runtime = normalized.runtime;
    const summary = runtime.request_log_summary || {};
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Weather</h2>
          ${settingsActionButtonsHtml({
            formId: "weather-settings-form",
            cancelId: "weather-settings-cancel",
            saveLabel: "Save weather settings",
            cancelLabel: "Discard weather settings changes",
            refreshId: "weather-refresh",
            refreshLabel: "Force weather refresh",
            extraActionsHtml: iconButtonHtml("retry-primary", "Clear failover and retry primary", ` id="weather-clear-failover"`)
          })}
        </div>
        <div class="weather-admin-status full">
          <div><strong>Active provider</strong><span>${escapeHtml(runtime.active_provider || weather.primary_provider)}</span></div>
          <div><strong>Last success</strong><span>${escapeHtml(weatherAdminTime(runtime.last_success_at))}</span></div>
          <div><strong>Failover until</strong><span>${escapeHtml(weatherAdminTime(runtime.failover_until))}</span></div>
          <div><strong>Requests last hour</strong><span>${escapeHtml(summary.request_count_last_hour || 0)} / ${escapeHtml(summary.max_requests_per_hour || weather.max_requests_per_hour)}</span></div>
        </div>
        ${runtime.last_error ? `<p class="muted full">Last error: ${escapeHtml(runtime.last_error)}</p>` : ""}
        <form id="weather-settings-form" class="form-grid">
          <label class="inline-check full">
            <input id="weather-enabled" type="checkbox" ${weather.enabled ? "checked" : ""}>
            Enable weather
          </label>
          <label class="inline-check full">
            <input id="weather-show-moon-phase-images" type="checkbox" ${weather.show_moon_phase_images ? "checked" : ""}>
            Show moon phase images on guest weather displays
          </label>
          <label>Primary Provider
            <select id="weather-primary-provider">
              ${renderWeatherProviderOptions(runtime.providers, weather.primary_provider)}
            </select>
          </label>
          <label>Backup Provider
            <select id="weather-backup-provider" required data-selected-backup="${escapeAttribute(weather.backup_providers[0] || "")}">
              ${renderWeatherBackupProviderOptions(runtime.providers, weather.primary_provider, weather.backup_providers[0] || "")}
            </select>
          </label>
          <label>Cache TTL Minutes
            <input id="weather-cache-ttl" type="number" min="5" step="1" value="${escapeAttribute(weather.cache_ttl_minutes)}">
          </label>
          <label>Failover Hours
            <input id="weather-failover-hours" type="number" min="1" step="1" value="${escapeAttribute(weather.failover_hours)}">
          </label>
          <label>Request Timeout Seconds
            <input id="weather-timeout" type="number" min="2" step="1" value="${escapeAttribute(weather.request_timeout_seconds)}">
          </label>
          <label>Max Requests Per Hour
            <input id="weather-max-requests" type="number" min="1" step="1" value="${escapeAttribute(weather.max_requests_per_hour)}">
          </label>
          <label>Fallback Latitude
            <input id="weather-fallback-latitude" type="number" min="-90" max="90" step="0.000001" value="${escapeAttribute(weather.fallback_location.latitude === null || weather.fallback_location.latitude === undefined ? "" : weather.fallback_location.latitude)}">
          </label>
          <label>Fallback Longitude
            <input id="weather-fallback-longitude" type="number" min="-180" max="180" step="0.000001" value="${escapeAttribute(weather.fallback_location.longitude === null || weather.fallback_location.longitude === undefined ? "" : weather.fallback_location.longitude)}">
          </label>
          <label class="full">Fallback Label
            <input id="weather-fallback-label" value="${escapeAttribute(weather.fallback_location.label)}">
          </label>
          <label class="inline-check full">
            <input id="weather-use-last-known-good" type="checkbox" ${weather.use_last_known_good ? "checked" : ""}>
            Use last known good weather when providers fail
          </label>
        </form>
      </section>
    `;
  }

  function readWeatherSettingsForm() {
    return {
      enabled: document.getElementById("weather-enabled").checked,
      primary_provider: document.getElementById("weather-primary-provider").value,
      backup_providers: document.getElementById("weather-backup-provider").value
        ? [document.getElementById("weather-backup-provider").value]
        : [],
      cache_ttl_minutes: Number(document.getElementById("weather-cache-ttl").value),
      failover_hours: Number(document.getElementById("weather-failover-hours").value),
      request_timeout_seconds: Number(document.getElementById("weather-timeout").value),
      max_requests_per_hour: Number(document.getElementById("weather-max-requests").value),
      show_moon_phase_images: document.getElementById("weather-show-moon-phase-images").checked,
      use_last_known_good: document.getElementById("weather-use-last-known-good").checked,
      fallback_location: {
        latitude: document.getElementById("weather-fallback-latitude").value === "" ? null : Number(document.getElementById("weather-fallback-latitude").value),
        longitude: document.getElementById("weather-fallback-longitude").value === "" ? null : Number(document.getElementById("weather-fallback-longitude").value),
        label: document.getElementById("weather-fallback-label").value.trim()
      }
    };
  }

  async function saveWeatherSettings() {
    await api("/api/admin/weather/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weather: readWeatherSettingsForm() })
    });
    setStatus("Weather settings saved.", "ok");
  }

  async function postWeatherAction(path, body, successMessage) {
    try {
      await api(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
      });
      setStatus(successMessage, "ok");
      await renderSettings();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function syncWeatherBackupProviderSelect() {
    const primary = document.getElementById("weather-primary-provider");
    const backup = document.getElementById("weather-backup-provider");
    if (!primary || !backup) {
      return;
    }

    const providers = Array.from(primary.options)
      .map(option => ({ id: option.value, label: option.textContent || option.value }))
      .filter(provider => provider.id && provider.id !== primary.value);
    const previous = backup.value || backup.dataset.selectedBackup || "";
    const selected = providers.some(provider => provider.id === previous)
      ? previous
      : (providers[0] ? providers[0].id : "");

    backup.replaceChildren(...providers.map(provider => {
      const option = document.createElement("option");
      option.value = provider.id;
      option.textContent = provider.label;
      option.selected = provider.id === selected;
      return option;
    }));
    if (!providers.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No backup provider available";
      backup.appendChild(option);
    }
    backup.disabled = !providers.length;
    backup.required = providers.length > 0;
    backup.dataset.selectedBackup = selected;
  }

  function bindWeatherSettingsActions() {
    const primaryProviderInput = document.getElementById("weather-primary-provider");
    if (primaryProviderInput) {
      primaryProviderInput.addEventListener("change", syncWeatherBackupProviderSelect);
    }
    syncWeatherBackupProviderSelect();
    const controller = bindSettingsFormController({
      formId: "weather-settings-form",
      cancelButtonId: "weather-settings-cancel",
      readState: readWeatherSettingsForm,
      save: saveWeatherSettings,
      reload: renderSettings
    });
    document.getElementById("weather-refresh")?.addEventListener("click", async () => {
      const proceed = await controller.confirmDirtyAction({
        title: "Unsaved Weather Settings",
        message: "Refresh uses the currently saved weather settings. Unsaved edits will be ignored and reloaded unless you save them first.",
        confirmLabel: "Refresh Saved Settings",
        cancelLabel: "Keep Editing",
        tone: "warning"
      });
      if (!proceed) {
        return;
      }
      controller.clearGuard();
      await postWeatherAction("/api/admin/weather/refresh", { force: true }, "Forced weather refresh requested.");
    });
    document.getElementById("weather-clear-failover")?.addEventListener("click", async () => {
      const proceed = await controller.confirmDirtyAction({
        title: "Unsaved Weather Settings",
        message: "Clearing failover uses the currently saved weather settings. Unsaved edits will be ignored and reloaded unless you save them first.",
        confirmLabel: "Clear Failover",
        cancelLabel: "Keep Editing",
        tone: "warning"
      });
      if (!proceed) {
        return;
      }
      controller.clearGuard();
      await postWeatherAction("/api/admin/weather/clear-failover", {}, "Weather failover cleared.");
    });
  }

  function cloneData(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  let dialogModal = null;
  let dialogCloseGuard = null;
  let pageUnsavedGuard = null;
  const UNSAVED_CHANGES_CONFIRM = Object.freeze({
    title: "Unsaved Changes",
    message: "You have unsaved changes. Discard them?",
    confirmLabel: "Discard",
    cancelLabel: "Cancel",
    tone: "danger"
  });

  function setPageUnsavedGuard(guard) {
    pageUnsavedGuard = guard && typeof guard === "object" ? guard : null;
  }

  function clearPageUnsavedGuard(guard) {
    if (!guard || pageUnsavedGuard === guard) {
      pageUnsavedGuard = null;
    }
  }

  function hasPageUnsavedChanges() {
    return Boolean(pageUnsavedGuard
      && typeof pageUnsavedGuard.isDirty === "function"
      && pageUnsavedGuard.isDirty());
  }

  async function confirmDiscardPageChanges() {
    if (!hasPageUnsavedChanges()) {
      clearPageUnsavedGuard();
      return true;
    }
    const confirmed = await showAdminConfirm(pageUnsavedGuard.confirmOptions || UNSAVED_CHANGES_CONFIRM);
    if (confirmed) {
      clearPageUnsavedGuard();
    }
    return confirmed;
  }

  window.addEventListener("beforeunload", event => {
    if (!hasPageUnsavedChanges()) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  function syncModalOpenState() {
    const dialogOpen = dialogModal && !dialogModal.classList.contains("hidden");
    const loginOpen = els.loginModal && !els.loginModal.classList.contains("hidden");
    const decisionOpen = Boolean(document.querySelector(".admin-decision-backdrop"));
    const stackedOpen = Boolean(document.querySelector(".menu-form-modal"));
    document.body.classList.toggle("modal-open", Boolean(dialogOpen || loginOpen || decisionOpen || stackedOpen));
  }

  function ensureDialogModal() {
    if (dialogModal) {
      return dialogModal;
    }
    dialogModal = document.createElement("div");
    dialogModal.id = "dialog-modal";
    dialogModal.className = "modal-backdrop hidden";
    dialogModal.setAttribute("role", "dialog");
    dialogModal.setAttribute("aria-modal", "true");
    dialogModal.addEventListener("click", event => {
      if (event.target === dialogModal) {
        return;
      }
      if (event.target.closest("[data-modal-close]")) {
        closeDialogModal();
      }
    });
    dialogModal.addEventListener("wheel", event => {
      if (dialogModal.classList.contains("hidden")) {
        return;
      }
      const modalBody = dialogModal.querySelector(".admin-modal-body");
      if (!modalBody) {
        return;
      }
      if (!modalBody.contains(event.target)) {
        event.preventDefault();
        modalBody.scrollTop += event.deltaY;
      }
      event.stopPropagation();
    }, { passive: false });
    window.addEventListener("keydown", event => {
      if (event.key === "Escape" && dialogModal && !dialogModal.classList.contains("hidden")) {
        const stackedModals = Array.from(document.querySelectorAll(".menu-form-modal"));
        const topStackedModal = stackedModals[stackedModals.length - 1];
        if (topStackedModal) {
          event.preventDefault();
          closeStackedDialogModal(topStackedModal);
          return;
        }
        if (typeof dialogModal._nestedPanelCloseHandler === "function") {
          event.preventDefault();
          dialogModal._nestedPanelCloseHandler();
          return;
        }
        closeDialogModal();
      }
    });
    document.body.appendChild(dialogModal);
    return dialogModal;
  }

  function openDialogModal(title, bodyHtml, options) {
    const modal = ensureDialogModal();
    const settings = options || {};
    dialogCloseGuard = null;
    setNestedPanelCloseHandler(modal, null);
    const headerActions = settings.headerActionsHtml !== undefined
      ? settings.headerActionsHtml
      : (settings.hideClose ? "" : `<div class="button-row modal-title-actions">${iconButtonHtml("cancel", "Close dialog", ` data-modal-close`)}</div>`);
    modal.innerHTML = `
      <div class="modal-card admin-modal-card${settings.cardClass ? ` ${settings.cardClass}` : ""}">
        <div class="card-header">
          <h2 id="dialog-modal-title">${escapeHtml(title)}</h2>
          ${headerActions}
        </div>
        <div class="admin-modal-body">${bodyHtml}</div>
      </div>
    `;
    modal.setAttribute("aria-labelledby", "dialog-modal-title");
    modal.classList.remove("hidden");
    setupModalDirtyGuard(modal);
    syncModalOpenState();
    window.setTimeout(() => {
      const autofocusTarget = modal.querySelector("[data-autofocus], input, textarea, select, button");
      if (autofocusTarget) {
        autofocusTarget.focus();
      }
    }, 0);
    return modal;
  }

  function setupModalDirtyGuard(modal) {
    if (!modal) {
      return;
    }
    modal._dirty = false;
    modal._skipUnsavedWarning = false;
    if (!modal.querySelector("form")) {
      return;
    }
    if (modal._dirtyGuardBound) {
      return;
    }
    const markDirty = event => {
      const target = event.target;
      if (target && target.matches("[readonly], [aria-readonly='true']")) {
        return;
      }
      modal._dirty = true;
    };
    modal.addEventListener("input", markDirty);
    modal.addEventListener("change", markDirty);
    modal._dirtyGuardBound = true;
  }

  function markModalDirty(modal) {
    if (modal) {
      modal._dirty = true;
    }
  }

  function markModalSaved(modal) {
    if (modal) {
      modal._dirty = false;
      modal._skipUnsavedWarning = true;
    }
  }

  async function canCloseDirtyModal(modal) {
    if (!modal || !modal._dirty || modal._skipUnsavedWarning) {
      return true;
    }
    const confirmed = await showAdminConfirm(UNSAVED_CHANGES_CONFIRM);
    if (confirmed) {
      modal._dirty = false;
    }
    return confirmed;
  }

  function openStackedDialogModal(title, bodyHtml, options = {}) {
    const modal = document.createElement("div");
    const titleId = `stacked-modal-title-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const headerActions = options.headerActionsHtml !== undefined
      ? options.headerActionsHtml
      : "";
    modal.className = "modal-backdrop menu-form-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", titleId);
    modal.innerHTML = `
      <div class="modal-card admin-modal-card${options.cardClass ? ` ${options.cardClass}` : ""}">
        <div class="card-header">
          <h2 id="${titleId}">${escapeHtml(title)}</h2>
          ${headerActions}
        </div>
        <div class="admin-modal-body">${bodyHtml}</div>
      </div>
    `;
    modal.addEventListener("click", event => {
      if (event.target === modal) {
        return;
      }
      if (event.target.closest("[data-stacked-modal-close]")) {
        closeStackedDialogModal(modal);
      }
    });
    modal.addEventListener("wheel", event => {
      const modalBody = modal.querySelector(".admin-modal-body");
      if (!modalBody) {
        return;
      }
      if (!modalBody.contains(event.target)) {
        event.preventDefault();
        modalBody.scrollTop += event.deltaY;
      }
      event.stopPropagation();
    }, { passive: false });
    document.body.appendChild(modal);
    setupModalDirtyGuard(modal);
    syncModalOpenState();
    window.setTimeout(() => {
      const autofocusTarget = modal.querySelector("[data-autofocus], input, textarea, select, button");
      if (autofocusTarget) {
        autofocusTarget.focus();
      }
    }, 0);
    return modal;
  }

  async function closeStackedDialogModal(modal) {
    if (!modal) {
      return;
    }
    if (!await canCloseDirtyModal(modal)) {
      return;
    }
    modal.remove();
    syncModalOpenState();
  }

  function setParentModalActionsDisabled(modal, disabled) {
    const title = "Finish or cancel the open panel first";
    const actionGroups = modal
      ? Array.from(modal.querySelectorAll(".modal-card > .card-header .modal-title-actions, .modal-card .menu-day-modal-actions"))
      : [];
    if (!actionGroups.length) {
      return;
    }
    actionGroups.flatMap(actions => Array.from(actions.querySelectorAll("button"))).forEach(button => {
      button.disabled = disabled;
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
      if (disabled) {
        if (!Object.prototype.hasOwnProperty.call(button.dataset, "enabledTitle")) {
          button.dataset.enabledTitle = button.getAttribute("title") || "";
        }
        button.setAttribute("title", title);
      } else {
        const previousTitle = button.dataset.enabledTitle || "";
        if (previousTitle) {
          button.setAttribute("title", previousTitle);
        } else {
          button.removeAttribute("title");
        }
        delete button.dataset.enabledTitle;
        button.removeAttribute("aria-disabled");
      }
    });
  }

  function setNestedPanelCloseHandler(modal, closeHandler) {
    if (!modal) {
      return;
    }
    modal._nestedPanelCloseHandler = typeof closeHandler === "function" ? closeHandler : null;
  }

  async function closeDialogModal(options = {}) {
    if (!dialogModal) {
      return;
    }
    if (!options.force && !await canCloseDirtyModal(dialogModal)) {
      return;
    }
    if (typeof dialogCloseGuard === "function") {
      const canClose = await dialogCloseGuard();
      if (!canClose) {
        return;
      }
    }
    if (typeof dialogModal._pickerCancelHandler === "function") {
      dialogModal._pickerCancelHandler();
      dialogModal._pickerCancelHandler = null;
    }
    dialogCloseGuard = null;
    setParentModalActionsDisabled(dialogModal, false);
    setNestedPanelCloseHandler(dialogModal, null);
    dialogModal.classList.add("hidden");
    dialogModal.innerHTML = "";
    syncModalOpenState();
  }

  function adminModalTone(value) {
    return value === "warning" || value === "danger" ? value : "normal";
  }

  function adminModalMessageHtml(message) {
    return escapeHtml(message || "").replace(/\n/g, "<br>");
  }

  function showAdminConfirm(options = {}) {
    return showAdminDecisionModal({
      title: options.title || "Confirm",
      message: options.message || "",
      confirmLabel: options.confirmLabel || "Confirm",
      cancelLabel: options.cancelLabel || "Cancel",
      tone: options.tone || "normal",
      mode: "confirm"
    });
  }

  function showAdminMessage(options = {}) {
    return showAdminDecisionModal({
      title: options.title || "Message",
      message: options.message || "",
      confirmLabel: options.confirmLabel || "OK",
      tone: options.tone || "normal",
      mode: "message"
    });
  }

  function showAdminPassword(options = {}) {
    return showAdminDecisionModal({
      title: options.title || "Password Required",
      message: options.message || "",
      confirmLabel: options.confirmLabel || "Confirm",
      cancelLabel: options.cancelLabel || "Cancel",
      tone: options.tone || "normal",
      mode: "password"
    });
  }

  function showAdminDecisionModal(settings) {
    return new Promise(resolve => {
      const mode = settings.mode || "confirm";
      const tone = adminModalTone(settings.tone);
      const backdrop = document.createElement("div");
      backdrop.className = `admin-decision-backdrop admin-decision-backdrop--${tone}`;
      backdrop.setAttribute("role", "dialog");
      backdrop.setAttribute("aria-modal", "true");
      backdrop.innerHTML = `
        <form class="admin-decision-card" novalidate>
          <div class="admin-decision-header">
            <h2>${escapeHtml(settings.title || "")}</h2>
          </div>
          <p class="admin-decision-message">${adminModalMessageHtml(settings.message || "")}</p>
          ${mode === "password" ? `
            <label class="admin-decision-password">Password
              <input type="password" autocomplete="current-password" data-admin-decision-password>
            </label>
          ` : ""}
          <div class="button-row admin-decision-actions">
            ${iconSubmitButtonHtml("confirm", settings.confirmLabel || "Confirm", ` data-admin-decision-confirm`)}
            ${mode === "message" ? "" : iconButtonHtml("cancel", settings.cancelLabel || "Cancel", ` data-admin-decision-cancel`)}
          </div>
        </form>
      `;

      let finished = false;
      const closeAsCancelled = () => finish(mode === "password" ? null : false);
      const finish = value => {
        if (finished) {
          return;
        }
        finished = true;
        activeAdminDecisionCloseHandlers.delete(closeAsCancelled);
        window.removeEventListener("keydown", onKeydown, true);
        backdrop.remove();
        syncModalOpenState();
        resolve(value);
      };
      const onKeydown = event => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeAsCancelled();
        }
      };
      activeAdminDecisionCloseHandlers.add(closeAsCancelled);

      backdrop.addEventListener("click", event => {
        if (event.target === backdrop && mode === "message") {
          finish(false);
        }
      });
      const cancelButton = backdrop.querySelector("[data-admin-decision-cancel]");
      if (cancelButton) {
        cancelButton.addEventListener("click", closeAsCancelled);
      }
      backdrop.querySelector(".admin-decision-card").addEventListener("submit", event => {
        event.preventDefault();
        if (mode === "password") {
          finish(backdrop.querySelector("[data-admin-decision-password]").value);
          return;
        }
        finish(true);
      });

      document.body.appendChild(backdrop);
      syncModalOpenState();
      window.addEventListener("keydown", onKeydown, true);
      window.setTimeout(() => {
        const focusTarget = mode === "password"
          ? backdrop.querySelector("[data-admin-decision-password]")
          : backdrop.querySelector("[data-admin-decision-confirm]");
        if (focusTarget) {
          focusTarget.focus();
        }
      }, 0);
    });
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/--+/g, "-");
  }

  function formatCharterNameFromId(value) {
    return String(value || "")
      .split("-")
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "New Charter";
  }

  function currentCharterSummary() {
    return state.charters.find(charter => charter.id === state.selectedCharter) || null;
  }

  async function loadSites() {
    const siteLibrary = normalizeSiteLibrary(await api("/api/admin/sites"));
    state.sites = siteLibrary.sites;
    return siteLibrary;
  }

  async function loadSelections() {
    try {
      state.selections = normalizeSelections(await api("/api/admin/selections"));
    } catch (error) {
      state.selections = normalizeSelections({});
      setStatus(error.message, "error");
    }
  }

  function normalizeSelections(value) {
    const source = value && typeof value === "object" ? value : {};
    const keys = ["crew_roles", "crew_departments", "drink_categories", "available_alcohol_categories", "drink_stock_types", "guest_categories", "bcd_sizes", "wetsuit_sizes", "diving_abilities", "fin_sizes", "cabins", "site_tags"];
    return Object.fromEntries(keys.map(key => [
      key,
      (() => {
        const values = Array.isArray(source[key] || (key === "cabins" ? source.cabin_assignments : null))
          ? (source[key] || source.cabin_assignments).map(item => String(item || "").trim()).filter(Boolean)
          : [];
        return key === "available_alcohol_categories" && !values.length
          ? DEFAULT_AVAILABLE_ALCOHOL_CATEGORIES.slice()
          : values;
      })()
    ]));
  }

  function normalizeCharterInfo(value) {
    const info = value && typeof value === "object" ? cloneData(value) : {};
    const arrival = info.arrival && typeof info.arrival === "object" && !Array.isArray(info.arrival)
      ? { ...info.arrival }
      : {};
    const primaryContact = info.primary_contact && typeof info.primary_contact === "object" && !Array.isArray(info.primary_contact)
      ? { ...info.primary_contact }
      : {};
    const summary = currentCharterSummary();
    return {
      ...info,
      name: typeof info.name === "string" && info.name.trim()
        ? info.name
        : (summary ? (summary.name || summary.id) : formatCharterNameFromId(state.selectedCharter)),
      start_date: typeof info.start_date === "string" ? info.start_date : "",
      end_date: typeof info.end_date === "string" ? info.end_date : "",
      notes: typeof info.notes === "string" ? info.notes : "",
      guest_count: normalizeGuestCount(info.guest_count),
      arrival: {
        ...arrival,
        date: normalizeCharterDateInput(arrival.date),
        time: normalizeCharterTimeInput(arrival.time),
        flight: normalizeCharterText(arrival.flight)
      },
      primary_contact: {
        ...primaryContact,
        name: normalizeCharterText(primaryContact.name),
        phones: normalizeCharterPhoneList(primaryContact.phones)
      },
      charter_style: typeof info.charter_style === "string" && info.charter_style.trim()
        ? info.charter_style
        : "flexible",
      non_swimmers_present: normalizeCharterBoolean(info.non_swimmers_present),
      diving_planned: normalizeCharterBoolean(info.diving_planned),
      diving_guest_count: normalizeNonNegativeInteger(info.diving_guest_count),
      medical_notes_present: normalizeCharterBoolean(info.medical_notes_present),
      dietary_restrictions_present: normalizeCharterBoolean(info.dietary_restrictions_present),
      charter_preference_notes: normalizeCharterText(info.charter_preference_notes),
      drink_preferences_notes: normalizeCharterText(info.drink_preferences_notes)
    };
  }

  function normalizeGuestCount(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 1;
  }

  function normalizeNonNegativeInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : 0;
  }

  function normalizeCharterText(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
  }

  function normalizeCharterBoolean(value, fallback = false) {
    if (value === true || value === false) {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "y", "on"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no", "n", "off", ""].includes(normalized)) {
        return false;
      }
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    return fallback;
  }

  function normalizeCharterDateInput(value) {
    const text = typeof value === "string" ? value.trim() : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && parseLocalDateOnly(text) ? text : "";
  }

  function normalizeCharterTimeInput(value) {
    const text = typeof value === "string" ? value.trim() : "";
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
  }

  function normalizeCharterPhoneList(value) {
    if (Array.isArray(value)) {
      return value.map(item => String(item || "").trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      return value.split(/\r?\n+/).map(item => item.trim()).filter(Boolean);
    }
    return [];
  }

  function charterPhoneListText(value) {
    return normalizeCharterPhoneList(value).join("\n");
  }

  function normalizeItinerary(value) {
    const itinerary = value && typeof value === "object" ? cloneData(value) : {};
    itinerary.summary = typeof itinerary.summary === "string"
      ? itinerary.summary
      : (typeof itinerary.welcome_message === "string" ? itinerary.welcome_message : "");
    itinerary.days = Array.isArray(itinerary.days) ? itinerary.days : [];
    itinerary.alternative_days = Array.isArray(itinerary.alternative_days) ? itinerary.alternative_days : [];
    itinerary.active_plan_by_day = normalizeActivePlanByDay(itinerary.active_plan_by_day);
    const plans = ensureItineraryPlans(itinerary);
    if (!itinerary.days.length && Array.isArray(plans.primary?.days) && plans.primary.days.length) {
      itinerary.days = cloneData(plans.primary.days);
    }
    if (!itinerary.alternative_days.length && Array.isArray(plans.alternative?.days) && plans.alternative.days.length) {
      itinerary.alternative_days = cloneData(plans.alternative.days);
    }
    return itinerary;
  }

  function itineraryPlanById(planId) {
    return ITINERARY_PLANS.find(plan => plan.id === planId) || ITINERARY_PLANS[0];
  }

  function selectedItineraryPlan() {
    const plan = itineraryPlanById(state.selectedItineraryPlan);
    state.selectedItineraryPlan = plan.id;
    return plan;
  }

  function normalizeActivePlanByDay(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.entries(source).reduce((result, [key, planId]) => {
      const dayNumber = Number(key);
      const plan = itineraryPlanById(planId);
      if (Number.isInteger(dayNumber) && dayNumber > 0 && plan && String(planId) === plan.id) {
        result[String(dayNumber)] = plan.id;
      }
      return result;
    }, {});
  }

  function ensureItineraryPlans(itinerary) {
    if (!itinerary || typeof itinerary !== "object") {
      return {};
    }

    if (!itinerary.plans || typeof itinerary.plans !== "object" || Array.isArray(itinerary.plans)) {
      itinerary.plans = {};
    }

    ITINERARY_PLANS.forEach(plan => {
      const existingPlan = itinerary.plans[plan.planKey];
      const planData = existingPlan && typeof existingPlan === "object" && !Array.isArray(existingPlan)
        ? existingPlan
        : {};
      planData.welcome_message = typeof planData.welcome_message === "string" ? planData.welcome_message : "";
      if (!Array.isArray(planData.days)) {
        planData.days = cloneData(Array.isArray(itinerary[plan.legacyDaysKey]) ? itinerary[plan.legacyDaysKey] : []);
      }
      itinerary.plans[plan.planKey] = planData;
    });

    return itinerary.plans;
  }

  function syncItineraryPlanForSave(itinerary, planId = selectedItineraryPlan().id) {
    const plan = itineraryPlanById(planId);
    const plans = ensureItineraryPlans(itinerary);
    plans[plan.planKey].days = cloneData(Array.isArray(plans[plan.planKey].days) ? plans[plan.planKey].days : []);
    if (plan.id === "alternative") {
      itinerary.alternative_days = cloneData(plans[plan.planKey].days);
    }
  }

  function itineraryDaysForPlan(itinerary, planId = selectedItineraryPlan().id) {
    const plan = itineraryPlanById(planId);
    const plans = ensureItineraryPlans(itinerary);
    if (!Array.isArray(plans[plan.planKey].days)) {
      plans[plan.planKey].days = [];
    }
    return plans[plan.planKey].days;
  }

  function setItineraryDaysForPlan(itinerary, planId, days) {
    const plan = itineraryPlanById(planId);
    const plans = ensureItineraryPlans(itinerary);
    plans[plan.planKey].days = Array.isArray(days) ? days : [];
    if (plan.id === "alternative") {
      itinerary.alternative_days = cloneData(plans[plan.planKey].days);
    }
  }

  function itineraryPlanData(itinerary, planId = selectedItineraryPlan().id) {
    const plan = itineraryPlanById(planId);
    const plans = ensureItineraryPlans(itinerary);
    return plans[plan.planKey];
  }

  function itineraryPlanWelcomeMessageValue(itinerary, planId = selectedItineraryPlan().id) {
    const planData = itineraryPlanData(itinerary, planId);
    return typeof planData.welcome_message === "string" ? planData.welcome_message : "";
  }

  function resolvedItineraryWelcomeMessage(itinerary, planId = selectedItineraryPlan().id) {
    const planMessage = itineraryPlanWelcomeMessageValue(itinerary, planId);
    return planMessage.trim()
      ? planMessage
      : (typeof itinerary?.summary === "string" ? itinerary.summary : "");
  }

  function syncItineraryWelcomeMessage(itinerary, planId = selectedItineraryPlan().id) {
    const label = document.getElementById("itinerary-summary-label");
    if (!label) {
      return;
    }
    label.innerHTML = renderWelcomeMessageText(resolvedItineraryWelcomeMessage(itinerary, planId));
  }

  function blankItineraryDay(dayNumber, idPrefix = "day") {
    return {
      id: `${idPrefix}-${String(dayNumber).padStart(3, "0")}`,
      order: dayNumber,
      charter_day: dayNumber,
      active: true,
      site_id: "",
      title: "",
      notes: "",
      stops: []
    };
  }

  function charterDurationDays(charter) {
    const startMatch = String(charter?.start_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const endMatch = String(charter?.end_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!startMatch || !endMatch) {
      return 0;
    }
    const start = Date.UTC(Number(startMatch[1]), Number(startMatch[2]) - 1, Number(startMatch[3]));
    const end = Date.UTC(Number(endMatch[1]), Number(endMatch[2]) - 1, Number(endMatch[3]));
    if (end < start) {
      return 0;
    }
    return Math.floor((end - start) / 86400000) + 1;
  }

  function nextItineraryDayId(existingIds, dayNumber, idPrefix = "day") {
    let candidateNumber = dayNumber;
    let candidate = `${idPrefix}-${String(candidateNumber).padStart(3, "0")}`;
    while (existingIds.has(candidate)) {
      candidateNumber += 1;
      candidate = `${idPrefix}-${String(candidateNumber).padStart(3, "0")}`;
    }
    existingIds.add(candidate);
    return candidate;
  }

  function normalizeItineraryDayList(days, activeCount, idPrefix) {
    const existingIds = new Set();
    const normalizedDays = (Array.isArray(days) ? days : []).map((value, index) => {
      const day = value && typeof value === "object" ? { ...value } : {};
      const numericOrder = Number(day.order || day.day || day.charter_day || index + 1);
      const fallbackOrder = Number.isFinite(numericOrder) && numericOrder > 0 ? numericOrder : index + 1;
      let id = typeof day.id === "string" && day.id.trim() ? day.id.trim() : "";
      if (!id || existingIds.has(id)) {
        id = nextItineraryDayId(existingIds, fallbackOrder, idPrefix);
      } else {
        existingIds.add(id);
      }
      return {
        ...day,
        id,
        order: fallbackOrder,
        title: typeof day.title === "string" ? day.title : (day.title_override || ""),
        site_id: typeof day.site_id === "string" ? day.site_id : "",
        notes: typeof day.notes === "string" ? day.notes : "",
        stops: Array.isArray(day.stops) ? day.stops : []
      };
    });
    normalizedDays.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    while (normalizedDays.length < activeCount) {
      const day = blankItineraryDay(normalizedDays.length + 1, idPrefix);
      day.id = nextItineraryDayId(existingIds, normalizedDays.length + 1, idPrefix);
      normalizedDays.push(day);
    }
    normalizedDays.forEach((day, index) => {
      day.order = index + 1;
      day.charter_day = index + 1;
      day.day = index + 1;
      day.active = index < activeCount;
    });
    return normalizedDays;
  }

  function normalizeItineraryForCharter(charter, itinerary) {
    const hadPrimaryPlanDays = Array.isArray(itinerary?.plans?.primary?.days);
    const hadAlternativePlanDays = Array.isArray(itinerary?.plans?.alternative?.days);
    const normalized = normalizeItinerary(itinerary);
    const duration = charterDurationDays(charter);
    const plans = ensureItineraryPlans(normalized);
    const primarySourceDays = hadPrimaryPlanDays ? plans.primary.days : normalized.days;
    const alternativeSourceDays = hadAlternativePlanDays ? plans.alternative.days : normalized.alternative_days;
    const primaryActiveCount = duration || primarySourceDays.length || normalized.days.length;
    const alternativeActiveCount = duration || alternativeSourceDays.length || primaryActiveCount;
    plans.primary.days = normalizeItineraryDayList(primarySourceDays, primaryActiveCount, "day");
    plans.alternative.days = normalizeItineraryDayList(alternativeSourceDays, alternativeActiveCount, "alt-day");
    normalized.alternative_days = cloneData(plans.alternative.days);
    if (!normalized.days.length) {
      normalized.days = cloneData(plans.primary.days);
    } else {
      normalized.days = normalizeItineraryDayList(normalized.days, duration || normalized.days.length, "day");
    }
    return normalized;
  }

  function normalizeGuestList(value) {
    const guestList = value && typeof value === "object" ? cloneData(value) : {};
    guestList.guests = Array.isArray(guestList.guests) ? guestList.guests.map(normalizeGuestRecord) : [];
    guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests);
    return guestList;
  }

  function blankGuest() {
    return {
      full_name: "",
      preferred_name: "",
      principal: false,
      active: true,
      cabin: "N/A",
      bcd_size: "N/A",
      wetsuit_size: "N/A",
      fin_size: "N/A",
      diving_ability: "N/A",
      diving_qualification: "N/A",
      date_of_last_dive: "N/A",
      allergies: "",
      dietary_preferences: "",
      drinks_preferences: "",
      medical_notes: "",
      notes: ""
    };
  }

  function normalizeGuestDefaultText(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
  }

  function normalizeGuestDefaultNA(value) {
    return typeof value === "string" && value.trim() ? value : "N/A";
  }

  function normalizeGuestDateOfLastDive(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text.toUpperCase() === "N/A") {
      return "N/A";
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && parseLocalDateOnly(text) ? text : "N/A";
  }

  function normalizeGuestRecord(guest) {
    const source = guest && typeof guest === "object" ? { ...guest } : {};
    const legacyPrincipalField = ["princi", "ple"].join("");
    const defaultSelection = value => typeof value === "string" && value.trim() ? value : "N/A";
    const preferredName = typeof source.preferred_name === "string"
      ? source.preferred_name
      : (typeof source.name === "string" ? source.name : "");
    const cabin = defaultSelection(typeof source.cabin === "string" ? source.cabin : (typeof source.cabin_assignment === "string" ? source.cabin_assignment : ""));
    const normalized = {
      ...source,
      full_name: typeof source.full_name === "string" ? source.full_name : "",
      preferred_name: preferredName,
      principal: Boolean(source.principal || source[legacyPrincipalField]),
      active: source.active === undefined ? true : Boolean(source.active),
      cabin,
      bcd_size: defaultSelection(source.bcd_size),
      wetsuit_size: defaultSelection(source.wetsuit_size),
      fin_size: defaultSelection(source.fin_size),
      diving_ability: defaultSelection(source.diving_ability),
      diving_qualification: normalizeGuestDefaultNA(source.diving_qualification),
      date_of_last_dive: normalizeGuestDateOfLastDive(source.date_of_last_dive),
      allergies: normalizeGuestDefaultText(source.allergies),
      dietary_preferences: normalizeGuestDefaultText(source.dietary_preferences),
      drinks_preferences: typeof source.drinks_preferences === "string"
        ? source.drinks_preferences
        : normalizeGuestDefaultText(source.preferences),
      medical_notes: normalizeGuestDefaultText(source.medical_notes),
      notes: normalizeGuestDefaultText(source.notes)
    };
    delete normalized.name;
    delete normalized.cabin_assignment;
    delete normalized.life_vest_size;
    delete normalized.shoe_size;
    delete normalized.preferences;
    delete normalized[legacyPrincipalField];
    return normalized;
  }

  function sortAndEnsurePrincipalGuests(guests) {
    const active = guests.filter(guest => guest.active !== false);
    const inactive = guests.filter(guest => guest.active === false);
    let principalIndex = active.findIndex(guest => guest.principal);
    if (principalIndex < 0 && active.length) {
      principalIndex = 0;
    }
    active.forEach((guest, index) => {
      guest.principal = index === principalIndex;
    });
    if (principalIndex > 0) {
      const principalGuest = active.splice(principalIndex, 1)[0];
      active.unshift(principalGuest);
    }
    inactive.forEach(guest => {
      guest.principal = false;
    });
    return [...active, ...inactive];
  }

  const GUEST_SYSTEM_FIELDS = new Set([
    "active",
    "principal",
    "slot",
    "order",
    "index",
    "sort_order",
    "sortOrder",
    "created_at",
    "createdAt",
    "updated_at",
    "updatedAt",
    "id",
    "uuid",
    "uid",
    "guest_id",
    "guestId"
  ]);

  function isEmptyGuestValue(key, value) {
    if (GUEST_SYSTEM_FIELDS.has(key)) {
      return true;
    }
    if (typeof value === "boolean") {
      return value === false;
    }
    if (typeof value === "number") {
      return !Number.isFinite(value);
    }
    if (value === null || value === undefined) {
      return true;
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    if (typeof value === "object") {
      return Object.keys(value).length === 0;
    }
    const text = String(value).trim();
    if (!text) {
      return true;
    }
    return text.toUpperCase() === "N/A";
  }

  function isGuestRecordEmpty(guest) {
    return Object.entries(guest && typeof guest === "object" ? guest : {})
      .every(([key, value]) => isEmptyGuestValue(key, value));
  }

  function findGuestDemotionTargetIndex(guests) {
    let lastActiveIndex = -1;
    let lastBlankActiveIndex = -1;
    guests.forEach((guest, index) => {
      if (!guest || guest.active === false || guest.principal) {
        return;
      }
      lastActiveIndex = index;
      if (isGuestRecordEmpty(guest)) {
        lastBlankActiveIndex = index;
      }
    });
    return lastBlankActiveIndex >= 0 ? lastBlankActiveIndex : lastActiveIndex;
  }

  function demoteGuestAtIndex(guests, index) {
    const guest = Number.isInteger(index) ? guests[index] : null;
    if (!guest || guest.active === false || guest.principal) {
      return false;
    }
    if (isGuestRecordEmpty(guest)) {
      guests.splice(index, 1);
      return true;
    }
    guest.active = false;
    guest.principal = false;
    return true;
  }

  function normalizeGuestListForCount(guestList, guestCount) {
    const normalized = normalizeGuestList(guestList);
    const count = normalizeGuestCount(guestCount);
    let activeCount = normalized.guests.filter(guest => guest.active !== false).length;
    if (activeCount < count) {
      for (const guest of normalized.guests) {
        if (activeCount >= count) {
          break;
        }
        if (!guest || guest.active !== false) {
          continue;
        }
        guest.active = true;
        guest.principal = false;
        activeCount += 1;
      }
    }
    while (activeCount < count) {
      normalized.guests.push(blankGuest());
      activeCount += 1;
    }
    while (activeCount > count) {
      const demotionIndex = findGuestDemotionTargetIndex(normalized.guests);
      if (!demoteGuestAtIndex(normalized.guests, demotionIndex)) {
        break;
      }
      activeCount -= 1;
    }
    normalized.guests = sortAndEnsurePrincipalGuests(normalized.guests);
    return normalized;
  }

  function normalizeCrewEditorList(value) {
    const crewList = value && typeof value === "object" ? cloneData(value) : {};
    crewList.crew = Array.isArray(crewList.crew) ? crewList.crew : [];
    return crewList;
  }

  function blankCrewMember() {
    return {
      name: "",
      position: "",
      department: "",
      position_order: null,
      description: "",
      role: "",
      note: ""
    };
  }

  function parsePositionOrder(value) {
    if (value === "" || value === null || value === undefined) {
      return null;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || !Number.isInteger(numberValue) || numberValue < 1) {
      return null;
    }
    return numberValue;
  }

  function crewPositionLabel(member) {
    const value = member ? (member.position || member.role) : "";
    return String(value || "").trim() || "Position not set";
  }

  function crewDepartmentLabel(member) {
    const value = member ? member.department : "";
    return String(value || "").trim() || "Department not set";
  }

  function crewPositionOrderLabel(member) {
    const order = parsePositionOrder(member.position_order);
    return order === null ? "" : String(order);
  }

  function sortedCrewEntries(crewList) {
    return (crewList.crew || [])
      .map((member, index) => ({ member, index }))
      .sort((a, b) => {
        const departmentCompare = crewDepartmentLabel(a.member).localeCompare(crewDepartmentLabel(b.member), undefined, { sensitivity: "base" });
        if (departmentCompare) {
          return departmentCompare;
        }
        const orderA = parsePositionOrder(a.member.position_order);
        const orderB = parsePositionOrder(b.member.position_order);
        if (orderA !== null && orderB !== null && orderA !== orderB) {
          return orderA - orderB;
        }
        const positionCompare = crewPositionLabel(a.member).localeCompare(crewPositionLabel(b.member), undefined, { sensitivity: "base" });
        if (positionCompare) {
          return positionCompare;
        }
        const nameCompare = String(a.member.name || "").localeCompare(String(b.member.name || ""), undefined, { sensitivity: "base" });
        return nameCompare || a.index - b.index;
      });
  }

  function normalizedCrewName(member) {
    return String(member && member.name ? member.name : "").trim().toLocaleLowerCase();
  }

  function charterDisplayLabel(charter) {
    return charter && (charter.name || charter.id) ? (charter.name || charter.id) : "Charter";
  }

  function suggestionValuesFrom(value, splitList) {
    if (Array.isArray(value)) {
      return value.flatMap(entry => suggestionValuesFrom(entry, splitList));
    }
    const text = String(value === null || value === undefined ? "" : value).trim();
    if (!text) {
      return [];
    }
    if (splitList) {
      return text.split(",").map(entry => entry.trim()).filter(Boolean);
    }
    return [text];
  }

  function uniqueSortedValues(values) {
    const seen = new Map();
    values.forEach(value => {
      const text = String(value === null || value === undefined ? "" : value).trim();
      if (!text) {
        return;
      }
      const key = text.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.set(key, text);
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  function collectUniqueValues(records, fieldName) {
    const splitList = fieldName === "tags";
    return uniqueSortedValues((Array.isArray(records) ? records : []).flatMap(record => {
      if (!record || typeof record !== "object") {
        return [];
      }
      return suggestionValuesFrom(record[fieldName], splitList);
    }));
  }

  function collectUniqueFieldValues(records, fieldNames) {
    return uniqueSortedValues((Array.isArray(fieldNames) ? fieldNames : [fieldNames]).flatMap(fieldName => collectUniqueValues(records, fieldName)));
  }

  function renderDatalist(id, values) {
    const options = uniqueSortedValues(values);
    if (!options.length) {
      return "";
    }
    return `<datalist id="${escapeAttribute(id)}">${options.map(value => `<option value="${escapeAttribute(value)}"></option>`).join("")}</datalist>`;
  }

  function datalistAttribute(id, values) {
    return uniqueSortedValues(values).length ? ` list="${escapeAttribute(id)}"` : "";
  }

  const GUEST_SELECT_FIELD_CONFIG = Object.freeze({
    cabin: { selectionKey: "cabins", placeholder: "Select cabin..." },
    bcd_size: { selectionKey: "bcd_sizes", placeholder: "Select BCD size..." },
    wetsuit_size: { selectionKey: "wetsuit_sizes", placeholder: "", includePlaceholder: false },
    diving_ability: { selectionKey: "diving_abilities", placeholder: "", includePlaceholder: false },
    fin_size: { selectionKey: "fin_sizes", placeholder: "Select fin size..." }
  });

  function selectionValueKey(value) {
    return String(value === null || value === undefined ? "" : value).trim().toLocaleLowerCase();
  }

  function uniqueOrderedValues(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).flatMap(value => {
      const text = String(value === null || value === undefined ? "" : value).trim();
      if (!text) {
        return [];
      }
      const key = selectionValueKey(text);
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [text];
    });
  }

  function guestSelectionLibraryValues(fieldName) {
    const config = GUEST_SELECT_FIELD_CONFIG[fieldName];
    if (!config) {
      return [];
    }
    const selections = state.selections || {};
    return uniqueOrderedValues(selections[config.selectionKey]);
  }

  function guestSelectionLegacyValue(fieldName, currentValue) {
    const currentText = String(currentValue === null || currentValue === undefined ? "" : currentValue).trim();
    if (!currentText) {
      return "";
    }
    return guestSelectionLibraryValues(fieldName).some(value => selectionValueKey(value) === selectionValueKey(currentText))
      ? ""
      : currentText;
  }

  function guestSelectionOptions(fieldName, currentValue) {
    const options = guestSelectionLibraryValues(fieldName).map(value => ({ value, label: value }));
    const legacyValue = guestSelectionLegacyValue(fieldName, currentValue);
    if (legacyValue) {
      options.unshift({ value: legacyValue, label: `Existing: ${legacyValue}` });
    }
    return options;
  }

  function renderGuestSelectionSelect(id, fieldName, selectedValue, extraAttributes = "") {
    const config = GUEST_SELECT_FIELD_CONFIG[fieldName];
    if (!config) {
      return "";
    }
    const currentText = String(selectedValue === null || selectedValue === undefined ? "" : selectedValue).trim();
    const options = guestSelectionOptions(fieldName, currentText);
    const selectedKey = selectionValueKey(currentText);
    const hasSelectedValue = options.some(option => selectionValueKey(option.value) === selectedKey);
    const placeholderHtml = config.includePlaceholder === false
      ? ""
      : `<option value="" ${hasSelectedValue ? "" : "selected"}>${escapeHtml(config.placeholder)}</option>`;
    return `<select id="${escapeAttribute(id)}"${extraAttributes}>
      ${placeholderHtml}
      ${options.map(option => `<option value="${escapeAttribute(option.value)}"${selectionValueKey(option.value) === selectedKey ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
    </select>`;
  }

  function bindGuestLegacySelection(select, fieldName, currentValue) {
    if (!select) {
      return;
    }
    const legacyValue = guestSelectionLegacyValue(fieldName, currentValue);
    if (!legacyValue) {
      return;
    }
    const legacyKey = selectionValueKey(legacyValue);
    select.addEventListener("change", () => {
      if (selectionValueKey(select.value) === legacyKey) {
        return;
      }
      const legacyOption = Array.from(select.options).find(option => selectionValueKey(option.value) === legacyKey);
      if (legacyOption) {
        legacyOption.remove();
      }
    });
  }

  function drinkItemsForSuggestions(drinks, panel) {
    const sections = Array.isArray(drinks?.sections) ? drinks.sections : [];
    return sections
      .flatMap(section => Array.isArray(section.items) ? section.items : []);
  }

  function getSuggestionList(typeOrFieldName, source) {
    const data = source || {};
    const bundle = data.bundle || state.bundle || {};
    const guestList = data.guestList || bundle["guest_list.json"] || {};
    const crewList = data.crewList || bundle["crew_list.json"] || {};
    const drinks = data.drinks || bundle[GUEST_DRINKS_FILE_NAME] || {};
    const drinkStocks = data.drinkStocks || {};
    const siteLibrary = data.siteLibrary || {};
    const selections = state.selections || {};
    const selectionValues = key => Array.isArray(selections[key]) ? selections[key] : [];
    const guests = Array.isArray(guestList.guests) ? guestList.guests : [];
    const crew = Array.isArray(crewList.crew) ? crewList.crew : [];
    const stockItems = Array.isArray(drinkStocks.items) ? drinkStocks.items : [];
    const sites = Array.isArray(siteLibrary.sites) ? siteLibrary.sites : [];
    if (typeOrFieldName === "cabin" || typeOrFieldName === "cabin_assignment") {
      return guestSelectionLibraryValues("cabin");
    }
    if (typeOrFieldName === "bcd_size") {
      return guestSelectionLibraryValues("bcd_size");
    }
    if (typeOrFieldName === "fin_size") {
      return guestSelectionLibraryValues("fin_size");
    }
    if (["allergies", "dietary_preferences"].includes(typeOrFieldName)) {
      return collectUniqueValues(guests, typeOrFieldName);
    }
    if (typeOrFieldName === "guest_category" || typeOrFieldName === "guest_categories") {
      return uniqueSortedValues([...selectionValues("guest_categories"), ...collectUniqueValues(guests, "category")]);
    }
    if (typeOrFieldName === "position" || typeOrFieldName === "role") {
      return uniqueSortedValues([...selectionValues("crew_roles"), ...collectUniqueFieldValues(crew, ["position", "role"])]);
    }
    if (typeOrFieldName === "department") {
      return uniqueSortedValues([...selectionValues("crew_departments"), ...collectUniqueValues(crew, "department")]);
    }
    if (typeOrFieldName === "category") {
      return uniqueSortedValues([...selectionValues("drink_categories"), ...collectUniqueValues(drinkItemsForSuggestions(drinks, data.panel), "category")]);
    }
    if (typeOrFieldName === "drink_stock_category") {
      return DRINK_STOCK_CATEGORIES.slice();
    }
    if (typeOrFieldName === "tags") {
      return uniqueSortedValues([...selectionValues("site_tags"), ...collectUniqueValues(sites, "tags")]);
    }
    return [];
  }

  function cloneControlsHtml(items, idPrefix, label) {
    if (!Array.isArray(items) || !items.length) {
      return "";
    }
    return `
      <div class="clone-panel full">
        <label>${escapeHtml(label)}
          <select id="${idPrefix}-clone-source">
            <option value="">Choose item to clone...</option>
            ${items.map((item, index) => `<option value="${index}">${escapeHtml(item.name || item.title || `Item ${index + 1}`)}</option>`).join("")}
          </select>
        </label>
        <div class="button-row align-right">
          ${iconButtonHtml("clone", "Clone selected item", ` id="${idPrefix}-clone-button"`)}
        </div>
      </div>
    `;
  }

  function bindCloneButton(modal, idPrefix, items, applyClone) {
    const cloneButton = modal.querySelector(`#${idPrefix}-clone-button`);
    if (!cloneButton) {
      return;
    }
    cloneButton.addEventListener("click", () => {
      const index = Number(modal.querySelector(`#${idPrefix}-clone-source`).value);
      if (Number.isInteger(index) && items[index]) {
        applyClone(cloneData(items[index]));
      }
    });
  }

  function openCrewMemberModal(crewList, memberOrOnSave, maybeOnSave) {
    const existing = memberOrOnSave && typeof memberOrOnSave === "object" ? memberOrOnSave : null;
    const saveHandler = typeof maybeOnSave === "function" ? maybeOnSave : memberOrOnSave;
    const draft = {
      ...blankCrewMember(),
      ...(existing ? cloneData(existing) : {})
    };
    const source = { crewList };
    const positionSuggestions = getSuggestionList("position", source);
    const departmentSuggestions = getSuggestionList("department", source);
    const headerActionsHtml = `
      <div class="button-row modal-title-actions">
        ${iconSubmitButtonHtml("save", "Save crew member", ` form="crew-add-form"`)}
        ${iconButtonHtml("cancel", "Cancel", ` data-modal-close`)}
      </div>
    `;
    const modal = openDialogModal(existing ? "Edit Crew Member" : "Add Crew Member", `
      <form id="crew-add-form" class="form-grid">
        ${renderDatalist("crew-add-position-suggestions", positionSuggestions)}
        ${renderDatalist("crew-add-department-suggestions", departmentSuggestions)}
        <label>Name
          <input id="crew-add-name" value="${escapeAttribute(draft.name || "")}" data-autofocus>
        </label>
        <label>Position / Role
          <input id="crew-add-position" value="${escapeAttribute(draft.position || draft.role || "")}"${datalistAttribute("crew-add-position-suggestions", positionSuggestions)}>
        </label>
        <label>Department
          <input id="crew-add-department" value="${escapeAttribute(draft.department || "")}"${datalistAttribute("crew-add-department-suggestions", departmentSuggestions)}>
        </label>
        <label>Position Order
          <input id="crew-add-position-order" type="number" min="1" step="1" value="${escapeAttribute(crewPositionOrderLabel(draft))}">
        </label>
        <label class="full">Description / Note
          <textarea id="crew-add-description">${escapeText(draft.description || draft.note || "")}</textarea>
        </label>
      </form>
    `, { cardClass: "modal-welcome-message", hideClose: true, headerActionsHtml });
    modal.querySelector("#crew-add-form").addEventListener("submit", event => {
      event.preventDefault();
      const position = modal.querySelector("#crew-add-position").value;
      const description = modal.querySelector("#crew-add-description").value;
      const positionOrder = parsePositionOrder(modal.querySelector("#crew-add-position-order").value);
      saveHandler({
        ...blankCrewMember(),
        ...draft,
        name: modal.querySelector("#crew-add-name").value,
        position,
        department: modal.querySelector("#crew-add-department").value,
        position_order: positionOrder,
        description,
        role: position,
        note: description
      });
      markModalSaved(modal);
      closeDialogModal();
    });
  }

  function importedCrewMembers(destinationCrewList, sourceCrewList) {
    const existingNames = new Set((destinationCrewList.crew || [])
      .map(normalizedCrewName)
      .filter(Boolean));
    const imported = [];
    (sourceCrewList.crew || []).forEach(member => {
      const name = normalizedCrewName(member);
      if (!name || existingNames.has(name)) {
        return;
      }
      existingNames.add(name);
      imported.push(cloneData(member));
    });
    return imported;
  }

  function openCrewImportModal(crewList) {
    if (!canManageCharterAdmin()) {
      setStatus("Only Charter Admin on Bridge can import crew lists.", "error");
      return;
    }
    const currentCharterId = state.selectedCharter;
    const sourceCharters = (Array.isArray(state.charters) ? state.charters : [])
      .filter(charter => charter.id && charter.id !== currentCharterId);
    const sourceRows = sourceCharters.length
      ? sourceCharters.map((charter, index) => `
          <label class="crew-import-option">
            <input type="radio" name="crew-import-source" value="${escapeAttribute(charter.id)}"${index === 0 ? " checked" : ""}>
            <span>
              <strong>${escapeHtml(charterDisplayLabel(charter))}</strong>
              <small>${escapeHtml(charter.id)}</small>
            </span>
          </label>
        `).join("")
      : `<p class="muted">No other charters are available to import from.</p>`;
    const modal = openDialogModal("Import Crew List", `
      <div class="crew-import-panel">
        <p class="muted">Choose another charter to append non-duplicate crew members to the current crew list.</p>
        <div class="crew-import-list">
          ${sourceRows}
        </div>
        <p id="crew-import-error" class="modal-error" role="alert"></p>
        <div class="button-row align-right">
          ${iconButtonHtml("confirm", "Import crew list", ` id="confirm-crew-import"${sourceCharters.length ? "" : " disabled"}`)}
          ${iconButtonHtml("cancel", "Cancel", ` data-modal-close`)}
        </div>
      </div>
    `, { cardClass: "modal-wide", hideClose: true });
    const importButton = modal.querySelector("#confirm-crew-import");
    const errorField = modal.querySelector("#crew-import-error");
    if (!importButton) {
      return;
    }
    importButton.addEventListener("click", async () => {
      const selected = modal.querySelector("input[name='crew-import-source']:checked");
      if (!selected) {
        errorField.textContent = "Choose a charter to import from.";
        return;
      }
      importButton.disabled = true;
      errorField.textContent = "";
      try {
        const bundle = await api(`/api/admin/charter/${encodeURIComponent(selected.value)}`);
        const sourceCrewList = normalizeCrewEditorList(bundle["crew_list.json"]);
        const imported = importedCrewMembers(crewList, sourceCrewList);
        if (!imported.length) {
          setStatus("No new crew members to import.", "ok");
          markModalSaved(modal);
          closeDialogModal();
          return;
        }
        const nextCrewList = {
          ...crewList,
          crew: [...crewList.crew, ...imported]
        };
        const saved = await saveCharterFile(
          "crew_list.json",
          nextCrewList,
          `Imported ${imported.length} crew member${imported.length === 1 ? "" : "s"}.`
        );
        if (!saved) {
          importButton.disabled = false;
          return;
        }
        crewList.crew = normalizeCrewEditorList(saved).crew;
        drawCrewEditors(crewList);
        markModalSaved(modal);
        closeDialogModal();
      } catch (error) {
        errorField.textContent = error.message;
        setStatus(error.message, "error");
        importButton.disabled = false;
      }
    });
  }

  function normalizeSiteLibrary(value) {
    const library = value && typeof value === "object" ? cloneData(value) : {};
    library.sites = Array.isArray(library.sites) ? library.sites : [];
    library.sites.forEach(site => {
      if (!Array.isArray(site.images)) {
        site.images = [];
      }
      if (!Array.isArray(site.media)) {
        site.media = site.images.map(image => normalizeSiteMediaEntry(image)).filter(item => item.src);
      }
      if (!Array.isArray(site.tags)) {
        site.tags = [];
      }
    });
    library.sites.sort((a, b) => siteDisplaySortKey(a).localeCompare(siteDisplaySortKey(b)));
    return library;
  }

  function blankSite() {
    return {
      id: "",
      title: "",
      latitude: "",
      longitude: "",
      description: "",
      images: [],
      media: [],
      tags: []
    };
  }

  function siteMediaTypeFromSrc(src) {
    const extension = String(src || "").split("?")[0].toLowerCase().match(/\.([a-z0-9]+)$/);
    return extension && ["mp4", "webm", "mov"].includes(extension[1]) ? "video" : "image";
  }

  function normalizeSiteMediaEntry(entry) {
    if (typeof entry === "string") {
      const src = entry.trim();
      return src ? { type: siteMediaTypeFromSrc(src), src } : { type: "image", src: "" };
    }
    const item = entry && typeof entry === "object" ? { ...entry } : {};
    const src = typeof item.src === "string" ? item.src.trim() : (typeof item.path === "string" ? item.path.trim() : "");
    return {
      ...item,
      type: item.type === "video" || siteMediaTypeFromSrc(src) === "video" ? "video" : "image",
      src,
      title: typeof item.title === "string" ? item.title : ""
    };
  }

  function legacyImagesFromMediaEntries(entries) {
    return (Array.isArray(entries) ? entries : [])
      .map(normalizeSiteMediaEntry)
      .filter(item => item.src && item.type !== "video")
      .map(item => ({
        src: item.src,
        alt: typeof item.alt === "string" ? item.alt : (typeof item.title === "string" ? item.title : ""),
        caption: typeof item.caption === "string" ? item.caption : (typeof item.title === "string" ? item.title : "")
      }));
  }

  function siteMediaEntries(site) {
    const media = Array.isArray(site?.media)
      ? site.media.map(normalizeSiteMediaEntry).filter(item => item.src)
      : null;
    const legacyImages = (Array.isArray(site?.images) ? site.images : []).map(normalizeSiteMediaEntry).filter(item => item.src);
    if (media && (media.length || !legacyImages.length)) {
      return media;
    }
    return legacyImages;
  }

  function blankSiteImage() {
    return {
      src: "",
      alt: "",
      caption: ""
    };
  }

  function siteDisplayName(site, fallback) {
    return site?.title || site?.name || site?.site_id || site?.id || fallback || "Site";
  }

  function siteDisplaySortKey(site) {
    return siteDisplayName(site, "").toLocaleLowerCase();
  }

  function normalizedSiteName(site) {
    return String(siteDisplayName(site, "") || "").trim().toLocaleLowerCase();
  }

  function assertUniqueSiteName(siteLibrary, name, originalSite) {
    const normalized = String(name || "").trim().toLocaleLowerCase();
    if (!normalized) {
      throw new Error("Site name is required.");
    }
    const duplicate = (Array.isArray(siteLibrary?.sites) ? siteLibrary.sites : [])
      .some(site => site !== originalSite && normalizedSiteName(site) === normalized);
    if (duplicate) {
      throw new Error("A site with this name already exists.");
    }
  }

  function generateUniqueSiteId(name, siteLibrary, originalSite) {
    const base = slugify(name) || "site";
    const existingIds = new Set((Array.isArray(siteLibrary?.sites) ? siteLibrary.sites : [])
      .filter(site => site !== originalSite)
      .map(site => siteIdForInput(site))
      .filter(Boolean));
    let candidate = base;
    let suffix = 2;
    while (existingIds.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function decimalToDmm(value, type) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return { degrees: "", minutes: "", hemisphere: "" };
    }
    const absolute = Math.abs(number);
    const degrees = Math.floor(absolute);
    const minutes = ((absolute - degrees) * 60).toFixed(3);
    const hemisphere = type === "latitude"
      ? (number < 0 ? "S" : "N")
      : (number < 0 ? "W" : "E");
    return { degrees: String(degrees).padStart(type === "latitude" ? 2 : 3, "0"), minutes, hemisphere };
  }

  function dmmToDecimal(degreesValue, minutesValue, hemisphere, type) {
    const degrees = Number(String(degreesValue || "").trim());
    const minutes = Number(String(minutesValue || "").trim());
    const maxDegrees = type === "latitude" ? 90 : 180;
    const validHemispheres = type === "latitude" ? ["N", "S"] : ["E", "W"];
    if (!Number.isInteger(degrees) || degrees < 0 || degrees > maxDegrees) {
      throw new Error(`${type === "latitude" ? "Latitude" : "Longitude"} degrees must be between 0 and ${maxDegrees}.`);
    }
    if (!Number.isFinite(minutes) || minutes < 0 || minutes >= 60) {
      throw new Error(`${type === "latitude" ? "Latitude" : "Longitude"} minutes must be 0 to less than 60.`);
    }
    if (!validHemispheres.includes(hemisphere)) {
      throw new Error(`${type === "latitude" ? "Latitude" : "Longitude"} hemisphere is required.`);
    }
    const decimal = degrees + (minutes / 60);
    const signed = hemisphere === "S" || hemisphere === "W" ? -decimal : decimal;
    if (!Number.isFinite(signed) || Math.abs(signed) > maxDegrees) {
      throw new Error(`${type === "latitude" ? "Latitude" : "Longitude"} is not valid.`);
    }
    return Number(signed.toFixed(6));
  }

  function coordinateFieldsHtml(prefix, label, type, value) {
    const coordinate = decimalToDmm(value, type);
    const hemispheres = type === "latitude" ? ["N", "S"] : ["E", "W"];
    return `
      <fieldset class="coordinate-card full">
        <legend>${escapeHtml(label)}</legend>
        <div class="coordinate-grid">
          <label>Degrees
            <input id="${prefix}-degrees" type="number" min="0" max="${type === "latitude" ? 90 : 180}" step="1" value="${escapeAttribute(coordinate.degrees)}" required>
          </label>
          <label>Minutes
            <input id="${prefix}-minutes" type="number" min="0" max="59.999" step="0.001" value="${escapeAttribute(coordinate.minutes)}" required>
          </label>
          <label>Hemisphere
            <select id="${prefix}-hemisphere" required>
              <option value="">Choose...</option>
              ${hemispheres.map(hemisphere => `<option value="${hemisphere}" ${hemisphere === coordinate.hemisphere ? "selected" : ""}>${hemisphere}</option>`).join("")}
            </select>
          </label>
        </div>
      </fieldset>
    `;
  }

  function readCoordinateFields(modal, prefix, type) {
    return dmmToDecimal(
      modal.querySelector(`#${prefix}-degrees`).value,
      modal.querySelector(`#${prefix}-minutes`).value,
      modal.querySelector(`#${prefix}-hemisphere`).value,
      type
    );
  }

  function formatDmmCoordinate(value, type) {
    const coordinate = decimalToDmm(value, type);
    if (!coordinate.degrees || !coordinate.minutes || !coordinate.hemisphere) {
      return "";
    }
    return `${coordinate.degrees}°${coordinate.minutes}'${coordinate.hemisphere}`;
  }

  function formatSitePosition(site) {
    const latitude = formatDmmCoordinate(site?.latitude, "latitude");
    const longitude = formatDmmCoordinate(site?.longitude, "longitude");
    return latitude && longitude ? `${latitude} ${longitude}` : "Position not set";
  }

  function siteDescriptionPreview(site) {
    return String(site?.description || "").trim() || "No description yet.";
  }

  function parseOptionalNumber(value) {
    const text = String(value === null || value === undefined ? "" : value).trim();
    if (!text) {
      return null;
    }
    const number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  }

  function normalizeSiteEntry(site, existingIds) {
    const draft = site && typeof site === "object" ? { ...site } : {};
    const title = typeof draft.title === "string" ? draft.title.trim() : "";
    const siteIdSource = typeof draft.id === "string" && draft.id.trim()
      ? draft.id
      : (typeof draft.site_id === "string" && draft.site_id.trim() ? draft.site_id : title);
    const siteId = slugify(siteIdSource);
    if (!siteId) {
      throw new Error("Each site needs a site_id.");
    }
    if (existingIds.has(siteId)) {
      throw new Error(`Duplicate site_id: ${siteId}`);
    }
    const latitude = parseOptionalNumber(draft.latitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error(`Site ${siteId} needs a latitude between -90 and 90.`);
    }
    const longitude = parseOptionalNumber(draft.longitude);
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error(`Site ${siteId} needs a longitude between -180 and 180.`);
    }
    const tags = Array.isArray(draft.tags)
      ? draft.tags.map(tag => String(tag || "").trim()).filter(Boolean)
      : String(draft.tags || "").split(",").map(tag => tag.trim()).filter(Boolean);
    const explicitImages = Array.isArray(draft.images)
      ? draft.images.map(image => ({
        src: typeof image?.src === "string" ? image.src.trim() : "",
        alt: typeof image?.alt === "string" ? image.alt : "",
        caption: typeof image?.caption === "string" ? image.caption : ""
      })).filter(image => image.src || image.alt || image.caption)
      : [];
    const normalizedMedia = Array.isArray(draft.media)
      ? draft.media.map(normalizeSiteMediaEntry).filter(item => item.src)
      : null;
    const media = normalizedMedia
      ? (normalizedMedia.length || !explicitImages.length
          ? normalizedMedia
          : explicitImages.map(image => ({ type: "image", src: image.src, title: image.title || image.caption || "", alt: image.alt || "", caption: image.caption || "" })))
      : explicitImages.map(image => ({ type: "image", src: image.src, title: image.title || image.caption || "", alt: image.alt || "", caption: image.caption || "" }));
    const images = normalizedMedia
      ? (normalizedMedia.length || !explicitImages.length ? legacyImagesFromMediaEntries(media) : explicitImages)
      : explicitImages;
    existingIds.add(siteId);
    return {
      ...draft,
      id: siteId,
      title,
      latitude,
      longitude,
      description: typeof draft.description === "string" ? draft.description : "",
      images,
      media,
      tags
    };
  }

  function validateSiteLibrary(siteLibrary) {
    const library = normalizeSiteLibrary(siteLibrary);
    const existingIds = new Set();
    const existingNames = new Set();
    return {
      ...library,
      sites: library.sites.map(site => {
        const normalizedName = normalizedSiteName(site);
        if (!normalizedName) {
          throw new Error("Site name is required.");
        }
        if (existingNames.has(normalizedName)) {
          throw new Error("A site with this name already exists.");
        }
        existingNames.add(normalizedName);
        return normalizeSiteEntry(site, existingIds);
      })
    };
  }

  async function saveSitesLibrary(siteLibrary, successMessage) {
    const normalized = validateSiteLibrary(siteLibrary);
    const saved = await api("/api/admin/sites/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized)
    });
    const normalizedSaved = normalizeSiteLibrary(saved);
    siteLibrary.sites = normalizedSaved.sites;
    state.sites = normalizedSaved.sites;
    setStatus(successMessage || "Sites saved.", "ok");
    return normalizedSaved;
  }

  function siteOptionsHtml(siteLibrary, selectedId) {
    const options = Array.isArray(siteLibrary?.sites) ? siteLibrary.sites : [];
    return `
      <option value="">Select site...</option>
      ${options.map(site => `<option value="${site.id}" ${site.id === selectedId ? "selected" : ""}>${escapeText(site.title || site.id)}</option>`).join("")}
    `;
  }

  function charterDayCountTitle(charterInfo) {
    const startMatch = String(charterInfo?.start_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const endMatch = String(charterInfo?.end_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!startMatch || !endMatch) {
      return "Charter Information";
    }
    const start = Date.UTC(Number(startMatch[1]), Number(startMatch[2]) - 1, Number(startMatch[3]));
    const end = Date.UTC(Number(endMatch[1]), Number(endMatch[2]) - 1, Number(endMatch[3]));
    const days = Math.round((end - start) / 86400000) + 1;
    if (!Number.isFinite(days) || days < 1) {
      return "Charter Information";
    }
    return `Charter Information - ${days} ${days === 1 ? "Day" : "Days"}`;
  }

  function parseLocalDateOnly(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, monthIndex, day);
    if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  function localTodayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function activeCharterDateStatus(charter) {
    const info = charter && charter.charter ? charter.charter : {};
    const start = parseLocalDateOnly(info.start_date);
    const end = parseLocalDateOnly(info.end_date);
    if (!start || !end || end < start) {
      return "incomplete";
    }
    const today = localTodayDate();
    if (today > end) {
      return "completed";
    }
    if (today < start) {
      return "future";
    }
    return "current";
  }

  async function confirmActiveCharterDateStatus(charter) {
    const status = activeCharterDateStatus(charter);
    if (status === "completed") {
      setStatus("This charter has completed and cannot be set as active.", "error");
      return false;
    }
    if (status === "future") {
      return showAdminConfirm({
        title: "Charter Not Started",
        message: "This charter has not started yet. Set it as active anyway?",
        confirmLabel: "Set active",
        cancelLabel: "Cancel",
        tone: "warning"
      });
    }
    if (status === "incomplete") {
      return showAdminConfirm({
        title: "Incomplete Dates",
        message: "This charter has incomplete dates. Set it as active anyway?",
        confirmLabel: "Set active",
        cancelLabel: "Cancel",
        tone: "warning"
      });
    }
    return true;
  }

  function renderCharterInfoPanel(charterInfo) {
    return `
      <section class="card full">
        <div class="card-header">
          <h2>${escapeHtml(charterDayCountTitle(charterInfo))}</h2>
          <div class="button-row align-right">
            ${iconSubmitButtonHtml("save", "Save Charter Information", ` form="charter-info-form"`)}
            ${iconButtonHtml("cancel", "Cancel changes", ` id="cancel-charter-info"`)}
          </div>
        </div>
        <form id="charter-info-form" class="form-grid">
          <label>Charter Name
            <input id="charter-info-name" value="${escapeAttribute(charterInfo.name || "")}" required>
          </label>
          <label>Guest Count
            <input id="charter-info-guest-count" type="number" min="1" step="1" value="${escapeAttribute(normalizeGuestCount(charterInfo.guest_count))}">
          </label>
          <label>Start Date
            <input id="charter-info-start-date" type="date" value="${escapeAttribute(charterInfo.start_date || "")}">
          </label>
          <label>End Date
            <input id="charter-info-end-date" type="date" value="${escapeAttribute(charterInfo.end_date || "")}">
          </label>
          <p class="muted full"><strong>Arrival</strong></p>
          <label>Arrival Date
            <input id="charter-info-arrival-date" type="date" value="${escapeAttribute(charterInfo.arrival?.date || "")}">
          </label>
          <label>Arrival Time
            <input id="charter-info-arrival-time" type="time" value="${escapeAttribute(charterInfo.arrival?.time || "")}">
          </label>
          <label>Arrival Flight
            <input id="charter-info-arrival-flight" value="${escapeAttribute(charterInfo.arrival?.flight || "")}">
          </label>
          <label>Charter Style
            <input id="charter-info-charter-style" value="${escapeAttribute(charterInfo.charter_style || "flexible")}">
          </label>
          <p class="muted full"><strong>Primary Contact</strong></p>
          <label>Primary Contact Name
            <input id="charter-info-primary-contact-name" value="${escapeAttribute(charterInfo.primary_contact?.name || "")}">
          </label>
          <label>Diving Guest Count
            <input id="charter-info-diving-guest-count" type="number" min="0" step="1" value="${escapeAttribute(normalizeNonNegativeInteger(charterInfo.diving_guest_count))}">
          </label>
          <label class="full">Primary Contact Phones
            <textarea id="charter-info-primary-contact-phones" placeholder="One phone number per line">${escapeText(charterPhoneListText(charterInfo.primary_contact?.phones || []))}</textarea>
          </label>
          <p class="muted full"><strong>Preferences & Logistics</strong></p>
          <label class="inline-check">
            <input id="charter-info-non-swimmers-present" type="checkbox" ${charterInfo.non_swimmers_present ? "checked" : ""}>
            Non-swimmers present
          </label>
          <label class="inline-check">
            <input id="charter-info-diving-planned" type="checkbox" ${charterInfo.diving_planned ? "checked" : ""}>
            Diving planned
          </label>
          <label class="inline-check">
            <input id="charter-info-medical-notes-present" type="checkbox" ${charterInfo.medical_notes_present ? "checked" : ""}>
            Medical notes present
          </label>
          <label class="inline-check">
            <input id="charter-info-dietary-restrictions-present" type="checkbox" ${charterInfo.dietary_restrictions_present ? "checked" : ""}>
            Dietary restrictions present
          </label>
          <label class="full">Charter Preference Notes
            <textarea id="charter-info-charter-preference-notes">${escapeText(charterInfo.charter_preference_notes || "")}</textarea>
          </label>
          <label class="full">Drink Preferences Notes
            <textarea id="charter-info-drink-preferences-notes">${escapeText(charterInfo.drink_preferences_notes || "")}</textarea>
          </label>
          <label class="full">Charter Notes
            <textarea id="charter-info-notes">${escapeText(charterInfo.notes || "")}</textarea>
          </label>
        </form>
      </section>
    `;
  }

  function renderItinerarySwitchControls(itinerary, charterInfo) {
    const switchState = getItinerarySwitchState(itinerary, charterInfo);
    const activePlan = itineraryPlanById(switchState.activePlanId || "primary");
    const statusText = switchState.disabledMessage
      || `Guest-visible today: ${activePlan.id === "alternative" ? "Alternative" : "Primary"}`;
    return `
      <div id="itinerary-switch-controls" class="itinerary-switch-controls">
        <div class="itinerary-switch-status">${escapeHtml(statusText)}</div>
        <div class="itinerary-switch-actions">
          ${ITINERARY_PLANS.map(plan => `
            <button
              class="itinerary-switch-button${plan.id === switchState.activePlanId ? " active" : ""}"
              type="button"
              data-itinerary-switch-plan="${escapeAttribute(plan.id)}"
              ${switchState.disabled || plan.id === switchState.activePlanId ? "disabled" : ""}
            >Use ${plan.id === "alternative" ? "Alternative" : "Primary"} From Today</button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderItineraryPanel(itinerary, charterInfo) {
    const duration = charterDurationDays(charterInfo);
    const activePlan = selectedItineraryPlan();
    return `
      <section id="itinerary-panel-card" class="card full itinerary-panel-card" data-itinerary-active-plan="${escapeAttribute(activePlan.id)}">
        <div class="card-header"><h2>Itinerary</h2></div>
        <div id="itinerary-plan-selector" class="itinerary-plan-selector" role="group" aria-label="Itinerary plan selector">
          ${ITINERARY_PLANS.map(plan => `
            <button
              class="itinerary-plan-button${plan.id === activePlan.id ? " active" : ""}"
              type="button"
              data-itinerary-plan="${escapeAttribute(plan.id)}"
              aria-pressed="${plan.id === activePlan.id ? "true" : "false"}"
            >${escapeHtml(plan.label)}</button>
          `).join("")}
          ${iconButtonHtml("import", "Import Primary", ` id="import-primary-itinerary"${activePlan.id === "alternative" ? "" : " hidden"}`)}
        </div>
        ${renderItinerarySwitchControls(itinerary, charterInfo)}
        <div id="itinerary-day-selector" class="itinerary-day-selector" aria-label="Itinerary day selector"></div>
        ${renderWelcomeMessageBlock(resolvedItineraryWelcomeMessage(itinerary, activePlan.id))}
        ${duration ? "" : `<p class="muted">Set charter start and end dates to generate active itinerary days.</p>`}
        <div id="itinerary-days" class="editor-list"></div>
      </section>
    `;
  }

  function renderWelcomeMessageText(summary) {
    const text = String(summary || "").trim();
    return text ? escapeHtml(text) : `<span class="muted">No welcome message yet.</span>`;
  }

  function renderWelcomeMessageBlock(summary) {
    return `
      <div class="welcome-message-heading">
        <h3>Welcome Message</h3>
        <div class="button-row list-add-actions">
          ${iconButtonHtml("edit", "Edit Welcome Message", ` id="edit-itinerary-summary"`)}
          ${iconButtonHtml("preview", "Preview itinerary", ` id="preview-itinerary"`)}
        </div>
      </div>
      <section class="welcome-message-panel">
        <div id="itinerary-summary-label" class="welcome-message-label">${renderWelcomeMessageText(summary)}</div>
      </section>
    `;
  }

  function renderGuestsPanel(options) {
    const settings = {
      title: "Guests",
      ...(options || {})
    };
    return `
      <section class="card full">
        <div class="card-header">
          <h2>${escapeHtml(settings.title)}</h2>
        </div>
        <div id="guest-editor-list" class="editor-list"></div>
      </section>
    `;
  }

  function charterNotesText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function charterNotesBooleanText(value) {
    return value ? "Yes" : "No";
  }

  function renderCharterNotesFlagGrid(items) {
    return `
      <div class="charter-notes-grid">
        ${items.map(item => `
          <div class="charter-notes-grid-item">
            <strong>${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.value)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderCharterNotesBlock(title, text) {
    const value = charterNotesText(text);
    if (!value) {
      return "";
    }
    return `
      <section class="charter-notes-block">
        <h3>${escapeHtml(title)}</h3>
        <p>${previewMultilineHtml(value)}</p>
      </section>
    `;
  }

  function renderCharterNotesEmptyState() {
    return `<p class="muted">No charter notes recorded for this section.</p>`;
  }

  function renderGalleyNotesBody(charterInfo) {
    const preferenceNotes = charterNotesText(charterInfo.charter_preference_notes);
    const additionalNotes = charterNotesText(charterInfo.notes);
    const hasContent = Boolean(charterInfo.dietary_restrictions_present || preferenceNotes || additionalNotes);
    if (!hasContent) {
      return renderCharterNotesEmptyState();
    }
    return `
      <div class="charter-notes-panel">
        <p class="muted">Read-only charter notes relevant to galley service.</p>
        <section class="charter-notes-block">
          <h3>Galley Overview</h3>
          ${renderCharterNotesFlagGrid([
            { label: "Dietary restrictions present", value: charterNotesBooleanText(charterInfo.dietary_restrictions_present) }
          ])}
        </section>
        ${renderCharterNotesBlock("Charter Preference Notes", preferenceNotes)}
        ${renderCharterNotesBlock("Additional Charter Notes", additionalNotes)}
      </div>
    `;
  }

  function renderHotelNotesBody(charterInfo) {
    const preferenceNotes = charterNotesText(charterInfo.charter_preference_notes);
    const drinkNotes = charterNotesText(charterInfo.drink_preferences_notes);
    const hasContent = Boolean(
      charterInfo.medical_notes_present
      || charterInfo.non_swimmers_present
      || charterInfo.diving_planned
      || normalizeNonNegativeInteger(charterInfo.diving_guest_count) > 0
      || preferenceNotes
      || drinkNotes
    );
    if (!hasContent) {
      return renderCharterNotesEmptyState();
    }
    return `
      <div class="charter-notes-panel">
        <p class="muted">Read-only charter notes relevant to hotel and guest service.</p>
        <section class="charter-notes-block">
          <h3>Hotel Overview</h3>
          ${renderCharterNotesFlagGrid([
            { label: "Medical notes present", value: charterNotesBooleanText(charterInfo.medical_notes_present) },
            { label: "Non-swimmers present", value: charterNotesBooleanText(charterInfo.non_swimmers_present) },
            { label: "Diving planned", value: charterNotesBooleanText(charterInfo.diving_planned) },
            { label: "Diving guest count", value: String(normalizeNonNegativeInteger(charterInfo.diving_guest_count)) }
          ])}
        </section>
        ${renderCharterNotesBlock("Charter Preference Notes", preferenceNotes)}
        ${renderCharterNotesBlock("Drink Preference Notes", drinkNotes)}
      </div>
    `;
  }

  async function loadSelectedCharterInfo() {
    const charterId = syncSelectedCharter();
    if (!charterId) {
      return normalizeCharterInfo({});
    }
    const bundle = state.bundle && state.bundle.charter_id === charterId
      ? state.bundle
      : await loadCharter(charterId);
    return normalizeCharterInfo(bundle && bundle["charter.json"]);
  }

  async function openSectionNotesModal(section) {
    try {
      const charterInfo = await loadSelectedCharterInfo();
      const isGalley = section === "galley";
      openDialogModal(
        isGalley ? "Galley Notes" : "Hotel Notes",
        isGalley ? renderGalleyNotesBody(charterInfo) : renderHotelNotesBody(charterInfo),
        { cardClass: "modal-wide" }
      );
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function renderCrewPanel() {
    const canEditCrew = canManageCharterAdmin();
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Crew</h2>
          ${canEditCrew ? `
            <div class="button-row list-add-actions">
              ${iconButtonHtml("add", "Add crew member", ` id="add-crew-member"`)}
              ${iconButtonHtml("import", "Import crew list", ` id="import-crew-list"`)}
            </div>
          ` : ""}
        </div>
        <div id="crew-editor-list" class="editor-list"></div>
      </section>
    `;
  }

  function routeUploadDateLabel(value) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function routePlanLabel(planId) {
    return itineraryPlanById(planId).id === "alternative" ? "Alternative route" : "Primary route";
  }

  function routePlanData(routeData, planId) {
    const route = routeData && typeof routeData === "object" ? routeData : {};
    const plans = route.route && typeof route.route === "object" && !Array.isArray(route.route) ? route.route : {};
    if (plans[planId] && typeof plans[planId] === "object") {
      return plans[planId];
    }
    return planId === "primary" ? route : {};
  }

  function routePlanHasData(routeData, planId) {
    const route = routePlanData(routeData, planId);
    return !!(Array.isArray(route.routes) && route.routes.length);
  }

  function routeUploadFallbackNoticeHtml(routeData, itinerary, charterInfo) {
    const switchState = getItinerarySwitchState(itinerary, charterInfo);
    if (
      switchState.disabled
      || switchState.activePlanId !== "alternative"
      || routePlanHasData(routeData, "alternative")
      || !routePlanHasData(routeData, "primary")
    ) {
      return "";
    }
    return `<p class="muted full">Guests are currently using the Alternative itinerary, but no Alternative route is uploaded. Guest and idle maps will fall back to the Primary route until an Alternative route is uploaded.</p>`;
  }

  function routeUploadPlanStatusHtml(routeData, planId) {
    const route = routePlanData(routeData, planId);
    const source = route.source && typeof route.source === "object" ? route.source : {};
    const filename = typeof source.filename === "string" && source.filename.trim() ? source.filename.trim() : "";
    const uploadedAt = routeUploadDateLabel(source.imported_at);
    const hasRoute = filename || (Array.isArray(route.routes) && route.routes.length);
    const label = routePlanLabel(planId);
    const routeCount = Array.isArray(route.routes) ? route.routes.length : 0;
    if (!hasRoute) {
      return `
        <div class="route-upload-status route-upload-status--empty" role="status" data-route-plan="${escapeAttribute(planId)}">
          <strong>${escapeHtml(label)}</strong>
          <span>No route file uploaded.</span>
        </div>
      `;
    }
    return `
      <div class="route-upload-status" role="status" data-route-plan="${escapeAttribute(planId)}">
        <strong>${escapeHtml(label)}</strong>
        <span>${filename ? `File: ${escapeHtml(filename)}` : "File name unavailable"}</span>
        <span>${uploadedAt ? `Uploaded: ${escapeHtml(uploadedAt)}` : "Upload date unavailable"}</span>
        <span>${routeCount ? `${escapeHtml(routeCount)} route ${routeCount === 1 ? "line" : "lines"}` : "Route line count unavailable"}</span>
      </div>
    `;
  }

  function routeUploadStatusHtml(routeData) {
    return `
      <div class="route-upload-status-grid full">
        ${routeUploadPlanStatusHtml(routeData, "primary")}
        ${routeUploadPlanStatusHtml(routeData, "alternative")}
      </div>
    `;
  }

  function renderRouteUploadPanel(routeData, itinerary, charterInfo) {
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Route Upload</h2>
          <div class="button-row list-add-actions">
            ${iconSubmitButtonHtml("confirm", "Upload and apply route", ` form="route-upload-form" id="route-upload-submit"`)}
            ${iconButtonHtml("cancel", "Cancel route upload", ` id="route-upload-cancel"`)}
          </div>
        </div>
        <form id="route-upload-form" class="form-grid">
          ${routeUploadStatusHtml(routeData)}
          ${routeUploadFallbackNoticeHtml(routeData, itinerary, charterInfo)}
          <fieldset class="route-plan-selector full">
            <legend>Route plan to replace</legend>
            <label class="route-plan-option">
              <input type="radio" name="route-plan" value="primary" checked>
              <span>Primary route</span>
            </label>
            <label class="route-plan-option">
              <input type="radio" name="route-plan" value="alternative">
              <span>Alternative route</span>
            </label>
          </fieldset>
          <label>KML file
            <input id="route-file" type="file" accept=".kml,application/vnd.google-earth.kml+xml,text/xml,application/xml" required>
          </label>
          <p class="muted full">Uploading a route replaces only the selected plan's route and converts the KML into <code>planned-route.json</code>. Existing single-route data is treated as the Primary route.</p>
        </form>
      </section>
    `;
  }

  function renderSitesPanel() {
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Site Editor</h2>
          <div class="button-row list-add-actions">
            ${iconButtonHtml("add", "Add site", ` id="add-site-editor"`)}
          </div>
        </div>
        <div id="site-editor-list" class="editor-list"></div>
      </section>
    `;
  }

  function openCreateCharterModal() {
    if (!canManageCharterAdmin()) {
      setStatus("Only Charter Admin on Bridge can create charters.", "error");
      return;
    }
    const modal = openDialogModal("Create New Charter", `
      <form id="create-charter-form" class="form-grid">
        <label>Charter Name
          <input id="new-charter-name" required placeholder="Display Name" data-autofocus>
        </label>
        <label>Generated Charter ID
          <input id="new-charter-id" readonly aria-readonly="true">
        </label>
        <label>Start Date
          <input id="new-charter-start-date" type="date">
        </label>
        <label>End Date
          <input id="new-charter-end-date" type="date">
        </label>
        <label class="full">Charter Notes
          <textarea id="new-charter-notes"></textarea>
        </label>
        <label>Guest Count
          <input id="new-charter-guest-count" type="number" min="1" step="1" value="1">
        </label>
        <label>Clone From Existing Charter
          <select id="clone-from">
            <option value="">Blank charter</option>
            ${state.charters.map(charter => `<option value="${charter.id}">${escapeText(charter.name || charter.id)}</option>`).join("")}
          </select>
        </label>
        <div class="full clone-panel">
          <p class="muted">Copy selected files from the clone source.</p>
          <div class="check-grid">
            ${[
              ["itinerary", "itinerary"],
              ["crew", "crew"],
              ["menus", "menus"],
              ["drinks", "guest drinks"],
              ["route", "route"]
            ].map(([value, label]) => `<label><input type="checkbox" name="copy" value="${value}"> ${label}</label>`).join("")}
          </div>
        </div>
        <label class="inline-check full"><input type="checkbox" id="set-active-new" checked> Set as active</label>
        <p id="create-charter-error" class="modal-error full" role="alert"></p>
        ${modalActionButtonsHtml({ submitKind: "add", submitLabel: "Create charter" })}
      </form>
    `, { cardClass: "modal-wide", hideClose: true });
    const nameInput = modal.querySelector("#new-charter-name");
    const idInput = modal.querySelector("#new-charter-id");
    const cloneSelect = modal.querySelector("#clone-from");
    const copyInputs = Array.from(modal.querySelectorAll("input[name='copy']"));
    const syncGeneratedId = () => {
      idInput.value = slugify(nameInput.value);
    };
    const syncCopyAvailability = () => {
      const enabled = Boolean(cloneSelect.value);
      copyInputs.forEach(input => {
        input.disabled = !enabled;
        if (!enabled) {
          input.checked = false;
        }
      });
    };
    nameInput.addEventListener("input", syncGeneratedId);
    cloneSelect.addEventListener("change", syncCopyAvailability);
    syncGeneratedId();
    syncCopyAvailability();
    modal.querySelector("#create-charter-form").addEventListener("submit", createCharter);
  }

  async function createCharter(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.querySelector("#new-charter-name").value.trim();
    const charterId = slugify(name);
    const errorField = form.querySelector("#create-charter-error");
    errorField.textContent = "";
    if (!charterId) {
      errorField.textContent = "Charter name is required.";
      return;
    }
    const copy = {};
    form.querySelectorAll("input[name='copy']").forEach(input => {
      copy[input.value] = input.checked;
    });
    const body = {
      charter_id: charterId,
      name,
      start_date: form.querySelector("#new-charter-start-date").value,
      end_date: form.querySelector("#new-charter-end-date").value,
      notes: form.querySelector("#new-charter-notes").value,
      guest_count: normalizeGuestCount(form.querySelector("#new-charter-guest-count").value),
      clone_from: form.querySelector("#clone-from").value,
      copy,
      set_active: form.querySelector("#set-active-new").checked
    };
    try {
      state.selectedCharter = charterId;
      await api("/api/admin/charters/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      markModalSaved(document.getElementById("dialog-modal"));
      closeDialogModal();
      setStatus("Charter created.", "ok");
      await loadBootstrap();
    } catch (error) {
      errorField.textContent = error.message;
    }
  }

  function openDeleteCharterModal() {
    if (!canManageCharterAdmin()) {
      setStatus("Only Charter Admin on Bridge can delete charters.", "error");
      return;
    }
    if (state.charters.length <= 1) {
      setStatus("Cannot delete the only remaining charter.", "error");
      return;
    }
    const summary = currentCharterSummary();
    if (!summary) {
      setStatus("Select a charter to delete.", "error");
      return;
    }
    const modal = openDialogModal("Delete Current Charter", `
      <form id="delete-charter-form" class="form-grid">
        <p class="full">Delete <strong>${escapeHtml(summary.name || summary.id)}</strong>? This permanently removes <code>data/charters/${escapeHtml(summary.id)}</code>.</p>
        <label class="inline-check full"><input id="confirm-delete-charter" type="checkbox" required> I understand this cannot be undone.</label>
        <p id="delete-charter-error" class="modal-error full" role="alert"></p>
        ${modalActionButtonsHtml({ submitKind: "remove", submitLabel: "Delete charter" })}
      </form>
    `, { hideClose: true });
    modal.querySelector("#delete-charter-form").addEventListener("submit", deleteCurrentCharter);
  }

  async function deleteCurrentCharter(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorField = form.querySelector("#delete-charter-error");
    errorField.textContent = "";
    const summary = currentCharterSummary();
    const password = await showAdminPassword({
      title: "Confirm Charter Password",
      message: `Enter the charter password to delete ${summary ? (summary.name || summary.id) : "this charter"}.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger"
    });
    if (password === null) {
      return;
    }
    try {
      const result = await api("/api/admin/charters/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charter_id: state.selectedCharter,
          password
        })
      });
      state.selectedCharter = result.fallback_charter || "";
      markModalSaved(document.getElementById("dialog-modal"));
      closeDialogModal();
      setStatus("Charter deleted.", "ok");
      await loadBootstrap();
    } catch (error) {
      errorField.textContent = error.message;
    }
  }

  function openCreateSiteModal(siteLibrary, onCreated) {
    openSiteEditorModal(siteLibrary, null, async site => {
      const nextLibrary = normalizeSiteLibrary({
        ...siteLibrary,
        sites: [...siteLibrary.sites, site]
      });
      await saveSitesLibrary(nextLibrary, "Site created.");
      siteLibrary.sites = nextLibrary.sites;
      if (typeof onCreated === "function") {
        onCreated(siteLibrary.sites.find(entry => entry.id === site.id) || site);
      }
    });
  }

  function siteIdForInput(site) {
    return site?.id || site?.site_id || slugify(site?.title || site?.name || "");
  }

  function normalizeSiteEditorDraft(draft, siteLibrary, originalSite) {
    const title = String(draft?.title || draft?.name || "").trim();
    assertUniqueSiteName(siteLibrary, title, originalSite);
    const siteId = originalSite
      ? siteIdForInput(originalSite)
      : generateUniqueSiteId(title, siteLibrary, originalSite);
    const existingIds = new Set((Array.isArray(siteLibrary?.sites) ? siteLibrary.sites : [])
      .filter(site => site !== originalSite)
      .map(site => slugify(siteIdForInput(site) || site?.title || site?.name || ""))
      .filter(Boolean));
    return normalizeSiteEntry({ ...draft, id: siteId, title }, existingIds);
  }

  function openSiteEditorModal(siteLibrary, site, onSave) {
    const editing = Boolean(site);
    const draft = {
      ...blankSite(),
      ...(editing ? cloneData(site) : {})
    };
    const mediaItems = siteMediaEntries(draft);
    const pendingMedia = [];
    const tagSuggestions = getSuggestionList("tags", { siteLibrary });
    const headerActionsHtml = `
      <div class="button-row modal-title-actions">
        ${iconSubmitButtonHtml("save", "Save site", ` form="site-editor-form"`)}
        ${iconButtonHtml("cancel", "Cancel", ` data-modal-close`)}
      </div>
    `;
    const modal = openDialogModal(editing ? "Edit Site" : "Add Site", `
      <form id="site-editor-form" class="form-grid" novalidate>
        ${renderDatalist("site-editor-modal-tags-suggestions", tagSuggestions)}
        <label class="full">Name
          <input id="site-editor-title" required value="${escapeAttribute(draft.title || draft.name || "")}" data-autofocus>
        </label>
        ${coordinateFieldsHtml("site-editor-latitude", "Latitude", "latitude", draft.latitude)}
        ${coordinateFieldsHtml("site-editor-longitude", "Longitude", "longitude", draft.longitude)}
        <label class="full">Description
          <textarea id="site-editor-description">${escapeText(draft.description || "")}</textarea>
        </label>
        <label class="full">Tags
          <input id="site-editor-tags" placeholder="reef, whale sharks, beach" value="${escapeAttribute(Array.isArray(draft.tags) ? draft.tags.join(", ") : draft.tags || "")}"${datalistAttribute("site-editor-modal-tags-suggestions", tagSuggestions)}>
        </label>
        <div class="clone-panel full">
          <div class="card-header">
            <h3>Media References</h3>
            ${iconButtonHtml("add", "Add media", ` id="site-editor-add-image"`)}
          </div>
          <div id="site-image-upload-card" class="image-upload-card hidden">
            <label>Title
              <input id="site-editor-media-title" placeholder="Apo Island Reef">
            </label>
            <label>Media file
              <input id="site-editor-image-file" type="file" accept="image/*,video/mp4,video/webm,video/quicktime,.mov">
            </label>
            <div class="button-row">
              ${iconButtonHtml("save", "Use media", ` id="site-editor-queue-image"`)}
              ${iconButtonHtml("cancel", "Cancel upload", ` id="site-editor-cancel-upload"`)}
            </div>
          </div>
          <div id="site-editor-images" class="editor-list"></div>
        </div>
        <p id="site-editor-error" class="modal-error full" role="alert"></p>
      </form>
    `, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });

    const titleInput = modal.querySelector("#site-editor-title");
    const imageList = modal.querySelector("#site-editor-images");
    const uploadCard = modal.querySelector("#site-image-upload-card");
    const uploadTitleInput = modal.querySelector("#site-editor-media-title");
    const uploadInput = modal.querySelector("#site-editor-image-file");
    const errorField = modal.querySelector("#site-editor-error");
    let uploadDirty = false;
    const closeUploadPanel = async (force = false) => {
      if (!force && uploadDirty && !await showAdminConfirm(UNSAVED_CHANGES_CONFIRM)) {
        return;
      }
      uploadTitleInput.value = "";
      uploadInput.value = "";
      uploadDirty = false;
      uploadCard.classList.add("hidden");
      setParentModalActionsDisabled(modal, false);
      setNestedPanelCloseHandler(modal, null);
    };
    [uploadTitleInput, uploadInput].forEach(input => {
      input.addEventListener("input", () => {
        uploadDirty = true;
      });
      input.addEventListener("change", () => {
        uploadDirty = true;
      });
    });

    const renderMediaPreview = item => {
      const media = normalizeSiteMediaEntry(item);
      if (media.type === "video") {
        return `<video class="site-media-preview" src="${escapeAttribute(media.src)}" controls preload="metadata"></video>`;
      }
      return `<img class="site-media-preview" src="${escapeAttribute(media.src)}" alt="${escapeAttribute(media.alt || "")}">`;
    };

    const drawImages = () => {
      imageList.innerHTML = "";
      if (!mediaItems.length && !pendingMedia.length) {
        imageList.innerHTML = `<p class="muted">No media references yet.</p>`;
        return;
      }
      mediaItems.forEach((media, mediaIndex) => {
        const row = document.createElement("div");
        row.className = "image-reference-row";
        row.innerHTML = `
          <div class="site-media-reference">
            ${renderMediaPreview(media)}
            <span>${escapeHtml(media.title || media.caption || media.src || `Media ${mediaIndex + 1}`)}</span>
          </div>
          <div class="button-row record-actions">
            ${iconButtonHtml("camera", "Preview site media", ` data-action="preview-media"`)}
            ${iconButtonHtml("remove", "Delete media reference", ` data-action="delete-image"`)}
          </div>
        `;
        row.querySelector("[data-action='preview-media']").addEventListener("click", () => {
          openSiteMediaLightbox(mediaItems, mediaIndex);
        });
        row.querySelector("[data-action='delete-image']").addEventListener("click", async () => {
          if (!await showAdminConfirm({
            title: "Remove Media",
            message: "Remove this media reference?",
            confirmLabel: "Remove",
            cancelLabel: "Cancel",
            tone: "danger"
          })) {
            return;
          }
          mediaItems.splice(mediaIndex, 1);
          markModalDirty(modal);
          drawImages();
        });
        imageList.appendChild(row);
      });
      pendingMedia.forEach((pending, pendingIndex) => {
        const row = document.createElement("div");
        row.className = "image-reference-row pending";
        row.innerHTML = `
          <span>Pending upload: ${escapeHtml(pending.title || pending.file.name || `Media ${pendingIndex + 1}`)}</span>
          ${iconButtonHtml("remove", "Delete pending media", ` data-action="delete-pending-image"`)}
        `;
        row.querySelector("[data-action='delete-pending-image']").addEventListener("click", async () => {
          if (!await showAdminConfirm({
            title: "Remove Pending Media",
            message: "Remove this pending media?",
            confirmLabel: "Remove",
            cancelLabel: "Cancel",
            tone: "danger"
          })) {
            return;
          }
          pendingMedia.splice(pendingIndex, 1);
          markModalDirty(modal);
          drawImages();
        });
        imageList.appendChild(row);
      });
    };

    modal.querySelector("#site-editor-add-image").addEventListener("click", () => {
      uploadCard.classList.remove("hidden");
      uploadDirty = false;
      setParentModalActionsDisabled(modal, true);
      setNestedPanelCloseHandler(modal, closeUploadPanel);
      uploadTitleInput.focus();
    });
    modal.querySelector("#site-editor-cancel-upload").addEventListener("click", () => {
      closeUploadPanel();
    });
    modal.querySelector("#site-editor-queue-image").addEventListener("click", () => {
      const file = uploadInput.files && uploadInput.files[0];
      const mediaTitle = uploadTitleInput.value.trim();
      errorField.textContent = "";
      if (!mediaTitle) {
        errorField.textContent = "Media title is required.";
        uploadTitleInput.focus();
        return;
      }
      if (!file) {
        errorField.textContent = "Choose a media file to upload.";
        return;
      }
      const fileType = String(file.type || "").toLowerCase();
      const extension = String(file.name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
      const typeKind = /^(image\/jpeg|image\/png|image\/webp|image\/gif)$/i.test(fileType)
        ? "image"
        : (/^(video\/mp4|video\/webm|video\/quicktime|video\/mov)$/i.test(fileType) ? "video" : "");
      const extensionKind = extension && /^(jpe?g|png|webp|gif)$/i.test(extension[1])
        ? "image"
        : (extension && /^(mp4|webm|mov)$/i.test(extension[1]) ? "video" : "");
      const canUseExtensionFallback = !fileType || fileType === "application/octet-stream";
      const allowedMedia = typeKind
        ? (!extensionKind || extensionKind === typeKind)
        : (canUseExtensionFallback && Boolean(extensionKind));
      if (!allowedMedia) {
        errorField.textContent = "Only JPG, PNG, WebP, GIF, MP4, WebM, and MOV files are accepted.";
        return;
      }
      const isVideo = typeKind === "video" || extensionKind === "video";
      const maxBytes = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxBytes) {
        errorField.textContent = isVideo ? "Video files must be 100 MB or smaller." : "Images must be 10 MB or smaller.";
        return;
      }
      pendingMedia.push({ file, title: mediaTitle });
      markModalDirty(modal);
      closeUploadPanel(true);
      drawImages();
    });
    drawImages();

    modal.querySelector("#site-editor-form").addEventListener("submit", async event => {
      event.preventDefault();
      errorField.textContent = "";
      try {
        const title = titleInput.value.trim();
        if (!title) {
          throw new Error("Site name is required.");
        }
        const baseDraft = {
          ...draft,
          title,
          latitude: readCoordinateFields(modal, "site-editor-latitude", "latitude"),
          longitude: readCoordinateFields(modal, "site-editor-longitude", "longitude"),
          description: modal.querySelector("#site-editor-description").value,
          tags: modal.querySelector("#site-editor-tags").value.split(",").map(tag => tag.trim()).filter(Boolean),
          media: mediaItems,
          images: legacyImagesFromMediaEntries(mediaItems)
        };
        normalizeSiteEditorDraft(baseDraft, siteLibrary, site || null);
        const uploadedMedia = [];
        for (const pending of pendingMedia) {
          const upload = await uploadSiteMedia(pending.file, pending.title);
          uploadedMedia.push({
            type: upload.type || siteMediaTypeFromSrc(upload.src || upload.path || ""),
            src: upload.src || upload.path || "",
            title: pending.title,
            alt: pending.title,
            caption: pending.title
          });
        }
        const nextDraft = {
          ...baseDraft,
          media: [...mediaItems, ...uploadedMedia],
          images: legacyImagesFromMediaEntries([...mediaItems, ...uploadedMedia])
        };
        await onSave(normalizeSiteEditorDraft(nextDraft, siteLibrary, site || null));
        markModalSaved(modal);
        closeDialogModal();
      } catch (error) {
        errorField.textContent = error.message || "Unable to save site.";
      }
    });
  }

  function itinerarySiteName(siteLibrary, siteId) {
    if (!siteId) {
      return "No site selected";
    }
    const site = (Array.isArray(siteLibrary?.sites) ? siteLibrary.sites : [])
      .find(candidate => candidate.id === siteId || candidate.site_id === siteId);
    return site ? siteDisplayName(site, siteId) : siteId;
  }

  function itineraryTitlePreview(day) {
    const title = String(day?.title || day?.title_override || day?.notes || "").trim();
    if (!title) {
      return "";
    }
    return title.length > 44 ? `${title.slice(0, 41)}...` : title;
  }

  function itineraryStopTitle(stop, index, siteLibrary) {
    const title = String(stop?.title || stop?.name || stop?.site_name || "").trim();
    if (title) {
      return title;
    }
    if (stop?.site_id) {
      const siteName = itinerarySiteName(siteLibrary, stop.site_id);
      if (siteName && siteName !== "No site selected") {
        return siteName;
      }
    }
    return `Stop ${index + 1}`;
  }

  function itineraryStopDescription(stop) {
    return String(stop?.notes || stop?.note || stop?.description || "").trim();
  }

  function itineraryStopsHtml(day, siteLibrary) {
    const stops = Array.isArray(day?.stops) ? day.stops : [];
    if (!stops.length) {
      return "";
    }
    return `
      <div class="itinerary-stops" aria-label="Stops for day ${escapeAttribute(day.charter_day || day.order || "")}">
        ${stops.map((stop, index) => {
          const description = itineraryStopDescription(stop);
          return `
            <div class="itinerary-stop-row">
              <span class="itinerary-stop-label">Stop ${escapeHtml(index + 1)}</span>
              <span class="itinerary-stop-date"></span>
              <strong>${escapeHtml(itineraryStopTitle(stop, index, siteLibrary))}</strong>
              ${description ? `<span class="multiline-text">${escapeHtml(description)}</span>` : ""}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function itineraryDayDateLabel(charterInfo, day) {
    const startMatch = String(charterInfo?.start_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!startMatch) {
      return "";
    }
    const dayNumber = Number(day?.charter_day || day?.order || day?.day || 1);
    const offset = Number.isFinite(dayNumber) && dayNumber > 0 ? dayNumber - 1 : 0;
    const date = new Date(Date.UTC(
      Number(startMatch[1]),
      Number(startMatch[2]) - 1,
      Number(startMatch[3]) + offset
    ));
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function itineraryDayLongDateLabel(charterInfo, day) {
    const startMatch = String(charterInfo?.start_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!startMatch) {
      return "";
    }
    const dayNumber = Number(day?.charter_day || day?.order || day?.day || 1);
    const offset = Number.isFinite(dayNumber) && dayNumber > 0 ? dayNumber - 1 : 0;
    const date = new Date(Date.UTC(
      Number(startMatch[1]),
      Number(startMatch[2]) - 1,
      Number(startMatch[3]) + offset
    ));
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function itineraryOrdinalDayNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return "";
    }
    const day = Math.round(numeric);
    const mod100 = day % 100;
    const suffix = mod100 >= 11 && mod100 <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th");
    return `${day}${suffix}`;
  }

  function itineraryDayHoverDateLabel(charterInfo, day, fallbackIndex = 0) {
    const startMatch = String(charterInfo?.start_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dayNumber = itineraryDayNumber(day, fallbackIndex);
    if (!startMatch) {
      return `Day ${dayNumber}`;
    }
    const offset = Number.isFinite(dayNumber) && dayNumber > 0 ? dayNumber - 1 : 0;
    const date = new Date(Date.UTC(
      Number(startMatch[1]),
      Number(startMatch[2]) - 1,
      Number(startMatch[3]) + offset
    ));
    if (Number.isNaN(date.getTime())) {
      return `Day ${dayNumber}`;
    }
    const weekday = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      timeZone: "UTC"
    }).format(date);
    const month = new Intl.DateTimeFormat("en-GB", {
      month: "long",
      timeZone: "UTC"
    }).format(date);
    return [
      weekday,
      `${itineraryOrdinalDayNumber(date.getUTCDate())} ${month}`,
      String(date.getUTCFullYear())
    ].join("\n");
  }

  async function saveItinerary(itinerary, successMessage) {
    syncItineraryPlanForSave(itinerary);
    rebuildGuestVisibleItineraryDays(itinerary);
    const saved = await saveCharterFile("itinerary.json", stripItineraryTimingFields(itinerary), successMessage || "Itinerary saved.");
    if (!saved) {
      return null;
    }
    return normalizeItinerary(saved);
  }

  function stripItineraryTimingFields(itinerary) {
    const next = normalizeItinerary(itinerary);
    const cleanDays = days => days.map(day => {
      const cleanDay = { ...day };
      delete cleanDay.start_time;
      delete cleanDay.end_time;
      delete cleanDay.timing;
      delete cleanDay.timings;
      cleanDay.stops = Array.isArray(cleanDay.stops)
        ? cleanDay.stops.map(stop => {
          const cleanStop = { ...(stop && typeof stop === "object" ? stop : {}) };
          delete cleanStop.start_time;
          delete cleanStop.end_time;
          delete cleanStop.timing;
          delete cleanStop.timings;
          return cleanStop;
        })
        : [];
      return cleanDay;
    });
    next.days = cleanDays(next.days);
    next.alternative_days = cleanDays(next.alternative_days);
    ensureItineraryPlans(next);
    ITINERARY_PLANS.forEach(plan => {
      const planData = next.plans[plan.planKey];
      planData.days = cleanDays(Array.isArray(planData.days) ? planData.days : []);
    });
    return next;
  }

  function updateItineraryFromSaved(itinerary, saved) {
    if (!saved) {
      return;
    }
    const normalizedSaved = normalizeItinerary(saved);
    itinerary.summary = normalizedSaved.summary;
    itinerary.days = normalizedSaved.days;
    itinerary.alternative_days = normalizedSaved.alternative_days;
    itinerary.plans = normalizedSaved.plans;
    itinerary.active_plan_by_day = normalizedSaved.active_plan_by_day;
  }

  async function persistItineraryAndRedraw(itinerary, siteLibrary, charterInfo, successMessage) {
    try {
      const saved = await saveItinerary(itinerary, successMessage);
      updateItineraryFromSaved(itinerary, saved);
      drawItineraryDays(itinerary, siteLibrary, charterInfo);
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function swapItineraryRows(itinerary, fromIndex, toIndex, planId = selectedItineraryPlan().id) {
    const rows = [...itineraryDaysForPlan(itinerary, planId)].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    if (toIndex < 0 || toIndex >= rows.length) {
      return false;
    }
    const fromOrder = rows[fromIndex].order;
    rows[fromIndex].order = rows[toIndex].order;
    rows[toIndex].order = fromOrder;
    setItineraryDaysForPlan(itinerary, planId, rows);
    const activeCount = rows.filter(day => day.active).length;
    const planDays = itineraryDaysForPlan(itinerary, planId);
    planDays.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    planDays.forEach((day, index) => {
      day.order = index + 1;
      day.charter_day = index + 1;
      day.day = index + 1;
      day.active = index < activeCount;
    });
    return true;
  }

  function clearItineraryDay(day) {
    day.site_id = "";
    day.title = "";
    day.title_override = "";
    day.notes = "";
    day.stops = [];
    delete day.start_time;
    delete day.end_time;
    delete day.timing;
    delete day.timings;
  }

  function itineraryDayNumber(day, fallbackIndex = 0) {
    const number = Number(day?.charter_day || day?.order || day?.day || fallbackIndex + 1);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : fallbackIndex + 1;
  }

  function itineraryDayHasContent(day) {
    return Boolean(
      String(day?.site_id || "").trim()
      || String(day?.title || day?.title_override || "").trim()
      || String(day?.notes || "").trim()
      || (Array.isArray(day?.stops) && day.stops.length)
    );
  }

  function sortedItineraryDays(itinerary, planId = selectedItineraryPlan().id) {
    return [...itineraryDaysForPlan(itinerary, planId)]
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));
  }

  function getItineraryDateViewState(charterInfo, rows) {
    const firstDayNumber = rows.length ? itineraryDayNumber(rows[0], 0) : 1;
    const finalDayNumber = rows.length
      ? rows.reduce((max, day, index) => Math.max(max, itineraryDayNumber(day, index)), firstDayNumber)
      : firstDayNumber;
    const start = parseLocalDateOnly(charterInfo?.start_date);
    const end = parseLocalDateOnly(charterInfo?.end_date);
    if (!start) {
      return {
        canCalculateCurrentDay: false,
        defaultDayNumber: firstDayNumber,
        currentDayNumber: null,
        allDaysPast: false
      };
    }

    const today = localTodayDate();
    const localDateSerial = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
    const startSerial = localDateSerial(start);
    const todayDayNumber = Math.floor(localDateSerial(today) - startSerial) + 1;
    if (todayDayNumber < 1) {
      return {
        canCalculateCurrentDay: false,
        defaultDayNumber: firstDayNumber,
        currentDayNumber: null,
        allDaysPast: false
      };
    }

    if (end && end >= start && today > end) {
      return {
        canCalculateCurrentDay: true,
        defaultDayNumber: finalDayNumber,
        currentDayNumber: null,
        allDaysPast: true
      };
    }

    const currentDayNumber = firstDayNumber + todayDayNumber - 1;
    if (currentDayNumber > finalDayNumber) {
      return {
        canCalculateCurrentDay: true,
        defaultDayNumber: finalDayNumber,
        currentDayNumber: null,
        allDaysPast: true
      };
    }

    return {
      canCalculateCurrentDay: true,
      defaultDayNumber: Math.max(firstDayNumber, currentDayNumber),
      currentDayNumber,
      allDaysPast: false
    };
  }

  function itinerarySelectionKey(planId = selectedItineraryPlan().id) {
    return `${state.selectedCharter || "active"}:${itineraryPlanById(planId).id}`;
  }

  function getVisibleItineraryDays(rows, viewState) {
    if (!rows.length) {
      return [];
    }
    return rows;
  }

  function itineraryDayStatus(day, fallbackIndex, viewState) {
    if (!viewState || !viewState.canCalculateCurrentDay) {
      return "";
    }
    if (viewState.allDaysPast) {
      return "past";
    }
    const dayNumber = itineraryDayNumber(day, fallbackIndex);
    if (dayNumber < viewState.currentDayNumber) {
      return "past";
    }
    if (dayNumber === viewState.currentDayNumber) {
      return "current";
    }
    return "future";
  }

  function resolveSelectedItineraryDay(rows, visibleRows, viewState) {
    const selectionKey = itinerarySelectionKey();
    const selectedId = state.itinerarySelectedDays[selectionKey];
    const selectedVisibleDay = selectedId
      ? visibleRows.find(day => day.id === selectedId)
      : null;
    if (selectedVisibleDay) {
      return selectedVisibleDay;
    }

    const defaultDay = visibleRows.find((day, index) => itineraryDayNumber(day, index) === viewState.defaultDayNumber)
      || visibleRows[0]
      || rows[0]
      || null;
    if (defaultDay && defaultDay.id) {
      state.itinerarySelectedDays[selectionKey] = defaultDay.id;
    }
    return defaultDay;
  }

  function drawItineraryDaySelector(selector, rows, visibleRows, selectedDay, viewState, charterInfo, onSelect) {
    if (!selector) {
      return;
    }
    selector.innerHTML = "";
    if (!visibleRows.length) {
      selector.hidden = true;
      return;
    }

    selector.hidden = false;
    const list = document.createElement("div");
    list.className = "itinerary-day-pill-list";
    visibleRows.forEach((day, index) => {
      const originalIndex = rows.indexOf(day);
      const dayNumber = itineraryDayNumber(day, originalIndex >= 0 ? originalIndex : index);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "itinerary-day-pill";
      button.textContent = `Day ${dayNumber}`;
      const hoverLabel = itineraryDayHoverDateLabel(charterInfo, day, originalIndex >= 0 ? originalIndex : index);
      button.title = hoverLabel;
      button.setAttribute("aria-label", `${button.textContent}: ${hoverLabel.replace(/\n/g, ", ")}`);
      button.dataset.itineraryDayId = day.id || "";
      const status = itineraryDayStatus(day, originalIndex >= 0 ? originalIndex : index, viewState);
      if (status) {
        button.dataset.itineraryDayStatus = status;
        button.classList.add(`itinerary-day-pill--${status}`);
      }
      const selected = selectedDay && day.id === selectedDay.id;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.addEventListener("click", () => {
        onSelect(day);
      });
      list.appendChild(button);
    });
    selector.appendChild(list);
  }

  function redrawItineraryDaysPreservingSelection(itinerary, siteLibrary, charterInfo, selectedDay) {
    if (selectedDay && selectedDay.id) {
      state.itinerarySelectedDays[itinerarySelectionKey()] = selectedDay.id;
    }
    drawItineraryDays(itinerary, siteLibrary, charterInfo);
  }

  function primaryItineraryDaysForImport(itinerary) {
    const plans = ensureItineraryPlans(itinerary);
    if (Array.isArray(plans.primary?.days)) {
      return plans.primary.days;
    }
    return Array.isArray(itinerary?.days) ? itinerary.days : [];
  }

  function itineraryRowsByDayNumber(rows) {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((day, index) => {
      const dayNumber = itineraryDayNumber(day, index);
      if (!map.has(dayNumber)) {
        map.set(dayNumber, day);
      }
    });
    return map;
  }

  function itineraryFinalDayNumber(itinerary) {
    const plans = ensureItineraryPlans(itinerary);
    const dayNumbers = [];
    const collect = rows => {
      (Array.isArray(rows) ? rows : []).forEach((day, index) => {
        dayNumbers.push(itineraryDayNumber(day, index));
      });
    };
    collect(itinerary.days);
    ITINERARY_PLANS.forEach(plan => collect(plans[plan.planKey]?.days));
    Object.keys(normalizeActivePlanByDay(itinerary.active_plan_by_day)).forEach(key => {
      dayNumbers.push(Number(key));
    });
    return dayNumbers.length ? Math.max(...dayNumbers.filter(number => Number.isFinite(number) && number > 0)) : 0;
  }

  function guestVisiblePlanForDay(itinerary, dayNumber) {
    const activePlanByDay = normalizeActivePlanByDay(itinerary?.active_plan_by_day);
    return itineraryPlanById(activePlanByDay[String(dayNumber)] || "primary").id;
  }

  function rebuildGuestVisibleItineraryDays(itinerary) {
    const plans = ensureItineraryPlans(itinerary);
    itinerary.active_plan_by_day = normalizeActivePlanByDay(itinerary.active_plan_by_day);
    const existingByDay = itineraryRowsByDayNumber(itinerary.days);
    const primaryByDay = itineraryRowsByDayNumber(plans.primary?.days);
    const alternativeByDay = itineraryRowsByDayNumber(plans.alternative?.days);
    const byPlan = {
      primary: primaryByDay,
      alternative: alternativeByDay
    };
    const finalDayNumber = itineraryFinalDayNumber(itinerary);
    const nextDays = [];

    for (let dayNumber = 1; dayNumber <= finalDayNumber; dayNumber += 1) {
      const planId = guestVisiblePlanForDay(itinerary, dayNumber);
      const source = byPlan[planId]?.get(dayNumber)
        || existingByDay.get(dayNumber)
        || primaryByDay.get(dayNumber)
        || alternativeByDay.get(dayNumber);
      if (!source) {
        continue;
      }
      const day = cloneData(source);
      day.order = dayNumber;
      day.charter_day = dayNumber;
      day.day = dayNumber;
      nextDays.push(day);
    }

    itinerary.days = nextDays;
    return nextDays;
  }

  function getItinerarySwitchState(itinerary, charterInfo) {
    const finalDayNumber = itineraryFinalDayNumber(itinerary);
    const start = parseLocalDateOnly(charterInfo?.start_date);
    const end = parseLocalDateOnly(charterInfo?.end_date);

    if (!finalDayNumber) {
      return {
        disabled: true,
        disabledMessage: "No itinerary days are available for switching.",
        switchDayNumber: 1,
        finalDayNumber,
        activePlanId: "primary"
      };
    }

    if (!start) {
      return {
        disabled: true,
        disabledMessage: "Set a valid charter start date before switching itinerary plans.",
        switchDayNumber: 1,
        finalDayNumber,
        activePlanId: guestVisiblePlanForDay(itinerary, 1)
      };
    }

    const today = localTodayDate();
    if (end && end >= start && today > end) {
      return {
        disabled: true,
        disabledMessage: "Charter has ended. Itinerary switching is disabled.",
        switchDayNumber: finalDayNumber,
        finalDayNumber,
        activePlanId: guestVisiblePlanForDay(itinerary, finalDayNumber)
      };
    }

    const localDateSerial = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
    const todayDayNumber = Math.floor(localDateSerial(today) - localDateSerial(start)) + 1;
    const switchDayNumber = Math.min(finalDayNumber, Math.max(1, todayDayNumber));
    return {
      disabled: false,
      disabledMessage: "",
      switchDayNumber,
      finalDayNumber,
      activePlanId: guestVisiblePlanForDay(itinerary, switchDayNumber)
    };
  }

  async function switchGuestItineraryFromToday(itinerary, charterInfo, siteLibrary, targetPlanId) {
    const targetPlan = itineraryPlanById(targetPlanId);
    const switchState = getItinerarySwitchState(itinerary, charterInfo);
    if (switchState.disabled || targetPlan.id === switchState.activePlanId) {
      return;
    }

    const dayNumber = switchState.switchDayNumber;
    const message = targetPlan.id === "alternative"
      ? `Switch guest itinerary to Alternative from Day ${dayNumber} onward? Days before Day ${dayNumber} will be preserved. Days ${dayNumber} onward will be shown to guests from the Alternative itinerary. The Primary itinerary will not be deleted.`
      : `Switch guest itinerary to Primary from Day ${dayNumber} onward? Days before Day ${dayNumber} will be preserved. Days ${dayNumber} onward will be shown to guests from the Primary itinerary. The Alternative itinerary will not be deleted.`;
    const confirmed = await showAdminConfirm({
      title: targetPlan.id === "alternative" ? "Use Alternative From Today" : "Use Primary From Today",
      message,
      confirmLabel: "Switch",
      cancelLabel: "Cancel",
      tone: "warning"
    });
    if (!confirmed) {
      return;
    }

    itinerary.active_plan_by_day = normalizeActivePlanByDay(itinerary.active_plan_by_day);
    for (let day = dayNumber; day <= switchState.finalDayNumber; day += 1) {
      itinerary.active_plan_by_day[String(day)] = targetPlan.id;
    }
    rebuildGuestVisibleItineraryDays(itinerary);

    try {
      const saved = await saveItinerary(itinerary, `Guest itinerary switched to ${targetPlan.label} from Day ${dayNumber}.`);
      updateItineraryFromSaved(itinerary, saved);
      syncItinerarySwitchControls(itinerary, siteLibrary, charterInfo);
      drawItineraryDays(itinerary, siteLibrary, charterInfo);
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function importPrimaryItineraryIntoAlternative(itinerary, siteLibrary, charterInfo) {
    if (selectedItineraryPlan().id !== "alternative") {
      return;
    }

    const confirmed = await showAdminConfirm({
      title: "Import Primary",
      message: "This will replace the current Alternative itinerary with a copy of the Primary itinerary. The Primary itinerary will not be changed.",
      confirmLabel: "Import Primary",
      cancelLabel: "Cancel",
      tone: "warning"
    });
    if (!confirmed) {
      return;
    }

    const sourceDays = primaryItineraryDaysForImport(itinerary);
    const importedDays = normalizeItineraryDayList(cloneData(sourceDays), sourceDays.length, itineraryPlanById("alternative").idPrefix);
    setItineraryDaysForPlan(itinerary, "alternative", importedDays);
    delete state.itinerarySelectedDays[itinerarySelectionKey("alternative")];

    try {
      const saved = await saveItinerary(itinerary, "Primary itinerary imported into Alternative.");
      updateItineraryFromSaved(itinerary, saved);
      syncItineraryPlanSelector();
      syncItineraryWelcomeMessage(itinerary, selectedItineraryPlan().id);
      drawItineraryDays(itinerary, siteLibrary, charterInfo);
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function drawItineraryDays(itinerary, siteLibrary, charterInfo) {
    const container = document.getElementById("itinerary-days");
    const selector = document.getElementById("itinerary-day-selector");
    const plan = selectedItineraryPlan();
    if (!container) {
      return;
    }
    container.innerHTML = "";
    const rows = sortedItineraryDays(itinerary, plan.id);
    if (!rows.length) {
      if (selector) {
        selector.innerHTML = "";
        selector.hidden = true;
      }
      container.innerHTML = `<p class="muted">No itinerary days are available yet.</p>`;
      return;
    }
    const viewState = getItineraryDateViewState(charterInfo, rows);
    const visibleRows = getVisibleItineraryDays(rows, viewState);
    const selectedDay = resolveSelectedItineraryDay(rows, visibleRows, viewState);
    drawItineraryDaySelector(selector, rows, visibleRows, selectedDay, viewState, charterInfo, day => {
      state.itinerarySelectedDays[itinerarySelectionKey(plan.id)] = day.id;
      drawItineraryDays(itinerary, siteLibrary, charterInfo);
    });
    if (!selectedDay) {
      container.innerHTML = `<div class="itinerary-day-empty">No itinerary has been added for this day.</div>`;
      return;
    }
    const longestSiteNameLength = rows.reduce((longest, day) => {
      return Math.max(longest, itinerarySiteName(siteLibrary, day.site_id || "").length);
    }, 12);
    container.style.setProperty("--itinerary-site-column-width", `${longestSiteNameLength + 1}ch`);
    const selectedIndex = rows.indexOf(selectedDay);
    const section = document.createElement("section");
    section.className = `itinerary-row-block${selectedDay.active ? "" : " inactive"}`;
    const dateLabel = itineraryDayDateLabel(charterInfo, selectedDay);
    const hasContent = itineraryDayHasContent(selectedDay);
    section.innerHTML = `
      <div class="record-row itinerary-row${selectedDay.active ? "" : " inactive"}">
        <div class="record-summary itinerary-record-summary">
          <strong class="itinerary-day-label">Day ${escapeHtml(itineraryDayNumber(selectedDay, selectedIndex))}</strong>
          <span class="itinerary-date-label">${dateLabel ? escapeHtml(dateLabel) : ""}</span>
          <span class="itinerary-site-label">${escapeHtml(itinerarySiteName(siteLibrary, selectedDay.site_id || ""))}</span>
          <span class="multiline-text">${escapeHtml(itineraryTitlePreview(selectedDay))}</span>
          ${selectedDay.active ? "" : `<span class="inactive-label">Inactive</span>`}
        </div>
        <div class="button-row record-actions">
          ${iconButtonHtml("edit", "Edit itinerary day", ` data-action="edit-day"`)}
          ${iconButtonHtml("remove", "Clear itinerary day", ` data-action="clear-day"`)}
        </div>
      </div>
      ${hasContent ? "" : `<div class="itinerary-day-empty">No itinerary has been added for this day.</div>`}
      ${String(selectedDay.notes || "").trim() ? `<div class="itinerary-day-notes-preview multiline-text">${escapeHtml(selectedDay.notes)}</div>` : ""}
      ${itineraryStopsHtml(selectedDay, siteLibrary)}
    `;
    section.querySelector("[data-action='edit-day']").addEventListener("click", () => {
      openItineraryDayModal(itinerary, selectedDay, siteLibrary, charterInfo);
    });
    section.querySelector("[data-action='clear-day']").addEventListener("click", async () => {
      if (!await showAdminConfirm({
        title: "Clear Itinerary Day",
        message: "Clear all itinerary details for this day?\nThe day slot will remain.",
        confirmLabel: "Clear",
        cancelLabel: "Cancel",
        tone: "danger"
      })) {
        return;
      }
      if (!selectedDay.active) {
        const planDays = itineraryDaysForPlan(itinerary, plan.id)
          .filter(entry => entry !== selectedDay)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
        planDays.forEach((entry, entryIndex) => {
          entry.order = entryIndex + 1;
          entry.charter_day = entryIndex + 1;
          entry.day = entryIndex + 1;
        });
        setItineraryDaysForPlan(itinerary, plan.id, planDays);
        delete state.itinerarySelectedDays[itinerarySelectionKey(plan.id)];
        persistItineraryAndRedraw(itinerary, siteLibrary, charterInfo, "Inactive itinerary day deleted.");
        return;
      }
      clearItineraryDay(selectedDay);
      redrawItineraryDaysPreservingSelection(itinerary, siteLibrary, charterInfo, selectedDay);
      persistItineraryAndRedraw(itinerary, siteLibrary, charterInfo, "Itinerary day cleared.");
    });
    container.appendChild(section);
  }

  function openItineraryDayModal(itinerary, day, siteLibrary, charterInfo) {
    const draft = cloneData(day);
    draft.stops = Array.isArray(draft.stops) ? draft.stops.map(normalizeItineraryStopDraft) : [];
    delete draft.start_time;
    delete draft.end_time;
    delete draft.timing;
    delete draft.timings;
    let dirty = false;
    const headerActionsHtml = `
      <div class="button-row modal-title-actions">
        ${iconSubmitButtonHtml("save", "Save itinerary day", ` form="itinerary-day-form"`)}
        ${iconButtonHtml("cancel", "Cancel", ` id="cancel-itinerary-day"`)}
      </div>
    `;
    const dayNumber = day.charter_day || day.order;
    const longDate = itineraryDayLongDateLabel(charterInfo, day);
    const modal = openDialogModal(`Day ${dayNumber}${longDate ? ` - ${longDate}` : ""}`, `
      <form id="itinerary-day-form" class="form-grid">
        <label class="full">Primary Site
          <select id="itinerary-day-site"${Array.isArray(siteLibrary?.sites) && siteLibrary.sites.length ? " required" : ""}>${siteOptionsHtml(siteLibrary, draft.site_id || "")}</select>
        </label>
        <label class="full">Day Title
          <input id="itinerary-day-title" value="${escapeAttribute(draft.title || draft.title_override || "")}" data-autofocus>
        </label>
        <label class="full">Notes
          <textarea id="itinerary-day-notes">${escapeText(draft.notes || "")}</textarea>
        </label>
      </form>
      <div class="clone-panel">
        <div class="card-header">
          <h3>Stops</h3>
          ${iconButtonHtml("add", "Add stop", ` id="add-itinerary-stop"`)}
        </div>
        <div id="itinerary-stop-editor-list" class="editor-list"></div>
        <div id="itinerary-stop-editor-card" class="stop-editor-card hidden"></div>
      </div>
    `, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    const siteSelect = modal.querySelector("#itinerary-day-site");
    const titleInput = modal.querySelector("#itinerary-day-title");
    const notesInput = modal.querySelector("#itinerary-day-notes");
    const markDirty = () => {
      dirty = true;
      markModalDirty(modal);
    };
    [siteSelect, titleInput, notesInput].forEach(input => {
      input.addEventListener("input", markDirty);
      input.addEventListener("change", markDirty);
    });
    siteSelect.addEventListener("change", () => {
      if (!titleInput.value.trim() && siteSelect.value) {
        titleInput.value = itinerarySiteName(siteLibrary, siteSelect.value);
        dirty = true;
        markModalDirty(modal);
      }
    });
    modal.querySelector("#cancel-itinerary-day").addEventListener("click", () => {
      closeDialogModal();
    });
    const redrawStops = () => {
      dirty = true;
      markModalDirty(modal);
      drawItineraryStopEditors(modal, draft, siteLibrary, redrawStops);
    };
    drawItineraryStopEditors(modal, draft, siteLibrary, redrawStops);
    modal.querySelector("#add-itinerary-stop").addEventListener("click", () => {
      if (!Array.isArray(siteLibrary?.sites) || !siteLibrary.sites.length) {
        setStatus("Add sites in Site Editor first.", "error");
        return;
      }
      openItineraryStopEditor(modal, draft, siteLibrary, null, () => {
        dirty = true;
        drawItineraryStopEditors(modal, draft, siteLibrary, redrawStops);
      });
    });
    modal.querySelector("#itinerary-day-form").addEventListener("submit", async event => {
      event.preventDefault();
      day.site_id = siteSelect.value;
      day.title = titleInput.value;
      day.title_override = day.title;
      day.notes = notesInput.value;
      day.stops = draft.stops.map(normalizeItineraryStopDraft);
      delete day.start_time;
      delete day.end_time;
      delete day.timing;
      delete day.timings;
      await persistItineraryAndRedraw(itinerary, siteLibrary, charterInfo, "Itinerary day saved.");
      dialogCloseGuard = null;
      markModalSaved(modal);
      closeDialogModal();
    });
  }

  function normalizeItineraryStopDraft(stop) {
    return {
      ...(stop && typeof stop === "object" ? stop : {}),
      site_id: typeof stop?.site_id === "string" ? stop.site_id : "",
      notes: typeof stop?.notes === "string" ? stop.notes : (typeof stop?.note === "string" ? stop.note : ""),
      include_site_notes: stop?.include_site_notes === false ? false : true
    };
  }

  function drawItineraryStopEditors(modal, draft, siteLibrary, onChange) {
    const list = modal.querySelector("#itinerary-stop-editor-list");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    if (!draft.stops.length) {
      list.innerHTML = `<p class="muted">No stops yet.</p>`;
      return;
    }
    draft.stops.forEach((stop, index) => {
      const row = document.createElement("section");
      row.className = "record-row stop-editor-row";
      const description = itineraryStopDescription(stop);
      row.innerHTML = `
        <div class="record-summary stop-editor-summary">
          <strong>${escapeHtml(itineraryStopTitle(stop, index, siteLibrary))}</strong>
          <span class="multiline-text">${description ? escapeHtml(description) : ""}</span>
        </div>
        <div class="button-row record-actions">
          ${iconButtonHtml("edit", "Edit stop", ` data-action="edit-stop"`)}
          ${iconButtonHtml("move-up", "Move stop up", ` data-action="move-up"${index === 0 ? " disabled" : ""}`)}
          ${iconButtonHtml("move-down", "Move stop down", ` data-action="move-down"${index === draft.stops.length - 1 ? " disabled" : ""}`)}
          ${iconButtonHtml("remove", "Delete stop", ` data-action="delete-stop"`)}
        </div>
      `;
      row.querySelector("[data-action='edit-stop']").addEventListener("click", () => {
        openItineraryStopEditor(modal, draft, siteLibrary, index, onChange);
      });
      row.querySelector("[data-action='move-up']").addEventListener("click", () => {
        const previous = draft.stops[index - 1];
        draft.stops[index - 1] = draft.stops[index];
        draft.stops[index] = previous;
        onChange();
      });
      row.querySelector("[data-action='move-down']").addEventListener("click", () => {
        const next = draft.stops[index + 1];
        draft.stops[index + 1] = draft.stops[index];
        draft.stops[index] = next;
        onChange();
      });
      row.querySelector("[data-action='delete-stop']").addEventListener("click", async () => {
        if (!await showAdminConfirm({
          title: "Delete Stop",
          message: "Delete this stop?",
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          tone: "danger"
        })) {
          return;
        }
        draft.stops.splice(index, 1);
        onChange();
      });
      list.appendChild(row);
    });
  }

  function openItineraryStopEditor(modal, draft, siteLibrary, stopIndex, onSave) {
    const card = modal.querySelector("#itinerary-stop-editor-card");
    if (!card) {
      return;
    }
    const editing = Number.isInteger(stopIndex);
    const stop = editing ? normalizeItineraryStopDraft(draft.stops[stopIndex]) : { site_id: "", notes: "" };
    let stopDirty = false;
    const closeStopPanel = async (force = false) => {
      if (!force && stopDirty && !await showAdminConfirm(UNSAVED_CHANGES_CONFIRM)) {
        return;
      }
      card.classList.add("hidden");
      card.innerHTML = "";
      setParentModalActionsDisabled(modal, false);
      setNestedPanelCloseHandler(modal, null);
    };
    card.classList.remove("hidden");
    setParentModalActionsDisabled(modal, true);
    setNestedPanelCloseHandler(modal, closeStopPanel);
    card.innerHTML = `
      <div class="card-header">
        <h3>${editing ? "Edit Stop" : "Add Stop"}</h3>
        <div class="button-row modal-title-actions">
          ${iconSubmitButtonHtml("save", "Save stop", ` form="itinerary-stop-form"`)}
          ${iconButtonHtml("cancel", "Cancel", ` id="cancel-itinerary-stop"`)}
        </div>
      </div>
      ${Array.isArray(siteLibrary?.sites) && siteLibrary.sites.length ? "" : `<p class="muted">Add sites in Site Editor first.</p>`}
      <form id="itinerary-stop-form" class="form-grid">
        <label class="full">Site
          <select id="itinerary-stop-site"${Array.isArray(siteLibrary?.sites) && siteLibrary.sites.length ? " required" : ""}>${siteOptionsHtml(siteLibrary, stop.site_id || "")}</select>
        </label>
        <label class="inline-check full">
          <input id="itinerary-stop-include-site-notes" type="checkbox" ${stop.include_site_notes === false ? "" : "checked"}>
          Include site notes
        </label>
        <label class="full">Notes
          <textarea id="itinerary-stop-notes">${escapeText(stop.notes || "")}</textarea>
        </label>
      </form>
    `;
    card.querySelectorAll("input, select, textarea").forEach(input => {
      input.addEventListener("input", () => {
        stopDirty = true;
      });
      input.addEventListener("change", () => {
        stopDirty = true;
      });
    });
    card.querySelector("#cancel-itinerary-stop").addEventListener("click", () => {
      closeStopPanel();
    });
    card.querySelector("#itinerary-stop-form").addEventListener("submit", event => {
      event.preventDefault();
      const nextStop = normalizeItineraryStopDraft({
        ...stop,
        site_id: card.querySelector("#itinerary-stop-site").value,
        notes: card.querySelector("#itinerary-stop-notes").value,
        include_site_notes: card.querySelector("#itinerary-stop-include-site-notes").checked
      });
      if (editing) {
        draft.stops[stopIndex] = nextStop;
      } else {
        draft.stops.push(nextStop);
      }
      closeStopPanel(true);
      onSave();
    });
  }

  function openWelcomeMessageModal(itinerary, siteLibrary, charterInfo) {
    const activePlan = selectedItineraryPlan();
    const existingMessage = resolvedItineraryWelcomeMessage(itinerary, activePlan.id);
    const headerActionsHtml = `
      <div class="button-row modal-title-actions">
        ${iconSubmitButtonHtml("save", "Save welcome message", ` form="welcome-message-form"`)}
        ${iconButtonHtml("cancel", "Cancel", ` data-modal-close`)}
      </div>
    `;
    const modal = openDialogModal(`${activePlan.label} Welcome Message`, `
      <form id="welcome-message-form" class="form-grid">
        <label class="full">Welcome Message
          <textarea id="welcome-message-text" data-autofocus>${escapeHtml(existingMessage)}</textarea>
        </label>
      </form>
    `, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    modal.querySelector("#welcome-message-form").addEventListener("submit", async event => {
      event.preventDefault();
      itineraryPlanData(itinerary, activePlan.id).welcome_message = modal.querySelector("#welcome-message-text").value;
      const saved = await saveItinerary(itinerary, "Welcome message saved.");
      updateItineraryFromSaved(itinerary, saved);
      syncItineraryWelcomeMessage(itinerary, activePlan.id);
      drawItineraryDays(itinerary, siteLibrary, charterInfo);
      markModalSaved(modal);
      closeDialogModal();
    });
  }

  function guestFieldLabel(field) {
    const labels = {
      full_name: "Full Name",
      preferred_name: "Preferred Name",
      name: "Preferred Name",
      cabin: "Cabin",
      allergies: "Allergies",
      dietary_preferences: "Dietary Preferences",
      drinks_preferences: "Drinks Preferences",
      preferences: "Preferences",
      diving_ability: "Diving Ability",
      diving_qualification: "Diving Qualification",
      date_of_last_dive: "Date of Last Dive",
      medical_notes: "Medical Notes",
      notes: "Notes",
      principal: "Principal Guest",
      description: "Description",
      age: "Age",
      padi_level: "PADI Level",
      bcd_size: "BCD Size",
      wetsuit_size: "Wetsuit Size",
      fin_size: "Fin Size"
    };
    return labels[field] || field.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function guestDisplayName(guest, index) {
    return String(guest?.preferred_name || guest?.name || "").trim() || `Guest ${index + 1}`;
  }

  function guestAdminFieldText(value, hideNA = true) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      return "";
    }
    if (hideNA && text.toUpperCase() === "N/A") {
      return "";
    }
    return text;
  }

  function guestDivingSummaryText(guest) {
    const parts = [
      guestAdminFieldText(guest?.diving_ability),
      guestAdminFieldText(guest?.diving_qualification),
      guestAdminFieldText(guest?.date_of_last_dive),
      guestAdminFieldText(guest?.wetsuit_size)
    ];
    return parts.filter(Boolean).join(" | ");
  }

  function guestAdminSummaryLines(guest) {
    const lines = [];
    const drinksPreferences = guestAdminFieldText(guest?.drinks_preferences, false);
    const divingSummary = guestDivingSummaryText(guest);
    const medicalNotes = guestAdminFieldText(guest?.medical_notes, false);
    const notes = guestAdminFieldText(guest?.notes, false);
    if (drinksPreferences) {
      lines.push(`${guestFieldLabel("drinks_preferences")}: ${drinksPreferences}`);
    }
    if (divingSummary) {
      lines.push(`Diving: ${divingSummary}`);
    }
    if (medicalNotes) {
      lines.push(`${guestFieldLabel("medical_notes")}: ${medicalNotes}`);
    }
    if (notes) {
      lines.push(`${guestFieldLabel("notes")}: ${notes}`);
    }
    return lines;
  }

  function galleyGuestFieldText(value) {
    if (Array.isArray(value)) {
      return value.map(item => String(item || "").trim()).filter(Boolean).join(", ");
    }
    return typeof value === "string" ? value.trim() : "";
  }

  function galleyGuestDietaryRows(guestList) {
    const guests = Array.isArray(guestList?.guests) ? guestList.guests : [];
    const legacyPrincipalField = ["princi", "ple"].join("");
    const rows = guests.map(guest => {
      const source = guest && typeof guest === "object" ? guest : {};
      const preferredName = typeof source.preferred_name === "string" && source.preferred_name.trim()
        ? source.preferred_name.trim()
        : (typeof source.name === "string" ? source.name.trim() : "");
      return {
        preferred_name: preferredName,
        allergies: galleyGuestFieldText(source.allergies),
        dietary_preferences: galleyGuestFieldText(source.dietary_preferences),
        active: source.active === undefined ? true : Boolean(source.active),
        principal: Boolean(source.principal || source[legacyPrincipalField])
      };
    });
    return [
      ...rows.filter(guest => guest.active !== false),
      ...rows.filter(guest => guest.active === false)
    ];
  }

  function renderGalleyGuestsPanel(guestList) {
    const guests = galleyGuestDietaryRows(guestList);
    if (!guests.length) {
      return `
        <section class="card full">
          <div class="card-header"><h2>Guests</h2></div>
          <p class="muted">No guests found for this charter.</p>
        </section>
      `;
    }
    const displayNames = guests.map((guest, index) => guestDisplayName(guest, index));
    const nameColumnWidth = Math.max(10, ...displayNames.map(name => name.length)) + 3;
    return `
      <section class="card full galley-guests-card">
        <div class="card-header"><h2>Guests</h2></div>
        <div class="galley-guest-list" style="--galley-guest-name-column-width: ${nameColumnWidth}ch">
          <div class="galley-guest-row galley-guest-header" aria-hidden="true">
            <span>Preferred Name</span>
            <span>Allergies</span>
            <span>Preferences</span>
          </div>
          ${guests.map((guest, index) => {
            const displayName = displayNames[index];
            const allergies = guest.allergies || "No Allergies";
            const preferences = guest.dietary_preferences || "No Preferences";
            return `
              <div class="galley-guest-row${guest.active === false ? " inactive" : ""}">
                <div class="galley-guest-name">
                  <strong>${escapeHtml(displayName)}</strong>
                  ${guest.principal ? `<span class="principal-crown" title="Principal guest" aria-label="Principal guest">&#x265B;</span>` : ""}
                  ${guest.active === false ? `<span class="inactive-label">Inactive</span>` : ""}
                </div>
                <div class="galley-guest-cell galley-guest-allergies${guest.allergies ? " has-allergies" : ""}">${escapeHtml(allergies)}</div>
                <div class="galley-guest-cell">${escapeHtml(preferences)}</div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function firstNameFromFullName(value) {
    return String(value || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  }

  function clearGuestSlot(guest) {
    const cleared = {
      ...guest,
      ...blankGuest(),
      active: true,
      principal: Boolean(guest.principal)
    };
    Object.keys(cleared).forEach(key => {
      guest[key] = cleared[key];
    });
  }

  function moveGuest(guestList, index, direction) {
    const guest = guestList.guests[index];
    if (!guest || guest.principal || guest.active === false) {
      return false;
    }
    const activeIndexes = guestList.guests
      .map((entry, entryIndex) => ({ entry, entryIndex }))
      .filter(item => item.entry.active !== false);
    const activePosition = activeIndexes.findIndex(item => item.entryIndex === index);
    const nextActive = activeIndexes[activePosition + direction];
    if (!nextActive || nextActive.entry.principal) {
      return false;
    }
    const nextIndex = nextActive.entryIndex;
    const current = guestList.guests[index];
    guestList.guests[index] = guestList.guests[nextIndex];
    guestList.guests[nextIndex] = current;
    guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests);
    return true;
  }

  function promoteInactiveGuest(guestList, index) {
    const promoted = guestList.guests[index];
    if (!promoted || promoted.active !== false) {
      return { ok: false, message: "Guest is already active." };
    }
    const activeIndexes = guestList.guests
      .map((guest, guestIndex) => ({ guest, guestIndex }))
      .filter(item => item.guest.active !== false);
    const demotionIndex = findGuestDemotionTargetIndex(guestList.guests);
    if (demotionIndex < 0 || !activeIndexes.length) {
      return { ok: false, message: "There is no active guest to replace." };
    }

    demoteGuestAtIndex(guestList.guests, demotionIndex);
    promoted.active = true;
    promoted.principal = false;
    guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests);
    return { ok: true };
  }

  function guestModalSuggestions(guestList) {
    return {
      allergies: getSuggestionList("allergies", { guestList }),
      dietary_preferences: getSuggestionList("dietary_preferences", { guestList })
    };
  }

  function openGuestEditModal(guestList, guest, index, options, onSave) {
    const settings = options || {};
    const draft = normalizeGuestRecord(guest);
    const suggestions = guestModalSuggestions(guestList);
    const suggestionIds = Object.fromEntries(Object.keys(suggestions).map(key => [key, `guest-edit-${key}-suggestions`]));
    const lastDiveMode = draft.date_of_last_dive !== "N/A" ? "date" : "na";
    const headerActionsHtml = `
      <div class="button-row modal-title-actions">
        ${iconSubmitButtonHtml("save", "Save guest", ` form="guest-edit-form"`)}
        ${iconButtonHtml("cancel", "Cancel", ` data-modal-close`)}
      </div>
    `;
    const modal = openDialogModal(`Edit ${guestDisplayName(draft, index)}`, `
      <form id="guest-edit-form" class="form-grid">
        ${Object.entries(suggestions).map(([key, values]) => renderDatalist(suggestionIds[key], values)).join("")}
        <label>Full Name
          <input id="guest-edit-full-name" value="${escapeAttribute(draft.full_name || "")}" ${settings.readOnlyName ? "readonly aria-readonly=\"true\"" : "data-autofocus"}>
        </label>
        <label>Preferred Name
          <input id="guest-edit-preferred-name" value="${escapeAttribute(draft.preferred_name || "")}" ${settings.readOnlyName ? "readonly aria-readonly=\"true\"" : ""}>
        </label>
        <label class="inline-check align-end">
          <input id="guest-edit-principal" type="checkbox" ${draft.principal ? "checked" : ""} ${settings.canChangePrincipal ? "" : "disabled"}>
          Principal guest
        </label>
        <label>Cabin
          ${renderGuestSelectionSelect("guest-edit-cabin", "cabin", draft.cabin || "", settings.readOnlyName ? " data-autofocus" : "")}
        </label>
        <label>BCD Size
          ${renderGuestSelectionSelect("guest-edit-bcd-size", "bcd_size", draft.bcd_size || "")}
        </label>
        <label>Wetsuit Size
          ${renderGuestSelectionSelect("guest-edit-wetsuit-size", "wetsuit_size", draft.wetsuit_size || "")}
        </label>
        <label>Fin Size
          ${renderGuestSelectionSelect("guest-edit-fin-size", "fin_size", draft.fin_size || "")}
        </label>
        <p class="muted full"><strong>Preferences</strong></p>
        <label>Allergies
          <input id="guest-edit-allergies" value="${escapeAttribute(draft.allergies || "")}"${datalistAttribute(suggestionIds.allergies, suggestions.allergies)}>
        </label>
        <label>Dietary Preferences
          <input id="guest-edit-dietary" value="${escapeAttribute(draft.dietary_preferences || "")}"${datalistAttribute(suggestionIds.dietary_preferences, suggestions.dietary_preferences)}>
        </label>
        <label>Drinks Preferences
          <input id="guest-edit-drinks-preferences" value="${escapeAttribute(draft.drinks_preferences || "")}">
        </label>
        <p class="muted full"><strong>Diving</strong></p>
        <label>Diving Ability
          ${renderGuestSelectionSelect("guest-edit-diving-ability", "diving_ability", draft.diving_ability || "")}
        </label>
        <label>Diving Qualification
          <input id="guest-edit-diving-qualification" value="${escapeAttribute(draft.diving_qualification || "N/A")}">
        </label>
        <label>Date of Last Dive
          <select id="guest-edit-last-dive-mode">
            <option value="na"${lastDiveMode === "na" ? " selected" : ""}>N/A</option>
            <option value="date"${lastDiveMode === "date" ? " selected" : ""}>Date</option>
          </select>
        </label>
        <label id="guest-edit-last-dive-date-label">Last Dive Date
          <input id="guest-edit-last-dive-date" type="date" value="${lastDiveMode === "date" ? escapeAttribute(draft.date_of_last_dive) : ""}">
        </label>
        <label class="full">Medical Notes
          <textarea id="guest-edit-medical-notes">${escapeText(draft.medical_notes || "")}</textarea>
        </label>
        <label class="full">Notes
          <textarea id="guest-edit-notes">${escapeText(draft.notes || "")}</textarea>
        </label>
      </form>
    `, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    const fullNameInput = modal.querySelector("#guest-edit-full-name");
    const preferredNameInput = modal.querySelector("#guest-edit-preferred-name");
    let preferredNameEdited = Boolean(preferredNameInput.value.trim());
    if (!settings.readOnlyName) {
      preferredNameInput.addEventListener("input", () => {
        preferredNameEdited = true;
      });
      fullNameInput.addEventListener("input", () => {
        if (!preferredNameEdited) {
          preferredNameInput.value = firstNameFromFullName(fullNameInput.value);
        }
      });
    }
    bindGuestLegacySelection(modal.querySelector("#guest-edit-cabin"), "cabin", draft.cabin);
    bindGuestLegacySelection(modal.querySelector("#guest-edit-bcd-size"), "bcd_size", draft.bcd_size);
    bindGuestLegacySelection(modal.querySelector("#guest-edit-wetsuit-size"), "wetsuit_size", draft.wetsuit_size);
    bindGuestLegacySelection(modal.querySelector("#guest-edit-fin-size"), "fin_size", draft.fin_size);
    bindGuestLegacySelection(modal.querySelector("#guest-edit-diving-ability"), "diving_ability", draft.diving_ability);
    const lastDiveModeInput = modal.querySelector("#guest-edit-last-dive-mode");
    const lastDiveDateLabel = modal.querySelector("#guest-edit-last-dive-date-label");
    const lastDiveDateInput = modal.querySelector("#guest-edit-last-dive-date");
    const syncLastDiveFields = () => {
      const usingDate = lastDiveModeInput.value === "date";
      lastDiveDateLabel.classList.toggle("hidden", !usingDate);
      lastDiveDateInput.disabled = !usingDate;
      if (!usingDate) {
        lastDiveDateInput.value = "";
      }
    };
    lastDiveModeInput.addEventListener("change", syncLastDiveFields);
    syncLastDiveFields();
    modal.querySelector("#guest-edit-form").addEventListener("submit", event => {
      event.preventDefault();
      const nextGuest = normalizeGuestRecord({
        ...draft,
        full_name: settings.readOnlyName ? draft.full_name : fullNameInput.value,
        preferred_name: settings.readOnlyName ? draft.preferred_name : preferredNameInput.value,
        principal: settings.canChangePrincipal ? modal.querySelector("#guest-edit-principal").checked : draft.principal,
        active: draft.active !== false,
        cabin: modal.querySelector("#guest-edit-cabin").value,
        bcd_size: modal.querySelector("#guest-edit-bcd-size").value,
        wetsuit_size: modal.querySelector("#guest-edit-wetsuit-size").value,
        fin_size: modal.querySelector("#guest-edit-fin-size").value,
        diving_ability: modal.querySelector("#guest-edit-diving-ability").value,
        diving_qualification: modal.querySelector("#guest-edit-diving-qualification").value,
        date_of_last_dive: lastDiveModeInput.value === "date" && lastDiveDateInput.value ? lastDiveDateInput.value : "N/A",
        allergies: modal.querySelector("#guest-edit-allergies").value,
        dietary_preferences: modal.querySelector("#guest-edit-dietary").value,
        drinks_preferences: modal.querySelector("#guest-edit-drinks-preferences").value,
        medical_notes: modal.querySelector("#guest-edit-medical-notes").value,
        notes: modal.querySelector("#guest-edit-notes").value
      });
      onSave(nextGuest);
      markModalSaved(modal);
      closeDialogModal();
    });
  }

  async function saveGuestList(guestList, settings) {
    if (settings && settings.charterInfo) {
      const normalized = normalizeGuestListForCount(guestList, settings.charterInfo.guest_count);
      guestList.guests = normalized.guests;
    } else {
      guestList.guests = sortAndEnsurePrincipalGuests((guestList.guests || []).map(normalizeGuestRecord));
    }
    return saveCharterFile("guest_list.json", guestList, settings.saveSuccessMessage || "Guests saved.");
  }

  function drawGuestEditors(guestList, options) {
    const settings = {
      allowDelete: true,
      allowDeleteInactive: false,
      allowEdit: true,
      allowReorder: false,
      allowPromoteInactive: false,
      canChangePrincipal: false,
      readOnlyName: false,
      emptyMessage: "No guests yet.",
      ...(options || {})
    };
    const container = document.getElementById("guest-editor-list");
    if (!container) {
      return;
    }
    guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests.map(normalizeGuestRecord));
    container.innerHTML = "";
    if (!guestList.guests.length) {
      container.innerHTML += `<p class="muted">${escapeHtml(settings.emptyMessage)}</p>`;
      return;
    }
    guestList.guests.forEach((guest, index) => {
      const activeGuests = guestList.guests.filter(entry => entry.active !== false);
      const activeIndex = activeGuests.indexOf(guest);
      const canMoveUp = settings.allowReorder && guest.active !== false && !guest.principal && activeIndex > 1;
      const canMoveDown = settings.allowReorder && guest.active !== false && !guest.principal && activeIndex >= 1 && activeIndex < activeGuests.length - 1;
      const canDeleteGuest = settings.allowDelete || (settings.allowDeleteInactive && guest.active === false);
      const summaryLines = guestAdminSummaryLines(guest);
      const section = document.createElement("section");
      section.className = `record-row guest-record-row${guest.active === false ? " inactive" : ""}`;
      section.innerHTML = `
        <div class="record-summary guest-record-summary">
          <strong>${escapeHtml(guestDisplayName(guest, index))}${guest.principal ? `<span class="principal-crown" title="Principal guest" aria-label="Principal guest">&#x265B;</span>` : ""}</strong>
          ${summaryLines.map(line => `<span class="multiline-text">${escapeHtml(line)}</span>`).join("")}
          ${guest.active === false ? `<span class="inactive-label">Inactive</span>` : ""}
        </div>
        <div class="button-row record-actions">
          ${settings.allowEdit ? iconButtonHtml("edit", "Edit guest", ` data-action="edit-guest"`) : ""}
          ${settings.allowPromoteInactive && guest.active === false ? iconButtonHtml("promote", "Promote to active", ` data-action="promote-guest"`) : ""}
          ${settings.allowReorder && guest.active !== false ? iconButtonHtml("move-up", "Move guest up", ` data-action="move-up"${canMoveUp ? "" : " disabled"}`) : ""}
          ${settings.allowReorder && guest.active !== false ? iconButtonHtml("move-down", "Move guest down", ` data-action="move-down"${canMoveDown ? "" : " disabled"}`) : ""}
          ${canDeleteGuest ? iconButtonHtml("remove", guest.active === false ? "Delete inactive guest" : "Clear guest slot", ` data-action="delete-guest"`) : ""}
        </div>
      `;
      const editButton = section.querySelector("[data-action='edit-guest']");
      if (editButton) {
        editButton.addEventListener("click", () => {
          openGuestEditModal(guestList, guest, index, settings, async nextGuest => {
            if (nextGuest.principal && settings.canChangePrincipal) {
              guestList.guests.forEach(entry => {
                entry.principal = false;
              });
            }
            guestList.guests[index] = nextGuest;
            guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests);
            await saveGuestList(guestList, settings);
            drawGuestEditors(guestList, settings);
          });
        });
      }
      const promoteButton = section.querySelector("[data-action='promote-guest']");
      if (promoteButton) {
        promoteButton.addEventListener("click", async () => {
          if (!await showAdminConfirm({
            title: "Promote Guest to Active",
            message: `Move ${guestDisplayName(guest, index)} to the active guest list?`,
            confirmLabel: "Promote",
            cancelLabel: "Cancel",
            tone: "warning"
          })) {
            return;
          }
          const result = promoteInactiveGuest(guestList, index);
          if (!result.ok) {
            setStatus(result.message || "Unable to move guest to active.", "error");
            return;
          }
          await saveGuestList(guestList, settings);
          drawGuestEditors(guestList, settings);
        });
      }
      const moveUpButton = section.querySelector("[data-action='move-up']");
      if (moveUpButton) {
        moveUpButton.addEventListener("click", async () => {
          if (moveGuest(guestList, index, -1)) {
            await saveGuestList(guestList, settings);
            drawGuestEditors(guestList, settings);
          }
        });
      }
      const moveDownButton = section.querySelector("[data-action='move-down']");
      if (moveDownButton) {
        moveDownButton.addEventListener("click", async () => {
          if (moveGuest(guestList, index, 1)) {
            await saveGuestList(guestList, settings);
            drawGuestEditors(guestList, settings);
          }
        });
      }
      const deleteButton = section.querySelector("[data-action='delete-guest']");
      if (deleteButton) {
        deleteButton.addEventListener("click", async () => {
          const inactive = guest.active === false;
          if (!inactive && !settings.allowDelete) {
            setStatus("Active guests cannot be deleted from Hotel.", "error");
            return;
          }
          if (inactive && !settings.allowDelete && !settings.allowDeleteInactive) {
            setStatus("Inactive guest deletion is not allowed here.", "error");
            return;
          }
          if (!await showAdminConfirm({
            title: inactive ? "Delete Inactive Guest" : "Clear Guest Slot",
            message: inactive ? "Delete this inactive guest? This cannot be undone." : `Clear ${guestDisplayName(guest, index)}? The guest slot will remain.`,
            confirmLabel: inactive ? "Delete" : "Clear",
            cancelLabel: "Cancel",
            tone: "danger"
          })) {
            return;
          }
          if (inactive) {
            guestList.guests.splice(index, 1);
          } else {
            clearGuestSlot(guest);
          }
          guestList.guests = sortAndEnsurePrincipalGuests(guestList.guests);
          await saveGuestList(guestList, settings);
          drawGuestEditors(guestList, settings);
        });
      }
      container.appendChild(section);
    });
  }

  function drawCrewEditors(crewList) {
    const container = document.getElementById("crew-editor-list");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    if (!crewList.crew.length) {
      container.innerHTML = `<p class="muted">No crew members yet.</p>`;
      return;
    }
    const crewEntries = sortedCrewEntries(crewList);
    const canEditCrew = canManageCharterAdmin();
    const longestNameLength = crewEntries.reduce((longest, { member, index }) => {
      return Math.max(longest, String(member.name || `Crew ${index + 1}`).length);
    }, 10);
    const longestPositionLength = crewEntries.reduce((longest, { member }) => {
      return Math.max(longest, crewPositionLabel(member).length);
    }, 16);
    container.style.setProperty("--crew-name-column-width", `${longestNameLength + 1}ch`);
    container.style.setProperty("--crew-position-column-width", `${longestPositionLength + 1}ch`);
    crewEntries.forEach(({ member, index }) => {
      const row = document.createElement("section");
      row.className = "record-row crew-record-row";
      row.innerHTML = `
        <div class="record-summary crew-record-summary">
          <strong>${escapeHtml(member.name || `Crew ${index + 1}`)}</strong>
          <span class="crew-position">${escapeHtml(crewPositionLabel(member))}</span>
          <span class="crew-department">${escapeHtml(crewDepartmentLabel(member))}</span>
          ${member.description || member.note ? `<span class="multiline-text">${escapeHtml(member.description || member.note)}</span>` : ""}
        </div>
        ${canEditCrew ? `
          <div class="button-row record-actions">
            ${iconButtonHtml("edit", "Edit crew member", ` data-action="edit-crew"`)}
            ${iconButtonHtml("remove", "Delete crew member", ` data-action="delete-crew"`)}
          </div>
        ` : ""}
      `;
      const editButton = row.querySelector("[data-action='edit-crew']");
      if (editButton) {
        editButton.addEventListener("click", () => {
          openCrewMemberModal(crewList, member, async updatedMember => {
            const nextCrewList = {
              ...crewList,
              crew: crewList.crew.map((entry, entryIndex) => entryIndex === index ? updatedMember : entry)
            };
            const saved = await saveCharterFile("crew_list.json", nextCrewList, "Crew member saved.");
            if (!saved) {
              return;
            }
            crewList.crew = normalizeCrewEditorList(saved).crew;
            drawCrewEditors(crewList);
          });
        });
      }
      const deleteButton = row.querySelector("[data-action='delete-crew']");
      if (deleteButton) {
        deleteButton.addEventListener("click", async () => {
          if (!await showAdminConfirm({
            title: "Delete Crew Member",
            message: `Delete ${member.name || `Crew ${index + 1}`}?`,
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
            tone: "danger"
          })) {
            return;
          }
          try {
            const nextCrewList = {
              ...crewList,
              crew: crewList.crew.filter((entry, entryIndex) => entryIndex !== index)
            };
            const saved = await saveCharterFile("crew_list.json", nextCrewList, "Crew member deleted.");
            if (!saved) {
              return;
            }
            crewList.crew = normalizeCrewEditorList(saved).crew;
            drawCrewEditors(crewList);
          } catch (error) {
            setStatus(error.message, "error");
          }
        });
      }
      container.appendChild(row);
    });
  }

  function drawSiteEditors(siteLibrary) {
    const container = document.getElementById("site-editor-list");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    if (!siteLibrary.sites.length) {
      container.innerHTML = `<p class="muted">No sites yet.</p>`;
      return;
    }
    const sortedSites = siteLibrary.sites
      .map((site, index) => ({ site, index }))
      .sort((a, b) => siteDisplaySortKey(a.site).localeCompare(siteDisplaySortKey(b.site)));
    const longestNameLength = sortedSites.reduce((longest, { site, index }) => {
      return Math.max(longest, siteDisplayName(site, `Site ${index + 1}`).length);
    }, 12);
    container.style.setProperty("--site-name-column-width", `${longestNameLength + 1}ch`);
    sortedSites.forEach(({ site, index }) => {
      const row = document.createElement("section");
      row.className = "record-row site-record-row";
      const mediaItems = siteMediaEntries(site);
      row.innerHTML = `
        <div class="record-summary site-record-summary">
          <strong>${escapeHtml(siteDisplayName(site, `Site ${index + 1}`))}</strong>
          <span class="site-position">${escapeHtml(formatSitePosition(site))}</span>
          <span class="site-description-preview">${escapeHtml(siteDescriptionPreview(site))}</span>
        </div>
        <div class="button-row record-actions">
          ${iconButtonHtml("edit", "Edit site", ` data-action="edit-site"`)}
          ${iconButtonHtml("camera", "Preview site media", ` data-action="preview-media"${mediaItems.length ? "" : " disabled"}`)}
          ${iconButtonHtml("remove", "Delete site", ` data-action="delete-site"`)}
        </div>
      `;
      const previewButton = row.querySelector("[data-action='preview-media']");
      if (previewButton && mediaItems.length) {
        previewButton.addEventListener("click", () => openSiteMediaLightbox(mediaItems, 0));
      }
      row.querySelector("[data-action='edit-site']").addEventListener("click", () => {
        openSiteEditorModal(siteLibrary, site, async updatedSite => {
          const nextLibrary = normalizeSiteLibrary({
            ...siteLibrary,
            sites: siteLibrary.sites.map((entry, entryIndex) => entryIndex === index ? updatedSite : entry)
          });
          const saved = await saveSitesLibrary(nextLibrary, "Site saved.");
          siteLibrary.sites = saved.sites;
          drawSiteEditors(siteLibrary);
        });
      });
      row.querySelector("[data-action='delete-site']").addEventListener("click", async () => {
        if (!await showAdminConfirm({
          title: "Delete Site",
          message: `Delete ${siteDisplayName(site, `Site ${index + 1}`)}?`,
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          tone: "danger"
        })) {
          return;
        }
        try {
          const nextLibrary = normalizeSiteLibrary({
            ...siteLibrary,
            sites: siteLibrary.sites.filter((entry, entryIndex) => entryIndex !== index)
          });
          const saved = await saveSitesLibrary(nextLibrary, "Site deleted.");
          siteLibrary.sites = saved.sites;
          drawSiteEditors(siteLibrary);
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
      container.appendChild(row);
    });
  }

  function bindCharterInfoPanel(charterInfo) {
    const form = document.getElementById("charter-info-form");
    if (!form) {
      return;
    }
    let savedCharterInfo = cloneCharterInfo(charterInfo);
    const cancelButton = document.getElementById("cancel-charter-info");
    if (cancelButton) {
      cancelButton.addEventListener("click", () => {
        fillCharterInfoForm(savedCharterInfo);
        setStatus("Charter info changes cancelled.", "ok");
      });
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      charterInfo.name = document.getElementById("charter-info-name").value.trim();
      charterInfo.start_date = document.getElementById("charter-info-start-date").value;
      charterInfo.end_date = document.getElementById("charter-info-end-date").value;
      charterInfo.arrival = {
        date: document.getElementById("charter-info-arrival-date").value,
        time: document.getElementById("charter-info-arrival-time").value,
        flight: document.getElementById("charter-info-arrival-flight").value.trim()
      };
      charterInfo.primary_contact = {
        name: document.getElementById("charter-info-primary-contact-name").value.trim(),
        phones: normalizeCharterPhoneList(document.getElementById("charter-info-primary-contact-phones").value)
      };
      charterInfo.charter_style = document.getElementById("charter-info-charter-style").value.trim() || "flexible";
      charterInfo.non_swimmers_present = document.getElementById("charter-info-non-swimmers-present").checked;
      charterInfo.diving_planned = document.getElementById("charter-info-diving-planned").checked;
      charterInfo.diving_guest_count = normalizeNonNegativeInteger(document.getElementById("charter-info-diving-guest-count").value);
      charterInfo.medical_notes_present = document.getElementById("charter-info-medical-notes-present").checked;
      charterInfo.dietary_restrictions_present = document.getElementById("charter-info-dietary-restrictions-present").checked;
      charterInfo.charter_preference_notes = document.getElementById("charter-info-charter-preference-notes").value;
      charterInfo.drink_preferences_notes = document.getElementById("charter-info-drink-preferences-notes").value;
      charterInfo.notes = document.getElementById("charter-info-notes").value;
      charterInfo.guest_count = normalizeGuestCount(document.getElementById("charter-info-guest-count").value);
      const saved = await saveCharterFile("charter.json", charterInfo, "Charter info saved.");
      if (saved) {
        const normalizedSaved = normalizeCharterInfo(saved);
        Object.assign(charterInfo, normalizedSaved);
        const summary = currentCharterSummary();
        if (summary) {
          summary.name = normalizedSaved.name || summary.id;
          summary.charter = cloneCharterInfo(normalizedSaved);
        }
        savedCharterInfo = cloneCharterInfo(normalizedSaved);
        syncTopbar();
        renderCharter();
      }
    });
  }

  function cloneCharterInfo(charterInfo) {
    return JSON.parse(JSON.stringify(charterInfo || {}));
  }

  function fillCharterInfoForm(charterInfo) {
    const info = charterInfo || {};
    const name = document.getElementById("charter-info-name");
    const guestCount = document.getElementById("charter-info-guest-count");
    const startDate = document.getElementById("charter-info-start-date");
    const endDate = document.getElementById("charter-info-end-date");
    const arrivalDate = document.getElementById("charter-info-arrival-date");
    const arrivalTime = document.getElementById("charter-info-arrival-time");
    const arrivalFlight = document.getElementById("charter-info-arrival-flight");
    const primaryContactName = document.getElementById("charter-info-primary-contact-name");
    const primaryContactPhones = document.getElementById("charter-info-primary-contact-phones");
    const charterStyle = document.getElementById("charter-info-charter-style");
    const nonSwimmersPresent = document.getElementById("charter-info-non-swimmers-present");
    const divingPlanned = document.getElementById("charter-info-diving-planned");
    const divingGuestCount = document.getElementById("charter-info-diving-guest-count");
    const medicalNotesPresent = document.getElementById("charter-info-medical-notes-present");
    const dietaryRestrictionsPresent = document.getElementById("charter-info-dietary-restrictions-present");
    const charterPreferenceNotes = document.getElementById("charter-info-charter-preference-notes");
    const drinkPreferencesNotes = document.getElementById("charter-info-drink-preferences-notes");
    const notes = document.getElementById("charter-info-notes");
    if (name) {
      name.value = info.name || "";
    }
    if (guestCount) {
      guestCount.value = normalizeGuestCount(info.guest_count);
    }
    if (startDate) {
      startDate.value = info.start_date || "";
    }
    if (endDate) {
      endDate.value = info.end_date || "";
    }
    if (arrivalDate) {
      arrivalDate.value = info.arrival && info.arrival.date ? info.arrival.date : "";
    }
    if (arrivalTime) {
      arrivalTime.value = info.arrival && info.arrival.time ? info.arrival.time : "";
    }
    if (arrivalFlight) {
      arrivalFlight.value = info.arrival && info.arrival.flight ? info.arrival.flight : "";
    }
    if (primaryContactName) {
      primaryContactName.value = info.primary_contact && info.primary_contact.name ? info.primary_contact.name : "";
    }
    if (primaryContactPhones) {
      primaryContactPhones.value = charterPhoneListText(info.primary_contact && info.primary_contact.phones ? info.primary_contact.phones : []);
    }
    if (charterStyle) {
      charterStyle.value = info.charter_style || "flexible";
    }
    if (nonSwimmersPresent) {
      nonSwimmersPresent.checked = Boolean(info.non_swimmers_present);
    }
    if (divingPlanned) {
      divingPlanned.checked = Boolean(info.diving_planned);
    }
    if (divingGuestCount) {
      divingGuestCount.value = normalizeNonNegativeInteger(info.diving_guest_count);
    }
    if (medicalNotesPresent) {
      medicalNotesPresent.checked = Boolean(info.medical_notes_present);
    }
    if (dietaryRestrictionsPresent) {
      dietaryRestrictionsPresent.checked = Boolean(info.dietary_restrictions_present);
    }
    if (charterPreferenceNotes) {
      charterPreferenceNotes.value = info.charter_preference_notes || "";
    }
    if (drinkPreferencesNotes) {
      drinkPreferencesNotes.value = info.drink_preferences_notes || "";
    }
    if (notes) {
      notes.value = info.notes || "";
    }
  }

  function syncItineraryPlanSelector() {
    const activePlan = selectedItineraryPlan();
    const itineraryPanel = document.getElementById("itinerary-panel-card");
    if (itineraryPanel) {
      itineraryPanel.setAttribute("data-itinerary-active-plan", activePlan.id);
    }
    document.querySelectorAll("[data-itinerary-plan]").forEach(button => {
      const selected = button.getAttribute("data-itinerary-plan") === activePlan.id;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    const importPrimaryButton = document.getElementById("import-primary-itinerary");
    if (importPrimaryButton) {
      const showImportPrimary = activePlan.id === "alternative";
      importPrimaryButton.hidden = !showImportPrimary;
      importPrimaryButton.classList.toggle("hidden", !showImportPrimary);
    }
  }

  function bindItinerarySwitchControls(itinerary, siteLibrary, charterInfo) {
    document.querySelectorAll("[data-itinerary-switch-plan]").forEach(button => {
      button.addEventListener("click", () => {
        switchGuestItineraryFromToday(itinerary, charterInfo, siteLibrary, button.getAttribute("data-itinerary-switch-plan"));
      });
    });
  }

  function syncItinerarySwitchControls(itinerary, siteLibrary, charterInfo) {
    const controls = document.getElementById("itinerary-switch-controls");
    if (!controls) {
      return;
    }
    controls.outerHTML = renderItinerarySwitchControls(itinerary, charterInfo);
    bindItinerarySwitchControls(itinerary, siteLibrary, charterInfo);
  }

  function bindItineraryPlanSelector(itinerary, siteLibrary, charterInfo) {
    document.querySelectorAll("[data-itinerary-plan]").forEach(button => {
      button.addEventListener("click", () => {
        const nextPlan = itineraryPlanById(button.getAttribute("data-itinerary-plan"));
        if (nextPlan.id === state.selectedItineraryPlan) {
          return;
        }
        state.selectedItineraryPlan = nextPlan.id;
        syncItineraryPlanSelector();
        syncItineraryWelcomeMessage(itinerary, nextPlan.id);
        drawItineraryDays(itinerary, siteLibrary, charterInfo);
      });
    });
  }

  function bindItineraryPanel(charterInfo, itinerary, siteLibrary) {
    const importPrimaryButton = document.getElementById("import-primary-itinerary");
    if (importPrimaryButton) {
      importPrimaryButton.addEventListener("click", () => {
        importPrimaryItineraryIntoAlternative(itinerary, siteLibrary, charterInfo);
      });
    }
    const previewButton = document.getElementById("preview-itinerary");
    if (previewButton) {
      previewButton.addEventListener("click", () => {
        const plan = selectedItineraryPlan();
        renderPreviewLightbox(`${plan.label} Preview`, renderItineraryPreview(itinerary, charterInfo, siteLibrary, plan.id), {
          department: "charter",
          printable: true,
          printButtonLabel: "Print itinerary",
          showPrintFitOption: false,
          extraStyles: itineraryPreviewStyles()
        });
      });
    }
    const editSummary = document.getElementById("edit-itinerary-summary");
    if (editSummary) {
      editSummary.addEventListener("click", () => {
        openWelcomeMessageModal(itinerary, siteLibrary, charterInfo);
      });
    }
    updateItineraryFromSaved(itinerary, normalizeItineraryForCharter(charterInfo, itinerary));
    syncItineraryPlanSelector();
    syncItineraryWelcomeMessage(itinerary, selectedItineraryPlan().id);
    bindItineraryPlanSelector(itinerary, siteLibrary, charterInfo);
    bindItinerarySwitchControls(itinerary, siteLibrary, charterInfo);
    drawItineraryDays(itinerary, siteLibrary, charterInfo);
  }

  function bindGuestsPanel(guestList, options) {
    const settings = {
      allowDelete: true,
      allowDeleteInactive: false,
      allowEdit: true,
      allowReorder: false,
      allowPromoteInactive: false,
      canChangePrincipal: false,
      readOnlyName: false,
      emptyMessage: "No guests yet.",
      ...(options || {})
    };
    if (settings.charterInfo) {
      const normalized = normalizeGuestListForCount(guestList, settings.charterInfo.guest_count);
      guestList.guests = normalized.guests;
    } else {
      guestList.guests = sortAndEnsurePrincipalGuests((guestList.guests || []).map(normalizeGuestRecord));
    }
    drawGuestEditors(guestList, settings);
  }

  function bindCrewPanel(crewList) {
    const addButton = document.getElementById("add-crew-member");
    const importButton = document.getElementById("import-crew-list");
    if (addButton) {
      addButton.addEventListener("click", () => {
        openCrewMemberModal(crewList, async member => {
          const nextCrewList = {
            ...crewList,
            crew: [...crewList.crew, member]
          };
          const saved = await saveCharterFile("crew_list.json", nextCrewList, "Crew member added.");
          if (!saved) {
            return;
          }
          crewList.crew = normalizeCrewEditorList(saved).crew;
          drawCrewEditors(crewList);
        });
      });
    }
    if (importButton) {
      importButton.addEventListener("click", () => openCrewImportModal(crewList));
    }
    drawCrewEditors(crewList);
  }

  function bindSitesPanel(siteLibrary) {
    const addButton = document.getElementById("add-site-editor");
    if (!addButton) {
      return;
    }
    addButton.addEventListener("click", () => {
      openSiteEditorModal(siteLibrary, null, async site => {
        const nextLibrary = normalizeSiteLibrary({
          ...siteLibrary,
          sites: [...siteLibrary.sites, site]
        });
        const saved = await saveSitesLibrary(nextLibrary, "Site created.");
        siteLibrary.sites = saved.sites;
        drawSiteEditors(siteLibrary);
      });
    });
    drawSiteEditors(siteLibrary);
  }

  function charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary, plannedRoute) {
    if (activePanel === "info") {
      return renderCharterInfoPanel(charterInfo);
    }
    if (activePanel === "itinerary") {
      return renderItineraryPanel(itinerary, charterInfo);
    }
    if (activePanel === "crew") {
      return renderCrewPanel();
    }
    if (activePanel === "route-upload") {
      return renderRouteUploadPanel(plannedRoute, itinerary, charterInfo);
    }
    if (activePanel === "sites") {
      return renderSitesPanel();
    }
    return placeholderCard("Charter");
  }

  function bindCharterPanel(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary) {
    if (activePanel === "info") {
      bindCharterInfoPanel(charterInfo);
      return;
    }
    if (activePanel === "itinerary") {
      bindItineraryPanel(charterInfo, itinerary, siteLibrary);
      return;
    }
    if (activePanel === "crew") {
      bindCrewPanel(crewList);
      return;
    }
    if (activePanel === "route-upload") {
      const form = document.getElementById("route-upload-form");
      const fileInput = document.getElementById("route-file");
      form.addEventListener("submit", uploadRoute);
      document.getElementById("route-upload-cancel")?.addEventListener("click", () => {
        form.reset();
        if (fileInput) {
          fileInput.focus();
        }
      });
      return;
    }
    if (activePanel === "sites") {
      bindSitesPanel(siteLibrary);
    }
  }

  async function renderCharter() {
    const panels = [
      { id: "info", label: "Charter Info" },
      { id: "itinerary", label: "Itinerary" },
      { id: "crew", label: "Crew" },
      { id: "route-upload", label: "Route Upload" },
      { id: "sites", label: "Site Editor" }
    ];
    const activePanel = panels.some(panel => panel.id === state.sectionPanels.charter) ? state.sectionPanels.charter : "info";
    state.sectionPanels.charter = activePanel;
    els.workspace.innerHTML = sectionShell("charter", panels, activePanel, `<section class="card"><p class="muted">Loading charter data...</p></section>`, sectionToolbarHtml("charter"));
    bindSectionNav("charter", renderCharter);
    bindSectionToolbar("charter", renderCharter);
    const selectedCharter = syncSelectedCharter();
    if (!selectedCharter) {
      els.workspace.innerHTML = sectionShell("charter", panels, activePanel, `
        <section class="card full">
          <div class="card-header"><h2>No Charters</h2></div>
          <p class="muted">Use the plus button in the Charter toolbar to create your first charter.</p>
        </section>
      `, sectionToolbarHtml("charter"));
      bindSectionNav("charter", renderCharter);
      bindSectionToolbar("charter", renderCharter);
      return;
    }
    try {
      const [bundle, siteLibrary] = await Promise.all([
        loadCharter(selectedCharter),
        loadSites()
      ]);
      const charterInfo = normalizeCharterInfo(bundle["charter.json"]);
      const itinerary = normalizeItineraryForCharter(charterInfo, bundle["itinerary.json"]);
      const guestList = normalizeGuestList(bundle["guest_list.json"]);
      const crewList = normalizeCrewEditorList(bundle["crew_list.json"]);
      const plannedRoute = bundle["planned-route.json"] || {};
      const content = charterPanelContent(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary, plannedRoute);
      els.workspace.innerHTML = sectionShell("charter", panels, activePanel, content, sectionToolbarHtml("charter"));
      bindSectionNav("charter", renderCharter);
      bindSectionToolbar("charter", renderCharter);
      bindCharterPanel(activePanel, charterInfo, itinerary, guestList, crewList, siteLibrary);
    } catch (error) {
      setStatus(error.message, "error");
      els.workspace.innerHTML = sectionShell("charter", panels, activePanel, `
        <section class="card full">
          <div class="card-header"><h2>Charter</h2></div>
          <p class="muted">${escapeHtml(error.message)}</p>
        </section>
      `, sectionToolbarHtml("charter"));
      bindSectionNav("charter", renderCharter);
      bindSectionToolbar("charter", renderCharter);
    }
  }

  async function uploadRoute(event) {
    event.preventDefault();
    if (!canManageCharterAdmin()) {
      setStatus("Only Charter Admin on Bridge can upload route files.", "error");
      return;
    }
    const charterId = syncSelectedCharter();
    const file = document.getElementById("route-file").files[0];
    const selectedRoutePlan = document.querySelector('input[name="route-plan"]:checked')?.value || "primary";
    const routePlan = itineraryPlanById(selectedRoutePlan).id;
    const routeLabel = routePlanLabel(routePlan);
    if (!file || !await showAdminConfirm({
      title: `Overwrite ${routeLabel}`,
      message: `Replace this charter's ${routeLabel}? The other route plan will not be changed.`,
      confirmLabel: "Replace",
      cancelLabel: "Cancel",
      tone: "warning"
    })) {
      return;
    }
    try {
      await api(`/api/admin/charter/${encodeURIComponent(charterId)}/upload-route?plan=${encodeURIComponent(routePlan)}`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/vnd.google-earth.kml+xml",
          "X-Filename": file.name,
          "X-Route-Plan": routePlan
        },
        body: file
      });
      setStatus(`${routeLabel} uploaded and converted to planned-route.json.`, "ok");
      await renderCharter();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function renderGalley() {
    const activePanel = GALLEY_PANELS.some(panel => panel.id === state.sectionPanels.galley)
      ? state.sectionPanels.galley
      : "menus";
    state.sectionPanels.galley = activePanel;
    els.workspace.innerHTML = sectionShell("galley", GALLEY_PANELS, activePanel, `<section class="card"><p class="muted">Loading galley data...</p></section>`, sectionToolbarHtml("galley"));
    try {
      const bundle = await loadCharter(state.selectedCharter);
      const menus = normalizeMenus(bundle["menus.json"]);
      const guestList = bundle["guest_list.json"] || {};
      const charterInfo = normalizeCharterInfo(bundle["charter.json"]);
      const itinerary = normalizeItineraryForCharter(charterInfo, bundle["itinerary.json"]);
      const activeItineraryDayCount = Array.isArray(itinerary.days)
        ? itinerary.days.filter(day => day && day.active !== false).length
        : 0;

      let content = "";
      if (activePanel === "guests") {
        content = renderGalleyGuestsPanel(guestList);
      } else {
        const syncResult = syncMenusToItineraryDays(menus, activeItineraryDayCount);
        if (syncResult.changed) {
          const savedMenus = await saveCharterFile("menus.json", menus, "Menus synced to itinerary days.");
          if (savedMenus) {
            menus.menus = normalizeMenus(savedMenus).menus;
          }
        }
        content = activeItineraryDayCount === 0 && !menus.menus.length
          ? `<section class="card full"><h2>Menus</h2><p class="muted">Charter Itinerary has not been generated</p></section>`
          : `
            <section class="card full">
              <div class="card-header">
                <h2>Menus</h2>
                ${iconButtonHtml("import", "Import menu from another charter", ` id="import-menu"`)}
              </div>
              ${activeItineraryDayCount === 0 ? `<p class="muted">Charter Itinerary has not been generated. Populated menu rows are inactive until itinerary days are available.</p>` : ""}
              <div id="menu-days" class="editor-list"></div>
            </section>
          `;
      }

      els.workspace.innerHTML = sectionShell("galley", galleyPanelsForGuestList(guestList), activePanel, content, sectionToolbarHtml("galley"));
      bindSectionNav("galley", renderGalley);
      bindSectionToolbar("galley", renderGalley);
      if (activePanel === "menus" && document.getElementById("menu-days")) {
        const importButton = document.getElementById("import-menu");
        if (importButton) {
          importButton.addEventListener("click", () => openMenuImportModal(menus, activeItineraryDayCount));
        }
        drawMenuRows(menus, activeItineraryDayCount, itinerary, charterInfo);
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  const MENU_LOCKED_SECTION_KEYS = Object.freeze(["breakfast", "lunch", "dinner"]);
  const MENU_MEAL_KEYS = Object.freeze([...MENU_LOCKED_SECTION_KEYS, "snacks"]);

  function normalizeMenus(value) {
    const source = value && typeof value === "object" ? cloneData(value) : {};
    const legacyDay = MENU_MEAL_KEYS.some(key => Array.isArray(source[key])) || typeof source.todays_notes === "string";
    const menuDays = Array.isArray(source.menus)
      ? source.menus
      : (legacyDay ? [source] : []);
    return {
      ...source,
      menus: menuDays.map((day, index) => normalizeMenuDay(day, index + 1))
    };
  }

  function blankMenuDay(dayNumber) {
    return {
      order: dayNumber,
      day: dayNumber,
      charter_day: dayNumber,
      active: true,
      label: `Day ${dayNumber}`,
      todays_notes: "",
      breakfast: [],
      lunch: [],
      dinner: [],
      snacks: []
    };
  }

  function normalizeMenuDay(value, fallbackDayNumber) {
    const source = value && typeof value === "object" ? { ...value } : {};
    const numericDay = Number(source.charter_day || source.day || source.order || fallbackDayNumber);
    const dayNumber = Number.isFinite(numericDay) && numericDay > 0 ? Math.round(numericDay) : fallbackDayNumber;
    const normalized = {
      ...blankMenuDay(dayNumber),
      ...source,
      order: dayNumber,
      day: dayNumber,
      charter_day: dayNumber,
      active: source.active === undefined ? true : Boolean(source.active),
      label: typeof source.label === "string" && source.label.trim() ? source.label : `Day ${dayNumber}`,
      todays_notes: typeof source.todays_notes === "string" ? source.todays_notes : ""
    };
    MENU_MEAL_KEYS.forEach(key => {
      normalized[key] = Array.isArray(source[key]) ? source[key] : [];
    });
    return normalized;
  }

  function menuValueHasMeaning(value) {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === "string") {
      return Boolean(value.trim());
    }
    if (typeof value === "number") {
      return Number.isFinite(value);
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.some(item => menuValueHasMeaning(item));
    }
    if (typeof value === "object") {
      return Object.entries(value).some(([key, entry]) => {
        if (["id", "order", "day", "charter_day", "active", "label", "date", "date_label"].includes(key)) {
          return false;
        }
        return menuValueHasMeaning(entry);
      });
    }
    return false;
  }

  function menuDayIsEmpty(day) {
    const hasDirectData = [
      ...MENU_MEAL_KEYS,
      "notes",
      "todays_notes",
      "items"
    ].some(key => menuValueHasMeaning(day && day[key]));
    const hasChildData = menuDayPreviewSections(day).some(section => menuValueHasMeaning(section.items));
    return !(hasDirectData || hasChildData);
  }

  function clearMenuDayData(day) {
    MENU_MEAL_KEYS.forEach(key => {
      day[key] = [];
    });
    day.notes = "";
    day.todays_notes = "";
    if (Object.prototype.hasOwnProperty.call(day, "children")) {
      day.children = [];
    }
    if (Object.prototype.hasOwnProperty.call(day, "items")) {
      day.items = [];
    }
  }

  function activeMenuDays(menus) {
    return menus.menus.filter(day => day.active !== false);
  }

  function inactiveMenuDays(menus) {
    return menus.menus.filter(day => day.active === false);
  }

  function syncMenusToItineraryDays(menus, itineraryDayCount) {
    const before = JSON.stringify(menus.menus || []);
    let activeDays = activeMenuDays(menus).map((day, index) => normalizeMenuDay(day, index + 1));
    const inactiveDays = inactiveMenuDays(menus).map((day, index) => normalizeMenuDay(day, itineraryDayCount + index + 1));

    while (activeDays.length < itineraryDayCount) {
      activeDays.push(blankMenuDay(activeDays.length + 1));
    }
    if (activeDays.length > itineraryDayCount) {
      const excessDays = activeDays.slice(itineraryDayCount);
      activeDays = activeDays.slice(0, itineraryDayCount);
      excessDays.forEach(day => {
        if (!menuDayIsEmpty(day)) {
          day.active = false;
          inactiveDays.push(day);
        }
      });
    }

    activeDays.forEach((day, index) => {
      day.order = index + 1;
      day.day = index + 1;
      day.charter_day = index + 1;
      day.active = true;
      if (!String(day.label || "").trim()) {
        day.label = `Day ${index + 1}`;
      }
    });
    inactiveDays.forEach((day, index) => {
      day.active = false;
      if (!Number.isFinite(Number(day.order))) {
        day.order = itineraryDayCount + index + 1;
      }
    });
    menus.menus = [...activeDays, ...inactiveDays];
    return { changed: before !== JSON.stringify(menus.menus) };
  }

  function menuSectionSummary(day) {
    const sections = menuDayPreviewSections(day);
    if (!sections.length) {
      return "No visible sections";
    }
    return sections.map(section => `${section.title}: ${menuValueHasMeaning(section.items) ? "Set" : "Empty"}`).join(" | ");
  }

  function menuSectionSummaryHtml(day) {
    const sections = menuDayPreviewSections(day);
    if (!sections.length) {
      return "No visible sections";
    }
    return sections.map(section => {
      const stateHtml = menuValueHasMeaning(section.items)
        ? "Set"
        : `<span class="menu-empty-text">Empty</span>`;
      return `${escapeHtml(section.title)}: ${stateHtml}`;
    }).join(" | ");
  }

  function menuDayTitle(day, fallbackIndex) {
    return String(day.label || day.title || "").trim() || `Day ${day.charter_day || fallbackIndex + 1}`;
  }

  function menuItineraryDayForMenuDay(itinerary, menuDay, fallbackIndex) {
    const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
    const menuDayNumber = Number(menuDay?.charter_day || menuDay?.day || menuDay?.order || fallbackIndex + 1);
    return days.find(day => Number(day?.charter_day || day?.day || day?.order) === menuDayNumber) || days[fallbackIndex] || null;
  }

  function menuDayShortDateLabel(charterInfo, menuDay, fallbackIndex) {
    const startMatch = String(charterInfo?.start_date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!startMatch) {
      return "";
    }
    const dayNumber = Number(menuDay?.charter_day || menuDay?.day || menuDay?.order || fallbackIndex + 1);
    if (!Number.isFinite(dayNumber) || dayNumber < 1) {
      return "";
    }
    const date = new Date(Date.UTC(
      Number(startMatch[1]),
      Number(startMatch[2]) - 1,
      Number(startMatch[3]) + Math.round(dayNumber) - 1
    ));
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC"
    }).format(date);
  }

  function titleFromIdentifier(value) {
    return String(value || "")
      .trim()
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function menuTitleFromItineraryDay(day) {
    const title = String(day?.title || day?.title_override || day?.site_title || day?.site_name || day?.site_label || "").trim();
    if (title) {
      return title;
    }
    return titleFromIdentifier(day?.site_id || "");
  }

  function menuDayModalTitleValue(day, itineraryDay, fallbackIndex) {
    const dayNumber = day?.charter_day || fallbackIndex + 1;
    const savedTitle = String(day?.label || day?.title || "").trim();
    const defaultTitle = `Day ${dayNumber}`;
    const itineraryTitle = menuTitleFromItineraryDay(itineraryDay);
    if (!savedTitle || (savedTitle === defaultTitle && itineraryTitle)) {
      return itineraryTitle || defaultTitle;
    }
    return savedTitle;
  }

  function menuDayNotesValue(day) {
    return String(day?.todays_notes || day?.notes || "").trim();
  }

  function normalizeMenuSectionName(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function menuLockedSectionKey(value) {
    const key = normalizeMenuSectionName(value).replace(/\s+/g, "_");
    return MENU_LOCKED_SECTION_KEYS.includes(key) ? key : "";
  }

  function menuLockedSectionKeyFromChild(child) {
    if (!child || typeof child !== "object") {
      return "";
    }
    return menuLockedSectionKey(child.type || child.key || child.id || child.name || child.title || child.label);
  }

  function normalizeMenuFoodItems(items) {
    return (Array.isArray(items) ? items : [])
      .map(item => {
        if (typeof item === "string") {
          return {
            name: item,
            description: ""
          };
        }
        if (!item || typeof item !== "object") {
          return null;
        }
        return {
          ...item,
          name: typeof item.name === "string" ? item.name : (typeof item.title === "string" ? item.title : ""),
          description: typeof item.description === "string" ? item.description : ""
        };
      })
      .filter(Boolean);
  }

  function customMenuSectionId(title) {
    return `custom-${slugify(title || "section")}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  function normalizeMenuSectionOrder(sections) {
    const ordered = (Array.isArray(sections) ? sections : []).filter(Boolean);
    const lockedIndexes = [];
    const lockedByKey = new Map();
    ordered.forEach((section, index) => {
      if (section.locked && MENU_LOCKED_SECTION_KEYS.includes(section.key) && !lockedByKey.has(section.key)) {
        lockedIndexes.push(index);
        lockedByKey.set(section.key, section);
      }
    });
    const lockedInMealOrder = MENU_LOCKED_SECTION_KEYS
      .map(key => lockedByKey.get(key))
      .filter(Boolean);
    lockedIndexes.sort((a, b) => a - b).forEach((index, slotIndex) => {
      ordered[index] = lockedInMealOrder[slotIndex];
    });
    return ordered;
  }

  function normalizeMenuDaySections(day) {
    const source = day && typeof day === "object" ? day : {};
    const children = Array.isArray(source.children) ? source.children : [];
    const lockedChildren = new Map();
    const orderedSections = [];
    const customSections = [];
    const visibleNames = new Set(MENU_LOCKED_SECTION_KEYS.map(key => normalizeMenuSectionName(mealLabel(key))));

    children.forEach((child, index) => {
      if (!child || typeof child !== "object") {
        return;
      }
      const lockedKey = menuLockedSectionKeyFromChild(child);
      if (lockedKey) {
        if (!lockedChildren.has(lockedKey)) {
          lockedChildren.set(lockedKey, child);
        }
        orderedSections.push({ lockedKey });
        return;
      }
      if (child.hidden === true || child.visible === false) {
        return;
      }
      const title = String(child.title || child.label || child.name || `Section ${index + 1}`).trim();
      const nameKey = normalizeMenuSectionName(title);
      if (!title || visibleNames.has(nameKey)) {
        return;
      }
      visibleNames.add(nameKey);
      customSections.push({
        id: child.id || customMenuSectionId(title),
        key: child.key || "",
        title,
        locked: false,
        hidden: false,
        items: normalizeMenuFoodItems(child.items)
      });
      orderedSections.push(customSections[customSections.length - 1]);
    });

    const lockedSections = new Map(MENU_LOCKED_SECTION_KEYS.map(key => {
      const child = lockedChildren.get(key);
      const childHidden = child && (child.hidden === true || child.visible === false);
      const childItems = child && Array.isArray(child.items) ? normalizeMenuFoodItems(child.items) : null;
      const legacyItems = normalizeMenuFoodItems(source[key]);
      return [key, {
        id: key,
        key,
        title: mealLabel(key),
        locked: true,
        hidden: child ? childHidden : false,
        items: childItems && (childItems.length || childHidden || !legacyItems.length) ? childItems : legacyItems
      }];
    }));

    const snacksItems = normalizeMenuFoodItems(source.snacks);
    if (snacksItems.length && !visibleNames.has("snacks")) {
      customSections.push({
        id: "legacy-snacks",
        key: "snacks",
        title: "Snacks",
        locked: false,
        hidden: false,
        items: snacksItems
      });
      orderedSections.push(customSections[customSections.length - 1]);
    }

    if (!children.length) {
      return normalizeMenuSectionOrder([
        ...MENU_LOCKED_SECTION_KEYS.map(key => lockedSections.get(key)),
        ...customSections
      ]);
    }
    const addedLocked = new Set();
    const sectionsInSourceOrder = [];
    orderedSections.forEach(entry => {
      if (entry && entry.lockedKey) {
        if (addedLocked.has(entry.lockedKey)) {
          return;
        }
        addedLocked.add(entry.lockedKey);
        sectionsInSourceOrder.push(lockedSections.get(entry.lockedKey));
        return;
      }
      if (entry) {
        sectionsInSourceOrder.push(entry);
      }
    });
    MENU_LOCKED_SECTION_KEYS.forEach(key => {
      if (!addedLocked.has(key)) {
        sectionsInSourceOrder.push(lockedSections.get(key));
      }
    });
    return normalizeMenuSectionOrder(sectionsInSourceOrder);
  }

  function visibleMenuSections(sections) {
    return (Array.isArray(sections) ? sections : []).filter(section => section && section.hidden !== true);
  }

  function menuDayPreviewSections(day) {
    return visibleMenuSections(normalizeMenuDaySections(day)).map(section => ({
      title: section.title,
      items: normalizeMenuFoodItems(section.items)
    }));
  }

  function applyMenuSectionsToDay(day, sections) {
    const visibleSections = visibleMenuSections(sections);
    MENU_LOCKED_SECTION_KEYS.forEach(key => {
      const section = sections.find(candidate => candidate.locked && candidate.key === key) || {
        key,
        title: mealLabel(key),
        hidden: true,
        items: []
      };
      const items = normalizeMenuFoodItems(section.items);
      day[key] = section.hidden ? [] : items;
    });
    const snacksSection = visibleSections.find(section => !section.locked && normalizeMenuSectionName(section.title) === "snacks");
    day.snacks = snacksSection ? normalizeMenuFoodItems(snacksSection.items) : [];
    day.children = normalizeMenuSectionOrder(sections).map((section, index) => {
      if (section.locked) {
        return {
          id: section.key,
          type: section.key,
          title: mealLabel(section.key),
          locked: true,
          hidden: section.hidden === true,
          items: normalizeMenuFoodItems(section.items)
        };
      }
      return {
        id: section.id || customMenuSectionId(section.title),
        type: "custom",
        title: section.title,
        order: index + 1,
        items: normalizeMenuFoodItems(section.items)
      };
    });
  }

  function customMenuSectionNameSuggestions(menus) {
    const names = [];
    (Array.isArray(menus?.menus) ? menus.menus : []).forEach(day => {
      normalizeMenuDaySections(day).forEach(section => {
        if (!section.locked) {
          names.push(section.title);
        }
      });
    });
    return uniqueSortedValues(names);
  }

  function menuSectionNameExists(sections, name, ignoredSection = null) {
    const key = normalizeMenuSectionName(name);
    if (MENU_LOCKED_SECTION_KEYS.some(lockedKey => normalizeMenuSectionName(mealLabel(lockedKey)) === key)) {
      return true;
    }
    return visibleMenuSections(sections).some(section => section !== ignoredSection && normalizeMenuSectionName(section.title) === key);
  }

  function menuCloneSourceSummary(day) {
    const sections = menuDayPreviewSections(day);
    if (!sections.length) {
      return "No visible sections";
    }
    return sections.map(section => {
      const itemCount = normalizeMenuFoodItems(section.items).length;
      return `${section.title}: ${itemCount} ${itemCount === 1 ? "item" : "items"}`;
    }).join(" | ");
  }

  function menuCloneSourceEntries(menus, currentIndex) {
    return (Array.isArray(menus?.menus) ? menus.menus : [])
      .map((day, index) => ({ day, index }))
      .filter(({ day, index }) => {
        if (index === currentIndex) {
          return false;
        }
        return day.active !== false || !menuDayIsEmpty(day);
      });
  }

  function openMenuDayModal(menus, menuIndex, itinerary, itineraryDayCount) {
    const original = menus.menus[menuIndex];
    if (!original) {
      return;
    }
    const draft = cloneData(original);
    let sectionDrafts = normalizeMenuDaySections(draft);
    const itineraryDay = menuItineraryDayForMenuDay(itinerary, draft, menuIndex);
    const dayNumber = draft.charter_day || draft.day || draft.order || menuIndex + 1;
    const headerActionsHtml = `
      <div class="button-row modal-title-actions">
        ${iconSubmitButtonHtml("save", "Save menu day", ` form="menu-day-form"`)}
        ${iconButtonHtml("cancel", "Cancel", ` id="cancel-menu-day"`)}
        ${iconButtonHtml("clone", "Clone menu day", ` id="clone-menu-day"`)}
      </div>
    `;
    const modal = openDialogModal(`Edit Day ${dayNumber} Menu`, `
      <form id="menu-day-form" class="form-grid menu-day-form">
        <label class="charter-day-field">Day
          <input id="menu-day-number" class="charter-day-input" value="${escapeAttribute(dayNumber)}" readonly aria-readonly="true">
        </label>
        <label>Title
          <input id="menu-day-title" value="${escapeAttribute(menuDayModalTitleValue(draft, itineraryDay, menuIndex))}" data-autofocus>
        </label>
        <label class="full">Notes
          <textarea id="menu-day-notes">${escapeText(menuDayNotesValue(draft))}</textarea>
        </label>
      </form>
      <div class="menu-day-modal-sections">
        <div class="card-header">
          <h3>Menu Sections</h3>
          ${iconButtonHtml("add", "Add menu section", ` id="add-menu-section"`)}
        </div>
        <div id="menu-day-section-list" class="editor-list"></div>
      </div>
    `, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    const redrawSections = (markDirty = false) => {
      if (markDirty) {
        markModalDirty(modal);
      }
      drawMenuDaySectionEditors(modal, sectionDrafts, menus, () => {
        redrawSections(true);
      });
    };
    redrawSections();
    modal.querySelector("#clone-menu-day").addEventListener("click", () => {
      openMenuDayCloneEditor(modal, menus, menuIndex, dayNumber, sourceDay => {
        const sourceCopy = cloneData(sourceDay);
        sectionDrafts = normalizeMenuDaySections(sourceCopy);
        modal.querySelector("#menu-day-notes").value = menuDayNotesValue(sourceCopy);
        redrawSections(true);
        setStatus("Menu day cloned locally. Press Save to persist.", "ok");
      });
    });
    modal.querySelector("#add-menu-section").addEventListener("click", () => {
      openMenuSectionEditor(modal, sectionDrafts, null, menus, () => {
        redrawSections();
      });
    });
    modal.querySelector("#cancel-menu-day").addEventListener("click", () => {
      closeDialogModal();
    });
    modal.querySelector("#menu-day-form").addEventListener("submit", async event => {
      event.preventDefault();
      original.label = modal.querySelector("#menu-day-title").value.trim();
      if (Object.prototype.hasOwnProperty.call(original, "title")) {
        original.title = original.label;
      }
      original.todays_notes = modal.querySelector("#menu-day-notes").value;
      if (Object.prototype.hasOwnProperty.call(original, "notes")) {
        original.notes = original.todays_notes;
      }
      applyMenuSectionsToDay(original, sectionDrafts);
      syncMenusToItineraryDays(menus, itineraryDayCount);
      const saved = await saveMenusAndRender(menus, "Menu day saved.");
      if (saved) {
        markModalSaved(modal);
        closeDialogModal();
      }
    });
  }

  function openMenuDayCloneEditor(modal, menus, currentIndex, destinationDayNumber, onClone) {
    const sources = menuCloneSourceEntries(menus, currentIndex);
    const cloneModal = openStackedDialogModal("Clone Day", `
      <form id="menu-clone-day-form" class="menu-clone-source-list">
        ${sources.length ? sources.map(({ day, index }, sourceIndex) => `
          <label class="menu-clone-source-row${day.active === false ? " inactive" : ""}">
            <input type="radio" name="menu-clone-source" value="${escapeAttribute(index)}"${sourceIndex === 0 ? " checked" : ""}>
            <span class="menu-clone-source-main">
              <strong>Day ${escapeHtml(day.charter_day || index + 1)} - ${escapeHtml(menuDayTitle(day, index))}</strong>
              <span>${escapeHtml(menuCloneSourceSummary(day))}</span>
            </span>
            ${day.active === false ? `<span class="inactive-label">Inactive</span>` : ""}
          </label>
        `).join("") : `<p class="muted">No other menu days are available to clone.</p>`}
      </form>
    `, {
      cardClass: "modal-wide",
      headerActionsHtml: `
        <div class="button-row modal-title-actions">
          ${iconSubmitButtonHtml("clone", "Clone selected menu day", ` form="menu-clone-day-form"${sources.length ? "" : " disabled"}`)}
          ${iconButtonHtml("cancel", "Cancel", ` data-stacked-modal-close`)}
        </div>
      `
    });
    cloneModal.querySelector("#menu-clone-day-form").addEventListener("submit", async event => {
      event.preventDefault();
      const selectedIndex = Number(cloneModal.querySelector("input[name='menu-clone-source']:checked")?.value);
      const sourceDay = Number.isInteger(selectedIndex) ? menus.menus[selectedIndex] : null;
      if (!sourceDay) {
        setStatus("Choose a menu day to clone.", "error");
        return;
      }
      if (!await showAdminConfirm({
        title: "Clone Menu Day",
        message: `Clone this menu into Day ${destinationDayNumber}? This will replace the current menu contents for this day.`,
        confirmLabel: "Clone",
        cancelLabel: "Cancel",
        tone: "warning"
      })) {
        return;
      }
      const sourceCopy = cloneData(sourceDay);
      markModalSaved(cloneModal);
      closeStackedDialogModal(cloneModal);
      onClone(sourceCopy);
    });
  }

  function drawMenuDaySectionEditors(modal, sections, menus, onChange) {
    const list = modal.querySelector("#menu-day-section-list");
    if (!list) {
      return;
    }
    list.innerHTML = "";
    const visibleSections = visibleMenuSections(sections);
    if (!visibleSections.length) {
      list.innerHTML = `<p class="muted">No visible menu sections yet.</p>`;
      return;
    }
    visibleSections.forEach(section => {
      const row = document.createElement("section");
      row.className = `clone-panel menu-day-modal-section${section.locked ? " locked" : " custom"}`;
      const visibleIndex = visibleSections.indexOf(section);
      row.innerHTML = `
        <div class="card-header">
          <h3>${escapeHtml(section.title)}</h3>
          <div class="button-row record-actions">
            ${iconButtonHtml("add", `Add item to ${section.title}`, ` data-action="add-item"`)}
            ${section.locked ? "" : iconButtonHtml("edit", "Edit section", ` data-action="edit-section"`)}
            ${section.locked ? "" : iconButtonHtml("move-up", "Move section up", ` data-action="move-up"${visibleIndex <= 0 ? " disabled" : ""}`)}
            ${section.locked ? "" : iconButtonHtml("move-down", "Move section down", ` data-action="move-down"${visibleIndex >= visibleSections.length - 1 ? " disabled" : ""}`)}
            ${iconButtonHtml("remove", section.locked ? "Hide section" : "Delete section", ` data-action="delete-section"`)}
          </div>
        </div>
        <div class="menu-day-modal-items"></div>
      `;
      row.querySelector("[data-action='add-item']").addEventListener("click", () => {
        openMenuFoodItemEditor(modal, section, null, onChange);
      });
      const editSectionButton = row.querySelector("[data-action='edit-section']");
      if (editSectionButton) {
        editSectionButton.addEventListener("click", () => {
          openMenuSectionEditor(modal, sections, section, menus, onChange);
        });
      }
      const moveUpButton = row.querySelector("[data-action='move-up']");
      if (moveUpButton) {
        moveUpButton.addEventListener("click", () => {
          moveCustomMenuSection(sections, section, -1);
          onChange();
        });
      }
      const moveDownButton = row.querySelector("[data-action='move-down']");
      if (moveDownButton) {
        moveDownButton.addEventListener("click", () => {
          moveCustomMenuSection(sections, section, 1);
          onChange();
        });
      }
      row.querySelector("[data-action='delete-section']").addEventListener("click", async () => {
        const confirmed = await showAdminConfirm({
          title: section.locked ? "Hide Menu Section" : "Delete Menu Section",
          message: section.locked
            ? `Hide and clear ${section.title}? It can be restored with Add Section.`
            : `Delete ${section.title}?`,
          confirmLabel: section.locked ? "Hide" : "Delete",
          cancelLabel: "Cancel",
          tone: "danger"
        });
        if (!confirmed) {
          return;
        }
        if (section.locked) {
          section.hidden = true;
          section.items = [];
        } else {
          const index = sections.indexOf(section);
          if (index >= 0) {
            sections.splice(index, 1);
          }
        }
        onChange();
      });
      drawMenuFoodItems(row.querySelector(".menu-day-modal-items"), section, onChange, modal);
      list.appendChild(row);
    });
  }

  function drawMenuFoodItems(container, section, onChange, modal) {
    if (!container) {
      return;
    }
    container.innerHTML = "";
    if (!section.items.length) {
      container.innerHTML = `<p class="muted">No items yet.</p>`;
      return;
    }
    section.items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "menu-day-modal-item";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(item.name || item.title || "Item")}</strong>
          ${item.description ? `<span class="multiline-text">${escapeHtml(item.description)}</span>` : ""}
        </div>
        <div class="button-row record-actions">
          ${iconButtonHtml("edit", "Edit food item", ` data-action="edit-item"`)}
          ${iconButtonHtml("move-up", "Move food item up", ` data-action="move-up"${index === 0 ? " disabled" : ""}`)}
          ${iconButtonHtml("move-down", "Move food item down", ` data-action="move-down"${index === section.items.length - 1 ? " disabled" : ""}`)}
          ${iconButtonHtml("remove", "Delete food item", ` data-action="delete-item"`)}
        </div>
      `;
      row.querySelector("[data-action='edit-item']").addEventListener("click", () => {
        openMenuFoodItemEditor(modal, section, index, onChange);
      });
      row.querySelector("[data-action='move-up']").addEventListener("click", () => {
        if (moveListItem(section.items, index, -1)) {
          onChange();
        }
      });
      row.querySelector("[data-action='move-down']").addEventListener("click", () => {
        if (moveListItem(section.items, index, 1)) {
          onChange();
        }
      });
      row.querySelector("[data-action='delete-item']").addEventListener("click", async () => {
        if (!await showAdminConfirm({
          title: "Delete Food Item",
          message: "Delete this food item?",
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          tone: "danger"
        })) {
          return;
        }
        section.items.splice(index, 1);
        onChange();
      });
      container.appendChild(row);
    });
  }

  function moveCustomMenuSection(sections, section, direction) {
    if (!section || section.locked) {
      return false;
    }
    const visibleSections = visibleMenuSections(sections);
    const visibleIndex = visibleSections.indexOf(section);
    const swapWith = visibleSections[visibleIndex + direction];
    if (!swapWith) {
      return false;
    }
    const index = sections.indexOf(section);
    const swapIndex = sections.indexOf(swapWith);
    sections[index] = swapWith;
    sections[swapIndex] = section;
    return true;
  }

  function closeMenuNestedPanel(modal) {
    const card = modal.querySelector("#menu-day-nested-card");
    if (!card) {
      return;
    }
    card.classList.add("hidden");
    card.innerHTML = "";
    setParentModalActionsDisabled(modal, false);
    setNestedPanelCloseHandler(modal, null);
  }

  function openMenuSectionEditor(modal, sections, section, menus, onSave) {
    const editing = Boolean(section && !section.locked);
    const suggestions = customMenuSectionNameSuggestions(menus);
    const visibleLocked = new Set(visibleMenuSections(sections).filter(candidate => candidate.locked).map(candidate => candidate.key));
    const lockedOptions = MENU_LOCKED_SECTION_KEYS.map(key => {
      const lockedSection = sections.find(candidate => candidate.locked && candidate.key === key);
      const disabled = visibleLocked.has(key);
      return `
        <label class="inline-check">
          <input type="radio" name="menu-section-type" value="${key}"${disabled ? " disabled" : ""}>
          ${escapeHtml(mealLabel(key))}${lockedSection && lockedSection.hidden ? " (restore)" : ""}
        </label>
      `;
    }).join("");
    const sectionModal = openStackedDialogModal(editing ? "Edit Section" : "Add Section", `
      ${renderDatalist("menu-section-name-suggestions", suggestions)}
      <form id="menu-section-form" class="form-grid">
        ${editing ? "" : `<fieldset class="menu-section-options full">
          <legend>Section Type</legend>
          ${lockedOptions}
          <label class="inline-check">
            <input type="radio" name="menu-section-type" value="other" checked>
            Other
          </label>
        </fieldset>`}
        <label id="menu-section-name-label" class="full">Section Name
          <input id="menu-section-name" value="${escapeAttribute(editing ? section.title : "")}"${datalistAttribute("menu-section-name-suggestions", suggestions)}>
        </label>
      </form>
    `, {
      cardClass: "modal-wide",
      headerActionsHtml: `
        <div class="button-row modal-title-actions">
          ${iconSubmitButtonHtml("save", "Save menu section", ` form="menu-section-form"`)}
          ${iconButtonHtml("cancel", "Cancel", ` data-stacked-modal-close`)}
        </div>
      `
    });
    const typeInputs = Array.from(sectionModal.querySelectorAll("input[name='menu-section-type']"));
    const nameLabel = sectionModal.querySelector("#menu-section-name-label");
    const nameInput = sectionModal.querySelector("#menu-section-name");
    const syncNameVisibility = () => {
      const selected = typeInputs.find(input => input.checked)?.value || "other";
      const isOther = editing || selected === "other";
      nameLabel.classList.toggle("hidden", !isOther);
      nameInput.required = isOther;
      if (isOther) {
        window.setTimeout(() => {
          nameInput.focus();
          nameInput.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 0);
      }
    };
    typeInputs.forEach(input => input.addEventListener("change", syncNameVisibility));
    syncNameVisibility();
    sectionModal.querySelector("#menu-section-form").addEventListener("submit", event => {
      event.preventDefault();
      if (editing) {
        const nextName = nameInput.value.trim();
        if (!nextName) {
          setStatus("Section name is required.", "error");
          return;
        }
        if (menuSectionNameExists(sections, nextName, section)) {
          setStatus("A section with that name already exists.", "error");
          return;
        }
        section.title = nextName;
      } else {
        const selected = typeInputs.find(input => input.checked && !input.disabled)?.value || "other";
        if (selected === "other") {
          const nextName = nameInput.value.trim();
          if (!nextName) {
            setStatus("Section name is required.", "error");
            return;
          }
          if (menuSectionNameExists(sections, nextName)) {
            setStatus("A section with that name already exists.", "error");
            return;
          }
          sections.push({
            id: customMenuSectionId(nextName),
            key: "",
            title: nextName,
            locked: false,
            hidden: false,
            items: []
          });
        } else {
          const lockedSection = sections.find(candidate => candidate.locked && candidate.key === selected);
          if (lockedSection) {
            lockedSection.hidden = false;
          }
        }
      }
      markModalSaved(sectionModal);
      closeStackedDialogModal(sectionModal);
      onSave();
    });
  }

  function openMenuFoodItemEditor(modal, section, itemIndex, onSave) {
    const editing = Number.isInteger(itemIndex);
    const item = editing ? normalizeMenuFoodItems([section.items[itemIndex]])[0] : { name: "", description: "" };
    const itemModal = openStackedDialogModal(editing ? "Edit Food Item" : "Add Food Item", `
      <form id="menu-food-item-form" class="form-grid">
        <label>Name
          <input id="menu-food-item-name" value="${escapeAttribute(item.name || "")}" required data-autofocus>
        </label>
        <label class="full">Description
          <textarea id="menu-food-item-description">${escapeText(item.description || "")}</textarea>
        </label>
      </form>
    `, {
      cardClass: "modal-wide",
      headerActionsHtml: `
        <div class="button-row modal-title-actions">
          ${iconSubmitButtonHtml("save", "Save food item", ` form="menu-food-item-form"`)}
          ${iconButtonHtml("cancel", "Cancel", ` data-stacked-modal-close`)}
        </div>
      `
    });
    itemModal.querySelector("#menu-food-item-form").addEventListener("submit", event => {
      event.preventDefault();
      const nextItem = {
        ...item,
        name: itemModal.querySelector("#menu-food-item-name").value.trim(),
        description: itemModal.querySelector("#menu-food-item-description").value
      };
      if (!nextItem.name) {
        setStatus("Food item name is required.", "error");
        return;
      }
      if (editing) {
        section.items[itemIndex] = nextItem;
      } else {
        section.items.push(nextItem);
      }
      markModalSaved(itemModal);
      closeStackedDialogModal(itemModal);
      onSave();
    });
  }

  function importedMenusForItinerary(sourceMenus, itineraryDayCount) {
    const nextMenus = normalizeMenus(sourceMenus);
    syncMenusToItineraryDays(nextMenus, itineraryDayCount);
    return nextMenus;
  }

  function openMenuImportModal(menus, itineraryDayCount) {
    const currentCharterId = state.selectedCharter;
    const sourceCharters = (Array.isArray(state.charters) ? state.charters : [])
      .filter(charter => charter.id && charter.id !== currentCharterId);
    const sourceRows = sourceCharters.length
      ? sourceCharters.map((charter, index) => `
          <label class="crew-import-option">
            <input type="radio" name="menu-import-source" value="${escapeAttribute(charter.id)}"${index === 0 ? " checked" : ""}>
            <span>
              <strong>${escapeHtml(charterDisplayLabel(charter))}</strong>
              <small>${escapeHtml(charter.id)}</small>
            </span>
          </label>
        `).join("")
      : `<p class="muted">No other charters are available to import from.</p>`;
    const headerActionsHtml = `
      <div class="button-row modal-title-actions">
        ${iconSubmitButtonHtml("confirm", "Import menu", ` form="menu-import-form"${sourceCharters.length ? "" : " disabled"}`)}
        ${iconButtonHtml("cancel", "Cancel", ` data-modal-close`)}
      </div>
    `;
    const modal = openDialogModal("Import Menu", `
      <form id="menu-import-form" class="crew-import-panel">
        <p class="muted">Choose another charter to copy its full menu into this charter.</p>
        <p class="menu-import-warning">Importing this menu will overwrite the current charter menu data.</p>
        <div class="crew-import-list">
          ${sourceRows}
        </div>
        <p id="menu-import-error" class="modal-error" role="alert"></p>
      </form>
    `, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    const importButton = modal.querySelector("button[form='menu-import-form']");
    const errorField = modal.querySelector("#menu-import-error");
    if (!importButton) {
      return;
    }
    modal.querySelector("#menu-import-form").addEventListener("submit", async event => {
      event.preventDefault();
      const selected = modal.querySelector("input[name='menu-import-source']:checked");
      if (!selected) {
        errorField.textContent = "Choose a charter to import from.";
        return;
      }
      const sourceCharter = sourceCharters.find(charter => charter.id === selected.value);
      if (!await showAdminConfirm({
        title: "Import Menu",
        message: "Importing this menu will overwrite the current charter menu data.",
        confirmLabel: "Import",
        cancelLabel: "Cancel",
        tone: "warning"
      })) {
        return;
      }
      importButton.disabled = true;
      errorField.textContent = "";
      try {
        const bundle = await api(`/api/admin/charter/${encodeURIComponent(selected.value)}`);
        const nextMenus = importedMenusForItinerary(bundle["menus.json"], itineraryDayCount);
        const saved = await saveMenusAndRender(
          nextMenus,
          `Imported menu from ${sourceCharter ? charterDisplayLabel(sourceCharter) : selected.value}.`
        );
        if (!saved) {
          importButton.disabled = false;
          return;
        }
        Object.assign(menus, normalizeMenus(saved));
        markModalSaved(modal);
        closeDialogModal();
      } catch (error) {
        errorField.textContent = error.message;
        setStatus(error.message, "error");
        importButton.disabled = false;
      }
    });
  }

  function drawMenuRows(menus, itineraryDayCount, itinerary, charterInfo) {
    const container = document.getElementById("menu-days");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    const rows = menus.menus.map((day, index) => ({ day, index }));
    if (!rows.length) {
      container.innerHTML = `<p class="muted">No menu days are available yet.</p>`;
      return;
    }
    const longestTitleLength = Math.max(
      ...rows.map(({ day, index }) => menuDayTitle(day, index).length),
      10
    );
    container.style.setProperty("--menu-title-column-width", `${longestTitleLength + 1}ch`);
    const activeRows = rows.filter(({ day }) => day.active !== false);
    rows.forEach(({ day, index }) => {
      const section = document.createElement("section");
      section.className = `itinerary-row-block menu-row-block${day.active === false ? " inactive" : ""}`;
      const activeIndex = activeRows.findIndex(row => row.day === day);
      const dateLabel = menuDayShortDateLabel(charterInfo, day, index);
      section.innerHTML = `
        <div class="record-row menu-row${day.active === false ? " inactive" : ""}">
          <div class="record-summary menu-record-summary">
            <strong class="itinerary-day-label menu-day-number-label">
              <span>Day ${escapeHtml(day.charter_day || index + 1)}</span>
              ${dateLabel ? `<small>${escapeHtml(dateLabel)}</small>` : ""}
            </strong>
            <span class="menu-day-title">${escapeHtml(menuDayTitle(day, index))}</span>
            <span class="menu-day-summary">${menuSectionSummaryHtml(day)}</span>
            ${day.active === false ? `<span class="inactive-label">Inactive</span>` : ""}
          </div>
          <div class="button-row record-actions">
            ${iconButtonHtml("edit", "Edit menu day", ` data-action="edit-menu"`)}
            ${iconButtonHtml("preview", "Preview menu", ` data-action="preview-day"`)}
            ${day.active === false && itineraryDayCount > 0 ? iconButtonHtml("promote", "Move menu to active", ` data-action="promote-menu"`) : ""}
            ${day.active !== false ? iconButtonHtml("move-up", "Move menu day up", ` data-action="move-up"${activeIndex <= 0 ? " disabled" : ""}`) : ""}
            ${day.active !== false ? iconButtonHtml("move-down", "Move menu day down", ` data-action="move-down"${activeIndex < 0 || activeIndex >= activeRows.length - 1 ? " disabled" : ""}`) : ""}
            ${iconButtonHtml("remove", day.active === false ? "Delete inactive menu" : "Clear menu day", ` data-action="clear-menu"`)}
          </div>
        </div>
        ${menuDayNotesValue(day) ? `<div class="itinerary-day-notes-preview multiline-text">${escapeHtml(menuDayNotesValue(day))}</div>` : ""}
      `;
      section.querySelector("[data-action='edit-menu']").addEventListener("click", () => {
        openMenuDayModal(menus, index, itinerary, itineraryDayCount);
      });
      section.querySelector("[data-action='preview-day']").addEventListener("click", () => {
        renderPreviewLightbox(`${day.label || `Day ${day.charter_day || index + 1}`} Preview`, renderMenuDayPreview(day), { department: "galley", printable: true });
      });
      const promoteButton = section.querySelector("[data-action='promote-menu']");
      if (promoteButton) {
        promoteButton.addEventListener("click", async () => {
          promoteInactiveMenuDay(menus, index, itineraryDayCount);
          await saveMenusAndRender(menus, "Inactive menu moved to active.");
        });
      }
      const moveUpButton = section.querySelector("[data-action='move-up']");
      if (moveUpButton) {
        moveUpButton.addEventListener("click", async () => {
          if (moveActiveMenuDay(menus, index, -1, itineraryDayCount)) {
            await saveMenusAndRender(menus, "Menu day moved.");
          }
        });
      }
      const moveDownButton = section.querySelector("[data-action='move-down']");
      if (moveDownButton) {
        moveDownButton.addEventListener("click", async () => {
          if (moveActiveMenuDay(menus, index, 1, itineraryDayCount)) {
            await saveMenusAndRender(menus, "Menu day moved.");
          }
        });
      }
      section.querySelector("[data-action='clear-menu']").addEventListener("click", async () => {
        const inactive = day.active === false;
        if (!await showAdminConfirm({
          title: inactive ? "Delete Inactive Menu" : "Clear Menu Day",
          message: inactive
            ? "Delete this inactive menu row? This cannot be undone."
            : "Clear all menu food data for this day?\nThe day slot will remain.",
          confirmLabel: inactive ? "Delete" : "Clear",
          cancelLabel: "Cancel",
          tone: "danger"
        })) {
          return;
        }
        if (inactive) {
          menus.menus = menus.menus.filter((entry, entryIndex) => entryIndex !== index);
          await saveMenusAndRender(menus, "Inactive menu deleted.");
          return;
        }
        clearMenuDayData(day);
        syncMenusToItineraryDays(menus, itineraryDayCount);
        await saveMenusAndRender(menus, "Menu day cleared.");
      });
      container.appendChild(section);
    });
  }

  function moveActiveMenuDay(menus, menuIndex, direction, itineraryDayCount) {
    const menuDay = menus.menus[menuIndex];
    if (!menuDay || menuDay.active === false) {
      return false;
    }
    const activeIndexes = menus.menus
      .map((day, index) => day.active !== false ? index : -1)
      .filter(index => index >= 0);
    const activeIndex = activeIndexes.indexOf(menuIndex);
    const swapIndex = activeIndexes[activeIndex + direction];
    if (!Number.isInteger(swapIndex)) {
      return false;
    }
    const current = menus.menus[menuIndex];
    menus.menus[menuIndex] = menus.menus[swapIndex];
    menus.menus[swapIndex] = current;
    syncMenusToItineraryDays(menus, itineraryDayCount);
    return true;
  }

  function promoteInactiveMenuDay(menus, menuIndex, itineraryDayCount) {
    const promoted = menus.menus[menuIndex];
    if (!promoted || promoted.active !== false) {
      return false;
    }
    const activeDays = activeMenuDays(menus);
    const inactiveDays = inactiveMenuDays(menus).filter(day => day !== promoted);
    const emptyActiveIndex = activeDays.findIndex(menuDayIsEmpty);
    promoted.active = true;

    if (emptyActiveIndex >= 0) {
      const slot = activeDays[emptyActiveIndex];
      promoted.order = slot.order;
      promoted.day = slot.day;
      promoted.charter_day = slot.charter_day;
      if (!String(promoted.label || "").trim()) {
        promoted.label = slot.label || `Day ${slot.charter_day || emptyActiveIndex + 1}`;
      }
      activeDays[emptyActiveIndex] = promoted;
    } else {
      const demoted = activeDays.pop();
      if (demoted && !menuDayIsEmpty(demoted)) {
        demoted.active = false;
        inactiveDays.push(demoted);
      }
      activeDays.push(promoted);
    }

    menus.menus = [...activeDays, ...inactiveDays];
    syncMenusToItineraryDays(menus, itineraryDayCount);
    return true;
  }

  async function saveMenusAndRender(menus, successMessage) {
    const saved = await saveCharterFile("menus.json", menus, successMessage);
    if (saved) {
      state.bundle = state.bundle || {};
      state.bundle["menus.json"] = cloneData(saved);
      renderGalley();
    }
    return saved;
  }

  function buttonIconSvg(kind) {
    if (kind === "add") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"></path>
        </svg>
      `;
    }
    if (kind === "import") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <g transform="translate(12 12) scale(1.6) translate(-12 -12)">
            <path d="M9 5h9v14H9M9 5v4M9 15v4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="M4 12h10M10 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
          </g>
        </svg>
      `;
    }
    if (kind === "promote") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 19V5M7 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M5 20h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path>
        </svg>
      `;
    }
    if (kind === "clone") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="8" y="7" width="10" height="12" rx="1.8" fill="none" stroke="currentColor" stroke-width="2.1"></rect>
          <path d="M6 15H5.8A1.8 1.8 0 0 1 4 13.2V5.8A1.8 1.8 0 0 1 5.8 4h7.4A1.8 1.8 0 0 1 15 5.8V6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M13 10v6M10 13h6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"></path>
        </svg>
      `;
    }
    if (kind === "move-up") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 14l5-5 5 5M7 20l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    if (kind === "move-down") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 4l5 5 5-5M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    if (kind === "prev" || kind === "next") {
      const path = kind === "prev" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6";
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="${path}" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    if (kind === "edit") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 19l4.8-1 8.7-8.7a2.1 2.1 0 0 0-3-3L6.8 15 5 19zM14.8 7.2l3 3" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    if (kind === "save") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 4h12l2 2v14H5V4zM8 4v6h8V4M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    if (kind === "refresh") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18.5 8.5A7 7 0 0 0 6.1 6.9L4.5 8.5M4.5 4.5v4h4" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M5.5 15.5a7 7 0 0 0 12.4 1.6l1.6-1.6M19.5 19.5v-4h-4" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    if (kind === "retry-primary") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 7H5V4" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M5.5 7.5A7 7 0 1 1 5 16" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M12 8v4l2.8 1.6" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    if (kind === "restart-route") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 7H4V4" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M4.7 7.2a7 7 0 1 1 .7 9.2" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M8 15.5c1.4-2.7 3.2-3.4 5.2-2.1s3.1.8 4.8-2.4" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle cx="8" cy="15.5" r="1.2" fill="currentColor"></circle>
          <circle cx="18" cy="11" r="1.2" fill="currentColor"></circle>
        </svg>
      `;
    }
    if (kind === "camera") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M14.5 4l1.4 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.1l1.4-2h5z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle cx="12" cy="12.5" r="3.2" fill="none" stroke="currentColor" stroke-width="2.1"></circle>
        </svg>
      `;
    }
    if (kind === "print") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 9V4h10v5M7 16H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M7 13h10v7H7v-7z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle cx="17.5" cy="11.5" r="0.9" fill="currentColor"></circle>
        </svg>
      `;
    }
    if (kind === "notes") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 4h7l4 4v12H7V4z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M14 4v4h4M10 11h5M10 14.5h5M10 18h3.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    if (kind === "invoice") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 4h8l4 4v12H7V4z" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M15 4v4h4M10 11h6M10 15h4.5" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M9.6 18.2c.5.4 1.1.6 1.8.6 1.2 0 2-.6 2-1.5 0-.8-.5-1.2-1.6-1.5l-.7-.2c-.9-.2-1.4-.6-1.4-1.3 0-.8.7-1.4 1.8-1.4.7 0 1.2.1 1.7.5M11.3 12.4v6.7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    if (kind === "preview") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle cx="12" cy="12" r="3.1" fill="none" stroke="currentColor" stroke-width="2.2"></circle>
        </svg>
      `;
    }
    if (kind === "purchase") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="3.5" y="7" width="17" height="10" rx="2.2" fill="none" stroke="currentColor" stroke-width="2.1"></rect>
          <circle cx="12" cy="12" r="2.1" fill="none" stroke="currentColor" stroke-width="2.1"></circle>
          <path d="M7 10.4v3.2M17 10.4v3.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"></path>
        </svg>
      `;
    }
    if (kind === "reverse") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 7H4V3" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M4.8 7.1A8 8 0 1 1 7 18.7" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
          <path d="M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    if (kind === "cancel") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path>
        </svg>
      `;
    }
    if (kind === "confirm") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      `;
    }
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M9 4h6l1 2h4v2H4V6h4l1-2zM7 9h10l-.8 10.5a2 2 0 0 1-2 1.5H9.8a2 2 0 0 1-2-1.5L7 9zm3 2v7m4-7v7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `;
  }

  function iconButtonHtml(kind, label, extraAttributes) {
    return `<button type="button" class="${iconButtonClassNames(kind)}" title="${escapeAttribute(label)}" aria-label="${escapeAttribute(label)}"${extraAttributes || ""}>${buttonIconSvg(kind)}</button>`;
  }

  function iconSubmitButtonHtml(kind, label, extraAttributes) {
    return `<button type="submit" class="${iconButtonClassNames(kind)}" title="${escapeAttribute(label)}" aria-label="${escapeAttribute(label)}"${extraAttributes || ""}>${buttonIconSvg(kind)}</button>`;
  }

  function iconButtonTone(kind) {
    if (kind === "preview") {
      return "preview";
    }
    if (kind === "purchase" || kind === "confirm" || kind === "save") {
      return "success";
    }
    if (kind === "add" || kind === "import" || kind === "edit" || kind === "promote" || kind === "clone" || kind === "move-up" || kind === "move-down" || kind === "prev" || kind === "next" || kind === "camera" || kind === "refresh" || kind === "retry-primary" || kind === "restart-route" || kind === "notes" || kind === "invoice" || kind === "reverse") {
      return "secondary";
    }
    return "danger";
  }

  function iconButtonClassNames(kind) {
    const tone = iconButtonTone(kind);
    const legacyToneClass = tone === "preview" ? "preview-button" : tone;
    return ["admin-icon-button", "icon-button", `admin-icon-button--${tone}`, legacyToneClass].join(" ");
  }

  function modalActionButtonsHtml(options) {
    const settings = options || {};
    const includeCancel = settings.includeCancel !== false;
    return `
      <div class="button-row full align-right">
        ${iconSubmitButtonHtml(settings.submitKind || "save", settings.submitLabel || "Save", settings.submitAttributes || "")}
        ${includeCancel ? iconButtonHtml(settings.cancelKind || "cancel", settings.cancelLabel || "Cancel", settings.cancelAttributes || " data-modal-close") : ""}
      </div>
    `;
  }

  function orderingButtonsHtml(label, index, total) {
    return `
      ${iconButtonHtml("move-up", `Move ${label} up`, ` data-action="move-up"${index === 0 ? " disabled" : ""}`)}
      ${iconButtonHtml("move-down", `Move ${label} down`, ` data-action="move-down"${index === total - 1 ? " disabled" : ""}`)}
    `;
  }

  function moveListItem(items, index, direction) {
    const nextIndex = index + direction;
    if (!Array.isArray(items) || nextIndex < 0 || nextIndex >= items.length) {
      return false;
    }
    const current = items[index];
    items[index] = items[nextIndex];
    items[nextIndex] = current;
    return true;
  }

  function mealLabel(meal) {
    return meal.charAt(0).toUpperCase() + meal.slice(1);
  }

  function todayInputDate() {
    const date = new Date();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  const DRINK_STOCK_TYPE_ALIASES = Object.freeze({
    rose: "rosie",
    "rose-wine": "rosie",
    sparkling: "sparkling-wine",
    tonic: "tonic-water"
  });

  function normalizeDrinkStockType(value) {
    const normalized = slugify(
      String(value || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/_/g, " ")
    );
    return DRINK_STOCK_TYPE_ALIASES[normalized] || normalized;
  }

  function drinkCategoryKey(value) {
    return slugify(
      String(value || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/_/g, " ")
    );
  }

  function normalizeDrinkCategory(category, stockType = "") {
    const categoryKey = drinkCategoryKey(category);
    const stockTypeKey = normalizeDrinkStockType(stockType);
    const keys = [categoryKey, stockTypeKey].filter(Boolean);
    if (keys.some(key => ["champagne", "sparkling", "sparkling-wine", "prosecco", "cava"].includes(key))) {
      return "Champagne";
    }
    if (keys.some(key => ["wine", "red-wine", "white-wine", "rose", "rosie", "dessert-wine"].includes(key))) {
      return "Wine";
    }
    if (keys.some(key => [
      "beer",
      "beers",
      "lager",
      "ale",
      "ipa",
      "stout",
      "porter",
      "pilsner",
      "draft-beer",
      "bottle-beer"
    ].includes(key))) {
      return "Beers";
    }
    if (keys.some(key => [
      "spirit",
      "spirits",
      "liquor",
      "vodka",
      "gin",
      "rum",
      "white-rum",
      "dark-rum",
      "spiced-rum",
      "tequila",
      "whisky",
      "whiskey",
      "bourbon",
      "brandy",
      "cognac",
      "liqueur",
      "coffee-liqueur",
      "triple-sec",
      "vermouth",
      "dry-vermouth",
      "mezcal",
      "absinthe"
    ].includes(key))) {
      return "Spirits";
    }
    return "Other";
  }

  const DRINK_STOCK_REMAINING_OPTIONS = Array.from({ length: 11 }, (_, index) => 100 - (index * 10));

  function detectDrinkStockRemainingStyle(value) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.endsWith("%")) {
        return "percent-string";
      }
      return "percent-number";
    }
    return "percent-number";
  }

  function parseDrinkStockRemainingPercent(value) {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return Number.NaN;
      }
      return value >= 0 && value <= 1 ? value * 100 : value;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return Number.NaN;
      }
      const isPercentString = trimmed.endsWith("%");
      const numericText = isPercentString ? trimmed.slice(0, -1).trim() : trimmed;
      const number = Number(numericText);
      if (!Number.isFinite(number)) {
        return Number.NaN;
      }
      return !isPercentString && number >= 0 && number <= 1 ? number * 100 : number;
    }
    return Number.NaN;
  }

  function clampDrinkStockRemainingPercent(percent) {
    if (!Number.isFinite(percent)) {
      return 100;
    }
    return Math.max(0, Math.min(100, percent));
  }

  function roundDrinkStockRemainingPercent(percent) {
    return clampDrinkStockRemainingPercent(Math.round(clampDrinkStockRemainingPercent(percent) / 10) * 10);
  }

  function serializeDrinkStockRemainingPercent(percent, style = "percent-number") {
    const clamped = clampDrinkStockRemainingPercent(percent);
    if (style === "percent-string") {
      return `${clamped}%`;
    }
    return clamped;
  }

  function normalizeDrinkStockRemaining(value, opened) {
    const style = detectDrinkStockRemainingStyle(value);
    const parsedPercent = parseDrinkStockRemainingPercent(value);
    const clampedPercent = clampDrinkStockRemainingPercent(Number.isFinite(parsedPercent) ? parsedPercent : 100);
    const normalizedPercent = opened ? clampedPercent : (clampedPercent <= 0 ? 0 : 100);
    return serializeDrinkStockRemainingPercent(normalizedPercent, style);
  }

  function drinkStockRemainingPercent(value, opened, options = {}) {
    const parsedPercent = parseDrinkStockRemainingPercent(value);
    const clampedPercent = clampDrinkStockRemainingPercent(Number.isFinite(parsedPercent) ? parsedPercent : 100);
    const normalizedPercent = opened ? clampedPercent : (clampedPercent <= 0 ? 0 : 100);
    return options.round
      ? roundDrinkStockRemainingPercent(normalizedPercent)
      : normalizedPercent;
  }

  function drinkStockCharterIdFromItem(source) {
    if (typeof source.charter_id === "string" && source.charter_id.trim()) {
      return source.charter_id.trim();
    }
    if (typeof source.charter === "string" && source.charter.trim()) {
      return slugify(source.charter);
    }
    return "";
  }

  function copyOptionalDrinkStockFields(target, source) {
    ["brand", "display_name", "label", "expression", "age", "price", "notes"].forEach(field => {
      if (source[field] === undefined || source[field] === null) {
        return;
      }
      target[field] = typeof source[field] === "string" ? source[field].trim() : source[field];
    });
    return target;
  }

  function normalizeDrinkStockItem(item) {
    const source = item && typeof item === "object" ? item : {};
    const opened = Boolean(source.opened);
    const charterId = source.charter_specific ? drinkStockCharterIdFromItem(source) : "";
    const remaining = normalizeDrinkStockRemaining(source.remaining, opened);
    const remainingPercent = drinkStockRemainingPercent(remaining, opened);
    return copyOptionalDrinkStockFields({
      id: typeof source.id === "string" ? source.id : "",
      name: typeof source.name === "string" ? source.name : "",
      variant: typeof source.variant === "string" ? source.variant : null,
      description: typeof source.description === "string" ? source.description : "",
      category: normalizeDrinkCategory(source.category, source.stock_type),
      sub_category: typeof source.sub_category === "string" ? source.sub_category : null,
      in_stock: remainingPercent <= 0
        ? false
        : (source.in_stock === undefined ? true : Boolean(source.in_stock)),
      sold_to_charter: Boolean(source.sold_to_charter),
      sold_to_charter_id: typeof source.sold_to_charter_id === "string" ? source.sold_to_charter_id.trim() : "",
      sold_at: typeof source.sold_at === "string" ? source.sold_at.trim() : "",
      opened,
      remaining,
      remaining_style: detectDrinkStockRemainingStyle(source.remaining),
      charter_specific: Boolean(source.charter_specific),
      charter_id: charterId,
      charter: typeof source.charter === "string" && source.charter.trim()
        ? source.charter.trim()
        : (charterId ? charterDisplayName(charterId) : ""),
      date_added: typeof source.date_added === "string" && source.date_added ? source.date_added : todayInputDate()
    }, source);
  }

  function normalizeDrinkStocks(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      items: Array.isArray(source.items) ? source.items.map(normalizeDrinkStockItem) : []
    };
  }

  async function loadDrinkStocks() {
    return normalizeDrinkStocks(await api("/api/admin/drink-stocks"));
  }

  async function saveDrinkStocks(drinkStocks, successMessage) {
    try {
      const saved = normalizeDrinkStocks(await api("/api/admin/drink-stocks/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: drinkStocks.items })
      }));
      drinkStocks.items = saved.items;
      setStatus(successMessage || "Drink stocks saved.", "ok");
      return saved;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }

  async function loadAvailableAlcohol(charterId = syncSelectedCharter()) {
    return normalizeAvailableAlcohol(await api(`/api/admin/charter/${encodeURIComponent(charterId)}/available-alcohol`));
  }

  async function saveAvailableAlcohol(charterId, availableAlcohol, successMessage) {
    try {
      const saved = normalizeAvailableAlcohol(await api(`/api/admin/charter/${encodeURIComponent(charterId)}/available-alcohol/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(availableAlcohol)
      }));
      availableAlcohol.items = saved.items;
      availableAlcohol.show_prices_to_guests = saved.show_prices_to_guests;
      setStatus(successMessage || "Available Alcohol saved.", "ok");
      return saved;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }

  async function loadCharterAlcoholPurchases(charterId = syncSelectedCharter()) {
    return normalizeCharterAlcoholPurchases(await api(`/api/admin/charter/${encodeURIComponent(charterId)}/alcohol-purchases`));
  }

  async function purchaseCharterAlcohol(charterId, payload) {
    return normalizeCharterAlcoholPurchaseMutation(await api(`/api/admin/charter/${encodeURIComponent(charterId)}/alcohol-purchases/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    }));
  }

  async function reverseCharterAlcoholPurchase(charterId, purchaseId) {
    return normalizeCharterAlcoholPurchaseMutation(await api(`/api/admin/charter/${encodeURIComponent(charterId)}/alcohol-purchases/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: purchaseId })
    }));
  }

  async function loadCocktails() {
    return normalizeCocktails(await api("/api/admin/cocktails"));
  }

  async function saveCocktails(cocktails, successMessage) {
    try {
      const saved = normalizeCocktails(await api("/api/admin/cocktails/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cocktails)
      }));
      cocktails.cocktails = saved.cocktails;
      setStatus(successMessage || "Cocktails saved.", "ok");
      return saved;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }

  function drinkStockNameKey(value) {
    return String(value || "").trim().toLocaleLowerCase();
  }

  function uniqueDrinkStockId(baseName, usedIds, currentId = "") {
    const base = slugify(baseName) || "drink-stock";
    const normalizedCurrent = slugify(currentId);
    if (normalizedCurrent && !usedIds.has(normalizedCurrent)) {
      usedIds.add(normalizedCurrent);
      return normalizedCurrent;
    }
    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(candidate);
    return candidate;
  }

  function drinkStockBaseIdText(item) {
    return [item && item.name, item && item.variant, item && item.category]
      .filter(Boolean)
      .join(" ");
  }

  function charterDisplayName(charterId) {
    if (charterId === INTERNAL_USE_ASSIGNMENT_ID) {
      return INTERNAL_USE_ASSIGNMENT_LABEL;
    }
    const charter = state.charters.find(candidate => candidate.id === charterId);
    return charter ? (charter.name || charter.id) : charterId;
  }

  function isSoldToCharterDrinkStock(item) {
    return Boolean(item && item.sold_to_charter);
  }

  function drinkStockIsAvailableForPurchase(item) {
    return Boolean(item && item.in_stock && !isSoldToCharterDrinkStock(item));
  }

  function drinkStockStatusText(item) {
    if (isSoldToCharterDrinkStock(item)) {
      return "Sold";
    }
    return item.in_stock ? "In Stock" : "Out of Stock";
  }

  function drinkStockCharterText(item) {
    if (isInternalUseDrinkStock(item)) {
      return INTERNAL_USE_ASSIGNMENT_LABEL;
    }
    if (isSoldToCharterDrinkStock(item)) {
      return `Sold: ${charterDisplayName(item.sold_to_charter_id)}`;
    }
    return item.charter_specific ? `Charter: ${charterDisplayName(item.charter_id)}` : "Available";
  }

  function isInternalUseDrinkStock(item) {
    return Boolean(item && item.charter_specific && item.charter_id === INTERNAL_USE_ASSIGNMENT_ID);
  }

  function drinkStockDisplayName(item, index) {
    const name = item.name || `Drink ${index + 1}`;
    return item.variant ? `${name} - ${item.variant}` : name;
  }

  function getStockUnitLabels(item) {
    const source = typeof item === "string" ? { category: item } : (item && typeof item === "object" ? item : {});
    const isBeer = normalizeDrinkCategory(source.category, source.stock_type) === "Beers";
    return isBeer
      ? {
          singular: "case",
          plural: "cases",
          openedLabel: "Opened Case",
          openActionLabel: "Open Case",
          remainingLabel: "Case Remaining",
          countLabel: "Case count",
          unopenedLabel: "Unopened case",
          emptyLabel: "Empty case",
          isBeer: true
        }
      : {
          singular: "bottle",
          plural: "bottles",
          openedLabel: "Opened Bottle",
          openActionLabel: "Open Bottle",
          remainingLabel: "Remaining",
          countLabel: "Quantity",
          unopenedLabel: "Unopened",
          emptyLabel: "Empty",
          isBeer: false
        };
  }

  function drinkStockUnitItemFromModalDraft(draft, categorySelect) {
    return {
      ...draft,
      category: categorySelect ? categorySelect.value : draft.category
    };
  }

  function drinkStockOpenedToggleLabel(item, opened) {
    const labels = getStockUnitLabels(item);
    return opened ? labels.openedLabel : labels.openActionLabel;
  }

  function openedDrinkStockResetText(item) {
    const labels = getStockUnitLabels(item);
    return `Opened ${labels.plural} can only reset to unopened by setting ${labels.remainingLabel} to 0%.`;
  }

  function drinkStockGroupedCountText(quantity, item) {
    const count = Math.max(0, Math.trunc(Number(quantity) || 0));
    const labels = getStockUnitLabels(item);
    return labels.isBeer
      ? `${count} ${labels.plural} in stock`
      : `${count} unopened ${labels.plural}`;
  }

  function drinkStockRemainingText(item) {
    const labels = getStockUnitLabels(item);
    if (!item.opened) {
      return item.in_stock ? labels.unopenedLabel : labels.emptyLabel;
    }
    const percent = drinkStockRemainingPercent(item.remaining, true, { round: true });
    return labels.isBeer
      ? `Opened ${labels.singular}, ${percent}% ${labels.remainingLabel.toLocaleLowerCase()}`
      : `Open ${percent}%`;
  }

  function renderDrinkStocksPanel(drinkStocks) {
    const categoryKeys = new Set(DRINK_STOCK_CATEGORIES.map(selectionValueKey));
    const categories = [
      ...DRINK_STOCK_CATEGORIES,
      ...uniqueSortedValues(drinkStocks.items.map(item => item.category))
        .filter(category => !categoryKeys.has(selectionValueKey(category)))
    ];
    const subCategories = uniqueSortedValues((Array.isArray(drinkStocks?.items) ? drinkStocks.items : []).map(item => (
      normalizeDrinkStockSubCategoryFilterLabel(item?.sub_category, item?.category)
    )).filter(Boolean));
    const canGenerateReport = Array.isArray(drinkStocks?.items) && drinkStocks.items.length > 0;
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Drink Stocks</h2>
          <div class="button-row list-add-actions">
            ${iconButtonHtml("add", "Add drink stock item", ` id="add-drink-stock"`)}
            <button type="button" id="drink-stock-report-action" class="purchased-alcohol-print-button" title="${escapeAttribute(canGenerateReport ? "Generate printable drink stock report" : "No drink stock items recorded.")}" aria-label="${escapeAttribute(canGenerateReport ? "Generate printable drink stock report" : "No drink stock items recorded.")}"${canGenerateReport ? "" : " disabled"}>Print Stock Report</button>
          </div>
        </div>
        <div class="drink-stock-controls">
          <label>Search
            <input id="drink-stock-search" type="search" placeholder="Search stocks">
          </label>
          <label>Sort
            <select id="drink-stock-sort">
              <option value="name">Name A-Z</option>
              <option value="newest">Date Added newest</option>
              <option value="oldest">Date Added oldest</option>
            </select>
          </label>
          <label>Category
            <select id="drink-stock-category-filter">
              <option value="">All</option>
              ${categories.map(category => `<option value="${escapeAttribute(category)}">${escapeHtml(category)}</option>`).join("")}
            </select>
          </label>
          <label>Sub Category
            <select id="drink-stock-sub-category-filter">
              <option value="">All Sub Categories</option>
              ${subCategories.map(subCategory => `<option value="${escapeAttribute(subCategory)}">${escapeHtml(subCategory)}</option>`).join("")}
            </select>
          </label>
          <label>Stock
            <select id="drink-stock-stock-filter">
              <option value="">All</option>
              <option value="in">In Stock</option>
              <option value="out">Out of Stock</option>
            </select>
          </label>
          <label>Charter
            <select id="drink-stock-charter-filter">
              <option value="">All</option>
              <option value="charter">Charter Specific</option>
              <option value="internal">Internal Use</option>
              <option value="available">Available</option>
            </select>
          </label>
        </div>
        <div id="drink-stock-list-shell" class="drink-stock-list-shell">
          <div id="drink-stock-list-header" class="drink-stock-list-header record-row drink-stock-row" hidden>
            <span>Name</span>
            <span>Category</span>
            <span>Remaining</span>
            <span>Stock</span>
            <span>Charter</span>
            <span class="drink-stock-list-header-spacer" aria-hidden="true"></span>
          </div>
          <div id="drink-stock-list" class="editor-list drink-stock-list"></div>
        </div>
      </section>
    `;
  }

  function normalizeDrinkStockSubCategoryFilterLabel(value, category = "") {
    const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    if (!text) {
      return "";
    }
    const key = text.toLocaleLowerCase().replace(/[\s.\/-]+/g, "");
    if (["na", "none", "notapplicable", "null", "undefined"].includes(key)) {
      return "";
    }
    return normalizeAvailableAlcoholSubCategoryLabel(text, category) || text;
  }

  function filteredDrinkStockItems(drinkStocks) {
    const search = String(document.getElementById("drink-stock-search")?.value || "").trim().toLocaleLowerCase();
    const sort = document.getElementById("drink-stock-sort")?.value || "name";
    const category = document.getElementById("drink-stock-category-filter")?.value || "";
    const subCategory = document.getElementById("drink-stock-sub-category-filter")?.value || "";
    const stock = document.getElementById("drink-stock-stock-filter")?.value || "";
    const charter = document.getElementById("drink-stock-charter-filter")?.value || "";
    const rows = drinkStocks.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const normalizedSubCategory = normalizeDrinkStockSubCategoryFilterLabel(item?.sub_category, item?.category);
        const searchText = [item.name, item.variant, item.category, normalizedSubCategory, item.description, drinkStockStatusText(item), drinkStockCharterText(item)]
          .join(" ")
          .toLocaleLowerCase();
        if (search && !searchText.includes(search)) {
          return false;
        }
        if (category && item.category !== category) {
          return false;
        }
        if (subCategory && normalizedSubCategory !== subCategory) {
          return false;
        }
        if (stock === "in" && !item.in_stock) {
          return false;
        }
        if (stock === "out" && item.in_stock) {
          return false;
        }
        if (charter === "charter" && (!item.charter_specific || isInternalUseDrinkStock(item))) {
          return false;
        }
        if (charter === "internal" && !isInternalUseDrinkStock(item)) {
          return false;
        }
        if (charter === "available" && item.charter_specific) {
          return false;
        }
        return true;
      });
    rows.sort((a, b) => {
      if (sort === "newest") {
        return String(b.item.date_added || "").localeCompare(String(a.item.date_added || "")) || a.item.name.localeCompare(b.item.name);
      }
      if (sort === "oldest") {
        return String(a.item.date_added || "").localeCompare(String(b.item.date_added || "")) || a.item.name.localeCompare(b.item.name);
      }
      return a.item.name.localeCompare(b.item.name, undefined, { sensitivity: "base" });
    });
    return rows;
  }

  function aggregateDrinkStockRows(rows) {
    const displayRows = [];
    const rowsByKey = new Map();
    (Array.isArray(rows) ? rows : []).forEach(({ item, index }) => {
      const productKey = item && item.opened === false ? drinkStockAggregationKey(item) : "";
      const assignmentKey = item && item.charter_specific ? `charter:${item.charter_id || ""}` : "general";
      const aggregateKey = productKey ? `${productKey}|stock:${item.in_stock ? "in" : "out"}|${assignmentKey}` : "";
      const key = aggregateKey ? `unopened:${aggregateKey}` : `single:${item && item.id || index}`;
      let row = rowsByKey.get(key);
      if (!row) {
        row = {
          key,
          item,
          index,
          indexes: [],
          items: [],
          quantity: 0,
          isGrouped: false
        };
        rowsByKey.set(key, row);
        displayRows.push(row);
      }
      row.indexes.push(index);
      row.items.push(item);
      row.quantity = row.items.length;
      row.isGrouped = Boolean(aggregateKey && row.quantity > 1);
    });
    return displayRows;
  }

  function syncDrinkStockReportAction(drinkStocks) {
    const button = document.getElementById("drink-stock-report-action");
    if (!button) {
      return;
    }
    const canGenerate = Array.isArray(drinkStocks?.items) && drinkStocks.items.length > 0;
    const label = canGenerate ? "Generate printable drink stock report" : "No drink stock items recorded.";
    button.disabled = !canGenerate;
    button.title = label;
    button.setAttribute("aria-label", label);
  }

  function drinkStockReportCategoryRank(category) {
    const normalized = normalizeDrinkCategory(category);
    const index = DRINK_STOCK_CATEGORIES.findIndex(value => selectionValueKey(value) === selectionValueKey(normalized));
    return index >= 0 ? index : Number.POSITIVE_INFINITY;
  }

  function drinkStockReportCategoryText(item) {
    const category = normalizeDrinkCategory(item?.category, item?.stock_type) || "Other";
    const subCategory = availableAlcoholSubCategoryText(item);
    const categoryKey = selectionValueKey(category);
    const subCategoryKey = selectionValueKey(subCategory);
    const showSubCategory = Boolean(
      subCategory
      && subCategoryKey
      && subCategoryKey !== selectionValueKey(AVAILABLE_ALCOHOL_SUBCATEGORY_FALLBACK)
      && subCategoryKey !== categoryKey
    );
    return showSubCategory ? `${category} - ${subCategory}` : category;
  }

  function drinkStockReportAggregationKey(item, index) {
    const source = item && typeof item === "object" ? item : {};
    const productKey = source.opened === false ? drinkStockAggregationKey(source) : "";
    const assignmentKey = source.charter_specific ? `charter:${source.charter_id || ""}` : "general";
    const statusKey = isSoldToCharterDrinkStock(source)
      ? `sold:${source.sold_to_charter_id || ""}`
      : `stock:${source.in_stock ? "in" : "out"}`;
    return productKey ? `unopened:${productKey}|${statusKey}|${assignmentKey}` : `single:${source.id || index}`;
  }

  function compareDrinkStockReportRows(leftRow, rightRow) {
    const leftItem = leftRow?.item || {};
    const rightItem = rightRow?.item || {};
    const categoryRankDifference = drinkStockReportCategoryRank(leftItem.category) - drinkStockReportCategoryRank(rightItem.category);
    if (categoryRankDifference !== 0) {
      return categoryRankDifference;
    }
    const categoryDifference = normalizeDrinkCategory(leftItem.category).localeCompare(normalizeDrinkCategory(rightItem.category), undefined, { sensitivity: "base" });
    if (categoryDifference !== 0) {
      return categoryDifference;
    }
    const subCategoryDifference = availableAlcoholSubCategoryText(leftItem).localeCompare(availableAlcoholSubCategoryText(rightItem), undefined, { sensitivity: "base" });
    if (subCategoryDifference !== 0) {
      return subCategoryDifference;
    }
    const nameDifference = formatAvailableAlcoholName(leftItem, "Selection").localeCompare(formatAvailableAlcoholName(rightItem, "Selection"), undefined, { sensitivity: "base" });
    if (nameDifference !== 0) {
      return nameDifference;
    }
    const openedDifference = Number(Boolean(leftItem.opened)) - Number(Boolean(rightItem.opened));
    if (openedDifference !== 0) {
      return openedDifference;
    }
    const statusDifference = drinkStockStatusText(leftItem).localeCompare(drinkStockStatusText(rightItem), undefined, { sensitivity: "base" });
    if (statusDifference !== 0) {
      return statusDifference;
    }
    const charterDifference = drinkStockCharterText(leftItem).localeCompare(drinkStockCharterText(rightItem), undefined, { sensitivity: "base" });
    if (charterDifference !== 0) {
      return charterDifference;
    }
    const remainingDifference = drinkStockRemainingPercent(rightItem.remaining, Boolean(rightItem.opened), { round: true })
      - drinkStockRemainingPercent(leftItem.remaining, Boolean(leftItem.opened), { round: true });
    if (remainingDifference !== 0) {
      return remainingDifference;
    }
    return String(leftItem.id || "").localeCompare(String(rightItem.id || ""), undefined, { sensitivity: "base" });
  }

  function aggregateDrinkStockReportRows(items) {
    const rows = [];
    const rowsByKey = new Map();
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const key = drinkStockReportAggregationKey(item, index);
      let row = rowsByKey.get(key);
      if (!row) {
        row = {
          key,
          item,
          index,
          items: [],
          quantity: 0,
          isGrouped: false
        };
        rowsByKey.set(key, row);
        rows.push(row);
      }
      row.items.push(item);
      row.quantity = row.items.length;
      row.isGrouped = key.startsWith("unopened:") && row.quantity > 1;
    });
    return rows.sort(compareDrinkStockReportRows);
  }

  function drinkStockReportSections(drinkStocks) {
    const rows = aggregateDrinkStockReportRows(drinkStocks?.items);
    const inStockRows = [];
    const referenceRows = [];
    rows.forEach(row => {
      if (row?.item?.in_stock && !isSoldToCharterDrinkStock(row.item)) {
        inStockRows.push(row);
      } else {
        referenceRows.push(row);
      }
    });
    return [
      {
        key: "in-stock",
        title: "In Stock",
        rows: inStockRows
      },
      {
        key: "reference",
        title: "Out of Stock / Reference",
        rows: referenceRows
      }
    ].filter(section => section.rows.length);
  }

  function renderDrinkStockReportSectionsHtml(sections) {
    return sections.length
      ? sections.map(section => `
          <section class="menu-section stock-report-section">
            <h3 class="menu-section-title">${escapeHtml(section.title)}</h3>
            <div class="stock-report-table-wrap print-section">
              <table class="stock-report-table">
                <colgroup>
                  <col class="stock-report-item-col">
                  <col class="stock-report-category-col">
                  <col class="stock-report-quantity-col">
                  <col class="stock-report-status-col">
                  <col class="stock-report-assignment-col">
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" class="stock-report-item-col">Item</th>
                    <th scope="col" class="stock-report-category-col">Category</th>
                    <th scope="col" class="stock-report-quantity-col">Qty / %</th>
                    <th scope="col" class="stock-report-status-col">Status</th>
                    <th scope="col" class="stock-report-assignment-col">Assignment</th>
                  </tr>
                </thead>
                <tbody>
                  ${section.rows.map(row => {
                    const item = row?.item || {};
                    const displayName = formatAvailableAlcoholName(item, `Drink ${row.index + 1}`);
                    const categoryText = drinkStockReportCategoryText(item);
                    return `
                      <tr>
                        <td class="stock-report-item-col"><div class="stock-report-item">${escapeHtml(displayName)}</div></td>
                        <td class="stock-report-category-col">
                          <div class="stock-report-category">${escapeHtml(categoryText)}</div>
                        </td>
                        <td class="stock-report-quantity-col"><div class="stock-report-detail">${escapeHtml(drinkStockReportQuantityText(row))}</div></td>
                        <td class="stock-report-status-col"><div class="stock-report-status">${escapeHtml(drinkStockReportStatusText(item))}</div></td>
                        <td class="stock-report-assignment-col"><div class="stock-report-assignment">${escapeHtml(drinkStockReportAssignmentText(item))}</div></td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </section>
        `).join("")
      : `<div class="stock-report-empty print-section">No drink stock items recorded.</div>`;
  }

  function drinkStockReportQuantityText(row) {
    const item = row?.item || {};
    const quantity = Math.max(1, Math.trunc(Number(row?.quantity) || 0));
    if (item.opened) {
      return `${drinkStockRemainingPercent(item.remaining, true, { round: true })}%`;
    }
    return String(quantity);
  }

  function drinkStockReportAssignmentText(item) {
    const source = item && typeof item === "object" ? item : {};
    if (isSoldToCharterDrinkStock(source) && source.sold_to_charter_id) {
      return charterDisplayName(source.sold_to_charter_id);
    }
    if (source.charter_specific && !isInternalUseDrinkStock(source) && source.charter_id) {
      return charterDisplayName(source.charter_id);
    }
    return "None";
  }

  function drinkStockReportStatusText(item) {
    if (isSoldToCharterDrinkStock(item)) {
      return "Sold";
    }
    return item?.in_stock ? "In Stock" : "Out of Stock";
  }

  function drinkStockReportPreviewCharters() {
    return (Array.isArray(state.charters) ? state.charters : [])
      .filter(charter => charter && charter.id && charter.id !== INTERNAL_USE_ASSIGNMENT_ID)
      .map(charter => ({
        id: charter.id,
        name: typeof charter.name === "string" && charter.name.trim() ? charter.name.trim() : charter.id,
        start_date: charter.start_date || "",
        end_date: charter.end_date || "",
        guest_count: charter.guest_count
      }));
  }

  async function loadDrinkStockReportPreviewData() {
    const charters = drinkStockReportPreviewCharters();
    const purchasesByCharterEntries = await Promise.all(
      charters.map(async charter => [charter.id, await loadCharterAlcoholPurchases(charter.id)])
    );
    return {
      charters,
      purchasesByCharter: Object.fromEntries(purchasesByCharterEntries)
    };
  }

  function drinkStockReportCharterMatchKeys(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      return [];
    }
    const keys = new Set();
    const selectionKey = selectionValueKey(text);
    const slugKey = slugify(text);
    if (selectionKey) {
      keys.add(selectionKey);
    }
    if (slugKey) {
      keys.add(slugKey);
    }
    return [...keys];
  }

  function drinkStockReportMatchesCharter(value, charter) {
    const candidateKeys = drinkStockReportCharterMatchKeys(value);
    if (!candidateKeys.length) {
      return false;
    }
    const targetKeys = new Set([
      ...drinkStockReportCharterMatchKeys(charter?.id),
      ...drinkStockReportCharterMatchKeys(charter?.name)
    ]);
    return candidateKeys.some(key => targetKeys.has(key));
  }

  function drinkStockReportCharterActivePurchaseIds(purchases) {
    return new Set(
      activeCharterAlcoholPurchases(purchases)
        .map(item => typeof item?.stock_item_id === "string" ? item.stock_item_id.trim().toLocaleLowerCase() : "")
        .filter(Boolean)
    );
  }

  function drinkStockReportStockMatchesSelectedCharter(item, charter, activePurchaseIds = new Set()) {
    const source = item && typeof item === "object" ? item : {};
    if (!source || isInternalUseDrinkStock(source)) {
      return false;
    }
    const stockIdKey = typeof source.id === "string" ? source.id.trim().toLocaleLowerCase() : "";
    if (stockIdKey && activePurchaseIds.has(stockIdKey)) {
      return true;
    }
    const assignmentMatch = source.charter_specific === true && (
      drinkStockReportMatchesCharter(source.charter_id, charter)
      || drinkStockReportMatchesCharter(source.charter, charter)
    );
    const soldMatch = source.sold_to_charter === true && [
      source.sold_to_charter_id,
      source.sold_to_charter_name,
      source.sold_to_charter_label
    ].some(value => drinkStockReportMatchesCharter(value, charter));
    const purchasedMatch = [
      source.purchased_by_charter,
      source.purchased_by_charter_id,
      source.purchased_by_charter_name,
      source.purchase_charter,
      source.purchase_charter_id,
      source.purchase_charter_name
    ].some(value => drinkStockReportMatchesCharter(value, charter));
    return assignmentMatch || soldMatch || purchasedMatch;
  }

  function drinkStockReportCharterRowStatus(item, activePurchaseIds = new Set()) {
    const source = item && typeof item === "object" ? item : {};
    const stockIdKey = typeof source.id === "string" ? source.id.trim().toLocaleLowerCase() : "";
    const remainingPercent = drinkStockRemainingPercent(source.remaining, Boolean(source.opened), { round: true });
    if (source.opened) {
      return "Opened";
    }
    if (source.sold_to_charter === true || (stockIdKey && activePurchaseIds.has(stockIdKey))) {
      return remainingPercent <= 0 ? "Consumed" : "Purchased";
    }
    return source.in_stock ? "In Stock" : "Out of Stock";
  }

  function drinkStockReportCharterStatusRank(status) {
    switch (status) {
      case "In Stock":
        return 0;
      case "Opened":
        return 1;
      case "Purchased":
        return 2;
      case "Consumed":
        return 3;
      case "Out of Stock":
        return 4;
      default:
        return 5;
    }
  }

  function compareDrinkStockCharterReportRows(left, right) {
    const categoryRankDifference = drinkStockReportCategoryRank(left?.category) - drinkStockReportCategoryRank(right?.category);
    if (categoryRankDifference !== 0) {
      return categoryRankDifference;
    }
    const categoryDifference = String(left?.category_text || "").localeCompare(String(right?.category_text || ""), undefined, { sensitivity: "base" });
    if (categoryDifference !== 0) {
      return categoryDifference;
    }
    const itemDifference = String(left?.item_text || "").localeCompare(String(right?.item_text || ""), undefined, { sensitivity: "base" });
    if (itemDifference !== 0) {
      return itemDifference;
    }
    const statusDifference = drinkStockReportCharterStatusRank(left?.status) - drinkStockReportCharterStatusRank(right?.status);
    if (statusDifference !== 0) {
      return statusDifference;
    }
    const assignmentDifference = String(left?.assignment || "").localeCompare(String(right?.assignment || ""), undefined, { sensitivity: "base" });
    if (assignmentDifference !== 0) {
      return assignmentDifference;
    }
    const rightPrice = normalizeAvailableAlcoholPrice(right?.price);
    const leftPrice = normalizeAvailableAlcoholPrice(left?.price);
    const priceDifference = (rightPrice === null ? Number.NEGATIVE_INFINITY : rightPrice)
      - (leftPrice === null ? Number.NEGATIVE_INFINITY : leftPrice);
    if (priceDifference !== 0) {
      return priceDifference;
    }
    const remainingDifference = (Number(right?.remaining_percent) || 0) - (Number(left?.remaining_percent) || 0);
    if (remainingDifference !== 0) {
      return remainingDifference;
    }
    return String(left?.reference_id || "").localeCompare(String(right?.reference_id || ""), undefined, { sensitivity: "base" });
  }

  function aggregateDrinkStockCharterReportRows(drinkStocks, charter, purchases, options = {}) {
    const rows = [];
    const rowsByKey = new Map();
    const activePurchases = activeCharterAlcoholPurchases(purchases);
    const activePurchaseIds = drinkStockReportCharterActivePurchaseIds(purchases);
    const includedStockIds = new Set();
    const excludePurchased = Boolean(options.excludePurchased);
    (Array.isArray(drinkStocks?.items) ? drinkStocks.items : [])
      .filter(item => drinkStockReportStockMatchesSelectedCharter(item, charter, activePurchaseIds))
      .forEach((item, index) => {
        const stockId = typeof item?.id === "string" ? item.id.trim() : "";
        const status = drinkStockReportCharterRowStatus(item, activePurchaseIds);
        if (excludePurchased && status === "Purchased") {
          return;
        }
        if (stockId) {
          includedStockIds.add(stockId.toLocaleLowerCase());
        }
        const categoryText = drinkStockReportCategoryText(item);
        const itemText = formatAvailableAlcoholName(item, `Drink ${index + 1}`);
        const key = item?.opened
          ? `stock:${stockId || index}`
          : [
              "stock",
              selectionValueKey(categoryText),
              availableAlcoholNameKey(itemText),
              selectionValueKey(charter?.name || charter?.id || ""),
              selectionValueKey(status)
            ].join("::");
        let row = rowsByKey.get(key);
        if (!row) {
          row = {
            key,
            source_type: "stock",
            source_item: item,
            quantity: 0,
            category: normalizeDrinkCategory(item?.category, item?.stock_type) || "Other",
            category_text: categoryText,
            item_text: itemText,
            assignment: charter?.name || charter?.id || "None",
            status,
            remaining_percent: item?.opened ? drinkStockRemainingPercent(item.remaining, true, { round: true }) : null,
            price: null,
            currency: "",
            reference_id: stockId || String(index)
          };
          rowsByKey.set(key, row);
          rows.push(row);
        }
        row.quantity += 1;
      });
    if (excludePurchased) {
      return rows.sort(compareDrinkStockCharterReportRows);
    }
    activePurchases.forEach((purchase, index) => {
      const stockIdKey = typeof purchase?.stock_item_id === "string" ? purchase.stock_item_id.trim().toLocaleLowerCase() : "";
      if (stockIdKey && includedStockIds.has(stockIdKey)) {
        return;
      }
      const categoryText = drinkStockReportCategoryText(purchase);
      const itemText = formatAvailableAlcoholName(purchase, `Purchased ${index + 1}`);
      const price = normalizeAvailableAlcoholPrice(purchase?.price) ?? 0;
      const currency = typeof purchase?.currency === "string" && purchase.currency.trim() ? purchase.currency.trim() : "";
      const key = [
        "purchase",
        selectionValueKey(categoryText),
        availableAlcoholNameKey(itemText),
        selectionValueKey(charter?.name || charter?.id || ""),
        selectionValueKey("Purchased"),
        String(price),
        currency
      ].join("::");
      let row = rowsByKey.get(key);
      if (!row) {
        row = {
          key,
          source_type: "purchase",
          source_item: purchase,
          quantity: 0,
          category: normalizeDrinkCategory(purchase?.category, purchase?.stock_type) || "Other",
          category_text: categoryText,
          item_text: itemText,
          assignment: charter?.name || charter?.id || "None",
          status: "Purchased",
          remaining_percent: null,
          price,
          currency,
          reference_id: purchase?.id || purchase?.stock_item_id || String(index)
        };
        rowsByKey.set(key, row);
        rows.push(row);
      }
      row.quantity += 1;
    });
    return rows.sort(compareDrinkStockCharterReportRows);
  }

  function drinkStockReportCharterQuantityText(row) {
    if (row?.remaining_percent !== null && row?.remaining_percent !== undefined) {
      return `${row.remaining_percent}%`;
    }
    const quantity = Math.max(0, Math.trunc(Number(row?.quantity) || 0));
    return quantity > 0 ? String(quantity) : "";
  }

  function renderDrinkStockCharterReportBody(drinkStocks, charter, purchases, options = {}) {
    const rows = aggregateDrinkStockCharterReportRows(drinkStocks, charter, purchases, options);
    if (!rows.length) {
      return `<div class="stock-report-empty print-section">No alcohol records found for this charter.</div>`;
    }
    return `
      <div class="stock-report-table-wrap print-section">
        <table class="stock-report-table">
          <colgroup>
            <col class="stock-report-category-col">
            <col class="stock-report-item-col">
            <col class="stock-report-assignment-col">
            <col class="stock-report-status-col">
            <col class="stock-report-quantity-col">
          </colgroup>
          <thead>
            <tr>
              <th scope="col" class="stock-report-category-col">Category</th>
              <th scope="col" class="stock-report-item-col">Item</th>
              <th scope="col" class="stock-report-assignment-col">Assignment</th>
              <th scope="col" class="stock-report-status-col">Status</th>
              <th scope="col" class="stock-report-quantity-col">Qty / Remaining</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td class="stock-report-category-col"><div class="stock-report-category">${escapeHtml(row.category_text || row.category || "Other")}</div></td>
                <td class="stock-report-item-col"><div class="stock-report-item">${escapeHtml(row.item_text || "Selection")}</div></td>
                <td class="stock-report-assignment-col"><div class="stock-report-assignment">${escapeHtml(row.assignment || "None")}</div></td>
                <td class="stock-report-status-col"><div class="stock-report-status">${escapeHtml(row.status || "")}</div></td>
                <td class="stock-report-quantity-col"><div class="stock-report-detail">${escapeHtml(drinkStockReportCharterQuantityText(row))}</div></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function drinkStockReportPreviewArticleKey(reportKey, options = {}) {
    if (reportKey === "all") {
      return "all";
    }
    return `${reportKey}::${options.excludePurchased ? "exclude-purchased" : "include-purchased"}`;
  }

  function drinkStockReportPreviewSelectorOptions(charters) {
    return [
      `<option value="all" selected>All Stock</option>`,
      ...(Array.isArray(charters) ? charters : []).map(charter => (
        `<option value="${escapeAttribute(charter.id)}">${escapeHtml(charter.name || charter.id)}</option>`
      ))
    ].join("");
  }

  function renderDrinkStockReportPreviewArticle(reportKey, title, metaItems, bodyHtml, vesselLineArtUrl, shoulderPatchUrl, hidden = false) {
    const items = Array.isArray(metaItems) ? metaItems.filter(Boolean) : [];
    return `
      <article class="menu-paper charter-page print-a4 stock-report-page" data-stock-report-key="${escapeAttribute(reportKey)}"${hidden ? " hidden" : ""}>
        <div class="print-header">
          <img class="stock-report-vessel-art" src="${escapeAttribute(vesselLineArtUrl)}" alt="Princess Iolanthe vessel line art">
          <div class="menu-heading">Princess Iolanthe</div>
          <h2 class="menu-title">${escapeHtml(title)}</h2>
          ${items.length ? `<div class="menu-meta-row">${items.map(item => `<div class="menu-meta-line">${escapeHtml(item)}</div>`).join("")}</div>` : ""}
        </div>
        <div class="print-content">
          ${bodyHtml}
        </div>
        <div class="stock-report-stamp" aria-hidden="true">
          <img src="${escapeAttribute(shoulderPatchUrl)}" alt="">
        </div>
      </article>
    `;
  }

  function drinkStockReportPreviewStyles() {
    return `
    .stock-report-preview-controls {
      width: min(100%, 860px);
      margin: 0 auto 18px;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .stock-report-preview-controls label {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 16px;
      background: rgba(11,34,56,0.3);
      backdrop-filter: blur(8px);
      box-shadow:
        0 10px 24px rgba(0,0,0,0.18),
        inset 0 1px 0 rgba(255,255,255,0.14);
      color: #f3e3bd;
      font: 700 0.84rem/1.2 Arial, Helvetica, sans-serif;
      white-space: nowrap;
    }

    .stock-report-preview-controls select {
      min-width: min(260px, 58vw);
      padding: 8px 10px;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 12px;
      background: rgba(255,255,255,0.96);
      color: #17212b;
      font: 600 0.95rem/1.2 Arial, Helvetica, sans-serif;
    }

    .stock-report-preview-controls input[type="checkbox"] {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: #c39447;
    }

    .stock-report-preview-controls .stock-report-preview-toggle {
      gap: 8px;
    }

    .stock-report-preview-controls .stock-report-preview-toggle span {
      white-space: nowrap;
    }

    .stock-report-preview-stack {
      width: 100%;
    }

    .stock-report-preview-stack > .stock-report-page[hidden] {
      display: none !important;
    }

    .stock-report-page.menu-paper {
      background: linear-gradient(180deg, #fefefd 0%, #f4f6f8 100%);
      color: #17212b;
      border: none;
      outline: none;
      border-radius: 18px;
      box-shadow: none;
      padding: clamp(28px, 4vw, 38px) clamp(22px, 3vw, 32px);
    }

    .stock-report-page.charter-page {
      min-height: auto;
    }

    .stock-report-page.menu-paper::before {
      opacity: 0.05;
      filter: grayscale(1) contrast(1.04);
    }

    .stock-report-page.menu-paper::after {
      content: none;
      display: none;
      border: none;
    }

    .stock-report-page .menu-heading {
      color: #57697a;
      margin-bottom: 8px;
    }

    .stock-report-page .menu-title {
      margin: 4px 0 10px;
      color: #18232d;
      font-size: 2rem;
    }

    .stock-report-vessel-art {
      display: block;
      width: min(260px, 62%);
      margin: 0 auto 12px;
      opacity: 0.92;
    }

    .stock-report-page .menu-meta-row {
      margin-bottom: 14px;
    }

    .stock-report-page .menu-meta-line {
      color: #5c6d7c;
      font: 700 0.78rem/1.2 Arial, Helvetica, sans-serif;
    }

    .stock-report-section + .stock-report-section {
      margin-top: 24px;
      padding-top: 30px;
    }

    .stock-report-section + .stock-report-section::before {
      top: 0;
      opacity: 0.34;
    }

    .stock-report-table-wrap {
      position: relative;
      border: 1px solid rgba(84,102,122,0.18);
      border-radius: 16px;
      background: #fff;
      overflow: hidden;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.76);
    }

    .stock-report-table {
      table-layout: fixed;
      width: 100%;
      max-width: 100%;
      border-collapse: collapse;
      color: #17212b;
    }

    .stock-report-table th,
    .stock-report-table td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(84,102,122,0.14);
      text-align: left;
      vertical-align: top;
    }

    .stock-report-table th {
      background: rgba(231,237,243,0.72);
      color: #455565;
      font: 700 0.8rem/1.2 Arial, Helvetica, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .stock-report-table th,
    .stock-report-table td {
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: normal;
    }

    .stock-report-table .stock-report-item-col {
      width: 38%;
      max-width: 38%;
    }

    .stock-report-table .stock-report-category-col {
      width: 20%;
    }

    .stock-report-table .stock-report-quantity-col {
      width: 10%;
      text-align: center;
      white-space: nowrap;
    }

    .stock-report-table .stock-report-status-col {
      width: 14%;
    }

    .stock-report-table .stock-report-assignment-col {
      width: 18%;
    }

    .stock-report-table tbody tr:last-child td {
      border-bottom: 0;
    }

    .stock-report-item {
      color: #18232d;
      font-weight: 700;
      line-height: 1.35;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .stock-report-category {
      color: #24303a;
      font-weight: 700;
      line-height: 1.35;
      white-space: nowrap;
    }

    .stock-report-detail,
    .stock-report-status,
    .stock-report-assignment {
      color: #40515f;
      line-height: 1.45;
      white-space: nowrap;
    }

    .stock-report-detail {
      text-align: center;
      white-space: nowrap;
    }

    .stock-report-stamp {
      position: absolute;
      right: clamp(22px, 6vw, 50px);
      bottom: clamp(24px, 6vw, 48px);
      width: clamp(92px, 14vw, 122px);
      opacity: 0.08;
      transform: rotate(-11deg);
      filter: grayscale(1) sepia(0.16) saturate(0.72);
      pointer-events: none;
      z-index: 6;
    }

    .stock-report-stamp img {
      display: block;
      width: 100%;
      height: auto;
    }

    .stock-report-empty {
      padding: 28px 24px;
      border: 1px solid rgba(84,102,122,0.18);
      border-radius: 16px;
      background: #fff;
      color: #516171;
      text-align: center;
      line-height: 1.6;
    }

    @media print {
      .stock-report-page.menu-paper {
        background: #fff !important;
        border: none !important;
        outline: none !important;
        border-radius: 14px;
        box-shadow: none !important;
        padding: 10mm 10mm 9mm;
      }

      .stock-report-page.menu-paper::after {
        content: none !important;
        display: none !important;
        border: none !important;
      }

      .stock-report-page .stock-report-table-wrap,
      .stock-report-page .stock-report-empty {
        box-shadow: none !important;
      }

      .stock-report-page .stock-report-table-wrap.print-section {
        break-inside: auto;
        page-break-inside: auto;
        overflow: visible;
      }

      .stock-report-page .stock-report-section:first-child {
        break-before: auto;
        page-break-before: auto;
      }

      .stock-report-table {
        table-layout: fixed;
        width: 100%;
        max-width: 100%;
      }

      .stock-report-table th,
      .stock-report-table td {
        padding: 2mm 1.5mm;
        font-size: 9pt;
      }

      .stock-report-table .stock-report-item-col {
        width: 38%;
        max-width: 38%;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: normal;
      }

      .stock-report-table .stock-report-category-col,
      .stock-report-table .stock-report-assignment-col,
      .stock-report-table .stock-report-status-col,
      .stock-report-table .stock-report-quantity-col {
        white-space: nowrap;
        overflow-wrap: normal;
      }

      .stock-report-table .stock-report-assignment-col {
        width: 18%;
      }

      .stock-report-table .stock-report-category-col {
        width: 20%;
      }

      .stock-report-table .stock-report-status-col {
        width: 14%;
      }

      .stock-report-table .stock-report-quantity-col {
        width: 10%;
        text-align: center;
      }

      .stock-report-table thead {
        display: table-header-group;
      }

      .stock-report-table tbody tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .stock-report-page .stock-report-stamp {
        opacity: 0.06;
      }

      .stock-report-preview-controls {
        display: none !important;
      }
    }

    @media (max-width: 760px) {
      .stock-report-preview-controls {
        justify-content: stretch;
      }

      .stock-report-preview-controls label {
        width: 100%;
      }

      .stock-report-preview-controls select {
        min-width: 0;
        width: 100%;
      }

      .stock-report-preview-controls .stock-report-preview-toggle {
        justify-content: flex-start;
      }

      .stock-report-table {
        table-layout: fixed;
        width: 100%;
      }
    }`;
  }

  function renderDrinkStockReportPreview(drinkStocks, charterInfo, previewData = {}) {
    const vesselLineArtUrl = previewAssetUrl("/images/vessel-line-art.png");
    const shoulderPatchUrl = previewAssetUrl("/images/shoulder-patch.svg");
    const generatedAt = new Date().toLocaleString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
    const currentCharterName = String(charterInfo?.name || currentCharterSummary()?.name || currentCharterSummary()?.id || "").trim();
    const charterDateRange = purchasedAlcoholInvoiceDateRangeText(charterInfo);
    const allStockMetaItems = [
      `Generated ${generatedAt}`,
      currentCharterName ? `Current charter: ${currentCharterName}` : "",
      charterDateRange ? `Charter dates: ${charterDateRange}` : ""
    ].filter(Boolean);
    const charters = Array.isArray(previewData?.charters) ? previewData.charters : drinkStockReportPreviewCharters();
    const purchasesByCharter = previewData?.purchasesByCharter && typeof previewData.purchasesByCharter === "object"
      ? previewData.purchasesByCharter
      : {};
    const articlesHtml = [
      renderDrinkStockReportPreviewArticle(
        drinkStockReportPreviewArticleKey("all"),
        "Drink Stocks Inventory Report",
        allStockMetaItems,
        renderDrinkStockReportSectionsHtml(drinkStockReportSections(drinkStocks)),
        vesselLineArtUrl,
        shoulderPatchUrl
      ),
      ...charters.flatMap(charter => {
        const title = `Charter Alcohol Report: ${charter.name || charter.id}`;
        const metaItems = [
          `Generated ${generatedAt}`,
          purchasedAlcoholInvoiceDateRangeText(charter) ? `Charter dates: ${purchasedAlcoholInvoiceDateRangeText(charter)}` : ""
        ].filter(Boolean);
        return [
          renderDrinkStockReportPreviewArticle(
            drinkStockReportPreviewArticleKey(charter.id),
            title,
            metaItems,
            renderDrinkStockCharterReportBody(drinkStocks, charter, purchasesByCharter[charter.id]),
            vesselLineArtUrl,
            shoulderPatchUrl,
            true
          ),
          renderDrinkStockReportPreviewArticle(
            drinkStockReportPreviewArticleKey(charter.id, { excludePurchased: true }),
            title,
            metaItems,
            renderDrinkStockCharterReportBody(drinkStocks, charter, purchasesByCharter[charter.id], { excludePurchased: true }),
            vesselLineArtUrl,
            shoulderPatchUrl,
            true
          )
        ];
      })
    ].join("");
    return `
      <section class="tab-panel active" id="panel-drink-stock-report">
        <div class="stock-report-preview-controls no-print admin-only">
          <label>
            Report
            <select id="stock-report-charter-select">${drinkStockReportPreviewSelectorOptions(charters)}</select>
          </label>
          <label class="stock-report-preview-toggle">
            <input id="stock-report-exclude-purchased" type="checkbox">
            <span>Exclude Purchased Items</span>
          </label>
        </div>
        <div class="charter-stack stock-report-preview-stack">
          ${articlesHtml}
        </div>
        <script>
          (function () {
            var reportSelect = document.getElementById("stock-report-charter-select");
            var excludePurchasedToggle = document.getElementById("stock-report-exclude-purchased");
            var reports = Array.prototype.slice.call(document.querySelectorAll("[data-stock-report-key]"));
            function syncSelectedStockReport() {
              var selectedKey = reportSelect && reportSelect.value ? reportSelect.value : "all";
              var isAllStock = selectedKey === "all";
              if (excludePurchasedToggle) {
                excludePurchasedToggle.disabled = isAllStock;
              }
              var reportKey = isAllStock
                ? "all"
                : selectedKey + "::" + (excludePurchasedToggle && excludePurchasedToggle.checked ? "exclude-purchased" : "include-purchased");
              reports.forEach(function (node) {
                node.hidden = node.getAttribute("data-stock-report-key") !== reportKey;
              });
            }
            if (reportSelect) {
              reportSelect.addEventListener("change", syncSelectedStockReport);
            }
            if (excludePurchasedToggle) {
              excludePurchasedToggle.addEventListener("change", syncSelectedStockReport);
            }
            syncSelectedStockReport();
          }());
        </script>
      </section>
    `;
  }

  function drinkStockColumnWidthCh(values, min, max) {
    const longest = (Array.isArray(values) ? values : [])
      .map(value => String(value || "").trim().length)
      .reduce((result, length) => Math.max(result, length), 0);
    return Math.min(Math.max(longest + 1, min), max);
  }

  function updateDrinkStockListSizing(listShell, displayRows) {
    if (!listShell) {
      return;
    }
    const rows = Array.isArray(displayRows) ? displayRows : [];
    if (!rows.length) {
      [
        "--drink-stock-name-width",
        "--drink-stock-category-width",
        "--drink-stock-remaining-width",
        "--drink-stock-status-width",
        "--drink-stock-charter-width"
      ].forEach(property => listShell.style.removeProperty(property));
      return;
    }
    listShell.style.setProperty("--drink-stock-name-width", `${drinkStockColumnWidthCh(rows.map(({ item, index }) => drinkStockDisplayName(item, index)).concat("Name"), 16, 32)}ch`);
    listShell.style.setProperty("--drink-stock-category-width", `${drinkStockColumnWidthCh(rows.map(({ item }) => item.category || "Uncategorized").concat("Category"), 12, 18)}ch`);
    listShell.style.setProperty("--drink-stock-remaining-width", `${drinkStockColumnWidthCh(rows.map(({ item, quantity, isGrouped }) => isGrouped ? drinkStockGroupedCountText(quantity, item) : drinkStockRemainingText(item)).concat("Remaining", "Case Remaining"), 12, 20)}ch`);
    listShell.style.setProperty("--drink-stock-status-width", `${drinkStockColumnWidthCh(rows.map(({ item }) => drinkStockStatusText(item)).concat("Stock"), 9, 12)}ch`);
    listShell.style.setProperty("--drink-stock-charter-width", `${drinkStockColumnWidthCh(rows.map(({ item }) => drinkStockCharterText(item)).concat("Charter"), 12, 28)}ch`);
  }

  function drawDrinkStockRows(drinkStocks) {
    const container = document.getElementById("drink-stock-list");
    const listShell = document.getElementById("drink-stock-list-shell");
    const listHeader = document.getElementById("drink-stock-list-header");
    if (!container) {
      return;
    }
    syncDrinkStockReportAction(drinkStocks);
    container.innerHTML = "";
    const rows = filteredDrinkStockItems(drinkStocks);
    if (!rows.length) {
      updateDrinkStockListSizing(listShell, []);
      if (listHeader) {
        listHeader.hidden = true;
      }
      container.innerHTML = `<p class="muted">No drink stock items found.</p>`;
      return;
    }
    const displayRows = aggregateDrinkStockRows(rows);
    updateDrinkStockListSizing(listShell, displayRows);
    if (listHeader) {
      listHeader.hidden = false;
    }
    displayRows.forEach(displayRow => {
      const { item, index, quantity, isGrouped } = displayRow;
      const row = document.createElement("section");
      row.className = "record-row drink-stock-row";
      row.innerHTML = `
        <div class="record-summary drink-stock-summary">
          <strong class="drink-stock-cell drink-stock-cell--name" data-label="Name">${escapeHtml(drinkStockDisplayName(item, index))}</strong>
          <span class="drink-stock-cell" data-label="Category">${escapeHtml(item.category || "Uncategorized")}</span>
          <span class="drink-stock-cell" data-label="${escapeAttribute(getStockUnitLabels(item).remainingLabel)}">${escapeHtml(isGrouped ? drinkStockGroupedCountText(quantity, item) : drinkStockRemainingText(item))}</span>
          <span class="drink-stock-cell" data-label="Stock">${escapeHtml(drinkStockStatusText(item))}</span>
          <span class="drink-stock-cell" data-label="Charter">${escapeHtml(drinkStockCharterText(item))}</span>
        </div>
        <div class="button-row record-actions">
          ${iconButtonHtml("edit", isGrouped ? "Edit drink stock group" : "Edit drink stock item", ` data-action="edit-stock"`)}
          ${iconButtonHtml("remove", isGrouped ? "Delete unopened drink stock group" : "Delete drink stock item", ` data-action="delete-stock"`)}
        </div>
      `;
      row.querySelector("[data-action='edit-stock']").addEventListener("click", () => {
        openDrinkStockModal(drinkStocks, item, index, isGrouped ? { group: displayRow } : {});
      });
      row.querySelector("[data-action='delete-stock']").addEventListener("click", async () => {
        const deleteCount = isGrouped ? quantity : 1;
        if (!await showAdminConfirm({
          title: "Delete Drink Stock",
          message: isGrouped
            ? `Delete all ${deleteCount} unopened ${getStockUnitLabels(item).plural} of ${item.name || "this drink stock item"}?`
            : `Delete ${item.name || "this drink stock item"}?`,
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          tone: "danger"
        })) {
          return;
        }
        if (isGrouped) {
          displayRow.indexes.slice().sort((left, right) => right - left).forEach(removeIndex => {
            drinkStocks.items.splice(removeIndex, 1);
          });
        } else {
          drinkStocks.items.splice(index, 1);
        }
        const saved = await saveDrinkStocks(drinkStocks, isGrouped ? "Drink stock group deleted." : "Drink stock item deleted.");
        if (saved) {
          drawDrinkStockRows(drinkStocks);
        }
      });
      container.appendChild(row);
    });
  }

  function bindDrinkStocksPanel(drinkStocks, charterInfo) {
    document.getElementById("add-drink-stock")?.addEventListener("click", () => {
      openDrinkStockModal(drinkStocks, null, null);
    });
    document.getElementById("drink-stock-report-action")?.addEventListener("click", async () => {
      if (!Array.isArray(drinkStocks?.items) || !drinkStocks.items.length) {
        return;
      }
      try {
        const previewData = await loadDrinkStockReportPreviewData();
        renderPreviewLightbox("Drink Stocks Inventory Report", renderDrinkStockReportPreview(drinkStocks, charterInfo, previewData), {
          department: "hotel",
          printable: true,
          showPrintOptions: false,
          printButtonLabel: "Print / Save PDF",
          extraStyles: drinkStockReportPreviewStyles()
        });
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    ["drink-stock-search", "drink-stock-sort", "drink-stock-category-filter", "drink-stock-sub-category-filter", "drink-stock-stock-filter", "drink-stock-charter-filter"].forEach(id => {
      const control = document.getElementById(id);
      if (control) {
        control.addEventListener("input", () => drawDrinkStockRows(drinkStocks));
        control.addEventListener("change", () => drawDrinkStockRows(drinkStocks));
      }
    });
    drawDrinkStockRows(drinkStocks);
  }

  function drinkStockCharterOptions(selectedId) {
    return [
      `<option value=""${selectedId ? "" : " selected"}>Available</option>`,
      `<option value="${INTERNAL_USE_ASSIGNMENT_ID}"${selectedId === INTERNAL_USE_ASSIGNMENT_ID ? " selected" : ""}>${INTERNAL_USE_ASSIGNMENT_LABEL}</option>`,
      ...state.charters
        .filter(charter => charter.id !== INTERNAL_USE_ASSIGNMENT_ID)
        .map(charter => `<option value="${escapeAttribute(charter.id)}"${charter.id === selectedId ? " selected" : ""}>${escapeHtml(charter.name || charter.id)}</option>`)
    ].join("");
  }

  function drinkStockCategoryOptions(selectedValue, drinkStocks) {
    const current = normalizeDrinkCategory(selectedValue);
    const categoryValues = getSuggestionList("drink_stock_category", { drinkStocks });
    const selectedKey = selectionValueKey(current);
    return [
      `<option value="">Select category...</option>`,
      ...categoryValues.map(category => `<option value="${escapeAttribute(category)}"${selectionValueKey(category) === selectedKey ? " selected" : ""}>${escapeHtml(category)}</option>`)
    ].join("");
  }

  function drinkStockRemainingOptions(selectedPercent) {
    const roundedPercent = roundDrinkStockRemainingPercent(selectedPercent);
    return DRINK_STOCK_REMAINING_OPTIONS
      .map(percent => `<option value="${percent}"${percent === roundedPercent ? " selected" : ""}>${percent}%</option>`)
      .join("");
  }

  function canUseDrinkStockTools() {
    return (state.role === "bridge" && state.department === "charter") || state.department === "hotel";
  }

  function drinkStockPickerOptions(options) {
    const source = options && typeof options === "object" ? options : {};
    return {
      title: source.title || "Select Drink",
      allowOutOfStock: source.allowOutOfStock !== false,
      categoryFilter: typeof source.categoryFilter === "string" ? source.categoryFilter : "",
      categoryFilters: Array.isArray(source.categoryFilters) ? source.categoryFilters.filter(value => typeof value === "string" && value.trim()).map(value => value.trim()) : [],
      charterFilter: source.charterFilter === "charter" || source.charterFilter === "available" || source.charterFilter === "internal" ? source.charterFilter : "",
      stockFilter: source.stockFilter === "in" || source.stockFilter === "out" ? source.stockFilter : "",
      requireInStock: Boolean(source.requireInStock),
      requireUnopened: Boolean(source.requireUnopened),
      multiSelect: Boolean(source.multiSelect),
      lockedFilters: Boolean(source.lockedFilters),
      potentiallyAvailableAlcohol: Boolean(source.potentiallyAvailableAlcohol),
      selectedCharterId: typeof source.selectedCharterId === "string" ? source.selectedCharterId : "",
      excludeStockIds: new Set(Array.isArray(source.excludeStockIds) ? source.excludeStockIds.map(value => String(value || "").trim()).filter(Boolean) : [])
    };
  }

  function availableAlcoholCategoryValues() {
    return DEFAULT_AVAILABLE_ALCOHOL_CATEGORIES.slice();
  }

  function availableAlcoholCategoryText(item) {
    const category = typeof item?.category === "string" ? item.category.trim() : "";
    return category || "Uncategorized";
  }

  function availableAlcoholSubCategoryKey(value) {
    return selectionValueKey(value);
  }

  function normalizeAvailableAlcoholSubCategoryLabel(value, category = "") {
    const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    if (!text) {
      return "";
    }
    const key = availableAlcoholSubCategoryKey(text);
    const normalizedCategory = normalizeDrinkCategory(category);
    if (key === "other") {
      return AVAILABLE_ALCOHOL_SUBCATEGORY_FALLBACK;
    }
    if (normalizedCategory === "Champagne") {
      if (key === "champagne") {
        return "Champagne";
      }
      if (key === "prosecco") {
        return "Prosecco";
      }
      if (key === "cava") {
        return "Cava";
      }
      if (key === "sparkling" || key === "sparkling-wine") {
        return "Sparkling";
      }
    }
    if (normalizedCategory === "Wine") {
      if (key === "red" || key === "red-wine") {
        return "Red Wine";
      }
      if (key === "white" || key === "white-wine") {
        return "White Wine";
      }
      if (key === "rose" || key === "rosie" || key === "rose-wine") {
        return "Rosé";
      }
      if (key === "champagne") {
        return "Champagne";
      }
      if (key === "prosecco") {
        return "Prosecco";
      }
      if (key === "cava") {
        return "Cava";
      }
      if (key === "dessert-wine") {
        return "Dessert Wine";
      }
    }
    if (normalizedCategory === "Spirits") {
      if (key === "gin") {
        return "Gin";
      }
      if (key === "vodka") {
        return "Vodka";
      }
      if (key === "white-rum") {
        return "White Rum";
      }
      if (key === "dark-rum") {
        return "Dark Rum";
      }
      if (key === "spiced-rum") {
        return "Spiced Rum";
      }
      if (key === "rum") {
        return "Rum";
      }
      if (key === "tequila") {
        return "Tequila";
      }
      if (key === "mezcal") {
        return "Mezcal";
      }
      if (["whisky", "whiskey", "bourbon", "scotch", "rye"].includes(key)) {
        return "Whisky";
      }
      if (key === "cognac") {
        return "Cognac";
      }
      if (key === "brandy") {
        return "Brandy";
      }
      if (key === "liqueur" || key === "coffee-liqueur") {
        return "Liqueur";
      }
      if (key === "vermouth" || key === "dry-vermouth") {
        return "Vermouth";
      }
      if (key === "absinthe") {
        return "Absinthe";
      }
    }
    if (normalizedCategory === "Beers") {
      if (key === "ipa") {
        return "IPA";
      }
      if (key === "lager") {
        return "Lager";
      }
      if (key === "pilsner") {
        return "Pilsner";
      }
      if (key === "stout") {
        return "Stout";
      }
      if (key === "porter") {
        return "Porter";
      }
      if (key === "ale") {
        return "Ale";
      }
      if (key === "wheat" || key === "wheat-beer") {
        return "Wheat Beer";
      }
      if (key === "cider") {
        return "Cider";
      }
      if (key === "sour") {
        return "Sour";
      }
    }
    return text;
  }

  function availableAlcoholInferenceText(...values) {
    return values
      .map(value => typeof value === "string" ? value.trim() : "")
      .filter(Boolean)
      .join(" ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function inferAvailableAlcoholSubCategoryFromText(text, category = "") {
    const normalizedText = typeof text === "string" ? text.trim() : "";
    const paddedText = ` ${normalizedText} `;
    const hasToken = token => paddedText.includes(` ${token} `);
    switch (normalizeDrinkCategory(category)) {
      case "Champagne":
        if (hasToken("prosecco")) {
          return "Prosecco";
        }
        if (hasToken("cava")) {
          return "Cava";
        }
        if (hasToken("sparkling")) {
          return "Sparkling";
        }
        return "Champagne";
      case "Wine":
        if (hasToken("prosecco")) {
          return "Prosecco";
        }
        if (hasToken("cava")) {
          return "Cava";
        }
        if (hasToken("champagne")) {
          return "Champagne";
        }
        if (hasToken("rose") || hasToken("rose wine") || hasToken("rosie")) {
          return "Rosé";
        }
        if (hasToken("dessert") || hasToken("sauternes") || hasToken("ice wine") || hasToken("icewine") || hasToken("port")) {
          return "Dessert Wine";
        }
        if ([
          "white",
          "sauvignon",
          "blanc",
          "chardonnay",
          "chablis",
          "riesling",
          "semillon",
          "viognier",
          "pinot grigio",
          "pinot gris",
          "albarino",
          "chenin"
        ].some(hasToken)) {
          return "White Wine";
        }
        if ([
          "red",
          "cabernet",
          "merlot",
          "pinot noir",
          "shiraz",
          "syrah",
          "malbec",
          "tempranillo",
          "sangiovese",
          "zinfandel",
          "grenache",
          "pomerol",
          "bordeaux"
        ].some(hasToken)) {
          return "Red Wine";
        }
        return AVAILABLE_ALCOHOL_SUBCATEGORY_FALLBACK;
      case "Spirits":
        if (hasToken("white rum")) {
          return "White Rum";
        }
        if (hasToken("dark rum")) {
          return "Dark Rum";
        }
        if (hasToken("spiced rum")) {
          return "Spiced Rum";
        }
        if (hasToken("gin")) {
          return "Gin";
        }
        if (hasToken("vodka")) {
          return "Vodka";
        }
        if (hasToken("rum")) {
          return "Rum";
        }
        if (hasToken("tequila")) {
          return "Tequila";
        }
        if (hasToken("mezcal")) {
          return "Mezcal";
        }
        if (hasToken("cognac")) {
          return "Cognac";
        }
        if (hasToken("brandy")) {
          return "Brandy";
        }
        if (hasToken("liqueur")) {
          return "Liqueur";
        }
        if (hasToken("vermouth")) {
          return "Vermouth";
        }
        if (hasToken("absinthe")) {
          return "Absinthe";
        }
        if (["whisky", "whiskey", "bourbon", "scotch", "rye"].some(hasToken)) {
          return "Whisky";
        }
        return AVAILABLE_ALCOHOL_SUBCATEGORY_FALLBACK;
      case "Beers":
        if (hasToken("ipa")) {
          return "IPA";
        }
        if (hasToken("lager")) {
          return "Lager";
        }
        if (hasToken("pilsner")) {
          return "Pilsner";
        }
        if (hasToken("stout")) {
          return "Stout";
        }
        if (hasToken("porter")) {
          return "Porter";
        }
        if (hasToken("ale")) {
          return "Ale";
        }
        if (hasToken("wheat beer") || hasToken("wheat")) {
          return "Wheat Beer";
        }
        if (hasToken("cider")) {
          return "Cider";
        }
        if (hasToken("sour")) {
          return "Sour";
        }
        return AVAILABLE_ALCOHOL_SUBCATEGORY_FALLBACK;
      case "Other":
        return AVAILABLE_ALCOHOL_SUBCATEGORY_FALLBACK;
      default:
        return AVAILABLE_ALCOHOL_SUBCATEGORY_FALLBACK;
    }
  }

  function deriveAvailableAlcoholSubCategory(item, fallbackItem = null) {
    const source = item && typeof item === "object" ? item : {};
    const fallback = fallbackItem && typeof fallbackItem === "object" ? fallbackItem : {};
    const category = normalizeDrinkCategory(source.category || fallback.category, source.stock_type || fallback.stock_type);
    const explicit = normalizeAvailableAlcoholSubCategoryLabel(source.sub_category, category)
      || normalizeAvailableAlcoholSubCategoryLabel(fallback.sub_category, category);
    if (explicit) {
      return explicit;
    }
    return inferAvailableAlcoholSubCategoryFromText(availableAlcoholInferenceText(
      source.category,
      source.stock_type,
      source.name,
      source.variant,
      source.expression,
      source.age,
      source.description,
      source.display_name,
      source.label,
      source.brand,
      fallback.category,
      fallback.stock_type,
      fallback.name,
      fallback.variant,
      fallback.expression,
      fallback.age,
      fallback.description,
      fallback.display_name,
      fallback.label,
      fallback.brand
    ), category);
  }

  function availableAlcoholSubCategoryText(item, fallbackItem = null) {
    return deriveAvailableAlcoholSubCategory(item, fallbackItem);
  }

  function meaningfulAvailableAlcoholVariant(value) {
    const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    const key = text.toLocaleLowerCase().replace(/[\s.\/-]+/g, "");
    return text && !["na", "n/a", "none", "notapplicable"].includes(key) ? text : "";
  }

  function meaningfulAvailableAlcoholDescription(value) {
    const text = typeof value === "string" ? value.trim() : "";
    const key = text.toLocaleLowerCase().replace(/[\s.\/-]+/g, "");
    return text && !["na", "n/a", "none", "notapplicable"].includes(key) ? text : "";
  }

  function availableAlcoholNameKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function availableAlcoholVariantText(item) {
    const source = item && typeof item === "object" ? item : {};
    return meaningfulAvailableAlcoholVariant(source.variant)
      || meaningfulAvailableAlcoholVariant(source.expression)
      || meaningfulAvailableAlcoholVariant(source.age);
  }

  function availableAlcoholAggregationKey(item, stock, index) {
    const source = item && typeof item === "object" ? item : {};
    const stockSource = stock && typeof stock === "object" ? stock : {};
    const aggregateKey = stockSource && stockSource.opened === false ? drinkStockAggregationKey(stockSource) : "";
    return aggregateKey ? `stock:${aggregateKey}` : `item:${source.stock_id || index}`;
  }

  function availableAlcoholResolvedDisplayPrice(item, fallbackItem = null) {
    const source = item && typeof item === "object" ? item : {};
    const fallbackSource = fallbackItem && typeof fallbackItem === "object" ? fallbackItem : {};
    return normalizeAvailableAlcoholPrice(source.price_per_bottle)
      ?? normalizeAvailableAlcoholPrice(fallbackSource.price_per_bottle);
  }

  function availableAlcoholResolvedDisplayCurrency(item, fallbackItem = null) {
    const source = item && typeof item === "object" ? item : {};
    const fallbackSource = fallbackItem && typeof fallbackItem === "object" ? fallbackItem : {};
    const directPrice = normalizeAvailableAlcoholPrice(source.price_per_bottle);
    if (directPrice !== null) {
      return source.currency === "USD" ? "USD" : "PHP";
    }
    const fallbackPrice = normalizeAvailableAlcoholPrice(fallbackSource.price_per_bottle);
    if (fallbackPrice !== null) {
      return fallbackSource.currency === "USD" ? "USD" : "PHP";
    }
    return source.currency === "USD"
      ? "USD"
      : (fallbackSource.currency === "USD" ? "USD" : "PHP");
  }

  function availableAlcoholDisplayItem(item, stock, fallbackItem = null) {
    const source = item && typeof item === "object" ? item : {};
    const stockSource = stock && typeof stock === "object" ? stock : {};
    const fallbackSource = fallbackItem && typeof fallbackItem === "object" ? fallbackItem : {};
    return {
      ...fallbackSource,
      ...source,
      variant: availableAlcoholVariantText(source) || availableAlcoholVariantText(stockSource),
      sub_category: availableAlcoholSubCategoryText(source, stockSource),
      price_per_bottle: availableAlcoholResolvedDisplayPrice(source, fallbackSource),
      currency: availableAlcoholResolvedDisplayCurrency(source, fallbackSource)
    };
  }

  function formatAvailableAlcoholName(item, fallback = "Selection") {
    const source = item && typeof item === "object" ? item : {};
    const name = typeof source.name === "string" && source.name.trim()
      ? source.name.trim()
      : (typeof source.display_name === "string" && source.display_name.trim()
        ? source.display_name.trim()
        : (typeof source.label === "string" && source.label.trim() ? source.label.trim() : fallback));
    const variant = availableAlcoholVariantText(source);
    if (!variant) {
      return name;
    }
    const nameKey = availableAlcoholNameKey(name);
    const variantKey = availableAlcoholNameKey(variant);
    return variantKey && nameKey.includes(variantKey) ? name : `${name} - ${variant}`;
  }

  function availableAlcoholCategoryRank(category) {
    const key = selectionValueKey(category);
    const categories = availableAlcoholCategoryValues();
    const index = categories.findIndex(value => selectionValueKey(value) === key);
    return index >= 0 ? index : Number.POSITIVE_INFINITY;
  }

  function compareAvailableAlcoholCategory(leftCategory, rightCategory) {
    const leftText = String(leftCategory || "").trim() || "Uncategorized";
    const rightText = String(rightCategory || "").trim() || "Uncategorized";
    const leftRank = availableAlcoholCategoryRank(leftText);
    const rightRank = availableAlcoholCategoryRank(rightText);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    if (Number.isFinite(leftRank)) {
      return 0;
    }
    return leftText.localeCompare(rightText, undefined, { sensitivity: "base" });
  }

  function compareAvailableAlcoholSubCategory(left, right) {
    return availableAlcoholSubCategoryText(left).localeCompare(
      availableAlcoholSubCategoryText(right),
      undefined,
      { sensitivity: "base" }
    );
  }

  function compareAvailableAlcoholItem(left, right) {
    const categoryCompare = compareAvailableAlcoholCategory(left && left.category, right && right.category);
    if (categoryCompare) {
      return categoryCompare;
    }
    const subCategoryCompare = compareAvailableAlcoholSubCategory(left, right);
    if (subCategoryCompare) {
      return subCategoryCompare;
    }
    const leftPrice = normalizeAvailableAlcoholPrice(left && left.price_per_bottle);
    const rightPrice = normalizeAvailableAlcoholPrice(right && right.price_per_bottle);
    const leftSortPrice = leftPrice === null ? Number.NEGATIVE_INFINITY : leftPrice;
    const rightSortPrice = rightPrice === null ? Number.NEGATIVE_INFINITY : rightPrice;
    if (leftSortPrice !== rightSortPrice) {
      return rightSortPrice - leftSortPrice;
    }
    return formatAvailableAlcoholName(left || {}).localeCompare(formatAvailableAlcoholName(right || {}), undefined, { sensitivity: "base" });
  }

  function availableAlcoholColumnWidthCh(values, min, max) {
    const longest = (Array.isArray(values) ? values : [])
      .map(value => String(value || "").trim().length)
      .reduce((result, length) => Math.max(result, length), 0);
    return Math.min(Math.max(longest + 1, min), max);
  }

  function updateAvailableAlcoholListSizing(listShell, displayRows) {
    if (!listShell) {
      return;
    }
    const rows = Array.isArray(displayRows) ? displayRows : [];
    if (!rows.length) {
      [
        "--available-alcohol-name-width",
        "--available-alcohol-category-width",
        "--available-alcohol-quantity-width",
        "--available-alcohol-price-width"
      ].forEach(property => listShell.style.removeProperty(property));
      return;
    }
    listShell.style.setProperty("--available-alcohol-name-width", `${availableAlcoholColumnWidthCh(rows.map(({ display_item, item, index }) => formatAvailableAlcoholName(display_item || item, `Drink ${index + 1}`)).concat("Name"), 16, 34)}ch`);
    listShell.style.setProperty("--available-alcohol-category-width", `${availableAlcoholColumnWidthCh(rows.map(({ display_item, item }) => availableAlcoholCategoryText(display_item || item)).concat("Category"), 10, 24)}ch`);
    listShell.style.setProperty("--available-alcohol-quantity-width", `${availableAlcoholColumnWidthCh(rows.map(({ item, quantity }) => quantity > 1 ? drinkStockBottleCountText(quantity, item) : "").concat("Quantity"), 8, 18)}ch`);
    listShell.style.setProperty("--available-alcohol-price-width", `${availableAlcoholColumnWidthCh(rows.map(({ display_item, item }) => {
      const source = display_item || item;
      return `${availableAlcoholPriceInputValue(source?.price_per_bottle) || "POR"} ${source?.currency === "USD" ? "USD" : "PHP"}`;
    }).concat("Price"), 25, 32)}ch`);
  }

  function normalizeAvailableAlcoholPrice(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      return null;
    }
    return Math.min(Math.trunc(number), AVAILABLE_ALCOHOL_MAX_PRICE);
  }

  function availableAlcoholPriceInputValue(value) {
    const price = normalizeAvailableAlcoholPrice(value);
    return price === null ? "" : String(price);
  }

  function sanitizeAvailableAlcoholPriceInput(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 6);
  }

  function stockCategoryInAvailableAlcoholList(item) {
    const itemKey = selectionValueKey(item && item.category);
    return availableAlcoholCategoryValues().some(category => selectionValueKey(category) === itemKey);
  }

  function stockUsesAvailableAlcoholAssignment(item) {
    if (!item || isInternalUseDrinkStock(item)) {
      return false;
    }
    const assignmentKeys = [
      item.assignment,
      item.assignment_label,
      item.charter_id,
      item.charter
    ]
      .map(selectionValueKey)
      .filter(Boolean);
    const hasNonGlobalAssignment = assignmentKeys.some(key => !AVAILABLE_ALCOHOL_GLOBAL_ASSIGNMENT_KEYS.has(key));
    if (item.charter_specific && hasNonGlobalAssignment) {
      return false;
    }
    if (assignmentKeys.some(key => AVAILABLE_ALCOHOL_GLOBAL_ASSIGNMENT_KEYS.has(key))) {
      return true;
    }
    if (item.charter_specific) {
      return false;
    }
    return !hasNonGlobalAssignment;
  }

  function stockIsEligibleForAvailableAlcohol(item) {
    return Boolean(item
      && drinkStockIsAvailableForPurchase(item)
      && item.opened !== true
      && stockCategoryInAvailableAlcoholList(item)
      && stockUsesAvailableAlcoholAssignment(item));
  }

  function stockIsPotentiallyAvailableAlcohol(item, pickerOptions) {
    return Boolean(item
      && stockIsEligibleForAvailableAlcohol(item)
      && !(pickerOptions.excludeStockIds && pickerOptions.excludeStockIds.has(item.id)));
  }

  function drinkStockPickerVisibleRows(drinkStocks, picker) {
    const search = String(picker.querySelector("[data-picker-search]")?.value || "").trim().toLocaleLowerCase();
    const sort = picker.querySelector("[data-picker-sort]")?.value || "name";
    const category = picker.querySelector("[data-picker-category]")?.value || "";
    const stock = picker.querySelector("[data-picker-stock]")?.value || "";
    const charter = picker.querySelector("[data-picker-charter]")?.value || "";
    return drinkStocks.items
      .filter(item => {
        if (picker._pickerOptions.potentiallyAvailableAlcohol && !stockIsPotentiallyAvailableAlcohol(item, picker._pickerOptions)) {
          return false;
        }
        if (picker._pickerOptions.requireInStock && !item.in_stock) {
          return false;
        }
        if (!picker._pickerOptions.allowOutOfStock && !item.in_stock) {
          return false;
        }
        if (picker._pickerOptions.requireUnopened && item.opened) {
          return false;
        }
        if (picker._pickerOptions.categoryFilter && item.category !== picker._pickerOptions.categoryFilter) {
          return false;
        }
        if (picker._pickerOptions.categoryFilters.length && !picker._pickerOptions.categoryFilters.some(value => selectionValueKey(value) === selectionValueKey(item.category))) {
          return false;
        }
        const searchText = [item.name, item.variant, item.category, drinkStockStatusText(item), drinkStockCharterText(item)]
          .join(" ")
          .toLocaleLowerCase();
        if (search && !searchText.includes(search)) {
          return false;
        }
        if (category && item.category !== category) {
          return false;
        }
        if (stock === "in" && !item.in_stock) {
          return false;
        }
        if (stock === "out" && item.in_stock) {
          return false;
        }
        if (charter === "charter" && (!item.charter_specific || isInternalUseDrinkStock(item))) {
          return false;
        }
        if (charter === "internal" && !isInternalUseDrinkStock(item)) {
          return false;
        }
        if (charter === "available" && item.charter_specific) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === "newest") {
          return String(b.date_added || "").localeCompare(String(a.date_added || "")) || a.name.localeCompare(b.name);
        }
        if (sort === "oldest") {
          return String(a.date_added || "").localeCompare(String(b.date_added || "")) || a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
  }

  function drinkStockPickerDisplayName(item) {
    const name = item && item.name ? item.name : "Drink";
    return item && item.variant ? `${name} - ${item.variant}` : name;
  }

  function updateAvailableAlcoholPickerSizing(picker, rows) {
    const shell = picker.querySelector("[data-picker-list-shell]");
    if (!shell) {
      return;
    }
    const visibleRows = Array.isArray(rows) ? rows : [];
    if (!visibleRows.length) {
      [
        "--drink-stock-picker-name-width",
        "--drink-stock-picker-category-width",
        "--drink-stock-picker-charter-width"
      ].forEach(property => shell.style.removeProperty(property));
      return;
    }
    shell.style.setProperty("--drink-stock-picker-name-width", `${drinkStockColumnWidthCh(visibleRows.map(drinkStockPickerDisplayName).concat("Name"), 16, 34)}ch`);
    shell.style.setProperty("--drink-stock-picker-category-width", `${drinkStockColumnWidthCh(visibleRows.map(item => item.category || "Uncategorized").concat("Category"), 10, 20)}ch`);
    shell.style.setProperty("--drink-stock-picker-charter-width", `${drinkStockColumnWidthCh(visibleRows.map(drinkStockCharterText).concat("Charter"), 12, 24)}ch`);
  }

  function syncDrinkStockPickerSelectAll(picker, rows) {
    const selectAll = picker.querySelector("[data-picker-select-all]");
    if (!selectAll) {
      return;
    }
    const visibleRows = Array.isArray(rows) ? rows.filter(item => item && item.id) : [];
    const selectedIds = picker._pickerSelectedIds || new Set();
    const selectedCount = visibleRows.filter(item => selectedIds.has(item.id)).length;
    selectAll.disabled = visibleRows.length === 0;
    selectAll.checked = visibleRows.length > 0 && selectedCount === visibleRows.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < visibleRows.length;

    const count = picker.querySelector("[data-picker-select-all-count]");
    if (count) {
      count.textContent = visibleRows.length
        ? `${selectedCount} of ${visibleRows.length} shown selected`
        : "No drinks shown";
    }
  }

  function drawDrinkStockPickerRows(picker, drinkStocks, resolveSelection, highlightId = "") {
    const container = picker.querySelector("[data-picker-list]");
    const listHeader = picker.querySelector("[data-picker-list-header]");
    const useAvailableAlcoholLayout = Boolean(picker._pickerOptions?.potentiallyAvailableAlcohol);
    if (!container) {
      return;
    }
    container.innerHTML = "";
    const rows = drinkStockPickerVisibleRows(drinkStocks, picker);
    if (!rows.length) {
      if (useAvailableAlcoholLayout) {
        updateAvailableAlcoholPickerSizing(picker, []);
      }
      if (listHeader) {
        listHeader.hidden = true;
      }
      container.innerHTML = `<p class="muted">No drink stock items found.</p>`;
      syncDrinkStockPickerSelectAll(picker, rows);
      return;
    }
    if (useAvailableAlcoholLayout) {
      updateAvailableAlcoholPickerSizing(picker, rows);
    }
    if (listHeader) {
      listHeader.hidden = !useAvailableAlcoholLayout;
    }
    const multiSelect = Boolean(picker._pickerOptions.multiSelect);
    const selectedIds = picker._pickerSelectedIds || new Set();
    rows.forEach(item => {
      const selected = selectedIds.has(item.id);
      const row = document.createElement("section");
      row.className = `record-row drink-stock-picker-row${useAvailableAlcoholLayout ? " drink-stock-picker-row--available-alcohol" : ""}${item.in_stock ? "" : " out-of-stock"}${(highlightId && item.id === highlightId) || selected ? " selected" : ""}`;
      row.innerHTML = useAvailableAlcoholLayout ? `
        ${multiSelect ? `
          <label class="drink-stock-picker-check">
            <input type="checkbox" data-picker-check value="${escapeAttribute(item.id)}"${selected ? " checked" : ""} aria-label="Select ${escapeAttribute(drinkStockPickerDisplayName(item))}">
          </label>
        ` : ""}
        <div class="record-summary drink-stock-picker-summary">
          <strong class="drink-stock-picker-cell drink-stock-picker-name-cell" data-label="Name">${escapeHtml(drinkStockPickerDisplayName(item))}</strong>
          <span class="drink-stock-picker-cell" data-label="Category">${escapeHtml(item.category || "Uncategorized")}</span>
          <span class="drink-stock-picker-cell" data-label="Charter">${escapeHtml(drinkStockCharterText(item))}</span>
        </div>
        ${multiSelect ? "" : `
          <div class="button-row record-actions">
            ${iconButtonHtml("confirm", `Select ${drinkStockPickerDisplayName(item)}`, ` data-picker-select`)}
          </div>
        `}
      ` : `
        ${multiSelect ? `
          <label class="drink-stock-picker-check">
            <input type="checkbox" data-picker-check value="${escapeAttribute(item.id)}"${selected ? " checked" : ""} aria-label="Select ${escapeAttribute(item.name)}">
          </label>
        ` : ""}
        <div class="record-summary drink-stock-picker-summary">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.category || "Uncategorized")}</span>
          <span>${escapeHtml(drinkStockStatusText(item))}</span>
          <span>${escapeHtml(drinkStockCharterText(item))}</span>
        </div>
        ${multiSelect ? "" : `
          <div class="button-row record-actions">
            ${iconButtonHtml("confirm", `Select ${item.name}`, ` data-picker-select`)}
          </div>
        `}
      `;
      if (multiSelect) {
        const checkbox = row.querySelector("[data-picker-check]");
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            selectedIds.add(item.id);
          } else {
            selectedIds.delete(item.id);
          }
          row.classList.toggle("selected", checkbox.checked);
          syncDrinkStockPickerSelectAll(picker, rows);
        });
        row.addEventListener("click", event => {
          if (event.target === checkbox || event.target.closest("button, a, input, select, textarea")) {
            return;
          }
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        });
      } else {
        row.querySelector("[data-picker-select]").addEventListener("click", () => {
          markModalSaved(picker);
          picker._pickerCancelHandler = null;
          resolveSelection(cloneData(item));
          closeDialogModal();
        });
      }
      container.appendChild(row);
    });
    syncDrinkStockPickerSelectAll(picker, rows);
  }

  async function openDrinkStockPicker(options = {}) {
    if (!canUseDrinkStockTools()) {
      setStatus("Drink stock picker is not available for this department.", "error");
      return null;
    }
    let drinkStocks;
    try {
      drinkStocks = await loadDrinkStocks();
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
    const pickerOptions = drinkStockPickerOptions(options);
    const categories = DRINK_STOCK_CATEGORIES.slice();
    return new Promise(resolve => {
      let resolved = false;
      const finish = value => {
        if (resolved) {
          return;
        }
        resolved = true;
        resolve(value || null);
      };
      const headerActionsHtml = pickerOptions.multiSelect
        ? `<div class="button-row modal-title-actions">${iconButtonHtml("confirm", "Confirm selected drink stock items", ` id="picker-confirm-selection"`)}${iconButtonHtml("cancel", "Cancel", ` data-modal-close`)}</div>`
        : `<div class="button-row modal-title-actions">${iconButtonHtml("cancel", "Cancel", ` data-modal-close`)}</div>`;
      const modal = openDialogModal(pickerOptions.title, `
        <div class="drink-stock-picker">
          <div class="drink-stock-picker-actions">
            ${iconButtonHtml("add", "Add New Stock Item", ` id="picker-add-drink-stock"`)}
          </div>
          <div class="drink-stock-controls${pickerOptions.lockedFilters ? " drink-stock-controls--locked" : ""}">
            <label>Search
              <input data-picker-search type="search" placeholder="Search stocks">
            </label>
            <label>Sort
              <select data-picker-sort>
                <option value="name">Name A-Z</option>
                <option value="newest">Date Added newest</option>
                <option value="oldest">Date Added oldest</option>
              </select>
            </label>
            ${pickerOptions.lockedFilters ? "" : `
            <label>Category
              <select data-picker-category>
                <option value="">All</option>
                ${categories.map(category => `<option value="${escapeAttribute(category)}"${category === pickerOptions.categoryFilter ? " selected" : ""}>${escapeHtml(category)}</option>`).join("")}
              </select>
            </label>
            <label>Stock
              <select data-picker-stock>
                <option value=""${!pickerOptions.requireInStock && !pickerOptions.stockFilter ? " selected" : ""}>All</option>
                <option value="in"${pickerOptions.requireInStock || pickerOptions.stockFilter === "in" ? " selected" : ""}>In Stock</option>
                <option value="out"${pickerOptions.stockFilter === "out" ? " selected" : ""}${pickerOptions.requireInStock ? " disabled" : ""}>Out of Stock</option>
              </select>
            </label>
            <label>Charter
              <select data-picker-charter>
                <option value="">All</option>
                <option value="charter"${pickerOptions.charterFilter === "charter" ? " selected" : ""}>Charter Specific</option>
                <option value="internal"${pickerOptions.charterFilter === "internal" ? " selected" : ""}>Internal Use</option>
                <option value="available"${pickerOptions.charterFilter === "available" ? " selected" : ""}>Available</option>
              </select>
            </label>
            `}
          </div>
          ${pickerOptions.potentiallyAvailableAlcohol && pickerOptions.multiSelect ? `
            <div class="drink-stock-picker-select-all-row">
              <label class="inline-check drink-stock-picker-select-all">
                <input type="checkbox" data-picker-select-all>
                Select all shown
              </label>
              <span class="muted" data-picker-select-all-count></span>
            </div>
          ` : ""}
          <div data-picker-list-shell class="drink-stock-picker-list-shell${pickerOptions.potentiallyAvailableAlcohol ? " drink-stock-picker-list-shell--available-alcohol" : ""}">
            ${pickerOptions.potentiallyAvailableAlcohol ? `
              <div data-picker-list-header class="drink-stock-picker-list-header record-row drink-stock-picker-row drink-stock-picker-row--available-alcohol" hidden>
                <span class="drink-stock-picker-list-header-spacer" aria-hidden="true"></span>
                <span>Name</span>
                <span>Category</span>
                <span>Charter</span>
              </div>
            ` : ""}
            <div data-picker-list class="editor-list drink-stock-picker-list"></div>
          </div>
        </div>
      `, {
        cardClass: "modal-wide modal-drink-stock-picker",
        hideClose: true,
        headerActionsHtml
      });
      modal._pickerOptions = pickerOptions;
      modal._pickerSelectedIds = new Set();
      modal._skipUnsavedWarning = true;
      modal._pickerCancelHandler = () => finish(null);
      const closeButton = modal.querySelector("[data-modal-close]");
      if (closeButton) {
        closeButton.addEventListener("click", () => finish(null), { once: true });
      }
      const confirmButton = modal.querySelector("#picker-confirm-selection");
      if (confirmButton) {
        confirmButton.addEventListener("click", () => {
          const selected = drinkStocks.items
            .filter(item => item && modal._pickerSelectedIds.has(item.id))
            .map(item => cloneData(item));
          markModalSaved(modal);
          modal._pickerCancelHandler = null;
          finish(selected);
          closeDialogModal();
        });
      }
      modal.querySelector("[data-picker-select-all]")?.addEventListener("change", event => {
        const rows = drinkStockPickerVisibleRows(drinkStocks, modal);
        const selectedIds = modal._pickerSelectedIds || new Set();
        rows.forEach(item => {
          if (!item || !item.id) {
            return;
          }
          if (event.target.checked) {
            selectedIds.add(item.id);
          } else {
            selectedIds.delete(item.id);
          }
        });
        modal._pickerSelectedIds = selectedIds;
        drawDrinkStockPickerRows(modal, drinkStocks, finish);
      });
      modal.querySelectorAll("[data-picker-search], [data-picker-sort], [data-picker-category], [data-picker-stock], [data-picker-charter]").forEach(control => {
        control.addEventListener("input", () => drawDrinkStockPickerRows(modal, drinkStocks, finish));
        control.addEventListener("change", () => drawDrinkStockPickerRows(modal, drinkStocks, finish));
      });
      modal.querySelector("#picker-add-drink-stock")?.addEventListener("click", () => {
        openDrinkStockModal(drinkStocks, null, null, {
          stacked: true,
          onSaved: (savedItem, savedStocks) => {
            drinkStocks = savedStocks;
            drawDrinkStockPickerRows(modal, drinkStocks, finish, savedItem && savedItem.id);
          }
        });
      });
      drawDrinkStockPickerRows(modal, drinkStocks, finish);
    });
  }

  const DRINK_STOCK_GROUP_SHARED_FIELDS = Object.freeze([
    "name",
    "variant",
    "description",
    "category",
    "sub_category",
    "charter_specific",
    "charter_id",
    "charter"
  ]);

  function drinkStockFieldValue(value) {
    return value === undefined ? null : value;
  }

  function changedDrinkStockGroupFields(draft, nextItem) {
    return DRINK_STOCK_GROUP_SHARED_FIELDS.filter(field => (
      JSON.stringify(drinkStockFieldValue(draft[field])) !== JSON.stringify(drinkStockFieldValue(nextItem[field]))
    ));
  }

  function applyChangedDrinkStockGroupFields(item, nextItem, changedFields) {
    const updated = { ...item };
    changedFields.forEach(field => {
      updated[field] = nextItem[field];
    });
    return updated;
  }

  function drinkStockProductIdentityKey(item) {
    const source = item && typeof item === "object" ? item : {};
    const productName = source.name || source.display_name || source.label || "";
    const variant = source.variant || source.expression || source.age || "";
    if (!normalizeDrinkStockAggregationPart(productName)) {
      return "";
    }
    return [
      normalizeDrinkCategory(source.category),
      source.brand,
      productName,
      variant
    ]
      .map(normalizeDrinkStockAggregationPart)
      .filter(Boolean)
      .join("|");
  }

  function drinkStockAssignmentKey(item) {
    return item && item.charter_specific ? `charter:${item.charter_id || ""}` : "available";
  }

  function matchingUnopenedDrinkStockIndexes(drinkStocks, sourceItem) {
    const identityKey = drinkStockProductIdentityKey(sourceItem);
    const assignmentKey = drinkStockAssignmentKey(sourceItem);
    if (!identityKey) {
      return [];
    }
    return (Array.isArray(drinkStocks && drinkStocks.items) ? drinkStocks.items : [])
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item && !item.opened)
      .filter(({ item }) => drinkStockProductIdentityKey(item) === identityKey)
      .filter(({ item }) => drinkStockAssignmentKey(item) === assignmentKey)
      .map(({ index }) => index);
  }

  function drinkStockQuantityContext(drinkStocks, index) {
    if (!Number.isInteger(index) || !drinkStocks.items[index] || drinkStocks.items[index].opened) {
      return null;
    }
    const indexes = matchingUnopenedDrinkStockIndexes(drinkStocks, drinkStocks.items[index]);
    if (!indexes.includes(index)) {
      indexes.unshift(index);
    }
    const uniqueIndexes = [...new Set(indexes)]
      .filter(candidateIndex => Number.isInteger(candidateIndex) && drinkStocks.items[candidateIndex] && !drinkStocks.items[candidateIndex].opened);
    const activeIndexes = uniqueIndexes.filter(candidateIndex => drinkStocks.items[candidateIndex].in_stock);
    return {
      indexes: uniqueIndexes,
      activeIndexes,
      quantity: activeIndexes.length,
      representativeIndex: index
    };
  }

  function drinkStockQuantitySummaryText(quantity, item) {
    const count = Math.max(0, Math.trunc(Number(quantity) || 0));
    const labels = getStockUnitLabels(item);
    return labels.isBeer ? `${count} ${labels.plural} in stock` : `${count} in stock`;
  }

  function drinkStockRemovalTimestamp(item) {
    const parsed = Date.parse(item && (item.created_at || item.date_added) || "");
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  }

  function drinkStockRemovalCandidates(drinkStocks, indexes, keepIndex) {
    return indexes
      .filter(index => index !== keepIndex)
      .map(index => ({ index, item: drinkStocks.items[index] }))
      .sort((left, right) => {
        const timeCompare = drinkStockRemovalTimestamp(right.item) - drinkStockRemovalTimestamp(left.item);
        if (timeCompare) {
          return timeCompare;
        }
        const idCompare = String(right.item?.id || "").localeCompare(String(left.item?.id || ""), undefined, {
          numeric: true,
          sensitivity: "base"
        });
        if (idCompare) {
          return idCompare;
        }
        // If creation/id ordering is inconclusive, remove records from the end of the current matching group.
        return right.index - left.index;
      });
  }

  function addDrinkStockBottleClone(drinkStocks, sourceItem) {
    const usedIds = new Set(drinkStocks.items.map(item => slugify(item && item.id)).filter(Boolean));
    const remainingStyle = sourceItem && sourceItem.remaining_style
      ? sourceItem.remaining_style
      : detectDrinkStockRemainingStyle(sourceItem && sourceItem.remaining);
    const clone = normalizeDrinkStockItem({
      ...sourceItem,
      id: uniqueDrinkStockId(drinkStockBaseIdText(sourceItem), usedIds),
      opened: false,
      remaining: serializeDrinkStockRemainingPercent(100, remainingStyle),
      in_stock: true,
      date_added: sourceItem.date_added || todayInputDate()
    });
    drinkStocks.items.push(clone);
    return clone;
  }

  function addDrinkStockZeroReference(drinkStocks, sourceItem) {
    const usedIds = new Set(drinkStocks.items.map(item => slugify(item && item.id)).filter(Boolean));
    const remainingStyle = sourceItem && sourceItem.remaining_style
      ? sourceItem.remaining_style
      : detectDrinkStockRemainingStyle(sourceItem && sourceItem.remaining);
    const reference = normalizeDrinkStockItem({
      ...sourceItem,
      id: uniqueDrinkStockId(drinkStockBaseIdText(sourceItem), usedIds),
      opened: false,
      remaining: serializeDrinkStockRemainingPercent(0, remainingStyle),
      in_stock: false,
      date_added: sourceItem.date_added || todayInputDate()
    });
    drinkStocks.items.push(reference);
    return reference;
  }

  function removeDrinkStockIndexes(drinkStocks, indexes) {
    [...new Set(indexes)]
      .filter(index => Number.isInteger(index) && drinkStocks.items[index])
      .sort((left, right) => right - left)
      .forEach(index => {
        drinkStocks.items.splice(index, 1);
      });
  }

  function updateUnopenedDrinkStockRecord(existing, nextItem, changedFields, inStock, options = {}) {
    const changed = applyChangedDrinkStockGroupFields(existing, nextItem, changedFields);
    const remainingStyle = nextItem && nextItem.remaining_style
      ? nextItem.remaining_style
      : detectDrinkStockRemainingStyle(nextItem && nextItem.remaining);
    return normalizeDrinkStockItem({
      ...changed,
      id: existing.id,
      date_added: options.useNextDate ? nextItem.date_added : (existing.date_added || nextItem.date_added),
      opened: false,
      remaining: serializeDrinkStockRemainingPercent(inStock ? 100 : 0, remainingStyle),
      in_stock: Boolean(inStock)
    });
  }

  function reconcileUnopenedDrinkStockQuantity(drinkStocks, context, draft, nextItem, targetQuantity, options = {}) {
    const keepZeroReference = options.keepZeroReference !== false;
    const desiredQuantity = Math.max(0, Math.trunc(Number(targetQuantity) || 0));
    const indexes = context
      ? [...new Set(context.indexes)].filter(candidateIndex => Number.isInteger(candidateIndex) && drinkStocks.items[candidateIndex] && !drinkStocks.items[candidateIndex].opened)
      : [];
    const representativeIndex = context && indexes.includes(context.representativeIndex)
      ? context.representativeIndex
      : indexes[0];
    const changedFields = changedDrinkStockGroupFields(draft, nextItem);

    if (desiredQuantity === 0) {
      if (!keepZeroReference) {
        removeDrinkStockIndexes(drinkStocks, indexes);
        return;
      }
      if (Number.isInteger(representativeIndex) && drinkStocks.items[representativeIndex]) {
        drinkStocks.items[representativeIndex] = updateUnopenedDrinkStockRecord(
          drinkStocks.items[representativeIndex],
          nextItem,
          changedFields,
          false,
          { useNextDate: true }
        );
        removeDrinkStockIndexes(drinkStocks, indexes.filter(candidateIndex => candidateIndex !== representativeIndex));
        return;
      }
      addDrinkStockZeroReference(drinkStocks, nextItem);
      return;
    }

    const activeIndexes = indexes.filter(candidateIndex => drinkStocks.items[candidateIndex]?.in_stock);
    const inactiveIndexes = indexes.filter(candidateIndex => !drinkStocks.items[candidateIndex]?.in_stock);
    const keepIndexes = new Set();

    if (Number.isInteger(representativeIndex) && drinkStocks.items[representativeIndex]) {
      keepIndexes.add(representativeIndex);
    }

    const removableActiveIndexes = activeIndexes.filter(candidateIndex => !keepIndexes.has(candidateIndex));
    const activeKeepSlots = Math.max(0, desiredQuantity - keepIndexes.size);
    const removeActiveCount = Math.max(0, removableActiveIndexes.length - activeKeepSlots);
    const removeActiveIndexes = new Set(
      drinkStockRemovalCandidates(drinkStocks, removableActiveIndexes, null)
        .slice(0, removeActiveCount)
        .map(candidate => candidate.index)
    );

    activeIndexes.forEach(candidateIndex => {
      if (!removeActiveIndexes.has(candidateIndex)) {
        keepIndexes.add(candidateIndex);
      }
    });

    inactiveIndexes.forEach(candidateIndex => {
      if (keepIndexes.size < desiredQuantity) {
        keepIndexes.add(candidateIndex);
      }
    });

    keepIndexes.forEach(candidateIndex => {
      if (drinkStocks.items[candidateIndex]) {
        drinkStocks.items[candidateIndex] = updateUnopenedDrinkStockRecord(
          drinkStocks.items[candidateIndex],
          nextItem,
          changedFields,
          true,
          { useNextDate: candidateIndex === representativeIndex }
        );
      }
    });

    removeDrinkStockIndexes(drinkStocks, indexes.filter(candidateIndex => !keepIndexes.has(candidateIndex)));

    const cloneSource = normalizeDrinkStockItem({
      ...nextItem,
      opened: false,
      remaining: serializeDrinkStockRemainingPercent(100, nextItem.remaining_style || detectDrinkStockRemainingStyle(nextItem.remaining)),
      in_stock: true
    });
    for (let count = keepIndexes.size; count < desiredQuantity; count += 1) {
      addDrinkStockBottleClone(drinkStocks, cloneSource);
    }
  }

  function matchingUnopenedDrinkStockExists(drinkStocks, sourceItem, excludeId = "") {
    const identityKey = drinkStockProductIdentityKey(sourceItem);
    const assignmentKey = drinkStockAssignmentKey(sourceItem);
    if (!identityKey) {
      return false;
    }
    return drinkStocks.items.some(item => (
      item
      && !item.opened
      && item.id !== excludeId
      && drinkStockProductIdentityKey(item) === identityKey
      && drinkStockAssignmentKey(item) === assignmentKey
    ));
  }

  function reconcileEmptiedDrinkStockRecord(drinkStocks, index, nextItem) {
    if (!Number.isInteger(index) || !drinkStocks.items[index]) {
      return;
    }
    const existing = drinkStocks.items[index];
    const remainingStyle = nextItem && nextItem.remaining_style
      ? nextItem.remaining_style
      : detectDrinkStockRemainingStyle(nextItem && nextItem.remaining);
    const emptiedItem = normalizeDrinkStockItem({
      ...nextItem,
      id: existing.id,
      date_added: nextItem.date_added || existing.date_added || todayInputDate(),
      opened: false,
      remaining: serializeDrinkStockRemainingPercent(0, remainingStyle),
      in_stock: false
    });
    drinkStocks.items[index] = emptiedItem;
    if (matchingUnopenedDrinkStockExists(drinkStocks, emptiedItem, emptiedItem.id)) {
      drinkStocks.items.splice(index, 1);
    }
  }

  function reconcileOpenedDrinkStockEdit(drinkStocks, index, nextItem) {
    if (drinkStockRemainingPercent(nextItem.remaining, true) <= 0) {
      reconcileEmptiedDrinkStockRecord(drinkStocks, index, nextItem);
      return;
    }
    const openedItem = normalizeDrinkStockItem({
      ...nextItem,
      opened: true,
      remaining: nextItem.remaining,
      in_stock: drinkStockRemainingPercent(nextItem.remaining, true) > 0
    });
    drinkStocks.items[index] = openedItem;
    if (!openedItem.in_stock && matchingUnopenedDrinkStockExists(drinkStocks, openedItem, openedItem.id)) {
      drinkStocks.items.splice(index, 1);
    }
  }

  function reconcileOpeningUnopenedDrinkStock(drinkStocks, context, draft, nextItem) {
    const unopenedIndexes = Array.isArray(context && context.indexes)
      ? context.indexes.filter(candidateIndex => Number.isInteger(candidateIndex) && drinkStocks.items[candidateIndex] && !drinkStocks.items[candidateIndex].opened)
      : [];
    const preferredIndex = context && context.representativeIndex;
    // Prefer the row's representative bottle so opening a grouped row changes one physical record and preserves its ID.
    const representativeIndex = unopenedIndexes.includes(preferredIndex)
      ? preferredIndex
      : unopenedIndexes[0];
    if (!Number.isInteger(representativeIndex) || !drinkStocks.items[representativeIndex]) {
      return;
    }

    const changedFields = changedDrinkStockGroupFields(draft, nextItem);
    const existing = drinkStocks.items[representativeIndex];
    const remainingActiveQuantity = Math.max(
      0,
      (context.activeIndexes || []).length - ((context.activeIndexes || []).includes(representativeIndex) ? 1 : 0)
    );
    if (drinkStockRemainingPercent(nextItem.remaining, true) <= 0) {
      const representativeId = existing.id;
      reconcileUnopenedDrinkStockQuantity(
        drinkStocks,
        {
          indexes: unopenedIndexes.filter(candidateIndex => candidateIndex !== representativeIndex),
          activeIndexes: (context && context.activeIndexes || []).filter(candidateIndex => candidateIndex !== representativeIndex),
          representativeIndex: unopenedIndexes.find(candidateIndex => candidateIndex !== representativeIndex)
        },
        draft,
        {
          ...nextItem,
          opened: false,
          remaining: serializeDrinkStockRemainingPercent(100, nextItem.remaining_style || detectDrinkStockRemainingStyle(nextItem.remaining)),
          in_stock: true
        },
        remainingActiveQuantity,
        { keepZeroReference: false }
      );
      const emptiedIndex = drinkStocks.items.findIndex(item => item && item.id === representativeId);
      if (emptiedIndex >= 0) {
        reconcileEmptiedDrinkStockRecord(drinkStocks, emptiedIndex, nextItem);
      }
      return;
    }
    const openedItem = normalizeDrinkStockItem({
      ...applyChangedDrinkStockGroupFields(existing, nextItem, changedFields),
      id: existing.id,
      date_added: nextItem.date_added,
      opened: true,
      remaining: nextItem.remaining,
      in_stock: drinkStockRemainingPercent(nextItem.remaining, true) > 0
    });
    drinkStocks.items[representativeIndex] = openedItem;
    reconcileUnopenedDrinkStockQuantity(
      drinkStocks,
      {
        indexes: unopenedIndexes.filter(candidateIndex => candidateIndex !== representativeIndex),
        activeIndexes: (context && context.activeIndexes || []).filter(candidateIndex => candidateIndex !== representativeIndex),
        representativeIndex: unopenedIndexes.find(candidateIndex => candidateIndex !== representativeIndex)
      },
      draft,
      {
        ...nextItem,
        opened: false,
        remaining: serializeDrinkStockRemainingPercent(100, nextItem.remaining_style || detectDrinkStockRemainingStyle(nextItem.remaining)),
        in_stock: true
      },
      remainingActiveQuantity,
      { keepZeroReference: false }
    );

    if (!openedItem.in_stock) {
      const openedIndex = drinkStocks.items.findIndex(item => item && item.id === openedItem.id);
      if (openedIndex >= 0 && matchingUnopenedDrinkStockExists(drinkStocks, openedItem, openedItem.id)) {
        drinkStocks.items.splice(openedIndex, 1);
      }
    }
  }

  function openDrinkStockModal(drinkStocks, item, index, options = {}) {
    const editing = Number.isInteger(index);
    const stacked = Boolean(options.stacked);
    const draft = normalizeDrinkStockItem(item || { in_stock: true, date_added: todayInputDate() });
    const quantityContext = editing ? drinkStockQuantityContext(drinkStocks, index) : null;
    const initialQuantity = quantityContext
      ? quantityContext.quantity
      : (draft.in_stock ? 1 : 0);
    const initialRemainingPercent = drinkStockRemainingPercent(draft.remaining, draft.opened, { round: true });
    const modalTitle = editing ? "Edit Drink Stock" : "Add Drink Stock";
    const closeAttribute = stacked ? "data-stacked-modal-close" : "data-modal-close";
    const headerActionsHtml = `
      <div class="button-row modal-title-actions">
        ${iconSubmitButtonHtml("save", "Save drink stock item", ` form="drink-stock-form"`)}
        ${iconButtonHtml("cancel", "Cancel", ` ${closeAttribute}`)}
      </div>
    `;
    const modalBody = `
      <form id="drink-stock-form" class="form-grid">
        <label class="full">Name
          <input id="drink-stock-name" value="${escapeAttribute(draft.name)}" required data-autofocus>
        </label>
        <label>Variant
          <input id="drink-stock-variant" value="${escapeAttribute(draft.variant || "")}">
        </label>
        <label class="full">Description
          <textarea id="drink-stock-description">${escapeText(draft.description)}</textarea>
        </label>
        <label>Category
          <select id="drink-stock-category">
            ${drinkStockCategoryOptions(draft.category, drinkStocks)}
          </select>
        </label>
        <label>Sub-category
          <input id="drink-stock-sub-category" value="${escapeAttribute(draft.sub_category || "")}">
        </label>
        <label id="drink-stock-quantity-label"><span id="drink-stock-quantity-label-text">${escapeHtml(getStockUnitLabels(draft).countLabel)}</span>
          <input id="drink-stock-quantity" type="number" min="0" step="1" value="${escapeAttribute(initialQuantity)}">
          <span id="drink-stock-quantity-summary" class="muted">${escapeHtml(drinkStockQuantitySummaryText(initialQuantity, draft))}</span>
        </label>
        <label class="inline-check"><input id="drink-stock-opened" type="checkbox" ${draft.opened ? "checked disabled" : ""}> <span id="drink-stock-opened-label-text">${escapeHtml(drinkStockOpenedToggleLabel(draft, draft.opened))}</span></label>
        ${draft.opened ? `<p id="drink-stock-opened-reset-text" class="muted full">${escapeHtml(openedDrinkStockResetText(draft))}</p>` : ""}
        <label id="drink-stock-remaining-label"><span id="drink-stock-remaining-label-text">${escapeHtml(getStockUnitLabels(draft).remainingLabel)}</span>
          <select id="drink-stock-remaining">
            ${drinkStockRemainingOptions(initialRemainingPercent)}
          </select>
        </label>
        <label id="drink-stock-charter-label">Assignment
          <select id="drink-stock-charter">${drinkStockCharterOptions(draft.charter_specific ? draft.charter_id : "")}</select>
        </label>
        <label>Date Added
          <input id="drink-stock-date" type="date" value="${escapeAttribute(draft.date_added || todayInputDate())}">
        </label>
        <p id="drink-stock-error" class="modal-error full"></p>
      </form>
    `;
    const modal = stacked
      ? openStackedDialogModal(modalTitle, modalBody, { cardClass: "modal-wide", headerActionsHtml })
      : openDialogModal(modalTitle, modalBody, { cardClass: "modal-wide", hideClose: true, headerActionsHtml });
    const categorySelect = modal.querySelector("#drink-stock-category");
    const charterSelect = modal.querySelector("#drink-stock-charter");
    const openedInput = modal.querySelector("#drink-stock-opened");
    const remainingInput = modal.querySelector("#drink-stock-remaining");
    const remainingLabel = modal.querySelector("#drink-stock-remaining-label");
    const quantityInput = modal.querySelector("#drink-stock-quantity");
    const quantityLabel = modal.querySelector("#drink-stock-quantity-label");
    const quantitySummary = modal.querySelector("#drink-stock-quantity-summary");
    const quantityLabelText = modal.querySelector("#drink-stock-quantity-label-text");
    const openedLabelText = modal.querySelector("#drink-stock-opened-label-text");
    const remainingLabelText = modal.querySelector("#drink-stock-remaining-label-text");
    const openedResetText = modal.querySelector("#drink-stock-opened-reset-text");
    const syncQuantitySummary = () => {
      if (quantitySummary && quantityInput) {
        quantitySummary.textContent = drinkStockQuantitySummaryText(quantityInput.value, drinkStockUnitItemFromModalDraft(draft, categorySelect));
      }
    };
    const syncUnitLabels = () => {
      const unitItem = drinkStockUnitItemFromModalDraft(draft, categorySelect);
      const labels = getStockUnitLabels(unitItem);
      if (quantityLabelText) {
        quantityLabelText.textContent = labels.countLabel;
      }
      if (openedLabelText) {
        openedLabelText.textContent = drinkStockOpenedToggleLabel(unitItem, openedInput.checked);
      }
      if (remainingLabelText) {
        remainingLabelText.textContent = labels.remainingLabel;
      }
      if (openedResetText) {
        openedResetText.textContent = openedDrinkStockResetText(unitItem);
      }
      syncQuantitySummary();
    };
    const syncConditionalFields = () => {
      remainingLabel.classList.toggle("hidden", !openedInput.checked);
      remainingInput.disabled = !openedInput.checked;
      quantityLabel.classList.toggle("hidden", openedInput.checked);
      quantityInput.disabled = openedInput.checked;
      if (!openedInput.checked) {
        remainingInput.value = "100";
      }
      syncUnitLabels();
    };
    quantityInput.addEventListener("input", syncQuantitySummary);
    quantityInput.addEventListener("change", syncQuantitySummary);
    categorySelect.addEventListener("change", syncUnitLabels);
    openedInput.addEventListener("change", () => {
      syncConditionalFields();
    });
    syncConditionalFields();
    modal.querySelector("#drink-stock-form").addEventListener("submit", async event => {
      event.preventDefault();
      const errorField = modal.querySelector("#drink-stock-error");
      const name = modal.querySelector("#drink-stock-name").value.trim();
      const category = normalizeDrinkCategory(categorySelect.value);
      const categoryAllowed = getSuggestionList("drink_stock_category", { drinkStocks })
        .some(value => selectionValueKey(value) === selectionValueKey(category));
      if (!name) {
        errorField.textContent = "Name is required.";
        return;
      }
      if (!categoryAllowed) {
        errorField.textContent = "Choose a category from the list.";
        return;
      }
      const openedRequested = draft.opened ? true : openedInput.checked;
      const selectedRemainingPercent = openedRequested
        ? roundDrinkStockRemainingPercent(Number(remainingInput.value))
        : 100;
      const emptiedOpenedBottle = openedRequested && selectedRemainingPercent === 0;
      const opened = emptiedOpenedBottle ? false : openedRequested;
      const targetQuantity = openedRequested ? null : Math.trunc(Number(quantityInput.value));
      if (!openedRequested && (!Number.isFinite(targetQuantity) || targetQuantity < 0)) {
        errorField.textContent = `${getStockUnitLabels({ category }).countLabel} must be 0 or more.`;
        return;
      }
      const assignmentId = charterSelect.value;
      const internalUse = assignmentId === INTERNAL_USE_ASSIGNMENT_ID;
      const remainingStyle = draft.remaining_style || detectDrinkStockRemainingStyle(draft.remaining);
      const remaining = openedRequested
        ? serializeDrinkStockRemainingPercent(selectedRemainingPercent, remainingStyle)
        : serializeDrinkStockRemainingPercent(targetQuantity > 0 ? 100 : 0, remainingStyle);
      const derivedInStock = openedRequested ? selectedRemainingPercent > 0 : targetQuantity > 0;
      const nextItem = normalizeDrinkStockItem({
        ...draft,
        name,
        variant: modal.querySelector("#drink-stock-variant").value.trim() || null,
        description: modal.querySelector("#drink-stock-description").value,
        category,
        sub_category: modal.querySelector("#drink-stock-sub-category").value.trim() || null,
        in_stock: derivedInStock,
        opened,
        remaining,
        remaining_style: remainingStyle,
        charter_specific: Boolean(assignmentId),
        charter_id: assignmentId || "",
        charter: internalUse ? INTERNAL_USE_ASSIGNMENT_LABEL : (assignmentId ? charterDisplayName(assignmentId) : ""),
        date_added: modal.querySelector("#drink-stock-date").value || todayInputDate()
      });
      const previousId = draft.id;
      if (editing && draft.opened && !nextItem.opened && drinkStockRemainingPercent(nextItem.remaining, false) <= 0) {
        reconcileEmptiedDrinkStockRecord(drinkStocks, index, nextItem);
      } else if (editing && openedRequested) {
        if (quantityContext) {
          reconcileOpeningUnopenedDrinkStock(drinkStocks, quantityContext, draft, nextItem);
        } else {
          reconcileOpenedDrinkStockEdit(drinkStocks, index, nextItem);
        }
      } else if (editing) {
        reconcileUnopenedDrinkStockQuantity(
          drinkStocks,
          quantityContext || {
            indexes: [index],
            activeIndexes: draft.in_stock ? [index] : [],
            quantity: draft.in_stock ? 1 : 0,
            representativeIndex: index
          },
          draft,
          nextItem,
          targetQuantity,
          { keepZeroReference: true }
        );
      } else if (openedRequested) {
        const newIndex = drinkStocks.items.length;
        drinkStocks.items.push(nextItem);
        if (nextItem.opened) {
          reconcileOpenedDrinkStockEdit(drinkStocks, newIndex, nextItem);
        } else {
          reconcileEmptiedDrinkStockRecord(drinkStocks, newIndex, nextItem);
        }
      } else {
        reconcileUnopenedDrinkStockQuantity(drinkStocks, null, draft, nextItem, targetQuantity, { keepZeroReference: true });
      }
      const saved = await saveDrinkStocks(drinkStocks, editing ? "Drink stock item saved." : "Drink stock item added.");
      if (!saved) {
        errorField.textContent = "Unable to save drink stock item.";
        return;
      }
      const savedItem = saved.items.find(candidate => previousId && candidate.id === previousId)
        || saved.items.find(candidate => drinkStockNameKey(candidate.name) === drinkStockNameKey(nextItem.name))
        || null;
      markModalSaved(modal);
      if (stacked) {
        await closeStackedDialogModal(modal);
      } else {
        closeDialogModal();
      }
      if (typeof options.onSaved === "function") {
        options.onSaved(savedItem, saved);
      } else {
        drawDrinkStockRows(drinkStocks);
      }
    });
  }

  function guestDrinkStockLookup(drinkStocks) {
    const items = Array.isArray(drinkStocks?.items) ? drinkStocks.items : [];
    const byId = new Map();
    const byName = new Map();
    items.forEach(item => {
      if (item.id) {
        byId.set(item.id, item);
      }
      if (item.name) {
        byName.set(drinkStockNameKey(item.name), item);
      }
    });
    return { byId, byName };
  }

  function normalizeDrinkStockAggregationPart(value) {
    return String(value === null || value === undefined ? "" : value)
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toLocaleLowerCase();
  }

  function drinkStockAggregationKey(item) {
    const source = item && typeof item === "object" ? item : {};
    const parts = [
      normalizeDrinkCategory(source.category),
      source.brand,
      source.name || source.display_name || source.label,
      source.variant || source.expression || source.age
    ]
      .map(normalizeDrinkStockAggregationPart)
      .filter(Boolean);
    return parts.join("|");
  }

  function aggregateDrinkStockItems(items) {
    const groups = [];
    const groupsByKey = new Map();
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const source = item && typeof item === "object" ? item : {};
      const aggregateKey = drinkStockAggregationKey(source);
      const key = source.opened === false && aggregateKey
        ? `unopened:${aggregateKey}`
        : `single:${source.id || index}`;
      let group = groupsByKey.get(key);
      if (!group) {
        group = {
          key,
          representativeItem: item,
          quantity: 0,
          items: []
        };
        groupsByKey.set(key, group);
        groups.push(group);
      }
      group.items.push(item);
      group.quantity = group.items.length;
    });
    return groups;
  }

  function drinkStockBottleCountText(quantity, item) {
    const count = Number(quantity) || 0;
    const labels = getStockUnitLabels(item);
    return `${count} ${count === 1 ? labels.singular : labels.plural}`;
  }

  function guestDrinkCategoryText(value) {
    return normalizeDrinkCategory(value);
  }

  function guestDrinkCategoryKey(value) {
    return guestDrinkCategoryText(value).toLocaleLowerCase();
  }

  function meaningfulGuestDrinkVariant(value) {
    const text = value === null || value === undefined
      ? ""
      : String(value).trim().replace(/\s+/g, " ");
    const key = text.toLocaleLowerCase().replace(/[\s.\/-]+/g, "");
    return text && key !== "na" ? text : "";
  }

  function guestDrinkNameKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function guestDrinkVariantText(item) {
    const source = item && typeof item === "object" ? item : {};
    const candidates = [source.variant, source.expression, source.age];
    const rawVariant = candidates.find(value => value !== null && value !== undefined);
    return meaningfulGuestDrinkVariant(rawVariant);
  }

  function formatGuestDrinkName(item, fallback = "Selection") {
    const source = item && typeof item === "object" ? item : {};
    const name = typeof source.name === "string" && source.name.trim()
      ? source.name.trim()
      : (typeof source.display_name === "string" && source.display_name.trim()
        ? source.display_name.trim()
        : (typeof source.label === "string" && source.label.trim() ? source.label.trim() : fallback));
    if (!name) {
      return fallback;
    }
    const variant = guestDrinkVariantText(source);
    if (!variant) {
      return name;
    }
    const nameKey = guestDrinkNameKey(name);
    const variantKey = guestDrinkNameKey(variant);
    return variantKey && nameKey.includes(variantKey) ? name : `${name} - ${variant}`;
  }

  function linkedGuestDrinkStocks(drinkStocks, charterId) {
    return (Array.isArray(drinkStocks && drinkStocks.items) ? drinkStocks.items : [])
      .filter(item => item && item.charter_specific && item.charter_id === charterId && !isInternalUseDrinkStock(item));
  }

  function resolvedGuestDrinksMenu(drinks, drinkStocks, charterId) {
    const guestDrinks = guestDrinksData(drinks);
    const linkedStocks = linkedGuestDrinkStocks(drinkStocks, charterId);
    const linkedGroups = aggregateDrinkStockItems(linkedStocks);
    const groupsByCategory = new Map();
    const categoryLabels = new Map();
    const stateSectionsByKey = new Map(
      guestDrinks.sections.map(section => [guestDrinkCategoryKey(section.category), section])
    );
    const itemOverridesById = new Map();

    guestDrinks.sections.forEach(section => {
      section.items.forEach(item => {
        const key = item.stock_id.toLocaleLowerCase();
        if (!itemOverridesById.has(key)) {
          itemOverridesById.set(key, item);
        }
      });
    });

    groupBeveragesByCategory(linkedGroups, group => group && group.representativeItem)
      .filter(group => group.items.length)
      .forEach(group => {
        const key = guestDrinkCategoryKey(group.category);
        groupsByCategory.set(key, group.items);
        categoryLabels.set(key, group.category);
      });

    const orderedCategoryKeys = DRINK_STOCK_CATEGORIES
      .map(guestDrinkCategoryKey)
      .filter(key => groupsByCategory.has(key));

    return {
      sections: orderedCategoryKeys.map(key => {
        const stateSection = stateSectionsByKey.get(key) || { category: categoryLabels.get(key), items: [] };
        const categoryGroups = groupsByCategory.get(key) || [];
        const groupByStockId = new Map();
        categoryGroups.forEach(group => {
          group.items.forEach(stock => {
            const stockId = typeof stock.id === "string" ? stock.id.trim() : "";
            if (stockId) {
              groupByStockId.set(stockId.toLocaleLowerCase(), group);
            }
          });
        });
        const orderedGroups = [];
        const orderedGroupKeys = new Set();
        stateSection.items.forEach(item => {
          const group = groupByStockId.get(item.stock_id.toLocaleLowerCase());
          if (!group || orderedGroupKeys.has(group.key)) {
            return;
          }
          orderedGroupKeys.add(group.key);
          orderedGroups.push(group);
        });
        categoryGroups.forEach(group => {
          if (orderedGroupKeys.has(group.key)) {
            return;
          }
          orderedGroupKeys.add(group.key);
          orderedGroups.push(group);
        });
        return {
          category: categoryLabels.get(key) || guestDrinkCategoryText(stateSection.category),
          title: categoryLabels.get(key) || guestDrinkCategoryText(stateSection.category),
          items: orderedGroups.map(group => {
            const stock = group.representativeItem;
            const override = group.items
              .map(item => item.id ? itemOverridesById.get(item.id.toLocaleLowerCase()) : null)
              .find(Boolean);
            const descriptionOverride = override && typeof override.description === "string" ? override.description : "";
            const stockDescription = typeof stock.description === "string" ? stock.description : "";
            return {
              stock_id: stock.id || "",
              name: formatGuestDrinkName(stock, ""),
              description_override: descriptionOverride,
              description: descriptionOverride || stockDescription,
              quantity: group.quantity
            };
          })
        };
      }).filter(section => section.items.length)
    };
  }

  function guestDrinkPresentationFromSections(sections) {
    return {
      sections: (Array.isArray(sections) ? sections : [])
        .map(section => ({
          category: guestDrinkCategoryText(section && section.category),
          items: (Array.isArray(section && section.items) ? section.items : [])
            .map(item => {
              const stockId = typeof item?.stock_id === "string" ? item.stock_id.trim() : "";
              if (!stockId) {
                return null;
              }
              const normalized = { stock_id: stockId };
              if (typeof item.description_override === "string" && item.description_override) {
                normalized.description = item.description_override;
              }
              return normalized;
            })
            .filter(Boolean)
        }))
        .filter(section => section.items.length)
    };
  }

  function renderGuestDrinksPreview(data) {
    const guestDrinks = data && typeof data === "object" ? data : { sections: [] };
    const purchasedItems = Array.isArray(data && data.purchased_items)
      ? data.purchased_items.map(item => ({
          name: typeof item?.name === "string" ? item.name.trim() : "",
          variant: availableAlcoholVariantText(item),
          description: meaningfulAvailableAlcoholDescription(item?.description)
        })).filter(item => item.name || item.variant)
      : [];
    const sectionHtml = Array.isArray(guestDrinks.sections) && guestDrinks.sections.length
      ? guestDrinks.sections.map(section => `
          <section class="menu-section guest-alcohol-category-section">
            <div class="menu-section-title">${escapeHtml(section.title || guestDrinkCategoryText(section.category))}</div>
            ${renderPreviewItems(section.items, "Guest alcohol will be added shortly.", item => `
              <div class="menu-item print-item guest-alcohol-drink-item">
                <span class="menu-item-name">${escapeHtml(formatGuestDrinkName(item))}</span>
                ${item && item.description ? `<div class="menu-item-desc">${previewMultilineHtml(item.description)}</div>` : ""}
              </div>
            `)}
          </section>
        `).join("")
      : `<div class="menu-note guest-alcohol-empty-note">Guest alcohol will be added shortly.</div>`;
    const purchasedSectionHtml = purchasedItems.length
      ? `
        <section class="menu-section guest-alcohol-category-section guest-alcohol-purchased-section">
          <div class="menu-section-title">Additional Alcohol Purchased</div>
          ${renderPreviewItems(purchasedItems, "No purchased alcohol yet.", item => `
            <div class="menu-item print-item guest-alcohol-drink-item">
              <span class="menu-item-name">${escapeHtml(formatAvailableAlcoholName(item))}</span>
              ${item && item.description ? `<div class="menu-item-desc">${previewMultilineHtml(item.description)}</div>` : ""}
            </div>
          `)}
        </section>`
      : "";
    return `
      <section class="tab-panel active" id="panel-drinks">
        <div class="charter-stack">
          <article class="menu-paper charter-page print-a4 guest-alcohol-print">
            <div class="print-header guest-alcohol-print-header">
              <div class="menu-heading">Onboard Cellar</div>
              <h2 class="menu-title">Guest Alcohol</h2>
              <div class="menu-subtitle">Alcohol requested for this charter</div>
              <div class="flourish" aria-hidden="true">Flourish</div>
            </div>
            <div class="print-content guest-alcohol-print-body">
              ${sectionHtml}
              ${purchasedSectionHtml}
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function guestAlcoholPreviewStyles() {
    const guestPortalWatermarkUrl = previewAssetUrl("/images/nautical_watermark_dark.png");
    return `
    @media print {
      .guest-alcohol-print::before {
        background-image: none !important;
        opacity: 0 !important;
      }

      .guest-alcohol-print.print-watermark-enabled::before {
        content: "";
        position: fixed;
        inset: 0;
        display: block !important;
        background-image: url("${guestPortalWatermarkUrl}");
        background-repeat: no-repeat;
        background-position: center center;
        background-size: 180mm auto;
        opacity: 0.06;
        z-index: 0;
        pointer-events: none;
        border: none !important;
        box-shadow: none !important;
      }

      .guest-alcohol-print.print-watermark-enabled::after {
        content: none !important;
        display: none !important;
        border: none !important;
        box-shadow: none !important;
      }

      .guest-alcohol-print.print-watermark-enabled {
        background: transparent !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }

      .guest-alcohol-print.print-watermark-enabled > * {
        position: relative;
        z-index: 1;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-print-header {
        margin-bottom: 2mm !important;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-print-header .menu-title {
        margin-bottom: 2mm !important;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-print-header .menu-subtitle {
        margin-bottom: 1.5mm !important;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-print-header .flourish {
        position: static !important;
        height: 12px !important;
        margin: 5px auto 6px !important;
        transform: none !important;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-category-section,
      .guest-alcohol-print.print-fit-one-page .guest-alcohol-drink-item {
        position: static !important;
        height: auto !important;
        min-height: 0 !important;
        margin-top: 0 !important;
        transform: none !important;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-category-section {
        margin-bottom: 3mm !important;
        break-inside: auto !important;
        page-break-inside: auto !important;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-category-section + .guest-alcohol-category-section {
        margin-top: 3mm !important;
        padding-top: 0 !important;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-category-section + .guest-alcohol-category-section::before {
        position: static !important;
        display: block !important;
        top: auto !important;
        left: auto !important;
        width: min(168px, calc(100% - 120px)) !important;
        height: 14px !important;
        margin: 1.5mm auto 2mm !important;
        transform: none !important;
        clear: both;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-drink-item {
        margin: 1mm 0 !important;
        padding: 5px 0 7px !important;
        line-height: 1.18;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-drink-item:not(:last-child)::before {
        position: static !important;
        display: block !important;
        left: auto !important;
        bottom: auto !important;
        width: min(124px, calc(100% - 100px)) !important;
        height: 10px !important;
        margin: 1mm auto 0 !important;
        transform: none !important;
        clear: both;
      }

      .guest-alcohol-print.print-fit-one-page .guest-alcohol-empty-note {
        margin-top: 0 !important;
        margin-bottom: 2mm !important;
      }
    }`;
  }

  function renderGuestDrinksPanel() {
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Guest Alcohol</h2>
          <div class="button-row list-add-actions">
            ${iconButtonHtml("preview", "Preview Guest Alcohol", ` id="preview-guest-drinks"`)}
            ${iconButtonHtml("save", "Save Guest Alcohol", ` id="save-guest-drinks"`)}
            ${iconButtonHtml("cancel", "Cancel Guest Alcohol changes", ` id="cancel-guest-drinks"`)}
          </div>
        </div>
        <p class="muted">Alcohol requested for this charter.</p>
        <div id="guest-drinks-sections" class="editor-list guest-drinks-list"></div>
      </section>
    `;
  }

  function drawGuestDrinkSections(drinks, drinkStocks, charterId, markDirty, redraw) {
    const container = document.getElementById("guest-drinks-sections");
    if (!container) {
      return;
    }
    const guestDrinks = resolvedGuestDrinksMenu(drinks, drinkStocks, charterId);
    container.innerHTML = "";
    if (!guestDrinks.sections.length) {
      container.innerHTML = `<p class="muted">No charter-linked drink stock items are assigned to this charter yet.</p>`;
      return;
    }
    guestDrinks.sections.forEach((section, sectionIndex) => {
      const box = document.createElement("section");
      box.className = "editor-item guest-drinks-section";
      box.innerHTML = `
        <div class="card-header">
          <div>
            <h3>${escapeHtml(section.title || `Section ${sectionIndex + 1}`)}</h3>
            <p class="muted">${escapeHtml(section.items.length)} item${section.items.length === 1 ? "" : "s"}</p>
          </div>
          <div class="button-row">
            ${orderingButtonsHtml("section", sectionIndex, guestDrinks.sections.length)}
          </div>
        </div>
        <div class="mini-list guest-drinks-item-list"></div>
      `;
      box.querySelector("[data-action='move-up']").addEventListener("click", () => {
        if (moveListItem(guestDrinks.sections, sectionIndex, -1)) {
          drinks.sections = guestDrinkPresentationFromSections(guestDrinks.sections).sections;
          markDirty();
          redraw();
        }
      });
      box.querySelector("[data-action='move-down']").addEventListener("click", () => {
        if (moveListItem(guestDrinks.sections, sectionIndex, 1)) {
          drinks.sections = guestDrinkPresentationFromSections(guestDrinks.sections).sections;
          markDirty();
          redraw();
        }
      });
      drawGuestDrinkItems(box.querySelector(".guest-drinks-item-list"), guestDrinks.sections, sectionIndex, drinks, markDirty, redraw);
      container.appendChild(box);
    });
  }

  function drawGuestDrinkItems(container, sections, sectionIndex, drinks, markDirty, redraw) {
    const section = sections[sectionIndex];
    container.innerHTML = "";
    if (!section.items.length) {
      container.innerHTML = `<p class="muted">No linked drinks found for this section.</p>`;
      return;
    }
    section.items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "record-row guest-drinks-row";
      const displayName = formatGuestDrinkName(item, `Drink ${index + 1}`);
      row.innerHTML = `
        <div class="record-summary guest-drinks-summary">
          <strong>${escapeHtml(displayName)}</strong>
          ${item.quantity > 1 ? `<span>${escapeHtml(drinkStockBottleCountText(item.quantity, section.category))}</span>` : ""}
          ${item.description ? `<span class="full muted multiline-text">${escapeHtml(item.description)}</span>` : ""}
        </div>
        <div class="button-row record-actions">
          ${orderingButtonsHtml("drink", index, section.items.length)}
        </div>
      `;
      row.querySelector("[data-action='move-up']").addEventListener("click", () => {
        if (moveListItem(section.items, index, -1)) {
          drinks.sections = guestDrinkPresentationFromSections(sections).sections;
          markDirty();
          redraw();
        }
      });
      row.querySelector("[data-action='move-down']").addEventListener("click", () => {
        if (moveListItem(section.items, index, 1)) {
          drinks.sections = guestDrinkPresentationFromSections(sections).sections;
          markDirty();
          redraw();
        }
      });
      container.appendChild(row);
    });
  }

  function bindGuestDrinksPanel(drinks, drinkStocks, charterId) {
    let dirty = false;
    const guard = {
      isDirty: () => dirty,
      confirmOptions: {
        title: "Unsaved Guest Alcohol",
        message: "Discard unsaved Guest Alcohol changes?",
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        tone: "danger"
      }
    };
    setPageUnsavedGuard(guard);
    const markDirty = () => {
      dirty = true;
    };
    const markClean = () => {
      dirty = false;
      clearPageUnsavedGuard(guard);
    };
    const redraw = () => drawGuestDrinkSections(drinks, drinkStocks, charterId, markDirty, redraw);

    document.getElementById("preview-guest-drinks")?.addEventListener("click", async () => {
      try {
        const purchases = await loadCharterAlcoholPurchases(charterId);
        renderPreviewLightbox("Guest Alcohol Preview", renderGuestDrinksPreview({
          ...resolvedGuestDrinksMenu(drinks, drinkStocks, charterId),
          purchased_items: purchasedAlcoholSummaryItems(purchases)
        }), {
          department: "hotel",
          printable: true,
          extraStyles: guestAlcoholPreviewStyles()
        });
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    document.getElementById("save-guest-drinks")?.addEventListener("click", async () => {
      drinks.sections = guestDrinkPresentationFromSections(resolvedGuestDrinksMenu(drinks, drinkStocks, charterId).sections).sections;
      const saved = await saveCharterFile(GUEST_DRINKS_FILE_NAME, drinks, "Guest Alcohol saved.");
      if (saved) {
        drinks.sections = normalizeGuestDrinks(saved).sections;
        markClean();
        await renderHotel();
      }
    });
    document.getElementById("cancel-guest-drinks")?.addEventListener("click", async () => {
      if (dirty && !await showAdminConfirm({
        title: "Discard Guest Alcohol Changes",
        message: "Discard unsaved Guest Alcohol changes?",
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        tone: "danger"
      })) {
        return;
      }
      try {
        const bundle = await loadCharter(charterId);
        drinks.sections = normalizeGuestDrinks(bundle[GUEST_DRINKS_FILE_NAME]).sections;
        dirty = false;
        redraw();
        setStatus("Guest Alcohol changes cancelled.", "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    redraw();
  }

  function normalizeAvailableAlcoholItem(item) {
    const source = item && typeof item === "object" ? item : {};
    return {
      stock_id: typeof source.stock_id === "string" ? source.stock_id.trim() : "",
      name: typeof source.name === "string" ? source.name.trim() : "",
      variant: availableAlcoholVariantText(source),
      description: typeof source.description === "string" ? source.description : (typeof source.notes === "string" ? source.notes : ""),
      category: (typeof source.category === "string" && source.category.trim()) || source.stock_type
        ? normalizeDrinkCategory(source.category, source.stock_type)
        : "",
      sub_category: availableAlcoholSubCategoryText(source),
      price_per_bottle: normalizeAvailableAlcoholPrice(source.price_per_bottle),
      currency: source.currency === "USD" ? "USD" : "PHP"
    };
  }

  function availableAlcoholInputItems(value) {
    const source = value && typeof value === "object" ? value : {};
    if (Array.isArray(source.items)) {
      return source.items;
    }
    if (Array.isArray(source.sections)) {
      return source.sections.flatMap(section => Array.isArray(section && section.items) ? section.items : []);
    }
    return [];
  }

  function normalizeAvailableAlcohol(value) {
    const source = value && typeof value === "object" ? value : {};
    const seenStockIds = new Set();
    const items = [];
    availableAlcoholInputItems(source).forEach(item => {
      const normalized = normalizeAvailableAlcoholItem(item);
      if (normalized.stock_id) {
        const key = normalized.stock_id.toLocaleLowerCase();
        if (seenStockIds.has(key)) {
          return;
        }
        seenStockIds.add(key);
      }
      items.push(normalized);
    });
    return {
      show_prices_to_guests: source.show_prices_to_guests === true || source.showPricesToGuests === true,
      items
    };
  }

  function availableAlcoholPriceText(item) {
    if (!item || item.price_per_bottle === null || item.price_per_bottle === undefined || item.price_per_bottle === "") {
      return "Price on request";
    }
    const price = normalizeAvailableAlcoholPrice(item && item.price_per_bottle);
    if (price === null) {
      return "Price on request";
    }
    const currency = typeof item.currency === "string" && item.currency.trim() ? item.currency.trim() : "PHP";
    return `${price} ${currency}`;
  }

  function normalizeCharterAlcoholPurchaseItem(item) {
    const source = item && typeof item === "object" ? item : {};
    const reversed = Boolean(source.reversed);
    return {
      id: typeof source.id === "string" ? source.id.trim() : "",
      charter_id: typeof source.charter_id === "string" ? source.charter_id.trim() : "",
      stock_item_id: typeof source.stock_item_id === "string" ? source.stock_item_id.trim() : "",
      available_alcohol_id: typeof source.available_alcohol_id === "string" ? source.available_alcohol_id.trim() : "",
      name: typeof source.name === "string" ? source.name.trim() : "",
      variant: availableAlcoholVariantText(source),
      description: meaningfulAvailableAlcoholDescription(source.description),
      category: (typeof source.category === "string" && source.category.trim()) || source.stock_type
        ? normalizeDrinkCategory(source.category, source.stock_type)
        : "",
      sub_category: availableAlcoholSubCategoryText(source),
      price: normalizeAvailableAlcoholPrice(source.price) ?? normalizeAvailableAlcoholPrice(source.price_per_bottle) ?? 0,
      currency: source.currency === "USD" ? "USD" : "PHP",
      purchased_at: typeof source.purchased_at === "string" ? source.purchased_at.trim() : "",
      reversed,
      reversed_at: reversed && typeof source.reversed_at === "string" && source.reversed_at.trim()
        ? source.reversed_at.trim()
        : null
    };
  }

  function normalizeCharterAlcoholPurchases(value) {
    const source = value && typeof value === "object" ? value : {};
    const items = Array.isArray(source.items)
      ? source.items.map(normalizeCharterAlcoholPurchaseItem)
      : (Array.isArray(value) ? value.map(normalizeCharterAlcoholPurchaseItem) : []);
    return { items };
  }

  function normalizeCharterAlcoholPurchaseMutation(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      purchase: source.purchase ? normalizeCharterAlcoholPurchaseItem(source.purchase) : null,
      stock_item: source.stock_item ? normalizeDrinkStockItem(source.stock_item) : null
    };
  }

  function activeCharterAlcoholPurchases(purchases) {
    return (Array.isArray(purchases?.items) ? purchases.items : [])
      .filter(item => item && item.reversed !== true);
  }

  function compareCharterAlcoholPurchase(left, right) {
    const rightTime = Date.parse(right && right.purchased_at || "");
    const leftTime = Date.parse(left && left.purchased_at || "");
    if (Number.isFinite(rightTime) && Number.isFinite(leftTime) && rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return formatAvailableAlcoholName(left || {}).localeCompare(formatAvailableAlcoholName(right || {}), undefined, { sensitivity: "base" });
  }

  function purchasedAlcoholSummaryItems(purchases) {
    const seen = new Set();
    const items = [];
    activeCharterAlcoholPurchases(purchases).forEach(item => {
      const displayName = formatAvailableAlcoholName(item, "Selection");
      const key = availableAlcoholNameKey(displayName);
      if (!displayName || seen.has(key)) {
        return;
      }
      seen.add(key);
      items.push({
        name: item.name,
        variant: item.variant,
        description: meaningfulAvailableAlcoholDescription(item.description)
      });
    });
    return items.sort((left, right) => formatAvailableAlcoholName(left).localeCompare(formatAvailableAlcoholName(right), undefined, { sensitivity: "base" }));
  }

  function purchasedAlcoholRunningTotal(purchases) {
    return activeCharterAlcoholPurchases(purchases)
      .reduce((sum, item) => sum + (normalizeAvailableAlcoholPrice(item?.price) ?? 0), 0);
  }

  function purchasedAlcoholTotalText(purchases) {
    const totalsByCurrency = new Map();
    activeCharterAlcoholPurchases(purchases).forEach(item => {
      const currency = typeof item?.currency === "string" && item.currency.trim()
        ? item.currency.trim()
        : "";
      const price = normalizeAvailableAlcoholPrice(item?.price) ?? 0;
      totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + price);
    });
    if (!totalsByCurrency.size) {
      return "0";
    }
    if (totalsByCurrency.size === 1) {
      const [[currency, total]] = [...totalsByCurrency.entries()];
      return currency ? `${total} ${currency}` : String(total);
    }
    return [...totalsByCurrency.entries()]
      .sort((left, right) => {
        if (!left[0]) {
          return 1;
        }
        if (!right[0]) {
          return -1;
        }
        return left[0].localeCompare(right[0], undefined, { sensitivity: "base" });
      })
      .map(([currency, total]) => currency ? `${total} ${currency}` : String(total))
      .join(" + ");
  }

  function purchasedAlcoholTimeText(value) {
    if (!value) {
      return "Unknown";
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
  }

  function purchasedAlcoholAmountText(value, currency) {
    const amount = normalizeAvailableAlcoholPrice(value) ?? 0;
    const currencyCode = typeof currency === "string" && currency.trim()
      ? currency.trim()
      : "";
    return currencyCode ? `${amount} ${currencyCode}` : String(amount);
  }

  function purchasedAlcoholPriceText(item) {
    return purchasedAlcoholAmountText(item?.price, item?.currency);
  }

  function purchasedAlcoholInvoiceGroupingKey(item) {
    const source = item && typeof item === "object" ? item : {};
    return [
      availableAlcoholNameKey(source.name || ""),
      availableAlcoholNameKey(availableAlcoholVariantText(source) || ""),
      selectionValueKey(availableAlcoholCategoryText(source)),
      availableAlcoholSubCategoryKey(availableAlcoholSubCategoryText(source)),
      String(normalizeAvailableAlcoholPrice(source.price) ?? 0),
      typeof source.currency === "string" ? source.currency.trim() : ""
    ].join("::");
  }

  function purchasedAlcoholInvoiceCategoryText(item) {
    const category = availableAlcoholCategoryText(item);
    const subCategory = availableAlcoholSubCategoryText(item);
    if (subCategory && availableAlcoholNameKey(subCategory) !== availableAlcoholNameKey(category)) {
      return `${category} / ${subCategory}`;
    }
    return category || subCategory || AVAILABLE_ALCOHOL_SUBCATEGORY_FALLBACK;
  }

  function groupedPurchasedAlcoholInvoiceLines(purchases) {
    const linesByKey = new Map();
    activeCharterAlcoholPurchases(purchases).forEach(item => {
      const key = purchasedAlcoholInvoiceGroupingKey(item);
      let line = linesByKey.get(key);
      if (!line) {
        line = {
          name: item?.name || "",
          variant: availableAlcoholVariantText(item),
          category: availableAlcoholCategoryText(item),
          sub_category: availableAlcoholSubCategoryText(item),
          price: normalizeAvailableAlcoholPrice(item?.price) ?? 0,
          currency: typeof item?.currency === "string" && item.currency.trim()
            ? item.currency.trim()
            : "",
          quantity: 0
        };
        linesByKey.set(key, line);
      }
      line.quantity += 1;
    });
    return [...linesByKey.values()].sort((left, right) => {
      const categoryCompare = compareAvailableAlcoholCategory(left?.category, right?.category);
      if (categoryCompare) {
        return categoryCompare;
      }
      const subCategoryCompare = compareAvailableAlcoholSubCategory(left, right);
      if (subCategoryCompare) {
        return subCategoryCompare;
      }
      const nameCompare = formatAvailableAlcoholName(left, "Selection").localeCompare(
        formatAvailableAlcoholName(right, "Selection"),
        undefined,
        { sensitivity: "base" }
      );
      if (nameCompare) {
        return nameCompare;
      }
      return (normalizeAvailableAlcoholPrice(right?.price) ?? 0) - (normalizeAvailableAlcoholPrice(left?.price) ?? 0);
    });
  }

  function purchasedAlcoholInvoiceDateText(value) {
    const date = parseLocalDateOnly(value);
    return date
      ? date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
      : "";
  }

  function purchasedAlcoholInvoiceDateRangeText(charterInfo) {
    const startText = purchasedAlcoholInvoiceDateText(charterInfo?.start_date);
    const endText = purchasedAlcoholInvoiceDateText(charterInfo?.end_date);
    if (startText && endText) {
      return `${startText} - ${endText}`;
    }
    return startText || endText || "";
  }

  function purchasedAlcoholInvoicePreviewStyles() {
    return `
    .invoice-page.menu-paper {
      background:
        linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,249,251,0.98) 100%),
        radial-gradient(circle at 50% 10%, rgba(223,231,239,0.22), rgba(255,255,255,0) 28%);
      color: #17212b;
      border: none;
      outline: none;
      border-radius: 20px;
      box-shadow: none;
      padding: clamp(24px, 4vw, 40px) clamp(22px, 3.8vw, 38px);
    }

    .invoice-page.menu-paper::before {
      display: none;
    }

    .invoice-page.menu-paper::after {
      content: none;
      display: none;
      top: 10px;
      right: 10px;
      bottom: 10px;
      left: 10px;
      border: none;
      border-radius: 16px;
    }

    .invoice-page .menu-heading,
    .invoice-page .menu-subtitle,
    .invoice-page .menu-note,
    .invoice-page .invoice-charter-card,
    .invoice-page .invoice-table-wrap,
    .invoice-page .invoice-actions,
    .invoice-page .invoice-totals,
    .invoice-page .invoice-footer {
      width: min(100%, 760px);
      margin-left: auto;
      margin-right: auto;
    }

    .invoice-page .menu-heading {
      color: #617182;
      letter-spacing: 0.16em;
      margin-bottom: 10px;
    }

    .invoice-page .menu-title {
      color: #16212c;
      margin: 10px 0 8px;
      font-size: clamp(2rem, 5vw, 2.5rem);
    }

    .invoice-page .menu-subtitle {
      color: #455565;
      margin-bottom: 0;
    }

    .invoice-vessel-art {
      display: block;
      width: min(100%, 280px);
      margin: 0 auto 18px;
      opacity: 0.94;
    }

    .invoice-charter-card {
      display: grid;
      gap: 10px;
      margin-top: 28px;
      padding: 18px 20px;
      border: 1px solid rgba(84,102,122,0.16);
      border-radius: 16px;
      background: rgba(245,248,251,0.92);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.76);
    }

    .invoice-charter-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px 16px;
    }

    .invoice-charter-item {
      display: grid;
      gap: 4px;
    }

    .invoice-charter-label {
      color: #617182;
      font: 700 0.78rem/1.2 Arial, Helvetica, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .invoice-charter-value {
      color: #16212c;
      font-size: 1rem;
      line-height: 1.45;
    }

    .invoice-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 22px;
      margin-bottom: 16px;
    }

    .invoice-print-button {
      border: 1px solid rgba(84,102,122,0.22);
      border-radius: 999px;
      background: #16212c;
      color: #fff;
      cursor: pointer;
      padding: 0.72rem 1.2rem;
      font: 700 0.92rem/1 Arial, Helvetica, sans-serif;
      letter-spacing: 0.02em;
      box-shadow: 0 10px 20px rgba(22,33,44,0.14);
    }

    .invoice-print-button:hover,
    .invoice-print-button:focus-visible {
      background: #223142;
    }

    .invoice-table-wrap {
      position: relative;
      margin-top: 10px;
      border: 1px solid rgba(84,102,122,0.18);
      border-radius: 16px;
      background: #fff;
      overflow: hidden;
    }

    .invoice-table {
      width: 100%;
      border-collapse: collapse;
      color: #17212b;
    }

    .invoice-table th,
    .invoice-table td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(84,102,122,0.14);
      text-align: left;
      vertical-align: top;
    }

    .invoice-table th {
      background: rgba(231,237,243,0.72);
      color: #455565;
      font: 700 0.8rem/1.2 Arial, Helvetica, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .invoice-table td:nth-child(3),
    .invoice-table td:nth-child(4),
    .invoice-table td:nth-child(5),
    .invoice-table th:nth-child(3),
    .invoice-table th:nth-child(4),
    .invoice-table th:nth-child(5) {
      text-align: right;
      white-space: nowrap;
    }

    .invoice-table tbody tr:last-child td {
      border-bottom: 0;
    }

    .invoice-table-item {
      font-weight: 700;
      line-height: 1.35;
    }

    .invoice-table-category {
      color: #516171;
      line-height: 1.45;
    }

    .invoice-empty {
      padding: 26px 22px;
      color: #516171;
      text-align: center;
      line-height: 1.6;
    }

    .invoice-totals {
      display: flex;
      justify-content: flex-end;
      margin-top: 18px;
    }

    .invoice-total-card {
      min-width: min(100%, 280px);
      padding: 16px 18px;
      border: 1px solid rgba(84,102,122,0.18);
      border-radius: 16px;
      background: rgba(245,248,251,0.94);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.76);
    }

    .invoice-total-label {
      color: #617182;
      font: 700 0.8rem/1.2 Arial, Helvetica, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .invoice-total-value {
      margin-top: 6px;
      color: #16212c;
      font-size: 1.35rem;
      font-weight: 800;
    }

    .invoice-footer {
      position: relative;
      margin-top: 28px;
      padding-top: 16px;
      color: #516171;
      line-height: 1.6;
      border-top: 1px solid rgba(84,102,122,0.14);
    }

    .invoice-footer-copy {
      padding-right: min(22vw, 120px);
    }

    .invoice-stamp {
      position: absolute;
      right: clamp(22px, 6vw, 56px);
      bottom: clamp(26px, 7vw, 54px);
      width: clamp(88px, 16vw, 132px);
      opacity: 0.1;
      transform: rotate(-14deg);
      filter: grayscale(1) sepia(0.2) saturate(0.72);
      pointer-events: none;
      z-index: 6;
    }

    .invoice-stamp img {
      display: block;
      width: 100%;
      height: auto;
    }

    .invoice-generated {
      margin-top: 8px;
      font-size: 0.92rem;
    }

    @media print {
      .invoice-page.menu-paper {
        background: #fff !important;
        border: none !important;
        outline: none !important;
        border-radius: 14px;
        box-shadow: none !important;
        padding: 10mm 10mm 9mm;
      }

      .invoice-page.menu-paper::after {
        content: none !important;
        display: none !important;
        border: none !important;
      }

      .invoice-page .invoice-print-button {
        display: none !important;
      }

      .invoice-page .invoice-stamp {
        opacity: 0.08;
      }

      .invoice-page .invoice-charter-card,
      .invoice-page .invoice-table-wrap,
      .invoice-page .invoice-total-card {
        box-shadow: none !important;
      }
    }

    @media (max-width: 700px) {
      .invoice-table-wrap {
        overflow-x: auto;
      }

      .invoice-table {
        min-width: 620px;
      }

      .invoice-footer-copy {
        padding-right: 0;
      }

      .invoice-stamp {
        width: 96px;
        right: 20px;
        bottom: 20px;
      }
    }`;
  }

  function renderPurchasedAlcoholInvoicePreview(purchases, charterInfo) {
    const lineItems = groupedPurchasedAlcoholInvoiceLines(purchases);
    const vesselLineArtUrl = previewAssetUrl("/images/vessel-line-art.png");
    const shoulderPatchUrl = previewAssetUrl("/images/shoulder-patch.svg");
    const charterName = String(charterInfo?.name || "").trim() || "Current Charter";
    const charterDateRange = purchasedAlcoholInvoiceDateRangeText(charterInfo);
    const guestCountNumber = Number(charterInfo?.guest_count);
    const guestCount = Number.isInteger(guestCountNumber) && guestCountNumber > 0 ? guestCountNumber : 0;
    const generatedAt = new Date().toLocaleString(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
    const charterDetails = [
      { label: "Charter", value: charterName },
      charterDateRange ? { label: "Dates", value: charterDateRange } : null,
      guestCount > 0 ? { label: "Guests", value: String(guestCount) } : null
    ].filter(Boolean);
    const tableHtml = lineItems.length
      ? `
        <div class="invoice-table-wrap print-section">
          <table class="invoice-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Category</th>
                <th scope="col">Unit Price</th>
                <th scope="col">Qty</th>
                <th scope="col">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${lineItems.map(item => `
                <tr>
                  <td><div class="invoice-table-item">${escapeHtml(formatAvailableAlcoholName(item, "Selection"))}</div></td>
                  <td><div class="invoice-table-category">${escapeHtml(purchasedAlcoholInvoiceCategoryText(item))}</div></td>
                  <td>${escapeHtml(purchasedAlcoholAmountText(item.price, item.currency))}</td>
                  <td>${escapeHtml(String(item.quantity))}</td>
                  <td>${escapeHtml(purchasedAlcoholAmountText((normalizeAvailableAlcoholPrice(item.price) ?? 0) * item.quantity, item.currency))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>`
      : `<div class="invoice-table-wrap print-section"><div class="invoice-empty">No purchased alcohol items for this charter.</div></div>`;
    return `
      <section class="tab-panel active" id="panel-purchased-alcohol-invoice">
        <div class="charter-stack">
          <article class="menu-paper charter-page print-a4 invoice-page">
            <div class="print-header invoice-header">
              <img class="invoice-vessel-art" src="${escapeAttribute(vesselLineArtUrl)}" alt="Princess Iolanthe vessel line art">
              <div class="menu-heading">Princess Iolanthe</div>
              <h2 class="menu-title">Bar Bill</h2>
              <div class="menu-subtitle">Additional Alcohol Invoice</div>
              <div class="invoice-charter-card print-section">
                <div class="invoice-charter-grid">
                  ${charterDetails.map(item => `
                    <div class="invoice-charter-item">
                      <div class="invoice-charter-label">${escapeHtml(item.label)}</div>
                      <div class="invoice-charter-value">${escapeHtml(item.value)}</div>
                    </div>
                  `).join("")}
                </div>
              </div>
            </div>
            <div class="print-content invoice-content">
              ${tableHtml}
              ${lineItems.length ? `
                <div class="invoice-totals print-section">
                  <div class="invoice-total-card">
                    <div class="invoice-total-label">Bar Bill Total</div>
                    <div class="invoice-total-value">${escapeHtml(purchasedAlcoholTotalText(purchases))}</div>
                  </div>
                </div>` : ""}
              <div class="invoice-footer print-section">
                <div class="invoice-footer-copy">
                  <div>Thank you for sailing with Princess Iolanthe.</div>
                  <div class="invoice-generated">Date generated: ${escapeHtml(generatedAt)}</div>
                </div>
              </div>
            </div>
            <div class="invoice-stamp" aria-hidden="true">
              <img src="${escapeAttribute(shoulderPatchUrl)}" alt="">
            </div>
          </article>
        </div>
      </section>
    `;
  }

  function sortedAvailableAlcoholItems(items) {
    return (Array.isArray(items) ? items.slice() : []).sort(compareAvailableAlcoholItem);
  }

  function groupAvailableAlcoholSections(items) {
    return groupBeveragesByCategory(sortedAvailableAlcoholItems(items))
      .map(section => {
        const subgroups = [];
        const subgroupsByKey = new Map();
        section.items.forEach(item => {
          const title = availableAlcoholSubCategoryText(item);
          const key = availableAlcoholSubCategoryKey(title);
          let subgroup = subgroupsByKey.get(key);
          if (!subgroup) {
            subgroup = { title, items: [] };
            subgroupsByKey.set(key, subgroup);
            subgroups.push(subgroup);
          }
          subgroup.items.push(item);
        });
        return { ...section, subgroups };
      })
      .filter(section => section.subgroups.length);
  }

  function drinkStockItemsById(drinkStocks) {
    const stockById = new Map();
    (Array.isArray(drinkStocks?.items) ? drinkStocks.items : []).forEach(stock => {
      const stockId = typeof stock?.id === "string" ? stock.id.trim() : "";
      if (stockId && !stockById.has(stockId.toLocaleLowerCase())) {
        stockById.set(stockId.toLocaleLowerCase(), stock);
      }
    });
    return stockById;
  }

  function aggregateAvailableAlcoholRows(items, drinkStocks) {
    const stockById = drinkStockItemsById(drinkStocks);
    const rowsByKey = new Map();
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const stock = item.stock_id ? stockById.get(item.stock_id.toLocaleLowerCase()) : null;
      const key = availableAlcoholAggregationKey(item, stock, index);
      let group = rowsByKey.get(key);
      if (!group) {
        group = {
          all_indexes: [],
          available_entries: [],
          display_source: null
        };
        rowsByKey.set(key, group);
      }
      group.all_indexes.push(index);
      const candidatePrice = normalizeAvailableAlcoholPrice(item?.price_per_bottle);
      if (!group.display_source || (normalizeAvailableAlcoholPrice(group.display_source?.price_per_bottle) === null && candidatePrice !== null)) {
        group.display_source = item;
      }
      if (stock && !stockIsEligibleForAvailableAlcohol(stock)) {
        return;
      }
      group.available_entries.push({ item, index, stock });
    });
    const rows = [];
    rowsByKey.forEach(group => {
      if (!group.available_entries.length) {
        return;
      }
      const first = group.available_entries[0];
      const linkedStockItems = [];
      const linkedStockIds = [];
      const seenLinkedStockIds = new Set();
      group.available_entries.forEach(entry => {
        const stockId = typeof entry?.stock?.id === "string" ? entry.stock.id.trim() : "";
        if (!stockId) {
          return;
        }
        const key = stockId.toLocaleLowerCase();
        if (seenLinkedStockIds.has(key)) {
          return;
        }
        seenLinkedStockIds.add(key);
        linkedStockIds.push(stockId);
        linkedStockItems.push({
          id: stockId,
          category: normalizeDrinkCategory(entry.stock.category, entry.stock.stock_type),
          sub_category: availableAlcoholSubCategoryText(entry.stock),
          name: typeof entry.stock.name === "string" ? entry.stock.name.trim() : "",
          variant: availableAlcoholVariantText(entry.stock),
          in_stock: entry.stock.in_stock !== false,
          opened: entry.stock.opened === true,
          sold_to_charter: entry.stock.sold_to_charter === true
        });
      });
      const displayItem = {
        ...availableAlcoholDisplayItem(first.item, first.stock, group.display_source),
        stock_item_id: linkedStockIds[0] || (typeof first?.stock?.id === "string" ? first.stock.id.trim() : ""),
        linked_stock_item_id: linkedStockIds[0] || "",
        linked_stock_item_ids: linkedStockIds.slice(),
        linked_stock_items: linkedStockItems
      };
      rows.push({
        item: first.item,
        index: first.index,
        indexes: group.available_entries.map(entry => entry.index),
        all_indexes: group.all_indexes.slice(),
        quantity: group.available_entries.length,
        stock: first.stock,
        linked_stock_item_ids: linkedStockIds.slice(),
        linked_stock_items: linkedStockItems,
        display_item: displayItem
      });
    });
    return rows.sort((left, right) => compareAvailableAlcoholItem(left.display_item || left.item, right.display_item || right.item));
  }

  function availableAlcoholItemFromStock(stock) {
    return normalizeAvailableAlcoholItem({
      stock_id: stock.id || "",
      name: stock.name || "",
      variant: stock.variant || stock.expression || stock.age || "",
      description: stock.description || "",
      category: stock.category || "",
      sub_category: stock.sub_category || "",
      price_per_bottle: null,
      currency: "PHP"
    });
  }

  function renderAvailableAlcoholPanel(availableAlcohol) {
    const showPricesToGuests = availableAlcohol?.show_prices_to_guests === true;
    return `
      <section class="card full">
        <div class="card-header available-alcohol-header">
          <h2>Available Alcohol</h2>
          <label class="inline-check available-alcohol-guest-price-toggle">
            <input id="available-alcohol-show-prices-to-guests" type="checkbox"${showPricesToGuests ? " checked" : ""}>
            <span>Show prices to guests</span>
          </label>
          <div class="button-row list-add-actions">
            ${iconButtonHtml("add", "Add available alcohol from stock", ` id="add-available-alcohol"`)}
            ${iconButtonHtml("preview", "Preview Available Alcohol", ` id="preview-available-alcohol"`)}
            ${iconButtonHtml("confirm", "Commit Available Alcohol", ` id="commit-available-alcohol"`)}
            ${iconButtonHtml("cancel", "Cancel Available Alcohol changes", ` id="cancel-available-alcohol"`)}
          </div>
        </div>
        <p class="muted">Unopened available stock eligible for guest purchase.</p>
        <div id="available-alcohol-list-shell" class="available-alcohol-list-shell">
          <div id="available-alcohol-list-header" class="available-alcohol-list-header record-row available-alcohol-row" hidden>
            <span>Name</span>
            <span>Category</span>
            <span>Quantity</span>
            <span>Price</span>
            <span class="available-alcohol-list-header-spacer" aria-hidden="true"></span>
          </div>
          <div id="available-alcohol-list" class="editor-list available-alcohol-list"></div>
        </div>
      </section>
    `;
  }

  function drawAvailableAlcoholItems(availableAlcohol, drinkStocks, charterId, markDirty, redraw) {
    const container = document.getElementById("available-alcohol-list");
    const listShell = document.getElementById("available-alcohol-list-shell");
    const listHeader = document.getElementById("available-alcohol-list-header");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    if (!availableAlcohol.items.length) {
      updateAvailableAlcoholListSizing(listShell, []);
      if (listHeader) {
        listHeader.hidden = true;
      }
      container.innerHTML = `<p class="muted">No Available Alcohol items selected for this charter.</p>`;
      return;
    }
    const displayRows = aggregateAvailableAlcoholRows(availableAlcohol.items, drinkStocks);
    updateAvailableAlcoholListSizing(listShell, displayRows);
    if (listHeader) {
      listHeader.hidden = !displayRows.length;
    }
    displayRows.forEach(({ item, index, indexes, all_indexes, quantity, stock, display_item, linked_stock_item_ids, linked_stock_items }) => {
      const displayItem = display_item || availableAlcoholDisplayItem(item, stock);
      const groupIndexes = Array.isArray(all_indexes) && all_indexes.length ? all_indexes : [index];
      const displayName = formatAvailableAlcoholName(displayItem, `Drink ${index + 1}`);
      const row = document.createElement("div");
      row.className = "record-row available-alcohol-row";
      row.innerHTML = `
        <div class="record-summary available-alcohol-summary">
          <strong class="available-alcohol-cell available-alcohol-name-cell" data-label="Name">${escapeHtml(displayName)}</strong>
          <span class="available-alcohol-cell available-alcohol-category-cell" data-label="Category">${escapeHtml(availableAlcoholCategoryText(item))}</span>
          <span class="available-alcohol-cell" data-label="Quantity">${quantity > 1 ? escapeHtml(drinkStockBottleCountText(quantity, item)) : ""}</span>
          <span class="available-alcohol-cell available-alcohol-price-cell" data-label="Price">
            <input class="available-alcohol-price-input" data-price-index="${index}" type="text" inputmode="numeric" pattern="[0-9]{0,6}" maxlength="6" placeholder="POR" value="${escapeAttribute(availableAlcoholPriceInputValue(displayItem.price_per_bottle))}" aria-label="Price for ${escapeAttribute(displayName)}">
            <select data-currency-index="${index}" aria-label="Currency for ${escapeAttribute(displayName)}">
              <option value="PHP"${displayItem.currency === "PHP" ? " selected" : ""}>PHP</option>
              <option value="USD"${displayItem.currency === "USD" ? " selected" : ""}>USD</option>
            </select>
          </span>
        </div>
        <div class="button-row record-actions">
          ${iconButtonHtml("purchase", "Mark as purchased by charter", ` data-action="purchase-drink"`)}
          ${iconButtonHtml("edit", "Edit stock item", ` data-action="edit-stock"`)}
          ${iconButtonHtml("remove", "Remove from Available Alcohol", ` data-action="remove-drink"`)}
        </div>
      `;
      const priceInput = row.querySelector("[data-price-index]");
      priceInput?.addEventListener("input", event => {
        const sanitized = sanitizeAvailableAlcoholPriceInput(event.target.value);
        if (event.target.value !== sanitized) {
          event.target.value = sanitized;
        }
        groupIndexes.forEach(targetIndex => {
          if (availableAlcohol.items[targetIndex]) {
            availableAlcohol.items[targetIndex].price_per_bottle = sanitized === "" ? null : Number(sanitized);
          }
        });
        markDirty();
      });
      priceInput?.addEventListener("change", redraw);
      row.querySelector("[data-currency-index]")?.addEventListener("change", event => {
        const nextCurrency = event.target.value === "USD" ? "USD" : "PHP";
        groupIndexes.forEach(targetIndex => {
          if (availableAlcohol.items[targetIndex]) {
            availableAlcohol.items[targetIndex].currency = nextCurrency;
          }
        });
        markDirty();
      });
      row.querySelector("[data-action='purchase-drink']")?.addEventListener("click", async () => {
        const candidateStockIds = Array.isArray(displayItem.linked_stock_item_ids) && displayItem.linked_stock_item_ids.length
          ? displayItem.linked_stock_item_ids.slice()
          : (Array.isArray(linked_stock_item_ids) && linked_stock_item_ids.length
            ? linked_stock_item_ids.slice()
            : indexes
              .map(sourceIndex => availableAlcohol.items[sourceIndex]?.stock_id || "")
              .filter(Boolean));
        const representativeAvailableAlcoholId = typeof item?.stock_id === "string" && item.stock_id.trim()
          ? item.stock_id.trim()
          : (typeof displayItem?.stock_id === "string" ? displayItem.stock_id.trim() : "");
        const representativeStockItemId = typeof displayItem?.stock_item_id === "string" && displayItem.stock_item_id.trim()
          ? displayItem.stock_item_id.trim()
          : (candidateStockIds[0] || representativeAvailableAlcoholId || "");
        console.info("[available-alcohol purchase attempt]", {
          selected_available_alcohol_item: displayItem,
          id: representativeAvailableAlcoholId || representativeStockItemId,
          category: displayItem.category || "",
          sub_category: availableAlcoholSubCategoryText(displayItem),
          name: displayItem.name || displayItem.display_name || displayItem.label || "",
          variant: displayItem.variant || "",
          price: normalizeAvailableAlcoholPrice(displayItem.price_per_bottle),
          linked_stock_item_id: representativeStockItemId,
          linked_stock_item_ids: candidateStockIds,
          candidate_stock_records: Array.isArray(displayItem.linked_stock_items) && displayItem.linked_stock_items.length
            ? displayItem.linked_stock_items
            : (Array.isArray(linked_stock_items) ? linked_stock_items : [])
        });
        if (!await showAdminConfirm({
          title: "Purchase Available Alcohol",
          message: "Mark this item as purchased by the current charter?",
          confirmLabel: "Purchase",
          cancelLabel: "Cancel",
          tone: "success"
        })) {
          return;
        }
        try {
          const result = await purchaseCharterAlcohol(charterId, {
            available_alcohol_id: representativeAvailableAlcoholId,
            stock_item_id: representativeStockItemId,
            linked_stock_item_id: representativeStockItemId,
            linked_stock_item_ids: candidateStockIds,
            candidate_stock_ids: candidateStockIds,
            name: displayItem.name || displayItem.display_name || displayItem.label || "",
            variant: displayItem.variant || "",
            description: meaningfulAvailableAlcoholDescription(displayItem.description),
            category: displayItem.category || "",
            sub_category: availableAlcoholSubCategoryText(displayItem),
            price: normalizeAvailableAlcoholPrice(displayItem.price_per_bottle) ?? 0,
            currency: displayItem.currency || "PHP"
          });
          if (result?.stock_item?.id) {
            const stockIndex = drinkStocks.items.findIndex(stockItem => stockItem.id === result.stock_item.id);
            if (stockIndex >= 0) {
              drinkStocks.items[stockIndex] = result.stock_item;
            }
          }
          setStatus(`${displayName} marked as purchased.`, "ok");
          redraw();
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
      row.querySelector("[data-action='edit-stock']").addEventListener("click", () => {
        const stockIndex = drinkStocks.items.findIndex(stock => stock.id && stock.id === item.stock_id);
        if (stockIndex < 0) {
          setStatus("The source stock item could not be found.", "error");
          return;
        }
        openDrinkStockModal(drinkStocks, drinkStocks.items[stockIndex], stockIndex, {
          onSaved: (savedItem, savedStocks) => {
            drinkStocks.items = savedStocks.items;
            setStatus("Drink stock item saved. Available Alcohol price remains charter-specific.", "ok");
            redraw();
          }
        });
      });
      row.querySelector("[data-action='remove-drink']").addEventListener("click", async () => {
        if (!await showAdminConfirm({
          title: "Remove Available Alcohol",
          message: `Remove ${displayName || "this item"} from this charter's Available Alcohol list?`,
          confirmLabel: "Remove",
          cancelLabel: "Cancel",
          tone: "danger"
        })) {
          return;
        }
        indexes.slice().sort((left, right) => right - left).forEach(removeIndex => {
          availableAlcohol.items.splice(removeIndex, 1);
        });
        markDirty();
        redraw();
      });
      container.appendChild(row);
    });
  }

  function bindAvailableAlcoholPanel(availableAlcohol, drinkStocks, charterId) {
    let dirty = false;
    const guard = {
      isDirty: () => dirty,
      confirmOptions: {
        title: "Unsaved Available Alcohol",
        message: "Discard unsaved Available Alcohol changes?",
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        tone: "danger"
      }
    };
    setPageUnsavedGuard(guard);
    const markDirty = () => {
      dirty = true;
    };
    const markClean = () => {
      dirty = false;
      clearPageUnsavedGuard(guard);
    };
    const redraw = () => drawAvailableAlcoholItems(availableAlcohol, drinkStocks, charterId, markDirty, redraw);
    const showPricesToggle = document.getElementById("available-alcohol-show-prices-to-guests");
    showPricesToggle?.addEventListener("change", event => {
      availableAlcohol.show_prices_to_guests = event.target.checked;
      markDirty();
    });

    document.getElementById("add-available-alcohol")?.addEventListener("click", async () => {
      const selectedItems = await openDrinkStockPicker({
        title: "Select Available Alcohol",
        multiSelect: true,
        lockedFilters: true,
        potentiallyAvailableAlcohol: true,
        allowOutOfStock: false,
        requireInStock: true,
        requireUnopened: true,
        categoryFilters: availableAlcoholCategoryValues(),
        excludeStockIds: availableAlcohol.items.map(item => item.stock_id).filter(Boolean),
        selectedCharterId: charterId
      });
      if (!Array.isArray(selectedItems) || !selectedItems.length) {
        return;
      }
      const existing = new Set(availableAlcohol.items.map(item => item.stock_id).filter(Boolean));
      selectedItems.forEach(stock => {
        if (!stock || !stock.id || existing.has(stock.id)) {
          return;
        }
        existing.add(stock.id);
        availableAlcohol.items.push(availableAlcoholItemFromStock(stock));
      });
      markDirty();
      redraw();
    });
    document.getElementById("preview-available-alcohol")?.addEventListener("click", () => {
      const previewItems = aggregateAvailableAlcoholRows(availableAlcohol.items, drinkStocks)
        .filter(row => !isInternalUseDrinkStock(row.stock))
        .map(row => row.display_item || availableAlcoholDisplayItem(row.item, row.stock));
      renderPreviewLightbox("Available Alcohol Preview", renderAvailableAlcoholPreview({
        show_prices_to_guests: availableAlcohol.show_prices_to_guests,
        items: previewItems
      }), { department: "hotel", printable: true });
    });
    document.getElementById("commit-available-alcohol")?.addEventListener("click", async () => {
      const saved = await saveAvailableAlcohol(charterId, availableAlcohol, "Available Alcohol saved.");
      if (saved) {
        markClean();
        await renderHotel();
      }
    });
    document.getElementById("cancel-available-alcohol")?.addEventListener("click", async () => {
      if (dirty && !await showAdminConfirm({
        title: "Discard Available Alcohol Changes",
        message: "Discard unsaved Available Alcohol changes?",
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        tone: "danger"
      })) {
        return;
      }
      try {
        const saved = await loadAvailableAlcohol(charterId);
        availableAlcohol.items = saved.items;
        availableAlcohol.show_prices_to_guests = saved.show_prices_to_guests;
        if (showPricesToggle) {
          showPricesToggle.checked = availableAlcohol.show_prices_to_guests === true;
        }
        dirty = false;
        redraw();
        setStatus("Available Alcohol changes cancelled.", "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    redraw();
  }

  function renderPurchasedAlcoholPanel() {
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Purchased Alcohol</h2>
        </div>
        <p class="muted">Charter purchase log with reversals and running bar bill.</p>
        <div class="purchased-alcohol-summary-bar">
          <div id="purchased-alcohol-total" class="purchased-alcohol-total"></div>
          <button type="button" id="purchased-alcohol-invoice-action" class="purchased-alcohol-print-button" title="Generate Customer Bill" aria-label="Generate Customer Bill">Print Bill</button>
        </div>
        <div id="purchased-alcohol-list-shell" class="purchased-alcohol-list-shell">
          <div id="purchased-alcohol-list-header" class="purchased-alcohol-list-header record-row purchased-alcohol-row" hidden>
            <span>Name</span>
            <span>Category</span>
            <span>Sub-category</span>
            <span>Price</span>
            <span>Purchased</span>
            <span class="purchased-alcohol-list-header-spacer" aria-hidden="true"></span>
          </div>
          <div id="purchased-alcohol-list" class="editor-list purchased-alcohol-list"></div>
        </div>
      </section>
    `;
  }

  function drawPurchasedAlcoholItems(purchases, charterId, redraw) {
    const container = document.getElementById("purchased-alcohol-list");
    const listHeader = document.getElementById("purchased-alcohol-list-header");
    const total = document.getElementById("purchased-alcohol-total");
    const invoiceButton = document.getElementById("purchased-alcohol-invoice-action");
    if (!container || !total) {
      return;
    }
    const activeItems = activeCharterAlcoholPurchases(purchases).slice().sort(compareCharterAlcoholPurchase);
    total.textContent = `Running Bar Bill: ${purchasedAlcoholTotalText(purchases)}`;
    if (invoiceButton) {
      const canGenerateInvoice = activeItems.length > 0;
      invoiceButton.disabled = !canGenerateInvoice;
      invoiceButton.title = canGenerateInvoice
        ? "Generate Customer Bill"
        : "No purchased alcohol items for this charter.";
      invoiceButton.setAttribute("aria-label", invoiceButton.title);
    }
    container.innerHTML = "";
    if (!activeItems.length) {
      if (listHeader) {
        listHeader.hidden = true;
      }
      container.innerHTML = `<p class="muted">No active alcohol purchases recorded for this charter.</p>`;
      return;
    }
    if (listHeader) {
      listHeader.hidden = false;
    }
    activeItems.forEach(purchase => {
      const displayName = formatAvailableAlcoholName(purchase, "Selection");
      const row = document.createElement("div");
      row.className = "record-row purchased-alcohol-row";
      row.innerHTML = `
        <div class="record-summary purchased-alcohol-summary">
          <strong class="purchased-alcohol-cell purchased-alcohol-name-cell" data-label="Name">${escapeHtml(displayName)}</strong>
          <span class="purchased-alcohol-cell" data-label="Category">${escapeHtml(availableAlcoholCategoryText(purchase))}</span>
          <span class="purchased-alcohol-cell" data-label="Sub-category">${escapeHtml(availableAlcoholSubCategoryText(purchase))}</span>
          <span class="purchased-alcohol-cell" data-label="Price">${escapeHtml(purchasedAlcoholPriceText(purchase))}</span>
          <span class="purchased-alcohol-cell" data-label="Purchased">${escapeHtml(purchasedAlcoholTimeText(purchase.purchased_at))}</span>
        </div>
        <div class="button-row record-actions">
          ${iconButtonHtml("reverse", "Reverse purchase", ` data-action="reverse-purchase"`)}
        </div>
      `;
      row.querySelector("[data-action='reverse-purchase']")?.addEventListener("click", async () => {
        if (!await showAdminConfirm({
          title: "Reverse Alcohol Purchase",
          message: "Reverse this purchase and return it to available stock?",
          confirmLabel: "Reverse",
          cancelLabel: "Cancel",
          tone: "danger"
        })) {
          return;
        }
        try {
          const result = await reverseCharterAlcoholPurchase(charterId, purchase.id);
          if (result?.purchase?.id) {
            const purchaseIndex = purchases.items.findIndex(item => item.id === result.purchase.id);
            if (purchaseIndex >= 0) {
              purchases.items[purchaseIndex] = result.purchase;
            }
          }
          setStatus(`${displayName} reversed and restored to stock.`, "ok");
          redraw();
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
      container.appendChild(row);
    });
  }

  function bindPurchasedAlcoholPanel(purchases, charterId, charterInfo) {
    const redraw = () => drawPurchasedAlcoholItems(purchases, charterId, redraw);
    document.getElementById("purchased-alcohol-invoice-action")?.addEventListener("click", () => {
      if (!activeCharterAlcoholPurchases(purchases).length) {
        return;
      }
      renderPreviewLightbox("Customer Bill", renderPurchasedAlcoholInvoicePreview(purchases, charterInfo), {
        department: "hotel",
        printable: true,
        showPrintOptions: false,
        printButtonLabel: "Print / Save PDF",
        extraStyles: purchasedAlcoholInvoicePreviewStyles()
      });
    });
    redraw();
  }

  function normalizeCocktailIngredient(ingredient) {
    const source = typeof ingredient === "string"
      ? { name: ingredient }
      : (ingredient && typeof ingredient === "object" ? ingredient : {});
    const name = typeof source.name === "string"
      ? source.name.trim()
      : (typeof source.label === "string" ? source.label.trim() : "");
    if (!name) {
      return null;
    }
    return { name };
  }

  function normalizeCocktailItem(item) {
    const source = item && typeof item === "object" ? item : {};
    const legacyIngredients = Array.isArray(source.ingredients)
      ? source.ingredients
      : (Array.isArray(source.recipe) ? source.recipe : []);
    return {
      name: typeof source.name === "string" ? source.name.trim() : "",
      description: typeof source.description === "string"
        ? source.description
        : (typeof source.notes === "string" ? source.notes : ""),
      ingredients: legacyIngredients.map(normalizeCocktailIngredient).filter(Boolean)
    };
  }

  function normalizeCocktails(value) {
    if (Array.isArray(value)) {
      return {
        cocktails: value
          .map(normalizeCocktailItem)
          .filter(cocktail => cocktail.name || cocktail.description || cocktail.ingredients.length)
      };
    }
    const source = value && typeof value === "object" ? value : {};
    const legacySections = Array.isArray(source.sections) ? source.sections : [];
    const legacyItems = legacySections.flatMap(section => Array.isArray(section && section.items) ? section.items : []);
    const items = Array.isArray(source.cocktails)
      ? source.cocktails
      : (Array.isArray(source.items) ? source.items : legacyItems);
    return {
      cocktails: items
        .map(normalizeCocktailItem)
        .filter(cocktail => cocktail.name || cocktail.description || cocktail.ingredients.length)
    };
  }

  function cocktailIngredientListText(ingredients) {
    return (Array.isArray(ingredients) ? ingredients : [])
      .map(normalizeCocktailIngredient)
      .filter(Boolean)
      .map(ingredient => ingredient.name)
      .filter(Boolean)
      .join(", ");
  }

  function renderCocktailsPanel() {
    return `
      <section class="card full">
        <div class="card-header">
          <h2>Cocktails</h2>
          <div class="button-row list-add-actions">
            ${iconButtonHtml("preview", "Preview Cocktails", ` id="preview-cocktails"`)}
            ${iconButtonHtml("add", "Add Cocktail", ` id="add-cocktail"`)}
            ${iconButtonHtml("save", "Save Cocktails", ` id="save-cocktails"`)}
            ${iconButtonHtml("cancel", "Cancel Cocktails changes", ` id="cancel-cocktails"`)}
          </div>
        </div>
        <p class="muted">Global cocktail recipes managed as a simple standalone list.</p>
        <div id="cocktails-list" class="editor-list cocktails-list"></div>
      </section>
    `;
  }

  function openCocktailItemModal(item, onSave) {
    const draft = normalizeCocktailItem(item || { name: "", description: "", ingredients: [] });
    const modal = openDialogModal(item ? "Edit Cocktail" : "Add Cocktail", `
      <form id="cocktail-item-form" class="form-grid">
        <label class="full">Name
          <input id="cocktail-item-name" value="${escapeAttribute(draft.name)}" required data-autofocus>
        </label>
        <label class="full">Description
          <textarea id="cocktail-item-description">${escapeText(draft.description)}</textarea>
        </label>
        <div class="full">
          <div class="card-header">
            <h3>Cocktail Ingredients</h3>
            <div class="button-row">
              ${iconButtonHtml("add", "Add ingredient", ` id="add-cocktail-ingredient"`)}
            </div>
          </div>
          <div id="cocktail-item-ingredients-list" class="cocktail-ingredients-list"></div>
        </div>
        ${modalActionButtonsHtml({ submitLabel: "Save cocktail" })}
      </form>
    `, { hideClose: true });
    const ingredientsContainer = modal.querySelector("#cocktail-item-ingredients-list");
    const drawIngredientEditorRows = () => {
      const ingredients = Array.isArray(draft.ingredients) ? draft.ingredients : [];
      if (!ingredients.length) {
        ingredientsContainer.innerHTML = `<p class="muted">No ingredients yet.</p>`;
        return;
      }
      ingredientsContainer.innerHTML = ingredients.map((ingredient, index) => {
        return `
          <div class="mini-item cocktail-ingredient-row" data-modal-ingredient-index="${index}">
            <label>
              <span>Ingredient ${index + 1}</span>
              <input data-ingredient-name value="${escapeAttribute(ingredient && ingredient.name ? ingredient.name : "")}" placeholder="Ingredient name">
            </label>
            <div class="button-row">
              ${orderingButtonsHtml("ingredient", index, ingredients.length)}
              ${iconButtonHtml("remove", `Delete ingredient ${index + 1}`, ` data-action="delete-ingredient"`)}
            </div>
          </div>
        `;
      }).join("");
      ingredientsContainer.querySelectorAll("[data-modal-ingredient-index]").forEach(row => {
        const index = Number(row.dataset.modalIngredientIndex);
        row.querySelector("[data-ingredient-name]")?.addEventListener("input", event => {
          draft.ingredients[index].name = event.target.value;
          markModalDirty(modal);
        });
        row.querySelector("[data-action='move-up']").addEventListener("click", () => {
          if (moveListItem(draft.ingredients, index, -1)) {
            markModalDirty(modal);
            drawIngredientEditorRows();
          }
        });
        row.querySelector("[data-action='move-down']").addEventListener("click", () => {
          if (moveListItem(draft.ingredients, index, 1)) {
            markModalDirty(modal);
            drawIngredientEditorRows();
          }
        });
        row.querySelector("[data-action='delete-ingredient']").addEventListener("click", async () => {
          if (!await showAdminConfirm({
            title: "Delete Ingredient",
            message: `Delete ${draft.ingredients[index]?.name || "this ingredient"} from this cocktail?`,
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
            tone: "danger"
          })) {
            return;
          }
          draft.ingredients.splice(index, 1);
          markModalDirty(modal);
          drawIngredientEditorRows();
        });
      });
    };
    modal.querySelector("#add-cocktail-ingredient").addEventListener("click", () => {
      draft.ingredients.push({ name: "" });
      markModalDirty(modal);
      drawIngredientEditorRows();
    });
    drawIngredientEditorRows();
    modal.querySelector("#cocktail-item-form").addEventListener("submit", event => {
      event.preventDefault();
      onSave({
        ...draft,
        name: modal.querySelector("#cocktail-item-name").value.trim(),
        description: modal.querySelector("#cocktail-item-description").value,
        ingredients: draft.ingredients.map(normalizeCocktailIngredient).filter(Boolean)
      });
      markModalSaved(modal);
      closeDialogModal();
    });
  }

  function drawCocktailRows(cocktails, markDirty, redraw) {
    const container = document.getElementById("cocktails-list");
    if (!container) {
      return;
    }
    container.innerHTML = "";
    if (!cocktails.cocktails.length) {
      container.innerHTML = `<p class="muted">No cocktails yet.</p>`;
      return;
    }
    cocktails.cocktails.forEach((cocktail, index) => {
      const row = document.createElement("div");
      row.className = "record-row cocktails-row";
      row.innerHTML = `
        <div class="record-summary cocktails-summary">
          <strong>${escapeHtml(cocktail.name || `Cocktail ${index + 1}`)}</strong>
          ${cocktail.description ? `<span class="full muted multiline-text">${escapeHtml(cocktail.description)}</span>` : ""}
          ${cocktailIngredientListText(cocktail.ingredients) ? `<span class="full cocktail-ingredient-list-preview">${escapeHtml(cocktailIngredientListText(cocktail.ingredients))}</span>` : ""}
        </div>
        <div class="button-row record-actions">
          ${orderingButtonsHtml("cocktail", index, cocktails.cocktails.length)}
          ${iconButtonHtml("edit", "Edit cocktail", ` data-action="edit-cocktail"`)}
          ${iconButtonHtml("remove", "Delete cocktail", ` data-action="delete-cocktail"`)}
        </div>
      `;
      row.querySelector("[data-action='move-up']").addEventListener("click", () => {
        if (moveListItem(cocktails.cocktails, index, -1)) {
          markDirty();
          redraw();
        }
      });
      row.querySelector("[data-action='move-down']").addEventListener("click", () => {
        if (moveListItem(cocktails.cocktails, index, 1)) {
          markDirty();
          redraw();
        }
      });
      row.querySelector("[data-action='edit-cocktail']").addEventListener("click", () => {
        openCocktailItemModal(cocktail, updated => {
          cocktails.cocktails[index] = normalizeCocktailItem(updated);
          markDirty();
          redraw();
        });
      });
      row.querySelector("[data-action='delete-cocktail']").addEventListener("click", async () => {
        if (!await showAdminConfirm({
          title: "Delete Cocktail",
          message: `Delete ${cocktail.name || "this cocktail"}?`,
          confirmLabel: "Delete",
          cancelLabel: "Cancel",
          tone: "danger"
        })) {
          return;
        }
        cocktails.cocktails.splice(index, 1);
        markDirty();
        redraw();
      });
      container.appendChild(row);
    });
  }

  function bindCocktailsPanel(cocktails) {
    let dirty = false;
    const guard = {
      isDirty: () => dirty,
      confirmOptions: {
        title: "Unsaved Cocktails",
        message: "Discard unsaved Cocktails changes?",
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        tone: "danger"
      }
    };
    setPageUnsavedGuard(guard);
    const markDirty = () => {
      dirty = true;
    };
    const markClean = () => {
      dirty = false;
      clearPageUnsavedGuard(guard);
    };
    const redraw = () => {
      cocktails.cocktails = normalizeCocktails(cocktails).cocktails;
      drawCocktailRows(cocktails, markDirty, redraw);
    };
    document.getElementById("add-cocktail")?.addEventListener("click", () => {
      openCocktailItemModal(null, cocktail => {
        cocktails.cocktails.push(normalizeCocktailItem(cocktail));
        markDirty();
        redraw();
      });
    });
    document.getElementById("preview-cocktails")?.addEventListener("click", () => {
      renderPreviewLightbox("Cocktails Preview", renderCocktailsPreview(cocktails), {
        department: "hotel",
        printable: true,
        extraStyles: cocktailsPreviewStyles()
      });
    });
    document.getElementById("save-cocktails")?.addEventListener("click", async () => {
      const saved = await saveCocktails(cocktails, "Cocktails saved.");
      if (saved) {
        cocktails.cocktails = saved.cocktails;
        markClean();
        await renderHotel();
      }
    });
    document.getElementById("cancel-cocktails")?.addEventListener("click", async () => {
      if (dirty && !await showAdminConfirm({
        title: "Discard Cocktails Changes",
        message: "Discard unsaved Cocktails changes?",
        confirmLabel: "Discard",
        cancelLabel: "Cancel",
        tone: "danger"
      })) {
        return;
      }
      try {
        const saved = await loadCocktails();
        cocktails.cocktails = saved.cocktails;
        dirty = false;
        redraw();
        setStatus("Cocktails changes cancelled.", "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
    redraw();
  }

  async function renderHotel() {
    const panels = [
      { id: "guests", label: "Guests" },
      { id: "drink-stocks", label: "Drink Stocks" },
      { id: "guest-drinks", label: "Guest Alcohol" },
      { id: "available-alcohol", label: "Available Alcohol" },
      { id: "purchased-alcohol", label: "Purchased Alcohol" },
      { id: "cocktails", label: "Cocktails" }
    ];
    if (state.sectionPanels.hotel === "guest-alcohol") {
      state.sectionPanels.hotel = "available-alcohol";
    }
    if (state.sectionPanels.hotel === "non-alcoholic") {
      state.sectionPanels.hotel = "guest-drinks";
    }
    const activePanel = panels.some(panel => panel.id === state.sectionPanels.hotel) ? state.sectionPanels.hotel : "guests";
    state.sectionPanels.hotel = activePanel;
    els.workspace.innerHTML = sectionShell("hotel", panels, activePanel, `<section class="card"><p class="muted">Loading hotel data...</p></section>`, sectionToolbarHtml("hotel"));
    try {
      const needsCharterBundle = activePanel === "guests" || activePanel === "drink-stocks" || activePanel === "guest-drinks" || activePanel === "purchased-alcohol";
      const bundle = needsCharterBundle ? await loadCharter(state.selectedCharter) : {};
      const charterInfo = normalizeCharterInfo(bundle["charter.json"]);
      const drinks = normalizeGuestDrinks(bundle[GUEST_DRINKS_FILE_NAME]);
      const guestList = normalizeGuestListForCount(bundle["guest_list.json"], charterInfo.guest_count);
      const drinkStocks = activePanel === "drink-stocks" || activePanel === "guest-drinks" ? await loadDrinkStocks() : null;
      const cocktails = activePanel === "cocktails" ? await loadCocktails() : null;
      const availableDrinkStocks = activePanel === "available-alcohol" ? await loadDrinkStocks() : null;
      const availableAlcohol = activePanel === "available-alcohol" ? await loadAvailableAlcohol(state.selectedCharter) : null;
      const purchases = activePanel === "purchased-alcohol" ? await loadCharterAlcoholPurchases(state.selectedCharter) : null;
      let content = "";
      if (activePanel === "guests") {
        content = renderGuestsPanel({
          title: "Guests"
        });
      } else if (activePanel === "drink-stocks") {
        content = renderDrinkStocksPanel(drinkStocks);
      } else if (activePanel === "cocktails") {
        content = renderCocktailsPanel();
      } else if (activePanel === "guest-drinks") {
        content = renderGuestDrinksPanel();
      } else if (activePanel === "available-alcohol") {
        content = renderAvailableAlcoholPanel(availableAlcohol);
      } else if (activePanel === "purchased-alcohol") {
        content = renderPurchasedAlcoholPanel();
      } else {
        content = placeholderCard("Hotel");
      }
      els.workspace.innerHTML = sectionShell("hotel", panels, activePanel, content, sectionToolbarHtml("hotel"));
      bindSectionNav("hotel", renderHotel);
      bindSectionToolbar("hotel", renderHotel);
      if (activePanel === "guests") {
        const fullGuestAccess = canManageCharterAdmin();
        bindGuestsPanel(guestList, {
          charterInfo,
          allowDelete: false,
          allowDeleteInactive: true,
          allowEdit: true,
          allowReorder: fullGuestAccess,
          allowPromoteInactive: true,
          canChangePrincipal: fullGuestAccess,
          readOnlyName: !fullGuestAccess,
          emptyMessage: "No guests are assigned to this charter yet.",
          saveSuccessMessage: "Guest info saved."
        });
        return;
      }
      if (activePanel === "drink-stocks") {
        bindDrinkStocksPanel(drinkStocks, charterInfo);
        return;
      }
      if (activePanel === "cocktails") {
        bindCocktailsPanel(cocktails);
        return;
      }
      if (activePanel === "guest-drinks") {
        bindGuestDrinksPanel(drinks, drinkStocks, state.selectedCharter);
        return;
      }
      if (activePanel === "available-alcohol") {
        bindAvailableAlcoholPanel(availableAlcohol, availableDrinkStocks, state.selectedCharter);
        return;
      }
      if (activePanel === "purchased-alcohol") {
        bindPurchasedAlcoholPanel(purchases, state.selectedCharter, charterInfo);
        return;
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function normalizeGuestDrinks(value) {
    const source = value && typeof value === "object" ? cloneData(value) : {};
    const sections = [];
    const sectionIndexes = new Map();
    (Array.isArray(source.sections) ? source.sections : []).forEach(section => {
      const normalizedSection = normalizeGuestDrinkSection(section);
      const key = guestDrinkCategoryKey(normalizedSection.category);
      const existingIndex = sectionIndexes.get(key);
      if (existingIndex === undefined) {
        sectionIndexes.set(key, sections.length);
        sections.push(normalizedSection);
        return;
      }
      const target = sections[existingIndex];
      const seenStockIds = new Set(target.items.map(item => item.stock_id.toLocaleLowerCase()));
      normalizedSection.items.forEach(item => {
        const itemKey = item.stock_id.toLocaleLowerCase();
        if (seenStockIds.has(itemKey)) {
          return;
        }
        seenStockIds.add(itemKey);
        target.items.push(item);
      });
    });
    return { sections };
  }

  function normalizeGuestDrinkSection(section) {
    const source = section && typeof section === "object" ? section : {};
    const rawCategory = typeof source.category === "string" && source.category.trim()
      ? source.category
      : (typeof source.title === "string" ? source.title : "");
    const seenStockIds = new Set();
    const items = [];
    (Array.isArray(source.items) ? source.items : []).forEach(item => {
      const normalized = normalizeGuestDrinkItem(item);
      if (!normalized) {
        return;
      }
      const key = normalized.stock_id.toLocaleLowerCase();
      if (seenStockIds.has(key)) {
        return;
      }
      seenStockIds.add(key);
      items.push(normalized);
    });
    return {
      category: guestDrinkCategoryText(rawCategory),
      items
    };
  }

  function normalizeGuestDrinkItem(item) {
    const source = item && typeof item === "object" ? item : {};
    const stockId = typeof source.stock_id === "string" ? source.stock_id.trim() : "";
    if (!stockId) {
      return null;
    }
    const description = typeof source.description === "string"
      ? source.description
      : (typeof source.notes === "string" ? source.notes : "");
    const normalized = { stock_id: stockId };
    if (description) {
      normalized.description = description;
    }
    return normalized;
  }

  function guestDrinksData(drinks) {
    if (!drinks || typeof drinks !== "object") {
      return { sections: [] };
    }
    if (!Array.isArray(drinks.sections)) {
      drinks.sections = [];
    }
    drinks.sections = normalizeGuestDrinks(drinks).sections;
    return drinks;
  }

  async function saveCharterFile(file, data, successMessage) {
    try {
      const payload = await api(`/api/admin/charter/${encodeURIComponent(state.selectedCharter)}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file, data })
      });
      const savedData = payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data")
        ? payload.data
        : payload;
      if (state.bundle && file) {
        state.bundle[file] = cloneData(savedData);
      }
      setStatus(successMessage || `${file} saved.`, "ok");
      return savedData;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }

  async function setActiveCharter(charterId) {
    if (!canChangeActiveCharter()) {
      setStatus("Only Charter Admin on Bridge can change the active charter.", "error");
      return;
    }
    const charter = state.charters.find(candidate => candidate.id === charterId);
    if (!charterId || !charter) {
      setStatus("Unknown charter.", "error");
      return;
    }
    if (!await confirmActiveCharterDateStatus(charter)) {
      return;
    }
    if (activeCharterDateStatus(charter) === "current" && !await showAdminConfirm({
      title: "Set Active Charter",
      message: `Set ${charterId} as the active charter?`,
      confirmLabel: "Set active",
      cancelLabel: "Cancel",
      tone: "normal"
    })) {
      return;
    }
    try {
      const result = await api("/api/admin/active-charter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charter_id: charterId })
      });
      state.activeCharter = result.active_charter;
      state.selectedCharter = result.active_charter;
      syncSelectedCharter();
      syncTopbar();
      renderSection();
      setStatus("Active charter updated.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  els.loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const department = els.department ? els.department.value : "";
    const password = els.password.value;
    els.loginError.textContent = "";
    els.loginButton.disabled = true;
    try {
      await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: adminKey,
          department,
          password
        })
      });
      els.password.value = "";
      closeLoginModal();
      await loadBootstrap();
    } catch (error) {
      els.password.value = "";
      els.password.focus();
      els.loginError.textContent = error.message || "Login failed. Check the key, department, and password.";
    } finally {
      els.loginButton.disabled = false;
    }
  });

  els.departmentButtons.addEventListener("click", async event => {
    const button = event.target.closest("button[data-section]");
    if (!button || button.disabled) {
      return;
    }
    if (button.dataset.section === state.selectedSection) {
      return;
    }
    if (!await confirmDiscardPageChanges()) {
      return;
    }
    state.selectedSection = button.dataset.section;
    renderSection();
  });

  els.settingsButton.addEventListener("click", async () => {
    if (!state.allowedSections.includes("settings")) {
      return;
    }
    if (state.selectedSection === "settings") {
      return;
    }
    if (!await confirmDiscardPageChanges()) {
      return;
    }
    state.selectedSection = "settings";
    renderSection();
  });

  els.loginChoices.addEventListener("click", event => {
    const button = event.target.closest("button[data-department]");
    if (!button) {
      return;
    }
    openLoginModal(button.dataset.department, button.dataset.title);
  });

  els.cancelLoginButton.addEventListener("click", closeLoginModal);
  els.loginModal.addEventListener("click", event => {
    if (event.target === els.loginModal) {
      closeLoginModal();
    }
  });

  els.switchDepartmentButton.addEventListener("click", async () => {
    if (await confirmDiscardPageChanges()) {
      logoutAndReturnToLogin();
    }
  });
  els.resetSessionButton.addEventListener("click", resetSessionForDevelopment);

  loadBootstrap();
})();
