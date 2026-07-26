import { createAnnotationSidebarAdapter } from "./annotation-sidebar-adapter.js";
import type { AnnotationSidebarAdapter } from "./annotation-sidebar-adapter.js";
import { createMarkdownRenderer } from "./markdown-renderer.js";
import { createReaderController } from "./reader-controller.js";
import { createReaderRegistry } from "./reader-registry.js";
import type {
  MarkdownRenderer,
  PreferenceStore,
  PreferenceValue,
  ReaderController
} from "./types.js";
import {
  createSettings,
  ENABLED_PREF_KEY,
  FONT_SCALE_PERCENT_PREF_KEY,
  LIGHTWEIGHT_MODE_PREF_KEY,
  MATH_ENABLED_PREF_KEY,
  PERFORMANCE_DIAGNOSTICS_PREF_KEY,
  RENDER_STRATEGY_PREF_KEY
} from "./settings.js";
import type { Settings } from "./settings.js";

export const PLUGIN_ID = "annotation-markdown@local";
const READER_EVENT = "renderSidebarAnnotationHeader";

interface ReaderLike {
  document?: Document | null;
  window?: Window | null;
  _iframeWindow?: Window | null;
}

interface PluginRegistry {
  register(reader: ReaderLike | null | undefined): void | PromiseLike<void>;
  shutdown(): void;
  refresh?(): void;
}

type ReaderEventHandler = (event: unknown) => void | PromiseLike<void>;
type ReaderSource = Iterable<ReaderLike | null | undefined> | ArrayLike<ReaderLike | null | undefined>;

interface ZoteroReaderApi {
  getOpenReaders?(): ReaderSource;
  _readers?:
    | Map<unknown, ReaderLike | null | undefined>
    | Array<ReaderLike | null | undefined>;
  registerEventListener?(
    eventName: string,
    handler: ReaderEventHandler,
    pluginId: string
  ): void;
  unregisterEventListener?(eventName: string, handler: ReaderEventHandler): void;
}

interface ZoteroPrefsApi {
  get?(key: string, global: boolean): unknown;
  set?(key: string, value: PreferenceValue, global: boolean): void;
  registerObserver?(
    key: string,
    refresh: () => void,
    global: boolean
  ): unknown;
  unregisterObserver?(observerId: unknown): void;
}

interface ZoteroApi {
  Reader?: ZoteroReaderApi;
  Prefs?: ZoteroPrefsApi;
  debug?(message: string): void;
  launchURL?(url: string): void;
}

interface Diagnostics {
  append?(message: string): void;
}

interface Logger {
  log?(message: string): void;
  warn?(message: string, error?: unknown): void;
}

interface CreatePluginOptions {
  Zotero?: ZoteroApi;
  window?: Window;
  registryFactory?(): PluginRegistry;
  styleText?: string;
  logger?: Logger;
  diagnostics?: Diagnostics;
}

interface Plugin {
  startup(): Promise<void[]>;
  shutdown(): void;
}

interface PluginGlobals {
  Zotero?: ZoteroApi;
  ZoteroAnnotationMarkdownDiagnostics?: Diagnostics;
}

const pluginGlobals = globalThis as unknown as PluginGlobals;

interface CreateControllerOptions {
  reader: ReaderLike;
  adapter: AnnotationSidebarAdapter;
  renderer: MarkdownRenderer;
  settings: Settings;
  MutationObserver?: typeof MutationObserver;
  styleText: string;
  logger: Required<Logger>;
}

// The controller remains JS for now, so pin its public contract at this boundary.
const createController = createReaderController as unknown as (
  options: CreateControllerOptions
) => ReaderController;

export function createPlugin({
  Zotero = pluginGlobals.Zotero,
  window: windowRef = globalThis.window,
  registryFactory,
  styleText = "",
  logger = globalThis.console,
  diagnostics = pluginGlobals.ZoteroAnnotationMarkdownDiagnostics
}: CreatePluginOptions = {}): Plugin {
  let registry: PluginRegistry | undefined;
  let readerEventHandler: ReaderEventHandler | undefined;
  let preferenceObserverIds: unknown[] = [];
  const diagnosticsLogger = createLogger(Zotero, logger, diagnostics);

  function makeRegistry(): PluginRegistry {
    if (registryFactory) {
      return registryFactory();
    }

    const settings = createSettings({ prefs: createPrefsAdapter(Zotero) });
    return createReaderRegistry({
      controllerFactory(reader) {
        const readerWindow = getReaderWindow(reader) ?? windowRef;
        const readerDocument = getReaderDocument(reader) ?? readerWindow?.document;
        const launchURL = Zotero?.launchURL;
        return createController({
          reader,
          adapter: createAnnotationSidebarAdapter({
            document: readerDocument,
            openLink: typeof launchURL === "function"
              ? (url) => launchURL.call(Zotero, url)
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
      const activeRegistry = registry;
      preferenceObserverIds = registerPreferenceObservers(
        Zotero,
        () => activeRegistry.refresh?.()
      );

      const openReaders = collectOpenReaders(Zotero);
      diagnosticsLogger.log(`[annotation-markdown] found open readers: ${openReaders.length}`);

      const registrations = openReaders.map((reader) => activeRegistry.register(reader));

      if (Zotero?.Reader?.registerEventListener) {
        readerEventHandler = (event) => {
          // Zotero versions have emitted both a bare Reader and an event wrapper.
          const reader = unwrapReaderEvent(event);
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
        // Reader teardown must still run when Zotero rejects listener cleanup during shutdown.
        unregisterPreferenceObservers(Zotero, preferenceObserverIds);
        preferenceObserverIds = [];
        readerEventHandler = undefined;
        registry?.shutdown();
        registry = undefined;
      }
    }
  };
}

function registerPreferenceObservers(
  Zotero: ZoteroApi | undefined,
  refresh: () => void
): unknown[] {
  if (!Zotero?.Prefs?.registerObserver) {
    return [];
  }

  const observerIds: unknown[] = [];
  for (const key of [
    ENABLED_PREF_KEY,
    FONT_SCALE_PERCENT_PREF_KEY,
    MATH_ENABLED_PREF_KEY,
    LIGHTWEIGHT_MODE_PREF_KEY,
    PERFORMANCE_DIAGNOSTICS_PREF_KEY,
    RENDER_STRATEGY_PREF_KEY
  ]) {
    const observerId = Zotero.Prefs.registerObserver(key, refresh, true);
    if (observerId) {
      observerIds.push(observerId);
    }
  }
  return observerIds;
}

function unregisterPreferenceObservers(
  Zotero: ZoteroApi | undefined,
  observerIds: unknown[]
): void {
  if (!Zotero?.Prefs?.unregisterObserver) {
    return;
  }

  for (const observerId of observerIds) {
    Zotero.Prefs.unregisterObserver(observerId);
  }
}

function createLogger(
  Zotero: ZoteroApi | undefined,
  logger: Logger,
  diagnostics: Diagnostics | undefined
): Required<Logger> {
  return {
    log(message: string) {
      appendDiagnostic(diagnostics, message);
      if (Zotero?.debug) {
        Zotero.debug(message);
      } else {
        logger?.log?.(message);
      }
    },

    warn(message: string, error?: unknown) {
      const detail = describeError(error);
      appendDiagnostic(diagnostics, `${message}: ${detail}`);
      if (Zotero?.debug) {
        Zotero.debug(`${message}: ${detail}`);
      } else {
        logger?.warn?.(message, error);
      }
    }
  };
}

function appendDiagnostic(
  diagnostics: Diagnostics | undefined,
  message: string
): void {
  try {
    diagnostics?.append?.(message);
  } catch {
    // Diagnostics must never break plugin behavior.
  }
}

function createPrefsAdapter(Zotero: ZoteroApi | undefined): PreferenceStore | undefined {
  if (!Zotero?.Prefs) {
    return undefined;
  }
  const prefs = Zotero.Prefs;

  return {
    get(key: string, defaultValue?: PreferenceValue) {
      const value = prefs.get?.(key, true);
      return typeof value === typeof defaultValue ? value : defaultValue;
    },

    set(key: string, value: PreferenceValue) {
      prefs.set?.(key, value, true);
    }
  };
}

function collectOpenReaders(Zotero: ZoteroApi | undefined): ReaderLike[] {
  const readerApi = Zotero?.Reader;
  if (!readerApi) {
    return [];
  }

  // Prefer the public API, while retaining `_readers` for Zotero releases that lack it.
  if (typeof readerApi.getOpenReaders === "function") {
    return Array.from(readerApi.getOpenReaders()).filter(isPresent);
  }

  if (readerApi._readers instanceof Map) {
    return Array.from(readerApi._readers.values()).filter(isPresent);
  }

  if (Array.isArray(readerApi._readers)) {
    return readerApi._readers.filter(isPresent);
  }

  return [];
}

function unwrapReaderEvent(event: unknown): ReaderLike | null | undefined {
  if (typeof event === "object" && event !== null && "reader" in event) {
    return (event as { reader?: ReaderLike | null }).reader;
  }
  return event as ReaderLike | null | undefined;
}

function getReaderWindow(reader: ReaderLike): Window | null {
  return (
    reader?.window ??
    reader?._iframeWindow ??
    reader?.document?.defaultView ??
    null
  );
}

function getReaderDocument(reader: ReaderLike): Document | null {
  return (
    reader?.document ??
    reader?.window?.document ??
    reader?._iframeWindow?.document ??
    null
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}
