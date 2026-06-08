import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, test, vi } from "vitest";

describe("preferences pane", () => {
  test("uses a XUL menulist for the font size picker", async () => {
    const source = await readFile(path.join(process.cwd(), "addon", "preferences.xhtml"), "utf8");

    expect(source).toContain("preference=\"extensions.annotationMarkdown.enabled\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.fontScalePercent\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.pasteAsPlainText\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.mathEnabled\"");
    expect(source).toContain("<menulist id=\"annotation-markdown-font-scale\"");
    expect(source).toContain("<menuitem label=\"80%\" value=\"80\"/>");
    expect(source).toContain("<menuitem label=\"100%\" value=\"100\"/>");
    expect(source).toContain("<menuitem label=\"150%\" value=\"150\"/>");
    expect(source).not.toContain("<html:select");
  });

  test("shows default enabled and 100 percent values when prefs are missing", async () => {
    const preferences = await loadPreferencesScript();
    const enabledInput = createInput();
    const fontScaleSelect = createInput();
    const pasteAsPlainTextInput = createInput();
    const mathInput = createInput();
    const documentRef = {
      getElementById(id) {
        return {
          "annotation-markdown-enabled": enabledInput,
          "annotation-markdown-font-scale": fontScaleSelect,
          "annotation-markdown-paste-as-plain-text": pasteAsPlainTextInput,
          "annotation-markdown-math-enabled": mathInput
        }[id] ?? null;
      }
    };

    preferences.init(documentRef);

    expect(enabledInput.checked).toBe(true);
    expect(fontScaleSelect.value).toBe("100");
    expect(pasteAsPlainTextInput.checked).toBe(true);
    expect(mathInput.checked).toBe(true);
  });

  test("writes preference changes from controls", async () => {
    const set = vi.fn();
    const preferences = await loadPreferencesScript({
      Prefs: {
        get: vi.fn((key, global) => {
          if (!global) {
            return undefined;
          }

          return {
            "extensions.annotationMarkdown.enabled": true,
            "extensions.annotationMarkdown.fontScalePercent": 100,
            "extensions.annotationMarkdown.pasteAsPlainText": true,
            "extensions.annotationMarkdown.mathEnabled": true
          }[key];
        }),
        set
      }
    });
    const enabledInput = createInput();
    const fontScaleSelect = createInput();
    const pasteAsPlainTextInput = createInput();
    const mathInput = createInput();
    const documentRef = {
      getElementById(id) {
        return {
          "annotation-markdown-enabled": enabledInput,
          "annotation-markdown-font-scale": fontScaleSelect,
          "annotation-markdown-paste-as-plain-text": pasteAsPlainTextInput,
          "annotation-markdown-math-enabled": mathInput
        }[id] ?? null;
      }
    };

    preferences.init(documentRef);
    enabledInput.checked = false;
    enabledInput.dispatch("command");
    fontScaleSelect.value = "120";
    fontScaleSelect.dispatch("command");
    pasteAsPlainTextInput.checked = false;
    pasteAsPlainTextInput.dispatch("command");
    mathInput.checked = false;
    mathInput.dispatch("command");

    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.enabled", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.fontScalePercent", 120, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.pasteAsPlainText", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.mathEnabled", false, true);
  });
});

async function loadPreferencesScript(Zotero = { Prefs: { get: vi.fn(() => undefined), set: vi.fn() } }) {
  const source = await readFile(path.join(process.cwd(), "addon", "preferences.js"), "utf8");
  const context = { Zotero };
  vm.runInNewContext(source, context);
  return context.ZoteroAnnotationMarkdownPreferences;
}

function createInput() {
  const listeners = new Map();
  return {
    checked: undefined,
    value: "",
    addEventListener(eventName, callback) {
      listeners.set(eventName, callback);
    },
    dispatch(eventName) {
      listeners.get(eventName)?.();
    }
  };
}
