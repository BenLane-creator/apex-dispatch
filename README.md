# Apex Dispatch v3 by BenDESK

Apex Dispatch is a mobile-first, installable decision-support app for delivery operations. It converts three offer inputs—payout, pickup, and drop-off—into traffic-adjusted mileage, time, profitability, alerts, spoken guidance, and an exact recovery instruction.

## Driver workflow

1. Enter the payout, pickup, and drop-off.
2. Tap **Use current position**.
3. Tap **Analyze offer**.
4. Read or listen to the recommendation.
5. Use **Apex Voice** for pickup, delivery, or recovery guidance.
6. After delivery, follow the exact recovery address and parking instruction.

The driver never estimates mileage, drive time, traffic delay, return distance, or recovery time.

## Core capabilities

- Three-input offer analysis
- Traffic-aware distance, ETA, and alternate routes
- Automatic recovery-point comparison
- Exact recovery address, coordinates, and parking instruction
- English and Nicaraguan Spanish interface
- English and Spanish voice alerts
- Foreground spoken maneuver guidance
- Toll and ferry preferences in Settings
- Automatic shift timer and delivery logging
- Offline app shell and local browser storage
- CSV export
- Protected routing-service gateway

## Important guidance boundary

Spoken guidance uses the device location while Apex remains open. The driver must continue to observe road signs, traffic controls, closures, and safe-driving requirements. The driver retains final authority over every route and operating decision.

## Local run

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Deployment files

- `index.html` — streamlined bilingual interface
- `styles.css` — responsive mobile layout
- `app.js` — scoring, recovery selection, voice, shift tracking, and local storage
- `service-worker.js` — offline app-shell cache
- `manifest.webmanifest` — installable app metadata
- `worker/` — protected routing gateway
