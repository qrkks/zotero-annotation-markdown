/** Hover hints for mouse-transparent page badges; native input keeps its target. */
export const SVG_BADGE_TOOLTIP = "data-annotation-markdown-svg-page-tooltip";

export function createSvgBadgeTooltip() {
  let badgesByDocument = new Map<Document, HTMLElement[]>();
  let shadowRoots = new Set<ShadowRoot>();
  const moveListeners = new Map<Document, EventListener>();
  let hovered: HTMLElement | undefined;
  let tooltip: HTMLElement | undefined;
  let timer: number | undefined;

  function hide(): void {
    if (timer !== undefined) hovered?.ownerDocument.defaultView?.clearTimeout(timer);
    timer = undefined;
    hovered = undefined;
    tooltip?.remove();
    tooltip = undefined;
  }

  function position(): void {
    if (!tooltip || !hovered) return;
    const doc = hovered.ownerDocument, win = doc.defaultView;
    const rect = hovered.getBoundingClientRect();
    const width = doc.documentElement.clientWidth || win?.innerWidth || 0;
    const height = doc.documentElement.clientHeight || win?.innerHeight || 0;
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, width - tooltip.offsetWidth - 8))}px`;
    const top = rect.bottom + 6 + tooltip.offsetHeight <= height - 8
      ? rect.bottom + 6 : rect.top - tooltip.offsetHeight - 6;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function show(): void {
    timer = undefined;
    if (!hovered?.isConnected) { hide(); return; }
    const doc = hovered.ownerDocument;
    tooltip = doc.createElement("div");
    tooltip.setAttribute(SVG_BADGE_TOOLTIP, "true");
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = hovered.title;
    Object.assign(tooltip.style, {
      position: "fixed", zIndex: "2147483647", pointerEvents: "none", userSelect: "none",
      background: "Canvas", color: "CanvasText", border: "1px solid ButtonBorder",
      borderRadius: "4px", padding: "4px 8px", font: "12px/1.4 system-ui, sans-serif",
      maxWidth: "calc(100vw - 16px)", boxSizing: "border-box", overflowWrap: "anywhere",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)"
    });
    doc.body.append(tooltip);
    position();
  }

  function move(doc: Document, event: Event): void {
    const pointer = event as PointerEvent;
    if (pointer.buttons || pointer.pointerType === "touch") { hide(); return; }
    const target = event.target as Element | null;
    const badge = badgesByDocument.get(doc)?.find(candidate => {
      const root = candidate.getRootNode();
      const surface = root.nodeType === 11 && "host" in root
        ? (root as ShadowRoot).host : candidate.parentElement;
      // The event still targets the native page surface under the transparent
      // badge. Ignore unrelated overlays that happen to cover its rectangle.
      if (!target || !surface?.contains(target)) return false;
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 &&
        pointer.clientX >= rect.left && pointer.clientX <= rect.right &&
        pointer.clientY >= rect.top && pointer.clientY <= rect.bottom;
    });
    if (badge === hovered) return;
    hide();
    if (badge) {
      hovered = badge;
      timer = doc.defaultView?.setTimeout(show, 400);
    }
  }

  function leave(event: Event): void {
    if (!(event as PointerEvent).relatedTarget) hide();
  }

  function listen(doc: Document, enabled: boolean): void {
    const method = enabled ? "addEventListener" : "removeEventListener";
    if (enabled) {
      // Gecko's event.currentTarget can be an Xray wrapper with a different
      // identity from this Reader document. Keep the registration's reference.
      const listener: EventListener = event => move(doc, event);
      moveListeners.set(doc, listener);
      doc.addEventListener("pointermove", listener, true);
    } else {
      const listener = moveListeners.get(doc);
      if (listener) doc.removeEventListener("pointermove", listener, true);
      moveListeners.delete(doc);
    }
    doc[method]("pointerout", leave, true);
    for (const name of ["pointerdown", "keydown", "scroll"]) doc[method](name, hide, true);
    doc.defaultView?.[method]("blur", hide);
    doc.defaultView?.[method]("resize", hide);
  }

  return {
    sync(badges: HTMLElement[]): void {
      const next = new Map<Document, HTMLElement[]>();
      const nextShadowRoots = new Set<ShadowRoot>();
      for (const badge of badges) {
        const list = next.get(badge.ownerDocument) ?? [];
        list.push(badge);
        next.set(badge.ownerDocument, list);
        const root = badge.getRootNode();
        if (root.nodeType === 11 && "host" in root) nextShadowRoots.add(root as ShadowRoot);
      }
      for (const doc of badgesByDocument.keys()) if (!next.has(doc)) listen(doc, false);
      for (const doc of next.keys()) if (!badgesByDocument.has(doc)) listen(doc, true);
      // Scroll events do not cross an EPUB shadow boundary.
      for (const root of shadowRoots) if (!nextShadowRoots.has(root)) root.removeEventListener("scroll", hide, true);
      for (const root of nextShadowRoots) if (!shadowRoots.has(root)) root.addEventListener("scroll", hide, true);
      shadowRoots = nextShadowRoots;
      badgesByDocument = next;
      if (hovered && !badges.includes(hovered)) hide();
      if (tooltip && hovered) {
        if (tooltip.textContent !== hovered.title) tooltip.textContent = hovered.title;
        position();
      }
    },
    stop(): void {
      hide();
      for (const doc of badgesByDocument.keys()) listen(doc, false);
      badgesByDocument.clear();
      for (const root of shadowRoots) root.removeEventListener("scroll", hide, true);
      shadowRoots.clear();
    }
  };
}
