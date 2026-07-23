import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const deployedFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "service-worker.js",
  "icon.svg",
  "operational-intelligence.css",
];
const requiredIntelligenceIds = [
  "operationalMap",
  "marketSelect",
  "poiFilter",
  "locateIntelligence",
  "centerMarket",
  "applyMarketScoring",
  "syncOfflineData",
  "currentAreaValue",
  "nearestStagingValue",
  "recoveryRecommendationValue",
  "visibleIntelligenceValue",
  "historyCountValue",
  "marketTimezoneValue",
  "stagingManagerList",
  "intelligenceStatus",
];

const moduleFiles = await listFiles(join(root, "modules"), (file) => file.endsWith(".js"));
const syntaxFiles = [
  join(root, "app.js"),
  join(root, "service-worker.js"),
  join(root, "worker", "src", "index.js"),
  join(root, "scripts", "build.mjs"),
  ...moduleFiles,
];

for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, `JavaScript syntax failed for ${relative(root, file)}:\n${result.stderr}`);
}

const html = await readFile(join(root, "index.html"), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "index.html contains duplicate IDs.");
for (const id of requiredIntelligenceIds) {
  assert(ids.includes(id), `index.html is missing #${id}.`);
}
assert.match(html, /maplibre-gl@5\.24\.0/, "MapLibre must remain pinned to version 5.24.0.");
assert.match(html, /type="module"\s+src="modules\/intelligence-app\.js"/, "The intelligence application module is not loaded.");
assert.match(html, /Driver authority remains final\./, "The decision-support safety statement is missing.");

for (const reference of localHtmlReferences(html)) {
  await assertReadable(join(root, reference), `HTML asset ${reference} does not exist.`);
}

for (const file of moduleFiles) {
  const source = await readFile(file, "utf8");
  for (const specifier of [...source.matchAll(/from\s+["'](\.[^"']+)["']/g)].map((match) => match[1])) {
    await assertReadable(join(dirname(file), specifier), `${relative(root, file)} imports missing ${specifier}.`);
  }
}

const marketsPayload = await readJson("data/markets.json");
assert.equal(marketsPayload.schemaVersion, 1, "Unsupported market schema version.");
assert(Array.isArray(marketsPayload.markets) && marketsPayload.markets.length > 0, "At least one market is required.");
for (const market of marketsPayload.markets) {
  assert(typeof market.id === "string" && market.id, "Every market requires an ID.");
  assert(typeof market.timezone === "string" && market.timezone, `${market.id} requires a timezone.`);
  assert(Array.isArray(market.center) && market.center.length === 2, `${market.id} requires a map center.`);
  for (const layer of ["zones", "corridors", "staging", "pois"]) {
    const reference = market.layers?.[layer];
    assert(typeof reference === "string" && reference.startsWith("./data/"), `${market.id} has an unsafe ${layer} layer reference.`);
    await assertReadable(join(root, reference), `${market.id} references missing ${reference}.`);
  }
}

for (const file of [
  "data/st-george-zones.geojson",
  "data/st-george-corridors.geojson",
  "data/staging.geojson",
  "data/pois.geojson",
]) {
  validateGeoJson(await readJson(file), file);
}

const serviceWorker = await readFile(join(root, "service-worker.js"), "utf8");
for (const asset of [
  "./operational-intelligence.css",
  "./modules/intelligence-app.js",
  "./modules/map.js",
  "./data/markets.json",
]) {
  assert(serviceWorker.includes(`"${asset}"`), `The service worker app shell is missing ${asset}.`);
}
assert(serviceWorker.includes("CACHE_OPERATIONAL_DATA"), "The service worker cannot synchronize operational overlays.");

const intelligenceSource = await readFile(join(root, "modules", "intelligence-app.js"), "utf8");
assert(!/DoorDash|delivery-platform password|platform credential/i.test(intelligenceSource), "Operational intelligence must not access delivery-platform credentials.");
assert(!/watchPosition\s*\(/.test(intelligenceSource), "Operational intelligence must not start continuous GPS tracking.");
assert(intelligenceSource.includes("handleMapFailure"), "Operational intelligence must handle map initialization failures.");

const mapSource = await readFile(join(root, "modules", "map.js"), "utf8");
assert(mapSource.includes("maplibregl.supported"), "The map must detect browsers without WebGL support.");
assert(mapSource.indexOf("this.data = { zones, corridors, pois, staging }") < mapSource.indexOf("maplibregl.supported"), "Overlay data must load before the WebGL support check.");

for (const file of deployedFiles) {
  await assertSame(file, join("dist", file));
}
for (const directory of ["modules", "data"]) {
  for (const source of await listFiles(join(root, directory))) {
    const path = relative(root, source);
    await assertSame(path, join("dist", path));
  }
}

console.log(`Validated ${syntaxFiles.length} JavaScript files, ${ids.length} DOM IDs, ${marketsPayload.markets.length} market, and the generated deployment.`);

async function listFiles(directory, predicate = () => true) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path, predicate));
    else if (predicate(path)) files.push(path);
  }
  return files.sort();
}

async function readJson(path) {
  const text = await readFile(join(root, path), "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error.message}`);
  }
}

async function assertReadable(path, message) {
  try {
    await readFile(path);
  } catch {
    assert.fail(message);
  }
}

async function assertSame(sourcePath, deployedPath) {
  const [source, deployed] = await Promise.all([
    readFile(join(root, sourcePath)),
    readFile(join(root, deployedPath)),
  ]);
  assert(source.equals(deployed), `${deployedPath} is stale; run npm run build.`);
}

function localHtmlReferences(source) {
  const references = [
    ...source.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/g),
  ].map((match) => match[1]);
  return references
    .filter((reference) => !/^(?:https?:|data:|#)/.test(reference))
    .map((reference) => reference.replace(/^\.\//, ""));
}

function validateGeoJson(value, file) {
  assert.equal(value?.type, "FeatureCollection", `${file} must be a FeatureCollection.`);
  assert(Array.isArray(value.features), `${file} requires a features array.`);
  const ids = new Set();
  for (const feature of value.features) {
    assert.equal(feature?.type, "Feature", `${file} contains a non-Feature record.`);
    assert(feature.geometry && feature.properties, `${file} contains an incomplete feature.`);
    const id = feature.properties.id;
    assert(typeof id === "string" && id, `${file} contains a feature without an ID.`);
    assert(!ids.has(id), `${file} contains duplicate feature ID ${id}.`);
    ids.add(id);
    validateCoordinates(feature.geometry.coordinates, `${file}:${id}`);
  }
}

function validateCoordinates(value, label) {
  if (Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every(Number.isFinite)) {
    assert(value[0] >= -180 && value[0] <= 180, `${label} has an invalid longitude.`);
    assert(value[1] >= -90 && value[1] <= 90, `${label} has an invalid latitude.`);
    return;
  }
  assert(Array.isArray(value) && value.length > 0, `${label} has invalid coordinates.`);
  value.forEach((nested) => validateCoordinates(nested, label));
}
