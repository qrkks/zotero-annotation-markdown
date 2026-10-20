import type { FixtureIntersectionCallback } from "./helpers/observers.ts";
import vm from "node:vm";
import { afterEach, expect, test, vi } from "vitest";
import { createStartupProbeSource } from "../scripts/prototypes/reader-startup-page.mjs";
import { fixtureRect, queryElement, requireElement, requireValue } from "./helpers/dom.ts";

interface FixtureProps {
  [key: string]: unknown;
  style?: Record<string, string>;
  ref?: { current: Element | null };
  className?: string;
}
interface FixtureElement { type?: unknown; props: FixtureProps; marker?: string; SidebarPreview?: () => void; }
function vmPage<T extends object>(value: T): T & { window: T; _reader?: object; __AMStartupProbe?: unknown; __annotationMarkdownNativeRowLazyV1?: unknown; eval?: (code: string) => unknown } {
  return Object.assign(value, { window: value });
}

interface ProbeCache { items: Record<string, { top: number }>; }
interface StartupProbe { stop(): void; snapshot(): ProbeCache; summary(): {nativeElementsRequested: number; cacheCompatible: boolean; deferredRows: number}; }

let probe: StartupProbe | undefined;
afterEach(() => { probe?.stop(); probe = undefined; document.body.innerHTML = ""; });

function fixture() {
  document.body.innerHTML = '<div id="annotations" class="annotations"><div class="annotation" data-sidebar-annotation-id="a"></div></div>';
  queryElement(document, ".annotation").getBoundingClientRect = () => (fixtureRect({ height: 120 }));
  function SidebarPreview() {}
  function Annotation(props: FixtureProps): FixtureElement { return { marker: "data-sidebar-annotation-id", SidebarPreview, props }; }
  const memo = { $$typeof: Symbol.for("react.memo"), type: Annotation };
  const annotation = { id: "a", type: "note", text: "example", comment: "source", tags: [], position: {} };
  const React = {
    version: "18.3.1", createElement: vi.fn((type: unknown, props: FixtureProps): FixtureElement => ({ type, props })),
    useState: (initial: boolean | (() => boolean)): [boolean, ReturnType<typeof vi.fn>] => [typeof initial === "function" ? initial() : initial, vi.fn()],
    useRef: (): {current: Element | null} => ({ current: null }), useEffect(_effect: () => void | (() => void)) {}, useLayoutEffect(_effect: () => void | (() => void)) {}
  };
  const page = vmPage({
    document, React, ReactDOM: { flushSync: (callback: () => void) => callback() },
    performance: { now: (): number => 0 }, devicePixelRatio: 1,
    getComputedStyle: window.getComputedStyle.bind(window), MutationObserver: window.MutationObserver,
    Event: window.Event,
    setInterval: vi.fn(() => 1), clearInterval: vi.fn(), setTimeout: vi.fn((_callback: () => void, _delay: number): number => 0), clearTimeout: vi.fn(),
    requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn(), createReader: vi.fn((options: unknown) => ({ options })),
    IntersectionObserver: class { constructor(_handler: FixtureIntersectionCallback) {} }
  });
  function install(mode: string, cache?: ProbeCache, layoutToken = "same", eagerViewport = false, stableScroll = false) {
    probe = vm.runInNewContext(createStartupProbeSource({ mode, cache, layoutToken, eagerViewport, stableScroll }), page);
    const factoryOptions = { sidebarWidth: 240, fontSize: 12, type: "epub", annotations: [annotation] };
    page.createReader(factoryOptions);
    page.React.createElement(memo, { annotation, isSelected: false });
    return factoryOptions;
  }
  function cache() {
    install("baseline");
    const snapshot = requireValue(probe).snapshot();
    requireValue(probe).stop();
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
  expect(requireValue(probe).summary().nativeElementsRequested).toBe(1);
  requireValue(probe).stop();
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
  expect(requireValue(shell.props.style).height).toBe("120px");
  expect(shell.props["data-sidebar-annotation-id"]).toBe("a");
  expect(requireValue(probe).summary().cacheCompatible).toBe(true);
  expect(JSON.stringify(requireValue(probe).summary())).not.toContain("source");
  requireValue(probe).stop();
  expect(f.memo.type).toBe(f.Annotation);
});

test.each(["layout", "content", "selection"] as const)("keeps a native row when %s invalidates a placeholder", reason => {
  const f = fixture();
  const cache = f.cache();
  if (reason === "content") f.annotation.comment = "changed content";
  f.install("cached-rows", cache, reason === "layout" ? "changed" : "same");
  const element = f.memo.type({ annotation: f.annotation, isSelected: reason === "selection" });
  expect(element.type).toBe(f.Annotation);
  expect(requireValue(probe).summary().deferredRows).toBe(0);
});

test.each([[0, false], [5000, true]] as const)("eager startup materializes a measured row at %s before observation", (top, deferred) => {
  const f = fixture();
  const cache = f.cache();
  cache.items.a.top = top;
  f.install("cached-rows", cache, "same", true);
  const element = f.memo.type({ annotation: f.annotation, isSelected: false });
  expect(element.type).toBe(deferred ? "div" : f.Annotation);
  expect(requireValue(probe).summary().deferredRows).toBe(deferred ? 1 : 0);
});

function observedFixture(setter = vi.fn()) {
  const f = fixture();
  const cache = f.cache();
  const root = document.getElementById("annotations");
  const row = requireValue(root).firstElementChild;
  const tasks: Array<{callback: () => void; delay: number}> = [];
  let callback: FixtureIntersectionCallback | undefined;
  let now = 0;
  f.page.IntersectionObserver = class {
    constructor(handler: FixtureIntersectionCallback) { callback = handler; }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  f.page.setTimeout = vi.fn((callback, delay) => { tasks.push({ callback, delay }); return tasks.length; });
  f.page.performance.now = () => now;
  f.page.React.useState = initial => [typeof initial === "function" ? initial() : initial, setter];
  f.page.React.useRef = () => ({ current: requireElement(row, Element) });
  f.page.React.useEffect = effect => effect();
  f.install("cached-rows", cache, "same", false, true);
  f.memo.type({ annotation: f.annotation, isSelected: false });
  return { ...f, root, row, setter, tasks,
    intersection: (visible: boolean) => requireValue(callback)([{ target: requireValue(row), isIntersecting: visible }]),
    setTime: (value: number) => { now = value; } };
}

test("drops queued work when a scrolling row leaves the observed range", () => {
  const f = observedFixture();
  f.intersection(true);
  f.intersection(false);
  requireValue(f.tasks.shift()).callback();
  expect(f.setter).not.toHaveBeenCalled();
});

test("waits for scrolling to stop before mounting queued content", () => {
  const f = observedFixture();
  requireValue(f.root).dispatchEvent(new Event("scroll"));
  f.intersection(true);
  requireValue(f.tasks.shift()).callback();
  expect(f.setter).not.toHaveBeenCalled();
  expect(f.tasks[0].delay).toBe(120);
  f.setTime(200);
  requireValue(f.tasks.shift()).callback();
  expect(f.setter).toHaveBeenCalledWith(true);
});

test("preserves the visible row when an earlier preview changes height and restores anchoring on stop", () => {
  let growth = 0;
  const f = observedFixture(vi.fn(() => { growth = 40; }));
  const anchor = document.createElement("div");
  anchor.className = "annotation";
  anchor.dataset.sidebarAnnotationId = "b";
  requireValue(f.root).append(anchor);
  requireValue(f.root).scrollTop = 200;
  requireValue(f.root).style.overflowAnchor = "auto";
  requireValue(f.root).getBoundingClientRect = () => (fixtureRect({ top: 80, bottom: 680 }));
  requireValue(f.row).getBoundingClientRect = () => (fixtureRect({ top: -50, bottom: 70 }));
  anchor.getBoundingClientRect = () => (fixtureRect({ top: 300 + growth - requireValue(f.root).scrollTop, bottom: 360 + growth - requireValue(f.root).scrollTop }));
  f.intersection(true);
  requireValue(f.tasks.shift()).callback();
  expect(requireValue(f.root).scrollTop).toBe(240);
  expect(anchor.getBoundingClientRect().top).toBe(100);
  requireValue(probe).stop();
  expect(requireValue(f.root).style.overflowAnchor).toBe("auto");
  expect(f.page.cancelAnimationFrame).toHaveBeenCalledWith(1);
});
