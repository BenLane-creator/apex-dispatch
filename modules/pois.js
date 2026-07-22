export async function loadPois(market) {
  const response = await fetch(market.layers.pois, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load merchant POIs (${response.status})`);
  return response.json();
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
      paint: { "circle-color": "#f8fafc", "circle-stroke-color": "#0284c7", "circle-stroke-width": 2, "circle-radius": 6 },
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
}

export function setPoiCategoryFilter(map, category) {
  if (!map.getLayer("apex-poi-points")) return;
  const base = ["!", ["has", "point_count"]];
  map.setFilter("apex-poi-points", category === "all" ? base : ["all", base, ["==", ["get", "category"], category]]);
}
