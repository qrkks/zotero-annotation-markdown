// The existing key now controls sidebar rendering independently of popups.
pref("extensions.annotationMarkdown.enabled", true);
pref("extensions.annotationMarkdown.popupEnabled", false);
pref("extensions.annotationMarkdown.fontScalePercent", 100);
pref("extensions.annotationMarkdown.pasteAsPlainText", true);
pref("extensions.annotationMarkdown.fastEditor", true);
pref("extensions.annotationMarkdown.mathEnabled", true);
// Native MathML is an optional output; standard KaTeX rendering stays the default.
pref("extensions.annotationMarkdown.mathOutput", "htmlAndMathml");
pref("extensions.annotationMarkdown.svgEnabled", false);
pref("extensions.annotationMarkdown.mermaidEnabled", false);
pref("extensions.annotationMarkdown.performanceDiagnostics", false);
pref("extensions.annotationMarkdown.lightweightMode", false);
pref("extensions.annotationMarkdown.renderStrategy", "auto");
pref("extensions.annotationMarkdown.nativeRowLazy", false);
pref("extensions.annotationMarkdown.outlineEnabled", true);
pref("extensions.annotationMarkdown.outlineNumbering", false);
pref("extensions.annotationMarkdown.outlineSmartNumbering", true);
pref("extensions.annotationMarkdown.outlineExpanded", false);
pref("extensions.annotationMarkdown.outlineFontScalePercent", 100);
pref("extensions.annotationMarkdown.autoTodoTag", false);
pref("extensions.annotationMarkdown.autoTodoCleanup", false);
