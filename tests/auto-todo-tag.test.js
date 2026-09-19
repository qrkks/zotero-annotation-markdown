import { describe, expect, test, vi } from "vitest";

import { hasTodoDirective, registerAutoTodoTagger } from "../src/auto-todo-tag.ts";

const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

describe("automatic annotation todo tag", () => {
  test("matches a line-leading todo directive in any letter case", () => {
    for (const comment of [
      "todo: read", "TODO: read", "Todo：读完", "Note\n  tOdO：再核对"
    ]) {
      expect(hasTodoDirective(comment)).toBe(true);
    }
    for (const comment of ["A todo: example in prose", "`todo:` is syntax", "todoo: read", "todo read", "todo读完"]) {
      expect(hasTodoDirective(comment)).toBe(false);
    }
  });

  test("adds one lowercase tag after a saved annotation change and avoids a notification loop", async () => {
    let notify;
    const tags = [];
    const item = {
      isAnnotation: () => true,
      annotationComment: "TODO: check this",
      getTags: () => tags.map(tag => ({ tag })),
      addTag: vi.fn(tag => { tags.push(tag); return true; }),
      saveTx: vi.fn(async () => notify("modify", "item", [7], { 7: { changed: { tags: [] } } }))
    };
    const unregisterObserver = vi.fn();
    const Zotero = {
      Items: { getAsync: vi.fn(async () => item) },
      Notifier: {
        registerObserver: vi.fn(observer => { notify = observer.notify; return "observer-1"; }),
        unregisterObserver
      }
    };
    const stop = registerAutoTodoTagger({ Zotero, isEnabled: () => true, warn: vi.fn() });

    notify("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();

    expect(item.addTag).toHaveBeenCalledExactlyOnceWith("todo");
    expect(item.saveTx).toHaveBeenCalledTimes(1);
    expect(tags).toEqual(["todo"]);
    stop();
    expect(unregisterObserver).toHaveBeenCalledWith("observer-1");
  });

  test("skips disabled mode, non-annotations, and an existing tag in another case", async () => {
    let notify;
    let enabled = false;
    const item = {
      isAnnotation: vi.fn(() => true),
      annotationComment: "todo: check this",
      getTags: vi.fn(() => [{ tag: "TODO" }]),
      addTag: vi.fn(),
      saveTx: vi.fn()
    };
    const Zotero = {
      Items: { getAsync: vi.fn(async () => item) },
      Notifier: {
        registerObserver: vi.fn(observer => { notify = observer.notify; return "observer-1"; }),
        unregisterObserver: vi.fn()
      }
    };
    const stop = registerAutoTodoTagger({ Zotero, isEnabled: () => enabled, warn: vi.fn() });

    notify("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();
    expect(Zotero.Items.getAsync).not.toHaveBeenCalled();

    enabled = true;
    notify("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();
    expect(item.addTag).not.toHaveBeenCalled();

    item.getTags.mockReturnValue([]);
    item.isAnnotation.mockReturnValue(false);
    notify("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();
    expect(item.addTag).not.toHaveBeenCalled();

    stop();
    notify("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();
    expect(item.addTag).not.toHaveBeenCalled();
  });

  test("ignores tag-only changes so manual tag removal stays removed", async () => {
    let notify;
    const item = {
      isAnnotation: () => true,
      annotationComment: "todo: check this",
      getTags: () => [],
      addTag: vi.fn(() => true),
      saveTx: vi.fn(async () => true)
    };
    const Zotero = {
      Items: { getAsync: vi.fn(async () => item) },
      Notifier: {
        registerObserver: vi.fn(observer => { notify = observer.notify; return "observer-1"; }),
        unregisterObserver: vi.fn()
      }
    };
    const stop = registerAutoTodoTagger({ Zotero, isEnabled: () => true, warn: vi.fn() });

    notify("modify", "item", [7], { 7: { changed: { tags: [{ tag: "todo" }] } } });
    await settle();
    expect(Zotero.Items.getAsync).not.toHaveBeenCalled();

    notify("add", "item", [7]);
    await settle();
    expect(item.addTag).toHaveBeenCalledExactlyOnceWith("todo");
    stop();
  });

  test("cleans a lowercase todo tag only after a comment change when opted in", async () => {
    let notify;
    let taggingEnabled = true;
    let cleanupEnabled = false;
    const tags = ["todo"];
    const item = {
      isAnnotation: () => true,
      annotationComment: "Finished reading",
      getTags: () => tags.map(tag => ({ tag })),
      addTag: vi.fn(),
      removeTag: vi.fn(tag => {
        tags.splice(tags.indexOf(tag), 1);
        return true;
      }),
      saveTx: vi.fn(async () => notify("modify", "item", [7], { 7: { changed: { tags: [] } } }))
    };
    const Zotero = {
      Items: { getAsync: vi.fn(async () => item) },
      Notifier: {
        registerObserver: vi.fn(observer => { notify = observer.notify; return "observer-1"; }),
        unregisterObserver: vi.fn()
      }
    };
    const stop = registerAutoTodoTagger({
      Zotero,
      isEnabled: () => taggingEnabled,
      isCleanupEnabled: () => cleanupEnabled,
      warn: vi.fn()
    });
    const commentChange = { 7: { changed: { annotationComment: "todo: read" } } };

    notify("modify", "item", [7], commentChange);
    await settle();
    expect(item.removeTag).not.toHaveBeenCalled();

    cleanupEnabled = true;
    notify("modify", "item", [7], { 7: { changed: { annotationComment: "Earlier unrelated comment" } } });
    await settle();
    expect(item.removeTag).not.toHaveBeenCalled();

    notify("modify", "item", [7], commentChange);
    await settle();
    expect(item.removeTag).toHaveBeenCalledExactlyOnceWith("todo");
    expect(item.saveTx).toHaveBeenCalledTimes(1);
    expect(tags).toEqual([]);

    tags.push("todo");
    notify("modify", "item", [7], { 7: { changed: { tags: [] } } });
    await settle();
    expect(tags).toEqual(["todo"]);

    taggingEnabled = false;
    notify("modify", "item", [7], commentChange);
    await settle();
    expect(tags).toEqual(["todo"]);
    stop();
  });

  test("cleanup leaves uppercase tags and newly added annotations untouched", async () => {
    let notify;
    const tags = ["TODO"];
    const item = {
      isAnnotation: () => true,
      annotationComment: "Finished reading",
      getTags: () => tags.map(tag => ({ tag })),
      addTag: vi.fn(),
      removeTag: vi.fn(),
      saveTx: vi.fn()
    };
    const Zotero = {
      Items: { getAsync: vi.fn(async () => item) },
      Notifier: {
        registerObserver: vi.fn(observer => { notify = observer.notify; return "observer-1"; }),
        unregisterObserver: vi.fn()
      }
    };
    const stop = registerAutoTodoTagger({
      Zotero,
      isEnabled: () => true,
      isCleanupEnabled: () => true,
      warn: vi.fn()
    });

    notify("modify", "item", [7], { 7: { changed: { annotationComment: "TODO: read" } } });
    await settle();
    expect(item.removeTag).not.toHaveBeenCalled();

    tags.splice(0, 1, "todo");
    notify("add", "item", [7]);
    await settle();
    expect(item.removeTag).not.toHaveBeenCalled();
    stop();
  });
});
