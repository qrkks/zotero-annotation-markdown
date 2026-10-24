/** Keep a Zotero annotation's todo tags in step with saved comment directives. */
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
  /** Controls additions only; cleanup is independent. */
  isEnabled(): boolean;
  isCleanupEnabled?(): boolean;
  warn(message: string, error: unknown): void;
}

const TODO_TAG = "todo";

/** Normalize the directive prefix, preserving category spelling and case. */
export function getTodoDirectiveTags(comment: string): Set<string> {
  const tags = new Set<string>();
  for (const match of comment.matchAll(/^[ \t]*(?:todo|t)(\/[^:：\r\n]*)?[:：]/gim)) {
    const path = match[1]?.slice(1).split("/").map(segment => segment.trim());
    // Empty categories, repeated slashes and trailing slashes are incomplete directives.
    if (path?.some(segment => !segment)) continue;
    tags.add(TODO_TAG);
    if (path) tags.add(`${TODO_TAG}/${path.join("/")}`);
  }
  return tags;
}

export function hasTodoDirective(comment: string): boolean {
  return getTodoDirectiveTags(comment).size > 0;
}

interface PendingItem {
  requested: boolean;
  cleanupCandidates: Set<string>;
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
  const pending = new Map<string, PendingItem>();

  async function processItem(id: number | string, cleanupCandidates: Set<string>): Promise<void> {
    const item = await Zotero!.Items!.getAsync(id);
    if (!active || (!isEnabled() && !isCleanupEnabled()) || !item || !item.isAnnotation()) {
      return;
    }

    const tags = item.getTags();
    const wanted = getTodoDirectiveTags(item.annotationComment ?? "");
    let changed = false;
    if (isEnabled()) {
      for (const tag of wanted) {
        const exists = tags.some(existing => tag === TODO_TAG
          ? existing.tag.toLowerCase() === TODO_TAG
          : existing.tag === tag);
        if (!exists && item.addTag(tag)) changed = true;
      }
    }
    if (isCleanupEnabled()) {
      for (const tag of cleanupCandidates) {
        if (!wanted.has(tag) && tags.some(existing => existing.tag === tag) && item.removeTag(tag)) {
          changed = true;
        }
      }
    }
    if (changed) await item.saveTx();
  }

  async function processPending(
    id: number | string,
    key: string,
    state: PendingItem
  ): Promise<void> {
    try {
      do {
        state.requested = false;
        const cleanupCandidates = new Set(state.cleanupCandidates);
        state.cleanupCandidates.clear();
        try {
          await processItem(id, cleanupCandidates);
        } catch (error) {
          warn(`Could not update ${TODO_TAG} tag on annotation ${key}`, error);
        }
      } while (active && state.requested);
    } finally {
      pending.delete(key);
    }
  }

  function schedule(id: number | string, cleanupCandidates: Set<string>): void {
    const key = String(id);
    const current = pending.get(key);
    if (current) {
      current.requested = true;
      for (const tag of cleanupCandidates) current.cleanupCandidates.add(tag);
      return;
    }

    const state = { requested: false, cleanupCandidates };
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
      if (!active || (!isEnabled() && !isCleanupEnabled()) || type !== "item" ||
          (event !== "add" && event !== "modify")) {
        return;
      }
      for (const id of ids) {
        // A tag-only save must not undo the user's manual removal of todo.
        if (event === "modify" && !Object.hasOwn(extraData?.[String(id)]?.changed ?? {}, "annotationComment")) {
          continue;
        }
        const previousComment = extraData?.[String(id)]?.changed?.annotationComment;
        const cleanupCandidates = event === "modify" && typeof previousComment === "string"
          ? getTodoDirectiveTags(previousComment)
          : new Set<string>();
        if (isEnabled() || (isCleanupEnabled() && cleanupCandidates.size > 0)) {
          schedule(id, cleanupCandidates);
        }
      }
    }
  }, ["item"], "annotation-markdown-auto-todo-tag");

  return () => {
    active = false;
    pending.clear();
    Zotero.Notifier?.unregisterObserver(observerId);
  };
}
