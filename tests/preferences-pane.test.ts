// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, test, vi } from "vitest";
import { FluentBundle, FluentResource } from "@fluent/bundle";
import { JSDOM } from "jsdom";
import { requireValue } from "./helpers/dom.ts";
import type { PreferencePane, PreferencePaneHost, PreferenceElement } from "../src/preferences.ts";
import { bundlePreferences } from "../scripts/preferences-bundle.mts";

interface PreferenceInput extends PreferenceElement {
  checked?: boolean; value: string; disabled?: boolean;
  addEventListener(name: string, callback: () => void): void;
  setAttribute(name: string, value: unknown): void; removeAttribute(name: string): void;
  getAttribute(name: string): string | null; dispatch(name: string): void;
}
type PreferenceHost = PreferencePaneHost & { AnnotationMarkdownPreferences?: PreferencePane };
let compiledPreferences: Promise<string> | undefined;

function preferenceScript() {
  return compiledPreferences ??= bundlePreferences({ root: process.cwd(), write: false })
    .then(result => requireValue(result.outputFiles?.[0]).text);
}

describe("preferences pane", () => {
  test("switches only this pane immediately and preserves stored setting values", async () => {
    const f = await languageFixture("zh-CN");
    await f.preferences.init(f.doc);
    const language = requireValue(f.doc.getElementById("annotation-markdown-settings-language"));
    expect(Reflect.get(language, "value")).toBe("auto");
    expect(f.doc.getElementById("annotation-markdown-enabled")?.getAttribute("label")).toBe("将侧栏批注评论渲染为 Markdown");
    expect(f.set).not.toHaveBeenCalled();
    Reflect.set(language, "value", "en-US");
    language.dispatchEvent(new f.doc.defaultView!.Event("command"));
    await vi.waitFor(() => expect(f.doc.getElementById("annotation-markdown-enabled")?.getAttribute("label"))
      .toBe("Render sidebar annotation comments as Markdown"));
    expect(f.set).toHaveBeenCalledExactlyOnceWith("extensions.annotationMarkdown.settingsLanguage", "en-US", true);
    expect(f.doc.getElementById("other-plugin")?.textContent).toBe("Other plugin");
    expect(f.doc.documentElement.getAttribute("lang")).toBe("zh-CN");
    expect(Reflect.get(f.doc.getElementById("annotation-markdown-math-output")!, "value")).toBe("mathml");
    Reflect.set(language, "value", "auto");
    language.dispatchEvent(new f.doc.defaultView!.Event("command"));
    await vi.waitFor(() => expect(f.doc.getElementById("annotation-markdown-enabled")?.getAttribute("label"))
      .toBe("将侧栏批注评论渲染为 Markdown"));
  });

  test.each(["zh-CN", "en-US", "invalid"])("restores or safely defaults the stored settings language: %s", async stored => {
    const f = await languageFixture("fr-FR", stored);
    await f.preferences.init(f.doc);
    expect(Reflect.get(f.doc.getElementById("annotation-markdown-settings-language")!, "value"))
      .toBe(stored === "invalid" ? "auto" : stored);
    expect(f.doc.getElementById("annotation-markdown-enabled")?.getAttribute("label"))
      .toBe(stored === "zh-CN" ? "将侧栏批注评论渲染为 Markdown" : "Render sidebar annotation comments as Markdown");
    expect(f.set).not.toHaveBeenCalled();
  });

  test("keeps the latest selection when an earlier translation finishes late", async () => {
    let releaseChinese!: () => void;
    const gate = new Promise<void>(resolve => { releaseChinese = resolve; });
    const f = await languageFixture("en-US", undefined, locale => locale === "zh-CN" ? gate : Promise.resolve());
    await f.preferences.init(f.doc);
    const language = requireValue(f.doc.getElementById("annotation-markdown-settings-language"));
    Reflect.set(language, "value", "zh-CN");
    language.dispatchEvent(new f.doc.defaultView!.Event("command"));
    Reflect.set(language, "value", "en-US");
    language.dispatchEvent(new f.doc.defaultView!.Event("command"));
    await vi.waitFor(() => expect(f.doc.getElementById("annotation-markdown-preferences")?.getAttribute("lang")).toBe("en-US"));
    releaseChinese();
    await new Promise(resolve => setImmediate(resolve));
    expect(f.doc.getElementById("annotation-markdown-enabled")?.getAttribute("label")).toBe("Render sidebar annotation comments as Markdown");
    expect(Reflect.get(language, "value")).toBe("en-US");
  });

  test("initializes the standalone compiled script through the pane document global", async () => {
    const doc = await loadPreferenceDocument();
    const Zotero: PreferenceHost = { Prefs: { get: vi.fn(() => undefined), set: vi.fn() } };
    const context = { Zotero, document: doc };
    vm.runInNewContext(await preferenceScript(), context);
    requireValue(Zotero.AnnotationMarkdownPreferences).init();
    const enabled = requireValue(doc.getElementById("annotation-markdown-enabled"));
    const fontScale = requireValue(doc.getElementById("annotation-markdown-font-scale"));
    expect(Reflect.get(enabled, "checked")).toBe(true);
    expect(Reflect.get(fontScale, "value")).toBe("100");
    const event = new doc.defaultView!.Event("command");
    Reflect.set(enabled, "checked", false);
    enabled.dispatchEvent(event);
    expect(Zotero.Prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.enabled", false, true);
  });

  test("defaults smart avoidance on and gates it by both parent choices without resetting it", async () => {
    const f = await mathPreferenceFixture(true, false, true);
    const outline = f.controls.get("annotation-markdown-outline-enabled");
    const numbers = f.controls.get("annotation-markdown-outline-numbering");
    const smart = f.controls.get("annotation-markdown-outline-smart-numbering");
    const option = f.controls.get("annotation-markdown-outline-smart-numbering-option");
    expect(requireValue(smart).checked).toBe(true);
    expect(requireValue(smart).disabled).toBe(true);
    requireValue(smart).dispatch("command");
    expect(f.set).not.toHaveBeenCalled();
    requireValue(numbers).checked = true;
    requireValue(numbers).dispatch("command");
    expect(requireValue(smart).disabled).toBe(false);
    expect(requireValue(option).getAttribute("data-disabled")).toBeNull();
    requireValue(smart).checked = false;
    requireValue(smart).dispatch("command");
    expect(f.set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineSmartNumbering", false, true);
    f.set.mockClear();
    requireValue(outline).checked = false;
    requireValue(outline).dispatch("command");
    expect(requireValue(smart).disabled).toBe(true);
    expect(requireValue(smart).checked).toBe(false);
    expect(requireValue(option).getAttribute("data-disabled")).toBe("true");
    requireValue(smart).dispatch("command");
    expect(f.set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.outlineSmartNumbering", expect.anything(), true);
    requireValue(outline).checked = true;
    requireValue(outline).dispatch("syncfrompreference");
    expect(requireValue(smart).disabled).toBe(false);
    requireValue(numbers).checked = false;
    requireValue(numbers).dispatch("syncfrompreference");
    expect(requireValue(smart).disabled).toBe(true);
    expect(requireValue(smart).checked).toBe(false);
    requireValue(numbers).checked = true;
    requireValue(numbers).dispatch("syncfrompreference");
    expect(requireValue(smart).disabled).toBe(false);
    expect(requireValue(smart).checked).toBe(false);
  });
  test("defaults heading numbers off and preserves the child choice when outline visibility changes", async () => {
    const f = await mathPreferenceFixture(true, false, true);
    const parent = f.controls.get("annotation-markdown-outline-enabled");
    const child = f.controls.get("annotation-markdown-outline-numbering");
    const option = f.controls.get("annotation-markdown-outline-numbering-option");
    expect(requireValue(child).checked).toBe(false);
    expect(requireValue(child).disabled).toBe(false);
    requireValue(child).checked = true;
    requireValue(child).dispatch("command");
    expect(f.set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineNumbering", true, true);
    f.set.mockClear();
    requireValue(parent).checked = false;
    requireValue(parent).dispatch("command");
    expect(requireValue(child).disabled).toBe(true);
    expect(requireValue(child).checked).toBe(true);
    expect(requireValue(option).getAttribute("data-disabled")).toBe("true");
    expect(f.set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.outlineNumbering", expect.anything(), true);
    requireValue(child).dispatch("command");
    expect(f.set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.outlineNumbering", expect.anything(), true);
    requireValue(parent).checked = true;
    requireValue(parent).dispatch("syncfrompreference");
    expect(requireValue(child).disabled).toBe(false);
    expect(requireValue(child).checked).toBe(true);
    expect(requireValue(option).getAttribute("data-disabled")).toBeNull();
  });
  test.each(["svg", "mermaid"] as const)("%s is opt-in, follows rendering scopes, and writes the full pref key", async kind => {
    const f = await mathPreferenceFixture(false, false, true);
    const svg = f.controls.get(`annotation-markdown-${kind}-enabled`);
    expect(requireValue(svg).checked).toBe(false);
    expect(requireValue(svg).disabled).toBe(true);
    requireValue(svg).checked = true;
    requireValue(f.controls.get("annotation-markdown-popup-enabled")).checked = true;
    requireValue(f.controls.get("annotation-markdown-popup-enabled")).dispatch("command");
    expect(requireValue(svg).disabled).toBe(false);
    expect(requireValue(svg).checked).toBe(true);
    requireValue(svg).dispatch("command");
    expect(f.set).toHaveBeenCalledWith(`extensions.annotationMarkdown.${kind}Enabled`, true, true);
    const source = await readFile(path.join(process.cwd(), "addon", "preferences.xhtml"), "utf8");
    expect(source).toContain(`preference="extensions.annotationMarkdown.${kind}Enabled"`);
    expect(source).toContain(`data-annotation-markdown-l10n-id="annotation-markdown-prefs-${kind}-enabled"`);
  });
  test.each([
    [false, false, false], [false, false, true],
    [true, false, false], [true, false, true],
    [false, true, false], [false, true, true],
    [true, true, false], [true, true, true]
  ] as const)("gates math controls by rendering scopes: sidebar=%s popup=%s math=%s", async (sidebar: boolean, popup: boolean, math: boolean) => {
    const f = await mathPreferenceFixture(sidebar, popup, math);
    const input = f.controls.get("annotation-markdown-math-enabled");
    const output = f.controls.get("annotation-markdown-math-output");
    expect(requireValue(input).disabled).toBe(!(sidebar || popup));
    expect(requireValue(input).getAttribute("disabled")).toBe(sidebar || popup ? null : "true");
    expect(requireValue(input).checked).toBe(math);
    expect(requireValue(output).disabled).toBe(!(sidebar || popup) || !math);
    expect(requireValue(output).value).toBe("mathml");
    expect(f.set).not.toHaveBeenCalled();
  });

  test("restores saved math choices when either rendering scope is re-enabled", async () => {
    const f = await mathPreferenceFixture(false, false, true);
    const sidebar = f.controls.get("annotation-markdown-enabled");
    const popup = f.controls.get("annotation-markdown-popup-enabled");
    const math = f.controls.get("annotation-markdown-math-enabled");
    const output = f.controls.get("annotation-markdown-math-output");
    expect(requireValue(math).disabled).toBe(true);
    requireValue(popup).checked = true;
    requireValue(popup).dispatch("command");
    expect(requireValue(math).disabled).toBe(false);
    expect(requireValue(output).disabled).toBe(false);
    requireValue(popup).checked = false;
    requireValue(popup).dispatch("syncfrompreference");
    expect(requireValue(math).disabled).toBe(true);
    expect(requireValue(math).checked).toBe(true);
    expect(requireValue(output).disabled).toBe(true);
    requireValue(sidebar).checked = true;
    requireValue(sidebar).dispatch("syncfrompreference");
    expect(requireValue(math).disabled).toBe(false);
    expect(requireValue(output).disabled).toBe(false);
    expect(requireValue(output).value).toBe("mathml");
    expect(f.set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.mathEnabled", expect.anything(), true);
    expect(f.set).not.toHaveBeenCalledWith("extensions.annotationMarkdown.mathOutput", expect.anything(), true);
    requireValue(math).checked = false;
    requireValue(math).dispatch("command");
    requireValue(sidebar).checked = false;
    requireValue(sidebar).dispatch("command");
    requireValue(popup).checked = true;
    requireValue(popup).dispatch("command");
    expect(requireValue(math).disabled).toBe(false);
    expect(requireValue(math).checked).toBe(false);
    expect(requireValue(output).disabled).toBe(true);
  });

  test("presents sidebar and popup rendering as peer options", async () => {
    const source = await readFile(path.join(process.cwd(), "addon", "preferences.xhtml"), "utf8");
    expect(source).toContain('data-annotation-markdown-l10n-id="annotation-markdown-prefs-enabled"');
    expect(source).toContain('<vbox id="annotation-markdown-popup-option">');
  });

  test("preserves XUL controls, setting keys, values, and group order", async () => {
    const doc = await loadPreferenceDocument();
    expect(doc.documentElement.getAttribute("onload")).toBe("Zotero.AnnotationMarkdownPreferences.init(document)");
    expect(doc.querySelector("select")).toBeNull();
    const keys = {
      "settings-language": "settingsLanguage",
      enabled: "enabled", "popup-enabled": "popupEnabled", "math-enabled": "mathEnabled",
      "math-output": "mathOutput", "svg-enabled": "svgEnabled", "mermaid-enabled": "mermaidEnabled", "font-scale": "fontScalePercent",
      "paste-as-plain-text": "pasteAsPlainText", "fast-editor": "fastEditor",
      "outline-enabled": "outlineEnabled", "outline-numbering": "outlineNumbering", "outline-font-scale": "outlineFontScalePercent",
      "outline-smart-numbering": "outlineSmartNumbering",
      "auto-todo-tag": "autoTodoTag", "auto-todo-cleanup": "autoTodoCleanup",
      "render-strategy": "renderStrategy", "native-row-lazy": "nativeRowLazy"
    };
    expect(doc.querySelectorAll("[preference]")).toHaveLength(Object.keys(keys).length);
    for (const [id, key] of Object.entries(keys)) {
      const control = doc.getElementById(`annotation-markdown-${id}`);
      expect(control.getAttribute("preference")).toBe(`extensions.annotationMarkdown.${key}`);
      expect(control.localName).toBe(["settings-language", "math-output", "font-scale", "outline-font-scale", "render-strategy"].includes(id) ? "menulist" : "checkbox");
    }
    for (const id of ["font-scale", "outline-font-scale"]) {
      const items = [...doc.getElementById(`annotation-markdown-${id}`).querySelectorAll("menuitem")];
      expect(items.map(item => item.getAttribute("value"))).toEqual(Array.from({ length: 13 }, (_, i) => String(80 + i * 10)));
      expect(items.map(item => item.getAttribute("label"))).toEqual(items.map(item => `${item.getAttribute("value")}%`));
    }
    expect([...doc.getElementById("annotation-markdown-math-output").querySelectorAll("menuitem")].map(item => item.getAttribute("value"))).toEqual(["htmlAndMathml", "mathml"]);
    expect([...doc.getElementById("annotation-markdown-render-strategy").querySelectorAll("menuitem")].map(item => item.getAttribute("value"))).toEqual(["auto", "eager", "lazy"]);
    const groups = [...doc.querySelectorAll("groupbox")];
    expect(groups.map(group => group.firstElementChild.firstElementChild.getAttribute("data-annotation-markdown-l10n-id"))).toEqual([
      "annotation-markdown-prefs-general",
      "annotation-markdown-prefs-reader", "annotation-markdown-prefs-outline",
      "annotation-markdown-prefs-tags", "annotation-markdown-prefs-performance"
    ]);
    expect([...groups[1].querySelectorAll("[preference]")].map(control => control.id)).toEqual([
      "annotation-markdown-enabled", "annotation-markdown-popup-enabled", "annotation-markdown-math-enabled",
      "annotation-markdown-math-output", "annotation-markdown-svg-enabled", "annotation-markdown-mermaid-enabled", "annotation-markdown-font-scale",
      "annotation-markdown-paste-as-plain-text", "annotation-markdown-fast-editor"
    ]);
    expect(groups[2].querySelector("#annotation-markdown-outline-font-scale")).not.toBeNull();
    expect(groups[3].querySelector("#annotation-markdown-auto-todo-cleanup")).not.toBeNull();
  });

  test.each(["en-US", "zh-CN"] as const)("localizes all pane text and caption attributes in %s", async locale => {
    const doc = await loadPreferenceDocument();
    expect(doc.querySelector("[data-l10n-id]")).toBeNull();
    const source = await readFile(path.join(process.cwd(), "addon", "locale", locale, "annotation-markdown-preferences.ftl"), "utf8");
    const resource = new FluentResource(source);
    const bundle = new FluentBundle(locale);
    expect(bundle.addResource(resource)).toEqual([]);
    const targets = [...doc.querySelectorAll("[data-annotation-markdown-l10n-id]")];
    const ids = targets.map(element => element.getAttribute("data-annotation-markdown-l10n-id"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(resource.body.map(message => message.id).sort()).toEqual([...ids].sort());
    for (const element of targets) {
      const id = element.getAttribute("data-annotation-markdown-l10n-id");
      expect(id).toMatch(/^annotation-markdown-prefs-/);
      const message = bundle.getMessage(id);
      expect(message, id).toBeDefined();
      const attribute = ["checkbox", "menuitem"].includes(element.localName) ? "label" : element.localName === "label" ? "value" : null;
      expect(Object.keys(requireValue(message).attributes)).toEqual(attribute ? [attribute] : []);
      const text = bundle.formatPattern(requireValue(attribute ? requireValue(message).attributes[attribute] : requireValue(message).value));
      expect(text.trim(), id).not.toBe("");
      if (locale === "zh-CN") expect(text, id).toMatch(/[\u4e00-\u9fff]/);
      if (attribute) element.setAttribute(attribute, text);
      else element.textContent = text;
    }
    // Every user-facing string must use Fluent, except the language-neutral percentages.
    for (const element of doc.querySelectorAll("checkbox, menuitem, description, label, h2")) {
      if (element.localName === "label" && element.children.length) continue;
      if (element.localName === "menuitem" && /^\d+%$/.test(element.getAttribute("label") ?? "")) continue;
      if (element.localName === "menuitem" && ["zh-CN", "en-US"].includes(element.getAttribute("value") ?? "")) continue;
      expect(element.hasAttribute("data-annotation-markdown-l10n-id"), element.outerHTML).toBe(true);
    }
    expect(doc.getElementById("annotation-markdown-enabled").getAttribute("label")).toBe(locale === "zh-CN" ? "将侧栏批注评论渲染为 Markdown" : "Render sidebar annotation comments as Markdown");
    expect(doc.querySelector('[data-annotation-markdown-l10n-id="annotation-markdown-prefs-math-output"]').getAttribute("value")).toBe(locale === "zh-CN" ? "公式渲染方式" : "Math rendering");
    expect(doc.getElementById("annotation-markdown-math-output").getAttribute("preference")).toBe("extensions.annotationMarkdown.mathOutput");
    expect([...doc.getElementById("annotation-markdown-math-output").querySelectorAll("menuitem")].map(item => item.getAttribute("value"))).toEqual(["htmlAndMathml", "mathml"]);
    expect(doc.querySelector('[data-annotation-markdown-l10n-id="annotation-markdown-prefs-math-native"]').getAttribute("label"))
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
      getElementById(id: string) {
        return new Map<string, PreferenceInput>(Object.entries({
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
        })).get(id) ?? null;
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

          return new Map<string, string | number | boolean>(Object.entries({
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
          })).get(key);
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
      getElementById(id: string) {
        return new Map<string, PreferenceInput>(Object.entries({
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
        })).get(id) ?? null;
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

  test.each([undefined, "unknown", false] as const)("uses standard output for invalid preference %s without writing it", async (storedOutput) => {
    const set = vi.fn();
    const preferences = await loadPreferencesScript({
      Prefs: {
        get: vi.fn((key, global) => global && key === "extensions.annotationMarkdown.mathOutput" ? storedOutput : undefined),
        set
      }
    });
    const controls = new Map<string, PreferenceInput>();
    const documentRef = {
      getElementById(id: string) {
        if (!controls.has(id)) controls.set(id, createInput());
        return controls.get(id);
      }
    };
    preferences.init(documentRef);
    expect(requireValue(controls.get("annotation-markdown-math-output")).value).toBe("htmlAndMathml");
    expect(set).not.toHaveBeenCalled();
  });
});

async function mathPreferenceFixture(sidebar: boolean, popup: boolean, math: boolean) {
  const values: Record<string, unknown> = {
    "extensions.annotationMarkdown.enabled": sidebar,
    "extensions.annotationMarkdown.popupEnabled": popup,
    "extensions.annotationMarkdown.mathEnabled": math,
    "extensions.annotationMarkdown.mathOutput": "mathml"
  };
  const set = vi.fn();
  const preferences = await loadPreferencesScript({ Prefs: { get: (key, global) => global ? values[key] : undefined, set } });
  const controls = new Map<string, PreferenceInput>();
  preferences.init({ getElementById(id: string) {
    if (!controls.has(id)) controls.set(id, createInput());
    return controls.get(id);
  } });
  return { controls, set };
}

async function languageFixture(locale: string, stored?: string, delay?: (locale: string) => Promise<void>) {
  const dom = new JSDOM('<html lang="zh-CN"><body><p id="other-plugin">Other plugin</p></body></html>');
  const doc = dom.window.document;
  const source = await loadPreferenceDocument();
  doc.body.append(doc.importNode(source.documentElement, true));
  const bundles = new Map<string, FluentBundle>();
  for (const lang of ["en-US", "zh-CN"]) {
    const bundle = new FluentBundle(lang);
    bundle.addResource(new FluentResource(await readFile(path.join(process.cwd(), "addon/locale", lang, "annotation-markdown-preferences.ftl"), "utf8")));
    bundles.set(lang, bundle);
  }
  const set = vi.fn();
  const Zotero: PreferenceHost = { locale, Prefs: { get: (key, global) => global && key.endsWith(".settingsLanguage") ? stored
    : key.endsWith(".mathOutput") ? "mathml" : undefined, set } };
  class NativeLocalization {
    constructor(_resources: string[], _sync: boolean, _registry: unknown, private locales: string[]) {}
    async formatMessages(keys: { id: string }[]) {
      await delay?.(this.locales[0]);
      return keys.map(({ id }) => {
        for (const lang of this.locales) {
          const bundle = bundles.get(lang), message = bundle?.getMessage(id);
          if (bundle && message) return { value: message.value ? bundle.formatPattern(message.value) : null,
            attributes: Object.entries(message.attributes).map(([name, pattern]) => ({ name, value: bundle.formatPattern(pattern) })) };
        }
        return null;
      });
    }
  }
  const context = { Zotero, Localization: NativeLocalization };
  vm.runInNewContext(await preferenceScript(), context);
  return { doc, set, preferences: requireValue(Zotero.AnnotationMarkdownPreferences) };
}

async function loadPreferencesScript(Zotero: PreferenceHost = { Prefs: { get: vi.fn(() => undefined), set: vi.fn() } }) {
  const source = await preferenceScript();
  const context = { Zotero };
  vm.runInNewContext(source, context);
  expect(context.Zotero.AnnotationMarkdownPreferences).toBeDefined();
  return requireValue(context.Zotero.AnnotationMarkdownPreferences);
}

function createInput(): PreferenceInput {
  const listeners = new Map<string, () => void>();
  const attributes = new Map<string, string>();
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
