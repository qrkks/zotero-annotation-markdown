import vm from "node:vm";

import { describe, expect, test, vi } from "vitest";

import {
  NATIVE_ANNOTATION_ROW_LAZY_PAGE_SOURCE,
  createNativeAnnotationRowLazyController
} from "../src/native-annotation-row-lazy.ts";

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

  test("rejects unverified Zotero versions before touching the Reader page", () => {
    const pageWindow = { eval: vi.fn() };
    const log = vi.fn();
    const controller = createNativeAnnotationRowLazyController({
      getPageWindow: () => pageWindow,
      hostVersion: "10.0.4",
      isEnabled: () => true,
      logger: { log }
    });

    controller.refresh();

    expect(pageWindow.eval).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "[annotation-markdown] native row lazy rendering unavailable for Zotero 10.0.4"
    );
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
      "[annotation-markdown] native row lazy rendering not armed: annotation-row"
    );
    controller.stop();
    expect(stop).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("native annotation row lazy page runtime", () => {
  test("uses exact cached heights only while a checked tag filter is relaxed", () => {
    document.body.innerHTML = `
      <div id="annotations" class="annotations"></div>
      <div id="selector"><div class="tags">
        <button class="tag" role="checkbox" aria-checked="false"></button>
      </div></div>
    `;
    const scroller = document.querySelector("#annotations");
    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 320 });

    function SidebarPreview() {}
    function originalAnnotation(props) {
      return { marker: "data-sidebar-annotation-id", SidebarPreview, props };
    }

    const memo = { $$typeof: Symbol.for("react.memo"), type: originalAnnotation };
    for (let index = 0; index < 120; index += 1) {
      const row = document.createElement("div");
      row.className = "annotation";
      row.dataset.sidebarAnnotationId = `a${index}`;
      row.getBoundingClientRect = () => ({ height: 80 + index });
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

    const effects = [];
    const pageWindow = {
      document,
      devicePixelRatio: 1,
      React: {
        version: "18.3.1",
        createElement(type, props, ...children) {
          return { type, props: { ...props, children } };
        },
        useEffect(effect) {
          effects.push(effect);
        },
        useLayoutEffect(effect) {
          effects.push(effect);
        },
        useRef(initial) {
          return { current: initial };
        },
        useState(initial) {
          const value = typeof initial === "function" ? initial() : initial;
          return [value, vi.fn()];
        }
      },
      ReactDOM: { flushSync(callback) { callback(); } },
      IntersectionObserver: class {
        observe() {}
        disconnect() {}
      },
      CSS,
      getComputedStyle: window.getComputedStyle.bind(window),
      setTimeout,
      clearTimeout,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    pageWindow.window = pageWindow;
    const runtime = vm.runInNewContext(
      NATIVE_ANNOTATION_ROW_LAZY_PAGE_SOURCE,
      pageWindow
    );

    expect(runtime.start()).toEqual({ active: true, cachedRows: 120 });
    expect(memo.type).not.toBe(originalAnnotation);

    for (const row of [...scroller.children].slice(3)) row.remove();
    const tag = document.querySelector("#selector .tag");
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
    expect(shell.props.style.height).toBe("130px");
    expect(shell.props.style.minHeight).toBe("130px");
    const shellNode = document.createElement("div");
    shell.props.ref.current = shellNode;
    for (const effect of effects.splice(0)) effect();
    shellNode.dispatchEvent(new FocusEvent("focus"));
    expect(onFocus).toHaveBeenCalledWith("a50");

    const selected = memo.type({
      annotation: { id: "a51" },
      isSelected: true,
      onFocus: vi.fn()
    });
    expect(selected.type).toBe(originalAnnotation);

    const installedWrapper = memo.type;
    runtime.stop();
    expect(memo.type).toBe(originalAnnotation);
    expect(document.querySelector("[data-annotation-markdown-native-row-reserved='true']"))
      .toBeNull();

    for (const row of scroller.children) {
      const hostFiber = row.__reactFiber$test;
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
    const restarted = vm.runInNewContext(
      NATIVE_ANNOTATION_ROW_LAZY_PAGE_SOURCE,
      pageWindow
    );
    expect(restarted.start()).toEqual({ active: true, cachedRows: 0 });
    restarted.stop();
  });
});
