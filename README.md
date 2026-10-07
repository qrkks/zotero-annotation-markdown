# Zotero Annotation Markdown

<p align="center">
  <img src="addon/icons/annotation-markdown.svg" width="64" height="64" alt="Zotero Annotation Markdown icon">
</p>

<p align="center">
  <a href="https://github.com/qrkks/zotero-annotation-markdown/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/qrkks/zotero-annotation-markdown?display_name=tag&amp;sort=semver"></a>
  <a href="https://github.com/qrkks/zotero-annotation-markdown/releases/latest"><img alt="Latest release downloads" src="https://img.shields.io/github/downloads/qrkks/zotero-annotation-markdown/latest/total?label=latest%20downloads"></a>
  <a href="https://github.com/qrkks/zotero-annotation-markdown/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/qrkks/zotero-annotation-markdown/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="docs/en/user-guide.md#compatibility"><img alt="Zotero 9 and 10" src="https://img.shields.io/badge/Zotero-9%20%7C%2010-CC2936?logo=zotero&amp;logoColor=white"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/qrkks/zotero-annotation-markdown?label=license"></a>
</p>

English | [简体中文](README.zh-CN.md)

Make Zotero annotation comments easier to read with Markdown headings, lists, color highlights, and LaTeX math. Rendering preserves the original source stored by Zotero, so it stays editable.

![The same Zotero annotation as editable Markdown source and a rendered preview with headings, color highlights, and LaTeX math](docs/images/source-and-preview.webp)

**Left:** edit the Markdown source. **Right:** read the formatted preview. Leave the editor or press **Escape** to save and return to the preview.

## Highlights

- Markdown and LaTeX math previews in PDF and EPUB annotation sidebars.
- Optional, off-by-default Markdown previews for page annotation popups, plus preference-controlled fast editing with a native fallback.
- Highlight syntax from the markdown-it ecosystem: `==Highlighted text==` via [markdown-it-mark](https://github.com/markdown-it/markdown-it-mark), with optional color suffixes such as `==Highlighted text=={.red}` following the [markdown-it-attrs](https://github.com/arve0/markdown-it-attrs) convention and limited to safe preset colors.
- Automatic links for bare URLs in rendered previews.
- A persistent floating outline with adjustable text size for navigating long annotations with multiple headings.
- Optional automatic `todo` tags from `todo:` or `t:` lines in saved annotation comments.
- [Fast source editing](docs/en/user-guide.md#why-the-replacement-editor-can-be-faster) that remains responsive in books with many annotation tags.
- Adjustable preview font size and rendering strategy.
- An off-by-default Zotero 10.0.3 experiment that lazily restores native rows when a tag filter is cleared in very large annotation lists.
- Sanitized output with a plain-text fallback on rendering failure.
- Supports Zotero Desktop 9.0 and 10.0.x. Current release validation prioritizes Zotero 10; Zotero 9 retains an automatic native-editor fallback.

<details>
<summary>More screenshots: floating outline and page annotation popups</summary>

### Navigate long annotations

The floating outline follows the selected annotation's headings. Choose a section to scroll directly to it within the annotation sidebar.

![A long annotation with nested headings, colored highlights, and its floating outline](docs/images/floating-outline.webp)

### Preview comments on the page

Page annotation popups can show the same Markdown and math preview. Enable **Render page annotation popups as Markdown** in Settings; this option is off by default.

![An optional page annotation popup displaying formatted Markdown, color highlights, and LaTeX math](docs/images/popup-preview.webp)

Screenshots use demonstration text in Zotero 10.0.5 with Annotation Markdown v0.11.0. Preview font size is set to 125%.

</details>

## Installation

Install `Zotero Annotation Markdown` from the Zotero Add-ons marketplace.

For manual installation, download `zotero-annotation-markdown.xpi` from the [latest GitHub release](https://github.com/qrkks/zotero-annotation-markdown/releases/latest). In Zotero, open **Tools → Plugins**, then drag the `.xpi` file into the Plugins window.

## Documentation

- [User guide](docs/en/user-guide.md)
- [Architecture and file map](docs/en/architecture.md)
- [Development and release](docs/en/development.md)
- [Performance diagnostics](docs/en/performance-diagnostics.md)
- [Documentation index and translation policy](docs/README.md)

## Quick development

```powershell
pnpm install
pnpm test
pnpm run build
pnpm run package
```

The packaged add-on is generated at `dist/zotero-annotation-markdown.xpi`.

## License

[MIT](LICENSE)
