import { describe, expect, test, vi } from "vitest";
import { createSettings, migrateAutoTodoPreferences, LINKED_IMAGE_PREVIEW_ENABLED_PREF_KEY,
  AUTO_TODO_TAG_PREF_KEY, AUTO_TODO_CLEANUP_PREF_KEY, AUTO_TODO_PREFERENCES_VERSION_KEY } from "../src/settings.ts";
import type { PreferenceStore, PreferenceValue } from "../src/types.ts";

describe("createSettings", () => {
  test.each([[false, false], [false, true], [true, false], [true, true]])(
    "migrates effective legacy todo choices once: adding=%s cleanup=%s", (adding, cleanup) => {
      const values = new Map<string, boolean | number | string>([
        [AUTO_TODO_TAG_PREF_KEY, adding], [AUTO_TODO_CLEANUP_PREF_KEY, cleanup]
      ]);
      const prefs = { get: (key: string) => values.get(key),
        set: vi.fn((key: string, value: boolean | number | string) => {
          values.set(key, value);
        }) };
      migrateAutoTodoPreferences(prefs);
      expect(values.get(AUTO_TODO_TAG_PREF_KEY)).toBe(adding);
      expect(values.get(AUTO_TODO_CLEANUP_PREF_KEY)).toBe(adding && cleanup);
      expect(values.get(AUTO_TODO_PREFERENCES_VERSION_KEY)).toBe(1);
      // A later explicit cleanup-only choice survives plugin reloads.
      values.set(AUTO_TODO_TAG_PREF_KEY, false);
      values.set(AUTO_TODO_CLEANUP_PREF_KEY, true);
      prefs.set.mockClear();
      migrateAutoTodoPreferences(prefs);
      expect(values.get(AUTO_TODO_CLEANUP_PREF_KEY)).toBe(true);
      expect(prefs.set).not.toHaveBeenCalled();
    }
  );

  test("defaults inferred image previews on and retains the choice independently of rendering options", () => {
    const settings = createSettings();
    expect(settings.isLinkedImagePreviewEnabled()).toBe(true);
    settings.setLinkedImagePreviewEnabled(false);
    settings.setEnabled(false);
    settings.setPopupEnabled(true);
    expect(settings.isLinkedImagePreviewEnabled()).toBe(false);
    settings.setLinkedImagePreviewEnabled(true);
    expect(settings.isLinkedImagePreviewEnabled()).toBe(true);
  });

  test("persists inferred image preview choices without rewriting other preferences", () => {
    const values = new Map<string, PreferenceValue>();
    const prefs = {
      get: vi.fn<NonNullable<PreferenceStore["get"]>>((key, fallback) => values.get(key) ?? fallback),
      set: vi.fn<NonNullable<PreferenceStore["set"]>>((key, value) => { values.set(key, value); })
    };
    const settings = createSettings({ prefs });
    expect(settings.isLinkedImagePreviewEnabled()).toBe(true);
    expect(prefs.set).not.toHaveBeenCalled();
    settings.setLinkedImagePreviewEnabled(false);
    expect(createSettings({ prefs }).isLinkedImagePreviewEnabled()).toBe(false);
    expect(prefs.get).toHaveBeenCalledWith(LINKED_IMAGE_PREVIEW_ENABLED_PREF_KEY, true);
    expect(prefs.set).toHaveBeenCalledExactlyOnceWith(LINKED_IMAGE_PREVIEW_ENABLED_PREF_KEY, false);
  });

  test.each([undefined, "false", 0])("keeps inferred image previews enabled for missing or invalid values (%s)", value => {
    expect(createSettings({ prefs: { get: () => value } }).isLinkedImagePreviewEnabled()).toBe(true);
  });

  test("defaults smart numbering on and retains its saved choice independently of parent options", () => {
    const settings = createSettings();
    expect(settings.isOutlineSmartNumberingEnabled()).toBe(true);
    settings.setOutlineSmartNumberingEnabled(false);
    settings.setOutlineNumberingEnabled(true);
    settings.setOutlineEnabled(false);
    expect(settings.isOutlineSmartNumberingEnabled()).toBe(false);
    const values = new Map<string, PreferenceValue>();
    const prefs = {
      get: vi.fn<NonNullable<PreferenceStore["get"]>>((key, fallback) => values.get(key) ?? fallback),
      set: vi.fn<NonNullable<PreferenceStore["set"]>>((key, value) => { values.set(key, value); })
    };
    const stored = createSettings({ prefs });
    expect(stored.isOutlineSmartNumberingEnabled()).toBe(true);
    stored.setOutlineSmartNumberingEnabled(false);
    expect(createSettings({ prefs }).isOutlineSmartNumberingEnabled()).toBe(false);
    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineSmartNumbering", true);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineSmartNumbering", false);
    expect(prefs.set).toHaveBeenCalledTimes(1);
  });
  test.each([undefined, "false", 0])("preserves smart avoidance for missing or invalid values (%s)", value => {
    expect(createSettings({ prefs: { get: () => value } }).isOutlineSmartNumberingEnabled()).toBe(true);
  });
  test("defaults outline numbering off and stores it independently of visibility and expansion", () => {
    const settings = createSettings();
    expect(settings.isOutlineNumberingEnabled()).toBe(false);
    settings.setOutlineNumberingEnabled(true);
    settings.setOutlineEnabled(false);
    settings.setOutlineExpanded(true);
    expect(settings.isOutlineNumberingEnabled()).toBe(true);
    const values = new Map<string, PreferenceValue>([["extensions.annotationMarkdown.outlineNumbering", true]]);
    const prefs = {
      get: vi.fn<NonNullable<PreferenceStore["get"]>>((key, fallback) => values.get(key) ?? fallback),
      set: vi.fn<NonNullable<PreferenceStore["set"]>>((key, value) => { values.set(key, value); })
    };
    const stored = createSettings({ prefs });
    expect(stored.isOutlineNumberingEnabled()).toBe(true);
    stored.setOutlineNumberingEnabled(false);
    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineNumbering", false);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.outlineNumbering", false);
    expect(prefs.set).toHaveBeenCalledTimes(1);
  });
  test.each([undefined, "true", 1])("keeps missing or invalid outline numbering values off (%s)", value => {
    expect(createSettings({ prefs: { get: () => value } }).isOutlineNumberingEnabled()).toBe(false);
  });
  test("keeps existing sidebar and popup choices independent without rewriting stored preferences", () => {
    const values = new Map<string, PreferenceValue>([
      ["extensions.annotationMarkdown.enabled", false],
      ["extensions.annotationMarkdown.popupEnabled", true]
    ]);
    const prefs = {
      get: (key, fallback) => values.get(key) ?? fallback,
      set: vi.fn<NonNullable<PreferenceStore["set"]>>((key, value) => { values.set(key, value); })
    } satisfies PreferenceStore;
    const settings = createSettings({ prefs });
    expect(settings.isEnabled()).toBe(false);
    expect(settings.isPopupEnabled()).toBe(true);
    expect(prefs.set).not.toHaveBeenCalled();
    settings.setEnabled(true);
    expect(settings.isPopupEnabled()).toBe(true);
    settings.setPopupEnabled(false);
    expect(settings.isEnabled()).toBe(true);
  });
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

  test("defaults popup rendering off and persists its choice", () => {
    const settings = createSettings();
    expect(settings.isPopupEnabled()).toBe(false);
    settings.setPopupEnabled(true);
    expect(settings.isPopupEnabled()).toBe(true);

    const prefs = { get: vi.fn(() => undefined), set: vi.fn() };
    const stored = createSettings({ prefs });
    expect(stored.isPopupEnabled()).toBe(false);
    stored.setPopupEnabled(true);
    expect(prefs.get).toHaveBeenCalledWith("extensions.annotationMarkdown.popupEnabled", false);
    expect(prefs.set).toHaveBeenCalledWith("extensions.annotationMarkdown.popupEnabled", true);
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

  test("defaults native row lazy rendering off and persists its choice", () => {
    const settings = createSettings();
    expect(settings.isNativeRowLazyEnabled()).toBe(false);
    settings.setNativeRowLazyEnabled(true);
    expect(settings.isNativeRowLazyEnabled()).toBe(true);

    const prefs = { get: vi.fn(() => true), set: vi.fn() };
    const stored = createSettings({ prefs });
    expect(stored.isNativeRowLazyEnabled()).toBe(true);
    stored.setNativeRowLazyEnabled(false);
    expect(prefs.get).toHaveBeenCalledWith(
      "extensions.annotationMarkdown.nativeRowLazy",
      false
    );
    expect(prefs.set).toHaveBeenCalledWith(
      "extensions.annotationMarkdown.nativeRowLazy",
      false
    );
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
