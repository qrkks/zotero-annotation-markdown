import { vi } from "vitest";
import { fixtureRect } from "./dom.ts";

export type FixtureMutation = Omit<Partial<MutationRecord>, "addedNodes" | "removedNodes" | "target"> & {
  target: Node;
  addedNodes?: readonly Node[] | NodeList;
  removedNodes?: readonly Node[] | NodeList;
};
export type FixtureMutationCallback = (records: FixtureMutation[]) => void;
export type FixtureIntersection = Partial<IntersectionObserverEntry> & { target: Element; isIntersecting: boolean };
export type FixtureIntersectionCallback = (entries: FixtureIntersection[]) => void;
export type FixtureResizeCallback = (entries: Array<Partial<ResizeObserverEntry> & { target: Element }>) => void;
export interface ObserverSpies {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  unobserve?: ReturnType<typeof vi.fn>;
  takeRecords?: ReturnType<typeof vi.fn>;
}

function nodeList(nodes: readonly Node[] | NodeList = []): NodeList {
  const snapshot = [...nodes];
  return new Proxy(document.createDocumentFragment().childNodes, {
    get(_target, key) {
      if (key === "item") return (index: number) => snapshot[index] ?? null;
      const value: unknown = Reflect.get(snapshot, key);
      return typeof value === "function" ? value.bind(snapshot) : value;
    }
  });
}

export function mutationObserverMock(factory: (notify: FixtureMutationCallback) => Partial<MutationObserver>) {
  return vi.fn(function (callback: MutationCallback) {
    const observer = new window.MutationObserver(callback);
    const notify: FixtureMutationCallback = records => callback(records.map(record => ({
      type: "childList", attributeName: null, attributeNamespace: null, oldValue: null,
      nextSibling: null, previousSibling: null,
      addedAnimations: [], changedAnimations: [], removedAnimations: [], ...record,
      addedNodes: nodeList(record.addedNodes), removedNodes: nodeList(record.removedNodes)
    })), observer);
    return Object.assign(observer, factory(notify));
  });
}

class IntersectionStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];
  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}
export function intersectionObserverMock(factory: (notify: FixtureIntersectionCallback, options?: IntersectionObserverInit) => Partial<IntersectionObserver>) {
  return vi.fn(function (callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    const observer = new IntersectionStub();
    const notify: FixtureIntersectionCallback = entries => callback(entries.map(entry => ({
      time: 0, boundingClientRect: fixtureRect({}), intersectionRect: fixtureRect({}),
      intersectionRatio: entry.isIntersecting ? 1 : 0, rootBounds: null, ...entry
    })), observer);
    return Object.assign(observer, factory(notify, options));
  });
}

class ResizeStub implements ResizeObserver {
  observe(_target: Element): void {}
  unobserve(_target: Element): void {}
  disconnect(): void {}
}
export function resizeObserverMock(factory: (notify: FixtureResizeCallback) => Partial<ResizeObserver>) {
  return vi.fn(function (callback: ResizeObserverCallback) {
    const observer = new ResizeStub();
    const notify: FixtureResizeCallback = entries => callback(entries.map(entry => ({
      borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [],
      contentRect: fixtureRect({}), ...entry
    })), observer);
    return Object.assign(observer, factory(notify));
  });
}
