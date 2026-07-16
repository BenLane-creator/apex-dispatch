# Apex Dispatch Routes MVP v2 — Implementation Summary

**A BenDESK product**

## Delivered

- Traffic-aware Google Routes API integration through a Cloudflare Worker
- Three-leg operational routing: origin → pickup → customer → recovery
- Alternative-route comparison for each leg
- Traffic delay, mileage, duration, and ETA calculations
- Recovery destination route matrix
- Browser GPS with optional movement/time refresh
- Google Maps navigation handoff
- Route geometry preview
- Route-derived offer scoring and route-aware instructions
- CSV route metrics
- Protected API key, CORS allowlist, validation, reduced field masks, short cache, and request throttling guard
- Updated PWA cache and manifest
- GitHub Pages `CNAME` for `apex.benlane.us`
- Worker and frontend deployment documentation

## Validation completed

- `node --check app.js`
- `node --check worker/src/index.js`
- HTML/JavaScript ID-reference consistency check: no missing or duplicate IDs
- Manifest and package JSON parsing
- Static HTTP checks for all app-shell assets
- Mocked Worker integration test for route planning, alternatives, traffic totals, and matrix sorting

## External configuration still required

The implementation cannot call Google until the owner completes these external account actions:

1. Enable Google Routes API and billing.
2. Create a Routes-API-restricted key.
3. Store it as the Cloudflare Worker secret `GOOGLE_MAPS_API_KEY`.
4. Deploy the Worker and attach `api.benlane.us`.
5. Push the frontend files to the GitHub Pages repository.

See `ROUTES_DEPLOYMENT.md` for exact commands.
