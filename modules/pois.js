export async function loadPois(market) {
  const response = await fetch(market.layers.pois, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load merchant POIs (${response.status}).`);
  const value = await response.json();
  if (value?.type !== "FeatureCollection" || !Array.isArray(value.features)) throw new Error("Invalid merchant POI GeoJSON.");
  return value;
}

export function addPoiLayers(map, pois, onSelect) {
  const source = map.getSource("apex-pois");
  if (source) source.setData(pois);
  else map.addSource("apex-pois", { type: "geojson", data: pois, cluster: true, clusterRadius: 44, clusterMaxZoom: 13 });

  if (!map.getLayer("apex-poi-clusters")) {
    map.addLayer({
      id: "apex-poi-clusters",
      type: "circle",
      source: "apex-pois",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#0ea5e9",
        "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 30, 30],
        "circle-opacity": 0.86,
      },
    });
    map.addLayer({
      id: "apex-poi-cluster-count",
      type: "symbol",
      source: "apex-pois",
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
      paint: { "text-color": "#ffffff" },
    });
    map.addLayer({
      id: "apex-poi-points",
      type: "circle",
      source: "apex-pois",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["match", ["get", "category"], "restaurant", "#fb7185", "grocery", "#4ade80", "shopping", "#c084fc", "hotel", "#fbbf24", "hospital", "#f87171", "fuel", "#94a3b8", "#f8fafc"],
        "circle-stroke-color": "#0f172a",
        "circle-stroke-width": 2,
        "circle-radius": 7,
      },
    });
  }

  map.on("click", "apex-poi-clusters", async (event) => {
    const feature = event.features?.[0];
    const clusterId = feature?.properties?.cluster_id;
    if (clusterId === undefined) return;
    const zoom = await map.getSource("apex-pois").getClusterExpansionZoom(clusterId);
    map.easeTo({ center: feature.geometry.coordinates, zoom });
  });
  map.on("click", "apex-poi-points", (event) => {
    const feature = event.features?.[0];
    if (feature) onSelect?.(feature);
  });
  ["apex-poi-clusters", "apex-poi-points"].forEach((layer) => {
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  });
}

export function filterPois(pois, category) {
  if (!pois?.features || category === "all") return pois;
  return { ...pois, features: pois.features.filter((feature) => feature.properties?.category === category) };
}
