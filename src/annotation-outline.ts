/** A small, persistent outline for the currently selected Markdown preview. */
const PREVIEW = "[data-annotation-markdown-preview='true'].annotation-markdown-rendered:not([data-annotation-markdown-placeholder='true'])";
const SELECTED = [
  ".annotation.selected",
  ".annotation-row.selected",
  "[data-sidebar-annotation-id].selected",
  "[data-annotation-id].selected",
  ".annotation[aria-selected='true']",
  ".annotation-row[aria-selected='true']",
  "[data-sidebar-annotation-id][aria-selected='true']",
  "[data-annotation-id][aria-selected='true']"
].join(",");
const EXCLUDED = ".annotation-popup, .note-editor, .zotero-note-editor, [data-note-editor], .ProseMirror";
const EDITING = ".annotation-markdown-editing, .annotation-markdown-fast-editing";
const OUTLINE = "data-annotation-markdown-outline";
const TARGET = "data-annotation-markdown-outline-target";
const ACTIVE = "aria-current";
const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6";
const HEADING_TOP_INSET_PX = 8;
const VIEWPORT_INSET_PX = 8;
const OUTSIDE_GAP_PX = 6;
const SCROLLBAR_RESERVE_PX = 16;
const PANEL_MAX_WIDTH_PX = 224;
const PANEL_WIDTH_PER_SCALE_PX = 112;
const PANEL_MAX_SCALED_WIDTH_PX = 320;
const PANEL_MIN_OUTSIDE_WIDTH_PX = 168;
let nextPanelID = 0;

export interface AnnotationOutlineController {
  sync(): void;
  stop(): void;
}

interface AnnotationOutlineOptions {
  document: Document;
  MutationObserver?: typeof MutationObserver;
  ResizeObserver?: typeof ResizeObserver;
  isEnabled(): boolean;
  isExpanded(): boolean;
  setExpanded(expanded: boolean): void;
  getFontScale?(): number;
}

export function trackAnnotationOutline({
  document: doc,
  MutationObserver: MutationObserverRef,
  ResizeObserver: ResizeObserverRef,
  isEnabled,
  isExpanded,
  setExpanded,
  getFontScale = () => 1
}: AnnotationOutlineOptions): AnnotationOutlineController {
  const win = doc.defaultView;
  let active = true;
  let preview: HTMLElement | null = null;
  let outline: HTMLElement | null = null;
  let panel: HTMLElement | null = null;
  let toggle: HTMLButtonElement | null = null;
  let headings: HTMLElement[] = [];
  let buttons: HTMLButtonElement[] = [];
  let signature = "";
  let scroller: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | undefined;
  let activeFrame: number | undefined;

  for (const stale of doc.querySelectorAll<HTMLElement>(`[${OUTLINE}='true']`)) stale.remove();
  for (const staleTarget of doc.querySelectorAll<HTMLElement>(`[${TARGET}]`)) staleTarget.removeAttribute(TARGET);

  const observer = MutationObserverRef && doc.body
    ? new MutationObserverRef(() => sync())
    : undefined;
  observer?.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "aria-selected", "aria-hidden", "hidden", "inert", "style"]
  });

  function sync(): void {
    if (!active) return;
    const nextPreview = findSelectedPreview(doc, isEnabled);
    const nextHeadings = nextPreview ? collectHeadings(nextPreview) : [];
    const nextSignature = nextHeadings
      .map(heading => (
        `${heading.tagName}:${getHeadingLabel(heading)}:${getHeadingTooltip(heading)}`
      ))
      .join("\n");

    if (!nextPreview || nextHeadings.length < 2) {
      clearCurrent();
      return;
    }
    if (
      preview === nextPreview &&
      outline?.isConnected &&
      headings.length === nextHeadings.length &&
      headings.every((heading, index) => heading === nextHeadings[index]) &&
      signature === nextSignature
    ) {
      applyFontScale();
      applyExpandedState();
      scheduleViewportUpdate();
      return;
    }

    clearCurrent();
    preview = nextPreview;
    headings = nextHeadings;
    signature = nextSignature;
    mountOutline();
  }

  function mountOutline(): void {
    if (!preview || !doc.body) return;
    const labels = getLabels(doc);
    const nav = doc.createElement("nav");
    nav.className = "annotation-markdown-outline";
    nav.setAttribute(OUTLINE, "true");
    nav.setAttribute("aria-label", labels.outline);

    const surface = doc.createElement("div");
    surface.className = "annotation-markdown-outline-surface";
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "annotation-markdown-outline-toggle";
    button.textContent = `${labels.outline} · ${headings.length}`;
    button.title = labels.toggle;
    const panelID = `annotation-markdown-outline-panel-${++nextPanelID}`;
    button.setAttribute("aria-controls", panelID);

    const menu = doc.createElement("div");
    menu.id = panelID;
    menu.className = "annotation-markdown-outline-panel";
    const list = doc.createElement("div");
    list.className = "annotation-markdown-outline-list";

    buttons = headings.map((heading, index) => {
      heading.setAttribute(TARGET, String(index));
      const item = doc.createElement("button");
      const label = getHeadingLabel(heading);
      item.type = "button";
      item.className = "annotation-markdown-outline-item";
      item.dataset.level = heading.tagName.slice(1);
      item.setAttribute("aria-label", label);
      appendHeadingContent(item, heading);
      item.title = getHeadingTooltip(heading);
      item.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        scrollToHeading(heading);
        setActiveHeading(index);
      });
      return item;
    });
    list.append(...buttons);
    menu.append(list);
    surface.append(button, menu);
    nav.append(surface);

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const expanded = !isExpanded();
      setExpanded(expanded);
      applyExpandedState(expanded);
      if (expanded) scheduleViewportUpdate();
    });
    nav.addEventListener("pointerdown", event => event.stopPropagation());
    nav.addEventListener("mousedown", event => event.stopPropagation());
    nav.addEventListener("click", event => event.stopPropagation());

    // The portal deliberately lives outside the annotation row so Zotero's row
    // overflow and recycling cannot clip it or scroll it away.
    doc.body.append(nav);
    outline = nav;
    panel = menu;
    toggle = button;
    applyFontScale();
    scroller = findScroller(preview);
    scroller?.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
    win?.addEventListener?.("resize", scheduleViewportUpdate);
    if (ResizeObserverRef && scroller) {
      resizeObserver = new ResizeObserverRef(scheduleViewportUpdate);
      resizeObserver.observe(scroller);
    }
    applyExpandedState();
    updateViewport();
  }

  function applyExpandedState(expanded = isExpanded()): void {
    if (!outline || !panel || !toggle) return;
    const value = String(expanded);
    if (outline.dataset.expanded !== value) outline.dataset.expanded = value;
    if (panel.hidden !== !expanded) panel.hidden = !expanded;
    if (toggle.getAttribute("aria-expanded") !== value) toggle.setAttribute("aria-expanded", value);
  }

  function applyFontScale(): void {
    if (!outline) return;
    const size = `${Number((0.85 * getFontScale()).toFixed(3))}em`;
    if (outline.style.getPropertyValue("--annotation-markdown-outline-font-size") !== size) {
      outline.style.setProperty("--annotation-markdown-outline-font-size", size);
    }
  }

  function scrollToHeading(heading: HTMLElement): void {
    if (scroller?.isConnected) {
      const scrollerRect = scroller.getBoundingClientRect();
      const headingRect = heading.getBoundingClientRect();
      const top = Math.max(
        0,
        scroller.scrollTop + headingRect.top - scrollerRect.top - HEADING_TOP_INSET_PX
      );
      scroller.scrollTo({ top, behavior: "smooth" });
      return;
    }
    heading.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function scheduleViewportUpdate(): void {
    if (!active || activeFrame !== undefined) return;
    if (!win?.requestAnimationFrame) {
      updateViewport();
      return;
    }
    activeFrame = win.requestAnimationFrame(() => {
      activeFrame = undefined;
      updateViewport();
    });
  }

  function updateViewport(): void {
    positionOutline();
    updateActiveHeading();
  }

  function positionOutline(): void {
    if (!outline?.isConnected || !scroller?.isConnected) return;
    const rect = scroller.getBoundingClientRect();
    const viewportWidth = Math.max(doc.documentElement.clientWidth, win?.innerWidth ?? 0);
    const viewportHeight = Math.max(doc.documentElement.clientHeight, win?.innerHeight ?? 0);
    const rightAnchor = rect.right + OUTSIDE_GAP_PX;
    const rightSpace = viewportWidth - rightAnchor - VIEWPORT_INSET_PX;
    const canOpenOutside = rightSpace >= PANEL_MIN_OUTSIDE_WIDTH_PX;
    const anchor = canOpenOutside
      ? rightAnchor
      : Math.max(VIEWPORT_INSET_PX, rect.right - SCROLLBAR_RESERVE_PX - OUTSIDE_GAP_PX);
    const availableWidth = canOpenOutside
      ? rightSpace
      : Math.max(0, anchor - VIEWPORT_INSET_PX);
    const panelMaxWidth = Math.min(PANEL_MAX_SCALED_WIDTH_PX, PANEL_MAX_WIDTH_PX +
      Math.max(0, getFontScale() - 1) * PANEL_WIDTH_PER_SCALE_PX);
    const panelWidth = Math.min(panelMaxWidth, availableWidth);
    const topLimit = Math.max(VIEWPORT_INSET_PX, viewportHeight - 40);
    const top = Math.min(Math.max(VIEWPORT_INSET_PX, rect.top + VIEWPORT_INSET_PX), topLimit);
    const side = canOpenOutside ? "right" : "left";

    if (outline.dataset.side !== side) outline.dataset.side = side;
    outline.style.left = `${Math.round(anchor)}px`;
    outline.style.top = `${Math.round(top)}px`;
    outline.style.setProperty("--annotation-markdown-outline-panel-width", `${Math.round(panelWidth)}px`);
  }

  function updateActiveHeading(): void {
    if (!outline?.isConnected || headings.length === 0) return;
    const top = (scroller?.getBoundingClientRect().top ?? 0) + HEADING_TOP_INSET_PX + 1;
    let activeIndex = 0;
    for (let index = 0; index < headings.length; index++) {
      if (headings[index].getBoundingClientRect().top <= top) activeIndex = index;
      else break;
    }
    setActiveHeading(activeIndex);
  }

  function setActiveHeading(index: number): void {
    buttons.forEach((button, buttonIndex) => {
      if (buttonIndex === index) button.setAttribute(ACTIVE, "location");
      else button.removeAttribute(ACTIVE);
    });
  }

  function clearCurrent(): void {
    if (activeFrame !== undefined) win?.cancelAnimationFrame?.(activeFrame);
    activeFrame = undefined;
    scroller?.removeEventListener("scroll", scheduleViewportUpdate);
    win?.removeEventListener?.("resize", scheduleViewportUpdate);
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    for (const heading of headings) heading.removeAttribute(TARGET);
    outline?.remove();
    preview = null;
    outline = null;
    panel = null;
    toggle = null;
    headings = [];
    buttons = [];
    signature = "";
    scroller = null;
  }

  sync();
  return {
    sync,
    stop(): void {
      if (!active) return;
      active = false;
      observer?.disconnect();
      clearCurrent();
      for (const stale of doc.querySelectorAll<HTMLElement>(`[${OUTLINE}='true']`)) stale.remove();
      for (const staleTarget of doc.querySelectorAll<HTMLElement>(`[${TARGET}]`)) staleTarget.removeAttribute(TARGET);
    }
  };
}

function findSelectedPreview(doc: Document, isEnabled: () => boolean): HTMLElement | null {
  if (!isEnabled()) return null;
  const previews = Array.from(doc.querySelectorAll<HTMLElement>(PREVIEW)).filter(candidate => {
    if (candidate.hidden || candidate.closest(EXCLUDED) || candidate.closest(EDITING)) return false;
    if (!candidate.closest(SELECTED)) return false;
    return isVisibleSidebarPreview(candidate);
  });
  return previews.length === 1 ? previews[0] : null;
}

function isVisibleSidebarPreview(preview: HTMLElement): boolean {
  const win = preview.ownerDocument.defaultView;
  let ancestor: HTMLElement | null = preview;
  while (ancestor) {
    const style = win?.getComputedStyle(ancestor);
    if (
      ancestor.hidden ||
      ancestor.getAttribute("aria-hidden") === "true" ||
      ancestor.hasAttribute("inert") ||
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse"
    ) {
      return false;
    }
    ancestor = ancestor.parentElement;
  }

  const scroller = findScroller(preview);
  if (!scroller) return false;
  const rect = scroller.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function collectHeadings(preview: HTMLElement): HTMLElement[] {
  return Array.from(preview.querySelectorAll<HTMLElement>(HEADING_SELECTOR))
    .filter(heading => getHeadingLabel(heading).length > 0);
}

function getHeadingLabel(heading: HTMLElement): string {
  if (!heading.querySelector(".katex")) return normalizeHeadingText(heading.textContent);
  const copy = heading.cloneNode(true) as HTMLElement;
  for (const math of copy.querySelectorAll<HTMLElement>(".katex")) {
    const visible = math.querySelector<HTMLElement>(".katex-html");
    if (visible) math.replaceWith(visible.textContent ?? "");
    else math.querySelector(".katex-mathml annotation")?.remove();
  }
  return normalizeHeadingText(copy.textContent);
}

function getHeadingTooltip(heading: HTMLElement): string {
  if (!heading.querySelector(".katex")) return normalizeHeadingText(heading.textContent);
  const copy = heading.cloneNode(true) as HTMLElement;
  for (const math of copy.querySelectorAll<HTMLElement>(".katex")) {
    const source = getKatexSource(math);
    const fallback = math.querySelector<HTMLElement>(".katex-html")?.textContent ?? "";
    math.replaceWith(source ? `$${source}$` : fallback);
  }
  return normalizeHeadingText(copy.textContent);
}

function getKatexSource(math: HTMLElement): string {
  const annotation = math.querySelector<HTMLElement>(".katex-mathml annotation")
    ?.textContent?.trim();
  if (annotation) return annotation;

  // DOMPurify can unwrap KaTeX's annotation element while retaining its TeX
  // as a direct text node under <math>. MathML presentation text remains in
  // descendant elements, so direct text nodes are the stable sanitized fallback.
  const mathml = math.querySelector<HTMLElement>(".katex-mathml math");
  return Array.from(mathml?.childNodes ?? [])
    .filter(node => node.nodeType === 3)
    .map(node => node.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function appendHeadingContent(target: HTMLElement, heading: HTMLElement): void {
  const doc = target.ownerDocument;
  const content = doc.createDocumentFragment();

  function appendNode(source: Node, parent: ParentNode): void {
    if (source.nodeType === 3) {
      parent.append(doc.createTextNode(source.textContent ?? ""));
      return;
    }
    if (source.nodeType !== 1) return;

    const element = source as HTMLElement;
    if (element.matches(".katex")) {
      const math = element.cloneNode(true) as HTMLElement;
      math.setAttribute("aria-hidden", "true");
      math.removeAttribute("id");
      for (const duplicate of math.querySelectorAll(
        ".katex-mathml, annotation[encoding='application/x-tex']"
      )) duplicate.remove();
      for (const identified of math.querySelectorAll<HTMLElement>("[id]")) {
        identified.removeAttribute("id");
      }
      parent.append(math);
      return;
    }

    if (element.tagName === "BR") {
      parent.append(doc.createTextNode(" "));
      return;
    }
    for (const child of Array.from(element.childNodes)) appendNode(child, parent);
  }

  for (const child of Array.from(heading.childNodes)) appendNode(child, content);
  target.append(content);
}

function normalizeHeadingText(value: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function findScroller(target: HTMLElement): HTMLElement | null {
  const win = target.ownerDocument.defaultView;
  let ancestor = target.parentElement;
  while (ancestor && ancestor !== target.ownerDocument.body) {
    if (/^(auto|scroll|overlay)$/.test(win?.getComputedStyle(ancestor)?.overflowY ?? "")) return ancestor;
    ancestor = ancestor.parentElement;
  }
  return null;
}

function getLabels(doc: Document): { outline: string; toggle: string } {
  const language = doc.documentElement.lang || doc.defaultView?.navigator.language || "en";
  return language.toLowerCase().startsWith("zh")
    ? { outline: "大纲", toggle: "展开或收起大纲" }
    : { outline: "Outline", toggle: "Expand or collapse outline" };
}
