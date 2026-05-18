import { describe, expect, test } from "vitest";

import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.js";

describe("createAnnotationSidebarAdapter", () => {
  test("finds candidate annotation comment display nodes", () => {
    document.body.innerHTML = `
      <div id="root">
        <div data-annotation-id="a1"><div class="comment">**bold**</div></div>
        <div data-annotation-id="a2"><div class="annotation-comment">plain</div></div>
        <div data-annotation-id="a3"><div data-annotation-comment>third</div></div>
        <div class="comment">outside annotation</div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });

    const nodes = adapter.findCommentNodes(document.querySelector("#root"));

    expect(nodes).toHaveLength(3);
    expect(nodes.map((node) => node.textContent)).toEqual(["**bold**", "plain", "third"]);
  });

  test("finds Zotero 9 reader annotation renderer nodes", () => {
    document.body.innerHTML = `
      <div class="annotations">
        <div class="annotation">
          <div class="preview expanded0">
            <div class="text">
              <div class="blockquote-border"></div>
              <div class="expandable-editor">
                <div class="editor-view">
                  <div class="editor read-only">
                    <div class="content">
                      <div class="renderer">**bold**</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });

    const nodes = adapter.findCommentNodes(document.body);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].className).toBe("renderer");
    expect(nodes[0].textContent).toBe("**bold**");
  });

  test("skips editable nodes and nodes inside active editors", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1"><textarea class="comment">editing</textarea></div>
      <div data-annotation-id="a2"><div class="comment" contenteditable="true">editing</div></div>
      <div data-annotation-id="a3"><div class="comment"><input value="editing"></div></div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });

    expect(adapter.findCommentNodes(document.body)).toHaveLength(0);
  });

  test("marks rendered nodes and keeps the original source text", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment"><div class="content">**bold**</div></div></div>`;
    const node = document.querySelector(".comment");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");

    expect(adapter.isRendered(node)).toBe(true);
    expect(adapter.getSourceText(node)).toBe("**bold**");
    expect(node.querySelector(".content")?.textContent).toBe("**bold**");
    expect(node.querySelector(".annotation-markdown-rendered")?.innerHTML).toBe("<p><strong>bold</strong></p>");
  });

  test("reads source from nested content without Zotero editor toolbar text", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1">
        <div class="comment">
          <div class="editor-shell">
            <div class="toolbar"><button>B</button><button>I</button><button>X2</button><button>X2</button><button>Tx</button></div>
            <div class="content"># 你好呀<br>## 为什么呢?</div>
          </div>
        </div>
      </div>
    `;
    const node = document.querySelector(".comment");
    const adapter = createAnnotationSidebarAdapter({ document });

    expect(adapter.getSourceText(node)).toBe("# 你好呀\n## 为什么呢?");
  });

  test("hides nested source content when rendered preview is shown", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1">
        <div class="comment">
          <div class="editor-shell">
            <div class="toolbar"><button>B</button><button>I</button><button>X2</button><button>X2</button><button>Tx</button></div>
            <div class="content"># 你好呀<br>## 为什么呢?</div>
          </div>
        </div>
      </div>
    `;
    const node = document.querySelector(".comment");
    const content = document.querySelector(".content");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<h1>你好呀</h1><h2>为什么呢?</h2>");

    expect(content.hidden).toBe(true);
    expect(content.style.display).toBe("none");
    expect(content.nextElementSibling?.className).toBe("annotation-markdown-rendered");
    expect(node.querySelector(".annotation-markdown-rendered")?.innerHTML).toBe("<h1>你好呀</h1><h2>为什么呢?</h2>");
  });

  test("does not overwrite original source text when rendering twice", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment"><div class="content">**bold**</div></div></div>`;
    const node = document.querySelector(".comment");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
    adapter.applyRenderedHtml(node, "<p><strong>changed</strong></p>");

    expect(adapter.getSourceText(node)).toBe("**bold**");
    expect(node.querySelector(".annotation-markdown-rendered")?.innerHTML).toBe("<p><strong>changed</strong></p>");
  });

  test("restores original source text", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment"><div class="content">**bold**</div></div></div>`;
    const node = document.querySelector(".comment");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
    adapter.restoreSourceText(node);

    expect(adapter.isRendered(node)).toBe(false);
    expect(node.querySelector(".content")?.textContent).toBe("**bold**");
    expect(document.querySelector(".annotation-markdown-rendered")).toBeNull();
  });

  test("clears stale preview markers left by a previous plugin instance", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1">
        <div class="comment annotation-markdown-editing" data-annotation-markdown-rendered="true" data-annotation-markdown-source="**old**" data-annotation-markdown-suppress-until="9999999999999">
          <div class="content" hidden>**new**</div>
          <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true"><p>old</p></div>
        </div>
      </div>
    `;
    const node = document.querySelector(".comment");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.clearRenderedState(document.body);

    expect(node.classList.contains("annotation-markdown-editing")).toBe(false);
    expect(node.hasAttribute("data-annotation-markdown-rendered")).toBe(false);
    expect(node.hasAttribute("data-annotation-markdown-source")).toBe(false);
    expect(node.hasAttribute("data-annotation-markdown-suppress-until")).toBe(false);
    expect(node.querySelector(".content")?.hidden).toBe(false);
    expect(node.querySelector(".annotation-markdown-rendered")).toBeNull();
  });

  test("preview click on an unselected annotation lets Zotero select the row first", () => {
    document.body.innerHTML = `<div data-annotation-id="a1" class="annotation"><div class="comment"><div class="content" tabindex="0">**bold**</div></div></div>`;
    const node = document.querySelector(".comment");
    const content = node.querySelector(".content");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
    node.querySelector(".annotation-markdown-rendered").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(node.classList.contains("annotation-markdown-editing")).toBe(false);
    expect(document.activeElement).not.toBe(content);
    expect(content.hidden).toBe(true);
    expect(node.querySelector(".annotation-markdown-rendered")?.hidden).toBe(false);
  });

  test("preview click on a selected annotation focuses source on the next frame", () => {
    const requestAnimationFrame = globalThis.requestAnimationFrame;
    const callbacks = [];
    globalThis.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };

    try {
      document.body.innerHTML = `<div data-annotation-id="a1" class="annotation selected"><div class="comment"><div class="content" tabindex="0">**bold**</div></div></div>`;
      const node = document.querySelector(".comment");
      const content = node.querySelector(".content");
      const adapter = createAnnotationSidebarAdapter({ document });

      adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
      node.querySelector(".annotation-markdown-rendered").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      expect(node.classList.contains("annotation-markdown-editing")).toBe(true);
      expect(document.activeElement).not.toBe(content);
      expect(node.querySelector(".annotation-markdown-rendered")?.hidden).toBe(true);
      expect(node.querySelector(".annotation-markdown-rendered")?.style.display).toBe("none");
      expect(callbacks).toHaveLength(1);

      callbacks[0]();

      expect(document.activeElement).toBe(content);
    } finally {
      globalThis.requestAnimationFrame = requestAnimationFrame;
    }
  });

  test("preview click in a popup focuses source even without selected annotation row", () => {
    const requestAnimationFrame = globalThis.requestAnimationFrame;
    const callbacks = [];
    globalThis.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };

    try {
      document.body.innerHTML = `<div class="annotation-popup"><div class="comment"><div class="content" tabindex="0">**bold**</div></div></div>`;
      const node = document.querySelector(".comment");
      const content = node.querySelector(".content");
      const adapter = createAnnotationSidebarAdapter({ document });

      adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
      node.querySelector(".annotation-markdown-rendered").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      expect(node.classList.contains("annotation-markdown-editing")).toBe(true);
      callbacks[0]();
      expect(document.activeElement).toBe(content);
      expect(content.textContent).toBe("**bold**");
      expect(adapter.isRendered(node)).toBe(true);
    } finally {
      globalThis.requestAnimationFrame = requestAnimationFrame;
    }
  });

  test("makes comments renderable again after focus leaves even if focusout was missed", () => {
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1"><div class="comment"><div class="content" tabindex="0">**bold**</div></div></div>
    `;
    const node = document.querySelector(".comment");
    const content = node.querySelector(".content");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
    node.querySelector(".annotation-markdown-rendered").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    content.textContent = "**changed**";
    document.querySelector("#outside").focus();
    node.classList.add("annotation-markdown-editing");
    node.setAttribute("data-annotation-markdown-suppress-until", String(Date.now() + 1000));
    node.setAttribute("data-annotation-markdown-source", "**bold**");
    const nodes = adapter.findCommentNodes(document.body);

    expect(nodes).toEqual([node]);
    expect(node.classList.contains("annotation-markdown-editing")).toBe(false);
    expect(adapter.getSourceText(node)).toBe("**changed**");
  });

  test("does not re-render while focus remains inside the comment content", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" tabindex="0">**bold**</div></div>
      </div>
    `;
    const node = document.querySelector(".comment");
    const content = node.querySelector(".content");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
    node.querySelector(".annotation-markdown-rendered").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    content.focus();

    expect(adapter.findCommentNodes(document.body)).toHaveLength(0);
    expect(node.classList.contains("annotation-markdown-editing")).toBe(true);
    expect(node.querySelector(".annotation-markdown-rendered")?.hidden).toBe(true);
    expect(node.querySelector(".annotation-markdown-rendered")?.style.display).toBe("none");
  });
});
