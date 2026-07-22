const STAGING_KEY = "apexDispatch.staging.v1";

export async function loadStagingPoints(market) {
  const response = await fetch(market.layers.staging, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load staging points (${response.status})`);
  const bundled = await response.json();
  const saved = readSaved().filter((feature) => feature.properties?.marketId === market.id);
  const byId = new Map();
  [...(bundled.features || []), ...saved].forEach((feature) => byId.set(feature.properties.id, feature));
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
      paint: {
        "circle-color": ["case", ["get", "preferred"], "#22c55e", "#f59e0b"],
        "circle-radius": 8,
        "circle-stroke-color": "#0f172a",
        "circle-stroke-width": 2,
      },
    });
  }
  map.on("click", "apex-staging-points", (event) => {
    const feature = event.features?.[0];
    if (feature) onSelect?.(feature);
  });
}

export function saveStagingPoint(point) {
  const records = readSaved();
  const feature = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(point.longitude), Number(point.latitude)] },
    properties: {
      id: point.id || crypto.randomUUID(),
      marketId: point.marketId,
      name: String(point.name || "Staging point").trim(),
      zoneId: point.zoneId || null,
      corridorId: point.corridorId || null,
      preferred: Boolean(point.preferred),
      notes: String(point.notes || "").trim(),
      createdAt: point.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
  const index = records.findIndex((item) => item.properties.id === feature.properties.id);
  if (index >= 0) records[index] = feature;
  else records.push(feature);
  localStorage.setItem(STAGING_KEY, JSON.stringify(records));
  return feature;
}

export function nearestStagingPoint(staging, position) {
  if (!position || !staging?.features?.length) return null;
  return staging.features
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
