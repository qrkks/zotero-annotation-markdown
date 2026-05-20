# Zotero Annotation Markdown

<p align="center">
  <img src="addon/icons/annotation-markdown.svg" width="64" height="64" alt="Zotero Annotation Markdown icon">
</p>

English | [简体中文](README.zh-CN.md)

Render Zotero reader sidebar annotation comments as Markdown while keeping Zotero's stored annotation text unchanged.

## Target

- Zotero Desktop 9.0.3 first.
- Zotero 9.x compatibility is the initial goal.
- Windows is the first development environment.

## Behavior

- PDF and EPUB reader sidebar annotation comments render as Markdown by default.
- Single line breaks are preserved as visible line breaks.
- Editing shows the original Markdown source text.
- Raw HTML is not trusted.
- Rendering failures leave the original plain text visible.

## Development

```powershell
npm install
npm test
npm run build
npm run package
```

The packaged add-on is generated at:

```text
dist/zotero-annotation-markdown.xpi
```

Install it through Zotero's add-on manager.

## Settings

Open Zotero Settings and select the Annotation Markdown pane to enable or disable Markdown rendering and adjust the reader preview font size from 80% to 150%.

## Installation

Install from the Zotero Add-ons marketplace by searching for `Zotero Annotation Markdown`.

For manual installation, download `zotero-annotation-markdown.xpi` from the latest GitHub release. In Zotero, open `Tools -> Plugins`, then drag the `.xpi` file into the Plugins window.

## Release

1. Update the version in `package.json`, `package-lock.json`, and `addon/manifest.json`.
2. Run `npm run verify`.
3. Upload `dist/zotero-annotation-markdown.xpi` to a GitHub release named `v<version>`.
4. Commit and push the generated `updates.json` so Zotero can discover the new release.

The add-on update manifest is served from:

```text
https://raw.githubusercontent.com/qrkks/zotero-annotation-markdown/main/updates.json
```

## Current Limitations

The core renderer, settings, DOM adapter, reader lifecycle, and packaging are covered by local tests. The Zotero 9.0.3 reader sidebar selectors still need live validation inside Zotero, because Zotero's reader DOM is not a fully stable public API.
