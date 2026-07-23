# Operational Intelligence subsystem

Apex Dispatch now treats Local Operating Intelligence as a first-class ES-module subsystem.

## Modules

- `map.js`: MapLibre lifecycle, layers, offline fallback, and map state.
- `location.js`: explicit one-time location and optional foreground tracking.
- `markets.js`: market registry, import/export, active market, and scoring profiles.
- `zones.js`: operating-zone loading, rendering, and point-in-polygon lookup.
- `corridors.js`: commercial-corridor rendering and selection.
- `pois.js`: curated merchant POIs, clustering, and filtering.
- `staging.js`: bundled and locally managed staging points.
- `intelligence.js`: operational history, heatmaps, corridor metrics, and recovery ranking.
- `intelligence-app.js`: UI orchestration and integration with the existing dispatch DOM contract.

## Privacy boundary

The subsystem does not persist continuous GPS traces. Current location remains in memory unless the user explicitly saves a staging point. Heatmap coordinates are coarsened to approximately 300 meters. Customer addresses are not written to operational-history records by the map subsystem.

## Cloudflare Pages build

The current Cloudflare Pages command copies only root files. The repository therefore keeps generated `dist/modules`, `dist/data`, and `dist/operational-intelligence.css` assets so the feature branch deploys under the existing configuration.

The preferred Pages build command is:

```bash
npm run build
```

Build output directory remains `dist`.

## Basemap

MapLibre GL JS 5.24.0 is loaded from unpkg. OpenFreeMap Liberty is the default basemap. Local Apex overlays are cached for offline use; broad third-party basemap tile caching is intentionally excluded.
