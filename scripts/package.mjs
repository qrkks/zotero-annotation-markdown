import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { createSourceNotice } from "./package-licensing.mjs";

import {
  createUpdateManifest,
  deterministicZipEntryOptions,
  deterministicZipWriterOptions,
  releaseAssetName,
  sourceAssetName
} from "./release-config.mjs";

export async function packageArtifacts({ root = process.cwd() } = {}) {
  const addonDir = path.join(root, "dist", "addon");
  const sourceDir = path.join(root, "dist", "source");
  const sourceBytes = await zipDirectory(sourceDir, "source/");
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  await writeFile(path.join(root, "dist", sourceAssetName), sourceBytes);
  // The XPI identifies the exact companion archive, including for local builds
  // that share a version number but contain different unpublished source.
  await writeFile(path.join(addonDir, "SOURCE.txt"), createSourceNotice(sourceSha256));
  const xpiBytes = await zipDirectory(addonDir);
  await writeFile(path.join(root, "dist", releaseAssetName), xpiBytes);

  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(root, "addon", "manifest.json"), "utf8"));
  const xpiHash = createHash("sha256").update(xpiBytes).digest("hex");
  const updateManifest = `${JSON.stringify(createUpdateManifest({ packageJson, manifest, xpiHash }), null, 2)}\n`;
  await writeFile(path.join(root, "updates.json"), updateManifest);
  await writeFile(path.join(root, "dist", "updates.json"), updateManifest);
  return { xpiHash, sourceSha256 };
}

async function zipDirectory(directory, prefix = "") {
  const writer = new ZipWriter(new BlobWriter("application/zip"), deterministicZipWriterOptions);
  for (const file of await listFiles(directory)) {
    const bytes = await readFile(file);
    const relativePath = prefix + path.relative(directory, file).replaceAll("\\", "/");
    await writer.add(relativePath, new Uint8ArrayReader(bytes), deterministicZipEntryOptions);
  }
  return new Uint8Array(await (await writer.close()).arrayBuffer());
}

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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packageArtifacts().catch(error => { console.error(error.message); process.exitCode = 1; });
}
