# Settings pane only. Keep identifiers namespaced because Zotero shares the document with other plugins.
# Checkbox/menuitem captions use .label; XUL field labels use .value.

annotation-markdown-prefs-reader = Reader Annotations
annotation-markdown-prefs-enabled =
    .label = Render sidebar annotation comments as Markdown
annotation-markdown-prefs-popup-enabled =
    .label = Render page annotation popups as Markdown
annotation-markdown-prefs-popup-description = Show formatted Markdown previews in page annotation popups independently of sidebar rendering. Off by default.
annotation-markdown-prefs-math-enabled =
    .label = Render LaTeX math formulas
annotation-markdown-prefs-math-description = Enable sidebar or page-popup Markdown rendering to use formulas. Your formula settings are kept when both are off.
annotation-markdown-prefs-math-output =
    .value = Math rendering
annotation-markdown-prefs-math-html =
    .label = KaTeX HTML + MathML (default)
annotation-markdown-prefs-math-native =
    .label = Native MathML only (Experimental)
annotation-markdown-prefs-math-output-description = KaTeX HTML controls formula appearance and includes MathML for accessibility. Native MathML uses Zotero's built-in math layout and can reduce rendering cost; spacing and appearance may differ.
annotation-markdown-prefs-svg-enabled =
    .label = Render SVG code blocks (Experimental)
annotation-markdown-prefs-svg-description = Show static diagrams from svg code blocks or complete SVG in blocks without a language label. Off by default. Supports basic shapes, text, local arrows, gradients and small embedded WOFF2 fonts; scripts, general CSS, external resources and animation are unsupported. The original source remains editable.
annotation-markdown-prefs-font-size =
    .value = Markdown preview font size
annotation-markdown-prefs-paste-as-plain-text =
    .label = Paste clipboard content into annotation comments as plain text
annotation-markdown-prefs-paste-description = Recommended when pasting responses from AI tools. Keeps Markdown editable and avoids importing rich-text formatting or hidden HTML.
annotation-markdown-prefs-fast-editor =
    .label = Use the fast annotation comment editor
annotation-markdown-prefs-fast-editor-description = Helps reduce typing lag in documents with many annotations.

annotation-markdown-prefs-outline = Floating Outline
annotation-markdown-prefs-outline-enabled =
    .label = Show a floating outline for annotations with multiple headings
annotation-markdown-prefs-outline-font-size =
    .value = Outline font size

annotation-markdown-prefs-tags = Annotation Tags
annotation-markdown-prefs-auto-todo-tag =
    .label = Add a todo tag for TODO: or T: lines
annotation-markdown-prefs-auto-todo-description = Matches todo:, todo：, t:, or t： at the start of a line in any letter case and adds a lowercase todo tag.
annotation-markdown-prefs-auto-todo-cleanup =
    .label = Remove the todo tag when the directive is removed
annotation-markdown-prefs-auto-todo-cleanup-description = Optional; works only with automatic tagging. After a comment edit, removes the lowercase todo tag even if it was added manually. Does not scan old annotations.

annotation-markdown-prefs-performance = Rendering Performance
annotation-markdown-prefs-render-strategy =
    .value = Annotation rendering
annotation-markdown-prefs-render-auto =
    .label = Automatic (recommended)
annotation-markdown-prefs-render-eager =
    .label = Render all annotations
annotation-markdown-prefs-render-lazy =
    .label = Render near the viewport
annotation-markdown-prefs-native-row-lazy =
    .label = Accelerate clearing tag filters in very large annotation lists (Experimental)
annotation-markdown-prefs-native-row-description = Reduces pauses when deselecting tags restores many annotations. Enable before applying tag filters to a fully loaded list. Off by default; currently supports Zotero 10.0.3. Does not speed up first opening; falls back to Zotero's native list when unavailable.
