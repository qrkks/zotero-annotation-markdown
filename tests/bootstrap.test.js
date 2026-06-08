import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

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

  test("rewrites KaTeX font URLs to plugin resource URLs before injecting styles", async () => {
    const bootstrap = await loadBootstrapScript();

    const css = bootstrap.rewriteRelativeFontUrls(
      "@font-face{src:url(fonts/KaTeX_Main-Regular.woff2) format(\"woff2\")}",
      "jar:file:///profile/extensions/addon.xpi!/"
    );

    expect(css).toContain("url(jar:file:///profile/extensions/addon.xpi!/styles/fonts/KaTeX_Main-Regular.woff2)");
    expect(css).not.toContain("url(fonts/");
  });
});

async function loadBootstrapScript() {
  const source = await readFile(path.join(process.cwd(), "addon", "bootstrap.js"), "utf8");
  const context = {};
  vm.runInNewContext(source, context);
  return context;
}
