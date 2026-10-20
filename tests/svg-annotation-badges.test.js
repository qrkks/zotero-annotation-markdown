import { afterEach, describe, expect, test, vi } from "vitest";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createSvgAnnotationBadges } from "../src/svg-annotation-badges.ts";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>';
const source = `\`\`\`svg\n${svg}\n\`\`\``;
const renderer = createMarkdownRenderer({ isSvgEnabled: () => true });

afterEach(() => { document.body.innerHTML = ""; });

describe("SVG annotation badges", () => {
  test.each(["```", "~~~"])("discovers Mermaid-only page annotations with %s fences and sizes mixed labels", fence => {
    document.body.innerHTML = '<div class="page"></div>';
    const page = document.querySelector(".page");
    const annotation = { id: "mermaid", type: "note", comment: `${fence}mermaid\nflowchart TD\nA --> B\n${fence}`,
      position: { pageIndex: 0, rects: [[80, 100, 100, 120]] } };
    const view = { _iframeDocument: document, _annotations: [annotation],
      _pages: [{ _pageIndex: 0, _originalPage: { div: page, viewport: { transform: [1, 0, 0, -1, 0, 200] } } }] };
    let counts = { img: 0, svg: 0, mermaid: 1 };
    const badges = createSvgAnnotationBadges({ reader: { _internalReader: { _views: [view] } },
      document, isEnabled: () => true, getImageCounts: () => counts, getLocale: () => "zh-CN" });
    try {
      badges.start();
      const badge = page.querySelector("[data-annotation-markdown-svg-page-badge]");
      expect(badge.textContent).toBe("MERMAID");
      expect(badge.title).toBe("本条批注含 1 个 Mermaid 图");
      const singleWidth = parseInt(badge.style.width, 10);
      expect(singleWidth).toBeGreaterThanOrEqual(52);
      counts = { img: 1, svg: 1, mermaid: 2 }; badges.refresh();
      expect(badge.textContent).toBe("IMG · SVG · MERMAID");
      expect(parseInt(badge.style.width, 10)).toBeGreaterThan(singleWidth);
      expect(badge.style.pointerEvents).toBe("none");
      counts = { img: 0, svg: 0, mermaid: 0 }; badges.refresh();
      expect(page.querySelector("[data-annotation-markdown-svg-page-badge]")).toBeNull();
    } finally { badges.stop(); }
  });
  test("keeps one sidebar badge outside the clamped preview and removes it when SVG disappears", () => {
    document.body.innerHTML = '<div data-sidebar-annotation-id="a1" class="annotation"><div class="preview"><header><div class="start"><div class="icon"></div></div><div class="end"><div class="custom-sections"></div><button class="more"></button></div></header><div class="comment"><div class="content"></div></div></div></div>';
    const adapter = createAnnotationSidebarAdapter({ document });
    const comment = document.querySelector(".comment");
    comment.querySelector(".content").textContent = source;
    const html = renderer.render(source);
    adapter.applyRenderedHtml(comment, html);
    adapter.applyRenderedHtml(comment, html);
    expect(document.querySelectorAll("header > .end > [data-annotation-markdown-svg-badge='sidebar']")).toHaveLength(1);
    expect(document.querySelector("header > .end > .custom-sections [data-annotation-markdown-svg-badge]")).toBeNull();
    expect(document.querySelector("header > .start [data-annotation-markdown-svg-badge]")).toBeNull();
    expect(document.querySelector(".annotation-markdown-rendered [data-annotation-markdown-svg-badge]")).toBeNull();
    document.querySelector(".annotation").classList.add("selected");
    expect(document.querySelectorAll("header > .end > [data-annotation-markdown-svg-badge='sidebar']")).toHaveLength(1);
    adapter.applyRenderedHtml(comment, "<p>Ordinary text</p>");
    expect(document.querySelector("[data-annotation-markdown-svg-badge]")).toBeNull();
    adapter.applyRenderedHtml(comment, html);
    adapter.clearRenderedState();
    expect(document.querySelector("[data-annotation-markdown-svg-badge], .annotation-markdown-rendered")).toBeNull();
  });

  test("restores the sidebar badge after a host or Weavero header refresh", async () => {
    document.body.innerHTML = '<div data-sidebar-annotation-id="a1" class="annotation"><div class="preview"><header><div class="start"><div class="icon"></div></div><div class="end"><div class="custom-sections"></div><button class="more"></button></div></header><div class="comment"><div class="content"></div></div></div></div>';
    document.querySelector(".content").textContent = `${source}\n\n[Financial](https://example.org)`;
    const adapter = createAnnotationSidebarAdapter({ document });
    const controller = createReaderController({ reader: { document }, adapter, renderer,
      settings: { isEnabled: () => true, isSvgEnabled: () => true },
      MutationObserver: window.MutationObserver, IntersectionObserver: null });
    await controller.start();
    const end = document.querySelector("header > .end");
    expect(end.querySelector("[data-annotation-markdown-svg-badge]")).not.toBeNull();

    end.querySelector(".custom-sections").replaceChildren(Object.assign(document.createElement("span"), { className: "wv-icon-group" }));
    expect(end.querySelector("[data-annotation-markdown-svg-badge]")).not.toBeNull();

    end.innerHTML = '<div class="custom-sections"><span class="wv-icon-group"></span></div><button class="more"></button>';
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(end.querySelectorAll(":scope > [data-annotation-markdown-svg-badge='sidebar']")).toHaveLength(1);
    expect(end.querySelector(".wv-icon-group")).not.toBeNull();
    controller.stop();
  });

  test("does not put a sidebar badge in a page popup", () => {
    document.body.innerHTML = '<div class="annotation-popup"><div data-sidebar-annotation-id="a1"><div class="preview"><header><div class="start"></div></header><div class="comment"><div class="content"></div></div></div></div></div>';
    const adapter = createAnnotationSidebarAdapter({ document });
    adapter.applyRenderedHtml(document.querySelector(".comment"), renderer.render(source));
    expect(document.querySelector("[data-annotation-markdown-svg-badge]")).toBeNull();
  });

  test.each(["empty comment", "disabled sidebar"])("clears the sidebar badge for %s", async scenario => {
    document.body.innerHTML = '<div data-sidebar-annotation-id="a1" class="annotation"><div class="preview"><header><div class="end"></div></header><div class="comment"><div class="content"></div></div></div></div>';
    const comment = document.querySelector(".comment");
    comment.querySelector(".content").textContent = source;
    let sidebarEnabled = true;
    const adapter = createAnnotationSidebarAdapter({ document });
    const controller = createReaderController({ reader: { document }, adapter, renderer,
      settings: { isEnabled: () => sidebarEnabled, isPopupEnabled: () => true, isSvgEnabled: () => true },
      MutationObserver: null, IntersectionObserver: null });
    try {
      await controller.start();
      expect(document.querySelector("[data-annotation-markdown-svg-badge]")).not.toBeNull();
      if (scenario === "empty comment") {
        comment.querySelector(".content").textContent = "";
        adapter.finishEditing(comment);
        controller.renderNow();
      } else {
        sidebarEnabled = false;
        controller.refresh();
      }
      expect(document.querySelector("[data-annotation-markdown-svg-badge]")).toBeNull();
      expect(comment.querySelector(".annotation-markdown-rendered")).toBeNull();
    } finally { controller.stop(); }
  });

  test("restores a header badge while its offscreen preview is a placeholder", () => {
    document.body.innerHTML = '<div data-sidebar-annotation-id="a1" class="annotation"><div class="preview"><header><div class="end"></div></header><div class="comment"><div class="content"></div></div></div></div>';
    const comment = document.querySelector(".comment");
    comment.querySelector(".content").textContent = source;
    const adapter = createAnnotationSidebarAdapter({ document });
    adapter.applyRenderedHtml(comment, renderer.render(source));
    expect(adapter.releaseRenderedHtml(comment)).toBe(true);
    document.querySelector("header > .end").replaceChildren();
    adapter.syncImageBadge(comment);
    expect(document.querySelectorAll("[data-annotation-markdown-svg-badge='sidebar']")).toHaveLength(1);
    adapter.applyRenderedHtml(comment, "<p>Ordinary text</p>");
    expect(document.querySelector("[data-annotation-markdown-svg-badge]")).toBeNull();
  });

  test("places a passive page badge beside a PDF comment icon and follows edits", () => {
    document.body.innerHTML = '<div class="page"></div>';
    const div = document.querySelector(".page");
    const annotation = { id: "a1", type: "highlight", comment: source,
      position: { pageIndex: 0, rects: [[10, 20, 80, 30]] } };
    const annotations = [annotation];
    annotations.filter = () => { throw new Error("Reader arrays cannot receive privileged callbacks"); };
    const view = { _iframeWindow: { document }, _annotations: annotations,
      _pages: [{ _pageIndex: 0, _originalPage: { div, viewport: { transform: [2, 0, 0, -2, 0, 200] } } }] };
    const reader = { _internalReader: { _views: [view] } };
    const badges = createSvgAnnotationBadges({ reader, document, isEnabled: () => true,
      getImageCounts: text => ({ img: 0, svg: renderer.render(text).match(/<figure class="annotation-markdown-svg">/g)?.length ?? 0 }) });
    badges.start();
    expect(div.querySelectorAll("[data-annotation-markdown-svg-page-badge]")).toHaveLength(1);
    const badge = div.querySelector("[data-annotation-markdown-svg-page-badge]");
    expect(badge.textContent).toBe("SVG");
    expect(badge.style.pointerEvents).toBe("none");
    badges.refresh();
    expect(div.querySelectorAll("[data-annotation-markdown-svg-page-badge]")).toHaveLength(1);
    annotation.comment = "ordinary comment";
    badges.refresh();
    expect(div.querySelector("[data-annotation-markdown-svg-page-badge]")).toBeNull();
    annotation.comment = source;
    badges.refresh();
    expect(div.querySelector("[data-annotation-markdown-svg-page-badge]")).not.toBeNull();
    annotation.comment = '```svg\n<svg><script/></svg>\n```';
    badges.refresh();
    expect(div.querySelector("[data-annotation-markdown-svg-page-badge]")).toBeNull();
    badges.stop();
    expect(div.querySelector("[data-annotation-markdown-svg-page-badge]")).toBeNull();
  });

  test("moves nearby PDF badges away from text and each other", () => {
    document.body.innerHTML = '<div class="page"><div class="textLayer"><span>Financial</span></div></div>';
    const div = document.querySelector(".page");
    div.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 });
    div.querySelector("span").getBoundingClientRect = () =>
      ({ left: 101, top: 78, right: 135, bottom: 98, width: 34, height: 20 });
    const annotations = ["a1", "a2"].map(id => ({ id, type: "note", comment: source,
      position: { pageIndex: 0, rects: [[80, 100, 100, 120]] } }));
    const view = { _iframeWindow: { document }, _annotations: annotations,
      _pages: [{ _pageIndex: 0, _originalPage: { div, viewport: { transform: [1, 0, 0, -1, 0, 200] } } }] };
    const badges = createSvgAnnotationBadges({ reader: { _internalReader: { _views: [view] } },
      document, isEnabled: () => true, getImageCounts: () => ({ img: 0, svg: 1 }) });
    badges.start();
    const first = div.querySelector('[data-annotation-markdown-svg-page-badge="a1"]');
    const second = div.querySelector('[data-annotation-markdown-svg-page-badge="a2"]');
    expect(Number.parseInt(first.style.left)).toBeLessThan(80);
    expect(Number.parseInt(second.style.top)).toBeLessThan(78);
    const xGap = Math.abs(Number.parseInt(first.style.left) - Number.parseInt(second.style.left));
    const yGap = Math.abs(Number.parseInt(first.style.top) - Number.parseInt(second.style.top));
    expect(xGap >= 28 || yGap >= 16).toBe(true);
    badges.stop();
  });

  test.each([
    ["zh-CN", "本条批注含 2 个 SVG 图", "本条批注含 1 个 SVG 图"],
    ["en-US", "This annotation contains 2 SVG diagrams", "This annotation contains 1 SVG diagram"],
    ["fr-FR", "This annotation contains 2 SVG diagrams", "This annotation contains 1 SVG diagram"]
  ])("shows localized counts on passive PDF badges without intercepting native input (%s)", (locale, plural, singular) => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div class="page"><span id="native-target">Native PDF annotation</span></div>';
    const page = document.querySelector(".page");
    const native = document.querySelector("#native-target");
    const annotation = { id: "a1", type: "note", comment: `${source}\n\n${source}`,
      position: { pageIndex: 0, rects: [[80, 100, 100, 120]] } };
    const view = { _iframeDocument: document, _annotations: [annotation],
      _pages: [{ _pageIndex: 0, _originalPage: { div: page, viewport: { transform: [1, 0, 0, -1, 0, 200] } } }] };
    const count = vi.fn(text => ({ img: 0, svg: renderer.render(text).match(/<figure class="annotation-markdown-svg">/g)?.length ?? 0 }));
    const badges = createSvgAnnotationBadges({ reader: { _internalReader: { _views: [view] } },
      document, isEnabled: () => true, getImageCounts: count, getLocale: () => locale });
    try {
      badges.start();
      const badge = page.querySelector("[data-annotation-markdown-svg-page-badge]");
      expect(badge.title).toBe(plural);
      expect(badge.style.pointerEvents).toBe("none");
      expect(badge.hasAttribute("tabindex")).toBe(false);
      badge.getBoundingClientRect = () => ({ left: 10, top: 10, right: 38, bottom: 26, width: 28, height: 16 });
      count.mockClear();
      const move = new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 15 });
      // Gecko exposes an Xray Document through currentTarget while the Reader
      // supplies a waived wrapper. They refer to the same DOM but differ by ===.
      Object.defineProperty(move, "currentTarget", { value: new Proxy(document, {}) });
      native.dispatchEvent(move);
      expect(document.querySelector("[data-annotation-markdown-svg-page-tooltip]")).toBeNull();
      vi.advanceTimersByTime(500);
      const tooltip = document.querySelector("[data-annotation-markdown-svg-page-tooltip]");
      expect(tooltip?.textContent).toBe(plural);
      expect(tooltip?.style.pointerEvents).toBe("none");
      expect(count).not.toHaveBeenCalled();
      document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 15 }));
      expect(document.querySelector("[data-annotation-markdown-svg-page-tooltip]")).toBeNull();
      native.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 15 }));
      vi.advanceTimersByTime(500);
      annotation.comment = source;
      badges.refresh();
      expect(page.querySelector("[data-annotation-markdown-svg-page-badge]")).toBe(badge);
      expect(badge.title).toBe(singular);
      expect(document.querySelector("[data-annotation-markdown-svg-page-tooltip]").textContent).toBe(singular);

      const nativeClick = vi.fn();
      native.addEventListener("click", nativeClick);
      const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
      native.dispatchEvent(down);
      native.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(down.defaultPrevented).toBe(false);
      expect(nativeClick).toHaveBeenCalledOnce();
      expect(document.querySelector("[data-annotation-markdown-svg-page-tooltip]")).toBeNull();
      native.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 15 }));
      vi.advanceTimersByTime(500);
      native.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 70, clientY: 70 }));
      expect(document.querySelector("[data-annotation-markdown-svg-page-tooltip]")).toBeNull();
      native.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 15 }));
      badges.stop();
      vi.advanceTimersByTime(500);
      expect(document.querySelector("[data-annotation-markdown-svg-page-badge], [data-annotation-markdown-svg-page-tooltip]")).toBeNull();
    } finally { badges.stop(); vi.useRealTimers(); }
  });

  test("counts only rendered diagrams and reuses the per-source cache across page annotations", async () => {
    document.body.innerHTML = '<div class="page"></div>';
    const mixed = [source, source, '```text\n' + svg + '\n```', '```svg\n<svg><script/></svg>\n```'].join("\n\n");
    const annotations = ["a1", "a2"].map(id => ({ id, type: "note", comment: mixed,
      position: { pageIndex: 0, rects: [[80, 100, 100, 120]] } }));
    const view = { _iframeDocument: document, _annotations: annotations,
      _pages: [{ _pageIndex: 0, _originalPage: { div: document.querySelector(".page"),
        viewport: { transform: [1, 0, 0, -1, 0, 200] } } }] };
    const render = vi.fn(text => renderer.render(text));
    const controller = createReaderController({ reader: { document, _internalReader: { _views: [view] } },
      adapter: createAnnotationSidebarAdapter({ document }), renderer: { render }, getLocale: () => "zh-CN",
      settings: { isEnabled: () => true, isSvgEnabled: () => true },
      MutationObserver: null, IntersectionObserver: null });
    try {
      await controller.start();
      const badges = [...document.querySelectorAll("[data-annotation-markdown-svg-page-badge]")];
      expect(badges).toHaveLength(2);
      expect(badges.map(badge => badge.title)).toEqual(["本条批注含 2 个 SVG 图", "本条批注含 2 个 SVG 图"]);
      expect(render.mock.calls.filter(([text]) => text === mixed)).toHaveLength(1);
    } finally { controller.stop(); }
  });

  test("refreshes page badges after a text-only native comment update", async () => {
    document.body.innerHTML = '<div class="page"></div><div data-sidebar-annotation-id="a1"><div class="comment"><div class="content"></div></div></div>';
    const div = document.querySelector(".page");
    const content = document.querySelector(".content");
    content.textContent = source;
    const annotation = { id: "a1", type: "note", comment: source,
      position: { pageIndex: 0, rects: [[80, 100, 100, 120]] } };
    const view = { _iframeWindow: { document }, _annotations: [annotation],
      _pages: [{ _pageIndex: 0, _originalPage: { div, viewport: { transform: [1, 0, 0, -1, 0, 200] } } }] };
    const badges = createSvgAnnotationBadges({ reader: { _internalReader: { _views: [view] } },
      document, isEnabled: () => true, getImageCounts: () => ({ img: 0, svg: 1 }) });
    try {
      badges.start();
      expect(div.querySelector("[data-annotation-markdown-svg-page-badge]")).not.toBeNull();
      annotation.comment = "ordinary comment";
      content.textContent = annotation.comment;
      await Promise.resolve();
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      expect(div.querySelector("[data-annotation-markdown-svg-page-badge]")).toBeNull();
    } finally { badges.stop(); }
  });

  test("matches the EPUB annotation id and shows its count hint through the shadow overlay", () => {
    vi.useFakeTimers();
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
      _annotations: [{ id: "a1", type: "highlight", comment: source }] };
    const badges = createSvgAnnotationBadges({ reader: { _internalReader: { _views: [view] } },
      document, isEnabled: () => true, getImageCounts: () => ({ img: 0, svg: 2 }), getLocale: () => "en-US" });
    try {
      badges.start();
      const badge = shadow.querySelector("[data-annotation-markdown-svg-page-badge]");
      expect(badge?.textContent).toBe("SVG");
      expect(badge?.title).toBe("This annotation contains 2 SVG diagrams");
      expect(badge?.style.position).toBe("fixed");
      badge.getBoundingClientRect = () => ({ left: 30, top: 25, right: 58, bottom: 41, width: 28, height: 16 });
      for (const dismiss of [() => window.dispatchEvent(new Event("blur")),
        () => root.dispatchEvent(new Event("scroll")),
        () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))]) {
        group.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, composed: true, clientX: 40, clientY: 30 }));
        vi.advanceTimersByTime(500);
        expect(document.querySelector("[data-annotation-markdown-svg-page-tooltip]")?.textContent)
          .toBe("This annotation contains 2 SVG diagrams");
        dismiss();
        expect(document.querySelector("[data-annotation-markdown-svg-page-tooltip]")).toBeNull();
      }
    } finally { badges.stop(); vi.useRealTimers(); }
    expect(shadow.querySelector("[data-annotation-markdown-svg-page-badge]")).toBeNull();
  });

});
