import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import type { ReleasePackage, AddonManifest } from "./release-config.mts";
import { createProjectSourceHash, createSourceNotice } from "./package-licensing.mts";

import {
  createUpdateManifest,
  deterministicZipEntryOptions,
  deterministicZipWriterOptions,
  releaseAssetName
} from "./release-config.mts";

export async function packageArtifacts({ root = process.cwd() } = {}) {
  const addonDir = path.join(root, "dist", "addon");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as ReleasePackage;
  const manifest = JSON.parse(await readFile(path.join(root, "addon", "manifest.json"), "utf8")) as AddonManifest;
  const sourceSha256 = await createProjectSourceHash(root);
  await writeFile(path.join(addonDir, "SOURCE.txt"), createSourceNotice(packageJson.version, sourceSha256));
  const xpiBytes = await zipDirectory(addonDir);
  await writeFile(path.join(root, "dist", releaseAssetName), xpiBytes);

  const xpiHash = createHash("sha256").update(xpiBytes).digest("hex");
  const updateManifest = `${JSON.stringify(createUpdateManifest({ packageJson, manifest, xpiHash }), null, 2)}\n`;
  await writeFile(path.join(root, "updates.json"), updateManifest);
  await writeFile(path.join(root, "dist", "updates.json"), updateManifest);
  return { xpiHash, sourceSha256 };
}

async function zipDirectory(directory: string) {
  const writer = new ZipWriter(new BlobWriter("application/zip"), deterministicZipWriterOptions);
  for (const file of await listFiles(directory)) {
    const bytes = await readFile(file);
    const relativePath = path.relative(directory, file).replaceAll("\\", "/");
    await writer.add(relativePath, new Uint8ArrayReader(bytes), deterministicZipEntryOptions);
  }
  return new Uint8Array(await (await writer.close()).arrayBuffer());
}

async function listFiles(directory: string): Promise<string[]> {
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
