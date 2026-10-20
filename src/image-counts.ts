/** Image items in sanitized previews; counting never starts an image request. */
export type ImageCounts = { img: number; svg: number; mermaid?: number };

export function imageKind(image: Element, root: ParentNode): keyof ImageCounts | null {
  if (!image.matches("img") || image.matches(".annotation-markdown-favicon-image")) return null;
  if (image.matches("figure.annotation-markdown-svg > img.annotation-markdown-svg-image")) {
    for (let node: Element | null = image; node && node !== root; node = node.parentElement) {
      if (node.matches("[hidden], [aria-hidden='true'], [inert]")) return null;
    }
    return image.parentElement?.classList.contains("annotation-markdown-mermaid") ? "mermaid" : "svg";
  }
  // Linked previews keep their declaration while pending or failed. Their
  // hidden fallback anchor must not make navigation counts depend on loading.
  return image.getAttribute("src") || image.getAttribute("data-annotation-markdown-image-src") ? "img" : null;
}

export function countRenderedImages(root: ParentNode): ImageCounts {
  const counts: ImageCounts = { img: 0, svg: 0 };
  for (const image of root.querySelectorAll("img")) {
    const kind = imageKind(image, root);
    if (kind) counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

export function imageBadgeLabel({ img, svg, mermaid = 0 }: ImageCounts): string {
  return [img > 0 ? "IMG" : "", svg > 0 ? "SVG" : "", mermaid > 0 ? "MERMAID" : ""].filter(Boolean).join(" · ");
}

export function imageLocale(doc: Document, locale?: string): string {
  return locale || doc.documentElement.lang || doc.defaultView?.navigator.language || "en";
}

export function imageCountHint(counts: ImageCounts, scope: "annotation" | "section", locale: string): string {
  const parts: string[] = [];
  if (locale.toLowerCase().startsWith("zh")) {
    if (counts.img > 0) parts.push(`${counts.img} 张图片`);
    if (counts.svg > 0) parts.push(`${counts.svg} 个 SVG 图`);
    if ((counts.mermaid ?? 0) > 0) parts.push(`${counts.mermaid} 个 Mermaid 图`);
    return parts.length ? `${scope === "annotation" ? "本条批注" : "本节"}含 ${parts.join("、")}` : "";
  }
  if (counts.img > 0) parts.push(`${counts.img} image${counts.img === 1 ? "" : "s"}`);
  if (counts.svg > 0) parts.push(`${counts.svg} SVG diagram${counts.svg === 1 ? "" : "s"}`);
  if ((counts.mermaid ?? 0) > 0) parts.push(`${counts.mermaid} Mermaid diagram${counts.mermaid === 1 ? "" : "s"}`);
  const list = parts.length > 2 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join(" and ");
  return parts.length ? `This ${scope} contains ${list}` : "";
}
