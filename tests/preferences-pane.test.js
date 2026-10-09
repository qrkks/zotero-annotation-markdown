import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, test, vi } from "vitest";

describe("preferences pane", () => {
  test("SVG is opt-in, follows rendering scopes, and writes the full pref key", async () => {
    const f = await mathPreferenceFixture(false, false, true);
    const svg = f.controls.get("annotation-markdown-svg-enabled");
    expect(svg.checked).toBe(false);
    expect(svg.disabled).toBe(true);
    svg.checked = true;
    f.controls.get("annotation-markdown-popup-enabled").checked = true;
    f.controls.get("annotation-markdown-popup-enabled").dispatch("command");
    expect(svg.disabled).toBe(false);
    expect(svg.checked).toBe(true);
    svg.dispatch("command");
    expect(f.set).toHaveBeenCalledWith("extensions.annotationMarkdown.svgEnabled", true, true);
    const source = await readFile(path.join(process.cwd(), "addon", "preferences.xhtml"), "utf8");
    expect(source).toContain('preference="extensions.annotationMarkdown.svgEnabled"');
    expect(source).toContain('label="Render SVG code blocks (Experimental)"');
  });
  test.each([
    [false, false, false], [false, false, true],
    [true, false, false], [true, false, true],
    [false, true, false], [false, true, true],
    [true, true, false], [true, true, true]
  ])("gates math controls by rendering scopes: sidebar=%s popup=%s math=%s", async (sidebar, popup, math) => {
    const f = await mathPreferenceFixture(sidebar, popup, math);
    const input = f.controls.get("annotation-markdown-math-enabled");
    const output = f.controls.get("annotation-markdown-math-output");
    expect(input.disabled).toBe(!(sidebar || popup));
    expect(input.getAttribute("disabled")).toBe(sidebar || popup ? null : "true");
    expect(input.checked).toBe(math);
    expect(output.disabled).toBe(!(sidebar || popup) || !math);
    expect(output.value).toBe("mathml");
    expect(f.set).not.toHaveBeenCalled();
  });

  test("restores saved math choices when either rendering scope is re-enabled", async () => {
    const f = await mathPreferenceFixture(false, false, true);
    const sidebar = f.controls.get("annotation-markdown-enabled");
    const popup = f.controls.get("annotation-markdown-popup-enabled");
    const math = f.controls.get("annotation-markdown-math-enabled");
    const output = f.controls.get("annotation-markdown-math-output");
    expect(math.disabled).toBe(true);
    popup.checked = true;
    popup.dispatch("command");
    expect(math.disabled).toBe(false);
    expect(output.disabled).toBe(false);
    popup.checked = false;
    popup.dispatch("syncfrompreference");
    expect(math.disabled).toBe(true);
    expect(math.checked).toBe(true);
    expect(output.disabled).toBe(true);
    sidebar.checked = true;
    sidebar.dispatch("syncfrompreference");
    expect(math.disabled).toBe(false);
    expect(output.disabled).toBe(false);
    expect(output.value).toBe("mathml");
    expect(f.set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.mathEnabled", expect.anything(), true);
    expect(f.set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.mathOutput", expect.anything(), true);
    math.checked = false;
    math.dispatch("command");
    sidebar.checked = false;
    sidebar.dispatch("command");
    popup.checked = true;
    popup.dispatch("command");
    expect(math.disabled).toBe(false);
    expect(math.checked).toBe(false);
    expect(output.disabled).toBe(true);
  });

  test("presents sidebar and popup rendering as peer options", async () => {
    const source = await readFile(path.join(process.cwd(), "addon", "preferences.xhtml"), "utf8");
    expect(source).toContain('label="Render sidebar annotation comments as Markdown"');
    expect(source).toContain('<vbox id="annotation-markdown-popup-option">');
  });

  test("uses a XUL menulist for the font size picker", async () => {
    const source = await readFile(path.join(process.cwd(), "addon", "preferences.xhtml"), "utf8");

    expect(source).toContain('onload="Zotero.AnnotationMarkdownPreferences.init(document)"');
    expect(source).toContain("preference=\"extensions.annotationMarkdown.enabled\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.popupEnabled\"");
    expect(source).toContain(
      "label=\"Render page annotation popups as Markdown\""
    );
    expect(source).toContain(
      "Show formatted Markdown previews in page annotation popups independently of sidebar rendering. Off by default."
    );
    expect(source).toContain(
      "id=\"annotation-markdown-popup-option\""
    );
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
    expect(source).toContain('preference="extensions.annotationMarkdown.mathOutput"');
    expect(source).toContain('<menuitem label="KaTeX HTML + MathML (default)" value="htmlAndMathml"/>');
    expect(source).toContain('<menuitem label="Native MathML only (Experimental)" value="mathml"/>');
    expect(source).toContain("preference=\"extensions.annotationMarkdown.outlineEnabled\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.outlineFontScalePercent\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.autoTodoTag\"");
    expect(source).toContain("preference=\"extensions.annotationMarkdown.autoTodoCleanup\"");
    expect(source).toContain("Add a todo tag for TODO: or T: lines");
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
    expect(source).toContain("preference=\"extensions.annotationMarkdown.nativeRowLazy\"");
    expect(source).toContain(
      "Accelerate clearing tag filters in very large annotation lists (Experimental)"
    );
    expect(source).toContain(
      "Reduces pauses when deselecting tags restores many annotations. Enable before applying tag filters to a fully loaded list. Off by default; currently supports Zotero 10.0.3. Does not speed up first opening; falls back to Zotero's native list when unavailable."
    );
    expect(source.indexOf("id=\"annotation-markdown-enabled\"")).toBeLessThan(
      source.indexOf("id=\"annotation-markdown-popup-enabled\"")
    );
    expect(source.indexOf("id=\"annotation-markdown-popup-enabled\"")).toBeLessThan(
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
    const popupOption = createInput();
    const popupEnabledInput = createInput();
    const fontScaleSelect = createInput();
    const pasteAsPlainTextInput = createInput();
    const fastEditorInput = createInput();
    const mathInput = createInput();
    const mathOutputOption = createInput();
    const mathOutputSelect = createInput();
    const outlineEnabledInput = createInput();
    const outlineFontScaleSelect = createInput();
    const autoTodoTagInput = createInput();
    const autoTodoCleanupInput = createInput();
    const renderStrategySelect = createInput();
    const nativeRowLazyInput = createInput();
    const documentRef = {
      getElementById(id) {
        return {
          "annotation-markdown-enabled": enabledInput,
          "annotation-markdown-popup-option": popupOption,
          "annotation-markdown-popup-enabled": popupEnabledInput,
          "annotation-markdown-font-scale": fontScaleSelect,
          "annotation-markdown-paste-as-plain-text": pasteAsPlainTextInput,
          "annotation-markdown-fast-editor": fastEditorInput,
          "annotation-markdown-math-enabled": mathInput,
          "annotation-markdown-math-output-option": mathOutputOption,
          "annotation-markdown-math-output": mathOutputSelect,
          "annotation-markdown-outline-enabled": outlineEnabledInput,
          "annotation-markdown-outline-font-scale": outlineFontScaleSelect,
          "annotation-markdown-auto-todo-tag": autoTodoTagInput,
          "annotation-markdown-auto-todo-cleanup": autoTodoCleanupInput,
          "annotation-markdown-render-strategy": renderStrategySelect,
          "annotation-markdown-native-row-lazy": nativeRowLazyInput
        }[id] ?? null;
      }
    };

    preferences.init(documentRef);

    expect(enabledInput.checked).toBe(true);
    expect(popupEnabledInput.checked).toBe(false);
    expect(popupEnabledInput.disabled).toBe(false);
    expect(popupEnabledInput.getAttribute("disabled")).toBeNull();
    expect(popupOption.getAttribute("data-disabled")).toBeNull();
    expect(fontScaleSelect.value).toBe("100");
    expect(pasteAsPlainTextInput.checked).toBe(true);
    expect(fastEditorInput.checked).toBe(true);
    expect(mathInput.checked).toBe(true);
    expect(mathOutputSelect.value).toBe("htmlAndMathml");
    expect(mathOutputSelect.disabled).toBe(false);
    expect(outlineEnabledInput.checked).toBe(true);
    expect(outlineFontScaleSelect.value).toBe("100");
    expect(autoTodoTagInput.checked).toBe(false);
    expect(autoTodoCleanupInput.checked).toBe(false);
    expect(autoTodoCleanupInput.disabled).toBe(true);
    expect(renderStrategySelect.value).toBe("auto");
    expect(nativeRowLazyInput.checked).toBe(false);
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
            "extensions.annotationMarkdown.popupEnabled": false,
            "extensions.annotationMarkdown.fontScalePercent": 100,
            "extensions.annotationMarkdown.pasteAsPlainText": true,
            "extensions.annotationMarkdown.fastEditor": true,
            "extensions.annotationMarkdown.mathEnabled": true,
            "extensions.annotationMarkdown.mathOutput": "mathml",
            "extensions.annotationMarkdown.outlineEnabled": true,
            "extensions.annotationMarkdown.outlineFontScalePercent": 100,
            "extensions.annotationMarkdown.autoTodoTag": false,
            "extensions.annotationMarkdown.autoTodoCleanup": false,
            "extensions.annotationMarkdown.renderStrategy": "auto",
            "extensions.annotationMarkdown.nativeRowLazy": false
          }[key];
        }),
        set
      }
    });
    const enabledInput = createInput();
    const popupOption = createInput();
    const popupEnabledInput = createInput();
    const fontScaleSelect = createInput();
    const pasteAsPlainTextInput = createInput();
    const fastEditorInput = createInput();
    const mathInput = createInput();
    const mathOutputOption = createInput();
    const mathOutputSelect = createInput();
    const outlineEnabledInput = createInput();
    const outlineFontScaleSelect = createInput();
    const autoTodoTagInput = createInput();
    const autoTodoCleanupInput = createInput();
    const renderStrategySelect = createInput();
    const nativeRowLazyInput = createInput();
    const documentRef = {
      getElementById(id) {
        return {
          "annotation-markdown-enabled": enabledInput,
          "annotation-markdown-popup-option": popupOption,
          "annotation-markdown-popup-enabled": popupEnabledInput,
          "annotation-markdown-font-scale": fontScaleSelect,
          "annotation-markdown-paste-as-plain-text": pasteAsPlainTextInput,
          "annotation-markdown-fast-editor": fastEditorInput,
          "annotation-markdown-math-enabled": mathInput,
          "annotation-markdown-math-output-option": mathOutputOption,
          "annotation-markdown-math-output": mathOutputSelect,
          "annotation-markdown-outline-enabled": outlineEnabledInput,
          "annotation-markdown-outline-font-scale": outlineFontScaleSelect,
          "annotation-markdown-auto-todo-tag": autoTodoTagInput,
          "annotation-markdown-auto-todo-cleanup": autoTodoCleanupInput,
          "annotation-markdown-render-strategy": renderStrategySelect,
          "annotation-markdown-native-row-lazy": nativeRowLazyInput
        }[id] ?? null;
      }
    };

    preferences.init(documentRef);
    expect(mathOutputSelect.value).toBe("mathml");
    mathOutputSelect.value = "htmlAndMathml";
    mathOutputSelect.dispatch("command");
    popupEnabledInput.checked = true;
    popupEnabledInput.dispatch("command");
    enabledInput.checked = false;
    enabledInput.dispatch("command");
    expect(popupEnabledInput.disabled).toBe(false);
    expect(popupEnabledInput.checked).toBe(true);
    expect(popupEnabledInput.getAttribute("disabled")).toBeNull();
    expect(popupOption.getAttribute("data-disabled")).toBeNull();
    expect(mathOutputSelect.disabled).toBe(false);
    popupEnabledInput.checked = false;
    popupEnabledInput.dispatch("command");
    expect(mathOutputSelect.disabled).toBe(true);
    popupEnabledInput.checked = true;
    popupEnabledInput.dispatch("syncfrompreference");
    expect(mathOutputSelect.disabled).toBe(false);
    enabledInput.checked = true;
    enabledInput.dispatch("command");
    expect(popupEnabledInput.disabled).toBe(false);
    expect(popupEnabledInput.getAttribute("disabled")).toBeNull();
    expect(popupOption.getAttribute("data-disabled")).toBeNull();
    expect(mathOutputSelect.disabled).toBe(false);
    fontScaleSelect.value = "120";
    fontScaleSelect.dispatch("command");
    pasteAsPlainTextInput.checked = false;
    pasteAsPlainTextInput.dispatch("command");
    fastEditorInput.checked = false;
    fastEditorInput.dispatch("command");
    mathInput.checked = false;
    mathInput.dispatch("command");
    expect(mathOutputSelect.disabled).toBe(true);
    expect(mathOutputOption.getAttribute("data-disabled")).toBe("true");
    mathInput.checked = true;
    mathInput.dispatch("syncfrompreference");
    expect(mathOutputSelect.disabled).toBe(false);
    expect(mathOutputSelect.value).toBe("htmlAndMathml");
    mathOutputSelect.value = "mathml";
    mathOutputSelect.dispatch("command");
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
    nativeRowLazyInput.checked = true;
    nativeRowLazyInput.dispatch("command");

    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.enabled", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.popupEnabled", true, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.fontScalePercent", 120, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.pasteAsPlainText", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.fastEditor", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.mathEnabled", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.mathOutput", "htmlAndMathml", true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.mathOutput", "mathml", true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineEnabled", false, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineFontScalePercent", 140, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.autoTodoTag", true, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.autoTodoCleanup", true, true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.renderStrategy", "lazy", true);
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.nativeRowLazy", true, true);
    expect(set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.lightweightMode", expect.anything(), true);
    expect(set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.performanceDiagnostics", expect.anything(), true);
  });

  test.each([undefined, "unknown", false])("uses standard output for invalid preference %s without writing it", async (storedOutput) => {
    const set = vi.fn();
    const preferences = await loadPreferencesScript({
      Prefs: {
        get: vi.fn((key, global) => global && key === "extensions.annotationMarkdown.mathOutput" ? storedOutput : undefined),
        set
      }
    });
    const controls = new Map();
    const documentRef = {
      getElementById(id) {
        if (!controls.has(id)) controls.set(id, createInput());
        return controls.get(id);
      }
    };
    preferences.init(documentRef);
    expect(controls.get("annotation-markdown-math-output").value).toBe("htmlAndMathml");
    expect(set).not.toHaveBeenCalled();
  });
});

async function mathPreferenceFixture(sidebar, popup, math) {
  const values = {
    "extensions.annotationMarkdown.enabled": sidebar,
    "extensions.annotationMarkdown.popupEnabled": popup,
    "extensions.annotationMarkdown.mathEnabled": math,
    "extensions.annotationMarkdown.mathOutput": "mathml"
  };
  const set = vi.fn();
  const preferences = await loadPreferencesScript({ Prefs: { get: (key, global) => global ? values[key] : undefined, set } });
  const controls = new Map();
  preferences.init({ getElementById(id) {
    if (!controls.has(id)) controls.set(id, createInput());
    return controls.get(id);
  } });
  return { controls, set };
}

async function loadPreferencesScript(Zotero = { Prefs: { get: vi.fn(() => undefined), set: vi.fn() } }) {
  const source = await readFile(path.join(process.cwd(), "addon", "preferences.js"), "utf8");
  const context = { Zotero };
  vm.runInNewContext(source, context);
  expect(context.Zotero.AnnotationMarkdownPreferences).toBeDefined();
  return context.Zotero.AnnotationMarkdownPreferences;
}

function createInput() {
  const listeners = new Map();
  const attributes = new Map();
  return {
    checked: undefined,
    value: "",
    addEventListener(eventName, callback) {
      listeners.set(eventName, callback);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    dispatch(eventName) {
      listeners.get(eventName)?.();
    }
  };
}
