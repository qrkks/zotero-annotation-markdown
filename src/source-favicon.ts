/** Compact source icons copied from citation cards, separate from content images. */
import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

export function faviconDomain(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.google.com", "google.com"].includes(url.hostname) ||
        url.port || url.username || url.password || url.pathname !== "/s2/favicons") return null;
    const domain = url.searchParams.get("domain") || url.searchParams.get("domain_url");
    if (!domain || /\s/.test(domain)) return null;
    const site = new URL(domain.includes(":") ? domain : `https://${domain}`);
    return ["https:", "http:"].includes(site.protocol) && site.hostname && !site.username && !site.password
      ? site.hostname : null;
  } catch {
    return null;
  }
}

interface FaviconMeta { url: string; domain: string; caption: Token[] }

export function installSourceFavicons(markdown: MarkdownIt, deferLoading: boolean): void {
  markdown.core.ruler.after("text_join", "annotation_markdown_source_favicons", state => {
    for (let index = 0; index < state.tokens.length - 2; index++) {
      const opening = state.tokens[index], inline = state.tokens[index + 1], closing = state.tokens[index + 2];
      if (opening.type !== "paragraph_open" || opening.hidden || inline.type !== "inline" || closing.type !== "paragraph_close") continue;
      const caption = [...(inline.children ?? [])];
      while (caption[0]?.type === "text" && !caption[0].content.trim()) caption.shift();
      while (caption.at(-1)?.type === "text" && !caption.at(-1)!.content.trim()) caption.pop();
      if (caption[0]?.type !== "link_open" || caption.at(-1)?.type !== "link_close" ||
          caption.slice(1, -1).some(token => ["link_open", "link_close", "image"].includes(token.type))) continue;
      const url = caption[0].attrGet("href"), domain = url && faviconDomain(url);
      if (!url || !domain) continue;
      const icon = new state.Token("annotation_markdown_source_favicon", "", 0);
      icon.meta = { url, domain, caption } satisfies FaviconMeta;
      caption[0].attrJoin("class", "annotation-markdown-favicon-link");
      caption[0].attrSet("aria-label", domain);
      opening.attrJoin("class", "annotation-markdown-source-reference");
      inline.children = [icon];

      // Pasted citation cards often put their short source name in the next
      // paragraph. Join just that label, retaining its inline formatting.
      const nextOpening = state.tokens[index + 3], nextInline = state.tokens[index + 4], nextClosing = state.tokens[index + 5];
      if (nextOpening?.type === "paragraph_open" && !nextOpening.hidden && nextOpening.level === opening.level &&
          nextInline?.type === "inline" && nextClosing?.type === "paragraph_close" && isSourceName(nextInline)) {
        const space = new state.Token("text", "", 0);
        space.content = " ";
        inline.children.push(space, ...(nextInline.children ?? []));
        state.tokens.splice(index + 3, 3);
      }
    }
  });

  markdown.renderer.rules.annotation_markdown_source_favicon = (tokens, index, options, env, self) => {
    const { url, caption } = tokens[index].meta as FaviconMeta;
    const sourceAttribute = deferLoading ? "data-annotation-markdown-image-src" : "src";
    return self.renderToken(caption, 0, options) +
      `<img class="annotation-markdown-favicon-image" ${sourceAttribute}="${markdown.utils.escapeHtml(url)}" alt="" width="16" height="16" loading="lazy" decoding="async" referrerpolicy="no-referrer">` +
      `<span class="annotation-markdown-favicon-fallback">${self.renderInline(caption.slice(1, -1), options, env)}</span>` +
      self.renderToken(caption, caption.length - 1, options);
  };
}

function isSourceName(inline: Token): boolean {
  const text = inline.content.trim();
  return Boolean(text) && text.length <= 100 && !/[\r\n。！？!?;；:：]|\.\s|\.$/.test(text) && !/^\+?\d+(?:\.\d+)?%?$/.test(text) &&
    Boolean(inline.children?.every(token => ["text", "strong_open", "strong_close", "em_open", "em_close"].includes(token.type)));
}
