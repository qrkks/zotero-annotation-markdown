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

      const preview = getPreviewNode(node) ?? createPreviewNode(node, this);

      if (preview.innerHTML === html) {
        return;
      }

      preview.innerHTML = html;
      node.hidden = true;
      node.setAttribute(RENDERED_ATTRIBUTE, "true");
    },

    restoreSourceText(node) {
      if (!node) {
        return;
      }

      const source = this.getSourceText(node);
      node.textContent = source;
      node.hidden = false;
      getPreviewNode(node)?.remove();
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

function createPreviewNode(sourceNode, adapter) {
  const preview = sourceNode.ownerDocument.createElement("div");
  preview.className = "annotation-markdown-rendered";
  preview.setAttribute(PREVIEW_ATTRIBUTE, "true");
  preview.addEventListener("mousedown", () => {
    adapter.suppressRendering(sourceNode);
    adapter.restoreSourceText(sourceNode);
  }, { capture: true });
  sourceNode.after(preview);
  return preview;
}

function getPreviewNode(sourceNode) {
  const next = sourceNode?.nextElementSibling;
  return next?.getAttribute?.(PREVIEW_ATTRIBUTE) === "true" ? next : null;
}
