import { afterEach, describe, expect, test, vi } from "vitest";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";

const cleanup = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()();
});

async function setup({ overlay = true, enabled = true, multiple = false, nativeNote = false, fastEditor = true } = {}) {
  document.body.innerHTML = `
    <button id="toolbar">toolbar</button>
    <div id="annotationsView" class="${nativeNote ? "note-editor" : ""}">
      <div id="annotations" class="annotations" tabindex="-1" style="overflow-y: auto">
        <div data-sidebar-annotation-id="a1" class="annotation selected" tabindex="-1">
          <div class="comment"><div class="expandable-editor">
            <div class="content" contenteditable="false">**first**</div>
          </div></div>
        </div>
        <div data-sidebar-annotation-id="a2" class="annotation ${multiple ? "selected" : ""}" tabindex="-1">
          <div class="comment"><div class="expandable-editor">
            <div class="content" contenteditable="false">**second**</div>
          </div></div>
        </div>
      </div>
    </div>`;
  const rows = Array.from(document.querySelectorAll(".annotation"));
  const scroller = document.querySelector("#annotations");
  const toolbar = document.querySelector("#toolbar");
  Object.defineProperties(scroller, {
    clientWidth: { configurable: true, value: overlay ? 217 : 200 },
    offsetWidth: { configurable: true, value: 217 },
    clientHeight: { configurable: true, value: 300 },
    offsetHeight: { configurable: true, value: 300 },
    scrollHeight: { configurable: true, value: 1500 },
    scrollWidth: { configurable: true, value: overlay ? 217 : 200 }
  });
  scroller.getBoundingClientRect = () => ({
    left: 10, top: 100, right: 227, bottom: 400,
    width: 217, height: 300, x: 10, y: 100
  });
  rows[0].focus();

  // Model the installed Reader's FocusManager._handleFocus: a focusin outside
  // these host containers deselects annotations and therefore folds previews.
  const deselect = vi.fn(() => rows.forEach(row => row.classList.remove("selected")));
  const hostFocus = vi.fn(event => {
    if (!event.target.closest(".annotation, .annotation-popup, .selection-popup, .label-popup, .appearance-popup, .context-menu, iframe")) {
      deselect();
    }
  });
  window.addEventListener("focusin", hostFocus);
  cleanup.push(() => window.removeEventListener("focusin", hostFocus));
  const commitComment = vi.fn(() => true);
  const controller = createReaderController({
    reader: { document },
    adapter: createAnnotationSidebarAdapter({ document, isFastEditorEnabled: () => fastEditor, commitComment }),
    renderer: { render: source => `<p>${source}</p>` },
    settings: { isEnabled: () => enabled },
    MutationObserver: null,
    IntersectionObserver: null
  });
  await controller.start();
  cleanup.push(() => controller.stop());
  const rowFocus = vi.spyOn(rows[0], "focus");
  cleanup.push(() => rowFocus.mockRestore());
  return { controller, rows, scroller, toolbar, hostFocus, deselect, commitComment, rowFocus };
}

function pointer(target, type = "pointerdown", init = {}) {
  const event = new PointerEvent(type, {
    bubbles: true, cancelable: true, button: 0, pointerId: 1,
    clientX: 220, clientY: 200, ...init
  });
  target.dispatchEvent(event);
  return event;
}

describe("selected annotation scrollbar focus", () => {
  test.each([true, false])("preserves selection and preview during a long scrollbar drag (overlay=%s)", async overlay => {
    const { rows, scroller, toolbar, deselect, commitComment, rowFocus } = await setup({ overlay });
    const preview = rows[0].querySelector(".annotation-markdown-rendered");
    expect(preview).not.toBeNull();
    expect(pointer(scroller).defaultPrevented).toBe(false);
    // Protection must survive an actual drag, not just the pointerdown task.
    await new Promise(resolve => setTimeout(resolve, 20));
    window.dispatchEvent(new Event("blur"));
    scroller.focus();
    scroller.scrollTop = 650;
    scroller.dispatchEvent(new Event("scroll"));
    expect(pointer(scroller, "pointerup").defaultPrevented).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(deselect).not.toHaveBeenCalled();
    expect(rows[0].classList.contains("selected")).toBe(true);
    expect(rows[0].querySelector(".annotation-markdown-rendered")).toBe(preview);
    expect(document.activeElement).toBe(scroller);
    expect(rowFocus).not.toHaveBeenCalled();
    expect(scroller.scrollTop).toBe(650);
    expect(document.querySelector("textarea")).toBeNull();
    expect(commitComment).not.toHaveBeenCalled();

    toolbar.focus();
    expect(deselect).toHaveBeenCalledOnce();
    expect(rows[0].classList.contains("selected")).toBe(false);
  });

  test("keeps a multi-selection without reselecting or focusing any row", async () => {
    const { rows, scroller, deselect, rowFocus } = await setup({ multiple: true });
    pointer(scroller);
    scroller.focus();
    expect(deselect).not.toHaveBeenCalled();
    expect(rows.every(row => row.classList.contains("selected"))).toBe(true);
    expect(rowFocus).not.toHaveBeenCalled();
  });

  test("protects selected previews even when the fast-editor preference is off", async () => {
    const { scroller, deselect } = await setup({ fastEditor: false });
    pointer(scroller);
    scroller.focus();
    expect(deselect).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
  });

  test.each(["content", "right-button", "no-overflow", "native-note", "popup", "no-selection", "disabled"])("does not protect an ordinary focus change: %s", async reason => {
    const { rows, scroller, hostFocus } = await setup({ enabled: reason !== "disabled", nativeNote: reason === "native-note" });
    if (reason === "no-overflow") {
      Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 300 });
    }
    if (reason === "popup") scroller.classList.add("annotation-popup");
    if (reason === "no-selection") rows[0].classList.remove("selected");
    pointer(scroller, "pointerdown", {
      clientX: reason === "content" ? 80 : 220,
      button: reason === "right-button" ? 2 : 0
    });
    scroller.focus();
    expect(hostFocus).toHaveBeenCalledOnce();
  });

  test.each(["pointerup", "pointercancel", "dragend", "keydown", "outside-pointer", "outside-focus", "refresh", "stop", "reset"])("cleans up scrollbar protection on %s", async end => {
    const { controller, scroller, toolbar, deselect } = await setup();
    pointer(scroller);
    if (end === "keydown") scroller.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    else if (end === "outside-pointer") pointer(toolbar, "pointerdown", { clientX: 500 });
    else if (end === "outside-focus") toolbar.focus();
    else if (end === "refresh") controller.refresh();
    else if (end === "stop") controller.stop();
    else if (end === "reset") { controller.stop(); await controller.start(); }
    else pointer(scroller, end);
    await new Promise(resolve => setTimeout(resolve, 20));
    deselect.mockClear();
    scroller.focus();
    expect(deselect).toHaveBeenCalledOnce();
  });

  test("allows another annotation to receive focus during the drag", async () => {
    const { rows, scroller, deselect } = await setup();
    const focusSecond = vi.fn();
    rows[1].addEventListener("focusin", focusSecond);
    pointer(scroller);
    rows[1].focus();
    expect(focusSecond).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(rows[1]);
    // It must not leave stale protection for a later unrelated sidebar focus.
    scroller.focus();
    expect(deselect).toHaveBeenCalledOnce();
  });

  test("does not intercept an ordinary click that selects another annotation", async () => {
    const { rows, scroller } = await setup();
    rows[1].addEventListener("click", () => {
      rows[0].classList.remove("selected");
      rows[1].classList.add("selected");
    });
    pointer(scroller);
    pointer(rows[1], "pointerdown", { clientX: 80 });
    rows[1].focus();
    rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(rows[0].classList.contains("selected")).toBe(false);
    expect(rows[1].classList.contains("selected")).toBe(true);
    expect(document.activeElement).toBe(rows[1]);
    expect(document.querySelector("textarea")).toBeNull();
  });
});
