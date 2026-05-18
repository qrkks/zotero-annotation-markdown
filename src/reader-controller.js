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
  let safetyTimer;
  const root = getReaderRoot(reader);
  const documentRef = root?.ownerDocument ?? reader?.document ?? globalThis.document;
  const windowRef = documentRef?.defaultView ?? globalThis.window;

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
      const readyPromise = getReaderReadyPromise();
      if (readyPromise) {
        return readyPromise.then(() => {
          startNow(() => this.renderNow());
        });
      }

      startNow(() => this.renderNow());
      return Promise.resolve();
    },

    renderNow() {
      const nodes = adapter.findCommentNodes(root);
      logger?.log?.(`[annotation-markdown] render pass nodes: ${nodes.length}`);

      if (nodes.length === 0) {
        logger?.log?.(`[annotation-markdown] zero-node DOM summary: ${summarizeDom(root)}`);
      } else {
        logger?.log?.(`[annotation-markdown] matched nodes: ${summarizeNodes(adapter, nodes)}`);
      }

      for (const node of nodes) {
        renderNode(node);
      }
    },

    stop() {
      observer?.disconnect();
      observer = undefined;
      if (safetyTimer && windowRef?.clearTimeout) {
        windowRef.clearTimeout(safetyTimer);
      }
      safetyTimer = undefined;
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

  function startNow(renderNow) {
    injectStyles();
    adapter.clearRenderedState?.(root);
    renderNow();

    if (root && MutationObserverRef && !observer) {
      observer = new MutationObserverRef((mutations) => {
        if (mutationNeedsSyncScan(mutations)) {
          renderNow();
        }
        scheduleSafetyScan(80);
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
  }

  function getReaderReadyPromise() {
    if (typeof reader?._waitForReader === "function") {
      return reader._waitForReader();
    }

    if (reader?._initPromise) {
      return reader._initPromise;
    }

    return null;
  }

  function scheduleSafetyScan(delay) {
    if (!windowRef?.setTimeout) {
      renderNowInternal();
      return;
    }

    if (safetyTimer) {
      windowRef.clearTimeout(safetyTimer);
    }

    safetyTimer = windowRef.setTimeout(() => {
      safetyTimer = undefined;
      renderNowInternal();
    }, delay);
  }

  function renderNowInternal() {
    const nodes = adapter.findCommentNodes(root);
    for (const node of nodes) {
      renderNode(node);
    }
  }
}

function mutationNeedsSyncScan(mutations = []) {
  return mutations.some((mutation) => Array.from(mutation.addedNodes ?? []).some((node) => (
    node.nodeType === 1 &&
    (node.matches?.(".annotation-row, .annotation, .comment") ||
      node.querySelector?.(".annotation-row .comment, .annotation .comment, [data-annotation-id] .comment"))
  )));
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

function summarizeDom(root) {
  if (!root?.querySelectorAll) {
    return "no root";
  }

  return Array.from(root.querySelectorAll("[class], [data-annotation-id], [data-id], [data-key]"))
    .slice(0, 80)
    .map((node) => {
      const tag = node.tagName?.toLowerCase?.() ?? "node";
      const className = node.getAttribute?.("class");
      const dataAnnotationId = node.getAttribute?.("data-annotation-id");
      const dataId = node.getAttribute?.("data-id");
      const dataKey = node.getAttribute?.("data-key");
      return [
        tag,
        className ? `.${String(className).trim().replace(/\s+/g, ".")}` : "",
        dataAnnotationId ? `[data-annotation-id=${dataAnnotationId}]` : "",
        dataId ? `[data-id=${dataId}]` : "",
        dataKey ? `[data-key=${dataKey}]` : ""
      ].join("");
    })
    .join(" ");
}

function summarizeNodes(adapter, nodes) {
  return nodes
    .slice(0, 12)
    .map((node) => {
      const tag = node.tagName?.toLowerCase?.() ?? "node";
      const className = node.getAttribute?.("class");
      const source = adapter.getSourceText(node)
        .replaceAll("\r", "\\r")
        .replaceAll("\n", "\\n")
        .replace(/\s+/g, " ")
        .slice(0, 300);
      return `${tag}${className ? `.${String(className).trim().replace(/\s+/g, ".")}` : ""}="${source}"`;
    })
    .join(" | ");
}
