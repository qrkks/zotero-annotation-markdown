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

export function createAnnotationSidebarAdapter({ document: documentRef = globalThis.document } = {}) {
  return {
    findCommentNodes(root = documentRef) {
      if (!root?.querySelectorAll) {
        return [];
      }

      return Array.from(root.querySelectorAll(COMMENT_SELECTORS.join(",")))
        .filter((node) => node.closest(ANNOTATION_ROW_SELECTOR))
        .filter((node) => !this.isSuppressed(node))
        .filter((node) => !this.isEditable(node));
    },

    isEditable(node) {
      if (!node) {
        return true;
      }

      if (node.matches?.("textarea,input,select")) {
        return true;
      }

      if (node.getAttribute?.("contenteditable") === "true") {
        return true;
      }

      return Boolean(node.querySelector?.("textarea,input,select,[contenteditable='true']"));
    },

    getSourceText(node) {
      return node?.getAttribute?.(SOURCE_ATTRIBUTE) ?? node?.textContent ?? "";
    },

    applyRenderedHtml(node, html) {
      if (!node || this.isEditable(node)) {
        return;
      }

      if (!this.isRendered(node)) {
        node.setAttribute(SOURCE_ATTRIBUTE, node.textContent ?? "");
      }

      if (node.innerHTML === html) {
        return;
      }

      node.innerHTML = html;
      node.classList?.add("annotation-markdown-rendered");
      node.setAttribute(RENDERED_ATTRIBUTE, "true");
      attachEditRestoreHandler(node, this);
    },

    restoreSourceText(node) {
      if (!node) {
        return;
      }

      const source = this.getSourceText(node);
      node.textContent = source;
      node.classList?.remove("annotation-markdown-rendered");
      node.removeAttribute(RENDERED_ATTRIBUTE);
      node.removeAttribute(SOURCE_ATTRIBUTE);
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

function attachEditRestoreHandler(node, adapter) {
  if (node.__annotationMarkdownEditRestoreAttached) {
    return;
  }

  node.__annotationMarkdownEditRestoreAttached = true;
  node.addEventListener("mousedown", () => {
    if (!adapter.isRendered(node)) {
      return;
    }

    adapter.suppressRendering(node);
    adapter.restoreSourceText(node);
  }, { capture: true });
}
