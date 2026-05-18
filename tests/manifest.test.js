import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("addon manifest", () => {
  test("targets the tested Zotero 9.0.x compatibility range", async () => {
    const manifestPath = path.join(process.cwd(), "addon", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

    expect(manifest.applications.zotero.strict_min_version).toBe("9.0");
    expect(manifest.applications.zotero.strict_max_version).toBe("9.0.*");
  });
});
