import { describe, expect, test, vi } from "vitest";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createSettingsStub, missingIntersectionObserver } from "./helpers/stubs.ts";
import { mutationObserverMock, type FixtureMutationCallback } from "./helpers/observers.ts";
import { fixtureRect, queryElement, requireElement, requireValue } from "./helpers/dom.ts";

interface PopupOptions {
  source?: string; viewport?: {width: number; height: number}; popupSize?: {width: number; height: number}; ready?: boolean;
  adapter?: Partial<Parameters<typeof createAnnotationSidebarAdapter>[0]>;
}
async function popupFixture(reader = {}, options: PopupOptions = {}) {
  vi.useFakeTimers();
  const callbacks: Array<(FixtureMutationCallback)> = [];
  const frames = new Map();
  let frameID = 0;
  const requestFrame = window.requestAnimationFrame;
  const cancelFrame = window.cancelAnimationFrame;
  const bodyRect = document.body.getBoundingClientRect;
  window.requestAnimationFrame = vi.fn(callback => {
    frames.set(++frameID, callback);
    return frameID;
  });
  window.cancelAnimationFrame = vi.fn(id => frames.delete(id));
  const Observer = mutationObserverMock(function (callback) {
    callbacks.push(callback);
    return { observe() {}, disconnect() {}, takeRecords: () => [] };
  });
  document.body.innerHTML = `
    <div class="annotation-popup" style="transform: translate(100px, 120px)">
      <div class="preview"><div class="comment"><div class="editor">
        <div id="OLD12345" class="content" contenteditable="true">old preview</div>
        <div class="renderer"></div>
      </div></div></div>
    </div>`;
  if (options.source !== undefined) queryElement(document, ".content").textContent = options.source;
  if (options.viewport) {
    const popup = document.querySelector(".annotation-popup");
    document.body.getBoundingClientRect = () => fixtureRect({ ...options.viewport, left: 0, top: 0 });
    Object.defineProperty(popup, "offsetWidth", { configurable: true, value: requireValue(options.popupSize).width });
    Object.defineProperty(popup, "offsetHeight", { configurable: true, value: requireValue(options.popupSize).height });
  }
  const controller = createReaderController({
    reader: { document, ...reader },
    adapter: createAnnotationSidebarAdapter({ document, ...options.adapter }),
    renderer: { render: (source: string) => `<p>${source}</p>` },
    settings: createSettingsStub({ isEnabled: () => true, isFastEditorEnabled: options.adapter?.isFastEditorEnabled }),
    MutationObserver: Observer,
    IntersectionObserver: missingIntersectionObserver
  });
  await controller.start();
  const popup = queryElement(document, ".annotation-popup");
  const content = popup.querySelector(".content");
  const preview = () => popup.querySelector("[data-annotation-markdown-preview='true']");
  const frame = () => {
    const batch = [...frames.values()];
    frames.clear();
    for (const callback of batch) callback(0);
  };
  const mutate = (type: MutationRecordType, target: Element, extra = {}) => callbacks[0]([{
    type, target, addedNodes: [], removedNodes: [], ...extra
  }]);
  vi.advanceTimersByTime(0);
  frame();
  frame();
  expect(popup.hasAttribute("data-annotation-markdown-popup-ready")).toBe(options.ready !== false);
  return {
    popup, content, preview, frame, mutate,
    cleanup() {
      controller.stop();
      window.requestAnimationFrame = requestFrame;
      window.cancelAnimationFrame = cancelFrame;
      document.body.getBoundingClientRect = bodyRect;
      vi.useRealTimers();
    }
  };
}

describe("reused native annotation popups", () => {
  test("reveals at the native final-size anchor even when its React position commit is delayed", async () => {
    const separateViewLayer = document.createElement("div");
    separateViewLayer.className = "primary-view";
    const f = await popupFixture({ _internalReader: { _views: [{
      _container: separateViewLayer,
      _annotationPopup: { rect: [300, 400, 340, 430], annotation: { id: "OLD12345" } }
    }] } }, { viewport: { width: 800, height: 600 }, popupSize: { width: 416, height: 535 } });
    try {
      expect(requireElement(f.popup, HTMLElement).style.transform).toBe("translate(360px, 20px)");
      // The deferred native commit now writes the position already revealed.
      requireElement(f.popup, HTMLElement).style.transform = "translate(360px, 20px)";
      f.mutate("attributes", f.popup, { attributeName: "style" });
      expect(requireValue(f.popup).getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
    } finally { f.cleanup(); }
  });

  test("keeps a page-origin empty popup hidden through native focus and fast-editor sizing", async () => {
    const openPopup = vi.fn();
    const f = await popupFixture({ _internalReader: {
      _annotationSelectionTriggeredFromView: true,
      _enableAnnotationDeletionFromComment: true,
      _views: [{ _annotationPopup: {}, _openAnnotationPopup: openPopup }]
    } }, { source: "", ready: false, adapter: {
      isFastEditorEnabled: () => true, commitComment: vi.fn(() => true)
    } });
    try {
      requireElement(f.content, HTMLElement).focus();
      f.frame();
      f.frame();
      expect(requireValue(f.popup).querySelector("textarea")).not.toBeNull();
      expect(requireValue(f.popup).hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      openPopup.mockImplementation(() => {
        expect(document.activeElement).toBe(requireValue(f.popup).querySelector("textarea"));
        expect(requireValue(f.popup).hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      });
      f.frame();
      expect(openPopup).toHaveBeenCalledOnce();
      f.frame();
      expect(requireValue(f.popup).hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      f.frame();
      expect(requireValue(f.popup).getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
    } finally { f.cleanup(); }
  });

  test("remeasures a newly mounted popup after its first preview render", async () => {
    const openPopup = vi.fn();
    const f = await popupFixture({ _internalReader: { _views: [{
      _annotationPopup: { annotation: { id: "OLD12345" } },
      _openAnnotationPopup: openPopup
    }] } });
    try { expect(openPopup).toHaveBeenCalledOnce(); }
    finally { f.cleanup(); }
  });

  test("does not reveal the previous preview while the new source is pending", async () => {
    const f = await popupFixture();
    try {
      // React commits the annotation ID before its Content effect updates text.
      requireValue(f.content).id = "NEW12345";
      f.mutate("attributes", requireValue(f.content), { attributeName: "id" });
      requireElement(f.popup, HTMLElement).style.transform = "translate(100px, 160px)";
      f.mutate("attributes", f.popup, { attributeName: "style" });
      vi.advanceTimersByTime(0);
      f.frame();
      f.frame();
      expect(requireValue(f.preview()).textContent).toBe("old preview");
      expect(requireValue(f.popup).hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);

      requireValue(f.content).textContent = "new preview";
      f.mutate("childList", requireValue(f.content), { addedNodes: [requireValue(f.content).firstChild] });
      expect(requireValue(f.preview()).textContent).toBe("new preview");
      expect(requireValue(f.popup).hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      vi.advanceTimersByTime(0);
      f.frame();
      expect(requireValue(f.popup).hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      f.frame();
      expect(requireValue(f.popup).getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
    } finally { f.cleanup(); }
  });

  test("remeasures the open native popup after rendering and before reveal", async () => {
    const openPopup = vi.fn();
    const f = await popupFixture({
      _internalReader: { _views: [{
        _annotationPopup: { annotation: { id: "NEW12345" } },
        _openAnnotationPopup: openPopup
      }] }
    });
    try {
      openPopup.mockClear();
      openPopup.mockImplementation(() => {
        expect(requireValue(f.popup).hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
        expect(requireValue(f.preview()).textContent).toBe("a longer new preview");
        requireElement(f.popup, HTMLElement).style.transform = "translate(100px, 50px)";
      });
      requireValue(f.content).id = "NEW12345";
      f.mutate("attributes", requireValue(f.content), { attributeName: "id" });
      requireValue(f.content).textContent = "a longer new preview";
      f.mutate("childList", requireValue(f.content), { addedNodes: [requireValue(f.content).firstChild] });
      expect(openPopup).toHaveBeenCalledOnce();
      f.mutate("attributes", f.popup, { attributeName: "style" });
      vi.advanceTimersByTime(0);
      f.frame();
      f.frame();
      expect(requireValue(f.popup).getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
      expect(requireElement(f.popup, HTMLElement).style.transform).toBe("translate(100px, 50px)");
      // Subsequent host commits must keep a completed popup visible.
      f.mutate("childList", requireValue(f.content), { addedNodes: [requireValue(f.content).firstChild] });
      expect(openPopup).toHaveBeenCalledOnce();
      expect(requireValue(f.popup).getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
    } finally { f.cleanup(); }
  });

  test("refreshes reused identical-source popups through the safety scan", async () => {
    const f = await popupFixture();
    try {
      requireValue(f.content).id = "NEW12345";
      f.mutate("attributes", requireValue(f.content), { attributeName: "id" });
      vi.advanceTimersByTime(0);
      f.frame();
      f.frame();
      expect(requireValue(f.popup).hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      // An identical comment has no native text mutation to trigger a render.
      vi.advanceTimersByTime(80);
      f.frame();
      f.frame();
      expect(requireValue(f.popup).getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
      expect(requireValue(f.preview()).textContent).toBe("old preview");
    } finally { f.cleanup(); }
  });

  test("gives a late render fresh settling time instead of revealing at the mount deadline", async () => {
    const f = await popupFixture();
    try {
      requireValue(f.content).id = "NEW12345";
      f.mutate("attributes", requireValue(f.content), { attributeName: "id" });
      vi.advanceTimersByTime(740);
      requireValue(f.content).textContent = "late expensive formula preview";
      f.mutate("childList", requireValue(f.content), { addedNodes: [requireValue(f.content).firstChild] });
      vi.advanceTimersByTime(10);
      expect(requireValue(f.popup).hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      requireElement(f.popup, HTMLElement).style.transform = "translate(240px, 50px)";
      f.mutate("attributes", f.popup, { attributeName: "style" });
      f.frame();
      expect(requireValue(f.popup).hasAttribute("data-annotation-markdown-popup-ready")).toBe(false);
      f.frame();
      expect(requireValue(f.popup).getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
    } finally { f.cleanup(); }
  });

  test("shows the active native editor without a stale preview at the reveal deadline", async () => {
    const f = await popupFixture();
    try {
      requireValue(f.content).id = "NEW12345";
      f.mutate("attributes", requireValue(f.content), { attributeName: "id" });
      requireElement(f.content, HTMLElement).focus();
      vi.advanceTimersByTime(750);
      expect(requireValue(f.popup).getAttribute("data-annotation-markdown-popup-ready")).toBe("true");
      expect(f.preview()).toBeNull();
      expect(requireElement(requireValue(f.content).closest(".editor"), HTMLElement).hidden).toBe(false);
    } finally { f.cleanup(); }
  });
});
