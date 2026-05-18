import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  createUpdateManifest,
  deterministicZipEntryOptions,
  releaseAssetName,
  updateManifestUrl
} from "../scripts/release-config.mjs";

describe("release configuration", () => {
  test("uses the stable GitHub raw update manifest URL", () => {
    expect(updateManifestUrl).toBe(
      "https://raw.githubusercontent.com/qrkks/zotero-annotation-markdown-plugins/main/updates.json"
    );
  });

  test("creates a Zotero update manifest for the release asset", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "addon", "manifest.json"), "utf8"));
    const xpiBytes = new TextEncoder().encode("fake xpi bytes");
    const xpiHash = createHash("sha256").update(xpiBytes).digest("hex");

    const updates = createUpdateManifest({ packageJson, manifest, xpiHash });

    expect(updates).toEqual({
      addons: {
        [manifest.applications.zotero.id]: {
          updates: [
            {
              version: packageJson.version,
              update_link: `https://github.com/qrkks/zotero-annotation-markdown-plugins/releases/download/v${packageJson.version}/${releaseAssetName}`,
              update_hash: `sha256:${xpiHash}`,
              applications: {
                zotero: {
                  strict_min_version: manifest.applications.zotero.strict_min_version,
                  strict_max_version: manifest.applications.zotero.strict_max_version
                }
              }
            }
          ]
        }
      }
    });
  });

  test("uses deterministic zip entry timestamps for stable release hashes", () => {
    expect(deterministicZipEntryOptions).toEqual({
      lastModDate: new Date("2026-01-01T00:00:00.000Z"),
      lastAccessDate: new Date("2026-01-01T00:00:00.000Z"),
      creationDate: new Date("2026-01-01T00:00:00.000Z"),
      extendedTimestamp: false
    });
  });
});
