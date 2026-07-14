# Apex Dispatch MVP

A mobile-first, offline-capable decision-support app for the JF + BL Saturday delivery pilot in St. George, Utah.

## What this version does

- Scores DoorDash restaurant and Shop & Deliver offers.
- Calculates operational miles, vehicle cost, gross/net dollars per mile, and projected hourly rate.
- Applies different thresholds for core, conditional, and outer delivery zones.
- Generates explicit instructions for BL (dispatcher) and JF (driver).
- Tracks shift time, breaks, earnings, miles, vehicle cost, and estimated net profit.
- Maintains a restaurant intelligence database with A–D grades and expected wait times.
- Exports shift records as CSV.
- Stores data locally in the browser.
- Can be installed as a Progressive Web App when served over HTTPS or localhost.

## Important operating boundary

This app does not log into DoorDash, store DoorDash credentials, scrape private app data, or automatically accept/decline orders. JF remains responsible for operating the DoorDash account and making the final decision in the official app.

## Run locally

From this directory:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Opening `index.html` directly will run most functions, but service-worker installation requires localhost or HTTPS.

## Default scoring assumptions

- Vehicle cost: $0.50 per operational mile.
- Core zone: $1.75 gross per operational mile minimum.
- Conditional zone: $2.25 gross per operational mile minimum.
- Outer zone: $2.50 gross per operational mile minimum.
- Minimum payout: $7.
- Target projected gross hourly rate: $25.
- Strong projected gross hourly rate: $30.
- Maximum normal completion time: 30 minutes.

All thresholds are editable in Settings.

## Operating workflow

1. JF receives an offer in DoorDash.
2. BL enters the offer data into Apex Dispatch.
3. Apex Dispatch returns ACCEPT, MAYBE, or DECLINE with the supporting metrics.
4. JF verifies the real offer details and makes the final decision in DoorDash.
5. BL logs accepted/declined offers and records actual completion results.
6. The team reviews restaurant, zone, mileage, and hourly performance after the shift.

## Product roadmap

### V1.1 — User-selected screenshot parsing

Add image upload and on-device text extraction. This remains user-controlled and does not require DoorDash credentials.

### V1.2 — Route and map support

Accept user-entered pickup/drop-off locations and estimate return-to-zone mileage using a supported mapping provider.

### V2 — Multi-platform scoring

Add platform-specific workflows for Uber Eats, Spark, and other shopping/delivery services.

### V3 — Team-specific predictions

Use the operation's own historical records to predict restaurant wait time, destination recovery value, and expected net earnings.

## File structure

- `index.html` — app layout
- `styles.css` — mobile-first interface
- `app.js` — scoring, storage, KPI, and export logic
- `manifest.webmanifest` — installable app metadata
- `service-worker.js` — offline cache
- `icon.svg` — application icon
