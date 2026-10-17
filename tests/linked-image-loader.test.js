import { afterEach, describe, expect, test, vi } from "vitest";
import { createLinkedImageFetcher, createLinkedImageLoader } from "../src/linked-image-loader.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createPlugin } from "../src/plugin.ts";

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

describe("host-loaded linked images", () => {
  test("defers network URLs and loads only when the figure approaches the viewport, including wrapped Gecko targets", async () => {
    let intersect;
    const unobserve = vi.fn(), disconnect = vi.fn();
    const Observer = vi.fn(function (callback) {
      intersect = callback;
      return { observe: vi.fn(), unobserve, disconnect };
    });
    const root = container(), figure = root.querySelector("figure"), image = root.querySelector("img");
    const load = vi.fn(async () => data);
    const loader = createLinkedImageLoader({ load, IntersectionObserver: Observer });
    expect(image.hasAttribute("src")).toBe(false);
    expect(image.getAttribute("data-annotation-markdown-image-src")).toBe(url);
    loader.observe(root);
    expect(load).not.toHaveBeenCalled();
    intersect([{ target: new Proxy(figure, {}), isIntersecting: true }]);
    await vi.waitFor(() => expect(image.getAttribute("src")).toBe(data));
    expect(load).toHaveBeenCalledExactlyOnceWith(url);
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
    await vi.waitFor(() => expect(another.querySelector("img").getAttribute("src")).toBe(data));
    expect(load).toHaveBeenCalledOnce();
    loader.stop();
  });

  test("retains a caption link on fetch failure and ignores late results after shutdown", async () => {
    const root = container();
    const failed = createLinkedImageLoader({ load: async () => { throw new Error("unavailable"); } });
    failed.observe(root);
    await vi.waitFor(() => expect(root.querySelector("figure > a").hidden).toBe(true));
    expect(root.querySelector("figcaption a").getAttribute("href")).toBe(url);
    failed.stop();
    let finish;
    const pending = createLinkedImageLoader({ load: () => new Promise(resolve => { finish = resolve; }) });
    const next = container();
    pending.observe(next);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    pending.stop();
    finish(data);
    await Promise.resolve();
    await Promise.resolve();
    expect(next.querySelector("img").hasAttribute("src")).toBe(false);
  });

  test("accepts raster responses and rejects SVG, HTML, oversized responses and unrecognized URLs", async () => {
    const request = vi.fn(async () => ({ response: new Uint8Array([1, 2, 3]).buffer,
      getResponseHeader: () => "image/png; charset=binary" }));
    const fetch = createLinkedImageFetcher({ request }, binary => window.btoa(binary));
    await expect(fetch(url)).resolves.toBe(data);
    expect(request.mock.calls[0][2].responseType).toBe("arraybuffer");
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

  test("renders a host-fetched image through the production plugin while preserving its source", async () => {
    document.body.innerHTML = '<div id="annotations" style="overflow-y:auto"><div class="annotation selected" data-sidebar-annotation-id="a1"><div class="comment"><div class="content"></div></div></div></div>';
    const source = document.querySelector(".content");
    source.textContent = `[Photo](${url})`;
    const original = source.innerHTML;
    document.querySelector("#annotations").getBoundingClientRect = () => ({ left: 20, top: 60, right: 320, bottom: 660, width: 300, height: 600 });
    const request = vi.fn(async () => ({ response: new Uint8Array([1, 2, 3]).buffer, getResponseHeader: () => "image/png" }));
    const plugin = createPlugin({ Zotero: { HTTP: { request }, Reader: { _readers: [{ document }], registerEventListener: vi.fn() } } });
    try {
      await plugin.startup();
      await vi.waitFor(() => expect(document.querySelector("figure img")?.getAttribute("src")).toBe(data));
      expect(document.querySelector("figcaption a").getAttribute("href")).toBe(url);
      expect(source.innerHTML).toBe(original);
      expect(request).toHaveBeenCalledOnce();
    } finally { plugin.shutdown(); }
    expect(document.querySelector("[data-annotation-markdown-preview]")).toBeNull();
  });
});
