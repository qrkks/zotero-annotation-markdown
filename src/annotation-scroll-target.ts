/** Give the Reader's native nearest scroll a stable target for oversized rows. */
const ROW = "[data-sidebar-annotation-id]";
const SELECTED = `${ROW}.selected, ${ROW}[aria-selected='true']`;
const EXCLUDED = ".annotation-popup, .note-editor, .zotero-note-editor, [data-note-editor], .ProseMirror";
const MARKER = "data-annotation-markdown-scroll-target";
const MARGIN = "--annotation-markdown-scroll-margin-bottom";

interface ScrollTargetOptions {
  document: Document;
  MutationObserver?: typeof MutationObserver;
  ResizeObserver?: typeof ResizeObserver;
  isEnabled(): boolean;
  prepareRow(row: HTMLElement): void;
}

export function trackAnnotationScrollTarget({
  document: doc, MutationObserver: MutationObserverRef, ResizeObserver: ResizeObserverRef,
  isEnabled, prepareRow
}: ScrollTargetOptions): () => void {
  const win = doc.defaultView;
  if (!win || !MutationObserverRef || !ResizeObserverRef) return () => {};
  let active = true;
  let row: HTMLElement | null = null;
  let scroller: HTMLElement | null = null;
  const resizeObserver = new ResizeObserverRef(updateGeometry);

  function clearTarget(target: HTMLElement | null): void {
    target?.removeAttribute(MARKER);
    target?.style.removeProperty(MARGIN);
  }

  function isEditing(target: HTMLElement): boolean {
    const focused = doc.activeElement;
    return Boolean(target.querySelector(".annotation-markdown-editing, .annotation-markdown-fast-editing") ||
      (focused && target.contains(focused) && focused.closest("textarea,input,select,[contenteditable='true']")));
  }

  function updateGeometry(): void {
    if (!active || !row) return;
    if (!row.isConnected || !row.matches(SELECTED) || row.closest(EXCLUDED) ||
      !isEnabled() || isEditing(row) || !scroller?.isConnected) {
      clearTarget(row);
      return;
    }
    const height = row.getBoundingClientRect().height;
    const viewport = scroller.clientHeight;
    if (viewport <= 0 || !Number.isFinite(height) || height <= viewport) {
      clearTarget(row);
      return;
    }
    // Negative bottom margin shrinks only the scroll target, not layout. Its
    // height equals the scrollport, so nearest aligns its start from either
    // direction. No second scroll, scroll snap, or native method replacement.
    const bottom = `${viewport - height}px`;
    if (row.style.getPropertyValue(MARGIN) !== bottom) row.style.setProperty(MARGIN, bottom);
    if (!row.hasAttribute(MARKER)) row.setAttribute(MARKER, "true");
  }

  function findScroller(target: HTMLElement): HTMLElement | null {
    let ancestor = target.parentElement;
    while (ancestor && ancestor !== doc.body) {
      if (/^(auto|scroll|overlay)$/.test(win!.getComputedStyle(ancestor)?.overflowY ?? "")) return ancestor;
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  function updateSelection(): void {
    if (!active) return;
    const selected = Array.from(doc.querySelectorAll<HTMLElement>(SELECTED))
      .filter(candidate => !candidate.closest(EXCLUDED));
    const next = selected.length === 1 ? selected[0] : null;
    if (next !== row) {
      clearTarget(row);
      resizeObserver.disconnect();
      row = next;
      scroller = row ? findScroller(row) : null;
      if (row && scroller) {
        // Resolve just this selected row before Zotero's delayed native scroll;
        // lazy insertion after scrolling would change the target's geometry.
        if (isEnabled() && !isEditing(row)) prepareRow(row);
        resizeObserver.observe(row);
        resizeObserver.observe(scroller);
      }
    }
    updateGeometry();
  }

  const mutations = new MutationObserverRef(records => {
    if (!active) return;
    // Selection changes and replaced annotation subtrees need discovery. Edits
    // inside a row only need geometry, never another synchronous render.
    const selectionChanged = records.some(record => {
      if (record.type === "attributes") return (record.target as Element).matches(ROW) ||
        (row !== null && (record.target as Element).contains(row));
      return [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === 1 && ((node as Element).matches(ROW) || (node as Element).querySelector(ROW)));
    });
    if (selectionChanged) updateSelection();
    else if (row && records.some(record => row!.contains(record.target))) updateGeometry();
  });
  // Clear stale plugin-owned CSS without touching any host scroll properties.
  for (const stale of doc.querySelectorAll<HTMLElement>(`[${MARKER}]`)) clearTarget(stale);
  mutations.observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-selected"] });
  doc.addEventListener("focusin", updateGeometry, true);
  doc.addEventListener("focusout", updateGeometry, true);
  updateSelection();
  return () => {
    active = false;
    mutations.disconnect();
    resizeObserver.disconnect();
    doc.removeEventListener("focusin", updateGeometry, true);
    doc.removeEventListener("focusout", updateGeometry, true);
    clearTarget(row);
    row = null;
    scroller = null;
  };
}
