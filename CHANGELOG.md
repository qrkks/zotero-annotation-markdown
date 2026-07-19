# Changelog

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
