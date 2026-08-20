import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";

import {
  createUpdateManifest,
  deterministicZipEntryOptions,
  deterministicZipWriterOptions,
  releaseAssetName
} from "./release-config.mjs";

const root = process.cwd();
const addonDir = path.join(root, "dist", "addon");
const outFile = path.join(root, "dist", releaseAssetName);

const writer = new ZipWriter(
  new BlobWriter("application/zip"),
  deterministicZipWriterOptions
);

for (const file of await listFiles(addonDir)) {
  const bytes = await readFile(file);
  const relativePath = path.relative(addonDir, file).replaceAll("\\", "/");
  await writer.add(relativePath, new Uint8ArrayReader(bytes), deterministicZipEntryOptions);
}

const blob = await writer.close();
const xpiBytes = new Uint8Array(await blob.arrayBuffer());
await writeFile(outFile, xpiBytes);

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(root, "addon", "manifest.json"), "utf8"));
const xpiHash = createHash("sha256").update(xpiBytes).digest("hex");
const updateManifest = `${JSON.stringify(createUpdateManifest({ packageJson, manifest, xpiHash }), null, 2)}\n`;

await writeFile(path.join(root, "updates.json"), updateManifest);
await writeFile(path.join(root, "dist", "updates.json"), updateManifest);

async function listFiles(directory) {
  const entries = (await readdir(directory)).sort();
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    const entryStat = await stat(fullPath);
    if (entryStat.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}
