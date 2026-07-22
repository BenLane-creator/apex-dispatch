export async function loadCorridors(market) {
  const response = await fetch(market.layers.corridors, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Unable to load corridors (${response.status})`);
  return response.json();
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
        "line-opacity": 0.82,
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
