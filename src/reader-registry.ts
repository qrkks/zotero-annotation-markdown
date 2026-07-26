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

export function createReaderRegistry<Reader>({
  controllerFactory
}: CreateReaderRegistryOptions<Reader>): ReaderRegistry<Reader> {
  const entries = new Map<Reader, RegistryEntry>();

  return {
    register(reader) {
      if (!reader) {
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
          entry.startPromise = startResult.then(() => {
            entry.started = true;
            stopIfRequested(reader, entry);
          });
        } else {
          entry.started = true;
          entry.startPromise = Promise.resolve();
        }
      } catch (error) {
        entries.delete(reader);
        throw error;
      }

      return entry.startPromise;
    },

    unregister(reader) {
      const entry = entries.get(reader);
      if (!entry) {
        return;
      }

      entry.stopRequested = true;
      stopIfRequested(reader, entry);
    },

    shutdown() {
      for (const [reader, entry] of entries) {
        entry.stopRequested = true;
        try {
          stopIfRequested(reader, entry);
        } catch {
          entries.delete(reader);
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

  function stopIfRequested(reader: Reader, entry: RegistryEntry): void {
    if (!entry.stopRequested || !entry.started || entry.stopCalled) {
      return;
    }

    entry.stopCalled = true;
    entry.controller.stop();
    entries.delete(reader);
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return Boolean(value && typeof (value as PromiseLike<void>).then === "function");
}
