import { afterEach, describe, expect, test, vi } from "vitest";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";

const settle = () => new Promise(resolve => setTimeout(resolve, 50));
let controller;
let hostFocus;
afterEach(() => {
  controller?.stop();
  window.removeEventListener("focusin", hostFocus);
  vi.restoreAllMocks();
});

async function openEditor(overlay = false) {
  document.body.innerHTML = `
    <div id="sidebar" tabindex="-1" style="overflow-y:auto">
      <div class="annotation selected" data-annotation-id="a1" tabindex="-1">
        <div class="comment"><div class="expandable-editor">
          <div class="content" contenteditable="false">original comment</div>
        </div></div>
      </div>
    </div><button id="outside">Outside</button>`;
  const sidebar = document.querySelector("#sidebar");
  const row = document.querySelector(".annotation");
  Object.defineProperties(sidebar, {
    clientWidth: { value: overlay ? 217 : 201 }, offsetWidth: { value: 217 },
    clientHeight: { value: 300 }, offsetHeight: { value: 300 },
    scrollHeight: { value: 1000 }, scrollWidth: { value: 201 }
  });
  sidebar.getBoundingClientRect = () => ({ left: 0, right: 217, top: 0, bottom: 300, width: 217, height: 300 });
  // The Reader's window-level focus listener deselects unrelated focus targets.
  hostFocus = vi.fn(event => {
    if (!event.target.closest(".annotation")) row.classList.remove("selected");
  });
  window.addEventListener("focusin", hostFocus);
  const commitComment = vi.fn(() => true);
  const adapter = createAnnotationSidebarAdapter({ document, isFastEditorEnabled: () => true, commitComment });
  controller = createReaderController({
    reader: { document }, adapter, renderer: { render: source => `<p>${source}</p>` },
    settings: { isEnabled: () => true }, MutationObserver: window.MutationObserver, IntersectionObserver: null
  });
  await controller.start();
  document.querySelector(".annotation-markdown-rendered").dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })
  );
  await settle(); // Initial entry intentionally places the caret at the end.
  const textarea = document.querySelector("textarea");
  textarea.value = "draft with selected text";
  textarea.setSelectionRange(3, 8, "backward");
  const focus = vi.spyOn(textarea, "focus");
  const setSelectionRange = vi.spyOn(textarea, "setSelectionRange");
  const pointer = (type, target = sidebar, x = 210) => {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 100 });
    target.dispatchEvent(event);
    return event;
  };
  return { sidebar, row, textarea, adapter, commitComment, focus, setSelectionRange, pointer };
}

describe("fast editor scrollbar focus without refocusing", () => {
  test.each([false, true])("keeps the same session and selection while focus rests on the scroller (overlay=%s)", async overlay => {
    const f = await openEditor(overlay);
    expect(f.pointer("pointerdown").defaultPrevented).toBe(false);
    f.sidebar.focus();
    f.pointer("pointerup");
    await settle();
    expect(document.activeElement).toBe(f.sidebar);
    expect(document.querySelector("textarea")).toBe(f.textarea);
    expect(f.textarea.value).toBe("draft with selected text");
    expect([f.textarea.selectionStart, f.textarea.selectionEnd, f.textarea.selectionDirection]).toEqual([3, 8, "backward"]);
    expect(f.focus).not.toHaveBeenCalled();
    expect(f.setSelectionRange).not.toHaveBeenCalled();
    expect(f.commitComment).not.toHaveBeenCalled();
    expect(f.row.classList.contains("selected")).toBe(true);
    const comment = document.querySelector(".comment");
    expect(f.adapter.isEditable(comment)).toBe(true);
    expect(comment.classList.contains("annotation-markdown-fast-editing")).toBe(true);
    controller.renderNow();
    controller.refresh();
    await settle();
    expect(document.querySelector("textarea")).toBe(f.textarea);
    expect(comment.classList.contains("annotation-markdown-fast-editing")).toBe(true);
    expect(document.querySelector(".expandable-editor").hidden).toBe(true);
  });

  test("protects a sustained drag, then lets the next editor click control the caret", async () => {
    const f = await openEditor();
    f.pointer("pointerdown", f.row); // Native Gecko scrollbar retargeting.
    await settle();
    window.dispatchEvent(new Event("blur"));
    f.sidebar.focus();
    f.pointer("pointerup");
    await settle();
    expect(document.querySelector("textarea")).toBe(f.textarea);
    expect(f.pointer("pointerdown", f.textarea, 50).defaultPrevented).toBe(false);
    // jsdom has no caret hit testing: emulate the native click result here;
    // the browser QA separately uses real mouse clicks and typing.
    f.textarea.focus();
    f.textarea.setSelectionRange(2, 2);
    f.focus.mockClear();
    f.setSelectionRange.mockClear();
    await settle();
    expect(f.textarea.selectionStart).toBe(2);
    expect(f.focus).not.toHaveBeenCalled();
    expect(f.setSelectionRange).not.toHaveBeenCalled();
    expect(f.commitComment).not.toHaveBeenCalled();
    document.querySelector("#outside").focus();
    expect(f.commitComment).toHaveBeenCalledExactlyOnceWith("a1", "draft with selected text");
  });

  test.each(["pointerdown", "focusin"])("a real outside %s still saves during the drag", async type => {
    const f = await openEditor();
    f.pointer("pointerdown");
    f.sidebar.focus();
    const outside = document.querySelector("#outside");
    if (type === "pointerdown") f.pointer(type, outside, 50);
    else outside.focus();
    expect(f.commitComment).toHaveBeenCalledExactlyOnceWith("a1", "draft with selected text");
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("allows delayed scroller focus after release without ending or refocusing the session", async () => {
    const f = await openEditor();
    f.pointer("pointerdown");
    f.pointer("pointerup");
    await settle();
    f.sidebar.focus();
    await settle();
    expect(document.activeElement).toBe(f.sidebar);
    expect(document.querySelector("textarea")).toBe(f.textarea);
    expect(f.row.classList.contains("selected")).toBe(true);
    expect(f.focus).not.toHaveBeenCalled();
    expect(f.commitComment).not.toHaveBeenCalled();
  });

  test("row-retargeted scrollbar focus does not schedule another editor entry", async () => {
    const f = await openEditor();
    f.pointer("pointerdown", f.row);
    f.row.focus();
    await settle();
    f.pointer("pointerup");
    expect(document.activeElement).toBe(f.row);
    expect(document.querySelector("textarea")).toBe(f.textarea);
    expect(f.focus).not.toHaveBeenCalled();
    expect(f.setSelectionRange).not.toHaveBeenCalled();
    expect(f.commitComment).not.toHaveBeenCalled();
  });

  test.each(["pointerup", "pointercancel", "dragend"])("window blur after %s is a real editing exit", async type => {
    const f = await openEditor();
    f.pointer("pointerdown");
    f.sidebar.focus();
    f.pointer(type);
    await settle();
    window.dispatchEvent(new Event("blur"));
    expect(f.commitComment).toHaveBeenCalledExactlyOnceWith("a1", "draft with selected text");
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("failed save keeps the original draft and editor", async () => {
    const f = await openEditor();
    f.pointer("pointerdown");
    f.sidebar.focus();
    f.pointer("pointerup");
    await settle();
    f.commitComment.mockReturnValue(false);
    expect(f.pointer("pointerdown", document.querySelector("#outside"), 50).defaultPrevented).toBe(true);
    await settle();
    expect(document.querySelector("textarea")).toBe(f.textarea);
    expect(f.textarea.value).toBe("draft with selected text");
    expect(document.activeElement).toBe(f.textarea);
  });

  test("stop clears parked sessions and pending scrollbar callbacks", async () => {
    const f = await openEditor();
    f.pointer("pointerdown");
    f.sidebar.focus();
    f.pointer("pointerup");
    controller.stop();
    await settle();
    expect(document.querySelector("textarea")).toBeNull();
    expect(f.focus).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("blur"));
    expect(f.commitComment).not.toHaveBeenCalled();
  });
});
