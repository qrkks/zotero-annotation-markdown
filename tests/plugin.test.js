import { describe, expect, test, vi } from "vitest";

import { createPlugin } from "../src/plugin.ts";

describe("createPlugin", () => {
  test("startup registers existing readers and reader event listener", () => {
    const reader = {};
    const register = vi.fn();
    const registry = {
      register,
      shutdown: vi.fn()
    };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => registry
    });

    plugin.startup();

    expect(register).toHaveBeenCalledWith(reader);
    expect(Zotero.Reader.registerEventListener).toHaveBeenCalledWith(
      "renderSidebarAnnotationHeader",
      expect.any(Function),
      "annotation-markdown@local"
    );
  });

  test("startup logs reader integration diagnostics", () => {
    const log = vi.fn();
    const Zotero = {
      Reader: {
        _readers: [{}],
        registerEventListener: vi.fn()
      },
      Prefs: {},
      debug: log
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => ({ register: vi.fn(), shutdown: vi.fn() })
    });

    plugin.startup();

    expect(log).toHaveBeenCalledWith("[annotation-markdown] startup");
    expect(log).toHaveBeenCalledWith("[annotation-markdown] found open readers: 1");
    expect(log).toHaveBeenCalledWith("[annotation-markdown] registered reader event: renderSidebarAnnotationHeader");
  });

  test("startup mirrors diagnostics to a file logger when available", () => {
    const append = vi.fn();
    const Zotero = {
      Reader: {
        _readers: [],
        registerEventListener: vi.fn()
      },
      Prefs: {},
      debug: vi.fn()
    };
    const plugin = createPlugin({
      Zotero,
      diagnostics: { append },
      registryFactory: () => ({ register: vi.fn(), shutdown: vi.fn() })
    });

    plugin.startup();

    expect(append).toHaveBeenCalledWith("[annotation-markdown] startup");
  });

  test("injects bundled stylesheet text into open reader documents", async () => {
    const reader = { document };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      styleText: ".annotation-markdown-rendered { line-height: inherit; }"
    });

    await plugin.startup();

    const style = document.querySelector("style[data-annotation-markdown-style='true']");
    expect(style?.textContent).toContain("annotation-markdown-rendered");

    plugin.shutdown();
    expect(document.querySelector("style[data-annotation-markdown-style='true']")).toBeNull();
  });

  test("shutdown removes rendered previews and restores native reader comments", async () => {
    document.body.innerHTML = '<div data-annotation-id="a1" class="annotation"><div class="comment"><div class="content">**bold**</div></div></div>';
    const reader = { document };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({ Zotero });

    await plugin.startup();

    const comment = document.querySelector(".comment");
    const source = comment.querySelector(".content");
    expect(comment.querySelector("[data-annotation-markdown-preview='true']")).not.toBeNull();
    expect(source.hidden).toBe(true);

    plugin.shutdown();

    expect(comment.querySelector(".annotation-markdown-rendered")).toBeNull();
    expect(comment.hasAttribute("data-annotation-markdown-rendered")).toBe(false);
    expect(comment.hasAttribute("data-annotation-markdown-source")).toBe(false);
    expect(source.hidden).toBe(false);
  });

  test("commits fast editor comments through Zotero's annotation manager", async () => {
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" contenteditable="false">old</div></div>
      </div>
    `;
    const updateAnnotations = vi.fn();
    const reader = {
      document,
      _annotationManager: { updateAnnotations }
    };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({ Zotero });
    await plugin.startup();

    document.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    const textarea = document.querySelector("[data-annotation-markdown-fast-editor='true'] textarea");
    textarea.value = "new";
    textarea.focus();
    document.querySelector("#outside").focus();

    expect(updateAnnotations).toHaveBeenCalledWith([{ id: "a1", comment: "new" }]);
    plugin.shutdown();
  });

  test("delegates rendered Zotero links to Weavero without entering fast edit", async () => {
    const url = "zotero://open/library/items/9X3PTDDP?annotation=NXKFRI46";
    document.body.innerHTML = `
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" contenteditable="false">${url}</div></div>
      </div>
    `;
    const handleZoteroURI = vi.fn();
    const launchURL = vi.fn();
    const reader = {
      document,
      _annotationManager: { updateAnnotations: vi.fn() }
    };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {},
      Weavero: { plugin: { handleZoteroURI } },
      launchURL
    };
    const plugin = createPlugin({ Zotero });
    await plugin.startup();

    const link = document.querySelector(".annotation-markdown-rendered a");
    link.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    link.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0
    }));

    expect(handleZoteroURI).toHaveBeenCalledOnce();
    expect(handleZoteroURI).toHaveBeenCalledWith(url);
    expect(launchURL).not.toHaveBeenCalled();
    expect(document.querySelector("[data-annotation-markdown-fast-editor='true']"))
      .toBeNull();

    plugin.shutdown();
  });

  test("leaves Zotero's native editor in control when annotation updates are unavailable", async () => {
    document.body.innerHTML = `
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" contenteditable="false">old</div></div>
      </div>
    `;
    const reader = { document };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({ Zotero });
    await plugin.startup();

    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    document.querySelector(".annotation-markdown-rendered").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector("[data-annotation-markdown-fast-editor='true']")).toBeNull();
    plugin.shutdown();
  });

  test("temporarily neutralizes Zotero's page-origin comment shortcuts while fast editing", async () => {
    document.body.innerHTML = `
      <button id="outside">outside</button>
      <div data-sidebar-annotation-id="a1" class="annotation selected">
        <div class="comment"><div class="content" contenteditable="false">old</div></div>
      </div>
    `;
    const internalReader = {
      _annotationManager: { updateAnnotations: vi.fn() },
      _enableAnnotationDeletionFromComment: true,
      _annotationSelectionTriggeredFromView: true
    };
    const returnFocusToView = vi.fn(() => document.querySelector("#outside").focus());
    const hostKeyDown = (event) => {
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) &&
        internalReader._annotationSelectionTriggeredFromView &&
        event.target.closest(".comment .content")
      ) {
        returnFocusToView();
      }
    };
    window.addEventListener("keydown", hostKeyDown, true);
    const reader = { document, _internalReader: internalReader };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({ Zotero });
    await plugin.startup();

    document.querySelector(".annotation-markdown-rendered")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    const textarea = document.querySelector("[data-annotation-markdown-fast-editor='true'] textarea");
    expect(internalReader._enableAnnotationDeletionFromComment).toBe(false);
    expect(internalReader._annotationSelectionTriggeredFromView).toBe(false);
    textarea.focus();
    textarea.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowLeft"
    }));

    expect(returnFocusToView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(textarea);
    document.querySelector("#outside").focus();

    expect(internalReader._enableAnnotationDeletionFromComment).toBe(true);
    expect(internalReader._annotationSelectionTriggeredFromView).toBe(true);
    plugin.shutdown();
    window.removeEventListener("keydown", hostKeyDown, true);
  });

  test("passes numeric font scale preferences into reader styles", async () => {
    const reader = { document };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {
        get: vi.fn((key, global) => (
          key === "extensions.annotationMarkdown.fontScalePercent" && global ? 120 : undefined
        ))
      }
    };
    const plugin = createPlugin({
      Zotero,
      styleText: ".annotation-markdown-rendered { font-size: var(--annotation-markdown-font-scale, 1em); }"
    });

    await plugin.startup();

    const style = document.querySelector("style[data-annotation-markdown-style='true']");
    expect(style?.textContent).toContain("--annotation-markdown-font-scale: 1.2em");

    plugin.shutdown();
  });

  test("refreshes open reader styles when font scale preference changes", async () => {
    let fontScalePercent = 100;
    const observers = new Map();
    const reader = { document };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {
        get: vi.fn((key, global) => (
          key === "extensions.annotationMarkdown.fontScalePercent" && global ? fontScalePercent : undefined
        )),
        registerObserver: vi.fn((key, handler) => {
          observers.set(key, handler);
          return `observer:${key}`;
        }),
        unregisterObserver: vi.fn()
      }
    };
    const plugin = createPlugin({
      Zotero,
      styleText: ".annotation-markdown-rendered { font-size: var(--annotation-markdown-font-scale, 1em); }"
    });

    await plugin.startup();
    fontScalePercent = 120;
    observers.get("extensions.annotationMarkdown.fontScalePercent")();

    const style = document.querySelector("style[data-annotation-markdown-style='true']");
    expect(style?.textContent).toContain("--annotation-markdown-font-scale: 1.2em");

    plugin.shutdown();
    expect(Zotero.Prefs.unregisterObserver).toHaveBeenCalledWith(
      "observer:extensions.annotationMarkdown.fontScalePercent"
    );
  });

  test("refreshes open readers when the math rendering preference changes", async () => {
    const observers = new Map();
    const refresh = vi.fn();
    const Zotero = {
      Reader: {
        registerEventListener: vi.fn()
      },
      Prefs: {
        registerObserver: vi.fn((key, handler) => {
          observers.set(key, handler);
          return `observer:${key}`;
        }),
        unregisterObserver: vi.fn()
      }
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => ({ refresh, shutdown: vi.fn() })
    });

    await plugin.startup();
    observers.get("extensions.annotationMarkdown.mathEnabled")();

    expect(refresh).toHaveBeenCalled();
    refresh.mockClear();
    observers.get("extensions.annotationMarkdown.renderStrategy")();
    expect(refresh).toHaveBeenCalled();

    plugin.shutdown();
    expect(Zotero.Prefs.unregisterObserver).toHaveBeenCalledWith(
      "observer:extensions.annotationMarkdown.mathEnabled"
    );
    expect(Zotero.Prefs.unregisterObserver).toHaveBeenCalledWith(
      "observer:extensions.annotationMarkdown.renderStrategy"
    );
  });

  test("opens rendered links through Zotero instead of the reader document", async () => {
    document.body.innerHTML = `<div data-annotation-id="a1" class="annotation"><div class="comment"><div class="content">https://example.com</div></div></div>`;
    const reader = { document };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {},
      launchURL: vi.fn()
    };
    const plugin = createPlugin({ Zotero });

    await plugin.startup();
    const link = document.querySelector(".annotation-markdown-rendered a");
    link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));

    expect(Zotero.launchURL).toHaveBeenCalledOnce();
    expect(Zotero.launchURL).toHaveBeenCalledWith("https://example.com");

    plugin.shutdown();
  });

  test("reader events register their reader with the registry", () => {
    const register = vi.fn();
    const Zotero = {
      Reader: {
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => ({ register, shutdown: vi.fn() })
    });

    plugin.startup();
    const handler = Zotero.Reader.registerEventListener.mock.calls[0][1];
    handler({ reader: { id: "reader-1" } });

    expect(register).toHaveBeenCalledWith({ id: "reader-1" });
  });

  test("reader events also accept a bare reader payload", () => {
    const register = vi.fn();
    const Zotero = {
      Reader: {
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => ({ register, shutdown: vi.fn() })
    });

    plugin.startup();
    const handler = Zotero.Reader.registerEventListener.mock.calls[0][1];
    const reader = { id: "reader-1" };
    handler(reader);

    expect(register).toHaveBeenCalledWith(reader);
  });

  test("reader events avoid hot-path diagnostic writes", () => {
    const append = vi.fn();
    const register = vi.fn();
    const Zotero = {
      Reader: {
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      diagnostics: { append },
      registryFactory: () => ({ register, shutdown: vi.fn() })
    });

    plugin.startup();
    append.mockClear();
    const handler = Zotero.Reader.registerEventListener.mock.calls[0][1];
    handler({ reader: { id: "reader-1" } });

    expect(register).toHaveBeenCalledWith({ id: "reader-1" });
    expect(append).not.toHaveBeenCalled();
  });

  test("startup tolerates async registry registration for open readers and reader events", async () => {
    const register = vi.fn(() => Promise.resolve());
    const shutdown = vi.fn();
    const listeners = {};
    const openReader = { id: "open" };
    const eventReader = { id: "event" };
    const Zotero = {
      Reader: {
        _readers: [openReader],
        registerEventListener: vi.fn((name, handler) => { listeners[name] = handler; }),
        unregisterEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => ({ register, shutdown }),
      logger: { log: vi.fn(), warn: vi.fn() }
    });

    await plugin.startup();
    await listeners.renderSidebarAnnotationHeader({ reader: eventReader });

    expect(register).toHaveBeenCalledWith(openReader);
    expect(register).toHaveBeenCalledWith(eventReader);
  });

  test("reader event handler returns the registry registration promise", () => {
    const registration = Promise.resolve();
    const register = vi.fn(() => registration);
    const Zotero = {
      Reader: {
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => ({ register, shutdown: vi.fn() })
    });

    plugin.startup();
    const handler = Zotero.Reader.registerEventListener.mock.calls[0][1];

    expect(handler({ reader: { id: "reader-1" } })).toBe(registration);
  });

  test("startup tolerates missing Zotero reader APIs", () => {
    const plugin = createPlugin({ Zotero: {}, registryFactory: () => ({ register: vi.fn(), shutdown: vi.fn() }) });

    expect(() => plugin.startup()).not.toThrow();
  });

  test("shutdown unregisters reader listener and clears controllers", () => {
    const shutdown = vi.fn();
    const Zotero = {
      Reader: {
        registerEventListener: vi.fn(),
        unregisterEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => ({ register: vi.fn(), shutdown })
    });

    plugin.startup();
    plugin.shutdown();

    expect(Zotero.Reader.unregisterEventListener).toHaveBeenCalledWith(
      "renderSidebarAnnotationHeader",
      Zotero.Reader.registerEventListener.mock.calls[0][1]
    );
    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});
