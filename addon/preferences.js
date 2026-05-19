var ZoteroAnnotationMarkdownPreferences = {
  enabledKey: "extensions.annotationMarkdown.enabled",
  fontScalePercentKey: "extensions.annotationMarkdown.fontScalePercent",
  pasteAsPlainTextKey: "extensions.annotationMarkdown.pasteAsPlainText",

  init(documentRef = document) {
    const enabledInput = documentRef.getElementById("annotation-markdown-enabled");
    const fontScaleSelect = documentRef.getElementById("annotation-markdown-font-scale");
    const pasteAsPlainTextInput = documentRef.getElementById("annotation-markdown-paste-as-plain-text");

    if (!enabledInput || !fontScaleSelect || !pasteAsPlainTextInput) {
      return;
    }

    enabledInput.checked = this.getPref(this.enabledKey, true);
    fontScaleSelect.value = String(this.getPref(this.fontScalePercentKey, 100));
    pasteAsPlainTextInput.checked = this.getPref(this.pasteAsPlainTextKey, true);

    enabledInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.enabledKey, Boolean(enabledInput.checked), true);
    });

    fontScaleSelect.addEventListener("command", () => {
      Zotero.Prefs.set(this.fontScalePercentKey, Number.parseInt(fontScaleSelect.value, 10), true);
    });

    pasteAsPlainTextInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.pasteAsPlainTextKey, Boolean(pasteAsPlainTextInput.checked), true);
    });
  },

  getPref(key, defaultValue) {
    const value = Zotero.Prefs.get(key, true);
    return typeof value === typeof defaultValue ? value : defaultValue;
  }
};
