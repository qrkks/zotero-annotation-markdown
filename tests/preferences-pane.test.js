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
    expect(source).toContain("preference=\"extensions.annotationMarkdown.outlineEnabled\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.outlineFontScalePercent\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.autoTodoTag\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.autoTodoCleanup\"");
    const readerGroupEnd = source.indexOf("</groupbox>");
    const outlineGroupStart = source.indexOf("<html:h2>Floating Outline</html:h2>");
    const outlineGroupEnd = source.indexOf("</groupbox>", outlineGroupStart);
    const readerGroup = source.slice(0, readerGroupEnd);
    const outlineGroup = source.slice(outlineGroupStart, outlineGroupEnd);
    const tagsGroupStart = source.indexOf("<html:h2>Annotation Tags</html:h2>");
    const tagsGroupEnd = source.indexOf("</groupbox>", tagsGroupStart);
    expect(readerGroupEnd).toBeLessThan(outlineGroupStart);
    expect(readerGroup).toContain("id=\"annotation-markdown-font-scale\"");
    expect(source).not.toContain("<html:h2>Preview Font Size</html:h2>");
    expect(outlineGroupStart).toBeLessThan(source.indexOf("id=\"annotation-markdown-outline-enabled\""));
    expect(source.indexOf("id=\"annotation-markdown-outline-font-scale\"")).toBeLessThan(outlineGroupEnd);
    expect(outlineGroupEnd).toBeLessThan(tagsGroupStart);
    expect(tagsGroupStart).toBeLessThan(source.indexOf("id=\"annotation-markdown-auto-todo-tag\""));
    expect(source.indexOf("id=\"annotation-markdown-auto-todo-cleanup\"")).toBeLessThan(tagsGroupEnd);
    expect(tagsGroupEnd).toBeLessThan(source.indexOf("<html:h2>Rendering Performance</html:h2>"));
    expect(source).toContain(
      "label=\"Show a floating outline for annotations with multiple headings\""
    );
    expect(source).toContain("preference=\"extensions.annotationMarkdown.renderStrategy\"");
    expect(source.indexOf("id=\"annotation-markdown-enabled\"")).toBeLessThan(
      source.indexOf("id=\"annotation-markdown-math-enabled\"")
    );
    expect(source.indexOf("id=\"annotation-markdown-math-enabled\"")).toBeLessThan(
      source.indexOf("id=\"annotation-markdown-font-scale\"")
    );
    expect(source.indexOf("id=\"annotation-markdown-font-scale\"")).toBeLessThan(
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
    expect(readerGroup).toContain("<menuitem label=\"200%\" value=\"200\"/>");
    expect(outlineGroup).toContain("<menuitem label=\"80%\" value=\"80\"/>");
    expect(outlineGroup).toContain("<menuitem label=\"200%\" value=\"200\"/>");
    expect(source).toContain("<menulist id=\"annotation-markdown-outline-font-scale\"");
    expect(source).toContain("<menuitem label=\"90%\" value=\"90\"/>");
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
    const outlineEnabledInput = createInput();
    const outlineFontScaleSelect = createInput();
    const autoTodoTagInput = createInput();
    const autoTodoCleanupInput = createInput();
    const renderStrategySelect = createInput();
    const documentRef = {
      getElementById(id) {
        return {
          "annotation-markdown-enabled": enabledInput,
          "annotation-markdown-font-scale": fontScaleSelect,
          "annotation-markdown-paste-as-plain-text": pasteAsPlainTextInput,
          "annotation-markdown-fast-editor": fastEditorInput,
          "annotation-markdown-math-enabled": mathInput,
          "annotation-markdown-outline-enabled": outlineEnabledInput,
          "annotation-markdown-outline-font-scale": outlineFontScaleSelect,
          "annotation-markdown-auto-todo-tag": autoTodoTagInput,
          "annotation-markdown-auto-todo-cleanup": autoTodoCleanupInput,
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
    expect(outlineEnabledInput.checked).toBe(true);
    expect(outlineFontScaleSelect.value).toBe("100");
    expect(autoTodoTagInput.checked).toBe(false);
    expect(autoTodoCleanupInput.checked).toBe(false);
    expect(autoTodoCleanupInput.disabled).toBe(true);
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
            "extensions.annotationMarkdown.outlineEnabled": true,
            "extensions.annotationMarkdown.outlineFontScalePercent": 100,
            "extensions.annotationMarkdown.autoTodoTag": false,
            "extensions.annotationMarkdown.autoTodoCleanup": false,
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
    const outlineEnabledInput = createInput();
    const outlineFontScaleSelect = createInput();
    const autoTodoTagInput = createInput();
    const autoTodoCleanupInput = createInput();
    const renderStrategySelect = createInput();
    const documentRef = {
      getElementById(id) {
        return {
          "annotation-markdown-enabled": enabledInput,
          "annotation-markdown-font-scale": fontScaleSelect,
          "annotation-markdown-paste-as-plain-text": pasteAsPlainTextInput,
          "annotation-markdown-fast-editor": fastEditorInput,
          "annotation-markdown-math-enabled": mathInput,
          "annotation-markdown-outline-enabled": outlineEnabledInput,
          "annotation-markdown-outline-font-scale": outlineFontScaleSelect,
          "annotation-markdown-auto-todo-tag": autoTodoTagInput,
          "annotation-markdown-auto-todo-cleanup": autoTodoCleanupInput,
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
    outlineEnabledInput.checked = false;
    outlineEnabledInput.dispatch("command");
    outlineFontScaleSelect.value = "140";
    outlineFontScaleSelect.dispatch("command");
    autoTodoTagInput.checked = true;
    autoTodoTagInput.dispatch("command");
    expect(autoTodoCleanupInput.disabled).toBe(false);
    autoTodoCleanupInput.checked = true;
    autoTodoCleanupInput.dispatch("command");
    renderStrategySelect.value = "lazy";
    renderStrategySelect.dispatch("command");

    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.enabled", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.fontScalePercent", 120, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.pasteAsPlainText", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.fastEditor", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.mathEnabled", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineEnabled", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineFontScalePercent", 140, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.autoTodoTag", true, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.autoTodoCleanup", true, true);
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
