# Zotero Annotation Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Zotero 9.0.6 plugin prototype that renders PDF and EPUB reader sidebar annotation comments as Markdown by default while preserving source-text editing.

**Architecture:** The plugin is split into a Zotero lifecycle shell, a reader controller, a DOM adapter, a Markdown renderer, and settings. Testable browser-independent behavior lives under `src/`, with unit tests for rendering, settings, and DOM adaptation.

**Tech Stack:** Zotero plugin manifest/bootstrap, JavaScript ES modules for source, Vitest, jsdom, markdown-it, DOMPurify, esbuild, npm scripts, PowerShell-compatible packaging.

---

## File Structure

- `package.json`: npm scripts, dev dependencies, runtime dependencies, and package metadata.
- `vitest.config.mjs`: jsdom test environment.
- `src/markdown-renderer.js`: Markdown-to-safe-HTML rendering with line breaks preserved and raw HTML disabled.
- `src/settings.js`: preference abstraction with enabled-by-default behavior.
- `src/annotation-sidebar-adapter.js`: focused DOM adapter for detecting comment display nodes, edit state, and plugin-owned rendering markers.
- `src/reader-controller.js`: one-controller-per-reader setup, mutation observer lifecycle, render pass orchestration.
- `src/reader-registry.js`: register/unregister open readers and clean shutdown.
- `src/plugin.js`: startup/shutdown coordination that can be called from Zotero bootstrap.
- `addon/bootstrap.js`: Zotero plugin lifecycle bridge.
- `addon/manifest.json`: Zotero extension metadata targeting Zotero 9.
- `addon/styles/annotation-markdown.css`: compact inherited styles for rendered annotation Markdown.
- `tests/*.test.js`: unit tests for renderer, settings, adapter, and controller lifecycle.
- `scripts/build.mjs`: bundle source into `dist/addon`.
- `scripts/package.mjs`: create a `.xpi` from `dist/addon`.

## Task 1: Test Harness And Renderer

**Files:**
- Create: `package.json`
- Create: `vitest.config.mjs`
- Create: `src/markdown-renderer.js`
- Test: `tests/markdown-renderer.test.js`

- [ ] **Step 1: Write failing renderer tests**

Create tests that prove Markdown rendering preserves single line breaks, renders common Markdown, escapes raw HTML, and falls back to escaped text on renderer errors.

Run: `npm test -- tests/markdown-renderer.test.js`

Expected before implementation: FAIL because `src/markdown-renderer.js` does not exist.

- [ ] **Step 2: Implement minimal renderer**

Create `createMarkdownRenderer()` with this API:

```js
const renderer = createMarkdownRenderer();
renderer.render("first\nsecond");
```

Expected behavior:

- Uses `markdown-it` with `html: false`, `breaks: true`, `linkify: false`, and `typographer: false`.
- Sanitizes HTML output through DOMPurify.
- Escapes and line-breaks source text if Markdown rendering throws.

- [ ] **Step 3: Verify renderer tests pass**

Run: `npm test -- tests/markdown-renderer.test.js`

Expected: PASS.

## Task 2: Settings Abstraction

**Files:**
- Create: `src/settings.js`
- Test: `tests/settings.test.js`

- [ ] **Step 1: Write failing settings tests**

Cover:

- Default enabled when no Zotero preference service is available.
- Reads a stored boolean from a Zotero-like preference object.
- Writes boolean values through the same object.

Run: `npm test -- tests/settings.test.js`

Expected before implementation: FAIL because `src/settings.js` does not exist.

- [ ] **Step 2: Implement settings**

Create `createSettings({ prefs, key })` with:

```js
settings.isEnabled();
settings.setEnabled(false);
```

The default preference key is `extensions.annotationMarkdown.enabled`.

- [ ] **Step 3: Verify settings tests pass**

Run: `npm test -- tests/settings.test.js`

Expected: PASS.

## Task 3: Annotation Sidebar Adapter

**Files:**
- Create: `src/annotation-sidebar-adapter.js`
- Test: `tests/annotation-sidebar-adapter.test.js`

- [ ] **Step 1: Write failing adapter tests**

Use jsdom fixtures with Zotero-like annotation rows:

```html
<div data-annotation-id="a1">
  <div class="comment">**bold**</div>
</div>
```

Cover:

- Finds comment display nodes.
- Skips active textareas, inputs, and contenteditable nodes.
- Marks rendered nodes to avoid double rendering.
- Restores plain text when requested.

Run: `npm test -- tests/annotation-sidebar-adapter.test.js`

Expected before implementation: FAIL because `src/annotation-sidebar-adapter.js` does not exist.

- [ ] **Step 2: Implement adapter**

Create `createAnnotationSidebarAdapter({ document })` with:

```js
adapter.findCommentNodes(root);
adapter.isEditable(node);
adapter.getSourceText(node);
adapter.applyRenderedHtml(node, html);
adapter.restoreSourceText(node);
adapter.isRendered(node);
```

Use a small selector list owned only by this module and plugin-owned `data-annotation-markdown-rendered` attributes.

- [ ] **Step 3: Verify adapter tests pass**

Run: `npm test -- tests/annotation-sidebar-adapter.test.js`

Expected: PASS.

## Task 4: Reader Controller And Registry

**Files:**
- Create: `src/reader-controller.js`
- Create: `src/reader-registry.js`
- Test: `tests/reader-controller.test.js`
- Test: `tests/reader-registry.test.js`

- [ ] **Step 1: Write failing controller tests**

Cover:

- Initial render pass renders comments when settings are enabled.
- Disabled settings restore source text and skip rendering.
- Mutation observer can be disconnected.
- One broken node does not stop other nodes from rendering.

Run: `npm test -- tests/reader-controller.test.js tests/reader-registry.test.js`

Expected before implementation: FAIL because controller and registry modules do not exist.

- [ ] **Step 2: Implement controller and registry**

Create:

```js
createReaderController({ reader, adapter, renderer, settings, MutationObserver });
createReaderRegistry({ controllerFactory });
```

The controller must expose `start()`, `renderNow()`, and `stop()`. The registry must expose `register(reader)`, `unregister(reader)`, and `shutdown()`.

- [ ] **Step 3: Verify controller and registry tests pass**

Run: `npm test -- tests/reader-controller.test.js tests/reader-registry.test.js`

Expected: PASS.

## Task 5: Zotero Plugin Shell

**Files:**
- Create: `src/plugin.js`
- Create: `addon/bootstrap.js`
- Create: `addon/manifest.json`
- Create: `addon/styles/annotation-markdown.css`
- Test: `tests/plugin.test.js`

- [ ] **Step 1: Write failing plugin tests**

Cover:

- Startup creates dependencies and starts registry.
- Shutdown calls registry cleanup.
- Startup tolerates missing Zotero reader APIs without throwing.

Run: `npm test -- tests/plugin.test.js`

Expected before implementation: FAIL because `src/plugin.js` does not exist.

- [ ] **Step 2: Implement plugin shell**

Create `createPlugin({ Zotero, window, document, logger })` with `startup()` and `shutdown()`. `addon/bootstrap.js` imports the built plugin bundle and calls those lifecycle functions.

- [ ] **Step 3: Verify plugin tests pass**

Run: `npm test -- tests/plugin.test.js`

Expected: PASS.

## Task 6: Build And Package

**Files:**
- Create: `scripts/build.mjs`
- Create: `scripts/package.mjs`
- Modify: `package.json`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Write package scripts**

Add:

```json
{
  "scripts": {
    "test": "vitest run",
    "build": "node scripts/build.mjs",
    "package": "npm run build && node scripts/package.mjs",
    "verify": "npm test && npm run build && npm run package"
  }
}
```

- [ ] **Step 2: Implement build**

Bundle `src/plugin.js` into `dist/addon/plugin.js`, copy `addon/manifest.json`, `addon/bootstrap.js`, and `addon/styles`.

- [ ] **Step 3: Implement packaging**

Create `dist/zotero-annotation-markdown.xpi` from `dist/addon`.

- [ ] **Step 4: Verify package**

Run: `npm run verify`

Expected: PASS and a generated `.xpi` in `dist/`.

## Task 7: Documentation And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-05-18-zotero-annotation-markdown-implementation.md`

- [ ] **Step 1: Document usage**

README must include:

- Target Zotero version: 9.0.6 first.
- Install path: use Zotero's add-on manager to install the generated `.xpi`.
- Scope: PDF and EPUB reader sidebar annotation comments.
- Current limitation: DOM selectors should continue to be validated against live Zotero releases after the current 9.0.6 baseline.

- [ ] **Step 2: Run final verification**

Run: `npm run verify`

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add .
git commit -m "feat: scaffold zotero annotation markdown plugin"
```

Expected: commit succeeds.
