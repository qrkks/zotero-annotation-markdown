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

    expect(document.querySelector(".comment").hidden).toBe(true);
    expect(document.querySelector(".annotation-markdown-rendered").innerHTML).toBe("<p>**BOLD**</p>");
    controller.stop();
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

  test("injects and removes reader styles", () => {
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
    expect(document.querySelectorAll(".comment")[1].nextElementSibling.innerHTML).toBe("<p>good</p>");
  });
});
