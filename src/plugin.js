import { createAnnotationSidebarAdapter } from "./annotation-sidebar-adapter.js";
import { createMarkdownRenderer } from "./markdown-renderer.js";
import { createReaderController } from "./reader-controller.js";
import { createReaderRegistry } from "./reader-registry.ts";
import {
  createSettings,
  ENABLED_PREF_KEY,
  FONT_SCALE_PERCENT_PREF_KEY,
  LIGHTWEIGHT_MODE_PREF_KEY,
  MATH_ENABLED_PREF_KEY,
  PERFORMANCE_DIAGNOSTICS_PREF_KEY,
  RENDER_STRATEGY_PREF_KEY
} from "./settings.ts";

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
  let preferenceObserverIds = [];
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
          adapter: createAnnotationSidebarAdapter({
            document: readerDocument,
            openLink: typeof Zotero?.launchURL === "function"
              ? (url) => Zotero.launchURL(url)
              : undefined
          }),
          renderer: createMarkdownRenderer({
            isMathEnabled: () => settings.isMathEnabled(),
            windowRef: readerWindow
          }),
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
      preferenceObserverIds = registerPreferenceObservers(Zotero, () => registry?.refresh?.());

      const openReaders = collectOpenReaders(Zotero);
      diagnosticsLogger.log(`[annotation-markdown] found open readers: ${openReaders.length}`);

      const registrations = openReaders.map((reader) => registry.register(reader));

      if (Zotero?.Reader?.registerEventListener) {
        readerEventHandler = (event) => {
          const reader = event?.reader ?? event;
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
        unregisterPreferenceObservers(Zotero, preferenceObserverIds);
        preferenceObserverIds = [];
        readerEventHandler = undefined;
        registry?.shutdown();
        registry = undefined;
      }
    }
  };
}

function registerPreferenceObservers(Zotero, refresh) {
  if (!Zotero?.Prefs?.registerObserver) {
    return [];
  }

  return [
    ENABLED_PREF_KEY,
    FONT_SCALE_PERCENT_PREF_KEY,
    MATH_ENABLED_PREF_KEY,
    LIGHTWEIGHT_MODE_PREF_KEY,
    PERFORMANCE_DIAGNOSTICS_PREF_KEY,
    RENDER_STRATEGY_PREF_KEY
  ]
    .map((key) => Zotero.Prefs.registerObserver(key, refresh, true))
    .filter(Boolean);
}

function unregisterPreferenceObservers(Zotero, observerIds) {
  if (!Zotero?.Prefs?.unregisterObserver) {
    return;
  }

  for (const observerId of observerIds) {
    Zotero.Prefs.unregisterObserver(observerId);
  }
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
      const value = Zotero.Prefs.get?.(key, true);
      return typeof value === typeof defaultValue ? value : defaultValue;
    },

    set(key, value) {
      Zotero.Prefs.set?.(key, value, true);
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
