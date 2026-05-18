export function createReaderRegistry({ controllerFactory }) {
  const controllers = new Map();

  return {
    register(reader) {
      if (!reader || controllers.has(reader)) {
        return;
      }

      const controller = controllerFactory(reader);
      controllers.set(reader, controller);
      controller.start();
    },

    unregister(reader) {
      const controller = controllers.get(reader);
      if (!controller) {
        return;
      }

      controller.stop();
      controllers.delete(reader);
    },

    shutdown() {
      for (const controller of controllers.values()) {
        controller.stop();
      }
      controllers.clear();
    }
  };
}

