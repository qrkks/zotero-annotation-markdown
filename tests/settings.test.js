import { describe, expect, test, vi } from "vitest";

import { createSettings } from "../src/settings.ts";

describe("createSettings", () => {
  test("defaults to enabled without a preference service", () => {
    const settings = createSettings();

    expect(settings.isEnabled()).toBe(true);
  });

  test("reads a stored boolean from a Zotero-like preference service", () => {
    const prefs = {
      get: vi.fn(() => false)
    };
    const settings = createSettings({ prefs });

    expect(settings.isEnabled()).toBe(false);
    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.enabled", true);
  });

  test("writes enabled state through a Zotero-like preference service", () => {
    const prefs = {
      set: vi.fn()
    };
    const settings = createSettings({ prefs });

    settings.setEnabled(false);

    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.enabled", false);
  });

  test("keeps an in-memory value when no preference service exists", () => {
    const settings = createSettings();

    settings.setEnabled(false);

    expect(settings.isEnabled()).toBe(false);
  });

  test("defaults markdown preview font scale to 1", () => {
    const settings = createSettings();

    expect(settings.getFontScale()).toBe(1);
  });

  test("reads a stored integer markdown preview font scale percentage", () => {
    const prefs = {
      get: vi.fn(() => 120)
    };
    const settings = createSettings({ prefs });

    expect(settings.getFontScale()).toBe(1.2);
    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.fontScalePercent", 100);
  });

  test("writes markdown preview font scale as an integer percentage", () => {
    const prefs = {
      set: vi.fn()
    };
    const settings = createSettings({ prefs });

    settings.setFontScale(1.1);

    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.fontScalePercent", 110);
  });

  test("allows markdown preview font scale up to 200 percent", () => {
    const settings = createSettings();

    settings.setFontScale(10);
    expect(settings.getFontScale()).toBe(2);

    settings.setFontScale(1.8);
    expect(settings.getFontScale()).toBe(1.8);

    expect(createSettings({ prefs: { get: () => 200 } }).getFontScale()).toBe(2);

    settings.setFontScale(0.1);
    expect(settings.getFontScale()).toBe(0.8);
  });

  test("defaults annotation paste handling to plain text", () => {
    const settings = createSettings();

    expect(settings.isPlainTextPasteEnabled()).toBe(true);
  });

  test("defaults the fast comment editor to enabled", () => {
    const settings = createSettings();

    expect(settings.isFastEditorEnabled()).toBe(true);
  });

  test("reads and writes the fast comment editor preference", () => {
    const prefs = {
      get: vi.fn(() => false),
      set: vi.fn()
    };
    const settings = createSettings({ prefs });

    expect(settings.isFastEditorEnabled()).toBe(false);
    settings.setFastEditorEnabled(true);

    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.fastEditor", true);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.fastEditor", true);
  });

  test("reads and writes annotation plain text paste preference", () => {
    const prefs = {
      get: vi.fn(() => false),
      set: vi.fn()
    };
    const settings = createSettings({ prefs });

    expect(settings.isPlainTextPasteEnabled()).toBe(false);

    settings.setPlainTextPasteEnabled(true);

    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.pasteAsPlainText", true);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.pasteAsPlainText", true);
  });

  test("defaults LaTeX math rendering to enabled", () => {
    const settings = createSettings();

    expect(settings.isMathEnabled()).toBe(true);
  });

  test("reads and writes LaTeX math rendering preference", () => {
    const prefs = {
      get: vi.fn(() => false),
      set: vi.fn()
    };
    const settings = createSettings({ prefs });

    expect(settings.isMathEnabled()).toBe(false);

    settings.setMathEnabled(true);

    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.mathEnabled", true);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.mathEnabled", true);
  });

  test("defaults performance diagnostics to disabled", () => {
    const settings = createSettings();

    expect(settings.isPerformanceDiagnosticsEnabled()).toBe(false);
  });

  test("reads and writes performance diagnostics preference", () => {
    const prefs = {
      get: vi.fn(() => true),
      set: vi.fn()
    };
    const settings = createSettings({ prefs });

    expect(settings.isPerformanceDiagnosticsEnabled()).toBe(true);

    settings.setPerformanceDiagnosticsEnabled(false);

    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.performanceDiagnostics", false);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.performanceDiagnostics", false);
  });

  test("defaults lightweight rendering mode to disabled", () => {
    const settings = createSettings();

    expect(settings.isLightweightModeEnabled()).toBe(false);
  });

  test("reads and writes lightweight rendering mode preference", () => {
    const prefs = {
      get: vi.fn(() => true),
      set: vi.fn()
    };
    const settings = createSettings({ prefs });

    expect(settings.isLightweightModeEnabled()).toBe(true);

    settings.setLightweightModeEnabled(false);

    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.lightweightMode", false);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.lightweightMode", false);
  });

  test("defaults annotation rendering strategy to automatic", () => {
    const settings = createSettings();

    expect(settings.getRenderStrategy()).toBe("auto");
  });

  test("reads, normalizes, and writes annotation rendering strategy", () => {
    const prefs = {
      get: vi.fn(() => "eager"),
      set: vi.fn()
    };
    const settings = createSettings({ prefs });

    expect(settings.getRenderStrategy()).toBe("eager");
    settings.setRenderStrategy("lazy");

    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.renderStrategy", "auto");
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.renderStrategy", "lazy");
    expect(createSettings({ prefs: { get: () => "unsupported" } }).getRenderStrategy()).toBe("auto");
  });

  test("persists the floating outline expansion preference and defaults it closed", () => {
    const settings = createSettings();
    expect(settings.isOutlineExpanded()).toBe(false);
    settings.setOutlineExpanded(true);
    expect(settings.isOutlineExpanded()).toBe(true);

    const prefs = { get: vi.fn(() => true), set: vi.fn() };
    const stored = createSettings({ prefs });
    expect(stored.isOutlineExpanded()).toBe(true);
    stored.setOutlineExpanded(false);
    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineExpanded", false);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineExpanded", false);
  });

  test("defaults the floating outline to enabled and persists its visibility preference", () => {
    const settings = createSettings();
    expect(settings.isOutlineEnabled()).toBe(true);
    settings.setOutlineEnabled(false);
    expect(settings.isOutlineEnabled()).toBe(false);

    const prefs = { get: vi.fn(() => false), set: vi.fn() };
    const stored = createSettings({ prefs });
    expect(stored.isOutlineEnabled()).toBe(false);
    stored.setOutlineEnabled(true);
    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineEnabled", true);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineEnabled", true);
    expect(createSettings({ prefs: { get: () => undefined } }).isOutlineEnabled()).toBe(true);
  });

  test("stores outline font size separately from preview font size", () => {
    const settings = createSettings();
    expect(settings.getOutlineFontScale()).toBe(1);
    settings.setOutlineFontScale(1.4);
    expect(settings.getOutlineFontScale()).toBe(1.4);
    expect(settings.getFontScale()).toBe(1);
    settings.setOutlineFontScale(0.1);
    expect(settings.getOutlineFontScale()).toBe(0.8);
    settings.setOutlineFontScale(10);
    expect(settings.getOutlineFontScale()).toBe(2);

    const prefs = { get: vi.fn(() => 120), set: vi.fn() };
    const stored = createSettings({ prefs });
    expect(stored.getOutlineFontScale()).toBe(1.2);
    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineFontScalePercent", 100);
    stored.setOutlineFontScale(1.3);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineFontScalePercent", 130);
    expect(createSettings({ prefs: { get: () => undefined } }).getOutlineFontScale()).toBe(1);
    expect(createSettings({ prefs: { get: () => 200 } }).getOutlineFontScale()).toBe(2);
  });

  test("defaults automatic todo tagging off and persists its choice", () => {
    const settings = createSettings();
    expect(settings.isAutoTodoTagEnabled()).toBe(false);
    settings.setAutoTodoTagEnabled(true);
    expect(settings.isAutoTodoTagEnabled()).toBe(true);

    const prefs = { get: vi.fn(() => undefined), set: vi.fn() };
    const stored = createSettings({ prefs });
    expect(stored.isAutoTodoTagEnabled()).toBe(false);
    stored.setAutoTodoTagEnabled(true);
    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.autoTodoTag", false);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.autoTodoTag", true);
  });

  test("defaults automatic todo cleanup off and persists its choice", () => {
    const settings = createSettings();
    expect(settings.isAutoTodoCleanupEnabled()).toBe(false);
    settings.setAutoTodoCleanupEnabled(true);
    expect(settings.isAutoTodoCleanupEnabled()).toBe(true);

    const prefs = { get: vi.fn(() => undefined), set: vi.fn() };
    const stored = createSettings({ prefs });
    expect(stored.isAutoTodoCleanupEnabled()).toBe(false);
    stored.setAutoTodoCleanupEnabled(true);
    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.autoTodoCleanup", false);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.autoTodoCleanup", true);
  });
});
