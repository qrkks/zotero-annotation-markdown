# Changelog

## 0.6.2 - 2026-08-26

### Fixed

- Preserve Weavero link colors in this plugin's rendered annotation previews, respect Weavero's `recolorAmLinks` setting, and retain Zotero's native link color as a fallback.

## 0.6.1 - 2026-08-23

### Fixed

- Keep newly saved fast-editor comments synchronized when Zotero refreshes the annotation DOM, so reopening an annotation immediately shows its source.
- Preserve the annotation's sidebar position after large pastes and reduce paste-related visual jumps.
- Restore native Ctrl/Cmd+A, Ctrl/Cmd+Z, and arrow-key behavior in fast comment editors, including annotations selected directly from the document page.
- Prevent rendered links from also opening the fast editor, including on repeated clicks.
- Preserve Weavero handling for supported `zotero://select`, `zotero://open`, `zotero://open-pdf`, and `zotero://note` links in rendered comments.

## 0.6.0 - 2026-08-20

### Added

- Add a fast annotation comment editor that bypasses Zotero's increasingly slow native editor in books with many sidebar tags.
- Enable the fast editor by default while retaining a preference that restores Zotero's native editor.
- Fall back automatically to Zotero's native editor when the Reader annotation update capability is unavailable.

### Changed

- Save fast-editor changes on blur or Escape, matching Zotero's native editing workflow without separate Save or Cancel controls.
- Grow the editor with its content and preserve the sidebar position of annotations that are already visible.
- Retain declared Zotero 9.0 compatibility while validating this release primarily on the latest Zotero 10 release.

### Fixed

- Preserve Backspace, Delete, and arrow-key behavior inside fast comment editors.
- Save and immediately render comments that were empty before editing.
- Avoid briefly showing Zotero's native editor before the fast editor takes over.
- Reduce sidebar scroll jumps when editing partially visible annotations in large books.

### Further reading

- User-facing rationale: [why the replacement editor can be faster](docs/en/user-guide.md#why-the-replacement-editor-can-be-faster).
- Developer details: [fast editor flow](docs/en/architecture.md#fast-editor-flow), [performance rationale and limits](docs/en/architecture.md#performance-rationale-and-limits), and the [implementation map](docs/en/architecture.md#fast-editor-implementation-map).
- Chinese documentation: [使用指南](docs/zh-CN/user-guide.md#为什么替代编辑器可以更快) and [架构与实现索引](docs/zh-CN/architecture.md#快速编辑器实现索引).

## 0.5.4 - 2026-08-19

### Fixed

- Upgrade DOMPurify to 3.4.13 to address GHSA-55q2-fjhq-7xh7.

## 0.5.3 - 2026-08-19

### Changed

- Declare compatibility with Zotero 10.0 while retaining Zotero 9.0 support.
- Migrate the source and verification workflow to TypeScript and pnpm without changing the add-on's intended behavior.

## 0.5.2 - 2026-07-20

### Fixed

- Continue cleaning active readers when a previously closed reader exposes an inaccessible DOM wrapper during plugin shutdown.
- Aggregate repeated best-effort shutdown cleanup failures instead of emitting one warning per failed cleanup step.
- Rotate the diagnostic log at 5 MiB and retain one backup so diagnostic storage remains bounded.

## 0.5.1 - 2026-07-20

### Fixed

- Remove rendered previews and restore Zotero's native annotation comments immediately when the plugin is disabled.
- Clean stale preview nodes left by older or interrupted plugin instances.

## 0.5.0 - 2026-07-19

### Added

- Automatically turn bare URLs in rendered annotation comments into clickable links.

### Fixed

- Open rendered links through Zotero on the first click without entering annotation editing.
- Keep links rendered when Zotero marks an outer annotation container as selected.

## 0.4.1 - 2026-07-19

### Changed

- Keep surrounding rendered annotation previews mounted while editing so leaving an editor no longer causes sidebar-wide DOM replacement and repainting.

### Fixed

- Preserve Zotero's native add-comment control for annotations whose comments are empty.

## 0.4.0 - 2026-07-16

### Added

- Added automatic, render-all, and viewport-near annotation rendering strategies in the preferences pane.
- Added bounded HTML and offscreen rendered-DOM caches with least-recently-used eviction.
- Added performance diagnostics for lazy rendering, cache usage, and editing lifecycle behavior.

### Changed

- Render up to four inexpensive annotations per idle period while keeping expensive annotations isolated to a single idle turn.
- Prioritize the currently selected annotation and pre-render small annotation sets automatically.
- Preserve rendered previews outside the viewport within a bounded budget and let the browser skip offscreen layout and paint work.
- Temporarily detach other rendered previews while an annotation editor has focus, then restore the same DOM nodes after editing.

### Fixed

- Render the sidebar annotation selected from a PDF page before its dormant editor receives focus.
- Avoid repeated Markdown and KaTeX work when scrolling away from and back to previously rendered annotations.

## 0.3.3 - 2026-06-15

### Changed

- Reduced Reader sidebar work for large annotation sets by lazily rendering annotation Markdown previews near the viewport.
- Paused annotation Markdown rendering while editing and resumed only the edited annotation after focus leaves.

### Fixed

- Avoided observing character data changes inside active annotation editors.
- Avoided treating Zotero native note editor DOM as reader annotation comments.
- Reduced repeated full-sidebar scans from annotation mutation events.

## 0.3.2 - 2026-06-10

### Changed

- Clarified the annotation paste preference label to distinguish annotation comments from other paste targets.

### Fixed

- Fixed copied LaTeX `\[...\]` display formulas failing to render when pasted without surrounding blank lines.
- Fixed double-escaped copied `\\[...\\]` display formula delimiters in the same adjacent-to-text case.

## 0.3.1 - 2026-06-08

### Fixed

- Reduced PDF scrolling stutter when LaTeX math rendering is enabled by ignoring unrelated Reader mutations.
- Avoided rerendering unchanged annotation comments during repeated Reader scans.

## 0.3.0 - 2026-06-08

### Added

- Added LaTeX math rendering for annotation Markdown previews.
- Added support for `$...$`, `$$...$$`, `\(...\)`, and `\[...\]` math delimiters.
- Added a preference to enable or disable LaTeX math rendering.

### Changed

- Embedded KaTeX woff2 fonts in the generated preview CSS so math symbols render reliably in Zotero Reader.

## 0.2.0 - 2026-05-19

### Added

- Added a Zotero preferences pane for Markdown rendering options.
- Added preview font size control from 80% to 150%.
- Added plugin icon support in preferences, plugin manager, and README.
- Added basic styles for inline code and fenced code blocks.
- Added plain-text paste handling for annotation comments to preserve Markdown line breaks.

## 0.1.7 - 2026-05-18

### Added

- Initial release for Zotero 9.0.x.
- Render Zotero reader sidebar annotation comments as Markdown.
- Preserve original Markdown source text while editing.
- Preserve single line breaks as visible line breaks.
- Sanitize rendered output instead of trusting raw HTML.
