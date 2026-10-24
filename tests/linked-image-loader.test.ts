import { afterEach, describe, expect, test, vi } from "vitest";
import { createLinkedImageFetcher, createLinkedImageLoader, type ImageHttpApi } from "../src/linked-image-loader.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createPlugin } from "../src/plugin.ts";
import { intersectionObserverMock, type FixtureIntersectionCallback } from "./helpers/observers.ts";
import { fixtureRect, queryElement, requireValue } from "./helpers/dom.ts";

const url = "https://images.openai.com/static-rsc-4/sample-image?purpose=inline";
const data = "data:image/png;base64,AQID";
const renderer = createMarkdownRenderer({ deferLinkedImages: true });
afterEach(() => { document.body.innerHTML = ""; });
function container(source = `[Photo](${url})`) {
  const root = document.createElement("div");
  root.innerHTML = renderer.render(source);
  document.body.append(root);
  return root;
}
function deferredImage() {
  let resolve!: (value: string) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<string>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

describe("host-loaded linked images", () => {
  test("defers network URLs and loads only when the figure approaches the viewport, including wrapped Gecko targets", async () => {
    let intersect: ((FixtureIntersectionCallback)) | undefined;
    const unobserve = vi.fn(), disconnect = vi.fn();
    const Observer = intersectionObserverMock(function (callback) {
      intersect = callback;
      return { observe: vi.fn(), unobserve, disconnect };
    });
    const root = container(), figure = root.querySelector("figure"), image = queryElement(root, "img", HTMLImageElement);
    const load = vi.fn(async () => data);
    const loader = createLinkedImageLoader({ load, IntersectionObserver: Observer });
    expect(image.hasAttribute("src")).toBe(false);
    expect(image.getAttribute("data-annotation-markdown-image-src")).toBe(url);
    loader.observe(root);
    expect(load).not.toHaveBeenCalled();
    requireValue(intersect)([{ target: new Proxy(requireValue(figure), {}), isIntersecting: true }]);
    await vi.waitFor(() => expect(image.getAttribute("src")).toBe(data));
    expect(load).toHaveBeenCalledExactlyOnceWith(url, expect.any(AbortSignal));
    expect(unobserve).toHaveBeenCalledWith(figure);
    loader.observe(root);
    expect(load).toHaveBeenCalledOnce();
    loader.stop();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  test("shares pending and cached images between repeated links", async () => {
    const load = vi.fn(async () => data), loader = createLinkedImageLoader({ load });
    const root = container(`[First](${url})\n\n[Second](${url})`);
    loader.observe(root);
    await vi.waitFor(() => expect([...root.querySelectorAll("img")].map(image => image.getAttribute("src"))).toEqual([data, data]));
    const another = container();
    loader.observe(another);
    await vi.waitFor(() => expect(queryElement(another, "img", HTMLImageElement).getAttribute("src")).toBe(data));
    expect(load).toHaveBeenCalledOnce();
    loader.stop();
  });

  test("limits distinct requests to four while sharing a queued URL", async () => {
    const requests = Array.from({ length: 6 }, deferredImage);
    const urls = requests.map((_, index) => `https://example.org/photo-${index}.png`);
    const load = vi.fn((value: string) => requests[urls.indexOf(value)].promise);
    const root = container([...urls, urls[5]].map(value => `[Photo](${value})`).join("\n\n"));
    const loader = createLinkedImageLoader({ load });
    try {
      loader.observe(root);
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(4));
      expect(load.mock.calls.map(([value]) => value)).toEqual(urls.slice(0, 4));
      requests[0].resolve(data);
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(5));
      requests[1].resolve(data);
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(6));
      for (const request of requests) request.resolve(data);
      await vi.waitFor(() => expect([...root.querySelectorAll("img")].every(image => image.getAttribute("src") === data)).toBe(true));
      expect(load).toHaveBeenCalledTimes(6);
    } finally { loader.stop(); }
  });

  test("shares failures and permits a later preview to retry the same URL", async () => {
    const request = deferredImage();
    const load = vi.fn(() => request.promise);
    const root = container(`[First](${url})\n\n[Second](${url})`);
    const loader = createLinkedImageLoader({ load });
    try {
      loader.observe(root);
      await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
      request.reject(new Error("unavailable"));
      await vi.waitFor(() => expect([...root.querySelectorAll("figure > a")].every(link => (link as HTMLAnchorElement).hidden)).toBe(true));
      load.mockResolvedValueOnce(data);
      const retry = container();
      loader.observe(retry);
      await vi.waitFor(() => expect(queryElement(retry, "img", HTMLImageElement).getAttribute("src")).toBe(data));
      expect(load).toHaveBeenCalledTimes(2);
    } finally { loader.stop(); }
  });

  test("cancels in-flight requests and drops queued requests on shutdown", async () => {
    const signals: AbortSignal[] = [];
    const load = vi.fn((_value: string, signal?: AbortSignal) => new Promise<string>((_resolve, reject) => {
      signals.push(requireValue(signal));
      signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    }));
    const root = container(Array.from({ length: 7 }, (_, index) => `[Photo](https://example.org/photo-${index}.png)`).join("\n\n"));
    const loader = createLinkedImageLoader({ load });
    loader.observe(root);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(4));
    loader.stop();
    await Promise.resolve();
    await Promise.resolve();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(load).toHaveBeenCalledTimes(4);
    expect([...root.querySelectorAll("img")].every(image => !image.hasAttribute("src"))).toBe(true);
  });

  test("does not start deferred work after an immediate stop or for detached queued previews", async () => {
    const load = vi.fn(async () => data);
    const loader = createLinkedImageLoader({ load });
    loader.observe(container());
    loader.stop();
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();

    const detached = container();
    const next = createLinkedImageLoader({ load });
    next.observe(detached);
    detached.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    next.stop();
  });

  test("refresh cancels active and queued inferred previews while preserving favicon requests and cache", async () => {
    let enabled = true;
    const favicon = "https://www.google.com/s2/favicons?domain=example.org";
    const otherFavicon = "https://www.google.com/s2/favicons?domain=other.org";
    const photos = Array.from({ length: 5 }, (_, index) => `https://example.org/photo-${index}.png`);
    const requests = new Map<string, ReturnType<typeof deferredImage>>();
    const signals = new Map<string, AbortSignal>();
    const load = vi.fn((value: string, signal?: AbortSignal) => {
      const request = deferredImage();
      requests.set(value, request);
      signals.set(value, requireValue(signal));
      signal?.addEventListener("abort", () => request.reject(new Error("cancelled")), { once: true });
      return request.promise;
    });
    const root = container([favicon, ...photos, otherFavicon].map(value => `[Source](${value})`).join("\n\n"));
    const loader = createLinkedImageLoader({ load, isImageEnabled: image => enabled || !image.matches(".annotation-markdown-linked-image-content") });
    try {
      loader.observe(root);
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(4));
      expect(load.mock.calls.map(([value]) => value)).toEqual([favicon, ...photos.slice(0, 3)]);
      expect(new Set(signals.values()).size).toBe(4);
      enabled = false;
      loader.refresh();
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(5));
      expect(load.mock.calls.map(([value]) => value)).toEqual([favicon, ...photos.slice(0, 3), otherFavicon]);
      expect(photos.slice(0, 3).every(value => signals.get(value)?.aborted)).toBe(true);
      expect(signals.get(favicon)?.aborted).toBe(false);
      expect(signals.get(otherFavicon)?.aborted).toBe(false);
      requireValue(requests.get(favicon)).resolve(data);
      requireValue(requests.get(otherFavicon)).resolve(data);
      await vi.waitFor(() => expect([...root.querySelectorAll("img.annotation-markdown-favicon-image")].every(image => image.getAttribute("src") === data)).toBe(true));
      expect([...root.querySelectorAll("figure img")].every(image => !image.hasAttribute("src") && !image.hasAttribute("data-annotation-markdown-image-state"))).toBe(true);
      const cached = container(`[Source](${favicon})`);
      loader.observe(cached);
      await vi.waitFor(() => expect(queryElement(cached, "img").getAttribute("src")).toBe(data));
      expect(load).toHaveBeenCalledTimes(5);
    } finally { loader.stop(); }
  });

  test("refresh disables inferred previews before queued work starts without delaying favicons", async () => {
    let enabled = true;
    const favicon = "https://www.google.com/s2/favicons?domain=example.org";
    const load = vi.fn(async () => data);
    const root = container(`[Photo](${url})\n\n[Source](${favicon})`);
    const loader = createLinkedImageLoader({ load, isImageEnabled: image => enabled || !image.matches(".annotation-markdown-linked-image-content") });
    try {
      loader.observe(root);
      enabled = false;
      loader.refresh();
      await vi.waitFor(() => expect(load).toHaveBeenCalledExactlyOnceWith(favicon, expect.any(AbortSignal)));
      expect(queryElement(root, "figure img").hasAttribute("src")).toBe(false);
      expect(queryElement(root, "figure img").hasAttribute("data-annotation-markdown-image-state")).toBe(false);
    } finally { loader.stop(); }
  });

  test("unobserves disabled and detached figures and ignores stale intersection notifications", async () => {
    let enabled = true, intersect: FixtureIntersectionCallback | undefined;
    const unobserve = vi.fn();
    const Observer = intersectionObserverMock(function (callback) {
      intersect = callback;
      return { observe: vi.fn(), unobserve, disconnect: vi.fn() };
    });
    const root = container(), figure = queryElement(root, "figure");
    const detached = container(), detachedFigure = queryElement(detached, "figure");
    const load = vi.fn(async () => data);
    const loader = createLinkedImageLoader({ load, IntersectionObserver: Observer, isImageEnabled: () => enabled });
    try {
      loader.observe(root);
      loader.observe(detached);
      detached.remove();
      loader.refresh();
      expect(unobserve).toHaveBeenCalledWith(detachedFigure);
      enabled = false;
      loader.refresh();
      expect(unobserve).toHaveBeenCalledWith(figure);
      requireValue(intersect)([{ target: new Proxy(figure, {}), isIntersecting: true }, { target: detachedFigure, isIntersecting: true }]);
      await Promise.resolve();
      expect(load).not.toHaveBeenCalled();
      enabled = true;
      loader.observe(root);
      requireValue(intersect)([{ target: figure, isIntersecting: true }]);
      await vi.waitFor(() => expect(queryElement(root, "img").getAttribute("src")).toBe(data));
    } finally { loader.stop(); }
  });

  test.each(["resolve", "reject"] as const)("ignores an old cancelled task's late %s after re-enabling the same DOM and URL", async completion => {
    let enabled = true;
    const oldRequest = deferredImage(), nextRequest = deferredImage();
    const signals: AbortSignal[] = [];
    const load = vi.fn((_value: string, signal?: AbortSignal) => {
      signals.push(requireValue(signal));
      return signals.length === 1 ? oldRequest.promise : nextRequest.promise;
    });
    const root = container(), image = queryElement(root, "img");
    const loader = createLinkedImageLoader({ load, isImageEnabled: () => enabled });
    try {
      loader.observe(root);
      await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
      enabled = false;
      loader.refresh();
      expect(signals[0].aborted).toBe(true);
      enabled = true;
      loader.observe(root);
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      if (completion === "resolve") oldRequest.resolve("data:image/png;base64,T0xE");
      else oldRequest.reject(new Error("late aborted request"));
      await Promise.resolve();
      await Promise.resolve();
      expect(image.hasAttribute("src")).toBe(false);
      expect(image.getAttribute("data-annotation-markdown-image-state")).toBe("loading");
      expect(queryElement(root, "figure > a", HTMLAnchorElement).hidden).toBe(false);

      // The old finally must not delete the newer same-URL pending task.
      const shared = container();
      loader.observe(shared);
      await Promise.resolve();
      expect(load).toHaveBeenCalledTimes(2);
      nextRequest.resolve(data);
      await vi.waitFor(() => expect([image, queryElement(shared, "img")].every(target => target.getAttribute("src") === data)).toBe(true));
      const cached = container();
      loader.observe(cached);
      await vi.waitFor(() => expect(queryElement(cached, "img").getAttribute("src")).toBe(data));
      expect(load).toHaveBeenCalledTimes(2);
    } finally { loader.stop(); }
  });

  test("refresh releases disconnected or repurposed pending targets without marking their later content failed", async () => {
    const requests: ReturnType<typeof deferredImage>[] = [], signals: AbortSignal[] = [];
    const load = vi.fn((_value: string, signal?: AbortSignal) => {
      const request = deferredImage();
      requests.push(request); signals.push(requireValue(signal));
      return request.promise;
    });
    const root = container(), image = queryElement(root, "img");
    const detached = container(`[Other](https://example.org/other.png)`);
    const loader = createLinkedImageLoader({ load });
    try {
      loader.observe(root); loader.observe(detached);
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      detached.remove();
      image.setAttribute("data-annotation-markdown-image-src", "https://example.org/new.png");
      loader.refresh();
      expect(signals.every(signal => signal.aborted)).toBe(true);
      expect(image.hasAttribute("data-annotation-markdown-image-state")).toBe(false);
      for (const request of requests) request.resolve(data);
      await Promise.resolve(); await Promise.resolve();
      expect(image.hasAttribute("src")).toBe(false);
      expect(image.hasAttribute("data-annotation-markdown-image-state")).toBe(false);
    } finally { loader.stop(); }
  });

  test("retains a caption link on fetch failure and ignores late results after shutdown", async () => {
    const root = container();
    const failed = createLinkedImageLoader({ load: async () => { throw new Error("unavailable"); } });
    failed.observe(root);
    await vi.waitFor(() => expect(queryElement(root, "figure > a", HTMLAnchorElement).hidden).toBe(true));
    expect(queryElement(root, "figcaption a", HTMLAnchorElement).getAttribute("href")).toBe(url);
    failed.stop();
    let finish: (((value: string | PromiseLike<string>) => void)) | undefined;
    const pending = createLinkedImageLoader({ load: () => new Promise(resolve => { finish = resolve; }) });
    const next = container();
    pending.observe(next);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    pending.stop();
    requireValue(finish)(data);
    await Promise.resolve();
    await Promise.resolve();
    expect(queryElement(next, "img", HTMLImageElement).hasAttribute("src")).toBe(false);
  });

  test("accepts raster responses and rejects SVG, HTML, oversized responses and unrecognized URLs", async () => {
    const request = vi.fn<NonNullable<Parameters<typeof createLinkedImageFetcher>[0]>["request"]>(async () => ({ response: new Uint8Array([1, 2, 3]).buffer,
      getResponseHeader: () => "image/png; charset=binary" }));
    const fetch = createLinkedImageFetcher({ request }, binary => window.btoa(binary));
    await expect(fetch(url)).resolves.toBe(data);
    expect(requireValue(request.mock.calls[0][2]).responseType).toBe("arraybuffer");
    expect(requireValue(request.mock.calls[0][2]).anon).toBe(true);
    for (const type of ["image/svg+xml", "text/html"]) {
      request.mockResolvedValueOnce({ response: new Uint8Array([1]).buffer, getResponseHeader: () => type });
      await expect(fetch(url)).rejects.toThrow("raster");
    }
    request.mockResolvedValueOnce({ response: new ArrayBuffer(8 * 1024 * 1024 + 1), getResponseHeader: () => "image/png" });
    await expect(fetch(url)).rejects.toThrow("size limit");
    const before = request.mock.calls.length;
    await expect(fetch("file:///C:/photo.png")).rejects.toThrow("recognized HTTP");
    expect(request).toHaveBeenCalledTimes(before);
  });

  test("bridges cancellation to the host and removes request listeners after failure", async () => {
    const controller = new AbortController(), xhr = new XMLHttpRequest(), cancel = vi.fn();
    const removeAbort = vi.spyOn(controller.signal, "removeEventListener");
    const removeProgress = vi.spyOn(xhr, "removeEventListener");
    const request = vi.fn<ImageHttpApi["request"]>((_method, _url, options) => new Promise((_resolve, reject) => {
      options.requestObserver(xhr);
      options.cancellerReceiver(() => { cancel(); reject(new Error("cancelled")); });
    }));
    const fetch = createLinkedImageFetcher({ request }, binary => window.btoa(binary));
    const result = fetch(url, controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow("cancelled");
    expect(cancel).toHaveBeenCalledOnce();
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(removeProgress).toHaveBeenCalledWith("progress", expect.any(Function));

    const aborted = new AbortController();
    aborted.abort();
    await expect(fetch(url, aborted.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(request).toHaveBeenCalledOnce();
  });

  test("releases cancellation listeners after success and handles cancellation during host setup", async () => {
    const controller = new AbortController(), cancel = vi.fn();
    const removeAbort = vi.spyOn(controller.signal, "removeEventListener");
    const request = vi.fn<ImageHttpApi["request"]>(async (_method, _url, options) => {
      options.cancellerReceiver(cancel);
      return { response: new Uint8Array([1, 2, 3]).buffer, getResponseHeader: () => "image/png" };
    });
    const fetch = createLinkedImageFetcher({ request }, binary => window.btoa(binary));
    await expect(fetch(url, controller.signal)).resolves.toBe(data);
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    expect(cancel).not.toHaveBeenCalled();

    const duringSetup = new AbortController();
    request.mockImplementationOnce((_method, _url, options) => new Promise((_resolve, reject) => {
      duringSetup.abort();
      options.cancellerReceiver(() => { cancel(); reject(new Error("cancelled during setup")); });
    }));
    await expect(fetch(url, duringSetup.signal)).rejects.toThrow("cancelled during setup");
    expect(cancel).toHaveBeenCalledOnce();
  });

  test("renders a host-fetched image through the production plugin while preserving its source", async () => {
    document.body.innerHTML = '<div id="annotations" style="overflow-y:auto"><div class="annotation selected" data-sidebar-annotation-id="a1"><div class="comment"><div class="content"></div></div></div></div>';
    const source = queryElement(document, ".content");
    source.textContent = `[Photo](${url})`;
    const original = source.innerHTML;
    queryElement(document, "#annotations").getBoundingClientRect = () => (fixtureRect({ left: 20, top: 60, right: 320, bottom: 660, width: 300, height: 600 }));
    const request = vi.fn(async () => ({ response: new Uint8Array([1, 2, 3]).buffer, getResponseHeader: () => "image/png" }));
    const plugin = createPlugin({ Zotero: { HTTP: { request }, Reader: { _readers: [{ document }], registerEventListener: vi.fn() } } });
    try {
      await plugin.startup();
      await vi.waitFor(() => expect(document.querySelector("figure img")?.getAttribute("src")).toBe(data));
      expect(queryElement(document, "figcaption a", HTMLAnchorElement).getAttribute("href")).toBe(url);
      expect(source.innerHTML).toBe(original);
      expect(request).toHaveBeenCalledOnce();
    } finally { plugin.shutdown(); }
    expect(document.querySelector("[data-annotation-markdown-preview]")).toBeNull();
  });
});
