export async function loadZones(market) {
  return loadGeoJson(market.layers.zones);
}

export function addZoneLayers(map, zones) {
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
}

export function findZoneAtPoint(zones, point) {
  if (!zones?.features || !point) return null;
  return zones.features.find((feature) => feature.geometry?.type === "Polygon" && pointInPolygon([point.longitude, point.latitude], feature.geometry.coordinates[0])) || null;
}

async function loadGeoJson(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return response.json();
}

function upsertSource(map, id, data) {
  const existing = map.getSource(id);
  if (existing) existing.setData(data);
  else map.addSource(id, { type: "geojson", data });
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
