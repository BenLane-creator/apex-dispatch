const SHIFT_KEY = "apexDispatch.shift.v3";
const HISTORY_KEY = "apexDispatch.operationalHistory.v1";

export function readOfferHistory() {
  const history = safeJson(HISTORY_KEY, []);
  const shift = safeJson(SHIFT_KEY, { logs: [] });
  const current = Array.isArray(shift.logs) ? shift.logs : [];
  const byId = new Map();
  [...history, ...current].forEach((entry, index) => byId.set(entry.id || `${entry.timestamp || "entry"}-${index}`, normalizeEntry(entry)));
  return [...byId.values()];
}

export function recordOperationalEvent(event) {
  const history = safeJson(HISTORY_KEY, []);
  const record = normalizeEntry({ id: crypto.randomUUID(), recordedAt: new Date().toISOString(), ...event });
  history.push(record);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-2000)));
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
    averageWait: average(completed.map((entry) => Number(entry.waitMinutes || 0)).filter(Number.isFinite)),
  };
}

export function buildHeatmapGeoJson(history) {
  const features = history
    .filter((entry) => Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude))
    .map((entry) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [roundCoordinate(entry.longitude), roundCoordinate(entry.latitude)] },
      properties: { weight: Math.max(0.25, Number(entry.payout || 0) / 10), status: entry.status || "observed" },
    }));
  return { type: "FeatureCollection", features };
}

export function addHeatmapLayer(map, geojson) {
  const source = map.getSource("apex-activity");
  if (source) source.setData(geojson);
  else map.addSource("apex-activity", { type: "geojson", data: geojson });
  if (!map.getLayer("apex-activity-heat")) {
    map.addLayer({
      id: "apex-activity-heat",
      type: "heatmap",
      source: "apex-activity",
      maxzoom: 15,
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0, 3, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 1.8],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 12, 14, 28],
        "heatmap-opacity": 0.62,
      },
    }, "apex-poi-clusters");
  }
}

export function recommendRecovery(staging, position, history) {
  if (!position || !staging?.features?.length) return null;
  return staging.features
    .map((feature) => {
      const corridorId = feature.properties.corridorId;
      const metrics = corridorMetrics(history, corridorId);
      const miles = distanceMiles(position, feature.geometry.coordinates);
      const performance = metrics.grossPerHour || 0;
      const preferredBonus = feature.properties.preferred ? 4 : 0;
      return { feature, miles, metrics, score: performance + preferredBonus - miles * 4 };
    })
    .sort((a, b) => b.score - a.score)[0];
}

function normalizeEntry(entry) {
  return {
    ...entry,
    status: entry.status || entry.decision || "observed",
    payout: Number(entry.payout || 0),
    miles: Number(entry.miles || entry.totalMiles || 0),
    minutes: Number(entry.minutes || entry.totalMinutes || 0),
    corridorId: entry.corridorId || entry.locationContext?.corridorId || null,
    latitude: Number.isFinite(entry.latitude) ? entry.latitude : entry.locationContext?.latitude,
    longitude: Number.isFinite(entry.longitude) ? entry.longitude : entry.locationContext?.longitude,
  };
}

function safeJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}
function sum(records, key) { return records.reduce((total, entry) => total + Number(entry[key] || 0), 0); }
function average(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function roundCoordinate(value) { return Math.round(Number(value) * 500) / 500; }
function distanceMiles(position, coordinates) {
  const toRad = (value) => value * Math.PI / 180;
  const lat1 = toRad(position.latitude); const lat2 = toRad(coordinates[1]);
  const dLat = lat2 - lat1; const dLon = toRad(coordinates[0] - position.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
