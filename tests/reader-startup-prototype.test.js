import vm from "node:vm";
import { afterEach, expect, test, vi } from "vitest";
import { createStartupProbeSource } from "../scripts/prototypes/reader-startup-page.mjs";

let probe;
afterEach(() => { probe?.stop(); probe = undefined; document.body.innerHTML = ""; });

function fixture() {
  document.body.innerHTML = '<div id="annotations" class="annotations"><div class="annotation" data-sidebar-annotation-id="a"></div></div>';
  document.querySelector(".annotation").getBoundingClientRect = () => ({ height: 120 });
  function SidebarPreview() {}
  function Annotation(props) { return { marker: "data-sidebar-annotation-id", SidebarPreview, props }; }
  const memo = { $$typeof: Symbol.for("react.memo"), type: Annotation };
  const annotation = { id: "a", type: "note", text: "example", comment: "source", tags: [], position: {} };
  const React = {
    version: "18.3.1", createElement: vi.fn((type, props) => ({ type, props })),
    useState: initial => [typeof initial === "function" ? initial() : initial, vi.fn()],
    useRef: () => ({ current: null }), useEffect() {}, useLayoutEffect() {}
  };
  const page = {
    document, React, ReactDOM: { flushSync: callback => callback() },
    performance: { now: () => 0 }, devicePixelRatio: 1,
    getComputedStyle: window.getComputedStyle.bind(window), MutationObserver: window.MutationObserver,
    Event: window.Event,
    setInterval: vi.fn(() => 1), clearInterval: vi.fn(), setTimeout: vi.fn(), clearTimeout: vi.fn(),
    requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn(), createReader: vi.fn(options => ({ options }))
  };
  page.window = page;
  function install(mode, cache, layoutToken = "same", eagerViewport = false, stableScroll = false) {
    probe = vm.runInNewContext(createStartupProbeSource({ mode, cache, layoutToken, eagerViewport, stableScroll }), page);
    const factoryOptions = { sidebarWidth: 240, fontSize: 12, type: "epub", annotations: [annotation] };
    page.createReader(factoryOptions);
    page.React.createElement(memo, { annotation, isSelected: false });
    return factoryOptions;
  }
  function cache() {
    install("baseline");
    const snapshot = probe.snapshot();
    probe.stop();
    return snapshot;
  }
  return { page, memo, annotation, Annotation, install, cache };
}

test("installs before Reader creation while preserving the complete annotation input", () => {
  const f = fixture();
  const originalFactory = f.page.createReader;
  const originalElement = f.page.React.createElement;
  const options = f.install("baseline");
  expect(options.annotations).toEqual([f.annotation]);
  expect(f.memo.type).toBe(f.Annotation);
  expect(probe.summary().nativeElementsRequested).toBe(1);
  probe.stop();
  expect(f.page.createReader).toBe(originalFactory);
  expect(f.page.React.createElement).toBe(originalElement);
  expect(f.page.__AMStartupProbe).toBeUndefined();
});

test("rejects an already initialized Reader and an unsupported React realm", () => {
  const f = fixture();
  f.page._reader = {};
  expect(() => f.install("baseline")).toThrow("too late");
  delete f.page._reader;
  f.page.React.version = "19.0.0";
  expect(() => f.install("baseline")).toThrow("Unsupported Reader");
});

test("uses measured heights on reopen and restores the patched native memo", () => {
  const f = fixture();
  const cache = f.cache();
  f.install("cached-rows", cache);
  const shell = f.memo.type({ annotation: f.annotation, isSelected: false });
  expect(shell.type).toBe("div");
  expect(shell.props.style.height).toBe("120px");
  expect(shell.props["data-sidebar-annotation-id"]).toBe("a");
  expect(probe.summary().cacheCompatible).toBe(true);
  expect(JSON.stringify(probe.summary())).not.toContain("source");
  probe.stop();
  expect(f.memo.type).toBe(f.Annotation);
});

test.each(["layout", "content", "selection"])("keeps a native row when %s invalidates a placeholder", reason => {
  const f = fixture();
  const cache = f.cache();
  if (reason === "content") f.annotation.comment = "changed content";
  f.install("cached-rows", cache, reason === "layout" ? "changed" : "same");
  const element = f.memo.type({ annotation: f.annotation, isSelected: reason === "selection" });
  expect(element.type).toBe(f.Annotation);
  expect(probe.summary().deferredRows).toBe(0);
});

test.each([[0, false], [5000, true]])("eager startup materializes a measured row at %s before observation", (top, deferred) => {
  const f = fixture();
  const cache = f.cache();
  cache.items.a.top = top;
  f.install("cached-rows", cache, "same", true);
  const element = f.memo.type({ annotation: f.annotation, isSelected: false });
  expect(element.type).toBe(deferred ? "div" : f.Annotation);
  expect(probe.summary().deferredRows).toBe(deferred ? 1 : 0);
});

function observedFixture(setter = vi.fn()) {
  const f = fixture();
  const cache = f.cache();
  const root = document.getElementById("annotations");
  const row = root.firstElementChild;
  const tasks = [];
  let callback;
  let now = 0;
  f.page.IntersectionObserver = class {
    constructor(handler) { callback = handler; }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  f.page.setTimeout = vi.fn((callback, delay) => { tasks.push({ callback, delay }); return tasks.length; });
  f.page.performance.now = () => now;
  f.page.React.useState = initial => [typeof initial === "function" ? initial() : initial, setter];
  f.page.React.useRef = () => ({ current: row });
  f.page.React.useEffect = effect => effect();
  f.install("cached-rows", cache, "same", false, true);
  f.memo.type({ annotation: f.annotation, isSelected: false });
  return { ...f, root, row, setter, tasks,
    intersection: visible => callback([{ target: row, isIntersecting: visible }]),
    setTime: value => { now = value; } };
}

test("drops queued work when a scrolling row leaves the observed range", () => {
  const f = observedFixture();
  f.intersection(true);
  f.intersection(false);
  f.tasks.shift().callback();
  expect(f.setter).not.toHaveBeenCalled();
});

test("waits for scrolling to stop before mounting queued content", () => {
  const f = observedFixture();
  f.root.dispatchEvent(new Event("scroll"));
  f.intersection(true);
  f.tasks.shift().callback();
  expect(f.setter).not.toHaveBeenCalled();
  expect(f.tasks[0].delay).toBe(120);
  f.setTime(200);
  f.tasks.shift().callback();
  expect(f.setter).toHaveBeenCalledWith(true);
});

test("preserves the visible row when an earlier preview changes height and restores anchoring on stop", () => {
  let growth = 0;
  const f = observedFixture(vi.fn(() => { growth = 40; }));
  const anchor = document.createElement("div");
  anchor.className = "annotation";
  anchor.dataset.sidebarAnnotationId = "b";
  f.root.append(anchor);
  f.root.scrollTop = 200;
  f.root.style.overflowAnchor = "auto";
  f.root.getBoundingClientRect = () => ({ top: 80, bottom: 680 });
  f.row.getBoundingClientRect = () => ({ top: -50, bottom: 70 });
  anchor.getBoundingClientRect = () => ({ top: 300 + growth - f.root.scrollTop, bottom: 360 + growth - f.root.scrollTop });
  f.intersection(true);
  f.tasks.shift().callback();
  expect(f.root.scrollTop).toBe(240);
  expect(anchor.getBoundingClientRect().top).toBe(100);
  probe.stop();
  expect(f.root.style.overflowAnchor).toBe("auto");
  expect(f.page.cancelAnimationFrame).toHaveBeenCalledWith(1);
});
