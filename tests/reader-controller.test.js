import { describe, expect, test, vi } from "vitest";

import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";

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

  test("renders a page-selected annotation before its dormant editor receives focus", async () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="true">**selected**</div>
          </div>
        </div>
      </div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });

    await controller.start();

    expect(render).toHaveBeenCalledWith("**selected**");
    expect(document.querySelector(".annotation-markdown-rendered")?.innerHTML).toBe("<p>**selected**</p>");
    controller.stop();
  });

  test("keeps popups fully native while experimental popup rendering is disabled", async () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation">
        <div class="comment"><div class="content">**sidebar**</div></div>
      </div>
      <div class="annotation-popup"><div class="preview"><div class="comment">
        <div class="editor">
          <div id="p1" class="content" contenteditable="true">**popup**</div>
          <div class="renderer"></div>
        </div>
      </div></div></div>
    `;
    let popupEnabled = false;
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      isPopupEnabled: () => popupEnabled,
      commitComment: vi.fn(() => true)
    });
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: {
        isEnabled: () => true,
        isPopupEnabled: () => popupEnabled
      },
      MutationObserver: null,
      IntersectionObserver: null,
      styleText: ".annotation-markdown-rendered { display: block; }"
    });

    await controller.start();
    const popup = document.querySelector(".annotation-popup");
    const popupComment = popup.querySelector(".comment");
    const nativeEditor = popup.querySelector(".editor");
    expect(document.documentElement.hasAttribute("data-annotation-markdown-popup-enabled")).toBe(false);
    expect(document.querySelector("[data-annotation-id='a1'] [data-annotation-markdown-preview='true']")).not.toBeNull();
    expect(popupComment.querySelector("[data-annotation-markdown-preview='true']")).toBeNull();
    expect(nativeEditor.hidden).toBe(false);
    expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
    nativeEditor.querySelector(".content").dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true })
    );
    expect(popupComment.querySelector("[data-annotation-markdown-fast-editor='true']")).toBeNull();

    popupEnabled = true;
    controller.refresh();
    expect(document.documentElement.getAttribute("data-annotation-markdown-popup-enabled")).toBe("true");
    expect(popupComment.querySelector("[data-annotation-markdown-preview='true']")).not.toBeNull();
    expect(nativeEditor.hidden).toBe(true);

    popupEnabled = false;
    controller.refresh();
    expect(document.documentElement.hasAttribute("data-annotation-markdown-popup-enabled")).toBe(false);
    expect(popupComment.querySelector("[data-annotation-markdown-preview='true']")).toBeNull();
    expect(nativeEditor.hidden).toBe(false);
    expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
    controller.stop();
  });

  test("edits a page annotation popup locally and saves once through the fast editor", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="ABC12345" class="annotation">
        <div class="comment"><div class="content">**old**</div></div>
      </div>
      <div class="annotation-popup">
        <div class="preview">
          <div class="comment">
            <div class="editor">
              <div class="editor-toolbar"><button>Bold</button></div>
              <div id="ABC12345" class="content" contenteditable="true" tabindex="-1">**old**</div>
              <div class="renderer"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const commitComment = vi.fn(() => true);
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment
    });
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });

    await controller.start();

    const comment = document.querySelector(".annotation-popup .comment");
    const editor = comment.querySelector(".editor");
    const content = comment.querySelector(".content");
    const nativeInput = vi.fn();
    content.addEventListener("input", nativeInput);
    const preview = comment.querySelector("[data-annotation-markdown-preview='true']");
    expect(render).toHaveBeenCalledWith("**old**");
    expect(editor.hidden).toBe(true);
    expect(preview?.innerHTML).toBe("<p>**old**</p>");

    preview.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    vi.runAllTimers();

    const fastEditor = comment.querySelector("[data-annotation-markdown-fast-editor='true']");
    const textarea = fastEditor.querySelector("textarea");
    expect(document.activeElement).toBe(textarea);
    expect(editor.hidden).toBe(true);
    textarea.value = "**new**";
    textarea.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText"
    }));
    expect(nativeInput).not.toHaveBeenCalled();
    expect(commitComment).not.toHaveBeenCalled();

    document.querySelector("#outside").focus();
    vi.runAllTimers();

    expect(commitComment).toHaveBeenCalledOnce();
    expect(commitComment).toHaveBeenCalledWith("ABC12345", "**new**");
    expect(render).toHaveBeenLastCalledWith("**new**");
    expect(editor.hidden).toBe(true);
    expect(comment.querySelector("[data-annotation-markdown-preview='true']")?.innerHTML)
      .toBe("<p>**new**</p>");
    expect(document.querySelector("[data-annotation-id='ABC12345'] [data-annotation-markdown-preview='true']")?.innerHTML)
      .toBe("<p>**old**</p>");

    controller.stop();
    vi.useRealTimers();
  });

  test("reuses one rendered result for sidebar and popup representations of an annotation", async () => {
    document.body.innerHTML = `
      <div data-annotation-id="ABC12345" class="annotation">
        <div class="comment"><div class="content">**same**</div></div>
      </div>
      <div class="annotation-popup">
        <div class="preview"><div class="comment"><div class="editor">
          <div id="ABC12345" class="content" contenteditable="true">**same**</div>
          <div class="renderer"></div>
        </div></div></div>
      </div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });

    await controller.start();

    expect(render).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("[data-annotation-markdown-preview='true']")).toHaveLength(2);
    controller.stop();
  });

  test("renders reused popup DOM synchronously even when sidebar rendering is lazy", async () => {
    document.body.innerHTML = `
      <div class="annotation-popup"><div class="preview"><div class="comment">
        <div class="editor">
          <div id="ABC12345" class="content" contenteditable="true">**old**</div>
          <div class="renderer"></div>
        </div>
      </div></div></div>
    `;
    const observe = vi.fn();
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver() {
      return { observe, disconnect: vi.fn() };
    });
    const render = vi.fn((source) => `<p>${source}</p>`);
    const adapter = createAnnotationSidebarAdapter({ document });
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render },
      settings: {
        isEnabled: () => true,
        getRenderStrategy: () => "lazy"
      },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver
    });

    await controller.start();

    const comment = document.querySelector(".comment");
    const content = comment.querySelector(".content");
    expect(render).toHaveBeenCalledWith("**old**");
    expect(observe).not.toHaveBeenCalledWith(comment);

    content.id = "DEF67890";
    content.textContent = "**new**";
    controller.renderNow();

    expect(render).toHaveBeenLastCalledWith("**new**");
    expect(comment.querySelector("[data-annotation-markdown-preview='true']")?.innerHTML)
      .toBe("<p>**new**</p>");
    controller.stop();
  });

  test("reveals popup Markdown on the next frame after Zotero's post-render positioning task", async () => {
    vi.useFakeTimers();
    const mutationCallbacks = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
      mutationCallbacks.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn(), takeRecords: vi.fn(() => []) };
    });
    const frameCallbacks = [];
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.requestAnimationFrame = vi.fn((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    window.cancelAnimationFrame = vi.fn();
    document.body.innerHTML = `
      <div class="annotation-popup"><div class="preview"><div class="comment">
        <div class="editor">
          <div id="ABC12345" class="content" contenteditable="true">**old**</div>
          <div class="renderer"></div>
        </div>
      </div></div></div>
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver,
      IntersectionObserver: null
    });

    try {
      await controller.start();
      const popup = document.querySelector(".annotation-popup");
      const content = popup.querySelector(".content");
      expect(popup.getAttribute("data-annotation-markdown-popup-positioning")).toBe("true");
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      expect(frameCallbacks).toHaveLength(0);

      popup.style.transform = "translate(200px, 120px)";
      mutationCallbacks[0]([{
        type: "attributes",
        attributeName: "style",
        target: popup,
        addedNodes: [],
        removedNodes: []
      }]);
      expect(popup.getAttribute("data-annotation-markdown-popup-positioning")).toBe("true");
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);

      vi.runOnlyPendingTimers();
      expect(frameCallbacks).toHaveLength(1);
      frameCallbacks.shift()(0);
      expect(popup.hasAttribute("data-annotation-markdown-popup-positioning")).toBe(false);
      expect(popup.getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
      expect(frameCallbacks).toHaveLength(0);

      // React can write an unchanged transform when reopening the same popup.
      // It must stay visible instead of blinking at the same coordinates.
      mutationCallbacks[0]([{
        type: "attributes",
        attributeName: "style",
        target: popup,
        addedNodes: [],
        removedNodes: []
      }]);
      expect(popup.hasAttribute("data-annotation-markdown-popup-positioning")).toBe(false);
      expect(popup.getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
      expect(frameCallbacks).toHaveLength(0);

      // A reused popup can still be marked ready when Zotero starts moving it
      // for the next click. A changed transform must hide and restabilize it.
      popup.style.transform = "translate(201px, 120px)";
      mutationCallbacks[0]([{
        type: "attributes",
        attributeName: "style",
        target: popup,
        addedNodes: [],
        removedNodes: []
      }]);
      expect(popup.getAttribute("data-annotation-markdown-popup-positioning")).toBe("true");
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      vi.runOnlyPendingTimers();
      frameCallbacks.shift()(16);
      expect(popup.getAttribute("data-annotation-markdown-popup-ready")).toBe("true");

      const hostReplacement = document.createElement("div");
      hostReplacement.className = "host-popup-update";
      popup.querySelector(".comment").append(hostReplacement);
      mutationCallbacks[0]([{
        type: "childList",
        target: popup.querySelector(".comment"),
        addedNodes: [hostReplacement],
        removedNodes: []
      }]);
      expect(popup.getAttribute("data-annotation-markdown-popup-positioning")).toBe("true");
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);

      vi.runOnlyPendingTimers();
      expect(frameCallbacks).toHaveLength(1);
      frameCallbacks.shift()(32);
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      frameCallbacks.shift()(48);
      expect(popup.hasAttribute("data-annotation-markdown-popup-positioning")).toBe(false);
      expect(popup.getAttribute("data-annotation-markdown-popup-ready")).toBe("true");

      content.id = "DEF67890";
      mutationCallbacks[0]([{
        type: "attributes",
        attributeName: "id",
        target: content,
        addedNodes: [],
        removedNodes: []
      }]);
      expect(popup.getAttribute("data-annotation-markdown-popup-positioning")).toBe("true");
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);

      controller.stop();
      expect(popup.hasAttribute("data-annotation-markdown-popup-positioning")).toBe(false);
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
    } finally {
      controller.stop();
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      vi.useRealTimers();
    }
  });

  test("keeps a popup hidden when Zotero updates its transform before the fast reveal frame", async () => {
    vi.useFakeTimers();
    const mutationCallbacks = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
      mutationCallbacks.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn(), takeRecords: vi.fn(() => []) };
    });
    const frameCallbacks = new Map();
    let nextFrameID = 1;
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.requestAnimationFrame = vi.fn((callback) => {
      const frameID = nextFrameID++;
      frameCallbacks.set(frameID, callback);
      return frameID;
    });
    window.cancelAnimationFrame = vi.fn((frameID) => frameCallbacks.delete(frameID));
    document.body.innerHTML = `
      <div class="annotation-popup"><div class="preview"><div class="comment">
        <div class="editor">
          <div id="ABC12345" class="content" contenteditable="true">**old**</div>
          <div class="renderer"></div>
        </div>
      </div></div></div>
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver,
      IntersectionObserver: null
    });
    const runNextFrame = (time) => {
      const next = frameCallbacks.entries().next().value;
      expect(next).toBeDefined();
      const [frameID, callback] = next;
      frameCallbacks.delete(frameID);
      callback(time);
    };

    try {
      await controller.start();
      const popup = document.querySelector(".annotation-popup");
      popup.style.transform = "translate(100px, 300px)";
      mutationCallbacks[0]([{
        type: "attributes",
        attributeName: "style",
        target: popup,
        addedNodes: [],
        removedNodes: []
      }]);

      vi.runOnlyPendingTimers();
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      expect(frameCallbacks.size).toBe(1);

      // React commits a newer authoritative transform before the scheduled
      // reveal. The old frame must be cancelled rather than exposing a jump.
      popup.style.transform = "translate(700px, 120px)";
      mutationCallbacks[0]([{
        type: "attributes",
        attributeName: "style",
        target: popup,
        addedNodes: [],
        removedNodes: []
      }]);
      expect(frameCallbacks.size).toBe(1);
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);

      vi.runOnlyPendingTimers();
      runNextFrame(16);
      expect(popup.getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
    } finally {
      controller.stop();
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      vi.useRealTimers();
    }
  });

  test("keeps a rendered popup hidden until Zotero's deferred position is ready", async () => {
    vi.useFakeTimers();
    const frameCallbacks = [];
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.requestAnimationFrame = vi.fn((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    window.cancelAnimationFrame = vi.fn();
    document.body.innerHTML = `
      <div class="annotation-popup page-popup-top-center" style="transform: translate(100px, 300px)">
        <div class="preview"><div class="comment"><div class="editor">
          <div id="ABC12345" class="content" contenteditable="true">${"line\n".repeat(40)}</div>
          <div class="renderer"></div>
        </div></div></div>
      </div>
    `;
    const popup = document.querySelector(".annotation-popup");
    Object.defineProperties(popup, {
      offsetWidth: { configurable: true, get: () => 512 },
      offsetHeight: {
        configurable: true,
        get: () => popup.querySelector("[data-annotation-markdown-preview='true']") ? 300 : 100
      }
    });
    popup.parentElement.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800
    });
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });

    try {
      await controller.start();

      expect(popup.querySelector("[data-annotation-markdown-preview='true']")).not.toBeNull();
      expect(popup.style.transform).toBe("translate(100px, 300px)");
      expect(popup.getAttribute("data-annotation-markdown-popup-positioning")).toBe("true");
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);

      // Zotero's queued updatePopupPosition() now measures the final Markdown
      // dimensions and supplies the authoritative native transform.
      popup.style.transform = "translate(100px, 100px)";
      vi.runOnlyPendingTimers();
      expect(frameCallbacks).toHaveLength(1);
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      frameCallbacks.shift()(0);
      expect(popup.getAttribute("data-annotation-markdown-popup-positioning")).toBe("true");
      expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      expect(frameCallbacks).toHaveLength(1);
      frameCallbacks.shift()(16);
      expect(popup.hasAttribute("data-annotation-markdown-popup-positioning")).toBe(false);
      expect(popup.getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
    } finally {
      controller.stop();
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      vi.useRealTimers();
    }
  });

  test("saves a fast popup draft once and keeps observing when Zotero removes it without focusout", async () => {
    vi.useFakeTimers();
    const callbacks = [];
    const observers = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
      callbacks.push(callback);
      const observer = { observe: vi.fn(), disconnect: vi.fn(), takeRecords: vi.fn(() => []) };
      observers.push(observer);
      return observer;
    });
    document.body.innerHTML = `
      <div id="root">
        <div class="annotation-popup"><div class="preview"><div class="comment">
          <div class="editor">
            <div id="ABC12345" class="content" contenteditable="true" tabindex="-1">**old**</div>
            <div class="renderer"></div>
          </div>
        </div></div></div>
      </div>
    `;
    const commitComment = vi.fn(() => true);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({
        document,
        isFastEditorEnabled: () => true,
        commitComment
      }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver,
      IntersectionObserver: null
    });

    await controller.start();
    const oldPopup = document.querySelector(".annotation-popup");
    oldPopup.querySelector("[data-annotation-markdown-preview='true']")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    vi.runAllTimers();
    const textarea = oldPopup.querySelector("[data-annotation-markdown-fast-editor='true'] textarea");
    expect(document.activeElement).toBe(textarea);
    expect(observers[0].disconnect).not.toHaveBeenCalled();
    textarea.value = "**saved before popup removal**";

    oldPopup.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(commitComment).toHaveBeenCalledOnce();
    expect(commitComment).toHaveBeenCalledWith(
      "ABC12345",
      "**saved before popup removal**"
    );

    const added = document.createElement("div");
    added.className = "annotation-popup";
    added.innerHTML = `<div class="preview"><div class="comment"><div class="editor">
      <div id="DEF67890" class="content" contenteditable="true">**next**</div>
      <div class="renderer"></div>
    </div></div></div>`;
    document.querySelector("#root").append(added);
    callbacks[0]([{
      type: "childList",
      target: document.querySelector("#root"),
      addedNodes: [added],
      removedNodes: [oldPopup]
    }]);

    expect(added.querySelector("[data-annotation-markdown-preview='true']")?.innerHTML)
      .toBe("<p>**next**</p>");
    controller.stop();
    expect(commitComment).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  test("opens the fast editor from Zotero's empty add-comment control and saves on blur", async () => {
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="false"></div>
            <div class="renderer">Add comment</div>
          </div>
        </div>
      </div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const commitComment = vi.fn(() => true);
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment
    });
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });

    await controller.start();

    const sourceShell = document.querySelector(".expandable-editor");
    expect(render).not.toHaveBeenCalled();
    expect(sourceShell.hidden).toBe(false);
    expect(sourceShell.style.display).toBe("");
    expect(document.querySelector(".renderer")?.textContent).toBe("Add comment");
    expect(document.querySelector(".annotation-markdown-rendered")).toBeNull();

    const hostClick = vi.fn();
    document.querySelector(".annotation").addEventListener("click", hostClick);
    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    document.querySelector(".renderer").dispatchEvent(event);
    const textarea = document.querySelector("[data-annotation-markdown-fast-editor='true'] textarea");
    expect(event.defaultPrevented).toBe(true);
    expect(textarea).not.toBeNull();
    document.querySelector(".renderer").dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    expect(hostClick).not.toHaveBeenCalled();
    textarea.value = "new comment";
    textarea.focus();
    document.querySelector("#outside").focus();

    expect(commitComment).toHaveBeenCalledWith("a1", "new comment");
    controller.stop();
  });

  test("keeps the fast editor open for its native context menu and paste", async () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="false">old comment</div>
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
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: {
        isEnabled: () => true,
        isPlainTextPasteEnabled: () => true
      },
      MutationObserver: null,
      IntersectionObserver: null
    });
    await controller.start();
    document.querySelector(".annotation-markdown-rendered").dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })
    );
    const textarea = document.querySelector("textarea");
    textarea.value = "new comment";
    textarea.focus();
    const hostContextMenu = vi.fn();
    let hostRecognizedTextEditor = false;
    document.querySelector(".annotation").addEventListener("contextmenu", (event) => {
      hostContextMenu();
      const editorNode = event.target.closest('div[contenteditable="true"]');
      hostRecognizedTextEditor = Boolean(
        editorNode && document.activeElement === editorNode
      );
    });

    const contextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2
    });
    const rightPointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 2
    });
    textarea.dispatchEvent(rightPointerDown);
    window.dispatchEvent(new Event("blur"));
    expect(document.querySelector("textarea")).toBe(textarea);

    textarea.dispatchEvent(contextMenu);
    const paste = createPasteEvent(" pasted");
    textarea.dispatchEvent(paste);

    expect(contextMenu.defaultPrevented).toBe(false);
    expect(hostContextMenu).toHaveBeenCalledTimes(1);
    expect(hostRecognizedTextEditor).toBe(true);
    expect(document.activeElement).toBe(textarea);
    expect(paste.defaultPrevented).toBe(false);
    expect(document.querySelector("textarea")).toBe(textarea);
    expect(commitComment).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("blur"));
    expect(commitComment).toHaveBeenCalledWith("a1", "new comment");
    expect(document.querySelector("textarea")).toBeNull();
    controller.stop();
  });

  test("keeps the fast editor open when the annotation sidebar scrollbar is used", async () => {
    document.body.innerHTML = `
      <div id="annotations-view" tabindex="-1" style="overflow-y: auto">
        <div data-annotation-id="a1" class="annotation selected">
          <div class="comment">
            <div class="expandable-editor">
              <div class="content" contenteditable="false">old comment</div>
            </div>
          </div>
        </div>
      </div>
      <button id="outside">outside</button>
    `;
    const commitComment = vi.fn(() => true);
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment
    });
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });
    await controller.start();
    document.querySelector(".annotation-markdown-rendered").dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })
    );
    const textarea = document.querySelector("textarea");
    await vi.waitFor(() => expect(document.activeElement).toBe(textarea));
    textarea.value = "new comment";
    textarea.focus();

    const sidebar = document.querySelector("#annotations-view");
    Object.defineProperties(sidebar, {
      // Gecko can render the native scrollbar as an overlay, so it occupies
      // no measured layout width even though its visible thumb is clickable.
      clientWidth: { configurable: true, value: 217 },
      offsetWidth: { configurable: true, value: 217 },
      clientHeight: { configurable: true, value: 300 },
      offsetHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollWidth: { configurable: true, value: 217 }
    });
    sidebar.getBoundingClientRect = () => ({
      bottom: 300,
      height: 300,
      left: 0,
      right: 217,
      top: 0,
      width: 217,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    document.querySelector(".annotation").dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 210,
      clientY: 100
    }));
    window.dispatchEvent(new Event("blur"));
    sidebar.focus();
    sidebar.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

    expect(document.querySelector("textarea")).toBe(textarea);
    expect(commitComment).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(document.activeElement).toBe(sidebar);

    document.querySelector("#outside").dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    expect(commitComment).toHaveBeenCalledWith("a1", "new comment");
    controller.stop();
  });

  test("commits an empty-origin draft on outside pointerdown before Zotero removes its DOM", async () => {
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
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: vi.fn() },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });
    await controller.start();
    document.querySelector(".renderer").dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    const textarea = document.querySelector("textarea");
    textarea.value = "save before removal";
    textarea.focus();
    const comment = document.querySelector(".comment");
    window.addEventListener("pointerdown", () => comment.remove(), {
      capture: true,
      once: true
    });

    document.querySelector("#outside").dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0
    }));

    expect(commitComment).toHaveBeenCalledWith("a1", "save before removal");
    controller.stop();
  });

  test("commits an empty-origin draft when Zotero removes the focused editor without blur", async () => {
    document.body.innerHTML = `
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
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: vi.fn() },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });
    await controller.start();
    document.querySelector(".renderer").dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    const textarea = document.querySelector("textarea");
    textarea.value = "save detached draft";
    textarea.focus();

    document.querySelector(".comment").remove();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(commitComment).toHaveBeenCalledWith("a1", "save detached draft");
    controller.stop();
  });

  test("renders the current comment after Zotero replaces a newly saved empty comment", async () => {
    vi.useFakeTimers();
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
    const render = vi.fn((source) => `<p>${source}</p>`);
    const commitComment = vi.fn((_annotationID, source) => {
      document.querySelector(".comment").replaceWith(
        Object.assign(document.createElement("div"), {
          className: "comment",
          innerHTML: `<div class="expandable-editor"><div class="content">${source}</div></div>`
        })
      );
      return true;
    });
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment
    });
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });
    await controller.start();
    document.querySelector(".renderer").dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    const textarea = document.querySelector("textarea");
    textarea.value = "**first save**";
    textarea.focus();

    document.querySelector("#outside").focus();
    vi.runAllTimers();

    const currentComment = document.querySelector(".comment");
    expect(commitComment).toHaveBeenCalledWith("a1", "**first save**");
    expect(render).toHaveBeenCalledWith("**first save**");
    expect(currentComment.querySelector("[data-annotation-markdown-preview='true']")?.innerHTML)
      .toBe("<p>**first save**</p>");
    controller.stop();
    vi.useRealTimers();
  });

  test("replaces a newly focused native comment editor before the user starts typing", async () => {
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const callbacks = [];
    window.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor expanded">
            <div class="editor-view"><div class="editor">
              <div class="content" contenteditable="true" placeholder="Add comment"></div>
              <div class="renderer"></div>
            </div></div>
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
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: vi.fn() },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });
    await controller.start();

    const originalComment = document.querySelector(".comment");
    document.querySelector(".content").focus();
    expect(document.querySelector("[data-annotation-markdown-fast-editor='true']"))
      .toBeNull();

    originalComment.replaceWith(Object.assign(document.createElement("div"), {
      className: "comment",
      innerHTML: `
        <div class="expandable-editor expanded">
          <div class="editor-view"><div class="editor">
            <div class="content" contenteditable="true" placeholder="Add comment"></div>
            <div class="renderer"></div>
          </div></div>
        </div>
      `
    }));
    callbacks.shift()(0);

    expect(document.querySelector("[data-annotation-markdown-fast-editor='true'] textarea"))
      .not.toBeNull();
    expect(document.querySelector(".comment").classList)
      .toContain("annotation-markdown-fast-editing");
    const textarea = document.querySelector("textarea");
    textarea.value = "saved after native refresh";
    textarea.focus();
    document.querySelector("#outside").focus();
    expect(commitComment).toHaveBeenCalledWith("a1", "saved after native refresh");
    controller.stop();
    window.requestAnimationFrame = originalRequestAnimationFrame;
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
    controller.stop();
  });

  test("defers initial comment rendering until annotations enter the viewport", async () => {
    const observed = [];
    let visibilityCallback;
    let visibilityOptions;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback, options) {
      visibilityCallback = callback;
      visibilityOptions = options;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = `
      <div data-annotation-id="a1"><div class="comment">**first**</div></div>
      <div data-annotation-id="a2"><div class="comment">**second**</div></div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver
    });

    await controller.start();

    expect(render).not.toHaveBeenCalled();
    expect(observed).toEqual(Array.from(document.querySelectorAll(".comment")));
    expect(visibilityOptions.rootMargin).toBe(`${Math.max(1200, window.innerHeight * 2)}px 0px`);

    visibilityCallback([{ target: observed[0], isIntersecting: true }]);

    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith("**first**");
    expect(observed[0].querySelector(".annotation-markdown-rendered")?.innerHTML).toBe("<p>**first**</p>");
    expect(observed[1].querySelector(".annotation-markdown-rendered")).toBeNull();

    controller.stop();
  });

  test("keeps rendered DOM mounted outside the lazy window while the budget allows", async () => {
    const observed = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**first**</div></div>`;
    const render = vi.fn((source) => `<p><strong>${source}</strong></p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver
    });

    await controller.start();
    visibilityCallback([{ target: observed[0], isIntersecting: true }]);
    visibilityCallback([{ target: observed[0], isIntersecting: false }]);

    expect(document.querySelector("[data-annotation-markdown-placeholder='true']")).toBeNull();
    expect(document.querySelector(".annotation-markdown-rendered strong")?.textContent).toBe("**first**");

    visibilityCallback([{ target: observed[0], isIntersecting: true }]);

    expect(render).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".annotation-markdown-rendered strong")?.textContent).toBe("**first**");
    controller.stop();
  });

  test("releases the least-recently offscreen DOM only after the estimated byte budget is exceeded", async () => {
    const observed = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = Array.from({ length: 3 }, (_, index) =>
      `<div data-annotation-id="a${index}"><div class="comment">comment ${index}</div></div>`
    ).join("");
    const render = vi.fn((source) => `<p>${source.padEnd(20, "x")}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver,
      offscreenRenderMaxBytes: 500
    });

    await controller.start();
    visibilityCallback(observed.map((target) => ({ target, isIntersecting: true })));
    visibilityCallback(observed.map((target) => ({ target, isIntersecting: false })));

    expect(observed[0].querySelector("[data-annotation-markdown-placeholder='true']")).not.toBeNull();
    expect(observed[1].querySelector("[data-annotation-markdown-placeholder='true']")).not.toBeNull();
    expect(observed[2].querySelector("[data-annotation-markdown-placeholder='true']")).toBeNull();

    visibilityCallback([{ target: observed[0], isIntersecting: true }]);

    expect(render).toHaveBeenCalledTimes(3);
    expect(observed[0].querySelector(".annotation-markdown-rendered")?.innerHTML)
      .toBe("<p>comment 0xxxxxxxxxxx</p>");
    controller.stop();
  });

  test("renders at most one visible annotation per idle task", async () => {
    const observed = [];
    const idleCallbacks = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = `
      <div data-annotation-id="a1"><div class="comment">**first**</div></div>
      <div data-annotation-id="a2"><div class="comment">**second**</div></div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver,
      requestIdleCallback: (callback) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }
    });

    await controller.start();
    visibilityCallback(observed.map((target) => ({ target, isIntersecting: true })));

    expect(render).not.toHaveBeenCalled();
    expect(idleCallbacks).toHaveLength(1);

    idleCallbacks[0]();
    expect(render).toHaveBeenCalledTimes(1);
    expect(idleCallbacks).toHaveLength(2);

    idleCallbacks[1]();
    expect(render).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  test("renders up to four cheap annotations while idle time remains", async () => {
    const observed = [];
    const idleCallbacks = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = Array.from({ length: 5 }, (_, index) =>
      `<div data-annotation-id="a${index}"><div class="comment">comment ${index}</div></div>`
    ).join("");
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver,
      requestIdleCallback: (callback) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }
    });

    await controller.start();
    visibilityCallback(observed.map((target) => ({ target, isIntersecting: true })));
    idleCallbacks[0]({ timeRemaining: () => 20, didTimeout: false });

    expect(render).toHaveBeenCalledTimes(4);
    expect(idleCallbacks).toHaveLength(2);

    idleCallbacks[1]({ timeRemaining: () => 20, didTimeout: false });
    expect(render).toHaveBeenCalledTimes(5);
    controller.stop();
  });

  test.each(["eager", "auto"])("%s strategy queues a short annotation set before visibility callbacks", async (renderStrategy) => {
    const idleCallbacks = [];
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver() {
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    });
    document.body.innerHTML = `
      <div data-annotation-id="a1"><div class="comment">first</div></div>
      <div data-annotation-id="a2"><div class="comment">second</div></div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: {
        isEnabled: () => true,
        getRenderStrategy: () => renderStrategy
      },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver,
      requestIdleCallback: (callback) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }
    });

    await controller.start();
    expect(idleCallbacks).toHaveLength(1);
    idleCallbacks[0]({ timeRemaining: () => 20, didTimeout: false });

    expect(render).toHaveBeenCalledTimes(2);
    controller.stop();
  });

  test("automatic strategy keeps large annotation sets viewport-lazy", async () => {
    const observed = [];
    const idleCallbacks = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = Array.from({ length: 31 }, (_, index) =>
      `<div data-annotation-id="a${index}"><div class="comment">comment ${index}</div></div>`
    ).join("");
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: {
        isEnabled: () => true,
        getRenderStrategy: () => "auto"
      },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver,
      requestIdleCallback: (callback) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }
    });

    await controller.start();
    expect(idleCallbacks).toHaveLength(0);

    visibilityCallback([{ target: observed[0], isIntersecting: true }]);
    expect(idleCallbacks).toHaveLength(1);
    controller.stop();
  });

  test("renders the selected annotation before surrounding visible annotations", async () => {
    const observed = [];
    const idleCallbacks = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = `
      <div data-annotation-id="a1"><div class="comment">first</div></div>
      <div data-annotation-id="a2" class="annotation selected"><div class="comment">selected</div></div>
      <div data-annotation-id="a3"><div class="comment">third</div></div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver,
      requestIdleCallback: (callback) => {
        idleCallbacks.push(callback);
        return idleCallbacks.length;
      }
    });

    await controller.start();
    visibilityCallback(observed.map((target) => ({ target, isIntersecting: true })));
    idleCallbacks[0]();

    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith("selected");
    controller.stop();
  });

  test("bounds lazy rendered HTML cache by total string payload while keeping recent entries", async () => {
    const observed = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = Array.from({ length: 3 }, (_, index) =>
      `<div data-annotation-id="a${index}"><div class="comment">comment ${index}</div></div>`
    ).join("");
    const render = vi.fn((source) => `<p>${source.padEnd(20, "x")}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver,
      renderCacheMaxBytes: 500,
      offscreenRenderMaxBytes: 0
    });

    await controller.start();
    visibilityCallback(observed.map((target) => ({ target, isIntersecting: true })));
    visibilityCallback(observed.map((target) => ({ target, isIntersecting: false })));
    visibilityCallback([{ target: observed[2], isIntersecting: true }]);
    visibilityCallback([{ target: observed[0], isIntersecting: true }]);

    expect(render).toHaveBeenCalledTimes(4);
    controller.stop();
  });

  test("does not replace a selected outer annotation preview with a plain-text placeholder", async () => {
    const observed = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = `
      <div class="annotation selected">
        <div data-annotation-id="a1"><div class="comment">https://example.com</div></div>
      </div>
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: () => '<p><a href="https://example.com">https://example.com</a></p>' },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver,
      offscreenRenderMaxBytes: 0
    });

    await controller.start();
    visibilityCallback([{ target: observed[0], isIntersecting: true }]);
    visibilityCallback([{ target: observed[0], isIntersecting: false }]);

    const preview = document.querySelector("[data-annotation-markdown-preview='true']");
    expect(preview?.querySelector("a")?.href).toBe("https://example.com/");
    expect(preview?.hasAttribute("data-annotation-markdown-placeholder")).toBe(false);
    controller.stop();
  });

  test("logs cumulative lazy render timing percentiles when diagnostics are enabled", async () => {
    const observed = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    const now = vi.fn(() => 0);
    const log = vi.fn();
    document.body.innerHTML = `
      <div data-annotation-id="a1"><div class="comment">**first**</div></div>
      <div data-annotation-id="a2"><div class="comment">**second**</div></div>
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: {
        isEnabled: () => true,
        isPerformanceDiagnosticsEnabled: () => true
      },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver,
      logger: { log },
      now
    });

    await controller.start();
    log.mockClear();
    now.mockClear();
    const timingValues = [
      0, 1, 5, 5, 7, 8,
      10, 11, 21, 21, 25, 30
    ];
    now.mockImplementation(() => timingValues.shift());
    visibilityCallback([{ target: observed[0], isIntersecting: true }]);
    visibilityCallback([{ target: observed[1], isIntersecting: true }]);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[annotation-markdown] perf lazyRender")
    );
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining("batchNodes=1 totalNodes=2"));
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining("markdownMs=14.0 domMs=6.0"));
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining("p50Ms=8.0 p95Ms=20.0 maxMs=20.0"));
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining("slowNodes=1 sourceChars=19"));
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining("mountedPreviews=2 placeholders=0 cacheEntries=2"));
    controller.stop();
  });

  test("does not collect lazy render timings when diagnostics are disabled", async () => {
    const observed = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    const now = vi.fn();
    const log = vi.fn();
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**first**</div></div>`;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver,
      logger: { log },
      now
    });

    await controller.start();
    visibilityCallback([{ target: observed[0], isIntersecting: true }]);

    expect(now).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    controller.stop();
  });

  test("observes all comments for lazy rendering when lightweight mode is enabled", async () => {
    const observed = [];
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver() {
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected"><div class="comment">**first**</div></div>
      <div data-annotation-id="a2" class="annotation"><div class="comment">**second**</div></div>
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: {
        isEnabled: () => true,
        isLightweightModeEnabled: () => true
      },
      MutationObserver: null,
      IntersectionObserver: FakeIntersectionObserver
    });

    await controller.start();

    expect(observed).toEqual(Array.from(document.querySelectorAll(".comment")));

    controller.stop();
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

    controller.stop();
  });

  test("renders only added annotation comments during synchronous mutation scans", async () => {
    const callbacks = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
      callbacks.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn() };
    });
    document.body.innerHTML = `
      <div id="root">
        <div data-annotation-id="a1"><div class="comment">**old**</div></div>
      </div>
    `;
    const baseAdapter = createAnnotationSidebarAdapter({ document });
    const adapter = {
      ...baseAdapter,
      findCommentNodes: vi.fn((root) => baseAdapter.findCommentNodes(root))
    };
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver
    });

    await controller.start();
    adapter.findCommentNodes.mockClear();
    render.mockClear();

    const added = document.createElement("div");
    added.innerHTML = `<div data-annotation-id="a2"><div class="comment">**new**</div></div>`;
    document.querySelector("#root").append(added);
    callbacks[0]([{ type: "childList", addedNodes: [added], target: document.querySelector("#root") }]);

    expect(adapter.findCommentNodes).toHaveBeenCalledTimes(1);
    expect(adapter.findCommentNodes).toHaveBeenCalledWith(added);
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith("**new**");

    controller.stop();
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

  test("does not schedule safety scans for character changes inside a focused annotation editor", async () => {
    vi.useFakeTimers();
    const callbacks = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
      callbacks.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn() };
    });
    document.body.innerHTML = `
      <div id="root">
        <div data-annotation-id="a1" class="annotation selected">
          <div class="comment annotation-markdown-editing">
            <div class="content" tabindex="0">**editing**</div>
          </div>
        </div>
      </div>
    `;
    const baseAdapter = createAnnotationSidebarAdapter({ document });
    const adapter = {
      ...baseAdapter,
      findCommentNodes: vi.fn((root) => baseAdapter.findCommentNodes(root))
    };
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver
    });

    await controller.start();
    const comment = document.querySelector(".comment");
    const content = document.querySelector(".content");
    comment.classList.add("annotation-markdown-editing");
    content.hidden = false;
    content.style.display = "";
    content.focus();
    adapter.findCommentNodes.mockClear();
    content.firstChild.nodeValue = "**editing more**";
    callbacks[0]([{ type: "characterData", target: content.firstChild, addedNodes: [], removedNodes: [] }]);
    vi.runAllTimers();

    expect(adapter.findCommentNodes).not.toHaveBeenCalled();

    controller.stop();
    vi.useRealTimers();
  });

  test("does not observe character data changes inside reader comments", async () => {
    document.body.innerHTML = `<div></div>`;
    const observe = vi.fn();
    const FakeMutationObserver = vi.fn(function FakeMutationObserver() {
      return { observe, disconnect: vi.fn() };
    });
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver
    });

    await controller.start();

    expect(observe).toHaveBeenCalledWith(document.body, {
      childList: true,
      subtree: true,
      characterData: false,
      attributes: true,
      attributeFilter: ["id", "style"]
    });

    controller.stop();
  });

  test("ignores child mutations inside a focused annotation editor before scanning added nodes", async () => {
    vi.useFakeTimers();
    const callbacks = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
      callbacks.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn() };
    });
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment annotation-markdown-editing">
          <div class="content" tabindex="0">editing</div>
        </div>
      </div>
    `;
    const baseAdapter = createAnnotationSidebarAdapter({ document });
    const adapter = {
      ...baseAdapter,
      findCommentNodes: vi.fn((root) => baseAdapter.findCommentNodes(root))
    };
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: (source) => source },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver
    });

    await controller.start();
    const content = document.querySelector(".content");
    content.focus();
    adapter.findCommentNodes.mockClear();
    const added = document.createElement("span");
    added.innerHTML = `<span class="comment">editor chrome</span>`;
    content.append(added);
    callbacks[0]([{ type: "childList", target: content, addedNodes: [added], removedNodes: [] }]);
    vi.runAllTimers();

    expect(adapter.findCommentNodes).not.toHaveBeenCalled();

    controller.stop();
    vi.useRealTimers();
  });

  test("pauses all mutation rendering while an annotation editor has focus", async () => {
    const callbacks = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
      callbacks.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn() };
    });
    document.body.innerHTML = `
      <div id="root">
        <div data-annotation-id="a1" class="annotation selected">
          <div class="comment"><div class="content" tabindex="0">**editing**</div></div>
        </div>
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
    render.mockClear();
    document.querySelector(".content").focus();

    const added = document.createElement("div");
    added.innerHTML = `<div data-annotation-id="a2"><div class="comment">**new**</div></div>`;
    document.querySelector("#root").append(added);
    callbacks[0]([{ type: "childList", target: document.querySelector("#root"), addedNodes: [added], removedNodes: [] }]);

    expect(render).not.toHaveBeenCalled();

    controller.stop();
  });

  test("disconnects mutation observation while an annotation editor has focus", async () => {
    vi.useFakeTimers();
    const observerInstances = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver() {
      const instance = {
        observe: vi.fn(),
        disconnect: vi.fn()
      };
      observerInstances.push(instance);
      return instance;
    });
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" tabindex="0">**editing**</div></div>
      </div>
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver
    });

    await controller.start();
    expect(observerInstances[0].observe).toHaveBeenCalledTimes(1);

    document.querySelector(".content").focus();
    expect(observerInstances[0].disconnect).toHaveBeenCalledTimes(1);

    document.querySelector("#outside").focus();
    vi.runAllTimers();

    expect(observerInstances).toHaveLength(3);
    // The outline observer remains mounted while the render observer pauses;
    // the final instance is the newly registered render observer.
    expect(observerInstances[1].disconnect).not.toHaveBeenCalled();
    expect(observerInstances[2].observe).toHaveBeenCalledTimes(1);

    controller.stop();
    vi.useRealTimers();
  });

  test("restores the active rendered comment to native DOM while editing", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" tabindex="0">**editing**</div></div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: undefined
    });

    await controller.start();
    const comment = document.querySelector(".comment");
    const content = document.querySelector(".content");
    expect(adapter.isRendered(comment)).toBe(true);
    expect(comment.querySelector("[data-annotation-markdown-preview='true']")).not.toBeNull();

    content.focus();

    expect(adapter.isRendered(comment)).toBe(false);
    expect(comment.hasAttribute("data-annotation-markdown-source")).toBe(false);
    expect(comment.querySelector("[data-annotation-markdown-preview='true']")).toBeNull();
    expect(content.hidden).toBe(false);

    content.textContent = "**changed**";
    document.querySelector("#outside").focus();
    vi.runAllTimers();

    expect(render).toHaveBeenLastCalledWith("**changed**");
    expect(adapter.isRendered(comment)).toBe(true);

    controller.stop();
    vi.useRealTimers();
  });

  test("keeps other rendered previews mounted while editing and after blur", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" tabindex="0">**editing**</div></div>
      </div>
      <div data-annotation-id="a2" class="annotation">
        <div class="comment">other $x$</div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: (source) => `<p><span class="katex">${source}</span></p>` },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });

    await controller.start();
    const editingContent = document.querySelector("[data-annotation-id='a1'] .content");
    const otherComment = document.querySelector("[data-annotation-id='a2'] .comment");
    const otherPreview = otherComment.querySelector("[data-annotation-markdown-preview='true']");
    const otherMath = otherPreview.querySelector(".katex");

    editingContent.focus();

    expect(otherPreview.isConnected).toBe(true);
    expect(otherComment.querySelector("[data-annotation-markdown-preview='true']")).toBe(otherPreview);
    expect(otherComment.querySelector("[data-annotation-markdown-placeholder='true']")).toBeNull();

    document.querySelector("#outside").focus();
    vi.runAllTimers();

    expect(otherComment.querySelector("[data-annotation-markdown-preview='true']")).toBe(otherPreview);
    expect(otherPreview.querySelector(".katex")).toBe(otherMath);
    controller.stop();
    vi.useRealTimers();
  });

  test("keeps the native editor dormant while a fast editor types and rerenders after one save", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment">
          <div class="expandable-editor">
            <div class="content" contenteditable="true">**old**</div>
          </div>
        </div>
      </div>
    `;
    const commitComment = vi.fn(() => true);
    const render = vi.fn((source) => `<p>${source}</p>`);
    const adapter = createAnnotationSidebarAdapter({
      document,
      isFastEditorEnabled: () => true,
      commitComment
    });
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });

    await controller.start();
    const comment = document.querySelector(".comment");
    const content = document.querySelector(".content");
    const preview = comment.querySelector("[data-annotation-markdown-preview='true']");
    preview.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    vi.runAllTimers();

    const editor = comment.querySelector("[data-annotation-markdown-fast-editor='true']");
    const textarea = editor.querySelector("textarea");
    expect(document.activeElement).toBe(textarea);
    expect(document.querySelector(".expandable-editor").hidden).toBe(true);
    expect(preview.isConnected).toBe(true);
    textarea.value = "**new**";
    expect(commitComment).not.toHaveBeenCalled();

    document.querySelector("#outside").focus();
    vi.runAllTimers();

    expect(commitComment).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenLastCalledWith("**new**");
    expect(comment.querySelector("[data-annotation-markdown-fast-editor='true']")).toBeNull();
    expect(comment.querySelector("[data-annotation-markdown-preview='true']")?.innerHTML).toBe("<p>**new**</p>");

    controller.stop();
    vi.useRealTimers();
  });

  test("removes rendered previews and restores native source when the controller stops during editing", async () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" tabindex="0">editing</div></div>
      </div>
      <div data-annotation-id="a2" class="annotation"><div class="comment">other</div></div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });

    await controller.start();
    const otherComment = document.querySelector("[data-annotation-id='a2'] .comment");
    const otherPreview = otherComment.querySelector("[data-annotation-markdown-preview='true']");
    const otherSource = otherComment.querySelector("[data-annotation-markdown-source-node='true']");
    document.querySelector("[data-annotation-id='a1'] .content").focus();
    expect(otherPreview.isConnected).toBe(true);
    expect(otherSource.hidden).toBe(true);

    controller.stop();

    expect(otherPreview.isConnected).toBe(false);
    expect(otherSource.hidden).toBe(false);
    expect(otherComment.hasAttribute("data-annotation-markdown-rendered")).toBe(false);
    expect(otherComment.hasAttribute("data-annotation-markdown-source")).toBe(false);
    expect(otherComment.querySelector("[data-annotation-markdown-placeholder='true']")).toBeNull();
  });

  test("cleans the current reader DOM if Zotero replaces the body after startup", async () => {
    document.body.innerHTML = '<div data-annotation-id="a1" class="annotation"><div class="comment"><div class="content">**bold**</div></div></div>';
    const adapter = createAnnotationSidebarAdapter({ document });
    const reader = { document };
    const controller = createReaderController({
      reader,
      adapter,
      renderer: { render: (source) => "<p>" + source + "</p>" },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });

    await controller.start();
    const replacementBody = document.body.cloneNode(true);
    document.documentElement.replaceChild(replacementBody, document.body);

    expect(document.querySelector("[data-annotation-markdown-preview='true']")).not.toBeNull();
    expect(document.querySelector(".content").hidden).toBe(true);

    controller.stop();

    expect(document.querySelector("[data-annotation-markdown-preview='true']")).toBeNull();
    expect(document.querySelector(".content").hidden).toBe(false);
    expect(document.querySelector("[data-annotation-markdown-rendered]")).toBeNull();
    expect(document.querySelector("[data-annotation-markdown-source]")).toBeNull();
  });

  test("continues cleaning live reader roots when a stale root throws", async () => {
    const staleRoot = document.body;
    const liveDocument = document.implementation.createHTMLDocument("replacement reader");
    const reader = { document };
    let staleRootIsDead = false;
    const clearRenderedState = vi.fn((cleanupRoot) => {
      if (staleRootIsDead && cleanupRoot === staleRoot) {
        throw new Error("can't access dead object");
      }
    });
    const controller = createReaderController({
      reader,
      adapter: {
        ...createAnnotationSidebarAdapter({ document }),
        clearRenderedState
      },
      renderer: { render: (source) => source },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null
    });

    await controller.start();
    clearRenderedState.mockClear();
    reader.document = liveDocument;
    staleRootIsDead = true;

    expect(() => controller.stop()).not.toThrow();
    expect(clearRenderedState).toHaveBeenCalledWith(staleRoot);
    expect(clearRenderedState).toHaveBeenCalledWith(liveDocument.body);
  });

  test("aggregates repeated shutdown cleanup failures into one warning", async () => {
    const staleRoot = document.body;
    const liveDocument = document.implementation.createHTMLDocument("replacement reader");
    const reader = { document };
    let cleanupShouldFail = false;
    const clearRenderedState = vi.fn(() => {
      if (cleanupShouldFail) {
        throw new Error("can't access dead object");
      }
    });
    const warn = vi.fn();
    const controller = createReaderController({
      reader,
      adapter: {
        ...createAnnotationSidebarAdapter({ document }),
        clearRenderedState
      },
      renderer: { render: (source) => source },
      settings: { isEnabled: () => true },
      MutationObserver: null,
      IntersectionObserver: null,
      logger: { warn }
    });

    await controller.start();
    clearRenderedState.mockClear();
    reader.document = liveDocument;
    cleanupShouldFail = true;

    expect(() => controller.stop()).not.toThrow();
    expect(clearRenderedState).toHaveBeenCalledWith(staleRoot);
    expect(clearRenderedState).toHaveBeenCalledWith(liveDocument.body);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1].message).toContain("skippedSteps=2");
    expect(warn.mock.calls[0][1].message).toContain("can't access dead object");
  });

  test("preserves native source DOM structure during editing", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" tabindex="0"># Title<br>line 2<br><br>- item</div></div>
      </div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: undefined
    });

    await controller.start();
    const content = document.querySelector(".content");
    content.focus();

    expect(content.textContent).toBe("# Titleline 2- item");
    expect(content.innerHTML).toBe("# Title<br>line 2<br><br>- item");
    expect(content.style.whiteSpace).toBe("");

    controller.stop();
    vi.useRealTimers();
  });

  test("pauses lazy visibility rendering while an annotation editor has focus", async () => {
    const observed = [];
    let visibilityCallback;
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver(callback) {
      visibilityCallback = callback;
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
    });
    document.body.innerHTML = `
      <div id="root">
        <div data-annotation-id="a1" class="annotation selected">
          <div class="comment"><div class="content" tabindex="0">**editing**</div></div>
        </div>
        <div data-annotation-id="a2"><div class="comment">**other**</div></div>
      </div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: undefined,
      IntersectionObserver: FakeIntersectionObserver
    });

    await controller.start();
    document.querySelector(".content").focus();
    visibilityCallback([{ target: observed[1], isIntersecting: true }]);

    expect(render).not.toHaveBeenCalled();
    expect(observed[1].querySelector(".annotation-markdown-rendered")).toBeNull();

    controller.stop();
  });

  test("disconnects lazy visibility observation while an annotation editor has focus", async () => {
    const observed = [];
    const disconnect = vi.fn();
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver() {
      return {
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect
      };
    });
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" tabindex="0">**editing**</div></div>
      </div>
      <div data-annotation-id="a2"><div class="comment">**other**</div></div>
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: undefined,
      IntersectionObserver: FakeIntersectionObserver
    });

    await controller.start();
    expect(observed).toHaveLength(2);

    document.querySelector(".content").focus();

    expect(disconnect).toHaveBeenCalledTimes(1);

    controller.stop();
  });

  test("restores lazy visibility observation after editing resumes", async () => {
    vi.useFakeTimers();
    const observerInstances = [];
    const FakeIntersectionObserver = vi.fn(function FakeIntersectionObserver() {
      const observed = [];
      const instance = {
        observed,
        observe: vi.fn((node) => observed.push(node)),
        unobserve: vi.fn(),
        disconnect: vi.fn()
      };
      observerInstances.push(instance);
      return instance;
    });
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" tabindex="0">**editing**</div></div>
      </div>
      <div data-annotation-id="a2"><div class="comment">**other**</div></div>
    `;
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: { isEnabled: () => true },
      MutationObserver: undefined,
      IntersectionObserver: FakeIntersectionObserver
    });

    await controller.start();
    document.querySelector(".content").focus();
    document.querySelector("#outside").focus();
    vi.runAllTimers();

    expect(observerInstances).toHaveLength(2);
    expect(observerInstances[1].observed).toEqual(Array.from(document.querySelectorAll(".comment")));

    controller.stop();
    vi.useRealTimers();
  });

  test("logs editing diagnostics when editing starts and resumes", async () => {
    vi.useFakeTimers();
    const FakeMutationObserver = vi.fn(function FakeMutationObserver() {
      return { observe: vi.fn(), disconnect: vi.fn() };
    });
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div id="root">
        <div data-annotation-id="a1" class="annotation selected">
          <div class="comment"><div class="content" tabindex="0">**editing**</div></div>
        </div>
      </div>
    `;
    const log = vi.fn();
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: {
        isEnabled: () => true,
        isPerformanceDiagnosticsEnabled: () => true
      },
      MutationObserver: FakeMutationObserver,
      logger: { log }
    });

    await controller.start();
    log.mockClear();
    const content = document.querySelector(".content");
    content.focus();
    document.querySelector("#outside").focus();
    vi.runAllTimers();

    expect(log).toHaveBeenCalledWith(expect.stringContaining("[annotation-markdown] edit pause"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[annotation-markdown] edit resume"));

    controller.stop();
    vi.useRealTimers();
  });

  test("renders only the edited comment after annotation editing loses focus", async () => {
    vi.useFakeTimers();
    const callbacks = [];
    const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
      callbacks.push(callback);
      return { observe: vi.fn(), disconnect: vi.fn() };
    });
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div id="root">
        <div data-annotation-id="a1" class="annotation selected">
          <div class="comment"><div class="content" tabindex="0">**editing**</div></div>
        </div>
        <div data-annotation-id="a2"><div class="comment">**other**</div></div>
      </div>
    `;
    const render = vi.fn((source) => `<p>${source.toUpperCase()}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: { isEnabled: () => true },
      MutationObserver: FakeMutationObserver
    });

    await controller.start();
    render.mockClear();
    const content = document.querySelector(".content");
    content.focus();
    content.textContent = "**changed**";
    document.querySelector("#outside").focus();
    vi.runAllTimers();

    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith("**changed**");
    expect(document.querySelector("[data-annotation-id='a1'] .annotation-markdown-rendered")?.innerHTML)
      .toBe("<p>**CHANGED**</p>");

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

  test("skips render pass diagnostics by default", () => {
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

    expect(log).not.toHaveBeenCalled();
  });

  test("logs render performance diagnostics when enabled", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const log = vi.fn();
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render: (source) => source },
      settings: {
        isEnabled: () => true,
        isPerformanceDiagnosticsEnabled: () => true
      },
      MutationObserver: window.MutationObserver,
      logger: { log }
    });

    controller.renderNow();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[annotation-markdown] perf renderNow")
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("nodes=1")
    );
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
      settings: {
        isEnabled: () => true,
        isPerformanceDiagnosticsEnabled: () => true
      },
      MutationObserver: window.MutationObserver,
      logger: { log }
    });

    controller.renderNow();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[annotation-markdown] zero-node DOM summary:")
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("reader-annotation"));
  });

  test("lightweight mode renders selected comments and skips the rest", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected"><div class="comment">**selected**</div></div>
      <div data-annotation-id="a2" class="annotation"><div class="comment">**other**</div></div>
    `;
    const render = vi.fn((source) => `<p>${source}</p>`);
    const controller = createReaderController({
      reader: { document },
      adapter: createAnnotationSidebarAdapter({ document }),
      renderer: { render },
      settings: {
        isEnabled: () => true,
        isLightweightModeEnabled: () => true
      },
      MutationObserver: undefined
    });

    controller.renderNow();

    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith("**selected**");
    expect(document.querySelector("[data-annotation-id='a1'] .annotation-markdown-rendered")?.innerHTML)
      .toBe("<p>**selected**</p>");
    expect(document.querySelector("[data-annotation-id='a2'] .annotation-markdown-rendered")).toBeNull();
  });

  test("lightweight mode restores previously rendered comments outside the active target", () => {
    document.body.innerHTML = `
      <div data-annotation-id="a1" class="annotation selected"><div class="comment">**selected**</div></div>
      <div data-annotation-id="a2" class="annotation"><div class="comment">**other**</div></div>
    `;
    const adapter = createAnnotationSidebarAdapter({ document });
    const otherComment = document.querySelector("[data-annotation-id='a2'] .comment");
    adapter.applyRenderedHtml(otherComment, "<p>**other**</p>");
    const controller = createReaderController({
      reader: { document },
      adapter,
      renderer: { render: (source) => `<p>${source}</p>` },
      settings: {
        isEnabled: () => true,
        isLightweightModeEnabled: () => true
      },
      MutationObserver: undefined
    });

    controller.renderNow();

    expect(otherComment.textContent).toBe("**other**");
    expect(adapter.isRendered(otherComment)).toBe(false);
  });

  test("disabled settings restore rendered source text and skip rendering", () => {
    document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
    const adapter = createAnnotationSidebarAdapter({ document });
    const node = document.querySelector(".comment");
    adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
    adapter.releaseRenderedHtml(node);
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
    expect(adapter.hasPreview(node)).toBe(false);
  });

  test("rerenders edited source text after editing loses focus", () => {
    const requestAnimationFrame = globalThis.requestAnimationFrame;
    const callbacks = [];
    globalThis.requestAnimationFrame = (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    };

    try {
      document.body.innerHTML = `<button id="outside">outside</button><div data-annotation-id="a1" class="annotation selected"><div class="comment"><div class="content" tabindex="0">**bold**</div></div></div>`;
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
      document.querySelector("#outside").focus();
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
    document.body.innerHTML = `<div></div>`;
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
    fontScale = 2;
    controller.refresh();

    const style = document.querySelector("style[data-annotation-markdown-style='true']");
    expect(style?.textContent).toContain("--annotation-markdown-font-scale: 2em");

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

  test("leaves fast editor textarea paste native so Gecko can record undo", async () => {
    document.body.innerHTML = "";
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
    document.body.innerHTML = `
      <div data-annotation-id="a1">
        <div class="comment">
          <div data-annotation-markdown-fast-editor="true">
            <textarea class="content">before</textarea>
          </div>
        </div>
      </div>
    `;
    const textarea = document.querySelector("textarea");
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    const paste = createPasteEvent(" pasted");

    textarea.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(false);
    // jsdom does not perform the browser's default paste. An unchanged value
    // proves the plugin did not replace it with a synthetic, non-undoable edit.
    expect(textarea.value).toBe("before");

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
