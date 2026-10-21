import type { PreferenceDocument, PreferencePaneHost } from "./preferences";

export type SettingsLanguage = "auto" | "en-US" | "zh-CN";

export function settingsLanguage(value: unknown): SettingsLanguage {
  return value === "en-US" || value === "zh-CN" ? value : "auto";
}

/** Format only our pane: Zotero's preferences document is shared by other panes. */
export function createPreferenceLocalizer(doc: PreferenceDocument, host: PreferencePaneHost) {
  const root = doc.getElementById("annotation-markdown-preferences") as HTMLElement | null | undefined;
  let revision = 0;
  return async (language: SettingsLanguage): Promise<void> => {
    if (!root?.querySelectorAll || typeof Localization === "undefined") return;
    const request = ++revision;
    const locale = language === "auto" ? host.locale || "en-US" : language;
    const locales = [...new Set([locale, "en-US"])];
    // Private IDs prevent the shared document's automatic translator from
    // overwriting this pane with Zotero's language after a local override.
    const targets = [...root.querySelectorAll("[data-annotation-markdown-l10n-id]")];
    try {
      const localization = new Localization(["annotation-markdown-preferences.ftl"], false, undefined, locales);
      const messages = await localization.formatMessages(targets.map(target => ({ id: target.getAttribute("data-annotation-markdown-l10n-id")! })));
      if (request !== revision || !root.isConnected) return;
      targets.forEach((target, index) => {
        const message = messages[index];
        if (!message) return;
        if (message.value !== null && message.value !== undefined) target.textContent = message.value;
        const caption = target.localName === "label" ? "value" : "label";
        for (const attribute of message.attributes ?? []) {
          if (attribute.name === caption) target.setAttribute(attribute.name, attribute.value);
        }
      });
      root.setAttribute("lang", locale);
    } catch (error) {
      host.logError?.(error);
    }
  };
}
