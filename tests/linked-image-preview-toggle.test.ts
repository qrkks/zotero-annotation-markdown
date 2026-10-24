import { afterEach, describe, expect, test, vi } from "vitest";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createPlugin } from "../src/plugin.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { LINKED_IMAGE_PREVIEW_ENABLED_PREF_KEY } from "../src/settings.ts";
import type { PreferenceValue } from "../src/types.ts";
import { fixtureRect, queryElement, requireValue } from "./helpers/dom.ts";
import { intersectionObserverMock, type FixtureIntersectionCallback } from "./helpers/observers.ts";
import { createSettingsStub, missingMutationObserver } from "./helpers/stubs.ts";

const inferredUrl = "https://example.org/inferred.png";
const explicitUrl = "https://example.org/explicit.png";
const source = `# Inferred\n\n[Photo](${inferredUrl})\n\n## Explicit\n\n![Authored image](${explicitUrl})`;
const previewSelector = "[data-annotation-markdown-preview='true']";
const badgeSelector = "[data-annotation-markdown-svg-badge='sidebar']";
const originalLanguage = document.documentElement.lang;

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.lang = originalLanguage;
});

function sidebarRow(id: string, selected = false): string {
  return `<div data-sidebar-annotation-id="${id}" class="annotation${selected ? " selected" : ""}">
    <div class="preview"><header><div class="end"><button class="more">More</button></div></header>
      <div class="comment"><div class="content"></div></div>
    </div>
  </div>`;
}

function assertPreview(preview: Element, enabled: boolean): void {
  expect(preview.querySelectorAll("figure.annotation-markdown-linked-image")).toHaveLength(enabled ? 1 : 0);
  expect(queryElement(preview, 'img[alt="Authored image"]').getAttribute("src")).toBe(explicitUrl);
  const originalLink = preview.querySelector<HTMLAnchorElement>(`a[href='${inferredUrl}']`);
  expect(originalLink?.textContent).toBe(enabled ? "" : "Photo");
  if (enabled) expect(queryElement(preview, "figcaption a").textContent).toBe("Photo");
}

function assertOutline(context: "sidebar" | "popup", enabled: boolean): void {
  const outline = queryElement(document, "[data-annotation-markdown-outline='true']", HTMLElement);
  expect(outline.dataset.context).toBe(context);
  const items = [...outline.querySelectorAll<HTMLButtonElement>(".annotation-markdown-outline-item")];
  expect(items).toHaveLength(2);
  expect(items.map(item => item.title)).toEqual([
    enabled ? "Inferred\nThis section contains 1 image" : "Inferred",
    "Explicit\nThis section contains 1 image"
  ]);
  expect(items.map(item => item.querySelector(".annotation-markdown-outline-svg-badge")?.textContent ?? ""))
    .toEqual([enabled ? "IMG" : "", "IMG"]);
}

describe("live standalone image-link preference", () => {
  test.each(["sidebar", "popup"] as const)("refreshes existing %s previews, badges and outline through the registered host preference observer", async context => {
    document.documentElement.lang = "en-US";
    document.body.innerHTML = `<div id="annotations" style="overflow-y:auto">${sidebarRow("a1", true)}${sidebarRow("a2")}</div>` +
      (context === "popup" ? '<div class="annotation-popup"><div class="preview" data-annotation-id="a1"><div class="comment"><div class="editor"><div class="content" contenteditable="true"></div><div class="renderer"></div></div></div></div></div>' : "");
    const scroller = queryElement(document, "#annotations", HTMLElement);
    scroller.getBoundingClientRect = () => fixtureRect({ left: 20, top: 60, right: 320, bottom: 660, width: 300, height: 600 });
    const mainRow = queryElement(document, "[data-sidebar-annotation-id='a1']", HTMLElement);
    const inferredOnlyRow = queryElement(document, "[data-sidebar-annotation-id='a2']", HTMLElement);
    queryElement(mainRow, ".content").textContent = source;
    queryElement(inferredOnlyRow, ".content").textContent = `[Only inferred](${inferredUrl})`;
    const popupSource = document.querySelector(".annotation-popup .content");
    if (popupSource) popupSource.textContent = source;
    const sources = [...document.querySelectorAll<HTMLElement>(".content")];
    const originalSources = sources.map(node => node.innerHTML);
    const values = new Map<string, PreferenceValue>([
      ["extensions.annotationMarkdown.renderStrategy", "eager"],
      ["extensions.annotationMarkdown.popupEnabled", context === "popup"]
    ]);
    const observers = new Map<string, () => void>();
    const plugin = createPlugin({
      Zotero: {
        Reader: { _readers: [{ document }], registerEventListener: vi.fn() },
        Prefs: {
          get: key => values.get(key),
          registerObserver: (key, handler) => { observers.set(key, handler); return key; },
          unregisterObserver: id => { if (typeof id === "string") observers.delete(id); }
        }
      }
    });
    try {
      await plugin.startup();
      const sidebarPreview = queryElement(mainRow, previewSelector, HTMLElement);
      const popupPreview = context === "popup"
        ? queryElement(document, `.annotation-popup ${previewSelector}`, HTMLElement) : null;
      if (popupPreview) {
        Object.defineProperties(popupPreview, {
          clientHeight: { configurable: true, value: 200 },
          scrollHeight: { configurable: true, value: 600 }
        });
        popupPreview.getBoundingClientRect = () => fixtureRect({ left: 360, top: 100, right: 740, bottom: 300, width: 380, height: 200 });
      }
      const notify = requireValue(observers.get(LINKED_IMAGE_PREVIEW_ENABLED_PREF_KEY));
      for (const enabled of [true, false, true]) {
        if (values.has(LINKED_IMAGE_PREVIEW_ENABLED_PREF_KEY) || !enabled) {
          values.set(LINKED_IMAGE_PREVIEW_ENABLED_PREF_KEY, enabled);
          notify();
        }
        await vi.waitFor(() => {
          // Existing preview hosts survive; only their interpreted contents change.
          expect(mainRow.querySelector(previewSelector)).toBe(sidebarPreview);
          assertPreview(sidebarPreview, enabled);
          if (popupPreview) {
            expect(document.querySelector(`.annotation-popup ${previewSelector}`)).toBe(popupPreview);
            assertPreview(popupPreview, enabled);
          }
          expect(queryElement(mainRow, badgeSelector).getAttribute("title"))
            .toBe(`This annotation contains ${enabled ? "2 images" : "1 image"}`);
          expect(inferredOnlyRow.querySelector(badgeSelector)?.textContent ?? "").toBe(enabled ? "IMG" : "");
          assertOutline(context, enabled);
        });
        expect(sources.map(node => node.innerHTML)).toEqual(originalSources);
      }
    } finally { plugin.shutdown(); }
    expect(observers.has(LINKED_IMAGE_PREVIEW_ENABLED_PREF_KEY)).toBe(false);
    expect(sources.map(node => node.innerHTML)).toEqual(originalSources);
  });

  test("refreshes offscreen mounted previews and placeholder image counts without making lazy rows eager", async () => {
    document.documentElement.lang = "en-US";
    document.body.innerHTML = `<div id="annotations">${sidebarRow("mounted")}${sidebarRow("placeholder")}${sidebarRow("untouched")}</div>`;
    const rows = [...document.querySelectorAll<HTMLElement>("[data-sidebar-annotation-id]")];
    const comments = rows.map(row => queryElement(row, ".comment", HTMLElement));
    const sources = rows.map(row => queryElement(row, ".content", HTMLElement));
    for (const node of sources) node.textContent = `[Only inferred](${inferredUrl})`;
    const originals = sources.map(node => node.innerHTML);
    let visibility: FixtureIntersectionCallback | undefined;
    const Observer = intersectionObserverMock(notify => {
      visibility = notify;
      return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
    });
    const settings = createSettingsStub({ isEnabled: () => true, isPopupEnabled: () => false });
    const adapter = createAnnotationSidebarAdapter({ document });
    const controller = createReaderController({
      reader: { document }, adapter, settings,
      renderer: createMarkdownRenderer({ isLinkedImagePreviewEnabled: () => settings.isLinkedImagePreviewEnabled() }),
      MutationObserver: missingMutationObserver,
      IntersectionObserver: Observer
    });
    try {
      await controller.start();
      requireValue(visibility)(comments.slice(0, 2).map(target => ({ target, isIntersecting: true })));
      requireValue(visibility)(comments.slice(0, 2).map(target => ({ target, isIntersecting: false })));
      expect(adapter.releaseRenderedHtml(comments[1])).toBe(true);
      const mountedPreview = queryElement(comments[0], previewSelector, HTMLElement);
      const placeholder = queryElement(comments[1], previewSelector, HTMLElement);
      expect(placeholder.getAttribute("data-annotation-markdown-placeholder")).toBe("true");
      expect(rows.slice(0, 2).map(row => queryElement(row, badgeSelector).textContent)).toEqual(["IMG", "IMG"]);
      expect(comments[2].querySelector(previewSelector)).toBeNull();

      for (const enabled of [false, true]) {
        settings.setLinkedImagePreviewEnabled(enabled);
        controller.refresh?.();
        expect(comments[0].querySelector(previewSelector)).toBe(mountedPreview);
        expect(mountedPreview.querySelectorAll("figure.annotation-markdown-linked-image")).toHaveLength(enabled ? 1 : 0);
        expect(comments[1].querySelector(previewSelector)).toBe(placeholder);
        expect(placeholder.getAttribute("data-annotation-markdown-placeholder")).toBe("true");
        expect(placeholder.querySelector("img")).toBeNull();
        expect(rows.slice(0, 2).map(row => row.querySelector(badgeSelector)?.textContent ?? ""))
          .toEqual([enabled ? "IMG" : "", enabled ? "IMG" : ""]);
        expect(comments[2].querySelector(previewSelector)).toBeNull();
        expect(sources.map(node => node.innerHTML)).toEqual(originals);
      }
      // It becomes a real image preview only when visibility resumes.
      requireValue(visibility)([{ target: comments[1], isIntersecting: true }]);
      expect(queryElement(comments[1], previewSelector).hasAttribute("data-annotation-markdown-placeholder")).toBe(false);
      expect(comments[1].querySelector("figure.annotation-markdown-linked-image")).not.toBeNull();
    } finally { controller.stop(); }
    expect(sources.map(node => node.innerHTML)).toEqual(originals);
  });
});
