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

The health response should report `providerConfigured: true`.
