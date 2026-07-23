const CACHE_NAME = "apex-dispatch-v3-bendesk-4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./operational-intelligence.css",
  "./modules/intelligence-app.js",
  "./modules/map.js",
  "./modules/location.js",
  "./modules/markets.js",
  "./modules/zones.js",
  "./modules/corridors.js",
  "./modules/pois.js",
  "./modules/staging.js",
  "./modules/intelligence.js",
  "./data/markets.json",
  "./data/st-george-zones.geojson",
  "./data/st-george-corridors.geojson",
  "./data/staging.geojson",
  "./data/pois.geojson",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cacheFreshAssets(cache, APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Route intelligence must come from the network. Do not persist API payloads,
  // addresses, or customer coordinates in the app-shell cache.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_OPERATIONAL_DATA" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls
    .map((value) => {
      try {
        return new URL(value, self.registration.scope);
      } catch {
        return null;
      }
    })
    .filter((url) => url && isOperationalAsset(url));
  event.waitUntil(cacheOperationalData(urls));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match("./index.html"));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request, { cache: "no-cache" })
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || network || new Response("Offline", { status: 503, statusText: "Offline" });
}

async function cacheFreshAssets(cache, urls) {
  await Promise.all(urls.map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    if (!response.ok) throw new Error(`Unable to cache ${url}`);
    await cache.put(url, response);
  }));
}

function isOperationalAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return false;
  const relativePath = url.pathname.slice(scopePath.length);
  return relativePath === "operational-intelligence.css"
    || relativePath.startsWith("modules/")
    || relativePath.startsWith("data/");
}

async function cacheOperationalData(urls) {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(urls.map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    if (!response.ok) throw new Error(`Unable to cache ${url.pathname}`);
    await cache.put(url, response);
  }));
}
