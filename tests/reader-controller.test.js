import { describe, expect, test, vi } from "vitest";

import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.js";
import { createReaderController } from "../src/reader-controller.js";

describe("createReaderController", () => {
  test("renders comments during the initial render pass when enabled", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source.toUpperCase()}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: window.MutationObserver
    });

    controller.start();

    const comment = document.querySelector(".comment");
    expect(comment.hidden).toBe(false);
    expect(comment.querySelector("[data-annotation-markdown-source-node]")?.hidden).toBe(true);
    expect(comment.querySelector(".annotation-markdown-rendered")?.innerHTML).toBe("<p>**BOLD**</p>");
    controller.stop();
  });

  test("waits for Zotero reader readiness before the first render pass", async () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const render = vi.fn((source) => `<p>${source}</p>`);
    let resolveReady;
    const controller = createReaderController({
      reader: {
        document,
        _waitForReader: () => new Promise((resolve) => { resolveReady = resolve; })
      },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: undefined
    });

    const startPromise = controller.start();
    expect(render).not.toHaveBeenCalled();
    resolveReady();
    await startPromise;

    expect(render).toHaveBeenCalledWith("**bold**");
  });

  test("runs a synchronous scan when annotation comment nodes are added", async () => {
    const callbacks = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
      callbacks.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn() };
    });
    document.body.innerHTML = `<div id="root"></div>`;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver
    });

    await controller.start();
    const added = document.createElement("div");
    added.innerHTML = `<div data-annotation-id="a1"><div class="comment">**new**</div></div>`;
    document.querySelector("#root").append(added);
    callbacks[0]([{ addedNodes: [added], target: document.querySelector("#root") }]);

    expect(render).toHaveBeenCalledWith("**new**");
  });

  test("ignores unrelated reader mutations while scrolling PDF pages", async () => {
    vi.useFakeTimers();
    const callbacks = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
      callbacks.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn() };
    });
    document.body.innerHTML = `
      <div id="root">
        <div data-annotation-id="a1"><div class="comment">$a^2$</div></div>
        <div class="pdf-pages"></div>
      </div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver
    });

    await controller.start();
    const page = document.createElement("div");
    page.className = "page";
    document.querySelector(".pdf-pages").append(page);
    callbacks[0]([{ type: "childList", addedNodes: [page], target: document.querySelector(".pdf-pages") }]);
    vi.runAllTimers();

    expect(render).toHaveBeenCalledTimes(1);

    controller.stop();
    vi.useRealTimers();
  });

  test("does not rerender unchanged comments during repeated scans", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">$a^2$</div></div>`;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: {
        isEnabled: () => true,
        isMathEnabled: () => true
      },
      MutationObserver: undefined
    });

    controller.renderNow();
    controller.renderNow();

    expect(render).toHaveBeenCalledTimes(1);
  });

  test("logs render pass diagnostics", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const log = vi.fn();
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: { isEnabled: () => true },
      MutationObserver: window.MutationObserver,
      logger: { log }
    });

    controller.renderNow();

    expect(log).toHaveBeenCalledWith("[annotation-markdown] render pass nodes: 1");
  });

  test("logs matched node previews when nodes are found", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const log = vi.fn();
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: { isEnabled: () => true },
      MutationObserver: window.MutationObserver,
      logger: { log }
    });

    controller.renderNow();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[annotation-markdown] matched nodes:")
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("**bold**"));
  });

  test("logs a DOM summary when no comment nodes are found", () => {
    document.body.innerHTML = `
      <div class="sidebar annotations-pane">
        <div class="reader-annotation" data-id="a1">**bold**</div>
      </div>
    `;
    const log = vi.fn();
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: { isEnabled: () => true },
      MutationObserver: window.MutationObserver,
      logger: { log }
    });

    controller.renderNow();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[annotation-markdown] zero-node DOM summary:")
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("reader-annotation"));
  });

  test("disabled settings restore rendered source text and skip rendering", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const adapter = createAnnotationSidebarAdapter({ document });
    const node = document.querySelector(".comment");
    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: vi.fn() },
      settings: { isEnabled: () => false },
      MutationObserver: window.MutationObserver
    });

    controller.renderNow();

    expect(node.textContent).toBe("**bold**");
    expect(adapter.isRendered(node)).toBe(false);
  });

  test("rerenders edited source text after editing loses focus", () => {
    const requestAnimationFrame = globalThis.requestAnimationFrame;
    const callbacks = [];
    globalThis.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };

    try {
      document.body.innerHTML = `<div data-annotation-id="a1" class="annotation selected"><div class="comment"><div class="content" tabindex="0">**bold**</div></div></div>`;
      const adapter = createAnnotationSidebarAdapter({ document });
      const controller = createReaderController({
        reader: { document },
        adapter,
        renderer: { render: (source) => `<p>${source.toUpperCase()}</p>` },
        settings: { isEnabled: () => true },
        MutationObserver: undefined
      });

      controller.renderNow();
      const comment = document.querySelector(".comment");
      const content = comment.querySelector(".content");
      comment.querySelector(".annotation-markdown-rendered").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      callbacks[0]();

      content.textContent = "**changed**";
      content.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      controller.renderNow();

      expect(content.hidden).toBe(true);
      expect(comment.querySelector(".annotation-markdown-rendered")?.hidden).toBe(false);
      expect(comment.querySelector(".annotation-markdown-rendered")?.innerHTML).toBe("<p>**CHANGED**</p>");
    } finally {
      globalThis.requestAnimationFrame = requestAnimationFrame;
    }
  });

  test("disconnects the mutation observer on stop", () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    const FakeMutationObserver = vi.fn(function FakeMutationObserver() {
      return { observe, disconnect };
    });
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver
    });

    controller.start();
    controller.stop();

    expect(observe).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  test("injects and removes reader styles from provided css text", () => {
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: { isEnabled: () => true },
      MutationObserver: window.MutationObserver,
      styleText: ".annotation-markdown-rendered { line-height: inherit; }"
    });

    controller.start();

    const style = document.querySelector("style[data-annotation-markdown-style='true']");
    expect(style?.textContent).toContain("annotation-markdown-rendered");

    controller.stop();

    expect(document.querySelector("style[data-annotation-markdown-style='true']")).toBeNull();
  });

  test("injects markdown preview font scale as a css variable", () => {
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: {
        isEnabled: () => true,
        getFontScale: () => 1.2
      },
      MutationObserver: window.MutationObserver,
      styleText: ".annotation-markdown-rendered { line-height: inherit; }"
    });

    controller.start();

    const style = document.querySelector("style[data-annotation-markdown-style='true']");
    expect(style?.textContent).toContain("--annotation-markdown-font-scale: 1.2em");

    controller.stop();
  });

  test("refresh updates injected styles with current font scale", () => {
    let fontScale = 1;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: {
        isEnabled: () => true,
        getFontScale: () => fontScale
      },
      MutationObserver: window.MutationObserver,
      styleText: ".annotation-markdown-rendered { font-size: var(--annotation-markdown-font-scale, 1em); }"
    });

    controller.start();
    fontScale = 1.2;
    controller.refresh();

    const style = document.querySelector("style[data-annotation-markdown-style='true']");
    expect(style?.textContent).toContain("--annotation-markdown-font-scale: 1.2em");

    controller.stop();
  });

  test("pastes plain text only inside annotation comment editors", async () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1">
        <div class="comment"><div class="content" contenteditable="true"></div></div>
      </div>
      <input id="outside">
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: {
        isEnabled: () => true,
        isPlainTextPasteEnabled: () => true
      },
      MutationObserver: undefined
    });

    await controller.start();

    const content = document.querySelector(".content");
    const annotationPaste = createPasteEvent("line 1\nline 2");
    content.dispatchEvent(annotationPaste);

    const outsidePaste = createPasteEvent("outside");
    document.querySelector("#outside").dispatchEvent(outsidePaste);

    expect(annotationPaste.defaultPrevented).toBe(true);
    expect(content.textContent).toBe("line 1\nline 2");
    expect(outsidePaste.defaultPrevented).toBe(false);

    controller.stop();
  });

  test("does not intercept annotation paste when plain text paste is disabled", async () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1">
        <div class="comment"><div class="content" contenteditable="true"></div></div>
      </div>
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: {
        isEnabled: () => true,
        isPlainTextPasteEnabled: () => false
      },
      MutationObserver: undefined
    });

    await controller.start();

    const paste = createPasteEvent("line 1\nline 2");
    document.querySelector(".content").dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(false);

    controller.stop();
  });

  test("clears stale adapter state before rendering on start", async () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const clearRenderedState = vi.fn();
    const adapter = {
      ...createAnnotationSidebarAdapter({ document }),
      clearRenderedState
    };
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: undefined
    });

    await controller.start();

    expect(clearRenderedState).toHaveBeenCalledWith(document.body);
  });

  test("one broken annotation does not stop other annotations from rendering", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1"><div class="comment">bad</div></div>
      <div data-annotation-id="a2"><div class="comment">good</div></div>
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: {
        render(source) {
          if (source === "bad") {
            throw new Error("broken");
          }
          return `<p>${source}</p>`;
        }
      },
      settings: { isEnabled: () => true },
      MutationObserver: window.MutationObserver
    });

    controller.renderNow();

    expect(document.querySelectorAll(".comment")[0].textContent).toBe("bad");
    expect(document.querySelectorAll(".comment")[1].querySelector(".annotation-markdown-rendered")?.innerHTML).toBe("<p>good</p>");
  });
});

function createPasteEvent(text) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: vi.fn((type) => (type === "text/plain" ? text : ""))
    }
  });
  return event;
}
