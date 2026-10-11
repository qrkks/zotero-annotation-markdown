import { createSvgViewerZoom } from "./svg-viewer-zoom";

/** Reader interaction and cleanup for already-sanitized SVG images. */
const VIEWER = "data-annotation-markdown-svg-viewer";
const EVENTS = ["pointerdown", "mousedown", "click", "keydown", "keyup", "keypress", "focusin", "error"] as const;
const VIEWER_EVENTS = [...EVENTS, "wheel", "pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const;

export function isSvgPreviewControl(target: EventTarget | null | undefined): boolean {
  return Boolean(element(target)?.closest("button.annotation-markdown-svg-open")?.closest("[data-annotation-markdown-preview='true'].annotation-markdown-rendered"));
}
export function isSvgViewerTarget(target: EventTarget | null | undefined): boolean {
  return Boolean(element(target)?.closest(`[${VIEWER}]`));
}

export function createSvgPreviewViewer({ document: doc, isEnabled, beforeOpen = () => true, styleText = "" }: {
  document: Document; isEnabled: () => boolean; beforeOpen?: () => boolean; styleText?: string;
}) {
  const win = doc.defaultView;
  let mounted = false;
  let overlay: HTMLElement | null = null;
  let opener: HTMLButtonElement | null = null;
  let closeButton: HTMLButtonElement | null = null;
  let region: HTMLElement | null = null;
  let viewerWindow: Window | null = null;
  let zoom: ReturnType<typeof createSvgViewerZoom> | null = null;
  const resize = () => zoom?.resize();
  function detachViewer(): void {
    zoom?.stop(); zoom = null;
    for (const type of VIEWER_EVENTS) viewerWindow?.removeEventListener(type, handle, true);
    viewerWindow?.removeEventListener("resize", resize);
    viewerWindow = null;
  }
  function close(restoreFocus = true): void {
    const previous = opener;
    detachViewer();
    win?.removeEventListener("wheel", handle, true);
    win?.removeEventListener("resize", resize);
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
    // Zotero registers capturing keyboard shortcuts on the Reader window before
    // the plugin. A child browsing context keeps modal keys out of that window,
    // including Escape (deselect) and Delete (erase the selected annotation).
    const frame = doc.createElement("iframe"); frame.className = "annotation-markdown-svg-viewer-frame";
    frame.title = image.alt || "SVG diagram";
    frame.style.width = `${Math.max(480, Number(image.getAttribute("width")))}px`;
    frame.style.height = `${Math.max(100, Number(image.getAttribute("height"))) + 44}px`;
    const populate = () => {
      if (!frame.isConnected || !overlay?.contains(frame)) return;
      const content = frame.contentDocument;
      if (closeButton?.isConnected && closeButton.ownerDocument === content) return;
      detachViewer();
      viewerWindow = frame.contentWindow;
      if (!content?.body || !viewerWindow) { close(); return; }
      content.body.className = "annotation-markdown-svg-viewer-content";
      const style = content.createElement("style"); style.textContent = styleText; content.head.append(style);
      const panel = content.createElement("div"); panel.className = "annotation-markdown-svg-viewer-panel";
      const toolbar = content.createElement("div"); toolbar.className = "annotation-markdown-svg-viewer-toolbar";
      const title = content.createElement("span"); title.className = "annotation-markdown-svg-viewer-title"; title.textContent = image.alt || "SVG diagram";
      closeButton = content.createElement("button"); closeButton.type = "button"; closeButton.textContent = "Close";
      closeButton.setAttribute("aria-label", "Close SVG diagram");
      region = content.createElement("div"); region.className = "annotation-markdown-svg-viewer-region";
      region.tabIndex = 0; region.setAttribute("role", "region"); region.setAttribute("aria-label", "Diagram (wheel to zoom, drag to pan)");
      const large = content.createElement("img"); large.src = src; large.alt = image.alt;
      // Numeric attributes retain intrinsic size, unlike a fitted sidebar image.
      large.width = Number(image.getAttribute("width")); large.height = Number(image.getAttribute("height")); large.draggable = false;
      const stage = content.createElement("div"); stage.className = "annotation-markdown-svg-viewer-stage";
      const sizeFrame = (width: number, height: number) => {
        // Leave room for the unscaled controls; CSS caps the frame at the Reader
        // edges. Only images beyond those bounds need scrolling or panning.
        frame.style.width = `${Math.max(480, width)}px`;
        frame.style.height = `${Math.max(100, height) + Math.ceil(toolbar.getBoundingClientRect().height) + 2}px`;
      };
      const fitBounds = () => {
        const padding = win?.getComputedStyle(overlay!);
        const width = overlay!.clientWidth - (parseFloat(padding?.paddingLeft ?? "") || 0) - (parseFloat(padding?.paddingRight ?? "") || 0);
        const height = overlay!.clientHeight - (parseFloat(padding?.paddingTop ?? "") || 0) - (parseFloat(padding?.paddingBottom ?? "") || 0) - Math.ceil(toolbar.getBoundingClientRect().height) - 2;
        return width > 0 && height > 0 ? { width, height } : region!.getBoundingClientRect();
      };
      zoom = createSvgViewerZoom(large, region, { sizeFrame, fitBounds });
      toolbar.append(title, zoom.controls, closeButton); stage.append(large); region.append(stage); panel.append(toolbar, region); content.body.append(panel);
      zoom.fit();
      for (const type of VIEWER_EVENTS) viewerWindow.addEventListener(type, handle, { capture: true, passive: false });
      viewerWindow.addEventListener("resize", resize);
      closeButton.focus({ preventScroll: true });
    };
    // Gecko can replace the initial about:blank document on its first load.
    frame.addEventListener("load", populate);
    overlay.append(frame); doc.body.append(overlay);
    // Keep the Reader's normal asynchronous wheel scrolling outside the modal.
    win?.addEventListener("wheel", handle, { capture: true, passive: false });
    win?.addEventListener("resize", resize);
    populate();
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
      if (event.type === "focusin" && overlay && !overlay.contains(target) && target?.ownerDocument !== closeButton?.ownerDocument) closeButton?.focus({ preventScroll: true });
      event.stopImmediatePropagation();
      if (event.type === "keydown") {
        const key = (event as KeyboardEvent).key;
        if (key === "Escape") { event.preventDefault(); close(); }
        else if (key === "Tab") {
          event.preventDefault();
          const controls = [...closeButton!.ownerDocument.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"), region!];
          const current = controls.indexOf(closeButton!.ownerDocument.activeElement as HTMLElement);
          const direction = (event as KeyboardEvent).shiftKey ? -1 : 1;
          controls[(current + direction + controls.length) % controls.length]?.focus({ preventScroll: true });
        }
      } else if (event.type === "click" && (target === overlay || target === closeButton)) {
        event.preventDefault(); close();
      } else {
        zoom?.handle(event);
        if (event.type === "wheel" && !region?.contains(target)) event.preventDefault();
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
