(() => {
  "use strict";

  const STORAGE_KEYS = {
    settings: "apexDispatch.settings.v2",
    settingsLegacy: "apexDispatch.settings.v1",
    restaurants: "apexDispatch.restaurants.v1",
    shift: "apexDispatch.shift.v1",
  };

  const defaultSettings = {
    vehicleCost: 0.50,
    coreGrossPerMile: 1.75,
    conditionalGrossPerMile: 2.25,
    outerGrossPerMile: 2.50,
    minimumPayout: 7.00,
    targetGrossHourly: 25,
    strongGrossHourly: 30,
    maxOrderMinutes: 30,
    routesWorkerUrl: "https://api.benlane.us",
    defaultRecoveryAddress: "Red Cliffs Mall, St. George, UT",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    trafficModel: "BEST_GUESS",
    routeRefreshMinutes: 3,
    routeRefreshMiles: 0.4,
    autoRefreshRoutes: false,
    includeTrafficPolyline: false,
  };

  const defaultShift = {
    state: "off",
    startedAt: null,
    endedAt: null,
    breakStartedAt: null,
    totalBreakMs: 0,
    logs: [],
  };

  const routeState = {
    currentPosition: null,
    currentPositionAt: null,
    useGpsOrigin: false,
    matrixGpsPoint: null,
    matrixUseGps: false,
    plan: null,
    inputsDirty: false,
    calculating: false,
    lastRouteOrigin: null,
    watchId: null,
    lastAutoRefreshAttempt: 0,
  };

  let settings = loadSettings();
  let restaurants = loadJson(STORAGE_KEYS.restaurants, []);
  let shift = loadJson(STORAGE_KEYS.shift, defaultShift);
  let lastOffer = null;
  let deferredInstallPrompt = null;
  let latestMatrixResults = [];

  const $ = (id) => document.getElementById(id);
  const money = (value) => `$${Number(value || 0).toFixed(2)}`;
  const oneDecimal = (value) => Number(value || 0).toFixed(1);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const routeWorkerBase = () => String(settings.routesWorkerUrl || "").trim().replace(/\/+$/, "");

  function clone(value) {
    return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  }

  function loadSettings() {
    const current = loadJson(STORAGE_KEYS.settings, null);
    if (current) return { ...defaultSettings, ...current };
    const legacy = loadJson(STORAGE_KEYS.settingsLegacy, {});
    return { ...defaultSettings, ...legacy };
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback === null ? null : clone(fallback);
      const parsed = JSON.parse(raw);
      if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : clone(fallback);
      if (fallback === null) return parsed;
      return { ...fallback, ...parsed };
    } catch {
      return fallback === null ? null : clone(fallback);
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readNumber(id, fallback = 0) {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function getRestaurantIntel(name) {
    const normalized = String(name || "").trim().toLowerCase();
    return restaurants.find((entry) => entry.name.trim().toLowerCase() === normalized) || null;
  }

  function zoneThreshold(zone) {
    if (zone === "conditional") return settings.conditionalGrossPerMile;
    if (zone === "outer") return settings.outerGrossPerMile;
    return settings.coreGrossPerMile;
  }

  function routeIsStale() {
    if (!routeState.plan) return true;
    if (routeState.inputsDirty) return true;
    const ageMinutes = (Date.now() - new Date(routeState.plan.computedAt).getTime()) / 60000;
    return ageMinutes >= Number(settings.routeRefreshMinutes || 3);
  }

  function evaluateOffer(data) {
    const operationalMiles = Math.max(0.1, data.displayedMiles + data.returnMiles);
    const restaurantIntel = getRestaurantIntel(data.merchant);
    const intelligenceWait = restaurantIntel ? restaurantIntel.wait : data.waitMinutes;
    const waitMinutes = Math.max(data.waitMinutes, intelligenceWait || 0);
    const shoppingMinutes = data.platform.includes("Shop") ? Math.max(0, data.itemCount * 1.25) : 0;
    const stopPenaltyMinutes = Math.max(0, data.stops - 1) * 7;
    const accessPenaltyMinutes = data.apartment ? 6 : 0;
    const totalMinutes = Math.max(
      1,
      waitMinutes + data.driveMinutes + data.returnMinutes + shoppingMinutes + stopPenaltyMinutes + accessPenaltyMinutes,
    );
    const vehicleCost = operationalMiles * settings.vehicleCost;
    const netBeforeTax = data.payout - vehicleCost;
    const grossPerMile = data.payout / operationalMiles;
    const netPerMile = netBeforeTax / operationalMiles;
    const grossHourly = data.payout / (totalMinutes / 60);
    const netHourly = netBeforeTax / (totalMinutes / 60);
    const requiredPerMile = zoneThreshold(data.zone);
    const trafficDelayMinutes = routeState.plan?.totals?.trafficDelayMinutes || 0;
    const hasFreshRoute = Boolean(routeState.plan) && !routeIsStale();

    let score = 50;
    score += clamp((grossPerMile - requiredPerMile) * 16, -32, 28);
    score += clamp((grossHourly - settings.targetGrossHourly) * 1.4, -24, 22);
    score += clamp((data.payout - settings.minimumPayout) * 2.2, -16, 16);
    score += clamp((settings.maxOrderMinutes - totalMinutes) * 0.7, -15, 10);

    if (restaurantIntel) {
      const gradeAdjustment = { A: 8, B: 2, C: -8, D: -18 }[restaurantIntel.grade] || 0;
      score += gradeAdjustment;
    }
    if (data.apartment) score -= 7;
    if (data.heavyItems) score -= 8;
    if (data.stops > 1) score -= Math.min(12, (data.stops - 1) * 4);
    if (data.peakWindow && totalMinutes > 32) score -= 7;
    if (data.endsNearHome) score += 7;
    if (data.platform.includes("Shop") && data.itemCount > 20) score -= 10;
    if (data.platform.includes("Shop") && data.itemCount <= 10 && data.payout >= 15) score += 8;
    if (data.zone === "outer") score -= 7;
    if (hasFreshRoute) score += 3;
    if (routeState.plan && routeIsStale()) score -= 4;
    if (trafficDelayMinutes >= 10) score -= 7;
    else if (trafficDelayMinutes >= 5) score -= 3;

    score = Math.round(clamp(score, 0, 100));

    const hardDecline =
      data.payout < settings.minimumPayout - 2 ||
      grossPerMile < requiredPerMile * 0.72 ||
      netBeforeTax <= 2 ||
      (data.zone === "outer" && grossPerMile < settings.outerGrossPerMile);

    let verdict = "MAYBE";
    if (hardDecline || score < 48) verdict = "DECLINE";
    else if (score >= 68 && grossPerMile >= requiredPerMile && grossHourly >= settings.targetGrossHourly) verdict = "ACCEPT";

    const reasons = [];
    const risks = [];

    if (grossPerMile >= requiredPerMile + 0.5) reasons.push("Strong gross dollars per operational mile.");
    else if (grossPerMile >= requiredPerMile) reasons.push("Meets the territory-specific mileage threshold.");
    else risks.push(`Below the ${money(requiredPerMile)} gross-per-mile threshold for this zone.`);

    if (grossHourly >= settings.strongGrossHourly) reasons.push("Projected hourly rate is in the strong range.");
    else if (grossHourly >= settings.targetGrossHourly) reasons.push("Projected hourly rate meets target.");
    else risks.push("Projected hourly rate is below target.");

    if (restaurantIntel?.grade === "A") reasons.push("Restaurant is graded A in local intelligence.");
    if (restaurantIntel?.grade === "C" || restaurantIntel?.grade === "D") risks.push(`Restaurant is graded ${restaurantIntel.grade} and carries delay risk.`);
    if (data.returnMiles > 0) risks.push(`${oneDecimal(data.returnMiles)} recovery miles are included.`);
    if (data.apartment) risks.push("Access complexity may extend completion time.");
    if (data.heavyItems) risks.push("Heavy-item handling risk applies.");
    if (data.zone === "outer") risks.push("Outer-zone drop-off can reduce next-order availability.");
    if (data.platform.includes("Shop") && data.itemCount > 15) risks.push("Shopping item count may create substitution and checkout delays.");
    if (data.endsNearHome) reasons.push("Final-order positioning benefit reduces deadhead cost.");
    if (hasFreshRoute) reasons.push("Traffic-aware route mileage and ETA are current.");
    if (routeState.plan && routeIsStale()) risks.push("Route data is stale or the route inputs changed; refresh before relying on ETA.");
    if (trafficDelayMinutes >= 1) risks.push(`Current traffic adds about ${oneDecimal(trafficDelayMinutes)} minutes.`);

    const dispatcherInstructions = [];
    const driverInstructions = [];
    const pickupEta = routeState.plan?.totals?.pickupEta ? formatClock(routeState.plan.totals.pickupEta) : null;
    const deliveryEta = routeState.plan?.totals?.deliveryEta ? formatClock(routeState.plan.totals.deliveryEta) : null;
    const recoveryEta = routeState.plan?.totals?.recoveryEta ? formatClock(routeState.plan.totals.recoveryEta) : null;

    if (verdict === "ACCEPT") {
      dispatcherInstructions.push("Recommend ACCEPT immediately if DoorDash matches the entered payout, pickup, and destination.");
      if (pickupEta && deliveryEta) dispatcherInstructions.push(`Traffic estimate: pickup ${pickupEta}; delivery ${deliveryEta}${recoveryEta ? `; recovery ${recoveryEta}` : ""}.`);
      dispatcherInstructions.push("Set the recovery point before pickup and refresh traffic if the route becomes stale.");
      dispatcherInstructions.push("Start timing the restaurant wait and update the merchant grade after completion.");
      driverInstructions.push("JF makes the final acceptance in DoorDash and confirms the official route before moving.");
      driverInstructions.push("Use the navigation buttons only when safely parked or handled by BL.");
    } else if (verdict === "MAYBE") {
      dispatcherInstructions.push("Recommend MAYBE: accept only if the restaurant is on time and the destination does not add hidden access or recovery cost.");
      dispatcherInstructions.push("Review alternative routes and current traffic before giving the instruction.");
      driverInstructions.push("JF should accept only after confirming there are no hidden access, traffic, parking, or route problems.");
    } else {
      dispatcherInstructions.push("Recommend DECLINE and remain parked in the current productive staging area.");
      dispatcherInstructions.push("Do not reposition solely because of this declined offer; use the destination matrix before a deliberate move.");
      driverInstructions.push("JF declines manually and maintains safe staging. Do not chase the hotspot marker without a dispatch reason.");
    }

    return {
      ...data,
      operationalMiles,
      totalMinutes,
      vehicleCost,
      netBeforeTax,
      grossPerMile,
      netPerMile,
      grossHourly,
      netHourly,
      requiredPerMile,
      restaurantIntel,
      score,
      verdict,
      reasons,
      risks,
      dispatcherInstructions,
      driverInstructions,
      route: routeState.plan ? summarizeRoutePlan(routeState.plan) : null,
    };
  }

  function readOfferForm() {
    return {
      platform: $("platform").value,
      payout: readNumber("payout"),
      displayedMiles: readNumber("displayedMiles"),
      returnMiles: readNumber("returnMiles"),
      merchant: $("merchant").value.trim(),
      zone: $("zone").value,
      waitMinutes: readNumber("waitMinutes", 8),
      driveMinutes: readNumber("driveMinutes", 18),
      returnMinutes: readNumber("returnMinutes", 0),
      stops: Math.max(1, readNumber("stops", 1)),
      itemCount: Math.max(0, readNumber("itemCount", 0)),
      apartment: $("apartment").checked,
      heavyItems: $("heavyItems").checked,
      peakWindow: $("peakWindow").checked,
      endsNearHome: $("endsNearHome").checked,
    };
  }

  function renderOfferResult(result) {
    lastOffer = result;
    const badge = $("verdictBadge");
    badge.textContent = result.verdict;
    badge.className = `verdict verdict-${result.verdict.toLowerCase()}`;

    const summaryParts = [];
    if (result.reasons.length) summaryParts.push(result.reasons.join(" "));
    if (result.risks.length) summaryParts.push(`Risk: ${result.risks.join(" ")}`);
    $("decisionSummary").textContent = summaryParts.join(" ") || "Offer scored with neutral indicators.";

    $("scoreMetric").textContent = `${result.score}/100`;
    $("operationalMilesMetric").textContent = `${oneDecimal(result.operationalMiles)} mi`;
    $("grossPerMileMetric").textContent = money(result.grossPerMile);
    $("netPerMileMetric").textContent = money(result.netPerMile);
    $("grossHourlyMetric").textContent = `${money(result.grossHourly)}/hr`;
    $("netOrderMetric").textContent = money(result.netBeforeTax);

    renderList("dispatcherInstructions", result.dispatcherInstructions);
    renderList("driverInstructions", result.driverInstructions);
    $("logAccepted").disabled = false;
    $("logDeclined").disabled = false;
  }

  function renderList(id, items) {
    $(id).innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      $(id).appendChild(li);
    });
  }

  function resetOfferForm() {
    $("offerForm").reset();
    $("waitMinutes").value = 8;
    $("driveMinutes").value = 18;
    $("returnMinutes").value = 0;
    $("stops").value = 1;
    $("itemCount").value = 0;
    $("peakWindow").checked = true;
    $("routeAlternatives").checked = true;
    $("avoidTolls").checked = false;
    $("avoidHighways").checked = false;
    $("avoidFerries").checked = true;
    $("pickupAddress").value = "";
    $("dropoffAddress").value = "";
    $("recoveryAddress").value = settings.defaultRecoveryAddress || "";
    lastOffer = null;
    clearRoutePlan();
    $("verdictBadge").textContent = "WAITING";
    $("verdictBadge").className = "verdict verdict-neutral";
    $("decisionSummary").textContent = "Enter the offer details to calculate profitability, time efficiency, vehicle cost, traffic, and territory risk.";
    ["scoreMetric", "operationalMilesMetric", "grossPerMileMetric", "netPerMileMetric", "grossHourlyMetric", "netOrderMetric"].forEach((id) => $(id).textContent = "—");
    renderList("dispatcherInstructions", ["Enter an offer to generate the dispatch recommendation."]);
    renderList("driverInstructions", ["JF retains control of the app, vehicle, safety decisions, and final acceptance."]);
    $("logAccepted").disabled = true;
    $("logDeclined").disabled = true;
  }

  async function useCurrentLocationForOrigin() {
    setRouteStatus("Requesting device location…", "warn");
    try {
      const point = await getCurrentPosition();
      routeState.currentPosition = point;
      routeState.currentPositionAt = Date.now();
      routeState.useGpsOrigin = true;
      $("originAddress").value = "";
      $("originAddress").placeholder = `GPS ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
      $("originLocationStatus").textContent = `GPS accuracy approximately ${Math.round(point.accuracy || 0)} m. Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
      markRouteDirty("GPS origin updated. Recalculate the route.");
      if (settings.autoRefreshRoutes) startLocationWatch();
    } catch (error) {
      setRouteStatus(locationErrorMessage(error), "bad");
    }
  }

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by this browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }),
        reject,
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
      );
    });
  }

  function locationErrorMessage(error) {
    if (error?.code === 1) return "Location permission was denied. Enter a starting address or enable location permission.";
    if (error?.code === 2) return "The device could not determine its location.";
    if (error?.code === 3) return "Location request timed out. Try again outdoors or enter an address.";
    return error?.message || "Unable to obtain device location.";
  }

  function pointForOrigin() {
    if (routeState.useGpsOrigin && routeState.currentPosition) {
      return {
        latitude: routeState.currentPosition.latitude,
        longitude: routeState.currentPosition.longitude,
      };
    }
    const address = $("originAddress").value.trim();
    return address ? { address } : null;
  }

  function pointFromAddressInput(id) {
    const address = $(id).value.trim();
    return address ? { address } : null;
  }

  function routeRequestOptions() {
    return {
      routingPreference: settings.routingPreference,
      trafficModel: settings.trafficModel,
      alternatives: $("routeAlternatives").checked,
      avoidTolls: $("avoidTolls").checked,
      avoidHighways: $("avoidHighways").checked,
      avoidFerries: $("avoidFerries").checked,
      includeTrafficPolyline: settings.includeTrafficPolyline,
    };
  }

  async function calculateRoutePlan({ automatic = false } = {}) {
    if (routeState.calculating) return;
    const worker = routeWorkerBase();
    if (!worker) {
      setRouteStatus("Set the Cloudflare Worker URL in Settings.", "bad");
      return;
    }

    let origin = pointForOrigin();
    if (!origin) {
      try {
        const point = await getCurrentPosition();
        routeState.currentPosition = point;
        routeState.currentPositionAt = Date.now();
        routeState.useGpsOrigin = true;
        origin = { latitude: point.latitude, longitude: point.longitude };
        $("originAddress").placeholder = `GPS ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
      } catch {
        setRouteStatus("Enter a starting address or tap Use GPS.", "bad");
        return;
      }
    }

    const pickup = pointFromAddressInput("pickupAddress");
    const dropoff = pointFromAddressInput("dropoffAddress");
    const recovery = pointFromAddressInput("recoveryAddress");
    if (!pickup || !dropoff) {
      setRouteStatus("Pickup and customer addresses are required.", "bad");
      return;
    }

    routeState.calculating = true;
    setButtonLoading("calculateRoute", true);
    $("refreshRoute").disabled = true;
    setRouteStatus(automatic ? "Auto-refreshing traffic…" : "Calculating traffic-aware routes and alternatives…", "warn");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(`${worker}/route-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          origin,
          pickup,
          dropoff,
          recovery,
          pickupWaitMinutes: readNumber("waitMinutes", 8),
          dropoffMinutes: $("apartment").checked ? 7 : 3,
          options: routeRequestOptions(),
        }),
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload?.error || `Route service returned ${response.status}.`);

      routeState.plan = payload;
      routeState.inputsDirty = false;
      routeState.lastRouteOrigin = origin;
      applyRoutePlanToOffer(payload);
      renderRoutePlan();
      setRouteStatus(`Route calculated at ${formatClock(payload.computedAt)}. Mileage and time fields were updated.`, "good");
      if (readNumber("payout") > 0) renderOfferResult(evaluateOffer(readOfferForm()));
      if (settings.autoRefreshRoutes) startLocationWatch();
    } catch (error) {
      const message = error?.name === "AbortError" ? "Route request timed out." : error?.message || "Route request failed.";
      setRouteStatus(message, "bad");
    } finally {
      clearTimeout(timeout);
      routeState.calculating = false;
      setButtonLoading("calculateRoute", false);
      $("refreshRoute").disabled = !routeState.plan;
      renderRouteFreshness();
    }
  }

  async function parseJsonResponse(response) {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { error: text || "Invalid response from route service." };
    }
  }

  function applyRoutePlanToOffer(plan) {
    const pickup = defaultRoute(plan?.legs?.toPickup);
    const dropoff = defaultRoute(plan?.legs?.toDropoff);
    const recovery = defaultRoute(plan?.legs?.toRecovery);
    if (!pickup || !dropoff) return;

    $("displayedMiles").value = (pickup.miles + dropoff.miles).toFixed(1);
    $("returnMiles").value = recovery ? recovery.miles.toFixed(1) : "0.0";
    $("driveMinutes").value = Math.ceil((pickup.durationSeconds + dropoff.durationSeconds) / 60);
    $("returnMinutes").value = recovery ? Math.ceil(recovery.durationSeconds / 60) : 0;
  }

  function defaultRoute(leg) {
    return leg?.routes?.[0] || null;
  }

  function summarizeRoutePlan(plan) {
    return {
      computedAt: plan.computedAt,
      stale: routeIsStale(),
      pickupMiles: defaultRoute(plan.legs?.toPickup)?.miles || 0,
      pickupMinutes: defaultRoute(plan.legs?.toPickup)?.minutes || 0,
      dropoffMiles: defaultRoute(plan.legs?.toDropoff)?.miles || 0,
      dropoffMinutes: defaultRoute(plan.legs?.toDropoff)?.minutes || 0,
      recoveryMiles: defaultRoute(plan.legs?.toRecovery)?.miles || 0,
      recoveryMinutes: defaultRoute(plan.legs?.toRecovery)?.minutes || 0,
      trafficDelayMinutes: plan.totals?.trafficDelayMinutes || 0,
      pickupEta: plan.totals?.pickupEta || null,
      deliveryEta: plan.totals?.deliveryEta || null,
      recoveryEta: plan.totals?.recoveryEta || null,
    };
  }

  function renderRoutePlan() {
    const plan = routeState.plan;
    if (!plan) {
      clearRouteMetrics();
      return;
    }

    const pickup = defaultRoute(plan.legs?.toPickup);
    const dropoff = defaultRoute(plan.legs?.toDropoff);
    const recovery = defaultRoute(plan.legs?.toRecovery);
    $("pickupRouteMetric").textContent = routeMetricText(pickup);
    $("dropoffRouteMetric").textContent = routeMetricText(dropoff);
    $("recoveryRouteMetric").textContent = recovery ? routeMetricText(recovery) : "Not included";
    $("trafficDelayMetric").textContent = `${oneDecimal(plan.totals?.trafficDelayMinutes || 0)} min`;
    $("pickupEtaMetric").textContent = formatClock(plan.totals?.pickupEta);
    $("deliveryEtaMetric").textContent = formatClock(plan.totals?.deliveryEta);
    $("recoveryEtaMetric").textContent = plan.totals?.recoveryEta ? formatClock(plan.totals.recoveryEta) : "—";
    $("totalRouteMetric").textContent = `${oneDecimal(plan.totals?.miles || 0)} mi / ${Math.ceil(plan.totals?.minutes || 0)} min`;

    renderAlternatives(plan);
    drawRoutePreview(plan);
    $("refreshRoute").disabled = false;
    $("openFullRoute").disabled = false;
    $("navigatePickup").disabled = false;
    $("navigateDropoff").disabled = false;
    $("navigateRecovery").disabled = !pointFromAddressInput("recoveryAddress");
    renderRouteFreshness();
  }

  function routeMetricText(route) {
    if (!route) return "—";
    return `${oneDecimal(route.miles)} mi / ${Math.ceil(route.minutes)} min`;
  }

  function clearRoutePlan() {
    routeState.plan = null;
    routeState.inputsDirty = false;
    routeState.lastRouteOrigin = null;
    clearRouteMetrics();
    setRouteStatus("Set the Worker URL in Settings, then enter pickup and drop-off locations.", "");
  }

  function clearRouteMetrics() {
    [
      "pickupRouteMetric", "dropoffRouteMetric", "recoveryRouteMetric", "trafficDelayMetric",
      "pickupEtaMetric", "deliveryEtaMetric", "recoveryEtaMetric", "totalRouteMetric",
    ].forEach((id) => { $(id).textContent = "—"; });
    $("routeAlternativesPanel").innerHTML = '<p class="empty-state compact-empty">Calculate a route to compare traffic-aware alternatives.</p>';
    $("routePreviewWrap").hidden = true;
    $("routePreview").replaceChildren();
    $("refreshRoute").disabled = true;
    $("openFullRoute").disabled = true;
    $("navigatePickup").disabled = true;
    $("navigateDropoff").disabled = true;
    $("navigateRecovery").disabled = true;
    renderRouteFreshness();
  }

  function renderAlternatives(plan) {
    const panel = $("routeAlternativesPanel");
    panel.innerHTML = "";
    const groups = [
      ["To pickup", plan.legs?.toPickup],
      ["Pickup to customer", plan.legs?.toDropoff],
      ["Customer to recovery", plan.legs?.toRecovery],
    ].filter(([, leg]) => leg?.routes?.length);

    groups.forEach(([label, leg]) => {
      const group = document.createElement("div");
      group.className = "route-leg-group";
      const heading = document.createElement("h4");
      heading.textContent = label;
      group.appendChild(heading);
      const list = document.createElement("div");
      list.className = "route-option-list";
      leg.routes.forEach((route, index) => {
        const option = document.createElement("div");
        option.className = `route-option${index === 0 ? " default" : ""}`;
        const copy = document.createElement("div");
        const title = document.createElement("div");
        title.className = "route-option-title";
        title.textContent = index === 0 ? "Best route" : `Alternative ${index}`;
        const detail = document.createElement("div");
        detail.className = "route-option-detail";
        const warnings = route.warnings?.length ? ` · ${route.warnings.join("; ")}` : "";
        const traffic = route.trafficDelayMinutes > 0 ? ` · +${oneDecimal(route.trafficDelayMinutes)} min traffic` : " · no measured delay";
        detail.textContent = `${route.description || "Route option"}${traffic}${warnings}`;
        copy.append(title, detail);
        const values = document.createElement("div");
        values.className = "route-option-values";
        values.textContent = `${oneDecimal(route.miles)} mi · ${Math.ceil(route.minutes)} min · ${formatClock(route.arrivalTime)}`;
        option.append(copy, values);
        list.appendChild(option);
      });
      group.appendChild(list);
      panel.appendChild(group);
    });
  }

  function drawRoutePreview(plan) {
    const svg = $("routePreview");
    svg.replaceChildren();
    const legPolylines = [
      defaultRoute(plan.legs?.toPickup)?.encodedPolyline,
      defaultRoute(plan.legs?.toDropoff)?.encodedPolyline,
      defaultRoute(plan.legs?.toRecovery)?.encodedPolyline,
    ].filter(Boolean).map(decodePolyline).filter((points) => points.length > 1);

    if (!legPolylines.length) {
      $("routePreviewWrap").hidden = true;
      return;
    }

    const all = legPolylines.flat();
    const lats = all.map((point) => point.latitude);
    const lngs = all.map((point) => point.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const width = 560;
    const height = 220;
    const padding = 22;
    const latSpan = Math.max(0.00001, maxLat - minLat);
    const lngSpan = Math.max(0.00001, maxLng - minLng);
    const project = (point) => ({
      x: padding + ((point.longitude - minLng) / lngSpan) * (width - padding * 2),
      y: height - padding - ((point.latitude - minLat) / latSpan) * (height - padding * 2),
    });
    const ns = "http://www.w3.org/2000/svg";
    const classNames = ["route-line", "route-line secondary", "route-line tertiary"];

    legPolylines.forEach((line, index) => {
      const polyline = document.createElementNS(ns, "polyline");
      polyline.setAttribute("class", classNames[index] || "route-line");
      polyline.setAttribute("points", line.map((point) => {
        const projected = project(point);
        return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
      }).join(" "));
      svg.appendChild(polyline);
    });

    const markerPoints = [
      { point: legPolylines[0][0], label: "Start" },
      { point: legPolylines[0].at(-1), label: "Pickup" },
      { point: legPolylines[1]?.at(-1), label: "Customer" },
      { point: legPolylines[2]?.at(-1), label: "Recovery" },
    ].filter((entry) => entry.point);

    markerPoints.forEach(({ point, label }) => {
      const projected = project(point);
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("class", "route-node");
      circle.setAttribute("cx", projected.x);
      circle.setAttribute("cy", projected.y);
      circle.setAttribute("r", 6);
      const text = document.createElementNS(ns, "text");
      text.setAttribute("class", "route-node-label");
      text.setAttribute("x", Math.min(width - 70, projected.x + 8));
      text.setAttribute("y", Math.max(14, projected.y - 8));
      text.textContent = label;
      svg.append(circle, text);
    });

    $("routePreviewWrap").hidden = false;
  }

  function decodePolyline(encoded) {
    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    while (index < encoded.length) {
      let result = 0;
      let shiftBits = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shiftBits;
        shiftBits += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += deltaLat;

      result = 0;
      shiftBits = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shiftBits;
        shiftBits += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += deltaLng;
      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
    return points;
  }

  function renderRouteFreshness() {
    const badge = $("routeFreshnessBadge");
    const resultAge = $("routeResultAge");
    if (!routeState.plan) {
      badge.textContent = "No route";
      badge.className = "mini-pill neutral";
      resultAge.textContent = "Not calculated";
      resultAge.className = "mini-pill neutral";
      return;
    }

    const ageMs = Date.now() - new Date(routeState.plan.computedAt).getTime();
    const ageMinutes = Math.max(0, ageMs / 60000);
    const stale = routeIsStale();
    const text = routeState.inputsDirty ? "Inputs changed" : stale ? `${Math.floor(ageMinutes)} min old` : "Current";
    badge.textContent = text;
    badge.className = `mini-pill ${stale ? "warn" : "good"}`;
    resultAge.textContent = ageMinutes < 1 ? "Just now" : `${Math.floor(ageMinutes)} min ago`;
    resultAge.className = `mini-pill ${stale ? "warn" : "good"}`;
  }

  function markRouteDirty(message = "Route inputs changed. Refresh before relying on ETA.") {
    if (routeState.plan) routeState.inputsDirty = true;
    renderRouteFreshness();
    if (routeState.plan) setRouteStatus(message, "warn");
  }

  function setRouteStatus(message, type = "") {
    const element = $("routeStatusMessage");
    element.textContent = message;
    element.className = `route-status${type ? ` ${type}` : ""}`;
  }

  function setButtonLoading(id, loading) {
    const button = $(id);
    if (!button) return;
    button.classList.toggle("loading-button", loading);
    button.disabled = loading;
  }

  function formatClock(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function openNavigation(destinationPoint) {
    if (!destinationPoint) return;
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("destination", mapPointValue(destinationPoint));
    url.searchParams.set("travelmode", "driving");
    url.searchParams.set("dir_action", "navigate");
    const avoids = selectedAvoids();
    if (avoids.length) url.searchParams.set("avoid", avoids.join(","));
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  function openCompleteRoute() {
    const origin = pointForOrigin();
    const pickup = pointFromAddressInput("pickupAddress");
    const dropoff = pointFromAddressInput("dropoffAddress");
    const recovery = pointFromAddressInput("recoveryAddress");
    if (!pickup || !dropoff) return;

    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    if (origin) url.searchParams.set("origin", mapPointValue(origin));
    url.searchParams.set("travelmode", "driving");
    const waypoints = recovery ? [pickup, dropoff] : [pickup];
    url.searchParams.set("destination", mapPointValue(recovery || dropoff));
    url.searchParams.set("waypoints", waypoints.map(mapPointValue).join("|"));
    const avoids = selectedAvoids();
    if (avoids.length) url.searchParams.set("avoid", avoids.join(","));
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  function mapPointValue(point) {
    if (point.address) return point.address;
    return `${point.latitude},${point.longitude}`;
  }

  function selectedAvoids() {
    const values = [];
    if ($("avoidFerries").checked) values.push("ferries");
    if ($("avoidHighways").checked) values.push("highways");
    if ($("avoidTolls").checked) values.push("tolls");
    return values;
  }

  function startLocationWatch() {
    if (!settings.autoRefreshRoutes || !navigator.geolocation || routeState.watchId !== null) return;
    routeState.watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const next = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
        routeState.currentPosition = next;
        routeState.currentPositionAt = Date.now();
        if (routeState.useGpsOrigin) maybeAutoRefresh(next);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }

  function stopLocationWatch() {
    if (routeState.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(routeState.watchId);
    routeState.watchId = null;
  }

  function maybeAutoRefresh(current) {
    if (!routeState.plan || !routeState.lastRouteOrigin || routeState.calculating) return;
    if (!Number.isFinite(routeState.lastRouteOrigin.latitude)) return;
    const movedMiles = haversineMiles(routeState.lastRouteOrigin, current);
    const ageMinutes = (Date.now() - new Date(routeState.plan.computedAt).getTime()) / 60000;
    const enoughTime = ageMinutes >= Number(settings.routeRefreshMinutes || 3);
    const enoughMovement = movedMiles >= Number(settings.routeRefreshMiles || 0.4);
    const cooldown = Date.now() - routeState.lastAutoRefreshAttempt >= 120_000;
    if (enoughTime && enoughMovement && cooldown) {
      routeState.lastAutoRefreshAttempt = Date.now();
      calculateRoutePlan({ automatic: true });
    }
  }

  function haversineMiles(a, b) {
    const toRadians = (degrees) => degrees * Math.PI / 180;
    const earthMiles = 3958.7613;
    const dLat = toRadians(b.latitude - a.latitude);
    const dLng = toRadians(b.longitude - a.longitude);
    const lat1 = toRadians(a.latitude);
    const lat2 = toRadians(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return earthMiles * 2 * Math.asin(Math.sqrt(h));
  }

  async function testRoutesApi({ silent = false } = {}) {
    const worker = routeWorkerBase();
    if (!worker) {
      setApiStatus("Routes not configured", "off");
      if (!silent) $("routesApiTestResult").textContent = "Enter a Worker URL first.";
      return;
    }
    if (!silent) $("routesApiTestResult").textContent = "Testing…";
    try {
      const response = await fetch(`${worker}/health`, { cache: "no-store" });
      const payload = await parseJsonResponse(response);
      if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      if (!payload.routesApiConfigured) {
        setApiStatus("Worker missing key", "break");
        if (!silent) $("routesApiTestResult").textContent = "Worker is live, but GOOGLE_MAPS_API_KEY is missing.";
        return;
      }
      setApiStatus("Routes ready", "on");
      if (!silent) $("routesApiTestResult").textContent = `Worker ready at ${formatClock(payload.timestamp)}.`;
    } catch (error) {
      setApiStatus("Routes offline", "off");
      if (!silent) $("routesApiTestResult").textContent = error.message || "Worker test failed.";
    }
  }

  function setApiStatus(text, state) {
    const status = $("routeApiStatus");
    status.textContent = text;
    status.className = `status-pill status-${state}`;
  }

  async function compareDestinations(event) {
    event.preventDefault();
    const worker = routeWorkerBase();
    if (!worker) {
      setMatrixStatus("Set the Worker URL in Settings.", "bad");
      return;
    }

    let origin = null;
    if (routeState.matrixUseGps && routeState.matrixGpsPoint) {
      origin = { latitude: routeState.matrixGpsPoint.latitude, longitude: routeState.matrixGpsPoint.longitude };
    } else {
      const value = $("matrixOrigin").value.trim();
      if (value) origin = { address: value };
    }
    if (!origin) {
      setMatrixStatus("Enter a matrix origin or use GPS.", "bad");
      return;
    }

    const destinations = $("matrixDestinations").value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 10)
      .map((address) => ({ label: address, point: { address } }));
    if (!destinations.length) {
      setMatrixStatus("Enter at least one destination.", "bad");
      return;
    }

    setButtonLoading("compareDestinations", true);
    setMatrixStatus("Comparing traffic-aware routes…", "warn");
    try {
      const response = await fetch(`${worker}/route-matrix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destinations, options: routeRequestOptions() }),
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload.error || `Route matrix returned ${response.status}.`);
      latestMatrixResults = payload.results || [];
      renderMatrixResults();
      setMatrixStatus(`Compared ${latestMatrixResults.length} destinations at ${formatClock(payload.computedAt)}.`, "good");
    } catch (error) {
      setMatrixStatus(error.message || "Route matrix failed.", "bad");
    } finally {
      setButtonLoading("compareDestinations", false);
    }
  }

  function renderMatrixResults() {
    const body = $("matrixResultsBody");
    body.innerHTML = "";
    if (!latestMatrixResults.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">No route matrix results.</td></tr>';
      return;
    }
    latestMatrixResults.forEach((entry, index) => {
      const tr = document.createElement("tr");
      const exists = entry.condition === "ROUTE_EXISTS";
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${escapeHtml(entry.label)}</td>
        <td>${exists ? oneDecimal(entry.miles) : "—"}</td>
        <td>${exists ? `${Math.ceil(entry.minutes)} min` : "No route"}</td>
        <td>${exists ? `+${oneDecimal(entry.trafficDelayMinutes)} min` : "—"}</td>
        <td>${exists ? formatClock(entry.arrivalTime) : "—"}</td>
        <td><button class="text-button use-matrix-recovery" data-index="${index}" ${exists ? "" : "disabled"}>Use recovery</button></td>
      `;
      body.appendChild(tr);
    });
  }

  function setMatrixStatus(message, type = "") {
    const status = $("matrixStatus");
    status.textContent = message;
    status.className = `route-status${type ? ` ${type}` : ""}`;
  }

  async function matrixUseGps() {
    setMatrixStatus("Requesting GPS…", "warn");
    try {
      const point = await getCurrentPosition();
      routeState.matrixGpsPoint = point;
      routeState.matrixUseGps = true;
      $("matrixOrigin").value = "";
      $("matrixOrigin").placeholder = `GPS ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
      setMatrixStatus("GPS selected as the matrix origin.", "good");
    } catch (error) {
      setMatrixStatus(locationErrorMessage(error), "bad");
    }
  }

  function addOfferLog(status) {
    if (!lastOffer) return;
    const entry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status,
      merchant: lastOffer.merchant || lastOffer.platform,
      payout: 0,
      offeredPayout: lastOffer.payout,
      miles: 0,
      offeredMiles: lastOffer.operationalMiles,
      minutes: 0,
      offeredMinutes: lastOffer.totalMinutes,
      net: 0,
      estimatedNet: lastOffer.netBeforeTax,
      score: lastOffer.score,
      verdict: lastOffer.verdict,
      route: lastOffer.route,
    };
    shift.logs.unshift(entry);
    saveShift();
    renderShift();
  }

  function addCompletedDelivery(data) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: "Completed",
      merchant: data.merchant || "Manual delivery",
      payout: data.payout,
      offeredPayout: data.payout,
      miles: data.miles,
      minutes: data.minutes,
      net: data.payout - data.miles * settings.vehicleCost,
      score: null,
      verdict: "ACTUAL",
      route: null,
    };
    shift.logs.unshift(entry);
    saveShift();
    renderShift();
  }

  function saveShift() {
    saveJson(STORAGE_KEYS.shift, shift);
  }

  function activeElapsedMs() {
    if (!shift.startedAt) return 0;
    const end = shift.state === "off" && shift.endedAt ? shift.endedAt : Date.now();
    let breakMs = shift.totalBreakMs || 0;
    if (shift.state === "break" && shift.breakStartedAt) breakMs += Date.now() - shift.breakStartedAt;
    return Math.max(0, end - shift.startedAt - breakMs);
  }

  function formatDuration(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
    const minutes = (totalMinutes % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function shiftTotals() {
    const completed = shift.logs.filter((entry) => entry.status === "Completed");
    const gross = completed.reduce((sum, entry) => sum + Number(entry.payout || 0), 0);
    const miles = completed.reduce((sum, entry) => sum + Number(entry.miles || 0), 0);
    const cost = miles * settings.vehicleCost;
    const net = gross - cost;
    const activeHours = activeElapsedMs() / 3600000;
    const grossHourly = activeHours > 0 ? gross / activeHours : 0;
    const netPerMile = miles > 0 ? net / miles : 0;
    return { gross, miles, cost, net, activeHours, grossHourly, netPerMile, completedCount: completed.length };
  }

  function renderShift() {
    const status = $("shiftStatus");
    status.className = "status-pill";
    if (shift.state === "active") {
      status.textContent = "Shift active";
      status.classList.add("status-on");
    } else if (shift.state === "break") {
      status.textContent = "On break";
      status.classList.add("status-break");
    } else {
      status.textContent = "Shift off";
      status.classList.add("status-off");
    }

    $("startShift").disabled = shift.state !== "off";
    $("startBreak").disabled = shift.state !== "active";
    $("endBreak").disabled = shift.state !== "break";
    $("endShift").disabled = shift.state === "off";

    const totals = shiftTotals();
    $("elapsedMetric").textContent = formatDuration(activeElapsedMs());
    $("shiftGrossMetric").textContent = money(totals.gross);
    $("shiftMilesMetric").textContent = oneDecimal(totals.miles);
    $("shiftCostMetric").textContent = money(totals.cost);
    $("shiftNetMetric").textContent = money(totals.net);
    $("shiftHourlyMetric").textContent = money(totals.grossHourly);

    const body = $("deliveryLogBody");
    body.innerHTML = "";
    if (!shift.logs.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">No deliveries logged.</td></tr>';
    } else {
      shift.logs.forEach((entry) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${new Date(entry.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
          <td>${escapeHtml(entry.status)}</td>
          <td>${escapeHtml(entry.merchant)}</td>
          <td>${entry.status === "Completed" ? money(entry.payout) : `~${money(entry.offeredPayout)}`}</td>
          <td>${entry.status === "Completed" ? oneDecimal(entry.miles) : `~${oneDecimal(entry.offeredMiles || 0)}`}</td>
          <td>${entry.status === "Completed" ? (entry.minutes || 0) : `~${entry.offeredMinutes || 0}`}</td>
          <td>${entry.status === "Completed" ? money(entry.net) : `~${money(entry.estimatedNet || 0)}`}</td>
        `;
        body.appendChild(tr);
      });
    }

    renderKpiAlerts(totals);
  }

  function renderKpiAlerts(totals) {
    const alerts = [];
    if (totals.completedCount === 0) {
      alerts.push({ type: "warn", text: "No completed deliveries logged yet. KPIs will update as the shift progresses." });
    } else {
      alerts.push({
        type: totals.grossHourly >= settings.targetGrossHourly ? "good" : "warn",
        text: `Gross active-hour rate: ${money(totals.grossHourly)} versus ${money(settings.targetGrossHourly)} target.`,
      });
      alerts.push({
        type: totals.netPerMile >= 1.75 ? "good" : "bad",
        text: `Estimated net per mile: ${money(totals.netPerMile)}. Target is at least $1.75 after the vehicle-cost allowance.`,
      });
      alerts.push({
        type: totals.miles <= totals.gross / 1.75 ? "good" : "warn",
        text: `Mileage discipline: ${oneDecimal(totals.miles)} miles against ${money(totals.gross)} gross.`,
      });
    }
    $("kpiAlerts").innerHTML = alerts.map((alert) => `<div class="alert ${alert.type}">${escapeHtml(alert.text)}</div>`).join("");
  }

  function renderRestaurants() {
    const body = $("restaurantTableBody");
    body.innerHTML = "";
    if (!restaurants.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">No restaurant intelligence saved.</td></tr>';
      return;
    }

    [...restaurants].sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(entry.name)}</td>
        <td><span class="grade grade-${entry.grade}">${entry.grade}</span></td>
        <td>${entry.wait} min</td>
        <td>${escapeHtml(entry.notes || "")}</td>
        <td><button class="text-button delete-restaurant" data-id="${entry.id}">Delete</button></td>
      `;
      body.appendChild(tr);
    });
  }

  function populateSettings() {
    const valueIds = [
      "vehicleCost", "coreGrossPerMile", "conditionalGrossPerMile", "outerGrossPerMile",
      "minimumPayout", "targetGrossHourly", "strongGrossHourly", "maxOrderMinutes",
      "routesWorkerUrl", "defaultRecoveryAddress", "routingPreference", "trafficModel",
      "routeRefreshMinutes", "routeRefreshMiles",
    ];
    valueIds.forEach((key) => { if ($(key)) $(key).value = settings[key] ?? ""; });
    $("autoRefreshRoutes").checked = Boolean(settings.autoRefreshRoutes);
    $("includeTrafficPolyline").checked = Boolean(settings.includeTrafficPolyline);
    $("recoveryAddress").value = settings.defaultRecoveryAddress || "";
  }

  function saveAllSettings() {
    settings = {
      ...settings,
      vehicleCost: readNumber("vehicleCost", defaultSettings.vehicleCost),
      coreGrossPerMile: readNumber("coreGrossPerMile", defaultSettings.coreGrossPerMile),
      conditionalGrossPerMile: readNumber("conditionalGrossPerMile", defaultSettings.conditionalGrossPerMile),
      outerGrossPerMile: readNumber("outerGrossPerMile", defaultSettings.outerGrossPerMile),
      minimumPayout: readNumber("minimumPayout", defaultSettings.minimumPayout),
      targetGrossHourly: readNumber("targetGrossHourly", defaultSettings.targetGrossHourly),
      strongGrossHourly: readNumber("strongGrossHourly", defaultSettings.strongGrossHourly),
      maxOrderMinutes: readNumber("maxOrderMinutes", defaultSettings.maxOrderMinutes),
      routesWorkerUrl: $("routesWorkerUrl").value.trim().replace(/\/+$/, ""),
      defaultRecoveryAddress: $("defaultRecoveryAddress").value.trim(),
      routingPreference: $("routingPreference").value,
      trafficModel: $("trafficModel").value,
      routeRefreshMinutes: clamp(readNumber("routeRefreshMinutes", 3), 1, 30),
      routeRefreshMiles: clamp(readNumber("routeRefreshMiles", 0.4), 0.1, 5),
      autoRefreshRoutes: $("autoRefreshRoutes").checked,
      includeTrafficPolyline: $("includeTrafficPolyline").checked,
    };
    saveJson(STORAGE_KEYS.settings, settings);
    if (!settings.autoRefreshRoutes) stopLocationWatch();
    else if (routeState.useGpsOrigin) startLocationWatch();
    if (!$("recoveryAddress").value.trim()) $("recoveryAddress").value = settings.defaultRecoveryAddress;
    renderShift();
    testRoutesApi({ silent: true });
  }

  function exportCsv() {
    const headers = [
      "timestamp", "status", "merchant", "payout", "offered_payout", "miles", "minutes", "estimated_net",
      "score", "verdict", "route_computed_at", "route_stale", "pickup_miles", "pickup_minutes",
      "dropoff_miles", "dropoff_minutes", "recovery_miles", "recovery_minutes", "traffic_delay_minutes",
      "pickup_eta", "delivery_eta", "recovery_eta",
    ];
    const rows = shift.logs.map((entry) => [
      new Date(entry.timestamp).toISOString(),
      entry.status,
      entry.merchant,
      entry.payout,
      entry.offeredPayout,
      entry.miles,
      entry.minutes,
      entry.net,
      entry.score ?? "",
      entry.verdict,
      entry.route?.computedAt || "",
      entry.route?.stale ?? "",
      entry.route?.pickupMiles ?? "",
      entry.route?.pickupMinutes ?? "",
      entry.route?.dropoffMiles ?? "",
      entry.route?.dropoffMinutes ?? "",
      entry.route?.recoveryMiles ?? "",
      entry.route?.recoveryMinutes ?? "",
      entry.route?.trafficDelayMinutes ?? "",
      entry.route?.pickupEta || "",
      entry.route?.deliveryEta || "",
      entry.route?.recoveryEta || "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `apex-dispatch-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function activateTab(tabName) {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabName));
  }

  function setupTabs() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });
  }

  function setupEvents() {
    $("offerForm").addEventListener("submit", (event) => {
      event.preventDefault();
      renderOfferResult(evaluateOffer(readOfferForm()));
    });
    $("resetOffer").addEventListener("click", resetOfferForm);
    $("logAccepted").addEventListener("click", () => addOfferLog("Accepted"));
    $("logDeclined").addEventListener("click", () => addOfferLog("Declined"));

    $("useCurrentLocation").addEventListener("click", useCurrentLocationForOrigin);
    $("calculateRoute").addEventListener("click", () => calculateRoutePlan());
    $("refreshRoute").addEventListener("click", () => calculateRoutePlan());
    $("useDefaultRecovery").addEventListener("click", () => {
      $("recoveryAddress").value = settings.defaultRecoveryAddress || "";
      markRouteDirty();
    });
    $("openFullRoute").addEventListener("click", openCompleteRoute);
    $("navigatePickup").addEventListener("click", () => openNavigation(pointFromAddressInput("pickupAddress")));
    $("navigateDropoff").addEventListener("click", () => openNavigation(pointFromAddressInput("dropoffAddress")));
    $("navigateRecovery").addEventListener("click", () => openNavigation(pointFromAddressInput("recoveryAddress")));

    ["pickupAddress", "dropoffAddress", "recoveryAddress", "waitMinutes"].forEach((id) => {
      $(id).addEventListener("input", () => markRouteDirty());
    });
    ["routeAlternatives", "avoidTolls", "avoidHighways", "avoidFerries"].forEach((id) => {
      $(id).addEventListener("change", () => markRouteDirty("Route preferences changed. Recalculate the route."));
    });
    $("originAddress").addEventListener("input", () => {
      routeState.useGpsOrigin = false;
      markRouteDirty();
    });

    $("startShift").addEventListener("click", () => {
      shift = { ...defaultShift, state: "active", startedAt: Date.now(), logs: shift.logs || [] };
      saveShift();
      renderShift();
    });
    $("startBreak").addEventListener("click", () => {
      shift.state = "break";
      shift.breakStartedAt = Date.now();
      saveShift();
      renderShift();
    });
    $("endBreak").addEventListener("click", () => {
      if (shift.breakStartedAt) shift.totalBreakMs += Date.now() - shift.breakStartedAt;
      shift.breakStartedAt = null;
      shift.state = "active";
      saveShift();
      renderShift();
    });
    $("endShift").addEventListener("click", () => {
      if (shift.state === "break" && shift.breakStartedAt) shift.totalBreakMs += Date.now() - shift.breakStartedAt;
      shift.breakStartedAt = null;
      shift.state = "off";
      shift.endedAt = Date.now();
      saveShift();
      renderShift();
    });

    $("manualCompletedForm").addEventListener("submit", (event) => {
      event.preventDefault();
      addCompletedDelivery({
        payout: readNumber("completedPayout"),
        miles: readNumber("completedMiles"),
        minutes: readNumber("completedMinutes"),
        merchant: $("completedMerchant").value.trim(),
      });
      event.target.reset();
    });

    $("restaurantForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const name = $("restaurantName").value.trim();
      const existing = restaurants.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
      const record = {
        id: existing?.id || crypto.randomUUID(),
        name,
        grade: $("restaurantGrade").value,
        wait: readNumber("restaurantWait", 8),
        notes: $("restaurantNotes").value.trim(),
      };
      restaurants = existing ? restaurants.map((entry) => entry.id === existing.id ? record : entry) : [...restaurants, record];
      saveJson(STORAGE_KEYS.restaurants, restaurants);
      renderRestaurants();
      event.target.reset();
      $("restaurantWait").value = 8;
    });

    $("restaurantTableBody").addEventListener("click", (event) => {
      const button = event.target.closest(".delete-restaurant");
      if (!button) return;
      restaurants = restaurants.filter((entry) => entry.id !== button.dataset.id);
      saveJson(STORAGE_KEYS.restaurants, restaurants);
      renderRestaurants();
    });

    $("settingsForm").addEventListener("submit", (event) => {
      event.preventDefault();
      saveAllSettings();
      alert("Settings saved.");
    });
    $("saveRouteSettings").addEventListener("click", () => {
      saveAllSettings();
      alert("Route settings saved.");
    });
    $("testRoutesApi").addEventListener("click", () => {
      settings.routesWorkerUrl = $("routesWorkerUrl").value.trim().replace(/\/+$/, "");
      testRoutesApi();
    });

    $("matrixForm").addEventListener("submit", compareDestinations);
    $("matrixUseDropoff").addEventListener("click", () => {
      routeState.matrixUseGps = false;
      $("matrixOrigin").value = $("dropoffAddress").value.trim();
      setMatrixStatus($("matrixOrigin").value ? "Current drop-off copied as matrix origin." : "No current drop-off address is entered.", $("matrixOrigin").value ? "good" : "warn");
    });
    $("matrixUseGps").addEventListener("click", matrixUseGps);
    $("matrixOrigin").addEventListener("input", () => { routeState.matrixUseGps = false; });
    $("matrixResultsBody").addEventListener("click", (event) => {
      const button = event.target.closest(".use-matrix-recovery");
      if (!button) return;
      const result = latestMatrixResults[Number(button.dataset.index)];
      if (!result?.point?.address) return;
      $("recoveryAddress").value = result.point.address;
      markRouteDirty("Recovery point selected from the route matrix. Recalculate the offer route.");
      activateTab("dispatch");
      setRouteStatus(`Recovery set to ${result.label}. Recalculate the route.`, "good");
    });

    $("exportCsv").addEventListener("click", exportCsv);
    $("clearShiftData").addEventListener("click", () => {
      if (!confirm("Clear all current shift logs and timers?")) return;
      shift = clone(defaultShift);
      saveShift();
      renderShift();
    });

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      $("installButton").hidden = false;
    });
    $("installButton").addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $("installButton").hidden = true;
    });
  }

  setupTabs();
  setupEvents();
  populateSettings();
  renderRestaurants();
  renderShift();
  resetOfferForm();
  testRoutesApi({ silent: true });
  setInterval(() => {
    renderShift();
    renderRouteFreshness();
  }, 30_000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
  }
})();
