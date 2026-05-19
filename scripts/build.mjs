import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";

const root = process.cwd();
const distAddon = path.join(root, "dist", "addon");

await rm(path.join(root, "dist"), { force: true, recursive: true });
await mkdir(distAddon, { recursive: true });

await cp(path.join(root, "addon"), distAddon, { recursive: true });

await build({
  entryPoints: [path.join(root, "src", "plugin.js")],
  bundle: true,
  format: "iife",
  globalName: "ZoteroAnnotationMarkdown",
  outfile: path.join(distAddon, "plugin.js"),
  platform: "browser",
  target: ["firefox102"],
  sourcemap: false
});
