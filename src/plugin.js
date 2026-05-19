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
  styleText = "",
  logger = globalThis.console,
  diagnostics = globalThis.ZoteroAnnotationMarkdownDiagnostics
} = {}) {
  let registry;
  let readerEventHandler;
  const diagnosticsLogger = createLogger(Zotero, logger, diagnostics);

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
          MutationObserver: readerWindow?.MutationObserver,
          styleText,
          logger: diagnosticsLogger
        });
      }
    });
  }

  return {
    startup() {
      diagnosticsLogger.log("[annotation-markdown] startup");
      registry = makeRegistry();

      const openReaders = collectOpenReaders(Zotero);
      diagnosticsLogger.log(`[annotation-markdown] found open readers: ${openReaders.length}`);

      const registrations = openReaders.map((reader) => registry.register(reader));

      if (Zotero?.Reader?.registerEventListener) {
        readerEventHandler = (event) => {
          const reader = event?.reader ?? event;
          diagnosticsLogger.log(`[annotation-markdown] reader event fired: ${READER_EVENT}`);
          return registry?.register(reader);
        };
        Zotero.Reader.registerEventListener(READER_EVENT, readerEventHandler, PLUGIN_ID);
        diagnosticsLogger.log(`[annotation-markdown] registered reader event: ${READER_EVENT}`);
      } else {
        diagnosticsLogger.log("[annotation-markdown] Zotero.Reader.registerEventListener unavailable");
      }

      return Promise.all(registrations);
    },

    shutdown() {
      try {
        if (readerEventHandler && Zotero?.Reader?.unregisterEventListener) {
          Zotero.Reader.unregisterEventListener(READER_EVENT, readerEventHandler);
        }
      } catch (error) {
        diagnosticsLogger.warn("Could not unregister Zotero Annotation Markdown reader listener", error);
      } finally {
        readerEventHandler = undefined;
        registry?.shutdown();
        registry = undefined;
      }
    }
  };
}

function createLogger(Zotero, logger, diagnostics) {
  return {
    log(message) {
      appendDiagnostic(diagnostics, message);
      if (Zotero?.debug) {
        Zotero.debug(message);
      } else {
        logger?.log?.(message);
      }
    },

    warn(message, error) {
      appendDiagnostic(diagnostics, `${message}: ${error?.message ?? error ?? ""}`);
      if (Zotero?.debug) {
        Zotero.debug(`${message}: ${error?.message ?? error ?? ""}`);
      } else {
        logger?.warn?.(message, error);
      }
    }
  };
}

function appendDiagnostic(diagnostics, message) {
  try {
    diagnostics?.append?.(message);
  } catch {
    // Diagnostics must never break plugin behavior.
  }
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
