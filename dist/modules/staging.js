const STAGING_KEY = "apexDispatch.staging.v1";

export async function loadStagingPoints(market) {
  const response = await fetch(market.layers.staging, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load staging points (${response.status}).`);
  const bundled = await response.json();
  if (bundled?.type !== "FeatureCollection" || !Array.isArray(bundled.features)) throw new Error("Invalid staging GeoJSON.");
  const saved = readSaved().filter((feature) => feature.properties?.marketId === market.id);
  const byId = new Map();
  [...bundled.features, ...saved].forEach((feature) => byId.set(feature.properties.id, feature));
  return { type: "FeatureCollection", features: [...byId.values()] };
}

export function addStagingLayers(map, staging, onSelect) {
  const source = map.getSource("apex-staging");
  if (source) source.setData(staging);
  else map.addSource("apex-staging", { type: "geojson", data: staging });
  if (!map.getLayer("apex-staging-points")) {
    map.addLayer({
      id: "apex-staging-points",
      type: "circle",
      source: "apex-staging",
      filter: ["!=", ["get", "active"], false],
      paint: {
        "circle-color": ["case", ["get", "preferred"], "#22c55e", "#f59e0b"],
        "circle-radius": 9,
        "circle-stroke-color": "#0f172a",
        "circle-stroke-width": 2,
      },
    });
  }
  map.on("click", "apex-staging-points", (event) => {
    const feature = event.features?.[0];
    if (feature) onSelect?.(feature);
  });
  map.on("mouseenter", "apex-staging-points", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "apex-staging-points", () => { map.getCanvas().style.cursor = ""; });
}

export function saveStagingPoint(point) {
  const longitude = Number(point.longitude);
  const latitude = Number(point.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) throw new Error("A staging point requires valid coordinates.");
  const records = readSaved();
  const feature = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: {
      id: point.id || crypto.randomUUID(),
      marketId: point.marketId,
      name: String(point.name || "Staging point").trim(),
      address: String(point.address || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`).trim(),
      zoneId: point.zoneId || null,
      corridorId: point.corridorId || null,
      preferred: Boolean(point.preferred),
      active: point.active !== false,
      notes: String(point.notes || "").trim(),
      source: "user",
      createdAt: point.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
  const index = records.findIndex((item) => item.properties.id === feature.properties.id);
  if (index >= 0) records[index] = feature;
  else records.push(feature);
  writeSaved(records);
  return feature;
}

export function deleteStagingPoint(id) {
  const records = readSaved();
  const retained = records.filter((item) => item.properties?.id !== id);
  writeSaved(retained);
  return retained.length !== records.length;
}

export function setStagingPreference(id, preferred) {
  const records = readSaved();
  const record = records.find((item) => item.properties?.id === id);
  if (!record) return false;
  record.properties.preferred = Boolean(preferred);
  record.properties.updatedAt = new Date().toISOString();
  writeSaved(records);
  return true;
}

export function userStagingPoints(marketId) {
  return readSaved().filter((feature) => feature.properties?.marketId === marketId);
}

export function nearestStagingPoint(staging, position) {
  if (!position || !staging?.features?.length) return null;
  return staging.features
    .filter((feature) => feature.properties?.active !== false)
    .map((feature) => ({ feature, miles: haversineMiles(position, feature.geometry.coordinates) }))
    .sort((a, b) => a.miles - b.miles)[0] || null;
}

function readSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(STAGING_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeSaved(records) {
  localStorage.setItem(STAGING_KEY, JSON.stringify(records));
}

function haversineMiles(position, coordinates) {
  const toRad = (value) => value * Math.PI / 180;
  const earthMiles = 3958.8;
  const lat1 = toRad(position.latitude);
  const lat2 = toRad(coordinates[1]);
  const dLat = lat2 - lat1;
  const dLon = toRad(coordinates[0] - position.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
