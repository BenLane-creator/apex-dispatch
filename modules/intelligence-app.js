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
};

const $ = (id) => document.getElementById(id);

async function boot() {
  if (!$("operationalMap")) return;
  bindUi();
  setStatus("Loading operating markets…");
  try {
    state.markets = await loadMarkets();
    if (!state.markets.length) throw new Error("No operating markets are configured.");
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
    else setStatus("Open Local Intelligence to initialize the map.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Operational intelligence failed to load.", "error");
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
  document.querySelector('[data-tab="intelligence"]')?.addEventListener("click", () => {
    requestAnimationFrame(() => ensureMap().then(() => state.map?.resize()));
  });
  state.location.addEventListener("position", (event) => applyPosition(event.detail));
  state.location.addEventListener("error", (event) => setStatus(event.detail.message, "error"));
  window.addEventListener("storage", (event) => {
    if ([SHIFT_KEY, "apexDispatch.operationalHistory.v1"].includes(event.key)) refreshHistory();
  });
  window.addEventListener("online", () => setStatus("Connection restored. Basemap data can refresh.", "ok"));
  window.addEventListener("offline", () => setStatus("Offline mode: operational overlays remain available; the basemap may be unavailable.", "warning"));
}

async function ensureMap() {
  if (state.mapReady && state.map) return state.map;
  if (state.mapPromise) return state.mapPromise;
  state.mapPromise = (async () => {
    setStatus(`Loading ${state.market.name}…`);
    state.map = state.map || new OperationalMap("operationalMap");
    bindMapEvents(state.map);
    await state.map.initialize(state.market, state.history);
    state.mapReady = true;
    if (state.location.position) state.map.setPosition(state.location.position, { center: false });
    updateSummary();
    renderStagingManager();
    setStatus(state.map.basemapAvailable ? "Operational intelligence ready." : "Operational overlays loaded in offline basemap mode.", state.map.basemapAvailable ? "ok" : "warning");
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
  setStatus("Requesting current location…");
  try {
    await ensureMap();
    const position = await state.location.locate({ maximumAge: 0 });
    applyPosition(position);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function applyPosition(position) {
  state.map?.setPosition(position);
  const zone = findZoneAtPoint(state.map?.data?.zones, position);
  const nearest = nearestStagingPoint(state.map?.data?.staging, position);
  const recommendation = recommendRecovery(state.map?.data?.staging, position, state.history);
  $("currentAreaValue").textContent = zone?.properties?.name || state.market?.name || "Outside configured zones";
  $("nearestStagingValue").textContent = nearest ? `${nearest.feature.properties.name} · ${nearest.miles.toFixed(1)} mi` : "No staging points configured";
  $("recoveryRecommendationValue").textContent = recommendation
    ? `${recommendation.feature.properties.name} · ${recommendation.miles.toFixed(1)} mi${recommendation.provisional ? " · provisional" : ""}`
    : "Insufficient data";
  $("locationTimestamp").textContent = `Updated ${new Date(position.capturedAt).toLocaleTimeString()} · ±${Math.round(position.accuracy)} m`;
  setStatus("Current location acquired. Coordinates remain in memory unless you save a staging point.", "ok");
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
    setStatus(`${market.name} loaded.`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function handleSelection(selection) {
  state.selected = selection;
  renderSelection(selection);
  if (selection.type === "corridor") renderCorridorMetrics(selection.feature.properties?.id);
  else clearCorridorMetrics();
}

function renderSelection(selection) {
  if (!selection) {
    $("selectionType").textContent = "No selection";
    $("selectionName").textContent = "Select a zone, corridor, merchant cluster, or staging point";
    $("selectionDetails").textContent = "Map selections can populate the offer pickup, add a recovery point, or show corridor performance.";
    $("useSelectionAsPickup").disabled = true;
    $("useSelectionAsRecovery").disabled = true;
    clearCorridorMetrics();
    return;
  }
  const properties = selection.feature.properties || {};
  $("selectionType").textContent = titleCase(selection.type);
  $("selectionName").textContent = properties.name || properties.id || "Selected map feature";
  $("selectionDetails").textContent = selectionDescription(selection);
  $("useSelectionAsPickup").disabled = !["poi", "staging"].includes(selection.type);
  $("useSelectionAsRecovery").disabled = selection.type !== "staging";
}

function selectionDescription(selection) {
  const properties = selection.feature.properties || {};
  if (selection.type === "zone") return `${titleCase(properties.classification || "operating")} zone · minimum gross per mile $${Number(properties.minimumGrossPerMile || 0).toFixed(2)}`;
  if (selection.type === "corridor") return `${titleCase(properties.classification || "commercial")} corridor · ${properties.notes || "Operational corridor"}`;
  if (selection.type === "poi") return `${titleCase(properties.category || "merchant")} · ${properties.address || "Curated commercial point"}`;
  if (selection.type === "staging") return `${properties.zoneId || "Unassigned zone"} · ${properties.notes || "Approved staging point"}`;
  return properties.notes || "Operational map feature";
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
  setStatus("Map selection assigned as the offer pickup.", "ok");
}

function useSelectionAsRecovery() {
  if (!state.selected || state.selected.type !== "staging") return;
  const properties = state.selected.feature.properties || {};
  const coordinates = state.selected.feature.geometry?.coordinates || [];
  const form = $("recoveryPointForm");
  if (!form) {
    setStatus("Recovery form is unavailable.", "error");
    return;
  }
  $("recoveryPointId").value = `intelligence-${properties.id}`;
  $("recoveryPointName").value = properties.name || "Operational staging point";
  $("recoveryPointAddress").value = properties.address || `${Number(coordinates[1]).toFixed(6)}, ${Number(coordinates[0]).toFixed(6)}`;
  $("recoveryPointParking").value = properties.notes || "Use a legal marked stall and verify posted restrictions.";
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
  setStatus("Staging point added to the Apex recovery network.", "ok");
}

async function saveCurrentStaging() {
  if (!state.location.position) {
    setStatus("Use Locate Me before saving a staging point.", "error");
    return;
  }
  const name = $("stagingName").value.trim();
  if (!name) {
    setStatus("Enter a staging point name.", "error");
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
    setStatus("Staging point saved locally and added to the map.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function manageStagingList(event) {
  const remove = event.target.closest("[data-delete-staging]");
  const preferred = event.target.closest("[data-prefer-staging]");
  if (remove) {
    if (!confirm("Delete this locally saved staging point?")) return;
    deleteStagingPoint(remove.dataset.deleteStaging);
    await state.map?.refreshStaging();
    renderStagingManager();
    setStatus("Staging point deleted.", "ok");
  }
  if (preferred) {
    setStagingPreference(preferred.dataset.preferStaging, preferred.dataset.preferred !== "true");
    await state.map?.refreshStaging();
    renderStagingManager();
    setStatus("Staging preference updated.", "ok");
  }
}

function renderStagingManager() {
  const list = $("stagingManagerList");
  if (!list || !state.market) return;
  const points = userStagingPoints(state.market.id);
  if (!points.length) {
    list.innerHTML = '<p class="empty-state">No locally saved staging points.</p>';
    return;
  }
  list.innerHTML = points.map((feature) => {
    const properties = feature.properties || {};
    return `<article class="intelligence-staging-item">
      <div><strong>${escapeHtml(properties.name)}</strong><span>${escapeHtml(properties.zoneId || "Unassigned zone")}${properties.preferred ? " · Preferred" : ""}</span></div>
      <div class="button-row wrap">
        <button type="button" class="text-button" data-prefer-staging="${escapeHtml(properties.id)}" data-preferred="${Boolean(properties.preferred)}">${properties.preferred ? "Remove preference" : "Prefer"}</button>
        <button type="button" class="text-button" data-delete-staging="${escapeHtml(properties.id)}">Delete</button>
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
  setStatus(`${state.market.name} scoring profile applied.`, "ok");
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
    <div><span>Offers</span><strong>${metrics.offers}</strong></div>
    <div><span>Completed</span><strong>${metrics.completed}</strong></div>
    <div><span>Gross / mile</span><strong>${metrics.grossPerMile === null ? "—" : `$${metrics.grossPerMile.toFixed(2)}`}</strong></div>
    <div><span>Gross / hour</span><strong>${metrics.grossPerHour === null ? "—" : `$${metrics.grossPerHour.toFixed(2)}`}</strong></div>`;
}

function clearCorridorMetrics() {
  $("corridorMetrics").innerHTML = '<div><span>Corridor performance</span><strong>Select a corridor</strong></div>';
}

function updateSummary() {
  const data = state.map?.data || {};
  $("visibleIntelligenceValue").textContent = `${data.pois?.features?.length || 0} POIs · ${data.corridors?.features?.length || 0} corridors · ${data.staging?.features?.length || 0} staging points`;
  $("historyCountValue").textContent = `${state.history.filter((entry) => String(entry.status).toLowerCase() === "completed").length} completed · ${state.history.length} total records`;
  $("marketTimezoneValue").textContent = state.market ? `${state.market.name} · ${state.market.timezone}` : "No market";
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
    setStatus("Markets imported. Select a market to load it.", "ok");
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
    setStatus("Operational history imported.", "ok");
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
      if (!response.ok) throw new Error(`Unable to cache ${url}`);
      return response;
    })));
    const registration = await navigator.serviceWorker?.ready;
    registration?.active?.postMessage({ type: "CACHE_OPERATIONAL_DATA", urls });
    setStatus("Operational overlays synchronized for offline use. Basemap tiles are not bulk-cached.", "ok");
  } catch (error) {
    setStatus(`Offline synchronization failed: ${error.message}`, "error");
  }
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
function titleCase(value) { return String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
function dateStamp() { return new Date().toISOString().slice(0, 10); }

document.addEventListener("DOMContentLoaded", boot);
