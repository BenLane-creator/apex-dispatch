import { cp, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
const staging = join(root, ".dist-build");

if (dirname(output) !== root || dirname(staging) !== root) {
  throw new Error("Refusing to build outside the repository root.");
}

const files = [
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "service-worker.js",
  "icon.svg",
  "operational-intelligence.css",
];

const directories = ["modules", "data"];

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });

for (const file of files) {
  await cp(join(root, file), join(staging, file));
}

for (const directory of directories) {
  await cp(join(root, directory), join(staging, directory), { recursive: true });
}

await rm(output, { recursive: true, force: true });
await rename(staging, output);

console.log(`Built Apex Dispatch into ${output}`);
