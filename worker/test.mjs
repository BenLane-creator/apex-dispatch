import assert from "node:assert/strict";
import worker from "./src/index.js";

const allowedOrigin = "https://apex.benlane.us";
const env = {
  ROUTES_API_KEY: "test-key",
  ALLOWED_ORIGINS: allowedOrigin,
};
const context = {
  waitUntil(promise) {
    return promise;
  },
};
const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;

globalThis.caches = {
  default: {
    async match() {
      return null;
    },
    async put() {},
  },
};

try {
  await testHealthContract();
  await testProviderErrorExtraction();
  await testProviderClientError();
  await testOversizedStreamingBody();
  await testRateLimitCeiling();
  console.log("Validated worker health, provider errors, request-size limits, and cost guardrails.");
} finally {
  globalThis.fetch = originalFetch;
  globalThis.caches = originalCaches;
}

async function testHealthContract() {
  const response = await worker.fetch(new Request("https://api.benlane.us/health"), env, context);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.providerKeyPresent, true);
  assert.equal(body.providerStatus, "unchecked");
}

async function testProviderErrorExtraction() {
  globalThis.fetch = async () => new Response(JSON.stringify([{
    error: {
      code: 400,
      message: "API key not valid. Please pass a valid API key.",
      status: "INVALID_ARGUMENT",
      details: [{
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "API_KEY_INVALID",
        domain: "googleapis.com",
      }],
    },
  }]), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });

  const response = await worker.fetch(routeMatrixRequest(), env, context);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.code, "API_KEY_INVALID");
  assert.equal(body.error, "API key not valid. Please pass a valid API key.");
  assert.equal("details" in body, false);
}

async function testProviderClientError() {
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      code: 400,
      message: "One or more addresses could not be resolved.",
      status: "INVALID_ARGUMENT",
    },
  }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });

  const response = await worker.fetch(routeMatrixRequest(), env, context);
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.code, "INVALID_ARGUMENT");
  assert.equal(body.error, "One or more addresses could not be resolved.");
}

async function testOversizedStreamingBody() {
  const oversized = JSON.stringify({ payload: "x".repeat(33_000) });
  const request = new Request("https://api.benlane.us/route-matrix", {
    method: "POST",
    headers: {
      Origin: allowedOrigin,
      "Content-Type": "application/json",
    },
    body: oversized,
  });
  const response = await worker.fetch(request, env, context);
  const body = await response.json();
  assert.equal(response.status, 413);
  assert.equal(body.code, "BODY_TOO_LARGE");
}

async function testRateLimitCeiling() {
  globalThis.fetch = async () => new Response("[]", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const response = await worker.fetch(routeMatrixRequest("192.0.2.10"), env, context);
    assert.equal(response.status, 200, `Rate limiter rejected request ${attempt} too early.`);
  }
  const blocked = await worker.fetch(routeMatrixRequest("192.0.2.10"), env, context);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After") !== null, true);
}

function routeMatrixRequest(ip) {
  return new Request("https://api.benlane.us/route-matrix", {
    method: "POST",
    headers: {
      Origin: allowedOrigin,
      "Content-Type": "application/json",
      ...(ip ? { "CF-Connecting-IP": ip } : {}),
    },
    body: JSON.stringify({
      origin: { address: "50 S Main St, St. George, UT 84770" },
      destinations: [{
        point: { address: "1770 Red Cliffs Dr, St. George, UT 84790" },
        label: "Red Cliffs Core East",
      }],
      options: {
        routingPreference: "TRAFFIC_AWARE_OPTIMAL",
        trafficModel: "BEST_GUESS",
      },
    }),
  });
}
