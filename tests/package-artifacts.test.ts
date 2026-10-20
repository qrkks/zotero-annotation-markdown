// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { TextWriter, Uint8ArrayReader, ZipReader } from "@zip.js/zip.js";
import { packageArtifacts } from "../scripts/package.mjs";
import { validateSourceArchive, verifyRelease } from "../scripts/verify-release.mjs";
import { releaseAssetName, sourceAssetName } from "../scripts/release-config.mjs";

const temporaryRoots: Array<(string)> = [];
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("zotero-package-")) throw new Error("Unexpected fixture path");
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "zotero-package-")); temporaryRoots.push(root);
  const packageJson = { version: "1.2.3" };
  const manifest = { version: "1.2.3", applications: { zotero: { id: "test@example.com", strict_min_version: "7.0", strict_max_version: "10.*" } } };
  const files = {
    "package.json": JSON.stringify(packageJson), "addon/manifest.json": JSON.stringify(manifest),
    "CHANGELOG.md": "## 1.2.3 - 2026-10-20\n", "dist/addon/manifest.json": JSON.stringify(manifest),
    "dist/addon/plugin.js": "/* bundled runtime */", "dist/addon/LICENSE": "Project license",
    "dist/addon/THIRD-PARTY-NOTICES.txt": "Dependency license notices",
    "dist/source/project/package.json": JSON.stringify(packageJson),
    "dist/source/project/addon/manifest.json": JSON.stringify(manifest),
    "dist/source/project/src/plugin.ts": "export const source = 'editable';\n",
    "dist/source/project/pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    "dist/source/project/pnpm-workspace.yaml": "virtualStoreDirMaxLength: 60\n",
    "dist/source/dependencies/example@1.0.0/LICENSE": "Dependency license",
    "dist/source/dependencies/example@1.0.0/index.js": "export default 1;\n"
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content);
  }
  return root;
}

async function unpack(bytes: Uint8Array) {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  try {
    const result = new Map();
    for (const entry of await reader.getEntries()) if (!entry.directory) result.set(entry.filename, await entry.getData(new TextWriter()));
    return result;
  } finally { await reader.close(); }
}

async function artifacts(root: string) {
  return { xpiBytes: await readFile(path.join(root, "dist", releaseAssetName)), sourceBytes: await readFile(path.join(root, "dist", sourceAssetName)) };
}

describe("separate runtime and matching source archives", () => {
  test("keeps source out of the XPI, retains notices and identifies the exact companion archive", async () => {
    const root = await fixture(); await packageArtifacts({ root });
    const { xpiBytes, sourceBytes } = await artifacts(root);
    const xpi = await unpack(xpiBytes), source = await unpack(sourceBytes);
    expect([...xpi.keys()].some(name => name.startsWith("source/"))).toBe(false);
    expect(xpi.get("plugin.js")).toBe("/* bundled runtime */");
    expect(xpi.get("LICENSE")).toBe("Project license");
    expect(xpi.get("THIRD-PARTY-NOTICES.txt")).toBe("Dependency license notices");
    expect(xpi.get("SOURCE.txt")).toContain(sourceAssetName);
    expect(xpi.get("SOURCE.txt")).toContain(hash(sourceBytes));
    expect(source.get("source/project/src/plugin.ts")).toBe("export const source = 'editable';\n");
    expect(source.get("source/project/pnpm-lock.yaml")).toContain("lockfileVersion");
    expect(source.get("source/project/pnpm-workspace.yaml")).toContain("virtualStoreDirMaxLength: 60");
    expect(source.get("source/dependencies/example@1.0.0/LICENSE")).toBe("Dependency license");
    expect(await validateSourceArchive({ xpiBytes, sourceBytes })).toEqual([]);
    const releaseOptions = { root, tag: "v1.2.3" };
    const result = await verifyRelease(releaseOptions);
    expect(result.sourceAsset).toBe(sourceAssetName);
    expect(result.sourceSha256).toBe(hash(sourceBytes));
  });

  test("is deterministic and updates the XPI's source reference when only source changes", async () => {
    const root = await fixture(); await packageArtifacts({ root }); const first = await artifacts(root);
    await packageArtifacts({ root }); const repeat = await artifacts(root);
    expect(repeat.xpiBytes).toEqual(first.xpiBytes); expect(repeat.sourceBytes).toEqual(first.sourceBytes);
    await writeFile(path.join(root, "dist/source/project/src/plugin.ts"), "export const source = 'changed';\n");
    await packageArtifacts({ root }); const changed = await artifacts(root);
    expect(hash(changed.sourceBytes)).not.toBe(hash(first.sourceBytes));
    expect(hash(changed.xpiBytes)).not.toBe(hash(first.xpiBytes));
    expect((await unpack(changed.xpiBytes)).get("plugin.js")).toBe((await unpack(first.xpiBytes)).get("plugin.js"));
    expect(await validateSourceArchive({ xpiBytes: changed.xpiBytes, sourceBytes: first.sourceBytes })).toContain("SOURCE.txt does not match the companion source archive SHA-256");
  });

  test("rejects embedded source, a missing source reference and a tampered companion archive", async () => {
    const root = await fixture(); await packageArtifacts({ root });
    const { xpiBytes, sourceBytes } = await artifacts(root);
    const tampered = Buffer.concat([sourceBytes, Buffer.from("changed")]);
    expect(await validateSourceArchive({ xpiBytes, sourceBytes: tampered })).toContain("SOURCE.txt does not match the companion source archive SHA-256");
    await mkdir(path.join(root, "dist/addon/source")); await writeFile(path.join(root, "dist/addon/source/unexpected.ts"), "source");
    await packageArtifacts({ root });
    expect(await validateSourceArchive(await artifacts(root))).toContain("XPI contains embedded source; use the separate source archive");
    // Remove the reference from an already-created package by rebuilding a ZIP
    // directly, rather than bypassing the packaging function's source notice.
    const { BlobWriter, ZipWriter } = await import("@zip.js/zip.js");
    const writer = new ZipWriter(new BlobWriter());
    await writer.add("manifest.json", new Uint8ArrayReader(Buffer.from('{"version":"1.2.3"}')));
    const invalid = new Uint8Array(await (await writer.close()).arrayBuffer());
    expect(await validateSourceArchive({ xpiBytes: invalid, sourceBytes })).toContain("XPI is missing matching source archive directions");
  });
});
