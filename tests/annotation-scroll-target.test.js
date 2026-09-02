import { afterEach, expect, test, vi } from "vitest";
import { trackAnnotationScrollTarget } from "../src/annotation-scroll-target.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";

const marker = "data-annotation-markdown-scroll-target";
const margin = "--annotation-markdown-scroll-margin-bottom";
let stop;
afterEach(() => { stop?.(); document.body.innerHTML = ""; });

function setup({ prepareRow = vi.fn(), enabled = () => true } = {}) {
  document.body.innerHTML = `<div id="annotations" style="overflow-y:auto">
    <div data-sidebar-annotation-id="a" class="annotation selected"><div class="comment">a</div></div>
    <div data-sidebar-annotation-id="b" class="annotation"><div class="comment">b</div></div>
  </div>`;
  const scroller = document.querySelector("#annotations");
  Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 300 });
  const rows = [...scroller.children];
  for (const row of rows) row.getBoundingClientRect = () => ({ height: 900 });
  const observed = new Set();
  let resize;
  class ResizeObserver {
    constructor(callback) { resize = callback; }
    observe(node) { observed.add(node); }
    disconnect() { observed.clear(); }
  }
  stop = trackAnnotationScrollTarget({ document, MutationObserver: window.MutationObserver,
    ResizeObserver, prepareRow, isEnabled: enabled });
  return { rows, scroller, prepareRow, observed, resize: () => resize([]) };
}

test("prepares only the selected row and gives native nearest a viewport-sized target", () => {
  const { rows, prepareRow, observed } = setup();
  expect(prepareRow).toHaveBeenCalledExactlyOnceWith(rows[0]);
  expect(rows[0].hasAttribute(marker)).toBe(true);
  expect(rows[0].style.getPropertyValue(margin)).toBe("-600px");
  expect(rows[1].hasAttribute(marker)).toBe(false);
  expect(observed.size).toBe(2);
});

test("switches selection before the native timer, without scrolling or changing native methods", async () => {
  const native = window.Element.prototype.scrollIntoView;
  const { rows, scroller, prepareRow } = setup();
  scroller.scrollTo = vi.fn();
  rows[0].classList.remove("selected"); rows[1].classList.add("selected");
  await Promise.resolve();
  expect(rows[0].hasAttribute(marker)).toBe(false);
  expect(rows[1].hasAttribute(marker)).toBe(true);
  expect(prepareRow).toHaveBeenCalledTimes(2);
  expect(scroller.scrollTo).not.toHaveBeenCalled();
  expect(window.Element.prototype.scrollIntoView).toBe(native);
});

test("remeasures row and viewport sizes, and leaves short rows native", () => {
  const { rows, scroller, resize, prepareRow } = setup();
  rows[0].getBoundingClientRect = () => ({ height: 1100 }); resize();
  expect(rows[0].style.getPropertyValue(margin)).toBe("-800px");
  Object.defineProperty(scroller, "clientHeight", { value: 500 }); resize();
  expect(rows[0].style.getPropertyValue(margin)).toBe("-600px");
  rows[0].getBoundingClientRect = () => ({ height: 200 }); resize();
  expect(rows[0].hasAttribute(marker)).toBe(false);
  expect(prepareRow).toHaveBeenCalledTimes(1);
});

test("removes the target while editing and does not render on editor mutations", async () => {
  const { rows, prepareRow } = setup();
  const comment = rows[0].querySelector(".comment");
  comment.classList.add("annotation-markdown-editing");
  await Promise.resolve();
  expect(rows[0].hasAttribute(marker)).toBe(false);
  comment.append(document.createElement("textarea"));
  await Promise.resolve();
  expect(prepareRow).toHaveBeenCalledTimes(1);
  comment.classList.remove("annotation-markdown-editing");
  await Promise.resolve();
  expect(rows[0].hasAttribute(marker)).toBe(true);
});

test("does not apply to multiple selected rows, popups, or native notes", async () => {
  const { rows } = setup();
  rows[1].classList.add("selected"); await Promise.resolve();
  expect(document.querySelector(`[${marker}]`)).toBeNull();
  rows[0].classList.remove("selected");
  rows[1].classList.add("note-editor"); await Promise.resolve();
  expect(rows[1].hasAttribute(marker)).toBe(false);
  rows[1].classList.replace("note-editor", "annotation-popup"); await Promise.resolve();
  expect(rows[1].hasAttribute(marker)).toBe(false);
});

test("cleans replaced rows, disable, and shutdown without overwriting host margins", async () => {
  let enabled = true;
  const { rows, scroller, resize, observed } = setup({ enabled: () => enabled });
  rows[0].style.scrollMarginTop = "12px";
  rows[0].style.scrollMarginBottom = "15px";
  const next = rows[0].cloneNode(true);
  next.getBoundingClientRect = () => ({ height: 900 });
  rows[0].replaceWith(next); await Promise.resolve();
  expect(rows[0].hasAttribute(marker)).toBe(false);
  expect(next.hasAttribute(marker)).toBe(true);
  enabled = false; resize();
  expect(next.hasAttribute(marker)).toBe(false);
  enabled = true; resize();
  expect(next.hasAttribute(marker)).toBe(true);
  stop();
  expect(observed.size).toBe(0);
  expect(scroller.querySelector(`[${marker}]`)).toBeNull();
  expect(next.style.scrollMarginTop).toBe("12px");
  expect(next.style.scrollMarginBottom).toBe("15px");
  expect(next.style.getPropertyValue(margin)).toBe("");
});

test("ignores unrelated document mutations", async () => {
  const { prepareRow } = setup();
  document.body.append(document.createElement("button")); await Promise.resolve();
  expect(prepareRow).toHaveBeenCalledTimes(1);
});

test("finishes selected lazy rendering before measuring, without rendering its neighbors", async () => {
  const { rows } = setup();
  stop();
  rows[0].classList.remove("selected");
  rows[0].getBoundingClientRect = () => ({ height: rows[0].querySelector(".annotation-markdown-rendered") ? 900 : 72 });
  const render = vi.fn(source => `<p>${source}</p>`);
  class ResizeObserver { observe() {} disconnect() {} }
  class IntersectionObserver { observe() {} disconnect() {} }
  const original = window.ResizeObserver;
  window.ResizeObserver = ResizeObserver;
  const controller = createReaderController({ reader: { document }, adapter: createAnnotationSidebarAdapter({document}),
    renderer: { render }, settings: { isEnabled: () => true }, MutationObserver: window.MutationObserver, IntersectionObserver });
  try {
    await controller.start();
    expect(render).not.toHaveBeenCalled();
    rows[0].classList.add("selected"); await Promise.resolve();
    expect(render).toHaveBeenCalledExactlyOnceWith("a");
    expect(rows[0].style.getPropertyValue(margin)).toBe("-600px");
    expect(rows[1].querySelector(".annotation-markdown-rendered")).toBeNull();
  } finally { controller.stop(); window.ResizeObserver = original; }
});
