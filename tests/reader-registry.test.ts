import { describe, expect, test, vi } from "vitest";
import { createReaderRegistry } from "../src/reader-registry.ts";
import type { ReaderController } from "../src/types.ts";

function createController(overrides: Partial<ReaderController> = {}) {
  return {
    start: vi.fn<ReaderController["start"]>(),
    renderNow: vi.fn<ReaderController["renderNow"]>(),
    stop: vi.fn<ReaderController["stop"]>(),
    ...overrides
  } satisfies ReaderController;
}

describe("createReaderRegistry", () => {
  test("starts one controller per reader and avoids duplicate registration", () => {
    const start = vi.fn();
    const controllerFactory = vi.fn(() => createController({ start }));
    const registry = createReaderRegistry({ controllerFactory });
    const reader = {};

    registry.register(reader);
    registry.register(reader);

    expect(controllerFactory).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  test("waits for async controller start before considering the reader active", async () => {
    const start = vi.fn(() => Promise.resolve());
    const controllerFactory = vi.fn(() => createController({ start }));
    const registry = createReaderRegistry({ controllerFactory });
    const reader = {};

    await registry.register(reader);
    await registry.register(reader);

    expect(controllerFactory).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  test("stops a controller if shutdown happens while async start is pending", async () => {
    let resolveStart: () => void = () => { throw new Error("Controller has not started"); };
    const stop = vi.fn();
    const registry = createReaderRegistry({
      controllerFactory: () => createController({
        start: vi.fn(() => new Promise<void>((resolve) => { resolveStart = resolve; })),
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
      controllerFactory: () => createController({ stop })
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
      controllerFactory: () => createController({ stop: stops[index++] })
    });

    registry.register({});
    registry.register({});
    registry.shutdown();

    expect(stops[0]).toHaveBeenCalledTimes(1);
    expect(stops[1]).toHaveBeenCalledTimes(1);
  });

  test("shutdown continues stopping readers after one controller throws", () => {
    const deadReaderStop = vi.fn(() => {
      throw new Error("can't access dead object");
    });
    const liveReaderStop = vi.fn();
    const stops = [deadReaderStop, liveReaderStop];
    let index = 0;
    const registry = createReaderRegistry({
      controllerFactory: () => createController({ stop: stops[index++] })
    });

    registry.register({});
    registry.register({});

    expect(() => registry.shutdown()).not.toThrow();
    expect(deadReaderStop).toHaveBeenCalledTimes(1);
    expect(liveReaderStop).toHaveBeenCalledTimes(1);
  });

  test("refresh updates all active controllers", () => {
    const refreshes = [vi.fn(), vi.fn()];
    let index = 0;
    const registry = createReaderRegistry({
      controllerFactory: () => createController({
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
