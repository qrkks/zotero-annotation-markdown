# Zotero Annotation Markdown

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

## Current Limitations

The core renderer, settings, DOM adapter, reader lifecycle, and packaging are covered by local tests. The Zotero 9.0.3 reader sidebar selectors still need live validation inside Zotero, because Zotero's reader DOM is not a fully stable public API.
