export function createReaderController({
  reader,
  adapter,
  renderer,
  settings,
  MutationObserver: MutationObserverRef = globalThis.MutationObserver,
  IntersectionObserver: IntersectionObserverRef,
  styleText = "",
  logger
}) {
  let observer;
  let visibilityObserver;
  let styleElement;
  let safetyTimer;
  let pasteHandler;
  let focusInHandler;
  let focusOutHandler;
  let editingResumeTimer;
  let pausedComment;
  const observedComments = new WeakSet();
  const renderCache = new WeakMap();
  const root = getReaderRoot(reader);
  const documentRef = root?.ownerDocument ?? reader?.document ?? globalThis.document;
  const windowRef = documentRef?.defaultView ?? globalThis.window;
  const IntersectionObserverCtor = IntersectionObserverRef ?? windowRef?.IntersectionObserver ?? globalThis.IntersectionObserver;

  function renderNode(node) {
    try {
      if (!settings.isEnabled()) {
        if (adapter.isRendered(node)) {
          adapter.restoreSourceText(node);
        }
        renderCache.delete(node);
        return;
      }

      if (adapter.isEditable(node)) {
        return;
      }

      const source = adapter.getSourceText(node);
      const mathEnabled = Boolean(settings.isMathEnabled?.() ?? true);
      const cached = renderCache.get(node);
      if (cached?.source === source && cached?.mathEnabled === mathEnabled) {
        adapter.applyRenderedHtml(node, cached.html);
        return;
      }

      const html = renderer.render(source);
      renderCache.set(node, { source, mathEnabled, html });
      adapter.applyRenderedHtml(node, html);
    } catch {
      if (adapter.isRendered(node)) {
        adapter.restoreSourceText(node);
      }
      renderCache.delete(node);
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
      if (isRenderingPaused()) {
        return;
      }

      const nodes = adapter.findCommentNodes(root);
      logger?.log?.(`[annotation-markdown] render pass nodes: ${nodes.length}`);
      const nativeNoteEditorComments = adapter.countNativeNoteEditorComments?.(root) ?? 0;
      if (nativeNoteEditorComments > 0) {
        logger?.log?.(`[annotation-markdown] skipped native note editor comments: ${nativeNoteEditorComments}`);
      }

      if (nodes.length === 0) {
        logger?.log?.(`[annotation-markdown] zero-node DOM summary: ${summarizeDom(root)}`);
      } else {
        logger?.log?.(`[annotation-markdown] matched nodes: ${summarizeNodes(adapter, nodes)}`);
      }

      handleCommentNodes(nodes);
    },

    refresh() {
      injectStyles();
      this.renderNow();
    },

    stop() {
      observer?.disconnect();
      observer = undefined;
      visibilityObserver?.disconnect?.();
      visibilityObserver = undefined;
      if (safetyTimer && windowRef?.clearTimeout) {
        windowRef.clearTimeout(safetyTimer);
      }
      safetyTimer = undefined;
      if (pasteHandler && root?.removeEventListener) {
        root.removeEventListener("paste", pasteHandler, true);
      }
      pasteHandler = undefined;
      if (focusInHandler && root?.removeEventListener) {
        root.removeEventListener("focusin", focusInHandler, true);
      }
      focusInHandler = undefined;
      if (focusOutHandler && root?.removeEventListener) {
        root.removeEventListener("focusout", focusOutHandler, true);
      }
      focusOutHandler = undefined;
      if (editingResumeTimer && windowRef?.clearTimeout) {
        windowRef.clearTimeout(editingResumeTimer);
      }
      editingResumeTimer = undefined;
      pausedComment = undefined;
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
    registerEditingPauseHandlers();
    adapter.clearRenderedState?.(root);
    renderNow();

    if (root && MutationObserverRef && !observer) {
      observer = new MutationObserverRef((mutations) => {
        if (isRenderingPaused()) {
          return;
        }

        if (mutations.length > 0 && mutations.every((mutation) => isMutationInsideActiveCommentEditor(mutation, documentRef))) {
          return;
        }

        const syncNodes = findSyncMutationCommentNodes(mutations, adapter);
        if (syncNodes.length > 0) {
          handleCommentNodes(syncNodes);
          return;
        }

        if (mutationNeedsSafetyScan(mutations, documentRef)) {
          scheduleSafetyScan(80);
        }
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: false
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
    if (isRenderingPaused()) {
      return;
    }

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
    if (isRenderingPaused()) {
      return;
    }

    const nodes = adapter.findCommentNodes(root);
    handleCommentNodes(nodes);
  }

  function handleCommentNodes(nodes, { force = false } = {}) {
    if (force || !canLazyRender()) {
      renderNodes(nodes);
      return;
    }

    observeCommentNodes(nodes);
  }

  function renderNodes(nodes) {
    for (const node of nodes) {
      renderNode(node);
    }
  }

  function canLazyRender() {
    return Boolean(root && IntersectionObserverCtor && settings.isEnabled());
  }

  function observeCommentNodes(nodes) {
    const visibilityObserverRef = getVisibilityObserver();
    if (!visibilityObserverRef) {
      renderNodes(nodes);
      return;
    }

    for (const node of nodes) {
      if (!observedComments.has(node)) {
        observedComments.add(node);
        visibilityObserverRef.observe(node);
      }
    }
  }

  function getVisibilityObserver() {
    if (visibilityObserver || !IntersectionObserverCtor) {
      return visibilityObserver;
    }

    visibilityObserver = new IntersectionObserverCtor((entries) => {
      for (const entry of entries ?? []) {
        if (!entry?.isIntersecting) {
          continue;
        }

        visibilityObserver?.unobserve?.(entry.target);
        renderNode(entry.target);
      }
    }, {
      root: null,
      rootMargin: "600px 0px",
      threshold: 0
    });

    return visibilityObserver;
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

  function registerEditingPauseHandlers() {
    if (!root?.addEventListener || focusInHandler || focusOutHandler) {
      return;
    }

    focusInHandler = (event) => {
      const comment = adapter.getCommentNodeForTarget?.(event.target);
      if (comment && adapter.isCommentEditorTarget?.(event.target)) {
        pauseRenderingForEditing(comment);
      }
    };

    focusOutHandler = (event) => {
      if (!pausedComment || !pausedComment.contains?.(event.target)) {
        return;
      }

      scheduleEditingResume(pausedComment);
    };

    root.addEventListener("focusin", focusInHandler, true);
    root.addEventListener("focusout", focusOutHandler, true);

    const activeComment = adapter.getCommentNodeForTarget?.(documentRef?.activeElement);
    if (activeComment && adapter.isCommentEditorTarget?.(documentRef.activeElement)) {
      pauseRenderingForEditing(activeComment);
    }
  }

  function pauseRenderingForEditing(comment) {
    pausedComment = comment;

    if (safetyTimer && windowRef?.clearTimeout) {
      windowRef.clearTimeout(safetyTimer);
      safetyTimer = undefined;
    }

    if (editingResumeTimer && windowRef?.clearTimeout) {
      windowRef.clearTimeout(editingResumeTimer);
      editingResumeTimer = undefined;
    }
  }

  function scheduleEditingResume(comment) {
    if (!windowRef?.setTimeout) {
      resumeRenderingAfterEditing(comment);
      return;
    }

    if (editingResumeTimer) {
      windowRef.clearTimeout(editingResumeTimer);
    }

    editingResumeTimer = windowRef.setTimeout(() => {
      editingResumeTimer = undefined;
      resumeRenderingAfterEditing(comment);
    }, 0);
  }

  function resumeRenderingAfterEditing(comment) {
    const activeComment = adapter.getCommentNodeForTarget?.(documentRef?.activeElement);
    if (activeComment && adapter.isCommentEditorTarget?.(documentRef.activeElement)) {
      pauseRenderingForEditing(activeComment);
      return;
    }

    if (pausedComment !== comment) {
      return;
    }

    pausedComment = undefined;
    adapter.finishEditing?.(comment);
    handleCommentNodes([comment], { force: true });
  }

  function isRenderingPaused() {
    return Boolean(pausedComment);
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

function findSyncMutationCommentNodes(mutations = [], adapter) {
  const found = [];
  const seen = new Set();

  for (const mutation of mutations) {
    for (const root of Array.from(mutation.addedNodes ?? [])) {
      if (!isPotentialAddedCommentRoot(root)) {
        continue;
      }

      for (const node of adapter.findCommentNodes(root)) {
        if (!seen.has(node)) {
          seen.add(node);
          found.push(node);
        }
      }
    }
  }

  return found;
}

function isPotentialAddedCommentRoot(node) {
  return Boolean(
    node?.nodeType === 1 &&
    (
      node.matches?.(".annotation-row, .annotation, .comment, .annotation-comment, [data-annotation-id], [data-annotation-comment]") ||
      node.querySelector?.(".comment, .annotation-comment, [data-annotation-comment]")
    )
  );
}

function mutationNeedsSafetyScan(mutations = [], documentRef = globalThis.document) {
  return mutations.some((mutation) => (
    !isPluginOwnedMutation(mutation) &&
    !isMutationInsideActiveCommentEditor(mutation, documentRef) && (
      isAnnotationMutationTarget(mutation.target) ||
      Array.from(mutation.addedNodes ?? []).some(isAnnotationMutationTarget) ||
      Array.from(mutation.removedNodes ?? []).some(isAnnotationMutationTarget)
    )
  ));
}

function isPluginOwnedMutation(mutation) {
  const changedNodes = [
    ...Array.from(mutation?.addedNodes ?? []),
    ...Array.from(mutation?.removedNodes ?? [])
  ];

  return changedNodes.length > 0 && (
    changedNodes.every((node) => node.nodeType !== 1 || isPluginOwnedNode(node)) ||
    (isPluginManagedNode(mutation.target) && changedNodes.every((node) => node.nodeType !== 1 || isPluginOwnedNode(node)))
  );
}

function isPluginOwnedNode(node) {
  return Boolean(
    node?.getAttribute?.("data-annotation-markdown-preview") === "true" ||
    node?.getAttribute?.("data-annotation-markdown-source-node") === "true" ||
    node?.closest?.("[data-annotation-markdown-preview='true'], [data-annotation-markdown-source-node='true']")
  );
}

function isPluginManagedNode(node) {
  return Boolean(
    node?.getAttribute?.("data-annotation-markdown-rendered") === "true" ||
    node?.hasAttribute?.("data-annotation-markdown-source") ||
    node?.closest?.("[data-annotation-markdown-rendered='true'], [data-annotation-markdown-source]")
  );
}

function isAnnotationMutationTarget(node) {
  const element = getElementTarget(node);
  return Boolean(element?.closest?.("[data-annotation-id], .annotation, .annotation-row, .comment"));
}

function isMutationInsideActiveCommentEditor(mutation, documentRef) {
  const element = getElementTarget(mutation.target);
  const comment = element?.closest?.(".comment, .annotation-comment, [data-annotation-comment]");
  if (!comment) {
    return false;
  }

  const activeElement = documentRef?.activeElement;
  const hasFocusInside = Boolean(activeElement && activeElement !== documentRef.body && comment.contains(activeElement));
  const isEditing = comment.classList?.contains("annotation-markdown-editing");
  return hasFocusInside || isEditing;
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
