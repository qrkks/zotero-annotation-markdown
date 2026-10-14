/** Reversible, capability-gated hooks installed before native Reader creation. */
interface PageRuntime {
  stop(closing?: boolean): void;
  status(): { active: boolean };
}
interface PageWindow {
  eval?(source: string): unknown;
  wrappedJSObject?: PageWindow;
  addEventListener?(name: string, callback: () => void, options?: { once: boolean }): void;
  removeEventListener?(name: string, callback: () => void): void;
}
interface EarlyReader {
  _internalReader?: unknown;
  _iframeWindow?: PageWindow | null;
  _waitForReader?: (...args: unknown[]) => unknown;
}
interface Options {
  readerApi?: { _readers?: unknown };
  isEnabled(): boolean;
  logger?: { log?(message: string): void; warn?(message: string, error?: unknown): void };
}

export function createReaderStartupLazyManager({ readerApi, isEnabled, logger }: Options) {
  let active = false;
  let restoreCollection: (() => void) | undefined;
  const pending = new Map<EarlyReader, () => void>();
  const pages = new Map<PageWindow, { runtime: PageRuntime; unload: () => void }>();

  function install(reader: EarlyReader) {
    if (!active || !isEnabled() || reader._internalReader) return;
    const candidate = reader._iframeWindow;
    const page = candidate?.wrappedJSObject ?? candidate;
    if (!page?.eval || pages.has(page)) return;
    try {
      const runtime = page.eval(READER_STARTUP_LAZY_PAGE_SOURCE) as PageRuntime | undefined;
      if (!runtime?.stop || !runtime.status) {
        logger?.log?.("[annotation-markdown] startup preview hook unavailable; using native Reader");
        return;
      }
      const unload = () => {
        try { runtime.stop(true); } finally { pages.delete(page); }
      };
      pages.set(page, { runtime, unload });
      page.addEventListener?.("unload", unload, { once: true });
    } catch (error) {
      const owned = pages.get(page);
      if (owned) {
        pages.delete(page);
        try { owned.runtime.stop(true); } catch { /* The page may already be destroyed. */ }
      }
      logger?.warn?.("[annotation-markdown] startup preview hook fell back to native Reader", error);
    }
  }

  function prepare(reader: EarlyReader) {
    if (!active || !isEnabled() || !reader || reader._internalReader || pending.has(reader)) return;
    const original = reader._waitForReader;
    if (typeof original !== "function") return;
    const descriptor = Object.getOwnPropertyDescriptor(reader, "_waitForReader");
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) return;
    if (!descriptor && !Object.isExtensible(reader)) return;
    const restore = () => {
      try {
        if (reader._waitForReader === wrapper) {
          if (descriptor) Object.defineProperty(reader, "_waitForReader", descriptor);
          else delete reader._waitForReader;
        }
      } catch { /* Teardown or a later frozen descriptor must not reject native readiness. */ }
      finally { pending.delete(reader); }
    };
    const wrapper = function(this: EarlyReader, ...args: unknown[]) {
      let result;
      try { result = Reflect.apply(original, this, args); }
      catch (error) { restore(); throw error; }
      return Promise.resolve(result).then(value => {
        restore();
        install(reader);
        return value;
      }, error => { restore(); throw error; });
    };
    try {
      Object.defineProperty(reader, "_waitForReader", { configurable: true, writable: true, value: wrapper });
      pending.set(reader, restore);
    } catch (error) {
      logger?.warn?.("[annotation-markdown] could not prepare early Reader hook", error);
    }
  }

  function stop() {
    active = false;
    try { restoreCollection?.(); }
    catch (error) { logger?.warn?.("[annotation-markdown] startup collection cleanup skipped", error); }
    restoreCollection = undefined;
    for (const restore of [...pending.values()]) restore();
    for (const [page, { runtime, unload }] of pages) {
      try {
        page.removeEventListener?.("unload", unload);
        runtime.stop();
      } catch (error) { logger?.warn?.("[annotation-markdown] startup preview cleanup failed", error); }
    }
    pages.clear();
  }

  return {
    refresh() {
      if (!isEnabled()) { stop(); return; }
      if (active) return;
      const collection = readerApi?._readers;
      if (!Array.isArray(collection)) return;
      const descriptor = Object.getOwnPropertyDescriptor(collection, "push");
      if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) return;
      if (!descriptor && !Object.isExtensible(collection)) return;
      const original = collection.push;
      if (typeof original !== "function") return;
      const wrapper = function(this: EarlyReader[], ...readers: EarlyReader[]) {
        const length = Reflect.apply(original, this, readers);
        // Patch this collection only, never Array.prototype or another array.
        if (this === collection && active) for (const reader of readers) {
          try { prepare(reader); }
          catch (error) { logger?.warn?.("[annotation-markdown] early Reader preparation skipped", error); }
        }
        return length;
      };
      try {
        Object.defineProperty(collection, "push", { configurable: true, writable: true, value: wrapper });
        restoreCollection = () => {
          if (collection.push !== wrapper) return;
          if (descriptor) Object.defineProperty(collection, "push", descriptor);
          else delete (collection as unknown as { push?: unknown }).push;
        };
        active = true;
        for (const reader of collection) prepare(reader);
      } catch (error) { stop(); logger?.warn?.("[annotation-markdown] early Reader collection hook unavailable", error); }
    },
    stop
  };
}

/** All component functions must be created in the Reader's own JS realm. */
export const READER_STARTUP_LAZY_PAGE_SOURCE = String.raw`(() => {
  const KEY = "__annotationMarkdownReaderStartupV1";
  const MARKER = "data-annotation-markdown-startup-preview";
  const React = window.React;
  if (window[KEY]?.status().active) return window[KEY];
  if (window._reader || React?.version !== "18.3.1" || typeof window.createReader !== "function"
    || !["createElement", "useState", "useRef", "useEffect", "useLayoutEffect"].every(key => typeof React[key] === "function")
    || typeof window.ReactDOM?.flushSync !== "function" || typeof window.IntersectionObserver !== "function") return;
  const elementDescriptor = Object.getOwnPropertyDescriptor(React, "createElement");
  const factoryDescriptor = Object.getOwnPropertyDescriptor(window, "createReader");
  if (!elementDescriptor?.writable || !factoryDescriptor?.writable) return;
  const originalElement = React.createElement;
  const originalFactory = window.createReader;
  const wrappers = new WeakMap();
  const order = new Map();
  const observed = new Map();
  const listeners = new Set();
  const recoveryPending = new Set();
  const selectedListeners = new Set();
  const queue = new Set();
  let enabled = true, large = false, observer, scroller, timer, frame;
  let lastScrollAt = -Infinity, ignoredScrollTop, restoreAnchor;
  let stopping = false, closing = false, finished = false, recovery, recovered = 0;
  let nextBatchDelay = 16, scheduledAt = 0;
  let navigation, navigationTimer;
  let bodyReady = false, bodyReason = "waiting", bodyTimer, bodyFrames = [], idleTask;
  let factoryAt, pdfCanvasMs = null, bodyFrameMs = null, detachPageEvent;
  const now = () => window.performance.now();

  function clearBodyWait() {
    if (bodyTimer) window.clearTimeout(bodyTimer);
    bodyTimer = undefined;
    for (const id of bodyFrames) window.cancelAnimationFrame(id);
    bodyFrames = [];
    try { detachPageEvent?.(); } catch { /* The PDF iframe may already be destroyed. */ }
    detachPageEvent = undefined;
  }
  function releaseBody(reason) {
    if (!enabled || bodyReady) return;
    clearBodyWait(); bodyReady = true; bodyReason = reason; bodyFrameMs = now()-factoryAt;
    // Explicitly selected content goes first; the rest is the current observed
    // range, not every deferred preview in the document.
    const nearby = [...queue]; queue.clear();
    for (const setter of selectedListeners) queue.add(setter);
    for (const setter of nearby) queue.add(setter);
    schedule();
  }
  function yieldBodyFrames(reason) {
    if (bodyFrames.length || bodyReady || !enabled) return;
    bodyFrames.push(window.requestAnimationFrame(() => {
      if (!enabled) return;
      bodyFrames.push(window.requestAnimationFrame(() => releaseBody(reason)));
    }));
  }
  function waitForBody(reader,type) {
    const started = now();
    const initialized = reader?._primaryView?.initializedPromise;
    if (type !== "pdf") {
      Promise.resolve(reader?._primaryView?.initializedPromise).then(
        () => { if (enabled) yieldBodyFrames("view-initialized"); },
        () => { if (enabled) yieldBodyFrames("view-error-fallback"); }
      );
      bodyTimer = window.setTimeout(() => yieldBodyFrames("view-timeout-fallback"),10000);
      return;
    }
    let viewInitialized = typeof initialized?.then !== "function", observedLoadingTask;
    if (!viewInitialized) Promise.resolve(initialized).then(
      () => { viewInitialized = true; if (enabled) check(); },
      () => { if (enabled) yieldBodyFrames("pdf-error-fallback"); }
    );
    function check() {
      if (bodyTimer) window.clearTimeout(bodyTimer);
      bodyTimer = undefined;
      if (!enabled || bodyReady || bodyFrames.length) return;
      let loadingOrAwaitingVisibility = false, failedPage = false;
      try {
        const viewWindow = reader?._primaryView?._iframeWindow;
        const app = viewWindow?.PDFViewerApplication;
        const viewer = app?.pdfViewer;
        const loadingTask = app?.pdfLoadingTask;
        if (loadingTask && loadingTask !== observedLoadingTask && typeof loadingTask.promise?.then === "function") {
          observedLoadingTask = loadingTask;
          Promise.resolve(loadingTask.promise).catch(() => {
            if (enabled && !bodyReady && app.pdfLoadingTask === loadingTask) yieldBodyFrames("pdf-error-fallback");
          });
        }
        if (!detachPageEvent && typeof app?.eventBus?.on === "function" && typeof app?.eventBus?.off === "function") {
          const bus = app.eventBus;
          const rendered = event => { if (!event?.error && !event?.cssTransform) check(); };
          bus.on("pagerendered",rendered);
          detachPageEvent = () => bus.off("pagerendered",rendered);
        }
        const page = viewer?.getPageView?.(viewer.currentPageNumber-1);
        const canvas = page?.canvas;
        const container = viewWindow?.document.getElementById("viewerContainer");
        failedPage = !!page?._renderError;
        // A supported PDF viewer may spend much longer than ten seconds
        // loading/restoring a document. Its timeout is not evidence of failure.
        // Also keep background/offscreen pages deferred until they are visible.
        loadingOrAwaitingVisibility = !failedPage
          && typeof viewer?.getPageView === "function"
          && Number.isInteger(viewer.currentPageNumber) && viewer.currentPageNumber > 0
          && (!page || (Number.isInteger(page.renderingState) && page.renderingState >= 0
            && page.renderingState <= 3 && (page.renderingState !== 3 || !!canvas)));
        if (viewInitialized && page?.renderingState === 3 && !page._renderError && canvas?.width > 0 && canvas?.height > 0 && canvas.isConnected && !canvas.hidden && container && !window.document.hidden) {
          const bounds = canvas.getBoundingClientRect(), viewport = container.getBoundingClientRect();
          if (bounds.width > 0 && bounds.height > 0 && bounds.bottom > viewport.top && bounds.top < viewport.bottom && bounds.right > viewport.left && bounds.left < viewport.right) {
            pdfCanvasMs = now()-factoryAt;
            yieldBodyFrames("pdf-painted");
            return;
          }
        }
      } catch { /* An unknown/private PDF view shape uses the bounded fallback. */ }
      if (now()-started >= 10000 && !loadingOrAwaitingVisibility) {
        yieldBodyFrames(failedPage ? "pdf-error-fallback" : "pdf-timeout-fallback"); return;
      }
      if (bodyTimer) window.clearTimeout(bodyTimer);
      bodyTimer = window.setTimeout(check,window.document.hidden ? 250 : 50);
    }
    check();
  }

  function cancelNavigation() {
    if (navigationTimer) window.clearTimeout(navigationTimer);
    navigationTimer = undefined; navigation = undefined;
  }
  function repairNavigation() {
    navigationTimer = undefined;
    if (!enabled || !navigation) return;
    const root = window.document.getElementById("annotations");
    const selected = root ? Array.from(root.children).filter(row => row.matches(".annotation.selected")) : [];
    const row = selected.length === 1 && selected[0].getAttribute("data-sidebar-annotation-id") === navigation.id ? selected[0] : null;
    if (!row) { cancelNavigation(); return; }
    const viewport = root.getBoundingClientRect(), bounds = row.getBoundingClientRect();
    const delta = bounds.top < viewport.top || bounds.height > viewport.height
      ? bounds.top - viewport.top : bounds.bottom > viewport.bottom ? bounds.bottom - viewport.bottom : 0;
    if (delta) {
      // Instant correction avoids cancelling and restarting a native smooth
      // jump whenever deferred content above its target changes height.
      root.scrollTop += delta;
      if (root === scroller) ignoredScrollTop = root.scrollTop;
      navigation.visibleSince = now();
    } else if (navigation.visibleSince === undefined) navigation.visibleSince = now();
    navigation.hold = now() - navigation.visibleSince < 150;
    if (now() >= navigation.until) { cancelNavigation(); return; }
    navigationTimer = window.setTimeout(repairNavigation,50);
  }
  function beginNavigation(id) {
    cancelNavigation();
    navigation = {id,until:now()+2500,hold:true,visibleSince:undefined};
    navigationTimer = window.setTimeout(repairNavigation,0);
  }

  function rows() {
    return scroller ? Array.from(scroller.children).filter(row => row.matches(".annotation[data-sidebar-annotation-id]")) : [];
  }
  function onScroll() {
    if (scroller.scrollTop === ignoredScrollTop) { ignoredScrollTop = undefined; return; }
    ignoredScrollTop = undefined; lastScrollAt = now();
  }
  function withAnchor(action) {
    if (!scroller) { action(); return; }
    const viewport = scroller.getBoundingClientRect();
    const candidates = rows();
    let low = 0, high = candidates.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (candidates[middle].getBoundingClientRect().bottom <= viewport.top) low = middle + 1;
      else high = middle;
    }
    const anchor = candidates[low];
    const valid = anchor && anchor.getBoundingClientRect().top < viewport.bottom;
    const before = valid ? anchor.getBoundingClientRect().top : 0;
    if (valid) {
      if (!restoreAnchor) {
        const root = scroller, previous = root.style.overflowAnchor;
        restoreAnchor = () => { root.style.overflowAnchor = previous; restoreAnchor = undefined; };
      }
      scroller.style.overflowAnchor = "none";
    }
    try { action(); }
    finally {
      if (valid && anchor.isConnected) {
        const delta = anchor.getBoundingClientRect().top - before;
        if (delta) { scroller.scrollTop += delta; ignoredScrollTop = scroller.scrollTop; }
      }
      if (restoreAnchor) {
        if (frame) window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => { frame = undefined; restoreAnchor?.(); });
      }
    }
  }
  function schedule() {
    if (timer || idleTask || !enabled || !bodyReady || !queue.size) return;
    scheduledAt = now();
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!enabled || !bodyReady) return;
      if (typeof window.requestIdleCallback === "function") {
        idleTask = window.requestIdleCallback(deadline => {
          idleTask = undefined;
          if (!deadline.didTimeout && deadline.timeRemaining() < 4) { schedule(); return; }
          drain();
        }, { timeout:250 });
      } else drain();
    },nextBatchDelay);
  }
  function drain() {
    timer = undefined;
    if (!enabled || !bodyReady) return;
    // Observe delayed host layout/a11y work after the preceding commit as well
    // as JS execution. Yield longer after a congested event-loop turn.
    nextBatchDelay = now() - scheduledAt > 80 ? 64 : 16;
    if (navigation?.hold) { timer = window.setTimeout(drain,50); return; }
    if (now() - lastScrollAt < 120) { timer = window.setTimeout(drain,120); return; }
    const next = queue.values().next().value;
    if (next) {
      queue.delete(next);
      withAnchor(() => window.ReactDOM.flushSync(() => next(true)));
    }
    schedule();
  }
  function observe(element, setter) {
    const root = window.document.getElementById("annotations");
    if (!root || !enabled) { setter(true); return () => {}; }
    if (root !== scroller) {
      observer?.disconnect(); scroller?.removeEventListener("scroll", onScroll);
      observed.clear(); queue.clear(); scroller = root;
      scroller.addEventListener("scroll", onScroll, { passive: true });
      observer = new window.IntersectionObserver(entries => {
        for (const entry of entries) {
          const setter = observed.get(entry.target);
          if (!setter) continue;
          if (entry.isIntersecting) queue.add(setter); else queue.delete(setter);
        }
        schedule();
      }, { root:scroller, rootMargin:"200px 0px" });
    }
    observed.set(element,setter); observer.observe(element);
    return () => {
      observer?.unobserve(element); observed.delete(element); queue.delete(setter);
    };
  }
  function makeWrapper(original) {
    return function AnnotationMarkdownDeferredPreview(props) {
      const id = props.annotation?.id;
      const selected = Boolean(props.selected || props.isSelected);
      const eager = (order.get(id) ?? Infinity) < Math.ceil((window.innerHeight || 600) / 100) + 2;
      const [ready,setReady] = React.useState(() => !enabled || (bodyReady && (selected || eager)));
      const ref = React.useRef(null);
      React.useLayoutEffect(() => {
        if (selected && enabled && (bodyReady || ready)) beginNavigation(id);
      }, [selected,id,ready]);
      React.useLayoutEffect(() => {
        if (ready || (selected && bodyReady) || !enabled) {
          if (!ready) setReady(true);
          return;
        }
        listeners.add(setReady);
        if (selected) selectedListeners.add(setReady);
        return () => { listeners.delete(setReady); recoveryPending.delete(setReady); selectedListeners.delete(setReady); queue.delete(setReady); };
      }, [ready,selected]);
      React.useEffect(() => {
        if (ready || (selected && bodyReady) || !enabled) return;
        if (!ref.current) { setReady(true); return; }
        return observe(ref.current,setReady);
      }, [ready,selected]);
      if (ready || (selected && bodyReady) || !enabled) return originalElement(original,props);
      return originalElement("div", {
        ref, className:"preview", [MARKER]:"true", "aria-busy":"true",
        style:{ minHeight:"100px" },
        onClick:event => { setReady(true); props.onClickSection?.(id,"header",event); },
        draggable:true,
        onDragStart:event => {
          const row = event.currentTarget.closest(".annotation");
          if (!row || !event.dataTransfer) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          event.dataTransfer.setDragImage(row,event.clientX-bounds.left,event.clientY-bounds.top);
          props.onSetDataTransferAnnotations?.(event.dataTransfer,props.annotation);
          setReady(true);
        },
        onContextMenu:event => {
          if (event.button !== 2 || !props.onOpenContextMenu) return;
          setReady(true); event.stopPropagation(); event.preventDefault();
          props.onOpenContextMenu({ ids:[id], currentID:id, x:event.clientX, y:event.clientY });
        }
      });
    };
  }
  const elementWrapper = function(type,props,...children) {
    if (enabled && large && typeof type === "function" && type.name === "SidebarPreview"
      && props?.annotation && String(type).includes("lastImageRef") && String(type).includes("annotation.image")) {
      if (!wrappers.has(type)) wrappers.set(type,makeWrapper(type));
      type = wrappers.get(type);
    }
    return Reflect.apply(originalElement,this,[type,props,...children]);
  };
  const factoryWrapper = function(options,...args) {
    large = Array.isArray(options?.annotations) && options.annotations.length >= 100;
    factoryAt = now(); bodyReady = !large; bodyReason = large ? "waiting" : "small-list";
    if (large) options.annotations.forEach((annotation,index) => order.set(annotation.id,index));
    try {
      const reader = Reflect.apply(originalFactory,this,[options,...args]);
      if (large) waitForBody(reader || window._reader, options?.type);
      return reader;
    }
    catch (error) { api.stop(true); throw error; }
  };
  function finish() {
    if (finished) return;
    finished = true;
    if (window[KEY] === api) delete window[KEY];
    window.removeEventListener("unload",onUnload);
    cancelNavigation();
    for (const name of ["wheel","pointerdown","touchstart","keydown"]) window.document.removeEventListener(name,cancelNavigation,true);
    if (frame) window.cancelAnimationFrame(frame);
    frame = undefined; restoreAnchor?.();
    clearBodyWait();
    order.clear(); observed.clear(); listeners.clear(); recoveryPending.clear(); selectedListeners.clear(); queue.clear(); scroller = undefined;
  }
  function recover() {
    recovery = undefined;
    if (closing) { finish(); return; }
    if (recoveryPending.size) { recovery = window.setTimeout(recover,16); return; }
    const batch = [];
    for (const setter of listeners) { batch.push(setter); if (batch.length === 8) break; }
    if (!batch.length) { finish(); return; }
    for (const setter of batch) recoveryPending.add(setter);
    // A bounded commit avoids accumulating a large transition while other
    // Reader add-ons keep updating the same tree. Effect cleanup acknowledges
    // completion; recovery uses native scroll anchoring without forced layout.
    const update = () => {
      for (const setter of batch) {
        try { setter(true); recovered++; }
        catch { listeners.delete(setter); recoveryPending.delete(setter); }
      }
    };
    window.ReactDOM.flushSync(update);
    recovery = window.setTimeout(recover,16);
  }
  const api = {
    status() { return { active:enabled, large, bodyReady, bodyReason, pdfCanvasMs, bodyFrameMs, pendingPreviews:listeners.size, recovering:stopping && !closing && !finished, recovered }; },
    stop(readerClosing = false) {
      if (readerClosing) closing = true;
      if (stopping) {
        if (closing) { if (recovery) window.clearTimeout(recovery); finish(); }
        return;
      }
      stopping = true; enabled = false;
      clearBodyWait();
      if (idleTask) window.cancelIdleCallback?.(idleTask); idleTask = undefined;
      cancelNavigation();
      for (const name of ["wheel","pointerdown","touchstart","keydown"]) window.document.removeEventListener(name,cancelNavigation,true);
      if (timer) window.clearTimeout(timer); timer = undefined;
      observer?.disconnect(); observer = undefined; queue.clear(); observed.clear();
      scroller?.removeEventListener("scroll",onScroll);
      if (frame) window.cancelAnimationFrame(frame); frame = undefined; restoreAnchor?.();
      if (React.createElement === elementWrapper) Object.defineProperty(React,"createElement",elementDescriptor);
      if (window.createReader === factoryWrapper) Object.defineProperty(window,"createReader",factoryDescriptor);
      if (closing) finish(); else recovery = window.setTimeout(recover,16);
    }
  };
  const onUnload = () => api.stop(true);
  try {
    React.createElement = elementWrapper; window.createReader = factoryWrapper;
    for (const name of ["wheel","pointerdown","touchstart","keydown"]) window.document.addEventListener(name,cancelNavigation,{capture:true,passive:true});
    window.addEventListener("unload",onUnload, {once:true}); window[KEY] = api;
  } catch (error) { api.stop(true); throw error; }
  return api;
})()`;
