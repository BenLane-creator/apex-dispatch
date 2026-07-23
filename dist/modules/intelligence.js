const SHIFT_KEY = "apexDispatch.shift.v3";
const HISTORY_KEY = "apexDispatch.operationalHistory.v1";
const MAX_HISTORY = 2000;

export function readOfferHistory() {
  const history = safeJson(HISTORY_KEY, []);
  const shift = safeJson(SHIFT_KEY, { logs: [] });
  const current = Array.isArray(shift.logs) ? shift.logs : [];
  const byId = new Map();
  [...history, ...current].forEach((entry, index) => {
    const normalized = normalizeEntry(entry);
    const key = normalized.sourceLogId || normalized.id || normalized.fingerprint || `${normalized.timestamp || "entry"}-${index}`;
    byId.set(key, normalized);
  });
  return [...byId.values()].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
}

export function recordOperationalEvent(event) {
  const history = safeJson(HISTORY_KEY, []);
  const record = normalizeEntry({
    id: event.id || crypto.randomUUID(),
    recordedAt: event.recordedAt || new Date().toISOString(),
    timestamp: event.timestamp || Date.now(),
    ...event,
  });
  const duplicateIndex = history.findIndex((item) => {
    if (record.sourceLogId && item.sourceLogId === record.sourceLogId) return true;
    return record.fingerprint && item.fingerprint === record.fingerprint;
  });
  if (duplicateIndex >= 0) history[duplicateIndex] = { ...history[duplicateIndex], ...record };
  else history.push(record);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  return record;
}

export function corridorMetrics(history, corridorId) {
  const records = history.filter((entry) => entry.corridorId === corridorId);
  const completed = records.filter((entry) => String(entry.status).toLowerCase() === "completed");
  const gross = sum(completed, "payout");
  const miles = sum(completed, "miles");
  const minutes = sum(completed, "minutes");
  return {
    offers: records.length,
    completed: completed.length,
    gross,
    grossPerMile: miles > 0 ? gross / miles : null,
    grossPerHour: minutes > 0 ? gross / (minutes / 60) : null,
    averageWait: average(completed.map((entry) => Number(entry.waitMinutes)).filter(Number.isFinite)),
  };
}

export function buildHeatmapGeoJson(history, options = {}) {
  const completedOnly = options.completedOnly !== false;
  const features = history
    .filter((entry) => !completedOnly || String(entry.status).toLowerCase() === "completed")
    .filter((entry) => Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude))
    .map((entry) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [coarseCoordinate(entry.longitude), coarseCoordinate(entry.latitude)] },
      properties: {
        weight: Math.max(0.25, Math.min(4, Number(entry.payout || 0) / 10)),
        status: entry.status || "observed",
        corridorId: entry.corridorId || "",
      },
    }));
  return { type: "FeatureCollection", features };
}

export function addHeatmapLayer(map, geojson) {
  const source = map.getSource("apex-activity");
  if (source) source.setData(geojson);
  else map.addSource("apex-activity", { type: "geojson", data: geojson });
  if (!map.getLayer("apex-activity-heat")) {
    const before = map.getLayer("apex-poi-clusters") ? "apex-poi-clusters" : undefined;
    map.addLayer({
      id: "apex-activity-heat",
      type: "heatmap",
      source: "apex-activity",
      maxzoom: 15,
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 4, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.45, 14, 1.8],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 12, 14, 30],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(14,165,233,0)",
          0.25, "rgba(14,165,233,0.42)",
          0.5, "rgba(34,197,94,0.56)",
          0.75, "rgba(245,158,11,0.72)",
          1, "rgba(244,63,94,0.86)",
        ],
        "heatmap-opacity": 0.68,
      },
    }, before);
  }
}

export function recommendRecovery(staging, position, history) {
  if (!position || !staging?.features?.length) return null;
  return staging.features
    .filter((feature) => feature.properties?.active !== false)
    .map((feature) => {
      const corridorId = feature.properties?.corridorId;
      const metrics = corridorMetrics(history, corridorId);
      const miles = distanceMiles(position, feature.geometry.coordinates);
      const performance = metrics.grossPerHour ?? 0;
      const evidenceBonus = Math.min(metrics.completed, 10) * 0.35;
      const preferredBonus = feature.properties?.preferred ? 4 : 0;
      const score = performance + evidenceBonus + preferredBonus - miles * 4;
      return { feature, miles, metrics, score, provisional: metrics.completed < 3 };
    })
    .sort((a, b) => b.score - a.score)[0] || null;
}

export function exportOperationalHistory(history) {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records: history.map(normalizeEntry),
  }, null, 2);
}

export function importOperationalHistory(text) {
  const parsed = JSON.parse(text);
  const incoming = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(incoming)) throw new Error("The selected file does not contain operational history records.");
  const existing = safeJson(HISTORY_KEY, []);
  const byKey = new Map();
  [...existing, ...incoming].forEach((entry, index) => {
    const normalized = normalizeEntry(entry);
    const key = normalized.sourceLogId || normalized.id || normalized.fingerprint || `import-${index}`;
    byKey.set(key, normalized);
  });
  const merged = [...byKey.values()].slice(-MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
  return merged;
}

function normalizeEntry(entry) {
  const latitude = numericOrNull(entry.latitude ?? entry.locationContext?.latitude);
  const longitude = numericOrNull(entry.longitude ?? entry.locationContext?.longitude);
  return {
    ...entry,
    status: entry.status || entry.decision || "observed",
    payout: finiteOr(entry.payout, 0),
    miles: finiteOr(entry.miles ?? entry.totalMiles, 0),
    minutes: finiteOr(entry.minutes ?? entry.totalMinutes, 0),
    corridorId: entry.corridorId || entry.locationContext?.corridorId || null,
    pickupPoiId: entry.pickupPoiId || entry.locationContext?.pickupPoiId || null,
    recoveryStagingPointId: entry.recoveryStagingPointId || entry.locationContext?.recoveryStagingPointId || null,
    marketId: entry.marketId || entry.locationContext?.marketId || null,
    latitude,
    longitude,
  };
}

function safeJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}
function sum(records, key) { return records.reduce((total, entry) => total + Number(entry[key] || 0), 0); }
function average(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function finiteOr(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function numericOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function coarseCoordinate(value) { return Math.round(Number(value) / 0.003) * 0.003; }
function distanceMiles(position, coordinates) {
  const toRad = (value) => value * Math.PI / 180;
  const lat1 = toRad(position.latitude);
  const lat2 = toRad(coordinates[1]);
  const dLat = lat2 - lat1;
  const dLon = toRad(coordinates[0] - position.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
