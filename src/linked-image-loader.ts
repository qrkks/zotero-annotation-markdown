/** Reader HTTP requests are blocked by Zotero. Load recognized images via the host. */
import { isImageLink, hideFailedLinkedImage } from "./linked-image-preview.js";
import { faviconDomain } from "./source-favicon.js";
const SOURCE = "data-annotation-markdown-image-src";
const STATE = "data-annotation-markdown-image-state";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_CHARS = 16 * 1024 * 1024;

export interface ImageHttpApi {
  request(method: string, url: string, options: {
    responseType: string; timeout: number; errorDelayMax: number; logBodyLength: number;
    requestObserver(xhr: XMLHttpRequest): void;
  }): PromiseLike<{ response: ArrayBuffer; getResponseHeader(name: string): string | null }>;
}

export function createLinkedImageFetcher(http: ImageHttpApi, encodeBase64: (binary: string) => string) {
  return async (url: string): Promise<string> => {
    const favicon = Boolean(faviconDomain(url));
    if (!isImageLink(url) && !favicon) throw new Error("Not a recognized HTTP image link");
    const response = await http.request("GET", url, {
      responseType: "arraybuffer", timeout: 15000, errorDelayMax: 0, logBodyLength: 0,
      requestObserver(xhr) {
        xhr.addEventListener("progress", event => { if (event.loaded > MAX_IMAGE_BYTES) xhr.abort(); });
      }
    });
    const mime = response.getResponseHeader("content-type")?.split(";")[0].trim().toLowerCase();
    if (!mime || (!/^image\/(?:png|jpeg|gif|webp|avif|bmp|x-ms-bmp)$/.test(mime) &&
        !(favicon && /^image\/(?:x-icon|vnd\.microsoft\.icon)$/.test(mime)))) throw new Error("Not a supported raster image");
    const bytes = new Uint8Array(response.response);
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Image exceeds preview size limit");
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 16384) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    }
    return `data:${mime};base64,${encodeBase64(binary)}`;
  };
}

export function createLinkedImageLoader({ load, IntersectionObserver: Observer }: {
  load(url: string): PromiseLike<string>;
  IntersectionObserver?: typeof IntersectionObserver;
}) {
  let active = true;
  let cacheChars = 0;
  const cache = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  const observed = new Set<Element>();
  const observer = Observer ? new Observer(entries => {
    for (const entry of entries) if (entry.isIntersecting) start(entry.target);
  }, { rootMargin: "200px" }) : undefined;

  function start(figure: Element): void {
    // IntersectionObserver targets can have different Gecko Xray wrappers.
    for (const target of observed) if (target.isSameNode(figure)) {
      observer?.unobserve(target);
      observed.delete(target);
      break;
    }
    const image = figure.querySelector<HTMLImageElement>(`img[${SOURCE}]`);
    const url = image?.getAttribute(SOURCE);
    if (!active || !image?.isConnected || !url || image.hasAttribute(STATE)) return;
    image.setAttribute(STATE, "loading");
    let task = pending.get(url);
    if (!task) {
      task = cache.has(url) ? Promise.resolve(cache.get(url)!) : Promise.resolve().then(() => load(url));
      pending.set(url, task);
      task.then(data => {
        if (!active || cache.has(url)) return;
        if (cacheChars + data.length > MAX_CACHE_CHARS || cache.size >= 32) { cache.clear(); cacheChars = 0; }
        cache.set(url, data);
        cacheChars += data.length;
      }, () => {}).finally(() => pending.delete(url));
    }
    task.then(data => {
      if (!active || !image.isConnected || image.getAttribute(SOURCE) !== url) return;
      image.setAttribute("src", data);
      image.setAttribute(STATE, "loaded");
    }, () => {
      if (!active || !image.isConnected) return;
      image.setAttribute(STATE, "failed");
      hideFailedLinkedImage(image);
    });
  }

  return {
    observe(container: HTMLElement): void {
      if (!active) return;
      for (const target of observed) if (!target.isConnected) {
        observer?.unobserve(target);
        observed.delete(target);
      }
      for (const image of container.querySelectorAll<HTMLImageElement>(`img[${SOURCE}]:not([${STATE}])`)) {
        const figure = image.closest("figure.annotation-markdown-linked-image, a.annotation-markdown-favicon-link");
        if (!figure || observed.has(figure)) continue;
        if (observer) { observed.add(figure); observer.observe(figure); }
        else start(figure);
      }
    },
    stop(): void {
      active = false;
      observer?.disconnect();
      observed.clear(); cache.clear(); pending.clear(); cacheChars = 0;
    }
  };
}
