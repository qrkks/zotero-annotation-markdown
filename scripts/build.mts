import { appendFile, cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { build } from "esbuild";
import { inlineKatexWoff2Fonts } from "./katex-assets.mts";
import { packageLicensing } from "./package-licensing.mts";
import { bundlePreferences } from "./preferences-bundle.mts";

const root = process.cwd();
const distAddon = path.join(root, "dist", "addon");

await rm(path.join(root, "dist"), { force: true, recursive: true });
await mkdir(distAddon, { recursive: true });

await cp(path.join(root, "addon"), distAddon, { recursive: true });
await appendKatexAssets();
const styleText = await readFile(path.join(distAddon, "styles", "annotation-markdown.css"), "utf8");

const result = await build({
  entryPoints: [path.join(root, "src", "plugin.ts")],
  bundle: true,
  format: "iife",
  globalName: "ZoteroAnnotationMarkdown",
  outfile: path.join(distAddon, "plugin.js"),
  platform: "browser",
  target: ["firefox102"],
  sourcemap: false,
  metafile: true,
  // Load styles with the existing scriptloader, avoiding a window-bound sync XHR at startup.
  footer: { js: `var ZoteroAnnotationMarkdownStyleText = ${JSON.stringify(styleText)};` }
});

await bundlePreferences({ root });

await packageLicensing({
  root,
  distAddon,
  inputs: [
    ...Object.keys(result.metafile.inputs),
    "node_modules/katex/dist/katex.min.css",
    "node_modules/markdown-it-texmath/css/texmath.css"
  ]
});

async function appendKatexAssets() {
  const katexDist = path.join(root, "node_modules", "katex", "dist");
  const texmathCss = await readFile(
    path.join(root, "node_modules", "markdown-it-texmath", "css", "texmath.css"),
    "utf8"
  );
  const addonStyles = path.join(distAddon, "styles");
  const katexCss = await inlineKatexWoff2Fonts(
    await readFile(path.join(katexDist, "katex.min.css"), "utf8"),
    (filename) => readFile(path.join(katexDist, "fonts", filename))
  );

  await appendFile(
    path.join(addonStyles, "annotation-markdown.css"),
    `\n/* KaTeX math rendering */\n${katexCss}\n${texmathCss}`
  );
  // WOFF2 fonts are embedded above; retain the external fallback formats only.
  await cp(path.join(katexDist, "fonts"), path.join(addonStyles, "fonts"), {
    recursive: true,
    filter: (source) => !source.endsWith(".woff2")
  });
}
