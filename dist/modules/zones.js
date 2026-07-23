export async function loadZones(market) {
  return loadGeoJson(market.layers.zones, "zones");
}

export function addZoneLayers(map, zones, onSelect) {
  upsertSource(map, "apex-zones", zones);
  if (!map.getLayer("apex-zone-fill")) {
    map.addLayer({
      id: "apex-zone-fill",
      type: "fill",
      source: "apex-zones",
      paint: {
        "fill-color": ["match", ["get", "classification"], "core", "#22c55e", "conditional", "#f59e0b", "#64748b"],
        "fill-opacity": 0.14,
      },
    });
  }
  if (!map.getLayer("apex-zone-outline")) {
    map.addLayer({
      id: "apex-zone-outline",
      type: "line",
      source: "apex-zones",
      paint: {
        "line-color": ["match", ["get", "classification"], "core", "#22c55e", "conditional", "#f59e0b", "#94a3b8"],
        "line-width": 2,
      },
    });
  }
  map.on("click", "apex-zone-fill", (event) => {
    const feature = event.features?.[0];
    if (feature) onSelect?.(feature);
  });
  map.on("mouseenter", "apex-zone-fill", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "apex-zone-fill", () => { map.getCanvas().style.cursor = ""; });
}

export function findZoneAtPoint(zones, point) {
  if (!zones?.features || !point) return null;
  const candidates = zones.features.filter((feature) => ["Polygon", "MultiPolygon"].includes(feature.geometry?.type));
  return candidates
    .filter((feature) => geometryContainsPoint(feature.geometry, [point.longitude, point.latitude]))
    .sort((a, b) => zoneRank(a) - zoneRank(b))[0] || null;
}

async function loadGeoJson(url, label) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load ${label} (${response.status}).`);
  const value = await response.json();
  if (value?.type !== "FeatureCollection" || !Array.isArray(value.features)) throw new Error(`Invalid ${label} GeoJSON.`);
  return value;
}

function upsertSource(map, id, data) {
  const existing = map.getSource(id);
  if (existing) existing.setData(data);
  else map.addSource(id, { type: "geojson", data });
}

function geometryContainsPoint(geometry, point) {
  if (geometry.type === "Polygon") return geometry.coordinates.some((ring, index) => index === 0 && pointInPolygon(point, ring));
  return geometry.coordinates.some((polygon) => polygon.some((ring, index) => index === 0 && pointInPolygon(point, ring)));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const denominator = (yj - yi) || Number.EPSILON;
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / denominator + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function zoneRank(feature) {
  return { core: 0, conditional: 1, outer: 2 }[feature.properties?.classification] ?? 9;
}
