const MARKET_STORAGE_KEY = "apexDispatch.markets.v1";
const ACTIVE_MARKET_KEY = "apexDispatch.activeMarket.v1";
const MARKET_SCHEMA_VERSION = 1;

async function readBundledMarkets() {
  const response = await fetch("./data/markets.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load markets (${response.status}).`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.markets || [];
}

function readImportedMarkets() {
  try {
    const value = JSON.parse(localStorage.getItem(MARKET_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function validateMarket(market) {
  if (!market || typeof market !== "object") return false;
  if (!market.id || !market.name || !market.timezone) return false;
  if (!Array.isArray(market.center) || market.center.length !== 2 || !market.center.every(Number.isFinite)) return false;
  if (!market.layers || typeof market.layers !== "object") return false;
  return ["zones", "corridors", "staging", "pois"].every((name) => isSafeLayerReference(market.layers[name]));
}

export async function loadMarkets() {
  const bundled = await readBundledMarkets();
  const imported = readImportedMarkets();
  const byId = new Map();
  [...bundled, ...imported]
    .filter(validateMarket)
    .forEach((market) => byId.set(market.id, normalizeMarket(market)));
  return [...byId.values()];
}

export function getActiveMarketId(fallback = "st-george-ut") {
  return localStorage.getItem(ACTIVE_MARKET_KEY) || fallback;
}

export function setActiveMarketId(id) {
  localStorage.setItem(ACTIVE_MARKET_KEY, id);
}

export function exportMarkets(markets) {
  return JSON.stringify({
    schemaVersion: MARKET_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    markets: markets.filter(validateMarket).map(normalizeMarket),
  }, null, 2);
}

export function importMarkets(text) {
  const parsed = JSON.parse(text);
  const incoming = Array.isArray(parsed) ? parsed : parsed.markets;
  if (!Array.isArray(incoming) || !incoming.length || !incoming.every(validateMarket)) {
    throw new Error("The selected file does not contain valid Apex market records.");
  }
  const existing = readImportedMarkets();
  const byId = new Map(existing.filter(validateMarket).map((market) => [market.id, normalizeMarket(market)]));
  incoming.forEach((market) => byId.set(market.id, normalizeMarket(market)));
  const merged = [...byId.values()];
  localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function removeImportedMarket(id) {
  const retained = readImportedMarkets().filter((market) => market.id !== id);
  localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(retained));
  return retained;
}

export function scoringForMarket(market) {
  const scoring = market?.scoring || {};
  return {
    vehicleCost: finiteOr(scoring.vehicleCostPerMile, 0.5),
    minimumPayout: finiteOr(scoring.minimumPayout, 7),
    targetGrossPerMile: finiteOr(scoring.targetGrossPerMile, 1.75),
    targetGrossHourly: finiteOr(scoring.targetGrossHourly, 25),
    defaultPickupWait: finiteOr(scoring.defaultPickupWait, 8),
    defaultDropoffMinutes: finiteOr(scoring.defaultDropoffMinutes, 3),
  };
}

function normalizeMarket(market) {
  return {
    ...market,
    id: String(market.id).trim(),
    name: String(market.name).trim(),
    timezone: String(market.timezone).trim(),
    center: market.center.map(Number),
    zoom: finiteOr(market.zoom, 11),
    mapStyle: market.mapStyle || "https://tiles.openfreemap.org/styles/liberty",
  };
}

function isSafeLayerReference(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin || url.protocol === "https:";
  } catch {
    return false;
  }
}

function finiteOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
