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

  test("rotates an oversized diagnostic log and keeps one backup", async () => {
    const bootstrap = await loadBootstrapScript();
    const files = new Map([
      ["/profile/annotation-markdown-debug.log", "current"],
      ["/profile/annotation-markdown-debug.log.1", "old backup"]
    ]);
    const profileDir = createFakeFile("/profile", files);

    bootstrap.rotateDiagnosticLog(profileDir, 7);

    expect(files.has("/profile/annotation-markdown-debug.log")).toBe(false);
    expect(files.get("/profile/annotation-markdown-debug.log.1")).toBe("current");
  });

  test("leaves a diagnostic log below the rotation limit in place", async () => {
    const bootstrap = await loadBootstrapScript();
    const files = new Map([
      ["/profile/annotation-markdown-debug.log", "small"]
    ]);
    const profileDir = createFakeFile("/profile", files);

    bootstrap.rotateDiagnosticLog(profileDir, 6);

    expect(files.get("/profile/annotation-markdown-debug.log")).toBe("small");
    expect(files.has("/profile/annotation-markdown-debug.log.1")).toBe(false);
  });
});

async function loadBootstrapScript() {
  const source = await readFile(path.join(process.cwd(), "addon", "bootstrap.js"), "utf8");
  const context = {};
  vm.runInNewContext(source, context);
  return context;
}

function createFakeFile(initialPath, files) {
  return {
    path: initialPath,
    clone() {
      return createFakeFile(this.path, files);
    },
    append(name) {
      this.path = `${this.path}/${name}`;
    },
    exists() {
      return files.has(this.path);
    },
    get fileSize() {
      return files.get(this.path)?.length ?? 0;
    },
    remove() {
      files.delete(this.path);
    },
    moveTo(parent, name) {
      const contents = files.get(this.path);
      files.delete(this.path);
      files.set(`${parent.path}/${name}`, contents);
    }
  };
}
