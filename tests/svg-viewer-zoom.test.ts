import { afterEach, describe, expect, test, vi } from "vitest";
import { createSvgPreviewViewer } from "../src/svg-preview-viewer.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { fixtureRect, queryElement, requireElement, requireValue } from "./helpers/dom.ts";

let viewer: (({ start(): void; close: (restoreFocus?: boolean) => void; stop(): void; })) | undefined;
afterEach(() => { viewer?.stop(); document.body.innerHTML = ""; });

function fixture(width = 1000, height = 500, readerSize?: number[]) {
  const source = `\`\`\`svg\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="red"/></svg>\n\`\`\``;
  document.body.innerHTML = `<div class="annotation-markdown-rendered" data-annotation-markdown-preview="true">${createMarkdownRenderer({ isSvgEnabled: () => true }).render(source)}</div>`;
  viewer = createSvgPreviewViewer({ document, isEnabled: () => true }); viewer.start();
  const opener = queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement); opener.click();
  const frame = queryElement(document, ".annotation-markdown-svg-viewer-frame", HTMLIFrameElement);
  const doc = frame.contentDocument, win = requireValue(doc).defaultView;
  const image = queryElement(doc, "img", HTMLImageElement), region = queryElement(doc, ".annotation-markdown-svg-viewer-region");
  const button = (label: string) => requireValue(doc).querySelector(`button[aria-label="${label}"]`);
  // jsdom has no layout. Model a centered image and clamped native scroll offsets.
  const toolbar = queryElement(doc, ".annotation-markdown-svg-viewer-toolbar");
  const viewportWidth = () => readerSize ? Math.min(readerSize[0], parseFloat(frame.style.width)) : 400;
  const viewportHeight = () => readerSize ? Math.min(readerSize[1], parseFloat(frame.style.height)) - 44 : 180;
  if (readerSize) {
    const overlay = frame.parentElement;
    Object.defineProperties(overlay, { clientWidth: { get: () => readerSize[0] }, clientHeight: { get: () => readerSize[1] } });
    toolbar.getBoundingClientRect = () => (fixtureRect({ height: 42 }));
    frame.getBoundingClientRect = () => (fixtureRect({ left: (readerSize[0] - viewportWidth()) / 2, top: (readerSize[1] - viewportHeight() - 44) / 2 }));
  }
  let left = 0, top = 0;
  Object.defineProperties(region, {
    clientWidth: { get: viewportWidth, configurable: true }, clientHeight: { get: viewportHeight, configurable: true },
    scrollWidth: { get: () => Math.max(viewportWidth(), image.width) }, scrollHeight: { get: () => Math.max(viewportHeight(), image.height) },
    scrollLeft: { get: () => left, set: value => { left = Math.max(0, Math.min(image.width - viewportWidth(), value)); } },
    scrollTop: { get: () => top, set: value => { top = Math.max(0, Math.min(image.height - viewportHeight(), value)); } }
  });
  region.getBoundingClientRect = () => (fixtureRect({ left: 10, top: 20, width: viewportWidth(), height: viewportHeight() }));
  image.getBoundingClientRect = () => (fixtureRect({ left: 10 + Math.max(0, (viewportWidth() - image.width) / 2) - left, top: 20 + Math.max(0, (viewportHeight() - image.height) / 2) - top, width: image.width, height: image.height }));
  requireValue(win).dispatchEvent(new (requireValue(win).Event)("resize"));
  const wheel = (target = image, options: WheelEventInit = {}) => {
    const event = new (requireValue(win).WheelEvent)("wheel", { bubbles: true, cancelable: true, deltaY: -100, clientX: 150, clientY: 100, ...options });
    requireValue(target).dispatchEvent(event); return event;
  };
  const pointer = (type: string, target = region, options: PointerEventInit = {}) => {
    const event = new (requireValue(win).MouseEvent)(type, { bubbles: true, cancelable: true, button: 0, clientX: 200, clientY: 100, ...options });
    Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
    Object.defineProperty(event, "isPrimary", { value: true });
    requireValue(target).dispatchEvent(event); return event;
  };
  // Reach a known magnification through the remaining user-facing wheel action.
  const actualSize = () => wheel(image, { deltaY: -Math.log(width / image.width) / 0.002 });
  return { source, opener, frame, doc, win, image, region, button, wheel, pointer, actualSize };
}

describe("SVG viewer zoom and pan", () => {
  test("has one Fit reset, shows the current percentage and fits oversized diagrams", () => {
    const f = fixture();
    expect(requireValue(f.image).width).toBe(360); expect(requireValue(f.image).height).toBe(180);
    expect(queryElement(f.doc, "output", HTMLOutputElement).textContent).toBe("36%");
    expect([...requireValue(f.doc).querySelectorAll("button")].map(node => node.getAttribute("aria-label"))).toEqual(["Zoom out", "Zoom in", "Fit diagram", "Close diagram"]);
    requireElement(f.button("Zoom in"), HTMLButtonElement).click(); expect(requireValue(f.image).width).toBeGreaterThan(360);
    requireElement(f.button("Zoom out"), HTMLButtonElement).click(); expect(requireValue(f.image).width).toBe(360);
    f.actualSize(); expect(requireValue(f.image).width).toBe(1000);
    requireElement(f.button("Fit diagram"), HTMLButtonElement).click(); expect(requireValue(f.image).width).toBe(360);
    expect(requireValue(f.image).src).toBe(queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).src);
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("grows and shrinks the frame with the image using the same zoom controls", () => {
    const f = fixture(640, 280, [1900, 1000]);
    expect([requireValue(f.image).width, requireValue(f.image).height]).toEqual([640, 280]);
    expect([requireElement(f.frame, HTMLElement).style.width, requireElement(f.frame, HTMLElement).style.height]).toEqual(["640px", "324px"]);
    requireElement(f.button("Zoom in"), HTMLButtonElement).click();
    expect([requireValue(f.image).width, requireValue(f.image).height]).toEqual([800, 350]);
    expect([requireElement(f.frame, HTMLElement).style.width, requireElement(f.frame, HTMLElement).style.height]).toEqual(["800px", "394px"]);
    expect(requireValue(f.region).classList.contains("annotation-markdown-svg-pannable")).toBe(false);
    f.wheel(); expect(parseFloat(requireElement(f.frame, HTMLElement).style.width)).toBe(requireValue(f.image).width);
    requireElement(f.button("Fit diagram"), HTMLButtonElement).click();
    expect([requireElement(f.frame, HTMLElement).style.width, requireElement(f.frame, HTMLElement).style.height]).toEqual(["640px", "324px"]);
    requireElement(f.button("Zoom out"), HTMLButtonElement).click(); expect(requireElement(f.frame, HTMLElement).style.width).toBe("512px");
  });

  test("uses the Reader bounds for Fit after shrinking and pans only after reaching the bounds", () => {
    const f = fixture(800, 800, [1900, 1000]);
    requireElement(f.button("Zoom out"), HTMLButtonElement).click(); requireElement(f.button("Zoom out"), HTMLButtonElement).click();
    requireElement(f.button("Fit diagram"), HTMLButtonElement).click(); expect(requireValue(f.image).width).toBe(800);
    requireElement(f.button("Zoom in"), HTMLButtonElement).click(); expect(requireValue(f.region).classList.contains("annotation-markdown-svg-pannable")).toBe(true);
    for (let i = 0; i < 20; i++) requireElement(f.button("Zoom in"), HTMLButtonElement).click();
    expect(requireValue(f.region).clientWidth).toBe(1900); expect(requireValue(f.region).clientHeight).toBe(956);
    requireElement(f.button("Fit diagram"), HTMLButtonElement).click(); expect(requireValue(f.image).width).toBe(800);
    expect(requireValue(f.region).classList.contains("annotation-markdown-svg-pannable")).toBe(false);
  });

  test("refits oversized diagrams on Reader resize without a shrinking feedback loop", () => {
    const size = [900, 600], f = fixture(1600, 800, size);
    expect(requireValue(f.image).width).toBe(900);
    for (let i = 0; i < 5; i++) requireValue(f.win).dispatchEvent(new (requireValue(f.win).Event)("resize"));
    expect(requireValue(f.image).width).toBe(900);
    size[0] = 700; window.dispatchEvent(new Event("resize")); expect(requireValue(f.image).width).toBe(700);
    requireElement(f.button("Zoom in"), HTMLButtonElement).click(); const manual = requireValue(f.image).width;
    size[0] = 900; window.dispatchEvent(new Event("resize")); expect(requireValue(f.image).width).toBe(manual);
    requireElement(f.button("Fit diagram"), HTMLButtonElement).click(); expect(requireValue(f.image).width).toBe(900);
  });

  test("bounds repeated zoom and disables unavailable controls", () => {
    const f = fixture();
    for (let i = 0; i < 70; i++) requireElement(f.button("Zoom in"), HTMLButtonElement).click();
    expect(requireValue(f.image).width).toBe(4000); expect(requireElement(f.button("Zoom in"), HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 70; i++) requireElement(f.button("Zoom out"), HTMLButtonElement).click();
    expect(requireValue(f.image).width).toBe(10); expect(requireElement(f.button("Zoom out"), HTMLButtonElement).disabled).toBe(true);
    requireElement(f.button("Fit diagram"), HTMLButtonElement).click(); expect(requireValue(f.image).width).toBe(360);
  });

  test("keeps the point under the mouse fixed while zooming and prevents page scrolling", () => {
    const f = fixture(); f.actualSize();
    requireValue(f.region).scrollLeft = 200; requireValue(f.region).scrollTop = 100;
    const before = requireValue(f.image).getBoundingClientRect(), px = 150, py = 100;
    const point = [(px - before.left) / requireValue(f.image).width, (py - before.top) / requireValue(f.image).height];
    const event = f.wheel(); const after = requireValue(f.image).getBoundingClientRect();
    expect(event.defaultPrevented).toBe(true);
    expect(after.left + point[0] * requireValue(f.image).width).toBeCloseTo(px, 0);
    expect(after.top + point[1] * requireValue(f.image).height).toBeCloseTo(py, 0);
    f.wheel(requireValue(requireValue(f.doc).querySelector(".annotation-markdown-svg-viewer-toolbar")));
    expect(requireValue(f.image).width).toBe(after.width);
  });

  test.each([[0, 100], [1, 6.25], [2, 100 / 180]] as const)("normalizes wheel delta mode %s", (deltaMode, deltaY) => {
    const f = fixture(); f.actualSize();
    f.wheel(f.image, { deltaMode, deltaY });
    expect(requireValue(f.image).width).toBeCloseTo(819, 0);
  });

  test("ignores horizontal wheel motion and confines events to the viewer", () => {
    const host: Array<string> = []; const capture = (event: Event) => host.push(event.type);
    window.addEventListener("wheel", capture, true);
    try {
      const f = fixture(); f.wheel(f.image, { deltaY: 0, deltaX: 100 });
      expect(requireValue(f.image).width).toBe(360); expect(host).toEqual([]);
      window.dispatchEvent(new WheelEvent("wheel")); expect(host).toEqual(["wheel"]);
    } finally { window.removeEventListener("wheel", capture, true); }
  });

  test("drags an enlarged image, ignores other pointers, and stops on release or cancel", () => {
    const f = fixture(); f.actualSize();
    requireValue(f.region).scrollLeft = 200; requireValue(f.region).scrollTop = 100;
    f.pointer("pointerdown", f.image);
    f.pointer("pointermove", f.region, { clientX: 160, clientY: 70, pointerId: 2 });
    expect(requireValue(f.region).scrollLeft).toBe(200);
    f.pointer("pointermove", f.region, { clientX: 160, clientY: 70 });
    expect([requireValue(f.region).scrollLeft, requireValue(f.region).scrollTop]).toEqual([240, 130]);
    f.pointer("pointerup"); f.pointer("pointermove", f.region, { clientX: 50 });
    expect(requireValue(f.region).scrollLeft).toBe(240);
    f.pointer("pointerdown"); f.pointer("pointercancel"); f.pointer("pointermove", f.region, { clientX: 50 });
    expect(requireValue(f.region).scrollLeft).toBe(240);
    f.pointer("pointerdown", f.image, { button: 2 }); f.pointer("pointermove", f.region, { clientX: 50 });
    expect(requireValue(f.region).scrollLeft).toBe(240);
  });

  test("cycles focus in both directions, skips disabled controls and restores the opener on Escape", () => {
    const f = fixture(); const close = f.button("Close diagram");
    expect(requireValue(f.doc).activeElement).toBe(close);
    requireValue(close).dispatchEvent(new (requireValue(f.win).KeyboardEvent)("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(requireValue(f.doc).activeElement).toBe(f.region);
    requireValue(f.region).dispatchEvent(new (requireValue(f.win).KeyboardEvent)("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(requireValue(f.doc).activeElement).toBe(f.button("Zoom out"));
    requireValue(f.button("Zoom out")).dispatchEvent(new (requireValue(f.win).KeyboardEvent)("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(requireValue(f.doc).activeElement).toBe(f.region);
    for (let i = 0; i < 70; i++) requireElement(f.button("Zoom out"), HTMLButtonElement).click();
    requireElement(f.region, HTMLElement).focus(); requireValue(f.region).dispatchEvent(new (requireValue(f.win).KeyboardEvent)("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(requireValue(f.doc).activeElement).toBe(f.button("Zoom in"));
    requireValue(requireValue(f.doc).activeElement).dispatchEvent(new (requireValue(f.win).KeyboardEvent)("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.querySelector(".annotation-markdown-svg-viewer-frame")).toBeNull();
    expect(document.activeElement).toBe(f.opener);
    requireElement(f.opener, HTMLElement).click(); expect(queryElement(queryElement(document, "iframe", HTMLIFrameElement).contentDocument, "img", HTMLImageElement).width).toBe(1000);
  });

  test("does not enlarge small diagrams during fit or resize, and preserves manual zoom on resize", () => {
    const f = fixture(100, 45); expect(requireValue(f.image).width).toBe(100);
    requireElement(f.button("Zoom in"), HTMLButtonElement).click(); const width = requireValue(f.image).width;
    requireValue(f.win).dispatchEvent(new (requireValue(f.win).Event)("resize")); expect(requireValue(f.image).width).toBe(width);
    requireElement(f.button("Fit diagram"), HTMLButtonElement).click(); expect(requireValue(f.image).width).toBe(100);
  });

  test("caps rendered dimensions for the largest permitted SVG and ignores wheel events after stop", () => {
    const f = fixture(4096, 4096);
    for (let i = 0; i < 70; i++) requireElement(f.button("Zoom in"), HTMLButtonElement).click();
    expect(requireValue(f.image).width).toBe(8192); expect(requireElement(f.button("Zoom in"), HTMLButtonElement).disabled).toBe(true);
    requireValue(viewer).stop();
    const before = requireValue(f.image).width; f.wheel(); expect(requireValue(f.image).width).toBe(before);
    requireElement(f.opener, HTMLElement).click(); expect(document.querySelector("iframe")).toBeNull();
  });

  test("fits the whole viewport even when the previous zoom has native scrollbars", () => {
    const f = fixture();
    Object.defineProperties(f.region, {
      clientWidth: { get: () => requireValue(f.image).width > 400 || requireValue(f.image).height > 180 ? 384 : 400 },
      clientHeight: { get: () => requireValue(f.image).width > 400 || requireValue(f.image).height > 180 ? 164 : 180 }
    });
    f.actualSize();
    requireElement(f.button("Fit diagram"), HTMLButtonElement).click();
    expect([requireValue(f.image).width, requireValue(f.image).height]).toEqual([360, 180]);
    requireElement(f.button("Fit diagram"), HTMLButtonElement).click(); expect(requireValue(f.image).width).toBe(360);
  });

  test("keeps scroll-blocking Reader listeners scoped to the open modal", () => {
    // A non-passive wheel listener can disable Gecko's asynchronous scrolling,
    // even when its callback does nothing. Observe its actual modal lifetime.
    const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
    const active = new Set(), registrations: Array<(boolean)> = [];
    const addSpy = vi.spyOn(window, "addEventListener").mockImplementation((type: string, callback, options) => {
      if (type === "wheel" && typeof options === "object" && options.passive === false) {
        active.add(callback); registrations.push(!!document.querySelector(".annotation-markdown-svg-viewer"));
      }
      add(type, callback, options);
    });
    const removeSpy = vi.spyOn(window, "removeEventListener").mockImplementation((type: string, callback, options) => {
      if (type === "wheel") active.delete(callback);
      remove(type, callback, options);
    });
    try {
      const f = fixture(); expect(registrations).toEqual([true]); expect(active.size).toBe(1);
      requireValue(viewer).close(); expect(active.size).toBe(0);
      requireElement(f.opener, HTMLElement).click(); expect(active.size).toBe(1);
      requireValue(viewer).stop(); expect(active.size).toBe(0);
    } finally { viewer?.stop(); addSpy.mockRestore(); removeSpy.mockRestore(); }
  });
});
