import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("bootstrap", () => {
  test("does not reference a bare window global", async () => {
    const source = await readFile(path.join(process.cwd(), "addon", "bootstrap.js"), "utf8");

    expect(source).not.toContain("\n      window,");
    expect(source).toContain("window: globalThis.window");
  });

  test("registers a Zotero preference pane", async () => {
    const source = await readFile(path.join(process.cwd(), "addon", "bootstrap.js"), "utf8");

    expect(source).toContain("Zotero.PreferencePanes.register");
    expect(source).toContain("preferences.xhtml");
    expect(source).toContain("icons/annotation-markdown.svg");
    expect(source).toContain("preferences.js");
    expect(source).toContain("preferences.css");
  });
});
