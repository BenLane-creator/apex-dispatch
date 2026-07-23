export async function loadCorridors(market) {
  const response = await fetch(market.layers.corridors, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load corridors (${response.status}).`);
  const value = await response.json();
  if (value?.type !== "FeatureCollection" || !Array.isArray(value.features)) throw new Error("Invalid corridor GeoJSON.");
  return value;
}

export function addCorridorLayers(map, corridors, onSelect) {
  const source = map.getSource("apex-corridors");
  if (source) source.setData(corridors);
  else map.addSource("apex-corridors", { type: "geojson", data: corridors });

  if (!map.getLayer("apex-corridor-lines")) {
    map.addLayer({
      id: "apex-corridor-lines",
      type: "line",
      source: "apex-corridors",
      paint: {
        "line-color": ["match", ["get", "classification"], "primary", "#38bdf8", "secondary", "#a78bfa", "#94a3b8"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 7],
        "line-opacity": 0.84,
      },
    });
  }
  if (!map.getLayer("apex-corridor-labels")) {
    map.addLayer({
      id: "apex-corridor-labels",
      type: "symbol",
      source: "apex-corridors",
      minzoom: 11,
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#e0f2fe",
        "text-halo-color": "#0f172a",
        "text-halo-width": 1.5,
      },
    });
  }

  map.on("click", "apex-corridor-lines", (event) => {
    const feature = event.features?.[0];
    if (feature) onSelect?.(feature);
  });
  map.on("mouseenter", "apex-corridor-lines", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "apex-corridor-lines", () => { map.getCanvas().style.cursor = ""; });
}

export function corridorCenter(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || !coordinates.length) return null;
  const points = feature.geometry.type === "MultiLineString" ? coordinates.flat() : coordinates;
  const valid = points.filter((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite));
  if (!valid.length) return null;
  const total = valid.reduce((result, [longitude, latitude]) => ({ longitude: result.longitude + longitude, latitude: result.latitude + latitude }), { longitude: 0, latitude: 0 });
  return { longitude: total.longitude / valid.length, latitude: total.latitude / valid.length };
}
