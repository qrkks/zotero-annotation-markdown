import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("package version", () => {
  test("matches the add-on manifest version", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "addon", "manifest.json"), "utf8"));

    expect(packageJson.version).toBe("0.3.0");
    expect(manifest.version).toBe(packageJson.version);
  });
});
