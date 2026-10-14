/** Isolated startup experiment. Never imported by the production plugin. */
export function createStartupProbeSource(options) {
  return `(${installStartupProbe.toString()})(${JSON.stringify(options)})`;
}

export function installStartupProbe(options) {
  const win = window;
  const React = win.React;
  if (win._reader || win.__AMStartupProbe) throw new Error("Startup interception is too late");
  if (React?.version !== "18.3.1" || typeof win.createReader !== "function") throw new Error("Unsupported Reader runtime");
  const originalCreateElement = React.createElement;
  const originalFactory = win.createReader;
  const originalMemos = new Map();
  const previewWrappers = new WeakMap();
  const signatures = Object.create(null);
  const rowOrder = new Map();
  const pending = new Set();
  const observed = new Map();
  let observer;
  let drainTimer;
  let heartbeat;
  let lastTick;
  let mutationObserver;
  let scrollRoot;
  let lastScrollAt = -Infinity;
  let ignoredScrollTop;
  let anchorFrame;
  let restoreAnchorStyle;
  let running = true;
  const probe = {
    mode: options.mode,
    eagerViewport: Boolean(options.eagerViewport),
    stableScroll: Boolean(options.stableScroll),
    installedBeforeFactory: true,
    factoryAt: null,
    firstRowsMs: null,
    firstFrameMs: null,
    firstNativeContentMs: null,
    firstNativeContentFrameMs: null,
    maxTimerGapMs: 0,
    nativeElementsRequested: 0,
    deferredRows: 0,
    deferredPreviews: 0,
    layout: null,
    cacheCompatible: false,
    materialized: 0,
    errors: []
  };

  function fingerprint(annotation) {
    return JSON.stringify([annotation.type, annotation.color, annotation.text, annotation.comment,
      annotation.tags, annotation.position, Boolean(annotation.image)]);
  }

  function rows() {
    return [...win.document.querySelectorAll("#annotations.annotations > .annotation[data-sidebar-annotation-id]")];
  }

  function counts() {
    return {
      rows: rows().length,
      rowShells: win.document.querySelectorAll("[data-am-startup-row-shell]").length,
      previewShells: win.document.querySelectorAll("[data-am-startup-preview-shell], [data-annotation-markdown-startup-preview]").length,
      markdownPreviews: win.document.querySelectorAll("#annotations [data-annotation-markdown-preview]").length,
      elements: options.measureGeometry === false ? null : win.document.querySelectorAll("#annotations *").length,
      totalHeight: options.measureGeometry === false ? null : win.document.getElementById("annotations")?.scrollHeight ?? 0,
      hidden: win.document.hidden
    };
  }

  function hasVisibleNativeContent() {
    if (options.measureGeometry === false) return false;
    const scroller = win.document.getElementById("annotations");
    if (!scroller || win.document.hidden) return false;
    const viewport = scroller.getBoundingClientRect();
    return rows().some(row => {
      if (row.hasAttribute("data-am-startup-row-shell") || row.querySelector("[data-am-startup-preview-shell], [data-annotation-markdown-startup-preview]")) return false;
      const bounds = row.getBoundingClientRect();
      return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
    });
  }

  function drain() {
    drainTimer = undefined;
    if (options.stableScroll && win.performance.now() - lastScrollAt < 120) {
      drainTimer = win.setTimeout(drain, 120);
      return;
    }
    let anchor;
    let anchorTop;
    if (options.stableScroll && scrollRoot && pending.size) {
      const viewport = scrollRoot.getBoundingClientRect();
      const candidates = rows();
      // Preserve the first visible outer row. Binary search avoids reading the
      // geometry of hundreds of rows on a distant annotation jump.
      let low = 0;
      let high = candidates.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (candidates[middle].getBoundingClientRect().bottom <= viewport.top) low = middle + 1;
        else high = middle;
      }
      anchor = candidates[low];
      if (anchor && anchor.getBoundingClientRect().top < viewport.bottom) {
        anchorTop = anchor.getBoundingClientRect().top;
        if (!restoreAnchorStyle) {
          const original = scrollRoot.style.overflowAnchor;
          const root = scrollRoot;
          restoreAnchorStyle = () => { root.style.overflowAnchor = original; restoreAnchorStyle = undefined; };
        }
        scrollRoot.style.overflowAnchor = "none";
      } else anchor = undefined;
    }
    const started = win.performance.now();
    let count = 0;
    for (const setter of pending) {
      pending.delete(setter);
      win.ReactDOM.flushSync(() => setter(true));
      probe.materialized++;
      if (++count >= 2 || win.performance.now() - started >= 8) break;
    }
    if (anchor?.isConnected) {
      const delta = anchor.getBoundingClientRect().top - anchorTop;
      if (delta) {
        scrollRoot.scrollTop += delta;
        ignoredScrollTop = scrollRoot.scrollTop;
      }
    }
    if (restoreAnchorStyle) {
      if (anchorFrame) win.cancelAnimationFrame(anchorFrame);
      anchorFrame = win.requestAnimationFrame(() => {
        anchorFrame = undefined;
        restoreAnchorStyle?.();
      });
    }
    if (running && pending.size) drainTimer = win.setTimeout(drain, 0);
  }

  function onScroll() {
    if (scrollRoot.scrollTop === ignoredScrollTop) { ignoredScrollTop = undefined; return; }
    ignoredScrollTop = undefined;
    lastScrollAt = win.performance.now();
  }

  function enqueue(setter) {
    if (!running) return;
    pending.add(setter);
    if (!drainTimer) drainTimer = win.setTimeout(drain, 0);
  }

  function observe(element, setter) {
    if (!observer) {
      scrollRoot = win.document.getElementById("annotations");
      if (options.stableScroll) scrollRoot.addEventListener("scroll", onScroll, { passive: true });
      observer = new win.IntersectionObserver(entries => {
        for (const entry of entries) {
          const setter = observed.get(entry.target);
          if (!setter) continue;
          if (entry.isIntersecting) enqueue(setter);
          else if (options.stableScroll) pending.delete(setter);
        }
      }, { root: scrollRoot, rootMargin: "600px 0px" });
    }
    observed.set(element, setter);
    observer.observe(element);
    return () => { observer.unobserve(element); observed.delete(element); pending.delete(setter); };
  }

  function lazyComponent(original, previewOnly) {
    return function StartupDeferredNativeContent(props) {
      const id = props.annotation?.id;
      const cached = options.cache?.items?.[id];
      const eligible = previewOnly || Boolean(probe.cacheCompatible && cached?.height > 0
        && cached.fingerprint === fingerprint(props.annotation));
      const selected = Boolean(props.isSelected || props.selected);
      // A quick shell frame is not a quick readable frame. Keep the initial
      // viewport synchronous; defer only the remainder in this variant.
      const eager = options.eagerViewport && (previewOnly
        ? (rowOrder.get(id) ?? Infinity) < Math.ceil((win.innerHeight || 600) / 100) + 2
        : Number.isFinite(cached?.top) && cached.top + cached.height > 0 && cached.top < (win.innerHeight || 600) + 200);
      const [ready, setReady] = React.useState(() => selected || !eligible || eager);
      const ref = React.useRef(null);
      React.useEffect(() => {
        if (ready || selected || !eligible) return;
        if (!ref.current) { setReady(true); return; }
        return observe(ref.current, setReady);
      }, [ready, selected, eligible]);
      React.useLayoutEffect(() => {
        if (previewOnly || !eligible || selected || !ready) return;
        const row = win.CSS?.escape
          ? win.document.querySelector(`#annotations > .annotation[data-sidebar-annotation-id="${win.CSS.escape(id)}"]`)
          : rows().find(row => row.dataset.sidebarAnnotationId === id);
        if (!row) return;
        const previous = row.style.minHeight;
        const reserved = `${cached.height}px`;
        row.style.minHeight = reserved;
        return () => { if (row.style.minHeight === reserved) row.style.minHeight = previous; };
      }, [ready, selected, eligible, id]);
      React.useLayoutEffect(() => {
        if (!ref.current || ready || selected) return;
        const onFocus = () => { setReady(true); props.onFocus?.(id); };
        ref.current.addEventListener("focus", onFocus);
        return () => ref.current?.removeEventListener("focus", onFocus);
      }, [ready, selected, id]);
      if (ready || selected || !eligible) return originalCreateElement(original, props);
      if (previewOnly) {
        probe.deferredPreviews++;
        return originalCreateElement("div", {
          ref, className: "preview", "data-am-startup-preview-shell": "true", style: { minHeight: "100px" }
        });
      }
      probe.deferredRows++;
      return originalCreateElement("div", {
        ref, className: "annotation", tabIndex: -1,
        "data-sidebar-annotation-id": id, "data-am-startup-row-shell": "true",
        style: { height: `${cached.height}px`, minHeight: `${cached.height}px`, boxSizing: "border-box" }
      });
    };
  }

  React.createElement = function (type, props, ...children) {
    const inner = type && typeof type === "object" ? type.type : null;
    const nativeRow = typeof inner === "function" && type.$$typeof === Symbol.for("react.memo")
      && String(inner).includes('"data-sidebar-annotation-id"') && String(inner).includes("SidebarPreview");
    if (nativeRow && props?.annotation) {
      probe.nativeElementsRequested++;
      signatures[props.annotation.id] = fingerprint(props.annotation);
      if (!rowOrder.has(props.annotation.id)) rowOrder.set(props.annotation.id, rowOrder.size);
      if (options.mode === "cached-rows" && !originalMemos.has(type)
        && Object.getOwnPropertyDescriptor(type, "type")?.writable) {
        originalMemos.set(type, inner);
        type.type = lazyComponent(inner, false);
      }
    }
    if (options.mode === "preview-lazy" && typeof type === "function" && type.name === "SidebarPreview"
      && String(type).includes("lastImageRef") && String(type).includes("annotation.image")) {
      if (!previewWrappers.has(type)) previewWrappers.set(type, lazyComponent(type, true));
      type = previewWrappers.get(type);
    }
    return originalCreateElement(type, props, ...children);
  };

  win.createReader = function (factoryOptions) {
    win.document.dispatchEvent(new win.Event("AMStartupFactoryEntered"));
    factoryOptions.sidebarOpen = true;
    factoryOptions.sidebarView = "annotations";
    const style = win.getComputedStyle(win.document.body);
    probe.layout = JSON.stringify([factoryOptions.type, factoryOptions.sidebarWidth, factoryOptions.fontSize,
      win.devicePixelRatio, style.fontFamily, style.fontSize, style.lineHeight, options.layoutToken]);
    probe.cacheCompatible = options.cache?.layout === probe.layout;
    probe.factoryAt = win.performance.now();
    lastTick = probe.factoryAt;
    heartbeat = win.setInterval(() => {
      const now = win.performance.now();
      probe.maxTimerGapMs = Math.max(probe.maxTimerGapMs, now - lastTick);
      lastTick = now;
    }, 16);
    mutationObserver = new win.MutationObserver(() => {
      if (probe.firstRowsMs === null && rows().length) {
        win.document.dispatchEvent(new win.Event("AMStartupRowsCommitted"));
        probe.firstRowsMs = win.performance.now() - probe.factoryAt;
        probe.firstRowsCounts = counts();
        win.requestAnimationFrame(() => {
          probe.firstFrameMs = win.performance.now() - probe.factoryAt;
          probe.firstFrameCounts = counts();
        });
      }
      if (probe.firstNativeContentMs === null && hasVisibleNativeContent()) {
        probe.firstNativeContentMs = win.performance.now() - probe.factoryAt;
        win.requestAnimationFrame(() => {
          probe.firstNativeContentFrameMs = win.performance.now() - probe.factoryAt;
        });
      }
    });
    mutationObserver.observe(win.document.body, { childList: true, subtree: true });
    const reader = Reflect.apply(originalFactory, this, [factoryOptions]);
    win.document.dispatchEvent(new win.Event("AMStartupFactoryReturned"));
    return reader;
  };

  probe.snapshot = () => ({
    layout: probe.layout,
    items: Object.fromEntries(rows().filter(row => !row.classList.contains("selected")
      && !row.hasAttribute("data-am-startup-row-shell")).map(row => [row.dataset.sidebarAnnotationId,
      { height: row.getBoundingClientRect().height,
        top: row.getBoundingClientRect().top - win.document.getElementById("annotations").getBoundingClientRect().top
          + win.document.getElementById("annotations").scrollTop,
        fingerprint: signatures[row.dataset.sidebarAnnotationId] }]))
  });
  probe.summary = () => ({ mode: probe.mode, eagerViewport: probe.eagerViewport, stableScroll: probe.stableScroll,
    installedBeforeFactory: probe.installedBeforeFactory,
    firstRowsMs: probe.firstRowsMs, firstFrameMs: probe.firstFrameMs, maxTimerGapMs: probe.maxTimerGapMs,
    firstNativeContentMs: probe.firstNativeContentMs, firstNativeContentFrameMs: probe.firstNativeContentFrameMs,
    nativeElementsRequested: probe.nativeElementsRequested, deferredRows: probe.deferredRows,
    deferredPreviews: probe.deferredPreviews, cacheCompatible: probe.cacheCompatible,
    materialized: probe.materialized, firstRowsCounts: probe.firstRowsCounts,
    firstFrameCounts: probe.firstFrameCounts, settled: counts() });
  probe.stop = () => {
    running = false;
    if (drainTimer) win.clearTimeout(drainTimer);
    if (heartbeat) win.clearInterval(heartbeat);
    if (anchorFrame) win.cancelAnimationFrame(anchorFrame);
    restoreAnchorStyle?.();
    scrollRoot?.removeEventListener("scroll", onScroll);
    observer?.disconnect();
    mutationObserver?.disconnect();
    pending.clear(); observed.clear();
    React.createElement = originalCreateElement;
    win.createReader = originalFactory;
    for (const [memo, original] of originalMemos) memo.type = original;
    delete win.__AMStartupProbe;
  };
  win.__AMStartupProbe = probe;
  return probe;
}
