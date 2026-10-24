import { afterEach, expect, test, vi } from "vitest";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createLinkedImageFetcher, createLinkedImageLoader } from "../src/linked-image-loader.ts";
import { countRenderedImages } from "../src/image-counts.ts";
import { intersectionObserverMock, type FixtureIntersectionCallback } from "./helpers/observers.ts";
import { fixtureRect, queryElement, requireElement, requireValue } from "./helpers/dom.ts";

const favicon = "https://www.google.com/s2/favicons?domain=https://onlinelibrary.wiley.com&sz=32";
const render = (source: string, options = {}) => {
  const root = document.createElement("div");
  root.innerHTML = createMarkdownRenderer(options).render(source);
  return root;
};
afterEach(() => { document.body.innerHTML = ""; });

test.each([
  ["https://onlinelibrary.wiley.com", "Wiley Online Library"],
  ["https://www.publichealth.columbia.edu", "哥伦比亚大学邮件人公共卫生学院"],
  ["https://link.springer.com", "Springer Nature Link"],
  ["https://pmc.ncbi.nlm.nih.gov", "PMC"]
] as const)("turns a pasted favicon link into a small source icon beside its name (%s)", (domain, name) => {
  const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  const source = `[image](${url.replace("&", "\\&")})\n\n${name}\n\n+1`;
  const root = render(source);
  const paragraph = queryElement(root, "p.annotation-markdown-source-reference");
  expect(paragraph).not.toBeNull();
  const icon = queryElement(paragraph, "img.annotation-markdown-favicon-image", HTMLImageElement);
  expect(icon.getAttribute("src")).toBe(url);
  expect(icon.width).toBe(16);
  expect(icon.height).toBe(16);
  expect(icon.alt).toBe("");
  expect(icon.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(queryElement(paragraph, "a", HTMLAnchorElement).getAttribute("href")).toBe(url);
  expect(queryElement(paragraph, "a", HTMLAnchorElement).getAttribute("aria-label")).toBe(new URL(domain).hostname);
  expect(paragraph.textContent).toContain(name);
  expect(root.querySelectorAll("p")).toHaveLength(2);
  expect(root.querySelector("figure")).toBeNull();
  expect(countRenderedImages(root)).toEqual({ img: 0, svg: 0 });
});

test.each([
  "https://www.google.com.evil.example/s2/favicons?domain=example.org&sz=32",
  "https://www.google.com/other?domain=example.org&sz=32",
  "http://www.google.com/s2/favicons?domain=example.org&sz=32",
  "https://user:pass@www.google.com/s2/favicons?domain=example.org&sz=32",
  "https://www.google.com/s2/favicons?domain=javascript:alert(1)&sz=32",
  "https://www.google.com/s2/favicons?sz=32"
] as const)("leaves unsupported or malformed favicon links as links (%s)", (url: string) => {
  const root = render(`[image](<${url}>)`);
  expect(root.querySelector(".annotation-markdown-favicon-image")).toBeNull();
});

test.each([
  `See [image](${favicon}) here.`,
  `## [image](${favicon})`,
  `- [image](${favicon})`,
  '```md\n[image](' + favicon + ')\n```'
] as const)("keeps sentence links, headings, tight list items and source examples unchanged (%s)", (source: string) => {
  expect(render(source).querySelector(".annotation-markdown-favicon-image")).toBeNull();
});

test("keeps headings, prose, separate sources and math separate while handling bare and reference links", () => {
  const root = render(`${favicon}\n\n## Heading\n\n[Icon][site]\n\nThis sentence stays separate.\n\n[Icon](${favicon})\n\n$E=mc^2$\n\n[site]: ${favicon}`);
  expect(root.querySelectorAll(".annotation-markdown-favicon-image")).toHaveLength(3);
  expect(queryElement(root, "h2", HTMLHeadingElement).textContent).toBe("Heading");
  expect([...root.querySelectorAll("p")].some(p => p.textContent === "This sentence stays separate.")).toBe(true);
  expect(root.querySelector(".katex")).not.toBeNull();
});

test("uses a formatted source name and retains the original link on a non-bubbling image error", () => {
  document.body.innerHTML = '<div class="annotation selected" data-sidebar-annotation-id="a1"><div class="preview"><header><div class="end"></div></header><div class="comment"><div class="content"></div></div></div></div>';
  const source = `[image](${favicon} "Original title")\n\n**Wiley** Online Library`;
  const comment = queryElement(document, ".comment", HTMLElement);
  queryElement(comment, ".content").textContent = source;
  const original = queryElement(comment, ".content").innerHTML;
  const openLink = vi.fn(), adapter = createAnnotationSidebarAdapter({ document, openLink });
  const html = createMarkdownRenderer().render(source);
  adapter.applyRenderedHtml(comment, html);
  const image = queryElement(comment, ".annotation-markdown-favicon-image", HTMLImageElement);
  expect(image).not.toBeNull();
  const link = image.closest("a");
  expect(requireElement(link, HTMLElement).title).toBe("Original title");
  expect(queryElement(requireValue(link).parentElement, "strong", HTMLElement).textContent).toBe("Wiley");
  image.dispatchEvent(new Event("error"));
  expect(image.hidden).toBe(true);
  expect(requireElement(link, HTMLElement).hidden).toBe(false);
  expect(queryElement(link, ".annotation-markdown-favicon-fallback").textContent).toBe("image");
  adapter.applyRenderedHtml(comment, html);
  expect(comment.querySelector("img")).toBe(image);
  requireElement(link, HTMLElement).click();
  expect(openLink).toHaveBeenCalledExactlyOnceWith(favicon);
  expect(comment.classList.contains("annotation-markdown-editing")).toBe(false);
  expect(queryElement(comment, ".content").innerHTML).toBe(original);
  expect(document.querySelector("[data-annotation-markdown-svg-badge]")).toBeNull();
  adapter.clearRenderedState();
  expect(comment.querySelector("[data-annotation-markdown-preview]")).toBeNull();
});

test("loads and caches deferred source icons through the host and preserves their links on failure", async () => {
  const root = render(`[image](${favicon})\n\nWiley\n\n[image](${favicon})\n\nWiley`, { deferLinkedImages: true });
  document.body.append(root);
  const icons = [...root.querySelectorAll(".annotation-markdown-favicon-image")];
  expect(icons).toHaveLength(2);
  expect(icons.every(icon => !icon.hasAttribute("src"))).toBe(true);
  const request = vi.fn(async () => ({ response: new Uint8Array([1, 2, 3]).buffer, getResponseHeader: () => "image/png" }));
  const load = createLinkedImageFetcher({ request }, binary => window.btoa(binary));
  const loader = createLinkedImageLoader({ load });
  try {
    loader.observe(root);
    await vi.waitFor(() => expect(icons.map(icon => icon.getAttribute("src"))).toEqual(["data:image/png;base64,AQID", "data:image/png;base64,AQID"]));
    expect(request).toHaveBeenCalledOnce();
    expect(countRenderedImages(root)).toEqual({ img: 0, svg: 0 });
  } finally { loader.stop(); }
  const failed = render(`[image](${favicon})\n\nWiley`, { deferLinkedImages: true });
  document.body.append(failed);
  const failure = createLinkedImageLoader({ load: async () => { throw new Error("unavailable"); } });
  try {
    failure.observe(failed);
    await vi.waitFor(() => expect(queryElement(failed, "img", HTMLImageElement).hidden).toBe(true));
    expect(queryElement(failed, "a", HTMLAnchorElement).hidden).toBe(false);
    expect(queryElement(failed, "a", HTMLAnchorElement).getAttribute("href")).toBe(favicon);
    expect(failed.textContent).toContain("Wiley");
  } finally { failure.stop(); }
});

test("defers small icon requests until visible, including wrapped Gecko targets", async () => {
  let intersect: ((FixtureIntersectionCallback)) | undefined;
  const unobserve = vi.fn();
  const Observer = intersectionObserverMock(function (callback) { intersect = callback; return { observe: vi.fn(), unobserve, disconnect: vi.fn() }; });
  const root = render(`[image](${favicon})\n\nWiley`, { deferLinkedImages: true });
  document.body.append(root);
  const load = vi.fn(async () => "data:image/png;base64,AQID"), loader = createLinkedImageLoader({ load, IntersectionObserver: Observer });
  try {
    loader.observe(root);
    expect(load).not.toHaveBeenCalled();
    const link = root.querySelector("a");
    requireValue(intersect)([{ target: new Proxy(requireValue(link), {}), isIntersecting: true }]);
    await vi.waitFor(() => expect(queryElement(root, "img", HTMLImageElement).getAttribute("src")).toBe("data:image/png;base64,AQID"));
    expect(unobserve).toHaveBeenCalledWith(link);
    expect(load).toHaveBeenCalledExactlyOnceWith(favicon, expect.any(AbortSignal));
  } finally { loader.stop(); }
});

test.each(["+1", "+3", "61%"] as const)("does not merge citation or numeric metadata (%s)", value => {
  const root = render(`[image](${favicon})\n\n${value}`);
  expect(root.querySelectorAll("p")).toHaveLength(2);
  expect(queryElement(root, "p", HTMLParagraphElement).textContent).not.toContain(value);
});

test("does not include source icons in mixed annotation or direct section image counts", async () => {
  const { trackAnnotationOutline } = await import("../src/annotation-outline.ts");
  const svg = '```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20"/></svg>\n```';
  const source = [`# Source`, `[image](${favicon})`, 'Wiley', '## Content', '![Photo](https://example.org/photo.png)', svg].join("\n\n");
  document.body.innerHTML = '<div id="annotations" style="overflow-y:auto"><div class="annotation selected"><div class="annotation-markdown-rendered" data-annotation-markdown-preview="true"></div></div></div>';
  queryElement(document, "#annotations").getBoundingClientRect = () => (fixtureRect({ left: 20, top: 60, right: 320, bottom: 660, width: 300, height: 600 }));
  const preview = queryElement(document, "[data-annotation-markdown-preview]");
  preview.innerHTML = createMarkdownRenderer({ isSvgEnabled: () => true }).render(source);
  const outline = trackAnnotationOutline({ document, isEnabled: () => true, isExpanded: () => true, setExpanded() {} });
  try {
    expect(preview.querySelector(".annotation-markdown-favicon-image")).not.toBeNull();
    expect(countRenderedImages(preview)).toEqual({ img: 1, svg: 1 });
    const items = [...document.querySelectorAll(".annotation-markdown-outline-item")];
    expect(items[0].querySelector(".annotation-markdown-outline-svg-badge")).toBeNull();
    expect(queryElement(items[1], ".annotation-markdown-outline-svg-badge").textContent).toBe("IMG · SVG");
    expect(requireElement(items[1], HTMLElement).title).toContain("1 image and 1 SVG diagram");
  } finally { outline.stop(); }
});
