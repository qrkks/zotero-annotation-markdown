import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { validateRelease } from "../scripts/verify-release.mjs";

describe("release workflow", () => {
  test("accepts matching tag, versions, changelog, and update manifests", () => {
    const expectedUpdateManifest = {
      addons: {
        "addon@example.com": {
          updates: [{ version: "1.2.3", update_hash: "sha256:abc" }]
        }
      }
    };

    expect(validateRelease({
      tag: "v1.2.3",
      packageJson: { version: "1.2.3" },
      manifest: { version: "1.2.3" },
      updateManifest: expectedUpdateManifest,
      distUpdateManifest: expectedUpdateManifest,
      expectedUpdateManifest,
      changelog: "## 1.2.3 - 2026-08-19"
    })).toEqual([]);
  });

  test("rejects a mismatched tag, manifest, changelog, or update manifest", () => {
    const errors = validateRelease({
      tag: "v1.2.2",
      packageJson: { version: "1.2.3" },
      manifest: { version: "1.2.2" },
      updateManifest: {},
      distUpdateManifest: {},
      expectedUpdateManifest: { addons: {} },
      changelog: "# Changelog"
    });

    expect(errors).toEqual([
      "release tag v1.2.2 does not match v1.2.3",
      "addon/manifest.json version 1.2.2 does not match 1.2.3",
      "CHANGELOG.md does not contain a 1.2.3 release heading",
      "updates.json does not match the packaged XPI and release metadata",
      "dist/updates.json does not match the packaged XPI and release metadata"
    ]);
  });

  test("keeps verification and audit ahead of release creation", async () => {
    const workflow = await readFile(
      path.join(process.cwd(), ".github", "workflows", "release.yml"),
      "utf8"
    );

    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("pnpm run verify");
    expect(workflow).toContain("pnpm audit --prod");
    expect(workflow).toContain('pnpm run release:verify "$RELEASE_TAG"');
    expect(workflow).toContain("git diff --exit-code -- updates.json");
    expect(workflow).toContain('gh release download "$RELEASE_TAG"');
    expect(workflow).toContain("sha256sum --check --strict");
    expect(workflow.indexOf("pnpm audit --prod"))
      .toBeLessThan(workflow.indexOf("gh release create"));
    expect(workflow.indexOf("pnpm run release:verify"))
      .toBeLessThan(workflow.indexOf("gh release create"));
    expect(workflow.indexOf("git diff --exit-code -- updates.json"))
      .toBeLessThan(workflow.indexOf("gh release create"));
  });

  test("normalizes repository text files for cross-platform packaging", async () => {
    const attributes = await readFile(
      path.join(process.cwd(), ".gitattributes"),
      "utf8"
    );

    expect(attributes).toContain("* text=auto eol=lf");
    expect(attributes).toContain("*.woff2 binary");
    expect(attributes).toContain("*.xpi binary");
  });
});
