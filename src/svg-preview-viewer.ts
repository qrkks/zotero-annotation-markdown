/** Reader interaction and cleanup for already-sanitized SVG images. */
const VIEWER = "data-annotation-markdown-svg-viewer";
const EVENTS = ["pointerdown", "mousedown", "click", "keydown", "keyup", "keypress", "focusin", "error"] as const;

export function isSvgPreviewControl(target: EventTarget | null | undefined): boolean {
  return Boolean(element(target)?.closest("button.annotation-markdown-svg-open")?.closest("[data-annotation-markdown-preview='true'].annotation-markdown-rendered"));
}
export function isSvgViewerTarget(target: EventTarget | null | undefined): boolean {
  return Boolean(element(target)?.closest(`[${VIEWER}]`));
}

export function createSvgPreviewViewer({ document: doc, isEnabled, beforeOpen = () => true }: {
  document: Document; isEnabled: () => boolean; beforeOpen?: () => boolean;
}) {
  const win = doc.defaultView;
  let mounted = false;
  let overlay: HTMLElement | null = null;
  let opener: HTMLButtonElement | null = null;
  let closeButton: HTMLButtonElement | null = null;
  let region: HTMLElement | null = null;
  function close(restoreFocus = true): void {
    const previous = opener;
    overlay?.remove(); overlay = null; opener = null; closeButton = null; region = null;
    if (restoreFocus && previous?.isConnected) previous.focus({ preventScroll: true });
  }
  function open(button: HTMLButtonElement): void {
    const image = button.closest(".annotation-markdown-svg")?.querySelector<HTMLImageElement>("img.annotation-markdown-svg-image");
    const src = image?.getAttribute("src");
    if (!isEnabled() || !image || !src?.startsWith("data:image/svg+xml;charset=utf-8,") || image.hidden || !beforeOpen()) return;
    close(false); opener = button;
    overlay = doc.createElement("div"); overlay.className = "annotation-markdown-svg-viewer";
    overlay.setAttribute(VIEWER, "true"); overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", image.alt || "SVG diagram");
    const panel = doc.createElement("div"); panel.className = "annotation-markdown-svg-viewer-panel";
    const toolbar = doc.createElement("div"); toolbar.className = "annotation-markdown-svg-viewer-toolbar";
    const title = doc.createElement("span"); title.textContent = image.alt || "SVG diagram";
    closeButton = doc.createElement("button"); closeButton.type = "button"; closeButton.textContent = "Close";
    closeButton.setAttribute("aria-label", "Close SVG diagram");
    region = doc.createElement("div"); region.className = "annotation-markdown-svg-viewer-region";
    region.tabIndex = 0; region.setAttribute("role", "region"); region.setAttribute("aria-label", "Diagram (scroll to view)");
    const large = doc.createElement("img"); large.src = src; large.alt = image.alt;
    // HTMLImageElement.width reflects the fitted sidebar layout, not the SVG's
    // intrinsic size. The renderer's numeric attributes retain that size.
    large.width = Number(image.getAttribute("width")); large.height = Number(image.getAttribute("height")); large.draggable = false;
    toolbar.append(title, closeButton); region.append(large); panel.append(toolbar, region); overlay.append(panel);
    doc.body.append(overlay); closeButton.focus({ preventScroll: true });
  }
  function handle(event: Event): void {
    const target = element(event.target);
    if (event.type === "error") {
      if (target?.matches("img.annotation-markdown-svg-image") && target.closest("[data-annotation-markdown-preview='true']")) {
        const figure = target.closest(".annotation-markdown-svg");
        target.setAttribute("hidden", "");
        figure?.querySelector(".annotation-markdown-svg-open")?.setAttribute("hidden", "");
        figure?.querySelector(".annotation-markdown-svg-fallback")?.removeAttribute("hidden");
      }
      return;
    }
    if (overlay || isSvgViewerTarget(target)) {
      if (event.type === "focusin" && overlay && !overlay.contains(target)) closeButton?.focus({ preventScroll: true });
      event.stopImmediatePropagation();
      if (event.type === "keydown") {
        const key = (event as KeyboardEvent).key;
        if (key === "Escape") { event.preventDefault(); close(); }
        else if (key === "Tab") {
          event.preventDefault(); (doc.activeElement === closeButton ? region : closeButton)?.focus({ preventScroll: true });
        }
      } else if (event.type === "click" && (target === overlay || target === closeButton)) {
        event.preventDefault(); close();
      }
      return;
    }
    if (!isSvgPreviewControl(target) || !isEnabled()) return;
    event.stopImmediatePropagation();
    const button = target?.closest<HTMLButtonElement>("button.annotation-markdown-svg-open");
    if (event.type === "pointerdown" || event.type === "mousedown") event.preventDefault();
    if (event.type === "click" && (event as MouseEvent).button === 0) {
      event.preventDefault(); if (button) open(button);
    }
    if (event.type === "keydown" && ["Enter", " "].includes((event as KeyboardEvent).key)) {
      event.preventDefault(); if (button) open(button);
    }
  }
  return {
    start() {
      if (mounted || !win) return;
      doc.querySelectorAll(`[${VIEWER}]`).forEach(node => node.remove());
      for (const type of EVENTS) win.addEventListener(type, handle, true);
      mounted = true;
    },
    close,
    stop() {
      close(false);
      if (mounted && win) for (const type of EVENTS) win.removeEventListener(type, handle, true);
      mounted = false;
    }
  };
}
function element(target: EventTarget | null | undefined): Element | null {
  if (!target || !("nodeType" in target)) return null;
  return (target as Node).nodeType === 1 ? target as Element : (target as Node).parentElement;
}
