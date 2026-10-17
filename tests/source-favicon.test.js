import { afterEach, expect, test, vi } from "vitest";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createLinkedImageFetcher, createLinkedImageLoader } from "../src/linked-image-loader.ts";
import { countRenderedImages } from "../src/image-counts.ts";

const favicon = "https://www.google.com/s2/favicons?domain=https://onlinelibrary.wiley.com&sz=32";
const render = (source, options = {}) => {
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
])("turns a pasted favicon link into a small source icon beside its name (%s)", (domain, name) => {
  const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  const source = `[image](${url.replace("&", "\\&")})\n\n${name}\n\n+1`;
  const root = render(source);
  const paragraph = root.querySelector("p.annotation-markdown-source-reference");
  expect(paragraph).not.toBeNull();
  const icon = paragraph.querySelector("img.annotation-markdown-favicon-image");
  expect(icon.getAttribute("src")).toBe(url);
  expect(icon.width).toBe(16);
  expect(icon.height).toBe(16);
  expect(icon.alt).toBe("");
  expect(icon.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(paragraph.querySelector("a").getAttribute("href")).toBe(url);
  expect(paragraph.querySelector("a").getAttribute("aria-label")).toBe(new URL(domain).hostname);
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
])("leaves unsupported or malformed favicon links as links (%s)", url => {
  const root = render(`[image](<${url}>)`);
  expect(root.querySelector(".annotation-markdown-favicon-image")).toBeNull();
});

test.each([
  `See [image](${favicon}) here.`,
  `## [image](${favicon})`,
  `- [image](${favicon})`,
  '```md\n[image](' + favicon + ')\n```'
])("keeps sentence links, headings, tight list items and source examples unchanged (%s)", source => {
  expect(render(source).querySelector(".annotation-markdown-favicon-image")).toBeNull();
});

test("keeps headings, prose, separate sources and math separate while handling bare and reference links", () => {
  const root = render(`${favicon}\n\n## Heading\n\n[Icon][site]\n\nThis sentence stays separate.\n\n[Icon](${favicon})\n\n$E=mc^2$\n\n[site]: ${favicon}`);
  expect(root.querySelectorAll(".annotation-markdown-favicon-image")).toHaveLength(3);
  expect(root.querySelector("h2").textContent).toBe("Heading");
  expect([...root.querySelectorAll("p")].some(p => p.textContent === "This sentence stays separate.")).toBe(true);
  expect(root.querySelector(".katex")).not.toBeNull();
});

test("uses a formatted source name and retains the original link on a non-bubbling image error", () => {
  document.body.innerHTML = '<div class="annotation selected" data-sidebar-annotation-id="a1"><div class="preview"><header><div class="end"></div></header><div class="comment"><div class="content"></div></div></div></div>';
  const source = `[image](${favicon} "Original title")\n\n**Wiley** Online Library`;
  const comment = document.querySelector(".comment");
  comment.querySelector(".content").textContent = source;
  const original = comment.querySelector(".content").innerHTML;
  const openLink = vi.fn(), adapter = createAnnotationSidebarAdapter({ document, openLink });
  const html = createMarkdownRenderer().render(source);
  adapter.applyRenderedHtml(comment, html);
  const image = comment.querySelector(".annotation-markdown-favicon-image");
  expect(image).not.toBeNull();
  const link = image.closest("a");
  expect(link.title).toBe("Original title");
  expect(link.parentElement.querySelector("strong").textContent).toBe("Wiley");
  image.dispatchEvent(new Event("error"));
  expect(image.hidden).toBe(true);
  expect(link.hidden).toBe(false);
  expect(link.querySelector(".annotation-markdown-favicon-fallback").textContent).toBe("image");
  adapter.applyRenderedHtml(comment, html);
  expect(comment.querySelector("img")).toBe(image);
  link.click();
  expect(openLink).toHaveBeenCalledExactlyOnceWith(favicon);
  expect(comment.classList.contains("annotation-markdown-editing")).toBe(false);
  expect(comment.querySelector(".content").innerHTML).toBe(original);
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
    await vi.waitFor(() => expect(failed.querySelector("img").hidden).toBe(true));
    expect(failed.querySelector("a").hidden).toBe(false);
    expect(failed.querySelector("a").getAttribute("href")).toBe(favicon);
    expect(failed.textContent).toContain("Wiley");
  } finally { failure.stop(); }
});

test("defers small icon requests until visible, including wrapped Gecko targets", async () => {
  let intersect;
  const unobserve = vi.fn();
  const Observer = vi.fn(function (callback) { intersect = callback; return { observe: vi.fn(), unobserve, disconnect: vi.fn() }; });
  const root = render(`[image](${favicon})\n\nWiley`, { deferLinkedImages: true });
  document.body.append(root);
  const load = vi.fn(async () => "data:image/png;base64,AQID"), loader = createLinkedImageLoader({ load, IntersectionObserver: Observer });
  try {
    loader.observe(root);
    expect(load).not.toHaveBeenCalled();
    const link = root.querySelector("a");
    intersect([{ target: new Proxy(link, {}), isIntersecting: true }]);
    await vi.waitFor(() => expect(root.querySelector("img").getAttribute("src")).toBe("data:image/png;base64,AQID"));
    expect(unobserve).toHaveBeenCalledWith(link);
    expect(load).toHaveBeenCalledExactlyOnceWith(favicon);
  } finally { loader.stop(); }
});

test.each(["+1", "+3", "61%"])("does not merge citation or numeric metadata (%s)", value => {
  const root = render(`[image](${favicon})\n\n${value}`);
  expect(root.querySelectorAll("p")).toHaveLength(2);
  expect(root.querySelector("p").textContent).not.toContain(value);
});

test("does not include source icons in mixed annotation or direct section image counts", async () => {
  const { trackAnnotationOutline } = await import("../src/annotation-outline.ts");
  const svg = '```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20"/></svg>\n```';
  const source = [`# Source`, `[image](${favicon})`, 'Wiley', '## Content', '![Photo](https://example.org/photo.png)', svg].join("\n\n");
  document.body.innerHTML = '<div id="annotations" style="overflow-y:auto"><div class="annotation selected"><div class="annotation-markdown-rendered" data-annotation-markdown-preview="true"></div></div></div>';
  document.querySelector("#annotations").getBoundingClientRect = () => ({ left: 20, top: 60, right: 320, bottom: 660, width: 300, height: 600 });
  const preview = document.querySelector("[data-annotation-markdown-preview]");
  preview.innerHTML = createMarkdownRenderer({ isSvgEnabled: () => true }).render(source);
  const outline = trackAnnotationOutline({ document, isEnabled: () => true, isExpanded: () => true, setExpanded() {} });
  try {
    expect(preview.querySelector(".annotation-markdown-favicon-image")).not.toBeNull();
    expect(countRenderedImages(preview)).toEqual({ img: 1, svg: 1 });
    const items = [...document.querySelectorAll(".annotation-markdown-outline-item")];
    expect(items[0].querySelector(".annotation-markdown-outline-svg-badge")).toBeNull();
    expect(items[1].querySelector(".annotation-markdown-outline-svg-badge").textContent).toBe("IMG · SVG");
    expect(items[1].title).toContain("1 image and 1 SVG diagram");
  } finally { outline.stop(); }
});
