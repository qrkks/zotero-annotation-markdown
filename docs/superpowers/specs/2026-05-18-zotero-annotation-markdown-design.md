# Zotero Annotation Markdown Rendering Design

## Summary

Build a Zotero Desktop plugin that renders PDF and EPUB reader sidebar annotation comments as Markdown by default. The supported and tested baseline is Zotero Desktop 9.0.6 on Windows. Annotation data remains plain Markdown source text in Zotero; the plugin only changes how comments are displayed in the reader sidebar.

The MVP behavior is:

- All annotation comments render as Markdown by default.
- Single line breaks are preserved as visible line breaks.
- Editing shows the original Markdown source text.
- Raw HTML in Markdown is disabled.
- Rendering failures fall back to Zotero's original plain text display.
- A global setting can disable the feature, defaulting to enabled.

## Sources And Version Baseline

- Target app: Zotero Desktop 9.0.6, used for current Windows validation.
- Relevant official docs:
  - https://www.zotero.org/support/changelog
  - https://www.zotero.org/support/dev/client_coding/plugin_development
  - https://www.zotero.org/support/dev/zotero_7_for_developers

Although the developer documentation is named for Zotero 7, it describes the modern plugin architecture used by Zotero 7 and later. This plugin should treat Zotero 9.0.6 behavior as the implementation baseline and verify all reader integration points against that version directly.

## Goals

- Improve the reading experience by rendering annotation comments in the PDF and EPUB sidebar as Markdown.
- Keep Zotero annotation storage untouched, so sync, export, and cross-device compatibility remain predictable.
- Make normal plain text annotations look normal under Markdown rendering.
- Keep the first version small enough to validate against Zotero 9.0.6 without building a custom editor.

## Non-Goals

- Do not implement a WYSIWYG Markdown editor in the first version.
- Do not change Zotero's note editor, exported notes, bibliography output, or mobile clients.
- Do not change the underlying annotation schema.
- Do not support arbitrary raw HTML in annotation comments.
- Do not promise compatibility with Zotero 7 or Zotero 8 in the first release.

## User Experience

When the reader sidebar displays annotation comments, comments are rendered as Markdown. A comment such as:

```md
Important point
- first idea
- second idea

`methodName()` is relevant here.
```

appears with a paragraph, a bullet list, and inline code styling. A comment with simple text and line breaks preserves those line breaks visually.

When the user clicks into the annotation comment to edit it, Zotero's original editing experience is preserved. The user sees and edits the Markdown source text. When editing ends or the annotation row is re-rendered by Zotero, the plugin re-applies Markdown rendering.

If the plugin cannot safely detect the editing state or cannot render a specific comment, it leaves Zotero's original comment display in place.

## Architecture

### Plugin Shell

The plugin uses the standard Zotero plugin structure:

- `manifest.json` declares the extension metadata and Zotero compatibility.
- `bootstrap.js` handles startup, shutdown, install, and uninstall lifecycle hooks.
- Reader integration is registered during startup and cleaned up during shutdown.
- Static assets include the Markdown renderer bundle and CSS for rendered annotation content.

The plugin ID and compatibility range should be finalized during implementation. The compatibility target is Zotero 9.x, currently tested on 9.0.6.

### Reader Integration

The plugin should use official Reader event hooks where possible to detect reader creation, reader closing, annotation context changes, and toolbar/menu extension points. Official hooks are preferred for lifecycle and cleanup.

However, replacing annotation comment display in the sidebar may require observing reader DOM changes. To keep that maintainable, all DOM assumptions must live in one adapter module:

- `ReaderRegistry` tracks open readers and creates one controller per reader.
- `ReaderController` owns setup and teardown for one reader instance.
- `AnnotationSidebarAdapter` finds candidate annotation comment nodes and determines whether they are in display mode or edit mode.
- `MarkdownRenderer` converts source text to sanitized HTML.
- `Settings` reads and writes the global enable flag.

No other module should query reader DOM directly.

### Rendering Flow

1. A reader opens or the plugin starts while readers are already open.
2. The reader controller attaches a mutation observer to the annotation sidebar container.
3. When annotation rows are added or updated, the adapter identifies comment display nodes.
4. For each eligible node, the plugin records the original plain-text source in an internal association.
5. The renderer converts the source with Markdown options:
   - `breaks: true`
   - raw HTML disabled
   - linkification enabled, with link interaction kept separate from preview editing
6. The adapter replaces only the display content area, adding a plugin-owned marker attribute to avoid duplicate rendering.
7. If the row enters edit mode, the adapter restores or leaves the source text untouched.
8. When editing ends, the observer sees the display node again and re-renders it.

### Markdown Policy

The MVP supports common Markdown:

- Paragraphs
- Emphasis and strong text
- Inline code and fenced code blocks
- Ordered and unordered lists
- Blockquotes
- Links, if sanitized and styled safely
- Single newlines as visible line breaks

Raw HTML is disabled. If the Markdown library produces HTML, the output must be sanitized before insertion into the reader DOM.

### Styling

Rendered content should inherit Zotero reader typography and color as much as possible. Plugin CSS should be minimal:

- Keep margins compact so annotations do not become visually noisy.
- Preserve readable spacing for lists and code.
- Support dark and light themes through inherited colors and CSS variables where available.
- Avoid changing annotation row layout width, selection behavior, or action buttons.

### Settings

The first version needs one user-facing setting:

- Enable Markdown rendering in reader annotations: default `true`

This setting can initially live in Zotero preferences if adding a full settings UI is practical. If not, it can be stored internally and exposed later, but the implementation should still include the setting abstraction from the start.

## Data And State

The plugin does not write rendered HTML into Zotero annotations. Zotero remains the source of truth for annotation comments.

Runtime state is per reader:

- Mutation observer handles
- Rendered node markers
- Any cached source text needed to restore display safely
- Cleanup callbacks for Zotero reader events

Shutdown must remove observers and plugin-owned DOM changes where practical. If complete DOM restoration is risky, shutdown should at least disconnect observers and prevent future rendering.

## Error Handling

Rendering one annotation must not break rendering for other annotations. Errors are caught per node and logged behind a debug flag or concise console message.

Fallback rules:

- If source text cannot be extracted, do nothing.
- If Markdown rendering fails, leave plain text unchanged.
- If sanitization fails, leave plain text unchanged.
- If edit mode detection is uncertain, prefer not rendering.

## Testing Strategy

Manual testing on Zotero Desktop 9.0.6:

- PDF annotation with plain text.
- PDF annotation with Markdown headings, lists, inline code, code blocks, and links.
- EPUB annotation with the same Markdown cases.
- Single newline preservation.
- Editing a rendered annotation and saving changes.
- Deleting annotation text.
- Switching between light and dark themes.
- Closing and reopening reader tabs.
- Disabling the global setting.
- Plugin startup while reader tabs are already open.
- Plugin shutdown or disable while reader tabs are open.

Automated testing is limited because Zotero plugins run inside Zotero's desktop environment. Pure renderer tests should still cover Markdown options, HTML disabling, sanitization behavior, and fallback behavior.

## Risks

The largest risk is that Zotero's reader sidebar DOM may change between 9.x releases. The design mitigates this by keeping all DOM selectors and mode detection in `AnnotationSidebarAdapter`.

The second risk is editing-state interference. The plugin must never replace an active editor's content with rendered HTML. The adapter should bias toward not rendering if edit state is unclear.

The third risk is styling drift across PDF and EPUB readers. The plugin should start with minimal inherited styling and add only targeted CSS after testing both formats.

## MVP Acceptance Criteria

- On Zotero Desktop 9.0.6, PDF sidebar annotation comments render Markdown by default.
- On Zotero Desktop 9.0.6, EPUB sidebar annotation comments render Markdown by default.
- Single line breaks appear as visible line breaks.
- Clicking/editing an annotation exposes the original Markdown source text.
- Saving an edit re-renders the updated Markdown.
- Plain text annotations remain readable and visually close to Zotero's default display.
- Raw HTML does not execute or render as trusted HTML.
- Rendering failures leave the original plain text visible.
- The feature can be disabled globally.

## Implementation Defaults

- Plugin name: Zotero Annotation Markdown.
- Initial plugin ID: `annotation-markdown@local`.
- Markdown renderer: bundle `markdown-it` directly with the plugin and configure it with `html: false`, `breaks: true`, `linkify: true`, and `typographer: false`.
- Sanitization: sanitize rendered HTML before insertion. Prefer a bundled sanitizer such as DOMPurify if compatible with Zotero's runtime; otherwise use a small allowlist sanitizer owned by `MarkdownRenderer`.
- URL auto-linking: enabled. Clicking a rendered link must not enter annotation editing.
- Settings UI: include a minimal preference checkbox if the Zotero 9 plugin preference pattern is straightforward during scaffolding. The `Settings` module must exist either way, with the default value enabled.
