import { describe, expect, test, vi } from "vitest";
import { createSettings } from "../src/settings.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";

const markup = `
  <div class="annotation" data-annotation-id="side1"><div class="comment"><div class="content">**sidebar**</div></div></div>
  <div class="annotation-popup"><div class="preview"><div class="comment"><div class="editor">
    <div id="popup1" class="content" contenteditable="true">**popup**</div><div class="renderer"></div>
  </div></div></div></div>`;

function fixture(sidebar, popup, MutationObserver = null) {
  document.body.innerHTML = markup;
  const settings = createSettings();
  settings.setEnabled(sidebar);
  settings.setPopupEnabled(popup);
  const render = vi.fn(source => `<p>${source}</p>`);
  const controller = createReaderController({
    reader: { document }, adapter: createAnnotationSidebarAdapter({ document }),
    renderer: { render }, settings, MutationObserver, IntersectionObserver: null
  });
  return { settings, controller, render };
}
const isPreviewVisible = selector => {
  const preview = document.querySelector(selector)?.querySelector('[data-annotation-markdown-preview="true"]');
  return Boolean(preview && !preview.hidden);
};

describe("independent annotation rendering scopes", () => {
  test.each([[false, false], [true, false], [false, true], [true, true]])(
    "renders only selected scopes: sidebar=%s popup=%s", async (sidebar, popup) => {
      const f = fixture(sidebar, popup);
      try {
        await f.controller.start();
        expect(isPreviewVisible('.annotation')).toBe(sidebar);
        expect(isPreviewVisible('.annotation-popup')).toBe(popup);
        expect(f.render.mock.calls.map(([s]) => s).sort()).toEqual(
          [sidebar && '**sidebar**', popup && '**popup**'].filter(Boolean).sort()
        );
      } finally { f.controller.stop(); }
    }
  );

  test("switches scopes on an open Reader without resetting either stored choice", async () => {
    const f = fixture(true, true);
    try {
      await f.controller.start();
      f.settings.setEnabled(false);
      f.controller.refresh();
      expect(isPreviewVisible('.annotation')).toBe(false);
      expect(isPreviewVisible('.annotation-popup')).toBe(true);
      expect(f.settings.isPopupEnabled()).toBe(true);
      f.settings.setEnabled(true);
      f.settings.setPopupEnabled(false);
      f.controller.refresh();
      expect(isPreviewVisible('.annotation')).toBe(true);
      expect(isPreviewVisible('.annotation-popup')).toBe(false);
      expect(f.settings.isEnabled()).toBe(true);
      f.settings.setEnabled(false);
      f.controller.refresh();
      expect(isPreviewVisible('.annotation')).toBe(false);
      expect(isPreviewVisible('.annotation-popup')).toBe(false);
      expect(document.querySelector('[data-annotation-markdown-style]')).toBeNull();
      f.settings.setPopupEnabled(true);
      f.controller.refresh();
      expect(isPreviewVisible('.annotation')).toBe(false);
      expect(isPreviewVisible('.annotation-popup')).toBe(true);
    } finally { f.controller.stop(); }
  });

  test("keeps discovery active for a popup mounted while sidebar rendering is off", async () => {
    const callbacks = [];
    const Observer = function (cb) { callbacks.push(cb); return { observe() {}, disconnect() {}, takeRecords: () => [] }; };
    const f = fixture(false, true, Observer);
    document.querySelector('.annotation-popup').remove();
    try {
      await f.controller.start();
      expect(callbacks[0]).toBeTypeOf('function');
      const holder = document.createElement('div');
      holder.innerHTML = markup;
      const popup = holder.querySelector('.annotation-popup');
      document.body.append(popup);
      callbacks[0]([{ type: 'childList', target: document.body, addedNodes: [popup], removedNodes: [] }]);
      expect(isPreviewVisible('.annotation-popup')).toBe(true);
      expect(isPreviewVisible('.annotation')).toBe(false);
    } finally { f.controller.stop(); }
  });
});
