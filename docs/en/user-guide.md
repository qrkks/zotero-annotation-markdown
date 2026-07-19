# User guide

[简体中文](../zh-CN/user-guide.md)

## Supported behavior

- PDF and EPUB reader sidebar annotation comments render as Markdown by default.
- LaTeX math renders by default with `$...$`, `$$...$$`, `\(...\)`, and `\[...\]` delimiters.
- Single line breaks remain visible.
- Bare URLs become clickable links in rendered previews.
- Editing shows the original Markdown source text.
- Raw HTML is not trusted; rendered output is sanitized.
- Rendering failures leave the original plain text visible.

## Installation

Install `Zotero Annotation Markdown` from the Zotero Add-ons marketplace.

For manual installation, download `zotero-annotation-markdown.xpi` from the [latest GitHub release](https://github.com/qrkks/zotero-annotation-markdown/releases/latest). Open **Tools → Plugins** in Zotero and drag the `.xpi` file into the Plugins window.

## Settings

Open Zotero Settings and select the **Annotation Markdown** pane. The available settings control:

- Markdown rendering for annotation comments;
- pasting clipboard content into comments as plain text;
- LaTeX math rendering;
- preview font size from 80% to 150%;
- annotation rendering strategy.

The rendering strategies are:

- **Automatic (recommended):** pre-renders smaller annotation sets and uses viewport-lazy rendering for larger sets.
- **Render all annotations:** schedules all annotation previews for rendering.
- **Render near the viewport:** renders annotations as they approach the visible sidebar region.

Settings are saved automatically. If the reader does not reflect a changed setting, close and reopen that reader or restart Zotero.

## Preview and editing states

When an annotation is not being edited, its comment is shown as a rendered preview. Focusing the native Zotero comment editor restores the original Markdown source. Collapsed annotations retain Zotero's compact presentation.

The add-on changes presentation only; the Markdown source stored by Zotero is not replaced with generated HTML.

## Compatibility

The current implementation is developed and tested primarily with Zotero Desktop 9.0.6 on Windows. Zotero 9.x compatibility is the current target.

The reader sidebar DOM is not a fully stable public API. Real-Zotero validation should be repeated after Zotero updates, even when automated tests pass.
