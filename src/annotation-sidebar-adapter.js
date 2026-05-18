const COMMENT_SELECTORS = [
  ".annotations .annotation .text .editor.read-only .content .renderer",
  "[data-annotation-comment]",
  ".annotation-comment",
  ".comment"
];

const ANNOTATION_ROW_SELECTOR = "[data-annotation-id], .annotation, .annotation-row";
const RENDERED_ATTRIBUTE = "data-annotation-markdown-rendered";
const SOURCE_ATTRIBUTE = "data-annotation-markdown-source";
const SUPPRESS_UNTIL_ATTRIBUTE = "data-annotation-markdown-suppress-until";
const PREVIEW_ATTRIBUTE = "data-annotation-markdown-preview";
const SOURCE_WRAPPER_ATTRIBUTE = "data-annotation-markdown-source-node";
const EDITING_CLASS = "annotation-markdown-editing";

export function createAnnotationSidebarAdapter({ document: documentRef = globalThis.document } = {}) {
  return {
    findCommentNodes(root = documentRef) {
      if (!root?.querySelectorAll) {
        return [];
      }

      return Array.from(root.querySelectorAll(COMMENT_SELECTORS.join(",")))
        .filter((node) => node.closest(ANNOTATION_ROW_SELECTOR))
        .filter((node) => !this.isEditable(node))
        .filter((node) => !this.isSuppressed(node));
    },

    isEditable(node) {
      if (!node) {
        return true;
      }

      if (node.classList?.contains(EDITING_CLASS)) {
        if (hasFocusInside(node) || hasEditorControl(node)) {
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

      return hasEditorControl(node);
    },

    getSourceText(node) {
      return node?.getAttribute?.(SOURCE_ATTRIBUTE) ?? getSourceNode(node)?.textContent ?? "";
    },

    applyRenderedHtml(node, html) {
      if (!node || this.isEditable(node)) {
        return;
      }

      if (!this.isRendered(node)) {
        node.setAttribute(SOURCE_ATTRIBUTE, getSourceNode(node)?.textContent ?? "");
      }

      const preview = getPreviewNode(node) ?? createPreviewNode(node, this);

      if (preview.innerHTML === html) {
        hideSourceNode(node);
        preview.hidden = false;
        return;
      }

      preview.innerHTML = html;
      hideSourceNode(node);
      preview.hidden = false;
      node.setAttribute(RENDERED_ATTRIBUTE, "true");
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
        sourceNode.hidden = false;
      }
      getPreviewNode(node)?.remove();
      unwrapSourceNode(node);
      node.classList?.remove(EDITING_CLASS);
      node.removeAttribute(RENDERED_ATTRIBUTE);
      node.removeAttribute(SOURCE_ATTRIBUTE);
      node.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);
    },

    clearRenderedState(root = documentRef) {
      if (!root?.querySelectorAll) {
        return;
      }

      for (const preview of root.querySelectorAll(`[${PREVIEW_ATTRIBUTE}='true']`)) {
        preview.remove();
      }

      for (const node of root.querySelectorAll(`[${RENDERED_ATTRIBUTE}], [${SOURCE_ATTRIBUTE}], [${SUPPRESS_UNTIL_ATTRIBUTE}], .${EDITING_CLASS}`)) {
        node.classList?.remove(EDITING_CLASS);
        node.removeAttribute(RENDERED_ATTRIBUTE);
        node.removeAttribute(SOURCE_ATTRIBUTE);
        node.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);

        const sourceNode = getSourceNode(node);
        if (sourceNode && sourceNode !== node) {
          sourceNode.hidden = false;
        }
        unwrapSourceNode(node);
      }
    },

    showSourceForEditing(node) {
      if (!canEnterEditing(node)) {
        return;
      }

      const sourceNode = getSourceNode(node);
      const preview = getPreviewNode(node);

      if (sourceNode) {
        sourceNode.hidden = false;
      }

      if (preview) {
        preview.hidden = true;
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
    }
  };
}

function createPreviewNode(sourceNode, adapter) {
  const preview = sourceNode.ownerDocument.createElement("div");
  preview.className = "annotation-markdown-rendered";
  preview.setAttribute(PREVIEW_ATTRIBUTE, "true");
  preview.addEventListener("mousedown", () => {
    adapter.showSourceForEditing(sourceNode);
  }, { capture: true });
  sourceNode.append(preview);
  return preview;
}

function getPreviewNode(sourceNode) {
  return Array.from(sourceNode?.children ?? [])
    .find((child) => child.getAttribute?.(PREVIEW_ATTRIBUTE) === "true") ?? null;
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

  return node;
}

function hideSourceNode(node) {
  const sourceNode = ensureSourceNode(node);
  if (sourceNode !== node) {
    sourceNode.hidden = true;
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
  node?.setAttribute?.(SOURCE_ATTRIBUTE, getSourceNode(node)?.textContent ?? "");
  node?.classList?.remove(EDITING_CLASS);
  node?.removeAttribute?.(SUPPRESS_UNTIL_ATTRIBUTE);
}

function hasFocusInside(node) {
  const activeElement = node?.ownerDocument?.activeElement;
  return Boolean(activeElement && activeElement !== node.ownerDocument.body && node.contains(activeElement));
}

function hasEditorControl(node) {
  return Boolean(node?.querySelector?.("textarea,input,select,[contenteditable='true']"));
}
