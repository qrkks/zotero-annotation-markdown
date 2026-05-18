import { createAnnotationSidebarAdapter } from "./annotation-sidebar-adapter.js";
import { createMarkdownRenderer } from "./markdown-renderer.js";
import { createReaderController } from "./reader-controller.js";
import { createReaderRegistry } from "./reader-registry.js";
import { createSettings } from "./settings.js";

export const PLUGIN_ID = "annotation-markdown@local";
const READER_EVENT = "renderSidebarAnnotationHeader";

export function createPlugin({
  Zotero = globalThis.Zotero,
  window: windowRef = globalThis.window,
  registryFactory,
  logger = globalThis.console
} = {}) {
  let registry;
  let readerEventHandler;

  function makeRegistry() {
    if (registryFactory) {
      return registryFactory();
    }

    const settings = createSettings({ prefs: createPrefsAdapter(Zotero) });
    return createReaderRegistry({
      controllerFactory(reader) {
        const readerWindow = getReaderWindow(reader) ?? windowRef;
        const readerDocument = getReaderDocument(reader) ?? readerWindow?.document;
        return createReaderController({
          reader,
          adapter: createAnnotationSidebarAdapter({ document: readerDocument }),
          renderer: createMarkdownRenderer({ windowRef: readerWindow }),
          settings,
          MutationObserver: readerWindow?.MutationObserver
        });
      }
    });
  }

  return {
    startup() {
      registry = makeRegistry();

      for (const reader of collectOpenReaders(Zotero)) {
        registry.register(reader);
      }

      if (Zotero?.Reader?.registerEventListener) {
        readerEventHandler = (event) => {
          const reader = event?.reader ?? event;
          registry?.register(reader);
        };
        Zotero.Reader.registerEventListener(READER_EVENT, readerEventHandler, PLUGIN_ID);
      }
    },

    shutdown() {
      try {
        if (readerEventHandler && Zotero?.Reader?.unregisterEventListener) {
          Zotero.Reader.unregisterEventListener(READER_EVENT, readerEventHandler);
        }
      } catch (error) {
        logger?.warn?.("Could not unregister Zotero Annotation Markdown reader listener", error);
      } finally {
        readerEventHandler = undefined;
        registry?.shutdown();
        registry = undefined;
      }
    }
  };
}

function createPrefsAdapter(Zotero) {
  if (!Zotero?.Prefs) {
    return undefined;
  }

  return {
    get(key, defaultValue) {
      const value = Zotero.Prefs.get?.(key);
      return typeof value === "boolean" ? value : defaultValue;
    },

    set(key, value) {
      Zotero.Prefs.set?.(key, value);
    }
  };
}

function collectOpenReaders(Zotero) {
  const readerApi = Zotero?.Reader;
  if (!readerApi) {
    return [];
  }

  if (typeof readerApi.getOpenReaders === "function") {
    return Array.from(readerApi.getOpenReaders()).filter(Boolean);
  }

  if (readerApi._readers instanceof Map) {
    return Array.from(readerApi._readers.values()).filter(Boolean);
  }

  if (Array.isArray(readerApi._readers)) {
    return readerApi._readers.filter(Boolean);
  }

  return [];
}

function getReaderWindow(reader) {
  return (
    reader?.window ??
    reader?._iframeWindow ??
    reader?.document?.defaultView ??
    null
  );
}

function getReaderDocument(reader) {
  return (
    reader?.document ??
    reader?.window?.document ??
    reader?._iframeWindow?.document ??
    null
  );
}

