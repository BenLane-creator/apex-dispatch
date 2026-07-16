# Apex Dispatch Routes MVP v2 — by BenDESK

Apex Dispatch is a BenDESK mobile-first decision-support PWA for evaluating delivery offers, calculating traffic-aware operational mileage and time, selecting recovery corridors, handing active navigation to Google Maps, and tracking shift performance.

## Product identity

- Product: **Apex Dispatch**
- Version: **Routes MVP v2**
- Brand: **by BenDESK**
- App: `https://apex.benlane.us`
- Routes API: `https://api.benlane.us`
- Contact: `BenDESK@benlane.us`

The application remains separate from DoorDash. It does not request DoorDash credentials, scrape the Dasher app, or accept offers automatically. JF keeps control of the platform, vehicle, navigation, and final driving decisions.

## Implemented route capabilities

- Browser GPS origin with explicit permission.
- Address-based origin, pickup, customer, and recovery/staging locations.
- Three-leg operational plan:
  1. Current position → pickup
  2. Pickup → customer
  3. Customer → recovery/staging point
- Traffic-aware optimal or standard traffic-aware routing.
- Best-guess, optimistic, or pessimistic traffic model.
- Default route plus available alternative routes for every leg.
- Avoid-tolls, avoid-highways, and avoid-ferries preferences.
- Total operational miles, traffic-adjusted driving time, static time, traffic delay, pickup ETA, delivery ETA, and recovery ETA.
- Automatic transfer of calculated miles and minutes into the offer-scoring engine.
- Revenue metrics based on route-derived operational miles and time.
- Route geometry preview without loading a full embedded map SDK.
- Google Maps handoff buttons for pickup, customer, recovery, and the complete route.
- Recovery matrix comparing up to 10 destinations by traffic-aware time, mileage, delay, and ETA.
- Optional GPS movement/time-based route refresh.
- Route freshness and stale-data warnings.
- CSV export containing route metrics and ETAs.
- Offline app shell; route calculations remain online-only.

## Architecture

```text
Apex Dispatch PWA (GitHub Pages)
        |
        | HTTPS JSON requests
        v
Cloudflare Worker (api.benlane.us)
        |
        | server-side API key
        v
Google Routes API

Navigate buttons → Google Maps app / web navigation
```

The Google API key is never placed in `app.js`. It is stored as a Cloudflare Worker secret.

## Project structure

```text
index.html                 PWA interface and route controls
styles.css                Mobile-first application styles
app.js                    Offer scoring, GPS, route UI, navigation, matrix, storage, CSV
manifest.webmanifest      Installable PWA metadata
service-worker.js         Offline app-shell cache; API traffic is never cached
icon.svg                  App icon
CNAME                     GitHub Pages custom domain: apex.benlane.us
worker/
  src/index.js            Protected Routes API gateway
  wrangler.toml           Cloudflare Worker configuration
  package.json            Wrangler scripts
  .dev.vars.example       Local secret template
OPERATIONS_PLAN.md        Operating procedures
PRODUCT_PLAN.md           Product scope and roadmap
ROUTES_DEPLOYMENT.md      Setup and deployment procedure
```

## Local frontend test

```bash
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080
```

GPS works on `localhost`. On a phone or production hostname it requires valid HTTPS.

## Production setup

Follow [`ROUTES_DEPLOYMENT.md`](ROUTES_DEPLOYMENT.md). The required sequence is:

1. Enable billing and the **Routes API** in Google Cloud.
2. Create an API key restricted to the Routes API.
3. Store the key in Cloudflare as `GOOGLE_MAPS_API_KEY`.
4. Deploy the Worker.
5. Attach `api.benlane.us` to the Worker or use the generated `workers.dev` URL.
6. Deploy the frontend files to the `BenLane-creator/apex-dispatch` repository.
7. In Apex Settings, save the Worker base URL and test it.

## Worker endpoints

### `GET /health`

Returns Worker status without exposing the API key.

### `POST /route-plan`

Calculates the pickup, delivery, and optional recovery legs.

Example request:

```json
{
  "origin": { "address": "Red Cliffs Mall, St. George, UT" },
  "pickup": { "address": "123 Main St, St. George, UT" },
  "dropoff": { "address": "456 River Rd, St. George, UT" },
  "recovery": { "address": "Red Cliffs Mall, St. George, UT" },
  "pickupWaitMinutes": 8,
  "dropoffMinutes": 3,
  "options": {
    "routingPreference": "TRAFFIC_AWARE_OPTIMAL",
    "trafficModel": "BEST_GUESS",
    "alternatives": true,
    "avoidTolls": false,
    "avoidHighways": false,
    "avoidFerries": true
  }
}
```

### `POST /route-matrix`

Compares one origin with up to 10 possible recovery destinations.

## Privacy and operational boundaries

- Customer addresses and GPS coordinates are sent only to the configured Worker and Google Routes API for the requested calculation.
- The service worker does not cache API requests or route payloads.
- Route addresses are not written into the shift log. Logged route snapshots contain calculated mileage, time, traffic delay, and ETAs.
- The Worker limits request size, validates coordinates, restricts browser origins, applies a best-effort 30-request-per-minute per-client guard, requests only required Google response fields, and caches identical calculations briefly to reduce duplicate API calls.
- Avoidance options are route preferences, not guarantees.
- Google Maps remains responsible for active turn-by-turn navigation and live rerouting while driving.

## Cost controls

- Restrict the API key to **Routes API** only.
- Set Google Maps Platform quotas and budget alerts.
- Keep auto-refresh disabled until production behavior and cost are observed.
- The default route refresh threshold is three minutes and 0.4 miles of movement.
- The Worker caches identical requests for 60 seconds and includes a best-effort per-isolate request limit. Add a Cloudflare edge rate-limiting rule for a globally enforced ceiling.
- Traffic-on-polyline detail is disabled by default because it can increase billable computation.
