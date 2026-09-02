/** Recover an annotation lost from view after Escape, without moving visible content. */
const ROW = "[data-sidebar-annotation-id]";
const SELECTED = `${ROW}.selected, ${ROW}[aria-selected='true']`;
const EXCLUDED = ".annotation-popup, .note-editor, .zotero-note-editor, [data-note-editor], .ProseMirror";
const CANCEL_EVENTS = ["pointerdown", "wheel", "touchstart", "keydown", "focusin"] as const;

export interface EscapeScrollRecovery {
  afterRender(): void;
  stop(): void;
}

export function createAnnotationEscapeRecovery({
  document: doc, getComment, isEnabled
}: {
  document: Document;
  getComment(): HTMLElement | null;
  isEnabled(): boolean;
}): EscapeScrollRecovery {
  const win = doc.defaultView;
  let active = true;
  let scheduled = false;
  let frame: number | undefined;
  function findScroller(row: HTMLElement): HTMLElement | null {
    let scroller = row.parentElement;
    while (scroller && scroller !== doc.body) {
      if (/^(auto|scroll|overlay)$/.test(win?.getComputedStyle(scroller)?.overflowY ?? "")) return scroller;
      scroller = scroller.parentElement;
    }
    return null;
  }
  const initialRow = getComment()?.closest<HTMLElement>(SELECTED);
  const anchorScroller = initialRow && !initialRow.closest(EXCLUDED) ? findScroller(initialRow) : null;
  const previousAnchor = anchorScroller?.style.getPropertyValue("overflow-anchor") ?? "";
  const previousPriority = anchorScroller?.style.getPropertyPriority("overflow-anchor") ?? "";
  // Closing briefly removes the textarea before the preview is restored.
  // Suppress anchoring only during that transaction, so Gecko cannot anchor
  // to a following row and push the previously visible content offscreen.
  anchorScroller?.style.setProperty("overflow-anchor", "none", "important");
  function stop(): void {
    active = false;
    if (frame !== undefined) win?.cancelAnimationFrame(frame);
    frame = undefined;
    for (const type of CANCEL_EVENTS) doc.removeEventListener(type, stop, true);
    if (anchorScroller?.style.getPropertyValue("overflow-anchor") === "none") {
      if (previousAnchor) anchorScroller.style.setProperty("overflow-anchor", previousAnchor, previousPriority);
      else anchorScroller.style.removeProperty("overflow-anchor");
    }
  }
  for (const type of CANCEL_EVENTS) doc.addEventListener(type, stop, true);

  function recoverIfOffscreen(): void {
    frame = undefined;
    if (!active) return;
    try {
      if (!isEnabled()) return;
      const comment = getComment();
      const row = comment?.closest<HTMLElement>(SELECTED);
      if (!row?.isConnected || row.closest(EXCLUDED) ||
        row.querySelector(".annotation-markdown-editing, .annotation-markdown-fast-editing")) return;
      const selected = Array.from(doc.querySelectorAll(SELECTED)).filter(node => !node.closest(EXCLUDED));
      if (selected.length !== 1 || selected[0] !== row) return;
      const focused = doc.activeElement;
      if (focused && row.contains(focused) && focused.closest("textarea,input,select,[contenteditable='true']")) return;

      const scroller = findScroller(row);
      if (!scroller || scroller.clientHeight <= 0) return;
      const rect = row.getBoundingClientRect();
      if (rect.height <= 0) return;
      const viewportTop = scroller.getBoundingClientRect().top + scroller.clientTop;
      const viewportBottom = viewportTop + scroller.clientHeight;
      // Any visible part is enough: editing the middle/end must not reset the
      // reader to the beginning. Only a completely lost row gets one scroll.
      if (rect.bottom > viewportTop && rect.top < viewportBottom) return;
      const top = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight,
        scroller.scrollTop + rect.top - viewportTop - 2));
      scroller.scrollTo({ top, left: scroller.scrollLeft, behavior: "smooth" });
    } finally {
      stop();
    }
  }

  return {
    afterRender() {
      if (!active || scheduled) return;
      scheduled = true;
      if (!win?.requestAnimationFrame) { stop(); return; }
      // Measure after the restored preview and Gecko's scroll anchoring have
      // both had a layout frame. These frames never issue interim scrolls.
      frame = win.requestAnimationFrame(() => {
        if (!active) return;
        frame = win.requestAnimationFrame(recoverIfOffscreen);
      });
    },
    stop
  };
}
