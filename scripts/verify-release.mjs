import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  createUpdateManifest,
  releaseAssetName
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

  if (errors.length > 0) {
    throw new Error(`Release verification failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    tag,
    version: packageJson.version,
    asset: releaseAssetName,
    bytes: xpiBytes.byteLength,
    sha256: xpiHash
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const tag = process.argv[2] ?? process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
  const result = await verifyRelease({ tag });
  console.log(
    `Release verification passed: ${result.tag} ` +
    `asset=${result.asset} bytes=${result.bytes} sha256=${result.sha256}`
  );
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
