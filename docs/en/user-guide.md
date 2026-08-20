# User guide

[简体中文](../zh-CN/user-guide.md)

## Supported behavior

- PDF and EPUB reader sidebar annotation comments render as Markdown by default.
- LaTeX math renders by default with `$...$`, `$$...$$`, `\(...\)`, and `\[...\]` delimiters.
- Single line breaks remain visible.
- Bare URLs become clickable links in rendered previews.
- Editing shows the original Markdown source text in a fast editor that saves on blur or Escape.
- Raw HTML is not trusted; rendered output is sanitized.
- Rendering failures leave the original plain text visible.

## Installation

Install `Zotero Annotation Markdown` from the Zotero Add-ons marketplace.

For manual installation, download `zotero-annotation-markdown.xpi` from the [latest GitHub release](https://github.com/qrkks/zotero-annotation-markdown/releases/latest). Open **Tools → Plugins** in Zotero and drag the `.xpi` file into the Plugins window.

## Settings

Open Zotero Settings and select the **Annotation Markdown** pane. The available settings control:

- Markdown rendering for annotation comments;
- pasting clipboard content into comments as plain text, recommended for AI responses so Markdown remains editable without imported rich-text formatting or hidden HTML;
- using the fast comment editor, enabled by default with Zotero's native editor available as a fallback;
- LaTeX math rendering;
- preview font size from 80% to 150%;
- annotation rendering strategy.

The rendering strategies are:

- **Automatic (recommended):** pre-renders smaller annotation sets and uses viewport-lazy rendering for larger sets.
- **Render all annotations:** schedules all annotation previews for rendering.
- **Render near the viewport:** renders annotations as they approach the visible sidebar region.

Settings are saved automatically. If the reader does not reflect a changed setting, close and reopen that reader or restart Zotero.

## Preview and editing states

When an annotation is not being edited, its comment is shown as a rendered preview. Selecting its comment opens the faster source editor by default; changes save when focus leaves the editor or when Escape is pressed. Disable **Use a faster editor instead of Zotero's native annotation comment editor** to restore Zotero's native editing path. Collapsed annotations retain Zotero's compact presentation.

If the installed Zotero version does not expose the Reader annotation update capability required by the fast editor, the add-on leaves the native editor in control automatically.

The add-on changes presentation only; the Markdown source stored by Zotero is not replaced with generated HTML.

## Why the replacement editor can be faster

In real-reader comparisons, editing became progressively slower in a heavily annotated book as the sidebar accumulated many annotation rows and tags. Turning off the replacement editor brought the delay back, while enabling it made typing responsive again. This isolates the slowdown to Zotero's native editing path in that workload, but it does not prove that tags alone are the cause or identify one specific Zotero internal function.

Zotero's native comment editor participates in host-controlled selection, focus, editor component state, and sidebar layout. That work can become expensive when the surrounding sidebar is large and complex. The add-on avoids putting each keystroke through that native editing UI:

1. It mounts one lightweight textarea only for the comment being edited and leaves surrounding annotation previews connected.
2. It pauses its own Markdown rendering work while typing and keeps editor keyboard events inside the textarea.
3. On blur or Escape, it sends the final Markdown source once through Zotero's annotation manager.
4. It then refreshes only the edited comment and preserves the visible sidebar position.

The add-on does not create a separate comment database or bypass Zotero's stored annotation model. If the required save capability is unavailable, or if the preference is disabled, Zotero's native editor remains in control.

## Compatibility

The current implementation declares support for Zotero Desktop 9.0 and 10.0.x. Release validation prioritizes the latest Zotero 10 version. Zotero 9 remains supported on a best-effort basis and can use the native-editor fallback if the fast-editor integration is unavailable.

The reader sidebar DOM is not a fully stable public API. Real-Zotero validation should be repeated after Zotero updates, even when automated tests pass.
