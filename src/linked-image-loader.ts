/** Reader HTTP requests are blocked by Zotero. Load recognized images via the host. */
import { isImageLink, hideFailedLinkedImage } from "./linked-image-preview.js";
import { faviconDomain } from "./source-favicon.js";
const SOURCE = "data-annotation-markdown-image-src";
const STATE = "data-annotation-markdown-image-state";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_CHARS = 16 * 1024 * 1024;
const MAX_CONCURRENT_LOADS = 4;

export interface ImageHttpApi {
  request(method: string, url: string, options: {
    responseType: string; timeout: number; errorDelayMax: number; logBodyLength: number; anon: boolean;
    requestObserver(xhr: XMLHttpRequest): void;
    cancellerReceiver(cancel: () => void): void;
  }): PromiseLike<{ response: ArrayBuffer; getResponseHeader(name: string): string | null }>;
}

export function createLinkedImageFetcher(http: ImageHttpApi, encodeBase64: (binary: string) => string) {
  return async (url: string, signal?: AbortSignal): Promise<string> => {
    if (signal?.aborted) throw cancelledImageRequest();
    const favicon = Boolean(faviconDomain(url));
    if (!isImageLink(url) && !favicon) throw new Error("Not a recognized HTTP image link");
    let cancelRequest: (() => void) | undefined;
    let request: XMLHttpRequest | undefined;
    const cancel = () => cancelRequest?.();
    const progress = (event: ProgressEvent) => { if (event.loaded > MAX_IMAGE_BYTES) request?.abort(); };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const response = await http.request("GET", url, {
        // Automatic previews must not inherit Zotero's global cookie jar.
        responseType: "arraybuffer", timeout: 15000, errorDelayMax: 0, logBodyLength: 0, anon: true,
        requestObserver(xhr) {
          request = xhr;
          xhr.addEventListener("progress", progress);
        },
        cancellerReceiver(cancelOperation) {
          cancelRequest = cancelOperation;
          if (signal?.aborted) cancelOperation();
        }
      });
      if (signal?.aborted) throw cancelledImageRequest();
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
    } finally {
      signal?.removeEventListener("abort", cancel);
      request?.removeEventListener("progress", progress);
      cancelRequest = undefined;
    }
  };
}

interface ImageAttempt { url: string }

interface ImageTask {
  url: string;
  targets: Map<HTMLImageElement, ImageAttempt>;
  cancellation: AbortController;
  promise: Promise<string>;
  resolve(value: string): void;
  reject(reason: unknown): void;
}

export function createLinkedImageLoader({ load, IntersectionObserver: Observer, isImageEnabled = () => true }: {
  load(url: string, signal?: AbortSignal): PromiseLike<string>;
  IntersectionObserver?: typeof IntersectionObserver;
  isImageEnabled?(image: HTMLImageElement): boolean;
}) {
  let active = true;
  let cacheChars = 0;
  let running = 0;
  let scheduled = false;
  const cache = new Map<string, string>();
  const pending = new Map<string, ImageTask>();
  const attempts = new Map<HTMLImageElement, ImageAttempt>();
  const queue: ImageTask[] = [];
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
    if (!image || !url || !isEligible(image, url) || image.hasAttribute(STATE)) return;
    const attempt = { url };
    attempts.set(image, attempt);
    image.setAttribute(STATE, "loading");
    let result: Promise<string>;
    const cached = cache.get(url);
    if (cached !== undefined) {
      result = Promise.resolve(cached);
    } else {
      let task = pending.get(url);
      if (!task) {
        let resolve!: ImageTask["resolve"], reject!: ImageTask["reject"];
        const promise = new Promise<string>((accept, fail) => { resolve = accept; reject = fail; });
        // Signals must come from the Reader realm rather than the bootstrap sandbox.
        const cancellation = new (image.ownerDocument.defaultView?.AbortController ?? AbortController)();
        task = { url, targets: new Map(), cancellation, promise, resolve, reject };
        pending.set(url, task);
        queue.push(task);
      }
      task.targets.set(image, attempt);
      result = task.promise;
      schedule();
    }
    result.then(data => {
      if (!isCurrentAttempt(image, url, attempt)) return;
      image.setAttribute("src", data);
      image.setAttribute(STATE, "loaded");
    }, () => {
      if (!isCurrentAttempt(image, url, attempt)) return;
      image.setAttribute(STATE, "failed");
      hideFailedLinkedImage(image);
    }).finally(() => {
      if (attempts.get(image) === attempt) attempts.delete(image);
    });
  }

  function isEligible(image: HTMLImageElement, url: string): boolean {
    return active && image.isConnected && image.getAttribute(SOURCE) === url && isImageEnabled(image);
  }

  function isCurrentAttempt(image: HTMLImageElement, url: string, attempt: ImageAttempt): boolean {
    return attempts.get(image) === attempt && isEligible(image, url);
  }

  function hasEnabledTargets(task: ImageTask): boolean {
    return [...task.targets].some(([image, attempt]) => isCurrentAttempt(image, task.url, attempt));
  }

  function cancelTask(task: ImageTask): void {
    if (pending.get(task.url) === task) pending.delete(task.url);
    const queuedIndex = queue.indexOf(task);
    if (queuedIndex !== -1) queue.splice(queuedIndex, 1);
    task.cancellation.abort();
    task.reject(cancelledImageRequest());
    task.targets.clear();
  }

  function refresh(): void {
    for (const target of observed) {
      const image = target.querySelector<HTMLImageElement>(`img[${SOURCE}]`);
      const url = image?.getAttribute(SOURCE);
      if (image && url && isEligible(image, url)) continue;
      observer?.unobserve(target);
      observed.delete(target);
    }
    for (const [image, attempt] of attempts) {
      if (isCurrentAttempt(image, attempt.url, attempt)) continue;
      attempts.delete(image);
      if (image.getAttribute(STATE) === "loading") image.removeAttribute(STATE);
    }
    for (const task of pending.values()) {
      for (const [image, attempt] of task.targets) {
        if (!isCurrentAttempt(image, task.url, attempt)) task.targets.delete(image);
      }
      if (!task.targets.size) cancelTask(task);
    }
  }

  function schedule(): void {
    if (!active || scheduled) return;
    scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false;
      while (active && running < MAX_CONCURRENT_LOADS && queue.length) {
        const task = queue.shift()!;
        if (pending.get(task.url) !== task || task.cancellation.signal.aborted) continue;
        running++;
        void execute(task);
      }
    });
  }

  async function execute(task: ImageTask): Promise<void> {
    try {
      // A preview may leave the DOM while waiting for another image to finish.
      if (!active || pending.get(task.url) !== task || task.cancellation.signal.aborted || !hasEnabledTargets(task)) {
        throw cancelledImageRequest();
      }
      const data = await load(task.url, task.cancellation.signal);
      if (!active || pending.get(task.url) !== task || task.cancellation.signal.aborted || !hasEnabledTargets(task)) {
        throw cancelledImageRequest();
      }
      if (cacheChars + data.length > MAX_CACHE_CHARS || cache.size >= 32) { cache.clear(); cacheChars = 0; }
      cache.set(task.url, data);
      cacheChars += data.length;
      task.resolve(data);
    } catch (error) {
      task.reject(error);
    } finally {
      running--;
      if (pending.get(task.url) === task) pending.delete(task.url);
      task.targets.clear();
      schedule();
    }
  }

  return {
    observe(container: HTMLElement): void {
      if (!active) return;
      for (const target of observed) if (!target.isConnected) {
        observer?.unobserve(target);
        observed.delete(target);
      }
      for (const image of container.querySelectorAll<HTMLImageElement>(`img[${SOURCE}]:not([${STATE}])`)) {
        if (!isImageEnabled(image)) continue;
        const figure = image.closest("figure.annotation-markdown-linked-image, a.annotation-markdown-favicon-link");
        if (!figure || observed.has(figure)) continue;
        if (observer) { observed.add(figure); observer.observe(figure); }
        else start(figure);
      }
    },
    refresh,
    stop(): void {
      active = false;
      for (const task of pending.values()) cancelTask(task);
      attempts.clear();
      queue.length = 0;
      observer?.disconnect();
      observed.clear(); cache.clear(); pending.clear(); cacheChars = 0;
    }
  };
}

function cancelledImageRequest(): Error {
  const error = new Error("Image preview request cancelled");
  error.name = "AbortError";
  return error;
}
