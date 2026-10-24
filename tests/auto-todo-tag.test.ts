import { type ZoteroTagApi, getTodoDirectiveTags, hasTodoDirective, registerAutoTodoTagger } from "../src/auto-todo-tag.ts";
import { describe, expect, test, vi } from "vitest";
import { requireValue } from "./helpers/dom.ts";

type Notifier = NonNullable<ZoteroTagApi["Notifier"]>;
type Notify = Parameters<Notifier["registerObserver"]>[0]["notify"];

const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

describe("automatic annotation todo tag", () => {
  test("matches line-leading todo and t directives in any letter case", () => {
    for (const comment of [
      "todo: read", "TODO: read", "Todo：读完", "Note\n  tOdO：再核对",
      "t: read", "T：读完", "Note\n  t：再核对"
    ]) {
      expect(hasTodoDirective(comment)).toBe(true);
    }
    for (const comment of [
      "A todo: example in prose", "`todo:` is syntax", "todoo: read", "todo read", "todo读完",
      "A t: example in prose", "`t:` is syntax", "tt: read", "to: read", "t read", "t读完"
    ]) {
      expect(hasTodoDirective(comment)).toBe(false);
    }
  });

  test("adds one lowercase tag after a saved annotation change and avoids a notification loop", async () => {
    let notify: Notify | undefined;
    const tags: Array<string> = [];
    const item = {
      removeTag: vi.fn(),
      isAnnotation: () => true,
      annotationComment: "T：check this",
      getTags: () => tags.map(tag => ({ tag })),
      addTag: vi.fn(tag => { tags.push(tag); return true; }),
      saveTx: vi.fn(async () => requireValue(notify)("modify", "item", [7], { 7: { changed: { tags: [] } } }))
    };
    const unregisterObserver = vi.fn();
    const Zotero = {
      Items: { getAsync: vi.fn(async () => item) },
      Notifier: {
        registerObserver: vi.fn<Notifier["registerObserver"]>(observer => { notify = observer.notify; return "observer-1"; }),
        unregisterObserver
      }
    };
    const stop = registerAutoTodoTagger({ Zotero, isEnabled: () => true, warn: vi.fn() });

    requireValue(notify)("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();

    expect(item.addTag).toHaveBeenCalledExactlyOnceWith("todo");
    expect(item.saveTx).toHaveBeenCalledTimes(1);
    expect(tags).toEqual(["todo"]);
    stop();
    expect(unregisterObserver).toHaveBeenCalledWith("observer-1");
  });

  test("skips disabled mode, non-annotations, and an existing tag in another case", async () => {
    let notify: Notify | undefined;
    let enabled = false;
    const item = {
      removeTag: vi.fn(),
      isAnnotation: vi.fn(() => true),
      annotationComment: "todo: check this",
      getTags: vi.fn(() => [{ tag: "TODO" }]),
      addTag: vi.fn(),
      saveTx: vi.fn()
    };
    const Zotero = {
      Items: { getAsync: vi.fn(async () => item) },
      Notifier: {
        registerObserver: vi.fn<Notifier["registerObserver"]>(observer => { notify = observer.notify; return "observer-1"; }),
        unregisterObserver: vi.fn()
      }
    };
    const stop = registerAutoTodoTagger({ Zotero, isEnabled: () => enabled, warn: vi.fn() });

    requireValue(notify)("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();
    expect(Zotero.Items.getAsync).not.toHaveBeenCalled();

    enabled = true;
    requireValue(notify)("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();
    expect(item.addTag).not.toHaveBeenCalled();

    item.getTags.mockReturnValue([]);
    item.isAnnotation.mockReturnValue(false);
    requireValue(notify)("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();
    expect(item.addTag).not.toHaveBeenCalled();

    stop();
    requireValue(notify)("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();
    expect(item.addTag).not.toHaveBeenCalled();
  });

  test("ignores tag-only changes so manual tag removal stays removed", async () => {
    let notify: Notify | undefined;
    const item = {
      removeTag: vi.fn(),
      isAnnotation: () => true,
      annotationComment: "todo: check this",
      getTags: () => [],
      addTag: vi.fn(() => true),
      saveTx: vi.fn(async () => true)
    };
    const Zotero = {
      Items: { getAsync: vi.fn(async () => item) },
      Notifier: {
        registerObserver: vi.fn<Notifier["registerObserver"]>(observer => { notify = observer.notify; return "observer-1"; }),
        unregisterObserver: vi.fn()
      }
    };
    const stop = registerAutoTodoTagger({ Zotero, isEnabled: () => true, warn: vi.fn() });

    requireValue(notify)("modify", "item", [7], { 7: { changed: { tags: [{ tag: "todo" }] } } });
    await settle();
    expect(Zotero.Items.getAsync).not.toHaveBeenCalled();

    requireValue(notify)("add", "item", [7]);
    await settle();
    expect(item.addTag).toHaveBeenCalledExactlyOnceWith("todo");
    stop();
  });

  test("cleans a lowercase todo tag only after a comment change when opted in", async () => {
    let notify: Notify | undefined;
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
      saveTx: vi.fn(async () => requireValue(notify)("modify", "item", [7], { 7: { changed: { tags: [] } } }))
    };
    const Zotero = {
      Items: { getAsync: vi.fn(async () => item) },
      Notifier: {
        registerObserver: vi.fn<Notifier["registerObserver"]>(observer => { notify = observer.notify; return "observer-1"; }),
        unregisterObserver: vi.fn()
      }
    };
    const stop = registerAutoTodoTagger({
      Zotero,
      isEnabled: () => taggingEnabled,
      isCleanupEnabled: () => cleanupEnabled,
      warn: vi.fn()
    });
    const commentChange = { 7: { changed: { annotationComment: "t: read" } } };

    requireValue(notify)("modify", "item", [7], commentChange);
    await settle();
    expect(item.removeTag).not.toHaveBeenCalled();

    cleanupEnabled = true;
    item.annotationComment = "T：still pending";
    requireValue(notify)("modify", "item", [7], { 7: { changed: { annotationComment: "todo: read" } } });
    await settle();
    expect(item.removeTag).not.toHaveBeenCalled();

    item.annotationComment = "Finished reading";
    requireValue(notify)("modify", "item", [7], { 7: { changed: { annotationComment: "Earlier unrelated comment" } } });
    await settle();
    expect(item.removeTag).not.toHaveBeenCalled();

    requireValue(notify)("modify", "item", [7], commentChange);
    await settle();
    expect(item.removeTag).toHaveBeenCalledExactlyOnceWith("todo");
    expect(item.saveTx).toHaveBeenCalledTimes(1);
    expect(tags).toEqual([]);

    tags.push("todo");
    requireValue(notify)("modify", "item", [7], { 7: { changed: { tags: [] } } });
    await settle();
    expect(tags).toEqual(["todo"]);

    taggingEnabled = false;
    requireValue(notify)("modify", "item", [7], commentChange);
    await settle();
    expect(tags).toEqual([]);
    stop();
  });

  test("cleanup leaves uppercase tags and newly added annotations untouched", async () => {
    let notify: Notify | undefined;
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
        registerObserver: vi.fn<Notifier["registerObserver"]>(observer => { notify = observer.notify; return "observer-1"; }),
        unregisterObserver: vi.fn()
      }
    };
    const stop = registerAutoTodoTagger({
      Zotero,
      isEnabled: () => true,
      isCleanupEnabled: () => true,
      warn: vi.fn()
    });

    requireValue(notify)("modify", "item", [7], { 7: { changed: { annotationComment: "TODO: read" } } });
    await settle();
    expect(item.removeTag).not.toHaveBeenCalled();

    tags.splice(0, 1, "todo");
    requireValue(notify)("add", "item", [7]);
    await settle();
    expect(item.removeTag).not.toHaveBeenCalled();
    stop();
  });

  test("parses complete category paths, normalizes segments, and deduplicates directives", () => {
    expect([...getTodoDirectiveTags([
      "  T/论文/方法：检查公式", "todo/论文/方法: 再核对", "t/ paper / Method : check",
      "TODO: read", "t/结果: 核对结果"
    ].join("\n"))]).toEqual(["todo", "todo/论文/方法", "todo/paper/Method", "todo/结果"]);
    for (const comment of ["t/: no", "todo//方法: no", "t/论文/: no", "t/ /方法: no",
      "t/方法\n: no", "A t/方法: no", "tt/方法: no", "t /方法: no"]) {
      expect([...getTodoDirectiveTags(comment)]).toEqual([]);
      expect(hasTodoDirective(comment)).toBe(false);
    }
    expect(hasTodoDirective("T/论文/方法：check")).toBe(true);
  });

  test("adds the root and full paths once, preserving source and existing root case", async () => {
    const f = taggerFixture(["TODO"]);
    f.item.annotationComment = "t/论文/方法: 检查\nt/论文/方法: 再检查\nt/结果：核对";
    const source = f.item.annotationComment;
    f.notify("add", "item", [7]);
    await settle();
    expect(f.tags).toEqual(["TODO", "todo/论文/方法", "todo/结果"]);
    expect(f.item.saveTx).toHaveBeenCalledTimes(1);
    expect(f.item.annotationComment).toBe(source);
    f.notify("modify", "item", [7], { 7: { changed: { annotationComment: "" } } });
    await settle();
    expect(f.item.saveTx).toHaveBeenCalledTimes(1);
    f.stop();
  });

  test.each([
    [false, false, ["todo", "todo/方法", "topic"]],
    [true, false, ["todo", "todo/方法", "topic", "todo/结果"]],
    [false, true, ["todo", "topic"]],
    [true, true, ["todo", "topic", "todo/结果"]]
  ] as const)("category changes respect independent adding=%s and cleanup=%s", async (adding, cleanup, expected) => {
    const f = taggerFixture(["todo", "todo/方法", "topic"], adding, cleanup);
    f.edit("t/方法: 检查", "t/结果: 核对");
    await settle();
    expect(f.tags).toEqual(expected);
    expect(f.item.saveTx).toHaveBeenCalledTimes(adding || cleanup ? 1 : 0);
    f.stop();
  });

  test("keeps shared tags until their last directive disappears", async () => {
    const f = taggerFixture(["todo", "todo/论文/方法", "todo/结果"], false, true);
    f.edit("t/论文/方法: A\nt/论文/方法: B\nt/结果: C", "t/论文/方法: B\nt/结果: C");
    await settle();
    expect(f.item.removeTag).not.toHaveBeenCalled();
    f.edit(f.item.annotationComment, "t/结果: C");
    await settle();
    expect(f.tags).toEqual(["todo", "todo/结果"]);
    f.edit(f.item.annotationComment, "完成");
    await settle();
    expect(f.tags).toEqual([]);
    f.stop();
  });

  test("cleanup only removes exact old directive tags and never scans a prefix", async () => {
    const f = taggerFixture(["todo", "todo/方法", "todo/其他", "todo/方法/细节", "TODO", "TODO/方法", "topic"], false, true);
    f.edit("t/方法: check", "done");
    await settle();
    expect(f.tags).toEqual(["todo/其他", "todo/方法/细节", "TODO", "TODO/方法", "topic"]);
    expect(f.item.addTag).not.toHaveBeenCalled();
    f.stop();
  });

  test("cleanup leaves tags alone on creation, unrelated edits and missing previous comments", async () => {
    const f = taggerFixture(["todo", "todo/方法"], false, true);
    expect(f.Zotero.Items.getAsync).not.toHaveBeenCalled();
    f.item.annotationComment = "done";
    f.notify("add", "item", [7]);
    f.notify("modify", "item", [7], { 7: { changed: { annotationComment: undefined } } });
    f.notify("modify", "item", [7], { 7: { changed: { tags: [] } } });
    f.edit("unrelated", "done");
    await settle();
    expect(f.item.removeTag).not.toHaveBeenCalled();
    expect(f.item.saveTx).not.toHaveBeenCalled();
    f.stop();
  });

  test("keeps category spelling case sensitive while normalizing the directive prefix", async () => {
    const f = taggerFixture(["todo", "todo/Method"]);
    f.edit("T/Method: check", "TODO/method: check");
    await settle();
    expect(f.tags).toEqual(["todo", "todo/method"]);
    f.stop();
  });

  test("coalesces rapid edits without losing old paths or removing the current path", async () => {
    const f = taggerFixture(["todo", "todo/A", "todo/B"]);
    f.edit("t/A: check", "t/B: check");
    f.edit("t/B: check", "t/C: check");
    await settle();
    expect(f.tags).toEqual(["todo", "todo/C"]);
    expect(f.item.saveTx).toHaveBeenCalledTimes(1);
    f.stop();
  });

  test("handles a new comment save while an earlier item lookup is pending", async () => {
    const f = taggerFixture(["todo", "todo/A", "todo/B"]);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.Zotero.Items.getAsync.mockImplementationOnce(async () => { await gate; return f.item; });
    f.edit("t/A: check", "t/B: check");
    await settle();
    f.edit("t/B: check", "t/C: check");
    release();
    await settle();
    expect(f.tags).toEqual(["todo", "todo/C"]);
    expect(f.Zotero.Items.getAsync).toHaveBeenCalledTimes(2);
    f.stop();
  });

  test("reads current choices for queued edits and does not process stopped work", async () => {
    const f = taggerFixture(["todo", "todo/A"]);
    f.edit("t/A: check", "t/B: check");
    f.controls.adding = false;
    f.controls.cleanup = false;
    await settle();
    expect(f.tags).toEqual(["todo", "todo/A"]);
    f.controls.adding = true;
    f.edit("t/B: check", "t/C: check");
    f.stop();
    await settle();
    expect(f.tags).toEqual(["todo", "todo/A"]);
  });
});

function taggerFixture(tags: string[], adding = true, cleanup = true) {
  let notify!: Notify;
  const controls = { adding, cleanup };
  const item = {
    isAnnotation: () => true,
    annotationComment: "",
    getTags: () => tags.map(tag => ({ tag })),
    addTag: vi.fn((tag: string) => { tags.push(tag); return true; }),
    removeTag: vi.fn((tag: string) => { tags.splice(tags.indexOf(tag), 1); return true; }),
    saveTx: vi.fn(async () => notify("modify", "item", [7], { 7: { changed: { tags: [] } } }))
  };
  const Zotero = {
    Items: { getAsync: vi.fn(async () => item) },
    Notifier: {
      registerObserver: vi.fn<Notifier["registerObserver"]>(observer => { notify = observer.notify; return "observer"; }),
      unregisterObserver: vi.fn()
    }
  };
  const warn = vi.fn();
  const stop = registerAutoTodoTagger({ Zotero, isEnabled: () => controls.adding,
    isCleanupEnabled: () => controls.cleanup, warn });
  return { tags, controls, item, Zotero, warn, stop,
    notify: (...args: Parameters<Notify>) => notify(...args),
    edit(previous: string, next: string) {
      item.annotationComment = next;
      notify("modify", "item", [7], { 7: { changed: { annotationComment: previous } } });
    }
  };
}
