import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TextWriter, Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import { createProjectSourceHash } from "./package-licensing.mjs";

import {
  createUpdateManifest,
  releaseAssetName,
  createSourceLinks
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

export async function verifyRelease({ root = process.cwd(), tag, sourceRoot = root } = {}) {
  const packageJson = await readJson(path.join(root, "package.json"));
  const manifest = await readJson(path.join(root, "addon", "manifest.json"));
  const updateManifest = await readJson(path.join(root, "updates.json"));
  const distUpdateManifest = await readJson(path.join(root, "dist", "updates.json"));
  const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  const xpiBytes = await readFile(path.join(root, "dist", releaseAssetName));
  const xpiHash = createHash("sha256").update(xpiBytes).digest("hex");
  const sourceSha256 = await createProjectSourceHash(sourceRoot);
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
  errors.push(...await validateXpiSource({ xpiBytes, version: packageJson.version, sourceSha256 }));

  if (errors.length > 0) {
    throw new Error(`Release verification failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    tag,
    version: packageJson.version,
    asset: releaseAssetName,
    bytes: xpiBytes.byteLength,
    sha256: xpiHash,
    source: createSourceLinks(packageJson.version),
    sourceSha256
  };
}

export async function validateXpiSource({ xpiBytes, version, sourceSha256 }) {
  const errors = [];
  const xpi = new ZipReader(new Uint8ArrayReader(xpiBytes));
  try {
    const entries = await xpi.getEntries();
    if (entries.some(entry => entry.filename.startsWith("source/"))) errors.push("XPI contains embedded project source");
    for (const filename of ["LICENSE", "NOTICE", "THIRD-PARTY-NOTICES.txt"]) {
      if (!entries.some(entry => entry.filename === filename)) errors.push("XPI is missing " + filename);
    }
    const notice = entries.find(entry => entry.filename === "SOURCE.txt");
    if (!notice) return [...errors, "XPI is missing source download directions"];
    const text = await notice.getData(new TextWriter());
    const source = createSourceLinks(version);
    for (const line of ["Release tag: " + source.tag, "Source browser: " + source.tree,
      "Source ZIP: " + source.zip, "Source tar.gz: " + source.tar]) {
      if (!text.split(/\r?\n/).includes(line)) errors.push("SOURCE.txt is missing " + line);
    }
    const expectedHash = text.match(/^Project source SHA-256: ([a-f0-9]{64})$/m)?.[1];
    if (expectedHash !== sourceSha256) errors.push("XPI source checksum does not match project files");
    if (/zotero-annotation-markdown-source\.zip/.test(text)) errors.push("SOURCE.txt refers to a removed release asset");
    const manifestEntry = entries.find(entry => entry.filename === "manifest.json");
    if (manifestEntry) {
      const manifest = JSON.parse(await manifestEntry.getData(new TextWriter()));
      if (manifest.version !== version) errors.push("XPI manifest version does not match source tag");
    } else errors.push("XPI is missing manifest.json");
  } catch (error) {
    errors.push("Could not inspect XPI source directions: " + error.message);
  } finally { await xpi.close(); }
  return errors;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const tag = process.argv[2] ?? process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
  const sourceRoot = process.argv[3] ?? process.cwd();
  const result = await verifyRelease({ tag, sourceRoot });
  console.log(
    `Release verification passed: ${result.tag} ` +
    `asset=${result.asset} bytes=${result.bytes} sha256=${result.sha256} ` +
    `source=${result.source.tag} sha256=${result.sourceSha256}`
  );
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
