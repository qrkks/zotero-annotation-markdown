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

  test("cleans a rejected startup and permits the same Reader to retry", async () => {
    const failure = new Error("temporary initialization failure");
    const failedStop = vi.fn(() => { throw new Error("partial cleanup failed"); });
    const healthyStop = vi.fn();
    const controllers = [
      createController({ start: () => Promise.reject(failure), stop: failedStop }),
      createController({ start: () => Promise.resolve(), stop: healthyStop })
    ];
    const controllerFactory = vi.fn(() => requireController(controllers.shift()));
    const registry = createReaderRegistry({ controllerFactory });
    const reader = {};

    await expect(registry.register(reader)).rejects.toBe(failure);
    expect(failedStop).toHaveBeenCalledOnce();
    await registry.register(reader);
    registry.shutdown();

    expect(controllerFactory).toHaveBeenCalledTimes(2);
    expect(failedStop).toHaveBeenCalledOnce();
    expect(healthyStop).toHaveBeenCalledOnce();
  });

  test("cleans synchronous partial startup without replacing the original error", () => {
    const failure = new Error("startup failed");
    const stop = vi.fn(() => { throw new Error("cleanup failed"); });
    const controllerFactory = vi.fn(() => createController({ start: () => { throw failure; }, stop }));
    const registry = createReaderRegistry({ controllerFactory });
    const reader = {};

    expect(() => registry.register(reader)).toThrow(failure);
    expect(() => registry.register(reader)).toThrow(failure);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(controllerFactory).toHaveBeenCalledTimes(2);
  });

  test("reconciles closed Readers independently and preserves other instances of the same item", async () => {
    const closedReader = { itemID: 1 }, otherClosedReader = { itemID: 2 }, liveReader = { itemID: 1 };
    const stops = [vi.fn(() => { throw new Error("dead Reader"); }), vi.fn(), vi.fn()];
    const refreshes = [vi.fn(), vi.fn(), vi.fn()];
    let index = 0;
    const registry = createReaderRegistry({ controllerFactory: () => {
      const current = index++;
      return createController({ stop: stops[current], refresh: refreshes[current] });
    } });
    await registry.register(closedReader);
    await registry.register(otherClosedReader);
    await registry.register(liveReader);

    expect(() => registry.reconcile([liveReader])).not.toThrow();
    registry.refresh();

    expect(stops[0]).toHaveBeenCalledOnce();
    expect(stops[1]).toHaveBeenCalledOnce();
    expect(stops[2]).not.toHaveBeenCalled();
    expect(refreshes[0]).not.toHaveBeenCalled();
    expect(refreshes[1]).not.toHaveBeenCalled();
    expect(refreshes[2]).toHaveBeenCalledOnce();
    registry.shutdown();
  });

  test("cancels a pending closed Reader before readiness and stops it once after settling", async () => {
    let resolveStart: (() => void) | undefined;
    const stop = vi.fn(), cancelStart = vi.fn();
    const controllerFactory = vi.fn(() => createController({
      start: () => new Promise<void>(resolve => { resolveStart = resolve; }),
      cancelStart,
      stop
    }));
    const registry = createReaderRegistry({ controllerFactory });
    const reader = {};
    const pending = registry.register(reader);

    registry.reconcile([]);
    // A queued Reader render event must not resurrect an object already closed.
    await registry.register(reader);
    registry.shutdown();
    expect(controllerFactory).toHaveBeenCalledOnce();
    expect(cancelStart).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
    resolveStart!();
    await pending;
    expect(stop).toHaveBeenCalledOnce();
  });

  test("cleans a rejected pending Reader exactly once after it closes", async () => {
    let rejectStart: ((error: Error) => void) | undefined;
    const failure = new Error("closed pending startup failed");
    const stop = vi.fn();
    const controllerFactory = vi.fn(() => createController({
      start: () => new Promise<void>((_resolve, reject) => { rejectStart = reject; }), stop
    }));
    const registry = createReaderRegistry({ controllerFactory });
    const reader = {};
    const pending = registry.register(reader);
    registry.unregister(reader);
    rejectStart!(failure);
    await expect(pending).rejects.toBe(failure);
    expect(stop).toHaveBeenCalledOnce();
    registry.shutdown();
    expect(stop).toHaveBeenCalledOnce();
  });

  test("a late failed old start cannot remove a newer registration of the same Reader", async () => {
    let rejectOldStart: ((error: Error) => void) | undefined;
    const failure = new Error("old initialization failed late");
    const oldStop = vi.fn(), newStop = vi.fn(), refresh = vi.fn();
    const controllers = [
      createController({ start: () => new Promise<void>((_resolve, reject) => { rejectOldStart = reject; }), stop: oldStop }),
      createController({ start: () => Promise.resolve(), stop: newStop, refresh })
    ];
    const registry = createReaderRegistry({ controllerFactory: () => requireController(controllers.shift()) });
    const reader = {};
    const oldRegistration = registry.register(reader);
    registry.unregister(reader);
    await registry.register(reader);

    rejectOldStart!(failure);
    await expect(oldRegistration).rejects.toBe(failure);
    registry.refresh();
    expect(oldStop).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(newStop).not.toHaveBeenCalled();
    registry.shutdown();
    expect(newStop).toHaveBeenCalledOnce();
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

function requireController(controller: ReaderController | undefined): ReaderController {
  if (!controller) throw new Error("Unexpected controller creation");
  return controller;
}
