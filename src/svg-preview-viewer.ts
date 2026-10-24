import { createSvgViewerZoom } from "./svg-viewer-zoom";
import { isImageLink } from "./linked-image-preview";

/** Shared Reader viewer for sanitized SVGs and loaded raster link previews. */
const VIEWER = "data-annotation-markdown-svg-viewer";
const EVENTS = ["pointerdown", "mousedown", "click", "keydown", "keyup", "keypress", "focusin", "error"] as const;
const VIEWER_EVENTS = [...EVENTS, "wheel", "pointermove", "pointerup", "pointercancel", "lostpointercapture"] as const;

export function isSvgPreviewControl(target: EventTarget | null | undefined): boolean {
  const node = element(target);
  return Boolean(node?.closest("img.annotation-markdown-svg-image:not([hidden])")?.closest(".annotation-markdown-svg")?.closest("[data-annotation-markdown-preview='true'].annotation-markdown-rendered") || linkedImageControl(node));
}
export function isSvgViewerTarget(target: EventTarget | null | undefined): boolean {
  return Boolean(element(target)?.closest(`[${VIEWER}]`));
}

export function createSvgPreviewViewer({ document: doc, isEnabled, isLinkedImageEnabled = isEnabled, beforeOpen = () => true, styleText = "" }: {
  document: Document; isEnabled: () => boolean; isLinkedImageEnabled?: () => boolean; beforeOpen?: () => boolean; styleText?: string;
}) {
  const win = doc.defaultView;
  let mounted = false;
  let overlay: HTMLElement | null = null;
  let opener: HTMLElement | null = null;
  let closeButton: HTMLButtonElement | null = null;
  let region: HTMLElement | null = null;
  let viewerWindow: Window | null = null;
  let zoom: ReturnType<typeof createSvgViewerZoom> | null = null;
  let frameReadyRequest: number | undefined;
  const resize = () => zoom?.resize();
  function detachViewer(): void {
    zoom?.stop(); zoom = null;
    for (const type of VIEWER_EVENTS) viewerWindow?.removeEventListener(type, handle, true);
    viewerWindow?.removeEventListener("resize", resize);
    viewerWindow = null;
  }
  function close(restoreFocus = true): void {
    const previous = opener;
    if (frameReadyRequest !== undefined) win?.cancelAnimationFrame?.(frameReadyRequest);
    frameReadyRequest = undefined;
    detachViewer();
    win?.removeEventListener("wheel", handle, true);
    win?.removeEventListener("resize", resize);
    overlay?.remove(); overlay = null; opener = null; closeButton = null; region = null;
    if (restoreFocus && previous?.isConnected) previous.focus({ preventScroll: true });
  }
  function open(control: HTMLElement): void {
    const linked = linkedImageControl(control);
    const figure = linked?.closest("figure.annotation-markdown-linked-image") ?? control.closest(".annotation-markdown-svg");
    const image = figure?.querySelector<HTMLImageElement>(linked ? "img.annotation-markdown-linked-image-content" : "img.annotation-markdown-svg-image");
    const warningText = figure?.querySelector(".annotation-markdown-svg-warning:not([hidden])")?.textContent;
    const src = image?.getAttribute("src");
    if (!(linked ? isLinkedImageEnabled() : isEnabled()) || !image || !src ||
        (!linked && !src.startsWith("data:image/svg+xml;charset=utf-8,")) || image.hidden || !beforeOpen()) return;
    // The already-loaded preview supplies the host-cached data URL and intrinsic
    // bitmap size. Never use the sidebar's fitted CSS dimensions or refetch it.
    const width = linked ? image.naturalWidth : Number(image.getAttribute("width"));
    const height = linked ? image.naturalHeight : Number(image.getAttribute("height"));
    const kind = linked ? "image" : "diagram";
    const label = image.alt || (linked ? "Image" : "Diagram");
    close(false); opener = control;
    overlay = doc.createElement("div"); overlay.className = "annotation-markdown-svg-viewer";
    // Keep layout and keyboard focus active while the initial frame is replaced.
    overlay.style.opacity = "0";
    overlay.setAttribute(VIEWER, "true"); overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", label);
    // Zotero registers capturing keyboard shortcuts on the Reader window before
    // the plugin. A child browsing context keeps modal keys out of that window,
    // including Escape (deselect) and Delete (erase the selected annotation).
    const frame = doc.createElement("iframe"); frame.className = "annotation-markdown-svg-viewer-frame";
    frame.title = label;
    // An explicit empty document gives Gecko a final load event; an implicit
    // about:blank can be replaced without notifying the iframe listener.
    frame.srcdoc = "<!doctype html><html><head></head><body></body></html>";
    frame.style.width = `${Math.max(480, width)}px`;
    frame.style.height = `${Math.max(100, height) + 44}px`;
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
      const title = content.createElement("span"); title.className = "annotation-markdown-svg-viewer-title"; title.textContent = label;
      const warning = warningText ? content.createElement("p") : null;
      if (warning) { warning.className = "annotation-markdown-svg-warning"; warning.setAttribute("role", "note"); warning.textContent = warningText!; }
      const controlHeight = () => Math.ceil(toolbar.getBoundingClientRect().height) + Math.ceil(warning?.getBoundingClientRect().height ?? 0);
      closeButton = content.createElement("button"); closeButton.type = "button"; closeButton.textContent = "Close";
      closeButton.setAttribute("aria-label", `Close ${kind}`);
      region = content.createElement("div"); region.className = "annotation-markdown-svg-viewer-region";
      region.tabIndex = 0; region.setAttribute("role", "region"); region.setAttribute("aria-label", `${linked ? "Image" : "Diagram"} (wheel to zoom, drag to pan)`);
      const large = content.createElement("img"); large.referrerPolicy = "no-referrer"; large.src = src; large.alt = label;
      if (image.hasAttribute("title")) large.title = image.title;
      // Numeric attributes retain intrinsic size, unlike a fitted sidebar image.
      large.width = width; large.height = height; large.draggable = false;
      const stage = content.createElement("div"); stage.className = "annotation-markdown-svg-viewer-stage";
      const sizeFrame = (width: number, height: number) => {
        // Leave room for the unscaled controls; CSS caps the frame at the Reader
        // edges. Only images beyond those bounds need scrolling or panning.
        frame.style.width = `${Math.max(480, width)}px`;
        frame.style.height = `${Math.max(100, height) + controlHeight() + 2}px`;
      };
      const fitBounds = () => {
        const padding = win?.getComputedStyle(overlay!);
        const width = overlay!.clientWidth - (parseFloat(padding?.paddingLeft ?? "") || 0) - (parseFloat(padding?.paddingRight ?? "") || 0);
        const height = overlay!.clientHeight - (parseFloat(padding?.paddingTop ?? "") || 0) - (parseFloat(padding?.paddingBottom ?? "") || 0) - controlHeight() - 2;
        return width > 0 && height > 0 ? { width, height } : region!.getBoundingClientRect();
      };
      zoom = createSvgViewerZoom(large, region, { sizeFrame, fitBounds, imageKind: kind });
      toolbar.append(title, zoom.controls, closeButton); stage.append(large); region.append(stage); panel.append(toolbar);
      if (warning) panel.append(warning);
      panel.append(region); content.body.append(panel);
      zoom.fit();
      for (const type of VIEWER_EVENTS) viewerWindow.addEventListener(type, handle, { capture: true, passive: false });
      viewerWindow.addEventListener("resize", resize);
      closeButton.focus({ preventScroll: true });
    };
    const imageDecodes = new WeakMap<HTMLImageElement, Promise<void>>();
    const revealWhenReady = () => {
      const current = overlay, content = frame.contentDocument;
      const large = content?.querySelector("img");
      if (!current?.contains(frame) || !large) return;
      const active = () => current === overlay && frame.isConnected && frame.contentDocument === content && large.isConnected;
      const reveal = () => { if (active()) current.style.removeProperty("opacity"); };
      const failed = () => {
        if (!active()) return;
        if (large.complete && large.naturalWidth > 0) reveal(); else close();
      };
      if (typeof large.decode === "function") {
        let decoding = imageDecodes.get(large);
        if (!decoding) { decoding = large.decode(); imageDecodes.set(large, decoding); }
        void decoding.then(reveal, failed);
      } else if (large.complete) {
        if (large.naturalWidth > 0) reveal(); else failed();
      } else {
        large.addEventListener("load", reveal, { once: true });
        large.addEventListener("error", failed, { once: true });
      }
    };
    // Gecko can replace the initial about:blank document on its first load.
    // Reveal the completed final document, never the provisional image or blank.
    frame.addEventListener("load", () => {
      if (!frame.isConnected || !overlay?.contains(frame)) return;
      overlay.style.opacity = "0";
      populate(); revealWhenReady();
    });
    overlay.append(frame); doc.body.append(overlay);
    // Keep the Reader's normal asynchronous wheel scrolling outside the modal.
    win?.addEventListener("wheel", handle, { capture: true, passive: false });
    win?.addEventListener("resize", resize);
    populate();
    // Some privileged Gecko frames miss their final load notification. Check
    // only the explicit final document, keeping the provisional image hidden.
    let readinessFrames = 0;
    const waitForFinalDocument = () => {
      if (!frame.isConnected || !overlay?.contains(frame)) return;
      frameReadyRequest = undefined;
      if (frame.contentDocument?.documentURI === "about:srcdoc" && frame.contentDocument.readyState === "complete") {
        populate(); revealWhenReady();
      } else if (++readinessFrames < 120) {
        frameReadyRequest = win?.requestAnimationFrame?.(waitForFinalDocument);
      } else close();
    };
    frameReadyRequest = win?.requestAnimationFrame?.(waitForFinalDocument);
  }
  function handle(event: Event): void {
    const target = element(event.target);
    if (event.type === "error") {
      if (target?.matches("img.annotation-markdown-svg-image") && target.closest("[data-annotation-markdown-preview='true']")) {
        const figure = target.closest(".annotation-markdown-svg");
        target.setAttribute("hidden", "");
        figure?.querySelector(".annotation-markdown-svg-warning")?.setAttribute("hidden", "");
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
    if (!isSvgPreviewControl(target)) return;
    const linked = linkedImageControl(target);
    if (!(linked ? isLinkedImageEnabled() : isEnabled())) return;
    if ((linked || target?.matches("img.annotation-markdown-svg-image")) &&
        ["pointerdown", "mousedown", "click"].includes(event.type) && (event as MouseEvent).button !== 0) return;
    event.stopImmediatePropagation();
    const control = linked ?? target?.closest<HTMLImageElement>("img.annotation-markdown-svg-image");
    if (event.type === "pointerdown" || event.type === "mousedown") event.preventDefault();
    if (event.type === "click" && (event as MouseEvent).button === 0) {
      event.preventDefault(); if (control) open(control);
    }
    if (event.type === "keydown" && ["Enter", " "].includes((event as KeyboardEvent).key)) {
      event.preventDefault(); if (control) open(control);
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
function linkedImageControl(target: Element | null): HTMLAnchorElement | null {
  const control = target?.closest<HTMLAnchorElement>("figure.annotation-markdown-linked-image > a.annotation-markdown-linked-image-target");
  if (!control?.closest("[data-annotation-markdown-preview='true'].annotation-markdown-rendered") || control.closest("[hidden]")) return null;
  const image = control.querySelector<HTMLImageElement>("img.annotation-markdown-linked-image-content");
  const src = image?.getAttribute("src");
  if (!image || image.hidden || !image.naturalWidth || !image.naturalHeight || !src) return null;
  // Host loading accepts only these raster MIME types. Preserve the direct-URL
  // fallback in environments without Zotero.HTTP, using the same URL policy.
  return /^data:image\/(?:png|jpeg|gif|webp|avif|bmp|x-ms-bmp);base64,/i.test(src) || isImageLink(src) ? control : null;
}
function element(target: EventTarget | null | undefined): Element | null {
  if (!target || !("nodeType" in target)) return null;
  return (target as Node).nodeType === 1 ? target as Element : (target as Node).parentElement;
}
