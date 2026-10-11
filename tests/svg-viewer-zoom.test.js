import { afterEach, describe, expect, test, vi } from "vitest";
import { createSvgPreviewViewer } from "../src/svg-preview-viewer.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";

let viewer;
afterEach(() => { viewer?.stop(); document.body.innerHTML = ""; });

function fixture(width = 1000, height = 500, readerSize) {
  const source = `\`\`\`svg\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="red"/></svg>\n\`\`\``;
  document.body.innerHTML = `<div class="annotation-markdown-rendered" data-annotation-markdown-preview="true">${createMarkdownRenderer({ isSvgEnabled: () => true }).render(source)}</div>`;
  viewer = createSvgPreviewViewer({ document, isEnabled: () => true }); viewer.start();
  const opener = document.querySelector(".annotation-markdown-svg-open"); opener.click();
  const frame = document.querySelector(".annotation-markdown-svg-viewer-frame");
  const doc = frame.contentDocument, win = doc.defaultView;
  const image = doc.querySelector("img"), region = doc.querySelector(".annotation-markdown-svg-viewer-region");
  const button = label => doc.querySelector(`button[aria-label="${label}"]`);
  // jsdom has no layout. Model a centered image and clamped native scroll offsets.
  const toolbar = doc.querySelector(".annotation-markdown-svg-viewer-toolbar");
  const viewportWidth = () => readerSize ? Math.min(readerSize[0], parseFloat(frame.style.width)) : 400;
  const viewportHeight = () => readerSize ? Math.min(readerSize[1], parseFloat(frame.style.height)) - 44 : 180;
  if (readerSize) {
    const overlay = frame.parentElement;
    Object.defineProperties(overlay, { clientWidth: { get: () => readerSize[0] }, clientHeight: { get: () => readerSize[1] } });
    toolbar.getBoundingClientRect = () => ({ height: 42 });
    frame.getBoundingClientRect = () => ({ left: (readerSize[0] - viewportWidth()) / 2, top: (readerSize[1] - viewportHeight() - 44) / 2 });
  }
  let left = 0, top = 0;
  Object.defineProperties(region, {
    clientWidth: { get: viewportWidth, configurable: true }, clientHeight: { get: viewportHeight, configurable: true },
    scrollWidth: { get: () => Math.max(viewportWidth(), image.width) }, scrollHeight: { get: () => Math.max(viewportHeight(), image.height) },
    scrollLeft: { get: () => left, set: value => { left = Math.max(0, Math.min(image.width - viewportWidth(), value)); } },
    scrollTop: { get: () => top, set: value => { top = Math.max(0, Math.min(image.height - viewportHeight(), value)); } }
  });
  region.getBoundingClientRect = () => ({ left: 10, top: 20, width: viewportWidth(), height: viewportHeight() });
  image.getBoundingClientRect = () => ({ left: 10 + Math.max(0, (viewportWidth() - image.width) / 2) - left, top: 20 + Math.max(0, (viewportHeight() - image.height) / 2) - top, width: image.width, height: image.height });
  win.dispatchEvent(new win.Event("resize"));
  const wheel = (target = image, options = {}) => {
    const event = new win.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100, clientX: 150, clientY: 100, ...options });
    target.dispatchEvent(event); return event;
  };
  const pointer = (type, target = region, options = {}) => {
    const event = new win.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 200, clientY: 100, ...options });
    Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
    Object.defineProperty(event, "isPrimary", { value: true });
    target.dispatchEvent(event); return event;
  };
  // Reach a known magnification through the remaining user-facing wheel action.
  const actualSize = () => wheel(image, { deltaY: -Math.log(width / image.width) / 0.002 });
  return { source, opener, frame, doc, win, image, region, button, wheel, pointer, actualSize };
}

describe("SVG viewer zoom and pan", () => {
  test("has one Fit reset, shows the current percentage and fits oversized diagrams", () => {
    const f = fixture();
    expect(f.image.width).toBe(360); expect(f.image.height).toBe(180);
    expect(f.doc.querySelector("output").textContent).toBe("36%");
    expect([...f.doc.querySelectorAll("button")].map(node => node.getAttribute("aria-label"))).toEqual(["Zoom out", "Zoom in", "Fit diagram", "Close SVG diagram"]);
    f.button("Zoom in").click(); expect(f.image.width).toBeGreaterThan(360);
    f.button("Zoom out").click(); expect(f.image.width).toBe(360);
    f.actualSize(); expect(f.image.width).toBe(1000);
    f.button("Fit diagram").click(); expect(f.image.width).toBe(360);
    expect(f.image.src).toBe(document.querySelector(".annotation-markdown-svg-image").src);
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("grows and shrinks the frame with the image using the same zoom controls", () => {
    const f = fixture(640, 280, [1900, 1000]);
    expect([f.image.width, f.image.height]).toEqual([640, 280]);
    expect([f.frame.style.width, f.frame.style.height]).toEqual(["640px", "324px"]);
    f.button("Zoom in").click();
    expect([f.image.width, f.image.height]).toEqual([800, 350]);
    expect([f.frame.style.width, f.frame.style.height]).toEqual(["800px", "394px"]);
    expect(f.region.classList.contains("annotation-markdown-svg-pannable")).toBe(false);
    f.wheel(); expect(parseFloat(f.frame.style.width)).toBe(f.image.width);
    f.button("Fit diagram").click();
    expect([f.frame.style.width, f.frame.style.height]).toEqual(["640px", "324px"]);
    f.button("Zoom out").click(); expect(f.frame.style.width).toBe("512px");
  });

  test("uses the Reader bounds for Fit after shrinking and pans only after reaching the bounds", () => {
    const f = fixture(800, 800, [1900, 1000]);
    f.button("Zoom out").click(); f.button("Zoom out").click();
    f.button("Fit diagram").click(); expect(f.image.width).toBe(800);
    f.button("Zoom in").click(); expect(f.region.classList.contains("annotation-markdown-svg-pannable")).toBe(true);
    for (let i = 0; i < 20; i++) f.button("Zoom in").click();
    expect(f.region.clientWidth).toBe(1900); expect(f.region.clientHeight).toBe(956);
    f.button("Fit diagram").click(); expect(f.image.width).toBe(800);
    expect(f.region.classList.contains("annotation-markdown-svg-pannable")).toBe(false);
  });

  test("refits oversized diagrams on Reader resize without a shrinking feedback loop", () => {
    const size = [900, 600], f = fixture(1600, 800, size);
    expect(f.image.width).toBe(900);
    for (let i = 0; i < 5; i++) f.win.dispatchEvent(new f.win.Event("resize"));
    expect(f.image.width).toBe(900);
    size[0] = 700; window.dispatchEvent(new Event("resize")); expect(f.image.width).toBe(700);
    f.button("Zoom in").click(); const manual = f.image.width;
    size[0] = 900; window.dispatchEvent(new Event("resize")); expect(f.image.width).toBe(manual);
    f.button("Fit diagram").click(); expect(f.image.width).toBe(900);
  });

  test("bounds repeated zoom and disables unavailable controls", () => {
    const f = fixture();
    for (let i = 0; i < 70; i++) f.button("Zoom in").click();
    expect(f.image.width).toBe(4000); expect(f.button("Zoom in").disabled).toBe(true);
    for (let i = 0; i < 70; i++) f.button("Zoom out").click();
    expect(f.image.width).toBe(10); expect(f.button("Zoom out").disabled).toBe(true);
    f.button("Fit diagram").click(); expect(f.image.width).toBe(360);
  });

  test("keeps the point under the mouse fixed while zooming and prevents page scrolling", () => {
    const f = fixture(); f.actualSize();
    f.region.scrollLeft = 200; f.region.scrollTop = 100;
    const before = f.image.getBoundingClientRect(), px = 150, py = 100;
    const point = [(px - before.left) / f.image.width, (py - before.top) / f.image.height];
    const event = f.wheel(); const after = f.image.getBoundingClientRect();
    expect(event.defaultPrevented).toBe(true);
    expect(after.left + point[0] * f.image.width).toBeCloseTo(px, 0);
    expect(after.top + point[1] * f.image.height).toBeCloseTo(py, 0);
    f.wheel(f.doc.querySelector(".annotation-markdown-svg-viewer-toolbar"));
    expect(f.image.width).toBe(after.width);
  });

  test.each([[0, 100], [1, 6.25], [2, 100 / 180]])("normalizes wheel delta mode %s", (deltaMode, deltaY) => {
    const f = fixture(); f.actualSize();
    f.wheel(f.image, { deltaMode, deltaY });
    expect(f.image.width).toBeCloseTo(819, 0);
  });

  test("ignores horizontal wheel motion and confines events to the viewer", () => {
    const host = []; const capture = event => host.push(event.type);
    window.addEventListener("wheel", capture, true);
    try {
      const f = fixture(); f.wheel(f.image, { deltaY: 0, deltaX: 100 });
      expect(f.image.width).toBe(360); expect(host).toEqual([]);
      window.dispatchEvent(new WheelEvent("wheel")); expect(host).toEqual(["wheel"]);
    } finally { window.removeEventListener("wheel", capture, true); }
  });

  test("drags an enlarged image, ignores other pointers, and stops on release or cancel", () => {
    const f = fixture(); f.actualSize();
    f.region.scrollLeft = 200; f.region.scrollTop = 100;
    f.pointer("pointerdown", f.image);
    f.pointer("pointermove", f.region, { clientX: 160, clientY: 70, pointerId: 2 });
    expect(f.region.scrollLeft).toBe(200);
    f.pointer("pointermove", f.region, { clientX: 160, clientY: 70 });
    expect([f.region.scrollLeft, f.region.scrollTop]).toEqual([240, 130]);
    f.pointer("pointerup"); f.pointer("pointermove", f.region, { clientX: 50 });
    expect(f.region.scrollLeft).toBe(240);
    f.pointer("pointerdown"); f.pointer("pointercancel"); f.pointer("pointermove", f.region, { clientX: 50 });
    expect(f.region.scrollLeft).toBe(240);
    f.pointer("pointerdown", f.image, { button: 2 }); f.pointer("pointermove", f.region, { clientX: 50 });
    expect(f.region.scrollLeft).toBe(240);
  });

  test("cycles focus in both directions, skips disabled controls and restores the opener on Escape", () => {
    const f = fixture(); const close = f.button("Close SVG diagram");
    expect(f.doc.activeElement).toBe(close);
    close.dispatchEvent(new f.win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(f.doc.activeElement).toBe(f.region);
    f.region.dispatchEvent(new f.win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(f.doc.activeElement).toBe(f.button("Zoom out"));
    f.button("Zoom out").dispatchEvent(new f.win.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(f.doc.activeElement).toBe(f.region);
    for (let i = 0; i < 70; i++) f.button("Zoom out").click();
    f.region.focus(); f.region.dispatchEvent(new f.win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(f.doc.activeElement).toBe(f.button("Zoom in"));
    f.doc.activeElement.dispatchEvent(new f.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.querySelector(".annotation-markdown-svg-viewer-frame")).toBeNull();
    expect(document.activeElement).toBe(f.opener);
    f.opener.click(); expect(document.querySelector("iframe").contentDocument.querySelector("img").width).toBe(1000);
  });

  test("does not enlarge small diagrams during fit or resize, and preserves manual zoom on resize", () => {
    const f = fixture(100, 45); expect(f.image.width).toBe(100);
    f.button("Zoom in").click(); const width = f.image.width;
    f.win.dispatchEvent(new f.win.Event("resize")); expect(f.image.width).toBe(width);
    f.button("Fit diagram").click(); expect(f.image.width).toBe(100);
  });

  test("caps rendered dimensions for the largest permitted SVG and ignores wheel events after stop", () => {
    const f = fixture(4096, 4096);
    for (let i = 0; i < 70; i++) f.button("Zoom in").click();
    expect(f.image.width).toBe(8192); expect(f.button("Zoom in").disabled).toBe(true);
    viewer.stop();
    const before = f.image.width; f.wheel(); expect(f.image.width).toBe(before);
    f.opener.click(); expect(document.querySelector("iframe")).toBeNull();
  });

  test("fits the whole viewport even when the previous zoom has native scrollbars", () => {
    const f = fixture();
    Object.defineProperties(f.region, {
      clientWidth: { get: () => f.image.width > 400 || f.image.height > 180 ? 384 : 400 },
      clientHeight: { get: () => f.image.width > 400 || f.image.height > 180 ? 164 : 180 }
    });
    f.actualSize();
    f.button("Fit diagram").click();
    expect([f.image.width, f.image.height]).toEqual([360, 180]);
    f.button("Fit diagram").click(); expect(f.image.width).toBe(360);
  });

  test("keeps scroll-blocking Reader listeners scoped to the open modal", () => {
    // A non-passive wheel listener can disable Gecko's asynchronous scrolling,
    // even when its callback does nothing. Observe its actual modal lifetime.
    const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window);
    const active = new Set(), registrations = [];
    const addSpy = vi.spyOn(window, "addEventListener").mockImplementation((type, callback, options) => {
      if (type === "wheel" && options?.passive === false) {
        active.add(callback); registrations.push(!!document.querySelector(".annotation-markdown-svg-viewer"));
      }
      add(type, callback, options);
    });
    const removeSpy = vi.spyOn(window, "removeEventListener").mockImplementation((type, callback, options) => {
      if (type === "wheel") active.delete(callback);
      remove(type, callback, options);
    });
    try {
      const f = fixture(); expect(registrations).toEqual([true]); expect(active.size).toBe(1);
      viewer.close(); expect(active.size).toBe(0);
      f.opener.click(); expect(active.size).toBe(1);
      viewer.stop(); expect(active.size).toBe(0);
    } finally { viewer?.stop(); addSpy.mockRestore(); removeSpy.mockRestore(); }
  });
});
