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
  let renderNowCallback;
  let editPauseStartedAt = 0;
  let pausedMutationDiagnosticsTimer;
  let pausedMutationDiagnostics;
  let observedComments = new WeakSet();
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
        logEditLifecycle("renderNow skipped while paused");
        return;
      }

      const diagnosticsEnabled = isPerformanceDiagnosticsEnabled();
      const startedAt = diagnosticsEnabled ? now() : 0;
      const nodes = adapter.findCommentNodes(root);
      const nativeNoteEditorComments = diagnosticsEnabled
        ? adapter.countNativeNoteEditorComments?.(root) ?? 0
        : 0;
      const result = handleCommentNodes(nodes);

      if (diagnosticsEnabled) {
        logRenderDiagnostics("renderNow", nodes, result, startedAt, nativeNoteEditorComments);

        if (nativeNoteEditorComments > 0) {
          logger?.log?.(`[annotation-markdown] skipped native note editor comments: ${nativeNoteEditorComments}`);
        }

        if (nodes.length === 0) {
          logger?.log?.(`[annotation-markdown] zero-node DOM summary: ${summarizeDom(root)}`);
        } else {
          logger?.log?.(`[annotation-markdown] matched nodes: ${summarizeNodes(adapter, nodes)}`);
        }
      }
    },

    refresh() {
      injectStyles();
      if (observer) {
        observer.disconnect();
        observer = undefined;
      }
      this.renderNow();
      registerMutationObserver(() => this.renderNow());
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
      if (pausedMutationDiagnosticsTimer && windowRef?.clearTimeout) {
        windowRef.clearTimeout(pausedMutationDiagnosticsTimer);
      }
      pausedMutationDiagnosticsTimer = undefined;
      pausedMutationDiagnostics = undefined;
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
    renderNowCallback = renderNow;
    injectStyles();
    registerPasteHandler();
    registerEditingPauseHandlers();
    adapter.clearRenderedState?.(root);
    renderNow();
    registerMutationObserver(renderNow);
  }

  function registerMutationObserver(renderNow) {
    if (isRenderingPaused()) {
      return;
    }

    if (root && MutationObserverRef && !observer) {
      observer = new MutationObserverRef((mutations) => {
        if (isRenderingPaused()) {
          recordPausedMutations(mutations);
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
        characterData: false,
        ...getLightweightMutationObserverOptions()
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
      const targetNodes = filterLightweightNodes(nodes, { force });
      return {
        mode: "sync",
        handled: renderNodes(targetNodes),
        filtered: nodes.length - targetNodes.length
      };
    }

    return {
      mode: "lazy",
      handled: observeCommentNodes(nodes),
      filtered: 0
    };
  }

  function renderNodes(nodes) {
    let handled = 0;
    for (const node of nodes) {
      renderNode(node);
      handled += 1;
    }
    return handled;
  }

  function canLazyRender() {
    return Boolean(root && IntersectionObserverCtor && settings.isEnabled());
  }

  function observeCommentNodes(nodes) {
    const visibilityObserverRef = getVisibilityObserver();
    if (!visibilityObserverRef) {
      return renderNodes(nodes);
    }

    let handled = 0;
    for (const node of nodes) {
      if (!observedComments.has(node)) {
        observedComments.add(node);
        visibilityObserverRef.observe(node);
        handled += 1;
      }
    }
    return handled;
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

        if (isRenderingPaused()) {
          logEditLifecycle("lazy render skipped while paused");
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
    if (activeComment && root?.contains?.(activeComment) && adapter.isCommentEditorTarget?.(documentRef.activeElement)) {
      pauseRenderingForEditing(activeComment);
    }
  }

  function pauseRenderingForEditing(comment) {
    if (pausedComment === comment) {
      return;
    }

    pausedComment = comment;
    editPauseStartedAt = now();

    if (safetyTimer && windowRef?.clearTimeout) {
      windowRef.clearTimeout(safetyTimer);
      safetyTimer = undefined;
    }

    if (editingResumeTimer && windowRef?.clearTimeout) {
      windowRef.clearTimeout(editingResumeTimer);
      editingResumeTimer = undefined;
    }

    disconnectMutationObserverForEditing();
    disconnectVisibilityObserverForEditing();
    if (adapter.restoreSourceDomForEditing) {
      adapter.restoreSourceDomForEditing(comment);
    } else {
      adapter.restoreSourceText?.(comment);
    }
    logEditLifecycle("pause");
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

    flushPausedMutationDiagnostics();
    const pausedForMs = Math.max(0, now() - editPauseStartedAt).toFixed(1);
    pausedComment = undefined;
    adapter.finishEditing?.(comment);
    const startedAt = isPerformanceDiagnosticsEnabled() ? now() : 0;
    const result = handleCommentNodes([comment], { force: true });
    if (isPerformanceDiagnosticsEnabled()) {
      logger?.log?.(
        `[annotation-markdown] edit resume pausedForMs=${pausedForMs} ` +
        `handled=${result?.handled ?? 0} durationMs=${Math.max(0, now() - startedAt).toFixed(1)}`
      );
    }
    restoreLazyObservationAfterEditing();
    registerMutationObserver(renderNowCallback);
  }

  function isRenderingPaused() {
    return Boolean(pausedComment);
  }

  function filterLightweightNodes(nodes, { force = false } = {}) {
    if (force || !isLightweightModeEnabled()) {
      return nodes;
    }

    const targetNodes = nodes.filter((node) => isLightweightRenderTarget(node, documentRef));
    const targetSet = new Set(targetNodes);
    for (const node of nodes) {
      if (!targetSet.has(node) && adapter.isRendered(node)) {
        adapter.restoreSourceText(node);
        renderCache.delete(node);
      }
    }

    return targetNodes;
  }

  function isPerformanceDiagnosticsEnabled() {
    return Boolean(settings.isPerformanceDiagnosticsEnabled?.());
  }

  function isLightweightModeEnabled() {
    return Boolean(settings.isLightweightModeEnabled?.());
  }

  function getLightweightMutationObserverOptions() {
    if (!isLightweightModeEnabled()) {
      return {};
    }

    return {
      attributes: true,
      attributeFilter: ["class", "aria-selected"]
    };
  }

  function logRenderDiagnostics(label, nodes, result, startedAt, nativeNoteEditorComments) {
    const durationMs = Math.max(0, now() - startedAt).toFixed(1);
    logger?.log?.(
      `[annotation-markdown] perf ${label} nodes=${nodes.length} handled=${result?.handled ?? 0} ` +
      `mode=${result?.mode ?? "unknown"} filtered=${result?.filtered ?? 0} ` +
      `nativeNoteEditorComments=${nativeNoteEditorComments} durationMs=${durationMs}`
    );
  }

  function disconnectMutationObserverForEditing() {
    if (!observer) {
      return;
    }

    observer.disconnect();
    observer = undefined;
  }

  function disconnectVisibilityObserverForEditing() {
    if (!visibilityObserver) {
      return;
    }

    visibilityObserver.disconnect?.();
    visibilityObserver = undefined;
    observedComments = new WeakSet();
  }

  function restoreLazyObservationAfterEditing() {
    if (!canLazyRender()) {
      return;
    }

    observeCommentNodes(adapter.findCommentNodes(root));
  }

  function logEditLifecycle(action) {
    if (!isPerformanceDiagnosticsEnabled()) {
      return;
    }

    logger?.log?.(
      `[annotation-markdown] edit ${action} ` +
      `commentNodes=${countCommentNodesForDiagnostics()} ` +
      `renderedPreviews=${countNodes("[data-annotation-markdown-preview='true']")} ` +
      `sourceNodes=${countNodes("[data-annotation-markdown-source-node='true']")}`
    );
  }

  function recordPausedMutations(mutations = []) {
    if (!isPerformanceDiagnosticsEnabled()) {
      return;
    }

    if (!pausedMutationDiagnostics) {
      pausedMutationDiagnostics = {
        batches: 0,
        mutations: 0,
        childList: 0,
        attributes: 0,
        characterData: 0,
        addedNodes: 0,
        removedNodes: 0,
        activeEditorMutations: 0,
        pluginOwnedMutations: 0
      };
    }

    pausedMutationDiagnostics.batches += 1;
    pausedMutationDiagnostics.mutations += mutations.length;
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        pausedMutationDiagnostics.childList += 1;
      } else if (mutation.type === "attributes") {
        pausedMutationDiagnostics.attributes += 1;
      } else if (mutation.type === "characterData") {
        pausedMutationDiagnostics.characterData += 1;
      }

      pausedMutationDiagnostics.addedNodes += mutation.addedNodes?.length ?? 0;
      pausedMutationDiagnostics.removedNodes += mutation.removedNodes?.length ?? 0;
      if (isMutationInsideActiveCommentEditor(mutation, documentRef)) {
        pausedMutationDiagnostics.activeEditorMutations += 1;
      }
      if (isPluginOwnedMutation(mutation)) {
        pausedMutationDiagnostics.pluginOwnedMutations += 1;
      }
    }

    schedulePausedMutationDiagnosticsFlush();
  }

  function schedulePausedMutationDiagnosticsFlush() {
    if (pausedMutationDiagnosticsTimer) {
      return;
    }

    if (!windowRef?.setTimeout) {
      flushPausedMutationDiagnostics();
      return;
    }

    pausedMutationDiagnosticsTimer = windowRef.setTimeout(() => {
      pausedMutationDiagnosticsTimer = undefined;
      flushPausedMutationDiagnostics();
    }, 250);
  }

  function flushPausedMutationDiagnostics() {
    if (!pausedMutationDiagnostics) {
      return;
    }

    const stats = pausedMutationDiagnostics;
    pausedMutationDiagnostics = undefined;
    logger?.log?.(
      `[annotation-markdown] edit paused mutations batches=${stats.batches} mutations=${stats.mutations} ` +
      `childList=${stats.childList} attributes=${stats.attributes} characterData=${stats.characterData} ` +
      `addedNodes=${stats.addedNodes} removedNodes=${stats.removedNodes} ` +
      `activeEditorMutations=${stats.activeEditorMutations} pluginOwnedMutations=${stats.pluginOwnedMutations}`
    );
  }

  function countCommentNodesForDiagnostics() {
    try {
      return adapter.findCommentNodes?.(root)?.length ?? 0;
    } catch {
      return 0;
    }
  }

  function countNodes(selector) {
    try {
      return root?.querySelectorAll?.(selector)?.length ?? 0;
    } catch {
      return 0;
    }
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

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
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

function isLightweightRenderTarget(node, documentRef) {
  const activeElement = documentRef?.activeElement;
  return Boolean(
    node?.contains?.(activeElement) ||
    node?.classList?.contains("annotation-markdown-editing") ||
    node?.closest?.("[data-annotation-id].selected, .annotation.selected, .annotation-row.selected, [aria-selected='true']")
  );
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
