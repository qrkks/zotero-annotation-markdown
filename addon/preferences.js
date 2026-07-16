var ZoteroAnnotationMarkdownPreferences = {
  enabledKey: "extensions.annotationMarkdown.enabled",
  fontScalePercentKey: "extensions.annotationMarkdown.fontScalePercent",
  pasteAsPlainTextKey: "extensions.annotationMarkdown.pasteAsPlainText",
  mathEnabledKey: "extensions.annotationMarkdown.mathEnabled",
  renderStrategyKey: "extensions.annotationMarkdown.renderStrategy",

  init(documentRef = document) {
    const enabledInput = documentRef.getElementById("annotation-markdown-enabled");
    const fontScaleSelect = documentRef.getElementById("annotation-markdown-font-scale");
    const pasteAsPlainTextInput = documentRef.getElementById("annotation-markdown-paste-as-plain-text");
    const mathEnabledInput = documentRef.getElementById("annotation-markdown-math-enabled");
    const renderStrategySelect = documentRef.getElementById("annotation-markdown-render-strategy");

    if (
      !enabledInput ||
      !fontScaleSelect ||
      !pasteAsPlainTextInput ||
      !mathEnabledInput ||
      !renderStrategySelect
    ) {
      return;
    }

    enabledInput.checked = this.getPref(this.enabledKey, true);
    fontScaleSelect.value = String(this.getPref(this.fontScalePercentKey, 100));
    pasteAsPlainTextInput.checked = this.getPref(this.pasteAsPlainTextKey, true);
    mathEnabledInput.checked = this.getPref(this.mathEnabledKey, true);
    renderStrategySelect.value = this.getPref(this.renderStrategyKey, "auto");

    enabledInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.enabledKey, Boolean(enabledInput.checked), true);
    });

    fontScaleSelect.addEventListener("command", () => {
      Zotero.Prefs.set(this.fontScalePercentKey, Number.parseInt(fontScaleSelect.value, 10), true);
    });

    pasteAsPlainTextInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.pasteAsPlainTextKey, Boolean(pasteAsPlainTextInput.checked), true);
    });

    mathEnabledInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.mathEnabledKey, Boolean(mathEnabledInput.checked), true);
    });

    renderStrategySelect.addEventListener("command", () => {
      const strategy = ["auto", "eager", "lazy"].includes(renderStrategySelect.value)
        ? renderStrategySelect.value
        : "auto";
      Zotero.Prefs.set(this.renderStrategyKey, strategy, true);
    });
  },

  getPref(key, defaultValue) {
    const value = Zotero.Prefs.get(key, true);
    return typeof value === typeof defaultValue ? value : defaultValue;
  }
};
