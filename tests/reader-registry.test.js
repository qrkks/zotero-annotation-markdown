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
});
