/** Dedicated-profile-only benchmark. Does not modify production entry points. */
async function runReaderStartupAssessment({ root, expectedDataDirectory, attachmentID, smallFixture = false, interactions = false,
  eagerViewport = false, skipWarmup = false, modes, diagnosticLabel, pluginEnabled = false, settleMs = 1200,
  interactionTest = "all", stableScroll = false, measureGeometry = true, captureCache = true, nativeRowLazyEnabled = false,
  productionHooks = false, readerStartupLazyEnabled = false }) {
  if (Zotero.DataDirectory.dir !== expectedDataDirectory || !expectedDataDirectory.includes("Zotero-Dev-Data")) {
    throw new Error("A dedicated development data directory is required");
  }
  if (Zotero.Reader._readers.length) throw new Error("Close existing development Readers first");
  const item = Zotero.Items.get(attachmentID);
  const annotations = item.getAnnotations();
  if (!smallFixture && annotations.length < 100) throw new Error("Large copied stress attachment required");
  const originalComments = annotations.map(annotation => [annotation.id, annotation.annotationComment]);
  const main = Zotero.getMainWindow();
  const delay = ms => new Promise(resolve => main.setTimeout(resolve, ms));
  const source = await IOUtils.readUTF8((root + "/scripts/prototypes/reader-startup-page.mjs").replace(/\//g, "\\"));
  const createSource = new Function(source.replace(/^export /gm, "") + "\nreturn createStartupProbeSource;")();
  const prefix = "extensions.annotationMarkdown.";
  const prefKeys = ["enabled", "popupEnabled", "nativeRowLazy", "readerStartupLazy", "autoTodoTag"];
  const prefs = Object.fromEntries(prefKeys.map(key => [key, Zotero.Prefs.get(prefix + key, true)]));
  const backupPath = (root + "/.tmp/reader-startup-assessment/preferences-before.json").replace(/\//g, "\\");
  await IOUtils.writeUTF8(backupPath, JSON.stringify(prefs, null, 2));
  const state = Zotero.__AMStartupAssessment = { running: true, phase: "warmup", runs: [], error: null };
  if (diagnosticLabel && !/^[a-z0-9-]+$/.test(diagnosticLabel)) throw new Error("Invalid diagnostic label");
  let progressIndex = 0;
  function progress(phase) {
    state.progress = phase;
    if (!diagnosticLabel) return;
    const entry = { phase, annotationCount: annotations.length, mode: state.phase, time: new Date().toISOString() };
    const path = (root + "/.tmp/reader-startup-assessment/" + diagnosticLabel + "-"
      + String(++progressIndex).padStart(2, "0") + ".json").replace(/\//g, "\\");
    // Separate files survive a blocked chrome event loop without depending on
    // another promise callback to serialize the next diagnostic write.
    IOUtils.writeUTF8(path, JSON.stringify(entry)).catch(error => { state.progressError = String(error); });
  }
  let currentReader;
  let restorePush;
  let removeLoad;
  let cache;
  main.restore();
  main.focus();

  async function open(mode, warmup = false) {
    progress("opening-reader");
    const collection = Zotero.Reader._readers;
    const descriptor = Object.getOwnPropertyDescriptor(collection, "push");
    const originalPush = collection.push;
    let injected = false;
    const code = createSource({ mode, eagerViewport, stableScroll, measureGeometry, cache: mode === "cached-rows" ? cache : null,
      layoutToken: JSON.stringify([Zotero.Prefs.get(prefix + "mathOutput", true), Zotero.Prefs.get(prefix + "fontScalePercent", true)]) });
    restorePush = () => {
      if (descriptor) Object.defineProperty(collection, "push", descriptor);
      else delete collection.push;
      restorePush = undefined;
    };
    collection.push = function (...readers) {
      for (const reader of readers) {
        if (reader.itemID !== attachmentID || !reader._window) continue;
        currentReader = reader;
        const outer = reader._window;
        const loaded = event => {
          if (event.target.URL !== "resource://zotero/reader/reader.html") return;
          outer.document.title = "Annotation Markdown startup assessment (dev)";
          const page = event.target.defaultView.wrappedJSObject || event.target.defaultView;
          for (const [eventName, phase] of [["AMStartupFactoryEntered", "native-factory-entered"],
            ["AMStartupFactoryReturned", "native-factory-returned"], ["AMStartupRowsCommitted", "annotation-rows-committed"]]) {
            event.target.addEventListener(eventName, () => progress(phase), { once: true });
          }
          page.eval(code);
          progress("startup-probe-installed");
          injected = true;
          outer.removeEventListener("DOMContentLoaded", loaded);
          removeLoad = undefined;
        };
        outer.addEventListener("DOMContentLoaded", loaded);
        removeLoad = () => outer.removeEventListener("DOMContentLoaded", loaded);
      }
      return Reflect.apply(originalPush, this, readers);
    };
    const started = main.performance.now();
    try {
      currentReader = await Zotero.Reader.open(attachmentID, undefined, { openInWindow: true, allowDuplicate: true });
    } finally { restorePush?.(); }
    progress("reader-open-returned");
    currentReader._window.focus();
    await currentReader._initPromise;
    progress("reader-initialization-resolved");
    currentReader._window.document.title = "Annotation Markdown startup assessment (dev)";
    if (!injected) throw new Error("Missed pre-initialization injection boundary");
    const page = currentReader._iframeWindow.wrappedJSObject || currentReader._iframeWindow;
    const deadline = Date.now() + 15000;
    while (page.__AMStartupProbe.firstRowsMs === null) {
      if (Date.now() > deadline) throw new Error("No native annotation rows");
      await delay(25);
    }
    const openToRowsMs = main.performance.now() - started;
    await delay(settleMs);
    // Detach every object from the page realm before closing that Reader.
    const result = { ...JSON.parse(JSON.stringify(page.__AMStartupProbe.summary())), openToRowsMs,
      visibility: page.document.visibilityState, warmup, pluginEnabled, nativeRowLazyEnabled, readerStartupLazyEnabled,
      nativeRowStatus: page.__annotationMarkdownNativeRowLazyV1?.status
        ? JSON.parse(JSON.stringify(page.__annotationMarkdownNativeRowLazyV1.status())) : null };
    result.startupStatus = page.__annotationMarkdownReaderStartupV1?.status
      ? JSON.parse(JSON.stringify(page.__annotationMarkdownReaderStartupV1.status())) : null;
    if (mode === "baseline" && captureCache) cache = JSON.parse(JSON.stringify(page.__AMStartupProbe.snapshot()));
    if (interactions && (mode !== "baseline" || productionHooks)) {
      const beforeIDs = [...page.document.querySelectorAll("#annotations > .annotation")].map(row => row.dataset.sidebarAnnotationId);
      const target = [...page.document.querySelectorAll("#annotations > .annotation")].reverse()
        .find(row => row.hasAttribute("data-am-startup-row-shell") || row.querySelector("[data-am-startup-preview-shell], [data-annotation-markdown-startup-preview]"));
      if (!target) throw new Error("Interaction fixture has no deferred row");
      const id = target.dataset.sidebarAnnotationId;
      let selectionToVisibleMs = null;
      if (["all", "selection"].includes(interactionTest)) {
        const selectionStarted = main.performance.now();
        page.eval(`window._reader.setSelectedAnnotations(${JSON.stringify([id])}, true)`);
        const selectionDeadline = Date.now() + 2500;
        do {
          await delay(50);
          const row = [...page.document.querySelectorAll("#annotations > .annotation")]
            .find(row => row.dataset.sidebarAnnotationId === id);
          const viewport = page.document.getElementById("annotations").getBoundingClientRect();
          const bounds = row.getBoundingClientRect();
          if (row.classList.contains("selected") && !row.querySelector("[data-am-startup-preview-shell], [data-annotation-markdown-startup-preview]")
            && bounds.top < viewport.bottom && bounds.bottom > viewport.top) {
            selectionToVisibleMs = main.performance.now() - selectionStarted;
            break;
          }
        } while (Date.now() < selectionDeadline);
      }
      const selectedRow = [...page.document.querySelectorAll("#annotations > .annotation")]
        .find(row => row.dataset.sidebarAnnotationId === id);
      const selection = ["all", "selection"].includes(interactionTest) ? Boolean(selectedRow?.classList.contains("selected")
        && !selectedRow.hasAttribute("data-am-startup-row-shell") && !selectedRow.querySelector("[data-am-startup-preview-shell], [data-annotation-markdown-startup-preview]")) : null;
      const viewport = page.document.getElementById("annotations").getBoundingClientRect();
      const bounds = selectedRow.getBoundingClientRect();
      const selectedTargetVisible = selection === null ? null : bounds.top < viewport.bottom && bounds.bottom > viewport.top;
      page.eval("window._reader.setSelectedAnnotations([], true)");
      await delay(100);
      const focusTarget = [...page.document.querySelectorAll("#annotations > .annotation")]
        .find(row => row.hasAttribute("data-am-startup-row-shell") || row.querySelector("[data-am-startup-preview-shell], [data-annotation-markdown-startup-preview]"));
      const focusID = focusTarget?.dataset.sidebarAnnotationId;
      if (["all", "focus"].includes(interactionTest)) {
        focusTarget?.focus();
        await delay(200);
      }
      const focusedRow = [...page.document.querySelectorAll("#annotations > .annotation")]
        .find(row => row.dataset.sidebarAnnotationId === focusID);
      const focus = focusTarget && ["all", "focus"].includes(interactionTest) ? Boolean(focusedRow?.classList.contains("selected")
        && !focusedRow.hasAttribute("data-am-startup-row-shell") && !focusedRow.querySelector("[data-am-startup-preview-shell], [data-annotation-markdown-startup-preview]")) : null;
      page.eval("window._reader.setSelectedAnnotations([], true)");
      const scroller = page.document.getElementById("annotations");
      scroller.scrollTop = scroller.scrollHeight;
      await delay(500);
      const finalIDs = [...page.document.querySelectorAll("#annotations > .annotation")].map(row => row.dataset.sidebarAnnotationId);
      result.interactions = { test: interactionTest, selection, selectedTargetVisible, selectionToVisibleMs,
        selectionGeometry: selection === null ? null : { top: bounds.top, bottom: bounds.bottom, viewportTop: viewport.top, viewportBottom: viewport.bottom },
        focus, focusTargetAvailable: Boolean(focusTarget),
        scrolled: scroller.scrollTop > 0, rowOrderUnchanged: JSON.stringify(beforeIDs) === JSON.stringify(finalIDs),
        remainingShells: page.__AMStartupProbe.summary().settled.rowShells + page.__AMStartupProbe.summary().settled.previewShells };
    }
    state.runs.push(result);
    progress("measurement-complete");
    page.__AMStartupProbe.stop();
    currentReader.close();
    currentReader = undefined;
    await delay(250);
    if (Zotero.Reader._readers.length) throw new Error("Reader lifecycle did not close cleanly");
  }

  try {
    for (const key of prefKeys) Zotero.Prefs.set(prefix + key,
      key === "enabled" ? pluginEnabled : key === "nativeRowLazy" ? nativeRowLazyEnabled
        : key === "readerStartupLazy" ? readerStartupLazyEnabled : false, true);
    await delay(100);
    if (!skipWarmup) await open("baseline", true);
    for (const mode of (modes ?? (smallFixture ? ["cached-rows", "preview-lazy"]
      : ["baseline", "cached-rows", "preview-lazy", "preview-lazy", "cached-rows", "baseline"]))) {
      state.phase = mode;
      await open(mode);
    }
  } catch (error) {
    state.error = String(error);
    throw error;
  } finally {
    restorePush?.(); removeLoad?.();
    if (currentReader) {
      const page = currentReader._iframeWindow?.wrappedJSObject || currentReader._iframeWindow;
      page?.__AMStartupProbe?.stop();
      currentReader.close();
    }
    for (const [key, value] of Object.entries(prefs)) {
      if (value === undefined) Zotero.Prefs.clear(prefix + key, true);
      else Zotero.Prefs.set(prefix + key, value, true);
    }
    state.sourceUnchanged = originalComments.every(([id, comment]) => Zotero.Items.get(id).annotationComment === comment);
    state.preferencesRestored = Object.entries(prefs).every(([key, value]) => Zotero.Prefs.get(prefix + key, true) === value);
    state.readersClosed = Zotero.Reader._readers.length === 0;
    state.cacheEntries = cache ? Object.keys(cache.items).length : 0;
    state.running = false;
    state.phase = "complete";
    progress("cleanup-complete");
    cache = undefined;
  }
  return state;
}
