import { describe, expect, test, vi } from "vitest";
import { createPlugin } from "../src/plugin.ts";
import { queryElement, requireElement, requireValue } from "./helpers/dom.ts";

const pdfUrl = "zotero://open-pdf/library/items/9X3PTDDP?page=1&annotation=NXKFRI46";
const internalUrls = [
  "zotero://select/library/items/9X3PTDDP",
  "zotero://open/library/items/9X3PTDDP?annotation=NXKFRI46",
  pdfUrl,
  "zotero://note/library/items/9X3PTDDP/",
  "zotero://open-pdf/groups/42/items/9X3PTDDP?page=2&annotation=NXKFRI46"
];

async function createLinkFixture(url: string, { surface = "sidebar", host = {} } = {}) {
  const source = `[pdf](${url})`;
  document.body.innerHTML = surface === "popup" ? `
    <div class="annotation-popup"><div class="preview" data-annotation-id="a1">
      <div class="comment"><div class="editor">
        <div class="content" contenteditable="true"></div>
        <div class="renderer"></div>
      </div></div>
    </div></div>
  ` : `
    <div data-sidebar-annotation-id="a1" class="annotation selected">
      <div class="comment"><div class="content" contenteditable="false"></div></div>
    </div>
  `;
  queryElement(document, ".content").textContent = source;
  const pane = { loadURI: vi.fn() };
  const Zotero = {
    Reader: {
      _readers: [{ document, _annotationManager: { updateAnnotations: vi.fn() } }],
      registerEventListener: vi.fn()
    },
    Prefs: {
      get: vi.fn(key => key === "extensions.annotationMarkdown.popupEnabled" ? true : undefined)
    },
    getMainWindow: vi.fn(() => ({ ZoteroPane: pane })),
    launchURL: vi.fn(),
    debug: vi.fn(),
    ...host
  };
  const plugin = createPlugin({ Zotero });
  await plugin.startup();
  const link = queryElement(document, ".annotation-markdown-rendered a", HTMLAnchorElement);
  expect(link).not.toBeNull();
  expect(link.getAttribute("href")).toBe(url);
  return { plugin, Zotero, pane, link, source };
}

function clickLink(link: Element) {
  link.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
  link.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
}

describe.each(["sidebar", "popup"])("rendered %s links", surface => {
  test.each(internalUrls)("opens %s internally once per activation without editing", async (url: string) => {
    const { plugin, Zotero, pane, link, source } = await createLinkFixture(url, { surface });
    try {
      clickLink(link);

      expect(pane.loadURI).toHaveBeenCalledExactlyOnceWith(url);
      expect(pane.loadURI.mock.contexts[0]).toBe(pane);
      expect(Zotero.getMainWindow.mock.contexts[0]).toBe(Zotero);
      expect(Zotero.launchURL).not.toHaveBeenCalled();
      expect(document.querySelector("[data-annotation-markdown-fast-editor='true']")).toBeNull();
      expect(queryElement(document, ".content").textContent).toBe(source);
      expect(requireValue(link).isConnected).toBe(true);

      // Keyboard activation has no preceding mousedown and must also open once.
      requireElement(link, HTMLElement).click();
      expect(pane.loadURI).toHaveBeenCalledTimes(2);
      expect(pane.loadURI).toHaveBeenLastCalledWith(url);
      expect(Zotero.launchURL).not.toHaveBeenCalled();
    } finally {
      plugin.shutdown();
    }
  });
});

describe("Reader link routing compatibility", () => {
  test("keeps Weavero ahead of the native and external routes", async () => {
    const handleZoteroURI = vi.fn();
    const weaveroPlugin = { handleZoteroURI };
    const { plugin, Zotero, pane, link } = await createLinkFixture(pdfUrl, {
      host: { Weavero: { plugin: weaveroPlugin } }
    });
    try {
      clickLink(link);
      expect(handleZoteroURI).toHaveBeenCalledExactlyOnceWith(pdfUrl);
      expect(handleZoteroURI.mock.contexts[0]).toBe(weaveroPlugin);
      expect(Zotero.getMainWindow).not.toHaveBeenCalled();
      expect(pane.loadURI).not.toHaveBeenCalled();
      expect(Zotero.launchURL).not.toHaveBeenCalled();
    } finally {
      plugin.shutdown();
    }
  });

  test("uses the native route when Weavero throws", async () => {
    const handleZoteroURI = vi.fn(() => { throw new Error("Weavero not ready"); });
    const { plugin, Zotero, pane, link } = await createLinkFixture(pdfUrl, {
      surface: "popup",
      host: { Weavero: { plugin: { handleZoteroURI } } }
    });
    try {
      clickLink(link);
      expect(handleZoteroURI).toHaveBeenCalledExactlyOnceWith(pdfUrl);
      expect(pane.loadURI).toHaveBeenCalledExactlyOnceWith(pdfUrl);
      expect(Zotero.launchURL).not.toHaveBeenCalled();
    } finally {
      plugin.shutdown();
    }
  });

  test.each([
    ["missing main-window API", () => ({ getMainWindow: undefined })],
    ["closed main window", () => ({ getMainWindow: () => null })],
    ["missing pane", () => ({ getMainWindow: () => ({}) })],
    ["missing internal loader", () => ({ getMainWindow: () => ({ ZoteroPane: {} }) })],
    ["failed main-window lookup", () => ({ getMainWindow() { throw new Error("Window not ready"); } })],
    ["failed internal loader", () => ({
      getMainWindow: () => ({ ZoteroPane: { loadURI() { throw new Error("Pane not ready"); } } })
    })]
  ] as const)("retains the external fallback for a %s", async (_name, createHost) => {
    const { plugin, Zotero, link } = await createLinkFixture(pdfUrl, { host: createHost() });
    try {
      clickLink(link);
      expect(Zotero.launchURL).toHaveBeenCalledExactlyOnceWith(pdfUrl);
      expect(Zotero.launchURL.mock.contexts[0]).toBe(Zotero);
    } finally {
      plugin.shutdown();
    }
  });

  test.each([
    "https://example.org/paper?page=1&view=full",
    "http://example.org/paper",
    "mailto:reader@example.org"
  ] as const)("keeps %s on the external route", async (url: string) => {
    const handleZoteroURI = vi.fn();
    const { plugin, Zotero, pane, link } = await createLinkFixture(url, {
      surface: "popup",
      host: { Weavero: { plugin: { handleZoteroURI } } }
    });
    try {
      clickLink(link);
      expect(Zotero.launchURL).toHaveBeenCalledExactlyOnceWith(url);
      expect(handleZoteroURI).not.toHaveBeenCalled();
      expect(Zotero.getMainWindow).not.toHaveBeenCalled();
      expect(pane.loadURI).not.toHaveBeenCalled();
    } finally {
      plugin.shutdown();
    }
  });
});
