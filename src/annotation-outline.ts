/** A small outline for the active sidebar or page-popup Markdown preview. */
const PREVIEW = "[data-annotation-markdown-preview='true'].annotation-markdown-rendered:not([data-annotation-markdown-placeholder='true'])";
const READY_POPUP = ".annotation-popup[data-annotation-markdown-popup-ready='true']";
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

type OutlineContext = "sidebar" | "popup";

interface OutlineTarget {
  context: OutlineContext;
  mount: HTMLElement;
  popup: HTMLElement | null;
  preview: HTMLElement;
  scroller: HTMLElement;
}

export interface AnnotationOutlineController {
  sync(): void;
  preparePopup(popup: HTMLElement): void;
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
  let context: OutlineContext | null = null;
  let mount: HTMLElement | null = null;
  let popup: HTMLElement | null = null;
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
    ? new MutationObserverRef(mutations => {
      if (mutations.length > 0 && mutations.every(isOutlineOwnedMutation)) return;
      sync();
    })
    : undefined;
  observer?.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "class", "aria-selected", "aria-hidden", "hidden", "inert", "style",
      "data-annotation-markdown-popup-ready", "data-annotation-markdown-popup-positioning"
    ]
  });

  function sync(preparingPopup: HTMLElement | null = null): void {
    if (!active) return;
    const nextTarget = findOutlineTarget(doc, isEnabled, preparingPopup);
    const nextPreview = nextTarget?.preview ?? null;
    const nextHeadings = nextPreview ? collectHeadings(nextPreview) : [];
    const nextSignature = nextHeadings
      .map(heading => (
        `${heading.tagName}:${getHeadingLabel(heading)}:${getHeadingTooltip(heading)}`
      ))
      .join("\n");

    if (!nextTarget || !nextPreview || nextHeadings.length < 2) {
      clearCurrent();
      return;
    }
    if (
      preview === nextPreview &&
      context === nextTarget.context &&
      mount === nextTarget.mount &&
      outline?.isConnected &&
      headings.length === nextHeadings.length &&
      headings.every((heading, index) => heading === nextHeadings[index]) &&
      signature === nextSignature
    ) {
      applyFontScale();
      applyExpandedState();
      const wasHidden = outline.hidden;
      applyPopupVisibility();
      // A just-prepared popup outline was already positioned synchronously
      // while hidden. Revealing it needs no follow-up animation frame.
      if (context !== "popup" || !wasHidden || outline.hidden) {
        scheduleViewportUpdate();
      }
      return;
    }

    clearCurrent();
    context = nextTarget.context;
    mount = nextTarget.mount;
    popup = nextTarget.popup;
    preview = nextPreview;
    scroller = nextTarget.scroller;
    headings = nextHeadings;
    signature = nextSignature;
    mountOutline();
  }

  function mountOutline(): void {
    if (!preview || !doc.body) return;
    const labels = getLabels(doc);
    const nav = doc.createElement("nav");
    nav.className = "annotation-markdown-outline";
    nav.dataset.context = context ?? "sidebar";
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
      const expanded = !getCurrentExpanded();
      setExpanded(expanded);
      applyExpandedState(expanded);
      if (expanded) scheduleViewportUpdate();
    });
    const keepInteractionInOutline = (event: Event) => {
      if (context === "popup") event.preventDefault();
      event.stopPropagation();
    };
    nav.addEventListener("pointerdown", keepInteractionInOutline);
    nav.addEventListener("mousedown", keepInteractionInOutline);
    nav.addEventListener("click", event => event.stopPropagation());

    // Both modes use a Reader-level portal. Popup callers can prepare the
    // portal synchronously after Zotero's layout has stabilized; it remains
    // hidden until the ready marker is set later in the same JavaScript turn.
    mount?.append(nav);
    outline = nav;
    panel = menu;
    toggle = button;
    applyFontScale();
    applyPopupVisibility();
    scroller?.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
    win?.addEventListener?.("resize", scheduleViewportUpdate);
    if (ResizeObserverRef && scroller) {
      resizeObserver = new ResizeObserverRef(scheduleViewportUpdate);
      resizeObserver.observe(scroller);
    }
    applyExpandedState();
    updateViewport();
  }

  function getCurrentExpanded(): boolean {
    return isExpanded();
  }

  function applyExpandedState(expanded = getCurrentExpanded()): void {
    if (!outline || !panel || !toggle) return;
    const value = String(expanded);
    if (outline.dataset.expanded !== value) outline.dataset.expanded = value;
    if (panel.hidden !== !expanded) panel.hidden = !expanded;
    if (toggle.getAttribute("aria-expanded") !== value) toggle.setAttribute("aria-expanded", value);
  }

  function applyPopupVisibility(): void {
    if (!outline) return;
    const hidden = context === "popup" && !popup?.matches(READY_POPUP);
    if (outline.hidden !== hidden) outline.hidden = hidden;
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
    if (context === "popup" && popup?.isConnected) {
      positionPopupOutline(popup);
      return;
    }
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
    setStyleProperty(outline, "left", `${Math.round(anchor)}px`);
    setStyleProperty(outline, "top", `${Math.round(top)}px`);
    setStyleProperty(outline, "--annotation-markdown-outline-panel-width", `${Math.round(panelWidth)}px`);
  }

  function positionPopupOutline(popupElement: HTMLElement): void {
    if (!outline) return;
    const rect = popupElement.getBoundingClientRect();
    const viewportWidth = Math.max(doc.documentElement.clientWidth, win?.innerWidth ?? 0);
    const viewportHeight = Math.max(doc.documentElement.clientHeight, win?.innerHeight ?? 0);
    const rightSpace = Math.max(0, viewportWidth - rect.right - VIEWPORT_INSET_PX - OUTSIDE_GAP_PX);
    const leftSpace = Math.max(0, rect.left - VIEWPORT_INSET_PX - OUTSIDE_GAP_PX);
    let side: "right" | "left";
    let anchor: number;
    let availableWidth: number;

    if (rightSpace >= PANEL_MIN_OUTSIDE_WIDTH_PX) {
      side = "right";
      anchor = rect.right + OUTSIDE_GAP_PX;
      availableWidth = rightSpace;
    } else if (leftSpace >= PANEL_MIN_OUTSIDE_WIDTH_PX) {
      side = "left";
      anchor = rect.left - OUTSIDE_GAP_PX;
      availableWidth = leftSpace;
    } else {
      side = "left";
      anchor = Math.max(VIEWPORT_INSET_PX, rect.right - SCROLLBAR_RESERVE_PX - OUTSIDE_GAP_PX);
      availableWidth = Math.max(0, anchor - VIEWPORT_INSET_PX);
    }

    const panelMaxWidth = Math.min(PANEL_MAX_SCALED_WIDTH_PX, PANEL_MAX_WIDTH_PX +
      Math.max(0, getFontScale() - 1) * PANEL_WIDTH_PER_SCALE_PX);
    const panelWidth = Math.min(panelMaxWidth, availableWidth);
    const panelMaxHeight = Math.max(80, viewportHeight - rect.top - VIEWPORT_INSET_PX - 44);

    if (outline.dataset.side !== side) outline.dataset.side = side;
    setStyleProperty(outline, "left", `${Math.round(anchor)}px`);
    setStyleProperty(
      outline,
      "top",
      `${Math.round(Math.max(VIEWPORT_INSET_PX, rect.top + VIEWPORT_INSET_PX))}px`
    );
    setStyleProperty(outline, "--annotation-markdown-outline-panel-width", `${Math.round(panelWidth)}px`);
    setStyleProperty(outline, "--annotation-markdown-outline-panel-max-height", `${Math.round(panelMaxHeight)}px`);
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
    context = null;
    mount = null;
    popup = null;
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
    sync: () => sync(),
    preparePopup(popupToPrepare: HTMLElement): void {
      sync(popupToPrepare);
    },
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

function isOutlineOwnedMutation(mutation: MutationRecord): boolean {
  if (isOutlineOwnedNode(mutation.target)) return true;
  const changedNodes = [
    ...Array.from(mutation.addedNodes ?? []),
    ...Array.from(mutation.removedNodes ?? [])
  ];
  return changedNodes.length > 0 && changedNodes.every(isOutlineOwnedNode);
}

function isOutlineOwnedNode(node: Node | null): boolean {
  if (!node) return false;
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  return Boolean(
    element?.getAttribute(OUTLINE) === "true" ||
    element?.closest(`[${OUTLINE}='true']`)
  );
}

function setStyleProperty(element: HTMLElement, property: string, value: string): void {
  if (element.style.getPropertyValue(property) !== value) {
    element.style.setProperty(property, value);
  }
}

function findOutlineTarget(
  doc: Document,
  isEnabled: () => boolean,
  preparingPopup: HTMLElement | null = null
): OutlineTarget | null {
  if (!isEnabled()) return null;
  const renderedPopups = Array.from(doc.querySelectorAll<HTMLElement>(".annotation-popup"))
    .filter(candidate => isVisibleElement(candidate) && Boolean(candidate.querySelector(PREVIEW)));
  if (renderedPopups.length > 0) {
    if (
      renderedPopups.length !== 1 ||
      (!renderedPopups[0].matches(READY_POPUP) && renderedPopups[0] !== preparingPopup)
    ) return null;
    const popup = renderedPopups[0];
    if (popup.querySelector(EDITING)) return null;
    const popupPreviews = Array.from(popup.querySelectorAll<HTMLElement>(PREVIEW))
      .filter(candidate => !candidate.hidden && !candidate.closest(EDITING) && isVisibleElement(candidate));
    if (popupPreviews.length !== 1) return null;
    const popupPreview = popupPreviews[0];
    const rect = popupPreview.getBoundingClientRect();
    if (
      rect.width <= 0 || rect.height <= 0 ||
      popupPreview.scrollHeight <= popupPreview.clientHeight + 1
    ) {
      return null;
    }
    return {
      context: "popup",
      mount: doc.body,
      popup,
      preview: popupPreview,
      scroller: popupPreview
    };
  }

  const previews = Array.from(doc.querySelectorAll<HTMLElement>(PREVIEW)).filter(candidate => {
    if (candidate.hidden || candidate.closest(EXCLUDED) || candidate.closest(EDITING)) return false;
    if (!candidate.closest(SELECTED)) return false;
    return isVisibleSidebarPreview(candidate);
  });
  if (previews.length !== 1) return null;
  const preview = previews[0];
  const scroller = findScroller(preview);
  if (!scroller) return null;
  return {
    context: "sidebar",
    mount: doc.body,
    popup: null,
    preview,
    scroller
  };
}

function isVisibleElement(element: HTMLElement): boolean {
  const win = element.ownerDocument.defaultView;
  let ancestor: HTMLElement | null = element;
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
  return true;
}

function isVisibleSidebarPreview(preview: HTMLElement): boolean {
  if (!isVisibleElement(preview)) return false;

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
