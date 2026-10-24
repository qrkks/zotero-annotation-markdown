import type { PreferenceValue } from "./types.js";
import { createPreferenceLocalizer, settingsLanguage } from "./preference-localization";

/** The part of a XUL element needed by the settings pane. */
export interface PreferenceElement {
  addEventListener(name: string, listener: () => void): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}
interface PreferenceControl extends PreferenceElement { disabled?: boolean; }
interface PreferenceCheckbox extends PreferenceControl { checked: boolean; }
interface PreferenceSelect extends PreferenceControl { value: string; }
export interface PreferenceDocument {
  getElementById(id: string): PreferenceElement | null | undefined;
}
export interface PreferencePaneHost {
  locale?: string;
  logError?: (error: unknown) => void;
  Prefs: {
    get(key: string, global: boolean): unknown;
    set(key: string, value: PreferenceValue, global: boolean): void;
  };
}
type PreferenceType<T extends PreferenceValue> = T extends boolean ? boolean : T extends number ? number : string;

// XUL checked/value properties are supplied by the host, beyond the standard
// HTMLElement declaration. Keep that assertion at this lookup boundary.
function getXulElement<T extends PreferenceElement>(doc: PreferenceDocument, id: string): T | null | undefined {
  return doc.getElementById(id) as T | null | undefined;
}

export function createPreferencePane(host: PreferencePaneHost) {
  return {
    settingsLanguageKey: "extensions.annotationMarkdown.settingsLanguage",
    enabledKey: "extensions.annotationMarkdown.enabled",
    popupEnabledKey: "extensions.annotationMarkdown.popupEnabled",
    fontScalePercentKey: "extensions.annotationMarkdown.fontScalePercent",
    pasteAsPlainTextKey: "extensions.annotationMarkdown.pasteAsPlainText",
    fastEditorKey: "extensions.annotationMarkdown.fastEditor",
    mathEnabledKey: "extensions.annotationMarkdown.mathEnabled",
    mathOutputKey: "extensions.annotationMarkdown.mathOutput",
    svgEnabledKey: "extensions.annotationMarkdown.svgEnabled",
    mermaidEnabledKey: "extensions.annotationMarkdown.mermaidEnabled",
    linkedImagePreviewEnabledKey: "extensions.annotationMarkdown.linkedImagePreviewEnabled",
    outlineEnabledKey: "extensions.annotationMarkdown.outlineEnabled",
    outlineNumberingKey: "extensions.annotationMarkdown.outlineNumbering",
    outlineSmartNumberingKey: "extensions.annotationMarkdown.outlineSmartNumbering",
    outlineFontScalePercentKey: "extensions.annotationMarkdown.outlineFontScalePercent",
    autoTodoTagKey: "extensions.annotationMarkdown.autoTodoTag",
    autoTodoCleanupKey: "extensions.annotationMarkdown.autoTodoCleanup",
    renderStrategyKey: "extensions.annotationMarkdown.renderStrategy",
    nativeRowLazyKey: "extensions.annotationMarkdown.nativeRowLazy",

    init(documentRef: PreferenceDocument = document) {
      const languageSelect = getXulElement<PreferenceSelect>(documentRef, "annotation-markdown-settings-language");
      const localize = createPreferenceLocalizer(documentRef, host);
      const savedLanguage = settingsLanguage(host.Prefs.get(this.settingsLanguageKey, true));
      if (languageSelect) {
        languageSelect.value = savedLanguage;
        languageSelect.addEventListener("command", () => {
          const language = settingsLanguage(languageSelect.value);
          languageSelect.value = language;
          host.Prefs.set(this.settingsLanguageKey, language, true);
          void localize(language);
        });
        languageSelect.addEventListener("syncfrompreference", () => {
          languageSelect.value = settingsLanguage(host.Prefs.get(this.settingsLanguageKey, true));
          void localize(settingsLanguage(languageSelect.value));
        });
      }
      const localizationReady = localize(savedLanguage);
      const enabledInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-enabled");
      const popupOption = getXulElement<PreferenceElement>(documentRef, "annotation-markdown-popup-option");
      const popupEnabledInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-popup-enabled");
      const fontScaleSelect = getXulElement<PreferenceSelect>(documentRef, "annotation-markdown-font-scale");
      const pasteAsPlainTextInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-paste-as-plain-text");
      const fastEditorInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-fast-editor");
      const mathEnabledInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-math-enabled");
      const mathOutputOption = getXulElement<PreferenceElement>(documentRef, "annotation-markdown-math-output-option");
      const mathOutputSelect = getXulElement<PreferenceSelect>(documentRef, "annotation-markdown-math-output");
      const svgEnabledInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-svg-enabled");
      const mermaidEnabledInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-mermaid-enabled");
      const linkedImagePreviewEnabledInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-linked-image-preview-enabled");
      const outlineEnabledInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-outline-enabled");
      const outlineNumberingOption = getXulElement<PreferenceElement>(documentRef, "annotation-markdown-outline-numbering-option");
      const outlineNumberingInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-outline-numbering");
      const outlineSmartNumberingOption = getXulElement<PreferenceElement>(documentRef, "annotation-markdown-outline-smart-numbering-option");
      const outlineSmartNumberingInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-outline-smart-numbering");
      const outlineFontScaleSelect = getXulElement<PreferenceSelect>(documentRef, "annotation-markdown-outline-font-scale");
      const autoTodoTagInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-auto-todo-tag");
      const autoTodoCleanupInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-auto-todo-cleanup");
      const renderStrategySelect = getXulElement<PreferenceSelect>(documentRef, "annotation-markdown-render-strategy");
      const nativeRowLazyInput = getXulElement<PreferenceCheckbox>(documentRef, "annotation-markdown-native-row-lazy");

      if (
        !enabledInput ||
        !popupOption ||
        !popupEnabledInput ||
        !fontScaleSelect ||
        !pasteAsPlainTextInput ||
        !fastEditorInput ||
        !mathEnabledInput ||
        !mathOutputOption ||
        !mathOutputSelect ||
        !outlineEnabledInput ||
        !outlineFontScaleSelect ||
        !autoTodoTagInput ||
        !autoTodoCleanupInput ||
        !renderStrategySelect ||
        !nativeRowLazyInput
      ) {
        return;
      }

      enabledInput.checked = this.getPref(this.enabledKey, true);
      popupEnabledInput.checked = this.getPref(this.popupEnabledKey, false);
      this.setDependentOptionEnabled(popupOption, popupEnabledInput, true);
      fontScaleSelect.value = String(this.getPref(this.fontScalePercentKey, 100));
      pasteAsPlainTextInput.checked = this.getPref(this.pasteAsPlainTextKey, true);
      fastEditorInput.checked = this.getPref(this.fastEditorKey, true);
      mathEnabledInput.checked = this.getPref(this.mathEnabledKey, true);
      if (svgEnabledInput) svgEnabledInput.checked = this.getPref(this.svgEnabledKey, false);
      if (mermaidEnabledInput) mermaidEnabledInput.checked = this.getPref(this.mermaidEnabledKey, false);
      if (linkedImagePreviewEnabledInput) linkedImagePreviewEnabledInput.checked = this.getPref(this.linkedImagePreviewEnabledKey, true);
      mathOutputSelect.value = this.getPref(this.mathOutputKey, "htmlAndMathml") === "mathml"
        ? "mathml"
        : "htmlAndMathml";
      const syncMathControlsEnabled = () => {
        const renderingEnabled = enabledInput.checked || popupEnabledInput.checked;
        this.setControlEnabled(mathEnabledInput, renderingEnabled);
        if (svgEnabledInput) this.setControlEnabled(svgEnabledInput, renderingEnabled);
        if (mermaidEnabledInput) this.setControlEnabled(mermaidEnabledInput, renderingEnabled);
        if (linkedImagePreviewEnabledInput) this.setControlEnabled(linkedImagePreviewEnabledInput, renderingEnabled);
        this.setDependentOptionEnabled(mathOutputOption, mathOutputSelect,
          renderingEnabled && mathEnabledInput.checked);
      };
      syncMathControlsEnabled();
      outlineEnabledInput.checked = this.getPref(this.outlineEnabledKey, true);
      if (outlineNumberingInput) outlineNumberingInput.checked = this.getPref(this.outlineNumberingKey, false);
      if (outlineSmartNumberingInput) outlineSmartNumberingInput.checked = this.getPref(this.outlineSmartNumberingKey, true);
      const syncOutlineNumberingEnabled = () => {
        if (outlineNumberingOption && outlineNumberingInput) {
          this.setDependentOptionEnabled(outlineNumberingOption, outlineNumberingInput, outlineEnabledInput.checked);
        }
        if (outlineSmartNumberingOption && outlineSmartNumberingInput) {
          this.setDependentOptionEnabled(outlineSmartNumberingOption, outlineSmartNumberingInput,
            outlineEnabledInput.checked && Boolean(outlineNumberingInput?.checked));
        }
      };
      syncOutlineNumberingEnabled();
      outlineFontScaleSelect.value = String(this.getPref(this.outlineFontScalePercentKey, 100));
      autoTodoTagInput.checked = this.getPref(this.autoTodoTagKey, false);
      autoTodoCleanupInput.checked = this.getPref(this.autoTodoCleanupKey, false);
      this.setControlEnabled(autoTodoCleanupInput, true);
      renderStrategySelect.value = this.getPref(this.renderStrategyKey, "auto");
      nativeRowLazyInput.checked = this.getPref(this.nativeRowLazyKey, false);

      enabledInput.addEventListener("command", () => {
        host.Prefs.set(this.enabledKey, Boolean(enabledInput.checked), true);
        syncMathControlsEnabled();
      });
      enabledInput.addEventListener("syncfrompreference", () => {
        syncMathControlsEnabled();
      });

      popupEnabledInput.addEventListener("command", () => {
        host.Prefs.set(this.popupEnabledKey, Boolean(popupEnabledInput.checked), true);
        syncMathControlsEnabled();
      });
      popupEnabledInput.addEventListener("syncfrompreference", syncMathControlsEnabled);

      fontScaleSelect.addEventListener("command", () => {
        host.Prefs.set(this.fontScalePercentKey, Number.parseInt(fontScaleSelect.value, 10), true);
      });

      pasteAsPlainTextInput.addEventListener("command", () => {
        host.Prefs.set(this.pasteAsPlainTextKey, Boolean(pasteAsPlainTextInput.checked), true);
      });

      fastEditorInput.addEventListener("command", () => {
        host.Prefs.set(this.fastEditorKey, Boolean(fastEditorInput.checked), true);
      });

      mathEnabledInput.addEventListener("command", () => {
        host.Prefs.set(this.mathEnabledKey, Boolean(mathEnabledInput.checked), true);
        syncMathControlsEnabled();
      });
      svgEnabledInput?.addEventListener("command", () => {
        host.Prefs.set(this.svgEnabledKey, Boolean(svgEnabledInput.checked), true);
      });
      mermaidEnabledInput?.addEventListener("command", () => {
        host.Prefs.set(this.mermaidEnabledKey, Boolean(mermaidEnabledInput.checked), true);
      });
      linkedImagePreviewEnabledInput?.addEventListener("command", () => {
        host.Prefs.set(this.linkedImagePreviewEnabledKey, Boolean(linkedImagePreviewEnabledInput.checked), true);
      });
      mathEnabledInput.addEventListener("syncfrompreference", syncMathControlsEnabled);

      mathOutputSelect.addEventListener("command", () => {
        const output = mathOutputSelect.value === "mathml" ? "mathml" : "htmlAndMathml";
        host.Prefs.set(this.mathOutputKey, output, true);
      });

      outlineEnabledInput.addEventListener("command", () => {
        host.Prefs.set(this.outlineEnabledKey, Boolean(outlineEnabledInput.checked), true);
        syncOutlineNumberingEnabled();
      });
      outlineEnabledInput.addEventListener("syncfrompreference", syncOutlineNumberingEnabled);
      outlineNumberingInput?.addEventListener("command", () => {
        if (!outlineNumberingInput.disabled) host.Prefs.set(this.outlineNumberingKey, Boolean(outlineNumberingInput.checked), true);
        syncOutlineNumberingEnabled();
      });
      outlineNumberingInput?.addEventListener("syncfrompreference", syncOutlineNumberingEnabled);
      outlineSmartNumberingInput?.addEventListener("command", () => {
        if (!outlineSmartNumberingInput.disabled) host.Prefs.set(this.outlineSmartNumberingKey, Boolean(outlineSmartNumberingInput.checked), true);
      });

      outlineFontScaleSelect.addEventListener("command", () => {
        host.Prefs.set(this.outlineFontScalePercentKey, Number.parseInt(outlineFontScaleSelect.value, 10), true);
      });

      autoTodoTagInput.addEventListener("command", () => {
        host.Prefs.set(this.autoTodoTagKey, Boolean(autoTodoTagInput.checked), true);
      });

      autoTodoCleanupInput.addEventListener("command", () => {
        host.Prefs.set(this.autoTodoCleanupKey, Boolean(autoTodoCleanupInput.checked), true);
      });

      renderStrategySelect.addEventListener("command", () => {
        const strategy = ["auto", "eager", "lazy"].includes(renderStrategySelect.value)
          ? renderStrategySelect.value
          : "auto";
        host.Prefs.set(this.renderStrategyKey, strategy, true);
      });

      nativeRowLazyInput.addEventListener("command", () => {
        host.Prefs.set(this.nativeRowLazyKey, Boolean(nativeRowLazyInput.checked), true);
      });
      return localizationReady;
    },

    getPref<T extends PreferenceValue>(key: string, defaultValue: T): PreferenceType<T> {
      const value = host.Prefs.get(key, true);
      return (typeof value === typeof defaultValue ? value : defaultValue) as PreferenceType<T>;
    },

    setControlEnabled(input: PreferenceControl, enabled: boolean) {
      const disabled = !Boolean(enabled);
      input.disabled = disabled;
      if (disabled) {
        input.setAttribute("disabled", "true");
        return;
      }
      input.removeAttribute("disabled");
    },

    setDependentOptionEnabled(container: PreferenceElement, input: PreferenceControl, enabled: boolean) {
      this.setControlEnabled(input, enabled);
      if (input.disabled) container.setAttribute("data-disabled", "true");
      else container.removeAttribute("data-disabled");
    }
  };
}

export type PreferencePane = ReturnType<typeof createPreferencePane>;

// Zotero loads the bundled file as a privileged script, not an ES module.
declare const Zotero: PreferencePaneHost & { AnnotationMarkdownPreferences?: PreferencePane };
Zotero.AnnotationMarkdownPreferences = createPreferencePane(Zotero);
