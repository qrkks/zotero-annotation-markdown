/** A small outline for the active sidebar or page-popup Markdown preview. */
import { imageKind, imageBadgeLabel, imageCountHint, imageLocale, type ImageCounts } from "./image-counts.js";
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
const HOST_SCOPE = "data-annotation-markdown-outline-host-scope";
const TARGET = "data-annotation-markdown-outline-target";
const ACTIVE = "aria-current";
const HEADING_SELECTOR = "h1,h2,h3,h4,h5,h6";
const CHINESE_NUMBER = "[零〇一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟萬億貳參陸]+";
const ORDINAL_NUMBER = `(?:[0-9]+|${CHINESE_NUMBER})`;
const AUTHORED_HEADING_NUMBER = new RegExp(
  `^(?:第${ORDINAL_NUMBER}(?:章|节|節|篇|部分|卷|编|編)|` +
  `\\(${ORDINAL_NUMBER}\\)|` +
  `(?:[0-9]+(?:\\.[0-9]+)*|${CHINESE_NUMBER})(?:、|\\)|\\.(?=\\s|$)))`
);
const BARE_HEADING_NUMBER = /^([1-9][0-9]*)\s+\S/;
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
  isNumberingEnabled?(): boolean;
  isSmartNumberingEnabled?(): boolean;
  isExpanded(): boolean;
  setExpanded(expanded: boolean): void;
  getFontScale?(): number;
  getLocale?(): string | undefined;
}

export function trackAnnotationOutline({
  document: doc,
  MutationObserver: MutationObserverRef,
  ResizeObserver: ResizeObserverRef,
  isEnabled,
  isNumberingEnabled = () => false,
  isSmartNumberingEnabled = () => true,
  isExpanded,
  setExpanded,
  getFontScale = () => 1,
  getLocale
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
  let imageCounts: ImageCounts[] = [];
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
      if (!mutations.some(mutationMayAffectOutline)) return;
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
    const nextImageCounts = countSectionImages(nextPreview, nextHeadings);
    if (
      context === nextTarget.context &&
      mount === nextTarget.mount &&
      popup === nextTarget.popup &&
      outline?.isConnected &&
      headings.length === nextHeadings.length &&
      signature === nextSignature
    ) {
      // Zotero can replace a popup's rendered subtree with equivalent DOM
      // after it is already visible. Keep the plugin-owned controls mounted
      // so a hover tooltip or pointer gesture is not interrupted midway, and
      // only redirect navigation to the replacement headings/scroller.
      rebindTarget(nextTarget, nextHeadings, nextSignature);
      imageCounts = nextImageCounts;
      applyItemLabels();
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
    imageCounts = nextImageCounts;
    signature = nextSignature;
    mountOutline();
  }

  function mountOutline(): void {
    if (!preview || !doc.body) return;
    const labels = getLabels(doc, getLocale?.());
    const nav = doc.createElement("nav");
    nav.className = "annotation-markdown-outline";
    nav.dataset.context = context ?? "sidebar";
    nav.setAttribute(OUTLINE, "true");
    nav.setAttribute("aria-label", labels.outline);

    const surface = doc.createElement("div");
    surface.className = "annotation-markdown-outline-surface";
    // Zotero's FocusManager treats controls outside known annotation UI as an
    // external click during window capture. Keep this compatibility marker on
    // a plugin-owned, box-less wrapper so normal pointer/focus events can reach
    // the outline without changing the host-owned popup DOM.
    const hostScope = doc.createElement("div");
    hostScope.className = "annotation";
    hostScope.setAttribute(HOST_SCOPE, "true");
    hostScope.style.display = "contents";
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
        scrollToHeadingAt(index);
        setActiveHeading(index);
      });
      return item;
    });
    applyItemLabels();
    list.append(...buttons);
    menu.append(list);
    surface.append(button, menu);
    hostScope.append(surface);
    nav.append(hostScope);

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const expanded = !getCurrentExpanded();
      setExpanded(expanded);
      applyExpandedState(expanded);
      if (expanded) scheduleViewportUpdate();
    });
    const keepInteractionInOutline = (event: Event) => {
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

  function applyItemLabels(): void {
    const headingLabels = headings.map(getHeadingLabel);
    const headingTooltips = headings.map(getHeadingTooltip);
    const numbers = !isNumberingEnabled() ? []
      : isSmartNumberingEnabled() ? getAutomaticHeadingNumbers(headings, headingTooltips)
        : getHeadingNumbers(headings);
    buttons.forEach((button, index) => {
      const number = numbers[index];
      const prefix = number ? `${number} ` : "";
      let label = button.querySelector<HTMLElement>(".annotation-markdown-outline-number");
      if (number) {
        if (!label) {
          label = doc.createElement("span");
          label.className = "annotation-markdown-outline-number";
          label.setAttribute("aria-hidden", "true");
          button.prepend(label);
        }
        if (label.textContent !== prefix) label.textContent = prefix;
      } else label?.remove();
      const counts = imageCounts[index] ?? { img: 0, svg: 0 };
      const hint = imageCountHint(counts, "section", imageLocale(doc, getLocale?.()));
      let badge = button.querySelector<HTMLElement>(".annotation-markdown-outline-svg-badge");
      if (hint) {
        if (!badge) {
          badge = doc.createElement("span");
          badge.className = "annotation-markdown-outline-svg-badge";
          badge.setAttribute("aria-hidden", "true");
          button.append(badge);
        }
        const badgeLabel = imageBadgeLabel(counts);
        if (badge.textContent !== badgeLabel) badge.textContent = badgeLabel;
        if (badge.title !== hint) badge.title = hint;
      } else badge?.remove();
      const accessibleLabel = prefix + headingLabels[index] + (hint ? ` · ${hint}` : "");
      const tooltip = prefix + headingTooltips[index] + (hint ? `\n${hint}` : "");
      if (button.getAttribute("aria-label") !== accessibleLabel) button.setAttribute("aria-label", accessibleLabel);
      if (button.title !== tooltip) button.title = tooltip;
    });
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

  function rebindTarget(
    nextTarget: OutlineTarget,
    nextHeadings: HTMLElement[],
    nextSignature: string
  ): void {
    for (const heading of headings) heading.removeAttribute(TARGET);
    nextHeadings.forEach((heading, index) => heading.setAttribute(TARGET, String(index)));

    if (scroller !== nextTarget.scroller) {
      scroller?.removeEventListener("scroll", scheduleViewportUpdate);
      resizeObserver?.disconnect();
      resizeObserver = undefined;
      scroller = nextTarget.scroller;
      scroller.addEventListener("scroll", scheduleViewportUpdate, { passive: true });
      if (ResizeObserverRef) {
        resizeObserver = new ResizeObserverRef(scheduleViewportUpdate);
        resizeObserver.observe(scroller);
      }
    }

    context = nextTarget.context;
    mount = nextTarget.mount;
    popup = nextTarget.popup;
    preview = nextTarget.preview;
    headings = nextHeadings;
    signature = nextSignature;
  }

  function scrollToHeadingAt(index: number): void {
    const heading = headings[index];
    if (!heading?.isConnected) return;
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
    imageCounts = [];
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

function mutationMayAffectOutline(mutation: MutationRecord): boolean {
  if (nodeMayAffectOutline(mutation.target)) return true;
  return [
    ...Array.from(mutation.addedNodes ?? []),
    ...Array.from(mutation.removedNodes ?? [])
  ].some(nodeMayAffectOutline);
}

function nodeMayAffectOutline(node: Node | null): boolean {
  if (!node) return false;
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  if (!element) return false;
  const relevant = `${PREVIEW},${SELECTED},.annotation-popup,${EDITING}`;
  return Boolean(
    element.matches(relevant) ||
    element.closest(relevant) ||
    element.querySelector(relevant)
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

function countSectionImages(preview: HTMLElement, headings: HTMLElement[]): ImageCounts[] {
  const counts = headings.map(() => ({ img: 0, svg: 0 }));
  const indices = new Map(headings.map((heading, index) => [heading, index]));
  let current = -1;
  // Document order also handles figures inside quotes or lists. Each heading
  // starts a new direct section, without propagating counts to its ancestors.
  for (const node of preview.querySelectorAll<HTMLElement>(`${HEADING_SELECTOR},img`)) {
    if (node.matches(HEADING_SELECTOR)) {
      current = indices.get(node) ?? -1;
    } else if (current >= 0) {
      const kind = imageKind(node, preview);
      if (kind) counts[current][kind]++;
    }
  }
  return counts;
}

function getHeadingLabel(heading: HTMLElement): string {
  if (!heading.querySelector(".katex")) return normalizeHeadingText(heading.textContent);
  const copy = heading.cloneNode(true) as HTMLElement;
  for (const math of copy.querySelectorAll<HTMLElement>(".katex")) {
    const visible = math.querySelector<HTMLElement>(".katex-html");
    if (visible) math.replaceWith(visible.textContent ?? "");
    else math.querySelector("math annotation[encoding='application/x-tex']")?.remove();
  }
  return normalizeHeadingText(copy.textContent);
}

function getHeadingTooltip(heading: HTMLElement): string {
  if (!heading.querySelector(".katex")) return normalizeHeadingText(heading.textContent);
  const copy = heading.cloneNode(true) as HTMLElement;
  for (const math of copy.querySelectorAll<HTMLElement>(".katex")) {
    const source = getKatexSource(math);
    const fallback = math.querySelector(".katex-html, math")?.textContent ?? "";
    math.replaceWith(source ? `$${source}$` : fallback);
  }
  return normalizeHeadingText(copy.textContent);
}

function getKatexSource(math: HTMLElement): string {
  const annotation = math.querySelector("math annotation[encoding='application/x-tex']")
    ?.textContent?.trim();
  if (annotation) return annotation;

  // DOMPurify can unwrap KaTeX's annotation element while retaining its TeX
  // as a direct text node under <math>. MathML presentation text remains in
  // descendant elements, so direct text nodes are the stable sanitized fallback.
  const mathml = math.querySelector("math");
  return Array.from(mathml?.childNodes ?? [])
    .filter(node => node.nodeType === 3)
    .map(node => node.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function hasAuthoredHeadingNumber(heading: HTMLElement, tooltip: string): boolean {
  // Normalize only for recognition, preserving the original fullwidth digits
  // and punctuation. Bare numbers need sibling context to disambiguate them.
  if (!AUTHORED_HEADING_NUMBER.test(tooltip.normalize("NFKC"))) return false;
  return hasTextHeadingPrefix(heading);
}

function getBareHeadingNumber(heading: HTMLElement, tooltip: string): string | null {
  const match = BARE_HEADING_NUMBER.exec(tooltip.normalize("NFKC"));
  return match && hasTextHeadingPrefix(heading) ? match[1] : null;
}

function hasTextHeadingPrefix(heading: HTMLElement): boolean {
  const text = heading.ownerDocument.createTreeWalker(heading, 4 /* SHOW_TEXT */);
  let first = text.nextNode();
  while (first && !first.textContent?.trim()) first = text.nextNode();
  // A numeric example in code or rendered math is content, not an ordinal.
  return Boolean(first && !first.parentElement?.closest("code, math, .katex"));
}

function getAutomaticHeadingNumbers(headings: HTMLElement[], tooltips: string[]): string[] {
  const numbers = getHeadingNumbers(headings);
  const authoredGroups = new Set<string>();
  const previousBareNumbers = new Map<string, string>();
  // Scan every sibling before deciding which prefixes to show, so a later
  // authored ordinal also suppresses earlier siblings and their descendants.
  headings.forEach((heading, index) => {
    const parent = getHeadingNumberParent(numbers[index]);
    if (hasAuthoredHeadingNumber(heading, tooltips[index])) {
      authoredGroups.add(parent);
    }
    // A sibling pair starting at 1 establishes an authored sequence. Grouping
    // by parent skips descendants without joining unrelated chapters; years,
    // decimals, isolated numbers and nonconsecutive peers remain ambiguous.
    const bare = getBareHeadingNumber(heading, tooltips[index]);
    if (bare === "2" && previousBareNumbers.get(parent) === "1") authoredGroups.add(parent);
    if (bare === null) previousBareNumbers.delete(parent);
    else previousBareNumbers.set(parent, bare);
  });
  return numbers.map(number => {
    let parent = getHeadingNumberParent(number);
    while (true) {
      if (authoredGroups.has(parent)) return "";
      if (!parent) return number;
      parent = getHeadingNumberParent(parent);
    }
  });
}

function getHeadingNumberParent(number: string): string {
  // Use complete path components: parent 1 must not match parent 10.
  const separator = number.lastIndexOf(".");
  return separator < 0 ? "" : number.slice(0, separator);
}

function getHeadingNumbers(headings: HTMLElement[]): string[] {
  const headingLevels = headings.map(heading => Number(heading.tagName.slice(1)));
  // Determine depth from the whole annotation: a leading H2 must stay below
  // an H1 that appears later. Levels absent throughout the annotation are skipped.
  const presentLevels = [...new Set(headingLevels)].sort((left, right) => left - right);
  const counters: number[] = [];
  return headingLevels.map(level => {
    const depth = presentLevels.indexOf(level);
    counters.length = depth + 1;
    // Reserve the first number for a missing parent, without inserting an
    // outline entry. A later real sibling advances that counter normally.
    for (let index = 0; index < depth; index++) counters[index] ||= 1;
    counters[depth] = (counters[depth] ?? 0) + 1;
    return counters.join(".");
  });
}

function appendHeadingContent(target: HTMLElement, heading: HTMLElement): void {
  const doc = target.ownerDocument;
  const content = doc.createElement("span");
  content.className = "annotation-markdown-outline-text";

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

function getLabels(doc: Document, locale?: string): { outline: string; toggle: string } {
  // Reader iframe language can differ from the application's selected locale.
  const language = locale || doc.documentElement.lang || doc.defaultView?.navigator.language || "en";
  return language.toLowerCase().startsWith("zh")
    ? { outline: "大纲", toggle: "展开或收起大纲" }
    : { outline: "Outline", toggle: "Expand or collapse outline" };
}
