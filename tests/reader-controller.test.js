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
