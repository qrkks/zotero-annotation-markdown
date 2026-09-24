import { afterEach, expect, test, vi } from "vitest";

import { trackAnnotationOutline } from "../src/annotation-outline.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";

let controller;
afterEach(() => {
  controller?.stop();
  controller = undefined;
  document.documentElement.lang = "";
  document.body.innerHTML = "";
});

function setup({
  initialExpanded = false,
  enabled = true,
  fontScale = 1,
  viewportWidth = 800,
  viewportHeight = 700,
  scrollerRect = { left: 20, top: 60, right: 320, bottom: 660, width: 300, height: 600 },
  MutationObserverRef = window.MutationObserver
} = {}) {
  document.documentElement.lang = "zh-CN";
  document.body.innerHTML = `<section id="annotation-tab-panel">
    <div id="annotations" style="overflow-y:auto">
      <div data-sidebar-annotation-id="a" class="annotation selected">
        <div class="comment"><div class="content">source a</div><div class="annotation-markdown-rendered" data-annotation-markdown-preview="true"><h1>第一章</h1><p>内容</p><h2>细节</h2></div></div>
      </div>
      <div data-sidebar-annotation-id="b" class="annotation">
        <div class="comment"><div class="content">source b</div><div class="annotation-markdown-rendered" data-annotation-markdown-preview="true"><h1>第二章</h1><h2>结论</h2><h3>限制</h3></div></div>
      </div>
    </div>
  </section>`;
  const scroller = document.querySelector("#annotations");
  scroller.getBoundingClientRect = () => scrollerRect;
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: viewportWidth });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: viewportHeight });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: viewportWidth });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: viewportHeight });
  let expanded = initialExpanded;
  let currentFontScale = fontScale;
  const setExpanded = vi.fn(value => { expanded = value; });
  controller = trackAnnotationOutline({
    document,
    MutationObserver: MutationObserverRef,
    isEnabled: () => enabled,
    isExpanded: () => expanded,
    setExpanded,
    getFontScale: () => currentFontScale
  });
  return {
    rows: [...document.querySelectorAll(".annotation")],
    scroller,
    setExpanded,
    getExpanded: () => expanded,
    setFontScale(value) {
      currentFontScale = value;
      controller.sync();
    }
  };
}

test("ignores outline-owned style mutations instead of scheduling a render loop", () => {
  let mutationCallback;
  const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
    mutationCallback = callback;
    return { observe: vi.fn(), disconnect: vi.fn() };
  });
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = vi.fn(() => 1);

  try {
    const { scroller } = setup({ MutationObserverRef: FakeMutationObserver });
    const outline = document.querySelector("[data-annotation-markdown-outline='true']");

    mutationCallback([{
      type: "attributes",
      attributeName: "style",
      target: outline,
      addedNodes: [],
      removedNodes: []
    }]);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    mutationCallback([{
      type: "attributes",
      attributeName: "style",
      target: scroller,
      addedNodes: [],
      removedNodes: []
    }]);
    expect(window.requestAnimationFrame).toHaveBeenCalledOnce();
  } finally {
    controller?.stop();
    controller = undefined;
    window.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

async function flushMutations() {
  await Promise.resolve();
  await Promise.resolve();
}

test("creates a collapsed outline only for one selected preview with multiple headings", () => {
  setup();
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");
  const toggle = outline.querySelector(".annotation-markdown-outline-toggle");
  const items = [...outline.querySelectorAll(".annotation-markdown-outline-item")];

  expect(toggle.textContent).toBe("大纲 · 2");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(outline.querySelector(".annotation-markdown-outline-panel").hidden).toBe(true);
  expect(items.map(item => item.textContent)).toEqual(["第一章", "细节"]);
  expect(items.map(item => item.dataset.level)).toEqual(["1", "2"]);
  expect(document.querySelectorAll("[data-annotation-markdown-outline='true']")).toHaveLength(1);
  expect(outline.parentElement).toBe(document.body);
  expect(outline.dataset.side).toBe("right");
  expect(outline.style.left).toBe("326px");
  expect(outline.style.top).toBe("68px");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("224px");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-font-size")).toBe("0.85em");
});

test("clones visible KaTeX DOM and preserves source TeX in tooltips", () => {
  setup();
  const rendered = document.createElement("div");
  rendered.innerHTML = createMarkdownRenderer({ windowRef: window })
    .render("## [它就是课本上的](https://example.com) $A^{-1}XA=\\Lambda X$ 吗？");
  const heading = rendered.querySelector("h2");
  const sourceKatex = heading.querySelector(".katex");
  expect(heading.querySelector("a")).not.toBeNull();
  expect(heading.querySelector(".katex-mathml")).not.toBeNull();
  expect(heading.querySelector(".katex-html")).not.toBeNull();
  expect(heading.textContent).toContain("\\Lambda");
  document.querySelector(".annotation.selected h2").replaceWith(heading);
  controller.sync();

  const item = document.querySelectorAll(".annotation-markdown-outline-item")[1];
  const outlineKatex = item.querySelector(".katex");
  expect(item.textContent).toBe("它就是课本上的 A−1XA=ΛX 吗？");
  expect(item.title).toBe("它就是课本上的 $A^{-1}XA=\\Lambda X$ 吗？");
  expect(item.getAttribute("aria-label")).toBe(item.textContent);
  expect(item.querySelector("a")).toBeNull();
  expect(outlineKatex).not.toBeNull();
  expect(outlineKatex).not.toBe(sourceKatex);
  expect(outlineKatex.querySelector(".katex-html")).not.toBeNull();
  expect(outlineKatex.querySelector(".katex-mathml")).toBeNull();
  expect(outlineKatex.querySelector("annotation[encoding='application/x-tex']")).toBeNull();
  expect(heading.querySelector(".katex-mathml")).not.toBeNull();
});

test("resizes the outline text and available panel width on a live preference change", async () => {
  const { setFontScale } = setup({ viewportWidth: 420, initialExpanded: true });
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");

  setFontScale(1.5);
  await nextFrame();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBe(outline);
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-font-size")).toBe("1.275em");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("280px");
  expect(outline.querySelector(".annotation-markdown-outline-panel").hidden).toBe(false);

  setFontScale(2);
  await nextFrame();
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-font-size")).toBe("1.7em");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("290px");

  setFontScale(0.8);
  await nextFrame();
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-font-size")).toBe("0.68em");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("224px");
});

test("caps the enlarged outline panel width in a wide reader", () => {
  setup({ viewportWidth: 800, fontScale: 2 });
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("320px");
});

function nextFrame() {
  return new Promise(resolve => {
    if (window.requestAnimationFrame) window.requestAnimationFrame(resolve);
    else setTimeout(resolve, 0);
  });
}

test("falls back inside to the left while reserving the sidebar scrollbar", () => {
  setup({ viewportWidth: 420 });
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");

  expect(outline.dataset.side).toBe("left");
  expect(outline.style.left).toBe("298px");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("224px");
});

test("keeps the portal mounted at the sidebar viewport while the selected row scrolls away", () => {
  const { rows, scroller } = setup({ initialExpanded: true });
  rows[0].getBoundingClientRect = () => ({ top: -900, bottom: -300 });
  scroller.dispatchEvent(new Event("scroll"));

  const outline = document.querySelector("[data-annotation-markdown-outline='true']");
  expect(outline).not.toBeNull();
  expect(outline.parentElement).toBe(document.body);
  expect(outline.style.top).toBe("68px");
  expect(outline.querySelector(".annotation-markdown-outline-panel").hidden).toBe(false);
});

test("persists explicit open and close choices across selected annotations", async () => {
  const { rows, setExpanded, getExpanded } = setup();
  document.querySelector(".annotation-markdown-outline-toggle").click();
  expect(setExpanded).toHaveBeenCalledWith(true);
  expect(getExpanded()).toBe(true);
  expect(document.querySelector(".annotation-markdown-outline-panel").hidden).toBe(false);

  rows[0].classList.remove("selected");
  rows[1].classList.add("selected");
  await flushMutations();
  expect(document.querySelector(".annotation-markdown-outline-toggle").textContent).toBe("大纲 · 3");
  expect(document.querySelector(".annotation-markdown-outline-toggle").getAttribute("aria-expanded")).toBe("true");

  document.querySelector(".annotation-markdown-outline-toggle").click();
  expect(setExpanded).toHaveBeenLastCalledWith(false);
  rows[1].classList.remove("selected");
  rows[0].classList.add("selected");
  await flushMutations();
  expect(document.querySelector(".annotation-markdown-outline-toggle").getAttribute("aria-expanded")).toBe("false");
});

test("temporarily hides during editing without changing the stored choice", async () => {
  const { rows, setExpanded } = setup({ initialExpanded: true });
  rows[0].querySelector(".comment").classList.add("annotation-markdown-fast-editing");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
  expect(setExpanded).not.toHaveBeenCalled();

  rows[0].querySelector(".comment").classList.remove("annotation-markdown-fast-editing");
  await flushMutations();
  expect(document.querySelector(".annotation-markdown-outline-toggle").getAttribute("aria-expanded")).toBe("true");
  expect(setExpanded).not.toHaveBeenCalled();
});

test("prepares a popup outline only when the stable popup is about to reveal", async () => {
  const { setExpanded } = setup({ initialExpanded: true });
  document.body.insertAdjacentHTML("beforeend", `<div class="annotation-popup" data-annotation-markdown-popup-positioning="true">
    <div class="preview"><div class="comment">
      <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true" style="overflow-y:auto">
        <h1>弹窗第一章</h1><p>内容</p><h2>弹窗细节</h2>
      </div>
    </div></div>
  </div>`);
  const popup = document.querySelector(".annotation-popup");
  const preview = popup.querySelector("[data-annotation-markdown-preview='true']");
  popup.getBoundingClientRect = () => ({
    left: 100, top: 90, right: 500, bottom: 390, width: 400, height: 300
  });
  Object.defineProperty(preview, "clientHeight", { configurable: true, value: 200 });
  Object.defineProperty(preview, "scrollHeight", { configurable: true, value: 600 });
  preview.getBoundingClientRect = () => ({
    left: 110, top: 100, right: 490, bottom: 300, width: 380, height: 200
  });
  await flushMutations();

  const popupOutline = popup.querySelector("[data-annotation-markdown-outline='true']");
  expect(popupOutline).toBeNull();
  expect(document.body.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  controller.preparePopup(popup);
  const preparedOutline = document.body.querySelector("[data-annotation-markdown-outline='true']");
  expect(preparedOutline).not.toBeNull();
  expect(preparedOutline.parentElement).toBe(document.body);
  expect(preparedOutline.hidden).toBe(true);
  const outlineBeforeReveal = preparedOutline;
  const outline = outlineBeforeReveal;
  expect(outline.dataset.context).toBe("popup");
  expect(outline.dataset.side).toBe("right");
  expect(outline.style.left).toBe("506px");
  expect(outline.style.top).toBe("98px");
  expect(outline.querySelector(".annotation-markdown-outline-toggle").getAttribute("aria-expanded"))
    .toBe("true");
  expect(outline.querySelector(".annotation-markdown-outline-panel").hidden).toBe(false);

  popup.removeAttribute("data-annotation-markdown-popup-positioning");
  popup.setAttribute("data-annotation-markdown-popup-ready", "true");
  controller.sync();
  expect(document.body.querySelector("[data-annotation-markdown-outline='true']")).toBe(outlineBeforeReveal);
  expect(outlineBeforeReveal.hidden).toBe(false);

  const hostOutsidePointer = vi.fn();
  window.addEventListener("mousedown", hostOutsidePointer);
  const pointer = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  outlineBeforeReveal.querySelector(".annotation-markdown-outline-toggle").dispatchEvent(pointer);
  window.removeEventListener("mousedown", hostOutsidePointer);
  expect(pointer.defaultPrevented).toBe(true);
  expect(hostOutsidePointer).not.toHaveBeenCalled();

  outline.querySelector(".annotation-markdown-outline-toggle").click();
  expect(outline.querySelector(".annotation-markdown-outline-panel").hidden).toBe(true);
  expect(setExpanded).toHaveBeenCalledWith(false);
});

test("scrolls the popup preview and cleans the outline while positioning or editing", async () => {
  setup();
  document.body.insertAdjacentHTML("beforeend", `<div class="annotation-popup" data-annotation-markdown-popup-ready="true">
    <div class="preview"><div class="comment">
      <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true" style="overflow-y:auto">
        <h1>弹窗第一章</h1><p>内容</p><h2>弹窗细节</h2>
      </div>
    </div></div>
  </div>`);
  const popup = document.querySelector(".annotation-popup");
  const comment = popup.querySelector(".comment");
  const preview = popup.querySelector("[data-annotation-markdown-preview='true']");
  popup.getBoundingClientRect = () => ({
    left: 100, top: 90, right: 500, bottom: 390, width: 400, height: 300
  });
  Object.defineProperties(preview, {
    clientHeight: { configurable: true, value: 200 },
    scrollHeight: { configurable: true, value: 600 },
    scrollTop: { configurable: true, writable: true, value: 40 }
  });
  preview.getBoundingClientRect = () => ({
    left: 110, top: 100, right: 490, bottom: 300, width: 380, height: 200
  });
  preview.scrollTo = vi.fn();
  preview.querySelector("h2").getBoundingClientRect = () => ({ top: 250 });
  await flushMutations();

  document.querySelectorAll(".annotation-markdown-outline-item")[1].click();
  expect(preview.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 182, behavior: "smooth" });

  popup.removeAttribute("data-annotation-markdown-popup-ready");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  popup.setAttribute("data-annotation-markdown-popup-ready", "true");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).not.toBeNull();

  comment.classList.add("annotation-markdown-fast-editing");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
});

test("does not replace the sidebar outline for a non-overflowing ready popup", async () => {
  setup();
  document.body.insertAdjacentHTML("beforeend", `<div class="annotation-popup" data-annotation-markdown-popup-ready="true">
    <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true" style="overflow-y:auto">
      <h1>短弹窗</h1><h2>无需导航</h2>
    </div>
  </div>`);
  const popup = document.querySelector(".annotation-popup");
  const preview = popup.querySelector("[data-annotation-markdown-preview='true']");
  popup.getBoundingClientRect = () => ({
    left: 100, top: 90, right: 500, bottom: 290, width: 400, height: 200
  });
  Object.defineProperties(preview, {
    clientHeight: { configurable: true, value: 160 },
    scrollHeight: { configurable: true, value: 160 }
  });
  preview.getBoundingClientRect = () => ({
    left: 110, top: 100, right: 490, bottom: 260, width: 380, height: 160
  });
  await flushMutations();

  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
});

test("hides when the annotation tab is not visible while a page popup is open", async () => {
  const { scroller, setExpanded } = setup({ initialExpanded: true });
  const panel = document.querySelector("#annotation-tab-panel");
  document.body.insertAdjacentHTML("beforeend", `<div class="annotation-popup">
    <div class="annotation selected">
      <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true"><h1>页内</h1><h2>弹窗</h2></div>
    </div>
  </div>`);

  panel.setAttribute("aria-hidden", "true");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  panel.removeAttribute("aria-hidden");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  document.querySelector(".annotation-popup").remove();
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).not.toBeNull();

  panel.style.display = "none";
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  panel.style.display = "";
  scroller.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0
  });
  panel.classList.add("inactive");
  await flushMutations();

  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
  expect(setExpanded).not.toHaveBeenCalled();
});

test("does not create an outline for one heading, multiple selection, or disabled rendering", async () => {
  const { rows } = setup();
  rows[0].querySelector("h2").remove();
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  rows[0].classList.remove("selected");
  rows[1].classList.add("selected");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).not.toBeNull();
  rows[0].classList.add("selected");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  controller.stop();
  controller = undefined;
  setup({ enabled: false });
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
});

test("scrolls only the annotation sidebar to a chosen heading", () => {
  const { scroller } = setup({ initialExpanded: true });
  Object.defineProperty(scroller, "scrollTop", { configurable: true, writable: true, value: 100 });
  scroller.getBoundingClientRect = () => ({ top: 20 });
  scroller.scrollTo = vi.fn();
  const headings = [...document.querySelectorAll("[data-annotation-markdown-preview='true'] h1, [data-annotation-markdown-preview='true'] h2")];
  headings[1].getBoundingClientRect = () => ({ top: 220 });

  document.querySelectorAll(".annotation-markdown-outline-item")[1].click();

  expect(scroller.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 292, behavior: "smooth" });
  expect(document.querySelectorAll(".annotation-markdown-outline-item")[1].getAttribute("aria-current")).toBe("location");
});

test("removes its own UI and heading markers on shutdown", () => {
  setup({ initialExpanded: true });
  expect(document.querySelectorAll("[data-annotation-markdown-outline-target]")).toHaveLength(2);
  controller.stop();
  controller = undefined;
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
  expect(document.querySelector("[data-annotation-markdown-outline-target]")).toBeNull();
});
