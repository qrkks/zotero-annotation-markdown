export function createReaderController({
  reader,
  adapter,
  renderer,
  settings,
  MutationObserver: MutationObserverRef = globalThis.MutationObserver,
  styleText = "",
  logger
}) {
  let observer;
  let styleElement;
  const root = getReaderRoot(reader);
  const documentRef = root?.ownerDocument ?? reader?.document ?? globalThis.document;

  function renderNode(node) {
    try {
      if (!settings.isEnabled()) {
        if (adapter.isRendered(node)) {
          adapter.restoreSourceText(node);
        }
        return;
      }

      if (adapter.isEditable(node)) {
        return;
      }

      const source = adapter.getSourceText(node);
      const html = renderer.render(source);
      adapter.applyRenderedHtml(node, html);
    } catch {
      if (adapter.isRendered(node)) {
        adapter.restoreSourceText(node);
      }
    }
  }

  return {
    start() {
      injectStyles();
      this.renderNow();

      if (root && MutationObserverRef && !observer) {
        observer = new MutationObserverRef(() => this.renderNow());
        observer.observe(root, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }
    },

    renderNow() {
      const nodes = adapter.findCommentNodes(root);
      logger?.log?.(`[annotation-markdown] render pass nodes: ${nodes.length}`);

      for (const node of nodes) {
        renderNode(node);
      }
    },

    stop() {
      observer?.disconnect();
      observer = undefined;
      styleElement?.remove();
      styleElement = undefined;
    }
  };

  function injectStyles() {
    if (!styleText || styleElement || !documentRef?.head) {
      return;
    }

    styleElement = documentRef.createElement("style");
    styleElement.setAttribute("data-annotation-markdown-style", "true");
    styleElement.textContent = styleText;
    documentRef.head.append(styleElement);
  }
}

function getReaderRoot(reader) {
  return (
    reader?.document?.body ??
    reader?.document ??
    reader?.window?.document?.body ??
    reader?._iframeWindow?.document?.body ??
    null
  );
}
