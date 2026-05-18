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
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const node = document.querySelector(".comment");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");

    expect(adapter.isRendered(node)).toBe(true);
    expect(adapter.getSourceText(node)).toBe("**bold**");
    expect(node.hidden).toBe(true);
    expect(node.nextElementSibling?.className).toBe("annotation-markdown-rendered");
    expect(node.nextElementSibling?.innerHTML).toBe("<p><strong>bold</strong></p>");
  });

  test("does not overwrite original source text when rendering twice", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const node = document.querySelector(".comment");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
    adapter.applyRenderedHtml(node, "<p><strong>changed</strong></p>");

    expect(adapter.getSourceText(node)).toBe("**bold**");
    expect(node.nextElementSibling?.innerHTML).toBe("<p><strong>changed</strong></p>");
  });

  test("restores original source text", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const node = document.querySelector(".comment");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
    adapter.restoreSourceText(node);

    expect(adapter.isRendered(node)).toBe(false);
    expect(node.hidden).toBe(false);
    expect(node.textContent).toBe("**bold**");
    expect(document.querySelector(".annotation-markdown-rendered")).toBeNull();
  });

  test("restores source and suppresses rerender when a rendered node is pressed for editing", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const node = document.querySelector(".comment");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
    node.nextElementSibling.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(node.textContent).toBe("**bold**");
    expect(node.hidden).toBe(false);
    expect(adapter.isRendered(node)).toBe(false);
    expect(adapter.findCommentNodes(document.body)).toHaveLength(0);
  });
});
