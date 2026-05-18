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
});
