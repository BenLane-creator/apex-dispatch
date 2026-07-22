const MARKET_STORAGE_KEY = "apexDispatch.markets.v1";
const ACTIVE_MARKET_KEY = "apexDispatch.activeMarket.v1";

async function readBundledMarkets() {
  const response = await fetch("./data/markets.json", { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load markets (${response.status})`);
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

function validateMarket(market) {
  if (!market || typeof market !== "object") return false;
  if (!market.id || !market.name || !market.timezone) return false;
  if (!Array.isArray(market.center) || market.center.length !== 2) return false;
  return market.center.every(Number.isFinite);
}

export async function loadMarkets() {
  const bundled = await readBundledMarkets();
  const imported = readImportedMarkets();
  const byId = new Map();
  [...bundled, ...imported].filter(validateMarket).forEach((market) => byId.set(market.id, market));
  return [...byId.values()];
}

export function getActiveMarketId(fallback = "st-george-ut") {
  return localStorage.getItem(ACTIVE_MARKET_KEY) || fallback;
}

export function setActiveMarketId(id) {
  localStorage.setItem(ACTIVE_MARKET_KEY, id);
}

export function exportMarkets(markets) {
  return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), markets }, null, 2);
}

export function importMarkets(text) {
  const parsed = JSON.parse(text);
  const incoming = Array.isArray(parsed) ? parsed : parsed.markets;
  if (!Array.isArray(incoming) || !incoming.every(validateMarket)) {
    throw new Error("The selected file does not contain valid Apex market records.");
  }
  localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(incoming));
  return incoming;
}
