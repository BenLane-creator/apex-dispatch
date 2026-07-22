import { loadZones, addZoneLayers } from "./zones.js";
import { loadCorridors, addCorridorLayers } from "./corridors.js";
import { loadPois, addPoiLayers, setPoiCategoryFilter } from "./pois.js";
import { loadStagingPoints, addStagingLayers } from "./staging.js";
import { addHeatmapLayer, buildHeatmapGeoJson } from "./intelligence.js";

export class OperationalMap extends EventTarget {
  constructor(containerId) {
    super();
    this.containerId = containerId;
    this.map = null;
    this.market = null;
    this.data = {};
    this.locationMarker = null;
    this.accuracySourceReady = false;
  }

  async initialize(market, history = []) {
    if (!window.maplibregl) throw new Error("MapLibre failed to load.");
    this.market = market;
    if (this.map) this.map.remove();

    this.map = new maplibregl.Map({
      container: this.containerId,
      style: market.mapStyle || "https://demotiles.maplibre.org/style.json",
      center: market.center,
      zoom: market.zoom || 11,
      attributionControl: true,
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    this.map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

    await once(this.map, "load");
    const [zones, corridors, pois, staging] = await Promise.all([
      loadZones(market), loadCorridors(market), loadPois(market), loadStagingPoints(market),
    ]);
    this.data = { zones, corridors, pois, staging };
    addZoneLayers(this.map, zones);
    addCorridorLayers(this.map, corridors, (feature) => this.emitSelection("corridor", feature));
    addPoisLayersSafely(this.map, pois, (feature) => this.emitSelection("poi", feature));
    addStagingLayers(this.map, staging, (feature) => this.emitSelection("staging", feature));
    addHeatmapLayer(this.map, buildHeatmapGeoJson(history));
    this.dispatchEvent(new CustomEvent("ready", { detail: this.data }));
    return this.data;
  }

  setPosition(position, options = {}) {
    if (!this.map || !position) return;
    const coordinates = [position.longitude, position.latitude];
    if (!this.locationMarker) {
      const element = document.createElement("div");
      element.className = "apex-location-marker";
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
    setPoiCategoryFilter(this.map, category);
  }

  setLayerVisibility(layerGroup, visible) {
    const ids = {
      zones: ["apex-zone-fill", "apex-zone-outline"],
      corridors: ["apex-corridor-lines"],
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

  emitSelection(type, feature) {
    this.dispatchEvent(new CustomEvent("selection", { detail: { type, feature } }));
  }

  updateAccuracyCircle(position) {
    const data = circleGeoJson(position.longitude, position.latitude, Math.max(10, position.accuracy || 10));
    const source = this.map.getSource("apex-location-accuracy");
    if (source) source.setData(data);
    else {
      this.map.addSource("apex-location-accuracy", { type: "geojson", data });
      this.map.addLayer({ id: "apex-location-accuracy-fill", type: "fill", source: "apex-location-accuracy", paint: { "fill-color": "#38bdf8", "fill-opacity": 0.12 } }, "apex-zone-outline");
      this.map.addLayer({ id: "apex-location-accuracy-line", type: "line", source: "apex-location-accuracy", paint: { "line-color": "#38bdf8", "line-width": 1 } }, "apex-zone-outline");
    }
  }
}

function addPoisLayersSafely(map, pois, onSelect) {
  addPoiLayers(map, pois, onSelect);
}

function once(target, eventName) {
  return new Promise((resolve) => target.once(eventName, resolve));
}

function circleGeoJson(longitude, latitude, radiusMeters, steps = 48) {
  const coordinates = [];
  const earthRadius = 6378137;
  const latRad = latitude * Math.PI / 180;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    coordinates.push([
      longitude + (dx / (earthRadius * Math.cos(latRad))) * 180 / Math.PI,
      latitude + (dy / earthRadius) * 180 / Math.PI,
    ]);
  }
  return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [coordinates] }, properties: {} }] };
}
