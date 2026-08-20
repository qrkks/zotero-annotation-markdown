import { describe, expect, test, vi } from "vitest";

import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";

describe("createAnnotationSidebarAdapter", () => {
  test("commits a fast editor draft on blur through the annotation update callback", () => {
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="true">**old**</div>
          </div>
        </div>
      </div>
    `;
    const content = document.querySelector(".content");
    const input = vi.fn();
    const commitComment = vi.fn(() => true);
    content.addEventListener("input", input);
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment
    });
    const comment = document.querySelector(".comment");

    adapter.applyRenderedHtml(comment, "<strong>old</strong>");
    comment.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    const editor = comment.querySelector("[data-annotation-markdown-fast-editor='true']");
    const textarea = editor.querySelector("textarea");
    textarea.value = "**new**\n\nsecond line";
    textarea.focus();
    document.querySelector("#outside").focus();

    expect(content.textContent).toBe("**old**");
    expect(input).not.toHaveBeenCalled();
    expect(commitComment).toHaveBeenCalledWith("a1", "**new**\n\nsecond line");
    expect(comment.getAttribute("data-annotation-markdown-source")).toBe("**new**\n\nsecond line");
    expect(comment.querySelector("[data-annotation-markdown-fast-editor='true']")).toBeNull();
    expect(editor.querySelector("button")).toBeNull();
  });

  test("saves a fast editor draft when Escape is pressed", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="true">**old**</div>
          </div>
        </div>
      </div>
    `;
    const content = document.querySelector(".content");
    const input = vi.fn();
    const commitComment = vi.fn(() => true);
    content.addEventListener("input", input);
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment
    });
    const comment = document.querySelector(".comment");

    adapter.applyRenderedHtml(comment, "<strong>old</strong>");
    comment.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    const editor = comment.querySelector("[data-annotation-markdown-fast-editor='true']");
    const textarea = editor.querySelector("textarea");
    textarea.value = "save me";
    textarea.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape"
    }));

    expect(content.textContent).toBe("**old**");
    expect(input).not.toHaveBeenCalled();
    expect(commitComment).toHaveBeenCalledWith("a1", "save me");
    expect(comment.querySelector("[data-annotation-markdown-fast-editor='true']")).toBeNull();
  });

  test.each(["Backspace", "Delete"])(
    "keeps %s inside the fast editor despite Zotero's window capture shortcut",
    (key) => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content">draft</div></div>
      </div>
    `;
    let nativeCommentDeletionEnabled = true;
    const deleteAnnotation = vi.fn();
    const hostKeyDown = (event) => {
      if (!["Backspace", "Delete"].includes(event.key)) {
        return;
      }
      if (event.target.closest(".content") && !nativeCommentDeletionEnabled) {
        return;
      }
      deleteAnnotation();
      event.preventDefault();
    };
    window.addEventListener("keydown", hostKeyDown, true);
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment: vi.fn(() => true),
      beginFastEditorKeyboardGuard: () => {
        const previous = nativeCommentDeletionEnabled;
        nativeCommentDeletionEnabled = false;
        return () => { nativeCommentDeletionEnabled = previous; };
      }
    });
    const comment = document.querySelector(".comment");
    adapter.applyRenderedHtml(comment, "<p>draft</p>");
    comment.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    const textarea = comment.querySelector("textarea");
    textarea.focus();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key
    });

    textarea.dispatchEvent(event);

    expect(textarea.classList).toContain("content");
    expect(deleteAnnotation).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    textarea.blur();
    expect(nativeCommentDeletionEnabled).toBe(true);
    window.removeEventListener("keydown", hostKeyDown, true);
  });

  test.each(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"])(
    "keeps %s available for textarea caret movement",
    (key) => {
      document.body.innerHTML = `
        <button id="outside">outside</button>
        <div data-annotation-id="a1" class="annotation selected">
          <div class="comment"><div class="content">draft</div></div>
        </div>
      `;
      const navigateReader = vi.fn();
      const hostKeyDown = (event) => {
        const content = document.activeElement?.closest(".comment .content");
        if (key === event.key && content && !content.innerText) {
          navigateReader();
          document.querySelector("#outside").focus();
        }
        if (
          key === event.key &&
          !event.target.closest('[contenteditable], input[type="text"], .preview-popup')
        ) {
          event.preventDefault();
        }
      };
      window.addEventListener("keydown", hostKeyDown, true);
      const adapter = createAnnotationSidebarAdapter({
        document,
        isFastEditorEnabled: () => true,
        commitComment: vi.fn(() => true)
      });
      const comment = document.querySelector(".comment");
      adapter.applyRenderedHtml(comment, "<p>draft</p>");
      comment.querySelector(".annotation-markdown-rendered")
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      const textarea = comment.querySelector("textarea");
      textarea.focus();
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key
      });

      textarea.dispatchEvent(event);

      expect(navigateReader).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(textarea);
      window.removeEventListener("keydown", hostKeyDown, true);
    }
  );

  test("keeps the annotation identity when Zotero refreshes an empty editor while it is open", () => {
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="false" placeholder="Add comment"></div>
            <div class="renderer"></div>
          </div>
        </div>
      </div>
    `;
    const commitComment = vi.fn(() => true);
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment
    });
    const row = document.querySelector(".annotation");
    const comment = document.querySelector(".comment");

    adapter.tryShowFastEditorForTarget(document.querySelector(".renderer"));
    const textarea = comment.querySelector("textarea");
    textarea.value = "saved after refresh";
    textarea.focus();

    row.removeAttribute("data-sidebar-annotation-id");
    comment.querySelector(".expandable-editor").replaceWith(
      Object.assign(document.createElement("div"), {
        className: "expandable-editor",
        innerHTML: '<div class="content" placeholder="Add comment"></div><div class="renderer"></div>'
      })
    );
    document.querySelector("#outside").focus();

    expect(commitComment).toHaveBeenCalledWith("a1", "saved after refresh");
    expect(comment.querySelector("[data-annotation-markdown-fast-editor='true']")).toBeNull();
  });

  test("uses a taller auto-growing editor for existing text but keeps an empty draft compact", () => {
    document.body.innerHTML = `
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content">existing text</div></div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment: vi.fn(() => true)
    });
    const comment = document.querySelector(".comment");
    adapter.applyRenderedHtml(comment, "<p>existing text</p>");
    comment.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(comment.querySelector("textarea").rows).toBe(3);

    document.body.innerHTML = `
      <div data-sidebar-annotation-id="a2" class="annotation selected">
        <div class="comment"><div class="expandable-editor"><div class="content" placeholder="Add comment"></div><div class="renderer"></div></div></div>
      </div>
    `;
    const emptyAdapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment: vi.fn(() => true)
    });
    emptyAdapter.tryShowFastEditorForTarget(document.querySelector(".renderer"));

    expect(document.querySelector("textarea").rows).toBe(1);
  });

  test("does not notify Zotero when a fast editor closes without changes", () => {
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="true">unchanged</div>
          </div>
        </div>
      </div>
    `;
    const content = document.querySelector(".content");
    const input = vi.fn();
    content.addEventListener("input", input);
    const commitComment = vi.fn(() => true);
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment
    });
    const comment = document.querySelector(".comment");
    adapter.applyRenderedHtml(comment, "<p>unchanged</p>");
    comment.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    comment.querySelector("textarea").focus();
    document.querySelector("#outside").focus();

    expect(input).not.toHaveBeenCalled();
    expect(commitComment).not.toHaveBeenCalled();
    expect(content.textContent).toBe("unchanged");
  });

  test("stops selected preview pointerdown before Zotero can open its native editor", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="true">**old**</div>
          </div>
        </div>
      </div>
    `;
    const hostPointerDown = vi.fn();
    document.querySelector(".annotation").addEventListener("pointerdown", hostPointerDown);
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment: vi.fn(() => true)
    });
    const comment = document.querySelector(".comment");
    adapter.applyRenderedHtml(comment, "<strong>old</strong>");

    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    comment.querySelector(".annotation-markdown-rendered").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(hostPointerDown).not.toHaveBeenCalled();
    expect(comment.querySelector("[data-annotation-markdown-fast-editor='true']")).not.toBeNull();
  });

  test("does not open the fast editor before Zotero selects the annotation row", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="true">**old**</div>
          </div>
        </div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment: vi.fn(() => true)
    });
    const comment = document.querySelector(".comment");

    adapter.applyRenderedHtml(comment, "<strong>old</strong>");
    document.querySelector(".annotation").classList.remove("selected");
    comment.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(comment.querySelector("[data-annotation-markdown-fast-editor='true']")).toBeNull();
  });

  test("cleans a fast editor and restores Zotero source on plugin reset", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="true">**old**</div>
          </div>
        </div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment: vi.fn(() => true)
    });
    const comment = document.querySelector(".comment");

    adapter.applyRenderedHtml(comment, "<strong>old</strong>");
    comment.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    adapter.clearRenderedState(document);

    expect(comment.querySelector("[data-annotation-markdown-fast-editor='true']")).toBeNull();
    expect(document.querySelector(".content").hidden).toBe(false);
    expect(comment.classList.contains("annotation-markdown-editing")).toBe(false);
  });

  test("opens before Zotero marks the native content as editable", () => {
    document.body.innerHTML = `
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="false">early hook</div>
            <div class="renderer">early hook</div>
          </div>
        </div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment: vi.fn(() => true)
    });
    const comment = document.querySelector(".comment");
    adapter.applyRenderedHtml(comment, "<p>early hook</p>");

    comment.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

    expect(comment.querySelector("[data-annotation-markdown-fast-editor='true']")).not.toBeNull();
    expect(document.querySelector(".content").getAttribute("contenteditable")).toBe("false");
  });

  test("grows the fast editor with its content instead of fixing its height", () => {
    document.body.innerHTML = `
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" contenteditable="false">text</div></div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment: vi.fn(() => true)
    });
    const comment = document.querySelector(".comment");
    adapter.applyRenderedHtml(comment, "<p>text</p>");
    comment.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    const textarea = comment.querySelector("textarea");
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 120 });

    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: "more" }));

    expect(textarea.style.height).toBe("120px");
  });

  test("keeps a visible sidebar annotation fixed when direct editing changes its layout", () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const callbacks = [];
    window.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };
    document.body.innerHTML = `
      <div id="annotationsView" style="height: 200px; overflow-y: auto">
        <div id="annotations" style="height: 100px; overflow-y: hidden">
          <div data-sidebar-annotation-id="a1" class="annotation selected">
            <div class="comment">
              <div class="expandable-editor">
                <div class="content" contenteditable="false">a long comment</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const scroller = document.querySelector("#annotationsView");
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 2000 }
    });
    scroller.scrollTop = 420;
    scroller.scrollLeft = 0;
    scroller.scrollTo = vi.fn(({ top, left }) => {
      scroller.scrollTop = top;
      scroller.scrollLeft = left;
    });
    const hiddenWrapper = document.querySelector("#annotations");
    Object.defineProperties(hiddenWrapper, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 2000 }
    });
    hiddenWrapper.scrollTo = vi.fn(({ top, left }) => {
      hiddenWrapper.scrollTop = top;
      hiddenWrapper.scrollLeft = left;
    });
    const row = document.querySelector(".annotation");
    let rowTop = -40;
    row.getBoundingClientRect = () => ({
      top: rowTop,
      bottom: rowTop + 60,
      left: 0,
      right: 200,
      width: 200,
      height: 60,
      x: 0,
      y: rowTop,
      toJSON: () => ({})
    });
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment: vi.fn(() => true)
    });

    try {
      adapter.tryShowFastEditorForTarget(document.querySelector(".content"));
      callbacks.shift()(0);
      // In a heavy sidebar, native focus/layout anchoring can move the row one
      // frame after the fast editor itself has finished layout.
      rowTop = -120;
      scroller.scrollTop = 500;
      callbacks.shift()(16);

      expect(scroller.scrollTo).toHaveBeenCalledWith({
        behavior: "instant",
        left: 0,
        top: 420
      });
      expect(scroller.scrollTop).toBe(420);
    } finally {
      adapter.clearRenderedState(document);
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  test("does not block Zotero from locating an offscreen annotation", () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const callbacks = [];
    window.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };
    document.body.innerHTML = `
      <div id="annotationsView" style="height: 200px; overflow-y: auto">
        <div data-sidebar-annotation-id="a1" class="annotation selected">
          <div class="comment"><div class="content" contenteditable="true">offscreen</div></div>
        </div>
      </div>
    `;
    const scroller = document.querySelector("#annotationsView");
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 2000 }
    });
    scroller.scrollTo = vi.fn();
    const row = document.querySelector(".annotation");
    row.getBoundingClientRect = () => ({
      top: 500,
      bottom: 560,
      left: 0,
      right: 200,
      width: 200,
      height: 60,
      x: 0,
      y: 500,
      toJSON: () => ({})
    });
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment: vi.fn(() => true)
    });

    try {
      adapter.tryShowFastEditorForAnnotationID("a1");
      callbacks.shift()(0);

      expect(scroller.scrollTo).not.toHaveBeenCalled();
    } finally {
      adapter.clearRenderedState(document);
      window.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

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

  test("finds Zotero 9 reader annotation comment nodes without matching internal renderers", () => {
    document.body.innerHTML = `
      <div class="annotations">
        <div class="annotation">
          <div class="preview expanded0">
            <div class="comment">
              <div class="expandable-editor">
                <div class="editor-view">
                  <div class="editor read-only">
                    <div class="content">**bold**</div>
                    <div class="renderer"></div>
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
    expect(nodes[0].className).toBe("comment");
    expect(adapter.getSourceText(nodes[0])).toBe("**bold**");
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

  test("renders a selected Zotero comment whose dormant editor has no focus", () => {
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="true">**selected**</div>
          </div>
        </div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });
    const content = document.querySelector(".content");

    expect(adapter.findCommentNodes(document.body)).toEqual([document.querySelector(".comment")]);

    content.focus();

    expect(adapter.findCommentNodes(document.body)).toHaveLength(0);
  });

  test("skips Zotero native note editor comments even when nested inside annotation UI", () => {
    document.body.innerHTML = `
      <div class="annotation selected">
        <div class="note-editor">
          <div class="comment">
            <div class="ProseMirror content" contenteditable="true">native note text</div>
          </div>
        </div>
        <div class="comment"><div class="content">**annotation**</div></div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });

    const nodes = adapter.findCommentNodes(document.body);

    expect(nodes).toHaveLength(1);
    expect(adapter.getSourceText(nodes[0])).toBe("**annotation**");
  });

  test("does not treat Zotero native note editor targets as annotation comment editors", () => {
    document.body.innerHTML = `
      <div class="annotation selected">
        <div class="note-editor">
          <div class="comment">
            <div class="ProseMirror content" contenteditable="true">native note text</div>
          </div>
        </div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });

    expect(adapter.getCommentNodeForTarget(document.querySelector(".ProseMirror"))).toBeNull();
    expect(adapter.isCommentEditorTarget(document.querySelector(".ProseMirror"))).toBe(false);
  });

  test("counts skipped native note editor comments for diagnostics", () => {
    document.body.innerHTML = `
      <div class="annotation selected">
        <div class="note-editor"><div class="comment">native note</div></div>
        <div class="comment">annotation comment</div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });

    expect(adapter.countNativeNoteEditorComments(document.body)).toBe(1);
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

  test("hides the Zotero reader editor shell when rendered preview is shown", () => {
    document.body.innerHTML = `
      <div class="annotations">
        <div class="annotation">
          <div class="preview expanded0">
            <div class="comment">
              <div class="expandable-editor">
                <div class="editor-view">
                  <div class="editor read-only">
                    <div class="content"># 不断收缩的领域<br>先给结论：**拓扑相似**。</div>
                    <div class="renderer"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    const node = document.querySelector(".comment");
    const sourceShell = document.querySelector(".expandable-editor");
    const content = document.querySelector(".content");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<h1>不断收缩的领域</h1><p>先给结论：<strong>拓扑相似</strong>。</p>");

    expect(adapter.getSourceText(node)).toBe("# 不断收缩的领域\n先给结论：**拓扑相似**。");
    expect(sourceShell.hidden).toBe(true);
    expect(sourceShell.style.display).toBe("none");
    expect(content.hidden).toBe(false);
    expect(sourceShell.nextElementSibling?.className).toBe("annotation-markdown-rendered");
    expect(node.querySelector(".annotation-markdown-rendered")?.innerHTML)
      .toBe("<h1>不断收缩的领域</h1><p>先给结论：<strong>拓扑相似</strong>。</p>");
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

  test("releases complex rendered DOM into a lightweight source placeholder", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment"><div class="content">**bold** and $x$</div></div></div>`;
    const node = document.querySelector(".comment");
    const content = document.querySelector(".content");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong> and <span class='katex'><span>math</span></span></p>");
    adapter.releaseRenderedHtml(node);

    const placeholder = node.querySelector("[data-annotation-markdown-preview='true']");
    expect(adapter.isRendered(node)).toBe(false);
    expect(placeholder?.getAttribute("data-annotation-markdown-placeholder")).toBe("true");
    expect(placeholder?.textContent).toBe("**bold** and $x$");
    expect(placeholder?.querySelector(".katex")).toBeNull();
    expect(content.hidden).toBe(true);

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong> and <span class='katex'>math</span></p>");

    expect(adapter.isRendered(node)).toBe(true);
    expect(placeholder?.hasAttribute("data-annotation-markdown-placeholder")).toBe(false);
    expect(placeholder?.querySelector(".katex")?.textContent).toBe("math");
  });

  test("temporarily detaches and restores the exact rendered preview DOM", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment"><div class="content">**bold** and $x$</div></div></div>`;
    const node = document.querySelector(".comment");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<p><strong>bold</strong> and <span class='katex'><span>math</span></span></p>");
    const preview = node.querySelector("[data-annotation-markdown-preview='true']");
    const mathNode = preview.querySelector(".katex");

    const suspendedPreview = adapter.suspendRenderedDom(node);

    expect(suspendedPreview).toBe(preview);
    expect(preview.isConnected).toBe(false);
    expect(adapter.isRendered(node)).toBe(false);
    expect(node.querySelector("[data-annotation-markdown-placeholder='true']")?.textContent)
      .toBe("**bold** and $x$");

    expect(adapter.restoreSuspendedRenderedDom(node, suspendedPreview)).toBe(true);
    expect(node.querySelector("[data-annotation-markdown-preview='true']")).toBe(preview);
    expect(preview.querySelector(".katex")).toBe(mathNode);
    expect(adapter.isRendered(node)).toBe(true);
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

  test("preserves native source DOM structure when restoring editing", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1">
        <div class="comment">
          <div class="content" tabindex="0"># Title<br>line 2<br><br>- item</div>
        </div>
      </div>
    `;
    const node = document.querySelector(".comment");
    const content = document.querySelector(".content");
    const adapter = createAnnotationSidebarAdapter({ document });

    adapter.applyRenderedHtml(node, "<h1>Title</h1><p>line 2</p><ul><li>item</li></ul>");
    adapter.restoreSourceDomForEditing(node);

    expect(adapter.isRendered(node)).toBe(false);
    expect(node.hasAttribute("data-annotation-markdown-source")).toBe(false);
    expect(node.querySelector(".annotation-markdown-rendered")).toBeNull();
    expect(content.hidden).toBe(false);
    expect(content.textContent).toBe("# Titleline 2- item");
    expect(content.innerHTML).toBe("# Title<br>line 2<br><br>- item");
    expect(content.style.whiteSpace).toBe("");
  });

  test("clears stale preview markers left by a previous plugin instance", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1">
        <div class="comment annotation-markdown-editing" data-annotation-markdown-rendered="true" data-annotation-markdown-source="**old**" data-annotation-markdown-suppress-until="9999999999999">
          <div class="content" hidden>**new**</div>
          <div class="annotation-markdown-rendered"><p>old</p></div>
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

  test("first click on a link opens it without selecting or editing the annotation", () => {
    document.body.innerHTML = `<div data-annotation-id="a1" class="annotation"><div class="comment"><div class="content" tabindex="0">https://example.com</div></div></div>`;
    const row = document.querySelector(".annotation");
    const node = document.querySelector(".comment");
    const content = node.querySelector(".content");
    const openLink = vi.fn();
    const hostMouseDown = vi.fn();
    const hostClick = vi.fn();
    row.addEventListener("mousedown", hostMouseDown);
    row.addEventListener("click", hostClick);
    const adapter = createAnnotationSidebarAdapter({ document, openLink });

    adapter.applyRenderedHtml(node, '<p><a href="https://example.com">https://example.com</a></p>');
    const link = node.querySelector(".annotation-markdown-rendered a");
    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 });

    expect(link.dispatchEvent(mouseDown)).toBe(false);
    expect(hostMouseDown).not.toHaveBeenCalled();
    expect(openLink).toHaveBeenCalledOnce();
    expect(openLink).toHaveBeenCalledWith("https://example.com");
    expect(link.dispatchEvent(click)).toBe(false);
    expect(hostClick).not.toHaveBeenCalled();
    expect(openLink).toHaveBeenCalledOnce();
    expect(node.classList.contains("annotation-markdown-editing")).toBe(false);
    expect(content.hidden).toBe(true);
    expect(node.querySelector(".annotation-markdown-rendered")?.hidden).toBe(false);
  });

  test("preview click on a selected Zotero reader comment restores the editor shell", () => {
    const requestAnimationFrame = globalThis.requestAnimationFrame;
    const callbacks = [];
    globalThis.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };

    try {
      document.body.innerHTML = `
        <div class="annotation selected">
          <div class="preview expanded1">
            <div class="comment">
              <div class="expandable-editor">
                <div class="editor-view">
                  <div class="editor read-only">
                    <div class="content" tabindex="0">**bold**</div>
                    <div class="renderer"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      const node = document.querySelector(".comment");
      const sourceShell = document.querySelector(".expandable-editor");
      const content = document.querySelector(".content");
      const adapter = createAnnotationSidebarAdapter({ document });

      adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
      node.querySelector(".annotation-markdown-rendered").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      expect(node.classList.contains("annotation-markdown-editing")).toBe(true);
      expect(sourceShell.hidden).toBe(false);
      expect(sourceShell.style.display).toBe("");
      expect(node.querySelector(".annotation-markdown-rendered")?.hidden).toBe(true);
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
