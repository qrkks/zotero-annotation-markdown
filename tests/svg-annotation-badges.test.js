import { afterEach, describe, expect, test } from "vitest";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createSvgAnnotationBadges } from "../src/svg-annotation-badges.ts";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>';
const source = `\`\`\`svg\n${svg}\n\`\`\``;
const renderer = createMarkdownRenderer({ isSvgEnabled: () => true });

afterEach(() => { document.body.innerHTML = ""; });

describe("SVG annotation badges", () => {
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
    adapter.syncSvgBadge(comment);
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
      hasRenderableSvg: text => renderer.render(text).includes('<figure class="annotation-markdown-svg">') });
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
      document, isEnabled: () => true, hasRenderableSvg: () => true });
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
      document, isEnabled: () => true, hasRenderableSvg: () => true });
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

  test("matches the EPUB annotation id inside its shadow overlay", () => {
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
      document, isEnabled: () => true, hasRenderableSvg: () => true });
    badges.start();
    const badge = shadow.querySelector("[data-annotation-markdown-svg-page-badge]");
    expect(badge?.textContent).toBe("SVG");
    expect(badge?.style.position).toBe("fixed");
    badges.stop();
    expect(shadow.querySelector("[data-annotation-markdown-svg-page-badge]")).toBeNull();
  });

});
