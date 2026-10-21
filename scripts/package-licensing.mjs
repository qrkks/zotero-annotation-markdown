import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSourceLinks } from "./release-config.mjs";

const projectInputs = [
  "LICENSE", "NOTICE", "licenses", "README.md", "README.zh-CN.md",
  "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.test.json", "src", "addon", "scripts"
];
const noticePattern = /^(?:licen[sc]e|copying|notice|authors)(?:[.-]|$)/i;
const textPattern = /\.(?:[cm]?js|ts|json|map|ya?ml|md|txt|css|svg|xhtml|ftl)$/i;

export async function packageLicensing({ root, distAddon, inputs }) {
  const packages = new Map();
  for (const input of inputs) {
    if (!input.replaceAll("\\", "/").includes("node_modules/")) continue;
    const dependency = await findPackage(path.resolve(root, input));
    packages.set(dependency.directory, dependency);
  }
  for (const filename of ["LICENSE", "NOTICE", "licenses"]) {
    await copySource(path.join(root, filename), path.join(distAddon, filename));
  }
  const notices = [
    "Third-party components in Zotero Annotation Markdown",
    "These components retain their upstream licenses and copyright notices.",
    "Project source and rebuild directions are in SOURCE.txt.",
    "Exact dependency versions and integrity hashes are pinned in pnpm-lock.yaml.",
    ""
  ];
  const dependencies = [...packages.values()].sort((a, b) =>
    a.packageJson.name < b.packageJson.name ? -1 : a.packageJson.name > b.packageJson.name ? 1 :
      a.packageJson.version < b.packageJson.version ? -1 : a.packageJson.version > b.packageJson.version ? 1 : 0
  );
  for (const { directory, packageJson } of dependencies) {
    const label = packageJson.name + "@" + packageJson.version;
    notices.push("=== " + label + " ===", "License: " + packageJson.license,
      "Package: https://www.npmjs.com/package/" + packageJson.name + "/v/" + packageJson.version);
    const repository = typeof packageJson.repository === "string"
      ? packageJson.repository : packageJson.repository?.url;
    if (repository) notices.push("Upstream source: " + repository.replace(/^git\+/, "").replace(/\.git$/, ""));
    notices.push("");
    const filenames = (await readdir(directory)).filter((name) => noticePattern.test(name)).sort();
    if (!filenames.length) throw new Error("Missing upstream license notice for " + label);
    for (const filename of filenames) {
      notices.push("--- " + filename + " ---", (await readFile(path.join(directory, filename), "utf8")).replaceAll("\r\n", "\n").trimEnd(), "");
    }
  }
  await writeFile(path.join(distAddon, "THIRD-PARTY-NOTICES.txt"), notices.join("\n") + "\n");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  await writeFile(path.join(distAddon, "SOURCE.txt"), createSourceNotice(
    packageJson.version, await createProjectSourceHash(root)
  ));
}

export function createSourceNotice(version, sourceSha256) {
  const source = createSourceLinks(version);
  return [
    "Source for this Zotero Annotation Markdown build", "",
    "Install the .xpi file. Source downloads are for inspection and rebuilding.",
    "Published releases use GitHub's automatically generated archives of the release tag:", "",
    "Release tag: " + source.tag,
    "Source browser: " + source.tree,
    "Source ZIP: " + source.zip,
    "Source tar.gz: " + source.tar,
    "Project source SHA-256: " + sourceSha256, "",
    "These archives contain the repository source, build scripts and lockfile.",
    "The checksum identifies normalized project inputs, not GitHub's ZIP bytes.",
    "Unpublished local changes may differ from the published tag.", "",
    "Bundled dependencies retain their upstream licenses. Exact versions and",
    "integrity hashes are in pnpm-lock.yaml; package and upstream source locations",
    "are listed in THIRD-PARTY-NOTICES.txt.", "",
    "To rebuild, extract either source archive and open its top-level folder.",
    "Install Node.js 24 and the pnpm version declared in package.json, then run:", "",
    "  pnpm install --frozen-lockfile", "  pnpm run package", "",
    "Installation downloads the tools and dependencies pinned by the lockfile.",
    "No separate project source ZIP is uploaded as a release asset.", "",
    "Project: https://github.com/qrkks/zotero-annotation-markdown", ""
  ].join("\n");
}

/** Hash build inputs in filename order with portable text line endings. */
export async function createProjectSourceHash(root) {
  const files = [];
  async function collect(relative) {
    const absolute = path.join(root, relative);
    let entries;
    try { entries = await readdir(absolute); }
    catch (error) {
      if (error.code !== "ENOTDIR") throw error;
      files.push(relative.replaceAll("\\", "/")); return;
    }
    for (const entry of entries.sort()) if (entry !== "node_modules") await collect(path.join(relative, entry));
  }
  for (const input of projectInputs) await collect(input);
  const hash = createHash("sha256");
  for (const filename of files.sort()) {
    const bytes = await readFile(path.join(root, filename));
    const content = textPattern.test(filename) || noticePattern.test(path.basename(filename))
      ? bytes.toString("utf8").replaceAll("\r\n", "\n") : bytes;
    hash.update(filename).update("\0").update(content).update("\0");
  }
  return hash.digest("hex");
}

async function findPackage(filename) {
  let directory = path.dirname(await realpath(filename));
  while (true) {
    let packageJson;
    try { packageJson = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (packageJson?.name && packageJson?.version) return { directory, packageJson };
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("Cannot identify dependency for " + filename);
    directory = parent;
  }
}

async function copySource(source, destination) {
  const filename = path.basename(source);
  await mkdir(path.dirname(destination), { recursive: true });
  let entries;
  try { entries = await readdir(source); }
  catch (error) {
    if (error.code !== "ENOTDIR") throw error;
    const bytes = await readFile(source);
    const content = textPattern.test(filename) || noticePattern.test(filename)
      ? bytes.toString("utf8").replaceAll("\r\n", "\n") : bytes;
    await writeFile(destination, content); return;
  }
  await mkdir(destination, { recursive: true });
  for (const entry of entries.sort()) {
    if (entry !== "node_modules") await copySource(path.join(source, entry), path.join(destination, entry));
  }
}
