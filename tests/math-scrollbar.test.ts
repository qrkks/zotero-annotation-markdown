import type { MathOutput } from "../src/settings.ts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createSettingsStub, missingIntersectionObserver, missingMutationObserver } from "./helpers/stubs.ts";
import { fixtureRect, queryElement, requireElement, requireValue } from "./helpers/dom.ts";

const SOURCE = String.raw`\[
\boxed{\text{正交投影只取决于 } A \text{ 的列空间 } C(A)，\text{而不取决于你用哪一组基来表示这个空间。}}
\]`;
const cleanup: Array<(() => void)> = [];
afterEach(() => { while (cleanup.length) requireValue(cleanup.pop())(); });

async function setup({ overlay = false, fastEditor = true, popup = false, controllerEnabled = true, mathOutput = "htmlAndMathml" as MathOutput, sourceText = SOURCE } = {}) {
  // KaTeX warns about Chinese punctuation in math mode; preserve the user's
  // input while keeping that expected warning out of each fixture's output.
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  cleanup.push(() => warning.mockRestore());
  document.body.innerHTML = `
    <button id="outside">outside</button>
    <div id="annotations" tabindex="-1" style="overflow-y:auto">
      <div class="annotation selected ${popup ? "annotation-popup" : ""}" data-sidebar-annotation-id="a1" tabindex="-1">
        <div class="comment"><div class="expandable-editor"><div class="content" contenteditable="false"></div></div></div>
      </div>
    </div>`;
  const row = queryElement(document, ".annotation", HTMLElement);
  const sidebar = document.querySelector("#annotations");
  const comment = queryElement(document, ".comment", HTMLElement);
  const source = queryElement(document, ".content");
  source.textContent = sourceText;
  row.focus();
  const deselect = vi.fn(() => row.classList.remove("selected"));
  const hostFocus = (event: Event) => {
    if (!requireElement(event.target, HTMLElement).closest(".annotation, .annotation-popup")) deselect();
  };
  window.addEventListener("focusin", hostFocus);
  cleanup.push(() => window.removeEventListener("focusin", hostFocus));
  const commit = vi.fn(() => true);
  const adapter = createAnnotationSidebarAdapter({ document, isFastEditorEnabled: () => fastEditor, commitComment: commit });
  const renderer = createMarkdownRenderer({ getMathOutput: () => mathOutput });
  const controller = createReaderController({
    reader: { document }, adapter, renderer,
    settings: createSettingsStub({ isEnabled: () => true }), MutationObserver: missingMutationObserver, IntersectionObserver: missingIntersectionObserver
  });
  if (controllerEnabled) await controller.start();
  else adapter.applyRenderedHtml(comment, renderer.render(sourceText));
  cleanup.push(() => { controller.stop(); adapter.clearRenderedState(); });
  const preview = queryElement(comment, ".annotation-markdown-rendered");
  const math = queryElement(preview, ".katex-display", HTMLElement);
  math.setAttribute("tabindex", "0"); // jsdom does not auto-focus overflow containers like Gecko.
  math.style.overflowX = "auto";
  math.style.overflowY = "hidden";
  Object.defineProperties(math, {
    clientWidth: { configurable: true, value: 300 }, offsetWidth: { configurable: true, value: 300 },
    clientHeight: { configurable: true, value: overlay ? 65 : 48 }, offsetHeight: { configurable: true, value: 65 },
    scrollWidth: { configurable: true, value: 900 }, scrollHeight: { configurable: true, value: 48 }
  });
  math.getBoundingClientRect = () => (fixtureRect({ x: 20, y: 100, left: 20, top: 100, right: 320, bottom: 165, width: 300, height: 65 }));
  const hostPointer = vi.fn();
  row.addEventListener("pointerdown", hostPointer);
  return { adapter, controller, row, sidebar, comment, source, preview, math, commit, deselect, hostPointer };
}

function mouse(target: Element, type: string, init = {}) {
  const EventRef = type.startsWith("pointer") ? PointerEvent : MouseEvent;
  const event = new EventRef(type, { bubbles: true, cancelable: true, button: 0, clientX: 80, clientY: 160, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("display math scrolling", () => {
  test.each([
    { overlay: false }, { overlay: true }, { fastEditor: false }, { popup: true }
  ] as const)("keeps the preview while dragging the scrollbar: %j", async options => {
    const { math, sidebar, row, preview, comment, source, commit, deselect, hostPointer } = await setup(options);
    expect(mouse(math, "pointerdown").defaultPrevented).toBe(false);
    expect(mouse(math, "mousedown").defaultPrevented).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 25));
    window.dispatchEvent(new Event("blur"));
    requireElement(math, HTMLElement).focus();
    // Some Gecko focus events can be retargeted to a containing scroll view.
    requireElement(sidebar, HTMLElement).focus();
    requireValue(math).scrollLeft = 500;
    expect(mouse(math, "pointerup").defaultPrevented).toBe(false);
    mouse(math, "mouseup");
    // Release over formula content must not be interpreted as an editing click.
    expect(mouse(requireValue(requireValue(math).querySelector(".katex-html")), "click", { clientY: 115 }).defaultPrevented).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 25));
    expect(deselect).not.toHaveBeenCalled();
    expect(hostPointer).not.toHaveBeenCalled();
    expect(requireValue(row).classList.contains("selected")).toBe(true);
    expect(requireValue(comment).querySelector(".annotation-markdown-rendered")).toBe(preview);
    expect(requireValue(comment).classList.contains("annotation-markdown-editing")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
    expect(requireValue(math).scrollLeft).toBe(500);
    expect(requireValue(source).textContent).toBe(SOURCE);
    expect(commit).not.toHaveBeenCalled();
    queryElement(document, "#outside", HTMLElement).focus();
    expect(deselect).toHaveBeenCalledOnce();
  });

  test.each([true, false] as const)("still edits a normal formula-body click (fastEditor=%s)", async fastEditor => {
    const { math, comment } = await setup({ fastEditor });
    mouse(requireValue(requireValue(math).querySelector(".katex-html")), "pointerdown", { clientY: 115 });
    expect(requireValue(comment).classList.contains("annotation-markdown-editing")).toBe(true);
    expect(Boolean(document.querySelector("textarea"))).toBe(fastEditor);
  });

  test.each(["mousedown", "click"] as const)("recognizes a scrollbar %s without a pointerdown", async (type: string) => {
    const { math, comment } = await setup();
    expect(mouse(math, type).defaultPrevented).toBe(false);
    expect(requireValue(comment).classList.contains("annotation-markdown-editing")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("does not enter editing when keyboard focus reaches a math scroller", async () => {
    const { math } = await setup();
    requireElement(math, HTMLElement).focus();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(document.activeElement).toBe(math);
    expect(document.querySelector("textarea")).toBeNull();
  });

  test.each(["pointerdown", "mousedown"] as const)("protects the standalone adapter's %s handler", async (type: string) => {
    const { math, comment } = await setup({ controllerEnabled: false });
    expect(mouse(math, type).defaultPrevented).toBe(false);
    expect(requireValue(comment).classList.contains("annotation-markdown-editing")).toBe(false);
  });

  test("handles scrollbar events retargeted to the preview, then allows the next content click", async () => {
    const { preview, math, sidebar, deselect } = await setup();
    expect(mouse(preview, "pointerdown").defaultPrevented).toBe(false);
    mouse(preview, "mousedown");
    requireElement(sidebar, HTMLElement).focus();
    expect(deselect).not.toHaveBeenCalled();
    mouse(preview, "pointerup");
    await new Promise(resolve => setTimeout(resolve, 25));
    mouse(requireValue(requireValue(math).querySelector(".vlist")), "pointerdown");
    expect(document.querySelector("textarea")).not.toBeNull();
  });

  test("keeps a popup formula scroller mounted when Gecko retargets its scrollbar outside the measured gutter", async () => {
    const { controller, math, comment, preview } = await setup({ popup: true });

    // Gecko exposes the anonymous native scrollbar as the overflow element.
    // Its reported pointer coordinate is not consistently inside the CSS
    // gutter, especially in a transformed page popup.
    expect(mouse(math, "pointerdown", { clientY: 115 }).defaultPrevented).toBe(false);
    expect(mouse(math, "mousedown", { clientY: 115 }).defaultPrevented).toBe(false);
    requireValue(math).scrollLeft = 500;
    controller.renderNow();

    expect(requireValue(comment).querySelector(".annotation-markdown-rendered")).toBe(preview);
    expect(document.querySelector("textarea")).toBeNull();
    expect(requireValue(math).scrollLeft).toBe(500);
  });

  test("keeps native MathML at the right end through release and repeated popup rendering", async () => {
    const sourceText = String.raw`\[
\boxed{
\text{z 标准化 = 先投影去掉均值方向，再把剩余向量重新缩放}
}
\]`;
    const { controller, math, preview, comment, source, commit } = await setup({ popup: true, mathOutput: "mathml", sourceText });
    mouse(math, "pointerdown", { clientY: 115 });
    mouse(math, "mousedown", { clientY: 115 });
    requireValue(math).scrollLeft = requireValue(math).scrollWidth - requireValue(math).clientWidth;
    mouse(math, "pointerup");
    mouse(math, "mouseup");
    mouse(requireValue(requireValue(math).querySelector("math mtext")), "click", { clientY: 115 });
    controller.renderNow();
    await new Promise(resolve => setTimeout(resolve, 25));
    controller.renderNow();

    expect(requireValue(comment).querySelector(".annotation-markdown-rendered")).toBe(preview);
    expect(requireValue(comment).querySelector(".katex-display")).toBe(math);
    expect(requireValue(math).scrollLeft).toBe(600);
    expect(requireValue(comment).classList.contains("annotation-markdown-editing")).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
    expect(requireValue(source).textContent).toBe(sourceText);
    expect(commit).not.toHaveBeenCalled();
  });

  test("clears the old drag when focus moves to a different math scroller", async () => {
    const { math, sidebar, deselect } = await setup();
    const next = requireValue(math).cloneNode(true);
    Object.defineProperties(next, { clientWidth: { value: 300 }, scrollWidth: { value: 900 } });
    requireValue(math).after(next);
    mouse(math, "pointerdown");
    requireElement(next, HTMLElement).focus();
    expect(document.activeElement).toBe(next);
    expect(document.querySelector("textarea")).toBeNull();
    requireElement(sidebar, HTMLElement).focus();
    expect(deselect).toHaveBeenCalledOnce();
  });

  test.each(["pointerup", "pointercancel", "dragend", "keydown", "outside-pointer", "refresh", "stop"] as const)("clears math drag protection on %s", async end => {
    const { math, sidebar, controller, deselect } = await setup();
    mouse(math, "pointerdown");
    if (end === "refresh") requireValue(controller.refresh).call(controller);
    else if (end === "stop") controller.stop();
    else if (end === "outside-pointer") mouse(requireValue(document.querySelector("#outside")), "pointerdown");
    else if (end === "keydown") requireValue(math).dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    else mouse(math, end);
    await new Promise(resolve => setTimeout(resolve, 25));
    requireElement(sidebar, HTMLElement).focus();
    expect(deselect).toHaveBeenCalledOnce();
  });

  test.each(["short", "right-edge", "low-content", "right-button", "touch", "native-note", "foreign-preview", "link"] as const)("does not classify %s as our math scrollbar", async reason => {
    const { math, preview, adapter } = await setup();
    if (reason === "short") Object.defineProperty(math, "scrollWidth", { value: 300 });
    if (reason === "right-edge") Object.defineProperty(math, "scrollHeight", { value: 80 });
    if (reason === "native-note") requireValue(preview).classList.add("note-editor");
    if (reason === "foreign-preview") { requireValue(preview).className = "wv-md-preview"; requireValue(preview).removeAttribute("data-annotation-markdown-preview"); }
    const target = reason === "link" ? requireValue(math).appendChild(document.createElement("a"))
      : reason === "low-content" ? requireValue(math).querySelector(".vlist") : math;
    if (reason === "link") requireElement(target, HTMLAnchorElement).href = "https://example.com";
    const event = new PointerEvent("pointerdown", {
      clientX: reason === "right-edge" ? 319 : 80, clientY: reason === "right-edge" ? 115 : 160,
      button: reason === "right-button" ? 2 : 0, pointerType: reason === "touch" ? "touch" : "mouse"
    });
    Object.defineProperty(event, "target", { value: target });
    expect(adapter.getPreviewMathScrollbar(event)).toBeNull();
  });
});
