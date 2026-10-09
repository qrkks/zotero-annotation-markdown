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

### SVG diagrams (Experimental)

Enable **Render SVG code blocks (Experimental)** in Settings to preview static diagrams in fenced `svg` blocks. The option is off by default and available when sidebar or page-popup Markdown rendering is enabled. Changes refresh open Readers. Zotero still saves the original Markdown and SVG text; no attachment or external image service is created.

When copying a whole AI reply, a diagram may arrive in a code block without a language label. Such blocks are also recognized when their entire contents form one complete SVG document, with optional whitespace, XML declaration and comments. The same SVG option and restrictions apply. Ordinary code, incomplete fragments, and blocks explicitly labeled `xml`, `html`, `text` or another language remain code. Use one of those labels when you want to display SVG source instead of a diagram.

~~~~markdown
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 100">
  <rect x="10" y="10" width="300" height="80" rx="8" fill="#eff6ff"/>
  <text x="160" y="56" text-anchor="middle" font-size="18" fill="#1e293b">My diagram</text>
</svg>
```
~~~~

Images fit the preview width. **View larger** opens the same sanitized image at its intrinsic size in a scrollable viewer. Close it with **Close**, Escape, or the backdrop. Tab stays inside the viewer. Ordinary image clicks follow the existing source-editing workflow.

Supported SVG includes basic shapes, paths, groups, text/tspan, local arrow markers, and local linear/radial gradients. Use presentation attributes such as `fill`, `stroke`, and `font-size`. CSS/style attributes, embedded HTML, external resources, `use`, animation, filters, document declarations and foreign namespaces are unsupported. SVG labels are literal text; LaTeX is rendered only in the surrounding Markdown. Image labels cannot be selected as Markdown text.

Each block is limited to 32,000 source characters, 512 elements, 32 nesting levels and image/viewBox dimensions of at most 4096 × 4096. A viewBox or numeric width and height is required. Malformed, unsupported or oversized SVG shows a short reason and the escaped code block. A failed image load also reveals the code. To generate compatible diagrams with an AI tool, request a fenced `svg` block with a viewBox, basic shapes and text, styles expressed as attributes, and no external resources.

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

- Markdown rendering for sidebar annotation comments;
- Markdown rendering for page annotation popups, disabled by default;
- pasting clipboard content into comments as plain text, recommended for AI responses so Markdown remains editable without imported rich-text formatting or hidden HTML;
- using the fast comment editor, enabled by default with Zotero's native editor available as a fallback;
- LaTeX math rendering;
- math rendering output: standard rendering by default, or optional native MathML (experimental);
- showing a floating outline for annotations with multiple headings, enabled by default;
- adjusting floating outline text size independently from 80% to 200%, with 100% preserving the previous size;
- adding a `todo` annotation tag when a saved comment contains a `todo:`, `todo：`, `t:`, or `t：` directive, disabled by default;
- optionally removing the lowercase `todo` annotation tag after the directive is removed and the comment is saved, disabled by default and requiring automatic tagging;
- preview font size from 80% to 200%;
- annotation rendering strategy;
- experimental acceleration when clearing tag filters in very large annotation lists, disabled by default.

**Render sidebar annotation comments as Markdown** and **Render page annotation popups as Markdown** are peer switches. Either can be enabled on its own, or both can be enabled or disabled. Sidebar rendering defaults on; popup rendering defaults off. Their saved choices are retained independently. Both use the same preview font size, LaTeX settings, and math output. The rendering strategy applies to sidebar comments; popups render immediately when enabled.

**Math rendering** in **Reader Annotations** offers **KaTeX HTML + MathML (default)** and **Native MathML only (Experimental)**. The default uses KaTeX HTML for formula appearance and includes MathML for accessibility. Native MathML can reduce formula rendering cost in annotations with many formulas; it uses Zotero's native math layout, so spacing, height, and typography may differ. The option was validated on Windows with Zotero 10.0.5 and 10.0.6. Changing it refreshes open Readers and preserves the saved LaTeX source. Select **KaTeX HTML + MathML (default)** to switch back at any time. Formula rendering is part of Markdown previews. When both sidebar and popup rendering are off, the formula checkbox and output picker are disabled while retaining their saved choices. Enabling either rendering scope restores the formula checkbox; the output picker also requires formula rendering to be on.

The rendering strategies are:

- **Automatic (recommended):** pre-renders smaller annotation sets and uses viewport-lazy rendering for larger sets.
- **Render all annotations:** schedules all annotation previews for rendering.
- **Render near the viewport:** renders annotations as they approach the visible sidebar region.

**Accelerate clearing tag filters in very large annotation lists (Experimental)** is currently enabled only for the verified Zotero 10.0.3 Reader structure. Enable the option before applying tag filters to a fully loaded annotation list. Acceleration requires cached exact heights for at least 100 unselected native rows; the add-on records these heights before the list narrows. Relaxing an active tag filter can then restore distant rows as equal-height placeholders and materialize the complete native rows near the viewport or when selected. It does not accelerate the first opening of a Reader. Missing height data, an unsupported Zotero version, or an incompatible Reader structure automatically uses Zotero's native list. Turning the option off restores placeholder rows to native rows in small asynchronous batches.

Settings are saved automatically. Markdown preview font size is in **Reader Annotations**, beside the rendering options. If the reader does not reflect a changed setting, close and reopen that reader or restart Zotero.

## Preview and editing states

When an annotation is not being edited, its comment is shown as a rendered preview. Selecting a sidebar comment opens the faster source editor by default; changes save when focus leaves the editor or when Escape is pressed. Disable **Use the fast annotation comment editor** to restore Zotero's native sidebar editing path. Collapsed sidebar annotations retain Zotero's compact presentation.

Enable **Render page annotation popups as Markdown** to render page annotation popup comments as Markdown. It is an independent option and is off by default. When disabled, popup sizing, positioning, display, and preview rendering remain fully native. Fast editing follows **Use the fast annotation comment editor** independently: a newly opened empty popup enters the fast textarea after Zotero's layout settles, while clicking existing popup content enters it on demand. The textarea saves once on blur or Escape; disabling fast editing or lacking Reader update capability keeps Zotero's native popup editor. When Markdown popup rendering is enabled, popups use a stable wider width that shrinks for narrow Reader windows, and the preview adds comfortable inner spacing. Long comments scroll within a viewport-bounded area instead of being clipped; dragging or clicking that scrollbar keeps the preview open. The popup stays transparent until the current annotation preview has rendered and its geometry is stable. On initial opening and annotation switches, it waits for the new content and positions the final popup size at the current annotation, avoiding a later jump after expensive formula rendering. Empty comments that automatically enter the fast editor also wait for the textarea size to settle before appearing.

If the installed Zotero version does not expose the Reader annotation update capability required by the fast editor, the add-on leaves the native editor in control automatically.

The add-on never replaces the Markdown source stored by Zotero with generated HTML.

When automatic todo tagging is enabled, a newly added annotation or a saved comment change with a line starting with `todo:`, `todo：`, `t:`, or `t：` (indentation allowed, case insensitive, such as `TODO:` or `T：`) gains a lowercase `todo` tag on that annotation. `t:` is a short form of `todo:` and follows the same cleanup rule. An existing todo tag in any letter case is left alone. The rule does not scan older annotations.

Both options are in the **Annotation Tags** settings group. Automatic cleanup is a separate option. When enabled, a comment edit that removes the directive also removes that annotation's lowercase `todo` tag. Tag-only changes and edits to comments that never had a directive do not run cleanup. Zotero does not record whether the plugin or the user added a particular lowercase `todo` tag; this option can therefore remove a manually added one. It leaves uppercase `TODO` tags untouched. Both options are off by default.

## Floating outline

When the selected annotation contains at least two Markdown headings, a compact **Outline** button stays fixed beside the annotation-sidebar viewport, so it remains available after the start of a long annotation has scrolled away. It prefers the open space to the right of the sidebar and scrollbar; at narrow widths it moves inside and opens to the left. The outline includes `H1` through `H6`, preserves their hierarchy, and highlights the section nearest the top of the annotation sidebar. Choosing an entry smoothly scrolls only that sidebar to its heading; it does not enter comment editing or change the selected annotation.

The outline is enabled by default and can be disabled with **Show a floating outline for annotations with multiple headings** in the **Floating Outline** settings group. **Outline font size** ranges from 80% to 200%, with 100% preserving the previous size. It is separate from Markdown preview font size and updates open Readers immediately. The panel widens when the text is enlarged, as space allows. The outline starts closed for new installations. Opening or closing it is remembered independently across annotations, Reader tabs, and Zotero restarts, so disabling and later re-enabling the feature preserves that choice. An annotation with fewer than two headings has no outline. Entering comment editing hides the outline temporarily, then restores the remembered state when the rendered preview returns.

## Sidebar positioning

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
