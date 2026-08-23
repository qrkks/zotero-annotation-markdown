/**
 * Rendering lifecycle for one Zotero Reader.
 *
 * The controller coordinates discovery, eager/lazy scheduling, editing pauses,
 * caches, diagnostics, styles, and cleanup through injected boundary objects.
 */
import {
  FAST_EDITOR_CLOSED_EVENT,
  type FastEditorClosedDetail,
  type AnnotationSidebarAdapter
} from "./annotation-sidebar-adapter.js";
import type { Settings } from "./settings.js";
import type { MarkdownRenderer, ReaderController } from "./types.js";

interface ReaderLike {
  document?: Document | null;
  window?: Window | null;
  _iframeWindow?: Window | null;
  _waitForReader?(): PromiseLike<void> | null;
  _initPromise?: PromiseLike<void> | null;
}

interface Logger {
  log?(message: string): void;
  warn?(message: string, error?: unknown): void;
}

interface IdleDeadlineLike {
  timeRemaining(): number;
}

type RequestIdleCallbackLike = (
  callback: (deadline: IdleDeadlineLike) => void,
  options?: { timeout?: number }
) => number;
type CancelIdleCallbackLike = (handle: number) => void;
type ReaderRoot = Document | HTMLElement;
type RenderCacheKey = string | HTMLElement;
type ActiveRenderStrategy = "eager" | "lazy";

interface RenderDiagnosticSample {
  totalDurationMs: number;
  markdownDurationMs: number;
  domDurationMs: number;
  sourceChars: number;
  cached: boolean;
}

interface CachedRender {
  source: string;
  mathEnabled: boolean;
  html: string;
  sizeBytes?: number;
}

interface HandleCommentResult {
  mode: "sync" | "eager" | "lazy";
  handled: number;
  filtered: number;
}

interface PausedMutationDiagnostics {
  batches: number;
  mutations: number;
  childList: number;
  attributes: number;
  characterData: number;
  addedNodes: number;
  removedNodes: number;
  activeEditorMutations: number;
  pluginOwnedMutations: number;
}

interface CreateReaderControllerOptions {
  reader: ReaderLike;
  adapter: AnnotationSidebarAdapter;
  renderer: MarkdownRenderer;
  settings: Settings;
  MutationObserver?: typeof MutationObserver;
  IntersectionObserver?: typeof IntersectionObserver;
  styleText?: string;
  logger?: Logger;
  now?: () => number;
  requestIdleCallback?: RequestIdleCallbackLike;
  cancelIdleCallback?: CancelIdleCallbackLike;
  renderCacheMaxBytes?: number;
  offscreenRenderMaxBytes?: number;
}

const MAX_RENDER_CACHE_BYTES: number = 32 * 1024 * 1024;
const RENDER_CACHE_ENTRY_OVERHEAD_BYTES = 256;
const AUTO_EAGER_MAX_ANNOTATIONS = 30;
const AUTO_EAGER_MAX_SOURCE_CHARS = 50_000;
const MAX_IDLE_RENDER_BATCH = 4;
const MIN_IDLE_TIME_REMAINING_MS = 8;

/**
 * Creates one controller for one Reader.
 *
 * The controller never owns Zotero's source DOM directly; all DOM policy stays
 * behind `AnnotationSidebarAdapter`.
 */
export function createReaderController({
  reader,
  adapter,
  renderer,
  settings,
  MutationObserver: MutationObserverRef = globalThis.MutationObserver,
  IntersectionObserver: IntersectionObserverRef,
  styleText = "",
  logger,
  now: nowRef = now,
  requestIdleCallback: requestIdleCallbackOverride,
  cancelIdleCallback: cancelIdleCallbackOverride,
  renderCacheMaxBytes: renderCacheMaxBytesOverride = MAX_RENDER_CACHE_BYTES,
  offscreenRenderMaxBytes: offscreenRenderMaxBytesOverride = MAX_RENDER_CACHE_BYTES
}: CreateReaderControllerOptions): ReaderController {
  let observer: MutationObserver | undefined;
  let visibilityObserver: IntersectionObserver | undefined;
  let styleElement: HTMLStyleElement | undefined;
  let safetyTimer: number | undefined;
  let pasteHandler: EventListener | undefined;
  let fastEditorEntryHandler: EventListener | undefined;
  let fastEditorClosedHandler: EventListener | undefined;
  let fastEditorExitHandler: EventListener | undefined;
  let fastEditorWindowBlurHandler: EventListener | undefined;
  let fastEditorFocusFrame: number | undefined;
  let focusInHandler: EventListener | undefined;
  let focusOutHandler: EventListener | undefined;
  let editingResumeTimer: number | undefined;
  let pausedComment: HTMLElement | undefined;
  let editPauseStartedAt = 0;
  let pausedMutationDiagnosticsTimer: number | undefined;
  let pausedMutationDiagnostics: PausedMutationDiagnostics | undefined;
  let observedComments = new WeakSet<HTMLElement>();
  let visibleComments = new WeakSet<HTMLElement>();
  let visibilityKnownComments = new WeakSet<HTMLElement>();
  let eagerComments = new WeakSet<HTMLElement>();
  let pendingRenderNodes = new Set<HTMLElement>();
  let idleRenderHandle: number | undefined;
  let lazyRenderDiagnosticSamples: RenderDiagnosticSample[] = [];
  const renderCache = new Map<RenderCacheKey, CachedRender>();
  const renderCacheMaxBytes = Math.max(0, Number(renderCacheMaxBytesOverride) || 0);
  const offscreenRenderMaxBytes = Math.max(0, Number(offscreenRenderMaxBytesOverride) || 0);
  const renderedNodeWeights = new WeakMap<HTMLElement, number>();
  const offscreenRenderedNodes = new Map<HTMLElement, number>();
  let renderCacheBytes = 0;
  let offscreenRenderedBytes = 0;
  let activeRenderStrategy: ActiveRenderStrategy | undefined;
  let shutdownCleanupFailures: string[] = [];
  // Keep the startup root for observation; shutdown also discovers live roots
  // because Zotero may replace the Reader document body while the plugin runs.
  const root = getReaderRoot(reader);
  const documentRef = root?.ownerDocument ?? reader.document ?? globalThis.document;
  const windowRef = documentRef.defaultView ?? globalThis.window;
  const IntersectionObserverCtor = IntersectionObserverRef ?? windowRef?.IntersectionObserver ?? globalThis.IntersectionObserver;
  const requestIdleCallbackRef = requestIdleCallbackOverride ??
    windowRef.requestIdleCallback?.bind(windowRef) as RequestIdleCallbackLike | undefined;
  const cancelIdleCallbackRef = cancelIdleCallbackOverride ??
    windowRef.cancelIdleCallback?.bind(windowRef) as CancelIdleCallbackLike | undefined;

  function renderNode(node: HTMLElement): RenderDiagnosticSample | undefined {
    const diagnosticsEnabled = isPerformanceDiagnosticsEnabled();
    const totalStartedAt = diagnosticsEnabled ? nowRef() : 0;
    let markdownDurationMs = 0;
    let domDurationMs = 0;
    let sourceChars = 0;
    let cachedRender = false;

    try {
      if (!settings.isEnabled()) {
        if (adapter.isRendered(node) || adapter.hasPreview?.(node)) {
          if (adapter.restoreSourceDomForEditing) {
            adapter.restoreSourceDomForEditing(node);
          } else {
            adapter.restoreSourceText(node);
          }
        }
        deleteCachedRender(node);
        return;
      }

      if (adapter.isEditable(node)) {
        return;
      }

      const source = adapter.getSourceText(node);
      sourceChars = source.length;
      if (!source.trim()) {
        if (adapter.isRendered(node) || adapter.hasPreview?.(node)) {
          if (adapter.restoreSourceDomForEditing) {
            adapter.restoreSourceDomForEditing(node);
          } else {
            adapter.restoreSourceText(node);
          }
        }
        deleteCachedRender(node);
        removeOffscreenRenderedNode(node);
        renderedNodeWeights.delete(node);
        return;
      }

      const mathEnabled = Boolean(settings.isMathEnabled?.() ?? true);
      const cached = getCachedRender(node);
      if (cached?.source === source && cached?.mathEnabled === mathEnabled) {
        cachedRender = true;
        renderedNodeWeights.set(node, cached.sizeBytes ?? estimateRenderCacheBytes(cached));
        const domStartedAt = diagnosticsEnabled ? nowRef() : 0;
        adapter.applyRenderedHtml(node, cached.html);
        if (diagnosticsEnabled) {
          domDurationMs = Math.max(0, nowRef() - domStartedAt);
          return createRenderDiagnosticSample();
        }
        return undefined;
      }

      const markdownStartedAt = diagnosticsEnabled ? nowRef() : 0;
      const html = renderer.render(source);
      if (diagnosticsEnabled) {
        markdownDurationMs = Math.max(0, nowRef() - markdownStartedAt);
      }
      setCachedRender(node, { source, mathEnabled, html });
      const domStartedAt = diagnosticsEnabled ? nowRef() : 0;
      adapter.applyRenderedHtml(node, html);
      if (diagnosticsEnabled) {
        domDurationMs = Math.max(0, nowRef() - domStartedAt);
        return createRenderDiagnosticSample();
      }
    } catch {
      if (adapter.isRendered(node)) {
        adapter.restoreSourceText(node);
      }
      deleteCachedRender(node);
    }

    return undefined;

    function createRenderDiagnosticSample(): RenderDiagnosticSample {
      return {
        totalDurationMs: Math.max(0, nowRef() - totalStartedAt),
        markdownDurationMs,
        domDurationMs,
        sourceChars,
        cached: cachedRender
      };
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
      const startedAt = diagnosticsEnabled ? nowRef() : 0;
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
      cancelQueuedRendering();
      visibilityObserver?.disconnect?.();
      visibilityObserver = undefined;
      observedComments = new WeakSet();
      visibilityKnownComments = new WeakSet();
      eagerComments = new WeakSet();
      activeRenderStrategy = undefined;
      lazyRenderDiagnosticSamples = [];
      resetOffscreenRenderedNodes();
      if (observer) {
        observer.disconnect();
        observer = undefined;
      }
      this.renderNow();
      registerMutationObserver();
    },

    stop() {
      shutdownCleanupFailures = [];
      runShutdownStep(() => observer?.disconnect());
      observer = undefined;
      runShutdownStep(() => visibilityObserver?.disconnect?.());
      visibilityObserver = undefined;
      runShutdownStep(() => {
        if (safetyTimer && windowRef?.clearTimeout) {
          windowRef.clearTimeout(safetyTimer);
        }
      });
      safetyTimer = undefined;
      runShutdownStep(() => {
        if (pasteHandler) {
          root?.removeEventListener?.("paste", pasteHandler, true);
        }
      });
      pasteHandler = undefined;
      runShutdownStep(() => {
        if (fastEditorEntryHandler) {
          root?.removeEventListener?.("pointerdown", fastEditorEntryHandler, true);
          root?.removeEventListener?.("mousedown", fastEditorEntryHandler, true);
          root?.removeEventListener?.("click", fastEditorEntryHandler, true);
          root?.removeEventListener?.("focusin", fastEditorEntryHandler, true);
        }
        if (fastEditorClosedHandler) {
          root?.removeEventListener?.(FAST_EDITOR_CLOSED_EVENT, fastEditorClosedHandler);
        }
        if (fastEditorExitHandler) {
          windowRef?.removeEventListener?.("pointerdown", fastEditorExitHandler, true);
          windowRef?.removeEventListener?.("focusin", fastEditorExitHandler, true);
        }
        if (fastEditorWindowBlurHandler) {
          windowRef?.removeEventListener?.("blur", fastEditorWindowBlurHandler);
        }
      });
      fastEditorEntryHandler = undefined;
      fastEditorClosedHandler = undefined;
      fastEditorExitHandler = undefined;
      fastEditorWindowBlurHandler = undefined;
      runShutdownStep(() => {
        if (fastEditorFocusFrame !== undefined) {
          windowRef?.cancelAnimationFrame?.(fastEditorFocusFrame);
        }
      });
      fastEditorFocusFrame = undefined;
      runShutdownStep(() => {
        if (focusInHandler) {
          root?.removeEventListener?.("focusin", focusInHandler, true);
        }
      });
      focusInHandler = undefined;
      runShutdownStep(() => {
        if (focusOutHandler) {
          root?.removeEventListener?.("focusout", focusOutHandler, true);
        }
      });
      focusOutHandler = undefined;
      runShutdownStep(() => {
        if (editingResumeTimer && windowRef?.clearTimeout) {
          windowRef.clearTimeout(editingResumeTimer);
        }
      });
      editingResumeTimer = undefined;
      runShutdownStep(() => {
        if (pausedMutationDiagnosticsTimer && windowRef?.clearTimeout) {
          windowRef.clearTimeout(pausedMutationDiagnosticsTimer);
        }
      });
      pausedMutationDiagnosticsTimer = undefined;
      pausedMutationDiagnostics = undefined;
      pausedComment = undefined;
      runShutdownStep(cancelQueuedRendering);
      lazyRenderDiagnosticSamples = [];
      renderCache.clear();
      renderCacheBytes = 0;
      resetOffscreenRenderedNodes();
      const cleanupRoots = collectShutdownRoots();
      logShutdownCleanup("before", cleanupRoots);
      for (const cleanupRoot of cleanupRoots) {
        runShutdownStep(() => adapter.clearRenderedState?.(cleanupRoot));
      }
      logShutdownCleanup("after", cleanupRoots);
      runShutdownStep(() => styleElement?.remove());
      styleElement = undefined;
      logShutdownCleanupFailures();
    }
  };

  function runShutdownStep(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      shutdownCleanupFailures.push(getShutdownFailureReason(error));
    }
  }

  function getShutdownFailureReason(error: unknown): string {
    try {
      return String(error instanceof Error ? error.message : error ?? "unknown error");
    } catch {
      return "unavailable error";
    }
  }

  function logShutdownCleanupFailures(): void {
    if (shutdownCleanupFailures.length === 0 || !logger?.warn) {
      return;
    }

    const reasons = Array.from(new Set(shutdownCleanupFailures)).join(" | ");
    const summary = `skippedSteps=${shutdownCleanupFailures.length} reasons=${reasons}`;
    try {
      logger.warn("Could not fully clean a Zotero Annotation Markdown reader", new Error(summary));
    } catch {
      // Diagnostics must never break reader shutdown.
    }
  }

  function collectShutdownRoots(): Set<ReaderRoot> {
    const cleanupRoots = new Set<ReaderRoot>();
    const addRoot = (
      getRoot: () => ReaderRoot | null | undefined
    ): void => runShutdownStep(() => {
      const cleanupRoot = getRoot();
      if (cleanupRoot) {
        cleanupRoots.add(cleanupRoot);
      }
    });

    addRoot(() => root);
    addRoot(() => getReaderRoot(reader));
    addRoot(() => documentRef?.body);
    addRoot(() => reader?.document?.body);
    addRoot(() => reader?.window?.document?.body);
    addRoot(() => reader?._iframeWindow?.document?.body);
    return cleanupRoots;
  }

  function injectStyles(): void {
    if (!styleText || !documentRef?.head) {
      return;
    }

    let activeStyleElement = styleElement;
    if (!activeStyleElement) {
      activeStyleElement = documentRef.createElement("style");
      activeStyleElement.setAttribute("data-annotation-markdown-style", "true");
      documentRef.head.append(activeStyleElement);
      styleElement = activeStyleElement;
    }

    activeStyleElement.textContent =
      `${styleText}\n${createFontScaleStyle(settings.getFontScale?.() ?? 1)}`;
  }

  function startNow(renderNow: () => void): void {
    injectStyles();
    registerPasteHandler();
    registerFastEditorHandlers();
    registerEditingPauseHandlers();
    adapter.clearRenderedState?.(root);
    renderNow();
    registerMutationObserver();
  }

  function registerMutationObserver(): void {
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
          // Added annotation subtrees are handled directly to avoid a full sidebar scan.
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

  function getReaderReadyPromise(): PromiseLike<void> | null {
    if (typeof reader?._waitForReader === "function") {
      return reader._waitForReader();
    }

    if (reader?._initPromise) {
      return reader._initPromise;
    }

    return null;
  }

  function scheduleSafetyScan(delay: number): void {
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

  function renderNowInternal(): void {
    if (isRenderingPaused()) {
      return;
    }

    const nodes = adapter.findCommentNodes(root);
    handleCommentNodes(nodes);
  }

  function handleCommentNodes(
    nodes: HTMLElement[],
    { force = false }: { force?: boolean } = {}
  ): HandleCommentResult {
    if (force || !canLazyRender()) {
      const targetNodes = filterLightweightNodes(nodes, { force });
      return {
        mode: "sync",
        handled: renderNodes(targetNodes),
        filtered: nodes.length - targetNodes.length
      };
    }

    if (getActiveRenderStrategy(nodes) === "eager") {
      return {
        mode: "eager",
        handled: observeAndQueueEagerNodes(nodes),
        filtered: 0
      };
    }

    return {
      mode: "lazy",
      handled: observeCommentNodes(nodes),
      filtered: 0
    };
  }

  function renderNodes(nodes: HTMLElement[]): number {
    let handled = 0;
    for (const node of nodes) {
      renderNode(node);
      handled += 1;
    }
    return handled;
  }

  function canLazyRender(): boolean {
    return Boolean(root && IntersectionObserverCtor && settings.isEnabled());
  }

  function observeCommentNodes(nodes: HTMLElement[]): number {
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

  function observeAndQueueEagerNodes(nodes: HTMLElement[]): number {
    const handled = observeCommentNodes(nodes);
    if (!requestIdleCallbackRef) {
      renderNodes(nodes.filter((node) => !adapter.isRendered(node)));
      return handled;
    }

    for (const node of nodes) {
      if (adapter.isRendered(node)) {
        continue;
      }
      eagerComments.add(node);
      pendingRenderNodes.add(node);
    }
    scheduleQueuedRendering();
    return handled;
  }

  function getVisibilityObserver(): IntersectionObserver | undefined {
    if (visibilityObserver || !IntersectionObserverCtor) {
      return visibilityObserver;
    }

    visibilityObserver = new IntersectionObserverCtor((entries: IntersectionObserverEntry[]) => {
      const diagnosticSamples: RenderDiagnosticSample[] = [];
      for (const entry of entries ?? []) {
        const node = entry.target as HTMLElement;
        visibilityKnownComments.add(node);
        if (!entry.isIntersecting) {
          visibleComments.delete(node);
          if (!eagerComments.has(node)) {
            pendingRenderNodes.delete(node);
          }
          if (!isRenderingPaused()) {
            retainOffscreenRenderedNode(node);
          }
          continue;
        }

        removeOffscreenRenderedNode(node);
        visibleComments.add(node);

        if (isRenderingPaused()) {
          logEditLifecycle("lazy render skipped while paused");
          continue;
        }

        if (adapter.isRendered(node)) {
          pendingRenderNodes.delete(node);
          eagerComments.delete(node);
          continue;
        }

        if (requestIdleCallbackRef) {
          pendingRenderNodes.add(node);
          scheduleQueuedRendering();
        } else {
          const diagnosticSample = renderNode(node);
          if (diagnosticSample) {
            diagnosticSamples.push(diagnosticSample);
          }
        }
      }

      if (diagnosticSamples.length > 0) {
        logLazyRenderDiagnostics(diagnosticSamples);
      } else if (!isPerformanceDiagnosticsEnabled()) {
        lazyRenderDiagnosticSamples = [];
      }
    }, {
      root: null,
      rootMargin: getLazyRenderRootMargin(),
      threshold: 0
    });

    return visibilityObserver;
  }

  function scheduleQueuedRendering(): void {
    if (
      idleRenderHandle !== undefined ||
      pendingRenderNodes.size === 0 ||
      isRenderingPaused() ||
      !requestIdleCallbackRef
    ) {
      return;
    }

    // Idle work is intentionally bounded so one large sidebar cannot monopolize a frame.
    idleRenderHandle = requestIdleCallbackRef((deadline: IdleDeadlineLike) => {
      idleRenderHandle = undefined;
      if (isRenderingPaused()) {
        return;
      }

      const diagnosticSamples: RenderDiagnosticSample[] = [];
      let rendered = 0;
      while (rendered < MAX_IDLE_RENDER_BATCH) {
        const node = getNextPendingRenderNode();
        if (!node) {
          break;
        }

        pendingRenderNodes.delete(node);
        const wasEager = eagerComments.has(node);
        eagerComments.delete(node);
        const diagnosticSample = renderNode(node);
        if (diagnosticSample) {
          diagnosticSamples.push(diagnosticSample);
        }
        if (wasEager && visibilityKnownComments.has(node) && !visibleComments.has(node)) {
          retainOffscreenRenderedNode(node);
        }
        rendered += 1;
        if (!hasIdleTimeForAnotherRender(deadline)) {
          break;
        }
      }

      if (diagnosticSamples.length > 0) {
        logLazyRenderDiagnostics(diagnosticSamples);
      }

      scheduleQueuedRendering();
    }, { timeout: 1000 });
  }

  function cancelQueuedRendering(): void {
    if (idleRenderHandle !== undefined) {
      cancelIdleCallbackRef?.(idleRenderHandle);
      idleRenderHandle = undefined;
    }
    pendingRenderNodes.clear();
    visibleComments = new WeakSet<HTMLElement>();
    visibilityKnownComments = new WeakSet<HTMLElement>();
    eagerComments = new WeakSet<HTMLElement>();
  }

  function getNextPendingRenderNode(): HTMLElement | undefined {
    const eligible = Array.from(pendingRenderNodes)
      .filter((candidate) => visibleComments.has(candidate) || eagerComments.has(candidate));
    return eligible.find(isSelectedComment) ??
      eligible.find((candidate) => visibleComments.has(candidate)) ??
      eligible[0];
  }

  function hasIdleTimeForAnotherRender(deadline: IdleDeadlineLike): boolean {
    return typeof deadline?.timeRemaining === "function" &&
      deadline.timeRemaining() >= MIN_IDLE_TIME_REMAINING_MS;
  }

  function registerPasteHandler(): void {
    if (!root?.addEventListener || pasteHandler) {
      return;
    }

    pasteHandler = (event: Event) => {
      handlePlainTextPaste(event as ClipboardEvent, adapter, settings, documentRef);
    };
    root.addEventListener("paste", pasteHandler, true);
  }

  function registerFastEditorHandlers(): void {
    if (
      !root?.addEventListener ||
      fastEditorEntryHandler ||
      fastEditorClosedHandler ||
      fastEditorExitHandler ||
      fastEditorWindowBlurHandler
    ) {
      return;
    }

    fastEditorExitHandler = (event: Event) => {
      if (adapter.isFastEditorTarget?.(event.target)) {
        return;
      }
      if (!adapter.closeActiveFastEditor?.()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    fastEditorWindowBlurHandler = () => {
      adapter.closeActiveFastEditor?.();
    };

    fastEditorEntryHandler = (event: Event) => {
      if (adapter.isFastEditorTarget?.(event.target)) {
        return;
      }

      if (event.type === "focusin") {
        const annotationID = adapter.getAnnotationIDForTarget?.(event.target);
        if (annotationID) {
          scheduleFastEditorAfterNativeFocus(annotationID);
        }
        // Zotero must finish its focus-driven state update before we add DOM.
        return;
      }

      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0) {
        return;
      }

      const comment = adapter.getCommentNodeForTarget?.(event.target);
      const fastEditorOpen = Boolean(
        comment?.querySelector?.("[data-annotation-markdown-fast-editor='true']")
      );
      if (!fastEditorOpen && !adapter.tryShowFastEditorForTarget?.(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    };
    fastEditorClosedHandler = (event: Event) => {
      const detail = getFastEditorClosedDetail(event);
      const currentComment = detail?.committed
        ? adapter.getCommentNodeForAnnotationID?.(detail.annotationID)
        : null;
      const comment = currentComment ??
        adapter.getCommentNodeForTarget?.(event.target) ??
        pausedComment;
      if (comment) {
        if (detail?.committed) {
          adapter.setCommittedSource?.(comment, detail.source);
          // A newly saved empty comment can be replaced by Zotero before this
          // close event bubbles. Resume against the live node, not the detached
          // editor node captured when rendering was paused.
          pausedComment = comment;
        }
        scheduleEditingResume(comment);
      }
    };

    root.addEventListener("pointerdown", fastEditorEntryHandler, true);
    root.addEventListener("mousedown", fastEditorEntryHandler, true);
    root.addEventListener("click", fastEditorEntryHandler, true);
    root.addEventListener("focusin", fastEditorEntryHandler, true);
    root.addEventListener(FAST_EDITOR_CLOSED_EVENT, fastEditorClosedHandler);
    windowRef?.addEventListener?.("pointerdown", fastEditorExitHandler, true);
    windowRef?.addEventListener?.("focusin", fastEditorExitHandler, true);
    windowRef?.addEventListener?.("blur", fastEditorWindowBlurHandler);
  }

  function scheduleFastEditorAfterNativeFocus(annotationID: string): void {
    if (!adapter.tryShowFastEditorForAnnotationID) {
      return;
    }

    if (fastEditorFocusFrame !== undefined) {
      windowRef?.cancelAnimationFrame?.(fastEditorFocusFrame);
    }

    const openCurrentEditor = () => {
      fastEditorFocusFrame = undefined;
      adapter.tryShowFastEditorForAnnotationID?.(annotationID);
    };
    if (typeof windowRef?.requestAnimationFrame === "function") {
      fastEditorFocusFrame = windowRef.requestAnimationFrame(openCurrentEditor);
      return;
    }

    Promise.resolve().then(openCurrentEditor);
  }

  function registerEditingPauseHandlers(): void {
    if (!root?.addEventListener || focusInHandler || focusOutHandler) {
      return;
    }

    focusInHandler = (event: Event) => {
      const comment = adapter.getCommentNodeForTarget?.(event.target);
      if (comment && adapter.isCommentEditorTarget?.(event.target)) {
        pauseRenderingForEditing(comment);
      }
    };

    focusOutHandler = (event: Event) => {
      const target = getElementTarget(event.target);
      if (!pausedComment || !target || !pausedComment.contains(target)) {
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

  function pauseRenderingForEditing(comment: HTMLElement): void {
    if (pausedComment === comment) {
      return;
    }

    pausedComment = comment;
    removeOffscreenRenderedNode(comment);
    editPauseStartedAt = nowRef();

    if (safetyTimer && windowRef?.clearTimeout) {
      windowRef.clearTimeout(safetyTimer);
      safetyTimer = undefined;
    }

    if (editingResumeTimer && windowRef?.clearTimeout) {
      windowRef.clearTimeout(editingResumeTimer);
      editingResumeTimer = undefined;
    }

    // Pause both discovery paths globally while Zotero owns an active editor.
    disconnectMutationObserverForEditing();
    disconnectVisibilityObserverForEditing();
    if (!adapter.isFastEditorTarget?.(documentRef.activeElement)) {
      if (adapter.restoreSourceDomForEditing) {
        adapter.restoreSourceDomForEditing(comment);
      } else {
        adapter.restoreSourceText?.(comment);
      }
    }
    logEditLifecycle("pause");
  }

  function scheduleEditingResume(comment: HTMLElement): void {
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

  function resumeRenderingAfterEditing(comment: HTMLElement): void {
    const activeComment = adapter.getCommentNodeForTarget?.(documentRef?.activeElement);
    if (activeComment && adapter.isCommentEditorTarget?.(documentRef.activeElement)) {
      pauseRenderingForEditing(activeComment);
      return;
    }

    if (pausedComment !== comment) {
      return;
    }

    flushPausedMutationDiagnostics();
    const pausedForMs = Math.max(0, nowRef() - editPauseStartedAt).toFixed(1);
    pausedComment = undefined;
    adapter.finishEditing?.(comment);
    const startedAt = isPerformanceDiagnosticsEnabled() ? nowRef() : 0;
    const result = handleCommentNodes([comment], { force: true });
    if (isPerformanceDiagnosticsEnabled()) {
      logger?.log?.(
        `[annotation-markdown] edit resume pausedForMs=${pausedForMs} ` +
        `handled=${result?.handled ?? 0} durationMs=${Math.max(0, nowRef() - startedAt).toFixed(1)}`
      );
    }
    restoreLazyObservationAfterEditing();
    registerMutationObserver();
  }

  function isRenderingPaused(): boolean {
    return Boolean(pausedComment);
  }

  function filterLightweightNodes(
    nodes: HTMLElement[],
    { force = false }: { force?: boolean } = {}
  ): HTMLElement[] {
    if (force || !isLightweightModeEnabled()) {
      return nodes;
    }

    const targetNodes = nodes.filter((node) => isLightweightRenderTarget(node, documentRef));
    const targetSet = new Set(targetNodes);
    for (const node of nodes) {
      if (!targetSet.has(node) && adapter.isRendered(node)) {
        adapter.restoreSourceText(node);
        deleteCachedRender(node);
      }
    }

    return targetNodes;
  }

  function isPerformanceDiagnosticsEnabled(): boolean {
    return Boolean(settings.isPerformanceDiagnosticsEnabled?.());
  }

  function isLightweightModeEnabled(): boolean {
    return Boolean(settings.isLightweightModeEnabled?.());
  }

  function getActiveRenderStrategy(nodes: HTMLElement[]): ActiveRenderStrategy {
    if (activeRenderStrategy) {
      return activeRenderStrategy;
    }

    const configured = settings.getRenderStrategy?.() ?? "lazy";
    if (configured === "eager" || configured === "lazy") {
      activeRenderStrategy = configured;
      return activeRenderStrategy;
    }

    let sourceChars = 0;
    for (const node of nodes) {
      sourceChars += adapter.getSourceText(node).length;
      if (sourceChars > AUTO_EAGER_MAX_SOURCE_CHARS) {
        break;
      }
    }
    activeRenderStrategy = nodes.length <= AUTO_EAGER_MAX_ANNOTATIONS &&
      sourceChars <= AUTO_EAGER_MAX_SOURCE_CHARS
      ? "eager"
      : "lazy";
    return activeRenderStrategy;
  }

  function getLightweightMutationObserverOptions(): MutationObserverInit {
    if (!isLightweightModeEnabled()) {
      return {};
    }

    return {
      attributes: true,
      attributeFilter: ["class", "aria-selected"]
    };
  }

  function logRenderDiagnostics(
    label: string,
    nodes: HTMLElement[],
    result: HandleCommentResult,
    startedAt: number,
    nativeNoteEditorComments: number
  ): void {
    const durationMs = Math.max(0, nowRef() - startedAt).toFixed(1);
    logger?.log?.(
      `[annotation-markdown] perf ${label} nodes=${nodes.length} handled=${result?.handled ?? 0} ` +
      `mode=${result?.mode ?? "unknown"} filtered=${result?.filtered ?? 0} ` +
      `nativeNoteEditorComments=${nativeNoteEditorComments} durationMs=${durationMs}`
    );
  }

  function logLazyRenderDiagnostics(samples: RenderDiagnosticSample[]): void {
    lazyRenderDiagnosticSamples.push(...samples);
    const totals = lazyRenderDiagnosticSamples.map((sample) => sample.totalDurationMs);
    const markdownMs = sumDiagnosticMetric(lazyRenderDiagnosticSamples, "markdownDurationMs");
    const domMs = sumDiagnosticMetric(lazyRenderDiagnosticSamples, "domDurationMs");
    const cachedNodes = lazyRenderDiagnosticSamples.filter((sample) => sample.cached).length;
    const slowNodes = totals.filter((durationMs) => durationMs >= 16).length;
    const sourceChars = sumDiagnosticMetric(lazyRenderDiagnosticSamples, "sourceChars");

    logger?.log?.(
      `[annotation-markdown] perf lazyRender batchNodes=${samples.length} ` +
      `totalNodes=${lazyRenderDiagnosticSamples.length} cachedNodes=${cachedNodes} ` +
      `markdownMs=${markdownMs.toFixed(1)} domMs=${domMs.toFixed(1)} ` +
      `p50Ms=${percentile(totals, 0.5).toFixed(1)} ` +
      `p95Ms=${percentile(totals, 0.95).toFixed(1)} ` +
      `maxMs=${Math.max(...totals).toFixed(1)} slowNodes=${slowNodes} sourceChars=${sourceChars} ` +
      `mountedPreviews=${countNodes("[data-annotation-markdown-rendered='true']")} ` +
      `placeholders=${countNodes("[data-annotation-markdown-placeholder='true']")} ` +
      `cacheEntries=${renderCache.size} cacheBytes=${renderCacheBytes} ` +
      `offscreenEntries=${offscreenRenderedNodes.size} offscreenBytes=${offscreenRenderedBytes}`
    );
  }

  function getCachedRender(node: HTMLElement): CachedRender | undefined {
    const key = getRenderCacheKey(node);
    const cached = renderCache.get(key);
    if (!cached) {
      return undefined;
    }

    renderCache.delete(key);
    renderCache.set(key, cached);
    return cached;
  }

  function setCachedRender(node: HTMLElement, cached: CachedRender): void {
    const key = getRenderCacheKey(node);
    removeCachedRender(key);

    const sizeBytes = estimateRenderCacheBytes(cached);
    renderedNodeWeights.set(node, sizeBytes);
    if (sizeBytes > renderCacheMaxBytes) {
      return;
    }

    renderCache.set(key, { ...cached, sizeBytes });
    renderCacheBytes += sizeBytes;
    while (renderCacheBytes > renderCacheMaxBytes && renderCache.size > 0) {
      const oldestKey = renderCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      removeCachedRender(oldestKey);
    }
  }

  function deleteCachedRender(node: HTMLElement): void {
    removeCachedRender(getRenderCacheKey(node));
  }

  function removeCachedRender(key: RenderCacheKey): void {
    const cached = renderCache.get(key);
    if (!cached) {
      return;
    }

    renderCacheBytes = Math.max(
      0,
      renderCacheBytes - (cached.sizeBytes ?? estimateRenderCacheBytes(cached))
    );
    renderCache.delete(key);
  }

  function getRenderCacheKey(node: HTMLElement): RenderCacheKey {
    const annotationId = node.closest("[data-annotation-id]")
      ?.getAttribute("data-annotation-id");
    return annotationId ? `annotation:${annotationId}` : node;
  }

  function estimateRenderCacheBytes(cached: CachedRender): number {
    return RENDER_CACHE_ENTRY_OVERHEAD_BYTES +
      (String(cached?.source ?? "").length + String(cached?.html ?? "").length) * 2;
  }

  function getLazyRenderRootMargin(): string {
    const viewportHeight = Number(windowRef?.innerHeight) || 600;
    return `${Math.max(1200, viewportHeight * 2)}px 0px`;
  }

  function isSelectedComment(node: HTMLElement): boolean {
    return Boolean(node.closest(
      ".annotation.selected,.annotation-row.selected,[data-annotation-id].selected,[aria-selected='true']"
    ));
  }

  function retainOffscreenRenderedNode(node: HTMLElement): void {
    removeOffscreenRenderedNode(node);
    if (!node || !adapter.isRendered(node) || isSelectedComment(node)) {
      return;
    }

    const sizeBytes = renderedNodeWeights.get(node) ?? 0;
    offscreenRenderedNodes.set(node, sizeBytes);
    offscreenRenderedBytes += sizeBytes;

    while (offscreenRenderedBytes > offscreenRenderMaxBytes && offscreenRenderedNodes.size > 0) {
      const oldestNode = offscreenRenderedNodes.keys().next().value;
      if (!oldestNode) {
        break;
      }
      removeOffscreenRenderedNode(oldestNode);
      adapter.releaseRenderedHtml?.(oldestNode);
    }
  }

  function removeOffscreenRenderedNode(
    node: HTMLElement | null | undefined
  ): void {
    if (!node) {
      return;
    }
    const sizeBytes = offscreenRenderedNodes.get(node);
    if (sizeBytes === undefined) {
      return;
    }

    offscreenRenderedBytes = Math.max(0, offscreenRenderedBytes - sizeBytes);
    offscreenRenderedNodes.delete(node);
  }

  function resetOffscreenRenderedNodes(): void {
    offscreenRenderedNodes.clear();
    offscreenRenderedBytes = 0;
  }

  function disconnectMutationObserverForEditing(): void {
    if (!observer) {
      return;
    }

    observer.disconnect();
    observer = undefined;
  }

  function disconnectVisibilityObserverForEditing(): void {
    cancelQueuedRendering();
    if (!visibilityObserver) {
      return;
    }

    visibilityObserver.disconnect?.();
    visibilityObserver = undefined;
    observedComments = new WeakSet<HTMLElement>();
  }

  function restoreLazyObservationAfterEditing(): void {
    if (!canLazyRender()) {
      return;
    }

    handleCommentNodes(adapter.findCommentNodes(root));
  }

  function logEditLifecycle(action: string): void {
    if (!isPerformanceDiagnosticsEnabled()) {
      return;
    }

    logger?.log?.(
      `[annotation-markdown] edit ${action} ` +
      `commentNodes=${countCommentNodesForDiagnostics()} ` +
      `renderedPreviews=${countNodes("[data-annotation-markdown-rendered='true']")} ` +
      `placeholders=${countNodes("[data-annotation-markdown-placeholder='true']")} ` +
      `cacheEntries=${renderCache.size} ` +
      `sourceNodes=${countNodes("[data-annotation-markdown-source-node='true']")}`
    );
  }

  function recordPausedMutations(mutations: MutationRecord[] = []): void {
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

  function schedulePausedMutationDiagnosticsFlush(): void {
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

  function flushPausedMutationDiagnostics(): void {
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

  function countCommentNodesForDiagnostics(): number {
    try {
      return adapter.findCommentNodes?.(root)?.length ?? 0;
    } catch {
      return 0;
    }
  }

  function countNodes(selector: string): number {
    try {
      return root?.querySelectorAll?.(selector)?.length ?? 0;
    } catch {
      return 0;
    }
  }

  function logShutdownCleanup(
    phase: string,
    cleanupRoots: Set<ReaderRoot>
  ): void {
    if (!isPerformanceDiagnosticsEnabled() || !logger?.log) {
      return;
    }

    const previews = collectCleanupNodes(cleanupRoots, "[data-annotation-markdown-preview='true'], .annotation-markdown-rendered");
    const renderedMarkers = collectCleanupNodes(cleanupRoots, "[data-annotation-markdown-rendered]");
    const sourceMarkers = collectCleanupNodes(cleanupRoots, "[data-annotation-markdown-source]");
    const hiddenSources = collectCleanupNodes(cleanupRoots, "[data-annotation-markdown-source-hidden='true'], [data-annotation-markdown-source-node='true'][hidden]");
    const editingComments = collectCleanupNodes(cleanupRoots, ".annotation-markdown-editing");
    const selectedPreviews = Array.from(previews).filter((preview) =>
      preview.closest?.("[data-annotation-id].selected, .annotation.selected, .annotation-row.selected, [aria-selected='true']")
    );

    logger.log(
      "[annotation-markdown] shutdown cleanup " + phase + " roots=" + cleanupRoots.size +
      " previews=" + previews.size + " renderedMarkers=" + renderedMarkers.size +
      " sourceMarkers=" + sourceMarkers.size + " hiddenSources=" + hiddenSources.size +
      " editingComments=" + editingComments.size + " selectedPreviews=" + selectedPreviews.length
    );
  }

  function collectCleanupNodes(
    cleanupRoots: Set<ReaderRoot>,
    selector: string
  ): Set<Element> {
    const nodes = new Set<Element>();
    for (const cleanupRoot of cleanupRoots) {
      runShutdownStep(() => {
        for (const node of cleanupRoot?.querySelectorAll?.(selector) ?? []) {
          nodes.add(node);
        }
      });
    }
    return nodes;
  }
}

function createFontScaleStyle(fontScale: number): string {
  return `.annotation-markdown-rendered { --annotation-markdown-font-scale: ${fontScale}em; }`;
}

function handlePlainTextPaste(
  event: ClipboardEvent,
  adapter: AnnotationSidebarAdapter,
  settings: Settings,
  documentRef: Document
): void {
  if (!settings.isPlainTextPasteEnabled?.()) {
    return;
  }

  if (!adapter.isCommentEditorTarget?.(event.target)) {
    return;
  }

  if (adapter.isFastEditorTarget?.(event.target)) {
    // A textarea already accepts plain text only. Keep its native paste so
    // Gecko records the operation in the textarea undo history.
    return;
  }

  const text = event.clipboardData?.getData("text/plain");
  if (typeof text !== "string" || text.length === 0) {
    return;
  }

  if (insertPlainText(event.target, text, documentRef)) {
    event.preventDefault();
  }
}

function insertPlainText(
  target: EventTarget | null,
  text: string,
  documentRef: Document
): boolean {
  const targetElement = getElementTarget(target);
  const editor = targetElement?.closest(
    "textarea,input,[contenteditable='true'],[tabindex]"
  );
  if (!editor) {
    return false;
  }

  if (isTextControl(editor)) {
    insertIntoTextControl(editor, text, documentRef);
    return true;
  }

  if (!isHTMLElement(editor)) {
    return false;
  }
  insertIntoEditableElement(editor, text, documentRef);
  return true;
}

function insertIntoTextControl(
  control: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  documentRef: Document
): void {
  const start = typeof control.selectionStart === "number"
    ? control.selectionStart
    : String(control.value ?? "").length;
  const end = typeof control.selectionEnd === "number"
    ? control.selectionEnd
    : start;

  if (typeof control.setRangeText === "function") {
    control.setRangeText(text, start, end, "end");
  } else {
    const value = String(control.value ?? "");
    control.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  }

  dispatchInputEvent(control, text, documentRef);
}

function insertIntoEditableElement(
  editor: HTMLElement,
  text: string,
  documentRef: Document
): void {
  const doc = editor.ownerDocument ?? documentRef;
  if (typeof doc.execCommand === "function" && doc.execCommand("insertText", false, text)) {
    dispatchInputEvent(editor, text, doc);
    return;
  }

  const selection = doc?.defaultView?.getSelection?.();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;

  if (selection && range && editor.contains(range.commonAncestorContainer)) {
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

function dispatchInputEvent(
  target: EventTarget,
  text: string,
  documentRef: Document
): void {
  const InputEventRef = documentRef.defaultView?.InputEvent ?? globalThis.InputEvent;
  const EventRef = documentRef.defaultView?.Event ?? globalThis.Event;
  const event = typeof InputEventRef === "function"
    ? new InputEventRef("input", { bubbles: true, inputType: "insertFromPaste", data: text })
    : new EventRef("input", { bubbles: true });
  target.dispatchEvent(event);
}

function getElementTarget(target: EventTarget | null | undefined): Element | null {
  if (
    !target ||
    typeof target !== "object" ||
    !("nodeType" in target)
  ) {
    return null;
  }

  const node = target as Node;
  return node.nodeType === 1 ? node as Element : node.parentElement;
}

function getFastEditorClosedDetail(event: Event): FastEditorClosedDetail | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object") {
    return null;
  }

  const candidate = detail as Partial<FastEditorClosedDetail>;
  if (
    typeof candidate.annotationID !== "string" ||
    typeof candidate.source !== "string" ||
    typeof candidate.committed !== "boolean"
  ) {
    return null;
  }
  return candidate as FastEditorClosedDetail;
}

function isTextControl(
  element: Element
): element is HTMLInputElement | HTMLTextAreaElement {
  return element.tagName === "INPUT" || element.tagName === "TEXTAREA";
}

function isHTMLElement(value: Element): value is HTMLElement {
  return "style" in value && "hidden" in value;
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

type NumericDiagnosticKey = Exclude<keyof RenderDiagnosticSample, "cached">;

function sumDiagnosticMetric(
  samples: RenderDiagnosticSample[],
  key: NumericDiagnosticKey
): number {
  return samples.reduce((sum, sample) => sum + (Number(sample?.[key]) || 0), 0);
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index];
}

function findSyncMutationCommentNodes(
  mutations: MutationRecord[] = [],
  adapter: AnnotationSidebarAdapter
): HTMLElement[] {
  const found: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

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

function isPotentialAddedCommentRoot(node: Node | null): boolean {
  const element = getElementTarget(node);
  return Boolean(
    element &&
    (
      element.matches(".annotation-row, .annotation, .comment, .annotation-comment, [data-annotation-id], [data-annotation-comment]") ||
      element.querySelector(".comment, .annotation-comment, [data-annotation-comment]")
    )
  );
}

function mutationNeedsSafetyScan(
  mutations: MutationRecord[] = [],
  documentRef: Document = globalThis.document
): boolean {
  return mutations.some((mutation) => (
    !isPluginOwnedMutation(mutation) &&
    !isMutationInsideActiveCommentEditor(mutation, documentRef) && (
      isAnnotationMutationTarget(mutation.target) ||
      Array.from(mutation.addedNodes ?? []).some(isAnnotationMutationTarget) ||
      Array.from(mutation.removedNodes ?? []).some(isAnnotationMutationTarget)
    )
  ));
}

function isPluginOwnedMutation(mutation: MutationRecord): boolean {
  const changedNodes = [
    ...Array.from(mutation?.addedNodes ?? []),
    ...Array.from(mutation?.removedNodes ?? [])
  ];

  return changedNodes.length > 0 && (
    changedNodes.every(
      (node) => node === null || node.nodeType !== 1 || isPluginOwnedNode(node)
    ) ||
    (
      isPluginManagedNode(mutation.target) &&
      changedNodes.every(
        (node) => node === null || node.nodeType !== 1 || isPluginOwnedNode(node)
      )
    )
  );
}

function isPluginOwnedNode(node: Node | null): boolean {
  const element = getElementTarget(node);
  return Boolean(
    element?.getAttribute("data-annotation-markdown-preview") === "true" ||
    element?.getAttribute("data-annotation-markdown-fast-editor") === "true" ||
    element?.getAttribute("data-annotation-markdown-source-node") === "true" ||
    element?.closest("[data-annotation-markdown-preview='true'], [data-annotation-markdown-fast-editor='true'], [data-annotation-markdown-source-node='true']")
  );
}

function isPluginManagedNode(node: Node | null): boolean {
  const element = getElementTarget(node);
  return Boolean(
    element?.getAttribute("data-annotation-markdown-rendered") === "true" ||
    element?.hasAttribute("data-annotation-markdown-source") ||
    element?.closest("[data-annotation-markdown-rendered='true'], [data-annotation-markdown-source]")
  );
}

function isAnnotationMutationTarget(node: Node | null): boolean {
  const element = getElementTarget(node);
  return Boolean(element?.closest("[data-annotation-id], .annotation, .annotation-row, .comment"));
}

function isLightweightRenderTarget(
  node: HTMLElement,
  documentRef: Document
): boolean {
  const activeElement = documentRef.activeElement;
  return Boolean(
    (activeElement && node.contains(activeElement)) ||
    node.classList.contains("annotation-markdown-editing") ||
    node.closest("[data-annotation-id].selected, .annotation.selected, .annotation-row.selected, [aria-selected='true']")
  );
}

function isMutationInsideActiveCommentEditor(
  mutation: MutationRecord,
  documentRef: Document
): boolean {
  const element = getElementTarget(mutation.target);
  const comment = element?.closest(".comment, .annotation-comment, [data-annotation-comment]");
  if (!comment) {
    return false;
  }

  const activeElement = documentRef.activeElement;
  const hasFocusInside = Boolean(activeElement && activeElement !== documentRef.body && comment.contains(activeElement));
  const isEditing = comment.classList.contains("annotation-markdown-editing");
  return hasFocusInside || isEditing;
}

function getReaderRoot(reader: ReaderLike): ReaderRoot | null {
  return (
    reader?.document?.body ??
    reader?.document ??
    reader?.window?.document?.body ??
    reader?._iframeWindow?.document?.body ??
    null
  );
}

function summarizeDom(root: ReaderRoot | null): string {
  if (!root) {
    return "no root";
  }

  return Array.from(root.querySelectorAll("[class], [data-annotation-id], [data-id], [data-key]"))
    .slice(0, 80)
    .map((node) => {
      const tag = node.tagName.toLowerCase();
      const className = node.getAttribute("class");
      const dataAnnotationId = node.getAttribute("data-annotation-id");
      const dataId = node.getAttribute("data-id");
      const dataKey = node.getAttribute("data-key");
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

function summarizeNodes(
  adapter: AnnotationSidebarAdapter,
  nodes: HTMLElement[]
): string {
  return nodes
    .slice(0, 12)
    .map((node) => {
      const tag = node.tagName.toLowerCase();
      const className = node.getAttribute("class");
      const source = adapter.getSourceText(node)
        .replaceAll("\r", "\\r")
        .replaceAll("\n", "\\n")
        .replace(/\s+/g, " ")
        .slice(0, 300);
      return `${tag}${className ? `.${String(className).trim().replace(/\s+/g, ".")}` : ""}="${source}"`;
    })
    .join(" | ");
}
