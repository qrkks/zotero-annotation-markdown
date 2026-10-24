/**
 * Per-Reader controller ownership and asynchronous lifecycle coordination.
 *
 * The registry prevents duplicate controllers and guarantees that a stop
 * requested during startup is applied after startup settles.
 */
import type { ReaderController, ReaderRegistry } from "./types.js";

interface RegistryEntry {
  controller: ReaderController;
  started: boolean;
  stopRequested: boolean;
  stopCalled: boolean;
  startPromise: PromiseLike<void>;
}

interface CreateReaderRegistryOptions<Reader> {
  controllerFactory(reader: Reader): ReaderController;
}

/** Creates a registry that owns at most one controller for each Reader object. */
export function createReaderRegistry<Reader>({
  controllerFactory
}: CreateReaderRegistryOptions<Reader>): ReaderRegistry<Reader> {
  const entries = new Map<Reader, RegistryEntry>();
  const closedReaders = new WeakSet<object>();

  return {
    register(reader) {
      if (!reader || (isObjectReader(reader) && closedReaders.has(reader))) {
        return Promise.resolve();
      }

      const existing = entries.get(reader);
      if (existing) {
        return existing.startPromise;
      }

      const controller = controllerFactory(reader);
      const entry: RegistryEntry = {
        controller,
        started: false,
        stopRequested: false,
        stopCalled: false,
        startPromise: Promise.resolve()
      };
      entries.set(reader, entry);

      try {
        const startResult = controller.start();
        if (isPromiseLike(startResult)) {
          entry.startPromise = Promise.resolve(startResult).then(
            () => {
              entry.started = true;
              stopIfRequested(reader, entry);
            },
            (error: unknown) => {
              cleanupFailedStart(reader, entry);
              throw error;
            }
          );
        } else {
          entry.started = true;
          entry.startPromise = Promise.resolve();
          stopIfRequested(reader, entry);
        }
      } catch (error) {
        cleanupFailedStart(reader, entry);
        throw error;
      }

      return entry.startPromise;
    },

    unregister(reader) {
      const entry = entries.get(reader);
      if (!entry) {
        return;
      }

      requestStop(reader, entry);
    },

    reconcile(openReaders) {
      const remaining = new Set(openReaders);
      for (const [reader, entry] of entries) {
        if (remaining.has(reader)) continue;
        if (isObjectReader(reader)) closedReaders.add(reader);
        try {
          requestStop(reader, entry);
        } catch {
          // A destroyed Reader must not prevent other closed Readers releasing.
        }
      }
    },

    shutdown() {
      for (const [reader, entry] of entries) {
        try {
          requestStop(reader, entry);
        } catch {
          // requestStop removes ownership even if a controller cannot clean up.
        }
      }
    },

    refresh() {
      for (const entry of entries.values()) {
        if (entry.started && !entry.stopRequested && !entry.stopCalled) {
          entry.controller.refresh?.();
        }
      }
    }
  };

  function requestStop(reader: Reader, entry: RegistryEntry): void {
    if (entry.stopRequested) return;
    entry.stopRequested = true;
    // Pending readiness can remain unresolved after its Reader closes. Release
    // registry ownership now, while its continuation still guarantees final stop.
    if (entries.get(reader) === entry) entries.delete(reader);
    try {
      if (!entry.started) entry.controller.cancelStart?.();
    } finally {
      stopIfRequested(reader, entry);
    }
  }

  function cleanupFailedStart(reader: Reader, entry: RegistryEntry): void {
    entry.started = true;
    entry.stopRequested = true;
    try {
      stopIfRequested(reader, entry);
    } catch {
      // Preserve the initialization error even if partial cleanup also fails.
    }
  }

  function stopIfRequested(reader: Reader, entry: RegistryEntry): void {
    if (!entry.stopRequested || !entry.started || entry.stopCalled) {
      return;
    }

    entry.stopCalled = true;
    try {
      entry.controller.stop();
    } finally {
      if (entries.get(reader) === entry) entries.delete(reader);
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return Boolean(value && typeof (value as PromiseLike<void>).then === "function");
}

function isObjectReader(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
