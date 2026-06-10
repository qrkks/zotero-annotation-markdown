# Changelog

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
