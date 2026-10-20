import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createSettings } from "../src/settings.ts";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { countRenderedImages } from "../src/image-counts.ts";
import { missingIntersectionObserver, missingMutationObserver } from "./helpers/stubs.ts";
import { queryElement, requireValue } from "./helpers/dom.ts";

const flow = "flowchart LR\n A[研究对象] --> B{纳入标准} --> C[结果]";
const fence = (source: string) => `\`\`\`mermaid\n${source}\n\`\`\``;
const render = (source: string) => createMarkdownRenderer({ isMermaidEnabled: () => true }).render(fence(source));
function imageSvg(html: string) {
  const root = document.createElement("div"); root.innerHTML = html;
  const src = root.querySelector(".annotation-markdown-svg-image")?.getAttribute("src");
  return src ? decodeURIComponent(src.slice(src.indexOf(",") + 1)) : null;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: [...text].reduce((sum, c) => sum + (c.charCodeAt(0) > 255 ? 16 : 8), 0) })
  } as ReturnType<HTMLCanvasElement["getContext"]>);
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

describe("experimental Mermaid fences", () => {
  test("is independently opt-in and performs no diagram measurement while disabled", () => {
    const settings = createSettings();
    expect(settings.isMermaidEnabled()).toBe(false);
    for (const options of [{}, { isSvgEnabled: () => true }]) {
      expect(imageSvg(createMarkdownRenderer(options).render(fence(flow)))).toBeNull();
    }
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(imageSvg(render(flow))).toContain("研究对象");
    expect(settings.isSvgEnabled()).toBe(false);
  });

  test.each([
    [flow, "研究对象"],
    ["sequenceDiagram\n participant A as 参与者\n participant B as 研究者\n A->>B: 中文消息", "中文消息"],
    ["stateDiagram-v2\n [*] --> 准备\n 准备 --> 完成", "完成"],
    ["classDiagram\n class A {\n +String name\n +run()\n }\n A --> B", "name"],
    ["erDiagram\n PERSON ||--o{ SCORE : has", "PERSON"],
    ['pie title 构成\n "甲":40\n "乙":60', "构成"],
    ["mindmap\n root((研究))\n  量表\n  方法", "量表"]
  ] as const)("renders a bounded static image for %s", (source: string, label: string) => {
    const html = render(source), svg = imageSvg(html);
    expect(svg).not.toBeNull();
    expect(svg).toContain(label);
    expect(svg).not.toMatch(/var\(|data-id=|aria-roledescription=|xml:space=/);
    const root = document.createElement("div"); root.innerHTML = html;
    expect(countRenderedImages(root)).toEqual({ img: 0, svg: 0, mermaid: 1 });
    expect(root.querySelector("svg, script, style, foreignObject")).toBeNull();
    expect(root.querySelector(".annotation-markdown-svg-open")).not.toBeNull();
    expect(queryElement(root, "code", HTMLElement).textContent).toBe(`${source}\n`);
  });

  test("preserves explicit styling, titles and literal math-looking labels beside Markdown math", () => {
    const source = 'flowchart LR\n accTitle: 研究设计\n accDescr: 路径说明\n A["$x$ 与 \\[y\\]"] --> B[结果]\n classDef chosen fill:#ffeeaa,stroke:#123456,font-weight:bold\n class A chosen';
    const html = createMarkdownRenderer({ isMermaidEnabled: () => true }).render(`**研究** $x^2$\n\n${fence(source)}`);
    expect(imageSvg(html)).toContain("$x$ 与 \\[y\\]");
    expect(imageSvg(html)).toContain('fill="#ffeeaa"');
    const root = document.createElement("div"); root.innerHTML = html;
    expect(root.querySelector(".katex")).not.toBeNull();
    expect(queryElement(root, "img", HTMLImageElement).alt).toBe("研究设计");
    expect(queryElement(root, "img", HTMLImageElement).title).toBe("路径说明");
  });

  test("uses a self-contained light background independent of host styles", () => {
    document.body.style.color = "white"; document.body.style.background = "black";
    const svg = new DOMParser().parseFromString(requireValue(imageSvg(render(flow))), "application/xml");
    expect(requireValue(svg.documentElement.firstElementChild).localName).toBe("rect");
    expect(requireValue(svg.documentElement.firstElementChild).getAttribute("fill")).toBe("#fff");
    expect(svg.documentElement.getAttribute("font-family")).toBe("sans-serif");
    expect(svg.documentElement.getAttribute("fill")).toBe("#1f1f1f");
  });

  test.each(["flowchart LR\n A[", "gantt\n title Unsupported", "x".repeat(8001),
    `flowchart LR\n${Array.from({ length: 160 }, (_, i) => `A${i} --> A${i + 1}`).join("\n")}`] as const)(
    "keeps the original Mermaid code when syntax, types or resource limits fail (%#)", (source: string) => {
      const html = render(source), root = document.createElement("div"); root.innerHTML = html;
      expect(imageSvg(html)).toBeNull();
      expect(root.querySelector(".annotation-markdown-svg-error")).not.toBeNull();
      expect(queryElement(root, "code", HTMLElement).textContent).toBe(`${source}\n`);
      expect(root.querySelector("svg, script, style, iframe")).toBeNull();
    }
  );

  test("does not enable links, callbacks, raw HTML, inferred fences or other fence languages", () => {
    const svg = imageSvg(render('flowchart LR\n A["&lt;script&gt;alert(1)&lt;/script&gt;"] --> B\n click A "https://example.com"'));
    expect(svg).not.toBeNull();
    expect(svg).not.toMatch(/<script|<a\b|href=|onload=/);
    for (const language of ["", "text", "mermaid example"]) {
      expect(imageSvg(createMarkdownRenderer({ isMermaidEnabled: () => true }).render(`\`\`\`${language}\n${flow}\n\`\`\``))).toBeNull();
    }
    expect(imageSvg(createMarkdownRenderer({ isMermaidEnabled: () => true }).render('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>'))).toBeNull();
    expect(imageSvg(createMarkdownRenderer({ windowRef: null, isMermaidEnabled: () => true }).render(fence(flow)))).toBeNull();
  });

  test("persists only explicit boolean opt-in", () => {
    const values = new Map();
    const settings = createSettings({ prefs: { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) } });
    settings.setMermaidEnabled(true); expect(settings.isMermaidEnabled()).toBe(true);
    expect(values.get("extensions.annotationMarkdown.mermaidEnabled")).toBe(true);
    settings.setMermaidEnabled(false); expect(settings.isMermaidEnabled()).toBe(false);
    for (const value of [undefined, null, "true", 1]) expect(createSettings({ prefs: { get: () => value } }).isMermaidEnabled()).toBe(false);
  });

  test("escapes parser errors containing markup and disables remote image resources", () => {
    const source = 'flowchart LR\n <img src=x onerror=alert(1)>';
    const root = document.createElement("div"); root.innerHTML = render(source);
    expect(root.querySelector("img, script, iframe")).toBeNull();
    expect(queryElement(root, "code", HTMLElement).textContent).toBe(`${source}\n`);
    const image = render('flowchart LR\n A@{ img: "https://example.com/remote.png", label: "图像" }');
    expect(imageSvg(image)).not.toMatch(/<image\b|href=|https:\/\/example.com/);
  });
});

describe("Mermaid preview lifecycle", () => {
  test.each([false, true].flatMap((popup: boolean) => [false, true].map(tinyCache => [popup, tinyCache])))(
    "preserves source, invalidates caches, opens the viewer and cleans up (popup=%s tinyCache=%s)", async (popup: boolean, tinyCache) => {
      const source = fence(flow);
      document.body.innerHTML = `${popup ? '<div class="annotation-popup">' : ''}<div data-sidebar-annotation-id="a1" class="annotation selected"><div class="preview"><header><div class="end"></div></header><div class="comment"><div class="expandable-editor"><div class="content" contenteditable="true"></div></div></div></div></div>${popup ? '</div>' : ''}`;
      queryElement(document, ".content").textContent = source;
      const settings = createSettings(); settings.setPopupEnabled(popup); settings.setRenderStrategy("eager");
      const adapter = createAnnotationSidebarAdapter({ document, isFastEditorEnabled: () => true, commitComment: () => true });
      const controller = createReaderController({ reader: { document }, adapter, settings,
        renderer: createMarkdownRenderer({ isMermaidEnabled: () => settings.isMermaidEnabled() }),
        MutationObserver: missingMutationObserver, IntersectionObserver: missingIntersectionObserver, ...(tinyCache ? { renderCacheMaxBytes: 1 } : {}) });
      try {
        await controller.start();
        expect(document.querySelector("img.annotation-markdown-svg-image")).toBeNull();
        settings.setMermaidEnabled(true); requireValue(controller.refresh).call(controller);
        expect(document.querySelectorAll("img.annotation-markdown-svg-image")).toHaveLength(1);
        expect(document.querySelector("[data-annotation-markdown-svg-badge='sidebar']")?.textContent ?? null).toBe(popup ? null : "MERMAID");
        queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).click();
        expect(requireValue(queryElement(document, "[data-annotation-markdown-svg-viewer] iframe", HTMLIFrameElement).contentDocument).querySelector("img")).not.toBeNull();
        settings.setMermaidEnabled(false); requireValue(controller.refresh).call(controller);
        expect(document.querySelector(".annotation-markdown-svg-image, [data-annotation-markdown-svg-viewer]")).toBeNull();
        expect(document.querySelector("[data-annotation-markdown-svg-badge='sidebar']")).toBeNull();
        expect(queryElement(document, "code", HTMLElement).textContent).toBe(`${flow}\n`);
        settings.setMermaidEnabled(true); controller.renderNow();
        expect(document.querySelector(".annotation-markdown-svg-image")).not.toBeNull();
        controller.renderNow(); expect(document.querySelectorAll(".annotation-markdown-rendered")).toHaveLength(1);
        queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).dispatchEvent(new Event("error"));
        expect(queryElement(document, ".annotation-markdown-svg-fallback", HTMLElement).hidden).toBe(false);
        expect(adapter.getSourceText(document.querySelector(".comment"))).toBe(source);
        // Clicking non-control preview space enters source editing, as SVG does.
        queryElement(document, ".annotation-markdown-rendered").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
        expect(queryElement(document, "textarea", HTMLTextAreaElement).value).toBe(source);
        expect(queryElement(document, ".annotation-markdown-rendered", HTMLElement).hidden).toBe(true);
        expect(adapter.closeActiveFastEditor()).toBe(true);
      } finally { controller.stop(); }
      expect(document.querySelector(".annotation-markdown-rendered, [data-annotation-markdown-svg-viewer]")).toBeNull();
      expect(queryElement(document, ".content").textContent).toBe(source);
    }
  );
});
