import { afterEach, describe, expect, test, vi } from "vitest";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createSettings } from "../src/settings.ts";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { isSvgPreviewControl } from "../src/svg-preview-viewer.ts";
import { missingIntersectionObserver, missingMutationObserver } from "./helpers/stubs.ts";
import { queryElement, requireValue } from "./helpers/dom.ts";

const url = "https://images.openai.com/static-rsc-4/sample-image";
const data = "data:image/png;base64,AQID";
const source = `[Photo **caption**](${url})\n\n![Ordinary](https://example.org/ordinary.png)`;
const controllers: ReturnType<typeof createReaderController>[] = [];
afterEach(() => { controllers.splice(0).forEach(controller => controller.stop()); vi.restoreAllMocks(); document.body.innerHTML = ""; });

async function fixture(popup = false, load = vi.fn(async () => data)) {
  document.body.innerHTML = `${popup ? '<div class="annotation-popup">' : ''}<div class="annotation selected" data-sidebar-annotation-id="a1"><div class="comment"><div class="expandable-editor"><div class="content" contenteditable="true"></div></div></div></div>${popup ? '</div>' : ''}`;
  const original = queryElement(document, ".content"); original.textContent = source;
  const settings = createSettings(); settings.setPopupEnabled(popup); settings.setRenderStrategy("eager");
  const openLink = vi.fn();
  const adapter = createAnnotationSidebarAdapter({ document, openLink, isFastEditorEnabled: () => true, commitComment: () => true });
  const controller = createReaderController({ reader: { document }, adapter, settings, loadLinkedImage: load,
    renderer: createMarkdownRenderer({ deferLinkedImages: true }),
    MutationObserver: missingMutationObserver, IntersectionObserver: missingIntersectionObserver });
  controllers.push(controller); await controller.start();
  const image = queryElement(document, "figure.annotation-markdown-linked-image img", HTMLImageElement);
  const anchor = queryElement(document, "a.annotation-markdown-linked-image-target", HTMLAnchorElement);
  return { controller, settings, adapter, openLink, load, image, anchor, original };
}

function decoded(image: HTMLImageElement, width = 1200, height = 600) {
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height } });
}
function click(target: Element, button = 0) {
  const events = ["pointerdown", "mousedown", button === 0 ? "click" : "contextmenu"].map(type => new MouseEvent(type, { bubbles: true, cancelable: true, button, detail: 1 }));
  events.forEach(event => target.dispatchEvent(event)); return events;
}
function frame() { return queryElement(document, "[data-annotation-markdown-svg-viewer] iframe", HTMLIFrameElement); }

describe.each([false, true])("linked raster viewer (popup=%s)", popup => {
  test("opens the cached image with SVG/Mermaid off, zooms, closes and keeps caption routing and source editing", async () => {
    const f = await fixture(popup);
    await vi.waitFor(() => expect(f.image.getAttribute("src")).toBe(data)); decoded(f.image);
    expect(f.settings.isSvgEnabled()).toBe(false); expect(f.settings.isMermaidEnabled()).toBe(false);
    const scroll = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
    f.image.dispatchEvent(scroll); expect(scroll.defaultPrevented).toBe(false);
    click(f.image);
    const viewer = frame(), content = requireValue(viewer.contentDocument), win = requireValue(viewer.contentWindow);
    const large = queryElement(content, "img", HTMLImageElement);
    expect(large.src).toBe(data); expect(large.width).toBe(1200); expect(large.height).toBe(600);
    expect(viewer.title).toBe("Photo caption"); expect(f.openLink).not.toHaveBeenCalled(); expect(f.load).toHaveBeenCalledOnce();
    expect(document.querySelector("textarea")).toBeNull(); expect(f.original.textContent).toBe(source);
    queryElement(content, "button[aria-label='Zoom in']", HTMLButtonElement).click(); expect(large.width).toBe(1500);
    const wheel = new win.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -60 });
    large.dispatchEvent(wheel); expect(wheel.defaultPrevented).toBe(true); expect(large.width).toBeGreaterThan(1500);
    queryElement(content, "button[aria-label='Fit image']", HTMLButtonElement).click(); expect(large.width).toBe(1200);
    win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull(); expect(document.activeElement).toBe(f.anchor);
    click(queryElement(document, "figcaption a")); expect(f.openLink).toHaveBeenCalledExactlyOnceWith(url);
    f.anchor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    queryElement(frame().contentDocument, "button[aria-label='Close image']", HTMLButtonElement).click();
    expect(document.activeElement).toBe(f.anchor); expect(f.load).toHaveBeenCalledOnce();
    queryElement(document, ".annotation-markdown-rendered").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(queryElement(document, "textarea", HTMLTextAreaElement).value).toBe(source);
  });

  test("leaves right-clicks, captions and ordinary Markdown images outside the viewer controls", async () => {
    const f = await fixture(popup); await vi.waitFor(() => expect(f.image.getAttribute("src")).toBe(data)); decoded(f.image);
    expect(isSvgPreviewControl(f.image)).toBe(true);
    expect(isSvgPreviewControl(queryElement(document, "figcaption a"))).toBe(false);
    expect(isSvgPreviewControl(queryElement(document, "p img"))).toBe(false);
    expect(click(f.image, 2).every(event => !event.defaultPrevented)).toBe(true);
    expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull(); expect(f.openLink).not.toHaveBeenCalled();
  });

  test("bounds very large raster dimensions when fitting or zooming", async () => {
    const f = await fixture(popup); await vi.waitFor(() => expect(f.image.getAttribute("src")).toBe(data));
    for (const width of [20000, 1200000]) {
      decoded(f.image, width, width / 2); click(f.image);
      const content = requireValue(frame().contentDocument), large = queryElement(content, "img", HTMLImageElement);
      expect(large.width).toBeLessThanOrEqual(8192); expect(large.height).toBeLessThanOrEqual(8192);
      const plus = queryElement(content, "button[aria-label='Zoom in']", HTMLButtonElement);
      plus.click(); expect(large.width).toBeLessThanOrEqual(8192);
      queryElement(content, "button[aria-label='Fit image']", HTMLButtonElement).click(); expect(large.width).toBeLessThanOrEqual(8192);
      queryElement(content, "button[aria-label='Close image']", HTMLButtonElement).click();
    }
  });

  test("recovers a replaced final document without an iframe load event", async () => {
    const f = await fixture(popup); await vi.waitFor(() => expect(f.image.getAttribute("src")).toBe(data)); decoded(f.image);
    const callbacks: FrameRequestCallback[] = [], originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => { callbacks.push(callback); return callbacks.length; };
    try {
      click(f.image);
      const viewer = frame(), content = requireValue(viewer.contentDocument), win = requireValue(viewer.contentWindow);
      content.open(); content.write("<!doctype html><html><head></head><body></body></html>"); content.close();
      Object.defineProperties(content, { documentURI: { configurable: true, value: "about:srcdoc" }, readyState: { configurable: true, value: "complete" } });
      win.HTMLImageElement.prototype.decode = () => Promise.resolve();
      expect(content.querySelector("img")).toBeNull();
      expect(callbacks.length).toBeGreaterThan(0); callbacks.shift()!(0);
      await Promise.resolve();
      expect(queryElement(content, "img", HTMLImageElement).src).toBe(data);
      expect(queryElement(document, "[data-annotation-markdown-svg-viewer]", HTMLElement).style.opacity).toBe("");
      expect(f.original.textContent).toBe(source);
    } finally { f.controller.stop(); window.requestAnimationFrame = originalRaf; }
  });

  test("keeps original links available on load/decode failure and refuses non-raster data", async () => {
    const f = await fixture(popup); await vi.waitFor(() => expect(f.image.getAttribute("src")).toBe(data));
    expect(isSvgPreviewControl(f.image)).toBe(false);
    decoded(f.image); f.image.src = "data:text/html;base64,PGgxPlg8L2gxPg==";
    expect(isSvgPreviewControl(f.image)).toBe(false);
    f.image.src = "data:image/svg+xml;charset=utf-8,%3Csvg/%3E";
    expect(isSvgPreviewControl(f.image)).toBe(false);
    f.image.src = data; f.image.dispatchEvent(new Event("error"));
    expect(f.anchor.hidden).toBe(true); expect(isSvgPreviewControl(f.image)).toBe(false);
    click(queryElement(document, "figcaption a")); expect(f.openLink).toHaveBeenCalledExactlyOnceWith(url);
    expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull(); expect(f.original.textContent).toBe(source);
  });

  test("closes the viewer on refresh and shutdown, and honors a failed editor save", async () => {
    const f = await fixture(popup); await vi.waitFor(() => expect(f.image.getAttribute("src")).toBe(data)); decoded(f.image);
    const closeEditor = vi.spyOn(f.adapter, "closeActiveFastEditor").mockReturnValue(false);
    click(f.image); expect(closeEditor).toHaveBeenCalled(); expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
    expect(f.openLink).not.toHaveBeenCalled(); closeEditor.mockRestore();
    click(f.image); expect(frame()).not.toBeNull(); f.controller.refresh?.();
    expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
    const current = queryElement(document, "figure img", HTMLImageElement);
    await vi.waitFor(() => expect(current.getAttribute("src")).toBe(data)); decoded(current);
    click(current); expect(frame()).not.toBeNull(); f.controller.stop();
    expect(document.querySelector("[data-annotation-markdown-svg-viewer], [data-annotation-markdown-preview]")).toBeNull();
    expect(f.original.textContent).toBe(source);
  });
});
