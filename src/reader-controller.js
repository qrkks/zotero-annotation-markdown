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
  let pasteHandler;
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

    refresh() {
      injectStyles();
      this.renderNow();
    },

    stop() {
      observer?.disconnect();
      observer = undefined;
      if (safetyTimer && windowRef?.clearTimeout) {
        windowRef.clearTimeout(safetyTimer);
      }
      safetyTimer = undefined;
      if (pasteHandler && root?.removeEventListener) {
        root.removeEventListener("paste", pasteHandler, true);
      }
      pasteHandler = undefined;
      styleElement?.remove();
      styleElement = undefined;
    }
  };

  function injectStyles() {
    if (!styleText || !documentRef?.head) {
      return;
    }

    if (!styleElement) {
      styleElement = documentRef.createElement("style");
      styleElement.setAttribute("data-annotation-markdown-style", "true");
      documentRef.head.append(styleElement);
    }

    styleElement.textContent = `${styleText}\n${createFontScaleStyle(settings.getFontScale?.() ?? 1)}`;
  }

  function startNow(renderNow) {
    injectStyles();
    registerPasteHandler();
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

  function registerPasteHandler() {
    if (!root?.addEventListener || pasteHandler) {
      return;
    }

    pasteHandler = (event) => {
      handlePlainTextPaste(event, adapter, settings, documentRef);
    };
    root.addEventListener("paste", pasteHandler, true);
  }
}

function createFontScaleStyle(fontScale) {
  return `.annotation-markdown-rendered { --annotation-markdown-font-scale: ${fontScale}em; }`;
}

function handlePlainTextPaste(event, adapter, settings, documentRef) {
  if (!settings.isPlainTextPasteEnabled?.()) {
    return;
  }

  if (!adapter.isCommentEditorTarget?.(event.target)) {
    return;
  }

  const text = event.clipboardData?.getData?.("text/plain");
  if (typeof text !== "string" || text.length === 0) {
    return;
  }

  if (insertPlainText(event.target, text, documentRef)) {
    event.preventDefault?.();
  }
}

function insertPlainText(target, text, documentRef) {
  const targetElement = getElementTarget(target);
  const editor = targetElement?.closest?.("textarea,input,[contenteditable='true'],[tabindex]");
  if (!editor) {
    return false;
  }

  if (editor.matches?.("textarea,input")) {
    insertIntoTextControl(editor, text, documentRef);
    return true;
  }

  insertIntoEditableElement(editor, text, documentRef);
  return true;
}

function insertIntoTextControl(control, text, documentRef) {
  const start = Number.isInteger(control.selectionStart) ? control.selectionStart : String(control.value ?? "").length;
  const end = Number.isInteger(control.selectionEnd) ? control.selectionEnd : start;

  if (typeof control.setRangeText === "function") {
    control.setRangeText(text, start, end, "end");
  } else {
    const value = String(control.value ?? "");
    control.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  }

  dispatchInputEvent(control, text, documentRef);
}

function insertIntoEditableElement(editor, text, documentRef) {
  const doc = editor.ownerDocument ?? documentRef;
  if (typeof doc?.execCommand === "function" && doc.execCommand("insertText", false, text)) {
    dispatchInputEvent(editor, text, doc);
    return;
  }

  const selection = doc?.defaultView?.getSelection?.();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;

  if (range && editor.contains(range.commonAncestorContainer)) {
    range.deleteContents();
    range.insertNode(doc.createTextNode(text));
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    editor.append(doc.createTextNode(text));
  }

  dispatchInputEvent(editor, text, doc);
}

function dispatchInputEvent(target, text, documentRef) {
  const InputEventRef = documentRef?.defaultView?.InputEvent ?? globalThis.InputEvent;
  const EventRef = documentRef?.defaultView?.Event ?? globalThis.Event;
  const event = typeof InputEventRef === "function"
    ? new InputEventRef("input", { bubbles: true, inputType: "insertFromPaste", data: text })
    : new EventRef("input", { bubbles: true });
  target.dispatchEvent?.(event);
}

function getElementTarget(target) {
  if (!target) {
    return null;
  }

  return target.nodeType === 1 ? target : target.parentElement;
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
