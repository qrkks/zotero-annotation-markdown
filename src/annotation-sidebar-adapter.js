const COMMENT_SELECTORS = [
  "[data-annotation-comment]",
  ".annotation-comment",
  ".comment"
];

const ANNOTATION_ROW_SELECTOR = "[data-annotation-id], .annotation, .annotation-row";
const RENDERED_ATTRIBUTE = "data-annotation-markdown-rendered";
const SOURCE_ATTRIBUTE = "data-annotation-markdown-source";

export function createAnnotationSidebarAdapter({ document: documentRef = globalThis.document } = {}) {
  return {
    findCommentNodes(root = documentRef) {
      if (!root?.querySelectorAll) {
        return [];
      }

      return Array.from(root.querySelectorAll(COMMENT_SELECTORS.join(",")))
        .filter((node) => node.closest(ANNOTATION_ROW_SELECTOR))
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

      node.innerHTML = html;
      node.classList?.add("annotation-markdown-rendered");
      node.setAttribute(RENDERED_ATTRIBUTE, "true");
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

    isRendered(node) {
      return node?.getAttribute?.(RENDERED_ATTRIBUTE) === "true";
    }
  };
}
