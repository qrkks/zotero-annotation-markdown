const COMMENT_SELECTORS = [
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

export function createAnnotationSidebarAdapter({
  document: documentRef = globalThis.document,
  openLink
} = {}) {
  return {
    findCommentNodes(root = documentRef) {
      if (!root?.querySelectorAll) {
        return [];
      }

      const candidates = [];
      if (root.nodeType === 1 && root.matches?.(COMMENT_SELECTORS.join(","))) {
        candidates.push(root);
      }
      candidates.push(...Array.from(root.querySelectorAll(COMMENT_SELECTORS.join(","))));

      return candidates
        .filter((node) => node.closest(ANNOTATION_ROW_SELECTOR))
        .filter((node) => !isInsideNativeNoteEditor(node))
        .filter((node) => !this.isEditable(node))
        .filter((node) => !this.isSuppressed(node));
    },

    findRenderedCommentNodes(root = documentRef) {
      if (!root?.querySelectorAll) {
        return [];
      }

      const candidates = [];
      if (root.nodeType === 1 && root.getAttribute?.(RENDERED_ATTRIBUTE) === "true") {
        candidates.push(root);
      }
      candidates.push(...Array.from(root.querySelectorAll(`[${RENDERED_ATTRIBUTE}='true']`)));
      return candidates.filter((node) => !isInsideNativeNoteEditor(node));
    },

    countNativeNoteEditorComments(root = documentRef) {
      if (!root?.querySelectorAll) {
        return 0;
      }

      const candidates = [];
      if (root.nodeType === 1 && root.matches?.(COMMENT_SELECTORS.join(","))) {
        candidates.push(root);
      }
      candidates.push(...Array.from(root.querySelectorAll(COMMENT_SELECTORS.join(","))));

      return candidates
        .filter((node) => node.closest(ANNOTATION_ROW_SELECTOR))
        .filter((node) => isInsideNativeNoteEditor(node))
        .length;
    },

    isEditable(node) {
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

    getSourceText(node) {
      return node?.getAttribute?.(SOURCE_ATTRIBUTE) ?? readSourceText(getSourceNode(node));
    },

    applyRenderedHtml(node, html) {
      if (!node || this.isEditable(node)) {
        return;
      }

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

    releaseRenderedHtml(node) {
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

    suspendRenderedDom(node) {
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

    restoreSuspendedRenderedDom(node, preview) {
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

    restoreSourceText(node) {
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

    restoreSourceDomForEditing(node) {
      restoreSourceDom(node);
    },

    clearRenderedState(root = documentRef) {
      if (!root?.querySelectorAll) {
        return;
      }

      for (const preview of root.querySelectorAll(`[${PREVIEW_ATTRIBUTE}='true'], .annotation-markdown-rendered`)) {
        preview.remove();
      }

      for (const node of root.querySelectorAll(`[${RENDERED_ATTRIBUTE}], [${SOURCE_ATTRIBUTE}], [${SUPPRESS_UNTIL_ATTRIBUTE}], .${EDITING_CLASS}`)) {
        node.classList?.remove(EDITING_CLASS);
        node.removeAttribute(RENDERED_ATTRIBUTE);
        node.removeAttribute(SOURCE_ATTRIBUTE);
        node.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);

        showSourceNode(getSourceContainer(node));
        showSourceNode(getSourceNode(node));
        unwrapSourceNode(node);
      }

      for (const node of root.querySelectorAll(`[${SOURCE_HIDDEN_ATTRIBUTE}='true']`)) {
        showSourceNode(node);
      }
    },

    showSourceForEditing(node) {
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
      runAfterLayout(node, () => {
        focusTarget?.focus?.({ preventScroll: true });
        placeCaretAtEnd(focusTarget);
        focusTarget?.addEventListener?.("focusout", () => finishEditing(node), { once: true });
      });
    },

    suppressRendering(node, durationMs = 1500) {
      node?.setAttribute?.(SUPPRESS_UNTIL_ATTRIBUTE, String(Date.now() + durationMs));
    },

    isSuppressed(node) {
      const suppressUntil = Number(node?.getAttribute?.(SUPPRESS_UNTIL_ATTRIBUTE) ?? 0);
      if (!suppressUntil) {
        return false;
      }

      if (Date.now() <= suppressUntil) {
        return true;
      }

      node.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);
      return false;
    },

    isRendered(node) {
      return node?.getAttribute?.(RENDERED_ATTRIBUTE) === "true";
    },

    hasPreview(node) {
      return Boolean(getPreviewNode(node));
    },

    finishEditing(node) {
      finishEditing(node);
    },

    getCommentNodeForTarget(target) {
      const element = getElementTarget(target);
      const comment = element?.closest?.(COMMENT_SELECTORS.join(","));
      if (!comment?.closest?.(ANNOTATION_ROW_SELECTOR)) {
        return null;
      }

      if (isInsideNativeNoteEditor(comment) || isInsideNativeNoteEditor(element)) {
        return null;
      }

      return comment;
    },

    isCommentEditorTarget(target) {
      const comment = this.getCommentNodeForTarget(target);
      const editor = getElementTarget(target)?.closest?.("textarea,input,[contenteditable='true'],[tabindex]");
      if (!editor) {
        return false;
      }

      return Boolean(comment);
    },

    openLink: typeof openLink === "function" ? openLink : null
  };
}

function createPreviewNode(sourceNode, adapter) {
  const preview = sourceNode.ownerDocument.createElement("div");
  preview.className = "annotation-markdown-rendered";
  preview.setAttribute(PREVIEW_ATTRIBUTE, "true");
  preview.addEventListener("mousedown", (event) => {
    const link = getElementTarget(event.target)?.closest?.("a[href]");
    if (link) {
      event.stopPropagation();
      if (event.button === 0 && adapter.openLink) {
        event.preventDefault();
        adapter.openLink(link.getAttribute("href"));
      }
      return;
    }
    adapter.showSourceForEditing(sourceNode);
  }, { capture: true });
  preview.addEventListener("click", (event) => {
    const link = getElementTarget(event.target)?.closest?.("a[href]");
    if (!link) {
      return;
    }

    event.stopPropagation();
    if (event.button !== 0 || !adapter.openLink) {
      return;
    }

    event.preventDefault();
    if (event.detail === 0) {
      adapter.openLink(link.getAttribute("href"));
    }
  }, { capture: true });
  getPreviewAnchor(sourceNode)?.after(preview);
  return preview;
}

function createPreviewPlaceholder(sourceNode, adapter) {
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

function getPreviewNode(sourceNode) {
  const sourceContent = getSourceNode(sourceNode);
  const siblingPreview = getSourceContainer(sourceNode, sourceContent)?.nextElementSibling;
  if (siblingPreview?.getAttribute?.(PREVIEW_ATTRIBUTE) === "true") {
    return siblingPreview;
  }

  return Array.from(sourceNode?.children ?? [])
    .find((child) => child.getAttribute?.(PREVIEW_ATTRIBUTE) === "true") ?? null;
}

function hidePreviewNode(preview) {
  if (!preview) {
    return;
  }

  preview.hidden = true;
  preview.style.display = "none";
  preview.setAttribute(PREVIEW_HIDDEN_ATTRIBUTE, "true");
}

function showPreviewNode(preview) {
  if (!preview) {
    return;
  }

  preview.hidden = false;
  if (preview.getAttribute?.(PREVIEW_HIDDEN_ATTRIBUTE) === "true") {
    preview.style.display = "";
    preview.removeAttribute(PREVIEW_HIDDEN_ATTRIBUTE);
  }
}

function getSourceNode(node) {
  if (!node) {
    return null;
  }

  const existingWrapper = Array.from(node.children ?? [])
    .find((child) => child.getAttribute?.(SOURCE_WRAPPER_ATTRIBUTE) === "true");
  if (existingWrapper) {
    return existingWrapper;
  }

  const directContent = Array.from(node.children ?? [])
    .find((child) => child.classList?.contains("content"));
  if (directContent) {
    return directContent;
  }

  const nestedContent = node.querySelector?.(".content");
  if (nestedContent) {
    return nestedContent;
  }

  return node;
}

function hideSourceNode(node) {
  const sourceNode = ensureSourceNode(node);
  const sourceContainer = getSourceContainer(node, sourceNode);
  if (sourceContainer !== node) {
    sourceContainer.hidden = true;
    sourceContainer.style.display = "none";
    sourceContainer.setAttribute(SOURCE_HIDDEN_ATTRIBUTE, "true");
  }
}

function showSourceNode(sourceNode) {
  if (!sourceNode) {
    return;
  }

  sourceNode.hidden = false;
  if (sourceNode.getAttribute?.(SOURCE_HIDDEN_ATTRIBUTE) === "true") {
    sourceNode.style.display = "";
    sourceNode.removeAttribute(SOURCE_HIDDEN_ATTRIBUTE);
  }
}

function ensureSourceNode(node) {
  const sourceNode = getSourceNode(node);
  if (sourceNode !== node) {
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

function getPreviewAnchor(node) {
  const sourceNode = ensureSourceNode(node);
  return getSourceContainer(node, sourceNode);
}

function getSourceContainer(node, sourceNode = getSourceNode(node)) {
  if (!sourceNode) {
    return null;
  }

  const expandableEditor = sourceNode.closest?.(".expandable-editor");
  if (expandableEditor && node?.contains?.(expandableEditor)) {
    return expandableEditor;
  }

  return sourceNode;
}

function unwrapSourceNode(node) {
  const sourceWrapper = Array.from(node?.children ?? [])
    .find((child) => child.getAttribute?.(SOURCE_WRAPPER_ATTRIBUTE) === "true");

  if (!sourceWrapper) {
    return;
  }

  sourceWrapper.replaceWith(...Array.from(sourceWrapper.childNodes));
}

function getFocusTarget(node, sourceNode) {
  return (
    sourceNode?.matches?.("[tabindex],textarea,input,select,[contenteditable='true']")
      ? sourceNode
      : sourceNode?.querySelector?.("[tabindex],textarea,input,select,[contenteditable='true']")
  ) ?? (
    node?.matches?.("[tabindex]")
      ? node
      : null
  );
}

function restoreSourceDom(node) {
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

function canEnterEditing(node) {
  if (node?.closest?.(".annotation-popup")) {
    return true;
  }

  const annotation = node?.closest?.(".annotation, .annotation-row");
  return Boolean(annotation?.classList?.contains("selected"));
}

function runAfterLayout(node, callback) {
  const windowRef = node?.ownerDocument?.defaultView ?? globalThis;
  const requestFrame = windowRef?.requestAnimationFrame ?? globalThis.requestAnimationFrame;

  if (typeof requestFrame === "function") {
    requestFrame.call(windowRef, callback);
    return;
  }

  callback();
}

function placeCaretAtEnd(node) {
  const documentRef = node?.ownerDocument;
  const selection = documentRef?.defaultView?.getSelection?.();
  if (!node || !selection || !documentRef?.createRange) {
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

function finishEditing(node) {
  node?.setAttribute?.(SOURCE_ATTRIBUTE, readSourceText(getSourceNode(node)));
  node?.classList?.remove(EDITING_CLASS);
  node?.removeAttribute?.(SUPPRESS_UNTIL_ATTRIBUTE);
}

function readSourceText(node) {
  if (!node) {
    return "";
  }

  const output = [];
  const walk = (current) => {
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

    const tag = current.tagName?.toUpperCase?.() ?? "";
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

function hasFocusInside(node) {
  const activeElement = node?.ownerDocument?.activeElement;
  return Boolean(activeElement && activeElement !== node.ownerDocument.body && node.contains(activeElement));
}

function hasEditorControl(node) {
  return Boolean(node?.querySelector?.("textarea,input,select,[contenteditable='true']"));
}

function hasDormantSelectedAnnotationEditor(node) {
  const annotation = node?.closest?.(ANNOTATION_ROW_SELECTOR);
  const selected = annotation?.classList?.contains("selected") || annotation?.getAttribute?.("aria-selected") === "true";
  if (!selected) {
    return false;
  }

  const controls = Array.from(node.querySelectorAll?.("textarea,input,select,[contenteditable='true']") ?? []);
  return controls.length > 0 && controls.every((control) =>
    control.matches?.(".content[contenteditable='true']")
  );
}

function isInsideNativeNoteEditor(node) {
  return Boolean(
    node?.closest?.(NATIVE_NOTE_EDITOR_SELECTOR) ||
    node?.querySelector?.(NATIVE_NOTE_EDITOR_SELECTOR)
  );
}

function getElementTarget(target) {
  if (!target) {
    return null;
  }

  return target.nodeType === 1 ? target : target.parentElement;
}
