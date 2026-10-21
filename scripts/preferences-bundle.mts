import path from "node:path";
import { build } from "esbuild";

/** Use the same standalone privileged script in production and VM tests. */
export function bundlePreferences({ root, write = true }: { root: string; write?: boolean }) {
  return build({
    entryPoints: [path.join(root, "src", "preferences.ts")],
    outfile: path.join(root, "dist", "addon", "preferences.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["firefox102"],
    sourcemap: false,
    write
  });
}
