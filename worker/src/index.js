const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const MAX_BODY_BYTES = 32_000;
const CACHE_TTL_SECONDS = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateBuckets = new Map();

const ROUTE_FIELD_MASK = [
  "routes.routeLabels",
  "routes.distanceMeters",
  "routes.duration",
  "routes.staticDuration",
  "routes.description",
  "routes.warnings",
  "routes.polyline.encodedPolyline",
  "routes.viewport",
  "routes.legs.startLocation",
  "routes.legs.endLocation",
  "routes.legs.travelAdvisory.speedReadingIntervals",
  "geocodingResults",
].join(",");

const MATRIX_FIELD_MASK = [
  "originIndex",
  "destinationIndex",
  "status",
  "condition",
  "distanceMeters",
  "duration",
  "staticDuration",
].join(",");

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "apex-routes",
        routesApiConfigured: Boolean(env.GOOGLE_MAPS_API_KEY),
        timestamp: new Date().toISOString(),
      }, 200, cors);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, cors);
    }

    if (!isAllowedOrigin(origin, env)) {
      return jsonResponse({ error: "Origin not allowed." }, 403, cors);
    }

    const rateLimit = consumeRateLimit(request);
    if (!rateLimit.allowed) {
      return jsonResponse(
        { error: "Route request limit reached. Retry shortly." },
        429,
        cors,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }

    if (!env.GOOGLE_MAPS_API_KEY) {
      return jsonResponse({ error: "GOOGLE_MAPS_API_KEY is not configured." }, 500, cors);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Request body is too large." }, 413, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON request body." }, 400, cors);
    }

    try {
      if (url.pathname === "/route-plan") {
        const payload = validateRoutePlanRequest(body);
        const cacheKey = await createCacheKey("route-plan", payload);
        const cached = await readCache(cacheKey);
        if (cached) return withCors(cached, cors, "HIT");

        const result = await buildRoutePlan(payload, env);
        const response = jsonResponse(result, 200, cors, { "X-Apex-Cache": "MISS" });
        ctx.waitUntil(writeCache(cacheKey, response.clone()));
        return response;
      }

      if (url.pathname === "/route-matrix") {
        const payload = validateMatrixRequest(body);
        const cacheKey = await createCacheKey("route-matrix", payload);
        const cached = await readCache(cacheKey);
        if (cached) return withCors(cached, cors, "HIT");

        const result = await buildRouteMatrix(payload, env);
        const response = jsonResponse(result, 200, cors, { "X-Apex-Cache": "MISS" });
        ctx.waitUntil(writeCache(cacheKey, response.clone()));
        return response;
      }

      return jsonResponse({ error: "Unknown endpoint." }, 404, cors);
    } catch (error) {
      const status = Number(error?.status || 500);
      return jsonResponse({
        error: error?.message || "Route request failed.",
        details: error?.details || undefined,
      }, status, cors);
    }
  },
};

function validateRoutePlanRequest(body) {
  const origin = normalizePoint(body.origin, "origin");
  const pickup = normalizePoint(body.pickup, "pickup");
  const dropoff = normalizePoint(body.dropoff, "dropoff");
  const recovery = body.recovery ? normalizePoint(body.recovery, "recovery") : null;
  const pickupWaitMinutes = boundedNumber(body.pickupWaitMinutes, 0, 180, 8);
  const dropoffMinutes = boundedNumber(body.dropoffMinutes, 0, 60, 3);
  const options = normalizeOptions(body.options);

  return {
    origin,
    pickup,
    dropoff,
    recovery,
    pickupWaitMinutes,
    dropoffMinutes,
    options,
  };
}

function validateMatrixRequest(body) {
  const origin = normalizePoint(body.origin, "origin");
  if (!Array.isArray(body.destinations) || body.destinations.length < 1) {
    throw httpError(400, "At least one matrix destination is required.");
  }
  if (body.destinations.length > 10) {
    throw httpError(400, "Apex limits matrix comparisons to 10 destinations per request.");
  }

  const destinations = body.destinations.map((item, index) => {
    const point = normalizePoint(item.point || item, `destinations[${index}]`);
    const label = cleanText(item.label || point.address || `Destination ${index + 1}`, 160);
    return { point, label };
  });

  return { origin, destinations, options: normalizeOptions(body.options) };
}

function normalizePoint(value, label) {
  if (!value || typeof value !== "object") {
    throw httpError(400, `${label} is required.`);
  }

  if (typeof value.address === "string" && value.address.trim()) {
    return { address: cleanText(value.address, 300) };
  }

  const latitude = Number(value.latitude ?? value.lat);
  const longitude = Number(value.longitude ?? value.lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw httpError(400, `${label}.latitude must be between -90 and 90.`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw httpError(400, `${label}.longitude must be between -180 and 180.`);
  }

  return { latitude, longitude };
}

function normalizeOptions(options = {}) {
  const routingPreference = ["TRAFFIC_AWARE", "TRAFFIC_AWARE_OPTIMAL"].includes(options.routingPreference)
    ? options.routingPreference
    : "TRAFFIC_AWARE_OPTIMAL";
  const trafficModel = ["BEST_GUESS", "OPTIMISTIC", "PESSIMISTIC"].includes(options.trafficModel)
    ? options.trafficModel
    : "BEST_GUESS";

  return {
    routingPreference,
    trafficModel,
    alternatives: options.alternatives !== false,
    avoidTolls: Boolean(options.avoidTolls),
    avoidHighways: Boolean(options.avoidHighways),
    avoidFerries: options.avoidFerries !== false,
    includeTrafficPolyline: Boolean(options.includeTrafficPolyline),
  };
}

async function buildRoutePlan(payload, env) {
  const computedAtMs = Date.now();
  // Google requires traffic departure times to be current or future. Add a small
  // buffer so network latency does not make the request timestamp appear stale.
  const toPickupDeparture = computedAtMs + 30_000;
  const toPickup = await computeLeg(payload.origin, payload.pickup, toPickupDeparture, payload.options, env);

  const toPickupDefault = toPickup.routes[0];
  const pickupDeparture = toPickupDeparture
    + toPickupDefault.durationSeconds * 1000
    + payload.pickupWaitMinutes * 60_000;

  const toDropoff = await computeLeg(payload.pickup, payload.dropoff, pickupDeparture, payload.options, env);
  const toDropoffDefault = toDropoff.routes[0];

  let toRecovery = null;
  if (payload.recovery) {
    const recoveryDeparture = pickupDeparture
      + toDropoffDefault.durationSeconds * 1000
      + payload.dropoffMinutes * 60_000;
    toRecovery = await computeLeg(payload.dropoff, payload.recovery, recoveryDeparture, payload.options, env);
  }

  const defaultLegs = [toPickup.routes[0], toDropoff.routes[0], toRecovery?.routes?.[0]].filter(Boolean);
  const totalDistanceMeters = defaultLegs.reduce((sum, route) => sum + route.distanceMeters, 0);
  const totalDurationSeconds = defaultLegs.reduce((sum, route) => sum + route.durationSeconds, 0);
  const totalStaticDurationSeconds = defaultLegs.reduce((sum, route) => sum + route.staticDurationSeconds, 0);
  const trafficDelaySeconds = Math.max(0, totalDurationSeconds - totalStaticDurationSeconds);

  return {
    computedAt: new Date(computedAtMs).toISOString(),
    schedule: {
      pickupWaitMinutes: payload.pickupWaitMinutes,
      dropoffMinutes: payload.dropoffMinutes,
    },
    options: payload.options,
    legs: {
      toPickup,
      toDropoff,
      toRecovery,
    },
    totals: {
      distanceMeters: totalDistanceMeters,
      miles: metersToMiles(totalDistanceMeters),
      durationSeconds: totalDurationSeconds,
      minutes: secondsToMinutes(totalDurationSeconds),
      staticDurationSeconds: totalStaticDurationSeconds,
      staticMinutes: secondsToMinutes(totalStaticDurationSeconds),
      trafficDelaySeconds,
      trafficDelayMinutes: secondsToMinutes(trafficDelaySeconds),
      pickupEta: toPickup.routes[0].arrivalTime,
      deliveryEta: toDropoff.routes[0].arrivalTime,
      recoveryEta: toRecovery?.routes?.[0]?.arrivalTime || null,
    },
  };
}

async function computeLeg(origin, destination, departureTimeMs, options, env) {
  const requestBody = {
    origin: toGoogleWaypoint(origin),
    destination: toGoogleWaypoint(destination),
    travelMode: "DRIVE",
    routingPreference: options.routingPreference,
    departureTime: new Date(departureTimeMs).toISOString(),
    computeAlternativeRoutes: options.alternatives,
    routeModifiers: {
      avoidTolls: options.avoidTolls,
      avoidHighways: options.avoidHighways,
      avoidFerries: options.avoidFerries,
    },
    polylineQuality: "OVERVIEW",
    polylineEncoding: "ENCODED_POLYLINE",
    languageCode: "en-US",
    regionCode: "us",
    units: "IMPERIAL",
  };

  if (options.routingPreference === "TRAFFIC_AWARE_OPTIMAL") {
    requestBody.trafficModel = options.trafficModel;
  }
  if (options.includeTrafficPolyline) {
    requestBody.extraComputations = ["TRAFFIC_ON_POLYLINE"];
  }

  const apiResponse = await callGoogle(ROUTES_URL, requestBody, ROUTE_FIELD_MASK, env.GOOGLE_MAPS_API_KEY);
  const routes = Array.isArray(apiResponse.routes) ? apiResponse.routes : [];
  if (!routes.length) {
    throw httpError(502, "Google Routes API returned no route for one of the legs.", apiResponse);
  }

  return {
    departureTime: new Date(departureTimeMs).toISOString(),
    geocodingResults: apiResponse.geocodingResults || null,
    routes: routes.map((route, index) => normalizeRoute(route, index, departureTimeMs)),
  };
}

function normalizeRoute(route, index, departureTimeMs) {
  const durationSeconds = parseDurationSeconds(route.duration);
  const staticDurationSeconds = parseDurationSeconds(route.staticDuration || route.duration);
  const distanceMeters = Number(route.distanceMeters || 0);
  const speedIntervals = route.legs?.flatMap((leg) => leg.travelAdvisory?.speedReadingIntervals || []) || [];
  const congestion = summarizeCongestion(speedIntervals);

  return {
    index,
    isDefault: index === 0 || route.routeLabels?.includes("DEFAULT_ROUTE"),
    routeLabels: route.routeLabels || [],
    description: route.description || (index === 0 ? "Best route" : `Alternative ${index}`),
    warnings: route.warnings || [],
    distanceMeters,
    miles: metersToMiles(distanceMeters),
    durationSeconds,
    minutes: secondsToMinutes(durationSeconds),
    staticDurationSeconds,
    staticMinutes: secondsToMinutes(staticDurationSeconds),
    trafficDelaySeconds: Math.max(0, durationSeconds - staticDurationSeconds),
    trafficDelayMinutes: secondsToMinutes(Math.max(0, durationSeconds - staticDurationSeconds)),
    departureTime: new Date(departureTimeMs).toISOString(),
    arrivalTime: new Date(departureTimeMs + durationSeconds * 1000).toISOString(),
    encodedPolyline: route.polyline?.encodedPolyline || null,
    viewport: route.viewport || null,
    startLocation: route.legs?.[0]?.startLocation?.latLng || null,
    endLocation: route.legs?.at(-1)?.endLocation?.latLng || null,
    congestion,
  };
}

async function buildRouteMatrix(payload, env) {
  const requestBody = {
    origins: [{
      waypoint: toGoogleWaypoint(payload.origin),
      routeModifiers: {
        avoidTolls: payload.options.avoidTolls,
        avoidHighways: payload.options.avoidHighways,
        avoidFerries: payload.options.avoidFerries,
      },
    }],
    destinations: payload.destinations.map((item) => ({ waypoint: toGoogleWaypoint(item.point) })),
    travelMode: "DRIVE",
    routingPreference: payload.options.routingPreference,
    departureTime: new Date(Date.now() + 30_000).toISOString(),
    languageCode: "en-US",
    regionCode: "us",
    units: "IMPERIAL",
  };

  if (payload.options.routingPreference === "TRAFFIC_AWARE_OPTIMAL") {
    requestBody.trafficModel = payload.options.trafficModel;
  }

  const apiResponse = await callGoogle(MATRIX_URL, requestBody, MATRIX_FIELD_MASK, env.GOOGLE_MAPS_API_KEY);
  const elements = Array.isArray(apiResponse) ? apiResponse : [];
  const rows = elements.map((element) => {
    const destination = payload.destinations[element.destinationIndex];
    const durationSeconds = parseDurationSeconds(element.duration);
    const staticDurationSeconds = parseDurationSeconds(element.staticDuration || element.duration);
    const distanceMeters = Number(element.distanceMeters || 0);
    return {
      destinationIndex: element.destinationIndex,
      label: destination?.label || `Destination ${element.destinationIndex + 1}`,
      point: destination?.point || null,
      condition: element.condition || "UNKNOWN",
      status: element.status || {},
      distanceMeters,
      miles: metersToMiles(distanceMeters),
      durationSeconds,
      minutes: secondsToMinutes(durationSeconds),
      staticDurationSeconds,
      trafficDelaySeconds: Math.max(0, durationSeconds - staticDurationSeconds),
      trafficDelayMinutes: secondsToMinutes(Math.max(0, durationSeconds - staticDurationSeconds)),
      arrivalTime: durationSeconds > 0 ? new Date(Date.now() + durationSeconds * 1000).toISOString() : null,
    };
  }).sort((a, b) => {
    if (a.condition !== "ROUTE_EXISTS" && b.condition === "ROUTE_EXISTS") return 1;
    if (a.condition === "ROUTE_EXISTS" && b.condition !== "ROUTE_EXISTS") return -1;
    return a.durationSeconds - b.durationSeconds;
  });

  return {
    computedAt: new Date().toISOString(),
    origin: payload.origin,
    options: payload.options,
    results: rows,
  };
}

async function callGoogle(url, body, fieldMask, apiKey) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });

  let payload;
  const text = await response.text();
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Google Routes API error ${response.status}.`;
    throw httpError(response.status >= 500 ? 502 : 400, message, payload);
  }

  return payload;
}

function toGoogleWaypoint(point) {
  if (point.address) return { address: point.address };
  return {
    location: {
      latLng: {
        latitude: point.latitude,
        longitude: point.longitude,
      },
    },
  };
}

function summarizeCongestion(intervals) {
  const counts = { NORMAL: 0, SLOW: 0, TRAFFIC_JAM: 0, UNKNOWN: 0 };
  for (const interval of intervals) {
    const speed = interval.speed || "UNKNOWN";
    counts[speed] = (counts[speed] || 0) + 1;
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return {
    available: total > 0,
    intervalCount: total,
    counts,
    dominant: total > 0
      ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
      : "UNKNOWN",
  };
}

function parseDurationSeconds(value) {
  if (typeof value !== "string") return 0;
  const number = Number(value.replace(/s$/, ""));
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function metersToMiles(meters) {
  return Number((Number(meters || 0) / 1609.344).toFixed(2));
}

function secondsToMinutes(seconds) {
  return Number((Number(seconds || 0) / 60).toFixed(1));
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, maxLength);
}

function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "https://apex.benlane.us,http://localhost:8080,http://127.0.0.1:8080")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  return allowedOrigins(env).includes(origin);
}

function consumeRateLimit(request) {
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const colo = request.cf?.colo || "local";
  const key = `${colo}:${ip}`;
  let bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
  }

  bucket.count += 1;
  rateBuckets.set(key, bucket);

  // Opportunistic cleanup keeps the per-isolate map bounded. This is a
  // best-effort application guard; add a Cloudflare edge rate-limiting rule
  // for a globally enforced production ceiling.
  if (rateBuckets.size > 500) {
    for (const [entryKey, entry] of rateBuckets) {
      if (now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) rateBuckets.delete(entryKey);
    }
  }

  const allowed = bucket.count <= RATE_LIMIT_MAX_REQUESTS;
  const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - bucket.startedAt)) / 1000));
  return { allowed, retryAfterSeconds };
}

function corsHeaders(origin, env) {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  });
  if (origin && isAllowedOrigin(origin, env)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function jsonResponse(value, status, cors, extra = {}) {
  const headers = new Headers(cors);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(JSON.stringify(value), { status, headers });
}

function withCors(response, cors, cacheStatus) {
  const headers = new Headers(response.headers);
  for (const [key, value] of cors.entries()) headers.set(key, value);
  headers.set("X-Apex-Cache", cacheStatus);
  return new Response(response.body, { status: response.status, headers });
}

async function createCacheKey(endpoint, payload) {
  const bytes = new TextEncoder().encode(JSON.stringify({ endpoint, payload }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Request(`https://apex-route-cache.invalid/${endpoint}/${hash}`, { method: "GET" });
}

async function readCache(key) {
  try {
    return await caches.default.match(key);
  } catch {
    return null;
  }
}

async function writeCache(key, response) {
  try {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", `public, max-age=${CACHE_TTL_SECONDS}`);
    await caches.default.put(key, new Response(response.body, { status: response.status, headers }));
  } catch {
    // Cache failures must not fail routing.
  }
}
