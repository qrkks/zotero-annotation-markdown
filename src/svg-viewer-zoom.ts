/** Zoom the sanitized image and its viewer without changing saved annotations. */
export function createSvgViewerZoom(image: HTMLImageElement, region: HTMLElement, {
  sizeFrame = () => {}, fitBounds = () => region.getBoundingClientRect(), imageKind = "diagram"
}: {
  sizeFrame?: (width: number, height: number) => void;
  fitBounds?: () => { width: number; height: number };
  imageKind?: "diagram" | "image";
} = {}) {
  const doc = image.ownerDocument;
  const width = image.width, height = image.height;
  // Bound both magnification and rendered dimensions for large images.
  const maxScale = Math.min(4, 8192 / Math.max(width, height));
  const minScale = Math.min(0.01, maxScale);
  let scale = 1, fitting = true;
  let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
  const controls = doc.createElement("div");
  controls.className = "annotation-markdown-svg-viewer-controls";
  const actions = new Map<HTMLButtonElement, () => void>();
  const button = (text: string, label: string, action: () => void) => {
    const node = doc.createElement("button"); node.type = "button"; node.textContent = text;
    node.setAttribute("aria-label", label); node.title = label;
    actions.set(node, action); return node;
  };
  const out = button("−", "Zoom out", () => zoom(scale / 1.25));
  const into = button("+", "Zoom in", () => zoom(scale * 1.25));
  const status = doc.createElement("output"); status.setAttribute("aria-label", "Zoom level");
  const fitButton = button("Fit", `Fit ${imageKind}`, fit);
  fitButton.title = `Restore a size that shows the entire ${imageKind}`;
  controls.append(out, status, into, fitButton);

  function update(): void {
    image.width = Math.max(1, Math.round(width * scale));
    image.height = Math.max(1, Math.round(height * scale));
    sizeFrame(image.width, image.height);
    status.textContent = `${Math.round(scale * 100)}%`;
    out.disabled = scale <= minScale; into.disabled = scale >= maxScale;
    region.classList.toggle("annotation-markdown-svg-pannable", image.width > region.clientWidth || image.height > region.clientHeight);
  }
  function zoom(next: number, clientX?: number, clientY?: number): void {
    endDrag(); fitting = false;
    const before = image.getBoundingClientRect(), viewport = region.getBoundingClientRect();
    const frame = doc.defaultView?.frameElement, frameBefore = frame?.getBoundingClientRect();
    const x = clientX ?? viewport.left + region.clientLeft + region.clientWidth / 2;
    const y = clientY ?? viewport.top + region.clientTop + region.clientHeight / 2;
    // Use rendered dimensions so centering, scrollbars and rounded sizes are included.
    const fractionX = before.width ? (x - before.left) / before.width : 0.5;
    const fractionY = before.height ? (y - before.top) / before.height : 0.5;
    scale = Math.min(maxScale, Math.max(minScale, next)); update();
    const frameAfter = frame?.getBoundingClientRect();
    // The centered frame also moves as it grows. Keep the screen-space anchor
    // when the image overflows and native scrolling can preserve that point.
    const anchorX = x + (frameBefore?.left ?? 0) - (frameAfter?.left ?? 0);
    const anchorY = y + (frameBefore?.top ?? 0) - (frameAfter?.top ?? 0);
    const after = image.getBoundingClientRect();
    region.scrollLeft += after.left + fractionX * after.width - anchorX;
    region.scrollTop += after.top + fractionY * after.height - anchorY;
  }
  function fit(): void {
    endDrag(); fitting = true;
    // Use the Reader's available space, independent of this frame's current size
    // or old scrollbars, so shrinking and resize events cannot shrink Fit again.
    const viewport = fitBounds();
    scale = Math.max(minScale, Math.min(1, maxScale, (viewport.width || width) / width, (viewport.height || height) / height));
    update(); region.scrollLeft = 0; region.scrollTop = 0;
  }
  function endDrag(): void {
    const previous = drag; drag = null;
    region.classList.remove("annotation-markdown-svg-dragging");
    if (previous && region.hasPointerCapture?.(previous.id)) region.releasePointerCapture(previous.id);
  }
  function handle(event: Event): void {
    if (event.type === "click") {
      const action = actions.get(event.target as HTMLButtonElement);
      if (action) { event.preventDefault(); action(); }
      return;
    }
    const target = event.target && "nodeType" in event.target ? event.target as Node : null;
    if (event.type === "wheel" && target && region.contains(target)) {
      const wheel = event as WheelEvent;
      if (!wheel.deltaY) return;
      event.preventDefault();
      const units = wheel.deltaMode === 1 ? 16 : wheel.deltaMode === 2 ? region.clientHeight : 1;
      const delta = Math.max(-1000, Math.min(1000, wheel.deltaY * units));
      zoom(scale * Math.exp(-delta * 0.002), wheel.clientX, wheel.clientY);
    } else if (event.type === "pointerdown" && target && region.contains(target)) {
      const pointer = event as PointerEvent;
      const bounds = region.getBoundingClientRect();
      // Leave native scrollbar gutters to Gecko.
      if (pointer.button !== 0 || pointer.isPrimary === false || !region.classList.contains("annotation-markdown-svg-pannable") ||
          pointer.clientX >= bounds.left + region.clientLeft + region.clientWidth || pointer.clientY >= bounds.top + region.clientTop + region.clientHeight) return;
      event.preventDefault(); region.focus({ preventScroll: true });
      drag = { id: pointer.pointerId, x: pointer.clientX, y: pointer.clientY, left: region.scrollLeft, top: region.scrollTop };
      region.classList.add("annotation-markdown-svg-dragging");
      // Synthetic test events have no active native pointer to capture.
      try { region.setPointerCapture?.(pointer.pointerId); } catch { /* No active pointer. */ }
    } else if (drag && (event as PointerEvent).pointerId === drag.id) {
      const pointer = event as PointerEvent;
      if (event.type === "pointermove") {
        event.preventDefault(); region.scrollLeft = drag.left + drag.x - pointer.clientX; region.scrollTop = drag.top + drag.y - pointer.clientY;
      } else if (["pointerup", "pointercancel", "lostpointercapture"].includes(event.type)) endDrag();
    }
  }
  return { controls, fit, handle, resize() { if (fitting) fit(); else update(); }, stop: endDrag };
}
