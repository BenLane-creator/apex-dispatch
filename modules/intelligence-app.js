import {
  loadMarkets,
  getActiveMarketId,
  setActiveMarketId,
  exportMarkets,
  importMarkets,
  scoringForMarket,
} from "./markets.js";
import { LocationService } from "./location.js";
import { OperationalMap } from "./map.js";
import { findZoneAtPoint } from "./zones.js";
import { corridorCenter } from "./corridors.js";
import {
  nearestStagingPoint,
  saveStagingPoint,
  deleteStagingPoint,
  setStagingPreference,
  userStagingPoints,
} from "./staging.js";
import {
  readOfferHistory,
  corridorMetrics,
  recommendRecovery,
  recordOperationalEvent,
  exportOperationalHistory,
  importOperationalHistory,
} from "./intelligence.js";
import {
  applyIntelligenceTranslations,
  intelligenceLanguage,
  oiT,
  oiTerm,
} from "./intelligence-i18n.js";

const PENDING_CONTEXT_KEY = "apexDispatch.pendingLocationContext.v1";
const ACTIVE_CONTEXT_KEY = "apexDispatch.activeLocationContext.v1";
const SHIFT_KEY = "apexDispatch.shift.v3";

const state = {
  markets: [],
  market: null,
  history: [],
  map: null,
  mapReady: false,
  mapPromise: null,
  location: new LocationService(),
  selected: null,
  settingPickup: false,
  lastEvaluatedFingerprint: null,
  mapFailureMessage: null,
};

const $ = (id) => document.getElementById(id);

async function boot() {
  if (!$("operationalMap")) return;
  applyIntelligenceTranslations();
  bindUi();
  setStatus(oiT("loadingMarkets"));
  try {
    state.markets = await loadMarkets();
    if (!state.markets.length) throw new Error(oiT("noMarkets"));
    populateMarketSelect();
    const preferredId = getActiveMarketId(state.markets[0].id);
    state.market = state.markets.find((market) => market.id === preferredId) || state.markets[0];
    $("marketSelect").value = state.market.id;
    state.history = readOfferHistory();
    updateSummary();
    renderStagingManager();
    bindOfferHistoryIntegration();
    const intelligenceTab = document.querySelector('[data-tab="intelligence"]');
    if (intelligenceTab?.classList.contains("active")) await ensureMap();
    else setStatus(oiT("openIntelligence"));
  } catch (error) {
    handleMapFailure(error);
  }
}

function bindUi() {
  $("locateIntelligence")?.addEventListener("click", locate);
  $("centerMarket")?.addEventListener("click", () => state.map?.centerMarket());
  $("marketSelect")?.addEventListener("change", changeMarket);
  $("poiFilter")?.addEventListener("change", (event) => state.map?.setPoiFilter(event.target.value));
  $("applyMarketScoring")?.addEventListener("click", applyMarketScoring);
  $("syncOfflineData")?.addEventListener("click", syncOfflineData);
  document.querySelectorAll("[data-map-layer]").forEach((input) => {
    input.addEventListener("change", () => state.map?.setLayerVisibility(input.dataset.mapLayer, input.checked));
  });
  $("useSelectionAsPickup")?.addEventListener("click", useSelectionAsPickup);
  $("useSelectionAsRecovery")?.addEventListener("click", useSelectionAsRecovery);
  $("saveCurrentStaging")?.addEventListener("click", saveCurrentStaging);
  $("stagingManagerList")?.addEventListener("click", manageStagingList);
  $("exportMarkets")?.addEventListener("click", downloadMarketExport);
  $("importMarkets")?.addEventListener("change", uploadMarketImport);
  $("exportIntelligence")?.addEventListener("click", downloadHistoryExport);
  $("importIntelligence")?.addEventListener("change", uploadHistoryImport);
  window.addEventListener("apex:tabchange", (event) => {
    if (event.detail?.name !== "intelligence") return;
    requestAnimationFrame(() => {
      ensureMap()
        .then(() => state.map?.resize())
        .catch(handleMapFailure);
    });
  });
  state.location.addEventListener("position", (event) => applyPosition(event.detail));
  state.location.addEventListener("error", (event) => setStatus(localizeLocationError(event.detail.message), "error"));
  window.addEventListener("storage", (event) => {
    if ([SHIFT_KEY, "apexDispatch.operationalHistory.v1"].includes(event.key)) refreshHistory();
  });
  window.addEventListener("online", () => setStatus(oiT("connectionRestored"), "ok"));
  window.addEventListener("offline", () => setStatus(oiT("offlineMode"), "warning"));
  window.addEventListener("apex:languagechange", refreshLanguage);
}

async function ensureMap() {
  if (state.mapReady && state.map) return state.map;
  if (state.mapPromise) return state.mapPromise;
  state.mapPromise = (async () => {
    setStatus(oiT("loadingMarket", { name: state.market.name }));
    state.map = state.map || new OperationalMap("operationalMap");
    state.map.destroy();
    prepareMapContainer();
    bindMapEvents(state.map);
    await state.map.initialize(state.market, state.history);
    state.mapReady = true;
    state.mapFailureMessage = null;
    if (state.location.position) state.map.setPosition(state.location.position, { center: false });
    updateSummary();
    renderStagingManager();
    setStatus(oiT(state.map.basemapAvailable ? "ready" : "offlineBasemap"), state.map.basemapAvailable ? "ok" : "warning");
    return state.map;
  })().finally(() => { state.mapPromise = null; });
  return state.mapPromise;
}

function bindMapEvents(map) {
  if (map.datasetBound) return;
  map.datasetBound = true;
  map.addEventListener("selection", (event) => handleSelection(event.detail));
  map.addEventListener("ready", () => updateSummary());
  map.addEventListener("stagingchange", () => {
    updateSummary();
    renderStagingManager();
  });
}

async function locate() {
  const button = $("locateIntelligence");
  button.disabled = true;
  setStatus(oiT("requestingLocation"));
  try {
    try {
      await ensureMap();
    } catch (error) {
      handleMapFailure(error);
    }
    const position = await state.location.locate({ maximumAge: 0 });
    applyPosition(position);
  } catch (error) {
    setStatus(localizeLocationError(error.message), "error");
  } finally {
    button.disabled = false;
  }
}

function applyPosition(position) {
  state.map?.setPosition(position);
  const zone = findZoneAtPoint(state.map?.data?.zones, position);
  const nearest = nearestStagingPoint(state.map?.data?.staging, position);
  const recommendation = recommendRecovery(state.map?.data?.staging, position, state.history);
  $("currentAreaValue").textContent = zone?.properties?.name || state.market?.name || oiT("outsideZones");
  $("nearestStagingValue").textContent = nearest ? `${nearest.feature.properties.name} · ${nearest.miles.toFixed(1)} mi` : oiT("noStagingConfigured");
  $("recoveryRecommendationValue").textContent = recommendation
    ? `${recommendation.feature.properties.name} · ${recommendation.miles.toFixed(1)} mi${recommendation.provisional ? ` · ${oiT("provisional")}` : ""}`
    : oiT("insufficientData");
  $("locationTimestamp").textContent = oiT("updatedLocation", {
    time: new Date(position.capturedAt).toLocaleTimeString(intelligenceLanguage()),
    accuracy: Math.round(position.accuracy),
  });
  setStatus(oiT("locationAcquired"), "ok");
}

async function changeMarket(event) {
  const market = state.markets.find((item) => item.id === event.target.value);
  if (!market) return;
  state.market = market;
  setActiveMarketId(market.id);
  state.selected = null;
  state.mapReady = false;
  renderSelection(null);
  renderStagingManager();
  try {
    await ensureMap();
    setStatus(oiT("marketLoaded", { name: market.name }), "ok");
  } catch (error) {
    handleMapFailure(error);
  }
}

function prepareMapContainer() {
  const container = $("operationalMap");
  if (!container) return;
  container.replaceChildren();
  container.classList.remove("operational-map--fallback");
  container.setAttribute("role", "application");
  container.setAttribute("aria-label", oiT("mapAria"));
}

function handleMapFailure(error) {
  const rawMessage = error?.message || "";
  const message = localizeMapError(rawMessage);
  console.warn(message);
  state.mapReady = false;
  state.mapFailureMessage = rawMessage;
  state.map?.destroy();
  updateSummary();
  renderStagingManager();

  const container = $("operationalMap");
  if (container) {
    container.replaceChildren();
    container.classList.add("operational-map--fallback");
    container.setAttribute("role", "status");
    container.setAttribute("aria-label", oiT("mapUnavailable"));
    const fallback = document.createElement("div");
    fallback.className = "operational-map-fallback";
    const heading = document.createElement("strong");
    heading.textContent = oiT("mapUnavailable");
    const detail = document.createElement("span");
    detail.textContent = oiT("mapUnavailableDetail");
    fallback.append(heading, detail);
    container.append(fallback);
  }

  setStatus(oiT("overlayFallback", { message }), "warning");
}

function handleSelection(selection) {
  state.selected = selection;
  renderSelection(selection);
  if (selection.type === "corridor") renderCorridorMetrics(selection.feature.properties?.id);
  else clearCorridorMetrics();
}

function renderSelection(selection) {
  if (!selection) {
    $("selectionType").textContent = oiT("noSelection");
    $("selectionName").textContent = oiT("selectionPrompt");
    $("selectionDetails").textContent = oiT("selectionHelp");
    $("useSelectionAsPickup").disabled = true;
    $("useSelectionAsRecovery").disabled = true;
    clearCorridorMetrics();
    return;
  }
  const properties = selection.feature.properties || {};
  $("selectionType").textContent = oiTerm(selection.type, "type");
  $("selectionName").textContent = properties.name || properties.id || oiT("selectedFeature");
  $("selectionDetails").textContent = selectionDescription(selection);
  $("useSelectionAsPickup").disabled = !["poi", "staging"].includes(selection.type);
  $("useSelectionAsRecovery").disabled = selection.type !== "staging";
}

function selectionDescription(selection) {
  const properties = selection.feature.properties || {};
  if (selection.type === "zone") {
    return oiT("zoneDescription", {
      classification: oiTerm(properties.classification || "operating", "class"),
      amount: Number(properties.minimumGrossPerMile || 0).toFixed(2),
    });
  }
  if (selection.type === "corridor") {
    return oiT("corridorDescription", {
      classification: oiTerm(properties.classification || "commercial", "class"),
      notes: properties.notes || oiT("operationalCorridor"),
    });
  }
  if (selection.type === "poi") {
    return oiT("poiDescription", {
      category: oiTerm(properties.category || "merchant", "category"),
      address: properties.address || oiT("curatedPoint"),
    });
  }
  if (selection.type === "staging") {
    return oiT("stagingDescription", {
      zone: properties.zoneId || oiT("unassignedZone"),
      notes: properties.notes || oiT("approvedStaging"),
    });
  }
  return properties.notes || oiT("operationalFeature");
}

function useSelectionAsPickup() {
  if (!state.selected || !["poi", "staging"].includes(state.selected.type)) return;
  const properties = state.selected.feature.properties || {};
  const input = $("pickupAddress");
  if (!input) return;
  state.settingPickup = true;
  input.value = properties.address || properties.name || "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  state.settingPickup = false;
  savePendingContext(buildLocationContext(state.selected));
  setStatus(oiT("pickupAssigned"), "ok");
}

function useSelectionAsRecovery() {
  if (!state.selected || state.selected.type !== "staging") return;
  const properties = state.selected.feature.properties || {};
  const coordinates = state.selected.feature.geometry?.coordinates || [];
  const form = $("recoveryPointForm");
  if (!form) {
    setStatus(oiT("recoveryFormUnavailable"), "error");
    return;
  }
  $("recoveryPointId").value = `intelligence-${properties.id}`;
  $("recoveryPointName").value = properties.name || oiT("operationalStaging");
  $("recoveryPointAddress").value = properties.address || `${Number(coordinates[1]).toFixed(6)}, ${Number(coordinates[0]).toFixed(6)}`;
  $("recoveryPointParking").value = properties.notes || oiT("parkingDefault");
  $("recoveryPointPreferred").checked = Boolean(properties.preferred);
  $("recoveryPointActive").checked = properties.active !== false;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  const context = {
    ...readPendingContext(),
    marketId: state.market?.id || null,
    timezone: state.market?.timezone || null,
    recoveryStagingPointId: properties.id || null,
  };
  savePendingContext(context);
  setStatus(oiT("recoveryAdded"), "ok");
}

async function saveCurrentStaging() {
  if (!state.location.position) {
    setStatus(oiT("locateBeforeSaving"), "error");
    return;
  }
  const name = $("stagingName").value.trim();
  if (!name) {
    setStatus(oiT("enterStagingName"), "error");
    $("stagingName").focus();
    return;
  }
  const zone = findZoneAtPoint(state.map?.data?.zones, state.location.position);
  const selectedCorridorId = state.selected?.type === "corridor" ? state.selected.feature.properties?.id : null;
  try {
    saveStagingPoint({
      marketId: state.market.id,
      name,
      longitude: state.location.position.longitude,
      latitude: state.location.position.latitude,
      zoneId: zone?.properties?.id || null,
      corridorId: selectedCorridorId,
      preferred: $("stagingPreferred").checked,
      notes: $("stagingNotes").value.trim(),
    });
    $("stagingName").value = "";
    $("stagingNotes").value = "";
    $("stagingPreferred").checked = false;
    await state.map?.refreshStaging();
    renderStagingManager();
    setStatus(oiT("stagingSaved"), "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function manageStagingList(event) {
  const remove = event.target.closest("[data-delete-staging]");
  const preferred = event.target.closest("[data-prefer-staging]");
  if (remove) {
    if (!confirm(oiT("confirmDeleteStaging"))) return;
    deleteStagingPoint(remove.dataset.deleteStaging);
    await state.map?.refreshStaging();
    renderStagingManager();
    setStatus(oiT("stagingDeleted"), "ok");
  }
  if (preferred) {
    setStagingPreference(preferred.dataset.preferStaging, preferred.dataset.preferred !== "true");
    await state.map?.refreshStaging();
    renderStagingManager();
    setStatus(oiT("stagingPreferenceUpdated"), "ok");
  }
}

function renderStagingManager() {
  const list = $("stagingManagerList");
  if (!list || !state.market) return;
  const points = userStagingPoints(state.market.id);
  if (!points.length) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(oiT("noSavedStaging"))}</p>`;
    return;
  }
  list.innerHTML = points.map((feature) => {
    const properties = feature.properties || {};
    return `<article class="intelligence-staging-item">
      <div><strong>${escapeHtml(properties.name)}</strong><span>${escapeHtml(properties.zoneId || oiT("unassignedZone"))}${properties.preferred ? ` · ${escapeHtml(oiT("preferred"))}` : ""}</span></div>
      <div class="button-row wrap">
        <button type="button" class="text-button" data-prefer-staging="${escapeHtml(properties.id)}" data-preferred="${Boolean(properties.preferred)}">${escapeHtml(properties.preferred ? oiT("removePreference") : oiT("prefer"))}</button>
        <button type="button" class="text-button" data-delete-staging="${escapeHtml(properties.id)}">${escapeHtml(oiT("delete"))}</button>
      </div>
    </article>`;
  }).join("");
}

function applyMarketScoring() {
  if (!state.market) return;
  const scoring = scoringForMarket(state.market);
  const values = {
    vehicleCost: scoring.vehicleCost,
    minimumPayout: scoring.minimumPayout,
    targetGrossPerMile: scoring.targetGrossPerMile,
    targetGrossHourly: scoring.targetGrossHourly,
    defaultPickupWait: scoring.defaultPickupWait,
    defaultDropoffMinutes: scoring.defaultDropoffMinutes,
  };
  Object.entries(values).forEach(([id, value]) => { if ($(id)) $(id).value = value; });
  $("economicsForm")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  setStatus(oiT("scoringApplied", { name: state.market.name }), "ok");
}

function bindOfferHistoryIntegration() {
  $("pickupAddress")?.addEventListener("input", () => {
    if (!state.settingPickup) localStorage.removeItem(PENDING_CONTEXT_KEY);
  });
  $("offerForm")?.addEventListener("submit", () => {
    const fingerprint = offerFingerprint("evaluated");
    state.lastEvaluatedFingerprint = fingerprint;
    waitForAnalysis(fingerprint);
  });
  $("acceptOffer")?.addEventListener("click", () => {
    const context = readPendingContext();
    localStorage.setItem(ACTIVE_CONTEXT_KEY, JSON.stringify(context));
    recordSnapshot("Accepted", { fingerprint: offerFingerprint("accepted"), locationContext: context });
    refreshHistory();
  });
  $("declineOffer")?.addEventListener("click", () => {
    recordSnapshot("Declined", { fingerprint: offerFingerprint("declined"), locationContext: readPendingContext() });
    refreshHistory();
  });
  $("completeOffer")?.addEventListener("click", () => {
    const context = readJson(ACTIVE_CONTEXT_KEY, readPendingContext());
    setTimeout(() => {
      const shift = readJson(SHIFT_KEY, { logs: [] });
      const latest = shift.logs?.find((entry) => String(entry.status).toLowerCase() === "completed");
      if (latest) {
        recordOperationalEvent({
          ...latest,
          sourceLogId: latest.id,
          fingerprint: `completed:${latest.id}`,
          status: "Completed",
          locationContext: context,
          marketId: context.marketId,
          corridorId: context.corridorId,
          pickupPoiId: context.pickupPoiId,
          recoveryStagingPointId: context.recoveryStagingPointId,
          latitude: context.latitude,
          longitude: context.longitude,
        });
      }
      localStorage.removeItem(ACTIVE_CONTEXT_KEY);
      refreshHistory();
    }, 50);
  });
}

function waitForAnalysis(fingerprint) {
  const badge = $("verdictBadge");
  if (!badge) return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const verdict = badge.textContent.trim().toUpperCase();
    if (!["WAITING", "ESPERANDO", ""].includes(verdict)) {
      clearInterval(timer);
      if (state.lastEvaluatedFingerprint !== fingerprint) return;
      recordSnapshot("Evaluated", { fingerprint, verdict, locationContext: readPendingContext() });
      refreshHistory();
    } else if (attempts >= 40) {
      clearInterval(timer);
    }
  }, 250);
}

function recordSnapshot(status, extras = {}) {
  const context = extras.locationContext || readPendingContext();
  return recordOperationalEvent({
    status,
    timestamp: Date.now(),
    pickup: $("pickupAddress")?.value.trim() || "",
    payout: numericInput("payout"),
    miles: numericText($("totalMilesMetric")?.textContent),
    minutes: numericText($("totalTimeMetric")?.textContent),
    recovery: $("recoveryName")?.textContent.trim() || "",
    verdict: extras.verdict || $("verdictBadge")?.textContent.trim() || "",
    score: null,
    marketId: context.marketId,
    corridorId: context.corridorId,
    pickupPoiId: context.pickupPoiId,
    recoveryStagingPointId: context.recoveryStagingPointId,
    latitude: context.latitude,
    longitude: context.longitude,
    locationContext: context,
    fingerprint: extras.fingerprint,
  });
}

function offerFingerprint(stage) {
  return [stage, $("pickupAddress")?.value.trim(), $("dropoffAddress")?.value.trim(), numericInput("payout"), Math.floor(Date.now() / 10000)].join(":");
}

function refreshHistory() {
  state.history = readOfferHistory();
  state.map?.refreshHistory(state.history);
  updateSummary();
  if (state.selected?.type === "corridor") renderCorridorMetrics(state.selected.feature.properties?.id);
  if (state.location.position) applyPosition(state.location.position);
}

function buildLocationContext(selection) {
  const properties = selection?.feature?.properties || {};
  const center = featureCenter(selection?.feature);
  return {
    marketId: state.market?.id || null,
    timezone: state.market?.timezone || null,
    corridorId: selection?.type === "corridor" ? properties.id : properties.corridorId || null,
    pickupPoiId: selection?.type === "poi" ? properties.id : null,
    pickupZoneId: properties.zoneId || null,
    recoveryStagingPointId: selection?.type === "staging" ? properties.id : null,
    longitude: center?.longitude ?? null,
    latitude: center?.latitude ?? null,
    capturedAt: new Date().toISOString(),
  };
}

function featureCenter(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;
  if (geometry.type === "Point") return { longitude: Number(geometry.coordinates[0]), latitude: Number(geometry.coordinates[1]) };
  if (["LineString", "MultiLineString"].includes(geometry.type)) return corridorCenter(feature);
  const coordinates = geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
  const points = coordinates.filter((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite));
  if (!points.length) return null;
  const sum = points.reduce((result, [longitude, latitude]) => ({ longitude: result.longitude + longitude, latitude: result.latitude + latitude }), { longitude: 0, latitude: 0 });
  return { longitude: sum.longitude / points.length, latitude: sum.latitude / points.length };
}

function savePendingContext(context) {
  localStorage.setItem(PENDING_CONTEXT_KEY, JSON.stringify(context));
}

function readPendingContext() {
  const fallback = {
    marketId: state.market?.id || null,
    timezone: state.market?.timezone || null,
    corridorId: null,
    pickupPoiId: null,
    pickupZoneId: null,
    recoveryStagingPointId: null,
    latitude: null,
    longitude: null,
    capturedAt: new Date().toISOString(),
  };
  return readJson(PENDING_CONTEXT_KEY, fallback);
}

function renderCorridorMetrics(corridorId) {
  const metrics = corridorMetrics(state.history, corridorId);
  $("corridorMetrics").innerHTML = `
    <div><span>${escapeHtml(oiT("offers"))}</span><strong>${metrics.offers}</strong></div>
    <div><span>${escapeHtml(oiT("completed"))}</span><strong>${metrics.completed}</strong></div>
    <div><span>${escapeHtml(oiT("grossPerMile"))}</span><strong>${metrics.grossPerMile === null ? "—" : `$${metrics.grossPerMile.toFixed(2)}`}</strong></div>
    <div><span>${escapeHtml(oiT("grossPerHour"))}</span><strong>${metrics.grossPerHour === null ? "—" : `$${metrics.grossPerHour.toFixed(2)}`}</strong></div>`;
}

function clearCorridorMetrics() {
  $("corridorMetrics").innerHTML = `<div><span>${escapeHtml(oiT("corridorPerformance"))}</span><strong>${escapeHtml(oiT("selectCorridor"))}</strong></div>`;
}

function updateSummary() {
  const data = state.map?.data || {};
  $("visibleIntelligenceValue").textContent = oiT("visibleCounts", {
    pois: data.pois?.features?.length || 0,
    corridors: data.corridors?.features?.length || 0,
    staging: data.staging?.features?.length || 0,
  });
  $("historyCountValue").textContent = oiT("historyCounts", {
    completed: state.history.filter((entry) => String(entry.status).toLowerCase() === "completed").length,
    total: state.history.length,
  });
  $("marketTimezoneValue").textContent = state.market ? `${state.market.name} · ${state.market.timezone}` : oiT("noMarket");
}

function populateMarketSelect() {
  $("marketSelect").innerHTML = state.markets.map((market) => `<option value="${escapeHtml(market.id)}">${escapeHtml(market.name)}</option>`).join("");
}

function downloadMarketExport() {
  downloadText(exportMarkets(state.markets), `apex-markets-${dateStamp()}.json`, "application/json");
}

async function uploadMarketImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    importMarkets(await file.text());
    state.markets = await loadMarkets();
    populateMarketSelect();
    setStatus(oiT("marketsImported"), "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    event.target.value = "";
  }
}

function downloadHistoryExport() {
  downloadText(exportOperationalHistory(state.history), `apex-operational-history-${dateStamp()}.json`, "application/json");
}

async function uploadHistoryImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    importOperationalHistory(await file.text());
    refreshHistory();
    setStatus(oiT("historyImported"), "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    event.target.value = "";
  }
}

async function syncOfflineData() {
  if (!state.market) return;
  const urls = [
    "./operational-intelligence.css",
    "./modules/intelligence-app.js",
    "./modules/intelligence-i18n.js",
    "./modules/map.js",
    "./modules/location.js",
    "./modules/markets.js",
    "./modules/zones.js",
    "./modules/corridors.js",
    "./modules/pois.js",
    "./modules/staging.js",
    "./modules/intelligence.js",
    "./data/markets.json",
    ...Object.values(state.market.layers),
  ];
  try {
    await Promise.all(urls.map((url) => fetch(url, { cache: "reload" }).then((response) => {
      if (!response.ok) throw new Error(oiT("unableToCache", { url }));
      return response;
    })));
    const registration = await navigator.serviceWorker?.ready;
    registration?.active?.postMessage({ type: "CACHE_OPERATIONAL_DATA", urls });
    setStatus(oiT("offlineSynced"), "ok");
  } catch (error) {
    setStatus(oiT("offlineSyncFailed", { message: error.message }), "error");
  }
}

function refreshLanguage() {
  applyIntelligenceTranslations();
  renderSelection(state.selected);
  if (state.selected?.type === "corridor") renderCorridorMetrics(state.selected.feature.properties?.id);
  else clearCorridorMetrics();
  renderStagingManager();
  updateSummary();

  const mapContainer = $("operationalMap");
  mapContainer?.setAttribute("aria-label", oiT(mapContainer.classList.contains("operational-map--fallback") ? "mapUnavailable" : "mapAria"));
  if (mapContainer?.classList.contains("operational-map--fallback")) {
    const heading = mapContainer.querySelector("strong");
    const detail = mapContainer.querySelector("span");
    if (heading) heading.textContent = oiT("mapUnavailable");
    if (detail) detail.textContent = oiT("mapUnavailableDetail");
    setStatus(oiT("overlayFallback", {
      message: localizeMapError(state.mapFailureMessage),
    }), "warning");
  } else if (state.mapReady) {
    setStatus(oiT(state.map?.basemapAvailable ? "ready" : "offlineBasemap"), state.map?.basemapAvailable ? "ok" : "warning");
  } else {
    setStatus(oiT("openIntelligence"));
  }

  if (state.location.position) applyPosition(state.location.position);
}

function localizeMapError(message) {
  const value = String(message || "");
  if (!value) return oiT("initializationFailed");
  if (/WebGL/i.test(value) && /unavailable|requires/i.test(value)) return oiT("webGlUnavailable");
  if (/MapLibre|map library/i.test(value)) return oiT("mapLibraryFailed");
  if (/could not initialize|timed out/i.test(value)) return oiT("mapInitializeFailed");
  return value;
}

function localizeLocationError(message) {
  const value = String(message || "");
  if (/requires HTTPS/i.test(value)) return oiT("locationHttps");
  if (/not supported/i.test(value)) return oiT("geolocationUnsupported");
  if (/permission was denied/i.test(value)) return oiT("locationDenied");
  if (/unavailable/i.test(value)) return oiT("locationUnavailable");
  if (/timed out/i.test(value)) return oiT("locationTimeout");
  if (/retrieve the current location/i.test(value)) return oiT("locationUnknown");
  return value || oiT("locationUnknown");
}

function setStatus(message, tone = "neutral") {
  const element = $("intelligenceStatus");
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function numericInput(id) { const value = Number($(id)?.value); return Number.isFinite(value) ? value : 0; }
function numericText(value) { const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/); return match ? Number(match[0]) : 0; }
function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
function dateStamp() { return new Date().toISOString().slice(0, 10); }

document.addEventListener("DOMContentLoaded", boot);
