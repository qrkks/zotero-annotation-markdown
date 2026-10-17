import { afterEach, expect, test, vi } from "vitest";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createSvgAnnotationBadges } from "../src/svg-annotation-badges.ts";

const svg = '```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>\n```';
const image = "![Photo](https://example.org/photo.png)";
const linked = "[Photo](https://images.openai.com/static-rsc-4/photo?purpose=inline)";
let controller;
afterEach(() => { controller?.stop(); controller = undefined; document.body.innerHTML = ""; vi.useRealTimers(); });

async function start(comment, { locale = "zh-CN", svgEnabled = true, sidebar = false } = {}) {
  document.body.innerHTML = '<div class="page"><span class="native">Native annotation</span></div>' + (sidebar
    ? '<div class="annotation selected" data-sidebar-annotation-id="a1"><div class="preview"><header><div class="end"><button class="more"></button></div></header><div class="comment"><div class="content"></div></div></div></div>' : "");
  const page = document.querySelector(".page");
  page.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });
  const annotation = { id: "a1", type: "note", comment,
    position: { pageIndex: 0, rects: [[80, 100, 100, 120]] } };
  const view = { _iframeDocument: document, _annotations: [annotation],
    _pages: [{ _pageIndex: 0, _originalPage: { div: page, viewport: { transform: [1, 0, 0, -1, 0, 200] } } }] };
  const content = document.querySelector(".content");
  if (content) content.textContent = comment;
  const adapter = createAnnotationSidebarAdapter({ document, getLocale: () => locale });
  const renderer = createMarkdownRenderer({ isSvgEnabled: () => svgEnabled, deferLinkedImages: true });
  const render = vi.fn(text => renderer.render(text));
  const load = vi.fn(async () => { throw new Error("Image unavailable"); });
  controller = createReaderController({ reader: { document, _internalReader: { _views: [view] } },
    adapter, renderer: { render }, getLocale: () => locale, loadLinkedImage: load,
    settings: { isEnabled: () => true, isSvgEnabled: () => svgEnabled },
    MutationObserver: window.MutationObserver, IntersectionObserver: null });
  await controller.start();
  return { page, annotation, adapter, render, load, content };
}

test.each([
  [image, false, "IMG", "本条批注含 1 张图片"],
  [linked, false, "IMG", "本条批注含 1 张图片"],
  [[image, linked, svg].join("\n\n"), true, "IMG · SVG", "本条批注含 2 张图片、1 个 SVG 图"],
  [[image, svg].join("\n\n"), false, "IMG", "本条批注含 1 张图片"],
  ['```text\n' + image + '\n```\n\n[Ordinary](https://example.org)', true, "", ""]
])("counts rendered image items without loading them (%s)", async (source, svgEnabled, label, hint) => {
  const { page, load } = await start(source, { svgEnabled });
  const badge = page.querySelector("[data-annotation-markdown-svg-page-badge]");
  expect(badge?.textContent ?? "").toBe(label);
  expect(badge?.title ?? "").toBe(hint);
  expect(load).not.toHaveBeenCalled();
});

test.each([
  ["zh-CN", "本条批注含 2 张图片、1 个 SVG 图"],
  ["en-US", "This annotation contains 2 images and 1 SVG diagram"],
  ["fr-FR", "This annotation contains 2 images and 1 SVG diagram"]
])("keeps one mixed sidebar marker across failure, offscreen release and header replacement (%s)", async (locale, hint) => {
  const text = [image, linked, svg].join("\n\n");
  const { adapter, content } = await start(text, { locale, sidebar: true });
  await Promise.resolve();
  const comment = document.querySelector(".comment");
  const badge = document.querySelector("header [data-annotation-markdown-svg-badge]");
  expect(badge?.textContent).toBe("IMG · SVG");
  expect(badge?.title).toBe(hint);
  expect(badge?.getAttribute("aria-label")).toBe(hint);
  expect(content.textContent).toBe(text);
  expect(adapter.releaseRenderedHtml(comment)).toBe(true);
  document.querySelector("header > .end").replaceChildren();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(document.querySelectorAll("header [data-annotation-markdown-svg-badge]")).toHaveLength(1);
  expect(document.querySelector("header [data-annotation-markdown-svg-badge]").title).toBe(hint);
  controller.stop();
  expect(document.querySelector("[data-annotation-markdown-svg-badge], [data-annotation-markdown-svg-page-badge], [data-annotation-markdown-svg-page-tooltip]")).toBeNull();
});

test("updates the mixed hover hint in place and keeps native clicks available", async () => {
  const { page, annotation } = await start([image, linked, svg].join("\n\n"));
  vi.useFakeTimers();
  const badge = page.querySelector("[data-annotation-markdown-svg-page-badge]");
  expect(badge?.textContent).toBe("IMG · SVG");
  expect(badge?.style.pointerEvents).toBe("none");
  badge.getBoundingClientRect = () => ({ left: 10, top: 10, right: 70, bottom: 26, width: 60, height: 16 });
  const native = page.querySelector(".native");
  native.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 65, clientY: 15 }));
  vi.advanceTimersByTime(500);
  expect(document.querySelector("[role='tooltip']")?.textContent).toBe("本条批注含 2 张图片、1 个 SVG 图");
  annotation.comment = image;
  controller.refresh();
  expect(page.querySelector("[data-annotation-markdown-svg-page-badge]")).toBe(badge);
  expect(badge.textContent).toBe("IMG");
  expect(document.querySelector("[role='tooltip']")?.textContent).toBe("本条批注含 1 张图片");
  const click = vi.fn();
  native.addEventListener("click", click);
  native.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  native.click();
  expect(click).toHaveBeenCalledOnce();
  expect(document.querySelector("[role='tooltip']")).toBeNull();
});

test("shows a mixed count hint through the transparent sidebar header label", async () => {
  await start([image, svg].join("\n\n"), { sidebar: true });
  await new Promise(resolve => window.requestAnimationFrame(resolve));
  vi.useFakeTimers();
  const end = document.querySelector("header > .end");
  const badge = end.querySelector("[data-annotation-markdown-svg-badge]");
  badge.getBoundingClientRect = () => ({ left: 250, top: 30, right: 310, bottom: 46, width: 60, height: 16 });
  end.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 280, clientY: 35 }));
  vi.advanceTimersByTime(500);
  expect(document.querySelector("[role='tooltip']")?.textContent).toBe("本条批注含 1 张图片、1 个 SVG 图");
  controller.stop();
  expect(document.querySelector("[role='tooltip']")).toBeNull();
});

test.each([
  [image, { img: 1, svg: 0 }, "IMG", "This annotation contains 1 image"],
  [[image, svg].join("\n\n"), { img: 1, svg: 1 }, "IMG · SVG", "This annotation contains 1 image and 1 SVG diagram"]
])("shows a single EPUB image marker in the native shadow overlay (%s)", (comment, counts, label, hint) => {
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const root = document.createElement("div");
  shadow.append(root);
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("data-annotation-id", "a1");
  group.getBoundingClientRect = () => ({ left: 20, top: 30, width: 40, height: 10 });
  root.append(group);
  const view = { _iframeDocument: document, _annotationRenderRootEl: root,
    _annotations: [{ id: "a1", type: "highlight", comment }] };
  const badges = createSvgAnnotationBadges({ reader: { _internalReader: { _views: [view] } },
    document, isEnabled: () => true, getImageCounts: () => counts, getLocale: () => "en-US" });
  try {
    badges.start();
    expect(shadow.querySelectorAll("[data-annotation-markdown-svg-page-badge]")).toHaveLength(1);
    const badge = shadow.querySelector("[data-annotation-markdown-svg-page-badge]");
    expect(badge.textContent).toBe(label);
    expect(badge.title).toBe(hint);
    expect(badge.style.pointerEvents).toBe("none");
  } finally { badges.stop(); }
  expect(shadow.querySelector("[data-annotation-markdown-svg-page-badge]")).toBeNull();
});

test("includes the full mixed label width when avoiding page text and nearby badges", async () => {
  const { page, annotation } = await start([image, svg].join("\n\n"));
  page.insertAdjacentHTML("beforeend", '<div class="textLayer"><span>Paper text</span></div>');
  page.querySelector(".textLayer span").getBoundingClientRect = () =>
    ({ left: 125, top: 78, right: 180, bottom: 98, width: 55, height: 20 });
  controller.refresh();
  const badge = page.querySelector("[data-annotation-markdown-svg-page-badge]");
  expect(badge?.textContent).toBe("IMG · SVG");
  const x = Number.parseInt(badge.style.left), y = Number.parseInt(badge.style.top);
  expect(x + 60 <= 125 || x >= 180 || y + 16 <= 78 || y >= 98).toBe(true);
  expect(x).toBeGreaterThanOrEqual(0);
  expect(x + 60).toBeLessThanOrEqual(200);
  annotation.comment = "No image";
  controller.refresh();
  expect(page.querySelector("[data-annotation-markdown-svg-page-badge]")).toBeNull();
});
