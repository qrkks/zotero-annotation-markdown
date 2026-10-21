// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { BlobWriter, TextWriter, Uint8ArrayReader, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { packageArtifacts } from "../scripts/package.mts";
import { createProjectSourceHash } from "../scripts/package-licensing.mts";
import { validateXpiSource, verifyRelease } from "../scripts/verify-release.mts";
import { createSourceLinks, releaseAssetName } from "../scripts/release-config.mts";

const temporaryRoots: string[] = [];
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
    "dist/addon/NOTICE": "Project notice", "dist/addon/THIRD-PARTY-NOTICES.txt": "Dependency license notices",
    "src/plugin.ts": "export const source = 'editable';\n", "scripts/build.mts": "// build\n",
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n", "pnpm-workspace.yaml": "virtualStoreDirMaxLength: 60\n",
    "tsconfig.json": "{}\n", "tsconfig.test.json": "{}\n", "tsconfig.scripts.json": "{}\n",
    "LICENSE": "Project license", "NOTICE": "Project notice", "licenses/MIT-legacy.txt": "Legacy notice",
    "README.md": "Build instructions", "README.zh-CN.md": "构建说明"
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content);
  }
  return root;
}

async function unpack(bytes: Uint8Array) {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  try {
    const result = new Map<string, string>();
    for (const entry of await reader.getEntries()) if (!entry.directory) result.set(entry.filename, await entry.getData(new TextWriter()));
    return result;
  } finally { await reader.close(); }
}
async function repack(files: Map<string, string>) {
  const writer = new ZipWriter(new BlobWriter());
  for (const [name, value] of files) await writer.add(name, new Uint8ArrayReader(Buffer.from(value)));
  return new Uint8Array(await (await writer.close()).arrayBuffer());
}
const xpiBytes = (root: string) => readFile(path.join(root, "dist", releaseAssetName));

describe("XPI with GitHub-generated source downloads", () => {
  test("packages only the XPI, retains notices and points to both versioned source archives", async () => {
    const root = await fixture(); await packageArtifacts({ root });
    const bytes = await xpiBytes(root), xpi = await unpack(bytes);
    const source = createSourceLinks("1.2.3"), sourceSha256 = await createProjectSourceHash(root);
    expect([...xpi.keys()].some(name => name.startsWith("source/"))).toBe(false);
    expect(xpi.get("plugin.js")).toBe("/* bundled runtime */");
    expect(xpi.get("LICENSE")).toBe("Project license");
    expect(xpi.get("NOTICE")).toBe("Project notice");
    expect(xpi.get("THIRD-PARTY-NOTICES.txt")).toBe("Dependency license notices");
    expect(xpi.get("SOURCE.txt")).toContain(source.zip);
    expect(xpi.get("SOURCE.txt")).toContain(source.tar);
    expect(xpi.get("SOURCE.txt")).toContain(sourceSha256);
    expect(await readdir(path.join(root, "dist"))).toEqual(["addon", "updates.json", releaseAssetName]);
    expect(await validateXpiSource({ xpiBytes: bytes, version: "1.2.3", sourceSha256 })).toEqual([]);
    const options = { root, tag: "v1.2.3" };
    const result = await verifyRelease(options);
    expect(result.source).toEqual(source);
    expect(result.sourceSha256).toBe(sourceSha256);
  });

  test("is deterministic and changes source identity even when runtime output stays the same", async () => {
    const root = await fixture(); await packageArtifacts({ root }); const first = await xpiBytes(root);
    await packageArtifacts({ root }); expect(await xpiBytes(root)).toEqual(first);
    await writeFile(path.join(root, "src/plugin.ts"), "export const source = 'changed';\n");
    await packageArtifacts({ root }); const changed = await xpiBytes(root);
    expect(hash(changed)).not.toBe(hash(first));
    expect((await unpack(changed)).get("plugin.js")).toBe((await unpack(first)).get("plugin.js"));
    const sourceSha256 = await createProjectSourceHash(root);
    expect(await validateXpiSource({ xpiBytes: first, version: "1.2.3", sourceSha256 }))
      .toContain("XPI source checksum does not match project files");
  });

  test("rejects embedded source, missing notices and incorrect versioned download links", async () => {
    const root = await fixture(); await packageArtifacts({ root });
    const files = await unpack(await xpiBytes(root)), sourceSha256 = await createProjectSourceHash(root);
    files.set("source/unexpected.ts", "source");
    let errors = await validateXpiSource({ xpiBytes: await repack(files), version: "1.2.3", sourceSha256 });
    expect(errors).toContain("XPI contains embedded project source");
    files.delete("source/unexpected.ts"); files.delete("SOURCE.txt"); files.delete("LICENSE");
    errors = await validateXpiSource({ xpiBytes: await repack(files), version: "1.2.3", sourceSha256 });
    expect(errors).toContain("XPI is missing source download directions");
    expect(errors).toContain("XPI is missing LICENSE");
    const wrongVersion = await validateXpiSource({ xpiBytes: await xpiBytes(root), version: "1.2.4", sourceSha256 });
    expect(wrongVersion).toContain("SOURCE.txt is missing Source ZIP: " + createSourceLinks("1.2.4").zip);
    expect(wrongVersion).toContain("XPI manifest version does not match source tag");
  });

  test("verifies an extracted repository snapshot against the packaged source checksum", async () => {
    const root = await fixture(), sourceRoot = await fixture(); await packageArtifacts({ root });
    const options = { root, sourceRoot, tag: "v1.2.3" };
    await expect(verifyRelease(options)).resolves.toMatchObject({ source: createSourceLinks("1.2.3") });
    await writeFile(path.join(sourceRoot, "src/plugin.ts"), "export const source = 'different';\n");
    await expect(verifyRelease(options)).rejects.toThrow("XPI source checksum does not match project files");
  });

  test("keeps source identity stable across Windows and Unix text line endings", async () => {
    const root = await fixture(), sourceSha256 = await createProjectSourceHash(root);
    await writeFile(path.join(root, "src/plugin.ts"), "export const source = 'editable';\r\n");
    await writeFile(path.join(root, "scripts/build.mts"), "// build\r\n");
    expect(await createProjectSourceHash(root)).toBe(sourceSha256);
  });
});
