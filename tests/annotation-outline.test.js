import { afterEach, expect, test, vi } from "vitest";

import { trackAnnotationOutline } from "../src/annotation-outline.ts";

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
  viewportWidth = 800,
  viewportHeight = 700,
  scrollerRect = { left: 20, top: 60, right: 320, bottom: 660, width: 300, height: 600 }
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
  const setExpanded = vi.fn(value => { expanded = value; });
  controller = trackAnnotationOutline({
    document,
    MutationObserver: window.MutationObserver,
    isEnabled: () => enabled,
    isExpanded: () => expanded,
    setExpanded
  });
  return {
    rows: [...document.querySelectorAll(".annotation")],
    scroller,
    setExpanded,
    getExpanded: () => expanded
  };
}

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
});

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
