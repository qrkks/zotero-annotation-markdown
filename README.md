# Zotero Annotation Markdown

<p align="center">
  <img src="addon/icons/annotation-markdown.svg" width="64" height="64" alt="Zotero Annotation Markdown icon">
</p>

English | [简体中文](README.zh-CN.md)

Render Zotero reader sidebar annotation comments as Markdown and LaTeX math while keeping Zotero's stored annotation text unchanged.

## Highlights

- Markdown and LaTeX math previews in PDF and EPUB annotation sidebars.
- Automatic links for bare URLs in rendered previews.
- Original Markdown source while editing.
- Adjustable preview font size and rendering strategy.
- Sanitized output with a plain-text fallback on rendering failure.
- Designed and tested primarily for Zotero Desktop 9.0.6 on Windows, with Zotero 9.x compatibility as the current goal.

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
