import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, test, vi } from "vitest";
import { FluentBundle, FluentResource } from "@fluent/bundle";
import { JSDOM } from "jsdom";

describe("preferences pane", () => {
  test("defaults smart avoidance on and gates it by both parent choices without resetting it", async () => {
    const f = await mathPreferenceFixture(true, false, true);
    const outline = f.controls.get("annotation-markdown-outline-enabled");
    const numbers = f.controls.get("annotation-markdown-outline-numbering");
    const smart = f.controls.get("annotation-markdown-outline-smart-numbering");
    const option = f.controls.get("annotation-markdown-outline-smart-numbering-option");
    expect(smart.checked).toBe(true);
    expect(smart.disabled).toBe(true);
    smart.dispatch("command");
    expect(f.set).not.toHaveBeenCalled();
    numbers.checked = true;
    numbers.dispatch("command");
    expect(smart.disabled).toBe(false);
    expect(option.getAttribute("data-disabled")).toBeNull();
    smart.checked = false;
    smart.dispatch("command");
    expect(f.set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineSmartNumbering", false, true);
    f.set.mockClear();
    outline.checked = false;
    outline.dispatch("command");
    expect(smart.disabled).toBe(true);
    expect(smart.checked).toBe(false);
    expect(option.getAttribute("data-disabled")).toBe("true");
    smart.dispatch("command");
    expect(f.set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.outlineSmartNumbering", expect.anything(), true);
    outline.checked = true;
    outline.dispatch("syncfrompreference");
    expect(smart.disabled).toBe(false);
    numbers.checked = false;
    numbers.dispatch("syncfrompreference");
    expect(smart.disabled).toBe(true);
    expect(smart.checked).toBe(false);
    numbers.checked = true;
    numbers.dispatch("syncfrompreference");
    expect(smart.disabled).toBe(false);
    expect(smart.checked).toBe(false);
  });
  test("defaults heading numbers off and preserves the child choice when outline visibility changes", async () => {
    const f = await mathPreferenceFixture(true, false, true);
    const parent = f.controls.get("annotation-markdown-outline-enabled");
    const child = f.controls.get("annotation-markdown-outline-numbering");
    const option = f.controls.get("annotation-markdown-outline-numbering-option");
    expect(child.checked).toBe(false);
    expect(child.disabled).toBe(false);
    child.checked = true;
    child.dispatch("command");
    expect(f.set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineNumbering", true, true);
    f.set.mockClear();
    parent.checked = false;
    parent.dispatch("command");
    expect(child.disabled).toBe(true);
    expect(child.checked).toBe(true);
    expect(option.getAttribute("data-disabled")).toBe("true");
    expect(f.set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.outlineNumbering", expect.anything(), true);
    child.dispatch("command");
    expect(f.set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.outlineNumbering", expect.anything(), true);
    parent.checked = true;
    parent.dispatch("syncfrompreference");
    expect(child.disabled).toBe(false);
    expect(child.checked).toBe(true);
    expect(option.getAttribute("data-disabled")).toBeNull();
  });
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
    expect(source).toContain('data-l10n-id="annotation-markdown-prefs-svg-enabled"');
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
    expect(source).toContain('data-l10n-id="annotation-markdown-prefs-enabled"');
    expect(source).toContain('<vbox id="annotation-markdown-popup-option">');
  });

  test("persists startup and tag-filter switches independently", async()=>{
    const set=vi.fn();
    const preferences=await loadPreferencesScript({Prefs:{get:()=>undefined,set}});
    const doc=await loadPreferenceDocument();preferences.init(doc);
    const startup=doc.getElementById("annotation-markdown-reader-startup-lazy");
    const filter=doc.getElementById("annotation-markdown-native-row-lazy");
    expect(startup.checked).toBe(false);expect(filter.checked).toBe(false);
    startup.checked=true;startup.dispatchEvent(new doc.defaultView.Event("command"));
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.readerStartupLazy",true,true);
    expect(filter.checked).toBe(false);
    filter.checked=true;filter.dispatchEvent(new doc.defaultView.Event("command"));
    expect(set).toHaveBeenCalledWith("extensions.annotationMarkdown.nativeRowLazy",true,true);
  });

  test("preserves XUL controls, setting keys, values, and group order", async () => {
    const doc = await loadPreferenceDocument();
    expect(doc.documentElement.getAttribute("onload")).toBe("Zotero.AnnotationMarkdownPreferences.init(document)");
    expect(doc.querySelector("select")).toBeNull();
    const keys = {
      enabled: "enabled", "popup-enabled": "popupEnabled", "math-enabled": "mathEnabled",
      "math-output": "mathOutput", "svg-enabled": "svgEnabled", "font-scale": "fontScalePercent",
      "paste-as-plain-text": "pasteAsPlainText", "fast-editor": "fastEditor",
      "outline-enabled": "outlineEnabled", "outline-numbering": "outlineNumbering", "outline-font-scale": "outlineFontScalePercent",
      "outline-smart-numbering": "outlineSmartNumbering",
      "auto-todo-tag": "autoTodoTag", "auto-todo-cleanup": "autoTodoCleanup",
      "render-strategy": "renderStrategy", "native-row-lazy": "nativeRowLazy",
      "reader-startup-lazy": "readerStartupLazy"
    };
    expect(doc.querySelectorAll("[preference]")).toHaveLength(Object.keys(keys).length);
    for (const [id, key] of Object.entries(keys)) {
      const control = doc.getElementById(`annotation-markdown-${id}`);
      expect(control.getAttribute("preference")).toBe(`extensions.annotationMarkdown.${key}`);
      expect(control.localName).toBe(["math-output", "font-scale", "outline-font-scale", "render-strategy"].includes(id) ? "menulist" : "checkbox");
    }
    for (const id of ["font-scale", "outline-font-scale"]) {
      const items = [...doc.getElementById(`annotation-markdown-${id}`).querySelectorAll("menuitem")];
      expect(items.map(item => item.getAttribute("value"))).toEqual(Array.from({ length: 13 }, (_, i) => String(80 + i * 10)));
      expect(items.map(item => item.getAttribute("label"))).toEqual(items.map(item => `${item.getAttribute("value")}%`));
    }
    expect([...doc.getElementById("annotation-markdown-math-output").querySelectorAll("menuitem")].map(item => item.getAttribute("value"))).toEqual(["htmlAndMathml", "mathml"]);
    expect([...doc.getElementById("annotation-markdown-render-strategy").querySelectorAll("menuitem")].map(item => item.getAttribute("value"))).toEqual(["auto", "eager", "lazy"]);
    const groups = [...doc.querySelectorAll("groupbox")];
    expect(groups.map(group => group.firstElementChild.firstElementChild.getAttribute("data-l10n-id"))).toEqual([
      "annotation-markdown-prefs-reader", "annotation-markdown-prefs-outline",
      "annotation-markdown-prefs-tags", "annotation-markdown-prefs-performance"
    ]);
    expect([...groups[0].querySelectorAll("[preference]")].map(control => control.id)).toEqual([
      "annotation-markdown-enabled", "annotation-markdown-popup-enabled", "annotation-markdown-math-enabled",
      "annotation-markdown-math-output", "annotation-markdown-svg-enabled", "annotation-markdown-font-scale",
      "annotation-markdown-paste-as-plain-text", "annotation-markdown-fast-editor"
    ]);
    expect(groups[1].querySelector("#annotation-markdown-outline-font-scale")).not.toBeNull();
    expect(groups[2].querySelector("#annotation-markdown-auto-todo-cleanup")).not.toBeNull();
  });

  test.each(["en-US", "zh-CN"])("localizes all pane text and caption attributes in %s", async locale => {
    const doc = await loadPreferenceDocument();
    const link = doc.querySelector("linkset > *");
    expect(link.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(link.getAttribute("rel")).toBe("localization");
    expect(link.getAttribute("href")).toBe("annotation-markdown-preferences.ftl");
    const source = await readFile(path.join(process.cwd(), "addon", "locale", locale, link.getAttribute("href")), "utf8");
    const resource = new FluentResource(source);
    const bundle = new FluentBundle(locale);
    expect(bundle.addResource(resource)).toEqual([]);
    const targets = [...doc.querySelectorAll("[data-l10n-id]")];
    const ids = targets.map(element => element.getAttribute("data-l10n-id"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(resource.body.map(message => message.id).sort()).toEqual([...ids].sort());
    for (const element of targets) {
      const id = element.getAttribute("data-l10n-id");
      expect(id).toMatch(/^annotation-markdown-prefs-/);
      const message = bundle.getMessage(id);
      expect(message, id).toBeDefined();
      const attribute = ["checkbox", "menuitem"].includes(element.localName) ? "label" : element.localName === "label" ? "value" : null;
      expect(Object.keys(message.attributes)).toEqual(attribute ? [attribute] : []);
      const text = bundle.formatPattern(attribute ? message.attributes[attribute] : message.value);
      expect(text.trim(), id).not.toBe("");
      if (locale === "zh-CN") expect(text, id).toMatch(/[\u4e00-\u9fff]/);
      if (attribute) element.setAttribute(attribute, text);
      else element.textContent = text;
    }
    // Every user-facing string must use Fluent, except the language-neutral percentages.
    for (const element of doc.querySelectorAll("checkbox, menuitem, description, label, h2")) {
      if (element.localName === "label" && element.children.length) continue;
      if (element.localName === "menuitem" && /^\d+%$/.test(element.getAttribute("label") ?? "")) continue;
      expect(element.hasAttribute("data-l10n-id"), element.outerHTML).toBe(true);
    }
    expect(doc.getElementById("annotation-markdown-enabled").getAttribute("label")).toBe(locale === "zh-CN" ? "将侧栏批注评论渲染为 Markdown" : "Render sidebar annotation comments as Markdown");
    expect(doc.querySelector('[data-l10n-id="annotation-markdown-prefs-math-output"]').getAttribute("value")).toBe(locale === "zh-CN" ? "公式渲染方式" : "Math rendering");
    expect(doc.getElementById("annotation-markdown-math-output").getAttribute("preference")).toBe("extensions.annotationMarkdown.mathOutput");
    expect([...doc.getElementById("annotation-markdown-math-output").querySelectorAll("menuitem")].map(item => item.getAttribute("value"))).toEqual(["htmlAndMathml", "mathml"]);
    expect(doc.querySelector('[data-l10n-id="annotation-markdown-prefs-math-native"]').getAttribute("label"))
      .toBe(locale === "zh-CN" ? "仅使用原生 MathML" : "Native MathML only");
    for (const id of ["annotation-markdown-svg-enabled", "annotation-markdown-native-row-lazy"]) {
      expect(doc.getElementById(id).getAttribute("label")).toContain(locale === "zh-CN" ? "实验性" : "Experimental");
    }
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

async function loadPreferenceDocument() {
  const source = await readFile(path.join(process.cwd(), "addon", "preferences.xhtml"), "utf8");
  return new JSDOM(source, { contentType: "application/xhtml+xml" }).window.document;
}
