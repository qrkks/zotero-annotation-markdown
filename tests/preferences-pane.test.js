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
    expect(source).toContain("preference=\"extensions.annotationMarkdown.fastEditor\"");
    expect(source).toContain(
      "label=\"Use the fast annotation comment editor\""
    );
    expect(source).toContain(
      "Helps reduce typing lag in documents with many annotations."
    );
    expect(source).toContain("label=\"Paste clipboard content into annotation comments as plain text\"");
    expect(source).toContain(
      "Recommended when pasting responses from AI tools. Keeps Markdown editable and avoids importing rich-text formatting or hidden HTML."
    );
    expect(source).toContain("preference=\"extensions.annotationMarkdown.mathEnabled\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.renderStrategy\"");
    expect(source.indexOf("id=\"annotation-markdown-enabled\"")).toBeLessThan(
      source.indexOf("id=\"annotation-markdown-math-enabled\"")
    );
    expect(source.indexOf("id=\"annotation-markdown-math-enabled\"")).toBeLessThan(
      source.indexOf("id=\"annotation-markdown-paste-as-plain-text\"")
    );
    expect(source.indexOf("id=\"annotation-markdown-paste-as-plain-text\"")).toBeLessThan(
      source.indexOf("id=\"annotation-markdown-fast-editor\"")
    );
    expect(source).not.toContain("preference=\"extensions.annotationMarkdown.lightweightMode\"");
    expect(source).not.toContain("preference=\"extensions.annotationMarkdown.performanceDiagnostics\"");
    expect(source).toContain("<menulist id=\"annotation-markdown-font-scale\"");
    expect(source).toContain("<menuitem label=\"80%\" value=\"80\"/>");
    expect(source).toContain("<menuitem label=\"100%\" value=\"100\"/>");
    expect(source).toContain("<menuitem label=\"150%\" value=\"150\"/>");
    expect(source).toContain("<menulist id=\"annotation-markdown-render-strategy\"");
    expect(source).toContain("<menuitem label=\"Automatic (recommended)\" value=\"auto\"/>");
    expect(source).toContain("<menuitem label=\"Render all annotations\" value=\"eager\"/>");
    expect(source).toContain("<menuitem label=\"Render near the viewport\" value=\"lazy\"/>");
    expect(source).not.toContain("<html:select");
  });

  test("shows default enabled and 100 percent values when prefs are missing", async () => {
    const preferences = await loadPreferencesScript();
    const enabledInput = createInput();
    const fontScaleSelect = createInput();
    const pasteAsPlainTextInput = createInput();
    const fastEditorInput = createInput();
    const mathInput = createInput();
    const renderStrategySelect = createInput();
    const documentRef = {
      getElementById(id) {
        return {
          "annotation-markdown-enabled": enabledInput,
          "annotation-markdown-font-scale": fontScaleSelect,
          "annotation-markdown-paste-as-plain-text": pasteAsPlainTextInput,
          "annotation-markdown-fast-editor": fastEditorInput,
          "annotation-markdown-math-enabled": mathInput,
          "annotation-markdown-render-strategy": renderStrategySelect
        }[id] ?? null;
      }
    };

    preferences.init(documentRef);

    expect(enabledInput.checked).toBe(true);
    expect(fontScaleSelect.value).toBe("100");
    expect(pasteAsPlainTextInput.checked).toBe(true);
    expect(fastEditorInput.checked).toBe(true);
    expect(mathInput.checked).toBe(true);
    expect(renderStrategySelect.value).toBe("auto");
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
            "extensions.annotationMarkdown.fastEditor": true,
            "extensions.annotationMarkdown.mathEnabled": true,
            "extensions.annotationMarkdown.renderStrategy": "auto"
          }[key];
        }),
        set
      }
    });
    const enabledInput = createInput();
    const fontScaleSelect = createInput();
    const pasteAsPlainTextInput = createInput();
    const fastEditorInput = createInput();
    const mathInput = createInput();
    const renderStrategySelect = createInput();
    const documentRef = {
      getElementById(id) {
        return {
          "annotation-markdown-enabled": enabledInput,
          "annotation-markdown-font-scale": fontScaleSelect,
          "annotation-markdown-paste-as-plain-text": pasteAsPlainTextInput,
          "annotation-markdown-fast-editor": fastEditorInput,
          "annotation-markdown-math-enabled": mathInput,
          "annotation-markdown-render-strategy": renderStrategySelect
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
    fastEditorInput.checked = false;
    fastEditorInput.dispatch("command");
    mathInput.checked = false;
    mathInput.dispatch("command");
    renderStrategySelect.value = "lazy";
    renderStrategySelect.dispatch("command");

    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.enabled", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.fontScalePercent", 120, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.pasteAsPlainText", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.fastEditor", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.mathEnabled", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.renderStrategy", "lazy", true);
    expect(set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.lightweightMode", expect.anything(), true);
    expect(set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.performanceDiagnostics", expect.anything(), true);
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
