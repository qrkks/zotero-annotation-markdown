/**
 * Zotero Reader annotation DOM boundary.
 *
 * The adapter discovers renderable comments and manages plugin-owned preview
 * nodes while preserving Zotero's original source and native editor structure.
 */
const COMMENT_SELECTORS: string[] = [
  "[data-annotation-comment]",
  ".annotation-comment",
  ".comment"
];

const ANNOTATION_ROW_SELECTOR = "[data-sidebar-annotation-id], [data-annotation-id], .annotation, .annotation-row";
const NATIVE_NOTE_EDITOR_SELECTOR = [
  ".note-editor",
  ".zotero-note-editor",
  "[data-note-editor]",
  ".ProseMirror"
].join(",");
const RENDERED_ATTRIBUTE = "data-annotation-markdown-rendered";
const SOURCE_ATTRIBUTE = "data-annotation-markdown-source";
const SUPPRESS_UNTIL_ATTRIBUTE = "data-annotation-markdown-suppress-until";
const PREVIEW_ATTRIBUTE = "data-annotation-markdown-preview";
const PREVIEW_PLACEHOLDER_ATTRIBUTE = "data-annotation-markdown-placeholder";
const PREVIEW_HIDDEN_ATTRIBUTE = "data-annotation-markdown-preview-hidden";
const SOURCE_WRAPPER_ATTRIBUTE = "data-annotation-markdown-source-node";
const SOURCE_HIDDEN_ATTRIBUTE = "data-annotation-markdown-source-hidden";
const EDITING_CLASS = "annotation-markdown-editing";
const FAST_EDITING_CLASS = "annotation-markdown-fast-editing";
const FAST_EDITOR_ATTRIBUTE = "data-annotation-markdown-fast-editor";
const FAST_EDITOR_CLOSING_ATTRIBUTE = "data-annotation-markdown-fast-editor-closing";
const FAST_EDITOR_COMMITTED_ATTRIBUTE = "data-annotation-markdown-fast-editor-committed";
const WEAVERO_LINK_COLORS_CLASS = "annotation-markdown-weavero-link-colors";
export const FAST_EDITOR_CLOSED_EVENT = "annotation-markdown-fast-editor-closed";

export interface FastEditorClosedDetail {
  annotationID: string;
  source: string;
  committed: boolean;
}

interface CreateAnnotationSidebarAdapterOptions {
  document?: Document | null;
  openLink?(url: string): void;
  isFastEditorEnabled?(): boolean;
  commitComment?(annotationID: string, comment: string): boolean;
  beginFastEditorKeyboardGuard?(): (() => void) | void;
  useWeaveroLinkColors?(): boolean;
}

/** Operations the controller may perform without knowing Zotero's DOM shape. */
export interface AnnotationSidebarAdapter {
  findCommentNodes(root?: Node | null): HTMLElement[];
  findRenderedCommentNodes(root?: Node | null): HTMLElement[];
  countNativeNoteEditorComments(root?: Node | null): number;
  isEditable(node: HTMLElement | null | undefined): boolean;
  getSourceText(node: HTMLElement | null | undefined): string;
  applyRenderedHtml(node: HTMLElement | null | undefined, html: string): void;
  releaseRenderedHtml(node: HTMLElement | null | undefined): boolean;
  suspendRenderedDom(node: HTMLElement | null | undefined): HTMLElement | null;
  restoreSuspendedRenderedDom(
    node: HTMLElement | null | undefined,
    preview: HTMLElement | null | undefined
  ): boolean;
  restoreSourceText(node: HTMLElement | null | undefined): void;
  restoreSourceDomForEditing(node: HTMLElement | null | undefined): void;
  clearRenderedState(root?: Node | null): void;
  showSourceForEditing(node: HTMLElement): boolean;
  tryShowFastEditorForTarget(target: EventTarget | null | undefined): boolean;
  tryShowFastEditorForAnnotationID(annotationID: string): boolean;
  getAnnotationIDForTarget(target: EventTarget | null | undefined): string | null;
  getCommentNodeForAnnotationID(annotationID: string): HTMLElement | null;
  setCommittedSource(node: HTMLElement | null | undefined, source: string): void;
  closeActiveFastEditor(): boolean;
  commitComment(annotationID: string, comment: string): boolean;
  suppressRendering(node: HTMLElement | null | undefined, durationMs?: number): void;
  isSuppressed(node: HTMLElement | null | undefined): boolean;
  isRendered(node: HTMLElement | null | undefined): boolean;
  hasPreview(node: HTMLElement | null | undefined): boolean;
  finishEditing(node: HTMLElement | null | undefined): void;
  getCommentNodeForTarget(target: EventTarget | null | undefined): HTMLElement | null;
  isCommentEditorTarget(target: EventTarget | null | undefined): boolean;
  isFastEditorTarget(target: EventTarget | null | undefined): boolean;
  openLink: ((url: string) => void) | null;
}

/**
 * Creates a source-plus-preview adapter scoped to one Reader document.
 *
 * Native note editors are excluded even when they contain generic classes such
 * as `.comment` or `.content`.
 */
export function createAnnotationSidebarAdapter({
  document: documentRef = globalThis.document,
  openLink,
  isFastEditorEnabled = () => false,
  commitComment,
  beginFastEditorKeyboardGuard,
  useWeaveroLinkColors = () => false
}: CreateAnnotationSidebarAdapterOptions = {}): AnnotationSidebarAdapter {
  const pendingCommittedSourceByAnnotationID = new Map<string, string>();

  return {
    findCommentNodes(root: Node | null = documentRef) {
      const queryRoot = getQueryRoot(root);
      if (!queryRoot) {
        return [];
      }

      const candidates = queryHtmlElements(queryRoot, COMMENT_SELECTORS.join(","));
      if (isHTMLElement(root) && root.matches(COMMENT_SELECTORS.join(","))) {
        candidates.unshift(root);
      }

      return candidates
        .filter((node) => node.closest(ANNOTATION_ROW_SELECTOR))
        .filter((node) => !isInsideNativeNoteEditor(node))
        .filter((node) => !this.isEditable(node))
        .filter((node) => !this.isSuppressed(node));
    },

    findRenderedCommentNodes(root: Node | null = documentRef) {
      const queryRoot = getQueryRoot(root);
      if (!queryRoot) {
        return [];
      }

      const candidates = queryHtmlElements(queryRoot, `[${RENDERED_ATTRIBUTE}='true']`);
      if (isHTMLElement(root) && root.getAttribute(RENDERED_ATTRIBUTE) === "true") {
        candidates.unshift(root);
      }
      return candidates.filter((node) => !isInsideNativeNoteEditor(node));
    },

    countNativeNoteEditorComments(root: Node | null = documentRef) {
      const queryRoot = getQueryRoot(root);
      if (!queryRoot) {
        return 0;
      }

      const candidates = queryHtmlElements(queryRoot, COMMENT_SELECTORS.join(","));
      if (isHTMLElement(root) && root.matches(COMMENT_SELECTORS.join(","))) {
        candidates.unshift(root);
      }

      return candidates
        .filter((node) => node.closest(ANNOTATION_ROW_SELECTOR))
        .filter((node) => isInsideNativeNoteEditor(node))
        .length;
    },

    isEditable(node: HTMLElement | null | undefined) {
      if (!node) {
        return true;
      }

      if (node.classList?.contains(EDITING_CLASS)) {
        if (hasFocusInside(node)) {
          return true;
        }

        finishEditing(node);
      }

      if (node.matches?.("textarea,input,select")) {
        return true;
      }

      if (node.getAttribute?.("contenteditable") === "true") {
        return true;
      }

      if (hasFocusInside(node)) {
        return true;
      }

      return hasEditorControl(node) && !hasDormantSelectedAnnotationEditor(node);
    },

    getSourceText(node: HTMLElement | null | undefined) {
      const source = readSourceText(getSourceNode(node));
      const annotationID = node ? getAnnotationID(node) : null;
      if (annotationID && pendingCommittedSourceByAnnotationID.has(annotationID)) {
        const committedSource = pendingCommittedSourceByAnnotationID.get(annotationID) ?? "";
        if (source === committedSource) {
          pendingCommittedSourceByAnnotationID.delete(annotationID);
        }
        return committedSource;
      }
      return node?.getAttribute(SOURCE_ATTRIBUTE) ?? source;
    },

    applyRenderedHtml(node: HTMLElement | null | undefined, html: string) {
      if (!node || this.isEditable(node)) {
        return;
      }

      // Keep Zotero's source DOM intact; the attribute is only a render cache.
      if (!this.isRendered(node)) {
        node.setAttribute(SOURCE_ATTRIBUTE, this.getSourceText(node));
      }

      const preview = getPreviewNode(node) ?? createPreviewNode(node, this);

      preview.removeAttribute(PREVIEW_PLACEHOLDER_ATTRIBUTE);

      if (preview.innerHTML !== html) {
        preview.innerHTML = html;
      }

      preview.classList.toggle(
        WEAVERO_LINK_COLORS_CLASS,
        safelyUseWeaveroLinkColors(useWeaveroLinkColors)
      );
      hideSourceNode(node);
      showPreviewNode(preview);
      node.setAttribute(RENDERED_ATTRIBUTE, "true");
    },

    releaseRenderedHtml(node: HTMLElement | null | undefined) {
      if (!node || !this.isRendered(node) || this.isEditable(node)) {
        return false;
      }

      const preview = getPreviewNode(node);
      if (!preview) {
        node.removeAttribute(RENDERED_ATTRIBUTE);
        return false;
      }

      preview.textContent = this.getSourceText(node);
      preview.setAttribute(PREVIEW_PLACEHOLDER_ATTRIBUTE, "true");
      showPreviewNode(preview);
      node.removeAttribute(RENDERED_ATTRIBUTE);
      return true;
    },

    suspendRenderedDom(node: HTMLElement | null | undefined) {
      if (!node || !this.isRendered(node) || this.isEditable(node)) {
        return null;
      }

      const preview = getPreviewNode(node);
      if (!preview) {
        return null;
      }

      const placeholder = createPreviewPlaceholder(node, this);
      preview.replaceWith(placeholder);
      node.removeAttribute(RENDERED_ATTRIBUTE);
      return preview;
    },

    restoreSuspendedRenderedDom(
      node: HTMLElement | null | undefined,
      preview: HTMLElement | null | undefined
    ) {
      if (!node?.isConnected || !preview || this.isEditable(node)) {
        return false;
      }

      const placeholder = getPreviewNode(node);
      if (placeholder?.getAttribute?.(PREVIEW_PLACEHOLDER_ATTRIBUTE) !== "true") {
        return false;
      }

      preview.removeAttribute(PREVIEW_PLACEHOLDER_ATTRIBUTE);
      placeholder.replaceWith(preview);
      hideSourceNode(node);
      showPreviewNode(preview);
      node.setAttribute(RENDERED_ATTRIBUTE, "true");
      return true;
    },

    restoreSourceText(node: HTMLElement | null | undefined) {
      if (!node) {
        return;
      }

      const source = this.getSourceText(node);
      const sourceNode = getSourceNode(node);
      if (sourceNode === node) {
        node.textContent = source;
      } else if (sourceNode) {
        sourceNode.textContent = source;
      }
      restoreSourceDom(node);
    },

    restoreSourceDomForEditing(node: HTMLElement | null | undefined) {
      restoreSourceDom(node);
    },

    clearRenderedState(root: Node | null = documentRef) {
      const queryRoot = getQueryRoot(root);
      if (!queryRoot) {
        return;
      }
      pendingCommittedSourceByAnnotationID.clear();

      // Remove only plugin-owned DOM so disable/re-enable restores the host view.
      for (const editor of queryHtmlElements(
        queryRoot,
        `[${FAST_EDITOR_ATTRIBUTE}='true']`
      )) {
        const session = fastEditorSessionByDocument.get(editor.ownerDocument);
        if (session?.editor === editor) {
          session.removalObserver?.disconnect();
          fastEditorSessionByDocument.delete(editor.ownerDocument);
        }
        endFastEditorKeyboardGuard(editor);
        editor.remove();
      }

      for (const preview of queryHtmlElements(
        queryRoot,
        `[${PREVIEW_ATTRIBUTE}='true'], .annotation-markdown-rendered`
      )) {
        preview.remove();
      }

      for (const node of queryHtmlElements(
        queryRoot,
        `[${RENDERED_ATTRIBUTE}], [${SOURCE_ATTRIBUTE}], [${SUPPRESS_UNTIL_ATTRIBUTE}], [${FAST_EDITOR_COMMITTED_ATTRIBUTE}], .${EDITING_CLASS}, .${FAST_EDITING_CLASS}`
      )) {
        node.classList.remove(EDITING_CLASS);
        node.classList.remove(FAST_EDITING_CLASS);
        node.removeAttribute(RENDERED_ATTRIBUTE);
        node.removeAttribute(SOURCE_ATTRIBUTE);
        node.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);
        node.removeAttribute(FAST_EDITOR_COMMITTED_ATTRIBUTE);

        showSourceNode(getSourceContainer(node));
        showSourceNode(getSourceNode(node));
        unwrapSourceNode(node);
      }

      for (const node of queryHtmlElements(queryRoot, `[${SOURCE_HIDDEN_ATTRIBUTE}='true']`)) {
        showSourceNode(node);
      }
    },

    showSourceForEditing(node: HTMLElement) {
      if (!canEnterEditing(node)) {
        return false;
      }

      if (isFastEditorEnabled() && canUseFastEditor(node, commitComment)) {
        showFastEditor(node, this, beginFastEditorKeyboardGuard);
        return true;
      }

      const sourceNode = getSourceNode(node);
      const sourceContainer = getSourceContainer(node, sourceNode);
      const preview = getPreviewNode(node);

      showSourceNode(sourceContainer);
      showSourceNode(sourceNode);

      if (preview) {
        hidePreviewNode(preview);
      }

      node.classList?.add(EDITING_CLASS);
      this.suppressRendering(node);

      const focusTarget = getFocusTarget(node, sourceNode);
      // Let Zotero finish row selection before taking focus into its editor.
      runAfterLayout(node, () => {
        focusTarget?.focus?.({ preventScroll: true });
        placeCaretAtEnd(focusTarget);
        focusTarget?.addEventListener?.("focusout", () => finishEditing(node), { once: true });
      });
      return false;
    },

    tryShowFastEditorForTarget(target: EventTarget | null | undefined) {
      if (!isFastEditorEnabled()) {
        return false;
      }

      const targetElement = getElementTarget(target);
      if (targetElement?.closest("a[href]")) {
        return false;
      }
      const nativeEntry = targetElement?.closest(
        `.content, .expandable-editor .renderer, [${PREVIEW_ATTRIBUTE}='true']`
      );
      const comment = this.getCommentNodeForTarget(target);
      if (
        !nativeEntry ||
        !comment ||
        !canEnterEditing(comment) ||
        !canUseFastEditor(comment, commitComment)
      ) {
        return false;
      }

      showFastEditor(comment, this, beginFastEditorKeyboardGuard);
      return true;
    },

    tryShowFastEditorForAnnotationID(annotationID: string) {
      if (!isFastEditorEnabled() || !annotationID) {
        return false;
      }

      const comment = this.getCommentNodeForAnnotationID(annotationID);
      if (
        !comment ||
        !canEnterEditing(comment) ||
        !canUseFastEditor(comment, commitComment)
      ) {
        return false;
      }

      showFastEditor(comment, this, beginFastEditorKeyboardGuard);
      return true;
    },

    getAnnotationIDForTarget(target: EventTarget | null | undefined) {
      const comment = this.getCommentNodeForTarget(target);
      return comment ? getAnnotationID(comment) : null;
    },

    getCommentNodeForAnnotationID(annotationID: string) {
      const queryRoot = getQueryRoot(documentRef);
      const candidates = queryRoot
        ? queryHtmlElements(queryRoot, COMMENT_SELECTORS.join(","))
          .filter((candidate) => (
            getAnnotationID(candidate) === annotationID &&
            !isInsideNativeNoteEditor(candidate)
          ))
        : [];
      return candidates.find((candidate) => (
        candidate.closest("[data-sidebar-annotation-id]")
      )) ?? candidates[0] ?? null;
    },

    setCommittedSource(node: HTMLElement | null | undefined, source: string) {
      if (!node) {
        return;
      }
      const annotationID = getAnnotationID(node);
      if (annotationID) {
        pendingCommittedSourceByAnnotationID.set(annotationID, source);
      }
      node.setAttribute(SOURCE_ATTRIBUTE, source);
      node.setAttribute(FAST_EDITOR_COMMITTED_ATTRIBUTE, "true");
    },

    suppressRendering(node: HTMLElement | null | undefined, durationMs = 1500) {
      node?.setAttribute(SUPPRESS_UNTIL_ATTRIBUTE, String(Date.now() + durationMs));
    },

    isSuppressed(node: HTMLElement | null | undefined) {
      const suppressUntil = Number(node?.getAttribute(SUPPRESS_UNTIL_ATTRIBUTE) ?? 0);
      if (!suppressUntil) {
        return false;
      }

      if (Date.now() <= suppressUntil) {
        return true;
      }

      node?.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);
      return false;
    },

    isRendered(node: HTMLElement | null | undefined) {
      return node?.getAttribute(RENDERED_ATTRIBUTE) === "true";
    },

    hasPreview(node: HTMLElement | null | undefined) {
      return Boolean(getPreviewNode(node));
    },

    finishEditing(node: HTMLElement | null | undefined) {
      finishEditing(node);
    },

    getCommentNodeForTarget(target: EventTarget | null | undefined) {
      const element = getElementTarget(target);
      const comment = element?.closest(COMMENT_SELECTORS.join(","));
      if (!isHTMLElement(comment) || !comment.closest(ANNOTATION_ROW_SELECTOR)) {
        return null;
      }

      if (isInsideNativeNoteEditor(comment) || isInsideNativeNoteEditor(element)) {
        return null;
      }

      return comment;
    },

    isCommentEditorTarget(target: EventTarget | null | undefined) {
      const comment = this.getCommentNodeForTarget(target);
      const editor = getElementTarget(target)?.closest(
        "textarea,input,[contenteditable='true'],[tabindex]"
      );
      if (!editor) {
        return false;
      }

      return Boolean(comment);
    },

    isFastEditorTarget(target: EventTarget | null | undefined) {
      return Boolean(getElementTarget(target)?.closest(`[${FAST_EDITOR_ATTRIBUTE}='true']`));
    },

    closeActiveFastEditor() {
      if (!documentRef) {
        return true;
      }

      const session = fastEditorSessionByDocument.get(documentRef);
      return session ? session.close() : true;
    },

    commitComment(annotationID: string, comment: string) {
      const committed = Boolean(commitComment?.(annotationID, comment));
      if (committed) {
        pendingCommittedSourceByAnnotationID.set(annotationID, comment);
      }
      return committed;
    },

    openLink: typeof openLink === "function" ? openLink : null
  };
}

function showFastEditor(
  node: HTMLElement,
  adapter: AnnotationSidebarAdapter,
  beginFastEditorKeyboardGuard?: () => (() => void) | void
): void {
  const existingEditor = node.querySelector(`[${FAST_EDITOR_ATTRIBUTE}='true']`);
  if (isHTMLElement(existingEditor)) {
    focusFastEditor(existingEditor);
    return;
  }

  const annotationID = getAnnotationID(node);
  if (!annotationID) {
    return;
  }
  const originalSource = adapter.getSourceText(node);
  const viewportAnchor = captureFastEditorViewportAnchor(node);

  const documentRef = node.ownerDocument;
  const editor = documentRef.createElement("div");
  editor.className = "annotation-markdown-fast-editor";
  editor.setAttribute(FAST_EDITOR_ATTRIBUTE, "true");

  const textarea = documentRef.createElement("textarea");
  textarea.className = "annotation-markdown-fast-editor-input content";
  // Zotero's Reader isTextBox() omits TEXTAREA and recognizes only text inputs
  // or contenteditable="true". This compatibility marker keeps shortcuts such
  // as Ctrl/Cmd+A native; the element itself remains a normal textarea.
  textarea.setAttribute("contenteditable", "true");
  // Zotero also moves focus away from empty `.content` nodes on arrow keys.
  textarea.innerText = "\u200b";
  textarea.value = originalSource;
  textarea.setAttribute("aria-label", "Edit annotation comment as Markdown");
  textarea.title = "Blur or press Escape to save";
  textarea.spellcheck = true;
  textarea.rows = originalSource.trim() ? 3 : 1;
  editor.append(textarea);
  const endKeyboardGuard = beginFastEditorKeyboardGuard?.();
  if (typeof endKeyboardGuard === "function") {
    fastEditorCleanupByEditor.set(editor, endKeyboardGuard);
  }
  const commitAndClose = () => closeFastEditor(
    node,
    editor,
    adapter,
    annotationID,
    originalSource
  );
  const session: FastEditorSession = {
    editor,
    close: commitAndClose
  };
  const MutationObserverRef = documentRef.defaultView?.MutationObserver;
  if (MutationObserverRef && documentRef.body) {
    session.removalObserver = new MutationObserverRef(() => {
      if (!editor.isConnected) {
        session.close();
      }
    });
    session.removalObserver.observe(documentRef.body, {
      childList: true,
      subtree: true
    });
  }
  fastEditorSessionByDocument.set(documentRef, session);
  editor.addEventListener("mousedown", stopHostEventPropagation);
  editor.addEventListener("click", stopHostEventPropagation);
  editor.addEventListener("keydown", stopHostEventPropagation);
  editor.addEventListener("keyup", stopHostEventPropagation);
  editor.addEventListener("keypress", stopHostEventPropagation);
  editor.addEventListener("beforeinput", stopHostEventPropagation);
  let previousValueLength = textarea.value.length;
  textarea.addEventListener("input", (event) => {
    const pasted = isPasteInputEvent(event);
    const viewportAnchor = pasted
      ? captureFastEditorViewportAnchor(textarea)
      : null;
    const allowShrink = textarea.value.length < previousValueLength;
    previousValueLength = textarea.value.length;
    resizeFastEditor(textarea, allowShrink);
    if (pasted) {
      // Keep the editor where it was before the large layout change. Gecko and
      // Zotero can apply their own anchoring one frame later, so repeat the same
      // bounded correction after that frame has settled.
      restoreFastEditorAfterPaste(textarea, viewportAnchor);
    }
  });
  textarea.addEventListener("blur", commitAndClose);
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      commitAndClose();
    }
  });

  const sourceNode = getSourceNode(node);
  hideSourceNode(node);
  hidePreviewNode(getPreviewNode(node));
  getSourceContainer(node, sourceNode).after(editor);
  node.classList.add(EDITING_CLASS, FAST_EDITING_CLASS);
  adapter.suppressRendering(node, 60_000);

  runAfterLayout(node, () => {
    resizeFastEditor(textarea);
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    restoreFastEditorViewportAnchor(viewportAnchor);
    if (viewportAnchor) {
      // Gecko can apply focus/scroll anchoring one frame after the textarea's
      // own layout, especially in a large annotation sidebar.
      runAfterLayout(node, () => restoreFastEditorViewportAnchor(viewportAnchor));
    }
  });
}

function closeFastEditor(
  node: HTMLElement,
  editor: HTMLElement,
  adapter: AnnotationSidebarAdapter,
  annotationID: string,
  originalSource: string
): boolean {
  if (editor.getAttribute(FAST_EDITOR_CLOSING_ATTRIBUTE) === "true") {
    return false;
  }
  editor.setAttribute(FAST_EDITOR_CLOSING_ATTRIBUTE, "true");

  const textarea = editor.querySelector("textarea");
  const source = textarea?.value ?? "";
  const committed = source !== originalSource;

  textarea?.blur();
  if (committed) {
    if (!adapter.commitComment(annotationID, source)) {
      editor.removeAttribute(FAST_EDITOR_CLOSING_ATTRIBUTE);
      runAfterLayout(node, () => textarea?.focus({ preventScroll: true }));
      return false;
    }
    node.setAttribute(SOURCE_ATTRIBUTE, source);
    node.setAttribute(FAST_EDITOR_COMMITTED_ATTRIBUTE, "true");
  }
  hidePreviewNode(getPreviewNode(node));

  node.classList.remove(EDITING_CLASS, FAST_EDITING_CLASS);
  node.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);
  const session = fastEditorSessionByDocument.get(editor.ownerDocument);
  if (session?.editor === editor) {
    session.removalObserver?.disconnect();
    fastEditorSessionByDocument.delete(editor.ownerDocument);
  }
  dispatchFastEditorClosed(node, { annotationID, source, committed });
  endFastEditorKeyboardGuard(editor);
  editor.remove();
  return true;
}

function focusFastEditor(editor: HTMLElement): void {
  const textarea = editor.querySelector("textarea");
  textarea?.focus({ preventScroll: true });
}

function canUseFastEditor(
  node: HTMLElement,
  commitComment: ((annotationID: string, comment: string) => boolean) | undefined
): boolean {
  return typeof commitComment === "function" && Boolean(getAnnotationID(node));
}

function getAnnotationID(node: HTMLElement): string | null {
  const annotation = node.closest("[data-sidebar-annotation-id], [data-annotation-id]");
  return annotation?.getAttribute("data-sidebar-annotation-id") ??
    annotation?.getAttribute("data-annotation-id") ??
    getSourceNode(node)?.id ??
    null;
}

const fastEditorCleanupByEditor = new WeakMap<HTMLElement, () => void>();
interface FastEditorSession {
  editor: HTMLElement;
  close(): boolean;
  removalObserver?: MutationObserver;
}

const fastEditorSessionByDocument = new WeakMap<Document, FastEditorSession>();

function endFastEditorKeyboardGuard(editor: HTMLElement): void {
  const cleanup = fastEditorCleanupByEditor.get(editor);
  fastEditorCleanupByEditor.delete(editor);
  cleanup?.();
}

function resizeFastEditor(
  textarea: HTMLTextAreaElement,
  allowShrink = true
): void {
  const currentHeight = Number.parseFloat(textarea.style.height);
  if (!allowShrink && Number.isFinite(currentHeight) && currentHeight > 0) {
    const scrollHeight = textarea.scrollHeight;
    if (scrollHeight > currentHeight) {
      textarea.style.height = `${scrollHeight}px`;
    }
    return;
  }

  textarea.style.height = "auto";
  if (textarea.scrollHeight > 0) {
    textarea.style.height = `${textarea.scrollHeight}px`;
    return;
  }
  textarea.style.removeProperty("height");
}

function isPasteInputEvent(event: Event): boolean {
  return (event as InputEvent).inputType === "insertFromPaste";
}

function restoreFastEditorAfterPaste(
  textarea: HTMLTextAreaElement,
  viewportAnchor: FastEditorViewportAnchor | null
): void {
  runAfterLayout(textarea, () => {
    restoreFastEditorViewportAnchor(viewportAnchor);
    ensureFastEditorVisibleAfterPaste(textarea);
    runAfterLayout(textarea, () => {
      restoreFastEditorViewportAnchor(viewportAnchor);
      ensureFastEditorVisibleAfterPaste(textarea);
    });
  });
}

function ensureFastEditorVisibleAfterPaste(textarea: HTMLTextAreaElement): void {
  const scroller = findFastEditorScrollContainer(textarea);
  if (!scroller) {
    return;
  }

  const textareaRect = textarea.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const viewportTop = scrollerRect.top;
  const viewportBottom = viewportTop + scroller.clientHeight;
  const desiredVisibleHeight = Math.min(
    textareaRect.height,
    scroller.clientHeight / 2,
    240
  );
  if (desiredVisibleHeight <= 0) {
    return;
  }

  const visibleHeight = Math.max(
    0,
    Math.min(textareaRect.bottom, viewportBottom) -
      Math.max(textareaRect.top, viewportTop)
  );
  if (visibleHeight >= desiredVisibleHeight) {
    return;
  }

  const delta = textareaRect.top >= viewportTop
    ? textareaRect.top - (viewportBottom - desiredVisibleHeight)
    : textareaRect.bottom - (viewportTop + desiredVisibleHeight);
  setFastEditorScrollPosition(
    scroller,
    scroller.scrollTop + delta,
    scroller.scrollLeft
  );
}

interface FastEditorViewportAnchor {
  row: HTMLElement;
  scroller: HTMLElement;
  viewportTop: number;
}

function captureFastEditorViewportAnchor(
  node: HTMLElement
): FastEditorViewportAnchor | null {
  const scroller = findFastEditorScrollContainer(node);
  const row = node.closest(ANNOTATION_ROW_SELECTOR);
  if (!scroller || !isHTMLElement(row)) {
    return null;
  }

  const rowRect = row.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const viewportTop = scrollerRect.top;
  const viewportBottom = viewportTop + scroller.clientHeight;
  if (rowRect.bottom <= viewportTop || rowRect.top >= viewportBottom) {
    // Let Zotero perform its initial page-to-sidebar location when the row is
    // genuinely outside the sidebar viewport.
    return null;
  }

  return {
    row,
    scroller,
    viewportTop: rowRect.top
  };
}

function findFastEditorScrollContainer(node: HTMLElement): HTMLElement | null {
  const windowRef = node.ownerDocument.defaultView;
  let current = node.parentElement;
  while (current && current !== node.ownerDocument.body) {
    const overflowY = windowRef?.getComputedStyle?.(current)?.overflowY ?? "";
    if (
      /^(auto|scroll|overlay)$/.test(overflowY) &&
      current.scrollHeight > current.clientHeight
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function restoreFastEditorViewportAnchor(
  anchor: FastEditorViewportAnchor | null
): void {
  if (!anchor || !anchor.scroller.isConnected || !anchor.row.isConnected) {
    return;
  }

  const currentViewportTop = anchor.row.getBoundingClientRect().top;
  const delta = currentViewportTop - anchor.viewportTop;
  setFastEditorScrollPosition(
    anchor.scroller,
    anchor.scroller.scrollTop + delta,
    anchor.scroller.scrollLeft
  );
}

function setFastEditorScrollPosition(
  scroller: HTMLElement,
  top: number,
  left: number
): void {
  try {
    scroller.scrollTo({ top, left, behavior: "instant" });
  } catch {
    scroller.scrollTop = top;
    scroller.scrollLeft = left;
  }
}

function dispatchFastEditorClosed(
  node: HTMLElement,
  detail: FastEditorClosedDetail
): void {
  const EventRef = node.ownerDocument.defaultView?.CustomEvent ?? globalThis.CustomEvent;
  // A detached node cannot bubble to the Reader root. Dispatch from the live
  // body after Zotero replaces/removes the edited comment so the controller
  // still receives the committed draft lifecycle event.
  const target: EventTarget = node.isConnected
    ? node
    : node.ownerDocument.body ?? node.ownerDocument;
  target.dispatchEvent(new EventRef(FAST_EDITOR_CLOSED_EVENT, {
    bubbles: true,
    detail
  }));
}

function stopHostEventPropagation(event: Event): void {
  event.stopPropagation();
}

type QueryRoot = Node & ParentNode;

function getQueryRoot(root: Node | null | undefined): QueryRoot | null {
  if (!root || typeof (root as ParentNode).querySelectorAll !== "function") {
    return null;
  }
  return root as QueryRoot;
}

function safelyUseWeaveroLinkColors(
  useWeaveroLinkColors: () => boolean
): boolean {
  try {
    return Boolean(useWeaveroLinkColors());
  } catch {
    return false;
  }
}

function queryHtmlElements(root: QueryRoot, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll(selector)).filter(isHTMLElement);
}

function isHTMLElement(value: unknown): value is HTMLElement {
  return Boolean(
    value &&
    typeof value === "object" &&
    "nodeType" in value &&
    (value as Node).nodeType === 1 &&
    "style" in value &&
    "hidden" in value
  );
}

function createPreviewNode(
  sourceNode: HTMLElement,
  adapter: AnnotationSidebarAdapter
): HTMLElement {
  const preview = sourceNode.ownerDocument.createElement("div");
  preview.className = "annotation-markdown-rendered";
  preview.setAttribute(PREVIEW_ATTRIBUTE, "true");
  preview.addEventListener("pointerdown", (event) => {
    if (getElementTarget(event.target)?.closest("a[href]")) {
      // Keep Zotero's pointer-driven row selection/focus path from replacing
      // the preview before the following mousedown opens the link.
      event.stopPropagation();
      return;
    }
    if (adapter.showSourceForEditing(sourceNode)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true });
  preview.addEventListener("mousedown", (event) => {
    const link = getElementTarget(event.target)?.closest("a[href]");
    if (link) {
      event.stopPropagation();
      if (event.button === 0 && adapter.openLink) {
        event.preventDefault();
        const href = link.getAttribute("href");
        if (href !== null) {
          adapter.openLink(href);
        }
      }
      return;
    }
    if (adapter.showSourceForEditing(sourceNode)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { capture: true });
  preview.addEventListener("click", (event) => {
    const link = getElementTarget(event.target)?.closest("a[href]");
    if (!link) {
      return;
    }

    event.stopPropagation();
    if (event.button !== 0 || !adapter.openLink) {
      return;
    }

    event.preventDefault();
    if (event.detail === 0) {
      const href = link.getAttribute("href");
      if (href !== null) {
        adapter.openLink(href);
      }
    }
  }, { capture: true });
  getPreviewAnchor(sourceNode).after(preview);
  return preview;
}

function createPreviewPlaceholder(
  sourceNode: HTMLElement,
  adapter: AnnotationSidebarAdapter
): HTMLElement {
  const placeholder = sourceNode.ownerDocument.createElement("div");
  placeholder.className = "annotation-markdown-rendered";
  placeholder.setAttribute(PREVIEW_ATTRIBUTE, "true");
  placeholder.setAttribute(PREVIEW_PLACEHOLDER_ATTRIBUTE, "true");
  placeholder.textContent = adapter.getSourceText(sourceNode);
  placeholder.addEventListener("pointerdown", (event) => {
    if (adapter.showSourceForEditing(sourceNode)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true });
  placeholder.addEventListener("mousedown", (event) => {
    if (adapter.showSourceForEditing(sourceNode)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { capture: true });
  return placeholder;
}

function getPreviewNode(
  sourceNode: HTMLElement | null | undefined
): HTMLElement | null {
  if (!sourceNode) {
    return null;
  }
  const sourceContent = getSourceNode(sourceNode);
  const siblingPreview = getSourceContainer(sourceNode, sourceContent)?.nextElementSibling;
  if (
    isHTMLElement(siblingPreview) &&
    siblingPreview.getAttribute(PREVIEW_ATTRIBUTE) === "true"
  ) {
    return siblingPreview;
  }

  return Array.from(sourceNode.children)
    .filter(isHTMLElement)
    .find((child) => child.getAttribute(PREVIEW_ATTRIBUTE) === "true") ?? null;
}

function hidePreviewNode(preview: HTMLElement | null | undefined): void {
  if (!preview) {
    return;
  }

  preview.hidden = true;
  preview.style.display = "none";
  preview.setAttribute(PREVIEW_HIDDEN_ATTRIBUTE, "true");
}

function showPreviewNode(preview: HTMLElement | null | undefined): void {
  if (!preview) {
    return;
  }

  preview.hidden = false;
  if (preview.getAttribute(PREVIEW_HIDDEN_ATTRIBUTE) === "true") {
    preview.style.display = "";
    preview.removeAttribute(PREVIEW_HIDDEN_ATTRIBUTE);
  }
}

function getSourceNode(
  node: HTMLElement | null | undefined
): HTMLElement | null {
  if (!node) {
    return null;
  }

  const existingWrapper = Array.from(node.children)
    .filter(isHTMLElement)
    .find((child) => child.getAttribute(SOURCE_WRAPPER_ATTRIBUTE) === "true");
  if (existingWrapper) {
    return existingWrapper;
  }

  const directContent = Array.from(node.children)
    .filter(isHTMLElement)
    .find((child) => child.classList.contains("content"));
  if (directContent) {
    return directContent;
  }

  const nestedContent = Array.from(node.querySelectorAll(".content"))
    .filter(isHTMLElement)
    .find((candidate) => !candidate.closest(`[${FAST_EDITOR_ATTRIBUTE}='true']`));
  if (nestedContent) {
    return nestedContent;
  }

  return node;
}

function hideSourceNode(node: HTMLElement): void {
  const sourceNode = ensureSourceNode(node);
  const sourceContainer = getSourceContainer(node, sourceNode);
  if (sourceContainer !== node) {
    sourceContainer.hidden = true;
    sourceContainer.style.display = "none";
    sourceContainer.setAttribute(SOURCE_HIDDEN_ATTRIBUTE, "true");
  }
}

function showSourceNode(sourceNode: HTMLElement | null | undefined): void {
  if (!sourceNode) {
    return;
  }

  sourceNode.hidden = false;
  if (sourceNode.getAttribute(SOURCE_HIDDEN_ATTRIBUTE) === "true") {
    sourceNode.style.display = "";
    sourceNode.removeAttribute(SOURCE_HIDDEN_ATTRIBUTE);
  }
}

function ensureSourceNode(node: HTMLElement): HTMLElement {
  const sourceNode = getSourceNode(node);
  if (sourceNode && sourceNode !== node) {
    return sourceNode;
  }

  const documentRef = node.ownerDocument;
  const wrapper = documentRef.createElement("span");
  wrapper.setAttribute(SOURCE_WRAPPER_ATTRIBUTE, "true");

  const preview = getPreviewNode(node);
  for (const child of Array.from(node.childNodes)) {
    if (child !== preview) {
      wrapper.append(child);
    }
  }

  node.prepend(wrapper);
  return wrapper;
}

function getPreviewAnchor(node: HTMLElement): HTMLElement {
  const sourceNode = ensureSourceNode(node);
  return getSourceContainer(node, sourceNode);
}

function getSourceContainer(
  node: HTMLElement,
  sourceNode: HTMLElement | null = getSourceNode(node)
): HTMLElement {
  if (!sourceNode) {
    return node;
  }

  // Zotero 9 hides the whole expandable editor shell, not only `.content`.
  const expandableEditor = sourceNode.closest(".expandable-editor");
  if (isHTMLElement(expandableEditor) && node.contains(expandableEditor)) {
    return expandableEditor;
  }

  return sourceNode;
}

function unwrapSourceNode(node: HTMLElement): void {
  const sourceWrapper = Array.from(node.children)
    .filter(isHTMLElement)
    .find((child) => child.getAttribute(SOURCE_WRAPPER_ATTRIBUTE) === "true");

  if (!sourceWrapper) {
    return;
  }

  sourceWrapper.replaceWith(...Array.from(sourceWrapper.childNodes));
}

function getFocusTarget(
  node: HTMLElement,
  sourceNode: HTMLElement | null
): HTMLElement | null {
  const sourceTarget = sourceNode?.matches(
    "[tabindex],textarea,input,select,[contenteditable='true']"
  )
    ? sourceNode
    : sourceNode?.querySelector(
      "[tabindex],textarea,input,select,[contenteditable='true']"
    );
  if (isHTMLElement(sourceTarget)) {
    return sourceTarget;
  }
  return node.matches("[tabindex]") ? node : null;
}

function restoreSourceDom(node: HTMLElement | null | undefined): void {
  if (!node) {
    return;
  }

  const sourceNode = getSourceNode(node);
  showSourceNode(getSourceContainer(node, sourceNode));
  showSourceNode(sourceNode);
  getPreviewNode(node)?.remove();
  unwrapSourceNode(node);
  node.classList?.remove(EDITING_CLASS);
  node.classList?.remove(FAST_EDITING_CLASS);
  node.removeAttribute(RENDERED_ATTRIBUTE);
  node.removeAttribute(SOURCE_ATTRIBUTE);
  node.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);
}

function canEnterEditing(node: HTMLElement): boolean {
  if (node.closest(".annotation-popup")) {
    return true;
  }

  const annotation = node.closest(".annotation, .annotation-row");
  return Boolean(annotation?.classList.contains("selected"));
}

function runAfterLayout(node: HTMLElement, callback: () => void): void {
  const windowRef = node.ownerDocument.defaultView ?? globalThis;
  const requestFrame = windowRef.requestAnimationFrame ?? globalThis.requestAnimationFrame;

  if (typeof requestFrame === "function") {
    requestFrame.call(windowRef, () => callback());
    return;
  }

  callback();
}

function placeCaretAtEnd(node: HTMLElement | null): void {
  const documentRef = node?.ownerDocument;
  const selection = documentRef?.defaultView?.getSelection();
  if (!node || !selection || !documentRef) {
    return;
  }

  try {
    const range = documentRef.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Caret placement is best-effort; focus is the important behavior.
  }
}

function finishEditing(node: HTMLElement | null | undefined): void {
  if (node?.getAttribute(FAST_EDITOR_COMMITTED_ATTRIBUTE) !== "true") {
    node?.setAttribute(SOURCE_ATTRIBUTE, readSourceText(getSourceNode(node)));
  }
  node?.removeAttribute(FAST_EDITOR_COMMITTED_ATTRIBUTE);
  node?.classList.remove(EDITING_CLASS);
  node?.classList.remove(FAST_EDITING_CLASS);
  node?.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);
}

function readSourceText(node: Node | null | undefined): string {
  if (!node) {
    return "";
  }

  const output: string[] = [];
  const walk = (current: Node | null | undefined): void => {
    if (!current) {
      return;
    }

    if (current.nodeType === 3) {
      output.push(current.nodeValue ?? "");
      return;
    }

    if (current.nodeType !== 1) {
      return;
    }

    const element = current as Element;
    const tag = element.tagName.toUpperCase();
    if (tag === "BR") {
      output.push("\n");
      return;
    }

    const isBlock = tag === "DIV" || tag === "P";
    if (isBlock && output.length && !output[output.length - 1].endsWith("\n")) {
      output.push("\n");
    }

    for (const child of current.childNodes) {
      walk(child);
    }

    if (isBlock && output.length && !output[output.length - 1].endsWith("\n")) {
      output.push("\n");
    }
  };

  for (const child of node.childNodes) {
    walk(child);
  }

  return output.join("").trim();
}

function hasFocusInside(node: HTMLElement): boolean {
  const activeElement = node.ownerDocument.activeElement;
  return Boolean(activeElement && activeElement !== node.ownerDocument.body && node.contains(activeElement));
}

function hasEditorControl(node: HTMLElement): boolean {
  return Boolean(node.querySelector("textarea,input,select,[contenteditable='true']"));
}

function hasDormantSelectedAnnotationEditor(node: HTMLElement): boolean {
  const annotation = node.closest(ANNOTATION_ROW_SELECTOR);
  const selected = annotation?.classList.contains("selected") ||
    annotation?.getAttribute("aria-selected") === "true";
  if (!selected) {
    return false;
  }

  const controls = Array.from(
    node.querySelectorAll("textarea,input,select,[contenteditable='true']")
  );
  return controls.length > 0 && controls.every((control) =>
    control.matches(".content[contenteditable='true']")
  );
}

function isInsideNativeNoteEditor(node: Element | null | undefined): boolean {
  return Boolean(
    node?.closest(NATIVE_NOTE_EDITOR_SELECTOR) ||
    node?.querySelector(NATIVE_NOTE_EDITOR_SELECTOR)
  );
}

function getElementTarget(
  target: EventTarget | null | undefined
): Element | null {
  if (
    !target ||
    typeof target !== "object" ||
    !("nodeType" in target)
  ) {
    return null;
  }

  const node = target as Node;
  return node.nodeType === 1 ? node as Element : node.parentElement;
}
