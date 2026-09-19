/** Keep a Zotero annotation's todo tag in step with saved comment directives. */
interface AnnotationItem {
  isAnnotation(): boolean;
  annotationComment: string;
  getTags(): Array<{ tag: string }>;
  addTag(tag: string): boolean;
  removeTag(tag: string): boolean;
  saveTx(): Promise<unknown>;
}

export interface ZoteroTagApi {
  Items?: {
    getAsync(id: number | string): Promise<AnnotationItem | false>;
  };
  Notifier?: {
    registerObserver(
      observer: {
        notify(
          event: string,
          type: string,
          ids: Array<number | string>,
          extraData?: Record<string, { changed?: Record<string, unknown> }>
        ): void
      },
      types: string[],
      id: string
    ): string;
    unregisterObserver(id: string): void;
  };
}

interface AutoTodoTagOptions {
  Zotero?: ZoteroTagApi;
  isEnabled(): boolean;
  isCleanupEnabled?(): boolean;
  warn(message: string, error: unknown): void;
}

const TODO_TAG = "todo";
const TODO_DIRECTIVE = /^[ \t]*todo[:：]/im;

export function hasTodoDirective(comment: string): boolean {
  return TODO_DIRECTIVE.test(comment);
}

/** Observe actual Zotero item saves, independent of Reader rendering or editor choice. */
export function registerAutoTodoTagger({
  Zotero,
  isEnabled,
  isCleanupEnabled = () => false,
  warn
}: AutoTodoTagOptions): () => void {
  if (!Zotero?.Items?.getAsync || !Zotero.Notifier?.registerObserver) {
    return () => {};
  }

  let active = true;
  const pending = new Map<string, { requested: boolean; cleanupRequested: boolean }>();

  async function processItem(id: number | string, allowCleanup: boolean): Promise<void> {
    const item = await Zotero!.Items!.getAsync(id);
    if (!active || !isEnabled() || !item || !item.isAnnotation()) {
      return;
    }

    const tags = item.getTags();
    if (hasTodoDirective(item.annotationComment ?? "")) {
      if (!tags.some(({ tag }) => tag.toLowerCase() === TODO_TAG) && item.addTag(TODO_TAG)) {
        await item.saveTx();
      }
    } else if (allowCleanup && isCleanupEnabled() &&
               tags.some(({ tag }) => tag === TODO_TAG) && item.removeTag(TODO_TAG)) {
      await item.saveTx();
    }
  }

  async function processPending(
    id: number | string,
    key: string,
    state: { requested: boolean; cleanupRequested: boolean }
  ): Promise<void> {
    try {
      do {
        state.requested = false;
        const allowCleanup = state.cleanupRequested;
        state.cleanupRequested = false;
        try {
          await processItem(id, allowCleanup);
        } catch (error) {
          warn(`Could not update ${TODO_TAG} tag on annotation ${key}`, error);
        }
      } while (active && state.requested);
    } finally {
      pending.delete(key);
    }
  }

  function schedule(id: number | string, allowCleanup: boolean): void {
    const key = String(id);
    const current = pending.get(key);
    if (current) {
      current.requested = true;
      current.cleanupRequested ||= allowCleanup;
      return;
    }

    const state = { requested: false, cleanupRequested: allowCleanup };
    pending.set(key, state);
    // Start after the current Zotero notifier dispatch has returned.
    setTimeout(() => {
      if (!active) {
        pending.delete(key);
        return;
      }
      void processPending(id, key, state);
    }, 0);
  }

  const observerId = Zotero.Notifier.registerObserver({
    notify(event, type, ids, extraData) {
      if (!active || !isEnabled() || type !== "item" ||
          (event !== "add" && event !== "modify")) {
        return;
      }
      for (const id of ids) {
        // A tag-only save must not undo the user's manual removal of todo.
        if (event === "modify" && !Object.hasOwn(extraData?.[String(id)]?.changed ?? {}, "annotationComment")) {
          continue;
        }
        const previousComment = extraData?.[String(id)]?.changed?.annotationComment;
        schedule(id, event === "modify" &&
          typeof previousComment === "string" && hasTodoDirective(previousComment));
      }
    }
  }, ["item"], "annotation-markdown-auto-todo-tag");

  return () => {
    active = false;
    pending.clear();
    Zotero.Notifier?.unregisterObserver(observerId);
  };
}
