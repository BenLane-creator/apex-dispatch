# Apex Dispatch by BenDESK — Routes API Deployment

**Product:** Apex Dispatch Routes MVP v2 · **Brand:** BenDESK

This procedure deploys the Apex frontend at `https://apex.benlane.us` and the protected route gateway at `https://api.benlane.us`.

## 1. Google Cloud configuration

1. Open Google Cloud Console and create or select a project for Apex Dispatch.
2. Attach a billing account.
3. Open **APIs & Services → Library**.
4. Enable **Routes API**.
5. Open **APIs & Services → Credentials**.
6. Create an API key.
7. Under **API restrictions**, select **Restrict key**, then allow only **Routes API**.
8. Set a conservative daily quota and a billing budget alert before production use.

Do not put the key in the frontend or commit it to GitHub. Standard Cloudflare Workers do not provide a stable dedicated outbound IP for ordinary API-key IP restrictions, so use an API restriction and account-level quota/budget controls unless you provision a supported static-egress architecture.

## 2. Deploy the Cloudflare Worker

From the project root:

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GOOGLE_MAPS_API_KEY
npm run deploy
```

Paste the Google API key only when Wrangler prompts for the secret value.

The deployed Worker will initially receive a URL similar to:

```text
https://apex-routes.<your-subdomain>.workers.dev
```

Test it:

```bash
curl https://apex-routes.<your-subdomain>.workers.dev/health
```

Expected shape:

```json
{
  "ok": true,
  "service": "apex-routes",
  "routesApiConfigured": true
}
```

## 3. Attach `api.benlane.us`

In Cloudflare:

```text
Workers & Pages → apex-routes → Settings → Domains & Routes → Add → Custom Domain
```

Enter:

```text
api.benlane.us
```

Cloudflare should create and manage the associated DNS routing. Do not point this hostname to GitHub Pages.

Test:

```bash
curl https://api.benlane.us/health
```

## 4. Worker origin restrictions

The production origin list is in `worker/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://apex.benlane.us,http://localhost:8080,http://127.0.0.1:8080"
```

Add another frontend origin only when it is intentionally authorized. Redeploy after changing the file:

```bash
npm run deploy
```


## 5. Edge rate limiting

The Worker includes a best-effort per-isolate guard of 30 POST requests per client per minute. For stronger cost protection, add a Cloudflare rate-limiting rule for `api.benlane.us` covering `/route-plan` and `/route-matrix`, for example 30 requests per minute per IP with a short block period. Keep `/health` outside that rule.

## 6. Local Worker development

Copy the example environment file:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```text
GOOGLE_MAPS_API_KEY=replace_with_your_key
```

Then:

```bash
npm run dev
```

Wrangler normally serves locally at `http://localhost:8787`. In the Apex Settings tab, temporarily set the Worker base URL to that address.

Never commit `.dev.vars`; it is excluded by `.gitignore`.

## 7. Deploy the frontend to GitHub Pages

Copy the frontend files into the root of `BenLane-creator/apex-dispatch`, then commit and push:

```bash
git add index.html styles.css app.js manifest.webmanifest service-worker.js icon.svg CNAME README.md OPERATIONS_PLAN.md PRODUCT_PLAN.md ROUTES_DEPLOYMENT.md worker .gitignore
git commit -m "Add traffic-aware Routes API integration"
git push origin main
```

The `CNAME` file must contain exactly:

```text
apex.benlane.us
```

Cloudflare DNS for the frontend remains:

| Type | Name | Target | Proxy |
|---|---|---|---|
| CNAME | `apex` | `benlane-creator.github.io` | DNS only |

## 8. Configure Apex

Open:

```text
https://apex.benlane.us
```

Go to **Settings → Routes API settings** and enter:

```text
https://api.benlane.us
```

Then:

1. Select the traffic preference and model.
2. Set the default recovery/staging address.
3. Leave auto-refresh off for initial testing.
4. Click **Save route settings**.
5. Click **Test Worker**.

The header should report **Routes ready**.

## 9. End-to-end route test

In **Dispatch**:

1. Enter a starting address or tap **Use GPS**.
2. Enter pickup and customer addresses.
3. Enter a recovery address or choose **Use default staging**.
4. Click **Calculate traffic route**.

Confirm that Apex displays:

- Pickup, delivery, and recovery miles/minutes
- Traffic delay
- Pickup, delivery, and recovery ETA
- Alternatives for each leg
- A route geometry preview
- Updated offer miles and drive-time fields
- Working Google Maps navigation buttons

## 10. Direct API test

```bash
curl -sS https://api.benlane.us/route-plan \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://apex.benlane.us' \
  --data '{
    "origin":{"address":"Red Cliffs Mall, St. George, UT"},
    "pickup":{"address":"St. George Boulevard, St. George, UT"},
    "dropoff":{"address":"River Road, St. George, UT"},
    "recovery":{"address":"Red Cliffs Mall, St. George, UT"},
    "pickupWaitMinutes":8,
    "dropoffMinutes":3,
    "options":{
      "routingPreference":"TRAFFIC_AWARE_OPTIMAL",
      "trafficModel":"BEST_GUESS",
      "alternatives":true,
      "avoidTolls":false,
      "avoidHighways":false,
      "avoidFerries":true
    }
  }' | python3 -m json.tool
```

## 11. Troubleshooting

### `Routes API has not been used...` or API disabled

Enable Routes API in the same Google Cloud project that owns the key.

### `API key not valid` or permission denied

Re-enter the Worker secret:

```bash
npx wrangler secret put GOOGLE_MAPS_API_KEY
npm run deploy
```

Confirm the key is restricted to Routes API, not to browser HTTP referrers.

### Browser reports a CORS error

Confirm the browser origin is listed in `ALLOWED_ORIGINS`, then redeploy the Worker.

### GPS unavailable

Use HTTPS or localhost, allow location permission, and verify the browser/device location service is enabled.

### Route address cannot be resolved

Use a more complete street address including city and state. For recurring merchants, save exact addresses operationally rather than relying on a short business name.

### Alternatives absent

Google may not return a materially distinct alternative for every leg. The default route remains valid.

### Live incident names are not shown

Routes API supplies traffic-aware route calculations, delays, and alternatives. It is not a full incident-feed UI. Open Google Maps for active road guidance, incident visualization, closures, and continuous rerouting while driving.
