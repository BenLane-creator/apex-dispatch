# Apex Routing Service Deployment

## Required architecture

```text
Source repository → static production host → apex.benlane.us
                                  |
                                  └→ protected edge worker → api.benlane.us → routing provider
```

## Worker secret

Set the routing-provider key as:

```bash
npx wrangler secret put ROUTES_API_KEY
```

The worker temporarily accepts the former secret name for migration, but `ROUTES_API_KEY` is the maintained name.

## Deploy the worker

```bash
cd worker
npm install
npm run check
npm run deploy
```

Attach `api.benlane.us` to the deployed worker.

## Allowed origins

The default allowlist includes:

- `https://apex.benlane.us`
- temporary `https://*.pages.dev` previews
- local development on ports 8080

Restrict preview origins after production cutover if previews are no longer required.

## Static build

Publish only:

```text
index.html
styles.css
app.js
manifest.webmanifest
service-worker.js
icon.svg
```

## Validation

```bash
curl https://api.benlane.us/health
curl -I https://apex.benlane.us
```

The health response should report `providerKeyPresent: true` and `providerStatus: "unchecked"`.
The health endpoint intentionally does not call Google because a provider probe would consume billable route usage. Validate the key with one real route analysis after deployment.

## Near-zero cost guardrails

Google bills Compute Routes per request and Compute Route Matrix per returned element. With four active recovery points, one uncached Apex analysis uses up to three Compute Routes requests and four matrix elements.

- Keep the worker's built-in ceiling at 12 application requests per IP per minute.
- Where the Google Cloud console exposes daily controls, cap Compute Routes at 120 requests per day and Compute Route Matrix at 150 elements per day. That supports roughly 35 full analyses per day and stays near 3,255 route requests and 4,340 matrix elements in a 31-day month.
- Keep the 60-second edge cache enabled so immediate refreshes do not repeat provider work.
- Configure budget alerts even when expected usage remains inside the monthly free allowance.

Google's current global price list provides 5,000 no-cost monthly events for each Routes Pro SKU. Recheck the [official Routes pricing](https://developers.google.com/maps/billing-and-pricing/pricing#routes) before changing quotas.
