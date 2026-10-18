import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { afterEach, describe, expect, test, vi } from "vitest";

import { createPlugin } from "../src/plugin.ts";

const runningBootstraps = [];
afterEach(() => {
  for (const bootstrap of runningBootstraps.splice(0)) bootstrap.shutdown();
  document.body.replaceChildren();
});

describe("bootstrap", () => {
  test.each([[false, true], [true, true], [false, false], [true, false]])(
    "keeps one working outline after duplicate startup (expanded %s, first startup settled %s)", async (initialExpanded, firstStartupSettled) => {
    document.body.innerHTML = `<div id="annotations" style="overflow-y:auto">
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content"># One\n\n## Two</div></div>
      </div>
    </div>`;
    document.querySelector("#annotations").getBoundingClientRect = () => ({
      left: 20, top: 60, right: 320, bottom: 660, width: 300, height: 600
    });
    const key = "extensions.annotationMarkdown.outlineExpanded";
    const values = new Map([[key, initialExpanded]]);
    const listeners = new Set();
    const Zotero = {
      debug: vi.fn(),
      Reader: {
        _readers: [{ document }],
        registerEventListener: (type, handler) => listeners.add(handler),
        unregisterEventListener: (type, handler) => listeners.delete(handler)
      },
      Prefs: {
        get: key => values.get(key),
        set: (key, value) => values.set(key, value)
      },
      PreferencePanes: { register: vi.fn(() => "pane"), unregister: vi.fn() }
    };
    const pending = [];
    const diagnosticLines = [];
    const prepare = async () => {
      const bootstrap = await loadBootstrapScript();
      Object.assign(bootstrap, {
        Zotero,
        Services: { scriptloader: { loadSubScript() {} } },
        ZoteroAnnotationMarkdown: {
          createPlugin(options) {
            const plugin = createPlugin(options);
            const startup = plugin.startup.bind(plugin);
            plugin.startup = () => {
              const result = startup();
              pending.push(result);
              return result;
            };
            return plugin;
          }
        },
        createDiagnostics: () => ({ append: line => diagnosticLines.push(line) }),
        readStyleTextFromURI: () => ""
      });
      runningBootstraps.push(bootstrap);
      return bootstrap;
    };
    const data = { id: "annotation-markdown", version: "test-version", rootURI: "test://addon/" };
    const first = await prepare();
    first.startup(data, 1);
    if (firstStartupSettled) await Promise.all(pending);
    // Zotero can invoke startup again from another bootstrap scope before a
    // shutdown. Both scopes still share the same host Zotero object.
    const second = await prepare();
    second.startup(data, 3);
    await Promise.all(pending);

    expect(diagnosticLines.filter(line => line.includes("bootstrap startup"))).toEqual([
      "[annotation-markdown] bootstrap startup version=test-version reason=APP_STARTUP(1) replacedRuntime=false",
      "[annotation-markdown] bootstrap startup version=test-version reason=ADDON_ENABLE(3) replacedRuntime=true"
    ]);
    expect(listeners.size).toBe(1);
    expect(document.querySelectorAll("[data-annotation-markdown-outline='true']")).toHaveLength(1);
    const toggle = document.querySelector(".annotation-markdown-outline-toggle");
    for (const expanded of [!initialExpanded, initialExpanded, !initialExpanded]) {
      toggle.click();
      expect(values.get(key)).toBe(expanded);
      expect(document.querySelectorAll("[data-annotation-markdown-outline='true']")).toHaveLength(1);
      expect(document.querySelector(".annotation-markdown-outline-panel").hidden).toBe(!expanded);
    }

    first.shutdown();
    expect(Zotero.AnnotationMarkdownRuntime?.instance).toBe(second.ZoteroAnnotationMarkdownInstance);
    expect(listeners.size).toBe(1);
    second.shutdown();
    expect(listeners.size).toBe(0);
    expect(Zotero.AnnotationMarkdownRuntime).toBeUndefined();
    expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
  });

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
