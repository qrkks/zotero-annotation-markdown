# User guide

[简体中文](../zh-CN/user-guide.md)

## Supported behavior

- PDF and EPUB reader sidebar annotation comments render as Markdown by default.
- LaTeX math renders by default with `$...$`, `$$...$$`, `\(...\)`, and `\[...\]` delimiters.
- Single line breaks remain visible.
- Bare URLs become clickable links in rendered previews.
- Text wrapped in `==double equals==` renders with a highlight; an optional color suffix can select a safe preset.
- Editing shows the original Markdown source text in a fast editor that saves on blur or Escape.
- Raw HTML is not trusted; rendered output is sanitized.
- Rendering failures leave the original plain text visible.

### Highlight colors

Use `==text==` for the default yellow highlight. Put one supported color suffix immediately after the closing `==` to select another preset:

```markdown
==Default yellow==
==Risk=={.red}
==Important=={.orange}
==Confirmed=={.green}
==Information=={.blue}
==Idea=={.purple}
==Secondary=={.gray}
```

The supported suffixes are `.yellow`, `.red`, `.orange`, `.green`, `.blue`, `.purple`, and `.gray`. Arbitrary classes, multiple classes, style attributes, and custom color values are not interpreted. Unknown or detached suffixes remain visible as ordinary text.

## Installation

Install `Zotero Annotation Markdown` from the Zotero Add-ons marketplace.

For manual installation, download `zotero-annotation-markdown.xpi` from the [latest GitHub release](https://github.com/qrkks/zotero-annotation-markdown/releases/latest). Open **Tools → Plugins** in Zotero and drag the `.xpi` file into the Plugins window.

## Settings

Open Zotero Settings and select the **Annotation Markdown** pane. The available settings control:

- Markdown rendering for annotation comments;
- experimental Markdown rendering for page annotation popups, disabled by default;
- pasting clipboard content into comments as plain text, recommended for AI responses so Markdown remains editable without imported rich-text formatting or hidden HTML;
- using the fast comment editor, enabled by default with Zotero's native editor available as a fallback;
- LaTeX math rendering;
- showing a floating outline for annotations with multiple headings, enabled by default;
- adjusting floating outline text size independently from 80% to 200%, with 100% preserving the previous size;
- adding a `todo` annotation tag when a saved comment contains a `todo:`, `todo：`, `t:`, or `t：` directive, disabled by default;
- optionally removing the lowercase `todo` annotation tag after the directive is removed and the comment is saved, disabled by default and requiring automatic tagging;
- preview font size from 80% to 200%;
- annotation rendering strategy.

The rendering strategies are:

- **Automatic (recommended):** pre-renders smaller annotation sets and uses viewport-lazy rendering for larger sets.
- **Render all annotations:** schedules all annotation previews for rendering.
- **Render near the viewport:** renders annotations as they approach the visible sidebar region.

Settings are saved automatically. Markdown preview font size is in **Reader Annotations**, beside the rendering options. If the reader does not reflect a changed setting, close and reopen that reader or restart Zotero.

## Preview and editing states

When an annotation is not being edited, its comment is shown as a rendered preview. Selecting a sidebar comment opens the faster source editor by default; changes save when focus leaves the editor or when Escape is pressed. Disable **Use the fast annotation comment editor** to restore Zotero's native sidebar editing path. Collapsed sidebar annotations retain Zotero's compact presentation.

Enable **Render page annotation popups as Markdown (Experimental)** to render page annotation popup comments as Markdown. It is off by default because this integration depends on Zotero's internal popup structure. When disabled, popup sizing, positioning, display, and editing remain fully native. When enabled, popups use a stable wider width that shrinks for narrow Reader windows, and the preview adds comfortable inner spacing. Long comments scroll within a viewport-bounded area instead of being clipped; dragging or clicking that scrollbar keeps the preview open. The popup stays transparent while Markdown renders and Zotero writes its post-render position. It normally appears on the next stable paint, while continued geometry changes fall back to the conservative two-frame stability check so provisional positions are not exposed. Clicking regular preview content opens the same fast textarea when that preference and the Reader update capability are available. The textarea keeps the preview's visible height and saves once on blur or Escape; otherwise Zotero's native popup editor remains the fallback.

If the installed Zotero version does not expose the Reader annotation update capability required by the fast editor, the add-on leaves the native editor in control automatically.

The add-on never replaces the Markdown source stored by Zotero with generated HTML.

When automatic todo tagging is enabled, a newly added annotation or a saved comment change with a line starting with `todo:`, `todo：`, `t:`, or `t：` (indentation allowed, case insensitive, such as `TODO:` or `T：`) gains a lowercase `todo` tag on that annotation. `t:` is a short form of `todo:` and follows the same cleanup rule. An existing todo tag in any letter case is left alone. The rule does not scan older annotations.

Both options are in the **Annotation Tags** settings group. Automatic cleanup is a separate option. When enabled, a comment edit that removes the directive also removes that annotation's lowercase `todo` tag. Tag-only changes and edits to comments that never had a directive do not run cleanup. Zotero does not record whether the plugin or the user added a particular lowercase `todo` tag; this option can therefore remove a manually added one. It leaves uppercase `TODO` tags untouched. Both options are off by default.

## Floating outline

When the selected annotation contains at least two Markdown headings, a compact **Outline** button stays fixed beside the annotation-sidebar viewport, so it remains available after the start of a long annotation has scrolled away. It prefers the open space to the right of the sidebar and scrollbar; at narrow widths it moves inside and opens to the left. The outline includes `H1` through `H6`, preserves their hierarchy, and highlights the section nearest the top of the annotation sidebar. Choosing an entry smoothly scrolls only that sidebar to its heading; it does not enter comment editing or change the selected annotation.

The outline is enabled by default and can be disabled with **Show a floating outline for annotations with multiple headings** in the **Floating Outline** settings group. **Outline text size** ranges from 80% to 200%, with 100% preserving the previous size. It is separate from Markdown preview font size and updates open Readers immediately. The panel widens when the text is enlarged, as space allows. The outline starts closed for new installations. Opening or closing it is remembered independently across annotations, Reader tabs, and Zotero restarts, so disabling and later re-enabling the feature preserves that choice. An annotation with fewer than two headings has no outline. Entering comment editing hides the outline temporarily, then restores the remembered state when the rendered preview returns.

## Sidebar positioning

The following refinements are in the current development build and are listed under [Unreleased](../../CHANGELOG.md#unreleased).

Selecting an annotation from the sidebar or document page uses Zotero's native smooth scrolling. When a single selected annotation is taller than the sidebar viewport, its beginning aligns near the top with a 2px inset, whether you navigate forward or backward. Short annotations keep their native positioning. Manual scrolling does not automatically return to the selected annotation.

Pressing **Escape** saves and exits the fast editor. If any part of the annotation remains visible after the preview returns, the add-on keeps the current position rather than returning to the beginning. If the whole annotation is outside the viewport, it makes one smooth scroll to the same 2px top inset, within the sidebar's scroll limits. New scrolling, clicks, typing, focus changes, or another selection cancel pending recovery.

Clicking elsewhere also saves, but ordinary blur does not bring the previous annotation back into view. This lets you continue to another annotation, the document page, or another control.

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
