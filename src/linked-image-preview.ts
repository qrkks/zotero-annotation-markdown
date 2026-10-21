/** Preview unmistakable image URLs without rewriting stored Markdown. */
import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

interface LinkedImageMeta {
  url: string;
  alt: string;
  caption: Token[];
}

export function isImageLink(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return false;
    if (/\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(url.pathname)) return true;
    return url.protocol === "https:" && url.hostname === "images.openai.com" &&
      /^\/static-rsc(?:-\d+)?\/[^/]+$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function installLinkedImagePreviews(markdown: MarkdownIt, deferLoading = false): void {
  markdown.core.ruler.after("text_join", "annotation_markdown_linked_images", state => {
    for (let index = 0; index < state.tokens.length - 2; index++) {
      const opening = state.tokens[index], inline = state.tokens[index + 1], closing = state.tokens[index + 2];
      if (opening.type !== "paragraph_open" || opening.hidden || inline.type !== "inline" || closing.type !== "paragraph_close") continue;
      const children = [...(inline.children ?? [])];
      while (children[0]?.type === "text" && !children[0].content.trim()) children.shift();
      while (children.at(-1)?.type === "text" && !children.at(-1)!.content.trim()) children.pop();
      if (children[0]?.type !== "link_open" || children.at(-1)?.type !== "link_close") continue;
      if (children.slice(1, -1).some(token => ["link_open", "link_close", "image"].includes(token.type))) continue;
      const url = children[0].attrGet("href");
      if (!url || !isImageLink(url)) continue;
      const preview = new state.Token("annotation_markdown_linked_image", "", 0);
      preview.meta = {
        url, caption: children,
        alt: children.slice(1, -1).map(token => /^(soft|hard)break$/.test(token.type) ? " " : token.content).join("") || url
      } satisfies LinkedImageMeta;
      opening.tag = closing.tag = "figure";
      opening.attrJoin("class", "annotation-markdown-linked-image");
      inline.children = [preview];
    }
  });

  markdown.renderer.rules.annotation_markdown_linked_image = (tokens, index, options, env, self) => {
    const { url, alt, caption } = tokens[index].meta as LinkedImageMeta;
    const escape = markdown.utils.escapeHtml;
    const sourceAttribute = deferLoading ? "data-annotation-markdown-image-src" : "src";
    return `<a class="annotation-markdown-linked-image-target" href="${escape(url)}" title="View larger" aria-haspopup="dialog"><img class="annotation-markdown-linked-image-content" ${sourceAttribute}="${escape(url)}" alt="${escape(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>` +
      `<figcaption>${self.renderInline(caption, options, env)}</figcaption>`;
  };
}

/** Resource errors do not bubble; preview nodes install this in capture phase. */
export function handleLinkedImageError(event: Event): void {
  const image = event.target as Element | null;
  if (image) hideFailedLinkedImage(image);
}

export function hideFailedLinkedImage(image: Element): void {
  if (image.matches?.("img.annotation-markdown-favicon-image")) {
    (image as HTMLImageElement).hidden = true;
    image.setAttribute("data-annotation-markdown-image-state", "failed");
    return;
  }
  if (!image.matches?.("img.annotation-markdown-linked-image-content")) return;
  const link = image.closest<HTMLAnchorElement>("a.annotation-markdown-linked-image-target");
  if (link?.closest("figure.annotation-markdown-linked-image")) link.hidden = true;
}
