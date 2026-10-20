/** Small, noninteractive image markers beside Reader page annotations. */
import { createSvgBadgeTooltip, SVG_BADGE_TOOLTIP } from "./svg-badge-tooltip.js";
import { imageBadgeLabel, imageCountHint, imageLocale, type ImageCounts } from "./image-counts.js";

type Annotation = {
  id: string;
  type: string;
  comment?: string;
  position?: { pageIndex?: number; rects?: number[][] };
};

type PdfPage = {
  _pageIndex: number;
  _originalPage?: { div?: HTMLElement; viewport?: { transform?: number[] } };
};

type ReaderView = {
  _annotations?: Annotation[];
  _pages?: PdfPage[];
  _iframeWindow?: Window;
  _iframeDocument?: Document;
  _annotationRenderRootEl?: HTMLElement;
};

type Reader = {
  _internalReader?: unknown;
  _waitForReader?: () => PromiseLike<void> | null;
};

type InternalReader = {
  _views?: ReaderView[];
  _primaryView?: ReaderView;
  _secondaryView?: ReaderView;
};

type Rect = { left: number; top: number; right: number; bottom: number };
type BadgeEntry = { x: number; y: number; container: Element; counts: ImageCounts; width: number };

const BADGE_WIDTH = 28;
const MIXED_BADGE_WIDTH = 60;
const BADGE_HEIGHT = 16;
const BADGE_GAP = 2;

const BADGE = "data-annotation-markdown-svg-page-badge";
const SIDEBAR_BADGE = "data-annotation-markdown-svg-badge";

export function createSvgAnnotationBadges({
  reader, document: readerDocument, isEnabled, getImageCounts, getLocale,
  MutationObserver: MutationObserverRef = globalThis.MutationObserver
}: {
  reader: Reader;
  document: Document;
  isEnabled(): boolean;
  getImageCounts(source: string): ImageCounts;
  getLocale?(): string | undefined;
  MutationObserver?: typeof MutationObserver | null;
}) {
  let active = false;
  let frame: number | undefined;
  let startRetry: number | undefined;
  let startAttempts = 0;
  let rootObserver: MutationObserver | undefined;
  const observedDocuments = new Set<Document>();
  const pageObservers = new Map<Document, MutationObserver>();
  const shadowObservers = new Map<ShadowRoot, MutationObserver>();
  const pageResizeObservers = new Map<Document, ResizeObserver>();
  const pageWindows = new Set<Window>();
  const visitedRoots = new Set<Document | ShadowRoot>();
  const tooltip = createSvgBadgeTooltip();
  const pdfTextBoundsCache = new WeakMap<HTMLElement, {
    layer: Element | null; signature: string; bounds: Rect[];
  }>();
  const views = (): ReaderView[] => {
    const internal = reader._internalReader as InternalReader | undefined;
    return internal?._views ?? [internal?._primaryView, internal?._secondaryView].filter(Boolean) as ReaderView[];
  };
  const viewDocument = (view: ReaderView): Document | undefined =>
    view._iframeWindow?.document ?? view._iframeDocument;
  const queue = () => {
    if (!active || frame !== undefined) return;
    const win = readerDocument.defaultView;
    frame = win?.requestAnimationFrame ? win.requestAnimationFrame(() => {
      frame = undefined;
      sync();
    }) : undefined;
    if (frame === undefined) sync();
  };

  function observePageDocument(doc: Document): void {
    if (!doc.body || observedDocuments.has(doc)) return;
    observedDocuments.add(doc);
    const win = doc.defaultView;
    if (MutationObserverRef) {
      const observer = new MutationObserverRef(mutations => {
        if (hasNonBadgeChildChange(mutations)) queue();
      });
      try {
        observer.observe(doc.body, { childList: true, subtree: true });
        pageObservers.set(doc, observer);
      } catch {
        observer.disconnect();
      }
    }
    if (win && !pageWindows.has(win)) {
      win.addEventListener("scroll", queue, true);
      win.addEventListener("resize", queue);
      pageWindows.add(win);
    }
    if (globalThis.ResizeObserver) {
      pageResizeObservers.set(doc, new globalThis.ResizeObserver(queue));
    }
  }

  function sync(): void {
    if (!active) return;
    const desired = new Map<Document | ShadowRoot, Map<string, BadgeEntry>>();
    if (isEnabled()) for (const view of views()) {
      const doc = viewDocument(view);
      if (!doc) continue;
      observePageDocument(doc);
      const annotations = view._annotations ?? [];
      if (Array.isArray(view._pages)) {
        const resizeObserver = pageResizeObservers.get(doc);
        for (const page of view._pages) {
          const div = page._originalPage?.div;
          const transform = page._originalPage?.viewport?.transform;
          if (!div?.isConnected || !transform || transform.length < 6) continue;
          try { resizeObserver?.observe(div); } catch { /* scroll and mutations still refresh the badge */ }
          visitedRoots.add(doc);
          const entries = desired.get(doc) ?? new Map();
          desired.set(doc, entries);
          const commentIcons = pdfCommentIconRects(annotations, page._pageIndex);
          const iconBounds = new Map<string, Rect>();
          for (const annotation of annotations) {
            if (!["highlight", "underline", "image", "note"].includes(annotation.type) ||
                annotation.position?.pageIndex !== page._pageIndex || !annotation.position.rects?.[0] ||
                !annotation.comment) continue;
            const bounds = pdfIconBounds(annotation, transform, commentIcons.get(annotation.id));
            if (bounds) iconBounds.set(annotation.id, bounds);
          }
          const icons = Array.from(iconBounds.values());
          const placed: Rect[] = [];
          const pageRect = div.getBoundingClientRect();
          for (const annotation of annotations) {
            if (!mayContainImages(annotation.comment) || !iconBounds.has(annotation.id)) continue;
            const counts = getImageCounts(annotation.comment!);
            if (!imageBadgeLabel(counts)) continue;
            const width = imageBadgeWidth(counts);
            const textBounds = pdfTextBounds(div, pageRect, transform, pdfTextBoundsCache);
            const marker = choosePdfBadgePosition(iconBounds.get(annotation.id)!, icons, placed, textBounds,
              pageRect.width, pageRect.height, width);
            placed.push({ left: marker.x, top: marker.y,
              right: marker.x + width, bottom: marker.y + BADGE_HEIGHT });
            entries.set(annotation.id, { ...marker, container: div, counts, width });
          }
        }
      } else if (view._annotationRenderRootEl?.isConnected) {
        const shadow = view._annotationRenderRootEl.getRootNode();
        if (!isShadowRoot(shadow)) continue;
        if (!shadowObservers.has(shadow)) {
          if (MutationObserverRef) {
            const observer = new MutationObserverRef(mutations => {
              if (hasNonBadgeChildChange(mutations)) queue();
            });
            try {
              observer.observe(shadow, { childList: true, subtree: true });
              shadowObservers.set(shadow, observer);
            } catch {
              observer.disconnect();
            }
          }
        }
        visitedRoots.add(shadow);
        const entries = desired.get(shadow) ?? new Map();
        desired.set(shadow, entries);
        for (const annotation of annotations) {
          if (!["highlight", "underline", "note"].includes(annotation.type) ||
              !mayContainImages(annotation.comment)) continue;
          const counts = getImageCounts(annotation.comment!);
          if (!imageBadgeLabel(counts)) continue;
          const target = Array.from(view._annotationRenderRootEl.querySelectorAll<Element>("[data-annotation-id]"))
            .find(element => element.getAttribute("data-annotation-id") === annotation.id &&
              (element.localName === "g" || element.localName === "svg"));
          const rect = target?.getBoundingClientRect();
          if (rect?.width && rect?.height) {
            const width = imageBadgeWidth(counts);
            entries.set(annotation.id, { x: rect.left + 10, y: rect.top - 5, container: view._annotationRenderRootEl, counts, width });
          }
        }
      }
    }
    const currentBadges: HTMLElement[] = [];
    for (const root of visitedRoots) {
      const entries: Map<string, BadgeEntry> = desired.get(root) ?? new Map();
      const existing = Array.from(root.querySelectorAll<HTMLElement>(`[${BADGE}]`));
      for (const badge of existing) {
        const entry = entries.get(badge.getAttribute(BADGE) ?? "");
        if (!entry || badge.parentElement !== entry.container) badge.remove();
      }
      for (const [id, entry] of entries) {
        const badge = Array.from(entry.container.children as HTMLCollectionOf<Element>).find(node => node.getAttribute(BADGE) === id) as HTMLElement | undefined
          ?? makeBadge(entry.container.ownerDocument, id);
        if (!badge.isConnected) entry.container.append(badge);
        const hint = imageCountHint(entry.counts, "annotation", imageLocale(readerDocument, getLocale?.()));
        const label = imageBadgeLabel(entry.counts);
        if (badge.textContent !== label) badge.textContent = label;
        if (badge.title !== hint) badge.title = hint;
        const width = `${entry.width}px`;
        if (badge.style.width !== width) badge.style.width = width;
        currentBadges.push(badge);
        const position = isShadowRoot(entry.container.getRootNode()) ? "fixed" : "absolute";
        const left = `${Math.round(entry.x)}px`, top = `${Math.round(entry.y)}px`;
        if (badge.style.position !== position) badge.style.position = position;
        if (badge.style.left !== left) badge.style.left = left;
        if (badge.style.top !== top) badge.style.top = top;
      }
    }
    // Sidebar labels also pass mouse input through to the native header.
    // Reuse the same document listeners to make their count hints hoverable.
    tooltip.sync(currentBadges.concat(Array.from(readerDocument.querySelectorAll<HTMLElement>(`[${SIDEBAR_BADGE}='sidebar']`))));
  }

  function stop(): void {
    active = false;
    tooltip.stop();
    if (frame !== undefined) readerDocument.defaultView?.cancelAnimationFrame?.(frame);
    frame = undefined;
    if (startRetry !== undefined) readerDocument.defaultView?.clearTimeout(startRetry);
    startRetry = undefined;
    startAttempts = 0;
    rootObserver?.disconnect(); rootObserver = undefined;
    readerDocument.removeEventListener("load", queue, true);
    for (const observer of pageObservers.values()) observer.disconnect();
    for (const observer of shadowObservers.values()) observer.disconnect();
    for (const observer of pageResizeObservers.values()) observer.disconnect();
    for (const win of pageWindows) {
      win.removeEventListener("scroll", queue, true);
      win.removeEventListener("resize", queue);
    }
    observedDocuments.clear(); pageObservers.clear(); shadowObservers.clear(); pageResizeObservers.clear(); pageWindows.clear();
    for (const root of visitedRoots) root.querySelectorAll(`[${BADGE}]`).forEach(node => node.remove());
    visitedRoots.clear();
  }

  function start(): void {
    if (active || !isEnabled()) return;
    if (!views().some(view => view && viewDocument(view))) {
      // A newly opened Reader can expose its outer iframe before the page
      // view exists. Only real host Readers take this short startup retry.
      if (reader._waitForReader && startAttempts++ < 80 && startRetry === undefined) {
        startRetry = readerDocument.defaultView?.setTimeout(() => {
          startRetry = undefined;
          start();
        }, 250);
      }
      return;
    }
    active = true;
    readerDocument.addEventListener("load", queue, true);
    if (MutationObserverRef && readerDocument.body) {
      rootObserver = new MutationObserverRef(mutations => {
        for (const mutation of mutations) {
          const target = mutation.target.nodeType === 1 ? mutation.target as Element : mutation.target.parentElement;
          const changedNodes = Array.from(mutation.addedNodes ?? []).concat(Array.from(mutation.removedNodes ?? []));
          if (target?.closest(`[${SIDEBAR_BADGE}]`) || changedNodes.some(node =>
            node?.nodeType === 1 && (node as Element).hasAttribute(SIDEBAR_BADGE))) {
            queue();
            break;
          }
          const changed = changedNodes
            .filter(node => node?.nodeType === 1 && !(node as Element).hasAttribute(BADGE) &&
              !(node as Element).hasAttribute(SVG_BADGE_TOOLTIP) &&
              !(node as Element).hasAttribute(SIDEBAR_BADGE)) as Element[];
          const sourceTextChanged = Boolean(target?.closest(".comment .content")) &&
            changedNodes.some(node => node?.nodeType === 3);
          if (changed.some(node => node.matches(".annotation, .annotation-popup, iframe") ||
            Boolean(node.querySelector(".annotation, .annotation-popup, iframe"))) ||
            sourceTextChanged ||
            (changed.length > 0 && Boolean(target?.closest(".comment, .annotation-popup, [data-sidebar-annotation-id], #primary-view, #secondary-view")))) {
            queue();
            break;
          }
        }
      });
      try {
        rootObserver.observe(readerDocument.body, { childList: true, subtree: true });
      } catch {
        rootObserver.disconnect();
        rootObserver = undefined;
      }
    }
    sync();
  }

  return {
    start,
    refresh() { if (!isEnabled()) stop(); else if (active) sync(); else start(); },
    stop
  };
}

function isShadowRoot(root: Node): root is ShadowRoot {
  return root.nodeType === 11 && "host" in root;
}

function mayContainImages(source?: string): boolean {
  return Boolean(source && /<svg\b|!\[|https?:\/\/|(?:`{3,}|~{3,})[ \t]*mermaid(?:\s|$)/i.test(source));
}

function imageBadgeWidth(counts: ImageCounts): number {
  // Keep existing marker geometry; reserve enough room for longer source labels.
  if ((counts.mermaid ?? 0) > 0) return Math.ceil(imageBadgeLabel(counts).length * 6.5 + 8);
  return counts.img > 0 && counts.svg > 0 ? MIXED_BADGE_WIDTH : BADGE_WIDTH;
}

function hasNonBadgeChildChange(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    for (const nodes of [mutation.addedNodes, mutation.removedNodes]) {
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        if (node?.nodeType === 1 && !(node as Element).hasAttribute(BADGE) &&
            !(node as Element).hasAttribute(SVG_BADGE_TOOLTIP)) return true;
      }
    }
  }
  return false;
}

function pdfCommentIconRects(annotations: Annotation[], pageIndex: number): Map<string, number[]> {
  // Reader arrays belong to its content realm. Calling their array methods
  // with a privileged callback is denied by Gecko's cross-compartment wrapper.
  const notes: { id: string; rect: number[] }[] = [];
  for (let index = annotations.length - 1; index >= 0; index--) {
    const annotation = annotations[index];
    if (!["highlight", "underline", "image"].includes(annotation.type) ||
        !annotation.comment || annotation.position?.pageIndex !== pageIndex ||
        annotation.position.rects?.[0]?.length !== 4) continue;
    const rect = annotation.position.rects[0];
    notes[notes.length] = { id: annotation.id, rect: [rect[0] - 3.5, rect[3] - 7 / 3, rect[0] + 3.5, rect[3] + 14 / 3] };
  }
  for (let index = 1; index < notes.length; index++) {
    const note = notes[index];
    let insertion = index;
    while (insertion > 0 && notes[insertion - 1].rect[0] > note.rect[0]) {
      notes[insertion] = notes[insertion - 1];
      insertion--;
    }
    notes[insertion] = note;
  }
  for (const note of notes) {
    for (const prior of notes) {
      if (prior === note) break;
      const a = note.rect, b = prior.rect;
      if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) {
        const shift = (b[2] - b[0]) * 2 / 3;
        a[0] = b[0] + shift;
        a[2] = b[2] + shift;
      }
    }
  }
  const result = new Map<string, number[]>();
  for (const note of notes) result.set(note.id, note.rect);
  return result;
}

function pdfIconBounds(annotation: Annotation, transform: number[], commentIcon?: number[]): Rect | null {
  const rect = commentIcon ?? annotation.position?.rects?.[0];
  if (!rect || rect.length < 4) return null;
  for (let index = 0; index < 4; index++) if (!Number.isFinite(rect[index])) return null;
  const [a, b, c, d, e, f] = transform;
  const corners = [
    [rect[0], rect[1]], [rect[0], rect[3]], [rect[2], rect[1]], [rect[2], rect[3]]
  ];
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [x, y] of corners) {
    const tx = a * x + c * y + e, ty = b * x + d * y + f;
    left = Math.min(left, tx); top = Math.min(top, ty);
    right = Math.max(right, tx); bottom = Math.max(bottom, ty);
  }
  return { left, top, right, bottom };
}

function pdfTextBounds(
  page: HTMLElement, pageRect: DOMRect, transform: number[],
  cache: WeakMap<HTMLElement, { layer: Element | null; signature: string; bounds: Rect[] }>
): Rect[] {
  const layer = page.querySelector(".textLayer");
  if (!layer) return [];
  const signature = `${pageRect.width}:${pageRect.height}:${layer.childElementCount}:${transform[0]}:${transform[1]}:${transform[2]}:${transform[3]}`;
  const cached = cache.get(page);
  if (cached?.layer === layer && cached.signature === signature) return cached.bounds;
  const bounds: Rect[] = [];
  for (const span of layer.querySelectorAll(":scope > span")) {
    const rect = span.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    bounds.push({ left: rect.left - pageRect.left, top: rect.top - pageRect.top,
      right: rect.right - pageRect.left, bottom: rect.bottom - pageRect.top });
  }
  cache.set(page, { layer, signature, bounds });
  return bounds;
}

function choosePdfBadgePosition(
  icon: Rect, icons: Rect[], placed: Rect[], text: Rect[], pageWidth: number, pageHeight: number, width: number
): { x: number; y: number } {
  const gap = BADGE_GAP;
  const candidates = [
    { x: icon.right + gap, y: icon.top - 1 },
    { x: icon.left - width - gap, y: icon.top - 1 },
    { x: icon.right + gap, y: icon.top - BADGE_HEIGHT - gap },
    { x: icon.left - width - gap, y: icon.top - BADGE_HEIGHT - gap },
    { x: icon.right + gap, y: icon.bottom + gap },
    { x: icon.left - width - gap, y: icon.bottom + gap }
  ];
  let best = candidates[0], bestScore = Infinity;
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const box = { left: candidate.x, top: candidate.y,
      right: candidate.x + width, bottom: candidate.y + BADGE_HEIGHT };
    let score = index / 100;
    if (pageWidth > 0 && pageHeight > 0) {
      score += 1000 * (width * BADGE_HEIGHT - overlapArea(box, {
        left: 0, top: 0, right: pageWidth, bottom: pageHeight
      }));
    }
    for (const obstacle of icons) score += 1000 * overlapArea(box, obstacle);
    for (const obstacle of placed) score += 1000 * overlapArea(box, obstacle);
    for (const obstacle of text) score += 10 * overlapArea(box, obstacle);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

function overlapArea(a: Rect, b: Rect): number {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

function makeBadge(doc: Document, id: string): HTMLElement {
  const badge = doc.createElement("span");
  badge.setAttribute(BADGE, id);
  badge.setAttribute("aria-hidden", "true");
  badge.style.position = "absolute";
  badge.style.zIndex = "4";
  badge.style.pointerEvents = "none";
  badge.style.userSelect = "none";
  badge.style.whiteSpace = "nowrap";
  badge.style.padding = "1px 3px";
  badge.style.boxSizing = "border-box";
  badge.style.height = `${BADGE_HEIGHT}px`;
  badge.style.textAlign = "center";
  badge.style.border = "1px solid #9ca3af";
  badge.style.borderRadius = "3px";
  badge.style.background = "#fff";
  badge.style.color = "#334155";
  badge.style.font = "700 9px/1.2 sans-serif";
  badge.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.2)";
  return badge;
}
