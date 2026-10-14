/** Park a selected large Reader in Zotero's existing unloaded-tab path until our hooks are ready. */
export const STARTUP_SELECTION_KEY = "annotationMarkdownStartupSelection";
interface TabState { type?: string; selected?: boolean; data?: { itemID?: number }; [key: string]: unknown }
interface Selection { version: 1; itemID: number; readerIndex: number; libraryIndex: number; libraryHadSelected: boolean }
interface PaneState { type?: string; tabs?: TabState[]; [key: string]: unknown }
interface SessionState { windows?: PaneState[]; [key: string]: unknown }
interface NativeTab { id: string; type: string; data?: { itemID?: number } }
interface RestoreWindow {
  closed?: boolean;
  Zotero_Tabs?: { _tabs?: NativeTab[]; selectedID?: string; select?(id: string): unknown };
  setTimeout(callback: () => void, milliseconds: number): number;
  clearTimeout(id: number): void;
  requestAnimationFrame?(callback: () => void): number;
  cancelAnimationFrame?(id: number): void;
  addEventListener?(type: string, callback: () => void, capture: boolean): void;
  removeEventListener?(type: string, callback: () => void, capture: boolean): void;
}
export interface StartupSessionHost {
  version?: string;
  Profile?: { dir?: string };
  File?: { putContentsAsync?(...args: unknown[]): unknown };
  Session?: { state?: SessionState; save?(): unknown };
  getMainWindows?(): RestoreWindow[];
  getMainWindow?(): RestoreWindow | null;
}
interface Options {
  host?: StartupSessionHost;
  isEnabled(): boolean;
  getAnnotationCount(itemID: number): number;
  logger?: { log?(message: string): void; warn?(message: string, error?: unknown): void };
}

function selection(pane: PaneState): Selection | undefined {
  if (!pane || typeof pane !== "object") return;
  const value = pane[STARTUP_SELECTION_KEY] as Selection | undefined;
  if (value?.version !== 1 || !Array.isArray(pane.tabs) || !Number.isSafeInteger(value.itemID)
    || value.itemID <= 0 || !Number.isInteger(value.readerIndex) || !Number.isInteger(value.libraryIndex)
    || typeof value.libraryHadSelected !== "boolean") return;
  if (pane.tabs[value.readerIndex]?.type !== "reader"
    || pane.tabs[value.readerIndex]?.data?.itemID !== value.itemID
    || pane.tabs[value.libraryIndex]?.type !== "library") return;
  return value;
}

function unmask(pane: PaneState, value: Selection) {
  pane.tabs![value.readerIndex].selected = true;
  if (value.libraryHadSelected) pane.tabs![value.libraryIndex].selected = false;
  else delete pane.tabs![value.libraryIndex].selected;
  delete pane[STARTUP_SELECTION_KEY];
}

/** Change only serialized selection flags; never mutate the live tab list or Reader state. */
export function deferSavedReaderSelection(content: string, getCount: (id: number) => number): string {
  try {
    const state = JSON.parse(content) as SessionState;
    if (!Array.isArray(state?.windows)) return content;
    let changed = false;
    for (const pane of state.windows) {
      if (pane?.type !== "pane" || !Array.isArray(pane.tabs) || STARTUP_SELECTION_KEY in pane) continue;
      const selected = pane.tabs.map((tab, index) => tab?.selected === true ? index : -1).filter(index => index >= 0);
      if (selected.length !== 1) continue;
      const readerIndex = selected[0], reader = pane.tabs[readerIndex];
      const libraryIndex = pane.tabs.findIndex(tab => tab?.type === "library");
      const itemID = reader?.data?.itemID;
      if (reader?.type !== "reader" || libraryIndex < 0 || !Number.isSafeInteger(itemID) || !itemID || itemID <= 0) continue;
      let count;
      try { count = getCount(itemID); } catch { continue; }
      if (!Number.isFinite(count) || count < 100) continue;
      pane[STARTUP_SELECTION_KEY] = { version: 1, itemID, readerIndex, libraryIndex,
        libraryHadSelected: Object.hasOwn(pane.tabs[libraryIndex], "selected") } satisfies Selection;
      delete reader.selected;
      pane.tabs[libraryIndex].selected = true;
      changed = true;
    }
    return changed ? JSON.stringify(state) : content;
  } catch { return content; }
}

export function restoreSavedReaderSelection(content: string): string {
  try {
    const state = JSON.parse(content) as SessionState;
    if (!Array.isArray(state?.windows)) return content;
    let changed = false;
    for (const pane of state.windows) {
      const value = selection(pane);
      if (value) { unmask(pane, value); changed = true; }
    }
    return changed ? JSON.stringify(state) : content;
  } catch { return content; }
}

function normalizedPath(value: string) {
  const path = value.replaceAll("\\", "/");
  return /^[a-z]:\//i.test(path) ? path.toLowerCase() : path;
}

export function createReaderStartupSessionManager({ host, isEnabled, getAnnotationCount, logger }: Options) {
  let active = false, generation = 0;
  let restoration: Promise<void> | undefined;
  let restoreWriter: (() => void) | undefined;
  const cancellations = new Set<() => void>();
  function stop(applicationShutdown = false) {
    generation++;
    restoration = undefined;
    for (const cancel of [...cancellations]) cancel();
    const wasActive = active;
    active = false;
    try { restoreWriter?.(); } catch (error) { logger?.warn?.("[annotation-markdown] session hook cleanup skipped", error); }
    restoreWriter = undefined;
    // A disable/hot replacement writes the native current selection back. At
    // application shutdown keep the parked selection for the next launch.
    if (wasActive && !applicationShutdown) {
      try { Promise.resolve(host?.Session?.save?.()).catch(error => logger?.warn?.("[annotation-markdown] native session save failed", error)); }
      catch (error) { logger?.warn?.("[annotation-markdown] native session save failed", error); }
    }
  }

  function refresh() {
    if (!isEnabled()) { if (active) stop(); return; }
    if (active || !host?.version?.startsWith("10.") || !host.Profile?.dir || !host.File?.putContentsAsync) return;
    const file = host.File, original = file.putContentsAsync!;
    const descriptor = Object.getOwnPropertyDescriptor(file, "putContentsAsync");
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) return;
    if (!descriptor && !Object.isExtensible(file)) return;
    const target = normalizedPath(host.Profile.dir.replace(/[\\/]+$/, "") + "/session.json");
    const wrapper = function(this: unknown, ...args: unknown[]) {
      if (active && isEnabled() && typeof args[0] === "string" && normalizedPath(args[0]) === target && typeof args[1] === "string") {
        args[1] = deferSavedReaderSelection(args[1], getAnnotationCount);
      }
      return Reflect.apply(original, this, args);
    };
    try {
      Object.defineProperty(file, "putContentsAsync", { configurable: true, writable: true, value: wrapper });
      restoreWriter = () => {
        if (file.putContentsAsync !== wrapper) return;
        if (descriptor) Object.defineProperty(file, "putContentsAsync", descriptor);
        else delete file.putContentsAsync;
      };
      active = true;
    } catch (error) { logger?.warn?.("[annotation-markdown] startup session hook unavailable", error); }
  }

  function restoredTab(tabs: RestoreWindow["Zotero_Tabs"], value: Selection) {
    const indexed = tabs?._tabs?.[value.readerIndex];
    if (indexed?.data?.itemID === value.itemID) return indexed;
    const matches = tabs?._tabs?.filter(tab => tab.data?.itemID === value.itemID) ?? [];
    return matches.length === 1 ? matches[0] : undefined;
  }
  async function restorePending() {
    const ownGeneration = generation;
    const panes = host?.Session?.state?.windows;
    const pending = Array.isArray(panes) ? panes.filter(pane => pane?.type === "pane" && selection(pane)) : [];
    if (!pending.length) return;
    const used = new Set<RestoreWindow>();
    for (const pane of pending) {
      const value = selection(pane)!;
      let win: RestoreWindow | undefined, cancelled = false;
      const cancelIntent = () => { cancelled = true; };
      try {
        // Tabs restore asynchronously. Poll only until this exact saved tab is
        // present, then give the library UI two frame opportunities.
        for (let attempt = 0; attempt < 100 && generation === ownGeneration; attempt++) {
          const windows = host?.getMainWindows?.() ?? [host?.getMainWindow?.()].filter(Boolean) as RestoreWindow[];
          win = windows.find(candidate => !candidate.closed && !used.has(candidate)
            && restoredTab(candidate.Zotero_Tabs, value));
          if (win) break;
          const timerWindow = windows.find(candidate => !candidate.closed);
          if (!timerWindow) break;
          await new Promise<void>(resolve => {
            const cancel = () => { timerWindow.clearTimeout(id); cancellations.delete(cancel); resolve(); };
            const id = timerWindow.setTimeout(cancel, 50); cancellations.add(cancel);
          });
        }
        if (!win || generation !== ownGeneration) return;
        used.add(win);
        const tabs = win.Zotero_Tabs!;
        if (tabs.selectedID !== "zotero-pane") { unmask(pane, value); continue; }
        for (const type of ["pointerdown", "keydown"]) win.addEventListener?.(type, cancelIntent, true);
        for (let frame = 0; frame < 2 && !cancelled && generation === ownGeneration; frame++) {
          await new Promise<void>(resolve => {
            const finish = () => { cancellations.delete(cancel); resolve(); };
            const cancel = () => {
              if (win!.cancelAnimationFrame && win!.requestAnimationFrame) win!.cancelAnimationFrame(id);
              else win!.clearTimeout(id);
              finish();
            };
            const id = win!.requestAnimationFrame ? win!.requestAnimationFrame(finish) : win!.setTimeout(finish, 16);
            cancellations.add(cancel);
          });
        }
        const target = restoredTab(tabs, value);
        if (generation !== ownGeneration) return;
        if (!cancelled && tabs.selectedID === "zotero-pane" && target
          && ["reader-unloaded", "reader-loading", "reader"].includes(target.type) && tabs.select) {
          tabs.select(target.id);
          logger?.log?.("[annotation-markdown] restored deferred large Reader after startup hooks");
        }
        unmask(pane, value);
      } catch (error) { logger?.warn?.("[annotation-markdown] deferred Reader selection unavailable", error); }
      finally { for (const type of ["pointerdown", "keydown"]) win?.removeEventListener?.(type, cancelIntent, true); }
    }
  }
  function restore() {
    if (restoration) return restoration;
    const pending = restorePending().finally(() => { if (restoration === pending) restoration = undefined; });
    restoration = pending;
    return pending;
  }
  return { refresh, restore, stop };
}
