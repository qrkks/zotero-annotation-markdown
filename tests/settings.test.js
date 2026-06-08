import { describe, expect, test, vi } from "vitest";

import { createSettings } from "../src/settings.js";

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

  test("keeps font scale within a sidebar-friendly range", () => {
    const settings = createSettings();

    settings.setFontScale(10);
    expect(settings.getFontScale()).toBe(1.5);

    settings.setFontScale(0.1);
    expect(settings.getFontScale()).toBe(0.8);
  });

  test("defaults annotation paste handling to plain text", () => {
    const settings = createSettings();

    expect(settings.isPlainTextPasteEnabled()).toBe(true);
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
});
