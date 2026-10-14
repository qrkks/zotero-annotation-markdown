/** Coalesce only Zotero 10's native request to restore an existing Reader tab. */
interface Tab { id: string; type?: string; title?: string; data?: { itemID?: number; secondViewState?: unknown } }
interface HostWindow { closed?: boolean; Zotero_Tabs?: { _tabs?: Tab[] } }
interface LoadedReader {
  itemID?: number; tabID?: string; _window?: HostWindow; _isTabClosed?: boolean;
  _isUninitialized?: boolean; _initPromise?: PromiseLike<unknown>;
}
export interface ReaderTabLoadHost {
  version?: string;
  Reader?: { open?(...args: unknown[]): unknown; _readers?: unknown };
  getMainWindow?(): HostWindow | null;
  Notifier?: {
    registerObserver?(observer: { notify(event: string, type: string, ids: unknown[]): void }, types: string[], name: string): unknown;
    unregisterObserver?(id: unknown): void;
  };
}
interface Options { host?: ReaderTabLoadHost; isEnabled(): boolean; logger?: { log?(message: string): void; warn?(message: string, error?: unknown): void } }
interface Load { itemID: number; options: Record<string, unknown>; result: unknown; reader?: LoadedReader }
const OPTION_KEYS = new Set(["tabID", "title", "tabIndex", "allowDuplicate", "preventJumpback", "secondViewState", "openInBackground", "openInWindow"]);

export function createReaderTabLoadManager({ host, isEnabled, logger }: Options) {
  let active = false, generation = 0, observerID: unknown;
  let restore: (() => void) | undefined;
  let failedReaders = new WeakSet<object>();
  const loads = new Map<HostWindow, Map<string, Load>>();
  let coalesced = 0, reused = 0;
  function forget(win: HostWindow, id: string, load: Load) {
    const entries = loads.get(win);
    if (entries?.get(id) !== load) return;
    entries.delete(id); if (!entries.size) loads.delete(win);
  }
  function liveTab(win: HostWindow, id: string, itemID: number) {
    return !win.closed && win.Zotero_Tabs?._tabs?.find(tab => tab.id === id && tab.data?.itemID === itemID
      && ["reader", "reader-loading", "reader-unloaded"].includes(tab.type ?? ""));
  }
  function prune() {
    for (const [win, entries] of loads) for (const [id, load] of entries) {
      if (!liveTab(win, id, load.itemID) || load.reader?._isTabClosed || load.reader?._isUninitialized) forget(win, id, load);
    }
  }
  function stop() {
    active = false; generation++; loads.clear(); failedReaders = new WeakSet();
    try { restore?.(); } catch (error) { logger?.warn?.("[annotation-markdown] tab load hook cleanup skipped", error); }
    restore = undefined;
    if (observerID !== undefined) {
      try { host?.Notifier?.unregisterObserver?.(observerID); } catch (error) { logger?.warn?.("[annotation-markdown] tab load observer cleanup skipped", error); }
      observerID = undefined;
    }
  }
  function refresh() {
    if (!isEnabled()) { if (active) stop(); return; }
    if (active || !host?.version?.startsWith("10.") || !host.getMainWindow) return;
    const api = host.Reader, original = api?.open;
    if (!api || typeof original !== "function" || !Array.isArray(api._readers)) return;
    const descriptor = Object.getOwnPropertyDescriptor(api, "open");
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) return;
    if (!descriptor && !Object.isExtensible(api)) return;
    const hookGeneration = generation;
    function request(args: unknown[]) {
      const [itemID, location, rawOptions] = args;
      if (args.length !== 3 || !Number.isSafeInteger(itemID) || (itemID as number) <= 0 || location != null
        || !rawOptions || typeof rawOptions !== "object") return;
      const descriptors = Object.getOwnPropertyDescriptors(rawOptions);
      if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || !OPTION_KEYS.has(key)
        || descriptors[key].get || descriptors[key].set)) return;
      const options = Object.fromEntries(Object.entries(descriptors).map(([key, value]) => [key, value.value]));
      if (options.allowDuplicate !== true || options.preventJumpback !== true || options.openInWindow
        || typeof options.tabID !== "string" || !options.tabID) return;
      const win = host!.getMainWindow!();
      const tab = win && liveTab(win, options.tabID, itemID as number);
      if (!tab || (options.title !== undefined && options.title !== tab.title)
        || (options.tabIndex !== undefined && options.tabIndex !== win!.Zotero_Tabs!._tabs!.indexOf(tab))
        || options.secondViewState !== tab.data?.secondViewState) return;
      return { win: win!, id: options.tabID, itemID: itemID as number, options };
    }
    const wrapper = function(this: unknown, ...args: unknown[]) {
      // A foreign wrapper can retain an old hook across disable/re-enable.
      // Its generation must stay inactive even when this manager is rearmed.
      if (!active || hookGeneration !== generation || !isEnabled() || this !== api) return Reflect.apply(original, this, args);
      let eligible: ReturnType<typeof request>;
      try {
        eligible = request(args);
      } catch (error) {
        logger?.warn?.("[annotation-markdown] tab load capability probe skipped", error);
      }
      // Keep invocation outside the capability-probe catch: a native exception
      // must propagate once, never cause the same mutation to be retried.
      if (!eligible) return Reflect.apply(original, this, args);
      const { win: targetWindow, id, itemID, options: values } = eligible;
      prune();
      const pending = loads.get(targetWindow)?.get(id);
      if (pending && pending.itemID === itemID && Object.keys(values).length === Object.keys(pending.options).length
        && Object.entries(values).every(([key, value]) => pending.options[key] === value)) {
        coalesced++; logger?.log?.("[annotation-markdown] coalesced repeated native Reader tab load"); return pending.result;
      }
      // A native tab load can be requested again after open() returns but before
      // initialization finishes. Never reuse another tab of the same document.
      const existing = values.secondViewState == null && (api._readers as LoadedReader[]).find(reader =>
        reader?.itemID === itemID && reader.tabID === id && reader._window === targetWindow
        && reader._isTabClosed === false && !reader._isUninitialized && !failedReaders.has(reader));
      if (existing) {
        reused++; logger?.log?.("[annotation-markdown] reused native Reader for repeated tab load"); return Promise.resolve(existing);
      }
      let resolveReentry!: (result: unknown) => void, rejectReentry!: (error: unknown) => void;
      const reentry = new Promise((resolve, reject) => { resolveReentry = resolve; rejectReentry = reject; });
      void reentry.catch(() => {});
      const load: Load = { itemID: itemID as number, options: values, result: reentry };
      const entries = loads.get(targetWindow) ?? new Map<string, Load>();
      entries.set(id, load); loads.set(targetWindow, entries);
      const ownGeneration = generation;
      try {
        load.result = Reflect.apply(original, this, args); resolveReentry(load.result);
      } catch (error) { rejectReentry(error); forget(targetWindow, id, load); throw error; }
      void Promise.resolve(load.result).then(result => {
        if (generation !== ownGeneration) return;
        load.reader = result as LoadedReader | undefined;
        return Promise.resolve(load.reader?._initPromise).then(
          () => { forget(targetWindow, id, load); },
          () => { if (generation === ownGeneration && load.reader) failedReaders.add(load.reader); forget(targetWindow, id, load); }
        );
      }, () => { forget(targetWindow, id, load); }).catch(() => { forget(targetWindow, id, load); });
      return load.result;
    };
    try {
      Object.defineProperty(api, "open", { configurable: true, writable: true, value: wrapper });
      restore = () => {
        if (api.open !== wrapper) return;
        if (descriptor) Object.defineProperty(api, "open", descriptor); else delete api.open;
      };
      active = true;
      observerID = host.Notifier?.registerObserver?.({ notify(event, type) { if (event === "close" && type === "tab") prune(); } }, ["tab"], "annotation-markdown-tab-load");
    } catch (error) { stop(); logger?.warn?.("[annotation-markdown] native tab load guard unavailable", error); }
  }
  return { refresh, stop, status() { return { active, pendingLoads: [...loads.values()].reduce((count, map) => count + map.size, 0), coalesced, reused }; } };
}
