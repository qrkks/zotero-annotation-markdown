import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("bootstrap", () => {
  test("does not reference a bare window global", async () => {
    const source = await readFile(path.join(process.cwd(), "addon", "bootstrap.js"), "utf8");

    expect(source).not.toContain("\n      window,");
    expect(source).toContain("window: globalThis.window");
  });
});
