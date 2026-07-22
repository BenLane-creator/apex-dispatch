import { loadMarkets, getActiveMarketId, setActiveMarketId, exportMarkets, importMarkets } from "./markets.js";
import { LocationService } from "./location.js";
import { OperationalMap } from "./map.js";
import { nearestStagingPoint, recommendRecovery as _unused } from "./staging.js";
import { readOfferHistory, corridorMetrics, recommendRecovery, recordOperationalEvent } from "./intelligence.js";

const state = {
  markets: [],
  market: null,
  history: [],
  map: null,
  location: new LocationService(),
  selected: null,
};

const $ = (id) => document.getElementById(id);

async function boot() {
  const root = $("intelligence");
  if (!root) return;
  bindUi();
  setStatus("Loading operating market…");
  try {
    state.markets = await loadMarkets();
    if (!state.markets.length) throw new Error("No operating markets are configured.");
    populateMarketSelect();
    const preferredId = getActiveMarketId(state.markets[0].id);
    state.market = state.markets.find((market) => market.id === preferredId) || state.markets[0];
    $("marketSelect").value = state.market.id;
    state.history = readOfferHistory();
    state.map = new OperationalMap("operationalMap");
    state.map.addEventListener("selection", (event) => handleSelection(event.detail));
    state.map.addEventListener("ready", () => updateSummary());
    await state.map.initialize(state.market, state.history);
    setStatus("Operational intelligence ready.", "ok");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Operational intelligence failed to load.", "error");
  }
}

function bindUi() {
  $("locateIntelligence").addEventListener("click", locate);
  $("centerMarket").addEventListener("click", () => state.map?.centerMarket());
  $("marketSelect").addEventListener("change", changeMarket);
  $("poiFilter").addEventListener("change", (event) => state.map?.setPoiFilter(event.target.value));
  document.querySelectorAll("[data-map-layer]").forEach((input) => {
    input.addEventListener("change", () => state.map?.setLayerVisibility(input.dataset.mapLayer, input.checked));
  });
  $("useSelectionAsPickup").addEventListener("click", useSelectionAsPickup);
  $("useSelectionAsRecovery").addEventListener("click", useSelectionAsRecovery);
  $("saveCurrentStaging").addEventListener("click", saveCurrentStaging);
  $("exportMarkets").addEventListener("click", downloadMarketExport);
  $("importMarkets").addEventListener("change", uploadMarketImport);
  window.addEventListener("apex:offer-completed", (event) => {
    recordOperationalEvent(event.detail || {});
    state.history = readOfferHistory();
    state.map?.refreshHistory(state.history);
    updateSummary();
  });
  state.location.addEventListener("position", (event) => applyPosition(event.detail));
  state.location.addEventListener("error", (event) => setStatus(event.detail.message, "error"));
}

async function locate() {
  const button = $("locateIntelligence");
  button.disabled = true;
  setStatus("Requesting current location…");
  try {
    const position = await state.location.locate();
    applyPosition(position);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

function applyPosition(position) {
  state.map?.setPosition(position);
  const zone = state.map?.data?.zones?.features?.find((feature) => feature.properties?.id && feature.geometry?.type === "Polygon");
  const nearest = nearestStagingPoint(state.map?.data?.staging, position);
  const recommendation = recommendRecovery(state.map?.data?.staging, position, state.history);
  $("currentAreaValue").textContent = zone?.properties?.name || state.market?.name || "Current market";
  $("nearestStagingValue").textContent = nearest ? `${nearest.feature.properties.name} · ${nearest.miles.toFixed(1)} mi` : "No staging points configured";
  $("recoveryRecommendationValue").textContent = recommendation ? `${recommendation.feature.properties.name} · score ${recommendation.score.toFixed(1)}` : "Insufficient data";
  $("locationTimestamp").textContent = `Updated ${new Date(position.capturedAt).toLocaleTimeString()} · ±${Math.round(position.accuracy)} m`;
  setStatus("Current location acquired.", "ok");
}

async function changeMarket(event) {
  const market = state.markets.find((item) => item.id === event.target.value);
  if (!market) return;
  state.market = market;
  setActiveMarketId(market.id);
  setStatus(`Loading ${market.name}…`);
  try {
    await state.map.initialize(market, state.history);
    setStatus(`${market.name} loaded.`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function handleSelection(selection) {
  state.selected = selection;
  const properties = selection.feature.properties || {};
  $("selectionType").textContent = titleCase(selection.type);
  $("selectionName").textContent = properties.name || properties.id || "Selected map feature";
  $("selectionDetails").textContent = selectionDescription(selection);
  $("useSelectionAsPickup").disabled = selection.type === "zone";
  $("useSelectionAsRecovery").disabled = selection.type !== "staging";
  if (selection.type === "corridor") renderCorridorMetrics(properties.id);
}

function selectionDescription(selection) {
  const properties = selection.feature.properties || {};
  if (selection.type === "corridor") return `${titleCase(properties.classification || "commercial")} corridor · ${properties.notes || "Operational corridor"}`;
  if (selection.type === "poi") return `${titleCase(properties.category || "merchant")} · ${properties.address || "Address not stored"}`;
  if (selection.type === "staging") return `${properties.zoneId || "Unassigned zone"} · ${properties.notes || "Approved staging point"}`;
  return properties.notes || "Operational map feature";
}

function useSelectionAsPickup() {
  if (!state.selected) return;
  const properties = state.selected.feature.properties || {};
  const input = $("pickupAddress");
  if (input) {
    input.value = properties.address || properties.name || "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  localStorage.setItem("apexDispatch.pendingLocationContext.v1", JSON.stringify(buildLocationContext()));
  setStatus("Map selection assigned as the offer pickup.", "ok");
}

function useSelectionAsRecovery() {
  if (!state.selected || state.selected.type !== "staging") return;
  localStorage.setItem("apexDispatch.pendingRecoveryPoint.v1", JSON.stringify({
    id: state.selected.feature.properties.id,
    name: state.selected.feature.properties.name,
    coordinates: state.selected.feature.geometry.coordinates,
  }));
  setStatus("Staging point assigned as the recovery target.", "ok");
}

function saveCurrentStaging() {
  if (!state.location.position) {
    setStatus("Use Locate Me before saving a staging point.", "error");
    return;
  }
  const name = prompt("Staging point name");
  if (!name) return;
  const records = JSON.parse(localStorage.getItem("apexDispatch.staging.v1") || "[]");
  records.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [state.location.position.longitude, state.location.position.latitude] },
    properties: { id: crypto.randomUUID(), marketId: state.market.id, name, preferred: false, createdAt: new Date().toISOString() },
  });
  localStorage.setItem("apexDispatch.staging.v1", JSON.stringify(records));
  setStatus("Staging point saved. Reload the market to display it.", "ok");
}

function buildLocationContext() {
  const properties = state.selected?.feature?.properties || {};
  const coordinates = state.selected?.feature?.geometry?.coordinates;
  return {
    marketId: state.market?.id,
    corridorId: state.selected?.type === "corridor" ? properties.id : properties.corridorId || null,
    pickupPoiId: state.selected?.type === "poi" ? properties.id : null,
    recoveryStagingPointId: state.selected?.type === "staging" ? properties.id : null,
    longitude: Array.isArray(coordinates) && typeof coordinates[0] === "number" ? coordinates[0] : null,
    latitude: Array.isArray(coordinates) && typeof coordinates[1] === "number" ? coordinates[1] : null,
    capturedAt: new Date().toISOString(),
  };
}

function renderCorridorMetrics(corridorId) {
  const metrics = corridorMetrics(state.history, corridorId);
  $("corridorMetrics").innerHTML = `
    <div><span>Offers</span><strong>${metrics.offers}</strong></div>
    <div><span>Completed</span><strong>${metrics.completed}</strong></div>
    <div><span>Gross / mile</span><strong>${metrics.grossPerMile === null ? "—" : `$${metrics.grossPerMile.toFixed(2)}`}</strong></div>
    <div><span>Gross / hour</span><strong>${metrics.grossPerHour === null ? "—" : `$${metrics.grossPerHour.toFixed(2)}`}</strong></div>`;
}

function updateSummary() {
  const data = state.map?.data || {};
  $("visibleIntelligenceValue").textContent = `${data.pois?.features?.length || 0} POIs · ${data.corridors?.features?.length || 0} corridors · ${data.staging?.features?.length || 0} staging points`;
  $("historyCountValue").textContent = `${state.history.length} operational records`;
}

function populateMarketSelect() {
  $("marketSelect").innerHTML = state.markets.map((market) => `<option value="${escapeHtml(market.id)}">${escapeHtml(market.name)}</option>`).join("");
}

function downloadMarketExport() {
  const blob = new Blob([exportMarkets(state.markets)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `apex-markets-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
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

function setStatus(message, tone = "neutral") {
  const element = $("intelligenceStatus");
  element.textContent = message;
  element.dataset.tone = tone;
}
function titleCase(value) { return String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }

document.addEventListener("DOMContentLoaded", boot);
