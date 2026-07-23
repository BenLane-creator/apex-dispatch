import { loadZones, addZoneLayers } from "./zones.js";
import { loadCorridors, addCorridorLayers } from "./corridors.js";
import { loadPois, addPoiLayers, filterPois } from "./pois.js";
import { loadStagingPoints, addStagingLayers } from "./staging.js";
import { addHeatmapLayer, buildHeatmapGeoJson } from "./intelligence.js";

const OFFLINE_STYLE = {
  version: 8,
  name: "Apex Offline",
  sources: {},
  layers: [{ id: "apex-offline-background", type: "background", paint: { "background-color": "#0f172a" } }],
};

export class OperationalMap extends EventTarget {
  constructor(containerId) {
    super();
    this.containerId = containerId;
    this.map = null;
    this.market = null;
    this.data = {};
    this.locationMarker = null;
    this.poiCategory = "all";
    this.layerVisibility = { zones: true, corridors: true, pois: true, staging: true, heatmap: true };
    this.basemapAvailable = true;
  }

  async initialize(market, history = []) {
    if (!window.maplibregl) throw new Error("MapLibre failed to load.");
    this.market = market;
    this.destroy();

    const mapResult = await createMapWithFallback(this.containerId, market);
    this.map = mapResult.map;
    this.basemapAvailable = mapResult.basemapAvailable;
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    this.map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

    const [zones, corridors, pois, staging] = await Promise.all([
      loadZones(market),
      loadCorridors(market),
      loadPois(market),
      loadStagingPoints(market),
    ]);
    this.data = { zones, corridors, pois, staging };
    addZoneLayers(this.map, zones, (feature) => this.emitSelection("zone", feature));
    addCorridorLayers(this.map, corridors, (feature) => this.emitSelection("corridor", feature));
    addPoiLayers(this.map, filterPois(pois, this.poiCategory), (feature) => this.emitSelection("poi", feature));
    addStagingLayers(this.map, staging, (feature) => this.emitSelection("staging", feature));
    addHeatmapLayer(this.map, buildHeatmapGeoJson(history));
    Object.entries(this.layerVisibility).forEach(([group, visible]) => this.setLayerVisibility(group, visible));
    this.dispatchEvent(new CustomEvent("ready", { detail: { ...this.data, basemapAvailable: this.basemapAvailable } }));
    return this.data;
  }

  destroy() {
    if (this.map) this.map.remove();
    this.map = null;
    this.locationMarker = null;
  }

  resize() {
    this.map?.resize();
  }

  setPosition(position, options = {}) {
    if (!this.map || !position) return;
    const coordinates = [position.longitude, position.latitude];
    if (!this.locationMarker) {
      const element = document.createElement("div");
      element.className = "apex-location-marker";
      element.setAttribute("aria-label", "Current location");
      this.locationMarker = new maplibregl.Marker({ element }).setLngLat(coordinates).addTo(this.map);
    } else {
      this.locationMarker.setLngLat(coordinates);
    }
    this.updateAccuracyCircle(position);
    if (options.center !== false) this.map.easeTo({ center: coordinates, zoom: Math.max(this.map.getZoom(), 13) });
  }

  centerMarket() {
    this.map?.easeTo({ center: this.market.center, zoom: this.market.zoom || 11 });
  }

  setPoiFilter(category) {
    this.poiCategory = category;
    const source = this.map?.getSource("apex-pois");
    if (source && this.data.pois) source.setData(filterPois(this.data.pois, category));
  }

  setLayerVisibility(layerGroup, visible) {
    this.layerVisibility[layerGroup] = visible;
    const ids = {
      zones: ["apex-zone-fill", "apex-zone-outline"],
      corridors: ["apex-corridor-lines", "apex-corridor-labels"],
      pois: ["apex-poi-clusters", "apex-poi-cluster-count", "apex-poi-points"],
      staging: ["apex-staging-points"],
      heatmap: ["apex-activity-heat"],
    }[layerGroup] || [];
    ids.forEach((id) => this.map?.getLayer(id) && this.map.setLayoutProperty(id, "visibility", visible ? "visible" : "none"));
  }

  refreshHistory(history) {
    if (!this.map?.isStyleLoaded()) return;
    addHeatmapLayer(this.map, buildHeatmapGeoJson(history));
  }

  async refreshStaging() {
    if (!this.market || !this.map) return;
    this.data.staging = await loadStagingPoints(this.market);
    const source = this.map.getSource("apex-staging");
    if (source) source.setData(this.data.staging);
    this.dispatchEvent(new CustomEvent("stagingchange", { detail: this.data.staging }));
  }

  emitSelection(type, feature) {
    this.dispatchEvent(new CustomEvent("selection", { detail: { type, feature } }));
  }

  updateAccuracyCircle(position) {
    const data = circleGeoJson(position.longitude, position.latitude, Math.max(10, position.accuracy || 10));
    const source = this.map.getSource("apex-location-accuracy");
    if (source) {
      source.setData(data);
      return;
    }
    this.map.addSource("apex-location-accuracy", { type: "geojson", data });
    const before = this.map.getLayer("apex-zone-outline") ? "apex-zone-outline" : undefined;
    this.map.addLayer({ id: "apex-location-accuracy-fill", type: "fill", source: "apex-location-accuracy", paint: { "fill-color": "#38bdf8", "fill-opacity": 0.12 } }, before);
    this.map.addLayer({ id: "apex-location-accuracy-line", type: "line", source: "apex-location-accuracy", paint: { "line-color": "#38bdf8", "line-width": 1 } }, before);
  }
}

async function createMapWithFallback(container, market) {
  const options = {
    container,
    style: market.mapStyle || "https://tiles.openfreemap.org/styles/liberty",
    center: market.center,
    zoom: market.zoom || 11,
    attributionControl: true,
    maxPitch: 60,
  };
  let map = new maplibregl.Map(options);
  try {
    await waitForMapLoad(map, 9000);
    return { map, basemapAvailable: true };
  } catch {
    map.remove();
    map = new maplibregl.Map({ ...options, style: OFFLINE_STYLE });
    await waitForMapLoad(map, 3000);
    return { map, basemapAvailable: false };
  }
}

function waitForMapLoad(map, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Map style timed out.")), timeoutMs);
    map.once("load", () => { clearTimeout(timer); resolve(); });
  });
}

function circleGeoJson(longitude, latitude, radiusMeters, steps = 48) {
  const coordinates = [];
  const earthRadius = 6378137;
  const latRad = latitude * Math.PI / 180;
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    coordinates.push([
      longitude + (dx / (earthRadius * Math.cos(latRad))) * 180 / Math.PI,
      latitude + (dy / earthRadius) * 180 / Math.PI,
    ]);
  }
  return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [coordinates] }, properties: {} }] };
}
