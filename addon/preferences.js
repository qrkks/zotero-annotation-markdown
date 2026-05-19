var ZoteroAnnotationMarkdownPreferences = {
  enabledKey: "extensions.annotationMarkdown.enabled",
  fontScalePercentKey: "extensions.annotationMarkdown.fontScalePercent",

  init(documentRef = document) {
    const enabledInput = documentRef.getElementById("annotation-markdown-enabled");
    const fontScaleSelect = documentRef.getElementById("annotation-markdown-font-scale");

    if (!enabledInput || !fontScaleSelect) {
      return;
    }

    enabledInput.checked = this.getPref(this.enabledKey, true);
    fontScaleSelect.value = String(this.getPref(this.fontScalePercentKey, 100));

    enabledInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.enabledKey, Boolean(enabledInput.checked), true);
    });

    fontScaleSelect.addEventListener("command", () => {
      Zotero.Prefs.set(this.fontScalePercentKey, Number.parseInt(fontScaleSelect.value, 10), true);
    });
  },

  getPref(key, defaultValue) {
    const value = Zotero.Prefs.get(key, true);
    return typeof value === typeof defaultValue ? value : defaultValue;
  }
};
