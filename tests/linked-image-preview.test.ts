import { afterEach, describe, expect, test } from "vitest";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { queryElement, requireValue } from "./helpers/dom.ts";

const openaiImage = "https://images.openai.com/static-rsc-4/sample-image?purpose=inline";
const render = (source: string) => {
  const root = document.createElement("div");
  root.innerHTML = createMarkdownRenderer().render(source);
  return root;
};
afterEach(() => { document.body.innerHTML = ""; });

describe("standalone image-link previews", () => {
  test.each([
    openaiImage, "https://images.openai.com/static-rsc/sample-image",
    "https://example.org/photo.jpg", "https://example.org/PHOTO.PNG?size=large#image",
    "https://example.org/photo.webp", "https://example.org/photo.avif"
  ])("previews a standalone image link while retaining its caption and source URL: %s", (url: string) => {
    const root = render(`[Photo **caption**](${url} "Source title")`);
    const figure = queryElement(root, "figure.annotation-markdown-linked-image");
    expect(figure).not.toBeNull();
    const image = queryElement(figure, "img", HTMLImageElement);
    expect(image.getAttribute("src")).toBe(url);
    expect(image.alt).toBe("Photo caption");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    const caption = queryElement(figure, "figcaption a", HTMLAnchorElement);
    expect(caption.getAttribute("href")).toBe(url);
    expect(caption.title).toBe("Source title");
    expect(queryElement(caption, "strong").textContent).toBe("caption");
  });

  test("handles standalone bare and reference-style image links on the math-capable rendering path", () => {
    const root = render(`Formula $a^2$\n\n${openaiImage}\n\n[Photo][pic]\n\n[pic]: https://example.org/photo.png`);
    expect(root.querySelectorAll("figure.annotation-markdown-linked-image")).toHaveLength(2);
    expect(root.querySelector(".katex")).not.toBeNull();
  });

  test.each([
    `See [Photo](${openaiImage}) for details.`,
    `## [Photo](${openaiImage})`,
    `[Photo](${openaiImage}) [Other](https://example.org/other.jpg)`,
    `\`\`\`markdown\n[Photo](${openaiImage})\n\`\`\``,
    `[Article](https://example.org/page?image=photo.jpg)`,
    `[Spoof](https://images.openai.com.example.org/static-rsc-4/image)`,
    `[Unrecognized](https://images.openai.com/other/image)`,
    `[Local](file:///C:/photo.png)`,
    `[Vector](https://example.org/diagram.svg)`,
    `- [List item](${openaiImage})`,
    `![Explicit image](${openaiImage})`,
    `[![Linked image](https://example.org/photo.png)](https://example.org/article)`
  ])("preserves inline links, code, unrelated URLs and explicit Markdown images: %s", (source: string) => {
    expect(render(source).querySelector("figure.annotation-markdown-linked-image")).toBeNull();
  });

  test("escapes generated image attributes without changing caption text or URL query parameters", () => {
    const url = "https://example.org/photo.png?a=1&b=2";
    const root = render(`[A & B \"quoted\"](${url})`);
    expect(queryElement(root, "img", HTMLImageElement).alt).toBe('A & B "quoted"');
    expect(queryElement(root, "img").getAttribute("src")).toBe(url);
    expect(queryElement(root, "figcaption a").textContent).toBe('A & B "quoted"');
    expect(queryElement(root, "img").hasAttribute("onerror")).toBe(false);
  });

  test("falls back to the original link on a non-bubbling image error without changing stored source or retrying on identical renders", () => {
    document.body.innerHTML = '<div class="annotation selected" data-sidebar-annotation-id="a1"><div class="comment"><div class="content"></div></div></div>';
    const comment = queryElement(document, ".comment", HTMLElement);
    const source = queryElement(comment, ".content");
    const markdown = `[Photo](${openaiImage})\n\n![Existing](https://example.org/ordinary.png)`;
    source.textContent = markdown;
    const original = source.innerHTML;
    const adapter = createAnnotationSidebarAdapter({ document });
    const html = createMarkdownRenderer().render(markdown);
    adapter.applyRenderedHtml(comment, html);
    const preview = queryElement(comment, "[data-annotation-markdown-preview]");
    const image = queryElement(preview, "figure img", HTMLImageElement);
    expect(image).not.toBeNull();
    image.dispatchEvent(new Event("error"));
    expect(requireValue(image.closest<HTMLAnchorElement>("a")).hidden).toBe(true);
    expect(queryElement(preview, "figcaption a").getAttribute("href")).toBe(openaiImage);
    adapter.applyRenderedHtml(comment, html);
    expect(preview.querySelector("figure img")).toBe(image);
    expect(requireValue(image.closest<HTMLAnchorElement>("a")).hidden).toBe(true);
    const ordinaryImage = queryElement(preview, "p img", HTMLImageElement);
    ordinaryImage.dispatchEvent(new Event("error"));
    expect(ordinaryImage.hidden).toBe(false);
    expect(source.innerHTML).toBe(original);
    adapter.clearRenderedState();
    expect(comment.querySelector("[data-annotation-markdown-preview]")).toBeNull();
    expect(source.textContent).toBe(markdown);
  });

  test("opens the image and caption through the existing link handler without entering source editing", () => {
    document.body.innerHTML = '<div class="annotation selected" data-sidebar-annotation-id="a1"><div class="comment"><div class="content"></div></div></div>';
    const comment = queryElement(document, ".comment", HTMLElement);
    queryElement(comment, ".content").textContent = `[Photo](${openaiImage})`;
    const opened: string[] = [];
    const adapter = createAnnotationSidebarAdapter({ document, openLink: (url: string) => opened.push(url) });
    adapter.applyRenderedHtml(comment, createMarkdownRenderer().render(`[Photo](${openaiImage})`));
    const preview = queryElement(comment, "[data-annotation-markdown-preview]");
    const image = queryElement(preview, "img");
    image.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    image.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }));
    image.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, detail: 1, cancelable: true }));
    expect(opened).toEqual([openaiImage]);
    queryElement(preview, "figcaption a", HTMLAnchorElement).click();
    expect(opened).toEqual([openaiImage, openaiImage]);
    expect(comment.classList.contains("annotation-markdown-editing")).toBe(false);
    expect(comment.querySelector("[data-annotation-markdown-preview]")).toBe(preview);
    adapter.clearRenderedState();
  });
});
