Zotero.AnnotationMarkdownPreferences = {
  enabledKey: "extensions.annotationMarkdown.enabled",
  popupEnabledKey: "extensions.annotationMarkdown.popupEnabled",
  fontScalePercentKey: "extensions.annotationMarkdown.fontScalePercent",
  pasteAsPlainTextKey: "extensions.annotationMarkdown.pasteAsPlainText",
  fastEditorKey: "extensions.annotationMarkdown.fastEditor",
  mathEnabledKey: "extensions.annotationMarkdown.mathEnabled",
  outlineEnabledKey: "extensions.annotationMarkdown.outlineEnabled",
  outlineFontScalePercentKey: "extensions.annotationMarkdown.outlineFontScalePercent",
  autoTodoTagKey: "extensions.annotationMarkdown.autoTodoTag",
  autoTodoCleanupKey: "extensions.annotationMarkdown.autoTodoCleanup",
  renderStrategyKey: "extensions.annotationMarkdown.renderStrategy",

  init(documentRef = document) {
    const enabledInput = documentRef.getElementById("annotation-markdown-enabled");
    const popupOption = documentRef.getElementById("annotation-markdown-popup-option");
    const popupEnabledInput = documentRef.getElementById("annotation-markdown-popup-enabled");
    const fontScaleSelect = documentRef.getElementById("annotation-markdown-font-scale");
    const pasteAsPlainTextInput = documentRef.getElementById("annotation-markdown-paste-as-plain-text");
    const fastEditorInput = documentRef.getElementById("annotation-markdown-fast-editor");
    const mathEnabledInput = documentRef.getElementById("annotation-markdown-math-enabled");
    const outlineEnabledInput = documentRef.getElementById("annotation-markdown-outline-enabled");
    const outlineFontScaleSelect = documentRef.getElementById("annotation-markdown-outline-font-scale");
    const autoTodoTagInput = documentRef.getElementById("annotation-markdown-auto-todo-tag");
    const autoTodoCleanupInput = documentRef.getElementById("annotation-markdown-auto-todo-cleanup");
    const renderStrategySelect = documentRef.getElementById("annotation-markdown-render-strategy");

    if (
      !enabledInput ||
      !popupOption ||
      !popupEnabledInput ||
      !fontScaleSelect ||
      !pasteAsPlainTextInput ||
      !fastEditorInput ||
      !mathEnabledInput ||
      !outlineEnabledInput ||
      !outlineFontScaleSelect ||
      !autoTodoTagInput ||
      !autoTodoCleanupInput ||
      !renderStrategySelect
    ) {
      return;
    }

    enabledInput.checked = this.getPref(this.enabledKey, true);
    popupEnabledInput.checked = this.getPref(this.popupEnabledKey, false);
    this.setPopupOptionEnabled(popupOption, popupEnabledInput, enabledInput.checked);
    fontScaleSelect.value = String(this.getPref(this.fontScalePercentKey, 100));
    pasteAsPlainTextInput.checked = this.getPref(this.pasteAsPlainTextKey, true);
    fastEditorInput.checked = this.getPref(this.fastEditorKey, true);
    mathEnabledInput.checked = this.getPref(this.mathEnabledKey, true);
    outlineEnabledInput.checked = this.getPref(this.outlineEnabledKey, true);
    outlineFontScaleSelect.value = String(this.getPref(this.outlineFontScalePercentKey, 100));
    autoTodoTagInput.checked = this.getPref(this.autoTodoTagKey, false);
    autoTodoCleanupInput.checked = this.getPref(this.autoTodoCleanupKey, false);
    autoTodoCleanupInput.disabled = !autoTodoTagInput.checked;
    renderStrategySelect.value = this.getPref(this.renderStrategyKey, "auto");

    enabledInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.enabledKey, Boolean(enabledInput.checked), true);
      this.setPopupOptionEnabled(popupOption, popupEnabledInput, enabledInput.checked);
    });
    enabledInput.addEventListener("syncfrompreference", () => {
      this.setPopupOptionEnabled(popupOption, popupEnabledInput, enabledInput.checked);
    });

    popupEnabledInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.popupEnabledKey, Boolean(popupEnabledInput.checked), true);
    });

    fontScaleSelect.addEventListener("command", () => {
      Zotero.Prefs.set(this.fontScalePercentKey, Number.parseInt(fontScaleSelect.value, 10), true);
    });

    pasteAsPlainTextInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.pasteAsPlainTextKey, Boolean(pasteAsPlainTextInput.checked), true);
    });

    fastEditorInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.fastEditorKey, Boolean(fastEditorInput.checked), true);
    });

    mathEnabledInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.mathEnabledKey, Boolean(mathEnabledInput.checked), true);
    });

    outlineEnabledInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.outlineEnabledKey, Boolean(outlineEnabledInput.checked), true);
    });

    outlineFontScaleSelect.addEventListener("command", () => {
      Zotero.Prefs.set(this.outlineFontScalePercentKey, Number.parseInt(outlineFontScaleSelect.value, 10), true);
    });

    autoTodoTagInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.autoTodoTagKey, Boolean(autoTodoTagInput.checked), true);
      autoTodoCleanupInput.disabled = !autoTodoTagInput.checked;
    });

    autoTodoCleanupInput.addEventListener("command", () => {
      Zotero.Prefs.set(this.autoTodoCleanupKey, Boolean(autoTodoCleanupInput.checked), true);
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
  },

  setPopupOptionEnabled(container, input, enabled) {
    const disabled = !Boolean(enabled);
    input.disabled = disabled;
    if (disabled) {
      input.setAttribute("disabled", "true");
      container.setAttribute("data-disabled", "true");
      return;
    }
    input.removeAttribute("disabled");
    container.removeAttribute("data-disabled");
  }
};
