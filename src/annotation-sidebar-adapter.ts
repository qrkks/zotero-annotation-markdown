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

const ANNOTATION_ROW_SELECTOR = "[data-annotation-id], .annotation, .annotation-row";
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

interface CreateAnnotationSidebarAdapterOptions {
  document?: Document | null;
  openLink?(url: string): void;
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
  showSourceForEditing(node: HTMLElement): void;
  suppressRendering(node: HTMLElement | null | undefined, durationMs?: number): void;
  isSuppressed(node: HTMLElement | null | undefined): boolean;
  isRendered(node: HTMLElement | null | undefined): boolean;
  hasPreview(node: HTMLElement | null | undefined): boolean;
  finishEditing(node: HTMLElement | null | undefined): void;
  getCommentNodeForTarget(target: EventTarget | null | undefined): HTMLElement | null;
  isCommentEditorTarget(target: EventTarget | null | undefined): boolean;
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
  openLink
}: CreateAnnotationSidebarAdapterOptions = {}): AnnotationSidebarAdapter {
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
      return node?.getAttribute(SOURCE_ATTRIBUTE) ?? readSourceText(getSourceNode(node));
    },

    applyRenderedHtml(node: HTMLElement | null | undefined, html: string) {
      if (!node || this.isEditable(node)) {
        return;
      }

      // Keep Zotero's source DOM intact; the attribute is only a render cache.
      if (!this.isRendered(node)) {
        node.setAttribute(SOURCE_ATTRIBUTE, readSourceText(getSourceNode(node)));
      }

      const preview = getPreviewNode(node) ?? createPreviewNode(node, this);

      preview.removeAttribute(PREVIEW_PLACEHOLDER_ATTRIBUTE);

      if (preview.innerHTML === html) {
        hideSourceNode(node);
        showPreviewNode(preview);
        return;
      }

      preview.innerHTML = html;
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

      // Remove only plugin-owned DOM so disable/re-enable restores the host view.
      for (const preview of queryHtmlElements(
        queryRoot,
        `[${PREVIEW_ATTRIBUTE}='true'], .annotation-markdown-rendered`
      )) {
        preview.remove();
      }

      for (const node of queryHtmlElements(
        queryRoot,
        `[${RENDERED_ATTRIBUTE}], [${SOURCE_ATTRIBUTE}], [${SUPPRESS_UNTIL_ATTRIBUTE}], .${EDITING_CLASS}`
      )) {
        node.classList.remove(EDITING_CLASS);
        node.removeAttribute(RENDERED_ATTRIBUTE);
        node.removeAttribute(SOURCE_ATTRIBUTE);
        node.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);

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
        return;
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

    openLink: typeof openLink === "function" ? openLink : null
  };
}

type QueryRoot = Node & ParentNode;

function getQueryRoot(root: Node | null | undefined): QueryRoot | null {
  if (!root || typeof (root as ParentNode).querySelectorAll !== "function") {
    return null;
  }
  return root as QueryRoot;
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
    adapter.showSourceForEditing(sourceNode);
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
  placeholder.addEventListener("mousedown", () => {
    adapter.showSourceForEditing(sourceNode);
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

  const nestedContent = node.querySelector(".content");
  if (isHTMLElement(nestedContent)) {
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
  node?.setAttribute(SOURCE_ATTRIBUTE, readSourceText(getSourceNode(node)));
  node?.classList.remove(EDITING_CLASS);
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
