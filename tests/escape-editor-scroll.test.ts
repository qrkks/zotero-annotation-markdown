import type { ReaderController } from "../src/types.ts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createSettingsStub, missingIntersectionObserver } from "./helpers/stubs.ts";
import { fixtureRect, queryElement, requireElement, requireValue } from "./helpers/dom.ts";

let controller: ReaderController | undefined;
let frames: Map<number, FrameRequestCallback> | undefined;
let allowFixtureSave: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  let next = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
    requireValue(frames).set(++next, callback); return next;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => requireValue(frames).delete(id));
});
afterEach(() => {
  allowFixtureSave?.();
  controller?.stop();
  controller = undefined;
  allowFixtureSave = undefined;
  vi.restoreAllMocks(); vi.useRealTimers();
  document.body.innerHTML = "";
});
function frame() {
  const current = [...requireValue(frames).values()]; requireValue(frames).clear();
  current.forEach(callback => callback(0));
}
async function setup({ saved = true, top = -100, height = 800 } = {}) {
  document.body.innerHTML = `<div id="annotations" style="overflow-y:auto">
    <div class="annotation selected" data-sidebar-annotation-id="a1" tabindex="-1">
      <div class="comment"><div class="expandable-editor"><div class="content">Original</div></div></div>
    </div>
    <div class="annotation" data-sidebar-annotation-id="a2"><div class="comment">Other</div></div>
  </div><button id="outside">Outside</button>`;
  const scroller = queryElement(document, "#annotations");
  const row = queryElement(document, ".annotation");
  const geometry = { top, height };
  row.getBoundingClientRect = () => (fixtureRect({ top: geometry.top, bottom: geometry.top + geometry.height, height: geometry.height }));
  scroller.getBoundingClientRect = () => (fixtureRect({ top: 0, bottom: 300, height: 300 }));
  Object.defineProperties(scroller, { clientHeight: {value:300}, scrollHeight: {value:4000} });
  scroller.scrollTop = 1200;
  scroller.scrollTo = vi.fn();
  let enabled = true;
  const commitComment = vi.fn(() => saved);
  allowFixtureSave = () => { commitComment.mockReturnValue(true); };
  const adapter = createAnnotationSidebarAdapter({document, isFastEditorEnabled:()=>true, commitComment});
  controller = createReaderController({reader:{document},adapter,renderer:{render:s=>`<p>${s}</p>`},
    settings:createSettingsStub({isEnabled:()=>enabled}),MutationObserver:window.MutationObserver,IntersectionObserver:missingIntersectionObserver});
  await controller.start();
  adapter.tryShowFastEditorForAnnotationID("a1"); frame(); frame();
  const textarea = queryElement(row, "textarea", HTMLTextAreaElement);
  expect(document.activeElement).toBe(textarea);
  vi.mocked(scroller.scrollTo).mockClear();
  const escape = async () => {
    textarea.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",bubbles:true,cancelable:true}));
    await vi.runOnlyPendingTimersAsync();
  };
  return {row,scroller,textarea,geometry,adapter,commitComment,escape,disable:()=>{enabled=false;requireValue(requireValue(controller).refresh).call(requireValue(controller));}};
}

test.each([-100, 100, -790] as const)("Escape preserves position while any part of the annotation is visible (top=%s)", async top => {
  const f = await setup({top});
  await f.escape(); frame(); frame();
  expect(requireValue(f.row).querySelector("textarea")).toBeNull();
  expect(queryElement(f.row, ".annotation-markdown-rendered", HTMLElement)?.hidden).toBe(false);
  expect(requireValue(f.scroller).scrollTo).not.toHaveBeenCalled();
  expect(requireValue(f.scroller).scrollTop).toBe(1200);
});

test.each([[-900,298],[400,1598]] as const)("Escape brings a fully offscreen annotation back once, after preview layout (top=%s)", async (top,expected) => {
  const f = await setup({top});
  await f.escape();
  expect(requireValue(f.scroller).scrollTo).not.toHaveBeenCalled(); frame();
  expect(requireValue(f.scroller).scrollTo).not.toHaveBeenCalled(); frame();
  expect(requireValue(f.scroller).scrollTo).toHaveBeenCalledExactlyOnceWith({top:expected,left:0,behavior:"smooth"});
  await vi.runOnlyPendingTimersAsync(); frame();
  expect(requireValue(f.scroller).scrollTo).toHaveBeenCalledTimes(1);
});

test("uses the restored preview's height instead of the temporary collapsed row", async () => {
  const f = await setup({top:-900});
  await f.escape(); frame();
  f.geometry.height = 1500; frame();
  expect(requireValue(f.scroller).scrollTo).not.toHaveBeenCalled();
});

test("temporarily suspends scroll anchoring across the editor-to-preview layout and restores host CSS", async () => {
  const f = await setup();
  requireElement(f.scroller, HTMLElement).style.setProperty("overflow-anchor", "auto", "important");
  const priority = requireElement(f.scroller, HTMLElement).style.getPropertyPriority("overflow-anchor");
  await f.escape();
  expect(requireElement(f.scroller, HTMLElement).style.getPropertyValue("overflow-anchor")).toBe("none");
  frame(); frame();
  expect(requireElement(f.scroller, HTMLElement).style.getPropertyValue("overflow-anchor")).toBe("auto");
  // jsdom drops priority for this CSS property; Firefox QA checks !important.
  expect(requireElement(f.scroller, HTMLElement).style.getPropertyPriority("overflow-anchor")).toBe(priority);
});

test("short annotations use the same 2px recovery alignment", async () => {
  const f = await setup({top:450,height:80});
  await f.escape(); frame(); frame();
  expect(requireValue(f.scroller).scrollTo).toHaveBeenCalledExactlyOnceWith({top:1648,left:0,behavior:"smooth"});
});

test("ordinary blur never brings the previous annotation back", async () => {
  const f = await setup({top:-900});
  queryElement(document, "#outside", HTMLElement).focus();
  await vi.runOnlyPendingTimersAsync(); frame(); frame();
  expect(requireValue(f.scroller).scrollTo).not.toHaveBeenCalled();
});

test.each(["wheel","pointerdown","keydown"] as const)("new %s input cancels pending Escape recovery", async (type: string) => {
  const f = await setup({top:-900});
  await f.escape();
  document.dispatchEvent(new Event(type,{bubbles:true})); frame(); frame();
  expect(requireValue(f.scroller).scrollTo).not.toHaveBeenCalled();
});

test.each(["selection","disable","stop","reopen"] as const)("cancels pending recovery after %s", async action => {
  const f = await setup({top:-900});
  await f.escape();
  if (action === "selection") requireValue(f.row).classList.remove("selected");
  if (action === "disable") f.disable();
  if (action === "stop") requireValue(controller).stop();
  if (action === "reopen") { f.adapter.tryShowFastEditorForAnnotationID("a1"); frame(); vi.mocked(requireValue(f.scroller).scrollTo).mockClear(); }
  frame(); frame();
  if (action !== "reopen") expect(requireValue(f.scroller).scrollTo).not.toHaveBeenCalled();
  else expect(vi.mocked(requireValue(f.scroller).scrollTo).mock.calls.filter(([o])=>requireValue(o).behavior === "smooth")).toHaveLength(0);
});

test("a failed save keeps the editor open without scheduling recovery", async () => {
  const f = await setup({saved:false,top:-900});
  requireValue(f.textarea).value = "Changed";
  await f.escape(); frame(); frame();
  expect(requireValue(f.row).querySelector("textarea")).toBe(f.textarea);
  expect(f.commitComment).toHaveBeenCalledOnce();
  expect(requireValue(f.scroller).scrollTo).not.toHaveBeenCalled();
});

test("recovers the live annotation when saving replaces the edited row", async () => {
  const f = await setup({top:400});
  let replacement: ((HTMLDivElement)) | undefined;
  f.adapter.commitComment = vi.fn((id, source: string) => {
    replacement = document.createElement("div");
    replacement.className = "annotation selected";
    replacement.dataset.sidebarAnnotationId = id;
    replacement.innerHTML = `<div class="comment"><div class="expandable-editor"><div class="content"></div></div></div>`;
    queryElement(replacement, ".content").textContent = source;
    replacement.getBoundingClientRect = requireValue(f.row).getBoundingClientRect;
    requireValue(f.row).replaceWith(replacement);
    return true;
  });
  requireValue(f.textarea).value = "Changed";
  await f.escape(); frame(); frame();
  expect(requireValue(f.row).isConnected).toBe(false);
  expect(requireValue(replacement).querySelector(".annotation-markdown-rendered")?.textContent).toBe("Changed");
  expect(requireValue(f.scroller).scrollTo).toHaveBeenCalledExactlyOnceWith({top:1598,left:0,behavior:"smooth"});
  expect(requireElement(f.scroller, HTMLElement).style.getPropertyValue("overflow-anchor")).toBe("");
});
