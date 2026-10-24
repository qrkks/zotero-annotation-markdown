import type { FixtureIntersectionCallback } from "./helpers/observers.ts";
import vm from "node:vm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { fixtureRect, queryElement, requireElement, requireValue } from "./helpers/dom.ts";
import { NATIVE_ANNOTATION_ROW_LAZY_PAGE_SOURCE, createNativeAnnotationRowLazyController } from "../src/native-annotation-row-lazy.ts";

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

interface NativeRuntime { start(): { active: boolean; cachedRows: number; reason?: string }; stop(): void; status(): { pendingRows: number }; }

interface FixtureFiber { tag: number; type?: unknown; elementType?: unknown; return: { tag: number; type: unknown; elementType: unknown; return?: {tag: number; type: unknown; elementType: unknown} }; }

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

describe("createNativeAnnotationRowLazyController", () => {
  test("stays inactive unless the experimental preference is enabled", () => {
    const pageWindow = { eval: vi.fn() };
    const controller = createNativeAnnotationRowLazyController({
      getPageWindow: () => pageWindow,
      hostVersion: "10.0.3",
      isEnabled: () => false
    });

    controller.refresh();

    expect(pageWindow.eval).not.toHaveBeenCalled();
  });

  test.each(["10.0.3", "10.0.4", "10.0.6", "9.0.0", "10.1.0", undefined] as const)("probes a compatible Reader independently of Zotero version (%s)", hostVersion => {
    const start = vi.fn(() => ({ active: true }));
    const stop = vi.fn();
    const pageWindow = { eval: vi.fn(() => ({ start, stop })) };
    const controller = createNativeAnnotationRowLazyController({
      getPageWindow: () => pageWindow,
      hostVersion,
      isEnabled: () => true
    });

    controller.refresh();

    expect(pageWindow.eval).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
    controller.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  test("cleans up a partially started hook when a newer Reader throws during initialization", () => {
    vi.useFakeTimers();
    const f = compatiblePageFixture(120);
    const originalHtml = document.body.innerHTML;
    const log = vi.fn();
    const warn = vi.fn();
    f.pageWindow.getComputedStyle = () => { throw new Error("layout unavailable"); };
    f.pageWindow.eval = code => vm.runInNewContext(code, f.pageWindow);
    const controller = createNativeAnnotationRowLazyController({
      getPageWindow: () => f.pageWindow,
      hostVersion: "10.0.6",
      isEnabled: () => true,
      logger: { log, warn }
    });

    expect(() => controller.refresh()).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    expect(f.memo.type).toBe(f.original);
    vi.runOnlyPendingTimers();
    expect(f.pageWindow.__annotationMarkdownNativeRowLazyV1).toBeUndefined();
    expect(f.pageWindow.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(document.body.innerHTML).toBe(originalHtml);
    controller.stop();
  });

  test("starts, refreshes, and stops the page-owned runtime", () => {
    const start = vi.fn(() => ({ active: true }));
    const stop = vi.fn();
    const pageWindow = { eval: vi.fn(() => ({ start, stop })) };
    let enabled = true;
    const controller = createNativeAnnotationRowLazyController({
      getPageWindow: () => pageWindow,
      hostVersion: "10.0.3",
      isEnabled: () => enabled
    });

    controller.refresh();
    controller.refresh();
    expect(pageWindow.eval).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();

    enabled = false;
    controller.refresh();
    expect(stop).toHaveBeenCalledOnce();

    controller.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  test("falls back without throwing when the private host shape is unavailable", () => {
    const warn = vi.fn();
    const pageWindow = {
      eval: vi.fn(() => {
        throw new Error("blocked");
      })
    };
    const controller = createNativeAnnotationRowLazyController({
      getPageWindow: () => pageWindow,
      hostVersion: "10.0.3",
      isEnabled: () => true,
      logger: { warn }
    });

    expect(() => controller.refresh()).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      "[annotation-markdown] native row lazy rendering fell back to Zotero",
      expect.any(Error)
    );
  });

  test("retries later when a compatible Reader row is not mounted yet", () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const log = vi.fn();
    let starts = 0;
    const pageWindow = {
      eval: vi.fn(() => ({
        start: () => (++starts === 1
          ? { active: false, reason: "annotation-row" }
          : { active: true }),
        stop
      }))
    };
    const controller = createNativeAnnotationRowLazyController({
      getPageWindow: () => pageWindow,
      hostVersion: "10.0.3",
      isEnabled: () => true,
      logger: { log }
    });

    controller.refresh();
    expect(pageWindow.eval).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(250);

    expect(pageWindow.eval).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      "[annotation-markdown] native row lazy rendering not armed: annotation-row (Zotero 10.0.3)"
    );
    controller.stop();
    expect(stop).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  test("arms when the sidebar mounts after the bounded startup retries expire", async () => {
    vi.useFakeTimers();
    const start = vi.fn(() => document.querySelector("#annotations.annotations .annotation")
      ? { active: true }
      : { active: false, reason: "annotation-row" });
    const pageWindow = { eval: vi.fn(() => ({ start, stop: vi.fn() })) };
    const controller = createNativeAnnotationRowLazyController({
      getPageWindow: () => pageWindow,
      document,
      MutationObserver: window.MutationObserver,
      isEnabled: () => true
    });
    try {
      controller.refresh();
      vi.advanceTimersByTime(6000);
      expect(start).toHaveBeenCalledTimes(21);
      expect(vi.getTimerCount()).toBe(0);

      document.body.innerHTML = '<div class="annotation-popup"><div class="annotation"></div></div>';
      await Promise.resolve();
      expect(start).toHaveBeenCalledTimes(21);

      const sidebar = document.createElement("div");
      sidebar.id = "annotations";
      sidebar.className = "annotations";
      sidebar.innerHTML = '<div class="annotation" data-sidebar-annotation-id="late"></div>';
      document.body.append(sidebar);
      await Promise.resolve();
      expect(start).toHaveBeenCalledTimes(22);
      expect(vi.getTimerCount()).toBe(0);

      sidebar.append(document.createElement("div"));
      await Promise.resolve();
      expect(start).toHaveBeenCalledTimes(22);
    } finally { controller.stop(); }
  });

  test("does not rearm from a late sidebar mount after stopping", async () => {
    vi.useFakeTimers();
    const start = vi.fn(() => ({ active: false, reason: "annotation-row" }));
    const controller = createNativeAnnotationRowLazyController({
      getPageWindow: () => ({ eval: () => ({ start, stop: vi.fn() }) }),
      document,
      MutationObserver: window.MutationObserver,
      isEnabled: () => true
    });
    controller.refresh();
    controller.stop();
    document.body.innerHTML = '<div id="annotations" class="annotations"><div class="annotation"></div></div>';
    await Promise.resolve();
    vi.advanceTimersByTime(6000);
    expect(start).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("native annotation row lazy page runtime", () => {
  test.each([
    ["React version", (f: ReturnType<typeof compatiblePageFixture>) => { f.pageWindow.React.version = "19.0.0"; }, "react-api"],
    ["React hook", (f: ReturnType<typeof compatiblePageFixture>) => { Reflect.deleteProperty(f.pageWindow.React, "useState"); }, "react-api"],
    ["ReactDOM API", (f: ReturnType<typeof compatiblePageFixture>) => { Reflect.deleteProperty(f.pageWindow.ReactDOM, "flushSync"); }, "react-api"],
    ["observer API", (f: ReturnType<typeof compatiblePageFixture>) => { Reflect.deleteProperty(f.pageWindow, "IntersectionObserver"); }, "react-api"],
    ["fiber shape", (f: ReturnType<typeof compatiblePageFixture>) => { f.rows[0].__reactFiber$test.tag = 0; }, "annotation-fiber"],
    ["memo descriptor", (f: ReturnType<typeof compatiblePageFixture>) => { Object.defineProperty(f.memo, "type", { writable: false }); }, "annotation-fiber"],
    ["sibling consistency", (f: ReturnType<typeof compatiblePageFixture>) => { f.rows[1].__reactFiber$test.return.elementType = { type: f.original }; }, "annotation-fiber-consistency"]
  ] as const)("rejects incompatible %s before patching the native component", (_name, change, reason) => {
    const f = compatiblePageFixture();
    const originalHtml = document.body.innerHTML;
    change(f);
    const runtime: NativeRuntime = vm.runInNewContext(NATIVE_ANNOTATION_ROW_LAZY_PAGE_SOURCE, f.pageWindow);
    expect(runtime.start()).toEqual({ active: false, cachedRows: 0, reason });
    expect(f.memo.type).toBe(f.original);
    expect(f.pageWindow.addEventListener).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe(originalHtml);
    runtime.stop();
    expect(f.pageWindow.__annotationMarkdownNativeRowLazyV1).toBeUndefined();
  });

  test("uses exact cached heights only while a checked tag filter is relaxed", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="annotations" class="annotations"></div>
      <div id="selector"><div class="tags">
        <button class="tag" role="checkbox" aria-checked="false"></button>
      </div></div>
    `;
    const scroller = queryElement(document, "#annotations");
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 320 });

    function SidebarPreview() {}
    function originalAnnotation(props: FixtureProps): FixtureElement {
      return { marker: "data-sidebar-annotation-id", SidebarPreview, props };
    }

    const memo = { $$typeof: Symbol.for("react.memo"), type: originalAnnotation };
    for (let index = 0; index < 120; index += 1) {
      const row = document.createElement("div");
      row.className = "annotation";
      row.dataset.sidebarAnnotationId = `a${index}`;
      row.getBoundingClientRect = () => (fixtureRect({ height: 80 + index }));
      Object.defineProperty(row, "__reactFiber$test", {
        configurable: true,
        value: {
          tag: 5,
          return: {
            tag: 15,
            type: originalAnnotation,
            elementType: memo
          }
        }
      });
      scroller.append(row);
    }

    const effects: Array<() => void | (() => void)> = [];
    const observers: Array<{callback: FixtureIntersectionCallback}> = [];
    const materializers: Array<ReturnType<typeof vi.fn>> = [];
    const pageWindow = vmPage({
      document,
      devicePixelRatio: 1,
      React: {
        version: "18.3.1",
        createElement(type: unknown, props: FixtureProps, ...children: unknown[]): FixtureElement {
          return { type, props: { ...props, children } };
        },
        useEffect(effect: () => void | (() => void)) {
          effects.push(effect);
        },
        useLayoutEffect(effect: () => void | (() => void)) {
          effects.push(effect);
        },
        useRef(initial: Element | null) {
          return { current: initial };
        },
        useState(initial: boolean | (() => boolean)): [boolean, ReturnType<typeof vi.fn>] {
          const value = typeof initial === "function" ? initial() : initial;
          const setter = vi.fn();
          materializers.push(setter);
          return [value, setter];
        }
      },
      ReactDOM: { flushSync(callback: () => void) { callback(); } },
      IntersectionObserver: class {
        constructor(public callback: FixtureIntersectionCallback) {
          observers.push(this);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
      performance: { now: () => 0 },
      CSS: { escape: (value: string) => value },
      getComputedStyle: window.getComputedStyle.bind(window),
      setTimeout,
      clearTimeout,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    const runtime: NativeRuntime = vm.runInNewContext(
      NATIVE_ANNOTATION_ROW_LAZY_PAGE_SOURCE,
      pageWindow
    );

    expect(runtime.start()).toEqual({ active: true, cachedRows: 120 });
    expect(memo.type).not.toBe(originalAnnotation);

    for (const row of [...scroller.children].slice(3)) row.remove();
    const tag = queryElement(document, "#selector .tag");
    tag.setAttribute("aria-checked", "true");
    tag.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const onFocus = vi.fn();
    const shell = memo.type({
      annotation: { id: "a50" },
      isSelected: false,
      onFocus
    });
    expect(shell.type).toBe("div");
    expect(shell.props.className).toContain("annotation-markdown-native-row-shell");
    expect(requireValue(shell.props.style).height).toBe("130px");
    expect(requireValue(shell.props.style).minHeight).toBe("130px");
    const shellNode = document.createElement("div");
    requireValue(shell.props.ref).current = shellNode;
    for (const effect of effects.splice(0)) effect();
    shellNode.dispatchEvent(new FocusEvent("focus"));
    expect(onFocus).toHaveBeenCalledWith("a50");

    // The initial viewport also starts with an exact-height shell. Several
    // visible rows share one observer and are committed in separate tasks.
    const visibleNodes: Array<(HTMLDivElement)> = [];
    for (const id of ["a3", "a4", "a5"]) {
      const visible = memo.type({ annotation: { id }, isSelected: false });
      expect(visible.type).toBe("div");
      const node = document.createElement("div");
      requireValue(visible.props.ref).current = node;
      visibleNodes.push(node);
      for (const effect of effects.splice(0)) effect();
    }
    expect(observers).toHaveLength(1);
    expect(runtime.status().pendingRows).toBe(3);
    expect(materializers.slice(1).every(setter => setter.mock.calls.length === 0)).toBe(true);
    vi.advanceTimersToNextTimer();
    expect(materializers.slice(1).filter(setter => setter.mock.calls.length)).toHaveLength(2);
    expect(runtime.status().pendingRows).toBe(1);
    observers[0].callback([{ target: visibleNodes[2], isIntersecting: true }]);
    expect(runtime.status().pendingRows).toBe(1);

    const selected = memo.type({
      annotation: { id: "a51" },
      isSelected: true,
      onFocus: vi.fn()
    });
    expect(selected.type).toBe(originalAnnotation);

    const installedWrapper = memo.type;
    const callsBeforeStop = materializers.reduce((sum, setter) => sum + setter.mock.calls.length, 0);
    runtime.stop();
    expect(runtime.status().pendingRows).toBe(0);
    expect(materializers.reduce((sum, setter) => sum + setter.mock.calls.length, 0))
      .toBe(callsBeforeStop);
    const originalUseState = pageWindow.React.useState;
    pageWindow.React.useState = () => [false, vi.fn()];
    // A parent update during recovery must not bypass its materialization queue.
    expect(installedWrapper({ annotation: { id: "a50" }, isSelected: false }).type)
      .toBe("div");
    pageWindow.React.useState = originalUseState;
    vi.runAllTimers();
    expect(memo.type).toBe(originalAnnotation);
    expect(document.querySelector("[data-annotation-markdown-native-row-reserved='true']"))
      .toBeNull();

    for (const row of scroller.children) {
      const hostFiber: FixtureFiber = Reflect.get(row, "__reactFiber$test");
      hostFiber.return = {
        tag: 0,
        type: originalAnnotation,
        elementType: originalAnnotation,
        return: {
          tag: 15,
          type: installedWrapper,
          elementType: memo
        }
      };
    }
    const restarted: NativeRuntime = vm.runInNewContext(
      NATIVE_ANNOTATION_ROW_LAZY_PAGE_SOURCE,
      pageWindow
    );
    expect(restarted.start()).toEqual({ active: true, cachedRows: 0 });
    restarted.stop();
    vi.useRealTimers();
  });
});

function compatiblePageFixture(count = 3) {
  document.body.innerHTML = '<div id="annotations" class="annotations"></div>';
  function SidebarPreview() {}
  function original(props: FixtureProps): FixtureElement { return { marker: "data-sidebar-annotation-id", SidebarPreview, props }; }
  const memo = { $$typeof: Symbol.for("react.memo"), type: original };
  const rows = Array.from({ length: count }, (_, index) => {
    const row = document.createElement("div");
    row.className = "annotation";
    row.dataset.sidebarAnnotationId = `a${index}`;
    row.getBoundingClientRect = () => (fixtureRect({ height: 80 }));
    Object.defineProperty(row, "__reactFiber$test", {
      value: { tag: 5, return: { tag: 15, type: original, elementType: memo } }
    });
    queryElement(document, "#annotations").append(row);
    return row as HTMLDivElement & { __reactFiber$test: FixtureFiber };
  });
  const pageWindow = vmPage({
    document,
    React: {
      version: "18.3.1",
      createElement: vi.fn(), useState: vi.fn(), useEffect: vi.fn(), useLayoutEffect: vi.fn(), useRef: vi.fn()
    },
    ReactDOM: { flushSync: vi.fn() },
    IntersectionObserver: class {},
    CSS: { escape: (value: string) => value },
    performance: { now: () => 0 },
    getComputedStyle: window.getComputedStyle.bind(window),
    setTimeout, clearTimeout,
    addEventListener: vi.fn(), removeEventListener: vi.fn()
  });
  return { pageWindow, memo, original, rows };
}
