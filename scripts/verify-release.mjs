import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TextWriter, Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";

import {
  createUpdateManifest,
  releaseAssetName,
  sourceAssetName
} from "./release-config.mjs";

export function validateRelease({
  tag,
  packageJson,
  manifest,
  updateManifest,
  distUpdateManifest,
  expectedUpdateManifest,
  changelog
}) {
  const errors = [];
  const version = String(packageJson?.version ?? "");
  const expectedTag = `v${version}`;

  if (!version) {
    errors.push("package.json does not contain a version");
  }
  if (tag !== expectedTag) {
    errors.push(`release tag ${tag || "<missing>"} does not match ${expectedTag}`);
  }
  if (manifest?.version !== version) {
    errors.push(
      `addon/manifest.json version ${manifest?.version ?? "<missing>"} does not match ${version}`
    );
  }
  if (!changelog.includes(`## ${version} -`)) {
    errors.push(`CHANGELOG.md does not contain a ${version} release heading`);
  }

  const expectedJson = JSON.stringify(expectedUpdateManifest);
  if (JSON.stringify(updateManifest) !== expectedJson) {
    errors.push("updates.json does not match the packaged XPI and release metadata");
  }
  if (JSON.stringify(distUpdateManifest) !== expectedJson) {
    errors.push("dist/updates.json does not match the packaged XPI and release metadata");
  }

  return errors;
}

export async function verifyRelease({ root = process.cwd(), tag } = {}) {
  const packageJson = await readJson(path.join(root, "package.json"));
  const manifest = await readJson(path.join(root, "addon", "manifest.json"));
  const updateManifest = await readJson(path.join(root, "updates.json"));
  const distUpdateManifest = await readJson(path.join(root, "dist", "updates.json"));
  const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  const xpiBytes = await readFile(path.join(root, "dist", releaseAssetName));
  const xpiHash = createHash("sha256").update(xpiBytes).digest("hex");
  const sourceBytes = await readFile(path.join(root, "dist", sourceAssetName));
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const expectedUpdateManifest = createUpdateManifest({ packageJson, manifest, xpiHash });
  const errors = validateRelease({
    tag,
    packageJson,
    manifest,
    updateManifest,
    distUpdateManifest,
    expectedUpdateManifest,
    changelog
  });
  errors.push(...await validateSourceArchive({ xpiBytes, sourceBytes }));

  if (errors.length > 0) {
    throw new Error(`Release verification failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    tag,
    version: packageJson.version,
    asset: releaseAssetName,
    bytes: xpiBytes.byteLength,
    sha256: xpiHash,
    sourceAsset: sourceAssetName,
    sourceBytes: sourceBytes.byteLength,
    sourceSha256
  };
}

export async function validateSourceArchive({ xpiBytes, sourceBytes }) {
  const errors = [];
  const xpi = new ZipReader(new Uint8ArrayReader(xpiBytes));
  let source;
  try {
    const entries = await xpi.getEntries();
    if (entries.some(entry => entry.filename.startsWith("source/"))) errors.push("XPI contains embedded source; use the separate source archive");
    const notice = entries.find(entry => entry.filename === "SOURCE.txt");
    if (!notice) return [...errors, "XPI is missing matching source archive directions"];
    const text = await notice.getData(new TextWriter());
    if (!text.includes(`Matching source archive: ${sourceAssetName}`)) errors.push("SOURCE.txt does not identify the companion source archive");
    const expectedHash = text.match(/^SHA-256: ([a-f0-9]{64})$/m)?.[1];
    if (expectedHash !== createHash("sha256").update(sourceBytes).digest("hex")) {
      return [...errors, "SOURCE.txt does not match the companion source archive SHA-256"];
    }
    source = new ZipReader(new Uint8ArrayReader(sourceBytes));
    const sources = await source.getEntries();
    for (const filename of [
      "source/project/package.json", "source/project/pnpm-lock.yaml", "source/project/pnpm-workspace.yaml",
      "source/project/src/plugin.ts", "source/project/addon/manifest.json"
    ]) {
      if (!sources.some(entry => entry.filename === filename)) errors.push(`Source archive is missing ${filename}`);
    }
    const manifestEntry = entries.find(entry => entry.filename === "manifest.json");
    const sourceManifestEntry = sources.find(entry => entry.filename === "source/project/addon/manifest.json");
    if (manifestEntry && sourceManifestEntry) {
      const manifest = JSON.parse(await manifestEntry.getData(new TextWriter()));
      const sourceManifest = JSON.parse(await sourceManifestEntry.getData(new TextWriter()));
      if (manifest.version !== sourceManifest.version) errors.push("Source archive version does not match the XPI manifest");
    }
  } catch (error) {
    errors.push(`Could not inspect matching source archives: ${error.message}`);
  } finally {
    await source?.close(); await xpi.close();
  }
  return errors;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const tag = process.argv[2] ?? process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
  const result = await verifyRelease({ tag });
  console.log(
    `Release verification passed: ${result.tag} ` +
    `asset=${result.asset} bytes=${result.bytes} sha256=${result.sha256} ` +
    `source=${result.sourceAsset} bytes=${result.sourceBytes} sha256=${result.sourceSha256}`
  );
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
