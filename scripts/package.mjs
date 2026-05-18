import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";

const root = process.cwd();
const addonDir = path.join(root, "dist", "addon");
const outFile = path.join(root, "dist", "zotero-annotation-markdown.xpi");

const writer = new ZipWriter(new BlobWriter("application/zip"));

for (const file of await listFiles(addonDir)) {
  const bytes = await readFile(file);
  const relativePath = path.relative(addonDir, file).replaceAll("\\", "/");
  await writer.add(relativePath, new Uint8ArrayReader(bytes));
}

const blob = await writer.close();
await writeFile(outFile, new Uint8Array(await blob.arrayBuffer()));

async function listFiles(directory) {
  const entries = await readdir(directory);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    const entryStat = await stat(fullPath);
    if (entryStat.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}
