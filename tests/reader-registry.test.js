import { describe, expect, test, vi } from "vitest";

import { createReaderRegistry } from "../src/reader-registry.js";

describe("createReaderRegistry", () => {
  test("starts one controller per reader and avoids duplicate registration", () => {
    const start = vi.fn();
    const controllerFactory = vi.fn(() => ({ start, stop: vi.fn() }));
    const registry = createReaderRegistry({ controllerFactory });
    const reader = {};

    registry.register(reader);
    registry.register(reader);

    expect(controllerFactory).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  test("waits for async controller start before considering the reader active", async () => {
    const start = vi.fn(() => Promise.resolve());
    const controllerFactory = vi.fn(() => ({ start, stop: vi.fn() }));
    const registry = createReaderRegistry({ controllerFactory });
    const reader = {};

    await registry.register(reader);
    await registry.register(reader);

    expect(controllerFactory).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  test("stops a controller if shutdown happens while async start is pending", async () => {
    let resolveStart;
    const stop = vi.fn();
    const registry = createReaderRegistry({
      controllerFactory: () => ({
        start: vi.fn(() => new Promise((resolve) => { resolveStart = resolve; })),
        stop
      })
    });
    const reader = {};

    const startPromise = registry.register(reader);
    expect(startPromise).toBeInstanceOf(Promise);
    registry.shutdown();
    expect(stop).not.toHaveBeenCalled();
    resolveStart();
    await startPromise;

    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("unregister stops the controller for that reader", () => {
    const stop = vi.fn();
    const registry = createReaderRegistry({
      controllerFactory: () => ({ start: vi.fn(), stop })
    });
    const reader = {};

    registry.register(reader);
    registry.unregister(reader);

    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("shutdown stops all registered controllers", () => {
    const stops = [vi.fn(), vi.fn()];
    let index = 0;
    const registry = createReaderRegistry({
      controllerFactory: () => ({ start: vi.fn(), stop: stops[index++] })
    });

    registry.register({});
    registry.register({});
    registry.shutdown();

    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(stops[1]).toHaveBeenCalledTimes(1);
  });

  test("refresh updates all active controllers", () => {
    const refreshes = [vi.fn(), vi.fn()];
    let index = 0;
    const registry = createReaderRegistry({
      controllerFactory: () => ({
        start: vi.fn(),
        refresh: refreshes[index++],
        stop: vi.fn()
      })
    });

    registry.register({});
    registry.register({});
    registry.refresh();

    expect(refreshes[0]).toHaveBeenCalledTimes(1);
    expect(refreshes[1]).toHaveBeenCalledTimes(1);
  });
});
