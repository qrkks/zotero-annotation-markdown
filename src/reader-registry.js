export function createReaderRegistry({ controllerFactory }) {
  const entries = new Map();

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
      const entry = {
        controller,
        started: false,
        stopRequested: false,
        stopCalled: false,
        startPromise: undefined
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
        stopIfRequested(reader, entry);
      }
    }
  };

  function stopIfRequested(reader, entry) {
    if (!entry.stopRequested || !entry.started || entry.stopCalled) {
      return;
    }

    entry.stopCalled = true;
    entry.controller.stop();
    entries.delete(reader);
  }
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}
