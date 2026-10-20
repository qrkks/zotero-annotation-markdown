import { expect, test, vi } from "vitest";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createSettingsStub, missingIntersectionObserver } from "./helpers/stubs.ts";
import { queryElement, requireValue } from "./helpers/dom.ts";

test("preserves the Reader's native scroll method across its entire lifecycle", async () => {
  document.body.innerHTML = `<div id="annotations" style="overflow-y:auto">
    <div class="annotation selected" data-sidebar-annotation-id="a1">
      <div class="comment"><div class="content">**long annotation**</div></div>
    </div>
  </div>`;
  const prototype = window.Element.prototype;
  const originalDescriptor = Object.getOwnPropertyDescriptor(prototype, "scrollIntoView");
  const nativeScroll = vi.fn();
  Object.defineProperty(prototype, "scrollIntoView", {
    configurable: true, writable: true, value: nativeScroll
  });
  const nativeDescriptor = Object.getOwnPropertyDescriptor(prototype, "scrollIntoView");
  const controller = createReaderController({
    reader: { document },
    adapter: createAnnotationSidebarAdapter({ document }),
    renderer: { render: (source: string) => `<p>${source}</p>` },
    settings: createSettingsStub({ isEnabled: () => true }),
    MutationObserver: window.MutationObserver,
    IntersectionObserver: missingIntersectionObserver
  });

  try {
    await controller.start();
    expect(prototype.scrollIntoView).toBe(nativeScroll);
    const row = queryElement(document, ".annotation");
    row.classList.remove("selected");
    await Promise.resolve();
    row.classList.add("selected");
    await Promise.resolve();
    row.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    expect(nativeScroll).toHaveBeenCalledOnce();
    expect(prototype.scrollIntoView).toBe(nativeScroll);
    requireValue(controller.refresh).call(controller);
    expect(Object.getOwnPropertyDescriptor(prototype, "scrollIntoView")).toEqual(nativeDescriptor);
    controller.stop();
    expect(Object.getOwnPropertyDescriptor(prototype, "scrollIntoView")).toEqual(nativeDescriptor);
  } finally {
    controller.stop();
    if (originalDescriptor) Object.defineProperty(prototype, "scrollIntoView", originalDescriptor);
    else Reflect.deleteProperty(prototype, "scrollIntoView");
    document.body.innerHTML = "";
  }
});
