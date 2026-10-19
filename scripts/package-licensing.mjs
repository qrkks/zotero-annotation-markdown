import { mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

const projectInputs = [
  "LICENSE", "NOTICE", "licenses", "README.md", "README.zh-CN.md",
  "package.json", "pnpm-lock.yaml", "tsconfig.json", "src", "addon", "scripts"
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
  for (const filename of projectInputs) {
    await copySource(path.join(root, filename), path.join(distAddon, "source", "project", filename));
  }

  const notices = [
    "Third-party components in Zotero Annotation Markdown",
    "These components retain their upstream licenses and copyright notices.",
    "Unmodified package snapshots are included in source/dependencies/.",
    ""
  ];
  const dependencies = [...packages.values()].sort((a, b) =>
    a.packageJson.name < b.packageJson.name ? -1 : a.packageJson.name > b.packageJson.name ? 1 :
      a.packageJson.version < b.packageJson.version ? -1 : a.packageJson.version > b.packageJson.version ? 1 : 0
  );
  for (const { directory, packageJson } of dependencies) {
    const label = `${packageJson.name}@${packageJson.version}`;
    notices.push(`=== ${label} ===`, `License: ${packageJson.license}`, "");
    const filenames = (await readdir(directory)).filter((name) => noticePattern.test(name)).sort();
    if (!filenames.length) throw new Error(`Missing upstream license notice for ${label}`);
    for (const filename of filenames) {
      notices.push(`--- ${filename} ---`, (await readFile(path.join(directory, filename), "utf8")).replaceAll("\r\n", "\n").trimEnd(), "");
    }
    await copySource(directory, path.join(distAddon, "source", "dependencies", label));
  }
  await writeFile(path.join(distAddon, "THIRD-PARTY-NOTICES.txt"), `${notices.join("\n")}\n`);
  await writeFile(path.join(distAddon, "SOURCE.txt"), [
    "Source for this Zotero Annotation Markdown build",
    "",
    "This XPI includes the project source and the upstream dependency packages",
    "used to build it, alongside the installed plugin files:",
    "",
    "  source/project/       Project source, assets, build scripts and lockfile",
    "  source/dependencies/  Bundled dependencies, including CSS and font assets",
    "",
    "The dependency snapshots retain their upstream license terms. Their notices",
    "are also collected in THIRD-PARTY-NOTICES.txt. Source text uses LF line endings",
    "so the same checkout can be packaged consistently on Windows and Linux.",
    "",
    "To rebuild, extract the XPI as a ZIP and open source/project/ in a terminal.",
    "Install Node.js 24 and the pnpm version declared in package.json, then run:",
    "",
    "  pnpm install --frozen-lockfile",
    "  pnpm run package",
    "",
    "Installation downloads the tools and exact dependencies pinned by the lockfile.",
    "The dependency snapshots above are provided as source; they are not a complete",
    "offline installation of the build tools.",
    "",
    "Project: https://github.com/qrkks/zotero-annotation-markdown",
    ""
  ].join("\n"));
}

async function findPackage(filename) {
  let directory = path.dirname(await realpath(filename));
  while (true) {
    let packageJson;
    try {
      packageJson = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // Some packages have nested package.json files containing only a module type.
    if (packageJson?.name && packageJson?.version) return { directory, packageJson };
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Cannot identify dependency for ${filename}`);
    directory = parent;
  }
}

async function copySource(source, destination) {
  const filename = path.basename(source);
  await mkdir(path.dirname(destination), { recursive: true });
  let entries;
  try {
    entries = await readdir(source);
  } catch (error) {
    if (error.code !== "ENOTDIR") throw error;
    const bytes = await readFile(source);
    const content = textPattern.test(filename) || noticePattern.test(filename)
      ? bytes.toString("utf8").replaceAll("\r\n", "\n") : bytes;
    await writeFile(destination, content);
    return;
  }
  await mkdir(destination, { recursive: true });
  for (const entry of entries.sort()) {
    if (entry !== "node_modules") await copySource(path.join(source, entry), path.join(destination, entry));
  }
}
