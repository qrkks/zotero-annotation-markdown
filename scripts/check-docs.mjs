import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const localeRoots = ["en", "zh-CN"];
const docsRoot = path.join(root, "docs");
const errors = [];

const localeFiles = new Map();
for (const locale of localeRoots) {
  localeFiles.set(locale, await listMarkdownFiles(path.join(docsRoot, locale)));
}

const allLocalePaths = new Set([...localeFiles.values()].flat());
for (const relativePath of allLocalePaths) {
  for (const locale of localeRoots) {
    if (!localeFiles.get(locale).includes(relativePath)) {
      errors.push(`Missing ${locale} translation: docs/${locale}/${relativePath}`);
    }
  }
}

const activeDocs = [
  path.join(root, "README.md"),
  path.join(root, "README.zh-CN.md"),
  path.join(docsRoot, "README.md"),
  ...localeRoots.flatMap((locale) =>
    localeFiles.get(locale).map((relativePath) => path.join(docsRoot, locale, relativePath))
  )
];

for (const filePath of activeDocs) {
  const markdown = await readFile(filePath, "utf8");
  for (const target of findLocalTargets(markdown)) {
    const targetPath = path.resolve(path.dirname(filePath), target);
    try {
      await access(targetPath);
    } catch {
      errors.push(`${path.relative(root, filePath)} links to missing ${target}`);
    }
  }
}

if (errors.length) {
  console.error("Documentation check failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Documentation check passed (${allLocalePaths.size} bilingual page pairs).`);
}

async function listMarkdownFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function findLocalTargets(markdown) {
  const targets = [];
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

  for (const match of markdown.matchAll(linkPattern)) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }
    target = target.split("#", 1)[0];

    if (!target || /^(?:[a-z]+:|#)/i.test(target)) {
      continue;
    }

    targets.push(decodeURIComponent(target));
  }

  return targets;
}
