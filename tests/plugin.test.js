import { describe, expect, test, vi } from "vitest";

import { createPlugin } from "../src/plugin.js";

describe("createPlugin", () => {
  test("startup registers existing readers and reader event listener", () => {
    const reader = {};
    const register = vi.fn();
    const registry = {
      register,
      shutdown: vi.fn()
    };
    const Zotero = {
      Reader: {
        _readers: [reader],
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => registry
    });

    plugin.startup();

    expect(register).toHaveBeenCalledWith(reader);
    expect(Zotero.Reader.registerEventListener).toHaveBeenCalledWith(
      "renderSidebarAnnotationHeader",
      expect.any(Function),
      "annotation-markdown@local"
    );
  });

  test("reader events register their reader with the registry", () => {
    const register = vi.fn();
    const Zotero = {
      Reader: {
        registerEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => ({ register, shutdown: vi.fn() })
    });

    plugin.startup();
    const handler = Zotero.Reader.registerEventListener.mock.calls[0][1];
    handler({ reader: { id: "reader-1" } });

    expect(register).toHaveBeenCalledWith({ id: "reader-1" });
  });

  test("startup tolerates missing Zotero reader APIs", () => {
    const plugin = createPlugin({ Zotero: {}, registryFactory: () => ({ register: vi.fn(), shutdown: vi.fn() }) });

    expect(() => plugin.startup()).not.toThrow();
  });

  test("shutdown unregisters reader listener and clears controllers", () => {
    const shutdown = vi.fn();
    const Zotero = {
      Reader: {
        registerEventListener: vi.fn(),
        unregisterEventListener: vi.fn()
      },
      Prefs: {}
    };
    const plugin = createPlugin({
      Zotero,
      registryFactory: () => ({ register: vi.fn(), shutdown })
    });

    plugin.startup();
    plugin.shutdown();

    expect(Zotero.Reader.unregisterEventListener).toHaveBeenCalledWith(
      "renderSidebarAnnotationHeader",
      Zotero.Reader.registerEventListener.mock.calls[0][1]
    );
    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});
