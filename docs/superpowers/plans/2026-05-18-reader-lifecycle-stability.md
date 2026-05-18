# Reader Lifecycle Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reader sidebar Markdown preview lifecycle behave reliably like Weavero's mature Zotero integration before expanding Markdown rendering features.

**Architecture:** Keep `MarkdownRenderer` unchanged for this phase. Strengthen the Zotero reader integration around it: async reader readiness, synchronous sidebar scans for relevant DOM mutations, debounced safety scans for missed DOM shapes, stale marker cleanup on startup/reload, and edit-state reconciliation that does not depend on one perfect `focusout` event.

**Tech Stack:** JavaScript ES modules, Vitest/jsdom unit tests, Zotero Reader event hooks, MutationObserver, existing `ReaderRegistry`, `ReaderController`, and `AnnotationSidebarAdapter`.

---

## File Structure

- `src/plugin.js`: collect open readers, register Zotero Reader event handlers, and pass diagnostics into registry/controller.
- `src/reader-registry.js`: own one controller per reader, support async reader startup, avoid duplicate starts, and expose cleanup.
- `src/reader-controller.js`: wait for reader document readiness, inject styles, run immediate and debounced render scans, observe relevant sidebar mutations, and stop cleanly.
- `src/annotation-sidebar-adapter.js`: keep source content untouched, manage preview/edit classes, clear stale markers, and reconcile missed focus events.
- `tests/plugin.test.js`: plugin startup/shutdown and open-reader registration behavior.
- `tests/reader-registry.test.js`: duplicate registration, async startup, shutdown while startup is pending.
- `tests/reader-controller.test.js`: immediate scan, synchronous scan on matching mutations, debounced safety scan, reader readiness, cleanup.
- `tests/annotation-sidebar-adapter.test.js`: stale marker cleanup and edit recovery behavior.

## Task 1: Async Reader Readiness In Registry

**Files:**
- Modify: `src/reader-registry.js`
- Test: `tests/reader-registry.test.js`

- [ ] **Step 1: Write failing registry tests**

Add these tests to `tests/reader-registry.test.js`:

```js
test("waits for async controller start before considering the reader active", async () => {
  const start = vi.fn(() => Promise.resolve());
  const controllerFactory = vi.fn(() => ({ start, stop: vi.fn() }));
  const registry = createReaderRegistry({ controllerFactory });
  const reader = {};

  await registry.register(reader);
  await registry.register(reader);

  expect(controllerFactory).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(1);
});

test("stops a controller if shutdown happens while async start is pending", async () => {
  let resolveStart;
  const stop = vi.fn();
  const registry = createReaderRegistry({
    controllerFactory: () => ({
      start: vi.fn(() => new Promise((resolve) => { resolveStart = resolve; })),
      stop
    })
  });
  const reader = {};

  const startPromise = registry.register(reader);
  registry.shutdown();
  resolveStart();
  await startPromise;

  expect(stop).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- tests/reader-registry.test.js
```

Expected: FAIL because `register()` is currently synchronous and does not handle pending starts.

- [ ] **Step 3: Implement minimal async registry**

Update `src/reader-registry.js` so entries track `{ controller, startPromise, stopped }`:

```js
export function createReaderRegistry({ controllerFactory }) {
  const entries = new Map();

  return {
    async register(reader) {
      if (!reader || entries.has(reader)) {
        return;
      }

      const entry = {
        controller: controllerFactory(reader),
        startPromise: undefined,
        stopped: false
      };
      entries.set(reader, entry);

      entry.startPromise = Promise.resolve(entry.controller.start());
      await entry.startPromise;

      if (entry.stopped) {
        entry.controller.stop();
        entries.delete(reader);
      }
    },

    unregister(reader) {
      const entry = entries.get(reader);
      if (!entry) {
        return;
      }

      entry.stopped = true;
      if (!entry.startPromise) {
        entry.controller.stop();
        entries.delete(reader);
        return;
      }

      entry.startPromise.finally(() => {
        entry.controller.stop();
        entries.delete(reader);
      });
    },

    shutdown() {
      for (const [reader, entry] of entries) {
        entry.stopped = true;
        if (entry.startPromise) {
          entry.startPromise.finally(() => entry.controller.stop());
        } else {
          entry.controller.stop();
        }
        entries.delete(reader);
      }
    }
  };
}
```

- [ ] **Step 4: Run registry tests**

Run:

```powershell
npm test -- tests/reader-registry.test.js
```

Expected: PASS.

## Task 2: Reader Controller Readiness And Scan Scheduler

**Files:**
- Modify: `src/reader-controller.js`
- Test: `tests/reader-controller.test.js`

- [ ] **Step 1: Write failing readiness and scheduler tests**

Add these tests to `tests/reader-controller.test.js`:

```js
test("waits for Zotero reader readiness before the first render pass", async () => {
  document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
  const render = vi.fn((source) => `<p>${source}</p>`);
  let resolveReady;
  const controller = createReaderController({
    reader: {
      document,
      _waitForReader: () => new Promise((resolve) => { resolveReady = resolve; })
    },
    adapter: createAnnotationSidebarAdapter({ document }),
    renderer: { render },
    settings: { isEnabled: () => true },
    MutationObserver: undefined
  });

  const startPromise = controller.start();
  expect(render).not.toHaveBeenCalled();
  resolveReady();
  await startPromise;

  expect(render).toHaveBeenCalledWith("**bold**");
});

test("runs a synchronous scan when annotation comment nodes are added", async () => {
  const callbacks = [];
  const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
    callbacks.push(callback);
    return { observe: vi.fn(), disconnect: vi.fn() };
  });
  document.body.innerHTML = `<div id="root"></div>`;
  const render = vi.fn((source) => `<p>${source}</p>`);
  const controller = createReaderController({
    reader: { document },
    adapter: createAnnotationSidebarAdapter({ document }),
    renderer: { render },
    settings: { isEnabled: () => true },
    MutationObserver: FakeMutationObserver
  });

  await controller.start();
  const added = document.createElement("div");
  added.innerHTML = `<div data-annotation-id="a1"><div class="comment">**new**</div></div>`;
  document.querySelector("#root").append(added);
  callbacks[0]([{ addedNodes: [added], target: document.querySelector("#root") }]);

  expect(render).toHaveBeenCalledWith("**new**");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm test -- tests/reader-controller.test.js
```

Expected: FAIL because `start()` does not await `_waitForReader()` and the observer callback always calls the generic render path without classified sync/debounce behavior.

- [ ] **Step 3: Implement reader readiness and classified scanning**

Modify `src/reader-controller.js`:

```js
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

  async function waitForReaderReady() {
    if (typeof reader?._waitForReader === "function") {
      await reader._waitForReader();
      return;
    }
    if (reader?._initPromise) {
      await reader._initPromise;
    }
  }

  function scheduleSafetyScan(delay = 80) {
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

  function mutationNeedsSyncScan(mutations) {
    return mutations.some((mutation) => Array.from(mutation.addedNodes ?? []).some((node) => (
      node.nodeType === 1 &&
      (node.matches?.(".annotation-row, .annotation, .comment") ||
        node.querySelector?.(".annotation-row .comment, .annotation .comment, [data-annotation-id] .comment"))
    )));
  }
```

Then make `start()` async and use the classifier:

```js
async start() {
  await waitForReaderReady();
  injectStyles();
  this.renderNow();

  if (root && MutationObserverRef && !observer) {
    observer = new MutationObserverRef((mutations) => {
      if (mutationNeedsSyncScan(mutations)) {
        this.renderNow();
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
```

Update `stop()`:

```js
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
```

- [ ] **Step 4: Run controller tests**

Run:

```powershell
npm test -- tests/reader-controller.test.js
```

Expected: PASS.

## Task 3: Stale Marker Cleanup On Startup And Re-Enable

**Files:**
- Modify: `src/annotation-sidebar-adapter.js`
- Modify: `src/reader-controller.js`
- Test: `tests/annotation-sidebar-adapter.test.js`
- Test: `tests/reader-controller.test.js`

- [ ] **Step 1: Write failing stale marker tests**

Add this test to `tests/annotation-sidebar-adapter.test.js`:

```js
test("clears stale preview markers left by a previous plugin instance", () => {
  document.body.innerHTML = `
    <div data-annotation-id="a1">
      <div class="comment annotation-markdown-editing" data-annotation-markdown-rendered="true" data-annotation-markdown-source="**old**" data-annotation-markdown-suppress-until="9999999999999">
        <div class="content" hidden>**new**</div>
        <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true"><p>old</p></div>
      </div>
    </div>
  `;
  const node = document.querySelector(".comment");
  const adapter = createAnnotationSidebarAdapter({ document });

  adapter.clearRenderedState(document.body);

  expect(node.classList.contains("annotation-markdown-editing")).toBe(false);
  expect(node.hasAttribute("data-annotation-markdown-rendered")).toBe(false);
  expect(node.hasAttribute("data-annotation-markdown-source")).toBe(false);
  expect(node.hasAttribute("data-annotation-markdown-suppress-until")).toBe(false);
  expect(node.querySelector(".content")?.hidden).toBe(false);
  expect(node.querySelector(".annotation-markdown-rendered")).toBeNull();
});
```

Add this test to `tests/reader-controller.test.js`:

```js
test("clears stale adapter state before rendering on start", async () => {
  document.body.innerHTML = `<div data-annotation-id="a1"><div class="comment">**bold**</div></div>`;
  const clearRenderedState = vi.fn();
  const adapter = {
    ...createAnnotationSidebarAdapter({ document }),
    clearRenderedState
  };
  const controller = createReaderController({
    reader: { document },
    adapter,
    renderer: { render: (source) => `<p>${source}</p>` },
    settings: { isEnabled: () => true },
    MutationObserver: undefined
  });

  await controller.start();

  expect(clearRenderedState).toHaveBeenCalledWith(document.body);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npm test -- tests/annotation-sidebar-adapter.test.js tests/reader-controller.test.js
```

Expected: FAIL because `clearRenderedState()` does not exist and controller does not call it.

- [ ] **Step 3: Implement adapter cleanup**

Add this method inside the returned adapter object in `src/annotation-sidebar-adapter.js`:

```js
clearRenderedState(root = documentRef) {
  if (!root?.querySelectorAll) {
    return;
  }

  for (const preview of root.querySelectorAll(`[${PREVIEW_ATTRIBUTE}='true']`)) {
    preview.remove();
  }

  for (const node of root.querySelectorAll(`[${RENDERED_ATTRIBUTE}], [${SOURCE_ATTRIBUTE}], [${SUPPRESS_UNTIL_ATTRIBUTE}], .${EDITING_CLASS}`)) {
    node.classList?.remove(EDITING_CLASS);
    node.removeAttribute(RENDERED_ATTRIBUTE);
    node.removeAttribute(SOURCE_ATTRIBUTE);
    node.removeAttribute(SUPPRESS_UNTIL_ATTRIBUTE);
    const sourceNode = getSourceNode(node);
    if (sourceNode && sourceNode !== node) {
      sourceNode.hidden = false;
    }
    unwrapSourceNode(node);
  }
}
```

Call it at the beginning of controller startup after styles are injected and before `renderNow()`:

```js
injectStyles();
adapter.clearRenderedState?.(root);
this.renderNow();
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm test -- tests/annotation-sidebar-adapter.test.js tests/reader-controller.test.js
```

Expected: PASS.

## Task 4: Robust Edit-State Reconciliation

**Files:**
- Modify: `src/annotation-sidebar-adapter.js`
- Test: `tests/annotation-sidebar-adapter.test.js`
- Test: `tests/reader-controller.test.js`

- [ ] **Step 1: Write failing tests for selected-row edit flow and missed focusout**

Keep the existing test `makes comments renderable again after focus leaves even if focusout was missed`.

Add this test to `tests/annotation-sidebar-adapter.test.js`:

```js
test("does not re-render while focus remains inside the comment content", () => {
  document.body.innerHTML = `
    <div data-annotation-id="a1">
      <div class="comment"><div class="content" tabindex="0">**bold**</div></div>
    </div>
  `;
  const node = document.querySelector(".comment");
  const content = node.querySelector(".content");
  const adapter = createAnnotationSidebarAdapter({ document });

  adapter.applyRenderedHtml(node, "<p><strong>bold</strong></p>");
  node.querySelector(".annotation-markdown-rendered").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  content.focus();

  expect(adapter.findCommentNodes(document.body)).toHaveLength(0);
  expect(node.classList.contains("annotation-markdown-editing")).toBe(true);
});
```

- [ ] **Step 2: Run tests**

Run:

```powershell
npm test -- tests/annotation-sidebar-adapter.test.js tests/reader-controller.test.js
```

Expected: PASS after the current focus-inside guard remains intact. If it fails, fix `hasFocusInside()` before proceeding.

- [ ] **Step 3: Tighten click-to-edit behavior without changing Markdown rendering**

Keep the existing preview click handler but ensure it only toggles source/preview state and does not call `restoreSourceText()`:

```js
preview.addEventListener("mousedown", () => {
  adapter.showSourceForEditing(sourceNode);
}, { capture: true });
```

Keep `finishEditing()` as the single place that stores the new source:

```js
function finishEditing(node) {
  node?.setAttribute?.(SOURCE_ATTRIBUTE, getSourceNode(node)?.textContent ?? "");
  node?.classList?.remove(EDITING_CLASS);
  node?.removeAttribute?.(SUPPRESS_UNTIL_ATTRIBUTE);
}
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm test -- tests/annotation-sidebar-adapter.test.js tests/reader-controller.test.js
```

Expected: PASS.

## Task 5: Plugin Startup Should Register Open Readers And Reader Events Safely

**Files:**
- Modify: `src/plugin.js`
- Test: `tests/plugin.test.js`

- [ ] **Step 1: Write failing startup tests**

Add this test to `tests/plugin.test.js`:

```js
test("startup tolerates async registry registration for open readers and reader events", async () => {
  const register = vi.fn(() => Promise.resolve());
  const shutdown = vi.fn();
  const listeners = {};
  const Zotero = {
    Reader: {
      _readers: [{ id: "open" }],
      registerEventListener: vi.fn((name, handler) => { listeners[name] = handler; }),
      unregisterEventListener: vi.fn()
    }
  };
  const plugin = createPlugin({
    Zotero,
    registryFactory: () => ({ register, shutdown }),
    logger: { log: vi.fn(), warn: vi.fn() }
  });

  await plugin.startup();
  await listeners.renderSidebarAnnotationHeader({ reader: { id: "event" } });

  expect(register).toHaveBeenCalledWith({ id: "open" });
  expect(register).toHaveBeenCalledWith({ id: "event" });
});
```

- [ ] **Step 2: Run plugin tests**

Run:

```powershell
npm test -- tests/plugin.test.js
```

Expected: FAIL if `startup()` and event handler do not await/return async registry work.

- [ ] **Step 3: Make plugin startup/event handlers async-safe**

Update `startup()` in `src/plugin.js`:

```js
async startup() {
  diagnosticsLogger.log("[annotation-markdown] startup");
  registry = makeRegistry();

  const openReaders = collectOpenReaders(Zotero);
  diagnosticsLogger.log(`[annotation-markdown] found open readers: ${openReaders.length}`);

  await Promise.all(openReaders.map((reader) => registry.register(reader)));

  if (Zotero?.Reader?.registerEventListener) {
    readerEventHandler = (event) => {
      const reader = event?.reader ?? event;
      diagnosticsLogger.log(`[annotation-markdown] reader event fired: ${READER_EVENT}`);
      return registry?.register(reader);
    };
    Zotero.Reader.registerEventListener(READER_EVENT, readerEventHandler, PLUGIN_ID);
    diagnosticsLogger.log(`[annotation-markdown] registered reader event: ${READER_EVENT}`);
  } else {
    diagnosticsLogger.log("[annotation-markdown] Zotero.Reader.registerEventListener unavailable");
  }
}
```

- [ ] **Step 4: Run plugin tests**

Run:

```powershell
npm test -- tests/plugin.test.js
```

Expected: PASS.

## Task 6: Full Verification

**Files:**
- No production files beyond Tasks 1-5.
- Verify all tests and package output.

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm run verify
```

Expected:

```text
Test Files  9 passed
Tests       all passed
build       exits 0
package     exits 0
```

- [ ] **Step 2: Manual Zotero smoke test**

Install `dist/zotero-annotation-markdown.xpi` in Zotero and verify:

```text
1. Open a PDF reader with an annotation comment containing **bold**.
2. Confirm sidebar shows rendered preview.
3. Click the annotation row once to select it.
4. Click the rendered preview to edit.
5. Change **bold** to **changed**.
6. Click outside the annotation comment.
7. Confirm the sidebar returns to rendered preview for **changed**.
8. Close and reopen the reader tab.
9. Confirm the preview still renders.
10. Disable and re-enable the plugin.
11. Confirm no duplicate previews or stale hidden source nodes remain.
```

- [ ] **Step 3: Capture remaining Markdown rendering gaps**

Do not implement Markdown changes in this phase. Record any observed rendering gaps as separate follow-up issues or a new plan named:

```text
docs/superpowers/plans/2026-05-18-markdown-rendering-polish.md
```

## Self-Review

- Spec coverage: This plan covers lifecycle readiness, open reader handling, event registration, mutation scan reliability, stale marker cleanup, and edit-state recovery. Markdown rendering quality is intentionally deferred.
- Placeholder scan: No task uses TBD/TODO or vague error handling instructions.
- Type consistency: `register(reader)`, `start()`, `stop()`, `clearRenderedState(root)`, `findCommentNodes(root)`, and `showSourceForEditing(node)` match existing module boundaries.
