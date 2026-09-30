/**
 * Version-gated experiment that avoids mounting hundreds of complete Zotero
 * annotation rows when an existing tag filter is relaxed.
 *
 * The React replacement and all of its state are created inside the Reader
 * page realm. React rejects component functions created in Zotero's privileged
 * chrome realm, so do not move the page runtime into this module's own realm.
 */

interface Logger {
  log?(message: string): void;
  warn?(message: string, error?: unknown): void;
}

interface PageRuntime {
  start(): { active?: boolean; reason?: string } | undefined;
  stop(): void;
}

interface ReaderPageWindow {
  eval?(source: string): unknown;
  wrappedJSObject?: ReaderPageWindow;
}

interface CreateNativeAnnotationRowLazyControllerOptions {
  getPageWindow(): unknown;
  hostVersion?: string;
  isEnabled(): boolean;
  logger?: Logger;
}

export interface NativeAnnotationRowLazyController {
  refresh(): void;
  stop(): void;
}

const VERIFIED_ZOTERO_VERSIONS = new Set(["10.0.3"]);
const TRANSIENT_RETRY_DELAY_MS = 250;
const MAX_TRANSIENT_RETRIES = 20;

export function createNativeAnnotationRowLazyController({
  getPageWindow,
  hostVersion,
  isEnabled,
  logger
}: CreateNativeAnnotationRowLazyControllerOptions): NativeAnnotationRowLazyController {
  let runtime: PageRuntime | undefined;
  let runtimeWindow: ReaderPageWindow | undefined;
  let loggedUnsupportedVersion = false;
  let loggedFailureReason = "";
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryAttempts = 0;

  function clearRetry(): void {
    if (retryTimer !== undefined) {
      globalThis.clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  }

  function scheduleRetry(): void {
    if (retryTimer !== undefined || retryAttempts >= MAX_TRANSIENT_RETRIES) return;
    retryAttempts += 1;
    retryTimer = globalThis.setTimeout(() => {
      retryTimer = undefined;
      controller.refresh();
    }, TRANSIENT_RETRY_DELAY_MS);
  }

  function stopRuntime(): void {
    if (!runtime) return;
    try {
      runtime.stop();
    } catch (error) {
      logger?.warn?.(
        "[annotation-markdown] native row lazy rendering cleanup failed",
        error
      );
    }
    runtime = undefined;
    runtimeWindow = undefined;
  }

  const controller: NativeAnnotationRowLazyController = {
    refresh() {
      if (!isEnabled()) {
        clearRetry();
        retryAttempts = 0;
        stopRuntime();
        return;
      }

      if (!hostVersion || !VERIFIED_ZOTERO_VERSIONS.has(hostVersion)) {
        clearRetry();
        retryAttempts = 0;
        stopRuntime();
        if (!loggedUnsupportedVersion) {
          logger?.log?.(
            `[annotation-markdown] native row lazy rendering unavailable for Zotero ${hostVersion ?? "unknown"}`
          );
          loggedUnsupportedVersion = true;
        }
        return;
      }

      const candidate = getPageWindow() as ReaderPageWindow | null | undefined;
      const pageWindow = candidate?.wrappedJSObject ?? candidate;
      if (!pageWindow?.eval) {
        stopRuntime();
        return;
      }
      if (runtime && runtimeWindow === pageWindow) {
        return;
      }

      stopRuntime();
      try {
        const installed = pageWindow.eval(
          NATIVE_ANNOTATION_ROW_LAZY_PAGE_SOURCE
        ) as PageRuntime | undefined;
        if (!installed?.start || !installed?.stop) {
          return;
        }
        const result = installed.start();
        if (result?.active !== true) {
          if (result?.reason && result.reason !== loggedFailureReason) {
            logger?.log?.(
              `[annotation-markdown] native row lazy rendering not armed: ${result.reason}`
            );
            loggedFailureReason = result.reason;
          }
          installed.stop();
          if (result?.reason === "annotation-row") {
            scheduleRetry();
          }
          return;
        }
        clearRetry();
        retryAttempts = 0;
        loggedFailureReason = "";
        runtime = installed;
        runtimeWindow = pageWindow;
      } catch (error) {
        logger?.warn?.(
          "[annotation-markdown] native row lazy rendering fell back to Zotero",
          error
        );
      }
    },

    stop() {
      clearRetry();
      retryAttempts = 0;
      stopRuntime();
    }
  };

  return controller;
}

/**
 * This expression returns a small page-owned lifecycle API. Keep the selector
 * and fiber checks intentionally strict: an unknown Zotero Reader shape must
 * fall back to the native list instead of attempting a best-effort patch.
 */
export const NATIVE_ANNOTATION_ROW_LAZY_PAGE_SOURCE = String.raw`(() => {
  const GLOBAL_KEY = "__annotationMarkdownNativeRowLazyV1";
  const MIN_CACHED_ROWS = 100;
  const MIN_RESTORED_ROWS = 10;
  const ROOT_MARGIN = "600px 0px";
  const ACTIVATION_RESET_MS = 1000;
  const RESTORE_BATCH_SIZE = 8;

  const previous = window[GLOBAL_KEY];
  if (previous && typeof previous.stop === "function") {
    previous.stop();
  }

  const state = {
    active: false,
    enabled: false,
    started: false,
    heights: new Map(),
    positions: new Map(),
    layoutSignature: "",
    memo: null,
    original: null,
    wrapper: null,
    resetTimer: 0,
    recoveryTimer: 0,
    stopping: false,
    listeners: new Set(),
    failureReason: "",
    activations: 0,
    wrapperCalls: 0,
    shellCalls: 0,
    lastDecision: "idle"
  };

  function getScroller() {
    return document.querySelector("#annotations.annotations");
  }

  function getRows() {
    const scroller = getScroller();
    return scroller
      ? Array.from(scroller.children).filter(row => row.matches(".annotation[data-sidebar-annotation-id]"))
      : [];
  }

  function getLayoutSignature() {
    const scroller = getScroller();
    const view = document.querySelector("#annotationsView");
    const bodyStyle = document.body ? window.getComputedStyle(document.body) : null;
    return JSON.stringify([
      view ? view.clientWidth : (scroller ? scroller.clientWidth : 0),
      window.devicePixelRatio || 1,
      bodyStyle ? bodyStyle.fontFamily : "",
      bodyStyle ? bodyStyle.fontSize : "",
      bodyStyle ? bodyStyle.lineHeight : ""
    ]);
  }

  function clearActivation() {
    state.active = false;
    if (state.resetTimer) {
      window.clearTimeout(state.resetTimer);
      state.resetTimer = 0;
    }
  }

  function captureRows() {
    const rows = getRows();
    if (rows.length < MIN_CACHED_ROWS) return false;
    if (state.heights.size >= MIN_CACHED_ROWS && rows.length < state.heights.size) return false;

    const signature = getLayoutSignature();
    if (state.layoutSignature && state.layoutSignature !== signature) {
      state.heights.clear();
      state.positions.clear();
    }

    const measured = [];
    let top = 0;
    for (const row of rows) {
      const id = row.getAttribute("data-sidebar-annotation-id");
      const height = row.getBoundingClientRect().height;
      if (!id || !Number.isFinite(height) || height <= 0) return false;
      measured.push([id, height, top, !row.classList.contains("selected")]);
      top += height;
    }

    state.layoutSignature = signature;
    state.heights.clear();
    state.positions.clear();
    for (const [id, height, rowTop, cacheHeight] of measured) {
      if (cacheHeight) state.heights.set(id, height);
      state.positions.set(id, { top: rowTop, bottom: rowTop + height });
    }
    return true;
  }

  function isNearViewport(id) {
    const scroller = getScroller();
    const position = state.positions.get(id);
    if (!scroller || !position) return false;
    const margin = 600;
    const viewportTop = scroller.scrollTop - margin;
    const viewportBottom = scroller.scrollTop + scroller.clientHeight + margin;
    return position.bottom >= viewportTop && position.top <= viewportBottom;
  }

  function findHook() {
    if (
      !window.React ||
      window.React.version !== "18.3.1" ||
      typeof window.React.createElement !== "function" ||
      typeof window.React.useState !== "function" ||
      typeof window.React.useEffect !== "function" ||
      typeof window.React.useLayoutEffect !== "function" ||
      typeof window.ReactDOM?.flushSync !== "function" ||
      typeof window.IntersectionObserver !== "function"
    ) {
      state.failureReason = "react-api";
      return null;
    }

    const rows = getRows();
    const row = rows[0];
    if (!row) {
      state.failureReason = "annotation-row";
      return null;
    }
    const fiberKey = Object.getOwnPropertyNames(row)
      .find(key => key.startsWith("__reactFiber$"));
    const hostFiber = fiberKey ? row[fiberKey] : null;
    const directFiber = hostFiber?.return;
    const staleWrapperFiber = directFiber?.return;
    const directSource = typeof directFiber?.type === "function" ? String(directFiber.type) : "";
    const directMatch = directFiber?.tag === 15 &&
      directFiber.elementType?.type === directFiber.type &&
      directSource.includes('"data-sidebar-annotation-id"') &&
      directSource.includes("SidebarPreview");
    const staleSource = typeof directFiber?.type === "function" ? String(directFiber.type) : "";
    const staleMatch = directFiber?.tag === 0 &&
      staleWrapperFiber?.tag === 15 &&
      staleWrapperFiber.elementType?.type === directFiber.type &&
      staleSource.includes('"data-sidebar-annotation-id"') &&
      staleSource.includes("SidebarPreview");
    const memo = directMatch
      ? directFiber.elementType
      : staleMatch
        ? staleWrapperFiber.elementType
        : null;
    const original = directMatch
      ? directFiber.type
      : staleMatch
        ? directFiber.type
        : null;
    const source = typeof original === "function" ? String(original) : "";
    const descriptor = memo ? Object.getOwnPropertyDescriptor(memo, "type") : null;

    if (
      hostFiber?.tag !== 5 ||
      !memo ||
      memo.type !== original ||
      descriptor?.writable !== true ||
      !source.includes('"data-sidebar-annotation-id"') ||
      !source.includes("SidebarPreview")
    ) {
      state.failureReason = "annotation-fiber";
      return null;
    }

    for (const candidate of rows.slice(0, 3)) {
      const key = Object.getOwnPropertyNames(candidate)
        .find(name => name.startsWith("__reactFiber$"));
      const candidateParent = key ? candidate[key]?.return : null;
      const candidateMemo = candidateParent?.tag === 15
        ? candidateParent.elementType
        : candidateParent?.return?.tag === 15
          ? candidateParent.return.elementType
          : null;
      if (!key || candidateMemo !== memo) {
        state.failureReason = "annotation-fiber-consistency";
        return null;
      }
    }
    return { memo, original };
  }

  function findRow(id) {
    return getRows().find(row => row.getAttribute("data-sidebar-annotation-id") === id) || null;
  }

  function clearReservation(row) {
    if (!row?.hasAttribute("data-annotation-markdown-native-row-reserved")) return;
    row.style.removeProperty("min-height");
    row.removeAttribute("data-annotation-markdown-native-row-reserved");
    if (!row.getAttribute("style")) row.removeAttribute("style");
  }

  function clearAllReservations() {
    for (const row of document.querySelectorAll("[data-annotation-markdown-native-row-reserved='true']")) {
      clearReservation(row);
    }
  }

  function finishStop(api) {
    clearAllReservations();
    state.heights.clear();
    state.positions.clear();
    state.listeners.clear();
    state.recoveryTimer = 0;
    state.started = false;
    state.stopping = false;
    if (window[GLOBAL_KEY] === api) delete window[GLOBAL_KEY];
  }

  function restoreNativeRowsInBatches(api, pending) {
    const batch = pending.splice(0, RESTORE_BATCH_SIZE);
    if (batch.length) {
      window.ReactDOM.flushSync(() => {
        for (const materialize of batch) materialize(true);
      });
    }
    if (pending.length) {
      state.recoveryTimer = window.setTimeout(
        () => restoreNativeRowsInBatches(api, pending),
        0
      );
      return;
    }
    finishStop(api);
  }

  function createWrapper() {
    const React = window.React;
    return function AnnotationMarkdownLazyNativeRow(props) {
      state.wrapperCalls += 1;
      const id = props.annotation?.id;
      const cachedHeight = state.heights.get(id);
      const shouldStartAsShell = Boolean(
        state.enabled &&
        state.active &&
        !props.isSelected &&
        !isNearViewport(id) &&
        id &&
        Number.isFinite(cachedHeight) &&
        cachedHeight > 0
      );
      const shellOrigin = React.useRef(shouldStartAsShell);
      const shellRef = React.useRef(null);
      const [materialized, setMaterialized] = React.useState(() => !shouldStartAsShell);

      React.useEffect(() => {
        state.listeners.add(setMaterialized);
        return () => state.listeners.delete(setMaterialized);
      }, []);

      React.useEffect(() => {
        if (materialized || props.isSelected || !state.enabled) return undefined;
        const shell = shellRef.current;
        const root = getScroller();
        if (!shell || !root) {
          setMaterialized(true);
          return undefined;
        }
        const observer = new window.IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) {
            setMaterialized(true);
          }
        }, { root, rootMargin: ROOT_MARGIN });
        observer.observe(shell);
        return () => observer.disconnect();
      }, [materialized, props.isSelected]);

      React.useLayoutEffect(() => {
        if (materialized || props.isSelected || !state.enabled) return undefined;
        const shell = shellRef.current;
        if (!shell) return undefined;
        const handleFocus = () => {
          setMaterialized(true);
          props.onFocus?.(id);
        };
        shell.addEventListener("focus", handleFocus);
        return () => shell.removeEventListener("focus", handleFocus);
      }, [id, materialized, props.isSelected, props.onFocus]);

      React.useLayoutEffect(() => {
        if (!shellOrigin.current || !id) return;
        const row = findRow(id);
        if (!row) return;
        if (props.isSelected || !state.enabled) {
          shellOrigin.current = false;
          clearReservation(row);
          return;
        }
        if (materialized && Number.isFinite(cachedHeight) && cachedHeight > 0) {
          row.style.minHeight = String(cachedHeight) + "px";
          row.setAttribute("data-annotation-markdown-native-row-reserved", "true");
        }
      }, [id, materialized, props.isSelected]);

      if (materialized || props.isSelected || !state.enabled) {
        return React.createElement(state.original, props);
      }

      const height = String(cachedHeight) + "px";
      state.shellCalls += 1;
      return React.createElement("div", {
        ref: shellRef,
        tabIndex: -1,
        className: "annotation annotation-markdown-native-row-shell" + (props.isSelected ? " selected" : ""),
        "data-sidebar-annotation-id": id,
        "data-annotation-markdown-native-row-shell": "true",
        onMouseDown: event => event.stopPropagation(),
        role: "option",
        "aria-labelledby": "page_" + id,
        "aria-describedby": id,
        style: { height, minHeight: height, boxSizing: "border-box" }
      });
    };
  }

  function onClickCapture(event) {
    const button = event.target?.closest?.("#selector .tags .tag[role='checkbox']");
    if (!button) return;

    if (button.getAttribute("aria-checked") !== "true") {
      clearActivation();
      captureRows();
      state.lastDecision = "captured-before-narrowing";
      return;
    }

    const rows = getRows();
    if (
      state.heights.size < MIN_CACHED_ROWS ||
      state.heights.size - rows.length < MIN_RESTORED_ROWS ||
      state.layoutSignature !== getLayoutSignature()
    ) {
      clearActivation();
      state.lastDecision = "insufficient-cache";
      return;
    }

    state.active = true;
    state.activations += 1;
    state.lastDecision = "activated";
    if (state.resetTimer) window.clearTimeout(state.resetTimer);
    state.resetTimer = window.setTimeout(clearActivation, ACTIVATION_RESET_MS);
  }

  function onResize() {
    if (state.layoutSignature && state.layoutSignature !== getLayoutSignature()) {
      clearActivation();
      state.heights.clear();
      state.positions.clear();
      state.layoutSignature = "";
    }
  }

  const api = {
    start() {
      if (state.started) {
        return { active: state.enabled, cachedRows: state.heights.size };
      }
      const hook = findHook();
      if (!hook) return { active: false, cachedRows: 0, reason: state.failureReason };

      state.memo = hook.memo;
      state.original = hook.original;
      state.wrapper = createWrapper();
      state.memo.type = state.wrapper;
      state.enabled = true;
      state.started = true;
      document.addEventListener("click", onClickCapture, true);
      window.addEventListener("resize", onResize);
      captureRows();
      return { active: true, cachedRows: state.heights.size };
    },

    status() {
      return {
        active: state.enabled,
        activationPending: state.active,
        cachedRows: state.heights.size,
        activations: state.activations,
        wrapperCalls: state.wrapperCalls,
        shellCalls: state.shellCalls,
        lastDecision: state.lastDecision
      };
    },

    stop() {
      if (state.stopping) return;
      if (!state.started) {
        if (window[GLOBAL_KEY] === api) delete window[GLOBAL_KEY];
        return;
      }
      state.stopping = true;
      state.enabled = false;
      clearActivation();
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("resize", onResize);
      if (state.memo?.type === state.wrapper) state.memo.type = state.original;
      restoreNativeRowsInBatches(api, Array.from(state.listeners));
    }
  };

  window[GLOBAL_KEY] = api;
  return api;
})()`;
